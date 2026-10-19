// Entreno en curso: «Entrenando hace…», Finalizar y Cancelar como «Iniciar entrenamiento». Con la
// apariencia tranquila (css/ui/calma.css) llevan el filete fino con un toque de color en el borde
// (no la gama de neón), quieto, con una sombra neutra sin resplandor de colores y letras blancas.
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

const tinted = c => { const [r, g, b] = (c.match(/[\d.]+/g) || []).map(Number); return Math.max(r, g, b) - Math.min(r, g, b) > 40; };
// ¿Hay algún color con tinte (no gris) en este valor de CSS? rgb()/rgba() y color(srgb …), que es
// como sale un color-mix() calculado; canales de 0 a 255.
const colores = v => (String(v || '').match(/rgba?\([^)]*\)|color\(srgb[^)]*\)/g) || []).map(c => {
  const n = c.replace('srgb', '').match(/[\d.]+/g).map(Number);
  return c.startsWith('color') ? n.slice(0, 3).map(x => x * 255).concat(n.slice(3)) : n;
}).filter(([r, g, b, a]) => a === undefined || a > 0);
const conTinte = v => colores(v).some(([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b) > 24);

export default async function ({ base, t }){
  const days = [{ id: 'd1', name: 'Torso', exercises: [{ id: 'e1', name: 'Remo con barra', sets: [{ id: 's1', kg: '', reps: '' }] }] }];
  const { p, errs, close } = await newPage({ user: ALUMNO, state: { days, sessions: [], weights: [], daily: {} }, handlers: { '/profiles': profile('client') } });
  await p.goto(base + '/app/'); await wait(2500);
  await p.click('[data-action="wk-start"]'); await wait(400);
  const m = await p.evaluate(() => ['.wk-live', '.wk-finish', '.wk-cancel'].map(q => {
    const e = document.querySelector(q); if (!e) return null;
    const cs = getComputedStyle(e);
    return { q, ring: cs.backgroundImage, shadow: cs.boxShadow, anim: cs.animationName, color: cs.color, icon: e.querySelector('svg') ? getComputedStyle(e.querySelector('svg')).color : null };
  }));
  for (const [i, name] of ['Entrenando hace', 'Finalizar', 'Cancelar'].entries()){
    const x = m[i];
    t.ok(!!x, name + ': está en la pantalla');
    if (!x) continue;
    t.ok(/linear-gradient\(155deg/.test(x.ring) && !x.ring.includes('conic-gradient') && conTinte(x.ring), name + ': borde con el filete fino y un toque de color, no la gama de neón: ' + x.ring.slice(0, 80));
    t.ok(x.shadow !== 'none' && !conTinte(x.shadow), name + ': sombra neutra, sin resplandor de colores: ' + x.shadow);
    t.eq(x.anim, 'none', name + ': quieto (no gira)');
    t.ok(!tinted(x.color) && (!x.icon || !tinted(x.icon)), name + ': letras blancas: ' + x.color + ' ' + x.icon);
  }
  t.eq(errs, [], 'errores de la página');
  await close();
}
