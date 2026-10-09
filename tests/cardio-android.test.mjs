// Cardio en la app de Android: NADA de ubicación (pedidos: «solo mapa en iphone», «ANDROID SIN
// NADA DE UBICACION» y «nada de mapa para cardio en android»).
// a) Alumno en la app de Android (Capacitor falso con el plugin de ubicación espiado, y el GPS y
//    los permisos del navegador espiados): Cardio sin «Salir a moverte» ni textos de GPS o mapa;
//    el plan de cardio del coach, los pasos y el cronómetro siguen. Forzar las acciones o start()
//    no arranca nada. Una salida medida en el iPhone se abre solo con sus números (distancia,
//    tiempo, ritmo, calorías y fecha): sin mapa, sin el dibujo del recorrido (ni se lo pide a la
//    nube, aunque esté en la caché), sin «Compartir» ni «Ver de nuevo». Nunca se pide MapLibre ni
//    OpenFreeMap y nunca se toca el plugin, el GPS ni el permiso de ubicación.
// b) Una salida que quedó en curso de una versión anterior: al abrir se termina sola en el último
//    punto medido (sin mirar el GPS ni llamar al plugin) y se guarda con sus números; la lista de
//    watchers que había quedado anotada se olvida sin llamar al plugin.
// c) Con el puente de Android (window.androidBridge) aunque Capacitor no esté: igual.
// d) Coach en la app de Android: la salida del alumno solo con sus números, sin pedir el recorrido.
// e) La app de iPhone sigue igual: «Salir a moverte» y el recorrido de la salida (se pide).
// f) Lo nativo: el build de Android no lleva el plugin de ubicación (capacitor.config.json
//    android.includePlugins con todos los demás, y los gradle que escribe cap sync), el manifiesto
//    no declara ningún permiso de ubicación (y los saca si una biblioteca los sumara), sin el
//    servicio del GPS ni FOREGROUND_SERVICE; los workflows de Android frenan si el plugin vuelve
//    después de cap sync. La app de iPhone sigue con el plugin.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');

const ID1 = '5a1d0000-0000-4000-8000-0000000000a1', RUN = '5a1d0000-0000-4000-8000-0000000000b2';
const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated' };
const A1 = '44444444-4444-4444-4444-444444444444';
const STATE = { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {} };
// Una salida medida en el iPhone (como la devuelve la nube, sin el recorrido), con un corte de
// señal de 5 min: en el iPhone se avisa «El GPS se cortó…»; en Android, sin nombrar el GPS.
const ROW = client => ({ id: ID1, client_id: client, mode: 'pie', performed_on: '2026-10-01', started_at: '2026-10-01T13:00:00+00:00', ended_at: '2026-10-01T13:45:01+00:00',
  duration_s: 2701, moving_s: 2699, distance_m: 5499, kcal: 366, avg_speed_kmh: 7.33, max_speed_kmh: 11.01, weight_kg: 70, weight_default: false, gap_s: 300,
  breakdown: { caminar: 1204, trotar: 894, correr: 601 }, segments: [], splits: [[1000, 720], [1000, 630], [1000, 450], [1000, 409], [1000, 327], [499, 163]], points: 540,
  created_at: '2026-10-01T13:46:00+00:00' });
const NUMEROS = ['5,50', 'km', 'Distancia', 'Tiempo', '45:01', 'Ritmo medio', 'Calorías', '366 kcal', '1 oct', 'Parciales', '20 min caminando · 15 trotando · 10 corriendo', 'La señal se cortó 5 min: ese rato no suma distancia.'];
const MAPA = /maplibre|openfreemap/i;

// Supabase falso de cardio_outings: la lista y el recorrido (anota cada pedido).
const outings = (S, track) => (r, J, i) => {
  const q = decodeURIComponent(i.url.search);
  S.reqs.push(i.m + ' ' + q);
  if (i.m !== 'GET') return J([], 201);
  if (/select=track/.test(q)) return J(i.one ? { track } : [{ track }]);
  return J(S.rows);
};
const PLAN = (r, J, i) => { if (i.m !== 'GET') return undefined; const np = { client_id: ALUMNO.id, kcal: null, plan: { cardio: { text: '30 min de cinta', items: ['Martes: 20 min de bici'] } } }; return J(i.one ? np : [np]); };

