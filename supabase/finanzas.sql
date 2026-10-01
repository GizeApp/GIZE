-- Finanzas de GIZE (gize.ar/admin → Finanzas): los gastos fijos y quién paga cada uno, lo que
-- entra por las suscripciones de los coaches, cuántos coaches faltan para cubrir los gastos y
-- cuánto margen queda en el monotributo de quien factura. Solo lo ven los administradores.
--
-- Correr con el workflow "Supabase" → tarea sql → supabase/finanzas.sql, después de
-- supabase/admin.sql (usa admin_assert, admin_log y plan_price). Se puede correr varias veces.
--
-- Los montos no van en este archivo (el repo es público): se cargan desde el panel.

-- 1) Gastos
create table if not exists public.fin_costs (
  id         bigint generated always as identity primary key,
  name       text not null check (char_length(btrim(name)) between 1 and 80),
  amount     numeric(14,2) not null check (amount > 0 and amount < 1000000000),
  currency   text not null default 'ARS' check (currency in ('ARS','USD')),
  period     text not null default 'mensual' check (period in ('mensual','anual','unico')),
  status     text not null default 'activo' check (status in ('activo','pensando','pausado')), -- «pensando»: no suma todavía
  paid_by    text check (paid_by is null or char_length(paid_by) <= 60),                      -- qué socio lo paga
  next_date  date,                                                                            -- próximo cobro o renovación
  note       text check (note is null or char_length(note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.fin_costs enable row level security;
revoke all on public.fin_costs from anon, authenticated;

-- 2) Ajustes (una sola fila)
create table if not exists public.fin_settings (
  id             boolean primary key default true check (id),
  mp_plazo       text not null default '0' check (mp_plazo in ('0','10','18','35')),  -- días hasta que Mercado Pago libera la plata
  usd_pago       text not null default 'tarjeta' check (usd_pago in ('tarjeta','mep')), -- los gastos en dólares: tarjeta en pesos o dólares propios
  dolar_tarjeta  numeric(12,2) check (dolar_tarjeta is null or (dolar_tarjeta > 0 and dolar_tarjeta < 10000000)),
  dolar_mep      numeric(12,2) check (dolar_mep is null or (dolar_mep > 0 and dolar_mep < 10000000)),
  dolar_at       timestamptz,
  titular        text check (titular is null or char_length(titular) <= 80),                 -- quién factura
  categoria      text check (categoria is null or categoria in ('A','B','C','D','E','F','G','H','I','J','K')),
  otros_ingresos numeric(16,2) not null default 0 check (otros_ingresos >= 0 and otros_ingresos < 1000000000000),
  notas          text check (notas is null or char_length(notas) <= 5000),
  updated_at     timestamptz not null default now()
);
insert into public.fin_settings (id) values (true) on conflict (id) do nothing;
alter table public.fin_settings enable row level security;
revoke all on public.fin_settings from anon, authenticated;

-- 3) Pendientes
create table if not exists public.fin_todos (
  id         bigint generated always as identity primary key,
  label      text not null check (char_length(btrim(label)) between 1 and 200),
  done       boolean not null default false,
  created_at timestamptz not null default now(),
  done_at    timestamptz
);
alter table public.fin_todos enable row level security;
revoke all on public.fin_todos from anon, authenticated;
-- Los primeros, solo si la lista está vacía (la primera vez que se corre).
insert into public.fin_todos (label)
select t from unnest(array[
  'Cuenta de Mercado Pago conectada a GIZE a nombre de quien factura',
  'Actividad de software o servicios digitales dada de alta en el monotributo',
  'Hacer una factura C por cada cobro (ARCA → Comprobantes en línea)',
  'Acuerdo escrito entre socios: quién paga qué, cómo se reparte y a nombre de quién está cada cuenta',
  'Mercado Pago: cobrar a 35 días (1,49% + IVA en vez de 6,99% + IVA al instante)',
  'Pagar los gastos en dólares con dólares propios (MEP) en vez de pesos',
  'Revisar qué incluye DonWeb: si es solo el dominio, en NIC Argentina sale menos',
  'Los mails de los dos socios en el secret AVISOS_PAGOS (aviso con cada cobro)',
  'Evaluar Supabase Pro cuando haya coaches pagando (copias diarias y más capacidad)'
]) with ordinality as u(t, i)
where not exists (select 1 from public.fin_todos)
order by i;

-- 4) Todo junto para la pantalla: ajustes, gastos, pendientes y lo que entra por suscripciones.
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

-- Agregar (p_id null) o cambiar un gasto.
create or replace function public.admin_fin_cost_save(p_id bigint, p_name text, p_amount numeric, p_currency text, p_period text,
  p_status text, p_paid_by text, p_next date, p_note text)
