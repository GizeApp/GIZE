// Notificaciones en la app de iPhone (App Store): Configuración no pide «agregar GIZE a la
// pantalla de inicio» (eso es para Safari: la app de la tienda tiene push nativo). En Safari
// del iPhone el consejo sigue. Con la app abierta, un mensaje del coach se ve una sola vez: en
// iPhone el cartel del sistema (sin el propio de la app encima); en Android, el de la app.
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
// iPhone: el WebView dice «iPhone» en el user agent, sea Safari o la app de la tienda.
const UA = `Object.defineProperty(Navigator.prototype, 'userAgent', { get: () => ${JSON.stringify(IPHONE_UA)} });`;
// App de la tienda (Capacitor) con el plugin de push. plat: 'ios' o 'android'.
// Con prendidas, este celular ya tenía las notificaciones activadas.
const NATIVO = (plat, prendidas) => `(() => {
  const ev = {}; window.__pn = ev;
  if (${!!prendidas}) { localStorage.setItem('gize_fcm_token', 'TOKEN-X'); localStorage.setItem('jfit_notif_enabled', '1'); }
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => ${JSON.stringify(plat)}, Plugins: {
    App: { getInfo: async () => ({ version: '1.0.0', build: '999' }), addListener: () => {}, getLaunchUrl: async () => null },
    PushNotifications: {
      checkPermissions: async () => ({ receive: 'granted' }), requestPermissions: async () => ({ receive: 'granted' }),
      addListener: (n, f) => { (ev[n] = ev[n] || []).push(f); return { remove(){} }; },
      register: async () => { setTimeout(() => (ev.registration || []).forEach(f => f({ value: 'TOKEN-X' })), 50); },
      unregister: async () => {},
    } } };
})();`;

async function abrir(base, init){
  const pg = await newPage({ user: ALUMNO, init,
    state: { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {} },
    handlers: { '/profiles': profile('client') } });
  await pg.p.goto(base + '/app/'); await wait(2500);
  return pg;
}

export default async function ({ base, t }){
  // 1) Configuración → Notificaciones (apagadas, como arranca).
  for (const caso of ['safari', 'app']){
    const pg = await abrir(base, caso === 'app' ? UA + NATIVO('ios') : UA);
    await pg.p.click('#nav-config'); await wait(500);
    const hay = await pg.p.evaluate(() => !!document.querySelector('.cfg-notif-ios'));
    const sw = await pg.p.evaluate(() => !!document.querySelector('[data-action="cfg-notif-toggle"]:not(.on)'));
    t.ok(sw, caso + ': el interruptor de notificaciones está y arranca apagado');
    t.eq(hay, caso === 'safari', caso + ': consejo «agregá GIZE a la pantalla de inicio» ' + (caso === 'safari' ? 'presente' : 'oculto'));
    t.eq(pg.errs, [], 'errores de la página (' + caso + ')');
    await pg.close();
  }

  // 2) Llega un mensaje del coach con la app abierta.
  for (const plat of ['ios', 'android']){
    const pg = await abrir(base, (plat === 'ios' ? UA : '') + NATIVO(plat, true));
    const listo = await pg.p.evaluate(() => !!(window.__pn.registration || []).length);
    t.ok(listo, plat + ': con las notificaciones prendidas se re-registra el celular al entrar');
    await pg.p.evaluate(() => (window.__pn.pushNotificationReceived || []).forEach(f => f({ title: 'Coach Prueba · tu coach', body: 'Hola, ¿cómo va?' })));
    await wait(300);
    const carteles = await pg.p.evaluate(() => [...document.querySelectorAll('[role="status"]')].filter(e => /Coach Prueba · tu coach/.test(e.innerText)).length);
    t.eq(carteles, plat === 'ios' ? 0 : 1, plat + ': cartel propio de la app ' + (plat === 'ios' ? '(no: ya lo muestra el iPhone)' : '(Android no muestra cartel con la app abierta)'));
    t.eq(pg.errs, [], 'errores de la página (mensaje en ' + plat + ')');
    await pg.close();
  }
}
