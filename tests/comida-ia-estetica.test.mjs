// Comida: cómo se ven «Agregar» y la foto del plato (pedido del dueño: «se ve muy croto, muy simple,
// muy hecho con IA… son emojis muy simples, no hay neón»). Con Supabase y la función «ia» simulados.
// Revisa:
// - ninguna hoja tiene emojis (el buscador vacío, con resultados y sin resultados, el permiso, elegir
//   la foto, la espera, la revisión y los avisos): van los íconos de línea de la app;
// - en «Oscuro»: «Sacar foto» y «Elegir de la galería» llevan el filete (el ::after con máscara y el
//   degradé de la marca), «Sacar foto» y la comida elegida el resplandor quieto por dentro, y
//   «Agregar» el filete de los principales y el resplandor de la marca por fuera;
// - lo que se toca mide 44 px o más (la comida del pie de la revisión se dibuja a 36 px y se toca en 44)
//   y no hay scroll horizontal; los textos de los resultados llegan a 4,5:1 (Oscuro y sin neón);
// - el visor de «Foto del plato» es adorno (bajo, sin un botón redondo que parezca la cámara);
// - en un celular chico (360×640) el pie fijo de la revisión no pasa de 200 px y el total no cambia de
//   alto al pasar de 1.000 kcal; en 375×667 el permiso entra entero («Ahora no» a la vista);
// - en «Claro» también el filete; en GIZE básico, nada de filete ni resplandor; con movimiento reducido
//   la línea que recorre la foto queda quieta.
import { wait, contraste } from './lib.mjs';
import { ESTADO_ON, pagina, abrirComida, abrirBuscador, fotoJpeg } from './comida-ia-comun.mjs';

const OK = Object.assign({}, ESTADO_ON, { permiso_comida: 'ok' });
// Emojis y los tildes de dingbats (✓ ✔ ✅) que se usaban como ícono.
const EMOJI = /[\p{Extended_Pictographic}✓✔✅️]/gu;
const emojis = (p, sel) => p.evaluate(([s, re]) => { const e = document.querySelector(s); return e ? (e.textContent.match(new RegExp(re, 'gu')) || []) : ['(no está ' + s + ')']; }, [sel, EMOJI.source]);
// El filete: un ::after con máscara y un degradé de fondo. El resplandor: una sombra con color.
const neon = (p, sel) => p.evaluate(s => {
  const e = document.querySelector(s); if (!e) return null;
  const a = getComputedStyle(e, '::after'), m = a.maskImage || a.webkitMaskImage || 'none', st = getComputedStyle(e);
  const conColor = sh => (sh.match(/rgba?\([^)]*\)|color\(srgb[^)]*\)/g) || []).some(c => {
    const n = c.match(/[\d.]+/g).map(Number), [r, g, b] = /srgb/.test(c) ? n.slice(0, 3).map(x => x * 255) : n, al = n[3] == null ? 1 : n[3];
    return al > 0.15 && Math.max(r, g, b) - Math.min(r, g, b) > 60; });
  return { filete: a.content !== 'none' && m !== 'none' && /gradient/.test(a.backgroundImage), sombra: st.boxShadow, brillo: st.boxShadow !== 'none' && conColor(st.boxShadow),
    adentro: /inset/.test(st.boxShadow), fondo: st.backgroundImage };
}, sel);
const chicos = (p, sel) => p.$$eval(sel, bs => bs.filter(b => b.getClientRects().length).map(b => b.getBoundingClientRect()).filter(r => r.width < 43.5 || r.height < 43.5).length);
const sinScroll = p => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

