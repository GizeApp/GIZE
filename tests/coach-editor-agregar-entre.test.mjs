// Editor de rutina del coach (app/screens/coach/rutinas.js, css/screens/coach/editor.css): entre
// ejercicio y ejercicio hay una línea finita «+ Agregar ejercicio» (.co-ins, data-coach="rt-ins"),
// como antes del rediseño. El buscador que abre agrega el ejercicio justo ahí, no al final.
// - Una entre cada par de ejercicios (la del final es «Agregar ejercicio» de siempre); casi no
//   alarga la lista: en la compu el hueco entre dos tarjetas queda en ~20 px.
// - Adentro de una superserie, el nuevo queda en la superserie (no deja afuera al de abajo).
// - En el celular (pantalla táctil) se ve y tiene al menos 28 px de alto para tocarla.
// - Lo mismo en una de «Mis rutinas» y en la rutina de descarga (mismo editor).
import { newPage, wait } from './lib.mjs';

const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
const A1 = '44444444-4444-4444-4444-444444444444';
const NOMBRES = ['Sentadilla libre', 'Prensa 45°', 'Peso muerto rumano', 'Camilla de cuádriceps', 'Sillón de isquiotibiales', 'Gemelos parado'];
const rutina = () => [{ id: 'd0', name: 'Pierna', subtitle: '', exercises: NOMBRES.map((name, k) => Object.assign(
  { id: 'e' + k, name, sets: [0, 1, 2].map(j => ({ id: 'e' + k + 's' + j, kg: '', reps: '', target: '8-10' })) },
  k === 3 ? { ss: true } : {})) }, { id: 'd1', name: 'Torso', subtitle: '', exercises: [] }]; // Camilla + Sillón: superserie A
const monday = () => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7); return d.toISOString().slice(0, 10); };

async function abrir(base, viewport, touch){
  const ACTUAL = rutina();
  const pg = await newPage({ user: COACH, viewport, touch,
    handlers: {
      '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
        if (/coach_id=eq/.test(i.url.search)) return J([{ id: A1, full_name: 'Ana Alumna' }]); return J(i.one ? me : [me]); },
      '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
      '/routines': (r, J, i) => i.m === 'GET' ? J(i.one ? { days: ACTUAL } : [{ days: ACTUAL }]) : undefined,
      '/routine_templates': (r, J, i) => i.m === 'GET' ? J([{ id: 't1', coach_id: COACH.id, name: 'Pierna fuerte', days: rutina() }]) : undefined,
      '/routine_schedule': (r, J) => J([]),
      '/blocks': (r, J, i) => i.m === 'GET' ? J([{ id: 'b1', client_id: A1, active: true, name: 'Bloque', start_date: monday(), weeks: 6, deloads: [4] }]) : undefined,
    } });
  await pg.p.goto(base + '/app/'); await wait(3500);
  await pg.p.click(`[data-coach="open"][data-id="${A1}"]`); await wait(1500);
  await pg.p.click('[data-coach="client-tab"][data-t="rutina"]'); await wait(600);
  return pg;
}
const orden = p => p.$$eval('.co-exc-grid .co-exc', l => l.map(e => e.dataset.id));
const nombres = p => p.evaluate(async () => { const { rtDays } = await import('/app/screens/coach/rutinas.js'); const { CoachState } = await import('/app/screens/coach/state.js');
  return rtDays()[CoachState.coachEditDay].exercises.map(e => e.name + (e.ss ? '+' : '')); });
// Las líneas para insertar: su data-i, dónde quedan respecto de las tarjetas de arriba y abajo y su tamaño.
const lineas = p => p.evaluate(() => [...document.querySelectorAll('.co-exc-grid .co-ins')].map(b => {
  b.scrollIntoView({ block: 'center' });
  const r = b.getBoundingClientRect(), cards = [...document.querySelectorAll('.co-exc-grid .co-exc')];
  const i = +b.dataset.i, arriba = cards[i - 1].getBoundingClientRect(), abajo = cards[i].getBoundingClientRect();
  const mid = r.top + r.height / 2, hit = document.elementFromPoint(r.left + r.width / 2, mid);
  return { i, txt: b.textContent.trim(), h: Math.round(r.height), entre: mid > arriba.bottom - 2 && mid < abajo.top + 2, hueco: Math.round(abajo.top - arriba.bottom),
    tocable: !!hit && b.contains(hit), op: +getComputedStyle(b.querySelector('.co-ins-b')).opacity };
}));
async function elegir(p, q){ await p.fill('.cp-search', q); await wait(300); await p.click('.cp-ex'); await wait(600); }

