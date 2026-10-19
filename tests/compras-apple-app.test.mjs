// Planes de coach con Apple en la app de iPhone (app/core/compras-apple.js y screens/coach/plan.js),
// con el plugin GizeCompras simulado (precios en dólares, como los pone Apple):
// - Con la cuenta vencida ve los planes con el precio de Apple, «Suscripción mensual», que se renueva
//   sola hasta cancelarla en los Ajustes de la cuenta de Apple, Términos de uso y Política de
//   privacidad (gize.ar) y «Restaurar compras». Nunca los precios en pesos, Mercado Pago, la
//   transferencia, WhatsApp ni la prueba gratis.
// - «Suscribirme» compra con Apple (con el id del usuario como appAccountToken), manda lo que firmó
//   Apple a la función compras-apple y recién después la finaliza; muestra que el plan quedó activo.
//   Cancelar no hace nada; la compra pendiente (Pedir la compra) avisa; si el servidor no la
//   acepta, no se finaliza (Apple la vuelve a mandar).
// - Con un plan pagado por la web vigente: «Tu plan está activo» y no se ofrece comprar.
// - Con el plan de Apple: «Administrar suscripción» abre la hoja de Apple.
// - En la prueba: la tira no la nombra y lleva a los planes. «Restaurar compras» manda las vigentes.
// - Las compras que llegan solas (renovaciones) van a la función y se finalizan.
// - Android (aunque tuviera el plugin) sigue sin planes; en la web, el plan de Apple no ofrece
//   pagar otro con Mercado Pago.
import { newPage, wait, configCoach, CONFIG_COACH } from './lib.mjs';

const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated', created_at: new Date(Date.now() - 60 * 864e5).toISOString() };
const D = n => new Date(Date.now() + n * 864e5).toISOString();
const PRECIOS = { p10: 'US$ 9,99', p25: 'US$ 14,99', p50: 'US$ 22,99', p100: 'US$ 34,99', p250: 'US$ 69,99', p500: 'US$ 119,99' };
// Lo que no puede aparecer en el iPhone.
const PROHIBIDO = /prueba|gratis|tarjeta|mercado|transferencia|whatsapp|\$\s?\d{1,3}\.\d{3}/i;

// Plugin GizeCompras simulado. o.compra: lo que devuelve comprar.
const plugin = (plataforma, o = {}) => `(() => {
  const o = ${JSON.stringify(o)}, PRECIOS = ${JSON.stringify(PRECIOS)};
  window.__compras = [];
  const P = {
    productos: async a => { window.__compras.push(['productos']); return { productos: a.ids.map(id => ({ id, nombre: 'GIZE ' + id.split('.').pop(), descripcion: '', precio: PRECIOS[id.split('.').pop()], periodo: 'P1M' })) }; },
    comprar: async a => { window.__compras.push(['comprar', a.id, a.cuenta]); return o.compra || { estado: 'ok', jws: 'JWS-' + a.id, transaccion: '777' }; },
    finalizar: async a => { window.__compras.push(['finalizar', a.transaccion]); },
    vigentes: async () => { window.__compras.push(['vigentes']); return { jws: [] }; },
    restaurar: async () => { window.__compras.push(['restaurar']); return { estado: 'ok', jws: ['JWS-R'] }; },
    administrar: async () => { window.__compras.push(['administrar']); },
    addListener: (ev, fn) => { window.__compras.push(['escucha', ev]); window.__llega = fn; },
  };
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => '${plataforma}', Plugins: { GizeCompras: P } };
})();`;

