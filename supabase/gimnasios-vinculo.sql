-- Gimnasios: el vínculo de cada persona con su coach, ahora también dentro de un gimnasio.
-- Correr con el workflow "Supabase" → tarea sql → supabase/gimnasios-vinculo.sql, después de
-- supabase/gimnasios.sql. Se puede correr varias veces. Sin gimnasios.sql falla entero, sin cambiar
-- nada (lo primero del archivo lo controla).
-- OJO: canónico. Acá están las versiones vigentes de coach_active, is_my_client, join_coach,
-- release_lapsed_clients, coach_client_ok y profiles_gym_sync, y desde la etapa 1 también de
-- routine_schedule_on_coach_change, admin_set_role, admin_unlink y de las políticas «billing: el
-- coach ve la suya» (coach_billing), «mensajes: el coach ve los suyos» (coach_messages) y
-- «chat-audio: escuchar en mi conversación» (storage). Las versiones viejas están en base.sql,
-- endurecer-base.sql, suscripciones.sql, cupo-plan.sql, coach-alumnos.sql, bloqueos.sql,
-- coach-vencido.sql, rutina-programada.sql, admin.sql, notificaciones.sql y chat.sql: si se vuelve a
-- correr cualquiera de esos, correr después gimnasios.sql, este, gimnasios-lectura.sql y
-- gimnasios-socios.sql.
-- join_coach ahora devuelve json (abajo): con este archivo aplicado, los archivos viejos que la
-- definen con boolean (base, endurecer-base, suscripciones, coach-alumnos y bloqueos) fallan
-- enteros sin cambiar nada, a propósito, así no pisan la vigente sin querer. Para correr uno igual:
-- primero el bloque «Para volver atrás» del final, después ese archivo, gimnasios.sql y este.
--
-- SIN GIMNASIOS TODO SIGUE IGUAL: sin filas en gyms, gym_staff y gym_members, cada función da el
-- mismo resultado que la de hoy (lo prueba tests/gimnasios-igual.test.mjs con datos al azar contra
-- las versiones de hoy, que están copiadas al final). Lo único distinto sin gimnasios es quién puede
-- llamar a coach_active desde afuera (abajo), y la app no la llama. Qué cambia cuando hay gimnasios:
--
--   coach_active(cid): el dueño de un gimnasio abierto tiene el plan del gimnasio (gym_active: con
--     5 días de gracia y sin corte por cupo). Para cualquier otro coach, la regla de cupo-plan.sql,
--     con el cupo cacheado (seats_used, que solo cuenta sus vínculos propios) en lugar del count(*).
--     Pasa a ser solo del service role (la app no la llama; el bloque para volver atrás devuelve
--     el permiso de hoy).
--   is_my_client(target) y coach_client_ok(coach, client): decide la relación. Si el socio lo atiende
--     un profe de su gimnasio (vinculo_gym), vale el plan del gimnasio; si no (alumno propio, o socio
--     con un coach de afuera), el plan del coach, como hoy. coach_client_ok es la misma con el coach
--     explícito, para rapid-worker y avisos-coach (etapa 1); no la puede llamar la app.
--   release_lapsed_clients(): solo suelta vínculos propios, y no toca a los dueños de un gimnasio
--     abierto (sus alumnos siguen el calendario del gimnasio: 10 días, etapa 1). Recuenta el cupo
--     una vez al final (gize.gym_bulk), y recién ahí bloquea las filas de coach_billing.
--   profiles_gym_sync (trigger): cuando cambia el coach de alguien, el profe de cada una de sus
--     fichas (menos las solicitudes) vuelve a salir de gym_profe_ficha: su coach si la ficha está
--     activa o pausada y ese coach es del equipo del gimnasio; si no, vacío. Así el profe que dejó
--     de atender a un socio (desvincularse, bloqueo, el coach lo saca), también con la ficha en
--     baja, deja de ver su ficha. Los avisos al dueño llegan en la etapa 1.
--   join_coach(code): los pasos de hoy (bloqueos.sql) con estos agregados:
--     · Quien es del equipo de un gimnasio (recepción, administración que no es coach) no se vincula
--       con ningún código.
--     · El código del gimnasio (gym_codes) pide sumarse: guarda una solicitud (ficha «pendiente», sin
--       la hoja aceptada y sin compartir nada; no cambia su coach ni ocupa lugar) y responde con un
--       mensaje propio que las apps viejas muestran tal cual. Un raise desharía la solicitud: por
--       eso no sale con raise sino con status 400 (response.status, PostgREST) y el cuerpo de un
--       error P0001 ({"code":"P0001","message":…}), que supabase-js arma como error. Por eso devuelve
--       json: true y false llegan igual que el boolean de antes.
--     · Socio con profe del gimnasio: no cambia de coach con un código («Ya tenés profe en …»).
--     · Socio sin profe (o con un coach de afuera) que pone el código de alguien del equipo de su
--       gimnasio: esa persona pasa a ser su profe en el gimnasio (plan del gimnasio, sin mirar el
--       cupo: la ficha ya cuenta).
--     · El código de un profe del gimnasio sin plan propio vigente manda a pedir el del gimnasio.
--     · El cupo se cuenta con recount_seats (con el dueño de un gimnasio: fichas más alumnos
--       propios). Bloquea primero el perfil y después las filas de coach_billing del coach nuevo y
--       del anterior, en orden de coach_id: el mismo orden que los demás caminos (desvincularse,
--       el cron, los triggers del cupo), así dos cambios cruzados no se trancan.
--     · El pedido lo hace gym_pedir (abajo, el mismo de gym_unirse): se une solo a una ficha sin app
--       si el mail verificado coincide con exactamente una, y entra directo con «Aprobar solas»
--       («Listo: ya sos socio de …»).
--   Los mensajes no hablan del plan ni mandan a renovar o ampliar (los filtran las apps, core/tienda.js).
--
-- Etapa 1 (lo que la etapa 0 dejó del paso 2 de §6.7; sin gimnasios tampoco cambia nada, salvo los
-- audios: el alumno escucha los de sus conversaciones viejas, ver abajo):
--   · Avisos y auditoría: gym_alerta, gym_alerta_staff (anotan en gym_alerts, que manda avisos-gym
--     desde la etapa 2) y gym_auditar. profiles_gym_sync anota «socio sin profe» y «eligió profe con
--     su código» (salvo en las operaciones masivas, que anotan un resumen).
--   · routine_schedule_on_coach_change: no borra las rutinas programadas con gize.gym_keep_routines.
--   · Internas compartidas: gym_cupo_ok (cupo exacto, bloqueando coach_billing al final),
--     gym_profe_no_puede, gym_aprobar_interno, gym_pedir, gym_cerrar_interno y gym_cerrar_por_baja.
--     Están acá y no en gimnasios-socios.sql porque las usan join_coach y el borrado de la cuenta,
--     que no pueden depender de un archivo que se corre después.
--   · before delete en profiles (profiles_gym_baja): el dueño que borra su cuenta cierra el gimnasio
--     (90 días y se borra); alguien del equipo deja a sus socios sin profe. El borrado nunca falla.
--   · admin_set_role y admin_unlink: no pasan a alumno al dueño ni a un profe del gimnasio, ni
--     desvinculan a un socio que atiende un profe de su gimnasio.
--   · coach_billing: la fila del profe sin vínculos propios y solo de prueba no la ve él (apps viejas).
--   · Chat: el profe que deja de atender a un socio no lee lo que se mandaron en el gimnasio
--     (coach_messages.gym_id), y el socio escucha todos sus audios aunque cambie de profe.


