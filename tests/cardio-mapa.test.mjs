// Cardio → el mapa del recorrido (app/ui/mapa.js, core/cardiogps.js, supabase/cardio-recorridos.sql).
// 1) Cuentas puras: polyline de Google (ida y vuelta), tramos separados por espacio,
//    Douglas–Peucker, tramos del recorrido (pausa, salto, tope de puntos) y routeOf.
// 2) Web sin clave de MapTiler: Cardio sin salida no carga MapLibre ni pide la clave; en la
//    salida se ve el recorrido en SVG (vivo), la pausa corta la línea, al recargar sigue, al
//    guardar sale primero la salida (sin coordenadas) y después su recorrido a cardio_routes.
//    Tocar la salida abre la ventana con el mapa. Nunca se pide MapLibre sin clave.
// 3) Con clave (función mapa-clave simulada) y MapLibre de mentira: se crea el mapa con el estilo
//    oscuro de MapTiler, el recorrido y los créditos. Si el estilo falla, queda el SVG.
// 4) Con la MapLibre de verdad y un estilo falso (nada sale a MapTiler): dibuja en WebGL.
// 5) Cola: borrar una salida saca su recorrido pendiente; sin la tabla de recorridos lo demás
//    sale igual; al abrir la app se traen los recorridos propios (y sin la tabla, nada se rompe).
// 6) App nativa: en segundo plano el mapa no se redibuja; al volver, la línea entera.
// 7) Coach: nunca pide cardio_routes ni muestra un mapa.
import { newPage, wait, text, saved, ALUMNO, profile } from './lib.mjs';

const STATE = { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [{ date: '2026-09-20', kg: 72 }], daily: {} };
const STEP = 0.0001; // grados de latitud ≈ 11,12 m
const LAT0 = -32.95, LON0 = -60.65;
const NOTABLE = t => ({ code: 'PGRST205', message: "Could not find the table 'public." + t + "' in the schema cache", details: null, hint: null });

const FAKE_WEB = () => {
  window.__geo = { watchers: {}, n: 0 };
  const geo = {
    watchPosition(ok, err){ const id = ++window.__geo.n; window.__geo.watchers[id] = { ok, err }; return id; },
    clearWatch(id){ delete window.__geo.watchers[id]; },
    getCurrentPosition(){},
  };
  Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true });
  Object.defineProperty(navigator, 'wakeLock', { value: { request: async () => ({ addEventListener(){}, release: async () => {} }) }, configurable: true });
  window.__push = (lat, lon, acc, t) => { for (const k in window.__geo.watchers) window.__geo.watchers[k].ok({ coords: { latitude: lat, longitude: lon, accuracy: acc }, timestamp: t }); };
};
const FAKE_NATIVE = () => {
  window.__bg = { cb: null };
  window.__vis = 'visible';
  Object.defineProperty(document, 'visibilityState', { get: () => window.__vis, configurable: true });
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {
    BackgroundGeolocation: {
      addWatcher: async (opts, cb) => { window.__bg.cb = cb; return 'w1'; },
      removeWatcher: async () => {}, openSettings: async () => {},
    } } };
};
// MapLibre de mentira (se sirve en lugar de vendor/.../maplibre-gl.js): anota lo que le piden.
const STUB_ML = `
const L = window.__ml = window.__ml || {};
L.maps = []; L.sources = {}; L.layers = []; L.removed = 0; L.created = 0;
export function setWorkerUrl(u){ L.worker = u; }
export class AttributionControl { constructor(o){ L.attrib = o; } }
export class Map {
  constructor(o){ L.created++; L.style = o.style; L.coop = o.cooperativeGestures; this.h = {}; o.container.classList.add('stub-map'); L.maps.push(this);
    setTimeout(() => this.fire(window.__mlFail ? 'error' : 'load'), 60); }
  on(e, f){ (this.h[e] = this.h[e] || []).push(f); }
  fire(e){ (this.h[e] || []).forEach(f => f({})); }
  addControl(c){ L.control = true; }
  addSource(id, s){ L.sources[id] = s; }
  getSource(id){ return { setData: d => { L.sources[id].data = d; L.updates = (L.updates || 0) + 1; } }; }
  addLayer(l){ L.layers.push(l); }
  jumpTo(o){ L.center = o.center; } easeTo(o){ L.center = o.center; } fitBounds(b){ L.fit = b; } resize(){} remove(){ L.removed++; }
}`;
// Como el de MapTiler: los créditos vienen en la fuente del estilo.
const MAPTILER_STYLE = { version: 8, name: 'prueba', sources: { mt: { type: 'geojson', data: { type: 'FeatureCollection', features: [] },
  attribution: '<a href="https://www.maptiler.com/copyright/">&copy; MapTiler</a> <a href="https://www.openstreetmap.org/copyright">&copy; OpenStreetMap contributors</a>' } }, layers: [{ id: 'fondo', type: 'background', paint: { 'background-color': '#05050a' } }, { id: 'mt', type: 'fill', source: 'mt', paint: { 'fill-color': '#111' } }] };

