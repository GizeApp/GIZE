// Aviso de fin de descanso en la app de Android: desde Android 14 «Alarmas y recordatorios»
// viene apagado y el aviso salía tarde (alarma inexacta). En el primer descanso se pide una sola
// vez, antes de programar el aviso; si ya está permitido, o en iPhone, no se pregunta nada.
// La pregunta es un cartel propio (confirmar, app/ui/avisos.js) que no frena la app: si el descanso
// termina o se saltea mientras está abierta, al contestar no se programa el aviso de ese descanso
// (antes sonaba un «¡Descanso terminado!» de un descanso que ya no estaba).
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

// Un descanso de 60 s que se saltea al rato (la pregunta, si la hay, ya se contestó: tarda lo que
// tarda el cartel en aparecer y cerrarse).
const descanso = p => p.evaluate(async () => { const r = await import('/app/ui/restbar.js'); r.startRest(60); await new Promise(ok => setTimeout(ok, 1200)); r.stopRest(); });

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

  // La pregunta queda abierta y mientras tanto el descanso se saltea (o termina): al contestar «sí»
  // se abre el ajuste, pero el aviso de ese descanso ya no se programa.
  pg = await newPage({ user: ALUMNO, init: NATIVO('android', 'denied'), state: { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {} } });
  pg.p.contestar = null; // se contesta a mano
  await pg.p.goto(base + '/app/'); await wait(2500);
  await pg.p.evaluate(async () => { (await import('/app/ui/restbar.js')).startRest(60); }); await wait(800);
  t.ok(await pg.p.$('.av-bg .av-go'), 'Android: la pregunta está abierta');
  await pg.p.evaluate(async () => { (await import('/app/ui/restbar.js')).stopRest(); }); await wait(200);
  await pg.p.click('.av-bg .av-go'); await wait(800);
  t.eq(await pg.p.evaluate(() => window.__log), ['check', 'change'], 'Android: descanso salteado con la pregunta abierta: abre el ajuste pero no programa un aviso viejo');
  // Un descanso nuevo después sí se programa.
  await pg.p.evaluate(async () => { (await import('/app/ui/restbar.js')).startRest(60); }); await wait(500);
  t.eq(await pg.p.evaluate(() => window.__log.filter(x => x !== 'check')), ['change', 'schedule 4101'], 'Android: el descanso siguiente se programa');
  t.eq(pg.errs, [], 'errores (descanso salteado con la pregunta abierta)');
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
