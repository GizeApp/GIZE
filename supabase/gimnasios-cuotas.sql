-- Gimnasios, etapa 2: cuotas. El gimnasio arma sus tipos de cuota, le asigna una a cada socio y anota
-- los pagos que recibe en el mostrador (efectivo, transferencia u otro). SIN COBRO ONLINE: GIZE no
-- cobra ni mueve plata; solo guarda lo que el gimnasio ya cobró.
-- Correr con el workflow "Supabase" → tarea sql → supabase/gimnasios-cuotas.sql, después de supabase/gimnasios.sql, supabase/gimnasios-vinculo.sql, supabase/gimnasios-lectura.sql, supabase/gimnasios-socios.sql y supabase/gimnasios-admin.sql. Se puede correr varias veces.
-- Sin esos archivos falla entero, sin cambiar nada (lo primero del archivo lo controla).
--
-- SIN CUOTAS TODO SIGUE IGUAL: mientras el gimnasio no le asigne una cuota a un socio, el semáforo de
-- la recepción y el ingreso dan exactamente lo mismo que en la etapa 1.
--
-- OJO: acá están las versiones vigentes de gym_semaforo y gym_ingreso_manual (antes en
-- gimnasios-socios.sql). Si volvés a correr gimnasios-socios.sql, corré después este.
--
-- Qué suma:
--   · gym_fee_types: los tipos de cuota de cada gimnasio (nombre, monto en pesos y cada cuántos meses:
--     1, 2, 3, 6 o 12). No se borran: se archivan (los socios que la tienen la conservan).
--   · gym_members.fee_due: hasta cuándo está paga la cuota del socio (el día que vence). La clave
--     foránea de gym_members.fee_type_id (la columna ya estaba desde la etapa 0).
--   · gym_payments: cada pago que anotó el gimnasio (monto, medio, fecha, qué período cubre, quién lo
--     cargó y una nota). El id lo genera la app: tocar dos veces o reintentar sin señal no anota dos.
--     No se borran: se anulan (queda quién y por qué). Se van con la ficha o con el gimnasio.
--   · Estado de la cuota de cada socio: al_dia, por_vencer (vence en 7 días o menos), vencida, sin_pagos
--     (tiene cuota y ningún pago cargado) o sin cuota (null).
--   · gym_semaforo: con cuota, el semáforo de la recepción sale de ella («Cuota vencida el 20/10»,
--     «Al día hasta el 25/11»), con la misma forma ({semaforo, motivo, apto_vencido}). Nunca montos.
--   · gym_ingreso_manual: con la cuota vencida, el ingreso queda como 'cuota_vencida' (avisa en la
--     recepción). Si el gimnasio prendió «No dejar entrar con la cuota vencida» (settings.cuota_bloquea),
--     no lo anota y contesta {bloqueado: true}.
--   · RPC: gym_cuotas_tipos, gym_cuota_tipo_guardar, gym_cuota_tipo_archivar, gym_cuota_asignar,
--     gym_pago_registrar, gym_pago_anular, gym_pagos_ficha, gym_cuotas_resumen, gym_pagos_mes,
--     gym_cuotas_bloquear (dueño y administración) y gym_mi_cuota (el socio).
--
-- Quién puede (los roles de la etapa 1):
--   · Dueño y administración: todo (tipos, asignar, cobrar, anular, el resumen del mes y exportar).
--   · Recepción: cobra y ve el historial de un socio solo si el gimnasio prendió «La recepción registra
--     pagos» (settings.recepcion_cobra). Sin eso, ve en el semáforo si la cuota está al día y nada más.
--   · Profes: ven en el semáforo si la cuota está al día (gym_ficha_profe y la recepción), sin montos.
--   · El socio: su cuota, cuándo vence y sus pagos (gym_mi_cuota). En las apps de las tiendas la app
--     muestra solo si está al día y la fecha.
-- Nadie lee las tablas nuevas directo salvo dueño y administración (por política); el resto, por
-- funciones. Cobrar y cambiar algo anda mientras el gimnasio esté operativo (hasta 10 días después de
-- vencido el plan, como la recepción); leer y exportar, siempre.
-- Cada cambio queda en gym_audit (la persona real; montos sí, datos de salud nunca).
--
-- Para volver atrás: el bloque comentado del final (después del de gimnasios-clases.sql y antes que
-- el de gimnasios-admin.sql y el de gimnasios-socios.sql).


-- ===== Antes que nada: ¿están los archivos anteriores? =====

do $$ begin
  if to_regclass('public.gym_members') is null or to_regprocedure('public.gym_semaforo(uuid)') is null
     or to_regprocedure('public.gym_ingreso_manual(uuid, uuid)') is null or to_regprocedure('public.gym_exigir(text[])') is null
     or to_regprocedure('public.gym_auditar(uuid, text, uuid, uuid, jsonb)') is null then
    raise exception 'Primero correr supabase/gimnasios.sql, supabase/gimnasios-vinculo.sql, supabase/gimnasios-lectura.sql, supabase/gimnasios-socios.sql y supabase/gimnasios-admin.sql: este archivo usa sus tablas y funciones.';
  end if;
end $$;


-- ===== Tablas =====

