// Planes alimenticios guardados del coach («Mis planes»), como «Mis rutinas» pero con el plan
// nutricional: el coach guarda el plan de un cliente (o arma uno de cero) y después se lo
// aplica a uno o a varios clientes. Se guardan en public.coach_meal_templates (ver
// supabase/planes-alimenticios-guardados.sql) y al aplicarlos se copia el plan entero a
// public.nutrition de cada cliente, igual que «Guardar plan nutricional».

import { State } from '../../core/state.js';
import { esc, num } from '../../core/utils.js';
import { downloadSvg, saveSvg } from '../../core/icons.js';
import { sbOk } from '../../core/supabase.js';
import { closeSheet } from '../../ui/sheet.js';
import { CoachState } from './state.js';
import { renderCoach } from './index.js';
import { planDefault } from './rutinas.js';

const TABLE = "coach_meal_templates";
const copy = o => JSON.parse(JSON.stringify(o == null ? {} : o));

export async function loadMealTpls(){
  CoachState.mealTplsError=null;
  if(!State.sb||!State.cloudUser){ CoachState.mealTplsError="Sin conexión a la cuenta."; return; }
  try{
    const r=await State.sb.from(TABLE).select("*").eq("coach_id",State.cloudUser.id).order("name");
    if(r.error){ CoachState.mealTplsError=r.error.message||String(r.error); CoachState.coachMealTpls=[]; }
    else CoachState.coachMealTpls=r.data||[];
  }catch(e){ CoachState.mealTplsError=(e&&e.message)||String(e); CoachState.coachMealTpls=[]; console.error("mealTpls",e); }
}

// El plan tal como se guarda (sin los campos de trabajo del editor, que empiezan con «_»).
export function cleanPlan(p){
  p=p||planDefault();
  return {trainDays:p.trainDays||[], restDays:p.restDays||[], water:p.water||"", salt:p.salt||"", guidelines:p.guidelines||[], supps:p.supps||[], options:p.options||[], extras:p.extras||[], swaps:p.swaps||[], cardio:p.cardio||{text:"",items:[]}, habits:p.habits||[], habitDays:(p.habits||[]).map((_,i)=>{ const d=Array.isArray(p.habitDays)&&p.habitDays[i]; return Array.isArray(d)&&d.length&&d.length<7?d:null; })};
}

// Fila de public.nutrition para un cliente. Los totales de los días de entreno van también
// como macros "globales" (compatibilidad con el banner del cliente).
export function nutritionRow(p, clientId, keepLegacy){
  p=p||planDefault();
  let tk=0,tp=0,tc=0,tf=0; (p.trainDays||[]).forEach(r=>{ tk+=num(r.kcal); tp+=num(r.prot); tc+=num(r.cho); tf+=num(r.fat); }); tk=Math.round(tk); tp=Math.round(tp); tc=Math.round(tc); tf=Math.round(tf);
  const L=keepLegacy?p:{};
  const row={client_id:clientId, kcal:tk||parseInt(L._kcal)||null, protein:tp||parseInt(L._protein)||null, carbs:tc||parseInt(L._carbs)||null, fat:tf||parseInt(L._fat)||null, plan:JSON.parse(JSON.stringify(cleanPlan(p))), updated_at:new Date().toISOString(), updated_by:State.cloudUser.id};
  // La nota vieja del plan (columna notes) se respeta: aplicar un plan guardado no la borra.
  if(keepLegacy) row.notes=p._notes||null;
  return row;
}

// ¿El plan del cliente que se está editando tiene cambios sin guardar?
export function clientPlanDirty(){
  const d=CoachState.coachData, f=CoachState.coachPlanForm; if(!d||!f) return false;
  const saved=Object.assign(planDefault(), (d.plan&&d.plan.plan)?copy(d.plan.plan):{});
  return JSON.stringify(cleanPlan(f))!==JSON.stringify(cleanPlan(saved));
}

