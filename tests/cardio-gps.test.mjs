// Cardio → «Salir a correr / caminar / bici» con GPS.
// 1) Cuentas puras (core/cardiogps.js): distancia, filtros de precisión, ruido, saltos y pausa,
//    velocidad máxima suavizada, MET y calorías.
// 2) Web: GPS falso (navigator.geolocation) y pantalla prendida (wakeLock) falsos; se inicia una
//    salida, se mueven los puntos, se pausa, se recarga a mitad (se ofrece seguir), se termina,
//    se guarda (sube a cardio_sessions sin coordenadas) y se borra. Salida sin distancia (aviso),
//    en bici (velocidad en vez de ritmo) y sin peso cargado (70 kg).
// 3) Tabla todavía sin crear: la salida queda pendiente sin trabar lo demás de la cola.
// 4) App nativa: el plugin de ubicación en segundo plano (addWatcher con notificación,
//    permiso negado → ajustes, se vuelve a enganchar al recargar, removeWatcher al terminar).
// 5) Coach: la ficha del alumno muestra la sección Cardio.
import { newPage, wait, text, saved, ALUMNO, profile } from './lib.mjs';

const STATE = { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [{ date: '2026-09-01', kg: 70 }, { date: '2026-09-20', kg: 72 }], daily: {} };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STEP = 0.0001; // grados de latitud ≈ 11,12 m
const LAT0 = -34.6, LON0 = -58.4;

// GPS y wakeLock falsos: window.__push(lat, lon, acc, t) manda un punto a los que miran.
const FAKE_WEB = () => {
  window.__geo = { watchers: {}, n: 0, opts: null };
  window.__wake = { req: 0, rel: 0 };
  const geo = {
    watchPosition(ok, err, opts){ const id = ++window.__geo.n; window.__geo.watchers[id] = { ok, err }; window.__geo.opts = opts; return id; },
    clearWatch(id){ delete window.__geo.watchers[id]; },
    getCurrentPosition(){},
  };
  Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true });
  Object.defineProperty(navigator, 'wakeLock', { value: { request: async () => { window.__wake.req++; return { addEventListener(){}, release: async () => { window.__wake.rel++; } }; } }, configurable: true });
  window.__push = (lat, lon, acc, t) => { for (const k in window.__geo.watchers) window.__geo.watchers[k].ok({ coords: { latitude: lat, longitude: lon, accuracy: acc }, timestamp: t }); };
  window.__deny = () => { for (const k in window.__geo.watchers) window.__geo.watchers[k].err({ code: 1, message: 'denied' }); };
};

// App nativa con el plugin falso: window.__bg guarda las llamadas; __bg.cb es el callback.
const FAKE_NATIVE = () => {
  window.__bg = { added: 0, opts: null, cb: null, removed: [], settings: 0 };
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {
    BackgroundGeolocation: {
      addWatcher: async (opts, cb) => { window.__bg.added++; window.__bg.opts = opts; window.__bg.cb = cb; return 'w' + window.__bg.added; },
      removeWatcher: async ({ id }) => { window.__bg.removed.push(id); },
      openSettings: async () => { window.__bg.settings++; },
    } } };
};

const gpsRun = p => p.evaluate(async () => { const g = await import('/app/ui/gps.js'); return g.GpsState.run && JSON.parse(JSON.stringify(g.GpsState.run)); });
// Corre el reloj de la salida hacia atrás (como si hubieran pasado ms).
const age = (p, ms) => p.evaluate(async ms => { const g = await import('/app/ui/gps.js'); g.GpsState.run.start -= ms; g.GpsState.run.since -= ms; }, ms);

