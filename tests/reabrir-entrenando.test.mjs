// Al reabrir la app en medio de un entreno (el celular cerró la app en segundo plano), Entreno
// vuelve al día que se está entrenando (state.wkStart.day). Antes abría el primer día, sin
// «Entrenando hace…» y con «Iniciar entrenamiento», que al tocarlo perdía el tiempo del de verdad.
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

export default async function ({ base, t }){
  const ex = (id, name, done) => ({ id, name, sets: [{ id: id + 's', kg: '50', reps: '8', done }] });
  const days = [{ id: 'd1', name: 'Día A', exercises: [ex('e1', 'Sentadilla libre', false)] }, { id: 'd2', name: 'Día B', exercises: [ex('e2', 'Remo con barra', false)] },
    { id: 'd3', name: 'Día C', exercises: [ex('e3', 'Press de banca plano (barra)', true), ex('e4', 'Press militar con barra', false)] }];
  const ts = Date.now() - 20 * 60000;
  const { p, errs, close } = await newPage({ user: ALUMNO, state: { days, sessions: [], weights: [], daily: {}, wkStart: { date: '2000-01-01', day: 'd3', ts } }, handlers: { '/profiles': profile('client') } });
  await p.goto(base + '/app/'); await wait(2500);
  t.eq(await p.evaluate(async () => (await import('/app/core/state.js')).State.activeId), 'd3', 'abre en el día que se está entrenando');
  t.ok(await p.$('.wk-live'), 'sigue «Entrenando hace…»');
  t.ok(!(await p.$('[data-action="wk-start"]')), 'sin «Iniciar entrenamiento»');
  t.eq(await p.evaluate(async () => (await import('/app/core/state.js')).state.wkStart.ts), ts, 'el reloj del entreno sigue desde el principio');
  t.eq(errs, [], 'errores de la página');
  await close();
}
