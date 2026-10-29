// «Pasar mis planillas»: leer en el equipo del coach sus planillas (.xlsx, .xlsm, .ods o .csv) y
// armar el texto que va a la IA. La planilla nunca sale entera del equipo: a la IA va solo lo que
// arma textoHoja() (ejercicios, series, reps, cargas, descansos y notas), sin mails, teléfonos,
// documentos ni links, sin las filas de datos personales o de salud, y con los nombres de la hoja,
// del archivo y de los alumnos cambiados por «[alumno]» (las palabras de los ejercicios de GIZE no
// se tocan). Si cambia qué se manda o qué se saca, la política (privacidad/index.html) tiene que
// cambiar en el mismo cambio.
// Los Excel y .ods se leen con SheetJS (vendor/, ver vendor/README.md), que se carga recién la
// primera vez que hace falta, como el lector de códigos de barras (ui/scanner.js). El .csv se lee
// a mano: no hace falta SheetJS.
import { EX_CATS, EX_DB, ES_MAP } from './data.js';

// Topes: MB por archivo, hojas en total, filas con texto por hoja, columnas, caracteres por celda
// (en lo que va a la IA) y caracteres por hoja (todo el texto de la hoja).
export const LIMITES = { mb: 5, hojas: 60, filas: 400, columnas: 40, celda: 120, hoja: 30000 };
const LEER_FILAS = 600;  // renglones que se leen por hoja, contando los vacíos
const LEER_CELDA = 500;  // lo que queda de cada celda en el equipo (a la IA van 120, ya limpias)
const XLSX_JS = "vendor/xlsx-0.20.3.mini.min.js";

// Sin fórmulas, HTML ni estilos: solo el texto como se ve (75 %, fechas). La fecha corta de Excel
// (formato 14) va como acá, día/mes/año, y no como en Estados Unidos.
const OPC = { type: "array", dense: true, sheetRows: LEER_FILAS, cellFormula: false, cellHTML: false, cellStyles: false,
  cellNF: false, cellDates: false, dateNF: "dd/mm/yyyy", bookVBA: false, bookDeps: false, bookFiles: false, bookProps: false };

let cargando = null;
// SheetJS (window.XLSX), una sola vez. Si no se pudo (sin internet la primera vez), se vuelve a
// probar en el próximo pedido.
export function cargarXLSX(){
  if (window.XLSX && window.XLSX.read) return Promise.resolve(window.XLSX);
  if (!cargando){
    cargando = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = XLSX_JS; s.async = true;
      const mal = () => { cargando = null; s.remove(); rej(new Error("No se pudo cargar el lector de planillas")); };
      s.onload = () => window.XLSX && window.XLSX.read ? res(window.XLSX) : mal();
      s.onerror = mal;
      document.head.appendChild(s);
    });
  }
  return cargando;
}

const norm = s => String(s == null ? "" : s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const palabras = s => norm(s).split(/[^a-z0-9]+/).filter(Boolean);
const sinExt = a => String(a || "").replace(/\.[a-z0-9]{1,8}$/i, "");
const extension = a => { const m = /\.([a-z0-9]{1,8})$/i.exec(String(a || "")); return m ? m[1].toLowerCase() : ""; };
// Texto de una celda: en una línea, sin caracteres raros y con un largo razonable.
const celdaTexto = s => String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\ufeff]/g, " ")
  .replace(/\s+/g, " ").trim().slice(0, LEER_CELDA);

