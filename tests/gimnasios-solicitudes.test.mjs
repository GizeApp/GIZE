// Gimnasios, etapa 1: cómo entra un socio (§1.3) en Postgres de verdad (tests/pg.mjs; sin Postgres se
// saltea): el código del gimnasio (gym_codigo_info, gym_unirse y join_coach de las apps viejas), la hoja
// con su versión, cancelar, la unión sola por mail VERIFICADO con exactamente una ficha sin app,
// «Aprobar solas» con el profe por defecto (y sin lugar, queda pendiente), el tope de 30 pedidos por
// día, el link #unirme con los últimos 3 del DNI (5 intentos, una sola vez, 7 días; sin DNI queda un
// pedido unido a esa ficha), aprobar (socio nuevo, con profe, coach de afuera, «es la ficha de…»),
// rechazar y dos aprobaciones a la vez por el último lugar.
import { conPg, lit } from './pg.mjs';
import { P, F, G, VER, DATOS, ayudas, rpc, nom, canon , conCanon } from './gimnasios-comun.mjs';

const LISTO = 'Listo: le pediste a Gimnasio Fuerza que te sume. Cuando te acepten vas a ver a tu profe acá.';
const ACTUALIZA = 'Actualizá la página: cambió el texto que tenés que aceptar.';
const unirse = (share = false, ver = VER, cver = VER, code = 'FUERZA22') => rpc('gym_unirse', code, ver, share, share ? cver : null);
const ficha = who => `select coalesce((select jsonb_build_object('id', m.id, 'gym', m.gym_id, 'status', m.status, 'trainer', m.trainer_id, 'terms', m.terms_version,
    'share', m.share_admin, 'source', m.source, 'unir', m.unir_sugerida, 'coach', p.coach_id)
    from public.gym_members m join public.profiles p on p.id = m.member_id where m.member_id = '${P[who]}' and m.status <> 'baja'), 'null'::jsonb)`;
const cupo = `select jsonb_build_array((select seats_used from public.coach_billing where coach_id = '${P.dA}'), prueba.invariantes())`;
const alertas = tipo => `select coalesce(jsonb_agg(recipient order by recipient), '[]') from public.gym_alerts where kind = '${tipo}'`;

