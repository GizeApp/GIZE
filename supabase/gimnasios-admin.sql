-- Gimnasios, etapa 1: el admin de GIZE (gize.ar/admin) y el mail del plan del gimnasio. La pestaña
-- «Gimnasios» de Usuarios (marcas, detalle sin datos de socios, convertir una cuenta de coach,
-- transferir, cerrar, subir el tope de profes y exportar la auditoría), «Coaches y pagos» y el Resumen
-- con los gimnasios, el interruptor para crear gimnasios y los avisos de vencimiento a los dueños.
-- Correr con el workflow "Supabase" → tarea sql → supabase/gimnasios-admin.sql, después de supabase/gimnasios.sql, supabase/gimnasios-vinculo.sql, supabase/gimnasios-lectura.sql y supabase/gimnasios-socios.sql. Se puede correr varias veces.
-- Sin esos cuatro falla entero, sin cambiar nada (lo primero del archivo lo controla).
-- ANTES: publicar la función vence-plan nueva (lee las columnas nuevas de tomar_avisos_vence; la vieja
-- solo lee las cuatro de hoy y, con este archivo, le mandaría «vence mañana» a un dueño 7 días antes).
--
-- SIN GIMNASIOS TODO SIGUE IGUAL: admin_coaches, admin_overview, tomar_avisos_vence y
-- hay_avisos_vence dan lo mismo que hoy en las columnas y claves de hoy (lo prueba
-- tests/gimnasios-igual.test.mjs contra la base sin gimnasios); solo suman columnas y claves nuevas.
--
-- OJO: canónico. Acá están las versiones vigentes de admin_coaches y admin_set_config (antes en
-- admin.sql), admin_overview (antes en precios-2026-10.sql), hay_avisos_vence y tomar_avisos_vence
-- (antes en compras-apple.sql) y soltar_aviso_vence (antes en aviso-vencimiento.sql). Si volvés a
-- correr alguno de esos archivos, corré después este. compras-apple.sql, en cambio, falla entero sin
-- cambiar nada (tomar_avisos_vence cambió de tipo): primero el bloque «Para volver atrás» de acá.
--
-- Qué suma:
--   · gym_avisos_vence (gym_id, para, dias): qué vencimiento y con cuántos días (7, 3 o 1) se le avisó
--     al dueño, así cada aviso sale una sola vez. Tabla aparte, con RLS y sin permisos para la app: el
--     vencimiento del plan del dueño no lo ven los socios, la recepción ni los profes (gyms sí la leen).
--   · admin_gyms(): {alta (el interruptor app_config.gimnasios), gyms: [...]}: cada gimnasio abierto (y
--     los cerrados de los últimos 90 días) con dueño, plan, cupo, profes, recepción, estado del plan,
--     vencimiento, Mercado Pago o Apple, creado, último uso y marcas: sobre el cupo, plan menor a 100,
--     sin uso de gimnasio a los 30 días (sin ingresos: las cuotas y las clases llegan en las etapas 2 y
--     3), diferencia en el recuento del cupo y cerrado por la baja del dueño (con los días que faltan
--     para borrarlo).
--   · admin_gym_detail(gym): lo mismo más el equipo y contadores. SIN DATOS DE SOCIOS: ni nombres, ni
--     DNI, ni mails, ni registros; solo cuántos hay en cada estado.
--   · admin_gym_convertir(coach, alumnos, nombre): convierte una cuenta de coach en gimnasio (§1.5):
--     el gimnasio y su código, el coach como dueño y los alumnos elegidos como fichas activas con el
--     dueño como profe, sin la hoja aceptada (terms_at null: «Falta confirmación»), share_admin apagado
--     y source 'conversion'. coach_id no cambia (rutinas, chat y rutinas programadas siguen) y el plan
--     sigue en la misma fila de coach_billing (mismo vencimiento, suscripción y cupo). Los no elegidos
--     siguen como alumnos propios. No depende del interruptor de alta.
--   · admin_gym_transferir(gym, nuevo_dueno): pasa el gimnasio a otra cuenta de coach (también uno
--     cerrado por la baja del dueño, dentro de los 90 días). Ver la función.
--   · admin_gym_cerrar(gym), admin_gym_profes_extra(gym, n) y admin_gym_auditoria(gym) (exporta).
--   · Todas con admin_assert() y admin_log (admin_audit) y, las que cambian algo, también gym_audit.
--   · Canónicas: admin_coaches (columnas gimnasio, gym_id, gym_rol y sin_cargo; «Alumnos» es
--     seats_used), admin_overview (claves gyms, gym_socios y gym_profes; «prueba vencida» sin los profes
--     sin cargo), admin_set_config (también la clave «gimnasios»: {"alta": true|false}),
--     tomar_avisos_vence / hay_avisos_vence (los profes sin vínculos propios no reciben el mail; los
--     dueños, a 7, 3 y 1 día, con el nombre del gimnasio, sus socios y la copia a la administración) y
--     soltar_aviso_vence (también desmarca el aviso del gimnasio).
--
-- Orden de bloqueo de la etapa 0: perfiles, tablas de gimnasios y coach_billing al final (gym_recontar).
--
-- Para volver atrás: el bloque comentado del final (antes que el de gimnasios-socios.sql).


-- ===== Antes que nada: ¿están los archivos anteriores? =====

do $$ begin
  if to_regclass('public.gym_members') is null or to_regprocedure('public.gym_cerrar_interno(uuid, text)') is null
     or to_regprocedure('public.gym_socios_compartidos()') is null or to_regprocedure('public.mi_gimnasio()') is null
     or to_regprocedure('public.gym_plan_estado(uuid)') is null then
    raise exception 'Primero correr supabase/gimnasios.sql, supabase/gimnasios-vinculo.sql, supabase/gimnasios-lectura.sql y supabase/gimnasios-socios.sql: este archivo usa sus tablas y funciones.';
  end if;
  if to_regprocedure('public.admin_assert()') is null or to_regprocedure('public.coach_vence(public.coach_billing)') is null
     or to_regclass('public.app_config') is null then
    raise exception 'Faltan funciones de hoy (admin_assert, coach_vence, app_config): correr antes los archivos de supabase/.';
  end if;
end $$;


-- ===== Tabla nueva =====

-- Las cuentas de prueba (la misma tabla de cuentas-prueba.sql; se crea acá por si este archivo corre
-- antes). Coaches y pagos y el Resumen de abajo las marcan y no las cuentan, como en ese archivo.
create table if not exists public.test_accounts (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  marked_at  timestamptz not null default now(),
  marked_by  uuid references auth.users(id) on delete set null
);
alter table public.test_accounts enable row level security;
revoke all on public.test_accounts from anon, authenticated;

