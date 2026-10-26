// Código de fundador en la función suscripcion (supabase/functions/suscripcion), corriéndola con
// Supabase y Mercado Pago simulados (tests/funcion.mjs):
// - con un código que la base acepta (codigo_fundador_usar), la suscripción de Mercado Pago se crea
//   con el precio con descuento (y ese precio queda para las renovaciones, que cobra Mercado Pago);
// - el precio nunca sale de lo que manda la app: solo cuenta el porcentaje que da la base;
// - un código que la base rechaza (no existe, sin lugares) no crea nada y dice por qué;
// - el coach que ya tiene su descuento lo sigue teniendo sin mandar el código (cambio de plan);
// - si no se puede revisar el código, no se cobra a precio lleno: no se crea nada;
// - sin el SQL todavía (no existe la función) y sin código, se cobra como antes;
// - el link sin pagar se reusa solo si tiene el mismo precio.
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { funcion, supabaseSimulado, cumple } from './funcion.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COACH = 'c0ac4000-0000-4000-8000-0000000000f1', MAIL = 'coach@prueba.test';

// codigo: qué contesta la base a codigo_fundador_usar (o una función que lo decide con los args).
async function armar({ codigo = { ok: true, porcentaje: 0 }, pendiente = null } = {}){
  const bill = { coach_id: COACH, plan: 'trial', mp_preapproval_id: null, mp_status: null, mp_pending_id: null, pending_plan: null };
  const rpcs = [], mp = [], creadas = [];
  const db = supabaseSimulado(q => {
    if (q.accion === 'rpc'){ rpcs.push([q.tabla, q.valores]); return typeof codigo === 'function' ? codigo(q.valores) : { data: codigo }; }
    if (q.tabla === 'profiles') return q.count ? { count: 0 } : { data: { role: 'coach' } };
    if (q.tabla === 'coach_billing'){
      if (q.accion === 'select') return { data: Object.assign({}, bill) };
      if (q.accion === 'update'){ if (!cumple(bill, q.filtros)) return { data: [] }; Object.assign(bill, q.valores); return { data: [{ coach_id: COACH }] }; }
    }
    if (q.tabla === 'mp_checkouts'){
      if (q.accion === 'insert') return { data: { id: 1 } };
      if (q.accion === 'select') return { count: 1 };
    }
    return { data: null };
  }, { user: { id: COACH, email: MAIL } });
  const subs = {};
  if (pendiente){
    subs.P0 = { id: 'P0', status: 'pending', init_point: 'https://mp.test/P0', external_reference: COACH + '|p25', payer_email: MAIL, auto_recurring: { transaction_amount: pendiente } };
    Object.assign(bill, { mp_pending_id: 'P0', pending_plan: 'p25' });
  }
  const fetch = async (url, init = {}) => {
    const m = init.method || 'GET', u = new URL(String(url));
    mp.push(m + ' ' + u.pathname);
    if (m === 'POST' && u.pathname === '/preapproval'){
      const b = JSON.parse(init.body), id = 'P' + (creadas.length + 1);
      creadas.push(b);
      subs[id] = { id, status: 'pending', init_point: 'https://mp.test/' + id, external_reference: b.external_reference, payer_email: b.payer_email, auto_recurring: b.auto_recurring };
      return new Response(JSON.stringify(subs[id]), { status: 201 });
    }
    const id = decodeURIComponent(u.pathname.split('/').pop());
    if (m === 'PUT' && subs[id]) subs[id].status = 'cancelled';
    return new Response(JSON.stringify(subs[id] || {}), { status: subs[id] ? 200 : 404 });
  };
  const fn = await funcion('suscripcion', { fetch,
    env: { MP_ACCESS_TOKEN: 'TEST', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'srv' },
    npm: { '@supabase/supabase-js': { createClient: () => db } } });
  const pagar = async (extra = {}) => {
    const r = await fn.call(new Request('https://x.supabase.co/functions/v1/suscripcion', { method: 'POST', headers: { Authorization: 'Bearer x' },
      body: JSON.stringify(Object.assign({ action: 'checkout', plan: 'p25', mp_email: MAIL }, extra)) }));
    return { status: r.status, ...(await r.json()) };
  };
  return { pagar, bill, rpcs, mp, creadas, logs: fn.logs };
}
const monto = b => b && b.auto_recurring && b.auto_recurring.transaction_amount;

