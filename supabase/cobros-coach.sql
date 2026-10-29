-- Cobros del coach: el coach anota cuánto le paga cada alumno propio (un monto y cada cuántos meses)
-- y los cobros que ya recibió (en efectivo, por transferencia u otro medio). GIZE le muestra quién
-- está al día, a quién se le venció la cuota y cuánto cobró en el mes.
-- SIN COBRO ONLINE: GIZE no cobra ni mueve plata; solo guarda lo que anota el coach.
-- Correr con el workflow "Supabase" → tarea sql → supabase/cobros-coach.sql, después de
-- supabase/suscripciones.sql, supabase/cupo-plan.sql, supabase/admin.sql y supabase/foto-perfil.sql
-- (los gimnasios son opcionales: anda con y sin sus tablas). Se puede correr varias veces.
-- Sin esos archivos falla entero, sin cambiar nada (lo primero del archivo lo controla).
--
-- Es aparte de las cuotas de los gimnasios (gimnasios-cuotas.sql) y no cambia ninguna tabla,
-- función ni política que ya exista. Copia sus reglas: el estado de la cuota (al día, por vencer
-- en 7 días o menos, vencida, sin pagos), qué período cubre cada cobro, el id que genera la app (un
-- reintento no anota dos) y anular en vez de borrar. Si cambia una regla allá, revisar acá.
--
-- Qué suma:
--   · coach_client_fees: la cuota de cada alumno (monto en pesos, cada cuántos meses y hasta cuándo
--     está paga). amount null = sin cuota (el vencimiento queda guardado).
--   · coach_client_payments: cada cobro que anotó el coach (monto, medio, fecha, qué período cubre y
--     una nota). No se borran: se anulan (con el motivo).
--   · app_config 'cobros': el interruptor por plataforma ({web, android, ios}). Nace con la web
--     prendida y las apps apagadas; volver a correr el archivo no lo pisa. Lo leen las funciones
--     (la política «config pública» sigue dejando leer solo 'version').
--   · Para la app: cobros_resumen, cobro_cuota_guardar, cobro_registrar, cobro_anular,
--     cobros_alumno, cobros_mes (el coach) y cobro_mi_cuota (el alumno).
--   · Para el Resumen de los lunes (service role): cobros_conteo.
--   · Para el admin: admin_cobros (el interruptor) y admin_cobros_estado (solo cantidades).
--
-- Quién puede:
--   · El coach (role 'coach'), con sus alumnos propios: los de profiles.coach_id que no son socios
--     de un gimnasio que él atiende como profe (esos pagan en Cuotas del gimnasio). Anotar y cambiar,
--     con el plan al día (coach_active); con el plan vencido lo anotado queda guardado y se puede
--     ver el mes (cobros_mes), pero no anotar nada nuevo.
--   · El alumno: su cuota y sus cobros sin anular (sin las notas del coach), solo del coach actual y
--     mientras el coach esté al día. En las apps de las tiendas la app muestra solo el estado y la fecha.
--   · Nadie lee ni escribe las tablas directo (RLS prendido, sin políticas ni permisos).
-- Si se borra la cuenta del alumno o la del coach, se borran su cuota y sus cobros. Si el alumno se
-- desvincula, el coach conserva lo anotado (sale de la lista, sus cobros siguen en el mes).
--
-- No tiene tareas programadas ni triggers: no cambia el cupo ni el orden de los bloqueos.
-- Usa coach_active (vigente: cupo-plan.sql, o gimnasios-vinculo.sql con los gimnasios) y, si están
-- los gimnasios, vinculo_gym (gimnasios.sql): si esas reglas cambian, Cobros las sigue sola.
--
-- Para volver atrás: el bloque comentado del final.


-- ===== Antes que nada: ¿están los archivos anteriores? =====

