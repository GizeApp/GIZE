-- Gimnasios, etapa 1: control ANTES de aplicar los archivos de los gimnasios. SOLO LEE: no crea, no
-- cambia ni borra nada, y no devuelve datos de nadie (solo nombres de tablas, columnas y funciones).
-- Correrlo antes de supabase/gimnasios.sql, gimnasios-vinculo.sql, gimnasios-lectura.sql,
-- gimnasios-socios.sql y gimnasios-admin.sql (en ese orden), para saber si la base real tiene todo lo
-- que esos archivos dan por hecho. Se pega en Supabase → SQL Editor (no con el workflow: la tarea
-- sql no muestra resultados y el log es público). Se puede correr las veces que haga falta.
--
-- Qué devuelve: una fila por cada cosa que falta (tipo «falta») o que no se pudo comprobar (tipo
-- «aviso»). SIN FILAS = está todo: se pueden aplicar los gimnasios*.sql. Columnas:
--   tipo     'falta' (hay que arreglarlo antes) o 'aviso' (mirarlo a mano)
--   que      postgres, extension, postgrest, esquema, tabla, columna, rls, funcion o bucket
--   objeto   el nombre (tabla.columna, funcion(argumentos)…)
--   detalle  qué pasa y qué archivo del repo lo crea
--
-- Qué controla (sale de lo que usan los gimnasios*.sql y de los controles del principio de cada uno):
--   · Postgres 15 o más nuevo (el de Supabase) y la extensión pg_cron (las dos tareas programadas
--     de gimnasios-socios.sql: cron.schedule).
--   · PostgREST 10 o más nuevo: las funciones devuelven errores con response.status y leen la sesión
--     de request.jwt.claims. La versión se ve en pg_stat_activity (application_name «PostgREST x.y»)
--     solo si en ese momento hay una conexión suya; si no se ve, sale un aviso (en Supabase →
--     Settings → API está la versión).
--   · Las tablas de antes que leen o cambian los gimnasios, con las columnas que usan y la seguridad
--     por filas (RLS) prendida.
--   · Las funciones de antes que usan (admin_assert, bloqueo_entre, chat_folder_mine…) y las que
--     reemplazan (coach_active, is_my_client, join_coach…), con sus argumentos.
--   · Los buckets avatars y chat-audio (gym-fotos lo crea gimnasios-socios.sql).
with
ver as (select current_setting('server_version_num')::int n),
ext(nombre, archivo) as (values ('pg_cron', 'aviso-vencimiento.sql')),
esquemas(nombre, archivo) as (values ('auth', 'Supabase'), ('storage', 'Supabase')),
-- Tablas de antes y las columnas que usan los gimnasios*.sql.
cols(tabla, columna, archivo) as (values
  ('profiles', 'id', 'las tablas base'), ('profiles', 'full_name', 'las tablas base'), ('profiles', 'role', 'las tablas base'),
  ('profiles', 'invite_code', 'las tablas base'), ('profiles', 'coach_id', 'las tablas base'), ('profiles', 'created_at', 'las tablas base'),
  ('profiles', 'avatar_path', 'foto-perfil.sql'), ('profiles', 'last_seen_at', 'admin.sql'), ('profiles', 'app_version', 'admin.sql'),
  ('profiles', 'app_platform', 'admin.sql'), ('profiles', 'coach_left_at', 'coach-vencido.sql'),
  ('coach_billing', 'coach_id', 'suscripciones.sql'), ('coach_billing', 'plan', 'suscripciones.sql'),
  ('coach_billing', 'max_clients', 'suscripciones.sql'), ('coach_billing', 'trial_ends_at', 'suscripciones.sql'),
  ('coach_billing', 'paid_until', 'suscripciones.sql'), ('coach_billing', 'mp_preapproval_id', 'suscripciones.sql'),
  ('coach_billing', 'mp_status', 'suscripciones.sql'), ('coach_billing', 'pending_plan', 'suscripciones.sql'),
  ('coach_billing', 'updated_at', 'suscripciones.sql'), ('coach_billing', 'aviso_vence_para', 'aviso-vencimiento.sql'),
  ('coach_billing', 'apple_original_tx', 'compras-apple.sql'), ('coach_billing', 'apple_vence', 'compras-apple.sql'),
  ('coach_billing', 'apple_renueva', 'compras-apple.sql'),
  ('coach_messages', 'id', 'notificaciones.sql'), ('coach_messages', 'coach_id', 'notificaciones.sql'), ('coach_messages', 'client_id', 'notificaciones.sql'),
  ('coach_messages', 'body', 'notificaciones.sql'), ('coach_messages', 'created_at', 'notificaciones.sql'), ('coach_messages', 'read_at', 'chat.sql'),
  ('coach_messages', 'sender', 'chat.sql'),
  ('admin_audit', 'admin_id', 'admin.sql'), ('admin_audit', 'action', 'admin.sql'), ('admin_audit', 'target', 'admin.sql'),
  ('admin_audit', 'detail', 'admin.sql'), ('admin_audit', 'created_at', 'admin.sql'),
  ('app_admins', 'user_id', 'productos-revision.sql'),
  ('app_config', 'key', 'admin.sql'), ('app_config', 'value', 'admin.sql'), ('app_config', 'updated_at', 'admin.sql'),
  ('join_code_attempts', 'user_id', 'coach-alumnos.sql'), ('join_code_attempts', 'created_at', 'coach-alumnos.sql'),
  ('routine_schedule', 'client_id', 'rutina-programada.sql'), ('routine_schedule', 'name', 'rutina-programada.sql'),
  ('routine_schedule', 'days', 'rutina-programada.sql'), ('routine_schedule', 'created_by', 'rutina-programada.sql'),
  ('routine_schedule', 'applied_at', 'rutina-programada.sql'),
  ('cardio_outings', 'client_id', 'cardio-a-pie.sql'), ('cardio_outings', 'performed_on', 'cardio-a-pie.sql'),
  ('cardio_outings', 'started_at', 'cardio-a-pie.sql'), ('cardio_outings', 'track', 'cardio-a-pie.sql'),
  ('daily_logs', 'client_id', 'las tablas base'), ('daily_logs', 'log_date', 'las tablas base'), ('daily_logs', 'steps', 'las tablas base'),
  ('products', 'created_by', 'productos.sql'),
  -- Las que lee la administración del gimnasio (gimnasios-lectura.sql: una política por client_id).
  ('body_weights', 'client_id', 'las tablas base'), ('checkins', 'client_id', 'las tablas base'), ('client_prefs', 'client_id', 'las tablas base'),
  ('food_entries', 'client_id', 'las tablas base'), ('food_entries', 'log_date', 'las tablas base'), ('sessions', 'client_id', 'las tablas base'),
  ('sessions', 'performed_on', 'las tablas base'), ('session_entries', 'client_id', 'las tablas base'), ('client_info', 'client_id', 'las tablas base'),
  ('blocks', 'client_id', 'las tablas base'), ('nutrition', 'client_id', 'las tablas base'), ('routines', 'client_id', 'las tablas base')),
