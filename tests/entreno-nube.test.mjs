// Entreno: lo que viaja a la nube y vuelve (duración, el mismo ejercicio dos veces) y los
// ejercicios asistidos (kg negativos) en "Evolución de cargas" y al editar el historial.
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

export default async function ({ base, t }){
  const posts = {};
  const days = [{ id: 'd1', name: 'Pierna', exercises: [
    { id: 'e1', name: 'Sentadilla libre', sets: [{ id: 's1', kg: '100', reps: '5', done: true }] },
    { id: 'e2', name: 'Sentadilla libre', sets: [{ id: 's2', kg: '60', reps: '12', done: true }] }] }];
  const { p, errs, close } = await newPage({ user: ALUMNO,
    state: { days, sessions: [], weights: [], daily: {}, wkStart: { date: '2000-01-01', day: 'd1', ts: Date.now() - 10 * 60000, manual: true } },
    handlers: { '/profiles': profile('client'),
      '/sessions': (r, J, i) => i.m === 'POST' ? (posts.sessions = i.body, r.fulfill({ status: 201, body: '[]' })) : undefined,
      '/session_entries': (r, J, i) => i.m === 'POST' ? (posts.entries = i.body, r.fulfill({ status: 201, body: '[]' })) : undefined } });
  await p.goto(base + '/app/'); await wait(2500);

  // El reloj sigue aunque el entreno haya empezado "otro día" (pasó la medianoche).
  t.ok(await p.evaluate(() => !!document.querySelector('.wk-live')), 'el reloj del entreno sigue después de la medianoche');
  await p.click('[data-action="save-session"]'); await wait(2500);
  const row = posts.sessions ? JSON.parse(posts.sessions) : null, r0 = Array.isArray(row) ? row[0] : row;
  t.ok(r0 && r0.duration_s >= 590 && r0.duration_s <= 700, 'la duración del entreno viaja a la nube: ' + JSON.stringify(r0 && r0.duration_s));
  const en = posts.entries ? JSON.parse(posts.entries) : [];
  t.eq(en.map(e => [e.exercise_name, e.set_order]), [['Sentadilla libre', 0], ['Sentadilla libre', 1000]], 'set_order separa el mismo ejercicio hecho dos veces');

  const res = await p.evaluate(async () => {
    const sb = await import('/app/core/supabase.js');
    const row = e => ({ performed_on: '2026-09-20', day_name: 'Pierna', created_at: '2026-09-20T12:00:00Z', session_entries: e });
    const nuevo = sb.sessionFromRow(row([{ exercise_name: 'Sentadilla libre', set_order: 1000, kg: 60, reps: 12 }, { exercise_name: 'Sentadilla libre', set_order: 0, kg: 100, reps: 5 }]));
    const viejo = sb.sessionFromRow(row([{ exercise_name: 'Press', set_order: 1, kg: 80, reps: 6 }, { exercise_name: 'Remo', set_order: 0, kg: 70, reps: 8 }, { exercise_name: 'Press', set_order: 0, kg: 80, reps: 8 }]));
    const { state } = await import('/app/core/state.js');
    const pr = await import('/app/screens/progreso.js');
    state.sessions = [{ date: '2026-09-20', ts: 1, exercises: [{ name: 'Dominadas asistidas en máquina', sets: [{ kg: -25, reps: 8 }, { kg: -30, reps: 10 }] }] }];
    const cargas = pr.loadSeriesFor('Dominadas asistidas en máquina');
    const se = await import('/app/ui/sessionedit.js');
    se.EditState.se = { exercises: [{ name: 'Dominadas asistidas en máquina', sets: [{ kg: '25', reps: '8' }, { kg: -30, reps: 10 }] }] };
    const edit = se.cleanSessionEdit();
    return { nuevo: nuevo.exercises.map(e => [e.name, e.sets.map(s => s.kg)]), viejo: viejo.exercises.map(e => [e.name, e.sets.map(s => s.kg + 'x' + s.reps)]), cargas, edit: edit.exercises && edit.exercises[0].sets.map(s => s.kg) };
  });
  t.eq(res.nuevo, [['Sentadilla libre', [100]], ['Sentadilla libre', [60]]], 'al volver de la nube son dos ejercicios, en orden');
  t.eq(res.viejo, [['Remo', ['70x8']], ['Press', ['80x8', '80x6']]], 'entrenos viejos se agrupan por nombre como antes');
  t.eq(res.cargas, [{ date: '2026-09-20', kg: -25 }], 'asistidos en "Evolución de cargas" (el de menos ayuda)');
  t.eq(res.edit, [-25, -30], 'editar un asistido: "25" se guarda como ayuda (-25)');
  t.eq(errs, [], 'errores de la página');
  await close();
}
