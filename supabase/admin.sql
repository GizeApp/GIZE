-- Panel de administrador de GIZE (gize.ar/admin). Correr con el workflow "Supabase" → tarea
-- sql → supabase/admin.sql, después de supabase/productos-revision.sql (que crea app_admins e
-- is_app_admin). Se puede correr varias veces.
--
-- Todo lo del panel pasa por funciones que primero chequean que quien llama sea administrador
-- (admin_assert) y cada acción que cambia algo queda anotada en admin_audit. Lo que necesita
-- secretos de afuera (Mercado Pago, avisos push, borrar cuentas) va por la función «admin».

-- 0) Chequeo y registro de acciones
create or replace function public.admin_assert()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_app_admin() then raise exception 'Solo administradores.' using errcode = '42501'; end if;
end $$;
revoke execute on function public.admin_assert() from public, anon;

create table if not exists public.admin_audit (
  id         bigint generated always as identity primary key,
  admin_id   uuid references auth.users(id) on delete set null,
  action     text not null,
  target     text,
  detail     jsonb,
  created_at timestamptz not null default now()
);
alter table public.admin_audit enable row level security;
revoke all on public.admin_audit from anon, authenticated;

create or replace function public.admin_log(p_action text, p_target text, p_detail jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_assert();
  insert into public.admin_audit(admin_id, action, target, detail) values (auth.uid(), left(p_action, 60), left(p_target, 200), p_detail);
end $$;
revoke execute on function public.admin_log(text, text, jsonb) from public, anon;
grant execute on function public.admin_log(text, text, jsonb) to authenticated;

-- 1) Actividad: la app avisa cuándo se abrió y con qué versión (una vez por hora como mucho).
alter table public.profiles add column if not exists last_seen_at timestamptz;
alter table public.profiles add column if not exists app_version text;
alter table public.profiles add column if not exists app_platform text;
create or replace function public.touch_me(p_version text, p_platform text)
returns void language sql security definer set search_path = public as $$
  update public.profiles set last_seen_at = now(), app_version = left(nullif(p_version, ''), 20),
         app_platform = case when p_platform in ('web','android','ios') then p_platform else 'web' end
   where id = auth.uid() and (last_seen_at is null or last_seen_at < now() - interval '1 hour'
         or app_version is distinct from left(nullif(p_version, ''), 20));
$$;
revoke execute on function public.touch_me(text, text) from public, anon;
grant execute on function public.touch_me(text, text) to authenticated;

-- Precio mensual de cada plan (igual que en la función suscripcion, app/screens/coach/plan.js,
-- admin/admin.js y la landing). Cambiados en supabase/precios-2026-10.sql.
create or replace function public.plan_price(p text) returns numeric language sql immutable as $$
  select case p when 'p10' then 14900 when 'p25' then 24900 when 'p50' then 37900 when 'p100' then 59900
                when 'p250' then 119900 when 'p500' then 199900 else 0 end::numeric;
$$;

-- 2) Resumen
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

-- 3) Usuarios
drop function if exists public.admin_users(text);
create or replace function public.admin_users(q text)
returns table (id uuid, email text, full_name text, role text, coach_name text, created_at timestamptz,
  last_sign_in_at timestamptz, last_seen_at timestamptz, app_version text, app_platform text, is_admin boolean)
language plpgsql stable security definer set search_path = public, auth as $$
declare k text := '%' || lower(btrim(coalesce(q, ''))) || '%';
begin
  perform public.admin_assert();
  return query
    select u.id, u.email::text, p.full_name, coalesce(p.role, 'client'), c.full_name, u.created_at, u.last_sign_in_at,
           p.last_seen_at, p.app_version, p.app_platform, exists (select 1 from public.app_admins a where a.user_id = u.id)
      from auth.users u left join public.profiles p on p.id = u.id left join public.profiles c on c.id = p.coach_id
     where k = '%%' or lower(u.email) like k or lower(coalesce(p.full_name, '')) like k
     order by u.created_at desc
     limit 60;
end $$;
revoke execute on function public.admin_users(text) from public, anon;
grant execute on function public.admin_users(text) to authenticated;

-- Todos los administradores (Seguridad → Administradores). admin_users trae solo las 60
-- cuentas más nuevas y los administradores suelen ser de las más viejas.
create or replace function public.admin_list_admins()
returns table (id uuid, email text, full_name text)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  perform public.admin_assert();
  return query
    select u.id, u.email::text, p.full_name
      from public.app_admins a join auth.users u on u.id = a.user_id left join public.profiles p on p.id = u.id
     order by p.full_name nulls last, u.email;
