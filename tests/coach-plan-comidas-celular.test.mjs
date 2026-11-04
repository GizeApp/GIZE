// Plan nutricional del alumno → «Comidas», en el celular: la tira de comidas (Desayuno, Almuerzo…) se
// desliza de costado adentro de su franja, y el resto de la pantalla queda del ancho del celular. La
// columna que la contiene se estiraba al ancho de la tira (más de 1000 px) y toda la pantalla del panel
// se corría de costado, como si fuera la vista de computadora.
import { newPage, wait } from './lib.mjs';

const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
const A1 = '44444444-4444-4444-4444-444444444444';
const comida = (meal, time, kcal, note) => ({ meal, time, kcal, cho: '40', fat: '12', prot: '30', note });
const PLAN = { trainDays: [comida('Desayuno', '08:00', '420', 'Avena con banana'), comida('Almuerzo', '13:00', '750', 'Pollo con arroz'), comida('Merienda', '17:30', '300', ''), comida('Cena', '21:00', '650', 'Pescado al horno')],
  restDays: [comida('Desayuno', '09:00', '380', '')], options: [{ label: 'Desayuno alternativo', body: 'Tostadas con huevo' }], extras: [], swaps: [{ a: 'Arroz', b: 'Quinoa' }], habits: [],
  water: '2.5', kcal: '2100', protein: '160', carbs: '220', fat: '70', notes: '', guidelines: [], supps: [], cardio: { text: '', items: [] } };

export default async function ({ base, t }){
  for (const w of [390, 320]){
    const { p, errs, close } = await newPage({ user: COACH, viewport: { width: w, height: 844 }, touch: true, handlers: {
      '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
        if (/coach_id=eq/.test(i.url.search)) return J([{ id: A1, full_name: 'Ana Alumna', role: 'client', coach_id: COACH.id }]); return J(i.one ? me : [me]); },
      '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
      '/nutrition': (r, J, i) => { if (i.m !== 'GET') return J([]); const row = { client_id: A1, plan: JSON.parse(JSON.stringify(PLAN)) }; return J(i.one ? row : [row]); },
      '/routines': (r, J, i) => i.m === 'GET' ? J(i.one ? { days: [] } : [{ days: [] }]) : undefined, '/routine_templates': (r, J) => J([]), '/routine_schedule': (r, J) => J([]),
    } });
    await p.goto(base + '/app/'); await wait(3500);
    await p.click(`[data-coach="open"][data-id="${A1}"]`); await wait(1000);
    await p.click('[data-coach="client-tab"][data-t="plan"]'); await wait(600);
    await p.click('[data-coach="plsec-open"][data-v="comidas"]'); await wait(800);
    const medir = () => p.evaluate(() => {
      const h = document.getElementById('coachHost'), rail = document.querySelector('.cm-rail'), det = document.querySelector('.cm-detail');
      const anchos = [...document.querySelectorAll('#coachHost *')].filter(e => !rail.contains(e) && e !== rail && e.getBoundingClientRect().right > innerWidth + 1)
        .map(e => e.tagName.toLowerCase() + '.' + String(e.className).trim().split(/\s+/)[0]);
      return { host: h.scrollWidth, visible: h.clientWidth, doc: document.documentElement.scrollWidth, vw: innerWidth, rail: rail ? { scroll: rail.scrollWidth, visible: rail.clientWidth } : null,
        detalle: det ? Math.round(det.getBoundingClientRect().width) : 0, comidas: document.querySelectorAll('[data-coach="cm-sel"]').length, fuera: [...new Set(anchos)] };
    });
    let m = await medir();
    t.ok(m.comidas >= 4, w + ' px: se ven las comidas del plan: ' + m.comidas);
    t.ok(m.rail && m.rail.scroll > m.rail.visible, w + ' px: la tira de comidas se desliza adentro de su franja: ' + JSON.stringify(m.rail));
    t.ok(m.host <= m.visible && m.doc <= m.vw, w + ' px: la pantalla no se corre de costado: ' + JSON.stringify(m));
    t.ok(m.detalle > 0 && m.detalle <= m.vw, w + ' px: la comida elegida ocupa el ancho del celular: ' + m.detalle);
    t.eq(m.fuera, [], w + ' px: nada fuera de la pantalla salvo la tira');
    // Lo mismo con una comida elegida.
    await p.click('[data-coach="cm-sel"]'); await wait(500);
    m = await medir();
    t.ok(m.host <= m.visible && m.doc <= m.vw && m.detalle <= m.vw, w + ' px: con una comida abierta tampoco se corre: ' + JSON.stringify(m));
    t.eq(errs, [], 'errores de la página (' + w + ' px)');
    await close();
  }
}
