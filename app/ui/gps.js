// Salidas de Cardio «A pie» / «En bici»: el GPS y la salida en curso. Las cuentas están en
// core/cardiogps.js (motor puro: filtro, tramos, calorías) y la pantalla en screens/cardio.js.
//
// · App nativa: plugin @capacitor-community/background-geolocation. Con backgroundMessage el
//   plugin arranca en Android un servicio en primer plano con la notificación «Salida a pie en
//   curso» (o «en bici»): sigue midiendo con la pantalla apagada o el celular en el bolsillo sin
//   pedir la ubicación «todo el tiempo». En iPhone usa el modo de fondo "location" (Info.plist).
//   En Android los permisos se piden ANTES de addWatcher (ver androidLocation).
// · Web: navigator.geolocation.watchPosition + la pantalla prendida (wakeLock) mientras corre.
//   Con la pantalla apagada o la pestaña oculta los navegadores dejan de mandar la ubicación:
//   la pantalla lo avisa (TEXTS.webLimit) y el motor marca ese hueco al volver.
//
// La salida en curso (con TODOS sus puntos, para el mapa) se guarda en el celular: una cabecera
// (RUN_KEY) y los puntos en partes de 400 (RUN_KEY_c0, _c1…). Una parte llena se escribe una sola
// vez; solo se reescribe la última. Se escribe como mucho cada 5 s o cada 20 puntos, y en el acto
// al empezar, pausar, seguir, terminar o irse la app a segundo plano. Al abrir la app se retoma
// sola (en el celular vuelve a enganchar el GPS en el acto).
// Con la app en segundo plano (ui/pausa.js) NO se deja de medir: solo se guarda y no se le avisa
// a la pantalla (no se dibuja nada hasta volver).
//
// Nombres nuevos a propósito (gize_salida_v1…): lo de la versión anterior con GPS
// (gize_cardio_run) lo sigue borrando core/state.js en los celulares viejos.
import { State, state } from '../core/state.js';
import { MODES, addPoint, endRun, gpsTime, isAccepted, lastPoint, lastWeight, liveStats, modeOk, newRun, pauseRun, resumeRun } from '../core/cardiogps.js';
import { appAway, onAwayChange } from './pausa.js';

export const RUN_KEY = "gize_salida_v1";
const CHUNK = 400;                       // puntos por parte guardada
const SAVE_MS = 5000, SAVE_PTS = 20;     // guardar como mucho cada 5 s o cada 20 puntos nuevos
const ASK_KEY = "gize_salida_aviso";     // ya vio el aviso «Usar tu ubicación»
const STALE_MS = 6 * 3600000;            // sin puntos hace más de esto: la salida se termina sola
const MAX_RUN_MS = 12 * 3600000;         // ni una salida de más de 12 h
const RETRY_MS = 500, RETRIES = 10;      // «Service not running.»: el servicio todavía no se enlazó
const SETTLE_MS = 600;                   // sin error en este rato, el GPS nativo quedó enganchado
const MAX_CHUNKS = 400;                  // tope al leer partes (30.000 puntos son 75)

export const TEXTS = {
  notifTitle: { pie: "Salida a pie en curso", bici: "Salida en bici en curso" },
  notifMsg: "GIZE está midiendo tu salida. Tocá para volver.",
  webLimit: "En el navegador, GIZE mide la salida solo con la pantalla prendida y la app abierta.",
  nativeTip: "Podés bloquear el celular y guardarlo: GIZE sigue midiendo. No cierres GIZE desde las apps recientes.",
  noSignal: "No llega la señal del GPS. El tiempo sigue contando.",
  quota: "El celular se quedó sin espacio para guardar la salida en curso: no cierres GIZE hasta terminarla.",
  permAndroid: "GIZE no tiene permiso para usar tu ubicación precisa, así que no puede medir la salida.",
  permIos: "GIZE no tiene permiso para usar tu ubicación, así que no puede medir la salida. Permitilo en Ajustes › GIZE › Ubicación.",
  permWeb: "GIZE no tiene permiso para usar tu ubicación. Permitilo en los ajustes del navegador.",
  locOff: "La ubicación del celular está apagada. Prendela para medir la salida.",
  noGpsWeb: "Este navegador no puede usar la ubicación, así que no puede medir la salida.",
  noGpsNative: "No se pudo usar el GPS del celular, así que no puede medir la salida.",
  service: "No se pudo arrancar el GPS del celular. Cerrá GIZE, volvé a abrirla y probá de nuevo.",
};

