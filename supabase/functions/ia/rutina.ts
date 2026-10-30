// Lo que comparten las dos funciones de IA del coach en la función «ia»: «Pasar mis planillas»
// (modo «planilla») y «Armar con IA» (modo «rutina»). Cada modo pone sus instrucciones, su pedido y
// sus topes; acá está lo común:
// - EJERCICIOS: la lista de ejercicios de GIZE (EX_DB de app/core/data.js) numerada, un renglón
//   «número;nombre;grupo». La IA elige de la lista poniendo el número y copiando el nombre (no hay un
//   enum de nombres en el esquema: con más de 260 el esquema puede ser demasiado grande para la API, y
//   la planilla necesita poder dejar nombres propios). Va primero en el pedido, con caché de 1 hora:
//   es siempre el mismo texto mientras no cambie la lista de la app.
// - Los pedazos del esquema de la respuesta (rutina → días → ejercicios → series).
// - rutinaPost: lo que contestó la IA → el «borrador» que la app convierte en días de GIZE
//   (app/core/rutina-borrador.js). Revisa cada elección (número, nombre copiado y al menos una palabra
//   en común) y recorta todo a lo que entra en una rutina. Las cuentas las hace el código, no la IA.
// - limpiarTexto: la misma limpieza de mails, teléfonos y documentos que hace la app
//   (app/core/planilla.js), repetida acá por si llega algo sin limpiar.
// La lista llega por parámetro desde index.ts (que importa ./data.js): así las pruebas la pueden
// simular (tests/funcion.mjs solo cambia lo que importa index.ts).

// ---------- la lista ----------
export type Ejercicios = {
  lista: { nombre: string; grupos: string[] }[]; // el número de cada uno es su lugar en la lista
  texto: string; // el bloque EJERCICIOS que va a la IA
  porClave: Map<string, number>; // nombre o alias de ES_MAP (sin tildes ni mayúsculas) → número
  grupo: Map<string, string>; // clave o nombre de un grupo («biceps», «Bíceps») → su clave
};

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
// Un nombre para comparar: sin tildes, mayúsculas, lo de entre paréntesis ni signos.
// «Press de banca plano (barra)» → «press de banca plano»; «Prensa 45°» → «prensa 45».
export const clave = (s: unknown) => sinTildes(String(s == null ? "" : s).replace(/\([^)]*\)/g, " ")).replace(/[^a-z0-9]+/g, " ").trim();

// La lista, armada una sola vez con EX_DB, EX_CATS y ES_MAP de app/core/data.js. Un nombre que está
// en varios grupos va una vez, con sus grupos («Curl martillo;biceps,antebrazo»). Los que la app
// renombra a otro de la lista al abrir la rutina (ES_MAP: «Curl Bayesian» pasa a «Curl en polea detrás
// del cuerpo») no van, para que la IA no vea dos nombres del mismo ejercicio: los encuentra el alias.
export function ejercicios(exDb: Record<string, readonly string[]>, exCats: ReadonlyArray<ReadonlyArray<string>>, esMap: Record<string, string>): Ejercicios {
  const grupos: Record<string, string[]> = {}, orden: string[] = [];
  for (const [k] of exCats) {
    for (const n of exDb[k] || []) {
      if (!grupos[n]) { grupos[n] = []; orden.push(n); }
      if (!grupos[n].includes(k)) grupos[n].push(k);
    }
  }
  const lista = orden.filter((n) => !(esMap[n] && esMap[n] !== n && grupos[esMap[n]])).map((n) => ({ nombre: n, grupos: grupos[n] }));
  const porClave = new Map<string, number>();
  lista.forEach((e, i) => { if (!porClave.has(clave(e.nombre))) porClave.set(clave(e.nombre), i); });
  for (const [alias, n] of Object.entries(esMap)) {
    const i = porClave.get(clave(n));
    if (i !== undefined && !porClave.has(clave(alias))) porClave.set(clave(alias), i);
  }
  const grupo = new Map<string, string>();
  for (const [k, nombre] of exCats) { grupo.set(clave(k), k); grupo.set(clave(nombre), k); }
  const texto = "EJERCICIOS (número;nombre;grupo):\n" + lista.map((e, i) => i + ";" + e.nombre + ";" + e.grupos.join(",")).join("\n");
  return { lista, texto, porClave, grupo };
}

// El bloque EJERCICIOS para «system»: primero y con caché de 1 hora, igual en los dos modos.
export const bloqueEjercicios = (ej: Ejercicios) => ({ type: "text", text: ej.texto, cache_control: { type: "ephemeral", ttl: "1h" } });

