// «Mi plan» del alumno: la fila «Objetivo» de las comidas suma como el panel del coach. Los
// valores con coma decimal («32,5», como se escribe en Argentina) cuentan, y los gramos salen con
// un decimal y coma (antes 10.1 + 20.2 se veía «30.299999999999997»).
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

export default async function ({ base, t }){
  const plan = {
    trainDays: [
      { meal: 'Desayuno', kcal: '450,5', cho: '10.1', fat: '5', prot: '32,5' },
      { meal: 'Almuerzo', kcal: '549,5', cho: '20.2', fat: '7,5', prot: '40' },
      { meal: 'Cena', kcal: '', cho: '', fat: '', prot: '27,5' }],
    restDays: [
      { meal: 'Desayuno', kcal: '300', cho: '0,25', fat: '2,5', prot: '20' },
      { meal: 'Cena', kcal: '400,4', cho: '0,25', fat: '2,5', prot: '30,5' }],
  };
  const { p, errs, close } = await newPage({ user: ALUMNO, state: { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {} },
    handlers: {
      '/profiles': profile('client', { coach_id: 'c1' }),
      '/nutrition': (r, J, i) => { if (i.m !== 'GET') return undefined; const np = { kcal: 1000, protein: 100, carbs: 30, fat: 13, plan }; return J(i.one ? np : [np]); },
    } });
  await p.goto(base + '/app/'); await wait(3000);
  await p.click('#nav-comida'); await wait(400);
  await p.click('[data-action="plan-open"]'); await wait(400);
  const goal = () => p.$$eval('.mc-goal td', l => l.map(e => e.textContent.trim()));
  t.eq(await goal(), ['Objetivo', '1000', '30,3', '12,5', '100'], 'día de entreno: el objetivo cuenta los valores con coma y redondea');
  await p.click('[data-action="plan-day"][data-v="descanso"]'); await wait(300);
  t.eq(await goal(), ['Objetivo', '700', '0,5', '5', '50,5'], 'día de descanso: lo mismo');
  t.eq(errs, [], 'errores de la página');
  await close();
}
