// Chat coach ↔ alumno, con mensajes de voz (supabase/chat.sql).
// Es una pantalla encima de todo (#chatHost) que se dibuja sola: no depende de renderApp ni
// de renderCoach, así lo que se está escribiendo o grabando no se pierde si la app se
// redibuja atrás. La usan el alumno (botón de la barra de arriba) y el coach (ficha del
// cliente). Mandar pasa por la función de mensajes, que guarda y le avisa al otro al
// celular; los audios se suben antes al bucket privado chat-audio.
// Un mensaje recibido se puede reportar con el «⋯» de al lado de la hora (ui/reportar.js).

import { State } from '../core/state.js';

import { appAway, onAwayChange } from './pausa.js';

import { esc, fmtDate } from '../core/utils.js';

import { chatMsgTienda } from '../core/tienda.js';

import { Player, audioState, extFor, mmss, newAudioName, signedAudioUrl, startRecorder, stopAudio, togglePlay, uploadAudio } from './grabar.js';

import { abrirReporte, cerrarReporte } from './reportar.js';

const FN_NAMES = ["rapid-worker", "notificar-cliente"];
const MAX_TXT = 1000;
const MAX_SECS = 120;

// Conversación abierta: { clientId, coachId, name, role, msgs, ... }
let C = null;
// Mensajes sin leer por alumno (coach) o del propio alumno. Lo usan los globitos.
export const ChatUnread = { map: {}, onChange: null };

const micSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5"/></svg>';
const sendSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></svg>';
const trashSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>';
const playSvg = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4v16l13-8z"/></svg>';
const pauseSvg = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>';

export const chatIconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z"/></svg>';


// ---- Sin leer ----

export async function refreshUnread(){
  if(!State.sb || !State.cloudUser) return ChatUnread.map;
  try{
    const r = await State.sb.rpc("chat_unread");
    if(r.error) return ChatUnread.map;
    const m = {};
    (r.data || []).forEach(x => { m[x.client_id] = x.n; });
    ChatUnread.map = m;
    if(ChatUnread.onChange) ChatUnread.onChange();
  }catch(e){}
  return ChatUnread.map;
}

export function unreadFor(clientId){ return ChatUnread.map[clientId] || 0; }

// ---- Abrir / cerrar ----

function host(){
  let h = document.getElementById("chatHost");
  if(!h){ h = document.createElement("div"); h.id = "chatHost"; document.body.appendChild(h); }
  return h;
}

export function chatOpenFor(){ return C ? C.clientId : null; }

// role: "coach" (escribe a su alumno clientId) o "client" (escribe a su coach coachId).
// Con el chat abierto la pantalla de atrás no se mueve. En el celular, overflow:hidden no
// alcanza: el rebote del scroll y el teclado corrían la página de atrás y se veía la rutina
// por abajo. Se fija el body donde estaba y el chat toma el alto visible (sin el teclado).
let _lock = null;
function fitViewport(){
  const ov = document.querySelector("#chatHost .ch-ov"), vv = window.visualViewport; if(!ov || !vv) return;
  ov.style.height = vv.height + "px";
  ov.style.transform = "translateY(" + vv.offsetTop + "px)";
}
function lockPage(){
  if(_lock) return;
  const y = window.scrollY || 0, b = document.body.style;
  _lock = { y, position: b.position, top: b.top, width: b.width };
  b.position = "fixed"; b.top = (-y) + "px"; b.width = "100%";
  document.documentElement.classList.add("chat-open");
  if(window.visualViewport){ visualViewport.addEventListener("resize", fitViewport); visualViewport.addEventListener("scroll", fitViewport); }
}
function unlockPage(){
  if(!_lock) return;
  const b = document.body.style;
  b.position = _lock.position; b.top = _lock.top; b.width = _lock.width;
  document.documentElement.classList.remove("chat-open");
  window.scrollTo({ top: _lock.y, behavior: "instant" });
  _lock = null;
  if(window.visualViewport){ visualViewport.removeEventListener("resize", fitViewport); visualViewport.removeEventListener("scroll", fitViewport); }
}

export async function openChat(o){
  if(C) closeChat(true);
  C = { clientId: o.clientId, coachId: o.coachId, name: o.name || "", role: o.role,
        msgs: null, error: "", draft: "", sending: 0, rec: null, chan: null, poll: null };
  document.body.classList.add("chat-open");
  lockPage();
  history.pushState({ gizeChat: 1 }, "");
  paint();
  await load();
  listen();
}

