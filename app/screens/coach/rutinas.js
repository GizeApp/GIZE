import { ssGroupOf, ssGroups, ssName } from '../../core/superserie.js';
import { libVideo } from '../../core/videos.js';

import { EX_CATS, EX_DB } from '../../core/data.js';

import { checkSvg, chevronDownSvg, chevronLeftSvg, chevronRightSvg, copySvg, downloadSvg, gripSvg, saveSvg, searchSvg, swapSvg, trashSvg, xSvg } from '../../core/icons.js';

import { State } from '../../core/state.js';

import { migrateNames } from '../../core/storage.js';

import { esc, isTimedEx, mkEx, muscleOf, today } from '../../core/utils.js';

import { coachDatalist, coachLogFor, exChart, exSummary, exTable } from './clientes.js';
import { kgText, suggest } from '../../core/progresion.js';

import { renderCoach } from './index.js';

import { CoachState, coachWeekSel } from './state.js';

import { blockWeek, restLabel } from '../entreno.js';
import { parseRest } from '../../ui/restbar.js';

import { closeSheet } from '../../ui/sheet.js';

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
  let tk=0,tc=0,tf=0,tp=0; rows.forEach(r=>{ tk+=+r.kcal||0; tc+=+r.cho||0; tf+=+r.fat||0; tp+=+r.prot||0; });
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
    return '<div class="opt-sec">'+
      '<div class="opt-sec-head">'+
        '<input class="ml-in opt-sectitle" data-coach="pl-optsec" data-i="'+i+'" value="'+esc(sec.title||"")+'" placeholder="Desayuno, Almuerzo, Merienda…">'+
        '<span class="opt-count">'+n+' opci'+(n===1?'\u00f3n':'ones')+'</span>'+
        '<button class="ml-del" data-coach="pl-optsecdel" data-i="'+i+'" title="Borrar comida" aria-label="Borrar comida">\u2715</button>'+
      '</div>'+
      '<div class="opt-grid">'+opts+
        '<button class="opt-add-card" data-coach="pl-optadd" data-i="'+i+'">+ Agregar opci\u00f3n '+String.fromCharCode(65+n)+'</button>'+
      '</div>'+
    '</div>';
  }).join("");
  return '<div class="co-note-lbl" style="margin-top:4px">Opciones de comidas (el cliente elige)</div>'+
    '<div class="pl-help">Cre\u00e1 cada <b>comida</b> (Desayuno, Almuerzo, Merienda…) y adentro sus <b>opciones</b> (A, B, C…), un alimento por rengl\u00f3n. El cliente las ve como un men\u00fa ordenado.</div>'+
    blocks+
    '<button class="pl-add" data-coach="pl-optsecadd">+ Agregar comida (Desayuno, Almuerzo\u2026)</button>';
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

export function habitsEditor(p){
  const arr=Array.isArray(p.habits)?p.habits:[];
  const rows=arr.map((t,i)=>'<div class="le-row"><input class="ml-in wide" data-coach="pl-habit" data-i="'+i+'" value="'+esc(t)+'" placeholder=""><button class="ml-del" data-coach="pl-habitdel" data-i="'+i+'">\u2715</button></div>').join("");
  return rows+'<button class="pl-add" data-coach="pl-habitadd">+ Agregar hábito</button>';
}

