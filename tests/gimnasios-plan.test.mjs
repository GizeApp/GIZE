// Gimnasios, etapa 1: el plan del gimnasio vencido y restaurado (§7.3, §6.13) en Postgres de verdad
// (tests/pg.mjs; sin Postgres se saltea).
// - Días 0 a 5 (gracia): todo anda. 5 a 10: el profe y la administración dejan de leer (y el chat se
//   corta: coach_client_ok), sigue lo operativo (recepción, ingresos, exportar, aprobar sin profe). Día
//   10: la recepción se apaga y release_lapsed_gyms deja a los socios sin profe (R = el profe, C = T =
//   null, coach_left_at), también a los alumnos propios de la dueña; las rutinas programadas no se borran.
// - Restaurar sin trigger en coach_billing: gym_tick (cada minuto) restaura después de un pago por
//   Mercado Pago, Apple o el admin (admin_set_paid), solo a quien sigue sin coach, en el gimnasio y con
//   su profe en el equipo.
// - Sobre el cupo: solo se frenan las altas. mi_gimnasio: el estado del plan.
// - Concurrencia: release_lapsed_gyms con gym_restaurar de otro gimnasio y con un join_coach que toca
//   un perfil que libera: sin deadlock y con el cupo exacto.
import { conPg } from './pg.mjs';
import { P, F, G, VER, CODIGO, DATOS, ayudas, rpc, nom, ESTADO, conCanon, VENCE } from './gimnasios-comun.mjs';

const ADM = 'a0000000-0000-4000-8000-0000000000ad';
const NUEVO = 'b0000000-0000-4000-8000-0000000000e2';