// Aviso propio antes del permiso del sistema (Google Play lo pide para la ubicación): qué se usa,
// cuándo y quién ve el recorrido. Se muestra la primera vez que se toca «Empezar».
export function disclosure(){
  return {
    title: "Usar tu ubicación",
    text: isNative()
      ? "Para medir tu salida, GIZE usa la ubicación de tu celular mientras la salida está en curso, también con la pantalla apagada o el celular en el bolsillo (en Android vas a ver una notificación de GIZE). Cuando terminás, deja de usarla. Tu recorrido lo ven solo vos y tu coach."
      : "Para medir tu salida, GIZE usa la ubicación de tu celular mientras la salida está en curso. Cuando terminás, deja de usarla. Tu recorrido lo ven solo vos y tu coach.",
    ok: "Seguir",
    no: "Ahora no",
  };
}
export function needsDisclosure(){ try { return localStorage.getItem(ASK_KEY) !== "1"; } catch (e) { return true; } }
export function acceptDisclosure(){ try { localStorage.setItem(ASK_KEY, "1"); } catch (e) {} }

// mode: el elegido para la próxima salida. run: la salida en curso (core/cardiogps.js) o null.
// restored: se retomó al abrir la app (restoredGapMs: cuánto hacía del último punto).
// error: lo que impide medir (errorWhy: "permiso" | "sin-gps" | "servicio"; con "permiso" la
// pantalla ofrece «Abrir ajustes»). gps: "buscando" | "debil" | "ok" | "off". notice: aviso que
// no corta nada (sin señal, sin espacio para guardar).
export const GpsState = { mode: "pie", run: null, restored: false, restoredGapMs: 0, error: "", errorWhy: "", gps: "off", notice: "" };

export const isNative = () => { try { const C = window.Capacitor; return !!(C && C.isNativePlatform && C.isNativePlatform()); } catch (e) { return false; } };
const platform = () => { try { return isNative() ? window.Capacitor.getPlatform() : "web"; } catch (e) { return "web"; } };

// Plugins de Capacitor sin bundler (como core/push.js): el que ya expone el puente nativo o,
// si no, registerPlugin (una sola vez por nombre). Si la app no lo trae, null.
const plugins = {};
function plugin(name){
  if (plugins[name]) return plugins[name];
  const C = window.Capacitor; if (!C) return null;
  try {
    let P = C.Plugins && C.Plugins[name];
    if (!P && typeof C.isPluginAvailable === "function" && !C.isPluginAvailable(name)) return null;
    if (!P && C.registerPlugin) P = C.registerPlugin(name);
    if (P) plugins[name] = P;
    return P || null;
  } catch (e) { return null; }
}
const bgPlugin = () => isNative() ? plugin("BackgroundGeolocation") : null;

// Id de la salida: uuid, el mismo que después va a la nube. (Es newId() de core/supabase.js;
// no se importa para no sumarle dependencias a este módulo, que main.js carga temprano.)
function newId(){
  try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16); });
}

