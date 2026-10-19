// Ejercicio terminado con récord (más kg que en las salidas anteriores): la copa del renglón
// cerrado va en dorado, con el mismo filete fino de neón que el tilde.
import { newPage, wait, ALUMNO } from './lib.mjs';

const STATE = { days: [{ id: 'd1', name: 'Día 1', exercises: [{ id: 'e1', name: 'Sentadilla', sets: [{ id: 's1', kg: '60', reps: '8', done: true }, { id: 's2', kg: '60', reps: '8', done: true }] }] }], sessions: [], weights: [], daily: {} };

export default async ({ base, t }) => {
  const { p, close } = await newPage({ user: ALUMNO, state: STATE, init: "localStorage.setItem('gize_lite','0');" });
  await p.goto(base + '/app/'); await wait(2500);
  const r = await p.evaluate(async () => {
    const { state } = await import('/app/core/state.js');
    state.sessions = [{ id: 'x1', date: '2026-09-28', ts: 1790000000000, day: 'Día 1', exercises: [{ name: 'Sentadilla', sets: [{ kg: '50', reps: '8', done: true }] }] }];
    (await import('/app/main.js')).renderApp();
    await new Promise(r => setTimeout(r, 300));
    const b = document.querySelector('.ex-collapsed-badge');
    return b && { pr: b.classList.contains('is-pr'), color: getComputedStyle(b).color, ring: getComputedStyle(b).backgroundImage };
  });
  t.ok(r && r.pr, 'el ejercicio con récord muestra la copa');
  t.eq(r && r.color, 'rgb(255, 201, 64)', 'la copa del récord es dorada');
  t.ok(r && /linear-gradient\(155deg/.test(r.ring), 'con el filete fino de neón: ' + (r && r.ring));
  await close();
};