// ---- Links ----
// Con http(s):// o www., o un dominio con algo después de la barra (youtu.be/…, instagram.com/…).
const RE_LINK = /\b(?:https?:\/\/|www\.)[^\s|<>"]+|\b(?:[a-z0-9-]+\.)+[a-z]{2,}\/[^\s|<>"]*/gi;
// El link de un video de YouTube o Instagram, siempre https (como pide la base para el video de un
// ejercicio, routine_days_ok). El perfil de alguien o cualquier otro link: null.
export function linkVideo(u){
  let s = String(u || "").trim().replace(/[).,;:!?\]]+$/, "");
  if (!s || s.length > 300) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = "https://" + s;
  s = s.replace(/^http:\/\//i, "https://");
  let url;
  try { url = new URL(s); } catch (e) { return null; }
  if (url.protocol !== "https:") return null;
  const h = url.hostname.toLowerCase().replace(/^(www|m)\./, ""), ruta = url.pathname;
  const video = h === "youtu.be" ? /^\/[\w-]+/.test(ruta)
    : h === "youtube.com" ? /^\/(shorts|embed|live)\/[\w-]+/.test(ruta) || (ruta === "/watch" && !!url.searchParams.get("v"))
    : h === "instagram.com" && /^\/(p|reels?|tv)\/[\w-]+/.test(ruta);
  if (!video) return null;
  url.username = ""; url.password = "";
  return url.href;
}
const videoEnTexto = s => { for (const m of String(s || "").match(RE_LINK) || []) { const v = linkVideo(m); if (v) return v; } return null; };

// ---- Datos personales ----
const RE_MAIL = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\b/gi;
// CUIT/CUIL (20-12345678-9, 20-12.345.678-9) y DNI (12.345.678, 12345678).
const RE_CUIT = /\b(?:2[0-7]|3[0-4])[-\s]?(?:\d{8}|\d{1,2}\.\d{3}\.\d{3})[-\s]?\d\b/g;
const RE_DNI = /\b(?:\d{1,2}\.\d{3}\.\d{3}|\d{7,8})\b/g;
// Teléfonos: 8 dígitos o más (con espacios, guiones, puntos o paréntesis) que terminan en un
// tramo de 4 seguidos, como «11 4567-8901» o «+54 9 351 456-7890», aunque atrás sigan otros
// números («11 4567-8901 18hs»); o que empiezan con «+», como «+598 99 123 456». Así no se comen
// las cargas y repeticiones («60-65-70-75», «12-10-8-6», «1000 800 600 400») ni las fechas
// («15-03-2026», «2025-2026»).
const RE_TEL = /\+\s?\d[\d\s().-]{6,}\d|(?:\(\s?\d+\s?\)\s?)?\d[\d\s().-]{2,}\d{4}(?!\d)/g;
const esTelefono = m => m.replace(/\D/g, "").length >= 8
  && !/^(?:\d{1,2}[-.]\d{1,2}[-.]|(?:19|20)\d\d\s?-\s?)(?:19|20)\d\d$/.test(m.trim());

// Etiquetas de datos personales o de salud. FUERTES: siempre son datos de la persona. DEBILES:
// el nombre; «Nombre» también puede ser el encabezado de los ejercicios («Nombre | Series | Reps»).
const FUERTES = new Set(["mail", "email", "e mail", "correo", "correo electronico", "telefono", "telefonos", "tel", "cel", "celular",
  "movil", "whatsapp", "wsp", "dni", "cuit", "cuil", "documento", "pasaporte", "edad", "fecha de nacimiento", "nacimiento",
  "cumpleanos", "direccion", "domicilio", "obra social", "prepaga", "contacto", "contacto de emergencia", "emergencia",
  "instagram", "ig", "facebook", "peso corporal", "peso actual", "peso inicial", "altura", "estatura", "talla", "imc",
  "grasa corporal", "lesion", "lesiones", "patologia", "patologias", "enfermedad", "enfermedades", "medicacion",
  "medicamento", "medicamentos", "alergia", "alergias", "cirugia", "cirugias", "operaciones", "embarazo", "antecedentes",
  "antecedentes medicos", "diagnostico", "apto medico", "salud", "datos personales"]);
const DEBILES = new Set(["nombre", "nombres", "apellido", "apellidos", "nombre y apellido", "apellido y nombre", "nombre completo",
  "alumno", "alumna", "cliente", "clienta", "atleta", "socio", "socia", "coach", "profe", "profesor", "profesora",
  "entrenador", "entrenadora", "nombre del alumno", "nombre de la alumna", "nombre del cliente", "nombre de la clienta",
  "datos del alumno", "datos de la alumna", "datos del cliente", "datos de la clienta"]);
