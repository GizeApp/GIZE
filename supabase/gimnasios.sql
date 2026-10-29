-- Gimnasios, etapa 0 («Base»): las tablas de «Profes y socios», las funciones de permiso y el cupo
-- cacheado (coach_billing.seats_used). Es la base del panel para gimnasios: un gimnasio con local y
-- varios profes, que paga un solo plan por la cantidad de socios.
-- Correr con el workflow "Supabase" → tarea sql → supabase/gimnasios.sql, después de
-- supabase/bloqueos.sql y supabase/compras-apple.sql. Se puede correr varias veces.
-- Después va supabase/gimnasios-vinculo.sql (las versiones canónicas de coach_active, is_my_client,
-- join_coach y release_lapsed_clients, que usan lo de acá).
--
-- NO CAMBIA NINGÚN COMPORTAMIENTO. Mientras no haya filas de gimnasio nada de esto se usa, y
-- coach_active, is_my_client, join_coach y release_lapsed_clients siguen siendo las de antes hasta
-- que se corra gimnasios-vinculo.sql. Lo único que cambia en tablas que ya existen:
--   · coach_billing.seats_used: el cupo usado de cada plan, cacheado. Lo mantienen triggers (abajo) y
--     al final del archivo se carga para todos. La app lo recibe en select("*") y no lo usa.
--   · coach_messages.gym_id: el gimnasio en el que se mandó cada mensaje. Nadie lo escribe todavía
--     (la etapa 1 lo llena en rapid-worker). Sin clave foránea a propósito: si el gimnasio se borra,
--     el mensaje no tiene que volver a verlo el profe que se fue.
--   · Triggers del cupo en profiles, gym_members, gym_staff y gyms, y uno antes de insertar en
--     coach_billing. Solo escriben seats_used.
--
-- Las tablas (una persona puede ser staff de un solo gimnasio y socio de uno solo):
--   gyms              el gimnasio. Su plan es el de su dueño (owner_id → su fila de coach_billing).
--   gym_staff         dueño, administración, profes y recepción, con su rol (left_at = se fue).
--   gym_invites       links de invitación al equipo (se guarda solo el hash del token).
--   gym_codes         el código del gimnasio para pedir sumarse (8 caracteres, el alfabeto de
--                     my_invite_code; no puede ser el código personal de un coach).
--   gym_members       la ficha de cada socio: con cuenta (member_id) o sin app, con su estado
--                     (pendiente, activo, pausado, visita, baja) y su profe (trainer_id, que sale
--                     solo: ver gym_profe_ficha). Si la cuenta se borra, la ficha queda sin app,
--                     con su estado y sin profe; una solicitud pendiente, en cambio, se borra.
--   gym_member_notes  notas internas de la ficha (aparte: el socio lee su ficha y no las notas).
--   gym_audit         quién hizo qué en el gimnasio (sobrevive al gimnasio: sin clave foránea).
--   gym_alerts        avisos pendientes de mandar (uno por destinatario, tipo y motivo).
--   gym_bajas         constancias de baja de la cuota (B-000123).
--   gym_entries       ingresos (el id lo genera el cliente: un reintento no duplica).
--   gym_turnos        turnos de la recepción en una tablet compartida (etapa 3).
-- Toda columna que apunta a una persona dice qué pasa cuando esa cuenta se borra. Las que solo
-- registran quién hizo algo (created_by, approved_by, invited_by, accepted_by, actor_id, by_user…)
-- no tienen clave foránea: borrar una cuenta nunca choca con un registro (Apple 5.1.1(v)).
-- El PIN de la recepción (etapa 3) no va en gym_staff: el equipo lee esa tabla y el hash de un PIN
-- de 4 a 6 dígitos se adivina sin conexión; va en una tabla aparte sin políticas.
--
-- Quién lee qué (solo lectura por política; escribir es solo por funciones, desde la etapa 1, y
-- ninguna tabla nueva tiene permiso de insert, update ni delete para la app):
--   gyms              su equipo y sus socios (ficha activa, pausada o visita: no quien solo pidió
--                     sumarse con el código, que es público, ni quien se dio de baja).
--   gym_staff         el equipo del mismo gimnasio, y cada uno su propia fila.
--   gym_members       dueño y administración: todas las de su gimnasio; profe: las activas o pausadas
--                     que tiene asignadas; socio: la suya. La recepción, por función (etapa 1).
--   gym_member_notes  dueño, administración y el profe asignado de una ficha activa o pausada (el
--                     socio no, ni las de su ficha).
--   gym_audit         dueño y administración.
--   gym_bajas         dueño y administración, y el socio las suyas.
--   gym_entries       las de las fichas que uno ve (dueño y administración, todas; profe, las de sus
--                     socios; socio, las suyas). La recepción, por función (etapa 1).
--   gym_alerts, gym_invites, gym_codes, gym_turnos: nadie (sin políticas ni permisos).
-- El estado del plan no corta la lectura de estas tablas: son datos administrativos («exportar
-- anda siempre»). Lo que corta el plan son los registros del socio (is_my_client, gym_reads_member).
--
-- Funciones (security definer con search_path fijo; plpgsql, ver «Funciones de permiso»):
--   gym_mi_rol(g), gym_soy_socio(g)  mi rol en el gimnasio g / si tengo ficha activa, pausada o
--                     visita en g. Las usan las políticas: responden solo sobre quien llama.
--   gym_reads_member(socio)  ¿puedo leer los registros de ese socio como dueño o administración?
--                     Solo si su ficha está activa o pausada, aceptó la hoja (terms_at), eligió
--                     compartir (share_admin) y el plan del gimnasio está al día. La usan las
--                     políticas de lectura de la etapa 1.
--   Internas (sin permiso para la app; las llaman otras funciones y el service role, que tiene
--   permiso explícito y no depende de los permisos por defecto del esquema):
--   gym_role(g, u)    el rol activo de u en g.
--   vinculo_gym(p)    el gimnasio del vínculo de p con su coach: p tiene ficha activa o pausada y su
--                     coach (profiles.coach_id) es dueño, admin o profe activo de ESE gimnasio. Si no
--                     (alumno propio, o socio con un coach de afuera), null: el vínculo es propio y
--                     va con el plan del coach, como hoy.
--   gym_de_dueno(c)   el gimnasio abierto del que c es dueño.
--   gym_active(g)     plan del gimnasio = plan del dueño, con 5 días de gracia y sin corte por cupo.
--   gym_operativo(g)  lo mismo con 10 días (recepción, cuotas, clases).
--   recount_seats(c)  cupo usado del plan de c, contado exacto: sus vínculos propios (profiles con
--                     coach_id = c y vinculo_gym null, de cualquier rol, como el count(*) de hoy)
--                     más las fichas activas y pausadas de los gimnasios abiertos de los que es dueño.
--                     Un socio de A con un coach de afuera cuenta en A (la ficha) y en ese coach.
--   seats_drift()     las filas de coach_billing donde seats_used no coincide con recount_seats
--                     (tiene que dar vacío siempre).
--   gym_profe_ficha(g, socio, estado)  el profe que le toca a una ficha: el coach de la persona si la
--                     ficha está activa o pausada y ese coach es dueño, admin o profe activo de g; si
--                     no, null. Lo aplica el trigger gym_members_profe en cada escritura de la ficha.
--
-- Cupo cacheado: seats_used = recount_seats(coach_id), siempre. Lo recalculan triggers por fila
-- cuando cambia algo que lo afecta: profiles (coach_id, alta y baja de cuentas, también por las
-- cascadas), gym_members (estado, cuenta, gimnasio), gym_staff (alta, rol, salida) y gyms (dueño,
-- cierre). Con la marca gize.gym_bulk (set_config(…, 'on', true), la prenden las operaciones masivas)
-- no recalculan por fila: la operación recalcula una vez al final. seats_used se usa solo para leer
-- (coach_active en las políticas); donde se aplica el cupo (join_coach) se cuenta exacto con
-- recount_seats y la fila de coach_billing bloqueada.
-- Orden de bloqueo: la fila de coach_billing se bloquea siempre al final, después de las de profiles
-- y de las tablas de gimnasios (gym_recontar). Una función que bloquee coach_billing antes de cambiar
-- un perfil se tranca con quien cambia ese perfil desde la app (desvincularse en Ajustes): bloquear
-- antes el perfil, como join_coach.
--
-- Para volver atrás: el bloque comentado del final (antes, el de gimnasios-vinculo.sql).


