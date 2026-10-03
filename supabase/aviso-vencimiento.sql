-- Mail al coach un día antes de que venza su plan (o su prueba gratis).
-- Correr con el workflow "Supabase" → tarea sql → supabase/aviso-vencimiento.sql (después de
-- suscripciones.sql y avisos-coach.sql, que crea cron_secret()). Se puede volver a correr.
-- Antes: publicar la función vence-plan (workflow "Supabase" → tarea funciones). Manda los
-- mails con Resend desde soporte@gize.ar (secret RESEND_API_KEY, el mismo de los avisos de pagos).
--
-- Cada hora, si hay algún coach al que le falten 24 horas o menos para que venza el plan,
-- pg_cron llama a la función, que toma esos coaches (los marca en aviso_vence_para con la fecha
-- que se avisa, así cada vencimiento se avisa una sola vez) y les manda el mail. Si el mail no
-- sale, se desmarca y se vuelve a intentar en la hora siguiente.
-- No se avisa: la cortesía (no vence) ni la suscripción de Mercado Pago activa (se renueva sola).

alter table public.coach_billing add column if not exists aviso_vence_para timestamptz;

-- Vencimiento: lo que termine más tarde entre la prueba y lo pagado.
create or replace function public.coach_vence(b public.coach_billing)
returns timestamptz language sql immutable as $$
  select greatest(b.trial_ends_at, coalesce(b.paid_until, '-infinity'));
$$;

create or replace function public.hay_avisos_vence()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.coach_billing b
     where b.plan <> 'cortesia' and coalesce(b.mp_status, '') <> 'authorized'
       and public.coach_vence(b) > now() and public.coach_vence(b) <= now() + interval '24 hours'
       and b.aviso_vence_para is distinct from public.coach_vence(b));
$$;

-- Toma los que tocan avisar y los marca, en un solo paso (dos llamadas a la vez no repiten).
create or replace function public.tomar_avisos_vence()
returns table (coach_id uuid, vence timestamptz, prueba boolean, clientes integer)
language plpgsql security definer set search_path = public as $$
begin
  return query
  update public.coach_billing b
     set aviso_vence_para = public.coach_vence(b)
   where b.plan <> 'cortesia' and coalesce(b.mp_status, '') <> 'authorized'
     and public.coach_vence(b) > now() and public.coach_vence(b) <= now() + interval '24 hours'
     and b.aviso_vence_para is distinct from public.coach_vence(b)
  returning b.coach_id, b.aviso_vence_para, (b.paid_until is null or b.trial_ends_at >= b.paid_until),
            (select count(*)::int from public.profiles x where x.coach_id = b.coach_id);
end $$;

-- El mail no salió: se desmarca para que se reintente.
create or replace function public.soltar_aviso_vence(cid uuid)
returns void language sql security definer set search_path = public as $$
  update public.coach_billing set aviso_vence_para = null where coach_id = cid;
$$;

revoke execute on function public.hay_avisos_vence() from public, anon, authenticated;
revoke execute on function public.tomar_avisos_vence() from public, anon, authenticated;
revoke execute on function public.soltar_aviso_vence(uuid) from public, anon, authenticated;
grant execute on function public.tomar_avisos_vence() to service_role;
grant execute on function public.soltar_aviso_vence(uuid) to service_role;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net;
select cron.unschedule('gize-aviso-vence') where exists (select 1 from cron.job where jobname = 'gize-aviso-vence');
select cron.schedule('gize-aviso-vence', '41 * * * *', $job$
  select net.http_post(
    url := 'https://wegptuzhsrwppbknqstf.supabase.co/functions/v1/vence-plan',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.cron_secret()),
    body := '{}'::jsonb
  )
  where public.hay_avisos_vence();
$job$);

notify pgrst, 'reload schema';
