// Cardio sin mapa de calles (pedido: «nada de mapa para cardio en android»).
// a) Navegador de Android (Chrome en un Android): la salida con GPS anda como siempre (aviso,
//    empezar, puntos, distancia, terminar y guardar), pero nunca se pide MapLibre ni OpenFreeMap ni
//    se crea un contexto de WebGL. En vivo y en el resumen: el cartelito fijo «Sin mapa de calles»
//    (no el texto de arriba del mapa) y la grilla más marcada; en el resumen, además, la escala y
//    las marcas de cada km. Sin conexión, sin el aviso «Sin conexión…» (ahí nunca hay mapa). La
//    imagen para compartir, sin los créditos del mapa.
// b) iPhone (Safari) y la compu: el mapa se sigue pidiendo (MapLibre de vendor/).
// c) Modo liviano en la compu: el mismo aspecto sin mapa (cartelito, grilla, escala y marcas).
import { newPage, wait, ALUMNO, profile, empezarSalida } from './lib.mjs';

const STATE = { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {} };
const H = { '/profiles': profile('client') };
const TRACK_KEY = 'gize_salidas_track_v1';
const NO_MAP = 'Sin mapa de calles', OFFLINE = 'Sin conexión: el recorrido sin el mapa de fondo.';
const MAP_CREDIT = 'OpenFreeMap © OpenMapTiles © OpenStreetMap';
const MAPA = /maplibre|openfreemap/i;
const UA = {
  android: 'Mozilla/5.0 (Linux; Android 14; SM-A135M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
};

// El navegador (userAgent), espías de WebGL (contextos pedidos) y del texto que se escribe en
// los canvas (marcas de km, créditos de la imagen), y un GPS web falso con un reloj que avanza:
// __push(lat, lon, acc, t) manda un punto a la hora t y el reloj de la página queda en t.
const INIT = ua => `(() => {
  ${ua ? `Object.defineProperty(Navigator.prototype, 'userAgent', { get: () => ${JSON.stringify(ua)}, configurable: true });` : ''}
  window.__gl = 0; window.__txt = [];
  const gc = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...a){ if (/webgl/i.test(type)) window.__gl++; return gc.call(this, type, ...a); };
  const ft = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (s, ...a){ window.__txt.push(String(s)); return ft.call(this, s, ...a); };
  const real = Date.now.bind(Date);
  window.__skew = 0; Date.now = () => real() + window.__skew;
  window.__geo = { watchers: {}, n: 0 };
  Object.defineProperty(navigator, 'geolocation', { value: {
    watchPosition(ok, err){ const id = ++window.__geo.n; window.__geo.watchers[id] = { ok, err }; return id; },
    clearWatch(id){ delete window.__geo.watchers[id]; }, getCurrentPosition(){},
  }, configurable: true });
  Object.defineProperty(navigator, 'wakeLock', { value: { request: async () => ({ addEventListener(){}, release: async () => {} }) }, configurable: true });
  window.__push = (lat, lon, acc, t) => {
    window.__skew = t - real();
    for (const k in window.__geo.watchers) window.__geo.watchers[k].ok({ coords: { latitude: lat, longitude: lon, accuracy: acc, speed: null }, timestamp: t });
  };
  localStorage.setItem('gize_lite', '0'); localStorage.setItem('gize_salida_aviso', '1');
})();`;

const vista = (p, sel) => p.evaluate(sel => {
  const v = document.querySelector(sel + ' .rv'); if (!v) return null;
  const vis = e => !!e && !e.hidden && getComputedStyle(e).display !== 'none';
  const nm = v.querySelector('.rv-nomap'), sc = v.querySelector('.rv-scale'), msg = v.querySelector('.rv-msg');
  const r = v.getBoundingClientRect(), nr = vis(nm) ? nm.getBoundingClientRect() : null;
  return {
    sinMapa: v.classList.contains('sin-mapa'), conMapa: v.classList.contains('con-mapa'), estado: v.dataset.estado,
    nomap: vis(nm) ? nm.textContent : '', nomapAdentro: !!nr && nr.left >= r.left && nr.right <= r.right && nr.top >= r.top && nr.bottom <= r.bottom,
    msg: vis(msg) ? msg.textContent : '',
    escala: vis(sc) ? sc.querySelector('span').textContent : null, escalaPx: vis(sc) ? Math.round(sc.querySelector('i').getBoundingClientRect().width) : 0, ancho: Math.round(r.width),
    grilla: getComputedStyle(v.querySelector('.rv-bg')).backgroundImage,
  };
}, sel);
const linea = (p, sel) => p.evaluate(sel => {
  const c = document.querySelector(sel + ' .rv-line'); if (!c || !c.width) return 0;
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0;
  for (let i = 3; i < d.length; i += 16) if (d[i] > 200) n++;
  return n;
}, sel);
const listo = async (p, sel) => { for (let i = 0; i < 100; i++){ const v = await vista(p, sel); if (v && v.estado === 'listo') return v; await wait(100); } return vista(p, sel); };
const ESCALA = /^(50|100|200|250|500) m$|^(1|2|5|10|20|50) km$/;

