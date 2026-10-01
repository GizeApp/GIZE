// Página de inicio (gize.ar) → Precios: los tres planes para coaches, los tres de gimnasio y
// «Más de 500: a medida» con «Hablemos» por WhatsApp. Que entren bien en el celular (390 px,
// sin correrse de costado) y en la compu (los coaches en una fila y los gimnasios en otra).
import { newPage, wait } from './lib.mjs';

const PLANES = [
  ['p10', '$14.900'], ['p25', '$24.900'], ['p50', '$37.900'],
  ['p100', '$59.900', 'Gimnasio chico'], ['p250', '$119.900', 'Gimnasio'], ['p500', '$199.900', 'Gimnasio grande'],
];

export default async function ({ base, t }){
  for (const width of [390, 1280]){
    const { p, errs, close } = await newPage({ viewport: { width, height: 900 } });
    await p.goto(base + '/'); await wait(800);
    await p.locator('#precios').scrollIntoViewIfNeeded(); await wait(400);
    const cards = await p.$$eval('#precios .price', cs => cs.map(c => {
      const r = c.getBoundingClientRect(), a = c.querySelector('a.btn');
      return { txt: c.innerText.replace(/\s+/g, ' '), href: a ? a.getAttribute('href') : '', btn: a ? a.textContent.trim() : '', top: Math.round(r.top), left: r.left, right: r.right };
    }));
    t.eq(cards.length, 7, width + ': seis planes y el plan a medida');
    PLANES.forEach(([id, amt, name], i) => {
      const c = cards[i] || { txt: '', href: '' };
      t.has(c.txt, amt + '/mes', width + ': precio de ' + id);
      if (name) t.has(c.txt, name.toUpperCase(), width + ': nombre de ' + id);
      t.eq(c.href, 'app/?plan=' + id + '#registro-coach', width + ': el botón de ' + id + ' lleva al registro con el plan');
    });
    const medida = cards[6] || { txt: '', href: '' };
    t.has(medida.txt, 'a medida', width + ': plan a medida');
    t.eq(medida.btn, 'Hablemos', width + ': el plan a medida dice «Hablemos»');
    t.ok(medida.href.startsWith('https://wa.me/5493413490705?text='), width + ': «Hablemos» abre el WhatsApp de GIZE: ' + medida.href);
    t.has(decodeURIComponent(medida.href), 'más de 500 alumnos', width + ': el mensaje de WhatsApp habla de más de 500 alumnos');
    t.ok(!/Más de 100 alumnos/.test(await p.$eval('#precios', e => e.innerText)), width + ': ya no dice «más de 100 alumnos»');
    t.eq(await p.$$eval('#precios .price-group', g => g.map(x => x.textContent)), ['Para coaches', 'Para gimnasios'], width + ': grupos de planes');
    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    t.ok(sw <= width, width + ': la página no se corre de costado (ancho ' + sw + ')');
    t.ok(cards.every(c => c.left >= 0 && c.right <= width), width + ': las tarjetas entran en la pantalla');
    if (width === 1280){
      t.ok(cards[0].top === cards[1].top && cards[1].top === cards[2].top, '1280: los tres planes para coaches en una fila');
      t.ok(cards[3].top === cards[4].top && cards[4].top === cards[5].top && cards[3].top > cards[0].top, '1280: los tres gimnasios en otra fila');
      t.ok(cards[6].top > cards[3].top, '1280: el plan a medida abajo de los gimnasios');
    } else {
      t.ok(cards.every((c, i) => !i || c.top > cards[i - 1].top), '390: una tarjeta debajo de la otra');
    }
    t.eq(errs, [], width + ': errores de la página');
    await close();
  }
}
