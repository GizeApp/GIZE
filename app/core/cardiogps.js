// Salidas de Cardio «A pie» / «En bici» con GPS: el motor de cuentas. Puro: sin imports, sin
// pantalla, sin GPS y sin reloj (la hora entra siempre por parámetro), así se prueba solo
// (tests/cardio-motor.test.mjs). El GPS está en ui/gps.js y la pantalla en screens/cardio.js.
//
// Qué hace:
//  - Filtra el ruido del GPS (createFilter / filterPoints): poca precisión, puntos repetidos,
//    el temblor del GPS estando quieto, saltos imposibles y cortes de señal. El mismo filtro
//    corre en vivo (addPoint) y al terminar (summarize): la distancia en vivo y la guardada
//    coinciden.
//  - Tiempo en movimiento y pausa automática (movingIntervals): lo parado no suma.
//  - A pie, la app sola separa la salida en tramos caminando / trotando / corriendo según la
//    velocidad media de 30 s en movimiento (menos de 6,5 km/h caminando, hasta 9 trotando, más
//    corriendo), con histéresis y tramos de al menos 1 min (segmentize). En bici, un solo tipo.
//  - Calorías por tramo: MET según la velocidad × peso × tiempo en movimiento (kcalFor).
//  - Parciales por km (cada 5 km en bici), el resumen para guardar (summarize: sin
//    coordenadas) y el recorrido compacto para el mapa (trackOf: polyline de 3 dimensiones,
//    latitud, longitud y segundos desde el inicio).
//  - Números para pintar el recorrido según la velocidad (trackSpeeds, colorDomain, speedT) y
//    textos con coma («7,18 km», «6:15 /km», «20 min caminando · 15 trotando · 10 corriendo»).
//
// Nombres nuevos a propósito: lo de la versión anterior con GPS (state.cardio, gize_cardio_run,
// cardio_sessions…) lo sigue borrando la app en los celulares viejos.

// Número con d decimales y coma, como dec() de utils.js: 7,18.
const dec = (n, d = 1) => (Number(n) || 0).toFixed(d).replace(".", ",");
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---- Modos y constantes ----
// maxKmh: más rápido que esto entre puntos es un salto del GPS, no la persona. holeKmh: lo más
// rápido que se cree a través de un hueco sin señal (en línea recta; más, fue en otra cosa).
// stopKmh: más lento que esto es estar parado (pausa automática).
// winS: ventana para la velocidad del momento y la máxima. stillS: ventana para darse cuenta de
// si se está moviendo o es el GPS que tiembla. smoothS: promedio de los puntos cuando el GPS
// zigzaguea. splitM: largo de los parciales. distanceFilterM: lo que se le pide al GPS nativo.
// autoPauseS: sin puntos que sumen durante este tiempo, en vivo se muestra «Pausa automática».
// spanKmh: diferencia mínima entre el color más frío y el más intenso del recorrido.
export const MODES = {
  pie:  { label: "A pie",   maxKmh: 25, holeKmh: 12, stopKmh: 1.8, winS: 10, stillS: 20, smoothS: 5, splitM: 1000, distanceFilterM: 2, autoPauseS: 10, spanKmh: 3 },
  bici: { label: "En bici", maxKmh: 70, holeKmh: 40, stopKmh: 4,   winS: 6,  stillS: 10, smoothS: 3, splitM: 5000, distanceFilterM: 4, autoPauseS: 6,  spanKmh: 8 },
};
export const modeOk = m => m === "pie" || m === "bici";
const cfgOf = m => MODES[modeOk(m) ? m : "pie"];

// Tipos de tramo (el orden es el de los textos). color: qué color de la gama de GIZE le toca.
export const CLASSES = {
  caminar: { label: "Caminando", gerund: "caminando", color: "r1" },
  trotar:  { label: "Trotando",  gerund: "trotando",  color: "r2" },
  correr:  { label: "Corriendo", gerund: "corriendo", color: "r3" },
  bici:    { label: "En bici",   gerund: "en bici",   color: "r2" },
};
export const WALK_JOG = 6.5, JOG_RUN = 9, HYST = 0.4;   // km/h (decidido por el dueño) ± histéresis
export const MAX_ACC_M = 30, FIRST_ACC_M = 20, FIRST_WAIT_S = 20, MIN_MOVE_M = 3;
export const GAP_S = 120, CLASS_WIN_S = 30, MIN_SEG_S = 60;
export const DEFAULT_KG = 70, MIN_SAVE_M = 100, MIN_SAVE_S = 60;
export const MAX_POINTS = 30000, TRACK_TOL_M = 4, MAX_TRACK_LEN = 200000;
// Hueco: más de HOLE_S sin ningún dato y al volver está a HOLE_M o más, a una velocidad creíble
// y con no más de HOLE_MAX_S sin datos. Lo típico: en el navegador del iPhone, al bloquear la
// pantalla o pasar a otra app el GPS se corta.
export const HOLE_S = 10, HOLE_M = 15, HOLE_MAX_S = 1800;
export const MAX_SEGMENTS = 200, MAX_SPLITS = 1000, JITTER_M = 1;

// Distancia en metros entre dos puntos {lat, lon} (fórmula de haversine).
export function haversine(a, b){
  const R = 6371008.8, rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// ---- Puntos ----
// Punto del GPS: { lat, lon, t (ms), acc (m, error al 68 %), spd (m/s del GPS o null),
// seg (sube en cada pausa manual: 0, 1, 2…) }.
// Hora de los puntos: la del GPS, así un punto que llega tarde (en iPhone, con la app en segundo
// plano, pueden llegar varios minutos juntos) queda en su lugar y suma lo que caminó. Si el reloj
// del celular está corrido respecto del GPS (más de 30 s), se le suma esa diferencia: así todo
// queda en la hora del celular, la misma del inicio y de las pausas. La diferencia es la menor
// (reloj − GPS) de la salida: la demora en llegar solo la agranda, nunca la achica.
// createClock() → time(t del GPS, now, inicio) → hora del punto (ms). Si no tiene sentido (sin
// hora, del futuro o de antes de empezar) usa now y vuelve a aprender la diferencia.
export const CLOCK_MS = 30000;
export function createClock(){
  let off = null, odd = 0;
  return (t, now, start) => {
    t = +t;
    if (!Number.isFinite(t) || !Number.isFinite(now)) return now;
    const d = now - t;
    // Mucho más «adelantado» que todos los anteriores: un punto con la hora mal. Si se repite 10
    // veces seguidas es el reloj del celular, que se corrigió: se toma la diferencia nueva.
    if (off !== null && d < off - CLOCK_MS && ++odd < 10) return now;
    odd = 0;
    const o = off === null ? d : Math.min(off, d);
    const x = t + (Math.abs(o) > CLOCK_MS ? o : 0);
    if (x > now + CLOCK_MS || (Number.isFinite(start) && x < start)){ off = null; return now; }
    off = o;
    return x;
  };
}

// Empaquetado para guardar en el celular (compacto): [ms desde el inicio, lat·1e6, lon·1e6,
// acc (m), velocidad (cm/s, -1 si no hay), seg].
const intOr = (v, d) => Number.isFinite(v) ? Math.round(v) : d;
export function packPoint(p, start){
  p = p || {};
  const spd = p.spd == null || !(+p.spd >= 0) ? -1 : Math.round(+p.spd * 100);
  return [intOr(+p.t - start, 0), intOr(+p.lat * 1e6, 0), intOr(+p.lon * 1e6, 0), p.acc == null ? -1 : intOr(+p.acc, -1), spd, intOr(+p.seg, 0)];
}
export function unpackPoint(a, start){
  return { t: start + a[0], lat: a[1] / 1e6, lon: a[2] / 1e6, acc: a[3] < 0 ? null : a[3], spd: a[4] < 0 ? null : a[4] / 100, seg: a[5] | 0 };
}

// Punto de entrada → punto limpio, o null si no sirve (coordenadas rotas o fuera del mundo).
function normPoint(pt){
  if (!pt) return null;
  const lat = +pt.lat, lon = +pt.lon, t = +pt.t;
  if (pt.lat == null || pt.lon == null || pt.t == null) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(t)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) return null;
  const acc = pt.acc == null || pt.acc === "" ? NaN : +pt.acc;
  const spd = pt.spd == null || !(+pt.spd >= 0) ? null : +pt.spd;
  return { lat, lon, t, acc, spd, seg: Number.isFinite(+pt.seg) ? +pt.seg : 0 };
}

