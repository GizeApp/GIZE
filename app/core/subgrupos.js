// Volumen semanal por subgrupo: pecho, espalda y hombros se separan según el ejercicio
// (pecho superior / medio y bajo; espalda alta / dorsales / espalda baja; hombro frontal /
// lateral / posterior). Algunos ejercicios suman a dos grupos (las hiperextensiones, a espalda
// baja y a isquios). El resto de los grupos queda como está.
import { exMuscle } from './utils.js';

export const SUB_LABELS = {
  pecho_sup: "Pecho superior", pecho_med: "Pecho medio y bajo",
  espalda_alta: "Espalda alta", dorsales: "Dorsales", espalda_baja: "Espalda baja",
  hombro_front: "Hombro frontal", hombro_lat: "Hombro lateral", hombro_post: "Hombro posterior",
};

const low = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Grupos a los que suman las series de un ejercicio (claves de SUB_LABELS o de EX_CATS).
export function volumeGroups(ex){
  const m = exMuscle(ex), n = low(ex && ex.name);
  if (/hiperextension|lumbar/.test(n)) return m === "isquios" ? ["isquios", "espalda_baja"] : ["espalda_baja", "isquios"];
  if (m === "pecho") return /inclinad|polea baja/.test(n) ? ["pecho_sup"] : ["pecho_med"];
  if (m === "espalda"){
    if (/rack pull|buenos dias/.test(n)) return ["espalda_baja"];
    if (/dominad|jalon|pullover|pull ?down/.test(n)) return ["dorsales"];
    return ["espalda_alta"]; // remos, remo invertido, encogimientos
  }
  if (m === "hombros"){
    if (/posterior|a la cara|face|rotacion externa/.test(n)) return ["hombro_post"];
    if (/lateral|al menton|elevacion y/.test(n)) return ["hombro_lat"];
    if (/encogimiento/.test(n)) return ["espalda_alta"];
    if (/press|frontal|arnold|militar|landmine/.test(n)) return ["hombro_front"];
    return ["hombro_lat"];
  }
  return [m];
}