export function closeChat(fromNav){
  if(!C) return;
  cerrarReporte();
  stopRec(true);
  stopAudio();
  if(C.chan) try{ State.sb.removeChannel(C.chan); }catch(e){}
  if(C.poll) clearInterval(C.poll);
  C = null;
  document.body.classList.remove("chat-open");
  unlockPage();
  host().innerHTML = "";
  if(!fromNav && history.state && history.state.gizeChat) history.back();
  refreshUnread();
}

// El botón "atrás" del celular cierra el chat en vez de salir de la app.
window.addEventListener("popstate", () => { if(C) closeChat(true); });

// ---- Datos ----

async function load(){
  const c = C; if(!c) return;
  try{
    const r = await State.sb.from("coach_messages")
      .select("id, sender, body, audio_path, audio_secs, created_at, read_at")
      .eq("coach_id", c.coachId).eq("client_id", c.clientId)
      .order("created_at", { ascending: false }).limit(150);
    if(C !== c) return;
    if(r.error){ c.error = "No se pudo cargar la conversación. Revisá la conexión."; c.msgs = c.msgs || []; paint(); return; }
    const known = new Set((c.msgs || []).map(m => m.id));
    const pending = (c.msgs || []).filter(m => m.pending);
    // De los nuevos (del más nuevo al más viejo), el propio que todavía espera la respuesta
    // reemplaza al local (ver ownLocal).
    const rows = (r.data || []).map(norm).map(m => {
      const j = known.has(m.id) ? -1 : ownLocal(pending, m);
      return j < 0 ? m : keepUrl(m, pending.splice(j, 1)[0]);
    });
    c.msgs = rows.reverse().concat(pending);
    c.error = "";
    paint(true);
    markRead();
  }catch(e){ if(C === c){ c.error = "No se pudo cargar la conversación."; c.msgs = c.msgs || []; paint(); } }
}

// Mensajes viejos (antes del chat) no tienen sender: eran del coach.
function norm(m){ return Object.assign({}, m, { sender: m.sender || "coach", body: m.body || "" }); }

function mine(m){ return m.sender === (C.role === "coach" ? "coach" : "client"); }

// El mensaje propio que todavía espera la respuesta de la función. La función lo guarda antes
// de mandar los avisos, así que Realtime (o una recarga) trae el guardado antes de que conteste:
// ocupa el lugar del local, si no se veía dos veces («Enviando…» y «Enviado»).
function ownLocal(list, m){
  if(!mine(m)) return -1;
  return list.findIndex(x => x.pending && x.body === m.body && (x.audio_path || null) === (m.audio_path || null));
}
// El audio recién grabado se sigue escuchando del archivo local.
function keepUrl(m, local){ if(local.localUrl) m.localUrl = local.localUrl; return m; }

function markRead(){
  const c = C; if(!c || document.visibilityState === "hidden") return;
  if(!(c.msgs || []).some(m => !mine(m) && !m.read_at)) return;
  (c.msgs || []).forEach(m => { if(!mine(m) && !m.read_at) m.read_at = new Date().toISOString(); });
  State.sb.rpc("chat_mark_read", { p_client: c.clientId }).then(() => refreshUnread()).catch(() => {});
}

// Revisión de respaldo (si Realtime no conecta): solo con el chat abierto y la app a la vista.
// Con la app en segundo plano (pause de Capacitor en Android/iPhone, o pestaña oculta) no se
// consulta nada; al volver se revisa en el acto y la revisión periódica sigue.
// Con el chat cerrado no hay revisión periódica: los sin leer llegan por el aviso (push) y se
// piden al volver a la app (main.js).
export const POLL_MS = 15000;
export function chatPolling(){ return !!(C && C.poll); }
function startPoll(){
  const c = C; if(!c || c.poll || appAway()) return;
  c.poll = setInterval(() => {
    if(C !== c) return;
    const ok = c.chan && c.chan.state === "joined";
    if(!ok && !appAway()) load();
  }, POLL_MS);
}
function stopPoll(){ if(C && C.poll){ clearInterval(C.poll); C.poll = null; } }
onAwayChange(away => {
  if(!C) return;
  if(away){ stopPoll(); return; }
  load(); // al volver: lo que llegó mientras tanto
  startPoll();
});

