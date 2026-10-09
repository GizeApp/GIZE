import { Player, audioState, mmss } from '../ui/grabar.js';
import { ssGroups, ssName } from '../core/superserie.js';
import { exVideo } from '../core/videos.js';
import { EQ_LABELS, equipOf, todayExs, variantOf, variantsFor } from '../core/variantes.js';

import { EX_CATS, EX_DB, RC } from '../core/data.js';
import { FOR_YOU, forYouList, myDisciplinas, orderedCats } from '../core/disciplinas.js';

import { checkSvg, chevronDownSvg, pencilSvg, playSvg, resetSvg, searchSvg, swapSvg, trashSvg, trophySvg, xSvg } from '../core/icons.js';

import { State, state } from '../core/state.js';
import { activeDeload, blockWeek as bBlockWeek, isDeload as bIsDeload, weekPlanOf } from '../core/bloque.js';

import { save } from '../core/storage.js';

import { syncFootText } from '../core/supabase.js';

import { esc, isAssisted, fmt, fmtSecs, isTimedEx, norm, num, parseSecs, searchExercises, setText, today } from '../core/utils.js';

import { renderApp } from '../main.js';

import { allSetsDone, bestKgBefore, bestSetOf, exOccurrence, lastSessionFor, renderLastSession } from './progreso.js';
import { kgText, suggest } from '../core/progresion.js';
import { prSets } from '../ui/festejo.js';

import { parseRest } from '../ui/restbar.js';

import { timerText } from '../ui/settimer.js';

import { focusFor } from '../ui/scrollfocus.js';

import { DIA_LARGO, DIA_LETRA, SEMANA, diasDe, diasTexto, hoyDow } from '../core/diasemana.js';

export const EntrenoState = {

  exPicker: null,

  // Hoja de «Ver variantes» abierta: { exId } (ver core/variantes.js).
  varSheet: null,

  exCat: "pecho",

  exQuery: "",

  loadEx: null,

  // Ejercicio con el editor de descanso abierto (solo sin coach).
  restEditEx: null,

  // Día con los botones de los días de la semana abiertos (solo sin coach, ver diasRow).
  diasOpen: null,

};

// Descanso de cada ejercicio. Con coach: el que puso el coach, solo para iniciar.
// Sin coach: siempre visible (2:00 si el ejercicio no tiene uno) y con el lápiz para
// cambiarlo a gusto; se guarda en el ejercicio (ex.rest) y viaja con la rutina.
const REST_PRESETS = [45, 60, 90, 120, 150, 180, 240, 300];
export const REST_DEFAULT = 120;
export function restLabel(sec){ const m=Math.floor(sec/60), x=sec%60; return m+":"+String(x).padStart(2,"0"); }

// Clave de la preferencia propia (cliente con coach): el nombre del ejercicio, así sigue
// valiendo aunque el coach vuelva a mandar la rutina (los ids cambian, el nombre no).
export function restKey(ex){ return String(ex.name||"").trim().toLowerCase(); }

// Descanso que corre para este ejercicio: con coach, el propio si lo cambió, si no el del
// coach; sin coach, el del ejercicio. 2:00 si no hay ninguno.
export function effectiveRest(ex){
  const pref = routineLocked() ? (state.restPrefs||{})[restKey(ex)] : 0;
  if (pref) return { sec: pref, label: restLabel(pref), own: true };
  const sec = parseRest(ex.rest) || REST_DEFAULT;
  return { sec, label: ex.rest || restLabel(sec), own: false };
}

function restRow(ex){
  const r = effectiveRest(ex);
  // El tiempo al costado se toca para cambiarlo (ruedas de minutos y segundos, como en Cardio).
  return `<div class="rest-row"><button class="rest-btn-full" data-action="rest-from-ex" data-sec="${r.sec}"><span class="rbf-play">${playSvg} Iniciar descanso</span></button>`+
    `<button class="rest-edit" data-action="rest-edit" data-ex="${esc(ex.id)}" aria-label="Cambiar el descanso, ahora ${esc(restLabel(r.sec))}"><span class="rest-edit-t">${esc(restLabel(r.sec))}</span><span class="rest-edit-h">cambiar</span></button></div>`;
}

// Semanas del bloque: ver core/bloque.js (se re-exportan para los que las importaban de acá).
export { blockWeek, isDeload } from '../core/bloque.js';

// Ejercicios abiertos (desplegados). Pedido: que ocupen menos lugar, así que todos arrancan
// cerrados (una fila con el nombre y una flechita) y se abren y cierran con la flecha. Uno
// abierto a la vez: abrir otro cierra el anterior (salvo su superserie). No se
// guarda: al volver a abrir la app aparecen cerrados otra vez. Una superserie se abre y se
// cierra entera (ver exGroupIds), así la pantalla puede pasar de un ejercicio al otro.
export let expandedOverride = new Set();
export function exGroupIds(exs, id){
  const i = exs.findIndex(x => x.id === id); if (i < 0) return [id];
  const g = ssGroups(exs).find(x => i >= x.start && i <= x.end);
  return g ? exs.slice(g.start, g.end + 1).map(x => x.id) : [id];
}

