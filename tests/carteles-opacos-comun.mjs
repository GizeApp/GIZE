// Las ventanas propias (#335): las preguntas (confirmar() de app/ui/avisos.js) y la hoja del selector
// (app/ui/selector.js). En «Claro» se veían transparentes: se pintaban con var(--card), que ahí es el
// vidrio blanco al 40 % de las cajas, y se leía lo de atrás; en la hoja, la barra de abajo se veía a
// través de «Cancelar». Ahora llevan el vidrio casi opaco de las hojas (css/ui/claro-frozen.css).
// En cada apariencia (Oscuro, Claro, Azul, Rosa), con el neón prendido y apagado, en liviano y en GIZE
// básico, en la app del alumno, en el panel del coach y en el admin, cada ventana:
//   · es opaca: el relleno no tiene transparencia y, en la captura, lo de adentro queda igual aunque
//     detrás se pinte un damero de colores fuertes (no se trasluce nada);
//   · el velo de atrás oscurece la pantalla;
//   · está encima de la barra de abajo: en «Cancelar» y en cada punto de la barra que cae adentro de
//     la ventana, lo que se toca es la ventana;
//   · sus textos se leen (contraste de 4,5:1 o más).
// Lo común de tests/carteles-opacos.test.mjs (app del alumno y admin) y tests/carteles-opacos-coach.test.mjs
// (panel del coach). No es una prueba (no termina en .test.mjs): la importan las dos.
import { wait, contraste } from './lib.mjs';

const TEMAS = ['oscuro', 'claro', 'azul', 'rosa'];
const MODOS = [['', []], [', neón apagado', ['sin-neon']], [', liviano', ['lite']], [', GIZE básico', ['lite', 'basico']]];
const VENTANA = {
  pregunta: { bg: '.av-bg', card: '.av-card', x: '.av-sec', z: 1200 },
  selector: { bg: '.sl-bg', card: '.sl-card', x: '.sl-x', z: 1100 },
};

// Lo que se lee de la ventana abierta (en la página).
const MEDIR = s => {
  const bg = document.querySelector(s.bg + ':not(.closing)'), card = bg && bg.querySelector(s.card), x = card && card.querySelector(s.x);
  if (!x) return null;
  // La transparencia de un color calculado: rgb(), rgba() o color(srgb … / a).
  const alfa = c => { const m = String(c).match(/\/\s*([\d.]+)\s*\)$/) || String(c).match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/); return m ? parseFloat(m[1]) : /^(rgb|color)\(/.test(c) ? 1 : 0; };
  const r = card.getBoundingClientRect(), rx = x.getBoundingClientRect(), cs = getComputedStyle(card);
  const barra = [...document.querySelectorAll('.navbar, .cv-nav')].find(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
  const rb = barra && barra.getBoundingClientRect();
  const cruza = (a, b) => Math.min(a.right, b.right) > Math.max(a.left, b.left) && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);
  // El medio de «Cancelar» y una grilla sobre la parte de la barra que queda adentro de la ventana.
  const puntos = [[rx.left + rx.width / 2, rx.top + rx.height / 2]];
  if (rb && cruza(rb, r)) for (let px = Math.max(rb.left, r.left) + 4; px < Math.min(rb.right, r.right) - 4; px += 14)
    for (let py = Math.max(rb.top, r.top) + 4; py < Math.min(rb.bottom, r.bottom) - 4; py += 10) puntos.push([px, py]);
  const fuera = puntos.map(([px, py]) => [px, py, document.elementFromPoint(px, py)]).filter(([, , h]) => !h || !card.contains(h))
    .map(([px, py, h]) => Math.round(px) + ',' + Math.round(py) + ' → ' + (h ? (h.id ? '#' + h.id : h.tagName + '.' + String(h.className).split(' ')[0]) : 'nada'));
  // Lo de adentro sin las esquinas redondeadas (ahí se ve lo de atrás a propósito).
  const rad = Math.max(...['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius'].map(k => parseFloat(cs[k]) || 0)) + 2;
  return { fondo: cs.backgroundColor, alfa: alfa(cs.backgroundColor), velo: alfa(getComputedStyle(bg).backgroundColor), opacidad: Number(getComputedStyle(bg).opacity),
    zona: { x: Math.ceil(r.left + rad), y: Math.ceil(r.top + rad), width: Math.floor(r.width - 2 * rad), height: Math.floor(r.height - 2 * rad) },
    sobreBarra: !!(rb && cruza(rb, rx)), fuera, puntos: puntos.length };
};
// Cuántos píxeles cambian entre dos capturas del mismo lugar (decodificadas en la página).
const COMPARAR = async ({ a, b }) => {
  const leer = async src => { const img = new Image(); img.src = 'data:image/png;base64,' + src; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0); return g.getImageData(0, 0, c.width, c.height).data; };
  const [x, y] = [await leer(a), await leer(b)]; let n = 0;
  for (let i = 0; i < x.length; i += 4) if (Math.max(Math.abs(x[i] - y[i]), Math.abs(x[i + 1] - y[i + 1]), Math.abs(x[i + 2] - y[i + 2])) > 16) n++;
  return { n, total: x.length / 4 };
};

