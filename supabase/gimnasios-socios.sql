-- Gimnasios, etapa 1: profes y socios, plan del gimnasio y recepción básica. Las funciones (RPC) que
-- usan el panel del dueño, la app del socio, el panel del profe y la recepción.
-- Correr con el workflow "Supabase" → tarea sql → supabase/gimnasios-socios.sql, después de
-- supabase/gimnasios.sql, supabase/gimnasios-vinculo.sql y supabase/gimnasios-lectura.sql. Se puede
-- correr varias veces. Sin esos tres falla entero, sin cambiar nada (lo primero del archivo lo
-- controla).
--
-- SIN GIMNASIOS TODO SIGUE IGUAL: suma columnas (con valor por defecto) a tablas de los gimnasios, un
-- bucket privado nuevo (gym-fotos), una fila apagada en app_config («gimnasios»: {"alta": false}) y
-- funciones que sin filas de gimnasio no hacen nada. No cambia ninguna función ni política de hoy.
-- Las dos tareas programadas salen enseguida si no hay gimnasios.
--
-- Qué suma:
--   · gym_members: la foto del gimnasio (foto_path: la saca o la aprueba el gimnasio; el socio solo
--     propone, foto_pend_path; su foto de perfil sigue siendo libre y nunca la reemplaza),
--     dni_intentos (los 5 intentos del link #unirme) y unir_sugerida (la ficha cargada a la que
--     apunta un pedido que llegó por el link sin DNI). gym_invites: revoked_at.
--   · Bucket privado gym-fotos (300 KB, jpg o webp), ruta {gimnasio}/{ficha}/{uuid}.jpg. Sube el
--     socio a la carpeta de su ficha (vigente o pedido) y el dueño, la administración y (con el
--     interruptor de altas) la recepción a cualquier ficha de su gimnasio. Ven (fichas que no están
--     en baja): el socio la suya; el dueño y la administración, todas; la recepción, todas (los
--     pedidos, solo con «altas»); el profe, las de sus asignados (todas menos los pedidos si abre la
--     recepción). Sin cambiar ni borrar desde la app; tope de 5 subidas por día para el socio (300
--     para el equipo). Las fotos que ya no usa ninguna ficha las lista gym_fotos_huerfanas() para
--     borrarlas por la API de Storage.
--   · gym_versiones(): las versiones vigentes de la hoja, de «compartir» y del contrato de encargo
--     ('2026-10-borrador' hasta la revisión legal). Las funciones que reciben una versión rechazan
--     otra («Actualizá la página…»).
--   · Las RPC de la etapa 1 (ver cada una abajo): mi_gimnasio; gym_crear (con el interruptor
--     app_config.gimnasios.alta), gym_config, gym_codigo_rotar, gym_cerrar, gym_exportar; equipo
--     (gym_invitar, gym_invitacion_revocar, gym_invitaciones, gym_invitacion_info,
--     gym_aceptar_invitacion, gym_cambiar_rol, gym_quitar_staff); socio (gym_codigo_info,
--     gym_unirse, gym_cancelar_solicitud, gym_unirse_token_info, gym_unirse_token,
--     gym_confirmar_hoja, gym_compartir_admin, gym_salir, gym_foto_proponer); staff (gym_solicitudes,
--     gym_aprobar, gym_rechazar, gym_ficha_crear, gym_ficha_editar, gym_ficha_link,
--     gym_nota_guardar, gym_asignar_profe, gym_dejar_socio, gym_ficha_profe, gym_pausar, gym_reactivar, gym_baja,
--     gym_socios_resumen, gym_foto_staff, gym_foto_resolver); recepción (buscar_socio,
--     gym_ingreso_manual, gym_ingresos).
--   · Internas (sin permiso para la app): gym_tick, gym_diaria, release_lapsed_gyms, gym_restaurar y
--     las ayudas. Las que comparten join_coach y el borrado de la cuenta (gym_pedir,
--     gym_aprobar_interno, gym_cupo_ok, gym_cerrar_interno…) están en gimnasios-vinculo.sql.
--   · Tareas: gize-gym-tick (cada minuto: restaura los gimnasios que volvieron a pagar; a los :23,
--     release_lapsed_gyms) y gize-gym-diaria (03:10 de Argentina: pausas que terminan, links e
--     invitaciones vencidas, diferencias del cupo y gimnasios cerrados por baja del dueño con los
--     90 días cumplidos).
--
-- Reglas de todas las funciones: security definer con search_path fijo; quien llama sale de
-- auth.uid() y su rol de gym_staff (un gimnasio por persona); cada cambio queda en gym_audit (la
-- persona real, sin datos de salud); los errores para la persona son P0001 con un texto que no nombra
-- el plan («El gimnasio no puede sumar socios en este momento»); sin permiso, 42501. Orden de
-- bloqueo de la etapa 0: perfiles, tablas de gimnasios y coach_billing al final (gym_recontar,
-- gym_cupo_ok). Las operaciones masivas prenden gize.gym_bulk (un recuento y un resumen al final) y,
-- si tienen que conservar las rutinas programadas, gize.gym_keep_routines.
-- Restaurar al pagar NO es un trigger en coach_billing: el pago escribe esa fila antes que los
-- perfiles (al revés que todo lo demás). Lo hace gym_tick cada minuto, en su propia transacción y
-- con el orden de siempre; cubre Mercado Pago, Apple y el pago manual igual (hasta 1 minuto de demora).
--
-- OJO: las versiones vigentes de gym_semaforo y gym_ingreso_manual están en gimnasios-cuotas.sql
-- (etapa 2: el semáforo y el ingreso con la cuota). Si volvés a correr este archivo, corré después ese.
--
-- Para volver atrás: el bloque comentado del final (antes, el de gimnasios-cuotas.sql y el de
-- gimnasios-admin.sql; después, el de gimnasios-lectura.sql).


-- ===== Antes que nada: ¿están los archivos anteriores? =====

do $$ begin
  if to_regclass('public.gym_members') is null or to_regprocedure('public.gym_pedir(uuid, uuid, text, text, boolean, text)') is null
     or to_regprocedure('public.gym_cerrar_interno(uuid, text)') is null or to_regprocedure('public.gym_socios_compartidos()') is null then
    raise exception 'Primero correr supabase/gimnasios.sql, supabase/gimnasios-vinculo.sql y supabase/gimnasios-lectura.sql: este archivo usa sus tablas y funciones.';
  end if;
  if to_regclass('public.app_config') is null or to_regclass('public.admin_audit') is null or to_regclass('public.join_code_attempts') is null then
    raise exception 'Faltan tablas de hoy (app_config, admin_audit, join_code_attempts): correr antes los archivos de supabase/.';
  end if;
end $$;


-- ===== Columnas nuevas =====

alter table public.gym_members add column if not exists foto_path text;          -- la foto del gimnasio (aprobada)
alter table public.gym_members add column if not exists foto_ok_at timestamptz;
alter table public.gym_members add column if not exists foto_ok_by uuid;           -- quién la sacó o la aprobó (sin clave foránea)
alter table public.gym_members add column if not exists foto_pend_path text;     -- la que propuso el socio
alter table public.gym_members add column if not exists foto_pend_at timestamptz;
alter table public.gym_members add column if not exists foto_rechazo text;       -- por qué no se aprobó la última
alter table public.gym_members add column if not exists dni_intentos smallint not null default 0;
alter table public.gym_members add column if not exists unir_sugerida uuid references public.gym_members(id) on delete set null;
alter table public.gym_members drop constraint if exists gym_members_foto_check;
alter table public.gym_members add constraint gym_members_foto_check check (
  (foto_path is null or foto_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|webp)$')
  and (foto_pend_path is null or foto_pend_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|webp)$')
  and (foto_rechazo is null or char_length(foto_rechazo) <= 200));
alter table public.gym_members drop constraint if exists gym_members_dni_intentos_check;
alter table public.gym_members add constraint gym_members_dni_intentos_check check (dni_intentos between 0 and 5);
create index if not exists gym_members_foto_pend_idx on public.gym_members(gym_id) where foto_pend_path is not null;
create index if not exists gym_members_unir_idx on public.gym_members(unir_sugerida) where unir_sugerida is not null;
create index if not exists gym_members_foto_path_idx on public.gym_members(foto_path) where foto_path is not null;
create index if not exists gym_members_foto_pend_path_idx on public.gym_members(foto_pend_path) where foto_pend_path is not null;
alter table public.gym_invites add column if not exists revoked_at timestamptz;
create index if not exists gyms_lapsed_idx on public.gyms(id) where lapsed_at is not null and closed_at is null;
create index if not exists gyms_purge_idx on public.gyms(purge_after) where purge_after is not null;

-- El interruptor para crear gimnasios (lo prende el admin; apagado hasta los pilotos).
insert into public.app_config (key, value) values ('gimnasios', '{"alta": false}') on conflict (key) do nothing;


-- ===== Ayudas =====

create or replace function public.gym_versiones()
returns jsonb
language plpgsql
immutable
security definer
set search_path = public
as $$
begin
  return jsonb_build_object('hoja', '2026-10-borrador', 'compartir', '2026-10-borrador', 'encargo', '2026-10-borrador');
end $$;
revoke all on function public.gym_versiones() from public, anon;
grant execute on function public.gym_versiones() to authenticated;

-- La versión que mandó la app tiene que ser la vigente (si no, aceptó un texto viejo).
create or replace function public.gym_version_ok(tipo text, v text)
returns void
language plpgsql
immutable
security definer
set search_path = public
as $$
begin
  if v is null or v is distinct from public.gym_versiones()->>tipo then
    raise exception 'Actualizá la página: cambió el texto que tenés que aceptar.' using errcode = 'P0001';
  end if;
end $$;
revoke all on function public.gym_version_ok(text, text) from public, anon, authenticated;

create or replace function public.gym_hoy()
returns date
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return (now() at time zone 'America/Argentina/Buenos_Aires')::date;
end $$;
revoke all on function public.gym_hoy() from public, anon, authenticated;

-- Un token para un link (#unirme=, #equipo=): 64 caracteres hexadecimales (dos uuid v4, 244 bits al
-- azar). Se guarda solo su hash.
create or replace function public.gym_token()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  return replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
end $$;
revoke all on function public.gym_token() from public, anon, authenticated;

create or replace function public.gym_hash(t text)
returns bytea
language plpgsql
immutable
security definer
set search_path = public
as $$
begin
  return sha256(convert_to(coalesce(t, ''), 'UTF8'));
end $$;
revoke all on function public.gym_hash(text) from public, anon, authenticated;

