import { esc } from '../core/utils.js';

import { ComidaState, shortName, cookPortion, entryBase, entryCookState, foodByName, mealChips, mealNow, previewStr, selectedFoodValues } from '../screens/comida.js';
import { foodUnit, unitText } from '../core/foodunits.js';

export const SheetState = {

  sheetGen: 0,

};

// De dónde sale cada alimento de la base genérica (src en foods.js).
const SRC_TXT = {
  S: "tabla oficial del Ministerio de Salud de la Nación (SARA 2)",
  A: "tabla argentina de composición de alimentos (Argenfoods, UNLu)",
  R: "rótulo o información oficial de la marca en Argentina",
  OFF: "Open Food Facts (rótulo del producto)",
};

export function renderSheet(){
  let title, grams, base, isEdit;
  const sf = ComidaState.selectedFood;
  if (sf){ title=sf.name; grams=ComidaState.sheetGrams!=null ? ComidaState.sheetGrams : cookPortion(sf, ComidaState.cookState); base=selectedFoodValues(); isEdit=false; }
  else if (ComidaState.editEntry){ title=ComidaState.editEntry.name; grams=ComidaState.editEntry.grams; base=entryBase(ComidaState.editEntry); isEdit=true; }
  else return "";
  // Tamaño de 1 unidad/porción (1 banana = 120 g): para sumar de a unidades con − / +.
  const uf = sheetUnitFood();
  const unitG = uf ? cookPortion(uf.food, uf.cook) : 0;
  return `
    <div class="sheet-bg" data-action="portion-cancel"></div>
    <div class="sheet">
      <div class="sheet-title">${esc(shortName(title))}</div>
      ${mealChips(ComidaState.sheetMeal || (isEdit ? ComidaState.editEntry.meal : ComidaState.meal) || mealNow(), "sheet-meal")}
      ${sf && sf.cook ? `<div class="sheet-cook" role="radiogroup" aria-label="¿Cómo lo pesaste?">
        <span class="sheet-cook-lbl">¿Cómo lo pesaste?</span>
        <div class="seg">${["crudo","cocido"].map(st=>`<button class="${ComidaState.cookState===st?'on':''}" role="radio" aria-checked="${ComidaState.cookState===st}" data-action="portion-cook" data-val="${st}">${st==="crudo"?"Crudo":"Cocido"}</button>`).join("")}</div>
      </div>` : ""}
      <div class="sheet-row">
        <input id="portionGrams" class="sheet-input" type="text" inputmode="decimal" enterkeyhint="done" value="${grams}" data-action="portion-grams" data-enter="${isEdit?'portion-save':'portion-add'}">
        <span class="sheet-unit">${base.unit==="ml"?"ml":"gramos"}</span>
      </div>
      ${unitG>0 ? `<div class="sheet-units">
        <button class="sheet-step" data-action="portion-step" data-d="-1" aria-label="Una unidad menos">−</button>
        <span class="sheet-units-txt" id="portionUnits">${unitsLabel(grams, unitG, base.unit, uf.food)}</span>
        <button class="sheet-step" data-action="portion-step" data-d="1" aria-label="Una unidad más">+</button>
      </div>` : ""}
      <div class="sheet-preview" id="portionPreview">${previewStr(base, grams)}</div>
      <div class="sheet-btns">
        <button class="ctrl ghost" data-action="portion-cancel">Cancelar</button>
        <button class="ctrl primary" data-action="${isEdit?'portion-save':'portion-add'}">${isEdit?'Guardar':'Agregar'}</button>
      </div>
      ${sf && SRC_TXT[sf.src] ? `<div class="sheet-src">Fuente: ${SRC_TXT[sf.src]}</div>` : ""}
      ${sf && sf.src==="GIZE" && sf.gid ? `<div class="sheet-src">${sf.verified?'<b>✓ Verificado por GIZE</b>':'Cargado por la comunidad de GIZE'} · <button class="sheet-report" data-action="prod-report">¿Algún dato está mal?</button></div>` : ""}
    </div>`;
}

// "2 unidades de 120 g" según los gramos escritos (si no es un número exacto de unidades,
// muestra cuántas son aproximadamente).
// Alimento (y estado crudo/cocido) cuyas unidades usa la hoja: el elegido o, al editar, el
// de la base con el mismo nombre.
export function sheetUnitFood(){
  if (ComidaState.selectedFood) return { food: ComidaState.selectedFood, cook: ComidaState.cookState };
  const e = ComidaState.editEntry; if (!e) return null;
  const f = foodByName(e.name);
  return f ? { food: f, cook: entryCookState(e.name) } : null;
}

export function unitsLabel(grams, unitG, unit, food){
  if (food) { const u = foodUnit(food); return unitText(grams, { one: u.one, many: u.many, g: unitG }, unit); }
  const g = parseFloat(String(grams).replace(",",".")) || 0;
  const u = unit === "ml" ? "ml" : "g";
  const n = g / unitG;
  const exact = Math.abs(n - Math.round(n)) < 0.05;
  const num = exact ? String(Math.round(n)) : "≈ " + (Math.round(n * 10) / 10).toString().replace(".", ",");
  return num + (exact && Math.round(n) === 1 ? " unidad" : " unidades") + " de " + unitG + " " + u;
}

export function closeSheet(mutate, opts){
  opts = opts || {};
  const host = opts.host || "#sheetHost";
  const card = opts.card || ".sheet";
  const duration = opts.duration || 220;
  const root = document.querySelector(host);
  const cardEl = root && root.querySelector(card);
  const bgEl = root && root.querySelector(".sheet-bg, .cp-bg");
  const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if(!cardEl || reduced){ SheetState.sheetGen++; mutate(); return; }
  cardEl.classList.add("closing");
  if(bgEl) bgEl.classList.add("closing");
  const gen = ++SheetState.sheetGen;
  setTimeout(()=>{ if(gen===SheetState.sheetGen) mutate(); }, duration);
}

export let collapseGen = {};

export function collapseExerciseAnimated(exId, after, flash){
  const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const card = document.querySelector('.card[data-ex-id="'+exId+'"]');
  if(!card || reduced){ after(); return; }
  const gen = (collapseGen[exId] = (collapseGen[exId]||0) + 1);
  const startCollapse = ()=>{
    card.classList.add("ex-collapsing");
    setTimeout(()=>{ if(collapseGen[exId]===gen) after(); }, 150);
  };
  // El flash solo aplica cuando el ejercicio se acaba de completar (ver main.js): un
  // destello verde breve que refuerza el check antes de encogerse a la fila compacta.
  // El colapso manual (botón de flecha) va directo al encogido, sin flash.
  if(!flash){ startCollapse(); return; }
  card.classList.add("ex-complete-flash");
  setTimeout(()=>{
    if(collapseGen[exId]!==gen) return;
    card.classList.remove("ex-complete-flash");
    startCollapse();
  }, 220);
}
