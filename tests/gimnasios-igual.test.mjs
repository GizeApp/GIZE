// Gimnasios, etapa 0: «sin gimnasios todo sigue igual». Las versiones canónicas de coach_active,
// is_my_client, join_coach y release_lapsed_clients (supabase/gimnasios-vinculo.sql) contra las de hoy,
// que salen del bloque «Para volver atrás» de ese mismo archivo (y se controla que sean, tal cual, las
// de cupo-plan.sql, suscripciones.sql, bloqueos.sql y coach-vencido.sql), sobre los mismos datos al
// azar y sin ninguna fila de gimnasio. Postgres de verdad (tests/pg.mjs); sin Postgres se saltea.
// Por cada semilla (200 por defecto; GIZE_SEMILLAS=n y GIZE_SEMILLA=desde para repetir una):
//   · 6 a 12 coaches con planes al azar (todos, con cortesía), prueba y pago nulos, pasados o futuros,
//     a una hora de ahora y de hace 4 días, y cupos de 1 a 12; 20 a 60 alumnos con coach al azar
//     (cupos justos y pasados), coaches con coach (se cuentan, como hoy), intentos de códigos (también
//     al borde de los topes), bloqueos, y registros de cada alumno en las tablas del coach.
//   · coach_active de cada coach; is_my_client de quien llama (coaches, alumnos y sin sesión) con sus
//     alumnos y una muestra de los demás (cada 10 semillas, con todos);
//     coach_client_ok contra el chequeo de hoy de rapid-worker y avisos-coach (el alumno es del coach y
//     coach_active); join_coach con códigos buenos, mal escritos, que no existen y de alguien bloqueado,
//     cada vieja y nueva desde el mismo estado (resultado, error y mensaje, coach, intentos, cupos);
//     release_lapsed_clients vieja y nueva en la misma transacción (mismo now()); y las políticas: lo
//     que ve y lo que puede cambiar un coach, un alumno o cualquiera (uno por semilla, por turno) en las
//     13 tablas con is_my_client, con las funciones de hoy y con las nuevas.
//   · Después, 15 operaciones al azar con las funciones nuevas (vincularse, el coach saca a un alumno,
//     bloquear, desvincularse en Ajustes, admin_unlink, admin_set_role, liberar por plan vencido y borrar
//     la cuenta) y después de cada una: seats_drift() vacío y seats_used = el count(*) de hoy. Al final,
//     coach_active e is_my_client (de cada coach con todos) otra vez, sobre el estado que quedó.
// Si una semilla da distinto, la prueba dice cuál (para repetirla) y qué dio cada versión.
// Etapa 1 (CONTRA_SIN, abajo): además, con los cuatro archivos de los gimnasios aplicados, cada persona
// sin gimnasio lee lo mismo que en la base de hoy (gize_sin), con los mismos datos al azar en las dos:
// las 13 tablas del coach, profiles, coach_messages, coach_billing y los buckets avatars y chat-audio,
// como cada coach, alumno, un admin de GIZE y sin sesión; y las operaciones de hoy (desvincularse en
// Ajustes, el coach saca a un alumno, bloquear, vincularse, admin_unlink, admin_set_role, liberar por
// plan vencido, borrar la cuenta de un alumno y de un coach) dan lo mismo y dejan el mismo estado
// (perfiles, rutinas programadas, bloqueos, mensajes, cuentas). GIZE_SEMILLAS_SIN (30 por defecto).
// Etapa 1, parte 5: con gimnasios-admin.sql también admin_coaches, admin_overview, hay_avisos_vence,
// tomar_avisos_vence y soltar_aviso_vence dan lo mismo que las de hoy en las columnas y claves de hoy.
import { conPg, leer, volverAtras } from './pg.mjs';

// La sentencia entera (create … $$;) de la última definición de public.<nombre> que empieza una línea.
function sentencia(sql, nombre){
  const re = new RegExp('^create or replace function public\\.' + nombre + '\\(', 'gm');
  let i = -1, m;
  while ((m = re.exec(sql))) i = m.index;
  if (i < 0) return null;
  const a = sql.indexOf('$$', i), b = sql.indexOf('$$;', a + 2);
  return sql.slice(i, b + 3);
}

const TABLAS = ['body_weights', 'checkins', 'client_prefs', 'daily_logs', 'food_entries', 'sessions', 'session_entries',
  'client_info', 'blocks', 'nutrition', 'routines', 'routine_schedule', 'cardio_outings'];

