// IA Plus en las funciones, corriendo en Node con Supabase, Mercado Pago y Apple simulados
// (tests/funcion.mjs; nada sale a internet):
// - Reglas (suscripcion/iaplus.ts): el cobro extiende hasta un mes (+3 días) desde el último cobro,
//   aplicarlo dos veces da lo mismo, una suscripción nueva es un contrato nuevo (vuelve el
//   arrepentimiento), un aviso tardío no le devuelve IA Plus a quien se arrepintió, el botón de
//   arrepentimiento vale 10 días corridos y un cobro devuelto corta IA Plus.
// - suscripcion (Mercado Pago, web): el checkout de IA Plus lo puede pedir cualquier cuenta (no solo
//   coaches), solo con IA Plus prendido y el precio confirmado, con el precio del panel en pesos;
//   no se vende a quien ya lo tiene (incluido, Apple, Google Play o Mercado Pago); reusa el link sin pagar; el
//   webhook (con la referencia «iaplus|<cuenta>») escribe ia_plus y nunca coach_billing, también dos
//   veces; el cobro aprobado queda anotado y uno devuelto corta; otra autorizada que no es la
//   pedida se da de baja; botón de baja y botón de arrepentimiento (cancela, devuelve con clave de
//   idempotencia y corta ahora; fuera de los 10 días, no). Arreglos de la revisión: después de
//   arrepentirse no se puede volver a suscribir por 60 días (si no: suscribirse, usar, devolver y
//   de nuevo, sin pagar nunca); el arrepentimiento devuelve el cobro de la suscripción vigente,
//   nunca uno de una anterior (y si no lo encuentra, avisa para devolverlo a mano); después del
//   botón de baja, el arrepentimiento anda aunque Mercado Pago no acepte cancelar de nuevo; una
//   devolución desde Mercado Pago o un contracargo (avisos «payment» y «chargebacks») cortan.
// - compras-apple (iPhone): el producto de IA Plus lo compra un alumno (va a ia_plus, no a
//   coach_billing), un plan de coach no; los avisos de Apple: renovación, período de gracia,
//   vencimiento y reembolso; la app y la función usan el mismo id de producto. IA Plus en Sandbox
//   (TestFlight), solo para las cuentas de la lista del panel (ia_config.plus.sandbox).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { funcion, supabaseSimulado, cumple } from './funcion.mjs';
import { autoridad, firmar, tx as txCoach, ren as renCoach, aviso, DIA } from './compras-apple.test.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const importar = f => import(pathToFileURL(path.join(ROOT, f)).href);
const iso = ms => new Date(ms).toISOString();
const UID = 'a1a1a1a1-0000-4000-8000-000000000001', COACH = 'c0ac4000-0000-4000-8000-0000000000a1', MAIL = 'alumno@prueba.test';
const ENV = { MP_ACCESS_TOKEN: 'TEST', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'srv' };
const PLUS = 'ar.com.gize.app.iaplus.mensual';

