// Cardio, cronómetro pausado: tocar el número y «Listo» sin mover las ruedas deja el tiempo
// y las vueltas como estaban (con más de 60 min se cortaba a 1:00:00 y se borraban las vueltas).
import { newPage, wait, text, ALUMNO, profile } from './lib.mjs';

export default async function ({ base, t }){
  const { p, errs, close } = await newPage({ user: ALUMNO, state: { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {} },
    handlers: { '/profiles': profile('client') } });
  await p.goto(base + '/app/'); await wait(2500);
  await p.click('#nav-cardio'); await wait(300);

  // 1:15:15 con una vuelta, pausado.
  await p.click('[data-action="sw-toggle"]'); await wait(200);
  await p.evaluate(async () => { const c = await import('/app/screens/cardio.js'); c.CardioState.swStartTs -= 75 * 60000 + 15000; });
  await wait(300);
  await p.click('[data-action="sw-lap"]'); await wait(200);
  await p.click('[data-action="sw-toggle"]'); await wait(300);
  const before = await text(p, '#cringTime');
  t.ok(/^1:15:1\d$/.test(before), 'cronómetro pausado en más de una hora: ' + before);
  await p.click('#cringTime'); await wait(500);
  t.eq(await p.$eval('#twMin .tw-item.on', e => e.textContent), '75', 'la rueda de minutos arranca en 75');
  await p.click('#timePick [data-tp="ok"]'); await wait(300);
  t.eq(await text(p, '#cringTime'), before, '«Listo» sin cambiar nada no corta el tiempo a 1:00:00');
  t.eq(await p.$$eval('.lap', l => l.length), 1, '«Listo» sin cambiar nada no borra las vueltas');

  // Por debajo de 60 min: tampoco se borran las vueltas.
  await p.click('[data-action="sw-reset"]'); await wait(200);
  await p.evaluate(async () => { const c = await import('/app/screens/cardio.js'); c.CardioState.swAccum = 30 * 60000 + 20500; c.CardioState.swLaps = [10 * 60000]; (await import('/app/main.js')).renderApp(); });
  await wait(200);
  await p.click('#cringTime'); await wait(500);
  await p.click('#timePick [data-tp="ok"]'); await wait(300);
  t.eq(await text(p, '#cringTime'), '30:20', 'con 30:20, «Listo» deja 30:20');
  t.eq(await p.$$eval('.lap', l => l.length), 1, 'con 30:20, «Listo» no borra las vueltas');

  // Cambiar el tiempo sí lo cambia (y las vueltas viejas ya no valen).
  await p.click('#cringTime'); await wait(500);
  await p.evaluate(() => { document.getElementById('twMin').scrollTop = 10 * 44; }); await wait(200);
  await p.click('#timePick [data-tp="ok"]'); await wait(300);
  t.eq(await text(p, '#cringTime'), '10:20', 'al elegir otro tiempo, el cronómetro arranca desde ahí');
  t.eq(await p.$$eval('.lap', l => l.length), 0, 'al elegir otro tiempo, se borran las vueltas');

  // El temporizador sigue hasta 60 min.
  await p.click('[data-action="cardio-mode"][data-mode="timer"]'); await wait(300);
  await p.click('#cringTime'); await wait(500);
  t.eq(await p.$$eval('#twMin .tw-item', l => l.length), 61, 'el temporizador sigue con minutos de 00 a 60');
  await p.click('#timePick [data-tp="close"]'); await wait(200);
  t.eq(errs, [], 'errores de la página');
  await close();
}
