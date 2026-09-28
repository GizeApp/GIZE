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

// Página nueva con Supabase simulado. handlers: { '/final/de/la/ruta': (route, J, info) => J(...) o undefined }
// (funciones comunes, no async: undefined quiere decir "este no lo manejo").
// info = { m, path, one, url, body }. Lo que no maneja un handler responde vacío.
export async function newPage({ user, state, handlers = {}, viewport = { width: 390, height: 844 }, init, timezoneId = 'America/Argentina/Buenos_Aires', reducedMotion = 'no-preference' } = {}){
  const b = await getBrowser();
  const ctx = await b.newContext({ viewport, serviceWorkers: 'block', timezoneId, reducedMotion, locale: 'es-AR' });
  const p = await ctx.newPage();
  const errs = [], dialogs = [], calls = [];
  p.on('pageerror', e => errs.push(e.message));
  p.dialogAnswer = undefined;
  p.on('dialog', d => { dialogs.push(d.message()); (d.type() === 'prompt' ? d.accept(p.dialogAnswer || '') : d.accept()).catch(() => {}); });
  if (user) await p.addInitScript(([k, s, st]) => {
    if (sessionStorage.getItem('init')) return;
    sessionStorage.setItem('init', '1'); localStorage.clear();
    localStorage.setItem(k, JSON.stringify(s)); localStorage.setItem('gize_remember', '1');
    if (st) localStorage.setItem('rutina_jero_v1', JSON.stringify(st));
  }, [SB_KEY, session(user), state ? Object.assign({ ownerUid: user.id }, state) : null]);
  if (init) await p.addInitScript(init);
  await p.route(/supabase\.co/, async r => {
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
  });
  return { p, errs, dialogs, calls, close: () => ctx.close() };
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
