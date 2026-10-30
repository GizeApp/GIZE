// IA en Comida: los estados y los límites (§7.1), Ajustes → Funciones con IA y el permiso
// apagado. Con Supabase y la función «ia» simulados. Revisa:
// - sin conexión: avisa y no llama (ni pregunta el permiso);
// - lo que ya se sabe por ia_mi_estado (pausada, límite del día, de la persona, del mes, ahorro):
//   se avisa sin llamar y se ofrece buscar o escanear;
// - lo que contesta la función (límite del día con su tope, ocupada, foto inválida, no se pudo,
//   error): el texto de cada código; «Probar de nuevo» solo donde sirve;
// - «Te quedan N fotos con IA hoy» con 3 o menos;
// - Ajustes: con el permiso, el interruptor prendido; apagarlo guarda que no y desde ahí el botón
//   lleva a Ajustes (no se vuelve a preguntar solo); prenderlo muestra el aviso otra vez;
// - las apariencias y GIZE básico: la hoja se ve (capturas con SHOTS=<carpeta>).
import { wait, contraste } from './lib.mjs';
import { ESTADO_ON, PLATO, pagina, abrirComida, abrirBuscador, fotoJpeg } from './comida-ia-comun.mjs';

const SHOTS = process.env.SHOTS;
const shot = async (p, n) => { if (SHOTS) await p.screenshot({ path: SHOTS + '/' + n + '.png' }); };
const txt = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return e ? e.innerText.replace(/\s+/g, ' ').trim() : ''; }, sel);
const OK = Object.assign({}, ESTADO_ON, { permiso_comida: 'ok' });