-- ===== Antes que nada: ¿está gimnasios.sql? =====

-- Los cuerpos plpgsql no se revisan al crearlos: sin gimnasios.sql (o con su bloque «Para volver
-- atrás» ya corrido), este archivo se aplicaría sin error y después fallaría cada lectura del coach,
-- cada vínculo y cada desvínculo. Se frena acá, sin cambiar nada.
do $$ begin
  if to_regclass('public.gyms') is null or to_regclass('public.gym_staff') is null or to_regclass('public.gym_members') is null
     or to_regclass('public.gym_codes') is null or to_regclass('public.gym_audit') is null
     or to_regprocedure('public.vinculo_gym(uuid)') is null or to_regprocedure('public.gym_de_dueno(uuid)') is null
     or to_regprocedure('public.gym_active(uuid)') is null or to_regprocedure('public.recount_seats(uuid)') is null
     or to_regprocedure('public.gym_recontar(uuid[])') is null or to_regprocedure('public.gym_profe_ficha(uuid, uuid, text)') is null
     or not exists (select 1 from pg_attribute where attrelid = 'public.coach_billing'::regclass and attname = 'seats_used' and not attisdropped) then
    raise exception 'Primero correr supabase/gimnasios.sql: este archivo usa sus tablas y funciones.';
  end if;
  if to_regprocedure('public.bloqueo_entre(uuid, uuid)') is null then
    raise exception 'Primero correr supabase/bloqueos.sql: join_coach usa bloqueo_entre.';
  end if;
  if to_regprocedure('public.chat_folder_mine(text, text)') is null or to_regprocedure('public.admin_assert()') is null
     or to_regclass('public.routine_schedule') is null
     or not exists (select 1 from pg_attribute where attrelid = 'public.coach_billing'::regclass and attname = 'apple_original_tx' and not attisdropped) then
    raise exception 'Primero correr supabase/chat.sql, admin.sql, rutina-programada.sql y compras-apple.sql: este archivo cambia sus políticas y funciones.';
  end if;
end $$;


-- ===== Plan y cupo del coach =====

