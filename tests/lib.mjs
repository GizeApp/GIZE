// Ayudas de las pruebas automáticas (ver tests/README.md): servidor local de los archivos,
// navegador Chromium con Supabase simulado (nada sale a internet) y chequeos.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(process.env.PW || 'playwright');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.wav': 'audio/wav', '.webmanifest': 'application/manifest+json' };

// Sirve la carpeta del proyecto como gize.ar (/, /app/, /admin/).
export function startServer(){
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let f = path.join(ROOT, p);
    if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise(ok => srv.listen(0, '127.0.0.1', () => ok({ srv, base: 'http://127.0.0.1:' + srv.address().port })));
}

let browser = null;
export async function getBrowser(){ return browser || (browser = await chromium.launch()); }
export async function closeBrowser(){ if (browser) await browser.close(); browser = null; }

const now = () => Math.floor(Date.now() / 1000);
const session = user => ({ access_token: 'x.eyJzdWIiOiJ1MyJ9.y', token_type: 'bearer', expires_in: 3600, expires_at: now() + 3600, refresh_token: 'r', user });
const SB_KEY = 'sb-wegptuzhsrwppbknqstf-auth-token';

// Avisos propios de la app (app/ui/avisos.js): alert() ya no abre el diálogo nativo sino un cartel
// en la página (.av-bg, con «Listo» / «No se pudo» / «Ojo» y «Entendido»). Esto corre en la página:
// apenas aparece un cartel lee lo que dice, tal como lo ve la persona (un párrafo por línea en
// blanco), se lo pasa a la prueba (__gizeAviso) y, si tocar es true, toca «Entendido» cuando ya se
// ve, como antes se aceptaba solo el alert(). Si llegan varios, la app los muestra de a uno.
const LEER_AVISOS = tocar => `(() => {
  const vistos = new WeakSet();
  const leer = el => {
    if (vistos.has(el)) return; vistos.add(el);
    const tit = el.querySelector('.av-tit'), ps = [...el.querySelectorAll('.av-txt p')];
    window.__gizeAviso({ titulo: tit ? tit.textContent : '', texto: ps.map(p => p.textContent).join('\\n\\n') });
    if (!${tocar}) return;
    const entendido = () => {
      if (!el.isConnected) return;
      if (!el.classList.contains('show')) return requestAnimationFrame(entendido);
      const b = el.querySelector('.av-btn'); if (b) b.click();
    };
    requestAnimationFrame(entendido);
  };
  new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && n.classList.contains('av-bg')) leer(n); })
    .observe(document, { childList: true, subtree: true });
})()`;

// Página nueva con Supabase simulado. handlers: { '/final/de/la/ruta': (route, J, info) => J(...) o undefined }
// (funciones comunes, no async: undefined quiere decir "este no lo manejo").
// info = { m, path, one, url, body }. Lo que no maneja un handler responde vacío.
// dialogs: todo lo que la app le muestra en un cartel, en orden: las preguntas nativas (confirm y
// prompt, que se aceptan solas; prompt responde p.dialogAnswer) y los avisos propios (el texto del
// cartel). avisos: solo los propios, con su título ({ titulo, texto }). Con tocarAvisos: false
// quedan abiertos hasta que la prueba toque «Entendido» (.av-btn).
export async function newPage({ user, state, handlers = {}, viewport = { width: 390, height: 844 }, init, timezoneId = 'America/Argentina/Buenos_Aires', reducedMotion = 'no-preference', touch = false, tocarAvisos = true } = {}){
  const b = await getBrowser();
  // touch: celular (pantalla táctil, pointer: coarse).
  const ctx = await b.newContext(Object.assign({ viewport, serviceWorkers: 'block', timezoneId, reducedMotion, locale: 'es-AR' }, touch ? { isMobile: true, hasTouch: true } : {}));
  // El mapa de las salidas de Cardio (OpenFreeMap) nunca sale a internet en las pruebas: sin
  // respuesta, la app dibuja el recorrido sobre su fondo propio.
  await ctx.route(/tiles\.openfreemap\.org/, r => r.abort());
  const p = await ctx.newPage();
  const errs = [], dialogs = [], avisos = [], calls = [];
  p.on('pageerror', e => errs.push(e.message));
  p.dialogAnswer = undefined;
  p.on('dialog', d => { dialogs.push(d.message()); (d.type() === 'prompt' ? d.accept(p.dialogAnswer || '') : d.accept()).catch(() => {}); });
  await p.exposeFunction('__gizeAviso', a => { avisos.push(a); dialogs.push(a.texto); });
  await p.addInitScript(LEER_AVISOS(tocarAvisos));
  if (user) await p.addInitScript(`(() => {
    if (sessionStorage.getItem('init')) return;
    sessionStorage.setItem('init', '1');
    (${sembrar})(${JSON.stringify(semilla(user, state))});
  })()`);
  if (init) await p.addInitScript(init);
  await p.route(/supabase\.co/, supabaseFalso({ user, handlers, calls }));
  return { p, errs, dialogs, avisos, calls, close: () => ctx.close() };
}

