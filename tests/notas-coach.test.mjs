// Notas del coach: la de cada ejercicio sale solo adentro del ejercicio, no repetida abajo.
// Abajo queda solo la nota general del día (si el coach escribió una).
import { newPage, wait, ALUMNO, profile, openAllEx } from './lib.mjs';

export default async function ({ base, t }){
  const ej = [{ id: 'e1', name: 'Press de banca plano (barra)', note: 'Bajá controlado.', sets: [{ id: 's1', kg: '', reps: '' }] },
    { id: 'e2', name: 'Remo con barra', sets: [{ id: 's2', kg: '', reps: '' }] }];
  for (const [tag, dayNote] of [['sin nota del día', ''], ['con nota del día', 'Hoy entrená liviano.']]){
    const days = [{ id: 'd1', name: 'Torso', note: dayNote, exercises: ej }];
    const { p, errs, close } = await newPage({ user: ALUMNO, state: { days, sessions: [], weights: [], daily: {} }, handlers: { '/profiles': profile('client') } });
    await p.goto(base + '/app/'); await wait(2500); await openAllEx(p);
    const r = await p.evaluate(() => ({
      inEx: [...document.querySelectorAll('.card .ex-note')].map(e => e.textContent),
      bottom: document.querySelector('.daynotes') ? document.querySelector('.daynotes').textContent : null }));
    t.eq(r.inEx.length, 1, tag + ': la nota del ejercicio está adentro del ejercicio');
    t.ok(!(r.bottom || '').includes('Bajá controlado'), tag + ': y no se repite abajo');
    if (dayNote) t.ok((r.bottom || '').includes(dayNote), tag + ': la nota general del día sigue abajo');
    else t.eq(r.bottom, null, tag + ': sin nota del día no hay recuadro abajo');
    t.eq(errs, [], tag + ': errores de la página');
    await close();
  }
}
