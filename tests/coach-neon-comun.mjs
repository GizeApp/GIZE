// Lo común de tests/coach-neon-todo.test.mjs y tests/coach-neon-temas.test.mjs (el filete de neón del
// panel del coach, css/screens/coach/neon.css): el coach de prueba con sus clientes y su rutina, cómo
// abrir el panel en cada apariencia y moverse por las vistas, y cómo leer el filete, el resplandor,
// las cajas, los estilos, el contraste y lo pintado en la captura. No es una prueba (no termina en
// .test.mjs): la importan las dos, y las del neón de la app del alumno (tests/neon-app*.test.mjs), que
// le pasan su hoja (css/ui/neon-app.css) y su zona a hoja(), seMueve(), sinCambios(), contrasteIgual()
// y recortan().
import { newPage, wait, configCoach } from './lib.mjs';

const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
const ymd = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(d);
const ago = n => ymd(new Date(Date.now() - n * 86400000));
const CLIENTES = [['c1', 'Camila Benítez', 0, 42], ['c2', 'Facundo Romero', 1, 27], ['c3', 'Joaquín Sosa', 3, 15], ['c4', 'Martina Giménez', 2, 33], ['c5', 'Nicolás Paz', 9, 21]]
  .map(([k, n, d, s]) => ({ id: k.replace('c', 'c1000000-0000-4000-8000-00000000000'), n, d, s }));
const ABRIR = CLIENTES[3].id;
const ej = (k, name, extra) => Object.assign({ id: 'e' + k, name, rir: '2', rest: '90 seg',
  sets: [0, 1, 2].map(j => ({ id: 'e' + k + 's' + j, kg: '', reps: '', target: j === 0 ? '10-12' : '8-10' })) }, extra || {});
// El primer día se repite lunes y jueves: así hay días de «Se repite» elegidos.
const RUTINA = [
  { id: 'd0', name: 'Pierna', subtitle: '', dias: [1, 4], exercises: [ej(0, 'Sentadilla libre'), ej(1, 'Prensa 45°'), ej(2, 'Peso muerto rumano'),
    ej(3, 'Camilla de cuádriceps', { ss: true }), ej(4, 'Sillón de isquiotibiales'), ej(5, 'Gemelos parado')] },
  { id: 'd1', name: 'Empuje', subtitle: '', exercises: [ej(10, 'Press banca')] },
  { id: 'd2', name: 'Tracción', subtitle: '', exercises: [ej(20, 'Dominadas')] },
];
const TPL = { id: 'a0000000-0000-4000-8000-000000000001', coach_id: COACH.id, name: 'Fuerza en 3 días', days: RUTINA };
const handlers = {
  '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
    if (/coach_id=eq/.test(i.url.search)) return J(CLIENTES.map(c => ({ id: c.id, full_name: c.n, avatar_path: null }))); return J(i.one ? me : [me]); },
  '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 30, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
  '/rpc/my_invite_code': (r, J) => J('K7M2Q9XA'),
  '/rpc/coach_client_stats': (r, J) => J(CLIENTES.map(c => ({ client_id: c.id, n_sessions: c.s, last_session: ago(c.d) }))),
  '/routines': (r, J, i) => { if (i.m !== 'GET') return undefined; const id = (i.url.search.match(/client_id=eq\.([\w-]+)/) || [])[1];
    const row = { days: id === ABRIR ? RUTINA : [{ id: 'x0', name: 'Full body A' }] }; return J(i.one ? row : [row]); },
  '/routine_templates': (r, J, i) => i.m === 'GET' ? J([TPL]) : undefined, '/routine_schedule': (r, J) => J([]),
};
const D = { width: 1440, height: 900 }, M = { width: 390, height: 844 };
const TEMA = { oscuro: '', claro: "localStorage.setItem('gize_tema','luz');", azul: "localStorage.setItem('gize_tema','azul');", rosa: "localStorage.setItem('gize_tema','rosa');" };
const abrir = (base, { vp = D, tema = 'oscuro', neon = true, touch = false, reducedMotion, init = '' } = {}) =>
  newPage({ user: COACH, viewport: vp, touch, reducedMotion, handlers,
    init: "localStorage.setItem('gize_lite','0');" + TEMA[tema] + (neon ? '' : "localStorage.setItem('gize_neon','0');") + init });