async function revisar(t, p, donde, cual, { barra = false } = {}){
  donde += ', ' + cual;
  const s = VENTANA[cual], m = await p.evaluate(MEDIR, s);
  if (!m) { t.ok(false, donde + ': no se abrió la ventana (' + cual + ')'); return; }
  t.ok(m.alfa === 1, donde + ': el relleno es opaco (' + m.fondo + ')');
  t.ok(m.velo >= .3 && m.opacidad === 1, donde + ': el velo de atrás oscurece la pantalla (' + m.velo + ')');
  // Un damero de colores fuertes detrás de la ventana (debajo del velo): adentro no cambia ni un píxel.
  const foto = () => p.screenshot({ clip: m.zona, animations: 'disabled', caret: 'hide' }).then(b => b.toString('base64'));
  const antes = await foto();
  await p.evaluate(z => { const d = document.createElement('div'); d.id = 'tstDamero';
    d.style.cssText = 'position:fixed;inset:0;z-index:' + z + ';pointer-events:none;background:repeating-conic-gradient(#ff00c8 0 25%, #00ff6a 0 50%) 0 0/22px 22px';
    document.body.appendChild(d); }, s.z - 1);
  await wait(100);
  const despues = await foto();
  await p.evaluate(() => document.getElementById('tstDamero').remove());
  const d = await p.evaluate(COMPARAR, { a: antes, b: despues });
  // (Unos pocos píxeles sueltos en el borde de un botón con foco pueden cambiar porque el navegador
  // vuelve a pintar la capa; una ventana que deja ver lo de atrás cambia casi todos.)
  t.ok(d.total > 1000 && d.n <= d.total * .002, donde + ': no se trasluce lo de atrás (' + d.n + ' de ' + d.total + ' píxeles cambian con un damero detrás)');
  if (barra) t.ok(m.sobreBarra, donde + ': «Cancelar» cae sobre la barra de abajo (la prueba mide algo)');
  t.eq(m.fuera, [], donde + ': la ventana está encima de la barra de abajo (' + m.puntos + ' puntos)');
  const k = await contraste(p, s.bg);
  t.ok(k.n >= 3 && !k.malos.length, donde + ': los textos se leen (mínimo ' + k.min + ':1 en ' + k.n + '): ' + k.malos.join(', '));
}
// Cierra lo que esté abierto (como una persona: «Cancelar»).
const cerrar = p => p.evaluate(() => { for (const s of ['.av-bg:not(.closing) .av-sec', '.sl-bg:not(.closing) .sl-x']) { const b = document.querySelector(s); if (b) b.click(); } }).then(() => wait(450));
const clases = (p, cls, on) => p.evaluate(([c, on]) => c.forEach(x => document.documentElement.classList.toggle(x, on)), [cls, on]).then(() => wait(300));
// Una pregunta (queda abierta: p.contestar = null) y un <select> de tres opciones con el del medio elegido.
async function pregunta(p){
  await cerrar(p); p.contestar = null;
  await p.evaluate(() => { window.confirmar('¿Querés limpiar lo que cargaste hoy?', { ok: 'Limpiar' }); }); await wait(700);
  p.contestar = true;
}
async function selector(p, donde){
  await cerrar(p);
  await p.evaluate(d => { const v = document.querySelector(d), e = document.getElementById('tstSel'); if (e) e.remove();
    v.insertAdjacentHTML('afterbegin', '<select id="tstSel" class="form-input" style="margin:12px 0"><option>Press inclinado con mancuernas</option>' +
      '<option selected>Sentadilla en Smith</option><option>Vuelos laterales sentado</option></select>'); }, donde);
  await p.click('#tstSel'); await wait(800);
}

export { TEMAS, MODOS, revisar, cerrar, clases, pregunta, selector };