// Cómo usar la lista y cómo escribir las series: va en las instrucciones de cada modo.
export const COMO_EJERCICIOS =
  "Cada ejercicio sale de EJERCICIOS: poné su número en numero y copiá su nombre tal cual en nombre_lista. Elegí por lo que es (el " +
  "mismo movimiento y el mismo elemento: barra, mancuernas, máquina o polea), no por lo que se le parece; si ninguno corresponde " +
  "bien, numero -1 y nombre_lista vacío. Las series van una por una, en orden: en objetivo las repeticiones o el tiempo como lo " +
  "escribe un coach ('8-12', '10', '45 s', 'al fallo') y en kg solo el número de la carga ('60', '22,5'); un porcentaje o un RPE va " +
  "en la nota del ejercicio. El descanso como '90 s', '2 min' o \"2'-3'\". Marcá dudoso = true si no estás seguro del ejercicio o " +
  "de las series.";

// ---------- el esquema ----------
// Salida JSON con esquema: todos los campos obligatorios y nada de más. Sin topes de cantidad ni de
// largo (la API no los acepta): lo que sobre se recorta en rutinaPost.
export const DIAS_SEMANA = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

const objeto = (properties: Record<string, unknown>) =>
  ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });

export const SERIE = objeto({
  objetivo: { type: "string", description: "Repeticiones o tiempo de esta serie, como lo escribe un coach: '8-12', '10', '45 s', 'al fallo'. Vacío si no dice" },
  kg: { type: "string", description: "La carga de esta serie en kg, solo el número ('60', '22,5'). Vacío si no dice. Un porcentaje o un RPE no va acá: va en la nota" },
});

// fila: en las planillas, de qué fila sale cada ejercicio (para mostrar cómo se leyó).
export function esquemaEjercicio({ fila = false }: { fila?: boolean } = {}) {
  return objeto({
    ...(fila ? { fila: { type: "integer", description: "Número de la fila de la planilla de donde sale (el número antes del primer «|»)" } } : {}),
    nombre: { type: "string", description: "El ejercicio como lo nombra la planilla o el pedido (ej: 'Press banca')" },
    numero: { type: "integer", description: "Número del ejercicio de EJERCICIOS que corresponde (mismo movimiento y elemento). -1 si ninguno corresponde bien" },
    nombre_lista: { type: "string", description: "El nombre de ese ejercicio copiado tal cual de EJERCICIOS. Vacío si numero es -1" },
    grupo: { type: "string", description: "El grupo de ese ejercicio en EJERCICIOS (si tiene más de uno, el que trabaja en este día). Si numero es -1, el grupo que más trabaja, escrito como en EJERCICIOS; vacío si no sabés" },
    series: { type: "array", description: "Una por serie, en orden", items: SERIE },
    descanso: { type: "string", description: "Descanso entre series ('90 s', '2 min', \"2'-3'\"). Vacío si no dice" },
    rir: { type: "string", description: "RIR ('2', '2-1'). Vacío si no dice" },
    progresion: { type: "string", description: "Cómo progresar semana a semana, si lo dice (ej: 'sumar 1 rep por semana'). Vacío si no" },
    nota: { type: "string", description: "Indicación técnica corta para el alumno, solo si suma. Vacío si no" },
    ss: { type: "boolean", description: "true si va en superserie con el ejercicio que sigue" },
    dudoso: { type: "boolean", description: "true si no estás seguro de qué ejercicio es o de cómo leíste sus series" },
  });
}

export function esquemaDia(o: { fila?: boolean } = {}) {
  return objeto({
    nombre: { type: "string", description: "Nombre corto del día (ej: 'Torso A', 'Pierna', 'Día 1')" },
    dias_semana: { type: "array", description: "Qué días de la semana se hace. Vacío si no dice", items: { type: "string", enum: DIAS_SEMANA } },
    nota: { type: "string", description: "Una indicación para todo el día, solo si suma. Vacío si no" },
    ejercicios: { type: "array", description: "En el orden en que se hacen", items: esquemaEjercicio(o) },
  });
}

// La respuesta entera, lo común de los dos modos (extra: lo propio de cada uno, antes de los días).
export function esquemaRutina(o: { fila?: boolean; extra?: Record<string, unknown> } = {}) {
  return objeto({
    hay_rutina: { type: "boolean", description: "Si hay una rutina de entrenamiento para armar" },
    nombre: { type: "string", description: "Nombre corto de la rutina (ej: 'Hipertrofia · 4 días'), sin nombres de personas" },
    nota: { type: "string", description: "Una frase corta si algo se supuso o no se entendió. Vacío si no hace falta" },
    ...(o.extra || {}),
    dias: { type: "array", description: "Los días de la rutina, en orden", items: esquemaDia({ fila: o.fila }) },
  });
}