export let liveCounting = false;

export let lpf = 9.8;

export let prevDyn = 0;

export let lastStepTs = 0;

export let stepsSaveTs = 0;

export const day = () => state.days.find(d => d.id === State.activeId) || state.days[0];

export function onMotion(e){
  const a = e.accelerationIncludingGravity; if(!a) return;
  const mag = Math.sqrt((a.x||0)*(a.x||0)+(a.y||0)*(a.y||0)+(a.z||0)*(a.z||0));
  lpf = lpf*0.9 + mag*0.1;
  const dyn = mag - lpf, now = Date.now();
  if (dyn>1.2 && prevDyn<=1.2 && (now-lastStepTs)>300){
    state.steps = (state.steps||0)+1; lastStepTs=now;
    const el=document.getElementById("stepNum"); if(el) el.textContent=(state.steps).toLocaleString("es-AR");
    const ring=document.getElementById("stepRing"); if(ring){ const g=state.stepsGoal||10000; ring.style.strokeDashoffset = RC*(1-Math.min(state.steps/g,1)); }
    if(now-stepsSaveTs>3000){ save(); stepsSaveTs=now; }
  }
  prevDyn = dyn;
}

export async function startLive(){
  try{
    if (typeof DeviceMotionEvent!=="undefined" && typeof DeviceMotionEvent.requestPermission==="function"){
      const res = await DeviceMotionEvent.requestPermission();
      if (res!=="granted"){ alert("Necesito permiso de movimiento para contar pasos."); return; }
    }
    window.addEventListener("devicemotion", onMotion);
    liveCounting=true; renderApp();
  }catch(err){ alert("Tu dispositivo no permite usar el sensor de movimiento en el navegador."); }
}

export function stopLive(){ try{ window.removeEventListener("devicemotion", onMotion); }catch(e){} liveCounting=false; save(); renderApp(); }

export function routineLocked(){ try { return !!(State.cloudProfile && State.cloudProfile.role!=="coach" && State.cloudProfile.coach_id); } catch(e){ return false; } }

export function renderBlockBanner(){
  const b=state.block; if(!b) return "";
  const wk=bBlockWeek(b, today());
  if(wk<1) return "";
  const dl=bIsDeload(b,wk);
  const meta=[b.phase, b.calories].filter(Boolean).join(" \u00b7 ");
  const wkData=weekPlanOf(b, wk);
  const wkGoal=wkData.goal||''; const wkNote=wkData.note||'';
  // Con rutina de descarga armada por el coach, la de hoy ya es esa (ver applyCoachRoutine).
  const dlRt=dl && state.routineMode && state.routineMode!=="regular" && activeDeload(b, today());
  return '<div class="blk'+(dl?' deload':'')+'">'+
    '<div class="blk-top"><span class="blk-w">Semana '+wk+(b.weeks?' de '+(parseInt(b.weeks)||''):'')+'</span>'+(meta?'<span class="blk-meta">'+esc(meta)+'</span>':'')+'</div>'+
    (dl?'<div class="blk-dl">SEMANA DE DESCARGA \u2014 '+(dlRt
      ? 'Esta semana entren\u00e1s con la rutina de descarga que te arm\u00f3 tu coach. El lunes vuelve tu rutina de siempre.'
      : 'No faltes al gimnasio: baj\u00e1 series y cargas para recuperarte.')+'</div>':'')+
    (b.notes?'<div class="blk-note">'+esc(b.notes)+'</div>':'')+
    (wkGoal?'<div class="blk-wkgoal">⭐ Objetivo: '+esc(wkGoal)+'</div>':'')+
    (wkNote&&wkNote!==b.notes?'<div class="blk-note">'+esc(wkNote)+'</div>':'')+
    '</div>';
}

// Nota general del día (la que el coach escribe para el día entero). Las notas de cada
// ejercicio ya salen adentro del ejercicio («Nota de tu coach»): acá no se repiten.
export function renderDayNotes(d){
  if(!d.note) return "";
  return '<div class="daynotes" data-reveal="notes-'+esc(d.id)+'"><div class="dn-head">Nota de tu coach \u00b7 '+esc(d.name)+'</div>'+
    '<div class="dn-general">'+esc(d.note)+'</div></div>';
}