// ---- Avisos a la pantalla ----
// onChange: cambió el estado, un error o el GPS (redibujar). onPoint: punto aceptado (para un
// mini recorrido en vivo). Con la app en segundo plano no se avisa nada: al volver, un onChange.
const changeSubs = [], pointSubs = [];
let pendingChange = false;
export function onChange(fn){ if (typeof fn === "function" && !changeSubs.includes(fn)) changeSubs.push(fn); }
export function onPoint(fn){ if (typeof fn === "function" && !pointSubs.includes(fn)) pointSubs.push(fn); }
function emit(){
  if (appAway()){ pendingChange = true; return; }
  pendingChange = false;
  changeSubs.slice().forEach(fn => { try { fn(GpsState); } catch (e) { console.error("gps", e); } });
}
function emitPoint(p){
  if (appAway() || !p) return;
  pointSubs.slice().forEach(fn => { try { fn(p); } catch (e) { console.error("gps", e); } });
}
function setError(why){
  const p = platform();
  GpsState.errorWhy = why;
  GpsState.error = why === "permiso" ? (p === "android" ? TEXTS.permAndroid : p === "ios" ? TEXTS.permIos : TEXTS.permWeb)
    : why === "sin-gps" ? (p === "web" ? TEXTS.noGpsWeb : TEXTS.noGpsNative)
    : why === "apagada" ? TEXTS.locOff
    : why === "servicio" ? TEXTS.service : "";
  if (why === "apagada") GpsState.errorWhy = "sin-gps";
}
function clearError(){ GpsState.error = ""; GpsState.errorWhy = ""; }
// Estado del GPS según los puntos (core/cardiogps.js liveStats). true si cambió.
function refreshGps(now){
  const g = GpsState.run ? liveStats(GpsState.run, now == null ? Date.now() : now, null).gps : "off";
  if (g === GpsState.gps) return false;
  GpsState.gps = g; return true;
}

// ---- Guardar la salida en curso ----
// saved: lo que ya está escrito. closed: partes llenas ya escritas (no se vuelven a escribir).
// chunks: cuántas partes hay escritas. n: puntos escritos. at: cuándo se escribió. arr: la lista
// de puntos que se escribió (si el motor la achica con thinPoints es otra: se escribe todo).
const saved = { closed: 0, chunks: 0, n: 0, at: 0, timer: null, arr: null };
const chunkKey = k => RUN_KEY + "_c" + k;
function resetSaved(){ clearTimeout(saved.timer); Object.assign(saved, { closed: 0, chunks: 0, n: 0, at: 0, timer: null, arr: null }); }
function lastPointT(r){ const a = r && r.pts && r.pts[r.pts.length - 1]; return a ? r.start + a[0] : null; }
function header(r, chunks){
  return { v: 1, id: r.id, uid: r.uid || null, mode: r.mode, start: r.start, status: r.status, pauses: r.pauses,
    pausedAt: r.pausedAt, ended: r.ended, seg: r.seg, n: r.pts.length, chunks, lastT: lastPointT(r) };
}
// now: en el acto. Si no, espera a juntar 20 puntos o a que pasen 5 s (un solo setTimeout).
function persist(now){
  if (!GpsState.run) return;
  if (!now){
    const t = Date.now();
    if (t < saved.at) saved.at = t; // el reloj del celular volvió para atrás
    const since = t - saved.at, fresh = GpsState.run.pts.length - saved.n;
    if (fresh >= 0 && fresh < SAVE_PTS && since < SAVE_MS){
      if (!saved.timer) saved.timer = setTimeout(() => { saved.timer = null; write(); }, SAVE_MS - since);
      return;
    }
  }
  write();
}
function write(){
  clearTimeout(saved.timer); saved.timer = null;
  const r = GpsState.run; if (!r) return;
  const pts = r.pts, chunks = Math.ceil(pts.length / CHUNK);
  try {
    if (saved.arr !== pts){ saved.closed = 0; saved.arr = pts; } // nueva o achicada (thinPoints): todo de nuevo
    for (let k = saved.closed; k < chunks; k++){
      localStorage.setItem(chunkKey(k), JSON.stringify(pts.slice(k * CHUNK, (k + 1) * CHUNK)));
      saved.chunks = Math.max(saved.chunks, k + 1);
      if ((k + 1) * CHUNK <= pts.length) saved.closed = k + 1;
    }
    for (let k = chunks; k < saved.chunks; k++) localStorage.removeItem(chunkKey(k));
    // La cabecera al final: si la app se corta a la mitad, al leer manda lo que haya en las partes.
    localStorage.setItem(RUN_KEY, JSON.stringify(header(r, chunks)));
    saved.chunks = chunks; saved.n = pts.length; saved.at = Date.now();
    if (GpsState.notice === TEXTS.quota){ GpsState.notice = ""; emit(); }
  } catch (e) {
    // Sin espacio (QuotaExceededError) u otra falla: se sigue en memoria y se reintenta en la
    // próxima escritura (como mucho cada 5 s).
    saved.at = Date.now();
    if (GpsState.notice !== TEXTS.quota){ GpsState.notice = TEXTS.quota; emit(); }
  }
}
// Claves de la salida en curso guardadas en el celular (para borrar al cerrar sesión).
export function runKeys(){
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++){
      const k = localStorage.key(i);
      if (k === RUN_KEY || (k && k.startsWith(RUN_KEY + "_c"))) out.push(k);
    }
  } catch (e) {}
  return out;
}
function clearKeys(){ try { runKeys().forEach(k => localStorage.removeItem(k)); } catch (e) {} }
function clearRun(){ GpsState.run = null; GpsState.gps = "off"; GpsState.restored = false; GpsState.restoredGapMs = 0; resetSaved(); clearKeys(); }

