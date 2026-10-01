-- Precios nuevos de GIZE (octubre 2026) y dos planes de gimnasio más.
-- Pegar entero en Supabase → SQL Editor → Run. Se puede correr varias veces.
--
--   p10   Hasta 10 clientes                    $14.900 por mes  (antes $9.300)
--   p25   Hasta 25 clientes                    $24.900 por mes  (antes $15.000)
--   p50   Hasta 50 clientes                    $37.900 por mes  (antes $20.000)
--   p100  Gimnasio chico, hasta 100 alumnos    $59.900 por mes  (antes $33.000)
--   p250  Gimnasio, hasta 250 alumnos          $119.900 por mes (nuevo)
--   p500  Gimnasio grande, hasta 500 alumnos   $199.900 por mes (nuevo)
--   Más de 500 alumnos: a medida (se arregla por WhatsApp).
--
-- Los precios nuevos valen para los pagos nuevos. El cobro es manual (transferencia): no se
-- toca coach_billing, así que los coaches que ya pagaron siguen con su plan, su tope de
-- alumnos y su «pagado hasta» como están. Lo que cambia es el precio de lista que muestran
-- el panel (plan_price: Resumen, Finanzas y la columna «Paga» de Coaches y pagos).
--
-- Qué hace (no lee ni cambia datos de usuarios):
--   1) Suma 'p250' y 'p500' a los planes permitidos de coach_billing.
--   2) plan_price con los precios nuevos (igual que admin.sql).
--   3) admin_overview y admin_fin cuentan también los planes nuevos (igual que admin.sql y
--      finanzas.sql).
--   4) admin_set_paid acepta los planes nuevos (igual que cobro-manual.sql).
-- El tope de alumnos lo guarda cada coach en coach_billing.max_clients (lo pone el panel al
-- cargar el pago, hasta 1000): no hay que cambiar nada para que se cumpla.

-- 1) Planes permitidos
alter table public.coach_billing drop constraint if exists coach_billing_plan_check;
alter table public.coach_billing add constraint coach_billing_plan_check
  check (plan in ('trial','p10','p25','p50','p100','p250','p500','cortesia'));

-- 2) Precio mensual de cada plan
create or replace function public.plan_price(p text) returns numeric language sql immutable as $$
  select case p when 'p10' then 14900 when 'p25' then 24900 when 'p50' then 37900 when 'p100' then 59900
                when 'p250' then 119900 when 'p500' then 199900 else 0 end::numeric;
$$;

-- 3) Resumen y Finanzas del panel
create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare out jsonb;
begin
  perform public.admin_assert();
  with act as (
    select client_id as uid from public.sessions where created_at > now() - interval '7 days'
    union select client_id from public.food_entries where log_date >= current_date - 7
    union select client_id from public.daily_logs where log_date >= current_date - 7
    union select id from public.profiles where last_seen_at > now() - interval '7 days'
  ), paid as (
    select * from public.coach_billing where plan in ('p10','p25','p50','p100','p250','p500') and coalesce(paid_until, '-infinity') > now()
  )
  select jsonb_build_object(
    'users',     (select count(*) from auth.users),
    'coaches',   (select count(*) from public.profiles where role = 'coach'),
    'clients',   (select count(*) from public.profiles where coalesce(role, 'client') = 'client'),
    'linked',    (select count(*) from public.profiles where coalesce(role, 'client') = 'client' and coach_id is not null),
    'new7',      (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'new30',     (select count(*) from auth.users where created_at > now() - interval '30 days'),
    'active7',   (select count(distinct uid) from act),
    'sessions7', (select count(*) from public.sessions where created_at > now() - interval '7 days'),
    'paid',      (select count(*) from paid),
    'mrr',       (select coalesce(sum(public.plan_price(plan)), 0) from paid),
    'trial',     (select count(*) from public.coach_billing where plan = 'trial' and trial_ends_at > now()),
    'courtesy',  (select count(*) from public.coach_billing where plan = 'cortesia'),
    'overdue',   (select count(*) from public.coach_billing where plan not in ('cortesia') and trial_ends_at <= now() and coalesce(paid_until, '-infinity') <= now()),
    'products',  (select count(*) from public.products where not hidden),
    'pending',   (select count(*) from public.products where not hidden and ((source = 'user' and not verified) or reports > 0)),
    'signups',   (select coalesce(jsonb_agg(jsonb_build_object('w', w, 'n', n) order by w), '[]') from (
                    select to_char(g.w, 'YYYY-MM-DD') as w, (select count(*) from auth.users u where u.created_at >= g.w and u.created_at < g.w + interval '7 days') as n
                      from generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') g(w)) s),
    'training',  (select coalesce(jsonb_agg(jsonb_build_object('w', w, 'n', n) order by w), '[]') from (
                    select to_char(g.w, 'YYYY-MM-DD') as w, (select count(*) from public.sessions s where s.created_at >= g.w and s.created_at < g.w + interval '7 days') as n
                      from generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') g(w)) s),
    'versions',  (select coalesce(jsonb_agg(jsonb_build_object('platform', app_platform, 'version', app_version, 'n', n) order by n desc), '[]') from (
                    select coalesce(app_platform, '?') as app_platform, coalesce(app_version, '?') as app_version, count(*) as n
                      from public.profiles where last_seen_at > now() - interval '30 days' group by 1, 2) v)
  ) into out;
  return out;
end $$;
revoke execute on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;

create or replace function public.admin_fin()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  perform public.admin_assert();
  with paid as (
    select plan from public.coach_billing where plan in ('p10','p25','p50','p100','p250','p500') and coalesce(paid_until, '-infinity') > now()
  )
  select jsonb_build_object(
    'settings', (select to_jsonb(s) - 'id' from public.fin_settings s where s.id),
    'costs',    (select coalesce(jsonb_agg(to_jsonb(c) order by array_position(array['activo','pensando','pausado'], c.status), c.id), '[]') from public.fin_costs c),
    'todos',    (select coalesce(jsonb_agg(to_jsonb(t) order by t.done, t.id), '[]') from public.fin_todos t),
    'plans',    (select jsonb_agg(jsonb_build_object('id', p, 'price', public.plan_price(p), 'paid', (select count(*) from paid where paid.plan = p)) order by public.plan_price(p))
                   from unnest(array['p10','p25','p50','p100','p250','p500']) as p),
    'trial',    (select count(*) from public.coach_billing where plan = 'trial' and trial_ends_at > now()),
    'courtesy', (select count(*) from public.coach_billing where plan = 'cortesia')
  ) into out;
  return out;
end $$;
revoke execute on function public.admin_fin() from public, anon;
grant execute on function public.admin_fin() to authenticated;

-- 4) Pago manual
create or replace function public.admin_set_paid(cid uuid, p_plan text, p_max int, p_until date)
returns void language plpgsql security definer set search_path = public as $$
-- «Hoy» en Argentina: current_date va en UTC y de 21 a 24 ya es mañana.
declare hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  perform public.admin_assert();
  if p_plan not in ('p10', 'p25', 'p50', 'p100', 'p250', 'p500') then raise exception 'Plan inválido.' using errcode = 'P0001'; end if;
  if p_until is null or p_until < hoy then raise exception 'Poné una fecha de hoy en adelante.' using errcode = 'P0001'; end if;
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

notify pgrst, 'reload schema';