const cerrarVentanas = p => p.evaluate(() => {
  for (const s of ['#applyMount .cp-bg', '#coachSheetHost .cp-bg']) { const b = document.querySelector(s); if (b) b.click(); }
  document.querySelectorAll('details.co-day-menu[open]').forEach(d => { d.open = false; });
});
async function go(p, vista){
  const click = async sel => { await p.click(sel); await wait(600); };
  await cerrarVentanas(p); await wait(400);
  if (await p.$('#coachHost .cs-layout') && vista !== 'config') await click('[data-coach="settings-back"]');
  if (vista === 'inicio') await click('[data-coach="view-home"]');
  else if (vista === 'clientes') await click('[data-coach="view-clients"]');
  else if (vista === 'rutinas') await click('[data-coach="view-tpls"]');
  else if (vista === 'config') await configCoach(p, 'apariencia');
  else {
    if (!await p.$('.cv-ctabs')) { await click('[data-coach="view-clients"]'); await click(`[data-coach="open"][data-id="${ABRIR}"]`); await wait(500); }
    await click('[data-coach="client-tab"][data-t="rutina"]');
    if (vista === 'mas') {
      // «Más opciones» del segundo ejercicio abierto: Reps / Tiempo.
      if (!await p.$('.co-exc-open[data-id="e1"]')) await click('.co-exc[data-id="e1"] .co-exc-chev');
      if (!await p.$('.co-exc[data-id="e1"] .co-more-btn.on')) await click('.co-exc[data-id="e1"] .co-more-btn');
      await p.evaluate(() => { const h = document.getElementById('coachHost'), c = document.querySelector('.co-exc-open .co-seg') || document.querySelector('.co-exc[data-id="e1"]'); h.scrollTop += c.getBoundingClientRect().top - 300; });
      await wait(200); return;
    }
    if (vista === 'menu') {
      if (!await p.$('.co-exc-open[data-id="e1"]')) await click('.co-exc[data-id="e1"] .co-exc-chev');
      await p.evaluate(() => { const h = document.getElementById('coachHost'), c = document.querySelector('.co-exc[data-id="e1"]'); h.scrollTop += c.getBoundingClientRect().top - 150; });
      await click('.co-exc-open .co-exc-menu2 > summary');
      return;
    }
    if (vista === 'fin') {
      await p.evaluate(() => { const h = document.getElementById('coachHost'), c = document.querySelector('.co-rt-add-end'); h.scrollTop += c.getBoundingClientRect().top - innerHeight / 2; });
      await wait(200); return;
    }
    await p.evaluate(() => { document.getElementById('coachHost').scrollTop = 0; });
    if (vista === 'programar') { await click('[data-coach="sched-new"]'); await wait(300); return; }
  }
  await p.evaluate(() => { const h = document.getElementById('coachHost'); if (h) h.scrollTop = 0; });
  await wait(250);
};

// ---------- Lo que se lee de cada cosa ----------
const HOJA = 'link[href$="screens/coach/neon.css"]';
const hoja = (p, on, h = HOJA) => p.evaluate(([h, on]) => { document.querySelector(h).sheet.disabled = !on; }, [h, on]).then(() => wait(150));
// El primero que se ve de cada selector: su ::after (el filete), su ::before (el resplandor) y sus bordes.
const LEER = sel => {
  const e = [...document.querySelectorAll(sel)].find(x => x.getClientRects().length);
  if (!e) return null;
  const s = getComputedStyle(e), a = getComputedStyle(e, '::after'), b = getComputedStyle(e, '::before');
  return { after: a.content === 'none' ? null : { bg: a.backgroundImage, mask: a.maskImage || a.webkitMaskImage, anim: a.animationName, pos: a.position, z: a.zIndex },
    before: b.content === 'none' ? null : { sh: b.boxShadow, anim: b.animationName },
    bordes: [s.borderTopColor, s.borderRightColor, s.borderBottomColor, s.borderLeftColor], estilo: s.borderTopStyle, ancho: parseFloat(s.borderTopWidth) || 0, sombra: s.boxShadow,
    lado: s.borderImageSource, outline: [s.outlineStyle, s.outlineWidth, s.outlineColor], trans: [s.transitionProperty, s.transitionDuration] };
};
const leer = (p, sel) => p.evaluate(LEER, sel);
// Colores de un valor de CSS en 0–255 (rgb, rgba y color(srgb …), como sale un color-mix calculado).
const colores = v => (String(v || '').match(/rgba?\([^)]*\)|color\(srgb[^)]*\)/g) || []).map(c => {
  const n = c.replace('srgb', '').match(/-?[\d.]+(e-?\d+)?/g).map(Number);
  const [r, g, b, a = 1] = c.startsWith('color') ? n.slice(0, 3).map(x => x * 255).concat(n.slice(3)) : n;
  return [r, g, b, a];
});
const conTinte = ([r, g, b, a]) => a > 0.05 && Math.max(r, g, b) - Math.min(r, g, b) > 24;
const tinte = v => colores(v).some(conTinte);
// Lo fuerte del filete: la suma de alfas de sus colores (más alto = más claro/más color).
const fuerza = v => colores(v).reduce((n, c) => n + c[3], 0);
const tono = ([r, g, b]) => { const M = Math.max(r, g, b), m = Math.min(r, g, b); if (M === m) return 0;
  const d = M - m; const h = M === r ? (g - b) / d % 6 : M === g ? (b - r) / d + 2 : (r - g) / d + 4; return (h * 60 + 360) % 360; };