create table if not exists public.gym_fee_types (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  name        text not null,
  amount      numeric(12,2) not null,              -- en pesos
  months      smallint not null,                   -- cada cuántos meses: 1, 2, 3, 6 o 12
  archived_at timestamptz,                         -- archivada: no se asigna más (quien la tiene, la conserva)
  created_by  uuid,
  created_at  timestamptz not null default now()
);
alter table public.gym_fee_types drop constraint if exists gym_fee_types_name_check;
alter table public.gym_fee_types add constraint gym_fee_types_name_check check (char_length(name) between 2 and 60);
alter table public.gym_fee_types drop constraint if exists gym_fee_types_amount_check;
alter table public.gym_fee_types add constraint gym_fee_types_amount_check check (amount >= 0);
alter table public.gym_fee_types drop constraint if exists gym_fee_types_months_check;
alter table public.gym_fee_types add constraint gym_fee_types_months_check check (months in (1, 2, 3, 6, 12));
create unique index if not exists gym_fee_types_nombre on public.gym_fee_types(gym_id, lower(name)) where archived_at is null;
create index if not exists gym_fee_types_gym_idx on public.gym_fee_types(gym_id);

alter table public.gym_members add column if not exists fee_due date;   -- la cuota está paga hasta este día
alter table public.gym_members drop constraint if exists gym_members_fee_type_fk;
alter table public.gym_members add constraint gym_members_fee_type_fk foreign key (fee_type_id) references public.gym_fee_types(id) on delete set null;
create index if not exists gym_members_fee_type_idx on public.gym_members(fee_type_id) where fee_type_id is not null;

-- Sin clave foránea a gym_fee_types: el pago guarda el nombre de la cuota de ese momento.
create table if not exists public.gym_payments (
  id            uuid primary key,                  -- lo genera la app: un reintento no anota dos
  gym_id        uuid not null references public.gyms(id) on delete cascade,
  gym_member_id uuid not null references public.gym_members(id) on delete cascade,
  fee_type_id   uuid,
  fee_name      text,
  amount        numeric(12,2) not null,
  method        text not null,
  paid_on       date not null,                     -- el día que pagó
  period_from   date not null,                     -- qué cubre: desde
  period_to     date not null,                     --            hasta (el vencimiento nuevo)
  prev_due      date,                              -- el vencimiento de antes (para anular)
  note          text,
  by_user       uuid,                              -- quién lo cargó (sin clave foránea)
  created_at    timestamptz not null default now(),
  voided_at     timestamptz,
  voided_by     uuid,
  void_reason   text
);
alter table public.gym_payments drop constraint if exists gym_payments_amount_check;
alter table public.gym_payments add constraint gym_payments_amount_check check (amount > 0);
alter table public.gym_payments drop constraint if exists gym_payments_method_check;
alter table public.gym_payments add constraint gym_payments_method_check check (method in ('efectivo', 'transferencia', 'otro'));
alter table public.gym_payments drop constraint if exists gym_payments_period_check;
alter table public.gym_payments add constraint gym_payments_period_check check (period_to > period_from);
alter table public.gym_payments drop constraint if exists gym_payments_text_check;
alter table public.gym_payments add constraint gym_payments_text_check check (char_length(coalesce(note, '')) <= 200
  and char_length(coalesce(void_reason, '')) <= 200 and char_length(coalesce(fee_name, '')) <= 60);
alter table public.gym_payments drop constraint if exists gym_payments_void_check;
alter table public.gym_payments add constraint gym_payments_void_check check ((voided_at is null) = (voided_by is null));
create index if not exists gym_payments_member_idx on public.gym_payments(gym_member_id, paid_on desc);
create index if not exists gym_payments_gym_idx on public.gym_payments(gym_id, paid_on);


-- ===== RLS: solo lectura, dueño y administración =====

alter table public.gym_fee_types enable row level security;
revoke all on public.gym_fee_types from anon, authenticated;
grant select on public.gym_fee_types to authenticated;
drop policy if exists "cuotas: dueño y administración" on public.gym_fee_types;
create policy "cuotas: dueño y administración" on public.gym_fee_types
  for select to authenticated using (public.gym_mi_rol(gym_id) in ('owner', 'admin'));

alter table public.gym_payments enable row level security;
revoke all on public.gym_payments from anon, authenticated;
grant select on public.gym_payments to authenticated;
drop policy if exists "pagos: dueño y administración" on public.gym_payments;
create policy "pagos: dueño y administración" on public.gym_payments
  for select to authenticated using (public.gym_mi_rol(gym_id) in ('owner', 'admin'));


-- ===== Ayudas (internas) =====

-- El estado de la cuota: null (sin cuota), sin_pagos, vencida, por_vencer (vence en 7 días o menos)
-- o al_dia. El día del vencimiento todavía está al día.
create or replace function public.gym_cuota_estado(tipo uuid, vence date)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare hoy date := public.gym_hoy();
begin
  if tipo is null then return null; end if;
  if vence is null then return 'sin_pagos'; end if;
  if vence < hoy then return 'vencida'; end if;
  if vence <= hoy + 7 then return 'por_vencer'; end if;
  return 'al_dia';
end $$;
revoke all on function public.gym_cuota_estado(uuid, date) from public, anon, authenticated;

