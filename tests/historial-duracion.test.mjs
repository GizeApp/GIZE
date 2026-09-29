// Historial de entrenos: la duración se redondea en minutos antes de separar las horas
// (1:59:30 es «2 h 00», no «1 h 60»).
import { newPage, wait, text, ALUMNO, profile } from './lib.mjs';

export default async function ({ base, t }){
  const ex = [{ name: 'Sentadilla libre', sets: [{ kg: 100, reps: 5 }] }];
  const sessions = [{ id: 'a', date: '2026-09-20', ts: Date.parse('2026-09-20T12:00:00Z'), day: 'Pierna', exercises: ex, dur: 7170 }];
  const { p, errs, close } = await newPage({ user: ALUMNO, state: { days: [{ id: 'd1', name: 'Pierna', exercises: [] }], sessions, weights: [], daily: {} },
    handlers: { '/profiles': profile('client'), '/sessions': (r, J, i) => i.m === 'GET' ? J({ message: 'sin red' }, 500) : undefined } });
  await p.goto(base + '/app/'); await wait(2500);
  await p.click('#nav-progreso'); await wait(300);
  await p.click('[data-action="psec-open"][data-v="historial"]'); await wait(300);
  const tot = await text(p, '.sd-tot');
  t.has(tot, '2 h 00', 'Historial: 1 h 59 min 30 s se ve como «2 h 00»');
  t.ok(!tot.includes('h 60'), 'Historial: nunca «h 60»: ' + tot);

  // Otros valores, con la misma tarjeta que usan el alumno y el coach.
  const got = await p.evaluate(async () => {
    const { renderSessionItem } = await import('/app/ui/sessiondetail.js');
    return [3570, 3599, 7169, 7170, 7199, 7200, 10770, 45, 1500].map(dur => {
      const box = document.createElement('div');
      box.innerHTML = renderSessionItem({ date: '2026-09-20', ts: 1, day: 'Pierna', exercises: [{ name: 'Sentadilla libre', sets: [{ kg: 100, reps: 5 }] }], dur });
      return box.querySelector('.sd-tot div:last-child b').textContent;
    });
  });
  t.eq(got, ['1 h 00', '1 h 00', '1 h 59', '2 h 00', '2 h 00', '2 h 00', '3 h 00', '1 min', '25 min'], 'duraciones');
  t.eq(errs, [], 'errores de la página');
  await close();
}
