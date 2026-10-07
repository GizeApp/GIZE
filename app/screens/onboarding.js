import { auIcoTicket, checkSvg } from '../core/icons.js';

import { State, state } from '../core/state.js';
import { diaDeHoy } from '../core/diasemana.js';

import { esc } from '../core/utils.js';

import { applyBrand, loadCloud } from '../core/supabase.js';

import { save } from '../core/storage.js';

import { DISCIPLINAS, myDisciplinas, toggleDisciplina } from '../core/disciplinas.js';

import { CATALOGO, cargarCatalogo, copiarDias, diasDeEntreno, rutinasDeDias, rutinasPara } from '../core/rutinas-ejemplo.js';

import { hideSilkBg, showSilkBg } from '../ui/background.js';

import { CoachState } from './coach/state.js';

import { renderApp } from '../main.js';

import { appIOS, joinMsgTienda } from '../core/tienda.js';

// Bienvenida del primer ingreso. Antes todo esto iba en el formulario de "Crear cuenta"
// (aviso de la prueba, código del coach) y era demasiado de golpe: ahora el registro pide
// lo justo y esto aparece una sola vez, ya adentro, encima de la app.
//   Coach:   "¡Bienvenido, coach!" con su código para pasarle al primer alumno.
//   Cliente: "¡Bienvenido!" y después el código de su coach (opcional).
// Solo para cuentas nuevas (creadas hace menos de 7 días): las de antes no la ven nunca.
// Se marca como vista por cuenta en este dispositivo.
const SEEN_PREFIX = "gize_onb_";
const NEW_ACCOUNT_MS = 7*24*3600000;

const seenKey = () => SEEN_PREFIX + State.cloudUser.id;
function markSeen(){ try{ localStorage.setItem(seenKey(), "1"); }catch(e){} }

export function maybeShowOnboarding(){
  const u=State.cloudUser, p=State.cloudProfile;
  if(!u || !p || !u.created_at) return;
  if(Date.now()-Date.parse(u.created_at) > NEW_ACCOUNT_MS) return;
  try{ if(localStorage.getItem(seenKey())) return; }catch(e){ return; }
  // Ya está abierta (afterLogin corrió dos veces, p. ej. al volver de Apple o Google): no se
  // vuelve a empezar desde «¡Bienvenido!» con lo que ya eligió.
  if(document.querySelector("#authHost .onb-card")) return;
  if(p.role==="coach") showCoachWelcome(); else showClientWelcome();
}

function mount(inner, label){
  const host=document.getElementById("authHost"); if(!host) return null;
  host.style.display="flex";
  hideSilkBg();
  host.innerHTML=
    '<div class="gize-aurora auth-aurora" aria-hidden="true"><span></span><span></span><span></span><span></span></div>'+
    '<div class="auth-card onb-card" role="dialog" aria-modal="true" aria-label="'+label+'" tabindex="-1">'+
      '<div class="auth-brand-ic" aria-hidden="true"><img src="brand/logo/gize-marca-blanca.svg" alt=""></div>'+
      inner+
    '</div>';
  // Cada paso arranca arriba de todo (el anterior pudo haber quedado corrido).
  host.scrollTop=0; host.scrollLeft=0;
  // El foco va a la tarjeta (lector de pantalla) y no al campo: en el celular abriría el teclado.
  host.querySelector(".onb-card").focus({preventScroll:true});
  return host;
}

function close(){
  markSeen();
  const h=document.getElementById("authHost"); if(h){ h.style.display="none"; h.innerHTML=""; }
  showSilkBg(); // la app ya está dibujada por detrás: solo vuelve el fondo animado
}

function showCoachWelcome(){
  const code=CoachState.coachInvite;
  const host=mount(
    '<h1 class="onb-title">¡Bienvenido, coach!</h1>'+
    // En la app de iPhone no se habla de la prueba (core/tienda.js).
    (appIOS() ? '' : '<div class="onb-trial">14 días gratis para probar todo · sin tarjeta</div>')+
    '<p class="onb-text">Pasale este código a tu primer alumno. Lo carga una vez y quedan conectados.</p>'+
    (code ?
      '<div class="onb-code">'+
        '<div class="onb-code-lbl">Tu código</div>'+
        '<div class="onb-code-row"><span class="onb-code-val">'+esc(code)+'</span>'+
        '<button type="button" class="onb-copy" data-onb="copy">Copiar</button></div>'+
      '</div>' :
      '<p class="onb-text">Tu código de invitación aparece arriba de todo en tu panel.</p>')+
    '<button type="button" class="gize-btn auth-btn onb-main" data-onb="done">Ir a mi panel</button>',
    "Bienvenida");
  if(!host) return;
  host.onclick=async e=>{
    const b=e.target.closest("[data-onb]"); if(!b) return;
    if(b.dataset.onb==="done"){ host.onclick=null; close(); return; }
    if(b.dataset.onb==="copy"){
      try{ await navigator.clipboard.writeText(code); }
      catch(err){ alert("No se pudo copiar. Código: "+code); return; }
      b.innerHTML=checkSvg+" Copiado"; b.classList.add("copied");
      setTimeout(()=>{ b.textContent="Copiar"; b.classList.remove("copied"); }, 1600);
    }
  };
}