// ---- Filtro del GPS ----
// Un solo algoritmo, punto por punto: lo usa el tracker en vivo y summarize al final.
// createFilter(mode).push(punto) → { why, d, brk, p, keep }
//   why: "bad" (coordenadas rotas) | "acc" (poca precisión) | "dup" (hora repetida o vieja) |
//        "first" (primer punto de una pieza) | "gap" (vuelve la señal después de un corte) |
//        "noise" (temblor del GPS o parado) | "jump" (velocidad imposible) |
//        "anchor" (después de 3 saltos coherentes, el punto nuevo pasa a ser la referencia) |
//        "ok" (suma distancia).
//   d: metros que sumó. brk: empieza una pieza nueva del dibujo (no se une con la anterior).
//   p: el punto aceptado { lat, lon, t, acc, spd, seg, cd (distancia acumulada), brk, vr (km/h
//   con la que se confirmó que se movía), hole (el primero después de un hueco) } o null. keep: vale la pena guardarlo (todo menos
//   bad, dup y precisión peor que 30 m): al volver a pasar los guardados por el filtro sale
//   exactamente lo mismo.
//
// Parado vs. moviéndose: el GPS tiembla varios metros aunque estés quieto. Un punto suma solo
// si está a más de max(3 m, 0,4 × precisión) del último que sumó Y la velocidad «robusta» de
// los últimos stillS segundos (distancia entre el promedio de la primera mitad de la ventana y el
// de la segunda) es de alguien que se mueve (≥ stopKmh). El temblor promediado casi no se
// mueve; una caminata sí. Mientras tanto el último punto que sumó queda de referencia, así que
// lo caminado se suma entero cuando se confirma (nada se pierde, solo llega unos segundos
// tarde). Al empezar cada pieza se espera media ventana antes de sumar, por lo mismo.
// Velocidad imposible: se compara con dónde estaba hace un momento (promedio de la mitad nueva
// de la ventana), no con un solo punto.
// Hueco (HOLE_S sin datos y al volver más lejos, moviéndose; p. ej. la pantalla bloqueada en el
// navegador): la distancia en línea recta se suma (lo caminado existió; la recta se queda un
// poco corta si dobló) y ese rato cuenta en movimiento, pero se espera un dato preciso (≤ 20 m,
// o 20 s) antes de volver a sumar: el primero al volver suele venir corrido. Ese punto sale con
// hole: el dibujo no cruza el hueco con una línea de color (livePath y simplifyTrack lo cortan
// ahí; ui/ruta.js lo une con una línea gris de puntos). f.hole: hay un hueco sin punto aceptado
// todavía (el mini mapa no une «estás acá» con el recorrido). Un corte más largo que
// HOLE_MAX_S o a una velocidad que no se cree (más de holeKmh): como antes, pieza nueva sin
// sumar (gapS) si pasaron más de 2 min.
export function createFilter(mode){
  const cfg = cfgOf(mode), W = cfg.stillS * 1000;
  // last: último punto aceptado (referencia de la distancia). prev: último punto válido que no
  // fue un salto. win: puntos válidos de los últimos stillS s. jumps: saltos seguidos.
  // t0: inicio de la pieza. wait: desde cuándo se espera un primer punto preciso. lastT: hora
  // del último punto guardado (para descartar repetidos).
  let last = null, prev = null, win = [], jumps = [], t0 = 0, wait = null, lastT = -Infinity;
  const f = { dist: 0, gapS: 0, n: 0, last: null, hole: null, push };
  const out = (why, keep) => ({ why, d: 0, brk: false, p: null, keep });
  function begin(p, why){
    p.cd = f.dist; p.brk = true; p.vr = 0;
    last = prev = f.last = p; win = [p]; jumps = []; t0 = p.t; wait = null; f.hole = null; f.n++;
    lastT = p.t;
    return { why, d: 0, brk: true, p, keep: true };
  }
  function push(pt){
    const p = normPoint(pt);
    if (!p) return out("bad", false);
    if (!(p.acc <= MAX_ACC_M)) return out("acc", false);
    if (p.t <= lastT) return out("dup", false);
    // Primer punto de la pieza (inicio, o después de una pausa manual): se pide buena precisión,
    // salvo que pasen 20 s sin conseguirla.
    if (!last || p.seg !== last.seg){
      if (!wait || wait.seg !== p.seg) wait = { t: p.t, seg: p.seg };
      if (p.acc > FIRST_ACC_M && p.t - wait.t < FIRST_WAIT_S * 1000){ lastT = p.t; return out("acc", true); }
      return begin(p, "first");
    }
    // Más de 2 min sin puntos válidos: si en ese rato se movió, la señal se cortó (app cerrada,
    // túnel…): pieza nueva, sin sumar el tramo que no se vio. Si está casi en el mismo lugar,
    // estuvo parado (el GPS nativo no manda puntos si no te movés): sigue igual.
    // Hueco: lastT es el último dato guardado (así al recuperar la salida da lo mismo).
    const silence = p.t - prev.t;
    if (!f.hole && (p.t - lastT > HOLE_S * 1000 || silence > GAP_S * 1000)){
      const m = haversine(last, p), dt = (p.t - last.t) / 1000, kmh = m / dt * 3.6;
      if (m >= HOLE_M && kmh >= cfg.stopKmh && kmh <= cfg.holeKmh && dt <= HOLE_MAX_S){ f.hole = { t: p.t }; win = []; }
      else if (silence > GAP_S * 1000){
        if (kmh >= cfg.stopKmh){ f.gapS += silence / 1000; return begin(p, "gap"); }
        win = [];
      }
    }
    // Mientras no llegue un dato preciso después del hueco, los flojos no suman (se guardan igual).
    if (f.hole && p.acc > FIRST_ACC_M && p.t - f.hole.t < FIRST_WAIT_S * 1000){ lastT = p.t; return out("acc", true); }
    // Salto: la velocidad desde donde estaba hace un momento (promedio de la mitad nueva de la
    // ventana) es imposible. Si se repite 3 veces seguidas y esos puntos son coherentes entre
    // sí, la referencia era la mala: el último pasa a ser la nueva, sin sumar el salto.
    const ref = recentRef(win) || prev, vRef = haversine(ref, p) / Math.max(1, (p.t - ref.t) / 1000) * 3.6;
    if (vRef > cfg.maxKmh){
      jumps.push(p);
      if (jumps.length > 3) jumps.shift();
      if (jumps.length === 3 && coherent(jumps, cfg.maxKmh)){
        const js = jumps, r = begin(p, "anchor");
        win = js.slice(); t0 = js[0].t;
        return r;
      }
      lastT = p.t;
      return out("jump", true);
    }
    jumps = [];
    const before = prev;
    win.push(p);
    while (win.length && win[0].t < p.t - W) win.shift();
    prev = p;
    lastT = p.t;
    const q = smoothed(win, p, cfg.smoothS * 1000), d = haversine(last, q);
    if (d < Math.max(MIN_MOVE_M, 0.4 * p.acc)) return out("noise", true);
    if (p.t - t0 < W / 2) return out("noise", true);
    const vr = robustKmh(win, W, before);
    if (vr < cfg.stopKmh) return out("noise", true);
    f.dist += d; q.cd = f.dist; q.brk = false; q.vr = Math.max(vr, vRef);
    if (f.hole){ q.hole = true; f.hole = null; }
    last = f.last = q; f.n++;
    return { why: "ok", d, brk: false, p: q, keep: true };
  }
  return f;
}
// Si el GPS zigzaguea (cada punto se aparta JITTER_M o más, en la mediana, de la línea entre el
// anterior y el siguiente), el punto aceptado va en el promedio de los últimos smoothS segundos:
// el zigzag no infla la distancia. Si viene prolijo (lo normal en un celular) no se toca, así
// las esquinas quedan en su lugar.
function jitterM(win){
  const dev = [];
  for (let i = Math.max(1, win.length - 12); i < win.length - 1; i++){
    const a = win[i - 1], b = win[i], c = win[i + 1], dt = c.t - a.t;
    const u = dt > 0 ? (b.t - a.t) / dt : 0.5;
    dev.push(haversine(b, { lat: a.lat + (c.lat - a.lat) * u, lon: a.lon + (c.lon - a.lon) * u }));
  }
  if (dev.length < 3) return 0;
  dev.sort((x, y) => x - y);
  return dev[dev.length >> 1];
}
function smoothed(win, p, ms){
  if (jitterM(win) < JITTER_M) return Object.assign({}, p);
  let la = 0, lo = 0, k = 0;
  for (const q of win) if (q.t >= p.t - ms){ la += q.lat; lo += q.lon; k++; }
  return Object.assign({}, p, k ? { lat: la / k, lon: lo / k } : {});
}
// Promedio (lugar y hora) de la mitad más nueva de la ventana.
function recentRef(win){
  const n = win.length;
  if (!n) return null;
  const mid = (win[0].t + win[n - 1].t) / 2;
  let la = 0, lo = 0, t = 0, k = 0;
  for (const q of win) if (q.t >= mid){ la += q.lat; lo += q.lon; t += q.t; k++; }
  return { lat: la / k, lon: lo / k, t: t / k };
}
// Velocidad robusta en km/h: entre el promedio de la mitad vieja y el de la mitad nueva de la
// ventana. Si hay pocos puntos (el GPS nativo manda pocos), entre las puntas.
function robustKmh(win, W, before){
  const n = win.length, a = win[0], b = win[n - 1];
  if (n >= 2 && b.t - a.t >= W / 2){
    const mid = (a.t + b.t) / 2, o = [0, 0, 0, 0], w = [0, 0, 0, 0];
    for (const q of win){ const s = q.t < mid ? o : w; s[0] += q.lat; s[1] += q.lon; s[2] += q.t; s[3]++; }
    const dt = (w[2] / w[3] - o[2] / o[3]) / 1000;
    return dt > 0 ? haversine({ lat: o[0] / o[3], lon: o[1] / o[3] }, { lat: w[0] / w[3], lon: w[1] / w[3] }) / dt * 3.6 : 0;
  }
  const r = n >= 2 ? a : before;
  if (!r || !(b.t > r.t)) return 0;
  return haversine(r, b) / ((b.t - r.t) / 1000) * 3.6;
}
function coherent(js, maxKmh){
  for (let i = 1; i < js.length; i++){
    const dt = Math.max(1, (js[i].t - js[i - 1].t) / 1000);
    if (haversine(js[i - 1], js[i]) / dt * 3.6 > maxKmh) return false;
  }
  return true;
}

