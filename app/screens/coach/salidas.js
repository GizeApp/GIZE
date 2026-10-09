// Ficha del alumno → «Salidas a pie y en bici»: las últimas 30 salidas de Cardio del alumno
// (supabase/cardio-a-pie.sql, leídas en openClient sin el recorrido) y, al abrir una, la misma
// ficha que ve el alumno (ui/recorrido.js): el recorrido animado sobre el mapa, sus números, cuánto
// caminó, trotó o corrió y los parciales, sin «Borrar» ni «Compartir». El recorrido se pide recién
// ahí, una vez por ficha abierta, y queda solo en memoria (nunca en el celular del coach: si el
// alumno borra la salida o su cuenta, o deja de estar vinculado, no le queda guardado); el mapa
// se destruye al cerrar la salida (ui/mapa.js syncRouteViews, después de cada renderCoach).
// En la app de Android (core/plataforma.js appAndroid: ahí no hay nada de ubicación) la salida se
// abre solo con sus números: sin mapa ni dibujo del recorrido, que ni se pide a la nube.
// Los colores salen de la gama (var(--gize-r1..r3)), que con el neón apagado ya es gris.
import { esc, fmtDate } from '../../core/utils.js';
import { breakdownText, fmtClock, fmtKm, modeLabel, paceOrSpeed } from '../../core/cardiogps.js';
import { fetchSalidaTrack } from '../../core/supabase.js';
import { legendHtml, mixHtml, notesHtml, prepOf, routeHtml, splitsHtml, statsHtml } from '../../ui/recorrido.js';
import { CoachState } from './state.js';
import { appAndroid } from '../../core/plataforma.js';
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

// El recorrido: de la memoria de esta ficha, o se pide a la nube (una vez) y se redibuja al llegar.
// d.salidaTracks[id]: undefined (sin pedir) | null (pidiendo) | "" (no hay o no se pudo) | texto.
function trackFor(d, s){
  const st = d.salidaTracks || (d.salidaTracks = {});
  if (st[s.id] === undefined){
    if (s.points === 0){ st[s.id] = ""; return ""; }
    st[s.id] = null;
    fetchSalidaTrack(s.id).catch(() => null).then(t => {
      st[s.id] = t || "";
      if (CoachState.coachData === d && CoachState.coachSec === "salidas" && CoachState.coachSalidaSel === s.id) renderCoach();
    });
  }
  return st[s.id];
}

function renderRoute(d, s){
  if (appAndroid()) return "";
  const tr = trackFor(d, s);
  if (tr === null) return '<div class="sal-ruta sal-ruta-msg">Cargando el recorrido…</div>';
  if (!tr || !prepOf(s, tr)) return '<div class="sal-ruta sal-ruta-msg">' + (s.points === 0 || tr ? "Esta salida no tiene recorrido." : "No se pudo cargar el recorrido. Volvé a abrir la salida para reintentar.") + '</div>';
  return routeHtml("coach:" + s.id, s, tr, { cls: "sal-ruta", pad: { top: 30, right: 30, bottom: 36, left: 30 } }) + legendHtml(s, tr);
}

function renderDetail(d, s){
  return '<div class="sal-det">' +
    '<button class="co-back sal-back" data-coach="salida-close">‹ Todas las salidas</button>' +
    '<div class="sal-det-h">' + chip(s.mode) + '<span>' + esc(when(s)) + '</span></div>' +
    renderRoute(d, s) + statsHtml(s) + mixHtml(s) + splitsHtml(s) + notesHtml(s, "coach") +
  '</div>';
}