-- El tipo de cuota en JSON (con el monto: solo para quien puede verlo).
create or replace function public.gym_cuota_json(tipo uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return (select jsonb_build_object('id', c.id, 'name', c.name, 'amount', c.amount, 'months', c.months, 'archivada', c.archived_at is not null)
            from public.gym_fee_types c where c.id = tipo);
end $$;
revoke all on function public.gym_cuota_json(uuid) from public, anon, authenticated;

-- Cobrar y ver los pagos de un socio: dueño y administración, y la recepción si el gimnasio la deja
-- («La recepción registra pagos»). escribir: además, que el gimnasio esté operativo.
create or replace function public.gym_exigir_cobro(escribir boolean)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare s record;
begin
  select * into s from public.gym_mi_staff();
  if s.g is null or not (s.rol in ('owner', 'admin')
                         or (s.rol = 'recepcion' and coalesce((public.gym_settings(s.g)->>'recepcion_cobra')::boolean, false))) then
    raise exception 'No tenés permiso para hacer esto en el gimnasio.' using errcode = '42501';
  end if;
  if escribir and not public.gym_operativo(s.g) then
    raise exception 'Las cuotas están pausadas: hablá con la administración del gimnasio.' using errcode = 'P0001';
  end if;
  return s.g;
end $$;
revoke all on function public.gym_exigir_cobro(boolean) from public, anon, authenticated;

-- Cambiar los tipos, asignar y anular: dueño y administración, con el gimnasio operativo.
create or replace function public.gym_exigir_cuotas()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare g uuid := public.gym_exigir(array['owner', 'admin']);
begin
  if not public.gym_operativo(g) then
    raise exception 'Las cuotas están pausadas en este momento.' using errcode = 'P0001';
  end if;
  return g;
end $$;
revoke all on function public.gym_exigir_cuotas() from public, anon, authenticated;


-- ===== Semáforo e ingreso (versiones vigentes: antes en gimnasios-socios.sql) =====

-- Semáforo de la recepción: sale del estado de la ficha y, si el socio activo tiene cuota, de la
-- cuota. Misma forma que en la etapa 1 ({semaforo, motivo, apto_vencido}), sin montos.
create or replace function public.gym_semaforo(fid uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare m record; c text; hoy date := public.gym_hoy();
begin
  select x.status, x.paused_until, x.apto_medico_vence, x.fee_type_id, x.fee_due into m from public.gym_members x where x.id = fid;
  c := case when m.status = 'activo' then public.gym_cuota_estado(m.fee_type_id, m.fee_due) end;
  return jsonb_build_object(
    'semaforo', case when c = 'vencida' then 'rojo' when c in ('por_vencer', 'sin_pagos') then 'ambar'
                     else case m.status when 'activo' then 'verde' when 'pausado' then 'ambar' when 'pendiente' then 'ambar'
                                        when 'baja' then 'rojo' else 'gris' end end,
    'motivo', case c when 'vencida' then 'Cuota vencida el ' || to_char(m.fee_due, 'DD/MM')
                     when 'por_vencer' then case when m.fee_due = hoy then 'La cuota vence hoy' else 'La cuota vence el ' || to_char(m.fee_due, 'DD/MM') end
                     when 'sin_pagos' then 'Cuota sin pagos cargados'
                     when 'al_dia' then 'Al día hasta el ' || to_char(m.fee_due, 'DD/MM')
                     else case m.status when 'activo' then 'Activo'
                                        when 'pausado' then 'Pausado' || coalesce(' hasta el ' || to_char(m.paused_until, 'DD/MM'), '')
                                        when 'pendiente' then 'Pidió sumarse' when 'baja' then 'De baja' else 'No es socio' end end,
    'apto_vencido', m.apto_medico_vence is not null and m.apto_medico_vence < hoy);
end $$;
revoke all on function public.gym_semaforo(uuid) from public, anon, authenticated;

-- Registrar un ingreso a mano. id lo genera la app: un reintento con el mismo id devuelve lo mismo y
-- no duplica. Si ya entró en las últimas ingreso_horas (3 por defecto), no anota otro: repetido.
-- Con la cuota vencida (socio activo): se anota como 'cuota_vencida' y la recepción lo ve; si el
-- gimnasio eligió no dejar entrar (cuota_bloquea), no se anota: {bloqueado: true, vence}.
create or replace function public.gym_ingreso_manual(id uuid, ficha uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare g uuid := public.gym_exigir_recepcion(); e record; f record; horas int; res text;
begin
  if id is null or ficha is null then raise exception 'Faltan datos del ingreso.' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext('gym_ingreso'), hashtext(ficha::text));
  select x.* into e from public.gym_entries x where x.id = gym_ingreso_manual.id;
  if e.id is not null then
    if e.gym_id <> g then raise exception 'No tenés permiso para hacer esto en el gimnasio.' using errcode = '42501'; end if;
    return jsonb_build_object('id', e.id, 'result', e.result, 'repetido', false, 'at', e.at);
  end if;
  select m.id, m.status, m.member_id, m.fee_type_id, m.fee_due into f from public.gym_members m where m.id = ficha and m.gym_id = g;
  if f.id is null then raise exception 'No encontramos esa ficha.' using errcode = 'P0001'; end if;
  horas := coalesce((public.gym_settings(g)->>'ingreso_horas')::int, 3);
  select x.* into e from public.gym_entries x where x.gym_member_id = f.id and x.at > now() - make_interval(hours => horas)
   order by x.at desc limit 1;
  if e.id is not null then
    return jsonb_build_object('id', e.id, 'result', e.result, 'repetido', true, 'at', e.at);
  end if;
  res := case f.status when 'activo' then 'ok' when 'pausado' then 'pausado' when 'visita' then 'visita' when 'baja' then 'baja' else 'rechazado' end;
  if res = 'ok' and public.gym_cuota_estado(f.fee_type_id, f.fee_due) = 'vencida' then
    res := 'cuota_vencida';
    if coalesce((public.gym_settings(g)->>'cuota_bloquea')::boolean, false) then
      perform public.gym_auditar(g, 'ingreso_bloqueado', f.id, f.member_id, jsonb_build_object('vence', f.fee_due));
      return jsonb_build_object('id', null, 'result', res, 'bloqueado', true, 'repetido', false, 'vence', f.fee_due, 'at', now());
    end if;
  end if;
  insert into public.gym_entries (id, gym_id, gym_member_id, at, method, by_user, result)
  values (gym_ingreso_manual.id, g, f.id, now(), 'manual', auth.uid(), res);
  perform public.gym_auditar(g, 'ingreso_manual', f.id, f.member_id, jsonb_build_object('result', res));
  return jsonb_build_object('id', gym_ingreso_manual.id, 'result', res, 'repetido', false, 'at', now());
end $$;
revoke all on function public.gym_ingreso_manual(uuid, uuid) from public, anon;
grant execute on function public.gym_ingreso_manual(uuid, uuid) to authenticated;


-- ===== Tipos de cuota =====

-- Los tipos de cuota del gimnasio (con cuántos socios la tienen). Dueño, administración y la recepción
-- que cobra (para elegir al cobrar). Las archivadas van al final.
create or replace function public.gym_cuotas_tipos()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare g uuid := public.gym_exigir_cobro(false);
begin
  return coalesce((select jsonb_agg(public.gym_cuota_json(c.id) || jsonb_build_object('socios',
           (select count(*) from public.gym_members m where m.fee_type_id = c.id and m.status in ('activo', 'pausado', 'visita')))
           order by c.archived_at is not null, c.months, c.name)
    from public.gym_fee_types c where c.gym_id = g), '[]'::jsonb);
end $$;
revoke all on function public.gym_cuotas_tipos() from public, anon;
grant execute on function public.gym_cuotas_tipos() to authenticated;

-- Crear (id null) o cambiar un tipo de cuota. Cambiar el monto no toca los pagos ya cargados.
create or replace function public.gym_cuota_tipo_guardar(id uuid, nombre text, monto numeric, meses int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare g uuid := public.gym_exigir_cuotas(); n text := btrim(coalesce(nombre, '')); c record; nuevo uuid;
begin
  if char_length(n) not between 2 and 60 then
    raise exception 'El nombre de la cuota tiene que tener entre 2 y 60 letras.' using errcode = 'P0001';
  end if;
  if monto is null or monto < 0 or monto > 99999999 or monto <> round(monto, 2) then
    raise exception 'Revisá el monto: en pesos, sin puntos de miles.' using errcode = 'P0001';
  end if;
  if meses is null or meses not in (1, 2, 3, 6, 12) then
    raise exception 'Elegí cada cuánto se paga: 1, 2, 3, 6 o 12 meses.' using errcode = 'P0001';
  end if;
  select x.* into c from public.gym_fee_types x where x.id = gym_cuota_tipo_guardar.id and x.gym_id = g for update;
  if gym_cuota_tipo_guardar.id is not null and c.id is null then raise exception 'No encontramos esa cuota.' using errcode = 'P0001'; end if;
  begin
    if c.id is null then
      insert into public.gym_fee_types (gym_id, name, amount, months, created_by) values (g, n, monto, meses, auth.uid()) returning gym_fee_types.id into nuevo;
    else
      update public.gym_fee_types set name = n, amount = monto, months = meses where gym_fee_types.id = c.id;
      nuevo := c.id;
    end if;
  exception when unique_violation then
    raise exception 'Ya hay una cuota con ese nombre.' using errcode = 'P0001';
  end;
  perform public.gym_auditar(g, 'cuota_tipo', null, null, jsonb_build_object('id', nuevo, 'antes', case when c.id is not null
    then jsonb_build_object('name', c.name, 'amount', c.amount, 'months', c.months) end, 'name', n, 'amount', monto, 'months', meses));
  return public.gym_cuota_json(nuevo);
end $$;
revoke all on function public.gym_cuota_tipo_guardar(uuid, text, numeric, int) from public, anon;
grant execute on function public.gym_cuota_tipo_guardar(uuid, text, numeric, int) to authenticated;

-- Archivar un tipo de cuota (o volver a usarlo): no se asigna más; quien la tiene, la conserva.
create or replace function public.gym_cuota_tipo_archivar(id uuid, archivar boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare g uuid := public.gym_exigir_cuotas(); c record;
begin
  select x.* into c from public.gym_fee_types x where x.id = gym_cuota_tipo_archivar.id and x.gym_id = g for update;
  if c.id is null then raise exception 'No encontramos esa cuota.' using errcode = 'P0001'; end if;
  begin
    update public.gym_fee_types set archived_at = case when coalesce(archivar, true) then coalesce(archived_at, now()) end where gym_fee_types.id = c.id;
  exception when unique_violation then
    raise exception 'Ya hay otra cuota con ese nombre: cambiale el nombre antes.' using errcode = 'P0001';
  end;
  perform public.gym_auditar(g, case when coalesce(archivar, true) then 'cuota_archivar' else 'cuota_desarchivar' end, null, null, jsonb_build_object('id', c.id, 'name', c.name));
  return public.gym_cuota_json(c.id);
end $$;
revoke all on function public.gym_cuota_tipo_archivar(uuid, boolean) from public, anon;
grant execute on function public.gym_cuota_tipo_archivar(uuid, boolean) to authenticated;


-- ===== Asignar y cobrar =====

-- Asignar una cuota a una o varias fichas (activas, pausadas o visitas). tipo null la saca. vence
-- (opcional): hasta cuándo ya está paga, para los socios que pagaron antes de usar GIZE.
create or replace function public.gym_cuota_asignar(fichas uuid[], tipo uuid, vence date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare g uuid := public.gym_exigir_cuotas(); f record; n int := 0; hoy date := public.gym_hoy();
begin
  if fichas is null or cardinality(fichas) = 0 or cardinality(fichas) > 500 then
    raise exception 'Elegí entre 1 y 500 socios.' using errcode = 'P0001';
  end if;
  if tipo is not null and not exists (select 1 from public.gym_fee_types c where c.id = tipo and c.gym_id = g and c.archived_at is null) then
    raise exception 'Esa cuota no está (o está archivada).' using errcode = 'P0001';
  end if;
  if vence is not null and (tipo is null or vence < hoy - 366 or vence > hoy + 400) then
    raise exception 'Revisá la fecha: hasta cuándo ya está paga.' using errcode = 'P0001';
  end if;
  for f in select m.id, m.member_id, m.fee_type_id, m.fee_due from public.gym_members m
            where m.id = any(fichas) and m.gym_id = g and m.status in ('activo', 'pausado', 'visita') order by m.id for update loop
    update public.gym_members set fee_type_id = tipo, fee_due = coalesce(vence, fee_due) where gym_members.id = f.id;
    perform public.gym_auditar(g, 'cuota_asignar', f.id, f.member_id, jsonb_build_object('antes', f.fee_type_id, 'tipo', tipo, 'vence_antes', f.fee_due, 'vence', vence));
    n := n + 1;
  end loop;
  if n < cardinality(fichas) then
    raise exception 'Alguno de esos socios no está en el gimnasio (o está de baja): no se cambió nada.' using errcode = 'P0001';
  end if;
  return jsonb_build_object('ok', n);
end $$;
revoke all on function public.gym_cuota_asignar(uuid[], uuid, date) from public, anon;
grant execute on function public.gym_cuota_asignar(uuid[], uuid, date) to authenticated;

-- Anotar un pago. id lo genera la app: el mismo id otra vez devuelve lo mismo, sin anotar otro.
-- Cubre desde el vencimiento de antes si todavía no pasó (o desde el día que pagó, si estaba vencida o
-- sin pagos) y por los meses de su cuota; hasta (opcional) lo cambia. El vencimiento nuevo es hasta.
create or replace function public.gym_pago_registrar(id uuid, ficha uuid, monto numeric, medio text, fecha date, hasta date, nota text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare g uuid := public.gym_exigir_cobro(true); p record; m record; c record; hoy date := public.gym_hoy(); dia date := coalesce(fecha, public.gym_hoy());
        desde date; fin date; nt text := nullif(btrim(coalesce(nota, '')), '');
begin
  if id is null or ficha is null then raise exception 'Faltan datos del pago.' using errcode = 'P0001'; end if;
  select x.* into p from public.gym_payments x where x.id = gym_pago_registrar.id;
  if p.id is not null then
    if p.gym_id <> g then raise exception 'No tenés permiso para hacer esto en el gimnasio.' using errcode = '42501'; end if;
    return jsonb_build_object('id', p.id, 'desde', p.period_from, 'hasta', p.period_to, 'repetido', true);
  end if;
  select x.* into m from public.gym_members x where x.id = ficha and x.gym_id = g for update;
  if m.id is null or m.status not in ('activo', 'pausado', 'visita') then
    raise exception 'No encontramos esa ficha (o está de baja).' using errcode = 'P0001';
  end if;
  if monto is null or monto <= 0 or monto > 99999999 or monto <> round(monto, 2) then
    raise exception 'Revisá el monto: en pesos, sin puntos de miles.' using errcode = 'P0001';
  end if;
  if medio is null or medio not in ('efectivo', 'transferencia', 'otro') then
    raise exception 'Elegí cómo pagó: efectivo, transferencia u otro.' using errcode = 'P0001';
  end if;
  if dia > hoy or dia < hoy - 366 then
    raise exception 'Revisá la fecha del pago: no puede ser futura ni de hace más de un año.' using errcode = 'P0001';
  end if;
  if char_length(coalesce(nt, '')) > 200 then raise exception 'La nota es muy larga (hasta 200 letras).' using errcode = 'P0001'; end if;
  select x.* into c from public.gym_fee_types x where x.id = m.fee_type_id;
  if c.id is null and hasta is null then
    raise exception 'Asignale una cuota al socio o elegí hasta cuándo cubre el pago.' using errcode = 'P0001';
  end if;
  desde := case when m.fee_due is not null and m.fee_due >= dia then m.fee_due else dia end;
  if hasta is not null and hasta <= desde then desde := dia; end if;
  fin := coalesce(hasta, (desde + make_interval(months => c.months))::date);
  if fin <= dia or fin > dia + 400 then
    raise exception 'Revisá hasta cuándo cubre: después del día que pagó y dentro de un año.' using errcode = 'P0001';
  end if;
  insert into public.gym_payments (id, gym_id, gym_member_id, fee_type_id, fee_name, amount, method, paid_on, period_from, period_to, prev_due, note, by_user)
  values (gym_pago_registrar.id, g, m.id, c.id, c.name, monto, medio, dia, desde, fin, m.fee_due, nt, auth.uid());
  update public.gym_members set fee_due = fin where gym_members.id = m.id;
  perform public.gym_auditar(g, 'pago', m.id, m.member_id, jsonb_build_object('pago', gym_pago_registrar.id, 'monto', monto, 'medio', medio, 'desde', desde, 'hasta', fin));
  return jsonb_build_object('id', gym_pago_registrar.id, 'desde', desde, 'hasta', fin, 'repetido', false);
end $$;
revoke all on function public.gym_pago_registrar(uuid, uuid, numeric, text, date, date, text) from public, anon;
grant execute on function public.gym_pago_registrar(uuid, uuid, numeric, text, date, date, text) to authenticated;

-- Anular un pago cargado por error (dueño y administración). Queda en el historial, tachado. Si era
-- el que puso el vencimiento de ahora, el vencimiento vuelve al de antes.
create or replace function public.gym_pago_anular(id uuid, motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare g uuid := public.gym_exigir_cuotas(); p record; m record; mot text := nullif(left(btrim(coalesce(motivo, '')), 200), '');
begin
  select x.* into p from public.gym_payments x where x.id = gym_pago_anular.id and x.gym_id = g;
  if p.id is null then raise exception 'No encontramos ese pago.' using errcode = 'P0001'; end if;
  select x.* into m from public.gym_members x where x.id = p.gym_member_id for update;
  select x.* into p from public.gym_payments x where x.id = p.id for update;
  if p.voided_at is not null then raise exception 'Ese pago ya está anulado.' using errcode = 'P0001'; end if;
  update public.gym_payments set voided_at = now(), voided_by = auth.uid(), void_reason = mot where gym_payments.id = p.id;
  if m.fee_due is not distinct from p.period_to
     and not exists (select 1 from public.gym_payments x where x.gym_member_id = m.id and x.voided_at is null and x.period_to = p.period_to) then
    update public.gym_members set fee_due = p.prev_due where gym_members.id = m.id;
  end if;
  perform public.gym_auditar(g, 'pago_anulado', m.id, m.member_id, jsonb_build_object('pago', p.id, 'monto', p.amount, 'motivo', mot));
  return jsonb_build_object('ok', true, 'vence', (select x.fee_due from public.gym_members x where x.id = m.id));
end $$;
revoke all on function public.gym_pago_anular(uuid, text) from public, anon;
grant execute on function public.gym_pago_anular(uuid, text) to authenticated;


-- ===== Leer =====

-- La cuota y los pagos de una ficha (los últimos 60, con los anulados): dueño, administración y la
-- recepción que cobra.
create or replace function public.gym_pagos_ficha(ficha uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare g uuid := public.gym_exigir_cobro(false); m record;
begin
  select x.id, x.fee_type_id, x.fee_due, x.status into m from public.gym_members x where x.id = ficha and x.gym_id = g;
  if m.id is null then raise exception 'No encontramos esa ficha.' using errcode = 'P0001'; end if;
  return jsonb_build_object('ficha', m.id, 'cuota', public.gym_cuota_json(m.fee_type_id), 'vence', m.fee_due,
    'estado', public.gym_cuota_estado(m.fee_type_id, m.fee_due),
    'pagos', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'fecha', x.paid_on, 'monto', x.amount, 'medio', x.method, 'cuota', x.fee_name,
                 'desde', x.period_from, 'hasta', x.period_to, 'nota', x.note, 'por', u.full_name, 'cargado', x.created_at,
                 'anulado', x.voided_at, 'anulado_por', v.full_name, 'motivo', x.void_reason) order by x.paid_on desc, x.created_at desc)
        from (select y.* from public.gym_payments y where y.gym_member_id = m.id order by y.paid_on desc, y.created_at desc limit 60) x
        left join public.profiles u on u.id = x.by_user left join public.profiles v on v.id = x.voided_by), '[]'::jsonb));
end $$;
revoke all on function public.gym_pagos_ficha(uuid) from public, anon;
grant execute on function public.gym_pagos_ficha(uuid) to authenticated;

-- La pantalla Cuotas (dueño y administración): cada socio activo, pausado o visita con su cuota,
-- vencimiento y estado; cuántos hay en cada estado (solo los activos); y el mes: lo cobrado (pagos sin
-- anular con fecha de este mes) y lo que falta cobrar (la cuota de cada activo que ya venció o vence
-- antes de fin de mes, o que no tiene pagos).
create or replace function public.gym_cuotas_resumen()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare g uuid := public.gym_exigir(array['owner', 'admin']); hoy date := public.gym_hoy(); ini date; fin date; L jsonb;
begin
  ini := date_trunc('month', hoy)::date; fin := (ini + interval '1 month')::date;
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'nombre', coalesce(nullif(m.full_name, ''), p.full_name), 'foto_path', m.foto_path,
           'estado', m.status, 'cuota', case when c.id is not null then jsonb_build_object('id', c.id, 'name', c.name, 'amount', c.amount, 'months', c.months) end,
           'vence', m.fee_due, 'cuota_estado', public.gym_cuota_estado(m.fee_type_id, m.fee_due),
           'ultimo_pago', (select max(x.paid_on) from public.gym_payments x where x.gym_member_id = m.id and x.voided_at is null))
           order by coalesce(nullif(m.full_name, ''), p.full_name)), '[]'::jsonb) into L
    from public.gym_members m left join public.profiles p on p.id = m.member_id left join public.gym_fee_types c on c.id = m.fee_type_id
   where m.gym_id = g and m.status in ('activo', 'pausado', 'visita');
  return jsonb_build_object('hoy', hoy, 'mes', ini, 'socios', L,
    'cobrado', (select coalesce(sum(x.amount), 0) from public.gym_payments x where x.gym_id = g and x.voided_at is null and x.paid_on >= ini and x.paid_on < fin),
    'pagos_mes', (select count(*) from public.gym_payments x where x.gym_id = g and x.voided_at is null and x.paid_on >= ini and x.paid_on < fin),
    'por_cobrar', (select coalesce(sum(c.amount), 0) from public.gym_members m join public.gym_fee_types c on c.id = m.fee_type_id
                    where m.gym_id = g and m.status = 'activo' and (m.fee_due is null or m.fee_due < fin)),
    'socios_por_cobrar', (select count(*) from public.gym_members m
                           where m.gym_id = g and m.status = 'activo' and m.fee_type_id is not null and (m.fee_due is null or m.fee_due < fin)),
    'conteo', (select jsonb_build_object(
                 'al_dia', count(*) filter (where e = 'al_dia'), 'por_vencer', count(*) filter (where e = 'por_vencer'),
                 'vencida', count(*) filter (where e = 'vencida'), 'sin_pagos', count(*) filter (where e = 'sin_pagos'),
                 'sin_cuota', count(*) filter (where e is null))
                 from (select public.gym_cuota_estado(m.fee_type_id, m.fee_due) e from public.gym_members m where m.gym_id = g and m.status = 'activo') x));
end $$;
revoke all on function public.gym_cuotas_resumen() from public, anon;
grant execute on function public.gym_cuotas_resumen() to authenticated;

-- Los pagos de un mes (dueño y administración; para la lista y el CSV). mes: cualquier día del mes
-- (null: este). Con los anulados, marcados. Anda siempre, aunque venza el plan.
create or replace function public.gym_pagos_mes(mes date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare g uuid := public.gym_exigir(array['owner', 'admin']); ini date := date_trunc('month', coalesce(mes, public.gym_hoy()))::date; fin date;
begin
  fin := (ini + interval '1 month')::date;
  return coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'fecha', x.paid_on, 'ficha', m.id, 'socio', coalesce(nullif(m.full_name, ''), p.full_name),
           'monto', x.amount, 'medio', x.method, 'cuota', x.fee_name, 'desde', x.period_from, 'hasta', x.period_to, 'nota', x.note,
           'por', u.full_name, 'anulado', x.voided_at) order by x.paid_on desc, x.created_at desc)
    from public.gym_payments x join public.gym_members m on m.id = x.gym_member_id
    left join public.profiles p on p.id = m.member_id left join public.profiles u on u.id = x.by_user
   where x.gym_id = g and x.paid_on >= ini and x.paid_on < fin), '[]'::jsonb);