function showClientWelcome(){
  const host=mount(
    '<div class="auth-logo"><img src="brand/logo/gize-logotipo.svg" alt="GIZE"></div>'+
    '<h1 class="onb-title onb-title-gap">¡Bienvenido!</h1>'+
    '<p class="onb-text">Tu coach arma el plan, vos registrás cada serie y los dos ven la evolución.</p>'+
    '<button type="button" class="gize-btn auth-btn onb-main" data-onb="start">Empezar</button>',
    "Bienvenida");
  if(!host) return;
  host.onclick=e=>{
    if(!e.target.closest('[data-onb="start"]')) return;
    host.onclick=null;
    showDisciplina();
  };
}

// ¿Qué entrenás? (una o más; se puede saltear y cambiar en Ajustes). Con eso el buscador de
// ejercicios muestra primero lo suyo, y su coach la ve en la ficha (core/disciplinas.js).
function showDisciplina(){
  const mine=myDisciplinas().map(d=>d.id);
  const host=mount(
    '<h1 class="onb-title">¿Qué entrenás?</h1>'+
    '<p class="onb-text">Podés elegir más de una. Te mostramos primero esos ejercicios.</p>'+
    '<div class="onb-disc">'+DISCIPLINAS.map(d=>'<button type="button" class="onb-num onb-disc-opt'+(mine.includes(d.id)?' on':'')+'" data-onb="disc" data-v="'+d.id+'" aria-pressed="'+mine.includes(d.id)+'">'+esc(d.name)+'</button>').join("")+'</div>'+
    '<button type="button" class="gize-btn auth-btn onb-main" data-onb="dnext">Continuar</button>'+
    '<button type="button" class="onb-alt" data-onb="dskip">Saltear</button>',
    "Tu disciplina");
  if(!host) return;
  host.onclick=e=>{
    const b=e.target.closest("[data-onb]"); if(!b) return;
    if(b.dataset.onb==="disc"){
      toggleDisciplina(b.dataset.v); save();
      const on=myDisciplinas().some(d=>d.id===b.dataset.v);
      b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on));
      return;
    }
    host.onclick=null;
    // Ya vinculado (código de un intento anterior de registro): no se le pide de nuevo.
    // Con coach, la rutina la arma el coach: no se le ofrece armar una.
    if(State.cloudProfile && State.cloudProfile.coach_id) close();
    else showClientCode();
  };
}

function showClientCode(msg, value){
  const host=mount(
    '<h1 class="onb-title">¿Tenés un código de tu coach?</h1>'+
    '<p class="onb-text">Es opcional. Con el código, tu coach te arma el plan.</p>'+
    '<div class="auth-field onb-field">'+
      '<span class="auth-ic" aria-hidden="true">'+auIcoTicket+'</span>'+
      '<input id="onbCode" class="auth-in" type="text" placeholder="Código de tu coach" aria-label="Código de tu coach" autocomplete="off" autocapitalize="characters" value="'+esc(value||"")+'">'+
    '</div>'+
    (msg?'<div class="auth-msg" role="alert">'+esc(msg)+'</div>':'')+
    '<button type="button" class="gize-btn auth-btn onb-main" data-onb="join">Vincular con mi coach</button>'+
    '<button type="button" class="onb-alt" data-onb="solo">Entreno por mi cuenta</button>',
    "Código de tu coach");
  if(!host) return;
  const inp=host.querySelector("#onbCode");
  inp.addEventListener("keydown", e=>{ if(e.key==="Enter"){ e.preventDefault(); host.querySelector('[data-onb="join"]').click(); } });
  host.onclick=async e=>{
    const b=e.target.closest("[data-onb]"); if(!b || b.disabled) return;
    if(b.dataset.onb==="solo"){ host.onclick=null; showStartChoice(); return; }
    const code=inp.value.trim();
    if(!code){ showClientCode("Poné el código que te pasó tu coach, o tocá \"Entreno por mi cuenta\".", code); return; }
    b.disabled=true; b.textContent="Vinculando...";
    try{
      const r=await State.sb.rpc("join_coach",{code:code});
      if(r.data!==true){
        // join_coach trae un mensaje propio para plan vencido o cupo lleno.
        const m=(r.error && r.error.code==="P0001" && joinMsgTienda(r.error.message)) || "Código inválido. Revisalo con tu coach.";
        showClientCode(m, code); return;
      }
      const pr=await State.sb.from("profiles").select("*").eq("id",State.cloudUser.id).maybeSingle();
      if(pr.data) State.cloudProfile=pr.data;
      await loadCloud();
      try{ const cn=await State.sb.rpc("my_coach_name"); State.brandName=cn.data||""; }catch(e2){}
      applyBrand();
      host.onclick=null; close(); renderApp();
    }catch(err){ showClientCode("No se pudo vincular: "+((err&&err.message)||err), code); }
  };
}