// Editor de un plan guardado: cambios sin guardar.
const mealSnap = e => JSON.stringify([e.name||"", cleanPlan(e.plan)]);
export function mealDirty(){ const e=CoachState.coachMealEdit; return !!(e && e.orig0!==undefined && mealSnap(e)!==e.orig0); }
export function snapMealEdit(){ const e=CoachState.coachMealEdit; if(e && e.orig0===undefined) e.orig0=mealSnap(e); }
window.addEventListener("beforeunload", ev => { if(mealDirty()){ ev.preventDefault(); ev.returnValue=""; } });

function mealMeta(plan){
  const p=plan||{};
  const n=(p.trainDays||[]).length; let k=0; (p.trainDays||[]).forEach(r=>{ k+=num(r.kcal); }); k=Math.round(k);
  const o=(p.options||[]).length;
  const bits=[n?n+" comida"+(n===1?"":"s"):"", k?k+" kcal":"", o?"menú con opciones":""].filter(Boolean);
  return bits.length?bits.join(" · "):"Sin cargar";
}

const missingHint = err => '<div class="cal-hint" style="color:var(--red)">No se pudieron cargar tus planes: <b>'+esc(err)+'</b><br><br>Si dice que la tabla no existe, falta correr el SQL de planes en Supabase (supabase/planes-alimenticios-guardados.sql).</div>';
export const mealMissingMsg = "Falta correr el SQL de planes en Supabase.";
const isMissing = err => /coach_meal_templates|does not exist|schema cache|not find the table|PGRST205|42P01/i.test(String(err||""));

// Pestaña «Mis planes» del panel principal.
export function renderMealTplList(){
  const L=CoachState.coachMealTpls;
  const items=L.length ? L.map(t=>
    '<div class="co-item tpl-item" data-coach="mp-open" data-id="'+esc(t.id)+'">'+
      '<div class="co-name">'+esc(t.name||"Sin nombre")+'</div>'+
      '<div class="co-item-meta">'+esc(mealMeta(t.plan))+'</div>'+
      '<div class="co-arrow">›</div></div>').join("")
    : (CoachState.mealTplsError ? missingHint(CoachState.mealTplsError) : '<div class="cal-hint">Todavía no guardaste ningún plan. Armá uno acá o, desde el plan alimenticio de un cliente, tocá «Guardar como plan». Después se lo aplicás a los clientes que quieras.</div>');
  return '<div class="co-items">'+items+'</div>'+
    (CoachState.mealTplsError && !L.length ? '' : '<button class="co-add-day" data-coach="mp-new">+ Crear plan nuevo</button>');
}

// Cabecera y pie del editor de un plan guardado (el medio es el mismo editor del plan del cliente).
export function mealEditHead(){
  const e=CoachState.coachMealEdit;
  return '<div class="co-head"><button class="co-back" data-coach="mp-back">‹ Volver</button>'+
    '<button class="co-logout" data-coach="mp-del">'+(e.id?'Borrar plan':'Descartar')+'</button></div>'+
    '<div class="ci-f" style="margin-bottom:14px"><label>Nombre del plan</label><input class="co-note" data-coach="mp-name" maxlength="120" value="'+esc(e.name||"")+'"></div>';
}
export function mealEditFoot(){
  const e=CoachState.coachMealEdit;
  return (mealDirty()?'<div class="co-unsaved">Cambios sin guardar. Tocá <b>Guardar plan</b>.</div>':'')+
    '<button class="co-save-rt" data-coach="mp-save">Guardar plan</button>'+
    (e.id?'<div class="rt-actions"><button class="co-copy-btn" data-coach="mp-apply-many">'+downloadSvg+' Aplicar a clientes</button></div>':'');
}
// Botones del plan del cliente.
export function clientPlanActions(){
  return '<div class="rt-actions"><button class="co-copy-btn" data-coach="mp-tosave">'+saveSvg+' Guardar como plan</button>'+
    '<button class="co-copy-btn" data-coach="mp-apply">'+downloadSvg+' Aplicar un plan guardado</button></div>';
}

