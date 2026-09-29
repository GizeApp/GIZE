// Ejercicios desplegables para todos: usuarios gratis (sin coach) y alumnos con la rutina que
// arma el coach. En los dos casos arrancan cerrados y se abren con la flecha.
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

export default async function ({ base, t }){
  const days = [{ id: 'd1', name: 'Pierna', exercises: [
    { id: 'e1', name: 'Sentadilla libre', sets: [{ id: 's1', kg: '', reps: '', target: '8' }] },
    { id: 'e2', name: 'Prensa 45°', sets: [{ id: 's2', kg: '', reps: '', target: '10' }] }] }];
  const casos = [['usuario gratis, sin coach', false], ['rutina del coach', true]];
  for (const [tag, conCoach] of casos){
    const { p, errs, close } = await newPage({ user: ALUMNO, state: { days, sessions: [], weights: [], daily: {} }, handlers: { '/profiles': profile('client') } });
    await p.goto(base + '/app/'); await wait(2500);
    // Alumno de un coach: la rutina queda bloqueada (la arma el coach), como en routineLocked().
    if (conCoach) await p.evaluate(async () => {
      const { State } = await import('/app/core/state.js'), m = await import('/app/main.js');
      State.cloudProfile = Object.assign({}, State.cloudProfile || {}, { role: 'client', coach_id: '33333333-3333-3333-3333-333333333333' });
      m.renderApp();
    });
    const rows = await p.$$eval('#view .ex-collapsed', l => l.map(r => r.dataset.ex));
    t.eq(rows.length, 2, tag + ': los ejercicios aparecen cerrados');
    t.eq(await p.$$('#view .card[data-ex-id]').then(l => l.length), 0, tag + ': ninguno desplegado');
    if (rows[0]){
      await p.click('#view .ex-collapsed[data-ex="' + rows[0] + '"] .ex-chev'); await wait(300);
      t.eq(await p.$$('#view .card[data-ex-id]').then(l => l.length), 1, tag + ': la flecha lo abre');
      await p.click('#view .card [data-action="ex-collapse"]'); await wait(500);
      t.eq(await p.$$('#view .card[data-ex-id]').then(l => l.length), 0, tag + ': y lo cierra');
    }
    if (tag === 'rutina del coach') t.ok(await p.$('.coach-banner'), tag + ': es la rutina asignada por el coach');
    t.eq(errs, [], tag + ': errores de la página');
    await close();
  }
}
