// Pasos y peso automáticos desde Health Connect (Android) y Salud (iPhone), solo en la app
// de la tienda: el plugin @capgo/capacitor-health no existe en la web. Solo LEE pasos y
// peso; no escribe nada en el celular.
//
// - Pasos de hoy: van a state.steps (el anillo de Hábitos), salvo que lo cargado a mano sea
//   más (una caminata sin el celular). Los de los 7 días anteriores van a la nube por la
//   cola ("steps", ver supabase.js) si son más de lo que ya había.
// - Peso: los últimos 30 días; solo se suman las fechas que no tienen peso. Lo cargado a
//   mano manda y un peso importado que el usuario borró no vuelve.
// - Varias apps pueden contar los mismos pasos (el celular, el reloj, Samsung Health…):
//   por día se toma la fuente que más contó, en vez de sumarlas.
//
// Se activa en Ajustes → "Pasos y peso automáticos" y queda prendido en este celular.

import { State, state } from './state.js';
import { save } from './storage.js';
import { today, uid, ymd } from './utils.js';
import { queueSteps } from './supabase.js';

const HC_PLAY = "https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata";
const STEP_DAYS = 7, WEIGHT_DAYS = 30, MIN_GAP = 60 * 1000;

export const SaludState = { busy: false, lastSync: 0, lastTry: 0, lastError: "", onChange: null };

function plugin(){
  try{
    const C = window.Capacitor;
    return (C && C.isNativePlatform && C.isNativePlatform() && C.Plugins && C.Plugins.Health) || null;
  }catch(e){ return null; }
}
function platform(){ try{ return window.Capacitor.getPlatform(); }catch(e){ return "web"; } }

// ¿Se puede ofrecer en este dispositivo? (app nativa con el plugin)
export function saludSupported(){ return !!plugin(); }
export function saludName(){ return platform() === "ios" ? "Salud de Apple" : "Health Connect"; }

const keyOn = () => "gize_salud_" + ((State.cloudUser && State.cloudUser.id) || "local");
const keySent = () => "gize_salud_sent_" + ((State.cloudUser && State.cloudUser.id) || "local");
export function saludOn(){ try{ return saludSupported() && localStorage.getItem(keyOn()) === "1"; }catch(e){ return false; } }
function setOn(v){ try{ if(v) localStorage.setItem(keyOn(), "1"); else localStorage.removeItem(keyOn()); }catch(e){} }
// Lo último que se trajo: pasos por día ya mandados y pesos ya importados (para no
// reimportar uno que el usuario borró).
function readSent(){ try{ const o = JSON.parse(localStorage.getItem(keySent()) || "{}"); return { s: o.s || {}, w: o.w || {}, t: o.t || null }; }catch(e){ return { s: {}, w: {}, t: null }; } }
function writeSent(o){
  // Solo lo reciente: lo viejo ya no se vuelve a leer.
  const cut = ymd(new Date(Date.now() - 60 * 864e5));
  ["s", "w"].forEach(k => Object.keys(o[k]).forEach(d => { if(d < cut) delete o[k][d]; }));
  try{ localStorage.setItem(keySent(), JSON.stringify(o)); }catch(e){}
}

function changed(){ if(SaludState.onChange) try{ SaludState.onChange(); }catch(e){} }

// Medianoche (hora del celular) de hace n días.
function dayStart(n){ const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - n); return d; }

// Pasos por día: por cada fuente se suma lo del día y se queda la que más contó.
export function stepsPerDay(samples){
  const bySrc = {};
  (samples || []).forEach(s => {
    const v = Number(s && s.value); if(!(v > 0)) return;
    const t = new Date(s.startDate); if(isNaN(t)) return;
    const d = ymd(t), src = String(s.sourceId || s.sourceName || "?");
    const k = d + "|" + src;
    bySrc[k] = (bySrc[k] || 0) + v;
  });
  const out = {};
  Object.keys(bySrc).forEach(k => { const d = k.split("|")[0]; out[d] = Math.max(out[d] || 0, Math.round(bySrc[k])); });
  return out;
}

// Peso por día: el último del día, redondeado a 0,1 kg (valores razonables).
export function weightPerDay(samples){
  const last = {};
  (samples || []).forEach(s => {
    const kg = Number(s && s.value); if(!(kg >= 20 && kg <= 400)) return;
    const t = new Date(s.startDate); if(isNaN(t)) return;
    const d = ymd(t);
    if(!last[d] || t > last[d].t) last[d] = { t, kg: Math.round(kg * 10) / 10 };
  });
  const out = {}; Object.keys(last).forEach(d => { out[d] = last[d].kg; }); return out;
}

async function read(H, dataType, from){
  const r = await H.readSamples({ dataType, startDate: from.toISOString(), endDate: new Date().toISOString(), limit: 0, ascending: true });
  return (r && r.samples) || [];
}

