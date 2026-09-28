// Entreno: guardar la sesión (sin series vacías) y récords con coma o punto ("82,5" = "82.5").
import { newPage, saved, wait, ALUMNO, profile } from './lib.mjs';

export default async function ({ base, t }){
  const days = [{ id: 'd1', name: 'Torso', exercises: [
    { id: 'e1', name: 'Press de banca plano (barra)', sets: [
      { id: 's1', kg: '80', reps: '8', done: true }, { id: 's2', kg: '80', reps: '7', done: true }, { id: 's3', kg: '80', reps: '' }, { id: 's4', kg: '', reps: '' }] },
    { id: 'e2', name: 'Remo con barra', sets: [{ id: 's5', kg: '', reps: '' }] }] }];
  const sessions = [{ id: 'a', date: '2026-09-20', ts: Date.parse('2026-09-20T12:00:00Z'), day: 'Torso', exercises: [
    { name: 'Remo con barra', sets: [{ kg: 80, reps: 8 }] }] }];
  const { p, errs, close } = await newPage({ user: ALUMNO, state: { days, sessions, weights: [], daily: {} },
    handlers: { '/profiles': profile('client'), '/sessions': (r, J, i) => i.m === 'GET' ? J({ message: 'sin red' }, 500) : undefined } });
  await p.goto(base + '/app/'); await wait(2500);

  // Récord con coma: 82,5 kg × 5 le gana a 80 × 8 de la vez pasada.
  await p.fill('input.kg[data-set="s5"]', '82,5'); await p.fill('input.reps[data-set="s5"]', '8');
  await p.click('[data-action="toggle"][data-set="s5"]'); await wait(300);
  t.ok(await p.evaluate(() => !!document.querySelector('.pr-chip')), 'récord con "82,5" kg: no apareció el cartel de récord');

  await p.click('[data-action="save-session"]'); await wait(1500);
  const st = await saved(p), last = st.sessions[st.sessions.length - 1];
  t.ok(last && last.day === 'Torso', 'no se guardó la sesión');
  if (last){
    const press = last.exercises.find(e => /Press/.test(e.name)), remo = last.exercises.find(e => /Remo/.test(e.name));
    t.eq(press && press.sets.map(s => [+s.kg, +s.reps]), [[80, 8], [80, 7]], 'series del press (las vacías no se guardan)');
    t.eq(remo && remo.sets.map(s => [+s.kg, +s.reps]), [[82.5, 8]], 'serie del remo con "82,5"');
  }
  t.eq(errs, [], 'errores de la página');
  await close();
}