end $$;
revoke execute on function public.admin_list_admins() from public, anon;
grant execute on function public.admin_list_admins() to authenticated;

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
    'is_admin', exists (select 1 from public.app_admins a where a.user_id = u.id)
  ) into r
  from auth.users u left join public.profiles p on p.id = u.id where u.id = uid;
  return r;
end $$;
revoke execute on function public.admin_user_detail(uuid) from public, anon;
grant execute on function public.admin_user_detail(uuid) to authenticated;

-- Cambiar el rol. Un coach con alumnos no pasa a alumno (primero hay que desvincularlos).
create or replace function public.admin_set_role(uid uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_assert();
  if p_role not in ('client', 'coach') then raise exception 'Rol inválido.'; end if;
  if p_role = 'client' and exists (select 1 from public.profiles where coach_id = uid) then
    raise exception 'Este coach tiene alumnos: primero desvinculalos.' using errcode = 'P0001';
  end if;
  update public.profiles set role = p_role, coach_id = case when p_role = 'coach' then null else coach_id end where id = uid;
  if p_role = 'coach' then insert into public.coach_billing (coach_id) values (uid) on conflict (coach_id) do nothing; end if;
  perform public.admin_log('rol', uid::text, jsonb_build_object('role', p_role));
end $$;
revoke execute on function public.admin_set_role(uuid, text) from public, anon;
grant execute on function public.admin_set_role(uuid, text) to authenticated;

create or replace function public.admin_unlink(uid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_assert();
  update public.profiles set coach_id = null where id = uid;
  perform public.admin_log('desvincular', uid::text, null);
end $$;
revoke execute on function public.admin_unlink(uuid) from public, anon;
grant execute on function public.admin_unlink(uuid) to authenticated;

create or replace function public.admin_set_admin(uid uuid, on_off boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_assert();
  if uid = auth.uid() and not on_off then raise exception 'No te podés sacar a vos mismo.' using errcode = 'P0001'; end if;
  if on_off then insert into public.app_admins(user_id) values (uid) on conflict do nothing;
  else delete from public.app_admins where user_id = uid; end if;
  perform public.admin_log(case when on_off then 'admin_si' else 'admin_no' end, uid::text, null);
end $$;
revoke execute on function public.admin_set_admin(uuid, boolean) from public, anon;
grant execute on function public.admin_set_admin(uuid, boolean) to authenticated;

-- 4) Coaches y planes
drop function if exists public.admin_coaches();
create or replace function public.admin_coaches()
returns table (id uuid, full_name text, email text, plan text, max_clients int, clients bigint, trial_ends_at timestamptz,
  paid_until timestamptz, mp_status text, has_mp boolean, pending_plan text, active boolean, price numeric)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  perform public.admin_assert();
  return query
    select p.id, p.full_name, u.email::text, b.plan, b.max_clients,
           (select count(*) from public.profiles x where x.coach_id = p.id), b.trial_ends_at, b.paid_until, b.mp_status,
           b.mp_preapproval_id is not null, b.pending_plan, public.coach_active(p.id), public.plan_price(b.plan)
      from public.profiles p join auth.users u on u.id = p.id left join public.coach_billing b on b.coach_id = p.id
     where p.role = 'coach'
     order by public.coach_active(p.id) desc, (select count(*) from public.profiles x where x.coach_id = p.id) desc
     limit 300;
end $$;
revoke execute on function public.admin_coaches() from public, anon;
grant execute on function public.admin_coaches() to authenticated;

-- Cortesía (gratis, con tope de alumnos) o extender la prueba. No toca una suscripción de
-- Mercado Pago en curso: eso se maneja desde la cuenta del coach.
create or replace function public.admin_set_plan(cid uuid, mode text, p_max int, p_days int)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_assert();
  insert into public.coach_billing (coach_id) values (cid) on conflict (coach_id) do nothing;
  if mode = 'cortesia' then
    -- Con la suscripción de Mercado Pago activa se le seguiría cobrando, y el próximo aviso de
    -- pago le devolvería el plan pago: primero tiene que cancelarla (Mi plan → Cancelar).
    if exists (select 1 from public.coach_billing where coach_id = cid and mp_status = 'authorized') then
      raise exception 'Este coach tiene una suscripción de Mercado Pago activa. Pedile que la cancele desde Mi plan y después dale la cortesía.' using errcode = 'P0001';
    end if;
    update public.coach_billing set plan = 'cortesia', max_clients = greatest(1, least(coalesce(p_max, 10), 1000)), updated_at = now() where coach_id = cid;
  elsif mode = 'trial' then
    update public.coach_billing set trial_ends_at = greatest(trial_ends_at, now()) + make_interval(days => greatest(1, least(coalesce(p_days, 14), 365))), updated_at = now() where coach_id = cid;
  elsif mode = 'sin_cortesia' then
    update public.coach_billing set plan = 'trial', max_clients = 10, updated_at = now() where coach_id = cid and plan = 'cortesia';
  else raise exception 'Opción inválida.'; end if;
  perform public.admin_log('plan', cid::text, jsonb_build_object('mode', mode, 'max', p_max, 'days', p_days));
end $$;
revoke execute on function public.admin_set_plan(uuid, text, int, int) from public, anon;
grant execute on function public.admin_set_plan(uuid, text, int, int) to authenticated;

-- 5) Configuración de la app (cartel de actualización): se lee sin sesión, la cambia un admin.
create table if not exists public.app_config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.app_config enable row level security;
drop policy if exists "config pública" on public.app_config;
create policy "config pública" on public.app_config for select to anon, authenticated using (key in ('version'));
revoke insert, update, delete on public.app_config from anon, authenticated;
grant select on public.app_config to anon, authenticated;
insert into public.app_config(key, value) values ('version',
  '{"android":{"ultima":11,"version":"1.0.6","minima":0,"tienda":"https://play.google.com/store/apps/details?id=ar.com.gize.app"},"ios":{"ultima":0,"version":"","minima":0,"tienda":""}}')
  on conflict (key) do nothing;

create or replace function public.admin_set_config(p_key text, p_value jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_assert();
  if p_key not in ('version') then raise exception 'Clave inválida.'; end if;
  insert into public.app_config(key, value, updated_at) values (p_key, p_value, now())
    on conflict (key) do update set value = excluded.value, updated_at = now();
  perform public.admin_log('config', p_key, p_value);
end $$;
revoke execute on function public.admin_set_config(text, jsonb) from public, anon;
grant execute on function public.admin_set_config(text, jsonb) to authenticated;

-- 6) Registro de acciones
drop function if exists public.admin_audit_list(int);
create or replace function public.admin_audit_list(lim int)
returns table (created_at timestamptz, admin_name text, action text, target text, target_name text, detail jsonb)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  perform public.admin_assert();
  return query
    select a.created_at, coalesce(p.full_name, u.email::text), a.action, a.target,
           (select coalesce(tp.full_name, tu.email::text) from auth.users tu left join public.profiles tp on tp.id = tu.id where tu.id::text = a.target),
           a.detail
      from public.admin_audit a left join auth.users u on u.id = a.admin_id left join public.profiles p on p.id = a.admin_id
     order by a.created_at desc limit least(greatest(coalesce(lim, 50), 1), 300);
end $$;
revoke execute on function public.admin_audit_list(int) from public, anon;
grant execute on function public.admin_audit_list(int) to authenticated;

-- Productos: guardar lo revisado ahora también queda en el registro. Verificar (o volver a
-- mostrar) borra los reportes: ya se revisaron y el producto sale de Reportados.
-- Cualquier cambio desde el panel deja la marca de revisado (reviewed_at), que respetan las
-- importaciones (scripts/off-import-lib.mjs, super-import-lib.mjs y productos-etiquetas.sql):
-- antes una corrección guardada sin verificar («Guardar cambios», «Volver a mostrar») volvía a
-- los valores de afuera con la importación del mes siguiente. Las importaciones fallan sin esta
-- columna: correr este archivo antes de la próxima.
alter table public.products add column if not exists reviewed_at timestamptz;
-- Lo que ya se había revisado a mano antes de esta marca (está en el registro).
update public.products p set reviewed_at = a.at
  from (select target, max(created_at) as at from public.admin_audit
         where action in ('producto_ocultar', 'producto_verificar', 'producto_mostrar') group by target) a
 where p.id::text = a.target and p.reviewed_at is null;

create or replace function public.admin_product_save(pid uuid, p_name text, p_brand text, p_kcal numeric, p_protein numeric,
  p_carbs numeric, p_fat numeric, p_unit text, p_verified boolean, p_hidden boolean)
returns void language plpgsql security definer set search_path = public as $$
declare was_hidden boolean;
begin
  perform public.admin_assert();
  select hidden into was_hidden from public.products where id = pid;
  update public.products set name = p_name, brand = p_brand, kcal = p_kcal, protein = p_protein, carbs = p_carbs, fat = p_fat,
    unit = case when p_unit in ('g','ml') then p_unit else unit end, verified = p_verified, hidden = p_hidden, reviewed_at = now()
   where id = pid;
  if (was_hidden and not p_hidden) or (p_verified and not p_hidden) then
    delete from public.product_reports where product_id = pid;
    update public.products set reports = 0 where id = pid;
  end if;
  perform public.admin_log(case when p_hidden then 'producto_ocultar' when p_verified then 'producto_verificar' else 'producto_mostrar' end,
    pid::text, jsonb_build_object('name', p_name));
end $$;

notify pgrst, 'reload schema';
select 'admins' as que, count(*) as cantidad from public.app_admins;
