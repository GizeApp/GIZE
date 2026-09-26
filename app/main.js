import './ui/keyboard.js';

import { DEFAULT, PPL_DAYS } from './core/data.js';

import { disablePush, enablePush, pushLogout } from './core/push.js';
import { checkSetPR, forgetPR, playPR, suspiciousKg, PR_HOLD_MS } from './ui/festejo.js';
import { auIcoEye, auIcoEyeOff, checkSvg } from './core/icons.js';

import { State, state } from './core/state.js';

import { KEY, migrateNames, routineHash, save } from './core/storage.js';

import { afterLogin, cloudBoot, cloudDeletePhoto, cloudDeleteSession, cloudEditSession, cloudSaveCheckin, cloudSaveFoods, cloudSaveDaily, cloudSessionFeedback, cloudUploadPhoto, ensureSb, flushOutbox, isOnline, loadCloud, mergeLocalProgress, newId, pendingCount, clearAccountLeftovers, expectAuthLink, localUnsynced, PROFILE_KEY, RECOVERY_REQ, sbOk, setPendingCode, syncRoutineNow, setRememberSession, signInWithGoogle } from './core/supabase.js';

import { fmt, hkey, mkEx, mkSet, mondayOf, muscleOf, norm, parseSecs, tabRipple, today, uid } from './core/utils.js';

import { runningSetId, startTimer, stopTimer } from './ui/settimer.js';

import { showLogin } from './screens/auth.js';

import { ssGroupOf, ssNext } from './core/superserie.js';
import { CardioState, openTimePicker, renderCardio, setRing, swFrac } from './screens/cardio.js';

import { CheckinState, renderFeedback, saveSession } from './screens/checkin.js';

import { loadCoachClients, openClient } from './screens/coach/clientes.js';

import { renderCoach } from './screens/coach/index.js';

import { renderCoachSettings } from './screens/coach/settings.js';

// Registra los eventos del editor de preguntas del coach (efecto al importarlo).
import './screens/coach/preguntas.js';

import { coachPlanObj, cpApply, loadTpls, planDefault, renderApplyPicker, renderCoachPicker, renderCopyPicker, rtDays, fitOptBody } from './screens/coach/rutinas.js';

import { CoachState } from './screens/coach/state.js';

import { ComidaState, mealNow, renderSearchSheet, animateCalRing, calcTarget, macroKcal, macroSumText, cookPortion, defaultCookState, entryBase, lastResults, offResults, previewStr, rememberCookState, renderComida, renderOffResults, renderResults, selectedFoodValues } from './screens/comida.js';

import { EntrenoState, REST_DEFAULT, day, expandedOverride, liveCounting, renderEntreno, renderExList, renderExSheet, effectiveRest, restKey, wkElapsedText, restLabel, routineLocked, startLive, stopLive } from './screens/entreno.js';

import { HabitosState, addHabit, checkDaily, renderHabitos } from './screens/habitos.js';

import { ProgresoState, allSetsDone, renderProgreso } from './screens/progreso.js';

import { beep, initAudio } from './ui/audio.js';

import { showSilkBg } from './ui/background.js';

import { parseRest, renderRestBar, resumeRest, startRest, stopRest } from './ui/restbar.js';

import { anchorFocus, initScrollReveal, setupExerciseFocus } from './ui/scrollfocus.js';

import { SheetState, closeSheet, collapseExerciseAnimated, renderSheet, sheetUnitFood, unitsLabel } from './ui/sheet.js';
import { clientQuestions, questionSnapshot } from './core/questions.js';
import { renderConfig } from './screens/config.js';

import { removeMyAvatar, uploadMyAvatar } from './core/avatar.js';

import { productByCode, searchOFF } from './core/off.js';
import { kcalMismatch, productByCodeShared, reportShared, saveShared, searchShared, uploadLabelPhoto, useShared } from './core/productos.js';

import { addDays, dayItems, loadDay, retryDay, setDayItems } from './screens/comida-historial.js';
import { EditState, cleanSessionEdit, openSessionEdit, removeSessionEditSet, renderSessionEdit, setSessionEditVal } from './ui/sessionedit.js';
import { closeScanner, openScanner, scannerManualCode } from './ui/scanner.js';
import { initUpdateCheck } from './ui/actualizar.js';

// Series cuyo peso se completó solo copiando el de la serie de arriba (ver input "kg").
const autoKg = new Set();

export function renderApp(){
  // Una cuenta de coach ve solo su panel: si algo pedía la pantalla del cliente, quedaba
  // dibujada debajo del panel (que es transparente) y se veían las dos encimadas.
  if(State.cloudProfile && State.cloudProfile.role==="coach"){ const v=document.getElementById("view"); if(v) v.innerHTML=""; renderCoach(); return; }
  setTimeout(renderFeedback,0);
  checkDaily();
  document.getElementById("nav-entreno").classList.toggle("active", State.view==="entreno");
  document.getElementById("nav-habitos").classList.toggle("active", State.view==="habitos");
  document.getElementById("nav-cardio").classList.toggle("active", State.view==="cardio");
  document.getElementById("nav-comida").classList.toggle("active", State.view==="comida");
  document.getElementById("nav-progreso").classList.toggle("active", State.view==="progreso");
  const _cfgBtn = document.getElementById("nav-config");
  if (_cfgBtn) _cfgBtn.classList.toggle("active", State.view==="config");
  if (State.view === "config") {
    showSilkBg();
    document.body.classList.remove("silk-coach");
    const v0 = document.getElementById("view");
    v0.innerHTML = renderConfig();
    const sh0 = document.getElementById("sheetHost"); if (sh0) sh0.innerHTML = "";
    return;
  }
  showSilkBg();
  document.body.classList.remove("silk-coach");
  const v = document.getElementById("view");
  v.innerHTML = State.view==="entreno" ? renderEntreno() : State.view==="habitos" ? renderHabitos() : State.view==="cardio" ? renderCardio() : State.view==="comida" ? renderComida() : renderProgreso();
  if (State.view==="comida") animateCalRing();
  initScrollReveal();
  setupExerciseFocus();
  renderRestBar();
  const _sh=document.getElementById("sheetHost"); if(_sh) _sh.innerHTML = EntrenoState.exPicker ? renderExSheet() : ((State.view==="comida" && (ComidaState.selectedFood||ComidaState.editEntry)) ? renderSheet() : (State.view==="comida" && ComidaState.searchOpen) ? renderSearchSheet() : (State.view==="progreso" && EditState.se) ? renderSessionEdit() : "");
  if (State.view==="habitos" && HabitosState.pendingFocusHabit) { const i=document.getElementById("habitInput"); if(i) i.focus(); HabitosState.pendingFocusHabit=false; }
  if (State.view==="entreno" && HabitosState.pendingFocusDay) { const i=v.querySelector(".day-name"); if(i){ i.focus(); i.select(); } HabitosState.pendingFocusDay=false; }
}

// Gramos anotados: enteros, salvo lo que pesa menos de 10 g (un disparo de aceite, 0,3 g).
const roundG = g => g < 10 ? Math.round(g*10)/10 : Math.round(g);

// Comida: el día que se mira. Hoy usa state.diary (se sube con el resto del día); uno
// anterior usa la lista que se trajo de la nube y se sube aparte (cloudSaveFoods).
function viewDay(){ const td=today(), vd=ComidaState.viewDate; return (vd && vd<td) ? vd : null; }
function curDiary(){ const d=viewDay(); return d ? (dayItems(d)||[]) : state.diary; }
function commitDiary(){
  const d=viewDay();
  if(d){
    const list=dayItems(d)||[];
    const k=Math.round(list.reduce((a,e)=>a+(Number(e.kcal)||0),0));
    state.kcalLog=Object.assign({}, state.kcalLog||{}); if(k>0) state.kcalLog[d]=k; else delete state.kcalLog[d];
    save(); cloudSaveFoods(d, list);
  } else save();
}

// Comida: cambiar el día que se mira (n = -1 anterior, 1 siguiente, 0 hoy). Los anteriores
// se traen de la nube la primera vez; no se puede pasar de hoy.
function goDay(n){
  const td=today(), cur=ComidaState.viewDate||td;
  const d = n===0 ? td : addDays(cur, n);
  if(d>td || d===cur) return;
  ComidaState.viewDate = d===td ? null : d;
  if(d!==td){ retryDay(d); loadDay(d, ()=>{ if(State.view==="comida" && ComidaState.viewDate===d) renderApp(); }); }
  renderApp();
  const box=document.querySelector("#view .day-swipe");
  if(box){ box.classList.add(n<0 ? "day-in-left" : "day-in-right"); }
}

// Deslizar en Comida cambia de día (como en Fitia): hacia la izquierda, el día anterior;
// hacia la derecha, se vuelve hacia hoy. Solo gestos claramente horizontales, y no sobre
// campos de texto ni con una ventana abierta.
let _sw=null;
document.addEventListener("touchstart", e=>{
  if(State.view!=="comida" || e.touches.length!==1) { _sw=null; return; }
  const t=e.target;
  if(!t.closest || !t.closest("#view .day-swipe") || t.closest("input, textarea, select, .sheet, .meal-chips")) { _sw=null; return; }
  _sw={x:e.touches[0].clientX, y:e.touches[0].clientY, t:Date.now()};
}, {passive:true});
document.addEventListener("touchend", e=>{
  if(!_sw) return;
  const dx=e.changedTouches[0].clientX-_sw.x, dy=e.changedTouches[0].clientY-_sw.y, dt=Date.now()-_sw.t; _sw=null;
  if(Math.abs(dx)<60 || Math.abs(dy)>Math.abs(dx)*0.6 || dt>800) return;
  if(document.querySelector("#sheetHost .sheet")) return;
  goDay(dx<0 ? -1 : 1);
}, {passive:true});

// Editar entreno: al quitar una serie se redibuja solo el contenido de la ventana.
function paintSessionEdit(){
  const card=document.querySelector("#sheetHost .se-sheet");
  if(!card){ renderApp(); return; }
  const tmp=document.createElement("div"); tmp.innerHTML=renderSessionEdit();
  const fresh=tmp.querySelector(".se-sheet"); if(fresh) card.innerHTML=fresh.innerHTML;
}

function afterSetDone(d, ex, s){
  // La primera serie tildada del día marca el comienzo del entreno (para el tiempo total).
  // Si no se tocó «Iniciar entrenamiento», arranca acá (y vuelve a arrancar si se había destildado todo).
  const w=state.wkStart, others=d.exercises.some(x=>x.sets.some(t=>t.done && t!==s));
  if(!w || w.date!==today() || w.day!==d.id || (!w.manual && !others)){ state.wkStart={date:today(), day:d.id, ts:Date.now()}; save(); }
  // El descanso ya no arranca solo al tildar: se inicia con «Iniciar descanso». En una
  // superserie la pantalla igual pasa a la serie que sigue.
  const idx=d.exercises.indexOf(ex);
  if(!ssGroupOf(d.exercises, idx)) return;
  const nx=ssNext(d.exercises, idx, ex.sets.indexOf(s));
  if(nx.target) setTimeout(()=>goToSet(nx.target), 420);
}
// Lleva la pantalla a la serie que sigue y la marca un momento.
function goToSet(t){
  const inp=document.querySelector('[data-ex="'+CSS.escape(t.ex)+'"][data-set="'+CSS.escape(t.set)+'"]');
  const row=inp && inp.closest(".set"); if(!row) return;
  anchorFocus(t.ex);
  row.scrollIntoView({block:"center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"});
  row.classList.remove("ss-next"); void row.offsetWidth; row.classList.add("ss-next");
}

export function tick(){
  const now = Date.now();
  if (CardioState.tmRunning){
    const rem = CardioState.tmEndTs - now;
    if (rem <= 0){ CardioState.tmRunning=false; CardioState.tmRemainingMs=0; CardioState.tmFinished=true; beep(); if(State.view==="cardio") renderApp(); }
    else { CardioState.tmRemainingMs = rem; if(State.view==="cardio" && CardioState.cardioMode==="timer") setRing(rem / CardioState.tmTarget, fmt(rem,true)); }
  }
  if (State.view==="entreno"){ const w=document.getElementById("wkTime"); if(w){ const t=wkElapsedText(); if(w.textContent!==t) w.textContent=t; } }
  if (CardioState.swRunning && State.view==="cardio" && CardioState.cardioMode==="stopwatch"){ const ms=CardioState.swAccum+(now-CardioState.swStartTs); setRing(swFrac(ms), fmt(ms)); }
}

setInterval(tick, 100);

