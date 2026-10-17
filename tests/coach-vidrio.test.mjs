// Panel del coach en «Oscuro»: vidrio sobre su capa de fondo (css/screens/coach/vidrio.css).
// - Se lee: los textos importantes (etiquetas grises de 11–14 px, la sección elegida de
//   Configuración, los botones de Tema, el menú ⋯ con «Quitar ejercicio» en rojo, «+ Agregar
//   ejercicio» al pasar el mouse, la barra de abajo del celular…) tienen contraste ≥ 5:1 contra el
//   fondo REAL: una captura sin texto, con el vidrio, las luces y el grano. Se toma el píxel del fondo
//   más parecido al texto (percentil 95), no el promedio.
// - Alcance: con «Claro», «Azul», «Rosa» y en la app del alumno la hoja no cambia nada: los estilos
//   calculados de toda la página (y de sus ::before / ::after) son los mismos con la hoja prendida y
//   apagada. En «Oscuro», en cambio, sí cambia (la hoja está cargada y hace algo).
// - «Reducir transparencia» del sistema: rellenos sólidos y sin desenfoque; con «reducir
//   movimiento», nada se mueve (tampoco sin él: la capa del fondo no tiene animación).
// - Placa de video: una sola capa fija de pantalla completa con will-change (la aurora de abajo no
//   se pinta); en la app de Android sin will-change; en GIZE básico sin la capa (queda el degradé de
//   siempre); en liviano sin el grano y sin desenfoque.
// - Lo que no se rompe: el campo con foco conserva su borde de siempre; al arrastrar para unir en
//   superserie, la tarjeta de destino conserva su tinte; los filetes (z 3) quedan adentro de su
//   tarjeta (isolation) y el panel de la barra lateral (z -1) adentro de la barra.
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
    if (vista === 'menu') {
      if (!await p.$('.co-exc-open[data-id="e1"]')) await click('.co-exc[data-id="e1"] .co-exc-chev');
      await p.evaluate(() => { const h = document.getElementById('coachHost'), c = document.querySelector('.co-exc[data-id="e1"]'); h.scrollTop += c.getBoundingClientRect().top - 150; });
      await click('.co-exc-open .co-exc-menu2 > summary');
    }
  }
  if (vista !== 'menu') await p.evaluate(() => { document.getElementById('coachHost').scrollTop = 0; });
  await wait(300);
};

// ---------- Contraste contra el fondo real ----------
const SIN_TEXTO = `#coachHost *, #coachHost *::before, #coachHost *::after, #coachHost *::placeholder {
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
async function contraste(p, sels){
  const items = await p.evaluate(TEXTOS, sels);
  const st = await p.addStyleTag({ content: SIN_TEXTO }); await wait(150);
  const png = (await p.screenshot({ animations: 'disabled', caret: 'hide' })).toString('base64');
  await st.evaluate(e => e.remove());
  return p.evaluate(MEDIR, { png, items });
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
    await leer('menu', [['menú ⋯', '.co-exc-open .co-pop-item:not(:disabled)'], ['«+ Agregar ejercicio»', '.co-ins-b'], ['«3 series»', '.co-exc-sum']]);
    // Las luces, más chicas en el celular y lejos de la franja de arriba (antes teñían el logo y «Salir»).
    const luces = await p.evaluate(() => (getComputedStyle(document.body, '::after').backgroundImage.match(/radial-gradient\((?:[^()]|\([^()]*\))*\)/g) || [])
      .filter(g => (g.match(/rgba?\([^)]*\)/g) || []).some(c => c.match(/[\d.]+/g).slice(0, 3).some(Number)))
      .map(g => g.match(/^radial-gradient\(([\d.]+)% ([\d.]+)% at ([\d.]+)% ([\d.]+)%/)).map(m => m && m.slice(1).map(Number)));
    t.ok(luces.length === 2 && luces.every(l => l && l[0] <= 80 && l[1] <= 30 && l[3] >= 30), 'celular: dos luces chicas (≤ 80 % × 30 %), lejos de la franja de arriba: ' + JSON.stringify(luces));
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
    t.eq(errs, [], 'menos transparencia: errores de la página');
    await close();
  }

  // ---- Liviano, app de Android y GIZE básico ----
  {
    const { p, errs, close } = await abrir(base);
    await p.goto(base + '/app/'); await wait(3500);
    await go(p, 'menu');
    const ver = () => p.evaluate(() => { const s = getComputedStyle(document.body, '::after'), pop = document.querySelector('.co-exc-open .co-day-pop');
      return { capa: s.content !== 'none', will: s.willChange, grano: /url\(/.test(s.backgroundImage), aurora: getComputedStyle(document.querySelector('.app-aurora')).visibility,
        auroraBg: getComputedStyle(document.querySelector('.app-aurora')).backgroundImage.slice(0, 16), blur: getComputedStyle(pop).backdropFilter }; });
    const normal = await ver();
    t.eq([normal.capa, normal.will, normal.grano, normal.aurora], [true, 'transform', true, 'hidden'], 'normal: la capa con grano y capa propia; la aurora sin pintarse');
    t.ok(normal.blur !== 'none', 'normal: el menú ⋯ es vidrio con desenfoque: ' + normal.blur);
    await p.evaluate(() => document.documentElement.classList.add('lite'));
    const lite = await ver();
    t.eq([lite.capa, lite.grano, lite.blur], [true, false, 'none'], 'liviano: la capa sin grano y el menú sin desenfoque');
    await p.evaluate(() => { document.documentElement.classList.remove('lite'); document.documentElement.classList.add('android-app'); });
    const android = await ver();
    t.eq([android.capa, android.will, android.blur], [true, 'auto', 'none'], 'app de Android: la capa sin will-change y sin desenfoque');
    await p.evaluate(() => document.documentElement.classList.add('lite', 'basico'));
    const basico = await ver();
    t.eq([basico.capa, basico.aurora, basico.auroraBg], [false, 'visible', 'linear-gradient('], 'GIZE básico: sin la capa; queda la aurora con el degradé liso de siempre');
    t.eq(errs, [], 'liviano / Android / básico: errores de la página');
    await close();
  }
}