// Todos los puntos de una salida por el filtro, en orden de hora.
// → { pts: [{ lat, lon, t, acc, spd, seg, cd, brk, vr }], dist (m), gapS (s sin señal) }
export function filterPoints(raw, mode){
  const f = createFilter(mode), pts = [];
  let list = Array.isArray(raw) ? raw : [];
  for (let i = 1; i < list.length; i++) if (list[i] && list[i - 1] && +list[i].t < +list[i - 1].t){
    list = list.filter(Boolean).slice().sort((a, b) => (+a.t || 0) - (+b.t || 0));
    break;
  }
  for (const q of list){ const r = f.push(q); if (r.p) pts.push(r.p); }
  return { pts, dist: f.dist, gapS: f.gapS };
}

// ---- Movimiento y velocidad ----
// Segundos en movimiento del intervalo a → b (b, el punto aceptado que sigue a «a»). Rápido
// como para moverse: todo el intervalo. Más lento (había estado parado y arrancó): solo lo que
// tardó en hacer esa distancia a la velocidad con la que se confirmó que se movía.
function movingS(a, b, cfg){
  if (!a || !b || b.brk) return 0;
  const dt = (b.t - a.t) / 1000, dd = b.cd - a.cd;
  if (!(dt > 0) || !(dd > 0)) return 0;
  if (dd / dt * 3.6 >= cfg.stopKmh) return dt;
  return b.vr >= cfg.stopKmh ? Math.min(dt, dd / (b.vr / 3.6)) : 0;
}
// Auto-pausa: segundos en movimiento de cada intervalo (i − 1 → i); mv[0] = 0. Estar parado en
// un semáforo no suma.
export function movingIntervals(pts, mode){
  const cfg = cfgOf(mode), mv = new Array(pts.length).fill(0);
  for (let i = 1; i < pts.length; i++) mv[i] = movingS(pts[i - 1], pts[i], cfg);
  return mv;
}

// Velocidad del momento (km/h) en cada punto aceptado: con la velocidad del GPS (Doppler) si la
// traen al menos el 70 % de los puntos de la pieza (mediana de las últimas 3); si no, por
// distancia / tiempo de los últimos winS segundos. 0 al empezar cada pieza.
export function speedSeries(pts, mode){
  const cfg = cfgOf(mode), n = pts.length, out = new Array(n).fill(0);
  let a = 0;
  while (a < n){
    let b = a + 1;
    while (b < n && !pts[b].brk) b++;
    let withSpd = 0;
    for (let i = a; i < b; i++) if (pts[i].spd != null) withSpd++;
    const doppler = withSpd >= 0.7 * (b - a);
    let j = a;
    for (let i = a + 1; i < b; i++){
      let v;
      if (doppler){
        const s = [];
        for (let k = i; k >= a && s.length < 3; k--) if (pts[k].spd != null) s.push(pts[k].spd * 3.6);
        s.sort((x, y) => x - y);
        v = s.length ? s[s.length >> 1] : 0;
      } else {
        while (j < i - 1 && pts[i].t - pts[j].t > cfg.winS * 1000) j++;
        const dt = (pts[i].t - pts[j].t) / 1000;
        v = dt > 0 ? (pts[i].cd - pts[j].cd) / dt * 3.6 : 0;
      }
      out[i] = clamp(v, 0, cfg.maxKmh);
    }
    a = b;
  }
  return out;
}

// Tipo de tramo según la velocidad media (km/h). Con prev (el tipo que venía) hay histéresis de
// ±0,4 km/h: para pasar de caminar a trotar hace falta 6,9; para volver, menos de 6,1.
export function classifySpeed(kmh, mode, prev){
  if (mode === "bici") return "bici";
  const v = Number(kmh) || 0;
  if (prev === "caminar") return v >= JOG_RUN + HYST ? "correr" : v >= WALK_JOG + HYST ? "trotar" : "caminar";
  if (prev === "trotar") return v >= JOG_RUN + HYST ? "correr" : v < WALK_JOG - HYST ? "caminar" : "trotar";
  if (prev === "correr") return v < WALK_JOG - HYST ? "caminar" : v < JOG_RUN - HYST ? "trotar" : "correr";
  return v < WALK_JOG ? "caminar" : v < JOG_RUN ? "trotar" : "correr";
}

// Velocidad media de 30 s en movimiento centrada en cada intervalo (al final se conoce lo que
// viene después: los cambios de tramo quedan en su lugar). list: [{ m (s), d (m) }].
function windowKmh(list, half){
  const n = list.length, M = new Float64Array(n + 1), D = new Float64Array(n + 1), out = new Array(n);
  for (let i = 0; i < n; i++){ M[i + 1] = M[i] + list[i].m; D[i + 1] = D[i] + list[i].d; }
  const tot = M[n], pa = { i: 0 }, pb = { i: 0 };
  const distAt = (x, p) => {
    while (p.i < n - 1 && M[p.i + 1] < x) p.i++;
    const it = list[p.i];
    return D[p.i] + (it.m > 0 ? it.d * clamp((x - M[p.i]) / it.m, 0, 1) : 0);
  };
  for (let i = 0; i < n; i++){
    const c = (M[i] + M[i + 1]) / 2;
    let a = c - half, b = c + half;
    if (a < 0){ b = Math.min(tot, b - a); a = 0; }
    if (b > tot){ a = Math.max(0, a - (b - tot)); b = tot; }
    out[i] = b > a ? (distAt(b, pb) - distAt(a, pa)) / (b - a) * 3.6 : (list[i].m > 0 ? list[i].d / list[i].m * 3.6 : 0);
  }
  return out;
}