async function pure(p, t){
  const r = await p.evaluate(async ([STEP, LAT0, LON0]) => {
    const G = await import('/app/core/cardiogps.js');
    const o = {};
    o.deg = G.haversine({ lat: 0, lon: 0 }, { lat: 1, lon: 0 });
    o.step = G.haversine({ lat: LAT0, lon: LON0 }, { lat: LAT0 + STEP, lon: LON0 });
    o.ba = G.haversine({ lat: -34.6037, lon: -58.3816 }, { lat: -34.9214, lon: -57.9545 }); // Obelisco → La Plata ≈ 52,6 km
    // Filtros
    let run = G.newRun('correr', 0);
    const P = (i, acc, t, dlon = 0) => ({ lat: LAT0 + i * STEP, lon: LON0 + dlon, acc, t });
    o.first = G.addPoint(run, P(0, 5, 0));
    o.acc = G.addPoint(run, P(10, 31, 4000)); // 111 m con 31 m de error: no
    o.noise = G.addPoint(run, { lat: LAT0 + 0.00001, lon: LON0, acc: 5, t: 4000 }); // 1,1 m
    o.ok = G.addPoint(run, P(1, 30, 4000)); // 11 m en 4 s con 30 m de error: sí
    o.jump = G.addPoint(run, P(20, 5, 8000)); // 211 m en 4 s = 190 km/h
    o.dist1 = run.dist;
    G.pauseRun(run, 10000);
    o.paused = G.addPoint(run, P(60, 5, 20000));
    G.resumeRun(run, 30000);
    o.firstAfter = G.addPoint(run, P(60, 5, 31000)); // el primero después de la pausa no suma
    o.dist2 = run.dist;
    o.ok2 = G.addPoint(run, P(61, 5, 35000));
    o.dist3 = run.dist;
    // Límites por tipo: 15 km/h caminando es un salto; 70 km/h en bici no.
    let w = G.newRun('caminar', 0); G.addPoint(w, P(0, 5, 0)); o.walkJump = G.addPoint(w, { lat: LAT0 + 0.000375, lon: LON0, acc: 5, t: 10000 });
    let b = G.newRun('bici', 0); G.addPoint(b, P(0, 5, 0)); o.bike70 = G.addPoint(b, { lat: LAT0 + 0.00175, lon: LON0, acc: 5, t: 10000 });
    // Velocidad máxima suavizada: 10 km/h con un punto adelantado 10 m (28 km/h en ese tramo de 2 s).
    let m = G.newRun('correr', 0); let lat = LAT0;
    const dLat = 5.556 / 111195; // 5,56 m cada 2 s = 10 km/h
    for (let i = 0; i <= 30; i++){
      lat += dLat;
      const spike = i === 15 ? 10 / 111195 : 0;
      G.addPoint(m, { lat: lat + spike, lon: LON0, acc: 5, t: i * 2000 });
    }
    o.maxSmooth = m.maxKmh;
    // Duración por reloj descontando pausas.
    let d = G.newRun('correr', 0); G.pauseRun(d, 60000); G.resumeRun(d, 100000); G.endRun(d, 160000);
    o.elapsed = G.elapsedMs(d, 999999);
    // MET y calorías
    o.metWalk = [3, 4, 5, 6, 7].map(v => G.met('caminar', v));
    o.metBike = [15, 17, 20, 24, 30].map(v => G.met('bici', v));
    o.metRun = [5, 12].map(v => G.met('correr', v));
    const secs = 44 * 60 + 53;
    o.kcalRun = G.kcal('correr', 7.18 / (secs / 3600), 72, secs / 3600);
    o.kcal70 = G.kcal('caminar', 5, null, 1);
    o.lastW = G.lastWeight([{ date: '2026-09-20', kg: 72 }, { date: '2026-08-01', kg: 90 }]);
    o.noW = G.lastWeight([]);
    o.txt = [G.fmtHMS(secs * 1000), G.fmtKm(7180), G.fmtPace(secs / 7.18), G.fmtKmh(18.44), G.paceOrSpeed({ kind: 'bici', avg: 18.44, dist: 1, dur: 1 })];
    // Resumen: sin coordenadas.
    let s = G.newRun('correr', Date.parse('2026-09-29T10:00:00Z')); G.addPoint(s, P(0, 5, s.start)); G.addPoint(s, P(3, 5, s.start + 12000)); G.endRun(s, s.start + 12000);
    o.sum = G.summary(s, 72, 'x', '2026-09-29');
    return o;
  }, [STEP, LAT0, LON0]);
  t.ok(Math.abs(r.deg - 111195) < 60, 'haversine: 1° de latitud ≈ 111,2 km: ' + r.deg);
  t.ok(Math.abs(r.ba - 52600) < 1500, 'haversine: Obelisco → La Plata ≈ 52,6 km: ' + r.ba);
  t.eq([r.first, r.acc, r.noise, r.ok, r.jump], ['first', 'acc', 'noise', 'ok', 'jump'], 'filtros: primer punto, precisión > 30 m, ruido < 3 m, punto bueno y salto imposible');
  t.ok(Math.abs(r.dist1 - r.step) < 0.01, 'solo suma el punto bueno (11 m): ' + r.dist1);
  t.eq([r.paused, r.firstAfter], ['paused', 'first'], 'en pausa no suma; al seguir el primer punto no suma lo recorrido en pausa');
  t.ok(Math.abs(r.dist2 - r.step) < 0.01 && Math.abs(r.dist3 - 2 * r.step) < 0.01, 'después de la pausa sigue sumando desde ahí: ' + r.dist2 + ' → ' + r.dist3);
  t.eq([r.walkJump, r.bike70], ['jump', 'ok'], 'límites de velocidad por tipo (caminar 12 km/h, bici 80 km/h)');
  t.ok(r.maxSmooth > 9 && r.maxSmooth < 16, 'la velocidad máxima no la infla un punto adelantado (≈ 10 km/h, no 28): ' + r.maxSmooth);
  t.eq(r.elapsed, 120000, 'duración por reloj, sin las pausas');
  t.eq(r.metWalk, [2, 3, 3.5, 4.3, 5], 'MET caminando');
  t.eq(r.metBike, [4, 6.8, 8, 10, 12], 'MET en bici');
  t.eq(r.metRun, [6, 12], 'MET corriendo (≈ km/h, mínimo 6)');
  t.ok(Math.abs(r.kcalRun - 525) <= 525 * 0.05, 'correr 7,18 km en 44:53 con 72 kg ≈ 525 kcal: ' + r.kcalRun);
  t.ok(Math.abs(r.kcal70 - 245) < 0.01, 'sin peso: 70 kg (caminar a 5 km/h 1 h = 3,5 × 70)');
  t.eq([r.lastW, r.noW], [72, null], 'peso: el último registrado');
  t.eq(r.txt, ['00:44:53', '7,18', '6:15', '18,4', '18,4 km/h'], 'textos con coma');
  t.ok(!JSON.stringify(r.sum).match(/lat|lon/i) && r.sum.dist > 30 && r.sum.dur === 12 && r.sum.kind === 'correr', 'el resumen no lleva coordenadas: ' + JSON.stringify(r.sum));
}