// Trae pasos y peso. force: sin esperar el minuto entre lecturas.
export async function syncSalud(force){
  const H = plugin();
  if(!H || !saludOn() || SaludState.busy) return false;
  // Entre lecturas automáticas pasa al menos un minuto (también si la anterior falló).
  if(!force && Date.now() - SaludState.lastTry < MIN_GAP) return false;
  SaludState.lastTry = Date.now();
  SaludState.busy = true; changed();
  let touched = false;
  try{
    const sent = readSent();
    const t = today();

    let stepSamples = null, weightSamples = null, errs = [];
    try{ stepSamples = await read(H, "steps", dayStart(STEP_DAYS)); }catch(e){ errs.push(e); }
    try{ weightSamples = await read(H, "weight", dayStart(WEIGHT_DAYS)); }catch(e){ errs.push(e); }
    if(stepSamples === null && weightSamples === null) throw errs[0] || new Error("sin datos");

    if(stepSamples){
      const per = stepsPerDay(stepSamples);
      Object.keys(per).forEach(d => {
        const n = per[d];
        if(d === t){
          // Hoy: si lo cargado a mano es más, se respeta; si lo último lo puso esta
          // función, se actualiza aunque baje (Health Connect a veces corrige).
          if(state.stepsDate !== t) return;
          const cur = state.steps || 0, mine = sent.s[t];
          if(n > cur || (mine != null && cur === mine && n !== cur)){ state.steps = n; sent.s[t] = n; touched = true; }
          else if(n === cur) sent.s[t] = n;
        } else if(d < t){
          // Lo que ya había de ese día: en la nube (registro diario) o lo que quedó en el
          // celular al cambiar de día (stepsLog, ver checkDaily en Hábitos).
          const known = Math.max(parseInt(state.daily && state.daily[d] && state.daily[d].steps) || 0,
                                 (state.stepsLog && state.stepsLog[d]) || 0);
          if(n > known && n !== sent.s[d]){ queueSteps(d, n); if(state.daily && state.daily[d]) state.daily[d].steps = String(n); sent.s[d] = n; }
        }
      });
    }

    if(weightSamples){
      const per = weightPerDay(weightSamples);
      state.weights = state.weights || [];
      Object.keys(per).forEach(d => {
        if(d > t || sent.w[d] != null) return;
        if(state.weights.some(w => w.date === d)){ sent.w[d] = per[d]; return; }
        state.weights.push({ id: uid(), date: d, kg: per[d] });
        sent.w[d] = per[d]; touched = true;
      });
      if(touched) state.weights.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    }

    sent.t = Date.now();
    writeSent(sent);
    SaludState.lastSync = Date.now(); SaludState.lastError = errs.length ? "parcial" : "";
    if(touched) save();
  }catch(e){
    SaludState.lastError = (e && e.message) || String(e);
    console.warn("salud", e);
  }finally{
    SaludState.busy = false; changed();
  }
  return touched;
}

export function lastSyncTime(){ const t = SaludState.lastSync || readSent().t; return t ? new Date(t) : null; }

// Prender desde Ajustes: disponibilidad → permiso → primera lectura. Devuelve "" si quedó
// prendido o el mensaje para mostrar.
export async function enableSalud(){
  const H = plugin(); if(!H) return "Esto funciona en la app de GIZE para Android o iPhone.";
  const name = saludName();
  let av;
  try{ av = await H.isAvailable(); }catch(e){ av = { available: false, reason: (e && e.message) || "" }; }
  if(!av || !av.available){
    if(platform() === "android"){
      const upd = /update/i.test((av && av.reason) || "");
      if(confirm((upd ? "Hay que actualizar Health Connect" : "Para traer tus pasos y tu peso necesitás Health Connect, la app de salud de Google") + ". ¿Abrir Play Store?")){
        try{ window.open(HC_PLAY, "_blank"); }catch(e){}
      }
      return "__silent";
    }
    return "Este dispositivo no tiene " + name + ".";
  }
  try{
    const r = await H.requestAuthorization({ read: ["steps", "weight"], write: [] });
    // En Android se sabe qué permitió. En iPhone Apple nunca dice si dio permiso de lectura:
    // se prende igual y, si no llega nada, se avisa abajo.
    if(platform() === "android"){
      const ok = (r && r.readAuthorized) || [];
      if(!ok.length) return "No diste permiso. Podés darlo cuando quieras desde Health Connect → Permisos de apps → GIZE.";
    }
  }catch(e){
    return "No se pudo pedir el permiso: " + ((e && e.message) || e);
  }
  setOn(true);
  await syncSalud(true);
  return "";
}

export function disableSalud(){ setOn(false); SaludState.lastSync = 0; changed(); }

// ¿Qué permisos quedaron? (para el texto de Ajustes; en iPhone no se puede saber).
export async function saludPermisos(){
  const H = plugin(); if(!H || platform() !== "android") return null;
  try{ const r = await H.checkAuthorization({ read: ["steps", "weight"], write: [] }); return (r && r.readAuthorized) || []; }catch(e){ return null; }
}

// Lecturas automáticas: al entrar y al volver a la app.
window.addEventListener("gize:login", () => { if(saludOn()) syncSalud(true); });
document.addEventListener("visibilitychange", () => { if(document.visibilityState === "visible" && saludOn() && State.cloudUser) syncSalud(false); });
