// Disciplinas: la persona elige qué entrena (Ajustes, se puede más de una) y al armar su rutina
// el buscador de ejercicios muestra primero lo de su rubro: el grupo «Para vos» con los
// ejercicios clave y los grupos propios de la disciplina adelante. Todos los demás ejercicios
// siguen disponibles. Se guarda en state.disciplinas y viaja con las preferencias
// (client_prefs.disciplines, supabase/disciplinas.sql).
import { state } from './state.js';
import { EX_DB } from './data.js';

export const DISCIPLINAS = [
  { id: "fuerza", name: "Fuerza e hipertrofia", cats: [], top: [] },
  { id: "crossfit", name: "CrossFit", cats: ["crossfit", "olimpicos"], top: [
    "Thruster con barra", "Wall ball", "Burpee", "Salto al cajón", "Saltos dobles con soga", "Toes to bar", "Dominadas kipping",
    "Swing con kettlebell", "Muscle up en barra", "Flexiones de brazos en vertical", "Cargada de potencia", "Arranque de potencia",
    "Push press", "Sentadilla frontal", "Sentadilla overhead", "Peso muerto convencional", "Remo en ergómetro", "Air bike"] },
  { id: "powerlifting", name: "Powerlifting", cats: ["cuadriceps", "pecho", "isquios"], top: [
    "Sentadilla libre", "Sentadilla con pausa", "Sentadilla barra baja", "Press de banca plano (barra)", "Press de banca con pausa",
    "Press cerrado", "Peso muerto convencional", "Peso muerto sumo", "Peso muerto en déficit", "Peso muerto con pausa",
    "Remo con barra", "Press militar con barra", "Dominadas"] },
  { id: "weightlifting", name: "Weightlifting", cats: ["olimpicos"], top: [
    "Arranque", "Cargada y envión", "Arranque de potencia", "Cargada de potencia", "Arranque colgante", "Cargada colgante",
    "Envión en tijera", "Push jerk", "Sentadilla frontal", "Sentadilla libre", "Sentadilla overhead", "Tirón de arranque",
    "Tirón de cargada", "Balance de arranque"] },
  { id: "running", name: "Running", cats: ["running"], top: [
    "Rodaje suave", "Fondo largo", "Series en pista", "Fartlek", "Cuestas", "Ritmo tempo", "Progresivos", "Técnica de carrera",
    "Carrera en cinta", "Sentadilla búlgara", "Peso muerto rumano a una pierna", "Gemelos de pie", "Plancha"] },
  { id: "hibrido", name: "Atleta híbrido", cats: ["running", "crossfit"], top: [
    "Rodaje suave", "Series en pista", "Fondo largo", "Sentadilla libre", "Peso muerto convencional", "Press de banca plano (barra)",
    "Dominadas", "Thruster con barra", "Wall ball", "Burpee", "Empuje de trineo", "Remo en ergómetro", "Ski erg", "Caminata del granjero"] },
];

// Grupo «Para vos» del buscador (no es un grupo muscular: el ejercicio elegido cuenta para el suyo).
export const FOR_YOU = "_vos";

// ids: las de otra persona (el coach, con las de su alumno); sin ids, las propias.
export function myDisciplinas(ids){
  const list = Array.isArray(ids) ? ids : Array.isArray(state.disciplinas) ? state.disciplinas : [];
  return DISCIPLINAS.filter(d => list.includes(d.id));
}

// «CrossFit · Running» (para mostrar).
export function disciplinasLabel(ids){ return myDisciplinas(ids).map(d => d.name).join(" · "); }

export function toggleDisciplina(id){
  if (!DISCIPLINAS.some(d => d.id === id)) return;
  const cur = Array.isArray(state.disciplinas) ? state.disciplinas.filter(x => x !== id) : [];
  state.disciplinas = cur.length === (state.disciplinas || []).length ? cur.concat(id) : cur;
}

// Ejercicios clave de las disciplinas elegidas, sin repetir y solo los que existen en la base.
export function forYouList(ids){
  const all = new Set(Object.values(EX_DB).flat()), out = [];
  myDisciplinas(ids).forEach(d => d.top.forEach(n => { if (all.has(n) && !out.includes(n)) out.push(n); }));
  return out;
}

// Grupos del buscador: «Para vos» (si hay), los de la disciplina y después el resto.
export function orderedCats(cats, ids, forYouName){
  const first = [];
  myDisciplinas(ids).forEach(d => d.cats.forEach(c => { if (!first.includes(c)) first.push(c); }));
  const lead = first.map(k => cats.find(c => c[0] === k)).filter(Boolean);
  const rest = cats.filter(c => !first.includes(c[0]));
  return (forYouList(ids).length ? [[FOR_YOU, forYouName || "Para vos"]] : []).concat(lead, rest);
}

// Grupo con el que abre el buscador.
export function defaultExCat(cats){ return orderedCats(cats)[0][0]; }