// ---- Mirar la ubicación ----
let nativeId = null, nativeGen = 0, reattachOnFirst = false;
let webId = null, wake = null, wakeAsk = false;
export const watching = () => nativeId != null || webId != null;

function watcherOpts(mode, ask){
  return { backgroundTitle: TEXTS.notifTitle[modeOk(mode) ? mode : "pie"], backgroundMessage: TEXTS.notifMsg,
    requestPermissions: !!ask, stale: false, distanceFilter: MODES[modeOk(mode) ? mode : "pie"].distanceFilterM };
}
function dropNative(id){
  const P = bgPlugin();
  if (P && id != null) Promise.resolve().then(() => P.removeWatcher({ id })).catch(() => {});
}

// Engancha el GPS nativo (addWatcher). ask: que el plugin pida el permiso (iPhone siempre;
// Android solo si no se pudo pedir antes). Resuelve "ok" | "permiso" | "apagada" | "sin-gps" |
// "servicio" | "cancel" (se pausó o terminó mientras arrancaba). Los errores que llegan después de
// resolver los maneja lost().
function attachNative(ask){
  const P = bgPlugin(), gen = ++nativeGen;
  if (nativeId != null){ const id = nativeId; nativeId = null; dropNative(id); }
  return new Promise(resolve => {
    let done = false, tries = 0;
    const settle = res => { if (!done){ done = true; resolve(res); } };
    if (!P || typeof P.addWatcher !== "function"){ settle("sin-gps"); return; }
    const go = () => {
      if (gen !== nativeGen){ settle("cancel"); return; }
      const r = GpsState.run;
      if (!r || r.status !== "running"){ settle("cancel"); return; }
      // dead: este intento ya no sirve ("svc": no llegó a quedar guardado en el plugin; "auth":
      // quedó guardado y hay que sacarlo).
      let id = null, dead = "";
      const cb = (loc, err) => {
        if (gen !== nativeGen || dead) return;
        if (err){
          const msg = String((err && err.message) || err);
          if (/service not running/i.test(msg)){
            dead = "svc";
            if (++tries < RETRIES) setTimeout(go, RETRY_MS);
            else if (!done) settle("servicio"); else lost("servicio");
            return;
          }
          if (err.code === "NOT_AUTHORIZED"){
            dead = "auth";
            if (id != null){ if (nativeId === id) nativeId = null; dropNative(id); }
            const why = /disabled/i.test(msg) ? "apagada" : "permiso";
            if (!done) settle(why); else lost(why);
            return;
          }
          // Otro error: no llega la señal. El plugin sigue intentando; el tiempo sigue contando.
          if (GpsState.notice !== TEXTS.noSignal){ GpsState.notice = TEXTS.noSignal; GpsState.gps = "buscando"; emit(); }
          return;
        }
        if (!loc) return;
        settle("ok");
        nativeFix(loc);
      };
      Promise.resolve().then(() => P.addWatcher(watcherOpts(r.mode, ask), cb)).then(wid => {
        id = wid;
        if (dead === "svc") return;
        if (gen !== nativeGen || dead){ dropNative(wid); settle("cancel"); return; }
        nativeId = wid;
        setTimeout(() => { if (!dead) settle(gen === nativeGen ? "ok" : "cancel"); }, SETTLE_MS);
      }, e => {
        console.error("gps", e);
        if (gen === nativeGen){ if (!done) settle("sin-gps"); else lost("sin-gps"); }
      });
    };
    go();
  });
}
function nativeFix(loc){
  handlePoint({ lat: loc.latitude, lon: loc.longitude, acc: loc.accuracy, spd: loc.speed, t: loc.time });
  // Android sin checkPermissions: el permiso lo pidió el plugin al enganchar, así que el
  // servicio en primer plano arrancó sin permiso (Android 14 no lo deja). Ya con el primer punto
  // hay permiso: se engancha de nuevo una vez para que el servicio quede bien.
  if (reattachOnFirst){
    reattachOnFirst = false;
    attachNative(false).then(res => { if (res !== "ok" && res !== "cancel") lost(res); });
  }
}

