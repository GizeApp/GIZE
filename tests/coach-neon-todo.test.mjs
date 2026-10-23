// Panel del coach: el filete de neón en casi todo (css/screens/coach/neon.css). El dueño: «agrégale
// neón a los días, a casi todo: al programar rutina nueva, al panel de la izquierda».
// - Con neón: la barra lateral, el elegido de la navegación (compu y la píldora del celular), la
//   píldora, las pestañas de los días, «+ Programar una rutina nueva», los días de «Se repite», el ⋯ del
//   día y «Más acciones», «Separar», Reps / Tiempo, el menú ⋯, el panel lateral de Clientes y sus
//   fichas, «Copiar código», las secciones y el Tema de Configuración, los días de una rutina en
//   Rutinas, «Cancelar» y las opciones de «Programar una rutina nueva» llevan el filete de las tarjetas
//   (un degradé a 155° con máscara, con el color de la marca en las puntas). Lo elegido, uno más
//   claro y un resplandor suave en el ::before; lo demás, sin resplandor. Al pasar el mouse, más claro.
//   El punteado (agregar día, «+ Agregar ejercicio»), en dos tonos de la marca; las ventanas, el
//   filete en capas de fondo (no se va al deslizar, sin cortes en las esquinas); la rayita de la
//   pestaña elegida de la ficha, en degradé (a 3:1 o más en todas las apariencias); los campos con
//   foco suman el resplandor y conservan su borde de foco. La ficha de Chat del panel lateral, con
//   el filete más claro que las otras.
// - Lo pintado, no solo lo calculado: nada de lo que lleva el filete sobre el borde o el resplandor
//   de afuera recorta lo de adentro (overflow), y alrededor del día elegido se ve el resplandor.
// - Con el neón apagado: los mismos llevan el filete blanco y gris (a 160°, sin color) y lo elegido
//   uno más claro, sin resplandor.
// - «Claro», «Azul» y «Rosa», liviano, la app de Android, GIZE básico, «reducir movimiento» y colores
//   forzados: en tests/coach-neon-temas.test.mjs (separadas para que cada una quede lejos del tope de
//   tiempo de cada prueba). Lo común de las dos, en tests/coach-neon-comun.mjs.
// - No se mueve nada: las cajas de todo lo que se ve son las mismas con la hoja prendida y apagada
//   (compu y celular, en cada vista). El contraste de los textos importantes no baja (medido contra el
//   fondo real, como tests/coach-vidrio.test.mjs). El foco con teclado se sigue viendo igual.
// - La app del alumno no cambia nada (estilos calculados idénticos con la hoja prendida y apagada).
// - Nada late ni gira (el resplandor está quieto).
import { newPage, wait, ALUMNO, profile } from './lib.mjs';
import { handlers, D, M, TEMA, abrir, go, hoja, leer, colores, conTinte, tinte, fuerza, tono, dTono, hex, conNeon, gris, brillo, transparente, seMueve, sinCambios, contrasteIgual, pixeles, caja, rayita, croma, recortan, QUE, QUE_CEL, quietas } from './coach-neon-comun.mjs';

