-- Mails a los coaches durante la prueba gratis de 14 días: uno al día 3 («¿Ya sumaste tu primer
-- alumno?») y otro al día 10 («Te quedan 4 días»).
-- Correr con el workflow "Supabase" → tarea sql → supabase/mails-prueba.sql (después de
-- suscripciones.sql y avisos-coach.sql, que crea cron_secret()). Se puede correr varias veces.
-- Antes: publicar la función prueba-coach (workflow "Supabase" → tarea funciones). Manda los
-- mails con Resend desde soporte@gize.ar (secret RESEND_API_KEY, el mismo del aviso de vencimiento).
--
-- Cada hora, de 9 a 20 (hora de Argentina), si hay algún coach al que le toca un mail, pg_cron
-- llama a la función, que toma esos coaches (los marca en mail_dia3_at o mail_dia10_at, así
-- cada mail sale una sola vez) y les manda el mail. Si el mail no sale, se desmarca y se vuelve a
-- intentar en la hora siguiente.
--   · Día 3: cuando a la prueba le quedan 11 días o menos. Si ya le quedan 9 o menos (se pasó el
--     momento, por ejemplo porque este archivo se corrió tarde), ese ya no se manda.
--   · Día 10: cuando le quedan 4 días o menos. Con 2 o menos ya no: llega el de «termina mañana»
--     (aviso-vencimiento.sql).
-- Solo a coaches en prueba vigente que nunca pagaron: ni cortesía, ni plan pago (Mercado Pago,
-- transferencia o Apple: todos dejan paid_until), ni renovación automática de Mercado Pago.
-- Las cuentas demo de las tiendas (cuentas-demo.sql) no entran: una tiene cortesía y la otra
-- tiene la prueba terminada.

alter table public.coach_billing add column if not exists mail_dia3_at timestamptz;
alter table public.coach_billing add column if not exists mail_dia10_at timestamptz;

-- Qué mail le toca a este coach ahora: 3, 10 o null (ninguno). El del día 10 primero: si le
-- tocan los dos (no pasa con estas ventanas, pero por las dudas) sale el más nuevo.
create or replace function public.mail_prueba_toca(b public.coach_billing)
returns integer language sql stable security definer set search_path = public as $$
  select case
    when b.plan <> 'trial' or b.paid_until is not null or coalesce(b.mp_status, '') = 'authorized'
      or not exists (select 1 from public.profiles p where p.id = b.coach_id and p.role = 'coach') then null
    when b.mail_dia10_at is null
      and b.trial_ends_at > now() + interval '2 days' and b.trial_ends_at <= now() + interval '4 days' then 10
    when b.mail_dia3_at is null
      and b.trial_ends_at > now() + interval '9 days' and b.trial_ends_at <= now() + interval '11 days' then 3
  end;
$$;

create or replace function public.hay_mails_prueba()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.coach_billing b where public.mail_prueba_toca(b) is not null);
$$;

-- Toma los que tocan y los marca, en un solo paso (dos llamadas a la vez no repiten: la segunda
-- saltea los que la primera tiene tomados y, si ya los marcó, no le tocan más).
-- Devuelve lo que necesita el mail: el nombre, el código de invitación y cuántos alumnos tiene.
create or replace function public.tomar_mails_prueba()
returns table (coach_id uuid, dia integer, vence timestamptz, nombre text, codigo text, clientes integer)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with toca as (
    select x.coach_id, public.mail_prueba_toca(x) as dia
      from public.coach_billing x
     where public.mail_prueba_toca(x) is not null
       for update skip locked
  )
  update public.coach_billing b
     set mail_dia3_at = case when t.dia = 3 then now() else b.mail_dia3_at end,
         mail_dia10_at = case when t.dia = 10 then now() else b.mail_dia10_at end
    from toca t
   where t.coach_id = b.coach_id
  returning b.coach_id, t.dia, b.trial_ends_at,
            (select p.full_name from public.profiles p where p.id = b.coach_id),
            (select p.invite_code from public.profiles p where p.id = b.coach_id),
            (select count(*)::int from public.profiles x where x.coach_id = b.coach_id);
end $$;

-- El mail no salió: se desmarca para que se reintente.
create or replace function public.soltar_mail_prueba(cid uuid, dia integer)
returns void language sql security definer set search_path = public as $$
  update public.coach_billing
     set mail_dia3_at = case when dia = 3 then null else mail_dia3_at end,
         mail_dia10_at = case when dia = 10 then null else mail_dia10_at end
   where coach_id = cid;
$$;

revoke execute on function public.mail_prueba_toca(public.coach_billing) from public, anon, authenticated;
revoke execute on function public.hay_mails_prueba() from public, anon, authenticated;
revoke execute on function public.tomar_mails_prueba() from public, anon, authenticated;
revoke execute on function public.soltar_mail_prueba(uuid, integer) from public, anon, authenticated;
grant execute on function public.tomar_mails_prueba() to service_role;
grant execute on function public.soltar_mail_prueba(uuid, integer) to service_role;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net;
-- 12 a 23 UTC = 9 a 20 en Argentina: que el mail no llegue de madrugada.
select cron.unschedule('gize-mails-prueba') where exists (select 1 from cron.job where jobname = 'gize-mails-prueba');
select cron.schedule('gize-mails-prueba', '23 12-23 * * *', $job$
  select net.http_post(
    url := 'https://wegptuzhsrwppbknqstf.supabase.co/functions/v1/prueba-coach',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.cron_secret()),
    body := '{}'::jsonb
  )
  where public.hay_mails_prueba();
$job$);

notify pgrst, 'reload schema';
