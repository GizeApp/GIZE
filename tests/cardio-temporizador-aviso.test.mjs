// Temporizador de Cardio en las apps: con la pantalla bloqueada el WebView se duerme y el pitido
// sonaba recién al volver a abrir la app. Ahora el celular programa una notificación («¡Tiempo!»)
// para la hora de fin: se saca al pausar o reiniciar, y al terminar con la app a la vista (ahí
// ya suena en la app).
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

const NATIVO = `(() => {
  const log = window.__log = [];
  localStorage.setItem('gize_alarma_exacta_pedida', '1');
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {
    App: { getInfo: async () => ({ version: '1.0.0', build: '999' }), addListener: () => {}, getLaunchUrl: async () => null },
    LocalNotifications: {
      checkPermissions: async () => ({ display: 'granted' }), requestPermissions: async () => ({ display: 'granted' }),
      createChannel: async () => {}, addListener: () => {},
      cancel: async o => { log.push('cancel ' + o.notifications.map(n => n.id)); },
      schedule: async o => { o.notifications.forEach(n => log.push('schedule ' + n.id + ' ' + n.title + ' ' + Math.round((n.schedule.at - Date.now()) / 1000))); },
    } } };
})();`;

const avisos = p => p.evaluate(() => window.__log.filter(x => / 4102/.test(x)));
const limpiar = p => p.evaluate(() => { window.__log.length = 0; });
const fijar = (p, ms) => p.evaluate(async ms => { const c = await import('/app/screens/cardio.js'); c.CardioState.tmTarget = ms; c.CardioState.tmRemainingMs = ms; (await import('/app/main.js')).renderApp(); }, ms);

async function abrir(base, init){
  const pg = await newPage({ user: ALUMNO, init, state: { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {} },
    handlers: { '/profiles': profile('client') } });
  await pg.p.goto(base + '/app/'); await wait(2500);
  await pg.p.click('#nav-cardio'); await wait(300);
  await pg.p.click('.csec-tools .csec-sum'); await wait(200);
  await pg.p.click('[data-action="cardio-mode"][data-mode="timer"]'); await wait(300);
  return pg;
}

export default async function ({ base, t }){
  const { p, errs, close } = await abrir(base, NATIVO);
  // 10:00 → Iniciar: aviso para dentro de 10 minutos.
  await fijar(p, 600000); await limpiar(p);
  await p.click('[data-action="tm-toggle"]'); await wait(400);
  let a = await avisos(p);
  t.ok(a.length === 2 && a[0] === 'cancel 4102' && /^schedule 4102 ¡Tiempo! (599|600)$/.test(a[1]), 'al iniciar se programa «¡Tiempo!» para la hora de fin: ' + JSON.stringify(a));
  // Pausar lo saca; Seguir lo vuelve a programar con lo que falta; Reiniciar lo saca.
  await limpiar(p);
  await p.click('[data-action="tm-toggle"]'); await wait(300);
  t.eq(await avisos(p), ['cancel 4102'], 'al pausar se saca el aviso');
  await limpiar(p);
  await p.click('[data-action="tm-toggle"]'); await wait(400);
  a = await avisos(p);
  t.ok(a.length === 2 && /^schedule 4102 ¡Tiempo! (59\d|600)$/.test(a[1]), 'al seguir se programa de nuevo: ' + JSON.stringify(a));
  await limpiar(p);
  await p.click('[data-action="tm-reset"]'); await wait(300);
  t.eq(await avisos(p), ['cancel 4102'], 'al reiniciar se saca el aviso');

  // Termina con la app a la vista: suena en la app y se saca el del celular (no suena dos veces).
  await fijar(p, 1500); await limpiar(p);
  await p.click('[data-action="tm-toggle"]'); await wait(2500);
  a = await avisos(p);
  t.ok(a.length === 3 && /^schedule 4102/.test(a[1]) && a[2] === 'cancel 4102', 'al terminar a la vista se saca el aviso: ' + JSON.stringify(a));
  t.eq(errs, [], 'errores de la página (Android)');
  await close();

  // En la web no hay plugin: el temporizador anda igual.
  const w = await abrir(base);
  await fijar(w.p, 1500);
  await w.p.click('[data-action="tm-toggle"]'); await wait(2500);
  t.ok(await w.p.evaluate(async () => (await import('/app/screens/cardio.js')).CardioState.tmFinished), 'web: el temporizador termina igual');
  t.eq(w.errs, [], 'errores de la página (web)');
  await w.close();
}