export default async function ({ t: t0 }){
  const t = conCanon(t0);
  const h = await conPg(t);
  if (!h) return;
  const db = await h.nueva('gize_con');
  t.eq(await db.json(DATOS), [], 'las personas cargadas cumplen los invariantes');
  const { J, V, PROBAR, HACER, INV } = ayudas(db);
  const destinos = a => a.map(r => nom(r.slice(2))).sort();

  // ===== ¿De quién es el código? =====
  let x = await V([['N', rpc('gym_codigo_info', ' fuerza22 ')], ['N', rpc('gym_codigo_info', 'COACHEXT')], ['N', rpc('gym_codigo_info', 'NOEXISTE')],
    ['postgres', `select to_jsonb(count(*)) from public.join_code_attempts where user_id = '${P.N}'`]]);
  t.eq(x.slice(0, 3), [{ tipo: 'gym', gym: { name: 'Gimnasio Fuerza', city: 'Rosario' } }, { tipo: 'coach', gym: null }, { tipo: null, gym: null }],
    'gym_codigo_info: del gimnasio (nombre y ciudad), de un coach (nada más) o de nadie');
  t.eq(x[3], 1, 'solo el que no existe cuenta como intento equivocado');
  x = await V([['postgres', `insert into public.join_code_attempts (user_id) select '${P.N}' from generate_series(1, 10)`], ['N', rpc('gym_codigo_info', 'FUERZA22')]]);
  t.eq(x[1].msg, 'Probaste muchos códigos que no existen. Revisalo con tu coach y volvé a intentar en un rato.', 'con el tope de intentos de join_coach, también frena');

  // ===== Pedir con la hoja =====
  x = await V([['N', unirse()], ['postgres', ficha('N')], ['N', rpc('mi_gimnasio')], ['postgres', alertas('solicitud')], ['postgres', cupo],
    ['dA', 'select coalesce(jsonb_agg(public.gym_reads_member(member_id)), \'[]\') from public.gym_members where status = \'pendiente\'']]);
  t.eq(x[0], { estado: 'pendiente', gym: { name: 'Gimnasio Fuerza', city: 'Rosario' } }, 'gym_unirse: pedido enviado');
  t.eq([x[1].status, x[1].terms, x[1].share, x[1].source, x[1].trainer, x[1].coach], ['pendiente', VER, false, 'codigo', null, null],
    'la ficha pendiente guarda la versión de la hoja, «compartir» sin marcar, sin profe y sin cambiar su coach');
  t.eq([x[2].rol, x[2].solicitud.gym, x[2].solicitud.terms], ['pendiente', 'Gimnasio Fuerza', true], 'mi_gimnasio: pendiente');
  t.eq(destinos(x[3]), ['aA', 'dA'], 'aviso «solicitud» a la dueña y al encargado (anotado; lo manda avisos-gym en la etapa 2)');
  t.eq(x[4], [6, []], 'no ocupa lugar (6) y los invariantes siguen');
  t.eq(x[5], [false, false], 'la administración no lee a nadie que solo pidió sumarse');
  x = await V([['N', unirse(true)], ['postgres', ficha('N')]]);
  t.eq([x[1].share, x[1].terms], [true, VER], 'con la casilla opcional marcada, guarda «compartir» con su versión');
  for (const [args, que] of [[[false, 'v0'], 'la hoja'], [[true, VER, 'v0'], 'compartir']]){
    const r = await PROBAR('N', unirse(...args));
    t.eq(r, { error: 'P0001', msg: ACTUALIZA }, 'gym_unirse con otra versión de ' + que + ': «Actualizá la página»');
  }
  t.eq(await PROBAR('N', unirse(false, VER, VER, 'NOEXISTE')), { estado: 'no_existe', gym: null }, 'gym_unirse con un código que no existe: no_existe (y cuenta el intento)');
  // La app vieja pidió con join_coach; después acepta la hoja en la nueva.
  x = await V([['N', `select public.join_coach('FUERZA22')::jsonb`], ['postgres', ficha('N')], ['N', unirse(true)], ['postgres', ficha('N')],
    ['postgres', `select to_jsonb(count(*)) from public.gym_members where member_id = '${P.N}'`]]);
  t.eq([x[0], x[1].terms, x[2].estado, x[3].terms, x[3].share, x[4]], [{ code: 'P0001', message: LISTO }, null, 'pendiente', VER, true, 1],
    'pidió con la app vieja (sin hoja); con la nueva acepta la hoja sobre el mismo pedido');
  // Cancelar.
  x = await V([['N', unirse()], ['N', rpc('gym_cancelar_solicitud')], ['postgres', ficha('N')], ['N', rpc('mi_gimnasio')], ['N', rpc('gym_cancelar_solicitud')]]);
  t.eq([x[1], x[2], x[3], x[4].msg], [{ ok: true }, null, null, 'No tenés ningún pedido pendiente.'], 'cancelar el pedido: se borra y mi_gimnasio vuelve a null');
  // Quién no puede pedir.
  for (const [w, msg] of [['C', 'Una cuenta de coach no se puede sumar como socio de un gimnasio.'], ['rA', 'Las cuentas del equipo de un gimnasio no se pueden vincular con un código.'],
    ['B1', 'Ya sos socio de Gimnasio Norte: primero salí desde Ajustes.'], ['A1', 'Ya sos socio de Gimnasio Fuerza.']]){
    t.eq(await PROBAR(w, unirse()), { error: 'P0001', msg }, w + ' no puede pedir: ' + msg);
  }
  x = await V([['N', rpc('gym_unirse', 'NRTE2345', VER, false, null)], ['N', unirse()]]);
  t.eq(x[1], { error: 'P0001', msg: 'Ya pediste sumarte a Gimnasio Norte: primero cancelá el pedido desde Ajustes.' }, 'un pedido pendiente en otro gimnasio');
  // Coach de afuera: C1 (alumna de C) pide; conserva a C.
  x = await V([['C1', unirse()], ['postgres', ficha('C1')]]);
  t.eq([x[0].estado, nom(x[1].coach)], ['pendiente', 'C'], 'la alumna de un coach de afuera pide y conserva su coach');

  // ===== Unión sola por mail verificado =====
  const fichaN = mail => rpc('gym_ficha_crear', { nombre: 'Nora Vidal', dni: '33444555', email: mail });
  x = await V([['dA', fichaN('N@Ejemplo.test')], ['N', unirse(true)], ['postgres', ficha('N')], ['postgres', cupo], ['postgres', alertas('solicitud_unida')],
    ['N', rpc('mi_gimnasio')]]);
  t.eq(x[1].estado, 'unida', 'mail verificado que coincide (sin importar mayúsculas) con una sola ficha sin app: se une sola');
  t.eq([x[2].id === x[0].id, x[2].status, x[2].terms, x[2].share, x[2].trainer], [true, 'activo', VER, true, null], 'toma esa ficha: su estado, la hoja y «compartir», sin profe');
  t.eq([x[3], destinos(x[4]), x[5].rol], [[7, []], ['aA', 'dA'], 'socio'], 'no ocupa otro lugar (la ficha ya contaba: 7) y avisa a la administración');
  x = await V([['dA', fichaN('n@ejemplo.test')], ['dA', rpc('gym_ficha_crear', { nombre: 'Otra Nora', email: 'n@ejemplo.test' })], ['N', unirse()], ['postgres', ficha('N')]]);
  t.eq([x[2].estado, x[3].status], ['pendiente', 'pendiente'], 'con dos fichas con ese mail no se une: queda pedido');
  x = await V([['dA', rpc('gym_ficha_crear', { nombre: 'Elena Paz', email: 'n3@ejemplo.test' })], ['N3', unirse()]]);
  t.eq(x[1].estado, 'pendiente', 'con el mail SIN verificar (N3) no se une: queda pedido');
  x = await V([['dA', fichaN('n@ejemplo.test')], ['N', `select jsonb_build_object('r', public.join_coach('FUERZA22')::jsonb, 'st', current_setting('response.status', true))`]]);
  t.eq(x[1], { r: { code: 'P0001', message: 'Listo: ya sos socio de Gimnasio Fuerza.' }, st: '400' }, 'con la app vieja (join_coach): se une y dice «Listo: ya sos socio…» (400, sin raise)');

  // ===== Aprobar solas =====
  const solas = `update public.gyms set settings = '{"aprobar_solas": true}', default_trainer_id = '${P.pA2}' where id = '${G.A}'`;
  x = await V([['postgres', solas], ['N', unirse()], ['postgres', ficha('N')], ['postgres', cupo], ['postgres', alertas('solicitud_aprobada_sola')]]);
  t.eq([x[1].estado, x[2].status, nom(x[2].coach), nom(x[2].trainer), x[3], destinos(x[4])], ['activo', 'activo', 'pA2', 'pA2', [7, []], ['aA', 'dA']],
    '«Aprobar solas»: entra como socio con el profe por defecto (C = T = pA2), con cupo (7), y avisa');
  x = await V([['postgres', solas], ['postgres', `update public.coach_billing set max_clients = 6 where coach_id = '${P.dA}'`], ['N', unirse()], ['postgres', ficha('N')]]);
  t.eq([x[2].estado, x[3].status], ['pendiente', 'pendiente'], 'sin lugar en el plan: queda pendiente (no da error)');
  x = await V([['postgres', solas], ['postgres', `insert into public.user_blocks (blocker, blocked) values ('${P.N}', '${P.pA2}')`], ['N', unirse()], ['postgres', ficha('N')]]);
  t.eq([x[2].estado, x[3].coach], ['activo', null], 'si bloqueó al profe por defecto, entra sin profe');
  x = await V([['postgres', solas], ['C1', unirse()], ['postgres', ficha('C1')]]);
  t.eq([x[1].estado, nom(x[2].coach), x[2].trainer], ['activo', 'C', null], 'con un coach de afuera, entra y conserva su coach (sin profe del gimnasio)');
  x = await V([['postgres', solas], ['N', `select public.join_coach('FUERZA22')::jsonb`]]);
  t.eq(x[1], { code: 'P0001', message: 'Listo: ya sos socio de Gimnasio Fuerza.' }, 'con la app vieja, «Listo: ya sos socio…»');

  // ===== Tope de 30 pedidos por día =====
  const treinta = `insert into public.gym_members (gym_id, full_name, status, source, requested_at) select '${G.A}', 'Pedido ' || g, 'pendiente', 'codigo', now() - interval '1 hour' from generate_series(1, 30) g`;
  x = await V([['postgres', treinta], ['N', unirse()]]);
  t.eq(x[1], { error: 'P0001', msg: 'Gimnasio Fuerza recibió muchos pedidos hoy. Probá de nuevo mañana.' }, 'el pedido 31 del día se frena (también con gym_unirse)');
  x = await V([['postgres', treinta], ['dA', fichaN('n@ejemplo.test')], ['N', unirse()]]);
  t.eq(x[2].estado, 'unida', 'la unión por mail no es un pedido: no la frena el tope');

  // ===== Link #unirme con DNI =====
  const info = tok => rpc('gym_unirse_token_info', tok);
  const usar = (tok, dni3, share = false) => rpc('gym_unirse_token', tok, dni3, VER, share, share ? VER : null);
  // El token sale de gym_ficha_crear (que queda hecho): se guarda en una tabla de la prueba.
  await db.sql('create table prueba.tok (k text primary key, v text);');
  const nueva = async (k, d) => {
    const r = await HACER('dA', rpc('gym_ficha_crear', d));
    await db.sql(`insert into prueba.tok values (${lit(k)}, ${lit(r.token)}) on conflict (k) do update set v = excluded.v;`);
    return r;
  };
  const conDni = await nueva('dni', { nombre: 'Nora Vidal', dni: '33.444.555', email: 'otra@ejemplo.test' });
  const tokDni = (await J(`select to_jsonb(v) from prueba.tok where k = 'dni'`));
  t.ok(/^[0-9a-f]{64}$/.test(tokDni) && conDni.expires_at, 'gym_ficha_crear devuelve el token del link (64 hexadecimales) y su vencimiento');
  t.eq(await J(`select to_jsonb(count(*)) from public.gym_members where invite_token_hash = public.gym_hash(${lit(tokDni)})`), 1, 'se guarda solo el hash del token');
  x = await V([['N', info(tokDni)]]);
  t.eq(canon(x[0]), canon({ estado: 'ok', gym: { name: 'Gimnasio Fuerza', city: 'Rosario' }, pide_dni: true }), 'antes del DNI: solo el gimnasio y que pide DNI (nada de la ficha)');
  x = await V([['N', usar(tokDni, '554')], ['N', usar(tokDni, '000')], ['postgres', ficha('N')]]);
  t.eq([x[0], x[1], x[2]], [{ estado: 'dni_mal', gym: { name: 'Gimnasio Fuerza', city: 'Rosario' }, quedan: 4 }, { estado: 'dni_mal', gym: { name: 'Gimnasio Fuerza', city: 'Rosario' }, quedan: 3 }, null],
    'DNI mal: no se une, cuenta el intento (sale sin raise: el intento queda)');
  x = await V([['N', usar(tokDni, '1')], ['N', usar(tokDni, '2')], ['N', usar(tokDni, '3')], ['N', usar(tokDni, '4')], ['N', usar(tokDni, '5')], ['N', info(tokDni)], ['N', usar(tokDni, '555')]]);
  t.eq(x.map(r => r.estado), ['dni_mal', 'dni_mal', 'dni_mal', 'dni_mal', 'bloqueado', 'vencido', 'vencido'], 'al quinto intento el link muere (aunque después pongan el DNI bien)');
  x = await V([['N', usar(tokDni, '555', true)], ['postgres', ficha('N')], ['N', info(tokDni)], ['N2', usar(tokDni, '555')], ['postgres', cupo],
    ['postgres', alertas('socio_se_unio')]]);
  t.eq([x[0].estado, x[1].id, x[1].terms, x[1].share, x[2].estado, x[3].estado, x[4], destinos(x[5])],
    ['activo', conDni.id, VER, true, 'vencido', 'vencido', [7, []], ['aA', 'dA']],
    'con los últimos 3 del DNI: la ficha queda con esta cuenta, la hoja y «compartir»; el link sirve una sola vez; no ocupa otro lugar');
  x = await V([['postgres', `update public.gym_members set invite_expires_at = now() - interval '1 minute' where id = '${conDni.id}'`], ['N', info(tokDni)], ['N', usar(tokDni, '555')]]);
  t.eq([x[1].estado, x[2].estado], ['vencido', 'vencido'], 'vencido (7 días): «El link ya no sirve»');
  x = await V([['N', unirse()], ['N', usar(tokDni, '555')], ['postgres', `select to_jsonb(count(*)) from public.gym_members where member_id = '${P.N}'`], ['postgres', ficha('N')]]);
  t.eq([x[1].estado, x[2], x[3].id], ['activo', 1, conDni.id], 'si ya había pedido sumarse a ese gimnasio, el pedido se reemplaza por la ficha');
  x = await V([['B1', usar(tokDni, '555')], ['C', usar(tokDni, '555')]]);
  t.eq(x.map(r => r.msg), ['Ya sos socio de Gimnasio Norte: primero salí desde Ajustes.', 'Una cuenta de coach no se puede sumar como socio de un gimnasio.'], 'otro gimnasio o un coach: no');
  t.eq(await PROBAR('N', rpc('gym_unirse_token', tokDni, '555', 'v0', false, null)), { error: 'P0001', msg: ACTUALIZA }, 'con otra versión de la hoja: «Actualizá la página»');
  // Un link nuevo vuelve a dar 5 intentos.
  x = await V([['N', usar(tokDni, '1')], ['dA', rpc('gym_ficha_link', conDni.id)], ['postgres', `select to_jsonb(dni_intentos) from public.gym_members where id = '${conDni.id}'`], ['N', info(tokDni)]]);
  t.eq([x[2], x[3].estado], [0, 'vencido'], 'gym_ficha_link: link nuevo, intentos en 0 y el anterior deja de servir');

  // ===== Link #unirme sin DNI: queda pedido unido a esa ficha =====
  const sinDni = await nueva('sin', { nombre: 'Bruno Castro' });
  const tokSin = await J(`select to_jsonb(v) from prueba.tok where k = 'sin'`);
  x = await V([['N2', info(tokSin)], ['N2', usar(tokSin, null)], ['postgres', ficha('N2')], ['dA', rpc('gym_solicitudes')], ['N', info(tokSin)]]);
  t.eq(canon(x[0]), canon({ estado: 'ok', gym: { name: 'Gimnasio Fuerza', city: 'Rosario' }, pide_dni: false }), 'sin DNI en la ficha, no lo pide');
  t.eq([x[1].estado, x[2].status, x[2].unir, x[4].estado], ['pendiente', 'pendiente', sinDni.id, 'vencido'], 'queda un pedido que apunta a esa ficha; el link ya no sirve');
  const sol = x[3].find(s => s.member_id === P.N2);
  t.eq([sol.via, sol.unir_sugerida, sol.coincidencias.map(c => [c.id === sinDni.id, c.motivo])], ['ficha', sinDni.id, [[true, 'link']]], 'gym_solicitudes la muestra con la coincidencia «link»');
  x = await V([['N2', usar(tokSin, null)], ['dA', `select to_jsonb(public.gym_aprobar((select id from public.gym_members where member_id = '${P.N2}' and status = 'pendiente'), '${P.pA1}', '${sinDni.id}', false))`],
    ['postgres', ficha('N2')], ['postgres', cupo], ['postgres', `select to_jsonb(count(*)) from public.gym_members where member_id = '${P.N2}'`]]);
  t.eq([x[1].id, x[2].id, x[2].status, nom(x[2].coach), nom(x[2].trainer), x[2].terms, x[3], x[4]], [sinDni.id, sinDni.id, 'activo', 'pA1', 'pA1', VER, [8, []], 1],
    '«Es la ficha de…»: la ficha cargada pasa a ser de esa cuenta (con la hoja), con el profe elegido; el pedido se borra; no ocupa otro lugar (8)');

  // ===== Aprobar y rechazar =====
  // El id del pedido lo anota un paso de postgres (la recepción no lee gym_members: lo ve por gym_solicitudes).
  const marca = w => ['postgres', `select to_jsonb(set_config('prueba.pedido', (select id::text from public.gym_members where member_id = '${P[w]}' and status = 'pendiente'), true))`];
  const pedido = `current_setting('prueba.pedido')::uuid`;
  const aprobar = (profe, quien = 'dA') => [quien, `select to_jsonb(public.gym_aprobar(${pedido}, ${profe ? lit(profe) : 'null'}, null, false))`];
  x = await V([['N', unirse()], marca('N'), aprobar(P.pA1), ['postgres', ficha('N')], ['postgres', cupo], ['postgres', alertas('solicitud_aprobada')],
    ['postgres', alertas('socios_asignados')], ['pA1', `select to_jsonb(public.is_my_client('${P.N}'))`], aprobar(null)]);
  t.eq([x[2].ok, x[2].id === x[3].id, x[3].status, nom(x[3].coach), nom(x[3].trainer), x[4], destinos(x[5]), destinos(x[6]), x[7], x[8].msg],
    [true, true, 'activo', 'pA1', 'pA1', [9, []], ['N'], ['pA1'], true, 'Esa solicitud ya no está pendiente.'],
    'aprobar como socio nuevo con profe: C = T = pA1, ocupa lugar (9), aviso al socio y al profe; el profe lo lee; aprobarla otra vez, no');
  x = await V([['N', unirse()], marca('N'), aprobar(null, 'rA'), ['postgres', ficha('N')]]);
  t.eq([x[2].ok, x[3].status, x[3].coach], [true, 'activo', null], 'la recepción (con «altas», prendido por defecto) aprueba sin profe');
  x = await V([['postgres', `update public.gyms set settings = '{"recepcion_altas": false}' where id = '${G.A}'`], ['N', unirse()], marca('N'), aprobar(null, 'rA')]);
  t.eq(x[3].error, '42501', 'con «altas» apagado, la recepción no');
  for (const profe of [P.rA, P.C]){
    x = await V([['N', unirse()], marca('N'), aprobar(profe)]);
    t.eq(x[2], { error: 'P0001', msg: 'Esa persona no es profe del gimnasio.' }, 'aprobar con un profe que no es del gimnasio: ' + nom(profe));
  }
  x = await V([['N', unirse()], marca('N'), ['postgres', `update public.coach_billing set max_clients = seats_used where coach_id = '${P.dA}'`], aprobar(null)]);
  t.eq(x[3], { error: 'P0001', msg: 'El gimnasio no puede sumar socios en este momento.' }, 'sin lugar: «El gimnasio no puede sumar socios en este momento» (sin nombrar el plan)');
  x = await V([['N', unirse()], marca('N'), ['postgres', `update public.coach_billing set trial_ends_at = now() - interval '60 days', paid_until = now() - interval '6 days' where coach_id = '${P.dA}'`],
    aprobar(P.pA1), aprobar(null)]);
  t.eq([x[3], x[4].ok], [{ error: 'P0001', msg: 'Por ahora el gimnasio no puede asignar profe.' }, true], 'con el plan vencido hace 6 días no se asigna profe (sí se aprueba sin profe)');
  x = await V([['C1', unirse()], marca('C1'), aprobar(P.pA1), ['postgres', ficha('C1')], ['servicio', `select to_jsonb(public.coach_client_ok('${P.C}', '${P.C1}'))`]]);
  t.eq([x[2].ok, nom(x[3].coach), x[3].trainer, x[4]], [true, 'C', null, true], 'aprobar a quien tiene un coach de afuera: lo conserva (T = null) aunque se elija profe; C sigue con ella');
  x = await V([['N', unirse()], marca('N'), ['dA', `select to_jsonb(public.gym_rechazar(${pedido}, 'No vive en la zona'))`], ['postgres', ficha('N')], ['postgres', alertas('solicitud_rechazada')],
    ['postgres', `select to_jsonb(data->>'motivo') from public.gym_audit where action = 'rechazar'`]]);
  t.eq([x[2], x[3], destinos(x[4]), x[5]], [{ ok: true }, null, ['N'], 'No vive en la zona'], 'rechazar: el pedido se borra, queda el motivo en la auditoría y un aviso al socio');
  // Coincidencias por mail y nombre.
  x = await V([['dA', rpc('gym_ficha_crear', { nombre: 'Elena  Paz', email: 'elena@ejemplo.test' })], ['N3', unirse()], ['dA', rpc('gym_solicitudes')]]);
  const s3 = x[2].find(s => s.member_id === P.N3);
  t.eq(s3.coincidencias.map(c => c.motivo), ['nombre'], 'gym_solicitudes: coincidencia por nombre');
  x = await V([['dA', rpc('gym_ficha_crear', { nombre: 'Otra Persona', email: 'n3@ejemplo.test' })], ['N3', unirse()], ['dA', rpc('gym_solicitudes')]]);
  t.eq(x[2].find(s => s.member_id === P.N3).coincidencias.map(c => c.motivo), ['mail'], 'y por mail (aunque no esté verificado: la decide el gimnasio)');

  // ===== Dos aprobaciones a la vez por el último lugar =====
  for (const w of ['N', 'N2']) t.eq((await HACER(w, unirse())).estado, 'pendiente', w + ' pide sumarse (queda)');
  const ids = await J(`select jsonb_agg(id order by member_id) from public.gym_members where member_id in ('${P.N}', '${P.N2}');`);
  await db.sql(`update public.coach_billing set max_clients = seats_used + 1 where coach_id = '${P.dA}';`);
  const aprobarYa = (fid, antes) => db.json(`select pg_sleep(${antes});
    begin;
    set local role authenticated;
    select set_config('request.jwt.claims', '{"sub":"${P.dA}","role":"authenticated"}', true);
    select public.gym_aprobar('${fid}', '${P.pA1}', null, false)::jsonb;
    select pg_sleep(0.5);
    commit;`).catch(e => ({ error: e.code, msg: e.msg }));
  const dos = await Promise.all([aprobarYa(ids[0], 0), aprobarYa(ids[1], 0.15)]);
  t.eq([dos.filter(r => r.ok).length, dos.filter(r => r.error === 'P0001' && /no puede sumar socios/.test(r.msg)).length], [1, 1],
    'dos aprobaciones a la vez con un solo lugar: entra una, la otra recibe el mensaje del cupo (sin deadlock): ' + JSON.stringify(dos));
  t.eq(await J(`select jsonb_build_array((select seats_used from public.coach_billing where coach_id = '${P.dA}') = (select max_clients from public.coach_billing where coach_id = '${P.dA}'),
      (select count(*) from public.gym_members where member_id in ('${P.N}', '${P.N2}') and status = 'activo'), prueba.invariantes());`), [true, 1, []],
    'el cupo queda justo en el tope y seats_drift vacío');
  t.eq(await INV(), [], 'invariantes al final');
  await db.borrar();
}
