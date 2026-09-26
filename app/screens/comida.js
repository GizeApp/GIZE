import { FOODS, RC } from '../core/data.js';

import { cookVariant } from '../core/foods.js';

const barcodeSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 8v8M10 8v8M13 8v8M16 8v8"/></svg>';

import { flameSvg, searchSvg, xSvg } from '../core/icons.js';

import { state } from '../core/state.js';

import { esc, norm, today, ymd } from '../core/utils.js';

import { addDays, dayLabel, dayShort, pastDay } from './comida-historial.js';

import { foodEmoji } from '../core/foodemoji.js';

import { foodUnit } from '../core/foodunits.js';

import { planSections } from './checkin.js';

// Nombre sin la aclaración de la unidad, que ya muestra la hoja del alimento:
// "Pan lactal blanco (1 rebanada ≈ 25 g)" → "Pan lactal blanco". Las demás aclaraciones
// ("(tipo Cindor)", "(crudo)") quedan.
export const shortName = n => String(n || "").replace(/\s*\((1 [^)]*|medida \d+ ml)\)/gi, "").trim();

// Las 4 comidas del día (como Fitia). Lo anotado antes de que existieran queda en "otras".
export const MEALS = [["desayuno", "Desayuno", "☀️"], ["almuerzo", "Almuerzo", "🍽️"], ["merienda", "Merienda", "🧉"], ["cena", "Cena", "🌙"]];
export const mealName = id => (MEALS.find(m => m[0] === id) || [0, "Otras comidas"])[1];
// La comida que corresponde a esta hora: la que se elige sola al agregar un alimento.
export function mealNow(){ const h = new Date().getHours(); return h < 11 ? "desayuno" : h < 16 ? "almuerzo" : h < 20 ? "merienda" : "cena"; }

// Botones para elegir la comida (arriba del buscador y en la hoja del alimento).
export function mealChips(sel, action){
  return '<div class="meal-chips" role="radiogroup" aria-label="Comida">' + MEALS.map(m =>
    `<button class="meal-chip${m[0]===sel?' on':''}" role="radio" aria-checked="${m[0]===sel}" data-action="${action}" data-meal="${m[0]}">${m[1]}</button>`).join("") + '</div>';
}

export const ComidaState = {

  // Comida a la que se agregan los alimentos (null = la de la hora, ver mealNow).
  meal: null,

  // Ventana de búsqueda abierta (desde "Buscar alimento" o el "+" de una comida).
  searchOpen: false,

  // Día que se está mirando (null = hoy). En uno anterior también se carga y se borra.
  viewDate: null,

  // Hidratación con todas sus opciones a la vista.
  waterOpen: false,
  planOpen: false,   // pantalla «Mi plan» (plan de comidas del coach)
  planTab: "comidas",
  planDay: null,     // "entreno" | "descanso" (null: entreno)

  calEditing: false,

  creatingFood: false,

  selectedFood: null,

  // Cómo pesó el cliente el alimento elegido: "crudo" o "cocido" (solo si el alimento
  // tiene esa opción, ver food.cook en core/foods.js).
  cookState: null,

  // Búsqueda en Open Food Facts: { q, status: "loading" | "done" | "error", items }.
  off: null,

  editEntry: null,

  foodQuery: "",

  calForm: {sex:"m",age:"",height:"",weight:"",activity:"mod",goal:"mantener"},

  foodForm: {name:"",kcal:"",p:"",c:"",f:"",unit:"g"},

};

export let lastResults = [];

export let calRingPrevOffset = null;

export let calRingPrevOver = null;

export let calRingPrevKcal = null;

export let calRingNumRaf = null;

export function animateCalRing(){
  const circle = document.getElementById("calRing");
  if (!circle) return;
  const target = circle.style.strokeDashoffset;
  const isOver = circle.classList.contains("over");
  if (calRingPrevOffset !== null) {
    circle.style.transition = "none";
    circle.style.strokeDashoffset = calRingPrevOffset;
    circle.classList.toggle("over", calRingPrevOver);
    void circle.getBoundingClientRect();
    circle.style.transition = "";
    requestAnimationFrame(()=>{
      circle.style.strokeDashoffset = target;
      circle.classList.toggle("over", isOver);
    });
  }
  calRingPrevOffset = target;
  calRingPrevOver = isOver;

  const numEl = document.getElementById("calRingNum");
  if (!numEl) return;
  const targetKcal = parseInt(numEl.dataset.val, 10) || 0;
  const fromKcal = calRingPrevKcal;
  calRingPrevKcal = targetKcal;
  if (fromKcal === null || fromKcal === targetKcal) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (calRingNumRaf) cancelAnimationFrame(calRingNumRaf);
  const dur = 400, t0 = performance.now(); // igual a la transition-duration de .ring-fill
  const ease = x => 1 - Math.pow(1 - x, 3); // easeOutCubic: misma "desaceleración rápida" que --ease-drawer,
                                             // aproximada a mano porque un cubic-bezier() de CSS no se puede
                                             // evaluar directo dentro de un loop de rAF sin un solver aparte.
  const step = now => {
    const p = Math.min(1, (now - t0) / dur);
    numEl.textContent = Math.round(fromKcal + (targetKcal - fromKcal) * ease(p));
    if (p < 1) calRingNumRaf = requestAnimationFrame(step);
    else { numEl.textContent = targetKcal; calRingNumRaf = null; }
  };
  calRingNumRaf = requestAnimationFrame(step);
}

