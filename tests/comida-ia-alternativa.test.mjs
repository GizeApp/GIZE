// IA en Comida: «¿O era …?». Cuando la IA duda entre dos alimentos que en la foto se ven parecidos
// (cappuccino o café con leche), la función manda la otra opción de la base (alternativa) y la hoja
// del plato la ofrece debajo del nombre: un toque la cambia con los mismos gramos y los valores de
// la otra, y otro toque vuelve. Sin alternativa no aparece nada. Se anota lo que quedó elegido.
import { wait, saved } from './lib.mjs';
import { ESTADO_ON, base, pagina, abrirComida, abrirBuscador, fotoJpeg } from './comida-ia-comun.mjs';

const OK = Object.assign({}, ESTADO_ON, { permiso_comida: 'ok' });
const PLATO = { ok: true, hay_comida: true, nota: '', modelo_nombre: 'IA', items: [
  { nombre: 'Capuchino', gramos: 200, kcal: 54, p: 3.4, c: 5.4, f: 2, cantidad: 1, unidad: 'taza', dudoso: true,
    base: base(939, 'Capuchino', 27, 1.7, 2.7, 1, 'ml'), alternativa: base(925, 'Café con leche', 55, 3, 5, 2.5, 'ml') },
  { nombre: 'Tostada', gramos: 40, kcal: 110, p: 3, c: 20, f: 1, cantidad: 2, unidad: 'unidad', dudoso: false, base: null, alternativa: null },
] };
const filas = p => p.$$eval('#sheetHost .pl8-row', rs => rs.map(r => ({ n: r.querySelector('.pl8-name').textContent, g: r.querySelector('input').value,
  alt: (r.querySelector('.pl8-alt') || {}).textContent || '', v: r.querySelector('.pl8-vals').textContent.replace(/\s+/g, ' ').trim() })));

export default async function ({ base: url, t }){
  const { p, errs, close } = await pagina({ estado: OK, funcion: () => [200, PLATO] });
  await abrirComida(p, url); await abrirBuscador(p);
  await p.click('#sheetHost [data-action="ia-plato"]'); await wait(700);
  await p.setInputFiles('#sheetHost input[data-action="plate-file"]:not([capture])', await fotoJpeg(p)); await wait(2000);
  let fs = await filas(p);
  t.eq(fs.map(f => [f.n, f.alt]), [['Capuchino', '¿O era café con leche?'], ['Tostada', '']], 'la dudosa ofrece «¿O era café con leche?»; la otra, nada');
  t.eq(fs[0].v, '54 kcal · P 3,4 · C 5,4 · G 2', 'el capuchino con sus valores (200 ml)');
  const r = await p.$eval('#sheetHost .pl8-alt', b => { const x = b.getBoundingClientRect(); return [x.height, getComputedStyle(b).cursor]; });
  t.ok(r[0] >= 44 - 0.5, '«¿O era …?» se toca cómodo (44 px de alto): ' + r[0]);

  await p.click('#sheetHost .pl8-alt'); await wait(500);
  fs = await filas(p);
  t.eq([fs[0].n, fs[0].g, fs[0].alt], ['Café con leche', '200', '¿O era capuchino?'], 'un toque: café con leche, los mismos 200 ml, y se puede volver');
  t.eq(fs[0].v, '110 kcal · P 6 · C 10 · G 5', 'con los valores del café con leche');
  t.eq(fs[1].n, 'Tostada', 'las otras filas no cambian');

  await p.click('#sheetHost .pl8-alt'); await wait(500);
  fs = await filas(p);
  t.eq([fs[0].n, fs[0].g, fs[0].alt], ['Capuchino', '200', '¿O era café con leche?'], 'otro toque: vuelve al capuchino');

  // Se anota lo que quedó elegido (café con leche) y queda como editado.
  await p.click('#sheetHost .pl8-alt'); await wait(500);
  await p.click('#pl8Go'); await wait(1500);
  const anotado = (((await saved(p)) || {}).diary || []).map(e => [e.name, e.grams, e.fuente]);
  t.ok(anotado.some(a => a[0] === 'Café con leche' && a[1] === 200 && a[2] === 'ia-editado'), 'se anota el café con leche, 200 ml, como «IA · editado»: ' + JSON.stringify(anotado));
  t.eq(errs, [], 'sin errores');
  await close();
}
