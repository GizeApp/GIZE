// Gimnasios, etapa 1: cada fila de la tabla de estados y transiciones del vínculo (§6.13) en Postgres de
// verdad (tests/pg.mjs; sin Postgres se saltea). C = profiles.coach_id, S = gym_members.status,
// T = gym_members.trainer_id, R = restore_trainer_id. Después de cada operación: los invariantes de la
// etapa 0 (I1: seats_used = recount_seats; I2: T sigue a C…), qué cupo cambió, las rutinas programadas
// (gize.gym_keep_routines) y los avisos anotados. Las filas del plan vencido están en
// gimnasios-plan, las de borrar la cuenta en gimnasios-borrar y la de pedir sumarse en
// gimnasios-solicitudes; acá van todas las demás, más el equipo (invitar, aceptar, cambiar el rol,
// quitar con reasignación: la trampa C20 cerrada).
import { conPg, lit } from './pg.mjs';
import { P, F, G, VER, CODIGO, DATOS, ayudas, rpc, nom, ESTADO, conCanon, VENCE } from './gimnasios-comun.mjs';

const cupos = `select jsonb_object_agg(prueba.n(coach_id), seats_used) from public.coach_billing
  where coach_id in ('${P.dA}', '${P.pA1}', '${P.pA2}', '${P.C}', '${P.dB}')`;
const alertas = tipo => `select coalesce(jsonb_agg(substr(recipient, 3) order by recipient), '[]') from public.gym_alerts where kind = '${tipo}'`;
const programadas = who => `select coalesce(jsonb_agg(prueba.n(created_by)), '[]') from public.routine_schedule where client_id = '${P[who]}' and applied_at is null`;