// Selector (en #applyMount, como el de rutinas): {mode:"one"} elige un plan para el cliente
// abierto; {mode:"many", tplId, sel} elige a qué clientes se le aplica un plan guardado.
function pickerMarkup(){
  const st=CoachState.coachMealPicker;
  if(st.mode==="one"){
    let opts;
    if(st.loading) opts='<div class="cal-hint">Cargando tus planes…</div>';
    else if(CoachState.mealTplsError) opts=missingHint(CoachState.mealTplsError);
    else if(!CoachState.coachMealTpls.length) opts='<div class="cal-hint">Todavía no tenés planes guardados.<br>Tocá «Guardar como plan» en un plan que te guste, o armá uno en el panel principal → pestaña «Mis planes».</div>';
    else opts=CoachState.coachMealTpls.map(t=>'<div class="cp-copt" data-coach="mpk-tpl" data-id="'+esc(t.id)+'">'+esc(t.name||"Sin nombre")+'<span class="ap-meta">'+esc(mealMeta(t.plan))+'</span></div>').join("");
    return '<div class="cp-title">Aplicar un plan guardado</div>'+
      '<div class="cp-sub">'+(st.busy?'Aplicando…':'Elegí cuál de tus planes querés usar. Reemplaza el plan alimenticio que tenga '+esc((CoachState.coachData&&CoachState.coachData.name)||"el cliente")+'.')+'</div>'+
      '<div class="cp-clist">'+opts+'</div>'+
      '<button class="logout-btn" data-coach="mpk-cancel">Cancelar</button>';
  }
  const tpl=CoachState.coachMealTpls.find(t=>t.id===st.tplId);
  const sel=st.sel||{};
  const cl=CoachState.coachClients;
  const rows=cl.length ? cl.map(c=>{ const on=!!sel[c.id];
    return '<div class="ap-day'+(on?' on':'')+'" data-coach="mpk-cli" data-id="'+esc(c.id)+'" role="checkbox" aria-checked="'+on+'">'+
      '<span class="ap-chk">'+(on?'✓':'')+'</span><span class="ap-dname">'+esc(c.full_name||c.email||"Cliente")+'</span></div>'; }).join("")
    : '<div class="cal-hint">No tenés clientes vinculados.</div>';
  const n=cl.filter(c=>sel[c.id]).length, all=cl.length && n===cl.length;
  return '<div class="cp-title">'+esc((tpl&&tpl.name)||"Plan")+'</div>'+
    '<div class="cp-sub">'+(st.busy?'Aplicando…':'Elegí a qué clientes se lo aplicás. Reemplaza el plan alimenticio que tenga cada uno.')+'</div>'+
    (cl.length>1?'<button class="co-copy-btn" style="margin-bottom:8px" data-coach="mpk-all">'+(all?'Destildar todos':'Elegir todos')+'</button>':'')+
    '<div class="ap-days">'+rows+'</div>'+
    '<button class="co-save-rt" data-coach="mpk-confirm"'+(n&&!st.busy?'':' disabled')+'>Aplicar a '+n+' cliente'+(n===1?'':'s')+'</button>'+
    '<button class="logout-btn" style="margin-top:8px" data-coach="mpk-cancel">Cancelar</button>';
}

export function renderMealPicker(){
  let el=document.getElementById("applyMount");
  if(!el){ el=document.createElement("div"); el.id="applyMount"; document.body.appendChild(el); }
  if(!CoachState.coachMealPicker){ el.innerHTML=""; return; }
  const ex=el.querySelector(".cp-ccard");
  if(ex){ ex.innerHTML=pickerMarkup(); return; }
  el.innerHTML='<div class="cp-bg" data-coach="mpk-cancel"></div><div class="cp-ccard">'+pickerMarkup()+'</div>';
}
const closePicker = then => closeSheet(()=>{ CoachState.coachMealPicker=null; renderMealPicker(); if(then) then(); }, {host:"#applyMount", card:".cp-ccard", duration:150});

