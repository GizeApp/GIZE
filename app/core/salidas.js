// Salidas de Cardio «A pie» / «En bici» guardadas: la lista (state.salidas, solo el resumen y
// sin coordenadas) y los recorridos (aparte, en una caché del celular y en la nube).
//
// · saveEnded(): la salida terminada de ui/gps.js → resumen y recorrido (core/cardiogps.js
//   finishRun) → cola de envío (core/supabase.js cloudSaveSalida) + state.salidas + caché → se
//   borra la salida en curso (solo si quedó en la cola: con el celular lleno, no).
// · getTrack(id): el recorrido de una salida propia, del celular o de la nube (lo usa el alumno
//   al abrir una salida; las listas nunca lo traen). El coach no lo guarda en su celular: lo
//   pide a la nube y lo tiene solo en memoria (screens/coach/salidas.js).
// · El recorrido NO va en state: ese estado se escribe entero en cada save() y crecería con
//   cada salida. La caché (TRACK_KEY) guarda los últimos que se abrieron (15, hasta ~1,5 MB), se
//   achica a las salidas que siguen existiendo cada vez que se lee la nube (pruneTracks) y se
//   borra al cerrar sesión (clearAccountLeftovers). Una salida que todavía no subió tiene su
//   recorrido también en la cola de envío, así que no se pierde aunque salga de la caché.
// · App de Android (core/plataforma.js appAndroid): sin nada de ubicación. La única salida que
//   puede guardar es una que quedó en curso de una versión anterior (con GPS): va solo con sus
//   números. El recorrido (las coordenadas) no sale del celular ni queda en la caché.
import { State, state } from './state.js';
import { save } from './storage.js';
import { ymd } from './utils.js';
import { finishRun, fmtClock, isShort, lastWeight } from './cardiogps.js';
import { discard, freeRunStorage, restoreRunStorage, takeEnded } from '../ui/gps.js';
import { cloudDeleteSalida, cloudSaveSalida, fetchSalidaTrack, newId, pendingSalidaTrack, salidaPendiente } from './supabase.js';
import { appAndroid } from './plataforma.js';

export const TRACK_KEY = "gize_salidas_track_v1";
const TRACK_MAX = 15;             // recorridos en la caché
const TRACK_MAX_CHARS = 1500000;  // y como mucho ~1,5 MB entre todos

// ---- Caché de recorridos: [[id, track], …], el último usado al final ----
function readCache(){
  try {
    const a = JSON.parse(localStorage.getItem(TRACK_KEY) || "[]");
    return Array.isArray(a) ? a.filter(x => Array.isArray(x) && typeof x[0] === "string" && typeof x[1] === "string") : [];
  } catch (e) { return []; }
}
function writeCache(list){
  // Si no entra (celular lleno), se van sacando los más viejos; sin lugar para ninguno, nada.
  for (let a = list.slice(); ; a = a.slice(1)){
    try {
      if (a.length) localStorage.setItem(TRACK_KEY, JSON.stringify(a)); else localStorage.removeItem(TRACK_KEY);
      return;
    } catch (e) { if (!a.length) return; }
  }
}
export function cachedTrack(id){
  const hit = readCache().find(x => x[0] === id);
  return hit ? hit[1] : null;
}
function putTrack(id, track){
  if (!id || typeof track !== "string" || !track) return;
  let list = readCache().filter(x => x[0] !== id).concat([[id, track]]);
  let chars = list.reduce((n, x) => n + x[1].length, 0);
  while (list.length > 1 && (list.length > TRACK_MAX || chars > TRACK_MAX_CHARS)){ chars -= list[0][1].length; list = list.slice(1); }
  writeCache(list);
}
function dropTrack(id){
  const list = readCache(), keep = list.filter(x => x[0] !== id);
  if (keep.length !== list.length) writeCache(keep);
}
// Deja en la caché solo los recorridos de estas salidas (ids): los de las borradas en otro
// dispositivo se van (core/supabase.js mergeSalidas, al leer la nube).
export function pruneTracks(keepIds){
  const ok = new Set(keepIds || []), list = readCache(), keep = list.filter(x => ok.has(x[0]));
  if (keep.length !== list.length) writeCache(keep);
}

// ---- Lista ----
// Las salidas guardadas, de la más nueva a la más vieja.
export function salidasList(){
  const ts = s => Date.parse(s && s.startedAt) || 0;
  return (Array.isArray(state.salidas) ? state.salidas : []).slice().sort((a, b) => ts(b) - ts(a));
}