// Estas también con algo atrás: «Teléfono de contacto», «Lesiones previas», «Edad actual».
const CON_MAS = ["mail", "email", "correo", "telefono", "celular", "whatsapp", "dni", "cuit", "cuil", "documento", "edad",
  "fecha de nacimiento", "direccion", "domicilio", "obra social", "lesion", "lesiones", "patologia", "patologias", "enfermedad",
  "enfermedades", "medicacion", "medicamento", "medicamentos", "alergia", "alergias", "cirugia", "cirugias", "antecedentes",
  "diagnostico", "salud"];
// Encabezados de una tabla de ejercicios: cortan un bloque de datos personales y dicen que
// «Nombre» es el del ejercicio.
const RUTINA = new Set(["ejercicio", "ejercicios", "serie", "series", "sets", "rep", "reps", "repeticiones", "carga", "cargas", "kg",
  "peso", "descanso", "pausa", "rir", "rpe", "tempo", "nota", "notas", "observaciones", "video", "videos", "dia", "dias",
  "semana", "bloque", "orden", "musculo", "grupo", "grupo muscular", "metodo", "tecnica", "intensidad", "volumen",
  "progresion", "objetivo", "exercise", "weight", "rest"]);
// «Mail: x» → { lab: "mail", resto: "x", dos: true }.
function etiqueta(c){
  const t = norm(c), m = /^([^:]{1,40}):\s*(.*)$/.exec(t), lab = m ? m[1] : t;
  return { lab: lab.replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim(), resto: m ? m[2] : "", dos: !!m };
}
const esLabel = l => FUERTES.has(l) || DEBILES.has(l) || CON_MAS.some(x => l.startsWith(x + " "));
const esEtiqueta = c => { const e = etiqueta(c); return !e.resto && esLabel(e.lab); };
const esRutina = c => { const e = etiqueta(c); return !e.resto && RUTINA.has(e.lab); };

// Saca de las filas los datos personales o de salud:
// - una fila de encabezados de datos («Nombre | Mail | Teléfono | Lesiones»): se saca y sus
//   columnas quedan vacías en las filas que siguen pegadas (hasta un renglón vacío o el
//   encabezado de una tabla de ejercicios);
// - en el encabezado de una tabla de ejercicios, una columna de datos personales o de salud
//   («Alumno | Ejercicio | Series | Reps» o «Ejercicio | Lesiones | Series»): queda vacía también
//   en las filas que siguen pegadas. «Nombre» solo no, porque ahí es el del ejercicio (salvo que
//   también haya «Apellido»);
// - «Lesiones: rodilla» en una celda: se vacía la celda;
// - «Edad | 34» o «Lesiones | rodilla | hombro»: se vacía desde la etiqueta hasta el final de la fila.
// Devuelve las filas que quedan y cuántas se tocaron.
function quitarPersonales(filas){
  const out = []; let cols = null, ant = -2, sacadas = 0;
  for (const f of filas){
    const c = (f.celdas || []).slice(), tabla = c.filter(esRutina).length >= 2;
    if (f.n !== ant + 1 || tabla) cols = null;
    ant = f.n;
    const llenas = [], labs = [];
    c.forEach((x, i) => { if (x) { llenas.push(i); if (esEtiqueta(x)) labs.push(i); } });
    if (labs.length >= 2 && labs.length * 2 >= llenas.length && llenas.every(i => labs.includes(i) || !/[\d@]/.test(c[i]))){
      cols = new Set(labs); sacadas++; continue;
    }
    if (tabla && labs.length){
      const apellido = labs.some(i => /^apellido/.test(etiqueta(c[i]).lab));
      const de = labs.filter(i => apellido || !/^nombres?$/.test(etiqueta(c[i]).lab));
      if (de.length) cols = new Set(de);
    }
    let toco = false;
    for (let k = 0; k < c.length; k++){
      if (!c[k]) continue;
      if (cols && cols.has(k)) { c[k] = ""; toco = true; continue; }
      const e = etiqueta(c[k]);
      if (!esLabel(e.lab)) continue;
      if (e.dos && e.resto) { c[k] = ""; toco = true; continue; }
      if (e.resto) continue;
      const sig = c.slice(k + 1).find(x => x);
      if (sig !== undefined && (esEtiqueta(sig) || esRutina(sig))) continue;
      for (let j = k; j < c.length; j++) c[j] = "";
      toco = true; break;
    }
    if (toco) sacadas++;
    out.push({ n: f.n, celdas: c });
  }
  return { filas: out, sacadas };
}