// Plan nutricional en secciones, como la ficha del alumno: un menú de tarjetas y cada una
// abre su editor. Lo que se va cargando queda en CoachState.coachPlanForm aunque se cambie de
// sección, y se guarda todo junto con «Guardar plan nutricional».
export function renderCoachPlan(d){
  const p = coachPlanObj(d);
  const card=(title, body, extra)=>'<div class="ci-card plan-edit"><div class="pl-sub-row"><div class="pl-sub">'+title+'</div>'+(extra||"")+'</div>'+body+'</div>';
  const tot=k=>{ let t=0; (p[k]||[]).forEach(r=>{ t+=+r.kcal||0; }); return t; };
  const meals=k=>{ const n=(p[k]||[]).length, t=tot(k); return n ? n+" comida"+(n===1?"":"s")+(t?" · "+t+" kcal":"") : "Sin cargar"; };
  const cnt=(n,one,many)=>n+" "+(n===1?one:many);
  const SECS=[
    ["train","Días de entrenamiento", ()=>card("Reparto de comidas", mealRows(p,"trainDays")), ()=>meals("trainDays")],
    ["rest","Días de descanso", ()=>card("Reparto de comidas", mealRows(p,"restDays")), ()=>meals("restDays")],
    ["agua","Hidratación", ()=>card("Hidratación",
      '<div class="ci-grid-2">'+
        '<div class="ci-f"><label>Agua por día (litros)</label><input class="co-note" data-coach="pl-water" value="'+esc(p.water||"")+'" placeholder=""></div>'+
        '<div class="ci-f"><label>Sal por día (g)</label><input class="co-note" data-coach="pl-salt" value="'+esc(p.salt||"")+'" placeholder=""></div>'+
      '</div>'), ()=>[p.water?p.water+" L de agua":"", p.salt?p.salt+" g de sal":""].filter(Boolean).join(" · ")||"Sin cargar"],
    ["ind","Indicaciones", ()=>card("Indicaciones",
      '<div class="ci-grid-2">'+
        '<div>'+listEditor(p,"guidelines","Pautas nutricionales","")+'</div>'+
        '<div>'+listEditor(p,"supps","Suplementos recomendados","")+'</div>'+
      '</div>'), ()=>{ const g=(p.guidelines||[]).length, sp=(p.supps||[]).length; return g||sp ? [g?cnt(g,"pauta","pautas"):"", sp?cnt(sp,"suplemento","suplementos"):""].filter(Boolean).join(" · ") : "Sin cargar"; }],
    ["menu","Personalización del menú", ()=>card("Personalización del menú",
      optionsEditor(p)+
      '<div class="pl-divider"></div>'+
      '<div class="ci-grid-2">'+
        '<div>'+listEditor(p,"extras","Adicionales (aderezos, condimentos permitidos)","")+'</div>'+
        '<div>'+swapsEditor(p)+'</div>'+
      '</div>'), ()=>{ const o=(p.options||[]); return o.length ? o.map(x=>x.title||"Sección").slice(0,3).join(", ")+(o.length>3?"…":"") : "Sin opciones"; }],
    ["cardio","Cardio prescripto", ()=>card("Cardio prescripto",
      '<div class="co-note-wrap" style="margin-top:0"><span class="co-note-lbl">Indicación general de cardio</span><input class="co-note" data-coach="pl-cardiotext" value="'+esc((p.cardio&&p.cardio.text)||"")+'" placeholder=""></div>'+
      cardioItemsEditor(p)), ()=>(p.cardio&&p.cardio.text)||((p.cardio&&p.cardio.items||[]).length?cnt(p.cardio.items.length,"sesión","sesiones"):"Sin cargar")],
    ["habitos","Hábitos diarios", ()=>card("Checklist del cliente", habitsEditor(p)), ()=>{ const n=Array.isArray(p.habits)?p.habits.length:0; return n?cnt(n,"hábito","hábitos"):"Sin cargar"; }],
  ];
  const save='<button class="co-save-rt" data-coach="plan-save">Guardar plan nutricional</button>';
  const cur=SECS.find(x=>x[0]===CoachState.coachPlanSec);
  if(cur){
    return '<div class="form-head co-sec-head"><button class="form-back" data-coach="plsec-close" aria-label="Volver al plan">‹</button><div class="form-title">'+cur[1]+'</div></div>'+cur[2]()+save;
  }
  return '<div class="co-page-title">Plan nutricional</div>'+
    '<div class="ptiles co-ptiles">'+SECS.map(x=>'<button class="ptile" data-coach="plsec-open" data-v="'+x[0]+'"><span class="ptile-t">'+x[1]+'</span><span class="ptile-s">'+esc(String(x[3]()))+'</span><span class="ptile-go" aria-hidden="true">›</span></button>').join("")+'</div>'+
    save;
}

