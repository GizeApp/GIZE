// Pasos automáticos desde Salud (iPhone) y Health Connect (Android), solo en la app de la tienda.
// El iPhone y Android cuentan los pasos todo el día aunque GIZE esté cerrada: cada vez que la app
// se abre o vuelve a primer plano, se leen los últimos días y se suben (daily_logs.steps, ver
// queueSteps en supabase.js). Solo LEE pasos; no escribe nada en el celular.
// Cuántos días: la primera lectura de cada día (y la primera al conectar) trae 31 días, para el
// «Promedio del mes» de Cardio (core/pasosdia.js); las siguientes del mismo día, al volver a la
// app, solo los últimos 8 (más livianas: los días viejos ya no cambian).
//
// Usa el plugin @capgo/capacitor-health (window.Capacitor.Plugins.Health). Si la app instalada no
// lo trae, todo esto queda apagado. Los pasos no se anotan a mano en ningún lado (pedido): en la
// web se ven los que subió la app del celular.
//
// - Hoy: lo que dice Salud es el número del día (state.steps), suba o baje.
// - Días anteriores: se guardan en el registro del día (state.daily[fecha].steps, aunque ese día
//   no tenga registro: es lo mismo que queda en daily_logs) y se suben si son más de lo que ya
//   había.
// - Varias apps pueden contar los mismos pasos (el celular, el reloj, Samsung Health…): por día
//   se toma la fuente que más contó, en vez de sumarlas.
//
// Se prende desde Cardio → «Pasos» o «Competencia de pasos» (con el permiso del sistema) y queda
// prendido en este celular para esta cuenta.
//
// Los envíos no se esperan: lo leído queda guardado acá al momento y la cola (queueSteps) los
// manda y reintenta sola. Si no, la primera lectura (hasta 31 días, un envío por día, uno detrás
// de otro) dejaba «Conectando…» / «Actualizando…» y los números viejos varios segundos.
// onChange(fase): sin fase al empezar y al terminar la lectura; "subiendo" si al terminar quedan
// envíos en camino y "subido" cuando salieron (para volver a leer el ranking con lo nuevo).

import { State, state } from './state.js';
import { save } from './storage.js';
import { today, ymd } from './utils.js';
import { noteStepsSynced, queueSteps } from './supabase.js';

export const DIAS_SALUD = 8;
export const DIAS_SALUD_MES = 31;
const MIN_GAP = 60 * 1000;

// connecting: «Conectar» tocado y todavía pidiendo el permiso (el botón dice «Conectando…»).
export const SaludState = { busy: false, connecting: false, lastSync: 0, lastTry: 0, lastError: "", onChange: null };

function plugin(){
  try {
    const C = window.Capacitor;
    return (C && C.isNativePlatform && C.isNativePlatform() && C.Plugins && C.Plugins.Health) || null;
  } catch (e) { return null; }
}
export function plataforma(){ try { return window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() ? window.Capacitor.getPlatform() : "web"; } catch (e) { return "web"; } }

// ¿Se puede ofrecer en este celular? (app nativa con el plugin)
export function saludDisponible(){ return !!plugin(); }
export function saludNombre(){ return plataforma() === "ios" ? "Salud de Apple" : "Health Connect"; }
// Qué revisar si la última lectura falló (le sacaron el permiso a GIZE, Health Connect sin
// instalar o sin actualizar…): si no se decía, quedaba «Conectado» y los pasos no subían más.
export function saludError(){
  if (!SaludState.lastError) return "";
  return plataforma() === "android"
    ? "No se pudieron leer tus pasos. Revisá que GIZE tenga permiso en Health Connect → Permisos de apps → GIZE y que Health Connect esté instalada y actualizada. Si sigue igual, tocá «Desconectar» y volvé a conectar."
    : "No se pudieron leer tus pasos de Salud de Apple. Probá de nuevo con «Actualizar ahora» y, si sigue igual, tocá «Desconectar» y volvé a conectar.";
}

const keyOn = () => "gize_salud_" + ((State.cloudUser && State.cloudUser.id) || "local");
const keySent = () => "gize_salud_sent_" + ((State.cloudUser && State.cloudUser.id) || "local");
// Fecha de la última lectura de 31 días (una por día).
const keyMes = () => "gize_salud_mes_" + ((State.cloudUser && State.cloudUser.id) || "local");
function mesLeido(){ try { return localStorage.getItem(keyMes()) === today(); } catch (e) { return false; } }
function marcarMes(){ try { localStorage.setItem(keyMes(), today()); } catch (e) {} }
export function saludPrendida(){ try { return saludDisponible() && localStorage.getItem(keyOn()) === "1"; } catch (e) { return false; } }
function setOn(v){ try { if (v) localStorage.setItem(keyOn(), "1"); else localStorage.removeItem(keyOn()); } catch (e) {} }
// Pasos por día ya mandados (para no repetir envíos iguales).
function readSent(){ try { return JSON.parse(localStorage.getItem(keySent()) || "{}") || {}; } catch (e) { return {}; } }
function writeSent(o){
  const cut = ymd(new Date(Date.now() - 40 * 864e5));
  Object.keys(o).forEach(d => { if (d < cut) delete o[d]; });
  try { localStorage.setItem(keySent(), JSON.stringify(o)); } catch (e) {}
}
function changed(fase){ if (SaludState.onChange) try { SaludState.onChange(fase); } catch (e) {} }

// Medianoche (hora del celular) de hace n días.
function dayStart(n){ const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - n); return d; }

