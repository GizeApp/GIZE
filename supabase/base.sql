-- Base de GIZE: políticas RLS, funciones y triggers de las tablas principales.
--
-- Qué es este archivo: una copia versionada de lo que está en Supabase, sacada del SQL
-- Editor (pg_policies, pg_get_functiondef, pg_trigger) en septiembre 2026, con los
-- cambios de endurecer-base.sql ya incluidos. Sirve para revisar la seguridad desde el
-- repo y para rearmar la base si hiciera falta. NO hace falta correrlo: la base ya está así.
--
-- OJO: NO volver a correr suelto. Redefine is_my_client, join_coach, my_invite_code,
-- delete_own_account y la política «cliente sube sus fotos» con sus versiones viejas, y
-- archivos posteriores las endurecieron (plan y cupo del coach, cuenta con suscripción de
-- Mercado Pago, carpeta de las fotos). Vale la última que se corre. Si lo corrés, corré
-- después, en este orden: endurecer-base.sql, suscripciones.sql, cupo-plan.sql,
-- coach-alumnos.sql, pagos-seguros.sql, seguridad-base.sql y ejercicio-audio.sql.
--
-- Qué NO tiene:
--   · Los CREATE TABLE (columnas, tipos, claves foráneas): no se exportaron. Para tenerlos,
--     sacar un dump con la CLI: npx supabase db dump --db-url "<URI>" -f supabase/schema.sql
--   · Lo que ya está en los otros archivos de supabase/: push_subscriptions, coach_messages
--     y client_push_devices (notificaciones.sql), coach_questions (preguntas-coach.sql),
--     el bucket avatars y set_my_avatar (foto-perfil.sql), coach_client_stats
--     (estadisticas-coach.sql), validación de dispositivos push y de la ruta de la foto
--     de perfil (validaciones.sql), plan de los coaches y límite de clientes (suscripciones.sql,
--     que además redefine is_my_client y join_coach).
--   · Validación de la forma de las rutinas y funciones solo para usuarios logueados
--     (seguridad-base.sql).
--
-- Si cambiás algo en Supabase, actualizalo también acá.
--
-- Modelo de permisos, en corto:
--   · Cada cliente escribe solo lo suyo (client_id = auth.uid()).
--   · Su coach lo lee todo (is_my_client) y edita ficha, bloque, plan de nutrición y rutina.
--   · Con coach asignado, la rutina es SOLO del coach (el cliente no la puede escribir).
--   · role, invite_code y coach_id no se pueden cambiar con un UPDATE directo (trigger
--     profiles_a_guard); vincularse a un coach pasa por join_coach().


-- ===== Funciones =====

-- ¿target es cliente mío? La usan casi todas las políticas del lado del coach.
create or replace function public.is_my_client(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = target and coach_id = auth.uid()
  );
$$;

-- Perfil nuevo al registrarse. El rol sale de lo que eligió en la pantalla de registro;
-- cualquier cosa que no sea 'coach' queda como 'client'.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name',''),
    case when new.raw_user_meta_data->>'role' = 'coach' then 'coach' else 'client' end
  );
  return new;
end $$;

-- Lo que la app NO puede cambiar con un UPDATE directo a profiles. Las funciones
-- SECURITY DEFINER (join_coach, my_invite_code) corren como el dueño y no pasan por acá.
-- coach_id sí se puede poner en null: es "desvincularme de mi coach" (Ajustes).
create or replace function public.profiles_guard_sensitive()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated','anon') then
    if new.role is distinct from old.role then
      raise exception 'El rol no se puede cambiar desde la app' using errcode='42501'; end if;
    if new.invite_code is distinct from old.invite_code then
      raise exception 'El código de invitación no se puede cambiar' using errcode='42501'; end if;
    if new.coach_id is distinct from old.coach_id and new.coach_id is not null then
      raise exception 'Para vincularte a un coach usá su código' using errcode='42501'; end if;
  end if;
  return new;
end $$;

-- Vincularse a un coach con su código.
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

-- Código de invitación del coach (se genera la primera vez). Ver endurecer-base.sql.
create or replace function public.my_invite_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  c text;
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  b bytea;
  i int;
begin
  if auth.uid() is null then return null; end if;
  if not exists (select 1 from profiles where id = auth.uid() and role = 'coach') then return null; end if;
  select invite_code into c from profiles where id = auth.uid();
  if c is not null then return c; end if;
  loop
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

-- Nombre del coach del cliente (el cliente no puede leer el perfil del coach por RLS).
create or replace function public.my_coach_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select c.full_name
    from public.profiles p
    join public.profiles c on c.id = p.coach_id
   where p.id = auth.uid();
$$;