-- El aviso de vencimiento que se le mandó al dueño de cada gimnasio. No va en gyms: esa tabla la lee
-- todo el gimnasio (socios, visitas, recepción) y esto es del plan entre el dueño y GIZE. Solo la
-- tocan tomar_avisos_vence, soltar_aviso_vence y admin_gym_transferir (security definer).
create table if not exists public.gym_avisos_vence (
  gym_id uuid primary key references public.gyms(id) on delete cascade,
  para   timestamptz not null,   -- el vencimiento que se le avisó al dueño
  dias   smallint not null       -- con cuántos días (7, 3 o 1)
);
alter table public.gym_avisos_vence drop constraint if exists gym_avisos_vence_dias_check;
alter table public.gym_avisos_vence add constraint gym_avisos_vence_dias_check check (dias in (1, 3, 7));
alter table public.gym_avisos_vence enable row level security;
revoke all on table public.gym_avisos_vence from public, anon, authenticated;


-- ===== Ayudas (internas) =====

-- ¿Es un profe (o administración con cuenta de coach) de un gimnasio abierto, sin vínculos propios?
-- «Profe de X, sin cargo»: no paga nada, así que no cuenta como «prueba vencida» ni recibe el mail de
-- vencimiento. Sin gimnasios, siempre falso.
create or replace function public.gym_profe_sin_cargo(c uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (select 1 from public.gym_staff s join public.gyms x on x.id = s.gym_id and x.closed_at is null
                  where s.user_id = c and s.left_at is null and s.role in ('admin', 'profe'))
     and public.recount_seats(c) = 0;
end $$;
revoke all on function public.gym_profe_sin_cargo(uuid) from public, anon, authenticated;

-- Una fila de la lista del admin (sin datos de socios).
create or replace function public.admin_gym_fila(g uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare x record; b record; pl jsonb; mail text; nom text; ultima timestamptz; uso timestamptz; drift boolean; vence timestamptz;
begin
  select * into x from public.gyms where id = g;
  if x.id is null then return null; end if;
  select bb.* into b from public.coach_billing bb where bb.coach_id = x.owner_id;
  select u.email::text, p.full_name into mail, nom from auth.users u left join public.profiles p on p.id = u.id where u.id = x.owner_id;
  select max(e.at) into ultima from public.gym_entries e where e.gym_id = g;
  select max(p.last_seen_at) into uso from public.gym_staff s join public.profiles p on p.id = s.user_id where s.gym_id = g and s.left_at is null;
  -- Como seats_drift() pero solo con el dueño y el equipo (seats_drift recuenta a todos los coaches y,
  -- por cada fila de la lista, era gimnasios × coaches).
  drift := exists (select 1 from public.coach_billing bd
                    where (bd.coach_id = x.owner_id or bd.coach_id in (select s.user_id from public.gym_staff s where s.gym_id = g and s.left_at is null))
                      and bd.seats_used is distinct from public.recount_seats(bd.coach_id));
  vence := case when b.plan = 'cortesia' or b.coach_id is null then null else greatest(b.trial_ends_at, coalesce(b.paid_until, '-infinity')) end;
  pl := case when x.closed_at is null then public.gym_plan_estado(g) end;
  return jsonb_build_object(
    'id', x.id, 'nombre', x.name, 'ciudad', x.city, 'provincia', x.province,
    'dueno', case when x.owner_id is null then null else jsonb_build_object('id', x.owner_id, 'nombre', nom, 'email', mail) end,
    'plan', b.plan, 'seats_used', coalesce(b.seats_used, 0), 'max', coalesce(b.max_clients, 10),
    'profes_usados', public.gym_profes_usados(g), 'profes_tope', public.gym_tope_profes(g),
    'profes_extra', coalesce((public.gym_settings(g)->>'profes_extra')::int, 0),
    'recepcion', (select count(*) from public.gym_staff s where s.gym_id = g and s.left_at is null and s.role = 'recepcion'),
    'estado', case when x.closed_at is not null then 'cerrado' else pl->>'estado' end,
    'vence', vence, 'paid_until', b.paid_until, 'trial_ends_at', b.trial_ends_at,
    'mp', case when b.mp_preapproval_id is not null then b.mp_status end,
    'apple', b.apple_original_tx is not null, 'apple_renueva', coalesce(b.apple_renueva, false),
    'creado', x.created_at, 'ultima_entrada', ultima, 'ultimo_uso', uso,
    'codigo', (select k.code from public.gym_codes k where k.gym_id = g and k.kind = 'gym' and k.revoked_at is null limit 1),
    'cerrado', x.closed_at, 'motivo_cierre', x.close_reason, 'borrar_el', x.purge_after,
    'dias_para_borrar', case when x.purge_after is not null then greatest(0, ceil(extract(epoch from (x.purge_after - now())) / 86400))::int end,
    'liberado', x.lapsed_at,
    'marcas', jsonb_build_object(
      'sobre_cupo', x.closed_at is null and coalesce(b.seats_used, 0) > coalesce(b.max_clients, 10),
      'plan_menor_100', x.closed_at is null and b.plan is distinct from 'cortesia' and coalesce(b.max_clients, 10) < 100,
      'sin_uso_30', x.closed_at is null and x.created_at < now() - interval '30 days'
                    and not exists (select 1 from public.gym_entries e where e.gym_id = g and e.at > now() - interval '30 days'),
      'diferencia_cupo', drift,
      'cerrado_por_baja', coalesce(x.close_reason = 'baja_cuenta_dueño', false)));
end $$;
revoke all on function public.admin_gym_fila(uuid) from public, anon, authenticated;


-- ===== Admin de GIZE: gimnasios =====

-- La lista (y el interruptor para crear gimnasios, que la app de config pública no deja leer).
create or replace function public.admin_gyms()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.admin_assert();
  return jsonb_build_object(
    'alta', coalesce((select (c.value->>'alta')::boolean from public.app_config c where c.key = 'gimnasios'), false),
    'gyms', coalesce((select jsonb_agg(public.admin_gym_fila(x.id) order by x.closed_at is not null, x.created_at desc)
                        from public.gyms x
                       where x.closed_at is null or x.closed_at > now() - interval '90 days' or x.purge_after > now()), '[]'::jsonb));
end $$;
revoke all on function public.admin_gyms() from public, anon;
grant execute on function public.admin_gyms() to authenticated;

-- El detalle: la fila, el equipo y contadores. Sin datos de socios.
create or replace function public.admin_gym_detail(gym uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare r jsonb; hoy date := public.gym_hoy();
begin
  perform public.admin_assert();
  r := public.admin_gym_fila(gym);
  if r is null then raise exception 'Ese gimnasio no existe.' using errcode = 'P0001'; end if;
  return r || jsonb_build_object(
    'equipo', coalesce((select jsonb_agg(jsonb_build_object('user_id', s.user_id, 'nombre', p.full_name, 'email', u.email, 'rol', s.role,
                          'desde', s.joined_at, 'hasta', s.left_at, 'cuenta_coach', p.role = 'coach',
                          'socios', (select count(*) from public.gym_members m where m.gym_id = gym and m.trainer_id = s.user_id and m.status in ('activo', 'pausado')),
                          'version', p.app_version, 'plataforma', p.app_platform, 'ultimo_uso', p.last_seen_at)
                          order by s.left_at is not null, array_position(array['owner', 'admin', 'profe', 'recepcion'], s.role), p.full_name)
                         from public.gym_staff s join public.profiles p on p.id = s.user_id left join auth.users u on u.id = s.user_id
                        where s.gym_id = gym), '[]'::jsonb),
    'contadores', (select jsonb_build_object(
        'activos', count(*) filter (where m.status = 'activo'),
        'pausados', count(*) filter (where m.status = 'pausado'),
        'pendientes', count(*) filter (where m.status = 'pendiente'),
        'visitas', count(*) filter (where m.status = 'visita'),
        'bajas', count(*) filter (where m.status = 'baja'),
        'sin_app', count(*) filter (where m.status in ('activo', 'pausado') and m.member_id is null),
        'sin_profe', count(*) filter (where m.status in ('activo', 'pausado') and m.member_id is not null and m.trainer_id is null and p.coach_id is null),
        'coach_externo', count(*) filter (where m.status in ('activo', 'pausado') and m.trainer_id is null and p.coach_id is not null),
        'falta_confirmacion', count(*) filter (where m.status in ('activo', 'pausado') and m.member_id is not null and m.terms_at is null),
        'comparten', count(*) filter (where m.status in ('activo', 'pausado') and m.share_admin),
        'conversion', count(*) filter (where m.status in ('activo', 'pausado') and m.source = 'conversion'))
      from public.gym_members m left join public.profiles p on p.id = m.member_id where m.gym_id = gym)
      || jsonb_build_object(
        'ingresos_hoy', (select count(*) from public.gym_entries e where e.gym_id = gym and e.at >= (hoy::timestamp at time zone 'America/Argentina/Buenos_Aires')),
        'ingresos_30', (select count(*) from public.gym_entries e where e.gym_id = gym and e.at > now() - interval '30 days'),
        'invitaciones', (select count(*) from public.gym_invites i where i.gym_id = gym and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()),
        'avisos_pendientes', (select count(*) from public.gym_alerts a where a.gym_id = gym and a.sent_at is null)),
    -- Si se transfiere: los socios del dueño que no aceptaron la hoja pasan a baja (ver admin_gym_transferir).
    'transferir_bajas', (select count(*) from public.gym_members m join public.profiles p on p.id = m.member_id join public.gyms x on x.id = m.gym_id
                          where m.gym_id = gym and x.closed_at is null and m.status in ('activo', 'pausado') and m.terms_at is null and p.coach_id = x.owner_id),
    'settings', public.gym_settings(gym),
    'contrato', (select jsonb_build_object('version', x.dpa_version, 'aceptado', x.dpa_at) from public.gyms x where x.id = gym));
end $$;
revoke all on function public.admin_gym_detail(uuid) from public, anon;
grant execute on function public.admin_gym_detail(uuid) to authenticated;

-- Convertir una cuenta de coach en gimnasio (§1.5; en el MVP lo hace solo el admin, después de hablar
-- con la cuenta). alumnos: los que pasan a ser socios (alumnos propios de esa cuenta, sin ficha en otro
-- gimnasio). nombre: el del gimnasio (si viene vacío, «Gimnasio de <nombre del coach>»).
-- El contrato de encargo no lo aceptó nadie en la app: queda dpa_version 'conversion' (se firma por
-- fuera, con GIZE; ver la lista para el abogado).
create or replace function public.admin_gym_convertir(coach uuid, alumnos uuid[], nombre text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid(); al uuid[]; malos text; n text; g uuid; cod text; k int; propios int;
        bulk text := current_setting('gize.gym_bulk', true);
begin
  perform public.admin_assert();
  al := coalesce((select array_agg(distinct a order by a) from unnest(coalesce(alumnos, '{}'::uuid[])) a where a is not null and a <> coach), '{}'::uuid[]);
  -- Primero los perfiles (el coach y los alumnos), en orden; después las tablas de gimnasios y al final
  -- coach_billing (gym_recontar).
  perform 1 from public.profiles where id = any(al || coach) order by id for update;
  if not exists (select 1 from public.profiles where id = coach and role = 'coach') then
    raise exception 'Esa cuenta no es de coach.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.gym_staff s join public.gyms x on x.id = s.gym_id and x.closed_at is null where s.user_id = coach and s.left_at is null) then
    raise exception 'Esa cuenta ya es del equipo de un gimnasio.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.gym_members m where m.member_id = coach and m.status <> 'baja') then
    raise exception 'Esa cuenta es socia de un gimnasio.' using errcode = 'P0001';
  end if;
  select string_agg(coalesce(nullif(btrim(p.full_name), ''), 'sin nombre'), ', ' order by p.full_name) into malos
    from unnest(al) a left join public.profiles p on p.id = a
   where p.id is null or p.coach_id is distinct from coach or p.role = 'coach'
      or exists (select 1 from public.gym_members m where m.member_id = a and m.status <> 'baja');
  if malos is not null then
    raise exception 'Estos no son alumnos de esa cuenta o ya están en un gimnasio: %.', malos using errcode = 'P0001';
  end if;
  n := btrim(coalesce(nombre, ''));
  if n = '' then n := left('Gimnasio de ' || coalesce(nullif(btrim((select full_name from public.profiles where id = coach)), ''), 'GIZE'), 80); end if;
  if char_length(n) not between 2 and 80 then
    raise exception 'El nombre del gimnasio tiene que tener entre 2 y 80 letras.' using errcode = 'P0001';
  end if;
  perform set_config('gize.gym_bulk', 'on', true);
  insert into public.gyms (name, owner_id, dpa_version, dpa_at) values (n, coach, 'conversion', now()) returning id into g;
  insert into public.gym_staff (gym_id, user_id, role, invited_by) values (g, coach, 'owner', me);
  cod := public.gym_codigo_nuevo();
  insert into public.gym_codes (code, gym_id) values (cod, g);
  -- Fichas activas; el profe (trainer_id) lo pone gym_members_profe: el coach, que ahora es el dueño.
  insert into public.gym_members (gym_id, member_id, full_name, status, source, created_by, approved_by, joined_at)
  select g, p.id, left(coalesce(p.full_name, ''), 120), 'activo', 'conversion', me, me, now()
    from public.profiles p where p.id = any(al);
  get diagnostics k = row_count;
  perform set_config('gize.gym_bulk', coalesce(bulk, ''), true);
  -- Como gym_crear: en la prueba, el tope pasa de 10 a 100 (§7.2). coach_billing al final.
  update public.coach_billing set max_clients = greatest(coalesce(max_clients, 10), 100)
   where coach_id = coach and plan = 'trial' and trial_ends_at > now();
  perform public.gym_recontar(array[coach]);
  select count(*)::int into propios from public.profiles p where p.coach_id = coach and public.vinculo_gym(p.id) is null;
  perform public.gym_auditar(g, 'conversion', null, coach, jsonb_build_object('fichas', k, 'propios', propios));
  perform public.admin_log('gym_convertir', coach::text, jsonb_build_object('gym', g, 'nombre', n, 'fichas', k, 'propios', propios));
  return jsonb_build_object('gym_id', g, 'code', cod, 'nombre', n, 'fichas', k, 'propios', propios);
end $$;
revoke all on function public.admin_gym_convertir(uuid, uuid[], text) from public, anon;
grant execute on function public.admin_gym_convertir(uuid, uuid[], text) to authenticated;

-- Transferir el gimnasio a otra cuenta de coach (por ejemplo, la administración cuando el dueño se va).
-- · El dueño nuevo: cuenta de coach, sin otro gimnasio (puede ser del equipo de este), sin ficha de
--   socio y sin una suscripción propia que se renueve sola (Mercado Pago o Apple): si no, se le
--   cobraría su plan y el webhook pisaría el del gimnasio.
-- · Plan: la fila del dueño nuevo toma el plan y el tope del gimnasio (los del dueño anterior); el
--   vencimiento es el que termine más tarde. Una suscripción de Mercado Pago o de Apple NO pasa: la
--   respuesta lo avisa (mp_no_pasa, apple_no_pasa) y la fila del dueño anterior no se toca (se corta
--   desde «Coaches y pagos» si hace falta).
-- · Socios del dueño anterior: los que aceptaron la hoja pasan al dueño nuevo (con sus rutinas
--   programadas); con un bloqueo entre los dos, quedan sin profe. Los que no la aceptaron («Falta
--   confirmación», cuentas convertidas) no se pasan a otro profe (§1.5): su ficha pasa a baja y siguen
--   con su coach como alumnos propios, como antes de la conversión. Sus alumnos propios no cambian.
-- · Las invitaciones pendientes se anulan (el dueño nuevo invita de nuevo).
-- · El dueño anterior deja el equipo. Un gimnasio cerrado por la baja de la cuenta del dueño (dentro de
--   los 90 días) se vuelve a abrir con un código nuevo; las fichas quedan en baja (se reactivan desde
--   el panel) y el plan es el que tenga el dueño nuevo (sin_plan_anterior).
create or replace function public.admin_gym_transferir(gym uuid, nuevo_dueno uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare x record; viejo uuid; ob record; nb record; reabre boolean; socios uuid[] := '{}'; sin_hoja uuid[] := '{}'; pasan uuid[] := '{}';
        quedan uuid[] := '{}'; u uuid; cod text; hoy text := public.gym_hoy()::text; anuladas int;
        bulk text := current_setting('gize.gym_bulk', true); keep text := current_setting('gize.gym_keep_routines', true);
begin
  perform public.admin_assert();
  select * into x from public.gyms where id = gym;
  if x.id is null then raise exception 'Ese gimnasio no existe.' using errcode = 'P0001'; end if;
  reabre := x.closed_at is not null;
  if reabre and not (x.close_reason = 'baja_cuenta_dueño' and x.purge_after > now()) then
    raise exception 'Ese gimnasio está cerrado: solo se puede pasar uno cerrado por la baja de la cuenta del dueño, dentro de los 90 días.' using errcode = 'P0001';
  end if;
  viejo := case when reabre then null else x.owner_id end;
  if nuevo_dueno is null or nuevo_dueno is not distinct from viejo then
    raise exception 'Elegí otra persona como dueña.' using errcode = 'P0001';
  end if;
  if viejo is not null then
    select coalesce(array_agg(m.member_id order by m.member_id), '{}'::uuid[]),
           coalesce(array_agg(m.member_id order by m.member_id) filter (where m.terms_at is null), '{}'::uuid[]) into socios, sin_hoja
      from public.gym_members m join public.profiles p on p.id = m.member_id
     where m.gym_id = gym and m.status in ('activo', 'pausado') and p.coach_id = viejo;
  end if;
  -- Perfiles primero (dueño anterior, dueño nuevo y esos socios), en orden.
  perform 1 from public.profiles where id = any(array[viejo, nuevo_dueno] || socios) order by id for update;
  if not exists (select 1 from public.profiles where id = nuevo_dueno and role = 'coach') then
    raise exception 'El dueño nuevo tiene que tener una cuenta de coach.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.gym_staff s join public.gyms y on y.id = s.gym_id and y.closed_at is null
              where s.user_id = nuevo_dueno and s.left_at is null and s.gym_id <> gym) then
    raise exception 'Esa persona ya es del equipo de otro gimnasio.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.gym_members m where m.member_id = nuevo_dueno and m.status <> 'baja') then
    raise exception 'Esa persona es socia de un gimnasio: primero tiene que salir.' using errcode = 'P0001';
  end if;
  select b.* into nb from public.coach_billing b where b.coach_id = nuevo_dueno;
  if nb.coach_id is not null and ((nb.mp_preapproval_id is not null and nb.mp_status = 'authorized') or coalesce(nb.apple_renueva, false)) then
    raise exception 'El dueño nuevo tiene una suscripción propia que se renueva sola (Mercado Pago o Apple): primero tiene que cancelarla.' using errcode = 'P0001';
  end if;
  select b.* into ob from public.coach_billing b where b.coach_id = viejo;
  perform 1 from public.gyms where id = gym for update;
  -- Las invitaciones pendientes se anulan todas (las dejó el equipo de antes: con una, el dueño
  -- anterior, o el equipo de antes del cierre, volvería a entrar). El dueño nuevo invita de nuevo.
  update public.gym_invites set revoked_at = now() where gym_id = gym and accepted_at is null and revoked_at is null;
  get diagnostics anuladas = row_count;
  perform set_config('gize.gym_bulk', 'on', true);
  if viejo is not null then
    foreach u in array socios loop
      if u = any(sin_hoja) then null;
      elsif public.bloqueo_entre(u, nuevo_dueno) then quedan := quedan || u;
      else pasan := pasan || u;
      end if;
    end loop;
    update public.gym_members set status = 'baja', left_at = now(), baja_motivo = 'transferencia'
     where gym_id = gym and status in ('activo', 'pausado') and member_id = any(sin_hoja);
    if cardinality(pasan) > 0 then
      perform set_config('gize.gym_keep_routines', 'on', true);
      update public.profiles set coach_id = nuevo_dueno where id = any(pasan) and coach_id = viejo;
      update public.routine_schedule set created_by = nuevo_dueno where client_id = any(pasan) and applied_at is null;
      perform set_config('gize.gym_keep_routines', coalesce(keep, ''), true);
    end if;
    update public.profiles set coach_id = null where id = any(quedan) and coach_id = viejo;
    update public.gym_staff set left_at = now() where gym_id = gym and user_id = viejo and left_at is null;
  end if;
  if exists (select 1 from public.gym_staff where gym_id = gym and user_id = nuevo_dueno) then
    update public.gym_staff set role = 'owner', left_at = null,
           joined_at = case when left_at is null then joined_at else now() end, invited_by = auth.uid()
     where gym_id = gym and user_id = nuevo_dueno;
  else
    insert into public.gym_staff (gym_id, user_id, role, invited_by) values (gym, nuevo_dueno, 'owner', auth.uid());
  end if;
  update public.gyms
     set owner_id = nuevo_dueno, closed_at = null, close_reason = null, purge_after = null,
         lapsed_at = case when reabre then null else lapsed_at end,
         default_trainer_id = case when default_trainer_id = viejo then null else default_trainer_id end
   where id = gym;
  delete from public.gym_avisos_vence where gym_id = gym;
  if not exists (select 1 from public.gym_codes k where k.gym_id = gym and k.kind = 'gym' and k.revoked_at is null) then
    cod := public.gym_codigo_nuevo();
    insert into public.gym_codes (code, gym_id) values (cod, gym);
  end if;
  -- coach_billing al final, en orden: la fila del dueño nuevo toma el plan del gimnasio.
  perform 1 from public.coach_billing where coach_id = any(array[viejo, nuevo_dueno]) order by coach_id for update;
  if nb.coach_id is null then insert into public.coach_billing (coach_id) values (nuevo_dueno) on conflict (coach_id) do nothing; end if;
  if ob.coach_id is not null then
    update public.coach_billing
       set plan = ob.plan, max_clients = ob.max_clients,
           trial_ends_at = greatest(trial_ends_at, ob.trial_ends_at), paid_until = greatest(paid_until, ob.paid_until), updated_at = now()
     where coach_id = nuevo_dueno;
  end if;
  perform set_config('gize.gym_bulk', coalesce(bulk, ''), true);
  perform public.gym_recontar(array[viejo, nuevo_dueno]);
  foreach u in array pasan loop
    perform public.gym_alerta(gym, 'u:' || u, 'profe_asignado', u || ':' || nuevo_dueno || ':' || hoy, 'push', jsonb_build_object('profe', nuevo_dueno));
  end loop;
  perform public.gym_auditar(gym, 'transferir', null, nuevo_dueno, jsonb_build_object('antes', viejo, 'reabre', reabre,
    'pasan', cardinality(pasan), 'sin_profe', cardinality(quedan), 'bajas_sin_hoja', cardinality(sin_hoja), 'invitaciones_anuladas', anuladas));
  perform public.admin_log('gym_transferir', gym::text, jsonb_build_object('antes', viejo, 'nuevo', nuevo_dueno, 'reabre', reabre, 'invitaciones_anuladas', anuladas));
  return jsonb_build_object('ok', true, 'reabre', reabre, 'pasan', cardinality(pasan), 'sin_profe', cardinality(quedan),
    'bajas_sin_hoja', cardinality(sin_hoja), 'invitaciones_anuladas', anuladas, 'code', cod,
    'mp_no_pasa', ob.coach_id is not null and ob.mp_preapproval_id is not null and coalesce(ob.mp_status, '') in ('authorized', 'paused', 'pending'),
    'apple_no_pasa', ob.coach_id is not null and (coalesce(ob.apple_renueva, false) or (ob.apple_original_tx is not null and coalesce(ob.apple_vence, '-infinity') > now())),
    'sin_plan_anterior', ob.coach_id is null);
end $$;
revoke all on function public.admin_gym_transferir(uuid, uuid) from public, anon;
grant execute on function public.admin_gym_transferir(uuid, uuid) to authenticated;

-- Cerrar el gimnasio desde el admin (como gym_cerrar del dueño: fichas en baja, los socios que atendía
-- el equipo quedan sin coach, el equipo deja el gimnasio y el código se anula).
create or replace function public.admin_gym_cerrar(gym uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  perform public.admin_assert();
  if not exists (select 1 from public.gyms where id = gym and closed_at is null) then
    raise exception 'Ese gimnasio no existe o ya está cerrado.' using errcode = 'P0001';
  end if;
  n := public.gym_cerrar_interno(gym, 'admin');
  perform public.admin_log('gym_cerrar', gym::text, jsonb_build_object('sin_coach', n));
  return jsonb_build_object('ok', true, 'sin_coach', n);
end $$;
revoke all on function public.admin_gym_cerrar(uuid) from public, anon;
grant execute on function public.admin_gym_cerrar(uuid) to authenticated;

-- Subir (o bajar) los profes sin cargo que suma el admin al tope del plan (8 / 15 / 30).
create or replace function public.admin_gym_profes_extra(gym uuid, n integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare antes int;
begin
  perform public.admin_assert();
  if n is null or n not between 0 and 100 then raise exception 'Entre 0 y 100 profes extra.' using errcode = 'P0001'; end if;
  select coalesce((x.settings->>'profes_extra')::int, 0) into antes from public.gyms x where x.id = gym and x.closed_at is null for update;
  if not found then raise exception 'Ese gimnasio no existe o ya está cerrado.' using errcode = 'P0001'; end if;
  update public.gyms set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('profes_extra', n) where id = gym;
  perform public.gym_auditar(gym, 'profes_extra', null, null, jsonb_build_object('antes', antes, 'ahora', n));
  perform public.admin_log('gym_profes_extra', gym::text, jsonb_build_object('antes', antes, 'ahora', n));
  return jsonb_build_object('profes_extra', n, 'profes_tope', public.gym_tope_profes(gym), 'profes_usados', public.gym_profes_usados(gym));
end $$;
revoke all on function public.admin_gym_profes_extra(uuid, integer) from public, anon;
grant execute on function public.admin_gym_profes_extra(uuid, integer) to authenticated;

-- Exportar la auditoría del gimnasio (si el dueño la pide; la pantalla «Actividad» es de la Fase 2):
-- los últimos 24 meses, con quién lo hizo.
create or replace function public.admin_gym_auditoria(gym uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare r jsonb;
begin
  perform public.admin_assert();
  select coalesce(jsonb_agg(jsonb_build_object('fecha', a.at, 'quien', coalesce(p.full_name, case when a.actor_id is null then 'GIZE (tarea)' end),
           'accion', a.action, 'ficha', m.full_name, 'sobre', t.full_name, 'datos', a.data) order by a.at desc, a.id desc), '[]'::jsonb) into r
    from public.gym_audit a
    left join public.profiles p on p.id = a.actor_id
    left join public.profiles t on t.id = a.target_user
    left join public.gym_members m on m.id = a.gym_member_id
   where a.gym_id = gym and a.at > now() - interval '24 months';
  perform public.admin_log('gym_auditoria', gym::text, jsonb_build_object('filas', jsonb_array_length(r)));
  return r;
end $$;
revoke all on function public.admin_gym_auditoria(uuid) from public, anon;
grant execute on function public.admin_gym_auditoria(uuid) to authenticated;


-- ===== Canónicas: Coaches y pagos, Resumen y configuración =====

-- La de admin.sql con el gimnasio de cada coach: gym_id, gym_rol, gimnasio («Dueño de X», «Profe de X»,
-- «Profe de X, sin cargo»…) y sin_cargo (profe sin vínculos propios: no paga nada). «Alumnos»
-- (clients) es seats_used: el cupo usado de su plan (para un dueño, los socios del gimnasio más sus
-- alumnos propios). is_test: cuenta de prueba (cuentas-prueba.sql), van al final. Sin gimnasios, las
-- columnas de hoy dan lo mismo.
drop function if exists public.admin_coaches();
create or replace function public.admin_coaches()
returns table (id uuid, full_name text, email text, plan text, max_clients int, clients bigint, trial_ends_at timestamptz,
  paid_until timestamptz, mp_status text, has_mp boolean, pending_plan text, active boolean, price numeric,
  gym_id uuid, gym_rol text, gimnasio text, sin_cargo boolean, is_test boolean)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  perform public.admin_assert();
  return query
    select p.id, p.full_name, u.email::text, b.plan, b.max_clients,
           coalesce(b.seats_used::bigint, (select count(*) from public.profiles x where x.coach_id = p.id)), b.trial_ends_at, b.paid_until, b.mp_status,
           b.mp_preapproval_id is not null, b.pending_plan, public.coach_active(p.id), public.plan_price(b.plan),
           s.g, s.r,
           case when s.g is null then null
                else (case s.r when 'owner' then 'Dueño de ' when 'admin' then 'Administración de ' when 'profe' then 'Profe de ' else 'Recepción de ' end)
                     || s.nom || (case when s.sc then ', sin cargo' else '' end) end,
           coalesce(s.sc, false),
           exists (select 1 from public.test_accounts t where t.user_id = p.id)
      from public.profiles p join auth.users u on u.id = p.id left join public.coach_billing b on b.coach_id = p.id
      left join lateral (select st.gym_id as g, st.role as r, gy.name as nom,
                                (st.role in ('admin', 'profe') and public.recount_seats(p.id) = 0) as sc
                           from public.gym_staff st join public.gyms gy on gy.id = st.gym_id and gy.closed_at is null
                          where st.user_id = p.id and st.left_at is null limit 1) s on true
     where p.role = 'coach'
     order by exists (select 1 from public.test_accounts t where t.user_id = p.id),
              public.coach_active(p.id) desc, coalesce(b.seats_used::bigint, (select count(*) from public.profiles x where x.coach_id = p.id)) desc
     limit 300;
end $$;
revoke all on function public.admin_coaches() from public, anon;
grant execute on function public.admin_coaches() to authenticated;

-- La de precios-2026-10.sql con los gimnasios: gyms (abiertos), gym_socios (fichas activas y pausadas
-- de los abiertos) y gym_profes (profes y administración con cuenta de coach: los que cuentan en el
-- tope). «overdue» (prueba vencida y sin pago) deja afuera a los profes sin cargo. Como en
-- cuentas-prueba.sql, no cuenta las cuentas de prueba. Sin gimnasios, las claves de hoy dan lo mismo y
-- las nuevas, 0.
create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
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
    'overdue',   (select count(*) from cb b where b.plan not in ('cortesia') and b.trial_ends_at <= now() and coalesce(b.paid_until, '-infinity') <= now()
                    and not public.gym_profe_sin_cargo(b.coach_id)),
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
                      from pr where last_seen_at > now() - interval '30 days' group by 1, 2) v),
    'gyms',       (select count(*) from public.gyms where closed_at is null),
    'gym_socios', (select count(*) from public.gym_members m join public.gyms x on x.id = m.gym_id and x.closed_at is null where m.status in ('activo', 'pausado')),
    'gym_profes', (select coalesce(sum(public.gym_profes_usados(x.id)), 0) from public.gyms x where x.closed_at is null)
  ) into out;
  return out;
end $$;
revoke all on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;

-- La de admin.sql con una clave más: «gimnasios» ({"alta": true|false}, el interruptor para crear
-- gimnasios; lo lee gym_crear_motivo). La app no la lee (la política de app_config solo deja «version»).
create or replace function public.admin_set_config(p_key text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_assert();
  if p_key not in ('version', 'gimnasios') then raise exception 'Clave inválida.'; end if;
  if p_key = 'gimnasios' and not (case when jsonb_typeof(p_value) = 'object'
                                       then jsonb_typeof(p_value->'alta') = 'boolean' and (select count(*) from jsonb_object_keys(p_value)) = 1
                                       else false end) then
    raise exception 'Revisá el valor: {"alta": true} o {"alta": false}.' using errcode = 'P0001';
  end if;
  insert into public.app_config(key, value, updated_at) values (p_key, p_value, now())
    on conflict (key) do update set value = excluded.value, updated_at = now();
  perform public.admin_log('config', p_key, p_value);
end $$;
revoke all on function public.admin_set_config(text, jsonb) from public, anon;
grant execute on function public.admin_set_config(text, jsonb) to authenticated;


-- ===== Canónicas: el mail de vencimiento (función vence-plan) =====

-- Coaches: como hoy (las de compras-apple.sql), 24 horas antes, una vez por vencimiento; sin la
-- cortesía, la suscripción de Mercado Pago activa ni la de Apple que se renueva sola. Además, fuera:
-- los dueños de un gimnasio abierto (van abajo) y los profes sin cargo (sin vínculos propios: su plan
-- no cubre a nadie). clientes = recount_seats (sus vínculos propios; sin gimnasios, el count(*) de hoy).
-- Dueños: a 7, 3 y 1 día, una vez por vencimiento y anticipación (gym_avisos_vence), con el
-- gimnasio, sus socios (fichas activas y pausadas) y la administración del gimnasio en copia. Dos
-- llamadas a la vez no repiten (cada fila se marca al tomarla).
-- Columnas nuevas: gym_id, gimnasio, socios, dias (el escalón del aviso: 7, 3 o 1; 1 para los
-- coaches; solo para no repetir), copia (cuentas en copia) y faltan (los días que faltan de verdad,
-- en días de Argentina: 0 es hoy, 1 mañana; con esto se escribe el mail).
create or replace function public.hay_avisos_vence()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from public.coach_billing b
     where b.plan <> 'cortesia' and coalesce(b.mp_status, '') <> 'authorized' and not b.apple_renueva
       and public.coach_vence(b) > now() and public.coach_vence(b) <= now() + interval '24 hours'
       and b.aviso_vence_para is distinct from public.coach_vence(b)
       and public.gym_de_dueno(b.coach_id) is null and not public.gym_profe_sin_cargo(b.coach_id))
  or exists (
    select 1 from public.gyms x join public.coach_billing b on b.coach_id = x.owner_id
      left join public.gym_avisos_vence a on a.gym_id = x.id
     where x.closed_at is null and b.plan <> 'cortesia' and coalesce(b.mp_status, '') <> 'authorized' and not b.apple_renueva
       and public.coach_vence(b) > now() and public.coach_vence(b) <= now() + interval '7 days'
       and (a.para is distinct from public.coach_vence(b)
            or coalesce(a.dias, 99) > (case when public.coach_vence(b) <= now() + interval '1 day' then 1
                                                        when public.coach_vence(b) <= now() + interval '3 days' then 3 else 7 end)));
end $$;
revoke all on function public.hay_avisos_vence() from public, anon, authenticated;

drop function if exists public.tomar_avisos_vence();
create or replace function public.tomar_avisos_vence()
returns table (coach_id uuid, vence timestamptz, prueba boolean, clientes integer,
  gym_id uuid, gimnasio text, socios integer, dias integer, copia uuid[], faltan integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.coach_billing b
     set aviso_vence_para = public.coach_vence(b)
   where b.plan <> 'cortesia' and coalesce(b.mp_status, '') <> 'authorized' and not b.apple_renueva
     and public.coach_vence(b) > now() and public.coach_vence(b) <= now() + interval '24 hours'
     and b.aviso_vence_para is distinct from public.coach_vence(b)
     and public.gym_de_dueno(b.coach_id) is null and not public.gym_profe_sin_cargo(b.coach_id)
  returning b.coach_id, b.aviso_vence_para, (b.paid_until is null or b.trial_ends_at >= b.paid_until),
            public.recount_seats(b.coach_id), null::uuid, null::text, null::integer, 1, null::uuid[],
            ((b.aviso_vence_para at time zone 'America/Argentina/Buenos_Aires')::date - public.gym_hoy())::int;
  -- Dos a la vez: la segunda espera en el on conflict y su where ya ve el aviso de la primera.
  return query
  with d as (
    select x.id as g, b.coach_id as c, public.coach_vence(b) as v, (b.paid_until is null or b.trial_ends_at >= b.paid_until) as pr,
           (case when public.coach_vence(b) <= now() + interval '1 day' then 1
                 when public.coach_vence(b) <= now() + interval '3 days' then 3 else 7 end) as nivel
      from public.gyms x join public.coach_billing b on b.coach_id = x.owner_id
     where x.closed_at is null and b.plan <> 'cortesia' and coalesce(b.mp_status, '') <> 'authorized' and not b.apple_renueva
       and public.coach_vence(b) > now() and public.coach_vence(b) <= now() + interval '7 days'
  ), t as (
    insert into public.gym_avisos_vence as a (gym_id, para, dias)
    select d.g, d.v, d.nivel from d
     where not exists (select 1 from public.gym_avisos_vence y where y.gym_id = d.g and y.para is not distinct from d.v and y.dias <= d.nivel)
    on conflict on constraint gym_avisos_vence_pkey do update set para = excluded.para, dias = excluded.dias
     where a.para is distinct from excluded.para or a.dias > excluded.dias
    returning a.gym_id as g, a.para as v, a.dias as nivel
  )
  select d.c, t.v, d.pr, public.recount_seats(d.c), t.g, x.name,
         (select count(*)::int from public.gym_members m where m.gym_id = t.g and m.status in ('activo', 'pausado')), t.nivel::int,
         coalesce((select array_agg(s.user_id order by s.user_id) from public.gym_staff s
                    where s.gym_id = t.g and s.left_at is null and s.role = 'admin'), '{}'::uuid[]),
         ((t.v at time zone 'America/Argentina/Buenos_Aires')::date - public.gym_hoy())::int
    from t join d on d.g = t.g join public.gyms x on x.id = t.g;
end $$;
revoke all on function public.tomar_avisos_vence() from public, anon, authenticated;
grant execute on function public.tomar_avisos_vence() to service_role;

-- El mail no salió: se desmarca para que se reintente (también el aviso del gimnasio del dueño).
create or replace function public.soltar_aviso_vence(cid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.coach_billing set aviso_vence_para = null where coach_id = cid;
  delete from public.gym_avisos_vence a using public.gyms x where x.id = a.gym_id and x.owner_id = cid and x.closed_at is null;
end $$;
revoke all on function public.soltar_aviso_vence(uuid) from public, anon, authenticated;
grant execute on function public.soltar_aviso_vence(uuid) to service_role;

notify pgrst, 'reload schema';


-- ===== Para volver atrás =====
-- Correr esto sin los «-- » (antes que el bloque de gimnasios-socios.sql). Saca las funciones del
-- admin de gimnasios y la tabla gym_avisos_vence, y vuelve a poner, tal cual, las versiones de hoy de
-- admin_coaches y admin_overview (cuentas-prueba.sql), admin_set_config (admin.sql),
-- hay_avisos_vence y tomar_avisos_vence (compras-apple.sql) y soltar_aviso_vence
-- (aviso-vencimiento.sql). Antes, volver a publicar la función vence-plan de hoy.
--
-- drop function if exists public.admin_gym_auditoria(uuid), public.admin_gym_profes_extra(uuid, integer), public.admin_gym_cerrar(uuid),
--   public.admin_gym_transferir(uuid, uuid), public.admin_gym_convertir(uuid, uuid[], text), public.admin_gym_detail(uuid),
--   public.admin_gyms(), public.admin_gym_fila(uuid);
-- drop function if exists public.admin_coaches();
-- create or replace function public.admin_coaches()
-- returns table (id uuid, full_name text, email text, plan text, max_clients int, clients bigint, trial_ends_at timestamptz,
--   paid_until timestamptz, mp_status text, has_mp boolean, pending_plan text, active boolean, price numeric, is_test boolean)
-- language plpgsql stable security definer set search_path = public, auth as $$
-- begin
--   perform public.admin_assert();
--   return query
--     select p.id, p.full_name, u.email::text, b.plan, b.max_clients,
--            (select count(*) from public.profiles x where x.coach_id = p.id), b.trial_ends_at, b.paid_until, b.mp_status,
--            b.mp_preapproval_id is not null, b.pending_plan, public.coach_active(p.id), public.plan_price(b.plan),
--            exists (select 1 from public.test_accounts t where t.user_id = p.id)
--       from public.profiles p join auth.users u on u.id = p.id left join public.coach_billing b on b.coach_id = p.id
--      where p.role = 'coach'
--      order by exists (select 1 from public.test_accounts t where t.user_id = p.id),
--               public.coach_active(p.id) desc, (select count(*) from public.profiles x where x.coach_id = p.id) desc
--      limit 300;
-- end $$;
-- revoke execute on function public.admin_coaches() from public, anon;
-- grant execute on function public.admin_coaches() to authenticated;
-- create or replace function public.admin_set_config(p_key text, p_value jsonb)
-- returns void language plpgsql security definer set search_path = public as $$
-- begin
--   perform public.admin_assert();
--   if p_key not in ('version') then raise exception 'Clave inválida.'; end if;
--   insert into public.app_config(key, value, updated_at) values (p_key, p_value, now())
--     on conflict (key) do update set value = excluded.value, updated_at = now();
--   perform public.admin_log('config', p_key, p_value);
-- end $$;
-- revoke execute on function public.admin_set_config(text, jsonb) from public, anon;
-- grant execute on function public.admin_set_config(text, jsonb) to authenticated;
-- create or replace function public.admin_overview()
-- returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
-- declare out jsonb;
-- begin
--   perform public.admin_assert();
--   with act as (
--     select client_id as uid from public.sessions where created_at > now() - interval '7 days'
--     union select client_id from public.food_entries where log_date >= current_date - 7
--     union select client_id from public.daily_logs where log_date >= current_date - 7
--     union select id from public.profiles where last_seen_at > now() - interval '7 days'
--   ), us as (
--     select * from auth.users u where not exists (select 1 from public.test_accounts t where t.user_id = u.id)
--   ), pr as (
--     select * from public.profiles p where not exists (select 1 from public.test_accounts t where t.user_id = p.id)
--   ), cb as (
--     select * from public.coach_billing b where not exists (select 1 from public.test_accounts t where t.user_id = b.coach_id)
--   ), se as (
--     select * from public.sessions s where not exists (select 1 from public.test_accounts t where t.user_id = s.client_id)
--   ), paid as (
--     select * from cb where plan in ('p10','p25','p50','p100','p250','p500') and coalesce(paid_until, '-infinity') > now()
--   )
--   select jsonb_build_object(
--     'users',     (select count(*) from us),
--     'coaches',   (select count(*) from pr where role = 'coach'),
--     'clients',   (select count(*) from pr where coalesce(role, 'client') = 'client'),
--     'linked',    (select count(*) from pr where coalesce(role, 'client') = 'client' and coach_id is not null),
--     'new7',      (select count(*) from us where created_at > now() - interval '7 days'),
--     'new30',     (select count(*) from us where created_at > now() - interval '30 days'),
--     'active7',   (select count(distinct uid) from act where not exists (select 1 from public.test_accounts t where t.user_id = act.uid)),
--     'sessions7', (select count(*) from se where created_at > now() - interval '7 days'),
--     'paid',      (select count(*) from paid),
--     'mrr',       (select coalesce(sum(public.plan_price(plan)), 0) from paid),
--     'trial',     (select count(*) from cb where plan = 'trial' and trial_ends_at > now()),
--     'courtesy',  (select count(*) from cb where plan = 'cortesia'),
--     'overdue',   (select count(*) from cb where plan not in ('cortesia') and trial_ends_at <= now() and coalesce(paid_until, '-infinity') <= now()),
--     'products',  (select count(*) from public.products where not hidden),
--     'pending',   (select count(*) from public.products where not hidden and ((source = 'user' and not verified) or reports > 0)),
--     'signups',   (select coalesce(jsonb_agg(jsonb_build_object('w', w, 'n', n) order by w), '[]') from (
--                     select to_char(g.w, 'YYYY-MM-DD') as w, (select count(*) from us u where u.created_at >= g.w and u.created_at < g.w + interval '7 days') as n
--                       from generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') g(w)) s),
--     'training',  (select coalesce(jsonb_agg(jsonb_build_object('w', w, 'n', n) order by w), '[]') from (
--                     select to_char(g.w, 'YYYY-MM-DD') as w, (select count(*) from se s where s.created_at >= g.w and s.created_at < g.w + interval '7 days') as n
--                       from generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') g(w)) s),
--     'versions',  (select coalesce(jsonb_agg(jsonb_build_object('platform', app_platform, 'version', app_version, 'n', n) order by n desc), '[]') from (
--                     select coalesce(app_platform, '?') as app_platform, coalesce(app_version, '?') as app_version, count(*) as n
--                       from pr where last_seen_at > now() - interval '30 days' group by 1, 2) v)
--   ) into out;
--   return out;
-- end $$;
-- revoke execute on function public.admin_overview() from public, anon;
-- grant execute on function public.admin_overview() to authenticated;
-- create or replace function public.hay_avisos_vence()
-- returns boolean language sql stable security definer set search_path = public as $$
--   select exists (
--     select 1 from public.coach_billing b
--      where b.plan <> 'cortesia' and coalesce(b.mp_status, '') <> 'authorized' and not b.apple_renueva
--        and public.coach_vence(b) > now() and public.coach_vence(b) <= now() + interval '24 hours'
--        and b.aviso_vence_para is distinct from public.coach_vence(b));
-- $$;
-- drop function if exists public.tomar_avisos_vence();
-- create or replace function public.tomar_avisos_vence()
-- returns table (coach_id uuid, vence timestamptz, prueba boolean, clientes integer)
-- language plpgsql security definer set search_path = public as $$
-- begin
--   return query
--   update public.coach_billing b
--      set aviso_vence_para = public.coach_vence(b)
--    where b.plan <> 'cortesia' and coalesce(b.mp_status, '') <> 'authorized' and not b.apple_renueva
--      and public.coach_vence(b) > now() and public.coach_vence(b) <= now() + interval '24 hours'
--      and b.aviso_vence_para is distinct from public.coach_vence(b)
--   returning b.coach_id, b.aviso_vence_para, (b.paid_until is null or b.trial_ends_at >= b.paid_until),
--             (select count(*)::int from public.profiles x where x.coach_id = b.coach_id);
-- end $$;
-- revoke execute on function public.hay_avisos_vence() from public, anon, authenticated;
-- revoke execute on function public.tomar_avisos_vence() from public, anon, authenticated;
-- grant execute on function public.tomar_avisos_vence() to service_role;
-- drop function if exists public.soltar_aviso_vence(uuid);
-- create or replace function public.soltar_aviso_vence(cid uuid)
-- returns void language sql security definer set search_path = public as $$
--   update public.coach_billing set aviso_vence_para = null where coach_id = cid;
-- $$;
-- revoke execute on function public.soltar_aviso_vence(uuid) from public, anon, authenticated;
-- grant execute on function public.soltar_aviso_vence(uuid) to service_role;
-- drop function if exists public.gym_profe_sin_cargo(uuid);
-- drop table if exists public.gym_avisos_vence;
-- notify pgrst, 'reload schema';
