// supabase/resumen-semanal.sql (el resumen de los lunes para los coaches).
// 1) Leído: encabezado, la guarda del principio, tablas con RLS y sin políticas ni permisos, quién
//    puede llamar cada función, el cron, que arranca apagado y que no lleva mails ni uuids.
// 2) De verdad, en la base de pruebas con Postgres (tests/pg.mjs; sin Postgres se saltea), con fechas
//    fijas (semana del lunes 19 de octubre de 2026, hoy martes 27): qué cuenta como entrenó, días sin
//    entrenar, los nuevos sin empezar, los récords (con la regla del festejo), a quién le llega, una vez
//    por semana, reintentos, dos tomas a la vez, la ventana, el tope del día, los permisos, la baja con
//    el token, el interruptor del coach, el panel y cuánto tarda una tanda con un gimnasio grande. Con
//    los gimnasios: cada profe con los socios que ve.
import { conPg, leer, lit } from './pg.mjs';
import { P, DATOS, ayudas, VENCE, conCanon } from './gimnasios-comun.mjs';

const fn = (sql, name) => {
  const i = sql.indexOf('create or replace function public.' + name + '(');
  if (i < 0) return '';
  const a = sql.indexOf('$$', i), b = sql.indexOf('$$', a + 2);
  return sql.slice(i, b + 2);
};

// Personas inventadas (uuid de prueba armados acá: el archivo del repo no lleva ninguno).
const U = n => 'c5000000-0000-4000-8000-' + String(n).padStart(12, '0');
const C = { uno: U(1), prueba: U(2), apagado: U(3), vencido: U(4), sinAlumnos: U(5), nada: U(6), enPrueba: U(7), otro: U(8), admin: U(9) };
const A = { ana: U(11), beto: U(12), carla: U(13), dani: U(14), eva: U(15), fede: U(16), gabi: U(17), hugo: U(18), ines: U(19), juli: U(20), kevin: U(21), lola: U(22) };
// Martes 27 de octubre de 2026 al mediodía de Argentina: resume la semana del lunes 19 al domingo 25.
const AHORA = "'2026-10-27 12:00:00-03'::timestamptz";
const tomar = (max = 8, ahora = AHORA) => `select coalesce(jsonb_agg(jsonb_build_object('coach', x.coach_id, 'semana', x.semana, 'nombre', x.nombre, 'token', x.token is not null, 'datos', x.datos) order by x.coach_id), '[]'::jsonb)
  from public.tomar_resumenes_semanales(${max}, ${ahora}) x`;