// La sesión de prueba y el estado de la app, como quedan en localStorage al entrar: semilla()
// arma los datos y sembrar() (corre en la página) los guarda. Los usan newPage y el recorrido en
// el emulador de Android (scripts/android-recorrido.mjs).
export const semilla = (user, state) => [SB_KEY, session(user), state ? Object.assign({ ownerUid: user.id }, state) : null];
export function sembrar([k, s, st]){
  localStorage.clear();
  localStorage.setItem(k, JSON.stringify(s)); localStorage.setItem('gize_remember', '1');
  if (st) localStorage.setItem('rutina_jero_v1', JSON.stringify(st));
}

// Supabase simulado: atiende cada pedido a supabase.co (page.route) con los handlers, y anota
// en calls «MÉTODO /ruta». Lo usan newPage y el recorrido en el emulador de Android.
export function supabaseFalso({ user, handlers = {}, calls = [] } = {}){
  return async r => {
    const req = r.request(), u = new URL(req.url()), pth = u.pathname, m = req.method();
    const one = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const J = (o, st = 200) => r.fulfill({ status: st, contentType: 'application/json', body: JSON.stringify(o) });
    const info = { m, path: pth, one, url: u, body: req.postData() };
    calls.push(m + ' ' + pth);
    // Un handler devuelve la respuesta (lo que devuelve J) si la maneja, o undefined si no.
    for (const k in handlers) if (pth.endsWith(k)) { const res = handlers[k](r, J, info); if (res !== undefined) { await res; return; } }
    if (user && pth.startsWith('/auth/v1/user')) return J(user);
    if (pth.startsWith('/auth/')) return J({});
    if (pth.includes('/rpc/')) return J(null);
    if (m !== 'GET') return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
    return J(one ? null : []);
  };
}

// Estado guardado de la app (localStorage).
export const saved = p => p.evaluate(() => JSON.parse(localStorage.getItem('rutina_jero_v1')));
export const text = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return e ? e.innerText.replace(/\s+/g, ' ').trim() : ''; }, sel);
export const wait = ms => new Promise(r => setTimeout(r, ms));

// Chequeos: se juntan los que fallan y el runner los muestra.
export function checker(){
  const fails = [];
  const ok = (cond, msg) => { if (!cond) fails.push(msg); };
  const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) fails.push(msg + ' — esperaba ' + JSON.stringify(b) + ', llegó ' + JSON.stringify(a)); };
  const has = (s, sub, msg) => { if (!String(s).includes(sub)) fails.push(msg + ' — no aparece «' + sub + '» en «' + String(s).slice(0, 160) + '»'); };
  return { ok, eq, has, fails };
}

export const ALUMNO = { id: '11111111-1111-1111-1111-111111111111', email: 'alumno@prueba.test', aud: 'authenticated', role: 'authenticated' };
export const ADMIN = { id: '22222222-2222-2222-2222-222222222222', email: 'admin@prueba.test', aud: 'authenticated', role: 'authenticated' };
export const profile = (role, extra) => (r, J, i) => i.m === 'GET' ? J(i.one ? Object.assign({ id: ALUMNO.id, role, full_name: 'Prueba', coach_id: null }, extra) : []) : undefined;
// Ojo: la app lee su perfil con maybeSingle, que pide una lista, y profile() ahí responde []: la
// app queda sin perfil (State.cloudProfile = null). perfil() lo devuelve como la base, para cuando
// importa el vínculo con el coach: con perfil('client', CON_COACH) Progreso muestra el registro de
// hoy, el check-in semanal y la ficha (sin coach no aparecen).
export const CON_COACH = { coach_id: '33333333-3333-3333-3333-333333333333' };
export const perfil = (role, extra) => (r, J, i) => {
  if (i.m !== 'GET') return undefined;
  const me = Object.assign({ id: ALUMNO.id, role, full_name: 'Prueba', coach_id: null }, extra);
  return J(i.one ? me : [me]);
};
// Entreno: los ejercicios arrancan cerrados y en la app se abre uno a la vez. Para las pruebas
// que miran varios ejercicios juntos, este atajo los deja a todos abiertos.
export async function openAllEx(p){
  await p.evaluate(async () => {
    const { state, State } = await import('/app/core/state.js');
    const e = await import('/app/screens/entreno.js'), m = await import('/app/main.js');
    const d = state.days.find(x => x.id === State.activeId) || state.days[0];
    if (d) d.exercises.forEach(x => e.expandedOverride.add(x.id));
    m.renderApp();
  });
  await wait(150);
}