// Mensajes nuevos al instante (Realtime). Si no conecta, se revisa cada 15 segundos.
function listen(){
  const c = C; if(!c) return;
  try{
    c.chan = State.sb.channel("chat-" + c.clientId + "-" + Date.now())
      .on("postgres_changes", { event: "*", schema: "public", table: "coach_messages", filter: "client_id=eq." + c.clientId }, p => {
        if(C !== c) return;
        const m = p.new && norm(p.new);
        if(!m || m.coach_id !== c.coachId) return;
        const list = c.msgs || (c.msgs = []);
        const i = list.findIndex(x => x.id === m.id);
        if(i >= 0){ list[i] = Object.assign(list[i], m); paint(); return; }
        const j = ownLocal(list, m);
        if(j >= 0){ list[j] = keepUrl(m, list[j]); paint(); return; }
        list.push(m);
        paint(true);
        markRead();
      })
      .subscribe();
  }catch(e){}
  if(C === c) startPoll();
}

// ---- Mandar ----

async function invoke(payload){
  let res;
  for(const fn of FN_NAMES){
    res = await State.sb.functions.invoke(fn, { body: payload });
    const er = res.error, st = er && er.context && er.context.status;
    if(!er || !(st === 404 || er.name === "FunctionsFetchError")) break;
  }
  if(res.error){
    let detail = "";
    try{ const ctx = res.error.context; if(ctx && ctx.json){ const j = await ctx.json(); detail = j && j.error; } }catch(e){}
    throw new Error(detail || (res.error.name === "FunctionsFetchError" ? "Sin conexión. Probá de nuevo." : (res.error.message || "Error")));
  }
  return res.data || {};
}

// c: la conversación en la que se mandó (un audio se sube primero y, mientras, se puede
// cerrar el chat o abrir el de otro alumno: tiene que ir igual a la suya).
async function sendMsg(payload, local, c = C){
  if(!c) return;
  local.pending = true; local.id = "tmp-" + Date.now() + Math.random().toString(36).slice(2, 6);
  (c.msgs || (c.msgs = [])).push(local);
  c.sending++; if(C === c) paint(true);
  try{
    const r = await invoke(Object.assign({ client_id: c.clientId }, payload));
    local.pending = false;
    if(r.saved === false){ local.failed = "No quedó guardado."; }
    else if(r.id){
      // Si Realtime ya lo trajo, queda uno solo.
      const dup = (c.msgs || []).find(m => m.id === r.id);
      if(dup) c.msgs = c.msgs.filter(m => m !== local);
      else { local.id = r.id; local.created_at = r.created_at || local.created_at; }
    }
  }catch(e){
    local.pending = false; local.failed = chatMsgTienda(e.message) || "No se pudo mandar.";
  }
  c.sending--;
  if(C === c) paint();
}

function sendText(){
  const c = C; if(!c) return;
  const t = document.getElementById("chatText");
  const body = ((t && t.value) || "").trim();
  if(!body) return;
  c.draft = ""; if(t){ t.value = ""; grow(t); }
  toggleSend();
  sendMsg({ body: body.slice(0, MAX_TXT) }, { sender: c.role === "coach" ? "coach" : "client", body: body, created_at: new Date().toISOString() });
}

// ---- Grabar audio ----

async function startRec(){
  const c = C; if(!c || c.rec || c.recStarting) return;
  c.recStarting = true;
  const rec = await startRecorder({
    maxSecs: MAX_SECS,
    stillWanted: () => C === c,
    onTick: s => { const el = document.getElementById("chatRecT"); if(el) el.textContent = mmss(s); },
    onEnd: () => { if(C === c && c.rec === rec){ c.rec = null; paintBar(); } },
    onDone: (blob, type, secs) => uploadAndSend(c, blob, type, secs),
  });
  c.recStarting = false;
  if(!rec || C !== c){ if(rec) rec.stop(true); return; }
  c.rec = rec;
  paintBar();
}

function stopRec(cancel){ const c = C; if(c && c.rec) c.rec.stop(cancel); }

async function uploadAndSend(c, blob, type, secs){
  const name = newAudioName();
  const path = c.coachId + "/" + c.clientId + "/" + name + "." + extFor(type);
  const local = { sender: c.role === "coach" ? "coach" : "client", body: "", audio_path: path, audio_secs: secs, created_at: new Date().toISOString(), localUrl: URL.createObjectURL(blob) };
  local.pending = true; local.id = "tmp-" + name;
  (c.msgs || (c.msgs = [])).push(local);
  c.sending++; if(C === c) paint(true);
  const err = await uploadAudio(path, blob, type);
  c.sending--;
  c.msgs = c.msgs.filter(m => m !== local);
  if(err){
    local.pending = false; local.failed = err;
    c.msgs.push(local); if(C === c) paint(); return;
  }
  sendMsg({ audio_path: path, audio_secs: secs }, local, c);
}