// Superserie: los ejercicios unidos van dentro de un recuadro con su letra y la indicación.
const linkSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>';
const unlinkSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 14.5 7 17a3.5 3.5 0 0 1-5-5l2.5-2.5M14.5 9.5 17 7a3.5 3.5 0 0 1 5 5l-2.5 2.5M8 2v3M2 8h3M16 22v-3M22 16h-3"/></svg>';
function ssWrap(exs, groups, i, html){
  const g = groups.find(x => i >= x.start && i <= x.end);
  if (!g) return html;
  // Lo que va entre ejercicios (+ y Separar, rutina propia) queda adentro del panel.
  const m = html.match(/^<div class="ex-gap">[\s\S]*?<\/div>/);
  const gap = m ? m[0] : '', body = html.slice(gap.length);
  let out;
  if (i === g.start) out = gap + `<div class="ss-group"><div class="ss-head"><div class="ss-top"><span class="ss-badge">${linkSvg}${ssName(g)} ${g.letter}</span>${routineLocked()?'':`<button class="ss-split" data-action="ss-split" data-i="${g.start}">${unlinkSvg}Separar</button>`}</div><span class="ss-hint">Hacé una serie de cada uno, sin descanso entre medio. Descansá al terminar la vuelta.</span></div>` + body;
  else out = gap + `<div class="ss-div" aria-hidden="true"><span>sin descanso</span></div>` + body;
  if (i === g.end) out += '</div>';
  return out;
}

// Tiempo del entreno: desde la primera serie tildada del día (state.wkStart, lo marca
// afterSetDone en main.js) hasta Guardar entreno de hoy.
// Si arrancó solo (al tildar) y después se destildó todo, no cuenta: así no queda un reloj
// corriendo horas con 0 series. Con «Iniciar entrenamiento» (manual) corre igual.
// Vigente: empezó hace menos de 6 horas (no "hoy": un entreno que pasa la medianoche no
// pierde el reloj; igual que training() en core/supabase.js).
export function wkFresh(w){ return !!(w && w.ts && Date.now() - w.ts < 6 * 3600 * 1000); }
export function wkStarted(d){
  const w=state.wkStart;
  if(!(wkFresh(w) && (!d || w.day===d.id))) return false;
  return !!(w.manual || !d || d.exercises.some(x=>x.sets.some(s=>s.done)));
}
export function wkElapsedMs(){ const w=state.wkStart; return wkFresh(w) ? Math.max(0, Date.now()-w.ts) : 0; }
export function wkElapsedText(){ return fmt(wkElapsedMs()); }

// Sugerencia de progresión (app/core/progresion.js), debajo de «La vez pasada».
const upSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>';
function renderSuggestion(ex, timed, occ){
  if (allSetsDone(ex)) return "";
  // Propuesta del coach: el peso que cargó por serie en su editor. Manda sobre la automática.
  const kgs = ex.sets.map(s => parseFloat(String(s.targetKg||"").replace(",", ".")) || 0);
  if (kgs.some(k => k > 0)){
    const set = kgs.filter(k => k > 0), same = set.every(k => k === set[0]);
    const reps = ex.sets.find(s => s.target) ? ex.sets.find(s => s.target).target : "";
    const txt = same ? kgText(set[0]) + " kg" + (reps && !timed ? " × " + reps : "") : kgs.map(k => k > 0 ? kgText(k) : "–").join(" · ") + " kg";
    return `<div class="prog-sug coach"><span class="ps-ic">${upSvg}</span><div class="ps-txt"><span class="ps-lbl">Tu coach propone</span> <b>${esc(txt)}</b>${same?'':'<span class="ps-why">Peso de cada serie.</span>'}</div></div>`;
  }
  if (ex.noSug || state.days.some(x => x && x.noSug)) return "";
  // Recomendación (core/progresion.js): solo si la vez pasada se pasó del rango del coach.
  const prev = lastSessionFor(ex.name, occ); if (!prev) return "";
  const sg = suggest(ex, prev.sets, timed); if (!sg) return "";
  return `<div class="prog-sug"><span class="ps-ic">${upSvg}</span><div class="ps-txt"><span class="ps-lbl">Recomendación</span> <b>${esc(sg.text)}</b><span class="ps-why">${esc(sg.why)}</span></div></div>`;
}

// Días de la semana del día (core/diasemana.js), chiquito debajo del nombre de la portada:
// «Lun · Jue». Sin coach se toca para elegirlos (7 botones de lunes a domingo y «Listo»); sin
// ninguno elegido queda la invitación «Elegir días de la semana». Con coach se ve, sin tocar.
const calSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>';
function diasRow(d){
  const txt = diasTexto(d), esHoy = diasDe(d).includes(hoyDow());
  const label = txt ? esc(txt) + (esHoy ? ' <span class="dd-hoy">· hoy</span>' : '') : '';
  if (routineLocked()) return txt ? `<div class="day-dias ro" aria-label="Días de la semana: ${esc(txt)}">${calSvg}<span>${label}</span></div>` : '';
  if (EntrenoState.diasOpen === d.id) {
    const on = diasDe(d);
    const chips = SEMANA.map(n => `<button class="dd-chip${on.includes(n) ? ' on' : ''}" data-action="dia-toggle" data-d="${n}" aria-pressed="${on.includes(n)}" aria-label="${DIA_LARGO[n]}">${DIA_LETRA[n]}</button>`).join("");
    return `<div class="day-dias-edit"><div class="dd-week" role="group" aria-label="Días de la semana de ${esc(d.name)}">${chips}</div>` +
      `<p class="dd-hint">Si hoy es uno de estos días, la app abre directo acá.</p>` +
      `<button class="dd-done" data-action="dias-close">Listo</button></div>`;
  }
  return txt ? `<button class="day-dias" data-action="dias-open" aria-label="Días de la semana: ${esc(txt)}. Cambiar">${calSvg}<span>${label}</span></button>`
    : `<button class="day-dias empty" data-action="dias-open">${calSvg}<span>Elegir días de la semana</span></button>`;
}

