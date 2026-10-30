// Planes de coach con Google Play en la app de Android (app/core/compras-google.js y
// screens/coach/plan.js), con el plugin GizeCompras simulado (precios como los da Google) y el
// interruptor del panel (rpc compras_google) simulado:
// - Los productos de la app son los mismos que los de la función compras-google (planes.ts) y los
//   de Apple, con el mismo IA Plus y el mismo plan base.
// - Con el interruptor apagado (o sin la función en la base, 404), Android sigue como siempre:
//   pantalla neutra, sin planes, sin «Mi plan» en Configuración.
// - Prendido y con la cuenta vencida: los 6 planes con el precio de Google, «Suscripción mensual»,
//   cómo se renueva y se cancela en Google Play, Términos y Política (?app=1) y «Recuperar mi
//   suscripción». Nunca pesos, Mercado Pago, transferencia, WhatsApp ni la prueba gratis.
// - «Suscribirme» compra con Google (con el id del coach), manda { token, producto } a compras-google
//   y avisa que el plan quedó activo; si el servidor contesta reconocer: true, la app la reconoce.
//   Cancelada: nada; pendiente: avisa; de otra cuenta: dice por qué.
// - Con el plan de Google: «Tu plan está activo», «Administrar en Google Play» (y al volver se vuelve
//   a mirar), «Cambiar a este plan» con el reemplazo de la suscripción que tiene (subir o bajar). Si
//   esa suscripción no está en el celular (otra cuenta de Google), no deja comprar.
// - En la prueba: la tira no la nombra. «Recuperar mi suscripción» manda las del celular.
// - Las compras que llegan solas (evento «compra») van a la función.
// - En la web, con el plan de Google, no se ofrece Mercado Pago; en el iPhone no se nombra Google.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { newPage, wait, configCoach, CONFIG_COACH } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const importar = f => import(pathToFileURL(path.join(ROOT, f)).href);
const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated', created_at: new Date(Date.now() - 60 * 864e5).toISOString() };
const D = n => new Date(Date.now() + n * 864e5).toISOString();
const PRECIOS = { p10: 'US$ 9,99', p25: 'US$ 14,99', p50: 'US$ 22,99', p100: 'US$ 34,99', p250: 'US$ 69,99', p500: 'US$ 119,99' };
// Lo que no puede aparecer en las apps.
const PROHIBIDO = /prueba|gratis|tarjeta|mercado|transferencia|whatsapp|\$\s?\d{1,3}\.\d{3}/i;
const PROD = p => 'ar.com.gize.app.coach.' + p;

// Plugin GizeCompras simulado. o.compra: lo que devuelve comprar; o.vigentes: las del celular.
const plugin = (plataforma, o = {}) => `(() => {
  const o = ${JSON.stringify(o)}, PRECIOS = ${JSON.stringify(PRECIOS)};
  window.__compras = [];
  const P = {
    productos: async a => { window.__compras.push(['productos']); return { productos: a.ids.map(id => ({ id, nombre: 'GIZE ' + id.split('.').pop(), descripcion: '', precio: PRECIOS[id.split('.').pop()], periodo: 'P1M' })) }; },
    comprar: async a => { window.__compras.push(['comprar', a.id, a.cuenta, a.reemplazo || null]); return o.compra || { estado: 'ok', token: 'TOK-' + a.id.split('.').pop(), producto: a.id, reconocida: false }; },
    finalizar: async a => { window.__compras.push(['finalizar', a.token || a.transaccion]); },
    vigentes: async () => { window.__compras.push(['vigentes']); return ${plataforma === 'ios' ? "{ jws: [] }" : "{ compras: o.vigentes || [] }"}; },
    restaurar: async () => { window.__compras.push(['restaurar']); return { estado: 'ok', compras: o.restaurar || [] }; },
    administrar: async a => { window.__compras.push(['administrar', a && a.producto]); },
    avisos: async () => { window.__compras.push(['avisos']); return { estado: 'nada' }; },
    addListener: (ev, fn) => { window.__compras.push(['escucha', ev]); window.__llega = fn; },
  };
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => '${plataforma}', Plugins: { GizeCompras: P } };
})();`;