-- Eliminar la cuenta propia: borra auth.users y en cascada lo que depende de él.
-- Los ARCHIVOS de Storage no se pueden borrar por SQL (trigger protect_objects_delete):
-- la app los borra antes de llamar a esta función (deleteMyStorageFiles en app/core/supabase.js).
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then raise exception 'Necesitás iniciar sesión' using errcode='28000'; end if;
  delete from auth.users where id = auth.uid();
end $$;

revoke execute on function public.join_coach(text)      from public, anon;
revoke execute on function public.my_invite_code()      from public, anon;
revoke execute on function public.my_coach_name()       from public, anon;
revoke execute on function public.delete_own_account()  from public, anon;
grant  execute on function public.join_coach(text)      to authenticated;
grant  execute on function public.my_invite_code()      to authenticated;
grant  execute on function public.my_coach_name()       to authenticated;
grant  execute on function public.delete_own_account()  to authenticated;


-- ===== Triggers =====

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists profiles_a_guard on public.profiles;
create trigger profiles_a_guard before update on public.profiles
  for each row execute function public.profiles_guard_sensitive();


-- ===== profiles =====
-- Sin política INSERT (el perfil lo crea handle_new_user) ni DELETE (se borra en cascada
-- con auth.users). coach_id → ON DELETE SET NULL (ver endurecer-base.sql).
alter table public.profiles enable row level security;
create unique index if not exists profiles_invite_code_uniq
  on public.profiles(invite_code) where invite_code is not null;

drop policy if exists "ver mi perfil" on public.profiles;
create policy "ver mi perfil" on public.profiles
  for select using (id = auth.uid());
drop policy if exists "coach ve sus clientes" on public.profiles;
create policy "coach ve sus clientes" on public.profiles
  for select using (coach_id = auth.uid());
drop policy if exists "editar mi perfil" on public.profiles;
create policy "editar mi perfil" on public.profiles
  for update using (id = auth.uid());


-- ===== Datos que carga el cliente (el coach solo los lee) =====

alter table public.body_weights enable row level security;
drop policy if exists "cliente gestiona su peso" on public.body_weights;
create policy "cliente gestiona su peso" on public.body_weights
  for all using (client_id = auth.uid()) with check (client_id = auth.uid());
drop policy if exists "peso: cliente y su coach" on public.body_weights;
create policy "peso: cliente y su coach" on public.body_weights
  for select using ((client_id = auth.uid()) or is_my_client(client_id));

alter table public.checkins enable row level security;
drop policy if exists "cliente gestiona su checkin" on public.checkins;
create policy "cliente gestiona su checkin" on public.checkins
  for all using (client_id = auth.uid()) with check (client_id = auth.uid());
drop policy if exists "checkin: cliente y su coach" on public.checkins;
create policy "checkin: cliente y su coach" on public.checkins
  for select using ((client_id = auth.uid()) or is_my_client(client_id));

alter table public.client_prefs enable row level security;
drop policy if exists "prefs: cliente gestiona las suyas" on public.client_prefs;
create policy "prefs: cliente gestiona las suyas" on public.client_prefs
  for all using (client_id = auth.uid()) with check (client_id = auth.uid());
drop policy if exists "prefs: cliente y su coach" on public.client_prefs;
create policy "prefs: cliente y su coach" on public.client_prefs
  for select using ((client_id = auth.uid()) or is_my_client(client_id));

alter table public.daily_logs enable row level security;
drop policy if exists "cliente gestiona su diario" on public.daily_logs;
create policy "cliente gestiona su diario" on public.daily_logs
  for all using (client_id = auth.uid()) with check (client_id = auth.uid());
drop policy if exists "diario: cliente y su coach" on public.daily_logs;
create policy "diario: cliente y su coach" on public.daily_logs
  for select using ((client_id = auth.uid()) or is_my_client(client_id));

alter table public.food_entries enable row level security;
drop policy if exists "comidas: cliente gestiona las suyas" on public.food_entries;
create policy "comidas: cliente gestiona las suyas" on public.food_entries
  for all using (client_id = auth.uid()) with check (client_id = auth.uid());
drop policy if exists "comidas: cliente y su coach" on public.food_entries;
create policy "comidas: cliente y su coach" on public.food_entries
  for select using ((client_id = auth.uid()) or is_my_client(client_id));

-- Sesiones: el cliente las crea, les pone feedback (UPDATE) y las borra.
alter table public.sessions enable row level security;
drop policy if exists "cliente crea sesion" on public.sessions;
create policy "cliente crea sesion" on public.sessions
  for insert with check (client_id = auth.uid());
drop policy if exists "cliente actualiza su sesion" on public.sessions;
create policy "cliente actualiza su sesion" on public.sessions
  for update using (client_id = auth.uid()) with check (client_id = auth.uid());
drop policy if exists "cliente borra su sesion" on public.sessions;
create policy "cliente borra su sesion" on public.sessions
  for delete using (client_id = auth.uid());