// Fuente de un registro. Los pasos que cuenta el propio celular en Health Connect vienen como
// "android" o "com.android.healthconnect.phone.<algo>": son la misma.
function srcKey(s){
  const id = String((s && (s.sourceId || s.sourceName)) || "?");
  return (id === "android" || id.indexOf("com.android.healthconnect.phone") === 0) ? "celular" : id;
}

// Pasos por día: por cada fuente se suma lo del día y se queda la que más contó.
export function stepsPerDay(samples){
  const bySrc = {};
  (samples || []).forEach(s => {
    const v = Number(s && s.value); if (!(v > 0)) return;
    const t = new Date(s.startDate); if (isNaN(t)) return;
    const k = ymd(t) + "|" + srcKey(s);
    bySrc[k] = (bySrc[k] || 0) + v;
  });
  const out = {};
  Object.keys(bySrc).forEach(k => { const d = k.split("|")[0]; out[d] = Math.max(out[d] || 0, Math.round(bySrc[k])); });
  return out;
}

// Trae los pasos de los últimos días y sube lo nuevo. force: sin esperar el minuto entre lecturas.
// Devuelve true si cambió algo.
export async function syncSalud(force){
  const H = plugin();
  if (!H || !saludPrendida() || SaludState.busy || !State.cloudUser || State.cloudLoading) return false;
  if (!force && Date.now() - SaludState.lastTry < MIN_GAP) return false;
  SaludState.lastTry = Date.now();
  SaludState.busy = true; changed();
  let touched = false;
  const envios = [];
  const dias = mesLeido() ? DIAS_SALUD : DIAS_SALUD_MES;
  try {
    const r = await H.readSamples({ dataType: "steps", startDate: dayStart(dias - 1).toISOString(), endDate: new Date().toISOString(), limit: 0, ascending: true });
    const per = stepsPerDay((r && r.samples) || []);
    const sent = readSent(), t = today();
    Object.keys(per).forEach(d => {
      const n = per[d];
      if (d === t){
        if (state.stepsDate !== t) return;
        // Manda Salud, aunque baje (Health Connect a veces corrige): no hay pasos a mano que
        // respetar.
        if (n !== (state.steps || 0)){
          state.steps = n; sent[t] = n; touched = true;
          noteStepsSynced(n); envios.push(queueSteps(t, n));
        }
      } else if (d < t){
        const known = parseInt(state.daily && state.daily[d] && state.daily[d].steps) || 0;
        if (n > known){
          if (!state.daily || typeof state.daily !== "object") state.daily = {};
          state.daily[d] = Object.assign({}, state.daily[d] || {}, { steps: String(n) });
          touched = true;
          if (n !== sent[d]){ sent[d] = n; envios.push(queueSteps(d, n)); }
        }
      }
    });
    writeSent(sent);
    if (dias === DIAS_SALUD_MES) marcarMes();
    SaludState.lastSync = Date.now(); SaludState.lastError = "";
    if (touched) save();
  } catch (e) {
    SaludState.lastError = (e && e.message) || String(e);
    console.warn("salud", e);
  } finally {
    SaludState.busy = false; changed(envios.length ? "subiendo" : undefined);
  }
  if (envios.length) Promise.all(envios).catch(() => {}).then(() => changed("subido"));
  return touched || envios.length > 0;
}

// Prender: disponibilidad → permiso → primera lectura. Devuelve "" si quedó prendido o el mensaje
// para mostrar.
export async function prenderSalud(){
  const H = plugin(); if (!H) return "Esto funciona en la app de GIZE para Android o iPhone.";
  const name = saludNombre();
  let av;
  try { av = await H.isAvailable(); } catch (e) { av = { available: false }; }
  if (!av || !av.available){
    return plataforma() === "android"
      ? "Para traer tus pasos necesitás Health Connect, la app de salud de Google (Android 9 o más nuevo). Instalala o actualizala desde Play Store y probá de nuevo."
      : "Este dispositivo no tiene " + name + ".";
  }
  if (!confirm("GIZE va a leer tus pasos de " + name + " para tu registro y tus grupos de pasos (tus amigos ven solo el total de la semana). Solo se leen: no se cambia nada en " + name + ". ¿Activar?")) return "__silent";
  try {
    const r = await H.requestAuthorization({ read: ["steps"], write: [] });
    // En Android se sabe qué permitió. En iPhone Apple nunca dice si dio permiso de lectura.
    if (plataforma() === "android"){
      const ok = (r && r.readAuthorized) || [];
      if (!ok.length) return "No diste permiso. Podés darlo cuando quieras desde Health Connect → Permisos de apps → GIZE.";
    }
  } catch (e) {
    return "No se pudo pedir el permiso: " + ((e && e.message) || e);
  }
  setOn(true);
  await syncSalud(true);
  return "";
}

// Apagar deja de leer. El permiso se quita desde el sistema (la app no puede sacárselo sola).
export function apagarSalud(){
  setOn(false); SaludState.lastSync = 0; changed();
  return plataforma() === "ios"
    ? "Listo, ya no se leen tus pasos. Si también querés quitarle el permiso a GIZE: app Salud → tu foto → Apps → GIZE."
    : "Listo, ya no se leen tus pasos. Si también querés quitarle el permiso a GIZE: Health Connect → Permisos de apps → GIZE.";
}

// Lecturas automáticas: al entrar (después de leer la nube) y cada vez que la app vuelve a primer
// plano (el iPhone y Android siguieron contando con la app cerrada).
window.addEventListener("gize:login", () => { if (saludPrendida()) syncSalud(true); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && saludPrendida() && State.cloudUser) syncSalud(false); });
