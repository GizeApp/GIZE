// Salir a correr / caminar / bici: cuentas puras (sin pantalla ni GPS), para poder probarlas.
// La pantalla está en screens/cardio.js y el GPS en ui/gps.js.
//
// Recorrido: los puntos que suman (los que pasan los filtros de abajo) se guardan en tramos
// (run.segs) para dibujar el mapa. Al guardar la salida se simplifican y se codifican
// (routeOf / encodeRoute) y van a una tabla aparte (cardio_routes) que ve solo el alumno:
// el coach ve los números, nunca el recorrido. El resumen (summary) sigue sin coordenadas.

// Sin imports: así se prueba sola en Node (tests/cardio-gps.test.mjs).
// Número con d decimales y coma, como dec() de utils.js: 7,18.
const dec = (n, d = 1) => (Number(n) || 0).toFixed(d).replace(".", ",");

// maxKmh: más rápido que esto entre dos puntos es un salto del GPS, no la persona.
export const KINDS = {
  correr:  { label: "Correr",  verb: "Carrera",  maxKmh: 30 },
  caminar: { label: "Caminar", verb: "Caminata", maxKmh: 12 },
  bici:    { label: "Bici",    verb: "Bici",     maxKmh: 80 },
};
export const kindOk = k => Object.prototype.hasOwnProperty.call(KINDS, k);
export const MAX_ACCURACY_M = 30; // puntos con más error que esto no se usan
export const MIN_MOVE_M = 3;      // menos que esto es ruido del GPS (parado, o casi)
export const MAX_WINDOW_S = 10;   // la velocidad máxima se mide en tramos de al menos 10 s
export const DEFAULT_KG = 70;     // sin peso cargado, las calorías se calculan con 70 kg
export const MIN_DIST_M = 50;     // menos que esto al terminar: el GPS no registró distancia
export const MAX_ROUTE_PTS = 20000; // más puntos que esto en una salida: se deja uno de cada dos
export const ROUTE_TOL_M = 4;     // al guardar, se simplifica el recorrido con este margen
export const MAX_ROUTE_LEN = 200000; // largo máximo del recorrido codificado (lo mismo que acepta la base)

