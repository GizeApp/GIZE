// Cardio «A pie» / «En bici», paso 2: el seguimiento con GPS (app/ui/gps.js), solo en la web.
// a) Archivos nativos: compartir y archivos en package.json y Package.swift (iPhone) y en Android,
//    sin ningún plugin de ubicación (ninguna de las dos apps la usa: tests/cardio-android.test.mjs y
//    tests/ios-sin-ubicacion.test.mjs); el permiso para guardar imágenes del iPhone; useLegacyBridge
//    (y que la app no cargue marcos de terceros: con ese puente, cualquier marco llegaría a lo
//    nativo); PrivacyInfo sin la ubicación.
// b) Web con GPS falso: aviso «Usar tu ubicación» antes de pedir nada; empezar, puntos, partes de
//    400 guardadas (la llena no se reescribe; se escribe como mucho cada 5 s o 20 puntos), pausa y
//    seguir (sube seg, pantalla prendida pedida y soltada), recargar a mitad (se retoma con el
//    mismo id y todos los puntos), terminar, descartar, permiso negado, sin espacio, y el tope de
//    puntos (se achica y se reescribe todo).
// c) App en segundo plano: se guarda en el acto y el reloj de main.js no anda.
// d) El reloj de main.js no se prende por una salida fuera de Cardio.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
const STATE = { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [{ date: '2026-09-01', kg: 70 }, { date: '2026-09-20', kg: 72 }], daily: {} };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LAT0 = -34.6, LON0 = -58.4;
const KEY = 'gize_salida_v1';
const T = {
  webLimit: 'En el navegador, GIZE mide la salida solo con la pantalla prendida y la app abierta.',
  permWeb: 'GIZE no tiene permiso para usar tu ubicación. Permitilo en los ajustes del navegador.',
  quota: 'El celular se quedó sin espacio para guardar la salida en curso: no cierres GIZE hasta terminarla.',
};

// GPS, pantalla prendida y permisos del navegador falsos. window.__push(lat, lon, acc, t): un
// punto a la hora t (mientras llega, el reloj de la página marca t, como con un GPS de verdad).
// window.__writes cuenta lo que se escribe de la salida; window.__full simula el celular lleno.
const FAKE_WEB = () => {
  window.__geo = { watchers: {}, n: 0, opts: null };
  window.__wake = { req: 0, rel: 0 };
  window.__perm = 'prompt';
  window.__writes = {};
  window.__full = false;
  const geo = {
    watchPosition(ok, err, opts){ const id = ++window.__geo.n; window.__geo.watchers[id] = { ok, err }; window.__geo.opts = opts; return id; },
    clearWatch(id){ delete window.__geo.watchers[id]; },
    getCurrentPosition(){},
  };
  Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true });
  Object.defineProperty(navigator, 'wakeLock', { value: { request: async () => { window.__wake.req++; return { addEventListener(){}, release: async () => { window.__wake.rel++; } }; } }, configurable: true });
  const perms = navigator.permissions;
  Object.defineProperty(navigator, 'permissions', { value: { query: async d => (d && d.name === 'geolocation') ? { state: window.__perm } : perms.query(d) }, configurable: true });
  const si = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v){
    if (/^gize_salida_v1/.test(k)){
      if (window.__full) throw new DOMException('Sin espacio', 'QuotaExceededError');
      window.__writes[k] = (window.__writes[k] || 0) + 1;
    }
    return si.call(this, k, v);
  };
  window.__push = (lat, lon, acc, t) => {
    const real = Date.now; Date.now = () => t;
    try { for (const k in window.__geo.watchers) window.__geo.watchers[k].ok({ coords: { latitude: lat, longitude: lon, accuracy: acc, speed: null }, timestamp: t }); }
    finally { Date.now = real; }
  };
  window.__deny = () => { for (const k in window.__geo.watchers) window.__geo.watchers[k].err({ code: 1, message: 'denied' }); };
};

