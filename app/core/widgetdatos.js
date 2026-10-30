// «GIZE de hoy»: lo que muestra el widget de la pantalla de inicio del celular (apps de Android y de
// iPhone). Se arma acá con lo que la app ya tiene en su estado (los pasos, la racha y la rutina) y
// lo manda core/widget.js al plugin GizeWidget. Puro: sin pantalla, sin plugin y sin reloj (la fecha
// y la hora entran por parámetro), como core/pasosdia.js, así se prueba solo
// (tests/widget-datos.test.mjs). Todos los textos salen de acá: el widget solo los dibuja.
//
// El JSON (versión WIDGET_V; las claves exactas, en CLAVES_WIDGET, son el contrato con el widget de
// Android en Java y el de iPhone en Swift: no se cambian sin cambiar los dos):
//   { v: 1, dias: { "AAAA-MM-DD": Dia, … de hoy a hoy+7 }, sinDatos: Dia }
//   Dia = { pasos:   { txt, pie, pct },                 «6.543» · «de 10.000 · 14:32» · 65
//           racha:   { txt, pie, prendida },            «12» · «días seguidos» · true
//           entreno: { titulo, nombre, detalle, hecho, dia },  «Hoy toca» · «Día A» · «6 ejercicios»
//           aviso:   null o { titulo, texto, pie } }    con aviso, el widget muestra solo eso
// El widget busca la fecha del celular en dias; si no está (pasaron más de 8 días sin abrir la app),
// usa sinDatos, y si no tiene nada (sin sesión) muestra su propio «Ingresá a GIZE».
import { diasDe, ordenSemana } from './diasemana.js';
import { activeDeload } from './bloque.js';
import { sumarDias } from './pasosdia.js';

export const WIDGET_V = 1;
export const DIAS_WIDGET = 8; // hoy y los 7 que siguen: a la medianoche el widget pasa solo al otro
export const CLAVES_WIDGET = Object.freeze({
  raiz: ["v", "dias", "sinDatos"],
  dia: ["pasos", "racha", "entreno", "aviso"],
  pasos: ["txt", "pie", "pct"],
  racha: ["txt", "pie", "prendida"],
  entreno: ["titulo", "nombre", "detalle", "hecho", "dia"],
  aviso: ["titulo", "texto", "pie"],
});
// Adónde lleva cada toque: gize://widget/<destino>, y el entreno con ?dia=<id del día>.
export const DESTINOS_WIDGET = ["hoy", "entreno", "pasos", "racha"];