// Android: el permiso de ubicación se pide antes de addWatcher. Si se lo deja al plugin
// (requestPermissions: true), pide el permiso y a la vez arranca el servicio en primer plano; en
// Android 14 o más eso falla sin permiso, el plugin lo traga y sigue SIN servicio: con la
// pantalla apagada deja de medir. → "ok" | "permiso" | "sin-check" (el plugin no lo tiene).
// Si dio solo la ubicación aproximada cuenta como sin permiso (el alias "location" incluye la
// precisa: con cientos de metros de error no se puede medir una salida).
async function androidLocation(){
  const P = bgPlugin();
  let st;
  try { st = await P.checkPermissions(); } catch (e) { return "sin-check"; }
  if (!st || typeof st.location !== "string") return "sin-check";
  if (st.location === "granted") return "ok";
  try { st = await P.requestPermissions({ permissions: ["location"] }); } catch (e) { return "permiso"; }
  return st && st.location === "granted" ? "ok" : "permiso";
}
// Android 13 o más: permiso de notificaciones, para que se vea la de la salida en curso (como
// ui/restnotif.js). Si lo niega se sigue igual: el servicio corre, la notificación no se ve.
async function androidNotifications(){
  const LN = plugin("LocalNotifications");
  if (!LN || typeof LN.checkPermissions !== "function") return;
  try {
    const p = await LN.checkPermissions();
    if (p && (p.display === "prompt" || p.display === "prompt-with-rationale")) await LN.requestPermissions();
  } catch (e) {}
}

