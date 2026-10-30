// El borrador de rutina que arma la IA del coach («Pasar mis planillas» y «Armar con IA») → los
// días de una rutina de GIZE, listos para abrir en el editor de siempre. Nada se guarda acá: el
// coach lo revisa y recién al tocar «Guardar» queda en su rutina o en la del alumno.
// El borrador es lo que devuelve la función «ia» (rutinaPost en supabase/functions/ia/rutina.ts):
//   { hay_rutina, nombre, nota, dias: [{ nombre, dias: [0-6], nota, ejercicios: [{ nombre, grupo,
//     propio, dudoso, series: [{ objetivo, kg }], timed, descanso, rir, nota, progresion, ss, fila? }] }] }
// Igual se revisa todo de nuevo: ids nuevos (los de la nube tienen que pasar routine_days_ok), el
// nombre exacto de la lista de ejercicios (así andan el video, el grupo y el volumen), videos solo
// https y los mismos topes.
import { EX_DB } from './data.js';
import { diasDe } from './diasemana.js';
import { exKey, isTimedEx, mkSet, norm, pickMuscle, uid } from './utils.js';

// Días, ejercicios por día y series por ejercicio (los mismos de la función).
export const TOPES = { dias: 14, ejercicios: 25, series: 10 };

const tx = (v, max) => typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max).trim() : "";

// El nombre exacto de la lista de ejercicios, sin importar mayúsculas, tildes ni los nombres viejos
// que la app renombra (ES_MAP, por exKey): «press plano CON mancuernas» → «Press plano con mancuernas».
let EXACTO = null;
function exacto(nombre){
  if (!EXACTO){
    EXACTO = new Map();
    for (const k in EX_DB) for (const n of EX_DB[k]){
      const c = exKey(n), propio = c === norm(n.trim().replace(/\s+/g, " "));
      if (propio || !EXACTO.has(c)) EXACTO.set(c, n);
    }
  }
  return EXACTO.get(exKey(nombre)) || null;
}

// Un ejercicio del borrador → uno de GIZE, o null si no va (no es de la lista y no se aceptan
// propios, o no tiene nombre).
function ejercicio(e, propios, links){
  const dicho = tx(e && e.nombre, 60);
  if (!dicho) return null;
  const name = exacto(dicho);
  if (!name && !propios) return null;
  const grupo = typeof e.grupo === "string" ? e.grupo : "";
  const series = (Array.isArray(e.series) && e.series.length ? e.series : [{}, {}, {}]).slice(0, TOPES.series);
  const ex = { id: uid(), name: name || dicho, sets: series.map(s => {
    const st = mkSet(tx(s && s.objetivo, 20)), kg = tx(s && s.kg, 10);
    if (kg) st.targetKg = kg;
    return st;
  }) };
  // El grupo: el elegido si el ejercicio está ahí (Curl martillo: bíceps o antebrazo); uno propio,
  // el que dijo la IA si es de la lista de grupos.
  const mus = name ? pickMuscle(name, grupo) : (EX_DB[grupo] ? grupo : "");
  if (mus && mus !== "otros") ex.mus = mus;
  const rest = tx(e.descanso, 20), rir = tx(e.rir, 10), note = tx(e.nota, 160), goal = tx(e.progresion, 120);
  if (rest) ex.rest = rest;
  if (rir) ex.rir = rir;
  if (note) ex.note = note;
  if (goal) ex.goal = goal;
  if (e.ss === true) ex.ss = true;
  // Por tiempo solo si las series lo son y el nombre no lo dice (la plancha ya es por tiempo).
  if (e.timed === true && !isTimedEx({ name: ex.name })) ex.timed = true;
  // El video que el coach tenía en esa fila de la planilla (links: { fila: link }), solo https.
  const v = links && Number.isInteger(e.fila) ? links[e.fila] : null;
  if (typeof v === "string" && v.length <= 300 && /^https:\/\/[^\s"'<>]+$/i.test(v)) ex.video = v;
  return ex;
}

// El borrador → { days, revisar }: days, los días de GIZE (los que quedan sin ejercicios no van);
// revisar, los id de los ejercicios que conviene mirar (la IA dudó o lo elegido no se parecía a lo
// que decía). propios: deja los ejercicios que no están en la lista con su nombre (las planillas);
// sin propios, se sacan. links: los videos de la planilla por número de fila.
// Una superserie (ss: «va con el siguiente») nunca queda en el último, y si se saca el que seguía,
// sigue unida solo si el sacado también iba con el siguiente.
export function diasDesdeIA(borrador, { propios = false, links = null } = {}){
  const days = [], revisar = [];
  for (const d of (borrador && Array.isArray(borrador.dias) ? borrador.dias : [])){
    if (days.length >= TOPES.dias) break;
    const exercises = [];
    for (const e of (d && Array.isArray(d.ejercicios) ? d.ejercicios : [])){
      if (exercises.length >= TOPES.ejercicios) break;
      const ex = e && typeof e === "object" ? ejercicio(e, propios, links) : null;
      if (!ex){
        const ant = exercises[exercises.length - 1];
        if (ant && !(e && e.ss === true)) delete ant.ss;
        continue;
      }
      exercises.push(ex);
      if (e.dudoso === true) revisar.push(ex.id);
    }
    if (!exercises.length) continue;
    delete exercises[exercises.length - 1].ss;
    const day = { id: uid(), name: tx(d.nombre, 60) || "Día " + (days.length + 1), subtitle: "", exercises };
    const dias = diasDe(d);
    if (dias.length) day.dias = dias;
    const note = tx(d.nota, 160);
    if (note) day.note = note;
    days.push(day);
  }
  return { days, revisar };
}
