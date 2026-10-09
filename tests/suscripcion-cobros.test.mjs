// Suscripciones de Mercado Pago de los coaches (supabase/functions/suscripcion):
// - Un cobro de la suscripción vigente (la renovación del mes) ya no borra el cambio de plan
//   que el coach dejó pedido: antes se borraba y, cuando pagaba el plan nuevo, se lo daba de
//   baja por «no pedido» y se quedaba con el viejo.
// - El mail a los socios sale solo por la suscripción vigente (o la pedida cuando se autoriza),
//   no por cada checkout que se crea y se da de baja sin pagar.
// - Checkout: tope de 10 por hora por coach, se reusa el link sin pagar del mismo plan y el
//   pendiente se guarda solo si nadie lo cambió mientras tanto.
// - El cambio de plan pedido que se cancela sin pagarse se borra (antes lo borraba el cobro de
//   la vigente; sin eso quedaba para siempre).
// - El tope de 10 cuenta solo los intentos que crean una suscripción y el frenado con 429 no
//   cuenta (antes cada toque frenado alargaba la espera). Reusar el link sin pagar igual lo
//   consulta en Mercado Pago: tiene su tope aparte, de 30 por hora (antes no tenía ninguno).
//   El checkout se prueba corriendo la función (tests/funcion.mjs) con Mercado Pago simulado.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { funcion, supabaseSimulado, cumple } from './funcion.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = 'supabase/functions/suscripcion';