document.body.addEventListener("input", async e => {
  const t = e.target, a = t.dataset.action; if(!a) return;
  if (a === "se-val") { setSessionEditVal(t); return; }
  if (a === "food-search") { ComidaState.foodQuery = t.value; scheduleOffSearch(t.value); const r=document.getElementById("foodResults"); if(r) r.innerHTML = renderResults(ComidaState.foodQuery); return; }
  if (a === "ex-search") { EntrenoState.exQuery = t.value; const l=document.getElementById("exList"); if(l) l.innerHTML = renderExList(); return; }
  if (a === "portion-grams") { const base = ComidaState.selectedFood ? selectedFoodValues() : (ComidaState.editEntry ? entryBase(ComidaState.editEntry) : null); if(base){ const pv=document.getElementById("portionPreview"); if(pv) pv.textContent = previewStr(base, t.value); const pu=document.getElementById("portionUnits"); const uf=sheetUnitFood(); if(pu && uf) pu.textContent = unitsLabel(t.value, cookPortion(uf.food, uf.cook), base.unit, uf.food); } ComidaState.sheetGrams = t.value; return; }
  if (a === "cf-field") { ComidaState.foodForm[t.dataset.field] = t.value; return; }
  if (a === "macro-field") { const g=k=>parseFloat(String((document.getElementById("macro_"+k)||{}).value||"").replace(",", "."))||0; const el2=document.getElementById("macroSum"); if(el2) el2.innerHTML=macroSumText({p:g("p"),c:g("c"),f:g("f")}); return; }
  if (a === "cal-field") { ComidaState.calForm[t.dataset.field] = t.value; return; }
  if (a === "wkg-field") { ProgresoState.weightForm.kg = t.value; return; }
  const d = day();
  if (a === "dayname") d.name = t.value;
  else if (a === "subtitle") d.subtitle = t.value;
  else if (a === "exname") { const ex=d.exercises.find(x=>x.id===t.dataset.ex); if(ex) ex.name=t.value; }
  else if (a === "secs") {
    const ex=d.exercises.find(x=>x.id===t.dataset.ex); const s=ex&&ex.sets.find(x=>x.id===t.dataset.set);
    if(s) s.secs=t.value;
  }
  else if (a === "kg" || a === "reps") {
    const ex=d.exercises.find(x=>x.id===t.dataset.ex); const s=ex&&ex.sets.find(x=>x.id===t.dataset.set);
    if(s){
      s[a]=t.value;
      if(a === "kg"){
        forgetPR(s.id); // si era la serie del récord y corrige el peso, puede volver a festejar
        // El peso casi siempre se repite: se copia a las series de abajo que están vacías o
        // que se completaron solas antes (si el cliente cambia una a mano, esa ya no se toca).
        autoKg.delete(s.id);
        const i=ex.sets.indexOf(s);
        ex.sets.slice(i+1).forEach(o=>{
          if(o.done || (String(o.kg||"")!=="" && !autoKg.has(o.id))) return;
          o.kg=t.value; if(t.value) autoKg.add(o.id); else autoKg.delete(o.id);
          const inp=document.querySelector('input.kg[data-set="'+o.id+'"]'); if(inp && inp!==t) inp.value=t.value;
        });
      }
    }
  }
  else return;
  save();
});

// «Mi plan» → Opciones: se lee una comida a la vez; al abrir una se cierra la anterior
// (el atributo name de <details> ya lo hace en navegadores nuevos; esto cubre los demás).
document.body.addEventListener("toggle", e => {
  const d = e.target;
  if (!(d instanceof HTMLDetailsElement) || !d.classList.contains("plan-acc") || !d.open) return;
  document.querySelectorAll("details.plan-acc[open]").forEach(o => { if (o !== d) o.open = false; });
}, true);

document.body.addEventListener("keydown", async e => {
  if (e.key === "Enter" && e.target.dataset && e.target.dataset.action === "habit-name-input") { e.preventDefault(); addHabit(); }
  if (e.key === "Enter" && e.target.classList && e.target.classList.contains("auth-in")) {
    e.preventDefault();
    const btn = document.querySelector('#authHost .auth-btn[data-auth^="do-"]');
    if (btn && !btn.disabled) btn.click();
  }
  if ((e.key === "Enter" || e.key === " ") && e.target.classList && e.target.classList.contains("auth-switch")) {
    e.preventDefault(); e.target.click();
  }
});

document.body.addEventListener("change", async e => {
  const t=e.target, a=t.dataset.action; if(!a) return;
  if (a === "wdate-field") { ProgresoState.weightForm.date = t.value; return; }
  if (a === "daily-kg" || a === "daily-steps" || a === "daily-text") { CheckinState.dailyForm = CheckinState.dailyForm || Object.assign({}, state.daily[today()]||{}); CheckinState.dailyForm[a==="daily-kg"?"kg":(a==="daily-steps"?"steps":t.dataset.k)] = t.value; return; }
  if (a === "ci-set") { CheckinState.checkinForm = CheckinState.checkinForm || JSON.parse(JSON.stringify(state.checkins[mondayOf(today())]||{})); CheckinState.checkinForm[t.dataset.k] = t.value; return; }
  if (a === "load-ex") { EntrenoState.loadEx = t.value; renderApp(); return; }
  // Foto de perfil (Ajustes del cliente y Configuración del coach).
  if (a === "avatar-pick") {
    const file=t.files&&t.files[0]; t.value=""; if(!file) return;
    document.body.classList.add("avatar-busy");
    const err=await uploadMyAvatar(file);
    document.body.classList.remove("avatar-busy");
    if(err){ alert(err); return; }
    if(CoachState.coachSettingsOpen) renderCoachSettings(); else renderApp();
    if(State.cloudProfile && State.cloudProfile.role==="coach") renderCoach();
    return;
  }
  if (a === "cf-photo") { const file=t.files&&t.files[0]; if(file){ const ff=ComidaState.foodForm; if(ff.photoUrl) URL.revokeObjectURL(ff.photoUrl); ff.photo=file; ff.photoUrl=URL.createObjectURL(file); renderApp(); } return; }
});

document.body.addEventListener("mousemove", e => {
  const t = e.target.closest(".tab"); if(!t) return;
  const r = t.getBoundingClientRect();
  t.style.setProperty("--gx", (e.clientX-r.left)+"px");
  t.style.setProperty("--gy", (e.clientY-r.top)+"px");
});