export function calcTarget(p){
  let bmr = 10*(+p.weight) + 6.25*(+p.height) - 5*(+p.age) + (p.sex==="m"?5:-161);
  const act = {sed:1.2,lig:1.375,mod:1.55,act:1.725,muy:1.9}[p.activity] || 1.55;
  const g = {bajar:0.8,mantener:1.0,ganar:1.1}[p.goal] || 1.0;
  return Math.round(bmr*act*g);
}

// Macros puestos a mano en "Tu meta diaria" (van dentro de calProfile, que ya se sube a la nube).
export function customMacros(){
  const m = state.calProfile && state.calProfile.macros;
  return m && (+m.p > 0 || +m.c > 0 || +m.f > 0) ? { p: +m.p||0, c: +m.c||0, f: +m.f||0 } : null;
}
export const macroKcal = m => Math.round((+m.p||0)*4 + (+m.c||0)*4 + (+m.f||0)*9);

export function macroTargets(){
  if(state.coachPlan){ const p=state.coachPlan; return {p:+p.protein||0, c:+p.carbs||0, f:+p.fat||0}; }
  const cm = customMacros(); if(cm) return cm;
  const t = state.calTarget||0;
  const w = state.calProfile && state.calProfile.weight ? +state.calProfile.weight : 0;
  let p = w>0 ? Math.round(w*2) : Math.round(t*0.30/4);
  const f = Math.round(t*0.25/9);
  const c = Math.max(0, Math.round((t - p*4 - f*9)/4));
  return {p,c,f};
}

export function diaryTotals(){ return state.diary.reduce((a,e)=>({kcal:a.kcal+e.kcal,p:a.p+e.p,c:a.c+e.c,f:a.f+e.f}),{kcal:0,p:0,c:0,f:0}); }

export function renderResults(q){
  const nq = norm(q);
  if(!nq) return renderRecents();
  // Orden: mis alimentos, los productos de marca que ya usé (Open Food Facts) y la base.
  const all = (state.foods||[]).concat(state.offRecent||[], FOODS);
  // Primero los que empiezan con lo buscado, después los que tienen una palabra que
  // empieza así y al final el resto ("pan" → Pan francés antes que Sartén de pan…).
  // Se busca en el nombre sin la aclaración de la unidad ("bana" no trae "Pan lactal (1
  // rebanada…)").
  const key = f => norm(shortName(f.name));
  // Los productos de marca siempre antes que los genéricos.
  const brand = f => f.src==="OFF" || f.src==="GIZE" ? 0 : 1;
  const rank = f => { const n=key(f); return n.startsWith(nq) ? 0 : (n.includes(" "+nq) ? 1 : 2); };
  lastResults = all.filter(f=>key(f).includes(nq)).sort((a,b)=>brand(a)-brand(b) || rank(a)-rank(b)).slice(0,40);
  const local = lastResults.length ? '<div class="off-head">Alimentos</div>' + lastResults.map((f,i)=>foodRow(f, "food-pick", i)).join("")
    : (nq.length < 3 ? '<div class="cal-hint">Sin resultados en la base. Probá crear el alimento 👇</div>' : '');
  // Arriba los productos de marca de la base compartida; abajo la base de alimentos.
  return '<div id="offResults">'+renderOffResults()+'</div>' + local;
}