do $$ begin
  if to_regclass('public.profiles') is null or to_regclass('public.coach_billing') is null or to_regclass('public.app_config') is null
     or to_regprocedure('public.coach_active(uuid)') is null or to_regprocedure('public.admin_assert()') is null
     or to_regprocedure('public.admin_log(text, text, jsonb)') is null
     or not exists (select 1 from pg_attribute where attrelid = to_regclass('public.profiles') and attname = 'avatar_path' and not attisdropped) then
    raise exception 'Primero correr supabase/suscripciones.sql, supabase/cupo-plan.sql, supabase/admin.sql y supabase/foto-perfil.sql: este archivo usa sus tablas y funciones.';
  end if;
end $$;


-- ===== Tablas =====

-- La cuota de cada alumno: una por coach y alumno.
create table if not exists public.coach_client_fees (
  coach_id   uuid not null references public.profiles(id) on delete cascade,
  client_id  uuid not null references public.profiles(id) on delete cascade,
  amount     numeric(12,2),                       -- en pesos; null = sin cuota (el vencimiento queda)
  months     smallint not null default 1,         -- cada cuántos meses: 1, 2, 3, 6 o 12
  due_on     date,                                -- paga hasta este día, inclusive (null = sin cobros)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (coach_id, client_id)
);
alter table public.coach_client_fees drop constraint if exists coach_client_fees_amount_check;
alter table public.coach_client_fees add constraint coach_client_fees_amount_check check (amount is null or (amount > 0 and amount <= 99999999));
alter table public.coach_client_fees drop constraint if exists coach_client_fees_months_check;
alter table public.coach_client_fees add constraint coach_client_fees_months_check check (months in (1, 2, 3, 6, 12));
create index if not exists coach_client_fees_client_idx on public.coach_client_fees (client_id);

-- Cada cobro que anotó el coach.
create table if not exists public.coach_client_payments (
  id          uuid primary key,                     -- lo genera la app: un reintento no anota dos
  coach_id    uuid not null references public.profiles(id) on delete cascade,
  client_id   uuid not null references public.profiles(id) on delete cascade,
  amount      numeric(12,2) not null,
  method      text not null,
  paid_on     date not null,                        -- el día que le pagaron
  period_from date not null,                        -- qué cubre: desde
  period_to   date not null,                        --            hasta (el vencimiento nuevo)
  prev_due    date,                                 -- el vencimiento de antes (para anular)
  note        text,
  created_at  timestamptz not null default now(),
  voided_at   timestamptz,
  void_reason text
);
alter table public.coach_client_payments drop constraint if exists coach_client_payments_amount_check;
alter table public.coach_client_payments add constraint coach_client_payments_amount_check check (amount > 0 and amount <= 99999999);
alter table public.coach_client_payments drop constraint if exists coach_client_payments_method_check;
alter table public.coach_client_payments add constraint coach_client_payments_method_check check (method in ('efectivo', 'transferencia', 'otro'));
alter table public.coach_client_payments drop constraint if exists coach_client_payments_period_check;
alter table public.coach_client_payments add constraint coach_client_payments_period_check check (period_to > period_from);
alter table public.coach_client_payments drop constraint if exists coach_client_payments_text_check;
alter table public.coach_client_payments add constraint coach_client_payments_text_check check (char_length(coalesce(note, '')) <= 200
  and char_length(coalesce(void_reason, '')) <= 200);
create index if not exists coach_client_payments_mes_idx on public.coach_client_payments (coach_id, paid_on);
create index if not exists coach_client_payments_alumno_idx on public.coach_client_payments (coach_id, client_id, paid_on desc);
create index if not exists coach_client_payments_client_idx on public.coach_client_payments (client_id);
create index if not exists coach_client_payments_tope_idx on public.coach_client_payments (coach_id, created_at);

-- Nadie las lee ni las escribe directo: todo pasa por las funciones de abajo.
alter table public.coach_client_fees enable row level security;
alter table public.coach_client_payments enable row level security;
revoke all on public.coach_client_fees from anon, authenticated;
revoke all on public.coach_client_payments from anon, authenticated;


-- ===== El interruptor =====
-- Por plataforma: la app muestra Cobros (al coach y al alumno) solo donde está prendido. Se cambia
-- desde gize.ar/admin → Coaches y pagos (admin_cobros), al instante y sin build nuevo.

