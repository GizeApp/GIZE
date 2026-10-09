// La ficha de una salida de Cardio, igual para el alumno (resumen al terminar y «Tus salidas»,
// screens/cardio.js) y para su coach (screens/coach/salidas.js): el recorrido animado sobre el
// mapa (ui/mapa.js routeSlot) y los números: distancia, tiempo, en movimiento, ritmo o velocidad,
// velocidad máxima y calorías; cuánto caminó, trotó o corrió (barra apilada con la gama:
// caminando var(--gize-r1), trotando var(--gize-r2), corriendo var(--gize-r3)); la leyenda de
// colores del recorrido (lo más lento y lo más rápido), los parciales y los avisos.
// Solo arma HTML: los colores salen de los tokens, que con el neón apagado ya son grises.
// En la app de Android (core/plataforma.js appAndroid) no hay recorrido ni leyenda: solo los números.
import { dec, esc } from '../core/utils.js';
import { CLASSES, breakdownText, decodeTrack, fmtClock, fmtKm, fmtKmh, fmtPace, paceOrSpeed } from '../core/cardiogps.js';
import { legendGradient, prepareRoute } from './ruta.js';
import { routeSlot } from './mapa.js';
import { appAndroid } from '../core/plataforma.js';

const kcalTxt = s => s.kcal == null ? "–" : String(Math.round(s.kcal));
export const salidaKey = (s, track) => s.id + ":" + (track ? track.length : 0);

// El recorrido listo para dibujar (se arma una vez por salida y recorrido).
const preps = new Map();
export function prepOf(s, track){
  if (!track) return null;
  const k = salidaKey(s, track);
  if (!preps.has(k)){ if (preps.size > 8) preps.clear(); preps.set(k, prepareRoute(decodeTrack(track), s.mode)); }
  return preps.get(k);
}

// El lugar del recorrido animado (ui/mapa.js). name: único en la pantalla. opts: pad, onProgress,
// onDone, cls.
export function routeHtml(name, s, track, opts){
  if (appAndroid()) return "";
  opts = opts || {};
  const prep = prepOf(s, track);
  return routeSlot(name, { key: salidaKey(s, track), mode: s.mode, pieces: prep ? prep.pieces : [], pad: opts.pad, onProgress: opts.onProgress, onDone: opts.onDone }, opts.cls);
}

// Leyenda: lo más lento y lo más rápido del recorrido (ritmo a pie, velocidad en bici), con el
// mismo degradé que el dibujo.
export function legendHtml(s, track){
  if (appAndroid()) return "";
  const prep = prepOf(s, track);
  if (!prep) return "";
  const end = kmh => s.mode === "bici" ? fmtKmh(kmh) + " km/h" : (kmh > 0.5 ? fmtPace(3600 / kmh) : "–:–") + " /km";
  return '<div class="sal-leg"><span>Más lento <b>' + end(prep.dom[0]) + '</b></span><i class="sal-leg-bar" aria-hidden="true" style="background:' + legendGradient() + '"></i><span>Más rápido <b>' + end(prep.dom[1]) + '</b></span></div>';
}

export function statsHtml(s){
  const pie = s.mode !== "bici";
  const stat = (k, v) => '<div class="sal-stat"><span>' + k + '</span><b>' + v + '</b></div>';
  return '<div class="sal-stats">' +
    stat("Distancia", fmtKm(s.dist) + " km") +
    stat("Tiempo", fmtClock(s.dur * 1000)) +
    stat("En movimiento", fmtClock(s.moving * 1000)) +
    stat(pie ? "Ritmo medio" : "Velocidad media", esc(paceOrSpeed(s))) +
    stat("Velocidad máxima", fmtKmh(s.max) + " km/h") +
    stat("Calorías", kcalTxt(s) + " kcal") +
  '</div>';
}

// Desglose: una barra apilada en el orden caminando · trotando · corriendo (o en bici).
export function barHtml(b){
  b = b || {};
  const tot = Object.keys(CLASSES).reduce((a, c) => a + (Number(b[c]) || 0), 0);
  return tot > 0 ? '<div class="sal-bar" aria-hidden="true">' + Object.keys(CLASSES).filter(c => Number(b[c]) > 0)
    .map(c => '<i class="sal-c-' + c + '" style="width:' + (Number(b[c]) / tot * 100).toFixed(2) + '%"></i>').join("") + '</div>' : "";
}
export function mixHtml(s, secCls){
  const pie = s.mode !== "bici";
  return '<div class="' + (secCls || "co-sec") + '">' + (pie ? "Caminando, trotando y corriendo" : "En movimiento") + '</div>' + barHtml(s.breakdown) + '<div class="sal-mix">' + esc(breakdownText(s.breakdown)) + '</div>';
}

// Parciales: cada km a pie (ritmo), cada 5 km en bici (velocidad). El último, lo que sobró.
export function splitsHtml(s, secCls){
  const pie = s.mode !== "bici";
  const sp = (Array.isArray(s.splits) ? s.splits : []).filter(x => Array.isArray(x) && x[0] > 0 && x[1] > 0);
  if (!sp.length) return "";
  const kmh = sp.map(x => x[0] / x[1] * 3.6), top = Math.max(...kmh);
  let cum = 0;
  return '<div class="' + (secCls || "co-sec") + '">Parciales</div><div class="sal-splits">' + sp.map((x, i) => {
    cum += x[0];
    const k = Math.round(cum) % 1000 === 0 ? String(Math.round(cum / 1000)) : dec(cum / 1000, 1);
    const val = pie ? fmtPace(x[1] / (x[0] / 1000)) + " /km" : fmtKmh(kmh[i]) + " km/h";
    return '<div class="sal-split"><span class="sal-split-k">Km ' + k + '</span><span class="sal-split-bar"><i style="width:' + Math.max(4, Math.round(kmh[i] / top * 100)) + '%"></i></span><span class="sal-split-v">' + val + '</span></div>';
  }).join("") + '</div>';
}

// Avisos: calorías con 70 kg (sin peso cargado) y cortes del GPS. who: "yo" (el alumno) o "coach".
// En la app de Android (ahí no hay GPS) el corte se cuenta sin nombrar el GPS.
export function notesHtml(s, who){
  const notes = [];
  if (s.kgDefault) notes.push(who === "coach"
    ? "Calorías calculadas con " + dec(s.kg || 70, 0) + " kg porque el alumno no tenía su peso cargado."
    : "Calorías calculadas con " + dec(s.kg || 70, 0) + " kg porque no cargaste tu peso. Cargalo en Progreso para que sean exactas.");
  const gapMin = Math.round((Number(s.gap) || 0) / 60);
  if (gapMin >= 1) notes.push((appAndroid() ? "La señal se cortó " : "El GPS se cortó ") + gapMin + " min: ese rato no suma distancia.");
  return notes.map(t => '<div class="sal-note">' + esc(t) + '</div>').join("");
}
