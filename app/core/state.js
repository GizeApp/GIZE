import { DEFAULT } from './data.js';

import { KEY } from './storage.js';

import { today, uid } from './utils.js';

import { diaDeHoy } from './diasemana.js';

export const State = {

  view: "entreno",

  activeId: ({1:"lun",2:"mar",3:"mie",4:"jue",5:"vie"})[new Date().getDay()] || "lun",

  // Fecha (today()) en que el alumno eligió un día de Entreno a mano: ese día la app ya no lo
  // mueve sola al día de la semana que toca (ver elegirDiaDeHoy). No se guarda: vale por sesión.
  dayPickedOn: null,

  sb: null,

  cloudUser: null,

  sessionLost: false, // la sesión se cerró sola (ver sessionLost en core/supabase.js): se pide ingresar con cloudUser puesto

  cloudProfile: null,

  cloudLoading: false,

  // true recién cuando loadCloud() pudo leer perfil y rutina de la nube. Hasta entonces
  // cloudSyncCore() no sube nada: sin el perfil no se sabe si la rutina es del coach.
  cloudReady: false,

  // Fechas de peso que este dispositivo vio en la nube. cloudSyncCore() solo borra de la
  // nube las que estén acá y el cliente haya sacado; nunca las que no llegó a leer.

  // Modo edición del nombre en Configuración (ver screens/config.js) — solo el toggle
  // vive acá; el valor tipeado se lee directo del <input> al guardar (mismo criterio que
  // ya usa el input de "joinCode" en esa pantalla), así no hace falta re-renderizar en
  // cada tecla ni perder el foco del campo.
  cfgEditingName: false,

  routineTimer: null,

  brandName: "",

  // Preguntas propias del coach logueado (panel del coach). Las del coach de un cliente
  // van en state.coachQ, que se guarda en el dispositivo para usarlas sin conexión.
  coachQ: null,

};

export let state;

try { const raw = localStorage.getItem(KEY); state = raw ? JSON.parse(raw) : null; } catch(e) { state = null; }

if (!state || !state.days) state = JSON.parse(JSON.stringify(DEFAULT));
if (!Array.isArray(state.days)) state.days = []; // dato roto: ensureDays() arma un día más abajo

if (!Array.isArray(state.habits)) state.habits = JSON.parse(JSON.stringify(DEFAULT.habits));

if (!state.habitsDate) state.habitsDate = today();

state.days.forEach(d => { if (d.subtitle == null) d.subtitle = ""; });

if (!Array.isArray(state.foods)) state.foods = [];

// Productos de marca (Open Food Facts) que el cliente ya agregó alguna vez: se guardan en
// el dispositivo para encontrarlos rápido y sin internet la próxima vez.
if (!Array.isArray(state.offRecent)) state.offRecent = [];

// Buscador de Comida con la búsqueda vacía: los últimos alimentos elegidos al buscar
// (recentSearch, 5) y los últimos que se anotaron (recentFoods, con los gramos de esa vez).
if (!Array.isArray(state.recentSearch)) state.recentSearch = [];
if (!Array.isArray(state.recentFoods)) state.recentFoods = [];

// Calorías totales de cada día pasado ({ "2026-09-22": 1850, … }), para el promedio de
// 7 días en Comida. Se llena al pasar de día y con lo que hay en la nube.
if (!state.kcalLog || typeof state.kcalLog !== "object") state.kcalLog = {};

if (!Array.isArray(state.diary)) state.diary = [];

if (!state.diaryDate) state.diaryDate = today();

if (typeof state.calTarget === "undefined") state.calTarget = null;

if (typeof state.coachPlan === "undefined") state.coachPlan = null;

if (typeof state.info === "undefined") state.info = null;

if (typeof state.block === "undefined") state.block = null;

// Semana de descarga (ver applyCoachRoutine en core/supabase.js): la rutina de siempre del
// coach, cuál se está mostrando ("regular" o la de descarga) y lo cargado en la de siempre
// antes de pasar a la de descarga (vuelve el lunes siguiente).
if (!Array.isArray(state.regularDays)) state.regularDays = null;
if (typeof state.routineMode !== "string") state.routineMode = "regular";
if (!Array.isArray(state.preDeloadDays)) state.preDeloadDays = null;

