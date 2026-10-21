// Gimnasios, etapa 1 (parte 5): supabase/gimnasios-admin.sql en Postgres de verdad (tests/pg.mjs; sin
// Postgres se saltea), con las personas de tests/gimnasios-comun.mjs más un admin de GIZE (Z).
// - Permisos: cada admin_gym* (y admin_gyms) solo la llama el admin de GIZE; cada persona de la
//   matriz recibe 42501 y anon no la puede llamar. Lo que cambia algo queda en admin_audit y en gym_audit.
// - El detalle no trae ningún dato de socios (nombres, DNI, mails, teléfonos, notas).
// - Convertir: los alumnos elegidos quedan como fichas activas con el dueño como profe, coach_id,
//   rutinas programadas y chat intactos, sin la hoja («Falta confirmación»), misma fila de
//   coach_billing; los no elegidos siguen como alumnos propios; seats_drift vacío; no depende del
//   interruptor de alta; y lo que no se puede (alumnos ajenos, un profe de otro gimnasio).
// - Transferir: los socios que aceptaron la hoja pasan al dueño nuevo con sus rutinas programadas; los
//   que no, a baja y siguen con su coach; el plan pasa a la fila del dueño nuevo; avisa que la
//   suscripción de Mercado Pago o Apple no pasa; reabre uno cerrado por la baja del dueño.
// - Cerrar, tope de profes, auditoría, marcas, el interruptor de alta (admin_set_config) y las
//   canónicas con gimnasios: admin_coaches («Dueño de X», «Profe de X, sin cargo»), admin_overview y
//   tomar_avisos_vence (dueños a 7, 3 y 1 día, una vez; profes sin cargo afuera; dos a la vez no repiten).
import { conPg, lit } from './pg.mjs';
import { P, F, G, DATOS, ayudas, rpc, nom, canon, conCanon } from './gimnasios-comun.mjs';

const Z = 'a0000000-0000-4000-8000-0000000000ad';
const ADMIN_Z = `insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values ('${Z}', 'admin.gize@ejemplo.test', now(), '{"full_name":"Admin GIZE"}');
insert into public.app_admins (user_id) values ('${Z}');`;
const PERSONAS = ['dA', 'aA', 'pA1', 'rA', 'A1', 'A7', 'dB', 'C', 'N', 'anon'];
const NO = ['Martina Sosa', 'Juan Pérez', 'Lucía Gómez', 'Raúl Sin App', 'Pedro Díaz', 'Sofía Romero', 'Diego Ruiz', '30111222', '30999888',
  'a1@ejemplo.test', 'raul@ejemplo.test', 'Rodilla operada', 'Viene a la mañana'];