document.body.addEventListener("click", async e => {
  const tabBtn = e.target.closest(".tab");
  if (tabBtn) tabRipple(tabBtn, e.clientX, e.clientY);
  const navBtn = e.target.closest("[data-view]");
  if (navBtn) { State.view = navBtn.dataset.view; ComidaState.selectedFood=null; ComidaState.editEntry=null; ComidaState.calEditing=false; ComidaState.planOpen=false; ProgresoState.section=null; ComidaState.creatingFood=false; EntrenoState.exPicker=null; renderApp(); return; }
  const el = e.target.closest("[data-action]"); if(!el) return;
  const a = el.dataset.action;
  if (routineLocked() && ["addday","delday","removeex","addset","removeset","ex-add-open","ex-swap","ex-insert","ex-choose","ex-custom","load-default-routine"].indexOf(a)>=0) return;

  // Hábitos
  if (a === "habit-add") { addHabit(); return; }
  if (a === "chabit-toggle") { const k=hkey(el.dataset.name); state.habitsDone[k]=!state.habitsDone[k]; save(); renderApp(); return; }
  if (a === "habit-toggle") { const h=state.habits.find(x=>x.id===el.dataset.id); if(h) h.done=!h.done; save(); renderApp(); return; }
  if (a === "habit-remove") { state.habits = state.habits.filter(x=>x.id!==el.dataset.id); save(); renderApp(); return; }

  // Cardio
  if (a === "cardio-mode") { CardioState.cardioMode = el.dataset.mode; renderApp(); return; }
  if (a === "sw-toggle") { if(CardioState.swRunning){ CardioState.swAccum+=Date.now()-CardioState.swStartTs; CardioState.swRunning=false; } else { CardioState.swStartTs=Date.now(); CardioState.swRunning=true; } renderApp(); return; }
  if (a === "sw-lap") { CardioState.swLaps.push(CardioState.swAccum+(Date.now()-CardioState.swStartTs)); renderApp(); return; }
  if (a === "sw-reset") { CardioState.swRunning=false; CardioState.swAccum=0; CardioState.swStartTs=0; CardioState.swLaps=[]; renderApp(); return; }
  if (a === "tm-pick") { openTimePicker(CardioState.tmRemainingMs, "Elegí el tiempo", t => { if(t>0){ CardioState.tmTarget=t; CardioState.tmRemainingMs=t; CardioState.tmFinished=false; } renderApp(); }); return; }
  if (a === "sw-pick") { openTimePicker(CardioState.swAccum, "Arrancar desde", t => { CardioState.swAccum=t; CardioState.swLaps=[]; renderApp(); }); return; }
  if (a === "tm-toggle") { if(CardioState.tmRunning){ CardioState.tmRemainingMs=Math.max(0,CardioState.tmEndTs-Date.now()); CardioState.tmRunning=false; } else { initAudio(); CardioState.tmEndTs=Date.now()+CardioState.tmRemainingMs; CardioState.tmRunning=true; CardioState.tmFinished=false; } renderApp(); return; }
  if (a === "tm-reset") { CardioState.tmRunning=false; CardioState.tmFinished=false; CardioState.tmRemainingMs=CardioState.tmTarget; renderApp(); return; }

  // Comida
  if (a === "psec-open") { ProgresoState.section=el.dataset.v; ProgresoState.wAll=false; renderApp(); window.scrollTo(0,0); return; }
  if (a === "psec-close") { ProgresoState.section=null; renderApp(); window.scrollTo(0,0); return; }
  if (a === "w-all") { ProgresoState.wAll=!ProgresoState.wAll; renderApp(); return; }
  if (a === "plan-open") { ComidaState.planOpen=true; renderApp(); window.scrollTo(0,0); return; }
  if (a === "plan-close") { ComidaState.planOpen=false; renderApp(); return; }
  if (a === "plan-tab") { ComidaState.planTab=el.dataset.v; renderApp(); return; }
  if (a === "plan-day") { ComidaState.planDay=el.dataset.v; renderApp(); return; }
  if (a === "cal-open") { ComidaState.calForm = state.calProfile ? Object.assign({sex:"m",age:"",height:"",weight:"",activity:"mod",goal:"mantener"}, state.calProfile) : {sex:"m",age:"",height:"",weight:"",activity:"mod",goal:"mantener"}; ComidaState.calEditing=true; renderApp(); return; }
  if (a === "cal-cancel") { ComidaState.calEditing=false; renderApp(); return; }
  if (a === "cal-sex") { ComidaState.calForm.sex = el.dataset.val; renderApp(); return; }
  if (a === "cal-activity") { ComidaState.calForm.activity = el.dataset.val; renderApp(); return; }
  if (a === "cal-goal") { ComidaState.calForm.goal = el.dataset.val; renderApp(); return; }
  if (a === "cal-calc") {
    if(!(+ComidaState.calForm.age>0) || !(+ComidaState.calForm.height>0) || !(+ComidaState.calForm.weight>0)){ alert("Completá edad, altura y peso."); return; }
    // Recalcular deja los macros en automático otra vez.
    state.calProfile = Object.assign({}, ComidaState.calForm); delete state.calProfile.macros; state.calTarget = calcTarget(ComidaState.calForm); ComidaState.calEditing=false; save(); renderApp(); return;
  }
  if (a === "macro-save") {
    const g = k => Math.round(parseFloat(String((document.getElementById("macro_"+k)||{}).value||"").replace(",", "."))||0);
    const mm = { p: g("p"), c: g("c"), f: g("f") };
    if (!(mm.p>0 || mm.c>0 || mm.f>0) || mm.p>600 || mm.c>1500 || mm.f>400) { alert("Revisá los gramos de proteína, carbos y grasas."); return; }
    state.calProfile = Object.assign({}, state.calProfile||{}, { macros: mm });
    state.calTarget = macroKcal(mm); ComidaState.calEditing=false; save(); renderApp(); return;
  }
  if (a === "macro-auto") {
    if(state.calProfile){ state.calProfile = Object.assign({}, state.calProfile); delete state.calProfile.macros;
      // Con los datos del cuerpo cargados, las calorías vuelven a las calculadas.
      if(+state.calProfile.age>0 && +state.calProfile.height>0 && +state.calProfile.weight>0) state.calTarget = calcTarget(state.calProfile); }
    ComidaState.calEditing=false; save(); renderApp(); return;
  }
  if (a === "cal-manual") { const m=parseInt((document.getElementById("calManual")||{}).value); if(m>0){ state.calTarget=m; if(state.calProfile && state.calProfile.macros){ state.calProfile=Object.assign({}, state.calProfile); delete state.calProfile.macros; } ComidaState.calEditing=false; save(); renderApp(); } else alert("Ingresá un número de calorías válido."); return; }
  if (a === "food-create-open") { ComidaState.searchOpen=false; ComidaState.foodForm={name:"",kcal:"",p:"",c:"",f:"",unit:"g"}; ComidaState.creatingFood=true; renderApp(); return; }
  if (a === "food-create-cancel") { ComidaState.creatingFood=false; renderApp(); return; }
  if (a === "cf-unit") { ComidaState.foodForm.unit = el.dataset.val; renderApp(); return; }
  if (a === "food-create-save") {
    const ff=ComidaState.foodForm, num=v=>parseFloat(String(v==null?"":v).replace(",", "."))||0;
    if(!ff.name.trim() || ff.kcal==="" || !(num(ff.kcal)>=0)){ alert("Poné al menos nombre y calorías."); return; }
    const nf={ name:ff.name.trim()+(ff.brand&&ff.brand.trim()?" · "+ff.brand.trim():""), kcal:Math.round(num(ff.kcal)), p:num(ff.p), c:num(ff.c), f:num(ff.f), portion:100, unit:ff.unit||"g" };
    if(nf.kcal>950 || nf.p>100 || nf.c>100 || nf.f>100 || nf.p+nf.c+nf.f>105){ alert("Revisá los valores: tienen que ser cada 100 "+(nf.unit==="ml"?"ml":"g")+" (como en la tabla del paquete)."); return; }
    if(ff.code && kcalMismatch(nf.kcal, nf.p, nf.c, nf.f) && !confirm("Las calorías ("+nf.kcal+") no coinciden con los macros (darían unas "+Math.round(nf.p*4+nf.c*4+nf.f*9)+").\n\n¿Los copiaste bien de la etiqueta? Tocá Aceptar para guardar igual.")) return;
    if(ff.code && !ff.photo){ alert("Falta la foto de la tabla nutricional del paquete."); return; }
    if(ff.code){ nf.code=ff.code; nf.src="GIZE"; }
    state.foods.push(nf);
    ComidaState.creatingFood=false; save();
    if(ff.code){
      // La foto se sube primero; el producto queda para todos recién cuando la foto está arriba.
      const shared=Object.assign({}, nf, { name: ff.name.trim(), brand: (ff.brand||"").trim() });
      uploadLabelPhoto(ff.photo, ff.code).then(path=>saveShared(shared, ff.code, "user", path))
        .then(ok=>alert(ok ? "¡Gracias! "+ff.name.trim()+" ya quedó disponible para todos los usuarios de GIZE." : "Lo guardamos en tu cuenta, pero no se pudo compartir con la comunidad. Probá de nuevo más tarde."))
        .catch(()=>alert("Lo guardamos en tu cuenta, pero no se pudo subir la foto para compartirlo. Revisá tu conexión."))
        .finally(()=>{ if(ff.photoUrl) URL.revokeObjectURL(ff.photoUrl); });
      ComidaState.selectedFood=nf; ComidaState.cookState=null; ComidaState.sheetGrams=null; SheetState.sheetGen++;
    } else ComidaState.foodQuery=nf.name;
    renderApp(); return;
  }
  if (a === "prod-report") {
    const f=ComidaState.selectedFood; if(!f || !f.gid) return;
    const why=prompt("¿Qué dato está mal? (por ejemplo: las calorías, el nombre, la marca)"); if(why===null) return;
    reportShared(f.gid, why).then(ok=>alert(ok?"Gracias, lo vamos a revisar.":"No se pudo enviar el reporte. Probá de nuevo más tarde."));
    return;
  }
  if (a === "off-pick") { SheetState.sheetGen++; ComidaState.selectedFood = offResults[parseInt(el.dataset.idx)]; ComidaState.cookState = null; ComidaState.sheetGrams = null; rememberSearch(ComidaState.selectedFood); renderApp(); return; }
  if (a === "scan-open") { openScanner(onScannedCode); return; }
  if (a === "scan-close") { closeScanner(); return; }
  if (a === "scan-manual") { scannerManualCode(); return; }
  if (a === "food-pick") {
    SheetState.sheetGen++; const f=lastResults[parseInt(el.dataset.idx)]; ComidaState.selectedFood = f;
    ComidaState.cookState = f && f.lastCook ? f.lastCook : defaultCookState(f);
    // Desde recientes se abre con los gramos de la última vez.
    ComidaState.sheetGrams = f && f.lastGrams && !norm(ComidaState.foodQuery||"") ? String(f.lastGrams) : null;
    rememberSearch(f); renderApp(); return;
  }
  // Crudo / cocido: si el cliente no tocó los gramos se pasa a la porción sugerida en el
  // otro estado; si ya escribió cuánto pesó, se respeta ese número.
  if (a === "portion-cook") {
    const f = ComidaState.selectedFood; if(!f || !f.cook) return;
    const inp = document.getElementById("portionGrams"); const cur = inp ? inp.value : "";
    const wasDefault = String(cur) === String(cookPortion(f, ComidaState.cookState));
    ComidaState.cookState = el.dataset.val;
    ComidaState.sheetGrams = wasDefault ? null : cur;
    renderApp(); return;
  }
  // Unidades: − / + suman o restan una porción (1 banana, 1 feta, 1 scoop…).
  if (a === "portion-step") {
    const uf = sheetUnitFood(); if(!uf) return;
    const unit = cookPortion(uf.food, uf.cook); if(!(unit>0)) return;
    const inp = document.getElementById("portionGrams");
    const cur = parseFloat(String(inp ? inp.value : "").replace(",",".")) || 0;
    const n = Math.max(1, Math.round(cur/unit) + parseInt(el.dataset.d));
    // Sin renderApp(): redibujar todo volvía a animar la hoja como si se abriera de nuevo en
    // cada toque. Se cambia el número y el mismo aviso de "input" actualiza kcal y unidades.
    const g = Math.round(n*unit*10)/10;
    if (inp) { inp.value = String(g); inp.dispatchEvent(new Event("input", { bubbles: true })); }
    else { ComidaState.sheetGrams = String(g); renderApp(); }
    return;
  }
  if (a === "day-prev") { goDay(-1); return; }
  if (a === "day-next") { goDay(1); return; }
  if (a === "day-today") { goDay(0); return; }
  if (a === "portion-cancel") { closeSheet(()=>{ ComidaState.selectedFood=null; ComidaState.editEntry=null; ComidaState.sheetGrams=null; ComidaState.sheetMeal=null; renderApp(); }); return; }
  // Comida elegida en la búsqueda o en la hoja: se marca el botón en el lugar, sin redibujar
  // (no se pierde lo escrito en el buscador ni se vuelve a animar la hoja).
  if (a === "search-meal" || a === "sheet-meal") {
    if (a === "search-meal") ComidaState.meal = el.dataset.meal; else ComidaState.sheetMeal = el.dataset.meal;
    el.parentElement.querySelectorAll(".meal-chip").forEach(b=>{ const on=b===el; b.classList.toggle("on", on); b.setAttribute("aria-checked", on); });
    return;
  }
  // "Buscar alimento" o el "+" de una comida: abre la ventana de búsqueda con esa comida.
  if (a === "search-open" || a === "meal-add") {
    if (a === "meal-add") ComidaState.meal = el.dataset.meal;
    ComidaState.searchOpen = true; SheetState.sheetGen++; renderApp();
    setTimeout(()=>{ const inp=document.getElementById("foodSearch"); if(inp){ inp.focus(); try{ inp.setSelectionRange(inp.value.length, inp.value.length); }catch(e){} } }, 60);
    return;
  }
  if (a === "search-close") { closeSheet(()=>{ ComidaState.searchOpen=false; ComidaState.meal=null; renderApp(); }); return; }
  if (a === "water-toggle") { ComidaState.waterOpen=!ComidaState.waterOpen; renderApp(); return; }
  if (a === "portion-add") {
    const g = parseFloat((document.getElementById("portionGrams")||{}).value); if(!(g>0)){ return; }
    const f0 = ComidaState.selectedFood; if(!f0){ return; } const fc = g/100;
    // Con crudo/cocido se guardan los valores del estado elegido y queda en el nombre.
    const f = selectedFoodValues(); if(f0.cook) rememberCookState(f0, ComidaState.cookState);
    rememberOffProduct(f0); rememberRecent(f0, roundG(g), f0.cook ? ComidaState.cookState : null);
    // Base compartida: sube en la búsqueda si ya estaba; si vino de Open Food Facts, queda guardado.
    if(f0.src==="GIZE" && f0.gid) useShared(f0.gid); else if(f0.src==="OFF" && f0.code) saveShared(f0, f0.code, "off");
    curDiary().push({ id:newId(), meal:ComidaState.sheetMeal||ComidaState.meal||mealNow(), name:f0.name+(f0.cook?" ("+ComidaState.cookState+")":""), grams:roundG(g), kcal:Math.round(f.kcal*fc), p:+(f.p*fc).toFixed(1), c:+(f.c*fc).toFixed(1), f:+(f.f*fc).toFixed(1), unit:f.unit||"g", base:{kcal:f.kcal,p:f.p,c:f.c,f:f.f,unit:f.unit||"g"} });
    ComidaState.meal=null; ComidaState.searchOpen=false; ComidaState.foodQuery=""; ComidaState.off=null;
    commitDiary(); closeSheet(()=>{ ComidaState.selectedFood=null; ComidaState.sheetGrams=null; ComidaState.sheetMeal=null; renderApp(); }); return;
  }
  if (a === "portion-save") {
    const g = parseFloat((document.getElementById("portionGrams")||{}).value); if(!(g>0)){ return; }
    const e = ComidaState.editEntry; if(!e){ return; } const base=entryBase(e); const fc=g/100;
    if(ComidaState.sheetMeal) e.meal=ComidaState.sheetMeal;
    e.grams=roundG(g); e.kcal=Math.round(base.kcal*fc); e.p=+(base.p*fc).toFixed(1); e.c=+(base.c*fc).toFixed(1); e.f=+(base.f*fc).toFixed(1); e.unit=base.unit||"g"; e.base=base;
    commitDiary(); closeSheet(()=>{ ComidaState.editEntry=null; ComidaState.sheetMeal=null; renderApp(); }); return;
  }
  if (a === "diary-edit") { SheetState.sheetGen++; ComidaState.editEntry = curDiary().find(x=>x.id===el.dataset.id)||null; ComidaState.selectedFood=null; renderApp(); return; }
  if (a === "diary-remove") { const d=viewDay(), rest=curDiary().filter(x=>x.id!==el.dataset.id); if(d) setDayItems(d, rest); else state.diary=rest; commitDiary(); renderApp(); return; }

  // Pasos
  if (a === "steps-add") { state.steps = Math.max(0,(state.steps||0)+parseInt(el.dataset.n)); save(); renderApp(); return; }
  if (a === "steps-set") { const n=parseInt((document.getElementById("stepInput")||{}).value); if(n>=0){ state.steps=n; save(); renderApp(); } else alert("Pon\u00e9 un n\u00famero v\u00e1lido."); return; }
  if (a === "steps-goal") { const g=prompt("Meta diaria de pasos:", state.stepsGoal||10000); if(g!==null){ const n=parseInt(g); if(n>0){ state.stepsGoal=n; save(); renderApp(); } } return; }
  if (a === "steps-live") { if(liveCounting) stopLive(); else startLive(); return; }

  // Ejercicios (picker)
  if (a === "ex-add-open") { SheetState.sheetGen++; EntrenoState.exPicker={mode:"add"}; EntrenoState.exCat="pecho"; EntrenoState.exQuery=""; renderApp(); return; }
  if (a === "ex-swap") { SheetState.sheetGen++; EntrenoState.exPicker={mode:"swap", exId:el.dataset.ex}; EntrenoState.exCat="pecho"; EntrenoState.exQuery=""; renderApp(); return; }
  if (a === "ss-split") { if(routineLocked()) return; const exs=day().exercises, g=ssGroupOf(exs, +el.dataset.i); if(g){ for(let k=g.start;k<=g.end;k++) delete exs[k].ss; save(); renderApp(); } return; }
  if (a === "ss-toggle") { if(routineLocked()) return; const exs=day().exercises, i=+el.dataset.i; const e=exs[i]; if(e && i<exs.length-1){ if(e.ss) delete e.ss; else e.ss=true; save(); renderApp(); } return; }
  if (a === "ex-insert") { SheetState.sheetGen++; EntrenoState.exPicker={mode:"insert", idx:(+el.dataset.i||0)}; EntrenoState.exCat="pecho"; EntrenoState.exQuery=""; renderApp(); return; }
  if (a === "ex-cat") {
    EntrenoState.exCat=el.dataset.cat; EntrenoState.exQuery="";
    document.querySelectorAll("#sheetHost .ex-chip").forEach(c=>c.classList.toggle("on", c.dataset.cat===EntrenoState.exCat));
    const sEl=document.getElementById("exSearch"); if(sEl) sEl.value="";
    const l=document.getElementById("exList"); if(l) l.innerHTML = renderExList();
    return;
  }
  if (a === "ex-cancel") { closeSheet(()=>{ EntrenoState.exPicker=null; renderApp(); }); return; }
  if (a === "ex-choose") { const name=el.dataset.name; const d=day(); const mm=(muscleOf(name)!=="otros")?muscleOf(name):EntrenoState.exCat; if(EntrenoState.exPicker && EntrenoState.exPicker.mode==="swap"){ const ex=d.exercises.find(x=>x.id===EntrenoState.exPicker.exId); if(ex){ ex.name=name; ex.mus=mm; } } else if(EntrenoState.exPicker && EntrenoState.exPicker.mode==="insert"){ d.exercises.splice(EntrenoState.exPicker.idx,0,mkEx(name,2,mm)); } else { d.exercises.push(mkEx(name,2,mm)); } save(); closeSheet(()=>{ EntrenoState.exPicker=null; renderApp(); }); return; }
  if (a === "ex-custom") { const nm=prompt(EntrenoState.exPicker&&EntrenoState.exPicker.mode==="swap"?"Nuevo nombre del ejercicio:":"Nombre del ejercicio:",""); if(nm && nm.trim()){ const d=day(); const mm=EntrenoState.exCat; if(EntrenoState.exPicker&&EntrenoState.exPicker.mode==="swap"){ const ex=d.exercises.find(x=>x.id===EntrenoState.exPicker.exId); if(ex){ ex.name=nm.trim(); ex.mus=mm; } } else if(EntrenoState.exPicker&&EntrenoState.exPicker.mode==="insert"){ d.exercises.splice(EntrenoState.exPicker.idx,0,mkEx(nm.trim(),2,mm)); } else { d.exercises.push(mkEx(nm.trim(),2,mm)); } save(); closeSheet(()=>{ EntrenoState.exPicker=null; renderApp(); }); } return; }

  // Peso corporal
  if (a === "daily-save") {
    const d = CheckinState.dailyForm || {};
    const kg = parseFloat(String(d.kg||"").replace(",","."));
    const rec = Object.assign({}, state.daily[today()]||{}, d);
    rec._q = questionSnapshot(clientQuestions("daily"), rec);
    state.daily[today()] = rec;
    // Un solo número de pasos por día: lo que se anota acá es el mismo contador de Hábitos.
    const st = parseInt(rec.steps); if(st>=0) state.steps = st;
    if(kg>0){ const exw=state.weights.find(w=>w.date===today()); if(exw) exw.kg=kg; else state.weights.push({id:uid(), date:today(), kg:kg}); }
    CheckinState.dailyForm=null; save();
    const synced = await cloudSaveDaily(today(), rec);
    alert(synced ? "Registro guardado \u2713" : "Se guard\u00f3 en este dispositivo pero todav\u00eda no lleg\u00f3 a tu coach (sin conexi\u00f3n). Queda pendiente y se env\u00eda solo cuando vuelva internet.");
    renderApp(); return;
  }
  if (a === "fb-set") { CheckinState.fbForm=CheckinState.fbForm||{}; CheckinState.fbForm[el.dataset.k]=el.dataset.v; renderFeedback(); return; }
  if (a === "fb-skip") { CheckinState.fbSession=null; CheckinState.fbForm=null; CheckinState.newPRs=[]; renderApp(); return; }
  if (a === "fb-save") {
    const se=state.sessions.find(x=>x.id===CheckinState.fbSession); const f=CheckinState.fbForm||{};
    if(se){ if(f.rpe) se.rpe=+f.rpe; if(f.pump) se.pump=+f.pump; if(f.joint) se.joint=(f.joint==="S\u00ed"); save(); try{ cloudSessionFeedback(se); }catch(e){} }
    CheckinState.fbSession=null; CheckinState.fbForm=null; CheckinState.newPRs=[]; renderApp(); return;
  }
  if (a === "ci-open") { CheckinState.checkinOpen=true; CheckinState.checkinForm=null; renderApp(); return; }
  if (a === "photo-del") { const path=el.dataset.path, id=el.dataset.id; const ok=await cloudDeletePhoto(id, path); if(!ok) alert("No se pudo borrar la foto. Revisá tu conexión e intentá de nuevo."); return; }
  if (a === "ci-close") { CheckinState.checkinOpen=false; CheckinState.checkinForm=null; renderApp(); return; }
  // Pregunta de opciones del check-in. La adherencia se sigue guardando como número (va a
  // su propia columna); el resto, como el texto de la opción elegida.
  if (a === "ci-opt") { CheckinState.checkinForm = CheckinState.checkinForm || JSON.parse(JSON.stringify(state.checkins[mondayOf(today())]||{})); const k=el.dataset.k; CheckinState.checkinForm[k] = (k==="adherence") ? parseInt(el.dataset.v) : el.dataset.v; renderApp(); return; }
  if (a === "ci-save") {
    const wk = mondayOf(today());
    const f = CheckinState.checkinForm || {};
    state.checkins[wk] = Object.assign({}, state.checkins[wk]||{}, f);
    state.checkins[wk]._q = questionSnapshot(clientQuestions("checkin"), state.checkins[wk]);
    CheckinState.checkinOpen=false; CheckinState.checkinForm=null; save();
    const synced = await cloudSaveCheckin(wk, state.checkins[wk]);
    if(!synced && !isOnline()){ alert("Tu check-in se guardó en este dispositivo pero todavía no llegó a tu coach (sin conexión). Queda pendiente y se envía solo cuando vuelva internet."); renderApp(); return; }
    alert("\u00a1Check-in enviado a tu coach! 💪"); renderApp(); return;
  }
  if (a === "daily-set") { CheckinState.dailyForm = CheckinState.dailyForm || Object.assign({}, state.daily[today()]||{}); CheckinState.dailyForm[el.dataset.k] = el.dataset.v; renderApp(); return; }
  if (a === "weight-save") { const dEl=document.getElementById("wDate"), kEl=document.getElementById("wKg"); const date=dEl?dEl.value:""; const kg=parseFloat((kEl?kEl.value:"").replace(",",".")); if(!date){ alert("Elegí una fecha."); return; } if(!(kg>0)){ alert("Poné un peso válido."); return; } const exw=state.weights.find(w=>w.date===date); if(exw) exw.kg=kg; else state.weights.push({id:uid(),date,kg}); ProgresoState.weightForm={date:today(),kg:""}; save(); renderApp(); return; }
  if (a === "weight-edit") { const w=state.weights.find(x=>x.id===el.dataset.id); if(w){ ProgresoState.weightForm={date:w.date,kg:String(w.kg)}; } renderApp(); return; }
  if (a === "weight-remove") { state.weights=state.weights.filter(x=>x.id!==el.dataset.id); save(); renderApp(); return; }

  // Agua
  if (a === "water-add") { const n=parseInt(el.dataset.n)||0; state.water=Math.max(0,(state.water||0)+n); save(); renderApp(); return; }
  if (a === "water-goal") { const v=prompt("Meta de agua en ml (ej: 3000):", String(Math.round(state.waterGoal||3000))); if(v!==null){ const n=parseInt(v); if(n>0){ state.waterGoal=n; save(); renderApp(); } } return; }
  if (a === "rest-set") { startRest(parseInt(el.dataset.sec)||120); return; }
  if (a === "rest-pick") { state.restDefault = parseInt(el.dataset.sec)||120; save(); renderRestBar(); return; }
  if (a === "rest-play") { startRest(state.restDefault||120); return; }
  if (a === "rest-from-ex") { const sc=parseInt(el.dataset.sec)||0; if(sc>0) startRest(sc); return; }
  if (a === "rest-stop") { stopRest(); return; }
  if (a === "save-session") { saveSession(); return; }
  if (a === "session-edit") { if(openSessionEdit(el.dataset.id)) renderApp(); return; }
  if (a === "se-cancel") { closeSheet(()=>{ EditState.se=null; renderApp(); }); return; }
  if (a === "se-rmset") { removeSessionEditSet(+el.dataset.e, +el.dataset.s); paintSessionEdit(); return; }
  if (a === "se-save") {
    const r=cleanSessionEdit(); if(r.error){ alert(r.error); return; }
    const se=state.sessions.find(x=>x.id===EditState.se.id);
    if(se){ se.exercises=r.exercises; save(); cloudEditSession(se).then(ok=>{ if(!ok && !isOnline()) alert("El cambio se guardó en este dispositivo y se envía a tu cuenta cuando vuelva internet."); }); }
    closeSheet(()=>{ EditState.se=null; renderApp(); }); return;
  }
  if (a === "session-remove") { if(confirm("¿Borrar este entreno del historial?")){ const _s=state.sessions.find(x=>x.id===el.dataset.id); if(_s&&_s.cloudId){ try{ cloudDeleteSession(_s.cloudId); }catch(e){} } state.sessions=state.sessions.filter(x=>x.id!==el.dataset.id); save(); renderApp(); } return; }

  // Días
  if (a === "load-default-routine") { if(confirm("Esto reemplaza tus días de rutina por el Meso 2 \u00b7 Microciclo 8 (Torso / Piernas / Pecho-Espalda-Hombro / Pierna-Brazo). No toca tus pesos, sesiones ni h\u00e1bitos. \u00bfSeguro?")){ state.days = JSON.parse(JSON.stringify(DEFAULT.days)); State.activeId = state.days[0].id; save(); renderApp(); } return; }
  if (a === "addday") { const nd={id:uid(),name:"Nuevo",subtitle:"",exercises:[]}; state.days.push(nd); State.activeId=nd.id; HabitosState.pendingFocusDay=true; save(); renderApp(); return; }
  if (a === "delday") { if(state.days.length<=1){ alert("Tiene que quedar al menos un día."); return; } if(confirm("¿Eliminar este día?")){ state.days=state.days.filter(x=>x.id!==State.activeId); State.activeId=state.days[0].id; save(); renderApp(); } return; }

  // Entreno
  if (a === "tab") { State.activeId = el.dataset.day; setTimeout(renderApp, 130); return; } // deja ver el ripple antes del rerender
  const d = day();
  const ex = el.dataset.ex && d.exercises.find(x=>x.id===el.dataset.ex);
  if (a === "toggle") {
    const s=ex.sets.find(x=>x.id===el.dataset.set);
    const wasDone=allSetsDone(ex);
    // Peso que parece mal escrito (625 en vez de 62,5): se pregunta antes de tildar, así no
    // queda guardado como mejor marca y le tapa los récords de verdad.
    if(!s.done){
      const prev=suspiciousKg(ex, s);
      if(prev!==null && !confirm("¿Seguro que son "+String(s.kg).replace(".",",")+" kg?"+(prev?" Tu mejor marca en este ejercicio es "+String(prev).replace(".",",")+" kg.":"")+"\n\nSi lo escribiste mal, tocá Cancelar y corregilo.")){
        const inp=document.querySelector('input.kg[data-set="'+CSS.escape(s.id)+'"]'); if(inp){ inp.focus(); inp.select(); }
        return;
      }
    }
    s.done=!s.done;
    if(!s.done) forgetPR(s.id);
    const prDiff=checkSetPR(ex, s);
    save();
    const nowDone=allSetsDone(ex);
    // Al marcar una serie arranca solo el descanso de ese ejercicio (se puede saltear con
    // la X). No arranca si con esta serie se terminó todo el entrenamiento del día.
    if(s.done) afterSetDone(d, ex, s);
    // Se acaba de completar recién ahora (no estaba reabierto a mano) -> animar el
    // colapso. Si ya estaba todo tildado y esto es una corrección (reabierto), o si
    // se destildó, el render es inmediato como siempre.
    if(!wasDone && nowDone && !expandedOverride.has(ex.id)){
      // Con récord, primero se festeja en la fila y después se colapsa el ejercicio.
      // Mientras dura el festejo queda abierto (si no, renderApp ya lo dibuja colapsado).
      if(prDiff!==null){
        expandedOverride.add(ex.id); renderApp(); playPR(s.id, prDiff);
        setTimeout(()=>{
          // Si mientras tanto lo reabrió o destildó algo, no se toca.
          if(!allSetsDone(ex)){ expandedOverride.delete(ex.id); return; }
          collapseExerciseAnimated(ex.id, ()=>{ expandedOverride.delete(ex.id); renderApp(); }, true);
        }, PR_HOLD_MS);
      }
      else collapseExerciseAnimated(ex.id, renderApp, true);
    }
    else { renderApp(); if(prDiff!==null) playPR(s.id, prDiff); }
    return;
  }
  // Cronómetro de la serie (ejercicios por tiempo, como la plancha). Si ya corre, lo frena y
  // anota lo que duró; si no, cuenta hasta el objetivo y al llegar tilda la serie sola.
  if (a === "set-timer") {
    const s=ex&&ex.sets.find(x=>x.id===el.dataset.set); if(!s) return;
    if(runningSetId()===s.id){
      const r=stopTimer(); if(r && r.secs>0) s.secs=String(r.secs);
      save(); renderApp(); return;
    }
    const target=parseSecs(s.target)||parseSecs(s.secs)||0;
    startTimer(s.id, target, secs=>{
      s.secs=String(secs);
      if(!s.done){ s.done=true; afterSetDone(d, ex, s); }
      save(); renderApp();
    });
    renderApp(); return;
  }
  // Sugerencia de progresión: pone ese peso en las series que faltan (las reps las anota uno).
  if (a === "sug-use") {
    if(!ex) return;
    if(el.dataset.coach){ ex.sets.forEach(s=>{ const k=parseFloat(String(s.targetKg||"").replace(",", "."))||0; if(!s.done && k>0){ s.kg=String(k); autoKg.delete(s.id); } }); }
    else { const kg=parseFloat(el.dataset.kg); if(kg>0) ex.sets.forEach(s=>{ if(!s.done){ s.kg=String(kg); autoKg.delete(s.id); } }); }
    save(); renderApp(); return;
  }
  if (a === "ex-expand") { expandedOverride.add(ex.id); renderApp(); return; }
  if (a === "ex-collapse") { collapseExerciseAnimated(ex.id, ()=>{ expandedOverride.delete(ex.id); renderApp(); }); return; }
  // Descanso por ejercicio. Sin coach se guarda en el ejercicio (viaja con la rutina);
  // con coach, como preferencia propia (state.restPrefs) sin tocar la rutina del coach.
  if (a === "rest-edit") {
    const r=effectiveRest(ex), locked=routineLocked();
    const setRest=sec=>{ sec=Math.min(900, Math.max(15, sec)); if(locked) state.restPrefs[restKey(ex)]=sec; else ex.rest=restLabel(sec); save(); renderApp(); };
    const coachTxt=ex.rest ? restLabel(parseRest(ex.rest)||REST_DEFAULT) : "2:00";
    openTimePicker(r.sec*1000, "Descanso de este ejercicio", ms=>{ if(ms>0) setRest(Math.round(ms/1000)); }, locked ? {
      note: r.own ? "Lo cambiaste vos. Tu coach puso "+coachTxt+"." : "Tu coach puso "+coachTxt+". Si lo cambiás, queda solo para vos.",
      extra: r.own ? { label: "Usar el de tu coach ("+coachTxt+")", fn: ()=>{ delete state.restPrefs[restKey(ex)]; save(); renderApp(); } } : null
    } : { note: "Entre 15 segundos y 15 minutos." });
    return;
  }
  if (a === "rest-adj" || a === "rest-preset") {
    const cur = effectiveRest(ex).sec;
    const sec = Math.min(900, Math.max(15, a === "rest-preset" ? (parseInt(el.dataset.sec)||REST_DEFAULT) : cur + (parseInt(el.dataset.d)||0)));
    if (routineLocked()) { state.restPrefs[restKey(ex)] = sec; } else { ex.rest = restLabel(sec); }
    save(); renderApp(); return;
  }
  if (a === "rest-reset") { delete state.restPrefs[restKey(ex)]; save(); renderApp(); return; }
  if (a === "addset") { ex.sets.push(mkSet()); }
  else if (a === "removeset") { ex.sets = ex.sets.filter(x=>x.id!==el.dataset.set); }
  else if (a === "removeex") { d.exercises = d.exercises.filter(x=>x.id!==el.dataset.ex); }
  else if (a === "wk-start") { state.wkStart={date:today(), day:d.id, ts:Date.now(), manual:true}; }
  else if (a === "wk-cancel") { if(!confirm("¿Cancelar el entrenamiento? El reloj vuelve a cero (las series tildadas quedan).")) return; delete state.wkStart; }
  else if (a === "clear") { d.exercises.forEach(x=>x.sets.forEach(s=>s.done=false)); delete state.wkStart; }
  else return;
  save(); renderApp();
});