const CARGA = `
insert into auth.users (id, email, created_at, raw_user_meta_data) values
  ('${C.uno}', 'uno@ejemplo.test', '2026-01-10', '{"full_name":"Coach Uno","role":"coach"}'),
  ('${C.prueba}', 'prueba@ejemplo.test', '2026-01-10', '{"full_name":"Coach Prueba","role":"coach"}'),
  ('${C.apagado}', 'apagado@ejemplo.test', '2026-01-10', '{"full_name":"Coach Apagado","role":"coach"}'),
  ('${C.vencido}', 'vencido@ejemplo.test', '2026-01-10', '{"full_name":"Coach Vencido","role":"coach"}'),
  ('${C.sinAlumnos}', 'sin@ejemplo.test', '2026-01-10', '{"full_name":"Coach Solo","role":"coach"}'),
  ('${C.nada}', 'nada@ejemplo.test', '2026-01-10', '{"full_name":"Coach Quieto","role":"coach"}'),
  ('${C.enPrueba}', 'enprueba@ejemplo.test', '2026-01-10', '{"full_name":"Coach Nueva","role":"coach"}'),
  ('${C.otro}', 'otro@ejemplo.test', '2026-01-10', '{"full_name":"Coach Otro","role":"coach"}'),
  ('${C.admin}', 'admin@ejemplo.test', '2026-01-10', '{"full_name":"Admin"}'),
  ('${A.ana}', 'ana@ejemplo.test', '2026-02-01', '{"full_name":"Ana Activa"}'),
  ('${A.beto}', 'beto@ejemplo.test', '2026-02-01', '{"full_name":"Beto Nueve"}'),
  ('${A.carla}', 'carla@ejemplo.test', '2026-02-01', '{"full_name":"Carla Vieja"}'),
  ('${A.dani}', 'dani@ejemplo.test', '2026-10-20 12:00-03', '{"full_name":"Dani Nuevo"}'),
  ('${A.eva}', 'eva@ejemplo.test', '2026-01-05', '{"full_name":"Eva Antigua"}'),
  ('${A.fede}', 'fede@ejemplo.test', '2026-02-01', '{"full_name":"Fede Lunes"}'),
  ('${A.gabi}', 'gabi@ejemplo.test', '2026-02-01', '{"full_name":"Gabi Prueba"}'),
  ('${A.hugo}', 'hugo@ejemplo.test', '2026-02-01', '{"full_name":"Hugo Apagado"}'),
  ('${A.ines}', 'ines@ejemplo.test', '2026-02-01', '{"full_name":"Inés Vencida"}'),
  ('${A.juli}', 'juli@ejemplo.test', '2026-01-05', '{"full_name":"Juli Quieta"}'),
  ('${A.kevin}', 'kevin@ejemplo.test', '2026-02-01', '{"full_name":"Kevin Nueva"}'),
  ('${A.lola}', 'lola@ejemplo.test', '2026-02-01', '{"full_name":"Lola Otro"}');
insert into public.app_admins (user_id) values ('${C.admin}');
update public.coach_billing set plan = 'p10', max_clients = 10, trial_ends_at = now() - interval '60 days', paid_until = now() + interval '20 days'
 where coach_id in ('${C.uno}', '${C.prueba}', '${C.apagado}', '${C.sinAlumnos}', '${C.nada}', '${C.otro}');
update public.coach_billing set trial_ends_at = now() - interval '30 days', paid_until = null where coach_id = '${C.vencido}';
update public.coach_billing set trial_ends_at = now() + interval '10 days', paid_until = null where coach_id = '${C.enPrueba}';
update public.profiles set coach_id = '${C.uno}' where id in ('${A.ana}', '${A.beto}', '${A.carla}', '${A.dani}', '${A.eva}', '${A.fede}');
update public.profiles set coach_id = '${C.prueba}' where id = '${A.gabi}';
update public.profiles set coach_id = '${C.apagado}' where id = '${A.hugo}';
update public.profiles set coach_id = '${C.vencido}' where id = '${A.ines}';
update public.profiles set coach_id = '${C.nada}' where id = '${A.juli}';
update public.profiles set coach_id = '${C.enPrueba}' where id = '${A.kevin}';
update public.profiles set coach_id = '${C.otro}' where id = '${A.lola}';
insert into public.test_accounts (user_id) values ('${C.prueba}');
insert into public.resumen_semanal_coach (coach_id, apagado_at) values ('${C.apagado}', now());
-- Entrenos: [alumno, fecha, [[ejercicio, kg, reps], …]].
insert into public.sessions (id, client_id, performed_on, day_name) select md5(x.k)::uuid, x.a::uuid, x.f::date, 'A' from (values
  ('ana-1', '${A.ana}', '2026-09-28'), ('ana-2', '${A.ana}', '2026-10-05'), ('ana-3', '${A.ana}', '2026-10-12'),
  ('ana-4', '${A.ana}', '2026-10-19'), ('ana-5', '${A.ana}', '2026-10-21'), ('ana-6', '${A.ana}', '2026-10-23'), ('ana-7', '${A.ana}', '2026-10-28'),
  ('beto-1', '${A.beto}', '2026-10-18'), ('carla-1', '${A.carla}', '2026-07-29'),
  ('fede-1', '${A.fede}', '2026-10-12'), ('fede-2', '${A.fede}', '2026-10-19'),
  ('gabi-1', '${A.gabi}', '2026-10-20'), ('hugo-1', '${A.hugo}', '2026-10-20'), ('ines-1', '${A.ines}', '2026-10-20'),
  ('kevin-1', '${A.kevin}', '2026-10-22'), ('lola-1', '${A.lola}', '2026-10-22')) x(k, a, f);
insert into public.session_entries (session_id, client_id, exercise_name, set_order, kg, reps) select md5(x.k)::uuid, s.client_id, x.ej, 1, x.kg, x.reps
  from (values
  -- Sentadilla: mejor marca 95; en la semana 98 y 100 (se informa 100).
  ('ana-1', 'Sentadilla', 90, 5), ('ana-2', 'Sentadilla', 95, 5), ('ana-5', 'Sentadilla', 98, 5), ('ana-6', 'Sentadilla', 100, 5),
  -- Press banca: sin marca anterior.
  ('ana-4', 'Press banca', 60, 8),
  -- Remo: el mismo peso.
  ('ana-2', 'Remo', 70, 8), ('ana-4', 'Remo', 70, 8),
  -- Peso muerto: 160 es un error de tipeo (×2,5 y 20 kg más que la siguiente, 60): récord con 65 contra 60.
  ('ana-1', 'Peso muerto', 60, 5), ('ana-2', 'Peso muerto', 160, 5), ('ana-5', 'Peso muerto', 65, 5),
  -- Curl: 55 contra 20 es un salto de tipeo en la semana: no es récord.
  ('ana-3', 'Curl', 20, 10), ('ana-5', 'Curl', 55, 10),
  -- Dominadas: asistida (negativo), 0 kg y 0 reps no cuentan.
  ('ana-3', 'Dominadas', 10, 5), ('ana-4', 'Dominadas', -5, 5), ('ana-5', 'Dominadas', 0, 5), ('ana-6', 'Dominadas', 15, 0),
  -- Prensa: más de 500 kg no cuenta.
  ('ana-3', 'Prensa', 400, 10), ('ana-6', 'Prensa', 520, 10),
  -- Lo que viene después de hoy no cuenta.
  ('ana-7', 'Sentadilla', 120, 5),
  ('fede-1', 'Sentadilla', 50, 5), ('fede-2', 'Sentadilla', 52.5, 5)) x(k, ej, kg, reps)
  join public.sessions s on s.id = md5(x.k)::uuid;
insert into public.checkins (client_id, week_start) values ('${A.ana}', '2026-10-19'), ('${A.beto}', '2026-10-12');
`;