// Palabras que nunca se toman por nombres de personas: las de los ejercicios y grupos de GIZE y
// las de siempre en una planilla («Semana», «Rutina», los días, los meses…).
const GENERICAS = ("rutina rutinas plan planes planilla planillas semana semanas sem dia dias mes meses bloque bloques fase fases ciclo " +
  "mesociclo microciclo macrociclo entrenamiento entrenamientos entreno entrenos gym gimnasio hoja hojas sheet sheets libro copia copy " +
  "nueva nuevo final version borrador alumno alumna alumnos alumnas cliente clientes coach profe personal trainer online presencial " +
  "fuerza hipertrofia resistencia potencia definicion volumen tonificacion adaptacion base cardio core movilidad elongacion " +
  "estiramiento calentamiento activacion tecnica funcional circuito circuitos torso pierna piernas tren superior inferior upper " +
  "lower push pull legs full body fullbody split pecho espalda hombros brazos brazo gluteos abdomen abdominales lunes martes " +
  "miercoles jueves viernes sabado domingo enero febrero marzo abril mayo junio julio agosto septiembre setiembre octubre " +
  "noviembre diciembre week weeks day days month mujer mujeres hombre hombres principiante principiantes intermedio avanzado " +
  "avanzados nivel grupo dieta datos pagos indice ejercicio ejercicios series serie reps repeticiones carga cargas peso descanso " +
  "notas nota objetivo objetivos progresion video videos link mail tel doc del las los con para por sin una uno the and mis tus " +
  "excel google drive descarga export pdf xlsx xlsm csv ods").split(" ");
let COMUNES = null;
function comunes(){
  if (COMUNES) return COMUNES;
  COMUNES = new Set(GENERICAS);
  const sumar = s => palabras(s).forEach(w => COMUNES.add(w));
  Object.values(EX_DB).forEach(l => l.forEach(sumar));
  Object.keys(ES_MAP).forEach(k => { sumar(k); sumar(ES_MAP[k]); });
  EX_CATS.forEach(([k, l]) => { sumar(k); sumar(l); });
  return COMUNES;
}
// Las palabras de esos nombres que se tapan: de 3 letras o más, sin números y que no sean de
// ejercicios ni de las de siempre.
function privados(lista){
  const c = comunes(), out = new Set();
  for (const s of lista) for (const w of palabras(s)) if (w.length >= 3 && !/\d/.test(w) && !c.has(w)) out.add(w);
  return out;
}

// Limpia una celda para la IA: links («[video]» si es de YouTube o Instagram, si no «[link]»),
// mails, documentos, teléfonos y los nombres de `priv` («[alumno]»). «|» separa las columnas.
export function limpiar(t, priv){
  let s = String(t == null ? "" : t);
  s = s.replace(RE_LINK, u => linkVideo(u) ? "[video]" : "[link]");
  s = s.replace(RE_MAIL, "[mail]").replace(RE_CUIT, "[doc]").replace(RE_DNI, "[doc]");
  s = s.replace(RE_TEL, m => esTelefono(m) ? "[tel]" : m);
  if (priv && priv.size){
    s = s.replace(/[\p{L}\p{M}]+/gu, w => priv.has(norm(w)) ? "[alumno]" : w)
      .replace(/\[alumno\](?:[\s,.-]+\[alumno\])+/g, "[alumno]");
  }
  return s.replace(/\|/g, "/").replace(/\s+/g, " ").trim();
}
const corto = s => s.length > LIMITES.celda ? s.slice(0, LIMITES.celda - 1) + "…" : s;