// Tramos: [{ c, i0, i1, t0, t1, movingS, distM, avgKmh }] (i0/i1: índices en pts; t0/t1: ms).
// 1) Tipo de cada intervalo en movimiento (velocidad media de 30 s, con histéresis; un hueco
//    sin señal, el del anterior).
// 2) Se juntan los seguidos del mismo tipo (lo parado y los cortes no cortan el tramo).
// 3) Duración mínima: mientras haya un tramo de menos de 1 min (y más de uno), el más corto se
//    une al vecino de velocidad más parecida (si empata, al anterior) y toma su tipo. Un pique
//    de 30 s en una caminata no crea «corriendo». (Lo mismo si pasan de MAX_SEGMENTS.)
export function segmentize(pts, mode, mv){
  mv = mv || movingIntervals(pts, mode);
  const list = [];
  for (let k = 1; k < pts.length; k++) if (mv[k] > 0) list.push({ k, m: mv[k], d: Math.max(0, pts[k].cd - pts[k - 1].cd), hole: !!pts[k].hole });
  if (!list.length) return [];
  // La velocidad de 30 s, sin los huecos sin señal (su velocidad es en línea recta: no dice si
  // trotaba o caminaba, ni tiene que teñir lo de al lado).
  const real = list.filter(it => !it.hole), vr = real.length ? windowKmh(real, CLASS_WIN_S / 2) : [];
  const v = []; let q = 0;
  for (const it of list) v.push(it.hole ? 0 : vr[q++]);
  let segs = [], prev = null;
  list.forEach((it, j) => {
    // Un hueco sin señal sigue con el tipo que venía (si es lo primero, caminando o en bici).
    const c = it.hole && prev ? prev : classifySpeed(v[j], mode, prev), t1 = pts[it.k].t, t0 = t1 - it.m * 1000;
    prev = c;
    const s = segs[segs.length - 1];
    if (s && s.c === c){ s.i1 = it.k; s.t1 = t1; s.movingS += it.m; s.distM += it.d; }
    else segs.push({ c, i0: it.k - 1, i1: it.k, t0, t1, movingS: it.m, distM: it.d });
  });
  const avg = s => s.movingS > 0 ? s.distM / s.movingS * 3.6 : 0;
  const join = (a, b, c) => ({ c, i0: Math.min(a.i0, b.i0), i1: Math.max(a.i1, b.i1), t0: Math.min(a.t0, b.t0), t1: Math.max(a.t1, b.t1), movingS: a.movingS + b.movingS, distM: a.distM + b.distM });
  const coalesce = () => {
    const out = [];
    for (const s of segs){ const l = out[out.length - 1]; if (l && l.c === s.c) out[out.length - 1] = join(l, s, l.c); else out.push(s); }
    segs = out;
  };
  while (segs.length > 1){
    let w = -1;
    for (let i = 0; i < segs.length; i++){
      if (segs[i].movingS >= MIN_SEG_S && segs.length <= MAX_SEGMENTS) continue;
      if (w < 0 || segs[i].movingS < segs[w].movingS) w = i;
    }
    if (w < 0) break;
    const s = segs[w], a = segs[w - 1], b = segs[w + 1];
    const to = !a ? w + 1 : !b ? w - 1 : (Math.abs(avg(b) - avg(s)) < Math.abs(avg(a) - avg(s)) ? w + 1 : w - 1);
    segs.splice(Math.min(w, to), 2, join(segs[to], s, segs[to].c));
    coalesce();
  }
  segs.forEach(s => { s.avgKmh = avg(s); });
  return segs;
}

// Velocidad máxima: la mejor media de al menos winS segundos en movimiento, con la distancia en
// línea recta entre las puntas de la ventana (sin pasar la del recorrido): un punto adelantado o
// un zigzag del GPS no la inflan. Sin los huecos sin señal. Con el tope del modo.
function maxKmhOf(pts, mv, cfg){
  const n = pts.length, M = new Float64Array(n), D = new Float64Array(n);
  // Los huecos sin señal no cuentan (su velocidad es un promedio en línea recta).
  for (let k = 1; k < n; k++){ const h = pts[k].hole; M[k] = M[k - 1] + (h ? 0 : mv[k] || 0); D[k] = D[k - 1] + (!h && mv[k] > 0 ? Math.max(0, pts[k].cd - pts[k - 1].cd) : 0); }
  let best = 0, j = 0;
  for (let i = 1; i < n; i++){
    while (j + 1 < i && M[i] - M[j + 1] >= cfg.winS) j++;
    const dm = M[i] - M[j];
    if (dm >= cfg.winS){ const v = Math.min(D[i] - D[j], haversine(pts[j], pts[i])) / dm * 3.6; if (v > best) best = v; }
  }
  return Math.min(best, cfg.maxKmh);
}

// ---- MET y calorías ----
// Convención MET bruto (1 MET = 1 kcal·kg⁻¹·h⁻¹), como la versión anterior. Valores por
// velocidad de: Ainsworth BE et al., «2011 Compendium of Physical Activities: a second update of
// codes and MET values», Med Sci Sports Exerc 43(8):1575–1581 (códigos entre paréntesis), y la
// actualización Herrmann SD et al., «2024 Adult Compendium of Physical Activities», J Sport
// Health Sci 13(1):6–12 (pacompendium.com), con valores similares. Entre anclas se interpola;
// fuera de la tabla se usa la punta.
// Caminar (17151 <3,2 km/h 2,0 · 17152 3,2 km/h 2,8 · 17170 4,0 km/h 3,0 · 17190 4,5–5,1 km/h 3,5 ·
// 17200 5,6 km/h 4,3 · 17220 6,4 km/h 5,0 · 17230 7,2 km/h 7,0 · 17231 8,0 km/h 8,3)
const MET_WALK = [[2.0, 2.0], [3.2, 2.8], [4.0, 3.0], [4.8, 3.5], [5.6, 4.3], [6.4, 5.0], [7.2, 7.0], [8.0, 8.3]];
// Trotar y correr, misma curva (12029 6,4 km/h 6,0 · 12030 8,0 8,3 · 12040 8,4 9,0 · 12050 9,7 9,8 ·
// 12060 10,8 10,5 · 12070 11,3 11,0 · 12080 12,1 11,5 · 12090 12,9 11,8 · 12100 13,8 12,3 ·
// 12110 14,5 12,8 · 12120 16,1 14,5 · 12130 17,7 16,0 · 12132 19,3 19,0 · 12134 20,9 19,8 · 12135 22,5 23,0)
const MET_RUN = [[6.4, 6.0], [8.0, 8.3], [8.4, 9.0], [9.7, 9.8], [10.8, 10.5], [11.3, 11.0], [12.1, 11.5],
  [12.9, 11.8], [13.8, 12.3], [14.5, 12.8], [16.1, 14.5], [17.7, 16.0], [19.3, 19.0], [20.9, 19.8], [22.5, 23.0]];
// Bici: puntos medios de los rangos (01009 8,9 km/h 3,5 · 01010 <16 km/h 4,0 · 01020 16,1–19,2 6,8 ·
// 01030 19,3–22,4 8,0 · 01040 22,5–25,6 10,0 · 01050 25,7–30,6 12,0 · 01060 >32,2 15,8)
const MET_BIKE = [[8.9, 3.5], [13.0, 4.0], [17.7, 6.8], [20.9, 8.0], [24.1, 10.0], [28.2, 12.0], [32.2, 15.8]];

