// Entreno → «Iniciar entrenamiento»: pedido que no sea verde. Con la apariencia tranquila
// (css/ui/calma.css) es un botón principal relleno (blanco en «Oscuro») con el filete fino de un
// toque de color en el borde, quieto (con o sin movimiento reducido) y con una sombra neutra, sin
// resplandor de colores.
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

const SHOT = process.env.SHOT_DIR;

// ¿Hay algún color con tinte (no gris) en este valor de CSS? rgb()/rgba() y color(srgb …), que es
// como sale un color-mix() calculado; canales de 0 a 255.
const colores = v => (String(v || '').match(/rgba?\([^)]*\)|color\(srgb[^)]*\)/g) || []).map(c => {
  const n = c.replace('srgb', '').match(/[\d.]+/g).map(Number);
  return c.startsWith('color') ? n.slice(0, 3).map(x => x * 255).concat(n.slice(3)) : n;
}).filter(([r, g, b, a]) => a === undefined || a > 0);
const conTinte = v => colores(v).some(([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b) > 24);

export default async function ({ base, t }){
  const days = [{ id: 'd1', name: 'Torso', exercises: [
    { id: 'e1', name: 'Press de banca plano (barra)', sets: [{ id: 's1', kg: '', reps: '' }] }] }];
  for (const reducedMotion of ['no-preference', 'reduce']){
    const { p, errs, close } = await newPage({ user: ALUMNO, reducedMotion, state: { days, sessions: [], weights: [], daily: {} },
      handlers: { '/profiles': profile('client') } });
    await p.goto(base + '/app/'); await wait(2500);
    const btn = await p.$('[data-action="wk-start"]');
    t.ok(!!btn, reducedMotion + ': está el botón');
    if (!btn){ await close(); continue; }
    const m = await p.evaluate(() => {
      const b = document.querySelector('.wk-start'), cs = getComputedStyle(b), be = getComputedStyle(b, '::before');
      // Verde = el canal G le gana por mucho al rojo y al azul.
      const green = c => { const [r, g, bl] = (c.match(/[\d.]+/g) || []).map(Number); return g > r + 40 && g > bl + 40; };
      const icon = getComputedStyle(b.querySelector('svg')).color;
      const glow = [cs.textShadow, getComputedStyle(b.querySelector('svg')).filter];
      return { glow, anyGreen: [cs.backgroundColor, cs.borderTopColor, cs.color, icon].filter(green), bg: cs.backgroundColor, shadow: cs.boxShadow, anim: be.animationName, ring: be.backgroundImage };
    });
    t.eq(m.anyGreen, [], reducedMotion + ': nada verde (fondo, borde, texto, ícono)');
    t.eq(m.glow, ['none', 'none'], reducedMotion + ': las letras y el ícono sin brillo de neón');
    t.eq(m.bg, 'rgb(255, 255, 255)', reducedMotion + ': relleno blanco, como los botones principales');
    t.ok(/linear-gradient\(155deg/.test(m.ring) && !m.ring.includes('conic-gradient') && conTinte(m.ring), reducedMotion + ': el borde es el filete fino con un toque de color, no la gama de neón: ' + m.ring.slice(0, 60));
    t.ok(m.shadow !== 'none' && !conTinte(m.shadow), reducedMotion + ': sombra neutra, sin resplandor de colores: ' + m.shadow);
    t.eq(m.anim, 'none', reducedMotion + ': el borde queda quieto (no gira)');
    if (SHOT && reducedMotion !== 'reduce') await btn.screenshot({ path: SHOT + '/boton-iniciar.png' });
    if (SHOT && reducedMotion !== 'reduce') await p.screenshot({ path: SHOT + '/entreno.png' });
    await btn.click(); await wait(400);
    t.ok(!(await p.$('[data-action="wk-start"]')), reducedMotion + ': tocarlo arranca el entreno');
    t.eq(errs, [], reducedMotion + ': errores de la página');
    await close();
  }
}
