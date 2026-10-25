-- Gimnasios, etapa 3: clases. El gimnasio arma su grilla semanal (Spinning los martes a las 19, con
-- su profe, su cupo y su sala), los socios reservan y cancelan desde la app, la lista de espera se
-- llena sola cuando alguien cancela y el profe o la recepción toman el presente.
-- Correr con el workflow "Supabase" → tarea sql → supabase/gimnasios-clases.sql, después de supabase/gimnasios.sql, supabase/gimnasios-vinculo.sql, supabase/gimnasios-lectura.sql, supabase/gimnasios-socios.sql, supabase/gimnasios-admin.sql y supabase/gimnasios-cuotas.sql. Se puede correr varias veces.
-- Sin esos archivos falla entero, sin cambiar nada (lo primero del archivo lo controla).
--
-- SIN CLASES TODO SIGUE IGUAL: no cambia ninguna función de antes. Suma tablas, funciones, un trigger
-- en gym_members (al pasar a baja, suelta sus reservas) y una tarea diaria que sale enseguida si no
-- hay clases viejas.
--
-- Qué suma:
--   · gym_classes: la grilla semanal (nombre, profe, día de la semana, hora, duración, cupo, sala
--     opcional y desde qué día se da). Cada clase se repite todas las semanas. No se borran: se
--     archivan (las fechas que venían con reservas se cancelan y se avisa).
--   · gym_class_dates: una fecha puntual de una clase (el martes 4 de noviembre a las 19), con su
--     hora de inicio y de fin. Se crea sola la primera vez que alguien reserva o el gimnasio la
--     cancela. Cancelar una fecha no toca la grilla.
--   · gym_bookings: las reservas (confirmada, en espera o cancelada), una por socio y fecha. La lista
--     de espera va por orden de llegada; cuando se libera un lugar (alguien cancela, el gimnasio le
--     saca la reserva, sube el cupo o el socio pasa a baja) el primero pasa a confirmada solo y se le
--     anota un aviso (gym_alerts, «clase_lugar»). El presente: lo marca el profe de la clase o la
--     recepción (presente o ausente) y, si nadie lo marcó, sale del ingreso: cuenta un ingreso al
--     gimnasio desde 90 minutos antes de que empiece hasta que termina.
--   · SIN CARRERAS EN EL CUPO: reservar, cancelar y pasar de la espera bloquean primero la fila de la
--     fecha (gym_class_dates, «for update») y recién ahí cuentan: dos socios que reservan el último
--     lugar a la vez no entran los dos (uno queda en espera).
--   · Interruptores (settings, con gym_clases_config): clases_reservar_horas (se reserva hasta X horas
--     antes; 0, hasta que empieza), clases_cancelar_horas (se cancela hasta X horas antes; 2 por
--     defecto), clases_dias (cuántos días para adelante se ve y se reserva; 7) y
--     clases_cuota_bloquea (con la cuota vencida, de la etapa 2, no se reserva; apagado).
--   · RPC del equipo: gym_clases, gym_clases_semana, gym_clase_alumnos, gym_clase_guardar,
--     gym_clase_archivar, gym_clase_cancelar, gym_clase_anotar, gym_clase_quitar, gym_clase_presente
--     y gym_clases_config. Del socio: gym_mis_clases, gym_reservar y gym_reserva_cancelar.
--   · Tarea gize-gym-clases (03:40 de Argentina): borra las fechas de hace más de 12 meses, con sus
--     reservas y su presente.
--
-- Quién puede (los roles de la etapa 1):
--   · Dueño y administración: todo (la grilla, cancelar fechas, los interruptores, anotar y sacar
--     socios, el presente).
--   · Recepción: ve todas las clases y sus listas, anota y saca socios de una clase y marca el presente.
--   · Profe: ve sus clases (las que tiene asignadas) con la lista y marca el presente. No ve las de
--     otros profes.
--   · Socio (ficha activa o visita; pausada solo mira): ve las clases de los próximos días con los
--     lugares libres (nunca quién reservó), reserva, se anota en la espera y cancela.
-- Nadie lee las tablas nuevas directo salvo dueño y administración (por política); el resto, por
-- funciones. Reservar y cambiar algo anda mientras el gimnasio esté operativo (hasta 10 días después
-- de vencido el plan, como la recepción); leer, siempre. Cancelar su propia reserva, siempre.
-- Lo que hace el equipo queda en gym_audit (la persona real); las reservas guardan quién las hizo.
--
-- Para volver atrás: el bloque comentado del final (antes que el de gimnasios-cuotas.sql).


-- ===== Antes que nada: ¿están los archivos anteriores? =====

do $$ begin
  if to_regclass('public.gym_members') is null or to_regprocedure('public.gym_exigir(text[])') is null
     or to_regprocedure('public.gym_auditar(uuid, text, uuid, uuid, jsonb)') is null or to_regprocedure('public.gym_alerta(uuid, text, text, text, text, jsonb)') is null
     or to_regprocedure('public.gym_cuota_estado(uuid, date)') is null then
    raise exception 'Primero correr supabase/gimnasios.sql, supabase/gimnasios-vinculo.sql, supabase/gimnasios-lectura.sql, supabase/gimnasios-socios.sql, supabase/gimnasios-admin.sql y supabase/gimnasios-cuotas.sql: este archivo usa sus tablas y funciones.';
  end if;
end $$;


-- ===== Tablas =====

create table if not exists public.gym_classes (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  name        text not null,
  trainer_id  uuid references public.profiles(id) on delete set null,   -- el profe (null: sin profe)
  weekday     smallint not null,                   -- 1 lunes … 7 domingo
  start_time  time not null,                       -- hora de Argentina
  minutes     smallint not null,                   -- duración
  capacity    smallint not null,                   -- cupo
  room        text,                                -- sala (opcional)
  starts_on   date not null,                       -- desde qué día se da
  archived_at timestamptz,                         -- archivada: no se da más desde ese momento
  created_by  uuid,
  created_at  timestamptz not null default now()
);
alter table public.gym_classes drop constraint if exists gym_classes_name_check;
alter table public.gym_classes add constraint gym_classes_name_check check (char_length(name) between 2 and 60);
alter table public.gym_classes drop constraint if exists gym_classes_weekday_check;
alter table public.gym_classes add constraint gym_classes_weekday_check check (weekday between 1 and 7);
alter table public.gym_classes drop constraint if exists gym_classes_time_check;
alter table public.gym_classes add constraint gym_classes_time_check check (start_time = date_trunc('minute', start_time::interval)::time);
alter table public.gym_classes drop constraint if exists gym_classes_minutes_check;
alter table public.gym_classes add constraint gym_classes_minutes_check check (minutes between 15 and 240);
alter table public.gym_classes drop constraint if exists gym_classes_capacity_check;
alter table public.gym_classes add constraint gym_classes_capacity_check check (capacity between 1 and 500);
alter table public.gym_classes drop constraint if exists gym_classes_room_check;
alter table public.gym_classes add constraint gym_classes_room_check check (char_length(coalesce(room, '')) <= 60);
create index if not exists gym_classes_gym_idx on public.gym_classes(gym_id, weekday);
create index if not exists gym_classes_trainer_idx on public.gym_classes(trainer_id) where trainer_id is not null;

