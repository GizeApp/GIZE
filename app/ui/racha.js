// Racha: días seguidos entrando a la app. Llama violeta con neón arriba a la derecha; si un
// día no entra, la racha se apaga (al volver se ve la llama apagada y arranca de nuevo en 1).
// Los días se guardan en el dispositivo (state.visits) y se completan con los de la nube: cada
// día que la app abre con sesión queda una fila en daily_logs (ver mergeVisits en loadCloud),
// así la racha sigue aunque cambie de celular o entre desde otro.
import { state } from '../core/state.js';
import { save } from '../core/storage.js';
import { esc, today, ymd } from '../core/utils.js';

const KEEP = 400; // días que se guardan (alcanza para la mejor racha del último año)
const addDays = (s, n) => { const d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); return ymd(d); };
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function visitSet(){ return new Set(Array.isArray(state.visits) ? state.visits : []); }

// Días seguidos hasta `end` inclusive.
function runEnding(set, end){ let n = 0, d = end; while (set.has(d)){ n++; d = addDays(d, -1); } return n; }

export function streakCount(){
  const s = visitSet(), t = today();
  return s.has(t) ? runEnding(s, t) : runEnding(s, addDays(t, -1));
}

function keep(set){
  const t = today();
  state.visits = [...set].filter(d => DAY_RE.test(d) && d <= t).sort().slice(-KEEP);
  // Mejor racha: la más larga de todo lo guardado (incluye las que trae la nube).
  let best = 0, run = 0, prev = null;
  for (const d of state.visits){ run = prev && addDays(prev, 1) === d ? run + 1 : 1; if (run > best) best = run; prev = d; }
  if (!(state.streakBest >= best)) state.streakBest = best;
}

// ¿Se cortó la racha? Se mira una vez por día. Con cuenta, recién cuando llegaron los días
// de la nube (mergeVisits): si ayer entró desde otro celular, la racha no se cortó.
function evaluateLost(){
  const t = today();
  if (state.streakChecked === t) return;
  const s = visitSet();
  const prevEnd = [...s].filter(d => d < t).sort().pop();
  if (prevEnd && prevEnd < addDays(t, -1)){
    const lost = runEnding(s, prevEnd);
    if (lost >= 2) state.streakLost = { days: lost, on: t };
  }
  state.streakChecked = t; save();
  paintStreak();
}

// Hoy entró.
export function markVisit(){
  const t = today(), s = visitSet();
  if (s.has(t)) return false;
  s.add(t); keep(s); save();
  if (!state.cloudSeen) evaluateLost(); // sin cuenta en la nube: alcanza con lo del celular
  return true;
}

// Días con actividad que trae la nube (daily_logs.log_date).
export function mergeVisits(dates){
  const s = visitSet(), before = s.size;
  (dates || []).forEach(d => { if (DAY_RE.test(String(d))) s.add(String(d)); });
  if (s.size !== before){
    keep(s);
    const L = state.streakLost;
    if (L && L.on === today() && !L.shown && s.has(addDays(today(), -1))) state.streakLost = null;
    save();
  }
  evaluateLost();
  paintStreak();
}

// ---- Dibujo ----
let _uid = 0;
export function flameSvg(size, cls){
  const id = "fl" + (++_uid);
  return `<svg class="flame ${cls || ""}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">
    <defs>
      <linearGradient id="${id}o" x1="12" y1="2" x2="12" y2="22" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#E7B8FF"/><stop offset=".45" stop-color="#A65CFF"/><stop offset="1" stop-color="#6A2BFF"/></linearGradient>
      <linearGradient id="${id}i" x1="12" y1="11" x2="12" y2="22" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".55" stop-color="#FFB8EA"/><stop offset="1" stop-color="#FF3DAE"/></linearGradient>
    </defs>
    <path class="fl-out" fill="url(#${id}o)" d="M12.3 1.8c.5 2.9-.9 4.6-2.6 6.4C8 10 6.2 12.1 6.2 15.2A5.8 5.8 0 0 0 12 21.9a5.8 5.8 0 0 0 5.8-5.9c0-2.4-1.1-4.3-2.4-5.9-.2 1.5-.9 2.7-2.1 3.3.6-4.2-.2-7.6-1-11.6z"/>
    <path class="fl-in" fill="url(#${id}i)" d="M12 21.9a3.2 3.2 0 0 1-3.2-3.2c0-1.8 1.2-2.9 2.1-4 .3 1 1 1.7 1.8 2 .3-1.2.2-2.2-.1-3.2 1.6 1.2 2.6 2.7 2.6 4.8a3.2 3.2 0 0 1-3.2 3.6z"/>
    <g class="fl-smoke"><path d="M11 3.5c-1 1-1 2 0 3" /><path d="M13.5 2.5c-1 1.2-.8 2.3.2 3.2"/></g>
  </svg>`;
}