// El nombre de la portada va grande; si es largo baja de tamaño para no ocupar media pantalla
// (también mientras se escribe: app/main.js → fitDayName).
export function dayNameCls(name){ const n = String(name || '').length; return n > 32 ? 'dn-xl' : n > 14 ? 'dn-l' : ''; }

export function renderEntreno(){
  const d = day();
  const tabs = state.days.map(x =>
    `<button class="tab${x.id===State.activeId?' active':''}" data-action="tab" data-day="${esc(x.id)}">${esc(x.name)}</button>`
  ).join("") + (routineLocked() ? "" : `<button class="tab tab-add" data-action="addday" title="Agregar día">+</button>`);
  // Un solo ejercicio roto no debe tumbar toda la vista de Entreno: v.innerHTML= es una
  // sola asignación, así que si CUALQUIER ejercicio revienta acá adentro, renderApp() se
  // corta a la mitad, #view queda vacío y la nav no vuelve a responder (ver el bug de
  // .kg/.reps sobre bestSetOf()===null, ya arreglado arriba, pero esto es la red de
  // seguridad para lo que no prevemos). Cada ejercicio se renderiza en su propio try/catch:
  // si uno falla, muestra una card de error puntual y el resto del día se ve normal.
  const groups = ssGroups(d.exercises);
  // Ejercicio en foco (ver ui/scrollfocus.js): se dibuja ya marcado para que no parpadee.
  const fid = focusFor(d.exercises.map(ex => ex.id), d.exercises.filter(ex => expandedOverride.has(ex.id)).map(ex => ex.id));
  // Cada ejercicio como se hace hoy: con la variante elegida (solo por hoy) si hay una.
  const exs = todayExs(d);
  const cards = exs.map((ex, exIdx) => ssWrap(d.exercises, groups, exIdx, (() => { try {
    // Entre ejercicios (rutina propia): insertar uno acá y unir/separar con el de arriba.
    const g = groups.find(x => exIdx >= x.start && exIdx <= x.end) || null;
    const tag = g ? g.letter + (exIdx - g.start + 1) : "";
    const linkBtn = exIdx > 0 ? `<button class="ss-link${d.exercises[exIdx-1].ss?' on':''}" data-action="ss-toggle" data-i="${exIdx-1}" aria-pressed="${!!d.exercises[exIdx-1].ss}">${linkSvg}<span>${d.exercises[exIdx-1].ss?'Separar':'Superserie'}</span></button>` : '';
    const insertBtn = routineLocked()?'':`<div class="ex-gap"><button class="ins-ex" data-action="ex-insert" data-i="${exIdx}" title="Insertar ejercicio acá">+</button>${linkBtn}</div>`;
    const done = allSetsDone(ex);
    // Cerrado (así arranca siempre) -> fila compacta con la flechita, no la card entera.
    if(!expandedOverride.has(ex.id)){
      const n=ex.sets.length, nd=ex.sets.filter(s=>s.done).length;
      let meta, badge, cls='';
      if(done){
        const best=bestSetOf(ex.sets);
        const isPR=exerciseIsLivePR(ex);
        // bestSetOf() da null si ningún set tiene kg cargado (ej.: ejercicio de peso
        // corporal donde el cliente solo anota reps) — antes esto reventaba renderEntreno()
        // entero (best.kg sobre null) y dejaba la pestaña Entreno en blanco. Con reps
        // mostramos el mejor número de reps en su lugar; sin ninguno de los dos, "Completado".
        let bestReps=0; (ex.sets||[]).forEach(s=>{ const r=+s.reps||0; if(r>bestReps) bestReps=r; });
        let bestSecs=0; (ex.sets||[]).forEach(s=>{ const r=parseSecs(s.secs); if(r>bestSecs) bestSecs=r; });
        meta = isTimedEx(ex) ? (bestSecs>0 ? 'máx '+fmtSecs(bestSecs) : 'Completado')
          : best ? (String(num(best.kg)).replace('.',',')+' kg × '+(parseInt(best.reps)||0)) : (bestReps>0 ? bestReps+' reps' : 'Completado'); // números: kg y reps pueden venir de la rutina que escribe el coach
        badge = `<span class="ex-collapsed-badge${isPR?' is-pr':''}">${isPR?trophySvg:checkSvg}</span>`;
        cls = meta==='Completado' ? ' is-done' : '';
      } else {
        meta = nd ? nd+'/'+n+' series' : n+(n===1?' serie':' series');
        badge = `<span class="ex-num${tag?' ss':''}" aria-hidden="true">${tag||exIdx+1}</span>`;
      }
      return `${insertBtn}<div class="ex-collapsed${done?' ex-is-done':''}" data-action="ex-expand" data-ex="${esc(ex.id)}" role="button" tabindex="0" aria-expanded="false" aria-label="Abrir ${esc(ex.name)}">
        ${badge}
        <span class="ex-collapsed-name">${tag&&done?`<span class="ss-tag">${tag}</span>`:''}${esc(ex.name)}${ex.origName?'<span class="ex-var-tag">Variante</span>':''}</span>
        <span class="ex-collapsed-best${cls}">${meta}</span>
        <span class="ex-chev" aria-hidden="true">${chevronDownSvg}</span>
      </div>`;
    }
    // Por tiempo (plancha, isométricos): segundos en vez de reps, con un cronómetro por serie.
    // El peso solo aparece si el coach lo pidió o el cliente ya lo cargó (casi siempre va sin peso).
    // En la caminata del granjero va siempre: si no, en una rutina propia no había dónde anotarlo.
    const timed = isTimedEx(ex), carry = /granjero|farmer/i.test(ex.name||"");
    const setRow = (s,i) => {
      const tg = parseSecs(s.target);
      const kgField = (carry || s.targetKg || String(s.kg||"") !== "") ? `${kgInput(ex, s)}` : '';
      return `
      <div class="set timed">
        <span class="idx${prSets.has(s.id)?' has-pr':''}">${prSets.has(s.id)?`<span class="pr-mark">${trophySvg}</span>`:''}${i+1}</span>
        ${kgField}
        <div class="field"><input class="secs" type="text" inputmode="numeric" placeholder="${tg||0}" value="${esc(s.secs||"")}" data-action="secs" data-ex="${esc(ex.id)}" data-set="${esc(s.id)}" aria-label="Segundos, serie ${i+1}"><span class="unit">seg</span></div>
        <button class="tmr" data-action="set-timer" data-ex="${esc(ex.id)}" data-set="${esc(s.id)}" aria-label="Cronómetro de la serie ${i+1}">${playSvg}<span class="tmr-t">${esc(timerText(s.id, tg))}</span></button>
        <button class="done${s.done?' on':''}" data-action="toggle" data-ex="${esc(ex.id)}" data-set="${esc(s.id)}">${s.done?checkSvg:''}</button>
        ${routineLocked()?'':`<button class="rm" data-action="removeset" data-ex="${esc(ex.id)}" data-set="${esc(s.id)}" title="Quitar serie">${xSvg}</button>`}
      </div>`;
    };
    // Si el día tiene el mismo ejercicio dos veces, cada uno va con el suyo de la vez pasada.
    const occ = exOccurrence(exs, ex);
    // Si alguna serie tiene objetivo del coach, las que no lo tienen dejan el lugar vacío:
    // así kg y reps quedan del mismo ancho en todas las filas.
    const anyGoal = ex.sets.some(s => s.target);
    const sets = timed ? ex.sets.map(setRow).join("") : ex.sets.map((s,i) => `
      <div class="set${anyGoal?' has-goal':''}">
        <span class="idx${prSets.has(s.id)?' has-pr':''}">${prSets.has(s.id)?`<span class="pr-mark">${trophySvg}</span>`:''}${i+1}</span>
        ${kgInput(ex, s)}
        <div class="field f-reps"><input class="reps" type="text" inputmode="numeric" placeholder="0" value="${esc(s.reps)}" data-action="reps" data-ex="${esc(ex.id)}" data-set="${esc(s.id)}" aria-label="Repeticiones, serie ${i+1}"><span class="unit">reps</span></div>
        ${s.target?`<span class="goal" title="Objetivo del coach: ${esc(s.target)}">${esc(s.target)}</span>`:(anyGoal?'<span class="goal goal-empty" aria-hidden="true"></span>':'')}
        <button class="done${s.done?' on':''}" data-action="toggle" data-ex="${esc(ex.id)}" data-set="${esc(s.id)}">${s.done?checkSvg:''}</button>
        ${routineLocked()?'':`<button class="rm" data-action="removeset" data-ex="${esc(ex.id)}" data-set="${esc(s.id)}" title="Quitar serie">${xSvg}</button>`}
      </div>`).join("");
    return `${insertBtn}<div class="card${ex.id===fid?' ex-focused':''}" data-ex-id="${esc(ex.id)}">
      <div class="card-head">
        <span class="ex-num${tag?' ss':''}" aria-label="Ejercicio ${tag||exIdx+1}">${tag||exIdx+1}</span>
        <input class="ex-name" type="text" value="${esc(ex.name)}" data-action="exname" data-ex="${esc(ex.id)}" ${routineLocked()||ex.origName?'readonly':''}>
        ${routineLocked()?'':`<button class="icon-mini" data-action="ex-swap" data-ex="${esc(ex.id)}" title="Cambiar ejercicio">${swapSvg}</button>
        <button class="trash" data-action="removeex" data-ex="${esc(ex.id)}" title="Eliminar ejercicio">${trashSvg}</button>`}
        <button class="icon-mini ex-chev up" data-action="ex-collapse" data-ex="${esc(ex.id)}" aria-expanded="true" aria-label="Cerrar ${esc(ex.name)}" title="Cerrar">${chevronDownSvg}</button>
      </div>
      ${(()=>{ const v=exVideo(ex); return v?`<a class="ex-video" href="${esc(v.url)}" target="_blank" rel="noopener">${playSvg} Ver video del ejercicio${v.channel?`<span class="ex-video-by">· ${esc(v.channel)}</span>`:''}</a>`:''; })()}
      ${exAudioBtn(ex)}
      ${varButton(ex)}
      ${ex.origName?`<div class="ex-var-chip" role="status"><span class="evc-t">Variante de hoy · en lugar de <b>${esc(ex.origName)}</b></span><button class="evc-back" data-action="var-back" data-ex="${esc(ex.id)}">Volver al original</button></div>`:''}
      ${(ex.rir||ex.goal)?`<div class="ex-prog">
        ${ex.rir?`<span class="ep-chip">RIR ${esc(ex.rir)}</span>`:''}
        ${ex.goal?`<span class="ep-goal">${esc(ex.goal)}</span>`:''}
      </div>`:''}
      ${renderLastSession(ex.name, ex, occ)}
      ${renderSuggestion(ex, timed, occ)}
      ${sets}
      ${ex.note?`<div class="ex-note"><span class="ex-note-t">Nota de tu coach</span>${esc(ex.note)}</div>`:''}
      ${routineLocked()?'':`<button class="add-set" data-action="addset" data-ex="${esc(ex.id)}">+ Serie</button>`}
      ${g && exIdx < g.end ? '' : restRow(ex)}
    </div>`;
  } catch(err) {
    // Ojo acá: si lo que reventó fue justo leer una propiedad de ex (ex.name, ex.id),
    // volver a leerla para armar el mensaje de error vuelve a tirar, esta vez sin nadie
    // que lo atajé. Cada lectura de ex.* en este catch va en su propio try chico.
    let safeName = "Ejercicio", safeId = "";
    try { safeName = ex && ex.name ? String(ex.name) : safeName; } catch(e2) {}
    try { safeId = ex && ex.id ? String(ex.id) : safeId; } catch(e2) {}
    console.error("renderEntreno: error al renderizar el ejercicio", safeId, safeName, err);
    return `<div class="card"><div class="card-head"><span class="ex-name" style="color:var(--red)">⚠ ${esc(safeName)} — no se pudo mostrar</span></div></div>`;
  } })())).join("");
  // Sin conexión con la cuenta: se avisa arriba, así nadie cierra sesión ni desinstala la app
  // creyendo que lo cargado ya está guardado.
  const syncWarn = (State.cloudUser && !State.cloudReady && !State.cloudLoading)
    ? '<div class="sync-warn" role="status">Todavía no se guardó en tu cuenta: lo que cargues queda en este celular y se sube solo cuando vuelva la conexión. No cierres sesión ni desinstales la app.</div>' : '';
  // Arriba, la «portada» del día (.day-head, css/screens/entreno.css): solo el nombre grande y
  // centrado, «Iniciar entrenamiento» (o el reloj con Finalizar y Cancelar), «Limpiar» abajo y el
  // tachito chico en la esquina. La barra y la cuenta de series se sacaron (pedido).
  return `
    ${syncWarn}
    ${renderBlockBanner()}
    ${routineLocked()?'<div class="coach-banner">Rutina asignada por tu coach</div>':''}
    <div class="tabs">${tabs}</div>
    <div class="day-head" data-reveal="dayhead-${esc(d.id)}">
      ${routineLocked() ? `<h2 class="day-name ${dayNameCls(d.name)}">${esc(d.name)}</h2>` : `<textarea class="day-name ${dayNameCls(d.name)}" rows="1" data-action="dayname" enterkeyhint="done" aria-label="Nombre del día">${esc(d.name)}</textarea>`}
      ${diasRow(d)}
      ${wkStarted(d) ? `<div class="wk-live"><span class="wk-dot"></span>Entrenando hace <b id="wkTime">${wkElapsedText()}</b></div>
        <div class="wk-actions"><button class="wk-finish" data-action="save-session">${checkSvg} Finalizar</button><button class="wk-cancel" data-action="wk-cancel">Cancelar</button></div>`
        : d.exercises.length ? `<button class="wk-start" data-action="wk-start">${playSvg} Iniciar entrenamiento</button>` : ''}
      <button class="clear" data-action="clear">Limpiar</button>
      ${routineLocked()?'':`<button class="day-del" data-action="delday" title="Eliminar día" aria-label="Eliminar día">${trashSvg}</button>`}
    </div>
    ${cards || (!routineLocked() && !(state.days||[]).some(x=>(x.exercises||[]).length)
      ? '<div class="empty empty-pick">Todavía no tenés rutina.<br>Elegí una rutina armada de 1 a 5 días por semana o agregá tus ejercicios acá abajo.<button class="wk-start empty-pick-btn" data-action="open-routines">Elegir una rutina armada</button></div>'
      : '<div class="empty">Día vacío.<br>' + (routineLocked()?'Tu coach todavía no te cargó ejercicios.':'Agregá ejercicios acá abajo 👇') + '</div>')}
    ${routineLocked()?'':'<button class="add-ex" data-action="ex-add-open">+ Agregar ejercicio</button>'}
    ${renderDayNotes(d)}
    ${d.exercises.length ? '<button class="save-session" data-action="save-session">'+checkSvg+' Guardar entreno de hoy</button>' : ''}
    ${routineLocked() ? '' : '<button class="load-def" data-action="open-routines">'+resetSvg+' Ver rutinas armadas</button>'}
    <p class="foot" id="syncFoot">${syncFootText()}</p>`;
}