export default async function ({ t }){
  let r = null;
  try { r = await import(pathToFileURL(path.join(ROOT, DIR, 'reglas.ts')).href); }
  catch (e) { t.ok(false, 'no se pudo cargar ' + DIR + '/reglas.ts: ' + (e && e.message ? e.message.split('\n')[0] : e)); }
  if (r){
    // Coach con el plan de 10 (X) que pidió pasar al de 25 (Y) y todavía no lo pagó.
    const hasta = new Date('2026-11-04T00:00:00Z'), ahora = new Date('2026-10-05T12:00:00Z');
    let cur = { plan: 'p10', max_clients: 10, mp_preapproval_id: 'X', mp_status: 'authorized', mp_pending_id: 'Y', pending_plan: 'p25' };
    // 1) Llega el cobro del mes de X.
    t.ok(r.esPedida(cur, 'X'), 'la vigente cuenta');
    const a = r.alCobrar(cur, 'X', 'p10', 10, hasta, ahora);
    t.eq(a.cancelar, null, 'cobro de la vigente: no se da de baja nada');
    t.ok(!('mp_pending_id' in a.update) && !('pending_plan' in a.update), 'cobro de la vigente: el cambio de plan pedido queda');
    t.eq(a.update.mp_preapproval_id, 'X', 'sigue la misma suscripción');
    t.eq(a.update.paid_until, hasta.toISOString(), 'avanza el plan pago');
    cur = { ...cur, ...a.update };
    t.eq([cur.mp_pending_id, cur.pending_plan], ['Y', 'p25'], 'después del cobro de X sigue pedido el plan de 25');
    // 2) El coach paga Y: es la pedida, pasa a ser la vigente y X se da de baja.
    t.ok(r.esPedida(cur, 'Y'), 'la pedida cuenta (no se da de baja por «no pedida»)');
    const b = r.alCobrar(cur, 'Y', 'p25', 25, hasta, ahora);
    t.eq(b.cancelar, 'X', 'cobro de la pedida: se da de baja la anterior');
    t.eq([b.update.plan, b.update.max_clients, b.update.mp_preapproval_id, b.update.mp_pending_id, b.update.pending_plan], ['p25', 25, 'Y', null, null], 'cobro de la pedida: plan nuevo y sin pendiente');
    // Otra suscripción cualquiera (un checkout viejo) no cuenta.
    t.ok(!r.esPedida({ mp_preapproval_id: 'Y', mp_pending_id: null }, 'Z'), 'un checkout viejo no cuenta');

    // Mails a los socios.
    const c = { mp_preapproval_id: 'X', mp_pending_id: 'Y' };
    t.ok(r.avisaSocios(c, 'X', 'cancelled') && r.avisaSocios(c, 'X', 'paused') && r.avisaSocios(c, 'X', 'authorized'), 'la vigente avisa sus cambios');
    t.ok(r.avisaSocios(c, 'Y', 'authorized'), 'la pedida avisa cuando se autoriza («Suscripción nueva»)');
    t.ok(!r.avisaSocios(c, 'Y', 'cancelled'), 'la pedida que se da de baja sin pagar no avisa');
    t.ok(!r.avisaSocios(c, 'Z', 'cancelled') && !r.avisaSocios(c, 'Z', 'authorized'), 'un checkout viejo no avisa');
    t.ok(!r.avisaSocios({ mp_preapproval_id: null, mp_pending_id: 'P2' }, 'P1', 'cancelled'), 'coach en prueba: los checkouts que se dan de baja no avisan');

    // La pedida que se cancela sin pagarse.
    t.ok(r.pedidaCancelada(c, 'Y', 'cancelled'), 'la pedida cancelada: se borra el cambio de plan');
    t.ok(r.pedidaCancelada({ mp_preapproval_id: null, mp_pending_id: 'P2' }, 'P2', 'cancelled'), 'coach en prueba: su checkout cancelado también se borra');
    t.ok(!r.pedidaCancelada(c, 'Y', 'pending') && !r.pedidaCancelada(c, 'Y', 'authorized') && !r.pedidaCancelada(c, 'Y', 'paused'), 'la pedida sin cancelar queda');
    t.ok(!r.pedidaCancelada(c, 'X', 'cancelled') && !r.pedidaCancelada(c, 'Z', 'cancelled'), 'la vigente o un checkout viejo cancelados no borran el pedido');
    t.ok(!r.pedidaCancelada({ mp_preapproval_id: 'X', mp_pending_id: null }, 'Y', 'cancelled'), 'sin pedido, nada');
    t.ok(!r.pedidaCancelada({ mp_preapproval_id: 'X', mp_pending_id: 'X' }, 'X', 'cancelled'), 'si la pedida es la vigente, no es un pedido que cae');
  }

  const src = fs.readFileSync(path.join(ROOT, DIR, 'index.ts'), 'utf8');
  const sync = src.slice(src.indexOf('async function syncPreapproval('), src.indexOf('async function cancelarMP('));
  t.ok(/import \{ alCobrar, avisaSocios, esPedida, pedidaCancelada \} from "\.\/reglas\.ts";/.test(src), 'index.ts usa reglas.ts');
  t.ok(/if \(est && avisaSocios\(cur, id, String\(pa\.status\)\)\) \{/.test(sync), 'syncPreapproval: el mail a los socios pasa por avisaSocios');
  t.ok(/if \(!esPedida\(cur, id\)\) \{/.test(sync), 'syncPreapproval: la que no es vigente ni pedida se da de baja');
  t.ok(/const \{ update, cancelar \} = alCobrar\(cur, id, plan, PLANES\[plan\]\.max, paidUntil\);/.test(sync) && /\.update\(update\)\.eq\("coach_id", coachId\)/.test(sync), 'syncPreapproval: guarda lo que dice alCobrar');
  const cae = sync.indexOf('} else if (pedidaCancelada(cur, id, String(pa.status))) {');
  t.ok(cae > sync.indexOf('} else if (id === cur.mp_preapproval_id) {') && /\} else if \(pedidaCancelada\(cur, id, String\(pa\.status\)\)\) \{[^}]*\.update\(\{ pending_plan: null, mp_pending_id: null, updated_at: [^}]*\}\)\s*\.eq\("coach_id", coachId\)\.eq\("mp_pending_id", id\);/.test(sync),
    'syncPreapproval: la pedida cancelada borra el cambio de plan (si no pidió otro mientras tanto)');
  t.ok(sync.indexOf('pending_plan: null') === sync.lastIndexOf('pending_plan: null') && sync.indexOf('pending_plan: null') > cae, 'syncPreapproval: ya no borra el pendiente en ningún otro caso');

  // Checkout: lo que no se ve corriendo la función (dos checkouts a la vez).
  const co = src.slice(src.indexOf('if (input.action === "checkout")'));
  t.ok(/q = bill\.mp_pending_id \? q\.eq\("mp_pending_id", bill\.mp_pending_id\) : q\.is\("mp_pending_id", null\);/.test(co), 'el pendiente se guarda solo si no cambió');
  t.ok(/if \(se \|\| !saved \|\| !saved\.length\) \{[\s\S]*?await cancelarMP\(pa\.id\);/.test(co), 'si otro checkout ganó, da de baja la suscripción recién creada');
  const guarda = co.indexOf('const { data: saved, error: se } = await q.select'), baja = co.indexOf('await cancelarMP(bill.mp_pending_id)');
  t.ok(guarda > 0 && baja > guarda, 'el pendiente anterior se da de baja recién después de guardar el nuevo');
  const topes = [/const CHECKOUTS_POR_HORA = (\d+);/.exec(src), /const REUSOS_POR_HORA = (\d+);/.exec(src)].map(m => m && Number(m[1]));
  t.ok(topes[0] && topes[0] <= 10 && topes[1] && topes[1] <= 30, 'topes por hora: 10 para crear y 30 para reusar, o menos: ' + topes);

  // ---- Checkout de verdad: la función con Supabase y Mercado Pago simulados ----
  // tabla: 'ok' | 'sin-tabla' | 'sin-columna' | 'falla' (no se puede contar).
  const COACH = 'c0ac4000-0000-4000-8000-000000000001', MAIL = 'coach@prueba.test';
  const checkout = async ({ tabla = 'ok', pendiente = null } = {}) => {
    const bill = { coach_id: COACH, plan: 'trial', mp_preapproval_id: null, mp_status: null, mp_pending_id: null, pending_plan: null };
    const intentos = [], mp = [];
    let n = 0, creadas = 0;
    const db = supabaseSimulado(q => {
      if (q.tabla === 'profiles') return q.count ? { count: 0 } : { data: { role: 'coach' } };
      if (q.tabla === 'coach_billing'){
        if (q.accion === 'select') return { data: Object.assign({}, bill) };
        if (q.accion === 'update'){ if (!cumple(bill, q.filtros)) return { data: [] }; Object.assign(bill, q.valores); return { data: [{ coach_id: COACH }] }; }
      }
      if (q.tabla === 'mp_checkouts'){
        if (tabla === 'sin-tabla') return { error: { code: 'PGRST205', message: 'no existe mp_checkouts' } };
        if (q.accion === 'insert'){
          if (tabla === 'sin-columna' && 'reuso' in q.valores) return { error: { code: 'PGRST204', message: 'no existe reuso' } };
          const f = Object.assign({ id: ++n, created_at: new Date().toISOString(), reuso: false }, q.valores);
          intentos.push(f); return { data: { id: f.id } };
        }
        if (q.accion === 'select'){ if (tabla === 'falla') return { error: { code: '57014', message: 'tardó demasiado' } }; return { count: intentos.filter(f => cumple(f, q.filtros)).length }; }
        if (q.accion === 'delete'){ for (let i = intentos.length - 1; i >= 0; i--) if (cumple(intentos[i], q.filtros)) intentos.splice(i, 1); return { data: null }; }
      }
      return { data: null };
    }, { user: { id: COACH, email: MAIL } });
    // Mercado Pago simulado: cada suscripción creada queda «pending» con su link.
    const subs = {};
    if (pendiente) { subs.P0 = { id: 'P0', status: 'pending', init_point: 'https://mp.test/P0', external_reference: COACH + '|' + pendiente, payer_email: MAIL }; Object.assign(bill, { mp_pending_id: 'P0', pending_plan: pendiente }); }
    const fetch = async (url, init = {}) => {
      const m = (init.method || 'GET'), u = new URL(String(url));
      mp.push(m + ' ' + u.pathname);
      if (m === 'POST' && u.pathname === '/preapproval'){
        const b = JSON.parse(init.body), id = 'P' + (++creadas);
        subs[id] = { id, status: 'pending', init_point: 'https://mp.test/' + id, external_reference: b.external_reference, payer_email: b.payer_email };
        return new Response(JSON.stringify(subs[id]), { status: 201 });
      }
      const id = decodeURIComponent(u.pathname.split('/').pop());
      if (m === 'PUT') subs[id].status = 'cancelled';
      return new Response(JSON.stringify(subs[id] || {}), { status: subs[id] ? 200 : 404 });
    };
    const fn = await funcion('suscripcion', { fetch,
      env: { MP_ACCESS_TOKEN: 'TEST', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'srv' },
      npm: { '@supabase/supabase-js': { createClient: () => db } } });
    const pagar = async (plan) => {
      const r = await fn.call(new Request('https://x.supabase.co/functions/v1/suscripcion', { method: 'POST', headers: { Authorization: 'Bearer x' }, body: JSON.stringify({ action: 'checkout', plan, mp_email: MAIL }) }));
      return { status: r.status, ...(await r.json()) };
    };
    return { pagar, bill, intentos, mp };
  };
  const cuenta = (lista, re) => lista.filter(x => re.test(x)).length;
  {
    // Reusar el link: cada toque lo consulta en Mercado Pago, hasta 30 por hora.
    const x = await checkout({ pendiente: 'p25' });
    const res = [];
    for (let i = 0; i < 35; i++) res.push(await x.pagar('p25'));
    t.ok(res.slice(0, 30).every(r => r.status === 200 && r.url === 'https://mp.test/P0'), 'reusar: los primeros 30 devuelven el mismo link');
    t.ok(res.slice(30).every(r => r.status === 429), 'reusar: del 31 en adelante, 429 (antes no tenía tope)');
    t.eq([cuenta(x.mp, /^GET \/preapproval\//), cuenta(x.mp, /^POST/)], [30, 0], 'reusar: 30 consultas a Mercado Pago y ninguna suscripción nueva');
    t.eq(x.intentos.length, 30, 'reusar: los frenados no quedan anotados');
    // Los de crear se cuentan aparte: cambiar de plan sigue andando.
    const r = await x.pagar('p50');
    t.ok(r.status === 200 && r.url === 'https://mp.test/P1' && x.bill.mp_pending_id === 'P1', 'reusar no gasta los de crear: ' + JSON.stringify(r));
  }
  {
    // Crear: 10 por hora (cambiando de plan cada vez, así no se reusa).
    const x = await checkout();
    const res = [];
    for (let i = 0; i < 10; i++) res.push(await x.pagar(i % 2 ? 'p50' : 'p25'));
    t.ok(res.every(r => r.status === 200 && /^https:\/\/mp\.test\/P\d+$/.test(r.url)), 'crear: los primeros 10 crean un link');
    // El último pedido fue el de 50: otro plan ya no se puede crear, el de 50 se reusa.
    const mas = [await x.pagar('p25'), await x.pagar('p25'), await x.pagar('p100')];
    t.ok(mas.every(r => r.status === 429), 'crear: del 11 en adelante, 429: ' + mas.map(r => r.status));
    t.eq(cuenta(x.mp, /^POST \/preapproval$/), 10, 'crear: 10 suscripciones en Mercado Pago');
    t.eq(x.intentos.filter(f => !f.reuso).length, 10, 'crear: los frenados no quedan anotados (no alargan la espera)');
    t.ok(cuenta(x.mp, /^PUT/) === 9, 'crear: cada link nuevo da de baja el anterior sin pagar');
    const r = await x.pagar('p50');
    t.ok(r.status === 200 && r.url === res[9].url, 'crear: pasado el tope, el link sin pagar se sigue reusando');
  }
  {
    // Si no se puede contar (con la tabla), no se consulta ni se crea nada.
    const x = await checkout({ tabla: 'falla', pendiente: 'p25' });
    const a = await x.pagar('p25'), b = await x.pagar('p50');
    t.ok(a.status === 503 && b.status === 503 && x.mp.length === 0, 'sin poder contar: 503 y nada a Mercado Pago');
  }
  for (const tabla of ['sin-tabla', 'sin-columna']){
    // Sin correr el SQL: se sigue como antes, para no cortar los cobros.
    const x = await checkout({ tabla, pendiente: 'p25' });
    const a = await x.pagar('p25'), b = await x.pagar('p50');
    t.ok(a.status === 200 && a.url === 'https://mp.test/P0' && b.status === 200 && b.url === 'https://mp.test/P1', tabla + ': reusa y crea igual: ' + JSON.stringify([a, b]));
  }

  // La tabla del tope.
  const sql = fs.readFileSync(path.join(ROOT, 'supabase/pagos-seguros.sql'), 'utf8');
  t.ok(/create table if not exists public\.mp_checkouts \(/.test(sql) && /create index if not exists mp_checkouts_coach_idx on public\.mp_checkouts \(coach_id, created_at\);/.test(sql), 'pagos-seguros.sql: tabla mp_checkouts (re-ejecutable)');
  t.ok(/alter table public\.mp_checkouts enable row level security;/.test(sql) && /revoke all on public\.mp_checkouts from anon, authenticated;/.test(sql), 'pagos-seguros.sql: mp_checkouts sin acceso desde la app');
  t.ok(/alter table public\.mp_checkouts add column if not exists reuso boolean not null default false;/.test(sql), 'pagos-seguros.sql: la columna reuso (re-ejecutable)');
  t.ok(!/@[a-z0-9-]+\.[a-z]{2,}/i.test(sql), 'sin mails en el SQL');
}
