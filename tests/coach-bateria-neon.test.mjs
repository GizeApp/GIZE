// Panel del coach: el mismo ahorro de batería que la app del alumno y el interruptor de «Neón».
// - Nada en pantalla gira ni late sin parar.
// - El fondo queda quieto a los ~6 s sin tocar y sigue al deslizar adentro de #coachHost (que
//   tiene su propio scroll, no el del documento).
// - Con la app en segundo plano ("pause") no se dibuja.
// - Con el neón apagado (gize_neon = "0") ningún borde ni brillo del panel lleva la gama de
//   colores (queda el azul de acción). El interruptor está en Configuración y cambia html.sin-neon.
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

// Animaciones sin fin en lo que se ve, y bordes/brillos/degradés con color (no grises) en el panel.
const scan = () => {
  const sat = s => (s.match(/rgba?\([^)]*\)/g) || []).some(c => { const [r, g, b, a = 1] = c.match(/[\d.]+/g).map(Number); return a > 0.05 && Math.max(r, g, b) - Math.min(r, g, b) > 70; });
  const name = (e, ps) => String(e.className && e.className.baseVal === undefined ? e.className : e.tagName).trim().split(/\s+/)[0] + (ps || '');
  const inf = new Set(), neon = new Set();
  document.querySelectorAll('*').forEach(e => {
    if (!e.getClientRects().length) return; // no se ve: no anima
    for (const ps of [null, '::before', '::after']){
      const s = getComputedStyle(e, ps);
      if (s.animationName !== 'none' && s.animationIterationCount === 'infinite' && s.animationPlayState !== 'paused') inf.add(name(e, ps) + ':' + s.animationName);
      if (!e.closest('#coachHost')) continue;
      if (/conic-gradient/.test(s.backgroundImage) || sat(s.boxShadow) || sat(s.backgroundImage) ||
          (sat(s.borderTopColor) && s.borderTopWidth !== '0px' && s.borderTopStyle !== 'none')) neon.add(name(e, ps));
    }
  });
  neon.delete('co-tabs::after'); // la rayita azul de la pestaña elegida: color de acción, no neón
  return { inf: [...inf], neon: [...neon] };
};

export default async function ({ base, t }){
  // ---- Neón prendido: ahorro de batería en el panel ----
  {
    const { p, errs, close } = await open();
    await p.goto(base + '/app/'); await wait(3500);
    t.ok(await p.$('#coachHost .co-wrap'), 'se ve el panel del coach');
    const s0 = await p.evaluate(scan);
    t.eq(s0.inf, [], 'lista: nada gira ni late sin parar');
    t.ok(s0.neon.length > 0, 'con neón el panel tiene bordes/brillos de colores');
    await p.click(`[data-coach="open"][data-id="${A1}"]`); await wait(1200);
    t.eq((await p.evaluate(scan)).inf, [], 'ficha: nada gira ni late sin parar');

    // ~6 s sin tocar: el fondo queda quieto.
    await wait(6500);
    const q = await p.evaluate(() => ({ cls: document.documentElement.classList.contains('fondo-quieto'), arc: window.__arc }));
    await wait(600);
    t.ok(q.cls, 'panel sin tocar: html.fondo-quieto');
    t.eq((await p.evaluate(() => window.__arc)) - q.arc, 0, 'panel sin tocar: el fondo no se redibuja');

    // Deslizar adentro de #coachHost (scroll propio, no el del documento) lo despierta.
    await p.evaluate(() => { const h = document.getElementById('coachHost'), d = document.createElement('div'); d.style.height = '3000px'; h.appendChild(d); h.scrollTop = 300; });
    await wait(500);
    const w = await p.evaluate(() => ({ cls: document.documentElement.classList.contains('fondo-quieto'), arc: window.__arc, top: document.getElementById('coachHost').scrollTop, doc: scrollY }));
    t.ok(w.top > 0 && w.doc === 0, 'el scroll es el de #coachHost: ' + JSON.stringify(w));
    t.ok(!w.cls && w.arc > q.arc, 'al deslizar en el panel, el fondo vuelve a moverse');

    // Segundo plano.
    await p.evaluate(() => document.dispatchEvent(new Event('pause'))); await wait(200);
    const a0 = await p.evaluate(() => window.__arc); await wait(500);
    t.eq([(await p.evaluate(() => window.__arc)) - a0, await p.evaluate(() => document.documentElement.classList.contains('app-pausada'))], [0, true],
      'panel en segundo plano: no se dibuja y las animaciones se frenan');
    await p.evaluate(() => document.dispatchEvent(new Event('resume')));
    t.eq(errs, [], 'errores de la página');
    await close();
  }

  // ---- Neón apagado: el panel sobrio, y el interruptor en Configuración ----
  {
    const { p, errs, close } = await open(`localStorage.setItem('gize_neon','0');`);
    await p.goto(base + '/app/'); await wait(3500);
    t.ok(await p.evaluate(() => document.documentElement.classList.contains('sin-neon')), 'gize_neon = 0 → html.sin-neon');
    t.eq((await p.evaluate(scan)).neon, [], 'sin neón: la lista no tiene bordes ni brillos de colores');
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
      t.eq(await sw.getAttribute('aria-checked'), 'false', 'el interruptor arranca apagado');
      await sw.click(); await wait(200);
      t.eq(await p.evaluate(() => [document.documentElement.classList.contains('sin-neon'), localStorage.getItem('gize_neon')]), [false, null], 'prenderlo saca html.sin-neon');
      await sw.click(); await wait(200);
      t.eq(await p.evaluate(() => [document.documentElement.classList.contains('sin-neon'), localStorage.getItem('gize_neon')]), [true, '0'], 'apagarlo pone html.sin-neon y queda guardado');
    }
    t.eq(errs, [], 'sin neón: errores de la página');
    await close();
  }
}
