// Rutinas armadas para elegir en la bienvenida (y desde Entreno → "Ver rutinas armadas").
// Salen de la tabla rutinas_catalogo (supabase/rutinas-catalogo.sql), que cargan los
// administradores; si todavía no hay ninguna (o no hay conexión), se usan las de CATALOGO.
// Las de CATALOGO también están en supabase/rutinas-catalogo-1a5.sql (mismos id, nombres y
// ejercicios): si se cambia una acá, cambiarla también ahí.
// para: "mujer" | "hombre" | "todos". A quien elige "Mujer" se le muestran las de mujer y
// las de todos; a "Hombre", las de hombre y las de todos; a "Prefiero no decir", todas.
//
import { State } from './state.js';
import { migrateNames } from './storage.js';
import { uid } from './utils.js';

// Cómo se arman las de CATALOGO: músculos grandes (pecho, espalda, piernas y glúteos) 2 series
// por ejercicio; chicos (hombros, brazos, gemelos, abdominales) 3. Todas las series de 8 a 12
// repeticiones. Los nombres son los de la lista de ejercicios (EX_DB en data.js), así andan
// el video, el músculo, las variantes y el volumen.
export const GRANDES = ["pecho", "espalda", "cuadriceps", "isquios", "gluteos", "aductores"];
const REPS = "8-12";
let _n = 0;
const nid = p => p + "-" + (++_n).toString(36);
function ej(name, mus){
  const big = GRANDES.indexOf(mus) >= 0;
  return { id: nid("e"), name, mus, rir: big ? "2-1" : "1-0", rest: big ? "2'-3'" : "1:30-2'",
    sets: Array.from({ length: big ? 2 : 3 }, () => ({ id: nid("s"), kg: "", reps: "", targetKg: "", done: false, target: REPS })) };
}
// d("Nombre", "Lunes · Pecho · …", [["Ejercicio", "músculo"], …])
const d = (name, subtitle, list) => ({ id: nid("d"), name, subtitle, exercises: list.map(x => ej(x[0], x[1])) });

// Días que se repiten entre rutinas (cada rutina arma los suyos, sin compartir objetos).
const torsoA = (dia, brazos) => d("Torso A", dia + " · Pecho · Espalda · Hombros" + (brazos ? " · Brazos" : ""), [
  ["Press de banca plano (barra)", "pecho"], ["Remo con barra", "espalda"], ["Press inclinado con mancuernas", "pecho"], ["Jalón al pecho", "espalda"],
  ["Vuelos laterales con mancuernas", "hombros"]].concat(brazos ? [["Curl con barra Z", "biceps"], ["Extensión con soga", "triceps"]] : [["Encogimiento en polea", "abs"]]));
const piernaA = dia => d("Pierna A", dia + " · Cuádriceps · Isquios · Gemelos", [
  ["Sentadilla libre", "cuadriceps"], ["Peso muerto rumano", "isquios"], ["Prensa 45", "cuadriceps"], ["Curl femoral sentado", "isquios"],
  ["Gemelos de pie", "gemelos"], ["Encogimiento en polea", "abs"]]);
const torsoB = (dia, brazos) => d("Torso B", dia + " · Hombros · Espalda · Pecho" + (brazos ? " · Brazos" : ""), [
  ["Press de hombros con mancuernas", "hombros"], ["Jalón neutro", "espalda"], ["Press de pecho en máquina", "pecho"], ["Remo en polea baja", "espalda"],
  ["Aperturas en máquina", "pecho"]].concat(brazos ? [["Curl martillo", "biceps"], ["Press francés con mancuernas", "triceps"]] : [["Vuelos posteriores", "hombros"]]));
const piernaB = dia => d("Pierna B", dia + " · Glúteos · Cuádriceps · Isquios", [
  ["Sentadilla búlgara", "cuadriceps"], ["Empuje de cadera", "gluteos"], ["Extensión de cuádriceps", "cuadriceps"], ["Curl femoral acostado", "isquios"],
  ["Gemelos sentado", "gemelos"], ["Elevación de piernas", "abs"]]);

