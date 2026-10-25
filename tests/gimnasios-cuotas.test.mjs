// Gimnasios, etapa 2: las cuotas (supabase/gimnasios-cuotas.sql) en Postgres de verdad (tests/pg.mjs;
// sin Postgres se saltea). Con las personas de la etapa 1 (tests/gimnasios-comun.mjs):
// - Cada RPC nueva con cada persona: quién puede, quién recibe 42501 y quién P0001; la recepción cobra
//   solo con «La recepción registra pagos»; el profe y el socio no cobran ni ven los pagos de otros.
// - Tipos de cuota: crear, nombre repetido, cambiar, archivar; asignar (no una archivada, no la ficha
//   de otro gimnasio: no cambia nada).
// - Pagos: qué período cubre (sin pagos o vencida, desde el día que pagó; al día, desde el vencimiento),
//   «cubre hasta» a mano, el mismo id no anota dos, los datos que se rechazan, anular (vuelve el
//   vencimiento de antes) y que todo queda en gym_audit con quien lo hizo.
// - El estado (al día, por vencer, vencida, sin pagos) en el semáforo de la recepción y del profe, con la
//   misma forma de la etapa 1 y sin montos; sin cuota, igual que la etapa 1.
// - El ingreso con la cuota vencida: se anota como «cuota_vencida»; con «No dejar entrar», no se anota.
// - El resumen del mes (cobrado, por cobrar, cuántos en cada estado) y los pagos del mes.
// - El socio ve su cuota y sus pagos (sin quién los cargó ni las notas); nadie más que dueño y
//   administración lee las tablas; las ayudas no las llama la app; con el plan liberado no se cobra,
//   pero se lee.
import { conPg } from './pg.mjs';
import { P, F, G, ID, DATOS, ayudas, rpc, VENCE, conCanon } from './gimnasios-comun.mjs';

const PERSONAS = ['dA', 'aA', 'pA1', 'rA', 'A1', 'A6', 'dB', 'C', 'N', 'anon'];
const CM = ID('c01'), CT = ID('c03'), CB = ID('c0b');
const PAGO = ID('e101'), PAGO2 = ID('e102'), PAGO3 = ID('e103');
const HOY = "(now() at time zone 'America/Argentina/Buenos_Aires')::date";
const COBRA = `update public.gyms set settings = settings || '{"recepcion_cobra": true}' where id = '${G.A}'`;
const pago = (id, ficha, monto, medio = 'efectivo', fecha = null, hasta = null, nota = null) =>
  `select to_jsonb(public.gym_pago_registrar('${id}', '${ficha}', ${monto}, '${medio}', ${fecha || 'null'}, ${hasta || 'null'}, ${nota ? "'" + nota + "'" : 'null'}))`;
const asignar = (fichas, tipo, vence = null) => `select to_jsonb(public.gym_cuota_asignar(array[${fichas.map(f => `'${f}'`).join(',')}]::uuid[], ${tipo ? `'${tipo}'` : 'null'}, ${vence || 'null'}))`;
const fichaDe = f => `select jsonb_build_object('tipo', fee_type_id, 'vence', fee_due) from public.gym_members where id = '${f}'`;

