// «Fuentes y aviso de salud» de Comida: de dónde salen la meta de calorías, los macros, el agua,
// los valores de los alimentos y la estimación de la IA, con el link a cada fuente. Apple lo pidió
// (guía 1.4.1: la información de salud tiene que citar sus fuentes, fáciles de encontrar). Se abre
// como hoja desde Comida (debajo de «Editar meta» y en la pantalla sin meta), desde «Tu meta diaria»
// y desde el aviso de la foto del plato. Si cambia un cálculo de comida.js (calcTarget,
// macroTargets) o la meta de agua, la fuente de acá tiene que cambiar en el mismo cambio.
import { infoSvg, xSvg } from '../core/icons.js';

export const FUENTES = [
  { t: "Meta de calorías", d: "Gasto en reposo con la fórmula Mifflin-St Jeor, por el nivel de actividad (×1,2 sedentario a ×1,9 muy activo), −20 % para bajar grasa y +10 % para ganar músculo.",
    refs: [["Mifflin MD, St Jeor ST y otros. A new predictive equation for resting energy expenditure in healthy individuals. Am J Clin Nutr, 1990.", "https://doi.org/10.1093/ajcn/51.2.241"],
      ["FAO/OMS/UNU. Human energy requirements (necesidades de energía y nivel de actividad física), 2004.", "https://www.fao.org/4/y5686e/y5686e00.htm"],
      ["Aragon AA y otros. ISSN position stand: diets and body composition, 2017.", "https://doi.org/10.1186/s12970-017-0174-y"]] },
  { t: "Macros", d: "Proteína: 2 g por kilo de peso (o el 30 % de las calorías si no cargaste el peso). Grasas: 25 % de las calorías. Carbohidratos: el resto. Cada gramo de proteína o carbohidratos aporta 4 kcal y cada gramo de grasa, 9.",
    refs: [["Jäger R y otros. ISSN position stand: protein and exercise, 2017.", "https://doi.org/10.1186/s12970-017-0177-8"],
      ["National Academies. Dietary Reference Intakes for Energy, Carbohydrate, Fiber, Fat, Fatty Acids, Cholesterol, Protein, and Amino Acids, 2005.", "https://nap.nationalacademies.org/catalog/10490"],
      ["FAO. Food energy: methods of analysis and conversion factors, 2003.", "https://www.fao.org/4/y5022e/y5022e00.htm"]] },
  { t: "Agua", d: "La meta de agua arranca en 3 L por día y la cambiás vos.",
    refs: [["National Academies. Dietary Reference Intakes for Water, Potassium, Sodium, Chloride, and Sulfate, 2005.", "https://nap.nationalacademies.org/catalog/10925"]] },
  { t: "Valores de los alimentos", d: "Los alimentos de GIZE están cada 100 g y salen de tablas de composición de alimentos; los productos de marca, de su etiqueta.",
    refs: [["ARGENFOOD. Tabla de Composición de Alimentos, Universidad Nacional de Luján.", "https://www.argenfood.unlu.edu.ar/Tablas/Tabla.htm"],
      ["USDA. FoodData Central.", "https://fdc.nal.usda.gov/"],
      ["Open Food Facts (productos escaneados con el código de barras).", "https://world.openfoodfacts.org/"]] },
  { t: "Foto del plato con IA", d: "La IA reconoce los alimentos y estima los gramos. Las calorías y los macros salen de la base de GIZE (las tablas de arriba) cuando el alimento está; si no, quedan como estimación de la IA. Es una estimación: revisala antes de agregar." },
];

// El botón que abre la hoja. clase: para acomodarlo según dónde va.
export const fuentesBtn = (clase = "") => `<button type="button" class="fuentes-link${clase ? " " + clase : ""}" data-action="fuentes-open">${infoSvg}<span>Fuentes de los cálculos</span></button>`;

const ref = ([txt, url]) => `<li><a href="${url}" target="_blank" rel="noopener">${txt}</a></li>`;

export function renderFuentesSheet(){
  return `
    <div class="sheet-bg" data-action="fuentes-close"></div>
    <div class="sheet fuentes-sheet" role="dialog" aria-label="Fuentes y aviso de salud">
      <div class="ss-head"><span class="sheet-title">Fuentes y aviso de salud</span><button class="ss-x" data-action="fuentes-close" aria-label="Cerrar">${xSvg}</button></div>
      <div class="ss-scroll fuentes-body">
        <p class="fuentes-aviso"><b>GIZE no es un servicio médico.</b> Los cálculos son estimaciones para personas adultas sanas y no reemplazan la consulta con un médico o un nutricionista. Si estás embarazada, tenés una enfermedad o tomás medicación, consultá antes de cambiar lo que comés. Si tenés un plan de tu coach, sus metas las define tu coach.</p>
        ${FUENTES.map(f => `<section class="fuentes-sec"><h3>${f.t}</h3><p>${f.d}</p>${f.refs ? `<ul>${f.refs.map(ref).join("")}</ul>` : ""}</section>`).join("")}
      </div>
    </div>`;
}
