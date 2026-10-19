// Entreno fluido (video del 19/10: «al abrir un ejercicio el panel del día hace un pop-up que queda
// muy tosco; debe ir todo mucho más fluido»). Antes cada toque redibujaba toda la pantalla: la
// portada del día repetía su entrada (opacidad 0 y vuelta a subir), el ejercicio que se cerraba
// quedaba invisible antes del redibujo y, si se cerraba otro más arriba, el que se tocó saltaba.
// Ahora se redibuja en el lugar (app/ui/parche.js) y abrir/cerrar se anima (app/ui/desplegar.js).
// Se mira cuadro por cuadro (requestAnimationFrame) lo que se ve mientras pasa.
import { newPage, wait, saved, ALUMNO, perfil, CON_COACH } from './lib.mjs';

const sets = (pre, n, tg) => Array.from({ length: n }, (_, i) => ({ id: pre + i, kg: '', reps: '', target: tg }));
const DAYS = [
  { id: 'd1', name: 'Hombro', note: 'Día opcional', exercises: [
    { id: 'e1', name: 'Vuelos laterales con mancuernas', sets: sets('a', 6, '8-12') },
    { id: 'e2', name: 'Press militar con barra', sets: sets('b', 6, '8-12') },
    { id: 'e3', name: 'Remo al mentón', sets: sets('c', 6, '10') },
    { id: 'e4', name: 'Face pull', sets: sets('d', 6, '12') },
    { id: 'e5', name: 'Pájaros en banco', sets: sets('f', 6, '12') },
    { id: 'e6', name: 'Encogimientos con mancuernas', sets: sets('g', 6, '12') }] },
  { id: 'd2', name: 'Pierna', exercises: [
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
    const seq = await p.evaluate(() => new Promise(res => {
      const hs = []; let on = true, marca = -1;
      const nodo = () => document.querySelector('#view .card[data-ex-id="e3"], #view .ex-collapsed[data-ex="e3"], #view .card[data-ex-cerrando="e3"]');
      const loop = () => { if (!on) return; const n = nodo(); hs.push(n ? n.getBoundingClientRect().height : 0); requestAnimationFrame(loop); };
      document.querySelector('#view .ex-collapsed[data-ex="e3"]').click();
      requestAnimationFrame(loop);
      setTimeout(() => {
        const n = nodo(); marca = hs.length; hs.push(n.getBoundingClientRect().height);
        document.querySelector('#view .card[data-ex-id="e3"] [data-action="ex-collapse"]').click();
        setTimeout(() => { on = false; res({ hs, marca }); }, 650);
      }, 110);
    }));
    const antesX = seq.hs[seq.marca], despuesX = seq.hs.slice(seq.marca + 1);
    t.ok(despuesX.length > 3 && Math.max(...despuesX) <= antesX + 2, 'a mitad de abrir, cerrar sigue desde ' + Math.round(antesX) + ' px (máximo después: ' + Math.round(Math.max(...despuesX)) + ')');
    t.ok(await p.$('#view .ex-collapsed[data-ex="e3"]') && !(await p.$('#view .card.ex-anim')), 'y termina cerrado y sin restos de la animación');
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
    t.eq(errs, [], 'ancla: errores de la página');
    await close();
  }

  // ---- Cambiar de día con los chips: nunca en blanco ----
  {
    const { p, errs, close } = await newPage({ user: ALUMNO, state: st0(), handlers, touch: true, init: () => { try { localStorage.setItem('gize_lite', '0'); } catch (e) {} } });
    await p.goto(base + '/app/'); await wait(2500);
    await p.evaluate(() => {
      window.__f = []; window.__on = true;
      const loop = () => { if (!window.__on) return; const dh = document.querySelector('#view .day-head');
        window.__f.push({ op: dh ? +getComputedStyle(dh).opacity : 0, n: document.querySelectorAll('#view .ex-collapsed').length }); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    });
    await p.tap('#view .tab[data-day="d2"]');
    const f = await parar(p);
    t.eq(await p.$eval('#view .day-head .day-name', n => n.textContent.trim()), 'Pierna', 'cambió de día en el acto');
    t.ok(f.every(x => x.op >= 0.5), 'la portada nunca queda en blanco al cambiar de día (mínimo ' + Math.min(...f.map(x => x.op)) + ')');
    t.ok(f.every(x => x.n > 0), 'y siempre hay ejercicios en pantalla');
    t.eq(errs, [], 'días: errores de la página');
    await close();
  }

  // ---- «Reducir movimiento» y modo liviano: sin animación (cambia de una vez, igual en el lugar) ----
  for (const [tag, opts] of [['reducir movimiento', { reducedMotion: 'reduce', init: () => { try { localStorage.setItem('gize_lite', '0'); } catch (e) {} } }],
    ['modo liviano', { init: () => { try { localStorage.setItem('gize_lite', '1'); } catch (e) {} } }]]){
    const { p, errs, close } = await newPage(Object.assign({ user: ALUMNO, state: st0(), handlers, touch: true }, opts));
    await p.goto(base + '/app/'); await wait(2500);
    if (tag === 'modo liviano') t.ok(await p.evaluate(() => document.documentElement.classList.contains('lite')), tag + ': está en modo liviano');
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
    t.eq(errs, [], tag + ': errores de la página');
    await close();
  }
}
