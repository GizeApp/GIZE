// Entreno → «Iniciar entrenamiento»: pedido que no sea verde sino de neón (borde con la gama
// RGB girando y resplandor de colores). Con movimiento reducido el borde queda quieto.
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

const SHOT = process.env.SHOT_DIR;

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
      return { anyGreen: [cs.backgroundColor, cs.borderTopColor, cs.color, icon].filter(green), shadow: cs.boxShadow, anim: be.animationName, ring: be.backgroundImage };
    });
    t.eq(m.anyGreen, [], reducedMotion + ': nada verde (fondo, borde, texto, ícono)');
    t.ok(m.ring.includes('conic-gradient'), reducedMotion + ': el borde es la gama de neón');
    t.ok(m.shadow.split('rgb').length > 3, reducedMotion + ': tiene resplandor de colores');
    t.eq(m.anim, reducedMotion === 'reduce' ? 'none' : 'gize-spin', reducedMotion + ': el borde gira (o queda quieto con movimiento reducido)');
    if (SHOT && reducedMotion !== 'reduce') await btn.screenshot({ path: SHOT + '/boton-iniciar.png' });
    if (SHOT && reducedMotion !== 'reduce') await p.screenshot({ path: SHOT + '/entreno.png' });
    await btn.click(); await wait(400);
    t.ok(!(await p.$('[data-action="wk-start"]')), reducedMotion + ': tocarlo arranca el entreno');
    t.eq(errs, [], reducedMotion + ': errores de la página');
    await close();
  }
}