export const CATALOGO = [
  { id: "7a1c0001-0000-4000-8000-000000000001", nombre: "Cuerpo completo · 1 día", para: "todos",
    desc: "Una sesión por semana con lo básico de todo el cuerpo. Para arrancar o para semanas cargadas.", days: [
    d("Cuerpo completo", "Una vez por semana · Todo el cuerpo", [
      ["Prensa 45", "cuadriceps"], ["Curl femoral sentado", "isquios"], ["Press plano con mancuernas", "pecho"], ["Jalón al pecho", "espalda"],
      ["Remo en polea baja", "espalda"], ["Press de hombros con mancuernas", "hombros"], ["Encogimiento en polea", "abs"]]) ] },

  { id: "7a1c0002-0000-4000-8000-000000000002", nombre: "Cuerpo completo · 2 días", para: "todos",
    desc: "Día A y día B, con 2 o 3 días de descanso entre medio (por ejemplo, lunes y jueves).", days: [
    d("Día A", "Lunes · Piernas · Pecho · Espalda · Hombros · Bíceps", [
      ["Sentadilla en Smith", "cuadriceps"], ["Curl femoral sentado", "isquios"], ["Press plano con mancuernas", "pecho"], ["Jalón al pecho", "espalda"],
      ["Remo en máquina", "espalda"], ["Vuelos laterales con mancuernas", "hombros"], ["Curl con mancuernas", "biceps"]]),
    d("Día B", "Jueves · Piernas · Pecho · Espalda · Hombros · Tríceps", [
      ["Prensa 45", "cuadriceps"], ["Peso muerto rumano", "isquios"], ["Press inclinado con mancuernas", "pecho"], ["Jalón neutro", "espalda"],
      ["Press de hombros con mancuernas", "hombros"], ["Extensión con soga", "triceps"], ["Gemelos de pie", "gemelos"]]) ] },

  { id: "7a1c0003-0000-4000-8000-000000000003", nombre: "Cuerpo completo · 3 días", para: "todos",
    desc: "Días A, B y C en días alternados (lunes, miércoles y viernes). Ideal para empezar.", days: [
    d("Día A", "Lunes · Piernas · Pecho · Espalda · Hombros", [
      ["Sentadilla en Smith", "cuadriceps"], ["Curl femoral sentado", "isquios"], ["Press de banca plano (barra)", "pecho"], ["Remo en máquina", "espalda"],
      ["Jalón al pecho", "espalda"], ["Vuelos laterales con mancuernas", "hombros"], ["Encogimiento en polea", "abs"]]),
    d("Día B", "Miércoles · Piernas · Pecho · Espalda · Bíceps", [
      ["Peso muerto rumano", "isquios"], ["Extensión de cuádriceps", "cuadriceps"], ["Press inclinado con mancuernas", "pecho"], ["Aperturas en máquina", "pecho"],
      ["Remo en polea baja", "espalda"], ["Curl con mancuernas", "biceps"], ["Gemelos de pie", "gemelos"]]),
    d("Día C", "Viernes · Piernas · Pecho · Espalda · Hombros · Tríceps", [
      ["Prensa 45", "cuadriceps"], ["Curl femoral acostado", "isquios"], ["Cruce de poleas", "pecho"], ["Jalón neutro", "espalda"],
      ["Remo unilateral con mancuerna", "espalda"], ["Press de hombros con mancuernas", "hombros"], ["Press francés con mancuernas", "triceps"]]) ] },

  { id: "7a1c0004-0000-4000-8000-000000000004", nombre: "Glúteos y piernas · 3 días", para: "mujer",
    desc: "Dos días de glúteos y piernas y uno de torso (lunes, miércoles y viernes).", days: [
    d("Glúteos e isquios", "Lunes · Glúteos · Isquios · Gemelos", [
      ["Empuje de cadera", "gluteos"], ["Peso muerto rumano", "isquios"], ["Sentadilla búlgara", "cuadriceps"], ["Curl femoral sentado", "isquios"],
      ["Hiperextensión para glúteo", "gluteos"], ["Abductores", "gluteos"], ["Gemelos de pie", "gemelos"]]),
    d("Torso", "Miércoles · Espalda · Pecho · Hombros · Brazos", [
      ["Jalón al pecho", "espalda"], ["Press inclinado con mancuernas", "pecho"], ["Remo en polea baja", "espalda"], ["Remo unilateral con mancuerna", "espalda"],
      ["Press de hombros con mancuernas", "hombros"], ["Vuelos laterales con mancuernas", "hombros"], ["Extensión con soga", "triceps"]]),
    d("Glúteos y cuádriceps", "Viernes · Glúteos · Cuádriceps · Abdominales", [
      ["Sentadilla en Smith", "cuadriceps"], ["Prensa 45", "cuadriceps"], ["Puente de glúteo", "gluteos"], ["Zancada inversa", "cuadriceps"],
      ["Patada de glúteo en polea", "gluteos"], ["Abducción en polea", "gluteos"], ["Elevación de piernas", "abs"]]) ] },

  { id: "7a1c0005-0000-4000-8000-000000000005", nombre: "Torso / Pierna · 4 días", para: "todos",
    desc: "Dos días de torso y dos de pierna (lunes, martes, jueves y viernes).", days: [
    torsoA("Lunes", true), piernaA("Martes"), torsoB("Jueves", true), piernaB("Viernes") ] },

  { id: "7a1c0006-0000-4000-8000-000000000006", nombre: "Glúteos y piernas · 4 días", para: "mujer",
    desc: "Tres días con glúteos y uno de torso (lunes, martes, jueves y viernes).", days: [
    d("Glúteos e isquios", "Lunes · Glúteos · Isquios · Gemelos", [
      ["Empuje de cadera", "gluteos"], ["Peso muerto rumano", "isquios"], ["Curl femoral acostado", "isquios"], ["Hiperextensión para glúteo", "gluteos"],
      ["Abductores", "gluteos"], ["Gemelos de pie", "gemelos"]]),
    d("Torso", "Martes · Espalda · Pecho · Hombros · Brazos", [
      ["Jalón al pecho", "espalda"], ["Press plano con mancuernas", "pecho"], ["Remo en máquina", "espalda"], ["Vuelos laterales con mancuernas", "hombros"],
      ["Curl con mancuernas", "biceps"], ["Extensión con soga", "triceps"]]),
    d("Glúteos y cuádriceps", "Jueves · Glúteos · Cuádriceps", [
      ["Sentadilla en Smith", "cuadriceps"], ["Sentadilla búlgara", "cuadriceps"], ["Prensa 45", "cuadriceps"], ["Extensión de cuádriceps", "cuadriceps"],
      ["Patada de glúteo en polea", "gluteos"], ["Abducción en polea", "gluteos"]]),
    d("Glúteos y torso", "Viernes · Glúteos · Espalda · Hombros", [
      ["Empuje de cadera en máquina", "gluteos"], ["Step-up para glúteo", "gluteos"], ["Jalón neutro", "espalda"], ["Remo unilateral con mancuerna", "espalda"],
      ["Press de hombros con mancuernas", "hombros"], ["Vuelos laterales en polea", "hombros"], ["Encogimiento en polea", "abs"]]) ] },

  { id: "7a1c0007-0000-4000-8000-000000000007", nombre: "PPL · 5 días", para: "todos",
    desc: "Tirón, empuje y piernas, un día libre y después torso y pierna.", days: [
    d("Tirón (Pull)", "Lunes · Espalda · Bíceps · Hombro posterior", [
      ["Jalón al pecho", "espalda"], ["Remo T", "espalda"], ["Remo en polea baja unilateral", "espalda"], ["Vuelos posteriores", "hombros"],
      ["Curl en banco inclinado", "biceps"], ["Curl martillo en polea", "biceps"]]),
    d("Empuje (Push)", "Martes · Pecho · Hombros · Tríceps", [
      ["Press inclinado en Smith", "pecho"], ["Press de pecho en máquina", "pecho"], ["Peck deck", "pecho"], ["Vuelos laterales en polea", "hombros"],
      ["Press francés con barra", "triceps"], ["Katana en polea", "triceps"]]),
    d("Piernas (Legs)", "Miércoles · Cuádriceps · Isquios · Aductores · Gemelos", [
      ["Sentadilla libre", "cuadriceps"], ["Curl femoral acostado", "isquios"], ["Extensión de cuádriceps", "cuadriceps"], ["Hiperextensiones lumbares", "espalda"],
      ["Aductores en máquina", "aductores"], ["Gemelos de pie", "gemelos"], ["Encogimiento abdominal", "abs"]]),
    { id: nid("d"), name: "Descanso activo", subtitle: "Jueves · 30 minutos de cardio (caminar, bici o elíptico)", exercises: [] },
    d("Torso (Upper)", "Viernes · Pecho · Espalda · Hombros · Brazos", [
      ["Press inclinado con mancuernas", "pecho"], ["Jalón neutro", "espalda"], ["Remo en máquina", "espalda"], ["Cruce de poleas", "pecho"],
      ["Vuelos laterales con mancuernas", "hombros"], ["Curl con mancuernas", "biceps"], ["Extensión de tríceps unilateral en polea", "triceps"]]),
    d("Piernas (Lower)", "Sábado · Isquios · Cuádriceps · Gemelos", [
      ["Peso muerto rumano", "isquios"], ["Prensa 45", "cuadriceps"], ["Curl femoral sentado", "isquios"], ["Extensión de cuádriceps", "cuadriceps"],
      ["Gemelos sentado", "gemelos"], ["Elevación de piernas colgado", "abs"]]) ] },

  { id: "7a1c0008-0000-4000-8000-000000000008", nombre: "Torso / Pierna + Brazos · 5 días", para: "todos",
    desc: "Torso y pierna dos veces y un día de brazos y hombros (miércoles y domingo libres).", days: [
    torsoA("Lunes", false), piernaA("Martes"), torsoB("Jueves", false), piernaB("Viernes"),
    d("Brazos y hombros", "Sábado · Hombros · Bíceps · Tríceps", [
      ["Vuelos laterales en polea", "hombros"], ["Curl con barra Z", "biceps"], ["Press francés con mancuernas", "triceps"], ["Curl en banco inclinado", "biceps"],
      ["Extensión con soga", "triceps"], ["Curl martillo", "biceps"]]) ] },
];