const DRIVER = `
create table viejo.textos (nombre text primary key, sql text not null);

-- join_coach vieja o nueva desde el estado de ahora, y deshace. Devuelve lo que hizo.
create function viejo.probar_join(quien uuid, cod text, usar_viejo boolean) returns jsonb language plpgsql as $f$
declare r jsonb; est jsonb; e text; m text;
begin
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', quien, 'role', 'authenticated')::text, true);
    perform set_config('response.status', '', true);
    if usar_viejo then r := to_jsonb(viejo.join_coach(cod)); else r := public.join_coach(cod)::jsonb; end if;
    est := jsonb_build_object('r', r, 'status', nullif(current_setting('response.status', true), ''),
      'coach', (select coach_id from public.profiles where id = quien),
      'intentos', (select count(*) from public.join_code_attempts where user_id = quien),
      'cupos', (select jsonb_object_agg(coach_id, seats_used) from public.coach_billing),
      'drift', (select count(*) from public.seats_drift()));
    raise exception using errcode = 'GZ997';
  exception when others then
    get stacked diagnostics e = returned_sqlstate, m = message_text;
    if e = 'GZ997' then return est; end if;
    return jsonb_build_object('error', e, 'msg', m);
  end;
end $f$;

create function viejo.probar_release(usar_viejo boolean) returns jsonb language plpgsql as $f$
declare n int; est jsonb; e text; m text;
begin
  begin
    if usar_viejo then n := viejo.release_lapsed_clients(); else n := public.release_lapsed_clients(); end if;
    est := jsonb_build_object('n', n,
      'perfiles', (select jsonb_agg(jsonb_build_array(id, coach_id, coach_left_at is not null) order by id) from public.profiles),
      'cupos', (select jsonb_object_agg(coach_id, seats_used) from public.coach_billing),
      'drift', (select count(*) from public.seats_drift()));
    raise exception using errcode = 'GZ997';
  exception when others then
    get stacked diagnostics e = returned_sqlstate, m = message_text;
    if e = 'GZ997' then return est; end if;
    return jsonb_build_object('error', e, 'msg', m);
  end;
end $f$;

-- Lo que ve y lo que puede cambiar quien, en las tablas con is_my_client, con las funciones nuevas o
-- (usar_viejo) con las de hoy puestas en su lugar. Deshace todo, también el cambio de funciones.
create function viejo.contar_como(quien uuid, usar_viejo boolean) returns jsonb language plpgsql as $f$
declare r jsonb; e text; m text; w1 int; w2 int; w3 int; w4 int;
begin
  begin
    if usar_viejo then
      execute (select sql from viejo.textos where nombre = 'coach_active');
      execute (select sql from viejo.textos where nombre = 'is_my_client');
    end if;
    perform prueba.ser(quien::text);
    r := jsonb_build_object(${TABLAS.map(tb => `'${tb}', (select count(*) from public.${tb})`).join(', ')},
      'perfiles', (select count(*) from public.profiles), 'mensajes', (select count(*) from public.coach_messages));
    with x as (update public.client_info set objective = objective returning 1) select count(*) into w1 from x;
    with x as (update public.blocks set notes = notes returning 1) select count(*) into w2 from x;
    with x as (update public.nutrition set notes = notes returning 1) select count(*) into w3 from x;
    with x as (delete from public.routine_schedule returning 1) select count(*) into w4 from x;
    r := r || jsonb_build_object('w_client_info', w1, 'w_blocks', w2, 'w_nutrition', w3, 'd_routine_schedule', w4);
    raise exception using errcode = 'GZ997';
  exception when others then
    get stacked diagnostics e = returned_sqlstate, m = message_text;
    if e = 'GZ997' then return r; end if;
    return jsonb_build_object('error', e, 'msg', m);
  end;
end $f$;

-- Una semilla: arma los datos, compara y deshace los datos. Devuelve las diferencias y qué se probó.
create function viejo.semilla(s int) returns jsonb language plpgsql as $f$
declare
  dif jsonb := '[]'; vistos jsonb := '{}';
  nc int; nk int; i int; c uuid[] := '{}'; k uuid[] := '{}'; adm uuid := md5('admin:' || s)::uuid;
  quien uuid; otro uuid; cod text; op int; r_v jsonb; r_n jsonb; r jsonb;
  ofs interval[] := array[interval '1 hour', interval '-1 hour', interval '10 days', interval '-3 days -23 hours',
                          interval '-4 days -1 hour', interval '-30 days'];
begin
  perform setseed(sin(s));
  begin
    nc := 6 + floor(random() * 7)::int;
    nk := 20 + floor(random() * 41)::int;
    for i in 1..nc loop c := c || md5('coach:' || s || ':' || i)::uuid; end loop;
    for i in 1..nk loop k := k || md5('alumno:' || s || ':' || i)::uuid; end loop;
    insert into auth.users (id, email, raw_user_meta_data)
    select u, 'coach' || o || '@ejemplo.test', jsonb_build_object('full_name', 'Coach ' || o, 'role', 'coach') from unnest(c) with ordinality x(u, o);
    insert into auth.users (id, email, raw_user_meta_data)
    select u, 'alumno' || o || '@ejemplo.test', jsonb_build_object('full_name', 'Alumno ' || o) from unnest(k) with ordinality x(u, o);
    insert into auth.users (id, email, raw_user_meta_data) values (adm, 'admin@ejemplo.test', '{"full_name":"Admin"}');
    insert into public.app_admins (user_id) values (adm);
    update public.profiles p set invite_code = 'CO' || lpad(x.o::text, 6, '0') from unnest(c) with ordinality x(u, o) where p.id = x.u;
    update public.coach_billing b set
      plan = (array['trial', 'p10', 'p25', 'p50', 'p100', 'cortesia'])[1 + floor(random() * 6)::int],
      max_clients = 1 + floor(random() * 12)::int,
      trial_ends_at = now() + ofs[1 + floor(random() * 6)::int],
      paid_until = case when random() < 0.4 then null else now() + ofs[1 + floor(random() * 6)::int] end,
      mp_preapproval_id = case when random() < 0.15 then 'preaprobacion-de-prueba' end,
      mp_status = case when random() < 0.5 then 'authorized' else 'cancelled' end
     where b.coach_id = any(c);
    update public.profiles p set coach_id = case when random() < 0.2 then null else c[1 + floor(random() * nc)::int] end where p.id = any(k);
    -- Coaches con coach (hoy cuentan en el cupo como cualquiera).
    update public.profiles p set coach_id = c[1] where p.id = c[2] and random() < 0.5;
    update public.profiles p set coach_id = c[3] where p.id = c[4] and random() < 0.3;
    -- Intentos de códigos: algunos al borde del tope por hora, otros del de 24 h, otros viejos.
    insert into public.join_code_attempts (user_id, created_at)
    select x.u, now() - (case x.t when 0 then random() * interval '50 minutes' else random() * interval '26 hours' end)
      from (select u, floor(random() * 3)::int as t, floor(random() * 23)::int as cuantos from unnest(k) u) x
      cross join lateral generate_series(1, x.cuantos) g;
    insert into public.user_blocks (blocker, blocked)
    select a, b from (select k[1 + floor(random() * nk)::int] as a, c[1 + floor(random() * nc)::int] as b from generate_series(1, 4)) x
     where random() < 0.7 on conflict do nothing;
    insert into public.user_blocks (blocker, blocked)
    select b, a from (select k[1 + floor(random() * nk)::int] as a, c[1 + floor(random() * nc)::int] as b from generate_series(1, 3)) x
     where random() < 0.5 on conflict do nothing;
    -- Registros de cada alumno.
    insert into public.sessions (id, client_id, performed_on, day_name) select md5('sesion:' || u)::uuid, u, current_date, 'A' from unnest(k) u;
    insert into public.session_entries (session_id, client_id, exercise_name, set_order, kg, reps) select md5('sesion:' || u)::uuid, u, 'Sentadilla', 1, 50, 10 from unnest(k) u;
    insert into public.body_weights (client_id, measured_on, kg) select u, current_date, 70 from unnest(k) u;
    insert into public.daily_logs (client_id, log_date) select u, current_date from unnest(k) u;
    insert into public.checkins (client_id, week_start) select u, current_date from unnest(k) u;
    insert into public.food_entries (client_id, log_date, name) select u, current_date, 'Avena' from unnest(k) u;
    insert into public.client_info (client_id, objective) select u, 'Fuerza' from unnest(k) u;
    insert into public.blocks (client_id, name) select u, 'Bloque' from unnest(k) u;
    insert into public.nutrition (client_id, kcal) select u, 2000 from unnest(k) u;
    insert into public.client_prefs (client_id) select u from unnest(k) u;
    insert into public.routine_schedule (client_id, starts_on) select u, current_date + 7 from unnest(k) u;
    insert into public.cardio_outings (id, client_id, mode, performed_on, started_at, duration_s) select md5('salida:' || u)::uuid, u, 'pie', current_date, now(), 600 from unnest(k) u;

    -- coach_active: cada coach y uno que no existe.
    select dif || coalesce(jsonb_agg(jsonb_build_object('f', 'coach_active', 'coach', u, 'viejo', viejo.coach_active(u), 'nuevo', public.coach_active(u))), '[]')
      into dif from unnest(c || md5('nadie:' || s)::uuid) u where viejo.coach_active(u) is distinct from public.coach_active(u);
    vistos := vistos || jsonb_build_object('coach_active_si', (select count(*) from unnest(c) u where public.coach_active(u)),
                                           'coach_active_no', (select count(*) from unnest(c) u where not public.coach_active(u)));
    -- is_my_client: quien llama (coaches, alumnos y sin sesión) contra sus alumnos y una muestra al
    -- azar de los demás; cada 10 semillas, contra todos.
    foreach quien in array c || k || array[null::uuid] loop
      perform set_config('request.jwt.claims', case when quien is null then '' else json_build_object('sub', quien, 'role', 'authenticated')::text end, true);
      select dif || coalesce(jsonb_agg(jsonb_build_object('f', 'is_my_client', 'quien', quien, 'de', u, 'viejo', viejo.is_my_client(u), 'nuevo', public.is_my_client(u))), '[]')
        into dif from unnest(c || k || md5('nadie:' || s)::uuid) u
       where (s % 10 = 0 or random() < 0.12 or u in (select id from public.profiles where coach_id = quien))
         and viejo.is_my_client(u) is distinct from public.is_my_client(u);
      vistos := vistos || jsonb_build_object('is_my_client_si', coalesce((vistos->>'is_my_client_si')::int, 0)
                                             + (select count(*) from unnest(k || c) u where public.is_my_client(u)));
    end loop;
    perform set_config('request.jwt.claims', '', true);
    -- coach_client_ok contra el chequeo de hoy de rapid-worker y avisos-coach.
    select dif || coalesce(jsonb_agg(jsonb_build_object('f', 'coach_client_ok', 'coach', co, 'de', cl)), '[]') into dif
      from unnest(c) co, unnest(k || c) cl
     where public.coach_client_ok(co, cl) is distinct from
           (exists (select 1 from public.profiles p where p.id = cl and p.coach_id = co) and viejo.coach_active(co));
    -- join_coach: cada vieja y nueva desde el mismo estado.
    for i in 1..30 loop
      quien := (k || c[1:2])[1 + floor(random() * (nk + 2))::int];
      otro := c[1 + floor(random() * nc)::int];
      cod := case floor(random() * 6)::int
        when 0 then 'NOEXISTE'
        when 1 then lower(' ' || (select invite_code from public.profiles where id = otro) || ' ')
        when 2 then coalesce((select p.invite_code from public.user_blocks ub join public.profiles p on p.id = (case when ub.blocker = quien then ub.blocked else ub.blocker end)
                               where quien in (ub.blocker, ub.blocked) limit 1), 'XX' || floor(random() * 1000))
        else (select invite_code from public.profiles where id = otro) end;
      r_v := viejo.probar_join(quien, cod, true);
      r_n := viejo.probar_join(quien, cod, false);
      if r_v is distinct from r_n or coalesce((r_n->>'drift')::int, 0) > 0 or r_n ? 'status' and r_n->>'status' is not null then
        dif := dif || jsonb_build_object('f', 'join_coach', 'quien', quien, 'codigo', cod, 'viejo', r_v, 'nuevo', r_n);
      end if;
      cod := coalesce(r_n->>'msg', r_n->>'r');
      vistos := vistos || jsonb_build_object('join:' || left(cod, 30), coalesce((vistos->>('join:' || left(cod, 30)))::int, 0) + 1);
    end loop;
    -- release_lapsed_clients: las dos en la misma transacción (mismo now()).
    r_v := viejo.probar_release(true);
    r_n := viejo.probar_release(false);
    if r_v is distinct from r_n or coalesce((r_n->>'drift')::int, 0) > 0 then
      dif := dif || jsonb_build_object('f', 'release_lapsed_clients', 'viejo', r_v->'n', 'nuevo', r_n->'n');
    end if;
    vistos := vistos || jsonb_build_object('liberados', (r_n->>'n')::int);
    -- Políticas: un coach, un alumno o cualquiera (uno por semilla, por turno).
    foreach quien in array array[(array[c[1 + floor(random() * nc)::int], k[1 + floor(random() * nk)::int], (c || k)[1 + floor(random() * (nc + nk))::int]])[1 + s % 3]] loop
      r_v := viejo.contar_como(quien, true);
      r_n := viejo.contar_como(quien, false);
      if r_v is distinct from r_n or r_n ? 'error' then
        dif := dif || jsonb_build_object('f', 'politicas', 'quien', quien, 'viejo', r_v, 'nuevo', r_n);
      end if;
      vistos := vistos || jsonb_build_object('filas_vistas', coalesce((vistos->>'filas_vistas')::int, 0) + coalesce((r_n->>'sessions')::int, 0));
    end loop;

    -- Operaciones al azar con las funciones nuevas; después de cada una, el cupo al día.
    for i in 1..15 loop
      op := floor(random() * 8)::int;
      quien := k[1 + floor(random() * nk)::int];
      otro := c[1 + floor(random() * nc)::int];
      r := case op
        when 0 then prueba.hacer(quien::text, format('select public.join_coach(%L)::jsonb', (select invite_code from public.profiles where id = otro)))
        when 1 then prueba.hacer(otro::text, format('select to_jsonb(public.coach_remove_client(%L))',
                                   coalesce((select id from public.profiles where coach_id = otro limit 1), quien)))
        when 2 then prueba.hacer(quien::text, 'select public.block_user(''chat'')')
        when 3 then prueba.hacer(quien::text, 'with x as (update public.profiles set coach_id = null where id = auth.uid() returning 1) select to_jsonb(count(*)) from x')
        when 4 then prueba.hacer(adm::text, format('select to_jsonb(true) from (select public.admin_unlink(%L)) x', quien))
        when 5 then prueba.hacer(adm::text, format('select to_jsonb(true) from (select public.admin_set_role(%L, %L)) x',
                                   (c || k)[1 + floor(random() * (nc + nk))::int], (array['client', 'coach'])[1 + floor(random() * 2)::int]))
        when 6 then prueba.hacer('postgres', 'select to_jsonb(public.release_lapsed_clients())')
        else prueba.hacer((c || k)[1 + floor(random() * (nc + nk))::int]::text, 'select to_jsonb(true) from (select public.delete_own_account()) x')
      end;
      vistos := vistos || jsonb_build_object('op' || op || (case when r ? 'error' then ':error' else ':ok' end),
                                             coalesce((vistos->>('op' || op || (case when r ? 'error' then ':error' else ':ok' end)))::int, 0) + 1);
      if exists (select 1 from public.seats_drift()) then
        dif := dif || jsonb_build_object('f', 'seats_drift', 'op', op, 'res', r, 'drift', (select jsonb_agg(d) from public.seats_drift() d));
      end if;
      if exists (select 1 from public.coach_billing b where b.seats_used <> (select count(*) from public.profiles x where x.coach_id = b.coach_id)) then
        dif := dif || jsonb_build_object('f', 'seats_used ≠ count(*)', 'op', op, 'res', r);
      end if;
    end loop;
    -- Otra vez, sobre el estado que quedó.
    select dif || coalesce(jsonb_agg(jsonb_build_object('f', 'coach_active (después)', 'coach', u)), '[]')
      into dif from unnest(c) u where viejo.coach_active(u) is distinct from public.coach_active(u);
    foreach quien in array c || k[1:3] loop
      perform set_config('request.jwt.claims', json_build_object('sub', quien, 'role', 'authenticated')::text, true);
      select dif || coalesce(jsonb_agg(jsonb_build_object('f', 'is_my_client (después)', 'quien', quien, 'de', u)), '[]')
        into dif from unnest(c || k) u where viejo.is_my_client(u) is distinct from public.is_my_client(u);
    end loop;
    perform set_config('request.jwt.claims', '', true);
    if exists (select 1 from public.gyms) or exists (select 1 from public.gym_members) or exists (select 1 from public.gym_staff) then
      dif := dif || jsonb_build_object('f', 'aparecieron filas de gimnasio');
    end if;
    raise exception using errcode = 'GZ998';
  exception when sqlstate 'GZ998' then null;
  end;
  return jsonb_build_object('dif', dif, 'vistos', vistos);
end $f$;

-- Varias semillas: las que dieron distinto (con sus primeras diferencias) y la suma de lo que se probó.
create function viejo.semillas(a int, b int) returns jsonb language plpgsql as $f$
declare s int; r jsonb; malas jsonb := '[]'; vistos jsonb := '{}'; k text;
begin
  for s in a..b loop
    r := viejo.semilla(s);
    if jsonb_array_length(r->'dif') > 0 then
      malas := malas || jsonb_build_object('semilla', s, 'dif', (select jsonb_agg(x) from (select x from jsonb_array_elements(r->'dif') x limit 5) y));
    end if;
    for k in select jsonb_object_keys(r->'vistos') loop
      vistos := vistos || jsonb_build_object(k, coalesce((vistos->>k)::int, 0) + coalesce((r->'vistos'->>k)::int, 0));
    end loop;
  end loop;
  return jsonb_build_object('malas', malas, 'vistos', vistos);
end $f$;
`;