// Espías: el GPS y los permisos del navegador, y el plugin de ubicación (cualquier método que se
// toque queda anotado en window.__usos).
const ESPIAS = () => {
  const usos = window.__usos = [];
  Object.defineProperty(navigator, 'geolocation', { value: {
    watchPosition(){ usos.push('geo.watchPosition'); return 1; }, clearWatch(){ usos.push('geo.clearWatch'); }, getCurrentPosition(){ usos.push('geo.getCurrentPosition'); },
  }, configurable: true });
  const perms = navigator.permissions;
  Object.defineProperty(navigator, 'permissions', { value: { query: d => { if (d && d.name === 'geolocation') usos.push('permiso.geolocation'); return perms.query(d); } }, configurable: true });
  window.__bg = new Proxy({}, { get: (o, k) => k === 'then' ? undefined : () => { usos.push('plugin.' + String(k)); return Promise.resolve({ location: 'granted' }); } });
};
const APP = `{ getInfo: async () => ({ version: '1.0.0', build: '999' }), addListener: () => Promise.resolve({ remove(){} }), getLaunchUrl: async () => null }`;
const NATIVA = plat => `(${ESPIAS})();
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => '${plat}', isPluginAvailable: () => true,
    Plugins: { BackgroundGeolocation: window.__bg, App: ${APP} } };`;
// La apariencia completa (sin modo liviano): así, si algo quisiera el mapa, lo pediría.
const COMPLETA = "localStorage.setItem('gize_lite','0');";

// Texto tal cual (innerText respeta las mayúsculas del CSS).
const text = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return e ? e.textContent.replace(/\s+/g, ' ').trim() : ''; }, sel);
const usos = p => p.evaluate(() => window.__usos.slice());
const html = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return e ? e.innerHTML : ''; }, sel);

// Sin «Salir a moverte» ni nada que lo abra o que hable de GPS, ubicación o mapa.
async function sinSalir(p, t, que){
  const v = await text(p, '#view');
  t.ok(!/Salir a moverte/.test(v), que + ': sin «Salir a moverte»');
  t.eq(await p.$$eval('#view [data-action="sal-sheet"], #view .sal-salir, #salSheet, #salLive', l => l.length), 0, que + ': ni el botón, ni la hoja, ni una salida en vivo');
  t.ok(!/GPS|mapa|ubicaci/i.test(v), que + ': ningún texto de GPS, ubicación o mapa: ' + v.slice(0, 200));
}
// Forzar lo que arranca una salida no hace nada.
async function forzar(p, t, que){
  const r = await p.evaluate(async () => {
    const c = await import('/app/screens/cardio.js'), g = await import('/app/ui/gps.js');
    c.openSalSheet();
    for (const a of ['sal-sheet', 'sal-start', 'sal-aviso-ok', 'sal-resume', 'sal-settings']) c.salidaAction(a, document.body);
    g.acceptDisclosure();
    const res = await g.start('pie');
    await new Promise(ok => setTimeout(ok, 300));
    return { res, run: g.GpsState.run && g.GpsState.run.status, hoja: !!document.getElementById('salSheet'), aviso: !!document.getElementById('salAviso'), ajustes: g.openSettings() };
  });
  t.eq(r, { res: { ok: false, why: 'sin-gps' }, run: null, hoja: false, aviso: false, ajustes: false }, que + ': forzar «Salir a moverte», «Empezar» o start() no arranca nada');
}
// El resumen de la salida: solo los números.
async function soloNumeros(p, t, que){
  const h = await html(p, '#salidaHost');
  t.ok(h.includes('sov-solo'), que + ': el resumen sin mapa (cabecera de números)');
  t.eq(await p.$$eval('#salidaHost [data-rv], #salidaHost .rv, #salidaHost canvas, #salidaHost .sal-leg, #salidaHost .sov-map', l => l.length), 0, que + ': ni mapa, ni dibujo del recorrido, ni su leyenda');
  t.eq(await p.$$eval('#salidaHost [data-action="sal-share"], #salidaHost [data-action="sal-replay"]', l => l.length), 0, que + ': sin «Compartir» ni «Ver de nuevo»');
  const s = await text(p, '#salidaHost');
  t.ok(!/recorrido|mapa|GPS/i.test(s), que + ': ningún texto del recorrido ni del mapa: ' + s.slice(0, 200));
  t.ok(await p.$('#salidaHost .sov-nums.in'), que + ': los números a la vista');
  return s;
}