// Sin nada escrito: «Búsquedas recientes» (los últimos 5 alimentos que eligió buscando) y
// «Comidas recientes» (lo último que anotó, sin repetir). Tocar uno abre la porción con los
// gramos de la última vez.
function renderRecents(){
  const same = (a, b) => a.name === b.name && (a.code || "") === (b.code || "");
  // Si también lo anotó, se usa esa copia (trae los gramos de la última vez).
  const searched = (state.recentSearch || []).slice(0, 5).map(f => (state.recentFoods || []).find(r => same(r, f)) || f);
  const recent = (state.recentFoods || []).filter(f => !searched.some(s => same(s, f))).slice(0, 10);
  lastResults = searched.concat(recent);
  if (!lastResults.length) return '<div class="cal-hint">Escribí para buscar un alimento</div>';
  let i = 0;
  const block = (title, list) => list.length ? '<div class="rs-head">' + title + '</div>' + list.map(f => foodRow(f, "food-pick", i++)).join("") : "";
  return block("Búsquedas recientes", searched) + block("Comidas recientes", recent);
}

function foodRow(f, action, i){
  return `<div class="food-row" data-action="${action}" data-idx="${i}">
    <span class="food-emo" aria-hidden="true">${foodEmoji(f.name, f.cat)}</span>
    <div class="food-name">${esc(shortName(f.name))}${f.cook?'<span class="food-cook">crudo / cocido</span>':''}${f.src==="OFF"||f.src==="GIZE"?`<span class="food-cook${f.verified?' ok':''}">${f.verified?'✓ verificado':'marca'}</span>`:''}</div>
    <div class="food-kcal">${f.kcal} kcal<span>por 100 ${f.unit==="ml"?"ml":"g"}${f.cook?" "+f.cook.base:""}</span></div>
  </div>`;
}

// Resultados de productos de marca (base compartida y Open Food Facts), arriba de la base propia.
// Se buscan aparte y sin bloquear la escritura (ver "food-search" en main.js).
export let offResults = [];
export function renderOffResults(){
  const o = ComidaState.off || {};
  if (!o.q || o.q.length < 3) return "";
  const head = '<div class="off-head">Productos de marca</div>';
  if (o.status === "loading") return head + '<div class="cal-hint">Buscando productos de marca…</div>';
  if (o.status === "error") return ""; // sin señal: quedan los alimentos de abajo
  const shown = new Set((state.offRecent||[]).map(f=>f.code));
  offResults = (o.items||[]).filter(f=>!f.code || !shown.has(f.code));
  if (!offResults.length) return "";
  return head + offResults.map((f,i)=>foodRow(f, "off-pick", i)).join("");
}

export function entryBase(e){ return e.base ? e.base : { kcal: e.grams? e.kcal/e.grams*100:0, p: e.grams? e.p/e.grams*100:0, c: e.grams? e.c/e.grams*100:0, f: e.grams? e.f/e.grams*100:0, unit: e.unit||"g" }; }

export function previewStr(food, grams){
  const fc=(parseFloat(grams)||0)/100;
  return `${Math.round(food.kcal*fc)} kcal · P ${(food.p*fc).toFixed(1)} · C ${(food.c*fc).toFixed(1)} · G ${(food.f*fc).toFixed(1)}`;
}

export function renderCalForm(){
  if (state.coachPlan) return renderCoachGoal();
  const c = ComidaState.calForm;
  const sb = (v,l)=>`<button class="${c.sex===v?'on':''}" data-action="cal-sex" data-val="${v}">${l}</button>`;
  const ab = (v,l)=>`<button class="${c.activity===v?'on':''}" data-action="cal-activity" data-val="${v}">${l}</button>`;
  const gb = (v,l)=>`<button class="${c.goal===v?'on':''}" data-action="cal-goal" data-val="${v}">${l}</button>`;
  return `
    <div class="form-head"><button class="form-back" data-action="cal-cancel">‹</button><div class="form-title">Tu meta diaria</div></div>
    <div class="form-sub">Calculamos tus calorías con la fórmula Mifflin-St Jeor.</div>
    <div class="form-group"><label class="form-label">Sexo</label><div class="seg">${sb("m","Hombre")}${sb("f","Mujer")}</div></div>
    <div class="form-row2">
      <div class="form-group"><label class="form-label">Edad</label><input class="form-input" type="text" inputmode="numeric" value="${esc(c.age)}" data-action="cal-field" data-field="age"></div>
      <div class="form-group"><label class="form-label">Altura (cm)</label><input class="form-input" type="text" inputmode="numeric" value="${esc(c.height)}" data-action="cal-field" data-field="height"></div>
      <div class="form-group"><label class="form-label">Peso (kg)</label><input class="form-input" type="text" inputmode="decimal" value="${esc(c.weight)}" data-action="cal-field" data-field="weight"></div>
    </div>
    <div class="form-group"><label class="form-label">Actividad</label><div class="seg">${ab("sed","Sedentario")}${ab("lig","Ligero")}${ab("mod","Moderado")}${ab("act","Activo")}${ab("muy","Muy activo")}</div></div>
    <div class="form-group"><label class="form-label">Objetivo</label><div class="seg">${gb("bajar","Bajar grasa")}${gb("mantener","Mantener")}${gb("ganar","Ganar músculo")}</div></div>
    <button class="form-save" data-action="cal-calc">Calcular mi meta</button>
    <div class="form-or">— o ingresá tu meta a mano —</div>
    <div class="form-row2">
      <input id="calManual" class="form-input" type="text" inputmode="numeric" placeholder="kcal" value="${state.calTarget||''}">
      <button class="form-save" style="width:auto;padding-left:22px;padding-right:22px;margin-top:0" data-action="cal-manual">Guardar</button>
    </div>
    ${renderMacroForm()}`;
}

