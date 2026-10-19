// Carteles propios (confirmar / pedir, app/ui/avisos.js) y selector propio de los <select>
// (app/ui/selector.js), desde #335 en lugar de los diálogos y listas nativos. Lo que hacía solo el
// diálogo nativo lo tienen que hacer ellos:
// - Teclado: Enter acepta (en una pregunta de borrar el foco arranca en «Cancelar» y Enter cancela),
//   Escape cancela, y Tab da la vuelta adentro del cartel: no se llega a los botones de atrás con la
//   pregunta todavía abierta (el confirm() nativo no dejaba).
// - «Atrás» de Android con una pregunta abierta es «Cancelar»: no hace lo que preguntaba.
// - Al cerrar, el foco vuelve a donde estaba.
// - Selector: Enter lo abre, las flechas recorren las opciones, Enter elige (cambia el valor y avisa
//   con change), Escape y «Atrás» cierran sin cambiar nada, Tab no sale de la hoja y el foco vuelve
//   al <select>.
// - En el código de la app y del panel no queda ningún confirm() / prompt() nativo, y cada
//   confirmar() / pedir() se espera (await o .then): sin eso, la acción seguía sin la respuesta.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newPage, saved, wait, ALUMNO, profile } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const archivos = dir => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? archivos(path.join(dir, e.name)) : /\.(js|html)$/.test(e.name) ? [path.join(dir, e.name)] : []);

const dondeFoco = p => p.evaluate(() => { const a = document.activeElement; return a ? (a.closest('.av-bg, .sl-bg') ? 'cartel ' : 'atrás ') + (a.id || a.className || a.tagName) : ''; });
const atras = p => p.evaluate(async () => (await import('/app/ui/atras.js')).handleBack());

