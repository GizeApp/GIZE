// Gimnasios, etapa 1: borrar la cuenta (§1.6, §6.13) de cada persona del gimnasio en Postgres de verdad
// (tests/pg.mjs; sin Postgres se saltea), con delete_own_account (la de hoy: borra auth.users y llega en
// cascada a profiles, donde está el before delete de gimnasios-vinculo.sql). El borrado nunca falla
// (Apple 5.1.1(v)): ni por las claves de los gimnasios ni si algo del trigger fallara.
// - La dueña: el gimnasio se cierra (baja_cuenta_dueño, sin dueño, purge_after a 90 días), las fichas
//   en baja, sin coach los socios que atendía el equipo, el equipo afuera, el código anulado; a los 90
//   días gym_diaria lo borra con fichas, ingresos y avisos (gym_audit queda).
// - El profe por defecto y otro profe: sus socios sin profe (en una sola operación, un aviso de
//   resumen), el gimnasio sin profe por defecto.
// - La recepción y el encargado: solo dejan el equipo.
// - Un socio: su ficha queda «sin app», con su estado, su foto del gimnasio y sus ingresos.
import { conPg } from './pg.mjs';
import { P, F, G, DATOS, ayudas, rpc, nom, conCanon } from './gimnasios-comun.mjs';

const BORRAR = 'select to_jsonb(true) from (select public.delete_own_account()) x';
const FOTO = `${G.A}/${F.A1}/c0000000-0000-4000-8000-000000000001.jpg`;
const ESTADO_A = `select jsonb_build_object(
    'gym', (select jsonb_build_object('dueno', prueba.n(owner_id), 'cerrado', closed_at is not null, 'motivo', close_reason,
              'purga_dias', round(extract(epoch from purge_after - now()) / 86400), 'profe', prueba.n(default_trainer_id)) from public.gyms where id = '${G.A}'),
    'equipo', (select coalesce(jsonb_agg(prueba.n(user_id) order by prueba.n(user_id)), '[]') from public.gym_staff where gym_id = '${G.A}' and left_at is null),
    'fichas', (select jsonb_object_agg(coalesce(prueba.n(member_id), full_name), jsonb_build_array(status, prueba.n(trainer_id))) from public.gym_members where gym_id = '${G.A}' and id in ('${F.A1}', '${F.A2}', '${F.A3}', '${F.A7}')),
    'coaches', (select jsonb_object_agg(prueba.n(id), prueba.n(coach_id)) from public.profiles where id in ('${P.A1}', '${P.A2}', '${P.A3}', '${P.A7}', '${P.D1}', '${P.P1}')),
    'codigo', (select count(*) from public.gym_codes where gym_id = '${G.A}' and revoked_at is null),
    'cupos', (select jsonb_object_agg(prueba.n(coach_id), seats_used) from public.coach_billing where coach_id in ('${P.dA}', '${P.pA1}', '${P.pA2}')),
    'inv', prueba.invariantes())`;

