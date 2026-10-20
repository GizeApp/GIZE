// Comida: cómo se ven «Agregar» y la foto del plato (pedido del dueño: «se ve muy croto, muy simple,
// muy hecho con IA… son emojis muy simples, no hay neón»). Con Supabase y la función «ia» simulados.
// Revisa:
// - ninguna hoja tiene emojis (el buscador vacío, con resultados y sin resultados, el permiso, elegir
//   la foto, la espera, la revisión y los avisos): van los íconos de línea de la app;
// - en «Oscuro»: «Sacar foto» y «Elegir de la galería» llevan el filete (el ::after con máscara y el
//   degradé de la marca), «Sacar foto» y la comida elegida el resplandor quieto por dentro, y
//   «Agregar» el filete de los principales y el resplandor de la marca por fuera;
// - lo que se toca mide 44 px o más y no hay scroll horizontal;
// - en «Claro» también el filete; en GIZE básico, nada de filete ni resplandor; con movimiento reducido
//   la línea que recorre la foto queda quieta.
import { wait } from './lib.mjs';
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
    t.ok(await p.$('#sheetHost .pl8-hero svg'), 'Foto del plato: el visor con la cámara');
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
    t.eq((await p.$$('#sheetHost .pl8-row .pl8-b')).length, 4, 'revisión: el origen como etiqueta (tres y un «Revisá»)');
    t.eq((await p.$$('#sheetHost .pl8-vals .pl8-m')).length, 9, 'revisión: los macros en fichas');
    const go = await neon(p, '#pl8Go');
    t.ok(go && go.brillo && !go.adentro && /gradient/.test(go.fondo), '«Agregar»: el filete de los principales y el resplandor: ' + (go && go.sombra));
    t.eq(await p.evaluate(() => getComputedStyle(document.getElementById('pl8Go')).backgroundColor), 'rgba(0, 0, 0, 0)', '«Agregar»: relleno blanco con el degradé (sin color de fondo encima)');
    t.eq(await chicos(p, '#sheetHost .pl8-x, #sheetHost .pl8-step, #sheetHost .pl8-chg, #sheetHost .pl8-add, #sheetHost .pl8-foot .meal-chip, #pl8Go'), 0, 'revisión: lo que se toca mide 44 px o más');
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