// a) Navegador de Android: una salida entera.
async function navegadorAndroid(base, t){
  const pg = await newPage({ user: ALUMNO, state: STATE, handlers: H, init: INIT(UA.android), reducedMotion: 'reduce' });
  const p = pg.p, reqs = [];
  p.on('request', r => reqs.push(r.url()));
  await p.goto(base + '/app/'); await wait(2500);
  t.eq(await p.evaluate(async () => { const m = await import('/app/core/plataforma.js'); return [m.navegadorAndroid(), m.appAndroid()]; }), [true, false], 'Chrome en Android: navegador de Android (no la app)');
  t.eq(await p.evaluate(async () => (await import('/app/ui/mapa.js')).canUseMap()), false, 'Chrome en Android: sin mapa de calles');
  await p.click('#nav-cardio'); await wait(400);
  await empezarSalida(p); await wait(500);
  t.eq(await p.evaluate(() => Object.keys(window.__geo.watchers).length), 1, 'Chrome en Android: la salida mira el GPS como siempre');
  // 800 puntos al norte a 10 km/h (≈ 2,2 km), uno por segundo.
  const t0 = await p.evaluate(() => Date.now() + 1000);
  await p.evaluate(t0 => { for (let i = 0; i < 800; i++) window.__push(-34.6 + i * 10 / 3.6 / 111195, -58.4, 5, t0 + i * 1000); }, t0);
  await wait(400);
  await p.evaluate(async () => (await import('/app/screens/cardio.js')).liveMapTick(true)); await wait(300);
  const dist = await p.evaluate(() => document.getElementById('salDist').textContent);
  t.ok(parseFloat(dist.replace(',', '.')) > 2, 'Chrome en Android: suma la distancia: ' + dist);
  let v = await vista(p, '.sal-minimap');
  t.ok(v && v.sinMapa && !v.conMapa, 'en vivo: el recorrido sin mapa de calles: ' + JSON.stringify(v));
  t.eq([v && v.nomap, v && v.nomapAdentro], [NO_MAP, true], 'en vivo: el cartelito fijo «Sin mapa de calles», adentro del mini mapa');
  t.ok(v && v.msg !== NO_MAP, 'en vivo: el cartelito no es el texto de arriba del mapa');
  t.eq(v && v.escala, null, 'en vivo: sin escala');
  t.ok(await linea(p, '.sal-minimap') > 30, 'en vivo: el recorrido se dibuja');
  t.ok(/linear-gradient/.test(v && v.grilla), 'en vivo: la grilla más marcada: ' + (v && v.grilla.slice(0, 60)));

  // Terminar: el resumen con la escala y las marcas de cada km.
  await p.evaluate(() => { window.__txt.length = 0; });
  await p.click('#salLive [data-action="sal-stop"]'); await wait(300);
  v = await listo(p, '#salidaHost');
  t.ok(v && v.sinMapa && !v.conMapa, 'resumen: sin mapa de calles: ' + JSON.stringify(v));
  t.eq([v && v.nomap, v && v.msg], [NO_MAP, ''], 'resumen: el cartelito fijo, sin otro aviso arriba');
  t.ok(v && ESCALA.test(v.escala) && v.escalaPx > v.ancho * 0.1 && v.escalaPx < v.ancho * 0.4, 'resumen: la escala con un largo redondo: ' + JSON.stringify(v && [v.escala, v.escalaPx, v.ancho]));
  const marcas = await p.evaluate(() => window.__txt.filter(x => /^\d+$/.test(x)));
  t.ok(marcas.includes('1') && marcas.includes('2'), 'resumen: las marcas de cada km (1 y 2): ' + JSON.stringify([...new Set(marcas)]));
  await p.click('#salidaHost [data-action="sal-save"]'); await wait(600);
  const saved = await p.evaluate(async k => { const { state } = await import('/app/core/state.js'); const rec = (state.salidas || [])[0]; const c = JSON.parse(localStorage.getItem(k) || '[]'); return { rec, track: rec && (c.find(x => x[0] === rec.id) || [])[1] }; }, TRACK_KEY);
  t.ok(saved.rec && saved.track, 'Chrome en Android: la salida se guarda con su recorrido');

  // Compartir: la imagen sin la foto del mapa ni sus créditos.
  await p.evaluate(() => { window.__txt.length = 0; });
  await p.click('#salidaHost [data-action="sal-share"]');
  await p.waitForSelector('#salShare[data-listo="1"]', { timeout: 15000 }).catch(() => {});
  const txt = await p.evaluate(() => window.__txt.slice());
  t.ok(txt.includes('Entrenado con GIZE'), 'compartir: se armó la imagen');
  t.ok(!txt.includes(MAP_CREDIT), 'compartir: sin los créditos del mapa (no lleva mapa)');
  t.eq(reqs.filter(u => MAPA.test(u)), [], 'Chrome en Android: nunca se pide MapLibre ni OpenFreeMap');
  t.eq(await p.evaluate(() => window.__gl), 0, 'Chrome en Android: ningún contexto de WebGL');
  t.eq(pg.errs, [], 'errores de la página (Chrome en Android)');
  await pg.close();
  return saved;
}

