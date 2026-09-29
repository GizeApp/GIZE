// Salir a correr / caminar / bici: el GPS y la salida en curso (las cuentas están en
// core/cardiogps.js y la pantalla en screens/cardio.js).
//
// · App nativa: plugin @capacitor-community/background-geolocation. Con backgroundMessage
//   arranca un servicio en primer plano con notificación, así sigue midiendo con la pantalla
//   bloqueada sin pedir la ubicación "todo el tiempo".
// · Web: navigator.geolocation.watchPosition + la pantalla prendida (wakeLock) mientras corre.
//
// La salida en curso se guarda en el dispositivo (RUN_KEY) para retomarla si la app se
// recarga o se cierra. Nunca se guarda el recorrido: solo el último punto, para medir el
// tramo siguiente.
import { state } from '../core/state.js';
import { save } from '../core/storage.js';
import { cloudDeleteCardio, cloudSaveCardio, newId } from '../core/supabase.js';
import { addPoint, endRun, kindOk, lastWeight, newRun, pauseRun, resumeRun, summary } from '../core/cardiogps.js';
import { ymd } from '../core/utils.js';

export const RUN_KEY = "gize_cardio_run";
// Un último punto guardado hace más de esto no se usa al retomar: no se sabe qué pasó en el medio.
const KEEP_LAST_MS = 2 * 60000;

export const GpsState = { kind: "correr", run: null, restored: false, error: "", fix: false };

export const isNative = () => { try { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); } catch (e) { return false; } };

let _plugin = null;
function plugin(){
  if (_plugin) return _plugin;
  const C = window.Capacitor; if (!C) return null;
  _plugin = (C.Plugins && C.Plugins.BackgroundGeolocation) || (C.registerPlugin ? C.registerPlugin("BackgroundGeolocation") : null);
  return _plugin;
}

function persist(){
  try {
    if (GpsState.run) localStorage.setItem(RUN_KEY, JSON.stringify(GpsState.run));
    else localStorage.removeItem(RUN_KEY);
  } catch (e) {}
}

// ---- Puntos del GPS ----
let onChange = () => {};
export function onGpsChange(fn){ onChange = fn || (() => {}); }

function onPoint(pt){
  const r = GpsState.run; if (!r || r.ended || r.paused) return;
  const res = addPoint(r, pt);
  GpsState.fix = true;
  if (GpsState.error){ GpsState.error = ""; onChange(); }
  if (res !== "paused" && res !== "bad") persist();
}

// ---- Mirar la ubicación ----
let webId = null, nativeId = null, nativeGen = 0, wake = null;
const DENIED = "GIZE no tiene permiso para usar tu ubicación, así que no puede medir la distancia. El tiempo sigue contando.";