-- ===== Tablas =====

create table if not exists public.gyms (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  slug               text unique,                 -- gize.ar/g/<slug>: horario público (etapa 3)
  owner_id           uuid references public.profiles(id) on delete set null,  -- su coach_billing = el plan
  city               text,
  province           text,
  address            text,
  whatsapp           text,
  contact_email      text,
  default_trainer_id uuid references public.profiles(id) on delete set null,  -- profe para las solicitudes
  settings           jsonb not null default '{}'::jsonb,                      -- interruptores del gimnasio
  dpa_version        text not null,                -- contrato de encargo aceptado al crear
  dpa_at             timestamptz not null,
  brand              jsonb,                        -- marca propia (fase 3)
  created_at         timestamptz not null default now(),
  lapsed_at          timestamptz,                  -- vínculos liberados por plan vencido
  closed_at          timestamptz,
  close_reason       text,
  purge_after        timestamptz                   -- cerrado por baja del dueño: se borra a los 90 días
);
alter table public.gyms drop constraint if exists gyms_name_check;
alter table public.gyms add constraint gyms_name_check check (char_length(name) between 2 and 80);
alter table public.gyms drop constraint if exists gyms_slug_check;
alter table public.gyms add constraint gyms_slug_check check (slug ~ '^[a-z0-9](-?[a-z0-9])*$' and char_length(slug) between 3 and 40);
alter table public.gyms drop constraint if exists gyms_settings_check;
alter table public.gyms add constraint gyms_settings_check check (jsonb_typeof(settings) = 'object');
alter table public.gyms drop constraint if exists gyms_close_reason_check;
alter table public.gyms add constraint gyms_close_reason_check check (close_reason in ('dueño', 'baja_cuenta_dueño', 'admin'));
alter table public.gyms drop constraint if exists gyms_closed_check;
alter table public.gyms add constraint gyms_closed_check check ((closed_at is null) = (close_reason is null));
-- Un gimnasio abierto por dueño. (Sin «owner_id no nulo salvo cerrado»: haría fallar el borrado de la
-- cuenta del dueño hasta que la etapa 1 cierre el gimnasio antes de borrarla.)
create unique index if not exists gyms_one_per_owner on public.gyms(owner_id) where closed_at is null and owner_id is not null;
create index if not exists gyms_owner_idx on public.gyms(owner_id) where owner_id is not null;
create index if not exists gyms_default_trainer_idx on public.gyms(default_trainer_id) where default_trainer_id is not null;

