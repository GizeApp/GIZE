// Chat coach ↔ alumno, con mensajes de voz (supabase/chat.sql).
// Es una pantalla encima de todo (#chatHost) que se dibuja sola: no depende de renderApp ni
// de renderCoach, así lo que se está escribiendo o grabando no se pierde si la app se
// redibuja atrás. La usan el alumno (botón de la barra de arriba) y el coach (ficha del
// cliente). Mandar pasa por la función de mensajes, que guarda y le avisa al otro al
// celular; los audios se suben antes al bucket privado chat-audio.

import { State } from '../core/state.js';

import { esc, fmtDate } from '../core/utils.js';

const FN_NAMES = ["rapid-worker", "notificar-cliente"];
const MAX_TXT = 1000;
const MAX_SECS = 120;
const BUCKET = "chat-audio";

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

const mmss = s => { s = Math.max(0, Math.round(s || 0)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };

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
export async function openChat(o){
  if(C) closeChat(true);
  C = { clientId: o.clientId, coachId: o.coachId, name: o.name || "", role: o.role,
        msgs: null, error: "", draft: "", sending: 0, rec: null, urls: {}, chan: null, poll: null };
  document.body.classList.add("chat-open");
  history.pushState({ gizeChat: 1 }, "");
  paint();
  await load();
  listen();
}

export function closeChat(fromNav){
  if(!C) return;
  stopRec(true);
  stopAudio();
  if(C.chan) try{ State.sb.removeChannel(C.chan); }catch(e){}
  if(C.poll) clearInterval(C.poll);
  C = null;
  document.body.classList.remove("chat-open");
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
    const pending = (c.msgs || []).filter(m => m.pending);
    c.msgs = (r.data || []).reverse().map(norm).concat(pending);
    c.error = "";
    paint(true);
    markRead();
  }catch(e){ if(C === c){ c.error = "No se pudo cargar la conversación."; c.msgs = c.msgs || []; paint(); } }
}

// Mensajes viejos (antes del chat) no tienen sender: eran del coach.
function norm(m){ return Object.assign({}, m, { sender: m.sender || "coach", body: m.body || "" }); }

function mine(m){ return m.sender === (C.role === "coach" ? "coach" : "client"); }

function markRead(){
  const c = C; if(!c || document.visibilityState === "hidden") return;
  if(!(c.msgs || []).some(m => !mine(m) && !m.read_at)) return;
  (c.msgs || []).forEach(m => { if(!mine(m) && !m.read_at) m.read_at = new Date().toISOString(); });
  State.sb.rpc("chat_mark_read", { p_client: c.clientId }).then(() => refreshUnread()).catch(() => {});
}

document.addEventListener("visibilitychange", () => { if(C && document.visibilityState === "visible"){ load(); } });

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
        list.push(m);
        paint(true);
        markRead();
      })
      .subscribe();
  }catch(e){}
  c.poll = setInterval(() => {
    if(C !== c) return;
    const ok = c.chan && c.chan.state === "joined";
    if(!ok && document.visibilityState === "visible") load();
  }, 15000);
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