insert into public.app_config (key, value) values ('cobros', jsonb_build_object('web', true, 'android', false, 'ios', false))
  on conflict (key) do nothing;


-- ===== Ayudas (internas) =====

-- La fecha de hoy en Argentina (de 21 a 24 h, en UTC ya es mañana).
create or replace function public.cobro_hoy()
returns date language sql stable security definer set search_path = public as $$
  select (now() at time zone 'America/Argentina/Buenos_Aires')::date
$$;
revoke all on function public.cobro_hoy() from public, anon, authenticated;

-- El estado de la cuota: null (sin cuota), sin_pagos, vencida, por_vencer (vence en 7 días o menos)
-- o al_dia. El día del vencimiento todavía está al día (como gym_cuota_estado).
create or replace function public.cobro_estado(monto numeric, vence date)
returns text language plpgsql stable security definer set search_path = public as $$
declare hoy date := public.cobro_hoy();
begin
  if monto is null then return null; end if;
  if vence is null then return 'sin_pagos'; end if;
  if vence < hoy then return 'vencida'; end if;
  if vence <= hoy + 7 then return 'por_vencer'; end if;
  return 'al_dia';
end $$;
revoke all on function public.cobro_estado(numeric, date) from public, anon, authenticated;

-- ¿Lo atiende como profe de un gimnasio? Entonces paga en Cuotas del gimnasio, no acá. Sin las
-- tablas de los gimnasios, nunca: plpgsql no busca vinculo_gym hasta llegar a esa línea.
create or replace function public.cobro_de_gimnasio(alumno uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  if to_regprocedure('public.vinculo_gym(uuid)') is null then return false; end if;
  return public.vinculo_gym(alumno) is not null;
end $$;
revoke all on function public.cobro_de_gimnasio(uuid) from public, anon, authenticated;

-- ¿Es alumno propio de ese coach, y el coach está al día?
create or replace function public.cobro_es_alumno(coach uuid, alumno uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  if coach is null or alumno is null or not exists (select 1 from public.profiles x where x.id = alumno and x.coach_id = coach) then
    return false;
  end if;
  if public.cobro_de_gimnasio(alumno) then return false; end if;
  return public.coach_active(coach);
end $$;
revoke all on function public.cobro_es_alumno(uuid, uuid) from public, anon, authenticated;

-- El coach que llama. escribir: además, con el plan al día (sin nombrar el plan: el mensaje se ve
-- también en las apps de las tiendas).
create or replace function public.cobro_exigir(escribir boolean)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null or not exists (select 1 from public.profiles x where x.id = me and x.role = 'coach') then
    raise exception 'No tenés permiso para hacer esto.' using errcode = '42501';
  end if;
  if escribir and not public.coach_active(me) then
    raise exception 'Por ahora no podés anotar cobros.' using errcode = 'P0001';
  end if;
  return me;
end $$;
revoke all on function public.cobro_exigir(boolean) from public, anon, authenticated;

-- El interruptor, con todo apagado si no está.
create or replace function public.cobros_interruptor()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('web', false, 'android', false, 'ios', false)
         || coalesce((select c.value from public.app_config c where c.key = 'cobros' and jsonb_typeof(c.value) = 'object'), '{}'::jsonb)
$$;
revoke all on function public.cobros_interruptor() from public, anon, authenticated;


-- ===== El coach =====

-- La pantalla Cobros: cada alumno propio con su cuota, vencimiento y estado; cuántos hay en cada
-- estado; y el mes: lo cobrado (cobros sin anular con fecha de este mes, también de ex alumnos) y lo
-- que falta cobrar (la cuota de cada alumno sin cobros o que vence antes de fin de mes). Con el plan
-- vencido, solo {interruptor, activo: false}.
create or replace function public.cobros_resumen()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.cobro_exigir(false); hoy date := public.cobro_hoy(); ini date; fin date;
begin
  if not public.coach_active(me) then
    return jsonb_build_object('interruptor', public.cobros_interruptor(), 'activo', false);
  end if;
  ini := date_trunc('month', hoy)::date; fin := (ini + interval '1 month')::date;
  return (
    with al as (
      select x.id, x.full_name, x.avatar_path, f.amount, f.months, f.due_on, public.cobro_estado(f.amount, f.due_on) as e
        from public.profiles x left join public.coach_client_fees f on f.coach_id = me and f.client_id = x.id
       where x.coach_id = me and not public.cobro_de_gimnasio(x.id)),
    mes as (
      select y.amount from public.coach_client_payments y
       where y.coach_id = me and y.voided_at is null and y.paid_on >= ini and y.paid_on < fin)
    select jsonb_build_object('interruptor', public.cobros_interruptor(), 'activo', true, 'hoy', hoy, 'mes', ini,
      'alumnos', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'nombre', a.full_name, 'avatar_path', a.avatar_path,
             'cuota', case when a.amount is not null then jsonb_build_object('monto', a.amount, 'meses', a.months) end,
             'vence', a.due_on, 'estado', a.e,
             'ultimo_cobro', (select max(y.paid_on) from public.coach_client_payments y where y.coach_id = me and y.client_id = a.id and y.voided_at is null))
             order by lower(coalesce(a.full_name, '')), a.id) from al a), '[]'::jsonb),
      'cobrado', (select coalesce(sum(m.amount), 0) from mes m),
      'cobros_mes', (select count(*) from mes),
      'por_cobrar', (select coalesce(sum(a.amount), 0) from al a where a.amount is not null and (a.due_on is null or a.due_on < fin)),
      'alumnos_por_cobrar', (select count(*) from al a where a.amount is not null and (a.due_on is null or a.due_on < fin)),
      'conteo', (select jsonb_build_object('al_dia', count(*) filter (where a.e = 'al_dia'), 'por_vencer', count(*) filter (where a.e = 'por_vencer'),
                   'vencida', count(*) filter (where a.e = 'vencida'), 'sin_pagos', count(*) filter (where a.e = 'sin_pagos'),
                   'sin_cuota', count(*) filter (where a.e is null)) from al a)));
