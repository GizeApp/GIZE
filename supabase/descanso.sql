-- Aviso de fin de descanso para la web (app/ui/restnotif.js): el navegador no puede sonar
-- con la pantalla apagada, así que el servidor manda una notificación push a la hora de fin.
-- Correr UNA vez (se puede volver a correr). Necesita pg_cron y pg_net (vienen en Supabase).
--
--   · Al empezar el descanso la app llama schedule_rest_alarm(segundos); al saltearlo o si
--     termina con la app a la vista, cancel_rest_alarm().
--   · Cada 5 segundos, si hay algún aviso vencido, pg_cron llama a la función "descanso",
--     que lo borra y manda el push (supabase/functions/descanso).
-- Las apps de las tiendas no usan esto: programan el aviso en el mismo celular.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create table if not exists public.rest_alarms (
  user_id uuid primary key references auth.users(id) on delete cascade,
  send_at timestamptz not null
);
alter table public.rest_alarms enable row level security;
-- Sin políticas: solo se usa desde las funciones de abajo y la función "descanso".
create index if not exists rest_alarms_send_at_idx on public.rest_alarms (send_at);

create or replace function public.schedule_rest_alarm(p_seconds int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  if p_seconds is null or p_seconds < 1 or p_seconds > 1800 then
    raise exception 'Descanso inválido' using errcode = '22023';
  end if;
  insert into rest_alarms (user_id, send_at) values (auth.uid(), now() + make_interval(secs => p_seconds))
  on conflict (user_id) do update set send_at = excluded.send_at;
end $$;

create or replace function public.cancel_rest_alarm()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.rest_alarms where user_id = auth.uid();
$$;

revoke execute on function public.schedule_rest_alarm(int) from public, anon;
revoke execute on function public.cancel_rest_alarm() from public, anon;
grant execute on function public.schedule_rest_alarm(int) to authenticated;
grant execute on function public.cancel_rest_alarm() to authenticated;

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

-- Cada 5 segundos: solo llama a la función si hay algo para mandar (no gasta invocaciones).
select cron.unschedule('gize-descansos') where exists (select 1 from cron.job where jobname = 'gize-descansos');
select cron.schedule('gize-descansos', '5 seconds', $job$
  select net.http_post(
    url := 'https://wegptuzhsrwppbknqstf.supabase.co/functions/v1/descanso',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.cron_secret()),
    body := '{}'::jsonb
  )
  where exists (select 1 from public.rest_alarms where send_at <= now());
$job$);

notify pgrst, 'reload schema';
