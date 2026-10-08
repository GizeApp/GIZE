import './ui/errores.js';

import './ui/keyboard.js';
// La barra de abajo se achica al bajar y vuelve al subir (la «nube», app/ui/nube.js).
import './ui/nube.js';

import { CATALOGO, cargarCatalogo, copiarDias } from './core/rutinas-ejemplo.js';

import { disablePush, enablePush, pushLogout } from './core/push.js';
import { checkSetPR, forgetPR, playPR, suspiciousKg, PR_HOLD_MS } from './ui/festejo.js';
import { auIcoEye, auIcoEyeOff, checkSvg } from './core/icons.js';

import { State, elegirDiaDeHoy, state } from './core/state.js';
import { toggleDia } from './core/diasemana.js';
import { EX_CATS } from './core/data.js';
import { defaultExCat } from './core/disciplinas.js';
// Salida de Cardio a pie / en bici: se importa temprano para que, si quedó una en curso (la app se
// recargó o el sistema la cerró), se retome al abrir y vuelva a mirar el GPS.
import { GpsState, onChange as onGpsChange, stopForLogout } from './ui/gps.js';
import { elapsedMs } from './core/cardiogps.js';
import { syncRouteViews } from './ui/mapa.js';

import { KEY, migrateNames, routineHash, save } from './core/storage.js';

import { afterLogin, applyCoachRoutine, coachRoutineDue, cloudBoot, cloudDeleteSession, cloudEditSession, cloudSaveCheckin, cloudSaveFoods, cloudSaveDaily, cloudSessionFeedback, ensureSb, flushOutbox, isOnline, loadCloud, newId, pendingCount, clearAccountLeftovers, clearAuthExpect, clearRecoveryPending, clearRecoveryRequest, dropRecoverySession, expectAuthLink, localUnsynced, markRecoveryRequest, otpErrorKind, PROFILE_KEY, RECOVERY_MSG, refreshOwnRoutine, setRecoveryPending, sbOk, setPendingCode, syncRoutineNow, setRememberSession, signInWithApple, signInWithGoogle } from './core/supabase.js';

import { assistedKg, isAssisted, fmt, hkey, mkEx, mkSet, mondayOf, muscleOf, intNum, norm, num, pickMuscle, parseSecs, tabRipple, today, uid } from './core/utils.js';

import { runningSetId, startTimer, stopTimer } from './ui/settimer.js';

import { showLogin } from './screens/auth.js';

import { ssGroupOf, ssNext } from './core/superserie.js';
import { CardioState, closeSalida, liveMapTick, openTimePicker, paintSalida, renderCardio, salidaAction, setRing, swFrac } from './screens/cardio.js';

import { CheckinState, checkinDraft, checkinHasAnswer, checkinWeek, renderFeedback, saveSession, todayWeightText, undoSaveSession } from './screens/checkin.js';

import { loadCoachClients, openClient } from './screens/coach/clientes.js';

import { dropRoutineDraft, renderCoach, routineDirty, tplDirty } from './screens/coach/index.js';

import { renderCoachSettings } from './screens/coach/settings.js';

// Registra los eventos del editor de preguntas del coach (efecto al importarlo).
import './screens/coach/preguntas.js';

import { coachPlanObj, cpApply, loadTpls, refreshBlockWeeks, renderApplyPicker, renderCoachPicker, renderCopyPicker, renderSchedPicker, rtDays, fitOptBody } from './screens/coach/rutinas.js';

import { CoachState } from './screens/coach/state.js';
import { mealAction, nutritionRow } from './screens/coach/planes.js';
import { deloadRoutineOf, deloadWeeks } from './core/bloque.js';

import { ComidaState, mealNow, renderSearchSheet, animateCalRing, calcTarget, macroKcal, macroSumText, cookPortion, defaultCookState, entryBase, lastResults, offResults, previewStr, rememberCookState, renderComida, renderResults, selectedFoodValues } from './screens/comida.js';

import { EntrenoState, REST_DEFAULT, day, expandedOverride, exGroupIds, liveCounting, renderEntreno, dayNameCls, renderExList, renderExSheet, renderVarSheet, effectiveRest, restKey, wkElapsedText, wkFresh, restLabel, routineLocked, startLive, stopLive } from './screens/entreno.js';

import { HabitosState, addHabit, checkDaily, forgetHabitAlarm, habitAlarmDay, openHabitAlarm, paintHabitAlarmSheet, renderHabitAlarmSheet, renderHabitos, saveHabitAlarm } from './screens/habitos.js';
import { alarmsSupported, askAlarmPermission, initHabitAlarms, syncHabitAlarms } from './ui/habitnotif.js';

import { ProgresoState, allSetsDone, exOccurrence, lastKgsUseful, lastPlan, lastSessionFor, renderProgreso } from './screens/progreso.js';

import { beep, initAudio } from './ui/audio.js';

import { showSilkBg } from './ui/background.js';

import { appAway, onAwayChange } from './ui/pausa.js';

import { parseRest, renderRestBar, resumeRest, startRest, stopRest } from './ui/restbar.js';

import { anchorFocus, initScrollReveal, setupExerciseFocus } from './ui/scrollfocus.js';

import { SheetState, closeSheet, collapseExerciseAnimated, renderSheet, sheetUnitFood, unitsLabel } from './ui/sheet.js';
import { clientQuestions, questionSnapshot } from './core/questions.js';
import { renderConfig } from './screens/config.js';

import { removeMyAvatar, uploadMyAvatar } from './core/avatar.js';
import { cropAvatar } from './ui/recorte.js';

import { productByCode, searchOFF } from './core/off.js';
import { PHOTO_UNREADABLE, checkProductRequests, productByCodeShared, reportShared, saveOffShared, searchShared, sendProductRequest, useShared } from './core/productos.js';

import { addDays, dayItems, loadDay, retryDay, setDayItems } from './screens/comida-historial.js';
import { EditState, cleanSessionEdit, openSessionEdit, removeSessionEditSet, renderSessionEdit, setSessionEditVal } from './ui/sessionedit.js';
import { closeScanner, openScanner, scannerManualCode } from './ui/scanner.js';
import { initBackButton } from './ui/atras.js';
import { initUpdateCheck } from './ui/actualizar.js';
import { openRoutinePicker } from './screens/onboarding.js';
import { initTabScroll, restoreTabScroll } from './ui/tabscroll.js';
import { closeStreak, markVisit, openStreak, paintStreak } from './ui/racha.js';
import { ChatUnread, chatOpenFor, openChat, refreshUnread } from './ui/chat.js';
import { signedAudioUrl, togglePlay } from './ui/grabar.js';
import { dropExMedia } from './core/videos.js';
import { clearVariant, setVariant, todayEx, todayExs, variantOf } from './core/variantes.js';
import { appIOS, joinMsgTienda } from './core/tienda.js';

// Series cuyo peso se completó solo copiando el de la serie de arriba (ver input "kg").
const autoKg = new Set();

// Nombre del día (rutina propia): el campo crece hacia abajo para que un nombre largo
// ("Hombro, espalda, pecho, bíceps, tríceps") se vea entero, y si es largo la letra achica
// (dayNameCls). Enter no hace otra línea.
function fitDayName(t){
  const c = dayNameCls(t.value); t.classList.toggle("dn-l", c === "dn-l"); t.classList.toggle("dn-xl", c === "dn-xl");
  t.style.height = "auto"; t.style.height = t.scrollHeight + "px";
}
document.addEventListener("keydown", e => { if(e.key === "Enter" && e.target.matches && e.target.matches("textarea.day-name")){ e.preventDefault(); e.target.blur(); } });

// Historial de entrenos: se abre y cierra desde acá (en el iPhone, Safari no despliega el
// <details> tocando el resumen cuando este tiene display:flex).
document.addEventListener("click", e => {
  const s = e.target.closest && e.target.closest("summary.sess-sum"); if(!s) return;
  const d = s.parentElement; if(!d || d.tagName !== "DETAILS") return;
  e.preventDefault(); d.open = !d.open;
});

export function renderApp(){
  queueMicrotask(scheduleTick); // después de dibujar: ¿hay un reloj a la vista que actualizar?
  queueMicrotask(syncSalida);   // y los recorridos de Cardio (mapa) a su lugar, o afuera
  // Una cuenta de coach ve solo su panel: si algo pedía la pantalla del cliente, quedaba
  // dibujada debajo del panel (que es transparente) y se veían las dos encimadas.
  if(State.cloudProfile && State.cloudProfile.role==="coach"){ const v=document.getElementById("view"); if(v) v.innerHTML=""; renderCoach(); return; }
  setTimeout(renderFeedback,0);
  checkDaily();
  // Semana de descarga: si empezó o terminó (app abierta de un día a otro, o sin señal), cambia
  // de rutina con lo guardado del bloque; la nube lo confirma cuando carga.
  if((!State.cloudProfile || routineLocked()) && coachRoutineDue() && applyCoachRoutine()) save();
  markVisit(); paintStreak(); paintChatBtn(); // racha: hoy entró · chat con el coach
  document.getElementById("nav-entreno").classList.toggle("active", State.view==="entreno");
  document.getElementById("nav-habitos").classList.toggle("active", State.view==="habitos");
  document.getElementById("nav-cardio").classList.toggle("active", State.view==="cardio");
  paintNavSalida();
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
  if(State.view==="entreno") restoreTabScroll();
  if (State.view==="comida") animateCalRing();
  initScrollReveal();
  setupExerciseFocus();
  renderRestBar();
  const _sh=document.getElementById("sheetHost"); if(_sh) _sh.innerHTML = EntrenoState.exPicker ? renderExSheet() : (State.view==="entreno" && EntrenoState.varSheet) ? renderVarSheet() : ((State.view==="comida" && (ComidaState.selectedFood||ComidaState.editEntry)) ? renderSheet() : (State.view==="comida" && ComidaState.searchOpen) ? renderSearchSheet() : (State.view==="progreso" && EditState.se) ? renderSessionEdit() : (State.view==="habitos" && HabitosState.edit) ? renderHabitAlarmSheet(alarmsSupported()) : "");
  syncHabitAlarms(); // avisos de los hábitos (solo reprograma si cambiaron)
  if (State.view==="habitos" && HabitosState.pendingFocusHabit) { const i=document.getElementById("habitInput"); if(i) i.focus(); HabitosState.pendingFocusHabit=false; }
  if (State.view==="entreno") v.querySelectorAll("textarea.day-name").forEach(fitDayName);
  if (State.view==="entreno" && HabitosState.pendingFocusDay) { const i=v.querySelector(".day-name"); if(i){ i.focus(); i.select(); } HabitosState.pendingFocusDay=false; }
}