const dTono = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
const hex = h => { h = h.trim().replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
const F155 = /linear-gradient\(155deg/, F160 = /linear-gradient\(160deg/;
// El filete de neón: ::after con máscara, degradé a 155° con color y con un neutro (como las tarjetas).
const conNeon = v => !!(v && v.after && F155.test(v.after.bg) && v.after.mask && v.after.mask !== 'none' && tinte(v.after.bg) && v.after.anim === 'none');
const gris = v => !!(v && v.after && F160.test(v.after.bg) && !tinte(v.after.bg) && v.after.mask && v.after.mask !== 'none');
const brillo = v => !!(v && v.before && tinte(v.before.sh));
const transparente = c => /rgba\(0, 0, 0, 0\)|transparent/.test(c);

// Cajas de todo lo que se ve (para ver que nada se mueve con la hoja).
const CAJAS = () => {
  const out = {}; let i = 0;
  for (const e of document.querySelectorAll('body *')) {
    if (e.closest('svg') && e.tagName.toLowerCase() !== 'svg') continue;
    const r = e.getBoundingClientRect(); i++;
    if (!r.width && !r.height) continue;
    out[i + ' ' + e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0]] = [r.x, r.y, r.width, r.height].map(v => Math.round(v * 100) / 100).join(',');
  }
  return out;
};
async function seMueve(p, h = HOJA){
  const con = await p.evaluate(CAJAS); await hoja(p, false, h);
  const sin = await p.evaluate(CAJAS); await hoja(p, true, h);
  const otra = await p.evaluate(CAJAS);
  return Object.keys(con).filter(k => con[k] === otra[k] && con[k] !== sin[k]).map(k => k + ': ' + sin[k] + ' → ' + con[k]);
}

// Estilos calculados de toda la página (app del alumno): con la hoja, sin ella y con ella otra vez.
const ESTILOS = () => {
  const P = ['backgroundColor', 'backgroundImage', 'borderTopColor', 'borderLeftColor', 'borderImageSource', 'boxShadow', 'position', 'isolation', 'zIndex', 'color', 'maskImage', 'content', 'transitionDuration'];
  const out = {}; let i = 0;
  for (const e of [document.documentElement, ...document.querySelectorAll('body, body *')]) for (const ps of [null, '::before', '::after']) {
    const s = getComputedStyle(e, ps);
    out[e.tagName + '.' + String(e.className).split(' ')[0] + (ps || '') + ' @' + (i++)] = ps && s.content === 'none' ? 'none' : P.map(k => s[k]).join('|');
  }
  return out;
};
async function sinCambios(p, h = HOJA){
  const con = await p.evaluate(ESTILOS); await hoja(p, false, h);
  const sin = await p.evaluate(ESTILOS); await hoja(p, true, h);
  const otra = await p.evaluate(ESTILOS);
  return Object.keys(con).filter(k => con[k] === otra[k] && con[k] !== sin[k]);
}

// ---------- Contraste contra el fondo real (como tests/coach-vidrio.test.mjs) ----------
const VENTANAS = '#coachHost, #applyMount, #coachSheetHost, #planSheetHost';
const sinTexto = z => `:is(${z}) *, :is(${z}) *::before, :is(${z}) *::after, :is(${z}) *::placeholder {
  color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; caret-color: transparent !important; }`;
const SIN_TEXTO = sinTexto(VENTANAS);
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
async function medir(p, items, zona = VENTANAS){
  const st = await p.addStyleTag({ content: sinTexto(zona) }); await wait(150);
  const png = (await p.screenshot({ animations: 'disabled', caret: 'hide' })).toString('base64');
  await st.evaluate(e => e.remove());
  return p.evaluate(MEDIR, { png, items });
}
// El contraste de cada texto con la hoja prendida no es menor que con la hoja apagada (la del panel,
// o la que se pase en h; zona: dónde se borran los textos para medir el fondo).
async function contrasteIgual(t, p, donde, sels, { h = HOJA, zona = VENTANAS } = {}){
  const items = await p.evaluate(TEXTOS, sels);
  const con = await medir(p, items, zona); await hoja(p, false, h);
  const sin = await medir(p, items, zona); await hoja(p, true, h);
  for (const [n] of sels){
    const idx = items.map((it, i) => it.n === n ? i : -1).filter(i => i >= 0);
    if (!idx.length) { t.ok(false, donde + ': no se vio «' + n + '»'); continue; }
    const peor = idx.map(i => ({ t: con[i].t, con: con[i].cr, sin: sin[i].cr })).reduce((a, b) => (b.con - b.sin) < (a.con - a.sin) ? b : a);
    t.ok(peor.con >= peor.sin - Math.max(.15, peor.sin * .03), donde + ': «' + n + '» se lee igual con el neón: el que más cambió «' + peor.t + '» ' + peor.sin + ' → ' + peor.con + ':1 (' + idx.length + ' medidos)');
  }
}

// ---------- Lo pintado (en la captura, decodificada en la página como MEDIR) ----------
// anillo: la croma media de un anillo de 2 a 8 px afuera de la caja (ahí se ve el resplandor).
// borde: el contraste del borde de arriba y del de abajo (a la mitad, rectos) contra lo de afuera.
// raya: el contraste más bajo de la rayita de la pestaña elegida contra el fondo de arriba.
// mancha: el color medio de una caja de la captura.
const PIXELES = async ({ png, jobs }) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + png; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
  const px = (x, y) => [...g.getImageData(Math.round(x), Math.round(y), 1, 1).data].slice(0, 3);
  const lin = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
  const L = q => .2126 * lin(q[0]) + .7152 * lin(q[1]) + .0722 * lin(q[2]);
  const cr = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  const media = ps => [0, 1, 2].map(i => ps.reduce((n, q) => n + q[i], 0) / ps.length);
  return jobs.map(({ k, r: { x, y, w, h } }) => {
    if (k === 'anillo') {
      const ps = [];
      for (let d = 2; d <= 8; d += 2) {
        for (let t = x; t < x + w; t += 3) ps.push(px(t, y - d), px(t, y + h - 1 + d));
        for (let t = y; t < y + h; t += 3) ps.push(px(x - d, t), px(x + w - 1 + d, t));
      }
      return ps.reduce((n, q) => n + Math.max(...q) - Math.min(...q), 0) / ps.length;
    }
    if (k === 'borde') return [[y, -1], [y + h - 1, 1]].map(([y0, dy]) => {
      let n = 0;
      for (let t = -3; t <= 3; t++) { const cx = x + w / 2 + t, fuera = media([3, 4, 5].map(o => px(cx, y0 + dy * o)));
        n += Math.max(cr(px(cx, y0), fuera), cr(px(cx, y0 - dy), fuera)); }
      return Math.round(n / 7 * 100) / 100;
    });
    if (k === 'raya') { // en cada x, la fila de la rayita (de 2 px, puede caer entre píxeles) contra el fondo 6 px arriba
      const crs = []; for (let t = x + 3; t < x + w - 3; t += 2) { const fondo = px(t, y - 6); crs.push(Math.max(...[-2, -1, 0, 1].map(d => cr(px(t, y + d), fondo)))); }
      return Math.round(Math.min(...crs) * 100) / 100; }
    if (k === 'mancha') { const ps = []; for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) ps.push(px(x + i, y + j)); return media(ps); }
    return null;
  });
};
const pixeles = async (p, jobs) => p.evaluate(PIXELES, { png: (await p.screenshot({ animations: 'disabled', caret: 'hide' })).toString('base64'), jobs });
const caja = (p, sel) => p.evaluate(s => { const e = [...document.querySelectorAll(s)].find(x => x.getClientRects().length); if (!e) return null;
  const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; }, sel);