// Botón de la barra de arriba (#streakBtn en index.html).
export function paintStreak(){
  const b = document.getElementById("streakBtn");
  if (!b) return;
  noteHost(); // el aviso ya existe vacío: así el lector de pantalla anuncia el texto cuando llega
  if (b._anim) return; // dejar terminar la animación de "se apagó / se vuelve a prender"
  const n = streakCount(), L = state.streakLost, lostNow = L && L.on === today() && !L.shown;
  b.hidden = false;
  b.setAttribute("aria-label", n === 1 ? "Racha: 1 día" : "Racha: " + n + " días seguidos");
  if (lostNow && !document.body.classList.contains("is-booting")){
    // Apagada con el número de antes; después se vuelve a prender con el de hoy.
    L.shown = true; save(); // se muestra una sola vez
    b._anim = true;
    b.className = "streak out";
    b.innerHTML = flameSvg(22) + `<b>${L.days}</b>`;
    setTimeout(() => {
      b.className = "streak relight"; b.innerHTML = flameSvg(22) + `<b>${streakCount()}</b>`; showLostNote(L.days);
      setTimeout(() => { b._anim = false; paintStreak(); }, 1200);
    }, 1600);
    return;
  }
  if (lostNow) setTimeout(paintStreak, 400); // todavía está la pantalla de inicio: se muestra después
  // Solo se redibuja si cambió: paintStreak corre en cada cambio de pantalla y rehacer la llama
  // reiniciaba su animación, que en SVG obliga a recalcular el diseño de toda la pantalla en
  // cada cuadro (era lo que más costaba al cambiar de pestaña, en todos los celulares).
  const cls = "streak" + (n > 0 ? " lit" : " out");
  if (b.className === cls && b._n === n && b.querySelector(".flame")) return;
  b.className = cls; b._n = n;
  b.innerHTML = flameSvg(22) + `<b>${n}</b>`;
}

function noteHost(){
  let host = document.getElementById("streakNote");
  if (!host){
    host = document.createElement("div"); host.id = "streakNote"; host.className = "streak-note";
    host.setAttribute("role", "status"); host.setAttribute("aria-live", "polite");
    document.body.appendChild(host);
  }
  return host;
}

function showLostNote(days){
  const host = noteHost();
  host.innerHTML = flameSvg(20, "off") + `<span>Se apagó tu racha de ${days} días. ¡Hoy arranca una nueva!</span>`;
  requestAnimationFrame(() => host.classList.add("on"));
  clearTimeout(host._t); host._t = setTimeout(() => host.classList.remove("on"), 4200);
}

const DOW = ["D", "L", "M", "M", "J", "V", "S"];
// Detalle al tocar la llama: días seguidos, mejor racha y la última semana.
export function openStreak(){
  const s = visitSet(), t = today(), n = streakCount();
  const week = Array.from({ length: 7 }, (_, i) => addDays(t, i - 6)).map(d => {
    const on = s.has(d), wd = DOW[new Date(d + "T12:00:00").getDay()];
    return `<div class="stk-day${on ? " on" : ""}${d === t ? " today" : ""}">${flameSvg(22, on ? "" : "off")}<span>${wd}</span></div>`;
  }).join("");
  const host = document.getElementById("streakHost") || Object.assign(document.createElement("div"), { id: "streakHost" });
  host.innerHTML = `<div class="stk-bg" data-action="streak-close"></div>
    <div class="stk-card" role="dialog" aria-modal="true" aria-label="Tu racha">
      <div class="stk-big">${flameSvg(96, n > 0 ? "" : "off")}</div>
      <div class="stk-n">${n}</div>
      <div class="stk-t">${n === 1 ? "día seguido" : "días seguidos"} entrando a GIZE</div>
      <div class="stk-week">${week}</div>
      <div class="stk-best">Tu mejor racha: <b>${esc(String(Math.max(state.streakBest || 0, n)))} ${Math.max(state.streakBest || 0, n) === 1 ? "día" : "días"}</b></div>
      <div class="stk-h">Entrá todos los días para que no se apague. Si un día no entrás, vuelve a empezar.</div>
      <button class="form-save stk-ok" data-action="streak-close">Listo</button>
    </div>`;
  if (!host.isConnected) document.body.appendChild(host);
  const card = host.querySelector(".stk-card"); card.tabIndex = -1;
  requestAnimationFrame(() => { host.classList.add("on"); card.focus({ preventScroll: true }); });
}
export function closeStreak(){
  const host = document.getElementById("streakHost");
  if (!host) return;
  host.classList.remove("on");
  const b = document.getElementById("streakBtn"); if (b) b.focus({ preventScroll: true });
  setTimeout(() => { if (!host.classList.contains("on")) host.innerHTML = ""; }, 220);
}
