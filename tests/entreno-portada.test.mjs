// Entreno → la «portada» del día (.day-head): pedido que lo de arriba se destaque como una tarjeta
// con solo el nombre del día grande y centrado (se sigue pudiendo editar), «Iniciar entrenamiento»,
// «Limpiar» centrado abajo y el tachito de borrar el día chico en la esquina de arriba a la
// derecha. La barra y la cuenta de series («0/3 series») se sacaron («borra lo demás»).
// Entrenando, el reloj con Finalizar y Cancelar van adentro de la tarjeta, centrados. En todas
// las apariencias («Oscuro», «Azul», «Rosa», «Claro» y con el neón apagado): esquinas de 24 px y
// una sombra neutra, sin brillos de colores (css/ui/calma.css). Un nombre largo achica la letra.
import { newPage, wait, ALUMNO } from './lib.mjs';

const STATE = { days: [{ id: 'd1', name: 'Día 1', exercises: [
  { id: 'e1', name: 'Sentadilla', sets: [{ id: 's1', kg: '', reps: '' }, { id: 's2', kg: '', reps: '' }] },
  { id: 'e2', name: 'Press banca', sets: [{ id: 's3', kg: '', reps: '' }] }] }], sessions: [], weights: [], daily: {} };

const APARIENCIAS = [
  ['Oscuro', ''],
  ['Azul', "localStorage.setItem('gize_tema','azul');"],
  ['Rosa', "localStorage.setItem('gize_tema','rosa');"],
  ['Claro', "localStorage.setItem('gize_tema','luz');"],
  ['Neón apagado', "localStorage.setItem('gize_neon','0');"],
];

// ¿Hay algún color con tinte (no gris) en este valor de CSS? rgb()/rgba() y color(srgb …), que es
// como sale un color-mix() calculado; canales de 0 a 255.
const colores = v => (String(v || '').match(/rgba?\([^)]*\)|color\(srgb[^)]*\)/g) || []).map(c => {
  const n = c.replace('srgb', '').match(/[\d.]+/g).map(Number);
  return c.startsWith('color') ? n.slice(0, 3).map(x => x * 255).concat(n.slice(3)) : n;
}).filter(([r, g, b, a]) => a === undefined || a > 0);
const conTinte = v => colores(v).some(([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b) > 24);

// Las cajas de la tarjeta y de lo que lleva adentro, y si cada cosa está dentro de ella.
const medir = () => {
  const head = document.querySelector('#view .day-head');
  if (!head) return null;
  const r = e => { if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, r: b.right, b: b.bottom, cx: b.left + b.width / 2, w: b.width, h: b.height }; };
  const q = s => head.querySelector(s);
  const cs = getComputedStyle(head), name = q('.day-name');
  return {
    head: r(head), name: r(name), nameTag: name && name.tagName, nameAlign: name && getComputedStyle(name).textAlign,
    nameSize: name && parseFloat(getComputedStyle(name).fontSize),
    del: r(q('.day-del')), start: r(q('.wk-start')), clear: r(q('.clear')),
    live: r(q('.wk-live')), finish: r(q('.wk-finish')), cancel: r(q('.wk-cancel')),
    startH: q('.wk-start') && q('.wk-start').getBoundingClientRect().height,
    startFont: q('.wk-start') && [getComputedStyle(q('.wk-start')).fontSize, getComputedStyle(q('.wk-start')).fontWeight],
    viejo: ['.progress-row', '.bar', '.count'].filter(s => document.querySelector('#view ' + s)),
    series: /\d+\s*\/\s*\d+\s*series/.test(head.textContent),
    radius: cs.borderTopLeftRadius, shadow: cs.boxShadow, anim: cs.animationName,
  };
};
const adentro = (h, e) => !!e && e.x >= h.x - 0.5 && e.r <= h.r + 0.5 && e.y >= h.y - 0.5 && e.b <= h.b + 0.5;
const centrado = (h, e) => !!e && Math.abs(e.cx - h.cx) <= 2;