export default async function ({ base, t }){
  // ---- Compu ----
  {
    const { p, errs, close } = await abrir(base, { width: 1280, height: 900 });
    let L = await lineas(p);
    t.eq(L.map(x => x.i), [1, 2, 3, 4, 5], 'una línea para agregar entre cada par de ejercicios (5 para 6 ejercicios)');
    t.ok(L.every(x => x.txt === 'Agregar ejercicio' && x.entre && x.tocable), 'cada línea dice «Agregar ejercicio», está entre las dos tarjetas y se puede tocar: ' + JSON.stringify(L));
    t.ok(L.filter(x => x.i <= 2).every(x => x.hueco <= 24), 'casi no alarga la lista (hueco entre tarjetas de hasta 24 px): ' + JSON.stringify(L.map(x => x.hueco)));
    t.eq(await p.$$eval('.co-rt-add-end[data-coach="rt-add"]', l => l.length), 1, 'sigue «Agregar ejercicio» al final');

    // Entre «Prensa 45°» y «Peso muerto rumano»: el buscador agrega ahí.
    await p.click('.co-ins[data-i="2"]'); await wait(400);
    t.ok(!!await p.$('.cp-modal'), 'la línea abre el buscador de ejercicios');
    await elegir(p, 'Zancada');
    let n = await nombres(p);
    t.eq(n.length, 7, 'se agregó un ejercicio');
    t.ok(/Zancada/.test(n[2]) && n[1] === 'Prensa 45°' && n[3] === 'Peso muerto rumano', 'quedó entre «Prensa 45°» y «Peso muerto rumano» (no al final): ' + JSON.stringify(n));
    const o = await orden(p);
    t.ok(await p.$(`.co-exc-open[data-id="${o[2]}"]`), 'el nuevo queda abierto para completarlo');
    t.ok(await p.$('.co-unsaved'), 'queda como cambio sin guardar');

    // Adentro de la superserie (Camilla + Sillón): el nuevo se suma a la superserie.
    L = await lineas(p);
    const enSS = await p.$eval('.co-ss-group .co-ins', b => +b.dataset.i);
    await p.click('.co-ss-group .co-ins'); await wait(400);
    await elegir(p, 'Zancada inversa');
    n = await nombres(p);
    t.eq(enSS, 5, 'la línea de adentro de la superserie va entre Camilla y Sillón');
    t.ok(n[4] === 'Camilla de cuádriceps+' && /Zancada inversa/.test(n[5]) && /\+$/.test(n[5]) && n[6] === 'Sillón de isquiotibiales' && n[7] === 'Gemelos parado',
      'adentro de la superserie el nuevo queda unido y Sillón sigue en la superserie: ' + JSON.stringify(n));
    t.has(await p.$eval('.co-ss-group .co-ss-head', e => e.textContent), 'Triserie', 'la superserie pasa a triserie con el nuevo');
    t.ok(await p.evaluate(() => { const h = document.getElementById('coachHost'); return h.scrollWidth <= h.clientWidth; }), 'sin scroll de costado');

    // En una de «Mis rutinas» (mismo editor).
    await p.evaluate(async () => { const { CoachState } = await import('/app/screens/coach/state.js'); const d = CoachState.coachData; d.routineOrig = JSON.stringify(d.routine); });
    await p.click('[data-coach="view-tpls"]'); await wait(800);
    await p.click('[data-coach="tpl-open"]'); await wait(600);
    t.eq((await lineas(p)).map(x => x.i), [1, 2, 3, 4, 5], 'en «Mis rutinas» también están las líneas para agregar');
    await p.click('.co-ins[data-i="1"]'); await wait(400);
    await elegir(p, 'Zancada');
    n = await nombres(p);
    t.ok(n[0] === 'Sentadilla libre' && /Zancada/.test(n[1]) && n[2] === 'Prensa 45°', 'en «Mis rutinas» se agrega en el lugar elegido: ' + JSON.stringify(n));
    t.eq(errs, [], 'errores de la página (compu)');
    await close();
  }

  // ---- Rutina de descarga (mismo editor) ----
  {
    const { p, errs, close } = await abrir(base, { width: 1280, height: 900 });
    await p.click('[data-coach="client-tab"][data-t="stats"]'); await wait(300);
    await p.click('[data-coach="sec-open"][data-v="bloque"]'); await wait(400);
    await p.click('[data-coach="wk-open"][data-w="4"]'); await wait(400);
    await p.click('[data-coach="dl-new"][data-from="rutina"]'); await wait(600);
    t.eq((await lineas(p)).map(x => x.i), [1, 2, 3, 4, 5], 'en la rutina de descarga también están las líneas para agregar');
    await p.click('.co-ins[data-i="3"]'); await wait(400);
    await elegir(p, 'Zancada');
    const n = await nombres(p);
    t.ok(n[2] === 'Peso muerto rumano' && /Zancada/.test(n[3]) && n[4] === 'Camilla de cuádriceps+', 'en la descarga se agrega en el lugar elegido: ' + JSON.stringify(n));
    t.eq(errs, [], 'errores de la página (descarga)');
    await close();
  }

  // ---- Celular (pantalla táctil) ----
  {
    const { p, errs, close } = await abrir(base, { width: 390, height: 844 }, true);
    const L = await lineas(p);
    t.eq(L.map(x => x.i), [1, 2, 3, 4, 5], 'celular: las cinco líneas para agregar');
    t.ok(L.every(x => x.h >= 28 && x.entre && x.op >= 0.8), 'celular: se ven y tienen al menos 28 px de alto para tocarlas: ' + JSON.stringify(L));
    t.ok(L.filter(x => x.i <= 2).every(x => x.hueco <= 30), 'celular: el hueco entre tarjetas queda chico: ' + JSON.stringify(L.map(x => x.hueco)));
    await p.$eval('.co-ins[data-i="1"]', b => b.scrollIntoView({ block: 'center' })); await wait(200);
    await p.tap('.co-ins[data-i="1"]'); await wait(500);
    t.ok(!!await p.$('.cp-modal'), 'celular: tocar la línea abre el buscador');
    await p.fill('.cp-search', 'Zancada'); await wait(300);
    await p.tap('.cp-ex'); await wait(600);
    const n = await nombres(p);
    t.ok(n[0] === 'Sentadilla libre' && /Zancada/.test(n[1]) && n[2] === 'Prensa 45°', 'celular: se agrega entre los dos: ' + JSON.stringify(n));
    t.ok(await p.evaluate(() => { const h = document.getElementById('coachHost'); return h.scrollWidth <= h.clientWidth; }), 'celular: sin scroll de costado');
    t.eq(errs, [], 'errores de la página (celular)');
    await close();
  }
}