const clientes = n => Array.from({ length: n }, (_, i) => ({ id: 'c' + i, role: 'client', full_name: 'Alumno ' + i, coach_id: COACH.id }));
// fila: la de coach_billing; inter: lo que contesta compras_google ([status, cuerpo]);
// servidor(body) → [status, respuesta, fila nueva o null].
function pagina(fila, { init, inter = [200, { planes: true, plus: false }], servidor, n = 2 } = {}){
  const st = { fila: Object.assign({ coach_id: COACH.id }, fila), posts: [], inter: 0 };
  return newPage({ user: COACH, init, handlers: {
    '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; if (/coach_id=eq/.test(i.url.search)) return J(clientes(n));
      const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' }; return J(i.one ? me : [me]); },
    '/coach_billing': (r, J, i) => J(i.one ? st.fila : [st.fila]),
    '/rpc/compras_google': (r, J) => { st.inter++; return J(inter[1], inter[0]); },
    '/functions/v1/compras-google': (r, J, i) => {
      const body = JSON.parse(i.body || '{}'); st.posts.push(body);
      const [status, resp, nueva] = servidor ? servidor(body) : [200, { ok: true }, null];
      if (nueva) st.fila = Object.assign({ coach_id: COACH.id }, nueva);
      return J(resp, status);
    },
  } }).then(pg => Object.assign(pg, { st }));
}
// Las secciones de Configuración del coach (perfil, plan, …).
const secciones = async p => { await configCoach(p); return p.$$eval('#coachHost .cs-nav [data-coach="settings-sec"]', l => l.map(b => b.dataset.k)); };
const txt = (p, sel) => p.evaluate(s => [...document.querySelectorAll(s)].map(e => e.innerText).join(' ').replace(/\s+/g, ' '), sel);
const compras = p => p.evaluate(() => window.__compras);
const LEGALES = ['Términos de uso https://gize.ar/terminos/?app=1', 'Política de privacidad https://gize.ar/privacidad/?app=1'];
const hoja = p => p.evaluate(() => { const h = document.getElementById('planSheetHost');
  return { suscribirme: h.querySelectorAll('[data-plan="choose"]').length, recuperar: !!h.querySelector('[data-plan="google-restore"]'),
    links: [...h.querySelectorAll('a')].map(a => a.innerText.trim() + ' ' + a.getAttribute('href')) }; });
const VENCIDA = { plan: 'trial', max_clients: 10, trial_ends_at: D(-2) };
const GOOGLE25 = { plan: 'p25', max_clients: 25, trial_ends_at: D(-40), paid_until: D(30), google_token: 'TOK-p25', google_vence: D(30), google_renueva: true };
const EN_CELULAR = [{ token: 'TOK-p25', producto: PROD('p25'), estado: 'comprada', reconocida: true, suspendida: false, renueva: true }];