async function pure(p, t){
  const r = await p.evaluate(async ([LAT0, LON0]) => {
    const G = await import('/app/core/cardiogps.js');
    const o = {};
    // Ejemplo de la documentación de Google.
    o.enc = G.encodePolyline([[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]]);
    o.dec = G.decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    // Ida y vuelta con puntos cualquiera (5 decimales).
    const pts = []; for (let i = 0; i < 300; i++) pts.push([LAT0 + Math.sin(i / 7) * 0.01 + i * 1e-5, LON0 + Math.cos(i / 9) * 0.01 - i * 2e-5]);
    const back = G.decodePolyline(G.encodePolyline(pts));
    o.rtLen = back.length; o.rtErr = Math.max(...pts.map((q, i) => Math.max(Math.abs(q[0] - back[i][0]), Math.abs(q[1] - back[i][1]))));
    o.chars = /^[?-~]*$/.test(G.encodePolyline(pts));
    // Tramos: separados por espacio; los de un punto no se guardan.
    const route = G.encodeRoute([[pts[0], pts[1]], [pts[5]], [pts[10], pts[11], pts[12]]]);
    o.route = route; o.routeSegs = G.decodeRoute(route).map(s => s.length);
    o.cut = G.decodePolyline(G.encodePolyline(pts.slice(0, 3)).slice(0, -1)).length; // cortado: no se rompe
    // Douglas–Peucker: una recta con ruido de menos de 1 m queda en 2 puntos; una L guarda la esquina.
    const line = []; for (let i = 0; i <= 100; i++) line.push([LAT0 + i * 1e-4 + (i % 2 ? 5e-6 : -5e-6), LON0]);
    o.straight = G.simplify(line, 4).length;
    const ell = []; for (let i = 0; i <= 50; i++) ell.push([LAT0 + i * 1e-4, LON0]); for (let i = 1; i <= 50; i++) ell.push([LAT0 + 50e-4, LON0 + i * 1e-4]);
    const se = G.simplify(ell, 4); o.ell = se.length; o.corner = se.some(q => q[0] === LAT0 + 50e-4 && q[1] === LON0);
    // Ningún punto sacado queda a más de 4 m de la línea simplificada (curva).
    const curve = pts, sc = G.simplify(curve, 4);
    const kx = 111319.49 * Math.cos(LAT0 * Math.PI / 180), ky = 111319.49;
    const dist = (p, a, b) => { const P = [p[1] * kx, p[0] * ky], A = [a[1] * kx, a[0] * ky], B = [b[1] * kx, b[0] * ky]; const dx = B[0] - A[0], dy = B[1] - A[1], L = dx * dx + dy * dy; let u = L ? ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / L : 0; u = Math.max(0, Math.min(1, u)); return Math.hypot(A[0] + u * dx - P[0], A[1] + u * dy - P[1]); };
    let worst = 0, k = 0;
    curve.forEach(q => { while (k < sc.length - 2 && curve.indexOf(sc[k + 1]) < curve.indexOf(q)) k++; worst = Math.max(worst, dist(q, sc[k], sc[k + 1])); });
    o.curveWorst = worst; o.curveKept = sc.length;
    // Tramos de una salida: pausa, salto repetido (referencia nueva) y tope de puntos.
    const run = G.newRun('correr', 0);
    const P = (i, t, dlon = 0) => ({ lat: LAT0 + i * 1e-4, lon: LON0 + dlon, acc: 5, t });
    G.addPoint(run, P(0, 0)); G.addPoint(run, P(1, 4000)); G.addPoint(run, P(2, 8000));
    G.addPoint(run, { lat: LAT0 + 2.00001e-4, lon: LON0, acc: 5, t: 9000 }); // ruido: no se guarda
    G.addPoint(run, { lat: LAT0 + 2e-4, lon: LON0, acc: 80, t: 9500 });      // poca precisión: no
    o.seg1 = run.segs.map(s => s.length);
    G.pauseRun(run, 10000); G.addPoint(run, P(50, 11000)); G.resumeRun(run, 20000);
    G.addPoint(run, P(60, 21000)); G.addPoint(run, P(61, 25000));
    o.seg2 = run.segs.map(s => s.length);
    // Tres saltos seguidos: el tercero pasa a ser la referencia y arranca otro tramo.
    G.addPoint(run, P(200, 26000)); G.addPoint(run, P(300, 27000)); G.addPoint(run, P(400, 28000)); G.addPoint(run, P(401, 32000));
    o.seg3 = run.segs.map(s => s.length);
    o.noLatLon = !/lat|lon/.test(JSON.stringify(run.segs));
    const big = G.newRun('correr', 0);
    for (let i = 0; i <= 20100; i++) G.addPoint(big, { lat: LAT0 + i * 3.6e-5, lon: LON0, acc: 5, t: i * 1000 });
    o.bigPts = G.routePoints(big.segs); o.bigDist = big.dist;
    const rb = G.routeOf(big); o.bigRoute = rb && rb.route.length; o.bigRoutePts = rb && rb.points;
    const rr = G.routeOf(run); o.runRoute = rr && G.decodeRoute(rr.route).map(s => s.length);
    o.noRoute = G.routeOf(G.newRun('correr', 0));
    return o;
  }, [LAT0, LON0]);
  t.eq(r.enc, '_p~iF~ps|U_ulLnnqC_mqNvxq`@', 'polyline: el ejemplo de Google');
  t.eq(r.dec, [[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]], 'polyline: decodifica el ejemplo de Google');
  t.ok(r.rtLen === 300 && r.rtErr <= 0.000005 + 1e-12, 'polyline: ida y vuelta con 5 decimales: ' + r.rtLen + ' puntos, error ' + r.rtErr);
  t.ok(r.chars, 'polyline: solo caracteres del ? al ~ (nunca un espacio)');
  t.ok(r.route.split(' ').length === 2, 'tramos separados por un espacio (el de un punto no va): ' + r.route);
  t.eq(r.routeSegs, [2, 3], 'decodeRoute devuelve los tramos');
  t.eq(r.cut, 2, 'un recorrido cortado a la mitad no rompe: se queda con lo que había');
  t.eq(r.straight, 2, 'Douglas–Peucker: una recta con ruido de 1 m queda en sus 2 puntas');
  t.ok(r.ell === 3 && r.corner, 'Douglas–Peucker: una L guarda la esquina: ' + r.ell);
  t.ok(r.curveWorst <= 4.01 && r.curveKept < 300, 'Douglas–Peucker: ningún punto queda a más de 4 m (' + r.curveWorst.toFixed(2) + ' m, ' + r.curveKept + ' de 300)');
  t.eq(r.seg1, [3], 'recorrido: solo los puntos que suman (sin ruido ni los de poca precisión)');
  t.eq(r.seg2, [3, 2], 'la pausa corta la línea: después de seguir es otro tramo');
  t.eq(r.seg3, [3, 2, 2], 'salto tomado como referencia nueva: otro tramo (los saltos sueltos no se guardan)');
  t.ok(r.noLatLon, 'los tramos son pares [lat, lon]');
  t.ok(r.bigPts <= 20000 && r.bigPts > 9000 && r.bigDist > 80000, 'más de 20.000 puntos: se deja uno de cada dos (' + r.bigPts + ')');
  t.ok(r.bigRoute > 0 && r.bigRoute <= 200000 && r.bigRoutePts < 50, 'routeOf simplifica (una recta larga queda en pocos puntos): ' + r.bigRoutePts);
  t.eq(r.runRoute, [2, 2, 2], 'routeOf guarda los tramos (simplificados: 3 puntos en línea recta quedan en 2)');
  t.eq(r.noRoute, null, 'sin puntos no hay recorrido');
}

