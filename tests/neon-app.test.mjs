// La app del alumno con un poco del neón del panel del coach (css/ui/neon-app.css). El dueño:
// «quiero que traslades la estética de un poco de los neones brillosos a la app común y la apliques
// en la estética que ya está ahora».
// - El mismo filete del panel (un degradé a 155° con máscara, el color de la marca en las puntas, sale
//   de --gize-r1 / --gize-r2) solo en la portada del día (un poco más claro que las tarjetas) y en lo
//   elegido (el día, la pestaña de la barra de abajo, la variante, la categoría y el día de la semana),
//   claro y con un resplandor suave y quieto: por dentro en las filas con scroll, por fuera en la barra.
// - Lo demás, con los cantos de color, sin máscara (sombras de adentro sin desenfoque: una línea fina
//   y dos medialunas, violeta arriba a la izquierda y azul abajo a la derecha): los otros días, las
//   categorías y los días de la semana, y toda la familia de los botones secundarios que está en la
//   app («Limpiar», «Iniciar descanso», el tiempo de descanso, «Cerrar» y «Cancelar» de las ventanas,
//   «Agregar con nombre propio», «Cerrar sesión», «+ Agregar ejercicio», «Ver rutinas armadas»,
//   agregar día, «Editar meta», «+500 ml», la meta de agua): dos botones iguales quedan iguales. Al
//   pasar el mouse, más claros.
// - Las ventanas propias (#335): la opción elegida del selector lleva lo de lo elegido; «Cancelar» de
//   las preguntas y del selector, los cantos; el campo de pedir() con foco suma el resplandor.
// - Lo que se repite no suma capas con máscara: con 4 ejercicios abiertos, las mismas máscaras que con
//   ninguno.
// - Lo pintado: el resplandor del día elegido y el de la pestaña de abajo se ven en la captura.
// - Las tarjetas y las filas ya tenían el filete tenue (la semana del bloque, «Rutina asignada por tu
//   coach», los ejercicios, la nota del coach) y los principales son blancos: la hoja no los toca.
// - El punteado («+ Serie», el «+» entre ejercicios) en dos tonos de la marca.
// - Los campos con foco conservan su borde y su aro y suman el resplandor de la marca.
// - No se mueve nada (las mismas cajas con y sin la hoja, en cada pantalla), nada recorta el filete ni
//   el resplandor y los textos se leen igual (contraste medido contra el fondo real).
// - Las otras apariencias, sin neón, liviano, la app de Android, GIZE básico, «reducir movimiento» y
//   colores forzados: en tests/neon-app-temas.test.mjs. Lo común, en tests/neon-app-comun.mjs.
import { wait } from './lib.mjs';
import { leer, colores, conTinte, tinte, fuerza, tono, dTono, hex, conNeon, brillo, transparente, seMueve, contrasteIgual, recortan, pixeles, caja, croma, hoja } from './coach-neon-comun.mjs';
import { D, M, abrir, ir, HOJA_APP, QUE, QUE_PROPIA, cantos, YA, PRINCIPALES, PINTA, ZONA, ZONA_RECORTE } from './neon-app-comun.mjs';