create table if not exists public.gym_class_dates (
  id            uuid primary key default gen_random_uuid(),
  gym_id        uuid not null references public.gyms(id) on delete cascade,
  class_id      uuid not null references public.gym_classes(id) on delete cascade,
  day           date not null,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  cancelled_at  timestamptz,                       -- el gimnasio la canceló
  cancelled_by  uuid,                              -- quién (sin clave foránea)
  cancel_reason text,
  unique (class_id, day)
);
alter table public.gym_class_dates drop constraint if exists gym_class_dates_time_check;
alter table public.gym_class_dates add constraint gym_class_dates_time_check check (ends_at > starts_at);
alter table public.gym_class_dates drop constraint if exists gym_class_dates_reason_check;
alter table public.gym_class_dates add constraint gym_class_dates_reason_check check (char_length(coalesce(cancel_reason, '')) <= 200);
create index if not exists gym_class_dates_gym_idx on public.gym_class_dates(gym_id, day);
create index if not exists gym_class_dates_day_idx on public.gym_class_dates(day);

create table if not exists public.gym_bookings (
  id            uuid primary key default gen_random_uuid(),
  gym_id        uuid not null references public.gyms(id) on delete cascade,
  date_id       uuid not null references public.gym_class_dates(id) on delete cascade,
  gym_member_id uuid not null references public.gym_members(id) on delete cascade,
  status        text not null,                     -- confirmada, espera o cancelada
  queued_at     timestamptz not null default clock_timestamp(),  -- el orden de la lista de espera
  promoted_at   timestamptz,                       -- pasó de la espera a confirmada
  cancelled_at  timestamptz,
  cancelled_by  uuid,                              -- el socio, alguien del equipo o null (pasó a baja por una tarea)
  attended      boolean,                           -- presente marcado (null: sale del ingreso)
  attended_by   uuid,
  attended_at   timestamptz,
  by_user       uuid,                              -- quién la hizo (el socio o la recepción)
  created_at    timestamptz not null default now(),
  unique (date_id, gym_member_id)
);
alter table public.gym_bookings drop constraint if exists gym_bookings_status_check;
alter table public.gym_bookings add constraint gym_bookings_status_check check (status in ('confirmada', 'espera', 'cancelada'));
alter table public.gym_bookings drop constraint if exists gym_bookings_cancel_check;
alter table public.gym_bookings add constraint gym_bookings_cancel_check check ((status = 'cancelada') = (cancelled_at is not null));
create index if not exists gym_bookings_member_idx on public.gym_bookings(gym_member_id);
create index if not exists gym_bookings_date_idx on public.gym_bookings(date_id, status, queued_at);
create index if not exists gym_bookings_gym_idx on public.gym_bookings(gym_id);


-- ===== RLS: solo lectura, dueño y administración =====

alter table public.gym_classes enable row level security;
revoke all on public.gym_classes from anon, authenticated;
grant select on public.gym_classes to authenticated;
drop policy if exists "clases: dueño y administración" on public.gym_classes;
create policy "clases: dueño y administración" on public.gym_classes
  for select to authenticated using (public.gym_mi_rol(gym_id) in ('owner', 'admin'));

alter table public.gym_class_dates enable row level security;
revoke all on public.gym_class_dates from anon, authenticated;
grant select on public.gym_class_dates to authenticated;
drop policy if exists "fechas de clases: dueño y administración" on public.gym_class_dates;
create policy "fechas de clases: dueño y administración" on public.gym_class_dates
  for select to authenticated using (public.gym_mi_rol(gym_id) in ('owner', 'admin'));

alter table public.gym_bookings enable row level security;
revoke all on public.gym_bookings from anon, authenticated;
grant select on public.gym_bookings to authenticated;
drop policy if exists "reservas: dueño y administración" on public.gym_bookings;
create policy "reservas: dueño y administración" on public.gym_bookings
  for select to authenticated using (public.gym_mi_rol(gym_id) in ('owner', 'admin'));


-- ===== Ayudas (internas) =====

