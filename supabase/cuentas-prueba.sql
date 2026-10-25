-- Cuentas de prueba en el panel de administrador (gize.ar/admin): las cuentas propias, las demo
-- y las de la revisión de Apple se marcan como «de prueba» para que no se cuenten como coaches ni
-- usuarios reales. Correr con el workflow "Supabase" → tarea sql → supabase/cuentas-prueba.sql,
-- después de supabase/admin.sql, supabase/finanzas.sql y supabase/precios-2026-10.sql (cambia
-- funciones de esos archivos). Se puede correr varias veces.
--
-- Si después volvés a correr alguno de esos tres, corré este otra vez: si no, el panel vuelve a
-- contar las cuentas de prueba.
--
-- Qué hace:
--   1) La tabla test_accounts: qué cuentas son de prueba. Solo la tocan las funciones del panel
--      (nadie la lee ni la escribe directo, ni siquiera la persona marcada).
--   2) admin_set_test: marcar o desmarcar una cuenta (solo administradores, queda en el registro).
--   3) El Resumen y Finanzas no cuentan las cuentas de prueba (usuarios, coaches, pagando, en
--      prueba, cortesía, sin pagar, activos, entrenos, gráficos y versiones).
--   4) Usuarios, Coaches y pagos y la ficha de cada uno dicen si la cuenta es de prueba (is_test).
-- Las cuentas demo de supabase/cuentas-demo.sql se marcan solas cada vez que se corre ese archivo
-- (si este ya se corrió): después de correr este, corré también la tarea cuentas-demo.

-- 1) Qué cuentas son de prueba
create table if not exists public.test_accounts (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  marked_at  timestamptz not null default now(),
  marked_by  uuid references auth.users(id) on delete set null
);
alter table public.test_accounts enable row level security;
revoke all on public.test_accounts from anon, authenticated;

