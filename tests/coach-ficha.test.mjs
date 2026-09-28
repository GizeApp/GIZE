// Panel del coach: abrir la ficha de un alumno. No se descargan fotos de progreso (el panel ya
// no las muestra) y los entrenos con el mismo ejercicio dos veces se ven separados.
import { newPage, wait, text } from './lib.mjs';

export default async function ({ base, t }){
  const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
  const A1 = '44444444-4444-4444-4444-444444444444';
  const sess = [{ id: 's1', performed_on: '2026-09-20', day_name: 'Pierna', created_at: '2026-09-20T12:00:00Z', session_entries: [
    { exercise_name: 'Sentadilla libre', set_order: 0, kg: 100, reps: 5 }, { exercise_name: 'Sentadilla libre', set_order: 1000, kg: 60, reps: 12 }] }];
  const photoReqs = [];
  const { p, errs, close } = await newPage({ user: COACH, viewport: { width: 1100, height: 900 },
    handlers: {
      '/checkin_photos': (r, J, i) => (photoReqs.push(decodeURIComponent(i.url.search)), J([])),
      '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
        if (/coach_id=eq/.test(i.url.search)) return J([{ id: A1, full_name: 'Ana Alumna' }]); return J(i.one ? me : [me]); },
      '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
      '/sessions': (r, J, i) => i.m === 'GET' ? J(/client_id=eq\.4444/.test(i.url.search) ? sess : []) : undefined,
    } });
  await p.goto(base + '/app/'); await wait(3500);
  await p.click(`[data-coach="open"][data-id="${A1}"]`); await wait(1500);
  t.has(await text(p, '#coachHost'), 'Ana Alumna', 'se abre la ficha del alumno');
  t.ok(!photoReqs.some(q => q.includes(A1)), 'no se piden las fotos de progreso del alumno: ' + photoReqs.join(' | '));
  const ex = await p.evaluate(async () => { const { CoachState } = await import('/app/screens/coach/state.js'); const d = CoachState.coachData; return d && d.sessions && d.sessions[0] && d.sessions[0].exercises.map(e => e.name + ':' + e.sets.map(s => s.kg).join(',')); });
  t.eq(ex, ['Sentadilla libre:100', 'Sentadilla libre:60'], 'el coach ve el mismo ejercicio dos veces por separado');
  t.eq(errs, [], 'errores de la página');
  await close();
}