// Proteína, carbos y grasas a mano. Al guardar, la meta de calorías pasa a ser la suma de los
// tres (4 kcal por gramo de proteína y de carbos, 9 por gramo de grasa), para que coincidan.
function renderMacroForm(){
  const m = macroTargets(), custom = !!customMacros();
  const inp = (k, l) => `<div class="form-group"><label class="form-label">${l} (g)</label><input id="macro_${k}" class="form-input" type="text" inputmode="numeric" value="${m[k]||""}" data-action="macro-field"></div>`;
  return `
    <div class="form-sec">Macros diarios</div>
    <div class="form-sub">${custom ? "Los pusiste a mano." : "Ahora se calculan solos a partir de tus calorías. Podés cambiarlos."}</div>
    <div class="form-row2">${inp("p","Proteína")}${inp("c","Carbos")}${inp("f","Grasas")}</div>
    <div class="macro-sum" id="macroSum">${macroSumText(m)}</div>
    <button class="form-save" data-action="macro-save">Guardar macros</button>
    ${custom ? '<button class="form-link" data-action="macro-auto">Volver a calcularlos solos</button>' : ""}`;
}
export function macroSumText(m){ return `Suman <b>${macroKcal(m).toLocaleString("es-AR")} kcal</b> por día`; }

// Con plan del coach, la meta la fija el coach desde su panel.
function renderCoachGoal(){
  const p = state.coachPlan;
  return `
    <div class="form-head"><button class="form-back" data-action="cal-cancel">‹</button><div class="form-title">Tu meta diaria</div></div>
    <div class="form-sub">Tu meta la fija tu coach. Si necesitás cambiarla, pedíselo: la actualiza desde su panel y te aparece acá.</div>
    <div class="coach-goal">
      <div><b>${(+p.kcal||0).toLocaleString("es-AR")||"-"}</b><span>kcal</span></div>
      <div><b>${+p.protein||"-"}</b><span>Proteína (g)</span></div>
      <div><b>${+p.carbs||"-"}</b><span>Carbos (g)</span></div>
      <div><b>${+p.fat||"-"}</b><span>Grasas (g)</span></div>
    </div>`;
}

export function renderFoodForm(){
  const f = ComidaState.foodForm;
  const ub=(v,l)=>`<button class="${(f.unit||"g")===v?'on':''}" data-action="cf-unit" data-val="${v}">${l}</button>`;
  return `
    <div class="form-head"><button class="form-back" data-action="food-create-cancel">‹</button><div class="form-title">Crear alimento</div></div>
    <div class="form-sub">Cargá los valores por cada 100 ${(f.unit||"g")==="ml"?"ml":"g"}.</div>
    ${f.code ? `<div class="cf-code">Código de barras <b>${esc(f.code)}</b><span>Cuando lo guardes va a quedar disponible para todos los usuarios de GIZE. Copiá los valores de la tabla del paquete, cada 100 ${(f.unit||"g")==="ml"?"ml":"g"}.</span></div>` : ''}
    <div class="form-group"><label class="form-label">Nombre</label><input class="form-input" type="text" value="${esc(f.name)}" data-action="cf-field" data-field="name" placeholder="${f.code?'Ej: Yogur firme frutilla':''}"></div>
    ${f.code ? `<div class="form-group"><label class="form-label">Foto de la tabla nutricional</label>
      <label class="cf-photo${f.photoUrl?' has':''}">${f.photoUrl ? `<img src="${esc(f.photoUrl)}" alt="Foto de la tabla nutricional">` : ''}<span>${f.photoUrl ? 'Cambiar foto' : '📷 Sacar foto de la tabla'}</span><input type="file" accept="image/*" capture="environment" data-action="cf-photo" hidden></label>
      <div class="cf-photo-h">Es obligatoria: sirve para revisar que los datos estén bien.</div></div>` : ''}
    ${f.code ? `<div class="form-group"><label class="form-label">Marca</label><input class="form-input" type="text" value="${esc(f.brand||"")}" data-action="cf-field" data-field="brand" placeholder="Ej: La Serenísima"></div>` : ''}
    <div class="form-group"><label class="form-label">Se mide en</label><div class="seg">${ub("g","Gramos (sólido)")}${ub("ml","Mililitros (líquido)")}</div></div>
    <div class="form-group"><label class="form-label">Calorías (kcal)</label><input class="form-input" type="text" inputmode="numeric" value="${esc(f.kcal)}" data-action="cf-field" data-field="kcal"></div>
    <div class="form-row2">
      <div class="form-group"><label class="form-label">Proteína (g)</label><input class="form-input" type="text" inputmode="decimal" value="${esc(f.p)}" data-action="cf-field" data-field="p"></div>
      <div class="form-group"><label class="form-label">Carbos (g)</label><input class="form-input" type="text" inputmode="decimal" value="${esc(f.c)}" data-action="cf-field" data-field="c"></div>
      <div class="form-group"><label class="form-label">Grasas (g)</label><input class="form-input" type="text" inputmode="decimal" value="${esc(f.f)}" data-action="cf-field" data-field="f"></div>
    </div>
    <button class="form-save" data-action="food-create-save">Guardar alimento</button>`;
}

