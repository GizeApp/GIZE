// Comida: al lado del anillo de calorías, cuánto queda para la meta del día (pedido), como texto
// suelto: «TE QUEDAN», el número grande y «kcal». Con la meta cumplida dice «Llegaste»; si se pasó,
// «Te pasaste» con cuántas (en ámbar). Sin meta no se muestra. Con punto de miles (es-AR) y en la
// misma fila que el anillo, también en un celular angosto.
import { newPage, wait, text, ALUMNO, profile } from './lib.mjs';

const ST = (diary, extra = {}) => ({ days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {}, calTarget: 2000, diary, ...extra });
const E = kcal => ({ id: 'e' + kcal, name: 'Algo', grams: 100, kcal, p: 0, c: 0, f: 0, meal: 'almuerzo' });

export default async function ({ base, t }){
  for (const [diary, tit, num, cls] of [
    [[E(1500)], 'Te quedan', '500', ''],
    [[E(1200), E(1100)], 'Te pasaste', '300', 'up'],
    [[E(2000)], 'Llegaste', '0', 'eq'],
  ]){
    const { p, errs, close } = await newPage({ user: ALUMNO, state: ST(diary, { diaryDate: undefined }), handlers: { '/profiles': profile('client') },
      init: "localStorage.setItem('gize_lite','0');" });
    await p.goto(base + '/app/'); await wait(2500);
    await p.evaluate(async d => { const { state } = await import('/app/core/state.js'); const { today } = await import('/app/core/utils.js'); state.diary = d; state.diaryDate = today(); (await import('/app/main.js')).renderApp(); }, diary);
    await p.click('#nav-comida'); await wait(500);
    t.has((await text(p, '.cal-top .kcal-left .kl-t')).toLowerCase(), tit.toLowerCase(), tit + ': el título al lado del anillo');
    t.has(await text(p, '.cal-top .kcal-left .kl-n'), num, tit + ': el número');
    t.ok(await p.$eval('.cal-top .kcal-left', (e, c) => !c || e.classList.contains(c), cls), tit + ': el color de estado');
    const r = await p.evaluate(() => { const a = document.querySelector('.cal-top .ring-wrap').getBoundingClientRect(), b = document.querySelector('.cal-top .kcal-left').getBoundingClientRect(); return { right: b.left >= a.right - 1, sameRow: Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) < 40 }; });
    t.ok(r.right && r.sameRow, tit + ': a la derecha del anillo, en la misma fila: ' + JSON.stringify(r));
    t.eq(errs, [], 'errores de la página');
    await close();
  }
  // Celular angosto (360 px): sigue al costado del anillo, sin desbordar.
  {
    const { p, close } = await newPage({ user: ALUMNO, state: ST([E(1840)], { calTarget: 2300 }), handlers: { '/profiles': profile('client') }, viewport: { width: 360, height: 760 } });
    await p.goto(base + '/app/'); await wait(2500);
    await p.evaluate(async () => { const { state } = await import('/app/core/state.js'); const { today } = await import('/app/core/utils.js'); state.diary = [{ id: 'z', name: 'Algo', grams: 100, kcal: 1840, p: 0, c: 0, f: 0, meal: 'almuerzo' }]; state.diaryDate = today(); (await import('/app/main.js')).renderApp(); });
    await p.click('#nav-comida'); await wait(500);
    const r = await p.evaluate(() => { const a = document.querySelector('.cal-top .ring-wrap').getBoundingClientRect(), b = document.querySelector('.cal-top .kcal-left').getBoundingClientRect(); return { right: b.left >= a.right - 1, inside: b.right <= innerWidth, ring: document.getElementById('calRingNum').textContent, n: document.querySelector('.kl-n').textContent }; });
    t.ok(r.right && r.inside, '360 px: al costado del anillo y sin salirse: ' + JSON.stringify(r));
    t.eq([r.ring, r.n], ['1.840', '460'], 'punto de miles en el anillo y lo que queda');
    await close();
  }
  // Sin meta: no aparece.
  const { p, close } = await newPage({ user: ALUMNO, state: ST([E(500)], { calTarget: 0 }), handlers: { '/profiles': profile('client') } });
  await p.goto(base + '/app/'); await wait(2500);
  await p.click('#nav-comida'); await wait(500);
  t.eq(await p.$$eval('.kcal-left', x => x.length), 0, 'sin meta no aparece');
  await close();
}