export default async function ({ base, t }){
  const h = HOJA_APP;
  // Revisa cada cosa de una lista: el filete (lo elegido y la portada) o los cantos (lo demás), el
  // borde que toman, las puntas y el resplandor.
  const revisar = async (p, donde, lista, r1, r2, fuerzas) => {
    for (const [n, sel, como] of lista){
      const v = await leer(p, sel);
      if (!v) { t.ok(false, donde + ': no se vio ' + n + ' (' + sel + ')'); continue; }
      if (v.estilo !== 'none' && v.ancho > 0) t.ok(v.bordes.every(transparente), donde + ': ' + n + ': el neón toma el lugar del borde (transparente): ' + v.bordes[0]);
      if (como) {
        t.ok(conNeon(v), donde + ': ' + n + ' lleva el filete de neón (::after con máscara, 155°, con color): ' + (v.after ? v.after.bg.slice(0, 130) : 'sin ::after'));
        if (conNeon(v)) {
          const cs = colores(v.after.bg);
          t.ok(dTono(tono(cs[0]), tono(r2)) <= 20 && dTono(tono(cs[cs.length - 1]), tono(r1)) <= 20, donde + ': ' + n + ': las puntas tienen el tono de --gize-r2 y --gize-r1');
          if (fuerzas) (fuerzas[como] = fuerzas[como] || []).push(fuerza(v.after.bg));
        }
      } else {
        const c = cantos(v);
        t.ok(c.ok && dTono(tono(c.a), tono(r2)) <= 20 && dTono(tono(c.b), tono(r1)) <= 20, donde + ': ' + n + ' lleva los cantos de color (sin máscara; violeta arriba a la izquierda, azul abajo a la derecha, con el tono de --gize-r2 y --gize-r1): ' + v.sombra.slice(0, 160));
        t.ok(!v.after || !v.after.mask || v.after.mask === 'none', donde + ': ' + n + ': sin capa con máscara');
      }
      t.eq(brillo(v), como === 'on', donde + ': ' + n + (como === 'on' ? ' (elegido) tiene' : ' no tiene') + ' resplandor suave: ' + (v.before ? v.before.sh.slice(0, 90) : 'sin ::before'));
      if (v.before && como === 'on') t.ok(v.before.anim === 'none', donde + ': el resplandor de ' + n + ' está quieto');
    }
  };

  // ---- «Oscuro», celular, la rutina del coach ----
  {
    const { p, errs, close } = await abrir(base);
    await p.goto(base + '/app/'); await wait(3500);
    t.ok(await p.evaluate(() => { const l = [...document.querySelectorAll('link[rel="stylesheet"]')].map(x => x.getAttribute('href'));
      return l[l.length - 1] === 'css/ui/neon-app.css' && l[l.length - 2] === 'css/screens/coach/neon.css'; }), 'app/index.html carga css/ui/neon-app.css al final, después del neón del panel');
    const [r1, r2] = (await p.evaluate(() => ['--gize-r1', '--gize-r2'].map(k => getComputedStyle(document.documentElement).getPropertyValue(k).trim()))).map(hex);
    const fuerzas = {};
    for (const vista of Object.keys(QUE)){ await ir(p, vista); await revisar(p, 'Oscuro, ' + vista, QUE[vista], r1, r2, fuerzas); }
    const max = k => Math.max(...(fuerzas[k] || [0])), min = k => Math.min(...(fuerzas[k] || [99]));
    t.ok(min('on') > max('hi') + .3, 'Oscuro: el filete de la portada (' + max('hi').toFixed(2) + ') es más tenue que el de lo elegido (' + min('on').toFixed(2) + ')');
    // El resplandor: por dentro en el día elegido (la fila de los días tiene scroll y lo cortaría), por
    // fuera en la pestaña de la barra.
    await ir(p, 'entreno');
    const dia = await leer(p, '.tabs .tab.active'), pes = await leer(p, '.nav-item.active');
    t.ok(dia.before && /inset/.test(dia.before.sh) && tinte(dia.before.sh), 'Oscuro: el resplandor del día elegido va por dentro: ' + (dia.before && dia.before.sh.slice(0, 90)));
    t.ok(pes.before && !/inset/.test(pes.before.sh) && tinte(pes.before.sh), 'Oscuro: el de la pestaña de la barra, por fuera: ' + (pes.before && pes.before.sh.slice(0, 90)));
    t.ok(await p.evaluate(() => { const s = getComputedStyle(document.querySelector('.tabs .tab.active'), '::before');
      return s.transitionDuration.split(',').every(d => parseFloat(d) === 0) && s.position === 'absolute' && s.zIndex === '-1'; }), 'Oscuro: el resplandor del día no se anima y va debajo del texto');
    // Lo pintado: el borde de adentro del día elegido y el anillo de afuera de la pestaña de la barra.
    const cd = await caja(p, '.tabs .tab.active'), cn = await caja(p, '.nav-item.active');
    const jobs = [{ k: 'mancha', r: { x: cd.x + 2, y: cd.y + 8, w: 4, h: cd.h - 16 } }, { k: 'mancha', r: { x: cd.x + cd.w - 6, y: cd.y + 8, w: 4, h: cd.h - 16 } }, { k: 'anillo', r: cn }];
    const pc = await pixeles(p, jobs); await hoja(p, false, h); const ps = await pixeles(p, jobs); await hoja(p, true, h);
    t.ok(croma(pc[0]) > croma(ps[0]) + 8 && croma(pc[1]) > croma(ps[1]) + 8, 'Oscuro: adentro del día elegido se ve el resplandor (croma de los bordes de adentro ' +
      croma(ps[0]).toFixed(1) + '/' + croma(ps[1]).toFixed(1) + ' → ' + croma(pc[0]).toFixed(1) + '/' + croma(pc[1]).toFixed(1) + ')');
    t.ok(pc[2] > ps[2] + 3, 'Oscuro: alrededor de la pestaña elegida de la barra se ve el resplandor (croma del anillo de afuera ' + ps[2].toFixed(1) + ' → ' + pc[2].toFixed(1) + ')');
    // Las tarjetas y filas ya tenían el filete tenue; los principales quedan como estaban.
    for (const [n, sel] of YA){
      const v = await p.evaluate(PINTA, sel); await hoja(p, false, h); const v0 = await p.evaluate(PINTA, sel); await hoja(p, true, h);
      t.ok(v && /linear-gradient\(155deg/.test(v.join(' ')) && tinte(v.join(' ')), 'Oscuro: ' + n + ' ya lleva el filete tenue con el toque de color: ' + (v ? v[0].slice(0, 120) : 'no se vio'));
      t.eq(v, v0, 'Oscuro: ' + n + ': la hoja no lo cambia');
    }
    for (const [n, sel] of PRINCIPALES){
      const v = await p.evaluate(PINTA, sel); await hoja(p, false, h); const v0 = await p.evaluate(PINTA, sel); await hoja(p, true, h);
      t.ok(v && JSON.stringify(v) === JSON.stringify(v0), 'Oscuro: ' + n + ' (principal, blanco) queda como estaba');
    }
    // El campo con foco: su borde y su aro de siempre, y el resplandor de la marca.
    await ir(p, 'ejercicio');
    await p.focus('.card[data-ex-id="a1"] .field input.kg'); await wait(300);
    const f = await leer(p, '.card[data-ex-id="a1"] .field input.kg'); await hoja(p, false, h); await wait(300);
    const f0 = await leer(p, '.card[data-ex-id="a1"] .field input.kg'); await hoja(p, true, h); await wait(300);
    t.eq(f.bordes[0], f0.bordes[0], 'Oscuro: el campo con foco conserva su borde (' + f0.bordes[0] + ')');
    t.ok(f0.sombra !== 'none' && f.sombra.startsWith(f0.sombra) && tinte(f.sombra.slice(f0.sombra.length)), 'Oscuro: el campo con foco conserva su aro (' + f0.sombra.slice(0, 60) + ') y suma el resplandor: ' + f.sombra.slice(f0.sombra.length, f0.sombra.length + 90));
    await p.evaluate(() => document.activeElement.blur());
    // El campo de una pregunta propia (pedir(), app/ui/avisos.js): su contorno de foco de siempre y el
    // resplandor de la marca.
    await ir(p, 'entreno'); p.contestar = null;
    await p.evaluate(() => { window.pedir('¿Cómo se llama el día?', { valor: 'Torso' }); }); await wait(700);
    await p.focus('.av-bg .av-in'); await wait(300);
    const pf = await leer(p, '.av-bg .av-in'); await hoja(p, false, h); await wait(300);
    const pf0 = await leer(p, '.av-bg .av-in'); await hoja(p, true, h); await wait(300);
    t.ok(pf0.outline[0] !== 'none' && pf.outline.join() === pf0.outline.join() && pf.bordes[0] === pf0.bordes[0], 'Oscuro: el campo de una pregunta propia con foco conserva su contorno y su borde (' + pf0.outline.join(' ') + ')');
    t.ok(!tinte(pf0.sombra) && tinte(pf.sombra), 'Oscuro: y suma el resplandor de la marca: ' + pf.sombra.slice(0, 90));
    await p.click('.av-bg .av-sec'); p.contestar = true; await wait(500);
    // No se mueve nada, nada recorta el filete ni el resplandor y los textos se leen igual.
    for (const vista of ['entreno', 'ejercicio', 'variantes', 'ajustes', 'habitos', 'cardio', 'comida', 'progreso', 'pregunta', 'selector']){
      await ir(p, vista);
      const d = await seMueve(p, h);
      t.eq(d.slice(0, 4), [], 'Oscuro, ' + vista + ': nada cambia de lugar ni de tamaño con el neón (' + d.length + ')');
      if (QUE[vista]) { const rc = await recortan(p, { h, zona: ZONA_RECORTE });
        t.ok(rc.n >= QUE[vista].filter(x => x[2]).length && !rc.malos.length, 'Oscuro, ' + vista + ': nada con el filete sobre el borde o el resplandor de afuera recorta lo de adentro (' + rc.n + '): ' + rc.malos.slice(0, 4).join(' | ')); }
    }
    // Lo que se repite no suma capas con máscara (cuestan al pintar y al volver a dibujar Entreno cada
    // vez que se marca una serie): con los 4 ejercicios abiertos, las mismas que con ninguno.
    await ir(p, 'entreno');
    const MASCARAS = () => [...document.querySelectorAll('body *')].filter(e => e.getClientRects().length).reduce((n, e) => n + ['::before', '::after']
      .filter(ps => { const s = getComputedStyle(e, ps); return s.content !== 'none' && (s.maskImage || s.webkitMaskImage || 'none') !== 'none'; }).length, 0);
    const abiertos = ids => p.evaluate(async ids => { const e = await import('/app/screens/entreno.js'), m = await import('/app/main.js');
      e.expandedOverride.clear(); ids.forEach(i => e.expandedOverride.add(i)); m.renderApp(); }, ids).then(() => wait(400));
    await abiertos([]); const m0 = await p.evaluate(MASCARAS);
    await abiertos(['a1', 'a2', 'a3', 'a4']); const m4 = await p.evaluate(MASCARAS), botones = await p.evaluate(() => document.querySelectorAll('.card .rest-btn-full, .card .rest-edit').length);
    await hoja(p, false, h); const m4s = await p.evaluate(MASCARAS); await hoja(p, true, h);
    t.ok(botones >= 8 && m4 === m0 && m4 - m4s <= 3, 'Oscuro: con 4 ejercicios abiertos (' + botones + ' botones de descanso) no se suman capas con máscara: ' + m0 + ' → ' + m4 + ' (sin la hoja, ' + m4s + ')');
    await abiertos([]);
    await ir(p, 'entreno');
    await contrasteIgual(t, p, 'Oscuro, Entreno', [['días', '.tabs .tab'], ['nombre del día', '.day-head .day-name'], ['«Limpiar»', '.day-head .clear'], ['barra de abajo', '.nav-item']], { h, zona: ZONA });
    await ir(p, 'variantes');
    await contrasteIgual(t, p, 'Oscuro, variantes', [['variantes', '.var-sheet .var-pick .vp-n'], ['«Cerrar»', '.var-sheet .ctrl.ghost']], { h, zona: ZONA });
    await ir(p, 'selector');
    await contrasteIgual(t, p, 'Oscuro, selector', [['opciones', '.sl-bg .sl-op'], ['«Cancelar»', '.sl-bg .sl-x']], { h, zona: ZONA });
    await ir(p, 'entreno');
    t.eq(errs, [], 'Oscuro, celular: errores de la página');
    await close();
  }

  // ---- «Oscuro», celular, la rutina propia: «+ Agregar ejercicio», el buscador y los días de la semana ----
  {
    const { p, errs, close } = await abrir(base, { coach: false });
    await p.goto(base + '/app/'); await wait(3500);
    const [r1, r2] = (await p.evaluate(() => ['--gize-r1', '--gize-r2'].map(k => getComputedStyle(document.documentElement).getPropertyValue(k).trim()))).map(hex);
    for (const vista of Object.keys(QUE_PROPIA)){
      await ir(p, vista); await revisar(p, 'rutina propia, ' + vista, QUE_PROPIA[vista], r1, r2);
      const d = await seMueve(p, h);
      t.eq(d.slice(0, 4), [], 'rutina propia, ' + vista + ': nada cambia de lugar ni de tamaño con el neón (' + d.length + ')');
      const rc = await recortan(p, { h, zona: ZONA_RECORTE });
      t.ok(!rc.malos.length, 'rutina propia, ' + vista + ': nada recorta el filete ni el resplandor: ' + rc.malos.slice(0, 4).join(' | '));
    }
    // El punteado: «+ Serie» y el «+» entre ejercicios, en dos tonos de la marca (violeta arriba, azul abajo).
    await ir(p, 'ejercicio');
    for (const [n, sel] of [['«+ Serie»', '.card[data-ex-id="a1"] .add-set'], ['el «+» entre ejercicios', '.ins-ex']]){
      const v = await leer(p, sel), [top, , bottom] = v ? v.bordes.map(c => colores(c)[0]) : [];
      t.ok(v && v.estilo === 'dashed' && conTinte(top) && conTinte(bottom) && dTono(tono(top), tono(r2)) <= 20 && dTono(tono(bottom), tono(r1)) <= 20,
        'rutina propia: ' + n + ', punteado de neón: ' + (v ? v.bordes.join(' / ') : 'no se vio'));
    }
    t.eq(errs, [], 'rutina propia: errores de la página');
    await close();
  }

  // ---- «Oscuro», compu: al pasar el mouse, el filete se aclara ----
  {
    const { p, errs, close } = await abrir(base, { vp: D });
    await p.goto(base + '/app/'); await wait(3500);
    await p.mouse.move(5, 895); await wait(200);
    const sel = '.tabs .tab:not(.active)';
    const quieto = await leer(p, sel);
    await p.hover(sel); await wait(250);
    const encima = await leer(p, sel);
    t.ok(cantos(quieto).ok && cantos(encima).ok && fuerza(encima.sombra) > fuerza(quieto.sombra) + .3, 'compu: al pasar el mouse por un día, los cantos se aclaran: ' + encima.sombra.slice(0, 120));
    t.ok(!brillo(encima), 'compu: al pasar el mouse no suma resplandor (es solo de lo elegido)');
    const lim0 = await leer(p, '.day-head .clear');
    await p.hover('.day-head .clear'); await wait(250);
    const lim = await leer(p, '.day-head .clear');
    t.ok(cantos(lim).ok && fuerza(lim.sombra) > fuerza(lim0.sombra) + .3, 'compu: al pasar el mouse por «Limpiar», los cantos se aclaran');
    await p.mouse.move(5, 895); await wait(200);
    const d = await seMueve(p, h);
    t.eq(d.slice(0, 4), [], 'compu: nada cambia de lugar ni de tamaño con el neón (' + d.length + ')');
    t.eq(errs, [], 'compu: errores de la página');
    await close();
  }
}
