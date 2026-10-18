import { renderExAudio } from './audio-ej.js';
import { mmss } from '../../ui/grabar.js';
import { ssGroupOf, ssGroups, ssName } from '../../core/superserie.js';
import { dropExMedia, libVideo } from '../../core/videos.js';

import { EX_CATS, EX_DB } from '../../core/data.js';
import { FOR_YOU, forYouList, orderedCats } from '../../core/disciplinas.js';

import { checkSvg, chevronDownSvg, chevronLeftSvg, chevronRightSvg, copySvg, downloadSvg, gripSvg, saveSvg, searchSvg, swapSvg, trashSvg, xSvg } from '../../core/icons.js';

import { State } from '../../core/state.js';

import { migrateNames } from '../../core/storage.js';

import { esc, exMuscle, isTimedEx, mkEx, muscleOf, num, pickMuscle, searchExercises, today, uid, withUnit } from '../../core/utils.js';

import { coachDatalist, coachLogFor, exChart, exSummary, exTable } from './clientes.js';
import { kgText, suggest } from '../../core/progresion.js';

import { renderCoach, routineDirty } from './index.js';

import { CoachState } from './state.js';

import { restLabel } from '../entreno.js';
import { blockWeek, deloadRoutineOf, deloadWeeks, weekPlanOf, weekRange } from '../../core/bloque.js';
import { parseRest } from '../../ui/restbar.js';

import { closeSheet } from '../../ui/sheet.js';
import { DIA_LARGO, DIA_LETRA, SEMANA, diasDe, diasTexto } from '../../core/diasemana.js';
import { clientPlanActions, clientPlanDirty, mealEditFoot } from './planes.js';

export function rtDays(){ return CoachState.coachTplEdit ? CoachState.coachTplEdit.days : (CoachState.coachData?CoachState.coachData.routine:null); }

export async function loadTpls(){
  CoachState.tplsError=null;
  if(!State.sb||!State.cloudUser){ CoachState.tplsError="Sin conexión a la cuenta."; return; }
  try{
    const r=await State.sb.from("routine_templates").select("*").eq("coach_id",State.cloudUser.id).order("name");
    if(r.error){ CoachState.tplsError=r.error.message||String(r.error); CoachState.coachTpls=[]; }
    else { CoachState.coachTpls=r.data||[]; CoachState.coachTpls.forEach(t=>migrateNames(t.days)); }
  }catch(e){ CoachState.tplsError=(e&&e.message)||String(e); CoachState.coachTpls=[]; console.error("tpls",e); }
}

export function planDefault(){
  return { trainDays:[], restDays:[], water:"", salt:"", guidelines:[], supps:[], options:[], extras:[], swaps:[], cardio:{text:"",items:[]}, habits:[] };
}

export function coachPlanObj(d){
  // Editando un plan guardado de «Mis planes»: el mismo editor trabaja sobre ese plan.
  if(CoachState.coachMealEdit && !CoachState.coachSel) return CoachState.coachMealEdit.plan;
  if(!CoachState.coachPlanForm){ CoachState.coachPlanForm = Object.assign(planDefault(), (d.plan && d.plan.plan) ? JSON.parse(JSON.stringify(d.plan.plan)) : {});
    // arrastrar macros globales viejos si existían
    if(d.plan){ CoachState.coachPlanForm._kcal=d.plan.kcal||""; CoachState.coachPlanForm._protein=d.plan.protein||""; CoachState.coachPlanForm._carbs=d.plan.carbs||""; CoachState.coachPlanForm._fat=d.plan.fat||""; CoachState.coachPlanForm._notes=d.plan.notes||""; }
    CoachState.coachPlanRestOpen=(CoachState.coachPlanForm.restDays||[]).length>0;
  }
  return CoachState.coachPlanForm;
}

export function mealRows(p, key){
  const rows=(p[key]||[]);
  const head='<div class="ml-head"><span>Comida</span><span>Horario</span><span>Kcal</span><span>Hidratos</span><span>Grasas</span><span>Proteína</span><span>Nota</span><span></span></div>';
  const body=rows.map((r,i)=>
    '<div class="ml-row">'+
      '<input class="ml-in wide" data-coach="pl-meal" data-key="'+key+'" data-i="'+i+'" data-k="meal" value="'+esc(r.meal||"")+'" placeholder="">'+
      '<input class="ml-in sm" data-coach="pl-meal" data-key="'+key+'" data-i="'+i+'" data-k="time" value="'+esc(r.time||"")+'" placeholder="">'+
      '<input class="ml-in n" data-coach="pl-meal" data-key="'+key+'" data-i="'+i+'" data-k="kcal" value="'+esc(r.kcal||"")+'" placeholder="">'+
      '<input class="ml-in n" data-coach="pl-meal" data-key="'+key+'" data-i="'+i+'" data-k="cho" value="'+esc(r.cho||"")+'" placeholder="">'+
      '<input class="ml-in n" data-coach="pl-meal" data-key="'+key+'" data-i="'+i+'" data-k="fat" value="'+esc(r.fat||"")+'" placeholder="">'+
      '<input class="ml-in n" data-coach="pl-meal" data-key="'+key+'" data-i="'+i+'" data-k="prot" value="'+esc(r.prot||"")+'" placeholder="">'+
      '<input class="ml-in wide" data-coach="pl-meal" data-key="'+key+'" data-i="'+i+'" data-k="note" value="'+esc(r.note||"")+'" placeholder="">'+
      '<button class="ml-del" data-coach="pl-mealdel" data-key="'+key+'" data-i="'+i+'" title="Quitar">\u2715</button>'+
    '</div>').join("");
  // fila total
  let tk=0,tc=0,tf=0,tp=0; rows.forEach(r=>{ tk+=num(r.kcal); tc+=num(r.cho); tf+=num(r.fat); tp+=num(r.prot); }); const r1=x=>String(Math.round(x*10)/10).replace(".",","); tk=Math.round(tk); tc=r1(tc); tf=r1(tf); tp=r1(tp);
  const tot='<div class="ml-tot"><span>Objetivo diario</span><span></span><span>'+tk+'</span><span>'+tc+'</span><span>'+tf+'</span><span>'+tp+'</span><span></span><span></span></div>';
  const tbl=rows.length?'<div class="ml-tablewrap">'+head+body+tot+'</div>':'';
  return tbl+'<button class="pl-add" data-coach="pl-mealadd" data-key="'+key+'">+ Agregar comida</button>';
}

export function listEditor(p, key, label, ph){
  const arr=(p[key]||[]);
  const rows=arr.map((t,i)=>'<div class="le-row"><input class="ml-in wide" data-coach="pl-list" data-key="'+key+'" data-i="'+i+'" value="'+esc(t)+'" placeholder="'+ph+'"><button class="ml-del" data-coach="pl-listdel" data-key="'+key+'" data-i="'+i+'">\u2715</button></div>').join("");
  return '<div class="co-note-lbl" style="margin-top:16px">'+label+'</div>'+rows+'<button class="pl-add" data-coach="pl-listadd" data-key="'+key+'">+ Agregar</button>';
}

// Cuadro de texto que crece con lo que tiene: la opción se lee entera, sin scrollear adentro.
export function fitOptBody(t){ if(!t) return; t.style.height="auto"; t.style.height=(t.scrollHeight+2)+"px"; }

// Opciones de comidas (Desayuno → Opción A, B, C…). Cada comida muestra sus opciones en
// tarjetas una al lado de la otra (en el celular, una debajo de la otra) y cada tarjeta
// muestra el texto completo.
export function optionsEditor(p){
  const arr=(p.options||[]);
  requestAnimationFrame(()=>document.querySelectorAll("#coachHost .opt-body").forEach(fitOptBody));
  const blocks=arr.map((sec,i)=>{
    const n=(sec.opts||[]).length;
    const opts=(sec.opts||[]).map((o,j)=>{
      const lines=String(o.body||"").split("\n").length;
      return '<div class="opt-item">'+
        '<div class="opt-item-head">'+
          '<input class="ml-in opt-label" data-coach="pl-optlabel" data-i="'+i+'" data-j="'+j+'" value="'+esc(o.label||"")+'" placeholder="Opción '+String.fromCharCode(65+j)+'">'+
          '<button class="ml-del" data-coach="pl-optdel" data-i="'+i+'" data-j="'+j+'" title="Quitar opción" aria-label="Quitar opción">\u2715</button>'+
        '</div>'+
        '<textarea class="opt-body" rows="'+Math.max(4, lines+1)+'" data-coach="pl-optbody" data-i="'+i+'" data-j="'+j+'" placeholder="Un alimento por rengl\u00f3n, por ejemplo:\n2 huevos revueltos\n1 tostada integral\n1 fruta">'+esc(o.body||"")+'</textarea>'+
      '</div>';
    }).join("");
    // Se despliega de a una comida: tocando la flecha se abre y se cierra la anterior.
    const open=CoachState.coachOptOpen===i;
    return '<div class="opt-sec'+(open?' open':'')+'">'+
      '<div class="opt-sec-head">'+
        '<button class="opt-toggle" data-coach="pl-opttoggle" data-i="'+i+'" aria-expanded="'+open+'" aria-label="'+(open?'Cerrar':'Ver')+' opciones">'+chevronDownSvg+'</button>'+
        '<input class="ml-in opt-sectitle" data-coach="pl-optsec" data-i="'+i+'" value="'+esc(sec.title||"")+'" placeholder="Desayuno, Almuerzo, Merienda…">'+
        '<button class="opt-count" data-coach="pl-opttoggle" data-i="'+i+'">'+n+' opci'+(n===1?'\u00f3n':'ones')+'</button>'+
        '<button class="ml-del" data-coach="pl-optsecdel" data-i="'+i+'" title="Borrar comida" aria-label="Borrar comida">\u2715</button>'+
      '</div>'+
      (open ? '<div class="opt-grid">'+opts+
        '<button class="opt-add-card" data-coach="pl-optadd" data-i="'+i+'">+ Agregar opci\u00f3n '+String.fromCharCode(65+n)+'</button>'+
      '</div>' : '')+
    '</div>';
  }).join("");
  return '<div class="co-note-lbl" style="margin-top:4px">Opciones de comidas (el cliente elige)</div>'+
    '<div class="pl-help">Cre\u00e1 cada <b>comida</b> (Desayuno, Almuerzo, Merienda…) y adentro sus <b>opciones</b> (A, B, C…), un alimento por rengl\u00f3n. El cliente las ve como un men\u00fa ordenado.</div>'+
    blocks+
    '<button class="pl-add" data-coach="pl-optsecadd">+ Agregar comida (Desayuno, Almuerzo\u2026)</button>';
}

// ---- Comidas en lista + detalle (Desayuno, Almuerzo…): una comida junta su horario y macros
// (fila de trainDays/restDays) con sus opciones (sección de p.options con el mismo nombre). ----
const normMeal = s => String(s||"").trim().toLowerCase();
export const mealSet = () => CoachState.coachMealDay==="rest" ? "restDays" : "trainDays";

export function mealItems(p){
  const rows=p[mealSet()]||[], secs=p.options||[], used={};
  const items=rows.map((r,i)=>{ const k=normMeal(r.meal); const j=k?secs.findIndex((s,x)=>!used[x]&&normMeal(s.title)===k):-1; if(j>=0) used[j]=1; return {row:i, sec:j}; });
  secs.forEach((s,j)=>{ if(!used[j]) items.push({row:-1, sec:j}); });
  return items;
}

// Fila de la comida elegida; si solo tenía opciones, la crea para poder cargarle horario y macros.
export function mealRowOf(p, idx){
  const it=mealItems(p)[idx]; if(!it) return null;
  const set=mealSet(); p[set]=p[set]||[];
  if(it.row<0){ p[set].push({meal:(p.options[it.sec].title)||"",time:"",kcal:"",cho:"",fat:"",prot:"",note:""}); return p[set][p[set].length-1]; }
  return p[set][it.row];
}

