// supabase/compras-google.sql (cobro con Google Play en Android: solo la base, apagada).
// 1) Leído: encabezado y de qué depende; lo primero controla que estén los archivos anteriores;
//    google_subs con RLS, sin políticas ni permisos para anon ni authenticated (solo el service role);
//    las columnas google_* de coach_billing; el interruptor nace apagado y volver a correr no lo pisa;
//    quién puede llamar cada función; no toca la política «config pública» ni redefine funciones de
//    otros archivos; sin mails ni uuids; el bloque para volver atrás; y que tests/pg/orden.txt lo
//    carga después de los archivos de los que depende.
// 2) Con Postgres de verdad (tests/pg.mjs; sin Postgres se saltea):
//    · el interruptor: apagado de entrada (también para las cuentas de prueba); «prueba» solo para
//      las cuentas marcadas como de prueba; «todos» para cualquiera con sesión; sin sesión no se
//      pregunta; un valor que no se entiende es «apagado»; la app no lo lee de app_config;
//    · el panel: solo administradores; valida lo que llega y no cambia nada si está mal; mezcla con
//      lo guardado (también con dos cambios a la vez); queda en admin_audit; el estado que anota la función; el resumen (activas, se
//      renuevan, de prueba) y la lista (60 días o pendientes, sin el código de la compra);
//    · google_subs: ni el coach ni anon la leen ni la escriben; el service role sí; los checks; se va
//      con la cuenta; coach_billing: el coach ve sus columnas google_* y no las puede cambiar;
//    · no borra ni cambia nada de lo que ya existía (huella), se puede correr dos veces, volver atrás
//      deja la base como antes y se vuelve a correr; con los gimnasios también corre;
//    · sin los archivos anteriores, o con el ia.sql de antes (sin IA Plus de Google), se frena sin
//      cambiar nada.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { conPg, leer, orden, volverAtras, huella, diferencias, lit } from './pg.mjs';
import { ayudas, conCanon } from './gimnasios-comun.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fn = (sql, name) => {
  const i = sql.indexOf('create or replace function public.' + name + '(');
  if (i < 0) return '';
  const a = sql.indexOf('$$', i), b = sql.indexOf('$$', a + 2);
  return sql.slice(i, b + 2);
};

const APP = ['compras_google()'], ADMIN = ['admin_compras_google(jsonb)'], AYUDAS = ['compras_google_config()'];
const TODAS = [...AYUDAS, ...APP, ...ADMIN];
const nombre = sig => sig.slice(0, sig.indexOf('('));
const ESTADOS = ['activa', 'gracia', 'espera', 'pausada', 'cancelada', 'vencida', 'pendiente', 'pendiente_cancelada'];

const U = { C: 'c3000000-0000-4000-8000-000000000001', T: 'c3000000-0000-4000-8000-000000000002', A: 'c3000000-0000-4000-8000-000000000003',
  AD: 'c3000000-0000-4000-8000-000000000004' };
const CG = 'select to_jsonb(public.compras_google())';
const ADM = p => `select to_jsonb(public.admin_compras_google(${p === undefined ? '' : lit(JSON.stringify(p)) + '::jsonb'}))`;
const CONFIG = `select value from public.app_config where key = 'compras_google'`;
const NO_ADMIN = { error: '42501', msg: 'Solo administradores.' };
const MAL = { error: '22023', msg: 'Revisá el cobro con Google Play: planes o plus, con apagado, prueba o todos.' };
const sinPermiso = f => ({ error: '42501', msg: 'permission denied for ' + f });

