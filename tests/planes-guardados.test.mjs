// Planes alimenticios guardados del coach («Mis planes», supabase/planes-alimenticios-guardados.sql):
// guardar el plan de un cliente como plan, aplicarle un plan guardado a ese cliente (copia
// entera a nutrition), ver la lista en «Mis planes», aplicar un plan a varios clientes y, si
// falta la tabla, el aviso de que hay que correr el SQL. Con SHOTS=carpeta guarda capturas.
import { newPage, wait, text } from './lib.mjs';

const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
const A1 = '44444444-4444-4444-4444-444444444444', A2 = '55555555-5555-5555-5555-555555555555';
const PLAN_A1 = { trainDays: [{ meal: 'Desayuno', time: '8', kcal: '500', cho: '60', fat: '15', prot: '30', note: '' }], restDays: [], water: '3', salt: '', guidelines: ['Comer verduras'], supps: [], options: [], extras: [], swaps: [], cardio: { text: '', items: [] }, habits: [] };
const DEF = { id: 'aaaaaaaa-0000-0000-0000-000000000001', coach_id: COACH.id, name: 'Definición', plan: { trainDays: [{ meal: 'Almuerzo', time: '13', kcal: '700', cho: '80', fat: '20', prot: '45', note: '' }, { meal: 'Cena', time: '21', kcal: '600', cho: '50', fat: '20', prot: '40', note: '' }], restDays: [], water: '2,5', salt: '5', guidelines: [], supps: ['Creatina'], options: [{ title: 'Desayuno', opts: [{ label: 'Opción A', body: '2 huevos\n1 tostada' }] }], extras: [], swaps: [], cardio: { text: '30 min', items: [] }, habits: ['Dormir 8 h'], habitDays: [null] } };

const base0 = (extra) => Object.assign({
  '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
    if (/coach_id=eq/.test(i.url.search)) return J([{ id: A1, full_name: 'Ana Alumna' }, { id: A2, full_name: 'Bruno Cliente' }]); return J(i.one ? me : [me]); },
  '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
}, extra);