document.body.addEventListener("click", e=>{
  const rb=e.target.closest("[data-auth-role]"); if(!rb) return;
  const name=((document.getElementById("auName")||{}).value||"").trim();
  const email=((document.getElementById("auEmail")||{}).value||"").trim();
  const code=((document.getElementById("auCode")||{}).value||"").trim();
  showLogin("","up",{name:name, email:email, code:code, role:rb.dataset.authRole});
});

// Volver atrás desde Google (botón atrás, o la X de la app instalada) trae la página desde la
// caché del navegador tal como quedó: el botón seguía en "Abriendo Google..." y deshabilitado,
// y no respondía más hasta recargar. Se lo vuelve a habilitar sin borrar lo que se escribió.
window.addEventListener("pageshow", e=>{
  if(!e.persisted || State.cloudUser) return;
  const g=document.querySelector('#authHost [data-auth="google"]');
  if(g && g.disabled){ g.disabled=false; g.lastChild.textContent="Continuar con Google"; }
});

// Se guarda al tocarla (no al ingresar): así vale también para Google, que se va de la página.
document.body.addEventListener("change", e=>{
  if(e.target && e.target.id==="auRemember") setRememberSession(e.target.checked);
});

document.body.addEventListener("click", e=>{
  const tg=e.target.closest("[data-toggle-pass]"); if(!tg) return;
  const inp=document.getElementById("auPass"); if(!inp) return;
  const showingText = inp.type==="text";
  inp.type = showingText ? "password" : "text";
  tg.setAttribute("aria-label", showingText ? "Mostrar contraseña" : "Ocultar contraseña");
  tg.innerHTML = showingText ? auIcoEye : auIcoEyeOff;
});

