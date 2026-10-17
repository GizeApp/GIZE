// Panel del coach en «Oscuro»: vidrio sobre su capa de fondo (css/screens/coach/vidrio.css).
// - Se lee: los textos importantes (etiquetas grises de 11–14 px, la sección elegida de
//   Configuración, los botones de Tema, el menú ⋯ con «Quitar ejercicio» en rojo, «+ Agregar
//   ejercicio» al pasar el mouse, la barra de abajo del celular, el selector de ejercicios, «Programar
//   una rutina nueva» y «Mi plan»…) tienen contraste ≥ 5:1 contra el fondo REAL: una captura sin
//   texto, con el vidrio, las luces y el grano. Se toma el píxel del fondo más parecido al texto
//   (percentil 95), no el promedio. «▸ Ver progreso» (12 px, azul) ≥ 4,5:1. Como las luces se mueven,
//   cada texto se mide con las luces frenadas en una punta de su recorrido, en el medio y en la otra
//   (la más prendida), y cuenta la peor.
// - Las luces se notan pero no saltan: de una punta del recorrido a la otra el fondo cambia ≥ 15/255
//   en la compu (≥ 12 en el celular) y el paso de cada segundo (donde van más rápido) ≤ 2/255.
// - Adentro de las ventanas de vidrio no quedan bloques opacos (#12151B / #0B0D11): los grupos
//   musculares, el buscador, «Cancelar» y las tarjetas de «Mi plan» van en el mismo material.
// - Alcance: con «Claro», «Azul», «Rosa» y en la app del alumno la hoja no cambia nada: los estilos
//   calculados de toda la página (y de sus ::before / ::after) son los mismos con la hoja prendida y
//   apagada. En «Oscuro», en cambio, sí cambia (la hoja está cargada y hace algo).
// - «Reducir transparencia» del sistema: rellenos sólidos y sin desenfoque, también en liviano y en
//   la app de Android. Las luces (lo único que se mueve) quedan quietas, pintadas en la capa del fondo
//   y sin sus capas (y app/ui/background.js no las mueve), con «reducir movimiento», con «reducir
//   transparencia», en liviano y en la app de Android; en GIZE básico y con colores forzados no hay
//   ni capa ni luces.
// - Placa de video: una sola capa fija de pantalla completa con will-change (la aurora de abajo no
//   se pinta) y las dos luces, capas chicas, las únicas otras con will-change; en la app de Android
//   sin will-change; en GIZE básico sin la capa (queda el degradé de siempre); en liviano sin el grano
//   y sin desenfoque.
// - Lo que no se rompe: el campo con foco conserva su borde de siempre; al arrastrar para unir en
//   superserie, la tarjeta de destino conserva su tinte; la pestaña de día donde cae la que
//   arrastrás conserva su rayita (con y sin neón); el ⋯ abierto o con el mouse encima, su borde azul;
//   en el celular, «Configuración» elegida en la franja de arriba se distingue de las otras; la
//   botonera que aparece al pasar el mouse tapa el final de un nombre largo; los filetes (z 3) quedan
//   adentro de su tarjeta (isolation) y el panel de la barra lateral (z -1) adentro de la barra.
// - Desenfoque solo en las ventanas y la píldora del celular (no en los menús ⋯ ni en la pestaña que
//   se arrastra). Sombras grandes con desenfoque solo en la compu: en el celular, liviano y Android
//   las filas y tarjetas van con la luz interna. Con colores forzados (contraste alto) no hay capa.
import { newPage, wait, configCoach, ALUMNO, profile } from './lib.mjs';

const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
const ymd = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(d);
const ago = n => ymd(new Date(Date.now() - n * 86400000));
// [id, nombre, días desde el último entreno, entrenos]
const CLIENTES = [['c1', 'Camila Benítez', 0, 42], ['c2', 'Facundo Romero', 1, 27], ['c3', 'Joaquín Sosa', 3, 15], ['c4', 'Martina Giménez', 2, 33], ['c5', 'Nicolás Paz', 9, 21]]
  .map(([k, n, d, s]) => ({ id: k.replace('c', 'c1000000-0000-4000-8000-00000000000'), n, d, s }));
const ABRIR = CLIENTES[3].id;
const ej = (k, name, extra) => Object.assign({ id: 'e' + k, name, rir: '2', rest: '90 seg',
  sets: [0, 1, 2].map(j => ({ id: 'e' + k + 's' + j, kg: '', reps: '', target: j === 0 ? '10-12' : '8-10' })) }, extra || {});
const RUTINA = [
  { id: 'd0', name: 'Pierna', subtitle: '', exercises: [ej(0, 'Sentadilla libre'), ej(1, 'Prensa 45°'), ej(2, 'Peso muerto rumano'),
    ej(3, 'Camilla de cuádriceps', { ss: true }), ej(4, 'Sillón de isquiotibiales'), ej(5, 'Gemelos parado')] },
  { id: 'd1', name: 'Empuje', subtitle: '', exercises: [ej(10, 'Press banca')] },
  { id: 'd2', name: 'Tracción', subtitle: '', exercises: [ej(20, 'Dominadas')] },
];
const handlers = {
  '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
    if (/coach_id=eq/.test(i.url.search)) return J(CLIENTES.map(c => ({ id: c.id, full_name: c.n, avatar_path: null }))); return J(i.one ? me : [me]); },
  '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 30, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
  '/rpc/my_invite_code': (r, J) => J('K7M2Q9XA'),
  '/rpc/coach_client_stats': (r, J) => J(CLIENTES.map(c => ({ client_id: c.id, n_sessions: c.s, last_session: ago(c.d) }))),
  '/routines': (r, J, i) => { if (i.m !== 'GET') return undefined; const id = (i.url.search.match(/client_id=eq\.([\w-]+)/) || [])[1];
    const row = { days: id === ABRIR ? RUTINA : [{ id: 'x0', name: 'Full body A' }] }; return J(i.one ? row : [row]); },
  '/routine_templates': (r, J) => J([]), '/routine_schedule': (r, J) => J([]),
};
const D = { width: 1440, height: 900 }, M = { width: 390, height: 844 };
const TEMA = { oscuro: '', claro: "localStorage.setItem('gize_tema','luz');", azul: "localStorage.setItem('gize_tema','azul');", rosa: "localStorage.setItem('gize_tema','rosa');" };
const abrir = async (base, { vp = D, tema = 'oscuro', touch = false, reducedMotion, init = '' } = {}) => {
  const pg = await newPage({ user: COACH, viewport: vp, touch, reducedMotion, handlers, init: "localStorage.setItem('gize_lite','0');" + TEMA[tema] + init });
  return pg;
};
const go = async (p, vista) => {
  const click = async sel => { await p.click(sel); await wait(600); };
  if (await p.$('#coachHost .cs-layout') && vista !== 'config') await click('[data-coach="settings-back"]');
  if (vista === 'inicio') await click('[data-coach="view-home"]');
  else if (vista === 'clientes') await click('[data-coach="view-clients"]');
  else if (vista === 'config') await configCoach(p, 'apariencia');
  else {
    if (!await p.$('.cv-ctabs')) { await click('[data-coach="view-clients"]'); await click(`[data-coach="open"][data-id="${ABRIR}"]`); await wait(500); }
    await click('[data-coach="client-tab"][data-t="rutina"]');
    if (vista === 'mas') {
      // «Más opciones» del segundo ejercicio abierto: «▸ Ver progreso».
      if (!await p.$('.co-exc-open[data-id="e1"]')) await click('.co-exc[data-id="e1"] .co-exc-chev');
      if (!await p.$('.co-exc[data-id="e1"] .co-more-btn.on')) await click('.co-exc[data-id="e1"] .co-more-btn');
      await p.evaluate(() => { const h = document.getElementById('coachHost'), c = document.querySelector('.co-exc[data-id="e1"]'); h.scrollTop += c.getBoundingClientRect().top - 60; });
    }
    if (vista === 'menu') {
      if (!await p.$('.co-exc-open[data-id="e1"]')) await click('.co-exc[data-id="e1"] .co-exc-chev');
      await p.evaluate(() => { const h = document.getElementById('coachHost'), c = document.querySelector('.co-exc[data-id="e1"]'); h.scrollTop += c.getBoundingClientRect().top - 150; });
      await click('.co-exc-open .co-exc-menu2 > summary');
    }
  }
  if (vista !== 'menu' && vista !== 'mas') await p.evaluate(() => { document.getElementById('coachHost').scrollTop = 0; });
  await wait(300);
};