export function renderExList(){
  const nq = norm(EntrenoState.exQuery);
  if(nq){
    const res = searchExercises(n=>norm(n).includes(nq), EX_CATS).slice(0,60);
    return res.length ? res.map(r=>`<button class="ex-pick" data-action="ex-choose" data-name="${esc(r.name)}" data-cat="${esc(r.cat)}">${esc(r.label)}</button>`).join("") : '<div class="cal-hint">Sin resultados</div>';
  }
  // «Para vos»: los ejercicios clave de su disciplina; cada uno cuenta para su grupo muscular.
  if(EntrenoState.exCat===FOR_YOU) return forYouList().map(n=>`<button class="ex-pick" data-action="ex-choose" data-name="${esc(n)}" data-cat="">${esc(n)}</button>`).join("");
  return (EX_DB[EntrenoState.exCat]||[]).map(n=>`<button class="ex-pick" data-action="ex-choose" data-name="${esc(n)}" data-cat="${esc(EntrenoState.exCat)}">${esc(n)}</button>`).join("");
}

export function renderExSheet(){
  if(!EntrenoState.exPicker) return "";
  const chips = orderedCats(EX_CATS).map(c=>`<button class="ex-chip${EntrenoState.exCat===c[0]?' on':''}${c[0]===FOR_YOU?' ex-chip-vos':''}" data-action="ex-cat" data-cat="${c[0]}">${c[1]}</button>`).join("");
  // Sin disciplina elegida: una invitación a elegirla (en Ajustes) para ver primero lo suyo.
  const discHint = myDisciplinas().length ? '' : '<button class="ex-disc-hint" data-action="ex-disc-elegir">¿CrossFit, running, powerlifting…? <b>Elegí tu disciplina</b> y te mostramos primero tus ejercicios</button>';
  return `
    <div class="sheet-bg" data-action="ex-cancel"></div>
    <div class="sheet ex-sheet">
      <div class="sheet-title">${EntrenoState.exPicker.mode==="swap"?"Cambiar ejercicio":"Elegir ejercicio"}</div>
      <div class="search-wrap"><span class="search-ic">${searchSvg}</span><input class="ex-search" id="exSearch" type="text" placeholder="Buscar ejercicio…" value="${esc(EntrenoState.exQuery)}" data-action="ex-search"></div>
      <div class="ex-chips">${chips}</div>
      ${discHint}
      <div class="ex-list" id="exList">${renderExList()}</div>
      <button class="ex-custom" data-action="ex-custom">${pencilSvg} ${EntrenoState.exPicker.mode==="swap"?"Escribir nombre propio":"Agregar con nombre propio"}</button>
      <button class="ctrl ghost" style="max-width:none;width:100%;margin-top:10px" data-action="ex-cancel">Cancelar</button>
    </div>`;
}