document.body.addEventListener("click", async e=>{
  const b=e.target.closest("[data-auth]"); if(!b) return;
  const a=b.dataset.auth;
  if(a==="to-signup"){ showLogin("","up"); return; }
  if(a==="to-login"){ showLogin("","in",{email:((document.getElementById("auEmail")||{}).value||"").trim()}); return; }
  if(a==="to-forgot"){ showLogin("","forgot",{email:((document.getElementById("auEmail")||{}).value||"").trim()}); return; }
  if(a==="do-forgot"){
    const email=((document.getElementById("auEmail")||{}).value||"").trim();
    if(!/^[^@ ]+@[^@ ]+\.[^@ ]+$/.test(email)){ showLogin("Poné el mail con el que te registraste (ej: nombre@gmail.com).","forgot",{email:email}); return; }
    b.disabled=true; b.textContent="Enviando...";
    if(!State.sb) await ensureSb();
    if(!State.sb){ showLogin("No se pudo conectar con el servidor. Revisá tu conexión a internet y volvé a intentar.","forgot",{email:email}); return; }
    // En la app el link vuelve por gize://confirmado y se marca acá que es para recuperar.
    if(IS_NATIVE){ try{ localStorage.setItem(RECOVERY_REQ, String(Date.now())); }catch(e){} }
    else expectAuthLink();
    const r=await State.sb.auth.resetPasswordForEmail(email, {redirectTo: IS_NATIVE ? "gize://confirmado" : location.origin + location.pathname});
    if(r.error){
      const rate = r.error.status===429 || /rate|seconds/i.test(r.error.message||"");
      showLogin(rate ? "Ya te mandamos un link hace un momento. Esperá un minuto y probá de nuevo." : "No se pudo mandar el mail: "+r.error.message,"forgot",{email:email}); return;
    }
    // Supabase no dice si el mail tiene cuenta (para no revelar quién está registrado).
    showLogin("Listo. Si ese mail tiene una cuenta en GIZE, te llega un link para elegir una contraseña nueva. Revisá también la carpeta de spam."+(IS_NATIVE?" Abrilo en este celular.":""),"forgot",{email:email});
    return;
  }
  if(a==="do-newpass"){
    const pass=(document.getElementById("auPass")||{}).value||"";
    if(pass.length<6){ showLogin("La contraseña necesita al menos 6 caracteres.","newpass"); return; }
    b.disabled=true; b.textContent="Guardando...";
    const r=await State.sb.auth.updateUser({password:pass});
    if(r.error){
      const same=/different from the old|same/i.test(r.error.message||"");
      showLogin(same ? "Esa es tu contraseña actual: elegí una distinta." : "No se pudo guardar: "+r.error.message+". Si el link venció, pedí uno nuevo desde \"¿Olvidaste tu contraseña?\".","newpass"); return;
    }
    if(window.coreReplay) window.coreReplay();
    try{ await afterLogin(r.data.user); } finally { if(window.coreEnter) window.coreEnter(); }
    return;
  }
  if(a==="logout"){
    // El logout de antes no borraba nada de localStorage: si en el mismo dispositivo
    // después iniciaba sesión OTRA persona, heredaba el diario de comidas, hábitos, agua,
    // pesos y demás de quien usó la app antes. Y si esa cuenta nueva no tenía rutina en la
    // nube, loadCloud() le subía como "su" rutina la que había quedado puesta acá, con los
    // kg y reps de la persona anterior.
    // Los cambios del día (agua, comidas, hábitos) salen con 1,5 s de demora: se manda la
    // cola antes de contar, así solo avisa si de verdad quedó algo sin subir.
    if(State.cloudUser){ b.disabled=true; try{ await flushOutbox(); await syncRoutineNow(); }catch(e){} b.disabled=false; }
    if(State.cloudUser && localUnsynced()){
      const n=pendingCount();
      const que = n>0 ? n+" registro"+(n>1?"s":"")+(state.routineHash!==routineHash(state.days)?" y cambios de tu rutina":"") : "cambios de tu rutina";
      if(!confirm("Tenés "+que+" que todavía no se guardaron en tu cuenta (sin conexión). Si cerrás sesión ahora se pierden.\n\nConectate a internet, abrí la app y esperá unos segundos antes de salir.\n\n¿Cerrar sesión igual?")) return;
    }
    try{ await pushLogout(); }catch(e){} // antes del signOut: borrar el dispositivo necesita la sesión
    const logoutUid=State.cloudUser&&State.cloudUser.id;
    try{ await State.sb.auth.signOut(); }catch(e){}
    try{ localStorage.removeItem(KEY); localStorage.removeItem(PROFILE_KEY); localStorage.removeItem("gize_session_ephemeral"); }catch(e){}
    clearAccountLeftovers(logoutUid);
    location.reload();
    return;
  }
  // Los errores de join_coach con mensaje propio (plan vencido, cupo lleno) se muestran tal cual.
  const joinErr=er=>(er && er.code==="P0001" && er.message) ? er.message : "";
  if(a==="join"){ const code=((document.getElementById("joinCode")||{}).value||"").trim(); if(!code){ alert("Poné el código de tu coach."); return; } try{ const r=await State.sb.rpc("join_coach",{code:code}); if(r.data===true){ const pr=await State.sb.from("profiles").select("*").eq("id",State.cloudUser.id).maybeSingle(); if(pr.data) State.cloudProfile=pr.data; await loadCloud(); alert("¡Listo! Te vinculaste con tu coach."); renderApp(); } else { alert(joinErr(r.error) || "Código inválido. Revisalo con tu coach."); } }catch(err){ alert("No se pudo vincular: "+((err&&err.message)||err)); } return; }
  if(a==="google"){
    const mode = document.getElementById("auRole") ? "up" : "in";
    const role=((document.getElementById("auRole")||{}).value||"client").trim();
    const code=((document.getElementById("auCode")||{}).value||"").trim();
    const V={name:((document.getElementById("auName")||{}).value||"").trim(), email:((document.getElementById("auEmail")||{}).value||"").trim(), code:code, role:role};
    b.disabled=true; b.lastChild.textContent="Abriendo Google...";
    if(!State.sb) await ensureSb();
    if(!State.sb){ showLogin("No se pudo conectar con el servidor. Revisá tu conexión a internet y volvé a intentar.", mode, V); return; }
    try{ await signInWithGoogle({role:mode==="up"?role:"client", code:mode==="up"&&role==="client"?code:"", mode:mode, vals:V}); } // web: la página se va a Google
    catch(err){ showLogin("No se pudo entrar con Google: "+((err&&err.message)||err), mode, V); }
    return;
  }
  if(a==="do-login"||a==="do-signup"){
    try{ localStorage.removeItem("gize_google_intent"); }catch(e){} // un intento de Google abandonado no aplica acá
    const mode = a==="do-signup"?"up":"in";
    const email=((document.getElementById("auEmail")||{}).value||"").trim();
    const pass=(document.getElementById("auPass")||{}).value||"";
    const name=((document.getElementById("auName")||{}).value||"").trim();
    const code=((document.getElementById("auCode")||{}).value||"").trim();
    const role=((document.getElementById("auRole")||{}).value||"client").trim();
    const V={name:name, email:email, code:code, role:role};
    if(!email||!pass){ showLogin("Completá email y contraseña.", mode, V); return; }
    if(!/^[^@ ]+@[^@ ]+\.[^@ ]+$/.test(email)){ showLogin("Poné un email válido, con @ y punto (ej: nombre@gmail.com).", mode, V); return; }
    if(mode==="up" && pass.length<6){ showLogin("La contraseña necesita al menos 6 caracteres.", mode, V); return; }
    if(mode==="up" && name.length<2){ showLogin("Poné tu nombre y apellido, así tu coach sabe quién sos.", mode, V); return; }
    b.textContent="Cargando..."; b.disabled=true;
    // Repite el splash de arranque durante la espera de red del login: entrar
    // al panel de coach implica varios viajes a Supabase (perfil, clientes...)
    // después de este punto, así que conviene taparlos con la misma animación
    // en vez de dejar la pantalla de login colgada sin feedback.
    if(window.coreReplay) window.coreReplay();
    if(!State.sb) await ensureSb();
    if(!State.sb){ if(window.coreCancel) window.coreCancel(); showLogin("No se pudo conectar con el servidor. Revisá tu conexión a internet y volvé a intentar.", mode, V); return; }
    try{
      if(a==="do-signup"){
        const name=((document.getElementById("auName")||{}).value||"").trim();
        if(!IS_NATIVE) expectAuthLink(); // el link de confirmación vuelve a este navegador
        const r=await State.sb.auth.signUp({email:email, password:pass, options:{data:{full_name:name, role:role}, emailRedirectTo:(IS_NATIVE ? "gize://confirmado" : location.origin + location.pathname)}}); // gize:// abre la app instalada (core/supabase.js → openAuthLink)
        // Mail ya registrado: con la confirmación por mail activada Supabase no da error
        // (para no revelar qué mails existen) y devuelve un usuario sin identidades; sin
        // confirmación, da el error user_already_exists.
        const taken = r.error ? (r.error.code==="user_already_exists" || /already registered/i.test(r.error.message||""))
                              : !!(r.data && r.data.user && Array.isArray(r.data.user.identities) && r.data.user.identities.length===0);
        if(taken){ if(window.coreCancel) window.coreCancel(); showLogin("Este mail ya tiene una cuenta asociada. Ingresá con tu contraseña o con Google.","in",{email:email}); return; }
        if(r.error) throw r.error;
        if(code) setPendingCode(code);
      } else {
        const r=await State.sb.auth.signInWithPassword({email:email, password:pass});
        if(r.error) throw r.error;
      }
      const sess=await State.sb.auth.getSession();
      if(!sess.data.session){ if(window.coreCancel) window.coreCancel(); showLogin(IS_NATIVE ? "Listo. Te mandamos un mail para confirmar la cuenta: abrilo en este celular y tocá el link, que te trae de vuelta a la app." : "Listo. Te mandamos un mail para confirmar la cuenta: abrilo, hacé click en el link, y despues volvé y tocá Ingresar.","in",{email:email}); return; }
      await afterLogin(sess.data.session.user);
      if(window.coreEnter) window.coreEnter();
    }catch(err){ if(window.coreCancel) window.coreCancel(); showLogin("No se pudo: "+((err&&err.message)||err), mode, {name:name, email:email, code:code, role:role}); }
    return;
  }
});

document.body.addEventListener("click", async e => {
  const b=e.target.closest("[data-cp]"); if(!b) return;
  const a=b.dataset.cp;
  if(a==="cancel"){ closeSheet(()=>{ CoachState.coachPicker=null; renderCoachPicker(); }, {host:"#coachSheetHost", card:".cp-modal", duration:150}); return; }
  if(a==="cat"){ CoachState.coachPCat=b.dataset.c; CoachState.coachPQ=""; renderCoachPicker(); return; }
  if(a==="cats"){ CoachState.coachPCat=null; CoachState.coachPQ=""; renderCoachPicker(); return; }
  if(a==="choose"){ cpApply(b.dataset.name); return; }
  if(a==="custom"){ const nm=prompt(CoachState.coachPicker&&CoachState.coachPicker.mode==="swap"?"Nuevo nombre del ejercicio:":"Nombre del ejercicio:",""); if(nm&&nm.trim()) cpApply(nm.trim()); return; }
});

document.body.addEventListener("input", async e => {
  const el=e.target.closest('[data-cp="search"]'); if(!el) return;
  CoachState.coachPQ=el.value; renderCoachPicker();
  const si=document.querySelector(".cp-search"); if(si){ si.focus(); si.setSelectionRange(si.value.length, si.value.length); }
});

document.body.addEventListener("click", async e => {
  const b=e.target.closest('[data-action="avatar-remove"]'); if(!b) return;
  if(!confirm("¿Quitar tu foto de perfil? Vas a volver a mostrar tus iniciales.")) return;
  const err=await removeMyAvatar(); if(err){ alert(err); return; }
  if(CoachState.coachSettingsOpen) renderCoachSettings(); else renderApp();
  if(State.cloudProfile && State.cloudProfile.role==="coach") renderCoach();
});

