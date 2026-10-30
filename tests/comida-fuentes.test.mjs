// Comida: «Fuentes de los cálculos» (ui/fuentes.js). Apple rechazó la 1.1.0 por la guía 1.4.1: la
// meta de calorías, los macros y lo que estima la IA tienen que citar sus fuentes, con links, en un
// lugar fácil de encontrar. Revisa que el link esté en Comida (con meta y sin meta), en «Tu meta
// diaria» y en la hoja de la foto del plato; que la hoja tenga el aviso de salud y las fuentes con
// sus links (que abren afuera), y que al cerrarla se vuelva a donde se estaba.
import { newPage, wait, ALUMNO, profile } from './lib.mjs';
import { pagina, abrirComida, abrirBuscador, fotoJpeg } from './comida-ia-comun.mjs';

const txt = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return e ? e.innerText.replace(/\s+/g, ' ').trim() : ''; }, sel);
const visible = (p, sel) => p.isVisible(sel).catch(() => false);

async function revisarHoja(p, t, donde){
  await p.click(donde.sel); await wait(500);
  t.ok(await visible(p, '#sheetHost .fuentes-sheet'), donde.n + ': «Fuentes de los cálculos» abre la hoja');
  const h = await txt(p, '#sheetHost .fuentes-sheet');
  t.has(h, 'Fuentes y aviso de salud', donde.n + ': el título');
  t.has(h, 'no reemplazan la consulta con un médico o un nutricionista', donde.n + ': el aviso de salud');
  for (const s of ['Meta de calorías', 'Mifflin-St Jeor', 'Macros', '2 g por kilo', 'Agua', 'Valores de los alimentos', 'Foto del plato con IA']) t.has(h, s, donde.n + ': cita «' + s + '»');
  const links = await p.$$eval('#sheetHost .fuentes-sheet a', as => as.map(a => [a.getAttribute('href'), a.getAttribute('target'), a.textContent.trim()]));
  t.ok(links.length >= 8, donde.n + ': las fuentes llevan su link (' + links.length + ')');
  t.ok(links.every(([h, tg, x]) => /^https:\/\//.test(h) && tg === '_blank' && x.length > 10), donde.n + ': cada link es https, abre afuera y dice qué es');
  t.ok(links.some(([h]) => h === 'https://doi.org/10.1093/ajcn/51.2.241'), donde.n + ': el artículo de Mifflin-St Jeor');
  await p.click('#sheetHost .fuentes-sheet [data-action="fuentes-close"]'); await wait(400);
  t.ok(!(await p.$('#sheetHost .fuentes-sheet')), donde.n + ': «Cerrar» la cierra');
}

export default async function ({ base, t }){
  // ---------- con meta: debajo de «Editar meta», en «Tu meta diaria» y en la hoja del plato ----------
  const { p, errs, close } = await pagina();
  await abrirComida(p, base);
  t.ok(await visible(p, '[data-action="fuentes-open"]'), 'Comida: el link a las fuentes se ve');
  await revisarHoja(p, t, { n: 'Comida', sel: '[data-action="fuentes-open"]' });

  await p.click('[data-action="cal-open"]'); await wait(400);
  await revisarHoja(p, t, { n: 'Tu meta diaria', sel: '.fuentes-link.en-form' });
  t.has(await txt(p, '.form-title'), 'Tu meta diaria', 'al cerrar se vuelve a «Tu meta diaria»');
  await p.click('[data-action="cal-cancel"]'); await wait(400);

  // La hoja del plato: la estimación de la IA también lleva sus fuentes, y al cerrarlas se vuelve al plato.
  await abrirBuscador(p);
  await p.click('#sheetHost [data-action="ia-plato"]'); await wait(600);
  await p.click('#iaPermHost [data-ia="si"]'); await wait(800);
  await p.setInputFiles('#sheetHost input[data-action="plate-file"]:not([capture])', await fotoJpeg(p)); await wait(3500);
  t.ok(await visible(p, '#sheetHost .pl8-row'), 'la hoja del plato con los alimentos');
  await revisarHoja(p, t, { n: 'Foto del plato', sel: '#sheetHost .fuentes-link.en-plato' });
  t.ok(await visible(p, '#sheetHost .pl8-row'), 'al cerrar las fuentes se vuelve a la hoja del plato, con lo que estimó la IA');
  t.eq(errs, [], 'errores de la página');
  await close();

  // ---------- sin meta: la pantalla de «Configurá tu meta» también lo muestra ----------
  const sm = await newPage({ user: ALUMNO, state: { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {}, diary: [] },
    handlers: { '/profiles': profile('client') } });
  await sm.p.goto(base + '/app/'); await wait(2500);
  await sm.p.click('#nav-comida'); await wait(500);
  t.ok(await visible(sm.p, '.cal-empty'), 'sin meta: la pantalla de «Configurá tu meta»');
  await revisarHoja(sm.p, t, { n: 'Sin meta', sel: '.cal-empty [data-action="fuentes-open"]' });
  t.eq(sm.errs, [], 'sin meta: errores de la página');
  await sm.close();
}
