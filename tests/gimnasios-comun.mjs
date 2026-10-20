// Gimnasios, etapa 1: las personas de prueba y las ayudas que comparten las pruebas con Postgres de
// la etapa 1 (tests/gimnasios-{rpc,lectura,estados,plan,borrar,chat,foto,solicitudes}.test.mjs). No es
// un *.test.mjs: lo importan. Todos los nombres, mails y DNI son inventados.
//
// Gimnasio A «Gimnasio Fuerza» (Rosario, plan p100 al día): dueña dA (coach, también profe de A7 y con
// un alumno propio D1), encargado aA (cuenta común), profes pA1 (Martina, coach con plan propio p10 y
// un alumno propio P1) y pA2 (Lucas, coach solo de prueba, sin alumnos propios), recepción rA.
// Socios de A: A1 (con pA1, aceptó la hoja y compartió), A2 (con pA1, no compartió), A3 (sin profe),
// A4 (ficha sin app, con DNI y mail), A5 (visita), A6 (solicitud pendiente), A7 (con la dueña, sin la
// hoja: «falta confirmación»). Gimnasio B «Gimnasio Norte»: dueño dB, socia B1. Coach independiente C
// con su alumna C1; coach K sin gimnasio ni alumnos (para invitar); cuentas nuevas N, N2, N3.
import { lit } from './pg.mjs';

export const ID = n => 'a0000000-0000-4000-8000-' + n.padStart(12, '0');
export const P = { dA: ID('d1'), aA: ID('a1'), pA1: ID('b1'), pA2: ID('b2'), rA: ID('c1'), A1: ID('11'), A2: ID('12'), A3: ID('13'), A5: ID('15'),
  A6: ID('16'), A7: ID('17'), D1: ID('21'), P1: ID('22'), dB: ID('d2'), B1: ID('32'), C: ID('e1'), C1: ID('42'), K: ID('e2'),
  N: ID('51'), N2: ID('52'), N3: ID('53') };