drop policy if exists "sesiones: cliente y su coach" on public.sessions;
create policy "sesiones: cliente y su coach" on public.sessions
  for select using ((client_id = auth.uid()) or is_my_client(client_id));

-- Series: sin UPDATE (la app las sube con ON CONFLICT DO NOTHING y no las edita).
alter table public.session_entries enable row level security;
drop policy if exists "cliente crea series" on public.session_entries;
create policy "cliente crea series" on public.session_entries
  for insert with check (client_id = auth.uid());
drop policy if exists "cliente borra series" on public.session_entries;
create policy "cliente borra series" on public.session_entries
  for delete using (client_id = auth.uid());
drop policy if exists "series: cliente y su coach" on public.session_entries;
create policy "series: cliente y su coach" on public.session_entries
  for select using ((client_id = auth.uid()) or is_my_client(client_id));

-- Fotos de progreso: la tabla checkin_photos ya no existe (se borraron todas, ver
-- borrar-fotos-progreso.sql).


-- ===== Lo que carga el coach (el cliente solo lo lee) =====

alter table public.client_info enable row level security;
drop policy if exists "ficha: el coach la edita" on public.client_info;
create policy "ficha: el coach la edita" on public.client_info
  for all using (is_my_client(client_id)) with check (is_my_client(client_id));
drop policy if exists "ficha: cliente y su coach" on public.client_info;
create policy "ficha: cliente y su coach" on public.client_info
  for select using ((client_id = auth.uid()) or is_my_client(client_id));

alter table public.blocks enable row level security;
drop policy if exists "bloques: el coach los edita" on public.blocks;
create policy "bloques: el coach los edita" on public.blocks
  for all using (is_my_client(client_id)) with check (is_my_client(client_id));
drop policy if exists "bloques: cliente y su coach" on public.blocks;
create policy "bloques: cliente y su coach" on public.blocks
  for select using ((client_id = auth.uid()) or is_my_client(client_id));

-- Nutrición: sin DELETE (la app no borra planes, los reemplaza).
alter table public.nutrition enable row level security;
drop policy if exists "nutri: coach inserta" on public.nutrition;
create policy "nutri: coach inserta" on public.nutrition
  for insert with check (is_my_client(client_id));
drop policy if exists "nutri: coach actualiza" on public.nutrition;
create policy "nutri: coach actualiza" on public.nutrition
  for update using (is_my_client(client_id)) with check (is_my_client(client_id));
drop policy if exists "nutri: cliente ve, coach edita (select)" on public.nutrition;
create policy "nutri: cliente ve, coach edita (select)" on public.nutrition
  for select using ((client_id = auth.uid()) or is_my_client(client_id));

-- routines.updated_by y nutrition.updated_by → profiles(id) ON DELETE SET NULL (ver
-- endurecer-base.sql): si no, un coach que editó la rutina/plan de un cliente no podía
-- eliminar su cuenta.

-- Rutina: sin coach la maneja el cliente; con coach, solo el coach.
alter table public.routines enable row level security;
drop policy if exists "coach gestiona rutina del cliente" on public.routines;
create policy "coach gestiona rutina del cliente" on public.routines
  for all using (is_my_client(client_id)) with check (is_my_client(client_id));
drop policy if exists "cliente inserta su rutina" on public.routines;
create policy "cliente inserta su rutina" on public.routines
  for insert with check ((client_id = auth.uid()) and not exists (
    select 1 from profiles p where p.id = auth.uid() and p.coach_id is not null));
drop policy if exists "cliente actualiza su rutina" on public.routines;
create policy "cliente actualiza su rutina" on public.routines
  for update
  using ((client_id = auth.uid()) and not exists (
    select 1 from profiles p where p.id = auth.uid() and p.coach_id is not null))
  with check ((client_id = auth.uid()) and not exists (
    select 1 from profiles p where p.id = auth.uid() and p.coach_id is not null));
drop policy if exists "cliente ve su rutina" on public.routines;
create policy "cliente ve su rutina" on public.routines
  for select using ((client_id = auth.uid()) or is_my_client(client_id));

-- Biblioteca de rutinas del coach.
alter table public.routine_templates enable row level security;
drop policy if exists "plantillas: el coach gestiona las suyas" on public.routine_templates;
create policy "plantillas: el coach gestiona las suyas" on public.routine_templates
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());


-- ===== Storage: bucket "checkins" (las fotos de progreso de antes) =====
-- Vacío, privado y sin políticas: nadie sube, ve ni borra (ver borrar-fotos-progreso.sql).
-- El bucket no se elimina: las versiones viejas de la app lo listan al eliminar la cuenta.
drop policy if exists "storage: cliente sube en su carpeta" on storage.objects;
drop policy if exists "storage: cliente borra en su carpeta" on storage.objects;
drop policy if exists "storage: cliente ve su carpeta" on storage.objects;

notify pgrst, 'reload schema';