const rayita = p => p.evaluate(() => { const r = document.querySelector('.cv-ctab.on').getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.bottom - 1), w: Math.round(r.width), h: 1 }; });
const croma = q => Math.max(...q) - Math.min(...q);
// Lo que esta hoja suma con el filete sobre el borde (::after con máscara corrido hacia afuera) o con el
// resplandor de afuera (::before con sombra de color que no es inset): con la hoja prendida y no
// apagada. Ninguno puede recortar lo de adentro (overflow), o el filete y el resplandor se cortan.
const RECORTE = zona => [...document.querySelectorAll(zona)].map((e, i) => {
  if (!e.getClientRects().length) return null;
  const a = getComputedStyle(e, '::after'), b = getComputedStyle(e, '::before'), s = getComputedStyle(e);
  const filete = a.content !== 'none' && /linear-gradient\(1(55|60)deg/.test(a.backgroundImage) && (a.maskImage || a.webkitMaskImage) !== 'none' && parseFloat(a.top) < 0;
  const brillo = b.content !== 'none' && b.boxShadow !== 'none' && !/inset/.test(b.boxShadow);
  return filete || brillo ? i + ' ' + e.tagName.toLowerCase() + '.' + String(e.className).trim().split(/\s+/).join('.') + ' → ' + s.overflowX + '/' + s.overflowY : null;
}).filter(Boolean);
async function recortan(p, { h = HOJA, zona = '#coachHost *, #applyMount *' } = {}){
  const con = await p.evaluate(RECORTE, zona); await hoja(p, false, h); const sin = await p.evaluate(RECORTE, zona); await hoja(p, true, h);
  const nuevos = con.filter(x => !sin.includes(x));
  return { n: nuevos.length, malos: nuevos.filter(x => !/→ visible\/visible$/.test(x)) };
}

// Lo que lleva el filete en cada vista: [nombre, selector, elegido].
const QUE = {
  inicio: [['navegación elegida', '.cv-nav-i.on', true]],
  clientes: [['fichas del panel lateral', '.cv-peek .cv-tile:not(button)'], ['rutina del panel lateral', '.cv-peek-rt'], ['cerrar el panel', '.cv-x'], ['«Copiar código»', '.co-invite .co-copy-btn']],
  editor: [['días', '.co-daytab:not(.on):not(.add)'], ['día elegido', '.co-daytab.on', true], ['«+ Programar una rutina nueva»', '.co-sched-new'],
    ['«Se repite»', '.hd-day:not(.on)'], ['«Se repite» elegido', '.hd-day.on', true], ['⋯ del día', '.co-day-bar .co-day-menu > summary'],
    ['«Separar»', '.co-ss-split']],
  fin: [['«Más acciones»', '.co-more-actions > summary']],
  menu: [['menú ⋯', '.co-exc-open .co-day-pop']],
  mas: [['Reps / Tiempo', '.co-exc-open .co-seg'], ['Reps elegido', '.co-exc-open .co-seg-opt.on', true]],
  programar: [['opciones de la ventana', '#applyMount .cp-copt'], ['«Cancelar»', '#applyMount .logout-btn']],
  config: [['Tema elegido', '.cs-tema .cp-copt.on', true], ['sección elegida', '.cs-nav-i.on', true]],
  rutinas: [['días de la rutina', '.cv-pill:not(.on)'], ['día elegido de la rutina', '.cv-pill.on', true]],
};
const QUE_CEL = {
  editor: [['píldora de abajo', '.cv-nav'], ['elegido de la píldora', '.cv-nav-i.on', true], ['franja de arriba', '.cv-util-i'], ['día elegido', '.co-daytab.on', true],
    ['«Se repite» elegido', '.hd-day.on', true], ['«+ Programar una rutina nueva»', '.co-sched-new']],
};

// Las luces del fondo de «Oscuro» cambian una vez por segundo (app/ui/background.js): para comparar
// capturas tomadas en momentos distintos (con la hoja prendida y apagada) se las frena como con la app
// en segundo plano ("pause", que solo frena el fondo y las animaciones).
const quietas = p => p.evaluate(() => document.dispatchEvent(new Event('pause'))).then(() => wait(1200));

export { quietas, COACH, ymd, ago, CLIENTES, ABRIR, ej, RUTINA, TPL, handlers, D, M, TEMA, abrir, cerrarVentanas, go, HOJA, hoja, LEER, leer, colores, conTinte, tinte, fuerza, tono, dTono, hex, F155, F160, conNeon, gris, brillo, transparente, CAJAS, seMueve, ESTILOS, sinCambios, VENTANAS, SIN_TEXTO, TEXTOS, MEDIR, medir, contrasteIgual, PIXELES, pixeles, caja, rayita, croma, RECORTE, recortan, QUE, QUE_CEL };