export const F = { A1: ID('f11'), A2: ID('f12'), A3: ID('f13'), A4: ID('f14'), A5: ID('f15'), A6: ID('f16'), A7: ID('f17'), B1: ID('f32') };
export const G = { A: ID('aaaa'), B: ID('bbbb') };
export const VER = '2026-10-borrador';
export const CODIGO = { dA: 'DUENAFZA', pA1: 'PROFEMAR', pA2: 'PROFELUC', dB: 'DUENANRT', C: 'COACHEXT', K: 'COACHKAY' };
export const NOMBRE = {};
for (const [k, v] of Object.entries(P)) NOMBRE[v] = k;
for (const [k, v] of Object.entries(F)) NOMBRE[v] = k;
for (const [k, v] of Object.entries(G)) NOMBRE[v] = k;
export const nom = v => v === null || v === undefined ? v : (NOMBRE[v] || v);
export const noms = a => Array.isArray(a) ? a.map(nom).sort() : a;
export const q = s => s.replace(/'/g, "''");
export const canon = v => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
const CLIENTES = ['A1', 'A2', 'A3', 'A5', 'A6', 'A7', 'D1', 'P1', 'B1', 'C1', 'N', 'N2', 'N3'];
const NOMBRES = { A1: 'Martina Sosa', A2: 'Juan Pérez', A3: 'Lucía Gómez', A5: 'Pedro Díaz', A6: 'Sofía Romero', A7: 'Diego Ruiz',
  D1: 'Carla Méndez', P1: 'Tomás Herrera', B1: 'Valeria Ríos', C1: 'Ana Torres', N: 'Nora Vidal', N2: 'Bruno Castro', N3: 'Elena Paz' };

// Los datos de la matriz: se cargan en una base nueva (h.nueva('gize_con')) y dejan los invariantes en orden.
export const DATOS = `
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('${P.dA}', 'duena.a@ejemplo.test', now(), '{"full_name":"Laura Fuerza","role":"coach"}'),
  ('${P.aA}', 'encargado.a@ejemplo.test', now(), '{"full_name":"Marcos Encargado"}'),
  ('${P.pA1}', 'profe.a@ejemplo.test', now(), '{"full_name":"Martina Profe","role":"coach"}'),
  ('${P.pA2}', 'profe.b@ejemplo.test', now(), '{"full_name":"Lucas Profe","role":"coach"}'),
  ('${P.rA}', 'recepcion.a@ejemplo.test', now(), '{"full_name":"Rocío Recepción"}'),
  ('${P.dB}', 'dueno.b@ejemplo.test', now(), '{"full_name":"Hugo Norte","role":"coach"}'),
  ('${P.C}', 'coach.c@ejemplo.test', now(), '{"full_name":"Carlos Online","role":"coach"}'),
  ('${P.K}', 'coach.k@ejemplo.test', now(), '{"full_name":"Karina Coach","role":"coach"}'),
  ${CLIENTES.map(c => `('${P[c]}', '${c.toLowerCase()}@ejemplo.test', ${c === 'N3' ? 'null' : 'now()'}, '{"full_name":"${NOMBRES[c]}"}')`).join(',\n  ')};
insert into prueba.nombres (id, nombre) values ${Object.entries(P).map(([k, v]) => `('${v}', '${k}')`).join(', ')};
update public.profiles set invite_code = c.code from (values ${Object.entries(CODIGO).map(([k, v]) => `('${P[k]}'::uuid, '${v}')`).join(', ')}) c(id, code) where profiles.id = c.id;
update public.coach_billing set plan = 'p100', max_clients = 100, trial_ends_at = now() - interval '30 days', paid_until = now() + interval '20 days'
 where coach_id in ('${P.dA}', '${P.dB}');
update public.coach_billing set plan = 'p10', max_clients = 10, trial_ends_at = now() - interval '30 days', paid_until = now() + interval '20 days'
 where coach_id in ('${P.pA1}', '${P.C}', '${P.K}');
insert into public.gyms (id, name, slug, owner_id, city, province, dpa_version, dpa_at) values
  ('${G.A}', 'Gimnasio Fuerza', 'gimnasio-fuerza', '${P.dA}', 'Rosario', 'Santa Fe', '${VER}', now()),
  ('${G.B}', 'Gimnasio Norte', 'gimnasio-norte', '${P.dB}', 'Rosario', 'Santa Fe', '${VER}', now());
insert into public.gym_staff (gym_id, user_id, role) values
  ('${G.A}', '${P.dA}', 'owner'), ('${G.A}', '${P.aA}', 'admin'), ('${G.A}', '${P.pA1}', 'profe'), ('${G.A}', '${P.pA2}', 'profe'),
  ('${G.A}', '${P.rA}', 'recepcion'), ('${G.B}', '${P.dB}', 'owner');
insert into public.gym_codes (code, gym_id) values ('FUERZA22', '${G.A}'), ('NRTE2345', '${G.B}');
update public.profiles set coach_id = '${P.pA1}' where id in ('${P.A1}', '${P.A2}', '${P.P1}');
update public.profiles set coach_id = '${P.dA}' where id in ('${P.A7}', '${P.D1}');
update public.profiles set coach_id = '${P.dB}' where id = '${P.B1}';
update public.profiles set coach_id = '${P.C}' where id = '${P.C1}';
insert into public.gym_members (id, gym_id, member_id, full_name, dni, email, status, terms_at, terms_version, share_admin, share_admin_at,
                                share_admin_version, source, requested_at, visita_hasta, visita_tipo) values
  ('${F.A1}', '${G.A}', '${P.A1}', 'Martina Sosa', '30111222', 'a1@ejemplo.test', 'activo', now(), '${VER}', true, now(), '${VER}', 'codigo', now() - interval '60 days', null, null),
  ('${F.A2}', '${G.A}', '${P.A2}', 'Juan Pérez', null, 'a2@ejemplo.test', 'activo', now(), '${VER}', false, null, null, 'codigo', now() - interval '60 days', null, null),
  ('${F.A3}', '${G.A}', '${P.A3}', 'Lucía Gómez', null, 'a3@ejemplo.test', 'activo', now(), '${VER}', false, null, null, 'codigo', now() - interval '60 days', null, null),
  ('${F.A4}', '${G.A}', null, 'Raúl Sin App', '30999888', 'raul@ejemplo.test', 'activo', null, null, false, null, null, 'ficha', null, null, null),
  ('${F.A5}', '${G.A}', '${P.A5}', 'Pedro Díaz', null, 'a5@ejemplo.test', 'visita', now(), '${VER}', true, now(), '${VER}', 'visita', null, current_date + 7, 'pase_diario'),
  ('${F.A6}', '${G.A}', '${P.A6}', 'Sofía Romero', null, 'a6@ejemplo.test', 'pendiente', now(), '${VER}', true, now(), '${VER}', 'codigo', now() - interval '2 days', null, null),
  ('${F.A7}', '${G.A}', '${P.A7}', 'Diego Ruiz', null, 'a7@ejemplo.test', 'activo', null, null, false, null, null, 'conversion', null, null, null),
  ('${F.B1}', '${G.B}', '${P.B1}', 'Valeria Ríos', null, 'b1@ejemplo.test', 'activo', now(), '${VER}', true, now(), '${VER}', 'codigo', now() - interval '60 days', null, null);
insert into public.gym_member_notes (gym_member_id, body) values ('${F.A1}', 'Rodilla operada'), ('${F.A3}', 'Viene a la mañana');
insert into public.gym_entries (gym_id, gym_member_id, method, result, at) values
  ('${G.A}', '${F.A1}', 'manual', 'ok', now() - interval '1 day'), ('${G.A}', '${F.A2}', 'manual', 'ok', now() - interval '1 day'),
  ('${G.A}', '${F.A4}', 'manual', 'ok', now() - interval '1 day'), ('${G.B}', '${F.B1}', 'manual', 'ok', now() - interval '1 day');
-- Registros de cada uno (una fila por tabla) y algunos mensajes.
insert into public.sessions (id, client_id, performed_on, day_name) select md5('sesion:' || u)::uuid, u, current_date, 'A' from unnest(array[${CLIENTES.map(c => `'${P[c]}'::uuid`).join(',')}]) u;
insert into public.session_entries (session_id, client_id, exercise_name, set_order, kg, reps) select md5('sesion:' || u)::uuid, u, 'Sentadilla', 1, 50, 10 from public.profiles p(u) where u = any(array[${CLIENTES.map(c => `'${P[c]}'::uuid`).join(',')}]);
insert into public.body_weights (client_id, measured_on, kg) select id, current_date, 70 from public.profiles where role = 'client';
insert into public.daily_logs (client_id, log_date, steps, sleep) select id, current_date, 8000, 'bien' from public.profiles where role = 'client';
insert into public.checkins (client_id, week_start) select id, current_date from public.profiles where role = 'client';
insert into public.food_entries (client_id, log_date, name) select id, current_date, 'Avena' from public.profiles where role = 'client';
insert into public.client_info (client_id, objective) select id, 'Fuerza' from public.profiles where role = 'client';
insert into public.blocks (client_id, name) select id, 'Bloque' from public.profiles where role = 'client';
insert into public.nutrition (client_id, kcal) select id, 2000 from public.profiles where role = 'client';
insert into public.routines (client_id, days) select id, '[]' from public.profiles where role = 'client';
insert into public.client_prefs (client_id) select id from public.profiles where role = 'client';
insert into public.routine_schedule (client_id, starts_on, created_by) select id, current_date + 7, coach_id from public.profiles where role = 'client' and coach_id is not null;
insert into public.cardio_outings (id, client_id, mode, performed_on, started_at, duration_s, track)
select md5('salida:' || id)::uuid, id, 'pie', current_date, now(), 600, '1;-32.95,-60.66;-32.96,-60.65' from public.profiles where role = 'client';
insert into public.coach_messages (coach_id, client_id, body, sender, gym_id) values
  ('${P.pA1}', '${P.A1}', 'Hola, ¿cómo te fue?', 'coach', '${G.A}'), ('${P.pA1}', '${P.A1}', 'Bien', 'client', '${G.A}'),
  ('${P.pA1}', '${P.P1}', 'Hola P1', 'coach', null),
  ('${P.dA}', '${P.A7}', 'Hola', 'coach', null), ('${P.dA}', '${P.D1}', 'Hola', 'coach', null), ('${P.C}', '${P.C1}', 'Hola', 'coach', null);
select prueba.invariantes();
`;

// Las ayudas sobre una base (db = await h.nueva('gize_con') con DATOS cargados).
//   J(sql): el JSON que imprime sql.
//   V([[quien, sql], …]): pasos seguidos (cada uno ve lo del anterior) y deshace todo; el resultado
//     de cada paso ({error, msg} si falló).
//   PROBAR(quien, sql): uno solo, deshaciendo; HACER(quien, sql): uno solo, queda.
//   INV(): los invariantes I1 a I5 (vacío = bien).
// quien: una clave de P, 'anon', 'servicio' o 'postgres'.
export function ayudas(db){
  const quien = x => P[x] || x;
  const pasos = ps => '$j$' + JSON.stringify(ps.map(([w, sql]) => ({ quien: quien(w), q: sql }))) + '$j$::jsonb';
  const J = sql => db.json(sql);
  const V = async ps => (await J(`select prueba.varios(${pasos(ps)});`)).map(r => ('error' in r) ? { error: r.error, msg: r.msg } : r.ok);
  const PROBAR = async (w, sql) => { const r = await J(`select prueba.probar(${lit(quien(w))}, ${lit(sql)});`); return ('error' in r) ? { error: r.error, msg: r.msg } : r.ok; };
  const HACER = async (w, sql) => { const r = await J(`select prueba.hacer(${lit(quien(w))}, ${lit(sql)});`); return ('error' in r) ? { error: r.error, msg: r.msg } : r.ok; };
  const INV = () => J('select prueba.invariantes();');
  return { J, V, PROBAR, HACER, INV };
}

// Una RPC como la llama PostgREST: select public.f(args)::jsonb.
export const rpc = (f, ...args) => `select to_jsonb(public.${f}(${args.map(a => a === null ? 'null' : typeof a === 'boolean' ? String(a)
  : Array.isArray(a) ? `array[${a.map(x => lit(x)).join(',')}]::uuid[]` : typeof a === 'object' ? lit(JSON.stringify(a)) + '::jsonb' : lit(a)).join(', ')}))`;

// Vence el plan de quien (coach_billing) hace tanto.
export const VENCE = (quien, hace) => `update public.coach_billing set trial_ends_at = now() - interval '60 days', paid_until = now() - interval '${hace}' where coach_id = '${P[quien]}'`;

// Estado de un socio: su coach, su ficha (estado, profe, R) y los invariantes.
export const ESTADO = who => `select jsonb_build_object('coach', (select coach_id from public.profiles where id = '${P[who]}'),
    'ficha', (select jsonb_build_object('id', id, 'status', status, 'trainer', trainer_id, 'restore', restore_trainer_id, 'terms', terms_at is not null, 'share', share_admin)
                from public.gym_members where member_id = '${P[who]}' order by status = 'baja', joined_at desc limit 1),
    'inv', prueba.invariantes())`;