end $$;
revoke all on function public.cobros_resumen() from public, anon;
grant execute on function public.cobros_resumen() to authenticated;

-- Cargar o cambiar la cuota de uno o varios alumnos (todos propios: si uno no lo es, no cambia nada).
-- monto null saca la cuota y deja el vencimiento. vence (opcional): hasta cuándo ya está paga, para
-- los alumnos que pagaron antes de usar Cobros.
create or replace function public.cobro_cuota_guardar(alumnos uuid[], monto numeric, meses int, vence date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := public.cobro_exigir(true); hoy date := public.cobro_hoy(); a uuid; n int := 0;
begin
  if alumnos is null or cardinality(alumnos) = 0 or cardinality(alumnos) > 500 or array_position(alumnos, null) is not null then
    raise exception 'Elegí entre 1 y 500 alumnos.' using errcode = 'P0001';
  end if;
  if monto is not null and (monto <= 0 or monto > 99999999 or monto <> round(monto, 2)) then
    raise exception 'Revisá el monto: en pesos, sin puntos de miles.' using errcode = 'P0001';
  end if;
  if monto is not null and (meses is null or meses not in (1, 2, 3, 6, 12)) then
    raise exception 'Elegí cada cuánto te paga: 1, 2, 3, 6 o 12 meses.' using errcode = 'P0001';
  end if;
  if vence is not null and (monto is null or vence < hoy - 366 or vence > hoy + 400) then
    raise exception 'Revisá la fecha: hasta cuándo ya está paga.' using errcode = 'P0001';
  end if;
  -- En orden de id, así dos cargas a la vez no se traban.
  for a in select distinct x from unnest(alumnos) x order by x loop
    if not public.cobro_es_alumno(me, a) then
      raise exception 'Alguno de esos alumnos ya no está vinculado con vos (o paga la cuota en su gimnasio): no se cambió nada.' using errcode = 'P0001';
    end if;
    if monto is null then
      update public.coach_client_fees set amount = null, updated_at = now() where coach_id = me and client_id = a;
    else
      insert into public.coach_client_fees (coach_id, client_id, amount, months, due_on) values (me, a, monto, meses, vence)
        on conflict (coach_id, client_id) do update set amount = excluded.amount, months = excluded.months,
          due_on = coalesce(excluded.due_on, coach_client_fees.due_on), updated_at = now();
    end if;
    n := n + 1;
  end loop;
  return jsonb_build_object('ok', n);
end $$;
revoke all on function public.cobro_cuota_guardar(uuid[], numeric, int, date) from public, anon;
grant execute on function public.cobro_cuota_guardar(uuid[], numeric, int, date) to authenticated;

-- Anotar un cobro. id lo genera la app: el mismo id otra vez devuelve lo mismo, sin anotar otro.
-- Cubre desde el vencimiento de antes si todavía no pasó (o desde el día que pagó, si estaba vencida
-- o sin cobros) y por los meses de su cuota; hasta (opcional) lo cambia. El vencimiento nuevo es hasta.
create or replace function public.cobro_registrar(id uuid, alumno uuid, monto numeric, medio text, fecha date, hasta date, nota text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := public.cobro_exigir(true); hoy date := public.cobro_hoy(); dia date := coalesce(fecha, public.cobro_hoy());
        c record; p record; desde date; fin date; nt text := nullif(btrim(coalesce(nota, '')), '');
begin
  if cobro_registrar.id is null or alumno is null then raise exception 'Faltan datos del cobro.' using errcode = 'P0001'; end if;
  -- Primero la fila de la cuota, bloqueada: dos toques a la vez con el mismo id esperan acá y el
  -- segundo ya ve el cobro del primero.
  select f.* into c from public.coach_client_fees f where f.coach_id = me and f.client_id = alumno for update;
  select x.* into p from public.coach_client_payments x where x.id = cobro_registrar.id;
  if p.id is not null then
    if p.coach_id <> me then raise exception 'No tenés permiso para hacer esto.' using errcode = '42501'; end if;
    return jsonb_build_object('id', p.id, 'desde', p.period_from, 'hasta', p.period_to, 'repetido', true);
  end if;
  if not public.cobro_es_alumno(me, alumno) then
    raise exception 'Ese alumno ya no está vinculado con vos (o paga la cuota en su gimnasio).' using errcode = 'P0001';
  end if;
  if c.amount is null then raise exception 'Primero cargale la cuota (cuánto te paga).' using errcode = 'P0001'; end if;
  if monto is null or monto <= 0 or monto > 99999999 or monto <> round(monto, 2) then
    raise exception 'Revisá el monto: en pesos, sin puntos de miles.' using errcode = 'P0001';
  end if;
  if medio is null or medio not in ('efectivo', 'transferencia', 'otro') then
    raise exception 'Elegí cómo te pagó: efectivo, transferencia u otro.' using errcode = 'P0001';
  end if;
  if dia > hoy or dia < hoy - 366 then
    raise exception 'Revisá la fecha del cobro: no puede ser futura ni de hace más de un año.' using errcode = 'P0001';
  end if;
  if char_length(coalesce(nt, '')) > 200 then raise exception 'La nota es muy larga (hasta 200 letras).' using errcode = 'P0001'; end if;
  if (select count(*) from public.coach_client_payments x where x.coach_id = me and x.created_at > now() - interval '24 hours') >= 1000 then
    raise exception 'Anotaste muchos cobros hoy: seguí mañana.' using errcode = 'P0001';
  end if;
  desde := case when c.due_on is not null and c.due_on >= dia then c.due_on else dia end;
  if hasta is not null and hasta <= desde then desde := dia; end if;
  fin := coalesce(hasta, (desde + make_interval(months => c.months))::date);
  if fin <= dia or fin > dia + 400 then
    raise exception 'Revisá hasta cuándo cubre: después del día que te pagó y dentro de un año.' using errcode = 'P0001';
  end if;
  begin
    insert into public.coach_client_payments (id, coach_id, client_id, amount, method, paid_on, period_from, period_to, prev_due, note)
    values (cobro_registrar.id, me, alumno, monto, medio, dia, desde, fin, c.due_on, nt);
  exception when unique_violation then
    -- El mismo id llegó a la vez por otro lado (otro alumno): se contesta como repetido.
    select x.* into p from public.coach_client_payments x where x.id = cobro_registrar.id;
    if p.coach_id is distinct from me then raise exception 'No tenés permiso para hacer esto.' using errcode = '42501'; end if;
    return jsonb_build_object('id', p.id, 'desde', p.period_from, 'hasta', p.period_to, 'repetido', true);
  end;
  update public.coach_client_fees set due_on = fin, updated_at = now() where coach_id = me and client_id = alumno;
  return jsonb_build_object('id', cobro_registrar.id, 'desde', desde, 'hasta', fin, 'repetido', false);
end $$;
revoke all on function public.cobro_registrar(uuid, uuid, numeric, text, date, date, text) from public, anon;
grant execute on function public.cobro_registrar(uuid, uuid, numeric, text, date, date, text) to authenticated;

-- Anular un cobro anotado por error. Queda en el historial, tachado. Si era el que puso el
-- vencimiento de ahora, el vencimiento vuelve al de antes.
create or replace function public.cobro_anular(id uuid, motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := public.cobro_exigir(true); p record; c record; mot text := nullif(left(btrim(coalesce(motivo, '')), 200), '');
begin
  select x.* into p from public.coach_client_payments x where x.id = cobro_anular.id and x.coach_id = me;
  if p.id is null then raise exception 'No encontramos ese cobro.' using errcode = 'P0001'; end if;
  select f.* into c from public.coach_client_fees f where f.coach_id = me and f.client_id = p.client_id for update;
  select x.* into p from public.coach_client_payments x where x.id = p.id for update;
  if p.voided_at is not null then raise exception 'Ese cobro ya está anulado.' using errcode = 'P0001'; end if;
  update public.coach_client_payments set voided_at = now(), void_reason = mot where coach_client_payments.id = p.id;
  if c.due_on is not distinct from p.period_to
     and not exists (select 1 from public.coach_client_payments x where x.coach_id = me and x.client_id = p.client_id
                      and x.voided_at is null and x.period_to = p.period_to) then
    update public.coach_client_fees set due_on = p.prev_due, updated_at = now() where coach_id = me and client_id = p.client_id;
  end if;
  return jsonb_build_object('ok', true, 'vence', (select f.due_on from public.coach_client_fees f where f.coach_id = me and f.client_id = p.client_id));
end $$;
revoke all on function public.cobro_anular(uuid, text) from public, anon;
grant execute on function public.cobro_anular(uuid, text) to authenticated;

-- La cuota y los cobros de un alumno propio (los últimos 60, con los anulados): la tarjeta «Cuota»
-- de su ficha.
create or replace function public.cobros_alumno(alumno uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.cobro_exigir(true); c record;
begin
  if not public.cobro_es_alumno(me, alumno) then
    raise exception 'Ese alumno ya no está vinculado con vos (o paga la cuota en su gimnasio).' using errcode = 'P0001';
  end if;
  select f.* into c from public.coach_client_fees f where f.coach_id = me and f.client_id = alumno;
  return jsonb_build_object('alumno', alumno,
    'cuota', case when c.amount is not null then jsonb_build_object('monto', c.amount, 'meses', c.months) end,
    'vence', c.due_on, 'estado', public.cobro_estado(c.amount, c.due_on),
    'cobros', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'fecha', x.paid_on, 'monto', x.amount, 'medio', x.method,
                 'desde', x.period_from, 'hasta', x.period_to, 'nota', x.note, 'cargado', x.created_at,
                 'anulado', x.voided_at, 'motivo', x.void_reason) order by x.paid_on desc, x.created_at desc)
        from (select y.* from public.coach_client_payments y where y.coach_id = me and y.client_id = alumno
               order by y.paid_on desc, y.created_at desc limit 60) x), '[]'::jsonb));