// El texto de una hoja para la IA: un renglón por fila, con su número en la planilla adelante
// («12|Press banca|4|8-10||2'»), ya limpio (ver limpiar y quitarPersonales). archivo: el nombre
// del archivo; nombres: los de los alumnos vinculados (y el del coach, si se quiere), que también
// se tapan. Devuelve { texto, filas (renglones que van), cortada (no entró entera), sacadas
// (filas a las que se les sacaron datos personales) }.
export function textoHoja(hoja, { archivo = "", nombres = [] } = {}){
  const priv = privados([hoja && hoja.nombre, sinExt(archivo)].concat(nombres || []));
  const { filas, sacadas } = quitarPersonales((hoja && hoja.filas) || []);
  let texto = "", n = 0, cortada = !!(hoja && hoja.cortada);
  for (const f of filas){
    const cs = f.celdas.slice(0, LIMITES.columnas).map(c => corto(limpiar(c, priv)));
    while (cs.length && !cs[cs.length - 1]) cs.pop();
    if (!cs.length) continue;
    const linea = f.n + "|" + cs.join("|");
    if (texto.length + linea.length + 1 > LIMITES.hoja) { cortada = true; break; }
    texto += (texto ? "\n" : "") + linea; n++;
  }
  return { texto, filas: n, cortada, sacadas };
}

// ---- Leer los archivos ----
// La hoja con sus filas con texto ({ n: número de fila en la planilla, celdas }, hasta 400) y el
// link de video de cada fila ({ n: link }), de un hipervínculo o escrito en la celda.
function armarHoja(nombre, oculta, grilla, links, cortada){
  const filas = [], videos = {};
  grilla.forEach((cs, R) => {
    const c = cs.slice(0, LIMITES.columnas);
    while (c.length && !c[c.length - 1]) c.pop();
    if (!c.length) return;
    if (filas.length >= LIMITES.filas) { cortada = true; return; }
    const n = R + 1;
    filas.push({ n, celdas: c });
    const v = links[n] || c.map(videoEnTexto).find(Boolean);
    if (v) videos[n] = v;
  });
  return { nombre: String(nombre == null ? "" : nombre), oculta: !!oculta, filas, links: videos, cortada: !!cortada };
}

function hojaXLSX(X, nombre, ws, oculta){
  const data = (ws && ws["!data"]) || [], alto = Math.min(data.length, LEER_FILAS), grilla = [], links = {};
  for (let R = 0; R < alto; R++){
    const fila = data[R] || [], cs = [];
    for (let C = 0; C < Math.min(fila.length, LIMITES.columnas); C++){
      const cel = fila[C];
      let t = "";
      if (cel && cel.t && cel.t !== "e" && cel.t !== "z") { try { t = celdaTexto(X.utils.format_cell(cel)); } catch (e) { t = ""; } }
      cs.push(t);
      const v = cel && cel.l && linkVideo(cel.l.Target);
      if (v && !links[R + 1]) links[R + 1] = v;
    }
    grilla.push(cs);
  }
  // Celdas combinadas: lo de arriba se repite en las filas de abajo (un «Día 1» o un ejercicio
  // combinado a lo alto vale para cada fila). A lo ancho no: quedaría repetido en la misma fila.
  for (const m of (ws && ws["!merges"]) || []){
    if (!m || !m.s || !m.e || m.e.r <= m.s.r || m.s.r >= alto || m.s.c >= LIMITES.columnas) continue;
    const v = grilla[m.s.r][m.s.c];
    if (!v) continue;
    for (let R = m.s.r + 1; R <= Math.min(m.e.r, alto - 1); R++){
      const g = grilla[R];
      while (g.length <= m.s.c) g.push("");
      if (!g[m.s.c]) g[m.s.c] = v;
    }
  }
  return armarHoja(nombre, oculta, grilla, links, false);
}

