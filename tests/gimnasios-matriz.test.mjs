// Gimnasios, etapa 0: matriz de personas de la spec (§6.12, con los permisos de §1.2) sobre
// supabase/gimnasios.sql y gimnasios-vinculo.sql, en Postgres de verdad (tests/pg.mjs; sin Postgres se
// saltea). Cada persona entra con su rol y su auth.uid(), como por PostgREST.
// Personas: gimnasio A «Gimnasio Fuerza» (dueña dA, encargado aA, profe pA1 con un alumno propio P1,
// recepción rA; socios A1 con profe y que compartió, A2 que no compartió, A3 sin profe, A4 ficha sin
// app, A5 visita, A6 solicitud pendiente, A7 con la dueña como profe y sin la hoja aceptada, y D1
// alumno propio de la dueña), gimnasio B «Gimnasio Norte» (dueño dB, socia B1), coach independiente C
// con su alumna C1, y N, una cuenta nueva. A5 y A6 tienen «compartir» prendido a propósito.
// a) Tablas nuevas: qué filas lee cada persona; nadie (ni la dueña) inserta, cambia ni borra directo
//    (42501), anon no lee nada, y gym_alerts, gym_invites, gym_codes y gym_turnos no los lee nadie.
// b) Funciones: vinculo_gym, gym_active y gym_operativo (bordes de 5 y 10 días, cerrado, sin dueño),
//    coach_active, gym_reads_member (con sus variantes), coach_client_ok, recount_seats, gym_mi_rol,
//    gym_soy_socio, y quién puede llamar a cada una.
// c) Tablas de hoy vía is_my_client: quién lee, cambia y borra los registros de quién, y las
//    variantes (plan del gimnasio vencido, plan propio del profe vencido, gimnasio sobre el cupo); el
//    chat: la dueña no lee el de un profe con su socio y la recepción no lee ninguno.
// d) join_coach, fila por fila (código del gimnasio → solicitud con P0001 sin raise, socio con profe,
//    código del profe sin plan propio, cupo del gimnasio, equipo, tope de pedidos…).
// e) Casos obligatorios de §6.12 que entran en la etapa 0 (2, 3, 4, 5, 6 a medias, 7, 8, 9, 10 a
//    medias, 11, 12, 13, 14 a medias, 16 en SQL y 19), con los invariantes I1 a I5 después de cada
//    operación (I1: seats_used = recount_seats).
//    También: la ficha en baja (con el profe de antes, y después de desvincularse) no la ve el profe;
//    la solicitud de quien borra su cuenta se borra; quien solo pidió sumarse no lee el gimnasio ni
//    puede preguntar por el plan de nadie (coach_active es del service role).
// f) Concurrencia: dos join_coach a la vez por el último lugar (de un coach independiente y de la
//    dueña), dos pedidos a la vez con el código del gimnasio de la misma persona, dos alumnos que se
//    desvinculan a la vez (y un join_coach con un desvínculo): el cupo queda exacto; y el cron de los
//    planes vencidos con un alumno que se desvincula a la misma hora no se trancan.
import { conPg } from './pg.mjs';

const ID = n => 'a0000000-0000-4000-8000-' + n.padStart(12, '0');
const P = { dA: ID('d1'), aA: ID('a1'), pA1: ID('b1'), rA: ID('c1'), A1: ID('11'), A2: ID('12'), A3: ID('13'), A5: ID('15'),
  A6: ID('16'), A7: ID('17'), D1: ID('21'), P1: ID('22'), dB: ID('d2'), B1: ID('32'), C: ID('e1'), C1: ID('42'), N: ID('51'), N2: ID('52') };
