// Cardio, de arriba abajo (pedido: «todo dividido en secciones, todo desplegable»):
//   · Arriba de todo, solo si hay: la salida en curso (o en pausa) o la terminada sin guardar
//     («Ver y guardar»). No va en una hoja ni abajo: se ve apenas se entra.
//   · «Tu cardio de esta semana» (el plan del coach; sin plan, no aparece).
//   · «Pasos», lo más importante: los de hoy grandes, la semana en barras, de dónde salen
//     (Salud de Apple / Health Connect) y el link a «Competencia de pasos».
//   · «Tus salidas» y «Cronómetro y temporizador».
//   · Último, «Salir a moverte»: un botón que abre una hoja de abajo con «A pie» / «En bici», el
//     aviso de la ubicación y «Empezar». La hoja es solo para empezar.
// Cada sección se abre y se cierra tocando su título (<details>, sin redibujar la pantalla) y
// queda como la dejaron (localStorage gize_cardio_secs). Al empezar: abiertas «Tu cardio de esta
// semana», «Pasos» y «Tus salidas»; cerrado «Cronómetro y temporizador».
// · La salida en curso la lleva ui/gps.js (también con la pantalla apagada en el celular); las
//   cuentas, core/cardiogps.js; guardar y borrar, core/salidas.js.
// · En vivo, el reloj de main.js (tick → paintSalida) cambia solo los números, una vez por segundo
//   y solo con Cardio a la vista; el mini mapa se redibuja como mucho cada 5 s.
// · Al terminar, el resumen se abre encima de todo (#salidaHost) con el recorrido dibujándose sobre
//   el mapa (ui/recorrido.js, ui/mapa.js, ui/ruta.js); «Guardar» o «Descartar». Lo mismo al abrir
//   una de «Tus salidas» (ahí: «Compartir», «Ver de nuevo», «Borrar»).
// · App de Android (core/plataforma.js appAndroid): sin nada de ubicación. No está «Salir a
//   moverte» (ni la hoja, ni el aviso de la ubicación, ni la salida en vivo) y las salidas medidas
//   en el iPhone o en la web se abren solo con sus números: sin mapa, sin el dibujo del recorrido
//   (ni se lo pide a la nube) y sin «Compartir» ni «Ver de nuevo». Quedan el plan de cardio del
//   coach, los pasos y el cronómetro y temporizador.
import { State, state } from '../core/state.js';

import { esc, fmt, fmtDate, today, ymd } from '../core/utils.js';
import { saludDisponible } from '../core/salud.js';
import { pasosDe, resumenPasos, sumarDias } from '../core/pasosdia.js';
import { saludHtml } from '../ui/saludboton.js';
import { pasosTxt } from '../core/grupos.js';
import { bikeSvg, chevronDownSvg, shoeSvg } from '../core/icons.js';
import { CLASSES, FIRST_ACC_M, breakdownText, finishRun, fmtClock, fmtKm, fmtKmh, fmtPace, haversine, isShort, lastPoint, lastWeight, liveHole, livePath, livePathKey, modeLabel, paceOrSpeed } from '../core/cardiogps.js';
import { GpsState, acceptDisclosure, ackRestored, discard, disclosure, hint, isNative, live, needsPrecise, onHere, onPoint, openSettings, pause, restoredText, resume, setMode, start, stop, takeEnded } from '../ui/gps.js';
import { cachedTrack, deleteSalida, getTrack, salidasList, saveEnded } from '../core/salidas.js';
import { salidaPendiente } from '../core/supabase.js';
import { legendHtml, mixHtml, notesHtml, prepOf, routeHtml, splitsHtml, statsHtml } from '../ui/recorrido.js';
import { routeSlot, routeView, syncRouteViews } from '../ui/mapa.js';
import { closeShareSheet, openShareSheet } from '../ui/compartir.js';
import { appAway } from '../ui/pausa.js';
import { appAndroid } from '../core/plataforma.js';
import { renderApp } from '../main.js';

export const CardioState = {

  cardioMode: "stopwatch",

  swRunning: false,

  swAccum: 0,

  swStartTs: 0,

  swLaps: [],

  tmRunning: false,

  tmRemainingMs: 60000,

  tmTarget: 60000,

  tmEndTs: 0,

  tmFinished: false,

};

// El cronómetro y el temporizador quedan guardados en el celular en cada cambio (main.js
// saveClock): si el sistema cierra la app en segundo plano y la recarga, siguen donde estaban.
// Todo sale de horas absolutas (Date.now), así que siguen contando bien. Lo que no se tocó en
// 12 h no se retoma. Se borra al cerrar sesión (core/supabase.js clearAccountLeftovers).
const CLOCK_KEY = "gize_cardio_clock", CLOCK_MAX_MS = 12 * 3600000;
export function saveClock(){ try { localStorage.setItem(CLOCK_KEY, JSON.stringify(Object.assign({ v: 1, at: Date.now() }, CardioState))); } catch (e) {} }
(function loadClock(){
  let o; try { o = JSON.parse(localStorage.getItem(CLOCK_KEY) || "null"); } catch (e) { return; }
  const now = Date.now(), num = v => typeof v === "number" && Number.isFinite(v) && v >= 0, bool = v => typeof v === "boolean";
  if (!o || o.v !== 1 || !num(o.at) || o.at > now || now - o.at > CLOCK_MAX_MS) return;
  if (!["stopwatch", "timer"].includes(o.cardioMode) || ![o.swAccum, o.swStartTs, o.tmRemainingMs, o.tmTarget, o.tmEndTs].every(num) || !(o.tmTarget > 0)) return;
  if (![o.swRunning, o.tmRunning, o.tmFinished].every(bool) || !Array.isArray(o.swLaps) || o.swLaps.length > 1000 || !o.swLaps.every(num)) return;
  for (const k in CardioState) CardioState[k] = o[k];
  // Terminó con la app cerrada: queda terminado, sin sonar a destiempo.
  if (CardioState.tmRunning && CardioState.tmEndTs <= now){ CardioState.tmRunning = false; CardioState.tmRemainingMs = 0; CardioState.tmFinished = true; }
  else if (CardioState.tmRunning) CardioState.tmRemainingMs = CardioState.tmEndTs - now;
})();