function attachWeb(){
  if (webId != null){ try { navigator.geolocation.clearWatch(webId); } catch (e) {} webId = null; }
  try {
    webId = navigator.geolocation.watchPosition(webFix, webErr, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
  } catch (e) { webId = null; lost("sin-gps"); return; }
  lockScreen();
}
function webFix(pos){
  const c = pos && pos.coords; if (!c) return;
  handlePoint({ lat: c.latitude, lon: c.longitude, acc: c.accuracy, spd: c.speed, t: pos.timestamp });
}
function webErr(err){
  if (webId == null) return;
  if (err && err.code === 1){ lost("permiso"); return; }
  // 2 (sin señal) o 3 (tardó): el navegador sigue intentando.
  if (GpsState.notice !== TEXTS.noSignal){ GpsState.notice = TEXTS.noSignal; GpsState.gps = "buscando"; emit(); }
}
// ¿El navegador ya dijo que no? (así no se arranca una salida que no puede medir).
async function webDenied(){
  try {
    if (!navigator.permissions || !navigator.permissions.query) return false;
    const st = await navigator.permissions.query({ name: "geolocation" });
    return !!st && st.state === "denied";
  } catch (e) { return false; }
}

// Web: la pantalla prendida mientras mide (con la pantalla apagada el navegador deja de mandar
// la ubicación). Se suelta en pausa y al terminar; al volver a la pestaña se pide de nuevo
// (el navegador la suelta sola al ocultarla).
async function lockScreen(){
  if (isNative() || wake || wakeAsk || !navigator.wakeLock || document.visibilityState !== "visible") return;
  wakeAsk = true;
  try {
    const w = await navigator.wakeLock.request("screen");
    if (webId == null){ try { Promise.resolve(w.release()).catch(() => {}); } catch (e) {} return; }
    wake = w;
    if (w && w.addEventListener) w.addEventListener("release", () => { if (wake === w) wake = null; });
  } catch (e) {} finally { wakeAsk = false; }
}
function unlockScreen(){ const w = wake; wake = null; if (w) try { Promise.resolve(w.release()).catch(() => {}); } catch (e) {} }

// Deja de mirar la ubicación (nativo y web) y suelta la pantalla.
function stopWatch(){
  nativeGen++; reattachOnFirst = false;
  if (nativeId != null){ const id = nativeId; nativeId = null; dropNative(id); }
  if (webId != null){ try { navigator.geolocation.clearWatch(webId); } catch (e) {} webId = null; }
  unlockScreen();
}
// Engancha según la plataforma. user: lo pidió el usuario («Seguir»): en Android se revisa (y si
// hace falta se pide) el permiso antes; al retomar sola al abrir la app no se pide nada.
async function startWatch(user){
  if (!isNative()){ attachWeb(); return; }
  let ask = platform() !== "android";
  if (user && !ask){
    const p = await androidLocation();
    if (p === "permiso"){ lost("permiso"); return; }
    if (p === "sin-check"){ ask = true; reattachOnFirst = true; }
  }
  const r = GpsState.run;
  if (!r || r.status !== "running") return;
  const res = await attachNative(ask);
  if (res !== "ok" && res !== "cancel") lost(res);
}
// Se perdió el permiso (o el GPS) con la salida andando: deja de mirar y, si ya había medido
// algo, la pausa (el tiempo no sigue contando sin medir); si no había nada, la descarta.
function lost(why){
  stopWatch();
  setError(why);
  const r = GpsState.run;
  if (r && r.status === "running"){
    if (!r.pts.length) clearRun();
    else { pauseRun(r, Date.now()); GpsState.gps = "off"; write(); }
  }
  emit();
}

// Un punto del GPS (nativo o web) para la salida en curso.
function handlePoint(raw){
  const r = GpsState.run;
  if (!r || r.status !== "running") return;
  const now = Date.now();
  const before = r.pts.length;
  const why = addPoint(r, Object.assign({}, raw, { t: gpsTime(raw.t, now) }));
  if (why === "paused") return;
  let changed = false;
  if (GpsState.notice === TEXTS.noSignal){ GpsState.notice = ""; changed = true; }
  if (r.pts.length !== before) persist(false);
  if (refreshGps(now)) changed = true;
  if (isAccepted(why)) emitPoint(lastPoint(r));
  if (changed) emit();
}

// ---- Acciones ----
// Modo para la próxima salida ("pie" | "bici"); con una salida en curso no cambia.
export function setMode(m){ if (!GpsState.run && modeOk(m)){ GpsState.mode = m; return true; } return false; }

let starting = false;
function fail(why){ setError(why); emit(); return { ok: false, why: why === "apagada" ? "sin-gps" : why }; }
// Crea la salida nueva y la guarda en el acto.
function begin(mode){
  const r = newRun(mode, Date.now(), newId());
  r.uid = (State.cloudUser && State.cloudUser.id) || null;
  GpsState.run = r; GpsState.restored = false; GpsState.restoredGapMs = 0; GpsState.notice = ""; GpsState.gps = "buscando";
  resetSaved(); write();
}

// Empezar una salida. → { ok: true } o { ok: false, why }:
//   "aviso": falta el aviso «Usar tu ubicación» (disclosure(); al aceptar, acceptDisclosure() y
//            start() de nuevo). No se pidió ningún permiso.
//   "permiso": sin permiso de ubicación (GpsState.error; nativo: openSettings()).
//   "sin-gps": el celular o el navegador no puede usar la ubicación, o está apagada.
//   "servicio": el GPS del celular no arrancó.
//   "en-curso": ya hay una salida (en curso, o terminada sin guardar: takeEnded()).
//   "cancel": se descartó mientras arrancaba.
export async function start(mode){
  if (GpsState.run || starting) return { ok: false, why: "en-curso" };
  if (mode !== undefined) setMode(mode);
  if (needsDisclosure()) return { ok: false, why: "aviso" };
  clearError();
  starting = true;
  try {
    const m = GpsState.mode;
    if (isNative()){
      if (!bgPlugin()) return fail("sin-gps");
      let ask = true;
      if (platform() === "android"){
        await androidNotifications();
        const p = await androidLocation();
        if (p === "permiso") return fail("permiso");
        ask = p === "sin-check";
      }
      begin(m);
      reattachOnFirst = ask && platform() === "android";
      emit();
      const res = await attachNative(ask);
      if (res === "ok") return { ok: true };
      if (res === "cancel") return GpsState.run ? { ok: true } : { ok: false, why: "cancel" };
      stopWatch(); clearRun();
      return fail(res);
    }
    if (!navigator.geolocation || typeof navigator.geolocation.watchPosition !== "function") return fail("sin-gps");
    if (await webDenied()) return fail("permiso");
    begin(m);
    attachWeb();
    emit();
    return { ok: true };
  } finally { starting = false; }
}
export function pause(){
  const r = GpsState.run; if (!r || r.status !== "running") return;
  pauseRun(r, Date.now()); stopWatch(); GpsState.gps = "off"; GpsState.notice = "";
  write(); emit();
}
export function resume(){
  const r = GpsState.run; if (!r || r.status !== "paused") return;
  resumeRun(r, Date.now()); GpsState.restored = false; clearError(); GpsState.gps = "buscando";
  write(); emit();
  startWatch(true).catch(e => console.error("gps", e));
}
// Terminar: la salida queda "ended" (guardada en el celular hasta que se guarde o descarte).
export function stop(){
  const r = GpsState.run; if (!r) return null;
  if (r.status !== "ended") endRun(r, Date.now());
  stopWatch(); GpsState.restored = false; GpsState.gps = "off"; GpsState.notice = "";
  write(); emit();
  return r;
}
// Borra la salida (memoria y celular) y deja de mirar la ubicación.
export function discard(){
  stopWatch(); clearRun(); clearError(); GpsState.notice = "";
  emit();
}
// La salida terminada, para guardarla (después: discard()). null si no hay.
export function takeEnded(){ const r = GpsState.run; return r && r.status === "ended" ? r : null; }
// Números en vivo (core/cardiogps.js liveStats) con el último peso cargado (sin peso: 70 kg y
// kgDefault: true).
export function live(now){
  const t = now == null ? Date.now() : now;
  const s = liveStats(GpsState.run, t, lastWeight(state.weights));
  if (GpsState.run) GpsState.gps = s.gps;
  return s;
}
// Ajustes de la app (permiso negado). En la web no hay: false.
export function openSettings(){
  const P = bgPlugin();
  if (!P || typeof P.openSettings !== "function") return false;
  Promise.resolve().then(() => P.openSettings()).catch(() => {});
  return true;
}
// Texto fijo de la pantalla en vivo: en la app, que se puede bloquear el celular; en la web, que
// la pantalla tiene que quedar prendida.
export const hint = () => isNative() ? TEXTS.nativeTip : TEXTS.webLimit;
// «Retomamos tu salida (el GPS estuvo cortado N min)», mientras GpsState.restored.
export function restoredText(){
  if (!GpsState.restored) return "";
  const min = Math.round(GpsState.restoredGapMs / 60000);
  return "Retomamos tu salida" + (min >= 1 ? " (el GPS estuvo cortado " + min + " min)" : "") + ".";
}
export function ackRestored(){ if (GpsState.restored){ GpsState.restored = false; emit(); } }
// Al cerrar sesión o borrar la cuenta: deja de mirar y borra la salida y el aviso visto.
export function stopForLogout(){
  stopWatch(); clearRun(); clearError(); GpsState.notice = "";
  try { localStorage.removeItem(ASK_KEY); } catch (e) {}
}

// ---- App en segundo plano ----
// Al irse se guarda en el acto (el sistema puede matar la app); el GPS sigue. Al volver, la
// pantalla se pone al día una vez y en la web se vuelve a pedir la pantalla prendida.
onAwayChange(away => {
  if (away){ if (GpsState.run && GpsState.run.status !== "ended") write(); return; }
  if (webId != null) lockScreen();
  if (pendingChange || GpsState.run){ refreshGps(); emit(); }
});
window.addEventListener("pagehide", () => { if (GpsState.run) write(); });

// ---- Retomar al abrir ----
const okNum = v => typeof v === "number" && Number.isFinite(v);
function validHeader(h){
  return !!h && h.v === 1 && typeof h.id === "string" && h.id.length > 0 && h.id.length <= 64 && modeOk(h.mode) && okNum(h.start) && h.start > 0
    && ["running", "paused", "ended"].includes(h.status) && Array.isArray(h.pauses)
    && h.pauses.every(p => Array.isArray(p) && p.length === 2 && okNum(p[0]) && okNum(p[1]))
    && Number.isInteger(h.seg) && h.seg >= 0
    && (h.status !== "paused" || okNum(h.pausedAt)) && (h.status !== "ended" || okNum(h.ended));
}
// Lee la salida guardada. Datos rotos: se descartan (con aviso en la consola). Lee todas las
// partes que haya (una escritura cortada a la mitad puede dejar una más que la cabecera) y deja
// los puntos en orden y sin repetidos. → { run, repaired } o null.
function readSaved(){
  let h = null;
  try { h = JSON.parse(localStorage.getItem(RUN_KEY) || "null"); } catch (e) { h = undefined; }
  if (h === null){ if (runKeys().length) clearKeys(); return null; }
  if (!validHeader(h)){ console.warn("Salida en curso guardada rota: se descarta."); clearKeys(); return null; }
  let pts = [], bad = 0, n = 0;
  for (let k = 0; k < MAX_CHUNKS; k++){
    const s = localStorage.getItem(chunkKey(k));
    if (s == null){ if (k >= (h.chunks | 0)) break; bad++; continue; }
    n = k + 1;
    let c = null;
    try { c = JSON.parse(s); } catch (e) {}
    if (!Array.isArray(c)){ bad++; continue; }
    for (const a of c){
      if (Array.isArray(a) && a.length === 6 && a.every(okNum)) pts.push(a); else bad++;
    }
  }
  let repaired = bad > 0 || n !== (h.chunks | 0);
  for (let i = 1; i < pts.length; i++) if (pts[i][0] <= pts[i - 1][0]){
    pts.sort((a, b) => a[0] - b[0]);
    pts = pts.filter((a, j) => j === 0 || a[0] !== pts[j - 1][0]);
    repaired = true;
    break;
  }
  if (bad) console.warn("Salida en curso: se descartaron " + bad + " datos rotos.");
  const run = newRun(h.mode, h.start, h.id);
  Object.assign(run, { uid: typeof h.uid === "string" ? h.uid : null, status: h.status, pauses: h.pauses.map(p => [p[0], p[1]]),
    pausedAt: h.status === "paused" ? h.pausedAt : null, ended: h.status === "ended" ? h.ended : null, seg: h.seg, pts });
  return { run, repaired, chunks: n };
}
(function restore(){
  let got = null;
  try { got = readSaved(); } catch (e) { console.warn("No se pudo leer la salida en curso.", e); clearKeys(); }
  if (!got) return;
  const r = got.run, now = Date.now();
  GpsState.mode = r.mode; GpsState.run = r;
  if (got.repaired){ saved.chunks = got.chunks; write(); }
  else Object.assign(saved, { closed: Math.floor(r.pts.length / CHUNK), chunks: got.chunks, n: r.pts.length, at: now, arr: r.pts });
  if (r.status === "ended") return; // terminada sin guardar: la pantalla muestra el resumen
  // Abandonada (sin puntos hace más de 6 h, o más de 12 h desde que empezó): se termina sola en
  // el último momento que se midió.
  const lastT = lastPointT(r), last = Math.max(r.start, lastT || 0, r.status === "paused" ? r.pausedAt : 0);
  if (now - last > STALE_MS || now - r.start > MAX_RUN_MS){
    endRun(r, r.status === "paused" ? r.pausedAt : (lastT || r.start));
    write();
    return;
  }
  if (r.status !== "running") return; // pausada: queda pausada
  GpsState.restored = true; GpsState.restoredGapMs = Math.max(0, now - (lastT || r.start)); GpsState.gps = "buscando";
  // La salida siguió mientras la app estaba cerrada: se vuelve a mirar el GPS en el acto (el
  // hueco hasta el primer punto nuevo lo maneja el motor como corte de señal).
  startWatch(false).catch(e => console.error("gps", e));
})();