const r1 = x => String(Math.round(x*10)/10).replace(".",",");
export function mealTotals(p){
  let k=0,c=0,f=0,pr=0; (p[mealSet()]||[]).forEach(r=>{ k+=num(r.kcal); c+=num(r.cho); f+=num(r.fat); pr+=num(r.prot); });
  const s=(n,u,l)=>'<div class="cm-tot-i"><b>'+n+'</b><span>'+u+'</span>'+(l?'<small>'+l+'</small>':'')+'</div>';
  return '<span class="cm-tot-l">Objetivo diario</span>'+s(Math.round(k).toLocaleString("es-AR"),"kcal")+s(r1(c)+" g","","Hidratos")+s(r1(f)+" g","","Grasas")+s(r1(pr)+" g","","Proteína");
}

function mealSub(p, it){
  const sec=it.sec>=0?p.options[it.sec]:null, n=sec?(sec.opts||[]).length:0;
  const t=it.row>=0?((p[mealSet()][it.row]||{}).time||""):"";
  return (t?t+" · ":"")+(n?n+" opci"+(n===1?"ón":"ones"):"Sin cargar");
}

// Comidas que se pueden sumar con un toque. «Entre comidas» sirve para un alimento suelto (fruta, barra, licuado…).
const MEAL_PRESETS=[["Desayuno","08:00"],["Almuerzo","13:00"],["Merienda","17:00"],["Cena","21:00"],["Colación","" ],["Pre-entreno",""],["Post-entreno",""],["Entre comidas",""]];
function addMenu(p){
  if(!CoachState.coachMealMenu) return "";
  const have=new Set((p[mealSet()]||[]).map(r=>normMeal(r.meal)).concat((p.options||[]).map(s=>normMeal(s.title))));
  const chips=MEAL_PRESETS.map(([n])=>'<button class="cm-chip'+(have.has(normMeal(n))?' used':'')+'" data-coach="cm-pick" data-n="'+esc(n)+'">'+esc(n)+'</button>').join("");
  return '<div class="cm-menu">'+chips+'<button class="cm-chip other" data-coach="cm-pick" data-n="">Otra…</button></div>';
}

export function mealsStudio(p){
  const items=mealItems(p), selRaw=CoachState.coachMealSel;
  const extra = selRaw==="extras"||selRaw==="swaps";
  const sel = extra ? selRaw : Math.min(Math.max(+selRaw||0,0), Math.max(items.length-1,0));
  const day=(v,l)=>'<button class="cm-day-b'+(mealSet()===v?' on':'')+'" data-coach="cm-day" data-v="'+(v==="restDays"?"rest":"train")+'" aria-pressed="'+(mealSet()===v)+'">'+l+'</button>';
  const list=items.map((it,m)=>{
    const name=it.row>=0?(p[mealSet()][it.row].meal||""):(p.options[it.sec].title||"");
    const filled=it.sec>=0&&(p.options[it.sec].opts||[]).some(o=>String(o.body||"").trim());
    return '<button class="cm-li'+(sel===m?' on':'')+'" data-coach="cm-sel" data-m="'+m+'"><i class="cm-dot'+(filled?' ok':'')+'"></i><span class="cm-li-t"><b>'+esc(name||"Sin nombre")+'</b><small>'+esc(mealSub(p,it))+'</small></span><span class="cm-go" aria-hidden="true">›</span></button>';
  }).join("");
  const side='<aside class="cm-list">'+
    '<div class="cm-day">'+day("trainDays","Día de entreno")+day("restDays","Día de descanso")+'</div>'+
    list+'<button class="cm-add" data-coach="cm-add" aria-expanded="'+!!CoachState.coachMealMenu+'">'+(CoachState.coachMealMenu?'Cerrar':'+ Agregar comida')+'</button>'+addMenu(p)+
    '<div class="cm-sep"></div>'+
    '<button class="cm-li cm-li-x'+(selRaw==="extras"?' on':'')+'" data-coach="cm-sel" data-m="extras"><span class="cm-li-t"><b>Adicionales</b></span><span class="cm-go" aria-hidden="true">›</span></button>'+
    '<button class="cm-li cm-li-x'+(selRaw==="swaps"?' on':'')+'" data-coach="cm-sel" data-m="swaps"><span class="cm-li-t"><b>Reemplazos</b></span><span class="cm-go" aria-hidden="true">›</span></button>'+
  '</aside>';
  let det;
  if(sel==="extras") det='<div class="cm-h">Adicionales</div>'+listEditor(p,"extras","Aderezos y condimentos permitidos","");
  else if(sel==="swaps") det='<div class="cm-h">Reemplazos</div>'+swapsEditor(p);
  else if(!items.length) det='<div class="cm-empty">Todavía no cargaste comidas.<button class="cm-base" data-coach="cm-base">Cargar Desayuno, Almuerzo, Merienda y Cena</button><span>o elegí una desde <b>+ Agregar comida</b></span></div>';
  else{
    const it=items[sel], r=it.row>=0?p[mealSet()][it.row]:{meal:p.options[it.sec].title,time:"",kcal:"",cho:"",fat:"",prot:""};
    const sec=it.sec>=0?p.options[it.sec]:null, n=sec?(sec.opts||[]).length:0;
    const F=(k,l)=>'<label class="cm-f"><span>'+l+'</span><input class="ml-in" data-coach="cm-f" data-m="'+sel+'" data-k="'+k+'" value="'+esc(r[k]||"")+'" inputmode="decimal"></label>';
    const opts=sec?(sec.opts||[]).map((o,j)=>{
      const lines=String(o.body||"").split("\n").length;
      return '<div class="opt-item"><div class="opt-item-head">'+
        '<input class="ml-in opt-label" data-coach="pl-optlabel" data-i="'+it.sec+'" data-j="'+j+'" value="'+esc(o.label||"")+'" placeholder="Opción '+String.fromCharCode(65+j)+'">'+
        '<button class="ml-del" data-coach="pl-optdel" data-i="'+it.sec+'" data-j="'+j+'" title="Quitar opción" aria-label="Quitar opción">✕</button></div>'+
        '<textarea class="opt-body" rows="'+Math.max(4,lines+1)+'" data-coach="pl-optbody" data-i="'+it.sec+'" data-j="'+j+'" placeholder="Un alimento por renglón, por ejemplo:\n2 huevos revueltos\n1 tostada integral\n1 fruta">'+esc(o.body||"")+'</textarea></div>';
    }).join(""):"";
    const addB = sec ? '<button class="opt-add-card" data-coach="pl-optadd" data-i="'+it.sec+'">+ Agregar opción '+String.fromCharCode(65+n)+'</button>'
      : '<button class="opt-add-card" data-coach="cm-optnew" data-m="'+sel+'">+ Agregar opción A</button>';
    requestAnimationFrame(()=>document.querySelectorAll("#coachHost .opt-body").forEach(fitOptBody));
    det='<div class="cm-head"><input class="ml-in cm-name" data-coach="cm-f" data-m="'+sel+'" data-k="meal" value="'+esc(r.meal||"")+'" placeholder="Nombre de la comida">'+
        '<label class="cm-time"><span>Horario</span><input class="ml-in" data-coach="cm-f" data-m="'+sel+'" data-k="time" value="'+esc(r.time||"")+'" placeholder="08:00"></label></div>'+
      '<div class="cm-sub">Aporte de esta comida</div>'+
      '<div class="cm-macros">'+F("kcal","Kcal")+F("cho","Hidratos (g)")+F("fat","Grasas (g)")+F("prot","Proteína (g)")+'</div>'+
      '<div class="cm-sub">Opciones <small>El cliente elige una</small></div>'+
      '<div class="opt-grid">'+opts+addB+'</div>'+
      '<button class="cm-del" data-coach="cm-del" data-m="'+sel+'">Quitar esta comida</button>';
  }
  return '<div class="cm-tot" id="cmTot">'+mealTotals(p)+'</div>'+
    '<div class="cm-wrap">'+side+'<section class="cm-detail">'+det+'</section></div>';
}

// Cambios de la lista/detalle de comidas. true si lo manejó (el que llama redibuja).
export function mealStudioAction(a, b, p){
  const set=mealSet(), m=+b.dataset.m;
  if(a==="cm-sel"){
    if(b.dataset.m==="extras"||b.dataset.m==="swaps"){ CoachState.coachMealSel=b.dataset.m; return true; }
    // Una comida que solo tenía opciones gana su fila de horario/macros al elegirla: el orden de la lista no se mueve al escribir.
    const it=mealItems(p)[m]; let i=m;
    if(it && it.row<0){ mealRowOf(p,m); i=mealItems(p).findIndex(x=>x.sec===it.sec); }
    CoachState.coachMealSel=i; return true;
  }
  if(a==="cm-day"){ CoachState.coachMealDay=b.dataset.v==="rest"?"rest":"train"; CoachState.coachMealSel=0; return true; }
  const addMeal=(nm,time)=>{ p[set]=p[set]||[]; p.options=p.options||[]; if(!nm) nm="Comida "+(p[set].length+1); p[set].push({meal:nm,time:time||"",kcal:"",cho:"",fat:"",prot:"",note:""}); if(!p.options.some(s=>normMeal(s.title)===normMeal(nm))) p.options.push({title:nm,opts:[{label:"Opción A",body:""}]}); return p[set].length-1; };
  if(a==="cm-add"){ CoachState.coachMealMenu=!CoachState.coachMealMenu; return true; }
  if(a==="cm-pick"){ const n=b.dataset.n||"", pr=MEAL_PRESETS.find(x=>x[0]===n); const ri=addMeal(n, pr?pr[1]:""); CoachState.coachMealMenu=false; CoachState.coachMealSel=mealItems(p).findIndex(it=>it.row===ri); return true; }
  if(a==="cm-base"){ let ri=0; MEAL_PRESETS.slice(0,4).forEach(([n,t],i)=>{ const x=addMeal(n,t); if(!i) ri=x; }); CoachState.coachMealSel=mealItems(p).findIndex(it=>it.row===ri); return true; }
  if(a==="cm-optnew"){ const it=mealItems(p)[m]; if(!it) return true; const r=p[set][it.row]; p.options=p.options||[]; p.options.push({title:(r&&r.meal)||"",opts:[{label:"Opción A",body:""}]}); return true; }
  if(a==="cm-del"){
    const it=mealItems(p)[m]; if(!it) return true; if(!confirm("¿Quitar esta comida con sus opciones?")) return false;
    const other=set==="trainDays"?"restDays":"trainDays";
    const nm=it.row>=0?normMeal(p[set][it.row].meal):"";
    if(it.row>=0) p[set].splice(it.row,1);
    if(it.sec>=0 && !(nm && (p[other]||[]).some(r=>normMeal(r.meal)===nm))) p.options.splice(it.sec,1);
    CoachState.coachMealSel=0; return true;
  }
  return false;
}

// Escribe un campo del detalle (nombre, horario, macros). El nombre se copia a las opciones
// para que sigan unidas a la comida.
export function mealStudioInput(el, p){
  const m=+el.dataset.m, k=el.dataset.k, it=mealItems(p)[m]; if(!it) return;
  const r=mealRowOf(p, m); if(!r) return;
  if(k==="meal" && it.sec>=0) p.options[it.sec].title=el.value;
  r[k]=el.value;
  const t=document.getElementById("cmTot"); if(t) t.innerHTML=mealTotals(p);
  const li=document.querySelector('#coachHost .cm-li[data-m="'+m+'"]');
  if(li){ const b=li.querySelector("b"); if(b&&k==="meal") b.textContent=el.value||"Sin nombre"; const s=li.querySelector("small"); if(s) s.textContent=mealSub(p, mealItems(p)[m]||it); }
}

export function swapsEditor(p){
  const arr=(p.swaps||[]);
  const rows=arr.map((sw,i)=>'<div class="sw-row"><input class="ml-in wide" data-coach="pl-swap" data-i="'+i+'" data-k="from" value="'+esc(sw.from||"")+'" placeholder=""><span class="sw-arrow">\u2192</span><input class="ml-in wide" data-coach="pl-swap" data-i="'+i+'" data-k="to" value="'+esc(sw.to||"")+'" placeholder=""><button class="ml-del" data-coach="pl-swapdel" data-i="'+i+'">\u2715</button></div>').join("");
  return '<div class="co-note-lbl" style="margin-top:16px">Reemplazos (equivalencias)</div>'+rows+'<button class="pl-add" data-coach="pl-swapadd">+ Agregar reemplazo</button>';
}

