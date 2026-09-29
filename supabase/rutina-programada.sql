-- Rutina programada: el coach deja lista una rutina nueva para que empiece sola en una fecha
-- (ej.: 4 semanas de un bloque y desde el lunes 27 otra rutina), sin cambiársela al alumno en
-- el momento. Correr con el workflow "Supabase" → tarea sql → supabase/rutina-programada.sql.
--
-- La rutina vigente sigue en public.routines. Cuando llega la fecha, apply_due_routines() la
-- reemplaza por la programada (la llama la app del alumno al entrar y el panel del coach al
-- abrir la ficha) y marca la programada como aplicada.
create table if not exists public.routine_schedule (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.profiles(id) on delete cascade,
  starts_on   date not null,
  name        text check (name is null or char_length(name) <= 80),
  days        jsonb not null default '[]'::jsonb,
  created_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  applied_at  timestamptz
);
create index if not exists routine_schedule_client_idx on public.routine_schedule (client_id, starts_on);
-- Una sola rutina pendiente por alumno y fecha.
create unique index if not exists routine_schedule_one_per_day on public.routine_schedule (client_id, starts_on) where applied_at is null;

drop trigger if exists routine_schedule_validate on public.routine_schedule;
create trigger routine_schedule_validate before insert or update of days on public.routine_schedule
  for each row execute function public.routines_validate();

alter table public.routine_schedule enable row level security;
drop policy if exists "coach programa rutinas" on public.routine_schedule;
create policy "coach programa rutinas" on public.routine_schedule
  for all using (is_my_client(client_id)) with check (is_my_client(client_id) and applied_at is null);
drop policy if exists "cliente ve sus rutinas programadas" on public.routine_schedule;
create policy "cliente ve sus rutinas programadas" on public.routine_schedule
  for select using (client_id = auth.uid());
revoke all on public.routine_schedule from anon;

-- Aplica la programada que ya empezó (la más reciente con fecha hasta hoy, hora de Argentina).
-- La puede llamar el propio alumno o su coach. Devuelve true si cambió la rutina.
-- Solo cuenta la que programó el coach actual del alumno: la de un coach anterior no pisa la
-- rutina que el alumno (o su coach nuevo) armó después.
create or replace function public.apply_due_routines(p_client uuid default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  cid uuid := coalesce(p_client, auth.uid());
  hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  coach uuid;
  s record;
begin
  if cid is null or not (cid = auth.uid() or public.is_my_client(cid)) then return false; end if;
  select coach_id into coach from public.profiles where id = cid;
  if coach is null then return false; end if;
  select * into s from public.routine_schedule
   where client_id = cid and applied_at is null and starts_on <= hoy and created_by = coach
   order by starts_on desc, created_at desc limit 1;
  if not found then return false; end if;
  insert into public.routines (client_id, days, updated_at, updated_by)
  values (cid, s.days, now(), s.created_by)
  on conflict (client_id) do update set days = excluded.days, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  update public.routine_schedule set applied_at = now()
   where client_id = cid and applied_at is null and starts_on <= hoy and created_by = coach;
  return true;
end $$;
revoke execute on function public.apply_due_routines(uuid) from public, anon;
grant execute on function public.apply_due_routines(uuid) to authenticated;

-- Al cambiar el coach del alumno (se desvincula en Ajustes, el coach lo saca, el admin lo
-- desvincula o le cambia el rol, el coach borra su cuenta, o se pasa a otro coach) se borran
-- las programadas pendientes: eran del coach anterior. Las ya aplicadas quedan.
create or replace function public.routine_schedule_on_coach_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.coach_id is distinct from old.coach_id then
    delete from public.routine_schedule where client_id = new.id and applied_at is null;
  end if;
  return new;
end $$;
revoke execute on function public.routine_schedule_on_coach_change() from public, anon, authenticated;
drop trigger if exists profiles_routine_schedule_cleanup on public.profiles;
create trigger profiles_routine_schedule_cleanup after update of coach_id on public.profiles
  for each row execute function public.routine_schedule_on_coach_change();

-- Limpieza de las que ya quedaron colgadas de un coach anterior (o de uno que borró su
-- cuenta). Las del coach actual no se tocan: solo él las puede cargar (is_my_client).
delete from public.routine_schedule s
 where s.applied_at is null
   and (s.created_by is null
        or s.created_by is distinct from (select p.coach_id from public.profiles p where p.id = s.client_id));

select 'routine_schedule' as tabla, count(*) as filas from public.routine_schedule;