// ---- Secciones desplegables ----
// Abierta o cerrada, por sección, en este dispositivo. Sin localStorage (navegación privada):
// las de siempre.
const SECS_KEY = "gize_cardio_secs";
const SECS_DEF = { rx: true, pasos: true, salidas: true, tools: false };
function secsRead(){ try { return JSON.parse(localStorage.getItem(SECS_KEY) || "{}") || {}; } catch (e) { return {}; } }
export function secOpen(id){ const v = secsRead()[id]; return typeof v === "boolean" ? v : !!SECS_DEF[id]; }
function secSave(id, open){ try { const o = secsRead(); o[id] = !!open; localStorage.setItem(SECS_KEY, JSON.stringify(o)); } catch (e) {} }
// Una sección: caja con el título (y un dato corto a la derecha, que se ve con la sección
// cerrada) y la flecha. cls: clases extra de la caja.
function section(id, title, body, opts){
  opts = opts || {};
  return '<section class="sal-card csec-card csec-' + id + (opts.cls ? " " + opts.cls : "") + '">' +
    '<details class="csec" data-sec="' + id + '"' + (secOpen(id) ? " open" : "") + '>' +
      '<summary class="csec-sum"><span class="csec-t">' + title + '</span>' +
        (opts.meta ? '<span class="csec-m">' + opts.meta + '</span>' : "") +
        '<span class="csec-chev" aria-hidden="true">' + chevronDownSvg + '</span></summary>' +
      '<div class="csec-b">' + body + '</div>' +
    '</details></section>';
}
// Tocar el título abre o cierra y lo recuerda. A mano (como el historial de entrenos en main.js):
// en el iPhone, Safari no despliega un <details> tocando un resumen con display:flex.
document.addEventListener("click", e => {
  const s = e.target.closest && e.target.closest("summary.csec-sum"); if (!s) return;
  const d = s.parentElement; if (!d || d.tagName !== "DETAILS") return;
  e.preventDefault(); d.open = !d.open;
  secSave(d.dataset.sec, d.open);
});

function renderCardioPrescription(){
  const cp = (state.coachPlan && state.coachPlan.cardio) ? state.coachPlan.cardio : null;
  if(!cp || (!cp.text && !(cp.items&&cp.items.length))) return "";
  const items = (cp.items&&cp.items.length) ? '<ul class="mc-list">'+cp.items.filter(x=>x&&x.trim()).map(x=>'<li>'+esc(x)+'</li>').join("")+'</ul>' : "";
  const txt = cp.text ? '<div class="cardio-rx-txt">'+esc(cp.text)+'</div>' : "";
  return section("rx", '<span class="cardio-rx-h">Tu cardio de esta semana</span>', txt + items);
}

export function renderCardio(){
  const modes = `<div class="cardio-modes">
    <button class="cmode${CardioState.cardioMode==='stopwatch'?' active':''}" data-action="cardio-mode" data-mode="stopwatch">Cronómetro</button>
    <button class="cmode${CardioState.cardioMode==='timer'?' active':''}" data-action="cardio-mode" data-mode="timer">Temporizador</button>
  </div>`;
  const running = CardioState.swRunning || CardioState.tmRunning;
  const tools = section("tools", "Cronómetro y temporizador", renderCardioTools(modes), { cls: "cardio-toolsec", meta: running ? "En marcha" : "" });
  queueMicrotask(syncSalSheet);
  return renderSalidaTop() + renderCardioPrescription() + pasosSection() + renderSalidasList() + tools + salirSection();
}

// ---- «Pasos» ----
// Los de hoy grandes; abajo, en tres casillas, ayer y los promedios de la semana y del mes
// (core/pasosdia.js: solo los días con datos; sin datos, «—») y los últimos 7 días en barras
// (hoy, la de la derecha). Los días anteriores salen del registro diario (state.daily[fecha]
// .steps: daily_logs de la nube y, en la app instalada, Salud de Apple / Health Connect).
// En la app instalada: el botón para conectar Salud o, ya conectado, «Actualizar ahora» y
// «Desconectar» (ui/saludboton.js, el mismo de «Competencia de pasos»). En la web, que se cargan
// solos desde la app del celular. Abajo, «Competí con tus amigos» abre la competencia (Progreso).
const DIA_INI = ["D", "L", "M", "M", "J", "V", "S"];
const WD_LARGO = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const pasosOGuion = n => n == null ? "—" : pasosTxt(n);
function pasosSection(){
  const hoy = today(), hoyN = state.stepsDate === hoy ? (state.steps || 0) : 0;
  const r = resumenPasos(state.daily, hoy, hoyN);
  const dias = []; for (let i = 6; i >= 0; i--){ const d = sumarDias(hoy, -i); dias.push({ d, n: pasosDe(state.daily, hoy, hoyN, d), hoy: i === 0 }); }
  const max = Math.max(1, ...dias.map(x => x.n));
  const bars = r.semana.conDatos ? '<div class="cpas-sem" role="img" aria-label="Pasos de los últimos 7 días">' + dias.map(x =>
      '<span class="cpas-dia' + (x.hoy ? " hoy" : "") + '"><b class="cpas-bar"><i style="height:' + (x.n ? Math.max(6, Math.round(x.n / max * 100)) : 0) + '%"></i></b>' +
      '<small>' + DIA_INI[new Date(x.d + "T12:00:00").getDay()] + '</small></span>').join("") + '</div>' : "";
  // Cuántos días cubre: «5 de 7 días» (los días con datos de la ventana).
  const prom = p => (p.prom == null ? "" : p.conDatos + " de ") + p.dias + " días";
  const stat = (k, label, v, sub) => '<div class="cpas-st cpas-st-' + k + '"><span class="cpas-st-l">' + label + '</span><b class="cpas-st-v">' + v + '</b>' + (sub ? '<small class="cpas-st-s">' + sub + '</small>' : "") + '</div>';
  const stats = '<div class="cpas-stats">' +
    stat("ayer", "Ayer", pasosOGuion(r.ayer), WD_LARGO[new Date(sumarDias(hoy, -1) + "T12:00:00").getDay()]) +
    stat("semana", "Prom. semana", pasosOGuion(r.semana.prom), prom(r.semana)) +
    stat("mes", "Prom. mes", pasosOGuion(r.mes.prom), prom(r.mes)) + '</div>';
  const fuente = saludDisponible() ? saludHtml() : '<div class="pg-note">Tus pasos se cargan solos desde la app de GIZE en tu celular.</div>';
  const body = '<div class="cpas-hoy"><b class="cpas-n" id="cpasN">' + pasosTxt(r.hoy) + '</b><span class="cpas-u">pasos hoy</span></div>' +
    stats + bars + '<div class="cpas-src">' + fuente + '</div>' +
    '<button type="button" class="cpas-comp" data-action="cardio-pasos"><span>Competí con tus amigos</span><span class="cpas-comp-s">Competencia de pasos</span><span class="ptile-go" aria-hidden="true">›</span></button>';
  return section("pasos", "Pasos", body, { cls: "cpas", meta: pasosTxt(r.hoy) + " hoy" });
}

