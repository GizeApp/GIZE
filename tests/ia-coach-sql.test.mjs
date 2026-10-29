// La base de la IA del coach (supabase/ia.sql), la que comparten «Pasar mis planillas» y «Armar con
// IA». Todavía no la usa la app ni la función «ia»: arranca apagada.
// 1) Leído: las funciones nuevas con sus permisos y security definer; los defaults de funciones y
//    topes iguales en el create table y en el alter (una base nueva y una vieja quedan iguales).
// 2) En Postgres de verdad (tests/pg.mjs; sin Postgres se saltea):
//    - ia_rol_coach: coach con plan pago o de cortesía → 'coach'; en su prueba gratis → 'prueba'
//      (sobre el cupo de la prueba o vencido, null); alumno o cuenta sin coach → null; la app no la
//      puede llamar. Con gimnasios: el profe de un gimnasio con el plan al día → 'coach'; si el
//      gimnasio está en la prueba, la dueña y el profe (con su propia prueba) → 'prueba'; la
//      administración y la recepción → null. Las fotos de comida del coach en prueba siguen como
//      'alumno' (ia_rol).
//    - ia_reservar con 'planilla' y 'prueba': los topes de entrada (prueba 15/5/20 y US$1; coach
//      con 30 planillas y 60 en total), el tope del día por función y en total, el de US$ por ciclo,
//      que 'prueba' solo reserva planillas y rutinas, y el modo ahorro (frena a 'prueba'; al coach
//      le pasa planillas y rutinas al modelo barato).
//    - Los checks de ia_llamadas aceptan 'prueba' y 'planilla' y rechazan lo inventado.
//    - admin_ia_config acepta modelos.planilla y los topes de 'prueba'.
//    - ia_coach_estado (lo que ve el panel del coach, sin montos) y el permiso «Usar IA en tus
//      rutinas» (ia_permiso_rutinas), que no toca el de Comida.
//    - «¿Está mal? Avisanos» con planillas y rutinas (ia_reportar e ia_reportes).
//    - Correr ia.sql sobre una base vieja (checks con otro nombre, sin planillas ni 'prueba', el
//      total del coach en 40): cambia los checks buscándolos por la columna, suma lo nuevo sin
//      pisar lo que cambió el dueño y sube el total a 60 solo si seguía en 40 y solo una vez.
import { conPg, leer } from './pg.mjs';
import { ayudas, P, DATOS, conCanon } from './gimnasios-comun.mjs';

const sinComentarios = s => s.replace(/--[^\n]*/g, '');
const fn = (sql, name) => {
  const i = sql.indexOf('create or replace function public.' + name + '(');
  if (i < 0) return '';
  const a = sql.indexOf('$$', i), b = sql.indexOf('$$', a + 2);
  return sql.slice(i, b + 2);
};
const ID = n => 'c1000000-0000-4000-8000-' + String(n).padStart(12, '0');
// Personas (inventadas): coach con plan pago, de cortesía, en su prueba, vencido, en la prueba con
// más alumnos que su cupo, alumnos y una cuenta de administración.
const U = { CP: ID(1), CC: ID(2), CT: ID(3), CV: ID(4), CL: ID(5), AL: ID(6), AL2: ID(7), AD: ID(8) };
const PERSONAS = `
insert into auth.users (id, email, raw_user_meta_data) values
  ('${U.CP}', 'cp@ejemplo.test', '{"full_name":"Coach Pago","role":"coach"}'),
  ('${U.CC}', 'cc@ejemplo.test', '{"full_name":"Coach Cortesia","role":"coach"}'),
  ('${U.CT}', 'ct@ejemplo.test', '{"full_name":"Coach Prueba","role":"coach"}'),
  ('${U.CV}', 'cv@ejemplo.test', '{"full_name":"Coach Vencido","role":"coach"}'),
  ('${U.CL}', 'cl@ejemplo.test', '{"full_name":"Coach Lleno","role":"coach"}'),
  ('${U.AL}', 'al@ejemplo.test', '{"full_name":"Alumna Uno"}'),
  ('${U.AL2}', 'al2@ejemplo.test', '{"full_name":"Alumno Dos"}'),
  ('${U.AD}', 'ad@ejemplo.test', '{"full_name":"Admin"}');
update public.coach_billing set plan = 'p10', max_clients = 10, trial_ends_at = now() - interval '30 days', paid_until = now() + interval '20 days' where coach_id = '${U.CP}';
update public.coach_billing set plan = 'cortesia', trial_ends_at = now() - interval '30 days' where coach_id = '${U.CC}';
update public.coach_billing set trial_ends_at = now() - interval '1 day' where coach_id = '${U.CV}';
update public.coach_billing set max_clients = 1 where coach_id = '${U.CL}';
update public.profiles set coach_id = '${U.CL}' where id in ('${U.AL}', '${U.AL2}');
insert into public.app_admins (user_id) values ('${U.AD}');
`;
const PRENDER = `update public.ia_config set activa = true, ancla = date_trunc('day', now() - interval '3 days'),
  funciones = funciones || '{"planilla": true, "rutina": true, "plato": true}'::jsonb where id = 1`;