export default async ({ t: t0 }) => {
  const t = conCanon(t0);
  const file = path.join(ROOT, 'supabase/compras-google.sql');
  t.ok(fs.existsSync(file), 'existe supabase/compras-google.sql');
  if (!fs.existsSync(file)) return;
  const sql = fs.readFileSync(file, 'utf8');
  const code = sql.replace(/--[^\n]*/g, '');

  // ---------- 1) Leído ----------
  const cab = sql.slice(0, sql.indexOf('\ndo $$')).split('\n').map(l => l.replace(/^-- ?/, '')).join(' ');
  t.has(cab, 'Correr con el workflow "Supabase" → tarea sql → supabase/compras-google.sql', 'encabezado: cómo correrlo');
  t.has(cab, 'Se puede correr varias veces', 'encabezado: se puede correr varias veces');
  t.has(cab, 'supabase/suscripciones.sql, supabase/admin.sql, supabase/compras-apple.sql, supabase/cuentas-prueba.sql y supabase/ia.sql', 'encabezado: de qué depende');
  t.has(cab, 'ARRANCA APAGADO', 'encabezado: arranca apagado');
  t.has(cab, 'SOLO LA BASE: aplicarlo no cambia nada de lo que ve nadie', 'encabezado: aplicarlo no cambia nada visible');
  t.ok(/^do \$\$ begin\s+if to_regclass\('public\.coach_billing'\) is null/m.test(sql) && sql.indexOf('\ndo $$') < sql.indexOf('create table'),
    'lo primero controla que estén los archivos anteriores');
  t.ok(/attrelid = to_regclass\('public\.ia_plus'\) and attname = 'google_vence'/.test(sql.slice(0, sql.indexOf('create table'))),
    'y que ia.sql ya tenga IA Plus con Google Play');
  t.ok(code.includes('create table if not exists public.google_subs ('), 'google_subs: se crea si no está');
  t.ok(code.includes('alter table public.google_subs enable row level security;'), 'google_subs: RLS prendido');
  t.ok(code.includes('revoke all on public.google_subs from public, anon, authenticated;'), 'google_subs: sin permisos para public, anon ni authenticated');
  t.ok(code.includes('grant select, insert, update, delete on public.google_subs to service_role;'), 'google_subs: el service role con su grant escrito');
  t.ok(/user_id\s+uuid not null references auth\.users\(id\) on delete cascade/.test(code), 'google_subs: se va con la cuenta');
  t.ok(code.includes("check (estado in (" + ESTADOS.map(e => `'${e}'`).join(', ') + '))'), 'google_subs: los estados de una compra de Google');
  t.ok(/leido_at\s+timestamptz not null/.test(code), 'google_subs: cuándo se leyó de Google (una lectura vieja no pisa una nueva)');
  t.ok(!/create policy|alter policy|drop policy/i.test(code), 'sin políticas: no toca la «config pública» de app_config ni deja leer google_subs');
  t.ok(!/grant [^;]*on (table )?public\.(google_subs|app_config|coach_billing) to (anon|authenticated|public)/i.test(code), 'ningún grant a la app sobre las tablas');
  for (const c of ['google_token text', 'google_vence timestamptz', 'google_renueva boolean not null default false'])
    t.ok(code.includes('alter table public.coach_billing add column if not exists ' + c + ';'), 'coach_billing: ' + c);
  t.ok(code.includes(`insert into public.app_config (key, value) values ('compras_google', '{"planes": "apagado", "plus": "apagado"}')\n  on conflict (key) do nothing;`),
    'el interruptor nace apagado y volver a correr no lo pisa');
  // Fuera de lo suyo no escribe nada.
  const inserts = [...code.matchAll(/insert into public\.(\w+)/g)].map(x => x[1]), updates = [...code.matchAll(/update public\.(\w+)/g)].map(x => x[1]);
  const alters = [...code.matchAll(/alter table public\.(\w+)/g)].map(x => x[1]);
  t.ok(inserts.every(x => x === 'app_config') && updates.length === 0 && alters.every(x => ['google_subs', 'coach_billing'].includes(x)),
    'solo escribe el interruptor y sus columnas: ' + JSON.stringify({ inserts, updates, alters }));
  t.ok(!/drop table|delete from|truncate|drop (function|policy|index|trigger|column)/i.test(code), 'no borra nada (se puede volver a correr sin perder las compras)');
  t.ok(!/create trigger|cron\.|net\.http|create extension/i.test(code), 'sin triggers ni tareas programadas');
  // Cada función: nueva, security definer con search_path fijo y los permisos escritos.
  const creadas = [...code.matchAll(/create or replace function public\.(\w+)\(/g)].map(x => x[1]);
  t.eq(creadas.sort(), TODAS.map(nombre).sort(), 'crea estas 3 funciones');
  const otros = fs.readdirSync(path.join(ROOT, 'supabase')).filter(f => f.endsWith('.sql') && f !== 'compras-google.sql')
    .map(f => fs.readFileSync(path.join(ROOT, 'supabase', f), 'utf8')).join('\n');
  t.eq(creadas.filter(f => otros.includes('function public.' + f + '(')), [], 'ninguna está en otro archivo (no redefine nada)');
  for (const sig of TODAS) t.ok(/security definer set search_path = public as \$\$/.test(fn(code, nombre(sig))), nombre(sig) + ': security definer con search_path fijo');
  for (const sig of [...APP, ...ADMIN]){
    t.ok(code.includes('revoke all on function public.' + sig + ' from public, anon;'), sig + ': nada para public ni anon');
    t.ok(code.includes('grant execute on function public.' + sig + ' to authenticated;'), sig + ': con sesión');
  }
  for (const sig of AYUDAS){
    t.ok(code.includes('revoke all on function public.' + sig + ' from public, anon, authenticated;'), sig + ': la app no la llama');
    t.ok(!code.includes('grant execute on function public.' + sig), sig + ': interna, sin grant');
  }
  t.ok(/\$\$\s*(declare[\s\S]*?)?begin\s+perform public\.admin_assert\(\);/.test(fn(code, 'admin_compras_google')), 'admin_compras_google: lo primero es admin_assert');
  t.ok(/perform public\.admin_log\('compras_google'/.test(fn(code, 'admin_compras_google')), 'el interruptor queda en el registro de acciones');
  t.ok(!/purchase_token|linked_token/.test(fn(code, 'admin_compras_google').slice(fn(code, 'admin_compras_google').indexOf("'lista'"))), 'la lista del panel no lleva el código de la compra');
  t.ok(!/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/.test(sql), 'sin mails');
  t.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(sql), 'sin ids de cuentas');
  t.ok(!/https?:\/\//i.test(sql), 'sin links');
  // El bloque para volver atrás.
  const atras = volverAtras(sql);
  for (const sig of TODAS) t.ok(atras.replace(/\s+/g, ' ').includes('public.' + sig), 'volver atrás borra ' + sig);
  t.ok(atras.includes('drop table if exists public.google_subs;'), 'volver atrás borra google_subs');
  t.ok(['google_token', 'google_vence', 'google_renueva'].every(c => atras.includes('drop column if exists ' + c)), 'volver atrás saca las columnas de coach_billing');
  t.ok(atras.includes("delete from public.app_config where key in ('compras_google', 'compras_google_estado');"), 'volver atrás borra el interruptor y el estado');
  t.ok(code.includes("notify pgrst, 'reload schema';"), 'avisa a PostgREST');
  // La base de pruebas lo carga después de los archivos de los que depende.
  const o = orden();
  t.ok(o.includes('compras-google.sql') && ['suscripciones.sql', 'admin.sql', 'compras-apple.sql', 'cuentas-prueba.sql', 'ia.sql']
    .every(f => o.indexOf(f) >= 0 && o.indexOf(f) < o.indexOf('compras-google.sql')), 'tests/pg/orden.txt lo carga después de suscripciones, admin, compras-apple, cuentas-prueba e ia');

  // ---------- 2) Con Postgres ----------
  const h = await conPg(t);
  if (!h) return;
  await enLaBase(t, h);
  await vueltas(t, h, sql);
};

// ===== La base de hoy =====
async function enLaBase(t, h){
  const db = await h.nueva('gize_sin');
  try {
    await db.sql(`insert into auth.users (id, email, raw_user_meta_data) values
        ('${U.C}', 'coach@ejemplo.test', '{"full_name":"Coach Uno","role":"coach"}'), ('${U.T}', 'prueba@ejemplo.test', '{"full_name":"Coach de Prueba","role":"coach"}'),
        ('${U.A}', 'alumna@ejemplo.test', '{"full_name":"Alumna Uno"}'), ('${U.AD}', 'admin@ejemplo.test', '{"full_name":"Admin"}');
      insert into public.app_admins (user_id) values ('${U.AD}');
      insert into public.test_accounts (user_id) values ('${U.T}');
      update public.profiles set coach_id = '${U.C}' where id = '${U.A}';`);
    const { V } = ayudas(db);

    // ===== El interruptor y el panel =====
    const x = await V([
      ['postgres', CONFIG],
      [U.C, CG], [U.T, CG], [U.A, CG], ['anon', CG],
      [U.AD, ADM()], [U.C, ADM()], ['anon', ADM()],
      [U.AD, ADM({ planes: 'prueba' })], [U.C, CG], [U.T, CG],
      [U.AD, ADM({ plus: 'todos' })], [U.C, CG], [U.T, CG], [U.A, CG],
      [U.AD, ADM({ planes: 'si' })], [U.AD, ADM({ otro: 'todos' })], [U.AD, ADM({})], [U.AD, `select to_jsonb(public.admin_compras_google('"todos"'::jsonb))`],
      [U.AD, ADM({ planes: true })], [U.AD, ADM({ planes: 'todos', plus: 'mal' })], [U.C, ADM({ planes: 'todos' })],
      ['postgres', CONFIG],
      ['postgres', `select coalesce(jsonb_agg(jsonb_build_object('admin', admin_id, 'target', target, 'detalle', detail) order by id), '[]') from public.admin_audit where action = 'compras_google'`],
      [U.C, `select coalesce(jsonb_agg(key order by key), '[]') from public.app_config`], ['anon', `select coalesce(jsonb_agg(key order by key), '[]') from public.app_config`],
      ['postgres', `update public.app_config set value = '{"planes": "prendido", "plus": 1}' where key = 'compras_google'`],
      [U.T, CG], [U.AD, ADM()],
    ]);
    t.eq(x[0], { planes: 'apagado', plus: 'apagado' }, 'el interruptor nace apagado');
    t.eq([x[1], x[2], x[3]], [{ planes: false, plus: false }, { planes: false, plus: false }, { planes: false, plus: false }],
      'apagado: no se vende a nadie (tampoco a las cuentas de prueba)');
    t.eq(x[4], sinPermiso('function compras_google'), 'sin sesión no se pregunta');
    t.eq(x[5], { config: { planes: 'apagado', plus: 'apagado' }, estado: null, resumen: { activas: 0, renuevan: 0, prueba: 0 }, lista: [] }, 'el panel, de entrada');
    t.eq([x[6], x[7]], [NO_ADMIN, sinPermiso('function admin_compras_google')], 'el panel: ni un coach ni sin sesión');
    t.eq(x[8] && x[8].config, { planes: 'prueba', plus: 'apagado' }, 'planes: solo cuentas de prueba');
    t.eq([x[9], x[10]], [{ planes: false, plus: false }, { planes: true, plus: false }], '«prueba»: solo la cuenta marcada como de prueba');
    t.eq(x[11] && x[11].config, { planes: 'prueba', plus: 'todos' }, 'IA Plus: todos (se mezcla con lo que había)');
    t.eq([x[12], x[13], x[14]], [{ planes: false, plus: true }, { planes: true, plus: true }, { planes: false, plus: true }], '«todos»: cualquiera con sesión');
    t.eq(x.slice(15, 21), [MAL, MAL, MAL, MAL, MAL, MAL], 'valores que no son apagado, prueba o todos, claves de más, vacío o no es un objeto: no');
    t.eq(x[21], NO_ADMIN, 'un coach no lo cambia');
    t.eq(x[22], { planes: 'prueba', plus: 'todos' }, 'lo que estaba mal no cambió nada');
    t.eq(x[23], [{ admin: U.AD, target: null, detalle: { antes: { planes: 'apagado', plus: 'apagado' }, ahora: { planes: 'prueba', plus: 'apagado' } } },
      { admin: U.AD, target: null, detalle: { antes: { planes: 'prueba', plus: 'apagado' }, ahora: { planes: 'prueba', plus: 'todos' } } }],
      'cada cambio queda en admin_audit, con cómo estaba y cómo quedó');
    t.eq([x[24], x[25]], [['version'], ['version']], 'desde la app (con o sin sesión) app_config sigue mostrando solo «version»');
    t.eq(x[27], { planes: false, plus: false }, 'un valor guardado que no se entiende es «apagado»');
    t.eq(x[28] && x[28].config, { planes: 'apagado', plus: 'apagado' }, 'y el panel lo muestra apagado');

    // ===== google_subs y coach_billing =====
    const fila = (tok, uid) => `insert into public.google_subs (purchase_token, user_id, product_id, estado, leido_at)
      values ('${tok}', '${uid}', 'ar.com.gize.app.coach.p25', 'activa', now())`;
    const BILL = uid => `select jsonb_build_object('token', google_token, 'vence', google_vence, 'renueva', google_renueva) from public.coach_billing where coach_id = '${uid}'`;
    const y = await V([
      [U.C, 'select to_jsonb(count(*)) from public.google_subs'], ['anon', 'select to_jsonb(count(*)) from public.google_subs'],
      [U.C, fila('tok-c', U.C)], [U.C, `delete from public.google_subs`],
      ['servicio', fila('tok-c', U.C)], ['servicio', 'select to_jsonb(count(*)) from public.google_subs'],
      [U.C, BILL(U.C)], [U.C, `select to_jsonb(count(*)) from public.coach_billing where coach_id = '${U.T}'`],
      [U.C, `update public.coach_billing set google_renueva = true, google_vence = now() + interval '1 year', paid_until = now() + interval '1 year' where coach_id = '${U.C}'`],
      ['postgres', BILL(U.C)],
      ['servicio', `insert into public.google_subs (purchase_token, user_id, product_id, estado, leido_at) values ('tok-x', '${U.C}', 'ar.com.gize.app.coach.p25', 'activo', now())`],
      ['servicio', `insert into public.google_subs (purchase_token, user_id, product_id, estado) values ('tok-y', '${U.C}', 'ar.com.gize.app.coach.p25', 'activa')`],
      ['servicio', `insert into public.google_subs (purchase_token, user_id, product_id, estado, leido_at) values ('tok-z', 'c3000000-0000-4000-8000-0000000000ff', 'ar.com.gize.app.coach.p25', 'activa', now())`],
      ['servicio', `select jsonb_build_object('t', google_token, 'r', google_renueva) from public.coach_billing where coach_id = '${U.C}'`],
      ['postgres', `delete from auth.users where id = '${U.C}'`], ['postgres', 'select to_jsonb(count(*)) from public.google_subs'],
    ]);
    t.eq([y[0], y[1]], [sinPermiso('table google_subs'), sinPermiso('table google_subs')], 'google_subs: ni el coach ni sin sesión la leen');
    t.eq([y[2], y[3]], [sinPermiso('table google_subs'), sinPermiso('table google_subs')], 'ni la escriben ni la borran');
    t.eq([y[4], y[5]], [null, 1], 'el service role (la función) sí');
    t.eq(y[6], { token: null, vence: null, renueva: false }, 'coach_billing: el coach ve sus columnas de Google, vacías');
    t.eq(y[7], 0, 'y no ve la fila de otro coach');
    t.eq(y[9], { token: null, vence: null, renueva: false }, 'el coach no se puede poner un plan de Google: ' + JSON.stringify(y[8]));
    t.eq([y[10] && y[10].error, y[11] && y[11].error, y[12] && y[12].error], ['23514', '23502', '23503'],
      'un estado que no es de Google, sin cuándo se leyó o de una cuenta que no existe: no se guarda');
    t.eq(y[13], { t: null, r: false }, 'el service role también lee coach_billing');
    t.eq(y[15], 0, 'al borrar la cuenta se van sus compras de Google Play');

    // ===== El resumen y la lista del panel =====
    const S = (tok, uid, prod, pedido, estado, vence, renueva, prueba, revocada, reemplazada, hace) => `('${tok}', '${uid}', 'ar.com.gize.app.${prod}', ${lit(pedido)},
      '${estado}', ${vence}, ${renueva}, ${prueba}, ${revocada}, true, ${reemplazada}, now(), now() - interval '${hace}')`;
    const z = await V([
      ['servicio', `insert into public.google_subs (purchase_token, user_id, product_id, order_id, estado, expires_at, auto_renew, test, revoked, acknowledged, reemplazada, leido_at, updated_at) values
        ${S('tok-ad-1', U.AD, 'coach.p50', 'GPA.0004-0001', 'gracia', "now() + interval '2 days'", true, false, false, false, '30 minutes')},
        ${S('tok-c-2', U.C, 'coach.p25', 'GPA.0001-0002', 'activa', "now() + interval '20 days'", true, false, false, false, '1 hour')},
        ${S('tok-c-1', U.C, 'coach.p10', 'GPA.0001-0001', 'vencida', "now() - interval '1 day'", false, false, false, true, '2 hours')},
        ${S('tok-t-1', U.T, 'coach.p10', 'GPA.0002-0001', 'cancelada', "now() + interval '5 days'", false, true, false, false, '3 hours')},
        ${S('tok-a-1', U.A, 'iaplus.mensual', 'GPA.0003-0001', 'activa', "now() + interval '10 days'", true, false, true, false, '4 hours')},
        ${S('tok-a-4', U.A, 'iaplus.mensual', 'GPA.0003-0004', 'espera', "now() - interval '1 hour'", true, false, false, false, '5 hours')},
        ${S('tok-a-2', U.A, 'iaplus.mensual', null, 'pendiente', 'null', 'null', false, false, false, '100 days')},
        ${S('tok-a-3', U.A, 'iaplus.mensual', 'GPA.0003-0000', 'vencida', "now() - interval '90 days'", false, false, false, false, '90 days')}`],
      ['servicio', `insert into public.app_config (key, value) values ('compras_google_estado', '{"aviso_at": "2026-10-30T14:05:00Z", "tipo": "prueba"}')`],
      [U.AD, ADM()],
      [U.C, `select coalesce(jsonb_agg(key order by key), '[]') from public.app_config`],
    ]);
    t.eq(z[0], null, 'el service role guarda las compras');
    t.eq(z[1], null, 'y el estado del último aviso');
    const p = z[2] || {};
    t.eq(p.estado, { aviso_at: '2026-10-30T14:05:00Z', tipo: 'prueba' }, 'el panel ve el último aviso de Google Play');
    t.eq(p.resumen, { activas: 3, renuevan: 2, prueba: 1 },
      'resumen: activa, en gracia y cancelada todavía paga cuentan; la reembolsada, la reemplazada y la suspendida no; se renuevan las que siguen');
    t.eq((p.lista || []).map(l => l.pedido || l.estado), ['GPA.0004-0001', 'GPA.0001-0002', 'GPA.0001-0001', 'GPA.0002-0001', 'GPA.0003-0001', 'GPA.0003-0004', 'pendiente'],
      'la lista: lo de los últimos 60 días y lo pendiente, de lo más reciente a lo más viejo');
    const l = (p.lista || []).find(i => i.pedido === 'GPA.0001-0002') || {};
    t.eq([l.user_id, l.email, l.nombre, l.producto, l.estado, l.renueva, l.prueba, l.revocada, l.reemplazada, l.reconocida],
      [U.C, 'coach@ejemplo.test', 'Coach Uno', 'ar.com.gize.app.coach.p25', 'activa', true, false, false, false, true], 'cada compra con la cuenta, el producto y cómo está');
    t.eq((p.lista || []).flatMap(i => Object.keys(i)).filter(k => /token/.test(k)), [], 'sin el código de la compra');
    t.eq(z[3], ['version'], 'el estado no se ve desde la app');

    // Dos administradores cambian el interruptor a la vez (uno los planes, otro IA Plus): no se pisan.
    const aLaVez = q => db.json(`begin;
      set local role authenticated;
      select set_config('request.jwt.claims', '{"sub":"${U.AD}","role":"authenticated"}', true);
      ${q} from (select pg_sleep(0.05)) z;
      select pg_sleep(0.4);
      commit;`).catch(e => ({ error: e.code, msg: e.msg }));
    const [a, b] = await Promise.all([aLaVez(ADM({ planes: 'todos' })), aLaVez(ADM({ plus: 'prueba' }))]);
    t.ok(a.config && b.config, 'los dos cambios a la vez andan: ' + JSON.stringify([a, b]));
    t.eq(await db.json(`${CONFIG};`), { planes: 'todos', plus: 'prueba' }, 'dos cambios a la vez: quedan los dos');
  } finally {
    await db.borrar();
  }
}

// ===== Correrlo dos veces, volver atrás y el orden =====
async function vueltas(t, h, sql){
  const antes = await h.nueva(null);
  const hoy = await h.nueva('gize_sin');
  try {
    // La base de hoy sin este archivo.
    await antes.archivos(['tests/pg/supabase-simulado.sql', 'tests/pg/esquema-base.sql',
      ...orden().filter(f => f !== 'compras-google.sql').map(f => 'supabase/' + f), 'tests/pg/ayudas.sql']);
    const hAntes = await huella(antes), hHoy = await huella(hoy);
    const d = diferencias(hAntes, hHoy);
    t.eq([d.faltan, d.cambian], [[], []], 'compras-google.sql no borra ni cambia nada de lo que ya existía');
    const esNuevo = k => /^(tabla|tblacl):google_subs$/.test(k) || /^(col|con|idx|pol|trg|colacl):google_subs\./.test(k)
      || /^col:coach_billing\.google_(token|vence|renueva)$/.test(k) || /^(fn|fnacl|fndueno):(compras_google|compras_google_config|admin_compras_google)\(/.test(k);
    t.eq(d.nuevas.filter(k => !esNuevo(k)), [], 'lo nuevo es solo lo suyo: google_subs, tres columnas de coach_billing y tres funciones');
    t.eq(hHoy['tabla:google_subs'], 'kind=r rls=t force=f', 'google_subs con RLS');
    t.ok(/anon=- authenticated=- /.test(hHoy['tblacl:google_subs'] || '') && /service_role=[^ ]*select,[^ ]*update/.test(hHoy['tblacl:google_subs'] || ''),
      'google_subs: nada para anon ni authenticated, el service role sí: ' + hHoy['tblacl:google_subs']);
    t.eq([hHoy['col:coach_billing.google_token'], hHoy['col:coach_billing.google_vence'], hHoy['col:coach_billing.google_renueva']],
      ['text', 'timestamp with time zone', 'boolean not null default false'], 'las columnas de coach_billing');
    t.eq(Object.keys(hHoy).filter(k => /^fnacl:(compras_google|compras_google_config|admin_compras_google)\(/.test(k)).sort().map(k => k.replace(/\(.*/, '') + ' ' + hHoy[k]),
      ['fnacl:admin_compras_google anon=false authenticated=true service_role=true', 'fnacl:compras_google anon=false authenticated=true service_role=true',
        'fnacl:compras_google_config anon=false authenticated=false service_role=true'], 'permisos: nada sin sesión; la interna, ni con sesión');

    // Corrido otra vez: lo mismo, y no pisa el interruptor.
    await hoy.sql(`update public.app_config set value = '{"planes": "todos", "plus": "prueba"}' where key = 'compras_google';`);
    await hoy.archivo('supabase/compras-google.sql');
    t.eq(await hoy.json(`${CONFIG};`), { planes: 'todos', plus: 'prueba' }, 'volver a correr el archivo no pisa el interruptor');
    t.eq(diferencias(hHoy, await huella(hoy)), { nuevas: [], faltan: [], cambian: [] }, 'corrido dos veces: la misma huella');
    await antes.archivo('supabase/compras-google.sql');
    t.eq(diferencias(hHoy, await huella(antes)), { nuevas: [], faltan: [], cambian: [] }, 'cargado sobre la base sin él: la huella de la base de hoy');
    // Volver atrás: exactamente la base sin él.
    const r = await antes.intentar(volverAtras(sql), { una: true });
    t.ok(r.ok, 'volver atrás anda' + (r.ok ? '' : ': ' + r.msg));
    t.eq(diferencias(hAntes, await huella(antes)), { nuevas: [], faltan: [], cambian: [] }, 'volver atrás deja la base exactamente como antes');
    t.eq(await antes.json(`select to_jsonb(count(*)) from public.app_config where key like 'compras_google%';`), 0, 'y sin el interruptor');
    await antes.archivo('supabase/compras-google.sql');
    t.eq(diferencias(hHoy, await huella(antes)), { nuevas: [], faltan: [], cambian: [] }, 'y se puede volver a correr después de volver atrás');
    t.eq(await antes.json(`${CONFIG};`), { planes: 'apagado', plus: 'apagado' }, 'con el interruptor apagado');

    // Con el ia.sql de antes (ia_plus sin las columnas de Google) se frena sin cambiar nada; con el de ahora, anda.
    await antes.sql(volverAtras(sql), { una: true });
    await antes.sql('alter table public.ia_plus drop column google_vence;');
    const e = await antes.intentar(leer('supabase/compras-google.sql'), { una: true });
    t.ok(!e.ok && /supabase\/ia\.sql/.test(e.msg || ''), 'con el ia.sql de antes se frena y pide correrlo: ' + (e.msg || 'corrió'));
    t.eq(await antes.json(`select to_jsonb(to_regclass('public.google_subs') is null)`), true, 'y no crea nada');
    await antes.archivo('supabase/ia.sql');
    const e2 = await antes.intentar(leer('supabase/compras-google.sql'), { una: true });
    t.ok(e2.ok, 'después de volver a correr ia.sql, anda' + (e2.ok ? '' : ': ' + e2.msg));

    // Sin los archivos de los que depende, se frena sin cambiar nada.
    const vacia = await h.nueva(null);
    try {
      await vacia.archivos(['tests/pg/supabase-simulado.sql', 'tests/pg/esquema-base.sql']);
      const v = await vacia.intentar(leer('supabase/compras-google.sql'), { una: true });
      t.ok(!v.ok && /Primero correr supabase\/suscripciones\.sql/.test(v.msg || ''), 'sin los archivos anteriores: se frena con el aviso: ' + (v.msg || 'corrió'));
      t.eq(await vacia.json(`select to_jsonb(to_regclass('public.google_subs') is null)`), true, 'y no crea nada');
    } finally { await vacia.borrar(); }

    // Con los gimnasios aplicados también se vuelve a correr y anda.
    const g = await h.nueva('gize_con');
    try {
      const rg = await g.intentar(leer('supabase/compras-google.sql'), { una: true });
      t.ok(rg.ok, 'con los gimnasios, se vuelve a correr' + (rg.ok ? '' : ': ' + rg.msg));
      const { V } = ayudas(g);
      await g.sql(`insert into auth.users (id, email, raw_user_meta_data) values ('${U.C}', 'coach@ejemplo.test', '{"full_name":"Coach Uno","role":"coach"}');`);
      t.eq(await V([[U.C, CG]]), [{ planes: false, plus: false }], 'con los gimnasios, compras_google() contesta igual');
    } finally { await g.borrar(); }
  } finally {
    await antes.borrar();
    await hoy.borrar();
  }
}