// ===================== Salidas «A pie» / «En bici» =====================
// all: «Tus salidas» completa (si no, las últimas 10). open: el resumen abierto encima
// ({ kind: "ended" } la recién terminada, o { kind: "saved", id, track }); shown: ya se ven los
// números (terminó la animación).
export const SalidaState = { all: false, open: null };
const LIST_N = 10;
const MODES_UI = [
  { m: "pie", icon: shoeSvg, sub: "Caminar, trotar o correr: la app lo detecta sola" },
  { m: "bici", icon: bikeSvg, sub: "Ruta o calle" },
];
const WD = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
function when(s){
  const t = new Date(s.startedAt);
  if (isNaN(t)) return fmtDate(s.date);
  return WD[t.getDay()] + " " + fmtDate(s.date) + " · " + t.getHours() + ":" + String(t.getMinutes()).padStart(2, "0");
}
const chip = m => '<span class="sal-chip sal-chip-' + (m === "bici" ? "bici" : "pie") + '">' + esc(modeLabel(m)) + '</span>';
const kcalTxt = s => s.kcal == null ? "–" : String(Math.round(s.kcal));
export const salidaViva = () => !!(GpsState.run && GpsState.run.status === "running");

// Resumen de la salida terminada sin guardar (core/cardiogps.js finishRun), una vez por salida.
let endedMemo = null;
export function endedSummary(){
  const r = takeEnded(); if (!r) return null;
  const k = r.id + ":" + r.pts.length + ":" + r.ended;
  if (!endedMemo || endedMemo.k !== k){
    const { rec, track } = finishRun(r, lastWeight(state.weights), Date.now(), ymd(new Date(r.start)));
    endedMemo = { k, rec, track };
  }
  return endedMemo;
}

function errorHtml(){
  if (!GpsState.error) return "";
  const btn = GpsState.errorWhy === "permiso" && isNative() ? '<button type="button" class="sal-link" data-action="sal-settings">Abrir ajustes</button>' : "";
  return '<div class="sal-err" role="alert">' + esc(GpsState.error) + btn + '</div>';
}

// Arriba de todo: la salida terminada sin guardar o la que está en curso (o en pausa).
function renderSalidaTop(){
  const r = GpsState.run;
  if (r && r.status === "ended"){
    const e = endedSummary();
    const line = e ? fmtKm(e.rec.dist) + " km · " + fmtClock(e.rec.dur * 1000) + " · " + esc(paceOrSpeed(e.rec)) : "";
    return '<section class="sal-card sal-ended">' +
      '<div class="sal-h">Tu salida terminó</div>' +
      '<div class="sal-ended-l">' + chip(r.mode) + '<span>' + line + '</span></div>' +
      '<div class="sal-ended-t">Falta guardarla: mirá el resumen y guardala.</div>' +
      '<div class="ctrl-row"><button class="ctrl ghost" data-action="sal-discard">Descartar</button><button class="ctrl primary" data-action="sal-review">Ver y guardar</button></div>' +
    '</section>';
  }
  // En la app de Android nunca hay una en curso (ui/gps.js la termina al abrir).
  return r && !appAndroid() ? renderLive(r) : "";
}

// Último: «Salir a moverte», un botón que abre la hoja para empezar. Con una salida en curso o
// sin guardar no va (esa está arriba de todo). En la app de Android tampoco: ahí no hay GPS.
function salirSection(){
  if (GpsState.run || appAndroid()) return "";
  return '<section class="sal-card sal-salir" aria-label="Salir a moverte">' +
    '<div class="sal-salir-t">A pie o en bici, con el GPS: distancia, ritmo, calorías y el dibujo de tu recorrido.</div>' +
    '<div class="ctrl-row"><button class="ctrl primary wide" data-action="sal-sheet">Salir a moverte</button></div>' +
  '</section>';
}