export function metFor(cls, kmh){
  const tab = cls === "bici" ? MET_BIKE : cls === "caminar" ? MET_WALK : MET_RUN;
  const x = Math.max(0, Number(kmh) || 0);
  if (x <= tab[0][0]) return tab[0][1];
  for (let i = 1; i < tab.length; i++) if (x <= tab[i][0]){
    const [x0, y0] = tab[i - 1], [x1, y1] = tab[i];
    return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
  }
  return tab[tab.length - 1][1];
}
// Peso válido (lo mismo que acepta la base: 20 a 400 kg) o null.
export const validKg = kg => { const w = Number(kg); return w >= 20 && w <= 400 ? w : null; };
// kcal de un tramo = MET (tipo y velocidad media) × peso × horas en movimiento. Sin peso: 70 kg.
export function kcalFor(seg, kg){
  const w = validKg(kg) || DEFAULT_KG;
  return metFor(seg.c, seg.avgKmh) * w * Math.max(0, Number(seg.movingS) || 0) / 3600;
}

// Peso corporal para las calorías: el último registrado (state.weights), o null si no hay.
export function lastWeight(weights){
  const ok = (weights || []).filter(w => w && Number(w.kg) > 0 && w.date);
  if (!ok.length) return null;
  ok.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  return Number(ok[ok.length - 1].kg);
}

// ---- Parciales ----
// [[m, s], …]: segundos en movimiento para cada splitM metros (1 km a pie, 5 km en bici),
// interpolando adentro del intervalo; al final, el pedazo que sobra si tiene 50 m o más.
export function splits(pts, mv, splitM){
  const out = [];
  let cum = 0, tm = 0, lastT = 0, next = splitM;
  if (!(splitM > 0)) return out;
  for (let k = 1; k < pts.length; k++){
    const m = mv[k] || 0;
    if (!(m > 0)) continue;
    const d = Math.max(0, pts[k].cd - pts[k - 1].cd);
    while (d > 0 && cum + d >= next && out.length < MAX_SPLITS){
      const at = tm + (next - cum) / d * m;
      out.push([splitM, Math.round(at - lastT)]);
      lastT = at; next += splitM;
    }
    cum += d; tm += m;
  }
  const rest = cum - (next - splitM);
  if (rest >= 50 && out.length < MAX_SPLITS) out.push([Math.round(rest), Math.round(tm - lastT)]);
  return out;
}

// ---- Una salida ----
// run = { v:1, id, mode, start, status: "running" | "paused" | "ended", pauses: [[desde, hasta]],
//   pausedAt, ended, seg, pts: [empaquetados (packPoint)], live: { dist, movingMs, kmh, cls,
//   metS, lastT, rawT, rawSeg, acc } }
// La duración es por reloj, menos las pausas manuales. El filtro en vivo (run._f) no se guarda
// (no es enumerable): si falta, se arma de nuevo pasando los puntos guardados.
const emptyLive = () => ({ dist: 0, movingMs: 0, kmh: 0, cls: null, metS: 0, lastT: null, rawT: null, rawSeg: null, acc: null });
export function newRun(mode, now, id){
  return { v: 1, id: id || null, mode: modeOk(mode) ? mode : "pie", start: now, status: "running", pauses: [], pausedAt: null, ended: null, seg: 0, pts: [], live: emptyLive() };
}
export function elapsedMs(run, now){
  if (!run) return 0;
  const end = run.ended || now;
  let ms = end - run.start;
  for (const p of run.pauses || []) ms -= Math.max(0, p[1] - p[0]);
  if (run.pausedAt != null && !run.ended) ms -= Math.max(0, end - run.pausedAt);
  return Math.max(0, ms);
}
export function pauseRun(run, now){
  if (!run || run.status !== "running") return;
  run.status = "paused"; run.pausedAt = now;
}
// Al seguir sube seg: el primer punto arranca una pieza nueva (lo que se movió en pausa no suma).
export function resumeRun(run, now){
  if (!run || run.status !== "paused") return;
  run.pauses.push([run.pausedAt, now]);
  run.pausedAt = null; run.status = "running"; run.seg++;
}
export function endRun(run, now){
  if (!run || run.status === "ended") return;
  if (run.status === "paused"){ run.pauses.push([run.pausedAt, now]); run.pausedAt = null; }
  run.status = "ended"; run.ended = now;
}

// Estado en vivo (filtro + ventana de 30 s para el tipo de tramo + los puntos aceptados para el
// mini mapa). Si no está (salida recién recuperada del celular), se arma de nuevo con los
// puntos guardados.
function liveState(run){
  if (run._f) return run._f;
  const s = { f: createFilter(run.mode), q: [], qm: 0, qd: 0, path: [], pathLast: null, pathN: 0, stride: 1 };
  Object.defineProperty(run, "_f", { value: s, enumerable: false, configurable: true, writable: true });
  run.live = emptyLive();
  for (const a of run.pts || []) feed(run, s, unpackPoint(a, run.start));
  return s;
}
function feed(run, s, pt){
  const cfg = cfgOf(run.mode), L = run.live, before = s.f.last;
  const r = s.f.push(pt);
  if (pt && Number.isFinite(pt.acc) && r.why !== "bad") L.acc = pt.acc;
  if (r.keep){ L.rawT = pt.t; L.rawSeg = pt.seg; }
  if (r.p){
    L.lastT = r.p.t; L.dist = s.f.dist;
    // Para el mini mapa: uno de cada «stride» (siempre el que empieza una pieza). Si se pasa del
    // tope, se saca uno de cada dos y desde ahí se guarda la mitad: la densidad queda pareja.
    // Después de un hueco, pieza nueva (hole): el mini mapa no lo cruza con una línea de color.
    const q = { lat: r.p.lat, lon: r.p.lon, t: r.p.t, brk: !!r.p.brk || !!r.p.hole };
    s.pathLast = q;
    if (q.brk || ++s.pathN % s.stride === 0){
      s.path.push(q);
      if (s.path.length > LIVE_PATH_MAX){ s.path = thinPath(s.path); s.stride *= 2; }
    }
    const m = movingS(before, r.p, cfg);
    if (m > 0 && r.p.hole){
      // Hueco sin señal: suma tiempo y calorías al ritmo del hueco (en línea recta) con el tipo
      // que venía; no cambia el ritmo del momento ni el tipo.
      const kmh = (r.p.cd - before.cd) / m * 3.6, c = L.cls || classifySpeed(kmh, run.mode, null);
      L.movingMs += m * 1000;
      L.metS += metFor(c, kmh) * m;
    } else if (m > 0){
      const d = r.p.cd - before.cd;
      s.q.push({ m, d }); s.qm += m; s.qd += d;
      while (s.q.length > 1 && s.qm - s.q[0].m >= CLASS_WIN_S){ const o = s.q.shift(); s.qm -= o.m; s.qd -= o.d; }
      L.kmh = s.qm > 0 ? Math.max(0, s.qd) / s.qm * 3.6 : 0;
      L.cls = classifySpeed(L.kmh, run.mode, L.cls);
      L.movingMs += m * 1000;
      L.metS += metFor(L.cls, L.kmh) * m;
    }
  }
  return r;
}
// Suma un punto del GPS a la salida en curso y lo guarda (empaquetado) si sirve. Devuelve qué
// pasó con él (why del filtro, o "paused" si la salida no está corriendo).
export function addPoint(run, pt){
  if (!run || run.status !== "running" || !pt) return "paused";
  const lastPause = run.pauses && run.pauses[run.pauses.length - 1];
  if (lastPause && +pt.t < lastPause[1]) return "paused"; // llegó tarde, de antes de seguir
  const s = liveState(run);
  // Se usa el punto tal cual se guarda (redondeado): al recuperar la salida da lo mismo.
  const a = packPoint(Object.assign({}, pt, { seg: run.seg }), run.start);
  const ok = normPoint(pt) !== null;
  const r = feed(run, s, ok ? unpackPoint(a, run.start) : pt);
  if (r.keep){
    run.pts.push(a);
    if (run.pts.length > MAX_POINTS) run.pts = thinPoints(run.pts);
  }
  return r.why;
}
export const isAccepted = why => why === "first" || why === "gap" || why === "anchor" || why === "ok";
// Lo medido hasta ahora para el mini mapa en vivo, sin volver a pasar todos los puntos por el
// filtro (el estado en vivo los va juntando): [[{lat, lon, t (s desde el inicio)}]], por pieza,
// terminando en el último punto aceptado (dónde está ahora). Con tope de LIVE_PATH_MAX puntos
// repartidos parejo (ver feed): cada redibujo cuesta lo mismo a la hora que a las 8 h.
export const LIVE_PATH_MAX = 4000;
function thinPath(path){
  return path.filter((p, i) => i % 2 === 0 || p.brk || (path[i + 1] && path[i + 1].brk));
}
export function livePath(run){
  if (!run) return [];
  const s = liveState(run), out = [];
  let cur = null;
  const add = p => {
    if (!cur || p.brk){ cur = []; out.push(cur); }
    cur.push({ lat: p.lat, lon: p.lon, t: (p.t - run.start) / 1000 });
  };
  for (const p of s.path) add(p);
  if (s.pathLast && s.path[s.path.length - 1] !== s.pathLast) add(s.pathLast);
  return out;
}
// Cuántos puntos aceptados lleva la salida en curso (para saber si cambió el mini mapa).
export const livePathKey = run => { if (!run) return ""; const s = liveState(run), a = s.path; return s.f.n + ":" + (a.length ? a[a.length - 1].t : 0); };
// Último punto aceptado de la salida en curso (para dibujar en vivo), o null.
export function lastPoint(run){ return run ? liveState(run).f.last : null; }
// ¿Hay un hueco (ver createFilter) sin punto aceptado todavía?
export function liveHole(run){ return run ? !!liveState(run).f.hole : false; }
// Vuelve a armar el estado en vivo desde los puntos guardados (después de recuperar o achicar).
export function replayRun(run){ if (run){ delete run._f; liveState(run); } return run; }

