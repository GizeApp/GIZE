// Historial de entrenos (alumno y coach): el encabezado y el calendario para elegir dicen la fecha
// y el día, sin «(N series)» (pedido: el dato ya está abajo, en el detalle).
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

export default async function ({ base, t }){
  const ses = [{ id: 's1', date: '2026-09-30', ts: Date.parse('2026-09-30T12:00:00Z'), day: 'Torso', exercises: [{ name: 'Press de banca plano (barra)', sets: [{ kg: 50, reps: 10 }, { kg: 50, reps: 9 }] }] }];
  const { p, errs, close } = await newPage({ user: ALUMNO, state: { days: [{ id: 'd1', name: 'Torso', exercises: [] }], sessions: ses, weights: [], daily: {} }, handlers: { '/profiles': profile('client') } });
  await p.goto(base + '/app/'); await wait(2500);
  const r = await p.evaluate(async () => {
    const { renderSessionItem } = await import('/app/ui/sessiondetail.js');
    const { renderHistorial } = await import('/app/screens/progreso.js');
    const d = document.createElement('div');
    d.innerHTML = renderSessionItem({ id: 's1', date: '2026-09-30', day: 'Torso', exercises: [{ name: 'Press de banca plano (barra)', sets: [{ kg: 50, reps: 10 }, { kg: 50, reps: 9 }] }] }, {});
    const { state } = await import('/app/core/state.js');
    state.sessions = [{ id: 's1', ts: Date.parse('2026-09-30T12:00:00Z'), date: '2026-09-30', day: 'Torso', exercises: [{ name: 'Press de banca plano (barra)', sets: [{ kg: 50, reps: 10 }] }] },
      { id: 's2', ts: Date.parse('2026-09-28T12:00:00Z'), date: '2026-09-28', day: 'Piernas', exercises: [{ name: 'Sentadilla libre', sets: [{ kg: 80, reps: 8 }] }] }];
    const h = document.createElement('div'); h.innerHTML = renderHistorial();
    // Para elegir, el calendario: un botón por día con entreno (lo que lee el lector de pantalla) y el mes.
    const cal = h.querySelector('.cal-x');
    return { head: d.querySelector('.sess-date').textContent.trim(), opts: [...h.querySelectorAll('.cal-x-day[data-d]')].map(b => b.dataset.d + ' ' + b.getAttribute('aria-label')),
      cal: cal ? cal.textContent : '' };
  });
  t.eq(r.head, '30 sep · Torso', 'el encabezado dice fecha y día, sin la cantidad de series');
  t.eq(r.opts.length, 2, 'el calendario marca los dos días con entreno: ' + r.opts.join(' | '));
  t.ok(r.opts.length && r.opts.every(o => !/serie/.test(o)) && !/serie/.test(r.cal), 'el calendario para elegir tampoco: ' + r.opts.join(' | ') + ' · ' + r.cal);
  t.eq(errs, [], 'errores de la página');
  await close();
}
