// Cardio «A pie» en el navegador del iPhone: con la pantalla bloqueada o en otra app el GPS se
// corta. Caminando por una calle, 25 s sin datos (la página oculta) y al volver el primer dato
// flojo y corrido 25 m; después datos buenos más adelante, sobre la misma calle.
// a) El recorrido en vivo llega siempre al punto «estás acá»: la punta (de color) termina justo
//    donde está el punto azul.
// b) Al volver: el dato flojo no suma ni se dibuja de color; la punta va gris de puntos hasta que
//    llega un dato bueno. Después, el hueco queda unido en neón entre las dos piezas (pedido: una
//    recta de color continua, nunca invisible ni hacia el dato flojo), la distancia y el tiempo en movimiento lo cuentan (en
//    línea recta) y la pantalla avisa qué pasó.
// c) El recorrido guardado: el hueco corta el dibujo y se une en neón (prepareRoute.gaps),
//    salvo donde lo recortó la privacidad de la imagen (trimTrack).
// El mapa de fondo no sale a internet en las pruebas (gize_mapa_off): proyección propia.
import { newPage, wait, text, ALUMNO, profile } from './lib.mjs';

const STATE = { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {} };
const H = { '/profiles': profile('client') };

// GPS web falso con un reloj que avanza (como tests/cardio-mapa-vivo.test.mjs) y la página que se
// puede ocultar (__hide(true|false)).
const FAKE = () => {
  const real = Date.now.bind(Date);
  window.__skew = 0;
  Date.now = () => real() + window.__skew;
  window.__geo = { watchers: {}, n: 0 };
  Object.defineProperty(navigator, 'geolocation', { value: {
    watchPosition(ok, err){ const id = ++window.__geo.n; window.__geo.watchers[id] = { ok, err }; return id; },
    clearWatch(id){ delete window.__geo.watchers[id]; }, getCurrentPosition(){},
  }, configurable: true });
  Object.defineProperty(navigator, 'wakeLock', { value: { request: async () => ({ addEventListener(){}, release: async () => {} }) }, configurable: true });
  const perms = navigator.permissions;
  Object.defineProperty(navigator, 'permissions', { value: { query: d => (d && d.name === 'geolocation') ? Promise.resolve({ state: 'granted' }) : perms.query(d) }, configurable: true });
  window.__push = (lat, lon, acc, t) => {
    window.__skew = t - real();
    for (const k in window.__geo.watchers) window.__geo.watchers[k].ok({ coords: { latitude: lat, longitude: lon, accuracy: acc, speed: null }, timestamp: t });
  };
  let hidden = false;
  Object.defineProperty(document, 'visibilityState', { get: () => hidden ? 'hidden' : 'visible', configurable: true });
  Object.defineProperty(document, 'hidden', { get: () => hidden, configurable: true });
  window.__hide = h => { hidden = h; document.dispatchEvent(new Event('visibilitychange')); };
};
// Un lugar cualquiera (no es de nadie): el Monumento a la Bandera, en Rosario. La «calle» va
// hacia el este por esta latitud.
const LAT = -32.9476, LON = -60.6305, M = 111195, KX = M * Math.cos(LAT * Math.PI / 180), V = 1.4;