export default async function ({ t: t0 }){
  const t = conCanon(t0);
  const h = await conPg(t);
  if (!h) return;
  const db = await h.nueva('gize_con');
  t.eq(await db.json(DATOS), [], 'las personas cargadas cumplen los invariantes');
  await db.sql(`update public.gyms set default_trainer_id = '${P.pA1}' where id = '${G.A}';
    update public.gym_members set foto_path = '${FOTO}', foto_ok_at = now() where id = '${F.A1}';
    update public.profiles set coach_id = '${P.pA2}' where id = '${P.A3}';`);
  const { J, V, INV } = ayudas(db);
  t.eq(await INV(), [], 'A3 con pA2, pA1 profe por defecto, A1 con foto del gimnasio');
  const alertas = tipo => `select coalesce(jsonb_agg(substr(recipient, 3) order by recipient), '[]') from public.gym_alerts where kind = '${tipo}'`;

  // ===== La dueña =====
  let x = await V([['dA', BORRAR], ['postgres', ESTADO_A], ['A1', rpc('mi_gimnasio')], ['N', `select public.join_coach('FUERZA22')::jsonb`],
    ['postgres', `select to_jsonb((select count(*) from auth.users where id = '${P.dA}'))`]]);
  t.eq(x[0], true, 'la dueña borra su cuenta: no falla');
  t.eq(x[1], { gym: { dueno: null, cerrado: true, motivo: 'baja_cuenta_dueño', purga_dias: 90, profe: null }, equipo: [],
    fichas: { A1: ['baja', null], A2: ['baja', null], A3: ['baja', null], A7: ['baja', null] },
    coaches: { A1: null, A2: null, A3: null, A7: null, D1: null, P1: 'pA1' }, codigo: 0, cupos: { pA1: 1, pA2: 0 }, inv: [] },
    'el gimnasio queda cerrado por la baja de la dueña (sin dueño, se borra a los 90 días); fichas en baja; sin coach los que atendía el equipo; P1 (de pA1) no cambia; el equipo afuera; el código anulado');
  t.eq([x[2], x[3], x[4]], [null, false, 0], 'los socios ya no tienen gimnasio; el código no sirve; la cuenta se borró');
  x = await V([['postgres', `update public.coach_billing set mp_preapproval_id = 'preaprobacion-de-prueba', mp_status = 'authorized' where coach_id = '${P.dA}'`], ['dA', BORRAR], ['postgres', ESTADO_A]]);
  t.eq([x[1].error, x[2].gym.cerrado], ['P0001', false], 'con la renovación de Mercado Pago activa, como hoy, primero tiene que cancelarla (y no se cierra nada)');
  // A los 90 días, gym_diaria lo borra (con sus fichas, ingresos y avisos); gym_audit queda.
  x = await V([['dA', BORRAR], ['postgres', 'select public.gym_diaria()'], ['postgres', `update public.gyms set purge_after = now() - interval '1 minute' where id = '${G.A}'`],
    ['postgres', 'select public.gym_diaria()'],
    ['postgres', `select jsonb_build_array((select count(*) from public.gyms where id = '${G.A}'), (select count(*) from public.gym_members where gym_id = '${G.A}'),
        (select count(*) from public.gym_entries where gym_id = '${G.A}'), (select count(*) from public.gym_alerts where gym_id = '${G.A}'),
        (select count(*) from public.gym_audit where gym_id = '${G.A}') > 0, prueba.invariantes())`]]);
  t.eq([x[1].purgados, x[3].purgados, x[4]], [0, 1, [0, 0, 0, 0, true, []]], 'antes de los 90 días no se borra; después, gym_diaria borra el gimnasio con fichas, ingresos y avisos (la auditoría queda)');

  // ===== El profe por defecto =====
  x = await V([['pA1', BORRAR], ['postgres', ESTADO_A], ['postgres', alertas('profe_borro_cuenta')], ['postgres', alertas('socio_sin_profe')],
    ['postgres', `select data from public.gym_audit where action = 'baja_cuenta_equipo'`]]);
  t.eq([x[0], x[1].gym, x[1].equipo, x[1].fichas, x[1].coaches, x[1].inv], [true, { dueno: 'dA', cerrado: false, motivo: null, purga_dias: null, profe: null },
    ['aA', 'dA', 'pA2', 'rA'], { A1: ['activo', null], A2: ['activo', null], A3: ['activo', 'pA2'], A7: ['activo', 'dA'] },
    { A1: null, A2: null, A3: 'pA2', A7: 'dA', D1: 'dA', P1: null }, []],
    'el profe por defecto borra su cuenta: sus socios (A1, A2) quedan sin profe, el gimnasio sin profe por defecto, P1 sin coach (como hoy)');
  t.eq([x[2].map(nom), x[3], x[4]], [['aA', 'dA'], [], { rol: 'profe', sin_profe: 2 }], 'un solo aviso de resumen a la administración (ninguno por socio) y la auditoría');
  // ===== Otro profe =====
  x = await V([['pA2', BORRAR], ['postgres', ESTADO_A]]);
  t.eq([x[0], x[1].equipo, x[1].fichas.A3, x[1].coaches.A3, x[1].gym.profe, x[1].inv], [true, ['aA', 'dA', 'pA1', 'rA'], ['activo', null], null, 'pA1', []],
    'otro profe borra su cuenta: su socio (A3) queda sin profe; el profe por defecto no cambia');
  // ===== La recepción y el encargado =====
  for (const w of ['rA', 'aA']){
    x = await V([[w, BORRAR], ['postgres', ESTADO_A]]);
    t.eq([x[0], x[1].equipo.includes(w), x[1].fichas, x[1].inv], [true, false, { A1: ['activo', 'pA1'], A2: ['activo', 'pA1'], A3: ['activo', 'pA2'], A7: ['activo', 'dA'] }, []],
      w + ' borra su cuenta: solo deja el equipo');
  }
  // ===== Un socio =====
  x = await V([['A1', BORRAR], ['postgres', `select jsonb_build_object('ficha', (select jsonb_build_array(member_id, status, trainer_id, foto_path, full_name) from public.gym_members where id = '${F.A1}'),
      'ingresos', (select count(*) from public.gym_entries where gym_member_id = '${F.A1}'), 'inv', prueba.invariantes())`], ['dA', rpc('gym_socios_resumen')]]);
  const fA1 = x[2].find(s => s.id === F.A1);
  t.eq([x[0], x[1], fA1.sin_app, fA1.foto_path], [true, { ficha: [null, 'activo', null, FOTO, 'Martina Sosa'], ingresos: 1, inv: [] }, true, FOTO],
    'un socio borra su cuenta: la ficha queda «sin app», con su estado, su foto del gimnasio, su nombre y sus ingresos (registro del gimnasio)');

  // ===== El borrado nunca falla =====
  x = await V([['postgres', `create or replace function public.gym_cerrar_por_baja(dueno uuid) returns integer language plpgsql security definer set search_path = public as $f$ begin raise exception 'falla a propósito'; end $f$`],
    ['dA', BORRAR], ['postgres', `select jsonb_build_array((select count(*) from auth.users where id = '${P.dA}'), (select prueba.n(owner_id) from public.gyms where id = '${G.A}'), prueba.invariantes())`]]);
  t.eq([x[1], x[2]], [true, [0, null, []]], 'si algo del trigger fallara, el borrado igual se hace (lo de la etapa 0: el gimnasio queda sin dueño por la clave foránea)');
  t.eq(await INV(), [], 'invariantes al final (todo se deshizo)');
  t.eq(nom(await J(`select to_jsonb(owner_id) from public.gyms where id = '${G.A}'`)), 'dA', 'y la dueña sigue');
  await db.borrar();
}