export default async function ({ t: t0 }){
  const t = conCanon(t0);
  const h = await conPg(t);
  if (!h) return;
  const db = await h.nueva('gize_con');
  t.eq(await db.json(DATOS), [], 'las personas cargadas cumplen los invariantes');
  const { J, V, INV } = ayudas(db);
  const est = e => e && { coach: nom(e.coach), status: e.ficha && e.ficha.status, trainer: e.ficha && nom(e.ficha.trainer), restore: e.ficha && nom(e.ficha.restore), inv: e.inv };
  const quien = a => a.map(nom).sort();
  const BASE = { dA: 6, pA1: 1, pA2: 0, C: 1, dB: 1 };

  // ===== gym_aprobar (S pendiente → activo) =====
  let x = await V([['dA', rpc('gym_aprobar', F.A6, P.pA2, null, false)], ['postgres', ESTADO('A6')], ['postgres', cupos]]);
  t.eq([est(x[1]), x[2]], [{ coach: 'pA2', status: 'activo', trainer: 'pA2', restore: null, inv: [] }, Object.assign({}, BASE, { dA: 7 })],
    'gym_aprobar con profe: S = activo, C = T = profe elegido; ocupa un lugar del gimnasio (7), no del profe');

  // ===== Socio sin profe pone el código de un profe de su gimnasio =====
  x = await V([['A3', `select public.join_coach('${CODIGO.pA2}')::jsonb`], ['postgres', ESTADO('A3')], ['postgres', cupos], ['postgres', alertas('profe_por_codigo')]]);
  t.eq([x[0], est(x[1]), x[2], quien(x[3])], [true, { coach: 'pA2', status: 'activo', trainer: 'pA2', restore: null, inv: [] }, BASE, ['aA', 'dA']],
    'socio sin profe + código de un profe de su gimnasio: C = T = ese profe, sin cambiar ningún cupo, y la administración lo ve en el resumen');

  // ===== Socio sin profe pone el código de un coach de afuera =====
  x = await V([['A3', `select public.join_coach('${CODIGO.C}')::jsonb`], ['postgres', ESTADO('A3')], ['postgres', cupos],
    ['dA', rpc('gym_asignar_profe', [F.A3], P.pA1)], ['dA', rpc('gym_socios_resumen')]]);
  t.eq([x[0], est(x[1]), x[2]], [true, { coach: 'C', status: 'activo', trainer: null, restore: null, inv: [] }, Object.assign({}, BASE, { C: 2 })],
    'socio sin profe + código de un coach de afuera: C = coach externo, T = null; vínculo propio (C cuenta 2) y la ficha sigue contando en A');
  t.eq([x[3].saltadas, x[4].find(s => s.id === F.A3).coach_externo], [[{ id: F.A3, motivo: 'coach_externo' }], true], 'y el gimnasio no le puede asignar profe («Coach externo»)');

  // ===== gym_asignar_profe =====
  x = await V([['dA', rpc('gym_asignar_profe', [F.A1, F.A2, F.A3, F.A4, F.A5, F.A6, F.A7], P.pA2)], ['postgres', ESTADO('A1')], ['postgres', ESTADO('A3')],
    ['postgres', programadas('A1')], ['postgres', cupos], ['postgres', alertas('profe_asignado')], ['postgres', alertas('socios_asignados')],
    ['pA1', `select jsonb_build_array(public.is_my_client('${P.A1}'), (select count(*) from public.gym_members where id = '${F.A1}'))`],
    ['postgres', `update public.routine_schedule set starts_on = current_date - 1 where client_id = '${P.A1}'`],
    ['pA2', `select to_jsonb(public.apply_due_routines('${P.A1}'))`]]);
  t.eq([x[0].ok.map(nom).sort(), x[0].saltadas.map(s => [nom(s.id), s.motivo]).sort()],
    [['A1', 'A2', 'A3'], [['A4', 'sin_app'], ['A5', 'no_activa'], ['A6', 'no_activa'], ['A7', 'falta_confirmacion']]],
    'gym_asignar_profe en grupo: pasa A1, A2 y A3; saltea la ficha sin app, la visita, la solicitud y la que no aceptó la hoja (con el motivo)');
  t.eq([est(x[1]), est(x[2]), x[3], x[4]], [{ coach: 'pA2', status: 'activo', trainer: 'pA2', restore: null, inv: [] }, { coach: 'pA2', status: 'activo', trainer: 'pA2', restore: null, inv: [] },
    ['pA2'], Object.assign({}, BASE, { pA1: 1 })], 'C = T = pA2; las rutinas programadas pendientes pasan al profe nuevo (gize.gym_keep_routines); ningún cupo cambia');
  t.eq([quien(x[5]), quien(x[6]), x[7], x[9]], [['A1', 'A2', 'A3'], ['pA2'], [false, 0], true],
    'un aviso a cada socio y uno solo al profe; pA1 deja de ver a A1 (ficha y registros); la rutina programada se aplica con el profe nuevo');
  x = await V([['dA', rpc('gym_asignar_profe', [F.A1], null)], ['postgres', ESTADO('A1')], ['postgres', programadas('A1')], ['postgres', alertas('socio_sin_profe')]]);
  t.eq([est(x[1]), x[2], x[3]], [{ coach: null, status: 'activo', trainer: null, restore: null, inv: [] }, [], []],
    'asignar «sin profe»: C = T = null, las programadas se borran como hoy; sin aviso por fila (operación masiva)');
  x = await V([['postgres', `insert into public.user_blocks (blocker, blocked) values ('${P.A1}', '${P.pA2}')`], ['dA', rpc('gym_asignar_profe', [F.A1], P.pA2)]]);
  t.eq(x[1].saltadas, [{ id: F.A1, motivo: 'bloqueo' }], 'con un bloqueo entre el socio y el profe: se saltea');
  x = await V([['dA', rpc('gym_asignar_profe', [F.A1], P.rA)], ['dA', rpc('gym_asignar_profe', [F.B1], P.pA2)]]);
  t.eq([x[0].saltadas, x[1]], [[{ id: F.A1, motivo: 'no_es_profe' }], { ok: [], saltadas: [] }], 'a alguien que no es profe: no_es_profe; fichas de otro gimnasio: se ignoran');
  x = await V([['postgres', VENCE('dA', '6 days')], ['dA', rpc('gym_asignar_profe', [F.A1], P.pA2)]]);
  t.eq(x[1], { error: 'P0001', msg: 'Por ahora el gimnasio no puede asignar profe.' }, 'con el plan vencido hace más de 5 días, no');

  // ===== Dejar de ser su profe, desvincularse, bloquear =====
  for (const [que, paso] of [['gym_dejar_socio', ['pA1', rpc('gym_dejar_socio', F.A1)]],
    ['se desvincula en Ajustes', ['A1', 'with x as (update public.profiles set coach_id = null where id = auth.uid() returning 1) select to_jsonb(count(*)) from x']],
    ['bloquea a su profe', ['A1', `select public.block_user('chat')`]]]){
    x = await V([paso, ['postgres', ESTADO('A1')], ['postgres', alertas('socio_sin_profe')], ['postgres', programadas('A1')], ['postgres', cupos]]);
    t.eq([est(x[1]), quien(x[2]), x[3], x[4]], [{ coach: null, status: 'activo', trainer: null, restore: null, inv: [] }, ['aA', 'dA'], [], BASE],
      que + ': C = T = null, sigue socio; la administración lo ve en el resumen; las programadas se borran como hoy');
  }
  x = await V([['A1', `select public.block_user('chat')`], ['dA', rpc('gym_asignar_profe', [F.A1], P.pA1)]]);
  t.eq(x[1].saltadas, [{ id: F.A1, motivo: 'bloqueo' }], 'después de bloquearlo, ese profe no se le puede volver a asignar');
  t.eq((await V([['pA2', rpc('gym_dejar_socio', F.A1)]]))[0].msg, 'No sos el profe de este socio.', 'otro profe no lo puede dejar');

  // ===== Pausar y la vuelta =====
  x = await V([['dA', `select to_jsonb(public.gym_pausar('${F.A2}', current_date + 30))`], ['postgres', ESTADO('A2')], ['postgres', cupos],
    ['pA1', `select to_jsonb(public.is_my_client('${P.A2}'))`], ['dA', rpc('gym_reactivar', F.A2)], ['postgres', ESTADO('A2')]]);
  t.eq([est(x[1]), x[2], x[3], est(x[5])], [{ coach: 'pA1', status: 'pausado', trainer: 'pA1', restore: null, inv: [] }, BASE, true,
    { coach: 'pA1', status: 'activo', trainer: 'pA1', restore: null, inv: [] }], 'pausar: sigue contando y con su profe; reactivar la vuelve a activa');
  for (const [hasta, que] of [['current_date', 'hoy'], ['current_date + 400', 'más de un año']])
    t.eq((await V([['dA', `select to_jsonb(public.gym_pausar('${F.A2}', ${hasta}))`]]))[0].msg, 'Elegí hasta cuándo (dentro del próximo año).', 'pausar hasta ' + que + ': no');
  x = await V([['dA', `select to_jsonb(public.gym_pausar('${F.A2}', current_date + 30))`], ['postgres', `update public.gym_members set paused_until = current_date - 1 where id = '${F.A2}'`],
    ['postgres', 'select public.gym_diaria()'], ['postgres', ESTADO('A2')]]);
  t.eq([x[2].pausas, est(x[3])], [1, { coach: 'pA1', status: 'activo', trainer: 'pA1', restore: null, inv: [] }], 'la tarea diaria vuelve a activa la pausa que terminó');

  // ===== Salir (socio) y dar de baja (gimnasio) =====
  const leen = ['pA1', `select jsonb_build_array((select count(*) from public.gym_members where id = '${F.A1}'), public.is_my_client('${P.A1}'))`];
  const admin = ['dA', `select jsonb_build_array(public.gym_reads_member('${P.A1}'), (select count(*) from public.sessions where client_id = '${P.A1}'))`];
  x = await V([['A1', rpc('gym_salir', false)], ['postgres', ESTADO('A1')], leen, admin, ['postgres', cupos], ['postgres', alertas('socio_salio')], ['A1', rpc('mi_gimnasio')]]);
  t.eq([x[0], est(x[1]), x[2], x[3], x[4], quien(x[5]), x[6]], [{ ok: true, sigue_con_profe: false }, { coach: null, status: 'baja', trainer: null, restore: null, inv: [] },
    [0, false], [false, 0], Object.assign({}, BASE, { dA: 5 }), ['aA', 'dA'], null],
    'gym_salir: S = baja, C = T = null; al instante el profe y la administración dejan de verlo; deja de contar; aviso; mi_gimnasio null');
  x = await V([['A1', rpc('gym_salir', true)], ['postgres', ESTADO('A1')], leen, admin, ['postgres', cupos]]);
  t.eq([x[0], est(x[1]), x[2], x[3], x[4]], [{ ok: true, sigue_con_profe: true }, { coach: 'pA1', status: 'baja', trainer: null, restore: null, inv: [] },
    [0, true], [false, 0], Object.assign({}, BASE, { dA: 5, pA1: 2 })],
    '«Seguir con mi profe como alumno propio»: C = pA1 (su plan, su cupo: 2), la ficha en baja sin profe; el gimnasio no ve nada, el profe sí sus registros');
  x = await V([['postgres', `update public.coach_billing set max_clients = 1 where coach_id = '${P.pA1}'`], ['A1', rpc('gym_salir', true)], ['postgres', ESTADO('A1')]]);
  t.eq([x[1].msg, est(x[2]).status], ['Tu profe no puede sumarte como alumno propio en este momento. Podés salir sin seguir con tu profe.', 'activo'],
    'si el plan propio del profe no tiene lugar: no se puede seguir (y no cambia nada)');
  x = await V([['A7', rpc('gym_salir', true)], ['postgres', ESTADO('A7')], ['postgres', cupos]]);
  t.eq([x[0].sigue_con_profe, est(x[1]), x[2]], [true, { coach: 'dA', status: 'baja', trainer: null, restore: null, inv: [] }, BASE],
    'con la dueña como profe (cuenta convertida): sigue como alumno propio en la misma fila del plan (6: deja de contar la ficha, cuenta el vínculo)');
  x = await V([['A3', `select public.join_coach('${CODIGO.C}')::jsonb`], ['A3', rpc('gym_salir', false)], ['postgres', ESTADO('A3')], ['postgres', cupos]]);
  t.eq([est(x[2]), x[3]], [{ coach: 'C', status: 'baja', trainer: null, restore: null, inv: [] }, Object.assign({}, BASE, { dA: 5, C: 2 })], 'con coach de afuera: sale y el coach externo no cambia');
  const fichaA1 = ['postgres', `select jsonb_build_object('status', status, 'member', member_id, 'trainer', trainer_id, 'terms', terms_at is not null,
    'share', share_admin, 'inv', prueba.invariantes()) from public.gym_members where id = '${F.A1}'`];
  x = await V([['dA', rpc('gym_baja', F.A1, 'Se mudó')], ['postgres', ESTADO('A1')], leen, ['dA', rpc('gym_reactivar', F.A1)], fichaA1, admin,
    ['dA', `select to_jsonb(count(*)) from public.body_weights where client_id = '${P.A1}'`], ['A1', rpc('mi_gimnasio')], ['postgres', ESTADO('A1')]]);
  t.eq([est(x[1]), x[2], x[3], x[4]], [{ coach: null, status: 'baja', trainer: null, restore: null, inv: [] }, [0, false], { ok: true, sin_app: true },
    { status: 'activo', member: null, trainer: null, terms: false, share: false, inv: [] }],
    'gym_baja: S = baja y C = T = null (era del equipo); reactivar: la ficha vuelve activa (con cupo exacto) pero sin app, sin la hoja y sin compartir');
  t.eq([x[5], x[6], x[7], est(x[8]).coach], [[false, 0], 0, null, null],
    'la persona no vuelve a ser socia sin aceptarlo: la administración no lee sus registros y su app no muestra el gimnasio (para unirla, el link #unirme)');
  x = await V([['dA', rpc('gym_baja', F.A1, null)], ['A1', `select public.join_coach('${CODIGO.C}')::jsonb`], ['dA', rpc('gym_reactivar', F.A1)],
    ['A1', rpc('mi_gimnasio')], ['postgres', ESTADO('A1')], ['dA', `select to_jsonb(count(*)) from public.body_weights where client_id = '${P.A1}'`],
    ['dA', `select to_jsonb(public.gym_reads_member('${P.A1}'))`], fichaA1]);
  t.eq([x[1], x[3], est(x[4]).coach, x[5], x[6], x[7].member, x[7].share], [true, null, 'C', 0, false, null, false],
    'baja del gimnasio, se va con un coach de afuera y el gimnasio la reactiva: sigue con su coach, no es socia y el gimnasio no lee nada de ella');
  x = await V([['dA', rpc('gym_baja', F.A1, null)], ['dA', rpc('gym_reactivar', F.A1)], ['dA', rpc('gym_ficha_link', F.A1)]]);
  t.ok(typeof x[2] === 'object' && x[2] && !x[2].error, 'después de reactivarla, el gimnasio puede mandarle el link #unirme: ' + JSON.stringify(x[2]));
  x = await V([['A1', rpc('gym_salir', false)], ['dA', rpc('gym_reactivar', F.A1)]]);
  t.eq(x[1].msg, 'Esa persona salió del gimnasio: para volver tiene que pedir sumarse.', 'a quien salió solo, el gimnasio no lo reactiva');
  x = await V([['dA', rpc('gym_baja', F.A4, null)], ['postgres', `update public.coach_billing set max_clients = 5 where coach_id = '${P.dA}'`], ['dA', rpc('gym_reactivar', F.A4)]]);
  t.eq(x[2].msg, 'El gimnasio no puede sumar socios en este momento.', 'reactivar una baja sin lugar: no (cupo exacto)');
  x = await V([['A1', rpc('gym_salir', false)], ['A1', `select public.join_coach('FUERZA22')::jsonb`], ['postgres', ESTADO('A1')]]);
  t.eq([x[1].code, est(x[2]).status], ['P0001', 'pendiente'], 'después de salir puede volver a pedir sumarse (la ficha vieja queda en baja)');

  // ===== Cerrar el gimnasio =====
  x = await V([['A3', `select public.join_coach('${CODIGO.C}')::jsonb`],
    ['dA', rpc('gym_cerrar', 'gimnasio fuerza')], ['dA', rpc('gym_cerrar', ' Gimnasio Fuerza ')],
    ['postgres', `select jsonb_build_object('fichas', (select jsonb_object_agg(prueba.n(member_id), status) from public.gym_members where gym_id = '${G.A}' and member_id is not null),
        'coaches', (select jsonb_object_agg(prueba.n(id), prueba.n(coach_id)) from public.profiles where id in ('${P.A1}', '${P.A2}', '${P.A3}', '${P.A7}', '${P.D1}', '${P.P1}')),
        'equipo', (select count(*) from public.gym_staff where gym_id = '${G.A}' and left_at is null),
        'codigo', (select count(*) from public.gym_codes where gym_id = '${G.A}' and revoked_at is null),
        'gym', (select jsonb_build_object('cerrado', closed_at is not null, 'motivo', close_reason, 'purga', purge_after is not null, 'dueno', prueba.n(owner_id)) from public.gyms where id = '${G.A}'),
        'inv', prueba.invariantes())`],
    ['servicio', `select to_jsonb(public.coach_active('${P.dA}'))`], ['dA', rpc('mi_gimnasio')], ['A1', rpc('mi_gimnasio')], ['N', `select public.join_coach('FUERZA22')::jsonb`]]);
  t.eq(x[1].msg, 'Escribí el nombre exacto del gimnasio para cerrarlo.', 'cerrar pide el nombre exacto');
  t.eq(x[3], { fichas: { A1: 'baja', A2: 'baja', A3: 'baja', A5: 'baja', A6: 'baja', A7: 'baja' }, coaches: { A1: null, A2: null, A3: 'C', A7: null, D1: 'dA', P1: 'pA1' },
    equipo: 0, codigo: 0, gym: { cerrado: true, motivo: 'dueño', purga: false, dueno: 'dA' }, inv: [] },
    'gym_cerrar: todas las fichas en baja; sin coach los que atendía el equipo; el coach de afuera, los alumnos propios de la dueña y del profe no cambian; el equipo deja el gimnasio; el código se anula; sin purga (registros 24 meses)');
  t.eq([x[4], x[5], x[6], x[7]], [true, null, null, false], 'la dueña vuelve a ser coach común con su plan; nadie tiene gimnasio; el código ya no sirve');

  // ===== Equipo: invitar, aceptar, cambiar el rol, quitar =====
  const inv = (rol, quien2 = 'dA') => [quien2, rpc('gym_invitar', rol)];
  x = await V([inv('profe'), ['postgres', `select to_jsonb(count(*)) from public.gym_invites where expires_at between now() + interval '6 days 23 hours' and now() + interval '7 days 1 minute'`]]);
  t.ok(/^[0-9a-f]{64}$/.test(x[0].token) && x[1] === 1, 'gym_invitar devuelve el token del link #equipo= (vale 7 días; se guarda solo el hash)');
  // El token queda guardado (lo usan los pasos siguientes en otra transacción).
  const r = await db.json(`select prueba.hacer('${P.dA}', 'select to_jsonb(public.gym_invitar(''profe''))');`);
  const tok = r.ok.token;
  const info = w => [w, rpc('gym_invitacion_info', tok)];
  x = await V([info('K'), info('pA1'), info('A1'), info('C1'), info('N')]);
  t.eq(x.map(i => i.estado), ['ok', 'ya_staff', 'es_socio', 'es_alumno', 'necesita_coach'], 'gym_invitacion_info según quién abre el link: coach libre, ya es del equipo, socio, alumno de otro coach, sin cuenta de coach');
  t.eq([x[0].gym, x[0].role], [{ name: 'Gimnasio Fuerza', city: 'Rosario' }, 'profe'], 'muestra el gimnasio y el rol');
  x = await V([['K', rpc('gym_aceptar_invitacion', tok)], ['K', rpc('mi_gimnasio')], ['K', rpc('gym_aceptar_invitacion', tok)], info('K'), ['postgres', cupos], ['postgres', 'select prueba.invariantes()'],
    ['dA', rpc('gym_invitaciones')]]);
  t.eq([x[0].role, x[1].rol, x[2].msg, x[3].estado, x[5]], ['profe', 'profe', 'Esa invitación ya se usó: pedile otra al gimnasio.', 'usada', []],
    'aceptar: queda profe; el link sirve una sola vez');
  t.ok(!x[6].some(i => i.id === r.ok.id), 'y ya no figura entre las pendientes');
  x = await V([['postgres', `update public.gym_invites set revoked_at = now() where id = '${r.ok.id}'`], info('K'), ['K', rpc('gym_aceptar_invitacion', tok)]]);
  t.eq([x[1].estado, x[2].msg], ['vencida', 'La invitación venció o la anularon: pedile otra al gimnasio.'], 'anulada: vencida');
  x = await V([['dA', rpc('gym_invitacion_revocar', r.ok.id)], info('K')]);
  t.eq([x[0], x[1].estado], [{ ok: true }, 'vencida'], 'gym_invitacion_revocar la anula');
  // Tope de profes: 8 con p100 (pA1 y pA2 ya cuentan; el encargado no es coach).
  const seis = `with u as (insert into auth.users (id, email, raw_user_meta_data) select md5('profe' || g)::uuid, 'profe' || g || '@ejemplo.test', '{"role":"coach"}' from generate_series(1, 6) g returning id)
    insert into public.gym_staff (gym_id, user_id, role) select '${G.A}', id, 'profe' from u returning to_jsonb(true)`;
  x = await V([['postgres', seis], info('K'), ['K', rpc('gym_aceptar_invitacion', tok)], ['dA', rpc('mi_gimnasio')],
    ['postgres', `update public.gyms set settings = '{"profes_extra": 1}' where id = '${G.A}'`], info('K')]);
  t.eq([x[1].estado, x[2].msg, x[3].plan.profes_usados, x[3].plan.profes_tope, x[5].estado], ['tope', 'El gimnasio llegó al tope de profes. Escribinos para sumar más profes.', 8, 8, 'ok'],
    'con 8 de 8 profes: «Escribinos para sumar más profes»; con un profe extra del admin, entra');
  const tokR = (await db.json(`select prueba.hacer('${P.dA}', 'select to_jsonb(public.gym_invitar(''recepcion''))');`)).ok.token;
  x = await V([['postgres', seis], ['N', rpc('gym_aceptar_invitacion', tokR)], ['N', rpc('mi_gimnasio')], ['N', `select public.join_coach('${CODIGO.C}')::jsonb`], ['N', rpc('gym_unirse', 'FUERZA22', VER, false, null)]]);
  t.eq([x[1].role, x[2].rol, x[3].msg, x[4].msg], ['recepcion', 'recepcion', 'Las cuentas del equipo de un gimnasio no se pueden vincular con un código.',
    'Las cuentas del equipo de un gimnasio no se pueden vincular con un código.'], 'la recepción (cuenta común) entra aunque esté el tope de profes; después no se vincula ni pide sumarse');
  // Cambiar el rol.
  x = await V([['dA', rpc('gym_cambiar_rol', P.pA2, 'recepcion')], ['dA', rpc('gym_cambiar_rol', P.pA1, 'recepcion')], ['dA', rpc('gym_cambiar_rol', P.aA, 'profe')],
    ['dA', rpc('gym_cambiar_rol', P.dA, 'admin')], ['dA', rpc('gym_cambiar_rol', P.pA1, 'admin')], ['postgres', ESTADO('A1')], ['aA', rpc('gym_cambiar_rol', P.pA1, 'profe')]]);
  t.eq([x[0], x[1].msg, x[2].msg, x[3].msg, x[4], est(x[5]).trainer, x[6].msg], [{ ok: true, role: 'recepcion' }, 'Primero pasá sus socios a otro profe.',
    'Para ser profe necesita una cuenta de coach.', 'Al dueño no se le cambia el rol.', { ok: true, role: 'admin' }, 'pA1',
    'La administración no puede cambiar el rol de otra persona de la administración.'],
    'gym_cambiar_rol: a recepción solo sin socios; profe solo con cuenta de coach; nunca el dueño; profe ↔ administración conserva sus socios; la administración no toca a otra');
  // Quitar con reasignación (la trampa C20, cerrada).
  x = await V([['postgres', `update public.gyms set default_trainer_id = '${P.pA1}' where id = '${G.A}'`],
    ['postgres', `insert into public.user_blocks (blocker, blocked) values ('${P.A2}', '${P.pA2}')`],
    ['dA', rpc('gym_quitar_staff', P.pA1, P.pA2)], ['postgres', ESTADO('A1')], ['postgres', ESTADO('A2')], ['postgres', ESTADO('P1')], ['postgres', programadas('A1')],
    ['pA1', `select jsonb_build_array(public.is_my_client('${P.A1}'), public.is_my_client('${P.P1}'), (select count(*) from public.gym_members))`],
    ['postgres', cupos], ['postgres', alertas('profe_quitado')], ['postgres', alertas('socios_asignados')], ['postgres', `select to_jsonb(default_trainer_id) from public.gyms where id = '${G.A}'`],
    ['postgres', 'select prueba.invariantes()']]);
  t.eq([x[2], est(x[3]), est(x[4]), nom(x[5].coach), x[6]], [{ ok: true, reasignados: 1, sin_profe: 1, falta_confirmacion: 0 }, { coach: 'pA2', status: 'activo', trainer: 'pA2', restore: null, inv: [] },
    { coach: null, status: 'activo', trainer: null, restore: null, inv: [] }, 'pA1', ['pA2']],
    'gym_quitar_staff con reasignación: A1 pasa a pA2 (con sus programadas); A2 (bloqueó a pA2) queda sin profe; P1, alumno propio de pA1, no cambia');
  t.eq([x[7], x[8], quien(x[9]), quien(x[10]), x[11], x[12]], [[false, true, 0], BASE, ['aA', 'dA'], ['pA2'], null, []],
    'pA1 deja de ver a A1 (y no ve fichas), sigue con P1; ningún cupo cambia; un resumen a la administración y uno a pA2; sin profe por defecto; I2 en orden (la trampa C20, cerrada)');
  x = await V([['dA', rpc('gym_quitar_staff', P.pA1, null)], ['postgres', ESTADO('A1')], ['postgres', programadas('A1')], ['postgres', 'select prueba.invariantes()']]);
  t.eq([x[0], est(x[1]).coach, x[2], x[3]], [{ ok: true, reasignados: 0, sin_profe: 2, falta_confirmacion: 0 }, null, [], []], 'sin profe: sus socios quedan sin profe y las programadas se borran como hoy');
  x = await V([['dA', rpc('gym_quitar_staff', P.pA1, P.pA1)], ['dA', rpc('gym_quitar_staff', P.pA1, P.rA)], ['dA', rpc('gym_quitar_staff', P.dA, null)],
    ['aA', rpc('gym_quitar_staff', P.aA, null)], ['aA', rpc('mi_gimnasio')]]);
  t.eq([x[0].msg, x[1].msg, x[2].msg, x[3].ok, x[4]], ['Elegí un profe del gimnasio para pasarle sus socios.', 'Elegí un profe del gimnasio para pasarle sus socios.',
    'Al dueño no se lo puede quitar del gimnasio.', true, null], 'reasignar al mismo o a alguien que no es profe: no; al dueño no se lo quita; la administración se puede ir sola');
  // Quitar con reasignación: quien no aceptó la hoja no pasa a otro profe (como gym_asignar_profe).
  x = await V([['postgres', `update public.gym_members set terms_at = null, terms_version = null where id = '${F.A2}'`],
    ['dA', rpc('gym_asignar_profe', [F.A2], P.pA2)], ['dA', rpc('gym_quitar_staff', P.pA1, P.pA2)], ['postgres', ESTADO('A1')], ['postgres', ESTADO('A2')]]);
  t.eq([x[1].saltadas.map(z => z.motivo), x[2], est(x[3]).coach, est(x[4])], [['falta_confirmacion'], { ok: true, reasignados: 1, sin_profe: 1, falta_confirmacion: 1 }, 'pA2',
    { coach: null, status: 'activo', trainer: null, restore: null, inv: [] }],
    'gym_quitar_staff: el socio con «Falta confirmación» queda sin profe (no pasa a un profe que no aceptó) y se cuenta aparte para el panel');

  // Un coach que entra al equipo: los socios que ya atendía pasan a ser suyos en el gimnasio (T = C).
  const inK = (await db.json(`select prueba.hacer('${P.dA}', 'select to_jsonb(public.gym_invitar(''profe''))');`)).ok.token;
  const resumenA3 = ['dA', `select (select x from jsonb_array_elements(public.gym_socios_resumen()) x where x->>'id' = '${F.A3}')`];
  x = await V([['A3', `select public.join_coach('${CODIGO.K}')::jsonb`], ['postgres', ESTADO('A3')], ['K', rpc('gym_aceptar_invitacion', inK)], ['postgres', ESTADO('A3')],
    ['postgres', cupos + ` or coach_id = '${P.K}'`], resumenA3, ['K', rpc('mi_gimnasio')],
    ['dA', rpc('gym_quitar_staff', P.K, P.pA2)], ['postgres', ESTADO('A3')], ['postgres', 'select prueba.invariantes()']]);
  t.eq([x[0], est(x[1]).trainer, est(x[3]), x[4].K, x[5].coach_externo, nom(x[5].profe.id), x[6].mis_fichas.length],
    [true, null, { coach: 'K', status: 'activo', trainer: 'K', restore: null, inv: [] }, 0, false, 'K', 1],
    'A3 con un coach de afuera (K); K entra como profe: la ficha pasa a tenerlo de profe (I2 en orden), deja de ocupar su cupo propio y el panel ya no lo muestra como coach de afuera');
  t.eq([x[7], est(x[8]), x[9]], [{ ok: true, reasignados: 1, sin_profe: 0, falta_confirmacion: 0 }, { coach: 'pA2', status: 'activo', trainer: 'pA2', restore: null, inv: [] }, []],
    'y cuando lo quitan, gym_quitar_staff lo ve y lo reasigna (la trampa C20, también para quien ya era su coach)');
  x = await V([['A3', `select public.join_coach('${CODIGO.K}')::jsonb`], ['postgres', `insert into public.gym_staff (gym_id, user_id, role) values ('${G.A}', '${P.K}', 'recepcion')`],
    ['postgres', ESTADO('A3')], ['dA', rpc('gym_cambiar_rol', P.K, 'profe')], ['postgres', ESTADO('A3')]]);
  t.eq([est(x[2]).trainer, x[3].role, est(x[4])], [null, 'profe', { coach: 'K', status: 'activo', trainer: 'K', restore: null, inv: [] }],
    'lo mismo si alguien de la recepción con cuenta de coach pasa a profe (gym_cambiar_rol)');

  // Cambiar a recepción al profe por defecto: deja de serlo.
  x = await V([['dA', rpc('gym_config', { default_trainer_id: P.pA2, settings: { aprobar_solas: true } })], ['dA', rpc('gym_cambiar_rol', P.pA2, 'recepcion')],
    ['dA', rpc('mi_gimnasio')], ['postgres', `select to_jsonb(count(*)) from public.gym_audit where action = 'config' and target_user = '${P.pA2}'`]]);
  t.eq([x[1].role, x[2].gym.default_trainer_id, x[3]], ['recepcion', null, 1], 'gym_cambiar_rol a recepción del profe por defecto: deja de ser el profe por defecto (queda en la auditoría)');

  // Invitación a la recepción o la administración de alguien que es alumno de un coach.
  const tokA = (await db.json(`select prueba.hacer('${P.dA}', 'select to_jsonb(public.gym_invitar(''admin''))');`)).ok.token;
  x = await V([['C1', rpc('gym_aceptar_invitacion', tok)], ['C1', rpc('gym_aceptar_invitacion', tokR)], ['C1', rpc('gym_aceptar_invitacion', tokA)]]);
  t.eq(x.map(z => z.msg), ['Para ser profe primero desvinculate de tu coach.', 'Para sumarte al equipo del gimnasio primero desvinculate de tu coach en Ajustes.',
    'Para sumarte al equipo del gimnasio primero desvinculate de tu coach en Ajustes.'], 'alumna de un coach invitada: como profe, «Para ser profe…»; a la recepción o la administración, un texto que no habla de ser profe');
  t.eq(await INV(), [], 'invariantes al final (todo se deshizo)');
  await db.borrar();
}