document.body.addEventListener("click", async e => {
  const b=e.target.closest("[data-coach]"); if(!b) return;
  const a=b.dataset.coach;
  if(a==="copy-invite"){
    if(!CoachState.coachInvite) return;
    try{ await navigator.clipboard.writeText(CoachState.coachInvite); }
    catch(err){
      try{
        const ta=document.createElement("textarea");
        ta.value=CoachState.coachInvite; ta.style.position="fixed"; ta.style.opacity="0";
        document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
      }catch(e2){ alert("No se pudo copiar. Código: "+CoachState.coachInvite); return; }
    }
    const prevHtml=b.innerHTML;
    b.innerHTML=checkSvg+' ¡Copiado!'; b.classList.add("copied");
    setTimeout(()=>{ b.innerHTML=prevHtml; b.classList.remove("copied"); }, 1600);
    return;
  }
  if(a==="notif-toggle"){
    if(b.disabled) return;
    b.disabled=true;
    if(b.classList.contains("on")) await disablePush();
    else { const err=await enablePush(); if(err) alert(err); }
    renderCoachSettings(); return;
  }
  if(a==="rotate-invite"){
    if(!confirm("¿Cambiar tu código de invitación?\n\nEl código actual deja de servir: nadie más se va a poder vincular con él. Tus clientes ya vinculados siguen igual.")) return;
    b.disabled=true;
    try{
      const r=await State.sb.rpc("rotate_invite_code");
      if(r.error) throw r.error;
      if(!r.data) throw new Error("no se generó el código");
      CoachState.coachInvite=r.data;
      alert("Listo. Tu código nuevo es "+r.data+".");
    }catch(err){ alert("No se pudo cambiar el código: "+((err&&err.message)||err)); }
    renderCoach(); return;
  }
  if(a==="open"){ CoachState.coachClientTab="ficha"; CoachState.coachSec=null; CoachState.coachPlanSec=null; openClient(b.dataset.id); return; }
  if(a==="back"){ CoachState.coachSel=null; CoachState.coachData=null; renderCoach(); refreshCoachClients(); return; }
  if(a==="refresh"){ if(CoachState.coachSel) openClient(CoachState.coachSel); return; }
  if(a==="open-settings"){ CoachState.coachNameForm=null; CoachState.coachSettingsOpen=true; renderCoachSettings(); return; }
  if(a==="settings-cancel"){ closeSheet(()=>{ CoachState.coachSettingsOpen=false; CoachState.coachNameForm=null; renderCoachSettings(); }, {host:"#coachSheetHost", card:".cp-ccard", duration:150}); return; }
  if(a==="settings-name-save"){
    const val=(CoachState.coachNameForm!=null?CoachState.coachNameForm:"").trim();
    if(!val){ alert("Poné un nombre."); return; }
    const prevHtml=b.innerHTML; b.disabled=true; b.innerHTML="Guardando…";
    try{
      const r=await State.sb.from("profiles").update({full_name:val}).eq("id",State.cloudUser.id);
      if(r.error) throw r.error;
      await loadCloud();
      closeSheet(()=>{ CoachState.coachSettingsOpen=false; CoachState.coachNameForm=null; renderCoachSettings(); renderCoach(); }, {host:"#coachSheetHost", card:".cp-ccard", duration:150});
    }catch(err){
      alert("No se pudo guardar: "+((err&&err.message)||err));
      b.disabled=false; b.innerHTML=prevHtml;
    }
    return;
  }
  if(a==="view-clients"){ CoachState.coachView="clients"; renderCoach(); return; }
  if(a==="view-tpls"){ CoachState.coachView="tpls"; await loadTpls(); renderCoach(); return; }
  if(a==="tpl-seed"){
    const days=JSON.parse(JSON.stringify(DEFAULT.days||[]));
    days.forEach(d=>{ d.id=uid(); (d.exercises||[]).forEach(ex=>{ ex.id=uid(); (ex.sets||[]).forEach(st=>{ st.id=uid(); st.kg=""; st.reps=""; st.done=false; }); }); });
    CoachState.coachTplEdit={id:null, name:"Meso 2 \u00b7 Microciclo 8", days:days}; CoachState.coachEditDay=0; renderCoach(); return;
  }
  if(a==="tpl-seed-ppl"){
    const days=JSON.parse(JSON.stringify(PPL_DAYS||[]));
    days.forEach(d=>{ d.id=uid(); (d.exercises||[]).forEach(ex=>{ ex.id=uid(); (ex.sets||[]).forEach(st=>{ st.id=uid(); st.kg=""; st.reps=""; st.done=false; }); }); });
    CoachState.coachTplEdit={id:null, name:"PPL \u00b7 5 d\u00edas", days:days}; CoachState.coachEditDay=0; renderCoach(); return;
  }
  if(a==="tpl-new"){ CoachState.coachTplEdit={id:null, name:"", days:[]}; CoachState.coachEditDay=0; renderCoach(); return; }
  if(a==="tpl-open"){ const t=CoachState.coachTpls.find(x=>x.id===b.dataset.id); if(t){ CoachState.coachTplEdit=JSON.parse(JSON.stringify(t)); CoachState.coachEditDay=0; renderCoach(); } return; }
  // Rutina programada (ver supabase/rutina-programada.sql): usa el mismo editor que las rutinas
  // guardadas, con la fecha de inicio. Al volver o guardar se queda en la pestaña Rutina del alumno.
  if(a==="sched-new"){
    if(!CoachState.coachData) return;
    CoachState.coachTplEdit={sched:true, id:null, name:"", starts_on:addDays(today(), 28), days:JSON.parse(JSON.stringify(CoachState.coachData.routine||[]))};
    CoachState.coachEditDay=0; renderCoach(); window.scrollTo(0,0); return;
  }
  if(a==="sched-open"){
    const s=((CoachState.coachData&&CoachState.coachData.schedule)||[]).find(x=>x.id===b.dataset.id); if(!s) return;
    CoachState.coachTplEdit={sched:true, id:s.id, name:s.name||"", starts_on:s.starts_on, days:JSON.parse(JSON.stringify(s.days||[]))};
    CoachState.coachEditDay=0; renderCoach(); window.scrollTo(0,0); return;
  }
  if(a==="tpl-back" && CoachState.coachTplEdit && CoachState.coachTplEdit.sched){ CoachState.coachTplEdit=null; CoachState.coachEditDay=0; renderCoach(); return; }
  if(a==="tpl-save" && CoachState.coachTplEdit && CoachState.coachTplEdit.sched){
    const e=CoachState.coachTplEdit, cid=CoachState.coachSel;
    if(!e.starts_on || e.starts_on<today()){ alert("Elegí desde qué día empieza (hoy o más adelante)."); return; }
    if(!(e.days||[]).length){ alert("La rutina programada no tiene días."); return; }
    b.textContent="Guardando...";
    try{
      const row={client_id:cid, starts_on:e.starts_on, name:(e.name||"").trim().slice(0,80)||null, days:e.days};
      const r = e.id ? await State.sb.from("routine_schedule").update(row).eq("id",e.id) : await State.sb.from("routine_schedule").insert(row);
      if(r.error){ if(r.error.code==="23505") throw new Error("Ya hay otra rutina programada para ese día."); throw r.error; }
      CoachState.coachTplEdit=null; CoachState.coachEditDay=0;
      // Si empieza hoy, se aplica ya; openClient vuelve a leer todo.
      alert(e.starts_on===today() ? "Rutina aplicada desde hoy \u2713" : "Rutina programada \u2713 Empieza sola ese día.");
      await openClient(cid); return;
    }catch(err){ alert("No se pudo: "+((err&&err.message)||err)); b.textContent="Guardar rutina programada"; return; }
  }
  if(a==="tpl-del" && CoachState.coachTplEdit && CoachState.coachTplEdit.sched){
    const e=CoachState.coachTplEdit;
    if(e.id){
      if(!confirm("¿Borrar esta rutina programada? El alumno sigue con la de ahora.")) return;
      try{ sbOk(await State.sb.from("routine_schedule").delete().eq("id",e.id)); }catch(err){ alert("No se pudo: "+((err&&err.message)||err)); return; }
    }
    CoachState.coachTplEdit=null; CoachState.coachEditDay=0; await openClient(CoachState.coachSel); return;
  }
  if(a==="tpl-back"){ CoachState.coachTplEdit=null; CoachState.coachView="tpls"; renderCoach(); return; }
  if(a==="tpl-save"){
    if(!CoachState.coachTplEdit) return;
    const nm=(CoachState.coachTplEdit.name||"").trim();
    if(!nm){ alert("Ponele un nombre a la rutina."); return; }
    b.textContent="Guardando...";
    try{
      const row={coach_id:State.cloudUser.id, name:nm, days:CoachState.coachTplEdit.days||[], updated_at:new Date().toISOString()};
      if(CoachState.coachTplEdit.id) row.id=CoachState.coachTplEdit.id;
      const r=await State.sb.from("routine_templates").upsert(row).select();
      if(r.error) throw r.error;
      await loadTpls(); CoachState.coachTplEdit=null; CoachState.coachView="tpls"; alert("Rutina guardada \u2713");
    }catch(err){ alert("No se pudo: "+((err&&err.message)||err)); }
    renderCoach(); return;
  }
  if(a==="tpl-del"){
    if(!CoachState.coachTplEdit||!CoachState.coachTplEdit.id){ CoachState.coachTplEdit=null; CoachState.coachView="tpls"; renderCoach(); return; }
    if(!confirm("\u00bfBorrar esta rutina? No afecta a los clientes que ya la tienen aplicada.")) return;
    try{ sbOk(await State.sb.from("routine_templates").delete().eq("id",CoachState.coachTplEdit.id)); await loadTpls(); }catch(e){ alert("No se pudo: "+((e&&e.message)||e)); }
    CoachState.coachTplEdit=null; CoachState.coachView="tpls"; renderCoach(); return;
  }
  if(!CoachState.coachData && !CoachState.coachTplEdit) return;
  if(a==="client-tab"){ CoachState.coachClientTab=b.dataset.t; CoachState.coachSec=null; CoachState.coachPlanSec=null; renderCoach(); return; }
  if(a==="plsec-open"){ CoachState.coachPlanSec=b.dataset.v; renderCoach(); window.scrollTo(0,0); return; }
  if(a==="plsec-close"){ CoachState.coachPlanSec=null; renderCoach(); window.scrollTo(0,0); return; }
  if(a==="sec-open"){ CoachState.coachSec=b.dataset.v; renderCoach(); window.scrollTo(0,0); return; }
  if(a==="sec-close"){ CoachState.coachSec=null; renderCoach(); window.scrollTo(0,0); return; }
  if(a==="edit-day"){ CoachState.coachEditDay=+b.dataset.i||0; renderCoach(); return; }
  if(a==="rt-tosave"){
    const nm=prompt("Nombre para guardar esta rutina en tu biblioteca:","");
    if(!nm||!nm.trim()) return;
    try{
      const days=JSON.parse(JSON.stringify(CoachState.coachData.routine||[]));
      days.forEach(d=>{ (d.exercises||[]).forEach(ex=>{ (ex.sets||[]).forEach(st=>{ st.kg=""; st.reps=""; st.done=false; }); }); });
      const r=await State.sb.from("routine_templates").insert({coach_id:State.cloudUser.id, name:nm.trim(), days:days}).select();
      if(r.error) throw r.error;
      await loadTpls(); alert("Guardada en “Mis rutinas” \u2713");
    }catch(e){ alert("No se pudo: "+((e&&e.message)||e)); }
    return;
  }
  if(a==="remove-client"){
    const d=CoachState.coachData; if(!d||!d.id) return;
    const nm=d.name||"este cliente";
    if(!confirm("¿Desvincular a "+nm+"?\n\nVas a dejar de ver sus entrenos y su progreso, y no vas a poder editarle la rutina. "+nm+" no pierde nada: conserva su rutina y sus registros, y se puede volver a vincular con tu código.")) return;
    b.disabled=true;
    try{
      const r=await State.sb.rpc("coach_remove_client",{client:d.id});
      if(r.error) throw r.error;
      if(r.data!==true) throw new Error("ya no estaba vinculado a vos");
      CoachState.coachClients=CoachState.coachClients.filter(c=>c.id!==d.id);
      CoachState.coachSel=null; CoachState.coachData=null;
      renderCoach(); refreshCoachClients();
    }catch(err){ alert("No se pudo desvincular: "+((err&&err.message)||err)); b.disabled=false; }
    return;
  }
  if(a==="rt-copy"){ CoachState.coachCopyPicker={}; renderCopyPicker(); return; }
  if(a==="cpy-cancel"){ if(CoachState.coachCopyPicker&&CoachState.coachCopyPicker.loading) return; closeSheet(()=>{ CoachState.coachCopyPicker=null; renderCopyPicker(); }, {host:"#applyMount", card:".cp-ccard", duration:150}); return; }
  if(a==="cpy-to"){
    const st=CoachState.coachCopyPicker; if(!st||st.loading) return;
    const to=CoachState.coachClients.find(c=>c.id===b.dataset.id); if(!to) return;
    const toName=to.full_name||to.email||"ese cliente";
    const days=JSON.parse(JSON.stringify(CoachState.coachData.routine||[]));
    if(!days.length){ alert("Esta rutina está vacía: no hay nada para copiar."); return; }
    if(!confirm("¿Copiar esta rutina a "+toName+"?\n\nReemplaza la rutina que tenga ahora.")) return;
    // Ids nuevos y sin lo que cargó este cliente (kg, reps, segundos y tildes).
    days.forEach(d=>{ d.id=uid(); (d.exercises||[]).forEach(ex=>{ ex.id=uid(); (ex.sets||[]).forEach(s=>{ s.id=uid(); s.kg=""; s.reps=""; s.done=false; if("secs" in s) s.secs=""; }); }); });
    st.loading=true; renderCopyPicker();
    try{
      const r=await State.sb.from("routines").upsert({client_id:to.id, days:days, updated_at:new Date().toISOString(), updated_by:State.cloudUser.id},{onConflict:"client_id"});
      if(r.error) throw r.error;
      closeSheet(()=>{ CoachState.coachCopyPicker=null; renderCopyPicker(); }, {host:"#applyMount", card:".cp-ccard", duration:150});
      alert("Rutina copiada a "+toName+" ✓");
    }catch(err){ st.loading=false; renderCopyPicker(); alert("No se pudo copiar: "+((err&&err.message)||err)); }
    return;
  }
  if(a==="rt-apply"){
    try{
      CoachState.coachApplyPicker={tplId:null, days:{}, mode:"replace", loading:true};
      renderApplyPicker();
      const mnt=document.getElementById("applyMount");
      if(!mnt || !mnt.innerHTML){ console.error("rt-apply: #applyMount no se montó"); alert("No se pudo abrir el selector de plantillas. Recargá la página y volvé a intentar."); return; }
      await loadTpls();
      if(CoachState.coachApplyPicker){ CoachState.coachApplyPicker.loading=false; renderApplyPicker(); }
    }catch(err){
      alert("No se pudo abrir el selector de plantillas. Revisá tu conexión y volvé a intentar.");
      console.error("rt-apply", err);
    }
    return;
  }
  if(a==="ap-cancel"){ closeSheet(()=>{ CoachState.coachApplyPicker=null; renderApplyPicker(); }, {host:"#applyMount", card:".cp-ccard", duration:150}); return; }
  if(a==="ap-back"){ CoachState.coachApplyPicker={tplId:null, days:{}, mode:"replace"}; renderApplyPicker(); return; }
  if(a==="ap-tpl"){ CoachState.coachApplyPicker.tplId=b.dataset.id; CoachState.coachApplyPicker.days={}; renderApplyPicker(); return; }
  if(a==="ap-day"){ const i=+b.dataset.i; CoachState.coachApplyPicker.days[i]=(CoachState.coachApplyPicker.days[i]===false); renderApplyPicker(); return; }
  if(a==="ap-mode"){ CoachState.coachApplyPicker.mode=b.dataset.m; renderApplyPicker(); return; }
  if(a==="ap-confirm"){
    const st=CoachState.coachApplyPicker; const tpl=CoachState.coachTpls.find(t=>t.id===st.tplId); if(!tpl) return;
    const picked=(tpl.days||[]).filter((d,i)=>st.days[i]!==false).map(d=>JSON.parse(JSON.stringify(d)));
    if(!picked.length){ alert("Elegí al menos un día."); return; }
    picked.forEach(d=>{ d.id=uid(); (d.exercises||[]).forEach(ex=>{ ex.id=uid(); (ex.sets||[]).forEach(s=>{ s.id=uid(); s.kg=""; s.reps=""; s.done=false; }); }); });
    if(st.mode==="add"){ CoachState.coachData.routine=(CoachState.coachData.routine||[]).concat(picked); }
    else { CoachState.coachData.routine=picked; }
    CoachState.coachEditDay=0;
    closeSheet(()=>{ CoachState.coachApplyPicker=null; renderApplyPicker(); renderCoach(); }, {host:"#applyMount", card:".cp-ccard", duration:150});
    alert("Rutina aplicada. Presioná “Guardar rutina” para sincronizar al cliente.");
    return;
  }
  if(a==="day-add"){ if(CoachState.coachTplEdit){ CoachState.coachTplEdit.days.push({id:uid(), name:"Nuevo día", subtitle:"", exercises:[]}); CoachState.coachEditDay=CoachState.coachTplEdit.days.length-1; } else { if(!CoachState.coachData.routine) CoachState.coachData.routine=[]; CoachState.coachData.routine.push({id:uid(), name:"Nuevo día", subtitle:"", exercises:[]}); CoachState.coachEditDay=CoachState.coachData.routine.length-1; } renderCoach(); return; }
  if(a==="day-prev"){ const D=rtDays(); if(D&&D.length){ CoachState.coachEditDay=(CoachState.coachEditDay-1+D.length)%D.length; renderCoach(); } return; }
  if(a==="day-next"){ const D=rtDays(); if(D&&D.length){ CoachState.coachEditDay=(CoachState.coachEditDay+1)%D.length; renderCoach(); } return; }
  if(a==="day-left"||a==="day-right"){ const D=rtDays(), i=CoachState.coachEditDay, j=i+(a==="day-left"?-1:1); if(D&&D[i]&&D[j]){ const t=D[i]; D[i]=D[j]; D[j]=t; CoachState.coachEditDay=j; renderCoach(); } return; }
  if(a==="day-del"){ const D=rtDays(); if(D&&D.length>1){ D.splice(CoachState.coachEditDay,1); CoachState.coachEditDay=0; renderCoach(); } return; }
  if(a==="rt-setadd"){ const day=(rtDays()||[])[CoachState.coachEditDay]; const ex=day.exercises[+b.dataset.i]; if(ex) ex.sets.push(mkSet()); renderCoach(); return; }
  if(a==="rt-setdel"){ const day=(rtDays()||[])[CoachState.coachEditDay]; const ex=day.exercises[+b.dataset.i]; if(ex && ex.sets.length>1) ex.sets.splice(+b.dataset.j,1); renderCoach(); return; }
  if(a==="rt-nosug-all"){ const rt=rtDays()||[]; const off=rt.some(x=>x.noSug); rt.forEach(x=>{ if(off) delete x.noSug; else x.noSug=true; (x.exercises||[]).forEach(e=>delete e.noSug); }); renderCoach(); return; }
  if(a==="rt-sug-fill"){ const day=(rtDays()||[])[CoachState.coachEditDay]; const e=day&&day.exercises[+b.dataset.i]; const kg=parseFloat(b.dataset.kg); if(e && kg>0){ e.sets.forEach(st=>{ st.targetKg=String(kg).replace(".", ","); }); renderCoach(); } return; }
  if(a==="rt-ss-split"){ const day=(rtDays()||[])[CoachState.coachEditDay]; const g=day && ssGroupOf(day.exercises, +b.dataset.i); if(g){ for(let k=g.start;k<=g.end;k++) delete day.exercises[k].ss; renderCoach(); } return; }
  if(a==="rt-ss"){ const i=+b.dataset.i; const day=(rtDays()||[])[CoachState.coachEditDay]; const e=day&&day.exercises[i]; if(e && i<day.exercises.length-1){ if(e.ss) delete e.ss; else e.ss=true; renderCoach(); } return; }
  if(a==="rt-up"){ const i=+b.dataset.i; const day=(rtDays()||[])[CoachState.coachEditDay]; if(day&&i>0){ const arr=day.exercises; [arr[i-1],arr[i]]=[arr[i],arr[i-1]]; CoachState.coachExMenu=null; renderCoach(); } return; }
  if(a==="rt-down"){ const i=+b.dataset.i; const day=(rtDays()||[])[CoachState.coachEditDay]; if(day&&i<day.exercises.length-1){ const arr=day.exercises; [arr[i+1],arr[i]]=[arr[i],arr[i+1]]; CoachState.coachExMenu=null; renderCoach(); } return; }
  if(a==="rt-del"){ const day=(rtDays()||[])[CoachState.coachEditDay]; const ex=day.exercises[+b.dataset.i]; if(ex){ CoachState.coachExpandedEx.delete(ex.id); if(CoachState.coachExMenu===ex.id) CoachState.coachExMenu=null; } day.exercises.splice(+b.dataset.i,1); renderCoach(); return; }
  if(a==="rt-dup"){
    const day=(rtDays()||[])[CoachState.coachEditDay]; const i=+b.dataset.i; const ex=day&&day.exercises[i]; if(!ex) return;
    const copy=JSON.parse(JSON.stringify(ex)); copy.id=uid(); (copy.sets||[]).forEach(s=>{ s.id=uid(); s.kg=""; s.reps=""; s.done=false; });
    day.exercises.splice(i+1,0,copy); CoachState.coachExpandedEx.add(copy.id); renderCoach(); return;
  }
  if(a==="rt-toggle"){
    const id=b.dataset.id;
    if(CoachState.coachExpandedEx.has(id)){ CoachState.coachExpandedEx.delete(id); CoachState.coachExMenu=null; }
    else CoachState.coachExpandedEx.add(id);
    renderCoach(); return;
  }
  if(a==="rt-menu"){ const day=(rtDays()||[])[CoachState.coachEditDay]; const ex=day&&day.exercises[+b.dataset.i]; if(!ex) return; CoachState.coachExMenu=(CoachState.coachExMenu===ex.id)?null:ex.id; renderCoach(); return; }
  if(a==="rt-timed"){ const day=(rtDays()||[])[CoachState.coachEditDay]; const ex=day&&day.exercises[+b.dataset.i]; if(ex){ ex.timed=(b.dataset.v==="1"); renderCoach(); } return; }
  if(a==="rt-swap"){ CoachState.coachExMenu=null; CoachState.coachPicker={mode:"swap", i:(+b.dataset.i||0)}; CoachState.coachPCat=null; CoachState.coachPQ=""; renderCoachPicker(); return; }
  if(a==="rt-add"){ CoachState.coachPicker={mode:"add"}; CoachState.coachPCat=null; CoachState.coachPQ=""; renderCoachPicker(); return; }
  if(a==="rt-ins"){ CoachState.coachPicker={mode:"insert", idx:(+b.dataset.i||0)}; CoachState.coachPCat=null; CoachState.coachPQ=""; renderCoachPicker(); return; }
  if(a==="info-save"){
    const i=CoachState.coachInfoForm||CoachState.coachData.info||{};
    const row={client_id:CoachState.coachData.id, age:parseInt(i.age)||null, height_cm:parseInt(i.height_cm)||null,
      availability:i.availability||null, objective:i.objective||null, stage:i.stage||null, commitment:i.commitment||null,
      structure:i.structure||null, block_goal:i.block_goal||null, injuries:i.injuries||null, cardio:i.cardio||null,
      steps_goal:parseInt(i.steps_goal)||null, updated_at:new Date().toISOString(), updated_by:State.cloudUser.id};
    try{ sbOk(await State.sb.from("client_info").upsert(row,{onConflict:"client_id"})); CoachState.coachData.info=row; CoachState.coachInfoForm=null; alert("Ficha guardada \u2713"); }
    catch(e){ alert("No se pudo: "+((e&&e.message)||e)); }
    renderCoach(); return;
  }
  if(a==="blk-dl"){
    CoachState.coachBlockForm = CoachState.coachBlockForm || Object.assign({}, CoachState.coachData.block||{});
    const w=parseInt(b.dataset.w); const arr=Array.isArray(CoachState.coachBlockForm.deloads)?CoachState.coachBlockForm.deloads.slice():[];
    const k=arr.indexOf(w); if(k>=0) arr.splice(k,1); else arr.push(w);
    CoachState.coachBlockForm.deloads=arr.sort((x,y)=>x-y); renderCoach(); return;
  }
  if(a==="blk-save"){
    const bf=CoachState.coachBlockForm||CoachState.coachData.block||{};
    if(!bf.start_date){ alert("Pon\u00e9 la fecha de inicio del bloque (un lunes)."); return; }
    const row={client_id:CoachState.coachData.id, name:bf.name||null, start_date:bf.start_date, weeks:parseInt(bf.weeks)||8,
      phase:bf.phase||null, calories:bf.calories||null, deloads:Array.isArray(bf.deloads)?bf.deloads:[], notes:bf.notes||null, active:true};
    try{
      if(CoachState.coachData.block && CoachState.coachData.block.id){ sbOk(await State.sb.from("blocks").update(row).eq("id",CoachState.coachData.block.id)); row.id=CoachState.coachData.block.id; }
      else { const r=sbOk(await State.sb.from("blocks").insert(row).select("id").single()); if(r.data) row.id=r.data.id; }
      CoachState.coachData.block=row; CoachState.coachBlockForm=null; alert("Bloque guardado \u2713");
    }catch(e){ alert("No se pudo: "+((e&&e.message)||e)); }
    renderCoach(); return;
  }
  if(a==="plan-save"){
    const p=CoachState.coachPlanForm||planDefault();
    // totales de días de entrenamiento como macros "globales" (compatibilidad con el banner del cliente)
    let tk=0,tp=0,tc=0,tf=0; (p.trainDays||[]).forEach(r=>{ tk+=+r.kcal||0; tp+=+r.prot||0; tc+=+r.cho||0; tf+=+r.fat||0; });
    const clean={trainDays:p.trainDays||[], restDays:p.restDays||[], water:p.water||"", salt:p.salt||"", guidelines:p.guidelines||[], supps:p.supps||[], options:p.options||[], extras:p.extras||[], swaps:p.swaps||[], cardio:p.cardio||{text:"",items:[]}, habits:p.habits||[]};
    const row={client_id:CoachState.coachData.id, kcal:tk||parseInt(p._kcal)||null, protein:tp||parseInt(p._protein)||null, carbs:tc||parseInt(p._carbs)||null, fat:tf||parseInt(p._fat)||null, notes:p._notes||null, plan:clean, updated_at:new Date().toISOString(), updated_by:State.cloudUser.id};
    try{ sbOk(await State.sb.from("nutrition").upsert(row,{onConflict:"client_id"})); CoachState.coachData.plan=row; CoachState.coachPlanForm=null; alert("Plan guardado \u2713"); }catch(e){ alert("No se pudo: "+((e&&e.message)||e)); }
    renderCoach(); return;
  }
  if(a==="pl-rest-toggle"){ coachPlanObj(CoachState.coachData); CoachState.coachPlanRestOpen=!CoachState.coachPlanRestOpen; renderCoach(); return; }
  if(a==="pl-mealadd"){ const p=coachPlanObj(CoachState.coachData); (p[b.dataset.key]=p[b.dataset.key]||[]).push({meal:"",time:"",kcal:"",cho:"",fat:"",prot:"",note:""}); renderCoach(); return; }
  if(a==="pl-mealdel"){ const p=coachPlanObj(CoachState.coachData); p[b.dataset.key].splice(+b.dataset.i,1); renderCoach(); return; }
  if(a==="pl-listadd"){ const p=coachPlanObj(CoachState.coachData); (p[b.dataset.key]=p[b.dataset.key]||[]).push(""); renderCoach(); return; }
  if(a==="pl-listdel"){ const p=coachPlanObj(CoachState.coachData); p[b.dataset.key].splice(+b.dataset.i,1); renderCoach(); return; }
  if(a==="pl-optsecadd"){ const p=coachPlanObj(CoachState.coachData); (p.options=p.options||[]).push({title:"",opts:[{label:"Opción A",body:""}]}); CoachState.coachOptOpen=p.options.length-1; renderCoach(); return; }
  if(a==="pl-opttoggle"){ const i=+b.dataset.i; CoachState.coachOptOpen = CoachState.coachOptOpen===i ? null : i; renderCoach(); return; }
  if(a==="pl-optsecdel"){ const p=coachPlanObj(CoachState.coachData); p.options.splice(+b.dataset.i,1); CoachState.coachOptOpen=null; renderCoach(); return; }
  if(a==="pl-optadd"){ const p=coachPlanObj(CoachState.coachData); const sec=p.options[+b.dataset.i]; sec.opts=sec.opts||[]; const L="Opción "+String.fromCharCode(65+sec.opts.length); sec.opts.push({label:L,body:""}); renderCoach(); return; }
  if(a==="pl-optdel"){ const p=coachPlanObj(CoachState.coachData); p.options[+b.dataset.i].opts.splice(+b.dataset.j,1); renderCoach(); return; }
  if(a==="pl-swapadd"){ const p=coachPlanObj(CoachState.coachData); (p.swaps=p.swaps||[]).push({from:"",to:""}); renderCoach(); return; }
  if(a==="pl-cardioitemadd"){ const p=coachPlanObj(CoachState.coachData); p.cardio=p.cardio||{text:"",items:[]}; (p.cardio.items=p.cardio.items||[]).push(""); renderCoach(); return; }
  if(a==="pl-cardioitemdel"){ const p=coachPlanObj(CoachState.coachData); p.cardio.items.splice(+b.dataset.i,1); renderCoach(); return; }
  if(a==="pl-habitadd"){ const p=coachPlanObj(CoachState.coachData); (p.habits=p.habits||[]).push(""); renderCoach(); return; }
  if(a==="pl-habitdel"){ const p=coachPlanObj(CoachState.coachData); p.habits.splice(+b.dataset.i,1); renderCoach(); return; }
  if(a==="pl-swapdel"){ const p=coachPlanObj(CoachState.coachData); p.swaps.splice(+b.dataset.i,1); renderCoach(); return; }
  if(a==="save-routine"){ b.textContent="Guardando..."; (async()=>{ try{ const r=await State.sb.from("routines").upsert({client_id:CoachState.coachSel, days:CoachState.coachData.routine, updated_at:new Date().toISOString(), updated_by:State.cloudUser.id},{onConflict:"client_id"}); if(r.error) throw r.error; alert("Rutina guardada. El cliente la va a ver al abrir la app."); }catch(err){ alert("No se pudo guardar: "+((err&&err.message)||err)); } renderCoach(); })(); return; }
});

