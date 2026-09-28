// Rutinas armadas para elegir en la bienvenida (y desde Entreno → "Ver rutinas armadas").
// Salen de la tabla rutinas_catalogo (supabase/rutinas-catalogo.sql), que cargan los
// administradores; si todavía no hay ninguna (o no hay conexión), se usan las de CATALOGO.
// para: "mujer" | "hombre" | "todos". A quien elige "Mujer" se le muestran las de mujer y
// las de todos; a "Hombre", las de hombre y las de todos; a "Prefiero no decir", todas.
//
import { DEFAULT, PPL_DAYS } from './data.js';
import { State } from './state.js';
import { migrateNames } from './storage.js';
import { uid } from './utils.js';

export const CATALOGO = [
  { id: "meso", nombre: "Meso 2 · Microciclo 8", para: "todos", desc: "Torso / Piernas / Pecho-Espalda-Hombro / Pierna-Brazo", days: DEFAULT.days },
  { id: "ppl", nombre: "PPL · 5 días", para: "todos", desc: "Tirón / Empuje / Piernas", days: PPL_DAYS },
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
