// La base de «Comida por voz» (supabase/ia.sql): la voz usa la función «texto» de la guardia, con su
// propio aviso. Todavía no la usa la app ni la función «ia»: arranca apagada.
// 1) Leído: ia_permiso_texto solo para la service role, security definer con search_path fijo;
//    aviso_version se queda en 2 (las apps de antes mandan la versión que les da el servidor); las
//    fotos gratis de la semana cuentan y frenan solo fotos.
// 2) En Postgres de verdad (tests/pg.mjs; sin Postgres se saltea):
//    - base nueva: aviso_texto en 3, aviso_version en 2, «texto» apagado y 15 por día;
//    - una base de antes (sin aviso_texto, con «texto» prendido desde el viejo «Contame qué comiste»
//      y sin el tope de la voz): correr ia.sql apaga «texto» y suma el tope, una sola vez; si después
//      el dueño la prende o cambia el tope, correrlo de nuevo no lo toca;
//    - el permiso: ia_permiso acepta de la versión de la foto a la de la voz y guarda la que vio la
//      app; ia_permiso_texto ('viejo' con la de la foto, 'ok' con la de la voz, 'no' apagado, null
//      sin preguntar), que la app no puede llamar; no toca el permiso del coach (ni al revés, y
//      aceptar solo el del coach no cuenta para la foto ni la voz); si algún día el aviso de la foto
//      pasa al de la voz, la voz pide el más nuevo;
//    - ia_mi_estado trae permiso_texto y aviso_texto (también apagada);
//    - el tope de la voz: 15 por día (la 16.ª no), también con IA Plus (aunque le dé más fotos por
//      día que eso); no cuenta en las fotos gratis de la semana y, sin fotos gratis, la voz sigue
//      (quedan.texto e ia_reservar);
//    - modo ahorro después de un corte por créditos que ya pasó su hora: el alumno sin coach con plan
//      ni IA Plus lo ve en ahorro (como lo frena ia_reservar); el alumno de un coach con plan, el que
//      tiene IA Plus y el coach siguen; un corte que todavía no pasó su hora (o por el tope) se ve
//      como corte, no como ahorro.
import { conPg, leer } from './pg.mjs';
import { ayudas, conCanon } from './gimnasios-comun.mjs';

const sinComentarios = s => s.replace(/--[^\n]*/g, '');
const fn = (sql, name) => {
  const i = sql.indexOf('create or replace function public.' + name + '(');
  if (i < 0) return '';
  const a = sql.indexOf('$$', i), b = sql.indexOf('$$', a + 2);
  return sql.slice(i, b + 2);
};
const ID = n => 'c2000000-0000-4000-8000-' + String(n).padStart(12, '0');
// Personas (inventadas): alumna sin coach (gratis), alumno de un coach con plan pago, ese coach,
// alumna con IA Plus comprado.
const U = { AL: ID(1), AP: ID(2), CP: ID(3), PL: ID(4) };
const PERSONAS = `
insert into auth.users (id, email, raw_user_meta_data) values
  ('${U.AL}', 'al@ejemplo.test', '{"full_name":"Alumna Libre"}'),
  ('${U.AP}', 'ap@ejemplo.test', '{"full_name":"Alumno Con Coach"}'),
  ('${U.CP}', 'cp@ejemplo.test', '{"full_name":"Coach Pago","role":"coach"}'),
  ('${U.PL}', 'pl@ejemplo.test', '{"full_name":"Alumna Plus"}');
update public.coach_billing set plan = 'p10', max_clients = 10, trial_ends_at = now() - interval '30 days', paid_until = now() + interval '20 days' where coach_id = '${U.CP}';
update public.profiles set coach_id = '${U.CP}' where id = '${U.AP}';
insert into public.ia_plus (user_id, manual_hasta) values ('${U.PL}', now() + interval '10 days');
`;
const PRENDER = `update public.ia_config set activa = true, ancla = date_trunc('day', now() - interval '3 days'),
  funciones = funciones || '{"plato": true, "texto": true}'::jsonb where id = 1`;
