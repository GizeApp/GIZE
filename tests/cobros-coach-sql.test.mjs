// supabase/cobros-coach.sql (Cobros del coach: el coach anota cuánto le paga cada alumno y lo que
// ya cobró; GIZE no cobra nada).
// 1) Leído: encabezado, tablas con RLS sin políticas ni permisos, quién puede llamar cada función,
//    que el medio no sea Mercado Pago, que ningún mensaje nombre el plan ni los pagos de GIZE, que no
//    lleve datos de nadie, que el bloque para volver atrás borre todo lo que crea y que, fuera de
//    sus tablas y del interruptor en app_config, no toque nada.
// 2) Con Postgres de verdad (tests/pg.mjs; sin Postgres se saltea):
//    · sin gimnasios (gize_sin): un coach al día con dos alumnos, otro coach y un coach vencido;
//    · con gimnasios (gize_con, las personas de tests/gimnasios-comun.mjs): quién puede cada RPC,
//      cargar cuotas (todo o nada, sacar la cuota conserva el vencimiento), qué período cubre cada
//      cobro, el mismo id no anota dos (también a la vez), el id de otro coach, el tope del día,
//      anular, el resumen (sin los socios que el profe atiende en su gimnasio), los cobros del mes con
//      el ex alumno, lo que ve el alumno, el coach vencido, que nadie lee las tablas directo, los
//      permisos de cada función, borrar la cuenta, el admin y el conteo para el Resumen de los lunes;
//    · volver a correr el archivo no pisa el interruptor y volver atrás deja la base como estaba.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { conPg, leer, volverAtras, huella, diferencias, lit, GIMNASIOS } from './pg.mjs';
import { P, ID, DATOS, ayudas, VENCE, conCanon } from './gimnasios-comun.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fn = (sql, name) => {
  const i = sql.indexOf('create or replace function public.' + name + '(');
  if (i < 0) return '';
  const a = sql.indexOf('$$', i), b = sql.indexOf('$$', a + 2);
  return sql.slice(i, b + 2);
};

// Las funciones del archivo, con su firma, y quién las puede llamar.
const APP = ['cobros_resumen()', 'cobro_cuota_guardar(uuid[], numeric, int, date)', 'cobro_registrar(uuid, uuid, numeric, text, date, date, text)',
  'cobro_anular(uuid, text)', 'cobros_alumno(uuid)', 'cobros_mes(date)', 'cobro_mi_cuota()'];
const ADMIN = ['admin_cobros(jsonb)', 'admin_cobros_estado()'];
const AYUDAS = ['cobro_hoy()', 'cobro_estado(numeric, date)', 'cobro_de_gimnasio(uuid)', 'cobro_es_alumno(uuid, uuid)', 'cobro_exigir(boolean)', 'cobros_interruptor()'];
const SERVICIO = ['cobros_conteo(uuid)'];
const TODAS = [...AYUDAS, ...APP, ...SERVICIO, ...ADMIN];
const nombre = sig => sig.slice(0, sig.indexOf('('));
// Lo que no se puede ver en las apps de las tiendas (el mismo criterio que tests/coach-iphone.test.mjs).
const PROHIBIDO = /prueba|gratis|\bplan\b|pago|precio|tarjeta|mercado|suscrip|contrat|\$|gize\.ar(?!\/privacidad)/i;

const HOY = "(now() at time zone 'America/Argentina/Buenos_Aires')::date";
const guardar = (al, monto, meses, vence = null) =>
  `select to_jsonb(public.cobro_cuota_guardar(array[${al.map(a => `'${a}'`).join(',')}]::uuid[], ${monto === null ? 'null' : monto}, ${meses === null ? 'null' : meses}, ${vence || 'null'}))`;
const registrar = (id, al, monto, medio = 'efectivo', fecha = null, hasta = null, nota = null) =>
  `select to_jsonb(public.cobro_registrar(${id === null ? 'null' : `'${id}'`}, '${al}', ${monto === null ? 'null' : monto}, ${medio === null ? 'null' : lit(medio)}, ${fecha || 'null'}, ${hasta || 'null'}, ${nota === null ? 'null' : lit(nota)}))`;
const anular = (id, motivo = null) => `select to_jsonb(public.cobro_anular('${id}', ${motivo === null ? 'null' : lit(motivo)}))`;
const alumno = al => `select to_jsonb(public.cobros_alumno('${al}'))`;
const RESUMEN = 'select to_jsonb(public.cobros_resumen())';
const MES = (mes = null) => `select to_jsonb(public.cobros_mes(${mes || 'null'}))`;
const MI = 'select to_jsonb(public.cobro_mi_cuota())';
const fila = (co, al) => `select jsonb_build_object('monto', amount, 'meses', months, 'vence', due_on) from public.coach_client_fees where coach_id = '${co}' and client_id = '${al}'`;
const cuota = (co, al, monto, meses = 1, vence = null) => `insert into public.coach_client_fees (coach_id, client_id, amount, months, due_on)
  values ('${co}', '${al}', ${monto === null ? 'null' : monto}, ${meses}, ${vence || 'null'})
  on conflict (coach_id, client_id) do update set amount = excluded.amount, months = excluded.months, due_on = excluded.due_on`;
const cobro = (id, co, al, monto, paid, { anulado = false, nota = null } = {}) => `insert into public.coach_client_payments
  (id, coach_id, client_id, amount, method, paid_on, period_from, period_to, note, voided_at)
  values ('${id}', '${co}', '${al}', ${monto}, 'efectivo', ${paid}, ${paid}, ${paid} + 30, ${nota === null ? 'null' : lit(nota)}, ${anulado ? 'now()' : 'null'})`;
const ERR_ALUMNO = 'Ese alumno ya no está vinculado con vos (o paga la cuota en su gimnasio).';
const ERR_ALGUNO = 'Alguno de esos alumnos ya no está vinculado con vos (o paga la cuota en su gimnasio): no se cambió nada.';
const VENCIDO = 'Por ahora no podés anotar cobros.';

