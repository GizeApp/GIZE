// Ejercicios por tiempo deducidos del nombre (isTimedEx): «Elevación de piernas colgado» es de
// repeticiones (está en la rutina armada «PPL · 5 días» con 8-12), pero «colgad» lo marcaba por
// tiempo: salía un cronómetro de 8 s y no había dónde anotar las reps. Colgarse de la barra sí es
// por tiempo. En la caminata del granjero (por tiempo) el campo de kg está siempre, aunque esté vacío.
import { newPage, wait, ALUMNO, profile, openAllEx } from './lib.mjs';

export default async function ({ base, t }){
  const set = id => ({ id, kg: '', reps: '', target: '8-12' });
  const days = [{ id: 'd1', name: 'Core', exercises: [
    { id: 'e1', name: 'Elevación de piernas colgado', mus: 'abs', sets: [set('s1')] },
    { id: 'e2', name: 'Caminata del granjero', mus: 'antebrazo', sets: [{ id: 's2', kg: '', secs: '' }] },
    { id: 'e3', name: 'Plancha', mus: 'abs', sets: [{ id: 's3', kg: '', secs: '' }] }] }];
  const { p, errs, close } = await newPage({ user: ALUMNO, state: { days, sessions: [], weights: [], daily: {} }, handlers: { '/profiles': profile('client') } });
  await p.goto(base + '/app/'); await wait(2500); await openAllEx(p);
  const names = ['Elevación de piernas colgado', 'Colgarse de la barra', 'Dead hang (colgarse)', 'Colgado de la barra', 'Plancha', 'Caminata del granjero', 'Elevación de piernas'];
  const timed = await p.evaluate(async n => { const { isTimedEx } = await import('/app/core/utils.js'); return n.map(name => isTimedEx({ name })); }, names);
  t.eq(timed, [false, true, true, true, true, true, false], 'por tiempo según el nombre: ' + names.join(' | '));
  const row = id => p.evaluate(id => { const c = document.querySelector('[data-ex-id="' + id + '"]'); return c ? { reps: !!c.querySelector('input.reps'), secs: !!c.querySelector('input.secs'), kg: !!c.querySelector('input.kg') } : null; }, id);
  t.eq(await row('e1'), { reps: true, secs: false, kg: true }, 'elevación de piernas colgado: se anotan kg y reps (sin cronómetro)');
  t.eq(await row('e2'), { reps: false, secs: true, kg: true }, 'caminata del granjero: segundos y el campo de kg, aunque esté vacío');
  t.eq(await row('e3'), { reps: false, secs: true, kg: false }, 'plancha: segundos, sin kg (como siempre)');
  t.eq(errs, [], 'errores de la página');
  await close();
}
