// Panel del coach: el mismo ahorro de batería que la app del alumno y el interruptor de «Neón».
// - La apariencia tranquila (css/ui/calma.css) también en el panel: fondo liso con el degradé de la
//   apariencia (sin manchas de color y sin partículas: el canvas está oculto y nunca se dibuja),
//   bordes con el filete fino de un toque de color (linear-gradient a 155°, ya no la gama RGB en
//   conic-gradient), nada gira y sin brillos de colores (solo sombras neutras).
// - Nada en pantalla gira ni late sin parar.
// - A los ~6 s sin tocar se pone html.fondo-quieto y se saca al deslizar adentro de #coachHost (que
//   tiene su propio scroll, no el del documento); el fondo sigue sin dibujarse.
// - Con la app en segundo plano ("pause") no se dibuja y las animaciones se frenan.
// - Con el neón apagado (gize_neon = "0") ningún borde ni brillo del panel lleva color (queda el
//   azul de acción y el rojo de borrar). El interruptor («Toque de color en los bordes») está en
//   Configuración y cambia html.sin-neon.
import { newPage, wait } from './lib.mjs';

const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
const A1 = '44444444-4444-4444-4444-444444444444';
const SPY = `window.__arc = 0; { const o = CanvasRenderingContext2D.prototype.arc;
  CanvasRenderingContext2D.prototype.arc = function () { window.__arc++; return o.apply(this, arguments); }; }`;

const open = init => newPage({ user: COACH, viewport: { width: 390, height: 844 }, init: `localStorage.setItem('gize_lite','0');${SPY}${init || ''}`,
  handlers: {
    '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
      if (/coach_id=eq/.test(i.url.search)) return J([{ id: A1, full_name: 'Ana Alumna' }]); return J(i.one ? me : [me]); },
    '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
  } });

// El fondo: el degradé de la apariencia (calculado con un elemento de prueba), las manchas de la
// aurora, el canvas de partículas y cuántas veces se dibujó.
const fondo = () => {
  const ref = document.createElement('div'); ref.style.background = 'var(--gize-calm-bg)'; document.body.appendChild(ref);
  const calm = getComputedStyle(ref).backgroundImage; ref.remove();
  const a = document.querySelector('.app-aurora');
  return { calm, bg: getComputedStyle(a).backgroundImage, spans: [...a.querySelectorAll('span')].map(s => getComputedStyle(s).display),
    canvas: getComputedStyle(document.getElementById('silkCanvas')).display, arc: window.__arc };
};