// Cardio → Iniciar → puntos (lat sube de a STEP cada 4 s).
async function run(p, from, to, t0, lon = LON0){
  await p.evaluate(([from, to, t0, LAT0, lon, STEP]) => { for (let i = from; i <= to; i++) window.__push(LAT0 + i * STEP, lon, 5, t0 + i * 4000); }, [from, to, t0, LAT0, lon, STEP]);
}
const age = (p, ms) => p.evaluate(async ms => { const g = await import('/app/ui/gps.js'); g.GpsState.run.start -= ms; g.GpsState.run.since -= ms; }, ms);
const mlReqs = reqs => reqs.filter(u => /maplibre/i.test(u));

export default async function ({ base, t }){
  // ===== 1 y 2) Web, sin clave de MapTiler =====
  const log = [];
  let keyCalls = 0;
  const H = {
    '/profiles': profile('client'),
    '/mapa-clave': (r, J) => { keyCalls++; return J({ key: null }); },
    '/cardio_sessions': (r, J, i) => { log.push({ t: 'sessions', m: i.m, body: i.body, q: decodeURIComponent(i.url.search) }); return i.m === 'GET' ? J([]) : r.fulfill({ status: 201, contentType: 'application/json', body: '[]' }); },
    '/cardio_routes': (r, J, i) => { log.push({ t: 'routes', m: i.m, body: i.body, q: decodeURIComponent(i.url.search) }); return i.m === 'GET' ? J([]) : r.fulfill({ status: 201, contentType: 'application/json', body: '[]' }); },
  };
  let pg = await newPage({ user: ALUMNO, state: STATE, init: FAKE_WEB, handlers: H });
  let p = pg.p;
  const reqs = [], tiler = [];
  p.on('request', q => reqs.push(q.url()));
  await p.route(/api\.maptiler\.com/, r => { tiler.push(r.request().url()); return r.fulfill({ status: 404, body: '' }); });
  await p.goto(base + '/app/'); await wait(2500);
  await pure(p, t);
  await p.click('#nav-cardio'); await wait(500);
  t.eq(mlReqs(reqs), [], 'Cardio sin salida en curso no carga MapLibre');
  t.eq(keyCalls, 0, 'ni pide la clave del mapa');
  t.eq(await p.$$eval('.gmap', e => e.length), 0, 'ni muestra un mapa');

  await p.click('[data-action="gps-start"]'); await wait(400);
  t.has(await text(p, '.gps-map'), 'aparece acá cuando llega la señal', 'en vivo, antes del GPS: aviso en el lugar del mapa');
  const T0 = Date.now();
  await run(p, 0, 10, T0); await wait(1300);
  const d1 = await p.$eval('.gps-live .gmap-svg path.gmap-line', e => e.getAttribute('d')).catch(() => '');
  t.ok(d1.split('L').length === 11, 'en vivo: la línea en SVG con los 11 puntos: ' + d1.slice(0, 60));
  t.ok(await p.$eval('.gps-live .gmap-svg stop', e => e.getAttribute('stop-color')).catch(() => '') === '#2FA0FF', 'neón con la gama de GIZE (degradé)');
  await run(p, 11, 15, T0); await wait(1300);
  const d2 = await p.$eval('.gps-live .gmap-svg path.gmap-line', e => e.getAttribute('d')).catch(() => '');
  t.ok(d2 !== d1 && d2.split('L').length === 16, 'en vivo: la línea crece con los puntos nuevos');
  t.ok(await p.evaluate(() => { const g = document.querySelector('.gmap'); window.__g = g; return !!g; }), 'hay un mapa');
  // Pausa: lo que se mueva no se dibuja; al seguir, otro tramo (sin unir los puntos).
  t.eq(await p.$$eval('.gps-live ~ .ctrl-row .ctrl, .gps-live .ctrl-row .ctrl, .ctrl-row [data-action="gps-pause"], .ctrl-row [data-action="gps-finish"]', l => [...new Set(l)].map(b => b.dataset.action + ':' + b.classList.contains('primary'))),
    ['gps-pause:true', 'gps-finish:true'], 'Pausar y Terminar: botones blancos con neón');
  t.ok(await p.$eval('.gps-live .gps-map', e => getComputedStyle(e).backgroundImage.includes('conic-gradient')), 'en vivo: el mapa con marco de neón');
  await p.click('[data-action="gps-pause"]'); await wait(300);
  t.ok(await p.evaluate(() => window.__g === document.querySelector('.gmap')), 'el mapa sobrevive a los redibujos (el mismo nodo)');
  await p.click('[data-action="gps-resume"]'); await wait(300);
  await run(p, 40, 45, T0, LON0 + 0.001); await wait(1300);
  const d3 = await p.$eval('.gps-live .gmap-svg path.gmap-line', e => e.getAttribute('d')).catch(() => '');
  t.eq((d3.match(/M/g) || []).length, 2, 'la pausa corta la línea: dos tramos');
  // Recargar a mitad: el recorrido sigue entero.
  await p.reload(); await wait(2500);
  await p.click('#nav-cardio'); await wait(600);
  const kept = await p.evaluate(() => JSON.parse(localStorage.getItem('gize_cardio_run')).segs.map(s => s.length));
  t.eq(kept, [16, 6], 'la salida en curso guarda el recorrido en el dispositivo');
  const d4 = await p.$eval('.gps-live .gmap-svg path.gmap-line', e => e.getAttribute('d')).catch(() => '');
  t.eq((d4.match(/M/g) || []).length, 2, 'al recargar se vuelve a dibujar el recorrido entero');
  await p.click('[data-action="gps-continue"]'); await wait(300);
  await age(p, 200000);
  await p.click('[data-action="gps-finish"]'); await wait(500);
  t.ok(!!(await p.$('#gpsSum .gmap-svg path.gmap-line')), 'el resumen muestra el recorrido');
  const before = log.length;
  await p.click('[data-action="gps-save"]'); await wait(3000);
  const sent = log.slice(before).filter(x => x.m === 'POST');
  t.eq(sent.map(x => x.t), ['sessions', 'routes'], 'se manda primero la salida y después su recorrido');
  const st = await saved(p);
  const rec = (st.cardio || [])[0] || {};
  if (sent.length === 2){
    t.ok(!/lat|lon|route|coord|segs/i.test(sent[0].body), 'a cardio_sessions no va ninguna coordenada: ' + sent[0].body);
    const row = [].concat(JSON.parse(sent[1].body))[0] || {};
    t.eq(Object.keys(row).sort(), ['client_id', 'points', 'route', 'session_id'], 'columnas del recorrido');
    t.ok(row.session_id === rec.id && row.client_id === ALUMNO.id, 'el recorrido es de esa salida y del alumno');
    t.eq(row.route, rec.route, 'el mismo recorrido que queda en el dispositivo');
    const segs = await p.evaluate(async r => (await import('/app/core/cardiogps.js')).decodeRoute(r).map(s => s.length), row.route || '');
    t.ok(segs.length === 2 && segs.every(n => n >= 2 && n <= 6), 'recorrido simplificado, en dos tramos: ' + JSON.stringify(segs));
    t.eq(row.points, segs.reduce((a, b) => a + b, 0), 'points: los puntos que quedaron');
    t.has(sent[1].q, 'on_conflict=session_id', 'reintentar no duplica (upsert por session_id, ignorando repetidos)');
  }
  t.ok(typeof rec.route === 'string' && rec.route.length > 4, 'la salida guardada tiene su recorrido (route)');
  t.eq(await p.evaluate(() => JSON.parse(localStorage.getItem('core_outbox_v1') || '[]').length), 0, 'la cola quedó vacía');
  t.eq(await p.$$eval('.gmap', e => e.length), 0, 'guardada la salida, no queda el mapa en vivo');
  // Tocar la salida: ventana con el mapa y los números.
  await p.click('[data-action="gps-open"]'); await wait(500);
  const det = await text(p, '#sheetHost .gps-detail');
  for (const s of ['Correr', 'Distancia', 'Duración', 'Ritmo medio', 'Velocidad máxima', 'Calorías', 'tu coach ve los números']) t.has(det, s, 'ventana de la salida');
  t.ok(!!(await p.$('#sheetHost [data-map-slot^="detail-"] .gmap-svg path.gmap-line')), 'la ventana muestra el recorrido (SVG sin clave)');
  t.eq((await p.$eval('#sheetHost .gmap-line', e => e.getAttribute('d')).catch(() => '')).match(/M/g).length, 2, 'con sus dos tramos');
  t.ok(!!(await p.$('#sheetHost .gmap-svg circle')), 'con las marcas de inicio y fin');
  await p.click('#sheetHost .ctrl[data-action="gps-detail-cancel"]'); await wait(500);
  t.eq(await p.$$eval('#sheetHost .gps-detail', e => e.length), 0, '«Cerrar» cierra la ventana');
  t.eq(mlReqs(reqs), [], 'sin clave nunca se carga MapLibre');
  t.eq(tiler, [], 'sin clave nada va a MapTiler');
  t.ok(keyCalls >= 1, 'con una salida en curso se pidió la clave (mapa-clave)');
  t.eq(pg.errs, [], 'errores de la página (sin clave)');
  await pg.close();

  // ===== 3) Con clave y MapLibre de mentira =====
  const H2 = Object.assign({}, H, { '/mapa-clave': (r, J) => { keyCalls++; return J({ key: 'CLAVEDEPRUEBA123' }); } });
  const ROUTE_REC = { id: '0f0f0f0f-0000-4000-8000-00000000000a', kind: 'caminar', date: '2026-09-28', startedAt: '2026-09-28T12:00:00.000Z', dur: 1800, dist: 2500, kcal: 100, avg: 5, max: 6 };
  keyCalls = 0;
  pg = await newPage({ user: ALUMNO, state: STATE, init: FAKE_WEB, handlers: H2 });
  p = pg.p;
  const reqs2 = [], tiler2 = [];
  p.on('request', q => reqs2.push(q.url()));
  await p.route(/vendor\/maplibre-gl-6\.11\.2\/maplibre-gl\.js/, r => r.fulfill({ status: 200, contentType: 'text/javascript', body: STUB_ML }));
  await p.route(/api\.maptiler\.com/, r => { tiler2.push(r.request().url()); return r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg"/>' }); });
  await p.goto(base + '/app/'); await wait(2500);
  await p.click('#nav-cardio'); await wait(500);
  t.eq([mlReqs(reqs2).length, keyCalls], [0, 0], 'con clave igual: Cardio sin salida no carga MapLibre ni pide la clave');
  await p.click('[data-action="gps-start"]'); await wait(300);
  const T3 = Date.now();
  await run(p, 0, 12, T3); await wait(1800);
  const ml = await p.evaluate(() => { const L = window.__ml || {}; return { created: L.created, style: L.style, coop: L.coop, worker: L.worker, attrib: L.attrib && L.attrib.customAttribution, compact: L.attrib && L.attrib.compact, n: L.sources.ruta && L.sources.ruta.data.geometry.coordinates.map(s => s.length), grad: JSON.stringify(L.layers.map(l => l.paint)), css: !!document.querySelector('link[data-maplibre]') }; });
  t.eq(ml.created, 1, 'con clave: se crea el mapa de MapLibre');
  t.ok(/^https:\/\/api\.maptiler\.com\/maps\/dataviz-dark\/style\.json\?key=CLAVEDEPRUEBA123$/.test(ml.style || ''), 'estilo oscuro de MapTiler con la clave que dio mapa-clave: ' + ml.style);
  t.ok(/maplibre-gl-worker\.js$/.test(ml.worker || ''), 'le dice dónde está el worker (la app del celular no es http)');
  t.ok(/MapTiler/.test(ml.attrib || '') && /OpenStreetMap/.test(ml.attrib || '') && ml.compact === false, 'créditos de MapTiler y OpenStreetMap, siempre a la vista');
  t.ok(ml.css, 'la hoja de estilos de MapLibre se carga recién ahora');
  t.eq(ml.n, [13], 'el recorrido va al mapa');
  t.ok(/line-gradient/.test(ml.grad) && ml.grad.includes('#2FA0FF') && ml.grad.includes('#FF3DAE'), 'línea en degradé neón (gama de GIZE)');
  t.ok(ml.coop === true, 'no se traga el scroll de la pantalla (dos dedos para moverlo)');
  t.ok(await p.$eval('.gps-live .gmap', e => e.classList.contains('gl')).catch(() => false), 'se ve el mapa (y no el SVG)');
  t.ok(!!(await p.$('.gps-live .gmap-gl.stub-map')), 'el contenedor del mapa está en la pantalla');
  t.ok(!!(await p.$('.gps-live .gmap-logo img[src^="https://api.maptiler.com/"]')), 'logo de MapTiler');
  await run(p, 13, 16, T3); await wait(1500);
  t.eq(await p.evaluate(() => window.__ml.sources.ruta.data.geometry.coordinates.map(s => s.length)), [17], 'en vivo: el mapa se actualiza con los puntos nuevos');
  t.eq(await p.evaluate(() => sessionStorage.getItem('gize_mapa_clave') !== null), true, 'la clave queda guardada para la sesión');
  // Se descarta y se abre una salida guardada con recorrido: no vuelve a pedir la clave.
  await p.click('[data-action="gps-finish"]'); await wait(300);
  await p.click('[data-action="gps-discard"]'); await wait(300);
  t.eq(await p.evaluate(() => window.__ml.removed), 1, 'al descartar la salida se saca el mapa');
  const route = await p.evaluate(async ([LAT0, LON0]) => { const G = await import('/app/core/cardiogps.js'); const s = []; for (let i = 0; i < 30; i++) s.push([LAT0 + i * 1e-4, LON0 + (i % 5) * 1e-4]); return G.encodeRoute([s]); }, [LAT0, LON0]);
  await p.evaluate(async rec => { const s = await import('/app/core/state.js'); s.state.cardio.push(rec); (await import('/app/main.js')).renderApp(); }, Object.assign({ route }, ROUTE_REC));
  await p.click(`[data-action="gps-open"][data-id="${ROUTE_REC.id}"]`); await wait(900);
  const ml2 = await p.evaluate(() => ({ created: window.__ml.created, fit: window.__ml.fit }));
  t.eq(ml2.created, 2, 'la salida abierta tiene su mapa');
  t.ok(Array.isArray(ml2.fit) && ml2.fit[0][1] < ml2.fit[1][1], 'encuadra todo el recorrido (fitBounds)');
  t.eq(keyCalls, 1, 'la clave se pidió una sola vez');
  t.ok(tiler2.every(u => u.startsWith('https://api.maptiler.com/resources/logo.svg')), 'a MapTiler solo fue el logo (el estilo lo "pidió" la MapLibre de mentira)');
  await p.click('#sheetHost .ctrl[data-action="gps-detail-cancel"]'); await wait(500);
  t.eq(await p.evaluate(() => window.__ml.removed), 2, 'al cerrar la ventana se saca el mapa');
  // El estilo no carga (sin internet, clave rechazada): queda el SVG, sin errores.
  await p.evaluate(() => { window.__mlFail = true; });
  await p.click(`[data-action="gps-open"][data-id="${ROUTE_REC.id}"]`); await wait(900);
  t.ok(!(await p.$eval('#sheetHost .gmap', e => e.classList.contains('gl')).catch(() => true)) && !!(await p.$('#sheetHost .gmap-svg path.gmap-line')), 'si el mapa falla, queda el recorrido en SVG');
  t.eq(await p.$$eval('#sheetHost .gmap-gl', e => e.length), 0, 'y se saca el mapa roto');
  t.eq(pg.errs, [], 'errores de la página (con clave)');
  await pg.close();

  // ===== 4) MapLibre de verdad con un estilo falso (nada sale a MapTiler) =====
  pg = await newPage({ user: ALUMNO, state: Object.assign({}, STATE, { cardio: [Object.assign({ route }, ROUTE_REC)] }), init: FAKE_WEB, handlers: H2 });
  p = pg.p;
  const reqs3 = [], tiler3 = [];
  p.on('request', q => reqs3.push(q.url()));
  await p.route(/api\.maptiler\.com/, r => {
    const u = r.request().url(); tiler3.push(u);
    if (/\/maps\/dataviz-dark\/style\.json\?key=CLAVEDEPRUEBA123$/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MAPTILER_STYLE), headers: { 'Access-Control-Allow-Origin': '*' } });
    return r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg"/>' });
  });
  await p.goto(base + '/app/'); await wait(2500);
  await p.click('#nav-cardio'); await wait(400);
  t.eq(mlReqs(reqs3), [], 'MapLibre de verdad: nada se carga hasta abrir una salida');
  await p.click(`[data-action="gps-open"][data-id="${ROUTE_REC.id}"]`);
  await p.waitForSelector('#sheetHost .gmap.gl .maplibregl-canvas', { timeout: 15000 }).catch(() => {});
  t.ok(!!(await p.$('#sheetHost .gmap.gl .maplibregl-canvas')), 'MapLibre dibuja el mapa (WebGL)');
  const box = await p.$eval('#sheetHost .gmap.gl .maplibregl-canvas', e => { const r = e.getBoundingClientRect(), s = e.closest('.gps-map').getBoundingClientRect(); return [Math.round(r.height), Math.round(s.height)]; }).catch(() => [0, 1]);
  t.ok(box[0] > 100 && box[1] - box[0] <= 4, 'el mapa ocupa todo su lugar (alto ' + box.join(' de ') + ')');
  t.ok(mlReqs(reqs3).some(u => /maplibre-gl-worker\.js$/.test(u)) && mlReqs(reqs3).some(u => /maplibre-gl\.css$/.test(u)), 'carga la librería, su worker y su CSS de vendor/');
  const att = await text(p, '#sheetHost .maplibregl-ctrl-attrib');
  t.has(att, 'MapTiler', 'créditos a la vista'); t.has(att, 'OpenStreetMap', 'créditos a la vista');
  t.eq(att.split('OpenStreetMap').length - 1, 1, 'los créditos no salen repetidos: ' + att);
  const look = await p.$eval('#sheetHost .gps-map', e => { const cs = getComputedStyle(e); return { ring: cs.backgroundImage.includes('conic-gradient'), r: parseFloat(cs.borderTopLeftRadius) }; });
  t.ok(look.ring && look.r >= 8, 'el mapa tiene el marco de neón: ' + JSON.stringify(look));
  t.ok(tiler3.length > 0 && tiler3.every(u => u.startsWith('https://api.maptiler.com/')), 'solo pidió a MapTiler (simulado)');
  t.eq(pg.errs, [], 'errores de la página (MapLibre de verdad)');
  await pg.close();

  // ===== 5) Cola =====
  // Borrar una salida con el recorrido pendiente (la tabla de salidas no existe todavía).
  const routePosts = [];
  pg = await newPage({ user: ALUMNO, state: STATE, init: FAKE_WEB, handlers: Object.assign({}, H, {
    '/cardio_sessions': (r, J) => J(NOTABLE('cardio_sessions'), 404),
    '/cardio_routes': (r, J, i) => { if (i.m !== 'GET') routePosts.push(i.m); return undefined; },
  }) });
  p = pg.p;
  await p.goto(base + '/app/'); await wait(2500);
  await p.click('#nav-cardio'); await wait(300);
  await p.click('[data-action="gps-start"]'); await wait(200);
  await run(p, 0, 8, Date.now()); await age(p, 40000);
  await p.click('[data-action="gps-finish"]'); await wait(200);
  await p.click('[data-action="gps-save"]'); await wait(1500);
  const cola = () => p.evaluate(() => JSON.parse(localStorage.getItem('core_outbox_v1') || '[]').map(i => i.k));
  t.eq(await cola(), ['cardio', 'cardioRoute'], 'sin la tabla de salidas, el recorrido espera a su salida');
  await p.click('[data-action="gps-del"]'); await wait(1500);
  t.eq(await cola(), ['cardioDelete'], 'al borrar la salida se saca su recorrido pendiente');
  t.eq(routePosts, [], 'el recorrido de una salida borrada (o que no subió) nunca se manda');
  t.eq((await saved(p)).cardio.length, 0, 'y se borra del dispositivo');
  t.eq(pg.errs, [], 'errores de la página (borrar con recorrido pendiente)');
  await pg.close();

  // Sin la tabla de recorridos: la salida sube, su recorrido queda esperando y lo demás sale.
  const other = [], log5 = [];
  pg = await newPage({ user: ALUMNO, state: STATE, init: FAKE_WEB, handlers: Object.assign({}, H, {
    '/cardio_sessions': (r, J, i) => { log5.push(i.m); return i.m === 'GET' ? J([]) : r.fulfill({ status: 201, contentType: 'application/json', body: '[]' }); },
    '/cardio_routes': (r, J) => J(NOTABLE('cardio_routes'), 404),
    '/daily_logs': (r, J, i) => { if (i.m !== 'GET') other.push(i.m); return undefined; },
  }) });
  p = pg.p;
  await p.goto(base + '/app/'); await wait(2500);
  await p.click('#nav-cardio'); await wait(300);
  await p.click('[data-action="gps-start"]'); await wait(200);
  await run(p, 0, 8, Date.now()); await age(p, 40000);
  await p.click('[data-action="gps-finish"]'); await wait(200);
  await p.click('[data-action="gps-save"]'); await wait(2500);
  await p.evaluate(async () => { const m = await import('/app/core/supabase.js'); await m.cloudSaveDaily('2026-09-29', { comment: 'hola' }); });
  await wait(500);
  t.ok(log5.includes('POST'), 'sin la tabla de recorridos la salida sube igual');
  t.eq(await cola(), ['cardioRoute'], 'el recorrido queda en la cola (no se descarta)');
  t.eq(await p.evaluate(() => JSON.parse(localStorage.getItem('core_outbox_failed_v1') || '[]').length), 0, 'no se aparta como error');
  t.ok(other.includes('POST'), 'y no traba lo demás (el registro del día salió)');
  t.eq(await p.$$eval('.gps-item', e => e.length), 1, 'la salida está en Tus salidas');
  t.eq(pg.errs, [], 'errores de la página (sin tabla de recorridos)');
  await pg.close();

  // Al abrir la app se traen los recorridos propios y se pegan a sus salidas.
  const CROW = { id: ROUTE_REC.id, client_id: ALUMNO.id, performed_on: '2026-09-28', started_at: '2026-09-28T12:00:00Z', kind: 'caminar', duration_s: 1800, distance_m: 2500, kcal: 100, avg_speed_kmh: 5, max_speed_kmh: 6, created_at: '2026-09-28T12:30:00Z' };
  const rq = [];
  pg = await newPage({ user: ALUMNO, state: STATE, init: FAKE_WEB, handlers: Object.assign({}, H, {
    '/cardio_sessions': (r, J, i) => i.m === 'GET' ? J([CROW]) : undefined,
    '/cardio_routes': (r, J, i) => { rq.push(decodeURIComponent(i.url.search)); return i.m === 'GET' ? J([{ session_id: ROUTE_REC.id, route }]) : undefined; },
  }) });
  p = pg.p;
  await p.goto(base + '/app/'); await wait(2500);
  t.eq(((await saved(p)).cardio || []).map(x => x.route === route), [true], 'al abrir la app, la salida de la nube trae su recorrido');
  t.ok(rq.some(q => q.includes('client_id=eq.' + ALUMNO.id) && q.includes('select=session_id,route')), 'pide solo sus recorridos: ' + rq.join(' | '));
  await p.click('#nav-cardio'); await wait(300);
  await p.click('[data-action="gps-open"]'); await wait(500);
  t.ok(!!(await p.$('#sheetHost .gmap-svg path.gmap-line')), 'y se ve en su ventana');
  t.eq(pg.errs, [], 'errores de la página (recorridos de la nube)');
  await pg.close();
  pg = await newPage({ user: ALUMNO, state: STATE, init: FAKE_WEB, handlers: Object.assign({}, H, {
    '/cardio_sessions': (r, J, i) => i.m === 'GET' ? J([CROW]) : undefined,
    '/cardio_routes': (r, J) => J(NOTABLE('cardio_routes'), 404),
  }) });
  p = pg.p;
  await p.goto(base + '/app/'); await wait(2500);
  await p.click('#nav-cardio'); await wait(300);
  t.has(await text(p, '#gpsList'), '2,50 km', 'sin la tabla de recorridos, las salidas se ven igual');
  await p.click('[data-action="gps-open"]'); await wait(500);
  t.has(await text(p, '#sheetHost'), 'no tiene el recorrido guardado', 'una salida sin recorrido lo dice (y no hay mapa)');
  t.eq(await p.$$eval('#sheetHost .gmap', e => e.length), 0, 'sin recorrido no hay mapa');
  t.eq(pg.errs, [], 'errores de la página (sin tabla de recorridos al abrir)');
  await pg.close();

  // ===== 6) App nativa: en segundo plano no se redibuja; al volver, la línea entera =====
  pg = await newPage({ user: ALUMNO, state: STATE, init: FAKE_NATIVE, handlers: H });
  p = pg.p;
  await p.goto(base + '/app/'); await wait(2500);
  await p.click('#nav-cardio'); await wait(300);
  await p.click('[data-action="gps-start"]'); await wait(300);
  const T6 = Date.now();
  const cb = (from, to) => p.evaluate(([from, to, T6, LAT0, LON0, STEP]) => { for (let i = from; i <= to; i++) window.__bg.cb({ latitude: LAT0 + i * STEP, longitude: LON0, accuracy: 8, time: T6 + i * 4000 }); }, [from, to, T6, LAT0, LON0, STEP]);
  await cb(0, 5); await wait(1300);
  const n1 = await p.$eval('.gmap-line', e => e.getAttribute('d').split('L').length).catch(() => 0);
  t.eq(n1, 6, 'nativo: el mapa en vivo con los puntos del plugin');
  await p.evaluate(() => { window.__vis = 'hidden'; document.dispatchEvent(new Event('visibilitychange')); });
  await cb(6, 20); await wait(1500);
  t.eq(await p.$eval('.gmap-line', e => e.getAttribute('d').split('L').length).catch(() => 0), 6, 'en segundo plano el mapa no se redibuja');
  t.eq(await p.evaluate(async () => (await import('/app/ui/gps.js')).GpsState.run.segs[0].length), 21, 'pero los puntos se siguen anotando');
  await p.evaluate(() => { window.__vis = 'visible'; document.dispatchEvent(new Event('visibilitychange')); });
  await wait(1300);
  t.eq(await p.$eval('.gmap-line', e => e.getAttribute('d').split('L').length).catch(() => 0), 21, 'al volver, la línea entera');
  t.eq(pg.errs, [], 'errores de la página (nativo)');
  await pg.close();

  // ===== 7) Coach: solo números =====
  const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
  const A1 = '44444444-4444-4444-4444-444444444444';
  const row = Object.assign({}, CROW, { client_id: A1 });
  pg = await newPage({ user: COACH, viewport: { width: 1100, height: 900 }, handlers: {
    '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
      if (/coach_id=eq/.test(i.url.search)) return J([{ id: A1, full_name: 'Ana Alumna' }]); return J(i.one ? me : [me]); },
    '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
    '/cardio_sessions': (r, J, i) => i.m === 'GET' ? J(/client_id=eq\.4444/.test(i.url.search) ? [row] : []) : undefined,
    '/cardio_routes': (r, J) => J([{ session_id: row.id, route }]),
  } });
  p = pg.p;
  const reqs7 = [];
  p.on('request', q => reqs7.push(q.url()));
  await p.goto(base + '/app/'); await wait(3500);
  await p.click(`[data-coach="open"][data-id="${A1}"]`); await wait(1500);
  await p.click('[data-coach="sec-open"][data-v="cardio"]'); await wait(500);
  t.has(await text(p, '#coachHost'), '2,50', 'coach: ve los números de la salida');
  t.ok(!pg.calls.some(c => c.includes('/cardio_routes')), 'coach: nunca pide los recorridos: ' + pg.calls.filter(c => /cardio/.test(c)).join(', '));
  t.eq(await p.$$eval('.gmap, [data-map-slot]', e => e.length), 0, 'coach: no hay mapa');
  t.eq(mlReqs(reqs7), [], 'coach: no carga MapLibre');
  t.ok(!pg.calls.some(c => c.includes('mapa-clave')), 'coach: no pide la clave del mapa');
  t.eq(pg.errs, [], 'errores de la página (coach)');
  await pg.close();
}