// El .csv: UTF-8 y, si no es, Windows-1252 (el de Excel en castellano), o UTF-16 con su marca.
function decodificar(b){
  if (b[0] === 0xFF && b[1] === 0xFE) return new TextDecoder("utf-16le").decode(b);
  if (b[0] === 0xFE && b[1] === 0xFF) return new TextDecoder("utf-16be").decode(b);
  try { return new TextDecoder("utf-8", { fatal: true }).decode(b); }
  catch (e) { return new TextDecoder("windows-1252").decode(b); }
}
// Separador: el que aparece en más renglones (Excel en castellano usa «;», y ahí la coma es la
// de los decimales); si empatan, la coma.
function separador(txt){
  const lineas = txt.split(/\r\n|\n|\r/, 40).map(l => l.replace(/"[^"]*"/g, ""));
  let mejor = ",", punt = [-1, -1];
  for (const s of [",", ";", "\t"]){
    const p = [lineas.filter(l => l.includes(s)).length, lineas.reduce((a, l) => a + l.split(s).length - 1, 0)];
    if (p[0] > punt[0] || (p[0] === punt[0] && p[1] > punt[1])) { mejor = s; punt = p; }
  }
  return mejor;
}
// Filas del .csv, con comillas (y separadores o saltos de línea adentro) como Excel.
function partirCSV(txt, sep, max){
  const filas = []; let fila = [], campo = "", q = false;
  for (let i = 0; i < txt.length; i++){
    const ch = txt[i];
    if (q){
      if (ch !== '"') campo += ch;
      else if (txt[i + 1] === '"') { campo += '"'; i++; }
      else q = false;
      continue;
    }
    if (ch === '"' && campo === "") q = true;
    else if (ch === sep) { fila.push(campo); campo = ""; }
    else if (ch === "\n" || ch === "\r"){
      if (ch === "\r" && txt[i + 1] === "\n") i++;
      fila.push(campo); filas.push(fila); fila = []; campo = "";
      if (filas.length >= max) return filas;
    }
    else campo += ch;
  }
  if (campo !== "" || fila.length) { fila.push(campo); filas.push(fila); }
  return filas;
}
function hojaCSV(nombre, bytes){
  const txt = decodificar(bytes), filas = partirCSV(txt, separador(txt), LEER_FILAS + 1);
  const grilla = filas.slice(0, LEER_FILAS).map(f => f.slice(0, LIMITES.columnas).map(celdaTexto));
  return armarHoja(nombre, false, grilla, {}, filas.length > LEER_FILAS);
}

// ¿Es un Excel con contraseña? Adentro tiene «EncryptionInfo» (en UTF-16).
function conClave(b){
  const u = Array.from("EncryptionInfo").flatMap(ch => [ch.charCodeAt(0), 0]);
  busca: for (let i = 0; i + u.length <= b.length; i++){
    for (let j = 0; j < u.length; j++) if (b[i + j] !== u[j]) continue busca;
    return true;
  }
  return false;
}

// Lee los archivos que eligió el coach. Devuelve uno por archivo:
// { archivo, hojas: [{ nombre, oculta, filas: [{ n, celdas }], links: { n: link }, cortada }],
//   error?, sobran? }. error: "grande" (más de 5 MB), "xls" (.xls viejo: guardarlo como .xlsx),
// "formato" (no es .xlsx, .xlsm, .ods ni .csv), "clave" (tiene contraseña), "sin_lector" (no se
// pudo cargar SheetJS, sin internet) o "no_se_pudo" (dañado o no es una planilla). sobran: hojas
// que no se leyeron por el tope de 60 en total.
export async function leerArchivos(files){
  const out = [];
  let quedan = LIMITES.hojas;
  for (const f of Array.from(files || [])){
    const archivo = String((f && f.name) || "Planilla"), ext = extension(archivo), r = { archivo, hojas: [] };
    out.push(r);
    if (!f || typeof f.arrayBuffer !== "function") { r.error = "no_se_pudo"; continue; }
    if (f.size > LIMITES.mb * 1024 * 1024) { r.error = "grande"; continue; }
    if (ext === "xls") { r.error = "xls"; continue; }
    if (!["xlsx", "xlsm", "ods", "csv"].includes(ext)) { r.error = "formato"; continue; }
    let bytes;
    try { bytes = new Uint8Array(await f.arrayBuffer()); } catch (e) { r.error = "no_se_pudo"; continue; }
    if (ext === "csv") { if (quedan > 0) { r.hojas.push(hojaCSV(sinExt(archivo), bytes)); quedan--; } else r.sobran = 1; continue; }
    // En el formato viejo de Office (el de los .xls) vienen los .xlsx con contraseña y los .xls
    // con el nombre cambiado.
    if (bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0) { r.error = conClave(bytes) ? "clave" : "xls"; continue; }
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4B) { r.error = "no_se_pudo"; continue; }
    let X, wb;
    try { X = await cargarXLSX(); } catch (e) { r.error = "sin_lector"; continue; }
    try { wb = X.read(bytes, OPC); } catch (e) { r.error = /password|ods encryption/i.test(String(e && e.message)) ? "clave" : "no_se_pudo"; continue; }
    const vis = (wb.Workbook && wb.Workbook.Sheets) || [];
    (wb.SheetNames || []).forEach((nombre, i) => {
      if (quedan <= 0) { r.sobran = (r.sobran || 0) + 1; return; }
      quedan--;
      r.hojas.push(hojaXLSX(X, nombre, wb.Sheets[nombre], !!(vis[i] && vis[i].Hidden)));
    });
  }
  return out;
}