-- Las tres son plpgsql (las de hoy, sql): en plpgsql cada consulta se planifica una vez por conexión,
-- y las políticas llaman a is_my_client fila por fila (ver gimnasios.sql, «Funciones de permiso»).
create or replace function public.coach_active(cid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare g uuid := public.gym_de_dueno(cid);
begin
  if g is not null then return public.gym_active(g); end if;
  return exists (
    select 1 from public.coach_billing b
     where b.coach_id = cid
       and (b.plan = 'cortesia'
            or ((b.trial_ends_at > now() or coalesce(b.paid_until, '-infinity') > now())
                and b.seats_used <= coalesce(b.max_clients, 10))));
end $$;
-- Solo el service role (avisos-coach y notificar-cliente). La app no la llama y ninguna política la
-- usa directo (is_my_client y join_coach la llaman como security definer): con sesión, cualquiera
-- podía preguntar por cualquier uuid, y para la dueña de un gimnasio da el estado del plan del
-- gimnasio, que el equipo y los socios no tienen que ver (§1.2). El bloque para volver atrás
-- devuelve el permiso de hoy.
revoke execute on function public.coach_active(uuid) from public, anon, authenticated;
grant  execute on function public.coach_active(uuid) to service_role;


-- ===== ¿Es mi alumno o mi socio? =====

-- La misma regla que is_my_client con el coach explícito. Interna: la usan las funciones de
-- mensajes y avisos con el service role (etapa 1).
create or replace function public.coach_client_ok(coach uuid, client uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare g uuid;
begin
  if coach is null or not exists (select 1 from public.profiles p where p.id = client and p.coach_id = coach) then
    return false;
  end if;
  g := public.vinculo_gym(client);
  if g is not null then return public.gym_active(g); end if;   -- lo atiende como profe de su gimnasio
  return public.coach_active(coach);                            -- alumno propio o coach de afuera: como hoy
end $$;
revoke all on function public.coach_client_ok(uuid, uuid) from public, anon, authenticated;
grant execute on function public.coach_client_ok(uuid, uuid) to service_role;

-- La usan casi todas las políticas del lado del coach (leer registros, editar rutina, fotos…).
-- create or replace conserva los permisos que tenía.
create or replace function public.is_my_client(target uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return public.coach_client_ok(auth.uid(), target);
end $$;


-- ===== El profe de la ficha sigue al coach =====

-- Todas las fichas de la persona menos las solicitudes (que no tienen profe): también las de baja y
-- las visitas, que quedan sin profe (gym_profe_ficha), así una ficha en baja que todavía tenía al
-- profe de antes deja de verla ese profe cuando la persona se desvincula.
-- Desde la etapa 1, además, los avisos al dueño y la administración: «socio sin profe» (se desvinculó en
-- Ajustes, el profe lo dejó, lo bloqueó) y «eligió profe con su código». Con gize.gym_bulk (las
-- operaciones masivas) no anota nada por fila: la operación anota su resumen. Las fichas se
-- bloquean después del perfil (que ya bloqueó el update que dispara esto): el orden de siempre.
create or replace function public.profiles_gym_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare f record; t uuid; hoy text := to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD');
        bulk boolean := coalesce(current_setting('gize.gym_bulk', true), '') = 'on';
begin
  for f in select m.id, m.gym_id, m.status, m.trainer_id from public.gym_members m
            where m.member_id = new.id and m.status <> 'pendiente' order by m.id for update loop
    t := public.gym_profe_ficha(f.gym_id, new.id, f.status);
    continue when f.trainer_id is not distinct from t;
    update public.gym_members set trainer_id = t where id = f.id;
    if not bulk and f.status in ('activo', 'pausado') then
      if t is null then
        perform public.gym_alerta_staff(f.gym_id, 'socio_sin_profe', f.id || ':' || hoy, jsonb_build_object('ficha', f.id));
      elsif f.trainer_id is null then
        perform public.gym_alerta_staff(f.gym_id, 'profe_por_codigo', f.id || ':' || hoy, jsonb_build_object('ficha', f.id, 'profe', t));
      end if;
    end if;
  end loop;
  return null;
end $$;
revoke all on function public.profiles_gym_sync() from public, anon, authenticated;
drop trigger if exists profiles_gym_sync on public.profiles;
create trigger profiles_gym_sync after update of coach_id on public.profiles
  for each row when (old.coach_id is distinct from new.coach_id) execute function public.profiles_gym_sync();


-- ===== Vincularse con un código (versión vigente de join_coach) =====

-- Cambia el tipo (boolean → json): hay que borrar la anterior. Solo la primera vez.
do $$ begin
  if exists (select 1 from pg_proc where oid = to_regprocedure('public.join_coach(text)') and prorettype = 'boolean'::regtype) then
    drop function public.join_coach(text);
  end if;
end $$;

create or replace function public.join_coach(code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare cid uuid; lim int; n int; me uuid := auth.uid();
        g_id uuid; g_nom text; f_gym uuid; f_est text; f_nom text; r jsonb; v uuid; s_gym uuid; s_nom text;
begin
  if me is null then return to_json(false); end if;
  -- Un coach no se vincula a otro coach: el otro vería y editaría su rutina.
  if exists (select 1 from profiles where id = me and role = 'coach') then return to_json(false); end if;
  -- El equipo de un gimnasio (recepción, administración) no se vincula ni se suma como socio.
  if exists (select 1 from gym_staff where user_id = me and left_at is null) then
    raise exception 'Las cuentas del equipo de un gimnasio no se pueden vincular con un código.' using errcode = 'P0001';
  end if;
  -- De a un intento por persona: varios a la vez no se saltean el tope.
  perform pg_advisory_xact_lock(hashtext('join_coach'), hashtext(me::text));
  delete from join_code_attempts where user_id = me and created_at < now() - interval '1 day';
  if (select count(*) from join_code_attempts where user_id = me) >= 20
     or (select count(*) from join_code_attempts where user_id = me and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Probaste muchos códigos que no existen. Revisalo con tu coach y volvé a intentar en un rato.' using errcode = 'P0001';
  end if;
  select id into cid from profiles where invite_code = upper(trim(code)) and role = 'coach';
  if cid is null then
    -- ¿Es el código de un gimnasio abierto? Entonces pide sumarse (no cuenta como equivocado).
    select x.id, x.name into g_id, g_nom
      from gym_codes k join gyms x on x.id = k.gym_id
     where k.code = upper(trim(join_coach.code)) and k.kind = 'gym' and k.revoked_at is null and x.closed_at is null;
    if g_id is not null then
      -- Un gimnasio por persona: la ficha que tenga (que no sea baja), en este o en otro.
      select m.gym_id, m.status, x.name into f_gym, f_est, f_nom
        from gym_members m join gyms x on x.id = m.gym_id
       where m.member_id = me and m.status <> 'baja';
      if f_gym = g_id and f_est = 'pendiente' then
        perform set_config('response.status', '400', true);
        return json_build_object('code', 'P0001', 'message', 'Listo: le pediste a ' || g_nom || ' que te sume. Cuando te acepten vas a ver a tu profe acá.');
      elsif f_gym = g_id then
        raise exception 'Ya sos socio de %.', g_nom using errcode = 'P0001';
      elsif f_est = 'pendiente' then
        raise exception 'Ya pediste sumarte a %: primero cancelá el pedido desde Ajustes.', f_nom using errcode = 'P0001';
      elsif f_gym is not null then
        raise exception 'Ya sos socio de %: primero salí desde Ajustes.', f_nom using errcode = 'P0001';
      end if;
      -- El pedido (gym_pedir, el mismo de gym_unirse): sin la hoja aceptada (terms_at) y sin compartir
      -- nada; el coach no cambia. Se une sola a su ficha si el mail verificado coincide con una sin
      -- app, y entra directo si el gimnasio aprueba solo. Tope: 30 pedidos por gimnasio en 24 horas.
      r := public.gym_pedir(me, g_id, 'join_coach', null, false, null);
      -- Sale como error (status 400, cuerpo P0001) sin raise: un raise desharía la solicitud.
      perform set_config('response.status', '400', true);
      if r->>'estado' = 'pendiente' then
        return json_build_object('code', 'P0001', 'message', 'Listo: le pediste a ' || g_nom || ' que te sume. Cuando te acepten vas a ver a tu profe acá.');
      end if;
      return json_build_object('code', 'P0001', 'message', 'Listo: ya sos socio de ' || g_nom || '.');
    end if;
    -- Queda anotado: sale con return, no con raise (que desharía el insert).
    insert into join_code_attempts (user_id) values (me);
    return to_json(false);
  end if;
  if cid = me then return to_json(false); end if;
  -- Uno bloqueó al otro (bloqueos.sql): no se vinculan.
  if public.bloqueo_entre(me, cid) then
    raise exception 'No podés sumarte con este código.' using errcode = 'P0001';
  end if;
  if exists (select 1 from profiles where id = me and coach_id = cid) then return to_json(true); end if;
  -- Gimnasios (sin filas de gimnasio, nada de esto aplica).
  -- a) Socio con profe del gimnasio: para cambiar, primero deja a su profe.
  v := public.vinculo_gym(me);
  if v is not null then
    raise exception 'Ya tenés profe en %. Para cambiar, primero dejá a tu profe en Ajustes → Tu gimnasio.', (select name from gyms where id = v) using errcode = 'P0001';
  end if;
  -- b) Socio sin profe (o con un coach de afuera) y el código es de alguien del equipo de su
  --    gimnasio: pasa a ser su profe en el gimnasio. Sin mirar el cupo: la ficha ya cuenta.
  select m.gym_id into f_gym from gym_members m where m.member_id = me and m.status in ('activo', 'pausado');
  if f_gym is not null and exists (select 1 from gym_staff s where s.gym_id = f_gym and s.user_id = cid and s.left_at is null
                                                              and s.role in ('owner', 'admin', 'profe')) then
    if not public.gym_active(f_gym) then
      raise exception 'Por ahora el gimnasio no puede asignarte profe. Consultá en recepción.' using errcode = 'P0001';
    end if;
    perform 1 from profiles where id = me for update;   -- primero el perfil, después coach_billing
    perform 1 from coach_billing where coach_id in (cid, (select coach_id from profiles where id = me)) order by coach_id for update;
    update profiles set coach_id = cid where id = me;   -- profiles_gym_sync pone el profe en la ficha
    insert into gym_audit (gym_id, actor_id, action, gym_member_id, target_user)
    select f_gym, me, 'profe_por_codigo', m.id, cid from gym_members m where m.member_id = me and m.gym_id = f_gym and m.status in ('activo', 'pausado');
    return to_json(true);
  end if;
  -- c) El código es de un profe (o admin) de un gimnasio, sin plan propio vigente: que pida el del gimnasio.
  select s.gym_id, x.name into s_gym, s_nom
    from gym_staff s join gyms x on x.id = s.gym_id
   where s.user_id = cid and s.left_at is null and s.role in ('admin', 'profe') and x.closed_at is null;
  if s_gym is not null and not public.coach_active(cid) then
    raise exception 'Ese código es de un profe de %. Para sumarte al gimnasio, pedí en recepción el código del gimnasio.', s_nom using errcode = 'P0001';
  end if;
  if not public.coach_active(cid) then
    raise exception 'Tu coach tiene el plan de GIZE vencido: por ahora no puede sumar alumnos. Avisale y volvé a intentar.' using errcode = 'P0001';
  end if;
  -- Bloquea la fila del coach: dos clientes a la vez no pasan el cupo.
  -- (Antes, el perfil, como los demás caminos que cambian un vínculo; y con la del coach la del coach
  -- anterior, en orden de coach_id: los triggers del cupo la actualizan.)
  perform 1 from profiles where id = me for update;
  perform 1 from coach_billing where coach_id in (cid, (select coach_id from profiles where id = me)) order by coach_id for update;
  select max_clients into lim from coach_billing where coach_id = cid for update;
  n := public.recount_seats(cid);
  if n >= coalesce(lim, 10) then
    raise exception 'Tu coach llegó al máximo de alumnos: por ahora no puede sumar más. Avisale y volvé a intentar.' using errcode = 'P0001';
  end if;
  update profiles set coach_id = cid where id = me;
  return to_json(true);
end $$;
revoke execute on function public.join_coach(text) from public, anon;
grant  execute on function public.join_coach(text) to authenticated;


-- ===== Coach con el plan vencido: a los 4 días sus alumnos propios quedan sin coach =====

-- La de coach-vencido.sql, solo con vínculos propios (vinculo_gym null) y sin los dueños de un
-- gimnasio abierto. Recuenta el cupo una vez al final, con la marca gize.gym_bulk; las filas de
-- coach_billing las bloquea ese recuento, después de los perfiles (como todos los caminos: si las
-- bloqueara antes, se trancaría con un alumno que se desvincula en Ajustes a la misma hora). La tarea
-- de cron no cambia.
create or replace function public.release_lapsed_clients()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer; cs uuid[]; bulk text := current_setting('gize.gym_bulk', true);
begin
  select array_agg(b.coach_id order by b.coach_id) into cs
    from public.coach_billing b
   where b.plan <> 'cortesia'
     and greatest(b.trial_ends_at, coalesce(b.paid_until, '-infinity')) < now() - interval '4 days'
     and public.gym_de_dueno(b.coach_id) is null
     and exists (select 1 from public.profiles p
                  where p.coach_id = b.coach_id and coalesce(p.role, 'client') <> 'coach' and public.vinculo_gym(p.id) is null);
  if cs is null then return 0; end if;
  perform set_config('gize.gym_bulk', 'on', true);
  with released as (
    update public.profiles p
       set coach_id = null, coach_left_at = now()
     where p.coach_id = any(cs)
       and coalesce(p.role, 'client') <> 'coach'
       and public.vinculo_gym(p.id) is null
    returning p.id
  )
  select count(*) into n from released;
  perform set_config('gize.gym_bulk', coalesce(bulk, ''), true);
  perform public.gym_recontar(cs);
  return n;
end $$;
revoke execute on function public.release_lapsed_clients() from public, anon, authenticated;

-- ===== Etapa 1: avisos y auditoría del gimnasio =====

-- Los avisos se anotan en gym_alerts (uno por destinatario, tipo y motivo); nadie los manda hasta
-- avisos-gym (etapa 2). El panel cuenta en vivo (mi_gimnasio), no lee esta tabla.
create or replace function public.gym_alerta(g uuid, destino text, tipo text, clave text, canal text, datos jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if g is null or destino is null or clave is null then return; end if;
  insert into public.gym_alerts (gym_id, recipient, kind, key, channel, payload)
  values (g, destino, left(tipo, 60), left(clave, 200), canal, datos)
  on conflict (recipient, kind, key) do nothing;
end $$;
revoke all on function public.gym_alerta(uuid, text, text, text, text, jsonb) from public, anon, authenticated;

-- A la administración (dueño y administración activos), para el resumen del día.
create or replace function public.gym_alerta_staff(g uuid, tipo text, clave text, datos jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if g is null or clave is null then return; end if;
  insert into public.gym_alerts (gym_id, recipient, kind, key, channel, payload)
  select g, 'u:' || s.user_id, left(tipo, 60), left(clave, 200), 'resumen', datos
    from public.gym_staff s
   where s.gym_id = g and s.left_at is null and s.role in ('owner', 'admin')
  on conflict (recipient, kind, key) do nothing;
end $$;
revoke all on function public.gym_alerta_staff(uuid, text, text, jsonb) from public, anon, authenticated;

-- Quién cambió algo en el gimnasio: la persona real (auth.uid(); null si fue una tarea).
create or replace function public.gym_auditar(g uuid, accion text, ficha uuid, quien uuid, datos jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.gym_audit (gym_id, actor_id, action, gym_member_id, target_user, data)
  values (g, auth.uid(), left(accion, 60), ficha, quien, datos);
end $$;
revoke all on function public.gym_auditar(uuid, text, uuid, uuid, jsonb) from public, anon, authenticated;


-- ===== Etapa 1: rutinas programadas al cambiar de coach =====

-- La de rutina-programada.sql (borra las pendientes del coach anterior), salvo con la marca
-- gize.gym_keep_routines: la prenden gym_asignar_profe (que además se las pasa al profe nuevo),
-- release_lapsed_gyms y gym_restaurar, que no tienen que perder lo que el profe dejó programado.
create or replace function public.routine_schedule_on_coach_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.coach_id is distinct from old.coach_id
     and coalesce(current_setting('gize.gym_keep_routines', true), '') <> 'on' then
    delete from public.routine_schedule where client_id = new.id and applied_at is null;
  end if;
  return new;
end $$;
revoke execute on function public.routine_schedule_on_coach_change() from public, anon, authenticated;


-- ===== Etapa 1: cupo exacto, profe válido y aprobar una solicitud =====

-- Bloquea (en orden de coach_id, siempre al final: perfiles y fichas ya bloqueados) las filas de
-- coach_billing del dueño de g y de los coaches que la operación va a recontar, y dice si el
-- gimnasio tiene lugar para una ficha más (contado exacto, en otra sentencia, después del bloqueo).
create or replace function public.gym_cupo_ok(g uuid, otros uuid[])
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare dueno uuid; lim int; n int;
begin
  select x.owner_id into dueno from public.gyms x where x.id = g and x.closed_at is null;
  if dueno is null then return false; end if;
  perform 1 from public.coach_billing where coach_id = any(array[dueno] || coalesce(otros, '{}')) order by coach_id for update;
  select b.max_clients into lim from public.coach_billing b where b.coach_id = dueno;
  n := public.recount_seats(dueno);
  return n < coalesce(lim, 10);
end $$;
revoke all on function public.gym_cupo_ok(uuid, uuid[]) from public, anon, authenticated;

-- ¿Puede p atender (ser el profe) a la persona socio en g? Dueño, administración o profe activo con
-- cuenta de coach, sin bloqueo entre los dos. Devuelve el motivo si no (null = puede).
create or replace function public.gym_profe_no_puede(g uuid, p uuid, socio uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p is null then return null; end if;
  if not exists (select 1 from public.gym_staff s join public.profiles x on x.id = s.user_id
                  where s.gym_id = g and s.user_id = p and s.left_at is null and s.role in ('owner', 'admin', 'profe')
                    and x.role = 'coach') then
    return 'no_es_profe';
  end if;
  if socio is not null and public.bloqueo_entre(socio, p) then return 'bloqueo'; end if;
  return null;
end $$;
revoke all on function public.gym_profe_no_puede(uuid, uuid, uuid) from public, anon, authenticated;

-- Aprueba una solicitud pendiente (la comparten gym_aprobar y «aprobar solas»): ficha activa, con
-- cupo exacto. Si la persona no tiene coach y hay profe, ese profe pasa a ser su coach (y por eso su
-- profe en la ficha); si tiene un coach de afuera, lo conserva y la ficha queda sin profe.
-- Orden de bloqueo: perfil, ficha, coach_billing.
create or replace function public.gym_aprobar_interno(fid uuid, profe uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare f record; socio uuid; c uuid; motivo text;
begin
  select m.member_id into socio from public.gym_members m where m.id = fid;
  if socio is not null then perform 1 from public.profiles where id = socio for update; end if;
  select m.* into f from public.gym_members m where m.id = fid for update;
  if f.id is null or f.status <> 'pendiente' then
    raise exception 'Esa solicitud ya no está pendiente.' using errcode = 'P0001';
  end if;
  select p.coach_id into c from public.profiles p where p.id = f.member_id;
  if c is null and profe is not null then
    motivo := public.gym_profe_no_puede(f.gym_id, profe, f.member_id);
    if motivo = 'bloqueo' then raise exception 'No se le puede asignar ese profe.' using errcode = 'P0001'; end if;
    if motivo is not null then raise exception 'Esa persona no es profe del gimnasio.' using errcode = 'P0001'; end if;
    if not public.gym_active(f.gym_id) then raise exception 'Por ahora el gimnasio no puede asignar profe.' using errcode = 'P0001'; end if;
  end if;
  if not public.gym_cupo_ok(f.gym_id, array[c, profe]) then
    raise exception 'El gimnasio no puede sumar socios en este momento.' using errcode = 'P0001';
  end if;
  update public.gym_members set status = 'activo', approved_by = auth.uid(), joined_at = now() where id = fid;
  if c is null and profe is not null then
    update public.profiles set coach_id = profe where id = f.member_id;
  end if;
end $$;
revoke all on function public.gym_aprobar_interno(uuid, uuid) from public, anon, authenticated;

-- El pedido para sumarse a g (lo comparten join_coach y gym_unirse; quien llama ya controló que la
-- persona puede pedir). Tres caminos:
--   · se une sola a una ficha sin app del gimnasio si el mail VERIFICADO de la cuenta coincide con
--     exactamente una (toma su estado; sin profe hasta que el gimnasio le asigne);
--   · si no, una solicitud «pendiente» (sin profe, no ocupa lugar), con la hoja si la mandó;
--   · con «Aprobar solas» prendido, la solicitud entra como socio nuevo con el profe por defecto
--     (si el gimnasio no tiene lugar, queda pendiente).
-- Tope: 30 pedidos con el código por gimnasio en 24 horas (de a uno por gimnasio).
-- Devuelve {estado: 'pendiente'|'activo'|'unida', ficha}.
create or replace function public.gym_pedir(me uuid, g uuid, via text, hoja text, compartir boolean, compartir_v text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare mail text; ok_mail timestamptz; ids uuid[]; fid uuid; nom text; prof uuid; aprobar boolean;
begin
  select u.email, u.email_confirmed_at into mail, ok_mail from auth.users u where u.id = me;
  select x.name into nom from public.gyms x where x.id = g;
  if ok_mail is not null and coalesce(mail, '') <> '' then
    select array_agg(m.id) into ids from public.gym_members m
     where m.gym_id = g and m.member_id is null and m.status in ('activo', 'pausado') and lower(m.email) = lower(mail);
    if coalesce(array_length(ids, 1), 0) = 1 then
      perform 1 from public.profiles where id = me for update;
      update public.gym_members
         set member_id = me, terms_at = case when hoja is not null then now() end, terms_version = hoja,
             share_admin = coalesce(compartir, false) and hoja is not null,
             share_admin_at = case when coalesce(compartir, false) and hoja is not null then now() end,
             share_admin_version = case when coalesce(compartir, false) and hoja is not null then compartir_v end,
             invite_token_hash = null, invite_expires_at = null
       where id = ids[1];
      perform public.gym_auditar(g, 'union_por_mail', ids[1], me, jsonb_build_object('via', via));
      perform public.gym_alerta_staff(g, 'solicitud_unida', ids[1]::text, jsonb_build_object('ficha', ids[1]));
      return jsonb_build_object('estado', 'unida', 'ficha', ids[1]);
    end if;
  end if;
  perform pg_advisory_xact_lock(hashtext('gym_solicitud'), hashtext(g::text));
  if (select count(*) from public.gym_members where gym_id = g and source = 'codigo' and requested_at > now() - interval '24 hours') >= 30 then
    raise exception '% recibió muchos pedidos hoy. Probá de nuevo mañana.', nom using errcode = 'P0001';
  end if;
  insert into public.gym_members (gym_id, member_id, full_name, email, status, source, requested_at, created_by,
                                  terms_at, terms_version, share_admin, share_admin_at, share_admin_version)
  select g, me, left(coalesce(p.full_name, ''), 120), mail, 'pendiente', 'codigo', now(), me,
         case when hoja is not null then now() end, hoja, coalesce(compartir, false) and hoja is not null,
         case when coalesce(compartir, false) and hoja is not null then now() end,
         case when coalesce(compartir, false) and hoja is not null then compartir_v end
    from public.profiles p where p.id = me
  returning id into fid;
  perform public.gym_auditar(g, 'solicitud', fid, me, jsonb_build_object('via', via));
  select coalesce((x.settings->>'aprobar_solas')::boolean, false), x.default_trainer_id into aprobar, prof
    from public.gyms x where x.id = g;
  if aprobar then
    if public.gym_profe_no_puede(g, prof, me) is not null or not public.gym_active(g) then prof := null; end if;
    begin
      perform public.gym_aprobar_interno(fid, prof);
      perform public.gym_auditar(g, 'aprobada_sola', fid, me, jsonb_build_object('profe', prof));
      perform public.gym_alerta_staff(g, 'solicitud_aprobada_sola', fid::text, jsonb_build_object('ficha', fid));
      return jsonb_build_object('estado', 'activo', 'ficha', fid);
    exception when sqlstate 'P0001' then null;   -- sin lugar: queda pendiente
    end;
  end if;
  perform public.gym_alerta_staff(g, 'solicitud', fid::text, jsonb_build_object('ficha', fid));
  return jsonb_build_object('estado', 'pendiente', 'ficha', fid);
end $$;
revoke all on function public.gym_pedir(uuid, uuid, text, text, boolean, text) from public, anon, authenticated;


-- ===== Etapa 1: cerrar un gimnasio =====

-- Lo comparten gym_cerrar (el dueño) y el borrado de la cuenta del dueño (motivo
-- 'baja_cuenta_dueño': sin dueño y con purge_after a 90 días). Operación masiva (gize.gym_bulk):
-- todas las fichas en baja, los socios que atendía alguien del equipo quedan sin coach (los de un
-- coach de afuera no cambian), el equipo deja el gimnasio y el código se anula. Un solo recuento al
-- final. Orden de bloqueo: perfiles, tablas del gimnasio y coach_billing (el recuento).
create or replace function public.gym_cerrar_interno(g uuid, motivo text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare dueno uuid; cs uuid[]; n int; bulk text := current_setting('gize.gym_bulk', true);
begin
  select x.owner_id into dueno from public.gyms x where x.id = g and x.closed_at is null;
  if not found then return 0; end if;
  select array_agg(distinct s.user_id) into cs from public.gym_staff s where s.gym_id = g and s.left_at is null;
  perform 1 from public.profiles p
   where p.id in (select m.member_id from public.gym_members m where m.gym_id = g and m.status in ('activo', 'pausado') and m.member_id is not null)
     and p.coach_id = any(coalesce(cs, '{}'))
   order by p.id for update;
  perform set_config('gize.gym_bulk', 'on', true);
  with x as (
    update public.profiles p set coach_id = null
     where p.id in (select m.member_id from public.gym_members m where m.gym_id = g and m.status in ('activo', 'pausado') and m.member_id is not null)
       and p.coach_id = any(coalesce(cs, '{}'))
    returning 1)
  select count(*) into n from x;
  update public.gym_members set status = 'baja', left_at = now(), baja_motivo = 'gimnasio_cerrado'
   where gym_id = g and status <> 'baja';
  update public.gym_staff set left_at = now() where gym_id = g and left_at is null;
  update public.gym_codes set revoked_at = now() where gym_id = g and revoked_at is null;
  update public.gyms
     set closed_at = now(), close_reason = motivo,
         purge_after = case when motivo = 'baja_cuenta_dueño' then now() + interval '90 days' end,
         owner_id = case when motivo = 'baja_cuenta_dueño' then null else owner_id end,
         default_trainer_id = null
   where id = g;
  perform set_config('gize.gym_bulk', coalesce(bulk, ''), true);
  perform public.gym_recontar(coalesce(cs, '{}') || dueno);
  perform public.gym_auditar(g, 'cerrar', null, dueno, jsonb_build_object('motivo', motivo, 'sin_coach', n));
  return n;
end $$;
revoke all on function public.gym_cerrar_interno(uuid, text) from public, anon, authenticated;

-- El dueño borra su cuenta: el gimnasio se cierra (§6.13). Interna.
create or replace function public.gym_cerrar_por_baja(dueno uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare g uuid := public.gym_de_dueno(dueno);
begin
  if g is null then return 0; end if;
  return public.gym_cerrar_interno(g, 'baja_cuenta_dueño');
end $$;
revoke all on function public.gym_cerrar_por_baja(uuid) from public, anon, authenticated;


-- ===== Etapa 1: borrar la cuenta de alguien del equipo =====

-- before delete en profiles (delete_own_account borra auth.users y llega en cascada). Si es dueño,
-- cierra su gimnasio. Si es del equipo de otro gimnasio: sus socios quedan sin profe en una sola
-- operación (gize.gym_bulk, un aviso de resumen), deja de ser el profe por defecto y deja el equipo.
-- El borrado NUNCA falla por esto (Apple 5.1.1(v)): si algo de acá fallara, se deshace solo esta
-- parte y las claves foráneas hacen lo de la etapa 0.
create or replace function public.profiles_gym_baja()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare s record; n int; dueno uuid; bulk text := current_setting('gize.gym_bulk', true);
begin
  begin
    perform public.gym_cerrar_por_baja(old.id);
    for s in select st.gym_id, st.role from public.gym_staff st join public.gyms x on x.id = st.gym_id and x.closed_at is null
              where st.user_id = old.id and st.left_at is null loop
      select x.owner_id into dueno from public.gyms x where x.id = s.gym_id;
      perform 1 from public.profiles p
       where p.coach_id = old.id
         and p.id in (select m.member_id from public.gym_members m where m.gym_id = s.gym_id and m.status in ('activo', 'pausado'))
       order by p.id for update;
      perform set_config('gize.gym_bulk', 'on', true);
      with x as (
        update public.profiles p set coach_id = null
         where p.coach_id = old.id
           and p.id in (select m.member_id from public.gym_members m where m.gym_id = s.gym_id and m.status in ('activo', 'pausado'))
        returning 1)
      select count(*) into n from x;
      update public.gyms set default_trainer_id = null where id = s.gym_id and default_trainer_id = old.id;
      update public.gym_staff set left_at = now() where gym_id = s.gym_id and user_id = old.id;
      perform set_config('gize.gym_bulk', coalesce(bulk, ''), true);
      perform public.gym_recontar(array[old.id, dueno]);
      perform public.gym_auditar(s.gym_id, 'baja_cuenta_equipo', null, old.id, jsonb_build_object('rol', s.role, 'sin_profe', n));
      if n > 0 then
        perform public.gym_alerta_staff(s.gym_id, 'profe_borro_cuenta', old.id::text, jsonb_build_object('sin_profe', n));
      end if;
    end loop;
  exception when others then
    perform set_config('gize.gym_bulk', coalesce(bulk, ''), true);
    raise warning 'profiles_gym_baja: %', sqlerrm;
  end;
  return old;
end $$;
revoke all on function public.profiles_gym_baja() from public, anon, authenticated;
drop trigger if exists profiles_gym_baja on public.profiles;
create trigger profiles_gym_baja before delete on public.profiles
  for each row execute function public.profiles_gym_baja();


-- ===== Etapa 1: admin_set_role y admin_unlink con los gimnasios =====

-- Las de admin.sql, con dos guardas: no se pasa a alumno al dueño ni a un profe activo de un
-- gimnasio, y no se desvincula (ni se pasa a coach, que lo desvincula) a un socio que atiende un
-- profe de su gimnasio: eso lo hace el gimnasio. Sin gimnasios, iguales a las de hoy.
create or replace function public.admin_set_role(uid uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_assert();
  if p_role not in ('client', 'coach') then raise exception 'Rol inválido.'; end if;
  if p_role = 'client' and exists (select 1 from public.profiles where coach_id = uid) then
    raise exception 'Este coach tiene alumnos: primero desvinculalos.' using errcode = 'P0001';
  end if;
  if p_role = 'client' and exists (select 1 from public.gym_staff s join public.gyms x on x.id = s.gym_id and x.closed_at is null
                                    where s.user_id = uid and s.left_at is null and s.role in ('owner', 'profe')) then
    raise exception 'Es dueño o profe de un gimnasio: primero tiene que dejar el equipo del gimnasio.' using errcode = 'P0001';
  end if;
  if p_role = 'coach' and public.vinculo_gym(uid) is not null then
    raise exception 'Es socio de un gimnasio y lo atiende un profe del gimnasio: el cambio lo hace el gimnasio.' using errcode = 'P0001';
  end if;
  update public.profiles set role = p_role, coach_id = case when p_role = 'coach' then null else coach_id end where id = uid;
  if p_role = 'coach' then insert into public.coach_billing (coach_id) values (uid) on conflict (coach_id) do nothing; end if;
  perform public.admin_log('rol', uid::text, jsonb_build_object('role', p_role));
end $$;

create or replace function public.admin_unlink(uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_assert();
  if public.vinculo_gym(uid) is not null then
    raise exception 'Es socio de un gimnasio y lo atiende un profe del gimnasio: el cambio lo hace el gimnasio.' using errcode = 'P0001';
  end if;
  update public.profiles set coach_id = null where id = uid;
  perform public.admin_log('desvincular', uid::text, null);
end $$;


-- ===== Etapa 1: la fila de coach_billing para las apps viejas =====

-- ¿Se le esconde su fila de coach_billing a quien llama? Solo a un profe (o administración con
-- cuenta de coach) activo de un gimnasio abierto, cuya fila es solo de prueba (sin pago, sin
-- suscripción de Mercado Pago ni de Apple) y que no tiene vínculos propios. Sin fila, la app vieja
-- lo trata como activo y sin tope (coach/plan.js) y no le muestra la pantalla de pago por los socios
-- del gimnasio. La fila sigue existiendo: la leen el admin y las funciones. Responde solo sobre
-- quien llama (la usa la política).
create or replace function public.gym_mi_fila_oculta()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare me uuid := auth.uid();
begin
  if me is null then return false; end if;
  return exists (select 1 from public.gym_staff s join public.gyms x on x.id = s.gym_id and x.closed_at is null
                  where s.user_id = me and s.left_at is null and s.role in ('admin', 'profe'))
     and exists (select 1 from public.coach_billing b
                  where b.coach_id = me and b.plan = 'trial' and b.paid_until is null
                    and b.mp_preapproval_id is null and b.apple_original_tx is null)
     and not exists (select 1 from public.profiles p where p.coach_id = me and public.vinculo_gym(p.id) is null);
end $$;
revoke all on function public.gym_mi_fila_oculta() from public, anon;
grant execute on function public.gym_mi_fila_oculta() to authenticated;

drop policy if exists "billing: el coach ve la suya" on public.coach_billing;
-- «to authenticated»: la de hoy no dice rol (vale para anon, que no ve nada porque no tiene
-- auth.uid()); anon no puede llamar a gym_mi_fila_oculta, así que sin esto leer coach_billing sin sesión
-- daba error en vez de vacío.
create policy "billing: el coach ve la suya" on public.coach_billing
  for select to authenticated using (coach_id = (select auth.uid()) and not public.gym_mi_fila_oculta());


-- ===== Etapa 1: el chat dentro de un gimnasio =====

-- El coach lee sus mensajes, salvo los que se mandaron dentro de un gimnasio (gym_id, lo guarda
-- rapid-worker) con un socio que ya no atiende: el profe que deja de atender a un socio del
-- gimnasio deja de leer esa conversación. Entre un coach independiente y sus alumnos no cambia nada
-- (gym_id null). El socio sigue viendo todo (la política del cliente no cambia).
drop policy if exists "mensajes: el coach ve los suyos" on public.coach_messages;
create policy "mensajes: el coach ve los suyos" on public.coach_messages
  for select to authenticated using (
    coach_id = (select auth.uid())
    and (gym_id is null
         or exists (select 1 from public.profiles p where p.id = client_id and p.coach_id = (select auth.uid()))));

-- Escuchar audios: la conversación con el coach actual (como hoy) o una carpeta del propio alumno
-- ({coach}/{alumno}/…, el segundo segmento es quien pide): el socio conserva todos sus audios
-- aunque cambie de profe. Subir no cambia (topes-archivos.sql).
drop policy if exists "chat-audio: escuchar en mi conversación" on storage.objects;
create policy "chat-audio: escuchar en mi conversación" on storage.objects
  for select to authenticated
  using (bucket_id = 'chat-audio'
         and (public.chat_folder_mine((storage.foldername(name))[1], (storage.foldername(name))[2])
              or (storage.foldername(name))[2] = (select auth.uid())::text));

notify pgrst, 'reload schema';


-- ===== Para volver atrás =====
-- Correr esto sin los «-- » (en el SQL Editor, o como un archivo aparte con la tarea sql). Deja
-- coach_active, is_my_client, join_coach y release_lapsed_clients como estaban antes de este archivo
-- (copia textual de cupo-plan.sql, suscripciones.sql, bloqueos.sql y coach-vencido.sql; una prueba
-- controla que sigan iguales), las políticas y funciones de la etapa 1 como estaban (copia textual de
-- suscripciones.sql, notificaciones.sql, chat.sql, rutina-programada.sql y admin.sql) y saca lo que
-- agregó (coach_client_ok, profiles_gym_sync, el trigger del borrado y las internas). Antes, los
-- bloques de gimnasios-socios.sql y gimnasios-lectura.sql (en ese orden), salvo para volver a correr
-- un archivo viejo (las notas «OJO»): ahí se corre solo este bloque, ese archivo, gimnasios.sql y este
-- otra vez, y gimnasios-lectura.sql y gimnasios-socios.sql (que usan funciones de acá) siguen andando
-- cuando este vuelve. Después se puede volver atrás gimnasios.sql (el bloque del final de ese archivo).
--
-- -- De cupo-plan.sql:
-- create or replace function public.coach_active(cid uuid)
-- returns boolean
-- language sql
-- stable
-- security definer
-- set search_path = public
-- as $$
--   select exists (
--     select 1 from public.coach_billing b
--      where b.coach_id = cid
--        and (b.plan = 'cortesia'
--             or ((b.trial_ends_at > now() or coalesce(b.paid_until, '-infinity') > now())
--                 and (select count(*) from public.profiles x where x.coach_id = cid) <= coalesce(b.max_clients, 10)))
--   );
-- $$;
-- revoke execute on function public.coach_active(uuid) from public, anon;
-- grant  execute on function public.coach_active(uuid) to authenticated, service_role;
--
-- -- De suscripciones.sql:
-- create or replace function public.is_my_client(target uuid)
-- returns boolean
-- language sql
-- stable
-- security definer
-- set search_path = public
-- as $$
--   select exists (
--     select 1 from public.profiles
--     where id = target and coach_id = auth.uid()
--   ) and public.coach_active(auth.uid());
-- $$;
--
-- -- De bloqueos.sql (antes hay que borrar la de json):
-- drop function if exists public.join_coach(text);
-- create or replace function public.join_coach(code text)
-- returns boolean
-- language plpgsql
-- security definer
-- set search_path = public
-- as $$
-- declare cid uuid; lim int; n int; me uuid := auth.uid();
-- begin
--   if me is null then return false; end if;
--   -- Un coach no se vincula a otro coach: el otro vería y editaría su rutina.
--   if exists (select 1 from profiles where id = me and role = 'coach') then return false; end if;
--   -- De a un intento por persona: varios a la vez no se saltean el tope.
--   perform pg_advisory_xact_lock(hashtext('join_coach'), hashtext(me::text));
--   delete from join_code_attempts where user_id = me and created_at < now() - interval '1 day';
--   if (select count(*) from join_code_attempts where user_id = me) >= 20
--      or (select count(*) from join_code_attempts where user_id = me and created_at > now() - interval '1 hour') >= 10 then
--     raise exception 'Probaste muchos códigos que no existen. Revisalo con tu coach y volvé a intentar en un rato.' using errcode = 'P0001';
--   end if;
--   select id into cid from profiles where invite_code = upper(trim(code)) and role = 'coach';
--   if cid is null then
--     -- Queda anotado: sale con return, no con raise (que desharía el insert).
--     insert into join_code_attempts (user_id) values (me);
--     return false;
--   end if;
--   if cid = me then return false; end if;
--   -- Uno bloqueó al otro (bloqueos.sql): no se vinculan.
--   if public.bloqueo_entre(me, cid) then
--     raise exception 'No podés sumarte con este código.' using errcode = 'P0001';
--   end if;
--   if exists (select 1 from profiles where id = me and coach_id = cid) then return true; end if;
--   if not public.coach_active(cid) then
--     raise exception 'Tu coach tiene el plan de GIZE vencido: por ahora no puede sumar alumnos. Avisale y volvé a intentar.' using errcode = 'P0001';
--   end if;
--   -- Bloquea la fila del coach: dos clientes a la vez no pasan el cupo.
--   select max_clients into lim from coach_billing where coach_id = cid for update;
--   select count(*) into n from profiles where coach_id = cid;
--   if n >= coalesce(lim, 10) then
--     raise exception 'Tu coach llegó al máximo de alumnos: por ahora no puede sumar más. Avisale y volvé a intentar.' using errcode = 'P0001';
--   end if;
--   update profiles set coach_id = cid where id = me;
--   return true;
-- end $$;
-- revoke execute on function public.join_coach(text) from public, anon;
-- grant  execute on function public.join_coach(text) to authenticated;
--
-- -- De coach-vencido.sql:
-- create or replace function public.release_lapsed_clients()
-- returns integer
-- language plpgsql
-- security definer
-- set search_path = public
-- as $$
-- declare n integer;
-- begin
--   with lapsed as (
--     select b.coach_id
--       from public.coach_billing b
--      where b.plan <> 'cortesia'
--        and greatest(b.trial_ends_at, coalesce(b.paid_until, '-infinity')) < now() - interval '4 days'
--   ), released as (
--     update public.profiles p
--        set coach_id = null, coach_left_at = now()
--       from lapsed l
--      where p.coach_id = l.coach_id
--        and coalesce(p.role, 'client') <> 'coach'
--     returning p.id
--   )
--   select count(*) into n from released;
--   return n;
-- end $$;
-- revoke execute on function public.release_lapsed_clients() from public, anon, authenticated;
--
-- -- Y lo que agregó este archivo:
-- -- De suscripciones.sql (la política de coach_billing; antes que borrar gym_mi_fila_oculta):
-- drop policy if exists "billing: el coach ve la suya" on public.coach_billing;
-- create policy "billing: el coach ve la suya" on public.coach_billing
--   for select using (coach_id = auth.uid());
--
-- -- De notificaciones.sql:
-- drop policy if exists "mensajes: el coach ve los suyos" on public.coach_messages;
-- create policy "mensajes: el coach ve los suyos" on public.coach_messages
--   for select to authenticated using (coach_id = auth.uid());
--
-- -- De chat.sql:
-- drop policy if exists "chat-audio: escuchar en mi conversación" on storage.objects;
-- create policy "chat-audio: escuchar en mi conversación" on storage.objects
--   for select to authenticated
--   using (bucket_id = 'chat-audio'
--          and public.chat_folder_mine((storage.foldername(name))[1], (storage.foldername(name))[2]));
--
-- -- De rutina-programada.sql:
-- create or replace function public.routine_schedule_on_coach_change()
-- returns trigger language plpgsql security definer set search_path = public as $$
-- begin
--   if new.coach_id is distinct from old.coach_id then
--     delete from public.routine_schedule where client_id = new.id and applied_at is null;
--   end if;
--   return new;
-- end $$;
-- revoke execute on function public.routine_schedule_on_coach_change() from public, anon, authenticated;
--
-- -- De admin.sql:
-- create or replace function public.admin_set_role(uid uuid, p_role text)
-- returns void language plpgsql security definer set search_path = public as $$
-- begin
--   perform public.admin_assert();
--   if p_role not in ('client', 'coach') then raise exception 'Rol inválido.'; end if;
--   if p_role = 'client' and exists (select 1 from public.profiles where coach_id = uid) then
--     raise exception 'Este coach tiene alumnos: primero desvinculalos.' using errcode = 'P0001';
--   end if;
--   update public.profiles set role = p_role, coach_id = case when p_role = 'coach' then null else coach_id end where id = uid;
--   if p_role = 'coach' then insert into public.coach_billing (coach_id) values (uid) on conflict (coach_id) do nothing; end if;
--   perform public.admin_log('rol', uid::text, jsonb_build_object('role', p_role));
-- end $$;
-- revoke execute on function public.admin_set_role(uuid, text) from public, anon;
-- grant execute on function public.admin_set_role(uuid, text) to authenticated;
--
-- create or replace function public.admin_unlink(uid uuid)
-- returns void language plpgsql security definer set search_path = public as $$
-- begin
--   perform public.admin_assert();
--   update public.profiles set coach_id = null where id = uid;
--   perform public.admin_log('desvincular', uid::text, null);
-- end $$;
-- revoke execute on function public.admin_unlink(uuid) from public, anon;
-- grant execute on function public.admin_unlink(uuid) to authenticated;
--
-- -- Lo nuevo de la etapa 1:
-- drop trigger if exists profiles_gym_baja on public.profiles;
-- drop function if exists public.profiles_gym_baja();
-- drop function if exists public.gym_mi_fila_oculta();
-- drop function if exists public.gym_cerrar_por_baja(uuid);
-- drop function if exists public.gym_cerrar_interno(uuid, text);
-- drop function if exists public.gym_pedir(uuid, uuid, text, text, boolean, text);
-- drop function if exists public.gym_aprobar_interno(uuid, uuid);
-- drop function if exists public.gym_profe_no_puede(uuid, uuid, uuid);
-- drop function if exists public.gym_cupo_ok(uuid, uuid[]);
-- drop function if exists public.gym_auditar(uuid, text, uuid, uuid, jsonb);
-- drop function if exists public.gym_alerta_staff(uuid, text, text, jsonb);
-- drop function if exists public.gym_alerta(uuid, text, text, text, text, jsonb);
--
-- -- Y lo de la etapa 0:
-- drop trigger if exists profiles_gym_sync on public.profiles;
-- drop function if exists public.profiles_gym_sync();
-- drop function if exists public.coach_client_ok(uuid, uuid);
-- notify pgrst, 'reload schema';
