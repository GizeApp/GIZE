// Panel → IA → IA Plus (admin/admin.js, supabase/ia.sql): el interruptor (arranca apagado), el
// precio de la web en pesos (provisorio hasta guardarlo: sin eso no se prende), los usos gratis por
// semana, cuántos lo tienen (Mercado Pago, Apple, a mano) y, para soporte, darlo y sacarlo a mano.
import { newPage, wait, ADMIN } from './lib.mjs';

const SHOTS = process.env.SHOTS;
const D = n => new Date(Date.now() + n * 864e5).toISOString();
let IA_ON = true;
const ESTADO = plus => ({ activa: IA_ON, funciones: { etiqueta_admin: true, etiqueta_usuario: false, plato: true, texto: true, rutina: false, resumen: false },
  modelos: {}, topes: { alumno: { etiqueta: 10, plato: 8, texto: 15, total: 25, usd_ciclo: 0.5 } }, ancla: '2026-11-10T00:00:00Z', pedidos_desde: '2026-10-19T03:00:00Z', aviso_version: 1,
  ciclo: { id: 1, inicio: '2026-10-10T00:00:00Z', fin: '2026-11-10T00:00:00Z', credito: 200, aviso: 100, ahorro: 150, tope: 180, gastado: 1.2, reservado: 0, estado: 'normal',
    hoy: 0.1, limite_hoy: 12, proyeccion: 3, frenos: { tope_semana: 7 } },
  por_funcion: {}, errores: {}, tablas: {}, clave_rechazada: null, ultimas: [],
  plus, plus_resumen: { activos: 2, mp: 1, apple: 1, manual: 0, renuevan: 2, arrepentidos: 1 } });
const LISTA = [
  { user_id: 'u1', email: 'ana@prueba.test', nombre: 'Ana', hasta: D(20), mp_hasta: D(20), mp_status: 'authorized', apple_vence: null, manual_hasta: null },
  { user_id: 'u2', email: 'beto@prueba.test', nombre: 'Beto', hasta: D(9), mp_hasta: null, apple_vence: D(9), apple_renueva: true, manual_hasta: null },
  { user_id: 'u4', email: 'dani@prueba.test', nombre: 'Dani', hasta: D(-40), mp_hasta: D(-40), mp_status: 'cancelled', apple_vence: null, manual_hasta: null, arrepentido_at: D(-40), arrepentimientos: 2 },
];