// ---- Escuchar ----

function playMsg(id){
  const c = C; if(!c) return;
  const m = (c.msgs || []).find(x => String(x.id) === id); if(!m) return;
  togglePlay("chat:" + m.audio_path, () => m.localUrl ? Promise.resolve(m.localUrl) : signedAudioUrl(m.audio_path));
}

function playUi(){
  document.querySelectorAll("#chatHost .ch-audio").forEach(el => {
    const st = audioState("chat:" + el.dataset.path);
    const b = el.querySelector(".ch-play"); if(b){ b.innerHTML = st.playing ? pauseSvg : playSvg; b.setAttribute("aria-label", st.playing ? "Pausar" : "Escuchar"); }
    const d = st.dur || +el.dataset.secs || 1;
    const bar = el.querySelector(".ch-prog i"); if(bar) bar.style.width = st.on ? Math.min(100, (st.time / d) * 100) + "%" : "0%";
    const t = el.querySelector(".ch-dur"); if(t) t.textContent = st.on && st.time > 0 ? mmss(st.time) : mmss(+el.dataset.secs);
  });
}
Player.subs.add(() => { if(C) playUi(); });

// ---- Reportar ----

// Un mensaje que me mandaron (los propios no). La persona sale del mensaje en la base; igual
// va la de la otra punta de la conversación.
function reportMsg(id){
  const c = C; if(!c) return;
  const m = (c.msgs || []).find(x => String(x.id) === id); if(!m || mine(m) || m.pending) return;
  const txt = String(m.body || "").replace(/\s+/g, " ").trim();
  const cita = m.audio_path ? "Mensaje de voz (" + mmss(m.audio_secs) + ")" + (txt ? ": " + txt : "") : txt;
  abrirReporte({ kind: "chat", ref: m.id, reported: c.role === "coach" ? c.clientId : c.coachId, titulo: "Reportar mensaje",
    cita: cita.length > 160 ? cita.slice(0, 159) + "…" : cita });
}

// ---- Dibujo ----

function hm(iso){ const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }); }
function ymd(iso){ const d = new Date(iso); return isNaN(d) ? "" : d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }

function bubble(m){
  const me = mine(m);
  const inner = m.audio_path
    ? '<div class="ch-audio" data-id="' + esc(String(m.id)) + '" data-path="' + esc(m.audio_path) + '" data-secs="' + (m.audio_secs || 0) + '">' +
        '<button class="ch-play" data-chat="play" data-id="' + esc(String(m.id)) + '" aria-label="Escuchar"' + (m.pending ? ' disabled' : '') + '>' + playSvg + '</button>' +
        '<span class="ch-prog"><i></i></span><span class="ch-dur">' + mmss(m.audio_secs) + '</span></div>' +
      (m.body ? '<div class="ch-txt">' + esc(m.body) + '</div>' : '')
    : '<div class="ch-txt">' + esc(m.body) + '</div>';
  const status = m.failed ? '<span class="ch-fail">' + esc(m.failed) + '</span>'
    : m.pending ? 'Enviando…'
    : hm(m.created_at) + (me ? (m.read_at ? ' · <span class="ch-seen">Visto</span>' : ' · Enviado')
      : '<button class="ch-more" data-chat="report" data-id="' + esc(String(m.id)) + '" aria-label="Reportar mensaje" title="Reportar mensaje">⋯</button>');
  return '<div class="ch-msg ' + (me ? 'me' : 'them') + (m.failed ? ' failed' : '') + '">' + inner + '<div class="ch-meta">' + status + '</div></div>';
}

function listHtml(){
  const c = C;
  if(c.msgs === null) return '<div class="ch-empty">Cargando…</div>';
  let out = "", last = "";
  (c.msgs || []).forEach(m => {
    const d = ymd(m.created_at);
    if(d && d !== last){ out += '<div class="ch-day">' + fmtDate(d) + '</div>'; last = d; }
    out += bubble(m);
  });
  if(!out){
    const first = String(c.name || "").split(" ")[0];
    out = '<div class="ch-empty">' + (c.role === "coach"
      ? 'Todavía no hay mensajes. Escribile a ' + esc(first || "tu alumno") + ' o mandale un audio.'
      : 'Escribile a tu coach cuando quieras: dudas del entreno, cómo te sentiste, lo que sea. También podés mandarle audios.') + '</div>';
  }
  return (c.error ? '<div class="ch-err">' + esc(c.error) + '</div>' : '') + out;
}