// Barra de arriba: abre la ventana de búsqueda (no se escribe acá). El escáner, al lado.
function searchBar(vd){
  return `<div class="food-search-row">
      <button class="cal-search search-wrap search-open" data-action="search-open"><span class="search-ic">${searchSvg}</span><span class="search-ph">${vd===today() ? "Buscar alimento o marca…" : "Agregar a "+esc(dayLabel(vd).toLowerCase())+"…"}</span></button>
      <button class="scan-btn" data-action="scan-open" title="Escanear código de barras" aria-label="Escanear código de barras">${barcodeSvg}</button>
    </div>`;
}

// Ventana de búsqueda (como Fitia): comida elegida arriba, buscador con el teclado listo,
// resultados que se desplazan y "Crear alimento propio". Tocar un resultado abre la hoja
// del alimento; al cancelarla se vuelve acá con lo buscado.
export function renderSearchSheet(){
  const vd = (ComidaState.viewDate && ComidaState.viewDate < today()) ? ComidaState.viewDate : today();
  return `
    <div class="sheet-bg" data-action="search-close"></div>
    <div class="sheet search-sheet" role="dialog" aria-label="Buscar alimento">
      <div class="ss-head"><span class="sheet-title">Agregar${vd===today() ? "" : " a "+esc(dayLabel(vd).toLowerCase())}</span><button class="ss-x" data-action="search-close" aria-label="Cerrar">${xSvg}</button></div>
      ${mealChips(ComidaState.meal || mealNow(), "search-meal")}
      <div class="food-search-row">
        <div class="cal-search search-wrap"><span class="search-ic">${searchSvg}</span><input id="foodSearch" type="text" placeholder="Buscar alimento o marca…" value="${esc(ComidaState.foodQuery)}" data-action="food-search" autocomplete="off" enterkeyhint="search"></div>
        <button class="scan-btn" data-action="scan-open" title="Escanear código de barras" aria-label="Escanear código de barras">${barcodeSvg}</button>
      </div>
      <div id="foodResults" class="ss-results">${renderResults(ComidaState.foodQuery)}</div>
      <button class="cal-create" data-action="food-create-open">+ Crear alimento propio</button>
    </div>`;
}

