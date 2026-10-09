// Comida con un plan del coach sin calorías (solo hábitos, cardio, agua u opciones de menú: la fila
// de nutrition llega con kcal y macros en null). Antes Comida lo tomaba como la meta: el anillo
// decía «de 0 kcal» (y en ámbar con cualquier comida), las barras «X / 0 g» y «Editar meta» decía
// que la meta la fija el coach, sin forma de poner una propia. Ahora el alumno maneja su meta y la
// tarjeta «Plan de tu coach» sigue a mano. Con calorías, la meta sigue siendo la del coach.
import { newPage, wait, text, ALUMNO, profile } from './lib.mjs';

const OPCIONES = [{ title: 'Desayuno', opts: [{ label: 'Opción A', body: 'Tostadas con queso' }] }];
const SIN_KCAL = { kcal: null, protein: null, carbs: null, fat: null, plan: { habits: ['Caminar 30 min'], options: OPCIONES } };

async function open(base, np, extra){
  const pg = await newPage({ user: ALUMNO,
    state: Object.assign({ days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {} }, extra),
    handlers: {
      '/profiles': profile('client', { coach_id: 'c1' }),
      '/nutrition': (r, J, i) => i.m === 'GET' ? J(i.one ? np : [np]) : undefined,
    } });
  await pg.p.goto(base + '/app/'); await wait(2500);
  if (extra && extra.diary) await pg.p.evaluate(async d => { const { state } = await import('/app/core/state.js'); const { today } = await import('/app/core/utils.js'); state.diary = d; state.diaryDate = today(); (await import('/app/main.js')).renderApp(); }, extra.diary);
  await pg.p.click('#nav-comida'); await wait(500);
  return pg;
}
const bars = p => p.$$eval('.macros .macro-top span', l => l.map(e => e.textContent.trim()));

export default async function ({ base, t }){
  // 1) Alumno nuevo (sin meta): ve «Configurá tu meta», puede ponerla y el plan sigue a mano.
  {
    const { p, errs, close } = await open(base, SIN_KCAL);
    t.has(await text(p, '#view'), 'Configurá tu meta', 'sin meta: pide configurarla (no «de 0 kcal»)');
    t.ok(!!(await p.$('[data-action="plan-open"]')), 'la tarjeta del plan del coach sigue a mano');
    await p.click('[data-action="plan-open"]'); await wait(300);
    t.has(await text(p, '#view'), 'Mi plan', 'abre «Mi plan»');
    await p.click('[data-action="plan-close"]'); await wait(300);
    await p.click('[data-action="cal-open"]'); await wait(300);
    t.ok(!(await text(p, '#view')).includes('Tu meta la fija tu coach'), 'la meta no la fija el coach (su plan no trae calorías)');
    t.ok(!!(await p.$('#calManual')), 'puede poner su meta');
    await p.fill('#calManual', '2200'); await p.click('[data-action="cal-manual"]'); await wait(400);
    t.has(await text(p, '.ring-lbl'), 'de 2.200 kcal', 'el anillo usa la meta propia');
    t.ok(!!(await p.$('[data-action="plan-open"]')), 'y la tarjeta del plan sigue abajo');
    t.eq(errs, [], 'errores de la página (alumno nuevo)');
    await close();
  }

  // 2) Con meta y macros propios: el plan sin calorías no los tapa.
  {
    const diary = [{ id: 'e1', name: 'Algo', grams: 100, kcal: 350, p: 20, c: 30, f: 10, meal: 'almuerzo' }];
    const { p, errs, close } = await open(base, SIN_KCAL, { calTarget: 2000, calProfile: { macros: { p: 150, c: 200, f: 60 } }, diary });
    t.has(await text(p, '.ring-lbl'), 'de 2.000 kcal', 'el anillo usa su meta');
    t.ok(!(await p.$('#calRingNum.over')), 'con 350 de 2.000 no aparece como pasado');
    t.has(await text(p, '.kcal-left'), '1.650', 'y dice cuánto le queda');
    t.eq(await bars(p), ['20 / 150 g', '30 / 200 g', '10 / 60 g'], 'las barras usan sus macros (no «/ 0 g»)');
    await p.click('[data-action="cal-open"]'); await wait(300);
    t.ok(!!(await p.$('#calManual')) && !!(await p.$('[data-action="macro-save"]')), 'puede cambiar su meta y sus macros');
    t.eq(errs, [], 'errores de la página (con meta propia)');
    await close();
  }

  // 3) Plan con calorías: la meta sigue siendo la del coach.
  {
    const np = Object.assign({}, SIN_KCAL, { kcal: 1800, protein: 140, carbs: 180, fat: 55 });
    const { p, errs, close } = await open(base, np, { calTarget: 2500 });
    t.has(await text(p, '.ring-lbl'), 'de 1.800 kcal', 'con calorías, el anillo usa las del coach');
    t.eq(await bars(p), ['0 / 140 g', '0 / 180 g', '0 / 55 g'], 'y los macros del coach');
    await p.click('[data-action="cal-open"]'); await wait(300);
    t.has(await text(p, '#view'), 'Tu meta la fija tu coach', '«Editar meta» explica que la fija el coach');
    t.eq(errs, [], 'errores de la página (plan con calorías)');
    await close();
  }
}