-- 2) Marcar o desmarcar
create or replace function public.admin_set_test(uid uuid, on_off boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_assert();
  if on_off then insert into public.test_accounts(user_id, marked_by) values (uid, auth.uid()) on conflict (user_id) do nothing;
  else delete from public.test_accounts where user_id = uid; end if;
  perform public.admin_log(case when on_off then 'prueba_si' else 'prueba_no' end, uid::text, null);
end $$;
revoke execute on function public.admin_set_test(uuid, boolean) from public, anon;
grant execute on function public.admin_set_test(uuid, boolean) to authenticated;

-- 3) Resumen (igual que precios-2026-10.sql, sin las cuentas de prueba)
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
  ), us as (
    select * from auth.users u where not exists (select 1 from public.test_accounts t where t.user_id = u.id)
  ), pr as (
    select * from public.profiles p where not exists (select 1 from public.test_accounts t where t.user_id = p.id)
  ), cb as (
    select * from public.coach_billing b where not exists (select 1 from public.test_accounts t where t.user_id = b.coach_id)
  ), se as (
    select * from public.sessions s where not exists (select 1 from public.test_accounts t where t.user_id = s.client_id)
  ), paid as (
    select * from cb where plan in ('p10','p25','p50','p100','p250','p500') and coalesce(paid_until, '-infinity') > now()
  )
  select jsonb_build_object(
    'users',     (select count(*) from us),
    'coaches',   (select count(*) from pr where role = 'coach'),
    'clients',   (select count(*) from pr where coalesce(role, 'client') = 'client'),
    'linked',    (select count(*) from pr where coalesce(role, 'client') = 'client' and coach_id is not null),
    'new7',      (select count(*) from us where created_at > now() - interval '7 days'),
    'new30',     (select count(*) from us where created_at > now() - interval '30 days'),
    'active7',   (select count(distinct uid) from act where not exists (select 1 from public.test_accounts t where t.user_id = act.uid)),
    'sessions7', (select count(*) from se where created_at > now() - interval '7 days'),
    'paid',      (select count(*) from paid),
    'mrr',       (select coalesce(sum(public.plan_price(plan)), 0) from paid),
    'trial',     (select count(*) from cb where plan = 'trial' and trial_ends_at > now()),
    'courtesy',  (select count(*) from cb where plan = 'cortesia'),
    'overdue',   (select count(*) from cb where plan not in ('cortesia') and trial_ends_at <= now() and coalesce(paid_until, '-infinity') <= now()),
    'products',  (select count(*) from public.products where not hidden),
    'pending',   (select count(*) from public.products where not hidden and ((source = 'user' and not verified) or reports > 0)),
    'signups',   (select coalesce(jsonb_agg(jsonb_build_object('w', w, 'n', n) order by w), '[]') from (
                    select to_char(g.w, 'YYYY-MM-DD') as w, (select count(*) from us u where u.created_at >= g.w and u.created_at < g.w + interval '7 days') as n
                      from generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') g(w)) s),
    'training',  (select coalesce(jsonb_agg(jsonb_build_object('w', w, 'n', n) order by w), '[]') from (
                    select to_char(g.w, 'YYYY-MM-DD') as w, (select count(*) from se s where s.created_at >= g.w and s.created_at < g.w + interval '7 days') as n
                      from generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') g(w)) s),
    'versions',  (select coalesce(jsonb_agg(jsonb_build_object('platform', app_platform, 'version', app_version, 'n', n) order by n desc), '[]') from (
                    select coalesce(app_platform, '?') as app_platform, coalesce(app_version, '?') as app_version, count(*) as n
                      from pr where last_seen_at > now() - interval '30 days' group by 1, 2) v)
  ) into out;
  return out;
end $$;
revoke execute on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;

-- Finanzas (igual que precios-2026-10.sql, sin las cuentas de prueba)
create or replace function public.admin_fin()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  perform public.admin_assert();
  with cb as (
    select * from public.coach_billing b where not exists (select 1 from public.test_accounts t where t.user_id = b.coach_id)
  ), paid as (
    select plan from cb where plan in ('p10','p25','p50','p100','p250','p500') and coalesce(paid_until, '-infinity') > now()
  )
  select jsonb_build_object(
    'settings', (select to_jsonb(s) - 'id' from public.fin_settings s where s.id),
    'costs',    (select coalesce(jsonb_agg(to_jsonb(c) order by array_position(array['activo','pensando','pausado'], c.status), c.id), '[]') from public.fin_costs c),
    'todos',    (select coalesce(jsonb_agg(to_jsonb(t) order by t.done, t.id), '[]') from public.fin_todos t),
    'plans',    (select jsonb_agg(jsonb_build_object('id', p, 'price', public.plan_price(p), 'paid', (select count(*) from paid where paid.plan = p)) order by public.plan_price(p))
                   from unnest(array['p10','p25','p50','p100','p250','p500']) as p),
    'trial',    (select count(*) from cb where plan = 'trial' and trial_ends_at > now()),
    'courtesy', (select count(*) from cb where plan = 'cortesia')
  ) into out;
  return out;
end $$;
revoke execute on function public.admin_fin() from public, anon;
grant execute on function public.admin_fin() to authenticated;

-- 4) Usuarios (igual que admin.sql, con is_test)
drop function if exists public.admin_users(text);
create or replace function public.admin_users(q text)
returns table (id uuid, email text, full_name text, role text, coach_name text, created_at timestamptz,
  last_sign_in_at timestamptz, last_seen_at timestamptz, app_version text, app_platform text, is_admin boolean, is_test boolean)
language plpgsql stable security definer set search_path = public, auth as $$
declare k text := '%' || lower(btrim(coalesce(q, ''))) || '%';
begin
  perform public.admin_assert();
  return query
    select u.id, u.email::text, p.full_name, coalesce(p.role, 'client'), c.full_name, u.created_at, u.last_sign_in_at,
           p.last_seen_at, p.app_version, p.app_platform, exists (select 1 from public.app_admins a where a.user_id = u.id),
           exists (select 1 from public.test_accounts t where t.user_id = u.id)
      from auth.users u left join public.profiles p on p.id = u.id left join public.profiles c on c.id = p.coach_id
     where k = '%%' or lower(u.email) like k or lower(coalesce(p.full_name, '')) like k
     order by u.created_at desc
     limit 60;
end $$;
revoke execute on function public.admin_users(text) from public, anon;
grant execute on function public.admin_users(text) to authenticated;

-- Ficha de un usuario (igual que admin.sql, con is_test)
create or replace function public.admin_user_detail(uid uuid)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare r jsonb;
begin
  perform public.admin_assert();
  select jsonb_build_object(
    'id', u.id, 'email', u.email, 'full_name', p.full_name, 'role', coalesce(p.role, 'client'),
    'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at, 'last_seen_at', p.last_seen_at,
    'app_version', p.app_version, 'app_platform', p.app_platform,
    'provider', u.raw_app_meta_data->>'provider',
    'coach', (select jsonb_build_object('id', c.id, 'name', c.full_name) from public.profiles c where c.id = p.coach_id),
    'sessions', (select count(*) from public.sessions s where s.client_id = u.id),
    'last_session', (select max(performed_on) from public.sessions s where s.client_id = u.id),
    'food_days', (select count(distinct log_date) from public.food_entries f where f.client_id = u.id),
    'checkins', (select count(*) from public.checkins k where k.client_id = u.id),
    'clients', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.full_name) order by x.full_name), '[]') from public.profiles x where x.coach_id = u.id),
    'billing', (select to_jsonb(b) - 'coach_id' from public.coach_billing b where b.coach_id = u.id),
    'is_admin', exists (select 1 from public.app_admins a where a.user_id = u.id),
    'is_test', exists (select 1 from public.test_accounts t where t.user_id = u.id)
  ) into r
  from auth.users u left join public.profiles p on p.id = u.id where u.id = uid;
  return r;
end $$;
revoke execute on function public.admin_user_detail(uuid) from public, anon;
grant execute on function public.admin_user_detail(uuid) to authenticated;

-- Coaches y pagos (igual que admin.sql, con is_test y las cuentas de prueba al final)
drop function if exists public.admin_coaches();
create or replace function public.admin_coaches()
returns table (id uuid, full_name text, email text, plan text, max_clients int, clients bigint, trial_ends_at timestamptz,
  paid_until timestamptz, mp_status text, has_mp boolean, pending_plan text, active boolean, price numeric, is_test boolean)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  perform public.admin_assert();
  return query
    select p.id, p.full_name, u.email::text, b.plan, b.max_clients,
           (select count(*) from public.profiles x where x.coach_id = p.id), b.trial_ends_at, b.paid_until, b.mp_status,
           b.mp_preapproval_id is not null, b.pending_plan, public.coach_active(p.id), public.plan_price(b.plan),
           exists (select 1 from public.test_accounts t where t.user_id = p.id)
      from public.profiles p join auth.users u on u.id = p.id left join public.coach_billing b on b.coach_id = p.id
     where p.role = 'coach'
     order by exists (select 1 from public.test_accounts t where t.user_id = p.id),
              public.coach_active(p.id) desc, (select count(*) from public.profiles x where x.coach_id = p.id) desc
     limit 300;
end $$;
revoke execute on function public.admin_coaches() from public, anon;
grant execute on function public.admin_coaches() to authenticated;

notify pgrst, 'reload schema';
select 'cuentas de prueba' as que, count(*) as cantidad from public.test_accounts;
