-- Endurecimiento de la base (auditoría de septiembre 2026).
-- Correr UNA vez en Supabase → SQL Editor.
-- OJO: NO volver a correr suelto. Redefine join_coach, y la versión vigente (que además mira
-- el plan y el cupo del coach) está en suscripciones.sql. Si lo corrés, corré después
-- suscripciones.sql y cupo-plan.sql.
-- Todo el script corre como una sola transacción: si algo falla, no se aplica nada.
--
-- Qué hace:
--   1) join_coach: un coach no se puede vincular a otro coach (ni a sí mismo).
--   2) my_invite_code: solo genera código para coaches; los nuevos son de 8 caracteres
--      con azar seguro y nunca repiten uno existente. Los códigos ya repartidos NO cambian.
--   3) Código de invitación único (índice), para que un código no apunte a dos coaches.
--   4) search_path fijo en las funciones SECURITY DEFINER que no lo tenían.
--   5) Las funciones de cuenta solo las puede llamar un usuario logueado.
--   6) Se borra la política "crear mi perfil": el perfil lo crea el trigger al registrarse,
--      y un INSERT directo no pasa por el guard (que solo mira los UPDATE).
--   7) Si un coach borra su cuenta, sus clientes quedan sin coach en vez de trabar el borrado
--      (o, peor, de borrarse con él). Lo mismo con updated_by de rutinas y nutrición.
--   8) Límites de tamaño y tipo de archivo en los buckets de fotos.
-- Al final devuelve lo que haya que revisar a mano (si no devuelve filas, está todo bien).


-- 1) Vincularse a un coach con su código.
create or replace function public.join_coach(code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare cid uuid;
begin
  if auth.uid() is null then return false; end if;
  -- Un coach no se vincula a otro coach: el otro vería y editaría su rutina.
  if exists (select 1 from profiles where id = auth.uid() and role = 'coach') then return false; end if;
  select id into cid from profiles where invite_code = upper(trim(code)) and role = 'coach';
  if cid is null or cid = auth.uid() then return false; end if;
  update profiles set coach_id = cid where id = auth.uid();
  return true;
end $$;


-- 2) Código de invitación del coach (se genera la primera vez que lo pide).
--    8 caracteres de un alfabeto sin los que se confunden (0/O, 1/I/L): ~1 billón de
--    combinaciones, contra ~16 millones del formato viejo de 6. El azar sale de
--    gen_random_uuid() (seguro); random() no lo es.
create or replace function public.my_invite_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  c text;
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- 31 caracteres
  b bytea;
  i int;
begin
  if auth.uid() is null then return null; end if;
  -- Solo los coaches tienen código (join_coach igual rechaza el de un cliente).
  if not exists (select 1 from profiles where id = auth.uid() and role = 'coach') then return null; end if;
  select invite_code into c from profiles where id = auth.uid();
  if c is not null then return c; end if;
  loop
    -- Bytes 0-5 y 10-15 del uuid son azar puro (6-9 llevan bits fijos de versión).
    b := substring(uuid_send(gen_random_uuid()) from 1 for 6) || substring(uuid_send(gen_random_uuid()) from 11 for 6);
    c := '';
    for i in 0..7 loop
      c := c || substr(alphabet, 1 + (get_byte(b, i) % length(alphabet)), 1);
    end loop;
    exit when not exists (select 1 from profiles where invite_code = c);
  end loop;
  update profiles set invite_code = c where id = auth.uid();
  return c;
end $$;


-- 3) Código único. Si ya hay dos coaches con el mismo código no se crea el índice
--    (cambiarles el código rompería los que ya lo repartieron): aparece en el chequeo
--    del final para resolverlo a mano.
do $$
begin
  if not exists (select 1 from public.profiles where invite_code is not null
                 group by invite_code having count(*) > 1) then
    create unique index if not exists profiles_invite_code_uniq
      on public.profiles(invite_code) where invite_code is not null;
  end if;
end $$;


-- 4) search_path fijo: una función SECURITY DEFINER sin él resuelve los nombres con el
--    search_path de quien la llama (el linter de Supabase lo marca).
alter function public.is_my_client(uuid) set search_path = public;
alter function public.my_coach_name()    set search_path = public;
alter function public.delete_own_account() set search_path = public, auth;