export function cardioItemsEditor(p){
  const arr=(p.cardio&&p.cardio.items)?p.cardio.items:[];
  const rows=arr.map((t,i)=>'<div class="le-row"><input class="ml-in wide" data-coach="pl-cardioitem" data-i="'+i+'" value="'+esc(t)+'" placeholder=""><button class="ml-del" data-coach="pl-cardioitemdel" data-i="'+i+'">\u2715</button></div>').join("");
  return '<div class="co-note-lbl" style="margin-top:10px">Sesiones puntuales (opcional)</div>'+rows+'<button class="pl-add" data-coach="pl-cardioitemadd">+ Agregar sesión</button>';
}

// Cada hábito con sus días (p.habitDays, alineado con p.habits; vacío = todos los días). El
// alumno puede cambiarlos y ponerles hora en Hábitos (el coach no elige horas).
const HD_WEEK=[[1,"L"],[2,"M"],[3,"M"],[4,"J"],[5,"V"],[6,"S"],[0,"D"]];
const HD_NAME=["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
export function habitsEditor(p){
  const arr=Array.isArray(p.habits)?p.habits:[];
  const hd=Array.isArray(p.habitDays)?p.habitDays:[];
  const rows=arr.map((t,i)=>{
    const d=Array.isArray(hd[i])?hd[i]:[], all=!d.length||d.length===7;
    const days=HD_WEEK.map(([n,l])=>'<button class="hd-day'+(!all&&d.includes(n)?' on':'')+'" data-coach="pl-habitday" data-i="'+i+'" data-d="'+n+'" aria-label="'+HD_NAME[n]+'" aria-pressed="'+(!all&&d.includes(n))+'">'+l+'</button>').join("");
    return '<div class="le-row"><input class="ml-in wide" data-coach="pl-habit" data-i="'+i+'" value="'+esc(t)+'" placeholder=""><button class="ml-del" data-coach="pl-habitdel" data-i="'+i+'">\u2715</button></div>'+
      '<div class="hd-row"><button class="hd-all'+(all?' on':'')+'" data-coach="pl-habitall" data-i="'+i+'" aria-pressed="'+all+'">Todos los días</button>'+days+'</div>';
  }).join("");
  return rows+'<button class="pl-add" data-coach="pl-habitadd">+ Agregar hábito</button>'+
    (arr.length?'<div class="pl-note">Los días dicen cuándo le aparece cada hábito al alumno. La hora del aviso la elige él en Hábitos.</div>':'');
}

// Plan nutricional en secciones, como la ficha del alumno: un menú de tarjetas y cada una
// abre su editor. Lo que se va cargando queda en CoachState.coachPlanForm aunque se cambie de
// sección, y se guarda todo junto con «Guardar plan nutricional».
export function renderCoachPlan(d){
  const p = coachPlanObj(d);
  const card=(title, body, extra)=>'<div class="ci-card plan-edit"><div class="pl-sub-row"><div class="pl-sub">'+title+'</div>'+(extra||"")+'</div>'+body+'</div>';
  const tot=k=>{ let t=0; (p[k]||[]).forEach(r=>{ t+=num(r.kcal); }); return Math.round(t); };
  const meals=k=>{ const n=(p[k]||[]).length, t=tot(k); return n ? n+" comida"+(n===1?"":"s")+(t?" · "+t+" kcal":"") : "Sin cargar"; };
  const cnt=(n,one,many)=>n+" "+(n===1?one:many);
  // Títulos cortos: en 320 px «entrenamiento» o «Personalización» no entraban en media tarjeta
  // y empujaban la grilla afuera del borde.
  const SECS=[
    ["comidas","Comidas", ()=>mealsStudio(p), ()=>{ const n=mealItems(p).length, t=tot(mealSet()); return n ? n+" comida"+(n===1?"":"s")+(t?" · "+t+" kcal":"") : "Sin cargar"; }],
    ["agua","Hidratación", ()=>card("Hidratación",
      '<div class="ci-grid-2">'+
        '<div class="ci-f"><label>Agua por día (litros)</label><input class="co-note" data-coach="pl-water" value="'+esc(p.water||"")+'" placeholder=""></div>'+
        '<div class="ci-f"><label>Sal por día (g)</label><input class="co-note" data-coach="pl-salt" value="'+esc(p.salt||"")+'" placeholder=""></div>'+
      '</div>'), ()=>[p.water?withUnit(p.water,"L de agua"):"", p.salt?withUnit(p.salt,"g de sal"):""].filter(Boolean).join(" · ")||"Sin cargar"],
    // Pautas, suplementos y cardio: el alumno los sigue viendo (Comida → Pautas y Cardio → «Tu cardio
    // de esta semana»); sin estas tarjetas el coach no los podía cargar, cambiar ni borrar.
    ["ind","Indicaciones", ()=>card("Indicaciones",
      '<div class="ci-grid-2">'+
        '<div>'+listEditor(p,"guidelines","Pautas nutricionales","")+'</div>'+
        '<div>'+listEditor(p,"supps","Suplementos recomendados","")+'</div>'+
      '</div>'), ()=>{ const g=(p.guidelines||[]).length, sp=(p.supps||[]).length; return g||sp ? [g?cnt(g,"pauta","pautas"):"", sp?cnt(sp,"suplemento","suplementos"):""].filter(Boolean).join(" · ") : "Sin cargar"; }],
    ["cardio","Cardio", ()=>card("Cardio indicado",
      '<div class="co-note-wrap" style="margin-top:0"><span class="co-note-lbl">Indicación general de cardio</span><input class="co-note" data-coach="pl-cardiotext" value="'+esc((p.cardio&&p.cardio.text)||"")+'" placeholder=""></div>'+
      cardioItemsEditor(p)), ()=>(p.cardio&&p.cardio.text)||((p.cardio&&p.cardio.items||[]).length?cnt(p.cardio.items.length,"sesión","sesiones"):"Sin cargar")],
  ];
  // En «Mis planes» se guarda el plan guardado (planes.js); en el cliente, su plan.
  const tpl=!!(CoachState.coachMealEdit && !CoachState.coachSel);
  const save=tpl ? mealEditFoot() : (clientPlanDirty()?'<div class="co-unsaved">Cambios sin guardar. Tocá <b>Guardar plan nutricional</b>.</div>':'')+'<button class="co-save-rt" data-coach="plan-save">Guardar plan nutricional</button>';
  const cur=SECS.find(x=>x[0]===CoachState.coachPlanSec);
  if(cur){
    return '<div class="form-head co-sec-head"><button class="form-back" data-coach="plsec-close" aria-label="Volver al plan">‹</button><div class="form-title">'+cur[1]+'</div></div>'+cur[2]()+save;
  }
  return '<div class="co-page-title">Plan nutricional</div>'+
    '<div class="ptiles co-ptiles">'+SECS.map(x=>'<button class="ptile" data-coach="plsec-open" data-v="'+x[0]+'"><span class="ptile-t">'+x[1]+'</span><span class="ptile-s">'+esc(String(x[3]()))+'</span><span class="ptile-go" aria-hidden="true">›</span></button>').join("")+'</div>'+
    save+(tpl ? '' : clientPlanActions());
}

// Hábitos diarios del alumno (van en su Ficha; se guardan con el plan nutricional, que es donde viven los datos).
export function renderCoachHabits(d){
  const p=coachPlanObj(d);
  return '<div class="ci-card plan-edit"><div class="pl-sub-row"><div class="pl-sub">Checklist del cliente</div></div>'+habitsEditor(p)+'</div>'+
    (clientPlanDirty()?'<div class="co-unsaved">Cambios sin guardar. Tocá <b>Guardar hábitos</b>.</div>':'')+
    '<button class="co-save-rt" data-coach="plan-save">Guardar hábitos</button>';
}

export function renderCoachBlock(d){
  const b = CoachState.coachBlockForm || d.block || {};
  const F=(k,lbl,ph,type)=>'<div class="ci-f"><label>'+lbl+'</label><input class="co-note" data-coach="blk-'+k+'" value="'+esc(b[k]==null?"":String(b[k]))+'" placeholder="'+ph+'"'+(type?' type="'+type+'"':'')+'></div>';
  return '<div class="ci-grid">'+
      F("name","Nombre del bloque","")+F("start_date","Inicio (lunes)","",'date')+
      F("weeks","Semanas","","numeric")+F("phase","Fase","")+
    '</div>'+
    F("calories","Estrategia cal\u00f3rica","")+
    F("notes","Nota del bloque (la ve el cliente)","")+
    '<div id="bwWrap">'+weeksHtml(d)+'</div>'+
    '<button class="co-save-rt" data-coach="blk-save">Guardar bloque</button>';
}

// Grilla de semanas, leyenda, panel de la semana elegida y aviso de cambios sin guardar. Va
// aparte para redibujarla sola al escribir las semanas o la fecha de inicio (refreshBlockWeeks).
function weeksHtml(d){
  const b = CoachState.coachBlockForm || d.block || {};
  const wks = Math.max(1, Math.min(52, parseInt(b.weeks)||8));
  const dls = deloadWeeks(b);
  const cur = b.start_date ? blockWeek(b, today()) : 0;
  const selW = CoachState.coachWeekSel;
  let grid="";
  for(let w=1; w<=wks; w++){
    const on=dls.indexOf(w)>=0, rt=on && !!deloadRoutineOf(b, w, savedStart(d));
    const wp=weekPlanOf(b, w), hasNote=!!(wp.goal||wp.note);
    const lbl='Semana '+w+(on?', de descarga':'')+(rt?', con rutina de descarga':'')+(w===cur?', semana actual':'');
    grid+='<button class="bw'+(on?' dl':'')+(w===cur?' now':'')+(selW===w?' sel':'')+(hasNote?' has-note':'')+'" data-coach="blk-week" data-w="'+w+'" aria-pressed="'+on+'" aria-label="'+lbl+'">'+w+
      (rt?'<span class="bw-ok" aria-hidden="true">'+checkSvg+'</span>':'')+'</button>';
  }
  // Lista de las semanas de descarga: cada una abre su panel (para armar o editar su rutina).
  const list=dls.filter(w=>w<=wks).map(w=>{
    const rt=!!deloadRoutineOf(b, w, savedStart(d)), rg=weekRange(b, w);
    return '<button class="bw-row'+(selW===w?' on':'')+'" data-coach="wk-open" data-w="'+w+'" aria-expanded="'+(selW===w)+'">'+
      '<span class="bw-row-t">Semana '+w+(w===cur?' \u00b7 actual':'')+(rg?'<small>'+esc(fmtDia(rg[0]))+' al '+esc(fmtDia(rg[1]))+'</small>':'')+'</span>'+
      '<span class="bw-row-s'+(rt?' ok':'')+'">'+(rt?checkSvg+' Rutina lista':'Sin rutina')+'</span>'+
      '<span class="bw-row-go" aria-hidden="true">'+(selW===w?chevronDownSvg:chevronRightSvg)+'</span></button>'+
      (selW===w ? weekPanel(b, w, cur, d) : '');
  }).join("");
  return '<div class="co-note-lbl" style="margin-top:14px">Semanas de descarga \u2014 toc\u00e1 una semana para marcarla o desmarcarla'+(cur&&cur<=wks?' \u00b7 el cliente est\u00e1 en la semana '+cur:'')+'</div>'+
    '<div class="bw-grid">'+grid+'</div>'+
    '<div class="bw-legend"><span><i class="bw-k dl"></i>Descarga</span><span><i class="bw-k ok">'+checkSvg+'</i>Con rutina de descarga</span>'+(cur&&cur<=wks?'<span><i class="bw-k now"></i>Semana actual</span>':'')+'</div>'+
    (list ? '<div class="bw-list">'+list+'</div>' : '')+
    // Una semana normal abierta desde su panel (después de tocar "Quitar descarga").
    (selW!==null && selW>=1 && selW<=wks && dls.indexOf(selW)<0 ? weekPanel(b, selW, cur, d) : '')+
    (CoachState.coachBlockForm?'<div class="blk-dirty">Ten\u00e9s cambios sin guardar: toc\u00e1 <b>Guardar bloque</b>.</div>':'');
}
// Fecha de inicio guardada (las rutinas de descarga armadas con ella siguen valiendo hasta guardar).
const savedStart = d => (d && d.block && d.block.start_date) || null;
export function refreshBlockWeeks(){
  const host=document.getElementById("bwWrap");
  if(host && CoachState.coachData) host.innerHTML=weeksHtml(CoachState.coachData);
}

// Panel de la semana elegida: descarga sí/no, su rutina de descarga y lo que ve el alumno.
function weekPanel(b, w, cur, d){
  const isDl=deloadWeeks(b).indexOf(w)>=0;
  const wp=weekPlanOf(b, w);
  const rg=weekRange(b, w);
  const when=rg ? ' · del '+fmtDia(rg[0])+' al '+fmtDia(rg[1]) : '';
  const rt=isDl ? deloadRoutineOf(b, w, savedStart(d)) : null;
  let dlBox='';
  if(isDl){
    if(rt){
      const nd=rt.days.length, nex=rt.days.reduce((n,x)=>n+((x.exercises||[]).length),0), ns=rt.days.reduce((n,x)=>n+(x.exercises||[]).reduce((m,e)=>m+((e.sets||[]).length),0),0);
      dlBox='<div class="wk-rt on"><div class="wk-rt-t">'+checkSvg+' Rutina de descarga lista</div>'+
        '<div class="wk-rt-s">'+nd+' día'+(nd===1?'':'s')+' · '+nex+' ejercicio'+(nex===1?'':'s')+' · '+ns+' serie'+(ns===1?'':'s')+'. El alumno la usa solo esta semana; el lunes siguiente vuelve sola su rutina de siempre.</div>'+
        '<div class="wk-rt-a"><button class="co-save-rt" data-coach="dl-edit" data-w="'+w+'">Editar rutina de descarga</button>'+
        '<button class="co-copy-btn" data-coach="dl-del" data-w="'+w+'">'+trashSvg+' Borrar</button></div></div>';
    } else {
      const has=!!(d.routine&&d.routine.length);
      dlBox='<div class="wk-rt"><div class="wk-rt-t">Planificá la semana de descarga</div>'+
        '<div class="wk-rt-s">Armale una rutina para esta semana: el alumno la usa solo esos 7 días y el lunes siguiente vuelve sola su rutina de siempre, con los pesos que tenía cargados.</div>'+
        '<div class="wk-rt-a">'+(has?'<button class="co-save-rt" data-coach="dl-new" data-w="'+w+'" data-from="rutina">Armar desde su rutina (mitad de series)</button>':'')+
        '<button class="co-copy-btn" data-coach="dl-new" data-w="'+w+'" data-from="cero">Empezar de cero</button></div></div>';
    }
  }
  return '<div class="week-editor">'+
    '<div class="week-ed-head"><span>Semana '+w+(cur===w?' · semana actual':'')+esc(when)+'</span>'+
      '<button class="co-copy-btn" style="margin-left:auto" data-coach="wk-close" aria-label="Cerrar la semana '+w+'">'+xSvg+'</button></div>'+
    '<div class="wk-dl-row">'+(isDl
      ? '<span class="wk-dl-tag">Semana de descarga</span><button class="co-copy-btn" data-coach="wk-dl" data-w="'+w+'">Quitar descarga</button>'
      : '<span class="wk-dl-off">Semana normal</span><button class="co-copy-btn" data-coach="wk-dl" data-w="'+w+'">Marcar como descarga</button>')+'</div>'+
    dlBox+
    '<div class="ci-f" style="margin-top:12px"><label>Objetivo de la semana (lo ve el alumno)</label><input class="co-note" data-coach="wk-goal" data-w="'+w+'" maxlength="300" value="'+esc(wp.goal||'')+'"></div>'+
    '<div class="ci-f" style="margin-top:8px"><label>Indicaciones para el alumno</label><input class="co-note" data-coach="wk-note" data-w="'+w+'" maxlength="1000" value="'+esc(wp.note||'')+'"></div>'+
  '</div>';
}

export function applyPickerMarkup(){
  const st=CoachState.coachApplyPicker;
  if(!st.tplId){
    // paso 1: elegir plantilla
    let opts;
    if(st.loading){ opts='<div class="cal-hint">Cargando tus rutinas…</div>'; }
    else if(CoachState.tplsError){ opts='<div class="cal-hint" style="color:var(--red)">No se pudieron cargar las rutinas.<br><br><b>'+esc(CoachState.tplsError)+'</b><br><br>Si dice que la tabla no existe, falta correr el SQL de rutinas en Supabase.</div>'; }
    else if(!CoachState.coachTpls.length){ opts='<div class="cal-hint">Todavía no tenés rutinas guardadas.<br>Volvé al panel principal → pestaña “Mis rutinas” → creá una o importá el Microciclo 8.</div>'; }
    else { opts=CoachState.coachTpls.map(t=>{
      const nd=(t.days||[]).length;
      return '<div class="cp-copt" data-coach="ap-tpl" data-id="'+esc(t.id)+'">'+esc(t.name)+'<span class="ap-meta">'+nd+' día'+(nd===1?'':'s')+'</span></div>';
    }).join(""); }
    return '<div class="cp-title">Aplicar una rutina</div>'+
      '<div class="cp-sub">Elegí cuál de tus rutinas querés usar para este cliente.</div>'+
      '<div class="cp-clist">'+opts+'</div>'+
      '<button class="logout-btn" data-coach="ap-cancel">Cancelar</button>';
  }
  // paso 2: elegir días
  const tpl=CoachState.coachTpls.find(t=>t.id===st.tplId); if(!tpl){ CoachState.coachApplyPicker=null; return null; }
  const days=(tpl.days||[]);
  const sel=st.days||{};
  const rows=days.map((d,i)=>{
    const on=sel[i]!==false;
    const nex=(d.exercises||[]).length;
    return '<div class="ap-day'+(on?' on':'')+'" data-coach="ap-day" data-i="'+i+'">'+
      '<span class="ap-chk">'+(on?'\u2713':'')+'</span>'+
      '<span class="ap-dname">'+esc(d.name||('Día '+(i+1)))+'</span>'+
      '<span class="ap-meta">'+(diasTexto(d)?esc(diasTexto(d))+' \u00b7 ':'')+nex+' ej.</span></div>';
  }).join("");
  const nSel=days.filter((d,i)=>sel[i]!==false).length;
  return '<div class="cp-title">'+esc(tpl.name)+'</div>'+
    '<div class="cp-sub">Destildá los días que no quieras aplicar.</div>'+
    '<div class="ap-days">'+rows+'</div>'+
    '<div class="ap-mode"><label class="ap-radio'+(st.mode!=="add"?" on":"")+'" data-coach="ap-mode" data-m="replace">Reemplazar la rutina actual</label>'+
    '<label class="ap-radio'+(st.mode==="add"?" on":"")+'" data-coach="ap-mode" data-m="add">Agregar a la rutina actual</label></div>'+
    '<button class="co-save-rt" data-coach="ap-confirm">Aplicar '+nSel+' día'+(nSel===1?'':'s')+'</button>'+
    '<button class="logout-btn" style="margin-top:8px" data-coach="ap-back">‹ Elegir otra rutina</button>';
}

// "Copiar a otro cliente": elegir a qué alumno se le pasa la rutina que se está viendo.
export function copyPickerMarkup(){
  const others=CoachState.coachClients.filter(c=>c.id!==CoachState.coachSel);
  const busy=CoachState.coachCopyPicker && CoachState.coachCopyPicker.loading;
  const opts=others.length
    ? others.map(c=>'<div class="cp-copt" data-coach="cpy-to" data-id="'+esc(c.id)+'">'+esc(c.full_name||c.email||"Cliente")+'</div>').join("")
    : '<div class="cal-hint">No tenés otros clientes vinculados.</div>';
  return '<div class="cp-title">Copiar a otro cliente</div>'+
    '<div class="cp-sub">'+(busy?'Copiando…':'Elegí a quién le pasás esta rutina. Reemplaza la rutina que tenga ese cliente; los pesos y repeticiones cargados no se copian.')+'</div>'+
    '<div class="cp-clist">'+opts+'</div>'+
    '<button class="logout-btn" data-coach="cpy-cancel">Cancelar</button>';
}

export function renderCopyPicker(){
  let el=document.getElementById("applyMount");
  if(!el){ el=document.createElement("div"); el.id="applyMount"; document.body.appendChild(el); }
  if(!CoachState.coachCopyPicker){ el.innerHTML=""; return; }
  const existing = el.querySelector(".cp-ccard");
  if(existing){ existing.innerHTML = copyPickerMarkup(); return; }
  el.innerHTML='<div class="cp-bg" data-coach="cpy-cancel"></div><div class="cp-ccard">'+copyPickerMarkup()+'</div>';
}

export function renderApplyPicker(){
  let el=document.getElementById("applyMount");
  if(!el){ el=document.createElement("div"); el.id="applyMount"; document.body.appendChild(el); }
  if(!CoachState.coachApplyPicker){ el.innerHTML=""; return; }
  const markup = applyPickerMarkup();
  if(markup===null){ el.innerHTML=""; return; }
  const existing = el.querySelector(".cp-ccard");
  if(existing){ existing.innerHTML = markup; return; }
  el.innerHTML='<div class="cp-bg" data-coach="ap-cancel"></div><div class="cp-ccard">'+markup+'</div>';
}

// «+ Programar una rutina nueva»: desde qué arranca la rutina programada. Arriba, las rutinas
// guardadas del coach (como en «Mis rutinas»: días y ejercicios); abajo, copiar la rutina que
// tiene ahora el alumno o empezar vacía.
export function schedPickerMarkup(){
  const st=CoachState.coachSchedPicker||{};
  const cur=(CoachState.coachData&&CoachState.coachData.routine)||[];
  let opts;
  if(st.loading){ opts='<div class="cal-hint">Cargando tus rutinas…</div>'; }
  else if(CoachState.tplsError){ opts='<div class="cal-hint" style="color:var(--red)">No se pudieron cargar tus rutinas: <b>'+esc(CoachState.tplsError)+'</b></div>'; }
  else if(!CoachState.coachTpls.length){ opts='<div class="cal-hint sp-empty">Todavía no tenés rutinas guardadas. Las creás en «Mis rutinas» y después las elegís acá sin cargarlas de nuevo.</div>'; }
  else { opts='<div class="cp-clist sp-list">'+CoachState.coachTpls.map(t=>{
    const nd=(t.days||[]).length, nex=(t.days||[]).reduce((n,d)=>n+((d.exercises||[]).length),0);
    return '<div class="cp-copt" data-coach="sp-tpl" data-id="'+esc(t.id)+'"><span class="sp-name">'+esc(t.name||"Sin nombre")+'</span><span class="ap-meta">'+nd+' día'+(nd===1?'':'s')+' · '+nex+' ej.</span></div>';
  }).join("")+'</div>'; }
  const nd=cur.length;
  return '<div class="cp-title">Programar una rutina nueva</div>'+
    '<div class="cp-sub">Elegí desde qué la armás. Después la podés cambiar y elegir la fecha antes de guardarla.</div>'+
    '<div class="sp-sec">Empezar desde una de mis rutinas</div>'+opts+
    '<div class="sp-sec">O también</div>'+
    '<div class="cp-clist">'+
      (nd ? '<div class="cp-copt" data-coach="sp-copy"><span class="sp-name">Copiar la rutina actual</span><span class="ap-meta">'+nd+' día'+(nd===1?'':'s')+'</span></div>' : '')+
      '<div class="cp-copt" data-coach="sp-empty"><span class="sp-name">Empezar vacía</span></div>'+
    '</div>'+
    '<button class="logout-btn" data-coach="sp-cancel">Cancelar</button>';
}

export function renderSchedPicker(){
  let el=document.getElementById("applyMount");
  if(!el){ el=document.createElement("div"); el.id="applyMount"; document.body.appendChild(el); }
  if(!CoachState.coachSchedPicker){ el.innerHTML=""; return; }
  const existing = el.querySelector(".cp-ccard");
  if(existing){ existing.innerHTML = schedPickerMarkup(); return; }
  el.innerHTML='<div class="cp-bg" data-coach="sp-cancel"></div><div class="cp-ccard">'+schedPickerMarkup()+'</div>';
}

// Un color estable por grupo muscular (swatch de la card de ejercicio): hashea el nombre
// del grupo a una paleta fija.
const EX_SWATCH_COLORS=["var(--blue)","var(--purple)","var(--pink)","var(--cyan)","var(--green-2)"];
function exSwatchColor(ex){
  const mus=exMuscle(ex)||"otros";
  let h=0; for(let i=0;i<mus.length;i++) h=(h*31+mus.charCodeAt(i))>>>0;
  return EX_SWATCH_COLORS[h%EX_SWATCH_COLORS.length];
}

function rirRestSummary(ex){
  // El descanso como lo toma la app del cliente (parseRest: "3" son 3 minutos, "90" son
  // 90 segundos); los rangos escritos a mano ("2'-3'") se muestran tal cual.
  const bits=[]; if(ex.rir) bits.push("RIR "+ex.rir);
  if(ex.rest){ const t=String(ex.rest).trim(), sec=parseRest(t); bits.push("desc. "+(/^\d+\s*(s|seg|segundos|min|minutos)?$/i.test(t) && sec ? restLabel(sec) : t)); }
  return bits.join(" \u00b7 ");
}

// Sin link propio, el cliente ve el Short de la biblioteca de GIZE (si hay uno para ese
// ejercicio): se le avisa al coach cuál es y que pegando el suyo lo reemplaza.
function libVideoHint(ex){
  if(ex.video) return '';
  const v=libVideo(ex.name); if(!v) return '';
  return '<div class="co-vid-lib">El cliente ve el video que eligió GIZE'+(v.channel?' (canal '+esc(v.channel)+')':'')+'. <a href="'+esc(v.url)+'" target="_blank" rel="noopener">Verlo</a> \u00b7 Peg\u00e1 tu link para reemplazarlo.</div>';
}

// Tarjeta de un ejercicio en el editor de rutina del coach. Pensada para el celular:
// cerrada muestra el nombre completo (hasta 2 renglones) y las series; abierta, la
// configuración del ejercicio en la misma tarjeta, que crece hacia abajo en su casillero
// de la grilla (no ocupa toda la fila) y con los mismos tamaños que cerrada.
function exerciseCard(d, day, ex, i, rt){
  const open=CoachState.coachExpandedEx.has(ex.id);
  const nSets=(ex.sets||[]).length;
  const swatch='<span class="co-exc-swatch" style="background:'+exSwatchColor(ex)+'"></span>';
  const timed=isTimedEx(ex);
  const badge='<span class="co-exc-badge">'+nSets+' serie'+(nSets===1?'':'s')+(timed?' · por tiempo':'')+'</span>';
  const rirTxt=rirRestSummary(ex);
  // Flecha para abrir y cerrar: el mismo botón en el mismo lugar (arriba a la derecha) en las
  // dos formas de la tarjeta; cerrada apunta abajo y abierta, arriba.
  const chevron='<button type="button" class="co-exc-chev'+(open?' open':'')+'" data-coach="rt-toggle" data-i="'+i+'" data-id="'+esc(ex.id)+'" aria-expanded="'+open+'" aria-label="'+(open?'Cerrar':'Abrir')+' ejercicio" title="'+(open?'Cerrar':'Abrir')+' ejercicio">'+chevronDownSvg+'</button>';
  // El número de orden sale solo de la posición en el día (1, 2, 3…): al subir, bajar o
  // agregar ejercicios se reacomoda sin que el coach lo cargue a mano.
  // En superserie lleva la letra y la posición (A1, A2…) y un filete de color al costado.
  const g=ssGroupOf(day.exercises||[], i), tag=g ? g.letter+(i-g.start+1) : '';
  const ord='<span class="co-exc-ord'+(g?' ss':'')+'">'+(tag||(i+1))+'</span>';
  const ssCls=g ? ' co-ss'+(i===g.start?' co-ss-first':'')+(i===g.end?' co-ss-last':'') : '';

  if(!open){
    // Tarjeta compacta: número, nombre, puntitos (uno por serie) y contador de series con
    // − / + para cargar series sin abrirla. Tocarla en cualquier otro lado la abre.
    const dots='<span class="co-exc-dots" aria-hidden="true">'+Array.from({length:Math.min(nSets,8)},()=>'<i></i>').join('')+'</span>';
    const stepper='<span class="co-exc-step">'+
        '<button type="button" data-coach="rt-setdel" data-i="'+i+'" data-j="'+(nSets-1)+'" aria-label="Una serie menos"'+(nSets<=1?' disabled':'')+'>−</button>'+
        '<b>'+nSets+' serie'+(nSets===1?'':'s')+'</b>'+
        '<button type="button" data-coach="rt-setadd" data-i="'+i+'" aria-label="Una serie más">+</button>'+
      '</span>';
    // Resumen a la derecha: «3 series · 8-10» (el objetivo de la primera serie; en el celular, solo las series).
    const tg=String(((ex.sets||[])[0]||{}).target||"").trim();
    const sum='<span class="co-exc-sum">'+nSets+' serie'+(nSets===1?'':'s')+(tg?'<span class="tg"> · '+esc(tg)+'</span>':'')+'</span>';
    return '<div class="co-exc co-exc-collapsed'+ssCls+'" data-coach="rt-toggle" data-i="'+i+'" data-id="'+esc(ex.id)+'">'+
        swatch+
        '<div class="co-exc-head"><div class="co-exc-cname">'+ord+'<span class="co-exc-ctext">'+esc(ex.name||"Sin nombre")+'</span></div>'+sum+chevron+'</div>'+
        '<div class="co-exc-cfoot">'+stepper+
          '<button class="co-exc-icon-btn" data-coach="rt-swap" data-i="'+i+'" title="Cambiar ejercicio" aria-label="Cambiar ejercicio">'+swapSvg+'</button>'+
        '</div>'+
      '</div>';
  }

  const act=(a, icon, label, extra)=>'<button class="co-pop-item'+(extra||"")+'" data-coach="'+a+'" data-i="'+i+'"'+
    ((a==="rt-up"&&i===0)||(a==="rt-down"&&i===(day.exercises||[]).length-1)?' disabled':'')+'>'+icon+'<span>'+label+'</span></button>';
  const up='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
  const down='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>';
  const plus='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
  const linked=!!ex.ss, isLast=i===(day.exercises||[]).length-1;
  // Subir, bajar, cambiar, duplicar, insertar, superserie y quitar: en el menú "⋯" de la cabecera.
  // «Quitar ejercicio» va último, separado y en rojo; el menú no se recorta (ver «Menús ⋯» más abajo).
  const menu='<details class="co-day-menu co-exc-menu2"><summary aria-label="Más opciones del ejercicio" title="Más opciones">•••</summary><div class="co-day-pop" role="menu">'+
      act("rt-up", up, "Subir")+act("rt-down", down, "Bajar")+act("rt-swap", swapSvg, "Cambiar ejercicio")+
      act("rt-dup", copySvg, "Duplicar")+act("rt-ins", plus, "Insertar uno antes")+
      (isLast ? '' : act("rt-ss", linkSvg, linked?"Separar de la superserie":"Unir con el siguiente (superserie)"))+
      '<hr class="co-pop-sep">'+act("rt-del", trashSvg, "Quitar ejercicio", " danger")+
    '</div></details>';

  // Lo que hizo el cliente la última vez en este ejercicio (primero en este mismo día, si no
  // en cualquiera): cada serie lo muestra al lado de su objetivo.
  const log=coachLogFor(d.sessions, day.name, ex.name); const lastLog=log[0] || coachLogFor(d.sessions, null, ex.name)[0] || null;
  const setTxt=st=>st.secs>0 ? st.secs+' s' : (st.kg ? kgText(st.kg)+' kg × '+st.reps : st.reps+' reps');
  const lastSets=lastLog ? lastLog.sets : null;
  const sets=(ex.sets||[]).map((st,j)=>
    '<div class="co-set-row">'+
      '<span class="co-set-n">'+(j+1)+'</span>'+
      '<input class="co-target" data-coach="rt-target" data-i="'+i+'" data-j="'+j+'" value="'+esc(st.target||"")+'" placeholder="'+(timed?'45 s':'8-10')+'" aria-label="'+(timed?'Tiempo':'Reps')+' objetivo, serie '+(j+1)+'">'+
      '<input class="co-target" data-coach="rt-targetkg" data-i="'+i+'" data-j="'+j+'" value="'+esc(st.targetKg||"")+'" placeholder="kg" aria-label="Peso propuesto, serie '+(j+1)+'">'+
      '<button class="co-set-rm" data-coach="rt-setdel" data-i="'+i+'" data-j="'+j+'" title="Quitar serie" aria-label="Quitar serie '+(j+1)+'">✕</button>'+
    '</div>').join("");
  const setsTbl=nSets ? '<div class="co-set-head"><span>Serie</span><span>'+(timed?'Tiempo':'Reps')+'</span><span>'+(timed?'Peso (opcional)':'Peso')+'</span><span></span></div>'+sets : '';
  // La sugerencia de GIZE para cargarla de un toque como propuesta.
  const sg=lastLog ? suggest(ex, lastLog.sets, timed) : null;
  const sugBtn=(nSets && sg && sg.kg) ? '<button type="button" class="co-last-use" data-coach="rt-sug-fill" data-i="'+i+'" data-kg="'+sg.kg+'">Proponer '+esc(kgText(sg.kg))+' kg <small>('+esc(coachWhy(sg.why))+')</small></button>' : '';
  // La última vez, como una línea chica debajo de las series (no una columna): lo central acá es cargar.
  const lastLine=(nSets && lastLog) ? '<div class="co-last-line"><span>Última vez · '+esc(fmtShort(lastLog.date))+'</span>'+lastLog.sets.map(st=>'<i>'+esc(setTxt(st))+'</i>').join('')+'</div>' : '';
  const prog=exSummary(d, day.name, ex.name);
  const field=(lbl, a, v, ph)=>'<label class="co-pfield"><span class="co-note-lbl">'+lbl+'</span><input class="co-pin" data-coach="'+a+'" data-i="'+i+'" value="'+esc(v||"")+'" placeholder="'+ph+'"></label>';

  // Nota, video y explicación de voz: tres casilleros que se abren en el lugar. Lo abierto se
  // recuerda entre re-dibujos (tilesOpen) para que no se cierre al tocar otra cosa.
  const openKey=tilesOpen.get(ex.id)||"";
  const tile=(key, title, hint, body)=>'<button type="button" class="co-tile-btn'+(openKey===key?' on':'')+(/^\+/.test(hint)?' empty':'')+'" data-tile="'+key+'" data-ex="'+esc(ex.id)+'" aria-expanded="'+(openKey===key)+'"><b>'+title+'</b><span>'+hint+'</span></button>'+
    '<div class="co-tile-panel" data-tile="'+key+'" data-ex="'+esc(ex.id)+'"'+(openKey===key?'':' hidden')+'>'+body+'</div>';
  const vl=ex.video ? null : libVideo(ex.name);
  const vidHint=ex.video ? esc(ex.video.replace(/^https?:\/\/(www\.)?/,'')) : (vl ? 'Elegido por GIZE' : '+ Agregar video');
  const audHint=ex.audio ? 'Grabada'+(ex.audioSecs?' · '+esc(mmss(ex.audioSecs)):'') : '+ Agregar audio';
  const tiles='<div class="co-tiles">'+
      tile('note','Comentario', ex.note ? esc(ex.note) : '+ Agregar comentario',
        '<textarea class="co-note co-note-area" rows="2" data-coach="rt-note" data-i="'+i+'" placeholder="Técnica, tempo, qué cuidar…" aria-label="Nota para el cliente">'+esc(ex.note||"")+'</textarea>')+
      tile('video','Video', vidHint,
        '<input class="co-note" type="url" inputmode="url" data-coach="rt-video" data-i="'+i+'" value="'+esc(ex.video||"")+'" placeholder="Pegá el link de YouTube o Instagram" aria-label="Link de video">'+libVideoHint(ex))+
      tile('audio','Audio', audHint, renderExAudio(ex, i))+
    '</div>';

  // Cabecera como la de la tarjeta cerrada (número, nombre, flecha), con el menú "⋯" antes de
  // la flecha. Reps / Tiempo va arriba de las series, que es lo que cambia. Las series por un
  // lado y descanso, casilleros y progreso por otro: van uno debajo del otro y, si la tarjeta es
  // ancha (adentro de una superserie), lado a lado.
  return '<div class="co-exc co-exc-open'+ssCls+'" data-id="'+esc(ex.id)+'">'+
      swatch+
      '<div class="co-exc-head">'+
        ord+
        '<input class="co-exc-name" data-coach="rt-name" data-i="'+i+'" value="'+esc(ex.name||"")+'" list="exList" placeholder="Nombre del ejercicio" aria-label="Nombre del ejercicio">'+
        menu+
        chevron+
      '</div>'+
      '<div class="co-exc-body">'+
        '<div class="co-exc-main">'+
          '<div class="co-sets-panel">'+setsTbl+
            '<div class="co-sets-foot"><button class="co-set-add" data-coach="rt-setadd" data-i="'+i+'">+ Serie</button>'+lastLine+'</div>'+sugBtn+
          '</div>'+
        '</div>'+
        // «Más opciones»: cómo se mide, descanso, RIR, objetivo, comentario, video, audio y progreso.
        // Cerrado muestra un resumen de lo que ya tiene cargado; lo abierto se recuerda entre re-dibujos.
        '<div class="co-more">'+
          '<button type="button" class="co-more-btn'+(moreOpen.has(ex.id)?' on':'')+'" data-more="'+esc(ex.id)+'" aria-expanded="'+moreOpen.has(ex.id)+'"><span>Más opciones</span>'+
            '<em>'+esc([ex.rest&&('Descanso '+ex.rest), ex.rir&&('RIR '+ex.rir), ex.note&&'Comentario', ex.video&&'Video', ex.audio&&'Audio', timed&&'Por tiempo'].filter(Boolean).join(' · '))+'</em>'+chevronDownSvg+'</button>'+
          '<div class="co-more-panel" data-more="'+esc(ex.id)+'"'+(moreOpen.has(ex.id)?'':' hidden')+'>'+
            '<div class="co-mode"><span class="co-note-lbl">Se mide por</span>'+
              '<div class="co-seg" role="radiogroup" aria-label="Se mide por">'+
                '<button type="button" class="co-seg-opt'+(timed?'':' on')+'" role="radio" aria-checked="'+(!timed)+'" data-coach="rt-timed" data-i="'+i+'" data-v="0">Reps</button>'+
                '<button type="button" class="co-seg-opt'+(timed?' on':'')+'" role="radio" aria-checked="'+timed+'" data-coach="rt-timed" data-i="'+i+'" data-v="1">Tiempo</button>'+
              '</div>'+
            '</div>'+
            '<div class="co-cfg-row">'+
              field("Descanso","rt-rest",ex.rest,"90 seg")+
              field("RIR","rt-rir",ex.rir,"2-0")+
              '<label class="co-pfield co-pfield-goal"><span class="co-note-lbl">Objetivo de progreso</span><input class="co-pin" data-coach="rt-goal" data-i="'+i+'" value="'+esc(ex.goal||"")+'" placeholder="Ej: sumar 1 rep por semana"></label>'+
            '</div>'+
            tiles+
            '<details class="co-exc-fold"><summary>Ver progreso'+(prog?' <span class="co-exc-fold-hint">('+esc(prog)+')</span>':'')+'</summary><div class="co-exc-prog">'+exChart(d, day.name, ex.name)+'</div><div class="co-exc-tbl">'+exTable(d, day.name, ex.name)+'</div></details>'+
          '</div>'+
        '</div>'+
      '</div>'+
    '</div>';
}

// Casilleros abiertos del ejercicio (nota, video, voz): sobreviven a volver a dibujar el editor.
const tilesOpen=new Map();
// «Más opciones» abierto, por ejercicio (también sobrevive a volver a dibujar).
const moreOpen=new Set();
document.addEventListener('click', e=>{
  const b=e.target.closest && e.target.closest('.co-more-btn'); if(!b) return;
  const id=b.dataset.more, on=!moreOpen.has(id);
  if(on) moreOpen.add(id); else moreOpen.delete(id);
  b.classList.toggle('on',on); b.setAttribute('aria-expanded',on);
  const pn=b.parentNode.querySelector('.co-more-panel'); if(pn) pn.hidden=!on;
});
document.addEventListener('click', e=>{
  const b=e.target.closest && e.target.closest('.co-tile-btn'); if(!b) return;
  const id=b.dataset.ex, key=b.dataset.tile, wrap=b.parentNode, willOpen=tilesOpen.get(id)!==key;
  if(willOpen) tilesOpen.set(id,key); else tilesOpen.delete(id);
  wrap.querySelectorAll('.co-tile-btn').forEach(x=>{ const on=willOpen && x.dataset.tile===key; x.classList.toggle('on',on); x.setAttribute('aria-expanded',on); });
  wrap.querySelectorAll('.co-tile-panel').forEach(x=>{ x.hidden=!(willOpen && x.dataset.tile===key); });
});

// ---- Menús «⋯» (details.co-day-menu: el del día, el de cada ejercicio y «Más acciones») ----
// La tarjeta del ejercicio recorta lo que se sale (overflow:hidden por el filete): con pocas series
// «Quitar ejercicio», el último, quedaba cortado y había que abrir «Más opciones» para alcanzarlo.
// Abierto, la tarjeta (y su superserie) pasan adelante sin recortar (.co-menu-on); si abajo no
// entra (fin de la pantalla o la barra de abajo del celular), abre para arriba y, si tampoco, se
// desliza el panel lo justo. Se cierra al elegir una opción, al tocar afuera, con Escape o al abrir otro.
function closeMenus(except){ document.querySelectorAll('details.co-day-menu[open]').forEach(d=>{ if(d!==except) d.open=false; }); }
function placeMenu(d){
  const pop=d.querySelector('.co-day-pop'), sum=d.querySelector('summary'); if(!pop || !sum || d.classList.contains('co-more-actions')) return;
  d.classList.remove('up');
  const r=pop.getBoundingClientRect(), s=sum.getBoundingClientRect();
  let bottom=innerHeight-8;
  const nav=document.querySelector('.cv-nav'), nr=nav && nav.getBoundingClientRect();
  if(nr && nr.height && getComputedStyle(nav).position==='fixed' && nr.top<innerHeight) bottom=Math.min(bottom, nr.top-8);
  if(r.bottom<=bottom) return;
  if(s.top-r.height-6>=8){ d.classList.add('up'); return; }
  const host=document.getElementById('coachHost'); if(host) host.scrollTop+=Math.ceil(r.bottom-bottom);
}
document.addEventListener('toggle', e=>{
  const d=e.target; if(!d || !d.classList || !d.classList.contains('co-day-menu')) return;
  [d.closest('.co-exc'), d.closest('.co-ss-group')].forEach(x=>{ if(x) x.classList.toggle('co-menu-on', d.open); });
  if(!d.open){ d.classList.remove('up'); return; }
  closeMenus(d); placeMenu(d);
}, true);
document.addEventListener('click', e=>{
  const t=e.target, m=t && t.closest && t.closest('details.co-day-menu');
  if(m && t.closest('.co-day-pop button:not(:disabled)')){ m.open=false; return; }
  if(!m) closeMenus(null);
}, true);
document.addEventListener('keydown', e=>{
  if(e.key!=='Escape') return;
  const m=document.querySelector('details.co-day-menu[open]'); if(!m) return;
  closeMenus(null); const s=m.querySelector('summary'); if(s) s.focus();
});

// ---- Subir / bajar un ejercicio («⋯») sin desarmar superseries ----
// En la rutina, ex.ss quiere decir "va con el siguiente": antes se cambiaban los dos ejercicios de
// lugar con su ss y la superserie se armaba con otro (subir el segundo de una superserie metía en
// ella al ejercicio de abajo). Ahora:
// - Adentro de su superserie cambia de lugar con el de al lado y la superserie queda igual.
// - Si no, se mueve el bloque entero (el ejercicio suelto, o su superserie si está en una punta) al
//   otro lado del vecino, que también puede ser un suelto o una superserie entera.
export function moveEx(arr, i, dir){
  const j=i+dir; if(!Array.isArray(arr) || !arr[i] || !arr[j]) return false;
  const setSS=(e,v)=>{ if(v) e.ss=true; else delete e.ss; };
  const g=ssGroupOf(arr, i);
  if(g && j>=g.start && j<=g.end){
    const a=Math.min(i,j), b=Math.max(i,j), fa=!!arr[a].ss, fb=!!arr[b].ss;
    [arr[a],arr[b]]=[arr[b],arr[a]]; setSS(arr[a],fa); setSS(arr[b],fb);
    return true;
  }
  const a=g?g.start:i, b=g?g.end:i, ng=ssGroupOf(arr, j), na=ng?ng.start:j, nb=ng?ng.end:j;
  const block=arr.splice(a, b-a+1);
  arr.splice(dir<0 ? na : nb-block.length+1, 0, ...block);
  return true;
}
// Quitar un ejercicio: si era el último de una superserie, el de arriba deja de ir "con el
// siguiente" (si no, el ejercicio de abajo quedaba metido en la superserie).
export function removeEx(arr, i){
  const ex=Array.isArray(arr) && arr[i]; if(!ex) return null;
  if(!ex.ss && i>0 && arr[i-1].ss) delete arr[i-1].ss;
  return arr.splice(i,1)[0];
}

// ---- Superserie arrastrando (prueba): mantener apretada una tarjeta cerrada y soltarla sobre otra ----
// Se saca el ejercicio de su lugar y se lo pone justo después del de destino, unidos (ex.ss = "va
// con el siguiente"). Si el destino ya estaba en una superserie, el arrastrado se suma a esa cadena.
export function ssDropOnto(arr, from, to){
  if(from===to || !arr[from] || !arr[to]) return false;
  if(from>0 && arr[from-1].ss){ if(arr[from].ss) arr[from-1].ss=true; else delete arr[from-1].ss; }
  const [x]=arr.splice(from,1);
  const j=to>from ? to-1 : to, y=arr[j];
  if(y.ss) x.ss=true; else delete x.ss;
  y.ss=true;
  arr.splice(j+1,0,x);
  return true;
}
const HOLD_MS=450, MOVE_TOL=8;
let dragSt=null, dragGuard=false;
function dragEnd(commit){
  const s=dragSt; if(!s) return; dragSt=null;
  clearTimeout(s.timer); clearInterval(s.scroll);
  if(s.ghost) s.ghost.remove();
  document.querySelectorAll('.co-dragging,.co-drop-target').forEach(n=>n.classList.remove('co-dragging','co-drop-target'));
  document.body.classList.remove('co-drag-on');
  if(!s.active) return;
  dragGuard=true; setTimeout(()=>{ dragGuard=false; }, 350);
  if(commit && s.target!=null){
    const day=(rtDays()||[])[CoachState.coachEditDay];
    const mid=day && day.exercises[s.from] ? day.exercises[s.from].id : null;
    if(day && ssDropOnto(day.exercises, s.from, s.target)){
      renderCoach();
      // Pequeña animación en la superserie recién armada (se saltea con "reducir movimiento").
      const el=mid && document.querySelector('.co-exc[data-id="'+(window.CSS&&CSS.escape?CSS.escape(mid):mid)+'"]'), grp=el && el.closest('.co-ss-group');
      if(grp){ grp.classList.add('co-ss-join'); el.classList.add('co-ss-landed'); setTimeout(()=>{ grp.classList.remove('co-ss-join'); el.classList.remove('co-ss-landed'); }, 900); }
    }
  }
}
function dragStart(s){
  s.active=true;
  const r=s.card.getBoundingClientRect();
  s.ghost=s.card.cloneNode(true); s.ghost.classList.add('co-drag-ghost');
  s.ghost.style.width=r.width+'px'; s.ghost.style.left=r.left+'px'; s.ghost.style.top=r.top+'px';
  s.dx=s.x-r.left; s.dy=s.y-r.top;
  document.body.appendChild(s.ghost);
  s.card.classList.add('co-dragging'); document.body.classList.add('co-drag-on');
  if(navigator.vibrate) try{ navigator.vibrate(15); }catch(e){}
  s.scroll=setInterval(()=>{ const h=window.innerHeight; if(s.y<70) window.scrollBy(0,-14); else if(s.y>h-70) window.scrollBy(0,14); }, 16);
}
document.addEventListener('pointerdown', e=>{
  if(dragSt || (e.pointerType==='mouse' && e.button!==0)) return;
  const card=e.target.closest && e.target.closest('.co-exc-collapsed'); if(!card || e.target.closest('button,input,a')) return;
  const s=dragSt={ card, name:((card.querySelector('.co-exc-ctext')||{}).textContent||'').trim(), from:+card.dataset.i, x:e.clientX, y:e.clientY, x0:e.clientX, y0:e.clientY, id:e.pointerId, active:false, target:null };
  s.timer=setTimeout(()=>{ if(dragSt===s) dragStart(s); }, HOLD_MS);
}, true);
document.addEventListener('pointermove', e=>{
  const s=dragSt; if(!s || e.pointerId!==s.id) return;
  s.x=e.clientX; s.y=e.clientY;
  if(!s.active){ if(Math.hypot(s.x-s.x0, s.y-s.y0)>MOVE_TOL) dragEnd(false); return; }
  s.ghost.style.left=(s.x-s.dx)+'px'; s.ghost.style.top=(s.y-s.dy)+'px';
  const el=document.elementFromPoint(s.x, s.y), tc=el && el.closest ? el.closest('.co-exc-collapsed') : null;
  document.querySelectorAll('.co-drop-target').forEach(n=>{ if(n!==tc) n.classList.remove('co-drop-target'); });
  if(tc && tc!==s.card){ tc.classList.add('co-drop-target'); tc.dataset.join='Unir con '+s.name+' → '+((tc.querySelector('.co-exc-ctext')||{}).textContent||'').trim(); s.target=+tc.dataset.i; } else s.target=null;
  s.ghost.classList.toggle('co-over', s.target!=null);
}, true);
document.addEventListener('pointerup', e=>{ if(dragSt && e.pointerId===dragSt.id) dragEnd(true); }, true);
document.addEventListener('pointercancel', e=>{ if(dragSt && e.pointerId===dragSt.id && !dragSt.active) dragEnd(false); }, true);
// Ya arrastrando, el dedo no debe scrollear la página ni abrir el menú contextual.
document.addEventListener('touchmove', e=>{ if(dragSt && dragSt.active) e.preventDefault(); }, { passive:false });
document.addEventListener('contextmenu', e=>{ if(dragSt) e.preventDefault(); }, true);
// Al soltar, el click que sigue no debe abrir ni cerrar la tarjeta.
document.addEventListener('click', e=>{ if(dragGuard){ e.stopPropagation(); e.preventDefault(); } }, true);

// ---- Días: arrastrar una pestaña para cambiarla de lugar ----
// Con mouse se aprieta y se mueve; en el celular se mantiene apretada (como los ejercicios) y se
// desliza. Al soltar, el día pasa a ese lugar con todo lo suyo (ejercicios, nota, audios, días de
// la semana) y queda como cambio sin guardar; el día que se estaba viendo sigue elegido. En el
// menú «⋯» del día siguen «Mover antes» y «Mover después». Mismo editor en la rutina del alumno,
// en «Mis rutinas», en las programadas y en la de descarga.
export function moveDay(D, from, to){
  if(!Array.isArray(D) || from===to || !(from>=0 && from<D.length) || !(to>=0 && to<D.length)) return false;
  const [x]=D.splice(from,1); D.splice(to,0,x);
  return true;
}
const dayTabs=()=>[...document.querySelectorAll('.co-daytabs .co-daytab[data-coach="edit-day"]')];
let dayDrag=null, dayGuard=false;
function dayDragEnd(commit){
  const s=dayDrag; if(!s) return; dayDrag=null;
  clearTimeout(s.timer); clearInterval(s.scroll);
  if(s.ghost) s.ghost.remove();
  document.querySelectorAll('.co-daytab.co-dragging,.co-daytab.co-drop-l,.co-daytab.co-drop-r').forEach(n=>n.classList.remove('co-dragging','co-drop-l','co-drop-r'));
  document.body.classList.remove('co-drag-on');
  if(!s.active) return;
  dayGuard=true; setTimeout(()=>{ dayGuard=false; }, 350);
  const D=rtDays(); if(!commit || s.to==null || !D) return;
  const cur=D[CoachState.coachEditDay];
  if(moveDay(D, s.from, s.to)){ CoachState.coachEditDay=Math.max(0, D.indexOf(cur)); renderCoach(); }
}
function dayDragStart(s){
  s.active=true;
  const r=s.tab.getBoundingClientRect();
  s.ghost=s.tab.cloneNode(true); s.ghost.classList.add('co-drag-ghost','co-day-ghost'); s.ghost.classList.remove('on');
  s.ghost.style.width=r.width+'px'; s.ghost.style.left=r.left+'px'; s.ghost.style.top=r.top+'px';
  s.dx=s.x-r.left; s.dy=s.y-r.top;
  document.body.appendChild(s.ghost);
  s.tab.classList.add('co-dragging'); document.body.classList.add('co-drag-on');
  if(!s.mouse && navigator.vibrate) try{ navigator.vibrate(15); }catch(e){}
  // Con muchos días la fila se desliza sola cerca de los bordes.
  const strip=s.tab.parentNode;
  s.scroll=setInterval(()=>{ const sr=strip.getBoundingClientRect(); if(s.x<sr.left+36) strip.scrollLeft-=12; else if(s.x>sr.right-36) strip.scrollLeft+=12; }, 16);
}
// A qué lugar va: cuántas de las otras pestañas quedan antes del dedo, en orden de lectura (en la
// compu las pestañas van en varios renglones: las de un renglón de arriba cuentan todas; las del
// mismo renglón, si tienen el medio a la izquierda).
function dayDragOver(s){
  const others=dayTabs().filter((t,k)=>k!==s.from);
  let n=0; others.forEach(t=>{ const r=t.getBoundingClientRect(), cy=r.top+r.height/2, fila=r.height*0.75;
    if(cy<s.y-fila || (Math.abs(cy-s.y)<=fila && r.left+r.width/2<s.x)) n++; });
  s.to=n;
  others.forEach((t,k)=>{ t.classList.toggle('co-drop-l', n!==s.from && k===n); t.classList.toggle('co-drop-r', n!==s.from && n===others.length && k===others.length-1); });
}
document.addEventListener('pointerdown', e=>{
  if(dayDrag || dragSt || (e.pointerType==='mouse' && e.button!==0)) return;
  const tab=e.target.closest && e.target.closest('.co-daytabs .co-daytab[data-coach="edit-day"]'); if(!tab) return;
  const tabs=dayTabs(); if(tabs.length<2) return;
  const s=dayDrag={ tab, from:tabs.indexOf(tab), x:e.clientX, y:e.clientY, x0:e.clientX, y0:e.clientY, id:e.pointerId, mouse:e.pointerType==='mouse', active:false, to:null };
  if(!s.mouse) s.timer=setTimeout(()=>{ if(dayDrag===s) dayDragStart(s); }, HOLD_MS);
}, true);
document.addEventListener('pointermove', e=>{
  const s=dayDrag; if(!s || e.pointerId!==s.id) return;
  s.x=e.clientX; s.y=e.clientY;
  if(!s.active){
    if(Math.hypot(s.x-s.x0, s.y-s.y0)<=MOVE_TOL) return;
    // Con mouse, moverlo apretado ya es arrastrar; con el dedo, moverse antes de tiempo es deslizar la fila.
    if(s.mouse) dayDragStart(s); else { dayDragEnd(false); return; }
  }
  s.ghost.style.left=(s.x-s.dx)+'px'; s.ghost.style.top=(s.y-s.dy)+'px';
  dayDragOver(s);
}, true);
document.addEventListener('pointerup', e=>{ if(dayDrag && e.pointerId===dayDrag.id) dayDragEnd(true); }, true);
document.addEventListener('pointercancel', e=>{ if(dayDrag && e.pointerId===dayDrag.id && !dayDrag.active) dayDragEnd(false); }, true);
document.addEventListener('touchmove', e=>{ if(dayDrag && dayDrag.active) e.preventDefault(); }, { passive:false });
document.addEventListener('contextmenu', e=>{ if(dayDrag) e.preventDefault(); }, true);
document.addEventListener('click', e=>{ if(dayGuard){ e.stopPropagation(); e.preventDefault(); } }, true);

const linkSvg='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>';
const plusSvg='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';

// El motivo de la sugerencia está escrito para el cliente; en el editor se lee en tercera persona.
const coachWhy=w=>String(w).replace(/^Llegaste/,"Llegó").replace(/^La vez pasada hiciste/,"La vez pasada hizo").replace(/^La vez pasada aguantaste/,"La vez pasada aguantó").replace(/^Completá/,"Le falta completar").replace(/^Mismo peso que la vez pasada, una rep más\./,"Mismo peso, una rep más.").replace(/: subí el peso\./,": subir el peso.").replace(/: sumá una más\./,": una más.").replace(/: sumá 5 segundos\./,": 5 segundos más.").replace(/ antes de subir\.$/," antes de subir.");
const fmtShort=dt=>{ const p=String(dt||"").split("-"); return p.length===3 ? (+p[2])+"/"+(+p[1]) : dt; };
// Rutinas programadas: rutinas que el coach deja listas para que empiecen solas en una fecha
// (ver supabase/rutina-programada.sql). Arriba de la rutina vigente del alumno.
const fmtDia = iso => { const [y, m, dd] = String(iso).split("-").map(Number); return new Date(y, m - 1, dd).toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" }); };
export function renderCoachSchedule(d){
  const list=d.schedule||[];
  return '<div class="co-panel co-sched"><div class="co-sec">Rutinas programadas</div>'+
    '<div class="co-sched-sub">Dejá lista la próxima rutina y elegí desde qué día empieza: ese día le cambia sola, sin tocar la de ahora.</div>'+
    (list.length ? list.map(s=>'<div class="co-sched-row"><div class="co-sched-info"><b>Desde el '+esc(fmtDia(s.starts_on))+'</b><span>'+esc(s.name||"Rutina programada")+' · '+(s.days||[]).length+' día'+((s.days||[]).length===1?'':'s')+'</span></div><button class="co-copy-btn" data-coach="sched-open" data-id="'+esc(s.id)+'">Editar</button></div>').join("") : '')+
    '<button class="co-copy-btn co-sched-new" data-coach="sched-new">+ Programar una rutina nueva</button></div>';
}

export function renderCoachRoutine(d){
  const rt=d.routine||[];
  if(!rt.length) return '<div class="co-sec">Rutina y progreso</div><div class="cal-hint">El cliente todav\u00eda no tiene rutina.</div><button class="co-add-day" data-coach="day-add">+ Agregar d\u00eda</button>';
  if(CoachState.coachEditDay>=rt.length) CoachState.coachEditDay=0;
  // Cada pestaña con sus días de la semana abajo, chiquito (core/diasemana.js).
  // Con dos días o más se pueden arrastrar para cambiarlos de lugar (ver «Días: arrastrar»).
  const tabs=rt.map((x,i)=>{ const dt=diasTexto(x); return '<button class="co-daytab'+(i===CoachState.coachEditDay?' on':'')+'" data-coach="edit-day" data-i="'+i+'"'+(rt.length>1?' title="Arrastralo para cambiarlo de lugar"':'')+'>'+esc(x.name||('D\u00eda '+(i+1)))+(dt?'<small class="co-daytab-dias">'+esc(dt)+'</small>':'')+'</button>'; }).join("");
  const day=rt[CoachState.coachEditDay];
  const totalSets=(day.exercises||[]).reduce((n,x)=>n+((x.sets||[]).length),0);
  const totalEx=(day.exercises||[]).length;
  // Las tarjetas van en grilla (3 por fila en pantalla ancha); la abierta sigue en su casillero
  // y crece hacia abajo, las superseries ocupan toda la fila. Se abre una sola a la vez
  // (abrirSolo). Unir en superserie está en el menú "⋯" de la tarjeta abierta.
  // Entre ejercicio y ejercicio, un botón para agregar ahí (rt-ins): el buscador agrega el nuevo
  // justo en ese lugar, no al final. Adentro de una superserie el nuevo queda en la superserie
  // (cpApply). En el celular es la línea finita con «+ Agregar ejercicio»; en la compu, un «+»
  // redondo a la vista en el medio del hueco, que se prende al pasar el mouse (el texto se oculta:
  // css/screens/coach/editor.css).
  // El lector de pantalla dice además entre qué dos ejercicios queda (si no, eran todos iguales).
  const exs=day.exercises||[], groups=ssGroups(exs);
  const ins=i=>'<button type="button" class="co-ins" data-coach="rt-ins" data-i="'+i+'" title="Agregar ejercicio acá" aria-label="Agregar ejercicio acá, entre '+esc(exs[i-1].name||"el anterior")+' y '+esc(exs[i].name||"el siguiente")+'"><span class="co-ins-b">'+plusSvg+'<span class="co-ins-t">Agregar ejercicio</span></span></button>';
  const cards=exs.map((ex,i)=>{
    const g=groups.find(x=>i>=x.start && i<=x.end), inGroup=!!(g && i>g.start);
    const open=g && i===g.start ? '<div class="co-ss-group"><div class="co-ss-head">'+linkSvg+ssName(g)+' '+g.letter+'<button class="co-ss-split" data-coach="rt-ss-split" data-i="'+g.start+'">Separar</button><span>una serie de cada uno, sin descanso entre medio</span></div>' : '';
    const div=inGroup ? '<div class="ss-div" aria-hidden="true"><span>sin descanso</span></div>' : '';
    return (i>0 && !inGroup ? ins(i) : '')+open+(inGroup ? ins(i) : '')+div+exerciseCard(d, day, ex, i, rt)+(g && i===g.end ? '</div>' : '');
  }).join("");
  const dotsOn=diasDe(day);
  const dayMenu='<details class="co-day-menu"><summary aria-label="Más opciones del día" title="Más opciones">•••</summary><div class="co-day-pop">'+
      '<button class="co-day-mv" data-coach="day-dup">'+copySvg+'<span>Duplicar este día</span></button>'+
      (rt.length>1 ? '<button class="co-day-mv" data-coach="day-left"'+(CoachState.coachEditDay===0?' disabled':'')+'>'+chevronLeftSvg+'<span>Mover antes</span></button>'+
        '<button class="co-day-mv" data-coach="day-right"'+(CoachState.coachEditDay===rt.length-1?' disabled':'')+'>'+chevronRightSvg+'<span>Mover después</span></button>'+
        '<button class="co-day-mv danger" data-coach="day-del">'+trashSvg+'<span>Borrar día</span></button>' : '')+
    '</div></details>';
  const sugOff=rt.some(x=>x.noSug);
  const sugToggle='<span class="co-sug-mini" title="'+(sugOff?'Apagada: el cliente solo ve el peso que vos propongas.':'GIZE le recomienda subir 2,5 kg cuando la vez pasada se pasó del rango de reps, salvo donde cargues tu peso propuesto.')+'"><span>Sugerencia de peso</span><button type="button" class="co-sug-tg'+(sugOff?'':' on')+'" data-coach="rt-nosug-all" role="switch" aria-checked="'+(!sugOff)+'" aria-label="Sugerencia automática de peso"><span></span></button></span>';
  return coachDatalist()+
    '<div class="co-daytabs">'+tabs+'<button class="co-daytab add" data-coach="day-add" aria-label="Agregar día">+</button></div>'+
    (rt.length>1 ? '<div class="co-drag-hint co-day-hint">Para cambiar el orden de los días, arrastralos (en el celular, mantené apretado uno).</div>' : '')+
    '<div class="co-day-bar">'+
      // Días de la semana de este día (puede ser más de uno): Entreno arranca en el día que toca hoy.
      '<div class="co-day-row">'+
        '<div class="co-dias-wrap"><span class="co-note-lbl">Se repite</span><div class="hd-row co-dias" role="group" aria-label="Días de la semana de este día" title="'+(dotsOn.length?'El alumno abre la app esos días y le aparece este día directo.':'Sin días: el alumno elige el día a mano.')+'">'+
          SEMANA.map(n=>'<button class="hd-day'+(dotsOn.includes(n)?' on':'')+'" data-coach="day-dow" data-d="'+n+'" aria-label="'+DIA_LARGO[n]+'" aria-pressed="'+dotsOn.includes(n)+'">'+DIA_LETRA[n]+'</button>').join("")+
        '</div></div>'+
        dayMenu+
      '</div>'+
      '<div class="co-day-fields">'+
        '<label class="co-pfield"><span class="co-note-lbl">Nombre del día</span><input class="co-dayname" data-coach="day-name" value="'+esc(day.name||"")+'" placeholder="Nombre del día" aria-label="Nombre del día"></label>'+
        '<label class="co-pfield co-daynote"><span class="co-note-lbl">Nota</span><input class="co-note" data-coach="day-note" value="'+esc(day.note||"")+'" placeholder="La ve el alumno al entrar…"></label>'+
      '</div>'+
    '</div>'+
    '<div class="co-exc-section-head"><div class="co-exc-title"><span class="co-sec" style="margin:0">Ejercicios</span><span class="co-exc-count">'+totalEx+' · '+totalSets+' serie'+(totalSets===1?'':'s')+'</span></div>'+sugToggle+'</div>'+
    (exs.length>1 ? '<div class="co-drag-hint">Mantené apretado un ejercicio y soltalo sobre otro para unirlos en superserie.</div>' : '')+
    '<div class="co-exc-grid">'+
    cards+
      '<button class="co-rt-add-end" data-coach="rt-add"><span>+</span>Agregar ejercicio</button>'+
    '</div>'+
    (cards ? '' : '<div class="cal-hint">Día vacío. Sumá el primer ejercicio.</div>')+
    (CoachState.coachTplEdit ? '' : (routineDirty() ? '<div class="co-unsaved">'+(CoachState.coachData.draftRestored ? 'Recuperamos los cambios que no se habían guardado. ' : 'Cambios sin guardar. ')+'Tocá <b>Guardar rutina</b> para que le lleguen al cliente.</div>' : '')+
      // Pie fijo: «Más acciones» (aplicar una de mis rutinas, copiar a otro cliente, guardar como rutina) y Guardar.
      '<div class="co-savebar"><details class="co-day-menu co-more-actions"><summary>Más acciones</summary><div class="co-day-pop">'+
        "<button class='co-day-mv' data-coach='rt-apply'>"+downloadSvg+"<span>Aplicar una de mis rutinas</span></button>"+
        "<button class='co-day-mv' data-coach='rt-copy'>"+copySvg+"<span>Copiar a otro cliente</span></button>"+
        "<button class='co-day-mv' data-coach='rt-tosave'>"+saveSvg+"<span>Guardar como rutina</span></button>"+
      '</div></details><button class="co-save-rt" data-coach="save-routine">Guardar rutina</button></div>');
}

// Disciplina del alumno abierto (si el coach edita una plantilla suya, ninguna: [] y no la propia).
const cpDisc = () => (!CoachState.coachTplEdit && CoachState.coachData && Array.isArray(CoachState.coachData.disciplines)) ? CoachState.coachData.disciplines : [];

export function coachPickerMarkup(){
  const q=CoachState.coachPQ.trim().toLowerCase();
  let inner;
  if(q){
    const res=searchExercises(n=>n.toLowerCase().indexOf(q)>=0, EX_CATS);
    inner='<div class="cp-exs">'+(res.length?res.map(r=>'<button class="cp-ex" data-cp="choose" data-name="'+esc(r.name)+'" data-cat="'+esc(r.cat)+'">'+esc(r.label)+'</button>').join(""):'<div class="cal-hint">Sin resultados</div>')+'</div>';
  } else if(!CoachState.coachPCat){
    // Con la disciplina del alumno, primero «Para su disciplina» y sus grupos (core/disciplinas.js).
    inner='<div class="cp-step">1. Eleg\u00ed el grupo muscular</div><div class="cp-cats">'+orderedCats(EX_CATS, cpDisc(), "Para su disciplina").map(c=>'<button class="cp-cat'+(c[0]===FOR_YOU?' cp-cat-vos':'')+'" data-cp="cat" data-c="'+c[0]+'">'+c[1]+'</button>').join("")+'</div>';
  } else if(CoachState.coachPCat===FOR_YOU){
    inner='<div class="cp-bar"><button class="cp-back" data-cp="cats">\u2039 Grupos</button><span class="cp-catname">Para su disciplina</span></div>'+
      '<div class="cp-exs">'+forYouList(cpDisc()).map(n=>'<button class="cp-ex" data-cp="choose" data-name="'+esc(n)+'" data-cat="">'+esc(n)+'</button>').join("")+'</div>';
  } else {
    const lb=(EX_CATS.find(c=>c[0]===CoachState.coachPCat)||["",""])[1];
    inner='<div class="cp-bar"><button class="cp-back" data-cp="cats">\u2039 Grupos</button><span class="cp-catname">'+esc(lb)+'</span></div>'+
      '<div class="cp-exs">'+(EX_DB[CoachState.coachPCat]||[]).map(n=>'<button class="cp-ex" data-cp="choose" data-name="'+esc(n)+'" data-cat="'+esc(CoachState.coachPCat)+'">'+esc(n)+'</button>').join("")+'</div>';
  }
  return '<div class="cp-head"><div class="cp-title">'+(CoachState.coachPicker.mode==="swap"?"Cambiar ejercicio":"Elegir ejercicio")+'</div><button class="cp-x" data-cp="cancel">\u2715</button></div>'+
    '<div class="search-wrap"><span class="search-ic">'+searchSvg+'</span><input class="cp-search" placeholder="Buscar ejercicio en toda la base..." value="'+esc(CoachState.coachPQ)+'" data-cp="search"></div>'+
    inner+
    '<button class="cp-custom" data-cp="custom">\u270e '+(CoachState.coachPicker.mode==="swap"?"Escribir nombre propio":"Agregar con nombre propio")+'</button>';
}

export function renderCoachPicker(){
  const host=document.getElementById("coachSheetHost"); if(!host) return;
  if(!CoachState.coachPicker){ host.innerHTML=""; return; }
  const existing = host.querySelector(".cp-modal");
  if(existing){ existing.innerHTML = coachPickerMarkup(); return; }
  host.innerHTML='<div class="cp-bg" data-cp="cancel"></div><div class="cp-modal">'+coachPickerMarkup()+'</div>';
}

export function cpApply(name, cat){
  if(!rtDays()) return;
  const day=(rtDays()||[])[CoachState.coachEditDay]; if(!day) return;
  const mm=pickMuscle(name, cat||CoachState.coachPCat);
  let ex;
  // Al cambiarlo, series con ids nuevos: el alumno no hereda lo cargado en el viejo (mergeLocalProgress).
  if(CoachState.coachPicker.mode==="swap"){ ex=day.exercises[CoachState.coachPicker.i]; if(ex){ if(ex.name!==name){ dropExMedia(ex); ex.sets.forEach(s=>{ s.id=uid(); }); } ex.name=name; ex.mus=mm; } }
  else if(CoachState.coachPicker.mode==="insert"){
    ex=mkEx(name,3,mm);
    // Entre dos de una superserie (el de arriba va "con el siguiente"): el nuevo se suma a la
    // superserie; si no, el de abajo quedaba afuera y el nuevo unido al de arriba.
    const k=Math.min(Math.max(+CoachState.coachPicker.idx||0,0), day.exercises.length), prev=day.exercises[k-1];
    if(prev && prev.ss && k<day.exercises.length) ex.ss=true;
    day.exercises.splice(k,0,ex);
  }
  else { ex=mkEx(name,3,mm); day.exercises.push(ex); }
  // el ejercicio recién agregado/cambiado arranca expandido para que el coach lo complete
  // de una — es el único abierto: el resto del día queda colapsado (abrirSolo).
  if(ex) abrirSolo(ex.id);
  closeSheet(()=>{ CoachState.coachPicker=null; renderCoachPicker(); renderCoach(); }, {host:"#coachSheetHost", card:".cp-modal", duration:150});
}

// Un solo ejercicio abierto a la vez en el editor (CoachState.coachExpandedEx): abrir uno, o
// agregarlo, duplicarlo, insertarlo o cambiarlo, cierra el que estaba abierto.
export function abrirSolo(id){
  CoachState.coachExpandedEx.clear();
  if(id) CoachState.coachExpandedEx.add(id);
}