// ---- La hoja de abajo para empezar (#salSheet) ----
// «A pie» / «En bici», el aviso del permiso si lo hubo y «Empezar». Se redibuja por dentro con
// cada cambio (sin volver a animarse). Apenas arranca la salida se cierra (la salida en vivo
// queda arriba de todo); si no llega a arrancar (sin permiso, GPS apagado), se vuelve a abrir
// con el aviso.
let reopenOnFail = false;
const salSheetEl = () => document.getElementById("salSheet");
function salSheetHtml(){
  const mode = GpsState.mode === "bici" ? "bici" : "pie";
  return '<div class="ssh-title" id="salSheetT">Salir a moverte</div>' +
    '<div class="sal-modes" role="radiogroup" aria-label="Tipo de salida">' + MODES_UI.map(x =>
      '<button type="button" class="cmode sal-mode' + (x.m === mode ? " active" : "") + '" role="radio" aria-checked="' + (x.m === mode) + '" data-action="sal-mode" data-mode="' + x.m + '">' +
        '<span class="sal-mode-ico" aria-hidden="true">' + x.icon + '</span>' +
        '<span class="sal-mode-t">' + esc(modeLabel(x.m)) + '</span>' +
        '<span class="sal-mode-s">' + esc(x.sub) + '</span>' +
      '</button>').join("") + '</div>' +
    errorHtml() +
    '<div class="ctrl-row"><button class="ctrl primary wide" data-action="sal-start">Empezar</button></div>' +
    '<button type="button" class="ssh-close" data-action="sal-sheet-close">Cancelar</button>';
}
function paintSalSheet(){ const c = salSheetEl(); if (c){ const card = c.querySelector(".ssh-card"); if (card) card.innerHTML = salSheetHtml(); } }
export function openSalSheet(){
  if (GpsState.run || appAndroid()) return;
  if (salSheetEl()){ paintSalSheet(); return; }
  const el = document.createElement("div");
  el.id = "salSheet"; el.className = "ssh";
  el.innerHTML = '<div class="ssh-bg" data-action="sal-sheet-close"></div><div class="ssh-card sal-start" role="dialog" aria-modal="true" aria-labelledby="salSheetT">' + salSheetHtml() + '</div>';
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("open"));
}
export function closeSalSheet(){ const e = salSheetEl(); if (e) e.remove(); }
// Después de cada dibujo de Cardio (y cada cambio de la salida): la hoja al día.
function syncSalSheet(){
  const r = GpsState.run;
  if (r){
    if (salSheetEl()){ closeSalSheet(); reopenOnFail = true; window.scrollTo(0, 0); } // la salida en vivo, a la vista
    if (r.pts.length || r.status !== "running") reopenOnFail = false;
    return;
  }
  if (reopenOnFail && GpsState.error && State.view === "cardio"){ reopenOnFail = false; openSalSheet(); return; }
  reopenOnFail = false;
  paintSalSheet();
}

// En vivo. Los números los cambia paintSalida (sin redibujar); acá van con su valor de ahora.
function renderLive(r){
  const pie = r.mode !== "bici", paused = r.status === "paused", s = live();
  const restored = restoredText();
  const ctrls = paused
    ? '<button class="ctrl ghost" data-action="sal-stop">Terminar</button><button class="ctrl primary" data-action="sal-resume">Seguir</button>'
    : '<button class="ctrl ghost" data-action="sal-pause">Pausar</button><button class="ctrl primary" data-action="sal-stop">Terminar</button>';
  return '<section class="sal-card sal-live' + (paused ? " paused" : "") + '" id="salLive">' +
    '<div class="sal-live-top"><span class="sal-rec" aria-hidden="true"></span>' + chip(r.mode) + '<span class="sal-live-st">' + (paused ? "Pausada" : "En curso") + '</span></div>' +
    (restored ? '<div class="sal-note sal-restored">' + esc(restored) + '<button type="button" class="sal-x" data-action="sal-ack" aria-label="Entendido">✕</button></div>' : "") +
    '<div class="sal-live-time" id="salTime">' + fmtClock(s.elapsedMs) + '</div>' +
    '<div class="sal-live-sub" id="salMove">En movimiento ' + fmtClock(s.movingMs) + '</div>' +
    '<div class="sal-live-chips"><span class="sal-act" id="salAct" hidden></span><span class="sal-auto" id="salAuto" hidden>Pausa automática</span></div>' +
    '<div class="sal-live-grid">' +
      '<div class="sal-lv"><span>Distancia</span><b id="salDist">' + fmtKm(s.dist) + '</b><small>km</small></div>' +
      '<div class="sal-lv"><span>' + (pie ? "Ritmo" : "Velocidad") + '</span><b id="salPace">–</b><small id="salPaceAvg"></small></div>' +
      '<div class="sal-lv"><span>Calorías</span><b id="salKcal">' + Math.round(s.kcal) + '</b><small>kcal</small></div>' +
    '</div>' +
    routeSlot("live", { key: "live:" + r.id, mode: r.mode, live: true, here: liveHere, status: liveStatus, tip: liveTip }, "sal-minimap") +
    '<div class="sal-gps" id="salGps" hidden></div>' +
    (GpsState.notice ? '<div class="sal-note">' + esc(GpsState.notice) + (needsPrecise() && isNative() ? '<button type="button" class="sal-link" data-action="sal-settings">Abrir ajustes</button>' : "") + '</div>' : "") +
    errorHtml() +
    (s.kgDefault ? '<div class="sal-tip">Calorías con 70 kg: cargá tu peso en Progreso para que sean exactas.</div>' : "") +
    '<div class="sal-tip">' + esc(hint()) + '</div>' +
    '<div class="ctrl-row">' + ctrls + '</div>' +
  '</section>';
}

const setTxt = (id, v) => { const e = document.getElementById(id); if (e && e.textContent !== v) e.textContent = v; };
// Los números en vivo (tick de main.js): solo textContent, sin redibujar la pantalla.
export function paintSalida(now){
  const r = GpsState.run; if (!r || r.status === "ended" || !document.getElementById("salLive")) return;
  const s = live(now), pie = r.mode !== "bici", paused = r.status === "paused";
  setTxt("salTime", fmtClock(s.elapsedMs));
  setTxt("salMove", "En movimiento " + fmtClock(s.movingMs));
  setTxt("salDist", fmtKm(s.dist));
  setTxt("salPace", pie ? fmtPace(s.curPaceSKm) : fmtKmh(s.kmh));
  setTxt("salPaceAvg", pie ? "medio " + fmtPace(s.paceSKm) + " /km" : "media " + fmtKmh(s.avgKmh) + " km/h");
  setTxt("salKcal", String(Math.round(s.kcal)));
  const act = document.getElementById("salAct");
  if (act){
    const show = !paused && !!s.cls && !s.autoPaused;
    act.hidden = !show;
    if (show){ const cls = "sal-act sal-c-" + s.cls; if (act.className !== cls) act.className = cls; setTxt("salAct", CLASSES[s.cls] ? CLASSES[s.cls].label : ""); }
  }
  const auto = document.getElementById("salAuto"); if (auto) auto.hidden = paused || !s.autoPaused;
  const g = document.getElementById("salGps");
  if (g){
    const t = paused || s.autoPaused ? "" : s.gps === "buscando" ? "Buscando señal del GPS…" : s.gps === "debil" ? "Señal del GPS débil" : "";
    g.hidden = !t; setTxt("salGps", t);
  }
}

