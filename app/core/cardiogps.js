// Salir a correr / caminar / bici: cuentas puras (sin pantalla ni GPS), para poder probarlas.
// La pantalla está en screens/cardio.js y el GPS en ui/gps.js.
//
// Privacidad: acá solo se guarda el ÚLTIMO punto (para medir el tramo siguiente) y, para la
// velocidad máxima, tiempos y distancia acumulada (sin coordenadas). El recorrido no se arma
// en ningún lado.

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
export function newRun(kind, now){
  return { kind: kindOk(kind) ? kind : "correr", start: now, accMs: 0, since: now, paused: false, dist: 0, last: null, maxKmh: 0, win: [], jumps: 0, ended: null };
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
  if (!run.last){ run.last = p; run.win = [{ t: p.t, d: run.dist }]; run.jumps = 0; return "first"; }
  const d = haversine(run.last, p), dt = (p.t - run.last.t) / 1000;
  if (dt <= 0) return "noise";
  // Menos de 3 m: ruido. El punto anterior queda como referencia, así un paso lento igual
  // suma cuando se junta más de 3 m.
  if (d < MIN_MOVE_M) return "noise";
  const lim = KINDS[run.kind].maxKmh;
  if (d / dt * 3.6 > lim){
    // Un salto suelto se descarta. Si se repite (el punto de referencia era el malo), se
    // toma el nuevo como referencia sin sumar ese tramo.
    if (++run.jumps >= 3){ run.last = p; run.win = [{ t: p.t, d: run.dist }]; run.jumps = 0; }
    return "jump";
  }
  run.jumps = 0;
  run.dist += d; run.last = p;
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

// Salida terminada → registro para guardar (sin coordenadas).
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
