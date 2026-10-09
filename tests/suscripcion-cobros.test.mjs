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
// - El tope cuenta solo los intentos que van a crear una suscripción: reusar el link no cuenta y
//   el frenado con 429 tampoco (antes cada toque frenado alargaba la espera).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

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

  // Checkout.
  const co = src.slice(src.indexOf('if (input.action === "checkout")'));
  const tope = /const CHECKOUTS_POR_HORA = (\d+);/.exec(src);
  t.ok(tope && Number(tope[1]) <= 10, 'tope de 10 checkouts por hora o menos');
  const ins = co.indexOf('.from("mp_checkouts").insert({ coach_id: coachId })'), cnt = co.indexOf('.from("mp_checkouts").select("id", { count: "exact", head: true })'), crea = co.indexOf('mp("/preapproval", {');
  t.ok(ins > 0 && cnt > ins && crea > cnt, 'anota el intento, cuenta y recién después crea la suscripción');
  t.ok(/> CHECKOUTS_POR_HORA\) \{\s*if \(mio\) await db\.from\("mp_checkouts"\)\.delete\(\)\.eq\("id", mio\.id\);\s*return json\(\{ error: "[^"]+" \}, 429\);/.test(co), 'pasado el tope, 429, y ese intento no cuenta');
  t.ok(/const \{ data: mio, error: ie \} = await db\.from\("mp_checkouts"\)\.insert\(\{ coach_id: coachId \}\)\.select\("id"\)\.maybeSingle\(\);/.test(co), 'se guarda el id del intento propio');
  t.ok(/if \(ne\.code !== "42P01" && ne\.code !== "PGRST205"\) return json\([^;]*503\);/.test(co), 'si no se puede contar (y la tabla existe), no se crea nada');
  const reusa = co.indexOf('bill.pending_plan === plan');
  t.ok(reusa > 0 && reusa < ins && /prev\.status === "pending" && prev\.init_point/.test(co) && /=== email\) return json\(\{ url: prev\.init_point \}\)/.test(co), 'reusa el link sin pagar del mismo plan y mail (antes de anotar el intento: no cuenta)');
  t.ok(/q = bill\.mp_pending_id \? q\.eq\("mp_pending_id", bill\.mp_pending_id\) : q\.is\("mp_pending_id", null\);/.test(co), 'el pendiente se guarda solo si no cambió');
  t.ok(/if \(se \|\| !saved \|\| !saved\.length\) \{[\s\S]*?await cancelarMP\(pa\.id\);/.test(co), 'si otro checkout ganó, da de baja la suscripción recién creada');
  const guarda = co.indexOf('const { data: saved, error: se } = await q.select'), baja = co.indexOf('await cancelarMP(bill.mp_pending_id)');
  t.ok(guarda > 0 && baja > guarda, 'el pendiente anterior se da de baja recién después de guardar el nuevo');

  // La tabla del tope.
  const sql = fs.readFileSync(path.join(ROOT, 'supabase/pagos-seguros.sql'), 'utf8');
  t.ok(/create table if not exists public\.mp_checkouts \(/.test(sql) && /create index if not exists mp_checkouts_coach_idx on public\.mp_checkouts \(coach_id, created_at\);/.test(sql), 'pagos-seguros.sql: tabla mp_checkouts (re-ejecutable)');
  t.ok(/alter table public\.mp_checkouts enable row level security;/.test(sql) && /revoke all on public\.mp_checkouts from anon, authenticated;/.test(sql), 'pagos-seguros.sql: mp_checkouts sin acceso desde la app');
  t.ok(!/@[a-z0-9-]+\.[a-z]{2,}/i.test(sql), 'sin mails en el SQL');
}
