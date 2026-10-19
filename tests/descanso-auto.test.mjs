// Descanso automático (pedido): al tildar una serie arranca solo el descanso de ese ejercicio
// (el que tiene fijado, el que se ve al lado de «Iniciar descanso»). No arranca si con esa serie se terminó todo el día.
import { newPage, wait, ALUMNO, openAllEx } from './lib.mjs';

const STATE = { days: [{ id: 'd1', name: 'Día 1', exercises: [
  { id: 'e1', name: 'Sentadilla', rest: '1:30', sets: [{ id: 's1', kg: '60', reps: '8' }, { id: 's2', kg: '60', reps: '8' }] }] }],
  sessions: [], weights: [], daily: {} };

export default async ({ base, t }) => {
  const { p, close } = await newPage({ user: ALUMNO, state: STATE });
  await p.goto(base + '/app/'); await wait(2500); await openAllEx(p); await wait(300);
  const bar = () => p.evaluate(() => { const b = document.querySelector('#restBar .rest-inner:not(.rest-done)'); const tm = document.getElementById('restTime'); return b ? (tm && tm.textContent) : null; });
  t.eq(await bar(), null, 'antes de tildar no hay descanso');
  const fijo = await p.evaluate(() => document.querySelector('.rest-edit-t').textContent.trim());
  await p.click('.done[data-set="s1"]'); await wait(600);
  const tm = await bar(), sec = x => { const m = String(x).match(/(\d+):(\d+)/); return m ? +m[1] * 60 + +m[2] : NaN; };
  t.ok(tm && sec(fijo) - sec(tm) >= 0 && sec(fijo) - sec(tm) <= 2, 'al tildar la serie arranca el descanso del ejercicio (' + fijo + '): ' + tm);
  await p.click('#restBar .rest-x'); await wait(300);
  await p.click('.done[data-set="s2"]'); await wait(900);
  t.eq(await bar(), null, 'con la última serie del día no arranca el descanso');
  await close();
};