const res = (uid, fun, rol = 'alumno') => `select public.ia_reservar('${uid}', '${rol}', '${fun}', 'modelo-prueba', 0.005)`;
// n reservas seguidas (en orden): el código de cada una ('ok' si pasó).
const varias = (uid, fun, n, rol = 'alumno') => `select jsonb_agg(coalesce(public.ia_reservar('${uid}', '${rol}', '${fun}', 'modelo-prueba', 0.005) ->> 'codigo', 'ok') order by g) from generate_series(1, ${n}) g`;
const est = uid => [uid, 'select public.ia_mi_estado()'];
const PERM = uid => `select jsonb_build_object('comida', public.ia_permiso_estado('${uid}'), 'texto', public.ia_permiso_texto('${uid}'), 'rutinas', public.ia_permiso_rutinas_estado('${uid}'))`;
const VERS = uid => `select jsonb_build_object('version', version, 'rutinas_version', rutinas_version) from public.ia_permisos where user_id = '${uid}'`;
const CFG = `select jsonb_build_object('aviso_texto', aviso_texto, 'aviso_version', aviso_version, 'texto', funciones -> 'texto',
  'alumno', topes #> '{alumno,texto}', 'coach', topes #> '{coach,texto}') from public.ia_config where id = 1`;
const cod = r => r && (r.ok === true ? 'ok' : r.codigo || r.error);
const de = (e, ...ks) => e && Object.fromEntries(ks.map(k => [k, k.split('.').reduce((o, x) => o && o[x], e)]));