export default async function ({ base, t }){
  // ---------- «Oscuro» ----------
  {
    const { p, errs, close } = await pagina({ estado: ESTADO_ON, handlers: { '/functions/v1/ia': () => new Promise(() => {}) } });
    await abrirComida(p, base); await abrirBuscador(p);
    t.eq(await emojis(p, '#sheetHost .search-sheet'), [], 'Agregar, vacío: sin emojis');
    t.ok(await p.$('#sheetHost .ss-empty .ss-empty-ic svg'), 'Agregar, vacío: el ícono y la ayuda');
    t.ok(await p.$('#sheetHost [data-action="ia-plato"] svg') && !(await p.$('#sheetHost [data-action="ia-plato"] .ia-mini')), '«Foto»: la cámara y la chispa (sin la cajita «IA»)');
    const foto = await neon(p, '#sheetHost .ia-foto-btn');
    t.ok(foto && foto.filete, '«Foto»: con el filete');
    const chip = await neon(p, '#sheetHost .search-sheet .meal-chip.on');
    t.ok(chip && chip.filete && chip.adentro && chip.brillo, 'la comida elegida: el filete y el resplandor por dentro: ' + (chip && chip.sombra));
    t.eq(await chicos(p, '#sheetHost .search-sheet .meal-chip, #sheetHost .ia-foto-btn, #sheetHost .search-sheet .cal-create'), 0, 'Agregar: la comida, «Foto» y crear miden 44 px o más');
    await p.fill('#foodSearch', 'pollo'); await wait(700);
    t.ok((await p.$$('#foodResults .food-row .food-ic svg')).length > 3, 'resultados: cada uno con el ícono del alimento');
    t.eq((await contraste(p, '#sheetHost .search-sheet')).malos, [], 'resultados: los textos llegan a 4,5:1');
    t.eq(await emojis(p, '#sheetHost .search-sheet'), [], 'resultados: sin emojis');
    await p.fill('#foodSearch', 'zzzz inexistente'); await wait(900);
    t.has(await p.textContent('#foodResults'), 'Sin resultados', 'sin resultados: el aviso');
    t.eq(await emojis(p, '#sheetHost .search-sheet'), [], 'sin resultados: sin emojis');
    t.ok(await sinScroll(p), 'Agregar: sin scroll horizontal');
    await p.fill('#foodSearch', ''); await wait(300);
    // El permiso.
    await p.click('#sheetHost [data-action="ia-plato"]'); await wait(700);
    t.eq(await emojis(p, '#iaPermHost .ia-perm'), [], 'el permiso: sin emojis');
    t.eq((await p.$$('#iaPermHost .ia-perm li .ia-perm-ic svg')).length, 5, 'el permiso: un ícono por punto');
    await p.click('#iaPermHost [data-ia="si"]'); await wait(800);
    // Elegir la foto.
    t.eq(await emojis(p, '#sheetHost .plate-sheet'), [], 'Foto del plato: sin emojis');
    t.ok(await p.$('#sheetHost .pl8-hero svg'), 'Foto del plato: el visor con su dibujo');
    const hero = await p.evaluate(() => { const h = document.querySelector('#sheetHost .pl8-hero'); return { alto: h.getBoundingClientRect().height, redondo: !!h.querySelector('.pl8-hero-sp') ||
      [...h.querySelectorAll('*')].some(e => getComputedStyle(e).borderRadius === '50%' && e.getBoundingClientRect().width > 40) }; });
    t.ok(hero.alto <= 100 && !hero.redondo, 'el visor es adorno: bajo y sin un botón redondo que parezca la cámara: ' + JSON.stringify(hero));
    const cam = await neon(p, '#sheetHost .pl8-op-cam'), gal = await neon(p, '#sheetHost .pl8-op:not(.pl8-op-cam)');
    t.ok(cam && cam.filete && cam.brillo, '«Sacar foto»: el filete y el resplandor: ' + (cam && cam.sombra));
    t.ok(gal && gal.filete, '«Elegir de la galería»: el filete');
    t.eq(await chicos(p, '#sheetHost .pl8-op, #sheetHost .ss-x'), 0, 'las opciones miden 44 px o más');
    t.ok(await sinScroll(p), 'Foto del plato: sin scroll horizontal');
    // La espera (la función no contesta).
    await p.setInputFiles('#sheetHost input[data-action="plate-file"]:not([capture])', await fotoJpeg(p)); await wait(900);
    t.has(await p.textContent('#sheetHost .pl8-wait'), 'Leyendo tu plato…', 'la espera: «Leyendo tu plato…»');
    t.eq((await p.$$('#sheetHost .pl8-skel .pl8-sk')).length, 3, 'la espera: el lugar de la lista');
    t.ok(await p.evaluate(() => getComputedStyle(document.querySelector('#sheetHost .pl8-scan-l')).animationName !== 'none'), 'la espera: la línea recorre la foto');
    t.eq(await emojis(p, '#sheetHost .plate-sheet'), [], 'la espera: sin emojis');
    t.eq(errs, [], 'Oscuro: errores de la página');
    await close();
  }
  // ---------- «Oscuro»: la revisión y los avisos ----------
  {
    const { p, errs, close } = await pagina({ estado: OK });
    await abrirComida(p, base); await abrirBuscador(p);
    await p.click('#sheetHost [data-action="ia-plato"]'); await wait(700);
    await p.setInputFiles('#sheetHost input[data-action="plate-file"]:not([capture])', await fotoJpeg(p)); await wait(1500);
    t.eq((await p.$$('#sheetHost .pl8-row .pl8-ic svg')).length, 3, 'revisión: cada alimento con su ícono');
    t.eq(await emojis(p, '#sheetHost .plate-sheet'), [], 'revisión: sin emojis');
    t.eq((await p.$$('#sheetHost .pl8-row :is(.pl8-src, .pl8-b, .pl8-rev)')).length, 0, 'revisión: sin etiquetas de origen ni «Revisá» (solo gramos y números)');
    t.eq((await p.$$('#sheetHost .pl8-vals .pl8-m')).length, 9, 'revisión: los macros en fichas');
    const go = await neon(p, '#pl8Go');
    t.ok(go && go.brillo && !go.adentro && /gradient/.test(go.fondo), '«Agregar»: el filete de los principales y el resplandor: ' + (go && go.sombra));
    t.eq(await p.evaluate(() => getComputedStyle(document.getElementById('pl8Go')).backgroundColor), 'rgba(0, 0, 0, 0)', '«Agregar»: relleno blanco con el degradé (sin color de fondo encima)');
    t.eq(await chicos(p, '#sheetHost .pl8-x, #sheetHost .pl8-step, #sheetHost .pl8-chg, #pl8Go'), 0, 'revisión: lo que se toca mide 44 px o más');
    // La comida del pie: se dibuja a 36 px y se toca en 44 (3,5 px arriba y abajo de la ficha siguen siendo la ficha).
    t.eq(await p.$$eval('#sheetHost .pl8-foot .meal-chip', cs => cs.filter(c => { const r = c.getBoundingClientRect(), x = r.left + r.width / 2;
      return r.height < 35 || ![r.top - 3.5, r.bottom + 3.5].every(y => c.contains(document.elementFromPoint(x, y))); }).length), 0, 'revisión: la comida del pie se toca en 44 px');
    // Celular chico: el pie fijo deja lugar para revisar y el total no salta al cambiar los gramos.
    await p.setViewportSize({ width: 360, height: 640 }); await wait(300);
    t.ok(await p.evaluate(() => document.querySelector('#sheetHost .pl8-foot').getBoundingClientRect().height) <= 200, '360×640: el pie de la revisión mide 200 px o menos');
    const altoTot = () => p.evaluate(() => document.getElementById('pl8Tot').getBoundingClientRect().height);
    const tot0 = await altoTot();
    for (let k = 0; k < 6; k++) { await p.click('#sheetHost .pl8-row[data-i="0"] [data-d="1"]'); await wait(60); }
    t.has(await p.textContent('#pl8Tot'), '.', '360×640: el total pasó de 1.000 kcal');
    t.eq(await altoTot(), tot0, '360×640: el total no cambia de alto');
    t.ok(await sinScroll(p), 'revisión: sin scroll horizontal');
    await close();
    t.eq(errs, [], 'revisión: errores de la página');
  }
  for (const [nombre, o] of [['límite', { estado: Object.assign({}, OK, { quedan: { plato: 0, texto: 4 } }) }], ['error', { estado: OK, funcion: () => [503, { ok: false, codigo: 'ocupada', mensaje: 'x' }] }],
    ['sin comida', { estado: OK, funcion: () => [200, { ok: true, hay_comida: false, nota: '', items: [] }] }]]){
    const { p, errs, close } = await pagina(o);
    await abrirComida(p, base); await abrirBuscador(p);
    await p.click('#sheetHost [data-action="ia-plato"]'); await wait(700);
    if (nombre !== 'límite') { await p.setInputFiles('#sheetHost input[data-action="plate-file"]:not([capture])', await fotoJpeg(p)); await wait(1500); }
    t.ok(await p.$('#sheetHost .pl8-err .pl8-err-ic svg'), nombre + ': el aviso con su ícono');
    t.eq(await emojis(p, '#sheetHost .plate-sheet'), [], nombre + ': sin emojis');
    t.eq(await chicos(p, '#sheetHost .pl8-btns .ctrl'), 0, nombre + ': los botones miden 44 px o más');
    t.eq(errs, [], nombre + ': errores de la página');
    await close();
  }
  // ---------- Sin neón: los resultados; 375×667: el permiso entra entero ----------
  {
    const { p, errs, close } = await pagina({ estado: ESTADO_ON });
    await p.addInitScript("try { localStorage.setItem('gize_neon','0') } catch (e) {}");
    await p.setViewportSize({ width: 375, height: 667 });
    await abrirComida(p, base); await abrirBuscador(p);
    await p.fill('#foodSearch', 'pollo'); await wait(700);
    t.eq((await contraste(p, '#sheetHost .search-sheet')).malos, [], 'sin neón: los resultados llegan a 4,5:1');
    await p.fill('#foodSearch', ''); await wait(300);
    await p.click('#sheetHost [data-action="ia-plato"]'); await wait(700);
    t.ok(await p.evaluate(() => { const b = document.querySelector('#iaPermHost [data-ia="no"].ctrl, #iaPermHost button[data-ia="no"]'); return !!b && b.getBoundingClientRect().bottom <= innerHeight; }),
      '375×667: «Ahora no» se ve sin desplazar');
    t.eq((await contraste(p, '#iaPermHost .ia-perm')).malos, [], 'el permiso: los textos llegan a 4,5:1');
    t.eq(errs, [], 'sin neón: errores de la página');
    await close();
  }
  // ---------- «Claro», GIZE básico y movimiento reducido ----------
  for (const [nombre, init, cls, rm] of [['Claro', "localStorage.setItem('gize_tema','luz')", null, false], ['básico', "localStorage.setItem('gize_lite','1')", ['lite', 'basico'], false], ['movimiento reducido', '', null, true]]){
    const pg = await pagina({ estado: OK, handlers: { '/functions/v1/ia': () => new Promise(() => {}) } });
    if (rm) await pg.p.emulateMedia({ reducedMotion: 'reduce' });
    if (init) await pg.p.addInitScript(`try { ${init} } catch (e) {}`);
    await abrirComida(pg.p, base);
    if (cls) await pg.p.evaluate(c => document.documentElement.classList.add(...c), cls);
    await abrirBuscador(pg.p);
    await pg.p.click('#sheetHost [data-action="ia-plato"]'); await wait(700);
    const cam = await neon(pg.p, '#sheetHost .pl8-op-cam');
    if (nombre === 'Claro') t.ok(cam && cam.filete && cam.brillo, 'Claro: «Sacar foto» con el filete y el resplandor');
    if (nombre === 'básico') t.ok(cam && !cam.filete && cam.sombra === 'none', 'básico: «Sacar foto» sin filete ni resplandor');
    t.eq(await emojis(pg.p, '#sheetHost .plate-sheet'), [], nombre + ': sin emojis');
    await pg.p.setInputFiles('#sheetHost input[data-action="plate-file"]:not([capture])', await fotoJpeg(pg.p)); await wait(900);
    if (nombre !== 'Claro') t.eq(await pg.p.evaluate(() => getComputedStyle(document.querySelector('#sheetHost .pl8-scan-l')).animationName), 'none', nombre + ': la línea de la espera queda quieta');
    t.eq(pg.errs, [], nombre + ': errores de la página');
    await pg.close();
  }
}