const clientes = n => Array.from({ length: n }, (_, i) => ({ id: 'c' + i, role: 'client', full_name: 'Alumno ' + i, coach_id: COACH.id }));
// fila: la de coach_billing; servidor(body) → [status, respuesta, fila nueva o null].
function pagina(fila, { init, servidor, n = 2 } = {}){
  const st = { fila: Object.assign({ coach_id: COACH.id }, fila), posts: [] };
  return newPage({ user: COACH, init, handlers: {
    '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; if (/coach_id=eq/.test(i.url.search)) return J(clientes(n));
      const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' }; return J(i.one ? me : [me]); },
    '/coach_billing': (r, J, i) => J(i.one ? st.fila : [st.fila]),
    '/functions/v1/compras-apple': (r, J, i) => {
      const body = JSON.parse(i.body || '{}'); st.posts.push(body);
      const [status, resp, nueva] = servidor ? servidor(body) : [200, { ok: true }, null];
      if (nueva) st.fila = Object.assign({ coach_id: COACH.id }, nueva);
      return J(resp, status);
    },
  } }).then(pg => Object.assign(pg, { st }));
}
const txt = (p, sel) => p.evaluate(s => [...document.querySelectorAll(s)].map(e => e.innerText).join(' ').replace(/\s+/g, ' '), sel);
const compras = p => p.evaluate(() => window.__compras);
// «Mi plan» abierto: los planes de Apple con lo que pide Apple debajo (Términos de uso, Política de
// privacidad y «Restaurar compras»).
const hojaApple = p => p.evaluate(() => { const h = document.getElementById('planSheetHost');
  return { suscribirme: h.querySelectorAll('[data-plan="choose"]').length, restaurar: !!h.querySelector('[data-plan="apple-restore"]'),
    links: [...h.querySelectorAll('a')].map(a => a.innerText.trim() + ' ' + a.getAttribute('href')) }; });
const LEGALES = ['Términos de uso https://gize.ar/terminos/?app=1', 'Política de privacidad https://gize.ar/privacidad/?app=1'];
const VENCIDA = { plan: 'trial', max_clients: 10, trial_ends_at: D(-2) };
const APPLE25 = { plan: 'p25', max_clients: 25, trial_ends_at: D(-40), paid_until: D(30), apple_original_tx: '2000000000000001', apple_vence: D(30), apple_renueva: true };