export default async function ({ t: t0 }){
  const t = conCanon(t0);
  // ---------- 1) Leído ----------
  const sql = leer('supabase/ia.sql'), code = sinComentarios(sql);
  t.ok(code.includes('revoke all on function public.ia_permiso_texto(uuid) from public, anon, authenticated;')
    && code.includes('grant execute on function public.ia_permiso_texto(uuid) to service_role;')
    && !/grant execute on function public\.ia_permiso_texto\(uuid\) to (anon|authenticated)/.test(code), 'ia_permiso_texto(uuid): solo la service role');
  t.ok(/security definer set search_path = public/.test(fn(code, 'ia_permiso_texto')), 'ia_permiso_texto: security definer con search_path fijo');
  t.ok(code.includes('update public.ia_config set aviso_version = 2 where id = 1 and aviso_version < 2;') && !/aviso_version = 3/.test(code),
    'el aviso de la foto se queda en la 2 (la voz tiene el suyo: las apps de antes guardarían la 3 mostrando el texto de la 2)');
  t.ok(/l\.funcion = 'plato' and l\.creada >= public\.ia_semana\(\)/.test(fn(code, 'ia_semana_usos')) && /if p_funcion = 'plato' and p_rol = 'alumno'/.test(fn(code, 'ia_reservar')),
    'las fotos gratis de la semana cuentan y frenan solo fotos (la voz no entra en IA Plus)');

  // ---------- 2) En Postgres ----------
  const h = await conPg(t);
  if (!h) return;
  const db = await h.nueva('gize_sin');
  await db.sql(PERSONAS);
  const { J, V } = ayudas(db);

  // Base nueva.
  t.eq(await J(CFG), { aviso_texto: 3, aviso_version: 2, texto: false, alumno: 15, coach: 15 }, 'base nueva: el aviso de la voz en la 3, el de la foto en la 2, la voz apagada y 15 por día');

  // El permiso: de la versión de la foto a la de la voz, y guarda la que vio la app.
  let r = await V([['servicio', PERM(U.AL)],
    [U.AL, `select public.ia_permiso('comida', true, 1)`], [U.AL, `select public.ia_permiso('comida', true, 4)`], [U.AL, `select public.ia_permiso('comida', true, null)`],
    [U.AL, `select public.ia_permiso('comida', true, 2)`], ['servicio', PERM(U.AL)], ['postgres', VERS(U.AL)],
    [U.AL, `select public.ia_permiso('comida', true, 3)`], ['servicio', PERM(U.AL)], ['postgres', VERS(U.AL)],
    [U.AL, `select public.ia_permiso('comida', false)`], ['servicio', PERM(U.AL)], ['postgres', VERS(U.AL)],
    [U.AL, `select public.ia_permiso('comida', true, 2)`],
    [U.AL, `select to_jsonb(public.ia_permiso_texto('${U.AL}'))`], ['anon', `select to_jsonb(public.ia_permiso_texto('${U.AL}'))`], ['anon', `select public.ia_permiso('comida', true, 3)`]]);
  t.eq(r[0], { comida: null, texto: null, rutinas: null }, 'nunca se le preguntó');
  t.eq([r[1], r[2], r[3]].map(x => x && x.error), ['22023', '22023', '22023'], 'ia_permiso: una versión anterior a la de la foto, una que no existe o ninguna, no se guardan');
  t.eq(de(r[4], 'permiso_comida', 'permiso_texto', 'aviso_version', 'aviso_texto'), { permiso_comida: 'ok', permiso_texto: 'viejo', aviso_version: 2, aviso_texto: 3 },
    'la app de antes (manda la 2): la foto sigue y la voz va a pedir el aviso nuevo (devuelve ia_mi_estado)');
  t.eq([r[5], r[6]], [{ comida: 'ok', texto: 'viejo', rutinas: null }, { version: 2, rutinas_version: 0 }], 'con la 2: foto ok, voz viejo; guardó la 2');
  t.eq([r[7] && r[7].permiso_texto, r[8], r[9]], ['ok', { comida: 'ok', texto: 'ok', rutinas: null }, { version: 3, rutinas_version: 0 }], 'con la 3: la foto y la voz; guardó la 3');
  t.eq([r[10] && r[10].permiso_texto, r[11], r[12]], ['no', { comida: 'no', texto: 'no', rutinas: null }, { version: 3, rutinas_version: 0 }], 'apagada en Ajustes: no van ni la foto ni la voz');
  t.eq([r[13] && r[13].permiso_comida, r[13] && r[13].permiso_texto], ['ok', 'viejo'], 'la vuelve a prender en una app de antes (la 2): la voz pregunta de nuevo');
  t.eq([r[14], r[15], r[16]].map(x => x && x.error), ['42501', '42501', '42501'], 'la app (ni sin sesión) no pregunta ia_permiso_texto; sin sesión no se acepta');

  // El de Comida no toca el del coach («Usar IA en tus rutinas») ni al revés.
  r = await V([[U.CP, 'select public.ia_permiso_rutinas(true, 1)'], ['servicio', PERM(U.CP)],
    [U.CP, `select public.ia_permiso('comida', true, 3)`], ['servicio', PERM(U.CP)], ['postgres', VERS(U.CP)],
    [U.CP, `select public.ia_permiso('comida', false)`], ['servicio', PERM(U.CP)],
    [U.CP, `select public.ia_permiso('comida', true, 3)`], [U.CP, 'select public.ia_permiso_rutinas(false)'], ['servicio', PERM(U.CP)], ['postgres', VERS(U.CP)]]);
  t.eq(r[1], { comida: null, texto: null, rutinas: 'ok' }, 'aceptar el del coach no cuenta como preguntado para la foto ni para la voz (su fila tiene la versión 0)');
  t.eq([r[3], r[4]], [{ comida: 'ok', texto: 'ok', rutinas: 'ok' }, { version: 3, rutinas_version: 1 }], 'aceptar la 3 no toca el permiso del coach');
  t.eq(r[6], { comida: 'no', texto: 'no', rutinas: 'ok' }, 'apagar la IA de Comida no apaga la del coach');
  t.eq([r[9], r[10]], [{ comida: 'ok', texto: 'ok', rutinas: 'no' }, { version: 3, rutinas_version: 1 }], 'apagar la del coach no toca la foto ni la voz');

  // Si algún día el aviso de la foto pasa al de la voz, la voz pide el más nuevo (y no se acepta uno anterior).
  r = await V([[U.AL, `select public.ia_permiso('comida', true, 3)`], ['postgres', `update public.ia_config set aviso_version = 4 where id = 1`], ['servicio', PERM(U.AL)],
    [U.AL, `select public.ia_permiso('comida', true, 3)`], [U.AL, `select public.ia_permiso('comida', true, 4)`]]);
  t.eq(r[2], { comida: 'viejo', texto: 'viejo', rutinas: null }, 'aviso de la foto más nuevo que el de la voz: las dos preguntan de nuevo');
  t.eq([r[3] && r[3].error, de(r[4], 'permiso_comida', 'permiso_texto', 'aviso_version', 'aviso_texto')], ['22023', { permiso_comida: 'ok', permiso_texto: 'ok', aviso_version: 4, aviso_texto: 4 }],
    'y se acepta solo el nuevo, que vale para las dos');

  // ia_mi_estado: permiso_texto y aviso_texto, apagada y prendida.
  r = await V([est(U.AL), ['postgres', PRENDER], est(U.AL), ['postgres', `update public.ia_config set funciones = funciones || '{"texto": false}' where id = 1`], est(U.AL)]);
  t.eq(de(r[0], 'activa', 'funciones', 'permiso_texto', 'aviso_texto', 'aviso_version'), { activa: false, funciones: { plato: false, texto: false }, permiso_texto: null, aviso_texto: 3, aviso_version: 2 },
    'apagada: igual trae el permiso de la voz y su aviso (para Ajustes)');
  t.eq(de(r[2], 'activa', 'funciones', 'permiso_texto', 'aviso_texto', 'estado', 'quedan', 'tope'), { activa: true, funciones: { plato: true, texto: true }, permiso_texto: null, aviso_texto: 3,
    estado: 'normal', quedan: { plato: 8, texto: 15 }, tope: { plato: 8, texto: 15, total: 25 } }, 'prendida: la voz con 15 por día');
  t.eq(r[4] && r[4].funciones, { plato: true, texto: false }, 'la voz con su interruptor');

  // Sin fotos gratis en la semana (IA Plus prendido), la voz sigue: 15 por día y la 16.ª no; y no
  // cuenta en la semana.
  r = await V([['postgres', PRENDER + `; update public.ia_config set plus = plus || '{"activa": true}' where id = 1`],
    ['servicio', varias(U.AL, 'plato', 4)], est(U.AL), ['servicio', varias(U.AL, 'texto', 15)], ['servicio', res(U.AL, 'texto')], est(U.AL)]);
  t.eq(r[1], ['ok', 'ok', 'ok', 'tope_semana'], 'IA Plus prendido: 3 fotos gratis por semana');
  t.eq(de(r[2], 'estado', 'quedan', 'plus.quedan_semana'), { estado: 'tope_semana', quedan: { plato: 0, texto: 15 }, 'plus.quedan_semana': 0 },
    'sin fotos gratis: a la voz le quedan sus 15 de hoy');
  t.eq([r[3] && r[3].every(x => x === 'ok'), cod(r[4]), r[4] && r[4].tope], [true, 'tope_dia', 15], 'la voz anda sin fotos gratis: 15 por día y la 16.ª no');
  t.eq(de(r[5], 'quedan', 'usados', 'plus.usados_semana'), { quedan: { plato: 0, texto: 0 }, usados: { plato: 3, texto: 15, total: 18 }, 'plus.usados_semana': 3 },
    'la voz no cuenta en las fotos gratis de la semana');

  // Con IA Plus comprado: más fotos por día, pero la voz sigue con 15. Las fotos de IA Plus van en
  // 20 (más que los 15 de la voz): con las 10 de siempre no se notaría si IA Plus le subiera el tope.
  r = await V([['postgres', PRENDER + `; update public.ia_config set plus = plus || '{"activa": true}', topes = jsonb_set(topes, '{plus,plato}', '20') where id = 1`],
    ['servicio', varias(U.PL, 'texto', 16)], est(U.PL)]);
  t.eq([r[1] && r[1].filter(x => x === 'ok').length, r[1] && r[1][15]], [15, 'tope_dia'], 'con IA Plus la voz sigue con 15 por día');
  t.eq(de(r[2], 'tope', 'quedan', 'plus.estado'), { tope: { plato: 20, texto: 15, total: 25 }, quedan: { plato: 10, texto: 0 }, 'plus.estado': 'plus' },
    'ia_mi_estado con IA Plus: 20 fotos y 15 con la voz');

  // Modo ahorro después de un corte por créditos que ya pasó su hora: la próxima reserva deja el
  // ciclo en ahorro, así que el alumno sin coach con plan ni IA Plus ya lo ve así.
  const CORTE = (gastado, por = 'creditos', vuelve = "now() - interval '1 minute'") =>
    `update public.ia_ciclos set estado = 'cortado', cortado_por = '${por}', vuelve = ${vuelve}, gastado = ${gastado} where inicio <= now() and fin > now()`;
  r = await V([['postgres', PRENDER], ['servicio', res(U.AP, 'plato')],
    ['postgres', CORTE(10)], est(U.AL),
    ['postgres', CORTE(150)], est(U.AL), est(U.AP), est(U.PL), ['servicio', res(U.AL, 'texto')], ['servicio', res(U.AP, 'texto')], ['servicio', res(U.PL, 'plato')]]);
  t.eq(cod(r[1]), 'ok', 'hay ciclo');
  t.eq(r[3] && r[3].estado, 'normal', 'corte por créditos que ya pasó, con poco gasto: normal');
  t.eq([r[5] && r[5].estado, !!(r[5] && r[5].vuelve), r[6] && r[6].estado, r[7] && r[7].estado], ['ahorro', true, 'normal', 'normal'],
    'corte por créditos que ya pasó, con el gasto arriba del ahorro: el alumno sin coach con plan ni IA Plus lo ve en ahorro; el de un coach con plan y el que tiene IA Plus siguen');
  t.eq([cod(r[8]), cod(r[9]), cod(r[10])], ['ahorro', 'ok', 'ok'], 'y ia_reservar lo frena igual (la voz también)');
  r = await V([['postgres', PRENDER], ['servicio', res(U.AP, 'plato')], ['postgres', CORTE(150)], est(U.CP), ['servicio', res(U.CP, 'texto', 'coach')]]);
  t.eq([r[3] && r[3].estado, cod(r[4])], ['normal', 'ok'], 'el coach no tiene modo ahorro en la foto ni en la voz');
  // Si el corte todavía no pasó su hora (o es por el tope del ciclo), manda el corte, no el ahorro.
  r = await V([['postgres', PRENDER], ['servicio', res(U.AP, 'plato')],
    ['postgres', CORTE(150, 'creditos', "now() + interval '20 minutes'")], est(U.AL), ['postgres', CORTE(150, 'tope', 'null')], est(U.AL)]);
  t.eq([r[3] && r[3].estado, r[5] && r[5].estado], ['pausada', 'tope_mes'], 'cortado por créditos antes de su hora o por el tope, con el gasto arriba del ahorro: se ve el corte');
  await db.borrar();

  // ===== Una base de antes (como la de verdad hoy) y correr ia.sql de nuevo =====
  const v = await h.nueva('gize_sin');
  await v.sql(`alter table public.ia_config drop column aviso_texto;
update public.ia_config set funciones = funciones || '{"texto": true}', topes = jsonb_set(jsonb_set(topes, '{alumno}', (topes -> 'alumno') - 'texto'), '{coach}', (topes -> 'coach') - 'texto') where id = 1;`);
  t.eq(await v.json(`select jsonb_build_object('texto', funciones -> 'texto', 'alumno', topes #> '{alumno,texto}') from public.ia_config`), { texto: true, alumno: null }, 'base de antes: «texto» prendido y sin tope');
  await v.archivo('supabase/ia.sql');
  t.eq(await v.json(CFG), { aviso_texto: 3, aviso_version: 2, texto: false, alumno: 15, coach: 15 }, 'base de antes: correr ia.sql apaga la voz, la deja con el aviso 3 y le suma el tope de 15');
  await v.sql(`update public.ia_config set funciones = funciones || '{"texto": true}', topes = jsonb_set(topes, '{alumno,texto}', '10') where id = 1`);
  await v.archivo('supabase/ia.sql');
  t.eq(await v.json(CFG), { aviso_texto: 3, aviso_version: 2, texto: true, alumno: 10, coach: 15 }, 'correrlo otra vez no apaga la voz que prendió el dueño ni le cambia el tope');
  await v.borrar();
}