document.body.addEventListener("change", async e => {
  const el=e.target.closest("[data-coach]"); if(!el||!CoachState.coachData) return;
  const a=el.dataset.coach;
  if(a==="ex"){ CoachState.coachData.loadEx=el.value; renderCoach(); }
  else if(a==="dayfilter"){ CoachState.coachDayFilter=el.value||null; CoachState.coachData.loadEx=null; renderCoach(); }
  else if(a==="daily-pick"){ CoachState.coachDailySel=el.value; renderCoach(); }
  else if(a==="ck-pick"){ CoachState.coachCkSel=el.value; renderCoach(); }
  else if(a==="sess-pick"){ CoachState.coachSessSel=el.value; renderCoach(); }
  else if(a==="photo-pick-date"){ CoachState.coachPhotoSel=el.value; renderCoach(); }
});

document.body.addEventListener("input", async e => {
  const el=e.target.closest("[data-coach]"); if(!el) return;
  const a0=el.dataset.coach;
  if(a0==="tpl-name"){ if(CoachState.coachTplEdit) CoachState.coachTplEdit.name=el.value; return; }
  if(a0==="sched-date"){ if(CoachState.coachTplEdit) CoachState.coachTplEdit.starts_on=el.value; return; }
  // A propósito NO llama a renderCoachSettings() acá: el input de "tpl-name" de arriba
  // tampoco re-renderiza en cada tecla, por la misma razón que el buscador de clientes
  // sí la tenía re-renderizar y hubo que arreglar (ver "coach-search" abajo) — reescribir
  // el modal entero en cada letra le tiraría el foco al input igual que le pasaba a ese.
  if(a0==="settings-name"){ CoachState.coachNameForm=el.value; return; }
  if(a0==="coach-search"){
    CoachState.coachSearch=el.value; renderCoach();
    // renderCoach() reescribe todo el innerHTML del panel, así que el <input> viejo (el
    // que tiene el foco) se destruye y aparece uno nuevo sin foco — cada letra tipeada
    // "soltaba" el cursor y había que hacer click de nuevo para seguir escribiendo.
    // Mismo arreglo que ya usa el buscador de ejercicios (.cp-search, ver más abajo):
    // reenfocar el input nuevo y mandar el cursor al final del texto.
    const si=document.querySelector(".co-search"); if(si){ si.focus(); si.setSelectionRange(si.value.length, si.value.length); }
    return;
  }
  // Sin rutina cargada igual se puede escribir la ficha, el bloque y el plan: solo lo de la
  // rutina necesita un día.
  const a=a0; const day=(rtDays()||[])[CoachState.coachEditDay];
  if(!day && /^(rt-|day-)/.test(a)) return;
  if(a==="rt-name"){ if(day.exercises[+el.dataset.i]) day.exercises[+el.dataset.i].name=el.value; }
  else if(a==="day-name"){ day.name=el.value; }
  else if(a==="rt-target"){ const ex=day.exercises[+el.dataset.i]; const st=ex&&ex.sets[+el.dataset.j]; if(st){ const v=el.value.trim(); if(v) st.target=v; else delete st.target; } }
  else if(a==="rt-targetkg"){ const ex=day.exercises[+el.dataset.i]; const st=ex&&ex.sets[+el.dataset.j]; if(st) st.targetKg=el.value; }
  else if(a==="rt-note"){ const ex=day.exercises[+el.dataset.i]; if(ex){ const v=el.value.trim(); if(v) ex.note=v; else delete ex.note; } }
  else if(a==="day-note"){ const v=el.value.trim(); if(v) day.note=v; else delete day.note; }
  else if(a==="rt-rir"||a==="rt-rest"||a==="rt-goal"||a==="rt-video"){ const ex=day.exercises[+el.dataset.i]; if(ex){ const k=(a==="rt-video")?"video":a.slice(3); let v=el.value.trim(); if(k==="video"&&v&&!/^https:\/\//i.test(v)) v="https://"+v.replace(/^[a-z][a-z0-9+.-]*:(\/\/)?/i,""); if(v) ex[k]=v; else delete ex[k]; } }
  else if(a.indexOf("info-")===0){ CoachState.coachInfoForm = CoachState.coachInfoForm || Object.assign({}, CoachState.coachData.info||{}); CoachState.coachInfoForm[a.slice(5)] = el.value; return; }
  else if(a.indexOf("blk-")===0){ CoachState.coachBlockForm = CoachState.coachBlockForm || Object.assign({}, CoachState.coachData.block||{}); CoachState.coachBlockForm[a.slice(4)] = el.value; return; }
  else if(a==="plan-kcal"||a==="plan-protein"||a==="plan-carbs"||a==="plan-fat"||a==="plan-notes"){ CoachState.coachPlanForm = CoachState.coachPlanForm || Object.assign({}, CoachState.coachData.plan||{}); CoachState.coachPlanForm[a.slice(5)] = el.value; }
  else if(a==="pl-meal"){ const p=coachPlanObj(CoachState.coachData); const r=p[el.dataset.key][+el.dataset.i]; if(r) r[el.dataset.k]=el.value; }
  else if(a==="pl-list"){ const p=coachPlanObj(CoachState.coachData); p[el.dataset.key][+el.dataset.i]=el.value; }
  else if(a==="pl-water"){ coachPlanObj(CoachState.coachData).water=el.value; }
  else if(a==="pl-salt"){ coachPlanObj(CoachState.coachData).salt=el.value; }
  else if(a==="pl-optsec"){ const p=coachPlanObj(CoachState.coachData); p.options[+el.dataset.i].title=el.value; }
  else if(a==="pl-optlabel"){ const p=coachPlanObj(CoachState.coachData); p.options[+el.dataset.i].opts[+el.dataset.j].label=el.value; }
  else if(a==="pl-optbody"){ const p=coachPlanObj(CoachState.coachData); p.options[+el.dataset.i].opts[+el.dataset.j].body=el.value; fitOptBody(el); }
  else if(a==="pl-swap"){ const p=coachPlanObj(CoachState.coachData); p.swaps[+el.dataset.i][el.dataset.k]=el.value; }
  else if(a==="pl-cardiotext"){ const p=coachPlanObj(CoachState.coachData); p.cardio=p.cardio||{text:"",items:[]}; p.cardio.text=el.value; }
  else if(a==="pl-cardioitem"){ const p=coachPlanObj(CoachState.coachData); p.cardio.items[+el.dataset.i]=el.value; }
  else if(a==="pl-habit"){ const p=coachPlanObj(CoachState.coachData); p.habits[+el.dataset.i]=el.value; }
});

document.addEventListener("visibilitychange", async ()=>{
  if(document.visibilityState!=="visible" || !State.sb || !State.cloudUser || !routineLocked()) return;
  try{
    const rt=await State.sb.from("routines").select("days").eq("client_id",State.cloudUser.id).maybeSingle();
    if(rt.data && Array.isArray(rt.data.days) && rt.data.days.length){
      state.days=mergeLocalProgress(rt.data.days, state.days); // conserva lo que el cliente ya cargó
      migrateNames(state.days);
      if(!state.days.find(x=>x.id===State.activeId)) State.activeId=state.days[0].id;
      renderApp();
    }
  }catch(e){}
});

if (migrateNames(state.days)) save();

cloudBoot();

initUpdateCheck(); // cartel de versión nueva en las apps de las tiendas
resumeRest(); // descanso que quedó corriendo al cerrar la app
// En la app nativa (Capacitor) los archivos ya viajan dentro de la app: no hace falta el service worker.
const IS_NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
if (!IS_NATIVE && "serviceWorker" in navigator) { window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).catch(()=>{}); }); }