async function alumno(base, t, TRACK){
  const S = { rows: [ROW(ALUMNO.id)], reqs: [] };
  const pg = await newPage({ user: ALUMNO, state: STATE, init: NATIVA('android') + COMPLETA,
    handlers: { '/profiles': profile('client'), '/nutrition': PLAN, '/cardio_outings': outings(S, TRACK) } });
  const p = pg.p, reqs = [];
  p.on('request', r => reqs.push(r.url()));
  // El recorrido ya está en la caché del celular: igual no se dibuja.
  await p.addInitScript(([id, tr]) => localStorage.setItem('gize_salidas_track_v1', JSON.stringify([[id, tr]])), [ID1, TRACK]);
  await p.goto(base + '/app/'); await wait(2500);
  t.ok(await p.evaluate(() => document.documentElement.classList.contains('android-app')), 'app de Android (html.android-app)');
  await p.click('#nav-cardio'); await wait(500);
  const v = await text(p, '#view');
  for (const s of ['Tu cardio de esta semana', '30 min de cinta', 'Pasos', 'Tus salidas', 'Cronómetro y temporizador'])
    t.has(v, s, 'Android: Cardio sigue con «' + s + '»');
  t.ok(await p.$('#view [data-action="sw-toggle"]'), 'Android: el cronómetro sigue');
  await sinSalir(p, t, 'Android');
  await forzar(p, t, 'Android');
  await sinSalir(p, t, 'Android, después de forzar');

  // La salida medida en el iPhone: solo sus números.
  await p.click(`[data-action="sal-open"][data-id="${ID1}"]`); await wait(800);
  const s = await soloNumeros(p, t, 'Android');
  for (const n of NUMEROS) t.has(s, n, 'Android: el resumen muestra «' + n + '»');
  t.ok(await p.$('#salidaHost [data-action="sal-del"]'), 'Android: se puede borrar');
  t.eq(S.reqs.filter(q => /select=track/.test(q)), [], 'Android: el recorrido no se pide a la nube');
  // Las acciones del recorrido, forzadas: nada.
  await p.evaluate(async () => { const c = await import('/app/screens/cardio.js'); c.salidaAction('sal-share', document.body); c.salidaAction('sal-replay', document.body); });
  await wait(300);
  t.eq(await p.$$eval('#salShare', l => l.length), 0, 'Android: no se arma la imagen del recorrido para compartir');
  await p.click('#salidaHost [data-action="sal-close"]'); await wait(300);
  t.eq(reqs.filter(u => MAPA.test(u)), [], 'Android: nunca se pide MapLibre ni OpenFreeMap');
  t.eq(await usos(p), [], 'Android: nunca se toca el plugin de ubicación, el GPS ni el permiso de ubicación');
  t.eq(pg.errs, [], 'errores de la página (Android)');
  await pg.close();
}