tablas(tabla, archivo) as (values
  ('profiles', 'las tablas base'), ('coach_billing', 'suscripciones.sql'), ('coach_messages', 'notificaciones.sql'),
  ('admin_audit', 'admin.sql'), ('app_admins', 'productos-revision.sql'), ('app_config', 'admin.sql'),
  ('join_code_attempts', 'coach-alumnos.sql'), ('routine_schedule', 'rutina-programada.sql'), ('cardio_outings', 'cardio-a-pie.sql'),
  ('daily_logs', 'las tablas base'), ('products', 'productos.sql'), ('body_weights', 'las tablas base'), ('checkins', 'las tablas base'),
  ('client_prefs', 'las tablas base'), ('food_entries', 'las tablas base'), ('sessions', 'las tablas base'),
  ('session_entries', 'las tablas base'), ('client_info', 'las tablas base'), ('blocks', 'las tablas base'),
  ('nutrition', 'las tablas base'), ('routines', 'las tablas base')),
-- Funciones de antes: las que usan y las que reemplazan (tienen que estar con estos argumentos).
fns(firma, archivo) as (values
  ('public.admin_assert()', 'admin.sql'), ('public.admin_log(text, text, jsonb)', 'admin.sql'),
  ('public.bloqueo_entre(uuid, uuid)', 'bloqueos.sql'), ('public.chat_folder_mine(text, text)', 'chat.sql'),
  ('public.coach_vence(public.coach_billing)', 'aviso-vencimiento.sql'), ('public.plan_price(text)', 'admin.sql'),
  ('public.coach_active(uuid)', 'suscripciones.sql'), ('public.is_my_client(uuid)', 'base.sql'),
  ('public.join_coach(text)', 'base.sql'), ('public.release_lapsed_clients()', 'coach-vencido.sql'),
  ('public.routine_schedule_on_coach_change()', 'rutina-programada.sql'), ('public.admin_set_role(uuid, text)', 'admin.sql'),
  ('public.admin_unlink(uuid)', 'admin.sql'), ('public.chat_unread()', 'chat.sql'), ('public.chat_mark_read(uuid)', 'chat.sql'),
  ('public.admin_coaches()', 'admin.sql'), ('public.admin_overview()', 'admin.sql'), ('public.admin_set_config(text, jsonb)', 'admin.sql'),
  ('public.hay_avisos_vence()', 'aviso-vencimiento.sql'), ('public.tomar_avisos_vence()', 'aviso-vencimiento.sql'),
  ('public.soltar_aviso_vence(uuid)', 'aviso-vencimiento.sql'),
  ('auth.uid()', 'Supabase'), ('storage.foldername(text)', 'Supabase')),
