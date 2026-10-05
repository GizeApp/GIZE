// Apariencia tranquila (css/ui/calma.css) en TODAS las apariencias («Oscuro», «Azul», «Rosa» y
// «Claro»): fondo liso con el degradé de cada una (sin manchas de color y sin partículas: el
// canvas está oculto y nunca se dibuja), cajas y botones con el filete fino de un toque de color
// en el borde (linear-gradient a 155°, ya no la gama RGB en conic-gradient), nada gira y sin
// brillos de colores (solo sombras neutras). Los botones principales quedan rellenos: blancos en
// las oscuras y del color del texto en «Claro», con el filete quieto de borde. «Neón apagado»
// (html.sin-neon) conserva su look en blanco y gris: solo le toca el fondo.
import { newPage, wait, ALUMNO } from './lib.mjs';

const STATE = { days: [{ id: 'd1', name: 'Día 1', exercises: [{ id: 'e1', name: 'Sentadilla', sets: [{ id: 's1', kg: '', reps: '' }] }] }], sessions: [], weights: [], daily: {} };

const APARIENCIAS = [
  ['Oscuro', ''],
  ['Azul', "localStorage.setItem('gize_tema','azul');"],
  ['Rosa', "localStorage.setItem('gize_tema','rosa');"],
  ['Claro', "localStorage.setItem('gize_tema','luz');"],
  ['Neón apagado', "localStorage.setItem('gize_neon','0');"],
];