// ---- Mini mapa en vivo ----
// Dónde está ahora (la última ubicación del GPS, aunque el motor todavía no la haya aceptado) y
// qué impide ubicarla: el punto «estás acá» y el texto del mini mapa (ui/mapa.js).
const liveHere = () => GpsState.here;
const liveStatus = () => GpsState.errorWhy || "";
// Cómo unir el final del recorrido con «estás acá» (ui/mapa.js tip): "linea" si sigue andando
// con buena señal; "hueco" (gris de puntos) si hubo un corte del GPS todavía sin un dato bueno
// (p. ej. volvió de tener la pantalla bloqueada) o el dato es flojo; "" en pausa, después de
// «Seguir» (pieza nueva) o si está demasiado lejos para tener que ver.
const TIP_MAX_M = 150;
function liveTip(){
  const r = GpsState.run, h = GpsState.here, p = lastPoint(r);
  if (!r || r.status !== "running" || !h || !p || p.seg !== r.seg) return "";
  if (liveHole(r) || !(h.acc <= FIRST_ACC_M)) return "hueco";
  return haversine(p, h) <= TIP_MAX_M ? "linea" : "";
}
// Lo medido hasta ahora (los puntos que el motor ya aceptó, con tope: core/cardiogps.js
// livePath), en piezas con t en segundos. No se vuelve a filtrar todo en cada redibujo.
let liveMemo = null;
function livePieces(){
  const r = GpsState.run; if (!r || !r.pts.length) return [];
  const k = r.id + ":" + livePathKey(r);
  if (liveMemo && liveMemo.k === k) return liveMemo.v;
  liveMemo = { k, v: livePath(r) };
  return liveMemo.v;
}
const LIVE_MAP_MS = 5000;
let liveAt = 0, liveTimer = null;
// Redibuja el mini mapa: como mucho cada 5 s, solo con Cardio a la vista y la app adelante.
export function liveMapTick(force){
  const v = routeView("live");
  if (!v || State.view !== "cardio" || appAway()) return;
  const now = Date.now();
  if (!force && v.fed && now - liveAt < LIVE_MAP_MS){
    if (!liveTimer) liveTimer = setTimeout(() => { liveTimer = null; liveMapTick(true); }, LIVE_MAP_MS - (now - liveAt));
    return;
  }
  liveAt = now; v.fed = true;
  v.setLive(livePieces());
}
// Con cada punto: los números al día (una vez por tanda) y el mini mapa (como mucho cada 5 s).
let paintQueued = false;
onPoint(() => {
  if (State.view !== "cardio") return;
  if (!paintQueued){ paintQueued = true; setTimeout(() => { paintQueued = false; paintSalida(); }, 0); }
  liveMapTick(false);
});

// Con cada ubicación (como mucho una por segundo): solo se mueve el punto «estás acá» (y, sin
// recorrido todavía, el mapa), sin redibujar el recorrido.
onHere(() => {
  if (State.view !== "cardio" || appAway()) return;
  const v = routeView("live"); if (v) v.setHere();
});

// ---- «Tus salidas» ----
function renderSalidasList(){
  const list = salidasList();
  if (!list.length) return "";
  const shown = SalidaState.all ? list : list.slice(0, LIST_N);
  return section("salidas", "Tus salidas", '<div class="sal-list">' + shown.map(s =>
    '<button class="sal-row" data-action="sal-open" data-id="' + esc(s.id) + '">' +
      '<span class="sal-row-top">' + chip(s.mode) + '<span class="sal-row-date">' + esc(when(s)) + '</span>' + (salidaPendiente(s.id) ? '<span class="sal-tag">Por subir</span>' : "") + '</span>' +
      '<span class="sal-row-nums"><b>' + fmtKm(s.dist) + ' km</b> · ' + fmtClock(s.dur * 1000) + ' · ' + esc(paceOrSpeed(s)) + ' · ' + kcalTxt(s) + ' kcal</span>' +
      '<span class="sal-row-mix">' + esc(breakdownText(s.breakdown)) + '</span>' +
      '<span class="ptile-go" aria-hidden="true">›</span>' +
    '</button>').join("") + '</div>' +
    (list.length > LIST_N ? '<button type="button" class="sal-more" data-action="sal-all">' + (SalidaState.all ? "Ver menos" : "Ver todas (" + list.length + ")") + '</button>' : ""),
    { cls: "sal-hist", meta: String(list.length) });
}