end $$;
revoke all on function public.cobros_alumno(uuid) from public, anon;
grant execute on function public.cobros_alumno(uuid) to authenticated;

-- Los cobros de un mes (para «Cobros del mes» y el CSV). mes: cualquier día del mes (null: este).
-- Con los anulados y los de ex alumnos, marcados. Anda siempre, aunque venza el plan.
create or replace function public.cobros_mes(mes date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.cobro_exigir(false); ini date := date_trunc('month', coalesce(mes, public.cobro_hoy()))::date; fin date;
begin
  fin := (ini + interval '1 month')::date;
  return coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'fecha', x.paid_on, 'alumno', x.client_id, 'nombre', u.full_name,
           'monto', x.amount, 'medio', x.method, 'desde', x.period_from, 'hasta', x.period_to, 'nota', x.note,
           'anulado', x.voided_at, 'motivo', x.void_reason,
           'ex_alumno', u.coach_id is distinct from me or public.cobro_de_gimnasio(x.client_id))
           order by x.paid_on desc, x.created_at desc)
    from (select y.* from public.coach_client_payments y where y.coach_id = me and y.paid_on >= ini and y.paid_on < fin
           order by y.paid_on desc, y.created_at desc limit 2000) x
    join public.profiles u on u.id = x.client_id), '[]'::jsonb);