// ---------- Contraste contra el fondo real ----------
const VENTANAS = '#coachHost, #applyMount, #coachSheetHost, #planSheetHost';
const SIN_TEXTO = `:is(${VENTANAS}) *, :is(${VENTANAS}) *::before, :is(${VENTANAS}) *::after, :is(${VENTANAS}) *::placeholder {
  color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; caret-color: transparent !important; }`;
// Los textos de lo que matchea cada selector: caja y color (con la opacidad de los de arriba). Los
// tapados por otra cosa (un menú, la barra de abajo) no se miden.
const TEXTOS = sels => {
  const out = [], W = innerWidth, H = innerHeight;
  for (const [n, sel] of sels) for (const el of document.querySelectorAll(sel)) {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let tn;
    while ((tn = w.nextNode())) {
      const t = tn.textContent.replace(/\s+/g, ' ').trim(), e = tn.parentElement; if (!t || !e) continue;
      const s = getComputedStyle(e); if (s.visibility === 'hidden') continue;
      let op = 1; for (let a = e; a; a = a.parentElement) op *= +getComputedStyle(a).opacity;
      if (op < .05) continue;
      const r = document.createRange(); r.selectNodeContents(tn);
      for (const q of r.getClientRects()) {
        if (q.width < 3 || q.height < 6 || q.left < 0 || q.top < 0 || q.right > W || q.bottom > H) continue;
        const tapado = [[.5, .5], [.08, .2], [.92, .2], [.08, .8], [.92, .8]].some(([fx, fy]) => {
          const x = document.elementFromPoint(q.left + q.width * fx, q.top + q.height * fy); return x && !(x === e || e.contains(x) || x.contains(e)); });
        if (!tapado) out.push({ n, t: t.slice(0, 30), color: s.color, op, x: q.left, y: q.top, w: q.width, h: q.height });
      }
    }
  }
  return out;
};
const MEDIR = async ({ png, items }) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + png; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
  const lin = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
  const L = (r, gg, b) => .2126 * lin(r) + .7152 * lin(gg) + .0722 * lin(b);
  return items.map(it => {
    const x0 = Math.round(it.x), y0 = Math.round(it.y + it.h * .12), w = Math.max(2, Math.round(it.w)), h = Math.max(2, Math.round(it.h * .76));
    const d = g.getImageData(x0, y0, w, h).data, ls = []; let mr = 0, mg = 0, mb = 0;
    for (let i = 0; i < d.length; i += 4) { ls.push(L(d[i], d[i + 1], d[i + 2])); mr += d[i]; mg += d[i + 1]; mb += d[i + 2]; }
    const n = ls.length; mr /= n; mg /= n; mb /= n; ls.sort((a, b) => a - b);
    const [r, gg, b, a = 1] = it.color.match(/[\d.]+/g).map(Number), al = a * it.op;
    const Lt = L(r * al + mr * (1 - al), gg * al + mg * (1 - al), b * al + mb * (1 - al)), Lm = L(mr, mg, mb);
    const cr = Lt >= Lm ? (Lt + .05) / (ls[Math.floor(n * .95)] + .05) : (ls[Math.floor(n * .05)] + .05) / (Lt + .05);
    return { n: it.n, t: it.t, cr: Math.round(cr * 100) / 100 };
  });
};
// Las luces del fondo (app/ui/background.js las mueve una vez por segundo): frenarlas como con la app
// en segundo plano ("pause"; el freno llega en el próximo segundo) y ponerlas en un punto de su
// recorrido (0 = una punta, 1 = la otra, la más prendida). Devuelve si hay luces que mover.
const BG = '/app/ui/background.js';
const hayLuces = p => p.evaluate(() => getComputedStyle(document.querySelector('.app-aurora'), '::before').content !== 'none');
async function frenarLuces(p){
  if (!await hayLuces(p)) return false;
  await p.evaluate(() => document.dispatchEvent(new Event('pause')));
  for (let i = 0; i < 30 && (await p.evaluate(async bg => (await import(bg)).lucesEstado().andando, BG)); i++) await wait(100);
  return true;
}
const soltarLuces = p => p.evaluate(() => document.dispatchEvent(new Event('resume')));
const lucesEn = (p, f) => p.evaluate(async ([bg, f]) => (await import(bg)).pintarLuces(f), [BG, f]);
// Una captura sin texto con las luces en una punta, en el medio y en la otra (una sola si no hay
// luces que se muevan); de cada texto queda el peor contraste.
async function contraste(p, sels){
  const items = await p.evaluate(TEXTOS, sels);
  const st = await p.addStyleTag({ content: SIN_TEXTO });
  const mueven = await frenarLuces(p); await wait(150);
  const pngs = [];
  for (const f of mueven ? [[0, 0], [0.5, 0.5], [1, 1]] : [null]){
    if (f) { await lucesEn(p, f); await wait(60); }
    pngs.push((await p.screenshot({ animations: 'disabled', caret: 'hide' })).toString('base64'));
  }
  if (mueven) await soltarLuces(p);
  await st.evaluate(e => e.remove());
  const res = []; for (const png of pngs) res.push(await p.evaluate(MEDIR, { png, items }));
  return res[0].map((r, i) => Object.assign({}, r, { cr: Math.min(...res.map(x => x[i].cr)) }));
}
// Cada grupo de textos: que se haya visto y que el peor tenga ≥ min.
function revisar(t, donde, res, sels, min = 5){
  for (const [n] of sels){
    const r = res.filter(x => x.n === n);
    if (!r.length) { t.ok(false, donde + ': no se vio «' + n + '»'); continue; }
    const peor = r.reduce((a, b) => b.cr < a.cr ? b : a);
    t.ok(peor.cr >= min, donde + ': «' + n + '» se lee (≥ ' + min + ':1): el peor «' + peor.t + '» ' + peor.cr + ':1 (' + r.length + ' medidos)');
  }
}