function startWatch(){
  stopWatch();
  GpsState.fix = false;
  if (isNative()){
    const P = plugin();
    if (!P || !P.addWatcher){ GpsState.error = "No se pudo usar el GPS del celular. El tiempo sigue contando."; onChange(); return; }
    const gen = ++nativeGen;
    Promise.resolve(P.addWatcher({
      backgroundTitle: "GIZE está registrando tu salida",
      backgroundMessage: "Tocá para volver",
      requestPermissions: true,
      stale: false,
      distanceFilter: 2,
    }, (loc, err) => {
      if (err){
        if (err.code === "NOT_AUTHORIZED"){
          GpsState.error = DENIED; onChange();
          if (confirm("GIZE no tiene permiso para usar tu ubicación.\n\n¿Abrir los ajustes para permitirlo?")) { try { P.openSettings(); } catch (e) {} }
        } else { GpsState.error = "No llega la señal del GPS. El tiempo sigue contando."; onChange(); }
        return;
      }
      if (loc) onPoint({ lat: loc.latitude, lon: loc.longitude, acc: loc.accuracy, t: loc.time || Date.now() });
    })).then(id => {
      // Si mientras arrancaba se pausó o se terminó, se saca enseguida.
      if (gen !== nativeGen){ try { P.removeWatcher({ id }); } catch (e) {} return; }
      nativeId = id;
    }).catch(e => { if (gen === nativeGen){ GpsState.error = "No se pudo usar el GPS del celular. El tiempo sigue contando."; onChange(); } console.error("gps", e); });
    return;
  }
  if (!navigator.geolocation){ GpsState.error = "Este navegador no puede usar el GPS. El tiempo sigue contando."; onChange(); return; }
  webId = navigator.geolocation.watchPosition(
    pos => onPoint({ lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy, t: pos.timestamp || Date.now() }),
    err => {
      GpsState.error = err && err.code === 1 ? DENIED + " Permitilo en los ajustes del navegador." : "No llega la señal del GPS. El tiempo sigue contando.";
      onChange();
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
  lockScreen();
}

function stopWatch(){
  nativeGen++;
  if (nativeId != null){ const P = plugin(), id = nativeId; nativeId = null; try { if (P) Promise.resolve(P.removeWatcher({ id })).catch(() => {}); } catch (e) {} }
  if (webId != null){ try { navigator.geolocation.clearWatch(webId); } catch (e) {} webId = null; }
  unlockScreen();
}

// Web: la pantalla prendida mientras corre (si se bloquea, el celular deja de medir).
async function lockScreen(){
  if (isNative() || wake || !navigator.wakeLock) return;
  try { wake = await navigator.wakeLock.request("screen"); wake.addEventListener("release", () => { wake = null; }); } catch (e) { wake = null; }
}
function unlockScreen(){ const w = wake; wake = null; if (w) try { w.release(); } catch (e) {} }
// Al volver a la pestaña el navegador ya soltó el bloqueo: se pide de nuevo.
document.addEventListener("visibilitychange", () => {
  const r = GpsState.run;
  if (document.visibilityState === "visible" && r && !r.ended && !r.paused && !GpsState.restored && webId != null) lockScreen();
});

export const watching = () => webId != null || nativeId != null;

// ---- Acciones ----
export function setKind(k){ if (kindOk(k) && !GpsState.run) GpsState.kind = k; }

export function startRun(){
  GpsState.run = newRun(GpsState.kind, Date.now());
  GpsState.error = ""; GpsState.restored = false;
  persist(); startWatch();
}
export function pause(){ const r = GpsState.run; if (!r || r.ended) return; pauseRun(r, Date.now()); persist(); stopWatch(); }
export function resume(){ const r = GpsState.run; if (!r || r.ended) return; resumeRun(r, Date.now()); GpsState.restored = false; persist(); startWatch(); }
export function finish(){ const r = GpsState.run; if (!r || r.ended) return; endRun(r, Date.now()); GpsState.restored = false; persist(); stopWatch(); }
// Salida retomada después de recargar: «Seguir».
export function continueRestored(){
  const r = GpsState.run; GpsState.restored = false;
  if (r && !r.ended && !r.paused && !watching()) startWatch();
}

export function saveRun(){
  const r = GpsState.run; if (!r || !r.ended) return null;
  const rec = summary(r, lastWeight(state.weights), newId(), ymd(new Date(r.start)));
  if (!Array.isArray(state.cardio)) state.cardio = [];
  state.cardio.push(rec);
  save();
  GpsState.run = null; persist();
  cloudSaveCardio(rec).catch(e => console.error("cardio", e));
  return rec;
}
export function discardRun(){ stopWatch(); GpsState.run = null; GpsState.restored = false; GpsState.error = ""; persist(); }

export function deleteSaved(id){
  if (!Array.isArray(state.cardio)) return;
  state.cardio = state.cardio.filter(x => x.id !== id);
  save();
  cloudDeleteCardio(id).catch(e => console.error("cardio", e));
}

// ---- Retomar al abrir ----
(function restore(){
  let r = null;
  try { r = JSON.parse(localStorage.getItem(RUN_KEY) || "null"); } catch (e) {}
  if (!r || !kindOk(r.kind) || !(r.start > 0)) return;
  if (!Array.isArray(r.win)) r.win = [];
  if (!r.last || !(Date.now() - r.last.t < KEEP_LAST_MS)){ r.last = null; r.win = []; }
  GpsState.run = r; GpsState.kind = r.kind;
  if (r.ended) return; // quedó el resumen sin guardar
  GpsState.restored = true;
  // App nativa: se vuelve a enganchar el GPS enseguida (la salida siguió mientras la app se
  // cerraba o se recargaba). En la web espera a «Seguir».
  if (isNative() && !r.paused) startWatch();
})();