// ---- Cómo arrancar (entrena por su cuenta) ----
// "Elegir una rutina armada" (la recomendada) pregunta el sexo y muestra las rutinas que
// corresponden, con un filtro por días por semana (ver core/rutinas-ejemplo.js); "Empezar
// vacío" arma sus días en 3 pasos cortos.
// dias: filtro de la lista de rutinas armadas (0 = todas).
const OB = { start: "rutina", step: 1, days: 4, goal: "", first: "", dias: 0 };

function option(val, sel, title, sub, attr){
  return '<button type="button" class="onb-opt'+(val===sel?' on':'')+'" data-onb="'+attr+'" data-v="'+val+'" aria-pressed="'+(val===sel)+'">'+
    '<span class="onb-opt-dot" aria-hidden="true"></span><span><b>'+title+'</b>'+(sub?'<small>'+sub+'</small>':'')+'</span></button>';
}

// Marcar una opción cambia solo los botones de ese grupo: volver a montar la tarjeta repetía
// la animación de entrada y en el iPhone parecía que se abría otra ventana con lo marcado.
function mark(host, attr, val){
  host.querySelectorAll('[data-onb="'+attr+'"]').forEach(x=>{ const on=x.dataset.v===String(val); x.classList.toggle("on", on); x.setAttribute("aria-pressed", String(on)); });
}

function showStartChoice(){
  const host=mount(
    '<h1 class="onb-title">¿Cómo querés arrancar?</h1>'+
    '<p class="onb-text">Vos elegís. Lo podés cambiar cuando quieras.</p>'+
    '<div class="onb-opts">'+
      option("rutina", OB.start, "Elegir una rutina armada", "Recomendado. Rutinas listas de 1 a 5 días por semana. La podés cambiar después.", "start")+
      option("vacio", OB.start, "Empezar vacío", "Armás tus días de a poco.", "start")+
    '</div>'+
    '<button type="button" class="gize-btn auth-btn onb-main" data-onb="next">Continuar</button>',
    "Cómo arrancar");
  if(!host) return;
  host.onclick=e=>{
    const b=e.target.closest("[data-onb]"); if(!b) return;
    if(b.dataset.onb==="start"){ OB.start=b.dataset.v; mark(host, "start", OB.start); return; }
    if(b.dataset.onb==="next"){ host.onclick=null; if(OB.start==="rutina") showSex(); else { OB.step=1; showWizard(); } }
  };
}

function steps(n){ return '<div class="onb-steps" aria-hidden="true">'+[1,2,3].map(i=>'<span'+(i<=n?' class="on"':'')+'></span>').join("")+'</div><div class="onb-step-lbl">Paso '+n+' de 3</div>'; }

const GOALS = [["musculo","Ganar músculo"],["grasa","Bajar grasa"],["fuerza","Ganar fuerza"],["salud","Salud y bienestar"]];

