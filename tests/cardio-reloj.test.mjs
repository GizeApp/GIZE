// Cardio, cronómetro y temporizador: si el sistema recarga la app (iOS o Android la cierran en
// segundo plano por falta de memoria), siguen donde estaban. Antes vivían solo en memoria y
// volvían a cero: se perdían las vueltas y el temporizador en marcha no sonaba nunca.
// a) Cronómetro en marcha con una vuelta → recarga → sigue en marcha, contando desde que empezó,
//    con su vuelta. 20 min «en otra app» (la hora guardada más atrás) → al volver, 20 min más.
// b) Temporizador en marcha → recarga → sigue en marcha; si terminó con la app cerrada, queda
//    «¡Tiempo!» (sin sonar a destiempo). Lo de hace más de 12 h no se retoma.
// c) Datos rotos no rompen nada; al cerrar sesión se borra (clearAccountLeftovers).
import { newPage, wait, text, ALUMNO, profile } from './lib.mjs';

const KEY = 'gize_cardio_clock';
const STATE = { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {} };
const clock = p => p.evaluate(async () => JSON.parse(JSON.stringify((await import('/app/screens/cardio.js')).CardioState)));
const edit = (p, fn) => p.evaluate(([k, f]) => { const o = JSON.parse(localStorage.getItem(k)); new Function('o', f)(o); localStorage.setItem(k, JSON.stringify(o)); }, [KEY, fn]);

export default async function ({ base, t }){
  const { p, errs, close } = await newPage({ user: ALUMNO, state: STATE, handlers: { '/profiles': profile('client') } });
  const abrir = async () => {
    await p.goto(base + '/app/'); await wait(2500);
    await p.click('#nav-cardio'); await wait(300);
    if (!(await p.$('.csec-tools details[open]'))) { await p.click('.csec-tools .csec-sum'); await wait(200); }
  };
  await abrir();

  // ===== a) Cronómetro =====
  await p.click('[data-action="sw-toggle"]'); await wait(1200);
  await p.click('[data-action="sw-lap"]'); await wait(300);
  const antes = await clock(p);
  await p.reload(); await wait(2500);
  await p.click('#nav-cardio'); await wait(300);
  let c = await clock(p);
  t.ok(c.swRunning && c.swStartTs === antes.swStartTs, 'a) después de recargar, el cronómetro sigue en marcha desde la misma hora');
  t.eq(c.swLaps, antes.swLaps, 'a) con su vuelta');
  t.eq(await p.$$eval('.lap', l => l.length), 1, 'a) la vuelta se ve');
  t.ok(!!(await p.$('[data-action="sw-toggle"]')) && (await text(p, '[data-action="sw-toggle"]')) === 'Pausar', 'a) con «Pausar» (no «Iniciar»)');
  t.ok((await text(p, '#cringTime')) !== '00:00', 'a) no vuelve a cero: ' + await text(p, '#cringTime'));
  // 20 min en otra app: al volver cuenta esos 20 min.
  await edit(p, 'o.swStartTs -= 20 * 60000;');
  await p.reload(); await wait(2500);
  await p.click('#nav-cardio'); await wait(300);
  t.ok(/^20:0\d$/.test(await text(p, '#cringTime')), 'a) 20 min después, el cronómetro marca 20 min: ' + await text(p, '#cringTime'));

  // ===== b) Temporizador =====
  await p.click('[data-action="cardio-mode"][data-mode="timer"]'); await wait(300);
  await p.click('[data-action="tm-toggle"]'); await wait(1200);
  const tm = await clock(p);
  await p.reload(); await wait(2500);
  c = await clock(p);
  t.ok(c.cardioMode === 'timer' && c.tmRunning && c.tmEndTs === tm.tmEndTs, 'b) después de recargar, el temporizador sigue en marcha y termina a la misma hora');
  t.ok(c.tmRemainingMs > 50000 && c.tmRemainingMs < 59000, 'b) le queda lo que le quedaba: ' + c.tmRemainingMs);
  // Terminó con la app cerrada.
  await edit(p, 'o.tmEndTs = Date.now() - 5000;');
  await p.reload(); await wait(2500);
  await p.click('#nav-cardio'); await wait(300);
  c = await clock(p);
  t.ok(!c.tmRunning && c.tmFinished && c.tmRemainingMs === 0, 'b) terminó con la app cerrada: queda terminado');
  t.has(await p.$eval('.cring-row', e => e.textContent), '¡Tiempo!', 'b) y muestra «¡Tiempo!»');
  // Más de 12 h sin tocarlo: no se retoma.
  await p.click('[data-action="tm-reset"]'); await wait(200);
  await p.click('[data-action="tm-toggle"]'); await wait(200);
  await edit(p, 'o.at -= 13 * 3600000;');
  await p.reload(); await wait(2500);
  c = await clock(p);
  t.ok(!c.tmRunning && c.cardioMode === 'stopwatch', 'b) lo de hace más de 12 h no se retoma');

  // ===== c) Datos rotos y cerrar sesión =====
  await p.evaluate(k => localStorage.setItem(k, JSON.stringify({ v: 1, at: Date.now(), cardioMode: 'timer', swRunning: 'si', swLaps: 'x' })), KEY);
  await p.reload(); await wait(2500);
  c = await clock(p);
  t.ok(c.cardioMode === 'stopwatch' && !c.swRunning && Array.isArray(c.swLaps), 'c) datos rotos: arranca como siempre');
  await p.click('#nav-cardio'); await wait(300);
  await p.click('[data-action="sw-toggle"]'); await wait(300);
  t.ok(await p.evaluate(k => !!localStorage.getItem(k), KEY), 'c) se guarda al tocar');
  await p.evaluate(async () => (await import('/app/core/supabase.js')).clearAccountLeftovers());
  t.ok(await p.evaluate(k => !localStorage.getItem(k), KEY), 'c) al cerrar sesión se borra');

  t.eq(errs, [], 'errores de la página');
  await close();
}
