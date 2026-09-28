// Grabar y escuchar audios: lo comparten el chat (app/ui/chat.js) y las explicaciones de
// voz del coach en cada ejercicio. Los audios viven en el bucket privado chat-audio y se
// escuchan con links firmados (supabase/chat.sql y supabase/ejercicio-audio.sql).

import { State } from '../core/state.js';

export const AUDIO_BUCKET = "chat-audio";

export const mmss = s => { s = Math.max(0, Math.round(s || 0)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };

function pickMime(){
  if(!window.MediaRecorder || !MediaRecorder.isTypeSupported) return "";
  // Primero mp4 con AAC: se escucha en iPhone y en Android. Si el equipo no graba AAC, webm
  // con opus (en iPhone viejos no se escucha, pero es lo único que graba ese equipo). El
  // "audio/mp4" a secas va después: en Chrome/Android es mp4 con opus adentro, que el
  // iPhone no reproduce; en iPhone (sin webm hasta iOS 18.4) es AAC.
  for(const t of ["audio/mp4;codecs=mp4a.40.2", "audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"]){
    if(MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

export function extFor(type){ return /mp4|m4a|aac/.test(type) ? (type.includes("aac") ? "aac" : "mp4") : type.includes("ogg") ? "ogg" : "webm"; }

export function newAudioName(){
  return (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "") : Date.now().toString(36) + Math.random().toString(36).slice(2, 10)).slice(0, 32);
}

// Empieza a grabar. Devuelve { stop(cancel), t0 } o null si no se pudo (ya avisó).
// onDone(blob, type, secs) solo se llama si no se canceló y el audio no está vacío.
export async function startRecorder(o){
  const maxSecs = o.maxSecs || 120;
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder){
    alert("Este navegador no permite grabar audio. Probá con Chrome o Safari actualizados."); return null;
  }
  let stream;
  try{ stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch(e){ alert("Para grabar audios, permití el micrófono cuando te lo pida el celular (o en los ajustes del navegador)."); return null; }
  if(o.stillWanted && !o.stillWanted()){ stream.getTracks().forEach(t => t.stop()); return null; }
  const mime = pickMime();
  let mr;
  try{ mr = new MediaRecorder(stream, Object.assign({ audioBitsPerSecond: 48000 }, mime ? { mimeType: mime } : {})); }
  catch(e){ try{ mr = new MediaRecorder(stream); }catch(e2){ stream.getTracks().forEach(t => t.stop()); alert("No se pudo grabar audio en este celular."); return null; } }
  const rec = { t0: Date.now(), cancel: false, chunks: [], timer: null };
  mr.ondataavailable = e => { if(e.data && e.data.size) rec.chunks.push(e.data); };
  mr.onstop = () => {
    stream.getTracks().forEach(t => t.stop());
    clearInterval(rec.timer);
    if(o.onEnd) o.onEnd();
    if(rec.cancel) return;
    const secs = Math.max(1, Math.min(maxSecs, Math.round((Date.now() - rec.t0) / 1000)));
    const type = (mr.mimeType || mime || (rec.chunks[0] && rec.chunks[0].type) || "audio/webm").split(";")[0];
    const blob = new Blob(rec.chunks, { type: type });
    if(blob.size < 800) return; // se tocó sin querer
    o.onDone(blob, type, secs);
  };
  rec.stop = cancel => {
    rec.cancel = !!cancel;
    try{ if(mr.state !== "inactive") mr.stop(); else stream.getTracks().forEach(t => t.stop()); }catch(e){}
  };
  mr.start(1000);
  _active.add(rec);
  const _end = rec.stop;
  rec.stop = cancel => { _active.delete(rec); _end(cancel); };
  rec.timer = setInterval(() => {
    const s = (Date.now() - rec.t0) / 1000;
    if(o.onTick) o.onTick(s);
    if(s >= maxSecs) rec.stop(false);
  }, 250);
  return rec;
}

// Si la app pasa a segundo plano mientras graba, Android corta el micrófono (y el audio
// quedaría mudo desde ahí): se descarta la grabación y se avisa al volver.
const _active = new Set();
let _cutWhileHidden = false;
document.addEventListener("visibilitychange", () => {
  if(document.visibilityState === "hidden" && _active.size){
    _active.forEach(r => r.stop(true));
    _cutWhileHidden = true;
  } else if(document.visibilityState === "visible" && _cutWhileHidden){
    _cutWhileHidden = false;
    setTimeout(() => alert("La grabación se cortó porque saliste de la app. Grabala de nuevo."), 300);
  }
});

export async function uploadAudio(path, blob, type){
  const up = await State.sb.storage.from(AUDIO_BUCKET).upload(path, blob, { contentType: type, upsert: false }).catch(e => ({ error: e }));
  return !up.error;
}

// ---- Escuchar: un solo reproductor para toda la app ----

const urls = {};
let player = null;
// subs: funciones que redibujan sus botones de play (chat, ejercicios).
export const Player = { key: null, subs: new Set() };

export async function signedAudioUrl(path){
  if(urls[path] && urls[path].exp > Date.now()) return urls[path].url;
  const r = await State.sb.storage.from(AUDIO_BUCKET).createSignedUrl(path, 3600);
  if(r.error || !r.data) throw new Error("no url");
  urls[path] = { url: r.data.signedUrl, exp: Date.now() + 50 * 60 * 1000 };
  return r.data.signedUrl;
}

function ui(){ Player.subs.forEach(f => { try{ f(); }catch(e){} }); }

export function stopAudio(){ if(player){ try{ player.pause(); }catch(e){} } Player.key = null; ui(); }

export function audioState(key){
  const on = !!player && Player.key === key;
  return { on, playing: on && !player.paused, time: on ? player.currentTime : 0, dur: on && isFinite(player.duration) ? player.duration : 0 };
}

// key: identifica el botón (id del mensaje, ruta del audio…). getUrl: función que da el link.
export async function togglePlay(key, getUrl){
  if(Player.key === key && player && !player.paused){ player.pause(); return; }
  if(Player.key === key && player && player.paused && player.src){ player.play().catch(() => {}); return; }
  if(player){ try{ player.pause(); }catch(e){} }
  let url;
  try{ url = await getUrl(); }catch(e){ alert("No se pudo cargar el audio. Revisá la conexión."); return; }
  if(!player){
    player = new Audio();
    ["timeupdate", "pause", "play"].forEach(ev => player.addEventListener(ev, ui));
    player.addEventListener("ended", () => { Player.key = null; ui(); });
    player.addEventListener("error", () => { if(Player.key){ Player.key = null; ui(); alert("Este audio no se puede escuchar en este celular."); } });
  }
  Player.key = key;
  player.src = url;
  player.play().catch(() => {});
  ui();
}