// ---- Resumen encima de todo (#salidaHost) ----
const reducedMotion = () => !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) || document.documentElement.classList.contains("lite");
// La salida abierta: { rec, track (texto, "" sin recorrido, null cargando), saved }. En la app de
// Android el recorrido no se pide (ahí no se dibuja): track "".
function openData(){
  const o = SalidaState.open; if (!o) return null;
  if (o.kind === "ended"){ const e = endedSummary(); return e ? { rec: e.rec, track: e.track || "", saved: false } : null; }
  const rec = (Array.isArray(state.salidas) ? state.salidas : []).find(x => x.id === o.id);
  if (!rec) return null;
  if (o.track === undefined){
    if (rec.points === 0 || appAndroid()) o.track = "";
    else {
      const c = cachedTrack(rec.id);
      if (c) o.track = c;
      else { o.track = null; getTrack(rec.id).then(t => { if (SalidaState.open === o){ o.track = t || ""; paintSalidaOverlay(); } }); }
    }
  }
  return { rec, track: o.track, saved: true };
}
export function openSalida(target){
  closeShareSheet();
  SalidaState.open = Object.assign({ shown: false }, target);
  paintSalidaOverlay();
}
export function closeSalida(){
  SalidaState.open = null;
  closeShareSheet();
  const h = document.getElementById("salidaHost");
  if (h) h.remove();
  document.documentElement.classList.remove("sal-abierta");
  syncRouteViews();
}
export function paintSalidaOverlay(){
  const d = openData();
  if (!d){ closeSalida(); return; }
  const o = SalidaState.open, { rec, track, saved } = d;
  // App de Android: solo los números (sin mapa, sin el dibujo del recorrido y sin compartirlo).
  const solo = appAndroid();
  const prep = track && !solo ? prepOf(rec, track) : null;
  // Sin recorrido para dibujar (o mientras llega): los números ya.
  if (track === "" || (track && !prep)) o.shown = true;
  const anim = !!prep && !o.shown && !reducedMotion();
  // Los números, una vez a la vista, no se vuelven a esconder (si se vieron mientras llegaba el
  // recorrido, el dibujo se anima igual pero la distancia ya no cuenta).
  if (!anim) o.shown = true;
  let host = document.getElementById("salidaHost");
  if (!host){ host = document.createElement("div"); host.id = "salidaHost"; document.body.appendChild(host); }
  document.documentElement.classList.add("sal-abierta");
  const scroll = host.querySelector(".sov") ? host.querySelector(".sov").scrollTop : 0;
  const name = "ov:" + rec.id;
  const hero = solo ? "" : track === null ? '<div class="sov-map sov-map-msg">Cargando el recorrido…</div>'
    : !prep ? '<div class="sov-map sov-map-msg">' + (track ? "No se pudo dibujar el recorrido." : rec.points === 0 ? "Esta salida no tiene recorrido." : "No se pudo cargar el recorrido. Volvé a abrir la salida para reintentar.") + '</div>'
    : routeHtml(name, rec, track, { cls: "sov-map", pad: { top: 84, right: 36, bottom: 128, left: 36 },
        onProgress: (m, total) => { if (!o.shown) setTxt("sovKm", fmtKm(total > 0 ? rec.dist * Math.min(1, m / total) : rec.dist)); },
        onDone: () => { if (SalidaState.open !== o) return; o.shown = true; setTxt("sovKm", fmtKm(rec.dist)); const n = document.getElementById("sovNums"); if (n) n.classList.add("in"); } });
  // «Compartir» espera a que llegue el recorrido (si no, la imagen saldría sin él).
  const shareOff = track === null ? " disabled" : "";
  const btns = solo
    ? (saved ? '<button class="ctrl ghost wide sov-del" data-action="sal-del">Borrar</button>'
      : '<button class="ctrl primary wide" data-action="sal-save">Guardar</button><button class="sov-link sov-del" data-action="sal-discard">Descartar</button>')
    : saved
    ? '<button class="ctrl primary wide" data-action="sal-share"' + shareOff + '>Compartir</button>' +
      '<div class="sov-row"><button class="ctrl ghost" data-action="sal-replay"' + (prep ? "" : " disabled") + '>Ver de nuevo</button><button class="ctrl ghost sov-del" data-action="sal-del">Borrar</button></div>'
    : '<button class="ctrl primary wide" data-action="sal-save">Guardar</button>' +
      '<div class="sov-row"><button class="ctrl ghost" data-action="sal-share"' + shareOff + '>Compartir</button><button class="ctrl ghost" data-action="sal-replay"' + (prep ? "" : " disabled") + '>Ver de nuevo</button></div>' +
      '<button class="sov-link sov-del" data-action="sal-discard">Descartar</button>';
  const short = !saved && isShort(rec) ? '<div class="sal-note">La salida es muy corta (menos de 100 m o de 1 min en movimiento). Podés guardarla igual o descartarla.</div>' : "";
  const pend = saved && salidaPendiente(rec.id) ? '<div class="sal-tip">Todavía no se subió a tu cuenta: se sube sola apenas haya conexión.</div>' : "";
  host.innerHTML = '<div class="sov' + (solo ? " sov-solo" : "") + '" role="dialog" aria-modal="true" aria-label="Resumen de la salida">' +
    '<div class="sov-hero">' + hero +
      '<div class="sov-top"><button type="button" class="sov-x" data-action="sal-close" aria-label="Cerrar">‹</button><div class="sov-title">' + chip(rec.mode) + '<span>' + esc(when(rec)) + '</span></div></div>' +
      '<div class="sov-big"><b id="sovKm">' + (anim ? "0,00" : fmtKm(rec.dist)) + '</b><span>km</span></div>' +
    '</div>' +
    '<div class="sov-body">' +
      (saved ? "" : '<div class="sov-new">' + (isShort(rec) ? "Salida terminada" : "¡Salida terminada!") + '</div>') +
      (solo ? "" : legendHtml(rec, track)) +
      '<div class="sov-nums' + (o.shown ? " in" : "") + '" id="sovNums">' + statsHtml(rec) + mixHtml(rec, "sov-sec") + splitsHtml(rec, "sov-sec") + notesHtml(rec, "yo") + '</div>' +
      short + pend +
      '<div class="sov-btns">' + btns + '</div>' +
    '</div>' +
  '</div>';
  const sv = host.querySelector(".sov"); if (sv && scroll) sv.scrollTop = scroll;
  syncRouteViews();
}

// ---- «Usar tu ubicación» (antes de pedir el permiso la primera vez) ----
function openAviso(){
  closeAviso();
  const d = disclosure(), el = document.createElement("div");
  el.id = "salAviso"; el.className = "ssh";
  el.innerHTML = '<div class="ssh-bg" data-action="sal-aviso-no"></div><div class="ssh-card" role="dialog" aria-modal="true" aria-labelledby="salAvisoT">' +
    '<div class="ssh-title" id="salAvisoT">' + esc(d.title) + '</div><p class="ssh-text">' + esc(d.text) + '</p>' +
    '<div class="ssh-btns"><button type="button" class="ctrl ghost" data-action="sal-aviso-no">' + esc(d.no) + '</button><button type="button" class="ctrl primary" data-action="sal-aviso-ok">' + esc(d.ok) + '</button></div></div>';
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("open"));
}
function closeAviso(){ const e = document.getElementById("salAviso"); if (e) e.remove(); }

async function startSalida(){
  const res = await start(GpsState.mode);
  if (!res.ok && res.why === "aviso"){ openAviso(); return; }
  if (State.view === "cardio") renderApp();
  paintSalSheet();
}