// Una salida que quedó en curso (o en pausa) de una versión anterior con GPS.
async function enCurso(base, t, run){
  const S = { rows: [], reqs: [] };
  const pg = await newPage({ user: ALUMNO, state: STATE, init: NATIVA('android') + COMPLETA, handlers: { '/profiles': profile('client'), '/cardio_outings': outings(S, '') } });
  const p = pg.p, reqs = [];
  p.on('request', r => reqs.push(r.url()));
  await p.addInitScript(([h, c]) => {
    if (sessionStorage.getItem('guardada')) return;
    sessionStorage.setItem('guardada', '1');
    localStorage.setItem('gize_salida_v1', h); localStorage.setItem('gize_salida_v1_c0', c); localStorage.setItem('gize_salida_nid', '["w1"]');
  }, [JSON.stringify(run.header), JSON.stringify(run.pts)]);
  await p.goto(base + '/app/'); await wait(2500);
  const g = await p.evaluate(async () => { const g = await import('/app/ui/gps.js'), r = g.GpsState.run; return r && { id: r.id, status: r.status, ended: r.ended, n: r.pts.length }; });
  t.eq(g, { id: RUN, status: 'ended', ended: run.lastT, n: run.pts.length }, 'Android: la salida en curso de antes queda terminada en el último punto medido, con todos sus puntos');
  t.eq(await p.evaluate(() => localStorage.getItem('gize_salida_nid')), null, 'Android: la lista de watchers de antes se olvida');
  await p.click('#nav-cardio'); await wait(500);
  t.has(await text(p, '#view'), 'Tu salida terminó', 'Android: Cardio la muestra para guardarla');
  await sinSalir(p, t, 'Android (salida de antes)');
  await p.click('#view [data-action="sal-review"]'); await wait(800);
  await soloNumeros(p, t, 'Android (salida de antes)');
  t.ok(await p.$('#salidaHost [data-action="sal-save"]') && await p.$('#salidaHost [data-action="sal-discard"]'), 'Android: «Guardar» y «Descartar»');
  await p.click('#salidaHost [data-action="sal-save"]'); await wait(600);
  const st = await p.evaluate(async () => { const { state } = await import('/app/core/state.js'), g = await import('/app/ui/gps.js'); return { ids: (state.salidas || []).map(s => s.id), run: g.GpsState.run }; });
  t.eq(st, { ids: [RUN], run: null }, 'Android: se guarda con sus números');
  t.ok(await p.$('#salidaHost .sov-solo [data-action="sal-del"]'), 'Android: guardada, sigue solo con los números');
  t.eq(reqs.filter(u => MAPA.test(u)), [], 'Android (salida de antes): nunca se pide el mapa');
  t.eq(await usos(p), [], 'Android (salida de antes): nunca se toca el plugin, el GPS ni el permiso');
  t.eq(pg.errs, [], 'errores de la página (salida de antes)');
  await pg.close();
}

// Solo el puente de Android (sin Capacitor todavía).
async function puente(base, t){
  const S = { rows: [ROW(ALUMNO.id)], reqs: [] };
  const pg = await newPage({ user: ALUMNO, state: STATE, init: `(${ESPIAS})(); window.androidBridge = {};` + COMPLETA, handlers: { '/profiles': profile('client'), '/cardio_outings': outings(S, '1;x') } });
  const p = pg.p, reqs = [];
  p.on('request', r => reqs.push(r.url()));
  await p.goto(base + '/app/'); await wait(2500);
  await p.click('#nav-cardio'); await wait(500);
  await sinSalir(p, t, 'androidBridge');
  await forzar(p, t, 'androidBridge');
  await p.click(`[data-action="sal-open"][data-id="${ID1}"]`); await wait(800);
  await soloNumeros(p, t, 'androidBridge');
  t.eq(reqs.filter(u => MAPA.test(u)), [], 'androidBridge: nunca se pide el mapa');
  t.eq(await usos(p), [], 'androidBridge: nunca se toca el GPS ni el permiso');
  t.eq(pg.errs, [], 'errores de la página (androidBridge)');
  await pg.close();
}

