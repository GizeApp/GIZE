// Entreno en curso: «Entrenando hace…», Finalizar y Cancelar con borde de neón (la gama de
// GIZE) y letras blancas, como «Iniciar entrenamiento».
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

const tinted = c => { const [r, g, b] = (c.match(/[\d.]+/g) || []).map(Number); return Math.max(r, g, b) - Math.min(r, g, b) > 40; };

export default async function ({ base, t }){
  const days = [{ id: 'd1', name: 'Torso', exercises: [{ id: 'e1', name: 'Remo con barra', sets: [{ id: 's1', kg: '', reps: '' }] }] }];
  const { p, errs, close } = await newPage({ user: ALUMNO, state: { days, sessions: [], weights: [], daily: {} }, handlers: { '/profiles': profile('client') } });
  await p.goto(base + '/app/'); await wait(2500);
  await p.click('[data-action="wk-start"]'); await wait(400);
  const m = await p.evaluate(() => ['.wk-live', '.wk-finish', '.wk-cancel'].map(q => {
    const e = document.querySelector(q); if (!e) return null;
    const cs = getComputedStyle(e);
    return { q, ring: cs.backgroundImage.includes('conic-gradient'), color: cs.color, icon: e.querySelector('svg') ? getComputedStyle(e.querySelector('svg')).color : null };
  }));
  for (const [i, name] of ['Entrenando hace', 'Finalizar', 'Cancelar'].entries()){
    const x = m[i];
    t.ok(!!x, name + ': está en la pantalla');
    if (!x) continue;
    t.ok(x.ring, name + ': borde de neón con la gama');
    t.ok(!tinted(x.color) && (!x.icon || !tinted(x.icon)), name + ': letras blancas: ' + x.color + ' ' + x.icon);
  }
  t.eq(errs, [], 'errores de la página');
  await close();
}
