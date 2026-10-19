// Comida en un día anterior: lo que se trae de la nube viene con su «base» (valores cada 100 g).
// Antes no se pedía: al cambiar cualquier cosa del día se volvía a subir el día entero con base en
// null (se perdía para todas sus comidas), y al editar los gramos de una se recalculaba con lo
// redondeado (0,3 g de edulcorante guardado como 1 kcal pasaba a 333 kcal cada 100 g, no 400).
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const E1 = 'cccccccc-0000-4000-8000-000000000001', E2 = 'cccccccc-0000-4000-8000-000000000002';
const B1 = { kcal: 400, p: 0, c: 100, f: 0, unit: 'g' }, B2 = { kcal: 360, p: 6.7, c: 78, f: 0.6, unit: 'g' };

export default async function ({ base, t }){
  const ayer = ymd(new Date(Date.now() - 864e5));
  const rows = [
    { id: E1, client_id: ALUMNO.id, log_date: ayer, pos: 0, meal: 'desayuno', name: 'Edulcorante', grams: 0.3, kcal: 1, protein: 0, carbs: 0.3, fat: 0, unit: 'g', base: B1 },
    { id: E2, client_id: ALUMNO.id, log_date: ayer, pos: 1, meal: 'almuerzo', name: 'Arroz blanco', grams: 80, kcal: 288, protein: 5.4, carbs: 62.4, fat: 0.5, unit: 'g', base: B2 },
  ];
  const posts = [];
  const { p, errs, close } = await newPage({ user: ALUMNO, state: { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {}, calTarget: 2000 },
    handlers: {
      '/profiles': profile('client'),
      '/food_entries': (r, J, i) => {
        if (i.m !== 'GET'){ if (i.m === 'POST') posts.push(JSON.parse(i.body || '[]')); return undefined; }
        if (!i.url.search.includes('log_date=eq.' + ayer)) return J([]);
        // Como la base de verdad: solo las columnas pedidas.
        const sel = (i.url.searchParams.get('select') || '*').split(',').map(s => s.trim());
        return J(rows.map(x => sel.includes('*') ? x : Object.fromEntries(sel.filter(k => k in x).map(k => [k, x[k]]))));
      },
    } });
  await p.goto(base + '/app/'); await wait(2500);
  await p.click('#nav-comida'); await wait(400);
  await p.click('[data-action="day-prev"]'); await wait(1000);
  t.ok(!!(await p.$(`[data-action="diary-edit"][data-id="${E1}"]`)), 'se ve lo de ayer');

  // Cambia el edulcorante a 100 g: usa los valores de la base, no los rearmados de lo redondeado.
  await p.click(`[data-action="diary-edit"][data-id="${E1}"]`); await wait(400);
  await p.fill('#portionGrams', '100');
  await p.click('[data-action="portion-save"]'); await wait(3000);
  const last = posts.filter(b => Array.isArray(b) && b.some(x => x.id === E1)).pop() || [];
  const e1 = last.find(x => x.id === E1), e2 = last.find(x => x.id === E2);
  t.ok(!!e1 && !!e2, 'sube el día entero: ' + JSON.stringify(posts));
  t.eq(e1 && [e1.grams, e1.kcal, e1.carbs], [100, 400, 100], 'el edulcorante editado usa su base (400 kcal cada 100 g)');
  t.eq(e2 && e2.base, B2, 'la base de la otra comida del día no se pierde');
  t.eq(errs, [], 'errores de la página');
  await close();
}
