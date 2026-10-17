// Panel del coach: el filete de neón en casi todo (css/screens/coach/neon.css). El dueño: «agrégale
// neón a los días, a casi todo: al programar rutina nueva, al panel de la izquierda».
// - Con neón: la barra lateral, el elegido de la navegación (compu y la píldora del celular), la
//   píldora, las pestañas de los días, «+ Programar una rutina nueva», los días de «Se repite», el ⋯ del
//   día y «Más acciones», «Separar», Reps / Tiempo, el menú ⋯, el panel lateral de Clientes y sus
//   fichas, «Copiar código», las secciones y el Tema de Configuración, los días de una rutina en
//   Rutinas, «Cancelar» y las opciones de «Programar una rutina nueva» llevan el filete de las tarjetas
//   (un degradé a 155° con máscara, con el color de la marca en las puntas). Lo elegido, uno más
//   claro y un resplandor suave en el ::before; lo demás, sin resplandor. Al pasar el mouse, más claro.
//   El punteado (agregar día, «+ Agregar ejercicio») y las ventanas, en dos tonos de la marca; la
//   rayita de la pestaña elegida de la ficha, en degradé; los campos con foco suman el resplandor y
//   conservan su borde de foco.
// - Con el neón apagado: los mismos llevan el filete blanco y gris (a 160°, sin color) y lo elegido
//   uno más claro, sin resplandor.
// - Los colores salen de los tokens de cada apariencia (--gize-r1 / --gize-r2): en «Claro», «Azul» y
//   «Rosa» el filete tiene el tono de su gama, y si se cambian los tokens, cambia el filete.
// - No se mueve nada: las cajas de todo lo que se ve son las mismas con la hoja prendida y apagada
//   (compu y celular, en cada vista). El contraste de los textos importantes no baja (medido contra el
//   fondo real, como tests/coach-vidrio.test.mjs). El foco con teclado se sigue viendo igual.
// - La app del alumno no cambia nada (estilos calculados idénticos con la hoja prendida y apagada).
// - Liviano y la app de Android: sin resplandor. GIZE básico: sin filete (los bordes de siempre).
//   Colores forzados: sin filete. «Reducir movimiento»: nada se anima. Nada late ni gira.
import { newPage, wait, configCoach, ALUMNO, profile } from './lib.mjs';

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
const hoja = (p, on) => p.evaluate(([h, on]) => { document.querySelector(h).sheet.disabled = !on; }, [HOJA, on]).then(() => wait(150));
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
async function seMueve(p){
  const con = await p.evaluate(CAJAS); await hoja(p, false);
  const sin = await p.evaluate(CAJAS); await hoja(p, true);
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
async function sinCambios(p){
  const con = await p.evaluate(ESTILOS); await hoja(p, false);
  const sin = await p.evaluate(ESTILOS); await hoja(p, true);
  const otra = await p.evaluate(ESTILOS);
  return Object.keys(con).filter(k => con[k] === otra[k] && con[k] !== sin[k]);
}

// ---------- Contraste contra el fondo real (como tests/coach-vidrio.test.mjs) ----------
const VENTANAS = '#coachHost, #applyMount, #coachSheetHost, #planSheetHost';
const SIN_TEXTO = `:is(${VENTANAS}) *, :is(${VENTANAS}) *::before, :is(${VENTANAS}) *::after, :is(${VENTANAS}) *::placeholder {
  color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; caret-color: transparent !important; }`;
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
async function medir(p, items){
  const st = await p.addStyleTag({ content: SIN_TEXTO }); await wait(150);
  const png = (await p.screenshot({ animations: 'disabled', caret: 'hide' })).toString('base64');
  await st.evaluate(e => e.remove());
  return p.evaluate(MEDIR, { png, items });
}
// El contraste de cada texto con la hoja prendida no es menor que con la hoja apagada.
async function contrasteIgual(t, p, donde, sels){
  const items = await p.evaluate(TEXTOS, sels);
  const con = await medir(p, items); await hoja(p, false);
  const sin = await medir(p, items); await hoja(p, true);
  for (const [n] of sels){
    const idx = items.map((it, i) => it.n === n ? i : -1).filter(i => i >= 0);
    if (!idx.length) { t.ok(false, donde + ': no se vio «' + n + '»'); continue; }
    const peor = idx.map(i => ({ t: con[i].t, con: con[i].cr, sin: sin[i].cr })).reduce((a, b) => (b.con - b.sin) < (a.con - a.sin) ? b : a);
    t.ok(peor.con >= peor.sin - Math.max(.15, peor.sin * .03), donde + ': «' + n + '» se lee igual con el neón: el que más cambió «' + peor.t + '» ' + peor.sin + ' → ' + peor.con + ':1 (' + idx.length + ' medidos)');
  }
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

export default async function ({ base, t }){
  // ---- «Oscuro», compu, neón prendido: el filete en todo, lo elegido más claro y con resplandor ----
  {
    const { p, errs, close } = await abrir(base);
    await p.goto(base + '/app/'); await wait(3500);
    t.ok(await p.evaluate(() => { const l = [...document.querySelectorAll('link[rel="stylesheet"]')].map(x => x.getAttribute('href'));
      const i = l.indexOf('css/screens/coach/vidrio.css'); return i >= 0 && l[i + 1] === 'css/screens/coach/neon.css'; }), 'app/index.html carga css/screens/coach/neon.css justo después de vidrio.css');
    const tokens = await p.evaluate(() => ['--gize-r1', '--gize-r2'].map(k => getComputedStyle(document.documentElement).getPropertyValue(k).trim()));
    const [r1, r2] = tokens.map(hex);
    const resto = [], elegidos = [];
    for (const vista of Object.keys(QUE)){
      await go(p, vista); await p.mouse.move(1436, 896); await wait(250);
      for (const [n, sel, on] of QUE[vista]){
        const v = await leer(p, sel);
        if (!v) { t.ok(false, 'Oscuro: no se vio ' + n + ' (' + sel + ')'); continue; }
        t.ok(conNeon(v), 'Oscuro: ' + n + ' lleva el filete de neón (::after con máscara, 155°, con color): ' + (v.after ? v.after.bg.slice(0, 140) : 'sin ::after'));
        if (v.estilo !== 'none' && v.ancho > 0) t.ok(v.bordes.every(transparente), 'Oscuro: ' + n + ': el filete toma el lugar del borde (transparente): ' + v.bordes[0]);
        if (conNeon(v)) {
          const cs = colores(v.after.bg);
          t.ok(dTono(tono(cs[0]), tono(r2)) <= 20 && dTono(tono(cs[cs.length - 1]), tono(r1)) <= 20, 'Oscuro: ' + n + ': las puntas tienen el tono de --gize-r2 y --gize-r1');
          (on ? elegidos : resto).push([n, fuerza(v.after.bg)]);
        }
        t.eq(brillo(v), !!on, 'Oscuro: ' + n + (on ? ' (elegido) tiene' : ' no tiene') + ' resplandor suave: ' + (v.before ? v.before.sh.slice(0, 90) : 'sin ::before'));
        if (v.before) t.eq(v.before.anim, 'none', 'Oscuro: el resplandor de ' + n + ' está quieto');
      }
    }
    const maxResto = Math.max(...resto.map(x => x[1])), minElegido = Math.min(...elegidos.map(x => x[1]));
    t.ok(resto.length > 8 && elegidos.length >= 6 && minElegido > maxResto + .5, 'Oscuro: lo elegido tiene el filete claramente más claro (' + minElegido.toFixed(2) + ') que lo demás (' + maxResto.toFixed(2) + ')');

    // La barra lateral: su panel de vidrio con el filete de neón.
    await go(p, 'editor'); await p.mouse.move(1436, 896); await wait(200);
    const side = await leer(p, '.cv-side');
    t.ok(conNeon(side), 'Oscuro: la barra lateral (el panel de vidrio) lleva el filete de neón: ' + (side.after ? side.after.bg.slice(0, 120) : ''));
    // La rayita de la pestaña elegida de la ficha: un degradé de la marca.
    const raya = await p.evaluate(() => getComputedStyle(document.querySelector('.cv-ctab.on'), '::after').backgroundImage);
    t.ok(/^linear-gradient\(90deg/.test(raya) && colores(raya).filter(conTinte).length >= 2, 'Oscuro: la rayita de la pestaña elegida (Rutina) va en degradé: ' + raya);
    // El punteado: «+» de agregar día y «+ Agregar ejercicio» del final, en dos tonos de la marca.
    for (const [n, sel] of [['agregar día', '.co-daytab.add'], ['«+ Agregar ejercicio»', '.co-rt-add-end']]){
      const v = await leer(p, sel), [top, , bottom] = v.bordes.map(c => colores(c)[0]);
      t.ok(v.estilo === 'dashed' && conTinte(top) && conTinte(bottom) && dTono(tono(top), tono(r2)) <= 20 && dTono(tono(bottom), tono(r1)) <= 20,
        'Oscuro: ' + n + ': punteado de neón (arriba el violeta, abajo el azul): ' + v.bordes.join(' / '));
    }
    // Al pasar el mouse: el filete más claro.
    const quieto = await leer(p, '.co-daytab[data-i="1"]');
    await p.hover('.co-daytab[data-i="1"]'); await wait(200);
    const encima = await leer(p, '.co-daytab[data-i="1"]');
    t.ok(conNeon(encima) && fuerza(encima.after.bg) > fuerza(quieto.after.bg) + .3, 'Oscuro: al pasar el mouse por un día, el filete se aclara');
    await p.mouse.move(1436, 896); await wait(200);
    // El ⋯ abierto o con el mouse encima: se ve su borde de siempre (el filete no lo tapa).
    const menu = '.co-day-bar .co-day-menu > summary';
    await p.hover(menu); await wait(250);
    const mh = await leer(p, menu); const mhSin = await (async () => { await hoja(p, false); const v = await leer(p, menu); await hoja(p, true); return v; })();
    t.ok(!mh.after && mh.bordes[0] === mhSin.bordes[0] && !transparente(mh.bordes[0]), 'Oscuro: el ⋯ del día con el mouse encima muestra su borde de siempre (' + mh.bordes[0] + '), sin el filete encima');
    await p.mouse.move(1436, 896); await wait(200);

    // El foco: el campo conserva su borde de foco y suma el resplandor; con teclado, el contorno de siempre.
    await p.focus('.co-dayname'); await wait(200);
    const foco = await leer(p, '.co-dayname'); await hoja(p, false); const focoSin = await leer(p, '.co-dayname'); await hoja(p, true);
    t.eq(foco.bordes[0], focoSin.bordes[0], 'Oscuro: el campo con foco conserva su borde de foco (' + foco.bordes[0] + ')');
    t.ok(tinte(foco.sombra) && !tinte(focoSin.sombra), 'Oscuro: el campo con foco suma el resplandor de la marca: ' + foco.sombra.slice(0, 100));
    await p.evaluate(() => document.activeElement.blur());
    await p.focus('.co-daytab[data-i="1"]'); await p.keyboard.press('Shift+Tab'); await p.keyboard.press('Tab'); await wait(200);
    const kb = await p.evaluate(() => [document.activeElement.className, document.activeElement.matches(':focus-visible')]);
    const ol = await leer(p, '.co-daytab:focus-visible'); await hoja(p, false); const olSin = await leer(p, '.co-daytab:focus-visible'); await hoja(p, true);
    t.ok(kb[1] && ol && olSin && ol.outline[0] !== 'none' && parseFloat(ol.outline[1]) >= 2, 'Oscuro: con el teclado, el día enfocado muestra su contorno: ' + JSON.stringify(ol && ol.outline) + ' ' + kb.join(' '));
    t.eq(ol && ol.outline, olSin && olSin.outline, 'Oscuro: el contorno del foco es el de siempre');
    await p.evaluate(() => document.activeElement.blur());

    // Las ventanas: los bordes en dos tonos de la marca.
    await go(p, 'programar');
    const ven = await leer(p, '#applyMount .cp-ccard');
    t.ok(ven && conTinte(colores(ven.bordes[0])[0]) && conTinte(colores(ven.bordes[2])[0]) && dTono(tono(colores(ven.bordes[0])[0]), tono(r2)) <= 20,
      'Oscuro: la ventana «Programar una rutina nueva» con el borde en dos tonos de la marca: ' + (ven && ven.bordes.join(' / ')));

    // Nada se mueve: las mismas cajas con la hoja prendida y apagada, en cada vista.
    for (const vista of ['inicio', 'clientes', 'editor', 'fin', 'menu', 'mas', 'programar', 'config', 'rutinas']){
      await go(p, vista); await p.mouse.move(1436, 896); await wait(300);
      const d = await seMueve(p);
      t.eq(d.slice(0, 4), [], 'Oscuro, compu, ' + vista + ': nada cambia de lugar ni de tamaño con el neón (' + d.length + ')');
    }
    // El contraste de los textos no baja.
    await go(p, 'editor'); await p.mouse.move(1436, 896); await wait(250);
    await contrasteIgual(t, p, 'Oscuro, editor', [['días', '.co-daytab'], ['«Se repite»', '.hd-day'], ['«+ Programar una rutina nueva»', '.co-sched-new'],
      ['ayuda de los días', '.co-day-hint'], ['pestañas de la ficha', '.cv-ctab'], ['barra lateral', '.cv-side .cv-nav-i, .cv-side .cv-util-i']]);
    await go(p, 'clientes'); await p.mouse.move(1436, 896); await wait(250);
    await contrasteIgual(t, p, 'Oscuro, clientes', [['panel lateral', '.cv-peek-rt small, .cv-tile span, .cv-tile b'], ['«Copiar código»', '.co-copy-btn']]);
    await go(p, 'menu'); await p.mouse.move(1436, 896); await wait(250);
    await contrasteIgual(t, p, 'Oscuro, menú ⋯', [['menú ⋯', '.co-exc-open .co-pop-item']]);
    await go(p, 'mas'); await p.mouse.move(1436, 896); await wait(250);
    await contrasteIgual(t, p, 'Oscuro, Más opciones', [['Reps / Tiempo', '.co-exc-open .co-seg-opt']]);
    t.eq(errs, [], 'Oscuro, compu: errores de la página');
    await close();
  }

  // ---- «Oscuro», celular ----
  {
    const { p, errs, close } = await abrir(base, { vp: M, touch: true });
    await p.goto(base + '/app/'); await wait(3500);
    await go(p, 'editor');
    for (const [n, sel, on] of QUE_CEL.editor){
      const v = await leer(p, sel);
      t.ok(conNeon(v), 'Oscuro, celular: ' + n + ' lleva el filete de neón: ' + (v && v.after ? v.after.bg.slice(0, 100) : 'sin ::after'));
      t.eq(brillo(v), !!on, 'Oscuro, celular: ' + n + (on ? ' (elegido) tiene' : ' no tiene') + ' resplandor');
    }
    // La pestaña del día elegida está en una fila con scroll: el resplandor va por dentro (no se corta).
    const dia = await leer(p, '.co-daytab.on');
    t.ok(dia && dia.before && /inset/.test(dia.before.sh) && tinte(dia.before.sh), 'Oscuro, celular: el resplandor del día elegido va por dentro de la pestaña: ' + (dia && dia.before && dia.before.sh.slice(0, 90)));
    for (const vista of ['inicio', 'clientes', 'editor', 'fin', 'menu', 'config']){
      await go(p, vista); await wait(300);
      const d = await seMueve(p);
      t.eq(d.slice(0, 4), [], 'Oscuro, celular, ' + vista + ': nada cambia de lugar ni de tamaño con el neón (' + d.length + ')');
    }
    await go(p, 'editor');
    await contrasteIgual(t, p, 'Oscuro, celular, editor', [['barra de abajo', '.cv-nav-i'], ['franja de arriba', '.cv-util-i'], ['días', '.co-daytab'], ['«Se repite»', '.hd-day']]);
    t.eq(errs, [], 'Oscuro, celular: errores de la página');
    await close();
  }

  // ---- Neón apagado: el filete blanco y gris, lo elegido más claro, sin resplandor ----
  for (const [vp, nombre] of [[D, 'compu'], [M, 'celular']]){
    const { p, errs, close } = await abrir(base, { vp, neon: false, touch: vp === M });
    await p.goto(base + '/app/'); await wait(3500);
    t.ok(await p.evaluate(() => document.documentElement.classList.contains('sin-neon')), 'sin neón (' + nombre + '): html.sin-neon');
    const resto = [], elegidos = [];
    const vistas = vp === D ? QUE : QUE_CEL;
    for (const vista of Object.keys(vistas)){
      await go(p, vista); if (vp === D) await p.mouse.move(1436, 896); await wait(250);
      for (const [n, sel, on] of vistas[vista]){
        const v = await leer(p, sel);
        if (!v) { t.ok(false, 'sin neón (' + nombre + '): no se vio ' + n); continue; }
        t.ok(gris(v), 'sin neón (' + nombre + '): ' + n + ' lleva el filete blanco y gris (160°, sin color): ' + (v.after ? v.after.bg.slice(0, 120) : 'sin ::after'));
        t.ok(!brillo(v), 'sin neón (' + nombre + '): ' + n + ' sin resplandor de color');
        if (v.after) (on ? elegidos : resto).push(fuerza(v.after.bg));
      }
    }
    t.ok(Math.min(...elegidos) > Math.max(...resto), 'sin neón (' + nombre + '): lo elegido tiene el filete más claro');
    if (vp === D){
      await go(p, 'editor'); await p.mouse.move(1436, 896);
      for (const sel of ['.co-daytab.add', '.co-rt-add-end']){ const v = await leer(p, sel); t.ok(v.estilo === 'dashed' && !v.bordes.some(c => colores(c).some(conTinte)), 'sin neón: ' + sel + ' punteado gris: ' + v.bordes.join(' / ')); }
      const raya = await p.evaluate(() => getComputedStyle(document.querySelector('.cv-ctab.on'), '::after').backgroundImage);
      t.eq(raya, 'none', 'sin neón: la rayita de la pestaña elegida queda como siempre (sin degradé)');
      await go(p, 'programar');
      const ven = await leer(p, '#applyMount .cp-ccard');
      t.ok(ven && !ven.bordes.some(c => colores(c).some(conTinte)), 'sin neón: la ventana sin color en el borde: ' + (ven && ven.bordes.join(' / ')));
      await go(p, 'editor'); await p.mouse.move(1436, 896);
      const d = await seMueve(p);
      t.eq(d.slice(0, 4), [], 'sin neón, editor: nada cambia de lugar ni de tamaño (' + d.length + ')');
    }
    t.eq(errs, [], 'sin neón (' + nombre + '): errores de la página');
    await close();
  }

  // ---- «Claro», «Azul» y «Rosa»: el filete con los tokens de cada una ----
  for (const tema of ['claro', 'azul', 'rosa']){
    for (const vp of [D, M]){
      const cel = vp === M, donde = tema + (cel ? ', celular' : ', compu');
      const { p, errs, close } = await abrir(base, { tema, vp, touch: cel });
      await p.goto(base + '/app/'); await wait(3500);
      const [r1, r2] = (await p.evaluate(() => ['--gize-r1', '--gize-r2'].map(k => getComputedStyle(document.documentElement).getPropertyValue(k).trim()))).map(hex);
      await go(p, 'editor'); if (!cel) await p.mouse.move(1436, 896); await wait(250);
      const lista = cel ? QUE_CEL.editor : QUE.editor.concat(QUE.inicio);
      for (const [n, sel, on] of lista){
        const v = await leer(p, sel);
        t.ok(conNeon(v), donde + ': ' + n + ' lleva el filete: ' + (v && v.after ? v.after.bg.slice(0, 120) : 'sin ::after'));
        if (conNeon(v)) {
          const cs = colores(v.after.bg).filter(conTinte);
          t.ok(dTono(tono(cs[0]), tono(r2)) <= 20 && dTono(tono(cs[cs.length - 1]), tono(r1)) <= 20,
            donde + ': ' + n + ': el filete tiene el tono de la gama de ' + tema + ' (' + tono(cs[0]).toFixed(0) + '° / ' + tono(r2).toFixed(0) + '°, ' + tono(cs[cs.length - 1]).toFixed(0) + '° / ' + tono(r1).toFixed(0) + '°)');
        }
        t.eq(brillo(v), !!on, donde + ': ' + n + (on ? ' (elegido) tiene' : ' no tiene') + ' resplandor');
      }
      if (!cel){
        // La barra de la izquierda: la línea de la derecha en degradé de la gama.
        const side = await leer(p, '.cv-side');
        const cs = colores(side.lado).filter(conTinte);
        t.ok(/^linear-gradient\((?!\d+deg)/.test(side.lado) && cs.length >= 2 && dTono(tono(cs[0]), tono(r2)) <= 20, donde + ': la barra de la izquierda con la línea en degradé de su gama: ' + side.lado.slice(0, 120));
        // Sale de los tokens: si se cambian, cambia el filete.
        await p.evaluate(() => { document.documentElement.style.setProperty('--gize-r2', '#00FF00'); document.documentElement.style.setProperty('--gize-r1', '#FF0000'); }); await wait(150);
        const v = await leer(p, '.co-daytab.on'), cs2 = colores(v.after.bg).filter(conTinte);
        t.ok(dTono(tono(cs2[0]), 120) <= 10 && dTono(tono(cs2[cs2.length - 1]), 0) <= 10, donde + ': el filete sale de --gize-r1 / --gize-r2 (con otros tokens, otros colores): ' + v.after.bg.slice(0, 120));
        await p.evaluate(() => { document.documentElement.style.removeProperty('--gize-r2'); document.documentElement.style.removeProperty('--gize-r1'); }); await wait(150);
        await contrasteIgual(t, p, donde + ', editor', [['días', '.co-daytab'], ['«Se repite»', '.hd-day'], ['«+ Programar una rutina nueva»', '.co-sched-new']]);
      }
      const d = await seMueve(p);
      t.eq(d.slice(0, 4), [], donde + ', editor: nada cambia de lugar ni de tamaño (' + d.length + ')');
      t.eq(errs, [], donde + ': errores de la página');
      await close();
    }
  }

  // ---- La app del alumno: la hoja no cambia nada ----
  for (const [nombre, init] of [['Oscuro', ''], ['Claro', TEMA.claro], ['Azul', TEMA.azul], ['sin neón', "localStorage.setItem('gize_neon','0');"]]){
    const { p, errs, close } = await newPage({ user: ALUMNO, viewport: M, touch: true, handlers: { '/profiles': profile('client') },
      state: { days: [{ id: 'd1', name: 'Pierna', dias: [1], exercises: [{ id: 'a1', name: 'Sentadilla', sets: [{ id: 's1', kg: '', reps: '' }] }] }], sessions: [], weights: [], daily: {} },
      init: "localStorage.setItem('gize_lite','0');" + init });
    await p.goto(base + '/app/'); await wait(3500);
    t.ok(!await p.evaluate(() => document.body.classList.contains('silk-coach')), 'alumno (' + nombre + '): no es el panel del coach');
    t.eq((await sinCambios(p)).slice(0, 5), [], 'alumno (' + nombre + '): el neón del panel no cambia nada');
    await p.click('#nav-config').catch(() => {}); await wait(500);
    t.eq((await sinCambios(p)).slice(0, 5), [], 'alumno (' + nombre + '), Ajustes: el neón del panel no cambia nada');
    t.eq(errs, [], 'alumno (' + nombre + '): errores de la página');
    await close();
  }

  // ---- Liviano, app de Android, GIZE básico, «reducir movimiento» y colores forzados ----
  {
    const { p, errs, close } = await abrir(base, { reducedMotion: 'reduce' });
    await p.goto(base + '/app/'); await wait(3500);
    await go(p, 'editor'); await p.mouse.move(1436, 896); await wait(200);
    for (const cls of ['lite', 'android-app']){
      await p.evaluate(c => document.documentElement.classList.add(c), cls); await wait(150);
      const on = await leer(p, '.co-daytab.on'), resto = await leer(p, '.co-daytab:not(.on):not(.add)');
      t.ok(conNeon(on) && conNeon(resto) && !brillo(on), cls + ': el filete queda (es una línea) y sin resplandor: ' + (on.before && on.before.sh));
      await p.evaluate(c => document.documentElement.classList.remove(c), cls); await wait(150);
    }
    await p.evaluate(() => document.documentElement.classList.add('lite', 'basico')); await wait(150);
    const bas = await leer(p, '.co-daytab:not(.on):not(.add)'); await hoja(p, false); const basSin = await leer(p, '.co-daytab:not(.on):not(.add)'); await hoja(p, true);
    t.ok(!bas.after && bas.bordes[0] === basSin.bordes[0], 'GIZE básico: sin filete, el borde liso de siempre: ' + bas.bordes[0]);
    await p.evaluate(() => document.documentElement.classList.remove('lite', 'basico')); await wait(150);
    // «Reducir movimiento»: los campos no animan su resplandor; nada de lo nuevo tiene animación.
    const campo = await leer(p, '.co-dayname');
    t.ok(campo.trans[1].split(',').every(d => parseFloat(d) === 0), 'reducir movimiento: el resplandor del foco no se anima: ' + campo.trans.join(' '));
    // (lo que ya se animaba antes, como la perilla de «Sugerencia de peso», no es de esta hoja)
    const ANIMA = () => [...document.querySelectorAll('#coachHost *')].flatMap((e, i) => ['::before', '::after'].map(ps => [e, ps, getComputedStyle(e, ps), i]))
      .filter(([, , s]) => s.content !== 'none' && (s.animationName !== 'none' || s.transitionDuration.split(',').some(d => parseFloat(d) > 0)))
      .map(([e, ps, , i]) => i + ' ' + e.tagName + '.' + String(e.className).split(' ')[0] + ps);
    const anima = await p.evaluate(ANIMA); await hoja(p, false); const animaSin = await p.evaluate(ANIMA); await hoja(p, true);
    t.eq(anima.filter(x => !animaSin.includes(x)), [], 'reducir movimiento: ningún filete ni resplandor se anima');
    t.eq(errs, [], 'liviano / básico / reducir movimiento: errores de la página');
    await close();
  }
  {
    const { p, errs, close } = await abrir(base);
    await p.emulateMedia({ forcedColors: 'active' });
    await p.goto(base + '/app/'); await wait(3500);
    await go(p, 'editor'); await p.mouse.move(1436, 896); await wait(200);
    for (const sel of ['.co-daytab.on', '.co-daytab:not(.on):not(.add)', '.hd-day.on', '.co-sched-new', '.cv-nav-i.on']){
      const v = await leer(p, sel);
      t.ok(v && !v.after && !brillo(v) && !v.bordes.some(transparente), 'colores forzados: ' + sel + ' sin filete ni resplandor, con su borde del sistema: ' + (v && v.bordes[0]));
    }
    t.eq(errs, [], 'colores forzados: errores de la página');
    await close();
  }
}
