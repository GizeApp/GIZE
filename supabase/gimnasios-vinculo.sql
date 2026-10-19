-- Gimnasios: el vínculo de cada persona con su coach, ahora también dentro de un gimnasio.
-- Correr con el workflow "Supabase" → tarea sql → supabase/gimnasios-vinculo.sql, después de
-- supabase/gimnasios.sql. Se puede correr varias veces.
-- OJO: canónico. Acá están las versiones vigentes de coach_active, is_my_client, join_coach,
-- release_lapsed_clients, coach_client_ok y profiles_gym_sync. Las versiones viejas están en
-- base.sql, endurecer-base.sql, suscripciones.sql, cupo-plan.sql, coach-alumnos.sql, bloqueos.sql y
-- coach-vencido.sql: si se vuelve a correr cualquiera de esos, correr después gimnasios.sql y este.
-- join_coach ahora devuelve json (abajo): con este archivo aplicado, los archivos viejos que la
-- definen con boolean (base, endurecer-base, suscripciones, coach-alumnos y bloqueos) fallan
-- enteros sin cambiar nada, a propósito, así no pisan la vigente sin querer. Para correr uno igual:
-- primero el bloque «Para volver atrás» del final, después ese archivo, gimnasios.sql y este.
--
-- SIN GIMNASIOS TODO SIGUE IGUAL: sin filas en gyms, gym_staff y gym_members, cada función da el
-- mismo resultado que la de hoy (lo prueba tests/gimnasios-igual.test.mjs con datos al azar contra
-- las versiones de hoy, que están copiadas al final). Qué cambia cuando hay gimnasios:
--
--   coach_active(cid): el dueño de un gimnasio abierto tiene el plan del gimnasio (gym_active: con
--     5 días de gracia y sin corte por cupo). Para cualquier otro coach, la regla de cupo-plan.sql,
--     con el cupo cacheado (seats_used, que solo cuenta sus vínculos propios) en lugar del count(*).
--   is_my_client(target) y coach_client_ok(coach, client): decide la relación. Si el socio lo atiende
--     un profe de su gimnasio (vinculo_gym), vale el plan del gimnasio; si no (alumno propio, o socio
--     con un coach de afuera), el plan del coach, como hoy. coach_client_ok es la misma con el coach
--     explícito, para rapid-worker y avisos-coach (etapa 1); no la puede llamar la app.
--   release_lapsed_clients(): solo suelta vínculos propios, y no toca a los dueños de un gimnasio
--     abierto (sus alumnos siguen el calendario del gimnasio: 10 días, etapa 1). Bloquea primero las
--     filas de coach_billing de esos coaches y recuenta el cupo una vez al final (gize.gym_bulk).
--   profiles_gym_sync (trigger): cuando cambia el coach de alguien con ficha activa o pausada, el
--     profe de la ficha queda igual a su coach si ese coach es del equipo del gimnasio, y si no,
--     vacío. Así el profe que dejó de atender a un socio (desvincularse, bloqueo, el coach lo saca)
--     deja de ver su ficha. Los avisos al dueño llegan en la etapa 1.
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
--       propios) y bloquea también la fila del coach anterior, siempre en el mismo orden: los
--       triggers del cupo la actualizan y así dos cambios cruzados no se trancan.
--   Los mensajes no hablan del plan ni mandan a renovar o ampliar (los filtran las apps, core/tienda.js).


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
revoke execute on function public.coach_active(uuid) from public, anon;
grant  execute on function public.coach_active(uuid) to authenticated, service_role;


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

create or replace function public.profiles_gym_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.gym_members m
     set trainer_id = t.nuevo
    from (select case when exists (select 1 from public.gym_staff s
                                    where s.gym_id = f.gym_id and s.user_id = new.coach_id and s.left_at is null
                                      and s.role in ('owner', 'admin', 'profe'))
                      then new.coach_id end as nuevo, f.id
            from public.gym_members f
           where f.member_id = new.id and f.status in ('activo', 'pausado')) t
   where m.id = t.id and m.trainer_id is distinct from t.nuevo;
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
        g_id uuid; g_nom text; f_gym uuid; f_est text; f_nom text; fid uuid; v uuid; s_gym uuid; s_nom text;
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
      -- Tope: 30 pedidos con el código por gimnasio en 24 horas (de a uno por gimnasio).
      perform pg_advisory_xact_lock(hashtext('gym_solicitud'), hashtext(g_id::text));
      if (select count(*) from gym_members where gym_id = g_id and source = 'codigo' and requested_at > now() - interval '24 hours') >= 30 then
        raise exception '% recibió muchos pedidos hoy. Probá de nuevo mañana.', g_nom using errcode = 'P0001';
      end if;
      -- La solicitud: sin la hoja aceptada (terms_at) y sin compartir nada; el coach no cambia.
      insert into gym_members (gym_id, member_id, full_name, email, status, source, requested_at, created_by)
      select g_id, me, left(coalesce(p.full_name, ''), 120), u.email, 'pendiente', 'codigo', now(), me
        from profiles p left join auth.users u on u.id = p.id
       where p.id = me
      returning id into fid;
      insert into gym_audit (gym_id, actor_id, action, gym_member_id, target_user) values (g_id, me, 'solicitud', fid, me);
      -- Sale como error (status 400, cuerpo P0001) sin raise: un raise desharía la solicitud.
      perform set_config('response.status', '400', true);
      return json_build_object('code', 'P0001', 'message', 'Listo: le pediste a ' || g_nom || ' que te sume. Cuando te acepten vas a ver a tu profe acá.');
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
  -- (Y antes, la del coach anterior, en orden: los triggers del cupo la actualizan.)
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
-- gimnasio abierto. Bloquea en orden las filas de coach_billing de esos coaches (como join_coach) y
-- recuenta el cupo una vez al final, con la marca gize.gym_bulk. La tarea de cron no cambia.
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
  perform 1 from public.coach_billing where coach_id = any(cs) order by coach_id for update;
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

notify pgrst, 'reload schema';


-- ===== Para volver atrás =====
-- Correr esto sin los «-- » (en el SQL Editor, o como un archivo aparte con la tarea sql). Deja
-- coach_active, is_my_client, join_coach y release_lapsed_clients como estaban antes de este archivo
-- (copia textual de cupo-plan.sql, suscripciones.sql, bloqueos.sql y coach-vencido.sql; una prueba
-- controla que sigan iguales) y saca coach_client_ok y profiles_gym_sync. Después se puede volver
-- atrás gimnasios.sql (el bloque del final de ese archivo).
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
-- drop trigger if exists profiles_gym_sync on public.profiles;
-- drop function if exists public.profiles_gym_sync();
-- drop function if exists public.coach_client_ok(uuid, uuid);
-- notify pgrst, 'reload schema';