export function renderComida(){
  if (ComidaState.calEditing) return renderCalForm();
  if (ComidaState.planOpen && state.coachPlan) return renderPlanScreen();
  if (ComidaState.creatingFood) return renderFoodForm();
  if (!state.calTarget && !state.coachPlan) {
    return `<div class="cal-empty">
      <div class="cal-empty-ic">${flameSvg}</div>
      <div class="cal-empty-title">Configurá tu meta</div>
      <div class="cal-empty-sub">Calculamos cuántas calorías necesitás según tu cuerpo y tu objetivo. Después registrás lo que comés y la app va sumando.</div>
      <button class="ctrl primary" style="max-width:240px;margin:0 auto" data-action="cal-open">Configurar meta</button>
    </div>`;
  }
  const t = (state.coachPlan && state.coachPlan.kcal) ? state.coachPlan.kcal : state.calTarget, mt = macroTargets();
  // Día que se mira: hoy (se carga y se edita) o uno anterior (solo para ver, de la nube).
  const td = today(), vd = (ComidaState.viewDate && ComidaState.viewDate < td) ? ComidaState.viewDate : td, past = vd !== td;
  const pd = past ? pastDay(vd) : null;
  const items = past ? pd.items : state.diary;
  const tot = past ? items.reduce((a,e)=>({kcal:a.kcal+(Number(e.kcal)||0), p:a.p+(Number(e.p)||0), c:a.c+(Number(e.c)||0), f:a.f+(Number(e.f)||0)}), {kcal:0,p:0,c:0,f:0}) : diaryTotals();
  const dayNav = `<div class="day-nav">
      <button class="day-arrow" data-action="day-prev" aria-label="Día anterior">‹</button>
      <div class="day-lbl"><b>${dayLabel(vd)}</b><span>${vd===td ? dayShort(vd) : (dayLabel(vd)===dayShort(vd) ? "Día anterior" : dayShort(vd))}</span></div>
      <button class="day-arrow" data-action="day-next" aria-label="Día siguiente"${past?'':' disabled'}>›</button>
    </div>`;
  // El plan del coach tiene su propia pantalla («Mi plan»): acá abajo queda solo una tarjeta
  // compacta con las calorías y macros, así Comida es solo lo del día.
  const cp = state.coachPlan;
  const planCard = cp ? `<button class="plan-card" data-action="plan-open">
      <span class="plan-card-t">Plan de tu coach</span>
      <span class="plan-card-m">${(+cp.kcal||0) ? `<b>${(+cp.kcal).toLocaleString("es-AR")}</b> kcal` : ''}${[["P",cp.protein],["C",cp.carbs],["G",cp.fat]].filter(x=>+x[1]).map(x=>`<span class="pcm">${x[0]} <b>${+x[1]}</b></span>`).join("")}</span>
      <span class="plan-card-go">Ver plan<span aria-hidden="true">›</span></span>
    </button>` : '';
  const wml = state.water||0, wgoal = state.waterGoal||3000, wpct = wgoal?Math.min(Math.round(wml/wgoal*100),100):0;
  const Lstr = v => (v/1000).toLocaleString("es-AR",{maximumFractionDigits:2});
  const pct = t ? Math.min(tot.kcal/t, 1) : 0;
  const over = tot.kcal > t;
  const mbar = (lbl, cons, tgt) => {
    const w = tgt ? Math.min(Math.round(cons/tgt*100),100) : 0;
    return `<div><div class="macro-top"><b>${lbl}</b><span>${Math.round(cons)} / ${tgt} g</span></div><div class="bar"><div style="width:${w}%"></div></div></div>`;
  };
  const r1 = n => (Math.round((Number(n)||0)*10)/10).toLocaleString("es-AR");
  const item = e=>`
    <div class="diary-item" data-action="diary-edit" data-id="${esc(e.id)}">
      <span class="food-emo" aria-hidden="true">${foodEmoji(e.name)}</span>
      <div class="diary-name">${esc(shortName(e.name))}<span>${e.grams} ${e.unit==="ml"?"ml":"g"} · P ${r1(e.p)} · C ${r1(e.c)} · G ${r1(e.f)}</span></div>
      <div class="diary-kcal">${e.kcal} kcal</div>
      <button class="diary-rm" data-action="diary-remove" data-id="${esc(e.id)}" title="Quitar">${xSvg}</button>
    </div>`;
  const known = new Set(MEALS.map(m=>m[0]));
  const sections = (past && pd.status!=="done") ? `<div class="cal-hint">${pd.status==="loading" ? "Cargando…" : esc(pd.msg)}</div>` : MEALS.concat(items.some(e=>!known.has(e.meal)) ? [["otras","Otras comidas","🍴"]] : []).map(m=>{
    const list = items.filter(e=> m[0]==="otras" ? !known.has(e.meal) : e.meal===m[0]);
    const kc = list.reduce((a,e)=>a+(Number(e.kcal)||0),0);
    return `<section class="meal">
      <div class="meal-head"><span class="meal-ic" aria-hidden="true">${m[2]}</span><span class="meal-t">${m[1]}</span><span class="meal-k">${kc ? kc.toLocaleString("es-AR")+" kcal" : ""}</span>
        ${m[0]!=="otras" ? `<button class="meal-add" data-action="meal-add" data-meal="${m[0]}" aria-label="Agregar a ${m[1]}">+</button>` : ""}</div>
      ${list.length ? list.map(item).join("") : `<div class="meal-empty">${past?"Nada anotado":"Todavía nada"}</div>`}
    </section>`;
  }).join("");
  return `
    <div class="day-swipe">
    ${dayNav}
    <div class="cal-top">
    <div class="ring-wrap">
      <svg class="ring" viewBox="0 0 120 120">
        <defs><linearGradient id="calRingGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--gize-r1)"/><stop offset=".35" style="stop-color:var(--gize-r2)"/><stop offset=".7" style="stop-color:var(--gize-r3)"/><stop offset="1" style="stop-color:var(--gize-r4)"/></linearGradient></defs>
        <circle class="ring-track" cx="60" cy="60" r="52"></circle>
        <circle id="calRing" class="ring-fill${over?' over':''}" cx="60" cy="60" r="52" style="stroke-dasharray:${RC};stroke-dashoffset:${RC*(1-pct)}"></circle>
      </svg>
      <div class="ring-center">
        <div id="calRingNum" class="ring-num${over?' over':''}" data-val="${tot.kcal}">${tot.kcal}</div>
        <div class="ring-lbl">de ${t} kcal</div>
      </div>
    </div>
    </div>
    <div class="macros">
      ${mbar("Proteína", tot.p, mt.p)}
      ${mbar("Carbos", tot.c, mt.c)}
      ${mbar("Grasas", tot.f, mt.f)}
    </div>
    ${past ? (pd.status!=="done" ? `<div class="meals">${sections}</div>` : `
    ${searchBar(vd)}
    <div class="meals">${sections}</div>`)+`
    <button class="ctrl day-today" data-action="day-today">Volver a hoy</button>
    </div>` : `
    <button class="cal-edit" data-action="cal-open">Editar meta</button>
    ${searchBar(vd)}
    <div class="meals">${sections}</div>
    <div class="water-mini${ComidaState.waterOpen?' open':''}">
      <div class="wm-row">
        <span class="wm-ic" aria-hidden="true">💧</span>
        <div class="wm-main"><div class="wm-top"><span class="wm-t">Agua</span><span class="wm-v">${Lstr(wml)} / ${Lstr(wgoal)} L</span></div>
          <div class="wm-bar"><i style="width:${wpct}%"></i></div></div>
        <button class="wm-add" data-action="water-add" data-n="250">+250 ml</button>
        <button class="wm-more" data-action="water-toggle" aria-expanded="${ComidaState.waterOpen}" aria-label="Más opciones de agua"><span></span></button>
      </div>
      ${ComidaState.waterOpen ? `<div class="wm-extra">
        <button class="qbtn" data-action="water-add" data-n="500">+500 ml</button>
        <button class="qbtn" data-action="water-add" data-n="1000">+1 L</button>
        <button class="qbtn water-undo" data-action="water-add" data-n="-250">−250 ml</button>
        <button class="water-goal" data-action="water-goal">Meta: ${Lstr(wgoal)} L</button>
      </div>` : ""}
    </div>
    ${planCard}
    </div>`}`;
}