const rolc = uid => `select to_jsonb(public.ia_rol_coach('${uid}'))`;
const res = (uid, rol, fun, max = 0.01) => `select public.ia_reservar('${uid}', '${rol}', '${fun}', 'modelo-prueba', ${max})`;
const cod = r => r && (r.ok === true ? 'ok' : r.codigo || r.error);
const avisar = (fun, resp, com = null) => `select to_jsonb(count(*)) from (select public.ia_reportar('${fun}', ${resp}, ${com === null ? 'null' : "'" + com + "'"})) x`;

export default async function ({ t: t0 }){
  const t = conCanon(t0);
  // ---------- 1) Leído ----------
  const sql = leer('supabase/ia.sql'), code = sinComentarios(sql);
  for (const sig of ['ia_rol_coach(uuid)', 'ia_permiso_rutinas_estado(uuid)']){
    const e = sig.replace(/[()]/g, '\\$&');
    t.ok(new RegExp('revoke all on function public\\.' + e + ' from public, anon, authenticated;').test(code) && code.includes('grant execute on function public.' + sig + ' to service_role;'), sig + ': solo la service role');
  }
  for (const sig of ['ia_coach_estado()', 'ia_permiso_rutinas(boolean, int)']){
    const e = sig.replace(/[()]/g, '\\$&');
    t.ok(new RegExp('revoke all on function public\\.' + e + ' from public, anon;').test(code) && code.includes('grant execute on function public.' + sig + ' to authenticated;') && !code.includes('grant execute on function public.' + sig + ' to anon'), sig + ': solo con sesión');
  }
  for (const name of ['ia_rol_coach', 'ia_permiso_rutinas_estado', 'ia_coach_estado', 'ia_permiso_rutinas'])
    t.ok(/security definer set search_path = public/.test(fn(code, name)), name + ': security definer con search_path fijo');
  t.ok(/v_uid uuid := auth\.uid\(\)/.test(fn(code, 'ia_coach_estado')) && /v_uid uuid := auth\.uid\(\)/.test(fn(code, 'ia_permiso_rutinas')), 'la app solo toca lo suyo (auth.uid())');
  t.ok(!/usd|gastado|credito/.test(fn(code, 'ia_coach_estado').split("return jsonb_build_object('activa', true")[1] || 'usd'), 'ia_coach_estado no devuelve montos');
  t.ok(/add column if not exists aviso_rutinas_version int not null default 1;/.test(code), 'el aviso «Usar IA en tus rutinas» arranca en la versión 1');
  t.ok(['rutinas_ok_at timestamptz', 'rutinas_no_at timestamptz', 'rutinas_version int not null default 0'].every(c => code.includes('alter table public.ia_permisos add column if not exists ' + c + ';')), 'ia_permisos: columnas propias del permiso del coach');
  t.ok(!/coach_(ok|no)_at/.test(fn(code, 'ia_permiso_rutinas') + fn(code, 'ia_permiso_rutinas_estado') + fn(code, 'ia_coach_estado')), 'no usa coach_ok_at ni coach_no_at (son del permiso del alumno para el resumen)');
  const defs = re => [...code.matchAll(re)].map(m => JSON.parse(m[1]));
  const funs = defs(/funciones\s+(?:jsonb not null default|set default) '([^']+)'/g), topes = defs(/topes\s+(?:jsonb not null default|set default) '([^']+)'/g);
  t.ok(funs.length === 2 && JSON.stringify(funs[0]) === JSON.stringify(funs[1]), 'funciones: el default del create table y el del alter son iguales');
  t.ok(topes.length === 2 && JSON.stringify(topes[0]) === JSON.stringify(topes[1]), 'topes: el default del create table y el del alter son iguales');
  t.eq(funs[0] && funs[0].planilla, false, 'la función planilla arranca apagada');
  t.eq(topes[0] && topes[0].prueba, { planilla: 15, rutina: 5, total: 20, usd_ciclo: 1 }, 'topes del coach en prueba: 15 planillas, 5 rutinas, 20 en total y US$1 por ciclo');
  t.eq(topes[0] && [topes[0].coach.planilla, topes[0].coach.rutina, topes[0].coach.total, topes[0].coach.usd_ciclo], [30, 15, 60, 5], 'topes del coach: 30 planillas, 15 rutinas, 60 en total y US$5');

  // ---------- 2) En Postgres ----------
  const h = await conPg(t);
  if (!h) return;

  // ===== Sin gimnasios =====
  const db = await h.nueva('gize_sin');
  await db.sql(PERSONAS);
  const { J, V } = ayudas(db);
  const ini = await J(`select jsonb_build_object('funciones', funciones, 'topes', topes) from public.ia_config`);
  t.eq(ini.funciones.planilla, false, 'base nueva: la planilla arranca apagada');
  t.eq([ini.topes.prueba, ini.topes.coach.planilla, ini.topes.coach.total], [{ planilla: 15, rutina: 5, total: 20, usd_ciclo: 1 }, 30, 60], 'base nueva: los topes de prueba y de coach');

  // Quién es quién.
  const QUIENES = ['CP', 'CC', 'CT', 'CV', 'CL', 'AL', 'AD'];
  let r = await V(QUIENES.map(k => ['servicio', rolc(U[k])]).concat([['servicio', `select to_jsonb(public.ia_rol('${U.CT}'))`]]));
  t.eq(r.slice(0, QUIENES.length), ['coach', 'coach', 'prueba', null, null, null, null], 'ia_rol_coach: pago y cortesía → coach; prueba → prueba; vencido, prueba sobre el cupo, alumna y admin → null');
  t.eq(r[QUIENES.length], 'alumno', 'las fotos de comida del coach en prueba siguen como alumno (ia_rol)');
  r = await V([[U.CT, rolc(U.CT)], ['anon', rolc(U.CT)]]);
  t.eq(r.map(x => x && x.error), ['42501', '42501'], 'ia_rol_coach: la app (ni sin sesión) no la puede llamar');

  // La guardia con planillas y con el rol «prueba».
  r = await V([['postgres', PRENDER],
    ['servicio', res(U.CT, 'prueba', 'planilla')], ['servicio', res(U.CT, 'prueba', 'plato')], ['servicio', res(U.CP, 'coach', 'planilla')],
    ['servicio', res(U.CT, 'prueba', 'rutina')],
    ['postgres', `select jsonb_agg(jsonb_build_array(rol, funcion, origen) order by id) from public.ia_llamadas`],
    // Topes del día (por función y en total).
    ['postgres', `update public.ia_config set topes = jsonb_set(topes, '{prueba}', '{"planilla": 2, "rutina": 5, "total": 3, "usd_ciclo": 1}') where id = 1`],
    ['servicio', res(U.CT, 'prueba', 'planilla')], ['servicio', res(U.CT, 'prueba', 'planilla')], ['servicio', res(U.CT, 'prueba', 'rutina')],
    // US$ por ciclo.
    ['postgres', `delete from public.ia_llamadas; update public.ia_config set topes = jsonb_set(topes, '{prueba}', '{"planilla": 15, "rutina": 5, "total": 20, "usd_ciclo": 1}') where id = 1`],
    ['servicio', res(U.CT, 'prueba', 'planilla', 0.6)], ['servicio', res(U.CT, 'prueba', 'planilla', 0.6)], ['servicio', res(U.CP, 'coach', 'planilla', 0.6)],
    // Modo ahorro.
    ['postgres', `update public.ia_ciclos set gastado = 150 where inicio <= now() and fin > now()`],
    ['servicio', res(U.CT, 'prueba', 'rutina')], ['servicio', res(U.CT, 'prueba', 'planilla')],
    ['servicio', res(U.CP, 'coach', 'planilla')], ['servicio', res(U.CP, 'coach', 'rutina')], ['servicio', res(U.CP, 'coach', 'plato')],
    // Los checks de ia_llamadas.
    ['postgres', `insert into public.ia_llamadas (ciclo_id, rol, funcion, modelo, max_usd) select id, 'alumno', 'inventada', 'm', 0.01 from public.ia_ciclos limit 1`],
    ['postgres', `insert into public.ia_llamadas (ciclo_id, rol, funcion, modelo, max_usd) select id, 'inventado', 'plato', 'm', 0.01 from public.ia_ciclos limit 1`]]);
  t.ok(r[1] && r[1].ok === true && r[1].ahorro === false, 'prueba: reserva una planilla: ' + JSON.stringify(r[1]));
  t.eq([cod(r[2]), r[2] && r[2].motivo], ['error', 'pedido'], 'prueba: no reserva otra cosa que planillas y rutinas (la foto del plato va como alumno)');
  t.eq([cod(r[3]), cod(r[4])], ['ok', 'ok'], 'el coach con plan reserva una planilla y el de prueba una rutina');
  t.eq(r[5], [['prueba', 'planilla', null], ['coach', 'planilla', 'plan'], ['prueba', 'rutina', null]], 'cada llamada queda con su rol (prueba sin origen) y su función');
  t.eq([cod(r[7]), cod(r[8]), r[8] && r[8].tope], ['ok', 'tope_dia', 2], 'prueba: tope de planillas por día');
  t.eq([cod(r[9]), r[9] && r[9].tope], ['tope_dia', 3], 'prueba: tope del total por día');
  t.eq([cod(r[11]), cod(r[12]), cod(r[13])], ['ok', 'tope_persona', 'ok'], 'prueba: US$1 por ciclo (el coach sigue con sus US$5)');
  t.eq([cod(r[15]), r[15] && !!r[15].vuelve, cod(r[16])], ['ahorro', true, 'ahorro'], 'ahorro: el coach en prueba no usa la IA del coach (y vuelve con el ciclo que viene)');
  t.eq([r[17] && r[17].ok, r[17] && r[17].ahorro, r[18] && r[18].ahorro, r[19] && r[19].ok, r[19] && r[19].ahorro], [true, true, true, true, false], 'ahorro: al coach con plan, planillas y rutinas al modelo barato; la foto del plato sigue igual');
  t.eq([r[20] && r[20].error, r[21] && r[21].error], ['23514', '23514'], 'ia_llamadas: una función o un rol inventados no entran');

  // ia_coach_estado: apagada (como arranca), para cada persona y sin sesión.
  const est = k => [U[k], 'select public.ia_coach_estado()'];
  r = await V([est('CP'), est('CT'), est('CV'), est('AL'), ['anon', 'select public.ia_coach_estado()']]);
  t.eq(r[0], { activa: false, funciones: { planilla: false, rutina: false }, rol: 'coach', motivo: null, permiso_rutinas: null, aviso_version: 1 }, 'apagada: nada para el coach (y el permiso, para Configuración)');
  t.eq([r[1] && r[1].rol, r[1] && r[1].activa], ['prueba', false], 'apagada: el coach en prueba tampoco');
  t.eq([r[2] && r[2].rol, r[2] && r[2].motivo, r[3] && r[3].rol, r[3] && r[3].motivo], [null, 'sin_plan', null, 'no_coach'], 'sin rol: coach sin plan ni prueba (sin_plan) y alumna (no_coach)');
  t.eq(r[4] && r[4].error, '42501', 'sin sesión no se puede preguntar');
  r = await V([['postgres', PRENDER], est('CP'), est('CT'), est('CV'), est('AL'),
    ['postgres', `update public.ia_config set funciones = funciones || '{"planilla": false}' where id = 1`], est('CP'),
    ['postgres', `update public.ia_config set ancla = null where id = 1`], est('CP')]);
  t.eq(r[1], { activa: true, funciones: { planilla: true, rutina: true }, rol: 'coach', por_gimnasio: false, permiso_rutinas: null, aviso_version: 1, estado: 'normal', vuelve: null,
    manana: r[1] && r[1].manana, quedan: { planilla: 30, rutina: 15 }, tope: { planilla: 30, rutina: 15, total: 60 } }, 'prendida: el coach con plan, con sus topes (y sin montos)');
  t.ok(r[1] && Date.parse(r[1].manana) > Date.now() && Date.parse(r[1].manana) - Date.now() <= 864e5, 'manana: la medianoche que viene');
  t.eq([r[2] && r[2].activa, r[2] && r[2].rol, r[2] && r[2].quedan, r[2] && r[2].tope], [true, 'prueba', { planilla: 15, rutina: 5 }, { planilla: 15, rutina: 5, total: 20 }], 'prendida: el coach en prueba, con los suyos');
  t.eq([r[3] && r[3].activa, r[3] && r[3].funciones, r[3] && r[3].motivo, r[4] && r[4].activa, r[4] && r[4].motivo], [false, { planilla: false, rutina: false }, 'sin_plan', false, 'no_coach'], 'prendida: sin rol no hay nada');
  t.eq(r[6] && r[6].funciones, { planilla: false, rutina: true }, 'cada función con su interruptor');
  t.eq(r[8] && r[8].activa, false, 'sin la fecha de los créditos no anda');

  // ia_coach_estado cuenta como ia_reservar: lo de hoy con el mismo rol (la foto de comida del coach
  // en prueba va como alumno y no cuenta) y el total con todas las funciones de ese rol.
  r = await V([['postgres', PRENDER],
    ['servicio', res(U.CT, 'prueba', 'planilla')], ['servicio', res(U.CT, 'prueba', 'rutina')], ['servicio', res(U.CT, 'alumno', 'plato')], est('CT'),
    ['servicio', res(U.CP, 'coach', 'planilla')], ['servicio', res(U.CP, 'coach', 'plato')],
    ['postgres', `update public.ia_config set topes = jsonb_set(topes, '{coach,total}', '2') where id = 1`], est('CP'),
    ['postgres', `update public.ia_config set topes = jsonb_set(topes, '{prueba,usd_ciclo}', '0.02') where id = 1`], est('CT'),
    ['postgres', `update public.ia_config set topes = jsonb_set(jsonb_set(topes, '{prueba,usd_ciclo}', '1'), '{coach,total}', '60') where id = 1;
                  update public.ia_ciclos set gastado = 150 where inicio <= now() and fin > now()`], est('CT'), est('CP'),
    ['postgres', `update public.ia_ciclos set estado = 'cortado', cortado_por = 'tope', vuelve = fin where inicio <= now() and fin > now()`], est('CP'),
    ['postgres', `update public.ia_ciclos set cortado_por = 'creditos', vuelve = now() + interval '20 minutes' where inicio <= now() and fin > now()`], est('CT'),
    ['postgres', `update public.ia_ciclos set cortado_por = 'admin', vuelve = null where inicio <= now() and fin > now()`], est('CP')]);
  t.ok([1, 2, 3, 5, 6].every(i => r[i] && r[i].ok === true), 'las reservas pasan: ' + JSON.stringify([1, 2, 3, 5, 6].map(i => r[i])));
  t.eq([r[4] && r[4].quedan, r[4] && r[4].estado], [{ planilla: 14, rutina: 4 }, 'normal'], 'prueba: le quedan 14 planillas y 4 rutinas (la foto del plato no cuenta)');
  t.eq(r[8] && r[8].quedan, { planilla: 0, rutina: 0 }, 'coach: el total del día cuenta también sus fotos de comida (como ia_reservar)');
  t.eq([r[10] && r[10].estado, !!(r[10] && r[10].vuelve)], ['tope_persona', true], 'prueba: llegó a sus US$ del ciclo');
  t.eq([r[12] && r[12].estado, !!(r[12] && r[12].vuelve), r[13] && r[13].estado], ['ahorro', true, 'normal'], 'modo ahorro: el coach en prueba espera al ciclo que viene; el coach con plan sigue');
  t.eq([r[15] && r[15].estado, !!(r[15] && r[15].vuelve), r[17] && r[17].estado, r[19] && r[19].estado], ['tope_mes', true, 'pausada', 'pausada'], 'ciclo cortado: tope del mes, sin créditos o por el admin');

  // El permiso «Usar IA en tus rutinas»: con la versión del aviso, apagar y prender en orden, el aviso
  // nuevo, y que no toca el de Comida (ni al revés).
  const PERM = `select jsonb_build_object('rutinas', public.ia_permiso_rutinas_estado('${U.CT}'), 'comida', public.ia_permiso_estado('${U.CT}'))`;
  r = await V([[U.CT, 'select public.ia_permiso_rutinas(true, 2)'], [U.CT, 'select public.ia_permiso_rutinas(null)'], ['anon', 'select public.ia_permiso_rutinas(true, 1)'],
    [U.CT, 'select public.ia_permiso_rutinas(true, 1)'], ['servicio', PERM],
    ['postgres', `select to_jsonb(p) - 'user_id' - 'updated_at' - 'rutinas_ok_at' - 'comida_ok_at' || jsonb_build_object('ok', rutinas_ok_at is not null) from public.ia_permisos p where user_id = '${U.CT}'`],
    [U.CT, 'select public.ia_permiso_rutinas(false)'], [U.CT, 'select public.ia_permiso_rutinas(true, 1)'],
    [U.CT, `select public.ia_permiso('comida', true, 2)`], ['servicio', PERM],
    [U.CT, `select public.ia_permiso('comida', false)`], ['servicio', PERM],
    ['postgres', `update public.ia_config set aviso_rutinas_version = 2 where id = 1`], ['servicio', PERM], [U.CT, 'select public.ia_coach_estado()'],
    [U.CT, `select to_jsonb(public.ia_permiso_rutinas_estado('${U.CT}'))`], [U.AL, 'select public.ia_permiso_rutinas(false)']]);
  t.eq([r[0] && r[0].error, r[1] && r[1].error, r[2] && r[2].error], ['22023', '22023', '42501'], 'permiso: con otra versión del aviso, sin respuesta o sin sesión, no se guarda');
  t.eq(r[3] && r[3].permiso_rutinas, 'ok', 'aceptó (y devuelve ia_coach_estado)');
  t.eq(r[4], { rutinas: 'ok', comida: null }, 'aceptar el de rutinas no toca el de Comida');
  t.eq(r[5], { comida_no_at: null, coach_ok_at: null, coach_no_at: null, version: 1, rutinas_no_at: null, rutinas_version: 1, ok: true }, 'guardó cuándo y qué versión, en sus columnas');
  t.eq([r[6] && r[6].permiso_rutinas, r[7] && r[7].permiso_rutinas], ['no', 'ok'], 'apagar y volver a prender queda en orden');
  t.eq([r[8] && r[8].permiso_comida, r[9], r[11]], ['ok', { rutinas: 'ok', comida: 'ok' }, { rutinas: 'ok', comida: 'no' }], 'el de Comida no toca el de rutinas');
  t.eq([r[13], r[14] && r[14].permiso_rutinas, r[14] && r[14].aviso_version], [{ rutinas: 'viejo', comida: 'no' }, 'viejo', 2], 'aviso nuevo: hay que volver a preguntar');
  t.eq(r[15] && r[15].error, '42501', 'la app no puede preguntar el permiso con la service role');
  t.eq(r[16] && r[16].permiso_rutinas, 'no', 'cualquiera con sesión guarda el suyo');

  // «¿Está mal? Avisanos» con planillas y rutinas (sin la planilla: la rutina que armó).
  const RUT = `'{"nombre": "Fuerza", "dias": [{"nombre": "Día 1", "ejercicios": [{"fila": 12, "nombre": "Press banca"}]}]}'::jsonb`;
  r = await V([[U.CT, avisar('planilla', RUT, 'la fila 12 era press inclinado')], [U.CT, avisar('rutina', `'{}'::jsonb`)],
    [U.CT, avisar('planilla', `jsonb_build_object('x', repeat('a', 30000))`)], [U.CT, avisar('plato', `jsonb_build_object('x', repeat('a', 30000))`)],
    [U.CT, avisar('rutina', `jsonb_build_object('x', repeat('a', 60001))`)], [U.CT, avisar('inventada', `'{}'::jsonb`)],
    ['postgres', `select jsonb_agg(jsonb_build_array(funcion, comentario) order by id) from public.ia_reportes where user_id = '${U.CT}'`],
    ['postgres', `insert into public.ia_reportes (user_id, funcion, respuesta) values ('${U.CT}', 'inventada', '{}')`]]);
  t.eq([r[0], r[1], r[2]], [1, 1, 1], 'ia_reportar: guarda planillas y rutinas (una rutina larga también)');
  t.eq([r[3] && r[3].error, r[4] && r[4].error, r[5] && r[5].error], ['22023', '22023', '22023'], 'ia_reportar: la foto sigue hasta 20.000 caracteres, la rutina hasta 60.000 y lo inventado no entra');
  t.eq(r[6] && r[6].map(x => x[0]), ['planilla', 'rutina', 'planilla'], 'ia_reportes: cada aviso con su función');
  t.eq(r[6] && r[6][0][1], 'la fila 12 era press inclinado', 'ia_reportes: con el comentario');
  t.eq(r[7] && r[7].error, '23514', 'ia_reportes: una función inventada no entra');

  // El panel: modelo de planillas y topes del coach en prueba.
  r = await V([[U.AD, `select public.admin_ia_config('{"modelos": {"planilla": "modelo-prueba"}, "topes": {"prueba": {"planilla": 10}}, "funciones": {"planilla": true}}')`],
    [U.AD, `select public.admin_ia_config('{"modelos": {"inventada": "modelo-prueba"}}')`],
    [U.AD, `select public.admin_ia_config('{"topes": {"prueba": {"inventado": 1}}}')`]]);
  t.eq([r[0] && r[0].modelos && r[0].modelos.planilla, r[0] && r[0].topes && r[0].topes.prueba.planilla, r[0] && r[0].funciones && r[0].funciones.planilla], ['modelo-prueba', 10, true], 'admin_ia_config: modelo de planillas, topes de prueba y el interruptor de planillas');
  t.eq([r[1] && r[1].error, r[2] && r[2].error], ['22023', '22023'], 'admin_ia_config: lo inventado no entra');
  await db.borrar();

  // ===== Una base de antes (como la de verdad hoy) y correr ia.sql de nuevo =====
  const CHECKS = `select jsonb_object_agg(a.attname || ':' || c.conname, jsonb_build_array(c.oid::bigint, pg_get_constraintdef(c.oid)))
    from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
   where c.conrelid in ('public.ia_llamadas'::regclass, 'public.ia_reportes'::regclass) and c.contype = 'c'`;
  const ANTES = total => `
alter table public.ia_llamadas drop constraint ia_llamadas_rol_check, drop constraint ia_llamadas_funcion_check;
alter table public.ia_llamadas add constraint rol_de_antes check (rol in ('alumno', 'coach', 'admin')),
  add constraint ia_llamadas_funcion_check1 check (funcion in ('etiqueta', 'plato', 'texto', 'rutina', 'resumen'));
alter table public.ia_reportes drop constraint ia_reportes_funcion_check, add constraint reportes_de_antes check (funcion in ('plato', 'texto'));
update public.ia_config set funciones = funciones - 'planilla',
  topes = (topes - 'prueba') || jsonb_build_object('coach', ((topes -> 'coach') - 'planilla' - 'rutina') || jsonb_build_object('total', ${total}, 'plato', 12)) where id = 1;`;
  for (const total of [40, 50]){
    const v = await h.nueva('gize_sin');
    await v.sql(ANTES(total));
    const antes = await v.json(CHECKS);
    await v.archivo('supabase/ia.sql');
    const c1 = await v.json(CHECKS), cfg = await v.json(`select jsonb_build_object('funciones', funciones, 'topes', topes) from public.ia_config`);
    const nombres = Object.keys(c1).sort();
    t.eq(nombres, ['comentario:ia_reportes_comentario_check', 'estado:ia_llamadas_estado_check', 'funcion:ia_llamadas_funcion_check', 'funcion:ia_reportes_funcion_check', 'origen:ia_llamadas_origen_check', 'rol:ia_llamadas_rol_check'],
      'base vieja (total ' + total + '): un check por columna, con los de antes reemplazados aunque tuvieran otro nombre');
    t.ok(/'prueba'/.test((c1['rol:ia_llamadas_rol_check'] || [])[1]) && /'planilla'/.test((c1['funcion:ia_llamadas_funcion_check'] || [])[1]), 'base vieja: los checks nuevos tienen prueba y planilla');
    t.ok(/'planilla'.*'rutina'/.test((c1['funcion:ia_reportes_funcion_check'] || [])[1]), 'base vieja: ia_reportes acepta planillas y rutinas');
    const otros = ['estado:ia_llamadas_estado_check', 'origen:ia_llamadas_origen_check', 'comentario:ia_reportes_comentario_check'];
    t.eq(otros.map(k => (c1[k] || [])[0]), otros.map(k => (antes[k] || [])[0]), 'base vieja: los checks de las otras columnas no se tocan');
    const cc = cfg.topes.coach || {};
    t.eq([cfg.funciones.planilla, cc.planilla, cc.rutina, cc.plato, cc.total, cfg.topes.prueba],
      [false, 30, 15, 12, total === 40 ? 60 : 50, { planilla: 15, rutina: 5, total: 20, usd_ciclo: 1 }], 'base vieja (total ' + total + '): suma planillas y prueba, no pisa lo del dueño y el total pasa a 60 solo si estaba en 40');
    // El dueño vuelve a cambiar los topes y se corre otra vez: nada cambia (ni los checks).
    await v.sql(`update public.ia_config set topes = jsonb_set(jsonb_set(topes, '{coach,total}', '40'), '{prueba,planilla}', '7') where id = 1`);
    await v.archivo('supabase/ia.sql');
    const c2 = await v.json(CHECKS), cfg2 = await v.json(`select topes from public.ia_config`);
    t.eq([(cfg2.coach || {}).total, (cfg2.prueba || {}).planilla], [40, 7], 'correrlo otra vez no pisa los topes del dueño (ni vuelve a subir el total)');
    t.eq(c2, c1, 'correrlo otra vez no vuelve a crear los checks');
    await v.borrar();
  }

  // ===== Con gimnasios =====
  const g = await h.nueva('gize_con');
  t.eq(await g.json(DATOS), [], 'las personas de los gimnasios cumplen los invariantes');
  const G = ayudas(g);
  const QG = ['dA', 'pA1', 'pA2', 'aA', 'rA', 'A1', 'C'];
  r = await G.V(QG.map(k => ['servicio', rolc(P[k])]));
  t.eq(r, ['coach', 'coach', 'coach', null, null, null, 'coach'], 'con gimnasios: la dueña y los profes con el plan al día → coach; administración, recepción y socios → null');
  r = await G.V([['postgres', `update public.coach_billing set paid_until = null, trial_ends_at = now() + interval '10 days' where coach_id = '${P.dA}'`]].concat(QG.map(k => ['servicio', rolc(P[k])])));
  t.eq(r.slice(1), ['prueba', 'coach', 'prueba', null, null, null, 'coach'], 'gimnasio en la prueba: la dueña y el profe sin plan propio (con su prueba) → prueba; el profe con plan → coach');
  r = await G.V([['postgres', PRENDER], ['pA2', 'select public.ia_coach_estado()'], ['pA1', 'select public.ia_coach_estado()'], ['aA', 'select public.ia_coach_estado()']]);
  t.eq([r[1] && r[1].rol, r[1] && r[1].por_gimnasio, r[1] && r[1].tope && r[1].tope.planilla], ['coach', true, 30], 'ia_coach_estado del profe de un gimnasio al día: coach, por gimnasio');
  t.eq([r[2] && r[2].rol, r[2] && r[2].por_gimnasio, r[3] && r[3].activa, r[3] && r[3].motivo], ['coach', false, false, 'no_coach'], 'el profe con plan propio no es por gimnasio; la administración no tiene nada');
  await g.borrar();
}