// «Ver variantes»: el mismo músculo con otro equipo, por si la máquina está ocupada o no está.
// No sale si no hay ninguna (ejercicio con nombre propio que no está en la lista).
const baseEx = ex => ex.origName ? { name: ex.origName, mus: ex.mus, timed: ex.timed } : ex;
function varButton(ex){
  if (!variantsFor(baseEx(ex)).list.length) return '';
  return `<button class="ex-var-btn" data-action="ex-variants" data-ex="${esc(ex.id)}">${swapSvg}<span>Ver variantes</span></button>`;
}

export function renderVarSheet(){
  const vs = EntrenoState.varSheet; if (!vs) return "";
  const raw = day().exercises.find(x => x.id === vs.exId); if (!raw) return "";
  const cur = variantOf(raw), r = variantsFor(raw);
  const item = (name, eq, tag, on) => `<button class="ex-pick var-pick${on?' on':''}" data-action="var-pick" data-ex="${esc(raw.id)}" data-name="${esc(name)}" aria-pressed="${on}">
      <span class="vp-n">${esc(name)}</span>
      <span class="vp-tags">${EQ_LABELS[eq] && eq !== "otro" ? `<span class="vp-eq">${esc(EQ_LABELS[eq])}</span>` : ''}${tag ? `<span class="vp-own">${tag}</span>` : ''}</span>
    </button>`;
  const list = item(raw.name, equipOf(raw.name), "En tu rutina", !cur) +
    r.list.map(v => item(v.name, v.eq, cur && cur.name === v.name ? "Hoy" : "", !!(cur && cur.name === v.name))).join("");
  return `
    <div class="sheet-bg" data-action="var-cancel"></div>
    <div class="sheet ex-sheet var-sheet" role="dialog" aria-label="Variantes de ${esc(raw.name)}">
      <div class="sheet-title">Variantes · ${esc(r.label)}</div>
      <p class="var-hint">Si la máquina está ocupada o no la tenés, usá una de estas. Tu rutina no cambia: es solo por hoy.</p>
      <div class="ex-list var-list">${list}</div>
      <button class="ctrl ghost" style="max-width:none;width:100%;margin-top:10px" data-action="var-cancel">Cerrar</button>
    </div>`;
}