// ---- Para elegir las hojas ----
const NO_RUTINA = /\b(dietas?|nutricion|alimentacion|comidas?|pagos?|cobros?|cuotas?|datos|indice|contactos?)\b/;
// ¿Viene tildada? Con al menos 2 filas con texto, no oculta y que no se llame Dieta, Pagos, Datos, Índice…
export function pareceRutina(h){
  return !!h && !h.oculta && ((h.filas && h.filas.length) || 0) >= 2 && !NO_RUTINA.test(norm(h.nombre));
}
const RE_SEMANA = /^(?:semana|sem|week|wk|s)\s*[.:#nº°-]*\s*(\d{1,2})\b/;
// Si las hojas son semanas («Semana 1», «Semana 2»…), la última que tiene algo (su índice); si
// no, -1. De una progresión por semanas se pasa la última.
export function ultimaSemana(hojas){
  let mejor = -1, num = -1, cuantas = 0;
  (hojas || []).forEach((h, i) => {
    const m = h && !h.oculta && h.filas && h.filas.length ? RE_SEMANA.exec(norm(h.nombre)) : null;
    if (!m) return;
    cuantas++;
    if (+m[1] >= num) { num = +m[1]; mejor = i; }
  });
  return cuantas >= 2 ? mejor : -1;
}
// Las hojas de un archivo que vienen tildadas: las que parecen rutinas y, si son semanas, solo la última.
export function tildadas(hojas){
  const u = ultimaSemana(hojas);
  return (hojas || []).map((h, i) => pareceRutina(h) && (u < 0 || i === u || !RE_SEMANA.test(norm(h.nombre))));
}

// ¿De qué alumno es la hoja? Se adivina en el equipo, sin IA, comparando el nombre de la hoja (y,
// si no alcanza, el del archivo) con los de los clientes ({ id, full_name }). Devuelve el id o
// null si no hay uno claro (dos «Juan» empatan; «Juan P.» desempata por la inicial).
export function adivinarAlumno(nombreHoja, archivo, clientes){
  const lista = (clientes || []).filter(c => c && c.id).map(c => ({ id: c.id, p: palabras(c.full_name || c.nombre || "") }));
  if (!lista.length) return null;
  const c0 = comunes();
  for (const fuente of [nombreHoja, sinExt(archivo)]){
    const ws = palabras(fuente).filter(w => !/\d/.test(w) && !c0.has(w));
    const largas = ws.filter(w => w.length >= 3), iniciales = ws.filter(w => w.length === 1);
    if (!largas.length) continue;
    let mejor = null, punt = 0, empate = false;
    for (const c of lista){
      let p = 0;
      for (const w of largas){
        if (c.p.includes(w)) p += 2;
        else if (w.length >= 4 && c.p.some(x => x.length >= 4 && (x.startsWith(w) || w.startsWith(x)))) p += 1;
      }
      if (p) p += iniciales.filter(i => c.p.some(x => x[0] === i && !largas.includes(x))).length / 2;
      if (p > punt) { mejor = c.id; punt = p; empate = false; }
      else if (p && p === punt) empate = true;
    }
    if (mejor && !empate) return mejor;
  }
  return null;
}
