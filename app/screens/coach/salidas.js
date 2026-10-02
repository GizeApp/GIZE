// Ficha del alumno → «Salidas a pie y en bici»: las últimas 30 salidas de Cardio del alumno
// (supabase/cardio-a-pie.sql, leídas en openClient sin el recorrido) y, al abrir una, sus números,
// cuánto caminó, trotó o corrió, los parciales y el recorrido (se pide recién ahí, una vez:
// core/salidas.js getTrack lo deja en la caché del celular).
// Los colores salen de la gama (var(--gize-r1..r3)), que con el neón apagado ya es gris.
import { dec, esc, fmtDate } from '../../core/utils.js';
import { CLASSES, breakdownText, fmtClock, fmtKm, fmtKmh, fmtPace, modeLabel, paceOrSpeed } from '../../core/cardiogps.js';
import { cachedTrack, getTrack } from '../../core/salidas.js';
import { routeView } from '../../ui/recorrido.js';
import { CoachState } from './state.js';
import { renderCoach } from './index.js';

export const SALIDAS_MAX = 30; // las que se leen por alumno (openClient)

const ts = s => Date.parse(s && s.startedAt) || 0;
const newest = d => (d.salidas || []).slice().sort((a, b) => ts(b) - ts(a));
const WD = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
function when(s){
  const t = new Date(s.startedAt);
  if (isNaN(t)) return fmtDate(s.date);
  return WD[t.getDay()] + " " + fmtDate(s.date) + " · " + t.getHours() + ":" + String(t.getMinutes()).padStart(2, "0");
}
const chip = m => '<span class="sal-chip sal-chip-' + (m === "bici" ? "bici" : "pie") + '">' + esc(modeLabel(m)) + '</span>';
const kcalTxt = s => s.kcal == null ? "–" : String(Math.round(s.kcal));

// Texto de la tarjeta en el menú de la ficha.
export function salidasTileText(d){
  if (d.salidasError === "tabla") return "Todavía no disponibles";
  const l = newest(d);
  if (!l.length) return d.salidasError ? "No se pudieron cargar" : "Sin salidas";
  return (l.length >= SALIDAS_MAX ? SALIDAS_MAX + " o más salidas" : l.length + (l.length === 1 ? " salida" : " salidas")) + " · última " + fmtDate(l[0].date);
}

export function renderCoachSalidas(d){
  if (d.salidasError === "tabla") return '<div class="cal-hint">Las salidas todavía no se pueden ver: falta crear su tabla en la base (supabase/cardio-a-pie.sql). Las que registre el alumno quedan guardadas en su celular y aparecen acá cuando esté lista.</div>';
  if (d.salidasError) return '<div class="cal-hint">No se pudieron cargar las salidas. Tocá «Actualizar» para reintentar.</div>';
  const list = newest(d);
  if (!list.length) return '<div class="cal-hint">El alumno todavía no registró salidas.</div>';
  const sel = list.find(s => s.id === CoachState.coachSalidaSel);
  if (sel) return renderDetail(d, sel);
  return '<div class="sal-list">' + list.map(s =>
    '<button class="sal-row" data-coach="salida-open" data-id="' + esc(s.id) + '">' +
      '<span class="sal-row-top">' + chip(s.mode) + '<span class="sal-row-date">' + esc(when(s)) + '</span></span>' +
      '<span class="sal-row-nums"><b>' + fmtKm(s.dist) + ' km</b> · ' + fmtClock(s.dur * 1000) + ' · ' + esc(paceOrSpeed(s)) + ' · ' + kcalTxt(s) + ' kcal</span>' +
      '<span class="sal-row-mix">' + esc(breakdownText(s.breakdown)) + '</span>' +
      '<span class="ptile-go" aria-hidden="true">›</span>' +
    '</button>').join("") + '</div>' +
    (list.length >= SALIDAS_MAX ? '<div class="cal-hint">Se ven las últimas ' + SALIDAS_MAX + '.</div>' : '');
}

// El recorrido: de la caché, o se pide (una vez por apertura) y se redibuja al llegar.
// d.salidaTracks[id]: undefined (sin pedir) | null (pidiendo) | "" (no hay o no se pudo) | texto.
function trackFor(d, s){
  const st = d.salidaTracks || (d.salidaTracks = {});
  if (st[s.id] === undefined){
    if (s.points === 0){ st[s.id] = ""; return ""; }
    const c = cachedTrack(s.id);
    if (c){ st[s.id] = c; return c; }
    st[s.id] = null;
    getTrack(s.id).then(t => {
      st[s.id] = t || "";
      if (CoachState.coachData === d && CoachState.coachSec === "salidas" && CoachState.coachSalidaSel === s.id) renderCoach();
    });
  }
  return st[s.id];
}