export default async function ({ t }){
  // La cuenta del descuento (la misma que muestra la app).
  const r = await import(pathToFileURL(path.join(ROOT, 'supabase/functions/suscripcion/reglas.ts')).href);
  t.eq([14900, 24900, 37900, 59900, 119900, 199900].map(p => r.conDescuento(p, 30)), [10430, 17430, 26530, 41930, 83930, 139930], '30% menos en cada plan');
  t.eq([r.conDescuento(24900, 0), r.conDescuento(24900, null), r.conDescuento(24900, 95), r.conDescuento(24900, -10), r.conDescuento(24900, 'x')], [24900, 24900, 24900, 24900, 24900], 'fuera de 1 a 90: precio lleno');

  {
    // Sin código ni descuento: precio lleno, y la base igual se consulta (por si ya tiene uno).
    const x = await armar();
    const a = await x.pagar();
    t.ok(a.status === 200 && a.url === 'https://mp.test/P1', 'sin código: crea el link: ' + JSON.stringify(a));
    t.eq(monto(x.creadas[0]), 24900, 'sin código: precio lleno');
    t.eq(x.rpcs, [['codigo_fundador_usar', { p_coach: COACH, p_codigo: null }]], 'sin código: le pregunta a la base por el descuento del coach');
    t.ok(!/fundador/.test(x.creadas[0].reason), 'sin código: el nombre de la suscripción no dice fundador');
  }
  {
    // Con un código que la base acepta: 30% menos en Mercado Pago.
    const x = await armar({ codigo: { ok: true, porcentaje: 30 } });
    const a = await x.pagar({ codigo: '  fundador-prueba ' });
    t.ok(a.status === 200 && a.url === 'https://mp.test/P1', 'con código: crea el link: ' + JSON.stringify(a));
    t.eq(x.rpcs, [['codigo_fundador_usar', { p_coach: COACH, p_codigo: 'fundador-prueba' }]], 'con código: la base lo revisa (y ocupa el lugar) con el coach de la sesión');
    t.eq(monto(x.creadas[0]), 17430, 'con código: la suscripción sale 30% menos ($17.430 el plan de 25)');
    t.eq([x.creadas[0].auto_recurring.frequency, x.creadas[0].auto_recurring.frequency_type], [1, 'months'], 'con código: es la suscripción mensual (Mercado Pago cobra ese precio cada mes)');
    t.has(x.creadas[0].reason, 'fundador', 'con código: el nombre de la suscripción lo dice');
    t.eq(x.creadas[0].external_reference, COACH + '|p25', 'con código: la referencia es la de siempre (los avisos la siguen entendiendo)');
  }
  {
    // La app no decide el precio: lo que mande se ignora.
    const x = await armar({ codigo: { ok: true, porcentaje: 30 } });
    await x.pagar({ codigo: 'FUNDADOR', price: 1, precio: 1, transaction_amount: 1, porcentaje: 99, auto_recurring: { transaction_amount: 1 } });
    t.eq(monto(x.creadas[0]), 17430, 'el precio que manda la app no cuenta');
    const y = await armar({ codigo: { ok: true, porcentaje: 0 } });
    await y.pagar({ porcentaje: 50, descuento: 50 });
    t.eq(monto(y.creadas[0]), 24900, 'un porcentaje que manda la app no cuenta');
  }
  {
    // La base lo rechaza (no existe, apagado, sin lugares): no se crea nada y se dice por qué.
    const x = await armar({ codigo: { ok: false, error: 'Ya se ocuparon todos los lugares de ese código.' } });
    const a = await x.pagar({ codigo: 'LLENO' });
    t.eq([a.status, a.error], [400, 'Ya se ocuparon todos los lugares de ese código.'], 'código rechazado: 400 con el motivo');
    t.eq(x.mp, [], 'código rechazado: nada a Mercado Pago');
  }
  {
    // Ya tiene su descuento: sigue sin mandar el código (por ejemplo, al pasarse a otro plan).
    const x = await armar({ codigo: { ok: true, porcentaje: 30 } });
    await x.pagar({ plan: 'p50' });
    t.eq(monto(x.creadas[0]), 26530, 'con el descuento ya ganado: el plan de 50 también sale 30% menos');
  }
  {
    // No se pudo revisar el código: no se cobra a precio lleno.
    const caida = { data: null, error: { code: '57014', message: 'tardó demasiado' } };
    let x = await armar({ codigo: () => caida });
    let a = await x.pagar({ codigo: 'FUNDADOR' });
    t.ok(a.status === 503 && x.mp.length === 0, 'base caída con código: 503 y nada a Mercado Pago');
    x = await armar({ codigo: () => caida });
    a = await x.pagar();
    t.ok(a.status === 503 && x.mp.length === 0, 'base caída sin código: 503 (podía tener su descuento) y nada a Mercado Pago');
    x = await armar({ codigo: () => ({ data: null }) });
    a = await x.pagar({ codigo: 'FUNDADOR' });
    t.ok(a.status === 503 && x.mp.length === 0, 'la base no contesta el porcentaje de un código: 503');
    // Sin el SQL todavía: sin código se cobra como antes; con código, no.
    const falta = () => ({ data: null, error: { code: 'PGRST202', message: 'no existe codigo_fundador_usar' } });
    x = await armar({ codigo: falta });
    a = await x.pagar();
    t.ok(a.status === 200 && monto(x.creadas[0]) === 24900, 'sin el SQL y sin código: precio lleno, como antes');
    x = await armar({ codigo: falta });
    a = await x.pagar({ codigo: 'FUNDADOR' });
    t.ok(a.status === 503 && x.mp.length === 0, 'sin el SQL y con código: no se cobra a precio lleno');
  }
  {
    // Link sin pagar del mismo plan: se reusa solo si tiene el mismo precio.
    let x = await armar({ codigo: { ok: true, porcentaje: 30 }, pendiente: 24900 });
    let a = await x.pagar({ codigo: 'FUNDADOR' });
    t.ok(a.url === 'https://mp.test/P1' && monto(x.creadas[0]) === 17430, 'link viejo a precio lleno: con el código se crea uno nuevo con descuento');
    t.ok(x.mp.includes('PUT /preapproval/P0'), 'y el link viejo a precio lleno se da de baja');
    x = await armar({ codigo: { ok: true, porcentaje: 30 }, pendiente: 17430 });
    a = await x.pagar({ codigo: 'FUNDADOR' });
    t.ok(a.url === 'https://mp.test/P0' && x.creadas.length === 0, 'link sin pagar con el mismo descuento: se reusa');
    x = await armar({ pendiente: 24900 });
    a = await x.pagar();
    t.ok(a.url === 'https://mp.test/P0' && x.creadas.length === 0, 'sin código: el link a precio lleno se sigue reusando');
  }
}