// ---------- la limpieza ----------
// La misma regla que app/core/planilla.js (limpiar): mails, CUIT o CUIL, DNI y teléfonos. Los links
// quedan como «[link]». Se limpia renglón por renglón (los renglones y los «|» de la planilla quedan).
const RE_LINK = /\b(?:https?:\/\/|www\.)[^\s|<>"]+|\b(?:[a-z0-9-]+\.)+[a-z]{2,}\/[^\s|<>"]*/gi;
const RE_MAIL = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\b/gi;
const RE_CUIT = /\b(?:2[0-7]|3[0-4])[-\s]?(?:\d{8}|\d{1,2}\.\d{3}\.\d{3})[-\s]?\d\b/g;
const RE_DNI = /\b(?:\d{1,2}\.\d{3}\.\d{3}|\d{7,8})\b/g;
// Teléfonos: 8 dígitos o más que terminan en un tramo de 4 seguidos, o que empiezan con «+»; así no
// se comen las cargas y repeticiones («60-65-70-75», «12-10-8-6») ni las fechas («15-03-2026»).
const RE_TEL = /\+\s?\d[\d\s().-]{6,}\d|(?:\(\s?\d+\s?\)\s?)?\d[\d\s().-]{2,}\d{4}(?!\d)/g;
const esTelefono = (m: string) => m.replace(/\D/g, "").length >= 8
  && !/^(?:\d{1,2}[-.]\d{1,2}[-.]|(?:19|20)\d\d\s?-\s?)(?:19|20)\d\d$/.test(m.trim());
const RAROS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\ufeff]/g;

export function limpiarTexto(t: unknown): string {
  return String(t == null ? "" : t).split(/\r\n|\n|\r/).map((l) => l.replace(RAROS, " ")
    .replace(RE_LINK, "[link]").replace(RE_MAIL, "[mail]").replace(RE_CUIT, "[doc]").replace(RE_DNI, "[doc]")
    .replace(RE_TEL, (m) => esTelefono(m) ? "[tel]" : m)
    .replace(/\s+/g, " ").trim()).join("\n");
}

// ---------- la respuesta ----------
export type SerieBorrador = { objetivo: string; kg: string };
export type EjBorrador = {
  nombre: string; // el de la lista tal cual, o el propio (solo con propios)
  grupo: string; // clave de EX_CATS, o vacío
  propio: boolean; // no es de la lista de GIZE: sin video ni grupo de GIZE
  dudoso: boolean; // para revisar: la IA dudó o lo elegido no comparte ninguna palabra con lo que decía
  series: SerieBorrador[];
  timed: boolean; // las series son de tiempo («45 s»)
  descanso: string; rir: string; nota: string; progresion: string;
  ss: boolean; // va en superserie con el que sigue (nunca el último del día)
  fila?: number; // en las planillas, la fila de donde sale
};
export type DiaBorrador = { nombre: string; dias: number[]; nota: string; ejercicios: EjBorrador[] };
export type Borrador = { hay_rutina: boolean; nombre: string; nota: string; dias: DiaBorrador[] };

// Lo máximo que entra en un borrador: días, ejercicios por día, ejercicios en total y series por
// ejercicio. Cada modo puede pedir menos («Armar con IA»: 7 días y 12 ejercicios por día).
export const TOPES = { dias: 14, ejercicios: 25, total: 200, series: 10 };
export const SIN_EJERCICIOS = "No quedó ningún ejercicio de la lista de GIZE: armala a mano.";

const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? v : {}) as Record<string, unknown>;
// Lo que la limpieza de la app deja en lugar de un dato («[alumno]», «[tel]»…) no va en la rutina:
// «Rutina de [alumno]» queda «Rutina».
const MARCAS = /(?:\b(?:de|del|para|a)\s+)?\[alumno\]|\[(?:mail|tel|doc|link|video)\]/gi;
const txt = (v: unknown, max: number) => typeof v !== "string" ? "" : v.replace(MARCAS, " ").replace(RAROS, " ").replace(/\s+/g, " ")
  .replace(/\s+([,.;:])/g, "$1").replace(/^(?:[\s–·:,|]|[-.](?!\d))+|[\s\-–·:,|]+$/g, "").slice(0, max).trim();