export default async function ({ base, t }){
  // ---------- sin conexión ----------
  {
    const { p, errs, S, close } = await pagina({ estado: ESTADO_ON });
    await abrirComida(p, base); await abrirBuscador(p);
    await p.context().setOffline(true);
    await p.click('#sheetHost [data-action="ia-plato"]'); await wait(700);
    t.has(await txt(p, '#sheetHost .plate-sheet'), 'Sin conexión. La IA necesita internet; podés cargarlo a mano.', 'sin conexión: el aviso');
    t.ok(!(await p.isVisible('#iaPermHost .ia-perm').catch(() => false)), 'sin conexión: no pregunta el permiso');
    t.ok(!!(await p.$('#sheetHost [data-action="plate-manual"]')) && !!(await p.$('#sheetHost [data-action="plate-scan"]')) && !(await p.$('#sheetHost [data-action="plate-retry"]')), 'sin conexión: buscar o escanear, sin «Probar de nuevo»');
    t.eq(S.llamadas.length, 0, 'sin conexión: no llama');
    await shot(p, '20-sin-conexion');
    await p.click('#sheetHost [data-action="plate-manual"]'); await wait(700);
    t.ok(await p.isVisible('#sheetHost .search-sheet'), '«Buscar alimento» abre el buscador de siempre');
    await p.context().setOffline(false);
    t.eq(errs, [], 'sin conexión: errores de la página');
    await close();
  }

  // ---------- lo que ya se sabe por el estado: sin llamar ----------
  for (const [nombre, est, texto] of [
    ['límite del día', { quedan: { plato: 0, texto: 4 } }, 'Llegaste al límite de hoy (8 fotos de plato con IA). Mañana se renueva. Mientras, buscalo o escaneá el código.'],
    ['límite del día (fotos y textos)', { quedan: { plato: 0, texto: 0 }, usados: { plato: 8, texto: 15, total: 23 } }, 'Llegaste al límite de hoy (8 fotos de plato con IA).'],
    // El límite de todos los usos juntos (fotos, voz y lo del coach): dice «usos con IA», no «fotos».
    ['límite del día (total)', { quedan: { plato: 0, texto: 0 }, tope: { plato: 8, texto: 15, total: 20 }, usados: { plato: 5, texto: 15, total: 20 } }, 'Llegaste al límite de hoy (20 usos con IA).'],
    ['límite de la persona', { estado: 'tope_persona', vuelve: '2026-11-10T12:00:00Z' }, 'Llegaste a tu límite personal de este mes con IA. Vuelve el 10 de noviembre. Mientras, buscalo o escaneá el código.'],
    ['límite del mes', { estado: 'tope_mes', vuelve: '2026-11-10T12:00:00Z' }, 'La IA de GIZE llegó a su límite de este mes: cargalo a mano. Vuelve el 10 de noviembre.'],
    ['pausada', { estado: 'pausada' }, 'La IA está pausada por ahora. Cargalo a mano.'],
    ['ahorro', { estado: 'ahorro' }, 'Por este mes, la foto del plato con IA queda para alumnos con coach. Buscalo o escaneá el código.'],
  ]){
    const { p, errs, S, close } = await pagina({ estado: Object.assign({}, OK, est) });
    await abrirComida(p, base); await abrirBuscador(p);
    await p.click('#sheetHost [data-action="ia-plato"]'); await wait(800);
    t.has(await txt(p, '#sheetHost .plate-sheet'), texto, nombre + ': el aviso');
    t.ok(!(await p.$('#sheetHost [data-action="plate-retry"]')) && !!(await p.$('#sheetHost [data-action="plate-manual"]')), nombre + ': sin «Probar de nuevo», con buscar o escanear');
    t.eq(S.llamadas.length, 0, nombre + ': no llama a la IA');
    if (nombre === 'límite del día') await shot(p, '21-limite-dia');
    if (nombre === 'límite del mes') await shot(p, '22-limite-mes');
    if (nombre === 'pausada') await shot(p, '23-pausada');
    t.eq(errs, [], nombre + ': errores de la página');
    await close();
  }

  // ---------- lo que contesta la función ----------
  for (const [codigo, status, extra, texto, reintento] of [
    ['tope_dia', 429, { tope: 8 }, 'Llegaste al límite de hoy (8 fotos de plato con IA)', false],
    ['ocupada', 503, {}, 'La IA está con mucha demanda. Probá en un minuto.', true],
    ['foto_invalida', 400, {}, 'La foto no es válida o es muy grande. Probá con otra.', true],
    ['no_se_pudo', 422, {}, 'No se pudo analizar esta foto.', true],
    ['error', 502, {}, 'La IA está tardando más de lo normal o falló. Probá de nuevo en un rato.', true],
    ['ritmo', 503, {}, 'Por hoy la IA llegó a su límite. Mañana vuelve. Mientras, cargalo a mano.', false],
  ]){
    let n = 0;
    const { p, errs, S, close } = await pagina({ estado: Object.assign({}, OK, { quedan: { plato: 3, texto: 15 } }), funcion: () => (++n === 1 ? [status, Object.assign({ ok: false, codigo, mensaje: 'x' }, extra)] : [200, PLATO]) });
    await abrirComida(p, base); await abrirBuscador(p);
    await p.click('#sheetHost [data-action="ia-plato"]'); await wait(700);
    if (codigo === 'tope_dia') { t.has(await txt(p, '#sheetHost .plate-sheet'), 'Te quedan 3 fotos con IA hoy', 'con 3 o menos: «Te quedan 3 fotos con IA hoy»'); await shot(p, '24-quedan-3'); }
    await p.setInputFiles('#sheetHost input[data-action="plate-file"]:not([capture])', await fotoJpeg(p)); await wait(1500);
    t.has(await txt(p, '#sheetHost .pl8-err'), texto, codigo + ': el texto');
    t.eq(!!(await p.$('#sheetHost [data-action="plate-retry"]')), reintento, codigo + ': «Probar de nuevo» ' + (reintento ? 'sí' : 'no'));
    if (codigo === 'no_se_pudo') await shot(p, '25-no-se-pudo');
    if (reintento) {
      await p.click('#sheetHost [data-action="plate-retry"]'); await wait(1500);
      t.ok(S.llamadas.length === 2 && (await p.$$('#sheetHost .pl8-row')).length === 3, codigo + ': «Probar de nuevo» vuelve a mandar la misma foto');
    }
    t.eq((((await p.evaluate(() => JSON.parse(localStorage.getItem('rutina_jero_v1')))) || {}).diary || []).length, 0, codigo + ': no se anota nada');
    t.eq(errs, [], codigo + ': errores de la página');
    await close();
  }
  // «No vimos comida».
  {
    const { p, errs, close } = await pagina({ estado: OK, funcion: () => [200, { ok: true, hay_comida: false, nota: '', items: [] }] });
    await abrirComida(p, base); await abrirBuscador(p);
    await p.click('#sheetHost [data-action="ia-plato"]'); await wait(700);
    await p.setInputFiles('#sheetHost input[data-action="plate-file"]:not([capture])', await fotoJpeg(p)); await wait(1500);
    t.has(await txt(p, '#sheetHost .pl8-err'), 'No vimos comida en la foto. Probá con el plato entero, de arriba y con buena luz.', 'sin comida: el aviso');
    t.ok(!!(await p.$('#sheetHost [data-action="plate-again"]')), 'sin comida: «Sacar otra foto»');
    await shot(p, '26-sin-comida');
    t.eq(errs, [], 'sin comida: errores de la página');
    await close();
  }

  // ---------- teclado y otro día ----------
  {
    const { p, errs, close } = await pagina({ estado: OK });
    await abrirComida(p, base);
    await p.click('[data-action="day-prev"]'); await wait(800);
    await abrirBuscador(p);
    await p.click('#sheetHost [data-action="ia-plato"]'); await wait(800);
    t.eq(await p.evaluate(() => document.activeElement && document.activeElement.id), 'pl8T', 'al abrir, el foco va a la hoja');
    const vistos = [];
    for (let i = 0; i < 6; i++) { await p.keyboard.press('Tab'); vistos.push(await p.evaluate(() => { const a = document.activeElement; return (a.closest('#sheetHost .plate-sheet') ? 'hoja:' : 'fuera:') + a.textContent.replace(/\s+/g, ' ').trim(); })); }
    t.ok(vistos.every(v => v.startsWith('hoja:')), 'Tab no sale de la hoja: ' + vistos.join(' | '));
    t.ok(vistos.some(v => /Sacar foto/.test(v)) && vistos.some(v => /Elegir de la galería/.test(v)), 'Tab llega a «Sacar foto» y «Elegir de la galería»');
    await p.focus('#sheetHost label[data-pick]');
    // Playwright tarda un momento en empezar a atajar el selector: primero se espera, después Enter.
    const elegir = p.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null); await wait(300);
    await p.keyboard.press('Enter'); const fc = await elegir;
    t.ok(!!fc, 'Enter en «Sacar foto» abre el selector');
    if (fc) await fc.setFiles(await fotoJpeg(p)); await wait(1500);
    t.has(await txt(p, '#sheetHost .plate-sheet .sheet-title'), 'Para ayer', 'mirando ayer: la hoja dice para qué día');
    t.has(await txt(p, '#pl8Go'), ' de ayer · ', 'y el botón también');
    await p.click('#pl8Go'); await wait(1200);
    t.has(await txt(p, '#iaToast'), 'agregados', 'agregado');
    t.has(await txt(p, '#iaToast'), ' de ayer.', 'el aviso dice el día');
    t.eq((((await p.evaluate(() => JSON.parse(localStorage.getItem('rutina_jero_v1')))) || {}).diary || []).length, 0, 'no va a hoy');
    t.eq(errs, [], 'teclado: errores de la página');
    await close();
  }

  // ---------- Ajustes ----------
  {
    const { p, errs, S, close, preguntas } = await pagina({ estado: OK });
    await abrirComida(p, base);
    await p.click('#nav-config'); await wait(1200);
    const sw = '[data-action="cfg-ia-toggle"]';
    t.ok(await p.isVisible(sw), 'Ajustes: «Funciones con IA»');
    t.eq(await p.getAttribute(sw, 'aria-checked'), 'true', 'Ajustes: prendido (aceptó)');
    t.has(await txt(p, '#cfgIaDesc'), 'Envía a Anthropic (EE. UU.) la foto de cada consulta. Apagado: no se manda nada.', 'Ajustes: qué hace (solo la foto)');
    t.ok(!/texto/.test(await txt(p, '#cfgIaDesc')), 'Ajustes: ya no dice que se manda texto');
    t.ok(/privacidad\/\?app=1#ia$/.test(await p.getAttribute('#cfgIaDesc a', 'href')), 'Ajustes: con el enlace a la política');
    await p.$eval(sw, b => b.scrollIntoView({ block: 'center' })); await wait(200);
    await shot(p, '27-ajustes-on');
    await p.click(sw); await wait(800);
    t.eq(S.permisos, [{ p_tipo: 'comida', p_acepta: false }], 'apagar guarda que no');
    t.eq(await p.getAttribute(sw, 'aria-checked'), 'false', 'queda apagado');
    await p.$eval(sw, b => b.scrollIntoView({ block: 'center' })); await wait(200);
    await shot(p, '28-ajustes-off');
    // Con la IA apagada en Ajustes, el botón lleva a Ajustes y no pregunta el permiso.
    await p.click('#nav-comida'); await wait(500); await abrirBuscador(p);
    p.contestar = q => /Apagaste las funciones con IA/.test(q.texto) ? true : true;
    await p.click('#sheetHost [data-action="ia-plato"]'); await wait(900);
    t.ok(preguntas.some(q => /Apagaste las funciones con IA/.test(q.texto) && q.ok === 'Ir a Ajustes'), 'apagada en Ajustes: el botón ofrece ir a Ajustes');
    t.ok(!(await p.isVisible('#iaPermHost .ia-perm').catch(() => false)), 'apagada en Ajustes: no vuelve a preguntar sola');
    t.ok(await p.isVisible(sw), '«Ir a Ajustes» lleva a Ajustes');
    t.eq(S.llamadas.length, 0, 'apagada en Ajustes: no llama a la IA');
    // Prenderla de nuevo muestra el aviso.
    await p.click(sw); await wait(700);
    t.ok(await p.isVisible('#iaPermHost .ia-perm'), 'prender en Ajustes: muestra el aviso');
    await p.click('#iaPermHost [data-ia="si"]'); await wait(900);
    t.eq(S.permisos[S.permisos.length - 1], { p_tipo: 'comida', p_acepta: true, p_version: 1 }, 'prender en Ajustes: guarda el permiso');
    t.eq(await p.getAttribute(sw, 'aria-checked'), 'true', 'queda prendido');
    t.eq(errs, [], 'Ajustes: errores de la página');
    await close();
  }

  // ---------- apariencias y GIZE básico ----------
  for (const [tema, extra] of [['luz', ''], ['azul', ''], ['rosa', ''], ['oscuro', 'basico']]){
    const init = `try { ${tema === 'oscuro' ? '' : `localStorage.setItem('gize_tema', '${tema}');`} ${extra ? "localStorage.setItem('gize_lite', '1');" : ''} } catch (e) {}`;
    const pg = await pagina({ estado: OK });
    await pg.p.addInitScript(init);
    await abrirComida(pg.p, base);
    if (extra) await pg.p.evaluate(() => document.documentElement.classList.add('lite', 'basico'));
    await abrirBuscador(pg.p);
    await pg.p.click('#sheetHost [data-action="ia-plato"]'); await wait(700);
    await pg.p.setInputFiles('#sheetHost input[data-action="plate-file"]:not([capture])', await fotoJpeg(pg.p)); await wait(1500);
    t.eq((await pg.p.$$('#sheetHost .pl8-row')).length, 3, tema + (extra ? ' básico' : '') + ': la hoja con las filas');
    const cmp = await pg.p.evaluate(() => { const a = getComputedStyle(document.querySelector('#sheetHost .pl8-name')).color, b = getComputedStyle(document.querySelector('#sheetHost .pl8-row')).backgroundColor; return a !== b; });
    t.ok(cmp, tema + ': el texto no tiene el color del fondo');
    const k = await contraste(pg.p, '#sheetHost .plate-sheet');
    t.eq(k.malos, [], tema + (extra ? ' básico' : '') + ': contraste de la hoja ≥ 4,5 (mín. ' + k.min + ')');
    await shot(pg.p, '29-tema-' + tema + (extra ? '-basico' : ''));
    t.eq(pg.errs, [], tema + ': errores de la página');
    await pg.close();
  }
}