// Distancia en metros entre dos puntos {lat, lon} (fórmula de haversine).
export function haversine(a, b){
  const R = 6371008.8, rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// MET (gasto de energía) según la actividad y la velocidad media en km/h.
export function met(kind, kmh){
  const v = Math.max(0, Number(kmh) || 0);
  if (kind === "caminar") return v < 3.2 ? 2.0 : v < 4.8 ? 3.0 : v < 5.6 ? 3.5 : v < 6.4 ? 4.3 : 5.0;
  if (kind === "bici") return v < 16 ? 4.0 : v < 19 ? 6.8 : v < 22 ? 8.0 : v < 25 ? 10.0 : 12.0;
  return Math.max(6, v); // correr: ≈ 1 MET por km/h, mínimo 6
}

// kcal = MET × peso (kg) × horas.
export function kcal(kind, kmh, kg, hours){
  const w = Number(kg) > 0 ? Number(kg) : DEFAULT_KG, h = Math.max(0, Number(hours) || 0);
  return met(kind, kmh) * w * h;
}

// Peso corporal para las calorías: el último registrado (state.weights), o null si no hay.
export function lastWeight(weights){
  const ok = (weights || []).filter(w => w && Number(w.kg) > 0 && w.date);
  if (!ok.length) return null;
  ok.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  return Number(ok[ok.length - 1].kg);
}

// ---- Una salida en curso ----
// run = { kind, start, accMs, since, paused, dist, last, maxKmh, win, jumps, ended }
//   accMs: tiempo en movimiento acumulado hasta la última pausa; since: desde cuándo corre
//   (sin pausa). La duración es por reloj, no por cantidad de puntos.
//   last: último punto aceptado {lat, lon, t}; win: [{t, d}] tiempos y distancia acumulada
//   de los últimos puntos (para la velocidad máxima).
//   segs: el recorrido, en tramos [[lat, lon], …]. Cada vez que se arranca de nuevo sin sumar
//   distancia (primer punto, después de una pausa, de un corte de más de 2 min o de un salto
//   que se tomó como referencia nueva) empieza otro tramo: el mapa no une esos puntos.
export function newRun(kind, now){
  return { kind: kindOk(kind) ? kind : "correr", start: now, accMs: 0, since: now, paused: false, dist: 0, last: null, maxKmh: 0, win: [], jumps: 0, ended: null, segs: [] };
}

export function elapsedMs(run, now){
  if (!run) return 0;
  const end = run.ended || now;
  return Math.max(0, run.accMs + (run.paused ? 0 : Math.max(0, end - run.since)));
}

export function pauseRun(run, now){
  if (!run || run.paused) return;
  run.accMs += Math.max(0, now - run.since);
  run.paused = true;
  // Lo que se mueva en pausa no cuenta: al seguir, el primer punto arranca de nuevo.
  run.last = null; run.win = []; run.jumps = 0;
}

export function resumeRun(run, now){
  if (!run || !run.paused) return;
  run.since = now; run.paused = false; run.last = null; run.win = []; run.jumps = 0;
}

export function endRun(run, now){
  if (!run || run.ended) return;
  if (!run.paused){ run.accMs += Math.max(0, now - run.since); run.paused = true; }
  run.ended = now; run.last = null; run.win = [];
}

// Suma un punto del GPS {lat, lon, acc (m), t (ms)}. Devuelve qué pasó con él:
// "paused" | "bad" | "acc" (poca precisión) | "first" | "noise" (< 3 m) | "jump" (velocidad
// imposible) | "ok" (sumó distancia).
export function addPoint(run, pt){
  if (!run || run.ended) return "paused";
  if (run.paused) return "paused";
  if (!pt || !isFinite(pt.lat) || !isFinite(pt.lon) || !isFinite(pt.t)) return "bad";
  if (!(Number(pt.acc) <= MAX_ACCURACY_M)) return "acc";
  const p = { lat: +pt.lat, lon: +pt.lon, t: +pt.t };
  if (!run.last){ run.last = p; run.win = [{ t: p.t, d: run.dist }]; run.jumps = 0; routePoint(run, p, true); return "first"; }
  const d = haversine(run.last, p), dt = (p.t - run.last.t) / 1000;
  if (dt <= 0) return "noise";
  // Menos de 3 m: ruido. El punto anterior queda como referencia, así un paso lento igual
  // suma cuando se junta más de 3 m.
  if (d < MIN_MOVE_M) return "noise";
  const lim = KINDS[run.kind].maxKmh;
  if (d / dt * 3.6 > lim){
    // Un salto suelto se descarta. Si se repite (el punto de referencia era el malo), se
    // toma el nuevo como referencia sin sumar ese tramo.
    if (++run.jumps >= 3){ run.last = p; run.win = [{ t: p.t, d: run.dist }]; run.jumps = 0; routePoint(run, p, true); }
    return "jump";
  }
  run.jumps = 0;
  run.dist += d; run.last = p;
  routePoint(run, p, false);
  // Velocidad máxima: la media de los últimos ≥ 10 s (un punto adelantado del GPS no la infla).
  run.win.push({ t: p.t, d: run.dist });
  let k = -1;
  for (let i = run.win.length - 2; i >= 0; i--) if ((p.t - run.win[i].t) / 1000 >= MAX_WINDOW_S){ k = i; break; }
  if (k >= 0){
    const a = run.win[k], v = (run.dist - a.d) / ((p.t - a.t) / 1000) * 3.6;
    if (v <= lim && v > run.maxKmh) run.maxKmh = v;
    run.win = run.win.slice(k); // lo anterior ya no hace falta
  }
  if (run.win.length > 400) run.win = run.win.slice(-400);
  return "ok";
}

// ---- Recorrido ----
// Coordenadas con 6 decimales (≈ 10 cm): alcanza de sobra y ocupa menos en el dispositivo.
const r6 = x => Math.round(x * 1e6) / 1e6;
function routePoint(run, p, fresh){
  if (!Array.isArray(run.segs)) run.segs = [];
  const segs = run.segs, cur = segs[segs.length - 1];
  const q = [r6(p.lat), r6(p.lon)];
  // Un tramo nuevo reemplaza al anterior si ese quedó con un solo punto (no dibuja nada).
  if (fresh || !cur){ if (cur && cur.length < 2) segs[segs.length - 1] = [q]; else segs.push([q]); }
  else cur.push(q);
  if (routePoints(segs) > MAX_ROUTE_PTS) thinRoute(segs);
}
export const routePoints = segs => (segs || []).reduce((n, s) => n + s.length, 0);
// Tope de memoria: uno de cada dos puntos (sin tocar la punta de cada tramo).
function thinRoute(segs){
  for (let i = 0; i < segs.length; i++){
    const s = segs[i]; if (s.length < 3) continue;
    const out = s.filter((_, k) => k % 2 === 0);
    if (out[out.length - 1] !== s[s.length - 1]) out.push(s[s.length - 1]);
    segs[i] = out;
  }
}

// Douglas–Peucker en metros (proyección plana alrededor del tramo: sobra para una salida).
// pts: [[lat, lon], …]; tol: margen en metros. Devuelve los puntos que quedan.
export function simplify(pts, tol){
  if (!Array.isArray(pts) || pts.length < 3) return (pts || []).slice();
  const lat0 = pts[0][0] * Math.PI / 180, kx = 111319.49 * Math.cos(lat0), ky = 111319.49;
  const xy = pts.map(p => [p[1] * kx, p[0] * ky]);
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]], t2 = tol * tol;
  while (stack.length){
    const [a, b] = stack.pop();
    const [ax, ay] = xy[a], [bx, by] = xy[b], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    let far = -1, fd = t2;
    for (let i = a + 1; i < b; i++){
      const [px, py] = xy[i];
      let u = L > 0 ? ((px - ax) * dx + (py - ay) * dy) / L : 0; u = Math.max(0, Math.min(1, u));
      const ex = ax + u * dx - px, ey = ay + u * dy - py, d = ex * ex + ey * ey;
      if (d > fd){ fd = d; far = i; }
    }
    if (far > 0){ keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

// Polyline de Google con 5 decimales (el formato de siempre para recorridos).
export function encodePolyline(pts){
  let out = "", pl = 0, pn = 0;
  const num = v => { v = v < 0 ? ~(v << 1) : v << 1; let s = ""; while (v >= 0x20){ s += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>>= 5; } return s + String.fromCharCode(v + 63); };
  for (const p of pts || []){
    const la = Math.round(p[0] * 1e5), lo = Math.round(p[1] * 1e5);
    out += num(la - pl) + num(lo - pn); pl = la; pn = lo;
  }
  return out;
}
export function decodePolyline(str){
  const pts = []; let i = 0, la = 0, lo = 0;
  const s = String(str || "");
  const num = () => { let r = 0, sh = 0, b; do { if (i >= s.length) return NaN; b = s.charCodeAt(i++) - 63; r |= (b & 0x1f) << sh; sh += 5; } while (b >= 0x20); return r & 1 ? ~(r >> 1) : r >> 1; };
  while (i < s.length){
    const a = num(), b = num();
    if (!isFinite(a) || !isFinite(b)) break; // cortado a la mitad: se queda con lo que había
    la += a; lo += b; pts.push([la / 1e5, lo / 1e5]);
  }
  return pts;
}
// Recorrido guardado: un polyline por tramo, separados por un espacio (el polyline usa solo
// los caracteres del 63 «?» al 126 «~», así que el espacio nunca aparece adentro).
export const encodeRoute = segs => (segs || []).filter(s => s && s.length >= 2).map(encodePolyline).join(" ");
// (Un punto fuera del mundo, de un texto roto, se descarta.)
const okPt = p => Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180;
export const decodeRoute = str => String(str || "").split(" ").filter(Boolean).map(s => decodePolyline(s).filter(okPt)).filter(s => s.length >= 2);

// Recorrido de la salida para guardar: simplificado y codificado. Si pasa del tope se
// simplifica más. null si no hay nada que dibujar.
export function routeOf(run){
  const segs = ((run && run.segs) || []).filter(s => Array.isArray(s) && s.length >= 2);
  if (!segs.length) return null;
  for (let tol = ROUTE_TOL_M; tol < 1e6; tol *= 2){
    const simp = segs.map(s => simplify(s, tol));
    const route = encodeRoute(simp);
    if (route.length <= MAX_ROUTE_LEN) return route ? { route, points: routePoints(simp) } : null;
  }
  return null;
}

// Números de la salida (en vivo o al terminar). kg: peso del alumno (null → 70 kg).
export function stats(run, now, kg){
  const ms = elapsedMs(run, now), h = ms / 3600000, km = (run ? run.dist : 0) / 1000;
  const avg = h > 0 ? km / h : 0;
  const k = run ? kcal(run.kind, avg, kg, h) : 0;
  return { ms, km, avgKmh: avg, maxKmh: run ? Math.max(run.maxKmh || 0, 0) : 0, kcal: k, paceS: km > 0.01 ? (ms / 1000) / km : 0 };
}

// ---- Textos ----
const p2 = n => String(n).padStart(2, "0");
// 00:44:53 (siempre con horas).
export function fmtHMS(ms){ const s = Math.max(0, Math.floor((Number(ms) || 0) / 1000)); return p2(Math.floor(s / 3600)) + ":" + p2(Math.floor(s % 3600 / 60)) + ":" + p2(s % 60); }
// Ritmo en min/km: 6:15. Sin distancia, "–:–".
export function fmtPace(secPerKm){
  const s = Math.round(Number(secPerKm) || 0);
  if (!(s > 0) || s > 99 * 60) return "–:–";
  return Math.floor(s / 60) + ":" + p2(s % 60);
}
export const fmtKm = m => dec((Number(m) || 0) / 1000, 2);
export const fmtKmh = v => dec(Number(v) || 0, 1);
// "6:15 /km" (correr y caminar) o "18,4 km/h" (bici), de una salida guardada.
export function paceOrSpeed(rec){
  if (rec.kind === "bici") return fmtKmh(rec.avg) + " km/h";
  const km = (Number(rec.dist) || 0) / 1000;
  return fmtPace(km > 0.01 ? (Number(rec.dur) || 0) / km : 0) + " /km";
}
export const kindLabel = k => (KINDS[k] || KINDS.correr).label;

// Salida terminada → registro para guardar (sin coordenadas: el recorrido va aparte, routeOf).
export function summary(run, kg, id, dateStr){
  const st = stats(run, run.ended || run.start, kg);
  const dur = Math.max(1, Math.min(86400, Math.round(st.ms / 1000)));
  return {
    id, kind: run.kind, date: dateStr, startedAt: new Date(run.start).toISOString(),
    dur, dist: Math.max(0, Math.min(1000000, Math.round(run.dist))),
    kcal: Math.max(0, Math.min(20000, Math.round(st.kcal))),
    avg: Math.round(Math.min(200, st.avgKmh) * 100) / 100,
    max: Math.round(Math.min(200, Math.max(st.maxKmh, st.avgKmh, 0)) * 100) / 100, // nunca menos que la media
  };
}