// Lo que se ve: animaciones sin fin y lo que gira (en toda la página); y en el panel, la gama RGB
// (conic-gradient), los brillos de color, los filetes y los bordes/brillos/degradés con color.
const scan = () => {
  // Colores de un valor de CSS en 0–255: rgb()/rgba() y color(srgb …), que es como sale un
  // color-mix() calculado. Los casi transparentes no cuentan.
  const colores = v => (String(v || '').match(/rgba?\([^)]*\)|color\(srgb[^)]*\)/g) || []).map(c => {
    const n = c.replace('srgb', '').match(/[\d.]+/g).map(Number);
    return c.startsWith('color') ? n.slice(0, 3).map(x => x * 255).concat(n.slice(3)) : n;
  }).filter(([, , , a = 1]) => a > 0.05);
  const tinte = (v, u) => colores(v).some(([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b) > u);
  const sat = v => tinte(v, 70); // color de verdad (la gama, el azul de acción), no un gris azulado
  const FILETE = /linear-gradient\(155deg/;
  const name = (e, ps) => String(e.className && e.className.baseVal === undefined ? e.className : e.tagName).trim().split(/\s+/)[0] + (ps || '');
  const inf = new Set(), spin = new Set(), conic = new Set(), brillos = new Set(), neon = new Set(), filete = [];
  document.querySelectorAll('*').forEach(e => {
    if (!e.getClientRects().length) return; // no se ve: no anima
    for (const ps of [null, '::before', '::after']){
      const s = getComputedStyle(e, ps);
      if (ps && s.content === 'none') continue;
      const n = name(e, ps);
      if (s.animationName !== 'none' && s.animationIterationCount === 'infinite' && s.animationPlayState !== 'paused') inf.add(n + ':' + s.animationName);
      if (/spin/i.test(s.animationName)) spin.add(n + ':' + s.animationName);
      if (/conic-gradient/.test(s.backgroundImage)) conic.add(n);
      if (!e.closest('#coachHost')) continue;
      // El filete fino: un toque de color en la punta y el resto neutro (blanco translúcido en las
      // apariencias oscuras, rgba(11,13,17,…) en «Claro»); quieto.
      if (FILETE.test(s.backgroundImage)){
        const f = s.backgroundImage.slice(s.backgroundImage.search(FILETE));
        filete.push({ n, toque: tinte(f, 24), neutro: /rgba\((255, 255, 255|11, 13, 17), 0?\.\d+\)/.test(f), anim: s.animationName });
        if (s.animationName !== 'none') spin.add(n + ':' + s.animationName);
      }
      // Brillos: box-shadow, text-shadow y drop-shadow sin ningún color con tinte (sombras neutras).
      for (const k of ['boxShadow', 'textShadow', 'filter']) if (tinte(s[k], 24)) brillos.add(n + ' ' + k + ': ' + s[k]);
      // Con el neón apagado no debería quedar ningún borde, brillo ni degradé con color. El rojo de
      // borrar no es neón: se deja.
      if (e.closest('.cfg-danger')) continue;
      if (/conic-gradient/.test(s.backgroundImage) || sat(s.boxShadow) || sat(s.backgroundImage) ||
          (sat(s.borderTopColor) && s.borderTopWidth !== '0px' && s.borderTopStyle !== 'none')) neon.add(n);
    }
  });
  neon.delete('co-tabs::after'); // la rayita azul de la pestaña elegida: color de acción, no neón
  return { inf: [...inf], spin: [...spin], conic: [...conic], brillos: [...brillos], neon: [...neon], filete };
};

export default async function ({ base, t }){
  // La apariencia tranquila (neón prendido): filetes quietos con un toque de color, sin la gama ni brillos.
  const calma = (s, donde, conFilete = true) => {
    t.eq(s.conic, [], donde + ': nada con la gama RGB (conic-gradient)');
    t.eq(s.spin, [], donde + ': nada gira (los bordes quedan quietos)');
    t.eq(s.brillos, [], donde + ': sin brillos de colores (box-shadow, text-shadow, drop-shadow)');
    if (conFilete) t.ok(s.filete.length > 0 && s.filete.every(f => f.toque && f.neutro && f.anim === 'none'),
      donde + ': los bordes son el filete fino con un toque de color: ' + JSON.stringify(s.filete.slice(0, 4)));
  };

  // ---- Neón prendido (apariencia tranquila): ahorro de batería en el panel ----
  {
    // «Azul» antes tenía partículas; ahora, como todas las apariencias, va con fondo liso en degradé.
    const { p, errs, close } = await open("localStorage.setItem('gize_tema','azul');");
    await p.goto(base + '/app/'); await wait(3500);
    t.ok(await p.$('#coachHost .co-wrap'), 'se ve el panel del coach');
    const f0 = await p.evaluate(fondo); await wait(400);
    t.ok(/^linear-gradient\(/.test(f0.calm) && f0.bg === f0.calm && !/radial-gradient/.test(f0.bg), 'el fondo del panel es el degradé liso de la apariencia: ' + f0.bg.slice(0, 70));
    t.ok(f0.spans.length > 0 && f0.spans.every(d => d === 'none'), 'sin las manchas de color de la aurora: ' + JSON.stringify(f0.spans));
    t.eq([f0.canvas, f0.arc, (await p.evaluate(() => window.__arc)) - f0.arc], ['none', 0, 0], 'sin partículas: el canvas oculto y nunca se dibuja');
    const s0 = await p.evaluate(scan);
    t.eq(s0.inf, [], 'lista: nada gira ni late sin parar');
    calma(s0, 'lista');
    await p.click(`[data-coach="open"][data-id="${A1}"]`); await wait(1200);
    const s1 = await p.evaluate(scan);
    t.eq(s1.inf, [], 'ficha: nada gira ni late sin parar');
    calma(s1, 'ficha');

    // ~6 s sin tocar: html.fondo-quieto (el fondo sigue sin dibujarse).
    await wait(6500);
    const q = await p.evaluate(() => ({ cls: document.documentElement.classList.contains('fondo-quieto'), arc: window.__arc }));
    await wait(600);
    t.ok(q.cls, 'panel sin tocar: html.fondo-quieto');
    t.eq([q.arc, (await p.evaluate(() => window.__arc)) - q.arc], [0, 0], 'panel sin tocar: el fondo no se dibuja');

    // Deslizar adentro de #coachHost (scroll propio, no el del documento) saca html.fondo-quieto.
    await p.evaluate(() => { const h = document.getElementById('coachHost'), d = document.createElement('div'); d.style.height = '3000px'; h.appendChild(d); h.scrollTop = 300; });
    await wait(500);
    const w = await p.evaluate(() => ({ cls: document.documentElement.classList.contains('fondo-quieto'), arc: window.__arc, top: document.getElementById('coachHost').scrollTop, doc: scrollY }));
    t.ok(w.top > 0 && w.doc === 0, 'el scroll es el de #coachHost: ' + JSON.stringify(w));
    t.eq([w.cls, w.arc - q.arc], [false, 0], 'al deslizar en el panel sale de html.fondo-quieto y el fondo sigue sin dibujarse');

    // Segundo plano.
    await p.evaluate(() => document.dispatchEvent(new Event('pause'))); await wait(200);
    const a0 = await p.evaluate(() => window.__arc); await wait(500);
    t.eq([(await p.evaluate(() => window.__arc)) - a0, await p.evaluate(() => document.documentElement.classList.contains('app-pausada'))], [0, true],
      'panel en segundo plano: no se dibuja y las animaciones se frenan');
    await p.evaluate(() => document.dispatchEvent(new Event('resume')));

    // Las pestañas de la ficha también tranquilas.
    for (const tab of ['rutina', 'plan']){
      await p.click(`[data-coach="client-tab"][data-t="${tab}"]`); await wait(600);
      const s = await p.evaluate(scan);
      t.eq(s.inf, [], 'pestaña ' + tab + ': nada gira ni late sin parar');
      calma(s, 'pestaña ' + tab, false);
    }
    t.eq(await p.evaluate(() => window.__arc), 0, 'en todo el recorrido el fondo nunca se dibujó');
    t.eq(errs, [], 'errores de la página');
    await close();
  }

  // ---- Neón apagado: el panel sobrio, y el interruptor en Configuración ----
  {
    const { p, errs, close } = await open(`localStorage.setItem('gize_neon','0');`);
    await p.goto(base + '/app/'); await wait(3500);
    t.ok(await p.evaluate(() => document.documentElement.classList.contains('sin-neon')), 'gize_neon = 0 → html.sin-neon');
    const f = await p.evaluate(fondo);
    t.ok(/^linear-gradient\(/.test(f.calm) && f.bg === f.calm, 'sin neón: el fondo también es el degradé liso: ' + f.bg.slice(0, 70));
    t.eq([f.canvas, f.arc], ['none', 0], 'sin neón: sin partículas');
    const s0 = await p.evaluate(scan);
    t.eq(s0.neon, [], 'sin neón: la lista no tiene bordes ni brillos de colores');
    t.eq(s0.filete, [], 'sin neón: la lista sin el filete de color (blanco y gris)');
    await p.click(`[data-coach="open"][data-id="${A1}"]`); await wait(1200);
    t.eq((await p.evaluate(scan)).neon, [], 'sin neón: la ficha no tiene bordes ni brillos de colores');
    for (const tab of ['rutina', 'plan']){
      await p.click(`[data-coach="client-tab"][data-t="${tab}"]`); await wait(600);
      t.eq((await p.evaluate(scan)).neon, [], 'sin neón: pestaña ' + tab + ' sin bordes ni brillos de colores');
    }
    await p.click('[data-coach="open-settings"]'); await wait(800);
    const sw = await p.$('#coachHost [data-neon-toggle], [data-neon-toggle]');
    t.ok(!!sw, 'Configuración del coach tiene el interruptor de Neón');
    if (sw){
      t.has(await p.evaluate(() => { const e = document.querySelector('[data-neon-toggle]').closest('.cs-neon, .cs-field'); return e ? e.textContent : ''; }),
        'Toque de color en los bordes', 'el interruptor dice qué hace');
      t.eq(await sw.getAttribute('aria-checked'), 'false', 'el interruptor arranca apagado');
      await sw.click(); await wait(200);
      t.eq(await p.evaluate(() => [document.documentElement.classList.contains('sin-neon'), localStorage.getItem('gize_neon')]), [false, null], 'prenderlo saca html.sin-neon');
      calma(await p.evaluate(scan), 'neón prendido desde Configuración');
      await sw.click(); await wait(200);
      t.eq(await p.evaluate(() => [document.documentElement.classList.contains('sin-neon'), localStorage.getItem('gize_neon')]), [true, '0'], 'apagarlo pone html.sin-neon y queda guardado');
      t.eq((await p.evaluate(scan)).filete, [], 'apagado otra vez: sin el filete de color');
    }
    t.eq(errs, [], 'sin neón: errores de la página');
    await close();
  }
}