export default async function ({ base, t }){
  // ===== Web =====
  const cloud = [];
  const H = {
    '/profiles': profile('client'),
    // El peso del alumno viene de la nube (loadCloud pisa el del dispositivo).
    '/body_weights': (r, J, i) => i.m === 'GET' ? J([{ id: 'w1', measured_on: '2026-09-01', kg: 70 }, { id: 'w2', measured_on: '2026-09-20', kg: 72 }]) : undefined,
    '/cardio_sessions': (r, J, i) => {
      cloud.push({ m: i.m, body: i.body, q: decodeURIComponent(i.url.search) });
      if (i.m === 'GET') return J([]);
      if (i.m === 'DELETE') return r.fulfill({ status: 204, body: '' });
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
    },
  };
  let pg = await newPage({ user: ALUMNO, state: STATE, init: FAKE_WEB, handlers: H });
  let p = pg.p;
  await p.goto(base + '/app/'); await wait(2500);
  await pure(p, t);
  await p.click('#nav-cardio'); await wait(300);
  const sec = await text(p, '.gps-sec');
  t.has(sec, 'Correr', 'se ven los tipos'); t.has(sec, 'Caminar', 'se ven los tipos'); t.has(sec, 'Bici', 'se ven los tipos');
  t.has(sec, 'En la web mantené la pantalla prendida', 'web: aviso de la pantalla prendida');
  t.ok(await p.evaluate(() => { const a = document.querySelector('.gps-sec'), b = document.querySelector('.cardio-toolsec'); return !!(a && b && (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)); }), 'la sección va arriba del cronómetro');
  t.has(sec, 'Todavía no guardaste salidas', 'Tus salidas vacío');

  await p.click('[data-action="gps-start"]'); await wait(300);
  t.eq(await p.evaluate(() => [window.__geo.opts && window.__geo.opts.enableHighAccuracy, Object.keys(window.__geo.watchers).length, window.__wake.req]), [true, 1, 1], 'mira el GPS con alta precisión y pide la pantalla prendida');
  t.has(await text(p, '#gpsMsg'), 'Buscando señal', 'antes del primer punto: buscando señal');
  const T0 = Date.now();
  await p.evaluate(([LAT0, LON0, STEP, T0]) => {
    for (let i = 0; i <= 29; i++){
      window.__push(LAT0 + i * STEP, LON0, 6, T0 + i * 4000);
      if (i === 10) window.__push(LAT0 + 0.02, LON0, 60, T0 + i * 4000 + 1000); // 2 km con 60 m de error
      if (i === 20) window.__push(LAT0 + i * STEP + 0.01, LON0, 5, T0 + i * 4000 + 2000); // salto de 1,1 km
      if (i === 25) window.__push(LAT0 + i * STEP + 0.000005, LON0, 5, T0 + i * 4000 + 1000); // 0,5 m: ruido
    }
  }, [LAT0, LON0, STEP, T0]);
  await age(p, 116000); await wait(400);
  t.eq(await text(p, '#gpsDist'), '0,32', 'distancia con coma y sin los puntos malos (29 × 11,1 m)');
  t.ok(/^00:01:5\d$/.test(await text(p, '#gpsDur')), 'duración por reloj: ' + await text(p, '#gpsDur'));
  const kc = +(await text(p, '#gpsKcal'));
  t.ok(kc >= 20 && kc <= 27, 'calorías en vivo (10 km/h, 72 kg, ~2 min ≈ 23): ' + kc);
  t.ok(/^[56]:\d\d$/.test(await text(p, '#gpsPace')), 'ritmo medio min/km: ' + await text(p, '#gpsPace'));
  t.eq(await text(p, '#gpsMsg'), '', 'con señal no hay aviso');
  // El tick cambia solo los números: el mismo elemento, otro texto.
  await p.evaluate(() => { window.__durEl = document.getElementById('gpsDur'); window.__durTxt = window.__durEl.textContent; });
  await wait(1200);
  t.eq(await p.evaluate(() => window.__durEl === document.getElementById('gpsDur') && window.__durEl.textContent !== window.__durTxt), true, 'el reloj avanza sin redibujar la pantalla');

  // Pausa: lo que se mueve no suma, ni al seguir.
  await p.click('[data-action="gps-pause"]'); await wait(300);
  t.eq(await p.evaluate(() => [Object.keys(window.__geo.watchers).length, window.__wake.rel]), [0, 1], 'en pausa deja de mirar el GPS y suelta la pantalla');
  const durPaused = await text(p, '#gpsDur'); await wait(1300);
  t.eq(await text(p, '#gpsDur'), durPaused, 'en pausa el reloj no avanza');
  await p.click('[data-action="gps-resume"]'); await wait(300);
  await p.evaluate(([LAT0, LON0, STEP, T0]) => {
    window.__push(LAT0 + 70 * STEP, LON0, 6, T0 + 200000); // 450 m más allá (lo caminado en pausa)
    window.__push(LAT0 + 71 * STEP, LON0, 6, T0 + 204000);
    window.__push(LAT0 + 72 * STEP, LON0, 6, T0 + 208000);
  }, [LAT0, LON0, STEP, T0]);
  await wait(300);
  t.eq(await text(p, '#gpsDist'), '0,34', 'al seguir no suma el tramo hecho en pausa (31 × 11,1 m)');

  // Recargar a mitad: se ofrece seguir o terminar.
  await p.reload(); await wait(2500);
  await p.click('#nav-cardio'); await wait(300);
  t.has(await text(p, '.gps-sec'), 'Tenés una salida en curso', 'al recargar a mitad se ofrece seguir');
  t.eq(await text(p, '#gpsDist'), '0,34', 'la distancia sigue después de recargar');
  t.eq(await p.evaluate(() => window.__geo.n), 0, 'web: no mira el GPS hasta tocar «Seguir»');
  await p.click('[data-action="gps-continue"]'); await wait(300);
  t.eq(await p.evaluate(() => Object.keys(window.__geo.watchers).length), 1, '«Seguir» vuelve a mirar el GPS');
  t.ok(!(await text(p, '.gps-sec')).includes('Tenés una salida en curso'), '«Seguir» saca el aviso');

  // Permiso negado: aviso claro y el tiempo sigue.
  await p.evaluate(() => window.__deny()); await wait(300);
  t.has(await text(p, '#gpsMsg'), 'no tiene permiso para usar tu ubicación', 'permiso negado: aviso claro');

  // Terminar → resumen → guardar.
  await p.click('[data-action="gps-finish"]'); await wait(400);
  t.ok(pg.dialogs.some(d => d.includes('¿Terminar la salida?')), 'terminar pide confirmación');
  t.eq(await p.evaluate(() => Object.keys(window.__geo.watchers).length), 0, 'al terminar deja de mirar el GPS');
  const sum = await text(p, '#gpsSum');
  for (const s of ['Distancia 0,34 km', 'Duración 00:0', 'Ritmo medio', 'Velocidad media', 'Velocidad máxima', 'Calorías']) t.has(sum, s, 'resumen');
  t.ok(!sum.includes('Calculado con 70 kg'), 'con peso cargado no aclara lo de 70 kg');
  t.ok(!sum.includes('No se registró distancia'), 'con distancia no avisa');
  await p.click('[data-action="gps-save"]'); await wait(2500);
  const list = await text(p, '#gpsList');
  t.has(list, 'Correr', 'aparece en Tus salidas'); t.has(list, '0,34 km', 'Tus salidas con km y coma'); t.ok(/\/km/.test(list), 'Tus salidas con ritmo');
  const post = cloud.find(c => c.m === 'POST');
  t.ok(!!post, 'se mandó a /rest/v1/cardio_sessions: ' + JSON.stringify(cloud.map(c => c.m)));
  if (post){
    const row = [].concat(JSON.parse(post.body))[0] || {};
    t.eq(Object.keys(row).sort(), ['avg_speed_kmh', 'client_id', 'distance_m', 'duration_s', 'id', 'kcal', 'kind', 'max_speed_kmh', 'performed_on', 'started_at'], 'columnas de la salida (sin coordenadas)');
    t.ok(!/lat|lon|coord/i.test(post.body), 'sin coordenadas: ' + post.body);
    t.ok(UUID.test(row.id) && row.client_id === ALUMNO.id && row.kind === 'correr', 'id uuid, alumno y tipo');
    t.ok(row.distance_m >= 340 && row.distance_m <= 350, 'distancia en metros: ' + row.distance_m);
    t.ok(row.duration_s >= 118 && row.duration_s < 200, 'duración en segundos: ' + row.duration_s);
    t.ok(row.kcal > 15 && row.kcal < 40, 'kcal: ' + row.kcal);
    t.ok(row.max_speed_kmh >= 9.5 && row.max_speed_kmh <= 11, 'velocidad máxima sin saltos (≈ 10 km/h): ' + row.max_speed_kmh);
    t.ok(row.avg_speed_kmh > 5 && row.avg_speed_kmh < 11, 'velocidad media: ' + row.avg_speed_kmh);
    t.eq(row.performed_on, await p.evaluate(() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }), 'fecha local');
    t.has(post.q, 'on_conflict=id', 'reintentar no duplica (upsert por id)');
  }
  let st = await saved(p);
  t.eq((st.cardio || []).length, 1, 'se guardó en el dispositivo (state.cardio)');
  t.ok(!/lat|lon/i.test(JSON.stringify(st.cardio)), 'lo guardado no tiene coordenadas');
  t.eq(await p.evaluate(() => localStorage.getItem('gize_cardio_run')), null, 'no queda la salida en curso (ni el último punto)');
  t.eq(await p.evaluate(() => JSON.parse(localStorage.getItem('core_outbox_v1') || '[]').length), 0, 'la cola quedó vacía');

  // Al recargar sigue (la nube vacía no la borra: todavía no la vio).
  // Borrar una (con confirmación).
  const id = st.cardio[0].id;
  await p.click('[data-action="gps-del"]'); await wait(2000);
  t.ok(pg.dialogs.some(d => d.includes('¿Borrar esta salida?')), 'borrar pide confirmación');
  t.has(await text(p, '#gpsList'), 'Todavía no guardaste salidas', 'se borró de Tus salidas');
  t.ok(cloud.some(c => c.m === 'DELETE' && c.q.includes('id=eq.' + id)), 'se borró de la nube');

  // Sin distancia, en bici y sin peso: velocidad en vez de ritmo, aviso de GPS y 70 kg.
  await p.evaluate(async () => { const s = await import('/app/core/state.js'); s.state.weights = []; });
  await p.click('[data-action="gps-kind"][data-kind="bici"]'); await wait(200);
  await p.click('[data-action="gps-start"]'); await wait(300);
  t.has(await text(p, '.gps-live'), 'km/h media', 'bici: velocidad media en vez de ritmo');
  await age(p, 60000);
  await p.click('[data-action="gps-finish"]'); await wait(300);
  const sum2 = await text(p, '#gpsSum');
  t.has(sum2, 'No se registró distancia', 'menos de 0,05 km: avisa que el GPS no registró distancia');
  t.has(sum2, 'Calculado con 70 kg', 'sin peso: aclara que usó 70 kg');
  t.ok(!sum2.includes('Ritmo medio'), 'bici: sin ritmo en el resumen');
  t.has(sum2, 'Guardar', 'igual se puede guardar'); t.has(sum2, 'Descartar', 'o descartar');
  await p.click('[data-action="gps-discard"]'); await wait(300);
  t.ok(!!(await p.$('[data-action="gps-start"]')), 'descartar vuelve a Iniciar');
  t.eq((await saved(p)).cardio.length, 0, 'descartar no guarda nada');
  t.eq(pg.errs, [], 'errores de la página (web)');
  await pg.close();

  // ===== Tabla todavía sin crear =====
  const other = [];
  const NOTABLE = { code: 'PGRST205', message: "Could not find the table 'public.cardio_sessions' in the schema cache", details: null, hint: null };
  pg = await newPage({ user: ALUMNO, state: Object.assign({}, STATE, { cardio: [{ id: '0f0f0f0f-0000-4000-8000-000000000001', kind: 'caminar', date: '2026-09-28', startedAt: '2026-09-28T12:00:00.000Z', dur: 1800, dist: 2500, kcal: 100, avg: 5, max: 6 }] }),
    init: FAKE_WEB, handlers: {
      '/profiles': profile('client'),
      '/cardio_sessions': (r, J) => J(NOTABLE, 404),
      '/daily_logs': (r, J, i) => { if (i.m !== 'GET') other.push(i.m); return undefined; },
    } });
  p = pg.p;
  await p.goto(base + '/app/'); await wait(2500);
  await p.click('#nav-cardio'); await wait(300);
  t.has(await text(p, '#gpsList'), '2,50 km', 'sin la tabla, la salida del dispositivo sigue ahí');
  await p.click('[data-action="gps-start"]'); await wait(200);
  await p.evaluate(([LAT0, LON0, STEP]) => { const t0 = Date.now(); for (let i = 0; i < 10; i++) window.__push(LAT0 + i * STEP, LON0, 5, t0 + i * 4000); }, [LAT0, LON0, STEP]);
  await age(p, 40000);
  await p.click('[data-action="gps-finish"]'); await wait(200);
  await p.click('[data-action="gps-save"]'); await wait(300);
  await p.evaluate(async () => { const m = await import('/app/core/supabase.js'); await m.cloudSaveDaily('2026-09-29', { comment: 'hola' }); });
  await wait(500);
  const q = await p.evaluate(() => ({ cola: JSON.parse(localStorage.getItem('core_outbox_v1') || '[]').map(i => i.k), apartados: JSON.parse(localStorage.getItem('core_outbox_failed_v1') || '[]').length }));
  t.eq(q, { cola: ['cardio'], apartados: 0 }, 'sin la tabla la salida queda pendiente (no se descarta)');
  t.ok(other.includes('POST'), 'y no traba lo demás de la cola (el registro del día salió)');
  t.eq((await saved(p)).cardio.length, 2, 'las dos salidas quedan en el dispositivo');
  t.eq(pg.errs, [], 'errores de la página (sin tabla)');
  await pg.close();

  // ===== App nativa =====
  pg = await newPage({ user: ALUMNO, state: STATE, init: FAKE_NATIVE, handlers: H });
  p = pg.p;
  await p.goto(base + '/app/'); await wait(2500);
  await p.click('#nav-cardio'); await wait(300);
  t.ok(!(await text(p, '.gps-sec')).includes('En la web'), 'app nativa: sin el aviso de la web');
  await p.click('[data-action="gps-start"]'); await wait(300);
  const opts = await p.evaluate(() => window.__bg.opts);
  t.eq(opts && [opts.backgroundTitle, opts.backgroundMessage, opts.requestPermissions, opts.stale], ['GIZE está registrando tu salida', 'Tocá para volver', true, false], 'addWatcher con notificación (servicio en primer plano) y pidiendo permiso');
  await p.evaluate(([LAT0, LON0, STEP]) => { const t0 = Date.now(); for (let i = 0; i <= 10; i++) window.__bg.cb({ latitude: LAT0 + i * STEP, longitude: LON0, accuracy: 8, time: t0 + i * 4000 }); }, [LAT0, LON0, STEP]);
  await wait(300);
  t.eq(await text(p, '#gpsDist'), '0,11', 'nativo: los puntos del plugin suman distancia');
  // Recargar (la app se cerró a mitad): se vuelve a enganchar solo.
  await p.reload(); await wait(2500);
  t.eq(await p.evaluate(() => window.__bg.added), 1, 'nativo: al reabrir vuelve a enganchar el GPS');
  await p.click('#nav-cardio'); await wait(300);
  t.has(await text(p, '.gps-sec'), 'Tenés una salida en curso', 'nativo: avisa que hay una salida en curso');
  await p.click('[data-action="gps-continue"]'); await wait(200);
  t.eq(await p.evaluate(() => window.__bg.added), 1, '«Seguir» no agrega otro watcher');
  await p.evaluate(() => window.__bg.cb(null, { code: 'NOT_AUTHORIZED', message: 'no' })); await wait(300);
  t.ok(pg.dialogs.some(d => d.includes('Abrir los ajustes')), 'permiso negado: ofrece abrir los ajustes');
  t.eq(await p.evaluate(() => window.__bg.settings), 1, 'abre los ajustes con openSettings');
  t.has(await text(p, '#gpsMsg'), 'no tiene permiso', 'permiso negado: aviso en pantalla');
  await p.click('[data-action="gps-finish"]'); await wait(300);
  t.eq(await p.evaluate(() => window.__bg.removed), ['w1'], 'al terminar se llama removeWatcher');
  t.eq(pg.errs, [], 'errores de la página (nativo)');
  await pg.close();

  // ===== Coach =====
  const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
  const A1 = '44444444-4444-4444-4444-444444444444';
  const row = { id: '0f0f0f0f-0000-4000-8000-000000000002', client_id: A1, performed_on: '2026-09-27', started_at: '2026-09-27T10:00:00Z', kind: 'correr', duration_s: 2693, distance_m: 7180, kcal: 517, avg_speed_kmh: 9.6, max_speed_kmh: 12.3, created_at: '2026-09-27T10:50:00Z' };
  pg = await newPage({ user: COACH, viewport: { width: 1100, height: 900 }, handlers: {
    '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
      if (/coach_id=eq/.test(i.url.search)) return J([{ id: A1, full_name: 'Ana Alumna' }]); return J(i.one ? me : [me]); },
    '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
    '/cardio_sessions': (r, J, i) => i.m === 'GET' ? J(/client_id=eq\.4444/.test(i.url.search) ? [row] : []) : undefined,
  } });
  p = pg.p;
  await p.goto(base + '/app/'); await wait(3500);
  await p.click(`[data-coach="open"][data-id="${A1}"]`); await wait(1500);
  t.has(await text(p, '#coachHost'), '1 salida', 'la ficha muestra la tarjeta Cardio con el resumen');
  await p.click('[data-coach="sec-open"][data-v="cardio"]'); await wait(400);
  const co = await text(p, '#coachHost');
  for (const s of ['27 sep', 'Correr', '7,18', '00:44:53', '6:15 /km', '517']) t.has(co, s, 'coach: sección Cardio');
  t.eq(pg.errs, [], 'errores de la página (coach)');
  await pg.close();
}