function showWizard(){
  let inner;
  if(OB.step===1) inner='<h1 class="onb-title onb-left">¿Cuántos días por semana pensás entrenar?</h1>'+
    '<p class="onb-text onb-left">Armamos tu semana con esa cantidad de días. Lo podés cambiar cuando quieras.</p>'+
    '<div class="onb-nums">'+[1,2,3,4,5].map(n=>'<button type="button" class="onb-num'+(n===OB.days?' on':'')+'" data-onb="days" data-v="'+n+'">'+(n===5?'5+':n)+'</button>').join("")+'</div>';
  else if(OB.step===2) inner='<h1 class="onb-title onb-left">¿Cuál es tu objetivo principal?</h1>'+
    '<div class="onb-opts">'+GOALS.map(g=>option(g[0], OB.goal, g[1], "", "goal")).join("")+'</div>';
  else inner='<h1 class="onb-title onb-left">¿Cómo se llama tu primer día?</h1>'+
    '<p class="onb-text onb-left">Por ejemplo: Tren superior, Piernas, Día A.</p>'+
    '<div class="auth-field onb-field onb-field-free"><input id="onbFirst" class="auth-in" type="text" maxlength="40" placeholder="Día 1" aria-label="Nombre del primer día" value="'+esc(OB.first)+'"></div>';
  const host=mount(steps(OB.step)+inner+
    '<button type="button" class="gize-btn auth-btn onb-main" data-onb="wnext">'+(OB.step===3?'Empezar':'Siguiente')+'</button>'+
    '<button type="button" class="onb-alt" data-onb="empty">Prefiero arrancar vacío</button>', "Armar tu semana");
  if(!host) return;
  const inp=host.querySelector("#onbFirst");
  if(inp){ inp.addEventListener("input", ()=>{ OB.first=inp.value; }); inp.addEventListener("keydown", e=>{ if(e.key==="Enter"){ e.preventDefault(); host.querySelector('[data-onb="wnext"]').click(); } }); }
  host.onclick=e=>{
    const b=e.target.closest("[data-onb]"); if(!b) return;
    const a=b.dataset.onb;
    if(a==="days"){ OB.days=+b.dataset.v; mark(host, "days", OB.days); return; }
    if(a==="goal"){ OB.goal=b.dataset.v; mark(host, "goal", OB.goal); return; }
    if(a==="empty"){ host.onclick=null; startDays(1, ""); return; }
    if(a==="wnext"){
      if(OB.step<3){ OB.step++; showWizard(); return; }
      host.onclick=null; if(OB.goal) state.goal=OB.goal; startDays(OB.days, OB.first.trim());
    }
  };
}

// Semana vacía: n días sin ejercicios, el primero con el nombre que eligió.
function startDays(n, first){
  const uid=()=>Math.random().toString(36).slice(2,9);
  state.days=Array.from({length:Math.max(1,n)}, (_,i)=>({ id:uid(), name: i===0 ? (first||"Día 1") : "Día "+(i+1), subtitle:"", exercises:[] }));
  State.activeId=state.days[0].id; State.view="entreno";
  save(); close(); renderApp();
}

function showSex(){
  const host=mount(
    '<h1 class="onb-title">¿Para quién buscamos rutinas?</h1>'+
    '<p class="onb-text">Así te mostramos las rutinas pensadas para vos.</p>'+
    '<div class="onb-opts">'+
      option("f", state.sex, "Mujer", "", "sex")+option("m", state.sex, "Hombre", "", "sex")+option("x", state.sex, "Prefiero no decir", "Te mostramos todas", "sex")+
    '</div>'+
    '<button type="button" class="onb-alt" data-onb="back">Volver</button>', "Rutinas");
  if(!host) return;
  host.onclick=e=>{
    const b=e.target.closest("[data-onb]"); if(!b) return;
    if(b.dataset.onb==="back"){ host.onclick=null; showStartChoice(); return; }
    if(b.dataset.onb==="sex"){ state.sex=b.dataset.v; save(); host.onclick=null; showRoutines(false); }
  };
}

