// Página de inicio (gize.ar): el brillo que sigue al mouse en las tarjetas (.spot::before).
// Una llave suelta en el <style> rompía esa regla y el brillo no aparecía nunca.
import { newPage, wait } from './lib.mjs';

export default async function ({ base, t }){
  const { p, errs, close } = await newPage({ viewport: { width: 1280, height: 800 } });
  await p.goto(base + '/'); await wait(800);
  const card = p.locator('#app .card.spot').first();
  await card.scrollIntoViewIfNeeded(); await wait(600);
  const box = await card.boundingBox();
  t.ok(!!box, 'está la tarjeta #app .card.spot');
  if (box){
    await p.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.4);
    await wait(50);
    await p.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.45);
    await wait(700);
    const st = await card.evaluate(e => { const s = getComputedStyle(e, '::before'); return { bg: s.backgroundImage, op: s.opacity, content: s.content }; });
    t.ok(/radial-gradient/.test(st.bg), 'con el mouse encima, el brillo es un degradé radial: ' + st.bg);
    t.eq(st.op, '1', 'con el mouse encima, el brillo se ve (opacity 1)');
  }
  t.eq(errs, [], 'errores de la página');
  await close();
}