// Números en vivo. kg: peso del alumno (null → 70 kg).
// → { elapsedMs, dist (m), movingMs, paceSKm (ritmo medio, s/km), avgKmh, kmh (de los últimos
//   30 s; 0 en pausa), curPaceSKm (ritmo de los últimos 30 s), cls, kcal, kgDefault, autoPaused,
//   gps: "buscando" | "debil" | "ok" | "off" (en pausa o terminada) }
export function liveStats(run, now, kg){
  const z = { elapsedMs: 0, dist: 0, movingMs: 0, paceSKm: 0, avgKmh: 0, kmh: 0, curPaceSKm: 0, cls: null, kcal: 0, kgDefault: !validKg(kg), autoPaused: false, gps: "off" };
  if (!run) return z;
  liveState(run);
  const L = run.live, cfg = cfgOf(run.mode), running = run.status === "running";
  const autoPaused = running && L.lastT != null && now - L.lastT > cfg.autoPauseS * 1000;
  const km = L.dist / 1000, movS = L.movingMs / 1000;
  const kmh = running && !autoPaused ? L.kmh : 0;
  let gps = "ok";
  if (!running) gps = "off";
  else if (L.rawT == null || L.rawSeg !== run.seg || now - L.rawT > 15000) gps = "buscando";
  else if (L.acc > FIRST_ACC_M) gps = "debil";
  return Object.assign(z, {
    elapsedMs: elapsedMs(run, now), dist: L.dist, movingMs: L.movingMs,
    paceSKm: km >= 0.01 ? movS / km : 0, avgKmh: movS > 0 ? L.dist / movS * 3.6 : 0,
    kmh, curPaceSKm: kmh > 0.5 ? 3600 / kmh : 0, cls: L.cls,
    kcal: L.metS * (validKg(kg) || DEFAULT_KG) / 3600, autoPaused, gps,
  });
}

// ---- Al terminar ----
// Todo lo que sale de los puntos guardados: { pts, dist, gapS, mv, segs }.
export function analyzeRun(run){
  const raw = ((run && run.pts) || []).map(a => unpackPoint(a, run.start));
  const { pts, dist, gapS } = filterPoints(raw, run && run.mode);
  const mv = movingIntervals(pts, run && run.mode);
  return { pts, dist, gapS, mv, segs: segmentize(pts, run && run.mode, mv) };
}
const r2 = v => Math.round(v * 100) / 100;
const iso = ms => new Date(ms).toISOString();
// Resumen para guardar (sin coordenadas). kg: peso del alumno, o null si no cargó (→ 70 kg y
// kgDefault: true, para avisarle). dateStr: el día local del inicio (YYYY-MM-DD), lo pasa quien
// llama para no depender de la zona horaria. an: analyzeRun(run), si ya se hizo.
// Límites: los mismos que acepta la base.
export function summarize(run, kg, now, dateStr, an){
  an = an || analyzeRun(run);
  const mode = modeOk(run.mode) ? run.mode : "pie", cfg = cfgOf(mode);
  const w = validKg(kg), useKg = w || DEFAULT_KG, end = run.ended || now;
  const dur = clamp(Math.round(elapsedMs(run, end) / 1000), 1, 86400);
  const moving = an.mv.reduce((a, b) => a + b, 0);
  const segs = an.segs.map(s => Object.assign({}, s, { k: kcalFor(s, useKg) }));
  const kcal = segs.reduce((a, s) => a + s.k, 0);
  const avg = moving > 0 ? an.dist / moving * 3.6 : 0;
  const max = Math.max(maxKmhOf(an.pts, an.mv, cfg), avg);
  const breakdown = {};
  for (const s of segs) breakdown[s.c] = (breakdown[s.c] || 0) + s.movingS;
  for (const c in breakdown){ breakdown[c] = Math.round(breakdown[c]); if (!breakdown[c]) delete breakdown[c]; }
  const sec = ms => Math.round((ms - run.start) / 1000);
  return {
    id: run.id, mode, date: dateStr, startedAt: iso(run.start), endedAt: iso(end),
    dur, moving: clamp(Math.round(moving), 0, dur), dist: clamp(Math.round(an.dist), 0, 1000000),
    kcal: clamp(Math.round(kcal), 0, 20000), avg: r2(clamp(avg, 0, 200)), max: r2(clamp(max, 0, 200)),
    kg: Math.round(useKg * 10) / 10, kgDefault: !w, gap: clamp(Math.round(an.gapS), 0, 86400), points: an.pts.length,
    breakdown,
    segments: segs.slice(0, MAX_SEGMENTS).map(s => ({ c: s.c, s: sec(s.t0), e: sec(s.t1), d: Math.round(s.distM), m: Math.round(s.movingS), k: Math.round(s.k * 10) / 10 })),
    splits: splits(an.pts, an.mv, cfg.splitM),
  };
}
// Todo junto para guardar una salida terminada: { rec (summarize; points = puntos del
// recorrido), track (texto de encodeTrack, o null si no hay nada que dibujar) }.
export function finishRun(run, kg, now, dateStr){
  const an = analyzeRun(run), rec = summarize(run, kg, now, dateStr, an);
  const tr = trackOf(an.pts, run.start, an.segs);
  rec.points = tr ? tr.points : 0;
  return { rec, track: tr ? tr.track : null };
}
// Muy corta para guardarla sin preguntar (menos de 100 m o de 1 min en movimiento).
export const isShort = rec => !rec || rec.dist < MIN_SAVE_M || rec.moving < MIN_SAVE_S;

// Tope de memoria: si una salida pasa MAX_POINTS (≈ 8 h a un punto por segundo), queda uno de
// cada dos, sin tocar las puntas de cada pieza (pausa manual).
export function thinPoints(packed){
  const a = packed || [], out = [];
  for (let i = 0; i < a.length; i++){
    const edge = i === 0 || i === a.length - 1 || a[i][5] !== a[i - 1][5] || a[i][5] !== a[i + 1][5];
    if (edge || i % 2 === 0) out.push(a[i]);
  }
  return out;
}