// Gramos anotados: enteros, salvo lo que pesa menos de 10 g (un disparo de aceite, 0,3 g).
// Formulario de "Registro de hoy": arranca con lo ya guardado hoy, menos los pasos (esos
// salen del contador, que puede haber sumado desde entonces).
function dailyFormInit(){ if(!CheckinState.dailyForm){ const f=Object.assign({}, state.daily[today()]||{}); delete f.steps; const w=todayWeightText(); if(w) f.kg=w; CheckinState.dailyForm=f; } return CheckinState.dailyForm; }
// Formulario del check-in: arranca con lo guardado de la semana que está abierta.
function checkinFormInit(){ if(!CheckinState.checkinForm) CheckinState.checkinForm=checkinDraft(checkinWeek()); return CheckinState.checkinForm; }
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
  if(!wkFresh(w) || w.day!==d.id || (!w.manual && !others)){ state.wkStart={date:today(), day:d.id, ts:Date.now()}; save(); }
  // Al tildar una serie arranca solo el descanso de ese ejercicio (pedido; se saltea con la X).
  // No arranca si con esta serie se terminó todo el día, ni en medio de una vuelta de
  // superserie: ahí la pantalla pasa a la serie que sigue y se descansa al cerrar la vuelta.
  const idx=d.exercises.findIndex(x=>x.id===ex.id); // ex puede ser el de hoy (variante), no el mismo objeto
  const dayDone=todayExs(d).every(x=>allSetsDone(x));
  const nx=ssGroupOf(d.exercises, idx) ? ssNext(d.exercises, idx, ex.sets.indexOf(s)) : { rest: true, target: null };
  if(nx.rest && !dayDone) startRest(effectiveRest(ex).sec);
  if(nx.target) setTimeout(()=>goToSet(nx.target), 420);
}
// Variante solo por hoy (core/variantes.js). Las series del coach quedan (objetivo, RIR, notas,
// audio); el peso de las series sin tildar se cambia por el de la vez pasada de la variante (o
// queda vacío) y al volver al original vuelve el que había.
function applyVariant(raw, name){
  const prev=variantOf(raw);
  const kg0=prev && prev.kg0 ? prev.kg0 : {};
  if(!prev) raw.sets.forEach(s=>{ if(!s.done) kg0[s.id]=s.kg==null?"":String(s.kg); });
  setVariant(raw, name, {kg0});
  const list=todayExs(day()), v=list.find(x=>x.id===raw.id) || todayEx(raw);
  const last=lastSessionFor(name, exOccurrence(list, v));
  const plan=last ? lastPlan(v, last.sets) : [];
  raw.sets.forEach((s,i)=>{ if(s.done) return; const k=plan[i] && plan[i].kg; s.kg=k ? String(k) : ""; autoKg.delete(s.id); forgetPR(s.id); });
}
function revertVariant(raw){
  const o=clearVariant(raw.id); if(!o) return;
  raw.sets.forEach(s=>{ if(s.done) return; if(o.kg0 && Object.prototype.hasOwnProperty.call(o.kg0, s.id)) s.kg=o.kg0[s.id]; autoKg.delete(s.id); forgetPR(s.id); });
}
// Cambiar un ejercicio por otro: las series del anterior (kg, reps, tildes) no son de este. Si
// quedaban, el nuevo aparecía hecho y al guardar daba récords falsos.
function swapEx(ex, name, mm){
  if(ex.name!==name){ dropExMedia(ex); ex.sets.forEach(s=>{ s.kg=""; s.reps=""; s.done=false; if("secs" in s) s.secs=""; autoKg.delete(s.id); forgetPR(s.id); }); }
  clearVariant(ex.id); ex.name=name; ex.mus=mm;
}
// Un ejercicio recién agregado aparece abierto (y cierra el que estaba abierto), para cargarle las series.
function openEx(e){ expandedOverride.clear(); expandedOverride.add(e.id); return e; }
// Lleva la pantalla a la serie que sigue y la marca un momento.
function goToSet(t){
  const inp=document.querySelector('[data-ex="'+CSS.escape(t.ex)+'"][data-set="'+CSS.escape(t.set)+'"]');
  const row=inp && inp.closest(".set"); if(!row) return;
  anchorFocus(t.ex);
  row.scrollIntoView({block:"center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"});
  row.classList.remove("ss-next"); void row.offsetWidth; row.classList.add("ss-next");
}

// Reloj interno: actualiza el reloj del entreno («Entrenando hace…») y el cronómetro y el
// temporizador de Cardio. Todo se muestra en segundos y sale de la hora guardada, así que no
// hace falta un intervalo fijo cada 100 ms: se programa un solo setTimeout justo para cuando
// cambia el próximo segundo (o termina el temporizador, para que suene en hora). Si no hay nada
// corriendo a la vista no se programa nada (ahorro de batería); scheduleTick() lo vuelve a
// armar después de cada renderApp y al volver de segundo plano.
let tickTimer = null;
const TICK_SLACK = 15; // ms de margen para caer ya del otro lado del segundo
export function tickActive(){ return tickTimer != null; }
export function scheduleTick(){
  if (tickTimer != null){ clearTimeout(tickTimer); tickTimer = null; }
  const now = Date.now(), waits = [];
  const toNextSec = ms => 1000 - (((ms % 1000) + 1000) % 1000); // lo que falta para el próximo segundo entero
  // El temporizador de Cardio corre aunque la app esté afuera: tiene que terminar (y sonar) a tiempo.
  if (CardioState.tmRunning){ const rem = CardioState.tmEndTs - now; waits.push(rem <= 0 ? 0 : (rem % 1000) || 1000); }
  if (!appAway()){
    if (CardioState.swRunning && State.view==="cardio" && CardioState.cardioMode==="stopwatch") waits.push(toNextSec(CardioState.swAccum + (now - CardioState.swStartTs)));
    // Salida a pie / en bici en curso: el tiempo, la distancia y el ritmo (solo con Cardio a la vista).
    if (GpsState.run && GpsState.run.status==="running" && State.view==="cardio") waits.push(toNextSec(elapsedMs(GpsState.run, now)));
    if (State.view==="entreno" && state.wkStart && state.wkStart.ts && document.getElementById("wkTime")) waits.push(toNextSec(now - state.wkStart.ts));
  }
  if (!waits.length) return;
  tickTimer = setTimeout(tick, Math.max(0, Math.min(...waits)) + TICK_SLACK);
}

export function tick(){
  tickTimer = null;
  // Con la app en segundo plano no hay nada que pintar: solo importa que el temporizador de
  // cardio termine (y suene) a tiempo. El reloj del entreno y el cronómetro salen de la hora
  // guardada, así que se ponen al día solos al volver.
  if (!(document.hidden && !CardioState.tmRunning)){
    const now = Date.now();
    if (CardioState.tmRunning){
      const rem = CardioState.tmEndTs - now;
      if (rem <= 0){ CardioState.tmRunning=false; CardioState.tmRemainingMs=0; CardioState.tmFinished=true; beep(); if(State.view==="cardio") renderApp(); }
      else { CardioState.tmRemainingMs = rem; if(State.view==="cardio" && CardioState.cardioMode==="timer") setRing(rem / CardioState.tmTarget, fmt(rem,true)); }
    }
    if (State.view==="entreno"){ const w=document.getElementById("wkTime"); if(w){ const t=wkElapsedText(); if(w.textContent!==t) w.textContent=t; } }
    if (CardioState.swRunning && State.view==="cardio" && CardioState.cardioMode==="stopwatch"){ const ms=CardioState.swAccum+(now-CardioState.swStartTs); setRing(swFrac(ms), fmt(ms)); }
    if (GpsState.run && State.view==="cardio") paintSalida(now);
  }
  scheduleTick();
}
// Al volver de segundo plano se pone al día en el acto; al irse, deja de programarse.
onAwayChange(away => { if (away) scheduleTick(); else tick(); });

// ---- Salida de Cardio a pie / en bici (ui/gps.js, screens/cardio.js) ----
// Con una salida en curso, la pestaña Cardio lleva un punto (quieto) en las otras pantallas.
function paintNavSalida(){
  const n = document.getElementById("nav-cardio"); if (!n) return;
  n.classList.toggle("en-curso", !!(GpsState.run && GpsState.run.status !== "ended"));
}
function syncSalida(){ syncRouteViews(); liveMapTick(false); }
// La salida cambió (empezó, pausa, terminó, GPS, errores): Cardio se redibuja (no con las ruedas
// del tiempo abiertas) y el reloj se vuelve a programar.
onGpsChange(() => {
  paintNavSalida();
  if (State.view === "cardio" && !document.getElementById("timePick") && !(State.cloudProfile && State.cloudProfile.role === "coach")) renderApp();
  else scheduleTick();
});