async function coach(base, t, TRACK){
  const C = { rows: [ROW(A1)], reqs: [] };
  const pg = await newPage({ user: COACH, init: NATIVA('android') + COMPLETA, handlers: {
    '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
      if (/coach_id=eq/.test(i.url.search)) return J([{ id: A1, full_name: 'Ana Alumna' }]); return J(i.one ? me : [me]); },
    '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'cortesia', max_clients: 10, trial_ends_at: '2099-01-01T00:00:00Z' }; return J(i.one ? b : [b]); },
    '/cardio_outings': outings(C, TRACK),
  } });
  const p = pg.p, reqs = [];
  p.on('request', r => reqs.push(r.url()));
  await p.goto(base + '/app/'); await wait(3500);
  await p.click(`[data-coach="open"][data-id="${A1}"]`); await wait(1500);
  await p.click('[data-coach="sec-open"][data-v="salidas"]'); await wait(500);
  await p.click(`[data-coach="salida-open"][data-id="${ID1}"]`); await wait(1000);
  const det = await text(p, '.co-sec-body');
  for (const n of ['5,50 km', 'Tiempo', '45:01', 'Ritmo medio', '366 kcal', '1 oct', 'Parciales', 'La señal se cortó 5 min']) t.has(det, n, 'coach en Android: la salida muestra «' + n + '»');
  t.eq(await p.$$eval('.co-sec-body .sal-ruta, .co-sec-body [data-rv], .co-sec-body .rv, .co-sec-body canvas, .co-sec-body .sal-leg', l => l.length), 0, 'coach en Android: sin mapa, sin el dibujo del recorrido ni su leyenda');
  t.ok(!/recorrido|mapa|GPS/i.test(det), 'coach en Android: ningún texto del recorrido, del mapa ni del GPS: ' + det.slice(0, 300));
  t.eq(C.reqs.filter(q => /select=track/.test(q)), [], 'coach en Android: el recorrido no se pide');
  t.eq(reqs.filter(u => MAPA.test(u)), [], 'coach en Android: nunca se pide el mapa');
  t.eq(await usos(p), [], 'coach en Android: nunca se toca el plugin, el GPS ni el permiso');
  t.eq(pg.errs, [], 'errores de la página (coach en Android)');
  await pg.close();
}

// La app de iPhone, igual que siempre (el control de las pruebas de arriba).
async function iphone(base, t, TRACK){
  const S = { rows: [ROW(ALUMNO.id)], reqs: [] };
  const pg = await newPage({ user: ALUMNO, state: STATE, init: NATIVA('ios'), handlers: { '/profiles': profile('client'), '/cardio_outings': outings(S, TRACK) } });
  const p = pg.p;
  await p.goto(base + '/app/'); await wait(2500);
  await p.click('#nav-cardio'); await wait(500);
  t.has(await text(p, '#view'), 'Salir a moverte', 'iPhone: «Salir a moverte» sigue');
  await p.click(`[data-action="sal-open"][data-id="${ID1}"]`); await wait(1200);
  t.eq(S.reqs.filter(q => /select=track/.test(q)).length, 1, 'iPhone: al abrir la salida se pide su recorrido');
  t.ok(await p.$('#salidaHost .rv') && await p.$('#salidaHost [data-action="sal-share"]'), 'iPhone: el recorrido y «Compartir»');
  t.has(await text(p, '#salidaHost'), 'El GPS se cortó 5 min', 'iPhone: el corte de señal sigue nombrando el GPS');
  t.eq(pg.errs, [], 'errores de la página (iPhone)');
  await pg.close();
}

