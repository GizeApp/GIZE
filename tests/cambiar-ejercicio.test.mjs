// Cambiar un ejercicio de la rutina por otro (ícono de cambiar, o «Escribir nombre propio»): las
// series quedaban con los kg, reps y tildes del anterior, así que el nuevo aparecía hecho
// («80 kg × 8») y al guardar quedaba en el historial con un récord falso. Ahora arranca vacío. Del
// lado del coach, el ejercicio cambiado lleva series nuevas (otros ids): si no, al llegarle la
// rutina al alumno se le pasaba lo que había cargado en el ejercicio viejo.
import { newPage, saved, wait, ALUMNO, profile, openAllEx } from './lib.mjs';

const BANCA = 'Press de banca plano (barra)', INCL = 'Press inclinado con mancuernas';

export default async function ({ base, t }){
  const mk = () => [{ id: 'd1', name: 'Torso', exercises: [
    { id: 'e1', name: BANCA, mus: 'pecho', sets: [{ id: 's1', kg: '80', reps: '8', done: true }, { id: 's2', kg: '80', reps: '8', done: true }] },
    { id: 'e2', name: 'Remo con barra', mus: 'espalda', sets: [{ id: 's3', kg: '60', reps: '10', done: true }] }] }];
  const sessions = [{ id: 'a', date: '2026-09-20', ts: Date.parse('2026-09-20T12:00:00Z'), day: 'Torso', exercises: [{ name: INCL, sets: [{ kg: 30, reps: 8 }] }] }];
  const { p, errs, close } = await newPage({ user: ALUMNO, state: { days: mk(), sessions, weights: [], daily: {} }, handlers: { '/profiles': profile('client') } });
  await p.goto(base + '/app/'); await wait(2500); await openAllEx(p);

  // Desde la lista de ejercicios.
  await p.click('[data-ex-id="e1"] [data-action="ex-swap"]'); await wait(400);
  await p.fill('#exSearch', INCL); await wait(200);
  await p.click('.ex-pick[data-name="' + INCL + '"]'); await wait(600);
  let st = await saved(p), ex = st.days[0].exercises[0];
  t.eq(ex.name, INCL, 'el ejercicio cambia');
  t.eq(ex.sets.map(s => [s.kg, s.reps, !!s.done]), [['', '', false], ['', '', false]], 'el nuevo arranca vacío y sin tildar (no hereda 80 kg × 8)');
  t.eq(st.days[0].exercises[1].sets.map(s => [s.kg, s.reps, !!s.done]), [['60', '10', true]], 'los otros ejercicios no se tocan');

  // Con nombre propio.
  await p.evaluate(async () => { const { state } = await import('/app/core/state.js'); state.days[0].exercises[0].sets.forEach(s => { s.kg = '30'; s.reps = '8'; s.done = true; }); (await import('/app/main.js')).renderApp(); });
  await wait(200); await openAllEx(p);
  p.dialogAnswer = 'Mi press raro';
  await p.click('[data-ex-id="e1"] [data-action="ex-swap"]'); await wait(400);
  await p.click('[data-action="ex-custom"]'); await wait(600);
  st = await saved(p); ex = st.days[0].exercises[0];
  t.eq([ex.name, ex.sets.map(s => [s.kg, s.reps, !!s.done])], ['Mi press raro', [['', '', false], ['', '', false]]], 'con nombre propio también arranca vacío');

  // Coach: el ejercicio cambiado lleva series nuevas y el alumno no hereda lo del viejo.
  const coach = await p.evaluate(async ([BANCA, INCL]) => {
    const { CoachState } = await import('/app/screens/coach/state.js'), r = await import('/app/screens/coach/rutinas.js'), sb = await import('/app/core/supabase.js');
    const routine = [{ id: 'd1', name: 'Torso', exercises: [{ id: 'e1', name: BANCA, mus: 'pecho', sets: [{ id: 's1', target: '8' }, { id: 's2', target: '8' }] }, { id: 'e2', name: 'Remo con barra', sets: [{ id: 's3', target: '10' }] }] }];
    const local = [{ id: 'd1', name: 'Torso', exercises: [{ id: 'e1', name: BANCA, sets: [{ id: 's1', kg: '80', reps: '8', done: true }, { id: 's2', kg: '80', reps: '8', done: true }] }, { id: 'e2', name: 'Remo con barra', sets: [{ id: 's3', kg: '60', reps: '10', done: true }] }] }];
    CoachState.coachData = { routine }; CoachState.coachEditDay = 0; CoachState.coachPicker = { mode: 'swap', i: 0 };
    try { r.cpApply(INCL, 'pecho'); } catch (e) {}
    const merged = sb.mergeLocalProgress(JSON.parse(JSON.stringify(routine)), local);
    return { name: routine[0].exercises[0].name, targets: routine[0].exercises[0].sets.map(s => s.target),
      e1: merged[0].exercises[0].sets.map(s => [s.kg || '', !!s.done]), e2: merged[0].exercises[1].sets.map(s => [s.kg || '', !!s.done]) };
  }, [BANCA, INCL]);
  t.eq([coach.name, coach.targets], [INCL, ['8', '8']], 'coach: el ejercicio cambia y quedan sus series');
  t.eq(coach.e1, [['', false], ['', false]], 'coach: al alumno no se le pasa lo cargado en el ejercicio viejo');
  t.eq(coach.e2, [['60', true]], 'coach: lo de los otros ejercicios se conserva');
  t.eq(errs, [], 'errores de la página');
  await close();
}
