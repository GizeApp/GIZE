// supabase/ia.sql con los gimnasios, en Postgres de verdad (tests/pg.mjs; sin Postgres se saltea):
// un profe de gimnasio sin plan propio de coach usa la IA con los topes de coach (decisión del
// dueño), y queda anotado de dónde sale (ia_rol_origen: 'plan' o 'gimnasio').
// - Personas de tests/gimnasios-comun.mjs: la dueña dA y Martina (pA1) tienen plan pago → 'plan';
//   Lucas (pA2), profe de A con su plan solo de prueba → 'gimnasio' (ia_rol = 'coach'); la
//   administración (aA), la recepción (rA) y los socios → alumno.
// - Deja de contar si el gimnasio está en la prueba gratis (sin pagar), con el plan vencido, si el
//   profe se fue o si el gimnasio cerró.
// - ia_reservar guarda el origen en la llamada (el panel lo muestra) y ia_mi_estado le dice a la app
//   por_gimnasio, sin montos.
// - Sin las tablas de gimnasios (la base de hoy), ia_rol_origen anda igual y solo mira el plan.
import { conPg } from './pg.mjs';
import { P, G, DATOS, ayudas, VENCE } from './gimnasios-comun.mjs';

export default async function ({ t }){
  const h = await conPg(t);
  if (!h) return;

  // ===== Sin gimnasios =====
  const sin = await h.nueva('gize_sin');
  const C0 = 'c0000000-0000-4000-8000-000000000001', A0 = 'c0000000-0000-4000-8000-000000000002';
  await sin.sql(`insert into auth.users (id, email, raw_user_meta_data) values ('${C0}', 'c0@ejemplo.test', '{"full_name":"Coach","role":"coach"}'),
      ('${A0}', 'a0@ejemplo.test', '{"full_name":"Alumna"}');
    update public.coach_billing set plan = 'p10', max_clients = 10, paid_until = now() + interval '20 days' where coach_id = '${C0}';`);
  t.eq(await sin.json(`select jsonb_build_array(public.ia_rol_origen('${C0}'), public.ia_rol_origen('${A0}'), public.ia_rol('${C0}'), public.ia_rol('${A0}'));`),
    ['plan', null, 'coach', 'alumno'], 'sin gimnasios: solo mira el plan');
  await sin.borrar();

  // ===== Con gimnasios =====
  const db = await h.nueva('gize_con');
  t.eq(await db.json(DATOS), [], 'las personas cargadas cumplen los invariantes');
  const { V } = ayudas(db);
  const QUIENES = ['dA', 'pA1', 'pA2', 'aA', 'rA', 'A1', 'dB', 'C'];
  const origenes = `select jsonb_build_array(${QUIENES.map(k => `public.ia_rol_origen('${P[k]}')`).join(', ')})`;
  const roles = `select jsonb_build_array(${QUIENES.map(k => `public.ia_rol('${P[k]}')`).join(', ')})`;
  const mira = antes => V([['postgres', antes], ['servicio', origenes], ['servicio', roles]]).then(r => {
    if (r[0] && r[0].error) throw new Error('no se pudo preparar: ' + r[0].msg);
    return [r[1], r[2]];
  });

  let [o, r] = await mira('select 1');
  t.eq(o, ['plan', 'plan', 'gimnasio', null, null, null, 'plan', 'plan'], 'al día: el profe sin plan propio (pA2) sale «gimnasio»');
  t.eq(r, ['coach', 'coach', 'coach', 'alumno', 'alumno', 'alumno', 'coach', 'coach'], 'al día: pA2 usa los topes de coach; administración, recepción y socios, los de alumno');
  [o] = await mira(`update public.coach_billing set paid_until = null, trial_ends_at = now() + interval '10 days' where coach_id = '${P.dA}'`);
  t.eq(o[2], null, 'gimnasio en la prueba gratis (sin pagar): el profe no cuenta como coach');
  [o] = await mira(`update public.coach_billing set plan = 'cortesia', paid_until = null where coach_id = '${P.dA}'`);
  t.eq(o[2], 'gimnasio', 'gimnasio de cortesía: el profe cuenta como coach');
  [o] = await mira(VENCE('dA', '1 day'));
  t.eq(o[2], null, 'plan del gimnasio vencido: el profe vuelve a los topes de alumno');
  [o] = await mira(`update public.gym_staff set left_at = now() where user_id = '${P.pA2}'`);
  t.eq(o[2], null, 'el profe se fue del gimnasio: alumno');
  [o] = await mira(`update public.gyms set closed_at = now(), close_reason = 'admin' where id = '${G.A}'`);
  t.eq([o[0], o[2]], ['plan', null], 'gimnasio cerrado: el profe no cuenta (la dueña sigue con su plan)');

  // La app no lo puede preguntar.
  const app = await V([['pA2', `select to_jsonb(public.ia_rol_origen('${P.pA2}'))`]]);
  t.eq(app[0] && app[0].error, '42501', 'ia_rol_origen: la app no la puede llamar');

  // ia_reservar guarda el origen; ia_mi_estado lo dice (sin montos).
  const prender = `update public.ia_config set activa = true, ancla = date_trunc('day', now() - interval '3 days'),
      funciones = funciones || '{"plato": true}'::jsonb where id = 1`;
  const reservar = (k, rol) => `select public.ia_reservar('${P[k]}', '${rol}', 'plato', 'modelo-prueba', 0.01)`;
  const x = await V([['postgres', prender], ['servicio', reservar('pA2', 'coach')], ['servicio', reservar('pA1', 'coach')], ['servicio', reservar('A1', 'alumno')],
    ['postgres', `select jsonb_agg(jsonb_build_array(user_id, rol, origen) order by id) from public.ia_llamadas`],
    ['pA2', `select public.ia_mi_estado()`], ['pA1', `select public.ia_mi_estado()`]]);
  t.ok(x[1] && x[1].ok === true && x[2] && x[2].ok === true && x[3] && x[3].ok === true, 'las tres reservas pasan: ' + JSON.stringify(x.slice(1, 4)));
  t.eq(x[4], [[P.pA2, 'coach', 'gimnasio'], [P.pA1, 'coach', 'plan'], [P.A1, 'alumno', null]], 'cada llamada guarda de dónde salió su rol');
  t.eq([x[5] && x[5].por_gimnasio, x[5] && x[5].tope && x[5].tope.total], [true, 60], 'ia_mi_estado del profe: por_gimnasio y los topes de coach');
  t.eq(x[6] && x[6].por_gimnasio, false, 'ia_mi_estado de un coach con plan: no es por gimnasio');
  await db.borrar();
}