// Las palabras que importan de un nombre (también sin la «s» o el «es» del plural). Las del elemento
// (barra, polea, máquina…) no cuentan: «Remo en polea baja» no es «Jalón en polea».
const VACIAS = new Set(["con", "sin", "del", "las", "los", "una", "uno", "para", "por", "the", "and", "with",
  "barra", "mancuerna", "maquina", "polea", "smith", "banco", "cable", "disco", "kettlebell", "soga", "banda"]);
const formas = (w: string) => [w, w.replace(/s$/, ""), w.replace(/es$/, "")];
const palabras = (s: string) => new Set(clave(s).split(" ").filter((w) => w.length > 2 && !/\d/.test(w) && !formas(w).some((x) => VACIAS.has(x)))
  .flatMap(formas).filter((w) => w.length > 2));

// El ejercicio de la lista que corresponde, o null:
// 1) si lo que dice la planilla o el pedido es un nombre de la lista o un alias de ES_MAP («Hip
//    Thrust», «RDL»), ese, sin depender de la IA;
// 2) si no, lo que eligió la IA: el número y el nombre copiado tienen que coincidir (con una lista
//    larga el número se puede correr unos renglones); si no coinciden, vale el nombre copiado;
// 3) y lo elegido tiene que compartir al menos una palabra con lo que decía: si no, queda para revisar.
export function eleccion(ej: Ejercicios, numero: unknown, nombreLista: unknown, nombre: unknown): { i: number; dudoso: boolean } | null {
  const dice = typeof nombre === "string" ? nombre : "";
  const directo = ej.porClave.get(clave(dice));
  if (directo !== undefined) return { i: directo, dudoso: false };
  const nl = clave(nombreLista);
  if (!nl) return null;
  const n = Number(numero);
  const i = Number.isInteger(n) && n >= 0 && n < ej.lista.length && clave(ej.lista[n].nombre) === nl ? n : ej.porClave.get(nl);
  if (i === undefined) return null;
  const p = palabras(dice);
  return { i, dudoso: ![...palabras(ej.lista[i].nombre)].some((w) => p.has(w)) };
}

