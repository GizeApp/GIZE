// Cardio: arriba, «Salir a moverte» (salidas «A pie» / «En bici» con el GPS: elegir, en vivo y el
// resumen con el recorrido animado), el plan del coach, «Tus salidas» y abajo el cronómetro y el
// temporizador.
// · La salida en curso la lleva ui/gps.js (también con la pantalla apagada en el celular); las
//   cuentas, core/cardiogps.js; guardar y borrar, core/salidas.js.
// · En vivo, el reloj de main.js (tick → paintSalida) cambia solo los números, una vez por segundo
//   y solo con Cardio a la vista; el mini mapa se redibuja como mucho cada 5 s.
// · Al terminar, el resumen se abre encima de todo (#salidaHost) con el recorrido dibujándose sobre
//   el mapa (ui/recorrido.js, ui/mapa.js, ui/ruta.js); «Guardar» o «Descartar». Lo mismo al abrir
//   una de «Tus salidas» (ahí: «Compartir», «Ver de nuevo», «Borrar»).
import { State, state } from '../core/state.js';

import { esc, fmt, fmtDate, ymd } from '../core/utils.js';
import { bikeSvg, shoeSvg } from '../core/icons.js';
import { CLASSES, breakdownText, filterPoints, finishRun, fmtClock, fmtKm, fmtKmh, fmtPace, isShort, lastWeight, modeLabel, paceOrSpeed, unpackPoint } from '../core/cardiogps.js';
import { GpsState, acceptDisclosure, ackRestored, discard, disclosure, hint, isNative, live, onPoint, openSettings, pause, restoredText, resume, setMode, start, stop, takeEnded } from '../ui/gps.js';
import { cachedTrack, deleteSalida, getTrack, salidasList, saveEnded } from '../core/salidas.js';
import { salidaPendiente } from '../core/supabase.js';
import { legendHtml, mixHtml, notesHtml, prepOf, routeHtml, splitsHtml, statsHtml } from '../ui/recorrido.js';
import { routeSlot, routeView, syncRouteViews } from '../ui/mapa.js';
import { closeShareSheet, openShareSheet } from '../ui/compartir.js';
import { appAway } from '../ui/pausa.js';
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

export function renderCardioPrescription(){
  const cp = (state.coachPlan && state.coachPlan.cardio) ? state.coachPlan.cardio : null;
  if(!cp || (!cp.text && !(cp.items&&cp.items.length))) return "";
  const items = (cp.items&&cp.items.length) ? '<ul class="mc-list">'+cp.items.filter(x=>x&&x.trim()).map(x=>'<li>'+esc(x)+'</li>').join("")+'</ul>' : "";
  const txt = cp.text ? '<div class="cardio-rx-txt">'+esc(cp.text)+'</div>' : "";
  return '<div class="cardio-rx"><div class="cardio-rx-h">Tu cardio de esta semana</div>'+txt+items+'</div>';
}

