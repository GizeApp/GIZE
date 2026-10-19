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
// - Una pregunta que llega con la hoja del selector abierta se ve encima y se contesta primero
//   (Escape, Enter y «Atrás» son de ella; la hoja sigue).
// - Si la pantalla se redibuja con la hoja abierta, lo elegido va al <select> nuevo (en la ficha del
//   alumno del coach pasa al abrirla); si el <select> ya no está, la hoja se cierra sola.
// - Con el teclado del celular abierto (--kb) los botones de pedir() quedan arriba del teclado.
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

  // Llega una pregunta con la hoja abierta (como el aviso de un producto rechazado, que sale solo al
  // rato de entrar): se ve encima de la hoja y el teclado y «Atrás» contestan solo la pregunta.
  const hoja = () => p.evaluate(() => !!document.querySelector('.sl-bg:not(.closing)'));
  const llega = msg => p.evaluate(m => { window.__r = 'abierta'; window.confirmar(m).then(v => { window.__r = v; }); }, msg);
  const encima = () => p.evaluate(() => {
    const b = document.querySelector('.av-bg .av-go'), r = b.getBoundingClientRect();
    const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return [h && h.closest('.av-bg') ? 'cartel' : h && h.closest('.sl-bg') ? 'hoja' : 'otro', !!document.activeElement.closest('.av-bg')];
  });
  await p.focus('#sel'); await p.keyboard.press('Enter'); await wait(400);
  await llega('¿Lo mandás de nuevo con otra foto?'); await wait(500);
  t.eq(await encima(), ['cartel', true], 'pregunta con la hoja abierta: se ve encima y el foco está en ella');
  await p.keyboard.press('Escape'); await wait(500);
  t.eq([await respuesta(), await hoja()], [false, true], 'Escape cancela solo la pregunta: la hoja sigue abierta');
  t.has(await dondeFoco(p), 'sl-op', 'al cerrar la pregunta, el foco vuelve a la hoja');
  await llega('¿Lo mandás de nuevo con otra foto?'); await wait(500);
  await p.keyboard.press('Enter'); await wait(500);
  t.eq([await respuesta(), await hoja(), (await sel())[0]], [true, true, 'lb'], 'Enter contesta la pregunta y no elige nada en la hoja');
  await llega('¿Lo mandás de nuevo con otra foto?'); await wait(500);
  t.eq(await atras(p), true, 'Atrás con la pregunta sobre la hoja'); await wait(500);
  t.eq([await respuesta(), await hoja()], [false, true], 'Atrás cancela la pregunta (la de arriba) y deja la hoja');
  t.eq(await atras(p), true, 'Atrás otra vez'); await wait(500);
  t.eq(await sel(), ['lb', 1, false], 'el segundo Atrás cierra la hoja sin cambiar nada');

  // La pantalla se redibuja con la hoja abierta (llega algo de la red y se vuelve a dibujar el
  // <select>): lo que se elige va al <select> nuevo y avisa con change; si ya no está, la hoja se va.
  await p.evaluate(() => {
    window.__cambiosNuevo = [];
    document.addEventListener('change', e => { if (e.target.dataset && e.target.dataset.campo === 'meta') window.__cambiosNuevo.push([e.target.isConnected, e.target.value]); });
    const c = document.createElement('div'); c.id = 'caja';
    c.innerHTML = '<select data-campo="meta" aria-label="Meta"><option value="">—</option><option value="bajar">Bajar</option><option value="subir">Subir</option></select>';
    document.body.prepend(c);
  });
  const redibujar = html => p.evaluate(h => { const c = document.getElementById('caja'); c.innerHTML = h == null ? c.innerHTML : h; }, html);
  const meta = () => p.evaluate(() => { const s = document.querySelector('[data-campo="meta"]'); return [s && s.value, window.__cambiosNuevo, !!document.querySelector('.sl-bg')]; });
  await p.click('[data-campo="meta"]'); await wait(400);
  await redibujar(); await wait(150);
  t.ok(await hoja(), 'redibujo: con el mismo <select> en la pantalla la hoja sigue');
  await p.click('.sl-bg .sl-op:has-text("Subir")'); await wait(500);
  t.eq(await meta(), ['subir', [[true, 'subir']], false], 'redibujo: lo elegido va al <select> nuevo (el que se ve) y avisa con change');
  t.eq(await p.evaluate(() => document.activeElement === document.querySelector('[data-campo="meta"]')), true, 'redibujo: el foco vuelve al <select> nuevo');
  // El nuevo puede venir distinto (sin el «—» una vez elegido): la opción se busca por su valor.
  await p.click('[data-campo="meta"]'); await wait(400);
  await redibujar('<select data-campo="meta" aria-label="Meta"><option value="bajar">Bajar</option><option value="subir" selected>Subir</option></select>'); await wait(150);
  await p.click('.sl-bg .sl-op:has-text("Bajar")'); await wait(500);
  t.eq(await meta(), ['bajar', [[true, 'subir'], [true, 'bajar']], false], 'redibujo con otras opciones: elige la misma (por su valor)');
  await p.click('[data-campo="meta"]'); await wait(400);
  await p.evaluate(() => document.getElementById('caja').remove()); await wait(500);
  t.eq(await hoja(), false, 'si el <select> ya no está en la pantalla, la hoja se cierra sola (como la lista nativa)');

  // Teclado del celular abierto (iPhone y Chrome de Android lo abren encima de la página y
  // app/ui/keyboard.js deja en --kb lo que tapa): en un pedir() el campo y los botones quedan arriba.
  await preguntar('pedir', 'Para borrar tu cuenta escribí ELIMINAR', ''); await wait(400);
  await p.evaluate(() => document.documentElement.style.setProperty('--kb', '336px')); await wait(150);
  const kb = await p.evaluate(() => { const r = s => document.querySelector('.av-bg ' + s).getBoundingClientRect(); return { alto: innerHeight, campo: r('.av-in').top, btns: r('.av-btns').bottom }; });
  t.ok(kb.campo >= 0 && kb.btns <= kb.alto - 336, 'pedir() con el teclado abierto: el campo y los botones quedan arriba del teclado: ' + JSON.stringify(kb));
  await p.keyboard.press('Escape'); await wait(500);
  await p.evaluate(() => document.documentElement.style.setProperty('--kb', '0px'));

  t.eq(errs, [], 'errores de la página');
  await close();

  // Lo mismo en la app de verdad: la ficha del alumno en el panel del coach se vuelve a dibujar
  // apenas se abre (llegan los avisos, las preferencias y la foto). Si en ese momento se estaba
  // eligiendo «Disponibilidad», lo elegido no se pierde.
  const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
  const A1 = '44444444-4444-4444-4444-444444444444';
  const c = await newPage({ user: COACH, viewport: { width: 390, height: 844 }, touch: true, handlers: {
    '/profiles': (x, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
      if (/coach_id=eq/.test(i.url.search)) return J([{ id: A1, full_name: 'Ana Alumna' }]); return J(i.one ? me : [me]); },
    '/coach_billing': (x, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
    '/routines': (x, J, i) => i.m === 'GET' ? J(i.one ? { days: [] } : [{ days: [] }]) : undefined,
    '/routine_templates': (x, J) => J([]), '/routine_schedule': (x, J) => J([]),
  } });
  await c.p.goto(base + '/app/'); await wait(3500);
  await c.p.click(`[data-coach="open"][data-id="${A1}"]`); await wait(1500);
  await c.p.click('[data-coach="sec-open"][data-v="ficha"]'); await wait(400);
  const ficha = () => c.p.evaluate(async () => { const { CoachState } = await import('/app/screens/coach/state.js'); const s = document.querySelector('select[data-coach="info-availability"]');
    return [CoachState.coachInfoForm ? CoachState.coachInfoForm.availability : undefined, s && s.value, !!document.querySelector('.sl-bg:not(.closing)')]; });
  await c.p.tap('select[data-coach="info-availability"]'); await wait(500);
  await c.p.evaluate(async () => (await import('/app/screens/coach/index.js')).renderCoach()); await wait(200);
  await c.p.tap('.sl-bg .sl-op:has-text("3 días / semana")'); await wait(600);
  t.eq(await ficha(), ['3 días / semana', '3 días / semana', false], 'coach: la ficha se redibuja con la hoja abierta y «Disponibilidad» queda en lo elegido');
  t.eq(c.errs, [], 'coach: errores de la página');
  await c.close();
}
