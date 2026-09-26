import { DEFAULT } from './data.js';

import { KEY } from './storage.js';

import { today } from './utils.js';

export const State = {

  view: "entreno",

  activeId: ({1:"lun",2:"mar",3:"mie",4:"jue",5:"vie"})[new Date().getDay()] || "lun",

  sb: null,

  cloudUser: null,

  cloudProfile: null,

  cloudLoading: false,

  // true recién cuando loadCloud() pudo leer perfil y rutina de la nube. Hasta entonces
  // cloudSyncCore() no sube nada: sin el perfil no se sabe si la rutina es del coach.
  cloudReady: false,

  // Fechas de peso que este dispositivo vio en la nube. cloudSyncCore() solo borra de la
  // nube las que estén acá y el cliente haya sacado; nunca las que no llegó a leer.
  cloudWeightDates: new Set(),

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

if (!state.daily || typeof state.daily !== "object") state.daily = {};

if (!state.checkins || typeof state.checkins !== "object") state.checkins = {};

if (!state.habitsDone || typeof state.habitsDone !== "object") state.habitsDone = {};

if (!state.days.find(d => d.id === State.activeId)) State.activeId = state.days[0].id;