-- Para buscar por nombre sin que importen las mayúsculas, los acentos ni los espacios de más.
create or replace function public.gym_norm(t text)
returns text
language plpgsql
immutable
security definer
set search_path = public
as $$
begin
  return btrim(regexp_replace(lower(translate(coalesce(t, ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')), '\s+', ' ', 'g'));
end $$;
revoke all on function public.gym_norm(text) from public, anon, authenticated;

-- Un código del gimnasio nuevo: 8 caracteres del alfabeto de my_invite_code, que no sea de otro
-- gimnasio ni el código personal de un coach.
create or replace function public.gym_codigo_nuevo()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare abc text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; b bytea; c text; i int;
begin
  loop
    b := uuid_send(gen_random_uuid());
    c := '';
    foreach i in array array[0, 1, 2, 3, 4, 5, 10, 11] loop
      c := c || substr(abc, 1 + get_byte(b, i) % 31, 1);
    end loop;
    exit when not exists (select 1 from public.gym_codes where code = c)
          and not exists (select 1 from public.profiles where invite_code = c);
  end loop;
  return c;
end $$;
revoke all on function public.gym_codigo_nuevo() from public, anon, authenticated;

-- Los interruptores del gimnasio con sus valores por defecto (los que no se guardaron).
create or replace function public.gym_settings(g uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return jsonb_build_object('recepcion_cobra', false, 'recepcion_altas', true, 'profes_recepcion', false, 'profes_montos', false,
                            'aprobar_solas', false, 'ingreso_horas', 3, 'profes_extra', 0)
         || coalesce((select x.settings from public.gyms x where x.id = g), '{}'::jsonb);
end $$;
revoke all on function public.gym_settings(uuid) from public, anon, authenticated;

-- Quién llama en el equipo: su gimnasio (abierto) y su rol, o nulls.
create or replace function public.gym_mi_staff(out g uuid, out rol text)
returns record
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  select s.gym_id, s.role into g, rol
    from public.gym_staff s join public.gyms x on x.id = s.gym_id and x.closed_at is null
   where s.user_id = auth.uid() and s.left_at is null
   limit 1;
end $$;
revoke all on function public.gym_mi_staff() from public, anon, authenticated;

-- El gimnasio de quien llama si tiene uno de esos roles; si no, 42501.
create or replace function public.gym_exigir(roles text[])
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare s record;
begin
  select * into s from public.gym_mi_staff();
  if s.g is null or not (s.rol = any(roles)) then
    raise exception 'No tenés permiso para hacer esto en el gimnasio.' using errcode = '42501';
  end if;
  return s.g;
end $$;
revoke all on function public.gym_exigir(text[]) from public, anon, authenticated;

-- Aprobar solicitudes, cargar fichas y sacar fotos: dueño y administración, y la recepción si el
-- gimnasio tiene prendido «La recepción aprueba solicitudes y carga fichas».
create or replace function public.gym_exigir_altas()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare s record;
begin
  select * into s from public.gym_mi_staff();
  if s.g is not null and (s.rol in ('owner', 'admin')
                          or (s.rol = 'recepcion' and coalesce((public.gym_settings(s.g)->>'recepcion_altas')::boolean, false))) then
    return s.g;
  end if;
  raise exception 'No tenés permiso para hacer esto en el gimnasio.' using errcode = '42501';
end $$;
revoke all on function public.gym_exigir_altas() from public, anon, authenticated;

-- La recepción: dueño, administración, recepción y los profes si el gimnasio los deja. Anda mientras
-- el gimnasio esté operativo (hasta 10 días después de vencido el plan).
create or replace function public.gym_exigir_recepcion()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare s record;
begin
  select * into s from public.gym_mi_staff();
  if s.g is null or not (s.rol in ('owner', 'admin', 'recepcion')
                         or (s.rol = 'profe' and coalesce((public.gym_settings(s.g)->>'profes_recepcion')::boolean, false))) then
    raise exception 'No tenés permiso para hacer esto en el gimnasio.' using errcode = '42501';
  end if;
  if not public.gym_operativo(s.g) then
    raise exception 'La recepción está pausada: hablá con la administración del gimnasio.' using errcode = 'P0001';
  end if;
  return s.g;
end $$;
revoke all on function public.gym_exigir_recepcion() from public, anon, authenticated;

-- Tope de profes sin cargo: 8 / 15 / 30 según el plan (hasta 100, 250 o más socios) más los que
-- suma el admin de GIZE (settings.profes_extra). Cuentan los profes y la administración con cuenta
-- de coach; no el dueño ni la recepción.
create or replace function public.gym_tope_profes(g uuid)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare lim int;
begin
  select coalesce(b.max_clients, 10) into lim from public.gyms x join public.coach_billing b on b.coach_id = x.owner_id where x.id = g;
  return (case when coalesce(lim, 10) <= 100 then 8 when lim <= 250 then 15 else 30 end)
       + greatest(coalesce((public.gym_settings(g)->>'profes_extra')::int, 0), 0);
end $$;
revoke all on function public.gym_tope_profes(uuid) from public, anon, authenticated;

create or replace function public.gym_profes_usados(g uuid)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return (select count(*)::int from public.gym_staff s join public.profiles p on p.id = s.user_id
           where s.gym_id = g and s.left_at is null and (s.role = 'profe' or (s.role = 'admin' and p.role = 'coach')));
end $$;
revoke all on function public.gym_profes_usados(uuid) from public, anon, authenticated;

-- Estado del plan del gimnasio (el del dueño): activo, gracia (vencido hace menos de 5 días: todo
-- anda), operativo (5 a 10 días: recepción y exportar) o liberado (más de 10, o liberado y sin pagar).
create or replace function public.gym_plan_estado(g uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare b record; vence timestamptz; est text; lapsed timestamptz;
begin
  select bb.* into b from public.gyms x join public.coach_billing bb on bb.coach_id = x.owner_id where x.id = g;
  select x.lapsed_at into lapsed from public.gyms x where x.id = g;
  vence := case when b.plan = 'cortesia' then null else greatest(b.trial_ends_at, coalesce(b.paid_until, '-infinity')) end;
  est := case when public.gym_active(g) then (case when vence is not null and vence < now() then 'gracia' else 'activo' end)
              when public.gym_operativo(g) and lapsed is null then 'operativo'
              else 'liberado' end;
  return jsonb_build_object('estado', est, 'vence', vence, 'pausa_profes_el', vence + interval '5 days',
    'libera_el', vence + interval '10 days', 'plan', b.plan, 'seats_used', coalesce(b.seats_used, 0), 'max', coalesce(b.max_clients, 10),
    'sobre_cupo', coalesce(b.seats_used, 0) > coalesce(b.max_clients, 10),
    'profes_usados', public.gym_profes_usados(g), 'profes_tope', public.gym_tope_profes(g));
end $$;
revoke all on function public.gym_plan_estado(uuid) from public, anon, authenticated;

-- Semáforo de la etapa 1 (sin cuotas): sale del estado de la ficha. La etapa 2 lo llena con la cuota
-- sin cambiar la forma ({semaforo, motivo, apto_vencido}). OJO: la vigente está en gimnasios-cuotas.sql.
create or replace function public.gym_semaforo(fid uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare m record;
begin
  select x.status, x.paused_until, x.apto_medico_vence into m from public.gym_members x where x.id = fid;
  return jsonb_build_object(
    'semaforo', case m.status when 'activo' then 'verde' when 'pausado' then 'ambar' when 'pendiente' then 'ambar'
                              when 'baja' then 'rojo' else 'gris' end,
    'motivo', case m.status when 'activo' then 'Activo'
                            when 'pausado' then 'Pausado' || coalesce(' hasta el ' || to_char(m.paused_until, 'DD/MM'), '')
                            when 'pendiente' then 'Pidió sumarse' when 'baja' then 'De baja' else 'No es socio' end,
    'apto_vencido', m.apto_medico_vence is not null and m.apto_medico_vence < public.gym_hoy());
end $$;
revoke all on function public.gym_semaforo(uuid) from public, anon, authenticated;

-- Los datos del gimnasio que ven su equipo y sus socios.
create or replace function public.gym_json(g uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return (select jsonb_build_object('id', x.id, 'name', x.name, 'city', x.city, 'province', x.province, 'address', x.address,
                                    'whatsapp', x.whatsapp, 'contact_email', x.contact_email, 'default_trainer_id', x.default_trainer_id)
            from public.gyms x where x.id = g);
end $$;
revoke all on function public.gym_json(uuid) from public, anon, authenticated;

-- ¿Usa una versión vieja de la app de la tienda? (la que el admin marcó como «ultima» en app_config
-- «version», como el cartel de actualizar: app/ui/actualizar.js). La web siempre está al día.
create or replace function public.gym_app_vieja(plataforma text, version text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare build int; ultima int;
begin
  if plataforma not in ('android', 'ios') or version is null then return false; end if;
  build := (regexp_match(version, '\((\d{1,9})\)'))[1]::int;
  select (c.value->plataforma->>'ultima')::int into ultima from public.app_config c where c.key = 'version';
  return build is not null and coalesce(ultima, 0) > 0 and build < ultima;
exception when others then return false;
end $$;
revoke all on function public.gym_app_vieja(text, text) from public, anon, authenticated;

-- ¿Puede esta cuenta crear un gimnasio? null = sí; si no, el texto de por qué no.
create or replace function public.gym_crear_motivo(me uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare b record;
begin
  if me is null then return 'Tenés que ingresar con tu cuenta.'; end if;
  if not coalesce((select (c.value->>'alta')::boolean from public.app_config c where c.key = 'gimnasios'), false) then
    return 'Por ahora no se pueden crear gimnasios.';
  end if;
  if not exists (select 1 from public.profiles where id = me and role = 'coach') then
    return 'Para crear un gimnasio necesitás una cuenta de coach.';
  end if;
  if exists (select 1 from public.gym_staff s where s.user_id = me and s.left_at is null) then
    return 'Ya sos del equipo de un gimnasio.';
  end if;
  if exists (select 1 from public.gym_members m where m.member_id = me and m.status <> 'baja') then
    return 'Sos socio de un gimnasio: primero salí desde Ajustes.';
  end if;
  select bb.* into b from public.coach_billing bb where bb.coach_id = me;
  if b.coach_id is null
     or not (b.plan = 'cortesia'
             or (b.plan = 'trial' and b.trial_ends_at > now())
             or (b.plan in ('p100', 'p250', 'p500') and greatest(b.trial_ends_at, coalesce(b.paid_until, '-infinity')) > now())) then
    return 'Para crear un gimnasio escribinos por WhatsApp.';
  end if;
  return null;
end $$;
revoke all on function public.gym_crear_motivo(uuid) from public, anon, authenticated;


-- ===== Fotos del gimnasio (bucket gym-fotos) =====

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gym-fotos', 'gym-fotos', false, 307200, array['image/jpeg', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ¿Puedo ver la foto del gimnasio de esta ficha? (no en baja) El socio, la suya (vigente o pedido).
-- Dueño y administración, todas. La recepción, las de las fichas (las de los pedidos, solo si aprueba:
-- «altas»). El profe, las de sus asignados (activos o pausados), y todas menos los pedidos si el
-- gimnasio le abre la recepción. Spec §1.2: el profe ve lo suyo; la recepción, nombre, foto y semáforo.
create or replace function public.gym_foto_ve_ficha(fid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare me uuid := auth.uid(); m record; s record; st jsonb;
begin
  select x.gym_id, x.member_id, x.trainer_id, x.status into m from public.gym_members x where x.id = fid;
  if me is null or m.gym_id is null or m.status = 'baja' then return false; end if;
  if m.member_id = me then return true; end if;
  select * into s from public.gym_mi_staff();
  if s.g is distinct from m.gym_id then return false; end if;
  if s.rol in ('owner', 'admin') then return true; end if;
  st := public.gym_settings(s.g);
  if s.rol = 'recepcion' or (s.rol = 'profe' and coalesce((st->>'profes_recepcion')::boolean, false)) then
    if m.status <> 'pendiente' then return true; end if;
    return s.rol = 'recepcion' and coalesce((st->>'recepcion_altas')::boolean, false);
  end if;
  return s.rol = 'profe' and m.trainer_id = me and m.status in ('activo', 'pausado');
end $$;
revoke all on function public.gym_foto_ve_ficha(uuid) from public, anon, authenticated;

-- ¿Puedo subir (subir = true) o ver la carpeta {g}/{f}? Subir: el socio, a la de su ficha que no
-- está en baja (vigente o pedido); dueño y administración (y la recepción con «altas») a cualquier
-- ficha de su gimnasio que no esté en baja. Ver: gym_foto_ve_ficha.
create or replace function public.gym_foto_carpeta(g text, f text, subir boolean)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare me uuid := auth.uid(); s record; uu text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if me is null or g is null or f is null or g !~ uu or f !~ uu then return false; end if;
  if not exists (select 1 from public.gym_members m where m.id = f::uuid and m.gym_id = g::uuid and m.status <> 'baja') then
    return false;
  end if;
  if not coalesce(subir, false) then return public.gym_foto_ve_ficha(f::uuid); end if;
  if exists (select 1 from public.gym_members m where m.id = f::uuid and m.member_id = me) then return true; end if;
  select * into s from public.gym_mi_staff();
  if s.g is distinct from g::uuid then return false; end if;
  return s.rol in ('owner', 'admin') or (s.rol = 'recepcion' and coalesce((public.gym_settings(s.g)->>'recepcion_altas')::boolean, false));
end $$;
revoke all on function public.gym_foto_carpeta(text, text, boolean) from public, anon;
grant execute on function public.gym_foto_carpeta(text, text, boolean) to authenticated;

-- Ver una foto del bucket (la política de abajo): la de la carpeta de su ficha; y si esa ficha ya no
-- existe (un pedido que el gimnasio unió a una ficha cargada con «es la ficha de…»), la de la ficha
-- del mismo gimnasio que la usa como foto (aprobada o propuesta).
create or replace function public.gym_foto_ver(name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare g text := split_part(coalesce(name, ''), '/', 1); f text := split_part(coalesce(name, ''), '/', 2); fid uuid;
        uu text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if auth.uid() is null or g !~ uu or f !~ uu then return false; end if;
  if exists (select 1 from public.gym_members m where m.id = f::uuid) then return public.gym_foto_carpeta(g, f, false); end if;
  select m.id into fid from public.gym_members m where m.foto_path = gym_foto_ver.name and m.gym_id = g::uuid limit 1;
  if fid is null then
    select m.id into fid from public.gym_members m where m.foto_pend_path = gym_foto_ver.name and m.gym_id = g::uuid limit 1;
  end if;
  return fid is not null and public.gym_foto_ve_ficha(fid);
end $$;
revoke all on function public.gym_foto_ver(text) from public, anon;
grant execute on function public.gym_foto_ver(text) to authenticated;

-- Tope de subidas por día (las últimas 24 horas, de quien sube): socio 5, equipo 300.
create or replace function public.gym_fotos_cupo_libre(p_owner text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare lim int;
begin
  if p_owner is null then return false; end if;
  lim := case when exists (select 1 from public.gym_staff s where s.user_id::text = p_owner and s.left_at is null) then 300 else 5 end;
  return (select count(*) from storage.objects o where o.bucket_id = 'gym-fotos' and o.owner_id = p_owner
                                                   and o.created_at > now() - interval '1 day') < lim;
end $$;
revoke all on function public.gym_fotos_cupo_libre(text) from public, anon, authenticated;

create or replace function public.gym_fotos_cupo_ok()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return auth.uid() is not null and public.gym_fotos_cupo_libre(auth.uid()::text);
end $$;
revoke all on function public.gym_fotos_cupo_ok() from public, anon;
grant execute on function public.gym_fotos_cupo_ok() to authenticated;

drop policy if exists "gym-fotos: subir" on storage.objects;
create policy "gym-fotos: subir" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'gym-fotos'
              and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|webp)$'
              and public.gym_foto_carpeta((storage.foldername(name))[1], (storage.foldername(name))[2], true)
              and public.gym_fotos_cupo_ok());
drop policy if exists "gym-fotos: ver" on storage.objects;
create policy "gym-fotos: ver" on storage.objects
  for select to authenticated
  using (bucket_id = 'gym-fotos' and public.gym_foto_ver(name));

-- El mismo tope en cada alta (con un link firmado de subida, Storage no vuelve a mirar la política;
-- ver topes-archivos.sql), de a una por cuenta.
create or replace function public.gym_fotos_cupo_alta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.bucket_id = 'gym-fotos' and new.owner_id is not null
     and not coalesce((to_jsonb(new)->>'is_delete_marker')::boolean, false) then
    perform pg_advisory_xact_lock(hashtextextended('storage_cupo gym-fotos ' || new.owner_id, 0));
    if not public.gym_fotos_cupo_libre(new.owner_id) then
      raise exception 'Llegaste al límite de fotos por hoy' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.gym_fotos_cupo_alta() from public, anon, authenticated;
create or replace trigger gym_fotos_cupo_alta before insert on storage.objects
  for each row execute function public.gym_fotos_cupo_alta();

-- ¿Esa ruta es de la carpeta de esa ficha y el archivo ya está subido?
create or replace function public.gym_foto_valida(g uuid, fid uuid, path text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return path is not null and path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|webp)$'
     and split_part(path, '/', 1) = g::text and split_part(path, '/', 2) = fid::text
     and exists (select 1 from storage.objects o where o.bucket_id = 'gym-fotos' and o.name = path);
end $$;
revoke all on function public.gym_foto_valida(uuid, uuid, text) from public, anon, authenticated;

-- Las fotos del bucket que ya no usa ninguna ficha (de un pedido rechazado o cancelado, una propuesta
-- reemplazada o rechazada, un gimnasio purgado a los 90 días), subidas hace más de 2 días: hasta 500
-- por vez. Desde SQL no se borran archivos de Storage: las borra con la API de Storage una tarea del
-- service role (pendiente, con las funciones de la etapa 1).
create or replace function public.gym_fotos_huerfanas()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select o.name from storage.objects o
   where o.bucket_id = 'gym-fotos' and o.created_at < now() - interval '2 days'
     and not exists (select 1 from public.gym_members m where m.foto_path = o.name)
     and not exists (select 1 from public.gym_members m where m.foto_pend_path = o.name)
   order by o.created_at
   limit 500;
$$;
revoke all on function public.gym_fotos_huerfanas() from public, anon, authenticated;
grant execute on function public.gym_fotos_huerfanas() to service_role;


-- ===== Arranque =====

-- Lo que la app necesita saber al abrir (con un tope de 4 s y copia local: si devuelve null, falla o
-- tarda, la cuenta se comporta como hoy). null si la persona no tiene nada que ver con un gimnasio.
--   Equipo:   {gym, rol: owner|admin|profe|recepcion, codigo, settings, plan, mis_fichas, mis_socios,
--              contadores, puede_crear: false}. plan completo para dueño y administración; el profe
--              recibe estado y fechas; la recepción, nada. contadores, solo dueño y administración.
--   Socio:    {gym, rol: 'socio', ficha: {id, status, paused_until, terms_at, terms_version,
--              share_admin, profe: {id, name}|null, coach_externo, foto: ok|pendiente|rechazada|falta,
--              foto_rechazo, foto_path, foto_pend_path, origen (gym_members.source: la tarjeta de
--              confirmación distingue una cuenta convertida, 'conversion', de un pedido con la app vieja)}}.
--   Pedido:   {gym, rol: 'pendiente', solicitud: {id, gym, requested_at, terms, foto: pendiente|falta,
--              foto_pend_path}}.
--   Un coach sin gimnasio que puede crear uno (interruptor prendido): {gym: null, rol: null,
--              puede_crear: true}. La app lo trata como «sin gimnasio» salvo en #gimnasio.
create or replace function public.mi_gimnasio()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare me uuid := auth.uid(); s record; m record; r jsonb; pl jsonb; hoy date := public.gym_hoy(); c uuid;
begin
  if me is null then return null; end if;
  select * into s from public.gym_mi_staff();
  if s.g is not null then
    r := jsonb_build_object('gym', public.gym_json(s.g), 'rol', s.rol, 'settings', public.gym_settings(s.g), 'puede_crear', false,
           'codigo', (select k.code from public.gym_codes k where k.gym_id = s.g and k.kind = 'gym' and k.revoked_at is null limit 1));
    pl := public.gym_plan_estado(s.g);
    if s.rol in ('owner', 'admin') then
      r := r || jsonb_build_object('plan', pl, 'contadores', jsonb_build_object(
        'solicitudes', (select count(*) from public.gym_members x where x.gym_id = s.g and x.status = 'pendiente'),
        'sin_profe', (select count(*) from public.gym_members x join public.profiles p on p.id = x.member_id
                       where x.gym_id = s.g and x.status in ('activo', 'pausado') and x.trainer_id is null and p.coach_id is null),
        'falta_confirmacion', (select count(*) from public.gym_members x
                                where x.gym_id = s.g and x.status in ('activo', 'pausado') and x.member_id is not null and x.terms_at is null),
        -- Las fotos de los pedidos se aprueban desde Solicitudes (ya cuentan en 'solicitudes'): acá solo las
        -- de los socios, las que se ven en Socios con «Foto para aprobar».
        'fotos_pendientes', (select count(*) from public.gym_members x where x.gym_id = s.g and x.status not in ('baja', 'pendiente') and x.foto_pend_path is not null),
        'ingresos_hoy', (select count(*) from public.gym_entries e
                          where e.gym_id = s.g and e.at >= (hoy::timestamp at time zone 'America/Argentina/Buenos_Aires')),
        'invitaciones', (select count(*) from public.gym_invites i
                          where i.gym_id = s.g and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()),
        'aptos_vencidos', (select count(*) from public.gym_members x
                            where x.gym_id = s.g and x.status in ('activo', 'pausado') and x.apto_medico_vence < hoy)));
    elsif s.rol = 'profe' then
      -- El profe: el estado y las fechas (los carteles de gracia y de pausa) y si el gimnasio llegó al
      -- cupo (la caja del código: «El gimnasio no puede sumar socios en este momento»), sin números.
      r := r || jsonb_build_object('plan', jsonb_build_object('estado', pl->'estado', 'vence', pl->'vence', 'pausa_profes_el', pl->'pausa_profes_el',
        'cupo_lleno', (pl->>'seats_used')::int >= (pl->>'max')::int));
    end if;
    if s.rol in ('owner', 'admin', 'profe') then
      r := r || jsonb_build_object(
        'mis_fichas', coalesce((select jsonb_agg(x.id order by x.id) from public.gym_members x
                                 where x.gym_id = s.g and x.trainer_id = me and x.status in ('activo', 'pausado')), '[]'::jsonb),
        'mis_socios', coalesce((select jsonb_agg(x.member_id order by x.member_id) from public.gym_members x
                                 where x.gym_id = s.g and x.trainer_id = me and x.status in ('activo', 'pausado')), '[]'::jsonb));
    end if;
    return r;
  end if;
  select x.* into m from public.gym_members x join public.gyms y on y.id = x.gym_id and y.closed_at is null
   where x.member_id = me and x.status <> 'baja' limit 1;
  if m.id is not null then
    if m.status = 'pendiente' then
      return jsonb_build_object('gym', (select jsonb_build_object('id', y.id, 'name', y.name, 'city', y.city) from public.gyms y where y.id = m.gym_id),
        'rol', 'pendiente', 'puede_crear', false,
        'solicitud', jsonb_build_object('id', m.id, 'gym', (select y.name from public.gyms y where y.id = m.gym_id),
                                        'requested_at', m.requested_at, 'terms', m.terms_at is not null,
                                        'foto', case when m.foto_pend_path is not null then 'pendiente' else 'falta' end,
                                        'foto_pend_path', m.foto_pend_path));
    end if;
    select p.coach_id into c from public.profiles p where p.id = me;
    return jsonb_build_object('gym', public.gym_json(m.gym_id), 'rol', 'socio', 'puede_crear', false,
      'ficha', jsonb_build_object('id', m.id, 'status', m.status, 'paused_until', m.paused_until, 'terms_at', m.terms_at,
        'terms_version', m.terms_version, 'share_admin', m.share_admin,
        'profe', (select jsonb_build_object('id', p.id, 'name', p.full_name) from public.profiles p where p.id = m.trainer_id),
        'coach_externo', c is not null and m.trainer_id is null,
        'foto', case when m.foto_pend_path is not null then 'pendiente' when m.foto_path is not null then 'ok'
                     when m.foto_rechazo is not null then 'rechazada' else 'falta' end,
        'foto_rechazo', m.foto_rechazo, 'foto_path', m.foto_path, 'foto_pend_path', m.foto_pend_path, 'origen', m.source));
  end if;
  if public.gym_crear_motivo(me) is null then
    return jsonb_build_object('gym', null, 'rol', null, 'puede_crear', true);
  end if;
  return null;
end $$;
revoke all on function public.mi_gimnasio() from public, anon;
grant execute on function public.mi_gimnasio() to authenticated;


-- ===== Alta y dueño =====

-- Crear un gimnasio (web; el coach acepta el contrato de encargo). Pide el interruptor
-- app_config.gimnasios.alta, que no sea del equipo ni socio de otro, y un plan de prueba en curso,
-- cortesía o p100 o más vigente. Con la prueba en curso, el tope pasa a 100 socios.
create or replace function public.gym_crear(nombre text, ciudad text, provincia text, dpa_version text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid(); motivo text; g uuid; cod text; n text := btrim(coalesce(nombre, ''));
begin
  perform 1 from public.profiles where id = me for update;
  motivo := public.gym_crear_motivo(me);
  if motivo is not null then raise exception '%', motivo using errcode = 'P0001'; end if;
  perform public.gym_version_ok('encargo', dpa_version);
  if char_length(n) not between 2 and 80 then
    raise exception 'El nombre del gimnasio tiene que tener entre 2 y 80 letras.' using errcode = 'P0001';
  end if;
  insert into public.gyms (name, owner_id, city, province, dpa_version, dpa_at)
  values (n, me, left(nullif(btrim(ciudad), ''), 80), left(nullif(btrim(provincia), ''), 80), dpa_version, now())
  returning id into g;
  insert into public.gym_staff (gym_id, user_id, role, invited_by) values (g, me, 'owner', me);
  cod := public.gym_codigo_nuevo();
  insert into public.gym_codes (code, gym_id) values (cod, g);
  update public.coach_billing set max_clients = greatest(coalesce(max_clients, 10), 100)
   where coach_id = me and plan = 'trial' and trial_ends_at > now();
  perform public.gym_auditar(g, 'gym_crear', null, me, jsonb_build_object('dpa_version', dpa_version));
  return jsonb_build_object('gym_id', g, 'code', cod);
end $$;
revoke all on function public.gym_crear(text, text, text, text) from public, anon;
grant execute on function public.gym_crear(text, text, text, text) to authenticated;

-- Cambiar los datos y los interruptores (dueño y administración). Lista blanca de campos y claves.
create or replace function public.gym_config(patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare g uuid := public.gym_exigir(array['owner', 'admin']); k text; v jsonb; antes jsonb; x record; cfg jsonb;
begin
  if patch is null or jsonb_typeof(patch) <> 'object' then raise exception 'Datos inválidos.' using errcode = 'P0001'; end if;
  select * into x from public.gyms where id = g for update;
  antes := jsonb_build_object('name', x.name, 'city', x.city, 'province', x.province, 'address', x.address, 'whatsapp', x.whatsapp,
                              'contact_email', x.contact_email, 'default_trainer_id', x.default_trainer_id, 'settings', x.settings);
  for k, v in select * from jsonb_each(patch) loop
    if k not in ('name', 'city', 'province', 'address', 'whatsapp', 'contact_email', 'default_trainer_id', 'settings') then
      raise exception 'No se puede cambiar «%».', k using errcode = 'P0001';
    end if;
    if k <> 'settings' and jsonb_typeof(v) not in ('string', 'null') then raise exception 'Revisá «%».', k using errcode = 'P0001'; end if;
  end loop;
  if patch ? 'name' and char_length(btrim(coalesce(patch->>'name', ''))) not between 2 and 80 then
    raise exception 'El nombre del gimnasio tiene que tener entre 2 y 80 letras.' using errcode = 'P0001';
  end if;
  if char_length(coalesce(patch->>'city', '')) > 80 or char_length(coalesce(patch->>'province', '')) > 80
     or char_length(coalesce(patch->>'address', '')) > 160 then
    raise exception 'Revisá la dirección: es muy larga.' using errcode = 'P0001';
  end if;
  if patch ? 'whatsapp' and coalesce(patch->>'whatsapp', '') !~ '^(\+?[0-9 ()-]{6,24})?$' then
    raise exception 'Revisá el WhatsApp.' using errcode = 'P0001';
  end if;
  if patch ? 'contact_email' and coalesce(patch->>'contact_email', '') !~ '^([^@\s]{1,64}@[^@\s]{1,120}\.[^@\s]{2,20})?$' then
    raise exception 'Revisá el mail.' using errcode = 'P0001';
  end if;
  if patch ? 'default_trainer_id' and patch->>'default_trainer_id' is not null
     and public.gym_profe_no_puede(g, (patch->>'default_trainer_id')::uuid, null) is not null then
    raise exception 'El profe por defecto tiene que ser profe del gimnasio.' using errcode = 'P0001';
  end if;
  cfg := coalesce(x.settings, '{}'::jsonb);
  if patch ? 'settings' then
    if jsonb_typeof(patch->'settings') <> 'object' then raise exception 'Revisá los interruptores.' using errcode = 'P0001'; end if;
    for k, v in select * from jsonb_each(patch->'settings') loop
      if k in ('recepcion_cobra', 'recepcion_altas', 'profes_recepcion', 'profes_montos', 'aprobar_solas') then
        if jsonb_typeof(v) <> 'boolean' then raise exception 'Revisá «%».', k using errcode = 'P0001'; end if;
      elsif k = 'ingreso_horas' then
        if jsonb_typeof(v) <> 'number' or (v #>> '{}')::numeric not between 1 and 24 or (v #>> '{}')::numeric <> floor((v #>> '{}')::numeric) then
          raise exception 'Un ingreso cada 1 a 24 horas.' using errcode = 'P0001';
        end if;
      else
        raise exception 'No se puede cambiar «%».', k using errcode = 'P0001';
      end if;
      cfg := cfg || jsonb_build_object(k, v);
    end loop;
  end if;
  update public.gyms set
    name = case when patch ? 'name' then btrim(patch->>'name') else name end,
    city = case when patch ? 'city' then nullif(btrim(patch->>'city'), '') else city end,
    province = case when patch ? 'province' then nullif(btrim(patch->>'province'), '') else province end,
    address = case when patch ? 'address' then nullif(btrim(patch->>'address'), '') else address end,
    whatsapp = case when patch ? 'whatsapp' then nullif(btrim(patch->>'whatsapp'), '') else whatsapp end,
    contact_email = case when patch ? 'contact_email' then nullif(btrim(patch->>'contact_email'), '') else contact_email end,
    default_trainer_id = case when patch ? 'default_trainer_id' then (patch->>'default_trainer_id')::uuid else default_trainer_id end,
    settings = cfg
   where id = g;
  perform public.gym_auditar(g, 'config', null, null, jsonb_build_object('antes', antes, 'cambio', patch));
  return jsonb_build_object('gym', public.gym_json(g), 'settings', public.gym_settings(g));
end $$;
revoke all on function public.gym_config(jsonb) from public, anon;
grant execute on function public.gym_config(jsonb) to authenticated;

create or replace function public.gym_codigo_rotar()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare g uuid := public.gym_exigir(array['owner', 'admin']); cod text; viejo text;
begin
  perform 1 from public.gyms where id = g for update;
  select k.code into viejo from public.gym_codes k where k.gym_id = g and k.kind = 'gym' and k.revoked_at is null;
  update public.gym_codes set revoked_at = now() where gym_id = g and kind = 'gym' and revoked_at is null;
  cod := public.gym_codigo_nuevo();
  insert into public.gym_codes (code, gym_id) values (cod, g);
  perform public.gym_auditar(g, 'codigo_rotar', null, null, jsonb_build_object('antes', viejo, 'nuevo', cod));
  return jsonb_build_object('code', cod);
end $$;
revoke all on function public.gym_codigo_rotar() from public, anon;
grant execute on function public.gym_codigo_rotar() to authenticated;

-- Cerrar el gimnasio (solo el dueño, escribiendo el nombre exacto).
create or replace function public.gym_cerrar(confirm text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare g uuid := public.gym_exigir(array['owner']); n int;
begin
  if btrim(coalesce(confirm, '')) is distinct from (select x.name from public.gyms x where x.id = g) then
    raise exception 'Escribí el nombre exacto del gimnasio para cerrarlo.' using errcode = 'P0001';
  end if;
  n := public.gym_cerrar_interno(g, 'dueño');
  return jsonb_build_object('ok', true, 'sin_coach', n);
end $$;
revoke all on function public.gym_cerrar(text) from public, anon;
grant execute on function public.gym_cerrar(text) to authenticated;

-- Exportar (dueño y administración; anda con el plan vencido y liberado): 'socios', 'ingresos' o
-- 'equipo'. Filas para el CSV, sin registros de salud. El dueño exporta «siempre» (§1.2): también
-- después de cerrar su gimnasio, mientras se guardan los ingresos (24 meses, §9 P22); sin equipo
-- abierto, exporta el último gimnasio que cerró él.
create or replace function public.gym_exportar(tipo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare yo record; g uuid; r jsonb;
begin
  select * into yo from public.gym_mi_staff();
  if yo.g is not null and yo.rol in ('owner', 'admin') then
    g := yo.g;
  elsif yo.g is null and auth.uid() is not null then
    select x.id into g from public.gyms x
     where x.owner_id = auth.uid() and x.close_reason = 'dueño' and x.closed_at > now() - interval '24 months'
     order by x.closed_at desc limit 1;
  end if;
  if g is null then raise exception 'No tenés permiso para hacer esto en el gimnasio.' using errcode = '42501'; end if;
  if tipo = 'socios' then
    select coalesce(jsonb_agg(jsonb_build_object('nombre', coalesce(nullif(m.full_name, ''), p.full_name), 'dni', m.dni, 'telefono', m.phone,
             'email', m.email, 'nacimiento', m.birthdate, 'estado', m.status, 'profe', t.full_name, 'alta', m.joined_at::date,
             'baja', m.left_at::date, 'apto_medico_vence', m.apto_medico_vence, 'sin_app', m.member_id is null,
             'ultimo_ingreso', (select max(e.at) from public.gym_entries e where e.gym_member_id = m.id))
             order by coalesce(nullif(m.full_name, ''), p.full_name)), '[]'::jsonb) into r
      from public.gym_members m left join public.profiles p on p.id = m.member_id left join public.profiles t on t.id = m.trainer_id
     where m.gym_id = g and m.status <> 'pendiente';
  elsif tipo = 'ingresos' then
    select coalesce(jsonb_agg(jsonb_build_object('fecha', e.at, 'socio', coalesce(nullif(m.full_name, ''), p.full_name), 'metodo', e.method,
             'resultado', e.result, 'registro', u.full_name) order by e.at desc), '[]'::jsonb) into r
      from public.gym_entries e join public.gym_members m on m.id = e.gym_member_id
      left join public.profiles p on p.id = m.member_id left join public.profiles u on u.id = e.by_user
     where e.gym_id = g;
  elsif tipo = 'equipo' then
    select coalesce(jsonb_agg(jsonb_build_object('nombre', p.full_name, 'rol', s.role, 'desde', s.joined_at::date, 'hasta', s.left_at::date)
             order by s.joined_at), '[]'::jsonb) into r
      from public.gym_staff s join public.profiles p on p.id = s.user_id where s.gym_id = g;
  else
    raise exception 'Elegí qué exportar: socios, ingresos o equipo.' using errcode = 'P0001';
  end if;
  perform public.gym_auditar(g, 'exportar', null, null, jsonb_build_object('tipo', tipo, 'filas', jsonb_array_length(r)));
  return r;
end $$;
revoke all on function public.gym_exportar(text) from public, anon;
grant execute on function public.gym_exportar(text) to authenticated;


-- ===== Equipo =====

-- Invitar (dueño y administración; la administración no invita a otra administración). Devuelve
-- el token del link gize.ar/app/#equipo=<token> (se guarda solo el hash; vale 7 días).
create or replace function public.gym_invitar(rol text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare s record; tok text := public.gym_token(); iid uuid; vence timestamptz := now() + interval '7 days';
begin
  perform public.gym_exigir(array['owner', 'admin']);
  select * into s from public.gym_mi_staff();
  if rol is null or rol not in ('admin', 'profe', 'recepcion') then raise exception 'Elegí un rol: administración, profe o recepción.' using errcode = 'P0001'; end if;
  if s.rol = 'admin' and rol = 'admin' then
    raise exception 'La administración no puede invitar a otra persona de la administración.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.gym_invites i where i.gym_id = s.g and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()) >= 50 then
    raise exception 'Hay muchas invitaciones sin aceptar: anulá alguna.' using errcode = 'P0001';
  end if;
  insert into public.gym_invites (gym_id, role, token_hash, expires_at, invited_by) values (s.g, rol, public.gym_hash(tok), vence, auth.uid())
  returning id into iid;
  perform public.gym_auditar(s.g, 'invitar', null, null, jsonb_build_object('rol', rol, 'invitacion', iid));
  return jsonb_build_object('id', iid, 'token', tok, 'expires_at', vence);
end $$;
revoke all on function public.gym_invitar(text) from public, anon;
grant execute on function public.gym_invitar(text) to authenticated;

create or replace function public.gym_invitacion_revocar(id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare s record; r text;
begin
  perform public.gym_exigir(array['owner', 'admin']);
  select * into s from public.gym_mi_staff();
  select i.role into r from public.gym_invites i where i.id = gym_invitacion_revocar.id and i.gym_id = s.g and i.accepted_at is null and i.revoked_at is null;
  if r is null then raise exception 'Esa invitación ya no está pendiente.' using errcode = 'P0001'; end if;
  if s.rol = 'admin' and r = 'admin' then raise exception 'No tenés permiso para hacer esto en el gimnasio.' using errcode = '42501'; end if;
  update public.gym_invites set revoked_at = now() where gym_invites.id = gym_invitacion_revocar.id;
  perform public.gym_auditar(s.g, 'invitacion_revocar', null, null, jsonb_build_object('invitacion', gym_invitacion_revocar.id, 'rol', r));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.gym_invitacion_revocar(uuid) from public, anon;
grant execute on function public.gym_invitacion_revocar(uuid) to authenticated;

create or replace function public.gym_invitaciones()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare g uuid := public.gym_exigir(array['owner', 'admin']);
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'role', i.role, 'created_at', i.created_at, 'expires_at', i.expires_at,
                                                       'invitada_por', p.full_name) order by i.created_at desc)
                     from public.gym_invites i left join public.profiles p on p.id = i.invited_by
                    where i.gym_id = g and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()), '[]'::jsonb);
end $$;
revoke all on function public.gym_invitaciones() from public, anon;
grant execute on function public.gym_invitaciones() to authenticated;

-- El equipo (dueño y administración): cada persona con su rol, cuántos socios tiene asignados, la
-- última vez que abrió GIZE y si usa una versión vieja de la app. Sin mails ni datos de salud.
create or replace function public.gym_equipo()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare g uuid := public.gym_exigir(array['owner', 'admin']);
begin
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', s.user_id, 'nombre', p.full_name, 'avatar_path', p.avatar_path,
      'rol', s.role, 'coach', p.role = 'coach', 'joined_at', s.joined_at, 'last_seen_at', p.last_seen_at,
      'app_platform', p.app_platform, 'app_version', p.app_version, 'app_vieja', public.gym_app_vieja(p.app_platform, p.app_version),
      'socios', (select count(*) from public.gym_members m where m.gym_id = g and m.trainer_id = s.user_id and m.status in ('activo', 'pausado')))
      order by case s.role when 'owner' then 0 when 'admin' then 1 when 'profe' then 2 else 3 end, p.full_name)
    from public.gym_staff s join public.profiles p on p.id = s.user_id
   where s.gym_id = g and s.left_at is null), '[]'::jsonb);
end $$;
revoke all on function public.gym_equipo() from public, anon;
grant execute on function public.gym_equipo() to authenticated;

-- Qué pasa si esta cuenta acepta esa invitación (sin cambiar nada).
create or replace function public.gym_invitacion_estado(iid uuid, me uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare i record; p record;
begin
  select ii.*, x.closed_at into i from public.gym_invites ii join public.gyms x on x.id = ii.gym_id where ii.id = iid;
  if i.id is null or i.revoked_at is not null or i.expires_at < now() or i.closed_at is not null then return 'vencida'; end if;
  if i.accepted_at is not null then return 'usada'; end if;
  select pp.role, pp.coach_id into p from public.profiles pp where pp.id = me;
  if exists (select 1 from public.gym_staff s where s.user_id = me and s.left_at is null) then return 'ya_staff'; end if;
  if exists (select 1 from public.gym_members m where m.member_id = me and m.status <> 'baja') then return 'es_socio'; end if;
  if p.coach_id is not null then return 'es_alumno'; end if;
  -- La recepción reemplaza al panel de coach: un coach con alumnos propios se quedaba sin llegar a
  -- ellos ni al chat. La recepción va con otra cuenta (otro mail).
  if i.role = 'recepcion' and p.role = 'coach' and exists (select 1 from public.profiles c where c.coach_id = me) then return 'recepcion_coach'; end if;
  if i.role = 'profe' and coalesce(p.role, 'client') <> 'coach' then return 'necesita_coach'; end if;
  if (i.role = 'profe' or (i.role = 'admin' and p.role = 'coach'))
     and public.gym_profes_usados(i.gym_id) >= public.gym_tope_profes(i.gym_id) then
    return 'tope';
  end if;
  return 'ok';
end $$;
revoke all on function public.gym_invitacion_estado(uuid, uuid) from public, anon, authenticated;

-- Lo que muestra el link #equipo= antes de aceptar: el gimnasio, el rol y qué pasaría.
create or replace function public.gym_invitacion_info(token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare i record;
begin
  select ii.id, ii.role, x.name, x.city into i from public.gym_invites ii join public.gyms x on x.id = ii.gym_id
   where ii.token_hash = public.gym_hash(token);
  if i.id is null then return jsonb_build_object('gym', null, 'role', null, 'estado', 'vencida'); end if;
  return jsonb_build_object('gym', jsonb_build_object('name', i.name, 'city', i.city), 'role', i.role,
                            'estado', public.gym_invitacion_estado(i.id, auth.uid()));
end $$;
revoke all on function public.gym_invitacion_info(text) from public, anon;
grant execute on function public.gym_invitacion_info(text) to authenticated;

create or replace function public.gym_aceptar_invitacion(token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid(); i record; est text;
begin
  if me is null then raise exception 'Tenés que ingresar con tu cuenta.' using errcode = '42501'; end if;
  perform 1 from public.profiles where id = me for update;
  select ii.* into i from public.gym_invites ii where ii.token_hash = public.gym_hash(token);
  if i.id is not null then
    perform 1 from public.gyms where id = i.gym_id for update;          -- el tope de profes, de a uno
    perform 1 from public.gym_invites where id = i.id for update;
  end if;
  est := case when i.id is null then 'vencida' else public.gym_invitacion_estado(i.id, me) end;
  if est <> 'ok' then
    raise exception '%', case est
      when 'vencida' then 'La invitación venció o la anularon: pedile otra al gimnasio.'
      when 'usada' then 'Esa invitación ya se usó: pedile otra al gimnasio.'
      when 'ya_staff' then 'Ya sos del equipo de un gimnasio.'
      when 'es_socio' then 'Sos socio de un gimnasio: para sumarte al equipo, primero salí desde Ajustes.'
      when 'es_alumno' then case when i.role = 'profe' then 'Para ser profe primero desvinculate de tu coach.'
                                 else 'Para sumarte al equipo del gimnasio primero desvinculate de tu coach en Ajustes.' end
      when 'necesita_coach' then 'Para ser profe necesitás una cuenta de coach.'
      when 'recepcion_coach' then 'Con tu cuenta de coach tenés alumnos: para la recepción usá otra cuenta (otro mail), así seguís atendiéndolos con esta.'
      when 'tope' then 'El gimnasio llegó al tope de profes. Escribinos para sumar más profes.'
      else 'No se pudo aceptar la invitación.' end using errcode = 'P0001';
  end if;
  insert into public.gym_staff (gym_id, user_id, role, invited_by, joined_at, left_at)
  values (i.gym_id, me, i.role, i.invited_by, now(), null)
  on conflict (gym_id, user_id) do update set role = excluded.role, invited_by = excluded.invited_by, joined_at = now(), left_at = null;
  update public.gym_invites set accepted_by = me, accepted_at = now() where id = i.id;
  perform public.gym_auditar(i.gym_id, 'equipo_alta', null, me, jsonb_build_object('rol', i.role, 'invitacion', i.id));
  return jsonb_build_object('gym_id', i.gym_id, 'role', i.role, 'gym', (select jsonb_build_object('name', x.name) from public.gyms x where x.id = i.gym_id));
end $$;
revoke all on function public.gym_aceptar_invitacion(text) from public, anon;
grant execute on function public.gym_aceptar_invitacion(text) to authenticated;

-- Cambiar el rol de alguien del equipo: administración ↔ profe (profe con cuenta de coach); a
-- recepción, solo sin socios asignados; nunca al dueño. La administración no toca a otra
-- administración.
create or replace function public.gym_cambiar_rol(usuario uuid, rol text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare s record; r text; coach boolean; antes boolean; despues boolean;
begin
  perform public.gym_exigir(array['owner', 'admin']);
  select * into s from public.gym_mi_staff();
  if rol is null or rol not in ('admin', 'profe', 'recepcion') then raise exception 'Elegí un rol: administración, profe o recepción.' using errcode = 'P0001'; end if;
  perform 1 from public.gyms where id = s.g for update;
  select st.role into r from public.gym_staff st where st.gym_id = s.g and st.user_id = usuario and st.left_at is null for update;
  if r is null then raise exception 'Esa persona no es del equipo.' using errcode = 'P0001'; end if;
  if r = 'owner' then raise exception 'Al dueño no se le cambia el rol.' using errcode = 'P0001'; end if;
  if s.rol = 'admin' and (r = 'admin' or rol = 'admin') then
    raise exception 'La administración no puede cambiar el rol de otra persona de la administración.' using errcode = 'P0001';
  end if;
  if r = rol then return jsonb_build_object('ok', true, 'role', rol); end if;
  coach := exists (select 1 from public.profiles where id = usuario and role = 'coach');
  if rol = 'profe' and not coach then raise exception 'Para ser profe necesita una cuenta de coach.' using errcode = 'P0001'; end if;
  if rol = 'recepcion' and exists (select 1 from public.gym_members m where m.gym_id = s.g and m.trainer_id = usuario and m.status in ('activo', 'pausado')) then
    raise exception 'Primero pasá sus socios a otro profe.' using errcode = 'P0001';
  end if;
  -- Con alumnos propios (de afuera del gimnasio) perdería el panel de coach: la recepción, con otra cuenta.
  if rol = 'recepcion' and exists (select 1 from public.profiles c where c.coach_id = usuario) then
    raise exception 'Tiene alumnos propios con su cuenta de coach: para la recepción, que entre con otra cuenta (otro mail).' using errcode = 'P0001';
  end if;
  antes := r = 'profe' or (r = 'admin' and coach);
  despues := rol = 'profe' or (rol = 'admin' and coach);
  if despues and not antes and public.gym_profes_usados(s.g) >= public.gym_tope_profes(s.g) then
    raise exception 'El gimnasio llegó al tope de profes. Escribinos para sumar más profes.' using errcode = 'P0001';
  end if;
  update public.gym_staff set role = rol where gym_id = s.g and user_id = usuario;
  -- Si ya no puede atender (recepción, o administración sin cuenta de coach), deja de ser el profe
  -- por defecto (si no, los socios nuevos entraban sin profe sin que nadie lo viera).
  if public.gym_profe_no_puede(s.g, usuario, null) is not null then
    update public.gyms set default_trainer_id = null where id = s.g and default_trainer_id = usuario;
    if found then
      perform public.gym_auditar(s.g, 'config', null, usuario, jsonb_build_object('default_trainer_id', null, 'por', 'cambiar_rol'));
    end if;
  end if;
  perform public.gym_auditar(s.g, 'cambiar_rol', null, usuario, jsonb_build_object('antes', r, 'despues', rol));
  return jsonb_build_object('ok', true, 'role', rol);
end $$;
revoke all on function public.gym_cambiar_rol(uuid, text) from public, anon;
grant execute on function public.gym_cambiar_rol(uuid, text) to authenticated;

-- Quitar a alguien del equipo, pasando sus socios a otro profe (reasignar_a) o dejándolos sin profe,
-- en la misma operación (sin esto, el vínculo pasaba a ser propio del que se fue: la trampa C20). Los
-- que no aceptaron la hoja o tienen un bloqueo con el profe nuevo quedan sin profe (sin_profe; de esos,
-- falta_confirmacion los que no aceptaron la hoja, para que el panel lo explique).
-- Masiva: gize.gym_bulk; con profe nuevo, las rutinas programadas pasan a él (gize.gym_keep_routines);
-- sin profe, se borran como hoy. Al dueño no se lo quita; la administración no quita a otra (sí se
-- puede ir ella).
create or replace function public.gym_quitar_staff(usuario uuid, reasignar_a uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare s record; r text; dueno uuid; socios uuid[]; sin_hoja uuid[]; pasan uuid[]; quedan uuid[]; nh int := 0; bulk text := current_setting('gize.gym_bulk', true);
        keep text := current_setting('gize.gym_keep_routines', true); u uuid; hoy text := public.gym_hoy()::text;
begin
  perform public.gym_exigir(array['owner', 'admin']);
  select * into s from public.gym_mi_staff();
  select st.role into r from public.gym_staff st where st.gym_id = s.g and st.user_id = usuario and st.left_at is null;
  if r is null then raise exception 'Esa persona no es del equipo.' using errcode = 'P0001'; end if;
  if r = 'owner' then raise exception 'Al dueño no se lo puede quitar del gimnasio.' using errcode = 'P0001'; end if;
  if s.rol = 'admin' and r = 'admin' and usuario <> auth.uid() then
    raise exception 'La administración no puede quitar a otra persona de la administración.' using errcode = 'P0001';
  end if;
  if reasignar_a is not null then
    if reasignar_a = usuario or public.gym_profe_no_puede(s.g, reasignar_a, null) is not null then
      raise exception 'Elegí un profe del gimnasio para pasarle sus socios.' using errcode = 'P0001';
    end if;
    if not public.gym_active(s.g) then
      raise exception 'Por ahora el gimnasio no puede asignar profe: elegí «sin profe».' using errcode = 'P0001';
    end if;
  end if;
  select x.owner_id into dueno from public.gyms x where x.id = s.g;
  select coalesce(array_agg(m.member_id order by m.member_id), '{}'),
         coalesce(array_agg(m.member_id order by m.member_id) filter (where m.terms_at is null), '{}') into socios, sin_hoja
    from public.gym_members m
   where m.gym_id = s.g and m.trainer_id = usuario and m.status in ('activo', 'pausado') and m.member_id is not null;
  perform 1 from public.profiles where id = any(socios) order by id for update;
  pasan := '{}'; quedan := '{}';
  -- Como gym_asignar_profe: quien no aceptó la hoja («Falta confirmación») o tiene un bloqueo con el
  -- profe nuevo no pasa a otro profe: queda sin profe.
  foreach u in array socios loop
    if reasignar_a is not null and not (u = any(sin_hoja)) and not public.bloqueo_entre(u, reasignar_a) then pasan := pasan || u;
    else
      quedan := quedan || u;
      if reasignar_a is not null and u = any(sin_hoja) then nh := nh + 1; end if;
    end if;
  end loop;
  perform set_config('gize.gym_bulk', 'on', true);
  if cardinality(pasan) > 0 then
    perform set_config('gize.gym_keep_routines', 'on', true);
    update public.profiles set coach_id = reasignar_a where id = any(pasan) and coach_id = usuario;
    update public.routine_schedule set created_by = reasignar_a where client_id = any(pasan) and applied_at is null;
    perform set_config('gize.gym_keep_routines', coalesce(keep, ''), true);
  end if;
  update public.profiles set coach_id = null where id = any(quedan) and coach_id = usuario;
  update public.gyms set default_trainer_id = null where id = s.g and default_trainer_id = usuario;
  update public.gym_staff set left_at = now() where gym_id = s.g and user_id = usuario;
  perform set_config('gize.gym_bulk', coalesce(bulk, ''), true);
  perform public.gym_recontar(array[usuario, reasignar_a, dueno]);
  foreach u in array pasan loop
    perform public.gym_alerta(s.g, 'u:' || u, 'profe_asignado', u || ':' || reasignar_a || ':' || hoy, 'push', jsonb_build_object('profe', reasignar_a));
  end loop;
  if cardinality(pasan) > 0 then
    perform public.gym_alerta(s.g, 'u:' || reasignar_a, 'socios_asignados', 'quitar:' || usuario || ':' || hoy, 'push', jsonb_build_object('n', cardinality(pasan)));
  end if;
  perform public.gym_alerta_staff(s.g, 'profe_quitado', usuario || ':' || hoy,
    jsonb_build_object('reasignados', cardinality(pasan), 'sin_profe', cardinality(quedan), 'falta_confirmacion', nh));
  perform public.gym_auditar(s.g, 'quitar_staff', null, usuario,
    jsonb_build_object('rol', r, 'a', reasignar_a, 'reasignados', cardinality(pasan), 'sin_profe', cardinality(quedan), 'falta_confirmacion', nh));
  return jsonb_build_object('ok', true, 'reasignados', cardinality(pasan), 'sin_profe', cardinality(quedan), 'falta_confirmacion', nh);
end $$;
revoke all on function public.gym_quitar_staff(uuid, uuid) from public, anon;
grant execute on function public.gym_quitar_staff(uuid, uuid) to authenticated;

-- Cuando alguien entra al equipo, cambia de rol o se va (también sin gym_quitar_staff: el borrado de
-- la cuenta, cerrar el gimnasio), el profe de las fichas de sus alumnos en ese gimnasio vuelve a salir
-- de gym_profe_ficha: el coach que entra como profe pasa a ser el profe en el gimnasio de los socios
-- que ya atendía (§1.4, T = C; si no, quedaban como «coach de afuera» y gym_quitar_staff no los veía:
-- la trampa C20). Bloquea las fichas sin tocar los perfiles (el orden de siempre: nadie bloquea una
-- ficha y después un perfil).
create or replace function public.gym_staff_profe()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare g uuid; us uuid[];
begin
  if tg_op = 'DELETE' then g := old.gym_id; us := array[old.user_id];
  elsif tg_op = 'UPDATE' then g := new.gym_id; us := array[new.user_id, old.user_id];
    if old.gym_id is distinct from new.gym_id then
      update public.gym_members m set trainer_id = m.trainer_id
       where m.gym_id = old.gym_id and m.status in ('activo', 'pausado') and m.trainer_id = old.user_id;
    end if;
  else g := new.gym_id; us := array[new.user_id];
  end if;
  update public.gym_members m set trainer_id = m.trainer_id
   where m.gym_id = g and m.status in ('activo', 'pausado') and m.member_id is not null
     and (m.trainer_id = any(us) or exists (select 1 from public.profiles p where p.id = m.member_id and p.coach_id = any(us)))
     and m.trainer_id is distinct from public.gym_profe_ficha(m.gym_id, m.member_id, m.status);
  return null;
end $$;
revoke all on function public.gym_staff_profe() from public, anon, authenticated;
drop trigger if exists gym_staff_profe on public.gym_staff;
create trigger gym_staff_profe after insert or update of role, left_at, user_id, gym_id or delete on public.gym_staff
  for each row execute function public.gym_staff_profe();


-- ===== Socio: pedir sumarse =====

-- ¿De quién es este código? {tipo: 'gym'|'coach'|null, gym: {name, city}}. Usa el tope de intentos de
-- join_coach (join_code_attempts): un código que no existe cuenta como intento.
create or replace function public.gym_codigo_info(code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid(); c text := upper(btrim(coalesce(code, ''))); x record;
begin
  if me is null then raise exception 'Tenés que ingresar con tu cuenta.' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext('join_coach'), hashtext(me::text));
  delete from public.join_code_attempts where user_id = me and created_at < now() - interval '1 day';
  if (select count(*) from public.join_code_attempts where user_id = me) >= 20
     or (select count(*) from public.join_code_attempts where user_id = me and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Probaste muchos códigos que no existen. Revisalo con tu coach y volvé a intentar en un rato.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.profiles where invite_code = c and role = 'coach') then
    return jsonb_build_object('tipo', 'coach', 'gym', null);
  end if;
  select y.name, y.city into x from public.gym_codes k join public.gyms y on y.id = k.gym_id
   where k.code = c and k.kind = 'gym' and k.revoked_at is null and y.closed_at is null;
  if x.name is not null then
    return jsonb_build_object('tipo', 'gym', 'gym', jsonb_build_object('name', x.name, 'city', x.city));
  end if;
  insert into public.join_code_attempts (user_id) values (me);
  return jsonb_build_object('tipo', null, 'gym', null);
end $$;
revoke all on function public.gym_codigo_info(text) from public, anon;
grant execute on function public.gym_codigo_info(text) to authenticated;

-- Quien llama, ¿puede ser socio? Corta con el texto de §1.3 si no.
create or replace function public.gym_socio_puede(me uuid, g uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare f record;
begin
  if me is null then raise exception 'Tenés que ingresar con tu cuenta.' using errcode = '42501'; end if;
  if exists (select 1 from public.gym_staff where user_id = me and left_at is null) then
    raise exception 'Las cuentas del equipo de un gimnasio no se pueden vincular con un código.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.profiles where id = me and role = 'coach') then
    raise exception 'Una cuenta de coach no se puede sumar como socio de un gimnasio.' using errcode = 'P0001';
  end if;
  select m.gym_id, m.status, x.name into f from public.gym_members m join public.gyms x on x.id = m.gym_id
   where m.member_id = me and m.status <> 'baja';
  if f.gym_id is not null and f.gym_id is distinct from g then
    if f.status = 'pendiente' then
      raise exception 'Ya pediste sumarte a %: primero cancelá el pedido desde Ajustes.', f.name using errcode = 'P0001';
    end if;
    raise exception 'Ya sos socio de %: primero salí desde Ajustes.', f.name using errcode = 'P0001';
  end if;
  if f.gym_id = g and f.status <> 'pendiente' then
    raise exception 'Ya sos socio de %.', f.name using errcode = 'P0001';
  end if;
end $$;
revoke all on function public.gym_socio_puede(uuid, uuid) from public, anon, authenticated;

-- Pedir sumarse con el código del gimnasio y la hoja aceptada (apps nuevas). La casilla opcional
-- «compartir» llega sin marcar; si viene marcada, con su versión. {estado: 'pendiente' | 'activo'
-- (aprobó solo) | 'unida' (su mail verificado coincidía con una ficha) | 'no_existe', gym}.
create or replace function public.gym_unirse(code text, hoja_version text, share_admin boolean, compartir_version text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid(); c text := upper(btrim(coalesce(code, ''))); x record; r jsonb; pid uuid;
begin
  perform public.gym_version_ok('hoja', hoja_version);
  if coalesce(share_admin, false) then perform public.gym_version_ok('compartir', compartir_version); end if;
  if me is null then raise exception 'Tenés que ingresar con tu cuenta.' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext('join_coach'), hashtext(me::text));
  delete from public.join_code_attempts where user_id = me and created_at < now() - interval '1 day';
  if (select count(*) from public.join_code_attempts where user_id = me) >= 20
     or (select count(*) from public.join_code_attempts where user_id = me and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Probaste muchos códigos que no existen. Revisalo con tu coach y volvé a intentar en un rato.' using errcode = 'P0001';
  end if;
  select y.id, y.name, y.city into x from public.gym_codes k join public.gyms y on y.id = k.gym_id
   where k.code = c and k.kind = 'gym' and k.revoked_at is null and y.closed_at is null;
  if x.id is null then
    insert into public.join_code_attempts (user_id) values (me);
    return jsonb_build_object('estado', 'no_existe', 'gym', null);
  end if;
  perform public.gym_socio_puede(me, x.id);
  perform 1 from public.profiles where id = me for update;
  -- Ya había pedido (por ejemplo, con la app vieja): ahora acepta la hoja.
  select m.id into pid from public.gym_members m where m.member_id = me and m.gym_id = x.id and m.status = 'pendiente' for update;
  if pid is not null then
    update public.gym_members set terms_at = now(), terms_version = hoja_version, share_admin = coalesce(gym_unirse.share_admin, false),
           share_admin_at = case when coalesce(gym_unirse.share_admin, false) then now() end,
           share_admin_version = case when coalesce(gym_unirse.share_admin, false) then compartir_version end
     where id = pid;
    perform public.gym_auditar(x.id, 'confirmar_hoja', pid, me, jsonb_build_object('compartir', coalesce(gym_unirse.share_admin, false)));
    return jsonb_build_object('estado', 'pendiente', 'gym', jsonb_build_object('name', x.name, 'city', x.city));
  end if;
  r := public.gym_pedir(me, x.id, 'codigo', hoja_version, coalesce(share_admin, false), compartir_version);
  return jsonb_build_object('estado', r->>'estado', 'gym', jsonb_build_object('name', x.name, 'city', x.city));
end $$;
revoke all on function public.gym_unirse(text, text, boolean, text) from public, anon;
grant execute on function public.gym_unirse(text, text, boolean, text) to authenticated;

create or replace function public.gym_cancelar_solicitud()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid(); f record;
begin
  select m.id, m.gym_id into f from public.gym_members m where m.member_id = me and m.status = 'pendiente' for update;
  if f.id is null then raise exception 'No tenés ningún pedido pendiente.' using errcode = 'P0001'; end if;
  delete from public.gym_members where id = f.id;
  perform public.gym_auditar(f.gym_id, 'solicitud_cancelada', f.id, me, null);
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.gym_cancelar_solicitud() from public, anon;
grant execute on function public.gym_cancelar_solicitud() to authenticated;

-- El link #unirme=<token> de una ficha cargada por el gimnasio. Antes del DNI no muestra nada de la
-- ficha: solo el gimnasio y si pide los últimos 3 dígitos del DNI.
create or replace function public.gym_unirse_token_info(token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare f record;
begin
  select m.dni, m.invite_expires_at, m.member_id, m.status, y.name, y.city into f
    from public.gym_members m join public.gyms y on y.id = m.gym_id and y.closed_at is null
   where m.invite_token_hash = public.gym_hash(token);
  if f.name is null or f.invite_expires_at < now() or f.member_id is not null or f.status not in ('activo', 'pausado') then
    return jsonb_build_object('estado', 'vencido', 'gym', null, 'pide_dni', false);
  end if;
  return jsonb_build_object('estado', 'ok', 'gym', jsonb_build_object('name', f.name, 'city', f.city), 'pide_dni', f.dni is not null);
end $$;
revoke all on function public.gym_unirse_token_info(text) from public, anon;
grant execute on function public.gym_unirse_token_info(text) to authenticated;

-- Usar el link: con DNI, los últimos 3 dígitos (5 intentos por link; al quinto el link muere) y la
-- ficha queda con esta cuenta y la hoja aceptada. Sin DNI, queda un pedido que apunta a esa ficha
-- (unir_sugerida) para que el gimnasio confirme. El link sirve una sola vez.
-- {estado: 'activo'|'pendiente'|'dni_mal'|'bloqueado'|'vencido', gym, quedan}. Los errores de DNI
-- no salen con raise (desharía el intento).
create or replace function public.gym_unirse_token(token text, dni3 text, hoja_version text, share_admin boolean, compartir_version text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid(); f record; pid uuid; n int; gj jsonb; sh boolean := coalesce(share_admin, false); ped_path text; ped_at timestamptz;
begin
  perform public.gym_version_ok('hoja', hoja_version);
  if sh then perform public.gym_version_ok('compartir', compartir_version); end if;
  if me is null then raise exception 'Tenés que ingresar con tu cuenta.' using errcode = '42501'; end if;
  perform 1 from public.profiles where id = me for update;
  select m.* into f from public.gym_members m join public.gyms y on y.id = m.gym_id and y.closed_at is null
   where m.invite_token_hash = public.gym_hash(token) for update of m;
  if f.id is null or f.invite_expires_at < now() or f.member_id is not null or f.status not in ('activo', 'pausado') then
    return jsonb_build_object('estado', 'vencido', 'gym', null);
  end if;
  perform public.gym_socio_puede(me, f.gym_id);
  gj := (select jsonb_build_object('name', y.name, 'city', y.city) from public.gyms y where y.id = f.gym_id);
  select m.id into pid from public.gym_members m where m.member_id = me and m.gym_id = f.gym_id and m.status = 'pendiente' for update;
  if f.dni is not null then
    if right(regexp_replace(f.dni, '\D', '', 'g'), 3) is distinct from regexp_replace(coalesce(dni3, ''), '\D', '', 'g') then
      n := f.dni_intentos + 1;
      update public.gym_members set dni_intentos = least(n, 5),
             invite_token_hash = case when n >= 5 then null else invite_token_hash end,
             invite_expires_at = case when n >= 5 then null else invite_expires_at end
       where id = f.id;
      perform public.gym_auditar(f.gym_id, 'unirse_dni_mal', f.id, me, jsonb_build_object('intento', n));
      return jsonb_build_object('estado', case when n >= 5 then 'bloqueado' else 'dni_mal' end, 'gym', gj, 'quedan', greatest(5 - n, 0));
    end if;
    -- El pedido que tenía se reemplaza por la ficha; la foto que había propuesto pasa a la ficha (si
    -- no tenía otra propuesta), y se ve igual (gym_foto_ver).
    if pid is not null then
      select m.foto_pend_path, m.foto_pend_at into ped_path, ped_at from public.gym_members m where m.id = pid;
      delete from public.gym_members where id = pid;
    end if;
    update public.gym_members
       set member_id = me, terms_at = now(), terms_version = hoja_version, share_admin = sh,
           share_admin_at = case when sh then now() end, share_admin_version = case when sh then compartir_version end,
           invite_token_hash = null, invite_expires_at = null, dni_intentos = 0, requested_at = coalesce(requested_at, now()),
           foto_pend_path = coalesce(foto_pend_path, ped_path),
           foto_pend_at = case when foto_pend_path is null and ped_path is not null then ped_at else foto_pend_at end
     where id = f.id;
    perform public.gym_auditar(f.gym_id, 'unirse_link', f.id, me, jsonb_build_object('compartir', sh));
    perform public.gym_alerta_staff(f.gym_id, 'socio_se_unio', f.id::text, jsonb_build_object('ficha', f.id));
    return jsonb_build_object('estado', 'activo', 'gym', gj, 'ficha', f.id);
  end if;
  -- Sin DNI: un pedido unido a esa ficha, que confirma el gimnasio.
  if pid is not null then
    update public.gym_members set unir_sugerida = f.id, terms_at = now(), terms_version = hoja_version, share_admin = sh,
           share_admin_at = case when sh then now() end, share_admin_version = case when sh then compartir_version end
     where id = pid;
  else
    insert into public.gym_members (gym_id, member_id, full_name, email, status, source, requested_at, created_by, unir_sugerida,
                                    terms_at, terms_version, share_admin, share_admin_at, share_admin_version)
    select f.gym_id, me, left(coalesce(p.full_name, ''), 120), u.email, 'pendiente', 'ficha', now(), me, f.id,
           now(), hoja_version, sh, case when sh then now() end, case when sh then compartir_version end
      from public.profiles p left join auth.users u on u.id = p.id where p.id = me
    returning id into pid;
  end if;
  update public.gym_members set invite_token_hash = null, invite_expires_at = null where id = f.id;
  perform public.gym_auditar(f.gym_id, 'unirse_link_sin_dni', pid, me, jsonb_build_object('ficha', f.id));
  perform public.gym_alerta_staff(f.gym_id, 'solicitud', pid::text, jsonb_build_object('ficha', pid, 'unir_a', f.id));
  return jsonb_build_object('estado', 'pendiente', 'gym', gj);
end $$;
revoke all on function public.gym_unirse_token(text, text, text, boolean, text) from public, anon;
grant execute on function public.gym_unirse_token(text, text, text, boolean, text) to authenticated;

-- Aceptar la hoja (socios convertidos o que pidieron con la app vieja: «Falta confirmación»).
create or replace function public.gym_confirmar_hoja(hoja_version text, share_admin boolean, compartir_version text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid(); f record; sh boolean := coalesce(share_admin, false);
begin
  perform public.gym_version_ok('hoja', hoja_version);
  if sh then perform public.gym_version_ok('compartir', compartir_version); end if;
  select m.id, m.gym_id, m.share_admin into f from public.gym_members m where m.member_id = me and m.status <> 'baja' for update;
  if f.id is null then raise exception 'No sos socio de ningún gimnasio.' using errcode = 'P0001'; end if;
  update public.gym_members set terms_at = now(), terms_version = hoja_version, share_admin = sh,
         share_admin_at = case when sh is distinct from f.share_admin or sh then now() else share_admin_at end,
         share_admin_version = case when sh then compartir_version else share_admin_version end
   where id = f.id;
  perform public.gym_auditar(f.gym_id, 'confirmar_hoja', f.id, me, jsonb_build_object('compartir', sh));
  return jsonb_build_object('ok', true, 'share_admin', sh);
end $$;
revoke all on function public.gym_confirmar_hoja(text, boolean, text) from public, anon;
grant execute on function public.gym_confirmar_hoja(text, boolean, text) to authenticated;

-- Prender o apagar «Compartir mis registros con la administración». Vale desde la consulta siguiente.
create or replace function public.gym_compartir_admin(encendido boolean, compartir_version text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid(); f record; sh boolean := coalesce(encendido, false);
begin
  if sh then perform public.gym_version_ok('compartir', compartir_version); end if;
  select m.id, m.gym_id, m.terms_at into f from public.gym_members m where m.member_id = me and m.status <> 'baja' for update;
  if f.id is null then raise exception 'No sos socio de ningún gimnasio.' using errcode = 'P0001'; end if;
  if sh and f.terms_at is null then raise exception 'Primero confirmá la hoja del gimnasio.' using errcode = 'P0001'; end if;
  update public.gym_members set share_admin = sh, share_admin_at = now(),
         share_admin_version = case when sh then compartir_version else share_admin_version end
   where id = f.id;
  perform public.gym_auditar(f.gym_id, 'compartir', f.id, me, jsonb_build_object('compartir', sh));
  return jsonb_build_object('share_admin', sh);
end $$;
revoke all on function public.gym_compartir_admin(boolean, text) from public, anon;
grant execute on function public.gym_compartir_admin(boolean, text) to authenticated;

-- Salir del gimnasio: la ficha pasa a baja y el gimnasio deja de ver sus datos al instante. Si lo
-- atendía alguien del equipo, queda sin coach, salvo «Seguir con mi profe como alumno propio» (solo
-- si el profe tiene plan propio vigente con lugar; con la dueña, el plan del gimnasio). Un coach de
-- afuera no cambia. Un pedido pendiente se cancela. A una cuenta convertida (alumno de antes del coach
-- que pasó a gimnasio) salir no le quita su coach (§1.5, M2): sin seguir_con_profe (null), sigue con él;
-- solo deja el coaching si lo pide (false).
create or replace function public.gym_salir(seguir_con_profe boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid(); f record; c uuid; dueno uuid; del_equipo boolean; sigue boolean := false; b record;
begin
  if me is null then raise exception 'Tenés que ingresar con tu cuenta.' using errcode = '42501'; end if;
  perform 1 from public.profiles where id = me for update;
  select m.* into f from public.gym_members m where m.member_id = me and m.status <> 'baja' for update;
  if f.id is null then raise exception 'No sos socio de ningún gimnasio.' using errcode = 'P0001'; end if;
  if f.status = 'pendiente' then
    delete from public.gym_members where id = f.id;
    perform public.gym_auditar(f.gym_id, 'solicitud_cancelada', f.id, me, null);
    return jsonb_build_object('ok', true, 'sigue_con_profe', false);
  end if;
  select p.coach_id into c from public.profiles p where p.id = me;
  select x.owner_id into dueno from public.gyms x where x.id = f.gym_id;
  del_equipo := c is not null and exists (select 1 from public.gym_staff s where s.gym_id = f.gym_id and s.user_id = c
                                                and s.left_at is null and s.role in ('owner', 'admin', 'profe'));
  update public.gym_members set status = 'baja', left_at = now(), baja_motivo = 'socio' where id = f.id;
  if del_equipo and coalesce(seguir_con_profe, f.source = 'conversion') then
    perform 1 from public.coach_billing where coach_id in (c, dueno) order by coach_id for update;
    if c = dueno then
      sigue := public.gym_active(f.gym_id);
    else
      select bb.* into b from public.coach_billing bb where bb.coach_id = c;
      sigue := b.coach_id is not null
           and (b.plan = 'cortesia' or b.trial_ends_at > now() or coalesce(b.paid_until, '-infinity') > now())
           and public.recount_seats(c) <= coalesce(b.max_clients, 10);
    end if;
    if not sigue then
      raise exception 'Tu profe no puede sumarte como alumno propio en este momento. Podés salir sin seguir con tu profe.' using errcode = 'P0001';
    end if;
  elsif del_equipo then
    update public.profiles set coach_id = null where id = me;
  end if;
  perform public.gym_auditar(f.gym_id, 'salir', f.id, me, jsonb_build_object('sigue_con_profe', sigue));
  perform public.gym_alerta_staff(f.gym_id, 'socio_salio', f.id::text, jsonb_build_object('ficha', f.id));
  return jsonb_build_object('ok', true, 'sigue_con_profe', sigue);
end $$;
revoke all on function public.gym_salir(boolean) from public, anon;
grant execute on function public.gym_salir(boolean) to authenticated;

-- El socio propone su foto del gimnasio (la sube antes a gym-fotos/{gimnasio}/{ficha}/). Queda
-- «esperando que el gimnasio la apruebe»: la foto aprobada no cambia hasta que la aprueben.
create or replace function public.gym_foto_proponer(path text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid(); f record;
begin
  select m.id, m.gym_id, m.foto_pend_path into f from public.gym_members m where m.member_id = me and m.status <> 'baja' for update;
  if f.id is null then raise exception 'No sos socio de ningún gimnasio.' using errcode = 'P0001'; end if;
  if not public.gym_foto_valida(f.gym_id, f.id, path) then raise exception 'No encontramos la foto: probá de nuevo.' using errcode = 'P0001'; end if;
  update public.gym_members set foto_pend_path = path, foto_pend_at = now(), foto_rechazo = null where id = f.id;
  perform public.gym_auditar(f.gym_id, 'foto_propuesta', f.id, me, jsonb_build_object('reemplaza', f.foto_pend_path));
  perform public.gym_alerta_staff(f.gym_id, 'foto_para_aprobar', f.id || ':' || public.gym_hoy(), jsonb_build_object('ficha', f.id));
  return jsonb_build_object('foto', 'pendiente');
end $$;
revoke all on function public.gym_foto_proponer(text) from public, anon;
grant execute on function public.gym_foto_proponer(text) to authenticated;


-- ===== Staff: solicitudes y fichas =====

-- Las solicitudes pendientes, con las coincidencias con fichas sin app (el link, el mail o el nombre).
create or replace function public.gym_solicitudes()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare g uuid := public.gym_exigir_altas();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'member_id', m.member_id,
      'nombre', coalesce(nullif(m.full_name, ''), p.full_name), 'email', m.email, 'requested_at', m.requested_at, 'via', m.source,
      'terms', m.terms_at is not null, 'share_admin', m.share_admin, 'foto_pend_path', m.foto_pend_path, 'unir_sugerida', m.unir_sugerida,
      'coincidencias', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'nombre', o.full_name, 'dni_fin', right(o.dni, 3),
                                   'motivo', case when o.id = m.unir_sugerida then 'link'
                                                  when lower(o.email) = lower(m.email) then 'mail' else 'nombre' end))
                                   from (select * from public.gym_members o
                                          where o.gym_id = g and o.member_id is null and o.status in ('activo', 'pausado')
                                            and (o.id = m.unir_sugerida or lower(o.email) = lower(m.email)
                                                 or public.gym_norm(o.full_name) = public.gym_norm(coalesce(nullif(m.full_name, ''), p.full_name)))
                                          limit 5) o), '[]'::jsonb))
      order by m.requested_at)
    from public.gym_members m left join public.profiles p on p.id = m.member_id
   where m.gym_id = g and m.status = 'pendiente'), '[]'::jsonb);
end $$;
revoke all on function public.gym_solicitudes() from public, anon;
grant execute on function public.gym_solicitudes() to authenticated;

-- Aprobar una solicitud como socio nuevo (con profe, o null = sin profe; cupo exacto) o como «es la
-- ficha de…» (unir_a_ficha: la ficha sin app pasa a ser de esa cuenta; no ocupa otro lugar; la
-- recepción, solo la del link o la del mail verificado). Con foto_ok, la foto que propuso queda aprobada:
-- foto es la ruta que vio el equipo; si el socio mandó otra mientras tanto, no se aprueba ninguna.
create or replace function public.gym_aprobar(ficha uuid, profe uuid, unir_a_ficha uuid, foto_ok boolean, foto text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare g uuid := public.gym_exigir_altas(); f record; t record; socio uuid; c uuid; motivo text; res uuid; hoy text := public.gym_hoy()::text;
begin
  select m.member_id into socio from public.gym_members m where m.id = ficha and m.gym_id = g;
  if socio is not null then perform 1 from public.profiles where id = socio for update; end if;
  select m.* into f from public.gym_members m where m.id = ficha and m.gym_id = g for update;
  if f.id is null or f.status <> 'pendiente' then raise exception 'Esa solicitud ya no está pendiente.' using errcode = 'P0001'; end if;
  if coalesce(foto_ok, false) and f.foto_pend_path is distinct from foto then
    raise exception 'La foto cambió: mirala de nuevo.' using errcode = 'P0001';
  end if;
  if unir_a_ficha is null then
    perform public.gym_aprobar_interno(ficha, profe);
    res := ficha;
    if coalesce(foto_ok, false) and f.foto_pend_path is not null then
      update public.gym_members set foto_path = f.foto_pend_path, foto_ok_at = now(), foto_ok_by = auth.uid(), foto_pend_path = null,
             foto_pend_at = null, foto_rechazo = null where id = ficha;
    end if;
  else
    select m.* into t from public.gym_members m where m.id = unir_a_ficha and m.gym_id = g for update;
    if t.id is null or t.member_id is not null or t.status not in ('activo', 'pausado') then
      raise exception 'Esa ficha ya tiene cuenta o no está activa.' using errcode = 'P0001';
    end if;
    -- La recepción solo une a la ficha del link (unir_sugerida) o a la del mail verificado de la
    -- cuenta: unir por el nombre o a mano (y ver así el DNI, el mail y los ingresos de esa ficha) queda
    -- para el dueño y la administración.
    if (select x.rol from public.gym_mi_staff() x) = 'recepcion' and unir_a_ficha is distinct from f.unir_sugerida
       and not exists (select 1 from auth.users u where u.id = f.member_id and u.email_confirmed_at is not null
                          and coalesce(u.email, '') <> '' and lower(u.email) = lower(t.email)) then
      raise exception 'Esa ficha no coincide por el link ni por el mail: que la una la administración.' using errcode = '42501';
    end if;
    select p.coach_id into c from public.profiles p where p.id = f.member_id;
    if c is null and profe is not null then
      motivo := public.gym_profe_no_puede(g, profe, f.member_id);
      if motivo is not null then raise exception 'Ese profe no se le puede asignar.' using errcode = 'P0001'; end if;
      if not public.gym_active(g) then raise exception 'Por ahora el gimnasio no puede asignar profe.' using errcode = 'P0001'; end if;
    end if;
    delete from public.gym_members where id = ficha;
    update public.gym_members set member_id = f.member_id, terms_at = f.terms_at, terms_version = f.terms_version,
           share_admin = f.share_admin, share_admin_at = f.share_admin_at, share_admin_version = f.share_admin_version,
           requested_at = f.requested_at, approved_by = auth.uid(), invite_token_hash = null, invite_expires_at = null,
           foto_path = case when coalesce(foto_ok, false) and f.foto_pend_path is not null then f.foto_pend_path else foto_path end,
           foto_ok_at = case when coalesce(foto_ok, false) and f.foto_pend_path is not null then now() else foto_ok_at end,
           foto_ok_by = case when coalesce(foto_ok, false) and f.foto_pend_path is not null then auth.uid() else foto_ok_by end,
           foto_pend_path = case when coalesce(foto_ok, false) then null else f.foto_pend_path end,
           foto_pend_at = case when coalesce(foto_ok, false) then null else f.foto_pend_at end
     where id = unir_a_ficha;
    if c is null and profe is not null then
      perform 1 from public.coach_billing where coach_id in (profe, (select owner_id from public.gyms where id = g)) order by coach_id for update;
      update public.profiles set coach_id = profe where id = f.member_id;
    end if;
    res := unir_a_ficha;
  end if;
  perform public.gym_auditar(g, 'aprobar', res, f.member_id, jsonb_build_object('profe', profe, 'unida_a', unir_a_ficha, 'foto_ok', coalesce(foto_ok, false)));
  perform public.gym_alerta(g, 'u:' || f.member_id, 'solicitud_aprobada', res::text, 'push', jsonb_build_object('ficha', res));
  if profe is not null and (select p.coach_id from public.profiles p where p.id = f.member_id) = profe then
    perform public.gym_alerta(g, 'u:' || profe, 'socios_asignados', 'aprobar:' || res, 'push', jsonb_build_object('n', 1));
  end if;
  return jsonb_build_object('ok', true, 'id', res);
end $$;
revoke all on function public.gym_aprobar(uuid, uuid, uuid, boolean, text) from public, anon;
grant execute on function public.gym_aprobar(uuid, uuid, uuid, boolean, text) to authenticated;

-- Rechazar una solicitud: se borra (era un pedido, sin datos del gimnasio); queda en la auditoría.
create or replace function public.gym_rechazar(ficha uuid, motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare g uuid := public.gym_exigir_altas(); f record;
begin
  select m.id, m.member_id into f from public.gym_members m where m.id = ficha and m.gym_id = g and m.status = 'pendiente' for update;
  if f.id is null then raise exception 'Esa solicitud ya no está pendiente.' using errcode = 'P0001'; end if;
  delete from public.gym_members where id = f.id;
  perform public.gym_auditar(g, 'rechazar', f.id, f.member_id, jsonb_build_object('motivo', left(motivo, 200)));
  if f.member_id is not null then
    perform public.gym_alerta(g, 'u:' || f.member_id, 'solicitud_rechazada', f.id::text, 'push', null);
  end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.gym_rechazar(uuid, text) from public, anon;
grant execute on function public.gym_rechazar(uuid, text) to authenticated;

-- Los datos de una ficha que carga o edita el gimnasio, validados. Devuelve las columnas.
create or replace function public.gym_ficha_datos(datos jsonb, parcial boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare k text; r jsonb := '{}'; dni text; v text;
begin
  if datos is null or jsonb_typeof(datos) <> 'object' then raise exception 'Datos inválidos.' using errcode = 'P0001'; end if;
  for k in select jsonb_object_keys(datos) loop
    if k not in ('nombre', 'dni', 'telefono', 'email', 'nacimiento', 'apto_medico_vence', 'alta') or (parcial and k = 'alta') then
      raise exception 'No se puede cambiar «%».', k using errcode = 'P0001';
    end if;
  end loop;
  if not parcial or datos ? 'nombre' then
    v := btrim(coalesce(datos->>'nombre', ''));
    if char_length(v) not between 2 and 120 then raise exception 'Escribí el nombre y el apellido.' using errcode = 'P0001'; end if;
    r := r || jsonb_build_object('full_name', v);
  end if;
  if datos ? 'dni' then
    dni := nullif(regexp_replace(coalesce(datos->>'dni', ''), '\D', '', 'g'), '');
    if dni is not null and char_length(dni) not between 6 and 9 then raise exception 'Revisá el DNI.' using errcode = 'P0001'; end if;
    r := r || jsonb_build_object('dni', dni);
  end if;
  if datos ? 'telefono' then
    v := nullif(btrim(coalesce(datos->>'telefono', '')), '');
    if v is not null and v !~ '^\+?[0-9 ()-]{6,24}$' then raise exception 'Revisá el teléfono.' using errcode = 'P0001'; end if;
    r := r || jsonb_build_object('phone', v);
  end if;
  if datos ? 'email' then
    v := nullif(lower(btrim(coalesce(datos->>'email', ''))), '');
    if v is not null and v !~ '^[^@\s]{1,64}@[^@\s]{1,120}\.[^@\s]{2,20}$' then raise exception 'Revisá el mail.' using errcode = 'P0001'; end if;
    r := r || jsonb_build_object('email', v);
  end if;
  begin
    if datos ? 'nacimiento' then r := r || jsonb_build_object('birthdate', (nullif(datos->>'nacimiento', ''))::date); end if;
    if datos ? 'apto_medico_vence' then r := r || jsonb_build_object('apto_medico_vence', (nullif(datos->>'apto_medico_vence', ''))::date); end if;
    if datos ? 'alta' then r := r || jsonb_build_object('alta', (nullif(datos->>'alta', ''))::date); end if;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception 'Revisá las fechas.' using errcode = 'P0001';
  end;
  if (r->>'birthdate')::date > public.gym_hoy() or (r->>'alta')::date > public.gym_hoy() then
    raise exception 'Revisá las fechas.' using errcode = 'P0001';
  end if;
  return r;
end $$;
revoke all on function public.gym_ficha_datos(jsonb, boolean) from public, anon, authenticated;

-- Cargar una ficha sin app (activa: ocupa lugar, con cupo exacto). Devuelve el link #unirme para
-- mandarle (vale 7 días y una sola vez).
create or replace function public.gym_ficha_crear(datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare g uuid := public.gym_exigir_altas(); d jsonb := public.gym_ficha_datos(datos, false); tok text := public.gym_token(); fid uuid;
        vence timestamptz := now() + interval '7 days';
begin
  if not public.gym_cupo_ok(g, '{}') then
    raise exception 'El gimnasio no puede sumar socios en este momento.' using errcode = 'P0001';
  end if;
  begin
    insert into public.gym_members (gym_id, full_name, dni, phone, email, birthdate, apto_medico_vence, status, source,
                                    joined_at, created_by, invite_token_hash, invite_expires_at)
    values (g, d->>'full_name', d->>'dni', d->>'phone', d->>'email', (d->>'birthdate')::date, (d->>'apto_medico_vence')::date,
            'activo', 'ficha', coalesce((d->>'alta')::date::timestamptz, now()), auth.uid(), public.gym_hash(tok), vence)
    returning id into fid;
  exception when unique_violation then
    raise exception 'Ya hay una ficha con ese DNI en el gimnasio.' using errcode = 'P0001';
  end;
  perform public.gym_auditar(g, 'ficha_alta', fid, null, jsonb_build_object('dni', d->>'dni' is not null));
  return jsonb_build_object('id', fid, 'token', tok, 'expires_at', vence);
end $$;
revoke all on function public.gym_ficha_crear(jsonb) from public, anon;
grant execute on function public.gym_ficha_crear(jsonb) to authenticated;

create or replace function public.gym_ficha_editar(id uuid, patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare g uuid := public.gym_exigir(array['owner', 'admin']); d jsonb := public.gym_ficha_datos(patch, true); f record;
begin
  select m.* into f from public.gym_members m where m.id = gym_ficha_editar.id and m.gym_id = g for update;
  if f.id is null then raise exception 'No encontramos esa ficha.' using errcode = 'P0001'; end if;
  begin
    update public.gym_members set
      full_name = case when d ? 'full_name' then d->>'full_name' else full_name end,
      dni = case when d ? 'dni' then d->>'dni' else dni end,
      phone = case when d ? 'phone' then d->>'phone' else phone end,
      email = case when d ? 'email' then d->>'email' else email end,
      birthdate = case when d ? 'birthdate' then (d->>'birthdate')::date else birthdate end,
      apto_medico_vence = case when d ? 'apto_medico_vence' then (d->>'apto_medico_vence')::date else apto_medico_vence end
     where gym_members.id = f.id;
  exception when unique_violation then
    raise exception 'Ya hay una ficha con ese DNI en el gimnasio.' using errcode = 'P0001';
  end;
  -- Sin los valores (pueden ser datos de salud, como el apto médico): qué campos cambiaron.
  perform public.gym_auditar(g, 'ficha_editar', f.id, f.member_id, jsonb_build_object('campos', (select jsonb_agg(k) from jsonb_object_keys(d) k)));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.gym_ficha_editar(uuid, jsonb) from public, anon;
grant execute on function public.gym_ficha_editar(uuid, jsonb) to authenticated;

-- Un link #unirme nuevo para una ficha sin app (el anterior deja de servir; vuelve a 5 intentos).
create or replace function public.gym_ficha_link(id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare g uuid := public.gym_exigir_altas(); tok text := public.gym_token(); vence timestamptz := now() + interval '7 days'; fid uuid;
begin
  update public.gym_members set invite_token_hash = public.gym_hash(tok), invite_expires_at = vence, dni_intentos = 0
   where gym_members.id = gym_ficha_link.id and gym_id = g and member_id is null and status in ('activo', 'pausado')
  returning gym_members.id into fid;
  if fid is null then raise exception 'Esa ficha ya tiene cuenta o no está activa.' using errcode = 'P0001'; end if;
  perform public.gym_auditar(g, 'link_unirme', fid, null, null);
  return jsonb_build_object('token', tok, 'expires_at', vence);
end $$;
revoke all on function public.gym_ficha_link(uuid) from public, anon;
grant execute on function public.gym_ficha_link(uuid) to authenticated;

-- La nota interna de una ficha (dueño, administración o el profe asignado). Vacía = se borra.
create or replace function public.gym_nota_guardar(id uuid, body text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare s record; f record; b text := btrim(coalesce(body, ''));
begin
  select * into s from public.gym_mi_staff();
  select m.id, m.gym_id, m.trainer_id, m.status into f from public.gym_members m where m.id = gym_nota_guardar.id;
  if s.g is null or f.id is null or f.gym_id <> s.g
     or not (s.rol in ('owner', 'admin') or (f.trainer_id = auth.uid() and f.status in ('activo', 'pausado') and s.rol = 'profe')) then
    raise exception 'No tenés permiso para hacer esto en el gimnasio.' using errcode = '42501';
  end if;
  if char_length(b) > 2000 then raise exception 'La nota es muy larga (hasta 2000 letras).' using errcode = 'P0001'; end if;
  if b = '' then
    delete from public.gym_member_notes where gym_member_id = f.id;
  else
    insert into public.gym_member_notes (gym_member_id, body, updated_by, updated_at) values (f.id, b, auth.uid(), now())
    on conflict (gym_member_id) do update set body = excluded.body, updated_by = excluded.updated_by, updated_at = now();
  end if;
  perform public.gym_auditar(s.g, 'nota', f.id, null, jsonb_build_object('borrada', b = ''));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.gym_nota_guardar(uuid, text) from public, anon;
grant execute on function public.gym_nota_guardar(uuid, text) to authenticated;

-- Asignar o cambiar el profe de varias fichas (profe null = sin profe). Se saltean (y dice por qué)
-- las que no aceptaron la hoja, las que tienen un coach de afuera, las de un profe bloqueado, sin app
-- o que no están activas. Masiva: con profe, las rutinas programadas pendientes pasan al profe nuevo
-- (gize.gym_keep_routines); sin profe, se borran como hoy. Un aviso a cada socio y uno al profe.
create or replace function public.gym_asignar_profe(fichas uuid[], profe uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare g uuid := public.gym_exigir(array['owner', 'admin']); f record; mal text; ok jsonb := '[]'; salt jsonb := '[]';
        mover uuid[] := '{}'; viejos uuid[] := '{}'; dueno uuid; bulk text := current_setting('gize.gym_bulk', true);
        keep text := current_setting('gize.gym_keep_routines', true); u uuid; hoy text := public.gym_hoy()::text; op text := gen_random_uuid()::text;
begin
  if profe is not null and not public.gym_active(g) then
    raise exception 'Por ahora el gimnasio no puede asignar profe.' using errcode = 'P0001';
  end if;
  mal := public.gym_profe_no_puede(g, profe, null);
  select x.owner_id into dueno from public.gyms x where x.id = g;
  perform 1 from public.profiles where id in (select m.member_id from public.gym_members m where m.id = any(coalesce(fichas, '{}')) and m.gym_id = g)
   order by id for update;
  for f in select m.id, m.member_id, m.status, m.terms_at, p.coach_id
             from unnest(coalesce(fichas, '{}')) with ordinality x(fid, o)
             left join public.gym_members m on m.id = x.fid and m.gym_id = g
             left join public.profiles p on p.id = m.member_id
            order by x.o loop
    if f.id is null then continue; end if;
    if f.status not in ('activo', 'pausado') then salt := salt || jsonb_build_object('id', f.id, 'motivo', 'no_activa');
    elsif f.member_id is null then salt := salt || jsonb_build_object('id', f.id, 'motivo', 'sin_app');
    elsif f.terms_at is null then salt := salt || jsonb_build_object('id', f.id, 'motivo', 'falta_confirmacion');
    elsif f.coach_id is not null and not exists (select 1 from public.gym_staff s where s.gym_id = g and s.user_id = f.coach_id
                                                     and s.left_at is null and s.role in ('owner', 'admin', 'profe')) then
      salt := salt || jsonb_build_object('id', f.id, 'motivo', 'coach_externo');
    elsif mal is not null then salt := salt || jsonb_build_object('id', f.id, 'motivo', 'no_es_profe');
    elsif profe is not null and public.bloqueo_entre(f.member_id, profe) then salt := salt || jsonb_build_object('id', f.id, 'motivo', 'bloqueo');
    else
      ok := ok || to_jsonb(f.id);
      if f.coach_id is distinct from profe then
        mover := mover || f.member_id; viejos := viejos || f.coach_id;
        perform public.gym_auditar(g, 'asignar_profe', f.id, f.member_id, jsonb_build_object('de', f.coach_id, 'a', profe));
      end if;
    end if;
  end loop;
  if cardinality(mover) > 0 then
    perform set_config('gize.gym_bulk', 'on', true);
    if profe is not null then perform set_config('gize.gym_keep_routines', 'on', true); end if;
    update public.profiles set coach_id = profe where id = any(mover);
    if profe is not null then
      update public.routine_schedule set created_by = profe where client_id = any(mover) and applied_at is null;
    end if;
    perform set_config('gize.gym_keep_routines', coalesce(keep, ''), true);
    perform set_config('gize.gym_bulk', coalesce(bulk, ''), true);
    perform public.gym_recontar(viejos || profe || dueno);
    if profe is not null then
      foreach u in array mover loop
        perform public.gym_alerta(g, 'u:' || u, 'profe_asignado', u || ':' || profe || ':' || hoy, 'push', jsonb_build_object('profe', profe));
      end loop;
      perform public.gym_alerta(g, 'u:' || profe, 'socios_asignados', op, 'push', jsonb_build_object('n', cardinality(mover)));
    end if;
  end if;
  return jsonb_build_object('ok', ok, 'saltadas', salt);
end $$;
revoke all on function public.gym_asignar_profe(uuid[], uuid) from public, anon;
grant execute on function public.gym_asignar_profe(uuid[], uuid) to authenticated;

-- El profe deja de atender a un socio del gimnasio: queda sin profe (el dueño lo ve en el resumen).
create or replace function public.gym_dejar_socio(ficha uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid(); f record;
begin
  select m.id, m.gym_id, m.member_id into f from public.gym_members m
   where m.id = ficha and m.trainer_id = me and m.status in ('activo', 'pausado')
     and exists (select 1 from public.gym_staff s where s.gym_id = m.gym_id and s.user_id = me and s.left_at is null);
  if f.id is null then raise exception 'No sos el profe de este socio.' using errcode = 'P0001'; end if;
  perform 1 from public.profiles where id = f.member_id for update;
  update public.profiles set coach_id = null where id = f.member_id and coach_id = me;
  perform public.gym_auditar(f.gym_id, 'dejar_socio', f.id, f.member_id, null);
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.gym_dejar_socio(uuid) from public, anon;
grant execute on function public.gym_dejar_socio(uuid) to authenticated;

-- La tarjeta «Gimnasio» de la ficha del socio en el panel del profe (parte 4): el estado de la ficha,
-- el semáforo con su motivo (sin montos: en la etapa 2 sale de la cuota, con la misma forma), el apto
-- médico y los últimos 5 ingresos. Solo para quien lo atiende (trainer_id: el profe, o la dueña o la
-- administración como profe); otro del equipo recibe null. Con el acceso de los profes pausado (plan
-- vencido hace más de 5 días), P0001: el profe tampoco ve el resto de la ficha.
create or replace function public.gym_ficha_profe(socio uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare me uuid := auth.uid(); s record; m record;
begin
  select * into s from public.gym_mi_staff();
  if s.g is null or s.rol not in ('owner', 'admin', 'profe') then
    raise exception 'No tenés permiso para hacer esto en el gimnasio.' using errcode = '42501';
  end if;
  select x.id, x.status, x.paused_until, x.apto_medico_vence, x.joined_at into m from public.gym_members x
   where x.gym_id = s.g and x.member_id = socio and x.trainer_id = me and x.status in ('activo', 'pausado');
  if m.id is null then return null; end if;
  if not public.gym_active(s.g) then
    raise exception 'El acceso del gimnasio está pausado. Hablá con la administración.' using errcode = 'P0001';
  end if;
  return jsonb_build_object('ficha', m.id, 'estado', m.status, 'paused_until', m.paused_until, 'apto_medico_vence', m.apto_medico_vence,
           'alta', m.joined_at,
           'ingresos', coalesce((select jsonb_agg(jsonb_build_object('at', e.at, 'resultado', e.result) order by e.at desc)
                                   from (select y.at, y.result from public.gym_entries y where y.gym_member_id = m.id order by y.at desc limit 5) e), '[]'::jsonb))
         || public.gym_semaforo(m.id);
end $$;
revoke all on function public.gym_ficha_profe(uuid) from public, anon;
grant execute on function public.gym_ficha_profe(uuid) to authenticated;

-- Pausar una ficha activa hasta una fecha (sigue contando; vuelve sola, gym_diaria).
create or replace function public.gym_pausar(ficha uuid, hasta date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare g uuid := public.gym_exigir(array['owner', 'admin']); f record;
begin
  select m.id, m.status, m.member_id into f from public.gym_members m where m.id = ficha and m.gym_id = g for update;
  if f.id is null or f.status <> 'activo' then raise exception 'Solo se puede pausar una ficha activa.' using errcode = 'P0001'; end if;
  if hasta is null or hasta <= public.gym_hoy() or hasta > public.gym_hoy() + 366 then
    raise exception 'Elegí hasta cuándo (dentro del próximo año).' using errcode = 'P0001';
  end if;
  update public.gym_members set status = 'pausado', paused_until = hasta where id = f.id;
  perform public.gym_auditar(g, 'pausar', f.id, f.member_id, jsonb_build_object('hasta', hasta));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.gym_pausar(uuid, date) from public, anon;
grant execute on function public.gym_pausar(uuid, date) to authenticated;

-- Reactivar: una pausada vuelve a activa; una en baja, con cupo exacto (no la de un socio que salió
-- él mismo: para volver, pide sumarse). Una baja que tenía cuenta vuelve como ficha sin app, sin la
-- hoja y sin compartir: el gimnasio no vuelve a sumar a nadie (ni a leer sus registros) sin que esa
-- persona lo acepte. Para unirla otra vez, el link #unirme (con su DNI) o «es la ficha de…».
create or replace function public.gym_reactivar(ficha uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare g uuid := public.gym_exigir(array['owner', 'admin']); f record; socio uuid;
begin
  select m.member_id into socio from public.gym_members m where m.id = ficha and m.gym_id = g;
  if socio is not null then perform 1 from public.profiles where id = socio for update; end if;
  select m.* into f from public.gym_members m where m.id = ficha and m.gym_id = g for update;
  if f.id is null then raise exception 'No encontramos esa ficha.' using errcode = 'P0001'; end if;
  if f.status = 'pausado' then
    update public.gym_members set status = 'activo', paused_until = null where id = f.id;
  elsif f.status = 'baja' then
    if f.member_id is not null and f.baja_motivo = 'socio' then
      raise exception 'Esa persona salió del gimnasio: para volver tiene que pedir sumarse.' using errcode = 'P0001';
    end if;
    if not public.gym_cupo_ok(g, '{}') then
      raise exception 'El gimnasio no puede sumar socios en este momento.' using errcode = 'P0001';
    end if;
    begin
      update public.gym_members set status = 'activo', left_at = null, baja_motivo = null, member_id = null,
             terms_at = null, terms_version = null, share_admin = false,
             share_admin_at = case when share_admin then now() else share_admin_at end, share_admin_version = null
       where id = f.id;
    exception when unique_violation then
      raise exception 'El DNI de esa ficha ya está en otra ficha activa.' using errcode = 'P0001';
    end;
  else
    raise exception 'Esa ficha ya está activa.' using errcode = 'P0001';
  end if;
  perform public.gym_auditar(g, 'reactivar', f.id, f.member_id,
    jsonb_build_object('antes', f.status, 'sin_app', f.status = 'baja' and f.member_id is not null));
  return jsonb_build_object('ok', true, 'sin_app', f.member_id is null or f.status = 'baja');
end $$;
revoke all on function public.gym_reactivar(uuid) from public, anon;
grant execute on function public.gym_reactivar(uuid) to authenticated;

-- Dar de baja una ficha (dueño y administración). Si la persona la atendía alguien del equipo, queda
-- sin coach; un coach de afuera no cambia.
create or replace function public.gym_baja(ficha uuid, motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare g uuid := public.gym_exigir(array['owner', 'admin']); f record; socio uuid; c uuid;
begin
  select m.member_id into socio from public.gym_members m where m.id = ficha and m.gym_id = g;
  if socio is not null then perform 1 from public.profiles where id = socio for update; end if;
  select m.* into f from public.gym_members m where m.id = ficha and m.gym_id = g for update;
  if f.id is null or f.status not in ('activo', 'pausado', 'visita') then
    raise exception 'Esa ficha ya está de baja (o es una solicitud: rechazala).' using errcode = 'P0001';
  end if;
  select p.coach_id into c from public.profiles p where p.id = f.member_id;
  update public.gym_members set status = 'baja', left_at = now(),
         baja_motivo = case when btrim(coalesce(motivo, '')) in ('', 'socio') then 'gimnasio' else left(btrim(motivo), 200) end
   where id = f.id;
  if c is not null and exists (select 1 from public.gym_staff s where s.gym_id = g and s.user_id = c and s.left_at is null
                                  and s.role in ('owner', 'admin', 'profe')) then
    update public.profiles set coach_id = null where id = f.member_id;
  end if;
  perform public.gym_auditar(g, 'baja', f.id, f.member_id, jsonb_build_object('antes', f.status));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.gym_baja(uuid, text) from public, anon;
grant execute on function public.gym_baja(uuid, text) to authenticated;

-- La lista de Socios del panel (dueño y administración): todas las fichas menos las solicitudes y
-- las bajas de hace más de 24 meses. «Último entreno» solo de quien compartió (y el plan está al día)
-- o de quien es asignado de quien mira.
create or replace function public.gym_socios_resumen()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare g uuid := public.gym_exigir(array['owner', 'admin']); comp uuid[] := public.gym_socios_compartidos(); me uuid := auth.uid();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'member_id', m.member_id,
      'nombre', coalesce(nullif(m.full_name, ''), p.full_name), 'foto_path', m.foto_path, 'avatar_path', p.avatar_path,
      'estado', m.status, 'paused_until', m.paused_until, 'sin_app', m.member_id is null,
      'falta_confirmacion', m.member_id is not null and m.terms_at is null, 'foto_pendiente', m.foto_pend_path is not null,
      'profe', case when m.trainer_id is not null then jsonb_build_object('id', t.id, 'name', t.full_name) end,
      'coach_externo', m.member_id is not null and p.coach_id is not null and m.trainer_id is null and m.status in ('activo', 'pausado'),
      'share_admin', m.share_admin and m.terms_at is not null, 'dni', m.dni, 'phone', m.phone, 'email', m.email,
      'app_vieja', public.gym_app_vieja(p.app_platform, p.app_version),
      'apto_medico_vence', m.apto_medico_vence, 'joined_at', m.joined_at, 'left_at', m.left_at, 'source', m.source,
      'ultimo_ingreso', (select max(e.at) from public.gym_entries e where e.gym_member_id = m.id),
      'ultimo_entreno', case when m.member_id = any(comp) or (m.trainer_id = me and m.status in ('activo', 'pausado'))
                             then (select max(se.performed_on) from public.sessions se where se.client_id = m.member_id) end)
      order by coalesce(nullif(m.full_name, ''), p.full_name))
    from public.gym_members m left join public.profiles p on p.id = m.member_id left join public.profiles t on t.id = m.trainer_id
   where m.gym_id = g and m.status <> 'pendiente' and (m.status <> 'baja' or m.left_at > now() - interval '24 months')), '[]'::jsonb);
end $$;
revoke all on function public.gym_socios_resumen() from public, anon;
grant execute on function public.gym_socios_resumen() to authenticated;

-- La foto del gimnasio la saca el gimnasio (queda aprobada).
create or replace function public.gym_foto_staff(ficha uuid, path text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare g uuid := public.gym_exigir_altas(); f record;
begin
  select m.id, m.member_id, m.status, m.foto_path, m.foto_pend_path into f from public.gym_members m where m.id = ficha and m.gym_id = g for update;
  if f.id is null or f.status = 'baja' then raise exception 'No encontramos esa ficha.' using errcode = 'P0001'; end if;
  if not public.gym_foto_valida(g, f.id, path) then raise exception 'No encontramos la foto: probá de nuevo.' using errcode = 'P0001'; end if;
  update public.gym_members set foto_path = path, foto_ok_at = now(), foto_ok_by = auth.uid(), foto_pend_path = null,
         foto_pend_at = null, foto_rechazo = null where id = f.id;
  perform public.gym_auditar(g, 'foto_staff', f.id, f.member_id, jsonb_build_object('reemplaza', f.foto_path, 'descarta', f.foto_pend_path));
  return jsonb_build_object('foto', 'ok');
end $$;
revoke all on function public.gym_foto_staff(uuid, text) from public, anon;
grant execute on function public.gym_foto_staff(uuid, text) to authenticated;

-- Aprobar o rechazar la foto que propuso el socio. foto es la ruta que vio el equipo: si el socio mandó
-- otra mientras tanto, no se aprueba ni se rechaza la que nadie miró.
create or replace function public.gym_foto_resolver(ficha uuid, aprobar boolean, motivo text, foto text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare g uuid := public.gym_exigir_altas(); f record;
begin
  select m.id, m.member_id, m.foto_path, m.foto_pend_path into f from public.gym_members m where m.id = ficha and m.gym_id = g for update;
  if f.id is null or f.foto_pend_path is null then raise exception 'No hay ninguna foto para aprobar.' using errcode = 'P0001'; end if;
  if f.foto_pend_path is distinct from foto then raise exception 'La foto cambió: mirala de nuevo.' using errcode = 'P0001'; end if;
  -- La propuesta puede venir de la carpeta de un pedido unido a esta ficha: basta con que sea de este
  -- gimnasio y esté subida.
  if coalesce(aprobar, false) and not (split_part(f.foto_pend_path, '/', 1) = g::text
     and exists (select 1 from storage.objects o where o.bucket_id = 'gym-fotos' and o.name = f.foto_pend_path)) then
    raise exception 'No encontramos la foto: pedile que mande otra.' using errcode = 'P0001';
  end if;
  if coalesce(aprobar, false) then
    update public.gym_members set foto_path = foto_pend_path, foto_ok_at = now(), foto_ok_by = auth.uid(), foto_pend_path = null,
           foto_pend_at = null, foto_rechazo = null where id = f.id;
  else
    update public.gym_members set foto_pend_path = null, foto_pend_at = null,
           foto_rechazo = coalesce(nullif(left(btrim(coalesce(motivo, '')), 200), ''), 'La foto no sirve: mandá otra.') where id = f.id;
  end if;
  perform public.gym_auditar(g, case when coalesce(aprobar, false) then 'foto_aprobada' else 'foto_rechazada' end, f.id, f.member_id,
    jsonb_build_object('reemplaza', case when coalesce(aprobar, false) then f.foto_path end, 'propuesta', f.foto_pend_path));
  if f.member_id is not null then
    perform public.gym_alerta(g, 'u:' || f.member_id, case when coalesce(aprobar, false) then 'foto_aprobada' else 'foto_rechazada' end,
                              f.foto_pend_path, 'push', null);
  end if;
  return jsonb_build_object('foto', case when coalesce(aprobar, false) then 'ok' else 'rechazada' end);
end $$;
revoke all on function public.gym_foto_resolver(uuid, boolean, text, text) from public, anon;
grant execute on function public.gym_foto_resolver(uuid, boolean, text, text) to authenticated;


-- ===== Recepción y asistencia =====

-- Buscar por nombre (2 letras o más) o DNI (3 números o más): hasta 20. Solo nombre, foto del
-- gimnasio (la aprobada; no la de perfil), estado y semáforo.
create or replace function public.buscar_socio(q text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare g uuid := public.gym_exigir_recepcion(); t text := btrim(coalesce(q, '')); dig text; nom text;
begin
  dig := regexp_replace(t, '\D', '', 'g');
  if t ~ '^[0-9 .]+$' then
    if char_length(dig) < 3 then raise exception 'Escribí al menos 2 letras o 3 números del DNI.' using errcode = 'P0001'; end if;
    nom := null;
  else
    if char_length(t) < 2 then raise exception 'Escribí al menos 2 letras o 3 números del DNI.' using errcode = 'P0001'; end if;
    nom := public.gym_norm(t); dig := null;
  end if;
  return coalesce((select jsonb_agg(x.j order by x.o, x.n) from (
    select jsonb_build_object('id', m.id, 'nombre', coalesce(nullif(m.full_name, ''), p.full_name), 'foto_path', m.foto_path,
             'estado', m.status, 'ultimo_ingreso', (select max(e.at) from public.gym_entries e where e.gym_member_id = m.id))
           || public.gym_semaforo(m.id) as j,
           case m.status when 'activo' then 0 when 'pausado' then 1 when 'pendiente' then 2 else 3 end as o,
           coalesce(nullif(m.full_name, ''), p.full_name) as n
      from public.gym_members m left join public.profiles p on p.id = m.member_id
     where m.gym_id = g and (m.status <> 'baja' or m.left_at > now() - interval '24 months')
       and ((dig is not null and m.dni like '%' || dig || '%')
            or (nom is not null and public.gym_norm(coalesce(nullif(m.full_name, ''), p.full_name)) like '%' || nom || '%'))
     order by o, n limit 20) x), '[]'::jsonb);
end $$;
revoke all on function public.buscar_socio(text) from public, anon;
grant execute on function public.buscar_socio(text) to authenticated;

-- Registrar un ingreso a mano. id lo genera la app: un reintento con el mismo id devuelve lo mismo y
-- no duplica. Si ya entró en las últimas ingreso_horas (3 por defecto), no anota otro: repetido.
-- OJO: la vigente (con la cuota vencida) está en gimnasios-cuotas.sql.
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
  select m.id, m.status, m.member_id into f from public.gym_members m where m.id = ficha and m.gym_id = g;
  if f.id is null then raise exception 'No encontramos esa ficha.' using errcode = 'P0001'; end if;
  horas := coalesce((public.gym_settings(g)->>'ingreso_horas')::int, 3);
  select x.* into e from public.gym_entries x where x.gym_member_id = f.id and x.at > now() - make_interval(hours => horas)
   order by x.at desc limit 1;
  if e.id is not null then
    return jsonb_build_object('id', e.id, 'result', e.result, 'repetido', true, 'at', e.at);
  end if;
  res := case f.status when 'activo' then 'ok' when 'pausado' then 'pausado' when 'visita' then 'visita' when 'baja' then 'baja' else 'rechazado' end;
  insert into public.gym_entries (id, gym_id, gym_member_id, at, method, by_user, result)
  values (gym_ingreso_manual.id, g, f.id, now(), 'manual', auth.uid(), res);
  perform public.gym_auditar(g, 'ingreso_manual', f.id, f.member_id, jsonb_build_object('result', res));
  return jsonb_build_object('id', gym_ingreso_manual.id, 'result', res, 'repetido', false, 'at', now());
end $$;
revoke all on function public.gym_ingreso_manual(uuid, uuid) from public, anon;
grant execute on function public.gym_ingreso_manual(uuid, uuid) to authenticated;

-- Los ingresos: dueño y administración, todos desde una fecha (hoy por defecto); el profe, los de sus
-- socios; la recepción, los de hoy. Hasta 1000.
create or replace function public.gym_ingresos(desde date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare s record; d date; me uuid := auth.uid();
begin
  select * into s from public.gym_mi_staff();
  if s.g is null then raise exception 'No tenés permiso para hacer esto en el gimnasio.' using errcode = '42501'; end if;
  d := case when s.rol = 'recepcion' then public.gym_hoy() else coalesce(desde, public.gym_hoy()) end;
  return coalesce((select jsonb_agg(x.j order by x.at desc) from (
    select jsonb_build_object('id', e.id, 'at', e.at, 'ficha', m.id, 'nombre', coalesce(nullif(m.full_name, ''), p.full_name),
             'metodo', e.method, 'resultado', e.result, 'por', u.full_name) as j, e.at
      from public.gym_entries e join public.gym_members m on m.id = e.gym_member_id
      left join public.profiles p on p.id = m.member_id left join public.profiles u on u.id = e.by_user
     where e.gym_id = s.g and e.at >= (d::timestamp at time zone 'America/Argentina/Buenos_Aires')
       and (s.rol in ('owner', 'admin', 'recepcion') or (m.trainer_id = me and m.status in ('activo', 'pausado')))
     order by e.at desc limit 1000) x), '[]'::jsonb);
end $$;
revoke all on function public.gym_ingresos(date) from public, anon;
grant execute on function public.gym_ingresos(date) to authenticated;


-- ===== Plan vencido: liberar y restaurar (internas) =====

-- Día 10 del plan vencido: los socios que atendía el equipo quedan sin profe (R = el profe, C = T =
-- null, coach_left_at, el aviso de hoy en la app) y también los alumnos propios del dueño, como pasa
-- a los 4 días con cualquier coach. Las rutinas programadas no se borran. Marca lapsed_at. Masiva.
create or replace function public.release_lapsed_gyms()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare x record; socios uuid[]; propios uuid[]; cs uuid[]; n int := 0; bulk text := current_setting('gize.gym_bulk', true);
        keep text := current_setting('gize.gym_keep_routines', true);
begin
  for x in select y.id, y.owner_id from public.gyms y join public.coach_billing b on b.coach_id = y.owner_id
            where y.closed_at is null and y.lapsed_at is null and b.plan <> 'cortesia'
              and greatest(b.trial_ends_at, coalesce(b.paid_until, '-infinity')) < now() - interval '10 days'
            order by y.id loop
    select coalesce(array_agg(m.member_id order by m.member_id), '{}') into socios from public.gym_members m
     where m.gym_id = x.id and m.status in ('activo', 'pausado') and m.member_id is not null and m.trainer_id is not null;
    select coalesce(array_agg(p.id order by p.id), '{}') into propios from public.profiles p
     where p.coach_id = x.owner_id and coalesce(p.role, 'client') <> 'coach' and not (p.id = any(socios))
       and public.vinculo_gym(p.id) is null;
    select coalesce(array_agg(distinct s.user_id), '{}') into cs from public.gym_staff s where s.gym_id = x.id and s.left_at is null;
    perform 1 from public.profiles where id = any(socios || propios) order by id for update;
    perform set_config('gize.gym_bulk', 'on', true);
    perform set_config('gize.gym_keep_routines', 'on', true);
    update public.gym_members set restore_trainer_id = trainer_id
     where gym_id = x.id and status in ('activo', 'pausado') and member_id = any(socios) and trainer_id is not null;
    update public.profiles set coach_id = null, coach_left_at = now() where id = any(socios || propios);
    update public.gyms set lapsed_at = now() where id = x.id;
    perform set_config('gize.gym_keep_routines', coalesce(keep, ''), true);
    perform set_config('gize.gym_bulk', coalesce(bulk, ''), true);
    perform public.gym_recontar(cs || x.owner_id);
    perform public.gym_auditar(x.id, 'liberar', null, null, jsonb_build_object('socios', cardinality(socios), 'propios', cardinality(propios)));
    perform public.gym_alerta_staff(x.id, 'plan_liberado', public.gym_hoy()::text, jsonb_build_object('socios', cardinality(socios)));
    n := n + cardinality(socios) + cardinality(propios);
  end loop;
  return n;
end $$;
revoke all on function public.release_lapsed_gyms() from public, anon, authenticated;

-- Al volver a estar al día: cada socio que sigue sin coach, en el gimnasio y con su profe (R) todavía
-- en el equipo, vuelve con él (C = T = R). A los que se fueron o eligieron otro coach no los toca.
-- Masiva, conserva las rutinas programadas. lapsed_at = null.
create or replace function public.gym_restaurar(g uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare socios uuid[]; profes uuid[]; dueno uuid; n int; bulk text := current_setting('gize.gym_bulk', true);
        keep text := current_setting('gize.gym_keep_routines', true);
begin
  if not public.gym_active(g) then return 0; end if;
  select x.owner_id into dueno from public.gyms x where x.id = g;
  select coalesce(array_agg(m.member_id order by m.member_id), '{}'), coalesce(array_agg(distinct m.restore_trainer_id), '{}')
    into socios, profes
    from public.gym_members m join public.profiles p on p.id = m.member_id
   where m.gym_id = g and m.status in ('activo', 'pausado') and m.restore_trainer_id is not null and p.coach_id is null
     and public.gym_profe_no_puede(g, m.restore_trainer_id, m.member_id) is null;
  perform 1 from public.profiles where id = any(socios) order by id for update;
  perform set_config('gize.gym_bulk', 'on', true);
  perform set_config('gize.gym_keep_routines', 'on', true);
  with x as (
    update public.profiles p set coach_id = m.restore_trainer_id
      from public.gym_members m
     where m.member_id = p.id and m.gym_id = g and m.status in ('activo', 'pausado') and p.id = any(socios) and p.coach_id is null
    returning 1)
  select count(*) into n from x;
  update public.gym_members set restore_trainer_id = null where gym_id = g and restore_trainer_id is not null;
  update public.gyms set lapsed_at = null where id = g;
  perform set_config('gize.gym_keep_routines', coalesce(keep, ''), true);
  perform set_config('gize.gym_bulk', coalesce(bulk, ''), true);
  perform public.gym_recontar(profes || dueno);
  perform public.gym_auditar(g, 'restaurar', null, null, jsonb_build_object('socios', n));
  return n;
end $$;
revoke all on function public.gym_restaurar(uuid) from public, anon, authenticated;

-- Cada minuto (gize-gym-tick): restaura los gimnasios liberados que volvieron a estar al día (cada
-- uno en su bloque: uno que falla no frena a los demás) y, a los :23 de cada hora,
-- release_lapsed_gyms. Sin gimnasios liberados sale enseguida.
create or replace function public.gym_tick()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare g uuid; n int := 0;
begin
  for g in select y.id from public.gyms y where y.lapsed_at is not null and y.closed_at is null order by y.id loop
    if public.gym_active(g) then
      begin
        n := n + public.gym_restaurar(g);
      exception when others then
        raise warning 'gym_tick: no se pudo restaurar %: %', g, sqlerrm;
      end;
    end if;
  end loop;
  if extract(minute from now()) = 23 then perform public.release_lapsed_gyms(); end if;
  return n;
end $$;
revoke all on function public.gym_tick() from public, anon, authenticated;

-- Cada día a las 03:10 de Argentina (gize-gym-diaria): pausas que terminan, links #unirme vencidos,
-- invitaciones vencidas hace más de 30 días, diferencias del cupo (a admin_audit y recontadas) y
-- gimnasios cerrados por baja del dueño con los 90 días cumplidos (se borran con sus fichas,
-- ingresos y avisos; gym_audit queda).
create or replace function public.gym_diaria()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare hoy date := public.gym_hoy(); n1 int; n2 int; n3 int; n4 int; dr uuid[]; bulk text := current_setting('gize.gym_bulk', true); duenos uuid[];
begin
  select coalesce(array_agg(distinct y.owner_id), '{}') into duenos from public.gym_members m join public.gyms y on y.id = m.gym_id
   where m.status = 'pausado' and m.paused_until is not null and m.paused_until < hoy;
  perform set_config('gize.gym_bulk', 'on', true);
  with x as (update public.gym_members set status = 'activo', paused_until = null
              where status = 'pausado' and paused_until is not null and paused_until < hoy returning 1)
  select count(*) into n1 from x;
  perform set_config('gize.gym_bulk', coalesce(bulk, ''), true);
  perform public.gym_recontar(duenos);
  with x as (update public.gym_members set invite_token_hash = null, invite_expires_at = null
              where invite_expires_at is not null and invite_expires_at < now() returning 1)
  select count(*) into n2 from x;
  delete from public.gym_invites where accepted_at is null and expires_at < now() - interval '30 days';
  select coalesce(array_agg(d.coach_id), '{}') into dr from public.seats_drift() d;
  insert into public.admin_audit (admin_id, action, target, detail)
  select null, 'seats_drift', d.coach_id::text, jsonb_build_object('cacheado', d.cacheado, 'contado', d.contado) from public.seats_drift() d;
  perform public.gym_recontar(dr);
  with x as (delete from public.gyms where closed_at is not null and purge_after is not null and purge_after < now() returning 1)
  select count(*) into n4 from x;
  n3 := cardinality(dr);
  return jsonb_build_object('pausas', n1, 'links', n2, 'drift', n3, 'purgados', n4);
end $$;
revoke all on function public.gym_diaria() from public, anon, authenticated;


-- ===== Tareas programadas (pg_cron, en UTC) =====

select cron.unschedule('gize-gym-tick') where exists (select 1 from cron.job where jobname = 'gize-gym-tick');
select cron.schedule('gize-gym-tick', '* * * * *', $job$ select public.gym_tick(); $job$);
select cron.unschedule('gize-gym-diaria') where exists (select 1 from cron.job where jobname = 'gize-gym-diaria');
select cron.schedule('gize-gym-diaria', '10 6 * * *', $job$ select public.gym_diaria(); $job$);

notify pgrst, 'reload schema';


-- ===== Para volver atrás =====
-- Correr esto sin los «-- » (antes, el bloque de gimnasios-cuotas.sql y el de gimnasios-admin.sql: si
-- no, se frena sin cambiar nada; después, el de gimnasios-lectura.sql). Saca las tareas, las funciones, las políticas y el
-- bucket gym-fotos (con sus archivos: borrarlos antes desde Storage, o el borrado del bucket falla) y
-- las columnas nuevas.
--
-- do $$ begin
--   if to_regclass('public.gym_payments') is not null then
--     raise exception 'Primero el bloque «Para volver atrás» de supabase/gimnasios-cuotas.sql (usa gym_exigir, gym_settings y gym_hoy).';
--   end if;
--   if to_regprocedure('public.admin_gyms()') is not null then
--     raise exception 'Primero el bloque «Para volver atrás» de supabase/gimnasios-admin.sql (usa gym_plan_estado, gym_settings y gym_tope_profes).';
--   end if;
-- end $$;
-- select cron.unschedule('gize-gym-tick') where exists (select 1 from cron.job where jobname = 'gize-gym-tick');
-- select cron.unschedule('gize-gym-diaria') where exists (select 1 from cron.job where jobname = 'gize-gym-diaria');
-- drop policy if exists "gym-fotos: subir" on storage.objects;
-- drop policy if exists "gym-fotos: ver" on storage.objects;
-- drop trigger if exists gym_fotos_cupo_alta on storage.objects;
-- drop trigger if exists gym_staff_profe on public.gym_staff;
-- delete from storage.buckets where id = 'gym-fotos';
-- delete from public.app_config where key = 'gimnasios';
-- drop function if exists public.gym_diaria(), public.gym_tick(), public.gym_restaurar(uuid), public.release_lapsed_gyms(),
--   public.gym_ingresos(date), public.gym_ingreso_manual(uuid, uuid), public.buscar_socio(text),
--   public.gym_foto_resolver(uuid, boolean, text, text), public.gym_foto_staff(uuid, text), public.gym_socios_resumen(),
--   public.gym_baja(uuid, text), public.gym_reactivar(uuid), public.gym_pausar(uuid, date), public.gym_ficha_profe(uuid), public.gym_dejar_socio(uuid),
--   public.gym_asignar_profe(uuid[], uuid), public.gym_nota_guardar(uuid, text), public.gym_ficha_link(uuid),
--   public.gym_ficha_editar(uuid, jsonb), public.gym_ficha_crear(jsonb), public.gym_ficha_datos(jsonb, boolean),
--   public.gym_rechazar(uuid, text), public.gym_aprobar(uuid, uuid, uuid, boolean, text), public.gym_solicitudes(),
--   public.gym_foto_proponer(text), public.gym_salir(boolean), public.gym_compartir_admin(boolean, text),
--   public.gym_confirmar_hoja(text, boolean, text), public.gym_unirse_token(text, text, text, boolean, text),
--   public.gym_unirse_token_info(text), public.gym_cancelar_solicitud(), public.gym_unirse(text, text, boolean, text),
--   public.gym_socio_puede(uuid, uuid), public.gym_codigo_info(text), public.gym_staff_profe(), public.gym_quitar_staff(uuid, uuid),
--   public.gym_cambiar_rol(uuid, text), public.gym_aceptar_invitacion(text), public.gym_invitacion_info(text),
--   public.gym_invitacion_estado(uuid, uuid), public.gym_equipo(), public.gym_invitaciones(), public.gym_invitacion_revocar(uuid),
--   public.gym_invitar(text), public.gym_exportar(text), public.gym_cerrar(text), public.gym_codigo_rotar(),
--   public.gym_config(jsonb), public.gym_crear(text, text, text, text), public.mi_gimnasio(),
--   public.gym_fotos_huerfanas(), public.gym_foto_valida(uuid, uuid, text), public.gym_fotos_cupo_alta(), public.gym_fotos_cupo_ok(),
--   public.gym_fotos_cupo_libre(text), public.gym_foto_ver(text), public.gym_foto_carpeta(text, text, boolean),
--   public.gym_foto_ve_ficha(uuid), public.gym_crear_motivo(uuid), public.gym_app_vieja(text, text),
--   public.gym_json(uuid), public.gym_semaforo(uuid), public.gym_plan_estado(uuid), public.gym_profes_usados(uuid),
--   public.gym_tope_profes(uuid), public.gym_exigir_recepcion(), public.gym_exigir_altas(), public.gym_exigir(text[]),
--   public.gym_mi_staff(), public.gym_settings(uuid), public.gym_codigo_nuevo(), public.gym_norm(text), public.gym_hash(text),
--   public.gym_token(), public.gym_hoy(), public.gym_version_ok(text, text), public.gym_versiones();
-- drop index if exists public.gyms_purge_idx;
-- drop index if exists public.gyms_lapsed_idx;
-- drop index if exists public.gym_members_foto_pend_path_idx;
-- drop index if exists public.gym_members_foto_path_idx;
-- drop index if exists public.gym_members_unir_idx;
-- drop index if exists public.gym_members_foto_pend_idx;
-- alter table public.gym_invites drop column if exists revoked_at;
-- alter table public.gym_members drop constraint if exists gym_members_dni_intentos_check;
-- alter table public.gym_members drop constraint if exists gym_members_foto_check;
-- alter table public.gym_members drop column if exists unir_sugerida, drop column if exists dni_intentos,
--   drop column if exists foto_rechazo, drop column if exists foto_pend_at, drop column if exists foto_pend_path,
--   drop column if exists foto_ok_by, drop column if exists foto_ok_at, drop column if exists foto_path;
-- notify pgrst, 'reload schema';