document.body.addEventListener("input", async e => {
  const t = e.target, a = t.dataset.action; if(!a) return;
  if (a === "se-val") { setSessionEditVal(t); return; }
  // Registro de hoy: se guarda mientras se escribe (no solo al salir del campo), así un
  // redibujo no borra lo que se está escribiendo.
  if (a === "daily-kg" || a === "daily-text") { dailyFormInit(); CheckinState.dailyForm[a==="daily-kg"?"kg":t.dataset.k] = t.value; return; }
  if (a === "food-search") { ComidaState.foodQuery = t.value; scheduleOffSearch(t.value); const r=document.getElementById("foodResults"); if(r) r.innerHTML = renderResults(ComidaState.foodQuery); return; }
  if (a === "ex-search") { EntrenoState.exQuery = t.value; const l=document.getElementById("exList"); if(l) l.innerHTML = renderExList(); return; }
  if (a === "portion-grams") { const base = ComidaState.selectedFood ? selectedFoodValues() : (ComidaState.editEntry ? entryBase(ComidaState.editEntry) : null); if(base){ const pv=document.getElementById("portionPreview"); if(pv) pv.textContent = previewStr(base, t.value); const pu=document.getElementById("portionUnits"); const uf=sheetUnitFood(); if(pu && uf) pu.textContent = unitsLabel(t.value, cookPortion(uf.food, uf.cook), base.unit, uf.food); } ComidaState.sheetGrams = t.value; return; }
  if (a === "cf-field") { ComidaState.foodForm[t.dataset.field] = t.value; return; }
  if (a === "rq-field") { if(ComidaState.reqForm) ComidaState.reqForm[t.dataset.field] = t.value; return; }
  if (a === "macro-field") { const g=k=>parseFloat(String((document.getElementById("macro_"+k)||{}).value||"").replace(",", "."))||0; const el2=document.getElementById("macroSum"); if(el2) el2.innerHTML=macroSumText({p:g("p"),c:g("c"),f:g("f")}); return; }
  if (a === "cal-field") { ComidaState.calForm[t.dataset.field] = t.value; return; }
  if (a === "wkg-field") { ProgresoState.weightForm.kg = t.value; return; }
  const d = day();
  if (a === "dayname"){ d.name = t.value.replace(/\s*\n\s*/g, " "); fitDayName(t); }
  else if (a === "subtitle") d.subtitle = t.value;
  else if (a === "exname") { const ex=d.exercises.find(x=>x.id===t.dataset.ex); if(ex) ex.name=t.value; }
  else if (a === "secs") {
    const ex=d.exercises.find(x=>x.id===t.dataset.ex); const s=ex&&ex.sets.find(x=>x.id===t.dataset.set);
    if(s) s.secs=t.value;
  }
  else if (a === "kg" || a === "reps") {
    const exs=todayExs(d), ex=exs.find(x=>x.id===t.dataset.ex); const s=ex&&ex.sets.find(x=>x.id===t.dataset.set);
    if(s){
      // Asistidos: se escribe la ayuda (30) y se guarda en negativo (-30), ver utils.
      const val = (a === "kg" && isAssisted(ex.name)) ? assistedKg(t.value) : t.value;
      s[a]=val;
      if(a === "kg"){
        forgetPR(s.id); // si era la serie del récord y corrige el peso, puede volver a festejar
        // El peso casi siempre se repite: se copia a las series de abajo que están vacías o
        // que se completaron solas antes (si el cliente cambia una a mano, esa ya no se toca).
        autoKg.delete(s.id);
        const i=ex.sets.indexOf(s);
        ex.sets.slice(i+1).forEach(o=>{
          if(o.done || (String(o.kg||"")!=="" && !autoKg.has(o.id))) return;
          o.kg=val; if(val) autoKg.add(o.id); else autoKg.delete(o.id);
          const inp=document.querySelector('input.kg[data-set="'+o.id+'"]'); if(inp && inp!==t) inp.value=t.value;
        });
        // «Usar estos pesos»: aparece si ahora cambiaría algo y se oculta si ya están esos pesos.
        const ub=t.closest("[data-ex-id]"), use=ub && ub.querySelector(".ls-use");
        if(use){ const prev=lastSessionFor(ex.name, exOccurrence(exs, ex)); use.hidden=!(prev && lastKgsUseful(ex, lastPlan(ex, prev.sets))); }
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
  // Ejercicio cerrado (fila con role="button"): Enter o espacio lo abren, como un botón.
  if ((e.key === "Enter" || e.key === " ") && e.target.classList && e.target.classList.contains("ex-collapsed")) { e.preventDefault(); e.target.click(); }
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
  if (a === "daily-kg" || a === "daily-text") { dailyFormInit(); CheckinState.dailyForm[a==="daily-kg"?"kg":t.dataset.k] = t.value; return; }
  if (a === "ci-set") { checkinFormInit()[t.dataset.k] = t.value; return; }
  if (a === "load-ex") { EntrenoState.loadEx = t.value; renderApp(); return; }
  if (a === "sess-pick") { ProgresoState.sessSel = t.value; renderApp(); return; }
  // Foto de perfil (Ajustes del cliente y Configuración del coach).
  if (a === "avatar-pick") {
    const file=t.files&&t.files[0]; t.value=""; if(!file) return;
    if(!/^image\//.test(file.type || "image/")){ alert("Elegí una imagen."); return; }
    // Primero se acomoda (mover y agrandar dentro del círculo); cancelar no cambia nada.
    let cropped;
    try{ cropped=await cropAvatar(file); }catch(e){ alert("No se pudo leer esa imagen. Probá con otra."); return; }
    if(!cropped) return;
    document.body.classList.add("avatar-busy");
    const err=await uploadMyAvatar(file, cropped);
    document.body.classList.remove("avatar-busy");
    if(err){ alert(err); return; }
    if(CoachState.coachSettingsOpen) renderCoachSettings(); else renderApp();
    if(State.cloudProfile && State.cloudProfile.role==="coach") renderCoach();
    return;
  }
  if (a === "rq-photo") {
    const file=t.files&&t.files[0], r=ComidaState.reqForm, k=t.dataset.k;
    t.value="";
    if(!file || !r || (k!=="label" && k!=="front")) return;
    // Antes de guardarla se prueba abrirla: una foto HEIC en Chrome/Android (o un archivo roto)
    // no se puede leer, y así se avisa ahora en vez de dejar la vista previa rota.
    const url=URL.createObjectURL(file);
    const okImg=await new Promise(res=>{ const i=new Image(); i.onload=()=>res(i.naturalWidth>0); i.onerror=()=>res(false); i.src=url; });
    if(!okImg){ URL.revokeObjectURL(url); alert(PHOTO_UNREADABLE); return; }
    if(ComidaState.reqForm!==r){ URL.revokeObjectURL(url); return; }
    if(r[k+"Url"]) URL.revokeObjectURL(r[k+"Url"]); r[k]=file; r[k+"Url"]=url; renderApp();
    return;
  }
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
  if (navBtn) { State.view = navBtn.dataset.view; ComidaState.selectedFood=null; ComidaState.editEntry=null; ComidaState.calEditing=false; ComidaState.planOpen=false; ProgresoState.section=null; ComidaState.creatingFood=false; closeRequest(); HabitosState.edit=null; EntrenoState.exPicker=null; EntrenoState.varSheet=null; renderApp(); return; }
  const el = e.target.closest("[data-action]"); if(!el) return;
  // Si pasó la medianoche con la app abierta, primero se pasa al día nuevo: si no, lo que se
  // anota ahora (comida, agua, pasos) caía en el día anterior y el redibujo lo borraba.
  checkDaily();
  const a = el.dataset.action;
  if (routineLocked() && ["addday","delday","removeex","addset","removeset","ex-add-open","ex-swap","ex-insert","ex-choose","ex-custom","load-default-routine","open-routines"].indexOf(a)>=0) return;

  // Racha
  if (a === "streak-open") { openStreak(); return; }
  if (a === "chat-open") { openMyChat(); return; }
  if (a === "ex-audio") { const pth=el.dataset.path; togglePlay("ex:"+pth, ()=>signedAudioUrl(pth)); return; }
  if (a === "streak-close") { closeStreak(); return; }

  // Hábitos
  if (a === "habit-add") { addHabit(); return; }
  if (a === "chabit-toggle") { const k=hkey(el.dataset.name); state.habitsDone[k]=!state.habitsDone[k]; save(); renderApp(); return; }
  if (a === "habit-toggle") { const h=state.habits.find(x=>x.id===el.dataset.id); if(h) h.done=!h.done; save(); renderApp(); return; }
  if (a === "habit-remove") { forgetHabitAlarm(el.dataset.id); state.habits = state.habits.filter(x=>x.id!==el.dataset.id); save(); renderApp(); return; }
  // Días y aviso de un hábito (campanita). Abrir anima la hoja; los cambios adentro la actualizan
  // en el lugar (paintHabitAlarmSheet) para que no se vuelva a abrir con cada toque.
  if (a === "habit-alarm") { SheetState.sheetGen++; openHabitAlarm(el.dataset.kind, el.dataset.key); renderApp(); return; }
  if (a === "hba-all") { if(HabitosState.edit) HabitosState.edit.days=null; paintHabitAlarm(); return; }
  if (a === "hba-day") { habitAlarmDay(parseInt(el.dataset.d,10)); paintHabitAlarm(); return; }
  // Hora del aviso: la misma rueda del temporizador, en modo hora del día.
  if (a === "hba-pick") {
    const e=HabitosState.edit; if(!e) return;
    const [h,m]=(e.time||"09:00").split(":").map(n=>parseInt(n,10)||0);
    openTimePicker((h*60+m)*60000, "Hora del aviso", ms=>{ const t=Math.round(ms/60000)%1440; if(HabitosState.edit===e){ e.time=String(Math.floor(t/60)).padStart(2,"0")+":"+String(t%60).padStart(2,"0"); paintHabitAlarm(); } }, {clock:true});
    return;
  }
  if (a === "hba-notime") { if(HabitosState.edit) HabitosState.edit.time=""; paintHabitAlarm(); return; }
  if (a === "hba-cancel") { closeSheet(()=>{ HabitosState.edit=null; renderApp(); }); return; }
  if (a === "hba-save") {
    const withTime=saveHabitAlarm(); closeSheet(()=>renderApp());
    if(withTime && alarmsSupported()) askAlarmPermission().then(ok=>{ if(ok) syncHabitAlarms(); else alert("Para que suene el aviso, permití las notificaciones de GIZE en los ajustes del celular."); });
    return;
  }

  // Cardio
  if (a.startsWith("sal-") && salidaAction(a, el)) return;
  if (a === "cardio-mode") { CardioState.cardioMode = el.dataset.mode; renderApp(); return; }
  // «Pasos» → «Competí con tus amigos»: Progreso → «Competencia de pasos».
  if (a === "cardio-pasos") { State.view = "progreso"; ProgresoState.section = "pasos"; ProgresoState.wAll = false; renderApp(); window.scrollTo(0, 0); return; }
  if (a === "sw-toggle") { if(CardioState.swRunning){ CardioState.swAccum+=Date.now()-CardioState.swStartTs; CardioState.swRunning=false; } else { CardioState.swStartTs=Date.now(); CardioState.swRunning=true; } renderApp(); return; }
  if (a === "sw-lap") { CardioState.swLaps.push(CardioState.swAccum+(Date.now()-CardioState.swStartTs)); renderApp(); return; }
  if (a === "sw-reset") { CardioState.swRunning=false; CardioState.swAccum=0; CardioState.swStartTs=0; CardioState.swLaps=[]; renderApp(); return; }
  if (a === "tm-pick") { openTimePicker(CardioState.tmRemainingMs, "Elegí el tiempo", t => { if(t>0){ CardioState.tmTarget=t; CardioState.tmRemainingMs=t; CardioState.tmFinished=false; } renderApp(); }); return; }
  // «Listo» sin cambiar el tiempo deja todo como estaba (con las vueltas).
  if (a === "sw-pick") { openTimePicker(CardioState.swAccum, "Arrancar desde", t => { if(t===Math.floor(CardioState.swAccum/1000)*1000){ renderApp(); return; } CardioState.swAccum=t; CardioState.swLaps=[]; renderApp(); }); return; }
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
  if (a === "cal-open") { ComidaState.calForm = state.calProfile ? Object.assign({sex:state.sex==="f"?"f":"m",age:"",height:"",weight:"",activity:"mod",goal:"mantener"}, state.calProfile) : {sex:state.sex==="f"?"f":"m",age:"",height:"",weight:"",activity:"mod",goal:"mantener"}; ComidaState.calEditing=true; renderApp(); return; }
  if (a === "cal-cancel") { ComidaState.calEditing=false; renderApp(); return; }
  if (a === "cal-sex") { ComidaState.calForm.sex = el.dataset.val; renderApp(); return; }
  if (a === "cal-activity") { ComidaState.calForm.activity = el.dataset.val; renderApp(); return; }
  if (a === "cal-goal") { ComidaState.calForm.goal = el.dataset.val; renderApp(); return; }
  if (a === "cal-calc") {
    ["age","height","weight"].forEach(k=>{ if(ComidaState.calForm[k]!=null) ComidaState.calForm[k]=String(ComidaState.calForm[k]).replace(",","."); });
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
  if (a === "food-create-open") { ComidaState.searchOpen=false; ComidaState.foodForm={name:"",kcal:"",p:"",c:"",f:"",portion:"",unit:"g"}; ComidaState.creatingFood=true; renderApp(); return; }
  if (a === "food-create-cancel") { ComidaState.creatingFood=false; renderApp(); return; }
  if (a === "cf-unit") { ComidaState.foodForm.unit = el.dataset.val; renderApp(); return; }
  if (a === "food-create-save") {
    const ff=ComidaState.foodForm, num=v=>parseFloat(String(v==null?"":v).replace(",", "."))||0;
    if(!ff.name.trim() || ff.kcal==="" || !(num(ff.kcal)>=0)){ alert("Poné al menos nombre y calorías."); return; }
    const por=num(ff.portion);
    const nf={ name:ff.name.trim(), kcal:Math.round(num(ff.kcal)), p:num(ff.p), c:num(ff.c), f:num(ff.f), portion:por>=1&&por<=2000?Math.round(por):100, unit:ff.unit||"g" };
    if(nf.kcal>950 || nf.p>100 || nf.c>100 || nf.f>100 || nf.p+nf.c+nf.f>105){ alert("Revisá los valores: tienen que ser cada 100 "+(nf.unit==="ml"?"ml":"g")+" (como en la tabla del paquete)."); return; }
    // Desde un pedido con código de barras: al volver a escanearlo aparece este (ver onScannedCode).
    if(ff.code) nf.code=ff.code;
    state.foods.push(nf);
    ComidaState.creatingFood=false; save();
    if(ff.code){ ComidaState.selectedFood=nf; ComidaState.cookState=null; ComidaState.sheetGrams=null; SheetState.sheetGen++; }
    else ComidaState.foodQuery=nf.name;
    renderApp(); return;
  }
  if (a === "rq-open") { ComidaState.searchOpen=false; openRequest({ name: ComidaState.foodQuery || "" }); return; }
  if (a === "rq-cancel") { closeRequest(); renderApp(); return; }
  if (a === "rq-send") {
    const r=ComidaState.reqForm; if(!r || r.sending) return;
    const name=(r.name||"").trim(), brand=(r.brand||"").trim();
    if(name.length<2){ alert("Poné el nombre del producto."); return; }
    if(!brand){ alert("Poné la marca del producto."); return; }
    if(!r.label){ alert("Falta la foto de la tabla nutricional (suele estar atrás del paquete)."); return; }
    if(!State.cloudUser){ alert("Tenés que iniciar sesión para mandar un pedido."); return; }
    r.sending=true; renderApp();
    sendProductRequest({ name, brand, code: r.code, label: r.label, front: r.front }).then(()=>{
      if(ComidaState.reqForm===r){ closeRequest(); renderApp(); }
      alert("¡Gracias! Tu producto fue enviado a administración. Pronto va a estar en GIZE para todos: te avisamos cuando lo agreguemos.");
    }).catch(e=>{
      r.sending=false; if(ComidaState.reqForm===r) renderApp();
      const m=e && e.message ? String(e.message) : "";
      alert(/límite/.test(m) || m===PHOTO_UNREADABLE ? m : "No se pudo enviar el pedido. Revisá tu conexión y probá de nuevo.");
    });
    return;
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
    const g = num((document.getElementById("portionGrams")||{}).value); if(!(g>0)){ return; }
    const f0 = ComidaState.selectedFood; if(!f0){ return; } const fc = g/100;
    // Con crudo/cocido se guardan los valores del estado elegido y queda en el nombre.
    const f = selectedFoodValues(); if(f0.cook) rememberCookState(f0, ComidaState.cookState);
    rememberOffProduct(f0); rememberRecent(f0, roundG(g), f0.cook ? ComidaState.cookState : null);
    // Base compartida: sube en la búsqueda si ya estaba; si vino de Open Food Facts, GIZE lo
    // guarda desde el servidor con los datos de OFF (la app manda solo el código).
    if(f0.src==="GIZE" && f0.gid) useShared(f0.gid); else if(f0.src==="OFF" && f0.code) saveOffShared(f0.code);
    curDiary().push({ id:newId(), meal:ComidaState.sheetMeal||ComidaState.meal||mealNow(), name:f0.name+(f0.cook?" ("+ComidaState.cookState+")":""), grams:roundG(g), kcal:Math.round(f.kcal*fc), p:+(f.p*fc).toFixed(1), c:+(f.c*fc).toFixed(1), f:+(f.f*fc).toFixed(1), unit:f.unit||"g", base:{kcal:f.kcal,p:f.p,c:f.c,f:f.f,unit:f.unit||"g"} });
    ComidaState.meal=null; ComidaState.searchOpen=false; ComidaState.foodQuery=""; ComidaState.off=null;
    commitDiary(); closeSheet(()=>{ ComidaState.selectedFood=null; ComidaState.sheetGrams=null; ComidaState.sheetMeal=null; renderApp(); }); return;
  }
  if (a === "portion-save") {
    const g = num((document.getElementById("portionGrams")||{}).value); if(!(g>0)){ return; }
    const e = ComidaState.editEntry; if(!e){ return; } const base=entryBase(e); const fc=g/100;
    if(ComidaState.sheetMeal) e.meal=ComidaState.sheetMeal;
    e.grams=roundG(g); e.kcal=Math.round(base.kcal*fc); e.p=+(base.p*fc).toFixed(1); e.c=+(base.c*fc).toFixed(1); e.f=+(base.f*fc).toFixed(1); e.unit=base.unit||"g"; e.base=base;
    commitDiary(); closeSheet(()=>{ ComidaState.editEntry=null; ComidaState.sheetMeal=null; renderApp(); }); return;
  }
  if (a === "diary-edit") { SheetState.sheetGen++; ComidaState.editEntry = curDiary().find(x=>x.id===el.dataset.id)||null; ComidaState.selectedFood=null; renderApp(); return; }
  if (a === "diary-remove") { const d=viewDay(), rest=curDiary().filter(x=>x.id!==el.dataset.id); if(d) setDayItems(d, rest); else state.diary=rest; commitDiary(); renderApp(); return; }

  // Pasos
  if (a === "steps-add") { state.steps = Math.max(0,(state.steps||0)+parseInt(el.dataset.n)); save(); renderApp(); return; }
  if (a === "steps-set") { const n=intNum((document.getElementById("stepInput")||{}).value); if(n>=0){ state.steps=n; save(); renderApp(); } else alert("Pon\u00e9 un n\u00famero v\u00e1lido."); return; }
  if (a === "steps-goal") { const g=prompt("Meta diaria de pasos:", state.stepsGoal||10000); if(g!==null){ const n=intNum(g); if(n>0){ state.stepsGoal=n; save(); renderApp(); } } return; }
  if (a === "steps-live") { if(liveCounting) stopLive(); else startLive(); return; }

  // Ejercicios (picker)
  if (a === "ex-add-open") { SheetState.sheetGen++; EntrenoState.exPicker={mode:"add"}; EntrenoState.exCat=defaultExCat(EX_CATS); EntrenoState.exQuery=""; renderApp(); return; }
  if (a === "ex-swap") { SheetState.sheetGen++; EntrenoState.exPicker={mode:"swap", exId:el.dataset.ex}; EntrenoState.exCat=defaultExCat(EX_CATS); EntrenoState.exQuery=""; renderApp(); return; }
  if (a === "ss-split") { if(routineLocked()) return; const exs=day().exercises, g=ssGroupOf(exs, +el.dataset.i); if(g){ for(let k=g.start;k<=g.end;k++) delete exs[k].ss; save(); renderApp(); } return; }
  if (a === "ss-toggle") { if(routineLocked()) return; const exs=day().exercises, i=+el.dataset.i; const e=exs[i]; if(e && i<exs.length-1){ if(e.ss) delete e.ss; else e.ss=true; save(); renderApp(); } return; }
  if (a === "ex-insert") { SheetState.sheetGen++; EntrenoState.exPicker={mode:"insert", idx:(+el.dataset.i||0)}; EntrenoState.exCat=defaultExCat(EX_CATS); EntrenoState.exQuery=""; renderApp(); return; }
  // Sin disciplina elegida: va a Ajustes, a la parte de «Tu disciplina».
  if (a === "ex-disc-elegir") { closeSheet(()=>{ EntrenoState.exPicker=null; State.view="config"; renderApp(); requestAnimationFrame(()=>{ const c=document.getElementById("cfgDisc"); if(c) c.scrollIntoView({block:"center"}); }); }); return; }
  if (a === "ex-cat") {
    EntrenoState.exCat=el.dataset.cat; EntrenoState.exQuery="";
    document.querySelectorAll("#sheetHost .ex-chip").forEach(c=>c.classList.toggle("on", c.dataset.cat===EntrenoState.exCat));
    const sEl=document.getElementById("exSearch"); if(sEl) sEl.value="";
    const l=document.getElementById("exList"); if(l) l.innerHTML = renderExList();
    return;
  }
  if (a === "ex-cancel") { closeSheet(()=>{ EntrenoState.exPicker=null; renderApp(); }); return; }
  // «Ver variantes» (core/variantes.js): cambiar el ejercicio solo por hoy. No toca la rutina
  // (vale también con la rutina del coach), por eso no está en la lista de bloqueadas de arriba.
  if (a === "ex-variants") { SheetState.sheetGen++; EntrenoState.varSheet={exId:el.dataset.ex}; renderApp(); return; }
  if (a === "var-cancel") { closeSheet(()=>{ EntrenoState.varSheet=null; renderApp(); }); return; }
  if (a === "var-pick" || a === "var-back") {
    const raw=day().exercises.find(x=>x.id===el.dataset.ex); if(!raw) return;
    if(a === "var-back" || el.dataset.name === raw.name) revertVariant(raw); else applyVariant(raw, el.dataset.name);
    save();
    if(a === "var-pick") closeSheet(()=>{ EntrenoState.varSheet=null; renderApp(); }); else renderApp();
    return;
  }
  if (a === "ex-choose") { const name=el.dataset.name; const d=day(); const mm=pickMuscle(name, el.dataset.cat||EntrenoState.exCat); if(EntrenoState.exPicker && EntrenoState.exPicker.mode==="swap"){ const ex=d.exercises.find(x=>x.id===EntrenoState.exPicker.exId); if(ex) swapEx(ex, name, mm); } else if(EntrenoState.exPicker && EntrenoState.exPicker.mode==="insert"){ d.exercises.splice(EntrenoState.exPicker.idx,0,openEx(mkEx(name,2,mm))); } else { d.exercises.push(openEx(mkEx(name,2,mm))); } save(); closeSheet(()=>{ EntrenoState.exPicker=null; renderApp(); }); return; }
  if (a === "ex-custom") { const nm=prompt(EntrenoState.exPicker&&EntrenoState.exPicker.mode==="swap"?"Nuevo nombre del ejercicio:":"Nombre del ejercicio:",""); if(nm && nm.trim()){ const d=day(); const mm=EntrenoState.exCat; if(EntrenoState.exPicker&&EntrenoState.exPicker.mode==="swap"){ const ex=d.exercises.find(x=>x.id===EntrenoState.exPicker.exId); if(ex) swapEx(ex, nm.trim(), mm); } else if(EntrenoState.exPicker&&EntrenoState.exPicker.mode==="insert"){ d.exercises.splice(EntrenoState.exPicker.idx,0,openEx(mkEx(nm.trim(),2,mm))); } else { d.exercises.push(openEx(mkEx(nm.trim(),2,mm))); } save(); closeSheet(()=>{ EntrenoState.exPicker=null; renderApp(); }); } return; }

  // Peso corporal
  if (a === "daily-save") {
    const d = CheckinState.dailyForm || {};
    const kg = parseFloat(String(d.kg||"").replace(",","."));
    const rec = Object.assign({}, state.daily[today()]||{}, d);
    rec._q = questionSnapshot(clientQuestions("daily"), rec);
    state.daily[today()] = rec;
    // Los pasos no se anotan acá (pedido: nada de pasos a mano): va el contador del día, el que
    // llega de Salud / Health Connect (core/salud.js), y no el de un registro anterior.
    rec.steps = state.steps>0 ? String(state.steps) : "";
    if(kg>0){ const exw=state.weights.find(w=>w.date===today()); if(exw) exw.kg=kg; else state.weights.push({id:uid(), date:today(), kg:kg}); }
    CheckinState.dailyForm=null; save();
    const synced = await cloudSaveDaily(today(), rec);
    // "failed": la base lo rechazó y no se reintenta solo (antes decía «guardado»).
    alert(synced==="failed" ? "No se pudo enviar tu registro a tu coach: el servidor no lo aceptó. Revisá tus respuestas y volvé a tocar «Guardar registro de hoy»."
      : synced ? "Registro guardado \u2713" : "Se guard\u00f3 en este dispositivo pero todav\u00eda no lleg\u00f3 a tu coach (sin conexi\u00f3n). Queda pendiente y se env\u00eda solo cuando vuelva internet.");
    renderApp(); return;
  }
  if (a === "fb-set") { CheckinState.fbForm=CheckinState.fbForm||{}; CheckinState.fbForm[el.dataset.k]=el.dataset.v; renderFeedback(); return; }
  if (a === "fb-undo") { undoSaveSession(); renderApp(); return; }
  if (a === "fb-skip") { CheckinState.fbSession=null; CheckinState.fbForm=null; CheckinState.newPRs=[]; renderApp(); return; }
  if (a === "fb-save") {
    const se=state.sessions.find(x=>x.id===CheckinState.fbSession); const f=CheckinState.fbForm||{};
    if(se){ if(f.rpe) se.rpe=+f.rpe; if(f.pump) se.pump=+f.pump; if(f.joint) se.joint=(f.joint==="S\u00ed"); save(); try{ cloudSessionFeedback(se); }catch(e){} }
    CheckinState.fbSession=null; CheckinState.fbForm=null; CheckinState.newPRs=[]; renderApp(); return;
  }
  if (a === "ci-open") { CheckinState.checkinOpen=true; CheckinState.checkinForm=null; CheckinState.checkinWeek=mondayOf(today()); renderApp(); return; }
  if (a === "ci-close") { CheckinState.checkinOpen=false; CheckinState.checkinForm=null; CheckinState.checkinWeek=null; renderApp(); return; }
  // Pregunta de opciones del check-in. La adherencia se sigue guardando como número (va a
  // su propia columna) si la opción es un número; si el coach le puso opciones con palabras,
  // como el texto de la opción elegida, igual que el resto (antes quedaba NaN y se perdía).
  if (a === "ci-opt") { const f=checkinFormInit(); const k=el.dataset.k; f[k] = (k==="adherence" && /^\d+$/.test(el.dataset.v)) ? parseInt(el.dataset.v,10) : el.dataset.v; renderApp(); return; }
  if (a === "ci-save") {
    // La semana en que se abrió el formulario (no la de ahora, si ya pasó la medianoche).
    const wk = checkinWeek();
    const prev = state.checkins[wk];
    const rec = Object.assign({}, prev||{}, checkinFormInit());
    // Vacío no se manda: quedaba como respondido y al coach le llegaba el aviso de un check-in sin nada.
    if(!checkinHasAnswer(rec)){ alert("Respondé al menos una pregunta antes de enviar el check-in."); return; }
    rec._q = questionSnapshot(clientQuestions("checkin"), rec);
    state.checkins[wk] = rec;
    CheckinState.checkinOpen=false; CheckinState.checkinForm=null; CheckinState.checkinWeek=null; save();
    const synced = await cloudSaveCheckin(wk, rec);
    if(synced==="failed"){
      // La base lo rechazó y no se reintenta solo: no queda como enviado y las respuestas
      // vuelven al formulario para mandarlo de nuevo.
      if(prev) state.checkins[wk]=prev; else delete state.checkins[wk];
      save();
      CheckinState.checkinOpen=true; CheckinState.checkinWeek=wk; CheckinState.checkinForm=JSON.parse(JSON.stringify(rec));
      renderApp();
      alert("No se pudo enviar tu check-in: el servidor no lo aceptó. Tus respuestas siguen en el formulario: revisalas y tocá «Enviar check-in a mi coach» de nuevo. Si vuelve a pasar, avisale a tu coach.");
      return;
    }
    // Sin llegar a la nube (señal floja, servidor caído, sesión vencida) no se dice «enviado».
    alert(synced ? "\u00a1Check-in enviado a tu coach! 💪" : "Tu check-in se guardó en este dispositivo pero todavía no llegó a tu coach. Queda pendiente y se envía solo cuando se pueda.");
    renderApp(); return;
  }
  if (a === "daily-set") { dailyFormInit(); CheckinState.dailyForm[el.dataset.k] = el.dataset.v; renderApp(); return; }
  if (a === "weight-save") { const dEl=document.getElementById("wDate"), kEl=document.getElementById("wKg"); const date=dEl?dEl.value:""; const kg=parseFloat((kEl?kEl.value:"").replace(",",".")); if(!date){ alert("Elegí una fecha."); return; } if(!(kg>0)){ alert("Poné un peso válido."); return; } const exw=state.weights.find(w=>w.date===date); if(exw) exw.kg=kg; else state.weights.push({id:uid(),date,kg}); ProgresoState.weightForm={date:today(),kg:"",at:today()}; save(); renderApp(); return; }
  if (a === "weight-edit") { const w=state.weights.find(x=>x.id===el.dataset.id); if(w){ ProgresoState.weightForm={date:w.date,kg:String(w.kg).replace(".",","),at:today()}; } renderApp(); return; }
  if (a === "weight-remove") { state.weights=state.weights.filter(x=>x.id!==el.dataset.id); save(); renderApp(); return; }

  // Agua
  if (a === "water-add") { const n=parseInt(el.dataset.n)||0; state.water=Math.max(0,(state.water||0)+n); save(); renderApp(); return; }
  if (a === "water-goal") { const v=prompt("Meta de agua en ml (ej: 3000):", String(Math.round(state.waterGoal||3000))); if(v!==null){ const n=intNum(v); if(n>0){ state.waterGoal=n; save(); renderApp(); } } return; }
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
  if (a === "open-routines") { openRoutinePicker(); return; }
  if (a === "addday") { const nd={id:uid(),name:"Nuevo",subtitle:"",exercises:[]}; state.days.push(nd); State.activeId=nd.id; State.dayPickedOn=today(); HabitosState.pendingFocusDay=true; save(); renderApp(); return; }
  if (a === "delday") { if(state.days.length<=1){ alert("Tiene que quedar al menos un día."); return; } if(confirm("¿Eliminar este día?")){ state.days=state.days.filter(x=>x.id!==State.activeId); State.activeId=state.days[0].id; State.dayPickedOn=today(); save(); renderApp(); } return; }
  // Días de la semana del día abierto (core/diasemana.js): se abren los 7 botones debajo del
  // nombre, cada toque guarda (y sube con la rutina) y «Listo» los vuelve a cerrar.
  if (a === "dias-open") { if(!routineLocked()){ EntrenoState.diasOpen = day().id; renderApp(); } return; }
  if (a === "dias-close") { EntrenoState.diasOpen = null; renderApp(); return; }
  if (a === "dia-toggle") { if(routineLocked()) return; toggleDia(day(), el.dataset.d); save(); renderApp(); return; }

  // Entreno
  if (a === "tab") { State.activeId = el.dataset.day; State.dayPickedOn = today(); EntrenoState.diasOpen = null; setTimeout(renderApp, 130); return; } // deja ver el ripple antes del rerender
  const d = day();
  const exsToday = todayExs(d);
  const ex = el.dataset.ex && exsToday.find(x=>x.id===el.dataset.ex);
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
    if(!wasDone && nowDone){
      // Con récord, primero se festeja en la fila y después se colapsa el ejercicio.
      // Mientras dura el festejo queda abierto (si no, renderApp ya lo dibuja colapsado).
      if(prDiff!==null){
        renderApp(); playPR(s.id, prDiff);
        setTimeout(()=>{
          // Si mientras tanto destildó algo o ya lo cerró, no se toca.
          if(!allSetsDone(ex) || !expandedOverride.has(ex.id)) return;
          collapseExerciseAnimated(ex.id, ()=>{ expandedOverride.delete(ex.id); renderApp(); }, true);
        }, PR_HOLD_MS);
      }
      else collapseExerciseAnimated(ex.id, ()=>{ expandedOverride.delete(ex.id); renderApp(); }, true);
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
    // Si corría el de otra serie, se frena y se le anota lo que duró (antes se perdía).
    const prevId=runningSetId();
    if(prevId){ const r=stopTimer(), ps=d.exercises.reduce((f,x)=>f||x.sets.find(y=>y.id===prevId),null); if(ps && r && r.secs>0) ps.secs=String(r.secs); }
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
    else { const kg=parseFloat(el.dataset.kg); if(kg || kg===0 && isAssisted(ex.name)) ex.sets.forEach(s=>{ if(!s.done){ s.kg=String(kg); autoKg.delete(s.id); } }); }
    save(); renderApp(); return;
  }
  // «La vez pasada» → Usar estos pesos: cada serie sin tildar toma el peso de la misma serie
  // de la vez pasada (las de más, el de la última). Quedan como cargados a mano.
  if (a === "last-use") {
    if(!ex) return;
    const prev=lastSessionFor(ex.name, exOccurrence(exsToday, ex)); if(!prev) return;
    const plan=lastPlan(ex, prev.sets);
    ex.sets.forEach((s,i)=>{ const k=plan[i]&&plan[i].kg; if(!s.done && k){ s.kg=String(k); autoKg.delete(s.id); forgetPR(s.id); } });
    save(); renderApp(); return;
  }
  // Abrir y cerrar un ejercicio con la flechita (una superserie, entera).
  // Uno abierto a la vez: abrir otro cierra el anterior (salvo su superserie, que va entera).
  if (a === "ex-expand") { if(!ex) return; expandedOverride.clear(); exGroupIds(d.exercises, ex.id).forEach(id=>expandedOverride.add(id)); renderApp(); return; }
  if (a === "ex-collapse") { if(!ex) return; const ids=exGroupIds(d.exercises, ex.id); collapseExerciseAnimated(ex.id, ()=>{ ids.forEach(id=>expandedOverride.delete(id)); renderApp(); }); return; }
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
  // «Ya tengo un código»: el mail de recuperación ya llegó (pedido acá, en otro celular o en la
  // web) y se escribe el código que trae. Si todavía no se sabe el mail, el paso lo pide.
  if(a==="to-code"){
    const email=((document.getElementById("auEmail")||{}).value||"").trim();
    showLogin("","code",/^[^@ ]+@[^@ ]+\.[^@ ]+$/.test(email) ? {email:email} : {email:email, askEmail:true}); return;
  }
  if(a==="do-forgot"){
    const email=((document.getElementById("auEmail")||{}).value||"").trim();
    if(!/^[^@ ]+@[^@ ]+\.[^@ ]+$/.test(email)){ showLogin("Poné el mail con el que te registraste (ej: nombre@gmail.com).","forgot",{email:email}); return; }
    b.disabled=true; b.textContent="Enviando...";
    if(!State.sb) await ensureSb();
    if(!State.sb){ showLogin("No se pudo conectar con el servidor. Revisá tu conexión a internet y volvé a intentar.","forgot",{email:email}); return; }
    // Se marca que el pedido salió de acá, con el mail: el botón del mail (#recuperar=...) solo
    // se canjea donde se pidió y para esa cuenta (useRecoveryLink en core/supabase.js).
    markRecoveryRequest(email);
    // Los mails de antes del código traían un link de Supabase (#access_token=...): en la web
    // se acepta si este navegador lo pidió (se apaga al terminar, ver clearAuthExpect).
    if(!IS_NATIVE) expectAuthLink();
    const r=await State.sb.auth.resetPasswordForEmail(email, {redirectTo: IS_NATIVE ? "gize://confirmado" : location.origin + location.pathname});
    if(r.error){
      const rate = r.error.status===429 || /rate|seconds/i.test(r.error.message||"");
      if(rate){ showLogin("Ya te mandamos un mail hace un momento. Si te llegó, escribí el código que trae; si no, esperá un minuto y pedí otro.","code",{email:email}); return; }
      showLogin("No se pudo mandar el mail: "+r.error.message,"forgot",{email:email}); return;
    }
    // Supabase no dice si el mail tiene cuenta (para no revelar quién está registrado).
    // Se pasa directo a escribir el código: anda en cualquier celular o navegador.
    showLogin("Listo. Si ese mail tiene una cuenta en GIZE, te llega un mail con un botón y un código de 6 números. Revisá también la carpeta de spam.","code",{email:email});
    return;
  }
  if(a==="do-code"){
    const email=((document.getElementById("auEmail")||{}).value||"").trim();
    const raw=((document.getElementById("auOtp")||{}).value||"");
    const ask=!!document.querySelector('#authHost [data-ask-email]');
    // Se aceptan espacios o guiones al pegarlo («123 456»). Supabase lo manda de 6 números
    // (la tarea "mails" de .github/workflows/supabase.yml lo deja fijo en 6).
    const token=raw.replace(/[\s-]/g,"");
    const again=(m)=>showLogin(m,"code",ask ? {email:email, code:raw, askEmail:true} : {email:email, code:raw});
    if(!/^[^@ ]+@[^@ ]+\.[^@ ]+$/.test(email)){ again("Poné el mail de tu cuenta (ej: nombre@gmail.com)."); return; }
    if(!/^\d{6,10}$/.test(token)){ again("Escribí los 6 números del código que te llegó por mail."); return; }
    b.disabled=true; b.textContent="Revisando...";
    if(!State.sb) await ensureSb();
    if(!State.sb){ again("No se pudo conectar con el servidor. Revisá tu conexión a internet y volvé a intentar."); return; }
    let r;
    try{ r=await State.sb.auth.verifyOtp({email:email, token:token, type:"recovery"}); }
    catch(err){ r={error:err}; }
    if(r.error || !r.data || !r.data.session){
      const k=otpErrorKind(r.error);
      again(k==="rate" ? RECOVERY_MSG.rate
        : k==="offline" ? "No se pudo revisar el código. Revisá tu conexión a internet y volvé a intentar: el código sigue sirviendo."
        : "El código no es correcto o ya venció (dura 1 hora, sirve una sola vez y deja de servir si pediste otro mail después). Revisalo, o pedí un mail nuevo.");
      return;
    }
    // Ya hay sesión de recuperación: no se abre la app hasta elegir la contraseña (o cancelar).
    clearRecoveryRequest(); clearAuthExpect();
    setRecoveryPending(r.data.session);
    showLogin("","newpass");
    return;
  }
  if(a==="do-newpass"){
    const pass=(document.getElementById("auPass")||{}).value||"";
    if(pass.length<6){ showLogin("La contraseña necesita al menos 6 caracteres.","newpass"); return; }
    b.disabled=true; b.textContent="Guardando...";
    if(!State.sb) await ensureSb();
    let r;
    try{ r=State.sb ? await State.sb.auth.updateUser({password:pass}) : {error:{message:"sin conexión"}}; }
    catch(err){ r={error:err}; }
    if(r.error){
      const same=/different from the old|same/i.test(r.error.message||"");
      const net=!same && otpErrorKind(r.error)==="offline";
      showLogin(same ? "Esa es tu contraseña actual: elegí una distinta."
        : net ? "No se pudo guardar: revisá tu conexión a internet y volvé a intentar."
        : "No se pudo guardar ("+r.error.message+"). Si pasó mucho tiempo, tocá «Cancelar» y pedí un mail nuevo.","newpass"); return;
    }
    clearRecoveryPending();
    if(window.coreReplay) window.coreReplay();
    try{ await afterLogin(r.data.user); } finally { if(window.coreEnter) window.coreEnter(); }
    return;
  }
  // «Cancelar» en la contraseña nueva: se sale de la sesión de recuperación sin entrar a la app.
  if(a==="cancel-newpass"){
    b.disabled=true;
    await dropRecoverySession();
    showLogin("","in");
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
    // Una salida de Cardio en curso (o terminada sin guardar) se pierde al cerrar sesión.
    if(GpsState.run && !confirm("Tenés una salida de Cardio "+(GpsState.run.status==="ended"?"sin guardar":"en curso")+". Si cerrás sesión se pierde.\n\n¿Cerrar sesión igual?")) return;
    if(State.cloudUser && localUnsynced()){
      const n=pendingCount();
      const que = n>0 ? n+" registro"+(n>1?"s":"")+(state.routineHash!==routineHash(state.days)?" y cambios de tu rutina":"") : "cambios de tu rutina";
      if(!confirm("Tenés "+que+" que todavía no se guardaron en tu cuenta (sin conexión). Si cerrás sesión ahora se pierden.\n\nConectate a internet, abrí la app y esperá unos segundos antes de salir.\n\n¿Cerrar sesión igual?")) return;
    }
    State.signingOut=true; // el SIGNED_OUT que viene es este: no es una sesión perdida (core/supabase.js → watchAuth)
    try{ await pushLogout(); }catch(e){} // antes del signOut: borrar el dispositivo necesita la sesión
    const logoutUid=State.cloudUser&&State.cloudUser.id;
    try{ await State.sb.auth.signOut(); }catch(e){}
    try{ localStorage.removeItem(KEY); localStorage.removeItem(PROFILE_KEY); localStorage.removeItem("gize_session_ephemeral"); }catch(e){}
    stopForLogout(); closeSalida(); // deja de mirar el GPS y borra la salida en curso
    clearAccountLeftovers(logoutUid);
    location.reload();
    return;
  }
  // Los errores de join_coach con mensaje propio (plan vencido, cupo lleno) se muestran tal cual.
  // En iPhone, sin hablar del plan del coach (core/tienda.js).
  const joinErr=er=>(er && er.code==="P0001" && er.message) ? joinMsgTienda(er.message) : "";
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
  // «Continuar con Apple» (solo en la app de iPhone). El texto del botón no cambia: Apple pide
  // usar solo sus textos aprobados. Mientras está la hoja de Apple queda deshabilitado.
  if(a==="apple"){
    const mode = document.getElementById("auRole") ? "up" : "in";
    const role=((document.getElementById("auRole")||{}).value||"client").trim();
    const code=((document.getElementById("auCode")||{}).value||"").trim();
    const V={name:((document.getElementById("auName")||{}).value||"").trim(), email:((document.getElementById("auEmail")||{}).value||"").trim(), code:code, role:role};
    b.disabled=true;
    if(!State.sb) await ensureSb();
    if(!State.sb){ showLogin("No se pudo conectar con el servidor. Revisá tu conexión a internet y volvé a intentar.", mode, V); return; }
    try{ await signInWithApple({role:mode==="up"?role:"client", code:mode==="up"&&role==="client"?code:"", mode:mode, vals:V}); }
    catch(err){ if(window.coreCancel) window.coreCancel(); showLogin("No se pudo entrar con Apple: "+((err&&err.message)||err), mode, V); }
    return;
  }
  if(a==="do-login"||a==="do-signup"){
    try{ localStorage.removeItem("gize_google_intent"); }catch(e){} // un intento de Google abandonado no aplica acá
    const mode = a==="do-signup"?"up":"in";
    const email=((document.getElementById("auEmail")||{}).value||"").trim();
    const pass=(document.getElementById("auPass")||{}).value||"";
    const name=((document.getElementById("auName")||{}).value||"").trim();
    const code=((document.getElementById("auCode")||{}).value||"").trim();
    // En la app de iPhone no se crean cuentas de coach (core/tienda.js).
    const role=appIOS() ? "client" : ((document.getElementById("auRole")||{}).value||"client").trim();
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
  if(a==="choose"){ cpApply(b.dataset.name, b.dataset.cat); return; }
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
  if((a==="back"||a==="refresh") && routineDirty()){ if(!confirm("Tenés cambios en la rutina sin guardar. ¿Salir igual y perderlos?")) return; dropRoutineDraft(CoachState.coachData.id); CoachState.coachData.routineOrig=JSON.stringify(CoachState.coachData.routine||[]); }
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
  // «Mis planes» y planes guardados (ver screens/coach/planes.js).
  if((a==="view-meals" || /^mpk?-/.test(a)) && await mealAction(a, b)) return;
  if(a==="view-tpls"){ CoachState.coachView="tpls"; await Promise.all([loadTpls(), cargarCatalogo().then(l=>{ CoachState.coachCat=l; }, ()=>{})]); renderCoach(); return; }
  // Importar una rutina armada (las mismas que se ofrecen a quien entrena solo, ver
  // core/rutinas-ejemplo.js) como rutina nueva del coach, para editarla y guardarla.
  if(a==="tpl-seed-open"){ CoachState.coachSeedOpen=!CoachState.coachSeedOpen; renderCoach(); return; }
  if(a==="tpl-seed-cat"){
    const r=(CoachState.coachCat||CATALOGO).find(x=>x.id===b.dataset.id); if(!r) return;
    CoachState.coachSeedOpen=false;
    CoachState.coachTplEdit={id:null, name:r.nombre, days:copiarDias(r.days)}; CoachState.coachEditDay=0; renderCoach(); return;
  }
  if(a==="tpl-new"){ CoachState.coachTplEdit={id:null, name:"", days:[]}; CoachState.coachEditDay=0; renderCoach(); return; }
  if(a==="tpl-open"){ const t=CoachState.coachTpls.find(x=>x.id===b.dataset.id); if(t){ CoachState.coachTplEdit=JSON.parse(JSON.stringify(t)); CoachState.coachEditDay=0; renderCoach(); } return; }
  // Rutina de descarga (ver supabase/descarga.sql): mismo editor, se guarda en el bloque del
  // alumno y al volver o guardar se queda en Ficha → Bloque, con la semana abierta.
  if(CoachState.coachTplEdit && CoachState.coachTplEdit.deload && (a==="tpl-back"||a==="tpl-save"||a==="tpl-del")){
    const e=CoachState.coachTplEdit;
    const leave=()=>{ CoachState.coachTplEdit=null; CoachState.coachEditDay=0; CoachState.coachClientTab="ficha"; CoachState.coachSec="bloque"; CoachState.coachWeekSel=e.wk; renderCoach(); window.scrollTo(0,0); };
    if(a==="tpl-back"){
      if(JSON.stringify(e.days)!==e.orig && !confirm("¿Salir sin guardar la rutina de descarga?")) return;
      leave(); return;
    }
    if(a==="tpl-del"){
      if(!e.saved){ if(JSON.stringify(e.days)!==e.orig && !confirm("¿Descartar esta rutina de descarga?")) return; leave(); return; }
      if(!confirm("¿Borrar la rutina de descarga de la semana "+e.wk+"? Esa semana el alumno sigue con su rutina de siempre.")) return;
      const f=blockForm(); if(f.deload_routines && typeof f.deload_routines==="object") delete f.deload_routines[e.wk];
      b.disabled=true;
      if(await saveBlock(f)){ alert("Rutina de descarga borrada ✓"); leave(); } else b.disabled=false;
      return;
    }
    // Guardar: días sin ejercicios no cuentan; tiene que quedar al menos uno.
    const days=(e.days||[]).filter(d=>(d.exercises||[]).length);
    if(!days.length){ alert("La rutina de descarga no tiene ejercicios."); return; }
    const f=blockForm();
    if(deloadWeeks(f).indexOf(e.wk)<0) f.deloads=deloadWeeks(f).concat(e.wk).sort((x,y)=>x-y);
    f.deload_routines=Object.assign({}, (f.deload_routines&&typeof f.deload_routines==="object")?f.deload_routines:{}, {[e.wk]:{days:days, start:f.start_date}});
    b.textContent="Guardando..."; b.disabled=true;
    if(await saveBlock(f)){ alert("Rutina de descarga guardada ✓ El alumno la usa solo esa semana."); leave(); }
    else { b.textContent="Guardar rutina de descarga"; b.disabled=false; }
    return;
  }
  // Rutina programada (ver supabase/rutina-programada.sql): usa el mismo editor que las rutinas
  // guardadas, con la fecha de inicio. Al volver o guardar se queda en la pestaña Rutina del alumno.
  // Primero se elige desde qué arranca: una de «Mis rutinas» (puede ser distinta de la que tiene
  // el alumno), la rutina actual o vacía. Las rutinas guardadas se copian como al aplicarlas:
  // ids nuevos y sin pesos ni repeticiones cargados.
  if(a==="sched-new"){
    if(!CoachState.coachData) return;
    CoachState.coachSchedPicker={loading:true}; renderSchedPicker();
    await loadTpls();
    if(CoachState.coachSchedPicker){ CoachState.coachSchedPicker.loading=false; renderSchedPicker(); }
    return;
  }
  if(a==="sp-cancel"){ closeSheet(()=>{ CoachState.coachSchedPicker=null; renderSchedPicker(); }, {host:"#applyMount", card:".cp-ccard", duration:150}); return; }
  if(a==="sp-tpl" || a==="sp-copy" || a==="sp-empty"){
    if(!CoachState.coachData || !CoachState.coachSchedPicker) return;
    let name="", days=[];
    if(a==="sp-tpl"){
      const tpl=CoachState.coachTpls.find(t=>t.id===b.dataset.id); if(!tpl) return;
      name=String(tpl.name||"").slice(0,80);
      days=JSON.parse(JSON.stringify(tpl.days||[]));
      days.forEach(d=>{ d.id=uid(); (d.exercises||[]).forEach(ex=>{ ex.id=uid(); (ex.sets||[]).forEach(s=>{ s.id=uid(); s.kg=""; s.reps=""; s.done=false; if("secs" in s) s.secs=""; }); }); });
    } else if(a==="sp-copy"){ days=JSON.parse(JSON.stringify(CoachState.coachData.routine||[])); }
    CoachState.coachSchedPicker=null; renderSchedPicker();
    CoachState.coachTplEdit={sched:true, id:null, name:name, starts_on:addDays(today(), 28), days:days};
    CoachState.coachEditDay=0; renderCoach(); window.scrollTo(0,0); return;
  }
  if(a==="sched-open"){
    const s=((CoachState.coachData&&CoachState.coachData.schedule)||[]).find(x=>x.id===b.dataset.id); if(!s) return;
    CoachState.coachTplEdit={sched:true, id:s.id, name:s.name||"", starts_on:s.starts_on, days:JSON.parse(JSON.stringify(s.days||[]))};
    CoachState.coachEditDay=0; renderCoach(); window.scrollTo(0,0); return;
  }
  if(a==="tpl-back" && tplDirty() && !confirm("Tenés cambios sin guardar. ¿Salir igual y perderlos?")) return;
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
  if(!CoachState.coachData && !CoachState.coachTplEdit && !CoachState.coachMealEdit) return;
  if(a==="client-tab"){ CoachState.coachClientTab=b.dataset.t; CoachState.coachSec=null; CoachState.coachPlanSec=null; renderCoach(); return; }
  if(a==="plsec-open"){ CoachState.coachPlanSec=b.dataset.v; renderCoach(); window.scrollTo(0,0); return; }
  if(a==="plsec-close"){ CoachState.coachPlanSec=null; renderCoach(); window.scrollTo(0,0); return; }
  if(a==="sec-open" && b.dataset.v==="chat"){ openCoachChat(CoachState.coachSel); return; }
  if(a==="sec-open"){ CoachState.coachSec=b.dataset.v; CoachState.coachSalidaSel=null; renderCoach(); window.scrollTo(0,0); return; }
  if(a==="sec-close"){ CoachState.coachSec=null; renderCoach(); window.scrollTo(0,0); return; }
  // Salidas a pie / en bici del alumno: abrir una (pide su recorrido; si la vez anterior no se
  // pudo, prueba de nuevo) y volver a la lista.
  if(a==="salida-open"){ const st=CoachState.coachData.salidaTracks; if(st && st[b.dataset.id]==="") delete st[b.dataset.id]; CoachState.coachSalidaSel=b.dataset.id; renderCoach(); window.scrollTo(0,0); return; }
  if(a==="salida-close"){ CoachState.coachSalidaSel=null; renderCoach(); window.scrollTo(0,0); return; }
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
  // Copia del día abierto, justo después, con los mismos ejercicios, series y objetivos
  // (sin pesos ni reps cargados): para armar, por ejemplo, "Piernas B" a partir de "Piernas A".
  if(a==="day-dup"){ const D=rtDays(), i=CoachState.coachEditDay; if(!D||!D[i]) return;
    const c=JSON.parse(JSON.stringify(D[i])); c.id=uid(); c.name=((D[i].name||"Día")+" (copia)").slice(0,60);
    (c.exercises||[]).forEach(ex=>{ ex.id=uid(); (ex.sets||[]).forEach(st=>{ st.id=uid(); st.kg=""; st.reps=""; st.done=false; }); });
    D.splice(i+1, 0, c); CoachState.coachEditDay=i+1; renderCoach(); return; }
  // Días de la semana del día abierto (core/diasemana.js): queda como cambio sin guardar.
  if(a==="day-dow"){ const day=(rtDays()||[])[CoachState.coachEditDay]; if(day){ toggleDia(day, b.dataset.d); renderCoach(); } return; }
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
  // Bloque: tocar una semana la marca como descarga (queda en azul) y abre su panel abajo;
  // tocar una que ya es de descarga la desmarca. Su rutina de descarga queda en el bloque
  // mientras no se guarde: si la vuelve a marcar, vuelve; si guarda así, saveBlock pregunta
  // antes de borrarla. Cada semana de descarga se abre desde la lista de abajo (wk-open).
  if(a==="blk-week"){
    const w=parseInt(b.dataset.w); if(!(w>=1)) return;
    const cur=CoachState.coachBlockForm||CoachState.coachData.block||{};
    if(deloadWeeks(cur).indexOf(w)<0){ const f=blockForm(); f.deloads=deloadWeeks(f).concat(w).sort((x,y)=>x-y); CoachState.coachWeekSel=w; }
    else {
      const f=blockForm(); f.deloads=deloadWeeks(f).filter(x=>x!==w);
      if(CoachState.coachWeekSel===w) CoachState.coachWeekSel=null;
    }
    renderCoach(); return;
  }
  if(a==="wk-open"){ const w=parseInt(b.dataset.w); if(!(w>=1)) return; CoachState.coachWeekSel = CoachState.coachWeekSel===w ? null : w; renderCoach(); return; }
  if(a==="wk-close"){ CoachState.coachWeekSel=null; renderCoach(); return; }
  if(a==="wk-dl"){
    const w=parseInt(b.dataset.w); if(!(w>=1)) return;
    const f=blockForm(); const dls=deloadWeeks(f);
    // Igual que tocarla en la grilla: la rutina queda hasta guardar (saveBlock pregunta).
    if(dls.indexOf(w)>=0) f.deloads=dls.filter(x=>x!==w);
    else f.deloads=dls.concat(w).sort((x,y)=>x-y);
    renderCoach(); return;
  }
  // Rutina de descarga: se arma con el mismo editor de las rutinas y se guarda en el bloque.
  if(a==="dl-new"||a==="dl-edit"){
    const w=parseInt(b.dataset.w); if(!(w>=1)) return;
    const f=CoachState.coachBlockForm||CoachState.coachData.block||{};
    if(!f.start_date){ alert("Primero poné la fecha de inicio del bloque (un lunes)."); return; }
    const old=a==="dl-edit" ? deloadRoutineOf(f, w, savedBlockStart()) : null;
    const days = old ? JSON.parse(JSON.stringify(old.days)) : (b.dataset.from==="rutina" ? deloadFromRoutine(CoachState.coachData.routine) : []);
    CoachState.coachTplEdit={deload:true, wk:w, saved:!!old, name:"", days:days, orig:JSON.stringify(days)};
    CoachState.coachEditDay=0; CoachState.coachExpandedEx=new Set(); CoachState.coachExMenu=null;
    renderCoach(); window.scrollTo(0,0); return;
  }
  if(a==="dl-del"){
    const w=parseInt(b.dataset.w); if(!(w>=1)) return;
    if(!confirm("¿Borrar la rutina de descarga de la semana "+w+"? Esa semana el alumno sigue con su rutina de siempre.")) return;
    const f=blockForm(); if(f.deload_routines && typeof f.deload_routines==="object") delete f.deload_routines[w];
    b.disabled=true;
    if(await saveBlock(f)) alert("Rutina de descarga borrada ✓");
    renderCoach(); return;
  }
  if(a==="blk-save"){
    const bf=CoachState.coachBlockForm||CoachState.coachData.block||{};
    b.disabled=true;
    if(await saveBlock(bf)) alert("Bloque guardado ✓");
    renderCoach(); return;
  }
  if(a==="plan-save"){
    const row=nutritionRow(CoachState.coachPlanForm, CoachState.coachData.id, true);
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
  if(a==="pl-habitadd"){ const p=coachPlanObj(CoachState.coachData); (p.habits=p.habits||[]).push(""); if(Array.isArray(p.habitDays)) p.habitDays[p.habits.length-1]=null; renderCoach(); return; }
  if(a==="pl-habitdel"){ const p=coachPlanObj(CoachState.coachData); p.habits.splice(+b.dataset.i,1); if(Array.isArray(p.habitDays)) p.habitDays.splice(+b.dataset.i,1); renderCoach(); return; }
  // Días de cada hábito (p.habitDays[i]: lista de días, 0 = domingo; vacío = todos).
  if(a==="pl-habitall"||a==="pl-habitday"){
    const p=coachPlanObj(CoachState.coachData), i=+b.dataset.i;
    const hd=p.habitDays=Array.isArray(p.habitDays)?p.habitDays:[];
    while(hd.length<(p.habits||[]).length) hd.push(null);
    if(a==="pl-habitall") hd[i]=null;
    else { const d=+b.dataset.d; let cur=Array.isArray(hd[i])?hd[i].slice():[]; cur=cur.includes(d)?cur.filter(x=>x!==d):cur.concat(d); hd[i]=cur.length&&cur.length<7?cur.sort((x,y)=>x-y):null; }
    renderCoach(); return;
  }
  if(a==="pl-swapdel"){ const p=coachPlanObj(CoachState.coachData); p.swaps.splice(+b.dataset.i,1); renderCoach(); return; }
  // Se guarda la rutina tal como estaba al tocar: lo que el coach cambie mientras se guarda
  // sigue marcado como "sin guardar" (antes se daba por guardado y se perdía).
  if(a==="save-routine"){ const cd=CoachState.coachData; if(!cd||!cd.id||cd.id!==CoachState.coachSel||cd.savingRoutine) return; const sent=JSON.stringify(cd.routine||[]); cd.savingRoutine=true; b.disabled=true; b.textContent="Guardando..."; (async()=>{ try{ const r=await State.sb.from("routines").upsert({client_id:cd.id, days:JSON.parse(sent), updated_at:new Date().toISOString(), updated_by:State.cloudUser.id},{onConflict:"client_id"}); if(r.error) throw r.error; if(CoachState.coachData===cd){ cd.routineOrig=sent; cd.draftRestored=false; } alert("Rutina guardada. El cliente la va a ver al abrir la app."); }catch(err){ alert("No se pudo guardar: "+((err&&err.message)||err)); } cd.savingRoutine=false; renderCoach(); })(); return; }
});

document.body.addEventListener("change", async e => {
  const el=e.target.closest("[data-coach]"); if(!el||!CoachState.coachData) return;
  const a=el.dataset.coach;
  if(a==="ex"){ CoachState.coachData.loadEx=el.value; renderCoach(); }
  else if(a==="dayfilter"){ CoachState.coachDayFilter=el.value||null; CoachState.coachData.loadEx=null; renderCoach(); }
  else if(a==="daily-pick"){ CoachState.coachDailySel=el.value; renderCoach(); }
  else if(a==="ck-pick"){ CoachState.coachCkSel=el.value; renderCoach(); }
  else if(a==="sess-pick"){ CoachState.coachSessSel=el.value; renderCoach(); }
});

document.body.addEventListener("input", async e => {
  const el=e.target.closest("[data-coach]"); if(!el) return;
  const a0=el.dataset.coach;
  if(a0==="tpl-name"){ if(CoachState.coachTplEdit) CoachState.coachTplEdit.name=el.value; return; }
  if(a0==="mp-name"){ if(CoachState.coachMealEdit) CoachState.coachMealEdit.name=el.value; return; }
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
  else if(a==="rt-rir"||a==="rt-rest"||a==="rt-goal"||a==="rt-video"){ const ex=day.exercises[+el.dataset.i]; if(ex){ const k=(a==="rt-video")?"video":a.slice(3); let v=el.value.trim(); if(k==="video"&&v&&!/^https:\/\//i.test(v)) v="https://"+v.replace(/^[a-z][a-z0-9+.-]*:(\/\/)?/i,""); if(v) ex[k]=v; else delete ex[k]; if(k==="video"){ if(v) ex.videoFor=ex.name; else delete ex.videoFor; } } }
  else if(a.indexOf("info-")===0){ CoachState.coachInfoForm = CoachState.coachInfoForm || Object.assign({}, CoachState.coachData.info||{}); CoachState.coachInfoForm[a.slice(5)] = el.value; return; }
  else if(a.indexOf("blk-")===0){
    blockForm()[a.slice(4)] = el.value;
    // Semanas o inicio: se redibuja solo la grilla de semanas (el campo sigue con el foco).
    if(a==="blk-weeks"||a==="blk-start_date") refreshBlockWeeks();
    return;
  }
  else if(a==="wk-goal"||a==="wk-note"){
    const w=parseInt(el.dataset.w); if(!(w>=1)) return;
    const f=blockForm(); const wp=f.week_plan=(f.week_plan&&typeof f.week_plan==="object")?f.week_plan:{};
    wp[w]=Object.assign({}, wp[w]||{}, {[a==="wk-goal"?"goal":"note"]:el.value}); return;
  }
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

// ---- Bloque del alumno (coach) ----
// Lo que el coach está editando del bloque: copia del guardado (copia completa: el plan de
// semanas y las rutinas de descarga son objetos y no tienen que cambiar el guardado antes de
// tocar Guardar).
function blockForm(){
  if(!CoachState.coachBlockForm) CoachState.coachBlockForm=JSON.parse(JSON.stringify((CoachState.coachData&&CoachState.coachData.block)||{}));
  return CoachState.coachBlockForm;
}

// Rutina de descarga a partir de la de siempre: los mismos ejercicios con la mitad de las
// series (redondeando para arriba, mínimo 1) y sin pesos ni repeticiones cargados.
function deloadFromRoutine(routine){
  const days=JSON.parse(JSON.stringify(routine||[]));
  days.forEach(d=>{ d.id=uid(); (d.exercises||[]).forEach(ex=>{
    ex.id=uid();
    const sets=Array.isArray(ex.sets)?ex.sets:[];
    ex.sets=sets.slice(0, Math.max(1, Math.ceil(sets.length/2)));
    ex.sets.forEach(st=>{ st.id=uid(); st.kg=""; st.reps=""; st.done=false; if("secs" in st) st.secs=""; });
  }); });
  return days;
}

// Guarda el bloque del alumno abierto. Las semanas de descarga, el plan y las rutinas se
// recortan a las semanas del bloque (avisando si se pierde alguna rutina armada). Cada rutina
// guarda la fecha de inicio del bloque (start): si el coach la cambió, se pregunta si las ya
// armadas siguen valiendo con las fechas nuevas. Una sola vez a la vez (doble toque).
let _savingBlock=false;
const savedBlockStart = () => (CoachState.coachData && CoachState.coachData.block && CoachState.coachData.block.start_date) || null;
async function saveBlock(bf){
  if(_savingBlock){ alert("Todavía se está guardando el bloque. Probá de nuevo en un momento."); return false; }
  if(!bf.start_date){ alert("Poné la fecha de inicio del bloque (un lunes)."); return false; }
  const weeks=Math.max(1, Math.min(52, parseInt(bf.weeks)||8));
  const dls=[...new Set(deloadWeeks(bf))].filter(w=>w<=weeks).sort((x,y)=>x-y);
  const oldStart=(CoachState.coachData.block&&CoachState.coachData.block.start_date)||null;
  const drAll=(bf.deload_routines&&typeof bf.deload_routines==="object")?bf.deload_routines:{};
  const dr={}, lost=[], carry=[];
  Object.keys(drAll).forEach(k=>{
    const r=drAll[k]; if(!(r && Array.isArray(r.days) && r.days.length)) return;
    const st=r.start||oldStart||bf.start_date;
    if(st!==bf.start_date && st!==oldStart) return; // de un ciclo anterior: ya no valía
    if(dls.indexOf(+k)<0){ lost.push(+k); return; }
    if(st===bf.start_date) dr[+k]={days:r.days, start:bf.start_date}; else carry.push(+k);
  });
  if(lost.length && !confirm("La rutina de descarga de la semana "+lost.join(", ")+" queda afuera (la semana ya no es de descarga o el bloque es más corto) y se borra. ¿Guardar igual?")) return false;
  if(carry.length){
    const wks="semana"+(carry.length>1?"s ":" ")+carry.join(", ");
    if(confirm("Cambiaste la fecha de inicio del bloque. ¿Las rutinas de descarga ya armadas ("+wks+") siguen valiendo con las fechas nuevas?"))
      carry.forEach(k=>{ dr[k]={days:drAll[k].days, start:bf.start_date}; });
    else if(!confirm("¿Borrar las rutinas de descarga de "+(carry.length>1?"las ":"la ")+wks+"? (por ejemplo, si es un mesociclo nuevo)\n\nSi cancelás, no se guarda nada.")) return false;
  }
  const wpAll=(bf.week_plan&&typeof bf.week_plan==="object")?bf.week_plan:{}, wp={};
  Object.keys(wpAll).forEach(k=>{
    const w=+k, x=wpAll[k]||{}; if(!(w>=1 && w<=weeks)) return;
    const goal=String(x.goal||"").trim().slice(0,300), note=String(x.note||"").trim().slice(0,1000);
    if(goal||note) wp[w]=Object.assign({}, goal?{goal}:{}, note?{note}:{});
  });
  const row={client_id:CoachState.coachData.id, name:bf.name||null, start_date:bf.start_date, weeks:weeks,
    phase:bf.phase||null, calories:bf.calories||null, deloads:dls, notes:bf.notes||null, active:true,
    week_plan:wp, deload_routines:dr};
  const data=CoachState.coachData, snap=JSON.stringify(bf);
  _savingBlock=true;
  try{
    if(data.block && data.block.id){ sbOk(await State.sb.from("blocks").update(row).eq("id",data.block.id)); row.id=data.block.id; }
    else { const r=sbOk(await State.sb.from("blocks").insert(row).select("id").single()); if(r.data) row.id=r.data.id; }
    // Si mientras se guardaba el coach cambió algo más, eso queda como cambio sin guardar.
    data.block=row;
    if(CoachState.coachData===data && (!CoachState.coachBlockForm || JSON.stringify(CoachState.coachBlockForm)===snap)) CoachState.coachBlockForm=null;
    return true;
  }catch(e){ alert("No se pudo: "+((e&&e.message)||e)); return false; }
  finally{ _savingBlock=false; }
}

// Vuelve de segundo plano (por ejemplo, a la mañana siguiente): Entreno pasa al día que toca
// hoy, salvo en medio de un entreno o si hoy ya se eligió otro día a mano (core/state.js).
document.addEventListener("visibilitychange", ()=>{
  if(document.visibilityState!=="visible" || (State.cloudProfile && State.cloudProfile.role==="coach")) return;
  if(elegirDiaDeHoy() && State.view==="entreno") renderApp();
});

document.addEventListener("visibilitychange", async ()=>{
  if(document.visibilityState!=="visible") return;
  // Sin coach: la rutina se pudo haber cambiado en otro dispositivo mientras esta quedaba
  // abierta. Se relee de la nube y, si cambió, se redibuja (ver refreshOwnRoutine).
  if(!routineLocked()){ if(await refreshOwnRoutine()) renderApp(); return; }
  // Primero con lo guardado (sin señal también): si cambió la semana, cambia la rutina ya.
  if(coachRoutineDue() && applyCoachRoutine()){ save(); renderApp(); }
  if(!State.sb || !State.cloudUser) return;
  try{
    // La rutina y el bloque (la semana de descarga puede haber empezado o terminado).
    const uid=State.cloudUser.id;
    const [rt, bl]=await Promise.all([
      State.sb.from("routines").select("days").eq("client_id",uid).maybeSingle(),
      State.sb.from("blocks").select("*").eq("client_id",uid).eq("active",true).order("start_date",{ascending:false}).limit(1)
    ]);
    if(!routineLocked()) return;
    if(!bl.error) state.block=(bl.data && bl.data[0]) ? bl.data[0] : null;
    if(!rt.error && rt.data && Array.isArray(rt.data.days) && rt.data.days.length) state.regularDays=rt.data.days;
    if(rt.error && bl.error) return;
    applyCoachRoutine(); // conserva lo que el cliente ya cargó
    elegirDiaDeHoy(); // los días de la semana que haya puesto el coach (core/state.js)
    save(); renderApp();
  }catch(e){}
});

if (migrateNames(state.days)) save();
elegirDiaDeHoy(); // con la rutina ya acomodada: Entreno abre en el día de hoy (core/state.js)
// Sin señal al abrir: si empezó o terminó la semana de descarga, cambia igual de rutina con lo
// que quedó guardado del bloque (la nube lo confirma cuando vuelve la conexión).
if (coachRoutineDue() && applyCoachRoutine()) save();

cloudBoot();

initTabScroll(); // días de Entreno: ruedita y arrastre con el mouse
initUpdateCheck(); // cartel de versión nueva en las apps de las tiendas
initHabitAlarms(()=>{ State.view="habitos"; renderApp(); }); // tocar el aviso de un hábito abre Hábitos
initBackButton(); // «Atrás» de Android: cierra la ventana abierta, vuelve o sale
resumeRest(); // descanso que quedó corriendo al cerrar la app
// En la app nativa (Capacitor) los archivos ya viajan dentro de la app: no hace falta el service worker.
const IS_NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
if (!IS_NATIVE && "serviceWorker" in navigator) { window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).catch(()=>{}); }); }

// ---- Productos de marca (Open Food Facts) ----
// Búsqueda con espera de 450 ms desde la última tecla y cancelando la anterior: así no
// se pide nada por cada letra ni llega tarde una respuesta vieja.
let offTimer = null, offCtrl = null;
// Cuando llegan los productos de marca se vuelve a ordenar toda la lista (van mezclados por parecido).
function paintOff(){ const box=document.getElementById("foodResults"); if(box) box.innerHTML = renderResults(ComidaState.foodQuery); }
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

// Racha: si la app vuelve de segundo plano en un día nuevo, ese día también cuenta (y el
// día nuevo se sube a la nube como cualquier otro, ver checkDaily).
document.addEventListener("visibilitychange", ()=>{
  if(document.visibilityState!=="visible" || (State.cloudProfile && State.cloudProfile.role==="coach")) return;
  if((state.visits||[]).indexOf(today())<0) renderApp();
});

// Hoja de días y aviso de un hábito: se actualiza en el lugar (si no está dibujada, se dibuja).
function paintHabitAlarm(){ if(!paintHabitAlarmSheet(alarmsSupported())) renderApp(); }

// ---- Pedir un producto que no está (core/productos.js → sendProductRequest) ----
function openRequest(init){
  closeRequest();
  ComidaState.reqForm = Object.assign({ name:"", brand:"", code:"" }, init);
  // Encima de cualquier otra pantalla de Comida (meta, Mi plan, editar algo anotado).
  ComidaState.creatingFood=false; ComidaState.calEditing=false; ComidaState.planOpen=false; ComidaState.editEntry=null; ComidaState.selectedFood=null;
  ComidaState.requestingProduct=true; renderApp();
}
function closeRequest(){
  const r=ComidaState.reqForm;
  if(r){ if(r.labelUrl) URL.revokeObjectURL(r.labelUrl); if(r.frontUrl) URL.revokeObjectURL(r.frontUrl); }
  ComidaState.reqForm=null; ComidaState.requestingProduct=false;
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
  const known = (state.offRecent||[]).find(f => f.code === code) || (state.foods||[]).find(f => f.code === code);
  if(known){ ComidaState.selectedFood = known; ComidaState.cookState = null; ComidaState.sheetGrams = null; SheetState.sheetGen++; renderApp(); return; }
  // Primero la base compartida de GIZE. Si no está, GIZE lo busca en Open Food Facts y lo
  // guarda para todos (función "productos-off"). Si la función no responde (todavía no está
  // publicada, sin señal, límite del día, datos incompletos), se busca en Open Food Facts desde
  // el celular como antes: se puede anotar igual, pero no queda en la base compartida.
  let food = null;
  try{ food = await productByCodeShared(code); }catch(e){}
  if(!food){
    const saved = await saveOffShared(code);
    if(saved && saved.food) food = saved.food;
    else if(!(saved && saved.missing)){
      try{ food = await productByCode(code); }
      catch(e){ alert("No se pudo buscar el producto (¿sin conexión?). Probá de nuevo o cargalo a mano."); return; }
    }
  }
  if(!food){
    if(confirm("Todavía no tenemos el código " + code + ".\n\n¿Nos mandás una foto de la tabla nutricional? Lo revisamos y lo agregamos a GIZE para todos.")){
      ComidaState.searchOpen=false; openRequest({ code: String(code).replace(/\D/g,"") });
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

// ---- Chat coach ↔ alumno (app/ui/chat.js) ----
// Alumno: botón de la barra de arriba (#chatBtn) con el globito de mensajes sin leer.
// Coach: el globito va en la lista de clientes y en la tarjeta "Chat" de la ficha.
function isCoach(){ return !!(State.cloudProfile && State.cloudProfile.role==="coach"); }
function openMyChat(){
  const p=State.cloudProfile; if(!p || !p.coach_id || !State.cloudUser) return;
  openChat({ clientId: State.cloudUser.id, coachId: p.coach_id, name: State.brandName || "Tu coach", role: "client" });
}
function openCoachChat(id){
  if(!id || !State.cloudUser) return;
  const c=CoachState.coachClients.find(x=>x.id===id);
  openChat({ clientId: id, coachId: State.cloudUser.id, name: (c && c.full_name) || "Alumno", role: "coach" });
}
function paintChatBtn(){
  const b=document.getElementById("chatBtn"); if(!b) return;
  const p=State.cloudProfile;
  const show=!!(State.cloudUser && p && p.role!=="coach" && p.coach_id);
  b.hidden=!show;
  const n=show && State.cloudUser ? (ChatUnread.map[State.cloudUser.id]||0) : 0;
  const bd=b.querySelector(".chat-badge"); if(bd){ bd.hidden=!n; bd.textContent=n>9?"9+":String(n); }
  b.classList.toggle("unread", n>0);
  b.setAttribute("aria-label", n ? "Chat con tu coach: "+n+" sin leer" : "Chat con tu coach");
}
ChatUnread.onChange=()=>{ paintChatBtn(); if(isCoach()) renderCoach(); };
// Tocar el aviso de un mensaje: el service worker avisa (app abierta) o abre ?chat=<alumno>.
function chatFromPush(id){
  if(!id || !State.cloudUser || !State.cloudProfile || chatOpenFor()===id) return;
  if(isCoach()){ if(CoachState.coachClients.some(c=>c.id===id)) openCoachChat(id); }
  else if(id===State.cloudUser.id) openMyChat();
}
if("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("message", e=>{ if(e.data && e.data.type==="open-chat") chatFromPush(String(e.data.client||"")); });
window.addEventListener("gize:login", ()=>{
  paintChatBtn();
  refreshUnread();
  let id=null; try{ const u=new URL(location.href); id=u.searchParams.get("chat"); if(id){ u.searchParams.delete("chat"); history.replaceState(history.state, "", u.pathname+u.search+u.hash); } }catch(e){}
  if(id) chatFromPush(id);
});
// Globitos al día al volver a la app.
document.addEventListener("visibilitychange", ()=>{ if(document.visibilityState==="visible" && State.cloudUser) refreshUnread(); });
// Productos que pidió y ya se cargaron (o se rechazaron): se avisa al entrar y al volver a la
// app (como mucho cada 10 minutos), después de la bienvenida y el resto de lo que abre al entrar.
let reqCheckAt = 0;
function maybeCheckRequests(){ if(!State.cloudUser || Date.now()-reqCheckAt < 600000) return; reqCheckAt = Date.now(); setTimeout(()=>checkProductRequests(retryRequest), 2500); }
// Pedido rechazado que quiere volver a mandar: va a Comida con el formulario ya cargado.
function retryRequest(init){ State.view="comida"; ComidaState.searchOpen=false; ComidaState.selectedFood=null; openRequest(init); }
window.addEventListener("gize:login", maybeCheckRequests);
document.addEventListener("visibilitychange", ()=>{ if(document.visibilityState==="visible") maybeCheckRequests(); });