create table if not exists public.gym_staff (
  gym_id     uuid not null references public.gyms(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       text not null,
  invited_by uuid,
  joined_at  timestamptz not null default now(),
  left_at    timestamptz,
  primary key (gym_id, user_id)
);
alter table public.gym_staff drop constraint if exists gym_staff_role_check;
alter table public.gym_staff add constraint gym_staff_role_check check (role in ('owner', 'admin', 'profe', 'recepcion'));
create unique index if not exists gym_staff_one_gym on public.gym_staff(user_id) where left_at is null;   -- staff de un solo gimnasio
create unique index if not exists gym_staff_one_owner on public.gym_staff(gym_id) where role = 'owner' and left_at is null;
create index if not exists gym_staff_gym_idx on public.gym_staff(gym_id) where left_at is null;
create index if not exists gym_staff_user_idx on public.gym_staff(user_id);

create table if not exists public.gym_invites (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  role        text not null,
  email       text,
  token_hash  bytea not null unique,
  expires_at  timestamptz not null,
  invited_by  uuid,
  created_at  timestamptz not null default now(),
  accepted_by uuid,
  accepted_at timestamptz
);
alter table public.gym_invites drop constraint if exists gym_invites_role_check;
alter table public.gym_invites add constraint gym_invites_role_check check (role in ('admin', 'profe', 'recepcion'));   -- al dueño no se lo invita
create index if not exists gym_invites_gym_idx on public.gym_invites(gym_id);

create table if not exists public.gym_codes (
  code       text primary key,
  gym_id     uuid not null references public.gyms(id) on delete cascade,
  kind       text not null default 'gym',        -- 'gym_profe' queda reservado para la fase 2
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table public.gym_codes drop constraint if exists gym_codes_code_check;
alter table public.gym_codes add constraint gym_codes_code_check check (code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$');
alter table public.gym_codes drop constraint if exists gym_codes_kind_check;
alter table public.gym_codes add constraint gym_codes_kind_check check (kind in ('gym', 'gym_profe'));
create unique index if not exists gym_codes_one_active on public.gym_codes(gym_id, kind) where revoked_at is null;
create index if not exists gym_codes_gym_idx on public.gym_codes(gym_id);

create table if not exists public.gym_members (
  id                  uuid primary key default gen_random_uuid(),
  gym_id              uuid not null references public.gyms(id) on delete cascade,
  member_id           uuid references public.profiles(id) on delete set null,   -- null = ficha sin app
  full_name           text not null,              -- puede venir vacío desde el perfil
  dni                 text,
  phone               text,
  email               text,
  birthdate           date,
  status              text not null,
  -- El profe del gimnasio: igual a profiles.coach_id SOLO cuando ese coach es staff de este gimnasio.
  -- null = sin profe, o con un coach de afuera (el panel lo distingue mirando profiles.coach_id).
  trainer_id          uuid references public.profiles(id) on delete set null,
  restore_trainer_id  uuid references public.profiles(id) on delete set null,   -- se guarda al liberar por plan vencido
  paused_until        date,
  visita_hasta        date,
  visita_tipo         text,
  fee_type_id         uuid,                       -- → gym_fee_types: la clave foránea llega con las cuotas (etapa 2)
  descuento_pct       numeric(5,2),
  descuento_monto     numeric(12,2),
  apto_medico_vence   date,
  terms_at            timestamptz,                -- aceptó la hoja «para ser socio»
  terms_version       text,
  share_admin         boolean not null default false,   -- casilla opcional: compartir registros con la administración
  share_admin_at      timestamptz,
  share_admin_version text,
  invite_token_hash   bytea,                      -- link #unirme= (un uso, 7 días)
  invite_expires_at   timestamptz,
  source              text,
  requested_at        timestamptz,
  approved_by         uuid,
  joined_at           timestamptz not null default now(),
  left_at             timestamptz,
  baja_motivo         text,
  created_by          uuid
);
alter table public.gym_members drop constraint if exists gym_members_status_check;
alter table public.gym_members add constraint gym_members_status_check check (status in ('pendiente', 'activo', 'pausado', 'visita', 'baja'));
alter table public.gym_members drop constraint if exists gym_members_full_name_check;
alter table public.gym_members add constraint gym_members_full_name_check check (char_length(full_name) <= 120);
alter table public.gym_members drop constraint if exists gym_members_visita_tipo_check;
alter table public.gym_members add constraint gym_members_visita_tipo_check check (visita_tipo in ('pase_diario', 'prueba', 'wellhub', 'otro'));
alter table public.gym_members drop constraint if exists gym_members_descuento_pct_check;
alter table public.gym_members add constraint gym_members_descuento_pct_check check (descuento_pct between 0 and 100);
alter table public.gym_members drop constraint if exists gym_members_descuento_monto_check;
alter table public.gym_members add constraint gym_members_descuento_monto_check check (descuento_monto >= 0);
alter table public.gym_members drop constraint if exists gym_members_source_check;
alter table public.gym_members add constraint gym_members_source_check check (source in ('codigo', 'ficha', 'csv', 'conversion', 'visita'));
-- Una solicitud pendiente no tiene profe y sabe cuándo se pidió; una visita sabe hasta cuándo.
alter table public.gym_members drop constraint if exists gym_members_pendiente_check;
alter table public.gym_members add constraint gym_members_pendiente_check check (status <> 'pendiente' or (trainer_id is null and requested_at is not null));
alter table public.gym_members drop constraint if exists gym_members_visita_check;
alter table public.gym_members add constraint gym_members_visita_check check (status <> 'visita' or visita_hasta is not null);
-- Un gimnasio por persona (también con una solicitud pendiente) y un DNI por gimnasio.
create unique index if not exists gym_members_one_gym on public.gym_members(member_id) where member_id is not null and status <> 'baja';
create unique index if not exists gym_members_dni on public.gym_members(gym_id, dni) where dni is not null and status <> 'baja';
create unique index if not exists gym_members_invite_token on public.gym_members(invite_token_hash) where invite_token_hash is not null;
create index if not exists gym_members_gym_status_idx on public.gym_members(gym_id, status);
create index if not exists gym_members_trainer_idx on public.gym_members(trainer_id);
create index if not exists gym_members_vigente_idx on public.gym_members(member_id) where status in ('activo', 'pausado');
create index if not exists gym_members_member_idx on public.gym_members(member_id) where member_id is not null;
create index if not exists gym_members_restore_idx on public.gym_members(restore_trainer_id) where restore_trainer_id is not null;

create table if not exists public.gym_member_notes (
  gym_member_id uuid primary key references public.gym_members(id) on delete cascade,
  body          text not null,
  updated_by    uuid,
  updated_at    timestamptz not null default now()
);
alter table public.gym_member_notes drop constraint if exists gym_member_notes_body_check;
alter table public.gym_member_notes add constraint gym_member_notes_body_check check (char_length(body) <= 2000);

-- Sin clave foránea a gyms: el registro sobrevive a la purga del gimnasio (se borra por antigüedad).
create table if not exists public.gym_audit (
  id             bigint generated always as identity primary key,
  gym_id         uuid not null,
  actor_id       uuid,                            -- la persona real (cuenta propia o turno con PIN)
  device_user_id uuid,                            -- la cuenta de la tablet, si hubo turno
  turno_id       uuid,
  action         text not null,
  gym_member_id  uuid,
  target_user    uuid,
  data           jsonb,
  at             timestamptz not null default now()
);
alter table public.gym_audit drop constraint if exists gym_audit_action_check;
alter table public.gym_audit add constraint gym_audit_action_check check (char_length(action) <= 60);
create index if not exists gym_audit_gym_at_idx on public.gym_audit(gym_id, at desc);

create table if not exists public.gym_alerts (
  id         bigint generated always as identity primary key,
  gym_id     uuid not null references public.gyms(id) on delete cascade,
  recipient  text not null,                       -- 'u:<cuenta>' o 'f:<ficha>' (ficha sin app: solo mail)
  kind       text not null,
  key        text not null,
  channel    text not null,
  payload    jsonb,
  send_after timestamptz not null default now(),
  sent_at    timestamptz,
  unique (recipient, kind, key)                   -- un aviso por motivo y por persona
);
alter table public.gym_alerts drop constraint if exists gym_alerts_recipient_check;
alter table public.gym_alerts add constraint gym_alerts_recipient_check check (recipient ~ '^(u|f):[0-9a-f-]{36}$');
alter table public.gym_alerts drop constraint if exists gym_alerts_channel_check;
alter table public.gym_alerts add constraint gym_alerts_channel_check check (channel in ('push', 'mail', 'push+mail', 'resumen'));
create index if not exists gym_alerts_pendientes_idx on public.gym_alerts(send_after) where sent_at is null;
create index if not exists gym_alerts_gym_idx on public.gym_alerts(gym_id);

create table if not exists public.gym_bajas (
  numero        bigint generated always as identity primary key,   -- constancia «B-000123»
  gym_id        uuid not null references public.gyms(id) on delete cascade,
  gym_member_id uuid not null references public.gym_members(id) on delete cascade,
  via           text not null,
  requested_at  timestamptz not null default now(),
  efectiva_el   date,
  estado        text,                              -- los valores los fija la etapa 2
  token_hash    bytea unique
);
alter table public.gym_bajas drop constraint if exists gym_bajas_via_check;
alter table public.gym_bajas add constraint gym_bajas_via_check check (via in ('app', 'link', 'recepcion', 'admin'));
create index if not exists gym_bajas_gym_idx on public.gym_bajas(gym_id);
create index if not exists gym_bajas_member_idx on public.gym_bajas(gym_member_id);

create table if not exists public.gym_entries (
  id            uuid primary key default gen_random_uuid(),   -- lo genera el cliente: reintentos sin duplicar
  gym_id        uuid not null references public.gyms(id) on delete cascade,
  gym_member_id uuid not null references public.gym_members(id) on delete cascade,
  at            timestamptz not null default now(),
  step          bigint,                            -- paso del Pase (etapa 3)
  method        text not null,
  offline       boolean not null default false,
  by_user       uuid,
  turno_id      uuid,
  result        text not null,
  flag          text
);
alter table public.gym_entries drop constraint if exists gym_entries_method_check;
alter table public.gym_entries add constraint gym_entries_method_check check (method in ('pase', 'puerta', 'manual'));
alter table public.gym_entries drop constraint if exists gym_entries_result_check;
alter table public.gym_entries add constraint gym_entries_result_check check (result in ('ok', 'cuota_vencida', 'pausado', 'visita', 'baja', 'rechazado'));
create unique index if not exists gym_entries_step_uniq on public.gym_entries(gym_member_id, step) where step is not null;
create index if not exists gym_entries_gym_at_idx on public.gym_entries(gym_id, at desc);
create index if not exists gym_entries_member_at_idx on public.gym_entries(gym_member_id, at desc);

create table if not exists public.gym_turnos (
  id             uuid primary key default gen_random_uuid(),
  gym_id         uuid not null references public.gyms(id) on delete cascade,
  device_user_id uuid,
  staff_user_id  uuid,
  opened_at      timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  closed_at      timestamptz
);
create index if not exists gym_turnos_gym_idx on public.gym_turnos(gym_id);


-- ===== Cambios en tablas que ya existen =====

alter table public.coach_billing add column if not exists seats_used int not null default 0;
alter table public.coach_billing drop constraint if exists coach_billing_seats_used_check;
alter table public.coach_billing add constraint coach_billing_seats_used_check check (seats_used >= 0);
alter table public.coach_messages add column if not exists gym_id uuid;


-- ===== Funciones de permiso =====

-- Son plpgsql y no sql a propósito: Postgres (hasta la versión 17) vuelve a planificar en cada llamada
-- el cuerpo de una función sql que no puede meter adentro de la consulta (las security definer no
-- se meten), y las políticas las llaman fila por fila, una adentro de otra. En plpgsql cada consulta
-- se planifica una vez por conexión: is_my_client queda más rápida que la de hoy (lo mide
-- tests/gimnasios-rendimiento.test.mjs).

-- Las que usan las políticas: responden solo sobre quien llama.
create or replace function public.gym_mi_rol(g uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare r text;
begin
  select s.role into r from public.gym_staff s where s.gym_id = g and s.user_id = auth.uid() and s.left_at is null;
  return r;
end $$;
revoke all on function public.gym_mi_rol(uuid) from public, anon;
grant execute on function public.gym_mi_rol(uuid) to authenticated;

create or replace function public.gym_soy_socio(g uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (select 1 from public.gym_members m where m.gym_id = g and m.member_id = auth.uid() and m.status in ('activo', 'pausado', 'visita'));
end $$;
revoke all on function public.gym_soy_socio(uuid) from public, anon;
grant execute on function public.gym_soy_socio(uuid) to authenticated;

-- Internas.
create or replace function public.gym_role(g uuid, u uuid default auth.uid())
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare r text;
begin
  select s.role into r from public.gym_staff s where s.gym_id = g and s.user_id = u and s.left_at is null;
  return r;
end $$;
revoke all on function public.gym_role(uuid, uuid) from public, anon, authenticated;
grant execute on function public.gym_role(uuid, uuid) to service_role;

create or replace function public.vinculo_gym(p uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare g uuid;
begin
  select m.gym_id into g
    from public.profiles x
    join public.gym_members m on m.member_id = x.id and m.status in ('activo', 'pausado')
    join public.gym_staff s on s.gym_id = m.gym_id and s.user_id = x.coach_id
                           and s.left_at is null and s.role in ('owner', 'admin', 'profe')
   where x.id = p
   limit 1;
  return g;
end $$;
revoke all on function public.vinculo_gym(uuid) from public, anon, authenticated;
grant execute on function public.vinculo_gym(uuid) to service_role;

create or replace function public.gym_de_dueno(cid uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare g uuid;
begin
  select x.id into g from public.gyms x where x.owner_id = cid and x.closed_at is null limit 1;
  return g;
end $$;
revoke all on function public.gym_de_dueno(uuid) from public, anon, authenticated;
grant execute on function public.gym_de_dueno(uuid) to service_role;

-- Plan del gimnasio = plan del dueño (prueba y pago, lo que termine más tarde; la cortesía no vence),
-- con 5 días de gracia y sin corte por cupo: sobre el cupo solo se frenan las altas.
create or replace function public.gym_active(g uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from public.gyms x join public.coach_billing b on b.coach_id = x.owner_id
     where x.id = g and x.closed_at is null
       and (b.plan = 'cortesia'
            or greatest(b.trial_ends_at, coalesce(b.paid_until, '-infinity')) > now() - interval '5 days'));
end $$;
revoke all on function public.gym_active(uuid) from public, anon, authenticated;
grant execute on function public.gym_active(uuid) to service_role;

-- Lo operativo (recepción, cuotas, clases) sigue hasta 10 días después de vencido.
create or replace function public.gym_operativo(g uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from public.gyms x join public.coach_billing b on b.coach_id = x.owner_id
     where x.id = g and x.closed_at is null
       and (b.plan = 'cortesia'
            or greatest(b.trial_ends_at, coalesce(b.paid_until, '-infinity')) > now() - interval '10 days'));
end $$;
revoke all on function public.gym_operativo(uuid) from public, anon, authenticated;
grant execute on function public.gym_operativo(uuid) to service_role;

-- ¿Puedo (dueño o administración) leer los registros de este socio? Solo si su ficha está activa o
-- pausada, aceptó la hoja, eligió compartir y el plan del gimnasio está al día.
create or replace function public.gym_reads_member(target uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from public.gym_members m
      join public.gym_staff s on s.gym_id = m.gym_id and s.user_id = auth.uid()
                             and s.left_at is null and s.role in ('owner', 'admin')
     where m.member_id = target and m.status in ('activo', 'pausado')
       and m.share_admin and m.terms_at is not null and public.gym_active(m.gym_id));
end $$;
revoke all on function public.gym_reads_member(uuid) from public, anon;
grant execute on function public.gym_reads_member(uuid) to authenticated;

-- Cupo usado del plan de cid, exacto. El primer conteo es «profiles con coach_id = cid y
-- vinculo_gym(id) null», escrito sin llamar a vinculo_gym por cada perfil.
create or replace function public.recount_seats(cid uuid)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return (select count(*)::int from public.profiles p
           where p.coach_id = cid
             and not exists (select 1 from public.gym_members m
                               join public.gym_staff s on s.gym_id = m.gym_id and s.user_id = p.coach_id
                                                      and s.left_at is null and s.role in ('owner', 'admin', 'profe')
                              where m.member_id = p.id and m.status in ('activo', 'pausado')))
       + (select count(*)::int from public.gym_members m join public.gyms g on g.id = m.gym_id
           where g.owner_id = cid and g.closed_at is null and m.status in ('activo', 'pausado'));
end $$;
revoke all on function public.recount_seats(uuid) from public, anon, authenticated;
grant execute on function public.recount_seats(uuid) to service_role;

-- Tiene que dar vacío siempre (lo miran las pruebas y, desde la etapa 2, la tarea de cada noche).
create or replace function public.seats_drift()
returns table (coach_id uuid, cacheado int, contado int)
language sql
stable
security definer
set search_path = public
as $$
  select b.coach_id, b.seats_used, r.n
    from public.coach_billing b cross join lateral (select public.recount_seats(b.coach_id) as n) r
   where b.seats_used is distinct from r.n;
$$;
revoke all on function public.seats_drift() from public, anon, authenticated;
grant execute on function public.seats_drift() to service_role;


-- ===== Cupo cacheado: triggers =====

-- Recalcula seats_used de esos coaches (los null y los que no tienen fila se saltean). Con la marca
-- gize.gym_bulk no hace nada: la operación masiva recalcula al final.
-- Primero bloquea las filas (en orden de coach_id) y recién después cuenta, en otra sentencia: así el
-- conteo ve lo que confirmó quien tenía la fila. Contando en la misma sentencia que espera el bloqueo,
-- dos alumnos que se desvinculan a la vez dejaban seats_used con uno de más (el segundo contaba sin
-- ver al primero), y con el cupo justo el coach quedaba sin acceso a ninguno.
-- Orden de bloqueo en toda la base: primero las filas de profiles y de las tablas de gimnasios, y al
-- final las de coach_billing (acá, siempre de último). join_coach y release_lapsed_clients lo respetan.
create or replace function public.gym_recontar(cids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('gize.gym_bulk', true), '') = 'on' then return; end if;
  perform 1 from public.coach_billing where coach_id = any(cids) order by coach_id for update;
  update public.coach_billing b set seats_used = r.n
    from (select c, public.recount_seats(c) as n from (select distinct unnest(cids) as c) u where c is not null) r
   where b.coach_id = r.c and b.seats_used is distinct from r.n;
end $$;
revoke all on function public.gym_recontar(uuid[]) from public, anon, authenticated;

-- profiles: el coach anterior y el nuevo (también al borrar una cuenta y en las cascadas «set null»).
-- El rol no cambia el cupo: se cuentan todos los perfiles con ese coach_id, como el count(*) de hoy.
create or replace function public.gym_cupo_profiles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then perform public.gym_recontar(array[new.coach_id]);
  elsif tg_op = 'DELETE' then perform public.gym_recontar(array[old.coach_id]);
  else perform public.gym_recontar(array[old.coach_id, new.coach_id]);
  end if;
  return null;
end $$;
revoke all on function public.gym_cupo_profiles() from public, anon, authenticated;
drop trigger if exists profiles_gym_cupo_alta on public.profiles;
create trigger profiles_gym_cupo_alta after insert on public.profiles
  for each row when (new.coach_id is not null) execute function public.gym_cupo_profiles();
drop trigger if exists profiles_gym_cupo_cambio on public.profiles;
create trigger profiles_gym_cupo_cambio after update of coach_id on public.profiles
  for each row when (old.coach_id is distinct from new.coach_id) execute function public.gym_cupo_profiles();
drop trigger if exists profiles_gym_cupo_baja on public.profiles;
create trigger profiles_gym_cupo_baja after delete on public.profiles
  for each row when (old.coach_id is not null) execute function public.gym_cupo_profiles();

-- gym_members: el dueño del gimnasio (las fichas) y el coach de la cuenta (su vínculo puede pasar de
-- propio a del gimnasio y al revés), antes y después.
create or replace function public.gym_cupo_members()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare cs uuid[] := '{}';
begin
  if tg_op in ('UPDATE', 'DELETE') then
    cs := cs || (select g.owner_id from public.gyms g where g.id = old.gym_id)
             || (select p.coach_id from public.profiles p where p.id = old.member_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    cs := cs || (select g.owner_id from public.gyms g where g.id = new.gym_id)
             || (select p.coach_id from public.profiles p where p.id = new.member_id);
  end if;
  perform public.gym_recontar(cs);
  return null;
end $$;
revoke all on function public.gym_cupo_members() from public, anon, authenticated;
drop trigger if exists gym_members_cupo_alta on public.gym_members;
create trigger gym_members_cupo_alta after insert on public.gym_members
  for each row execute function public.gym_cupo_members();
drop trigger if exists gym_members_cupo_cambio on public.gym_members;
create trigger gym_members_cupo_cambio after update of status, member_id, gym_id on public.gym_members
  for each row when (old.status is distinct from new.status or old.member_id is distinct from new.member_id
                     or old.gym_id is distinct from new.gym_id)
  execute function public.gym_cupo_members();
drop trigger if exists gym_members_cupo_baja on public.gym_members;
create trigger gym_members_cupo_baja after delete on public.gym_members
  for each row execute function public.gym_cupo_members();

-- gym_staff: quien entra, cambia de rol o se va (sus alumnos pasan de propios a del gimnasio y al
-- revés) y el dueño del gimnasio.
create or replace function public.gym_cupo_staff()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare cs uuid[] := '{}';
begin
  if tg_op in ('UPDATE', 'DELETE') then
    cs := cs || old.user_id || (select g.owner_id from public.gyms g where g.id = old.gym_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    cs := cs || new.user_id || (select g.owner_id from public.gyms g where g.id = new.gym_id);
  end if;
  perform public.gym_recontar(cs);
  return null;
end $$;
revoke all on function public.gym_cupo_staff() from public, anon, authenticated;
drop trigger if exists gym_staff_cupo_alta on public.gym_staff;
create trigger gym_staff_cupo_alta after insert on public.gym_staff
  for each row execute function public.gym_cupo_staff();
drop trigger if exists gym_staff_cupo_cambio on public.gym_staff;
create trigger gym_staff_cupo_cambio after update of left_at, role, user_id, gym_id on public.gym_staff
  for each row when (old.left_at is distinct from new.left_at or old.role is distinct from new.role
                     or old.user_id is distinct from new.user_id or old.gym_id is distinct from new.gym_id)
  execute function public.gym_cupo_staff();
drop trigger if exists gym_staff_cupo_baja on public.gym_staff;
create trigger gym_staff_cupo_baja after delete on public.gym_staff
  for each row execute function public.gym_cupo_staff();

-- gyms: el dueño anterior y el nuevo (las fichas cuentan en el plan del dueño mientras esté abierto).
create or replace function public.gym_cupo_gyms()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then perform public.gym_recontar(array[new.owner_id]);
  elsif tg_op = 'DELETE' then perform public.gym_recontar(array[old.owner_id]);
  else perform public.gym_recontar(array[old.owner_id, new.owner_id]);
  end if;
  return null;
end $$;
revoke all on function public.gym_cupo_gyms() from public, anon, authenticated;
drop trigger if exists gyms_cupo_alta on public.gyms;
create trigger gyms_cupo_alta after insert on public.gyms
  for each row execute function public.gym_cupo_gyms();
drop trigger if exists gyms_cupo_cambio on public.gyms;
create trigger gyms_cupo_cambio after update of owner_id, closed_at on public.gyms
  for each row when (old.owner_id is distinct from new.owner_id or (old.closed_at is null) <> (new.closed_at is null))
  execute function public.gym_cupo_gyms();
drop trigger if exists gyms_cupo_baja on public.gyms;
create trigger gyms_cupo_baja after delete on public.gyms
  for each row execute function public.gym_cupo_gyms();

-- coach_billing: la fila nueva (coach nuevo, o admin_set_role) nace con su cupo contado. Es el único
-- trigger de la tabla y solo mira el insert: el de restaurar un gimnasio al pagar (etapa 1) va con
-- «after update of plan, trial_ends_at, paid_until, max_clients», nunca de seats_used.
create or replace function public.coach_billing_cupo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.seats_used := public.recount_seats(new.coach_id);
  return new;
end $$;
revoke all on function public.coach_billing_cupo() from public, anon, authenticated;
drop trigger if exists coach_billing_cupo on public.coach_billing;
create trigger coach_billing_cupo before insert on public.coach_billing
  for each row execute function public.coach_billing_cupo();

-- El profe de una ficha (trainer_id) sale siempre de lo demás: es el coach de la persona
-- (profiles.coach_id) solo si la ficha está activa o pausada y ese coach es dueño, admin o profe
-- activo de ese gimnasio. Si no, null: una ficha en baja, una visita, una solicitud o una ficha sin
-- app no tienen profe, y el que dejó de atenderla deja de verla (DNI, nota interna, ingresos).
create or replace function public.gym_profe_ficha(g uuid, socio uuid, estado text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare t uuid;
begin
  if socio is null or estado is null or estado not in ('activo', 'pausado') then return null; end if;
  select p.coach_id into t
    from public.profiles p
    join public.gym_staff s on s.gym_id = g and s.user_id = p.coach_id
                           and s.left_at is null and s.role in ('owner', 'admin', 'profe')
   where p.id = socio;
  return t;
end $$;
revoke all on function public.gym_profe_ficha(uuid, uuid, text) from public, anon, authenticated;

-- Cada vez que se escribe una ficha (alta, estado, cuenta, gimnasio o profe), el profe se recalcula:
-- al pasar a baja o a visita queda sin profe, al volver a activa toma el coach de la persona si es
-- del equipo, y la ficha de quien borra su cuenta queda «sin app» (member_id null por la clave
-- foránea), con su estado y sin profe. Cuando cambia el coach, lo alinea profiles_gym_sync
-- (gimnasios-vinculo.sql).
create or replace function public.gym_members_profe()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.trainer_id := public.gym_profe_ficha(new.gym_id, new.member_id, new.status);
  return new;
end $$;
revoke all on function public.gym_members_profe() from public, anon, authenticated;
drop trigger if exists gym_members_profe on public.gym_members;
create trigger gym_members_profe before insert or update of status, member_id, gym_id, trainer_id on public.gym_members
  for each row execute function public.gym_members_profe();

-- La solicitud pendiente de quien borra su cuenta se borra: tenía su nombre y su mail (copiados por
-- join_coach, no cargados por el gimnasio), nunca fue socio ni aceptó la hoja, y no tiene pagos ni
-- ingresos. Una ficha de verdad queda «sin app» (arriba). gym_audit solo guarda uuids: queda.
create or replace function public.gym_members_pedido_sin_cuenta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.gym_members where id = new.id and status = 'pendiente' and member_id is null;
  return null;
end $$;
revoke all on function public.gym_members_pedido_sin_cuenta() from public, anon, authenticated;
drop trigger if exists gym_members_pedido_sin_cuenta on public.gym_members;
create trigger gym_members_pedido_sin_cuenta after update of member_id on public.gym_members
  for each row when (old.member_id is not null and new.member_id is null and new.status = 'pendiente')
  execute function public.gym_members_pedido_sin_cuenta();

-- El código del gimnasio no puede ser el código personal de un coach (join_coach busca primero el
-- personal). my_invite_code y rotate_invite_code no miran gym_codes: si alguna vez chocaran (una en
-- un billón por código), gana el personal.
create or replace function public.gym_codes_unico()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.profiles where invite_code = new.code) then
    raise exception 'Ese código ya lo usa un coach.' using errcode = '23505';
  end if;
  return new;
end $$;
revoke all on function public.gym_codes_unico() from public, anon, authenticated;
drop trigger if exists gym_codes_unico on public.gym_codes;
create trigger gym_codes_unico before insert or update of code on public.gym_codes
  for each row execute function public.gym_codes_unico();


-- ===== RLS de las tablas nuevas: solo lectura =====

alter table public.gyms enable row level security;
revoke all on public.gyms from anon, authenticated;
grant select on public.gyms to authenticated;
drop policy if exists "gimnasio: lo ven su equipo y sus socios" on public.gyms;
create policy "gimnasio: lo ven su equipo y sus socios" on public.gyms
  for select to authenticated using (public.gym_mi_rol(id) is not null or public.gym_soy_socio(id));

alter table public.gym_staff enable row level security;
revoke all on public.gym_staff from anon, authenticated;
grant select on public.gym_staff to authenticated;
drop policy if exists "equipo: lo ve el equipo y cada uno lo suyo" on public.gym_staff;
create policy "equipo: lo ve el equipo y cada uno lo suyo" on public.gym_staff
  for select to authenticated using (user_id = (select auth.uid()) or public.gym_mi_rol(gym_id) is not null);

alter table public.gym_members enable row level security;
revoke all on public.gym_members from anon, authenticated;
grant select on public.gym_members to authenticated;
drop policy if exists "fichas: dueño y administración, el profe asignado y el socio" on public.gym_members;
create policy "fichas: dueño y administración, el profe asignado y el socio" on public.gym_members
  for select to authenticated using (
    public.gym_mi_rol(gym_id) in ('owner', 'admin')
    or (trainer_id = (select auth.uid()) and status in ('activo', 'pausado') and public.gym_mi_rol(gym_id) in ('owner', 'admin', 'profe'))
    or member_id = (select auth.uid()));

alter table public.gym_member_notes enable row level security;
revoke all on public.gym_member_notes from anon, authenticated;
grant select on public.gym_member_notes to authenticated;
drop policy if exists "notas: dueño, administración y el profe asignado" on public.gym_member_notes;
create policy "notas: dueño, administración y el profe asignado" on public.gym_member_notes
  for select to authenticated using (exists (
    select 1 from public.gym_members m
     where m.id = gym_member_id
       and (public.gym_mi_rol(m.gym_id) in ('owner', 'admin')
            or (m.trainer_id = (select auth.uid()) and m.status in ('activo', 'pausado')
                and public.gym_mi_rol(m.gym_id) in ('owner', 'admin', 'profe')))));

alter table public.gym_audit enable row level security;
revoke all on public.gym_audit from anon, authenticated;
grant select on public.gym_audit to authenticated;
drop policy if exists "auditoría: dueño y administración" on public.gym_audit;
create policy "auditoría: dueño y administración" on public.gym_audit
  for select to authenticated using (public.gym_mi_rol(gym_id) in ('owner', 'admin'));

alter table public.gym_bajas enable row level security;
revoke all on public.gym_bajas from anon, authenticated;
grant select on public.gym_bajas to authenticated;
drop policy if exists "bajas: dueño y administración, y el socio las suyas" on public.gym_bajas;
create policy "bajas: dueño y administración, y el socio las suyas" on public.gym_bajas
  for select to authenticated using (
    public.gym_mi_rol(gym_id) in ('owner', 'admin')
    or exists (select 1 from public.gym_members m where m.id = gym_member_id and m.member_id = (select auth.uid())));

-- Los ingresos de las fichas que uno ve (la subconsulta pasa por la política de gym_members).
alter table public.gym_entries enable row level security;
revoke all on public.gym_entries from anon, authenticated;
grant select on public.gym_entries to authenticated;
drop policy if exists "ingresos: los de las fichas que veo" on public.gym_entries;
create policy "ingresos: los de las fichas que veo" on public.gym_entries
  for select to authenticated using (exists (select 1 from public.gym_members m where m.id = gym_member_id));

-- Sin políticas ni permisos: solo funciones y el service role.
alter table public.gym_alerts enable row level security;
revoke all on public.gym_alerts from anon, authenticated;
alter table public.gym_invites enable row level security;
revoke all on public.gym_invites from anon, authenticated;
alter table public.gym_codes enable row level security;
revoke all on public.gym_codes from anon, authenticated;
alter table public.gym_turnos enable row level security;
revoke all on public.gym_turnos from anon, authenticated;


-- ===== Carga inicial del cupo (después de los triggers, en la misma transacción) =====
update public.coach_billing b set seats_used = public.recount_seats(b.coach_id)
 where b.seats_used is distinct from public.recount_seats(b.coach_id);

notify pgrst, 'reload schema';


-- ===== Para volver atrás =====
-- Primero el bloque «Para volver atrás» de gimnasios-vinculo.sql (la coach_active de ahí lee
-- seats_used). Después esto, sin los «-- » (las políticas se van con sus tablas). Lo primero frena
-- todo si alguna función todavía usa lo que se borra acá (por ejemplo, si no se corrió antes el
-- bloque de gimnasios-vinculo.sql): sin eso se borraría sin error y después fallarían las lecturas
-- del coach, los vínculos y los desvínculos.
--
-- do $$
-- declare f text;
-- begin
--   select string_agg(p.proname, ', ' order by p.proname) into f
--     from pg_proc p
--    where p.pronamespace = 'public'::regnamespace
--      and p.proname not in ('gym_mi_rol', 'gym_soy_socio', 'gym_role', 'vinculo_gym', 'gym_de_dueno', 'gym_active',
--                            'gym_operativo', 'gym_reads_member', 'recount_seats', 'seats_drift', 'gym_recontar',
--                            'gym_cupo_profiles', 'gym_cupo_members', 'gym_cupo_staff', 'gym_cupo_gyms', 'coach_billing_cupo',
--                            'gym_codes_unico', 'gym_profe_ficha', 'gym_members_profe', 'gym_members_pedido_sin_cuenta',
--                            -- ia.sql y resumen-semanal.sql: sin las tablas de gimnasios siguen andando (miran
--                            -- to_regclass antes).
--                            'ia_rol_origen', 'resumen_semanal_ve',
--                            -- cobros-coach.sql: lo mismo (mira to_regprocedure antes de usar vinculo_gym).
--                            'cobro_de_gimnasio')
--      and p.prosrc ~ '\m(gym_[a-z_]+|gyms|vinculo_gym|recount_seats|seats_drift|seats_used)\M';
--   if f is not null then
--     raise exception 'Primero el bloque «Para volver atrás» de supabase/gimnasios-vinculo.sql: todavía usan los gimnasios %', f;
--   end if;
-- end $$;
-- drop trigger if exists profiles_gym_cupo_alta on public.profiles;
-- drop trigger if exists profiles_gym_cupo_cambio on public.profiles;
-- drop trigger if exists profiles_gym_cupo_baja on public.profiles;
-- drop trigger if exists coach_billing_cupo on public.coach_billing;
-- drop table if exists public.gym_entries, public.gym_bajas, public.gym_alerts, public.gym_audit,
--   public.gym_member_notes, public.gym_members, public.gym_codes, public.gym_invites,
--   public.gym_turnos, public.gym_staff, public.gyms;
-- drop function if exists public.gym_mi_rol(uuid), public.gym_soy_socio(uuid), public.gym_role(uuid, uuid),
--   public.vinculo_gym(uuid), public.gym_de_dueno(uuid), public.gym_active(uuid), public.gym_operativo(uuid),
--   public.gym_reads_member(uuid), public.recount_seats(uuid), public.seats_drift(), public.gym_recontar(uuid[]),
--   public.gym_cupo_profiles(), public.gym_cupo_members(), public.gym_cupo_staff(), public.gym_cupo_gyms(),
--   public.coach_billing_cupo(), public.gym_codes_unico(), public.gym_profe_ficha(uuid, uuid, text),
--   public.gym_members_profe(), public.gym_members_pedido_sin_cuenta();
-- alter table public.coach_billing drop constraint if exists coach_billing_seats_used_check;
-- alter table public.coach_billing drop column if exists seats_used;
-- alter table public.coach_messages drop column if exists gym_id;
-- notify pgrst, 'reload schema';