function nativo(t){
  const GEO = '@capacitor-community/background-geolocation';
  // Los plugins de Capacitor de package.json (todo menos el núcleo, las plataformas y la CLI).
  const deps = Object.keys(JSON.parse(read('package.json')).dependencies || {}).filter(d => !['@capacitor/android', '@capacitor/core', '@capacitor/ios', '@capacitor/cli'].includes(d));
  t.ok(deps.includes(GEO), 'package.json sigue con el plugin de ubicación (la app de iPhone lo usa)');
  const cfg = JSON.parse(read('capacitor.config.json'));
  t.eq(cfg.android && cfg.android.includePlugins, deps.filter(d => d !== GEO), 'capacitor.config.json: Android con todos los plugins menos el de ubicación (si se suma uno a package.json, va acá también)');
  t.ok(!cfg.includePlugins && !(cfg.ios && cfg.ios.includePlugins), 'capacitor.config.json: iPhone con todos los plugins');
  // Lo que escribe cap sync (y los workflows vuelven a escribir con npm run android).
  const gname = d => d.replace('@', '').replace('/', '-');
  const settings = read('android/capacitor.settings.gradle'), build = read('android/app/capacitor.build.gradle');
  const order = s => [...s.matchAll(/project\(':([^']+)'\)\.projectDir/g)].map(m => m[1]);
  t.eq(order(settings), ['capacitor-android'].concat(cfg.android.includePlugins.map(gname)), 'Android: capacitor.settings.gradle con los plugins de includePlugins, en el orden en que los escribe cap sync');
  t.eq([...build.matchAll(/implementation project\(':([^']+)'\)/g)].map(m => m[1]), cfg.android.includePlugins.map(gname), 'Android: capacitor.build.gradle con los mismos');
  t.ok(!/geolocation/i.test(settings + build), 'Android: el plugin de ubicación no está en gradle');
  const spm = read('ios/App/CapApp-SPM/Package.swift');
  t.ok(spm.includes('.package(name: "CapacitorCommunityBackgroundGeolocation", path: "../../../node_modules/@capacitor-community/background-geolocation")'), 'iPhone: sigue con el plugin de ubicación');

  const man = read('android/app/src/main/AndroidManifest.xml');
  const perms = [...man.matchAll(/<uses-permission\b[^>]*>/g)].map(m => m[0]);
  for (const x of ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'ACCESS_BACKGROUND_LOCATION', 'FOREGROUND_SERVICE_LOCATION'])
    t.eq(perms.filter(p => p.includes('android.permission.' + x + '"')), ['<uses-permission android:name="android.permission.' + x + '" tools:node="remove" />'], 'Android: ' + x + ' solo para sacarlo (tools:node="remove")');
  t.eq(perms.filter(p => /LOCATION/.test(p) && !/tools:node="remove"/.test(p)), [], 'Android: ningún permiso de ubicación declarado');
  t.eq(perms.filter(p => /FOREGROUND_SERVICE/.test(p) && !/tools:node="remove"/.test(p)), [], 'Android: sin servicio en primer plano (lo usaba solo el plugin de ubicación)');
  t.ok(!/<service\b|equimaps|foregroundServiceType|android\.hardware\.location/.test(man), 'Android: sin el servicio del GPS ni el GPS como característica');
  t.ok(perms.some(p => p.includes('android.permission.POST_NOTIFICATIONS"')), 'Android: las notificaciones siguen');
  t.ok(!/geolocation/i.test(read('android/app/src/main/res/values/strings.xml')), 'Android: sin los textos de la notificación del GPS');
  for (const w of ['.github/workflows/android.yml', '.github/workflows/android-release.yml']){
    const y = read(w), sync = y.indexOf('run: npm run android'), guard = y.indexOf('grep -q "background-geolocation" android/capacitor.settings.gradle android/app/capacitor.build.gradle android/app/src/main/assets/capacitor.plugins.json');
    t.ok(sync > 0 && guard > sync && /exit 1/.test(y.slice(guard, guard + 400)), w + ': después de cap sync frena si el plugin de ubicación volvió al build');
  }
}

export default async function ({ base, t }){
  nativo(t);
  // Un recorrido de verdad (dos vueltas a una plaza) y una salida en curso de una versión
  // anterior (200 puntos en línea recta), armados con el motor.
  const helper = await newPage({});
  await helper.p.goto(base + '/privacidad/');
  const { TRACK, run } = await helper.p.evaluate(async RUN => {
    const m = await import('/app/core/cardiogps.js');
    const pts = []; let a = 0;
    for (let i = 0; i < 2700; i++){ a += (i < 1200 ? 5 : 11) / 3.6 / 300; if (i % 5 === 0) pts.push({ lat: -34.6 + Math.sin(a) * 300 / 111195, lon: -58.4 + Math.cos(a) * 300 / 91500, t: i }); }
    const t0 = Date.now() - 20 * 60000, r = m.newRun('pie', t0, RUN);
    let t = t0;
    for (let i = 0; i < 200; i++){ t += 1000; m.addPoint(r, { lat: -34.6 + i * 2.5 / 111195, lon: -58.4, acc: 5, spd: null, t }); }
    const lastT = r.start + r.pts[r.pts.length - 1][0];
    return { TRACK: m.encodeTrack([pts]), run: { pts: r.pts, lastT, header: { v: 1, id: RUN, uid: null, mode: 'pie', start: t0, status: 'running', pauses: [], pausedAt: null, ended: null, seg: 0, n: r.pts.length, chunks: 1, lastT } } };
  }, RUN);
  await helper.close();
  await alumno(base, t, TRACK);
  await enCurso(base, t, run);
  await puente(base, t);
  await coach(base, t, TRACK);
  await iphone(base, t, TRACK);
}