function renderRoute(d, s){
  const tr = trackFor(d, s);
  if (tr === null) return '<div class="sal-ruta sal-ruta-msg">Cargando el recorrido…</div>';
  const v = tr ? routeView(tr, s.mode) : null;
  if (!v) return '<div class="sal-ruta sal-ruta-msg">' + (s.points === 0 || tr ? "Esta salida no tiene recorrido." : "No se pudo cargar el recorrido. Volvé a abrir la salida para reintentar.") + '</div>';
  // Leyenda: lo más lento y lo más rápido del recorrido (ritmo a pie, velocidad en bici).
  const end = kmh => s.mode === "bici" ? fmtKmh(kmh) + " km/h" : (kmh > 0.5 ? fmtPace(3600 / kmh) : "–:–") + " /km";
  return '<div class="sal-ruta">' + v.svg + '</div>' +
    '<div class="sal-leg"><span>Más lento <b>' + end(v.dom[0]) + '</b></span><i class="sal-leg-bar" aria-hidden="true"></i><span>Más rápido <b>' + end(v.dom[1]) + '</b></span></div>';
}

function renderDetail(d, s){
  const pie = s.mode !== "bici";
  const stat = (k, v) => '<div class="sal-stat"><span>' + k + '</span><b>' + v + '</b></div>';
  const stats = '<div class="sal-stats">' +
    stat("Distancia", fmtKm(s.dist) + " km") +
    stat("Tiempo", fmtClock(s.dur * 1000)) +
    stat("En movimiento", fmtClock(s.moving * 1000)) +
    stat(pie ? "Ritmo medio" : "Velocidad media", esc(paceOrSpeed(s))) +
    stat("Velocidad máxima", fmtKmh(s.max) + " km/h") +
    stat("Calorías", kcalTxt(s) + " kcal") +
  '</div>';
  // Desglose: una barra apilada en el orden caminando · trotando · corriendo (o en bici).
  const b = s.breakdown || {}, tot = Object.keys(CLASSES).reduce((a, c) => a + (Number(b[c]) || 0), 0);
  const bar = tot > 0 ? '<div class="sal-bar" aria-hidden="true">' + Object.keys(CLASSES).filter(c => Number(b[c]) > 0)
    .map(c => '<i class="sal-c-' + c + '" style="width:' + (Number(b[c]) / tot * 100).toFixed(2) + '%"></i>').join("") + '</div>' : "";
  const mix = '<div class="co-sec">' + (pie ? "Caminando, trotando y corriendo" : "En movimiento") + '</div>' + bar + '<div class="sal-mix">' + esc(breakdownText(b)) + '</div>';
  // Parciales: cada km a pie (ritmo), cada 5 km en bici (velocidad). El último, lo que sobró.
  const sp = (Array.isArray(s.splits) ? s.splits : []).filter(x => Array.isArray(x) && x[0] > 0 && x[1] > 0);
  let splits = "";
  if (sp.length){
    const kmh = sp.map(x => x[0] / x[1] * 3.6), top = Math.max(...kmh);
    let cum = 0;
    splits = '<div class="co-sec">Parciales</div><div class="sal-splits">' + sp.map((x, i) => {
      cum += x[0];
      const k = Math.round(cum) % 1000 === 0 ? String(Math.round(cum / 1000)) : dec(cum / 1000, 1);
      const val = pie ? fmtPace(x[1] / (x[0] / 1000)) + " /km" : fmtKmh(kmh[i]) + " km/h";
      return '<div class="sal-split"><span class="sal-split-k">Km ' + k + '</span><span class="sal-split-bar"><i style="width:' + Math.max(4, Math.round(kmh[i] / top * 100)) + '%"></i></span><span class="sal-split-v">' + val + '</span></div>';
    }).join("") + '</div>';
  }
  const notes = [];
  if (s.kgDefault) notes.push("Calorías calculadas con " + dec(s.kg || 70, 0) + " kg porque el alumno no tenía su peso cargado.");
  const gapMin = Math.round((Number(s.gap) || 0) / 60);
  if (gapMin >= 1) notes.push("El GPS se cortó " + gapMin + " min: ese rato no suma distancia.");
  return '<div class="sal-det">' +
    '<button class="co-back sal-back" data-coach="salida-close">‹ Todas las salidas</button>' +
    '<div class="sal-det-h">' + chip(s.mode) + '<span>' + esc(when(s)) + '</span></div>' +
    renderRoute(d, s) + stats + mix + splits +
    notes.map(t => '<div class="sal-note">' + esc(t) + '</div>').join("") +
  '</div>';
}