export default async function ({ base, t }){
  // ---- «Oscuro», compu, neón prendido: el filete en todo, lo elegido más claro y con resplandor ----
  {
    const { p, errs, close } = await abrir(base);
    await p.goto(base + '/app/'); await wait(3500); await quietas(p);
    t.ok(await p.evaluate(() => { const l = [...document.querySelectorAll('link[rel="stylesheet"]')].map(x => x.getAttribute('href'));
      const i = l.indexOf('css/screens/coach/vidrio.css'); return i >= 0 && l[i + 1] === 'css/screens/coach/neon.css'; }), 'app/index.html carga css/screens/coach/neon.css justo después de vidrio.css');
    const tokens = await p.evaluate(() => ['--gize-r1', '--gize-r2'].map(k => getComputedStyle(document.documentElement).getPropertyValue(k).trim()));
    const [r1, r2] = tokens.map(hex);
    const resto = [], elegidos = [];
    for (const vista of Object.keys(QUE)){
      await go(p, vista); await p.mouse.move(1436, 896); await wait(250);
      for (const [n, sel, on] of QUE[vista]){
        const v = await leer(p, sel);
        if (!v) { t.ok(false, 'Oscuro: no se vio ' + n + ' (' + sel + ')'); continue; }
        t.ok(conNeon(v), 'Oscuro: ' + n + ' lleva el filete de neón (::after con máscara, 155°, con color): ' + (v.after ? v.after.bg.slice(0, 140) : 'sin ::after'));
        if (v.estilo !== 'none' && v.ancho > 0) t.ok(v.bordes.every(transparente), 'Oscuro: ' + n + ': el filete toma el lugar del borde (transparente): ' + v.bordes[0]);
        if (conNeon(v)) {
          const cs = colores(v.after.bg);
          t.ok(dTono(tono(cs[0]), tono(r2)) <= 20 && dTono(tono(cs[cs.length - 1]), tono(r1)) <= 20, 'Oscuro: ' + n + ': las puntas tienen el tono de --gize-r2 y --gize-r1');
          (on ? elegidos : resto).push([n, fuerza(v.after.bg)]);
        }
        t.eq(brillo(v), !!on, 'Oscuro: ' + n + (on ? ' (elegido) tiene' : ' no tiene') + ' resplandor suave: ' + (v.before ? v.before.sh.slice(0, 90) : 'sin ::before'));
        if (v.before) t.eq(v.before.anim, 'none', 'Oscuro: el resplandor de ' + n + ' está quieto');
      }
    }
    const maxResto = Math.max(...resto.map(x => x[1])), minElegido = Math.min(...elegidos.map(x => x[1]));
    t.ok(resto.length > 8 && elegidos.length >= 6 && minElegido > maxResto + .5, 'Oscuro: lo elegido tiene el filete claramente más claro (' + minElegido.toFixed(2) + ') que lo demás (' + maxResto.toFixed(2) + ')');

    // La barra lateral: su panel de vidrio con el filete de neón.
    await go(p, 'editor'); await p.mouse.move(1436, 896); await wait(200);
    const side = await leer(p, '.cv-side');
    t.ok(conNeon(side), 'Oscuro: la barra lateral (el panel de vidrio) lleva el filete de neón: ' + (side.after ? side.after.bg.slice(0, 120) : ''));
    t.eq(await p.evaluate(() => getComputedStyle(document.querySelector('.cv-side'), '::after').paddingTop), '1.5px', 'Oscuro: el filete de la barra lateral tiene el grosor de los demás (1.5 px)');
    // Lo pintado: alrededor del día elegido se ve el resplandor (antes la pestaña lo recortaba).
    const cajaDia = await caja(p, '.co-daytab.on');
    const [anCon] = await pixeles(p, [{ k: 'anillo', r: cajaDia }]); await hoja(p, false);
    const [anSin] = await pixeles(p, [{ k: 'anillo', r: cajaDia }]); await hoja(p, true);
    t.ok(anCon > anSin + 8, 'Oscuro: alrededor del día elegido se ve el resplandor (croma del anillo de afuera ' + anSin.toFixed(1) + ' → ' + anCon.toFixed(1) + ')');
    const rc = await recortan(p);
    t.ok(rc.n >= 8 && !rc.malos.length, 'Oscuro, editor: nada con el filete sobre el borde o el resplandor de afuera recorta lo de adentro (' + rc.n + '): ' + rc.malos.slice(0, 4).join(' | '));
    await wait(700); // que terminen las transiciones de los bordes (con la hoja apagada y prendida otra vez)
    // La rayita de la pestaña elegida de la ficha: un degradé de la marca.
    const raya = await p.evaluate(() => getComputedStyle(document.querySelector('.cv-ctab.on'), '::after').backgroundImage);
    t.ok(/^linear-gradient\(90deg/.test(raya) && colores(raya).filter(conTinte).length >= 2, 'Oscuro: la rayita de la pestaña elegida (Rutina) va en degradé: ' + raya);
    // El punteado: «+» de agregar día y «+ Agregar ejercicio» del final, en dos tonos de la marca.
    for (const [n, sel] of [['agregar día', '.co-daytab.add'], ['«+ Agregar ejercicio»', '.co-rt-add-end']]){
      const v = await leer(p, sel), [top, , bottom] = v.bordes.map(c => colores(c)[0]);
      t.ok(v.estilo === 'dashed' && conTinte(top) && conTinte(bottom) && dTono(tono(top), tono(r2)) <= 20 && dTono(tono(bottom), tono(r1)) <= 20,
        'Oscuro: ' + n + ': punteado de neón (arriba el violeta, abajo el azul): ' + v.bordes.join(' / '));
    }
    // Al pasar el mouse: el filete más claro.
    const quieto = await leer(p, '.co-daytab[data-i="1"]');
    await p.hover('.co-daytab[data-i="1"]'); await wait(200);
    const encima = await leer(p, '.co-daytab[data-i="1"]');
    t.ok(conNeon(encima) && fuerza(encima.after.bg) > fuerza(quieto.after.bg) + .3, 'Oscuro: al pasar el mouse por un día, el filete se aclara');
    await p.mouse.move(1436, 896); await wait(200);
    // El ⋯ abierto o con el mouse encima: se ve su borde de siempre (el filete no lo tapa).
    const menu = '.co-day-bar .co-day-menu > summary';
    await p.hover(menu); await wait(700); // que termine la transición del borde
    const mh = await leer(p, menu); const mhSin = await (async () => { await hoja(p, false); const v = await leer(p, menu); await hoja(p, true); return v; })();
    t.ok(!mh.after && mh.bordes[0] === mhSin.bordes[0] && !transparente(mh.bordes[0]), 'Oscuro: el ⋯ del día con el mouse encima muestra su borde de siempre (' + mh.bordes[0] + '), sin el filete encima');
    await p.mouse.move(1436, 896); await wait(200);

    // El foco: el campo conserva su borde de foco y suma el resplandor; con teclado, el contorno de siempre.
    await p.focus('.co-dayname'); await wait(200);
    const foco = await leer(p, '.co-dayname'); await hoja(p, false); const focoSin = await leer(p, '.co-dayname'); await hoja(p, true);
    t.eq(foco.bordes[0], focoSin.bordes[0], 'Oscuro: el campo con foco conserva su borde de foco (' + foco.bordes[0] + ')');
    t.ok(tinte(foco.sombra) && !tinte(focoSin.sombra), 'Oscuro: el campo con foco suma el resplandor de la marca: ' + foco.sombra.slice(0, 100));
    await p.evaluate(() => document.activeElement.blur());
    await p.focus('.co-daytab[data-i="1"]'); await p.keyboard.press('Shift+Tab'); await p.keyboard.press('Tab'); await wait(200);
    const kb = await p.evaluate(() => [document.activeElement.className, document.activeElement.matches(':focus-visible')]);
    const ol = await leer(p, '.co-daytab:focus-visible'); await hoja(p, false); const olSin = await leer(p, '.co-daytab:focus-visible'); await hoja(p, true);
    t.ok(kb[1] && ol && olSin && ol.outline[0] !== 'none' && parseFloat(ol.outline[1]) >= 2, 'Oscuro: con el teclado, el día enfocado muestra su contorno: ' + JSON.stringify(ol && ol.outline) + ' ' + kb.join(' '));
    t.eq(ol && ol.outline, olSin && olSin.outline, 'Oscuro: el contorno del foco es el de siempre');
    await p.evaluate(() => document.activeElement.blur());

    // Las ventanas: el filete en capas de fondo (cuatro tiras y un arco por esquina), el borde
    // transparente y las esquinas de siempre.
    await go(p, 'programar');
    const VEN = () => { const e = document.querySelector('#applyMount .cp-ccard'), s = getComputedStyle(e);
      return { bordes: [s.borderTopColor, s.borderRightColor, s.borderBottomColor, s.borderLeftColor], bg: s.backgroundImage, radio: s.borderTopLeftRadius + ' ' + s.borderBottomRightRadius }; };
    const ven = await p.evaluate(VEN); await hoja(p, false); const venSin = await p.evaluate(VEN); await hoja(p, true);
    const arco = (ven.bg.match(/radial-gradient\([^()]*(\([^()]*\)[^()]*)*\)/) || [''])[0], ca = colores(arco).filter(conTinte);
    t.ok(ven.bordes.every(transparente) && (ven.bg.match(/radial-gradient/g) || []).length === 4 && ca.length && dTono(tono(ca[0]), tono(r2)) <= 20,
      'Oscuro: la ventana «Programar una rutina nueva» lleva el filete en el fondo (arco de arriba a la izquierda con el tono de --gize-r2): ' + ven.bg.slice(0, 160));
    t.eq(ven.radio, venSin.radio, 'Oscuro: la ventana conserva sus esquinas (' + venSin.radio + ')');
    // Al deslizar adentro de la ventana el filete queda en su lugar (un ::after se iría con el contenido).
    await p.evaluate(() => { const e = document.querySelector('#applyMount .cp-ccard'), d = document.createElement('div'); d.id = 'nnLargo'; d.style.height = '1600px'; e.appendChild(d); });
    await wait(200);
    const cv = await caja(p, '#applyMount .cp-ccard'), tira = { x: cv.x, y: cv.y + 16, w: 1, h: 8 };
    const [v0] = await pixeles(p, [{ k: 'mancha', r: tira }]);
    await p.evaluate(() => { document.querySelector('#applyMount .cp-ccard').scrollTop = 500; }); await wait(200);
    const [v1] = await pixeles(p, [{ k: 'mancha', r: tira }]);
    t.ok(await p.evaluate(() => document.querySelector('#applyMount .cp-ccard').scrollTop) > 0 && croma(v0) > 15 && croma(v1) > 15 && Math.max(...v0.map((c, i) => Math.abs(c - v1[i]))) < 12,
      'Oscuro: al deslizar en la ventana el filete de la izquierda sigue ahí: ' + v0.map(Math.round) + ' → ' + v1.map(Math.round));
    await p.evaluate(() => { const d = document.getElementById('nnLargo'); if (d) d.remove(); });
    // «Asignar rutina»: los días de la rutina (.ap-day) tampoco recortan su filete ni su resplandor.
    await go(p, 'editor');
    await p.evaluate(() => { const b = document.querySelector('[data-coach="rt-apply"]'); if (b) b.click(); }); await wait(700);
    await p.evaluate(() => { const b = document.querySelector('#applyMount .cp-copt'); if (b) b.click(); }); await wait(700);
    if (await p.$('#applyMount .ap-day')) {
      const ra = await recortan(p);
      t.ok(ra.n >= 2 && !ra.malos.length, 'Oscuro, «Asignar rutina»: los días no recortan su filete ni su resplandor (' + ra.n + '): ' + ra.malos.slice(0, 4).join(' | '));
    } else t.ok(false, 'Oscuro: no se abrió «Asignar rutina»');
    // La ficha de Chat del panel lateral (la única que se toca): el filete, más claro que el de las otras.
    await go(p, 'clientes'); await p.mouse.move(1436, 896); await wait(250);
    const chat = await leer(p, '.cv-peek button.cv-tile'), ficha = await leer(p, '.cv-peek .cv-tile:not(button)');
    t.ok(conNeon(chat) && chat.bordes.every(transparente) && conNeon(ficha) && fuerza(chat.after.bg) > fuerza(ficha.after.bg) + .3,
      'Oscuro: la ficha de Chat lleva el filete, más claro que el de las otras fichas: ' + (chat && chat.after ? chat.after.bg.slice(0, 100) : 'sin ::after'));

    // Nada se mueve: las mismas cajas con la hoja prendida y apagada, en cada vista.
    for (const vista of ['inicio', 'clientes', 'editor', 'fin', 'menu', 'mas', 'programar', 'config', 'rutinas']){
      await go(p, vista); await p.mouse.move(1436, 896); await wait(300);
      const d = await seMueve(p);
      t.eq(d.slice(0, 4), [], 'Oscuro, compu, ' + vista + ': nada cambia de lugar ni de tamaño con el neón (' + d.length + ')');
    }
    // El contraste de los textos no baja.
    await go(p, 'editor'); await p.mouse.move(1436, 896); await wait(250);
    await contrasteIgual(t, p, 'Oscuro, editor', [['días', '.co-daytab'], ['«Se repite»', '.hd-day'], ['«+ Programar una rutina nueva»', '.co-sched-new'],
      ['pestañas de la ficha', '.cv-ctab'], ['barra lateral', '.cv-side .cv-nav-i, .cv-side .cv-util-i']]);
    await go(p, 'clientes'); await p.mouse.move(1436, 896); await wait(250);
    await contrasteIgual(t, p, 'Oscuro, clientes', [['panel lateral', '.cv-peek-rt small, .cv-tile span, .cv-tile b'], ['«Copiar código»', '.co-copy-btn']]);
    await go(p, 'menu'); await p.mouse.move(1436, 896); await wait(250);
    await contrasteIgual(t, p, 'Oscuro, menú ⋯', [['menú ⋯', '.co-exc-open .co-pop-item']]);
    await go(p, 'mas'); await p.mouse.move(1436, 896); await wait(250);
    await contrasteIgual(t, p, 'Oscuro, Más opciones', [['Reps / Tiempo', '.co-exc-open .co-seg-opt']]);
    t.eq(errs, [], 'Oscuro, compu: errores de la página');
    await close();
  }

  // ---- «Oscuro», celular ----
  {
    const { p, errs, close } = await abrir(base, { vp: M, touch: true });
    await p.goto(base + '/app/'); await wait(3500); await quietas(p);
    await go(p, 'editor');
    for (const [n, sel, on] of QUE_CEL.editor){
      const v = await leer(p, sel);
      t.ok(conNeon(v), 'Oscuro, celular: ' + n + ' lleva el filete de neón: ' + (v && v.after ? v.after.bg.slice(0, 100) : 'sin ::after'));
      t.eq(brillo(v), !!on, 'Oscuro, celular: ' + n + (on ? ' (elegido) tiene' : ' no tiene') + ' resplandor');
    }
    // La pestaña del día elegida está en una fila con scroll: el resplandor va por dentro (no se corta).
    const dia = await leer(p, '.co-daytab.on');
    t.ok(dia && dia.before && /inset/.test(dia.before.sh) && tinte(dia.before.sh), 'Oscuro, celular: el resplandor del día elegido va por dentro de la pestaña: ' + (dia && dia.before && dia.before.sh.slice(0, 90)));
    for (const vista of ['inicio', 'clientes', 'editor', 'fin', 'menu', 'config']){
      await go(p, vista); await wait(300);
      const d = await seMueve(p);
      t.eq(d.slice(0, 4), [], 'Oscuro, celular, ' + vista + ': nada cambia de lugar ni de tamaño con el neón (' + d.length + ')');
    }
    await go(p, 'editor');
    await contrasteIgual(t, p, 'Oscuro, celular, editor', [['barra de abajo', '.cv-nav-i'], ['franja de arriba', '.cv-util-i'], ['días', '.co-daytab'], ['«Se repite»', '.hd-day']]);
    t.eq(errs, [], 'Oscuro, celular: errores de la página');
    await close();
  }

  // ---- Neón apagado: el filete blanco y gris, lo elegido más claro, sin resplandor ----
  for (const [vp, nombre] of [[D, 'compu'], [M, 'celular']]){
    const { p, errs, close } = await abrir(base, { vp, neon: false, touch: vp === M });
    await p.goto(base + '/app/'); await wait(3500);
    t.ok(await p.evaluate(() => document.documentElement.classList.contains('sin-neon')), 'sin neón (' + nombre + '): html.sin-neon');
    const resto = [], elegidos = [];
    const vistas = vp === D ? QUE : QUE_CEL;
    for (const vista of Object.keys(vistas)){
      await go(p, vista); if (vp === D) await p.mouse.move(1436, 896); await wait(250);
      for (const [n, sel, on] of vistas[vista]){
        const v = await leer(p, sel);
        if (!v) { t.ok(false, 'sin neón (' + nombre + '): no se vio ' + n); continue; }
        t.ok(gris(v), 'sin neón (' + nombre + '): ' + n + ' lleva el filete blanco y gris (160°, sin color): ' + (v.after ? v.after.bg.slice(0, 120) : 'sin ::after'));
        t.ok(!brillo(v), 'sin neón (' + nombre + '): ' + n + ' sin resplandor de color');
        if (v.after) (on ? elegidos : resto).push(fuerza(v.after.bg));
      }
    }
    t.ok(Math.min(...elegidos) > Math.max(...resto), 'sin neón (' + nombre + '): lo elegido tiene el filete más claro');
    if (vp === D){
      await go(p, 'editor'); await p.mouse.move(1436, 896);
      for (const sel of ['.co-daytab.add', '.co-rt-add-end']){ const v = await leer(p, sel); t.ok(v.estilo === 'dashed' && !v.bordes.some(c => colores(c).some(conTinte)), 'sin neón: ' + sel + ' punteado gris: ' + v.bordes.join(' / ')); }
      const raya = await p.evaluate(() => getComputedStyle(document.querySelector('.cv-ctab.on'), '::after').backgroundImage);
      t.eq(raya, 'none', 'sin neón: la rayita de la pestaña elegida queda como siempre (sin degradé)');
      await go(p, 'programar');
      const ven = await leer(p, '#applyMount .cp-ccard');
      t.ok(ven && !ven.bordes.some(c => colores(c).some(conTinte)), 'sin neón: la ventana sin color en el borde: ' + (ven && ven.bordes.join(' / ')));
      await go(p, 'editor'); await p.mouse.move(1436, 896);
      const d = await seMueve(p);
      t.eq(d.slice(0, 4), [], 'sin neón, editor: nada cambia de lugar ni de tamaño (' + d.length + ')');
    }
    t.eq(errs, [], 'sin neón (' + nombre + '): errores de la página');
    await close();
  }

  // ---- La app del alumno: la hoja no cambia nada ----
  for (const [nombre, init] of [['Oscuro', ''], ['Claro', TEMA.claro], ['Azul', TEMA.azul], ['sin neón', "localStorage.setItem('gize_neon','0');"]]){
    const { p, errs, close } = await newPage({ user: ALUMNO, viewport: M, touch: true, handlers: { '/profiles': profile('client') },
      state: { days: [{ id: 'd1', name: 'Pierna', dias: [1], exercises: [{ id: 'a1', name: 'Sentadilla', sets: [{ id: 's1', kg: '', reps: '' }] }] }], sessions: [], weights: [], daily: {} },
      init: "localStorage.setItem('gize_lite','0');" + init });
    await p.goto(base + '/app/'); await wait(3500);
    t.ok(!await p.evaluate(() => document.body.classList.contains('silk-coach')), 'alumno (' + nombre + '): no es el panel del coach');
    t.eq((await sinCambios(p)).slice(0, 5), [], 'alumno (' + nombre + '): el neón del panel no cambia nada');
    await p.click('#nav-config').catch(() => {}); await wait(500);
    t.eq((await sinCambios(p)).slice(0, 5), [], 'alumno (' + nombre + '), Ajustes: el neón del panel no cambia nada');
    t.eq(errs, [], 'alumno (' + nombre + '): errores de la página');
    await close();
  }
}