// Las de la base (una vez por sesión). Si falla o está vacía, las de ejemplo.
let _base = null;
export async function cargarCatalogo(){
  if (_base) return _base;
  try {
    if (State.sb && State.cloudUser) {
      const r = await State.sb.from("rutinas_catalogo").select("id, nombre, para, descripcion, days").eq("activa", true).order("orden").order("nombre");
      if (!r.error && Array.isArray(r.data) && r.data.length) {
        _base = r.data.filter(x => Array.isArray(x.days) && x.days.length).map(x => { migrateNames(x.days); return { id: x.id, nombre: x.nombre, para: x.para, desc: x.descripcion || "", days: x.days }; });
        if (_base.length) return _base;
      }
    }
  } catch (e) {}
  _base = null;
  return CATALOGO;
}

// sexo: "f" | "m" | "x" (prefiero no decir: todas).
export function rutinasPara(sexo, lista){
  const all = lista || CATALOGO;
  if (sexo === "f") return all.filter(r => r.para === "mujer" || r.para === "todos");
  if (sexo === "m") return all.filter(r => r.para === "hombre" || r.para === "todos");
  return all.slice();
}

// Días que entrenan (sin contar los de descanso, que no tienen ejercicios).
export function diasDeEntreno(r){ return (r.days || []).filter(d => (d.exercises || []).length).length; }

// Copia de los días para el usuario: ids nuevos y series vacías. Las rutinas del catálogo
// pueden venir de la rutina de un alumno: sin los kilos que el coach le propuso a esa
// persona ("Tu coach propone …") ni sus audios (son de la carpeta de ese coach y quien
// entrena solo no los puede escuchar).
export function copiarDias(days){
  const out = JSON.parse(JSON.stringify(days || []));
  out.forEach(d => { d.id = uid(); (d.exercises || []).forEach(ex => { ex.id = uid(); delete ex.audio; delete ex.audioSecs; (ex.sets || []).forEach(st => { st.id = uid(); st.kg = ""; st.reps = ""; st.done = false; delete st.targetKg; }); }); });
  return out;
}

// Filtro por días por semana (0: todas). Orden: de menos a más días, como vienen.
export function rutinasDeDias(list, n){
  const all = (list || []).slice().sort((a, b) => diasDeEntreno(a) - diasDeEntreno(b));
  return n ? all.filter(r => diasDeEntreno(r) === n) : all;
}
