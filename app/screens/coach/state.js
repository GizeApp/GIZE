export const CoachState = {

  coachClients: [],

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

  coachView: "clients",

  coachClientTab: "ficha",
  // Sección abierta de la ficha del alumno (null = menú de tarjetas).
  coachSec: null,
  // Sección abierta del plan nutricional (null = menú).
  coachPlanSec: null,

  coachTpls: [],

  coachTplEdit: null,

  coachApplyPicker: null,

  // "Copiar a otro cliente": {loading?} mientras se copia; null = cerrado.
  coachCopyPicker: null,

  tplsError: null,

  coachPicker: null,

  coachPCat: null,

  coachPQ: "",

  coachSettingsOpen: false,

  // Editor de preguntas (ver preguntas.js): copia de trabajo mientras está abierto, y el
  // error de la última lectura de coach_questions (tabla sin crear, sin conexión…).
  coachQEdit: null,

  coachQError: null,

  // Día (log_date), semana (week_start) y entreno (ts) elegidos en la ficha del cliente.
  // null = "Ninguno": la sección queda cerrada hasta que el coach elige uno.
  coachDailySel: null,

  coachCkSel: null,

  coachSessSel: null,
  // Fecha elegida en el selector de fotos de progreso ("" = Ninguno).
  coachPhotoSel: null,
  // Mensaje que el coach está escribiendo en "Notificación al cliente" y si se está enviando.
  notifDraft: "",
  notifSending: false,

  coachNameForm: null,

  // ids de ejercicios expandidos en el editor de rutina — por defecto todo colapsado
  // para no tener una interfaz gigante con muchos ejercicios (ver renderCoachRoutine()).
  coachExpandedEx: new Set(),

  // menú de acciones (subir/bajar/insertar/cambiar) abierto en la card de ejercicio, por id
  coachExMenu: null,

};

export let coachCopyPicker = false;

export let coachWeekSel = null;