// ---- Crudo / cocido ----
const COOK_PREF_KEY = "gize_cook_pref";
function cookPrefs(){ try{ return JSON.parse(localStorage.getItem(COOK_PREF_KEY)||"{}")||{}; }catch(e){ return {}; } }

// Estado con el que se abre un alimento: el último que eligió el cliente para ese
// alimento (la mayoría pesa siempre igual) o, si nunca eligió, el de los valores base.
export function defaultCookState(food){
  if(!food || !food.cook) return null;
  const p = cookPrefs()[food.name];
  return (p === "crudo" || p === "cocido") ? p : food.cook.base;
}

export function rememberCookState(food, st){
  if(!food || !food.cook || !st) return;
  try{ const p = cookPrefs(); p[food.name] = st; localStorage.setItem(COOK_PREF_KEY, JSON.stringify(p)); }catch(e){}
}

// Porción sugerida en ese estado: 80 g de arroz crudo ≈ 210 g cocido.
// Peso de 1 unidad del alimento (1 banana, 1 feta, 1 bife…, ver core/foodunits.js) en el
// estado elegido: 1 bife de 200 g crudo pesa 144 g cocido.
export function cookPortion(food, st){
  if(!food) return 0;
  const g = foodUnit(food).g;
  if(!food.cook || !st || st === food.cook.base) return g;
  return Math.round(st === "cocido" ? g * food.cook.factor : g / food.cook.factor);
}

// Alimento de la base que corresponde a lo anotado (para editar con sus unidades).
let _byName = null;
export function foodByName(name){
  if(!_byName){ _byName = new Map(); (state.foods||[]).concat(state.offRecent||[], FOODS).forEach(f=>{ if(f && f.name && !_byName.has(f.name)) _byName.set(f.name, f); }); }
  return _byName.get(String(name||"").replace(/ \((crudo|cocido)\)$/, "")) || null;
}
export function entryCookState(name){ const m = String(name||"").match(/ \((crudo|cocido)\)$/); return m ? m[1] : null; }