export default async function ({ base, t }){
  // 0) Los mismos productos en la app, en la función y en Apple.
  const app = await importar('app/core/compras-google.js');
  const srv = await importar('supabase/functions/compras-google/planes.ts');
  const apple = await importar('app/core/compras-apple.js');
  t.eq(app.PRODUCTOS_GOOGLE, srv.PRODUCTOS_GOOGLE, 'la app y la función compras-google usan los mismos productos');
  t.eq(app.PRODUCTOS_GOOGLE, apple.PRODUCTOS_APPLE, 'los mismos IDs que en el App Store');
  t.eq(app.PRODUCTO_IA_PLUS_GOOGLE, srv.IA_PLUS_GOOGLE, 'IA Plus: el mismo producto que la función');
  t.eq(app.PLAN_BASE, srv.PLAN_BASE, 'el mismo plan base que la función');
  const java = fs.readFileSync(path.join(ROOT, 'android/app/src/main/java/ar/com/gize/app/GizeComprasPlugin.java'), 'utf8');
  t.has(java, 'PLAN_BASE = "' + app.PLAN_BASE + '"', 'el mismo plan base que el plugin');

  // 1) Interruptor apagado, o sin la función en la base: como siempre (pantalla neutra, sin «Mi plan»).
  for (const [cual, inter] of [['apagado', [200, { planes: false, plus: false }]], ['sin la función', [404, { code: 'PGRST202', message: 'Could not find the function' }]]]){
    let pg = await pagina(VENCIDA, { init: plugin('android'), inter });
    await pg.p.goto(base + '/app/'); await wait(3000);
    const muro = await txt(pg.p, '#coachHost');
    t.has(muro, 'Tu cuenta de coach no está activa en este momento.', cual + ': pantalla neutra');
    t.ok(!/Suscribirme|US\$|plan/i.test(muro), cual + ': sin planes ni precios: ' + muro);
    t.ok(pg.st.inter >= 1, cual + ': preguntó el interruptor');
    t.ok(!(await compras(pg.p)).some(x => x[0] === 'productos' || x[0] === 'vigentes'), cual + ': no le pide nada a Google Play');
    t.eq(pg.errs, [], 'errores (' + cual + ')');
    await pg.close();
    pg = await pagina({ plan: 'trial', max_clients: 10, trial_ends_at: D(5) }, { init: plugin('android'), inter });
    await pg.p.goto(base + '/app/'); await wait(3000);
    t.ok(!(await pg.p.$('#coachHost .pl-banner')), cual + ': sin la tira del plan');
    t.ok(!(await secciones(pg.p)).includes('plan'), cual + ': sin «Mi plan» en Configuración');
    t.eq(pg.errs, [], 'errores (' + cual + ', en la prueba)');
    await pg.close();
  }

  // 2) Prendido y con la cuenta vencida: los planes de Google Play, con lo que pide Google.
  let pg = await pagina(VENCIDA, { init: plugin('android'), servidor: () => [200, { ok: true, reconocer: true }, GOOGLE25] });
  await pg.p.goto(base + '/app/'); await wait(3000);
  let muro = await txt(pg.p, '#coachHost');
  t.has(muro, 'Elegí tu plan', 'Android vencido: «Elegí tu plan»');
  for (const [plan, precio] of Object.entries(PRECIOS)) t.has(muro, precio, 'Android vencido: el precio de Google del plan ' + plan);
  t.eq(await pg.p.evaluate(() => document.querySelectorAll('#coachHost [data-plan="choose"]').length), 6, 'Android vencido: seis «Suscribirme»');
  t.has(muro, 'Suscripción mensual', 'Android vencido: la duración');
  t.has(muro, 'El pago se cobra a tu cuenta de Google Play al confirmar la suscripción.', 'Android vencido: a quién se cobra');
  t.has(muro, 'Se renueva sola cada mes hasta que la canceles desde Google Play (Pagos y suscripciones → Suscripciones).', 'Android vencido: cómo se renueva y se cancela');
  t.has(muro, 'Recuperar mi suscripción', 'Android vencido: «Recuperar mi suscripción»');
  t.ok(!muro.includes('Administrar en Google Play'), 'Android vencido: sin «Administrar en Google Play» (no tiene una)');
  t.ok(!/Apple|Restaurar compras/.test(muro), 'Android vencido: no nombra a Apple');
  t.ok(!PROHIBIDO.test(muro), 'Android vencido: sin pesos, Mercado Pago, transferencia ni prueba: ' + (muro.match(PROHIBIDO) || [])[0]);
  const links = await pg.p.evaluate(() => [...document.querySelectorAll('#coachHost a')].map(a => [a.innerText.trim(), a.getAttribute('href')]));
  t.ok(links.some(([x, h]) => x === 'Términos de uso' && h === 'https://gize.ar/terminos/?app=1'), 'Android vencido: link a los Términos de uso');
  t.ok(links.some(([x, h]) => x === 'Política de privacidad' && h === 'https://gize.ar/privacidad/?app=1'), 'Android vencido: link a la Política de privacidad');
  t.ok(!links.some(([, h]) => /wa\.me|mercadopago|gize\.ar\/?(\?|#|$)/.test(h || '')), 'Android vencido: ningún link a WhatsApp, Mercado Pago ni la página de inicio');
  await pg.p.click('#coachHost [data-plan="choose"][data-id="p25"]'); await wait(2500);
  let c = await compras(pg.p);
  t.ok(c.some(x => x[0] === 'comprar' && x[1] === PROD('p25') && x[2] === COACH.id && x[3] === null), 'compra el plan de 25 con la cuenta del coach, sin reemplazo: ' + JSON.stringify(c));
  t.eq(pg.st.posts, [{ token: 'TOK-p25', producto: PROD('p25') }], 'manda a compras-google el token y el producto');
  t.ok(c.findIndex(x => x[0] === 'finalizar' && x[1] === 'TOK-p25') > c.findIndex(x => x[0] === 'comprar'), 'el servidor pidió reconocerla: la reconoce la app');
  t.has(pg.dialogs.join(' | '), '¡Listo! Tu plan de 25 clientes está activo.', 'avisa que el plan quedó activo');
  const panel = await txt(pg.p, '#coachHost');
  t.has(panel, 'Alumno 1', 'con el plan activo, vuelve el panel con sus alumnos');
  t.has(panel, 'Plan 25 clientes', 'la tira dice el plan');
  t.ok(!PROHIBIDO.test(panel), 'el panel de Android no habla de pesos ni de la prueba: ' + (panel.match(PROHIBIDO) || [])[0]);
  t.ok(c.some(x => x[0] === 'escucha' && x[1] === 'compra'), 'escucha las compras que llegan solas');
  // Una compra que llega sola (una pendiente que se acreditó): va a la función.
  await pg.p.evaluate(() => window.__llega({ token: 'TOK-SOLA', producto: 'ar.com.gize.app.coach.p25', estado: 'comprada', reconocida: false }));
  await wait(800);
  t.eq(pg.st.posts.slice(-1), [{ token: 'TOK-SOLA', producto: PROD('p25') }], 'una compra que llega sola va a compras-google');
  // Una de IA Plus (u otra cosa) no es de los planes: no la manda esta pantalla.
  await pg.p.evaluate(() => window.__llega({ token: 'TOK-PLUS', producto: 'ar.com.gize.app.iaplus.mensual', estado: 'comprada' }));
  await wait(500);
  t.ok(!pg.st.posts.some(b => b.token === 'TOK-PLUS'), 'la compra de IA Plus no la manda la pantalla de planes');
  t.eq(pg.errs, [], 'errores (compra en Android)');
  await pg.close();

  // 3) Cancelada, pendiente y de otra cuenta.
  for (const [cual, compra, servidor] of [
    ['cancelada', { estado: 'cancelado' }, null],
    ['pendiente', { estado: 'pendiente', token: 'TOK-PEND', producto: PROD('p10') }, () => [400, { error: 'Tu pago quedó pendiente en Google Play. Cuando se acredite, se activa solo.', codigo: 'pendiente' }, null]],
    ['rechazada', null, () => [400, { error: 'Esa suscripción de Google Play es de otra cuenta de GIZE.', codigo: 'otra-cuenta' }, null]],
  ]){
    pg = await pagina(VENCIDA, { init: plugin('android', compra ? { compra } : {}), servidor });
    await pg.p.goto(base + '/app/'); await wait(3000);
    await pg.p.click('#coachHost [data-plan="choose"][data-id="p10"]'); await wait(1500);
    c = await compras(pg.p);
    if (cual === 'cancelada') t.ok(!pg.st.posts.length && !pg.dialogs.length, 'compra cancelada: no manda nada ni avisa');
    if (cual === 'pendiente') t.has(pg.dialogs.join(' '), 'Tu pago quedó pendiente en Google Play. Cuando se acredite, tu plan se activa solo.', 'compra pendiente: avisa');
    if (cual === 'rechazada'){
      t.eq(pg.st.posts.length, 1, 'compra rechazada por el servidor: se mandó');
      t.has(pg.dialogs.join(' '), 'otra cuenta de GIZE', 'compra rechazada: dice por qué');
    }
    t.ok(!c.some(x => x[0] === 'finalizar'), cual + ': no la reconoce la app');
    t.has(await txt(pg.p, '#coachHost'), 'Suscribirme', cual + ': siguen los planes');
    t.eq(pg.errs, [], 'errores (' + cual + ')');
    await pg.close();
  }

  // 4) Con el plan de Google: «Administrar en Google Play» y cambiar de plan (subir y bajar).
  pg = await pagina(GOOGLE25, { init: plugin('android', { vigentes: EN_CELULAR }), servidor: b => [200, b.compras ? { resultados: b.compras.map(() => ({ ok: true })) } : { ok: true }, null] });
  await pg.p.goto(base + '/app/'); await wait(3000);
  t.has(await txt(pg.p, '#coachHost .pl-banner'), 'Plan 25 clientes · 2/25 clientes', 'plan de Google: la tira dice el plan (se renueva: sin fecha)');
  await pg.p.click('#coachHost [data-plan="open"]'); await wait(800);
  let h = await txt(pg.p, '#planSheetHost');
  t.has(h, 'Tu plan está activo.', 'plan de Google: «Tu plan está activo»');
  t.has(h, 'Plan de 25 clientes · se renueva solo el', 'plan de Google: cuándo se renueva');
  t.has(h, 'Tu plan actual', 'plan de Google: su plan marcado');
  t.has(h, 'Cambiar a este plan', 'plan de Google: «Cambiar a este plan» en los demás');
  t.has(h, 'Administrar en Google Play', 'plan de Google: «Administrar en Google Play»');
  t.ok(!/Cancelar la renovación/.test(h) && !PROHIBIDO.test(h), 'plan de Google: sin lo de Mercado Pago: ' + h);
  t.eq(await hoja(pg.p), { suscribirme: 5, recuperar: true, links: LEGALES }, 'plan de Google: cinco para cambiar, «Recuperar mi suscripción», Términos y Política');
  await pg.p.click('#planSheetHost [data-plan="google-manage"]'); await wait(500);
  c = await compras(pg.p);
  t.ok(c.some(x => x[0] === 'administrar' && x[1] === PROD('p25')), '«Administrar en Google Play» abre su suscripción: ' + JSON.stringify(c));
  const antes = pg.st.posts.length;
  await pg.p.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await wait(1200);
  t.eq(pg.st.posts.slice(antes), [{ compras: [{ token: 'TOK-p25', producto: PROD('p25') }] }], 'al volver a la app, vuelve a mandar su suscripción para releerla');
  // Más grande: cambia ya y Google cobra la diferencia.
  await pg.p.click('#planSheetHost [data-plan="choose"][data-id="p50"]'); await wait(1500);
  c = await compras(pg.p);
  t.eq(c.filter(x => x[0] === 'comprar').pop(), ['comprar', PROD('p50'), COACH.id, { token: 'TOK-p25', producto: PROD('p25'), modo: 'subir' }], 'a uno más grande: reemplaza la suscripción que tiene (subir)');
  t.eq(pg.st.posts.slice(-1), [{ token: 'TOK-p50', producto: PROD('p50') }], 'y manda la compra nueva');
  t.eq(pg.errs, [], 'errores (plan de Google)');
  await pg.close();
  pg = await pagina(GOOGLE25, { init: plugin('android', { vigentes: EN_CELULAR }) });
  await pg.p.goto(base + '/app/'); await wait(3000);
  await pg.p.click('#coachHost [data-plan="open"]'); await wait(800);
  await pg.p.click('#planSheetHost [data-plan="choose"][data-id="p10"]'); await wait(1500);
  t.eq((await compras(pg.p)).filter(x => x[0] === 'comprar').pop(), ['comprar', PROD('p10'), COACH.id, { token: 'TOK-p25', producto: PROD('p25'), modo: 'bajar' }], 'a uno más chico: reemplaza (bajar)');
  t.eq(pg.errs, [], 'errores (bajar de plan)');
  await pg.close();

  // 5) La suscripción de Google es de otra cuenta de Google (no está en el celular): no deja comprar.
  pg = await pagina(GOOGLE25, { init: plugin('android', { vigentes: [] }) });
  await pg.p.goto(base + '/app/'); await wait(3000);
  await pg.p.click('#coachHost [data-plan="open"]'); await wait(800);
  h = await txt(pg.p, '#planSheetHost');
  t.has(h, 'Tu suscripción es de otra cuenta de Google Play: para cambiarla, usá esa cuenta.', 'otra cuenta de Google: lo explica');
  t.eq((await hoja(pg.p)).suscribirme, 0, 'otra cuenta de Google: no ofrece comprar otra');
  t.ok(!(await compras(pg.p)).some(x => x[0] === 'comprar'), 'otra cuenta de Google: no compra');
  t.eq(pg.errs, [], 'errores (otra cuenta de Google)');
  await pg.close();

  // 6) En la prueba: la tira no la nombra; «Ver planes» y Configuración → «Mi plan» llevan a los
  // planes. «Recuperar mi suscripción» manda las del celular.
  pg = await pagina({ plan: 'trial', max_clients: 10, trial_ends_at: D(5) }, { init: plugin('android', { restaurar: EN_CELULAR }),
    servidor: b => b.compras ? [200, { resultados: [{ ok: true }] }, GOOGLE25] : [200, { ok: true }, null] });
  await pg.p.goto(base + '/app/'); await wait(3000);
  const tira = await txt(pg.p, '#coachHost .pl-banner');
  t.has(tira, '2/10 clientes', 'en la prueba: la tira dice cuántos tiene');
  t.has(tira, 'Ver planes', 'en la prueba: «Ver planes»');
  t.ok(!PROHIBIDO.test(await txt(pg.p, '#coachHost')) && !/días?\b/.test(tira), 'en la prueba: no la nombra ni cuenta los días: ' + tira);
  await pg.p.click('#coachHost .pl-banner'); await wait(800);
  h = await txt(pg.p, '#planSheetHost');
  t.has(h, 'US$ 14,99', '«Ver planes»: los precios de Google');
  t.eq(await hoja(pg.p), { suscribirme: 6, recuperar: true, links: LEGALES }, '«Ver planes»: «Suscribirme», «Recuperar mi suscripción», Términos y Política');
  t.ok(!PROHIBIDO.test(h), '«Ver planes»: sin la prueba ni pesos: ' + (h.match(PROHIBIDO) || [])[0]);
  await pg.p.click('#planSheetHost [data-plan="close"].cp-x'); await wait(300);
  t.ok((await secciones(pg.p)).includes('plan'), 'Configuración: «Mi plan» con Google Play prendido');
  await configCoach(pg.p, 'plan');
  await pg.p.click(CONFIG_COACH + ' [data-plan="open"]'); await wait(800);
  t.eq((await hoja(pg.p)).suscribirme, 6, 'Configuración → «Mi plan»: los planes de Google');
  await pg.p.click('#planSheetHost [data-plan="google-restore"]'); await wait(1500);
  t.ok((await compras(pg.p)).some(x => x[0] === 'restaurar'), '«Recuperar mi suscripción» le pide a Google Play');
  t.eq(pg.st.posts.slice(-1), [{ compras: [{ token: 'TOK-p25', producto: PROD('p25') }] }], 'y manda las del celular a compras-google');
  t.has(pg.dialogs.join(' '), 'recuperamos tu suscripción de Google Play', 'y avisa que la recuperó');
  t.eq(pg.errs, [], 'errores (prueba en Android)');
  await pg.close();

  // 6b) Google no pudo cobrar (la suscripción quedó suspendida y el plan se cortó): lo explica, ofrece
  // «Administrar en Google Play» y no deja comprar otro plan (quedaría pagando dos cuando se recupere).
  const SUSPENDIDA = { plan: 'p25', max_clients: 25, trial_ends_at: D(-60), paid_until: D(-1), google_token: 'TOK-p25', google_vence: D(-1), google_renueva: true };
  pg = await pagina(SUSPENDIDA, { init: plugin('android', { vigentes: [Object.assign({}, EN_CELULAR[0], { suspendida: true })] }) });
  await pg.p.goto(base + '/app/'); await wait(3000);
  muro = await txt(pg.p, '#coachHost');
  t.has(muro, 'Google Play no pudo cobrar tu plan. Actualizá el medio de pago en Google Play y se activa solo.', 'suspendida: lo explica');
  t.has(muro, 'Administrar en Google Play', 'suspendida: «Administrar en Google Play»');
  t.eq(await pg.p.evaluate(() => document.querySelectorAll('#coachHost [data-plan="choose"]').length), 0, 'suspendida: no ofrece comprar otro plan');
  t.ok((await compras(pg.p)).some(x => x[0] === 'avisos'), 'suspendida: muestra el aviso propio de Google');
  t.eq(pg.errs, [], 'errores (suspendida)');
  await pg.close();

  // 7) En la web, con el plan de Google: no ofrece pagar otro con Mercado Pago.
  pg = await pagina(GOOGLE25);
  await pg.p.goto(base + '/app/'); await wait(3000);
  t.eq(pg.st.inter, 0, 'web: no pregunta el interruptor de Google Play');
  await pg.p.click('#coachHost [data-plan="open"]'); await wait(600);
  h = await txt(pg.p, '#planSheetHost');
  t.has(h, 'Plan de 25 clientes · suscripción de Google Play que se renueva sola cada mes. La cambiás o la cancelás desde tu Android, en Google Play.', 'web: dice que es una suscripción de Google Play');
  t.ok(!/Pagar con tarjeta|Renovar con tarjeta|Cancelar la renovación|\$24\.900/.test(h), 'web: no ofrece Mercado Pago encima: ' + h);
  t.eq(pg.errs, [], 'errores (web con plan de Google)');
  await pg.close();

  // 8) En el iPhone, con el plan de Google: «Tu plan está activo», sin nombrar a Google ni ofrecer comprar.
  pg = await pagina(GOOGLE25, { init: plugin('ios') });
  await pg.p.goto(base + '/app/'); await wait(3000);
  await pg.p.click('#coachHost [data-plan="open"]'); await wait(600);
  h = await txt(pg.p, '#planSheetHost') + ' ' + await txt(pg.p, '#coachHost');
  t.has(h, 'Tu plan está activo. Plan de 25 clientes, al día hasta el', 'iPhone con plan de Google: «Tu plan está activo»');
  t.ok(!/Google|Android|Suscribirme|US\$/.test(h), 'iPhone con plan de Google: no nombra a Google ni ofrece comprar: ' + h);
  t.eq(pg.st.inter, 0, 'iPhone: no pregunta el interruptor de Google Play');
  t.eq(pg.errs, [], 'errores (iPhone con plan de Google)');
  await pg.close();
}