// ¿Hay algún color con tinte (no gris) en este valor de CSS? rgb()/rgba() y color(srgb …), que es
// como sale un color-mix() calculado; canales de 0 a 255. Los transparentes no cuentan.
const colores = v => (String(v || '').match(/rgba?\([^)]*\)|color\(srgb[^)]*\)/g) || []).map(c => {
  const n = c.replace('srgb', '').match(/[\d.]+/g).map(Number);
  return c.startsWith('color') ? n.slice(0, 3).map(x => x * 255).concat(n.slice(3)) : n;
}).filter(([r, g, b, a]) => a === undefined || a > 0);
const conTinte = v => colores(v).some(([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b) > 24);
const FILETE = /linear-gradient\(155deg/;

export default async function ({ base, t }){
  for (const [nombre, tema] of APARIENCIAS) {
    const sinNeon = nombre === 'Neón apagado';
    const { p, errs, close } = await newPage({ user: ALUMNO, state: STATE,
      init: `localStorage.setItem('gize_lite','0'); ${tema} window.__arc = 0; { const o = CanvasRenderingContext2D.prototype.arc; CanvasRenderingContext2D.prototype.arc = function(){ window.__arc++; return o.apply(this, arguments); }; }` });
    await p.goto(base + '/app/'); await wait(4000);
    const v = await p.evaluate(() => {
      // El degradé de la apariencia y el color del texto, calculados con un elemento de prueba.
      const ref = document.createElement('div');
      ref.style.background = 'var(--gize-calm-bg)'; ref.style.color = 'var(--gize-text)';
      document.body.appendChild(ref);
      const calm = getComputedStyle(ref).backgroundImage, text = getComputedStyle(ref).color;
      ref.remove();
      const a = document.querySelector('.app-aurora'), ac = getComputedStyle(a);
      const ws = document.querySelector('.wk-start'), wcs = getComputedStyle(ws), wb = getComputedStyle(ws, '::before');
      const box = document.querySelector('#view .ex-collapsed');
      const capas = e => e ? [null, '::before', '::after'].map(ps => getComputedStyle(e, ps).backgroundImage).join(' | ') : '';
      // Todo lo visible (con sus ::before/::after): gama RGB, lo que gira y las sombras.
      const conic = [], spin = [], sombras = [];
      for (const e of document.querySelectorAll('body *')) {
        if (!e.getClientRects().length) continue;
        const id = e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).join('.') : '');
        for (const ps of [null, '::before', '::after']) {
          const cs = getComputedStyle(e, ps);
          if (ps && cs.content === 'none') continue;
          const n = id + (ps || '');
          if (/conic-gradient/.test(cs.backgroundImage)) conic.push(n);
          if (/spin/i.test(cs.animationName) || (/linear-gradient\(155deg/.test(cs.backgroundImage) && cs.animationName !== 'none')) spin.push(n + ' ' + cs.animationName);
          for (const k of ['boxShadow', 'textShadow', 'filter']) if (cs[k] !== 'none') sombras.push([n, k, cs[k]]);
        }
      }
      return { calm, text, bg: ac.backgroundImage, op: ac.opacity, spans: [...a.querySelectorAll('span')].map(s => getComputedStyle(s).display),
        canvas: getComputedStyle(document.getElementById('silkCanvas')).display, arc: window.__arc,
        box: capas(box), btn: wb.backgroundImage, anim: wb.animationName, btnBg: wcs.backgroundColor, shadow: wcs.boxShadow,
        save: getComputedStyle(document.querySelector('.save-session')).backgroundImage, conic, spin, sombras };
    });
    const n = nombre + ': ';
    // Fondo: el degradé liso de la apariencia (también con el neón apagado), sin manchas ni partículas.
    t.ok(/^linear-gradient\(/.test(v.calm) && v.bg === v.calm && v.op === '1', n + 'fondo liso con el degradé de la apariencia: ' + v.bg.slice(0, 70));
    t.ok(!/radial-gradient/.test(v.bg) && v.spans.length > 0 && v.spans.every(d => d === 'none'), n + 'sin las manchas de color de la aurora: ' + JSON.stringify(v.spans));
    t.eq([v.canvas, v.arc], ['none', 0], n + 'sin partículas (el canvas oculto y nunca se dibuja)');
    // Nada con la gama RGB, nada gira y ningún brillo de color.
    t.eq(v.conic, [], n + 'nada con el borde de la gama RGB (conic-gradient)');
    t.eq(v.spin, [], n + 'nada gira');
    t.eq(v.anim, 'none', n + 'el borde del botón principal queda quieto');
    t.eq(v.sombras.filter(([, , s]) => conTinte(s)).map(x => x.join(' ')), [], n + 'sin brillos de colores (box-shadow, text-shadow, drop-shadow)');
    if (!sinNeon) {
      const neutro = nombre === 'Claro' ? 'rgba(11, 13, 17' : 'rgba(255, 255, 255';
      t.ok(FILETE.test(v.box) && conTinte(v.box), n + 'las cajas (el ejercicio) con el filete fino con un toque de color: ' + v.box.slice(0, 80));
      t.ok(FILETE.test(v.btn) && conTinte(v.btn) && v.btn.includes(neutro), n + 'el botón principal con el filete fino (' + neutro + '…) y un toque de color, no la gama de neón: ' + v.btn.slice(0, 80));
      // Rellenos: blancos en las apariencias oscuras, del color del texto en «Claro».
      const relleno = nombre === 'Claro' ? v.text : 'rgb(255, 255, 255)';
      t.eq(v.btnBg, relleno, n + '«Iniciar entrenamiento» relleno');
      t.ok(v.save.startsWith(`linear-gradient(${relleno}, ${relleno})`) && FILETE.test(v.save), n + '«Guardar sesión» relleno con el filete de borde: ' + v.save.slice(0, 90));
      t.ok(v.shadow !== 'none' && !conTinte(v.shadow), n + 'sombra neutra en el botón principal: ' + v.shadow);
    } else {
      t.ok(!FILETE.test(v.btn) && !conTinte(v.btn) && !conTinte(v.box), n + 'conserva el blanco y gris (sin el filete de color): ' + v.btn.slice(0, 60));
      t.eq(v.btnBg, 'rgb(255, 255, 255)', n + 'botón principal blanco');
    }
    t.eq(errs, [], n + 'errores de la página');
    await close();
  }
}
