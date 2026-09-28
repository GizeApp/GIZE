-- Cobro manual a los coaches: el coach arregla el pago por fuera de la app (WhatsApp,
-- transferencia, link de pago) y un administrador lo habilita desde gize.ar/admin →
-- Coaches y pagos → "Pago manual" (plan, alumnos y pagado hasta qué día).
-- Correr con el workflow "Supabase" → tarea sql → supabase/cobro-manual.sql (después de
-- admin.sql). Se puede volver a correr.
--
-- coach_active (suscripciones.sql / cupo-plan.sql) ya mira paid_until: con esto alcanza para
-- que el coach quede habilitado hasta esa fecha, con el tope de alumnos que se ponga.

create or replace function public.admin_set_paid(cid uuid, p_plan text, p_max int, p_until date)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_assert();
  if p_plan not in ('p10', 'p25', 'p50', 'p100') then raise exception 'Plan inválido.' using errcode = 'P0001'; end if;
  if p_until is null or p_until < current_date then raise exception 'Poné una fecha de hoy en adelante.' using errcode = 'P0001'; end if;
  insert into public.coach_billing (coach_id) values (cid) on conflict (coach_id) do nothing;
  -- Con una suscripción de Mercado Pago activa, el próximo aviso de pago pisaría esto.
  if exists (select 1 from public.coach_billing where coach_id = cid and mp_status = 'authorized') then
    raise exception 'Este coach tiene una suscripción de Mercado Pago activa. Pedile que la cancele desde Mi plan (en gize.ar) y después cargá el pago.' using errcode = 'P0001';
  end if;
  update public.coach_billing
     set plan = p_plan,
         max_clients = greatest(1, least(coalesce(p_max, 10), 1000)),
         -- Hasta el final de ese día (hora de Argentina).
         paid_until = ((p_until + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires'),
         pending_plan = null,
         updated_at = now()
   where coach_id = cid;
  perform public.admin_log('plan', cid::text, jsonb_build_object('mode', 'pago_manual', 'plan', p_plan, 'max', p_max, 'hasta', p_until));
end $$;
revoke execute on function public.admin_set_paid(uuid, text, int, date) from public, anon;
grant execute on function public.admin_set_paid(uuid, text, int, date) to authenticated;

-- Cortar el pago manual ahora (por ejemplo, si se cargó por error o dejó de pagar).
create or replace function public.admin_clear_paid(cid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_assert();
  update public.coach_billing set paid_until = now(), updated_at = now() where coach_id = cid and plan <> 'cortesia';
  perform public.admin_log('plan', cid::text, jsonb_build_object('mode', 'cortar_pago'));
end $$;
revoke execute on function public.admin_clear_paid(uuid) from public, anon;
grant execute on function public.admin_clear_paid(uuid) to authenticated;

-- Prueba hasta una fecha exacta (con calendario) y con cuántos alumnos. Reemplaza "sumar días":
-- se puede alargar o acortar. Con cortesía no hace falta (primero se quita la cortesía).
create or replace function public.admin_set_trial(cid uuid, p_until date, p_max int)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_assert();
  if p_until is null or p_until < current_date then raise exception 'Poné una fecha de hoy en adelante.' using errcode = 'P0001'; end if;
  if p_until > current_date + 730 then raise exception 'Poné una fecha de acá a dos años como mucho.' using errcode = 'P0001'; end if;
  insert into public.coach_billing (coach_id) values (cid) on conflict (coach_id) do nothing;
  if exists (select 1 from public.coach_billing where coach_id = cid and plan = 'cortesia') then
    raise exception 'Este coach tiene cortesía. Quitale la cortesía y después poné la prueba.' using errcode = 'P0001';
  end if;
  update public.coach_billing
     set trial_ends_at = ((p_until + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires'),
         max_clients = greatest(1, least(coalesce(p_max, 10), 1000)),
         updated_at = now()
   where coach_id = cid;
  perform public.admin_log('plan', cid::text, jsonb_build_object('mode', 'prueba_hasta', 'max', p_max, 'hasta', p_until));
end $$;
revoke execute on function public.admin_set_trial(uuid, date, int) from public, anon;
grant execute on function public.admin_set_trial(uuid, date, int) to authenticated;

notify pgrst, 'reload schema';