export default async function ({ base, t }){
  // 1) Cuenta vencida en el iPhone: los planes de Apple, con todo lo que pide Apple.
  let pg = await pagina(VENCIDA, { init: plugin('ios'), servidor: () => [200, { ok: true }, APPLE25] });
  await pg.p.goto(base + '/app/'); await wait(3000);
  let muro = await txt(pg.p, '#coachHost');
  t.has(muro, 'Elegí tu plan', 'iPhone vencido: «Elegí tu plan»');
  for (const [plan, precio] of Object.entries(PRECIOS)) t.has(muro, precio, 'iPhone vencido: el precio de Apple del plan ' + plan);
  t.eq(await pg.p.evaluate(() => document.querySelectorAll('#coachHost [data-plan="choose"]').length), 6, 'iPhone vencido: seis «Suscribirme»');
  t.has(muro, 'Suscribirme', 'iPhone vencido: botón «Suscribirme»');
  t.has(muro, 'Hasta 25 clientes', 'iPhone vencido: cuántos clientes');
  t.has(muro, 'Hasta 500 alumnos', 'iPhone vencido: cuántos alumnos (gimnasios)');
  t.has(muro, 'Suscripción mensual', 'iPhone vencido: la duración');
  t.has(muro, 'Se renueva solo cada mes hasta que la canceles desde los Ajustes de tu cuenta de Apple', 'iPhone vencido: cómo se renueva y se cancela');
  t.has(muro, 'Restaurar compras', 'iPhone vencido: «Restaurar compras»');
  t.ok(!muro.includes('Administrar suscripción'), 'iPhone vencido: sin «Administrar suscripción» (no tiene una)');
  t.ok(!PROHIBIDO.test(muro), 'iPhone vencido: sin pesos, Mercado Pago, transferencia ni prueba: ' + (muro.match(PROHIBIDO) || [])[0]);
  const links = await pg.p.evaluate(() => [...document.querySelectorAll('#coachHost a')].map(a => [a.innerText.trim(), a.getAttribute('href')]));
  t.ok(links.some(([x, h]) => x === 'Términos de uso' && h === 'https://gize.ar/terminos/?app=1'), 'iPhone vencido: link a los Términos de uso: ' + JSON.stringify(links));
  t.ok(links.some(([x, h]) => x === 'Política de privacidad' && h === 'https://gize.ar/privacidad/?app=1'), 'iPhone vencido: link a la Política de privacidad');
  t.ok(!links.some(([, h]) => /wa\.me|mercadopago|gize\.ar\/?(\?|#|$)/.test(h || '')), 'iPhone vencido: ningún link a WhatsApp, Mercado Pago ni la página de inicio');
  t.ok(!(await pg.p.$('#coachHost .pl-wall-out')), 'iPhone vencido: ya no es la pantalla neutra');
  // Comprar el de 25.
  await pg.p.click('#coachHost [data-plan="choose"][data-id="p25"]'); await wait(2500);
  const c1 = await compras(pg.p);
  t.ok(c1.some(x => x[0] === 'comprar' && x[1] === 'ar.com.gize.app.coach.p25' && x[2] === COACH.id), 'compra el producto del plan de 25 con la cuenta del coach: ' + JSON.stringify(c1));
  t.eq(pg.st.posts, [{ jws: 'JWS-ar.com.gize.app.coach.p25' }], 'manda a compras-apple lo que firmó Apple');
  t.ok(c1.findIndex(x => x[0] === 'finalizar' && x[1] === '777') > c1.findIndex(x => x[0] === 'comprar'), 'después de guardarla, la finaliza');
  t.has(pg.dialogs.join(' | '), '¡Listo! Tu plan de 25 clientes está activo.', 'avisa que el plan quedó activo');
  const panel = await txt(pg.p, '#coachHost');
  t.has(panel, 'Alumno 1', 'con el plan activo, vuelve el panel con sus alumnos');
  t.has(panel, 'Plan 25 clientes', 'la tira dice el plan');
  t.ok(!PROHIBIDO.test(panel), 'el panel del iPhone no habla de pesos ni de la prueba: ' + (panel.match(PROHIBIDO) || [])[0]);
  t.ok(c1.some(x => x[0] === 'escucha' && x[1] === 'transaccion'), 'escucha las compras que llegan solas');
  // Una renovación que llega sola: va a la función y se finaliza.
  await pg.p.evaluate(() => window.__llega({ jws: 'JWS-RENUEVA', transaccion: '888' })); await wait(800);
  t.eq(pg.st.posts.slice(-1), [{ jws: 'JWS-RENUEVA' }], 'una renovación que llega sola va a compras-apple');
  t.ok((await compras(pg.p)).some(x => x[0] === 'finalizar' && x[1] === '888'), 'y se finaliza');
  // Con el plan de Apple: «Mi plan» con «Administrar suscripción».
  await pg.p.click('#coachHost [data-plan="open"]'); await wait(600);
  let hoja = await txt(pg.p, '#planSheetHost');
  t.has(hoja, 'Tu plan está activo.', 'plan de Apple: «Tu plan está activo»');
  t.has(hoja, 'se renueva solo el', 'plan de Apple: cuándo se renueva');
  t.has(hoja, 'Tu plan actual', 'plan de Apple: su plan marcado');
  t.has(hoja, 'Administrar suscripción', 'plan de Apple: «Administrar suscripción»');
  t.ok(!/Cancelar la renovación/.test(hoja) && !PROHIBIDO.test(hoja), 'plan de Apple: sin lo de Mercado Pago');
  await pg.p.click('#planSheetHost [data-plan="apple-manage"]'); await wait(800);
  const c2 = await compras(pg.p);
  t.ok(c2.some(x => x[0] === 'administrar'), '«Administrar suscripción» abre la hoja de Apple');
  t.ok(c2.findIndex(x => x[0] === 'vigentes') > c2.findIndex(x => x[0] === 'administrar'), 'y al volver, vuelve a mirar las suscripciones vigentes');
  t.eq(pg.errs, [], 'errores (compra en el iPhone)');
  await pg.close();

  // 2) Cancelar, compra pendiente y servidor que no la acepta.
  for (const [cual, compra, servidor] of [
    ['cancelada', { estado: 'cancelado' }, null],
    ['pendiente', { estado: 'pendiente' }, null],
    ['rechazada', null, () => [400, { error: 'Esa suscripción de Apple es de otra cuenta de GIZE.', codigo: 'otra-cuenta' }, null]],
  ]){
    pg = await pagina(VENCIDA, { init: plugin('ios', compra ? { compra } : {}), servidor });
    await pg.p.goto(base + '/app/'); await wait(3000);
    await pg.p.click('#coachHost [data-plan="choose"][data-id="p10"]'); await wait(1500);
    const c = await compras(pg.p);
    if (cual === 'cancelada') t.ok(!pg.st.posts.length && !pg.dialogs.length, 'compra cancelada: no manda nada ni avisa');
    if (cual === 'pendiente') t.ok(!pg.st.posts.length && /esperando aprobación/.test(pg.dialogs.join(' ')), 'compra pendiente: avisa que espera la aprobación: ' + pg.dialogs);
    if (cual === 'rechazada'){
      t.eq(pg.st.posts.length, 1, 'compra rechazada por el servidor: se mandó');
      t.ok(!c.some(x => x[0] === 'finalizar'), 'compra rechazada: no se finaliza (Apple la vuelve a mandar)');
      t.has(pg.dialogs.join(' '), 'otra cuenta de GIZE', 'compra rechazada: dice por qué');
    }
    t.has(await txt(pg.p, '#coachHost'), 'Suscribirme', cual + ': siguen los planes');
    t.eq(pg.errs, [], 'errores (' + cual + ')');
    await pg.close();
  }

  // 3) Plan pagado por la web vigente: «Tu plan está activo», sin ofrecer comprar.
  pg = await pagina({ plan: 'p25', max_clients: 25, trial_ends_at: D(-40), paid_until: D(12), mp_preapproval_id: 'MP1', mp_status: 'authorized' }, { init: plugin('ios') });
  await pg.p.goto(base + '/app/'); await wait(3000);
  await pg.p.click('#coachHost [data-plan="open"]'); await wait(600);
  hoja = await txt(pg.p, '#planSheetHost');
  t.has(hoja, 'Tu plan está activo.', 'plan de la web: «Tu plan está activo»');
  t.has(hoja, 'Plan de 25 clientes, al día hasta el', 'plan de la web: el plan y hasta cuándo');
  t.ok(!/Suscribirme|US\$|Cancelar la renovación|Restaurar/.test(hoja) && !PROHIBIDO.test(hoja), 'plan de la web: no ofrece comprar ni nombra la web: ' + hoja);
  t.eq(pg.errs, [], 'errores (plan de la web en el iPhone)');
  await pg.close();

  // 4) En la prueba: la tira no la nombra; «Ver planes» y Configuración → «Mi plan» llevan a los planes.
  // «Restaurar compras» manda las vigentes.
  pg = await pagina({ plan: 'trial', max_clients: 10, trial_ends_at: D(5) }, { init: plugin('ios'),
    servidor: b => Array.isArray(b.jws) ? [200, { resultados: [{ ok: true }] }, APPLE25] : [200, { ok: true }, null] });
  await pg.p.goto(base + '/app/'); await wait(3000);
  const tira = await txt(pg.p, '#coachHost .pl-banner');
  t.has(tira, '2/10 clientes', 'en la prueba: la tira dice cuántos tiene');
  t.has(tira, 'Ver planes', 'en la prueba: «Ver planes»');
  t.ok(!PROHIBIDO.test(await txt(pg.p, '#coachHost')) && !/días?\b/.test(tira), 'en la prueba: no la nombra ni cuenta los días: ' + tira);
  await pg.p.click('#coachHost .pl-banner'); await wait(600);
  hoja = await txt(pg.p, '#planSheetHost');
  t.has(hoja, 'US$ 14,99', '«Ver planes» del panel: los precios de Apple');
  t.eq(await hojaApple(pg.p), { suscribirme: 6, restaurar: true, links: LEGALES }, '«Ver planes» del panel: «Suscribirme», «Restaurar compras», Términos y Política');
  t.ok(!PROHIBIDO.test(hoja), '«Ver planes» del panel: sin la prueba ni pesos: ' + (hoja.match(PROHIBIDO) || [])[0]);
  await pg.p.click('#planSheetHost [data-plan="close"].cp-x'); await wait(300);
  await configCoach(pg.p, 'plan');
  const secPlan = await txt(pg.p, CONFIG_COACH);
  t.has(secPlan, 'Ver mi plan y cantidad de clientes', 'Configuración: «Mi plan» con «Ver mi plan»');
  t.ok(!PROHIBIDO.test(secPlan), 'Configuración: «Mi plan» sin la prueba ni pesos: ' + secPlan);
  await pg.p.click(CONFIG_COACH + ' [data-plan="open"]'); await wait(600);
  hoja = await txt(pg.p, '#planSheetHost');
  t.has(hoja, 'US$ 14,99', 'en la prueba: «Mi plan» con los precios de Apple');
  t.eq(await hojaApple(pg.p), { suscribirme: 6, restaurar: true, links: LEGALES }, 'Configuración → «Mi plan»: «Suscribirme», «Restaurar compras», Términos y Política');
  t.ok(!PROHIBIDO.test(hoja), 'en la prueba: «Mi plan» sin la prueba ni pesos: ' + (hoja.match(PROHIBIDO) || [])[0]);
  await pg.p.click('#planSheetHost [data-plan="apple-restore"]'); await wait(1500);
  t.ok((await compras(pg.p)).some(x => x[0] === 'restaurar'), '«Restaurar compras» le pide a Apple');
  t.eq(pg.st.posts.slice(-1), [{ jws: ['JWS-R'] }], 'y manda las vigentes a compras-apple');
  t.has(pg.dialogs.join(' '), 'recuperamos tu suscripción', 'y avisa que la recuperó');
  t.eq(pg.errs, [], 'errores (prueba en el iPhone)');
  await pg.close();

  // 5) Android, aunque tuviera el plugin: sin planes (pantalla neutra).
  pg = await pagina(VENCIDA, { init: plugin('android') });
  await pg.p.goto(base + '/app/'); await wait(3000);
  muro = await txt(pg.p, '#coachHost');
  t.has(muro, 'Tu cuenta de coach no está activa en este momento.', 'Android: pantalla neutra');
  t.ok(!/Suscribirme|US\$|plan/i.test(muro), 'Android: sin planes ni precios');
  t.eq(pg.errs, [], 'errores (Android)');
  await pg.close();

  // 6) En la web, con el plan de Apple: no ofrece pagar otro con Mercado Pago.
  pg = await pagina(APPLE25);
  await pg.p.goto(base + '/app/'); await wait(3000);
  await pg.p.click('#coachHost [data-plan="open"]'); await wait(600);
  hoja = await txt(pg.p, '#planSheetHost');
  t.has(hoja, 'suscripción de Apple que se renueva sola', 'web: dice que es una suscripción de Apple');
  t.has(hoja, 'desde tu iPhone', 'web: dónde se cambia o se cancela');
  t.ok(!/Pagar con tarjeta|Renovar con tarjeta|Cancelar la renovación|\$24\.900/.test(hoja), 'web: no ofrece Mercado Pago encima: ' + hoja);
  t.eq(pg.errs, [], 'errores (web con plan de Apple)');
  await pg.close();
}