async function sendMsg(payload, local){
  const c = C; if(!c) return;
  local.pending = true; local.id = "tmp-" + Date.now() + Math.random().toString(36).slice(2, 6);
  (c.msgs || (c.msgs = [])).push(local);
  c.sending++; paint(true);
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
    local.pending = false; local.failed = e.message || "No se pudo mandar.";
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

function pickMime(){
  if(!window.MediaRecorder || !MediaRecorder.isTypeSupported) return "";
  // Primero mp4 (AAC): se escucha en iPhone y en Android. Si no, webm/opus.
  for(const t of ["audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]){
    if(MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

async function startRec(){
  const c = C; if(!c || c.rec) return;
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder){
    alert("Este navegador no permite grabar audio. Probá con Chrome o Safari actualizados."); return;
  }
  let stream;
  try{ stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch(e){ alert("Para mandar audios, permití el micrófono cuando te lo pida el celular (o en los ajustes del navegador)."); return; }
  if(C !== c){ stream.getTracks().forEach(t => t.stop()); return; }
  const mime = pickMime();
  let mr;
  try{ mr = new MediaRecorder(stream, Object.assign({ audioBitsPerSecond: 48000 }, mime ? { mimeType: mime } : {})); }
  catch(e){ try{ mr = new MediaRecorder(stream); }catch(e2){ stream.getTracks().forEach(t => t.stop()); alert("No se pudo grabar audio en este celular."); return; } }
  const rec = { mr, stream, chunks: [], t0: Date.now(), cancel: false, timer: null };
  c.rec = rec;
  mr.ondataavailable = e => { if(e.data && e.data.size) rec.chunks.push(e.data); };
  mr.onstop = () => {
    stream.getTracks().forEach(t => t.stop());
    clearInterval(rec.timer);
    if(C === c && c.rec === rec) c.rec = null;
    if(C === c) paintBar();
    if(rec.cancel) return;
    const secs = Math.max(1, Math.min(MAX_SECS, Math.round((Date.now() - rec.t0) / 1000)));
    const type = (mr.mimeType || mime || rec.chunks[0] && rec.chunks[0].type || "audio/webm").split(";")[0];
    const blob = new Blob(rec.chunks, { type: type });
    if(blob.size < 800) return; // se tocó sin querer
    uploadAndSend(c, blob, type, secs);
  };
  mr.start(1000);
  rec.timer = setInterval(() => {
    const s = (Date.now() - rec.t0) / 1000;
    const el = document.getElementById("chatRecT"); if(el) el.textContent = mmss(s);
    if(s >= MAX_SECS) stopRec(false);
  }, 250);
  paintBar();
}

function stopRec(cancel){
  const c = C; if(!c || !c.rec) return;
  c.rec.cancel = !!cancel;
  try{ if(c.rec.mr.state !== "inactive") c.rec.mr.stop(); else c.rec.stream.getTracks().forEach(t => t.stop()); }catch(e){}
}

function extFor(type){ return /mp4|m4a|aac/.test(type) ? (type.includes("aac") ? "aac" : "mp4") : type.includes("ogg") ? "ogg" : "webm"; }

async function uploadAndSend(c, blob, type, secs){
  const name = (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "") : Date.now().toString(36) + Math.random().toString(36).slice(2, 10)).slice(0, 32);
  const path = c.coachId + "/" + c.clientId + "/" + name + "." + extFor(type);
  const local = { sender: c.role === "coach" ? "coach" : "client", body: "", audio_path: path, audio_secs: secs, created_at: new Date().toISOString(), localUrl: URL.createObjectURL(blob) };
  local.pending = true; local.id = "tmp-" + name;
  (c.msgs || (c.msgs = [])).push(local);
  c.sending++; if(C === c) paint(true);
  const up = await State.sb.storage.from(BUCKET).upload(path, blob, { contentType: type, upsert: false }).catch(e => ({ error: e }));
  c.sending--;
  c.msgs = c.msgs.filter(m => m !== local);
  if(up.error){
    local.pending = false; local.failed = "No se pudo subir el audio. Revisá la conexión.";
    c.msgs.push(local); if(C === c) paint(); return;
  }
  sendMsg({ audio_path: path, audio_secs: secs }, local);
}

// ---- Escuchar ----

let player = null, playingId = null;

function stopAudio(){ if(player){ try{ player.pause(); }catch(e){} } playingId = null; }

async function audioUrl(m){
  if(m.localUrl) return m.localUrl;
  if(C.urls[m.audio_path]) return C.urls[m.audio_path];
  const r = await State.sb.storage.from(BUCKET).createSignedUrl(m.audio_path, 3600);
  if(r.error || !r.data) throw new Error("no url");
  return (C.urls[m.audio_path] = r.data.signedUrl);
}

async function togglePlay(id){
  const c = C; if(!c) return;
  const m = (c.msgs || []).find(x => String(x.id) === id); if(!m) return;
  if(playingId === id && player && !player.paused){ player.pause(); return; }
  stopAudio();
  let url;
  try{ url = await audioUrl(m); }catch(e){ alert("No se pudo cargar el audio. Revisá la conexión."); return; }
  if(!player){
    player = new Audio();
    player.addEventListener("timeupdate", playUi);
    player.addEventListener("pause", playUi);
    player.addEventListener("play", playUi);
    player.addEventListener("ended", () => { playingId = null; playUi(); });
    player.addEventListener("error", () => { if(playingId){ playingId = null; playUi(); alert("Este audio no se puede escuchar en este celular."); } });
  }
  playingId = id;
  player.src = url;
  player.play().catch(() => {});
  playUi();
}

function playUi(){
  document.querySelectorAll("#chatHost .ch-audio").forEach(el => {
    const on = el.dataset.id === playingId;
    const playing = on && player && !player.paused;
    const b = el.querySelector(".ch-play"); if(b){ b.innerHTML = playing ? pauseSvg : playSvg; b.setAttribute("aria-label", playing ? "Pausar" : "Escuchar"); }
    const bar = el.querySelector(".ch-prog i");
    const d = on && player && isFinite(player.duration) && player.duration > 0 ? player.duration : +el.dataset.secs || 1;
    if(bar) bar.style.width = on && player ? Math.min(100, (player.currentTime / d) * 100) + "%" : "0%";
    const t = el.querySelector(".ch-dur"); if(t) t.textContent = on && player && player.currentTime > 0 ? mmss(player.currentTime) : mmss(+el.dataset.secs);
  });
}

// ---- Dibujo ----

function hm(iso){ const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }); }
function ymd(iso){ const d = new Date(iso); return isNaN(d) ? "" : d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }

function bubble(m){
  const me = mine(m);
  const inner = m.audio_path
    ? '<div class="ch-audio" data-id="' + esc(String(m.id)) + '" data-secs="' + (m.audio_secs || 0) + '">' +
        '<button class="ch-play" data-chat="play" data-id="' + esc(String(m.id)) + '" aria-label="Escuchar"' + (m.pending ? ' disabled' : '') + '>' + playSvg + '</button>' +
        '<span class="ch-prog"><i></i></span><span class="ch-dur">' + mmss(m.audio_secs) + '</span></div>' +
      (m.body ? '<div class="ch-txt">' + esc(m.body) + '</div>' : '')
    : '<div class="ch-txt">' + esc(m.body) + '</div>';
  const status = m.failed ? '<span class="ch-fail">' + esc(m.failed) + '</span>'
    : m.pending ? 'Enviando…'
    : hm(m.created_at) + (me ? (m.read_at ? ' · <span class="ch-seen">Visto</span>' : ' · Enviado') : '');
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
  else if(a === "play") togglePlay(b.dataset.id);
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