export default async function ({ base, t }){
  // Código: sin diálogos nativos y sin preguntas que no se esperan.
  const nativos = [], sinEsperar = [];
  for (const f of [...archivos('app'), ...archivos('admin')]) {
    if (f === path.join('app', 'ui', 'avisos.js')) continue;
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
    for (const m of src.matchAll(/(^|[^\w.$])(?:window\.)?(confirm|prompt)\s*\(/g)) nativos.push(f + ': ' + m[2] + '(');
    for (const m of src.matchAll(/(await\s+)?\b(confirmar|pedir)\s*\(/g)) {
      if (m[1]) continue;
      // Sin await: tiene que seguir con .then( al cerrar el paréntesis de la llamada.
      let i = m.index + m[0].length, n = 1;
      while (i < src.length && n) { const c = src[i++]; if (c === '(') n++; else if (c === ')') n--; }
      if (!/^\s*\.then\(/.test(src.slice(i))) sinEsperar.push(f + ': ' + src.slice(m.index, m.index + 60).replace(/\s+/g, ' '));
    }
  }
  t.eq(nativos, [], 'sin confirm() ni prompt() nativos en la app ni en el panel');
  t.eq(sinEsperar, [], 'cada confirmar() / pedir() se espera (await o .then)');

  const days = [{ id: 'd1', name: 'Torso', exercises: [{ id: 'e1', name: 'Press de banca plano (barra)', sets: [{ id: 's1', kg: '80', reps: '8', done: true }] }] }];
  const { p, errs, preguntas, close } = await newPage({ user: ALUMNO, state: { days, sessions: [], weights: [], daily: {} }, handlers: { '/profiles': profile('client') } });
  p.contestar = null; // las preguntas se contestan a mano, con el teclado o con «Atrás»
  await p.goto(base + '/app/'); await wait(2500);
  const tildes = async () => (await saved(p)).days[0].exercises[0].sets.map(s => !!s.done);

  // «Limpiar» con una serie tildada pregunta. «Atrás» de Android la cancela: la tilde queda.
  await p.click('.day-head [data-action="clear"]'); await wait(500);
  t.ok(await p.$('.av-bg .av-go'), 'Limpiar: pregunta antes');
  t.eq(await atras(p), true, 'Atrás: cierra la pregunta');
  await wait(500);
  t.ok(!(await p.$('.av-bg')), 'Atrás: ya no está el cartel');
  t.eq(await tildes(), [true], 'Atrás en la pregunta es «Cancelar»: no limpia el día');
  // Escape también cancela.
  await p.click('.day-head [data-action="clear"]'); await wait(500);
  await p.keyboard.press('Escape'); await wait(500);
  t.ok(!(await p.$('.av-bg')), 'Escape: cierra la pregunta');
  t.eq(await tildes(), [true], 'Escape es «Cancelar»: no limpia el día');
  // Tab no sale del cartel; Enter con el foco en el botón de la acción acepta.
  await p.click('.day-head [data-action="clear"]'); await wait(500);
  const focos = [];
  for (let i = 0; i < 3; i++) { await p.keyboard.press('Tab'); focos.push(await dondeFoco(p)); }
  await p.keyboard.press('Shift+Tab'); focos.push(await dondeFoco(p));
  t.ok(focos.every(f => f.startsWith('cartel ')), 'Tab y Shift+Tab no salen de la pregunta: ' + JSON.stringify(focos));
  if (!/av-go/.test(await dondeFoco(p))) await p.keyboard.press('Tab');
  t.has(await dondeFoco(p), 'av-go', 'Tab llega al botón de la acción');
  await p.keyboard.press('Enter'); await wait(600);
  t.eq(await tildes(), [false], 'Enter en «Limpiar»: limpia el día');
  t.eq(preguntas.length, 3, 'una pregunta por cada toque de «Limpiar»: ' + preguntas.length);

  // confirmar(): el foco arranca en la acción (o en «Cancelar» si es de borrar) y vuelve al cerrar.
  const preguntar = (fn, ...args) => p.evaluate(([fn, args]) => {
    window.__r = 'abierta';
    let b = document.getElementById('origen');
    if (!b) { b = document.createElement('button'); b.id = 'origen'; b.textContent = 'origen'; document.body.appendChild(b); }
    b.focus(); window[fn](...args).then(v => { window.__r = v; });
  }, [fn, args]);
  const respuesta = () => p.evaluate(() => window.__r);
  await preguntar('confirmar', '¿Guardar los cambios?'); await wait(400);
  t.has(await dondeFoco(p), 'av-go', 'confirmar: el foco arranca en el botón de la acción');
  await p.keyboard.press('Enter'); await wait(500);
  t.eq(await respuesta(), true, 'confirmar: Enter acepta');
  t.eq(await dondeFoco(p), 'atrás origen', 'confirmar: al cerrar, el foco vuelve a donde estaba');
  await preguntar('confirmar', '¿Borrar este entreno del historial?'); await wait(400);
  t.has(await dondeFoco(p), 'av-sec', 'confirmar de borrar: el foco arranca en «Cancelar»');
  await p.keyboard.press('Enter'); await wait(500);
  t.eq(await respuesta(), false, 'confirmar de borrar: Enter cancela');
  await preguntar('confirmar', '¿Guardar los cambios?'); await wait(400);
  await atras(p); await wait(500);
  t.eq(await respuesta(), false, 'confirmar: Atrás devuelve false');

  // pedir(): Enter acepta lo escrito; Escape y Atrás devuelven null; Tab no sale.
  await preguntar('pedir', '¿Cómo se llama?', 'Plan'); await wait(400);
  t.has(await dondeFoco(p), 'av-in', 'pedir: el foco arranca en el campo');
  t.eq(await p.evaluate(() => { const i = document.activeElement; return [i.value, i.selectionStart, i.selectionEnd]; }), ['Plan', 0, 4], 'pedir: lo que propone viene seleccionado (como el prompt nativo)');
  await p.keyboard.press('End'); await p.keyboard.type(' base'); await p.keyboard.press('Enter'); await wait(500);
  t.eq(await respuesta(), 'Plan base', 'pedir: Enter acepta lo escrito');
  await preguntar('pedir', '¿Cómo se llama?', 'Plan'); await wait(400);
  const focosPedir = [];
  for (let i = 0; i < 4; i++) { await p.keyboard.press('Tab'); focosPedir.push(await dondeFoco(p)); }
  t.ok(focosPedir.every(f => f.startsWith('cartel ')) && focosPedir.some(f => /av-in/.test(f)), 'pedir: Tab da la vuelta adentro del cartel: ' + JSON.stringify(focosPedir));
  await p.keyboard.press('Escape'); await wait(500);
  t.eq(await respuesta(), null, 'pedir: Escape devuelve null');
  await preguntar('pedir', '¿Cómo se llama?', 'Plan'); await wait(400);
  await atras(p); await wait(500);
  t.eq(await respuesta(), null, 'pedir: Atrás devuelve null');

  // Selector propio.
  await p.evaluate(() => {
    const s = document.createElement('select'); s.id = 'sel'; s.setAttribute('aria-label', 'Unidad');
    s.innerHTML = '<option value="kg">Kilos</option><option value="lb">Libras</option><option value="st">Stones</option>';
    window.__cambios = 0; s.addEventListener('change', () => window.__cambios++);
    document.body.prepend(s); s.focus();
  });
  const sel = () => p.evaluate(() => [document.getElementById('sel').value, window.__cambios, !!document.querySelector('.sl-bg')]);
  await p.keyboard.press('Enter'); await wait(400);
  t.ok(await p.$('.sl-bg [role="listbox"]'), 'selector: Enter lo abre');
  t.eq(await p.evaluate(() => { const a = document.activeElement; return [a.getAttribute('role'), a.getAttribute('aria-selected'), a.textContent]; }), ['option', 'true', 'Kilos'], 'selector: el foco arranca en la opción elegida');
  t.eq(await p.$eval('.sl-bg .sl-card', c => c.getAttribute('aria-label')), 'Unidad', 'selector: la hoja lleva el nombre del <select>');
  const focosSel = [];
  for (let i = 0; i < 5; i++) { await p.keyboard.press('Tab'); focosSel.push(await dondeFoco(p)); }
  t.ok(focosSel.every(f => f.startsWith('cartel ')), 'selector: Tab no sale de la hoja: ' + JSON.stringify(focosSel));
  await p.keyboard.press('Escape'); await wait(500);
  t.eq(await sel(), ['kg', 0, false], 'selector: Escape cierra sin cambiar nada');
  t.eq(await dondeFoco(p), 'atrás sel', 'selector: al cerrar, el foco vuelve al <select>');
  await p.keyboard.press('Enter'); await wait(400);
  await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter'); await wait(500);
  t.eq(await sel(), ['lb', 1, false], 'selector: flecha abajo y Enter eligen la siguiente y avisan con change');
  t.eq(await dondeFoco(p), 'atrás sel', 'selector: después de elegir, el foco vuelve al <select>');
  await p.click('#sel'); await wait(400);
  t.ok(await p.$('.sl-bg'), 'selector: tocarlo lo abre');
  t.eq(await atras(p), true, 'selector: Atrás lo cierra'); await wait(500);
  t.eq(await sel(), ['lb', 1, false], 'selector: Atrás no cambia nada');

  t.eq(errs, [], 'errores de la página');
  await close();
}
