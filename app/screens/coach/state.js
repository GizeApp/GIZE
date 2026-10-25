export const CoachState = {

  coachClients: [],

  // La base ya contestó la lista de clientes (loadCoachClients). Hasta entonces (red lenta o sin
  // señal) el panel ya se ve (ver afterLogin) y dice «Cargando…» en vez de «no tenés clientes».
  coachClientsLoaded: false,

  coachSel: null,

  coachData: null,

  coachInvite: null,

  coachDayFilter: null,

  coachEditDay: 0,

  coachDL: "",

  coachPlanForm: null,

  // arranca abierto solo si ya hay comidas cargadas para días de descanso — ver
  // coachPlanObj()/renderCoachPlan(): la mayoría de los clientes no necesita un reparto
  // aparte para el día de descanso, así que ocultamos esa tabla por defecto.
  coachPlanRestOpen: null,

  coachInfoForm: null,

  coachBlockForm: null,

  coachSearch: "",

  coachClientStats: {},

  // Ya llegaron las estadísticas de los clientes (coach_client_stats): hasta entonces Inicio muestra «–» en vez de ceros.
  coachStatsReady: false,

  // Cliente al que apunta el panel de la derecha en Clientes (null = el primero, false = cerrado) y lo que se
  // pidió de cada uno para ese panel (rutina, check-ins, peso).
  coachPeek: null,
  coachPeekData: {},

  // Rutina elegida en Rutinas (id; null = la primera) y el día que se ve de ella.
  coachTplPick: null,
  coachTplDay: 0,

  // «Asignar rutina» desde Inicio: el próximo cliente que se abra abre directo el selector de rutinas.
  coachAssign: false,

  coachView: "clients",

  coachClientTab: "ficha",
  // Sección abierta de la ficha del alumno (null = menú de tarjetas).
  coachSec: null,
  // Sección abierta del plan nutricional (null = menú).
  coachPlanSec: null,
  // Comida desplegada en las opciones del plan (índice o null = todas cerradas).
  coachOptOpen: null,
  coachMealSel: 0,
  coachMealDay: "train",
  coachMealMenu: false,

  coachTpls: [],

  // «Importar rutina armada» en Mis rutinas: lista abierta y las rutinas (core/rutinas-ejemplo.js).
  coachSeedOpen: false,
  coachCat: null,

  coachTplEdit: null,

  coachApplyPicker: null,

  // "Copiar a otro cliente": {loading?} mientras se copia; null = cerrado.
  coachCopyPicker: null,

  // «+ Programar una rutina nueva»: elegir desde qué arranca (una de «Mis rutinas», la rutina
  // actual o vacía). {loading?} mientras se cargan las rutinas; null = cerrado.
  coachSchedPicker: null,

  tplsError: null,

  // «Mis planes» (ver planes.js): planes alimenticios guardados, el error de la última
  // lectura (tabla sin crear…), el plan guardado que se está editando y el selector abierto.
  coachMealTpls: [],

  mealTplsError: null,

  coachMealEdit: null,

  coachMealPicker: null,

  coachPicker: null,

  coachPCat: null,

  coachPQ: "",



  // Editor de preguntas (ver preguntas.js): copia de trabajo mientras está abierto, y el
  // error de la última lectura de coach_questions (tabla sin crear, sin conexión…).
  coachQEdit: null,

  coachQError: null,

  // Día (log_date), semana (week_start) y entreno (ts) elegidos en la ficha del cliente.
  // null = "Ninguno": la sección queda cerrada hasta que el coach elige uno.
  coachDailySel: null,

  coachCkSel: null,

  coachSessSel: null,
  // Calendario de «Historial de entrenos»: mes visible (YYYY-MM; null = el del último entreno) y día abierto.
  coachCalMonth: null,
  coachCalDay: null,
  // Salida de Cardio abierta en «Salidas a pie y en bici» (id, o null = la lista).
  coachSalidaSel: null,
  // Mensaje que el coach está escribiendo en "Notificación al cliente" y si se está enviando.
  notifDraft: "",
  notifSending: false,

  coachNameForm: null,
  // Sección abierta de la pantalla Configuración (coachView "settings", ver settings.js).
  coachSetSec: "perfil",
  coachBackView: "clients",

  // ids de ejercicios expandidos en el editor de rutina — por defecto todo colapsado
  // para no tener una interfaz gigante con muchos ejercicios (ver renderCoachRoutine()).
  coachExpandedEx: new Set(),
  // Mi configuración de cada ejercicio (presets.js): Map clave → {nombre, sets, timed, rest, rir};
  // null si no se pudo cargar (sin la tabla, los botones no aparecen).
  exPresets: null,

  // menú de acciones (subir/bajar/insertar/cambiar) abierto en la card de ejercicio, por id
  coachExMenu: null,

  // Bloque: semana elegida en la grilla (se abre su panel abajo)
  coachWeekSel: null,

};

export let coachCopyPicker = false;