export function renderCardio(){
  const modes = `<div class="cardio-modes">
    <button class="cmode${CardioState.cardioMode==='stopwatch'?' active':''}" data-action="cardio-mode" data-mode="stopwatch">Cronómetro</button>
    <button class="cmode${CardioState.cardioMode==='timer'?' active':''}" data-action="cardio-mode" data-mode="timer">Temporizador</button>
  </div>`;
  const rx = renderCardioPrescription();
  const tools = renderCardioTools(modes);
  return renderSalidaCard() + rx + renderSalidasList() + '<div class="cardio-toolsec"><div class="cardio-tools-h">Cronómetro y temporizador</div>' + tools + '</div>';
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

function renderSalidaCard(){
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
  if (r) return renderLive(r);
  const mode = GpsState.mode === "bici" ? "bici" : "pie";
  return '<section class="sal-card sal-start">' +
    '<div class="sal-h">Salir a moverte</div>' +
    '<div class="sal-modes" role="radiogroup" aria-label="Tipo de salida">' + MODES_UI.map(x =>
      '<button type="button" class="cmode sal-mode' + (x.m === mode ? " active" : "") + '" role="radio" aria-checked="' + (x.m === mode) + '" data-action="sal-mode" data-mode="' + x.m + '">' +
        '<span class="sal-mode-ico" aria-hidden="true">' + x.icon + '</span>' +
        '<span class="sal-mode-t">' + esc(modeLabel(x.m)) + '</span>' +
        '<span class="sal-mode-s">' + esc(x.sub) + '</span>' +
      '</button>').join("") + '</div>' +
    errorHtml() +
    '<div class="ctrl-row"><button class="ctrl primary wide" data-action="sal-start">Empezar</button></div>' +
  '</section>';
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
    routeSlot("live", { key: "live:" + r.id, mode: r.mode, live: true }, "sal-minimap") +
    '<div class="sal-gps" id="salGps" hidden></div>' +
    (GpsState.notice ? '<div class="sal-note">' + esc(GpsState.notice) + '</div>' : "") +
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
// Lo medido hasta ahora, filtrado (core/cardiogps.js), en piezas con t en segundos.
let liveMemo = null;
function livePieces(){
  const r = GpsState.run; if (!r || !r.pts.length) return [];
  const k = r.id + ":" + r.pts.length + ":" + (r.pts.length ? r.pts[r.pts.length - 1][0] : 0);
  if (liveMemo && liveMemo.k === k) return liveMemo.v;
  const { pts } = filterPoints(r.pts.map(a => unpackPoint(a, r.start)), r.mode);
  const out = []; let cur = null;
  for (const p of pts){ if (!cur || p.brk){ cur = []; out.push(cur); } cur.push({ lat: p.lat, lon: p.lon, t: (p.t - r.start) / 1000 }); }
  liveMemo = { k, v: out };
  return out;
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

// ---- «Tus salidas» ----
function renderSalidasList(){
  const list = salidasList();
  if (!list.length) return "";
  const shown = SalidaState.all ? list : list.slice(0, LIST_N);
  return '<section class="sal-hist"><div class="sal-hist-h">Tus salidas</div><div class="sal-list">' + shown.map(s =>
    '<button class="sal-row" data-action="sal-open" data-id="' + esc(s.id) + '">' +
      '<span class="sal-row-top">' + chip(s.mode) + '<span class="sal-row-date">' + esc(when(s)) + '</span>' + (salidaPendiente(s.id) ? '<span class="sal-tag">Por subir</span>' : "") + '</span>' +
      '<span class="sal-row-nums"><b>' + fmtKm(s.dist) + ' km</b> · ' + fmtClock(s.dur * 1000) + ' · ' + esc(paceOrSpeed(s)) + ' · ' + kcalTxt(s) + ' kcal</span>' +
      '<span class="sal-row-mix">' + esc(breakdownText(s.breakdown)) + '</span>' +
      '<span class="ptile-go" aria-hidden="true">›</span>' +
    '</button>').join("") + '</div>' +
    (list.length > LIST_N ? '<button type="button" class="sal-more" data-action="sal-all">' + (SalidaState.all ? "Ver menos" : "Ver todas (" + list.length + ")") + '</button>' : "") +
  '</section>';
}

// ---- Resumen encima de todo (#salidaHost) ----
const reducedMotion = () => !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) || document.documentElement.classList.contains("lite");
// La salida abierta: { rec, track (texto, "" sin recorrido, null cargando), saved }.
function openData(){
  const o = SalidaState.open; if (!o) return null;
  if (o.kind === "ended"){ const e = endedSummary(); return e ? { rec: e.rec, track: e.track || "", saved: false } : null; }
  const rec = (Array.isArray(state.salidas) ? state.salidas : []).find(x => x.id === o.id);
  if (!rec) return null;
  if (o.track === undefined){
    if (rec.points === 0) o.track = "";
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
  const prep = track ? prepOf(rec, track) : null;
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
  const hero = track === null ? '<div class="sov-map sov-map-msg">Cargando el recorrido…</div>'
    : !prep ? '<div class="sov-map sov-map-msg">' + (track ? "No se pudo dibujar el recorrido." : rec.points === 0 ? "Esta salida no tiene recorrido." : "No se pudo cargar el recorrido. Volvé a abrir la salida para reintentar.") + '</div>'
    : routeHtml(name, rec, track, { cls: "sov-map", pad: { top: 84, right: 36, bottom: 128, left: 36 },
        onProgress: (m, total) => { if (!o.shown) setTxt("sovKm", fmtKm(total > 0 ? rec.dist * Math.min(1, m / total) : rec.dist)); },
        onDone: () => { if (SalidaState.open !== o) return; o.shown = true; setTxt("sovKm", fmtKm(rec.dist)); const n = document.getElementById("sovNums"); if (n) n.classList.add("in"); } });
  const btns = saved
    ? '<button class="ctrl primary wide" data-action="sal-share">Compartir</button>' +
      '<div class="sov-row"><button class="ctrl ghost" data-action="sal-replay"' + (prep ? "" : " disabled") + '>Ver de nuevo</button><button class="ctrl ghost sov-del" data-action="sal-del">Borrar</button></div>'
    : '<button class="ctrl primary wide" data-action="sal-save">Guardar</button>' +
      '<div class="sov-row"><button class="ctrl ghost" data-action="sal-share">Compartir</button><button class="ctrl ghost" data-action="sal-replay"' + (prep ? "" : " disabled") + '>Ver de nuevo</button></div>' +
      '<button class="sov-link sov-del" data-action="sal-discard">Descartar</button>';
  const short = !saved && isShort(rec) ? '<div class="sal-note">La salida es muy corta (menos de 100 m o de 1 min en movimiento). Podés guardarla igual o descartarla.</div>' : "";
  const pend = saved && salidaPendiente(rec.id) ? '<div class="sal-tip">Todavía no se subió a tu cuenta: se sube sola apenas haya conexión.</div>' : "";
  host.innerHTML = '<div class="sov" role="dialog" aria-modal="true" aria-label="Resumen de la salida">' +
    '<div class="sov-hero">' + hero +
      '<div class="sov-top"><button type="button" class="sov-x" data-action="sal-close" aria-label="Cerrar">‹</button><div class="sov-title">' + chip(rec.mode) + '<span>' + esc(when(rec)) + '</span></div></div>' +
      '<div class="sov-big"><b id="sovKm">' + (anim ? "0,00" : fmtKm(rec.dist)) + '</b><span>km</span></div>' +
    '</div>' +
    '<div class="sov-body">' +
      (saved ? "" : '<div class="sov-new">' + (isShort(rec) ? "Salida terminada" : "¡Salida terminada!") + '</div>') +
      legendHtml(rec, track) +
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
}

// Lo que se toca de las salidas (main.js lo pasa acá). → true si era de las salidas.
export function salidaAction(a, el){
  if (a === "sal-mode"){ setMode(el.dataset.mode); renderApp(); return true; }
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
    if (!rec) return true; // muy corta y no la quiso guardar: queda para decidir
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
    const d = openData(); if (!d) return true;
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