end $$;
revoke all on function public.cobros_mes(date) from public, anon;
grant execute on function public.cobros_mes(date) to authenticated;


-- ===== El alumno =====

-- Su cuota con el coach actual: el estado, hasta cuándo está paga, el monto y sus cobros (los
-- últimos 24, sin los anulados y sin las notas del coach). null si no tiene coach, si su coach lo
-- atiende como profe de un gimnasio, si el coach no está al día o si no tiene cuota.
create or replace function public.cobro_mi_cuota()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); co uuid; c record;
begin
  select x.coach_id into co from public.profiles x where x.id = me;
  if co is null or not public.cobro_es_alumno(co, me) then return null; end if;
  select f.* into c from public.coach_client_fees f where f.coach_id = co and f.client_id = me;
  if c.amount is null then return null; end if;
  return jsonb_build_object('interruptor', public.cobros_interruptor(), 'estado', public.cobro_estado(c.amount, c.due_on), 'vence', c.due_on,
    'cuota', jsonb_build_object('monto', c.amount, 'meses', c.months),
    'pagos', coalesce((select jsonb_agg(jsonb_build_object('fecha', x.paid_on, 'monto', x.amount, 'medio', x.method, 'hasta', x.period_to)
                         order by x.paid_on desc, x.created_at desc)
        from (select y.* from public.coach_client_payments y where y.coach_id = co and y.client_id = me and y.voided_at is null
               order by y.paid_on desc, y.created_at desc limit 24) x), '[]'::jsonb));
