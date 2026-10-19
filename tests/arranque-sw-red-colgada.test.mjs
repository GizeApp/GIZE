// La web instalada (sw.js) con la red colgada: el wifi conectado pero sin respuesta, o un iPhone que
// vuelve de segundo plano con la conexión trabada. sw.js pedía cada archivo a la red sin límite
// («network-first») y, como la app son muchos archivos chicos, uno solo que no llegaba la dejaba sin
// arrancar. Ahora, si la red no contesta en 3,5 s y hay copia guardada, va la copia (y por un rato
// las demás también, sin volver a esperar): la app abre con lo guardado. Con la red bien, sigue
// trayendo lo último.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getBrowser, supabaseFalso, semilla, sembrar, wait } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
const ME = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };

// Servidor propio: con «colgada» acepta los pedidos y nunca contesta.
function servidor(){
  const red = { colgada: false, pedidos: 0 };
  const srv = http.createServer((req, res) => {
    red.pedidos++;
    if (red.colgada) return; // no contesta nunca (el pedido queda abierto)
    let f = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise(ok => srv.listen(0, '127.0.0.1', () => ok({ srv, red, base: 'http://127.0.0.1:' + srv.address().port })));
}

export default async function ({ t }){
  const { srv, red, base } = await servidor();
  const b = await getBrowser();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'allow', locale: 'es-AR', timezoneId: 'America/Argentina/Buenos_Aires' });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(`(() => { if (sessionStorage.getItem('init')) return; sessionStorage.setItem('init', '1'); (${sembrar})(${JSON.stringify(semilla(COACH, null))}); })()`);
  await p.route(/supabase\.co/, supabaseFalso({ user: COACH, handlers: {
    '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; if (/coach_id=eq/.test(i.url.search)) return J([{ id: 'c1', full_name: 'Alumna Zeta' }]); return J(i.one ? ME : [ME]); },
    '/coach_billing': (r, J, i) => { const x = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? x : [x]); },
  } }));
  // nueva: es la página recargada (con la navegación colgada seguiría la de antes).
  const panel = () => p.evaluate(() => ({ nueva: !window.__vieja, panel: document.body.classList.contains('silk-coach') && !document.getElementById('splash'),
    alumnas: /Alumna Zeta/.test((document.getElementById('coachHost') || {}).innerText || ''),
    sw: !!(navigator.serviceWorker && navigator.serviceWorker.controller) })).catch(() => ({}));
  // Con la navegación colgada (antes) evaluate puede quedar esperando la página nueva: con tope.
  const mirar = () => Promise.race([panel(), wait(1500).then(() => ({}))]);
  const recargar = () => { Promise.race([p.evaluate(() => { window.__vieja = true; }), wait(1500)]).catch(() => {}).then(() => p.reload().catch(() => {})); };
  async function hasta(cond, ms){ const fin = Date.now() + ms; let r; while (Date.now() < fin) { r = await mirar(); if (cond(r)) return r; await wait(250); } return r; }

  // Con la red bien: se instala el service worker y, en la segunda carga (ya controlada por él),
  // guarda todos los archivos de la app.
  await p.goto(base + '/app/');
  await p.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => {});
  await p.reload();
  const online = await hasta(x => x.panel && x.alumnas && x.sw, 12000);
  t.ok(online && online.panel && online.sw, 'con la red bien abre el panel, con el service worker: ' + JSON.stringify(online));
  await wait(1500);

  // Se cuelga la red y se vuelve a abrir la app: abre con lo guardado, en pocos segundos.
  red.colgada = true;
  const antes = red.pedidos, t0 = Date.now();
  recargar();
  const r = await hasta(x => x.nueva && x.panel && x.alumnas, 20000);
  const seg = (Date.now() - t0) / 1000;
  t.ok(red.pedidos > antes, 'la red estaba colgada de verdad (los pedidos llegan y no se contestan)');
  t.ok(r && r.panel && r.alumnas, 'con la red colgada abre igual el panel, con lo guardado: ' + JSON.stringify(r));
  t.ok(seg < 12, 'y abre en pocos segundos: ' + seg.toFixed(1) + ' s');
  t.eq(errs, [], 'sin errores de JavaScript');

  // Vuelve la red: trae lo último de nuevo.
  red.colgada = false;
  await wait(500);
  recargar();
  const v = await hasta(x => x.nueva && x.panel && x.alumnas, 15000);
  t.ok(v && v.panel, 'con la red de vuelta abre normal: ' + JSON.stringify(v));
  srv.closeAllConnections && srv.closeAllConnections();
  await Promise.race([ctx.close(), wait(5000)]);
  srv.close();
}
