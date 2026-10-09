// «Limpiar» (portada del día, justo debajo de «Finalizar» y «Cancelar») destilda todas las series
// y borra el reloj del entreno. Antes lo hacía con un toque, sin preguntar: el tiempo del entreno
// se perdía para siempre. Ahora, si hay algo que perder (entreno en curso o series tildadas), pregunta.
import { newPage, saved, wait, ALUMNO, profile } from './lib.mjs';

export default async function ({ base, t }){
  const days = [{ id: 'd1', name: 'Torso', exercises: [{ id: 'e1', name: 'Press de banca plano (barra)', sets: [{ id: 's1', kg: '80', reps: '8', done: true }, { id: 's2', kg: '80', reps: '8', done: false }] }] }];
  const ts = Date.now() - 20 * 60000;
  const { p, errs, dialogs, close } = await newPage({ user: ALUMNO, state: { days, sessions: [], weights: [], daily: {}, wkStart: { date: '2000-01-01', day: 'd1', ts } }, handlers: { '/profiles': profile('client') } });
  await p.goto(base + '/app/'); await wait(2500);
  const estado = async () => { const st = await saved(p); return [st.days[0].exercises[0].sets.map(s => !!s.done), st.wkStart ? st.wkStart.ts : null]; };

  // Cancelando la pregunta no se toca nada.
  await p.evaluate(() => { window._confirm = window.confirm; window.confirm = () => false; });
  await p.click('.day-head [data-action="clear"]'); await wait(400);
  t.eq(await estado(), [[true, false], ts], 'cancelando: quedan las tildes y el reloj del entreno');
  t.ok(await p.$('.wk-live'), 'cancelando: sigue «Entrenando hace…»');

  // Aceptando, se limpia.
  await p.evaluate(() => { window.confirm = window._confirm; });
  await p.click('.day-head [data-action="clear"]'); await wait(400);
  t.eq(await estado(), [[false, false], null], 'aceptando: se destilda todo y se para el reloj');
  t.ok(dialogs.some(m => /Limpiar/.test(m) && /reloj/.test(m)), 'pregunta antes de limpiar: ' + JSON.stringify(dialogs));

  // Sin nada que perder, no pregunta.
  const n = dialogs.length;
  await p.click('.day-head [data-action="clear"]'); await wait(400);
  t.eq(dialogs.length, n, 'sin entreno ni tildes no pregunta');
  t.eq(errs, [], 'errores de la página');
  await close();
}