export default async function ({ t: t0 }){
  const t = conCanon(t0);
  const h = await conPg(t);
  if (!h) return;
  const db = await h.nueva('gize_con');
  t.eq(await db.json(DATOS), [], 'las personas cargadas cumplen los invariantes');
  await db.sql(`insert into auth.users (id, email, raw_user_meta_data) values ('${ADM}', 'admin@ejemplo.test', '{"full_name":"Admin GIZE"}');
    insert into public.app_admins (user_id) values ('${ADM}'); insert into prueba.nombres values ('${ADM}', 'ADM');`);
  const { J, V, INV } = ayudas(db);
  const est = e => e && [nom(e.coach), e.ficha && e.ficha.status, e.ficha && nom(e.ficha.trainer), e.ficha && nom(e.ficha.restore)];

  // ===== Estado del plan (mi_gimnasio) =====
  const plan = antes => V([['postgres', antes], ['dA', rpc('mi_gimnasio')], ['pA1', rpc('mi_gimnasio')]]);
  let x = await plan('select 1');
  t.eq([x[1].plan.estado, x[2].plan.estado], ['activo', 'activo'], 'al día: activo');
  for (const [hace, esp] of [['1 day', 'gracia'], ['4 days 23 hours', 'gracia'], ['5 days 1 hour', 'operativo'], ['9 days 23 hours', 'operativo'], ['10 days 1 hour', 'liberado']]){
    x = await plan(VENCE('dA', hace));
    t.eq([x[1].plan.estado, x[2].plan.estado], [esp, esp], 'vencido hace ' + hace + ': ' + esp + ' (la dueña y el profe)');
  }
  x = await plan(VENCE('dA', '1 day'));
  const vence = new Date(x[1].plan.vence), pausa = new Date(x[1].plan.pausa_profes_el);
  t.ok(Math.abs((pausa - vence) / 864e5 - 5) < 0.001 && x[2].plan.pausa_profes_el === x[1].plan.pausa_profes_el, 'pausa_profes_el = vencimiento + 5 días (lo ve el profe para el cartel)');
  x = await plan(`update public.coach_billing set plan = 'cortesia' where coach_id = '${P.dA}'; ` + VENCE('dA', '90 days'));
  t.eq([x[1].plan.estado, x[1].plan.vence], ['activo', null], 'con cortesía no vence');

  // ===== Qué anda en cada tramo =====
  const tramo = antes => V([['postgres', antes],
    ['pA1', `select to_jsonb(public.is_my_client('${P.A1}'))`],
    ['dA', `select to_jsonb(public.gym_reads_member('${P.A1}'))`],
    ['dA', `select to_jsonb((select count(*) from public.sessions where client_id = '${P.A1}'))`],
    ['servicio', `select to_jsonb(public.coach_client_ok('${P.pA1}', '${P.A1}'))`],
    ['rA', rpc('buscar_socio', 'Martina')],
    ['rA', rpc('gym_ingreso_manual', NUEVO, F.A2)],
    ['dA', rpc('gym_exportar', 'socios')],
    ['dA', rpc('gym_asignar_profe', [F.A3], P.pA2)],
    ['dA', rpc('gym_aprobar', F.A6, null, null, false)],
    ['pA1', `select to_jsonb(public.is_my_client('${P.P1}'))`]]);
  const ok = r => r && !r.error;
  const resumen = r => [r[1], r[2], r[3], r[4], ok(r[5]), ok(r[6]), ok(r[7]), ok(r[8]), ok(r[9]), r[10]];
  t.eq(resumen(await tramo('select 1')), [true, true, 1, true, true, true, true, true, true, true], 'al día: todo anda');
  t.eq(resumen(await tramo(VENCE('dA', '4 days 23 hours'))), [true, true, 1, true, true, true, true, true, true, true], 'días 0 a 5 (gracia): todo anda');
  x = await tramo(VENCE('dA', '5 days 1 hour'));
  t.eq(resumen(x), [false, false, 0, false, true, true, true, false, true, true],
    'días 5 a 10: el profe y la administración no leen, el chat se corta; la recepción, los ingresos, exportar y aprobar (sin profe) siguen; el alumno propio del profe sigue');
  t.eq(x[8], { error: 'P0001', msg: 'Por ahora el gimnasio no puede asignar profe.' }, 'asignar profe, no');
  x = await tramo(VENCE('dA', '10 days 1 hour'));
  t.eq(resumen(x), [false, false, 0, false, false, false, true, false, true, true], 'desde el día 10: la recepción y los ingresos se apagan; exportar sigue');
  t.eq(x[5], { error: 'P0001', msg: 'La recepción está pausada: hablá con la administración del gimnasio.' }, 'con el texto de la recepción pausada');

  // ===== Día 10: release_lapsed_gyms =====
  const estado = ['postgres', `select jsonb_build_object(${['A1', 'A2', 'A3', 'A7', 'D1', 'P1', 'B1'].map(w => `'${w}', (${ESTADO(w)})`).join(', ')},
      'lapsed', (select jsonb_object_agg(name, lapsed_at is not null) from public.gyms),
      'programadas', (select jsonb_object_agg(prueba.n(client_id), prueba.n(created_by)) from public.routine_schedule where applied_at is null and client_id in ('${P.A1}', '${P.A7}', '${P.D1}')),
      'salio', (select jsonb_object_agg(prueba.n(id), coach_left_at is not null) from public.profiles where id in ('${P.A1}', '${P.D1}', '${P.P1}')),
      'cupos', (select jsonb_object_agg(prueba.n(coach_id), seats_used) from public.coach_billing where coach_id in ('${P.dA}', '${P.pA1}', '${P.dB}')),
      'inv', prueba.invariantes())`];
  const ver = e => Object.assign(Object.fromEntries(['A1', 'A2', 'A3', 'A7', 'D1', 'P1', 'B1'].map(w => [w, est(e[w])])), { lapsed: e.lapsed, programadas: e.programadas, salio: e.salio, cupos: e.cupos, inv: e.inv.concat(...['A1', 'A2', 'A3', 'A7', 'D1', 'P1', 'B1'].map(w => e[w].inv)) });
  x = await V([['postgres', VENCE('dA', '9 days 23 hours')], ['postgres', 'select to_jsonb(public.release_lapsed_gyms())'], estado]);
  t.eq([x[1], ver(x[2]).lapsed['Gimnasio Fuerza']], [0, false], 'a los 9 días y 23 horas, release_lapsed_gyms no hace nada');
  x = await V([['postgres', VENCE('dA', '10 days 1 hour')], ['postgres', 'select to_jsonb(public.release_lapsed_gyms())'], estado, ['postgres', 'select to_jsonb(public.release_lapsed_gyms())'],
    ['postgres', `select coalesce(jsonb_agg(kind), '[]') from public.gym_alerts where kind in ('socio_sin_profe', 'plan_liberado')`], ['dA', rpc('gym_exportar', 'socios')],
    ['postgres', 'select to_jsonb(public.gym_tick())'], ['A1', rpc('mi_gimnasio')]]);
  const v1 = ver(x[2]);
  t.eq(x[1], 4, 'a los 10 días: libera a 4 (A1, A2, A7 del gimnasio y D1, alumno propio de la dueña)');
  t.eq([v1.A1, v1.A2, v1.A3, v1.A7, v1.D1, v1.P1, v1.B1], [[null, 'activo', null, 'pA1'], [null, 'activo', null, 'pA1'], [null, 'activo', null, null], [null, 'activo', null, 'dA'],
    [null, undefined, undefined, undefined], ['pA1', undefined, undefined, undefined], ['dB', 'activo', 'dB', null]],
    'R = el profe, C = T = null; A3 (sin profe) no cambia; P1 (alumno propio del profe) y el gimnasio B tampoco');
  t.eq([v1.lapsed, v1.programadas, v1.salio, v1.cupos, v1.inv], [{ 'Gimnasio Fuerza': true, 'Gimnasio Norte': false }, { A1: 'pA1', A7: 'dA', D1: 'dA' },
    { A1: true, D1: true, P1: false }, { dA: 5, pA1: 1, dB: 1 }, []],
    'lapsed_at; las rutinas programadas NO se borran (gize.gym_keep_routines); coach_left_at (el aviso de la app de hoy); el cupo exacto; invariantes');
  t.eq([x[3], x[4], x[5].length, x[6], x[7].ficha.profe], [0, ['plan_liberado', 'plan_liberado'], 6, 0, null],
    'una segunda corrida no hace nada; un resumen a la administración (sin un aviso por socio); exportar sigue; sin pagar, gym_tick no restaura');

  // ===== Restaurar al pagar: Mercado Pago, Apple y el admin =====
  const liberar = [['postgres', VENCE('dA', '10 days 1 hour')], ['postgres', 'select to_jsonb(public.release_lapsed_gyms())']];
  const PAGOS = [
    ['Mercado Pago', ['postgres', `update public.coach_billing set paid_until = now() + interval '30 days', mp_preapproval_id = 'preaprobacion-de-prueba', mp_status = 'authorized' where coach_id = '${P.dA}'`]],
    ['Apple', ['postgres', `update public.coach_billing set paid_until = now() + interval '30 days', apple_original_tx = 'transaccion-de-prueba' where coach_id = '${P.dA}'`]],
    ['el admin (admin_set_paid)', [ADM, `select to_jsonb(true) from (select public.admin_set_paid('${P.dA}', 'p100', 100, current_date + 30)) x`]]];
  for (const [como, pago] of PAGOS){
    x = await V([...liberar, pago, ['postgres', 'select to_jsonb(public.gym_tick())'], estado, ['postgres', 'select to_jsonb(public.gym_tick())'],
      ['pA1', `select to_jsonb(public.is_my_client('${P.A1}'))`], ['dA', rpc('mi_gimnasio')]]);
    const v = ver(x[4]);
    t.ok(!x[2] || !x[2].error, 'pago por ' + como + ': ' + JSON.stringify(x[2]));
    t.eq([x[3], v.A1, v.A2, v.A7, v.D1, v.lapsed['Gimnasio Fuerza'], v.programadas, v.cupos, v.inv],
      [3, ['pA1', 'activo', 'pA1', null], ['pA1', 'activo', 'pA1', null], ['dA', 'activo', 'dA', null], [null, undefined, undefined, undefined], false,
        { A1: 'pA1', A7: 'dA', D1: 'dA' }, { dA: 5, pA1: 1, dB: 1 }, []],
      'pago por ' + como + ': gym_tick restaura (C = T = R, R = null, lapsed_at = null) a A1, A2 y A7; D1, alumno propio de la dueña, no; rutinas y cupo exactos');
    t.eq([x[5], x[6], x[7].plan.estado], [0, true, 'activo'], 'una segunda corrida no hace nada; el profe vuelve a leer; el plan, activo');
  }
  // A los que se fueron o eligieron otro coach no los toca; un profe que ya no está, tampoco.
  x = await V([...liberar, ['A1', rpc('gym_salir', false)], ['A2', `select public.join_coach('${CODIGO.C}')::jsonb`],
    ['postgres', `update public.gym_staff set left_at = now() where user_id = '${P.pA2}'`], PAGOS[0][1], ['postgres', 'select to_jsonb(public.gym_tick())'], estado]);
  const v2 = ver(x[7]);
  t.eq([x[6], v2.A1, v2.A2, v2.A7, v2.inv], [1, [null, 'baja', null, null], ['C', 'activo', null, null], ['dA', 'activo', 'dA', null], []],
    'restaurar no toca a quien salió (A1) ni a quien eligió otro coach (A2, ahora con C): solo A7; R queda vacío para todos');
  x = await V([...liberar, ['dA', rpc('gym_quitar_staff', P.pA1, null)], PAGOS[0][1], ['postgres', 'select to_jsonb(public.gym_tick())'], estado]);
  t.eq([x[4], ver(x[5]).A1], [1, [null, 'activo', null, null]], 'si su profe dejó el equipo, no lo restaura (queda sin profe)');
  x = await V([...liberar, ['postgres', `insert into public.user_blocks (blocker, blocked) values ('${P.A1}', '${P.pA1}')`], PAGOS[0][1], ['postgres', 'select to_jsonb(public.gym_tick())'], estado]);
  t.eq([x[4], ver(x[5]).A1], [2, [null, 'activo', null, null]], 'si lo bloqueó mientras tanto, tampoco');

  // ===== Sobre el cupo: solo se frenan las altas =====
  x = await V([['postgres', `update public.coach_billing set max_clients = 3 where coach_id = '${P.dA}'`], ['dA', rpc('mi_gimnasio')],
    ['pA1', `select to_jsonb(public.is_my_client('${P.A1}'))`], ['dA', `select to_jsonb(public.gym_reads_member('${P.A1}'))`], ['rA', rpc('gym_ingreso_manual', NUEVO, F.A2)],
    ['dA', rpc('gym_asignar_profe', [F.A3], P.pA2)], ['dA', rpc('gym_aprobar', F.A6, null, null, false)], ['dA', rpc('gym_ficha_crear', { nombre: 'Gabriel Núñez' })],
    ['dA', rpc('gym_baja', F.A2, null)], ['dA', rpc('gym_reactivar', F.A2)], ['N', `select public.join_coach('FUERZA22')::jsonb`], ['N', `select public.join_coach('${CODIGO.dA}')::jsonb`]]);
  const NO = 'El gimnasio no puede sumar socios en este momento.';
  t.eq([x[1].plan.sobre_cupo, x[1].plan.estado, x[2], x[3], ok(x[4]), x[5].ok], [true, 'activo', true, true, true, [F.A3]],
    'sobre el cupo (6 de 3): el plan sigue activo; el profe lee, la administración lee, la recepción registra, se asigna profe');
  t.eq([x[6].msg, x[7].msg, x[9].msg, x[10].code, x[11].msg], [NO, NO, NO, 'P0001', 'Tu coach llegó al máximo de alumnos: por ahora no puede sumar más. Avisale y volvé a intentar.'],
    'pero aprobar, cargar fichas y reactivar una baja se frenan con el texto neutral; los pedidos con el código siguen llegando; nadie nuevo se vincula a la dueña');

  // ===== Concurrencia: liberar, restaurar otro gimnasio y un join_coach a la vez =====
  await db.sql(`${VENCE('dA', '10 days 1 hour')};
    update public.gyms set lapsed_at = now() - interval '1 day' where id = '${G.B}';
    update public.gym_members set restore_trainer_id = '${P.dB}' where id = '${F.B1}';
    update public.profiles set coach_id = null where id = '${P.B1}';`);
  t.eq(await INV(), [], 'preparado: A vencido hace 10 días, B liberado y ya al día');
  const correr = (sql, antes, despues) => db.json(`select pg_sleep(${antes});
    begin;
    ${sql}
    select pg_sleep(${despues});
    commit;
    select to_jsonb(true);`).catch(e => ({ error: e.code, msg: e.msg }));
  const tres = await Promise.all([
    correr(`select public.release_lapsed_gyms();`, 0, 0.6),
    correr(`select public.gym_tick();`, 0.1, 0.3),
    correr(`set local role authenticated; select set_config('request.jwt.claims', '{"sub":"${P.D1}","role":"authenticated"}', true); select public.join_coach('${CODIGO.C}');`, 0.2, 0)]);
  t.ok(tres.every(r => r === true), 'release_lapsed_gyms, gym_tick (restaura B) y un join_coach de D1 a la vez: terminan los tres, sin deadlock: ' + JSON.stringify(tres));
  const fin = await J(`select jsonb_build_object('B1', (select prueba.n(coach_id) from public.profiles where id = '${P.B1}'), 'D1', (select prueba.n(coach_id) from public.profiles where id = '${P.D1}'),
      'A1', (select prueba.n(restore_trainer_id) from public.gym_members where id = '${F.A1}'), 'inv', prueba.invariantes());`);
  t.eq(fin, { B1: 'dB', D1: 'C', A1: 'pA1', inv: [] }, 'B1 vuelve con dB; D1 queda con C (lo liberó el cron y después se vinculó); A1 liberado con R; cupo exacto (seats_drift vacío)');
  await db.borrar();
}
