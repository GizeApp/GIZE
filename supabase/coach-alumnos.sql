-- El coach maneja sus alumnos: desvincular a uno y cambiar su código de invitación. Y el alumno
-- se vincula con ese código (join_coach).
-- Correr con el workflow "Supabase" → tarea sql → supabase/coach-alumnos.sql, después de
-- suscripciones.sql y cupo-plan.sql. Se puede correr varias veces.
-- Tiene la versión vigente de join_coach: si se vuelve a correr suscripciones.sql,
-- endurecer-base.sql o base.sql (que traen versiones viejas), correr después este.
-- Al final devuelve una fila por coach que todavía tiene un código viejo (vacío = ninguno).
-- Los mensajes de join_coach no mandan a renovar ni a ampliar el plan: los ven también las apps
-- de Android e iPhone, y Google y Apple no dejan mandar a pagar por fuera de sus tiendas.
--
--   coach_remove_client(client uuid): el coach desvincula a un alumno suyo. El alumno no
--     pierde nada: conserva su rutina, entrenos y registros, y queda sin coach (puede
--     manejar su rutina él mismo o vincularse a otro coach con un código).
--   rotate_invite_code(): le da al coach un código nuevo y el viejo deja de servir. Los
--     alumnos ya vinculados siguen vinculados.
--   join_coach(code): el alumno se vincula con el código, si el coach tiene el plan al día y
--     lugar en su cupo. Con tope de códigos equivocados: 10 por hora y 20 por día por persona.
--
-- Los códigos de antes de endurecer-base.sql son de 6 caracteres (~16 millones de
-- combinaciones; los de ahora, 8 de 31 letras y números). Sin tope, una cuenta podía probarlos
-- todos con un programa en unas horas y quedar vinculada al coach de otro (o llenarle el cupo).
-- Con el tope, a una cuenta le llevaría siglos. Los viejos NO se invalidan: los coaches ya los
-- repartieron y sus alumnos tienen que poder vincularse. La app le sugiere a cada coach con
-- código viejo que lo cambie (Cambiar código, screens/coach/index.js); cuando el chequeo del
-- final dé vacío no queda ninguno.
--
-- Las funciones de coach son SECURITY DEFINER porque profiles_guard_sensitive (base.sql) no deja
-- cambiar invite_code ni el coach_id de otro perfil con un UPDATE desde la app.

create or replace function public.coach_remove_client(client uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or client is null then return false; end if;
  update profiles set coach_id = null where id = client and coach_id = auth.uid();
  return found;
end $$;

create or replace function public.rotate_invite_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  c text;
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- mismo formato que my_invite_code
  b bytea;
  i int;
begin
  if auth.uid() is null then return null; end if;
  if not exists (select 1 from profiles where id = auth.uid() and role = 'coach') then return null; end if;
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

-- Códigos equivocados al vincularse: solo quién y cuándo, para el tope. Se borran al día.
create table if not exists public.join_code_attempts (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists join_code_attempts_user_idx on public.join_code_attempts (user_id, created_at);
alter table public.join_code_attempts enable row level security;
revoke all on public.join_code_attempts from anon, authenticated;

-- Vincularse a un coach con su código. Los errores salen con un mensaje que la app le muestra al
-- alumno tal cual (P0001).
create or replace function public.join_coach(code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare cid uuid; lim int; n int; me uuid := auth.uid();
begin
  if me is null then return false; end if;
  -- Un coach no se vincula a otro coach: el otro vería y editaría su rutina.
  if exists (select 1 from profiles where id = me and role = 'coach') then return false; end if;
  -- De a un intento por persona: varios a la vez no se saltean el tope.
  perform pg_advisory_xact_lock(hashtext('join_coach'), hashtext(me::text));
  delete from join_code_attempts where user_id = me and created_at < now() - interval '1 day';
  if (select count(*) from join_code_attempts where user_id = me) >= 20
     or (select count(*) from join_code_attempts where user_id = me and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Probaste muchos códigos que no existen. Revisalo con tu coach y volvé a intentar en un rato.' using errcode = 'P0001';
  end if;
  select id into cid from profiles where invite_code = upper(trim(code)) and role = 'coach';
  if cid is null then
    -- Queda anotado: sale con return, no con raise (que desharía el insert).
    insert into join_code_attempts (user_id) values (me);
    return false;
  end if;
  if cid = me then return false; end if;
  if exists (select 1 from profiles where id = me and coach_id = cid) then return true; end if;
  if not public.coach_active(cid) then
    raise exception 'Tu coach tiene el plan de GIZE vencido: por ahora no puede sumar alumnos. Avisale y volvé a intentar.' using errcode = 'P0001';
  end if;
  -- Bloquea la fila del coach: dos clientes a la vez no pasan el cupo.
  select max_clients into lim from coach_billing where coach_id = cid for update;
  select count(*) into n from profiles where coach_id = cid;
  if n >= coalesce(lim, 10) then
    raise exception 'Tu coach llegó al máximo de alumnos: por ahora no puede sumar más. Avisale y volvé a intentar.' using errcode = 'P0001';
  end if;
  update profiles set coach_id = cid where id = me;
  return true;
end $$;

revoke execute on function public.coach_remove_client(uuid) from public, anon;
revoke execute on function public.rotate_invite_code()      from public, anon;
revoke execute on function public.join_coach(text)          from public, anon;
grant  execute on function public.coach_remove_client(uuid) to authenticated;
grant  execute on function public.rotate_invite_code()      to authenticated;
grant  execute on function public.join_coach(text)          to authenticated;

notify pgrst, 'reload schema';

-- Chequeo final (solo cuántos: el log del workflow es público): una fila por coach con el código
-- viejo de 6 caracteres. Sigue sirviendo; la app le sugiere cambiarlo.
select 'Coach con código viejo' as revisar
  from public.profiles
 where role = 'coach' and invite_code is not null and char_length(invite_code) < 8;