// Configuración del coach (app/screens/coach/settings.js): una pantalla del panel con un menú de
// secciones (Perfil, Apariencia, Avisos, Mi plan, Preguntas, Privacidad, Cuenta). configCoach toca
// la tuerca de la barra lateral (si no está abierta) y la sección, como la persona; lo que muestra
// la sección queda en CONFIG_COACH.
export const CONFIG_COACH = '#coachHost .cs-body';
export async function configCoach(p, seccion){
  if (!await p.$('#coachHost .cs-layout')) { await p.click('[data-coach="open-settings"]'); await wait(500); }
  if (seccion) { await p.click(`#coachHost .cs-nav [data-coach="settings-sec"][data-k="${seccion}"]`); await wait(300); }
}
// Recorre todas las secciones del menú: [{ k, nombre, v }] con v = lo que devuelve leer(p) con esa
// sección abierta (para revisar algo en toda la Configuración, como antes en la ventana única).
export async function seccionesCoach(p, leer){
  await configCoach(p);
  const secs = await p.$$eval('#coachHost .cs-nav [data-coach="settings-sec"]', l => l.map(b => [b.dataset.k, b.querySelector('b').textContent]));
  const out = [];
  for (const [k, nombre] of secs){ await configCoach(p, k); out.push({ k, nombre, v: await leer(p) }); }
  return out;
}

// Cardio: «Salir a moverte» (lo último de la pestaña) abre la hoja de abajo con «A pie» / «En
// bici» y «Empezar». abrirSalir la abre; empezarSalida la abre si hace falta y toca «Empezar».
export async function abrirSalir(p){
  if (!await p.$('#salSheet')) { await p.click('[data-action="sal-sheet"]'); await wait(350); }
}
export async function empezarSalida(p){
  await abrirSalir(p);
  await p.click('#salSheet [data-action="sal-start"]');
}

// Bienvenida (app/screens/onboarding.js): una pregunta por pantalla. onbPaso dice en qué paso
// está (el «n/N» de la cabecera y el título); onbSiguiente toca «Continuar» (habilitado);
// onbAhoraNo, «Ahora no»; onbSinCuerpo elige el sexo y después toca «Ahora no» en cada paso del
// cuerpo (hasta el primero que no lo tiene, o hasta que se cierra).
export const onbPaso = p => p.evaluate(() => ({ n: (document.querySelector('#authHost .onb-head:not([hidden]) .onb-count') || {}).textContent || '',
  titulo: (document.querySelector('#authHost #onbTit') || {}).textContent || '' }));
export async function onbSiguiente(p){ await p.click('#authHost [data-onb="next"]:not([disabled])'); await wait(250); }
export async function onbAhoraNo(p){ await p.click('#authHost [data-onb="later"]'); await wait(200); }
export async function onbSinCuerpo(p, sexo = 'x'){
  await p.click(`#authHost [data-onb="sex"][data-v="${sexo}"]`); await onbSiguiente(p);
  while (await p.isVisible('#authHost [data-onb="later"]')) await onbAhoraNo(p);
}

// Contraste de todo el texto visible de la pantalla contra el fondo que tiene detrás (el primer
// color de fondo, o el color liso de un degradé, subiendo por los padres). Devuelve el mínimo y
// los que no llegan a 4,5 (AA). No cuenta el texto de campos vacíos (placeholder), lo
// deshabilitado ni lo que está transparente a propósito. dentro: solo lo de adentro de ese selector.
export const contraste = (p, dentro = 'body') => p.evaluate(dentro => {
  const rgb = s => { const m = String(s).match(/rgba?\(([^)]*)\)/); if (!m) return null; const n = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: n[0], g: n[1], b: n[2], a: n[3] === undefined ? 1 : n[3] }; };
  const lum = c => [c.r, c.g, c.b].map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0);
  const mix = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const fondo = e => {
    const capas = [];
    for (let x = e; x; x = x.parentElement) {
      const cs = getComputedStyle(x), img = cs.backgroundImage;
      const liso = /^linear-gradient\((rgba?\([^)]*\)), \1\)/.exec(img);
      if (liso) { capas.push(rgb(liso[1])); if (capas[capas.length - 1].a >= 1) break; }
      const c = rgb(cs.backgroundColor); if (c && c.a > 0) { capas.push(c); if (c.a >= 1) break; }
    }
    let base = rgb(getComputedStyle(document.body).backgroundColor);
    for (let i = capas.length - 1; i >= 0; i--) base = capas[i].a >= 1 ? capas[i] : mix(capas[i], base);
    return base;
  };
  const visible = e => { const r = e.getBoundingClientRect(); if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) return false;
    for (let x = e; x; x = x.parentElement) { const cs = getComputedStyle(x); if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < .95) return false; }
    return true; };
  const malos = []; let min = 99, n = 0;
  const els = [...document.querySelectorAll(dentro + ' *')].filter(e => !['SCRIPT', 'STYLE', 'svg', 'SVG', 'OPTION'].includes(e.tagName) && !e.closest('svg')
    && [...e.childNodes].some(t => t.nodeType === 3 && t.textContent.trim()) && !e.closest('[disabled], [aria-hidden="true"], #splashHost'));
  const campos = [...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=range]), textarea')].filter(e => e.value);
  for (const e of els.concat(campos)) {
    if (!visible(e)) continue;
    const c = rgb(getComputedStyle(e).color); if (!c || c.a < .95) continue;
    const bg = fondo(e), L1 = lum(c), L2 = lum(bg), k = (Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05);
    n++; if (k < min) min = k;
    if (k < 4.5) malos.push((e.textContent || e.value).trim().slice(0, 30) + ' (' + k.toFixed(2) + ')');
  }
  return { n, min: Math.round(min * 100) / 100, malos };
}, dentro);
