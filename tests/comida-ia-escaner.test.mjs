// Las barras de Comida con la IA: la de arriba de la pantalla («Buscar alimento o marca…») y la del
// buscador («Agregar»). Al lado del campo queda solo «Foto» (IA). El escáner de códigos sale
// únicamente cuando la IA no se puede usar, para que la barra no quede sin nada. Con Supabase y la
// función «ia» simulados. Revisa:
// - la barra de arriba: con la IA, «Foto» en lugar del escáner, que abre la foto del plato (con el
//   aviso la primera vez); sin la IA, el escáner como siempre; si el estado llega tarde o cambia la
//   conexión, el botón cambia solo sin redibujar la pantalla; también mirando un día anterior;
// - IA prendida (con o sin el aviso aceptado, y aceptado aunque no haya conexión): «Foto» y nada de
//   escáner en la barra;
// - IA que no se puede usar: apagada en el panel, la función de la app apagada, sin poder preguntar
//   el estado, apagada en Ajustes, o sin aceptar el aviso y sin conexión: el escáner en la barra, y
//   abre el escáner de siempre;
// - con el buscador abierto, si se corta o vuelve la conexión (sin el aviso aceptado), la barra se
//   acomoda sola y el campo no pierde el foco ni lo escrito;
// - eligiendo un alimento para el plato, nunca el escáner;
// - los avisos de la IA (límite, sin conexión…) siguen ofreciendo «Buscar alimento» y «Escanear
//   código», y «Escanear código» abre el escáner.
import { wait } from './lib.mjs';
import { ESTADO_ON, pagina, abrirComida, abrirBuscador, fotoJpeg } from './comida-ia-comun.mjs';

const OK = Object.assign({}, ESTADO_ON, { permiso_comida: 'ok' });
const FOTO = '#sheetHost .search-sheet [data-action="ia-plato"]', SCAN = '#sheetHost .search-sheet [data-action="scan-open"]';
const arriba = p => p.evaluate(() => { const r = document.querySelector('#view .food-search-row'); return r ? [...r.children].map(e => e.dataset.action || e.className.split(' ')[0]) : null; });
const barra = p => p.evaluate(() => [...document.querySelectorAll('#sheetHost .search-sheet .food-search-row > *')].map(e => e.dataset.action || e.className.split(' ')[0]));