-- Los interruptores de las clases con sus valores por defecto.
create or replace function public.gym_clases_cfg(g uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare s jsonb := public.gym_settings(g);
begin
  return jsonb_build_object('reservar_horas', coalesce((s->>'clases_reservar_horas')::int, 0), 'cancelar_horas', coalesce((s->>'clases_cancelar_horas')::int, 2),
                            'dias', coalesce((s->>'clases_dias')::int, 7), 'cuota_bloquea', coalesce((s->>'clases_cuota_bloquea')::boolean, false));
end $$;
revoke all on function public.gym_clases_cfg(uuid) from public, anon, authenticated;

-- Quién llama en el equipo y su rol, si puede ver clases (dueño, administración, recepción o profe).
-- escribir: además, que el gimnasio esté operativo.
create or replace function public.gym_exigir_clases(escribir boolean, out g uuid, out rol text)
returns record
language plpgsql
stable
security definer
set search_path = public
as $$
declare s record;
begin
  select * into s from public.gym_mi_staff();
  if s.g is null or s.rol not in ('owner', 'admin', 'recepcion', 'profe') then
    raise exception 'No tenés permiso para hacer esto en el gimnasio.' using errcode = '42501';
  end if;
  if escribir and not public.gym_operativo(s.g) then
    raise exception 'Las clases están pausadas: hablá con la administración del gimnasio.' using errcode = 'P0001';
  end if;
  g := s.g; rol := s.rol;
end $$;
revoke all on function public.gym_exigir_clases(boolean) from public, anon, authenticated;

-- Una clase de la grilla en JSON.
create or replace function public.gym_clase_json(clase uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return (select jsonb_build_object('id', c.id, 'nombre', c.name, 'profe', case when c.trainer_id is not null then jsonb_build_object('id', c.trainer_id, 'name', p.full_name) end,
            'dia', c.weekday, 'hora', to_char(c.start_time, 'HH24:MI'), 'duracion', c.minutes, 'cupo', c.capacity, 'sala', c.room, 'desde', c.starts_on,
            'archivada', c.archived_at is not null)
            from public.gym_classes c left join public.profiles p on p.id = c.trainer_id where c.id = clase);
end $$;
revoke all on function public.gym_clase_json(uuid) from public, anon, authenticated;

-- Cuándo se da cada clase del gimnasio g entre dos días: una fila por clase y fecha, con la fila de
-- gym_class_dates si ya existe (su hora y si está cancelada). Una clase archivada se sigue viendo en
-- las fechas que empezaron antes de archivarla y en las que ya tenían fila (las que se cancelaron al
-- archivarla: así quien había reservado la ve cancelada).
create or replace function public.gym_clases_ocurrencias(g uuid, desde date, hasta date)
returns table (clase uuid, dia date, inicio timestamptz, fin timestamptz, fecha uuid, cancelada timestamptz, motivo text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  select c.id, s.d::date,
         coalesce(f.starts_at, (s.d::date + c.start_time) at time zone 'America/Argentina/Buenos_Aires'),
         coalesce(f.ends_at, ((s.d::date + c.start_time) at time zone 'America/Argentina/Buenos_Aires') + make_interval(mins => c.minutes::int)),
         f.id, f.cancelled_at, f.cancel_reason
    from public.gym_classes c
    cross join generate_series(desde::timestamp, hasta::timestamp, interval '1 day') s(d)
    left join public.gym_class_dates f on f.class_id = c.id and f.day = s.d::date
   where c.gym_id = g and extract(isodow from s.d) = c.weekday and s.d::date >= c.starts_on
     and (c.archived_at is null or f.id is not null
          or ((s.d::date + c.start_time) at time zone 'America/Argentina/Buenos_Aires') < c.archived_at);
end $$;
revoke all on function public.gym_clases_ocurrencias(uuid, date, date) from public, anon, authenticated;

-- La fecha de una clase (la crea si todavía no existe) y la deja bloqueada hasta el final de la
-- transacción: lo primero que hace todo lo que cuenta lugares. Si la clase no se da ese día, P0001.
create or replace function public.gym_clase_fecha(g uuid, clase uuid, dia date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare c record; f record; ini timestamptz;
begin
  select x.* into c from public.gym_classes x where x.id = clase and x.gym_id = g;
  if c.id is null then raise exception 'No encontramos esa clase.' using errcode = 'P0001'; end if;
  select x.* into f from public.gym_class_dates x where x.class_id = c.id and x.day = dia for update;
  if f.id is not null then return f.id; end if;
  ini := (dia + c.start_time) at time zone 'America/Argentina/Buenos_Aires';
  if dia is null or extract(isodow from dia) <> c.weekday or dia < c.starts_on or (c.archived_at is not null and ini >= c.archived_at) then
    raise exception 'Esa clase no se da ese día.' using errcode = 'P0001';
  end if;
  insert into public.gym_class_dates (gym_id, class_id, day, starts_at, ends_at)
  values (g, c.id, dia, ini, ini + make_interval(mins => c.minutes::int))
  on conflict (class_id, day) do nothing;
  select x.* into f from public.gym_class_dates x where x.class_id = c.id and x.day = dia for update;
  return f.id;
end $$;
revoke all on function public.gym_clase_fecha(uuid, uuid, date) from public, anon, authenticated;

-- A qué hora entró al gimnasio un socio para esa clase: el primer ingreso desde 90 minutos antes de
-- que empiece hasta que termina (null: no entró).
create or replace function public.gym_clase_ingreso(ficha uuid, inicio timestamptz, fin timestamptz)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return (select min(e.at) from public.gym_entries e
           where e.gym_member_id = ficha and e.result in ('ok', 'cuota_vencida', 'visita')
             and e.at >= inicio - interval '90 minutes' and e.at < fin);
end $$;
revoke all on function public.gym_clase_ingreso(uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- Cuántos tienen lugar, cuántos esperan y cuántos estuvieron presentes en una fecha.
create or replace function public.gym_clase_cuenta(fecha uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare r jsonb;
begin
  if fecha is null then return jsonb_build_object('confirmadas', 0, 'espera', 0, 'presentes', 0); end if;
  select jsonb_build_object('confirmadas', count(*) filter (where b.status = 'confirmada'), 'espera', count(*) filter (where b.status = 'espera'),
           'presentes', count(*) filter (where b.status = 'confirmada'
                                         and coalesce(b.attended, public.gym_clase_ingreso(b.gym_member_id, d.starts_at, d.ends_at) is not null)))
    into r
    from public.gym_class_dates d left join public.gym_bookings b on b.date_id = d.id
   where d.id = fecha;
  return r;
end $$;
revoke all on function public.gym_clase_cuenta(uuid) from public, anon, authenticated;

-- A quién se avisa por una reserva: su cuenta (push) o, sin app, su ficha (mail).
create or replace function public.gym_clase_aviso(g uuid, reserva uuid, tipo text, datos jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare m record;
begin
  select x.id, x.member_id into m from public.gym_bookings b join public.gym_members x on x.id = b.gym_member_id where b.id = reserva;
  if m.id is null then return; end if;
  perform public.gym_alerta(g, case when m.member_id is not null then 'u:' || m.member_id else 'f:' || m.id end, tipo, reserva::text,
                            case when m.member_id is not null then 'push' else 'mail' end, datos);
end $$;
revoke all on function public.gym_clase_aviso(uuid, uuid, text, jsonb) from public, anon, authenticated;

-- La lista de espera se llena sola: mientras haya lugar, el primero que espera pasa a confirmada y se
-- le avisa. Con la fecha ya bloqueada (gym_clase_fecha o «for update»). Solo antes de que empiece y si
-- no está cancelada. Devuelve cuántos pasaron.
create or replace function public.gym_clase_promover(fecha uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare d record; b record; n int := 0;
begin
  select x.*, c.capacity, c.name into d from public.gym_class_dates x join public.gym_classes c on c.id = x.class_id where x.id = fecha;
  if d.id is null or d.cancelled_at is not null or d.starts_at <= now() then return 0; end if;
  loop
    exit when (select count(*) from public.gym_bookings x where x.date_id = fecha and x.status = 'confirmada') >= d.capacity;
    select x.* into b from public.gym_bookings x where x.date_id = fecha and x.status = 'espera' order by x.queued_at, x.id limit 1 for update;
    exit when b.id is null;
    update public.gym_bookings set status = 'confirmada', promoted_at = now() where gym_bookings.id = b.id;
    perform public.gym_clase_aviso(d.gym_id, b.id, 'clase_lugar', jsonb_build_object('clase', d.name, 'inicio', d.starts_at, 'reserva', b.id));
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.gym_clase_promover(uuid) from public, anon, authenticated;

-- Reservar (o anotar) una ficha en una fecha ya bloqueada: con lugar, confirmada; si no, a la espera
-- (hasta 30). Si ya tenía una reserva, devuelve esa; si la había cancelado, vuelve (al final de la
-- espera, si no hay lugar).
create or replace function public.gym_clase_reservar_en(g uuid, fecha uuid, ficha uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare d record; b record; conf int; esp int; est text; rid uuid;
begin
  select x.*, c.capacity into d from public.gym_class_dates x join public.gym_classes c on c.id = x.class_id where x.id = fecha;
  perform public.gym_clase_promover(fecha);
  select x.* into b from public.gym_bookings x where x.date_id = fecha and x.gym_member_id = ficha for update;
  if b.id is not null and b.status <> 'cancelada' then
    return jsonb_build_object('reserva', b.id, 'estado', b.status, 'repetida', true,
      'posicion', case when b.status = 'espera' then (select count(*) from public.gym_bookings x where x.date_id = fecha and x.status = 'espera'
                                                        and (x.queued_at, x.id) <= (b.queued_at, b.id)) end);
  end if;
  select count(*) filter (where x.status = 'confirmada'), count(*) filter (where x.status = 'espera') into conf, esp
    from public.gym_bookings x where x.date_id = fecha;
  if conf < d.capacity then est := 'confirmada';
  elsif esp >= 30 then raise exception 'La clase está llena y la lista de espera también.' using errcode = 'P0001';
  else est := 'espera';
  end if;
  if b.id is null then
    insert into public.gym_bookings (gym_id, date_id, gym_member_id, status, by_user)
    values (g, fecha, ficha, est, auth.uid()) returning gym_bookings.id into rid;
  else
    update public.gym_bookings set status = est, queued_at = clock_timestamp(), promoted_at = null, cancelled_at = null, cancelled_by = null,
           attended = null, attended_by = null, attended_at = null, by_user = auth.uid()
     where gym_bookings.id = b.id;
    rid := b.id;
  end if;
  return jsonb_build_object('reserva', rid, 'estado', est, 'repetida', false,
    'posicion', case when est = 'espera' then esp + 1 end);
end $$;
revoke all on function public.gym_clase_reservar_en(uuid, uuid, uuid) from public, anon, authenticated;

-- Avisa a quien tenía lugar o esperaba en una fecha que se canceló. Devuelve a cuántos.
create or replace function public.gym_clase_avisar_cancelada(fecha uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare d record; b record; n int := 0;
begin
  select x.*, c.name into d from public.gym_class_dates x join public.gym_classes c on c.id = x.class_id where x.id = fecha;
  for b in select x.id from public.gym_bookings x where x.date_id = fecha and x.status <> 'cancelada' order by x.queued_at loop
    perform public.gym_clase_aviso(d.gym_id, b.id, 'clase_cancelada', jsonb_build_object('clase', d.name, 'inicio', d.starts_at, 'motivo', d.cancel_reason));
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.gym_clase_avisar_cancelada(uuid) from public, anon, authenticated;

-- La ficha del socio que llama (activa, pausada o visita, en un gimnasio abierto), o nulls.
create or replace function public.gym_clases_mi_ficha()
returns table (id uuid, gym_id uuid, status text, visita_hasta date, fee_type_id uuid, fee_due date)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  select x.id, x.gym_id, x.status, x.visita_hasta, x.fee_type_id, x.fee_due
    from public.gym_members x join public.gyms y on y.id = x.gym_id and y.closed_at is null
   where x.member_id = auth.uid() and x.status in ('activo', 'pausado', 'visita')
   limit 1;
end $$;
revoke all on function public.gym_clases_mi_ficha() from public, anon, authenticated;


-- ===== La grilla (dueño y administración) =====

-- Las clases de la grilla. Dueño, administración y recepción: todas (las archivadas, solo dueño y
-- administración); profe: las suyas.
create or replace function public.gym_clases()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare s record;
begin
  select * into s from public.gym_exigir_clases(false);
  return coalesce((select jsonb_agg(public.gym_clase_json(c.id) order by c.archived_at is not null, c.weekday, c.start_time, c.name)
    from public.gym_classes c
   where c.gym_id = s.g and (s.rol <> 'profe' or c.trainer_id = auth.uid())
     and (c.archived_at is null or s.rol in ('owner', 'admin'))), '[]'::jsonb);
end $$;
revoke all on function public.gym_clases() from public, anon;
grant execute on function public.gym_clases() to authenticated;

-- Crear (id null) o cambiar una clase. datos: nombre, profe (uuid o null), dia (1 lunes … 7 domingo),
-- hora («19:00»), duracion (minutos), cupo, sala y, al crear, desde (por defecto, hoy). El día no se
-- cambia (se archiva y se crea otra). Cambiar la hora o la duración mueve las fechas que no
-- empezaron; subir el cupo pasa a confirmada a quienes esperaban.
create or replace function public.gym_clase_guardar(id uuid, datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare g uuid := public.gym_exigir(array['owner', 'admin']); c record; k text; n text; pr uuid; dia int; hora time; dur int; cupo int; sala text; desde date;
        hoy date := public.gym_hoy(); nuevo uuid; f record;
begin
  if not public.gym_operativo(g) then raise exception 'Las clases están pausadas en este momento.' using errcode = 'P0001'; end if;
  if datos is null or jsonb_typeof(datos) <> 'object' then raise exception 'Revisá los datos de la clase.' using errcode = 'P0001'; end if;
  for k in select jsonb_object_keys(datos) loop
    if k not in ('nombre', 'profe', 'dia', 'hora', 'duracion', 'cupo', 'sala', 'desde') then
      raise exception 'No se puede cambiar «%».', k using errcode = 'P0001';
    end if;
  end loop;
  select x.* into c from public.gym_classes x where x.id = gym_clase_guardar.id and x.gym_id = g for update;
  if gym_clase_guardar.id is not null and c.id is null then raise exception 'No encontramos esa clase.' using errcode = 'P0001'; end if;
  if c.archived_at is not null then raise exception 'Esa clase está archivada.' using errcode = 'P0001'; end if;
  begin
    n := btrim(coalesce(datos->>'nombre', c.name, ''));
    pr := case when datos ? 'profe' then (datos->>'profe')::uuid else c.trainer_id end;
    dia := coalesce((datos->>'dia')::int, c.weekday);
    hora := coalesce((datos->>'hora')::time, c.start_time);
    dur := coalesce((datos->>'duracion')::int, c.minutes, 60);
    cupo := coalesce((datos->>'cupo')::int, c.capacity);
    sala := case when datos ? 'sala' then nullif(btrim(datos->>'sala'), '') else c.room end;
    desde := case when c.id is null then coalesce((datos->>'desde')::date, hoy) else c.starts_on end;
  exception when others then
    raise exception 'Revisá los datos de la clase.' using errcode = 'P0001';
  end;
  if char_length(n) not between 2 and 60 then raise exception 'El nombre de la clase tiene que tener entre 2 y 60 letras.' using errcode = 'P0001'; end if;
  if dia is null or dia not between 1 and 7 then raise exception 'Elegí el día de la semana.' using errcode = 'P0001'; end if;
  if hora is null or hora <> date_trunc('minute', hora::interval)::time then raise exception 'Revisá la hora de la clase.' using errcode = 'P0001'; end if;
  if dur is null or dur not between 15 and 240 then raise exception 'La clase dura entre 15 minutos y 4 horas.' using errcode = 'P0001'; end if;
  if cupo is null or cupo not between 1 and 500 then raise exception 'El cupo va de 1 a 500 personas.' using errcode = 'P0001'; end if;
  if char_length(coalesce(sala, '')) > 60 then raise exception 'El nombre de la sala es muy largo (hasta 60 letras).' using errcode = 'P0001'; end if;
  if c.id is not null and datos ? 'desde' and (datos->>'desde')::date is distinct from c.starts_on then
    raise exception 'Desde cuándo se da no se cambia: archivá la clase y creá otra.' using errcode = 'P0001';
  end if;
  if c.id is null and (desde < hoy or desde > hoy + 365) then raise exception 'Revisá desde cuándo se da: de hoy a un año.' using errcode = 'P0001'; end if;
  if c.id is not null and dia <> c.weekday then
    raise exception 'El día de una clase no se cambia: archivala y creá otra para ese día.' using errcode = 'P0001';
  end if;
  if pr is not null and coalesce(public.gym_role(g, pr), '') not in ('owner', 'admin', 'profe') then
    raise exception 'El profe de la clase tiene que ser del equipo del gimnasio.' using errcode = 'P0001';
  end if;
  if c.id is null then
    insert into public.gym_classes (gym_id, name, trainer_id, weekday, start_time, minutes, capacity, room, starts_on, created_by)
    values (g, n, pr, dia, hora, dur, cupo, sala, desde, auth.uid()) returning gym_classes.id into nuevo;
  else
    update public.gym_classes set name = n, trainer_id = pr, start_time = hora, minutes = dur, capacity = cupo, room = sala where gym_classes.id = c.id;
    nuevo := c.id;
    -- Las fechas que no empezaron: con la hora nueva y, si subió el cupo, la espera pasa sola.
    for f in select x.id, x.day from public.gym_class_dates x where x.class_id = c.id and x.starts_at > now() order by x.id for update loop
      update public.gym_class_dates set starts_at = (f.day + hora) at time zone 'America/Argentina/Buenos_Aires',
             ends_at = ((f.day + hora) at time zone 'America/Argentina/Buenos_Aires') + make_interval(mins => dur)
       where gym_class_dates.id = f.id and (hora <> c.start_time or dur <> c.minutes);
      perform public.gym_clase_promover(f.id);
    end loop;
  end if;
  perform public.gym_auditar(g, 'clase_guardar', null, null, jsonb_build_object('id', nuevo, 'antes', case when c.id is not null then public.gym_clase_json(c.id) - 'id' end,
    'nombre', n, 'profe', pr, 'dia', dia, 'hora', to_char(hora, 'HH24:MI'), 'duracion', dur, 'cupo', cupo, 'sala', sala));
  return public.gym_clase_json(nuevo);
end $$;
revoke all on function public.gym_clase_guardar(uuid, jsonb) from public, anon;
grant execute on function public.gym_clase_guardar(uuid, jsonb) to authenticated;

-- Archivar una clase: no se da más. Las fechas que venían (sin empezar) con reservas se cancelan y
-- se avisa a quien había reservado.
create or replace function public.gym_clase_archivar(id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare g uuid := public.gym_exigir(array['owner', 'admin']); c record; f record; n int := 0;
begin
  if not public.gym_operativo(g) then raise exception 'Las clases están pausadas en este momento.' using errcode = 'P0001'; end if;
  select x.* into c from public.gym_classes x where x.id = gym_clase_archivar.id and x.gym_id = g for update;
  if c.id is null then raise exception 'No encontramos esa clase.' using errcode = 'P0001'; end if;
  if c.archived_at is not null then return jsonb_build_object('ok', true, 'avisados', 0); end if;
  update public.gym_classes set archived_at = now() where gym_classes.id = c.id;
  for f in select x.id from public.gym_class_dates x where x.class_id = c.id and x.starts_at > now() and x.cancelled_at is null order by x.id for update loop
    update public.gym_class_dates set cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = 'La clase dejó de darse.' where gym_class_dates.id = f.id;
    n := n + public.gym_clase_avisar_cancelada(f.id);
  end loop;
  perform public.gym_auditar(g, 'clase_archivar', null, null, jsonb_build_object('id', c.id, 'nombre', c.name, 'avisados', n));
  return jsonb_build_object('ok', true, 'avisados', n);
end $$;
revoke all on function public.gym_clase_archivar(uuid) from public, anon;
grant execute on function public.gym_clase_archivar(uuid) to authenticated;

-- Cancelar una fecha puntual (cancelar = true, con un motivo opcional que ven los socios) o volver a
-- darla (false). Solo antes de que empiece. Al cancelar se avisa a quien tenía lugar o esperaba; las
-- reservas quedan como estaban (si se vuelve a dar, siguen).
create or replace function public.gym_clase_cancelar(clase uuid, dia date, motivo text, cancelar boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare g uuid := public.gym_exigir(array['owner', 'admin']); fid uuid; d record; n int := 0; mot text := nullif(left(btrim(coalesce(motivo, '')), 200), '');
begin
  if not public.gym_operativo(g) then raise exception 'Las clases están pausadas en este momento.' using errcode = 'P0001'; end if;
  if cancelar is null then raise exception 'Revisá qué querés hacer con la clase.' using errcode = 'P0001'; end if;
  fid := public.gym_clase_fecha(g, clase, dia);
  select x.* into d from public.gym_class_dates x where x.id = fid;
  if d.starts_at <= now() then raise exception 'Esa clase ya empezó: no se puede cambiar.' using errcode = 'P0001'; end if;
  if cancelar then
    if d.cancelled_at is null then
      update public.gym_class_dates set cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = mot where gym_class_dates.id = fid;
      n := public.gym_clase_avisar_cancelada(fid);
    end if;
  elsif d.cancelled_at is not null then
    update public.gym_class_dates set cancelled_at = null, cancelled_by = null, cancel_reason = null where gym_class_dates.id = fid;
    perform public.gym_clase_promover(fid);
  end if;
  perform public.gym_auditar(g, case when cancelar then 'clase_cancelar' else 'clase_reabrir' end, null, null,
    jsonb_build_object('clase', clase, 'dia', dia, 'motivo', mot, 'avisados', n));
  return jsonb_build_object('fecha', fid, 'cancelada', cancelar, 'avisados', n);
end $$;
revoke all on function public.gym_clase_cancelar(uuid, date, text, boolean) from public, anon;
grant execute on function public.gym_clase_cancelar(uuid, date, text, boolean) to authenticated;

-- Los interruptores de las clases (dueño y administración): clases_reservar_horas y
-- clases_cancelar_horas (0 a 72), clases_dias (1 a 28) y clases_cuota_bloquea.
create or replace function public.gym_clases_config(patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare g uuid := public.gym_exigir(array['owner', 'admin']); k text; v jsonb; cfg jsonb := '{}'::jsonb;
begin
  if patch is null or jsonb_typeof(patch) <> 'object' then raise exception 'Revisá los interruptores.' using errcode = 'P0001'; end if;
  for k, v in select * from jsonb_each(patch) loop
    if k = 'clases_cuota_bloquea' then
      if jsonb_typeof(v) <> 'boolean' then raise exception 'Revisá «%».', k using errcode = 'P0001'; end if;
    elsif k in ('clases_reservar_horas', 'clases_cancelar_horas', 'clases_dias') then
      if jsonb_typeof(v) <> 'number' or (v #>> '{}')::numeric <> floor((v #>> '{}')::numeric)
         or (k = 'clases_dias' and (v #>> '{}')::numeric not between 1 and 28) or (k <> 'clases_dias' and (v #>> '{}')::numeric not between 0 and 72) then
        raise exception '%', case when k = 'clases_dias' then 'Se puede reservar de 1 a 28 días para adelante.' else 'Las horas van de 0 a 72.' end using errcode = 'P0001';
      end if;
    else
      raise exception 'No se puede cambiar «%».', k using errcode = 'P0001';
    end if;
    cfg := cfg || jsonb_build_object(k, v);
  end loop;
  update public.gyms set settings = coalesce(settings, '{}'::jsonb) || cfg where gyms.id = g;
  perform public.gym_auditar(g, 'config', null, null, jsonb_build_object('cambio', jsonb_build_object('settings', cfg)));
  return jsonb_build_object('gym', public.gym_json(g), 'settings', public.gym_settings(g), 'clases', public.gym_clases_cfg(g));
end $$;
revoke all on function public.gym_clases_config(jsonb) from public, anon;
grant execute on function public.gym_clases_config(jsonb) to authenticated;


-- ===== La semana y la lista (el equipo) =====

-- Las clases de 7 días desde «desde» (null: hoy), con cuántos tienen lugar, esperan y estuvieron.
-- Dueño, administración y recepción: todas; profe: las suyas.
create or replace function public.gym_clases_semana(desde date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare s record; hoy date := public.gym_hoy(); d0 date := coalesce(desde, public.gym_hoy());
begin
  select * into s from public.gym_exigir_clases(false);
  if d0 < hoy - 400 or d0 > hoy + 120 then raise exception 'Revisá la fecha.' using errcode = 'P0001'; end if;
  return jsonb_build_object('desde', d0, 'hasta', d0 + 6, 'hoy', hoy, 'cfg', public.gym_clases_cfg(s.g),
    'clases', coalesce((select jsonb_agg(jsonb_build_object('clase', c.id, 'fecha', o.dia, 'fecha_id', o.fecha, 'nombre', c.name,
               'profe', case when c.trainer_id is not null then jsonb_build_object('id', c.trainer_id, 'name', p.full_name) end,
               'hora', to_char(o.inicio at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI'),
               'fin', to_char(o.fin at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI'),
               'cupo', c.capacity, 'sala', c.room, 'cancelada', o.cancelada is not null, 'motivo', o.motivo,
               'empezo', o.inicio <= now(), 'termino', o.fin <= now(), 'archivada', c.archived_at is not null) || public.gym_clase_cuenta(o.fecha)
               order by o.inicio, c.name)
      from public.gym_clases_ocurrencias(s.g, d0, d0 + 6) o join public.gym_classes c on c.id = o.clase
      left join public.profiles p on p.id = c.trainer_id
     where s.rol <> 'profe' or c.trainer_id = auth.uid()), '[]'::jsonb));
end $$;
revoke all on function public.gym_clases_semana(date) from public, anon;
grant execute on function public.gym_clases_semana(date) to authenticated;

-- La lista de una clase en una fecha: quién tiene lugar (con el presente) y quién espera (en orden).
-- Dueño, administración, recepción y el profe de esa clase.
create or replace function public.gym_clase_alumnos(clase uuid, dia date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare s record; c record; o record;
begin
  select * into s from public.gym_exigir_clases(false);
  select x.* into c from public.gym_classes x where x.id = clase and x.gym_id = s.g;
  if c.id is null then raise exception 'No encontramos esa clase.' using errcode = 'P0001'; end if;
  if s.rol = 'profe' and c.trainer_id is distinct from auth.uid() then
    raise exception 'No tenés permiso para hacer esto en el gimnasio.' using errcode = '42501';
  end if;
  select x.* into o from public.gym_clases_ocurrencias(s.g, dia, dia) x where x.clase = c.id;
  if o.clase is null then raise exception 'Esa clase no se da ese día.' using errcode = 'P0001'; end if;
  return jsonb_build_object('clase', public.gym_clase_json(c.id), 'fecha', dia, 'fecha_id', o.fecha,
    'hora', to_char(o.inicio at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI'), 'fin', to_char(o.fin at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI'),
    'inicio', o.inicio, 'cancelada', o.cancelada is not null, 'motivo', o.motivo, 'empezo', o.inicio <= now(), 'termino', o.fin <= now(),
    'se_marca', now() >= o.inicio - interval '60 minutes' and dia >= public.gym_hoy() - 7,
    'canceladas', (select count(*) from public.gym_bookings b where b.date_id = o.fecha and b.status = 'cancelada'),
    'alumnos', coalesce((select jsonb_agg(jsonb_build_object('reserva', x.id, 'ficha', x.ficha, 'nombre', x.nombre, 'foto_path', x.foto_path, 'estado', x.status,
                 'posicion', case when x.status = 'espera' then x.pos end, 'promovida', x.promoted_at is not null, 'sin_app', x.member_id is null,
                 'ingreso', x.ingreso, 'marcado', x.attended, 'presente', case when x.status = 'confirmada' then coalesce(x.attended, x.ingreso is not null) end)
                 order by x.status <> 'confirmada', case when x.status = 'confirmada' then x.nombre end, x.pos)
      from (select b.id, b.status, b.promoted_at, b.attended, m.id as ficha, m.member_id, m.foto_path, coalesce(nullif(m.full_name, ''), p.full_name) as nombre,
                   public.gym_clase_ingreso(m.id, o.inicio, o.fin) as ingreso,
                   row_number() over (partition by b.status order by b.queued_at, b.id) as pos
              from public.gym_bookings b join public.gym_members m on m.id = b.gym_member_id left join public.profiles p on p.id = m.member_id
             where b.date_id = o.fecha and b.status <> 'cancelada') x), '[]'::jsonb));
end $$;
revoke all on function public.gym_clase_alumnos(uuid, date) from public, anon;
grant execute on function public.gym_clase_alumnos(uuid, date) to authenticated;

-- Marcar el presente (true), el ausente (false) o volver a «sale del ingreso» (null). El profe de la
-- clase, la recepción, el dueño y la administración; desde una hora antes de que empiece y hasta una
-- semana después.
create or replace function public.gym_clase_presente(reserva uuid, presente boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare s record; r record;
begin
  select * into s from public.gym_exigir_clases(true);
  select b.id, b.status, b.gym_member_id, m.member_id, d.starts_at, d.ends_at, d.day, d.cancelled_at, c.trainer_id, c.name into r
    from public.gym_bookings b join public.gym_class_dates d on d.id = b.date_id join public.gym_classes c on c.id = d.class_id
    join public.gym_members m on m.id = b.gym_member_id
   where b.id = reserva and b.gym_id = s.g;
  if r.id is null then raise exception 'No encontramos esa reserva.' using errcode = 'P0001'; end if;
  if s.rol = 'profe' and r.trainer_id is distinct from auth.uid() then
    raise exception 'No tenés permiso para hacer esto en el gimnasio.' using errcode = '42501';
  end if;
  if r.cancelled_at is not null then raise exception 'Esa clase está cancelada.' using errcode = 'P0001'; end if;
  if r.status <> 'confirmada' then raise exception 'El presente se marca a quien tiene lugar en la clase.' using errcode = 'P0001'; end if;
  if now() < r.starts_at - interval '60 minutes' then raise exception 'El presente se marca desde una hora antes de la clase.' using errcode = 'P0001'; end if;
  if r.day < public.gym_hoy() - 7 then raise exception 'Pasó más de una semana: el presente ya no se cambia.' using errcode = 'P0001'; end if;
  update public.gym_bookings set attended = presente, attended_by = case when presente is not null then auth.uid() end,
         attended_at = case when presente is not null then now() end
   where gym_bookings.id = r.id;
  perform public.gym_auditar(s.g, 'clase_presente', r.gym_member_id, r.member_id, jsonb_build_object('reserva', r.id, 'clase', r.name, 'presente', presente));
  return jsonb_build_object('reserva', r.id, 'marcado', presente,
    'presente', coalesce(presente, public.gym_clase_ingreso(r.gym_member_id, r.starts_at, r.ends_at) is not null));
end $$;
revoke all on function public.gym_clase_presente(uuid, boolean) from public, anon;
grant execute on function public.gym_clase_presente(uuid, boolean) to authenticated;

-- Anotar a un socio en una clase desde el mostrador (dueño, administración y recepción): también una
-- ficha sin app. Sin los límites de horas ni el de la cuota; con el cupo (si está llena, a la espera).
-- Hasta que la clase termina.
create or replace function public.gym_clase_anotar(clase uuid, dia date, ficha uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare s record; m record; fid uuid; d record; r jsonb;
begin
  select * into s from public.gym_exigir_clases(true);
  if s.rol not in ('owner', 'admin', 'recepcion') then raise exception 'No tenés permiso para hacer esto en el gimnasio.' using errcode = '42501'; end if;
  select x.id, x.member_id, x.status into m from public.gym_members x where x.id = ficha and x.gym_id = s.g;
  if m.id is null or m.status not in ('activo', 'visita') then raise exception 'Solo se anotan socios activos o visitas.' using errcode = 'P0001'; end if;
  fid := public.gym_clase_fecha(s.g, clase, dia);
  select x.* into d from public.gym_class_dates x where x.id = fid;
  if d.cancelled_at is not null then raise exception 'Esa clase está cancelada.' using errcode = 'P0001'; end if;
  if d.ends_at <= now() then raise exception 'Esa clase ya terminó.' using errcode = 'P0001'; end if;
  r := public.gym_clase_reservar_en(s.g, fid, m.id);
  if not (r->>'repetida')::boolean then
    perform public.gym_auditar(s.g, 'clase_anotar', m.id, m.member_id, jsonb_build_object('reserva', r->'reserva', 'clase', clase, 'dia', dia, 'estado', r->'estado'));
  end if;
  return r;
end $$;
revoke all on function public.gym_clase_anotar(uuid, date, uuid) from public, anon;
grant execute on function public.gym_clase_anotar(uuid, date, uuid) to authenticated;

-- Sacar a alguien de una clase (dueño, administración y recepción), a cualquier hora antes de que
-- termine. Si tenía lugar, pasa el primero que espera.
create or replace function public.gym_clase_quitar(reserva uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare s record; b record; d record; n int;
begin
  select * into s from public.gym_exigir_clases(true);
  if s.rol not in ('owner', 'admin', 'recepcion') then raise exception 'No tenés permiso para hacer esto en el gimnasio.' using errcode = '42501'; end if;
  select x.* into b from public.gym_bookings x where x.id = reserva and x.gym_id = s.g;
  if b.id is null then raise exception 'No encontramos esa reserva.' using errcode = 'P0001'; end if;
  select x.* into d from public.gym_class_dates x where x.id = b.date_id for update;
  select x.* into b from public.gym_bookings x where x.id = b.id for update;
  if b.status = 'cancelada' then return jsonb_build_object('ok', true, 'promovidos', 0); end if;
  if d.ends_at <= now() then raise exception 'Esa clase ya terminó.' using errcode = 'P0001'; end if;
  update public.gym_bookings set status = 'cancelada', cancelled_at = now(), cancelled_by = auth.uid() where gym_bookings.id = b.id;
  n := public.gym_clase_promover(d.id);
  perform public.gym_auditar(s.g, 'clase_quitar', b.gym_member_id, (select m.member_id from public.gym_members m where m.id = b.gym_member_id),
    jsonb_build_object('reserva', b.id, 'estaba', b.status, 'promovidos', n));
  return jsonb_build_object('ok', true, 'promovidos', n);
end $$;
revoke all on function public.gym_clase_quitar(uuid) from public, anon;
grant execute on function public.gym_clase_quitar(uuid) to authenticated;


-- ===== El socio =====

-- Las clases de los próximos días (las de hoy que no terminaron, hasta clases_dias), con los lugares
-- libres y su reserva (nunca quién más reservó). null si no tiene ficha activa, pausada o visita.
create or replace function public.gym_mis_clases()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare m record; cfg jsonb; hoy date := public.gym_hoy();
begin
  select * into m from public.gym_clases_mi_ficha();
  if m.id is null then return null; end if;
  cfg := public.gym_clases_cfg(m.gym_id);
  return jsonb_build_object('cfg', cfg, 'hoy', hoy, 'ficha_estado', m.status, 'visita_hasta', m.visita_hasta,
    'cuota_vencida', (cfg->>'cuota_bloquea')::boolean and public.gym_cuota_estado(m.fee_type_id, m.fee_due) = 'vencida',
    'clases', coalesce((select jsonb_agg(jsonb_build_object('clase', c.id, 'fecha', o.dia, 'nombre', c.name, 'profe', p.full_name,
               'hora', to_char(o.inicio at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI'),
               'fin', to_char(o.fin at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI'), 'sala', c.room, 'cupo', c.capacity,
               'libres', greatest(c.capacity - (q.k->>'confirmadas')::int, 0), 'espera', (q.k->>'espera')::int,
               'cancelada', o.cancelada is not null, 'motivo', o.motivo, 'empezo', o.inicio <= now(),
               'cierra', o.inicio - make_interval(hours => (cfg->>'reservar_horas')::int),
               'cancela_hasta', o.inicio - make_interval(hours => (cfg->>'cancelar_horas')::int),
               'reserva', b.id, 'estado', b.status, 'promovida', b.promoted_at is not null,
               'posicion', case when b.status = 'espera' then (select count(*) from public.gym_bookings y where y.date_id = b.date_id and y.status = 'espera'
                                                                and (y.queued_at, y.id) <= (b.queued_at, b.id)) end)
               order by o.inicio, c.name)
      from public.gym_clases_ocurrencias(m.gym_id, hoy, hoy + (cfg->>'dias')::int - 1) o join public.gym_classes c on c.id = o.clase
      left join public.profiles p on p.id = c.trainer_id
      left join public.gym_bookings b on b.date_id = o.fecha and b.gym_member_id = m.id and b.status <> 'cancelada'
      cross join lateral (select public.gym_clase_cuenta(o.fecha) as k) q
     where o.fin > now()), '[]'::jsonb));
end $$;
revoke all on function public.gym_mis_clases() from public, anon;
grant execute on function public.gym_mis_clases() to authenticated;

-- Reservar un lugar (o anotarse en la espera). La ficha activa, o la visita hasta su último día; una
-- pausada no reserva. Desde hoy y hasta clases_dias; cierra clases_reservar_horas antes de empezar.
-- Con clases_cuota_bloquea y la cuota vencida, no. Hasta 10 reservas por delante.
create or replace function public.gym_reservar(clase uuid, dia date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare m record; cfg jsonb; hoy date := public.gym_hoy(); fid uuid; d record; n int; h int;
begin
  if auth.uid() is null then raise exception 'No tenés permiso para hacer esto en el gimnasio.' using errcode = '42501'; end if;
  select * into m from public.gym_clases_mi_ficha();
  if m.id is null then raise exception 'Para reservar clases tenés que ser socio de un gimnasio.' using errcode = 'P0001'; end if;
  if m.status = 'pausado' then raise exception 'Tu lugar en el gimnasio está pausado: cuando vuelvas, vas a poder reservar.' using errcode = 'P0001'; end if;
  if m.status = 'visita' and (m.visita_hasta is null or dia > m.visita_hasta) then raise exception 'Tu visita no llega hasta ese día.' using errcode = 'P0001'; end if;
  if not public.gym_operativo(m.gym_id) then raise exception 'Las reservas están pausadas: hablá con el gimnasio.' using errcode = 'P0001'; end if;
  cfg := public.gym_clases_cfg(m.gym_id);
  if (cfg->>'cuota_bloquea')::boolean and public.gym_cuota_estado(m.fee_type_id, m.fee_due) = 'vencida' then
    raise exception 'Tu cuota está vencida: para reservar, hablá con el gimnasio.' using errcode = 'P0001';
  end if;
  if dia is null or dia < hoy or dia > hoy + (cfg->>'dias')::int - 1 then
    raise exception 'Esa fecha todavía no está abierta para reservar.' using errcode = 'P0001';
  end if;
  fid := public.gym_clase_fecha(m.gym_id, clase, dia);
  select x.* into d from public.gym_class_dates x where x.id = fid;
  if d.cancelled_at is not null then raise exception '%', 'Esa clase está cancelada' || coalesce(': ' || d.cancel_reason, '.') using errcode = 'P0001'; end if;
  h := (cfg->>'reservar_horas')::int;
  if now() >= d.starts_at - make_interval(hours => h) then
    raise exception '%', case when h = 0 then 'La clase ya empezó.' else 'Las reservas cierran ' || h || case when h = 1 then ' hora' else ' horas' end || ' antes de la clase.' end using errcode = 'P0001';
  end if;
  select count(*) into n from public.gym_bookings b join public.gym_class_dates x on x.id = b.date_id
   where b.gym_member_id = m.id and b.status <> 'cancelada' and x.starts_at > now() and x.cancelled_at is null and b.date_id <> fid;
  if n >= 10 then raise exception 'Tenés 10 reservas por delante: cancelá alguna para reservar otra.' using errcode = 'P0001'; end if;
  return public.gym_clase_reservar_en(m.gym_id, fid, m.id);
end $$;
revoke all on function public.gym_reservar(uuid, date) from public, anon;
grant execute on function public.gym_reservar(uuid, date) to authenticated;

-- Cancelar su reserva: con lugar, hasta clases_cancelar_horas antes; en la espera, hasta que empieza.
-- Si tenía lugar, pasa el primero que espera.
create or replace function public.gym_reserva_cancelar(reserva uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare b record; d record; h int; n int;
begin
  select x.* into b from public.gym_bookings x join public.gym_members m on m.id = x.gym_member_id
   where x.id = reserva and m.member_id = auth.uid();
  if b.id is null then raise exception 'No encontramos esa reserva.' using errcode = 'P0001'; end if;
  select x.* into d from public.gym_class_dates x where x.id = b.date_id for update;
  select x.* into b from public.gym_bookings x where x.id = b.id for update;
  if b.status = 'cancelada' then return jsonb_build_object('ok', true, 'estado', 'cancelada', 'promovidos', 0); end if;
  if d.starts_at <= now() then raise exception 'La clase ya empezó.' using errcode = 'P0001'; end if;
  h := (public.gym_clases_cfg(b.gym_id)->>'cancelar_horas')::int;
  if b.status = 'confirmada' and d.cancelled_at is null and now() > d.starts_at - make_interval(hours => h) then
    raise exception '%', 'Ya no se puede cancelar: faltan menos de ' || h || case when h = 1 then ' hora' else ' horas' end || '. Avisá en el gimnasio.' using errcode = 'P0001';
  end if;
  update public.gym_bookings set status = 'cancelada', cancelled_at = now(), cancelled_by = auth.uid() where gym_bookings.id = b.id;
  n := public.gym_clase_promover(d.id);
  return jsonb_build_object('ok', true, 'estado', 'cancelada', 'promovidos', n);
end $$;
revoke all on function public.gym_reserva_cancelar(uuid) from public, anon;
grant execute on function public.gym_reserva_cancelar(uuid) to authenticated;


-- ===== Baja y limpieza =====

-- Una ficha que pasa a baja (salió del gimnasio, la dieron de baja) suelta sus reservas que no
-- empezaron, y la espera de esas clases avanza.
create or replace function public.gym_members_clases_baja()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare f record;
begin
  for f in select distinct d.id from public.gym_bookings b join public.gym_class_dates d on d.id = b.date_id
            where b.gym_member_id = new.id and b.status <> 'cancelada' and d.starts_at > now() order by d.id loop
    perform 1 from public.gym_class_dates x where x.id = f.id for update;
    update public.gym_bookings set status = 'cancelada', cancelled_at = now(), cancelled_by = auth.uid()
     where date_id = f.id and gym_member_id = new.id and status <> 'cancelada';
    perform public.gym_clase_promover(f.id);
  end loop;
  return null;
end $$;
revoke all on function public.gym_members_clases_baja() from public, anon, authenticated;
drop trigger if exists gym_members_clases_baja on public.gym_members;
create trigger gym_members_clases_baja after update of status on public.gym_members
  for each row when (new.status = 'baja' and old.status is distinct from 'baja')
  execute function public.gym_members_clases_baja();

-- Las fechas de hace más de 12 meses se borran con sus reservas y su presente (tarea diaria).
create or replace function public.gym_clases_limpiar()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  delete from public.gym_class_dates where day < (public.gym_hoy() - interval '12 months')::date;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.gym_clases_limpiar() from public, anon, authenticated;
grant execute on function public.gym_clases_limpiar() to service_role;

select cron.unschedule('gize-gym-clases') where exists (select 1 from cron.job where jobname = 'gize-gym-clases');
select cron.schedule('gize-gym-clases', '40 6 * * *', $job$ select public.gym_clases_limpiar(); $job$);

notify pgrst, 'reload schema';


-- ===== Para volver atrás =====
-- Correr esto sin los «-- » (antes que el bloque de gimnasios-cuotas.sql). Se borran la tarea, el
-- trigger, las funciones, las reservas, las fechas, la grilla y los interruptores de las clases.
-- Exportá lo que quieras guardar antes: se borra.
--
-- select cron.unschedule('gize-gym-clases') where exists (select 1 from cron.job where jobname = 'gize-gym-clases');
-- drop trigger if exists gym_members_clases_baja on public.gym_members;
-- drop function if exists public.gym_members_clases_baja(), public.gym_clases_limpiar(), public.gym_reserva_cancelar(uuid),
--   public.gym_reservar(uuid, date), public.gym_mis_clases(), public.gym_clase_quitar(uuid), public.gym_clase_anotar(uuid, date, uuid),
--   public.gym_clase_presente(uuid, boolean), public.gym_clase_alumnos(uuid, date), public.gym_clases_semana(date), public.gym_clases_config(jsonb),
--   public.gym_clase_cancelar(uuid, date, text, boolean), public.gym_clase_archivar(uuid), public.gym_clase_guardar(uuid, jsonb), public.gym_clases(),
--   public.gym_clases_mi_ficha(), public.gym_clase_avisar_cancelada(uuid), public.gym_clase_reservar_en(uuid, uuid, uuid), public.gym_clase_promover(uuid),
--   public.gym_clase_aviso(uuid, uuid, text, jsonb), public.gym_clase_cuenta(uuid), public.gym_clase_ingreso(uuid, timestamptz, timestamptz),
--   public.gym_clase_fecha(uuid, uuid, date), public.gym_clases_ocurrencias(uuid, date, date), public.gym_clase_json(uuid),
--   public.gym_exigir_clases(boolean), public.gym_clases_cfg(uuid);
-- drop table if exists public.gym_bookings;
-- drop table if exists public.gym_class_dates;
-- drop table if exists public.gym_classes;
-- update public.gyms set settings = settings - 'clases_reservar_horas' - 'clases_cancelar_horas' - 'clases_dias' - 'clases_cuota_bloquea'
--  where settings ?| array['clases_reservar_horas', 'clases_cancelar_horas', 'clases_dias', 'clases_cuota_bloquea'];
-- delete from public.gym_alerts where kind in ('clase_lugar', 'clase_cancelada');
-- notify pgrst, 'reload schema';