end $$;
revoke all on function public.cobro_mi_cuota() from public, anon;
grant execute on function public.cobro_mi_cuota() to authenticated;


-- ===== Para el Resumen de los lunes (service role) =====

-- Cuántos alumnos propios hay en cada estado, las vencidas (hasta 5, las más viejas primero) y lo
-- cobrado en el mes. Con la misma regla del estado que la pantalla, para no repetirla.
create or replace function public.cobros_conteo(p_coach uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare hoy date := public.cobro_hoy(); ini date; fin date;
begin
  ini := date_trunc('month', hoy)::date; fin := (ini + interval '1 month')::date;
  return (
    with al as (
      select x.full_name, f.due_on, public.cobro_estado(f.amount, f.due_on) as e
        from public.profiles x left join public.coach_client_fees f on f.coach_id = p_coach and f.client_id = x.id
       where x.coach_id = p_coach and not public.cobro_de_gimnasio(x.id))
    select jsonb_build_object('activo', public.coach_active(p_coach),
      'al_dia', (select count(*) from al where e = 'al_dia'), 'por_vencer', (select count(*) from al where e = 'por_vencer'),
      'vencida', (select count(*) from al where e = 'vencida'), 'sin_pagos', (select count(*) from al where e = 'sin_pagos'),
      'sin_cuota', (select count(*) from al where e is null),
      'vencidas', coalesce((select jsonb_agg(jsonb_build_object('nombre', v.full_name, 'vence', v.due_on) order by v.due_on, v.full_name)
                              from (select * from al where e = 'vencida' order by due_on, full_name limit 5) v), '[]'::jsonb),
      'cobrado_mes', (select coalesce(sum(y.amount), 0) from public.coach_client_payments y
                       where y.coach_id = p_coach and y.voided_at is null and y.paid_on >= ini and y.paid_on < fin)));
end $$;
revoke all on function public.cobros_conteo(uuid) from public, anon, authenticated;
grant execute on function public.cobros_conteo(uuid) to service_role;


-- ===== El admin =====

-- Prender o apagar Cobros en una plataforma: solo las claves web, android e ios, con true o false.
-- Mezcla con lo que había y queda en el registro de acciones.
create or replace function public.admin_cobros(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare antes jsonb; nuevo jsonb;
begin
  perform public.admin_assert();
  if p is null or jsonb_typeof(p) <> 'object' or p = '{}'::jsonb then
    raise exception 'Revisá el interruptor: web, android o ios, con true o false.' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_each(p) e where e.key not in ('web', 'android', 'ios') or jsonb_typeof(e.value) <> 'boolean') then
    raise exception 'Revisá el interruptor: web, android o ios, con true o false.' using errcode = 'P0001';
  end if;
  antes := public.cobros_interruptor();
  nuevo := antes || p;
  insert into public.app_config (key, value, updated_at) values ('cobros', nuevo, now())
    on conflict (key) do update set value = excluded.value, updated_at = now();
  perform public.admin_log('cobros', 'cobros', jsonb_build_object('antes', antes, 'ahora', nuevo));
  return nuevo;
end $$;
revoke all on function public.admin_cobros(jsonb) from public, anon;
grant execute on function public.admin_cobros(jsonb) to authenticated;

-- Cuántos coaches y alumnos lo usan (con una cuota cargada) y cuántos cobros hay este mes. Solo
-- cantidades: sin montos ni nombres.
create or replace function public.admin_cobros_estado()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare ini date;
begin
  perform public.admin_assert();
  ini := date_trunc('month', public.cobro_hoy())::date;
  return jsonb_build_object('interruptor', public.cobros_interruptor(),
    'coaches', (select count(distinct f.coach_id) from public.coach_client_fees f where f.amount is not null),
    'alumnos', (select count(*) from public.coach_client_fees f where f.amount is not null),
    'cobros_mes', (select count(*) from public.coach_client_payments y
                    where y.voided_at is null and y.paid_on >= ini and y.paid_on < (ini + interval '1 month')::date));
end $$;
revoke all on function public.admin_cobros_estado() from public, anon;
grant execute on function public.admin_cobros_estado() to authenticated;

notify pgrst, 'reload schema';


-- ===== Para volver atrás =====
-- Correr esto sin los «-- ». Se borran las funciones, las cuotas y los cobros anotados y el
-- interruptor. Antes, que cada coach baje su CSV desde la web (Cobros → Cobros del mes): se borran.
--
-- drop function if exists public.admin_cobros_estado(), public.admin_cobros(jsonb), public.cobros_conteo(uuid),
--   public.cobro_mi_cuota(), public.cobros_mes(date), public.cobros_alumno(uuid), public.cobro_anular(uuid, text),
--   public.cobro_registrar(uuid, uuid, numeric, text, date, date, text), public.cobro_cuota_guardar(uuid[], numeric, int, date),
--   public.cobros_resumen(), public.cobros_interruptor(), public.cobro_exigir(boolean), public.cobro_es_alumno(uuid, uuid),
--   public.cobro_de_gimnasio(uuid), public.cobro_estado(numeric, date), public.cobro_hoy();
-- drop table if exists public.coach_client_payments;
-- drop table if exists public.coach_client_fees;
-- delete from public.app_config where key = 'cobros';
-- notify pgrst, 'reload schema';