// ---------- Estilos calculados de toda la página, con la hoja prendida y apagada ----------
const ESTILOS = () => {
  const P = ['backgroundColor', 'backgroundImage', 'backgroundSize', 'borderTopColor', 'borderLeftColor', 'borderRightColor', 'boxShadow', 'backdropFilter',
    'visibility', 'isolation', 'position', 'zIndex', 'willChange', 'opacity', 'color', 'maskImage', 'content'];
  const nom = e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
  const out = {}; let i = 0;
  for (const e of [document.documentElement, ...document.querySelectorAll('body, body *')]) for (const ps of [null, '::before', '::after']) {
    const s = getComputedStyle(e, ps);
    out[nom(e) + (ps || '') + ' @' + (i++)] = ps && s.content === 'none' ? 'none' : P.map(k => s[k]).join('|');
  }
  return out;
};
const HOJA = 'link[href$="screens/coach/vidrio.css"]';
// Lo que cambia la hoja: los estilos con la hoja, sin ella y con ella otra vez (lo que cambia solo
// entre la primera y la última lectura es algo que se está animando: no cuenta).
async function sinCambios(p){
  const con = await p.evaluate(ESTILOS);
  await p.evaluate(h => { document.querySelector(h).sheet.disabled = true; }, HOJA); await wait(100);
  const sin = await p.evaluate(ESTILOS);
  await p.evaluate(h => { document.querySelector(h).sheet.disabled = false; }, HOJA); await wait(100);
  const otra = await p.evaluate(ESTILOS);
  const dif = (a, b) => { const x = String(a).split('|'), y = String(b).split('|'); return x.map((v, i) => v === y[i] ? null : v + ' / ' + y[i]).filter(Boolean).join('; ').slice(0, 160); };
  return Object.keys(con).filter(k => con[k] === otra[k] && con[k] !== sin[k]).map(k => k + ': ' + dif(sin[k], con[k]));
}
// Lo mismo con la hoja apagada: para comparar un estado (hover, abierto, dónde cae) con el de siempre.
const conHojaApagada = async (p, fn, arg) => {
  await p.evaluate(h => { document.querySelector(h).sheet.disabled = true; }, HOJA); await wait(120);
  try { return await p.evaluate(fn, arg); } finally { await p.evaluate(h => { document.querySelector(h).sheet.disabled = false; }, HOJA); await wait(120); }
};
// Bloques opacos #12151B / #0B0D11 (los de antes) adentro de una ventana de vidrio.
const OPACOS = sel => [...document.querySelectorAll(sel + ' *')].filter(e => { const s = getComputedStyle(e), r = e.getBoundingClientRect();
  return r.width >= 18 && r.height >= 12 && s.visibility !== 'hidden' && /^rgb\((18, 21, 27|11, 13, 17)\)$/.test(s.backgroundColor); })
  .map(e => String(e.className).split(' ')[0] + ' ' + getComputedStyle(e).backgroundColor);
// Las luces del fondo: el content de sus dos capas (.app-aurora::before/::after), si
// app/ui/background.js las está moviendo y cuántas luces de color (radiales que no son negras) pinta
// la capa del fondo. (El freno llega en el próximo segundo: después de cambiar algo, esperar 1,2 s.)
const LUCES = async bg => {
  const au = document.querySelector('.app-aurora'), s = getComputedStyle(document.body, '::after');
  const deColor = (s.backgroundImage.match(/radial-gradient\((?:[^()]|\([^()]*\))*\)/g) || [])
    .filter(g => (g.match(/rgba?\([^)]*\)/g) || []).some(c => c.match(/[\d.]+/g).slice(0, 3).some(Number)));
  return [['::before', '::after'].map(ps => getComputedStyle(au, ps).content), (await import(bg)).lucesEstado().andando, deColor.length];
};
const MOVIDAS = [['""', '""'], true, 0]; // las dos capas, moviéndose; la capa del fondo sin luces
const QUIETAS = [['none', 'none'], false, 2]; // sin esas capas y quietas; las dos luces en la capa del fondo
// Cuánto cambia el fondo (máximo por canal, de 255) entre las luces en las fases a y b.
async function cambio(p, a, b){
  const png = async f => { await lucesEn(p, f); await wait(80); return (await p.screenshot({ animations: 'disabled', caret: 'hide' })).toString('base64'); };
  const A = await png(a), B = await png(b);
  return p.evaluate(async ([a, b]) => {
    const px = async src => { const i = new Image(); i.src = 'data:image/png;base64,' + src; await i.decode(); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height;
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(i, 0, 0); return g.getImageData(0, 0, i.width, i.height).data; };
    const X = await px(a), Y = await px(b); let m = 0; for (let k = 0; k < X.length; k++) if (k % 4 !== 3) m = Math.max(m, Math.abs(X[k] - Y[k])); return m; }, [A, B]);
}
// Se notan pero no saltan: de una punta a la otra (≥ min) y el paso de un segundo donde van más rápido
// (en el medio: π/2 de la fase por ida) ≤ 2/255.
async function seNotan(t, p, donde, min){
  if (!await frenarLuces(p)) { t.ok(false, donde + ': no hay luces que se muevan'); return; }
  const d = await p.evaluate(async bg => (await import(bg)).LUCES.map(l => Math.PI / 2 / l.ida), BG);
  const pasada = await cambio(p, [0, 0], [1, 1]), paso = await cambio(p, [0.5, 0.5], [0.5 + d[0], 0.5 + d[1]]);
  await soltarLuces(p);
  t.ok(pasada >= min, donde + ': las luces se notan (de una punta a la otra el fondo cambia ' + pasada + '/255, ≥ ' + min + ')');
  t.ok(paso <= 2, donde + ': el paso de cada segundo no se ve (' + paso + '/255, ≤ 2)');
}
// Sombras con desenfoque (las de abajo, no la luz interna de 1 px): [blur en px] de las que no son inset.
const DESENFOQUES = v => String(v).split(/,(?![^(]*\))/).filter(x => x.trim() && x.trim() !== 'none' && !/inset/.test(x))
  .map(x => +((x.replace(/rgba?\([^)]*\)/, '').match(/-?[\d.]+px/g) || [])[2] || '0px').replace('px', ''));