// Lo que se toca de las salidas (main.js lo pasa acá). → true si era de las salidas.
// En la app de Android no se hace nada de lo que usa el GPS, el mapa o el recorrido (la pantalla
// ni lo muestra): se ignora.
const SIN_UBICACION = new Set(["sal-sheet", "sal-mode", "sal-start", "sal-aviso-ok", "sal-settings", "sal-resume", "sal-pause", "sal-replay", "sal-share"]);
export function salidaAction(a, el){
  if (appAndroid() && SIN_UBICACION.has(a)) return true;
  if (a === "sal-sheet"){ openSalSheet(); return true; }
  if (a === "sal-sheet-close"){ closeSalSheet(); return true; }
  if (a === "sal-mode"){ setMode(el.dataset.mode); renderApp(); paintSalSheet(); return true; }
  if (a === "sal-start"){ startSalida(); return true; }
  if (a === "sal-aviso-ok"){ acceptDisclosure(); closeAviso(); startSalida(); return true; }
  if (a === "sal-aviso-no"){ closeAviso(); return true; }
  if (a === "sal-settings"){ openSettings(); return true; }
  if (a === "sal-ack"){ ackRestored(); return true; }
  if (a === "sal-pause"){ pause(); return true; }
  if (a === "sal-resume"){ resume(); return true; }
  if (a === "sal-stop"){
    if (!confirm("¿Terminar la salida?")) return true;
    stop(); renderApp();
    openSalida({ kind: "ended" });
    return true;
  }
  if (a === "sal-review"){ if (takeEnded()) openSalida({ kind: "ended" }); return true; }
  if (a === "sal-save"){
    const e = endedSummary(); if (!e) { closeSalida(); renderApp(); return true; }
    const rec = saveEnded({ keepIfShort: true });
    if (!rec) return true; // muy corta y no la quiso guardar, o sin espacio: queda para decidir
    const o = SalidaState.open, shown = !!(o && o.shown);
    SalidaState.open = { kind: "saved", id: rec.id, track: e.track || "", shown };
    renderApp(); paintSalidaOverlay();
    return true;
  }
  if (a === "sal-discard"){
    if (!confirm("¿Descartar esta salida? No se va a guardar.")) return true;
    discard(); closeSalida(); renderApp();
    return true;
  }
  if (a === "sal-open"){ openSalida({ kind: "saved", id: el.dataset.id }); return true; }
  if (a === "sal-close"){ closeSalida(); return true; }
  if (a === "sal-all"){ SalidaState.all = !SalidaState.all; renderApp(); return true; }
  if (a === "sal-replay"){
    const d = openData(); if (!d) return true;
    const v = routeView("ov:" + d.rec.id); if (v) v.replay();
    return true;
  }
  if (a === "sal-share"){
    const d = openData(); if (!d || d.track === null) return true; // el recorrido todavía no llegó
    openShareSheet(d.rec, d.track || "");
    return true;
  }
  if (a === "sal-del"){
    const d = openData(); if (!d || !d.saved) return true;
    if (!confirm("¿Borrar esta salida?")) return true;
    deleteSalida(d.rec.id).catch(e => console.error("salida", e));
    closeSalida(); renderApp();
    return true;
  }
  return false;
}

// Anillo de neón alrededor del tiempo (la gama RGB girando, como el borde del botón
// principal). Gira siempre; más rápido y con más brillo mientras corre. El número se toca
// para cambiarlo (ruedas de minutos y segundos) cuando está parado.
function ring(big, label, state, pick){
  const small = big.length > 5 ? ' small' : '';
  return `<div class="cring${state?' '+state:''}">
    <div class="cneon glow" aria-hidden="true"><i></i></div><div class="cneon" aria-hidden="true"><i></i></div>
    <div class="cring-in">
      ${pick
        ? `<button type="button" class="time-display cring-pick${small}" id="cringTime" data-action="${pick}" aria-label="Cambiar el tiempo">${big}</button>`
        : `<div class="time-display${small}" id="cringTime">${big}</div>`}
      <div class="cring-label" id="cringLabel">${label}</div>
    </div>
  </div>`;
}
// tick() (main.js) actualiza solo el número, sin redibujar la pantalla.
export function setRing(_frac, big){
  const t = document.getElementById("cringTime"); if (t && big != null && t.textContent !== big){ t.textContent = big; t.classList.toggle("small", big.length > 5); }
}
export const swFrac = ms => (ms % 60000) / 60000;

export function renderCardioTools(modes){
  if (CardioState.cardioMode === "stopwatch") {
    const elapsed = CardioState.swRunning ? CardioState.swAccum + (Date.now()-CardioState.swStartTs) : CardioState.swAccum;
    const laps = CardioState.swLaps.length ? `<div class="laps">${CardioState.swLaps.map((t,i)=>({t,i, d: t - (i ? CardioState.swLaps[i-1] : 0)})).reverse().map(o=>`<div class="lap"><span>Vuelta ${o.i+1}</span><span class="lap-d">+${fmt(o.d)}</span><span>${fmt(o.t)}</span></div>`).join("")}</div>` : "";
    const paused = !CardioState.swRunning && elapsed > 0;
    const label = CardioState.swRunning ? (CardioState.swLaps.length ? "Vuelta " + (CardioState.swLaps.length + 1) : "En curso") : "Tocá para cambiar";
    const ctrls = CardioState.swRunning
      ? '<button class="ctrl ghost" data-action="sw-toggle">Pausar</button><button class="ctrl ghost" data-action="sw-lap">Vuelta</button>'
      : paused
        ? '<button class="ctrl ghost" data-action="sw-reset">Reiniciar</button><button class="ctrl primary" data-action="sw-toggle">Seguir</button>'
        : '<button class="ctrl primary wide" data-action="sw-toggle">Iniciar</button>';
    return modes + `<div class="cring-row">${ring(fmt(elapsed), label, CardioState.swRunning ? "run" : "", CardioState.swRunning ? "" : "sw-pick")}</div>
      <div class="ctrl-row">${ctrls}</div>${laps}`;
  } else {
    const rem = CardioState.tmRunning ? Math.max(0, CardioState.tmEndTs-Date.now()) : CardioState.tmRemainingMs;
    const paused = !CardioState.tmRunning && !CardioState.tmFinished && rem < CardioState.tmTarget;
    const editable = !CardioState.tmRunning && !CardioState.tmFinished;
    const big = CardioState.tmFinished ? "00:00" : fmt(rem, true);
    const label = CardioState.tmFinished ? "¡Tiempo!" : CardioState.tmRunning ? "Restan" : "Tocá para cambiar";
    const r = ring(big, label, CardioState.tmFinished ? "fin" : CardioState.tmRunning ? "run" : "", editable ? "tm-pick" : "");
    let ctrls;
    if (CardioState.tmRunning) ctrls = '<button class="ctrl ghost" data-action="tm-reset">Reiniciar</button><button class="ctrl ghost" data-action="tm-toggle">Pausar</button>';
    else if (CardioState.tmFinished) ctrls = '<button class="ctrl primary wide" data-action="tm-reset">Otra vez</button>';
    else if (paused) ctrls = '<button class="ctrl ghost" data-action="tm-reset">Reiniciar</button><button class="ctrl primary" data-action="tm-toggle">Seguir</button>';
    else ctrls = '<button class="ctrl primary wide" data-action="tm-toggle">Iniciar</button>';
    return modes + `<div class="cring-row">${r}</div><div class="ctrl-row">${ctrls}</div>`;
  }
}