end $$;
revoke all on function public.gym_pagos_mes(date) from public, anon;
grant execute on function public.gym_pagos_mes(date) to authenticated;

-- «No dejar entrar con la cuota vencida» (dueño y administración). Apagado por defecto: el ingreso
-- se anota y la recepción ve el aviso.
create or replace function public.gym_cuotas_bloquear(bloquear boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare g uuid := public.gym_exigir(array['owner', 'admin']);
begin
  if bloquear is null then raise exception 'Revisá el interruptor.' using errcode = 'P0001'; end if;
  update public.gyms set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('cuota_bloquea', bloquear) where gyms.id = g;
  perform public.gym_auditar(g, 'config', null, null, jsonb_build_object('cambio', jsonb_build_object('settings', jsonb_build_object('cuota_bloquea', bloquear))));
  return jsonb_build_object('gym', public.gym_json(g), 'settings', public.gym_settings(g));
end $$;
revoke all on function public.gym_cuotas_bloquear(boolean) from public, anon;
grant execute on function public.gym_cuotas_bloquear(boolean) to authenticated;

-- El socio: su cuota, cuándo vence, el estado y sus pagos (los últimos 24, sin los anulados, sin quién
-- los cargó ni las notas internas). null si no tiene ficha activa, pausada o visita.
create or replace function public.gym_mi_cuota()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare m record;
begin
  select x.id, x.fee_type_id, x.fee_due into m from public.gym_members x join public.gyms y on y.id = x.gym_id and y.closed_at is null
   where x.member_id = auth.uid() and x.status in ('activo', 'pausado', 'visita') limit 1;
  if m.id is null then return null; end if;
  return jsonb_build_object('estado', public.gym_cuota_estado(m.fee_type_id, m.fee_due), 'vence', m.fee_due,
    'cuota', (select jsonb_build_object('name', c.name, 'amount', c.amount, 'months', c.months) from public.gym_fee_types c where c.id = m.fee_type_id),
    'pagos', coalesce((select jsonb_agg(jsonb_build_object('fecha', x.paid_on, 'monto', x.amount, 'medio', x.method, 'hasta', x.period_to) order by x.paid_on desc, x.created_at desc)
                        from (select y.* from public.gym_payments y where y.gym_member_id = m.id and y.voided_at is null
                               order by y.paid_on desc, y.created_at desc limit 24) x), '[]'::jsonb));
end $$;
revoke all on function public.gym_mi_cuota() from public, anon;
grant execute on function public.gym_mi_cuota() to authenticated;

notify pgrst, 'reload schema';


-- ===== Para volver atrás =====
-- Correr esto sin los «-- » (después del bloque de gimnasios-clases.sql: si no, se frena sin cambiar
-- nada; antes que el de gimnasios-admin.sql y el de gimnasios-socios.sql).
-- Vuelven gym_semaforo y gym_ingreso_manual de la etapa 1 (copia textual de gimnasios-socios.sql) y se
-- borran las funciones, los pagos, los tipos de cuota, la columna fee_due, la clave foránea de
-- fee_type_id (la columna queda, como en la etapa 0) y el interruptor cuota_bloquea. Exportá los pagos
-- antes: se borran.
--
-- do $$ begin
--   if to_regclass('public.gym_bookings') is not null then
--     raise exception 'Primero el bloque «Para volver atrás» de supabase/gimnasios-clases.sql (usa gym_cuota_estado).';
--   end if;
-- end $$;
-- create or replace function public.gym_semaforo(fid uuid)
-- returns jsonb
-- language plpgsql
-- stable
-- security definer
-- set search_path = public
-- as $$
-- declare m record;
-- begin
--   select x.status, x.paused_until, x.apto_medico_vence into m from public.gym_members x where x.id = fid;
--   return jsonb_build_object(
--     'semaforo', case m.status when 'activo' then 'verde' when 'pausado' then 'ambar' when 'pendiente' then 'ambar'
--                               when 'baja' then 'rojo' else 'gris' end,
--     'motivo', case m.status when 'activo' then 'Activo'
--                             when 'pausado' then 'Pausado' || coalesce(' hasta el ' || to_char(m.paused_until, 'DD/MM'), '')
--                             when 'pendiente' then 'Pidió sumarse' when 'baja' then 'De baja' else 'No es socio' end,
--     'apto_vencido', m.apto_medico_vence is not null and m.apto_medico_vence < public.gym_hoy());
-- end $$;
-- revoke all on function public.gym_semaforo(uuid) from public, anon, authenticated;
-- create or replace function public.gym_ingreso_manual(id uuid, ficha uuid)
-- returns jsonb
-- language plpgsql
-- security definer
-- set search_path = public
-- as $$
-- declare g uuid := public.gym_exigir_recepcion(); e record; f record; horas int; res text;
-- begin
--   if id is null or ficha is null then raise exception 'Faltan datos del ingreso.' using errcode = 'P0001'; end if;
--   perform pg_advisory_xact_lock(hashtext('gym_ingreso'), hashtext(ficha::text));
--   select x.* into e from public.gym_entries x where x.id = gym_ingreso_manual.id;
--   if e.id is not null then
--     if e.gym_id <> g then raise exception 'No tenés permiso para hacer esto en el gimnasio.' using errcode = '42501'; end if;
--     return jsonb_build_object('id', e.id, 'result', e.result, 'repetido', false, 'at', e.at);
--   end if;
--   select m.id, m.status, m.member_id into f from public.gym_members m where m.id = ficha and m.gym_id = g;
--   if f.id is null then raise exception 'No encontramos esa ficha.' using errcode = 'P0001'; end if;
--   horas := coalesce((public.gym_settings(g)->>'ingreso_horas')::int, 3);
--   select x.* into e from public.gym_entries x where x.gym_member_id = f.id and x.at > now() - make_interval(hours => horas)
--    order by x.at desc limit 1;
--   if e.id is not null then
--     return jsonb_build_object('id', e.id, 'result', e.result, 'repetido', true, 'at', e.at);
--   end if;
--   res := case f.status when 'activo' then 'ok' when 'pausado' then 'pausado' when 'visita' then 'visita' when 'baja' then 'baja' else 'rechazado' end;
--   insert into public.gym_entries (id, gym_id, gym_member_id, at, method, by_user, result)
--   values (gym_ingreso_manual.id, g, f.id, now(), 'manual', auth.uid(), res);
--   perform public.gym_auditar(g, 'ingreso_manual', f.id, f.member_id, jsonb_build_object('result', res));
--   return jsonb_build_object('id', gym_ingreso_manual.id, 'result', res, 'repetido', false, 'at', now());
-- end $$;
-- revoke all on function public.gym_ingreso_manual(uuid, uuid) from public, anon;
-- grant execute on function public.gym_ingreso_manual(uuid, uuid) to authenticated;
-- drop function if exists public.gym_mi_cuota(), public.gym_cuotas_bloquear(boolean), public.gym_pagos_mes(date),
--   public.gym_cuotas_resumen(), public.gym_pagos_ficha(uuid), public.gym_pago_anular(uuid, text),
--   public.gym_pago_registrar(uuid, uuid, numeric, text, date, date, text), public.gym_cuota_asignar(uuid[], uuid, date),
--   public.gym_cuota_tipo_archivar(uuid, boolean), public.gym_cuota_tipo_guardar(uuid, text, numeric, int), public.gym_cuotas_tipos(),
--   public.gym_exigir_cuotas(), public.gym_exigir_cobro(boolean), public.gym_cuota_json(uuid), public.gym_cuota_estado(uuid, date);
-- drop table if exists public.gym_payments;
-- update public.gym_members set fee_type_id = null where fee_type_id is not null;
-- alter table public.gym_members drop constraint if exists gym_members_fee_type_fk;
-- drop index if exists public.gym_members_fee_type_idx;
-- alter table public.gym_members drop column if exists fee_due;
-- drop table if exists public.gym_fee_types;
-- update public.gyms set settings = settings - 'cuota_bloquea' where settings ? 'cuota_bloquea';
-- notify pgrst, 'reload schema';
