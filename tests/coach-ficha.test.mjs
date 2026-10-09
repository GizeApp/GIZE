// Panel del coach: abrir la ficha de un alumno. No se descargan fotos de progreso (el panel ya
// no las muestra) y los entrenos con el mismo ejercicio dos veces se ven separados. La fecha de
// un peso la escribe el alumno: si no es una fecha, se muestra como texto (no se arma HTML).
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
      '/body_weights': (r, J, i) => i.m === 'GET' ? J(/client_id=eq\.4444/.test(i.url.search) ? [
        { id: 'w1', client_id: A1, measured_on: '<b id=pwn>x</b>', kg: 70 }, { id: 'w2', client_id: A1, measured_on: '<a id=pwnlink href="http://127.0.0.1:9/x">x</a>', kg: 71 }] : []) : undefined,
    } });
  await p.goto(base + '/app/'); await wait(3500);
  await p.click(`[data-coach="open"][data-id="${A1}"]`); await wait(1500);
  t.has(await text(p, '#coachHost'), 'Ana Alumna', 'se abre la ficha del alumno');
  t.ok(!photoReqs.some(q => q.includes(A1)), 'no se piden las fotos de progreso del alumno: ' + photoReqs.join(' | '));
  const ex = await p.evaluate(async () => { const { CoachState } = await import('/app/screens/coach/state.js'); const d = CoachState.coachData; return d && d.sessions && d.sessions[0] && d.sessions[0].exercises.map(e => e.name + ':' + e.sets.map(s => s.kg).join(',')); });
  t.eq(ex, ['Sentadilla libre:100', 'Sentadilla libre:60'], 'el coach ve el mismo ejercicio dos veces por separado');
  // Peso corporal con fechas armadas como HTML: quedan como texto en la tabla y en el gráfico.
  await p.click('[data-coach="sec-open"][data-v="peso"]'); await wait(500);
  t.eq(await p.$$eval('#coachHost #pwn, #coachHost #pwnlink', l => l.length), 0, 'la fecha del peso no mete elementos en la ficha');
  t.eq(await p.$$eval('#coachHost td.dt', l => l.map(e => e.textContent).filter(s => !/^Sem\./.test(s))), ['<a id=pwnlink href="http://127.0.0.1:9/x">x</a>', '<b id=pwn>x</b>'], 'la fecha se ve tal cual, como texto');
  t.ok((await p.$$eval('#coachHost .w-chart svg text', l => l.map(e => e.textContent))).includes('<b id=pwn>x</b>'), 'en el gráfico también va como texto');
  t.eq(errs, [], 'errores de la página');
  await close();
}
