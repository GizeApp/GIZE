import { state } from '../core/state.js';

import { esc, fmt } from '../core/utils.js';

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
  return rx + '<div class="cardio-toolsec"><div class="cardio-tools-h">Cronómetro y temporizador</div>' + tools + '</div>';
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