// ---- Recorrido ----
// Proyección plana en metros alrededor del primer punto (sobra para una salida).
function planar(pts){
  const lat0 = (pts[0] ? pts[0].lat : 0) * Math.PI / 180, kx = 111319.49 * Math.cos(lat0), ky = 111319.49;
  return { X: pts.map(p => p.lon * kx), Y: pts.map(p => p.lat * ky) };
}
// Douglas–Peucker en metros. sync: distancia «sincronizada» con la hora (dónde debería estar a
// esa hora yendo parejo por el segmento), así se conservan también los cambios de velocidad y
// las paradas, que el mapa pinta. keep: índices que se conservan sí o sí.
function dp(pts, tol, sync, keep){
  const n = pts.length;
  if (n < 3) return pts.slice();
  const { X, Y } = planar(pts), k = new Uint8Array(n), t2 = tol * tol, fixed = [0];
  k[0] = k[n - 1] = 1;
  for (let i = 1; i < n - 1; i++) if (keep && keep.has(i)){ k[i] = 1; fixed.push(i); }
  fixed.push(n - 1);
  const stack = [];
  for (let j = 1; j < fixed.length; j++) stack.push([fixed[j - 1], fixed[j]]);
  while (stack.length){
    const [a, b] = stack.pop();
    if (b - a < 2) continue;
    const dx = X[b] - X[a], dy = Y[b] - Y[a], L = dx * dx + dy * dy, dt = pts[b].t - pts[a].t;
    let far = -1, fd = t2;
    for (let i = a + 1; i < b; i++){
      let u;
      if (sync && dt > 0) u = (pts[i].t - pts[a].t) / dt;
      else u = L > 0 ? ((X[i] - X[a]) * dx + (Y[i] - Y[a]) * dy) / L : 0;
      u = clamp(u, 0, 1);
      const ex = X[a] + u * dx - X[i], ey = Y[a] + u * dy - Y[i], d = ex * ex + ey * ey;
      if (d > fd){ fd = d; far = i; }
    }
    if (far > 0){ k[far] = 1; stack.push([a, far], [far, b]); }
  }
  return pts.filter((_, i) => k[i]);
}
// Simplifica una línea [{lat, lon}] con margen tolM metros (para dibujar, p. ej. la imagen).
export const simplifyLine = (pts, tolM) => dp(pts || [], Math.max(0, Number(tolM) || 0), false, null);

// Puntos aceptados → piezas simplificadas [[{lat, lon, t (ms)}]] para guardar: Douglas–Peucker
// sincronizado con la hora por pieza, conservando las puntas y los cambios de tramo (segs). Las
// piezas se cortan en las pausas (brk) y en los huecos sin señal (hole): no se dibuja una recta
// por donde no se midió.
export function simplifyTrack(pts, tolM = TRACK_TOL_M, segs){
  const cuts = new Set();
  for (const s of segs || []){ cuts.add(s.i0); cuts.add(s.i1); }
  const out = [];
  let a = 0;
  while (a < pts.length){
    let b = a + 1;
    while (b < pts.length && !pts[b].brk && !pts[b].hole) b++; // un hueco también corta el dibujo
    const keep = new Set();
    for (const i of cuts) if (i > a && i < b - 1) keep.add(i - a);
    const pc = dp(pts.slice(a, b).map(p => ({ lat: p.lat, lon: p.lon, t: p.t })), tolM, true, keep);
    if (pc.length >= 2) out.push(pc);
    a = b;
  }
  return out;
}

// Polyline de Google de 3 dimensiones por pieza: [lat·1e5, lon·1e5, segundos desde el inicio],
// en diferencias, con los caracteres del 63 «?» al 126 «~». Formato guardado: "1;" (versión) y
// las piezas separadas por un espacio (ninguno de los dos aparece adentro de una pieza).
// pieces: [[{lat, lon, t (s desde el inicio)}]].
const encNum = v => {
  v = v < 0 ? ~(v << 1) : v << 1;
  let s = "";
  while (v >= 0x20){ s += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>>= 5; }
  return s + String.fromCharCode(v + 63);
};
export function encodeTrack(pieces){
  const out = [];
  for (const pc of pieces || []){
    if (!Array.isArray(pc) || pc.length < 2) continue;
    let a = 0, b = 0, c = 0, s = "";
    for (const p of pc){
      const la = Math.round(p.lat * 1e5), lo = Math.round(p.lon * 1e5), t = Math.round(p.t);
      s += encNum(la - a) + encNum(lo - b) + encNum(t - c);
      a = la; b = lo; c = t;
    }
    out.push(s);
  }
  return "1;" + out.join(" ");
}
// Texto guardado → [[{lat, lon, t (s)}]]. Si está cortado se queda con lo que había; descarta
// puntos fuera del mundo y piezas de menos de 2 puntos. Sin la versión "1;" → [].
export function decodeTrack(str){
  const s = String(str || "");
  if (s.slice(0, 2) !== "1;") return [];
  const out = [];
  for (const part of s.slice(2).split(" ")){
    if (!part) continue;
    let i = 0, a = 0, b = 0, c = 0;
    const pc = [];
    const num = () => {
      let r = 0, sh = 0, ch;
      do {
        if (i >= part.length || sh > 30) return NaN;
        ch = part.charCodeAt(i++) - 63;
        if (ch < 0 || ch > 63) return NaN;
        r |= (ch & 0x1f) << sh; sh += 5;
      } while (ch >= 0x20);
      return r & 1 ? ~(r >>> 1) : r >>> 1;
    };
    while (i < part.length){
      const x = num(), y = num(), z = num();
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) break;
      a += x; b += y; c += z;
      const lat = a / 1e5, lon = b / 1e5;
      if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) pc.push({ lat, lon, t: c });
    }
    if (pc.length >= 2) out.push(pc);
  }
  return out;
}
export const trackPoints = pieces => (pieces || []).reduce((n, pc) => n + pc.length, 0);

// Recorrido para guardar: simplificado con 4 m y, si no entra en MAX_TRACK_LEN caracteres, con
// el doble de margen hasta que entre. start: hora de inicio de la salida (ms). segs: los tramos
// (sus cambios se conservan). → { track, points } o null si no hay nada que dibujar.
export function trackOf(pts, start, segs){
  if (!Array.isArray(pts) || pts.length < 2) return null;
  for (let tol = TRACK_TOL_M; tol < 1e7; tol *= 2){
    const pieces = simplifyTrack(pts, tol, segs);
    if (!pieces.length) return null;
    const sec = pieces.map(pc => pc.map(p => ({ lat: p.lat, lon: p.lon, t: Math.round((p.t - start) / 1000) })));
    const track = encodeTrack(sec);
    if (track.length <= MAX_TRACK_LEN) return { track, points: trackPoints(sec) };
  }
  return null;
}