// «60 kg», «22,5», «-30» (asistida) → el número; otra cosa → null.
const kgDe = (s: string) => { const t = s.replace(/\s*(?:kgs?|kilos?)\.?$/i, "").trim(); return /^-?\d{1,4}(?:[.,]\d{1,2})?$/.test(t) ? t : null; };
// Tres números o más («12-10-8-6», «60/65/70»): uno por serie. Dos («8-12») son un rango.
const secuencia = (s: string, sep: RegExp, ok: (x: string) => boolean) => {
  const p = s.split(sep).filter(Boolean);
  return p.length >= 3 && p.every(ok) ? p : null;
};
const RE_TIEMPO = /^(?:\d+(?:[.,]\d+)?\s*(?:-|a)\s*)?\d+(?:[.,]\d+)?\s*(?:s|seg\.?|segundos?|''|"|min\.?|minutos?|')$|^\d{1,2}:\d{2}$/i;

// Las series: una por serie con su objetivo y su carga. Si la IA dejó todo en una sola, se parte acá:
// «4x10» son 4 de 10, «12-10-8-6» una por número, «8@70kg» lleva la carga y «60-65-70-75» va una por
// serie. Una carga que no es un número (75 %, RPE 8) vuelve aparte para la nota.
function seriesPost(v: unknown, max: number): { series: SerieBorrador[]; carga: string[] } {
  let s = (Array.isArray(v) ? v : []).slice(0, 40).map((x) => ({ objetivo: txt(obj(x).objetivo, 40), kg: txt(obj(x).kg, 40) }));
  s = s.map((x) => { const m = /^(.*?)\s*@\s*(.+)$/.exec(x.objetivo); return m && !x.kg ? { objetivo: m[1], kg: m[2] } : x; });
  if (s.length === 1) {
    const { objetivo, kg } = s[0];
    const nx = /^(\d{1,2})\s*[x×*]\s*(.*)$/i.exec(objetivo);
    const reps = nx ? null : secuencia(objetivo, /\s*[-/;,]\s*|\s+/, (x) => /^\d{1,3}$/.test(x));
    if (nx && +nx[1] > 0) s = Array.from({ length: +nx[1] }, () => ({ objetivo: nx[2].trim(), kg }));
    else if (reps) s = reps.map((r) => ({ objetivo: r, kg }));
  }
  if (s.length && s.every((x) => x.kg === s[0].kg)) {
    const ks = secuencia(s[0].kg, /\s*[-/;]\s*|\s+/, (x) => kgDe(x) !== null);
    if (ks && (s.length === 1 || s.length === ks.length)) s = ks.map((k, i) => ({ objetivo: (s[i] || s[0]).objetivo, kg: k }));
  }
  const carga: string[] = [];
  const series = s.slice(0, max).map((x) => {
    const k = x.kg ? kgDe(x.kg) : "";
    if (k === null && !carga.includes(x.kg)) carga.push(x.kg);
    return { objetivo: x.objetivo.slice(0, 20).trim(), kg: k || "" };
  });
  return { series: series.length ? series : [0, 1, 2].map(() => ({ objetivo: "", kg: "" })), carga };
}

function ejercicioPost(x: Record<string, unknown>, ej: Ejercicios, propios: boolean, maxSeries: number): EjBorrador | null {
  const dice = txt(x.nombre, 80), lista = txt(x.nombre_lista, 80);
  const el = eleccion(ej, x.numero, lista, dice || lista);
  const g = ej.grupo.get(clave(x.grupo)) || "";
  let nombre: string, grupo: string;
  if (el) { const e = ej.lista[el.i]; nombre = e.nombre; grupo = e.grupos.includes(g) ? g : e.grupos[0]; }
  else if (propios && dice) { nombre = dice.slice(0, 60).trim(); grupo = g; }
  else return null;
  const { series, carga } = seriesPost(x.series, maxSeries);
  const conObjetivo = series.filter((s) => s.objetivo);
  const e: EjBorrador = {
    nombre, grupo, propio: !el, dudoso: x.dudoso === true || !!(el && el.dudoso), series,
    timed: conObjetivo.length > 0 && conObjetivo.every((s) => RE_TIEMPO.test(s.objetivo)),
    descanso: txt(x.descanso, 20), rir: txt(x.rir, 10),
    nota: [txt(x.nota, 160), carga.length ? "Carga: " + carga.join(", ") : ""].filter(Boolean).join(" · ").slice(0, 160).trim(),
    progresion: txt(x.progresion, 120), ss: x.ss === true,
  };
  const fila = Number(x.fila);
  if (Number.isInteger(fila) && fila > 0 && fila <= 100_000) e.fila = fila;
  return e;
}

const DIA_NUM: Record<string, number> = { lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6, domingo: 0 };
const SEMANA = [1, 2, 3, 4, 5, 6, 0]; // de lunes a domingo, como Date.getDay() (domingo = 0)
const diasSemana = (v: unknown) => {
  const s = new Set((Array.isArray(v) ? v : []).map((d) => DIA_NUM[clave(d)]).filter((n) => n !== undefined));
  return SEMANA.filter((n) => s.has(n));
};

// Lo que contestó la IA → el borrador. propios: deja los ejercicios que no están en la lista con su
// nombre (las planillas); sin propios, se sacan. Los días sin ejercicios no van; si no queda ninguno,
// no hay rutina. Una superserie se une solo con un ejercicio que quedó: si el que seguía se sacó, el
// anterior sigue unido solo si el sacado también iba con el siguiente.
export function rutinaPost(out: Record<string, unknown> | null, ej: Ejercicios, o: { propios?: boolean; topes?: Partial<typeof TOPES> } = {}): Borrador {
  const tope = { ...TOPES, ...(o.topes || {}) };
  const nota = txt(out && out.nota, 200);
  if (!out || out.hay_rutina !== true) return { hay_rutina: false, nombre: "", nota, dias: [] };
  const dias: DiaBorrador[] = [];
  let total = 0;
  for (const d0 of Array.isArray(out.dias) ? out.dias : []) {
    if (dias.length >= tope.dias || total >= tope.total) break;
    const d = obj(d0), ejs: EjBorrador[] = [];
    for (const x0 of Array.isArray(d.ejercicios) ? d.ejercicios : []) {
      if (ejs.length >= tope.ejercicios || total + ejs.length >= tope.total) break;
      const x = obj(x0), e = ejercicioPost(x, ej, !!o.propios, tope.series);
      if (e) ejs.push(e);
      else if (ejs.length && x.ss !== true) ejs[ejs.length - 1].ss = false;
    }
    if (!ejs.length) continue;
    ejs[ejs.length - 1].ss = false;
    total += ejs.length;
    dias.push({ nombre: txt(d.nombre, 60) || "Día " + (dias.length + 1), dias: diasSemana(d.dias_semana), nota: txt(d.nota, 160), ejercicios: ejs });
  }
  if (!dias.length) return { hay_rutina: false, nombre: "", nota: nota || SIN_EJERCICIOS, dias: [] };
  return { hay_rutina: true, nombre: txt(out.nombre, 60) || "Rutina con IA", nota, dias };
}