export default async function ({ t }){
  // ---------- 1) Reglas ----------
  const R = await importar('supabase/functions/suscripcion/iaplus.ts');
  {
    const cobro = new Date('2026-10-05T12:00:00Z'), ahora = new Date('2026-10-05T12:01:00Z');
    t.eq(R.uidDeRef('iaplus|' + UID), UID, 'la referencia de IA Plus lleva la cuenta');
    t.eq([R.uidDeRef(COACH + '|p25'), R.uidDeRef('iaplus|cualquiera'), R.uidDeRef(null)], [null, null, null], 'las de los planes de coach (o rotas) no son de IA Plus');
    let cur = { mp_pending_id: 'A' };
    const a = R.plusAlCobrar(cur, 'A', cobro, ahora);
    t.eq([a.update.mp_preapproval_id, a.update.mp_status, a.update.mp_hasta, a.update.mp_desde, a.update.mp_pending_id, a.cancelar],
      ['A', 'authorized', '2026-11-08T12:00:00.000Z', cobro.toISOString(), null, null], 'primer cobro: cubre un mes y 3 días, desde ahí corre el arrepentimiento');
    cur = { ...cur, ...a.update };
    t.eq(R.plusAlCobrar(cur, 'A', cobro, ahora).update.mp_hasta, a.update.mp_hasta, 'el mismo cobro dos veces da lo mismo');
    const b = R.plusAlCobrar(cur, 'A', new Date('2026-11-05T12:00:00Z'), ahora);
    t.ok(b.update.mp_hasta === '2026-12-08T12:00:00.000Z' && !('mp_desde' in b.update), 'la renovación extiende y no cambia desde cuándo cobra');
    t.ok(R.puedeArrepentirse(cur, Date.parse('2026-10-14T12:00:00Z')) && !R.puedeArrepentirse(cur, Date.parse('2026-10-15T12:00:01Z')), 'arrepentimiento: 10 días corridos desde el primer cobro');
    t.eq(R.plusAlCobrar({ ...cur, arrepentido_at: '2026-10-06T00:00:00Z' }, 'A', cobro, ahora), null, 'después del arrepentimiento, un aviso tardío no devuelve IA Plus');
    t.ok(!R.puedeArrepentirse({ ...cur, arrepentido_at: '2026-10-06T00:00:00Z' }, Date.parse('2026-10-07T00:00:00Z')), 'el arrepentimiento, una vez por suscripción');
    const c = R.plusAlCobrar({ ...cur, arrepentido_at: '2026-10-06T00:00:00Z', mp_pending_id: 'B' }, 'B', new Date('2026-10-20T00:00:00Z'), ahora);
    t.ok(c.update.mp_desde === '2026-10-20T00:00:00.000Z' && c.update.arrepentido_at === null && c.cancelar === 'A', 'una suscripción nueva es un contrato nuevo y la anterior se da de baja');
    t.ok(R.plusAlDevolver({ mp_pago_id: '9', mp_hasta: '2026-11-08T00:00:00Z' }, '9', Date.parse('2026-10-10T00:00:00Z')).mp_hasta === '2026-10-10T00:00:00.000Z', 'cobro devuelto: corta ahora');
    const d = R.plusAlCobrar({ mp_preapproval_id: 'A', mp_pago_id: '9', mp_pago_pa: 'A', mp_pending_id: 'B' }, 'B', cobro, ahora);
    t.ok(d.update.mp_pago_id === null && d.update.mp_pago_pa === null, 'suscripción nueva: el cobro anotado de la anterior se olvida');
    const e = R.plusAlCobrar({ mp_preapproval_id: 'A', mp_pago_id: '10', mp_pago_pa: 'B', mp_pending_id: 'B' }, 'B', cobro, ahora);
    t.ok(!('mp_pago_id' in e.update), 'suscripción nueva cuyo cobro llegó antes: queda anotado');
    t.eq([R.pagoDeLaVigente({ mp_preapproval_id: 'B', mp_pago_id: '9', mp_pago_pa: 'A' }), R.pagoDeLaVigente({ mp_preapproval_id: 'B', mp_pago_id: '10', mp_pago_pa: 'B' })], [null, '10'], 'el cobro que se devuelve es solo el de la vigente');
    const arr = Date.parse('2026-10-06T00:00:00Z');
    t.ok(R.esperaTrasArrepentirse({ ultimo_arrepentido_at: iso(arr) }, arr + 59 * DIA) === arr + 60 * DIA && R.esperaTrasArrepentirse({ ultimo_arrepentido_at: iso(arr) }, arr + 61 * DIA) === 0, 'después de arrepentirse: 60 días sin volver a suscribirse');
    t.eq(R.plusAlDevolver({ mp_pago_id: '9', mp_hasta: '2026-11-08T00:00:00Z' }, '8', Date.now()), null, 'un cobro viejo devuelto no corta');
  }

  // ---------- 2) suscripcion (Mercado Pago) ----------
  // o: { plus (config), fila (ia_plus), incluido, rol, subs (suscripciones de MP) }
  const mpSim = async (o = {}) => {
    const st = { plus: o.fila ? { user_id: UID, updated_at: '2026-10-01T00:00:00Z', ...o.fila } : null, billing: [], checkouts: [], mp: [], avisos: [], bodies: [] };
    const cfg = Object.assign({ activa: true, gratis_semana: 3, precio_ars: 4500, precio_confirmado: true }, o.plus || {});
    const subs = Object.assign({}, o.subs || {});
    let creadas = 0, n = 0;
    const db = supabaseSimulado(q => {
      if (q.tabla === 'profiles') return { data: q.columnas === 'role' ? { role: o.rol || 'client' } : { id: UID, full_name: 'Alumno' } };
      if (q.tabla === 'ia_config') return { data: { plus: cfg } };
      if (q.tabla === 'ia_plus_incluido') return { data: !!o.incluido };
      if (q.tabla === 'pedido_baja'){ (st.pedidos = st.pedidos || []).push(q.valores); return { data: o.pedido || { ok: true, codigo: 'GZ-ABCDEF12', cuenta: true } }; }
      if (q.tabla === 'coach_billing'){ st.billing.push(q); return { data: null }; }
      if (q.tabla === 'mp_avisos'){ st.avisos.push(q.valores && q.valores.clave); return { data: null }; }
      if (q.tabla === 'mp_checkouts'){
        if (q.accion === 'insert'){ const f = { id: ++n, created_at: new Date().toISOString(), reuso: false, ...q.valores }; st.checkouts.push(f); return { data: { id: f.id } }; }
        if (q.accion === 'select') return { count: st.checkouts.filter(f => cumple(f, q.filtros)).length };
        return { data: null };
      }
      if (q.tabla === 'ia_plus'){
        if (q.accion === 'select') return { data: st.plus && cumple(st.plus, q.filtros) ? { ...st.plus } : null };
        if (q.accion === 'insert'){ if (st.plus) return { error: { code: '23505', message: 'ya está' } }; st.plus = { updated_at: new Date().toISOString(), ...q.valores }; return { data: [{ user_id: UID }] }; }
        if (q.accion === 'update'){ if (!st.plus || !cumple(st.plus, q.filtros)) return { data: [] }; Object.assign(st.plus, q.valores); return { data: [{ user_id: UID }] }; }
      }
      return { data: null };
    }, { user: { id: UID, email: MAIL } });
    const fetch = async (url, init = {}) => {
      const m = init.method || 'GET', u = new URL(String(url));
      st.mp.push(m + ' ' + u.pathname); if (init.body) st.bodies.push([m + ' ' + u.pathname, JSON.parse(init.body), init.headers || {}]);
      if (u.hostname === 'api.resend.com') return new Response('{}', { status: 200 });
      if (m === 'POST' && u.pathname === '/preapproval'){
        const b = JSON.parse(init.body), id = 'P' + (++creadas);
        subs[id] = { id, status: 'pending', init_point: 'https://mp.test/' + id, external_reference: b.external_reference, payer_email: b.payer_email, auto_recurring: b.auto_recurring };
        return new Response(JSON.stringify(subs[id]), { status: 201 });
      }
      if (m === 'POST' && /\/refunds$/.test(u.pathname)) return o.devolucionFalla ? new Response('{"message":"no"}', { status: 400 }) : new Response('{"id":1}', { status: 201 });
      if (o.rutas){ const x = o.rutas(m, u); if (x) return new Response(JSON.stringify(x), { status: x.falla ? 500 : 200 }); }
      const id = decodeURIComponent(u.pathname.split('/').pop());
      if (m === 'PUT' && subs[id]){
        // Como Mercado Pago (puede pasar): no deja modificar una suscripción ya cancelada.
        if (o.rechazaCancelada && subs[id].status === 'cancelled') return new Response('{"message":"cannot modify a cancelled preapproval"}', { status: 400 });
        subs[id].status = 'cancelled';
      }
      return new Response(JSON.stringify(subs[id] || {}), { status: subs[id] ? 200 : 404 });
    };
    const fn = await funcion('suscripcion', { fetch, env: Object.assign({ RESEND_API_KEY: 're', AVISOS_PAGOS: 'socios@prueba.test' }, ENV), npm: { '@supabase/supabase-js': { createClient: () => db } } });
    const app = async body => { const r = await fn.call(new Request('https://x.supabase.co/functions/v1/suscripcion', { method: 'POST', headers: { Authorization: 'Bearer x' }, body: JSON.stringify(body) })); return { status: r.status, ...(await r.json()) }; };
    const hook = async (type, id) => (await fn.call(new Request('https://x.supabase.co/functions/v1/suscripcion?webhook=1', { method: 'POST', body: JSON.stringify({ type, data: { id } }) }))).status;
    const publico = async body => { const r = await fn.call(new Request('https://x.supabase.co/functions/v1/suscripcion?pedido=1', { method: 'POST', body: JSON.stringify(body) })); return { status: r.status, ...(await r.json()) }; };
    return { st, subs, app, hook, publico, logs: fn.logs };
  };
  const cobrada = (id, o = {}) => ({ id, status: 'authorized', external_reference: 'iaplus|' + UID, auto_recurring: { transaction_amount: 4500 },
    summarized: { last_charged_date: '2026-10-19T12:00:00.000Z', charged_quantity: 1 }, date_created: '2026-10-19T11:00:00Z', ...o });
  {
    // Checkout: cualquier cuenta (un alumno), con el precio del panel.
    let x = await mpSim();
    let r = await x.app({ action: 'iaplus_checkout', mp_email: MAIL });
    t.eq([r.status, r.url], [200, 'https://mp.test/P1'], 'checkout de IA Plus para un alumno: el link de Mercado Pago');
    const pedido = x.st.bodies.find(b => b[0] === 'POST /preapproval')[1];
    t.eq([pedido.reason, pedido.external_reference, pedido.auto_recurring.transaction_amount, pedido.auto_recurring.currency_id, pedido.auto_recurring.frequency_type, pedido.back_url],
      ['GIZE IA Plus · mensual', 'iaplus|' + UID, 4500, 'ARS', 'months', 'https://gize.ar/app/?pago=iaplus'], 'la suscripción: nombre, referencia, precio del panel en pesos, mensual y la vuelta a la app');
    t.eq([x.st.plus && x.st.plus.mp_pending_id, x.st.billing.length], ['P1', 0], 'queda pedida en ia_plus y no toca coach_billing');
    r = await x.app({ action: 'iaplus_checkout', mp_email: MAIL });
    t.ok(r.url === 'https://mp.test/P1' && x.st.mp.filter(m => m === 'POST /preapproval').length === 1, 'otro toque: reusa el link sin pagar');
    r = await x.app({ action: 'iaplus_checkout', mp_email: 'otro@prueba.test' });
    t.ok(r.url === 'https://mp.test/P2' && x.st.mp.includes('PUT /preapproval/P1') && x.st.plus.mp_pending_id === 'P2', 'con otro mail: una nueva y la anterior se da de baja');

    for (const [que, o, status] of [['IA Plus apagado', { plus: { activa: false } }, 403], ['precio sin confirmar', { plus: { precio_confirmado: false } }, 403], ['incluido con el coach', { incluido: true }, 400],
      ['ya con Apple', { fila: { apple_vence: iso(Date.now() + 5 * DIA) } }, 400], ['ya con Mercado Pago', { fila: { mp_preapproval_id: 'A', mp_status: 'authorized', mp_hasta: iso(Date.now() + 5 * DIA) } }, 400]]){
      x = await mpSim(o);
      r = await x.app({ action: 'iaplus_checkout', mp_email: MAIL });
      t.ok(r.status === status && !x.st.mp.includes('POST /preapproval'), que + ': no se vende (' + r.status + ' ' + r.error + ')');
    }
    // IA Plus pagado con Google Play (app de Android, función compras-google): tampoco se vende por
    // Mercado Pago (pagaría dos veces). Ya vencido, sí.
    x = await mpSim({ fila: { google_token: 'compra-de-prueba_1', google_vence: iso(Date.now() + 5 * DIA), google_renueva: true } });
    r = await x.app({ action: 'iaplus_checkout', mp_email: MAIL });
    t.ok(r.status === 400 && r.error === 'Ya tenés IA Plus con Google Play.' && r.codigo === 'ya' && !x.st.mp.includes('POST /preapproval'),
      'ya con Google Play: no se vende (' + r.status + ' ' + r.error + ')');
    x = await mpSim({ fila: { google_token: 'compra-de-prueba_1', google_vence: iso(Date.now() - DIA), google_renueva: false } });
    r = await x.app({ action: 'iaplus_checkout', mp_email: MAIL });
    t.ok(r.status === 200 && r.url === 'https://mp.test/P1', 'con IA Plus de Google Play ya vencido, sí se vende');

    // Webhook: se cobra la pedida → ia_plus, nunca coach_billing; dos veces da lo mismo.
    x = await mpSim({ fila: { mp_pending_id: 'P1' }, subs: { P1: cobrada('P1') } });
    t.eq(await x.hook('subscription_preapproval', 'P1'), 200, 'webhook: 200');
    const f1 = { ...x.st.plus };
    t.eq([f1.mp_preapproval_id, f1.mp_status, f1.mp_hasta, f1.mp_desde, f1.mp_pending_id], ['P1', 'authorized', '2026-11-22T12:00:00.000Z', '2026-10-19T12:00:00.000Z', null], 'cobrada: IA Plus hasta un mes y 3 días');
    t.eq(x.st.billing.length, 0, 'el webhook de IA Plus no toca coach_billing');
    t.ok(x.st.avisos.includes('pa:P1:authorized'), 'aviso a los socios: IA Plus nueva');
    await x.hook('subscription_preapproval', 'P1');
    t.eq([x.st.plus.mp_hasta, x.st.plus.mp_desde], [f1.mp_hasta, f1.mp_desde], 'el mismo aviso dos veces: igual');
    // El cobro aprobado queda anotado; uno devuelto corta.
    x.subs.AP1 = { id: 'AP1', preapproval_id: 'P1', transaction_amount: 4500, currency_id: 'ARS', payment: { id: 991, status: 'approved' } };
    await x.hook('subscription_authorized_payment', 'AP1');
    t.eq([x.st.plus.mp_pago_id, x.st.plus.mp_pago_pa], ['991', 'P1'], 'cobro aprobado: queda anotado con su suscripción (es el que se devuelve con el arrepentimiento)');
    x.subs.AP1.payment.status = 'refunded';
    await x.hook('subscription_authorized_payment', 'AP1');
    t.ok(Date.parse(x.st.plus.mp_hasta) <= Date.now() + 1000, 'cobro devuelto desde Mercado Pago: IA Plus se corta');

    // Otra autorizada que no es la pedida: se da de baja.
    x = await mpSim({ fila: { mp_preapproval_id: 'P1', mp_status: 'authorized', mp_hasta: iso(Date.now() + 20 * DIA) }, subs: { Z: cobrada('Z') } });
    await x.hook('subscription_preapproval', 'Z');
    t.ok(x.st.mp.includes('PUT /preapproval/Z') && x.st.plus.mp_preapproval_id === 'P1', 'otra autorizada que no es la pedida: se da de baja');
    // Cancelada desde Mercado Pago: sigue hasta el final.
    x = await mpSim({ fila: { mp_preapproval_id: 'P1', mp_status: 'authorized', mp_hasta: iso(Date.now() + 20 * DIA) }, subs: { P1: cobrada('P1', { status: 'cancelled' }) } });
    await x.hook('subscription_preapproval', 'P1');
    t.ok(x.st.plus.mp_status === 'cancelled' && Date.parse(x.st.plus.mp_hasta) > Date.now() + 19 * DIA, 'cancelada en Mercado Pago: sigue hasta el final del mes pago');

    // Botón de baja.
    x = await mpSim({ fila: { mp_preapproval_id: 'P1', mp_status: 'authorized', mp_hasta: iso(Date.now() + 20 * DIA) }, subs: { P1: cobrada('P1') } });
    r = await x.app({ action: 'iaplus_cancel' });
    t.ok(r.status === 200 && x.st.mp.includes('PUT /preapproval/P1') && x.st.plus.mp_status === 'cancelled' && Date.parse(x.st.plus.mp_hasta) > Date.now(), 'botón de baja: cancela la renovación y sigue hasta el final');
    r = await x.app({ action: 'iaplus_cancel' });
    t.eq(r.status, 400, 'ya cancelada: no hay nada que dar de baja');

    // Botón de arrepentimiento.
    const reciente = { mp_preapproval_id: 'P1', mp_status: 'authorized', mp_desde: iso(Date.now() - 3 * DIA), mp_hasta: iso(Date.now() + 28 * DIA), mp_pago_id: '991', mp_pago_pa: 'P1' };
    x = await mpSim({ fila: reciente, subs: { P1: cobrada('P1') } });
    r = await x.app({ action: 'iaplus_arrepentimiento' });
    const dev = x.st.bodies.find(b => b[0] === 'POST /v1/payments/991/refunds');
    t.ok(r.status === 200 && r.devuelto === true && x.st.mp.includes('PUT /preapproval/P1') && !!dev, 'arrepentimiento: cancela y pide la devolución del cobro');
    t.eq(dev && dev[2]['X-Idempotency-Key'], 'iaplus-arrepentimiento-991', 'la devolución va con clave de idempotencia (un segundo toque no devuelve dos veces)');
    t.ok(Date.parse(x.st.plus.mp_hasta) <= Date.now() + 1000 && !!x.st.plus.arrepentido_at, 'arrepentimiento: IA Plus se corta ahora');
    r = await x.app({ action: 'iaplus_arrepentimiento' });
    t.eq(r.status, 400, 'una sola vez');
    x = await mpSim({ fila: reciente, subs: { P1: cobrada('P1') }, devolucionFalla: true });
    r = await x.app({ action: 'iaplus_arrepentimiento' });
    t.ok(r.status === 200 && r.devuelto === false && x.st.avisos.includes('arrep:P1') && !!x.st.plus.arrepentido_at, 'si la devolución no sale: igual se corta y se avisa a los socios para devolverla a mano');
    x = await mpSim({ fila: { ...reciente, mp_desde: iso(Date.now() - 11 * DIA) }, subs: { P1: cobrada('P1') } });
    r = await x.app({ action: 'iaplus_arrepentimiento' });
    t.ok(r.status === 400 && !x.st.mp.length, 'pasados los 10 días: no (puede cancelar igual)');

    // Suscribirse, usar, arrepentirse y volver a suscribirse: los 60 días de espera cortan la vuelta.
    x = await mpSim();
    r = await x.app({ action: 'iaplus_checkout', mp_email: MAIL });
    x.subs.P1 = cobrada('P1', { summarized: { last_charged_date: new Date().toISOString(), charged_quantity: 1 } });
    await x.hook('subscription_preapproval', 'P1');
    x.subs.AP1 = { id: 'AP1', preapproval_id: 'P1', transaction_amount: 4500, payment: { id: 901, status: 'approved' } };
    await x.hook('subscription_authorized_payment', 'AP1');
    r = await x.app({ action: 'iaplus_arrepentimiento' });
    t.ok(r.status === 200 && r.devuelto === true && x.st.plus.arrepentimientos === 1 && !!x.st.plus.ultimo_arrepentido_at, 'arrepentimiento: queda contado');
    const antes = x.st.mp.filter(m => m === 'POST /preapproval').length;
    r = await x.app({ action: 'iaplus_checkout', mp_email: MAIL });
    t.ok(r.status === 400 && r.codigo === 'espera' && /Vas a poder volver a suscribirte a IA Plus desde el/.test(r.error) && x.st.mp.filter(m => m === 'POST /preapproval').length === antes,
      'recién arrepentido: no se puede volver a suscribir (' + r.error + ')');
    x = await mpSim({ fila: { mp_preapproval_id: 'P1', mp_status: 'cancelled', mp_hasta: iso(Date.now() - 61 * DIA), ultimo_arrepentido_at: iso(Date.now() - 61 * DIA), arrepentimientos: 1 } });
    r = await x.app({ action: 'iaplus_checkout', mp_email: MAIL });
    t.eq(r.status, 200, 'pasados los 60 días, sí');

    // Se vuelve a suscribir (P2) y el aviso del cobro llega antes de que Mercado Pago lo muestre en
    // la suscripción: el cobro queda anotado con P2 y el arrepentimiento devuelve ese, no el de P1.
    const viejo = { mp_preapproval_id: 'P1', mp_status: 'cancelled', mp_desde: iso(Date.now() - 90 * DIA), mp_hasta: iso(Date.now() - 20 * DIA), mp_pago_id: '991', mp_pago_pa: 'P1', mp_pending_id: 'P2' };
    x = await mpSim({ fila: viejo, subs: { P2: cobrada('P2', { summarized: { charged_quantity: 0 } }) } });
    x.subs.AP2 = { id: 'AP2', preapproval_id: 'P2', transaction_amount: 4500, payment: { id: 992, status: 'approved' } };
    await x.hook('subscription_authorized_payment', 'AP2');
    x.subs.P2 = cobrada('P2', { summarized: { last_charged_date: new Date().toISOString(), charged_quantity: 1 } });
    await x.hook('subscription_preapproval', 'P2');
    t.eq([x.st.plus.mp_preapproval_id, x.st.plus.mp_pago_id, x.st.plus.mp_pago_pa], ['P2', '992', 'P2'], 'el cobro que llegó antes queda con su suscripción');
    r = await x.app({ action: 'iaplus_arrepentimiento' });
    t.eq(x.st.mp.filter(m => /refunds/.test(m)), ['POST /v1/payments/992/refunds'], 'arrepentimiento: devuelve el cobro de la vigente, no el de la anterior');
    // Sin el aviso del cobro: no devuelve el de la anterior; lo busca en Mercado Pago.
    x = await mpSim({ fila: viejo, subs: { P2: cobrada('P2', { summarized: { last_charged_date: new Date().toISOString(), charged_quantity: 1 } }) },
      rutas: (m, u) => u.pathname === '/authorized_payments/search' && u.searchParams.get('preapproval_id') === 'P2'
        ? { results: [{ id: 'AP9', preapproval_id: 'P2', payment: { id: 993, status: 'approved' } }, { id: 'AP8', preapproval_id: 'P1', payment: { id: 991, status: 'approved' } }] } : null });
    await x.hook('subscription_preapproval', 'P2');
    t.eq([x.st.plus.mp_preapproval_id, x.st.plus.mp_pago_id], ['P2', null], 'suscripción nueva sin su cobro: el de la anterior se olvida');
    r = await x.app({ action: 'iaplus_arrepentimiento' });
    t.ok(r.devuelto === true && x.st.mp.filter(m => /refunds/.test(m)).join() === 'POST /v1/payments/993/refunds', 'sin el cobro anotado: lo busca en Mercado Pago y devuelve el de esta suscripción');
    x = await mpSim({ fila: viejo, subs: { P2: cobrada('P2', { summarized: { last_charged_date: new Date().toISOString(), charged_quantity: 1 } }) } });
    await x.hook('subscription_preapproval', 'P2');
    r = await x.app({ action: 'iaplus_arrepentimiento' });
    t.ok(r.status === 200 && r.devuelto === false && !x.st.mp.some(m => /refunds/.test(m)) && x.st.avisos.includes('arrep:P2'), 'si no lo encuentra: no devuelve otro y avisa a los socios para hacerlo a mano');

    // Botón de baja y después arrepentimiento, con Mercado Pago que no deja cancelar de nuevo.
    x = await mpSim({ fila: reciente, subs: { P1: cobrada('P1') }, rechazaCancelada: true });
    r = await x.app({ action: 'iaplus_cancel' });
    const r2 = await x.app({ action: 'iaplus_arrepentimiento' });
    t.ok(r.status === 200 && r2.status === 200 && r2.devuelto === true && x.st.mp.includes('POST /v1/payments/991/refunds') && !!x.st.plus.arrepentido_at,
      'baja y después arrepentimiento (dentro de los 10 días): devuelve igual (' + r2.status + ' ' + (r2.error || '') + ')');
    // Si Mercado Pago rechaza la cancelación y la suscripción sigue activa: 502, no devuelve.
    x = await mpSim({ fila: reciente, subs: { P1: cobrada('P1') }, rutas: (m, u) => m === 'PUT' ? { falla: true } : null });
    x.subs.P1.status = 'authorized';
    r = await x.app({ action: 'iaplus_arrepentimiento' });
    t.ok(r.status === 502 && !x.st.mp.some(m => /refunds/.test(m)) && !x.st.plus.arrepentido_at, 'Mercado Pago no cancela y sigue activa: avisa que pruebe de nuevo y no devuelve');

    // Devolución desde Mercado Pago (aviso «payment») o contracargo («chargebacks»): corta.
    const pago = st => (m, u) => u.pathname === '/v1/payments/991' ? { id: 991, status: st } : u.pathname === '/v1/chargebacks/CB1' ? { id: 'CB1', payments: [991] } : null;
    const conPlus = { mp_preapproval_id: 'P1', mp_status: 'authorized', mp_desde: iso(Date.now() - 20 * DIA), mp_hasta: iso(Date.now() + 10 * DIA), mp_pago_id: '991', mp_pago_pa: 'P1' };
    x = await mpSim({ fila: conPlus, rutas: pago('refunded') });
    t.eq(await x.hook('payment', '991'), 200, 'aviso «payment»: 200');
    t.ok(Date.parse(x.st.plus.mp_hasta) <= Date.now() + 1000, 'devuelto desde Mercado Pago (aviso «payment»): IA Plus se corta');
    x = await mpSim({ fila: conPlus, rutas: pago('charged_back') });
    await x.hook('topic_chargebacks_wh', 'CB1');
    t.ok(Date.parse(x.st.plus.mp_hasta) <= Date.now() + 1000, 'contracargo de la tarjeta (aviso «chargebacks»): IA Plus se corta');
    x = await mpSim({ fila: conPlus, rutas: pago('approved') });
    await x.hook('payment', '991');
    t.ok(Date.parse(x.st.plus.mp_hasta) > Date.now() + 9 * DIA, 'un aviso «payment» de un pago aprobado no cambia nada');
    x = await mpSim({ fila: conPlus, rutas: pago('refunded') });
    await x.hook('payment', '555');
    t.ok(Date.parse(x.st.plus.mp_hasta) > Date.now() + 9 * DIA && !x.st.mp.includes('GET /v1/payments/555'), 'un pago que no es de IA Plus: ni se consulta');

    // Botón de arrepentimiento y de baja sin sesión (gize.ar/baja/).
    x = await mpSim();
    r = await x.publico({ tipo: 'arrepentimiento', servicio: 'iaplus', email: ' Alumno@Prueba.test ', detalle: 'op 123' });
    t.eq([r.status, r.codigo], [200, 'GZ-ABCDEF12'], 'pedido sin sesión: contesta con el código');
    t.eq(x.st.pedidos, [{ p_tipo: 'arrepentimiento', p_servicio: 'iaplus', p_email: 'alumno@prueba.test', p_detalle: 'op 123' }], 'lo guarda (mail en minúsculas)');
    t.ok(x.st.avisos.includes('pedido:GZ-ABCDEF12'), 'avisa a los socios');
    const mailUsuario = x.st.bodies.find(b => b[0] === 'POST /emails' && JSON.stringify(b[1].to) === '["alumno@prueba.test"]');
    t.ok(!!mailUsuario && /GZ-ABCDEF12/.test(mailUsuario[1].subject), 'le manda el código por mail a la cuenta');
    t.ok(!x.st.mp.some(m => /preapproval|refunds/.test(m)), 'no cancela ni devuelve nada solo');
    x = await mpSim({ pedido: { ok: true, codigo: 'GZ-00000001', cuenta: false } });
    r = await x.publico({ tipo: 'baja', servicio: 'coach', email: 'cualquiera@prueba.test' });
    t.ok(r.status === 200 && !x.st.bodies.some(b => b[0] === 'POST /emails' && JSON.stringify(b[1].to) === '["cualquiera@prueba.test"]'), 'mail que no es de una cuenta: no se le manda nada');
    x = await mpSim({ pedido: { ok: false, codigo: 'muchos' } });
    r = await x.publico({ tipo: 'baja', servicio: 'iaplus', email: 'a@prueba.test' });
    t.eq(r.status, 429, 'muchos pedidos con el mismo mail: 429');
  }

  // ---------- 3) compras-apple ----------
  const P = await importar('supabase/functions/compras-apple/planes.ts');
  const A = await importar('app/core/compras-apple.js').catch(() => ({}));
  t.eq(P.IA_PLUS_APPLE, PLUS, 'el producto de IA Plus en App Store Connect');
  t.eq(A.PRODUCTO_IA_PLUS, P.IA_PLUS_APPLE, 'la app y la función usan el mismo producto de IA Plus');
  t.ok(!Object.keys(A.PRODUCTOS_APPLE || {}).includes(PLUS), 'IA Plus no está entre los planes de coach de la app');
  const ca = autoridad();
  const tx = (o = {}) => txCoach({ productId: PLUS, appAccountToken: UID, transactionId: '3000000000000001', originalTransactionId: '3000000000000001', ...o });
  const ren = (o = {}) => renCoach({ originalTransactionId: '3000000000000001', autoRenewProductId: PLUS, productId: PLUS, ...o });
  const apple = async (o = {}) => {
    const st = { plus: o.fila ? { user_id: UID, updated_at: '2026-10-01T00:00:00Z', ...o.fila } : null, subs: [], billing: [] };
    const db = supabaseSimulado(q => {
      if (q.tabla === 'profiles') return { data: { role: o.rol || 'client' } };
      if (q.tabla === 'coach_billing'){ st.billing.push(q); return { data: null }; }
      // Las compras de prueba (Sandbox) valen solo para las cuentas de la lista del panel; la simulada es usuario@prueba.test.
      if (q.tabla === 'ia_config') return { data: o.sandbox === null ? { plus: { activa: true } } : { plus: { activa: true, sandbox: o.sandbox || ['revision@prueba.test', 'Usuario@Prueba.test'] } } };
      if (q.tabla === 'apple_subs'){
        const hay = st.subs.filter(r => cumple(r, q.filtros));
        if (q.accion === 'select') return { data: hay[0] ? { ...hay[0] } : null };
        if (q.accion === 'insert'){ st.subs.push({ ...q.valores }); return { data: null }; }
        if (q.accion === 'update'){ hay.forEach(r => Object.assign(r, q.valores)); return { data: hay.map(r => ({ original_transaction_id: r.original_transaction_id })) }; }
      }
      if (q.tabla === 'ia_plus'){
        if (q.accion === 'select') return { data: st.plus && cumple(st.plus, q.filtros) ? { ...st.plus } : null };
        if (q.accion === 'insert'){ if (st.plus) return { error: { code: '23505', message: 'ya está' } }; st.plus = { updated_at: '2026-10-01T00:00:00Z', apple_renueva: false, ...q.valores }; return { data: null }; }
        if (q.accion === 'update'){ if (!st.plus || !cumple(st.plus, q.filtros)) return { data: [] }; Object.assign(st.plus, q.valores); return { data: [{ user_id: UID }] }; }
      }
      return { data: null };
    }, { user: { id: UID, email: MAIL } });
    const fn = await funcion('compras-apple', { env: ENV, npm: { '@supabase/supabase-js': { createClient: () => db } },
      modulos: { './raiz-apple.ts': { RAIZ_APPLE_G3: ca.pem, RAIZ_APPLE_G3_SHA256: ca.huella } } });
    const pedir = async (cuerpo, auth = true) => { const r = await fn.call(new Request('https://x.supabase.co/functions/v1/compras-apple', { method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, auth ? { Authorization: 'Bearer x' } : {}), body: JSON.stringify(cuerpo) })); return { status: r.status, body: await r.json().catch(() => ({})) }; };
    return { st, app: jws => pedir({ jws }), aviso: p => pedir({ signedPayload: p }, false) };
  };
  {
    const vence = Date.now() + 30 * DIA;
    let x = await apple();
    let r = await x.app(firmar(ca, tx({ expiresDate: vence })));
    t.eq([r.status, r.body], [200, { ok: true }], 'un alumno compra IA Plus con Apple: ok');
    t.eq([x.st.plus && x.st.plus.apple_original_tx, x.st.plus && x.st.plus.apple_vence, x.st.plus && x.st.plus.apple_renueva], ['3000000000000001', iso(vence), true], 'queda en ia_plus: hasta cuándo y que se renueva');
    t.ok(!x.st.billing.some(q => q.accion === 'update') && x.st.subs.length === 1 && x.st.subs[0].product_id === PLUS, 'no toca coach_billing; queda en apple_subs');
    r = await x.app(firmar(ca, tx({ expiresDate: vence })));
    t.eq([r.status, x.st.plus.apple_vence], [200, iso(vence)], 'mandarla dos veces da lo mismo');
    r = await x.app(firmar(ca, txCoach({ appAccountToken: UID })));
    t.ok(r.status === 403 && !x.st.billing.some(q => q.accion === 'update'), 'un alumno no compra un plan de coach: 403');
    r = await x.app([firmar(ca, tx({ expiresDate: vence })), firmar(ca, txCoach({ appAccountToken: UID }))]);
    t.eq(r.body.resultados && r.body.resultados.map(z => z.ok || z.codigo), [true, 'solo-coach'], 'restaurar compras de un alumno: IA Plus sí, el plan de coach no');
    r = await x.app(firmar(ca, tx({ appAccountToken: COACH })));
    t.eq(r.body.codigo, 'otra-cuenta', 'IA Plus de otra cuenta de GIZE: no');

    // Avisos de Apple.
    const firmado = Date.now();
    const av = (tipo, o, rr) => x.aviso(aviso(ca, tipo, tx(o), rr));
    r = await av('DID_RENEW', { expiresDate: vence + 30 * DIA, transactionId: '3000000000000002', signedDate: firmado + 1000 }, ren());
    t.eq([r.status, x.st.plus.apple_vence], [200, iso(vence + 30 * DIA)], 'renovación: extiende');
    r = await av('DID_FAIL_TO_RENEW', { expiresDate: Date.now() - 1000, signedDate: firmado + 2000 }, ren({ gracePeriodExpiresDate: Date.now() + 6 * DIA, autoRenewStatus: 1 }));
    t.ok(Math.abs(Date.parse(x.st.plus.apple_vence) - (Date.now() + 6 * DIA)) < 5000, 'no pudo cobrar, con período de gracia: sigue hasta el fin de la gracia');
    r = await av('DID_CHANGE_RENEWAL_STATUS', { expiresDate: vence + 30 * DIA, signedDate: firmado + 3000 }, ren({ autoRenewStatus: 0 }));
    t.eq(x.st.plus.apple_renueva, false, 'canceló la renovación en Apple: no se renueva (sigue hasta el vencimiento)');
    const devol = Date.now() - 60000;
    r = await av('REFUND', { expiresDate: vence + 30 * DIA, revocationDate: devol, signedDate: firmado + 4000 }, ren());
    t.ok(r.status === 200 && x.st.plus.apple_vence === iso(devol) && x.st.plus.apple_renueva === false, 'reembolso: IA Plus se corta en la fecha del reembolso');
    r = await av('DID_RENEW', { expiresDate: vence + 60 * DIA, signedDate: firmado - 5000 }, ren());
    t.eq(x.st.plus.apple_vence, iso(devol), 'un aviso viejo (firmado antes) no pisa el reembolso');
    x = await apple({ fila: { apple_original_tx: '3000000000000001', apple_vence: iso(vence), apple_renueva: true } });
    r = await av('EXPIRED', { expiresDate: Date.now() - 1000, signedDate: firmado + 6000 }, ren({ autoRenewStatus: 0 }));
    t.ok(Date.parse(x.st.plus.apple_vence) < Date.now() && x.st.plus.apple_renueva === false, 'vencida: deja de cubrir');
    x = await apple({ rol: 'client' });
    r = await x.aviso(aviso(ca, 'SUBSCRIBED', tx({ expiresDate: vence }), ren()));
    t.ok(r.status === 200 && x.st.plus && x.st.plus.apple_vence === iso(vence), 'aviso de una compra nueva de un alumno: IA Plus (antes se ignoraba todo lo que no era de coach)');

    // Sandbox (TestFlight): solo las cuentas de la lista.
    for (const [que, sb] of [['sin la lista', null], ['con una lista sin esa cuenta', ['revision@prueba.test']]]){
      x = await apple({ sandbox: sb });
      r = await x.app(firmar(ca, tx({ expiresDate: vence })));
      t.ok(r.status === 400 && r.body.codigo === 'sandbox' && !(x.st.plus && x.st.plus.apple_vence), 'IA Plus de Sandbox ' + que + ': no se activa');
      r = await x.aviso(aviso(ca, 'SUBSCRIBED', tx({ expiresDate: vence }), ren()));
      t.ok(r.status === 200 && r.body.ignorado === 'sandbox' && !(x.st.plus && x.st.plus.apple_vence), 'aviso de Sandbox ' + que + ': se ignora');
    }
    x = await apple({ sandbox: null });
    r = await x.app(firmar(ca, tx({ expiresDate: vence, environment: 'Production' })));
    t.ok(r.status === 200 && x.st.plus && x.st.plus.apple_vence === iso(vence), 'IA Plus de Producción: vale para cualquiera, sin la lista');
    r = await x.app(firmar(ca, txCoach({ appAccountToken: UID })));
    t.eq(r.body.codigo, 'solo-coach', 'los planes de coach no cambian');
  }
}
