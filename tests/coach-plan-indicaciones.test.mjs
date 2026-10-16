// Plan alimenticio del alumno, en el panel del coach: vuelven las tarjetas «Indicaciones» (pautas
// nutricionales y suplementos recomendados) y «Cardio» (indicación general y sesiones). El alumno los
// sigue viendo (Comida → Pautas y Cardio → «Tu cardio de esta semana»), pero desde el rediseño del
// plan el coach no los podía cargar, cambiar ni borrar: lo viejo le quedaba al alumno para siempre.
import { newPage, wait } from './lib.mjs';

const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
const A1 = '44444444-4444-4444-4444-444444444444';
const PLAN = { trainDays: [{ meal: 'Desayuno', time: '08:00', kcal: '400', cho: '', fat: '', prot: '', note: '' }], restDays: [], options: [], extras: [], swaps: [], habits: [],
  guidelines: ['Verduras en almuerzo y cena', 'Nada de gaseosas'], supps: ['Creatina 5 g por día'], cardio: { text: '30 min de caminata', items: ['Martes: bici 20 min'] } };

export default async function ({ base, t }){
  const saves = [];
  const { p, errs, dialogs, close } = await newPage({ user: COACH, viewport: { width: 390, height: 844 }, touch: true,
    handlers: {
      '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
        if (/coach_id=eq/.test(i.url.search)) return J([{ id: A1, full_name: 'Ana Alumna' }]); return J(i.one ? me : [me]); },
      '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
      '/nutrition': (r, J, i) => { if (i.m !== 'GET'){ saves.push(JSON.parse(i.body)); return J([]); } const row = { client_id: A1, plan: JSON.parse(JSON.stringify(PLAN)) }; return J(i.one ? row : [row]); },
    } });
  await p.goto(base + '/app/'); await wait(3500);
  await p.click(`[data-coach="open"][data-id="${A1}"]`); await wait(1500);
  await p.click('[data-coach="client-tab"][data-t="plan"]'); await wait(500);
  const tiles = await p.$$eval('[data-coach="plsec-open"]', l => l.map(b => [b.dataset.v, b.querySelector('.ptile-t').textContent, b.querySelector('.ptile-s').textContent]));
  const ind = tiles.find(x => x[0] === 'ind'), car = tiles.find(x => x[0] === 'cardio');
  t.eq(ind && ind.slice(1), ['Indicaciones', '2 pautas · 1 suplemento'], 'el plan tiene la tarjeta «Indicaciones» con lo cargado: ' + JSON.stringify(tiles));
  t.eq(car && car.slice(1), ['Cardio', '30 min de caminata'], 'el plan tiene la tarjeta «Cardio» con lo cargado');

  // Indicaciones: se ve lo cargado, se cambia, se borra y se agrega.
  await p.tap('[data-coach="plsec-open"][data-v="ind"]'); await wait(400);
  t.eq(await p.$$eval('[data-coach="pl-list"][data-key="guidelines"]', l => l.map(e => e.value)), PLAN.guidelines, 'se ven las pautas cargadas');
  t.eq(await p.$$eval('[data-coach="pl-list"][data-key="supps"]', l => l.map(e => e.value)), PLAN.supps, 'se ven los suplementos cargados');
  await p.fill('[data-coach="pl-list"][data-key="supps"][data-i="0"]', 'Creatina 3 g por día'); await wait(150);
  await p.tap('[data-coach="pl-listdel"][data-key="guidelines"][data-i="1"]'); await wait(300);
  await p.tap('[data-coach="pl-listadd"][data-key="guidelines"]'); await wait(300);
  await p.fill('[data-coach="pl-list"][data-key="guidelines"][data-i="1"]', 'Fruta de postre'); await wait(150);
  t.ok(await p.$('.co-unsaved'), 'los cambios quedan como sin guardar');
  await p.tap('[data-coach="plsec-close"]'); await wait(300);

  // Cardio.
  await p.tap('[data-coach="plsec-open"][data-v="cardio"]'); await wait(400);
  t.eq(await p.$eval('[data-coach="pl-cardiotext"]', e => e.value), '30 min de caminata', 'se ve la indicación de cardio');
  await p.fill('[data-coach="pl-cardiotext"]', '40 min de caminata'); await wait(150);
  await p.tap('[data-coach="pl-cardioitemadd"]'); await wait(300);
  await p.fill('[data-coach="pl-cardioitem"][data-i="1"]', 'Jueves: cinta 15 min'); await wait(150);
  await p.tap('[data-coach="plan-save"]'); await wait(800);
  const s = saves[saves.length - 1];
  t.eq(s && s.plan.guidelines, ['Verduras en almuerzo y cena', 'Fruta de postre'], 'se guardan las pautas cambiadas');
  t.eq(s && s.plan.supps, ['Creatina 3 g por día'], 'se guardan los suplementos cambiados');
  t.eq(s && s.plan.cardio, { text: '40 min de caminata', items: ['Martes: bici 20 min', 'Jueves: cinta 15 min'] }, 'se guarda el cardio');
  t.eq(s && s.plan.trainDays.length, 1, 'el resto del plan sigue igual');
  t.ok(dialogs.some(d => /Plan guardado/.test(d)), 'avisa que se guardó');
  t.ok(await p.evaluate(() => { const h = document.getElementById('coachHost'); return h.scrollWidth <= h.clientWidth; }), 'sin scroll de costado');
  t.eq(errs, [], 'errores de la página');
  await close();
}