// Texto para la pregunta de una salida muy corta: «40 m, 0:35 en movimiento».
function shortText(rec){
  const m = Math.round(Number(rec.dist) || 0);
  return (m < 1000 ? m + " m" : (m / 1000).toFixed(2).replace(".", ",") + " km") + ", " + fmtClock((Number(rec.moving) || 0) * 1000) + " en movimiento";
}

// Guarda la salida terminada (ui/gps.js takeEnded). Muy corta (menos de 100 m o de 1 min en
// movimiento): pregunta antes; si no la quiere, se descarta (con opts.keepIfShort queda como
// estaba: la pantalla de Cardio, que tiene «Guardar» y «Descartar», la deja para decidir).
// → la salida guardada, o null.
// Las calorías van con el último peso cargado; sin peso, 70 kg (kgDefault: la pantalla avisa).
export function saveEnded(opts){
  const run = takeEnded();
  if (!run) return null;
  // Quedó de otra cuenta (se cerró la sesión sin borrarla): no va a la cuenta de ahora.
  const me = State.cloudUser && State.cloudUser.id;
  if (run.uid && me && run.uid !== me){ discard(); return null; }
  const fin = finishRun(run, lastWeight(state.weights), Date.now(), ymd(new Date(run.start))), rec = fin.rec;
  // App de Android: solo los números. Sin recorrido (points 0: en el iPhone y en la web se ve
  // «Esta salida no tiene recorrido.»).
  const track = appAndroid() ? null : fin.track;
  if (appAndroid()) rec.points = 0;
  if (!rec.id) rec.id = newId();
  if (isShort(rec) && !confirm("La salida es muy corta (" + shortText(rec) + "). ¿Guardarla igual?")){ if (!(opts && opts.keepIfShort)) discard(); return null; }
  // Primero a la cola (queda escrita en el acto) y después se borra la salida en curso: si la
  // app se corta en el medio, al abrir se vuelve a guardar la misma (mismo id, no se duplica).
  // La cola va antes que la caché: con el celular lleno, la caché se comería el lugar.
  cloudSaveSalida(rec, track).catch(e => console.error("salida", e));
  if (State.cloudUser && !salidaPendiente(rec.id)){
    // No entró (sin espacio): se libera lo que ocupa la salida en curso (los puntos siguen en
    // memoria) y se prueba de nuevo. Si igual no entra, no se borra nada: queda terminada para
    // volver a tocar «Guardar».
    freeRunStorage();
    cloudSaveSalida(rec, track).catch(e => console.error("salida", e));
    if (!salidaPendiente(rec.id)){
      restoreRunStorage();
      alert("No hay espacio en el celular para guardar la salida. No cierres GIZE: conectate a internet para que se suba lo pendiente y tocá «Guardar» de nuevo.");
      return null;
    }
  }
  if (!Array.isArray(state.salidas)) state.salidas = [];
  // El mismo id reemplaza (si la app se cerró justo después de guardar, se guarda de nuevo igual).
  state.salidas = state.salidas.filter(x => x.id !== rec.id).concat([rec]);
  if (track) putTrack(rec.id, track);
  save();
  discard();
  return rec;
}

// Borra una salida guardada (del celular, de la caché y de la nube).
export function deleteSalida(id){
  if (!id) return Promise.resolve(true);
  state.salidas = (Array.isArray(state.salidas) ? state.salidas : []).filter(x => x.id !== id);
  dropTrack(id);
  save();
  return cloudDeleteSalida(id);
}

// El recorrido de una salida (texto de encodeTrack): de la caché, de la cola de envío (todavía
// no subió) o de la nube (una vez; después queda en la caché). Sin recorrido o sin poder
// pedirlo: null (no se guarda, así se vuelve a probar la próxima vez).
const asking = {};
export function getTrack(id){
  if (!id) return Promise.resolve(null);
  const c = cachedTrack(id);
  if (c) return Promise.resolve(c);
  const p = pendingSalidaTrack(id);
  if (p){ putTrack(id, p); return Promise.resolve(p); }
  if (!asking[id]){
    asking[id] = fetchSalidaTrack(id).then(t => { if (t) putTrack(id, t); return t; }, () => null)
      .finally(() => { delete asking[id]; });
  }
  return asking[id];
}
