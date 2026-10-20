// Gimnasios, etapa 1: lo que lee la administración del gimnasio (supabase/gimnasios-lectura.sql, §6.4) y
// la fila de coach_billing para las apps viejas (§3.4), en Postgres de verdad (tests/pg.mjs; sin
// Postgres se saltea).
// - Las 11 tablas de registros: la dueña y el encargado leen a quien compartió (ficha activa o pausada,
//   hoja aceptada, plan al día) y nada más; dejan de leer en la consulta siguiente a que lo apague, al
//   pasar la ficha a baja, al irse del equipo o con el plan vencido hace más de 5 días; leer no es
//   editar (no cambian ni borran nada); la recepción y los demás, nada.
// - gym_registro_lectura (sin steps) y gym_cardio_lectura (sin track): solo dueño y administración que
//   pueden leer a ese socio.
// - Fotos de perfil (avatars): dueño y administración, la de sus socios activos o pausados; el socio,
//   la de los profes de su gimnasio; la recepción, ninguna; las de hoy no cambian.
// - coach_billing: el profe del gimnasio sin vínculos propios y con la fila solo de prueba no la ve (la
//   app vieja lo trata como activo y sin tope); con plan pagado, con alumnos propios, si deja el
//   gimnasio o si es un coach común, la ve como hoy.
import { conPg } from './pg.mjs';
import { P, F, G, CODIGO, DATOS, ayudas, rpc, nom, conCanon, VENCE } from './gimnasios-comun.mjs';

