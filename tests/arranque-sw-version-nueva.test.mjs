// La web instalada (sw.js) recién publicada una versión nueva, con la red lenta: nunca se mezclan
// archivos de dos versiones en una misma carga. La app son muchos módulos chicos y uno viejo con otro
// nuevo no encajan («does not provide an export named…»): la app no arranca. Con el tope de 3,5 s
// por archivo (la primera versión de este arreglo), un módulo cambiado que tardaba en llegar salía
// de la copia vieja y la app terminaba en «No se pudo abrir GIZE» aunque la red anduviera.
// Ahora se decide por carga: si la página vino de la red, sus archivos también (aunque tarden); si
// vino de lo guardado (la red no contestó en 3,5 s), todos de lo guardado. Y si lo guardado quedó a
// medio actualizar y no encaja, la app recarga una vez pidiendo todo a la red («gize:solo-red»).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getBrowser, supabaseFalso, semilla, sembrar, wait } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
const ME = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };

// Versión n (n ≥ 2): app/core/icons.js suma exports nuevos y app/main.js importa el de su versión,
// como una publicación que agrega algo y lo usa. demoras: ms por ruta antes de contestar.
const leer = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
function version(rel, n){
  if (n < 2) return null;
  if (rel === '/app/core/icons.js') { let x = leer(rel); for (let i = 2; i <= n; i++) x += '\nexport const __v' + i + ' = ' + i + ';'; return x + '\n'; }
  if (rel === '/app/main.js') return "import { __v" + n + " } from './core/icons.js';\n" + leer(rel);
  return null;
}
function servidor(){
  const red = { ver: 1, demoras: {} };
  const srv = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let f = path.join(ROOT, rel);
    if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end('404'); }
    const cuerpo = version(rel, red.ver);
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      if (cuerpo != null) res.end(cuerpo); else fs.createReadStream(f).pipe(res);
    }, red.demoras[rel] || 0);
  });
  return new Promise(ok => srv.listen(0, '127.0.0.1', () => ok({ srv, red, base: 'http://127.0.0.1:' + srv.address().port })));
}

export default async function ({ t }){
  const { srv, red, base } = await servidor();
  const b = await getBrowser();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'allow', locale: 'es-AR', timezoneId: 'America/Argentina/Buenos_Aires' });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(`(() => { try { sessionStorage.setItem('__cargas', String(Number(sessionStorage.getItem('__cargas') || 0) + 1)); } catch (e) {}
    if (sessionStorage.getItem('init')) return; sessionStorage.setItem('init', '1'); (${sembrar})(${JSON.stringify(semilla(COACH, null))}); })()`);
  await p.route(/supabase\.co/, supabaseFalso({ user: COACH, handlers: {
    '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; if (/coach_id=eq/.test(i.url.search)) return J([{ id: 'c1', full_name: 'Alumna Zeta' }]); return J(i.one ? ME : [ME]); },
    '/coach_billing': (r, J, i) => { const x = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? x : [x]); },
  } }));
  // Con la navegación esperando a la red, evaluate puede quedar esperando la página nueva: con tope.
  const mirar = () => Promise.race([p.evaluate(async () => {
    const ver = await import('/app/core/icons.js').then(m => Math.max(1, ...Object.keys(m).filter(k => /^__v\d+$/.test(k)).map(k => Number(k.slice(3)))), () => 0);
    return { panel: document.body.classList.contains('silk-coach') && !document.getElementById('splash'),
      alumnas: /Alumna Zeta/.test((document.getElementById('coachHost') || {}).innerText || ''), ver,
      cargas: Number(sessionStorage.getItem('__cargas') || 0),
      cartel: (() => { const r = document.querySelector('#splash .sp-reintento'); return r && !r.hidden ? r.innerText.replace(/\s+/g, ' ').trim() : ''; })(),
      sw: !!(navigator.serviceWorker && navigator.serviceWorker.controller) };
  }), wait(1500).then(() => ({}))]).catch(() => ({}));
  async function hasta(cond, ms){ const fin = Date.now() + ms; let r; while (Date.now() < fin) { r = await mirar(); if (cond(r)) return r; await wait(250); } return r; }

  // Versión 1, con la red bien: se instala el service worker y la segunda carga guarda todo.
  await p.goto(base + '/app/');
  await p.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => {});
  await p.reload();
  const v1 = await hasta(x => x.panel && x.alumnas && x.sw, 12000);
  t.ok(v1 && v1.panel && v1.sw && v1.ver === 1, 'versión 1 abierta con el service worker: ' + JSON.stringify(v1));
  await wait(1500);

  // (1) Se publica la versión 2 y lo guardado queda a medio actualizar (main.js nuevo, icons.js viejo:
  // una carga que se cortó a la mitad). La página tarda 5 s: sale de lo guardado, no encaja, la app
  // recarga sola una vez pidiendo todo a la red y abre la versión 2.
  {
    red.ver = 2;
    const main2 = version('/app/main.js', 2);
    await p.evaluate(async body => { const k = (await caches.keys()).find(x => /^core-v/.test(x)); const c = await caches.open(k);
      await c.put(new Request(location.origin + '/app/main.js'), new Response(body, { headers: { 'Content-Type': 'text/javascript' } })); }, main2);
    red.demoras = { '/app/': 5000, '/app/index.html': 5000 };
    const antes = (await mirar()).cargas || 0;
    errs.length = 0;
    const t0 = Date.now();
    p.reload().catch(() => {});
    const r = await hasta(x => x.panel && x.alumnas && x.ver === 2, 30000);
    const seg = (Date.now() - t0) / 1000;
    t.ok(r && r.panel && r.alumnas && r.ver === 2 && !r.cartel, '(1) lo guardado a medio actualizar: abre la versión nueva en ' + seg.toFixed(1) + ' s: ' + JSON.stringify(r));
    t.eq(r && r.cargas - antes, 2, '(1) con una sola recarga automática (la que pide todo a la red)');
    red.demoras = {};
    await wait(1500);
  }

  // (2) Se publica la versión 3 y el único archivo cambiado que importa tarda 12 s (la red lenta, no
  // colgada). La página vino de la red: sus archivos esperan a la red. Abre la versión 3, sin
  // recargarse y sin el cartel de «No se pudo abrir GIZE».
  {
    red.ver = 3;
    red.demoras = { '/app/core/icons.js': 12000 };
    const antes = (await mirar()).cargas || 0;
    errs.length = 0;
    const t0 = Date.now();
    p.reload().catch(() => {});
    const r = await hasta(x => x.panel && x.alumnas && x.ver === 3, 30000);
    const seg = (Date.now() - t0) / 1000;
    t.ok(r && r.panel && r.alumnas && r.ver === 3 && !r.cartel, '(2) un archivo nuevo lento: abre la versión nueva en ' + seg.toFixed(1) + ' s: ' + JSON.stringify(r));
    t.eq(r && r.cargas - antes, 1, '(2) sin recargarse sola');
    t.eq(errs.filter(e => /export named/.test(e)), [], '(2) sin mezclar archivos de dos versiones');
    red.demoras = {};
  }
  srv.closeAllConnections && srv.closeAllConnections();
  await Promise.race([ctx.close(), wait(5000)]);
  srv.close();
}