const SEIS_HORAS = 6 * 3600 * 1000; // entreno en curso: empezado hace menos (como wkFresh en screens/entreno.js)
const ID_OK = /^[A-Za-z0-9_-]{1,64}$/; // como los id de la rutina (core/storage.js)
const pad = n => String(n).padStart(2, "0");
// 6543 → «6.543», como se escriben los miles en Argentina (sin depender del idioma del celular).
const miles = n => String(Math.max(0, Math.round(Number(n) || 0))).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const fechaDe = ms => { const d = new Date(ms); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
const horaDe = ms => { const d = new Date(ms); return pad(d.getHours()) + ":" + pad(d.getMinutes()); };
// Día de la semana de "AAAA-MM-DD" (0 = domingo, como day.dias en core/diasemana.js).
const diaSemana = f => { const p = String(f).split("-").map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay(); };
const conEjercicios = d => !!(d && Array.isArray(d.exercises) && d.exercises.length);
const ejercicios = n => n === 1 ? "1 ejercicio" : n > 1 ? n + " ejercicios" : "Sin ejercicios";
const nombreDe = (d, days) => (String((d && d.name) || "").trim() || "Día " + (days.indexOf(d) + 1)).slice(0, 60);
const idDe = d => (d && ID_OK.test(String(d.id))) ? String(d.id) : "";

// ---- Pasos ----
// Hoy: los que leyó la app de Salud / Health Connect (state.steps si stepsDate es hoy) contra la
// meta, con la hora de la última lectura. Los días que vienen todavía no se leyeron: «—». Sin Salud
// conectada, «Conectá tus pasos» (lleva a Cardio → Pasos, donde está el botón).
function pasosDia(st, salud, hoy, fecha){
  if (!(salud && salud.prendida)) return { txt: "Conectá", pie: "tus pasos", pct: 0 };
  if (fecha !== hoy) return { txt: "—", pie: "Abrí GIZE", pct: 0 };
  const n = st.stepsDate === hoy ? Math.max(0, Math.round(Number(st.steps) || 0)) : 0;
  const meta = Number(st.stepsGoal) > 0 ? Math.round(Number(st.stepsGoal)) : 10000;
  const lectura = Number(salud.lectura) || 0;
  const hora = lectura > 0 && fechaDe(lectura) === hoy ? " · " + horaDe(lectura) : "";
  return { txt: miles(n), pie: "de " + miles(meta) + hora, pct: Math.min(100, Math.round(n * 100 / meta)) };
}

// ---- Racha ----
// n: la de hoy (streakCount de ui/racha.js, con la entrada de hoy ya contada). Mañana sigue en juego
// si no entra; desde pasado mañana se apagó.
function rachaDia(n, k){
  n = Math.max(0, Math.floor(Number(n) || 0));
  if (k === 0) return { txt: String(n), pie: n === 1 ? "día seguido" : "días seguidos", prendida: n > 0 };
  if (k === 1 && n > 0) return { txt: String(n), pie: "¡Entrá hoy!", prendida: true };
  return { txt: "0", pie: n > 0 ? "Se apagó" : "¡Entrá hoy!", prendida: false };
}

// ---- Entreno ----
// La rutina de ese día. Hoy, la que muestra la app (state.days). Alumno con coach y bloque: si ese
// día cambia de rutina (empieza o termina la semana de descarga, core/bloque.js), la que va a tener
// (como applyCoachRoutine en core/supabase.js).
function rutinaPara(st, fecha, hoy){
  const actual = Array.isArray(st.days) ? st.days : [];
  if (fecha === hoy) return actual;
  const regular = Array.isArray(st.regularDays) && st.regularDays.length ? st.regularDays : null;
  const modo = st.routineMode || "regular";
  if (!regular && modo === "regular") return actual; // sin rutina del coach: no cambia sola
  const dl = activeDeload(st.block, fecha);
  if ((dl ? dl.key : "regular") === modo) return actual;
  if (dl) return dl.days;
  return regular || (Array.isArray(st.preDeloadDays) && st.preDeloadDays.length ? st.preDeloadDays : actual);
}
// El último entreno guardado (state.sessions: { date, ts, day: nombre del día, exercises }).
function ultimaSesion(sessions){
  let u = null;
  for (const s of Array.isArray(sessions) ? sessions : []){
    if (!s || !s.date) continue;
    if (!u || s.date > u.date || (s.date === u.date && (Number(s.ts) || 0) >= (Number(u.ts) || 0))) u = s;
  }
  return u;
}
// Rutina que va rotando (sin días de la semana): el día que sigue al último guardado, en el orden
// de las pestañas (ordenSemana). Sin entrenos guardados, el primero.
function siguienteDia(days, ult){
  const lista = ordenSemana(days).map(i => days[i]).filter(conEjercicios);
  if (!lista.length) return null;
  const i = ult ? lista.findIndex(d => String(d.name || "") === String(ult.day || "")) : -1;
  return lista[(i + 1) % lista.length];
}
// En este orden: entrenando ahora, hecho hoy, el que toca hoy, descanso, el que sigue (rotación) o
// sin rutina. «Entrenando» y «Hecho» son solo de hoy (los días que vienen no se saben).
function entrenoDia(st, fecha, hoy, ahora, ult){
  const days = rutinaPara(st, fecha, hoy);
  const de = (titulo, d) => ({ titulo, nombre: nombreDe(d, days), detalle: ejercicios((d.exercises || []).length), hecho: false, dia: idDe(d) });
  if (fecha === hoy){
    // Como wkStarted (screens/entreno.js): reloj de menos de 6 h y una serie tildada o «Iniciar».
    const w = st.wkStart, d = w && w.ts && ahora - w.ts < SEIS_HORAS ? days.find(x => x && x.id === w.day) : null;
    if (d && (w.manual || (d.exercises || []).some(x => ((x && x.sets) || []).some(s => s && s.done)))) return de("Entrenando", d);
    const hecha = ultimaSesion((Array.isArray(st.sessions) ? st.sessions : []).filter(s => s && s.date === hoy));
    if (hecha){
      const d2 = days.find(x => x && String(x.name || "") === String(hecha.day || ""));
      return { titulo: "Hecho hoy ✓", nombre: (String(hecha.day || "").trim() || "Entreno").slice(0, 60), detalle: ejercicios((hecha.exercises || []).length), hecho: true, dia: idDe(d2) };
    }
  }
  if (!days.some(conEjercicios)) return { titulo: "Elegí tu rutina", nombre: "", detalle: "", hecho: false, dia: "" };
  const dow = diaSemana(fecha);
  const toca = days.find(d => diasDe(d).includes(dow)); // como diaDeHoy (core/diasemana.js)
  if (toca) return de("Hoy toca", toca);
  if (days.filter(conEjercicios).every(d => diasDe(d).length)) return { titulo: "Hoy", nombre: "Descanso", detalle: "", hecho: false, dia: "" };
  return de("Te toca", siguienteDia(days, ult));
}

// Un día que en lugar de pasos, racha y entreno muestra solo un aviso (coach, gimnasio o sin datos).
function avisoDia(texto, pie){
  return {
    pasos: { txt: "", pie: "", pct: 0 },
    racha: { txt: "", pie: "", prendida: false },
    entreno: { titulo: "", nombre: "", detalle: "", hecho: false, dia: "" },
    aviso: { titulo: "GIZE", texto, pie },
  };
}

// hoy: "AAAA-MM-DD" (today()); ahora: Date.now(); modo: "alumno", "coach" o "gimnasio"; st: el
// estado de la app; racha: días seguidos de hoy; salud: { prendida, lectura (hora de la última
// lectura, en ms) }. Un coach o el panel del gimnasio no muestran nada de alumnos: solo el aviso.
export function armarWidget({ hoy, ahora, modo, st, racha, salud } = {}){
  if (modo !== "alumno") return { v: WIDGET_V, dias: {}, sinDatos: avisoDia(modo === "gimnasio" ? "Tu panel del gimnasio" : "Tu panel de coach", "Tocá para abrir") };
  st = st || {};
  ahora = Number(ahora) || 0;
  const ult = ultimaSesion(st.sessions), dias = {};
  for (let k = 0; k < DIAS_WIDGET; k++){
    const f = sumarDias(hoy, k);
    dias[f] = { pasos: pasosDia(st, salud, hoy, f), racha: rachaDia(racha, k), entreno: entrenoDia(st, f, hoy, ahora, ult), aviso: null };
  }
  return { v: WIDGET_V, dias, sinDatos: avisoDia("Abrí GIZE para ver tu día", "") };
}

// Toque en el widget: gize://widget/<destino>[?dia=<id>] → { destino, dia } o null (otro link, o un
// id que no es de la forma de los de la rutina: no se hace nada).
const ENLACE = /^gize:\/\/widget\/(hoy|entreno|pasos|racha)\/?(?:\?dia=([^&#]*))?$/;
export function leerEnlaceWidget(url){
  const m = ENLACE.exec(String(url || ""));
  if (!m) return null;
  const dia = m[2] || "";
  if (dia && !ID_OK.test(dia)) return null;
  return { destino: m[1], dia };
}