returns bigint language plpgsql security definer set search_path = public as $$
declare rid bigint;
begin
  perform public.admin_assert();
  if p_id is null then
    insert into public.fin_costs (name, amount, currency, period, status, paid_by, next_date, note)
    values (btrim(p_name), p_amount, p_currency, p_period, p_status, nullif(btrim(p_paid_by), ''), p_next, nullif(btrim(p_note), ''))
    returning id into rid;
  else
    update public.fin_costs set name = btrim(p_name), amount = p_amount, currency = p_currency, period = p_period, status = p_status,
           paid_by = nullif(btrim(p_paid_by), ''), next_date = p_next, note = nullif(btrim(p_note), ''), updated_at = now()
     where id = p_id returning id into rid;
    if rid is null then raise exception 'Ese gasto ya no existe.' using errcode = 'P0001'; end if;
  end if;
  perform public.admin_log(case when p_id is null then 'fin_gasto_nuevo' else 'fin_gasto' end, rid::text,
    jsonb_build_object('name', btrim(p_name), 'amount', p_amount, 'currency', p_currency, 'period', p_period, 'status', p_status, 'paid_by', nullif(btrim(p_paid_by), '')));
  return rid;
end $$;
revoke execute on function public.admin_fin_cost_save(bigint, text, numeric, text, text, text, text, date, text) from public, anon;
grant execute on function public.admin_fin_cost_save(bigint, text, numeric, text, text, text, text, date, text) to authenticated;

create or replace function public.admin_fin_cost_delete(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare n text;
begin
  perform public.admin_assert();
  delete from public.fin_costs where id = p_id returning name into n;
  if n is not null then perform public.admin_log('fin_gasto_borrar', p_id::text, jsonb_build_object('name', n)); end if;
end $$;
revoke execute on function public.admin_fin_cost_delete(bigint) from public, anon;
grant execute on function public.admin_fin_cost_delete(bigint) to authenticated;

create or replace function public.admin_fin_settings_save(p_mp_plazo text, p_usd_pago text, p_titular text, p_categoria text,
  p_otros numeric, p_notas text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_assert();
  update public.fin_settings set mp_plazo = p_mp_plazo, usd_pago = p_usd_pago, titular = nullif(btrim(p_titular), ''),
         categoria = nullif(p_categoria, ''), otros_ingresos = coalesce(p_otros, 0), notas = nullif(btrim(p_notas), ''), updated_at = now()
   where id;
  perform public.admin_log('fin_ajustes', null, jsonb_build_object('mp_plazo', p_mp_plazo, 'usd_pago', p_usd_pago, 'categoria', p_categoria));
end $$;
revoke execute on function public.admin_fin_settings_save(text, text, text, text, numeric, text) from public, anon;
grant execute on function public.admin_fin_settings_save(text, text, text, text, numeric, text) to authenticated;

-- Cotización del dólar: el panel la trae de dolarapi.com y la guarda para cuando no responda
-- (o se pone a mano). No va al registro de acciones: se actualiza sola.
create or replace function public.admin_fin_dolar(p_tarjeta numeric, p_mep numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_assert();
  if coalesce(p_tarjeta, 0) <= 0 or coalesce(p_mep, 0) <= 0 then raise exception 'Cotización inválida.' using errcode = 'P0001'; end if;
  update public.fin_settings set dolar_tarjeta = p_tarjeta, dolar_mep = p_mep, dolar_at = now() where id;
end $$;
revoke execute on function public.admin_fin_dolar(numeric, numeric) from public, anon;
grant execute on function public.admin_fin_dolar(numeric, numeric) to authenticated;

-- Pendientes: 'nuevo' (con p_label), 'hecho', 'deshacer' o 'borrar' (con p_id).
create or replace function public.admin_fin_todo(p_mode text, p_id bigint, p_label text)
returns void language plpgsql security definer set search_path = public as $$
declare l text;
begin
  perform public.admin_assert();
  if p_mode = 'nuevo' then
    insert into public.fin_todos (label) values (btrim(p_label)) returning id, label into p_id, l;
  elsif p_mode = 'hecho' then
    update public.fin_todos set done = true, done_at = now() where id = p_id returning label into l;
  elsif p_mode = 'deshacer' then
    update public.fin_todos set done = false, done_at = null where id = p_id returning label into l;
  elsif p_mode = 'borrar' then
    delete from public.fin_todos where id = p_id returning label into l;
  else raise exception 'Opción inválida.'; end if;
  if l is not null then perform public.admin_log('fin_pendiente_' || p_mode, p_id::text, jsonb_build_object('label', l)); end if;
end $$;
revoke execute on function public.admin_fin_todo(text, bigint, text) from public, anon;
grant execute on function public.admin_fin_todo(text, bigint, text) to authenticated;

notify pgrst, 'reload schema';
select 'gastos' as que, count(*) as cantidad from public.fin_costs;
