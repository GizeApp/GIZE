// Comida, agua y hábitos de hoy con dos dispositivos (el celular y gize.ar abierto en la compu).
// Antes, un dispositivo desactualizado subía su «foto del día» entera: al pasar de día con la
// app abierta mandaba el día vacío (agua 0, sin hábitos) y borraba en la nube TODAS las comidas
// de hoy que no tuviera, aunque se hubieran cargado en el otro; y mandaba sus pasos (0 en la
// web) encima de los del celular. Ahora: en la nube se borra solo lo que se sacó en este
// dispositivo, el día nuevo vacío no se sube (se trae lo de la nube) y los pasos no viajan con
// el día.
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

const F1 = 'aaaaaaaa-0000-4000-8000-000000000001', F2 = 'aaaaaaaa-0000-4000-8000-000000000002', F3 = 'aaaaaaaa-0000-4000-8000-000000000003';
const food = (id, name, kcal) => ({ id, client_id: ALUMNO.id, name, grams: 100, kcal, protein: 1, carbs: 1, fat: 1, unit: 'g', meal: 'desayuno', pos: 0 });
const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

export default async function ({ base, t }){
  const hoy = ymd(new Date());
  const cloud = { row: null, foods: [] };
  const writes = [];
  const handlers = {
    '/profiles': profile('client'),
    '/daily_logs': (r, J, i) => {
      if (i.m === 'GET') return J(i.one ? cloud.row : (cloud.row ? [cloud.row] : []));
      writes.push({ t: 'daily_logs', m: i.m, body: JSON.parse(i.body || 'null') }); return undefined;
    },
    '/food_entries': (r, J, i) => {
      if (i.m === 'GET') return J(i.url.search.includes('log_date=eq.') ? cloud.foods : []);
      writes.push({ t: 'food_entries', m: i.m, q: decodeURIComponent(i.url.search), body: i.body }); return undefined;
    },
  };
  const { p, errs, close } = await newPage({ user: ALUMNO, state: { days: [{ id: 'd1', name: 'Día 1', exercises: [] }], sessions: [], weights: [], daily: {}, habits: [{ id: 'h1', name: 'Dormir 8 h', done: false }] }, handlers });

  // 1) Arranca: la nube todavía no tiene el día de hoy.
  await p.goto(base + '/app/'); await wait(3500);
  const mod = () => p.evaluate(async () => { const s = await import('/app/core/state.js'); return { diary: s.state.diary.map(x => x.id), water: s.state.water, steps: s.state.steps }; });

  // 2) Pasa de día con la app abierta (la pestaña quedó abierta desde ayer), y mientras tanto en
  //    el celular ya cargó el desayuno y 500 ml de agua, y Salud subió 4000 pasos.
  cloud.row = { client_id: ALUMNO.id, log_date: hoy, water_ml: 500, steps: 4000, habits_done: { own: ['Dormir 8 h'], coach: [] } };
  cloud.foods = [food(F1, 'Desayuno del celular', 300)];
  writes.length = 0;
  await p.evaluate(async () => {
    const { state } = await import('/app/core/state.js');
    state.diaryDate = state.waterDate = state.stepsDate = state.habitsDate = '2000-01-01';
    state.diary = [{ id: 'bbbbbbbb-0000-4000-8000-00000000000b', name: 'Cena de ayer', grams: 100, kcal: 500, p: 1, c: 1, f: 1, unit: 'g' }];
    state.water = 2000;
    // La racha todavía no tiene el día de hoy: al volver a primer plano se redibuja (y pasa de día).
    const { today } = await import('/app/core/utils.js');
    state.visits = (state.visits || []).filter(d => d !== today());
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await wait(4000);
  t.eq(writes.filter(w => w.t === 'food_entries' && w.m === 'DELETE'), [], 'pasar de día no borra en la nube las comidas de hoy');
  t.ok(!writes.some(w => w.t === 'daily_logs' && w.body && (w.body.water_ml === 0 || (Array.isArray(w.body) && w.body.some(b => b.water_ml === 0)))), 'pasar de día no sube el agua en 0: ' + JSON.stringify(writes));
  let st = await mod();
  t.eq(st.diary, [F1], 'trae de la nube lo cargado hoy en el otro dispositivo');
  t.eq(st.water, 500, 'y el agua');
  t.eq(st.steps, 4000, 'y los pasos');
  t.ok(await p.evaluate(async () => (await import('/app/core/state.js')).state.habits[0].done), 'y los hábitos tildados');

  // 3) El celular carga otra comida (este dispositivo no la tiene) y acá se borra el desayuno:
  //    en la nube se borra solo el desayuno.
  cloud.foods = [food(F1, 'Desayuno del celular', 300), food(F3, 'Almuerzo del celular', 600)];
  writes.length = 0;
  await p.evaluate(async F1 => {
    const { state } = await import('/app/core/state.js'); const { save } = await import('/app/core/storage.js');
    state.diary = state.diary.filter(x => x.id !== F1); state.water = 750; save();
  }, F1);
  await wait(3500);
  const dels = writes.filter(w => w.t === 'food_entries' && w.m === 'DELETE');
  t.eq(dels.length, 1, 'borrar una comida manda un borrado: ' + JSON.stringify(writes));
  t.ok(dels[0] && dels[0].q.includes('id=in.(' + F1 + ')') && !dels[0].q.includes('not.'), 'borra solo la que se sacó acá (no «todo lo que no esté en la lista»): ' + (dels[0] && dels[0].q));
  const day = writes.find(w => w.t === 'daily_logs' && w.m === 'POST');
  const body = day && (Array.isArray(day.body) ? day.body[0] : day.body);
  t.ok(body && body.water_ml === 750, 'el agua se sube: ' + JSON.stringify(body));
  t.ok(body && !('steps' in body), 'los pasos no viajan con el día (van solos, desde Salud)');

  // 4) Cargar una comida nueva sin borrar nada: no se borra nada en la nube.
  writes.length = 0;
  await p.evaluate(async F2 => {
    const { state } = await import('/app/core/state.js'); const { save } = await import('/app/core/storage.js');
    state.diary.push({ id: F2, name: 'Merienda', grams: 50, kcal: 200, p: 1, c: 1, f: 1, unit: 'g' }); save();
  }, F2);
  await wait(3500);
  t.eq(writes.filter(w => w.t === 'food_entries' && w.m === 'DELETE'), [], 'cargar una comida no borra nada en la nube');
  t.ok(writes.some(w => w.t === 'food_entries' && w.m === 'POST' && w.body.includes(F2)), 'y la sube');
  t.eq(errs, [], 'errores de la página');
  await close();
}