// Puntos en línea recta a kmh km/h, uno por segundo, desde el índice i0 (hora t0 + i0 s).
const walk = (p, fn, i0, n, t0, kmh = 10) => p.evaluate(([fn, i0, n, t0, kmh, LAT0, LON0]) => {
  const d = kmh / 3.6 / 111195;
  for (let i = i0; i < i0 + n; i++) window[fn](LAT0 + i * d, LON0, 5, t0 + i * 1000);
}, [fn, i0, n, t0, kmh, LAT0, LON0]);
const G = (p, f, arg) => p.evaluate(async ([f, arg]) => {
  const g = await import('/app/ui/gps.js');
  const v = await (typeof g[f] === 'function' ? g[f](arg) : g[f]);
  return v === undefined ? null : JSON.parse(JSON.stringify(v));
}, [f, arg === undefined ? null : arg]);
const gs = p => p.evaluate(async () => { const g = await import('/app/ui/gps.js'); return JSON.parse(JSON.stringify(g.GpsState)); });
const ls = (p, k) => p.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), k);
const lsKeys = p => p.evaluate(k => Object.keys(localStorage).filter(x => x.startsWith(k)).sort(), KEY);

function staticChecks(t){
  const pkg = JSON.parse(read('package.json')).dependencies || {};
  t.eq([pkg['@capacitor-community/background-geolocation'], pkg['@capacitor/share'], pkg['@capacitor/filesystem']], [undefined, '^7.0.4', '^7.1.8'], 'package.json: compartir y archivos (Capacitor 7), sin el plugin de ubicación');
  const lock = JSON.parse(read('package-lock.json')).packages || {};
  t.eq(['@capacitor-community/background-geolocation', '@capacitor/share', '@capacitor/filesystem'].map(n => (lock['node_modules/' + n] || {}).version), [undefined, '7.0.4', '7.1.8'], 'package-lock.json igual (CI usa npm ci)');
  const settings = read('android/capacitor.settings.gradle'), build = read('android/app/capacitor.build.gradle');
  for (const [m, dir] of [['capacitor-filesystem', '@capacitor/filesystem'], ['capacitor-share', '@capacitor/share']]){
    t.has(settings, `include ':${m}'\nproject(':${m}').projectDir = new File('../node_modules/${dir}/android')`, 'Android: ' + m + ' en capacitor.settings.gradle');
    t.has(build, `implementation project(':${m}')`, 'Android: ' + m + ' en capacitor.build.gradle');
  }
  const spm = read('ios/App/CapApp-SPM/Package.swift');
  for (const [n, dir] of [['CapacitorFilesystem', '@capacitor/filesystem'], ['CapacitorShare', '@capacitor/share']]){
    t.has(spm, `.package(name: "${n}", path: "../../../node_modules/${dir}")`, 'iPhone: ' + n + ' en Package.swift');
    t.has(spm, `.product(name: "${n}", package: "${n}")`, 'iPhone: producto ' + n);
  }
  t.ok(!/geolocation/i.test(spm), 'iPhone: Package.swift sin el plugin de ubicación');
  t.has(read('scripts/ios-sin-facebook.mjs'), 'node_modules/@capgo/capacitor-social-login/Package.swift', 'el script de iPhone sigue tocando solo el plugin de login');

  const cfg = JSON.parse(read('capacitor.config.json'));
  t.eq(cfg.android && cfg.android.useLegacyBridge, true, 'Android: useLegacyBridge (se puso para la ubicación en segundo plano, que ya no está; queda como estaba)');
  // useLegacyBridge deja el puente con lo nativo al alcance de CUALQUIER marco de la página (sin
  // el control de origen del puente nuevo), y @capacitor/filesystem lee y escribe archivos de la
  // app. Por eso la app nativa no puede cargar marcos de terceros: la CSP deja solo el de Google
  // (el botón de Google, que en la app no se usa) y Capacitor no navega a otros sitios. Si alguna
  // vez hace falta un iframe de afuera en la app, primero sacar useLegacyBridge.
  t.ok(!cfg.server || (!cfg.server.allowNavigation && !cfg.server.url), 'Capacitor: sin server.allowNavigation ni server.url (useLegacyBridge expone el puente a todo marco)');
  const csp = (read('app/index.html').match(/Content-Security-Policy" content="([^"]+)"/) || [])[1] || '';
  t.eq((csp.match(/(?:^|; )frame-src ([^;]+)/) || [])[1], 'https://accounts.google.com/gsi/', 'CSP: frame-src solo el de Google (con useLegacyBridge, ningún otro marco)');
  const appJs = fs.readdirSync(path.join(ROOT, 'app'), { recursive: true }).filter(f => /\.(js|html)$/.test(f)).map(f => read(path.join('app', f))).join('\n');
  t.ok(!/<iframe|createElement\(\s*["']iframe/i.test(appJs), 'la app no arma iframes');


  const plist = read('ios/App/App/Info.plist');
  const val = k => (plist.match(new RegExp('<key>' + k + '</key>\\s*<string>([^<]*)</string>')) || [])[1] || '';
  // Sin esto, guardar una imagen en Fotos (desde la hoja de compartir del sistema o tocando una
  // imagen) cierra la app.
  t.has(val('NSPhotoLibraryAddUsageDescription'), 'solo cuando elegís guardarla', 'iPhone: permiso para guardar una imagen en Fotos');
  t.ok(!/NSLocation|UIBackgroundModes/.test(plist), 'iPhone: sin textos de ubicación ni modos de fondo (detalle en tests/ios-sin-ubicacion.test.mjs)');
  const priv = read('ios/App/App/PrivacyInfo.xcprivacy');
  t.ok(!/Location/.test(priv), 'iPhone: PrivacyInfo no declara la ubicación (la app no la usa)');
  // El GPS se pide antes del aviso de la app nunca; nada de claves de mapas.
  t.ok(!/maptiler|mapa-clave/i.test(read('app/ui/gps.js')), 'gps.js sin servicios con clave');
}

// El peso viene de la nube (loadCloud pisa el del dispositivo): 72 kg.
const H = {
  '/profiles': profile('client'),
  '/body_weights': (r, J, i) => i.m === 'GET' ? J([{ id: 'w1', client_id: ALUMNO.id, measured_on: '2026-09-01', kg: 70 }, { id: 'w2', client_id: ALUMNO.id, measured_on: '2026-09-20', kg: 72 }]) : undefined,
};

async function web(base, t){
  const pg = await newPage({ user: ALUMNO, state: STATE, init: FAKE_WEB, handlers: H });
  const p = pg.p;
  await p.goto(base + '/app/'); await wait(2500);
  t.eq(await p.evaluate(() => window.__geo.n), 0, 'web: al abrir la app no se mira la ubicación');
  t.eq(await lsKeys(p), [], 'web: no hay salida guardada');
  await p.evaluate(async () => {
    const g = await import('/app/ui/gps.js');
    window.__chg = 0; window.__pts = 0;
    g.onChange(() => window.__chg++); g.onPoint(() => window.__pts++);
  });

  // Aviso antes de pedir nada.
  t.eq(await G(p, 'start', 'pie'), { ok: false, why: 'aviso' }, 'web: la primera vez falta el aviso «Usar tu ubicación»');
  t.eq(await p.evaluate(() => window.__geo.n), 0, 'web: sin el aviso no se pide la ubicación');
  const d = await G(p, 'disclosure');
  t.eq([d.title, d.ok, d.no], ['Usar tu ubicación', 'Seguir', 'Ahora no'], 'aviso: título y botones');
  t.has(d.text, 'Tu recorrido lo ven solo vos y tu coach.', 'aviso: quién ve el recorrido');
  t.eq(await G(p, 'hint'), T.webLimit, 'web: aviso de que la pantalla tiene que quedar prendida');
  await G(p, 'acceptDisclosure');

  // Empezar.
  t.eq(await G(p, 'start', 'pie'), { ok: true }, 'web: empieza');
  let s = await gs(p);
  t.ok(s.run && s.run.status === 'running' && s.run.mode === 'pie' && UUID.test(s.run.id) && s.run.uid === ALUMNO.id, 'la salida tiene id (uuid), modo y alumno: ' + JSON.stringify(s.run && [s.run.status, s.run.mode, s.run.id, s.run.uid]));
  t.eq(s.gps, 'buscando', 'antes del primer punto: buscando señal');
  t.eq(await p.evaluate(() => [Object.keys(window.__geo.watchers).length, window.__geo.opts, window.__wake.req]),
    [1, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 }, 1], 'web: watchPosition con alta precisión y la pantalla prendida');
  t.eq((await ls(p, KEY) || {}).status, 'running', 'se guardó en el acto al empezar');
  t.eq(await G(p, 'start', 'bici'), { ok: false, why: 'en-curso' }, 'no se empieza otra con una en curso');
  t.eq(await G(p, 'setMode', 'bici'), false, 'con una salida en curso no cambia el modo');
  t.eq(await p.evaluate(async () => (await import('/app/main.js')).tickActive()), false, 'el reloj de main.js no anda por una salida fuera de Cardio');

  const T0 = s.run.start;
  await walk(p, '__push', 1, 450, T0);
  s = await gs(p);
  t.eq(s.run.pts.length, 450, 'todos los puntos válidos quedan (empaquetados)');
  t.eq(s.gps, 'ok', 'con puntos: GPS bien');
  const c0 = await ls(p, KEY + '_c0'), c1 = await ls(p, KEY + '_c1'), h = await ls(p, KEY);
  t.eq(c0 && c0.length, 400, 'partes de 400 puntos: la primera llena');
  t.ok(c1 && c1.length >= 30 && c1.length <= 50 && h.n === 400 + c1.length && h.chunks === 2, 'la segunda con lo último (como mucho 5 s atrás): ' + (c1 && c1.length) + ' / cabecera ' + JSON.stringify(h && [h.n, h.chunks]));
  t.eq(Object.keys(h).sort(), ['chunks', 'ended', 'id', 'lastT', 'mode', 'n', 'pausedAt', 'pauses', 'seg', 'start', 'status', 'uid', 'v'], 'cabecera de la salida en curso');
  const w1 = await p.evaluate(() => window.__writes);
  t.ok(w1[KEY] <= 100, 'no escribe en cada punto (como mucho cada 5 s o 20 puntos): ' + w1[KEY] + ' veces para 450 puntos');
  const lv = await G(p, 'live');
  t.ok(lv.dist > 1150 && lv.dist < 1300, 'distancia en vivo (450 s a 10 km/h ≈ 1250 m): ' + lv.dist);
  t.ok(lv.cls === 'correr' && lv.kcal > 0 && lv.kgDefault === false, 'en vivo: tramo, calorías y peso cargado: ' + JSON.stringify([lv.cls, lv.kcal, lv.kgDefault]));
  // A 10 km/h llega un punto cada 2,8 m: con el mínimo de 3 m el motor acepta uno de cada dos.
  const subs = await p.evaluate(() => [window.__pts, window.__chg]);
  t.ok(subs[0] >= 200 && subs[0] <= 450 && subs[1] >= 1, 'avisa los puntos aceptados (onPoint) y los cambios (onChange): ' + JSON.stringify(subs));

  // (c) Al irse a segundo plano se guarda en el acto y el reloj de main.js no anda.
  await walk(p, '__push', 451, 3, T0);
  const before = (await ls(p, KEY)).n;
  await p.evaluate(() => document.dispatchEvent(new Event('pause')));
  const after = (await ls(p, KEY)).n;
  t.eq(await p.evaluate(async () => (await import('/app/main.js')).tickActive()), false, 'en segundo plano el reloj de main.js no anda');
  await p.evaluate(() => document.dispatchEvent(new Event('resume')));
  t.ok(before < 453 && after === 453, 'al irse la app se guarda en el acto: ' + before + ' → ' + after);

  // Pausa y seguir.
  await G(p, 'pause');
  s = await gs(p);
  t.eq([s.run.status, s.gps, (await ls(p, KEY)).status], ['paused', 'off', 'paused'], 'pausa: guardada en el acto');
  t.eq(await p.evaluate(() => [Object.keys(window.__geo.watchers).length, window.__wake.rel]), [0, 1], 'pausa: deja de mirar la ubicación y suelta la pantalla');
  await G(p, 'resume'); await wait(100);
  s = await gs(p);
  t.eq([s.run.status, s.run.seg], ['running', 1], 'seguir: sube seg (lo que se movió en pausa no suma)');
  t.eq(await p.evaluate(() => [Object.keys(window.__geo.watchers).length, window.__wake.req]), [1, 2], 'seguir: vuelve a mirar y pide la pantalla');
  const c0w = (await p.evaluate(() => window.__writes))[KEY + '_c0'];
  await walk(p, '__push', 600, 100, T0);
  t.eq((await p.evaluate(() => window.__writes))[KEY + '_c0'], c0w, 'la parte llena no se vuelve a escribir');
  const run1 = (await gs(p)).run, dist1 = (await G(p, 'live')).dist;

  // Recargar a mitad (app recargada o cerrada): se retoma sola.
  await p.reload(); await wait(2500);
  s = await gs(p);
  t.ok(s.run && s.run.id === run1.id && s.run.status === 'running' && s.run.seg === 1, 'al recargar se retoma la misma salida (mismo id)');
  t.eq(s.run && s.run.pts.length, run1.pts.length, 'con todos los puntos (se guardaron al cerrar la página)');
  t.eq(JSON.stringify(s.run && s.run.pts), JSON.stringify(run1.pts), 'los mismos puntos, en orden');
  t.ok(s.restored && /^Retomamos tu salida/.test(await G(p, 'restoredText')), 'avisa que se retomó');
  t.ok(Math.abs((await G(p, 'live')).dist - dist1) < 0.01, 'misma distancia que antes de recargar');
  t.eq(await p.evaluate(() => [window.__geo.n, window.__wake.req]), [1, 1], 'web: vuelve a mirar la ubicación y pide la pantalla');
  await walk(p, '__push', 700, 20, T0);
  t.ok((await G(p, 'live')).dist > dist1 + 40, 'después de recargar sigue sumando');

  // Terminar.
  const ended = await G(p, 'stop');
  t.eq(ended && ended.status, 'ended', 'terminar devuelve la salida terminada');
  t.eq([(await ls(p, KEY)).status, await p.evaluate(() => Object.keys(window.__geo.watchers).length)], ['ended', 0], 'terminar: guardada y sin mirar la ubicación');
  await p.reload(); await wait(2500);
  t.eq(await p.evaluate(() => window.__geo.n), 0, 'terminada: al recargar no se mira la ubicación');
  const te = await G(p, 'takeEnded');
  t.ok(te && te.id === run1.id && te.status === 'ended' && te.pts.length === run1.pts.length + 20, 'terminada sin guardar: sigue para guardarla (takeEnded)');
  t.eq(await G(p, 'start', 'pie'), { ok: false, why: 'en-curso' }, 'con una terminada sin guardar no se empieza otra');
  await G(p, 'discard');
  t.eq([await lsKeys(p), (await gs(p)).run], [[], null], 'descartar borra todo');

  // Permiso negado: al pedirlo, y si ya estaba negado.
  t.eq(await G(p, 'start', 'bici'), { ok: true }, 'en bici');
  await p.evaluate(() => window.__deny()); await wait(50);
  s = await gs(p);
  t.eq([s.run, s.errorWhy, s.error], [null, 'permiso', T.permWeb], 'permiso negado sin puntos: no queda salida y avisa');
  t.eq([await lsKeys(p), await p.evaluate(() => Object.keys(window.__geo.watchers).length)], [[], 0], 'permiso negado: nada guardado y sin mirar');
  await p.evaluate(() => { window.__perm = 'denied'; });
  t.eq(await G(p, 'start', 'pie'), { ok: false, why: 'permiso' }, 'el navegador ya lo había negado: no arranca');
  // watchPosition va en el mismo toque (iPhone), antes de saber si ya estaba negado: se suelta enseguida.
  t.eq([await p.evaluate(() => Object.keys(window.__geo.watchers).length), (await gs(p)).run, await lsKeys(p)], [0, null, []], 'y no queda mirando la ubicación ni guarda nada');
  await p.evaluate(() => { window.__perm = 'prompt'; });

  // Celular sin espacio: sigue en memoria y avisa; cuando hay lugar, guarda todo.
  t.eq(await G(p, 'start', 'pie'), { ok: true }, 'empieza otra');
  const T1 = (await gs(p)).run.start;
  await p.evaluate(() => { window.__full = true; });
  await walk(p, '__push', 1, 30, T1);
  s = await gs(p);
  t.eq([s.notice, s.run.pts.length], [T.quota, 30], 'sin espacio: avisa y sigue midiendo en memoria');
  await p.evaluate(() => { window.__full = false; });
  await walk(p, '__push', 40, 10, T1);
  t.eq((await gs(p)).notice, '', 'con lugar: guarda y saca el aviso');
  await p.evaluate(() => document.dispatchEvent(new Event('pause')));
  await p.evaluate(() => document.dispatchEvent(new Event('resume')));
  t.eq([(await gs(p)).run.pts.length, (await ls(p, KEY)).n, (await ls(p, KEY + '_c0') || []).length], [40, 40, 40], 'con lugar: no se perdió nada');
  await G(p, 'discard');

  // Tope de puntos (MAX_POINTS = 30.000): el motor achica la lista y se reescribe todo.
  t.eq(await G(p, 'start', 'bici'), { ok: true }, 'salida larga');
  const T2 = (await gs(p)).run.start;
  await walk(p, '__push', 1, 30010, T2, 20);
  await p.evaluate(() => document.dispatchEvent(new Event('pause')));
  await p.evaluate(() => document.dispatchEvent(new Event('resume')));
  const big = await p.evaluate(async k => {
    const g = await import('/app/ui/gps.js'), r = g.GpsState.run, h = JSON.parse(localStorage.getItem(k));
    const keys = Object.keys(localStorage).filter(x => x.startsWith(k + '_c'));
    const all = []; for (let i = 0; i < h.chunks; i++) all.push(...JSON.parse(localStorage.getItem(k + '_c' + i)));
    let sorted = true; for (let i = 1; i < all.length; i++) if (all[i][0] <= all[i - 1][0]) sorted = false;
    return { n: r.pts.length, h: h.n, chunks: h.chunks, keys: keys.length, all: all.length, same: JSON.stringify(all) === JSON.stringify(r.pts), sorted };
  }, KEY);
  t.ok(big.n > 15000 && big.n < 16000, 'pasando el tope se achica a la mitad: ' + big.n);
  t.ok(big.h === big.n && big.all === big.n && big.same && big.sorted && big.keys === big.chunks && big.chunks === Math.ceil(big.n / 400), 'lo guardado es la lista achicada, sin partes viejas: ' + JSON.stringify(big));
  await G(p, 'discard');
  t.eq(await lsKeys(p), [], 'descartar borra todas las partes');
  t.eq(pg.errs, [], 'errores de la página (web)');
  await pg.close();
}

export default async function ({ base, t }){
  staticChecks(t);
  await web(base, t);
}