-- 5) Funciones de cuenta: solo usuarios logueados (anon las podía llamar; no hacían nada
--    sin sesión, pero no tienen por qué estar expuestas).
--    is_my_client NO se toca: la usan las políticas y un anon sin permiso daría error.
revoke execute on function public.join_coach(text)      from public, anon;
revoke execute on function public.my_invite_code()      from public, anon;
revoke execute on function public.my_coach_name()       from public, anon;
revoke execute on function public.delete_own_account()  from public, anon;
grant  execute on function public.join_coach(text)      to authenticated;
grant  execute on function public.my_invite_code()      to authenticated;
grant  execute on function public.my_coach_name()       to authenticated;
grant  execute on function public.delete_own_account()  to authenticated;


-- 6) El perfil lo crea handle_new_user() al registrarse (SECURITY DEFINER, no necesita
--    esta política). Con ella, alguien sin perfil podía insertarse uno con cualquier
--    role/coach_id: el guard profiles_guard_sensitive solo corre en UPDATE.
drop policy if exists "crear mi perfil" on public.profiles;


-- 7) profiles.coach_id → ON DELETE SET NULL.
--    Primero se limpian los coach_id que apuntan a perfiles que ya no existen (si no hay
--    FK, un coach borrado deja a sus clientes con la rutina bloqueada para siempre).
update public.profiles p set coach_id = null
where coach_id is not null and not exists (select 1 from public.profiles c where c.id = p.coach_id);

do $$
declare r record; found_fk boolean := false;
begin
  for r in
    select c.conname, c.confrelid::regclass as ref, c.confdeltype
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.conrelid = 'public.profiles'::regclass
      and a.attname = 'coach_id' and array_length(c.conkey, 1) = 1
  loop
    found_fk := true;
    if r.confdeltype <> 'n' then
      execute format('alter table public.profiles drop constraint %I', r.conname);
      execute format('alter table public.profiles add constraint %I foreign key (coach_id) references %s(id) on delete set null', r.conname, r.ref);
    end if;
  end loop;
  if not found_fk then
    alter table public.profiles add constraint profiles_coach_id_fkey
      foreign key (coach_id) references public.profiles(id) on delete set null;
  end if;
end $$;


-- 7b) updated_by ("quién editó por última vez": la app lo escribe, nunca lo lee) → ON DELETE
--     SET NULL. Sin esto, un coach que había guardado la rutina o el plan de nutrición de un
--     cliente no podía eliminar su cuenta (la FK lo impedía). Así, la rutina y el plan del
--     cliente quedan y solo se pierde quién los tocó por última vez.
do $$
declare r record;
begin
  for r in
    select c.conrelid::regclass as tbl, c.conname, c.confrelid::regclass as ref, a.attname, a.attnotnull
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.connamespace = 'public'::regnamespace
      and array_length(c.conkey, 1) = 1 and a.attname = 'updated_by'
      and c.confdeltype not in ('c', 'n', 'd')
  loop
    if r.attnotnull then
      execute format('alter table %s alter column %I drop not null', r.tbl, r.attname);
    end if;
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format('alter table %s add constraint %I foreign key (%I) references %s(id) on delete set null',
                   r.tbl, r.conname, r.attname, r.ref);
  end loop;
end $$;


-- 8) Buckets. El avatar siempre se sube como JPEG de 320×320 (~50 KB, ver app/core/avatar.js).
--    Las fotos de check-in se suben tal cual salen del celular: margen amplio.
update storage.buckets
   set file_size_limit = 2097152,                                   -- 2 MB
       allowed_mime_types = array['image/jpeg']
 where id = 'avatars';

update storage.buckets
   set file_size_limit = 15728640,                                  -- 15 MB
       allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif']
 where id = 'checkins';


notify pgrst, 'reload schema';


-- Chequeo final: si devuelve filas, hay algo para revisar.
--  · "FK que traba borrados": una clave foránea sin ON DELETE CASCADE / SET NULL. Si apunta
--    a auth.users o a profiles, eliminar esa cuenta va a fallar.
--  · "Código repetido": dos coaches con el mismo código (el índice único no se creó).
select 'FK que traba borrados' as chequeo,
       conrelid::regclass || '.' || conname || ' → ' || pg_get_constraintdef(oid) as detalle
  from pg_constraint
 where contype = 'f' and connamespace = 'public'::regnamespace
   and confdeltype not in ('c', 'n', 'd')
union all
select 'Código repetido', invite_code || ' (' || count(*) || ' coaches)'
  from public.profiles
 where invite_code is not null
 group by invite_code having count(*) > 1;