export default async function ({ base, t }){
  for (const [nombre, tema] of APARIENCIAS) {
    const n = nombre + ': ';
    const { p, errs, close } = await newPage({ user: ALUMNO, state: STATE, init: "localStorage.setItem('gize_lite','0');" + tema });
    await p.goto(base + '/app/'); await wait(2500);
    const m = await p.evaluate(medir);
    t.ok(!!m, n + 'está la tarjeta de la portada del día');
    if (!m) { await close(); continue; }
    const h = m.head;
    t.ok(m.nameTag === 'TEXTAREA' && m.nameAlign === 'center' && centrado(h, m.name) && adentro(h, m.name), n + 'el nombre del día, editable y centrado en la tarjeta: ' + JSON.stringify([m.nameTag, m.nameAlign, m.name, h]));
    t.ok(m.nameSize >= 36, n + 'el nombre, grande: ' + m.nameSize + 'px');
    t.ok(adentro(h, m.start) && centrado(h, m.start), n + '«Iniciar entrenamiento» adentro de la tarjeta');
    t.ok(m.startH >= 54 && m.startFont[0] === '17px' && +m.startFont[1] >= 800, n + '«Iniciar entrenamiento» más grande (56 px, 17 px en 800): ' + JSON.stringify([m.startH, m.startFont]));
    t.ok(adentro(h, m.clear) && centrado(h, m.clear) && m.clear.y >= m.start.b, n + '«Limpiar» adentro, centrado y abajo del botón');
    // El tachito: chico, adentro, pegado a la esquina de arriba a la derecha (y sin pisar el nombre).
    t.ok(adentro(h, m.del) && h.r - m.del.r <= 16 && m.del.y - h.y <= 16 && m.del.w <= 40 && m.del.h <= 40, n + 'el tachito, chico en la esquina de arriba a la derecha: ' + JSON.stringify([m.del, h]));
    t.eq(m.viejo, [], n + 'sin la barra ni la cuenta de series');
    t.ok(!m.series, n + 'sin «0/3 series» en la portada');
    t.eq(m.radius, '24px', n + 'esquinas de 24 px');
    t.ok(m.shadow !== 'none' && !conTinte(m.shadow), n + 'sombra neutra, sin brillos de colores: ' + m.shadow);
    t.eq(m.anim, 'none', n + 'nada se mueve');
    // Entrenando: el reloj, Finalizar y Cancelar adentro, centrados; ya no está el botón de iniciar.
    await p.click('[data-action="wk-start"]'); await wait(500);
    const v = await p.evaluate(medir);
    t.ok(!v.start && adentro(v.head, v.live) && centrado(v.head, v.live), n + 'entrenando: «Entrenando hace…» adentro de la tarjeta, centrado');
    t.ok(adentro(v.head, v.finish) && adentro(v.head, v.cancel) && Math.abs((v.finish.x + v.cancel.r) / 2 - v.head.cx) <= 3, n + 'entrenando: Finalizar y Cancelar adentro, centrados');
    t.ok(adentro(v.head, v.clear) && v.clear.y >= v.finish.b && adentro(v.head, v.del), n + 'entrenando: «Limpiar» y el tachito siguen adentro');
    // Un nombre largo achica la letra mientras se escribe (y no ocupa media pantalla).
    if (nombre === 'Oscuro') {
      await p.fill('textarea.day-name', 'Piernas y glúteos pesado con trabajo de core'); await wait(200);
      const l = await p.evaluate(() => { const e = document.querySelector('textarea.day-name'); return { size: parseFloat(getComputedStyle(e).fontSize), h: e.getBoundingClientRect().height, align: getComputedStyle(e).textAlign }; });
      t.ok(l.size <= 26 && l.h <= 120 && l.align === 'center', n + 'nombre largo: más chico, centrado y sin ocupar media pantalla: ' + JSON.stringify(l));
    }
    t.eq(errs, [], n + 'errores de la página');
    await close();
  }
}