const F = { A1: ID('f11'), A2: ID('f12'), A3: ID('f13'), A4: ID('f14'), A5: ID('f15'), A6: ID('f16'), A7: ID('f17'), B1: ID('f32') };
const G = { A: ID('aaaa'), B: ID('bbbb') };
const NOMBRE = {};
for (const [k, v] of Object.entries(P)) NOMBRE[v] = k;
for (const [k, v] of Object.entries(F)) NOMBRE[v] = k;
for (const [k, v] of Object.entries(G)) NOMBRE[v] = k;
const nom = v => v === null || v === undefined ? null : (NOMBRE[v] || v);
const noms = a => Array.isArray(a) ? a.map(nom).sort() : a;
const CODIGO = { dA: 'DUENAFZA', pA1: 'PROFEMAR', dB: 'DUENANRT', C: 'COACHEXT' };
const CLIENTES = ['A1', 'A2', 'A3', 'A5', 'A6', 'A7', 'D1', 'P1', 'B1', 'C1', 'N', 'N2'];
const q = s => s.replace(/'/g, "''");
// Para comparar objetos sin que importe el orden de las claves (jsonb las ordena a su manera).
const canon = v => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
const pasos = ps => '$j$' + JSON.stringify(ps.map(([quien, sql]) => ({ quien: P[quien] || quien, q: sql }))) + '$j$::jsonb';

const DATOS = `
insert into auth.users (id, email, raw_user_meta_data) values
  ('${P.dA}', 'duena.a@ejemplo.test', '{"full_name":"Dueña Fuerza","role":"coach"}'),
  ('${P.aA}', 'encargado.a@ejemplo.test', '{"full_name":"Encargado Fuerza"}'),
  ('${P.pA1}', 'profe.a@ejemplo.test', '{"full_name":"Profe Martina","role":"coach"}'),
  ('${P.rA}', 'recepcion.a@ejemplo.test', '{"full_name":"Recepción Fuerza"}'),
  ('${P.dB}', 'dueno.b@ejemplo.test', '{"full_name":"Dueño Norte","role":"coach"}'),
  ('${P.C}', 'coach.c@ejemplo.test', '{"full_name":"Coach Online","role":"coach"}'),
  ${CLIENTES.map(c => `('${P[c]}', '${c.toLowerCase()}@ejemplo.test', '{"full_name":"Persona ${c}"}')`).join(',\n  ')};
insert into prueba.nombres (id, nombre) values ${Object.entries(P).map(([k, v]) => `('${v}', '${k}')`).join(', ')};
update public.profiles set invite_code = c.code from (values ${Object.entries(CODIGO).map(([k, v]) => `('${P[k]}'::uuid, '${v}')`).join(', ')}) c(id, code) where profiles.id = c.id;
update public.coach_billing set plan = 'p100', max_clients = 100, trial_ends_at = now() - interval '30 days', paid_until = now() + interval '20 days'
 where coach_id in ('${P.dA}', '${P.dB}');
update public.coach_billing set plan = 'p10', max_clients = 10, trial_ends_at = now() - interval '30 days', paid_until = now() + interval '20 days'
 where coach_id in ('${P.pA1}', '${P.C}');
insert into public.gyms (id, name, slug, owner_id, city, dpa_version, dpa_at) values
  ('${G.A}', 'Gimnasio Fuerza', 'gimnasio-fuerza', '${P.dA}', 'Rosario', 'v1', now()),
  ('${G.B}', 'Gimnasio Norte', 'gimnasio-norte', '${P.dB}', 'Rosario', 'v1', now());
insert into public.gym_staff (gym_id, user_id, role) values
  ('${G.A}', '${P.dA}', 'owner'), ('${G.A}', '${P.aA}', 'admin'), ('${G.A}', '${P.pA1}', 'profe'), ('${G.A}', '${P.rA}', 'recepcion'),
  ('${G.B}', '${P.dB}', 'owner');
insert into public.gym_codes (code, gym_id) values ('FUERZA22', '${G.A}'), ('NRTE2345', '${G.B}');
update public.profiles set coach_id = '${P.pA1}' where id in ('${P.A1}', '${P.A2}', '${P.P1}');
update public.profiles set coach_id = '${P.dA}' where id in ('${P.A7}', '${P.D1}');
update public.profiles set coach_id = '${P.dB}' where id = '${P.B1}';
update public.profiles set coach_id = '${P.C}' where id = '${P.C1}';
insert into public.gym_members (id, gym_id, member_id, full_name, dni, status, trainer_id, terms_at, terms_version, share_admin, share_admin_at,
                                source, requested_at, visita_hasta, visita_tipo) values
  ('${F.A1}', '${G.A}', '${P.A1}', 'Socia Uno', '30111222', 'activo', '${P.pA1}', now(), 'v1', true, now(), 'codigo', now() - interval '60 days', null, null),
  ('${F.A2}', '${G.A}', '${P.A2}', 'Socio Dos', null, 'activo', '${P.pA1}', now(), 'v1', false, null, 'codigo', now() - interval '60 days', null, null),
  ('${F.A3}', '${G.A}', '${P.A3}', 'Socia Tres', null, 'activo', null, now(), 'v1', false, null, 'codigo', now() - interval '60 days', null, null),
  ('${F.A4}', '${G.A}', null, 'Socio Sin App', '30999888', 'activo', null, null, null, false, null, 'ficha', null, null, null),
  ('${F.A5}', '${G.A}', '${P.A5}', 'Visita Cinco', null, 'visita', null, now(), 'v1', true, now(), 'visita', null, current_date + 7, 'pase_diario'),
  ('${F.A6}', '${G.A}', '${P.A6}', 'Solicitud Seis', null, 'pendiente', null, now(), 'v1', true, now(), 'codigo', now() - interval '2 days', null, null),
  ('${F.A7}', '${G.A}', '${P.A7}', 'Socio Siete', null, 'activo', '${P.dA}', null, null, false, null, 'conversion', null, null, null),
  ('${F.B1}', '${G.B}', '${P.B1}', 'Socia Norte', null, 'activo', '${P.dB}', now(), 'v1', true, now(), 'codigo', now() - interval '60 days', null, null);
insert into public.gym_member_notes (gym_member_id, body) values ('${F.A1}', 'Rodilla operada'), ('${F.A3}', 'Viene a la mañana');
insert into public.gym_entries (gym_id, gym_member_id, method, result) values
  ('${G.A}', '${F.A1}', 'manual', 'ok'), ('${G.A}', '${F.A2}', 'manual', 'ok'), ('${G.A}', '${F.A4}', 'manual', 'ok'),
  ('${G.A}', '${F.A5}', 'manual', 'visita'), ('${G.B}', '${F.B1}', 'manual', 'ok');
insert into public.gym_bajas (gym_id, gym_member_id, via) values ('${G.A}', '${F.A2}', 'app');
insert into public.gym_audit (gym_id, actor_id, action) values ('${G.A}', '${P.dA}', 'alta'), ('${G.B}', '${P.dB}', 'alta');
insert into public.gym_alerts (gym_id, recipient, kind, key, channel) values ('${G.A}', 'u:${P.dA}', 'resumen', 'hoy', 'resumen');
insert into public.gym_invites (gym_id, role, token_hash, expires_at) values ('${G.A}', 'profe', '\\x0102', now() + interval '7 days');
insert into public.gym_turnos (gym_id) values ('${G.A}');
-- Registros de cada uno (una fila por tabla) y algunos mensajes.
insert into public.sessions (id, client_id, performed_on, day_name) select md5('sesion:' || u)::uuid, u, current_date, 'A' from unnest(array[${CLIENTES.map(c => `'${P[c]}'::uuid`).join(',')}]) u;
insert into public.session_entries (session_id, client_id, exercise_name, set_order, kg, reps) select md5('sesion:' || u)::uuid, u, 'Sentadilla', 1, 50, 10 from public.profiles p(u) where u = any(array[${CLIENTES.map(c => `'${P[c]}'::uuid`).join(',')}]);
insert into public.body_weights (client_id, measured_on, kg) select id, current_date, 70 from public.profiles where role = 'client';
insert into public.daily_logs (client_id, log_date, steps) select id, current_date, 8000 from public.profiles where role = 'client';
insert into public.checkins (client_id, week_start) select id, current_date from public.profiles where role = 'client';
insert into public.food_entries (client_id, log_date, name) select id, current_date, 'Avena' from public.profiles where role = 'client';
insert into public.client_info (client_id, objective) select id, 'Fuerza' from public.profiles where role = 'client';
insert into public.blocks (client_id, name) select id, 'Bloque' from public.profiles where role = 'client';
insert into public.nutrition (client_id, kcal) select id, 2000 from public.profiles where role = 'client';
insert into public.routines (client_id, days) select id, '[]' from public.profiles where role = 'client';
insert into public.client_prefs (client_id) select id from public.profiles where role = 'client';
insert into public.routine_schedule (client_id, starts_on) select id, current_date + 7 from public.profiles where role = 'client';
insert into public.cardio_outings (id, client_id, mode, performed_on, started_at, duration_s)
select md5('salida:' || id)::uuid, id, 'pie', current_date, now(), 600 from public.profiles where role = 'client';
insert into public.coach_messages (coach_id, client_id, body, sender) values
  ('${P.pA1}', '${P.A1}', 'Hola, ¿cómo te fue?', 'coach'), ('${P.pA1}', '${P.A1}', 'Bien', 'client'),
  ('${P.dA}', '${P.A7}', 'Hola', 'coach'), ('${P.dA}', '${P.D1}', 'Hola', 'coach'), ('${P.C}', '${P.C1}', 'Hola', 'coach');
select prueba.invariantes();
`;

// Lectura de las tablas nuevas como cada persona: ids visibles (o el error).
const LEER = {
  gyms: 'id', gym_staff: 'user_id', gym_members: 'id', gym_member_notes: 'gym_member_id', gym_audit: 'gym_id',
  gym_bajas: 'gym_member_id', gym_entries: 'gym_member_id', gym_alerts: 'gym_id', gym_invites: 'gym_id', gym_codes: 'gym_id',
  gym_turnos: 'gym_id', coach_billing: 'coach_id' };
const sqlLeer = tb => `select coalesce(jsonb_agg(${LEER[tb]}), '[]') from public.${tb}`;
const ESCRIBIR = {
  gyms: ["insert into public.gyms (name, dpa_version, dpa_at) values ('Otro', 'v1', now())", 'update public.gyms set name = name', 'delete from public.gyms'],
  gym_staff: [`insert into public.gym_staff (gym_id, user_id, role) values ('${G.A}', auth.uid(), 'admin')`, "update public.gym_staff set role = 'owner'", 'delete from public.gym_staff'],
  gym_invites: [`insert into public.gym_invites (gym_id, role, token_hash, expires_at) values ('${G.A}', 'profe', '\\x01', now())`, 'update public.gym_invites set role = role', 'delete from public.gym_invites'],
  gym_codes: [`insert into public.gym_codes (code, gym_id) values ('ZZZZ2345', '${G.A}')`, 'update public.gym_codes set revoked_at = now()', 'delete from public.gym_codes'],
  gym_members: [`insert into public.gym_members (gym_id, member_id, full_name, status) values ('${G.A}', auth.uid(), 'Yo', 'activo')`, "update public.gym_members set share_admin = true", 'delete from public.gym_members'],
  gym_member_notes: [`insert into public.gym_member_notes (gym_member_id, body) values ('${F.A2}', 'x')`, "update public.gym_member_notes set body = 'x'", 'delete from public.gym_member_notes'],
  gym_audit: [`insert into public.gym_audit (gym_id, action) values ('${G.A}', 'x')`, "update public.gym_audit set action = 'x'", 'delete from public.gym_audit'],
  gym_alerts: [`insert into public.gym_alerts (gym_id, recipient, kind, key, channel) values ('${G.A}', 'u:${P.N}', 'x', 'y', 'push')`, 'update public.gym_alerts set sent_at = now()', 'delete from public.gym_alerts'],
  gym_bajas: [`insert into public.gym_bajas (gym_id, gym_member_id, via) values ('${G.A}', '${F.A1}', 'app')`, "update public.gym_bajas set estado = 'x'", 'delete from public.gym_bajas'],
  gym_entries: [`insert into public.gym_entries (gym_id, gym_member_id, method, result) values ('${G.A}', '${F.A1}', 'manual', 'ok')`, 'update public.gym_entries set flag = flag', 'delete from public.gym_entries'],
  gym_turnos: [`insert into public.gym_turnos (gym_id) values ('${G.A}')`, 'update public.gym_turnos set closed_at = now()', 'delete from public.gym_turnos'] };
const conCuenta = s => `with x as (${s} returning 1) select to_jsonb(count(*)) from x`;

// Tablas del coach con is_my_client (una fila por alumno).
const TABLAS = ['body_weights', 'checkins', 'client_prefs', 'daily_logs', 'food_entries', 'sessions', 'session_entries',
  'client_info', 'blocks', 'nutrition', 'routines', 'routine_schedule', 'cardio_outings'];

const VENCE = (quien, hace) => `update public.coach_billing set trial_ends_at = now() - interval '60 days', paid_until = now() - interval '${hace}' where coach_id = '${P[quien]}'`;

export default async function ({ t }){
  const h = await conPg(t);
  if (!h) return;
  const db = await h.nueva('gize_con');
  const inv0 = await db.json(DATOS);
  t.eq(inv0, [], 'las personas cargadas cumplen los invariantes I1 a I5');
  const J = sql => db.json(sql);
  // Corre pasos (persona, sql) y deshace; devuelve el resultado de cada paso, sin envoltorio.
  const V = async ps => (await J(`select prueba.varios(${pasos(ps)});`)).map(r => ('error' in r) ? { error: r.error, msg: r.msg } : r.ok);
  const PROBAR = async (quien, sql) => { const r = await J(`select prueba.probar(${quien === 'anon' || quien === 'servicio' ? "'" + quien + "'" : "'" + P[quien] + "'"}, '${q(sql)}');`); return ('error' in r) ? { error: r.error } : r.ok; };
  const HACER = async (quien, sql) => { const r = await J(`select prueba.hacer(${quien === 'postgres' ? "'postgres'" : "'" + P[quien] + "'"}, '${q(sql)}');`); return ('error' in r) ? { error: r.error, msg: r.msg } : { ok: r.ok, status: r.status }; };
  const INV = async () => J('select prueba.invariantes();');

  // ===== a) Tablas nuevas: lectura =====
  const PERSONAS = ['dA', 'aA', 'pA1', 'rA', 'A1', 'A2', 'A3', 'A5', 'A6', 'A7', 'dB', 'B1', 'C', 'C1', 'D1', 'P1', 'N'];
  const lect = await J(`select jsonb_object_agg(quien, (select jsonb_object_agg(tb, prueba.probar(quien, 'select coalesce(jsonb_agg(' || col || '), ''[]'') from public.' || tb))
      from (values ${Object.entries(LEER).map(([tb, col]) => `('${tb}', '${col}')`).join(', ')}) x(tb, col)))
    from unnest(array[${PERSONAS.map(p => `'${P[p]}'`).join(', ')}, 'anon']) quien;`);
  const vis = (p, tb) => { const r = lect[p === 'anon' ? 'anon' : P[p]][tb]; return ('error' in r) ? r.error : noms(r.ok); };
  const staffA = ['aA', 'dA', 'pA1', 'rA'], fichasA = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7'];
  const ESPERA = {
    dA: { gyms: ['A'], gym_staff: staffA, gym_members: fichasA, gym_member_notes: ['A1', 'A3'], gym_audit: ['A'], gym_bajas: ['A2'], gym_entries: ['A1', 'A2', 'A4', 'A5'], coach_billing: ['dA'] },
    aA: { gyms: ['A'], gym_staff: staffA, gym_members: fichasA, gym_member_notes: ['A1', 'A3'], gym_audit: ['A'], gym_bajas: ['A2'], gym_entries: ['A1', 'A2', 'A4', 'A5'], coach_billing: [] },
    pA1: { gyms: ['A'], gym_staff: staffA, gym_members: ['A1', 'A2'], gym_member_notes: ['A1'], gym_audit: [], gym_bajas: [], gym_entries: ['A1', 'A2'], coach_billing: ['pA1'] },
    rA: { gyms: ['A'], gym_staff: staffA, gym_members: [], gym_member_notes: [], gym_audit: [], gym_bajas: [], gym_entries: [], coach_billing: [] },
    dB: { gyms: ['B'], gym_staff: ['dB'], gym_members: ['B1'], gym_member_notes: [], gym_audit: ['B'], gym_bajas: [], gym_entries: ['B1'], coach_billing: ['dB'] },
    B1: { gyms: ['B'], gym_staff: [], gym_members: ['B1'], gym_member_notes: [], gym_audit: [], gym_bajas: [], gym_entries: ['B1'], coach_billing: [] } };
  // A6 solo pidió sumarse (con el código, que es público): no lee el gimnasio (dueño, plan) hasta que la aprueben.
  for (const s of ['A1', 'A2', 'A3', 'A5', 'A6', 'A7'])
    ESPERA[s] = { gyms: s === 'A6' ? [] : ['A'], gym_staff: [], gym_members: [s], gym_member_notes: [], gym_audit: [], gym_bajas: s === 'A2' ? ['A2'] : [],
      gym_entries: ['A1', 'A2', 'A5'].includes(s) ? [s] : [], coach_billing: [] };
  for (const s of ['C', 'C1', 'D1', 'P1', 'N'])
    ESPERA[s] = { gyms: [], gym_staff: [], gym_members: [], gym_member_notes: [], gym_audit: [], gym_bajas: [], gym_entries: [], coach_billing: s === 'C' ? ['C'] : [] };
  for (const p of PERSONAS){
    for (const [tb, esp] of Object.entries(ESPERA[p])) t.eq(vis(p, tb), esp, p + ' lee de ' + tb);
    for (const tb of ['gym_alerts', 'gym_invites', 'gym_codes', 'gym_turnos']) t.eq(vis(p, tb), '42501', p + ' no puede leer ' + tb);
  }
  for (const tb of Object.keys(LEER).filter(x => x !== 'coach_billing')) t.eq(vis('anon', tb), '42501', 'anon no puede leer ' + tb);

  // ===== a) Tablas nuevas: escribir y borrar =====
  const esc = await J(`select jsonb_object_agg(quien || ' ' || tb || ' ' || o, prueba.probar(quien, sentencia)->>'error')
    from unnest(array[${['dA', 'aA', 'pA1', 'rA', 'A1', 'B1', 'C', 'N'].map(p => `'${P[p]}'`).join(', ')}, 'anon']) quien,
    (values ${Object.entries(ESCRIBIR).flatMap(([tb, ops]) => ops.map((s, i) => `('${tb}', ${i}, '${q(conCuenta(s))}')`)).join(', ')}) x(tb, o, sentencia);`);
  const noPueden = Object.entries(esc).filter(([, e]) => e !== '42501').map(([k, e]) => k.replace(/^[0-9a-f-]{36}/, m => nom(m)) + ' → ' + e);
  t.eq(noPueden, [], 'nadie (ni la dueña ni anon) inserta, cambia ni borra directo en las tablas nuevas: todo da 42501');
  t.eq(Object.keys(esc).length, 9 * 11 * 3, 'probado: 9 personas (con anon) × 11 tablas × insertar, cambiar y borrar');
  const asiento = await V([['dA', conCuenta('update public.coach_billing set seats_used = 0')], ['postgres', `select to_jsonb(seats_used) from public.coach_billing where coach_id = '${P.dA}'`]]);
  t.ok((asiento[0].error === '42501' || asiento[0] === 0) && asiento[1] === 6, 'la dueña no puede cambiar su seats_used (como el resto de coach_billing): ' + JSON.stringify(asiento));

  // ===== b) Funciones =====
  const fn = await J(`select jsonb_build_object(
    'vinculo', (select jsonb_object_agg(p, prueba.probar('servicio', format('select to_jsonb(public.vinculo_gym(%L))', p))->'ok')
                  from unnest(array[${Object.values(P).map(v => `'${v}'`).join(', ')}]) p),
    'recount', (select jsonb_object_agg(p, prueba.probar('servicio', format('select to_jsonb(public.recount_seats(%L))', p))->'ok')
                  from unnest(array['${P.dA}', '${P.pA1}', '${P.C}', '${P.dB}']) p),
    'rol', (select jsonb_object_agg(p, prueba.probar(p, $q$select to_jsonb(public.gym_mi_rol('${G.A}'))$q$)->'ok') from unnest(array[${PERSONAS.map(p => `'${P[p]}'`).join(', ')}]) p),
    'socio', (select jsonb_object_agg(p, prueba.probar(p, $q$select to_jsonb(public.gym_soy_socio('${G.A}'))$q$)->'ok') from unnest(array[${PERSONAS.map(p => `'${P[p]}'`).join(', ')}]) p),
    'activo', (select jsonb_object_agg(p, prueba.probar('servicio', format('select to_jsonb(public.coach_active(%L))', p))->'ok')
                 from unnest(array['${P.dA}', '${P.pA1}', '${P.C}', '${P.dB}']) p));`);
  const mapa = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [nom(k), typeof v === 'string' ? nom(v) : v]).sort());
  t.eq(mapa(fn.vinculo), mapa(Object.fromEntries(Object.values(P).map(v => [v, null]).concat([[P.A1, G.A], [P.A2, G.A], [P.A7, G.A], [P.B1, G.B]]))),
    'vinculo_gym: A1, A2 y A7 con A, B1 con B; el resto (A3 sin profe, A5 visita, A6 pendiente, P1, D1, C1, N) sin gimnasio');
  t.eq(mapa(fn.recount), { C: 1, dA: 6, dB: 1, pA1: 1 }, 'recount_seats: dA = fichas A1, A2, A3, A4, A7 + D1; pA1 = P1; C = C1; dB = B1');
  t.eq(mapa(fn.rol), mapa(Object.fromEntries(PERSONAS.map(p => [P[p], { dA: 'owner', aA: 'admin', pA1: 'profe', rA: 'recepcion' }[p] || null]))), 'gym_mi_rol(A) de cada uno');
  t.eq(mapa(fn.socio), mapa(Object.fromEntries(PERSONAS.map(p => [P[p], ['A1', 'A2', 'A3', 'A5', 'A7'].includes(p)]))), 'gym_soy_socio(A): A1, A2, A3, A5 (visita) y A7; A6 (solicitud) no');
  t.eq(mapa(fn.activo), { C: true, dA: true, dB: true, pA1: true }, 'coach_active: dA (plan del gimnasio), pA1 (plan propio), C y dB');

  // gym_active / gym_operativo en los bordes, y coach_active de la dueña.
  const borde = async (cambio, sql) => { const cs = [].concat(cambio); return (await V([...cs.map(c => ['postgres', c]), ['servicio', sql]]))[cs.length]; };
  const ga = `select to_jsonb(array[public.gym_active('${G.A}'), public.gym_operativo('${G.A}'), public.coach_active('${P.dA}')])`;
  t.eq(await borde('select 1', ga), [true, true, true], 'gimnasio al día: activo, operativo, dueña activa');
  t.eq(await borde(VENCE('dA', '4 days 23 hours'), ga), [true, true, true], 'vencido hace 4 días y 23 horas: sigue activo (gracia)');
  t.eq(await borde(VENCE('dA', '5 days 1 hour'), ga), [false, true, false], 'a los 5 días y 1 hora: deja de estar activo, sigue lo operativo');
  t.eq(await borde(VENCE('dA', '9 days 23 hours'), ga), [false, true, false], 'a los 9 días y 23 horas: sigue lo operativo');
  t.eq(await borde(VENCE('dA', '10 days 1 hour'), ga), [false, false, false], 'a los 10 días y 1 hora: nada');
  t.eq(await borde([`update public.coach_billing set plan = 'cortesia' where coach_id = '${P.dA}'`, VENCE('dA', '90 days')], ga), [true, true, true], 'con cortesía no vence');
  t.eq(await borde(`update public.gyms set closed_at = now(), close_reason = 'dueño' where id = '${G.A}'`, ga), [false, false, true], 'gimnasio cerrado: ni activo ni operativo (la dueña vuelve a ser coach común)');
  t.eq(await borde(`update public.gyms set owner_id = null where id = '${G.A}'`, ga), [false, false, true], 'gimnasio sin dueño: ni activo ni operativo');
  t.eq(await borde(`update public.coach_billing set max_clients = 3 where coach_id = '${P.dA}'`, ga), [true, true, true], 'gimnasio sobre el cupo (6 de 3): sigue activo (solo se frenan las altas)');
  t.eq(await borde(`update public.coach_billing set max_clients = 0 where coach_id = '${P.C}'`, `select to_jsonb(public.coach_active('${P.C}'))`), false,
    'un coach independiente sobre el cupo queda sin plan, como hoy');

  // gym_reads_member: quién (columna) puede leer a quién (fila) como dueño o administración.
  const LEEN = ['dA', 'aA', 'pA1', 'rA', 'dB', 'C', 'A1', 'N'], DE = ['A1', 'A2', 'A3', 'A5', 'A6', 'A7', 'B1', 'D1', 'P1', 'C1'];
  const grm = async (cambio = 'select 1') => J(`select jsonb_object_agg(l, (select jsonb_agg(x order by o) from (select o, (prueba.varios(jsonb_build_array(
      jsonb_build_object('quien', 'postgres', 'q', ${"'" + q(cambio) + "'"}),
      jsonb_build_object('quien', l, 'q', format('select to_jsonb(public.gym_reads_member(%L))', d))))->1->'ok')::boolean as x
      from unnest(array[${DE.map(d => `'${P[d]}'`).join(', ')}]) with ordinality y(d, o)) z))
    from unnest(array[${LEEN.map(l => `'${P[l]}'`).join(', ')}]) l;`);
  const quienLee = r => Object.fromEntries(LEEN.map(l => [l, DE.filter((d, i) => r[P[l]][i])]));
  const BASE_GRM = { dA: ['A1'], aA: ['A1'], pA1: [], rA: [], dB: ['B1'], C: [], A1: [], N: [] };
  t.eq(quienLee(await grm()), BASE_GRM, 'gym_reads_member: dueña y encargado solo leen a A1 (compartió, aceptó la hoja); dB solo a B1; nadie más (ni A5 ni A6, que compartieron)');
  t.eq(quienLee(await grm(`update public.gym_members set share_admin = false where id = '${F.A1}'`)), Object.assign({}, BASE_GRM, { dA: [], aA: [] }), 'A1 apaga «compartir»: dejan de leerla en la consulta siguiente');
  t.eq(quienLee(await grm(`update public.gym_members set terms_at = null where id = '${F.A1}'`)), Object.assign({}, BASE_GRM, { dA: [], aA: [] }), 'sin la hoja aceptada no se lee');
  t.eq(quienLee(await grm(VENCE('dA', '5 days 1 hour'))), Object.assign({}, BASE_GRM, { dA: [], aA: [] }), 'plan del gimnasio vencido hace más de 5 días: no se lee');
  t.eq(quienLee(await grm(`update public.gym_staff set left_at = now() where user_id = '${P.aA}'`)), Object.assign({}, BASE_GRM, { aA: [] }), 'el encargado que se fue deja de leer');

  // coach_client_ok (service role): el chequeo de los mensajes y avisos de la etapa 1.
  const SI = [['pA1', 'A1'], ['pA1', 'A2'], ['pA1', 'P1'], ['dA', 'A7'], ['dA', 'D1'], ['dB', 'B1'], ['C', 'C1']];
  const NO = [['dA', 'A1'], ['aA', 'A1'], ['pA1', 'A3'], ['C', 'A1'], ['rA', 'A1'], ['dA', 'B1'], ['pA1', 'A5'], ['dA', 'A6']];
  const cco = await J(`select jsonb_agg(prueba.probar('servicio', format('select to_jsonb(public.coach_client_ok(%L, %L))', a, b))->'ok' order by o)
    from unnest(array[${[...SI, ...NO].map(([a]) => `'${P[a]}'`).join(',')}], array[${[...SI, ...NO].map(([, b]) => `'${P[b]}'`).join(',')}]) with ordinality x(a, b, o);`);
  t.eq(cco, [...SI.map(() => true), ...NO.map(() => false)], 'coach_client_ok: ' + JSON.stringify([...SI, ...NO].map((p, i) => p.join('→') + '=' + cco[i])));

  // Quién puede llamar a cada función.
  const INTERNAS = ['gym_role(uuid, uuid)', 'vinculo_gym(uuid)', 'gym_de_dueno(uuid)', 'gym_active(uuid)', 'gym_operativo(uuid)', 'recount_seats(uuid)',
    'seats_drift()', 'gym_recontar(uuid[])', 'coach_client_ok(uuid, uuid)', 'release_lapsed_clients()', 'gym_cupo_profiles()', 'gym_cupo_members()',
    'gym_cupo_staff()', 'gym_cupo_gyms()', 'coach_billing_cupo()', 'gym_codes_unico()', 'gym_profe_ficha(uuid, uuid, text)', 'gym_members_profe()',
    'gym_members_pedido_sin_cuenta()', 'profiles_gym_sync()', 'coach_active(uuid)'];
  const APP = ['gym_mi_rol(uuid)', 'gym_soy_socio(uuid)', 'gym_reads_member(uuid)', 'is_my_client(uuid)', 'join_coach(text)'];
  const permisos = await J(`select jsonb_object_agg(f, jsonb_build_array(has_function_privilege('anon', ('public.' || f)::regprocedure, 'execute'),
      has_function_privilege('authenticated', ('public.' || f)::regprocedure, 'execute'), has_function_privilege('service_role', ('public.' || f)::regprocedure, 'execute')))
    from unnest(array[${[...INTERNAS, ...APP].map(f => `'${f}'`).join(', ')}]) f;`);
  for (const f of INTERNAS) t.eq(permisos[f], [false, false, true], f + ': interna (ni anon ni authenticated; sí el service role)');
  for (const f of APP) t.eq(permisos[f], [f === 'is_my_client(uuid)', true, true], f + ': la app con sesión' + (f === 'is_my_client(uuid)' ? ' (y anon, como hoy)' : ''));
  t.eq(await PROBAR('N', `select to_jsonb(public.vinculo_gym('${P.A1}'))`), { error: '42501' }, 'llamarla desde la app da 42501');
  // Quien pidió sumarse con el código del gimnasio (público) no averigua el plan de la dueña ni el
  // de nadie del equipo: no lee el gimnasio y coach_active es del service role.
  const curioso = await V([['N', `select public.join_coach('FUERZA22')::jsonb`],
    ['N', 'select coalesce(jsonb_agg(jsonb_build_object(\'gym\', name, \'owner\', owner_id, \'lapsed\', lapsed_at)), \'[]\') from public.gyms'],
    ['N', `select to_jsonb(public.coach_active('${P.dA}'))`], ['rA', `select to_jsonb(public.coach_active('${P.pA1}'))`],
    ['servicio', `select to_jsonb(public.coach_active('${P.dA}'))`]]);
  t.eq(curioso, [{ code: 'P0001', message: 'Listo: le pediste a Gimnasio Fuerza que te sume. Cuando te acepten vas a ver a tu profe acá.' }, [],
    { error: '42501', msg: 'permission denied for function coach_active' }, { error: '42501', msg: 'permission denied for function coach_active' }, true],
    'con la solicitud recién hecha no lee el gimnasio; ni ella ni la recepción pueden llamar a coach_active; el service role sí');

  // ===== c) Tablas de hoy vía is_my_client =====
  const LECTORES = ['dA', 'aA', 'pA1', 'rA', 'dB', 'C', 'A1', 'N'], DUENOS = ['A1', 'A2', 'A3', 'A5', 'A6', 'A7', 'B1', 'P1', 'D1', 'C1'];
  // Por cada (quién lee, de quién): en cuántas de las 13 tablas ve su fila, cuántas cambia y cuántas borra.
  const imc = async (cambio = 'select 1') => J(`select jsonb_object_agg(l || ' ' || d, (prueba.varios(jsonb_build_array(
      jsonb_build_object('quien', 'postgres', 'q', ${"'" + q(cambio) + "'"}),
      jsonb_build_object('quien', l, 'q', format($f$with
          u1 as (update public.client_info set objective = objective where client_id = %1$L returning 1),
          u2 as (update public.nutrition set notes = notes where client_id = %1$L returning 1),
          u3 as (update public.routines set days = days where client_id = %1$L returning 1),
          d1 as (delete from public.routine_schedule where client_id = %1$L returning 1),
          d2 as (delete from public.blocks where client_id = %1$L returning 1)
        select jsonb_build_array(${TABLAS.map(tb => `(select count(*) from public.${tb} where client_id = %1$L)`).join(' + ')},
          (select count(*) from u1) + (select count(*) from u2) + (select count(*) from u3), (select count(*) from d1) + (select count(*) from d2))$f$, d))))->1->'ok'))
    from unnest(array[${LECTORES.map(l => `'${P[l]}'`).join(', ')}]) l, unnest(array[${DUENOS.map(d => `'${P[d]}'`).join(', ')}]) d;`);
  const tabla = r => Object.fromEntries(LECTORES.map(l => [l, DUENOS.filter(d => { const v = r[P[l] + ' ' + P[d]]; return v && v[0] > 0; })]));
  const BASE_IMC = { dA: ['A7', 'D1'], aA: [], pA1: ['A1', 'A2', 'P1'], rA: [], dB: ['B1'], C: ['C1'], A1: ['A1'], N: [] };
  const r0 = await imc();
  t.eq(tabla(r0), BASE_IMC, 'is_my_client: quién lee los registros de quién (la dueña lee a A7 y D1, no a A1 aunque compartió: eso llega en la etapa 1)');
  const completos = Object.entries(r0).filter(([k, v]) => { const [l, d] = k.split(' '); return l !== d && v[0] > 0; });
  t.eq(completos.filter(([, v]) => JSON.stringify(v) !== '[13,3,2]').map(([k, v]) => k.split(' ').map(nom).join('→') + ' ' + JSON.stringify(v)), [],
    'donde lee, lee las 13 tablas, cambia ficha, plan de nutrición y rutina, y borra bloque y rutina programada');
  t.eq(Object.entries(r0).filter(([k, v]) => { const [l, d] = k.split(' '); return l !== d && (v[0] === 0) && (v[1] > 0 || v[2] > 0); }).map(([k]) => k), [],
    'donde no lee, tampoco cambia ni borra');
  t.eq(tabla(await imc(VENCE('dA', '5 days 1 hour'))), Object.assign({}, BASE_IMC, { dA: [], pA1: ['P1'] }), 'gimnasio vencido hace 5 días y 1 hora: pA1 deja de leer a A1 y A2 (sigue con P1, su plan); la dueña deja de leer a A7 y D1');
  t.eq(tabla(await imc(VENCE('dA', '4 days 23 hours'))), BASE_IMC, 'vencido hace 4 días y 23 horas: igual que al día');
  t.eq(tabla(await imc(VENCE('pA1', '1 hour'))), Object.assign({}, BASE_IMC, { pA1: ['A1', 'A2'] }), 'plan propio de pA1 vencido: deja de leer a P1 y sigue con A1 y A2 (plan del gimnasio)');
  t.eq(tabla(await imc(`update public.coach_billing set max_clients = 3 where coach_id = '${P.dA}'`)), BASE_IMC, 'gimnasio sobre el cupo: todo sigue igual');
  const chat = await J(`select jsonb_object_agg(l, prueba.probar(l, 'select coalesce(jsonb_agg(jsonb_build_array(coach_id, client_id)), ''[]'') from public.coach_messages')->'ok')
    from unnest(array['${P.dA}', '${P.rA}', '${P.aA}', '${P.pA1}']) l;`);
  t.eq(chat[P.dA].map(x => x.map(nom).join('→')).sort(), ['dA→A7', 'dA→D1'], 'la dueña lee solo sus conversaciones, no la de pA1 con A1');
  t.eq([chat[P.rA], chat[P.aA]], [[], []], 'recepción y encargado no leen ningún chat');
  t.eq(chat[P.pA1].length, 2, 'pA1 lee la suya con A1');
  t.eq(await PROBAR('rA', 'select to_jsonb(count(*)) from public.sessions'), 0, 'caso 3: la recepción no lee ninguna sesión');
  t.eq(await PROBAR('dA', `select to_jsonb(array[(select count(*) from public.daily_logs where client_id = '${P.A1}'), (select count(*) from public.cardio_outings where client_id = '${P.A1}')])`),
    [0, 0], 'caso 6 (lo de la etapa 0): la dueña no recibe ni registros diarios (pasos) ni salidas (recorrido) de A1');

  // ===== d) join_coach, fila por fila =====
  const jc = (quien, codigo) => `select public.join_coach('${codigo}')::jsonb`;
  const listo = 'Listo: le pediste a Gimnasio Fuerza que te sume. Cuando te acepten vas a ver a tu profe acá.';
  const estado = who => `select jsonb_build_object('coach', (select coach_id from public.profiles where id = '${P[who]}'),
      'ficha', (select jsonb_build_object('gym', gym_id, 'status', status, 'trainer', trainer_id, 'source', source, 'terms', terms_at is not null, 'share', share_admin)
                  from public.gym_members where member_id = '${P[who]}' and status <> 'baja'),
      'intentos', (select count(*) from public.join_code_attempts where user_id = '${P[who]}'),
      'cupos', (select jsonb_object_agg(coach_id, seats_used) from public.coach_billing where coach_id in ('${P.dA}', '${P.pA1}', '${P.C}', '${P.dB}')),
      'fichasA', (select count(*) from public.gym_members where gym_id = '${G.A}'),
      'inv', prueba.invariantes())`;
  const caso = async (quien, codigo, antes = 'select 1') => {
    const [, r, e] = await V([['postgres', antes], [quien, jc(quien, codigo)], ['postgres', estado(quien)]]);
    if (e && e.cupos) e.cupos = mapa(e.cupos);
    if (e && e.ficha) { e.ficha.gym = nom(e.ficha.gym); e.ficha.trainer = nom(e.ficha.trainer); }
    if (e) e.coach = nom(e.coach);
    return { r, e };
  };
  const CUPOS = { C: 1, dA: 6, dB: 1, pA1: 1 };
  let x;
  x = await caso('A1', CODIGO.C);
  t.eq(x.r, { error: 'P0001', msg: 'Ya tenés profe en Gimnasio Fuerza. Para cambiar, primero dejá a tu profe en Ajustes → Tu gimnasio.' }, 'caso 9: A1, con profe, pone el código de C: rechazado');
  t.eq([x.e.coach, x.e.intentos], ['pA1', 0], 'sin cambios y sin intento anotado');
  x = await caso('A1', CODIGO.pA1);
  t.eq(x.r, true, 'A1 pone el código de su profe: true (ya era su coach)');
  x = await caso('A3', CODIGO.pA1);
  t.eq([x.r, x.e.coach, x.e.ficha.trainer, x.e.cupos, x.e.inv], [true, 'pA1', 'pA1', CUPOS, []], 'socio sin profe pone el código de un profe de su gimnasio: queda con ese profe (C = T = pA1) y ningún cupo cambia');
  x = await caso('A3', CODIGO.pA1, VENCE('dA', '5 days 1 hour'));
  t.eq(x.r, { error: 'P0001', msg: 'Por ahora el gimnasio no puede asignarte profe. Consultá en recepción.' }, 'con el gimnasio vencido hace más de 5 días, no');
  x = await caso('A3', CODIGO.dA);
  t.eq([x.r, x.e.coach, x.e.ficha.trainer, x.e.cupos], [true, 'dA', 'dA', CUPOS], 'socio sin profe pone el código de la dueña: la dueña es su profe, sin cambiar el cupo');
  x = await caso('A6', 'FUERZA22');
  t.eq(x.r, { ok: { code: 'P0001', message: listo }, status: '400' }.ok, 'A6 (pendiente en A) vuelve a poner el código del gimnasio: el mismo «Listo»');
  t.eq(x.e.fichasA, 7, 'sin ficha nueva');
  x = await caso('A1', 'FUERZA22');
  t.eq(x.r, { error: 'P0001', msg: 'Ya sos socio de Gimnasio Fuerza.' }, 'A1 pone el código de su gimnasio');
  x = await caso('B1', 'fuerza22');
  t.eq(x.r, { error: 'P0001', msg: 'Ya sos socio de Gimnasio Norte: primero salí desde Ajustes.' }, 'B1 pone el código de A (un gimnasio por persona)');
  x = await caso('A6', 'NRTE2345');
  t.eq(x.r, { error: 'P0001', msg: 'Ya pediste sumarte a Gimnasio Fuerza: primero cancelá el pedido desde Ajustes.' }, 'A6 (pendiente en A) pone el código de B');
  for (const p of ['P1', 'C1', 'N']){
    const r = await V([[p, `select jsonb_build_object('r', public.join_coach(' fuerza22 ')::jsonb, 'status', current_setting('response.status', true))`], ['postgres', estado(p)]]);
    const e = r[1];
    t.eq(r[0], { r: { code: 'P0001', message: listo }, status: '400' }, p + ' pone el código del gimnasio: solicitud, con status 400 y el cuerpo de un error P0001 (sin raise)');
    t.eq([nom(e.coach), e.ficha && nom(e.ficha.gym), e.ficha && e.ficha.status, e.ficha && e.ficha.source, e.ficha && e.ficha.terms, e.ficha && e.ficha.share, e.intentos, mapa(e.cupos), e.inv],
      [{ P1: 'pA1', C1: 'C', N: null }[p], 'A', 'pendiente', 'codigo', false, false, 0, CUPOS, []],
      p + ': ficha pendiente, sin la hoja ni compartir, su coach no cambia, no cuenta en ningún cupo y no es un intento equivocado');
  }
  const treinta = `insert into public.gym_members (gym_id, full_name, status, source, requested_at) select '${G.A}', 'Pedido ' || g, 'pendiente', 'codigo', now() - interval '1 hour' from generate_series(1, 30) g`;
  x = await caso('N', 'FUERZA22', treinta);
  t.eq(x.r, { error: 'P0001', msg: 'Gimnasio Fuerza recibió muchos pedidos hoy. Probá de nuevo mañana.' }, 'el pedido 31 en 24 horas: frenado');
  t.eq(x.e.fichasA, 37, 'sin ficha nueva');
  x = await caso('N', 'FUERZA22', treinta.replace("interval '1 hour'", "interval '25 hours'"));
  t.eq(x.r, { code: 'P0001', message: listo }, 'pedidos de hace más de 24 horas no cuentan para el tope');
  x = await caso('N', CODIGO.pA1);
  t.eq([x.r, x.e.coach, x.e.cupos.pA1], [true, 'pA1', 2], 'N pone el código de pA1 (con plan propio): alumno propio de pA1, que suma 1');
  x = await caso('N', CODIGO.pA1, VENCE('pA1', '1 hour'));
  t.eq(x.r, { error: 'P0001', msg: 'Ese código es de un profe de Gimnasio Fuerza. Para sumarte al gimnasio, pedí en recepción el código del gimnasio.' }, 'el profe sin plan propio vigente: que pida el código del gimnasio');
  x = await caso('N', CODIGO.dA);
  t.eq([x.r, x.e.coach, x.e.cupos.dA], [true, 'dA', 7], 'N pone el código de la dueña: alumno propio, cuenta en el plan del gimnasio');
  x = await caso('N', CODIGO.dA, `update public.coach_billing set max_clients = 6 where coach_id = '${P.dA}'`);
  t.eq(x.r, { error: 'P0001', msg: 'Tu coach llegó al máximo de alumnos: por ahora no puede sumar más. Avisale y volvé a intentar.' }, 'con el gimnasio lleno: el mensaje del cupo de hoy');
  for (const p of ['rA', 'aA']){
    x = await caso(p, CODIGO.C);
    t.eq(x.r, { error: 'P0001', msg: 'Las cuentas del equipo de un gimnasio no se pueden vincular con un código.' }, p + ' (equipo) no se vincula con un código');
    x = await caso(p, 'FUERZA22');
    t.eq(x.r.error, 'P0001', p + ' tampoco pide sumarse al gimnasio');
  }
  for (const p of ['pA1', 'dA', 'C']) t.eq((await caso(p, 'FUERZA22')).r, false, p + ' (coach): false, como hoy');
  x = await caso('N', 'FUERZA22', `update public.gym_codes set revoked_at = now() where code = 'FUERZA22'`);
  t.eq([x.r, x.e.intentos], [false, 1], 'código del gimnasio revocado: false y queda anotado como intento');
  x = await caso('N', 'FUERZA22', `update public.gyms set closed_at = now(), close_reason = 'dueño' where id = '${G.A}'`);
  t.eq([x.r, x.e.intentos], [false, 1], 'de un gimnasio cerrado: false y anotado');
  t.eq(await PROBAR('anon', `select public.join_coach('FUERZA22')::jsonb`), { error: '42501' }, 'anon no puede');

  // ===== e) Casos que cambian el estado (quedan) =====
  // Caso 8: A3, socia sin profe, pone el código de C: coach de afuera (vínculo propio, plan y cupo de C).
  let r = await HACER('A3', jc('A3', CODIGO.C));
  t.eq(r.ok, true, 'caso 8: A3 pone el código de C (coach de afuera)');
  t.eq(await INV(), [], 'invariantes después del caso 8');
  let est = await J(`select jsonb_build_object('t', (select trainer_id from public.gym_members where id = '${F.A3}'),
      'v', prueba.probar('servicio', $q$select to_jsonb(public.vinculo_gym('${P.A3}'))$q$)->'ok',
      'rc', (select jsonb_object_agg(coach_id, seats_used) from public.coach_billing where coach_id in ('${P.dA}', '${P.pA1}', '${P.C}', '${P.dB}')))`);
  t.eq([est.t, est.v, mapa(est.rc)], [null, null, { C: 2, dA: 6, dB: 1, pA1: 1 }], 'A3: T = null, vínculo propio con C (C cuenta 2; la ficha sigue contando en A: dA = 6)');
  t.eq(tabla(await imc()).C, ['A3', 'C1'], 'C lee a A3 (y a C1)');
  // Caso 7: C1, alumna de C, se hace socia de A sin profe.
  r = await HACER('C1', jc('C1', 'FUERZA22'));
  t.eq([r.ok, r.status], [{ code: 'P0001', message: listo }, '400'], 'caso 7: C1 pide sumarse a A con el código');
  await HACER('postgres', `with x as (update public.gym_members set status = 'activo', terms_at = now(), terms_version = 'v1' where member_id = '${P.C1}' returning 1) select to_jsonb(count(*)) from x`);
  t.eq(await INV(), [], 'invariantes después de aprobarla (sin profe)');
  est = await J(`select jsonb_build_object('rc', (select jsonb_object_agg(coach_id, seats_used) from public.coach_billing where coach_id in ('${P.dA}', '${P.C}')),
      'ok', prueba.probar('servicio', $q$select to_jsonb(public.coach_client_ok('${P.C}', '${P.C1}'))$q$)->'ok')`);
  t.eq([mapa(est.rc), est.ok], [{ C: 2, dA: 7 }, true], 'C1 cuenta en el plan de C y en A (su ficha): dA = 7, C = 2; C le sigue pudiendo escribir (coach_client_ok)');
  const c7 = (await imc())[P.C + ' ' + P.C1];
  t.eq(c7, [13, 3, 2], 'C sigue leyendo, editando y borrando lo de C1');
  t.eq(await PROBAR('C', `with x as (update public.routines set days = days where client_id = '${P.C1}' returning 1) select to_jsonb(count(*)) from x`), 1, 'y le cambia la rutina');
  t.eq(await PROBAR('dA', `select to_jsonb(public.gym_reads_member('${P.C1}'))`), false, 'la dueña no la lee (no compartió)');

  // Caso 11: la solicitud pendiente y la visita no cuentan (ver recount_seats) ni dan datos (ver la tabla de is_my_client).
  const t11 = tabla(await imc());
  t.eq(Object.entries(t11).filter(([, ds]) => ds.includes('A5') || ds.includes('A6')).map(([l]) => l), [], 'caso 11: los registros de A5 (visita) y A6 (pendiente) no los lee nadie');
  // Caso 12: sobre el cupo se frenan solo las altas.
  const sobre = `update public.coach_billing set max_clients = 3 where coach_id = '${P.dA}'`;
  const c12 = await V([['postgres', sobre],
    ['dA', `with x as (update public.routines set days = days where client_id = '${P.A7}' returning 1) select to_jsonb(count(*)) from x`],
    ['pA1', `select to_jsonb(count(*)) from public.sessions where client_id = '${P.A1}'`],
    ['N', jc('N', CODIGO.dA)], ['N2', jc('N2', 'FUERZA22')], ['A2', jc('A2', CODIGO.dA)]]);
  t.eq(c12.slice(1, 3), [1, 1], 'caso 12: sobre el cupo, la dueña sigue escribiendo y el profe leyendo');
  t.eq(c12[3].error, 'P0001', 'pero nadie nuevo se vincula a la dueña');
  t.eq(c12[4], { code: 'P0001', message: listo }, 'el pedido con el código del gimnasio entra (espera)');
  t.eq(c12[5].error, 'P0001', 'A2 (con profe) no cambia');
  // Caso 13: gracia (bordes en b); release_lapsed_clients no suelta vínculos del gimnasio ni a los alumnos de la dueña.
  const c13 = await V([['postgres', VENCE('dA', '30 days')], ['postgres', VENCE('pA1', '30 days')], ['postgres', 'select to_jsonb(public.release_lapsed_clients())'],
    ['postgres', `select jsonb_object_agg(id, coach_id) from public.profiles where id in ('${P.A1}', '${P.A2}', '${P.P1}', '${P.A7}', '${P.D1}')`],
    ['postgres', 'select prueba.invariantes()']]);
  t.eq([c13[2], mapa(c13[3]), c13[4]], [1, { A1: 'pA1', A2: 'pA1', A7: 'dA', D1: 'dA', P1: null }, []],
    'caso 13: con los dos planes vencidos hace 30 días, release_lapsed_clients suelta solo a P1 (alumno propio de pA1); A1 y A2 (del gimnasio) y los de la dueña siguen');

  // Transiciones: desvincularse, el profe saca al socio, bloquear (C = T = null por el sync).
  for (const [que, pasoSql, quien] of [
    ['A1 se desvincula en Ajustes', `with x as (update public.profiles set coach_id = null where id = auth.uid() returning 1) select to_jsonb(count(*)) from x`, 'A1'],
    ['pA1 saca a A2', `select to_jsonb(public.coach_remove_client('${P.A2}'))`, 'pA1'],
    ['A1 bloquea a su profe', `select public.block_user('chat')`, 'A1']]){
    const socio = quien === 'pA1' ? 'A2' : 'A1';
    const rr = await V([[quien, pasoSql], ['postgres', `select jsonb_build_array((select coach_id from public.profiles where id = '${P[socio]}'),
        (select trainer_id from public.gym_members where member_id = '${P[socio]}' and status <> 'baja'), prueba.invariantes())`],
      ['pA1', `select jsonb_build_array((select count(*) from public.gym_members where member_id = '${P[socio]}'), public.is_my_client('${P[socio]}'))`]]);
    t.eq([rr[1], rr[2]], [[null, null, []], [0, false]], que + ': queda socio sin profe (C = T = null) y pA1 deja de ver su ficha y sus registros');
  }
  // Caso 10 (a medias): el profe que se fue, con sus socios reasignados a nadie, no ve más nada.
  const c10 = await V([['postgres', `update public.profiles set coach_id = null where coach_id = '${P.pA1}' and id in ('${P.A1}', '${P.A2}')`],
    ['postgres', `update public.gym_staff set left_at = now() where user_id = '${P.pA1}'`],
    ['pA1', `select jsonb_build_array((select count(*) from public.gym_members), public.is_my_client('${P.A1}'), (select count(*) from public.gym_staff))`],
    ['postgres', 'select prueba.invariantes()']]);
  t.eq([c10[2], c10[3]], [[0, false, 1], []], 'caso 10: el profe que se fue (y cuyos socios quedaron sin profe) no ve fichas ni registros; solo su fila del equipo');
  // La trampa C20: si se va sin que le reasignen los socios, el vínculo pasa a ser propio y los sigue leyendo con su plan
  // (lo evita gym_quitar_staff en la etapa 1, que reasigna en la misma operación). Queda a la vista en I2.
  const c20 = await V([['postgres', `update public.gym_staff set left_at = now() where user_id = '${P.pA1}'`],
    ['pA1', `select to_jsonb(public.is_my_client('${P.A1}'))`], ['postgres', 'select prueba.invariantes()'],
    ['postgres', `select to_jsonb(seats_used) from public.coach_billing where coach_id = '${P.pA1}'`]]);
  t.eq(c20[1], true, 'trampa C20: el profe que se fue sin reasignar sigue leyendo a A1 con su plan propio (requisito de la etapa 1)');
  t.ok(c20[2].some(v => v.startsWith('I2')), 'y el invariante I2 lo marca: ' + JSON.stringify(c20[2]));
  t.eq([c20[2].filter(v => !v.startsWith('I2')), c20[3]], [[], 3], 'al irse se recalculó su cupo (I1): A1 y A2 pasan a contar como alumnos propios, con P1');

  // Caso 14 (a medias): borrar la cuenta de cada uno no falla y el estado queda coherente.
  const BORRAR = async quien => (await V([['postgres', `update public.gyms set default_trainer_id = '${P.pA1}' where id = '${G.A}'`],
    [quien, 'select to_jsonb(true) from (select public.delete_own_account()) x'],
    ['postgres', `select jsonb_build_object('gym', (select jsonb_build_object('owner', owner_id, 'cerrado', closed_at is not null, 'profe', default_trainer_id) from public.gyms where id = '${G.A}'),
        'staff', (select jsonb_agg(user_id) from public.gym_staff where gym_id = '${G.A}'),
        'fichas', (select jsonb_object_agg(id, jsonb_build_array(member_id, status, trainer_id)) from public.gym_members where gym_id = '${G.A}' and id in ('${F.A1}', '${F.A2}', '${F.A7}')),
        'coaches', (select jsonb_object_agg(id, coach_id) from public.profiles where id in ('${P.A1}', '${P.A2}', '${P.A7}', '${P.D1}', '${P.P1}')),
        'inv', prueba.invariantes())`]]));
  const nn = o => o && canon(Object.fromEntries(Object.entries(o).map(([k, v]) => [nom(k), Array.isArray(v) ? v.map(nom) : nom(v)])));
  let b = await BORRAR('dA');
  t.eq(b[1], true, 'caso 14: la dueña borra su cuenta (no falla)');
  t.eq([nn(b[2].gym), b[2].staff.map(nom).sort(), nn(b[2].fichas), nn(b[2].coaches), b[2].inv],
    [canon({ owner: null, cerrado: false, profe: 'pA1' }), ['aA', 'pA1', 'rA'], { A1: ['A1', 'activo', 'pA1'], A2: ['A2', 'activo', 'pA1'], A7: ['A7', 'activo', null] },
      { A1: 'pA1', A2: 'pA1', A7: null, D1: null, P1: 'pA1' }, []],
    'sin dueña: el gimnasio queda sin dueño (cerrarlo es de la etapa 1), A7 y D1 sin coach, A7 sin profe en la ficha');
  b = await BORRAR('pA1');
  t.eq([b[1], nn(b[2].gym), b[2].staff.map(nom).sort(), nn(b[2].fichas), nn(b[2].coaches), b[2].inv],
    [true, canon({ owner: 'dA', cerrado: false, profe: null }), ['aA', 'dA', 'rA'], { A1: ['A1', 'activo', null], A2: ['A2', 'activo', null], A7: ['A7', 'activo', 'dA'] },
      { A1: null, A2: null, A7: 'dA', D1: 'dA', P1: null }, []],
    'el profe (y profe por defecto) borra su cuenta: sus socios quedan sin profe, P1 sin coach, el gimnasio sin profe por defecto');
  b = await BORRAR('rA');
  t.eq([b[1], b[2].staff.map(nom).sort(), b[2].inv], [true, ['aA', 'dA', 'pA1'], []], 'la recepción borra su cuenta');
  b = await BORRAR('A1');
  t.eq([b[1], nn(b[2].fichas).A1, b[2].inv], [true, [null, 'activo', null], []], 'la socia borra su cuenta: la ficha queda «sin app», con su estado (y sigue contando)');
  t.eq(await INV(), [], 'nada de eso quedó (se deshizo) y los invariantes siguen');

  // La ficha en baja no la ve el profe (DNI, nota interna, ingresos): §6.13, «el gimnasio deja de ver
  // sus datos al instante», también si la persona sigue con su profe como alumna propia (C = pA1).
  const verA1 = ['pA1', `select jsonb_build_array((select count(*) from public.gym_members where id = '${F.A1}'),
      (select count(*) from public.gym_member_notes where gym_member_id = '${F.A1}'), (select count(*) from public.gym_entries where gym_member_id = '${F.A1}'),
      public.is_my_client('${P.A1}'))`];
  const fichaA1 = ['postgres', `select jsonb_build_array((select coach_id from public.profiles where id = '${P.A1}'), (select trainer_id from public.gym_members where id = '${F.A1}'),
      (select status from public.gym_members where id = '${F.A1}'), prueba.invariantes())`];
  const bajaA1 = `update public.gym_members set status = 'baja', left_at = now() where id = '${F.A1}'`;
  const nomF = r => [nom(r[0]), nom(r[1]), r[2], r[3]];
  let bj = await V([verA1, ['postgres', bajaA1], fichaA1, verA1]);
  t.eq(bj[0], [1, 1, 1, true], 'antes: pA1 ve la ficha de A1, su nota y su ingreso');
  t.eq([nomF(bj[2]), bj[3]], [['pA1', null, 'baja', []], [0, 0, 0, true]],
    'A1 se da de baja y sigue con pA1 como alumna propia (C = pA1): la ficha queda sin profe y pA1 deja de ver ficha, nota e ingresos (sus registros los sigue leyendo, con su plan)');
  bj = await V([['postgres', bajaA1], ['A1', 'with x as (update public.profiles set coach_id = null where id = auth.uid() returning 1) select to_jsonb(count(*)) from x'], fichaA1, verA1]);
  t.eq([nomF(bj[2]), bj[3]], [[null, null, 'baja', []], [0, 0, 0, false]], 'y si después se desvincula en Ajustes: C = T = null y pA1 no ve nada');
  // Aunque una ficha en baja quedara con el profe de antes (sin el trigger), la política no se la muestra.
  bj = await V([['postgres', 'alter table public.gym_members disable trigger gym_members_profe'],
    ['postgres', `update public.gym_members set status = 'baja', left_at = now(), trainer_id = '${P.pA1}' where id = '${F.A1}'`],
    ['postgres', 'alter table public.gym_members enable trigger gym_members_profe'],
    ['A1', 'with x as (update public.profiles set coach_id = null where id = auth.uid() returning 1) select to_jsonb(count(*)) from x'], fichaA1, verA1]);
  t.eq([nomF(bj[4]), bj[5]], [[null, null, 'baja', []], [0, 0, 0, false]], 'una ficha en baja con C = T = pA1 (estado que puede dejar una RPC): al desvincularse, profiles_gym_sync le saca el profe');
  bj = await V([['postgres', 'alter table public.gym_members disable trigger gym_members_profe'],
    ['postgres', `update public.gym_members set status = 'baja', left_at = now(), trainer_id = '${P.pA1}' where id = '${F.A1}'`],
    ['postgres', 'alter table public.gym_members enable trigger gym_members_profe'], fichaA1, verA1]);
  t.eq([nomF(bj[3]).slice(0, 3), bj[3][3].some(v => /^I2 ficha baja de A1 con profe pA1/.test(v)), bj[4]], [['pA1', 'pA1', 'baja'], true, [0, 0, 0, true]],
    'y mientras tanto: I2 lo marca y la política del profe (solo fichas activas o pausadas) no le muestra ficha, nota ni ingresos');
  bj = await V([['postgres', bajaA1], ['postgres', `update public.gym_members set status = 'activo', left_at = null where id = '${F.A1}'`], fichaA1, verA1]);
  t.eq([nomF(bj[2]), bj[3]], [['pA1', 'pA1', 'activo', []], [1, 1, 1, true]], 'la vuelta (baja → activo) con C = pA1: pA1 vuelve a ser su profe en la ficha');
  bj = await V([['postgres', `update public.profiles set coach_id = '${P.pA1}' where id = '${P.A5}'`],
    ['postgres', `select to_jsonb(trainer_id) from public.gym_members where id = '${F.A5}'`], ['pA1', `select to_jsonb(count(*)) from public.gym_members where id = '${F.A5}'`],
    ['postgres', `update public.gym_members set status = 'activo', visita_hasta = null, visita_tipo = null where id = '${F.A5}'`],
    ['postgres', `select to_jsonb(trainer_id) from public.gym_members where id = '${F.A5}'`], ['postgres', 'select prueba.invariantes()']]);
  t.eq([bj[1], bj[2], nom(bj[4]), bj[5]], [null, 0, 'pA1', []], 'una visita con C = pA1 no tiene profe en la ficha ni la ve pA1; al hacerla socia, sí');

  // La solicitud de quien borra su cuenta se borra: tenía su nombre y su mail, copiados por join_coach.
  const pedido = await V([['N', `select public.join_coach('FUERZA22')::jsonb`],
    ['dA', `select to_jsonb(count(*)) from public.gym_members where status = 'pendiente' and email = 'n@ejemplo.test'`],
    ['N', 'select to_jsonb(true) from (select public.delete_own_account()) x'],
    ['postgres', `select jsonb_build_array((select count(*) from auth.users where id = '${P.N}'),
        (select count(*) from public.gym_members where email = 'n@ejemplo.test' or member_id = '${P.N}'), prueba.invariantes())`],
    ['dA', `select to_jsonb(count(*)) from public.gym_members where status = 'pendiente' and member_id is null`],
    ['aA', `select to_jsonb(count(*)) from public.gym_members where status = 'pendiente' and member_id is null`],
    ['postgres', `select to_jsonb(count(*)) from public.gym_audit where action = 'solicitud' and target_user = '${P.N}'`]]);
  t.eq(pedido.slice(1), [1, true, [0, 0, []], 0, 0, 1],
    'N pide sumarse (la dueña ve su pedido con el mail), borra su cuenta: el pedido se borra entero; la dueña y el encargado ven 0 pedidos sin cuenta (en gym_audit quedan solo uuids)');

  // Caso 16 en SQL: la solicitud queda después del commit, con status 400 y el cuerpo P0001.
  const c16 = await db.json(`begin;
    set local role authenticated;
    select set_config('request.jwt.claims', '{"sub":"${P.N2}","role":"authenticated"}', true);
    select json_build_object('r', public.join_coach('FUERZA22'), 'status', current_setting('response.status', true));
    commit;`);
  const fila = await J(`select jsonb_build_object('n', count(*), 'status', min(status), 'source', min(source)) from public.gym_members where member_id = '${P.N2}';`);
  t.eq(canon([c16, fila]), canon([{ r: { code: 'P0001', message: listo }, status: '400' }, { n: 1, status: 'pendiente', source: 'codigo' }]),
    'caso 16: join_coach con el código del gimnasio guarda la solicitud (queda después del commit) y responde 400 con el cuerpo P0001');
  t.eq(await INV(), [], 'invariantes después del caso 16');

  // ===== f) Concurrencia =====
  const aLaVez = (quien, codigo) => db.json(`begin;
    set local role authenticated;
    select set_config('request.jwt.claims', '{"sub":"${quien}","role":"authenticated"}', true);
    select json_build_object('r', public.join_coach('${codigo}')) from (select pg_sleep(0.05)) x;
    select pg_sleep(0.4);
    commit;`).catch(e => ({ error: e.code, msg: e.msg }));
  const nuevos = ['N3', 'N4', 'N5', 'N6', 'N7'].map((n, i) => ID('6' + i));
  await db.sql(`insert into auth.users (id, email, raw_user_meta_data) values ${nuevos.map((u, i) => `('${u}', 'nueva${i}@ejemplo.test', '{"full_name":"Nueva ${i}"}')`).join(', ')};`);
  // a) El último lugar de C (independiente).
  await db.sql(`update public.coach_billing set max_clients = seats_used + 1 where coach_id = '${P.C}';`);
  const antesC = await J(`select to_jsonb(seats_used) from public.coach_billing where coach_id = '${P.C}';`);
  const [c1, c2] = await Promise.all([aLaVez(nuevos[0], CODIGO.C), aLaVez(nuevos[1], CODIGO.C)]);
  const unidos = await J(`select to_jsonb(count(*)) from public.profiles where id in ('${nuevos[0]}', '${nuevos[1]}') and coach_id = '${P.C}';`);
  t.eq([unidos, [c1, c2].filter(x => x.error === 'P0001' && /máximo/.test(x.msg)).length, await J(`select to_jsonb(seats_used) from public.coach_billing where coach_id = '${P.C}';`)],
    [1, 1, antesC + 1], 'dos a la vez por el último lugar de un coach independiente: entra uno y el otro recibe el mensaje del cupo: ' + JSON.stringify([c1, c2]));
  // b) El último lugar del gimnasio (alumnos propios de la dueña).
  await db.sql(`update public.coach_billing set max_clients = seats_used + 1 where coach_id = '${P.dA}';`);
  const [d1, d2] = await Promise.all([aLaVez(nuevos[2], CODIGO.dA), aLaVez(nuevos[3], CODIGO.dA)]);
  const unidosA = await J(`select to_jsonb(count(*)) from public.profiles where id in ('${nuevos[2]}', '${nuevos[3]}') and coach_id = '${P.dA}';`);
  t.eq([unidosA, [d1, d2].filter(x => x.error === 'P0001' && /máximo/.test(x.msg)).length], [1, 1], 'y por el último lugar del gimnasio (la dueña): entra uno: ' + JSON.stringify([d1, d2]));
  // c) La misma persona pide dos veces a la vez con el código del gimnasio: una sola ficha.
  const [e1, e2] = await Promise.all([aLaVez(nuevos[4], 'FUERZA22'), aLaVez(nuevos[4], 'FUERZA22')]);
  t.eq(await J(`select to_jsonb(count(*)) from public.gym_members where member_id = '${nuevos[4]}';`), 1, 'dos pedidos a la vez de la misma persona: una sola ficha: ' + JSON.stringify([e1, e2]));
  t.eq(await INV(), [], 'invariantes después de lo concurrente (seats_drift vacío)');

  // d) Dos alumnos de un coach sobre el cupo (12 de 10) se desvinculan a la vez en Ajustes: el cupo
  //    queda exacto (10) y el coach vuelve a tener acceso. (Contando en la misma sentencia que esperaba
  //    el bloqueo, quedaba en 11 y el coach seguía sin ver a ninguno.)
  const K = ID('e7'), KS = Array.from({ length: 12 }, (_, i) => ID('7' + String(i).padStart(2, '0')));
  await db.sql(`insert into auth.users (id, email, raw_user_meta_data) values ('${K}', 'coach.k@ejemplo.test', '{"full_name":"Coach K","role":"coach"}'),
      ${KS.map((u, i) => `('${u}', 'k${i}@ejemplo.test', '{"full_name":"Alumno K${i}"}')`).join(', ')};
    update public.coach_billing set plan = 'p10', max_clients = 10, trial_ends_at = now() - interval '30 days', paid_until = now() + interval '20 days' where coach_id = '${K}';
    update public.profiles set coach_id = '${K}' where id in (${KS.map(u => `'${u}'`).join(', ')});`);
  const cupoK = () => J(`select jsonb_build_array((select seats_used from public.coach_billing where coach_id = '${K}'), (select count(*) from public.profiles where coach_id = '${K}'),
      prueba.probar('servicio', $q$select to_jsonb(public.coach_active('${K}'))$q$)->'ok', prueba.probar('${K}', $q$select to_jsonb(count(*)) from public.sessions$q$)->'ok');`);
  await db.sql(`insert into public.sessions (id, client_id, performed_on, day_name) select md5('k:' || u)::uuid, u, current_date, 'A' from unnest(array[${KS.map(u => `'${u}'::uuid`).join(',')}]) u;`);
  t.eq(await cupoK(), [12, 12, false, 0], 'el coach K, 12 alumnos con cupo de 10: sin acceso, como hoy');
  const salir = (quien, antes, despues) => db.json(`select pg_sleep(${antes});
    begin;
    set local role authenticated;
    select set_config('request.jwt.claims', '{"sub":"${quien}","role":"authenticated"}', true);
    update public.profiles set coach_id = null where id = '${quien}';
    select pg_sleep(${despues});
    commit;
    select to_jsonb(true);`).catch(e => ({ error: e.code, msg: e.msg }));
  const dos = await Promise.all([salir(KS[0], 0, 0.8), salir(KS[1], 0.3, 0)]);
  t.eq(dos, [true, true], 'los dos se desvinculan');
  t.eq(await cupoK(), [10, 10, true, 10], 'quedan 10: seats_used 10 (exacto), el coach vuelve a tener acceso y ve a sus 10 alumnos');
  t.eq(await INV(), [], 'invariantes (seats_drift vacío) después de los dos desvínculos a la vez');
  // join_coach (con el bloqueo tomado) y otro alumno que se desvincula mientras tanto.
  const entra = (quien, codigo, despues) => db.json(`begin;
    set local role authenticated;
    select set_config('request.jwt.claims', '{"sub":"${quien}","role":"authenticated"}', true);
    select public.join_coach('${codigo}')::jsonb;
    select pg_sleep(${despues});
    commit;`).catch(e => ({ error: e.code, msg: e.msg }));
  await db.sql(`update public.profiles set invite_code = 'COACHKKK' where id = '${K}'; update public.coach_billing set max_clients = 11 where coach_id = '${K}';`);
  const mixto = await Promise.all([entra(KS[0], 'COACHKKK', 0.8), salir(KS[2], 0.3, 0)]);
  t.eq(mixto, [true, true], 'uno entra con el código mientras otro se desvincula');
  t.eq((await cupoK()).slice(0, 3), [10, 10, true], 'el cupo queda exacto (10: entró uno y salió otro)');
  t.eq(await INV(), [], 'invariantes después del join_coach y el desvínculo a la vez');

  // e) El cron de los planes vencidos y un alumno que se desvincula a la misma hora, con otro perfil
  //    tomado por una tercera sesión: no se trancan (antes, release_lapsed_clients bloqueaba primero
  //    coach_billing y el alumno primero su perfil: deadlock 40P01).
  const V2 = ID('e8'), VS = [ID('801'), ID('802'), ID('803')];
  await db.sql(`insert into auth.users (id, email, raw_user_meta_data) values ('${V2}', 'coach.v@ejemplo.test', '{"full_name":"Coach V","role":"coach"}'),
      ${VS.map((u, i) => `('${u}', 'v${i}@ejemplo.test', '{"full_name":"Alumno V${i}"}')`).join(', ')};
    update public.coach_billing set plan = 'p10', max_clients = 10, trial_ends_at = now() - interval '40 days', paid_until = now() - interval '10 days' where coach_id = '${V2}';
    update public.profiles set coach_id = '${V2}' where id in (${VS.map(u => `'${u}'`).join(', ')});`);
  const tres = await Promise.all([
    db.json(`begin; update public.profiles set full_name = full_name where id = '${VS[0]}'; select pg_sleep(1.2); commit; select to_jsonb(true);`).catch(e => ({ error: e.code, msg: e.msg })),
    db.json(`select pg_sleep(0.3); select to_jsonb(public.release_lapsed_clients());`).catch(e => ({ error: e.code, msg: e.msg })),
    salir(VS[2], 0.6, 0)]);
  t.ok(tres[0] === true && typeof tres[1] === 'number' && tres[1] >= 2 && tres[2] === true,
    'el cron (release_lapsed_clients) y el alumno que se desvincula terminan los dos, sin deadlock: ' + JSON.stringify(tres));
  t.eq(await J(`select to_jsonb(count(*)) from public.profiles where coach_id = '${V2}';`), 0, 'los tres quedan sin el coach vencido');
  t.eq(await INV(), [], 'invariantes (seats_drift vacío) después del cron y el desvínculo a la vez');
  await db.borrar();
}
