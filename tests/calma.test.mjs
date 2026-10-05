// «Oscuro» más tranquilo (css/ui/calma.css): fondo liso en degradé sin partículas, y cajas con
// filete fino; el neón queda en el botón principal.
import { newPage, wait, ALUMNO } from './lib.mjs';

export default async function ({ base, t }){
  const { p, errs, close } = await newPage({ user: ALUMNO, state: { days: [{ id: 'd1', name: 'Día 1', exercises: [{ id: 'e1', name: 'Sentadilla', sets: [{ id: 's1', kg: '', reps: '' }] }] }], sessions: [], weights: [], daily: {} },
    init: `localStorage.setItem('gize_lite','0'); window.__arc = 0; { const o = CanvasRenderingContext2D.prototype.arc; CanvasRenderingContext2D.prototype.arc = function(){ window.__arc++; return o.apply(this, arguments); }; }` });
  await p.goto(base + '/app/'); await wait(4000);
  if (!await p.$('.card')) { await p.click('.ex-collapsed').catch(() => {}); await wait(400); }
  const v = await p.evaluate(() => {
    const a = getComputedStyle(document.querySelector('.app-aurora')), card = document.querySelector('#view :is(.card, .blk, .daily-card, .water-card, .plan-banner)');
    return { bg: a.backgroundImage, op: a.opacity, canvas: getComputedStyle(document.getElementById('silkCanvas')).display,
      arc: window.__arc, card: card ? getComputedStyle(card).backgroundImage : '', btn: getComputedStyle(document.querySelector('.wk-start'), '::before').backgroundImage };
  });
  t.ok(/^linear-gradient/.test(v.bg) && v.op === '1', 'fondo liso en degradé: ' + v.bg.slice(0, 60));
  t.eq([v.canvas, v.arc], ['none', 0], 'sin partículas');
  t.ok(/conic-gradient/.test(v.card), 'las cajas con el borde RGB del login');
  t.ok(/conic-gradient/.test(v.btn), 'el botón principal sigue con neón');
  t.eq(errs, [], 'errores de la página');
  await close();
}