const errMsg = e => { const m=(e&&e.message)||String(e); return isMissing(m) ? mealMissingMsg+" ("+m+")" : m; };

// Aplica una copia del plan guardado al cliente (reemplaza su plan en public.nutrition).
async function applyTo(clientId, tpl){
  const plan=Object.assign(planDefault(), copy(tpl.plan));
  const row=nutritionRow(plan, clientId, false);
  sbOk(await State.sb.from("nutrition").upsert(row,{onConflict:"client_id"}));
  return row;
}

// Acciones de «Mis planes». Devuelve true si la manejó.
export async function mealAction(a, b){
  if(a==="view-meals"){ CoachState.coachView="meals"; await loadMealTpls(); renderCoach(); return true; }
  if(a==="mp-new"){ CoachState.coachMealEdit={id:null, name:"", plan:planDefault()}; CoachState.coachPlanSec=null; CoachState.coachOptOpen=null; renderCoach(); window.scrollTo(0,0); return true; }
  if(a==="mp-open"){
    const t=CoachState.coachMealTpls.find(x=>x.id===b.dataset.id); if(!t) return true;
    CoachState.coachMealEdit={id:t.id, name:t.name||"", plan:Object.assign(planDefault(), copy(t.plan))};
    CoachState.coachPlanSec=null; CoachState.coachOptOpen=null; renderCoach(); window.scrollTo(0,0); return true;
  }
  if(a==="mp-back"){
    if(CoachState.coachPlanSec){ CoachState.coachPlanSec=null; renderCoach(); return true; }
    if(mealDirty() && !confirm("Tenés cambios sin guardar. ¿Salir igual y perderlos?")) return true;
    CoachState.coachMealEdit=null; CoachState.coachView="meals"; renderCoach(); window.scrollTo(0,0); return true;
  }
  if(a==="mp-save"){
    const e=CoachState.coachMealEdit; if(!e) return true;
    const nm=(e.name||"").trim();
    if(!nm){ alert("Ponele un nombre al plan."); return true; }
    b.disabled=true; b.textContent="Guardando...";
    try{
      const row={coach_id:State.cloudUser.id, name:nm, plan:cleanPlan(e.plan), updated_at:new Date().toISOString()};
      if(e.id) row.id=e.id;
      const r=await State.sb.from(TABLE).upsert(row).select();
      if(r.error) throw r.error;
      const saved=(r.data&&r.data[0])||null;
      if(saved&&saved.id) e.id=saved.id;
      e.name=nm; e.orig0=mealSnap(e);
      await loadMealTpls(); alert("Plan guardado ✓");
    }catch(err){ alert("No se pudo guardar: "+errMsg(err)); }
    renderCoach(); return true;
  }
  if(a==="mp-del"){
    const e=CoachState.coachMealEdit;
    if(!e||!e.id){ CoachState.coachMealEdit=null; CoachState.coachView="meals"; renderCoach(); return true; }
    if(!confirm("¿Borrar este plan guardado? No cambia el plan de los clientes que ya lo tienen aplicado.")) return true;
    try{ sbOk(await State.sb.from(TABLE).delete().eq("id",e.id)); await loadMealTpls(); }catch(err){ alert("No se pudo: "+errMsg(err)); return true; }
    CoachState.coachMealEdit=null; CoachState.coachView="meals"; renderCoach(); return true;
  }
  // Desde el plan del cliente: guardarlo en «Mis planes».
  if(a==="mp-tosave"){
    const d=CoachState.coachData; if(!d||!d.id) return true;
    const def="Plan de "+String(d.name||"cliente").split(" ")[0];
    const nm=prompt("Nombre para guardar este plan en «Mis planes»:", def);
    if(!nm||!nm.trim()) return true;
    const f=CoachState.coachPlanForm || Object.assign(planDefault(), (d.plan&&d.plan.plan)?copy(d.plan.plan):{});
    try{
      const r=await State.sb.from(TABLE).insert({coach_id:State.cloudUser.id, name:nm.trim().slice(0,120), plan:copy(cleanPlan(f))}).select();
      if(r.error) throw r.error;
      await loadMealTpls(); alert("Guardado en «Mis planes» ✓");
    }catch(err){ alert("No se pudo guardar: "+errMsg(err)); }
    return true;
  }
  if(a==="mp-apply"){
    if(!CoachState.coachData||!CoachState.coachData.id) return true;
    CoachState.coachMealPicker={mode:"one", loading:true}; renderMealPicker();
    await loadMealTpls();
    if(CoachState.coachMealPicker){ CoachState.coachMealPicker.loading=false; renderMealPicker(); }
    return true;
  }
  if(a==="mp-apply-many"){
    const e=CoachState.coachMealEdit; if(!e||!e.id) return true;
    if(mealDirty()){ alert("Primero tocá «Guardar plan»: se aplica el plan guardado."); return true; }
    CoachState.coachMealPicker={mode:"many", tplId:e.id, sel:{}}; renderMealPicker(); return true;
  }
  if(a==="mpk-cancel"){ const st=CoachState.coachMealPicker; if(st&&st.busy) return true; closePicker(); return true; }
  if(a==="mpk-cli"){ const st=CoachState.coachMealPicker; if(!st||st.busy) return true; st.sel[b.dataset.id]=!st.sel[b.dataset.id]; renderMealPicker(); return true; }
  if(a==="mpk-all"){ const st=CoachState.coachMealPicker; if(!st||st.busy) return true; const all=CoachState.coachClients.every(c=>st.sel[c.id]); st.sel={}; if(!all) CoachState.coachClients.forEach(c=>{ st.sel[c.id]=true; }); renderMealPicker(); return true; }
  if(a==="mpk-tpl"){
    const st=CoachState.coachMealPicker, d=CoachState.coachData; if(!st||st.busy||!d||!d.id) return true;
    const tpl=CoachState.coachMealTpls.find(t=>t.id===b.dataset.id); if(!tpl) return true;
    const who=d.name||"este cliente";
    if(!confirm("¿Aplicar «"+(tpl.name||"este plan")+"» a "+who+"?\n\nReemplaza el plan alimenticio que tiene ahora"+(clientPlanDirty()?" y se pierden los cambios sin guardar":"")+".")) return true;
    st.busy=true; renderMealPicker();
    try{
      const row=await applyTo(d.id, tpl);
      if(CoachState.coachData===d){ row.notes=(d.plan&&d.plan.notes)||null; d.plan=row; CoachState.coachPlanForm=null; CoachState.coachPlanSec=null; }
      closePicker(()=>renderCoach());
      alert("Plan aplicado a "+who+" ✓");
    }catch(err){ st.busy=false; renderMealPicker(); alert("No se pudo aplicar: "+errMsg(err)); }
    return true;
  }
  if(a==="mpk-confirm"){
    const st=CoachState.coachMealPicker; if(!st||st.busy) return true;
    const tpl=CoachState.coachMealTpls.find(t=>t.id===st.tplId); if(!tpl) return true;
    const to=CoachState.coachClients.filter(c=>st.sel[c.id]);
    if(!to.length){ alert("Elegí al menos un cliente."); return true; }
    if(!confirm("¿Aplicar «"+(tpl.name||"este plan")+"» a "+to.length+" cliente"+(to.length===1?"":"s")+"?\n\nReemplaza el plan alimenticio que tenga cada uno.")) return true;
    st.busy=true; renderMealPicker();
    const bad=[];
    for(const c of to){ try{ await applyTo(c.id, tpl); }catch(err){ bad.push((c.full_name||c.email||"Cliente")+": "+errMsg(err)); } }
    st.busy=false;
    if(bad.length){ renderMealPicker(); alert("Se aplicó a "+(to.length-bad.length)+" de "+to.length+". No se pudo con:\n"+bad.join("\n")); return true; }
    closePicker();
    alert("Plan aplicado a "+to.length+" cliente"+(to.length===1?"":"s")+" ✓");
    return true;
  }
  return false;
}
