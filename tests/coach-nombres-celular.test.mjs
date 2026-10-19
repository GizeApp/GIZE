// Editor de rutina del coach en el celular: el ejercicio cerrado muestra el nombre entero (hasta dos
// renglones), también adentro de una superserie. Se cortaba en un renglón con «…» («Camilla de
// cuádri…», «Sillón de isquiotibi…», «Press inclinado con manc…») y no se sabía cuál era.
import { newPage, wait } from './lib.mjs';

const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
const A1 = '44444444-4444-4444-4444-444444444444';
const NOMBRES = ['Press inclinado con mancuernas', 'Camilla de cuádriceps', 'Sillón de isquiotibiales', 'Elevaciones laterales con mancuernas', 'Gemelos parado'];
const rutina = () => [{ id: 'd0', name: 'Pierna', subtitle: '', exercises: NOMBRES.map((name, k) => Object.assign(
  { id: 'e' + k, name, sets: [0, 1, 2].map(j => ({ id: 'e' + k + 's' + j, kg: '', reps: '', target: '10-12' })) }, k === 1 ? { ss: true } : {})) }];

export default async function ({ base, t }){
  for (const w of [390, 320]){
    const ACTUAL = rutina();
    const { p, errs, close } = await newPage({ user: COACH, viewport: { width: w, height: 844 }, touch: true,
      handlers: {
        '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
          if (/coach_id=eq/.test(i.url.search)) return J([{ id: A1, full_name: 'Ana Alumna' }]); return J(i.one ? me : [me]); },
        '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
        '/routines': (r, J, i) => i.m === 'GET' ? J(i.one ? { days: ACTUAL } : [{ days: ACTUAL }]) : undefined,
        '/routine_templates': (r, J) => J([]), '/routine_schedule': (r, J) => J([]),
      } });
    await p.goto(base + '/app/'); await wait(3500);
    await p.click(`[data-coach="open"][data-id="${A1}"]`); await wait(1500);
    await p.click('[data-coach="client-tab"][data-t="rutina"]'); await wait(600);
    const n = await p.$$eval('.co-exc-collapsed', l => l.map(c => { const e = c.querySelector('.co-exc-ctext'), r = e.getBoundingClientRect();
      return { t: e.textContent, entero: e.scrollWidth <= e.clientWidth + 1 && e.scrollHeight <= e.clientHeight + 1, renglones: Math.round(r.height / parseFloat(getComputedStyle(e).lineHeight)), alto: Math.round(c.getBoundingClientRect().height) }; }));
    t.eq(n.map(x => x.t), NOMBRES, w + ' px: los cinco ejercicios');
    t.ok(n.every(x => x.entero && x.renglones <= 2), w + ' px: cada nombre se ve entero, en hasta dos renglones: ' + JSON.stringify(n));
    t.ok(n.every(x => x.alto <= 92), w + ' px: la tarjeta cerrada sigue baja: ' + JSON.stringify(n.map(x => x.alto)));
    t.ok(await p.evaluate(() => { const h = document.getElementById('coachHost'); return h.scrollWidth <= h.clientWidth; }), w + ' px: sin scroll de costado');
    t.eq(errs, [], 'errores de la página (' + w + ' px)');
    await close();
  }
}