// Ruedas para elegir minutos y segundos (se abre tocando el número del temporizador o del
// cronómetro parado). Se
// desliza como el reloj del celular: sin teclado, que en iPhone corría la pantalla.
const ITEM = 44;
function wheel(id, max, val, unit){
  let items = ""; for (let i = 0; i <= max; i++) items += `<div class="tw-item${i===val?' on':''}">${String(i).padStart(2,"0")}</div>`;
  return `<div class="tw-col"><div class="tw-wheel" id="${id}" tabindex="0" aria-label="${unit}">${items}</div><div class="tw-unit">${unit}</div></div>`;
}
const wheelVal = (el, max) => Math.max(0, Math.min(max, Math.round(el.scrollTop / ITEM)));

// opts.note: texto chico debajo del título; opts.extra: {label, fn} botón de texto abajo.
// opts.clock: hora del día (horas 00–23 y minutos) en vez de minutos y segundos; ms = desde
// las 00:00 (lo usa el aviso de los hábitos).
export function openTimePicker(ms, title, onPick, opts){
  opts = opts || {};
  closeTimePicker();
  const clock = !!opts.clock;
  // Minutos: hasta 60, o más si el tiempo ya pasa de una hora (el cronómetro pausado en
  // 1:15:15 no se corta a 1:00:00 al tocar «Listo»).
  const MAXA = clock ? 23 : Math.max(60, Math.floor(ms / 60000) || 0), MAXB = 59, unitA = clock ? "hora" : "min", unitB = clock ? "min" : "seg";
  const m = clock ? Math.floor(ms / 3600000) % 24 : Math.min(MAXA, Math.floor(ms / 60000));
  const sec = clock ? Math.floor((ms % 3600000) / 60000) : Math.floor((ms % 60000) / 1000);
  const box = document.createElement("div");
  box.id = "timePick"; box.className = "tpick";
  box.innerHTML = `<div class="tpick-bg" data-tp="close"></div>
    <div class="tpick-card" role="dialog" aria-label="${clock ? "Elegir la hora" : "Elegir el tiempo"}">
      <div class="tpick-title">${title}</div>${opts.note ? `<div class="tpick-note">${opts.note}</div>` : ""}
      <div class="tpick-wheels">
        <div class="tw-band" aria-hidden="true"></div>
        ${wheel("twMin", MAXA, m, unitA)}${wheel("twSec", MAXB, sec, unitB)}
      </div>
      <div class="tpick-btns"><button type="button" class="ctrl ghost" data-tp="close">Cancelar</button><button type="button" class="ctrl primary" data-tp="ok">Listo</button></div>
      ${opts.extra ? `<button type="button" class="tpick-extra" data-tp="extra">${opts.extra.label}</button>` : ""}
    </div>`;
  document.body.appendChild(box);
  const wm = box.querySelector("#twMin"), ws = box.querySelector("#twSec");
  wm.scrollTop = m * ITEM; ws.scrollTop = sec * ITEM;
  [[wm, MAXA], [ws, MAXB]].forEach(([w, max]) => {
    const mark = () => { const v = wheelVal(w, max); w.querySelectorAll(".tw-item").forEach((it, i) => it.classList.toggle("on", i === v)); };
    w.addEventListener("scroll", mark, { passive: true });
    // Tocar un número lo lleva al centro.
    w.addEventListener("click", e => { const it = e.target.closest(".tw-item"); if (!it) return; const i = [...w.children].indexOf(it); w.scrollTo({ top: i * ITEM, behavior: "smooth" }); });
    w.addEventListener("keydown", e => { if (e.key === "ArrowUp" || e.key === "ArrowDown"){ e.preventDefault(); w.scrollTo({ top: (wheelVal(w, max) + (e.key === "ArrowUp" ? -1 : 1)) * ITEM, behavior: "smooth" }); } });
  });
  box.addEventListener("click", e => {
    const b = e.target.closest("[data-tp]"); if (!b) return;
    if (b.dataset.tp === "extra"){ closeTimePicker(); opts.extra.fn(); return; }
    if (b.dataset.tp === "ok"){
      let mm = wheelVal(wm, MAXA), ss = wheelVal(ws, MAXB);
      if (clock){ closeTimePicker(); onPick((mm * 60 + ss) * 60000); return; }
      // El tope de 60:00 es del temporizador: si el tiempo ya pasaba de una hora, se respetan los segundos.
      if (mm === 60 && ms < 3600000) ss = 0;
      closeTimePicker(); onPick((mm * 60 + ss) * 1000); return;
    }
    closeTimePicker();
  });
  requestAnimationFrame(() => box.classList.add("open"));
}
export function closeTimePicker(){ const b = document.getElementById("timePick"); if (b) b.remove(); }
