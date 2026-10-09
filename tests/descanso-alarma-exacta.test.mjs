// Aviso de fin de descanso en la app de Android: desde Android 14 «Alarmas y recordatorios»
// viene apagado y el aviso salía tarde (alarma inexacta). En el primer descanso se pide una sola
// vez, antes de programar el aviso; si ya está permitido, o en iPhone, no se pregunta nada.
import { newPage, wait, ALUMNO } from './lib.mjs';

// exacta: lo que contesta el celular ('granted' o 'denied'); al ir a la pantalla del sistema, el
// usuario la prende.
const NATIVO = (plat, exacta) => `(() => {
  const log = window.__log = []; let ex = ${JSON.stringify(exacta)};
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => ${JSON.stringify(plat)}, Plugins: {
    App: { getInfo: async () => ({ version: '1.0.0', build: '999' }), addListener: () => {}, getLaunchUrl: async () => null },
    LocalNotifications: {
      checkPermissions: async () => ({ display: 'granted' }), requestPermissions: async () => ({ display: 'granted' }),
      checkExactNotificationSetting: async () => { log.push('check'); return { exact_alarm: ex }; },
      changeExactNotificationSetting: async () => { log.push('change'); ex = 'granted'; return { exact_alarm: ex }; },
      createChannel: async () => {}, cancel: async () => {}, addListener: () => {},
      schedule: async o => { log.push('schedule ' + o.notifications.map(n => n.id)); },
    } } };
})();`;

const descanso = p => p.evaluate(async () => { const r = await import('/app/ui/restbar.js'); r.startRest(60); await new Promise(ok => setTimeout(ok, 300)); r.stopRest(); });

export default async function ({ base, t }){
  // Android 14 recién instalada: se pide en el primer descanso, antes de programar el aviso.
  let pg = await newPage({ user: ALUMNO, init: NATIVO('android', 'denied'), state: { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {} } });
  await pg.p.goto(base + '/app/'); await wait(2500);
  await descanso(pg.p);
  t.eq(pg.dialogs.filter(d => /Alarmas y recordatorios/.test(d)).length, 1, 'Android: explica para qué es y pide «Alarmas y recordatorios»');
  t.eq(await pg.p.evaluate(() => window.__log), ['check', 'change', 'schedule 4101'], 'Android: abre el ajuste antes de programar el aviso');
  // Los siguientes descansos no vuelven a preguntar (ni recargando la app).
  await pg.p.evaluate(() => { window.__log.length = 0; });
  await descanso(pg.p);
  await pg.p.reload(); await wait(2500);
  await descanso(pg.p);
  t.eq(pg.dialogs.filter(d => /Alarmas y recordatorios/.test(d)).length, 1, 'Android: se pregunta una sola vez');
  t.eq(await pg.p.evaluate(() => window.__log.filter(x => x !== 'check')), ['schedule 4101'], 'Android: después, solo programa el aviso');
  t.eq(pg.errs, [], 'errores (Android sin alarma exacta)');
  await pg.close();

  // Ya permitido (o Android 11 y anteriores, donde el plugin dice que sí): no pregunta.
  pg = await newPage({ user: ALUMNO, init: NATIVO('android', 'granted'), state: { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {} } });
  await pg.p.goto(base + '/app/'); await wait(2500);
  await descanso(pg.p);
  t.eq(pg.dialogs, [], 'Android con alarma exacta: sin preguntas');
  t.eq(await pg.p.evaluate(() => window.__log), ['check', 'schedule 4101'], 'Android con alarma exacta: programa el aviso');
  await pg.close();

  // iPhone: no existe ese ajuste.
  pg = await newPage({ user: ALUMNO, init: NATIVO('ios', 'denied'), state: { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {} } });
  await pg.p.goto(base + '/app/'); await wait(2500);
  await descanso(pg.p);
  t.eq(pg.dialogs, [], 'iPhone: sin preguntas');
  t.eq(await pg.p.evaluate(() => window.__log), ['schedule 4101'], 'iPhone: programa el aviso');
  t.eq(pg.errs, [], 'errores (iPhone)');
  await pg.close();
}