export default async function ({ base, t }){
  let plus = { activa: false, gratis_semana: 3, precio_ars: 3900, precio_confirmado: false }, lista = LISTA.slice();
  const rpcs = [];
  const { p, errs, preguntas, close } = await newPage({ user: ADMIN, viewport: { width: 1280, height: 900 }, handlers: {
    '/is_app_admin': (r, J) => J(true), '/admin_overview': (r, J) => J({ pending: 0, versions: [], users: 0 }),
    '/admin_contact_unread': (r, J) => J(0), '/admin_reports_pending': (r, J) => J(0), '/admin_requests_pending': (r, J) => J(0),
    '/admin_ia_estado': (r, J) => J(ESTADO(plus)),
    '/admin_ia_plus_lista': (r, J) => J(lista),
    '/admin_ia_config': (r, J, i) => {
      const b = JSON.parse(i.body || '{}').p || {}; rpcs.push(['config', b]);
      const n = Object.assign({}, plus, b.plus || {});
      if (b.plus && 'precio_ars' in b.plus) n.precio_confirmado = true;
      if (n.activa && !n.precio_confirmado) return J({ code: '22023', message: 'Antes de prender IA Plus, confirmá el precio en pesos (Guardar precio).' }, 400);
      plus = n; return J(ESTADO(plus));
    },
    '/admin_ia_plus_dar': (r, J, i) => { const b = JSON.parse(i.body || '{}'); rpcs.push(['dar', b]); lista = lista.concat([{ user_id: 'u3', email: b.p_email, nombre: 'Caro', hasta: D(30), manual_hasta: D(30), manual_nota: b.p_nota }]); return J(lista); },
    '/admin_ia_plus_quitar': (r, J, i) => { const b = JSON.parse(i.body || '{}'); rpcs.push(['quitar', b]); lista = lista.filter(x => x.user_id !== b.p_uid); return J(lista); },
    '/functions/v1/ia': (r, J) => J({ ok: true, clave: true, modelos: [] }),
  } });
  const blk = () => p.evaluate(() => { const b = document.getElementById('iaPlusB'); return b ? b.innerText.replace(/\s+/g, ' ') : ''; });
  const toast = () => p.evaluate(() => (document.getElementById('toastVivo') || {}).textContent || '');
  // Con la IA de Comida apagada: avisa y no deja prender IA Plus.
  IA_ON = false;
  await p.goto(base + '/admin/#ia'); await wait(1800);
  t.has(await blk(), 'La IA de Comida está apagada', 'IA apagada: lo avisa');
  await p.click('[data-a="iaPlusOn"]'); await wait(800);
  t.ok((await toast()).includes('Antes de prender IA Plus, prendé la IA') && !rpcs.length, 'IA apagada: no deja prender IA Plus');
  IA_ON = true;
  await p.reload(); await wait(1800);
  let h = await blk();
  t.ok(!h.includes('La IA de Comida está apagada'), 'IA prendida: sin el aviso');
  t.has(h, 'Dani dani@prueba.test Se arrepintió Se arrepintió 2 veces', 'quien se arrepintió dos veces, marcado');
  t.has(h, 'Apagado: no hay límite semanal (como hasta ahora) y no se vende nada.', 'arranca apagado y dice qué pasa');
  t.eq(await p.getAttribute('[data-a="iaPlusOn"]', 'aria-checked'), 'false', 'el interruptor, apagado');
  t.has(h, 'Precio provisorio ($3.900): confirmalo con «Guardar precio» antes de prender IA Plus.', 'el precio provisorio, marcado');
  t.has(h, 'el más cercano a US$2,99', 'el precio del iPhone lo pone Apple');
  t.has(h, '2 Con IA Plus 1 Mercado Pago · 1 Apple · 0 a mano', 'cuántos lo tienen y de dónde');
  t.has(h, '7 Llegaron al límite semanal', 'cuántas veces se llegó al límite semanal');
  t.has(h, 'Ana ana@prueba.test Mercado Pago', 'la lista: Mercado Pago');
  t.has(h, 'Beto beto@prueba.test Apple', 'la lista: Apple');
  // Prender sin confirmar el precio: no.
  await p.click('[data-a="iaPlusOn"]'); await wait(1200);
  t.ok(preguntas.some(q => /¿Prender IA Plus\?/.test(q.texto) && /\$3\.900 al mes/.test(q.texto)), 'antes de prender, pregunta (con el precio)');
  t.has(await toast(), 'confirmá el precio en pesos', 'sin el precio confirmado no se prende');
  t.eq(await p.getAttribute('[data-a="iaPlusOn"]', 'aria-checked'), 'false', 'sigue apagado');
  // Guardar el precio y prender.
  await p.fill('#iaPlusPrecio', '4.500'); await p.click('[data-a="iaPlusPrecio"]'); await wait(1000);
  t.ok(rpcs.some(x => x[0] === 'config' && x[1].plus && x[1].plus.precio_ars === 4500), 'guarda el precio en pesos');
  t.ok(!(await blk()).includes('Precio provisorio'), 'con el precio guardado, ya no es provisorio');
  await p.click('[data-a="iaPlusOn"]'); await wait(1000);
  t.eq(await p.getAttribute('[data-a="iaPlusOn"]', 'aria-checked'), 'true', 'prendido');
  t.has(await blk(), 'Prendido: la foto del plato y «Contame qué comiste» son gratis hasta 3 usos por semana', 'prendido: qué pasa');
  await p.fill('#iaPlusGratis', '5'); await p.click('[data-a="iaPlusGratis"]'); await wait(900);
  t.ok(rpcs.some(x => x[0] === 'config' && x[1].plus && x[1].plus.gratis_semana === 5), 'cambia los usos gratis por semana');
  // Compras de prueba de Apple: la lista de cuentas.
  await p.fill('#iaPlusSandbox', 'no es mail'); await p.click('[data-a="iaPlusSandbox"]'); await wait(600);
  t.ok(!rpcs.some(x => x[0] === 'config' && x[1].plus && x[1].plus.sandbox), 'compras de prueba: un mail inválido no se guarda');
  await p.fill('#iaPlusSandbox', 'Revision@Prueba.test, otra@prueba.test'); await p.click('[data-a="iaPlusSandbox"]'); await wait(900);
  t.ok(rpcs.some(x => x[0] === 'config' && x[1].plus && JSON.stringify(x[1].plus.sandbox) === '["revision@prueba.test","otra@prueba.test"]'), 'compras de prueba de Apple: guarda la lista de cuentas');
  // Soporte: dar y sacar a mano.
  await p.fill('#iaPlusMail', 'caro@prueba.test'); await p.fill('#iaPlusNota', 'se le cortó el pago'); await p.click('[data-a="iaPlusDar"]'); await wait(1000);
  const dar = rpcs.find(x => x[0] === 'dar');
  t.ok(dar && dar[1].p_email === 'caro@prueba.test' && /^\d{4}-\d{2}-\d{2}$/.test(dar[1].p_hasta) && dar[1].p_nota === 'se le cortó el pago', 'da IA Plus a mano: mail, hasta y nota: ' + JSON.stringify(dar));
  t.has(await blk(), 'A mano: se le cortó el pago', 'aparece en la lista');
  if (SHOTS) { await p.evaluate(() => document.getElementById('iaPlusB').scrollIntoView({ block: 'start' })); await wait(300); await p.screenshot({ path: SHOTS + '/12-admin-ia-plus.png', fullPage: false }); }
  await p.click('[data-a="iaPlusQuitar"][data-id="u3"]'); await wait(1000);
  t.ok(rpcs.some(x => x[0] === 'quitar' && x[1].p_uid === 'u3'), 'saca el IA Plus dado a mano');
  t.ok(!(await blk()).includes('A mano: se le cortó'), 'y sale de la lista');
  t.eq(errs, [], 'errores de la página');
  await close();
}