export default async function ({ t: t0 }){
  const t = conCanon(t0);
  const h = await conPg(t);
  if (!h) return;
  const db = await h.nueva('gize_con');
  t.eq(await db.json(DATOS), [], 'las personas cargadas cumplen los invariantes');
  const { J, V, HACER, INV } = ayudas(db);
  await HACER('postgres', `insert into public.gym_fee_types (id, gym_id, name, amount, months) values
    ('${CM}', '${G.A}', 'Musculación', 30000, 1), ('${CT}', '${G.A}', 'Trimestral', 81000, 3), ('${CB}', '${G.B}', 'Libre', 25000, 1)`);
  const D = await J(`select jsonb_build_object('hoy', ${HOY}, 'mas1m', (${HOY} + interval '1 month')::date, 'mas3m', (${HOY} + interval '3 months')::date,
    'mas5', ${HOY} + 5, 'mas20', ${HOY} + 20, 'mas20_1m', (${HOY} + 20 + interval '1 month')::date, 'menos3', ${HOY} - 3, 'menos40', ${HOY} - 40,
    'mas30', ${HOY} + 30, 'mas2', ${HOY} + 2, 'menos3_ddmm', to_char(${HOY} - 3, 'DD/MM'), 'mas5_ddmm', to_char(${HOY} + 5, 'DD/MM'),
    'mas20_ddmm', to_char(${HOY} + 20, 'DD/MM'), 'inimes', date_trunc('month', ${HOY})::date)`);
  const quien = p => p === 'anon' ? 'anon' : P[p];

  // ===== Quién puede llamar cada RPC =====
  // [nombre, sql, {ok, P0001}, acción en gym_audit, antes (como postgres)]. El resto: 42501.
  const CASOS = [
    ['gym_cuotas_tipos', rpc('gym_cuotas_tipos'), { ok: ['dA', 'aA', 'dB'] }, null],
    ['gym_cuotas_tipos (la recepción cobra)', rpc('gym_cuotas_tipos'), { ok: ['dA', 'aA', 'rA', 'dB'] }, null, COBRA],
    ['gym_cuota_tipo_guardar', `select to_jsonb(public.gym_cuota_tipo_guardar(null, 'Pase libre', 45000, 1))`, { ok: ['dA', 'aA', 'dB'] }, 'cuota_tipo'],
    ['gym_cuota_tipo_archivar', `select to_jsonb(public.gym_cuota_tipo_archivar('${CT}', true))`, { ok: ['dA', 'aA'], P0001: ['dB'] }, 'cuota_archivar'],
    ['gym_cuota_asignar', asignar([F.A1], CM), { ok: ['dA', 'aA'], P0001: ['dB'] }, 'cuota_asignar'],
    ['gym_pago_registrar', pago(PAGO, F.A3, 30000), { P0001: ['dA', 'aA', 'dB'] }, null],
    ['gym_pago_registrar (con cuota)', pago(PAGO, F.A1, 30000), { ok: ['dA', 'aA'], P0001: ['dB'] }, 'pago', `update public.gym_members set fee_type_id = '${CM}' where id = '${F.A1}'`],
    ['gym_pago_registrar (la recepción cobra)', pago(PAGO, F.A1, 30000), { ok: ['dA', 'aA', 'rA'], P0001: ['dB'] }, 'pago',
      `update public.gym_members set fee_type_id = '${CM}' where id = '${F.A1}'; ${COBRA}`],
    ['gym_pago_anular', `select to_jsonb(public.gym_pago_anular('${PAGO}', 'Error'))`, { ok: ['dA', 'aA'], P0001: ['dB'] }, 'pago_anulado',
      `insert into public.gym_payments (id, gym_id, gym_member_id, amount, method, paid_on, period_from, period_to) values ('${PAGO}', '${G.A}', '${F.A1}', 30000, 'efectivo', current_date, current_date, current_date + 30); ${COBRA}`],
    ['gym_pagos_ficha', rpc('gym_pagos_ficha', F.A1), { ok: ['dA', 'aA'], P0001: ['dB'] }, null],
    ['gym_pagos_ficha (la recepción cobra)', rpc('gym_pagos_ficha', F.A1), { ok: ['dA', 'aA', 'rA'], P0001: ['dB'] }, null, COBRA],
    ['gym_cuotas_resumen', rpc('gym_cuotas_resumen'), { ok: ['dA', 'aA', 'dB'] }, null, COBRA],
    ['gym_pagos_mes', `select to_jsonb(public.gym_pagos_mes(null))`, { ok: ['dA', 'aA', 'dB'] }, null, COBRA],
    ['gym_cuotas_bloquear', rpc('gym_cuotas_bloquear', true), { ok: ['dA', 'aA', 'dB'] }, 'config'],
    ['gym_mi_cuota', rpc('gym_mi_cuota'), { ok: PERSONAS.filter(p => p !== 'anon') }, null],
  ];
  for (const [nombre, sql, esp, accion, antes] of CASOS){
    const r = await J(`select jsonb_object_agg(x.p, prueba.varios(jsonb_build_array(
        jsonb_build_object('quien', 'postgres', 'q', ${"'" + (antes || 'select 1').replace(/'/g, "''") + "'"}),
        jsonb_build_object('quien', x.q, 'q', ${"'" + sql.replace(/'/g, "''") + "'"}),
        jsonb_build_object('quien', 'postgres', 'q', format('select jsonb_build_array((select count(*) from public.gym_audit where action = %L and actor_id::text = %L), prueba.invariantes())', ${accion ? "'" + accion + "'" : "''"}, x.q)))))
      from (values ${PERSONAS.map(p => `('${p}', '${quien(p)}')`).join(', ')}) x(p, q);`);
    const obtenido = {}, espera = {};
    for (const p of PERSONAS){
      const [, res, despues] = r[p];
      obtenido[p] = 'error' in res ? res.error : 'ok';
      espera[p] = (esp.ok || []).includes(p) ? 'ok' : (esp.P0001 || []).includes(p) ? 'P0001' : '42501';
      if (obtenido[p] === 'ok'){
        if (accion) t.ok(despues.ok[0] >= 1, nombre + ' (' + p + '): queda en gym_audit («' + accion + '») con quien la hizo');
        t.eq(despues.ok[1], [], nombre + ' (' + p + '): invariantes después');
      }
    }
    t.eq(obtenido, espera, nombre + ': quién puede (ok), quién recibe P0001 y quién 42501 — ' + JSON.stringify(Object.fromEntries(PERSONAS.map(p => [p, r[p][1].msg || 'ok']))).slice(0, 900));
  }

  // ===== Tipos de cuota =====
  let x = await V([['dA', `select to_jsonb(public.gym_cuota_tipo_guardar(null, '  Pase libre ', 45000.5, 1))`],
    ['aA', `select to_jsonb(public.gym_cuota_tipo_guardar(null, 'pase LIBRE', 1000, 1))`],
    ['dA', `select to_jsonb(public.gym_cuota_tipo_guardar('${CM}', 'Musculación', 32000, 1))`],
    ['dA', `select to_jsonb(public.gym_cuota_tipo_guardar('${CB}', 'Libre', 1, 1))`],
    ['dA', `select to_jsonb(public.gym_cuota_tipo_guardar(null, 'X', 100, 1))`],
    ['dA', `select to_jsonb(public.gym_cuota_tipo_guardar(null, 'Rara', 100, 5))`],
    ['dA', `select to_jsonb(public.gym_cuota_tipo_guardar(null, 'Rara', -1, 1))`],
    ['dA', `select to_jsonb(public.gym_cuota_tipo_archivar('${CT}', true))`],
    ['dA', asignar([F.A1], CT)],
    ['dA', rpc('gym_cuotas_tipos')]]);
  t.eq([x[0].name, x[0].amount, x[0].months], ['Pase libre', 45000.5, 1], 'crear una cuota: el nombre sin espacios, el monto con centavos y cada cuántos meses');
  t.eq(x[1], { error: 'P0001', msg: 'Ya hay una cuota con ese nombre.' }, 'el mismo nombre (sin importar mayúsculas): no');
  t.eq(x[2].amount, 32000, 'cambiar el monto');
  t.eq(x[3], { error: 'P0001', msg: 'No encontramos esa cuota.' }, 'la cuota de otro gimnasio: no la encuentra');
  t.eq([x[4].msg, x[5].msg, x[6].msg], ['El nombre de la cuota tiene que tener entre 2 y 60 letras.', 'Elegí cada cuánto se paga: 1, 2, 3, 6 o 12 meses.',
    'Revisá el monto: en pesos, sin puntos de miles.'], 'nombre, meses y monto que no van');
  t.eq([x[7].archivada, x[8].msg], [true, 'Esa cuota no está (o está archivada).'], 'una cuota archivada no se asigna');
  t.eq(x[9].map(c => [c.name, c.archivada]), [['Musculación', false], ['Pase libre', false], ['Trimestral', true]], 'la lista: las archivadas al final');

  // ===== Asignar =====
  x = await V([['dA', asignar([F.A1, F.A2, F.A4], CM)], ['postgres', fichaDe(F.A1)], ['dA', asignar([F.A3, F.B1], CM)], ['postgres', fichaDe(F.A3)],
    ['dA', asignar([F.A6], CM)], ['dA', asignar([F.A3], CM, `${HOY} + 20`)], ['postgres', fichaDe(F.A3)], ['dA', asignar([F.A3], null)], ['postgres', fichaDe(F.A3)],
    ['dA', asignar([F.A3], CM, `${HOY} + 900`)]]);
  t.eq([x[0], x[1].tipo === CM, x[1].vence], [{ ok: 3 }, true, null], 'asignar una cuota a tres socios (con app y sin app)');
  t.eq([x[2].msg, x[3].tipo], ['Alguno de esos socios no está en el gimnasio (o está de baja): no se cambió nada.', null], 'con la ficha de otro gimnasio en la lista: no cambia nada');
  t.eq(x[4].msg, 'Alguno de esos socios no está en el gimnasio (o está de baja): no se cambió nada.', 'una solicitud pendiente no lleva cuota');
  t.eq([x[6].vence, x[8]], [D.mas20, { tipo: null, vence: D.mas20 }], 'con «ya está paga hasta», el vencimiento; sacar la cuota la deja sin cuota');
  t.eq(x[9].msg, 'Revisá la fecha: hasta cuándo ya está paga.', 'una fecha de acá a más de un año: no');

  // ===== Pagos =====
  x = await V([['dA', asignar([F.A1], CM)],
    ['rA', pago(PAGO, F.A1, 30000)],
    ['postgres', COBRA], ['rA', pago(PAGO, F.A1, 30000, 'transferencia', null, null, 'Pagó la hija')], ['rA', pago(PAGO, F.A1, 30000, 'transferencia')],
    ['postgres', fichaDe(F.A1)],
    ['dA', pago(PAGO2, F.A1, 30000)], ['postgres', fichaDe(F.A1)],
    ['dA', rpc('gym_pagos_ficha', F.A1)],
    ['postgres', `select jsonb_build_array((select count(*) from public.gym_payments), (select count(*) from public.gym_audit where action = 'pago' and actor_id = '${P.rA}'))`]]);
  t.eq(x[1].error, '42501', 'la recepción sin «registra pagos»: no cobra');
  t.eq([x[3].desde, x[3].hasta, x[3].repetido], [D.hoy, D.mas1m, false], 'sin pagos: cubre desde hoy y por un mes');
  t.eq([x[4].repetido, x[4].hasta], [true, D.mas1m], 'el mismo id otra vez: devuelve lo mismo y no anota otro');
  t.eq(x[5].vence, D.mas1m, 'el vencimiento nuevo queda en la ficha');
  const mas2m = await J(`select to_jsonb((${HOY} + interval '1 month' + interval '1 month')::date)`);
  t.eq([x[6].desde, x[6].hasta, x[7].vence], [D.mas1m, mas2m, mas2m], 'al día: el pago siguiente cubre desde el vencimiento (no desde hoy)');
  const fp = x[8];
  t.eq([fp.estado, fp.vence, fp.cuota.name, fp.pagos.length, fp.pagos.map(p => p.medio).sort(), fp.pagos.find(p => p.medio === 'transferencia').nota, fp.pagos.find(p => p.medio === 'transferencia').por],
    ['al_dia', mas2m, 'Musculación', 2, ['efectivo', 'transferencia'], 'Pagó la hija', 'Rocío Recepción'], 'el historial: cuota, vencimiento, estado y cada pago con quién lo cargó');
  t.eq(x[9], [2, 1], 'dos pagos; el de la recepción queda en gym_audit con ella');

  x = await V([['postgres', `update public.gym_members set fee_type_id = '${CT}', fee_due = ${HOY} - 3 where id = '${F.A2}'`],
    ['dA', pago(PAGO, F.A2, 81000)], ['postgres', fichaDe(F.A2)],
    ['dA', pago(PAGO2, F.A2, 1000, 'otro', null, `${HOY} + 5`)], ['postgres', fichaDe(F.A2)],
    ['dA', pago(PAGO3, F.A2, 0)], ['dA', pago(PAGO3, F.A2, 10, 'cheque')], ['dA', pago(PAGO3, F.A2, 10, 'efectivo', `${HOY} + 1`)],
    ['dA', pago(PAGO3, F.A2, 10, 'efectivo', null, `${HOY} - 1`)], ['dA', pago(PAGO3, F.A2, 10, 'efectivo', `${HOY} - 400`)],
    ['dA', pago(PAGO3, F.A4, 10)], ['dA', pago(PAGO3, F.A4, 10, 'efectivo', null, `${HOY} + 30`)], ['postgres', fichaDe(F.A4)],
    ['dA', pago(ID('e104'), F.A6, 10, 'efectivo', null, `${HOY} + 30`)], ['dA', pago(ID('e105'), F.B1, 10, 'efectivo', null, `${HOY} + 30`)]]);
  t.eq([x[1].desde, x[1].hasta, x[2].vence], [D.hoy, D.mas3m, D.mas3m], 'vencida: cubre desde el día que pagó, por los meses de su cuota (trimestral)');
  t.eq([x[3].desde, x[3].hasta, x[4].vence], [D.hoy, D.mas5, D.mas5], '«cubre hasta» a mano (antes del vencimiento de ahora): ese es el vencimiento nuevo');
  t.eq([x[5].msg, x[6].msg, x[7].msg, x[8].msg, x[9].msg], ['Revisá el monto: en pesos, sin puntos de miles.', 'Elegí cómo pagó: efectivo, transferencia u otro.',
    'Revisá la fecha del pago: no puede ser futura ni de hace más de un año.', 'Revisá hasta cuándo cubre: después del día que pagó y dentro de un año.',
    'Revisá la fecha del pago: no puede ser futura ni de hace más de un año.'], 'monto, medio, fecha y «cubre hasta» que no van');
  t.eq([x[10].msg, x[11].hasta, x[12].tipo, x[12].vence], ['Asignale una cuota al socio o elegí hasta cuándo cubre el pago.', D.mas30, null, D.mas30],
    'sin cuota: hay que decir hasta cuándo cubre (la ficha sin app también paga)');
  t.eq([x[13].msg, x[14].msg], ['No encontramos esa ficha (o está de baja).', 'No encontramos esa ficha (o está de baja).'], 'ni una solicitud ni la ficha de otro gimnasio');

  // Anular
  x = await V([['dA', asignar([F.A1], CM)], ['dA', pago(PAGO, F.A1, 30000)], ['dA', pago(PAGO2, F.A1, 30000)],
    ['postgres', COBRA], ['rA', `select to_jsonb(public.gym_pago_anular('${PAGO2}', 'x'))`],
    ['aA', `select to_jsonb(public.gym_pago_anular('${PAGO2}', 'Lo cargué dos veces'))`], ['postgres', fichaDe(F.A1)],
    ['aA', `select to_jsonb(public.gym_pago_anular('${PAGO2}', null))`],
    ['dA', `select to_jsonb(public.gym_pago_anular('${PAGO}', null))`], ['postgres', fichaDe(F.A1)],
    ['dA', rpc('gym_pagos_ficha', F.A1)], ['A1', rpc('gym_mi_cuota')]]);
  t.eq(x[4].error, '42501', 'la recepción no anula pagos');
  t.eq([x[5].vence, x[6].vence], [D.mas1m, D.mas1m], 'anular el último: el vencimiento vuelve al de antes');
  t.eq(x[7].msg, 'Ese pago ya está anulado.', 'no se anula dos veces');
  t.eq([x[9].vence, x[10].estado, x[10].pagos.filter(p => p.anulado).length, x[10].pagos.find(p => p.id === PAGO2).motivo], [null, 'sin_pagos', 2, 'Lo cargué dos veces'],
    'anulados los dos: sin pagos (siguen en el historial, tachados, con el motivo)');
  t.eq(x[11].pagos, [], 'el socio no ve los pagos anulados');

  // ===== Estado, semáforo y profe =====
  const busca = (w, q2) => [w, rpc('buscar_socio', q2)];
  const sem = r => r && r[0] && [r[0].semaforo, r[0].motivo];
  x = await V([['postgres', `update public.gym_members set fee_type_id = '${CM}', fee_due = ${HOY} + 20 where id = '${F.A1}'`],
    ['postgres', `update public.gym_members set fee_type_id = '${CM}', fee_due = ${HOY} - 3 where id = '${F.A2}'`],
    ['postgres', `update public.gym_members set fee_type_id = '${CM}', fee_due = ${HOY} + 5 where id = '${F.A3}'`],
    ['postgres', `update public.gym_members set fee_type_id = '${CM}', fee_due = null where id = '${F.A4}'`],
    busca('rA', 'Martina'), busca('rA', 'Juan'), busca('rA', 'Lucía'), busca('rA', 'Raúl'),
    ['pA1', rpc('gym_ficha_profe', P.A1)], ['pA1', rpc('gym_ficha_profe', P.A2)],
    ['postgres', `update public.gym_members set fee_due = ${HOY} where id = '${F.A3}'`], busca('rA', 'Lucía'),
    ['postgres', `update public.gym_members set status = 'pausado', paused_until = ${HOY} + 5 where id = '${F.A2}'`], busca('rA', 'Juan'),
    ['dA', rpc('gym_cuotas_resumen')]]);
  t.eq([sem(x[4]), sem(x[5]), sem(x[6]), sem(x[7])], [['verde', 'Al día hasta el ' + D.mas20_ddmm], ['rojo', 'Cuota vencida el ' + D.menos3_ddmm],
    ['ambar', 'La cuota vence el ' + D.mas5_ddmm], ['ambar', 'Cuota sin pagos cargados']], 'semáforo con cuota: al día verde, vencida rojo, por vencer (7 días) ámbar, sin pagos ámbar');
  t.eq(Object.keys(x[5][0]).sort(), ['apto_vencido', 'estado', 'foto_path', 'id', 'motivo', 'nombre', 'semaforo', 'ultimo_ingreso'], 'buscar_socio: la misma forma de la etapa 1 (sin montos)');
  t.eq([x[8].semaforo, x[8].motivo, x[9].motivo], ['verde', 'Al día hasta el ' + D.mas20_ddmm, 'Cuota vencida el ' + D.menos3_ddmm], 'el profe ve si la cuota de sus socios está al día');
  t.ok(!/amount|monto|30000/.test(JSON.stringify([x[8], x[9]])), 'el profe no ve montos');
  t.eq(sem(x[11]), ['ambar', 'La cuota vence hoy'], 'el día del vencimiento: «vence hoy» (todavía no está vencida)');
  t.eq(sem(x[13])[1].startsWith('Pausado hasta el'), true, 'pausado: sigue «Pausado» aunque la cuota esté vencida');
  const rs = x[14];
  t.eq(rs.conteo, { al_dia: 1, por_vencer: 1, vencida: 0, sin_pagos: 1, sin_cuota: 1 }, 'el resumen cuenta solo los activos en cada estado (el pausado no)');
  const sinCuota = await V([busca('rA', 'Martina'), busca('rA', 'Pedro'), ['pA1', rpc('gym_ficha_profe', P.A1)]]);
  t.eq([sem(sinCuota[0]), sem(sinCuota[1]), sinCuota[2].motivo], [['verde', 'Activo'], ['gris', 'No es socio'], 'Activo'], 'sin cuota: el semáforo de la etapa 1, tal cual');

  // ===== Ingreso con la cuota vencida =====
  const ING = ID('e201'), ING2 = ID('e202');
  x = await V([['postgres', `update public.gym_members set fee_type_id = '${CM}', fee_due = ${HOY} - 3 where id = '${F.A1}'`],
    ['rA', rpc('gym_ingreso_manual', ING, F.A1)],
    ['postgres', `delete from public.gym_entries where id = '${ING}'`],
    ['dA', rpc('gym_cuotas_bloquear', true)], ['rA', rpc('gym_ingreso_manual', ING, F.A1)],
    ['postgres', `select jsonb_build_array((select count(*) from public.gym_entries where id = '${ING}'), (select count(*) from public.gym_audit where action = 'ingreso_bloqueado'))`],
    ['dA', pago(PAGO, F.A1, 30000)], ['rA', rpc('gym_ingreso_manual', ING, F.A1)],
    ['rA', rpc('gym_ingreso_manual', ING2, F.A2)], ['dA', rpc('mi_gimnasio')]]);
  t.eq([x[1].result, x[1].repetido, !!x[1].bloqueado], ['cuota_vencida', false, false], 'con la cuota vencida (por defecto): el ingreso se anota como «cuota_vencida»');
  t.eq([x[3].settings.cuota_bloquea, x[4].bloqueado, x[4].result, x[4].vence, x[5]], [true, true, 'cuota_vencida', D.menos3, [0, 1]],
    '«No dejar entrar»: no se anota, dice hasta cuándo estaba paga y queda en gym_audit');
  t.eq([x[7].result, x[7].repetido], ['ok', false], 'pagó: el mismo ingreso ahora entra');
  t.eq(x[8].result, 'ok', 'otro socio sin cuota entra como siempre');
  t.eq(x[9].settings.cuota_bloquea, true, 'mi_gimnasio trae el interruptor');

  // ===== Resumen y pagos del mes =====
  x = await V([['dA', asignar([F.A1, F.A2, F.A3], CM)], ['dA', asignar([F.A4], CT)],
    ['dA', pago(PAGO, F.A1, 30000)], ['dA', pago(PAGO2, F.A2, 28000, 'transferencia')], ['dA', `select to_jsonb(public.gym_pago_anular('${PAGO2}', null))`],
    ['postgres', `update public.gym_members set fee_due = ${HOY} - 40 where id = '${F.A3}'`],
    ['dA', rpc('gym_cuotas_resumen')], ['aA', `select to_jsonb(public.gym_pagos_mes(null))`], ['dB', rpc('gym_cuotas_resumen')]]);
  const r = x[6];
  t.eq([r.cobrado, r.pagos_mes, r.mes, r.hoy], [30000, 1, D.inimes, D.hoy], 'cobrado en el mes: los pagos sin anular');
  t.eq([r.conteo.al_dia, r.conteo.vencida, r.conteo.sin_pagos], [1, 1, 2], 'en cada estado: ' + JSON.stringify(r.conteo));
  t.eq([r.socios_por_cobrar, r.por_cobrar], [3, 30000 + 30000 + 81000], 'por cobrar: la cuota de quien venció, vence este mes o no tiene pagos (A2, A3 y A4)');
  t.eq(r.socios.map(s => [s.nombre, s.cuota_estado]).filter(s => s[1]), [['Juan Pérez', 'sin_pagos'], ['Lucía Gómez', 'vencida'], ['Martina Sosa', 'al_dia'], ['Raúl Sin App', 'sin_pagos']],
    'cada socio con su estado');
  t.eq([x[7].length, x[7].filter(p => p.anulado).length, x[7].find(p => !p.anulado).socio, x[7].find(p => !p.anulado).por], [2, 1, 'Martina Sosa', 'Laura Fuerza'], 'los pagos del mes, con los anulados marcados');
  t.eq([x[8].socios.length, x[8].cobrado], [1, 0], 'el dueño de otro gimnasio ve solo el suyo');

  // ===== El socio =====
  x = await V([['dA', asignar([F.A1], CM)], ['dA', pago(PAGO, F.A1, 30000, 'efectivo', null, null, 'nota interna')],
    ['A1', rpc('gym_mi_cuota')], ['A6', rpc('gym_mi_cuota')], ['C1', rpc('gym_mi_cuota')], ['A3', rpc('gym_mi_cuota')]]);
  t.eq([x[2].estado, x[2].vence, x[2].cuota, x[2].pagos.length, Object.keys(x[2].pagos[0]).sort()],
    ['al_dia', D.mas1m, { name: 'Musculación', amount: 30000, months: 1 }, 1, ['fecha', 'hasta', 'medio', 'monto']],
    'el socio ve su cuota, cuándo vence y sus pagos (sin quién los cargó ni las notas)');
  t.eq([x[3], x[4], x[5]], [null, null, { estado: null, vence: null, cuota: null, pagos: [] }], 'una solicitud o alguien sin gimnasio: null; un socio sin cuota: sin nada');

  // ===== Leer las tablas directo =====
  const cuenta = (w, tb) => [w, `select to_jsonb(count(*)) from public.${tb}`];
  x = await V([['dA', asignar([F.A1], CM)], ['dA', pago(PAGO, F.A1, 30000)], ['dB', pago(PAGO2, F.B1, 25000, 'efectivo', null, `${HOY} + 30`)],
    ...['dA', 'aA', 'pA1', 'rA', 'A1', 'dB', 'anon'].flatMap(w => [cuenta(w, 'gym_payments'), cuenta(w, 'gym_fee_types')]),
    ['dA', `insert into public.gym_payments (id, gym_id, gym_member_id, amount, method, paid_on, period_from, period_to) values ('${PAGO3}', '${G.A}', '${F.A1}', 1, 'efectivo', current_date, current_date, current_date + 1)`],
    ['dA', `update public.gym_fee_types set amount = 1`], ['dA', `update public.gym_members set fee_due = current_date + 900 where id = '${F.A1}'`]]);
  const vistas = x.slice(3, 17).map(v => v.error || v);
  t.eq(vistas, [1, 2, 1, 2, 0, 0, 0, 0, 0, 0, 1, 1, '42501', '42501'], 'dueño y administración leen los pagos y las cuotas de su gimnasio; profe, recepción y socio no (por funciones); anon, nada');
  t.eq(x.slice(17).map(v => v.error), ['42501', '42501', '42501'], 'nadie escribe directo (pagos, cuotas ni el vencimiento de la ficha)');

  // ===== Con el plan liberado: no se cobra, se lee =====
  x = await V([['dA', asignar([F.A1], CM)], ['postgres', VENCE('dA', '30 days')], ['dA', pago(PAGO, F.A1, 30000)], ['dA', asignar([F.A2], CM)],
    ['dA', rpc('gym_cuotas_resumen')], ['dA', rpc('gym_pagos_ficha', F.A1)]]);
  t.eq([x[2].msg, x[3].msg, !!x[4].conteo, !!x[5].ficha], ['Las cuotas están pausadas: hablá con la administración del gimnasio.', 'Las cuotas están pausadas en este momento.', true, true],
    'con el plan vencido hace más de 10 días no se cobra ni se asigna (sin nombrar el plan); el resumen y el historial se leen');

  // ===== Internas, permisos y borrar =====
  const INTERNAS = ['gym_cuota_estado(uuid, date)', 'gym_cuota_json(uuid)', 'gym_exigir_cobro(boolean)', 'gym_exigir_cuotas()'];
  const APP = ['gym_cuotas_tipos()', 'gym_cuota_tipo_guardar(uuid, text, numeric, integer)', 'gym_cuota_tipo_archivar(uuid, boolean)', 'gym_cuota_asignar(uuid[], uuid, date)',
    'gym_pago_registrar(uuid, uuid, numeric, text, date, date, text)', 'gym_pago_anular(uuid, text)', 'gym_pagos_ficha(uuid)', 'gym_cuotas_resumen()', 'gym_pagos_mes(date)',
    'gym_cuotas_bloquear(boolean)', 'gym_mi_cuota()', 'gym_ingreso_manual(uuid, uuid)'];
  const perm = await J(`select jsonb_object_agg(f, jsonb_build_array(has_function_privilege('anon', ('public.' || f)::regprocedure, 'execute'),
      has_function_privilege('authenticated', ('public.' || f)::regprocedure, 'execute'))) from unnest(array[${[...INTERNAS, ...APP].map(f => `'${f}'`).join(', ')}]) f;`);
  t.eq(INTERNAS.filter(f => perm[f][0] || perm[f][1]), [], 'las ayudas no las llama la app (ni anon ni authenticated)');
  t.eq(APP.filter(f => perm[f][0] || !perm[f][1]), [], 'las de la app: con sesión sí, anon no');
  x = await V([['dA', asignar([F.A1], CM)], ['dA', pago(PAGO, F.A1, 30000)], ['postgres', `delete from public.gym_members where id = '${F.A1}'`],
    ['postgres', `select to_jsonb(count(*)) from public.gym_payments`], ['dA', pago(PAGO2, F.A2, 1, 'efectivo', null, `${HOY} + 30`)],
    ['postgres', `delete from public.gyms where id = '${G.A}'`], ['postgres', `select jsonb_build_array((select count(*) from public.gym_payments), (select count(*) from public.gym_fee_types))`]]);
  t.eq([x[3], x[6]], [0, [0, 1]], 'los pagos se van con la ficha; los pagos y las cuotas, con el gimnasio (queda la del otro)');
  t.eq(await INV(), [], 'invariantes al final');
  await db.borrar();
}