// Lista de rutinas. fromApp: abierta desde Entreno (se puede cerrar y pide confirmar si ya
// tiene ejercicios cargados); si no, es el último paso de la bienvenida. Arriba, los días por
// semana (Todas · 1 · 2 · 3 · 4 · 5): la lista muestra solo las de esa cantidad de días.
async function showRoutines(fromApp){
  // Si en la base todavía no hay ninguna para esta opción, las de ejemplo de la app.
  let all=rutinasPara(state.sex, await cargarCatalogo());
  if(!all.length) all=rutinasPara(state.sex, CATALOGO);
  const chip=(n, lbl)=>'<button type="button" class="onb-num onb-dias'+(n===OB.dias?' on':'')+'" data-onb="dias" data-v="'+n+'" aria-pressed="'+(n===OB.dias)+'">'+lbl+'</button>';
  // Lista de las rutinas de los días elegidos (se redibuja sola al tocar otro número).
  const listHtml=()=>{
    const list=rutinasDeDias(all, OB.dias);
    if(!list.length) return '<p class="onb-text">'+(all.length && OB.dias ? 'Todavía no hay rutinas de '+OB.dias+' día'+(OB.dias===1?'':'s')+' para esta opción. Probá con otra cantidad de días.' : 'Todavía no hay rutinas para esta opción.')+'</p>';
    return list.map(r=>{ const n=diasDeEntreno(r); return '<button type="button" class="onb-routine" data-onb="pick" data-v="'+esc(r.id)+'"><b>'+esc(r.nombre)+'</b><small>'+n+' día'+(n===1?'':'s')+' por semana'+(r.desc?' · '+esc(r.desc):'')+'</small></button>'; }).join("");
  };
  const host=mount(
    '<h1 class="onb-title">Elegí tu rutina</h1>'+
    '<p class="onb-text">¿Cuántos días por semana entrenás?</p>'+
    '<div class="onb-nums onb-nums-dias" role="group" aria-label="Días por semana">'+chip(0,"Todas")+[1,2,3,4,5].map(n=>chip(n, String(n))).join("")+'</div>'+
    '<div class="onb-routines" aria-live="polite">'+listHtml()+'</div>'+
    '<button type="button" class="onb-alt" data-onb="sexagain">Cambiar: '+(state.sex==="f"?"Mujer":state.sex==="m"?"Hombre":"Todas")+'</button>'+
    (fromApp?'<button type="button" class="onb-alt" data-onb="cancel">Cancelar</button>':'<button type="button" class="onb-alt" data-onb="empty">Prefiero arrancar vacío</button>'), "Elegí tu rutina");
  if(!host) return;
  host.onclick=e=>{
    const b=e.target.closest("[data-onb]"); if(!b) return;
    const a=b.dataset.onb;
    if(a==="dias"){
      OB.dias=+b.dataset.v||0;
      host.querySelectorAll('[data-onb="dias"]').forEach(x=>{ const on=+x.dataset.v===OB.dias; x.classList.toggle("on", on); x.setAttribute("aria-pressed", String(on)); });
      const box=host.querySelector(".onb-routines"); box.innerHTML=listHtml(); box.scrollTop=0;
      return;
    }
    if(a==="cancel"){ host.onclick=null; closeOverlay(); return; }
    if(a==="empty"){ host.onclick=null; startDays(1, ""); return; }
    if(a==="sexagain"){ host.onclick=null; if(fromApp) showSexFromApp(); else showSex(); return; }
    if(a==="pick"){
      const r=all.find(x=>x.id===b.dataset.v); if(!r) return;
      const hasWork=(state.days||[]).some(d=>(d.exercises||[]).length);
      if(fromApp && hasWork && !confirm("Esto reemplaza tus días de rutina por «"+r.nombre+"». No toca tus pesos, entrenos ni hábitos. ¿Seguro?")) return;
      host.onclick=null;
      state.days=copiarDias(r.days); State.activeId=(diaDeHoy(state.days)||state.days[0]).id; State.view="entreno"; // el de hoy, si dice el día (core/diasemana.js)
      save(); if(fromApp) closeOverlay(); else close(); renderApp();
    }
  };
}

function showSexFromApp(){
  const host=mount(
    '<h1 class="onb-title">¿Para quién buscamos rutinas?</h1>'+
    '<div class="onb-opts">'+option("f", state.sex, "Mujer", "", "sex")+option("m", state.sex, "Hombre", "", "sex")+option("x", state.sex, "Prefiero no decir", "Te mostramos todas", "sex")+'</div>'+
    '<button type="button" class="onb-alt" data-onb="cancel">Cancelar</button>', "Rutinas");
  if(!host) return;
  host.onclick=e=>{
    const b=e.target.closest("[data-onb]"); if(!b) return;
    if(b.dataset.onb==="cancel"){ host.onclick=null; closeOverlay(); return; }
    if(b.dataset.onb==="sex"){ state.sex=b.dataset.v; save(); host.onclick=null; showRoutines(true); }
  };
}

// Cierra la ventana sin marcar la bienvenida (se abrió desde la app).
function closeOverlay(){
  const h=document.getElementById("authHost"); if(h){ h.style.display="none"; h.innerHTML=""; }
  showSilkBg();
}

// Desde Entreno: "Ver rutinas armadas".
export function openRoutinePicker(){
  if(!state.sex) showSexFromApp(); else showRoutines(true);
}