if (typeof state.calProfile === "undefined") state.calProfile = null;

if (typeof state.steps === "undefined") state.steps = 0;

if (!state.stepsDate) state.stepsDate = today();

if (typeof state.stepsGoal === "undefined") state.stepsGoal = 10000;

if (!Array.isArray(state.weights)) state.weights = [];

if (typeof state.water === "undefined") state.water = 0;

if (typeof state.waterGoal === "undefined") state.waterGoal = 3000;

if (typeof state.waterDate === "undefined") state.waterDate = today();

if (typeof state.restDefault === "undefined") state.restDefault = 120;
// Descanso elegido por el cliente con coach para cada ejercicio (por nombre), en segundos.
if (!state.restPrefs || typeof state.restPrefs !== "object") state.restPrefs = {};

if (!Array.isArray(state.sessions)) state.sessions = [];

// La versión anterior de las salidas con GPS se sacó de la app: si quedaron guardadas
// (state.cardio) o quedó una salida en curso ("gize_cardio_run"), se descartan. Las de ahora
// usan otros nombres (state.salidas, "gize_salida_v1…").
if ("cardio" in state) delete state.cardio;
try { localStorage.removeItem("gize_cardio_run"); } catch(e) {}

// Salidas de Cardio «A pie» / «En bici» guardadas (core/salidas.js): solo el resumen, sin
// coordenadas. El recorrido va aparte (caché de core/salidas.js y la nube), no acá: este estado
// se escribe entero en cada save().
if (!Array.isArray(state.salidas)) state.salidas = [];

if (!state.daily || typeof state.daily !== "object") state.daily = {};

if (!state.checkins || typeof state.checkins !== "object") state.checkins = {};

if (!state.habitsDone || typeof state.habitsDone !== "object") state.habitsDone = {};
// Días y aviso de cada hábito (screens/habitos.js): { own: {id: {days, time}}, coach: {nombre: {days, time}} }.
if (!state.habitAlarms || typeof state.habitAlarms !== "object") state.habitAlarms = {};

// La rutina nunca queda sin días: con 0 días la app quedaba en blanco (ninguna pantalla podía
// dibujar el día elegido). Si llega vacía (datos viejos, la nube), se arma un día vacío.
// Si el día elegido no está (al abrir la app, o una rutina nueva del coach con ids nuevos): en
// medio de un entreno, el que se está entrenando (State.activeId no se guarda, wkStart.day sí);
// si no, el que toca hoy (core/diasemana.js) o el primero, como siempre.
const training = () => { const w = state.wkStart; return !!(w && Date.now() - (w.ts || 0) < 6 * 3600 * 1000); };
export function ensureDays(){
  if (!Array.isArray(state.days) || !state.days.length) state.days = [{ id: uid(), name: "Día 1", subtitle: "", exercises: [] }];
  if (!state.days.find(d => d.id === State.activeId)) {
    const enCurso = training() && state.days.find(d => d.id === state.wkStart.day);
    State.activeId = (enCurso || (!training() && diaDeHoy(state.days)) || state.days[0]).id;
  }
}

// Abrir la app en el día de hoy: si un día de la rutina tiene asignado el día de la semana de
// hoy (day.dias, core/diasemana.js), Entreno queda en ese (el primero, si son varios). Corre al
// abrir la app, cuando llega la rutina de la nube y al volver de segundo plano (un día nuevo).
// No mueve nada en medio de un entreno (empezado hace menos de 6 horas, como training() en
// core/supabase.js) ni si hoy el alumno ya eligió otro día a mano. Sin coincidencia, queda el de
// ahora. Devuelve true si cambió de día.
export function elegirDiaDeHoy(){
  if (State.dayPickedOn === today() || training()) return false;
  const d = diaDeHoy(state.days);
  if (!d || d.id === State.activeId) return false;
  State.activeId = d.id;
  return true;
}
ensureDays();
elegirDiaDeHoy();