const TABLAS = ['body_weights', 'checkins', 'client_prefs', 'food_entries', 'sessions', 'session_entries', 'client_info', 'blocks', 'nutrition', 'routines', 'routine_schedule'];
const QUIEN_LEE = ['dA', 'aA', 'pA1', 'rA', 'dB', 'A1', 'C'];
const DE = ['A1', 'A2', 'A3', 'A6', 'A7', 'B1', 'C1', 'P1'];
export default async function ({ t: t0 }){
  const t = conCanon(t0);
  const h = await conPg(t);
  if (!h) return;
  const db = await h.nueva('gize_con');
  t.eq(await db.json(DATOS), [], 'las personas cargadas cumplen los invariantes');
  const { J, V, PROBAR } = ayudas(db);
  // prueba.n lo llama postgres; cada persona solo cuenta (con sus permisos).
  const leen = async (cambio = 'select 1') => {
    const r = await J(`select jsonb_object_agg(l, (prueba.varios(jsonb_build_array(jsonb_build_object('quien', 'postgres', 'q', ${"'" + cambio.replace(/'/g, "''") + "'"}),
        jsonb_build_object('quien', l, 'q', $q$select jsonb_object_agg(u::text, ${TABLAS.map(tb => `(select count(*) from public.${tb} where client_id = u)`).join(' + ')})
          from unnest(array[${DE.map(d => `'${P[d]}'::uuid`).join(', ')}]) u$q$)))->1->'ok'))
      from unnest(array[${QUIEN_LEE.map(w => `'${P[w]}'`).join(', ')}]) l;`);
    return Object.fromEntries(QUIEN_LEE.map(w => [w, DE.filter(d => r[P[w]][P[d]] > 0).map(d => d + (r[P[w]][P[d]] === 11 ? '' : ':' + r[P[w]][P[d]]))]));
  };
  const BASE = { dA: ['A1', 'A7'], aA: ['A1'], pA1: ['A1', 'A2', 'P1'], rA: [], dB: ['B1'], A1: ['A1'], C: ['C1'] };
  t.eq(await leen(), BASE, 'quién lee las 11 tablas de quién: la dueña y el encargado a A1 (compartió); la dueña además a A7 como su profe; nadie a A2 (no compartió), A3, A6 (pedido) ni a otro gimnasio');
  const CASOS = [
    [`update public.gym_members set share_admin = false where id = '${F.A1}'`, { dA: ['A7'], aA: [] }, 'A1 apaga «compartir»: dejan de leerla'],
    [`update public.gym_members set terms_at = null where id = '${F.A1}'`, { dA: ['A7'], aA: [] }, 'sin la hoja aceptada: no'],
    [`update public.gym_members set status = 'pausado', paused_until = current_date + 10 where id = '${F.A1}'`, {}, 'con la ficha pausada: sí'],
    [`update public.gym_members set status = 'baja', left_at = now() where id = '${F.A1}'`, { dA: ['A7'], aA: [], pA1: ['A1', 'A2', 'P1'] }, 'con la ficha en baja (y su profe todavía de coach): la administración no'],
    [`update public.gym_staff set left_at = now() where user_id = '${P.aA}'`, { aA: [] }, 'el encargado que se fue deja de leer'],
    [VENCE('dA', '4 days 23 hours'), {}, 'plan vencido hace menos de 5 días: sí'],
    [VENCE('dA', '5 days 1 hour'), { dA: [], aA: [], pA1: ['P1'] }, 'plan vencido hace más de 5 días: nadie del gimnasio (el profe sigue con P1, su plan)'],
    [`update public.gym_members set share_admin = true, share_admin_at = now() where id = '${F.A2}'`, { dA: ['A1', 'A2', 'A7'], aA: ['A1', 'A2'] }, 'A2 prende «compartir»: la empiezan a leer'],
    [`update public.gym_members set share_admin = true where id = '${F.A3}'; update public.profiles set coach_id = '${P.C}' where id = '${P.A3}'`, { dA: ['A1', 'A3:10', 'A7'], aA: ['A1', 'A3:10'], C: ['A3:10', 'C1'] },
      'un socio con coach de afuera que compartió: la administración lo lee (y el coach de afuera, como su coach; A3 no tiene rutina programada: 10 tablas)']];
  for (const [cambio, dif, que] of CASOS) t.eq(await leen(cambio), Object.assign({}, BASE, dif), que);
  // Leer no es editar.
  const editar = await V([['dA', `with a as (update public.routines set days = days where client_id = '${P.A1}' returning 1),
      b as (delete from public.blocks where client_id = '${P.A1}' returning 1), c as (update public.client_info set objective = 'otra' where client_id = '${P.A1}' returning 1),
      d as (delete from public.routine_schedule where client_id = '${P.A1}' returning 1), e as (update public.nutrition set kcal = 1 where client_id = '${P.A1}' returning 1)
      select to_jsonb(array[(select count(*) from a), (select count(*) from b), (select count(*) from c), (select count(*) from d), (select count(*) from e)])`],
    ['dA', `insert into public.body_weights (client_id, measured_on, kg) values ('${P.A1}', current_date - 3, 71)`]]);
  t.eq([editar[0], editar[1].error], [[0, 0, 0, 0, 0], '42501'], 'la dueña lee a A1 pero no cambia, borra ni carga nada (las «for all» no se tocaron)');

  // ===== Registro diario y salidas, por función =====
  let x = await V([['dA', `select public.gym_registro_lectura('${P.A1}')`], ['aA', `select public.gym_cardio_lectura('${P.A1}')`],
    ['dA', `select public.gym_registro_lectura('${P.A2}')`], ['pA1', `select public.gym_registro_lectura('${P.A1}')`], ['rA', `select public.gym_cardio_lectura('${P.A1}')`],
    ['dA', `select public.gym_registro_lectura('${P.A1}', current_date + 1)`], ['dA', `select public.gym_cardio_lectura('${P.B1}')`]]);
  t.ok(x[0].length === 1 && !('steps' in x[0][0]) && x[0][0].sleep === 'bien' && x[0][0].client_id === P.A1, 'gym_registro_lectura: el registro diario de A1 sin steps (los pasos de Salud): ' + JSON.stringify(x[0]));
  t.ok(x[1].length === 1 && !('track' in x[1][0]) && x[1][0].duration_s === 600, 'gym_cardio_lectura: las salidas de A1 sin track (el recorrido): ' + JSON.stringify(x[1]).slice(0, 200));
  t.eq([x[2].error, x[3].error, x[4].error, x[5], x[6].error], ['42501', '42501', '42501', [], '42501'],
    'a quien no compartió, al profe (lo lee directo, es su coach), a la recepción y a otro gimnasio: 42501; desde mañana: vacío');
  x = await V([['postgres', VENCE('dA', '5 days 1 hour')], ['dA', `select public.gym_registro_lectura('${P.A1}')`]]);
  t.eq(x[1].error, '42501', 'con el plan vencido hace más de 5 días, tampoco');
  t.eq(await PROBAR('pA1', `select to_jsonb(array[(select steps from public.daily_logs where client_id = '${P.A1}'), (select length(track) from public.cardio_outings where client_id = '${P.A1}')])`), [8000, 29],
    'su profe sigue leyendo pasos y recorrido directo, como hoy');

  // ===== Fotos de perfil =====
  await db.sql(`insert into storage.objects (bucket_id, name, owner_id) select 'avatars', id || '/perfil.jpg', id::text from public.profiles;`);
  const avatares = await J(`select jsonb_object_agg(prueba.n(l::uuid), (select jsonb_agg(x) from jsonb_array_elements_text(prueba.probar(l, 'select coalesce(jsonb_agg(split_part(name, ''/'', 1)), ''[]'') from storage.objects where bucket_id = ''avatars''')->'ok') x))
    from unnest(array[${['dA', 'aA', 'pA1', 'rA', 'A1', 'A2', 'A6', 'B1', 'C1'].map(w => `'${P[w]}'`).join(', ')}]) l;`);
  const av = Object.fromEntries(Object.entries(avatares).map(([k, v]) => [k, v.map(nom).sort()]));
  t.eq(av, {
    dA: ['A1', 'A2', 'A3', 'A7', 'D1', 'dA'].sort(), aA: ['A1', 'A2', 'A3', 'A7', 'aA'].sort(), pA1: ['A1', 'A2', 'P1', 'pA1'].sort(), rA: ['rA'],
    A1: ['A1', 'aA', 'dA', 'pA1', 'pA2'].sort(), A2: ['A2', 'aA', 'dA', 'pA1', 'pA2'].sort(), A6: ['A6'], B1: ['B1', 'dB'], C1: ['C', 'C1'].sort() },
    'avatars: la dueña y el encargado ven a sus socios activos (no al pedido ni a la visita); el profe, a los suyos (como hoy); la recepción, ninguno; el socio, a los profes y la administración de su gimnasio (no a la recepción); un pedido, a nadie; lo de hoy no cambia');

  // ===== coach_billing para las apps viejas =====
  const fila = w => [w, `select to_jsonb(count(*)) from public.coach_billing where coach_id = auth.uid()`];
  x = await V([fila('pA2'), fila('pA1'), fila('dA'), fila('K'), fila('C')]);
  t.eq(x, [0, 1, 1, 1, 1], 'pA2 (profe del gimnasio, solo prueba, sin alumnos propios) no ve su fila; pA1 (plan pagado), la dueña, un coach sin gimnasio y uno independiente, sí');
  x = await V([['N', `select public.join_coach('${CODIGO.pA2}')::jsonb`], fila('pA2')]);
  t.eq(x, [true, 1], 'con un alumno propio, la ve (su plan cuenta)');
  for (const [cambio, que] of [[`update public.coach_billing set mp_preapproval_id = 'preaprobacion-de-prueba' where coach_id = '${P.pA2}'`, 'con la renovación de MP'],
    [`update public.coach_billing set apple_original_tx = 'transaccion-de-prueba' where coach_id = '${P.pA2}'`, 'con la de Apple'],
    [`update public.coach_billing set paid_until = now() + interval '10 days', plan = 'p10' where coach_id = '${P.pA2}'`, 'con plan pagado'],
    [`update public.gym_staff set left_at = now() where user_id = '${P.pA2}'`, 'si deja el gimnasio'],
    [`update public.gyms set closed_at = now(), close_reason = 'dueño' where id = '${G.A}'`, 'si el gimnasio cierra']]){
    x = await V([['postgres', cambio], fila('pA2')]);
    t.eq(x[1], 1, 'pA2 ve su fila ' + que);
  }
  x = await V([['servicio', `select to_jsonb(count(*)) from public.coach_billing where coach_id = '${P.pA2}'`], ['servicio', `select to_jsonb(public.coach_active('${P.pA2}'))`]]);
  t.eq(x, [1, true], 'la fila sigue existiendo (la leen el admin y las funciones)');
  t.eq(await J('select prueba.invariantes();'), [], 'invariantes');
  await db.borrar();
}
