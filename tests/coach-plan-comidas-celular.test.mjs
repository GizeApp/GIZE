// Plan nutricional del alumno → «Comidas», en el celular: la lista de comidas (Desayuno, Almuerzo…) va
// en una columna, una debajo de la otra y del ancho del celular, como en la compu (antes era una tira
// que se deslizaba de costado y no se veía entera). El resto de la pantalla queda del ancho del
// celular, y al elegir una comida la página baja hasta su detalle si quedó fuera de la vista.
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
      const h = document.getElementById('coachHost'), det = document.querySelector('.cm-detail');
      const items = [...document.querySelectorAll('[data-coach="cm-sel"]')].map(e => { const r = e.getBoundingClientRect(); return { top: Math.round(r.top), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width) }; });
      const fuera = [...document.querySelectorAll('#coachHost *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1)
        .map(e => e.tagName.toLowerCase() + '.' + String(e.className).trim().split(/\s+/)[0]);
      return { host: h.scrollWidth, visible: h.clientWidth, doc: document.documentElement.scrollWidth, vw: innerWidth, vh: innerHeight, items,
        detalle: det ? { w: Math.round(det.getBoundingClientRect().width), top: Math.round(det.getBoundingClientRect().top) } : null, fuera: [...new Set(fuera)] };
    });
    let m = await medir();
    t.ok(m.items.length >= 6, w + ' px: se ven las comidas del plan más Adicionales y Reemplazos: ' + m.items.length);
    // Una debajo de la otra, todas del mismo ancho y dentro del celular.
    const apiladas = m.items.every((it, i) => !i || it.top > m.items[i - 1].top);
    t.ok(apiladas, w + ' px: las comidas van una debajo de la otra: ' + JSON.stringify(m.items.map(x => x.top)));
    const anchos = new Set(m.items.map(x => x.w));
    t.ok(anchos.size === 1 && m.items.every(x => x.right <= m.vw && x.w >= m.vw * 0.8), w + ' px: todas del ancho del celular: ' + JSON.stringify([...anchos]) + ' de ' + m.vw);
    t.ok(m.host <= m.visible && m.doc <= m.vw, w + ' px: la pantalla no se corre de costado: ' + JSON.stringify({ host: m.host, visible: m.visible, doc: m.doc, vw: m.vw }));
    t.ok(m.detalle && m.detalle.w > 0 && m.detalle.w <= m.vw, w + ' px: la comida elegida ocupa el ancho del celular: ' + JSON.stringify(m.detalle));
    t.eq(m.fuera, [], w + ' px: nada fuera de la pantalla');
    // Al elegir una comida que deja el detalle abajo de la pantalla, la página baja hasta él.
    await p.evaluate(() => window.scrollTo(0, 0)); await wait(200);
    await p.click('[data-coach="cm-sel"][data-m="1"]'); await wait(900);
    m = await medir();
    t.ok(m.detalle && m.detalle.top < m.vh * 0.6 && m.detalle.top > -5, w + ' px: al elegir una comida se ve su detalle: ' + JSON.stringify(m.detalle) + ' alto ' + m.vh);
    t.ok(m.host <= m.visible && m.doc <= m.vw, w + ' px: con una comida abierta tampoco se corre: ' + JSON.stringify({ host: m.host, doc: m.doc }));
    t.eq(errs, [], 'errores de la página (' + w + ' px)');
    await close();
  }
}
