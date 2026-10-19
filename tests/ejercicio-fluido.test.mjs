// Entreno fluido (video del 19/10: «al abrir un ejercicio el panel del día hace un pop-up que queda
// muy tosco; debe ir todo mucho más fluido»). Antes cada toque redibujaba toda la pantalla: la
// portada del día repetía su entrada (opacidad 0 y vuelta a subir), el ejercicio que se cerraba
// quedaba invisible antes del redibujo y, si se cerraba otro más arriba, el que se tocó saltaba.
// Ahora se redibuja en el lugar (app/ui/parche.js) y abrir/cerrar se anima (app/ui/desplegar.js).
// Se mira cuadro por cuadro (requestAnimationFrame) lo que se ve mientras pasa.
import { newPage, wait, saved, ALUMNO, perfil, profile, CON_COACH } from './lib.mjs';

const sets = (pre, n, tg) => Array.from({ length: n }, (_, i) => ({ id: pre + i, kg: '', reps: '', target: tg }));
const DAYS = [
  { id: 'd1', name: 'Hombro', note: 'Día opcional', exercises: [
    { id: 'e1', name: 'Vuelos laterales con mancuernas', sets: sets('a', 6, '8-12') },
    { id: 'e2', name: 'Press militar con barra', sets: sets('b', 6, '8-12') },
    { id: 'e3', name: 'Remo al mentón', sets: sets('c', 6, '10') },
    { id: 'e4', name: 'Face pull', sets: sets('d', 6, '12') },
    { id: 'e5', name: 'Pájaros en banco', sets: sets('f', 6, '12') },
    { id: 'e6', name: 'Encogimientos con mancuernas', sets: sets('g', 6, '12') }] },
  { id: 'd2', name: 'Pierna', note: 'Bajá lento', exercises: [
    { id: 'p1', name: 'Sentadilla libre', sets: sets('p', 3, '8') },
    { id: 'p2', name: 'Prensa 45°', sets: sets('q', 3, '10') }] }];
const st0 = () => ({ days: JSON.parse(JSON.stringify(DAYS)), regularDays: JSON.parse(JSON.stringify(DAYS)), routineMode: 'regular', sessions: [], weights: [], daily: {} });
const handlers = { '/profiles': perfil('client', CON_COACH), '/routines': (r, J, i) => i.m === 'GET' ? J(i.one ? { days: DAYS } : [{ days: DAYS }]) : undefined };