export function exerciseIsLivePR(ex){
  const best=bestSetOf(ex.sets);
  if(!best) return false;
  const prev=bestKgBefore(ex.name, state.sessions);
  return prev!==null && num(best.kg)>prev;
}

// Explicación de voz del coach en el ejercicio (app/screens/coach/audio-ej.js).
const EX_AUDIO_RE = /^[0-9a-f-]{36}\/ex\/[A-Za-z0-9_-]{8,64}\.(webm|mp4|m4a|ogg|aac)$/;
const hpSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 14v-2a9 9 0 0 1 18 0v2"/><rect x="3" y="14" width="4" height="7" rx="1.5"/><rect x="17" y="14" width="4" height="7" rx="1.5"/></svg>';
function exAudioLabel(path, secs){
  const st = audioState("ex:" + path);
  return (st.playing ? 'Pausar' : 'Escuchar a tu coach') + ' <span class="ex-audio-t">' + (st.on && st.time > 0 ? mmss(st.time) + ' / ' : '') + mmss(secs) + '</span>';
}
// Solo si el audio es del coach que tiene hoy: la base no deja escuchar los de otro (el que venció o
// lo desvinculó) y el botón fallaba siempre con «Revisá la conexión». El audio queda en la rutina.
export function exAudioBtn(ex){
  if(!ex || !ex.audio || !EX_AUDIO_RE.test(ex.audio)) return '';
  const cid = State.cloudProfile && State.cloudProfile.coach_id;
  if(!cid || ex.audio.split('/')[0] !== String(cid)) return '';
  return '<button class="ex-audio" data-action="ex-audio" data-path="' + esc(ex.audio) + '" data-secs="' + (parseInt(ex.audioSecs) || 0) + '">' + hpSvg + ' <span class="ex-audio-l">' + exAudioLabel(ex.audio, ex.audioSecs) + '</span></button>';
}
Player.subs.add(() => {
  document.querySelectorAll('#view .ex-audio').forEach(b => {
    const l = b.querySelector('.ex-audio-l'); if(l) l.innerHTML = exAudioLabel(b.dataset.path, +b.dataset.secs);
    b.classList.toggle('on', audioState("ex:" + b.dataset.path).playing);
  });
});

// Campo de kg de una serie. En los asistidos (dominadas o fondos con contrapeso) se escribe la
// ayuda sin signo y queda guardada en negativo (ver isAssisted en utils): el "−" va fijo
// adelante, porque el teclado numérico del celular no siempre tiene el signo menos.
function kgInput(ex, s){
  const asis = isAssisted(ex.name);
  const v = asis ? String(s.kg == null ? "" : s.kg).replace(/^-/, "") : s.kg;
  return `<div class="field${asis ? ' kg-asis' : ''}">${asis ? '<span class="kg-neg" aria-hidden="true">−</span>' : ''}<input class="kg" type="text" inputmode="decimal" placeholder="0" value="${esc(v)}" data-action="kg" data-ex="${esc(ex.id)}" data-set="${esc(s.id)}"${asis ? ' aria-label="Kilos de ayuda (se anotan en negativo)"' : ''}><span class="unit">kg</span></div>`;
}
