-- Avisos al coach por notificación (celular o compu): cuando un alumno manda su check-in
-- semanal y cuando lleva 4 días sin entrenar.
-- Correr con el workflow "Supabase" → tarea sql → supabase/avisos-coach.sql. Se puede
-- volver a correr. Necesita pg_cron y pg_net (vienen en Supabase) y la función
-- supabase/functions/avisos-coach publicada (tarea "funciones").
--
--   · Check-in: al guardarse un check-in NUEVO (no al editarlo) se anota un aviso.
--   · Sin entrenar: todos los días a las 9 (Argentina) se anota un aviso por cada alumno
--     que lleva entre 4 y 10 días sin entrenar. Uno solo por racha: la clave es la fecha
--     del último entreno, así que vuelve a avisar recién si entrena y después deja otra vez.
--     Más de 10 días no avisa: son alumnos que ya dejaron hace rato, no una alerta nueva.
--   · Cada minuto, si hay avisos sin mandar, pg_cron llama a la función avisos-coach, que
--     los toma y los manda a los dispositivos del coach (si es coach al día con su plan).

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create table if not exists public.coach_alerts (
  id         bigserial primary key,
  coach_id   uuid not null references public.profiles(id) on delete cascade,
  client_id  uuid not null references public.profiles(id) on delete cascade,
  kind       text not null check (kind in ('checkin', 'inactivo')),
  key        text not null,          -- semana del check-in / fecha del último entreno
  days       int,                    -- días sin entrenar (solo 'inactivo')
  created_at timestamptz not null default now(),
  sent_at    timestamptz,
  unique (client_id, kind, key)
);
alter table public.coach_alerts enable row level security;
-- Sin políticas: solo la usan el trigger, la tarea diaria y la función (service role).
create index if not exists coach_alerts_pending_idx on public.coach_alerts (created_at) where sent_at is null;

-- 1) Check-in nuevo → aviso.
create or replace function public.coach_alert_on_checkin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare cid uuid;
begin
  select coach_id into cid from profiles where id = new.client_id;
  if cid is not null then
    insert into coach_alerts (coach_id, client_id, kind, key)
    values (cid, new.client_id, 'checkin', new.week_start::text)
    on conflict (client_id, kind, key) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists checkins_coach_alert on public.checkins;
create trigger checkins_coach_alert after insert on public.checkins
  for each row execute function public.coach_alert_on_checkin();

-- 2) Alumnos que llevan 4 a 10 días sin entrenar (con al menos un entreno registrado).
create or replace function public.queue_inactivity_alerts()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  insert into coach_alerts (coach_id, client_id, kind, key, days)
  select p.coach_id, p.id, 'inactivo', s.last::text,
         ((now() at time zone 'America/Argentina/Buenos_Aires')::date - s.last)
    from profiles p
    join (select client_id, max(performed_on) as last from sessions group by client_id) s on s.client_id = p.id
   where p.coach_id is not null
     and ((now() at time zone 'America/Argentina/Buenos_Aires')::date - s.last) between 4 and 10
  on conflict (client_id, kind, key) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.coach_alert_on_checkin()  from public, anon, authenticated;
revoke execute on function public.queue_inactivity_alerts() from public, anon, authenticated;

-- 3) Tareas programadas.
select cron.unschedule('gize-avisos-inactividad') where exists (select 1 from cron.job where jobname = 'gize-avisos-inactividad');
select cron.schedule('gize-avisos-inactividad', '0 12 * * *', $job$ select public.queue_inactivity_alerts(); $job$);

-- Secreto compartido con la Edge Function (guardia contra llamadas de afuera). Sale de Vault
-- (Supabase → Project Settings → Vault → New secret, nombre 'cron_secret'). Si Vault no está o
-- el secreto no existe, devuelve '' y el cron sigue andando igual (la función solo bloquea
-- cuando ELLA tiene puesto CRON_SECRET). Para activar la guardia: crear el secreto de Vault,
-- re-correr este archivo, y recién después poner CRON_SECRET en los Secrets de la función.
create or replace function public.cron_secret()
returns text language plpgsql security definer set search_path = '' as $$
declare s text;
begin
  begin
    select decrypted_secret into s from vault.decrypted_secrets where name = 'cron_secret';
  exception when others then s := null;  -- Vault no instalado / sin permiso: no rompe el cron
  end;
  return coalesce(s, '');
end $$;
revoke execute on function public.cron_secret() from public, anon, authenticated;

-- Cada minuto: solo llama a la función si hay algo para mandar (no gasta invocaciones).
select cron.unschedule('gize-avisos-coach') where exists (select 1 from cron.job where jobname = 'gize-avisos-coach');
select cron.schedule('gize-avisos-coach', '* * * * *', $job$
  select net.http_post(
    url := 'https://wegptuzhsrwppbknqstf.supabase.co/functions/v1/avisos-coach',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.cron_secret()),
    body := '{}'::jsonb
  )
  where exists (select 1 from public.coach_alerts where sent_at is null);
$job$);

notify pgrst, 'reload schema';
