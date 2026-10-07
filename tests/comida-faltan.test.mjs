// Comida: al lado del anillo de calorías, cuántas faltan para la meta del día (pedido). Con la
// meta cumplida dice «Llegaste»; si se pasó, «Te pasaste» con cuántas (en ámbar). Sin meta no se
// muestra. Mismo texto con coma de miles (es-AR) y en una sola fila con el anillo en un celular común.
import { newPage, wait, text, ALUMNO, profile } from './lib.mjs';

const ST = (diary, extra = {}) => ({ days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {}, calTarget: 2000, diary, ...extra });
const E = kcal => ({ id: 'e' + kcal, name: 'Algo', grams: 100, kcal, p: 0, c: 0, f: 0, meal: 'almuerzo' });

export default async function ({ base, t }){
  for (const [diary, tit, num, cls] of [
    [[E(1500)], 'Te faltan', '500', ''],
    [[E(1200), E(1100)], 'Te pasaste', '300', 'up'],
    [[E(2000)], 'Llegaste', '0', 'eq'],
  ]){
    const { p, errs, close } = await newPage({ user: ALUMNO, state: ST(diary, { diaryDate: undefined }), handlers: { '/profiles': profile('client') },
      init: "localStorage.setItem('gize_lite','0');" });
    await p.goto(base + '/app/'); await wait(2500);
    await p.evaluate(async d => { const { state } = await import('/app/core/state.js'); const { today } = await import('/app/core/utils.js'); state.diary = d; state.diaryDate = today(); (await import('/app/main.js')).renderApp(); }, diary);
    await p.click('#nav-comida'); await wait(500);
    t.has((await text(p, '.cal-top .kcal-left .wk-t')).toLowerCase(), tit.toLowerCase(), tit + ': el título al lado del anillo');
    t.has(await text(p, '.cal-top .kcal-left .wk-n'), num, tit + ': el número');
    t.ok(await p.$eval('.cal-top .kcal-left', (e, c) => !c || e.classList.contains(c), cls), tit + ': el color de estado');
    const r = await p.evaluate(() => { const a = document.querySelector('.cal-top .ring-wrap').getBoundingClientRect(), b = document.querySelector('.cal-top .kcal-left').getBoundingClientRect(); return { right: b.left >= a.right - 1, sameRow: Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) < 40 }; });
    t.ok(r.right && r.sameRow, tit + ': a la derecha del anillo, en la misma fila: ' + JSON.stringify(r));
    t.eq(errs, [], 'errores de la página');
    await close();
  }
  // Sin meta: no aparece.
  const { p, close } = await newPage({ user: ALUMNO, state: ST([E(500)], { calTarget: 0 }), handlers: { '/profiles': profile('client') } });
  await p.goto(base + '/app/'); await wait(2500);
  await p.click('#nav-comida'); await wait(500);
  t.eq(await p.$$eval('.kcal-left', x => x.length), 0, 'sin meta no aparece');
  await close();
}