// Muestreo por cuadro: el ejercicio id (fila, card o la card que se está cerrando), la portada y
// cuántos ejercicios hay en pantalla.
const empezar = (p, id) => p.evaluate(id => {
  window.__f = []; window.__on = true;
  const nodo = () => document.querySelector('#view .card[data-ex-id="' + id + '"], #view .ex-collapsed[data-ex="' + id + '"]')
    || [...document.querySelectorAll('#view .card.ex-anim')].find(c => c.querySelector('[data-ex="' + id + '"]'));
  const loop = () => {
    if (!window.__on) return;
    const n = nodo(), dh = document.querySelector('#view .day-head'), cs = dh && getComputedStyle(dh);
    const r = n && n.getBoundingClientRect();
    window.__f.push({ hay: !!n, op: n ? +getComputedStyle(n).opacity : 0, top: r ? r.top : null, h: r ? r.height : 0,
      dhOp: cs ? +cs.opacity : 0, dhTf: cs ? cs.transform : '', ejercicios: document.querySelectorAll('#view .card[data-ex-id], #view .ex-collapsed, #view .card.ex-anim').length });
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}, id);
const parar = async p => { await wait(650); return p.evaluate(() => { window.__on = false; return window.__f; }); };
// Muestreo por cuadro de dónde está el ejercicio id (fila o card) y si hay una animación en curso.
const seguir = (p, id) => p.evaluate(id => {
  window.__g = []; window.__gon = true;
  const loop = () => { if (!window.__gon) return;
    const n = document.querySelector('#view .ex-collapsed[data-ex="' + id + '"], #view .card[data-ex-id="' + id + '"]');
    window.__g.push({ anim: !!document.querySelector('#view .ex-anim'), y: n ? n.getBoundingClientRect().top : null });
    requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}, id);
const juntar = async (p, ms = 800) => { await wait(ms); return p.evaluate(() => { window.__gon = false; return window.__g; }); };
// Al cambiar la card que se achicó por su fila (último cuadro animado → primero quieto), lo de abajo
// no se mueve; y mientras se cierra, lo de abajo solo sube.
const salto = g => { const i = g.findIndex((x, k) => k > 0 && g[k - 1].anim && !x.anim); return i > 0 ? Math.abs(g[i].y - g[i - 1].y) : NaN; };
const soloSube = g => g.every((x, k) => k === 0 || x.y <= g[k - 1].y + 0.5);
const subida = g => g.map(x => Math.round(x.y) + (x.anim ? '*' : '')).filter((x, k, l) => k === 0 || x !== l[k - 1]).join(' ');
const sinPop = f => f.every(x => x.dhOp === 1 && (x.dhTf === 'none' || x.dhTf === ''));
const intermedios = (f, a, b) => f.filter(x => x.h > Math.min(a, b) + 4 && x.h < Math.max(a, b) - 4).length;

export default async function ({ base, t }){
  // ---- Abrir y cerrar: sin cuadro en blanco, sin «pop» de la portada, animado y en el lugar ----
  {
    const { p, errs, close } = await newPage({ user: ALUMNO, state: st0(), handlers, touch: true, init: () => { try { localStorage.setItem('gize_lite', '0'); } catch (e) {} } });
    await p.goto(base + '/app/'); await wait(2500);
    t.ok(await p.$('.coach-banner'), 'rutina del coach (como en el video)');
    // Marca los nodos de la portada y de otro ejercicio: si se redibujara todo, se perderían.
    await p.evaluate(() => { document.querySelector('#view .day-head').__marca = 1; document.querySelector('#view .ex-collapsed[data-ex="e2"]').__marca = 1; });
    const h0 = await p.$eval('#view .ex-collapsed[data-ex="e1"]', n => n.getBoundingClientRect().height);

    await empezar(p, 'e1');
    await p.tap('#view .ex-collapsed[data-ex="e1"]');
    let f = await parar(p);
    const h1 = await p.$eval('#view .card[data-ex-id="e1"]', n => n.getBoundingClientRect().height);
    t.ok(f.length > 5, 'abrir: hay cuadros muestreados (' + f.length + ')');
    t.ok(f.every(x => x.hay && x.op > 0.95), 'abrir: el ejercicio se ve en todos los cuadros (nunca desaparece)');
    t.ok(f.every(x => x.ejercicios === 6), 'abrir: la lista entera sigue en pantalla en todos los cuadros');
    t.ok(sinPop(f), 'abrir: la portada del día no se mueve ni se apaga');
    t.ok(intermedios(f, h0, h1) >= 2, 'abrir: crece de a poco (' + intermedios(f, h0, h1) + ' cuadros intermedios entre ' + Math.round(h0) + ' y ' + Math.round(h1) + ' px)');
    t.ok(Math.max(...f.map(x => Math.abs(x.top - f[0].top))) <= 1, 'abrir: la fila tocada no se mueve');
    t.eq(await p.evaluate(() => [!!document.querySelector('#view .day-head').__marca, !!document.querySelector('#view .ex-collapsed[data-ex="e2"]').__marca]), [true, true],
      'abrir: la portada y los otros ejercicios son los mismos nodos (no se redibujó todo)');
    t.eq(await p.$$eval('#view .ex-anim, #view .card[style]', l => l.map(n => n.outerHTML.slice(0, 160))), [], 'al terminar no queda nada de la animación');

    // Lo escrito sobrevive a cerrar y volver a abrir.
    await p.fill('#view input.kg[data-set="a0"]', '12,5');
    await p.fill('#view input.reps[data-set="a0"]', '10');
    await empezar(p, 'e1');
    await p.tap('#view .card[data-ex-id="e1"] [data-action="ex-collapse"]');
    f = await parar(p);
    t.ok(await p.$('#view .ex-collapsed[data-ex="e1"]'), 'cerrar: queda la fila');
    t.ok(f.every(x => x.hay && x.op > 0.95), 'cerrar: el ejercicio no se vuelve invisible (antes quedaba en blanco)');
    t.ok(f.every(x => x.ejercicios === 6), 'cerrar: la lista entera sigue en pantalla en todos los cuadros');
    t.ok(sinPop(f), 'cerrar: la portada del día no se mueve ni se apaga');
    t.ok(intermedios(f, h0, h1) >= 2, 'cerrar: se achica de a poco (' + intermedios(f, h0, h1) + ' cuadros intermedios)');
    t.ok(Math.max(...f.map(x => Math.abs(x.top - f[0].top))) <= 1, 'cerrar: el ejercicio no se mueve de lugar');
    await p.tap('#view .ex-collapsed[data-ex="e1"]'); await wait(500);
    t.eq(await p.evaluate(() => [document.querySelector('#view input.kg[data-set="a0"]').value, document.querySelector('#view input.reps[data-set="a0"]').value]), ['12,5', '10'],
      'lo escrito (kg y reps) sigue ahí después de cerrar y abrir');
    const s = (await saved(p)).days[0].exercises[0].sets[0];
    t.eq([s.kg, s.reps], ['12,5', '10'], 'y quedó guardado');

    // El redibujo en el lugar no deja un valor viejo en un campo si el dato cambió por otro lado.
    await p.evaluate(async () => {
      const { state } = await import('/app/core/state.js'), m = await import('/app/main.js');
      state.days[0].exercises[0].sets[0].kg = ''; m.renderApp();
    });
    t.eq(await p.$eval('#view input.kg[data-set="a0"]', i => i.value), '', 'si el kg cambia por otro lado, el campo muestra el valor nuevo');

    // Abrir una ventana (variantes) no redibuja la pantalla de abajo.
    await p.evaluate(() => { document.querySelector('#view .card[data-ex-id="e1"]').__marca = 1; });
    await p.tap('#view .card[data-ex-id="e1"] [data-action="ex-variants"]'); await wait(400);
    t.ok(await p.$('#sheetHost .var-sheet'), 'se abre la ventana de variantes');
    t.ok(await p.evaluate(() => !!document.querySelector('#view .card[data-ex-id="e1"]').__marca && !!document.querySelector('#view .day-head').__marca),
      'abrir la ventana no vuelve a crear el ejercicio ni la portada');
    await p.tap('#sheetHost .ctrl[data-action="var-cancel"]'); await wait(500);
    t.ok(await p.evaluate(() => !!document.querySelector('#view .card[data-ex-id="e1"]').__marca), 'cerrarla tampoco');

    // Tocar de nuevo a mitad de camino: se cierra desde el alto que tiene, sin saltar antes al final.
    // Además del alto, la opacidad del contenido y el giro de la flechita siguen desde como se ven
    // (antes el contenido volvía a verse entero un cuadro y la flecha volvía a apuntar arriba).
    const seq = await p.evaluate(() => new Promise(res => {
      const hs = [], ops = [], angs = []; let on = true, marca = -1;
      const nodo = () => document.querySelector('#view .card[data-ex-id="e3"], #view .ex-collapsed[data-ex="e3"], #view .card[data-ex-cerrando="e3"]');
      const mirar = () => { const n = nodo(); hs.push(n ? n.getBoundingClientRect().height : 0);
        const k = n && n.classList.contains('card') && [...n.children].find(x => !x.classList.contains('card-head')), f = n && n.querySelector('.card-head .ex-chev svg');
        ops.push(k ? +getComputedStyle(k).opacity : null); angs.push(f ? window.__angulo(f) : null); };
      window.__angulo = f => { const m = /^matrix\(([^,]+),\s*([^,]+)/.exec(getComputedStyle(f).transform); if (!m) return 0; const a = Math.atan2(+m[2], +m[1]) * 180 / Math.PI; return a < -90 ? a + 360 : a; };
      const loop = () => { if (!on) return; mirar(); requestAnimationFrame(loop); };
      document.querySelector('#view .ex-collapsed[data-ex="e3"]').click();
      requestAnimationFrame(loop);
      setTimeout(() => {
        marca = hs.length; mirar();
        document.querySelector('#view .card[data-ex-id="e3"] [data-action="ex-collapse"]').click();
        setTimeout(() => { on = false; res({ hs, ops, angs, marca }); }, 650);
      }, 110);
    }));
    const antesX = seq.hs[seq.marca], despuesX = seq.hs.slice(seq.marca + 1);
    t.ok(despuesX.length > 3 && Math.max(...despuesX) <= antesX + 2, 'a mitad de abrir, cerrar sigue desde ' + Math.round(antesX) + ' px (máximo después: ' + Math.round(Math.max(...despuesX)) + ')');
    const bajaSola = (l, tol) => l.every((x, k) => k === 0 || x == null || l[k - 1] == null || x <= l[k - 1] + tol);
    const opsX = seq.ops.slice(seq.marca), angsX = seq.angs.slice(seq.marca);
    t.ok(opsX[0] > 0.05 && opsX[0] < 0.95, 'a mitad de abrir el contenido se ve a medias (' + opsX[0] + ')');
    t.ok(bajaSola(opsX, 0.01), 'al cerrar a mitad de camino el contenido solo se va apagando: ' + opsX.filter(x => x != null).map(x => x.toFixed(2)).join(' '));
    t.ok(bajaSola(angsX, 1), 'y la flechita sigue girando desde donde estaba: ' + angsX.filter(x => x != null).map(x => Math.round(x)).join(' '));
    t.ok(await p.$('#view .ex-collapsed[data-ex="e3"]') && !(await p.$('#view .card.ex-anim')), 'y termina cerrado y sin restos de la animación');

    // Cerrar con la flechita y, a mitad del achique, abrir otro: la card que se cierra deja su lugar
    // y vuelve a la pantalla, sin que su contenido ni su flechita salten.
    await p.tap('#view .ex-collapsed[data-ex="e1"]'); await wait(500);
    const seq2 = await p.evaluate(() => new Promise(res => {
      const c = document.querySelector('#view .card[data-ex-id="e1"]'), k = [...c.children].find(x => !x.classList.contains('card-head')), f = c.querySelector('.card-head .ex-chev svg');
      const ops = [], angs = []; let on = true;
      const loop = () => { if (!on) return; if (c.isConnected){ ops.push(+getComputedStyle(k).opacity); angs.push(window.__angulo(f)); } requestAnimationFrame(loop); };
      c.querySelector('[data-action="ex-collapse"]').click();
      requestAnimationFrame(loop);
      setTimeout(() => document.querySelector('#view .ex-collapsed[data-ex="e3"]').click(), 120);
      setTimeout(() => { on = false; res({ ops, angs }); }, 700);
    }));
    t.ok(seq2.ops.length > 6 && bajaSola(seq2.ops, 0.01), 'cerrar y tocar otro a mitad de camino: el contenido no vuelve a verse: ' + seq2.ops.map(x => x.toFixed(2)).join(' '));
    t.ok(bajaSola(seq2.angs, 1), 'ni la flechita vuelve a apuntar arriba: ' + seq2.angs.map(x => Math.round(x)).join(' '));
    t.ok(await p.$('#view .ex-collapsed[data-ex="e1"]') && await p.$('#view .card[data-ex-id="e3"]') && !(await p.$('#view .ex-anim')), 'quedan el 1 cerrado y el 3 abierto, sin restos');
    await p.tap('#view .card[data-ex-id="e3"] [data-action="ex-collapse"]'); await wait(500);

    // Con el teclado: Enter en la fila abre y el foco pasa a la flechita de la card; Enter en la
    // flechita cierra y el foco vuelve a la fila (antes quedaba en la nada, <body>).
    const foco = () => p.evaluate(() => { const a = document.activeElement; return a ? (a.dataset.action || a.tagName) + ':' + (a.dataset.ex || '') : ''; });
    await p.focus('#view .ex-collapsed[data-ex="e2"]'); await p.keyboard.press('Enter'); await wait(500);
    t.eq(await foco(), 'ex-collapse:e2', 'Enter en la fila: abre y el foco queda en la flechita de la card');
    await p.keyboard.press('Enter'); await wait(500);
    t.ok(await p.$('#view .ex-collapsed[data-ex="e2"]'), 'Enter en la flechita: cierra');
    t.eq(await foco(), 'ex-expand:e2', 'y el foco vuelve a la fila');
    t.eq(errs, [], 'abrir y cerrar: errores de la página');
    await close();
  }

  // ---- Lo que tocó el dedo queda quieto: abrir uno de abajo cierra el de arriba ----
  {
    const { p, errs, close } = await newPage({ user: ALUMNO, state: st0(), handlers, touch: true, init: () => { try { localStorage.setItem('gize_lite', '0'); } catch (e) {} } });
    await p.goto(base + '/app/'); await wait(2500);
    await p.tap('#view .ex-collapsed[data-ex="e1"]'); await wait(500);
    // Baja hasta que la fila del 5 quede en el medio de la pantalla (la card del 1 queda arriba).
    await p.evaluate(() => { const r = document.querySelector('#view .ex-collapsed[data-ex="e5"]').getBoundingClientRect(); scrollBy(0, r.top - innerHeight / 2); });
    await wait(300);
    const y0 = await p.evaluate(() => scrollY);
    t.ok(y0 > 300, 'hay lugar para bajar (' + y0 + ' px)');
    await empezar(p, 'e5');
    await p.tap('#view .ex-collapsed[data-ex="e5"]');
    const f = await parar(p);
    t.ok(!(await p.$('#view .card[data-ex-id="e1"]')) && await p.$('#view .card[data-ex-id="e5"]'), 'se abrió el 5 y se cerró el 1');
    const mov = Math.max(...f.map(x => Math.abs(x.top - f[0].top)));
    t.ok(mov <= 2, 'el ejercicio tocado no salta aunque el de arriba se achique (se movió ' + mov.toFixed(1) + ' px; antes ~200)');
    t.ok(f.every(x => x.hay && x.op > 0.95), 'y se ve en todos los cuadros');
    // Tildar la primera serie cambia «Iniciar entrenamiento» por el reloj (la portada crece): el
    // ejercicio tampoco se corre.
    const ya = await p.$eval('#view .card[data-ex-id="e5"]', n => n.getBoundingClientRect().top);
    await p.tap('#view .card[data-ex-id="e5"] [data-action="toggle"][data-set="f0"]'); await wait(400);
    t.ok(await p.$('#view .day-head .wk-live'), 'arrancó el reloj del entreno');
    const yb = await p.$eval('#view .card[data-ex-id="e5"]', n => n.getBoundingClientRect().top);
    t.ok(Math.abs(yb - ya) <= 1, 'al tildar, el ejercicio queda quieto aunque la portada cambie (' + (yb - ya).toFixed(1) + ' px)');

    // Mientras se abre, la persona mueve la pantalla (rueda): manda el dedo. No se le pelea el
    // scroll cuadro a cuadro ni se lo vuelve atrás al final (antes se perdía la mitad o todo).
    for (const [tag, abierto, tocar, paso] of [['abrir uno', null, 'e3', 40], ['abrir otro (el de arriba se cierra)', 'e1', 'e6', 50]]){
      await p.evaluate(() => scrollTo(0, 0)); await wait(300);
      if (abierto){ await p.tap('#view .ex-collapsed[data-ex="' + abierto + '"]'); await wait(500);
        await p.evaluate(id => { const r = document.querySelector('#view .ex-collapsed[data-ex="' + id + '"]').getBoundingClientRect(); scrollBy(0, r.top - innerHeight / 2); }, tocar); }
      else await p.evaluate(() => scrollTo(0, 120));
      await wait(500);
      const y0 = await p.evaluate(() => scrollY);
      await p.evaluate(id => { window.__w = []; window.__won = true; const f = () => { if (!window.__won) return;
        const n = document.querySelector('#view .card[data-ex-id="' + id + '"], #view .ex-collapsed[data-ex="' + id + '"]'); window.__w.push(n ? n.getBoundingClientRect().top : null); requestAnimationFrame(f); }; requestAnimationFrame(f); }, tocar);
      await p.tap('#view .ex-collapsed[data-ex="' + tocar + '"]');
      await wait(40); await p.mouse.move(200, 600);
      for (let i = 0; i < 4; i++){ await p.mouse.wheel(0, paso); await wait(16); }
      await wait(900);
      const w = (await p.evaluate(() => { window.__won = false; return window.__w; })).filter(x => x != null);
      const y1 = await p.evaluate(() => scrollY), atras = Math.max(0, ...w.map((x, k) => k ? x - w[k - 1] : 0));
      t.ok(w[0] - w[w.length - 1] >= 3 * paso, tag + ' + rueda: el ejercicio subió con la rueda (' + Math.round(w[0] - w[w.length - 1]) + ' de ' + 4 * paso + ' px; scroll ' + y0 + ' → ' + y1 + ')');
      t.ok(atras <= 1, tag + ' + rueda: nunca vuelve para atrás (máximo ' + atras.toFixed(1) + ' px)');
      if (await p.$('#view .card[data-ex-id="' + tocar + '"] [data-action="ex-collapse"]')){ await p.tap('#view .card[data-ex-id="' + tocar + '"] [data-action="ex-collapse"]'); await wait(500); }
    }
    t.eq(errs, [], 'ancla: errores de la página');
    await close();
  }

  // ---- Cambiar de día con los chips: nunca en blanco ----
  {
    const { p, errs, close } = await newPage({ user: ALUMNO, state: st0(), handlers, touch: true, init: () => { try { localStorage.setItem('gize_lite', '0'); } catch (e) {} } });
    await p.goto(base + '/app/'); await wait(2500);
    await p.evaluate(() => {
      window.__f = []; window.__on = true;
      const loop = () => { if (!window.__on) return; const dh = document.querySelector('#view .day-head'), dn = document.querySelector('#view .daynotes');
        window.__f.push({ op: dh ? +getComputedStyle(dh).opacity : 0, n: document.querySelectorAll('#view .ex-collapsed').length, notas: dn ? dn.textContent.slice(-10) + ' ' + getComputedStyle(dn).transform : '' }); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    });
    await p.tap('#view .tab[data-day="d2"]');
    const f = await parar(p);
    t.eq(await p.$eval('#view .day-head .day-name', n => n.textContent.trim()), 'Pierna', 'cambió de día en el acto');
    t.ok(f.every(x => x.op >= 0.5), 'la portada nunca queda en blanco al cambiar de día (mínimo ' + Math.min(...f.map(x => x.op)) + ')');
    t.ok(f.every(x => x.n > 0), 'y siempre hay ejercicios en pantalla');
    // Las notas del día nuevo solo se deslizan con el resto: sin su entrada propia (subir 28 px y
    // agrandarse) encima del deslizamiento.
    const notas = f.filter(x => /Bajá lento/.test(x.notas));
    t.ok(notas.length > 3, 'las notas del día nuevo están en pantalla (' + notas.length + ' cuadros)');
    t.ok(notas.every(x => / none$/.test(x.notas)), 'las notas del día nuevo no hacen su entrada encima del deslizamiento: ' + [...new Set(notas.map(x => x.notas.replace(/^.* /, '')))].join(' | '));
    t.eq(errs, [], 'días: errores de la página');
    await close();
  }

  // ---- «Reducir movimiento» y modo liviano: sin animación (cambia de una vez, igual en el lugar) ----
  for (const [tag, opts] of [['reducir movimiento', { reducedMotion: 'reduce', init: () => { try { localStorage.setItem('gize_lite', '0'); } catch (e) {} } }],
    ['modo liviano', { init: () => { try { localStorage.setItem('gize_lite', '1'); } catch (e) {} } }]]){
    const { p, errs, close } = await newPage(Object.assign({ user: ALUMNO, state: st0(), handlers, touch: true }, opts));
    await p.goto(base + '/app/'); await wait(2500);
    if (tag === 'modo liviano') t.ok(await p.evaluate(() => document.documentElement.classList.contains('lite')), tag + ': está en modo liviano');
    await p.evaluate(() => { document.querySelector('#view .day-head').__marca = 1; document.querySelector('#view .ex-collapsed[data-ex="e2"]').__marca = 1; });
    const r = await p.evaluate(() => {
      document.querySelector('#view .ex-collapsed[data-ex="e1"]').click();
      const c = document.querySelector('#view .card[data-ex-id="e1"]');
      return { card: !!c, anim: document.querySelectorAll('#view .ex-anim').length, alto: c ? c.style.height : 'x' };
    });
    t.eq(r, { card: true, anim: 0, alto: '' }, tag + ': se abre de una, sin animación');
    const r2 = await p.evaluate(() => {
      document.querySelector('#view .card[data-ex-id="e1"] [data-action="ex-collapse"]').click();
      return { fila: !!document.querySelector('#view .ex-collapsed[data-ex="e1"]'), card: !!document.querySelector('#view .card[data-ex-id="e1"], #view .card.ex-anim') };
    });
    t.eq(r2, { fila: true, card: false }, tag + ': se cierra de una, sin animación');
    t.eq(await p.evaluate(() => [!!document.querySelector('#view .day-head').__marca, !!document.querySelector('#view .ex-collapsed[data-ex="e2"]').__marca]), [true, true],
      tag + ': también en el lugar (la portada y los otros ejercicios son los mismos nodos)');
    t.eq(errs, [], tag + ': errores de la página');
    await close();
  }
  // ---- Cerrar hasta el alto justo de la fila (rutina propia, sin coach) ----
  // La card que se cierra se achica hasta el alto de la fila que la reemplaza: una fila completada
  // (56 px) o de una superserie (46 px) no mide lo mismo que una común (48 px). Antes se achicaba
  // hasta el alto de la primera fila que hubiera y al cambiarla por la suya lo de abajo saltaba
  // 8 a 20 px. Y tildar la primera serie (la portada cambia al reloj y la app corre el scroll para
  // dejar quieto el ejercicio) no achica la barra de abajo como si fuera el dedo.
  {
    const S = (pre, n, kg) => Array.from({ length: n }, (_, i) => ({ id: pre + i, kg: kg || '', reps: kg ? '10' : '', target: '10' }));
    const dias = [{ id: 'd1', name: 'Pecho y tríceps', exercises: [
      { id: 'k1', name: 'Press plano', sets: S('k1_', 2, '40') },
      { id: 'k2', name: 'Press inclinado', sets: S('k2_', 3) },
      { id: 'k3', name: 'Aperturas', sets: S('k3_', 3) },
      { id: 'k4', name: 'Fondos', ss: true, sets: S('k4_', 3) },
      { id: 'k5', name: 'Flexiones', sets: S('k5_', 3) },
      { id: 'k6', name: 'Cruce de poleas', sets: S('k6_', 3) }] }];
    const { p, errs, close } = await newPage({ user: ALUMNO, state: { days: dias, sessions: [], weights: [], daily: {} }, handlers: { '/profiles': profile('client') }, touch: true,
      init: () => { try { localStorage.setItem('gize_lite', '0'); } catch (e) {} } });
    await p.goto(base + '/app/'); await wait(2500);
    t.ok(await p.$('#view textarea.day-name') && !(await p.$('.coach-banner')), 'rutina propia (nombre del día editable)');

    // En el lugar también con rutina propia: el alto que fitDayName le pone al nombre del día no
    // hace que la portada se cree de nuevo en cada toque.
    await p.evaluate(() => { document.querySelector('#view .day-head').__marca = 1; document.querySelector('#view .ex-collapsed[data-ex="k6"]').__marca = 1; });
    await p.tap('#view .ex-collapsed[data-ex="k3"]'); await wait(500);
    await p.tap('#view .card[data-ex-id="k3"] [data-action="ex-collapse"]'); await wait(500);
    t.eq(await p.evaluate(() => [!!document.querySelector('#view .day-head').__marca, !!document.querySelector('#view .ex-collapsed[data-ex="k6"]').__marca]), [true, true],
      'rutina propia: abrir y cerrar no vuelve a crear la portada ni los otros ejercicios');

    // Tildar la primera serie: la portada crece (reloj), el ejercicio queda quieto y la barra de
    // abajo no se achica (no hubo dedo).
    await p.tap('#view .ex-collapsed[data-ex="k1"]'); await wait(500);
    const n0 = await p.evaluate(() => document.querySelector('.navbar').classList.contains('compacta'));
    const c0 = await p.$eval('#view .card[data-ex-id="k1"]', n => n.getBoundingClientRect().top);
    await p.tap('#view .card[data-ex-id="k1"] [data-action="toggle"][data-set="k1_0"]'); await wait(500);
    const tras = await p.evaluate(() => ({ reloj: !!document.querySelector('#view .day-head .wk-live'), y: scrollY, compacta: document.querySelector('.navbar').classList.contains('compacta'),
      top: document.querySelector('#view .card[data-ex-id="k1"]').getBoundingClientRect().top }));
    t.ok(!n0 && tras.reloj && tras.y > 0, 'arrancó el reloj y la app corrió el scroll ' + tras.y + ' px para dejar quieto el ejercicio');
    t.ok(Math.abs(tras.top - c0) <= 1, 'el ejercicio quedó quieto (' + (tras.top - c0).toFixed(1) + ' px)');
    t.ok(!tras.compacta, 'la barra de abajo no se achicó sola al tildar');

    // (1) Completar el ejercicio 1 (los otros sin hacer): la tilde se ve en el acto, destella, se
    // cierra hasta el alto de la fila «Completado» y lo de abajo no salta al final.
    await seguir(p, 'k2');
    await p.tap('#view .card[data-ex-id="k1"] [data-action="toggle"][data-set="k1_1"]'); await wait(60);
    t.ok(await p.$('#view .card[data-ex-id="k1"] [data-set="k1_1"].done.on'), 'completar: la última tilde se ve en el acto (no recién al cerrarse)');
    let g = await juntar(p, 900);
    t.ok(await p.$('#view .ex-collapsed.ex-is-done[data-ex="k1"]'), 'completar: queda la fila «Completado»');
    t.ok(g.some(x => x.anim) && salto(g) <= 1.5, 'completar: lo de abajo no salta al cambiar la card por la fila (' + salto(g) + ' px): ' + subida(g));
    t.ok(soloSube(g), 'completar: lo de abajo solo sube: ' + subida(g));

    // (2) Cerrar uno sin hacer con la primera fila completada (la primera fila mide distinto).
    await p.tap('#view .ex-collapsed[data-ex="k2"]'); await wait(500);
    await seguir(p, 'k3');
    await p.tap('#view .card[data-ex-id="k2"] [data-action="ex-collapse"]');
    g = await juntar(p);
    t.ok(await p.$('#view .ex-collapsed[data-ex="k2"]:not(.ex-is-done)'), 'cerrar con la primera fila completada: queda la fila común');
    t.ok(g.some(x => x.anim) && salto(g) <= 1.5, 'cerrar con la primera fila completada: lo de abajo no salta al final (' + salto(g) + ' px): ' + subida(g));
    t.ok(soloSube(g), 'cerrar con la primera fila completada: lo de abajo solo sube: ' + subida(g));

    // (3) Cerrar una superserie (filas de 46 px adentro del grupo).
    await p.tap('#view .ex-collapsed[data-ex="k4"]'); await wait(500);
    t.ok(await p.$('#view .ss-group .card[data-ex-id="k4"]') && await p.$('#view .ss-group .card[data-ex-id="k5"]'), 'la superserie se abre entera');
    await seguir(p, 'k6');
    await p.tap('#view .card[data-ex-id="k4"] [data-action="ex-collapse"]');
    g = await juntar(p);
    t.ok(await p.$('#view .ss-group .ex-collapsed[data-ex="k4"]') && await p.$('#view .ss-group .ex-collapsed[data-ex="k5"]'), 'la superserie se cierra entera');
    t.ok(g.some(x => x.anim) && salto(g) <= 1.5, 'cerrar la superserie: lo de abajo no salta al final (' + salto(g) + ' px): ' + subida(g));
    t.ok(soloSube(g), 'cerrar la superserie: lo de abajo solo sube: ' + subida(g));
    t.eq(await p.$$eval('#view .ex-anim, #view .card[data-ex-cerrando], #view [inert]', l => l.length), 0, 'sin restos de la animación');
    t.eq(errs, [], 'alto de la fila: errores de la página');
    await close();
  }
}