buckets(id, archivo) as (values ('avatars', 'foto-perfil.sql'), ('chat-audio', 'chat.sql')),
-- PostgREST: la versión de alguna conexión suya, si hay (application_name «PostgREST 12.2.3»).
pgrst as (select max(substring(application_name from '(?i)postgrest\s+v?([0-9]+(?:\.[0-9]+)*)')) v
            from pg_stat_activity where application_name ~* '^postgrest'),
filas(orden, tipo, que, objeto, detalle) as (
  select 1, 'falta', 'postgres', current_setting('server_version'), 'Hace falta Postgres 15 o más nuevo.'
    from ver where n < 150000
  union all
  select 2, 'falta', 'extension', e.nombre, 'Prenderla en Supabase → Database → Extensions (la usa ' || e.archivo || ' y las tareas de los gimnasios).'
    from ext e where not exists (select 1 from pg_extension x where x.extname = e.nombre)
     and to_regprocedure('cron.schedule(text, text, text)') is null
  union all
  select 3, 'falta', 'esquema', s.nombre, 'No está el esquema ' || s.nombre || ' (' || s.archivo || ').'
    from esquemas s where to_regnamespace(s.nombre) is null
  union all
  select 4, 'aviso', 'postgrest', 'versión', 'No se pudo ver la versión de PostgREST (ninguna conexión suya ahora): mirala en Supabase → Settings → API (tiene que ser 10 o más nueva).'
    from pgrst where v is null
  union all
  select 4, 'falta', 'postgrest', v, 'Hace falta PostgREST 10 o más nuevo (response.status y request.jwt.claims).'
    from pgrst where v is not null and split_part(v, '.', 1)::int < 10
  union all
  select 5, 'falta', 'tabla', 'public.' || t.tabla, 'No está la tabla (la crea ' || t.archivo || ').'
    from tablas t where to_regclass('public.' || t.tabla) is null
  union all
  select 6, 'falta', 'columna', 'public.' || c.tabla || '.' || c.columna, 'Falta la columna (la suma ' || c.archivo || ').'
    from cols c
   where to_regclass('public.' || c.tabla) is not null
     and not exists (select 1 from pg_attribute a where a.attrelid = to_regclass('public.' || c.tabla) and a.attname = c.columna and a.attnum > 0 and not a.attisdropped)
  union all
  select 7, 'falta', 'rls', 'public.' || t.tabla, 'La seguridad por filas (RLS) está apagada: prenderla antes (las políticas de los gimnasios no sirven sin RLS).'
    from tablas t join pg_class k on k.oid = to_regclass('public.' || t.tabla)
   where not k.relrowsecurity
  union all
  select 8, 'falta', 'funcion', f.firma, 'No está la función con esos argumentos (' || f.archivo || ').'
    from fns f
   where to_regnamespace(split_part(f.firma, '.', 1)) is not null
     -- Sin coach_billing, coach_vence(public.coach_billing) ni se pregunta (ya sale la tabla).
     and case when f.firma like '%coach_billing%' and to_regclass('public.coach_billing') is null then false
              else to_regprocedure(f.firma) is null end
  union all
  select 9, 'falta', 'bucket', b.id, 'No está el bucket de Storage (lo crea ' || b.archivo || ').'
    from buckets b
   where to_regclass('storage.buckets') is not null and not exists (select 1 from storage.buckets x where x.id = b.id)
)
select tipo, que, objeto, detalle from filas order by orden, objeto;