// Una salida guardada abierta en otro navegador. extra: init de más.
async function abrirGuardada(base, saved, ua, extra){
  const local = Object.assign({}, saved.rec); delete local.cloud;
  const pg = await newPage({ user: ALUMNO, state: Object.assign({}, STATE, { salidas: [local] }), handlers: H, reducedMotion: 'reduce',
    init: INIT(ua) + `localStorage.setItem(${JSON.stringify(TRACK_KEY)}, ${JSON.stringify(JSON.stringify([[saved.rec.id, saved.track]]))});` + (extra || '') });
  const reqs = [];
  pg.p.on('request', r => reqs.push(r.url()));
  await pg.p.goto(base + '/app/'); await wait(2500);
  await pg.p.click('#nav-cardio'); await wait(400);
  await pg.p.click(`[data-action="sal-open"][data-id="${saved.rec.id}"]`); await wait(300);
  return Object.assign(pg, { reqs });
}

export default async function ({ base, t }){
  const saved = await navegadorAndroid(base, t);
  if (!saved.rec || !saved.track) return;

  // Chrome en Android sin conexión: el cartelito, sin el aviso de «Sin conexión…».
  let pg = await abrirGuardada(base, saved, UA.android, "Object.defineProperty(Navigator.prototype, 'onLine', { get: () => false, configurable: true });");
  let v = await listo(pg.p, '#salidaHost');
  t.eq([v && v.nomap, v && v.msg], [NO_MAP, ''], 'Chrome en Android sin conexión: «Sin mapa de calles» y no el aviso de «' + OFFLINE + '»');
  t.eq(pg.reqs.filter(u => MAPA.test(u)), [], 'Chrome en Android sin conexión: nunca se pide el mapa');
  t.eq(pg.errs, [], 'errores de la página (Chrome en Android sin conexión)');
  await pg.close();

  // iPhone (Safari) y la compu: el mapa se pide como siempre.
  for (const [name, ua] of [['iPhone', UA.iphone], ['compu', '']]){
    pg = await abrirGuardada(base, saved, ua);
    const gl = await pg.p.evaluate(async () => (await import('/app/ui/mapa.js')).webglOk());
    t.eq(await pg.p.evaluate(async () => (await import('/app/core/plataforma.js')).navegadorAndroid()), false, name + ': no es Android');
    if (gl){
      for (let i = 0; i < 50 && !pg.reqs.some(u => /vendor\/maplibre-gl-6\.11\.2\/maplibre-gl\.js/.test(u)); i++) await wait(100);
      t.ok(pg.reqs.some(u => /vendor\/maplibre-gl-6\.11\.2\/maplibre-gl\.js/.test(u)), name + ': se carga MapLibre para el mapa de calles');
    }
    t.eq(pg.errs, [], 'errores de la página (' + name + ')');
    await pg.close();
  }

  // Modo liviano en la compu: el mismo aspecto sin mapa.
  pg = await abrirGuardada(base, saved, '', "localStorage.setItem('gize_lite', '1');");
  v = await listo(pg.p, '#salidaHost');
  t.ok(v && v.sinMapa && v.nomap === NO_MAP && ESCALA.test(v.escala) && /linear-gradient/.test(v.grilla), 'modo liviano: cartelito, escala y grilla: ' + JSON.stringify(v));
  t.ok((await pg.p.evaluate(() => window.__txt)).includes('1'), 'modo liviano: las marcas de cada km');
  t.eq(pg.reqs.filter(u => MAPA.test(u)), [], 'modo liviano: nunca se pide el mapa');
  t.eq(pg.errs, [], 'errores de la página (modo liviano)');
  await pg.close();
}