// El alimento elegido con los valores del estado en que lo pesó el cliente.
export function selectedFoodValues(){
  return cookVariant(ComidaState.selectedFood, ComidaState.cookState);
}

// ---- Promedio de calorías de los últimos 7 días ----
// Se guarda el total del día cuando la app pasa al día siguiente (ver checkDaily) y se
// completa con la nube al abrir la app. Se conservan 60 días.
export function logDayKcal(date, diary){
  if(!date || !Array.isArray(diary) || !diary.length) return;
  const tot = diary.reduce((a,e)=>a+(Number(e.kcal)||0), 0);
  state.kcalLog = Object.assign({}, state.kcalLog||{}); state.kcalLog[date] = Math.round(tot);
  const keys = Object.keys(state.kcalLog).sort(); while(keys.length > 60) delete state.kcalLog[keys.shift()];
}

// Promedio de los 7 días anteriores a hoy (hoy no cuenta: todavía no terminó). Solo
// promedia los días en que se anotó algo: un día sin registrar no es un día de 0 kcal.
export function weekKcal(){
  const log = state.kcalLog || {}; const vals = [];
  for(let i=1;i<=7;i++){ const d=new Date(); d.setDate(d.getDate()-i); const v=log[ymd(d)]; if(v>0) vals.push(v); }
  return vals.length ? { avg: Math.round(vals.reduce((a,b)=>a+b,0)/vals.length), days: vals.length } : null;
}


// «Mi plan»: el plan de comidas del coach en su propia pantalla, con tres pestañas.
//   · Comidas: la tabla del día, con Día de entreno / Día de descanso (arranca en entreno).
//   · Opciones: las opciones de comidas, cada una plegable.
//   · Pautas: pautas, suplementos, agua y sal, adicionales y reemplazos.
export function renderPlanScreen(){
  const cp = state.coachPlan || {}, ps = planSections(cp.plan) || { train: "", rest: "", ws: "", pautas: "", options: [] };
  const tabs = [["comidas", "Comidas", ps.train || ps.rest], ["opciones", "Opciones", ps.options.length], ["pautas", "Pautas", ps.pautas || ps.ws]].filter(t => t[2]);
  let tab = ComidaState.planTab; if (!tabs.some(t => t[0] === tab)) tab = tabs.length ? tabs[0][0] : "";
  const dayType = ComidaState.planDay || (ps.train ? "entreno" : "descanso");
  const macro = (v, l) => +v ? `<div><b>${(+v).toLocaleString("es-AR")}</b><span>${l}</span></div>` : '';
  let body = "";
  if (tab === "comidas"){
    const seg = (ps.train && ps.rest) ? `<div class="seg plan-seg"><button class="${dayType==="entreno"?'on':''}" data-action="plan-day" data-v="entreno">Día de entreno</button><button class="${dayType==="descanso"?'on':''}" data-action="plan-day" data-v="descanso">Día de descanso</button></div>` : '';
    body = seg + (dayType === "entreno" ? (ps.train || ps.rest) : (ps.rest || ps.train));
  } else if (tab === "opciones"){
    body = `<div class="plan-hint">Tocá una comida para ver sus opciones.</div>` + ps.options.map(o => `<details class="plan-acc" name="plan-opc"><summary><span>${esc(o.title)}</span><i aria-hidden="true"></i></summary><div class="plan-acc-b">${o.html}</div></details>`).join("");
  } else if (tab === "pautas"){
    body = (ps.ws || "") + ps.pautas;
  }
  return `
    <div class="form-head"><button class="form-back" data-action="plan-close" aria-label="Volver a Comida">‹</button><div class="form-title">Mi plan</div></div>
    <div class="plan-top">
      <div class="plan-top-t">Plan de tu coach</div>
      <div class="plan-top-m">${macro(cp.kcal, "kcal")}${macro(cp.protein, "Proteína")}${macro(cp.carbs, "Carbos")}${macro(cp.fat, "Grasas")}</div>
      ${cp.notes ? `<div class="plan-top-n">${esc(cp.notes)}</div>` : ''}
    </div>
    ${tabs.length > 1 ? `<div class="plan-tabs" role="tablist">${tabs.map(t => `<button role="tab" aria-selected="${t[0]===tab}" class="plan-tab${t[0]===tab?' on':''}" data-action="plan-tab" data-v="${t[0]}">${t[1]}</button>`).join("")}</div>` : ''}
    <div class="mc-wrap plan-body">${body || '<div class="cal-hint">Tu coach todavía no cargó el detalle del plan.</div>'}</div>`;
}