// El mini mapa: la punta, el punto azul, las piezas y el color de las capas en un lugar.
const view = p => p.evaluate(async () => {
  const v = (await import('/app/ui/mapa.js')).routeView('live'); if (!v) return null;
  const L = v.layers, h = v.el.querySelector('.rv-here');
  const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(h && !h.hidden ? h.style.transform : '');
  const xy = L.xy ? L.xy.map(a => Array.from(a)) : [];
  return { tip: L.tip, here: m ? [+m[1], +m[2]] : null, pieces: xy.length, xy, gaps: L.prep ? L.prep.gaps : null, dpr: L.dpr };
});
// ¿Hay algo dibujado en la capa cls cerca de (x, y) (px CSS)? → el mayor alfa en un cuadrado de 5 px.
const alpha = (p, cls, x, y) => p.evaluate(([cls, x, y]) => {
  const c = document.querySelector('.sal-minimap .' + cls); if (!c) return -1;
  const k = c.width / parseFloat(c.style.width), d = c.getContext('2d').getImageData(Math.round(x * k) - 2, Math.round(y * k) - 2, 5, 5).data;
  let a = 0; for (let i = 3; i < d.length; i += 4) a = Math.max(a, d[i]); return a;
}, [cls, x, y]);
// Color del trazo en ese punto: [r, g, b] del píxel más opaco alrededor.
const color = (p, cls, x, y) => p.evaluate(([cls, x, y]) => {
  const c = document.querySelector('.sal-minimap .' + cls); if (!c) return null;
  const k = c.width / parseFloat(c.style.width), d = c.getContext('2d').getImageData(Math.round(x * k) - 2, Math.round(y * k) - 2, 5, 5).data;
  let best = -1, out = null; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > best){ best = d[i + 3]; out = [d[i], d[i + 1], d[i + 2]]; } return out;
}, [cls, x, y]);
const gs = p => p.evaluate(async () => { const g = await import('/app/ui/gps.js'), c = await import('/app/core/cardiogps.js'); const r = g.GpsState.run; return { pts: r.pts.length, notice: g.GpsState.notice, hole: c.liveHole(r), dist: c.liveStats(r, Date.now()).dist, moving: c.liveStats(r, Date.now()).movingMs / 1000, holeText: g.TEXTS.hole }; });
const tick = p => p.evaluate(async () => (await import('/app/screens/cardio.js')).liveMapTick(true));
const push = (p, pts) => p.evaluate(list => { for (const q of list) window.__push(q[0], q[1], q[2], q[3]); }, pts);
// Caminando por la calle: segundos s0..s1 (un dato por segundo), con 1 m de ruido de lado.
const street = (t0, s0, s1, acc = 5) => { const out = []; for (let s = s0; s <= s1; s++) out.push([LAT + Math.sin(s * 1.7) / M, LON + s * V / KX, acc, t0 + s * 1000]); return out; };