export function renderCoachBlock(d){
  const b = CoachState.coachBlockForm || d.block || {};
  const wks = parseInt(b.weeks)||8;
  const dls = Array.isArray(b.deloads)?b.deloads:[];
  const cur = b.start_date ? blockWeek(b, today()) : 0;
  let grid="";
  const wPlan=(CoachState.coachBlockForm||b).weekPlan||{};
  for(let w=1; w<=wks; w++){
    const on=dls.indexOf(w)>=0;
    const hasNote=!!(wPlan[w]&&(wPlan[w].goal||wPlan[w].note));
    const sel=coachWeekSel===w;
    grid+='<button class="bw'+(on?' dl':'')+(w===cur?' now':'')+(sel?' sel':'')+(hasNote?' has-note':'')+'" data-coach="blk-week" data-w="'+w+'">'+w+(hasNote?'<span class="bw-dot">•</span>':'')+'</button>';
  }
  const F=(k,lbl,ph,type)=>'<div class="ci-f"><label>'+lbl+'</label><input class="co-note" data-coach="blk-'+k+'" value="'+esc(b[k]==null?"":String(b[k]))+'" placeholder="'+ph+'"'+(type?' type="'+type+'"':'')+'></div>';
  return '<div class="ci-grid">'+
      F("name","Nombre del bloque","")+F("start_date","Inicio (lunes)","",'date')+
      F("weeks","Semanas","","numeric")+F("phase","Fase","")+
    '</div>'+
    F("calories","Estrategia cal\u00f3rica","")+
    F("notes","Nota del bloque (la ve el cliente)","")+
    '<div class="co-note-lbl" style="margin-top:14px">Semanas de descarga \u2014 toc\u00e1 para marcarlas'+(cur?' \u00b7 el cliente est\u00e1 en la semana '+cur:'')+'</div>'+
    '<div class="bw-grid">'+grid+'</div>'+
    (coachWeekSel!==null ? (() => {
      const wp=(wPlan[coachWeekSel]||{});
      const isDl=dls.indexOf(coachWeekSel)>=0;
      return '<div class="week-editor">'+
        '<div class="week-ed-head">Semana '+coachWeekSel+(cur===coachWeekSel?' · semana actual':'')+(isDl?' · DESCARGA':'')+
        '<button class="co-copy-btn" style="margin-left:auto" data-coach="wk-dl" data-w="'+coachWeekSel+'">'+(isDl?checkSvg+' Descarga':'Marcar descarga')+'</button></div>'+
        '<div class="ci-f" style="margin-top:10px"><label>Objetivo de la semana</label><input class="co-note" data-coach="wk-goal" value="'+esc(wp.goal||'')+'"></div>'+
        '<div class="ci-f" style="margin-top:8px"><label>Indicaciones para el cliente</label><input class="co-note" data-coach="wk-note" value="'+esc(wp.note||'')+'"></div>'+
        '<div style="margin-top:10px;display:flex;gap:8px">'+
          '<button class="co-save-rt" style="flex:1" data-coach="wk-save">Guardar semana '+coachWeekSel+'</button>'+
          '<button class="co-copy-btn" data-coach="wk-close">'+xSvg+' Cerrar</button>'+
        '</div></div>';
    })() : '')+
    '<button class="co-save-rt" data-coach="blk-save">Guardar bloque</button>';
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
      '<span class="ap-meta">'+nex+' ej.</span></div>';
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

// Un color estable por grupo muscular (swatch de la card de ejercicio): hashea el nombre
// del grupo a una paleta fija.
const EX_SWATCH_COLORS=["var(--blue)","var(--purple)","var(--pink)","var(--cyan)","var(--green-2)"];
function exSwatchColor(ex){
  const mus=ex.mus||muscleOf(ex.name)||"otros";
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
// cerrada muestra el nombre completo (hasta 2 renglones) y las series; abierta, una barra
// de acciones con botones grandes y con texto (subir, bajar, cambiar, duplicar, quitar) en
// vez de íconos chicos y un menú escondido detrás de los seis puntitos.
function exerciseCard(d, day, ex, i, rt){
  const open=CoachState.coachExpandedEx.has(ex.id);
  const nSets=(ex.sets||[]).length;
  const swatch='<span class="co-exc-swatch" style="background:'+exSwatchColor(ex)+'"></span>';
  const timed=isTimedEx(ex);
  const badge='<span class="co-exc-badge">'+nSets+' serie'+(nSets===1?'':'s')+(timed?' · por tiempo':'')+'</span>';
  const rirTxt=rirRestSummary(ex);
  const chevron='<span class="co-exc-chevron'+(open?' open':'')+'">'+chevronDownSvg+'</span>';
  // El número de orden sale solo de la posición en el día (1, 2, 3…): al subir, bajar o
  // agregar ejercicios se reacomoda sin que el coach lo cargue a mano.
  // En superserie lleva la letra y la posición (A1, A2…) y un filete de color al costado.
  const g=ssGroupOf(day.exercises||[], i), tag=g ? g.letter+(i-g.start+1) : '';
  const ord='<span class="co-exc-ord'+(g?' ss':'')+'">'+(tag||(i+1))+'</span>';
  const ssCls=g ? ' co-ss'+(i===g.start?' co-ss-first':'')+(i===g.end?' co-ss-last':'') : '';

  if(!open){
    return '<div class="co-exc co-exc-collapsed'+ssCls+'" data-coach="rt-toggle" data-i="'+i+'" data-id="'+esc(ex.id)+'">'+
        swatch+
        '<div class="co-exc-cmain">'+
          '<span class="co-exc-cname">'+ord+esc(ex.name||"Sin nombre")+'</span>'+
          '<span class="co-exc-cmeta">'+badge+(rirTxt?'<span class="co-exc-rirtxt">'+esc(rirTxt)+'</span>':'')+'</span>'+
        '</div>'+
        '<button class="co-exc-icon-btn" data-coach="rt-swap" data-i="'+i+'" title="Cambiar ejercicio" aria-label="Cambiar ejercicio">'+swapSvg+'</button>'+
        chevron+
      '</div>';
  }

  const act=(a, icon, label, extra)=>'<button class="co-exc-act'+(extra||"")+'" data-coach="'+a+'" data-i="'+i+'"'+
    ((a==="rt-up"&&i===0)||(a==="rt-down"&&i===(day.exercises||[]).length-1)?' disabled':'')+'>'+icon+'<span>'+label+'</span></button>';
  const up='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
  const down='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>';
  const actions='<div class="co-exc-actions">'+
      act("rt-up", up, "Subir")+act("rt-down", down, "Bajar")+act("rt-swap", swapSvg, "Cambiar")+
      act("rt-dup", copySvg, "Duplicar")+act("rt-del", trashSvg, "Quitar", " danger")+
    '</div>';

  // Lo que hizo el cliente la última vez en este ejercicio (primero en este mismo día, si no
  // en cualquiera): se ve arriba de las series.
  const log=coachLogFor(d.sessions, day.name, ex.name); const lastLog=log[0] || coachLogFor(d.sessions, null, ex.name)[0] || null;
  const setTxt=st=>st.secs>0 ? st.secs+' s' : (st.kg>0 ? kgText(st.kg)+' kg × '+st.reps : st.reps+' reps');
  const sets=(ex.sets||[]).map((st,j)=>
    '<div class="co-set-row">'+
      '<span class="co-set-n">'+(j+1)+'</span>'+
      '<input class="co-target" data-coach="rt-target" data-i="'+i+'" data-j="'+j+'" value="'+esc(st.target||"")+'" placeholder="'+(timed?'45 s':'8-10')+'" aria-label="'+(timed?'Tiempo':'Reps')+' objetivo, serie '+(j+1)+'">'+
      '<input class="co-target" data-coach="rt-targetkg" data-i="'+i+'" data-j="'+j+'" value="'+esc(st.targetKg||"")+'" placeholder="kg" aria-label="Peso propuesto, serie '+(j+1)+'">'+
      '<button class="co-set-rm" data-coach="rt-setdel" data-i="'+i+'" data-j="'+j+'" title="Quitar serie" aria-label="Quitar serie '+(j+1)+'">\u2715</button>'+
    '</div>').join("");
  const setsTbl=nSets ? '<div class="co-set-head"><span>#</span><span>'+(timed?'Tiempo objetivo':'Reps objetivo')+'</span><span>'+(timed?'Peso (opcional)':'Peso propuesto')+'</span><span></span></div>'+sets : '';
  // Última vez del cliente + la sugerencia de GIZE para cargarla de un toque como propuesta.
  const sg=lastLog ? suggest(ex, lastLog.sets, timed) : null;
  const lastBox=nSets ? '<div class="co-last">'+
      (lastLog ? '<div class="co-last-t">Última vez ('+esc(fmtShort(lastLog.date))+')</div><div class="co-last-sets">'+lastLog.sets.map(st=>'<span>'+esc(setTxt(st))+'</span>').join('')+'</div>' : '<div class="co-last-t">Todavía no hizo este ejercicio.</div>')+
      (sg && sg.kg ? '<button type="button" class="co-last-use" data-coach="rt-sug-fill" data-i="'+i+'" data-kg="'+sg.kg+'">Proponer '+esc(kgText(sg.kg))+' kg <small>('+esc(coachWhy(sg.why))+')</small></button>' : '')+
    '</div>' : '';
  const prog=exSummary(d, day.name, ex.name);
  const field=(lbl, a, v, ph, cls)=>'<label class="co-pfield"><span class="co-note-lbl">'+lbl+'</span><input class="co-pin'+(cls||"")+'" data-coach="'+a+'" data-i="'+i+'" value="'+esc(v||"")+'" placeholder="'+ph+'"></label>';
  return '<div class="co-exc co-exc-open'+ssCls+'" data-id="'+esc(ex.id)+'">'+
      '<div class="co-exc-head" data-coach="rt-toggle" data-i="'+i+'" data-id="'+esc(ex.id)+'">'+
        swatch+ord+
        '<input class="co-exc-name" data-coach="rt-name" data-i="'+i+'" value="'+esc(ex.name||"")+'" list="exList" placeholder="Nombre del ejercicio">'+
        chevron+
      '</div>'+
      actions+
      '<div class="co-exc-body">'+
        '<div class="co-mode"><span class="co-note-lbl">Se mide por</span><div class="co-seg" role="radiogroup" aria-label="Se mide por">'+
          '<button type="button" class="co-seg-opt'+(timed?'':' on')+'" role="radio" aria-checked="'+(!timed)+'" data-coach="rt-timed" data-i="'+i+'" data-v="0">Reps</button>'+
          '<button type="button" class="co-seg-opt'+(timed?' on':'')+'" role="radio" aria-checked="'+timed+'" data-coach="rt-timed" data-i="'+i+'" data-v="1">Tiempo</button>'+
        '</div></div>'+
        '<div class="co-prow">'+
          field("RIR","rt-rir",ex.rir,"2-0")+
          field("Descanso","rt-rest",ex.rest,"90 seg")+
        '</div>'+
        '<div class="co-note-wrap"><span class="co-note-lbl">Objetivo de progreso</span><input class="co-note" data-coach="rt-goal" data-i="'+i+'" value="'+esc(ex.goal||"")+'" placeholder="Ej: sumar 1 rep por semana"></div>'+
        lastBox+setsTbl+
        '<button class="co-set-add" data-coach="rt-setadd" data-i="'+i+'">+ Serie</button>'+
        '<div class="co-note-wrap"><span class="co-note-lbl">Nota para el cliente</span><textarea class="co-note co-note-area" rows="2" data-coach="rt-note" data-i="'+i+'" placeholder="Técnica, tempo, qué cuidar…">'+esc(ex.note||"")+'</textarea></div>'+
        '<div class="co-note-wrap"><span class="co-note-lbl">Link de video</span><input class="co-note" type="url" inputmode="url" data-coach="rt-video" data-i="'+i+'" value="'+esc(ex.video||"")+'" placeholder="Pegá el link de YouTube o Instagram">'+libVideoHint(ex)+'</div>'+
        '<details class="co-exc-fold"><summary>Ver progreso'+(prog?' <span class="co-exc-fold-hint">('+esc(prog)+')</span>':'')+'</summary><div class="co-exc-prog">'+exChart(d, day.name, ex.name)+'</div><div class="co-exc-tbl">'+exTable(d, day.name, ex.name)+'</div></details>'+
      '</div>'+
    '</div>';
}

const linkSvg='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>';

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
  const tabs=rt.map((x,i)=>'<button class="co-daytab'+(i===CoachState.coachEditDay?' on':'')+'" data-coach="edit-day" data-i="'+i+'">'+esc(x.name||('D\u00eda '+(i+1)))+'</button>').join("");
  const day=rt[CoachState.coachEditDay];
  const totalSets=(day.exercises||[]).reduce((n,x)=>n+((x.sets||[]).length),0);
  const totalEx=(day.exercises||[]).length;
  // Entre dos ejercicios: + para insertar y el botón para unirlos en superserie (o separarlos).
  const exs=day.exercises||[], groups=ssGroups(exs);
  const cards=exs.map((ex,i)=>{
    const prevSS=i>0 && !!exs[i-1].ss;
    const link=i>0 ? '<button class="co-ss-link'+(prevSS?' on':'')+'" data-coach="rt-ss" data-i="'+(i-1)+'" aria-pressed="'+prevSS+'">'+linkSvg+'<span>'+(prevSS?'Separar':'Unir en superserie')+'</span></button>' : '';
    // Los unidos van en un solo panel: cabecera arriba y "sin descanso" entre ejercicios.
    const g=groups.find(x=>i>=x.start && i<=x.end);
    const gap='<div class="co-gap"><button class="co-rt-ins" data-coach="rt-ins" data-i="'+i+'" title="Insertar ejercicio ac\u00e1">+</button>'+link+'</div>';
    const open=g && i===g.start ? '<div class="co-ss-group"><div class="co-ss-head">'+linkSvg+ssName(g)+' '+g.letter+'<button class="co-ss-split" data-coach="rt-ss-split" data-i="'+g.start+'">Separar</button><span>una serie de cada uno, sin descanso entre medio</span></div>' : '';
    const div=g && i>g.start ? '<div class="ss-div" aria-hidden="true"><span>sin descanso</span></div>' : '';
    return (g && i>g.start ? '' : gap)+open+(g && i>g.start ? gap+div : '')+exerciseCard(d, day, ex, i, rt)+(g && i===g.end ? '</div>' : '');
  }).join("");
  return '<div class="co-sec">Rutina y progreso</div>'+coachDatalist()+
    '<div class="co-daytabs">'+tabs+'<button class="co-daytab add" data-coach="day-add">+</button></div>'+
    '<div class="co-day-card">'+
      '<div class="co-day-head-row">'+
        '<input class="co-dayname" data-coach="day-name" value="'+esc(day.name||"")+'" placeholder="Nombre del d\u00eda">'+
      '</div>'+
      // Mover el día entero antes o después (ej. Espalda antes que Pecho) sin rearmarlo.
      // Para pasar de un día a otro están las pestañas de arriba.
      (rt.length>1 ? '<span class="co-note-lbl co-day-move-lbl">Mover este d\u00eda</span><div class="co-day-move">'+
        '<button class="co-day-mv" data-coach="day-left" aria-label="Mover este d\u00eda antes"'+(CoachState.coachEditDay===0?' disabled':'')+'>'+chevronLeftSvg+'<span>Antes</span></button>'+
        '<button class="co-day-mv" data-coach="day-right" aria-label="Mover este d\u00eda despu\u00e9s"'+(CoachState.coachEditDay===rt.length-1?' disabled':'')+'><span>Despu\u00e9s</span>'+chevronRightSvg+'</button>'+
        '<button class="co-day-del" data-coach="day-del">Borrar d\u00eda</button>'+
      '</div>' : '')+
      '<div class="co-daystats"><span class="co-stat"><b>'+totalEx+'</b> ejercicio'+(totalEx===1?'':'s')+'</span><span class="co-stat"><b>'+totalSets+'</b> serie'+(totalSets===1?'':'s')+' en total</span></div>'+
      '<div class="co-note-wrap"><span class="co-note-lbl">Nota general de este d\u00eda (la ve el cliente al entrar)</span><input class="co-note" data-coach="day-note" value="'+esc(day.note||"")+'" placeholder=""></div>'+
    '</div>'+
    // Sugerencia automática de peso: una sola llave para toda la rutina (la ve el cliente en
    // cada ejercicio sin peso propuesto). Se guarda como noSug en los días.
    (()=>{ const off=rt.some(x=>x.noSug); return '<div class="co-sug-all"><div class="co-sug-txt"><b>Sugerencia automática de peso</b>'+(off?'Apagada: el cliente solo ve el peso que vos propongas.':'GIZE le sugiere el peso según su última vez, salvo donde cargues tu peso propuesto.')+'</div><button type="button" class="co-sug-tg'+(off?'':' on')+'" data-coach="rt-nosug-all" role="switch" aria-checked="'+(!off)+'" aria-label="Sugerencia automática de peso"><span></span></button></div>'; })()+
    '<div class="co-exc-section-head"><span class="co-sec" style="margin:0">Ejercicios</span><button class="co-rt-add" data-coach="rt-add">+ Agregar ejercicio</button></div>'+
    (cards||'<div class="cal-hint">D\u00eda vac\u00edo. Agreg\u00e1 ejercicios ac\u00e1 abajo.</div>')+
    (cards ? '<button class="co-rt-add-end" data-coach="rt-add">+ Agregar ejercicio al final</button>' : '')+
    (CoachState.coachTplEdit ? '' : '<button class="co-save-rt" data-coach="save-routine">Guardar rutina</button>')+
    (CoachState.coachTplEdit ? "" : "<div class='rt-actions'><button class='co-copy-btn' data-coach='rt-apply'>"+downloadSvg+" Aplicar una de mis rutinas</button><button class='co-copy-btn' data-coach='rt-copy'>"+copySvg+" Copiar a otro cliente</button><button class='co-copy-btn' data-coach='rt-tosave'>"+saveSvg+" Guardar como rutina</button></div>");
}

export function coachPickerMarkup(){
  const q=CoachState.coachPQ.trim().toLowerCase();
  let inner;
  if(q){
    const res=[]; Object.keys(EX_DB).forEach(k=>EX_DB[k].forEach(n=>{ if(n.toLowerCase().indexOf(q)>=0) res.push(n); }));
    inner='<div class="cp-exs">'+(res.length?res.map(n=>'<button class="cp-ex" data-cp="choose" data-name="'+esc(n)+'">'+esc(n)+'</button>').join(""):'<div class="cal-hint">Sin resultados</div>')+'</div>';
  } else if(!CoachState.coachPCat){
    inner='<div class="cp-step">1. Eleg\u00ed el grupo muscular</div><div class="cp-cats">'+EX_CATS.map(c=>'<button class="cp-cat" data-cp="cat" data-c="'+c[0]+'">'+c[1]+'</button>').join("")+'</div>';
  } else {
    const lb=(EX_CATS.find(c=>c[0]===CoachState.coachPCat)||["",""])[1];
    inner='<div class="cp-bar"><button class="cp-back" data-cp="cats">\u2039 Grupos</button><span class="cp-catname">'+esc(lb)+'</span></div>'+
      '<div class="cp-exs">'+(EX_DB[CoachState.coachPCat]||[]).map(n=>'<button class="cp-ex" data-cp="choose" data-name="'+esc(n)+'">'+esc(n)+'</button>').join("")+'</div>';
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

export function cpApply(name){
  if(!rtDays()) return;
  const day=(rtDays()||[])[CoachState.coachEditDay]; if(!day) return;
  const mm=(muscleOf(name)!=="otros")?muscleOf(name):(CoachState.coachPCat||"otros");
  let ex;
  if(CoachState.coachPicker.mode==="swap"){ ex=day.exercises[CoachState.coachPicker.i]; if(ex){ ex.name=name; ex.mus=mm; } }
  else if(CoachState.coachPicker.mode==="insert"){ ex=mkEx(name,3,mm); day.exercises.splice(CoachState.coachPicker.idx,0,ex); }
  else { ex=mkEx(name,3,mm); day.exercises.push(ex); }
  // el ejercicio recién agregado/cambiado arranca expandido para que el coach lo complete
  // de una — el resto del día sigue colapsado (ver CoachState.coachExpandedEx).
  if(ex) CoachState.coachExpandedEx.add(ex.id);
  closeSheet(()=>{ CoachState.coachPicker=null; renderCoachPicker(); renderCoach(); }, {host:"#coachSheetHost", card:".cp-modal", duration:150});
}