export default async ({ t: t0 }) => {
  const t = conCanon(t0);
  const file = path.join(ROOT, 'supabase/cobros-coach.sql');
  t.ok(fs.existsSync(file), 'existe supabase/cobros-coach.sql');
  if (!fs.existsSync(file)) return;
  const sql = fs.readFileSync(file, 'utf8');
  const code = sql.replace(/--[^\n]*/g, '');

  // ---------- 1) Leído ----------
  const cab = sql.slice(0, sql.indexOf('\ndo $$')).split('\n').map(l => l.replace(/^-- ?/, '')).join(' ');
  t.has(cab, 'Correr con el workflow "Supabase" → tarea sql → supabase/cobros-coach.sql', 'encabezado: cómo correrlo');
  t.has(cab, 'Se puede correr varias veces', 'encabezado: se puede correr varias veces');
  t.ok(/después de supabase\/suscripciones\.sql, supabase\/cupo-plan\.sql, supabase\/admin\.sql y supabase\/foto-perfil\.sql/.test(cab), 'encabezado: de qué depende');
  t.has(cab, 'SIN COBRO ONLINE: GIZE no cobra ni mueve plata', 'encabezado: GIZE no cobra');
  t.ok(/^do \$\$ begin\s+if to_regclass\('public\.profiles'\) is null/m.test(sql) && sql.indexOf('\ndo $$') < sql.indexOf('create table'),
    'lo primero controla que estén los archivos anteriores');
  for (const tb of ['coach_client_fees', 'coach_client_payments']){
    t.ok(code.includes('create table if not exists public.' + tb + ' ('), tb + ': se crea si no está');
    t.ok(code.includes('alter table public.' + tb + ' enable row level security;'), tb + ': RLS prendido');
    t.ok(code.includes('revoke all on public.' + tb + ' from anon, authenticated;'), tb + ': sin permisos para anon ni authenticated');
    t.ok(new RegExp('create table if not exists public\\.' + tb + ' \\([\\s\\S]*?client_id\\s+uuid not null references public\\.profiles\\(id\\) on delete cascade').test(code),
      tb + ': se va con la cuenta del alumno');
  }
  t.ok(!/create policy/i.test(code), 'sin políticas: nadie lee las tablas directo');
  t.ok(!/grant [^;]*on (table )?public\.coach_client/i.test(code), 'ningún grant sobre las tablas');
  t.ok(!/drop table/i.test(code), 'no borra tablas (se puede volver a correr sin perder lo anotado)');
  const adds = [...code.matchAll(/add constraint (\w+)/g)].map(x => x[1]);
  t.ok(adds.length >= 6 && adds.every(c => code.includes('drop constraint if exists ' + c)), 'cada check se borra antes de crearlo: ' + adds.join(', '));
  t.ok(/check \(method in \('efectivo', 'transferencia', 'otro'\)\)/.test(code), 'medios: efectivo, transferencia u otro');
  t.ok(!/mercado\s*pago|mercadopago/i.test(sql), 'el archivo no nombra a Mercado Pago (GIZE no cobra)');
  t.ok(code.includes("insert into public.app_config (key, value) values ('cobros', jsonb_build_object('web', true, 'android', false, 'ios', false))\n  on conflict (key) do nothing;"),
    'el interruptor nace con la web prendida y las apps apagadas, y volver a correr no lo pisa');
  // Fuera de sus tablas y del interruptor, no toca nada.
  const PROPIAS = ['coach_client_fees', 'coach_client_payments'];
  const inserts = [...code.matchAll(/insert into public\.(\w+)/g)].map(x => x[1]), updates = [...code.matchAll(/update public\.(\w+)/g)].map(x => x[1]);
  const alters = [...code.matchAll(/alter table public\.(\w+)/g)].map(x => x[1]);
  t.ok(inserts.every(x => [...PROPIAS, 'app_config'].includes(x)) && updates.every(x => PROPIAS.includes(x)) && alters.every(x => PROPIAS.includes(x)),
    'solo escribe sus tablas y el interruptor: ' + JSON.stringify({ inserts, updates, alters }));
  t.ok(!/delete from|truncate|drop (function|policy|index|trigger|column)/i.test(code), 'no borra nada (salvo los checks que vuelve a crear)');
  t.ok(!/create trigger|cron\.|net\.http|create extension/i.test(code), 'sin triggers ni tareas programadas');
  // Cada función: security definer con search_path fijo y los permisos escritos.
  const creadas = [...code.matchAll(/create or replace function public\.(\w+)\(/g)].map(x => x[1]);
  t.eq(creadas.sort(), TODAS.map(nombre).sort(), 'crea estas 16 funciones (ninguna que ya existía)');
  for (const sig of TODAS) t.ok(/security definer set search_path = public as \$\$/.test(fn(code, nombre(sig))), nombre(sig) + ': security definer con search_path fijo');
  for (const sig of [...APP, ...ADMIN]){
    t.ok(code.includes('revoke all on function public.' + sig + ' from public, anon;'), sig + ': nada para public ni anon');
    t.ok(code.includes('grant execute on function public.' + sig + ' to authenticated;'), sig + ': con sesión');
  }
  for (const sig of [...AYUDAS, ...SERVICIO]) t.ok(code.includes('revoke all on function public.' + sig + ' from public, anon, authenticated;'), sig + ': la app no la llama');
  for (const sig of AYUDAS) t.ok(!code.includes('grant execute on function public.' + sig), sig + ': interna, sin grant');
  t.ok(code.includes('grant execute on function public.cobros_conteo(uuid) to service_role;'), 'cobros_conteo: solo el service role (Resumen de los lunes)');
  for (const f of ['admin_cobros', 'admin_cobros_estado'])
    t.ok(/\$\$\s*(declare[\s\S]*?)?begin\s+perform public\.admin_assert\(\);/.test(fn(code, f)), f + ': lo primero es admin_assert');
  t.ok(/perform public\.admin_log\('cobros'/.test(fn(code, 'admin_cobros')), 'el interruptor queda en el registro de acciones');
  const reg = fn(code, 'cobro_registrar');
  t.ok(reg.indexOf('for update;') > 0 && reg.indexOf('for update;') < reg.indexOf('x.id = cobro_registrar.id'), 'registrar: bloquea la cuota antes de mirar el id');
  t.ok(/exception when unique_violation/.test(reg), 'registrar: el mismo id a la vez se contesta como repetido');
  const gim = fn(code, 'cobro_de_gimnasio');
  t.ok(gim.indexOf("to_regprocedure('public.vinculo_gym(uuid)') is null then return false") > 0 && gim.indexOf("to_regprocedure") < gim.indexOf('public.vinculo_gym(alumno)'),
    'anda sin las tablas de los gimnasios (pregunta por vinculo_gym antes de usarla)');
  // Ningún mensaje de las funciones habla del plan ni de los pagos de GIZE (se ven también en las apps).
  const mensajes = TODAS.flatMap(sig => [...fn(code, nombre(sig)).matchAll(/raise exception '([^']*)'/g)].map(m => m[1]));
  t.ok(mensajes.length >= 15, 'mensajes de error: ' + mensajes.length);
  t.eq(mensajes.filter(m => PROHIBIDO.test(m)), [], 'ningún mensaje nombra el plan, la prueba, pagos, precios ni la suscripción');
  t.ok(!/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/.test(sql), 'sin mails');
  t.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(sql), 'sin ids de cuentas');
  // El bloque para volver atrás borra cada función, las dos tablas y el interruptor.
  const atras = volverAtras(sql);
  for (const sig of TODAS) t.ok(atras.replace(/\s+/g, ' ').includes('public.' + sig), 'volver atrás borra ' + sig);
  t.ok(atras.includes('drop table if exists public.coach_client_payments;') && atras.includes('drop table if exists public.coach_client_fees;'), 'volver atrás borra las dos tablas');
  t.ok(atras.includes("delete from public.app_config where key = 'cobros';"), 'volver atrás borra el interruptor');
  t.ok(code.includes("notify pgrst, 'reload schema';"), 'avisa a PostgREST');

  // ---------- 2) Con Postgres ----------
  const h = await conPg(t);
  if (!h) return;
  await sinGimnasios(t, h);
  await conGimnasios(t, h);
  await correrYVolver(t, h, sql);
};

// ===== Sin gimnasios (la base de hoy) =====
async function sinGimnasios(t, h){
  const db = await h.nueva('gize_sin');
  const U = { C0: 'c1000000-0000-4000-8000-000000000001', A0: 'c1000000-0000-4000-8000-000000000002', B0: 'c1000000-0000-4000-8000-000000000003',
    C9: 'c1000000-0000-4000-8000-000000000009', Z0: 'c1000000-0000-4000-8000-00000000000a', CV: 'c1000000-0000-4000-8000-00000000000b',
    AV: 'c1000000-0000-4000-8000-00000000000c' };
  await db.sql(`insert into auth.users (id, email, raw_user_meta_data) values
      ('${U.C0}', 'c0@ejemplo.test', '{"full_name":"Coach Cero","role":"coach"}'), ('${U.A0}', 'a0@ejemplo.test', '{"full_name":"Alumna Cero"}'),
      ('${U.B0}', 'b0@ejemplo.test', '{"full_name":"Bruno Cero"}'), ('${U.C9}', 'c9@ejemplo.test', '{"full_name":"Coach Nueve","role":"coach"}'),
      ('${U.Z0}', 'z0@ejemplo.test', '{"full_name":"Zoe Nueve"}'), ('${U.CV}', 'cv@ejemplo.test', '{"full_name":"Coach Vencido","role":"coach"}'),
      ('${U.AV}', 'av@ejemplo.test', '{"full_name":"Alumna Vencida"}');
    update public.coach_billing set plan = 'p10', max_clients = 10, trial_ends_at = now() - interval '30 days', paid_until = now() + interval '20 days'
     where coach_id in ('${U.C0}', '${U.C9}');
    update public.profiles set coach_id = '${U.C0}' where id in ('${U.A0}', '${U.B0}');
    update public.profiles set coach_id = '${U.C9}' where id = '${U.Z0}';
    update public.profiles set coach_id = '${U.CV}' where id = '${U.AV}';
    ${cuota(U.CV, U.AV, 15000)};
    update public.coach_billing set trial_ends_at = now() - interval '60 days', paid_until = now() - interval '1 day' where coach_id = '${U.CV}';`);
  const { J, V } = ayudas(db);
  const D = await J(`select jsonb_build_object('hoy', ${HOY}, 'mas1m', (${HOY} + interval '1 month')::date)`);
  const PAGO = 'c1000000-0000-4000-8000-0000000000e1';
  const x = await V([['postgres', `select to_jsonb(public.cobros_interruptor())`],
    [U.C0, guardar([U.A0, U.B0], 25000, 1)],
    [U.C0, registrar(PAGO, U.A0, 25000, 'transferencia', null, null, 'Pagó en dos veces')],
    [U.A0, MI], [U.B0, MI],
    [U.C0, RESUMEN],
    [U.C9, alumno(U.A0)], [U.C9, registrar('c1000000-0000-4000-8000-0000000000e2', U.A0, 1000)],
    ['postgres', cuota(U.C9, U.Z0, 1000)], [U.C9, registrar(PAGO, U.Z0, 1000)],
    [U.CV, RESUMEN], [U.CV, guardar([U.AV], 15000, 1)], [U.CV, registrar('c1000000-0000-4000-8000-0000000000e3', U.AV, 15000)],
    [U.CV, MES()], [U.AV, MI]]);
  t.eq(x[0], { web: true, android: false, ios: false }, 'sin gimnasios: el interruptor nace con la web prendida y las apps apagadas');
  t.eq(x[1], { ok: 2 }, 'sin gimnasios: el coach carga la cuota de sus dos alumnos');
  t.eq(x[2], { id: PAGO, desde: D.hoy, hasta: D.mas1m, repetido: false }, 'sin gimnasios: anota un cobro (sin cobros: desde hoy, por un mes)');
  t.eq([x[3] && x[3].estado, x[3] && x[3].vence, x[3] && x[3].cuota, x[3] && x[3].pagos], ['al_dia', D.mas1m, { monto: 25000, meses: 1 },
    [{ fecha: D.hoy, monto: 25000, medio: 'transferencia', hasta: D.mas1m }]], 'sin gimnasios: la alumna ve su cuota y su cobro (sin la nota del coach)');
  t.eq(x[4] && x[4].estado, 'sin_pagos', 'sin gimnasios: el otro alumno, sin pagos cargados');
  const r = x[5] || {};
  t.eq([r.activo, (r.alumnos || []).map(a => [a.nombre, a.estado]), r.conteo, r.cobrado, r.cobros_mes, r.por_cobrar, r.alumnos_por_cobrar],
    [true, [['Alumna Cero', 'al_dia'], ['Bruno Cero', 'sin_pagos']], { al_dia: 1, por_vencer: 0, vencida: 0, sin_pagos: 1, sin_cuota: 0 }, 25000, 1, 25000, 1],
    'sin gimnasios: el resumen del coach');
  t.eq([x[6], x[7]], [{ error: 'P0001', msg: ERR_ALUMNO }, { error: 'P0001', msg: ERR_ALUMNO }], 'sin gimnasios: otro coach no ve ni anota a los alumnos ajenos');
  t.eq(x[9], { error: '42501', msg: 'No tenés permiso para hacer esto.' }, 'sin gimnasios: el id de un cobro de otro coach da 42501');
  t.eq(x[10], { interruptor: { web: true, android: false, ios: false }, activo: false }, 'sin gimnasios: el coach vencido ve solo que no está activo');
  t.eq([x[11], x[12]], [{ error: 'P0001', msg: VENCIDO }, { error: 'P0001', msg: VENCIDO }], 'sin gimnasios: el coach vencido no anota (sin nombrar el plan)');
  t.eq(x[13], [], 'sin gimnasios: el coach vencido puede ver los cobros del mes');
  t.eq(x[14], null, 'sin gimnasios: la alumna de un coach vencido no ve la cuota');
  await db.borrar();
}

// ===== Con gimnasios: las personas de la etapa 1 =====
async function conGimnasios(t, h){
  const db = await h.nueva('gize_con');
  t.eq(await db.json(DATOS), [], 'las personas cargadas cumplen los invariantes');
  const { J, V, HACER } = ayudas(db);
  const D = await J(`select jsonb_build_object('hoy', ${HOY}, 'mas1m', (${HOY} + interval '1 month')::date,
    'mas1m1m', ((${HOY} + interval '1 month')::date + interval '1 month')::date, 'mas3m', (${HOY} + interval '3 months')::date,
    'mas5', ${HOY} + 5, 'mas20', ${HOY} + 20, 'mas20_1m', (${HOY} + 20 + interval '1 month')::date, 'mas30', ${HOY} + 30,
    'menos3', ${HOY} - 3, 'menos10', ${HOY} - 10, 'menos10_1m', (${HOY} - 10 + interval '1 month')::date, 'mas60', ${HOY} + 60,
    'inimes', date_trunc('month', ${HOY})::date, 'mesantes', (date_trunc('month', ${HOY}) - interval '1 day')::date,
    'mas5_antes_fin', (${HOY} + 5) < (date_trunc('month', ${HOY}) + interval '1 month')::date)`);
  const PAGO = ID('c101'), PAGO2 = ID('c102'), PAGO3 = ID('c103'), PAGO4 = ID('c104'), PAGO5 = ID('c105'), PAGO6 = ID('c106');

  // ===== Quién puede llamar cada RPC =====
  const PERSONAS = ['dA', 'aA', 'pA1', 'pA2', 'rA', 'A1', 'P1', 'dB', 'C', 'C1', 'K', 'N', 'anon'];
  const COACHES = ['dA', 'pA1', 'pA2', 'dB', 'C', 'K'], OTROS = COACHES.filter(c => c !== 'C');
  const quien = p => p === 'anon' ? 'anon' : P[p];
  const CASOS = [
    ['cobros_resumen', RESUMEN, { ok: COACHES }],
    ['cobro_cuota_guardar', guardar([P.C1], 30000, 1), { ok: ['C'], P0001: OTROS }],
    ['cobro_registrar', registrar(PAGO, P.C1, 30000), { ok: ['C'], P0001: OTROS }, cuota(P.C, P.C1, 30000)],
    ['cobro_anular', anular(PAGO, 'Error'), { ok: ['C'], P0001: OTROS }, cuota(P.C, P.C1, 30000) + '; ' + cobro(PAGO, P.C, P.C1, 30000, HOY)],
    ['cobros_alumno', alumno(P.C1), { ok: ['C'], P0001: OTROS }],
    ['cobros_mes', MES(), { ok: COACHES }],
    ['cobro_mi_cuota', MI, { ok: PERSONAS.filter(p => p !== 'anon') }],
    ['cobros_conteo', `select to_jsonb(public.cobros_conteo('${P.C}'))`, {}],
    ['admin_cobros', `select to_jsonb(public.admin_cobros('{"ios": true}'::jsonb))`, {}],
    ['admin_cobros_estado', 'select to_jsonb(public.admin_cobros_estado())', {}],
  ];
  for (const [nom, q, esp, antes] of CASOS){
    const r = await J(`select jsonb_object_agg(x.p, prueba.varios(jsonb_build_array(
        jsonb_build_object('quien', 'postgres', 'q', ${lit(antes || 'select 1')}),
        jsonb_build_object('quien', x.q, 'q', ${lit(q)}))))
      from (values ${PERSONAS.map(p => `('${p}', '${quien(p)}')`).join(', ')}) x(p, q);`);
    const obtenido = {}, espera = {};
    for (const p of PERSONAS){
      const res = r[p][1];
      obtenido[p] = 'error' in res ? res.error : 'ok';
      espera[p] = (esp.ok || []).includes(p) ? 'ok' : (esp.P0001 || []).includes(p) ? 'P0001' : '42501';
    }
    t.ok(r[PERSONAS[0]][0].ok !== undefined, nom + ': se pudo preparar ' + JSON.stringify(r[PERSONAS[0]][0]).slice(0, 200));
    t.eq(obtenido, espera, nom + ': quién puede (ok), quién recibe P0001 y quién 42501 — ' + JSON.stringify(Object.fromEntries(PERSONAS.map(p => [p, r[p][1].msg || 'ok']))).slice(0, 900));
  }

  // ===== Cargar cuotas =====
  let x = await V([['C', guardar([P.C1], 30000, 1)], ['postgres', fila(P.C, P.C1)],
    ['pA1', guardar([P.P1, P.A1], 20000, 1)], ['postgres', `select to_jsonb(count(*)) from public.coach_client_fees where coach_id = '${P.pA1}'`],
    ['pA1', guardar([P.P1], 20000.5, 3, `${HOY} + 20`)], ['postgres', fila(P.pA1, P.P1)],
    ['pA1', guardar([P.P1], null, null)], ['postgres', fila(P.pA1, P.P1)],
    ['dA', guardar([P.D1, P.A7], 18000, 1)], ['dA', guardar([P.D1], 18000, 1)],
    ['C', guardar([P.C1, P.C1], 31000, 2)], ['postgres', fila(P.C, P.C1)],
    ['C', guardar([P.N], 1000, 1)]]);
  t.eq([x[0], x[1]], [{ ok: 1 }, { monto: 30000, meses: 1, vence: null }], 'cargar la cuota: sin cobros todavía');
  t.eq([x[2], x[3]], [{ error: 'P0001', msg: ERR_ALGUNO }, 0], 'el profe con un socio que atiende en el gimnasio en la lista: no cambia nada');
  t.eq([x[4], x[5]], [{ ok: 1 }, { monto: 20000.5, meses: 3, vence: D.mas20 }], 'con «ya está paga hasta» y trimestral (el monto con centavos)');
  t.eq([x[6], x[7]], [{ ok: 1 }, { monto: null, meses: 3, vence: D.mas20 }], 'sacar la cuota conserva el vencimiento');
  t.eq([x[8], x[9]], [{ error: 'P0001', msg: ERR_ALGUNO }, { ok: 1 }], 'la dueña: su alumno propio sí, el socio del gimnasio no');
  t.eq([x[10], x[11]], [{ ok: 1 }, { monto: 31000, meses: 2, vence: null }], 'el mismo alumno dos veces en la lista: una sola cuota');
  t.eq(x[12], { error: 'P0001', msg: ERR_ALGUNO }, 'alguien sin coach: no');
  const muchos = Array.from({ length: 501 }, (_, i) => ID('d' + String(i).padStart(4, '0')));
  x = await V([['C', guardar([], 1000, 1)], ['C', guardar(muchos, 1000, 1)], ['C', guardar([P.C1], 0, 1)], ['C', guardar([P.C1], 10.555, 1)],
    ['C', guardar([P.C1], 100000000, 1)], ['C', guardar([P.C1], 1000, 5)], ['C', guardar([P.C1], 1000, null)],
    ['C', guardar([P.C1], 1000, 1, `${HOY} + 500`)], ['C', guardar([P.C1], 1000, 1, `${HOY} - 400`)], ['C', guardar([P.C1], null, null, `${HOY} + 5`)]]);
  t.eq(x.map(r => r.msg), ['Elegí entre 1 y 500 alumnos.', 'Elegí entre 1 y 500 alumnos.', 'Revisá el monto: en pesos, sin puntos de miles.',
    'Revisá el monto: en pesos, sin puntos de miles.', 'Revisá el monto: en pesos, sin puntos de miles.', 'Elegí cada cuánto te paga: 1, 2, 3, 6 o 12 meses.',
    'Elegí cada cuánto te paga: 1, 2, 3, 6 o 12 meses.', 'Revisá la fecha: hasta cuándo ya está paga.', 'Revisá la fecha: hasta cuándo ya está paga.',
    'Revisá la fecha: hasta cuándo ya está paga.'], 'cargar cuotas: lo que no va');

  // ===== Anotar cobros: qué período cubre =====
  const CON_CUOTA = cuota(P.C, P.C1, 30000);
  x = await V([['postgres', CON_CUOTA],
    ['C', registrar(PAGO, P.C1, 30000, 'transferencia', null, null, '  Pagó la hermana ')], ['C', registrar(PAGO, P.C1, 30000, 'transferencia')],
    ['postgres', `select jsonb_build_array((select count(*) from public.coach_client_payments), (${fila(P.C, P.C1)}))`],
    ['C', registrar(PAGO2, P.C1, 30000)], ['postgres', fila(P.C, P.C1)],
    ['postgres', `update public.coach_client_fees set due_on = ${HOY} - 3 where client_id = '${P.C1}'`], ['C', registrar(PAGO3, P.C1, 30000)],
    ['postgres', `update public.coach_client_fees set due_on = null, months = 3 where client_id = '${P.C1}'`], ['C', registrar(PAGO4, P.C1, 90000)],
    ['postgres', `update public.coach_client_fees set due_on = ${HOY} + 20, months = 1 where client_id = '${P.C1}'`],
    ['C', registrar(PAGO5, P.C1, 1000, 'otro', null, `${HOY} + 5`)],
    ['postgres', `update public.coach_client_fees set due_on = ${HOY} + 20 where client_id = '${P.C1}'`],
    ['C', registrar(PAGO6, P.C1, 1000, 'otro', null, `${HOY} + 30`)],
    ['postgres', `update public.coach_client_fees set due_on = null where client_id = '${P.C1}'`],
    ['C', registrar(ID('c107'), P.C1, 1000, 'efectivo', `${HOY} - 10`)],
    ['C', alumno(P.C1)]]);
  t.eq(x[1], { id: PAGO, desde: D.hoy, hasta: D.mas1m, repetido: false }, 'sin cobros: cubre desde hoy y por un mes');
  t.eq(x[2], { id: PAGO, desde: D.hoy, hasta: D.mas1m, repetido: true }, 'el mismo id otra vez: devuelve lo mismo, sin anotar otro');
  t.eq(x[3], [1, { monto: 30000, meses: 1, vence: D.mas1m }], 'un solo cobro y el vencimiento nuevo en la cuota');
  t.eq([x[4].desde, x[4].hasta, x[5].vence], [D.mas1m, D.mas1m1m, D.mas1m1m], 'al día: el cobro siguiente cubre desde el vencimiento (no desde hoy)');
  t.eq([x[7].desde, x[7].hasta], [D.hoy, D.mas1m], 'vencida: cubre desde hoy');
  t.eq([x[9].desde, x[9].hasta], [D.hoy, D.mas3m], 'trimestral: tres meses');
  t.eq([x[11].desde, x[11].hasta], [D.hoy, D.mas5], '«cubre hasta» a mano antes del vencimiento: desde hoy');
  t.eq([x[13].desde, x[13].hasta], [D.mas20, D.mas30], '«cubre hasta» a mano después del vencimiento: desde el vencimiento');
  t.eq([x[15].desde, x[15].hasta], [D.menos10, D.menos10_1m], 'un cobro de hace 10 días: cubre desde ese día');
  const hist = x[16] || {};
  t.eq([hist.alumno, (hist.cobros || []).length, (hist.cobros || []).find(c => c.id === PAGO).nota], [P.C1, 7, 'Pagó la hermana'], 'la ficha: los cobros con la nota (sin espacios de más)');
  x = await V([['postgres', CON_CUOTA],
    ['C', registrar(PAGO, P.C1, 0)], ['C', registrar(PAGO, P.C1, 10.555)], ['C', registrar(PAGO, P.C1, 1000, 'mercadopago')], ['C', registrar(PAGO, P.C1, 1000, null)],
    ['C', registrar(PAGO, P.C1, 1000, 'efectivo', `${HOY} + 1`)], ['C', registrar(PAGO, P.C1, 1000, 'efectivo', `${HOY} - 400`)],
    ['C', registrar(PAGO, P.C1, 1000, 'efectivo', null, `${HOY} - 1`)], ['C', registrar(PAGO, P.C1, 1000, 'efectivo', null, `${HOY} + 500`)],
    ['C', registrar(PAGO, P.C1, 1000, 'efectivo', null, null, 'x'.repeat(201))], ['C', registrar(null, P.C1, 1000)],
    ['postgres', `select to_jsonb(count(*)) from public.coach_client_payments`]]);
  t.eq(x.slice(1, 11).map(r => r.msg), ['Revisá el monto: en pesos, sin puntos de miles.', 'Revisá el monto: en pesos, sin puntos de miles.',
    'Elegí cómo te pagó: efectivo, transferencia u otro.', 'Elegí cómo te pagó: efectivo, transferencia u otro.',
    'Revisá la fecha del cobro: no puede ser futura ni de hace más de un año.', 'Revisá la fecha del cobro: no puede ser futura ni de hace más de un año.',
    'Revisá hasta cuándo cubre: después del día que te pagó y dentro de un año.', 'Revisá hasta cuándo cubre: después del día que te pagó y dentro de un año.',
    'La nota es muy larga (hasta 200 letras).', 'Faltan datos del cobro.'], 'anotar: lo que no va (también Mercado Pago como medio)');
  t.eq(x[11], 0, 'y no se anotó nada');
  x = await V([['C', registrar(PAGO, P.C1, 1000)], ['postgres', cuota(P.C, P.C1, null)], ['C', registrar(PAGO, P.C1, 1000)],
    ['C', registrar(PAGO, P.P1, 1000)], ['postgres', cuota(P.pA1, P.A1, 20000)], ['pA1', registrar(PAGO, P.A1, 20000)],
    ['postgres', CON_CUOTA], ['C', registrar(PAGO, P.C1, 30000)], ['postgres', cuota(P.pA1, P.P1, 20000)], ['pA1', registrar(PAGO, P.P1, 20000)],
    ['postgres', `select to_jsonb(count(*)) from public.coach_client_payments where coach_id = '${P.pA1}'`]]);
  t.eq([x[0].msg, x[2].msg], ['Primero cargale la cuota (cuánto te paga).', 'Primero cargale la cuota (cuánto te paga).'], 'sin cuota (o sacada): primero hay que cargarla');
  t.eq([x[3].msg, x[5].msg], [ERR_ALUMNO, ERR_ALUMNO], 'un alumno ajeno o un socio que el profe atiende en el gimnasio: no');
  t.eq([x[7].repetido, x[9], x[10]], [false, { error: '42501', msg: 'No tenés permiso para hacer esto.' }, 0], 'el id de un cobro de otro coach: 42501, sin anotar nada');

  // El tope: 1000 cobros por coach en 24 horas.
  x = await V([['postgres', CON_CUOTA],
    ['postgres', `insert into public.coach_client_payments (id, coach_id, client_id, amount, method, paid_on, period_from, period_to)
      select gen_random_uuid(), '${P.C}', '${P.C1}', 1, 'efectivo', ${HOY} - 30, ${HOY} - 30, ${HOY} - 29 from generate_series(1, 1000)`],
    ['C', registrar(PAGO, P.C1, 30000)], ['postgres', `update public.coach_client_payments set created_at = now() - interval '25 hours'`],
    ['C', registrar(PAGO, P.C1, 30000)]]);
  t.eq([x[2].msg, x[4].repetido], ['Anotaste muchos cobros hoy: seguí mañana.', false], 'el tope del día: 1000 cobros; al otro día, se sigue');

  // ===== Anular =====
  x = await V([['postgres', CON_CUOTA], ['C', registrar(PAGO, P.C1, 30000)], ['C', registrar(PAGO2, P.C1, 30000)],
    ['C', anular(PAGO2, '  Me equivoqué ')], ['C', anular(PAGO2)], ['pA1', anular(PAGO)], ['C', anular(ID('c1ff'))],
    ['C', alumno(P.C1)], ['C', anular(PAGO)], ['postgres', fila(P.C, P.C1)], [P.C1, MI]]);
  t.eq(x[3], { ok: true, vence: D.mas1m }, 'anular el último cobro: el vencimiento vuelve al de antes');
  t.eq(x[4].msg, 'Ese cobro ya está anulado.', 'no se anula dos veces');
  t.eq([x[5].msg, x[6].msg], ['No encontramos ese cobro.', 'No encontramos ese cobro.'], 'el cobro de otro coach (o uno que no existe): no lo encuentra');
  const an = (x[7].cobros || []).find(c => c.id === PAGO2) || {};
  t.eq([x[7].estado, x[7].vence, (x[7].cobros || []).length, !!an.anulado, an.motivo], ['al_dia', D.mas1m, 2, true, 'Me equivoqué'], 'la ficha: el anulado queda tachado, con el motivo');
  t.eq([x[8], x[9].vence], [{ ok: true, vence: null }, null], 'anular el primero: queda sin cobros');
  t.eq([x[10].estado, x[10].pagos], ['sin_pagos', []], 'la alumna no ve los cobros anulados');

  // ===== El resumen y los cobros del mes =====
  const NUEVA = ID('c1a0'), EX = ID('c1a1');
  const RES = [['postgres', `insert into auth.users (id, email, raw_user_meta_data) values ('${NUEVA}', 'nueva.c@ejemplo.test', '{"full_name":"Zoe Nueva"}'),
        ('${EX}', 'ex.c@ejemplo.test', '{"full_name":"Iván Ex"}');
      update public.profiles set coach_id = '${P.C}' where id in ('${P.N}', '${P.N2}', '${P.N3}', '${NUEVA}', '${EX}');
      ${cuota(P.C, P.C1, 30000, 1, `${HOY} + 60`)}; ${cuota(P.C, P.N, 10000, 1, `${HOY} + 5`)}; ${cuota(P.C, P.N2, 20000, 1, `${HOY} - 3`)};
      ${cuota(P.C, P.N3, 15000)}; ${cuota(P.C, EX, 7000)};
      ${cobro(PAGO, P.C, P.C1, 30000, HOY, { nota: 'En efectivo' })}; ${cobro(PAGO2, P.C, P.C1, 99999, HOY, { anulado: true })};
      ${cobro(PAGO3, P.C, EX, 7000, HOY)}; ${cobro(PAGO4, P.C, P.C1, 5000, `date_trunc('month', ${HOY})::date - 1`)};
      update public.profiles set coach_id = null where id = '${EX}'`]];
  x = await V([...RES, ['C', RESUMEN], ['C', MES()], ['C', MES(`date_trunc('month', ${HOY})::date - 1`)], ['servicio', `select to_jsonb(public.cobros_conteo('${P.C}'))`],
    ['pA1', RESUMEN], ['dA', RESUMEN], ['K', RESUMEN]]);
  t.ok(!(x[0] && x[0].error), 'se cargan los alumnos de C: ' + JSON.stringify(x[0]).slice(0, 300));
  const r = x[1] || {};
  const porVencerCuenta = D.mas5_antes_fin ? 1 : 0;
  t.eq([r.activo, r.hoy, r.mes, r.interruptor], [true, D.hoy, D.inimes, { web: true, android: false, ios: false }], 'el resumen: activo, hoy, el mes y el interruptor');
  t.eq((r.alumnos || []).map(a => [a.nombre, a.estado, a.vence, a.cuota && a.cuota.monto]),
    [['Ana Torres', 'al_dia', D.mas60, 30000], ['Bruno Castro', 'vencida', D.menos3, 20000], ['Elena Paz', 'sin_pagos', null, 15000],
      ['Nora Vidal', 'por_vencer', D.mas5, 10000], ['Zoe Nueva', null, null, null]], 'solo los alumnos actuales (el ex alumno no), en orden, con su estado');
  t.eq((r.alumnos || []).find(a => a.nombre === 'Ana Torres').ultimo_cobro, D.hoy, 'el último cobro (sin contar el anulado)');
  t.eq(r.conteo, { al_dia: 1, por_vencer: 1, vencida: 1, sin_pagos: 1, sin_cuota: 1 }, 'cuántos en cada estado');
  t.eq([r.cobrado, r.cobros_mes], [37000, 2], 'cobrado en el mes: sin el anulado ni el del mes pasado, con el del ex alumno');
  t.eq([r.por_cobrar, r.alumnos_por_cobrar], [35000 + 10000 * porVencerCuenta, 2 + porVencerCuenta], 'por cobrar: la vencida, la sin pagos y la que vence antes de fin de mes');
  t.eq((x[2] || []).map(c => [c.id, c.ex_alumno, !!c.anulado]).sort(), [[PAGO, false, false], [PAGO2, false, true], [PAGO3, true, false]].sort(),
    'los cobros del mes: con el anulado y el del ex alumno, marcados');
  t.eq([(x[2] || []).find(c => c.id === PAGO3).nombre, (x[2] || []).find(c => c.id === PAGO).nota], ['Iván Ex', 'En efectivo'], 'con el nombre y la nota');
  t.eq((x[3] || []).map(c => c.id), [PAGO4], 'el mes pasado: solo su cobro');
  t.eq(x[4], { activo: true, al_dia: 1, por_vencer: 1, vencida: 1, sin_pagos: 1, sin_cuota: 1, vencidas: [{ nombre: 'Bruno Castro', vence: D.menos3 }], cobrado_mes: 37000 },
    'cobros_conteo (Resumen de los lunes): la misma cuenta');
  t.eq([(x[5].alumnos || []).map(a => a.id), (x[6].alumnos || []).map(a => a.id), x[7].alumnos], [[P.P1], [P.D1], []],
    'el profe ve solo su alumno propio (no los socios que atiende en el gimnasio); la dueña, el suyo; un coach sin alumnos, ninguno');

  // ===== Lo que ve el alumno =====
  x = await V([['postgres', `${cuota(P.C, P.C1, 30000)}; ${cuota(P.pA1, P.P1, 20000, 3)}; ${cuota(P.pA1, P.A1, 20000)}`],
    ['C', registrar(PAGO, P.C1, 30000, 'efectivo', null, null, 'Nota del coach')], ['C', registrar(PAGO2, P.C1, 30000)], ['C', anular(PAGO2, 'Error')],
    [P.C1, MI], [P.P1, MI], [P.A1, MI], [P.N, MI],
    ['postgres', `update public.app_config set value = '{"web": true, "android": true, "ios": false}' where key = 'cobros'`], [P.C1, MI],
    ['postgres', VENCE('C', '1 day')], [P.C1, MI]]);
  const mi = x[4] || {};
  t.eq([mi.estado, mi.vence, mi.cuota, mi.interruptor], ['al_dia', D.mas1m, { monto: 30000, meses: 1 }, { web: true, android: false, ios: false }], 'el alumno ve su cuota y el interruptor');
  t.eq(mi.pagos, [{ fecha: D.hoy, monto: 30000, medio: 'efectivo', hasta: D.mas1m }], 'sus cobros: sin el anulado y sin la nota del coach');
  t.ok(!JSON.stringify(mi).includes('Nota del coach') && !JSON.stringify(mi).includes('Error'), 'sin notas ni motivos');
  t.eq([x[5] && x[5].estado, x[5] && x[5].cuota], ['sin_pagos', { monto: 20000, meses: 3 }], 'el alumno propio del profe ve su cuota');
  t.eq([x[6], x[7]], [null, null], 'el socio que su profe atiende en el gimnasio (aunque haya una cuota vieja) y quien no tiene coach: nada');
  t.eq(x[9].interruptor, { web: true, android: true, ios: false }, 'el interruptor cambiado le llega a la app');
  t.eq(x[11], null, 'con el coach vencido: nada');
  x = await V([['postgres', cuota(P.C, P.C1, 30000)], ['postgres', `update public.profiles set coach_id = null where id = '${P.C1}'`], [P.C1, MI],
    ['C', alumno(P.C1)], ['postgres', `update public.profiles set coach_id = '${P.C}' where id = '${P.C1}'`], [P.C1, MI],
    ['postgres', cuota(P.C, P.C1, null)], [P.C1, MI]]);
  t.eq([x[2], x[3].msg], [null, ERR_ALUMNO], 'desvinculado: no la ve, y el coach no puede abrir su ficha');
  t.eq(x[5] && x[5].cuota, { monto: 30000, meses: 1 }, 'si vuelve, aparece con la cuota que tenía');
  t.eq(x[7], null, 'sin cuota: nada');

  // ===== El coach vencido =====
  x = await V([['postgres', `${cuota(P.C, P.C1, 30000)}; ${cobro(PAGO, P.C, P.C1, 30000, HOY)}`], ['postgres', VENCE('C', '1 day')],
    ['C', RESUMEN], ['C', guardar([P.C1], 1000, 1)], ['C', registrar(PAGO2, P.C1, 1000)], ['C', anular(PAGO)], ['C', alumno(P.C1)], ['C', MES()],
    ['postgres', `select to_jsonb(count(*)) from public.coach_client_fees where coach_id = '${P.C}'`]]);
  t.eq(x[2], { interruptor: { web: true, android: false, ios: false }, activo: false }, 'vencido: el resumen dice solo que no está activo');
  t.eq(x.slice(3, 7).map(r => r.msg), Array(4).fill(VENCIDO), 'vencido: no carga, no anota, no anula ni abre la ficha (sin nombrar el plan)');
  t.eq([(x[7] || []).length, x[8]], [1, 1], 'vencido: lo anotado queda y ve los cobros del mes');

  // ===== Nadie lee ni escribe las tablas directo =====
  const directo = [];
  for (const tb of ['coach_client_fees', 'coach_client_payments'])
    for (const p of ['C', 'C1', 'dA', 'anon']){
      directo.push([p, `select to_jsonb(count(*)) from public.${tb}`]);
      directo.push([p, `delete from public.${tb}`]);
    }
  directo.push(['C', cuota(P.C, P.C1, 1)]);
  x = await V(directo);
  t.eq(x.map(r => r && r.error), Array(directo.length).fill('42501'), 'leer o escribir las tablas directo: 42501 para todos');

  // ===== Permisos de cada función =====
  const perm = await J(`select jsonb_object_agg(f, jsonb_build_array(has_function_privilege('anon', 'public.' || f, 'execute'),
      has_function_privilege('authenticated', 'public.' || f, 'execute'), has_function_privilege('service_role', 'public.' || f, 'execute')))
    from unnest(array[${TODAS.map(s => lit(s)).join(', ')}]) f`);
  for (const s of APP) t.eq(perm[s].slice(0, 2), [false, true], s + ': con sesión, no sin sesión');
  for (const s of ADMIN) t.eq(perm[s].slice(0, 2), [false, true], s + ': con sesión (adentro pide admin)');
  for (const s of AYUDAS) t.eq(perm[s].slice(0, 2), [false, false], s + ': interna');
  t.eq(perm['cobros_conteo(uuid)'], [false, false, true], 'cobros_conteo: solo el service role');

  // ===== Borrar la cuenta =====
  x = await V([['postgres', `${cuota(P.C, P.C1, 30000)}; ${cobro(PAGO, P.C, P.C1, 30000, HOY)}; ${cuota(P.pA1, P.P1, 20000)}; ${cobro(PAGO2, P.pA1, P.P1, 20000, HOY)}`],
    [P.C1, 'select to_jsonb(true) from (select public.delete_own_account()) x'],
    ['postgres', `select jsonb_build_array((select count(*) from public.coach_client_fees where client_id = '${P.C1}'), (select count(*) from public.coach_client_payments where client_id = '${P.C1}'))`],
    ['postgres', `delete from auth.users where id = '${P.pA1}'`],
    ['postgres', `select jsonb_build_array((select count(*) from public.coach_client_fees where coach_id = '${P.pA1}'), (select count(*) from public.coach_client_payments where coach_id = '${P.pA1}'))`]]);
  t.eq([x[1], x[2]], [true, [0, 0]], 'el alumno borra su cuenta: se van su cuota y sus cobros');
  t.eq(x[4], [0, 0], 'se borra la cuenta del coach: se van sus cuotas y sus cobros');

  // ===== El admin =====
  const ADM = ID('c1ad');
  x = await V([['postgres', `insert into auth.users (id, email, raw_user_meta_data) values ('${ADM}', 'admin.c@ejemplo.test', '{"full_name":"Admin"}');
      insert into public.app_admins (user_id) values ('${ADM}'); ${cuota(P.C, P.C1, 30000)}; ${cuota(P.pA1, P.P1, 20000)}; ${cuota(P.C, P.N, null)};
      ${cobro(PAGO, P.C, P.C1, 30000, HOY)}; ${cobro(PAGO2, P.C, P.C1, 30000, HOY, { anulado: true })}`],
    [ADM, `select to_jsonb(public.admin_cobros('{"ios": true}'::jsonb))`],
    ['postgres', `select value from public.app_config where key = 'cobros'`],
    ['postgres', `select to_jsonb(count(*)) from public.admin_audit where action = 'cobros' and admin_id = '${ADM}'`],
    [ADM, `select to_jsonb(public.admin_cobros('{"windows": true}'::jsonb))`], [ADM, `select to_jsonb(public.admin_cobros('{"web": "si"}'::jsonb))`],
    [ADM, `select to_jsonb(public.admin_cobros('[]'::jsonb))`], [ADM, `select to_jsonb(public.admin_cobros('{}'::jsonb))`],
    [ADM, 'select to_jsonb(public.admin_cobros_estado())'], ['C', `select to_jsonb(public.admin_cobros('{"web": false}'::jsonb))`],
    [ADM, `select to_jsonb(public.admin_cobros('{"web": false, "android": true}'::jsonb))`]]);
  t.eq([x[1], x[2], x[3]], [{ web: true, android: false, ios: true }, { web: true, android: false, ios: true }, 1], 'el admin prende Cobros en iPhone: se guarda y queda en el registro');
  t.eq(x.slice(4, 8).map(r => r.error), ['P0001', 'P0001', 'P0001', 'P0001'], 'solo web, android e ios, con true o false');
  t.eq(x[8], { interruptor: { web: true, android: false, ios: true }, coaches: 2, alumnos: 2, cobros_mes: 1 }, 'el estado para el admin: solo cantidades, sin montos');
  t.eq(x[9], { error: '42501', msg: 'Solo administradores.' }, 'un coach no cambia el interruptor');
  t.eq(x[10], { web: false, android: true, ios: true }, 'cambiar dos a la vez: se mezcla con lo que había');

  // ===== A la vez (lo que queda se guarda: va al final) =====
  await HACER('postgres', `${cuota(P.C, P.C1, 30000)}; ${cuota(P.C, P.N, 10000)}; update public.profiles set coach_id = '${P.C}' where id = '${P.N}'`);
  const aLaVez = (uid, q) => db.json(`begin;
    set local role authenticated;
    select set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', true);
    ${q} from (select pg_sleep(0.05)) z;
    select pg_sleep(0.4);
    commit;`).catch(e => ({ error: e.code, msg: e.msg }));
  // Dos toques con el mismo id (o un reintento mientras el primero sigue): un solo cobro.
  let [a, b] = await Promise.all([aLaVez(P.C, registrar(ID('c201'), P.C1, 30000)), aLaVez(P.C, registrar(ID('c201'), P.C1, 30000))]);
  t.eq([a.repetido, b.repetido].sort(), [false, true], 'el mismo id dos veces a la vez: uno anota y el otro contesta repetido: ' + JSON.stringify([a, b]));
  t.eq(await J(`select jsonb_build_array((select count(*) from public.coach_client_payments where id = '${ID('c201')}'), (${fila(P.C, P.C1)}))`),
    [1, { monto: 30000, meses: 1, vence: D.mas1m }], 'un solo cobro y el vencimiento de un mes');
  // Dos cobros distintos del mismo alumno a la vez: el segundo cubre desde donde termina el primero.
  [a, b] = await Promise.all([aLaVez(P.C, registrar(ID('c202'), P.C1, 30000)), aLaVez(P.C, registrar(ID('c203'), P.C1, 30000))]);
  const [pri, seg] = [a, b].sort((u, v) => String(u.desde).localeCompare(String(v.desde)));
  t.eq([pri.desde, pri.hasta, seg.desde], [D.mas1m, D.mas1m1m, D.mas1m1m], 'dos cobros a la vez del mismo alumno: uno detrás del otro: ' + JSON.stringify([a, b]));
  t.eq(await J(fila(P.C, P.C1)), { monto: 30000, meses: 1, vence: seg.hasta }, 'el vencimiento es el del segundo');
  // El mismo id para dos alumnos a la vez (no se bloquean entre sí): el segundo choca con el índice y contesta repetido.
  [a, b] = await Promise.all([aLaVez(P.C, registrar(ID('c204'), P.C1, 30000)), aLaVez(P.C, registrar(ID('c204'), P.N, 10000))]);
  t.eq([a.repetido, b.repetido].sort(), [false, true], 'el mismo id para dos alumnos a la vez: uno anota, el otro contesta repetido: ' + JSON.stringify([a, b]));
  t.eq(await J(`select to_jsonb(count(*)) from public.coach_client_payments where id = '${ID('c204')}'`), 1, 'un solo cobro con ese id');
  await db.borrar();
}

// ===== Volver a correr y volver atrás =====
async function correrYVolver(t, h, sql){
  const v = await h.nueva('gize_sin');
  const h0 = await huella(v);
  t.ok(['tabla:coach_client_fees', 'tabla:coach_client_payments'].every(k => h0[k] === 'kind=r rls=t force=f'), 'las dos tablas, con RLS');
  await v.sql(`update public.app_config set value = '{"web": false, "android": true, "ios": true}' where key = 'cobros';`);
  await v.archivo('supabase/cobros-coach.sql');
  t.eq(await v.json(`select value from public.app_config where key = 'cobros';`), { web: false, android: true, ios: true }, 'volver a correr el archivo no pisa el interruptor');
  t.eq(diferencias(h0, await huella(v)), { nuevas: [], faltan: [], cambian: [] }, 'corrido dos veces: la misma huella');
  const r = await v.intentar(volverAtras(sql), { una: true });
  t.ok(r.ok, 'volver atrás anda' + (r.ok ? '' : ': ' + r.msg));
  const d = diferencias(h0, await huella(v));
  t.eq([d.nuevas, d.cambian], [[], []], 'volver atrás no deja nada nuevo ni cambia lo que ya estaba');
  t.eq(d.faltan.filter(k => !/coach_client_(fees|payments)|^(fn|fnacl|fndueno):(cobro|cobros|admin_cobros)\w*\(/.test(k)), [], 'y saca solo lo de Cobros');
  t.ok(TODAS.every(s => d.faltan.some(k => k.startsWith('fn:' + nombre(s) + '('))) && d.faltan.includes('tabla:coach_client_fees'), 'las 16 funciones y las tablas');
  t.eq(await v.json(`select to_jsonb(count(*)) from public.app_config where key = 'cobros';`), 0, 'y el interruptor');
  await v.archivo('supabase/cobros-coach.sql');
  t.eq(diferencias(h0, await huella(v)), { nuevas: [], faltan: [], cambian: [] }, 'corrido otra vez: la misma huella');
  t.eq(await v.json(`select value from public.app_config where key = 'cobros';`), { web: true, android: false, ios: false }, 'y el interruptor como nace');
  await v.borrar();
  // Con Cobros aplicado, los gimnasios se pueden volver atrás (cobro_de_gimnasio pregunta antes de
  // usar vinculo_gym) y Cobros sigue andando sin ellos.
  const g = await h.nueva('gize_con');
  for (const f of [...GIMNASIOS].reverse()){
    const rr = await g.intentar(volverAtras(leer(f)), { una: true });
    t.ok(rr.ok, 'con Cobros, volver atrás ' + f + ' anda' + (rr.ok ? '' : ': ' + rr.msg));
  }
  const CO = 'c2000000-0000-4000-8000-000000000001', AL = 'c2000000-0000-4000-8000-000000000002';
  await g.sql(`insert into auth.users (id, email, raw_user_meta_data) values ('${CO}', 'co@ejemplo.test', '{"full_name":"Coach","role":"coach"}'),
      ('${AL}', 'al@ejemplo.test', '{"full_name":"Alumna"}');
    update public.profiles set coach_id = '${CO}' where id = '${AL}';`);
  const { V } = ayudas(g);
  const y = await V([['postgres', `select to_jsonb(to_regprocedure('public.vinculo_gym(uuid)') is null)`], [CO, guardar([AL], 1000, 1)],
    [CO, registrar('c2000000-0000-4000-8000-0000000000e1', AL, 1000)], [AL, MI]]);
  t.eq([y[0], y[1], y[2] && y[2].repetido, y[3] && y[3].estado], [true, { ok: 1 }, false, 'al_dia'], 'sin los gimnasios (vueltos atrás), Cobros sigue andando');
  await g.borrar();
  // Sin los archivos de antes: falla entero, sin crear nada.
  const vacia = await h.nueva(null);
  const e = await vacia.intentar(leer('supabase/cobros-coach.sql'), { una: true });
  t.ok(!e.ok && /Primero correr supabase\/suscripciones\.sql/.test(e.msg), 'en una base sin los archivos anteriores, se frena: ' + (e.msg || 'corrió'));
  t.eq(await vacia.json(`select to_jsonb(to_regclass('public.coach_client_fees') is null)`), true, 'y no creó nada');
  await vacia.borrar();
}