// Largo (m) y límites de un recorrido decodificado.
export function trackLength(pieces){
  let m = 0;
  for (const pc of pieces || []) for (let i = 1; i < pc.length; i++) m += haversine(pc[i - 1], pc[i]);
  return m;
}
export function trackBounds(pieces){
  let s = 90, n = -90, w = 180, e = -180;
  for (const pc of pieces || []) for (const p of pc){ s = Math.min(s, p.lat); n = Math.max(n, p.lat); w = Math.min(w, p.lon); e = Math.max(e, p.lon); }
  return s > n ? null : { s, w, n, e };
}
// Privacidad de la imagen para compartir: saca todo lo que pasa a menos de m metros (en línea
// recta) de dónde empezaste y de dónde terminaste, así no se ve tu casa aunque el recorrido dé
// vueltas cerca o vuelva a pasar por ahí. El corte cae justo en el borde del círculo y, si lo
// oculto queda en el medio, la pieza se parte en dos. Si no queda nada afuera: [].
export function trimTrack(pieces, m = 200){
  const R = Math.max(0, Number(m) || 0);
  const list = (pieces || []).filter(pc => Array.isArray(pc) && pc.length);
  if (!(R > 0) || !list.length) return list.map(pc => pc.slice()).filter(pc => pc.length >= 2);
  const lp = list[list.length - 1], zones = [list[0][0], lp[lp.length - 1]];
  const lerpP = (a, b, u) => ({ lat: a.lat + (b.lat - a.lat) * u, lon: a.lon + (b.lon - a.lon) * u, t: a.t + (b.t - a.t) * u });
  const out = [];
  // Cada pieza de salida sabe de qué pieza original salió (j) y si empieza y termina donde
  // empezaba y terminaba esa (a0, a1). Si no sigue sin recorte a la anterior (empieza en el
  // borde de un círculo, o lo de antes quedó oculto), sale con cut: el dibujo no la une con la
  // anterior (ui/ruta.js prepareRoute), así ninguna línea cruza lo oculto.
  let prev = null;
  list.forEach((pc, j) => {
    let cur = null;
    // Una pieza de menos de 2 m (dos círculos que casi se tocan) no se dibuja.
    const flush = () => {
      if (cur && cur.length >= 2 && trackLength([cur]) >= 2){
        if (!(cur.a0 && prev && prev.a1 && prev.j === j - 1)) cur.cut = true;
        prev = { j, a1: cur.a1 };
        delete cur.a0; delete cur.a1;
        out.push(cur);
      }
      cur = null;
    };
    if (pc.length === 1) return;
    for (let i = 1; i < pc.length; i++){
      const a = pc[i - 1], b = pc[i];
      // Partes del tramo a → b (u de 0 a 1) adentro de algún círculo; lo de afuera se dibuja.
      const ins = zones.map(z => insideCircle(a, b, z, R)).filter(Boolean).sort((x, y) => x[0] - y[0]);
      let u = 0;
      const outside = [];
      for (const [u0, u1] of ins){ if (u0 > u) outside.push([u, u0]); u = Math.max(u, u1); }
      if (u < 1) outside.push([u, 1]);
      for (const [s0, s1] of outside){
        if (s1 - s0 < 1e-9) continue;
        if (s0 > 0 || !cur){ flush(); cur = [lerpP(a, b, s0)]; cur.a0 = s0 === 0 && i === 1; }
        cur.push(lerpP(a, b, s1));
        cur.a1 = s1 >= 1 && i === pc.length - 1;
        if (s1 < 1) flush();
      }
    }
    flush();
  });
  return out;
}
// Parte del tramo a → b (en u, de 0 a 1) que queda a menos de R metros de z, o null. En metros
// sobre un plano alrededor de z (de sobra para unos cientos de metros).
function insideCircle(a, b, z, R){
  const M = 6371008.8 * Math.PI / 180, k = Math.cos(z.lat * Math.PI / 180);
  const ax = (a.lon - z.lon) * M * k, ay = (a.lat - z.lat) * M, dx = (b.lon - a.lon) * M * k, dy = (b.lat - a.lat) * M;
  const A = dx * dx + dy * dy, B = 2 * (ax * dx + ay * dy), C = ax * ax + ay * ay - R * R;
  if (!(A > 0)) return C < 0 ? [0, 1] : null;
  const disc = B * B - 4 * A * C;
  if (!(disc > 0)) return null;
  const q = Math.sqrt(disc), u0 = (-B - q) / (2 * A), u1 = (-B + q) / (2 * A);
  if (u1 <= 0 || u0 >= 1) return null;
  return [Math.max(0, u0), Math.min(1, u1)];
}

// ---- Colores por velocidad (solo números; los colores los pone la pantalla) ----
// km/h en cada punto del recorrido decodificado (distancia / tiempo con el anterior; el primero,
// con el siguiente), suavizado con la media de 3.
export function trackSpeeds(pieces){
  return (pieces || []).map(pc => {
    const raw = pc.map((p, i) => {
      const a = i ? pc[i - 1] : p, b = i ? p : pc[1];
      if (!b) return 0;
      const dt = b.t - a.t;
      return dt > 0 ? haversine(a, b) / dt * 3.6 : NaN;
    });
    for (let i = 0; i < raw.length; i++) if (!Number.isFinite(raw[i])) raw[i] = i ? raw[i - 1] : 0;
    return raw.map((v, i) => {
      const a = raw[i - 1], b = raw[i + 1];
      let s = v, n = 1;
      if (a !== undefined){ s += a; n++; }
      if (b !== undefined){ s += b; n++; }
      return s / n;
    });
  });
}
// Rango de colores [lento, rápido] en km/h: percentiles 10 y 90 de las velocidades en
// movimiento; si quedan muy juntos (menos de spanKmh: 3 a pie, 8 en bici) se abre alrededor
// del centro. Frío = lento, intenso = rápido.
export function colorDomain(speeds, mode){
  const cfg = cfgOf(mode);
  const v = (speeds || []).flat(Infinity).filter(x => Number.isFinite(x) && x >= cfg.stopKmh).sort((a, b) => a - b);
  if (!v.length) return [0, cfg.spanKmh];
  const q = p => v[Math.min(v.length - 1, Math.max(0, Math.round(p * (v.length - 1))))];
  let lo = q(0.1), hi = q(0.9);
  if (hi - lo < cfg.spanKmh){
    const c = (lo + hi) / 2;
    lo = Math.max(0, c - cfg.spanKmh / 2); hi = lo + cfg.spanKmh;
  }
  return [lo, hi];
}
// 0 (lento, frío) … 1 (rápido, intenso).
export function speedT(kmh, dom){
  const lo = dom[0], hi = dom[1];
  return hi > lo ? clamp(((Number(kmh) || 0) - lo) / (hi - lo), 0, 1) : 0.5;
}

// ---- Textos ----
const p2 = n => String(n).padStart(2, "0");
// 00:44:53 (siempre con horas).
export function fmtHMS(ms){ const s = Math.max(0, Math.floor((Number(ms) || 0) / 1000)); return p2(Math.floor(s / 3600)) + ":" + p2(Math.floor(s % 3600 / 60)) + ":" + p2(s % 60); }
// 44:53, o 1:05:12 si pasa la hora.
export function fmtClock(ms){
  const s = Math.max(0, Math.floor((Number(ms) || 0) / 1000)), h = Math.floor(s / 3600);
  return (h ? h + ":" + p2(Math.floor(s % 3600 / 60)) : String(Math.floor(s / 60))) + ":" + p2(s % 60);
}
// Ritmo en min/km: 6:15. Sin distancia (o más de 99 min/km), "–:–".
export function fmtPace(secPerKm){
  const s = Math.round(Number(secPerKm) || 0);
  if (!(s > 0) || s > 99 * 60) return "–:–";
  return Math.floor(s / 60) + ":" + p2(s % 60);
}
export const fmtKm = m => dec((Number(m) || 0) / 1000, 2);
export const fmtKmh = v => dec(Number(v) || 0, 1);
// Ritmo medio de una salida guardada en s/km (sobre el tiempo en movimiento).
export function paceOf(rec){
  const km = (Number(rec && rec.dist) || 0) / 1000, s = Number(rec && (rec.moving || rec.dur)) || 0;
  return km >= 0.01 ? s / km : 0;
}
// "6:15 /km" (a pie) o "18,4 km/h" (en bici), de una salida guardada.
export function paceOrSpeed(rec){
  if (rec && rec.mode === "bici") return fmtKmh(rec.avg) + " km/h";
  return fmtPace(paceOf(rec)) + " /km";
}
export const modeLabel = m => cfgOf(m).label;
export const classLabel = c => (CLASSES[c] || { label: "" }).label;
// Desglose: «20 min caminando · 15 trotando · 10 corriendo» (la unidad solo en el primero). Si
// alguno llega a la hora, con unidad en todos: «1 h 5 min caminando · 20 min trotando».
// En bici: «45 min en bici». Nada en movimiento: «Menos de 1 min en movimiento».
export function breakdownText(b){
  const items = Object.keys(CLASSES).map(c => ({ c, min: Math.round((Number(b && b[c]) || 0) / 60) })).filter(x => x.min > 0);
  if (!items.length) return "Menos de 1 min en movimiento";
  const hm = min => min >= 60 ? Math.floor(min / 60) + " h" + (min % 60 ? " " + (min % 60) + " min" : "") : min + " min";
  const long = items.some(x => x.min >= 60);
  return items.map((x, i) => (long || i === 0 ? hm(x.min) : String(x.min)) + " " + CLASSES[x.c].gerund).join(" · ");
}