// La semilla para comparar contra gize_sin: corre igual en las dos bases (solo usa lo de hoy) y
// devuelve lo que vio cada persona y lo que dio cada operación. Deshace todo.
const CONTRA_SIN = `
create schema if not exists igual;
create or replace function igual.semilla(s int) returns jsonb language plpgsql as $f$
declare nc int; nk int; i int; c uuid[] := '{}'; k uuid[] := '{}'; adm uuid := md5('adm:' || s)::uuid; r jsonb; lect jsonb := '{}'; ops jsonb := '[]';
  quien uuid; otro uuid; op int; res jsonb; tb text; q text;
  ofs interval[] := array[interval '1 hour', interval '-1 hour', interval '10 days', interval '-3 days -23 hours', interval '-4 days -1 hour', interval '-30 days'];
  consultas text[] := array[${['body_weights', 'checkins', 'client_prefs', 'daily_logs', 'food_entries', 'sessions', 'session_entries', 'client_info', 'blocks',
    'nutrition', 'routines', 'routine_schedule', 'cardio_outings', 'profiles', 'coach_messages', 'coach_billing'].map(tb => `'select to_jsonb(count(*)) from public.${tb}'`).join(', ')},
    'select to_jsonb(count(*)) from storage.objects where bucket_id = ''avatars''', 'select to_jsonb(count(*)) from storage.objects where bucket_id = ''chat-audio'''];
begin
  perform setseed(sin(s));
  begin
    nc := 3 + floor(random() * 3)::int;
    nk := 8 + floor(random() * 8)::int;
    for i in 1..nc loop c := c || md5('scoach:' || s || ':' || i)::uuid; end loop;
    for i in 1..nk loop k := k || md5('salumno:' || s || ':' || i)::uuid; end loop;
    insert into auth.users (id, email, raw_user_meta_data)
    select u, 'scoach' || o || '@ejemplo.test', jsonb_build_object('full_name', 'Coach ' || o, 'role', 'coach') from unnest(c) with ordinality x(u, o);
    insert into auth.users (id, email, raw_user_meta_data)
    select u, 'salumno' || o || '@ejemplo.test', jsonb_build_object('full_name', 'Alumno ' || o) from unnest(k) with ordinality x(u, o);
    insert into auth.users (id, email, raw_user_meta_data) values (adm, 'sadmin@ejemplo.test', '{"full_name":"Admin"}');
    insert into public.app_admins (user_id) values (adm);
    update public.profiles p set invite_code = 'SC' || lpad(x.o::text, 6, '0') from unnest(c) with ordinality x(u, o) where p.id = x.u;
    update public.coach_billing b set
      plan = (array['trial', 'p10', 'p25', 'p100', 'cortesia'])[1 + floor(random() * 5)::int],
      max_clients = 1 + floor(random() * 8)::int,
      trial_ends_at = now() + ofs[1 + floor(random() * 6)::int],
      paid_until = case when random() < 0.4 then null else now() + ofs[1 + floor(random() * 6)::int] end,
      mp_preapproval_id = case when random() < 0.15 then 'preaprobacion-de-prueba' end,
      mp_status = case when random() < 0.5 then 'authorized' else 'cancelled' end
     where b.coach_id = any(c);
    update public.profiles p set coach_id = case when random() < 0.2 then null else c[1 + floor(random() * nc)::int] end where p.id = any(k);
    update public.profiles p set coach_id = c[1] where p.id = c[2] and random() < 0.5;
    -- Los mensajes antes de los bloqueos (con un bloqueo no se pueden mandar).
    insert into public.coach_messages (coach_id, client_id, body, sender) select coach_id, id, 'Hola', 'coach' from public.profiles where id = any(k) and coach_id is not null;
    insert into public.user_blocks (blocker, blocked)
    select a, b from (select k[1 + floor(random() * nk)::int] as a, c[1 + floor(random() * nc)::int] as b from generate_series(1, 3)) x where random() < 0.6 on conflict do nothing;
    insert into public.sessions (id, client_id, performed_on, day_name) select md5('ssesion:' || u)::uuid, u, current_date, 'A' from unnest(k) u;
    insert into public.session_entries (session_id, client_id, exercise_name, set_order, kg, reps) select md5('ssesion:' || u)::uuid, u, 'Sentadilla', 1, 50, 10 from unnest(k) u;
    insert into public.body_weights (client_id, measured_on, kg) select u, current_date, 70 from unnest(k) u;
    insert into public.daily_logs (client_id, log_date, steps) select u, current_date, 5000 from unnest(k) u;
    insert into public.checkins (client_id, week_start) select u, current_date from unnest(k) u;
    insert into public.food_entries (client_id, log_date, name) select u, current_date, 'Avena' from unnest(k) u;
    insert into public.client_info (client_id, objective) select u, 'Fuerza' from unnest(k) u;
    insert into public.blocks (client_id, name) select u, 'Bloque' from unnest(k) u;
    insert into public.nutrition (client_id, kcal) select u, 2000 from unnest(k) u;
    insert into public.client_prefs (client_id) select u from unnest(k) u;
    insert into public.routines (client_id, days) select u, '[]' from unnest(k) u;
    insert into public.routine_schedule (client_id, starts_on, created_by) select id, current_date + 7, coach_id from public.profiles where id = any(k) and coach_id is not null;
    insert into public.cardio_outings (id, client_id, mode, performed_on, started_at, duration_s) select md5('ssalida:' || u)::uuid, u, 'pie', current_date, now(), 600 from unnest(k) u;
    insert into storage.objects (bucket_id, name, owner_id) select 'avatars', u || '/perfil.jpg', u::text from unnest(c || k) u;
    insert into storage.objects (bucket_id, name, owner_id) select 'chat-audio', coach_id || '/' || id || '/audio-de-prueba.webm', coach_id::text
      from public.profiles where id = any(k) and coach_id is not null;
    -- Lo que ve cada uno.
    foreach quien in array c || k[1:5] || adm || array[null::uuid] loop
      for i in 1..array_length(consultas, 1) loop
        lect := lect || jsonb_build_object(coalesce(quien::text, 'anon') || ':' || i, prueba.probar(coalesce(quien::text, 'anon'), consultas[i]));
      end loop;
    end loop;
    -- Las canónicas de gimnasios-admin.sql (etapa 1, parte 5), en las columnas y claves de hoy: Coaches y
    -- pagos y el Resumen como el admin de GIZE, y el mail de vencimiento como el service role (las
    -- fechas como «ya pasó o no»: las dos bases arman los datos con un now() apenas distinto).
    lect := lect || jsonb_build_object(
      'admin_coaches', prueba.probar(adm::text, 'select coalesce(jsonb_agg(jsonb_build_array(id, full_name, email, plan, max_clients, clients, trial_ends_at > now(),
          paid_until > now(), mp_status, has_mp, pending_plan, active, price) order by id), ''[]'') from public.admin_coaches()'),
      'admin_overview', prueba.probar(adm::text, 'select public.admin_overview() - ''gyms'' - ''gym_socios'' - ''gym_profes'''),
      'hay_avisos_vence', prueba.probar('postgres', 'select to_jsonb(public.hay_avisos_vence())'),
      'tomar_avisos_vence', prueba.probar('servicio', 'select coalesce(jsonb_agg(jsonb_build_array(coach_id, vence > now(), prueba, clientes) order by coach_id), ''[]'') from public.tomar_avisos_vence()'),
      'soltar_aviso_vence', prueba.probar('servicio', format('select to_jsonb(true) from (select public.soltar_aviso_vence(%L)) x', c[1])));
    -- Las operaciones de hoy; después de cada una, el estado.
    for i in 1..14 loop
      op := floor(random() * 9)::int;
      quien := k[1 + floor(random() * nk)::int];
      otro := c[1 + floor(random() * nc)::int];
      res := case op
        when 0 then prueba.hacer(quien::text, format('select to_jsonb(public.join_coach(%L))', (select invite_code from public.profiles where id = otro)))
        when 1 then prueba.hacer(otro::text, format('select to_jsonb(public.coach_remove_client(%L))', coalesce((select id from public.profiles where coach_id = otro order by id limit 1), quien)))
        when 2 then prueba.hacer(quien::text, 'select public.block_user(''chat'')')
        when 3 then prueba.hacer(quien::text, 'with x as (update public.profiles set coach_id = null where id = auth.uid() returning 1) select to_jsonb(count(*)) from x')
        when 4 then prueba.hacer(adm::text, format('select to_jsonb(true) from (select public.admin_unlink(%L)) x', quien))
        when 5 then prueba.hacer(adm::text, format('select to_jsonb(true) from (select public.admin_set_role(%L, %L)) x', (c || k)[1 + floor(random() * (nc + nk))::int], (array['client', 'coach'])[1 + floor(random() * 2)::int]))
        when 6 then prueba.hacer('postgres', 'select to_jsonb(public.release_lapsed_clients())')
        when 7 then prueba.hacer(quien::text, 'select to_jsonb(true) from (select public.delete_own_account()) x')
        else prueba.hacer(otro::text, 'select to_jsonb(true) from (select public.delete_own_account()) x')
      end;
      ops := ops || jsonb_build_object('op', op, 'res', res,
        'perfiles', (select jsonb_agg(jsonb_build_array(id, coach_id, role, coach_left_at is not null) order by id) from public.profiles),
        'programadas', (select count(*) from public.routine_schedule), 'bloqueos', (select count(*) from public.user_blocks),
        'mensajes', (select count(*) from public.coach_messages), 'cuentas', (select count(*) from auth.users), 'filas_plan', (select count(*) from public.coach_billing));
    end loop;
    r := jsonb_build_object('lect', lect, 'ops', ops);
    raise exception using errcode = 'GZ998';
  exception when sqlstate 'GZ998' then null;
  end;
  return r;
end $f$;
`;