export default async function ({ base, t }){
  // ---- «Oscuro», compu: se lee, capas, foco, arrastre y apilado ----
  {
    const { p, errs, close } = await abrir(base);
    await p.goto(base + '/app/'); await wait(3500);
    t.ok(await p.$(HOJA), 'app/index.html carga css/screens/coach/vidrio.css');
    const leer = async (vista, sels) => { await go(p, vista); await p.mouse.move(1436, 896); await wait(250); revisar(t, 'Oscuro, ' + vista, await contraste(p, sels), sels); };
    await leer('inicio', [['etiquetas de las estadísticas', '.cv-stat-l'], ['días sin entrenar', '.cv-li-r'], ['barra lateral', '.cv-side .cv-nav-i, .cv-side .cv-util-i']]);
    await leer('clientes', [['actividad', '.co-act-date'], ['entrenos', '.cv-prog-n'], ['panel lateral', '.cv-peek-rt small, .cv-tile span'],
      ['código de invitación', '.co-invite-sub'], ['plan', '.pl-banner']]);
    await leer('config', [['sección elegida (11 px)', '.cs-nav-i.on small'], ['subtítulos del menú', '.cs-nav-t small'], ['botones de Tema', '.cs-tema-opt'],
      ['«Toque de color en los bordes»', '.cs-neon > span'], ['subtítulos', '.cs-sub']]);
    await leer('editor', [['días sin elegir', '.co-daytab:not(.on)'], ['«Se repite»', '.co-dias-wrap .co-note-lbl, .hd-day'], ['«3 series · 10-12»', '.co-exc-sum']]);
    await leer('menu', [['menú ⋯', '.co-exc-open .co-pop-item:not(.danger):not(:disabled)'], ['«Quitar ejercicio»', '.co-exc-open .co-pop-item.danger'],
      ['«3 series · 10-12»', '.co-exc-sum'], ['«Serie / Reps / Peso»', '.co-set-head span']]);
    // «+ Agregar ejercicio» es tenue a propósito hasta pasar el mouse: se mide con el mouse encima.
    if (await p.$('.co-exc-open .co-exc-menu2[open]')) { await p.click('.co-exc-open .co-exc-menu2 > summary'); await wait(200); }
    await p.hover('.co-exc-grid > .co-ins'); await wait(300);
    revisar(t, 'Oscuro, editor', await contraste(p, [['«+ Agregar ejercicio» al pasar el mouse', '.co-exc-grid > .co-ins:hover .co-ins-b']]), [['«+ Agregar ejercicio» al pasar el mouse']]);

    // «▸ Ver progreso» (Más opciones): 12 px en azul, ≥ 4,5:1 sobre la fila de vidrio.
    await go(p, 'mas'); await p.mouse.move(1436, 896); await wait(250);
    revisar(t, 'Oscuro, Más opciones', await contraste(p, [['«▸ Ver progreso»', '.co-exc[data-id="e1"] .co-exc-fold summary']]), [['«▸ Ver progreso»']], 4.5);
    await go(p, 'inicio'); await p.mouse.move(1436, 896); await wait(250);
    await seNotan(t, p, 'Oscuro, compu, Inicio', 15);

    // La botonera que aparece al pasar el mouse tapa el final de un nombre largo: debajo del contador
    // no se ve el nombre (la misma captura con y sin el texto del nombre).
    await go(p, 'editor');
    await p.evaluate(() => { const c = document.querySelector('.co-exc-grid > .co-exc-collapsed[data-id="e2"]');
      c.querySelector('.co-exc-ctext').textContent = 'Peso muerto rumano con mancuernas a una pierna en déficit con pausa isométrica abajo';
      const h = document.getElementById('coachHost'); h.scrollTop += c.getBoundingClientRect().top - 300; });
    await wait(200);
    { const bb = await p.$('.co-exc-collapsed[data-id="e2"] .co-exc-ctext').then(e => e.boundingBox()); await p.mouse.move(bb.x + 10, bb.y + bb.height / 2); }
    await wait(400);
    const tapa = await p.evaluate(() => { const c = document.querySelector('.co-exc-collapsed[data-id="e2"]'), n = c.querySelector('.co-exc-ctext').getBoundingClientRect(),
      f = c.querySelector('.co-exc-cfoot').getBoundingClientRect(), st = c.querySelector('.co-exc-step').getBoundingClientRect();
      return { x: f.left + 10, y: st.top, w: Math.min(n.right, st.right) - f.left - 10, h: st.height, op: getComputedStyle(c.querySelector('.co-exc-cfoot')).opacity }; });
    t.ok(tapa.w > 20 && tapa.op === '1', 'el nombre largo llega debajo de la botonera, que está a la vista: ' + JSON.stringify(tapa));
    if (tapa.w > 20){
      const clip = { x: tapa.x, y: tapa.y, width: tapa.w, height: tapa.h };
      const conNombre = await p.screenshot({ clip, animations: 'disabled', caret: 'hide' });
      const st = await p.addStyleTag({ content: '.co-exc-collapsed[data-id="e2"] .co-exc-ctext { color: transparent !important; }' }); await wait(150);
      const sinNombre = await p.screenshot({ clip, animations: 'disabled', caret: 'hide' });
      await st.evaluate(e => e.remove());
      const dif = await p.evaluate(async ([a, b]) => {
        const px = async src => { const i = new Image(); i.src = 'data:image/png;base64,' + src; await i.decode(); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height;
          const g = c.getContext('2d'); g.drawImage(i, 0, 0); return g.getImageData(0, 0, i.width, i.height).data; };
        const A = await px(a), B = await px(b); let m = 0; for (let k = 0; k < A.length; k++) if (k % 4 !== 3) m = Math.max(m, Math.abs(A[k] - B[k])); return m; },
        [conNombre.toString('base64'), sinNombre.toString('base64')]);
      t.ok(dif <= 3, 'debajo de la botonera no se ve el nombre (diferencia máxima ' + dif + '/255)');
    }
    await p.mouse.move(1436, 896); await wait(200);

    // La pestaña de día donde cae la que arrastrás: la rayita de siempre (azul; blanca sin neón).
    await go(p, 'editor');
    const caida = () => { const d = document.querySelector('.co-daytab[data-coach="edit-day"]:not(.on)'), out = [];
      for (const c of ['co-drop-l', 'co-drop-r']) { d.classList.add(c); out.push(getComputedStyle(d).boxShadow); d.classList.remove(c); } return out; };
    for (const neon of [true, false]){
      await p.evaluate(n => document.documentElement.classList.toggle('sin-neon', !n), neon); await wait(150);
      const con = await p.evaluate(caida), sin = await conHojaApagada(p, caida);
      t.eq(con, sin, (neon ? 'con' : 'sin') + ' neón: la pestaña donde cae la que arrastrás conserva su rayita: ' + con.join(' / '));
      t.ok(/ 3px 0px 0px 0px inset/.test(con[0]) && /-3px 0px 0px 0px inset/.test(con[1]), (neon ? 'con' : 'sin') + ' neón: la rayita a la izquierda o a la derecha');
    }
    await p.evaluate(() => document.documentElement.classList.remove('sin-neon')); await wait(150);

    // El ⋯ del día y «Más acciones»: con el mouse encima y abierto, el borde de siempre (azul).
    const bordeDe = sel => getComputedStyle(document.querySelector(sel)).borderTopColor;
    for (const [n, sel] of [['⋯ del día', 'details.co-day-menu:not(.co-exc-menu2):not(.co-more-actions) > summary'], ['«Más acciones»', '.co-more-actions > summary']]){
      if (!await p.$(sel)) { t.ok(false, 'Oscuro, editor: no se vio ' + n); continue; }
      await p.mouse.move(1436, 896); await wait(200);
      const quieto = await p.evaluate(bordeDe, sel);
      await p.hover(sel); await wait(250);
      const hov = [await p.evaluate(bordeDe, sel), await conHojaApagada(p, bordeDe, sel)];
      await p.click(sel); await p.mouse.move(1436, 896); await wait(250);
      const abierto = [await p.evaluate(bordeDe, sel), await conHojaApagada(p, bordeDe, sel), await p.evaluate(s => document.querySelector(s).parentElement.open, sel)];
      if (abierto[2]) { await p.click(sel); await wait(200); }
      t.eq(hov[0], hov[1], n + ' con el mouse encima: el borde de siempre (' + hov[0] + ')');
      t.ok(abierto[2], n + ' se abre');
      t.eq(abierto[0], abierto[1], n + ' abierto: el borde de siempre (' + abierto[0] + ')');
      t.ok(hov[0] !== quieto && abierto[0] !== quieto, n + ': abierto o con el mouse encima se distingue del quieto (' + quieto + ')');
    }
    await p.mouse.move(1436, 896); await wait(200);

    // Desenfoque: no en la pestaña que se arrastra (chica, llena y se mueve en cada cuadro).
    const fantasma = await p.evaluate(() => { const d = document.querySelector('.co-daytab[data-coach="edit-day"]').cloneNode(true);
      d.classList.add('co-drag-ghost', 'co-day-ghost'); d.classList.remove('on'); document.body.appendChild(d); const s = getComputedStyle(d);
      const v = [s.backdropFilter, s.backgroundImage.slice(s.backgroundImage.lastIndexOf('linear-gradient('))]; d.remove(); return v; });
    t.ok(fantasma[0] === 'none' && /^linear-gradient\(rgb\(/.test(fantasma[1]), 'la pestaña que se arrastra va llena y sin desenfoque: ' + fantasma.join(' / '));

    // Las ventanas: vidrio con desenfoque y, adentro, nada opaco (#12151B / #0B0D11); se lee.
    // «+ Agregar ejercicio» → selector de ejercicios.
    await p.click('.co-rt-add-end'); await wait(700);
    t.ok(await p.$('#coachSheetHost .cp-modal'), 'se abre el selector de ejercicios');
    t.ok((await p.evaluate(() => getComputedStyle(document.querySelector('#coachSheetHost .cp-modal')).backdropFilter)) !== 'none', 'el selector de ejercicios es vidrio con desenfoque');
    t.eq(await p.evaluate(OPACOS, '#coachSheetHost'), [], 'selector de ejercicios: sin bloques opacos adentro (grupos musculares, buscador)');
    revisar(t, 'Oscuro, selector de ejercicios', await contraste(p, [['grupos musculares', '#coachSheetHost .cp-cat']]), [['grupos musculares']]);
    await p.keyboard.press('Escape'); await wait(300);
    await p.evaluate(() => { const b = document.querySelector('#coachSheetHost .cp-bg'); if (b) b.click(); }); await wait(500);
    // «+ Programar una rutina nueva»: «Cancelar» en vidrio.
    await p.evaluate(() => { document.getElementById('coachHost').scrollTop = 0; });
    await p.click('[data-coach="sched-new"]'); await wait(700);
    t.ok(await p.$('#applyMount .cp-ccard'), 'se abre «Programar una rutina nueva»');
    t.eq(await p.evaluate(OPACOS, '#applyMount'), [], '«Programar una rutina nueva»: sin bloques opacos adentro («Cancelar»)');
    revisar(t, 'Oscuro, programar', await contraste(p, [['«Cancelar»', '#applyMount .logout-btn']]), [['«Cancelar»']]);
    await p.evaluate(() => { const b = document.querySelector('#applyMount [data-coach="sp-cancel"].logout-btn, #applyMount .cp-bg'); if (b) b.click(); }); await wait(500);
    // «Mi plan»: las tarjetas de los planes y el estado.
    await go(p, 'inicio');
    await p.click('.pl-banner[data-plan="open"]'); await wait(700);
    t.ok(await p.$('#planSheetHost .pl-card'), 'se abre «Mi plan»');
    t.eq(await p.evaluate(OPACOS, '#planSheetHost'), [], '«Mi plan»: sin bloques opacos adentro (tarjetas, estado)');
    const best = () => getComputedStyle(document.querySelector('#planSheetHost .pl-card.best')).borderTopColor;
    t.eq(await p.evaluate(best), await conHojaApagada(p, best), '«Mi plan»: el «Más elegido» conserva su borde');
    revisar(t, 'Oscuro, Mi plan', await contraste(p, [['clientes y precio', '#planSheetHost :is(.pl-max, .pl-price)'], ['estado', '#planSheetHost .pl-status']]), [['clientes y precio'], ['estado']]);
    await p.evaluate(() => { const b = document.querySelector('#planSheetHost .cp-bg'); if (b) b.click(); }); await wait(600);
    await go(p, 'editor'); // lo de abajo mira el editor

    // La capa del fondo y la aurora: una sola capa fija de pantalla completa (la del panel).
    const capas = await p.evaluate(() => {
      const out = [];
      const full = (s, r) => s.position === 'fixed' && s.display !== 'none' && s.visibility !== 'hidden' && (r ? r.width >= innerWidth - 1 && r.height >= innerHeight - 1 : [s.top, s.right, s.bottom, s.left].every(v => v === '0px'));
      for (const e of document.querySelectorAll('body, body *')) {
        if (e.id === 'coachHost') continue; // el que tiene el scroll: transparente
        const n = e === document.body ? 'body' : String(e.className || e.tagName);
        const s = getComputedStyle(e); if (full(s, e.getBoundingClientRect())) out.push({ n, will: s.willChange });
        for (const ps of ['::before', '::after']) { const q = getComputedStyle(e, ps); if (q.content !== 'none' && full(q)) out.push({ n: n + ps, will: q.willChange }); }
      }
      return out;
    });
    t.eq(capas.map(c => c.n), ['body::after'], 'una sola capa fija de pantalla completa: la del fondo del panel (la aurora no se pinta): ' + JSON.stringify(capas));
    t.eq(capas.filter(c => c.will !== 'auto').length, 1, 'y es la única con will-change');
    // will-change en toda la página: la capa del fondo y las dos luces (capas chicas), nada más.
    const wills = await p.evaluate(() => {
      const out = [], W = innerWidth * innerHeight;
      for (const e of [document.documentElement, ...document.querySelectorAll('body, body *')]) for (const ps of [null, '::before', '::after']) {
        const q = getComputedStyle(e, ps); if ((ps && q.content === 'none') || q.willChange === 'auto') continue;
        out.push([(e === document.body ? 'body' : String(e.className).split(' ').pop()) + (ps || ''), q.willChange, +(parseFloat(q.width) * parseFloat(q.height) / W).toFixed(2)]);
      }
      return out;
    });
    t.eq(wills.map(w => w[0] + ' ' + w[1]), ['body::after transform', 'app-aurora::before transform, opacity', 'app-aurora::after transform, opacity'],
      'will-change solo en la capa del fondo y en las dos luces: ' + JSON.stringify(wills));
    t.ok(wills.slice(1).every(w => w[2] <= 0.4), 'compu: las luces son capas chicas (≤ 40 % de la pantalla cada una): ' + JSON.stringify(wills));

    // Apilado: los filetes (z 3) adentro de su tarjeta y el panel de la barra adentro de la barra.
    const ap = await p.evaluate(() => {
      const malos = [];
      for (const e of document.querySelectorAll('#coachHost *')) {
        const a = getComputedStyle(e, '::after');
        if (a.content !== 'none' && a.zIndex === '3' && /linear-gradient\(1[56]\d?deg/.test(a.backgroundImage) && getComputedStyle(e).isolation !== 'isolate') malos.push(e.className);
      }
      const side = document.querySelector('.cv-side');
      return { malos, n: document.querySelectorAll('#coachHost .cv-card').length, side: getComputedStyle(side).isolation, before: getComputedStyle(side, '::before').zIndex };
    });
    t.eq(ap.malos, [], 'cada tarjeta con filete en el ::after (z 3) lo deja adentro (isolation: isolate)');
    t.eq([ap.side, ap.before], ['isolate', '-1'], 'la barra lateral: su panel de vidrio (z -1) queda adentro de la barra');

    // Foco: el campo conserva su borde de siempre (el de css/ui y editor.css), sin foco va hundido.
    const borde = () => p.evaluate(() => { const e = document.querySelector('.co-dayname'); return { b: getComputedStyle(e).borderTopColor, bg: getComputedStyle(e).backgroundColor }; });
    const quieto = await borde();
    await p.focus('.co-dayname'); await wait(150);
    const foco = await borde();
    await p.evaluate(h => { document.querySelector(h).sheet.disabled = true; }, HOJA); await wait(100);
    const focoAntes = await borde();
    await p.evaluate(h => { document.querySelector(h).sheet.disabled = false; }, HOJA); await wait(100);
    t.eq(quieto.b, 'rgba(255, 255, 255, 0.09)', 'sin foco, el campo va con el filete fino del vidrio');
    t.eq(foco, focoAntes, 'con foco, el campo queda como siempre (borde y fondo de foco): ' + JSON.stringify(foco));
    t.ok(foco.b !== quieto.b, 'con foco el borde cambia (se ve dónde estás escribiendo): ' + foco.b);
    await p.evaluate(() => document.activeElement.blur());

    // Arrastrar para unir en superserie: la tarjeta de destino conserva su tinte de rutinas.css.
    const destino = () => p.evaluate(() => { const e = document.querySelector('.co-exc-grid > .co-exc-collapsed[data-id="e2"]'); const s = getComputedStyle(e);
      return s.backgroundColor + ' ' + s.backgroundImage + ' ' + s.borderTopColor; });
    await p.evaluate(() => document.querySelector('.co-exc[data-id="e2"]').classList.add('co-drop-target')); await wait(400); // (el borde tiene transición)
    const conHoja = await destino();
    await p.evaluate(h => { document.querySelector(h).sheet.disabled = true; }, HOJA); await wait(400);
    const sinHoja = await destino();
    await p.evaluate(h => { document.querySelector(h).sheet.disabled = false; }, HOJA);
    await p.evaluate(() => document.querySelector('.co-exc[data-id="e2"]').classList.remove('co-drop-target'));
    t.eq(conHoja, sinHoja, 'al arrastrar, la tarjeta donde se suelta conserva su tinte: ' + conHoja.slice(0, 90));

    t.ok((await sinCambios(p)).length > 0, 'en «Oscuro» la hoja sí cambia el panel');
    t.eq(errs, [], 'Oscuro, compu: errores de la página');
    await close();
  }

  // ---- «Oscuro», celular ----
  {
    const { p, errs, close } = await abrir(base, { vp: M, touch: true });
    await p.goto(base + '/app/'); await wait(3500);
    const leer = async (vista, sels) => { await go(p, vista); revisar(t, 'Oscuro, celular, ' + vista, await contraste(p, sels), sels); };
    await leer('clientes', [['barra de abajo', '.cv-nav-i'], ['franja de arriba («Salir»)', '.cv-util-i'], ['actividad', '.co-act-date']]);
    await leer('config', [['secciones', '.cs-nav-i'], ['botones de Tema', '.cs-tema-opt'], ['«Toque de color en los bordes»', '.cs-neon > span']]);
    // «Configuración» elegida en la franja de arriba: se distingue de las otras (como antes) y conserva su borde.
    const util = () => [...document.querySelectorAll('.cv-util-i')].map(e => { const s = getComputedStyle(e); return { on: e.classList.contains('on'), bg: s.backgroundImage + ' ' + s.backgroundColor, b: s.borderTopColor }; });
    const u = await p.evaluate(util), us = await conHojaApagada(p, util);
    const uOn = u.find(x => x.on), uOff = u.find(x => !x.on);
    t.ok(uOn && uOff && uOn.bg !== uOff.bg, 'celular: «Configuración» elegida se distingue de los otros botones de arriba: ' + JSON.stringify([uOn, uOff]));
    t.eq(uOn && uOn.b, (us.find(x => x.on) || {}).b, 'celular: «Configuración» elegida conserva su borde de siempre');
    await leer('menu', [['menú ⋯', '.co-exc-open .co-pop-item:not(:disabled)'], ['«+ Agregar ejercicio»', '.co-ins-b'], ['«3 series»', '.co-exc-sum']]);
    // Sin sombras grandes con desenfoque en el celular (con ellas el scroll del editor pintaba el doble).
    const pesadas = await p.evaluate(() => [...document.querySelectorAll('#coachHost :is(.co-exc, .co-ss-group, .cv-card, .co-trow, .pl-banner, .ptile)')]
      .map(e => [String(e.className).split(' ')[0], getComputedStyle(e).boxShadow]));
    const conBlur = pesadas.filter(([, v]) => DESENFOQUES(v).some(b => b > 2));
    t.ok(pesadas.length > 0 && conBlur.length === 0, 'celular: filas y tarjetas sin sombras con desenfoque (' + pesadas.length + ' revisadas): ' + JSON.stringify(conBlur.slice(0, 3)));
    // Las luces, más chicas en el celular y lejos de la franja de arriba (antes teñían el logo y «Salir»):
    // dónde queda lo que se ve de cada una (en % de la pantalla: radios, centro y borde de arriba) al
    // principio, a la mitad y al final de su vuelta.
    await frenarLuces(p);
    const luces = await p.evaluate(async bg => {
      const au = document.querySelector('.app-aurora'), W = innerWidth, H = innerHeight, out = [], m0 = await import(bg);
      for (const ps of ['::before', '::after']) for (const f of [0, 0.5, 1]){
        m0.pintarLuces([f, f]);
        const q = getComputedStyle(au, ps), m = new DOMMatrixReadOnly(q.transform), [ox, oy] = q.transformOrigin.split(' ').map(parseFloat);
        const g = q.backgroundImage.match(/^radial-gradient\(([\d.]+)% ([\d.]+)% at ([\d.]+)% ([\d.]+)%/);
        if (!g) { out.push(null); continue; }
        const [rx, ry, cx, cy] = g.slice(1).map(v => v / 100), w = parseFloat(q.width) * m.m11, h = parseFloat(q.height) * m.m22;
        const x = parseFloat(q.left) + ox * (1 - m.m11) + m.m41, y = parseFloat(q.top) + oy * (1 - m.m22) + m.m42;
        out.push([rx * w / W, ry * h / H, (y + cy * h) / H, (y + cy * h - ry * h) / H].map(v => Math.round(v * 1000) / 10));
      }
      return out;
    }, BG);
    await soltarLuces(p);
    t.ok(luces.length === 6 && luces.every(l => l && l[0] <= 62 && l[1] <= 24 && l[2] >= 30 && l[3] >= 12),
      'celular: dos luces chicas (lo que se ve ≤ 62 % × 24 %), lejos de la franja de arriba en todo su recorrido: ' + JSON.stringify(luces));
    await go(p, 'editor');
    await seNotan(t, p, 'Oscuro, celular, editor', 12);
    t.eq(errs, [], 'Oscuro, celular: errores de la página');
    await close();
  }

  // ---- Las otras apariencias: la hoja no cambia nada ----
  for (const tema of ['claro', 'azul', 'rosa']){
    const { p, errs, close } = await abrir(base, { tema });
    await p.goto(base + '/app/'); await wait(3500);
    for (const vista of ['inicio', 'clientes', 'menu', 'config']){
      await go(p, vista);
      const d = await sinCambios(p);
      t.eq(d.slice(0, 5), [], tema + ', ' + vista + ': la hoja de vidrio no cambia nada (' + d.length + ' estilos distintos)');
    }
    t.eq(errs, [], tema + ': errores de la página');
    await close();
  }
  {
    const { p, errs, close } = await abrir(base, { vp: M, touch: true, tema: 'azul' });
    await p.goto(base + '/app/'); await wait(3500);
    await go(p, 'menu');
    t.eq((await sinCambios(p)).slice(0, 5), [], 'azul, celular: la hoja de vidrio no cambia nada');
    t.eq(errs, [], 'azul, celular: errores de la página');
    await close();
  }

  // ---- La app del alumno: la hoja no cambia nada ----
  for (const [nombre, init] of [['Oscuro', ''], ['Claro', TEMA.claro], ['sin neón', "localStorage.setItem('gize_neon','0');"]]){
    const { p, errs, close } = await newPage({ user: ALUMNO, viewport: M, touch: true, handlers: { '/profiles': profile('client') },
      state: { days: [{ id: 'd1', name: 'Pierna', exercises: [{ id: 'a1', name: 'Sentadilla', sets: [{ id: 's1', kg: '', reps: '' }] }] }], sessions: [], weights: [], daily: {} },
      init: "localStorage.setItem('gize_lite','0');" + init });
    await p.goto(base + '/app/'); await wait(3500);
    t.ok(!await p.evaluate(() => document.body.classList.contains('silk-coach')), 'alumno (' + nombre + '): no es el panel del coach');
    t.eq((await sinCambios(p)).slice(0, 5), [], 'alumno (' + nombre + '): la hoja de vidrio no cambia nada');
    t.eq(errs, [], 'alumno (' + nombre + '): errores de la página');
    await close();
  }

  // ---- «Reducir transparencia» y «reducir movimiento»: sólido, sin desenfoque, quieto ----
  {
    const { p, errs, close } = await abrir(base, { reducedMotion: 'reduce' });
    const cdp = await p.context().newCDPSession(p);
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
    await p.goto(base + '/app/'); await wait(3500);
    t.ok(await p.evaluate(() => matchMedia('(prefers-reduced-transparency: reduce)').matches && matchMedia('(prefers-reduced-motion: reduce)').matches), 'el navegador pide menos transparencia y menos movimiento');
    await go(p, 'clientes');
    const fondo = (sel, ps) => p.evaluate(([sel, ps]) => { const e = document.querySelector(sel); if (!e) return null; const s = getComputedStyle(e, ps || null);
      return { bg: s.backgroundImage + ' ' + s.backgroundColor, blur: s.backdropFilter }; }, [sel, ps]);
    // Los tokens del vidrio, sólidos y sin desenfoque.
    const tokens = await p.evaluate(() => { const s = getComputedStyle(document.body);
      return ['--cg-fill', '--cg-row', '--cg-group', '--cg-step', '--cg-pop', '--cg-nav-fill', '--cg-side-fill', '--cg-chip', '--cg-chip-on', '--cg-well', '--cg-pit', '--cg-ins', '--cg-blur', '--cg-card-blur']
        .map(k => k + ': ' + s.getPropertyValue(k).trim()); });
    t.ok(tokens.every(x => /: (rgb\(\d+, ?\d+, ?\d+\)|none)$/.test(x)), 'menos transparencia: los rellenos del vidrio son sólidos y sin desenfoque: ' + JSON.stringify(tokens));
    // También en liviano y en la app de Android (sus reglas tienen más peso: «menos transparencia» gana igual).
    for (const cls of ['lite', 'android-app']){
      await p.evaluate(c => document.documentElement.classList.add(c), cls); await wait(100);
      const tk = await p.evaluate(() => { const s = getComputedStyle(document.body); return ['--cg-pop', '--cg-nav-fill', '--cg-fill', '--cg-row', '--cg-blur'].map(k => k + ': ' + s.getPropertyValue(k).trim()); });
      await p.evaluate(c => document.documentElement.classList.remove(c), cls);
      t.ok(tk.every(x => /: (rgb\(\d+, ?\d+, ?\d+\)|none)$/.test(x)), 'menos transparencia + ' + cls + ': rellenos sólidos (menús, ventanas, píldora): ' + JSON.stringify(tk));
    }
    // Y en lo que se ve: el relleno es un color sólido; arriba solo quedan los brillos blancos.
    const solido = v => { const cs = (v.bg.match(/rgba?\([^)]*\)/g) || []).map(c => c.match(/[\d.]+/g).map(Number))
      .filter(([r, g, b, a = 1]) => a > 0 && !(r === 255 && g === 255 && b === 255));
      return cs.length > 0 && cs.every(([, , , a = 1]) => a === 1); };
    for (const [n, sel, ps] of [['tarjeta', '.cv-card'], ['tabla', '.co-table'], ['barra lateral', '.cv-side', '::before'], ['ficha', '.cv-tile:not(button)'], ['campo', '.co-search']]){
      const v = await fondo(sel, ps);
      t.ok(v && solido(v), 'menos transparencia: ' + n + ' con relleno sólido: ' + (v && v.bg.slice(0, 160)));
    }
    await go(p, 'menu');
    for (const [n, sel] of [['menú ⋯', '.co-exc-open .co-day-pop'], ['número', '.co-exc-collapsed .co-exc-ord'], ['día sin elegir', '.co-daytab:not(.on)']]){
      const v = await fondo(sel);
      t.ok(v && solido(v) && v.blur === 'none', 'menos transparencia: ' + n + ' sólido y sin desenfoque: ' + (v && v.bg.slice(0, 160)) + ' / ' + (v && v.blur));
    }
    const capa = await p.evaluate(() => { const s = getComputedStyle(document.body, '::after');
      return [s.content !== 'none', s.animationName, s.transitionDuration.split(',').every(d => parseFloat(d) === 0),
        document.getAnimations().filter(a => a.effect && a.effect.target === document.body).length]; });
    t.eq(capa, [true, 'none', true, 0], 'menos movimiento: la capa del fondo está y no tiene animación ni transición');
    t.eq(await p.evaluate(LUCES, BG), QUIETAS, 'menos movimiento y menos transparencia: las luces quietas en la capa del fondo, sin sus capas');
    t.eq(errs, [], 'menos transparencia: errores de la página');
    await close();
  }
  // Cada uno por su lado: con «reducir movimiento» o con «reducir transparencia», las luces quietas.
  for (const [n, rm, rt] of [['reducir movimiento', 'reduce', 'no-preference'], ['reducir transparencia', 'no-preference', 'reduce']]){
    const { p, errs, close } = await abrir(base, { reducedMotion: rm });
    const cdp = await p.context().newCDPSession(p);
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: rt }] });
    await p.goto(base + '/app/'); await wait(3500);
    t.eq(await p.evaluate(LUCES, BG), QUIETAS, n + ': las luces quietas en la capa del fondo, sin sus capas');
    t.eq(errs, [], n + ': errores de la página');
    await close();
  }

  // ---- Colores forzados (contraste alto): sin la capa del fondo ----
  {
    const { p, errs, close } = await abrir(base);
    await p.emulateMedia({ forcedColors: 'active' });
    await p.goto(base + '/app/'); await wait(3500);
    t.eq(await p.evaluate(() => [matchMedia('(forced-colors: active)').matches, getComputedStyle(document.body, '::after').content]), [true, 'none'],
      'colores forzados: el panel no pinta su capa de fondo');
    t.eq((await p.evaluate(LUCES, BG)).slice(0, 2), [['none', 'none'], false], 'colores forzados: tampoco las luces');
    t.eq(errs, [], 'colores forzados: errores de la página');
    await close();
  }

  // ---- Liviano, app de Android y GIZE básico ----
  {
    const { p, errs, close } = await abrir(base);
    await p.goto(base + '/app/'); await wait(3500);
    await go(p, 'menu');
    const ver = async () => Object.assign({ luces: await p.evaluate(LUCES, BG) }, await p.evaluate(() => { const s = getComputedStyle(document.body, '::after'), pop = document.querySelector('.co-exc-open .co-day-pop');
      const ex = getComputedStyle(document.querySelector('.co-exc-collapsed'));
      return { capa: s.content !== 'none', will: s.willChange, grano: /url\(/.test(s.backgroundImage), aurora: getComputedStyle(document.querySelector('.app-aurora')).visibility,
        auroraBg: getComputedStyle(document.querySelector('.app-aurora')).backgroundImage.slice(0, 16), blur: getComputedStyle(pop).backdropFilter,
        tok: getComputedStyle(document.body).getPropertyValue('--cg-blur').trim(), sombra: ex.boxShadow, brillo: !/^none/.test(ex.backgroundImage) }; }));
    const normal = await ver();
    t.eq([normal.capa, normal.will, normal.grano, normal.aurora], [true, 'transform', true, 'hidden'], 'normal: la capa con grano y capa propia; la aurora sin pintarse');
    t.eq(normal.luces, MOVIDAS, 'normal: las luces en sus dos capas, moviéndose (la capa del fondo sin luces)');
    t.eq(normal.blur, 'none', 'normal: el menú ⋯ sin desenfoque (chico y casi lleno: no se veía)');
    t.ok(normal.tok !== 'none' && /blur/.test(normal.tok), 'normal: las ventanas y la píldora sí llevan desenfoque: ' + normal.tok);
    t.ok(Math.max(...DESENFOQUES(normal.sombra)) >= 20 && normal.brillo, 'normal (compu): las filas con su sombra y su brillo: ' + normal.sombra);
    // (las filas tienen transición en la sombra: se espera a que termine)
    await p.evaluate(() => document.documentElement.classList.add('lite')); await wait(1200);
    const lite = await ver();
    t.eq([lite.capa, lite.grano, lite.blur, lite.tok], [true, false, 'none', 'none'], 'liviano: la capa sin grano y nada con desenfoque');
    t.eq(lite.luces, QUIETAS, 'liviano: las luces quietas en la capa del fondo, sin sus capas');
    t.eq([DESENFOQUES(lite.sombra), lite.brillo], [[], false], 'liviano: las filas sin sombras con desenfoque ni brillo (solo la luz interna): ' + lite.sombra);
    await p.evaluate(() => { document.documentElement.classList.remove('lite'); document.documentElement.classList.add('android-app'); }); await wait(1200);
    const android = await ver();
    t.eq([android.capa, android.will, android.blur, android.tok], [true, 'auto', 'none', 'none'], 'app de Android: la capa sin will-change y nada con desenfoque');
    t.eq(android.luces, QUIETAS, 'app de Android: las luces quietas en la capa del fondo, sin sus capas (ver vidrio.css, 2b)');
    t.eq([DESENFOQUES(android.sombra), android.brillo], [[], false], 'app de Android: las filas sin sombras con desenfoque ni brillo: ' + android.sombra);
    await p.evaluate(() => document.documentElement.classList.add('lite', 'basico'));
    const basico = await ver();
    t.eq([basico.capa, basico.aurora, basico.auroraBg], [false, 'visible', 'linear-gradient('], 'GIZE básico: sin la capa; queda la aurora con el degradé liso de siempre');
    t.eq(basico.luces.slice(0, 2), [['none', 'none'], false], 'GIZE básico: sin las luces');
    t.eq(errs, [], 'liviano / Android / básico: errores de la página');
    await close();
  }
}