export default async function ({ base, t }){
  // ---------- la barra de arriba, con la IA: «Foto» en lugar del escáner ----------
  for (const [nombre, est] of [['sin aceptar el aviso', ESTADO_ON], ['aviso aceptado', OK]]){
    const { p, errs, S, close } = await pagina({ estado: est });
    await abrirComida(p, base);
    t.eq(await arriba(p), ['search-open', 'ia-plato'], 'arriba, ' + nombre + ': el buscador y «Foto» (sin el escáner)');
    t.ok(!(await p.$('#view [data-action="scan-open"]')), 'arriba, ' + nombre + ': sin el escáner');
    t.eq(await p.getAttribute('#view [data-action="ia-plato"]', 'aria-label'), 'Registrar con una foto (IA)', 'arriba, ' + nombre + ': «Foto» con su aria-label');
    const caja = await p.evaluate(() => { const b = document.querySelector('#view [data-action="ia-plato"]').getBoundingClientRect(); return [b.width, b.height]; });
    t.ok(caja[0] >= 44 && caja[1] >= 44, 'arriba, ' + nombre + ': «Foto» se toca bien (≥ 44 × 44): ' + caja);
    t.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'arriba, ' + nombre + ': sin scroll horizontal (390 px)');
    await p.click('#view [data-action="ia-plato"]'); await wait(700);
    if (est === ESTADO_ON) {
      t.ok(await p.isVisible('#iaPermHost .ia-perm'), 'arriba, sin aceptar: «Foto» pregunta el permiso antes');
      await p.click('#iaPermHost [data-ia="si"]'); await wait(900);
      t.eq(S.permisos, [{ p_tipo: 'comida', p_acepta: true, p_version: 1 }], 'arriba: aceptar guarda el permiso');
    }
    t.ok(await p.isVisible('#sheetHost .plate-sheet'), 'arriba, ' + nombre + ': «Foto» abre la hoja del plato');
    t.ok(!!(await p.$('#sheetHost input[data-action="plate-file"]')), 'arriba, ' + nombre + ': con «Sacar foto» / «Elegir de la galería»');
    t.eq(S.llamadas.length, 0, 'arriba, ' + nombre + ': todavía no llama a la IA');
    t.eq(errs, [], 'arriba, ' + nombre + ': errores de la página');
    await close();
  }

  // ---------- la barra de arriba, sin la IA: el escáner como siempre ----------
  for (const [nombre, o, offline] of [
    ['apagada en el panel', { estado: Object.assign({}, ESTADO_ON, { activa: false }) }],
    ['la foto apagada para la app', { estado: Object.assign({}, ESTADO_ON, { funciones: { plato: false, texto: true } }) }],
    ['sin poder preguntar el estado', { sinEstado: true }],
    ['apagada en Ajustes', { estado: Object.assign({}, ESTADO_ON, { permiso_comida: 'no' }) }],
    ['sin aceptar el aviso y sin conexión', { estado: ESTADO_ON }, true],
  ]){
    const { p, errs, close } = await pagina(o);
    await abrirComida(p, base);
    if (offline) { await p.context().setOffline(true); await wait(400); }
    t.eq(await arriba(p), ['search-open', 'scan-open'], 'arriba, ' + nombre + ': el buscador y el escáner');
    t.eq(await p.getAttribute('#view [data-action="scan-open"]', 'aria-label'), 'Escanear código de barras (beta)', 'arriba, ' + nombre + ': el escáner de siempre');
    await p.click('#view [data-action="scan-open"]'); await wait(500);
    t.ok(await p.isVisible('.scan-wrap'), 'arriba, ' + nombre + ': abre el escáner');
    await p.click('[data-action="scan-close"]'); await wait(400);
    if (offline) await p.context().setOffline(false);
    t.eq(errs, [], 'arriba, ' + nombre + ': errores de la página');
    await close();
  }

  // ---------- la barra de arriba cambia sola, sin redibujar la pantalla ----------
  {
    const { p, errs, close } = await pagina({ estado: ESTADO_ON, estadoTarde: 2500 });
    await p.goto(base + '/app/'); await wait(2500);
    await p.click('#nav-comida'); await wait(300);
    t.eq(await arriba(p), ['search-open', 'scan-open'], 'estado tarde: mientras no se sabe, el escáner');
    await p.evaluate(() => { document.querySelector('#view .meals').dataset.marca = '1'; });
    await wait(2800);
    t.eq(await arriba(p), ['search-open', 'ia-plato'], 'estado tarde: al llegar, «Foto» en su lugar');
    await p.context().setOffline(true); await wait(400);
    t.eq(await arriba(p), ['search-open', 'scan-open'], 'se corta (sin aceptar el aviso): vuelve el escáner');
    await p.context().setOffline(false); await wait(400);
    t.eq(await arriba(p), ['search-open', 'ia-plato'], 'vuelve la conexión: «Foto» otra vez');
    t.eq(await p.evaluate(() => document.querySelector('#view .meals').dataset.marca), '1', 'la pantalla no se redibujó (solo cambió el botón)');
    t.eq(errs, [], 'estado tarde (arriba): errores de la página');
    await close();
  }

  // ---------- la barra de arriba mirando un día anterior ----------
  {
    const { p, errs, close } = await pagina({ estado: OK });
    await abrirComida(p, base);
    await p.click('[data-action="day-prev"]'); await wait(800);
    t.eq(await arriba(p), ['search-open', 'ia-plato'], 'día anterior: el buscador y «Foto»');
    await p.click('#view [data-action="ia-plato"]'); await wait(700);
    t.ok(await p.isVisible('#sheetHost .plate-sheet'), 'día anterior: «Foto» abre la hoja del plato');
    t.eq(errs, [], 'día anterior (arriba): errores de la página');
    await close();
  }

  // ---------- la IA se puede usar: solo «Foto» ----------
  for (const [nombre, est, offline] of [['prendida, sin aceptar el aviso', ESTADO_ON], ['prendida, aviso aceptado', OK], ['aviso aceptado, sin conexión', OK, true]]){
    const { p, errs, close } = await pagina({ estado: est });
    await abrirComida(p, base);
    if (offline) await p.context().setOffline(true);
    await abrirBuscador(p);
    t.eq(await barra(p), ['cal-search', 'ia-plato'], nombre + ': en la barra, el buscador y «Foto» (sin el escáner)');
    t.ok(await p.isVisible(FOTO), nombre + ': «Foto» se ve');
    t.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), nombre + ': sin scroll horizontal (390 px)');
    if (offline) await p.context().setOffline(false);
    t.eq(errs, [], nombre + ': errores de la página');
    await close();
  }

  // ---------- la IA no se puede usar: el escáner en la barra ----------
  for (const [nombre, o, foto, offline] of [
    ['apagada en el panel', { estado: Object.assign({}, ESTADO_ON, { activa: false }) }, false],
    ['la foto apagada para la app', { estado: Object.assign({}, ESTADO_ON, { funciones: { plato: false, texto: true } }) }, false],
    ['sin poder preguntar el estado', { sinEstado: true }, false],
    ['apagada en Ajustes', { estado: Object.assign({}, ESTADO_ON, { permiso_comida: 'no' }) }, true],
    ['sin aceptar el aviso y sin conexión', { estado: ESTADO_ON }, true, true],
  ]){
    const { p, errs, close } = await pagina(o);
    await abrirComida(p, base);
    if (offline) await p.context().setOffline(true);
    await abrirBuscador(p);
    t.ok(await p.isVisible(SCAN), nombre + ': el escáner en la barra');
    t.eq(await barra(p), foto ? ['cal-search', 'ia-plato', 'scan-open'] : ['cal-search', 'scan-open'], nombre + ': lo que hay en la barra');
    t.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), nombre + ': sin scroll horizontal (390 px)');
    await p.click(SCAN); await wait(500);
    t.ok(await p.isVisible('.scan-wrap'), nombre + ': el botón abre el escáner');
    await p.click('[data-action="scan-close"]'); await wait(400);
    if (offline) await p.context().setOffline(false);
    t.eq(errs, [], nombre + ': errores de la página');
    await close();
  }

  // ---------- se corta y vuelve la conexión con el buscador abierto ----------
  {
    const { p, errs, close } = await pagina({ estado: ESTADO_ON });
    await abrirComida(p, base); await abrirBuscador(p);
    await p.click('#foodSearch'); await p.keyboard.type('pol', { delay: 40 });
    t.eq(await barra(p), ['cal-search', 'ia-plato'], 'con conexión: sin el escáner');
    await p.context().setOffline(true); await wait(400);
    t.eq(await barra(p), ['cal-search', 'ia-plato', 'scan-open'], 'se corta (sin aceptar el aviso): aparece el escáner');
    await p.keyboard.type('lo', { delay: 40 });
    await p.context().setOffline(false); await wait(400);
    t.eq(await barra(p), ['cal-search', 'ia-plato'], 'vuelve la conexión: el escáner se va');
    t.eq(await p.evaluate(() => [document.activeElement && document.activeElement.id, document.getElementById('foodSearch').value]), ['foodSearch', 'pollo'],
      'al acomodarse la barra, el buscador sigue con el foco y lo escrito');
    t.eq(errs, [], 'conexión: errores de la página');
    await close();
  }

  // ---------- eligiendo un alimento para el plato: sin escáner ----------
  {
    const { p, errs, close } = await pagina({ estado: OK });
    await abrirComida(p, base); await abrirBuscador(p);
    await p.click('#sheetHost [data-action="ia-plato"]'); await wait(700);
    await p.setInputFiles('#sheetHost input[data-action="plate-file"]:not([capture])', await fotoJpeg(p)); await wait(1500);
    await p.click('#sheetHost .pl8-chg'); await wait(700);
    t.ok(await p.isVisible('#sheetHost .search-sheet'), 'plato: «Cambiar» abre el buscador');
    t.eq(await barra(p), ['cal-search'], 'plato: el buscador sin «Foto» ni escáner');
    t.eq(errs, [], 'plato: errores de la página');
    await close();
  }

  // ---------- los avisos de la IA siguen ofreciendo buscar o escanear ----------
  for (const [nombre, est, offline] of [['límite del día', Object.assign({}, OK, { quedan: { plato: 0, texto: 4 } })], ['límite del mes', Object.assign({}, OK, { estado: 'tope_mes', vuelve: '2026-11-10T12:00:00Z' })], ['pausada', Object.assign({}, OK, { estado: 'pausada' })], ['sin conexión', OK, true]]){
    const { p, errs, close } = await pagina({ estado: est });
    await abrirComida(p, base); await abrirBuscador(p);
    t.ok(!(await p.$(SCAN)), nombre + ': la barra sin el escáner');
    if (offline) await p.context().setOffline(true);
    await p.click('#sheetHost [data-action="ia-plato"]'); await wait(800);
    t.ok(await p.isVisible('#sheetHost [data-action="plate-manual"]'), nombre + ': «Buscar alimento»');
    t.ok(await p.isVisible('#sheetHost [data-action="plate-scan"]'), nombre + ': «Escanear código»');
    await p.click('#sheetHost [data-action="plate-scan"]'); await wait(800);
    t.ok(await p.isVisible('.scan-wrap'), nombre + ': «Escanear código» abre el escáner');
    await p.click('[data-action="scan-close"]'); await wait(400);
    if (offline) await p.context().setOffline(false);
    t.eq(errs, [], nombre + ': errores de la página');
    await close();
  }
}