export default async function ({ t: t0 }){
  // eq sin mirar el orden de las claves (jsonb las ordena a su manera).
  const t = conCanon(t0);
  const sql = leer('supabase/resumen-semanal.sql');
  const code = sql.replace(/--[^\n]*/g, '');

  // ---------- 1) Leído ----------
  t.has(sql, 'Correr con el workflow "Supabase" → tarea sql → supabase/resumen-semanal.sql', 'encabezado: cómo correrlo');
  t.has(sql, 'Se puede correr\n-- varias veces', 'encabezado: se puede correr varias veces');
  t.has(sql, 'ARRANCA APAGADO', 'encabezado: arranca apagado');
  t.ok(/después de\s+(--\s+)?avisos-coach\.sql \(cron_secret\), admin\.sql \(admin_assert y admin_log\), cupo-plan\.sql \(coach_active\) y\s+(--\s+)?cuentas-prueba\.sql/.test(sql), 'encabezado: de qué depende');
  t.has(sql, 'Antes: publicar la función resumen-semanal', 'encabezado: primero la función');
  const guarda = code.indexOf('do $$ begin'), primera = code.indexOf('create table');
  t.ok(guarda >= 0 && guarda < primera && /to_regprocedure\('public\.cron_secret\(\)'\) is null/.test(code) && /to_regprocedure\('public\.admin_assert\(\)'\) is null/.test(code)
    && /to_regprocedure\('public\.coach_active\(uuid\)'\) is null/.test(code), 'lo primero es la guarda: sin cron_secret, admin_assert o coach_active no aplica nada');
  t.ok(/activo\s+boolean not null default false/.test(code), 'arranca apagado (activo = false)');
  t.ok(/tope_dia\s+int not null default 60/.test(code), 'tope de 60 mails por día');
  for (const tb of ['resumen_semanal_config', 'resumen_semanal_coach', 'resumen_semanal_envios']){
    t.ok(code.includes('create table if not exists public.' + tb + ' ('), tb + ': se crea si no está');
    t.ok(code.includes('alter table public.' + tb + ' enable row level security;'), tb + ': RLS prendido');
    t.ok(code.includes('revoke all on public.' + tb + ' from anon, authenticated;'), tb + ': sin permisos para la app');
  }
  t.ok(!/create policy/i.test(code) && !/grant [^;]*\bon (table )?public\.(resumen_|test_accounts)/i.test(code), 'sin políticas ni grants sobre las tablas');
  t.ok(!/drop table/i.test(code), 'no borra tablas');
  t.ok(!/(?:^|[^.\w])(?:nombre|full_name|email)\s+text/m.test(code.slice(code.indexOf('resumen_semanal_envios ('), code.indexOf('primary key (coach_id, semana)'))), 'los envíos no guardan nombres ni mails');
  const INTERNAS = ['resumen_semanal_semana(timestamptz)', 'resumen_semanal_en_ventana(timestamptz)', 'resumen_semanal_ve(uuid, uuid)', 'resumen_semanal_datos(uuid[], date, date)',
    'resumen_semanal_cupo(timestamptz)', 'resumen_semanal_pendientes(date)', 'hay_resumenes_semanales(timestamptz)', 'tomar_resumenes_semanales(int, timestamptz)',
    'resumen_semanal_listo(uuid, date, boolean, boolean)', 'soltar_resumen_semanal(uuid, date)', 'resumen_semanal_baja(uuid, boolean)'];
  for (const sig of INTERNAS) t.ok(code.includes('revoke all on function public.' + sig + ' from public, anon, authenticated;'), sig + ': nada para la app');
  const SERVICIO = ['tomar_resumenes_semanales(int, timestamptz)', 'resumen_semanal_listo(uuid, date, boolean, boolean)', 'soltar_resumen_semanal(uuid, date)', 'resumen_semanal_baja(uuid, boolean)'];
  for (const sig of SERVICIO) t.ok(code.includes('grant execute on function public.' + sig + ' to service_role;'), sig + ': la service role (la función)');
  t.eq([...code.matchAll(/grant execute on function public\.(\w+)\([^)]*\) to service_role;/g)].map(m => m[1]).sort(), ['resumen_semanal_baja', 'resumen_semanal_listo', 'soltar_resumen_semanal', 'tomar_resumenes_semanales'], 'ninguna otra interna para la service role');
  for (const sig of ['resumen_semanal_estado()', 'resumen_semanal_cambiar(boolean)', 'admin_resumen_semanal()', 'admin_resumen_semanal_config(boolean, int)']){
    t.ok(code.includes('revoke all on function public.' + sig + ' from public, anon;'), sig + ': nada sin sesión');
    t.ok(code.includes('grant execute on function public.' + sig + ' to authenticated;'), sig + ': con sesión');
  }
  for (const name of ['resumen_semanal_semana', 'resumen_semanal_en_ventana', 'resumen_semanal_ve', 'resumen_semanal_datos', 'resumen_semanal_cupo', 'resumen_semanal_pendientes',
    'hay_resumenes_semanales', 'tomar_resumenes_semanales', 'resumen_semanal_listo', 'soltar_resumen_semanal', 'resumen_semanal_baja', 'resumen_semanal_estado', 'resumen_semanal_cambiar',
    'admin_resumen_semanal', 'admin_resumen_semanal_config'])
    t.ok(/security definer set search_path = public/.test(fn(code, name)), name + ': security definer con search_path fijo');
  for (const name of ['admin_resumen_semanal', 'admin_resumen_semanal_config'])
    t.ok(/\bbegin\s+perform public\.admin_assert\(\);/.test(fn(code, name)), name + ': lo primero es admin_assert');
  t.ok(/perform public\.admin_log\('resumen_semanal', null, jsonb_build_object\('activo'/.test(fn(code, 'admin_resumen_semanal_config')), 'prender y apagar queda en el registro');
  // No redefine nada que ya existe (no hay nota «OJO»): solo funciones nuevas.
  const definidas = [...code.matchAll(/create or replace function public\.(\w+)\(/g)].map(m => m[1]);
  t.ok(definidas.every(n => /^(resumen_semanal_|hay_resumenes_semanales$|tomar_resumenes_semanales$|soltar_resumen_semanal$|admin_resumen_semanal)/.test(n)), 'solo define funciones nuevas: ' + definidas.join(', '));
  t.ok(!/coach_alerts|queue_inactivity_alerts/.test(code), 'no toca los avisos de inactividad');
  // Los entrenos y el último entreno de cada alumno salen de una sola pasada por los entrenos de la
  // tanda (group by), no de una consulta por alumno: con un gimnasio grande, eso tardaba de más.
  const datosFn = fn(code, 'resumen_semanal_datos');
  t.ok(/from se group by se\.client_id/.test(datosFn) && !/\(select [^()]*from se where se\.client_id = a\.alumno/.test(datosFn),
    'resumen_semanal_datos: una sola pasada por los entrenos, no una por alumno');
  t.ok(/cron\.schedule\('gize-resumen-semanal', '\*\/5 12-15 \* \* 1-3'/.test(code), 'cron de lunes a miércoles, de 9 a 12:55 de Argentina, cada 5 minutos');
  t.ok(/\/functions\/v1\/resumen-semanal'/.test(code) && /'x-cron-secret', public\.cron_secret\(\)/.test(code), 'llama a la función con el secreto del cron');
  t.ok(/timeout_milliseconds := 60000/.test(code), 'con el tiempo máximo escrito (pg_net corta a los pocos segundos)');
  t.ok(/where public\.hay_resumenes_semanales\(\);\s*\$job\$/.test(code), 'solo llama si hay algo para mandar');
  t.ok(/select cron\.unschedule\('gize-resumen-semanal'\) where exists/.test(code), 'se puede volver a agendar');
  t.ok(!/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/.test(sql), 'sin mails');
  t.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(sql), 'sin uuids de cuentas');
  t.ok(/select \(select activo[^;]*count\(\*\) from public\.resumen_semanal_envios\) as envios_guardados;\s*$/.test(code), 'termina mostrando solo cantidades (el registro del workflow es público)');

  // ---------- 2) De verdad, con Postgres ----------
  const h = await conPg(t);
  if (!h) return;
  const db = await h.nueva('gize_sin');
  try {
    const { J, V, PROBAR, HACER } = ayudas(db);
    await db.archivo('supabase/resumen-semanal.sql');
    t.ok(true, 'se puede volver a correr');
    t.eq(await J(`select jsonb_build_array((select activo from public.resumen_semanal_config), (select tope_dia from public.resumen_semanal_config), (select count(*) from cron.job where jobname = 'gize-resumen-semanal'))`),
      [false, 60, 1], 'arranca apagado, con tope de 60 y un solo trabajo de pg_cron');
    await db.sql(CARGA);
    const prender = `update public.resumen_semanal_config set activo = true where id = 1`;
    // El trabajo de pg_cron, corrido de verdad (con la hora de la prueba en lugar de now()): lo que deja
    // en la cola de pg_net (simulado, tests/pg/supabase-simulado.sql).
    const comando = String(await J(`select to_jsonb(command) from cron.job where jobname = 'gize-resumen-semanal'`));
    const correrCron = async () => {
      await db.sql('delete from net.http_request_queue;\n' + comando.replace('public.hay_resumenes_semanales()', 'public.hay_resumenes_semanales(' + AHORA + ')'));
      return J(`select coalesce(jsonb_agg(jsonb_build_array(url, headers->>'x-cron-secret', body, timeout_milliseconds)), '[]') from net.http_request_queue`);
    };

    // Apagado: no hace nada.
    t.eq(await J(`select to_jsonb(public.hay_resumenes_semanales(${AHORA}))`), false, 'apagado: el cron no llama');
    t.eq(await correrCron(), [], 'apagado: el trabajo de pg_cron no llama a la función');
    t.eq(await PROBAR('servicio', tomar()), [], 'apagado: no toma a nadie');

    // La ventana.
    const ventana = f => J(`select to_jsonb(public.resumen_semanal_en_ventana('${f}'::timestamptz))`);
    t.eq([await ventana('2026-10-26 08:59-03'), await ventana('2026-10-26 09:00-03'), await ventana('2026-10-28 23:59-03'), await ventana('2026-10-29 12:00-03'), await ventana('2026-10-25 12:00-03')],
      [false, true, true, false, false], 'ventana: lunes 8:59 no, lunes 9:00 sí, miércoles 23:59 sí, jueves y domingo no');
    t.eq(await J(`select to_jsonb(public.resumen_semanal_semana(${AHORA}))`), '2026-10-19', 'el martes 27 resume la semana del lunes 19');
    t.eq(await J(`select to_jsonb(public.resumen_semanal_semana('2026-10-26 09:00-03'))`), '2026-10-19', 'el lunes 26 a las 9 también');

    // Los datos de la tanda, sin tomar nada.
    const d = await J(`select jsonb_object_agg(x.coach_id, x.datos) from public.resumen_semanal_datos(array['${C.uno}', '${C.vencido}', '${C.nada}']::uuid[], '2026-10-19', '2026-10-27') x`);
    const uno = d[C.uno] || {};
    t.eq([uno.alumnos, uno.entrenaron, uno.entrenos, uno.checkins], [6, 2, 4, 1], 'entrenaron Ana (3 entrenos) y Fede (1): 4 entrenos de 6 alumnos; 1 check-in de esa semana');
    t.eq(uno.sin_entrenar, [{ nombre: 'Beto Nueve', dias: 9 }, { nombre: 'Fede Lunes', dias: 8 }], 'para escribirles: Beto lleva 9 días y Fede (entrenó solo el lunes) 8; Ana entrenó hace 4 y lo de después de hoy no cuenta');
    t.eq([uno.sin_entrenar_mas, uno.sin_empezar, uno.sin_empezar_mas, uno.sin_actividad], [0, ['Dani Nuevo'], 0, 2], 'Dani es nuevo sin entrenos; Carla (90 días) y Eva (cuenta vieja sin entrenos) van en una línea');
    t.eq(uno.records, [{ nombre: 'Ana Activa', items: [{ ej: 'Peso muerto', kg: 65, antes: 60 }, { ej: 'Sentadilla', kg: 100, antes: 95 }], total: 2 },
      { nombre: 'Fede Lunes', items: [{ ej: 'Sentadilla', kg: 52.5, antes: 50 }], total: 1 }],
      'récords: con marca anterior (el más alto de la semana), con el error de tipeo de antes salteado; sin marca anterior, el mismo peso, un salto de ×2,5, kg negativos, 0, sin reps o de más de 500 no');
    t.eq(uno.records_total, 3, 'tres récords en total');
    t.eq(uno.semana, '2026-10-19', 'la semana va en los datos');
    t.eq([d[C.vencido] && d[C.vencido].alumnos, d[C.nada] && d[C.nada].alumnos, d[C.nada] && d[C.nada].sin_actividad], [0, 1, 1], 'plan vencido: no ve a nadie; Coach Quieto solo tiene una alumna que nunca entrenó');

    // Prendido: a quién le llega.
    await db.sql(prender);
    t.eq(await J(`select to_jsonb(public.hay_resumenes_semanales(${AHORA}))`), true, 'prendido y en la ventana: el cron llama');
    t.eq(await correrCron(), [['https://wegptuzhsrwppbknqstf.supabase.co/functions/v1/resumen-semanal', 'secreto-de-prueba', {}, 60000]],
      'prendido: el trabajo de pg_cron llama una vez a la función, con el secreto del cron y 60 s de tiempo máximo');
    t.eq(await J(`select to_jsonb(public.hay_resumenes_semanales('2026-10-29 12:00-03'))`), false, 'el jueves no');
    let r = await HACER('servicio', tomar());
    t.eq(r.map(x => x.coach), [C.uno, C.enPrueba, C.otro].sort(), 'le llega al coach con plan, al que está en la prueba gratis y a otro con plan; no a la cuenta de prueba, al que lo apagó, al vencido, al que no tiene alumnos ni al que no tiene novedades');
    const r1 = r.find(x => x.coach === C.uno) || {};
    t.eq([r1.semana, r1.nombre, r1.token, r1.datos && r1.datos.entrenaron], ['2026-10-19', 'Coach Uno', true, 2], 'con la semana, el nombre del coach, su token y los datos');
    const envios = () => J(`select jsonb_object_agg(coach_id, jsonb_build_array(estado, intentos, alumnos, entrenaron, records)) from public.resumen_semanal_envios`);
    let e = await envios();
    t.eq(e[C.uno], ['tomado', 1, 6, 2, 3], 'queda tomado, con solo cantidades');
    t.eq([e[C.vencido] && e[C.vencido][0], e[C.nada] && e[C.nada][0]], ['sin_novedades', 'sin_novedades'], 'el vencido y el que no tiene novedades quedan sin_novedades (no se vuelven a intentar)');
    t.ok(!e[C.prueba] && !e[C.apagado] && !e[C.sinAlumnos], 'la cuenta de prueba, el apagado y el que no tiene alumnos ni se anotan');
    t.eq(await J(`select to_jsonb(count(*)) from public.resumen_semanal_coach where coach_id in ('${C.uno}', '${C.enPrueba}', '${C.otro}')`), 3, 'cada uno tiene su token');

    // Una vez por semana.
    t.eq(await HACER('servicio', tomar()), [], 'tomar otra vez no devuelve a nadie');
    t.eq(await J(`select to_jsonb(public.hay_resumenes_semanales(${AHORA}))`), false, 'y el cron ya no llama');
    t.eq(await HACER('servicio', `select to_jsonb(public.resumen_semanal_listo('${C.enPrueba}', '2026-10-19', true, false))`), null, 'listo');
    t.eq((await envios())[C.enPrueba].slice(0, 1), ['enviado'], 'queda enviado');
    t.eq(await J(`select jsonb_build_array(mail, aviso) from public.resumen_semanal_envios where coach_id = '${C.enPrueba}'`), [true, false], 'con mail y sin aviso');
    // Reintentos.
    for (const [vez, estado] of [[1, 'reintentar'], [2, 'reintentar'], [3, 'fallido']]){
      await HACER('servicio', `select to_jsonb(public.soltar_resumen_semanal('${C.uno}', '2026-10-19'))`);
      e = await envios();
      t.eq(e[C.uno].slice(0, 2), [estado, vez], 'soltar ' + vez + ': ' + estado);
      if (estado === 'reintentar'){
        t.eq(await J(`select to_jsonb(public.hay_resumenes_semanales(${AHORA}))`), true, 'para reintentar: el cron llama');
        t.eq((await HACER('servicio', tomar())).map(x => x.coach), [C.uno], 'se vuelve a tomar');
        t.eq((await envios())[C.uno].slice(0, 2), ['tomado', vez + 1], 'con un intento más');
      }
    }
    t.eq(await HACER('servicio', tomar()), [], 'al tercer intento queda fallido y no se toma más');
    t.eq(await HACER('servicio', `select to_jsonb(public.resumen_semanal_listo('${C.uno}', '2026-10-19', true, true))`), null, 'listo de uno fallido no hace nada');
    t.eq((await envios())[C.uno][0], 'fallido', 'sigue fallido');

    // La semana siguiente vuelve a tocar.
    t.eq((await PROBAR('servicio', tomar(8, "'2026-11-02 09:05-03'::timestamptz"))).map(x => x.coach + ' ' + x.semana), [C.uno, C.enPrueba, C.otro].map(c => c + ' 2026-10-26'), 'la semana siguiente, otro resumen (semana del 26)');

    // El tope del día (día UTC).
    const tope = await V([['postgres', `delete from public.resumen_semanal_envios; update public.resumen_semanal_config set tope_dia = 1`],
      ['servicio', tomar()], ['servicio', tomar()], ['postgres', `select to_jsonb(public.hay_resumenes_semanales(${AHORA}))`],
      ['servicio', tomar(8, "'2026-10-28 09:00-03'::timestamptz")]]);
    t.eq([tope[1].length, tope[2].length, tope[3], tope[4].length], [1, 0, false, 1], 'con tope 1: uno por día (los sin novedades no cuentan); el resto al día siguiente');
    t.eq(tope[1][0] && tope[1][0].coach, C.uno, 'el primero');

    // Apagar frena lo que falta.
    const ap = await V([['postgres', `delete from public.resumen_semanal_envios; update public.resumen_semanal_config set activo = false`], ['servicio', tomar()],
      ['postgres', `select to_jsonb(public.hay_resumenes_semanales(${AHORA}))`]]);
    t.eq([ap[1], ap[2]], [[], false], 'apagado a mitad de semana: no se toma a nadie más');

    // Dos tomas a la vez: la primera se queda adentro de su transacción un segundo.
    await db.sql(`delete from public.resumen_semanal_envios;`);
    const q = `set role service_role; select count(*) from public.tomar_resumenes_semanales(8, ${AHORA});`;
    const [a1, a2] = await Promise.all([db.sql('begin; ' + q + ' select pg_sleep(1); commit;'), new Promise(ok => setTimeout(() => db.sql(q).then(ok), 200))]);
    t.eq([a1.trim().split('\n')[0], a2.trim()], ['3', '0'], 'dos tomas a la vez: cada resumen sale una sola vez');

    // Permisos.
    const llamadas = [tomar(), `select to_jsonb(public.resumen_semanal_listo('${C.uno}', '2026-10-19', true, true))`, `select to_jsonb(public.soltar_resumen_semanal('${C.uno}', '2026-10-19'))`,
      `select to_jsonb(public.resumen_semanal_baja(gen_random_uuid(), false))`, `select to_jsonb(count(*)) from public.resumen_semanal_datos(array['${C.uno}']::uuid[], '2026-10-19', '2026-10-27')`,
      `select to_jsonb(public.hay_resumenes_semanales())`, `select to_jsonb(public.resumen_semanal_ve('${C.uno}', '${A.ana}'))`, `select to_jsonb(public.resumen_semanal_cupo())`];
    for (const quien of ['anon', C.uno, A.ana]){
      const res = await V(llamadas.map(x => [quien, x]));
      t.eq(res.map(x => x && x.error), llamadas.map(() => '42501'), (quien === 'anon' ? 'sin sesión' : quien === C.uno ? 'el coach' : 'un alumno') + ': las internas no se pueden llamar');
    }

    // El coach lo apaga y lo prende (la app); el alumno no puede.
    t.eq(await PROBAR(C.uno, `select to_jsonb(public.resumen_semanal_estado())`), true, 'el coach: le llega');
    t.eq(await PROBAR(A.ana, `select to_jsonb(public.resumen_semanal_estado())`), null, 'un alumno: no es para él (null)');
    // Apagado en el panel de GIZE: null para todos los coaches (la app no muestra la tarjeta, porque igual
    // no llega), y lo que eligió cada uno sigue guardado para cuando se prenda.
    const panel = await V([['postgres', `update public.resumen_semanal_config set activo = false where id = 1`],
      [C.uno, `select to_jsonb(public.resumen_semanal_estado())`], [C.apagado, `select to_jsonb(public.resumen_semanal_estado())`],
      ['postgres', `update public.resumen_semanal_config set activo = true where id = 1`], [C.apagado, `select to_jsonb(public.resumen_semanal_estado())`]]);
    t.eq([panel[1], panel[2], panel[4]], [null, null, false], 'apagado en el panel: null (sin tarjeta); prendido otra vez, el que lo había apagado sigue apagado');
    const sw = await V([[C.uno, `select to_jsonb(public.resumen_semanal_cambiar(false))`], [C.uno, `select to_jsonb(public.resumen_semanal_estado())`],
      ['postgres', `select coalesce(jsonb_agg(x), '[]') from public.resumen_semanal_pendientes('2026-12-07') x`],
      [C.otro, `select to_jsonb(public.resumen_semanal_estado())`],
      [C.uno, `select to_jsonb(public.resumen_semanal_cambiar(true))`], [C.uno, `select to_jsonb(public.resumen_semanal_estado())`],
      [A.ana, `select to_jsonb(public.resumen_semanal_cambiar(false))`]]);
    t.eq([sw[0], sw[1]], [false, false], 'apagar: queda apagado');
    t.ok(Array.isArray(sw[2]) && !sw[2].includes(C.uno) && sw[2].includes(C.otro), 'apagado, no está entre los pendientes; los demás sí: ' + JSON.stringify(sw[2]));
    t.eq(sw[3], true, 'apagar el suyo no cambia el de otro coach');
    t.eq([sw[4], sw[5]], [true, true], 'prender: le vuelve a llegar');
    t.eq(sw[6] && sw[6].error, '42501', 'un alumno no lo puede cambiar');

    // La baja desde el mail, con el token (sin sesión: la hace la función con la service role).
    const tok = await J(`select to_jsonb(token) from public.resumen_semanal_coach where coach_id = '${C.otro}'`);
    const baja = await V([['servicio', `select to_jsonb(public.resumen_semanal_baja(${lit(tok)}::uuid, false))`],
      [C.otro, `select to_jsonb(public.resumen_semanal_estado())`],
      ['servicio', `select to_jsonb(public.resumen_semanal_baja(${lit(tok)}::uuid, true))`],
      [C.otro, `select to_jsonb(public.resumen_semanal_estado())`],
      ['servicio', `select to_jsonb(public.resumen_semanal_baja(gen_random_uuid(), false))`]]);
    t.eq(baja, [true, false, true, true, false], 'con el token se apaga y se vuelve a prender; un token que no existe no hace nada');

    // El panel: solo el admin, y queda en el registro.
    // Los envíos de la última semana (la de hoy de verdad: el panel mira now()).
    const sem = 'public.resumen_semanal_semana(now())';
    const pan = await V([['postgres', `delete from public.resumen_semanal_envios;
        insert into public.resumen_semanal_envios (coach_id, semana, estado, mail, aviso) values ('${C.uno}', ${sem}, 'enviado', true, false),
          ('${C.enPrueba}', ${sem}, 'enviado', true, true), ('${C.otro}', ${sem}, 'reintentar', null, null), ('${C.vencido}', ${sem}, 'sin_novedades', null, null),
          ('${C.nada}', ${sem}, 'fallido', null, null), ('${C.uno}', ${sem} - 7, 'enviado', true, true)`],
      [C.admin, `select public.admin_resumen_semanal()`], [C.admin, `select public.admin_resumen_semanal_config(true, 40)`],
      ['postgres', `select jsonb_agg(jsonb_build_array(action, detail)) from public.admin_audit where action = 'resumen_semanal'`],
      [C.uno, `select public.admin_resumen_semanal()`], [C.uno, `select public.admin_resumen_semanal_config(true, 40)`], ['anon', `select public.admin_resumen_semanal()`],
      [C.admin, `select public.admin_resumen_semanal_config(null, 6000)`]]);
    pan.shift();
    const p0 = pan[0] || {};
    t.ok(['activo', 'tope_dia', 'semana', 'en_ventana', 'proximo_lunes', 'cupo_hoy', 'pendientes', 'candidatos', 'enviados', 'con_mail', 'con_aviso', 'sin_novedades', 'reintentar', 'en_curso', 'fallidos', 'apagados'].every(k => k in p0),
      'el panel trae el estado y los números de la última semana: ' + JSON.stringify(p0));
    t.eq(['enviados', 'con_mail', 'con_aviso', 'sin_novedades', 'reintentar', 'en_curso', 'fallidos', 'apagados', 'candidatos', 'pendientes'].map(k => p0[k]), [2, 2, 1, 1, 1, 0, 1, 1, 5, 1],
      'los números de la última semana (la anterior no cuenta), los que lo apagaron, a cuántos les llegaría y cuántos faltan');
    t.eq([p0.activo, p0.tope_dia], [true, 60], 'prendido, con el tope de 60');
    t.ok(/^\d{4}-\d{2}-\d{2}T09:00:00-03:00$/.test(p0.proximo_lunes || '') && new Date(p0.proximo_lunes).getUTCDay() === 1, 'el próximo envío es un lunes a las 9 de Argentina: ' + p0.proximo_lunes);
    t.eq([pan[1] && pan[1].activo, pan[1] && pan[1].tope_dia], [true, 40], 'prender y cambiar el tope');
    t.eq(pan[2], [['resumen_semanal', { activo: true, tope_dia: 40 }]], 'queda en el registro de acciones');
    t.eq([pan[3] && pan[3].error, pan[4] && pan[4].error, pan[5] && pan[5].error], ['42501', '42501', '42501'], 'nadie más ve ni cambia el panel');
    t.eq(pan[6] && pan[6].error, 'P0001', 'un tope fuera de 0 a 5000 no se guarda');

    // Cuánto tarda: un gimnasio (o un coach) con 400 alumnos de 150 entrenos cada uno, más 7 coaches
    // de 20 alumnos, en una sola tanda. Con una consulta por alumno tardaba unos 8 s: la llamada de la
    // función se cortaba por tiempo y, como la tanda no se anotaba, el cron volvía a trabarse con los
    // mismos coaches cada 5 minutos y no le llegaba a nadie. Con una sola pasada, menos de 1 s.
    await db.sql(`
insert into auth.users (id, email, created_at, raw_user_meta_data)
select ('c7000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, 'g' || g || '@ejemplo.test', '2026-01-01', '{"full_name":"Coach Grande","role":"coach"}' from generate_series(1, 8) g;
update public.coach_billing set plan = 'cortesia' where coach_id::text like 'c7000000-%';
insert into auth.users (id, email, created_at, raw_user_meta_data)
select ('c7100000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, 'h' || g || '@ejemplo.test', '2026-01-01', '{"full_name":"Socio Prueba"}' from generate_series(1, 540) g;
update public.profiles set coach_id = ('c7000000-0000-4000-8000-' || lpad((case when substr(id::text, 25)::int <= 400 then 1 else 2 + (substr(id::text, 25)::int - 401) / 20 end)::text, 12, '0'))::uuid
 where id::text like 'c7100000-%';
insert into public.sessions (id, client_id, performed_on, day_name)
select gen_random_uuid(), p.id, date '2026-10-25' - s, 'A' from public.profiles p, generate_series(0, 149) s where p.id::text like 'c7100000-%';
insert into public.session_entries (session_id, client_id, exercise_name, set_order, kg, reps)
select s.id, s.client_id, 'Ej ' || e, 1, 20 + (s.performed_on - date '2026-01-01') % 60, 5 from public.sessions s, generate_series(1, 2) e
 where s.client_id::text like 'c7100000-%';
analyze;`);
    const lento = await J(`set jit = off;
create temp table _t0 as select clock_timestamp() as t0;
create temp table _r as select x.coach_id, x.datos from public.resumen_semanal_datos(array(select ('c7000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid from generate_series(1, 8) g), '2026-10-19', '2026-10-27') x;
select jsonb_build_object('ms', round(extract(epoch from clock_timestamp() - (select t0 from _t0)) * 1000), 'alumnos', (select sum((datos->>'alumnos')::int) from _r));`);
    console.log('    resumen_semanal_datos con 540 alumnos y 81.000 entrenos: ' + lento.ms + ' ms');
    t.eq(lento.alumnos, 540, 'la tanda grande trae a todos los alumnos');
    t.ok(lento.ms < 3000, 'una tanda con un gimnasio de 400 socios tarda menos de 3 s: ' + lento.ms + ' ms');
  } finally {
    await db.borrar();
  }

  // ---------- 3) Con los gimnasios ----------
  const g = await h.nueva('gize_con');
  try {
    t.eq(await g.json(DATOS), [], 'las personas de los gimnasios cumplen los invariantes');
    await g.archivo('supabase/resumen-semanal.sql');
    const { V } = ayudas(g);
    // Los entrenos de DATOS son de hoy (current_date): se pide la semana de hoy.
    const alumnos = `select jsonb_object_agg(x.coach_id, (x.datos->>'alumnos')::int) from public.resumen_semanal_datos(array['${P.pA1}', '${P.dA}', '${P.pA2}', '${P.C}']::uuid[],
      date_trunc('week', current_date)::date, current_date) x`;
    const nombres = `select jsonb_agg(n order by n) from (select jsonb_array_elements_text(x.datos->'sin_empezar') as n from public.resumen_semanal_datos(array['${P.pA1}']::uuid[],
      date_trunc('week', current_date)::date, current_date + 60) x union all select jsonb_array_elements(x.datos->'sin_entrenar')->>'nombre' from public.resumen_semanal_datos(array['${P.pA1}']::uuid[],
      date_trunc('week', current_date)::date, current_date + 60) x) y`;
    const ve = (c, a) => `select to_jsonb(public.resumen_semanal_ve('${P[c]}', '${P[a]}'))`;
    const pend = `select coalesce(jsonb_agg(x), '[]') from public.resumen_semanal_pendientes(date_trunc('week', current_date)::date) x`;
    const r = await V([['postgres', alumnos], ['postgres', nombres], ['postgres', ve('pA1', 'A1')], ['postgres', ve('pA1', 'A2')], ['postgres', ve('pA1', 'P1')], ['postgres', ve('pA1', 'C1')],
      ['postgres', pend]]);
    t.eq(r[0], { [P.pA1]: 3, [P.dA]: 2, [P.pA2]: 0, [P.C]: 1 }, 'cada profe con los que ve: Martina con A1, A2 (socios) y P1 (propio); la dueña con A7 y D1; Lucas sin nadie; el coach de afuera con C1');
    t.eq(r[1], ['Juan Pérez', 'Martina Sosa', 'Tomás Herrera'], 'los socios y el alumno propio de Martina, por su nombre');
    t.eq([r[2], r[3], r[4], r[5]], [true, true, true, false], 'resumen_semanal_ve: sus socios y su alumno sí; el alumno de otro coach no');
    t.ok(Array.isArray(r[6]) && !r[6].includes(P.aA) && !r[6].includes(P.rA) && r[6].includes(P.pA1) && r[6].includes(P.dA), 'la administración y la recepción (sin alumnos) no reciben nada; la dueña y los profes con alumnos sí');
    const pausa = await V([['postgres', `update public.gym_members set status = 'pausado' where member_id = '${P.A2}'`], ['postgres', alumnos], ['postgres', ve('pA1', 'A2')]]);
    t.eq([pausa[1] && pausa[1][P.pA1], pausa[2]], [2, false], 'un socio en pausa no cuenta');
    const vence = await V([['postgres', VENCE('dA', '6 days')], ['postgres', alumnos]]);
    t.eq([vence[1] && vence[1][P.pA1], vence[1] && vence[1][P.dA]], [1, 0], 'con el plan del gimnasio vencido (acceso de los profes pausado): Martina se queda solo con su alumno propio, la dueña sin nadie');
  } finally {
    await g.borrar();
  }
}