export default async function ({ base, t }){
  const pg = await newPage({ user: ALUMNO, state: STATE, init: FAKE, handlers: H });
  const p = pg.p;
  await p.addInitScript("localStorage.setItem('gize_mapa_off','1'); localStorage.setItem('gize_lite','0'); localStorage.setItem('gize_salida_aviso','1');");
  await p.goto(base + '/app/'); await wait(2500);
  await p.click('#nav-cardio'); await wait(400);
  await p.click('[data-action="sal-start"]'); await wait(500);
  const t0 = await p.evaluate(() => Date.now() + 1000);

  // 60 s caminando por la calle; el redibujo de cada 5 s y después 3 datos más (no aceptados
  // todavía por el motor, o aceptados sin redibujo): la punta los alcanza.
  await push(p, street(t0, 0, 60)); await wait(200);
  await tick(p); await wait(200);
  await push(p, street(t0, 61, 63)); await wait(1300);
  let v = await view(p);
  t.ok(v && v.tip && v.here, 'en vivo: la punta y el punto azul: ' + JSON.stringify(v && { tip: v.tip, here: v.here }));
  if (v && v.tip && v.here){
    t.ok(Math.abs(v.tip.x - v.here[0]) < 0.6 && Math.abs(v.tip.y - v.here[1]) < 0.6 && !v.tip.dash, 'el último punto dibujado del recorrido es el punto azul (punta de color): ' + JSON.stringify([v.tip, v.here]));
    const a = v.xy[v.xy.length - 1], lx = a[a.length - 2], ly = a[a.length - 1];
    t.ok(Math.hypot(v.tip.x - lx, v.tip.y - ly) > 1, 'el recorrido redibujado quedó atrás del punto azul (lo une la punta): ' + Math.hypot(v.tip.x - lx, v.tip.y - ly).toFixed(1) + ' px');
    t.ok(await alpha(p, 'rv-head', v.tip.x, v.tip.y) > 200, 'la punta se dibuja hasta el punto azul');
  }
  const before = await gs(p);

  // La pantalla se bloquea 25 s (caminando): ningún dato. Al volver, el primero flojo (28 m) y
  // corrido 25 m al norte.
  await p.evaluate(() => window.__hide(true)); await wait(300);
  await p.evaluate(() => window.__hide(false)); await wait(300);
  await push(p, [[LAT + 25 / M, LON + 89 * V / KX, 28, t0 + 89 * 1000]]); await wait(1300);
  let s = await gs(p);
  t.ok(s.hole && s.pts === before.pts + 1 && Math.abs(s.dist - before.dist) < 0.5, 'al volver, el dato flojo: queda el hueco abierto, se guarda y no suma: ' + JSON.stringify([s.hole, s.pts - before.pts, Math.round(s.dist - before.dist)]));
  await tick(p); await wait(200);
  v = await view(p);
  t.ok(v.tip && v.tip.dash && Math.abs(v.tip.x - v.here[0]) < 0.6 && Math.abs(v.tip.y - v.here[1]) < 0.6, 'la punta hasta el punto azul va gris de puntos (hubo un corte): ' + JSON.stringify([v.tip, v.here]));
  t.eq(v.pieces, 1, 'ningún tramo de color hasta el dato flojo');
  {
    const a = v.xy[0], lx = a[a.length - 2], ly = a[a.length - 1], f = 0.5;
    t.ok(await alpha(p, 'rv-line', lx + (v.tip.x - lx) * f, ly + (v.tip.y - ly) * f) === 0, 'sin línea de color hacia el dato flojo');
  }

  // Datos buenos, sobre la calle, más adelante.
  await push(p, street(t0, 90, 110)); await wait(1300);
  await tick(p); await wait(300);
  s = await gs(p);
  v = await view(p);
  t.ok(!s.hole, 'con un dato bueno, el hueco se cierra');
  t.eq([v.pieces, v.gaps], [2, [1]], 'el recorrido en 2 piezas, unidas en neón');
  if (v.pieces === 2){
    const a = v.xy[0], b = v.xy[1], ax = a[a.length - 2], ay = a[a.length - 1], bx = b[0], by = b[1];
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    t.ok(Math.abs(ay - by) < 3, 'la pieza nueva sigue sobre la calle (no en el dato corrido): ' + JSON.stringify([ay, by]));
    t.eq(await alpha(p, 'rv-line', mx, my), 0, 'el hueco: sin línea de color');
    let dots = 0;
    for (let i = 1; i < 10; i++) if (await alpha(p, 'rv-head', ax + (bx - ax) * i / 10, ay + (by - ay) * i / 10) > 60) dots++;
    t.eq(dots, 9, 'el hueco: una línea continua (no invisible ni de puntos)');
    const c = await color(p, 'rv-head', mx, my);
    t.ok(c && Math.max(...c) - Math.min(...c) > 60, 'el hueco: en neón (con color, no gris): ' + JSON.stringify(c));
    t.ok(v.tip && !v.tip.dash, 'de nuevo, la punta de color hasta el punto azul');
  }
  // Del último dato antes del corte (segundo 63) al último (110): 47 × 1,4 m, en línea recta por
  // la misma calle (el zigzag de 1 m del GPS infla un poco lo de antes; acá no importa).
  const real = (110 - 63) * V, got = s.dist - before.dist;
  t.ok(Math.abs(got - real) < 8, 'la distancia cuenta el hueco (en línea recta): ' + Math.round(got) + ' m de ' + Math.round(real));
  t.ok(s.moving > 95, 'y el tiempo en movimiento también: ' + Math.round(s.moving) + ' s');
  t.has(await text(p, '#salLive'), s.holeText, 'la pantalla avisa qué pasó con el corte');

  // El recorrido guardado: el hueco corta el dibujo y se une en neón; la privacidad de la
  // imagen no se cruza con la unión.
  const g = await p.evaluate(async () => {
    const C = await import('/app/core/cardiogps.js'), R = await import('/app/ui/ruta.js'), gps = await import('/app/ui/gps.js');
    const r = gps.GpsState.run, an = C.analyzeRun(r), tr = C.trackOf(an.pts, r.start, an.segs);
    const pcs = C.decodeTrack(tr.track), prep = R.prepareRoute(pcs, 'pie');
    // Una vuelta que pasa cerca del inicio a la mitad: la privacidad la parte en dos.
    const k = 111195, kx = k * Math.cos(-32.9476 * Math.PI / 180), P = (x, y, t) => ({ lat: -32.9476 + y / k, lon: -60.6305 + x / kx, t });
    const loop = [[P(0, 0, 0), P(600, 0, 400), P(600, 600, 800), P(0, 600, 1200), P(-20, 50, 1600), P(-600, 50, 2000)]];
    const cut = R.prepareRoute(C.trimTrack(loop, 200), 'pie'), cut2 = R.prepareRoute(C.trimTrack([loop[0].slice(0, 3), loop[0].slice(3)], 200), 'pie');
    return { pieces: pcs.length, gaps: prep.gaps, cut: [cut.pieces.length, cut.gaps], cut2: [cut2.pieces.length, cut2.gaps] };
  });
  t.eq([g.pieces, g.gaps], [2, [1]], 'guardado: el hueco corta el dibujo y se une en neón');
  t.eq(g.cut, [2, []], 'imagen para compartir: lo que recortó la privacidad no se une');
  t.eq(g.cut2, [3, [1]], 'imagen para compartir: un corte del GPS lejos del inicio sí se une');
  t.eq(pg.errs, [], 'errores de la página');
  await pg.close();
}