// ---- Productos de marca (Open Food Facts) ----
// Búsqueda con espera de 450 ms desde la última tecla y cancelando la anterior: así no
// se pide nada por cada letra ni llega tarde una respuesta vieja.
let offTimer = null, offCtrl = null;
function paintOff(){ const box=document.getElementById("offResults"); if(box) box.innerHTML = renderOffResults(); }
function scheduleOffSearch(q){
  clearTimeout(offTimer); if(offCtrl){ offCtrl.abort(); offCtrl=null; }
  const qq = String(q||"").trim();
  if(qq.length < 3){ ComidaState.off = null; return; }
  ComidaState.off = { q: qq, status: "loading", items: [] };
  offTimer = setTimeout(async () => {
    const ctrl = offCtrl = new AbortController();
    try{
      // Primero la base compartida de GIZE; después Open Food Facts sin repetir códigos.
      const [shared, off] = await Promise.all([searchShared(qq).catch(()=>[]), searchOFF(qq, ctrl.signal).catch(e=>{ if(ctrl.signal.aborted) throw e; return null; })]);
      if(ctrl.signal.aborted || !ComidaState.off || ComidaState.off.q !== qq) return;
      if(off===null && !shared.length) throw new Error("sin resultados");
      const codes=new Set(shared.map(f=>f.code).filter(Boolean));
      ComidaState.off = { q: qq, status: "done", items: shared.concat((off||[]).filter(f=>!f.code || !codes.has(f.code))) };
    }catch(e){
      if(ctrl.signal.aborted) return;
      ComidaState.off = { q: qq, status: "error", items: [] };
    }
    paintOff();
  }, 450);
}

// Buscador de Comida: lo último que eligió buscando (5) y lo último que anotó (30), el más
// reciente primero y sin repetir. Se guardan copias sin los datos de la vez anterior.
const sameFood = (a, b) => a && b && a.name === b.name && (a.code || "") === (b.code || "");
const foodCopy = f => { const o = Object.assign({}, f); delete o.lastGrams; delete o.lastCook; return o; };
function rememberSearch(f){
  if(!f || !norm(ComidaState.foodQuery||"")) return;
  state.recentSearch = [foodCopy(f)].concat((state.recentSearch||[]).filter(x => !sameFood(x, f))).slice(0, 5);
  save();
}
function rememberRecent(f, grams, cook){
  const o = foodCopy(f); o.lastGrams = grams; if(cook) o.lastCook = cook;
  state.recentFoods = [o].concat((state.recentFoods||[]).filter(x => !sameFood(x, f))).slice(0, 30);
}

// Producto de marca agregado al diario → queda guardado en el dispositivo para
// encontrarlo al toque la próxima vez (máximo 150, el más reciente primero).
function rememberOffProduct(f){
  if(!f || (f.src !== "OFF" && f.src !== "GIZE")) return;
  state.offRecent = [f].concat((state.offRecent||[]).filter(x => !(x.code && x.code === f.code) && x.name !== f.name)).slice(0, 150);
}

// Código leído por el escáner (o escrito a mano).
async function onScannedCode(code){
  const known = (state.offRecent||[]).find(f => f.code === code);
  if(known){ ComidaState.selectedFood = known; ComidaState.cookState = null; ComidaState.sheetGrams = null; SheetState.sheetGen++; renderApp(); return; }
  // Primero la base compartida de GIZE, después Open Food Facts.
  let food = null;
  try{ food = await productByCodeShared(code); }catch(e){}
  if(!food){
    try{ food = await productByCode(code); }
    catch(e){ alert("No se pudo buscar el producto (¿sin conexión?). Probá de nuevo o cargalo a mano."); return; }
    if(food) saveShared(food, code, "off");
  }
  if(!food){
    if(confirm("Todavía nadie cargó el código " + code + ".\n\n¿Lo cargás vos con los datos de la etiqueta? Va a quedar disponible para todos los usuarios de GIZE.")){
      ComidaState.searchOpen=false; ComidaState.foodForm = {name:"",brand:"",kcal:"",p:"",c:"",f:"",unit:"g",code:String(code).replace(/\D/g,"")}; ComidaState.creatingFood = true; renderApp();
    }
    return;
  }
  ComidaState.selectedFood = food; ComidaState.cookState = null; ComidaState.sheetGrams = null; SheetState.sheetGen++; renderApp();
}

// Lista de clientes del coach al día: se vuelve a pedir al volver a la app (y al salir de
// un cliente). Antes se cargaba solo al entrar, así que la foto que un cliente subía con
// el panel del coach abierto no aparecía hasta cerrar y abrir la app.
let coachListAt = 0;
function refreshCoachClients(){
  if(!State.cloudProfile || State.cloudProfile.role!=="coach" || Date.now()-coachListAt < 15000) return;
  coachListAt = Date.now();
  loadCoachClients().then(()=>{ if(!CoachState.coachSel) renderCoach(); }).catch(()=>{});
}
document.addEventListener("visibilitychange", ()=>{ if(document.visibilityState==="visible") refreshCoachClients(); });