export default async function ({ base, t }){
  const SHOTS = process.env.SHOTS;
  const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: SHOTS + '/' + name + '.png' }); };

  // ---- Con la tabla creada ----
  const store = [JSON.parse(JSON.stringify(DEF))];
  const tplPosts = [], nutPosts = [], tplDeletes = [];
  const { p, errs, dialogs, close } = await newPage({ user: COACH, handlers: base0({
    '/coach_meal_templates': (r, J, i) => {
      if (i.m === 'GET') return J(store.slice().sort((a, b) => a.name.localeCompare(b.name)));
      if (i.m === 'POST') { const b = JSON.parse(i.body); const rows = (Array.isArray(b) ? b : [b]).map(x => Object.assign({ id: x.id || 'bbbbbbbb-0000-0000-0000-00000000000' + (store.length + 1) }, x));
        tplPosts.push({ search: decodeURIComponent(i.url.search), body: b });
        rows.forEach(x => { const k = store.findIndex(s => s.id === x.id); if (k >= 0) store[k] = x; else store.push(x); }); return J(rows, 201); }
      if (i.m === 'DELETE') { tplDeletes.push(decodeURIComponent(i.url.search)); return J([], 200); }
      return undefined;
    },
    '/nutrition': (r, J, i) => {
      if (i.m === 'GET') return J(/client_id=eq\.4444/.test(i.url.search) ? { client_id: A1, kcal: 500, notes: 'Nota vieja', plan: PLAN_A1 } : null);
      if (i.m === 'POST') { nutPosts.push({ search: decodeURIComponent(i.url.search), body: JSON.parse(i.body) }); return J([], 201); }
      return undefined;
    },
  }) });
  await p.goto(base + '/app/'); await wait(3500);

  // Ficha del cliente → Plan alimenticio: los dos botones nuevos.
  await p.click(`[data-coach="open"][data-id="${A1}"]`); await wait(1200);
  await p.click('[data-coach="client-tab"][data-t="plan"]'); await wait(300);
  t.ok(await p.$('[data-coach="mp-tosave"]'), 'botón «Guardar como plan» en el plan del cliente');
  t.ok(await p.$('[data-coach="mp-apply"]'), 'botón «Aplicar un plan guardado» en el plan del cliente');
  const tabsFit = await p.evaluate(() => [...document.querySelectorAll('.co-tabs')].every(x => x.scrollWidth <= x.clientWidth + 1) && document.documentElement.scrollWidth <= innerWidth);
  t.ok(tabsFit, 'las pestañas no se salen en 390 px');
  await p.evaluate(() => document.querySelector('[data-coach="mp-tosave"]').scrollIntoView({ block: 'center' })); await wait(200);
  await shot(p, '1-plan-del-cliente');

  // Guardar como plan → POST a coach_meal_templates con el plan del cliente.
  p.dialogAnswer = 'Plan base';
  await p.click('[data-coach="mp-tosave"]'); await wait(800);
  t.eq(tplPosts.length, 1, 'se guarda el plan en coach_meal_templates');
  const sent = tplPosts[0] && tplPosts[0].body;
  t.eq(sent && sent.name, 'Plan base', 'con el nombre elegido');
  t.eq(sent && sent.coach_id, COACH.id, 'del coach');
  t.eq(sent && sent.plan && sent.plan.trainDays, PLAN_A1.trainDays, 'con las comidas del cliente');
  t.eq(sent && sent.plan && sent.plan.guidelines, ['Comer verduras'], 'y sus pautas');
  t.ok(dialogs.some(d => d.includes('Guardado en «Mis planes»')), 'avisa que se guardó: ' + dialogs.join(' | '));

  // Aplicar un plan guardado al cliente.
  await p.click('[data-coach="mp-apply"]'); await wait(600);
  const pk = await text(p, '#applyMount');
  t.has(pk, 'Definición', 'el selector lista los planes guardados');
  t.has(pk, 'Plan base', 'incluido el recién guardado');
  await shot(p, '2-selector-de-planes');
  await p.click(`[data-coach="mpk-tpl"][data-id="${DEF.id}"]`); await wait(800);
  t.eq(nutPosts.length, 1, 'se guarda el plan del cliente en nutrition');
  const nb = nutPosts[0] && nutPosts[0].body;
  t.eq(nb && nb.client_id, A1, 'para ese cliente');
  t.has(nutPosts[0] && nutPosts[0].search, 'on_conflict=client_id', 'reemplazando su plan');
  t.eq(nb && nb.plan && nb.plan.trainDays, DEF.plan.trainDays, 'con las comidas del plan guardado');
  t.eq(nb && nb.plan && nb.plan.options, DEF.plan.options, 'y sus opciones de menú');
  t.eq(nb && nb.kcal, 1300, 'con las kcal del plan');
  t.ok(nb && !('notes' in nb), 'sin borrar la nota vieja del cliente');
  const copia = await p.evaluate(async () => { const { CoachState } = await import('/app/screens/coach/state.js');
    const tpl = CoachState.coachMealTpls.find(x => x.name === 'Definición'); const d = CoachState.coachData;
    const pl = d.plan.plan; const before = JSON.stringify(tpl.plan.trainDays); pl.trainDays[0].kcal = '9999';
    const r = { distinct: pl !== tpl.plan && pl.trainDays !== tpl.plan.trainDays, intact: JSON.stringify(tpl.plan.trainDays) === before, closed: !CoachState.coachMealPicker };
    pl.trainDays[0].kcal = '700'; return r; });
  t.ok(copia.distinct && copia.intact, 'el cliente recibe una copia (cambiarla no toca el plan guardado)');
  t.ok(copia.closed, 'se cierra el selector');
  t.has(await text(p, '#coachHost'), '2 comidas', 'el editor muestra el plan nuevo');

  // «Mis planes» en el panel principal.
  await p.click('[data-coach="back"]'); await wait(600);
  await p.click('[data-coach="view-meals"]'); await wait(600);
  const lst = await text(p, '#coachHost');
  t.has(lst, 'Definición', '«Mis planes» lista los planes guardados');
  t.has(lst, 'Plan base', 'con el guardado desde el cliente');
  t.has(lst, 'Mis planes (2)', 'con la cantidad en la pestaña');
  await shot(p, '3-mis-planes');

  // Abrir uno, cambiarle el nombre y guardarlo.
  await p.click(`[data-coach="mp-open"][data-id="${DEF.id}"]`); await wait(400);
  t.has(await text(p, '#coachHost'), 'Hidratación', 'se abre con el mismo editor del plan');
  await p.fill('[data-coach="mp-name"]', 'Definición 2'); await wait(100);
  await p.click('[data-coach="mp-save"]'); await wait(800);
  const up = tplPosts[tplPosts.length - 1];
  t.eq(up && up.body && up.body.id, DEF.id, 'al guardar se actualiza el mismo plan');
  t.eq(up && up.body && up.body.name, 'Definición 2', 'con el nombre nuevo');

  // Aplicar a varios clientes.
  await p.click('[data-coach="mp-apply-many"]'); await wait(400);
  t.has(await text(p, '#applyMount'), 'Bruno Cliente', 'el selector lista los clientes');
  await p.click(`[data-coach="mpk-cli"][data-id="${A1}"]`); await wait(100);
  await p.click(`[data-coach="mpk-cli"][data-id="${A2}"]`); await wait(200);
  t.has(await text(p, '#applyMount'), 'Aplicar a 2 clientes', 'cuenta los elegidos');
  await shot(p, '4-aplicar-a-clientes');
  const n0 = nutPosts.length;
  await p.click('[data-coach="mpk-confirm"]'); await wait(1000);
  const many = nutPosts.slice(n0);
  t.eq(many.map(x => x.body.client_id).sort(), [A1, A2].sort(), 'se aplica a los dos clientes');
  t.ok(many.every(x => JSON.stringify(x.body.plan.trainDays) === JSON.stringify(DEF.plan.trainDays) && x.search.includes('on_conflict=client_id')), 'con el plan guardado entero');
  t.ok(dialogs.some(d => d.includes('Plan aplicado a 2 clientes')), 'avisa que se aplicó');

  // Borrar.
  await p.click('[data-coach="mp-del"]'); await wait(600);
  t.ok(tplDeletes.some(s => s.includes(DEF.id)), 'se borra el plan guardado');
  t.eq(errs, [], 'errores de la página');
  await close();

  // ---- Sin la tabla (falta correr el SQL) ----
  const miss = await newPage({ user: COACH, handlers: base0({
    '/coach_meal_templates': (r, J) => J({ code: 'PGRST205', message: "Could not find the table 'public.coach_meal_templates' in the schema cache" }, 404),
  }) });
  await miss.p.goto(base + '/app/'); await wait(3500);
  await miss.p.click('[data-coach="view-meals"]'); await wait(600);
  t.has(await text(miss.p, '#coachHost'), 'falta correr el SQL de planes en Supabase', 'avisa que falta el SQL');
  await miss.p.click('[data-coach="view-clients"]'); await wait(300);
  await miss.p.click(`[data-coach="open"][data-id="${A1}"]`); await wait(1200);
  await miss.p.click('[data-coach="client-tab"][data-t="plan"]'); await wait(300);
  await miss.p.click('[data-coach="mp-apply"]'); await wait(600);
  t.has(await text(miss.p, '#applyMount'), 'falta correr el SQL de planes', 'el selector también avisa');
  t.eq(miss.errs, [], 'errores de la página sin la tabla');
  await miss.close();
}