export default async function ({ t: t0 }){
  const t = conCanon(t0);
  const h = await conPg(t);
  if (!h) return;
  const db = await h.nueva('gize_con');
  t.eq(await db.json(DATOS), [], 'las personas cargadas cumplen los invariantes');
  await db.sql(ADMIN_Z);
  const { J, V, PROBAR } = ayudas(db);
  const ZZ = (sql) => [Z, sql];

  // ===== Quién puede =====
  const CASOS = [
    ['admin_gyms', rpc('admin_gyms'), null],
    ['admin_gym_detail', rpc('admin_gym_detail', G.A), null],
    ['admin_gym_convertir', rpc('admin_gym_convertir', P.C, [P.C1], 'Gimnasio Online'), 'gym_convertir'],
    ['admin_gym_transferir', rpc('admin_gym_transferir', G.A, P.pA2), 'gym_transferir'],
    ['admin_gym_cerrar', rpc('admin_gym_cerrar', G.B), 'gym_cerrar'],
    ['admin_gym_profes_extra', `select to_jsonb(public.admin_gym_profes_extra('${G.A}', 4))`, 'gym_profes_extra'],
    ['admin_gym_auditoria', rpc('admin_gym_auditoria', G.A), 'gym_auditoria'],
    ['admin_set_config gimnasios', `select to_jsonb(true) from (select public.admin_set_config('gimnasios', '{"alta": true}'::jsonb)) x`, 'config'],
  ];
  for (const [nombre, sql, accion] of CASOS){
    const r = await J(`select jsonb_object_agg(x.p, prueba.varios(jsonb_build_array(jsonb_build_object('quien', x.q, 'q', ${lit(sql)}),
        jsonb_build_object('quien', 'postgres', 'q', ${lit(`select jsonb_build_array((select count(*) from public.admin_audit where action = ${accion ? lit(accion) : "''"}), prueba.invariantes())`)}))))
      from (values ${[...PERSONAS, 'Z'].map(p => `('${p}', '${p === 'Z' ? Z : p === 'anon' ? 'anon' : P[p]}')`).join(', ')}) x(p, q);`);
    const obtenido = Object.fromEntries([...PERSONAS, 'Z'].map(p => [p, 'error' in r[p][0] ? r[p][0].error : 'ok']));
    t.eq(obtenido, Object.fromEntries([...PERSONAS, 'Z'].map(p => [p, p === 'Z' ? 'ok' : '42501'])), nombre + ': solo el admin de GIZE (' + JSON.stringify(r.Z[0]).slice(0, 200) + ')');
    if (accion) t.ok(r.Z[1].ok[0] >= 1, nombre + ': queda en admin_audit («' + accion + '»)');
    t.eq(r.Z[1].ok[1], [], nombre + ': invariantes después');
  }
  const perm = await J(`select jsonb_object_agg(f, jsonb_build_array(has_function_privilege('anon', ('public.' || f)::regprocedure, 'execute'),
      has_function_privilege('authenticated', ('public.' || f)::regprocedure, 'execute'))) from unnest(array['admin_gyms()', 'admin_gym_detail(uuid)',
      'admin_gym_convertir(uuid, uuid[], text)', 'admin_gym_transferir(uuid, uuid)', 'admin_gym_cerrar(uuid)', 'admin_gym_profes_extra(uuid, integer)',
      'admin_gym_auditoria(uuid)', 'admin_gym_fila(uuid)', 'gym_profe_sin_cargo(uuid)', 'tomar_avisos_vence()', 'hay_avisos_vence()', 'soltar_aviso_vence(uuid)']) f;`);
  t.eq(perm, { 'admin_gyms()': [false, true], 'admin_gym_detail(uuid)': [false, true], 'admin_gym_convertir(uuid, uuid[], text)': [false, true],
    'admin_gym_transferir(uuid, uuid)': [false, true], 'admin_gym_cerrar(uuid)': [false, true], 'admin_gym_profes_extra(uuid, integer)': [false, true],
    'admin_gym_auditoria(uuid)': [false, true], 'admin_gym_fila(uuid)': [false, false], 'gym_profe_sin_cargo(uuid)': [false, false],
    'tomar_avisos_vence()': [false, false], 'hay_avisos_vence()': [false, false], 'soltar_aviso_vence(uuid)': [false, false] },
    'permisos: las del admin con sesión (y admin_assert adentro), anon nunca; las internas y las del mail, solo por dentro');

  // ===== Lista y detalle (sin datos de socios) =====
  let x = await V([ZZ(rpc('admin_gyms')), ZZ(rpc('admin_gym_detail', G.A)), ZZ(rpc('admin_gym_detail', G.B)), ZZ(rpc('admin_gym_detail', P.N))]);
  const lista = x[0], dA = x[1];
  t.eq([lista.alta, lista.gyms.map(g => g.nombre).sort()], [false, ['Gimnasio Fuerza', 'Gimnasio Norte']], 'admin_gyms: el interruptor (apagado) y los dos gimnasios');
  const fa = lista.gyms.find(g => g.nombre === 'Gimnasio Fuerza');
  t.eq([fa.dueno.email, fa.plan, fa.seats_used, fa.max, fa.profes_usados, fa.profes_tope, fa.recepcion, fa.estado, fa.codigo, fa.mp, fa.apple],
    ['duena.a@ejemplo.test', 'p100', 6, 100, 2, 8, 1, 'activo', 'FUERZA22', null, false], 'la fila: dueño, plan, cupo, profes, recepción, estado, código y pagos');
  t.eq(canon(fa.marcas), canon({ sobre_cupo: false, plan_menor_100: false, sin_uso_30: false, diferencia_cupo: false, cerrado_por_baja: false }), 'sin marcas');
  t.eq([dA.equipo.map(e => e.rol), dA.equipo.find(e => e.rol === 'profe' && e.socios === 2).nombre], [['owner', 'admin', 'profe', 'profe', 'recepcion'], 'Martina Profe'],
    'el detalle trae el equipo con sus socios asignados');
  t.eq(canon(dA.contadores), canon({ activos: 5, pausados: 0, pendientes: 1, visitas: 1, bajas: 0, sin_app: 1, sin_profe: 1, coach_externo: 0, falta_confirmacion: 1,
    comparten: 1, conversion: 1, ingresos_hoy: 0, ingresos_30: 3, invitaciones: 0, avisos_pendientes: 0 }), 'contadores');
  const texto = JSON.stringify([lista, dA, x[2]]);
  t.eq(NO.filter(s => texto.includes(s)), [], 'ni la lista ni el detalle traen datos de socios (nombres, DNI, mails, notas)');
  t.eq(x[3], { error: 'P0001', msg: 'Ese gimnasio no existe.' }, 'detalle de un id que no es un gimnasio');

  // ===== Marcas =====
  x = await V([['postgres', `update public.coach_billing set max_clients = 5 where coach_id = '${P.dA}'`],
    ['postgres', `update public.coach_billing set plan = 'p50', max_clients = 50 where coach_id = '${P.dB}'`],
    ['postgres', `update public.gyms set created_at = now() - interval '40 days' where id = '${G.B}'`],
    ['postgres', `update public.gym_entries set at = now() - interval '35 days' where gym_id = '${G.B}'`],
    ['postgres', `update public.coach_billing set seats_used = 99 where coach_id = '${P.pA1}'`],
    ZZ(rpc('admin_gyms'))]);
  const m = Object.fromEntries(x[5].gyms.map(g => [g.nombre, g.marcas]));
  t.eq([m['Gimnasio Fuerza'].sobre_cupo, m['Gimnasio Fuerza'].plan_menor_100, m['Gimnasio Fuerza'].diferencia_cupo, m['Gimnasio Norte'].plan_menor_100, m['Gimnasio Norte'].sin_uso_30, m['Gimnasio Norte'].sobre_cupo],
    [true, true, true, true, true, false], 'marcas: sobre el cupo (6 de 5), plan menor a 100, diferencia en el recuento (de un profe), sin uso a los 30 días');
  x = await V([['postgres', `delete from auth.users where id = '${P.dB}'`], ZZ(rpc('admin_gyms'))]);
  const nb = x[1].gyms.find(g => g.nombre === 'Gimnasio Norte');
  t.eq([nb.estado, nb.marcas.cerrado_por_baja, nb.dias_para_borrar, nb.dueno, x[1].gyms[0].nombre], ['cerrado', true, 90, null, 'Gimnasio Fuerza'],
    'cerrado por la baja del dueño: con los días para borrarlo (y los abiertos primero)');

  // ===== Convertir =====
  const conv = [['postgres', `update public.profiles set coach_id = '${P.C}' where id in ('${P.N}', '${P.N2}')`],
    ['postgres', `insert into public.routine_schedule (client_id, starts_on, created_by) values ('${P.N}', current_date + 3, '${P.C}')`],
    ['postgres', `select jsonb_build_object('fila', (select to_jsonb(b) - 'seats_used' - 'updated_at' from public.coach_billing b where b.coach_id = '${P.C}'), 'seats', (select seats_used from public.coach_billing where coach_id = '${P.C}'))`]];
  x = await V([...conv, ZZ(rpc('admin_gym_convertir', P.C, [P.C1, P.N], '  Online Fit  ')),
    ['postgres', `select jsonb_build_object(
      'fichas', (select jsonb_agg(jsonb_build_array(m.member_id, m.status, m.trainer_id, m.terms_at is null, m.share_admin, m.source) order by m.member_id) from public.gym_members m join public.gyms g on g.id = m.gym_id where g.owner_id = '${P.C}'),
      'coaches', (select jsonb_agg(jsonb_build_array(id, coach_id) order by id) from public.profiles where id in ('${P.C1}', '${P.N}', '${P.N2}')),
      'vinculo', (select jsonb_agg(jsonb_build_array(id, public.vinculo_gym(id) is not null) order by id) from public.profiles where id in ('${P.C1}', '${P.N}', '${P.N2}')),
      'fila', (select to_jsonb(b) - 'seats_used' - 'updated_at' from public.coach_billing b where b.coach_id = '${P.C}'), 'seats', (select seats_used from public.coach_billing where coach_id = '${P.C}'),
      'programadas', (select count(*) from public.routine_schedule where client_id in ('${P.C1}', '${P.N}') and applied_at is null),
      'staff', (select jsonb_agg(jsonb_build_array(s.user_id, s.role)) from public.gym_staff s join public.gyms g on g.id = s.gym_id where g.owner_id = '${P.C}'),
      'gym', (select jsonb_build_array(name, dpa_version) from public.gyms where owner_id = '${P.C}'),
      'audit', (select count(*) from public.gym_audit a join public.gyms g on g.id = a.gym_id where g.owner_id = '${P.C}' and a.action = 'conversion'),
      'inv', prueba.invariantes())`],
    ['C', `select jsonb_build_array((select count(*) from public.coach_messages where client_id = '${P.C1}'), public.is_my_client('${P.C1}'), (select count(*) from public.sessions where client_id = '${P.N}'))`],
    ['C', rpc('mi_gimnasio')], ['C1', rpc('mi_gimnasio')], ['N2', rpc('mi_gimnasio')]]);
  const [antes, cv, d, chat, miC, miC1, miN2] = [x[2], x[3], x[4], x[5], x[6], x[7], x[8]];
  t.ok(cv.gym_id && /^[A-Z2-9]{8}$/.test(cv.code) && cv.fichas === 2 && cv.propios === 1 && cv.nombre === 'Online Fit', 'convertir: el gimnasio, su código, 2 fichas y 1 alumno propio: ' + JSON.stringify(cv));
  t.eq(d.fichas.map(f => [nom(f[0]), f[1], nom(f[2]), f[3], f[4], f[5]]), [['C1', 'activo', 'C', true, false, 'conversion'], ['N', 'activo', 'C', true, false, 'conversion']],
    'los elegidos: fichas activas con el dueño como profe, sin la hoja aceptada, sin compartir, de la conversión');
  t.eq(d.coaches.map(c => [nom(c[0]), nom(c[1])]), [['C1', 'C'], ['N', 'C'], ['N2', 'C']], 'coach_id no cambia (ni el de los elegidos ni el del que sigue como alumno propio)');
  t.eq(d.vinculo.map(v => [nom(v[0]), v[1]]), [['C1', true], ['N', true], ['N2', false]], 'los elegidos quedan en el gimnasio; N2 sigue como alumno propio');
  t.eq([d.fila, d.seats], [antes.fila, antes.seats], 'misma fila de coach_billing (plan, vencimiento, suscripción, tope) y el mismo cupo usado (3)');
  t.eq([d.programadas, d.staff.map(s => [nom(s[0]), s[1]]), d.gym, d.audit, d.inv], [2, [['C', 'owner']], ['Online Fit', 'conversion'], 1, []],
    'rutinas programadas intactas, el coach es el dueño, el contrato queda «conversion», gym_audit y los invariantes');
  t.eq(chat, [1, true, 1], 'el dueño sigue leyendo el chat y los registros de sus alumnos convertidos');
  t.eq([miC.rol, miC.gym.name, miC1.rol, miC1.ficha.origen, miC1.ficha.terms_at, miN2], ['owner', 'Online Fit', 'socio', 'conversion', null, null],
    'mi_gimnasio: el coach es dueño; el alumno convertido, socio sin confirmar; el que no se eligió, nada');
  x = await V([ZZ(rpc('admin_gym_convertir', P.C, [P.C1, P.A1, P.B1], null)), ZZ(rpc('admin_gym_convertir', P.pA1, [P.P1], 'Otro')), ZZ(rpc('admin_gym_convertir', P.N, [], 'Otro')),
    ZZ(rpc('admin_gym_convertir', P.K, [], 'X')), ZZ(rpc('admin_gym_convertir', P.K, [], null)), ['postgres', `select to_jsonb(name) from public.gyms where owner_id = '${P.K}'`]]);
  t.eq(x.slice(0, 4), [{ error: 'P0001', msg: 'Estos no son alumnos de esa cuenta o ya están en un gimnasio: Martina Sosa, Valeria Ríos.' },
    { error: 'P0001', msg: 'Esa cuenta ya es del equipo de un gimnasio.' }, { error: 'P0001', msg: 'Esa cuenta no es de coach.' },
    { error: 'P0001', msg: 'El nombre del gimnasio tiene que tener entre 2 y 80 letras.' }], 'convertir: lo que no se puede (alumnos ajenos o de otro gimnasio, un profe, un alumno, un nombre corto)');
  t.eq([x[4].fichas, x[5]], [0, 'Gimnasio de Karina Coach'], 'sin alumnos elegidos anda igual, y sin nombre se llama «Gimnasio de …» (con el interruptor de alta apagado)');

  // ===== Transferir =====
  const programada = `insert into public.routine_schedule (client_id, starts_on, created_by) values ('${P.A3}', current_date + 4, '${P.dA}')`;
  x = await V([['postgres', `update public.profiles set coach_id = '${P.dA}' where id = '${P.A3}'`], ['postgres', programada],
    ZZ(rpc('admin_gym_transferir', G.A, P.pA2)),
    ['postgres', `select jsonb_build_object(
      'gym', (select jsonb_build_array(owner_id, closed_at is null) from public.gyms where id = '${G.A}'),
      'staff', (select jsonb_agg(jsonb_build_array(user_id, role, left_at is null) order by user_id) from public.gym_staff where gym_id = '${G.A}' and user_id in ('${P.dA}', '${P.pA2}')),
      'coaches', (select jsonb_object_agg(id, coach_id) from public.profiles where id in ('${P.A3}', '${P.A7}', '${P.D1}')),
      'fichas', (select jsonb_object_agg(member_id, jsonb_build_array(status, trainer_id)) from public.gym_members where member_id in ('${P.A3}', '${P.A7}')),
      'programada', (select jsonb_agg(created_by) from public.routine_schedule where client_id = '${P.A3}' and applied_at is null),
      'plan', (select jsonb_build_array(plan, max_clients, paid_until = (select paid_until from public.coach_billing where coach_id = '${P.dA}')) from public.coach_billing where coach_id = '${P.pA2}'),
      'inv', prueba.invariantes())`], ['pA2', rpc('mi_gimnasio')], ['dA', rpc('mi_gimnasio')]]);
  const tr = x[2], dt = x[3];
  t.eq([tr.pasan, tr.sin_profe, tr.bajas_sin_hoja, tr.reabre, tr.mp_no_pasa, tr.apple_no_pasa, tr.sin_plan_anterior], [1, 0, 1, false, false, false, false],
    'transferir: 1 socio pasa (A3, aceptó la hoja), 1 sin la hoja pasa a baja (A7), sin suscripciones que avisar: ' + JSON.stringify(tr));
  t.eq([nom(dt.gym[0]), dt.gym[1]], ['pA2', true], 'el gimnasio sigue abierto, con el dueño nuevo');
  t.eq(dt.staff.map(s => [nom(s[0]), s[1], s[2]]).sort(), [['dA', 'owner', false], ['pA2', 'owner', true]], 'la dueña anterior deja el equipo; el profe pasa a dueño');
  t.eq(Object.fromEntries(Object.entries(dt.coaches).map(([k, v]) => [nom(k), nom(v)])), { A3: 'pA2', A7: 'dA', D1: 'dA' },
    'A3 pasa al dueño nuevo; A7 (sin la hoja) y D1 (alumno propio) siguen con la dueña anterior');
  t.eq(Object.fromEntries(Object.entries(dt.fichas).map(([k, v]) => [nom(k), [v[0], nom(v[1])]])), { A3: ['activo', 'pA2'], A7: ['baja', null] }, 'las fichas');
  t.eq([dt.programada.map(nom), dt.plan, dt.inv], [['pA2'], ['p100', 100, true], []], 'la rutina programada pasa al dueño nuevo; su fila toma el plan del gimnasio; invariantes');
  t.eq([x[4].rol, x[4].plan.max, x[5]], ['owner', 100, null], 'mi_gimnasio: el nuevo es dueño (con el plan de 100); la anterior ya no es del gimnasio');
  x = await V([['postgres', `update public.coach_billing set mp_preapproval_id = 'preaprobacion-de-prueba', mp_status = 'authorized' where coach_id = '${P.dA}'`],
    ZZ(rpc('admin_gym_transferir', G.A, P.K))]);
  t.eq([x[1].mp_no_pasa, x[1].apple_no_pasa], [true, false], 'con la suscripción de Mercado Pago de la dueña anterior: avisa que no pasa');
  x = await V([['postgres', `update public.coach_billing set mp_preapproval_id = 'preaprobacion-de-prueba', mp_status = 'authorized' where coach_id = '${P.K}'`],
    ZZ(rpc('admin_gym_transferir', G.A, P.K)), ZZ(rpc('admin_gym_transferir', G.A, P.A1)), ZZ(rpc('admin_gym_transferir', G.A, P.dB)), ZZ(rpc('admin_gym_transferir', G.A, P.dA))]);
  t.eq(x.slice(1), [{ error: 'P0001', msg: 'El dueño nuevo tiene una suscripción propia que se renueva sola (Mercado Pago o Apple): primero tiene que cancelarla.' },
    { error: 'P0001', msg: 'El dueño nuevo tiene que tener una cuenta de coach.' }, { error: 'P0001', msg: 'Esa persona ya es del equipo de otro gimnasio.' },
    { error: 'P0001', msg: 'Elegí otra persona como dueña.' }], 'transferir: lo que no se puede');
  // Cerrado por la baja de la cuenta de la dueña: se reabre con el dueño nuevo.
  x = await V([['postgres', `delete from auth.users where id = '${P.dA}'`], ZZ(rpc('admin_gym_transferir', G.A, P.pA2)),
    ['postgres', `select jsonb_build_object('gym', (select jsonb_build_array(owner_id, closed_at, purge_after, close_reason) from public.gyms where id = '${G.A}'),
      'codigos', (select count(*) from public.gym_codes where gym_id = '${G.A}' and revoked_at is null), 'fichas', (select count(*) from public.gym_members where gym_id = '${G.A}' and status <> 'baja'), 'inv', prueba.invariantes())`],
    ['pA2', rpc('mi_gimnasio')]]);
  t.eq([x[1].reabre, x[1].sin_plan_anterior, /^[A-Z2-9]{8}$/.test(x[1].code), nom(x[2].gym[0]), x[2].gym.slice(1), x[2].codigos, x[2].fichas, x[2].inv, x[3].rol],
    [true, true, true, 'pA2', [null, null, null], 1, 0, [], 'owner'], 'cerrado por la baja de la dueña: se reabre con un código nuevo, las fichas en baja y sin el plan anterior');

  // ===== Cerrar, tope de profes y auditoría =====
  x = await V([ZZ(rpc('admin_gym_cerrar', G.A)), ZZ(rpc('admin_gym_cerrar', G.A)),
    ['postgres', `select jsonb_build_array((select close_reason from public.gyms where id = '${G.A}'), (select count(*) from public.gym_members where gym_id = '${G.A}' and status <> 'baja'),
      (select count(*) from public.gym_audit where gym_id = '${G.A}' and action = 'cerrar' and actor_id = '${Z}'), prueba.invariantes())`]]);
  t.eq([x[0].ok, x[1], x[2]], [true, { error: 'P0001', msg: 'Ese gimnasio no existe o ya está cerrado.' }, ['admin', 0, 1, []]], 'cerrar desde el admin: fichas en baja, gym_audit con quien lo hizo; dos veces, P0001');
  x = await V([ZZ(`select to_jsonb(public.admin_gym_profes_extra('${G.A}', 5))`), ZZ(`select to_jsonb(public.admin_gym_profes_extra('${G.A}', -1))`),
    ZZ(`select to_jsonb(public.admin_gym_profes_extra('${G.A}', 101))`), ['dA', rpc('mi_gimnasio')], ['dA', rpc('gym_config', { settings: { profes_extra: 50 } })]]);
  t.eq([x[0].profes_tope, x[0].profes_usados, x[1].error, x[2].error, x[3].plan.profes_tope, x[4].error], [13, 2, 'P0001', 'P0001', 13, 'P0001'],
    'tope de profes: 8 + 5; fuera de 0 a 100, no; el dueño lo ve y no lo puede cambiar');
  x = await V([['dA', rpc('gym_codigo_rotar')], ZZ(rpc('admin_gym_auditoria', G.A)), ['postgres', `select to_jsonb(count(*)) from public.admin_audit where action = 'gym_auditoria' and target = '${G.A}'`]]);
  t.ok(x[1].length >= 1 && x[1][0].accion === 'codigo_rotar' && x[1][0].quien === 'Laura Fuerza' && x[2] === 1, 'auditoría: lo último primero, con quién lo hizo, y queda anotado que se exportó: ' + JSON.stringify(x[1][0]));
  t.ok(x[1].every(a => ['fecha', 'quien', 'accion', 'ficha', 'sobre', 'datos'].every(k => k in a)), 'cada fila: fecha, quién, acción, ficha, sobre quién y datos');

  // ===== El interruptor para crear gimnasios =====
  x = await V([ZZ(`select to_jsonb(true) from (select public.admin_set_config('gimnasios', '{"alta": true}'::jsonb)) x`),
    ['postgres', `update public.coach_billing set plan = 'p100', max_clients = 100 where coach_id = '${P.K}'`], ['K', rpc('mi_gimnasio')], ZZ(rpc('admin_gyms')),
    ZZ(`select to_jsonb(true) from (select public.admin_set_config('gimnasios', '{"alta": "si"}'::jsonb)) x`),
    ZZ(`select to_jsonb(true) from (select public.admin_set_config('gimnasios', '{"alta": true, "otra": 1}'::jsonb)) x`),
    ZZ(`select to_jsonb(true) from (select public.admin_set_config('gimnasios', null)) x`),
    ZZ(`select to_jsonb(true) from (select public.admin_set_config('otra', '{}'::jsonb)) x`),
    ZZ(`select to_jsonb(true) from (select public.admin_set_config('version', '{"android":{"ultima":12}}'::jsonb)) x`)]);
  t.eq([x[0], x[2], x[3].alta], [true, { gym: null, rol: null, puede_crear: true }, true], 'prendido por el admin: un coach con p100 puede crear un gimnasio');
  t.eq(x.slice(4, 7).map(r => r.msg), Array(3).fill('Revisá el valor: {"alta": true} o {"alta": false}.'), 'el valor tiene que ser {"alta": true|false}');
  t.eq([x[7].error, x[8]], ['P0001', true], 'otra clave, no; «version» sigue andando');

  // ===== Coaches y pagos, Resumen =====
  x = await V([ZZ(`select jsonb_object_agg(id, jsonb_build_array(gimnasio, sin_cargo, clients, gym_rol)) from public.admin_coaches()`), ZZ(rpc('admin_overview')),
    ['postgres', `update public.coach_billing set trial_ends_at = now() - interval '2 days', paid_until = null, plan = 'trial' where coach_id in ('${P.pA2}', '${P.K}')`],
    ZZ(rpc('admin_overview'))]);
  const co = Object.fromEntries(Object.entries(x[0]).map(([k, v]) => [nom(k), v]));
  t.eq([co.dA, co.pA1, co.pA2, co.C, co.dB], [['Dueño de Gimnasio Fuerza', false, 6, 'owner'], ['Profe de Gimnasio Fuerza', false, 1, 'profe'],
    ['Profe de Gimnasio Fuerza, sin cargo', true, 0, 'profe'], [null, false, 1, null], ['Dueño de Gimnasio Norte', false, 1, 'owner']],
    'admin_coaches: la columna Gimnasio, «sin cargo» para el profe sin alumnos propios y «Alumnos» = el cupo usado');
  t.eq([x[1].gyms, x[1].gym_socios, x[1].gym_profes], [2, 6, 2], 'admin_overview: gimnasios, socios (activos y pausados) y profes en gimnasios');
  t.eq(x[3].overdue - x[1].overdue, 1, 'prueba vencida: cuenta el coach K y no el profe sin cargo');

  // ===== Mail de vencimiento =====
  const tomar = `select coalesce(jsonb_agg(jsonb_build_array(coach_id, clientes, gimnasio, socios, dias, copia, prueba) order by coach_id), '[]') from public.tomar_avisos_vence()`;
  const vence = (q, en) => ['postgres', `update public.coach_billing set trial_ends_at = now() - interval '60 days', paid_until = now() + interval '${en}' where coach_id = '${P[q]}'`];
  const lee = r => r.map(a => [nom(a[0]), a[1], a[2], a[3], a[4], (a[5] || []).map(nom), a[6]]);
  x = await V([vence('dA', '6 days'), vence('pA1', '12 hours'), vence('K', '12 hours'),
    ['postgres', `update public.coach_billing set trial_ends_at = now() + interval '12 hours', paid_until = null, plan = 'trial' where coach_id = '${P.pA2}'`],
    ['postgres', 'select to_jsonb(public.hay_avisos_vence())'], ['postgres', tomar], ['postgres', tomar], ['postgres', 'select to_jsonb(public.hay_avisos_vence())'],
    vence('dA', '60 hours'), ['postgres', tomar], ['postgres', tomar],
    vence('dA', '20 hours'), ['postgres', tomar], ['postgres', `select to_jsonb(true) from (select public.soltar_aviso_vence('${P.dA}')) x`], ['postgres', tomar], ['postgres', tomar]]);
  t.eq([x[4], lee(x[5]), x[6], x[7]], [true, [['pA1', 1, null, null, 1, [], false], ['dA', 6, 'Gimnasio Fuerza', 5, 7, ['aA'], false], ['K', 0, null, null, 1, [], false]].sort((a, b) => P[a[0]] < P[b[0]] ? -1 : 1), [], false],
    'a 6 días: la dueña (7 días, con su gimnasio, 5 socios y la administración en copia), el profe con alumnos propios y el coach a 12 horas; el profe sin cargo no; la segunda vez, nada');
  t.eq([lee(x[9]), x[10]], [[['dA', 6, 'Gimnasio Fuerza', 5, 3, ['aA'], false]], []], 'a 60 horas: el de 3 días, una vez');
  t.eq([lee(x[12]), lee(x[14]), x[15]], [[['dA', 6, 'Gimnasio Fuerza', 5, 1, ['aA'], false]], [['dA', 6, 'Gimnasio Fuerza', 5, 1, ['aA'], false]], []],
    'a 20 horas: el de 1 día; si el mail no salió (soltar_aviso_vence) se vuelve a tomar, y después nada');
  x = await V([vence('dA', '2 days'), ['postgres', `update public.coach_billing set mp_preapproval_id = 'preaprobacion-de-prueba', mp_status = 'authorized' where coach_id = '${P.dA}'`], ['postgres', tomar],
    ['postgres', `update public.coach_billing set mp_status = 'cancelled', plan = 'cortesia' where coach_id = '${P.dA}'`], ['postgres', tomar]]);
  t.eq([x[2], x[4]], [[], []], 'la dueña con la suscripción de Mercado Pago activa o con cortesía: sin mail');
  // Dos a la vez: cada aviso sale una sola vez.
  await db.sql(`update public.coach_billing set trial_ends_at = now() - interval '60 days', paid_until = now() + interval '2 days' where coach_id = '${P.dA}';`);
  const aLaVez = () => db.json(`begin; select coalesce(jsonb_agg(coach_id), '[]') from public.tomar_avisos_vence(); select pg_sleep(0.3); commit;`).catch(e => ({ error: e.code, msg: e.msg }));
  const dos = await Promise.all([aLaVez(), aLaVez()]);
  t.eq(dos.flat().map(nom), ['dA'], 'dos llamadas a la vez: el aviso de la dueña sale una sola vez: ' + JSON.stringify(dos));
  await db.borrar();
}