function barHtml(){
  const c = C;
  if(c.rec) return '<div class="ch-rec"><button class="ch-ic ch-cancel" data-chat="rec-cancel" aria-label="Descartar audio">' + trashSvg + '</button>' +
    '<span class="ch-rec-dot" aria-hidden="true"></span><span class="ch-rec-t" id="chatRecT">' + mmss((Date.now() - c.rec.t0) / 1000) + '</span><span class="ch-rec-l">Grabando… (máx. 2 min)</span>' +
    '<button class="ch-ic ch-send on" data-chat="rec-send" aria-label="Mandar audio">' + sendSvg + '</button></div>';
  const has = !!(c.draft || "").trim();
  return '<textarea id="chatText" class="ch-input" rows="1" maxlength="' + MAX_TXT + '" placeholder="Escribí un mensaje…" data-chat="text">' + esc(c.draft || "") + '</textarea>' +
    '<button class="ch-ic ch-send' + (has ? ' on' : '') + '" data-chat="' + (has ? 'send' : 'rec') + '" aria-label="' + (has ? 'Mandar' : 'Grabar audio') + '">' + (has ? sendSvg : micSvg) + '</button>';
}

function paint(toBottom){
  const c = C; if(!c) return;
  const h = host();
  let list = document.getElementById("chatList");
  if(!list){
    const sub = c.role === "coach" ? "Alumno" : "Tu coach";
    h.innerHTML = '<div class="ch-ov" role="dialog" aria-label="Chat">' +
      '<div class="ch-head"><button class="ch-back" data-chat="close" aria-label="Cerrar chat">‹</button>' +
      '<div class="ch-who"><div class="ch-name">' + esc(c.name || sub) + '</div><div class="ch-sub">' + sub + '</div></div></div>' +
      '<div class="ch-list" id="chatList"></div>' +
      '<div class="ch-bar" id="chatBar"></div></div>';
    list = document.getElementById("chatList");
    fitViewport();
    paintBar();
    toBottom = true;
  }
  const near = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  list.innerHTML = listHtml();
  playUi();
  if(toBottom || near) list.scrollTop = list.scrollHeight;
}

function paintBar(){
  const b = document.getElementById("chatBar"); if(!b || !C) return;
  b.innerHTML = barHtml();
  const t = document.getElementById("chatText"); if(t) grow(t);
}

function grow(t){ t.style.height = "auto"; t.style.height = Math.min(120, t.scrollHeight) + "px"; }

// El botón cambia entre micrófono y mandar sin redibujar la caja (no se pierde el foco).
function toggleSend(){
  const c = C; if(!c) return;
  const btn = document.querySelector("#chatBar .ch-send"); if(!btn) return;
  const has = !!(c.draft || "").trim();
  if(btn.dataset.chat === (has ? "send" : "rec")) return;
  btn.dataset.chat = has ? "send" : "rec";
  btn.classList.toggle("on", has);
  btn.setAttribute("aria-label", has ? "Mandar" : "Grabar audio");
  btn.innerHTML = has ? sendSvg : micSvg;
}

document.addEventListener("click", e => {
  if(!C) return;
  const b = e.target.closest("#chatHost [data-chat]"); if(!b || b.disabled) return;
  const a = b.dataset.chat;
  if(a === "close") closeChat();
  else if(a === "send") sendText();
  else if(a === "rec") startRec();
  else if(a === "rec-send") stopRec(false);
  else if(a === "rec-cancel") stopRec(true);
  else if(a === "play") playMsg(b.dataset.id);
  else if(a === "report") reportMsg(b.dataset.id);
});

document.addEventListener("input", e => {
  if(!C || e.target.id !== "chatText") return;
  C.draft = e.target.value; grow(e.target); toggleSend();
});

document.addEventListener("keydown", e => {
  if(!C) return;
  // En la compu, Enter manda y Shift+Enter hace otra línea. En el celular Enter es otra línea.
  if(e.target.id === "chatText" && e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window)){ e.preventDefault(); sendText(); }
  else if(e.key === "Escape" && !C.rec) closeChat();
});