export default async function ({ t }){
  const h = await conPg(t);
  if (!h) return;
  const db = await h.nueva('gize_con');

  // Las versiones de hoy: el bloque «Para volver atrás» de gimnasios-vinculo.sql, que tiene que ser
  // copia textual de los archivos de donde salen.
  const atras = volverAtras(leer('supabase/gimnasios-vinculo.sql'));
  for (const [fn, f] of [['coach_active', 'cupo-plan.sql'], ['is_my_client', 'suscripciones.sql'], ['join_coach', 'bloqueos.sql'], ['release_lapsed_clients', 'coach-vencido.sql']]){
    const s = sentencia(leer('supabase/' + f), fn);
    t.ok(s && sentencia(atras, fn) === s, 'el bloque «Para volver atrás» de gimnasios-vinculo.sql tiene la ' + fn + ' de hoy (' + f + '), tal cual');
  }
  const vieja = atras.split('-- Y lo que agregó este archivo:')[0].replace(/public\.(coach_active|is_my_client|join_coach|release_lapsed_clients)\b/g, 'viejo.$1');
  const textos = ['coach_active', 'is_my_client'].map(fn => `insert into viejo.textos values ('${fn}', $t$${sentencia(atras, fn)}$t$);`).join('\n');
  await db.sql('create schema viejo;\n' + vieja + DRIVER + textos, { una: true });
  const tipos = await db.json(`select json_object_agg(proname, pg_get_function_result(oid)) from pg_proc where pronamespace = 'viejo'::regnamespace
    and proname in ('coach_active', 'is_my_client', 'join_coach', 'release_lapsed_clients');`);
  t.eq(tipos, { coach_active: 'boolean', is_my_client: 'boolean', join_coach: 'boolean', release_lapsed_clients: 'integer' }, 'las cuatro de hoy, cargadas aparte (esquema viejo)');

  const N = Number(process.env.GIZE_SEMILLAS) || 200, desde = Number(process.env.GIZE_SEMILLA) || 1, LOTE = 20;
  const malas = [], vistos = {};
  const t0 = Date.now();
  for (let a = desde; a < desde + N; a += LOTE){
    const b = Math.min(a + LOTE - 1, desde + N - 1);
    const r = await db.json(`select viejo.semillas(${a}, ${b});`);
    malas.push(...r.malas);
    for (const [k, v] of Object.entries(r.vistos)) vistos[k] = (vistos[k] || 0) + v;
    if (malas.length >= 3) break;
  }
  console.log('    ' + N + ' semillas en ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s: ' + JSON.stringify(vistos));
  t.eq(malas.map(m => m.semilla), [], 'sin gimnasios, las funciones nuevas dan lo mismo que las de hoy en todas las semillas (para repetir una: GIZE_SEMILLA=n GIZE_SEMILLAS=1)'
    + (malas.length ? ': ' + JSON.stringify(malas[0]).slice(0, 1500) : ''));
  // Que se haya probado de todo (si no, los datos al azar no sirven).
  const j = k => Object.entries(vistos).filter(([x]) => x.startsWith('join:') && x.includes(k)).reduce((s, [, v]) => s + v, 0);
  t.ok(vistos.coach_active_si > 0 && vistos.coach_active_no > 0, 'coaches con y sin plan vigente');
  t.ok(vistos.is_my_client_si > N, 'pares en que is_my_client da sí: ' + vistos.is_my_client_si);
  t.ok(j('join:true') > 0 && j('join:false') > 0, 'join_coach que vincula y que no');
  for (const [k, que] of [['plan de GIZE', 'plan vencido'], ['llegó al máximo', 'cupo lleno'], ['No podés sumarte', 'bloqueo'], ['Probaste muchos', 'tope de códigos']])
    t.ok(j(k) > 0, 'join_coach que frena por ' + que + ': ' + j(k));
  t.ok(vistos.liberados > 0, 'release_lapsed_clients que libera alumnos: ' + vistos.liberados);
  t.ok(vistos.filas_vistas > 0, 'personas que leen registros por las políticas');
  for (let op = 0; op < 8; op++) t.ok(vistos['op' + op + ':ok'] > 0, 'la operación ' + op + ' anduvo alguna vez (después de cada una, el cupo al día)');
  await db.borrar();

  // ===== Etapa 1: con los cuatro archivos de los gimnasios, contra la base de hoy =====
  const sin = await h.nueva('gize_sin'), con = await h.nueva('gize_con');
  await sin.sql(CONTRA_SIN, { una: true });
  await con.sql(CONTRA_SIN, { una: true });
  const NS = Number(process.env.GIZE_SEMILLAS_SIN) || 30;
  const distintas = [];
  let lecturas = 0, avisos = 0, coachesAdmin = 0, operaciones = {}, t1 = Date.now();
  for (let sd = desde; sd < desde + NS; sd++){
    const [a, b] = await Promise.all([sin.json(`select igual.semilla(${sd});`), con.json(`select igual.semilla(${sd});`)]);
    if (JSON.stringify(a) !== JSON.stringify(b)){
      const dl = Object.keys(a.lect).filter(k => JSON.stringify(a.lect[k]) !== JSON.stringify(b.lect[k])).slice(0, 3).map(k => k + ' sin=' + JSON.stringify(a.lect[k]) + ' con=' + JSON.stringify(b.lect[k]));
      const io = a.ops.findIndex((o, i) => JSON.stringify(o) !== JSON.stringify(b.ops[i]));
      distintas.push({ semilla: sd, lecturas: dl, op: io < 0 ? null : { sin: a.ops[io], con: b.ops[io] } });
      if (distintas.length >= 2) break;
    }
    lecturas += Object.values(a.lect).filter(v => v.ok > 0).length;
    avisos += (a.lect.tomar_avisos_vence.ok || []).length;
    coachesAdmin += (a.lect.admin_coaches.ok || []).length;
    for (const o of a.ops) { const k = 'op' + o.op + (o.res.error ? ':error' : ':ok'); operaciones[k] = (operaciones[k] || 0) + 1; }
  }
  console.log('    contra gize_sin: ' + NS + ' semillas en ' + ((Date.now() - t1) / 1000).toFixed(1) + ' s: ' + JSON.stringify(operaciones));
  t.eq(distintas.map(d => d.semilla), [], 'sin gimnasios, con los cinco archivos aplicados, cada persona lee lo mismo que en la base de hoy (13 tablas, perfiles, mensajes, coach_billing, avatars y chat-audio), el admin ve lo mismo en Coaches y pagos y el Resumen, el mail de vencimiento toma a los mismos y las operaciones de hoy dan lo mismo'
    + (distintas.length ? ': ' + JSON.stringify(distintas[0]).slice(0, 2000) : ''));
  t.ok(lecturas > NS * 20, 'lecturas con filas: ' + lecturas);
  t.ok(avisos > 0 && coachesAdmin > 0, 'el admin ve coaches (' + coachesAdmin + ') y hubo avisos de vencimiento para tomar (' + avisos + ')');
  for (let op = 0; op < 9; op++) t.ok(operaciones['op' + op + ':ok'] > 0, 'contra gize_sin, la operación ' + op + ' anduvo alguna vez');
  await sin.borrar(); await con.borrar();
}
