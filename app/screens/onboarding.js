import { auIcoTicket, checkSvg, chevronLeftSvg } from '../core/icons.js';

import { State, state } from '../core/state.js';
import { diaDeHoy } from '../core/diasemana.js';

import { dec, esc, today, uid } from '../core/utils.js';

import { applyBrand, loadCloud } from '../core/supabase.js';

import { save } from '../core/storage.js';

import { DISCIPLINAS, myDisciplinas, toggleDisciplina } from '../core/disciplinas.js';

import { rutinasDeDisciplinas } from '../core/rutinas-disciplina.js';
import { CATALOGO, cargarCatalogo, copiarDias, diasDeEntreno, rutinasDeDias, rutinasPara } from '../core/rutinas-ejemplo.js';
import { lastWeight } from '../core/cardiogps.js';

import { hideSilkBg, showSilkBg } from '../ui/background.js';
import { itemsRango, montarRueda, ruedaHtml } from '../ui/rueda.js';

import { calcTarget, coachGoal } from './comida.js';
import { CoachState } from './coach/state.js';

import { renderApp } from '../main.js';

import { appNativa, joinMsgTienda } from '../core/tienda.js';

// Bienvenida del primer ingreso, encima de la app (en #authHost, con la tarjeta del login).
// Solo para cuentas nuevas (creadas hace menos de 7 días): las de antes no la ven nunca. Se marca
// como vista por cuenta en este dispositivo, recién al terminar.
//   Coach:   «¡Bienvenido, coach!» con su código para pasarle al primer alumno (una pantalla).
//   Cliente: «¡Bienvenido!» y después una pregunta por pantalla, como en Aera: arriba la flecha
//            para volver, la barra de avance y «n/N»; abajo «Continuar» siempre a mano. Los pasos
//            (pasos()) dependen del camino: disciplina, código del coach, los datos del cuerpo
//            (sexo, cumpleaños, estatura, peso, objetivo, actividad y, si entrena por su cuenta,
//            experiencia) y cómo arranca (rutina armada o vacío).
// Lo que contesta va a un borrador en el dispositivo (gize_onb_draft_<uid>): si se recarga la
// página sigue en el mismo paso. Los datos del cuerpo van a la meta de Comida (calProfile), al
// peso de hoy y a la meta de pasos (aplicarCuerpo).
// «Ver rutinas armadas» desde Entreno (openRoutinePicker) usa la misma tarjeta, sin la cabecera.
const SEEN_PREFIX = "gize_onb_";
const DRAFT_PREFIX = "gize_onb_draft_";
const NEW_ACCOUNT_MS = 7*24*3600000;

const seenKey = () => SEEN_PREFIX + State.cloudUser.id;
const draftKey = () => DRAFT_PREFIX + State.cloudUser.id;
function markSeen(){ try{ localStorage.setItem(seenKey(), "1"); }catch(e){} }
// ¿Ya tiene una rutina con ejercicios? Pasa al entrar por primera vez en otro dispositivo
// (la marca de vista es por dispositivo): la bienvenida no le ofrece armar otra encima.
const hasWork = () => (state.days||[]).some(d=>(d.exercises||[]).length);
const REPLACE_MSG = "Ya tenés una rutina cargada. Esto la reemplaza en todos tus dispositivos. No toca tus pesos, entrenos ni hábitos. ¿Seguro?";
const okToReplace = async () => !hasWork() || await confirmar(REPLACE_MSG);

// ---- Opciones de cada pregunta: [valor, emoji, nombre, descripción] ----
const EMO_DISC = { fuerza:"💪", crossfit:"🔥", powerlifting:"🏋️", weightlifting:"🥇", running:"🏃", hibrido:"⚡" };
const SEXOS = [["f","👩","Mujer"], ["m","👨","Hombre"], ["x","🔒","Prefiero no decir"]];
const OBJETIVOS = [
  ["fuerza","🏋️","Ganar fuerza","Levantar más: fuerza y potencia"],
  ["musculo","💪","Ganar músculo","Hipertrofia: más masa muscular"],
  ["grasa","🔥","Bajar grasa","Quemar grasa y definir"],
  ["resistencia","🚴","Resistencia","Mejorar tu condición cardiovascular"],
  ["salud","🌱","Salud y bienestar","Sentirte mejor en general"]];
// Los nombres de GIZE (los mismos de «Tu meta diaria» en Comida) con las descripciones de Aera.
const ACTIVIDADES = [
  ["sed","🛋️","Sedentario","0 a 1 día de entreno por semana · menos de 5.000 pasos por día"],
  ["lig","🚶","Ligero","2 a 3 días · 5.000 a 8.000 pasos"],
  ["mod","🤸","Moderado","3 a 5 días · 8.000 a 10.000 pasos"],
  ["act","🏃","Activo","5 a 6 días · 10.000 a 12.000 pasos"],
  ["muy","⚡","Muy activo","Entrenás todos los días · más de 12.000 pasos"]];
const NIVELES = [
  ["principiante","🌱","Principiante","Recién empezás o entrenás hace menos de 1 año"],
  ["intermedio","📈","Intermedio","De 1 a 3 años entrenando seguido"],
  ["avanzado","🏆","Avanzado","Más de 3 años de entrenamiento constante"]];
const ARRANQUES = [
  ["rutina","📋","Elegir una rutina armada","Recomendado. Rutinas listas de 1 a 6 días por semana. La podés cambiar después."],
  ["vacio","✏️","Empezar vacío","Armás tus días de a poco."]];
// Objetivo → objetivo de la meta de calorías de Comida (bajar / mantener / ganar).
const META_GOAL = { grasa:"bajar", musculo:"ganar", fuerza:"mantener", resistencia:"mantener", salud:"mantener" };
// Actividad → meta de pasos por día.
const PASOS_DIA = { sed:6000, lig:8000, mod:10000, act:12000, muy:15000 };
// Experiencia → días por semana que le sugerimos.
const SUGERIDOS = { principiante:3, intermedio:4, avanzado:5 };
const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const MESES_CORTOS = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
// Rangos de las ruedas y el valor con el que arrancan si no hay un dato real.
const ALTURA = { min:120, max:220, def:170 };
const PESO = { min:30, max:250, paso:0.5, def:70 };
const EDAD = { min:18, max:100, def:25 };

// Pasos del cuerpo y dónde queda cada respuesta en el borrador (D.ans).
const CUERPO = ["sexo","nac","altura","peso","objetivo","actividad","nivel"];
const CLAVE = { sexo:"sex", nac:"nac", altura:"altura", peso:"peso", objetivo:"objetivo", actividad:"actividad", nivel:"nivel" };

const kg = n => n % 1 ? dec(n, 1) : String(n);
const ITEMS_DIA = itemsRango(1, 31, 1);
const ITEMS_MES = itemsRango(1, 12, 1, m => MESES_CORTOS[m-1], m => MESES[m-1]);
const ITEMS_ALTURA = itemsRango(ALTURA.min, ALTURA.max, 1, String, v => v+" cm");
const ITEMS_PESO = itemsRango(PESO.min, PESO.max, PESO.paso, kg, v => kg(v)+" kg");
const anioMax = () => new Date().getFullYear() - EDAD.min;
const anioMin = () => new Date().getFullYear() - EDAD.max;
const itemsAnio = () => itemsRango(anioMin(), anioMax(), 1);

// ---- Estado de la bienvenida ----
let D = null;        // borrador del cliente: { v, t, paso, detour, linked0, work0, body0, ans, flags }
let modo = "";       // "intro" | "wiz" (los pasos) | "coach" | "app" («Ver rutinas armadas»)
let tok = 0;         // cambia con cada pantalla: una espera vieja (el catálogo) no la pisa
let ocupado = false; // vinculando con el coach: la flecha y los botones de abajo no andan
let ruedas = [];     // ruedas de la pantalla actual (se desarman al cambiar de paso)
let _cat = null;     // catálogo ya esperado (el de la base o, si no llegó a tiempo, el de la app)
let filtroApp = null; // días por semana elegidos en «Ver rutinas armadas» en esta sesión
let _mostradas = [];  // las rutinas de la lista que se ve (la tocada se busca acá aunque después llegue el catálogo)

const cp = () => state.calProfile || {};
const conCoach = () => !!(State.cloudProfile && State.cloudProfile.coach_id);
const metaCompleta = () => +cp().age > 0 && +cp().height > 0 && +cp().weight > 0;
// Entrena por su cuenta: sin coach y sin una rutina propia ya armada en otro dispositivo.
const porSuCuenta = () => !!D && !D.work0 && !conCoach();

// ---- Borrador (para seguir donde quedó si se recarga la página) ----
function leerBorrador(){
  try{
    const d=JSON.parse(localStorage.getItem(draftKey())||"null");
    if(d && d.v===1 && d.ans && typeof d.ans==="object"){
      if(!d.flags || typeof d.flags!=="object") d.flags={};
      if(!d.flags.tocado || typeof d.flags.tocado!=="object") d.flags.tocado={};
      return d;
    }
  }catch(e){}
  return null;
}
function guardarBorrador(){ if(!D || !State.cloudUser) return; D.t=Date.now(); try{ localStorage.setItem(draftKey(), JSON.stringify(D)); }catch(e){} }
function borrarBorrador(){ try{ if(State.cloudUser) localStorage.removeItem(draftKey()); }catch(e){} }

export function maybeShowOnboarding(){
  const u=State.cloudUser, p=State.cloudProfile;
  if(!u || !p || !u.created_at) return;
  if(Date.now()-Date.parse(u.created_at) > NEW_ACCOUNT_MS){ borrarBorrador(); return; }
  try{ if(localStorage.getItem(seenKey())) return; }catch(e){ return; }
  // Ya está abierta (afterLogin corrió dos veces, p. ej. al volver de Apple o Google): no se
  // vuelve a empezar desde «¡Bienvenido!» con lo que ya eligió.
  if(document.querySelector("#authHost .onb-card")) return;
  if(p.role==="coach"){ showCoachWelcome(); return; }
  const d=leerBorrador();
  if(d){ D=d; reanudar(); } else showIntro();
}

// ---- Camino ----
// N (el «n/N» de arriba) es el largo del camino tal como se conoce ahora: se vuelve a calcular
// en cada pantalla. linked0, work0 y body0 se toman al tocar «Empezar» y quedan en el borrador,
// así el camino no cambia al recargar.
function pasos(){
  const p = ["disc"];
  if (!D.linked0 && !D.work0) p.push("code");
  const coach = conCoach(), solo = !D.work0 && !coach, metaCoach = coach && coachGoal();
  if (D.body0){
    // Con la meta del coach, solo el peso (lo ven Progreso, Cardio y el coach); el resto no se usaría.
    if (metaCoach){ if (pesoSeGuarda()) p.push("peso"); }
    else { p.push("sexo", "nac", "altura", "peso", "objetivo", "actividad"); if (solo) p.push("nivel"); }
  }
  if (solo) p.push("arranque", ...(D.ans.start === "vacio" ? ["dias", "primer"] : ["rutina"]));
  return p;
}
// Último paso del cuerpo del camino: al dejarlo para adelante se aplican las respuestas.
function ultimoCuerpo(){ const p=pasos().filter(x=>CUERPO.indexOf(x)>=0); return p.length ? p[p.length-1] : null; }

// ---- Fechas ----
const diasDelMes = (m, y) => new Date(y, m, 0).getDate();
const fechaValida = f => ({ d: Math.min(f.d, diasDelMes(f.m, f.y)), m: f.m, y: f.y });
// Años cumplidos hoy (fecha local).
function edadDe(f){
  const t=new Date(); let e=t.getFullYear()-f.y;
  if(t.getMonth()+1<f.m || (t.getMonth()+1===f.m && t.getDate()<f.d)) e--;
  return e;
}
// Hoy hace n años (el 29 de febrero pasa al 28 si ese año no lo tiene).
function haceAnios(n){ const t=new Date(); return fechaValida({ d:t.getDate(), m:t.getMonth()+1, y:t.getFullYear()-n }); }
const fechaTexto = f => f.d+" de "+MESES[f.m-1]+" de "+f.y;
// Edad que ya está en la cuenta (Comida o la ficha del coach): cuenta como respondida.
function edadReal(){
  const e=+cp().age>0 ? Math.round(+cp().age) : Math.round(+((state.info||{}).age)||0);
  return e>=EDAD.min && e<=EDAD.max ? e : 0;
}

// ---- Cómo se aplican las respuestas ----
// ¿Este peso lo anotó la bienvenida? Por el id o, si se recargó la página (loadCloud trae la fila
// de la nube con otro id), por la fecha y los kilos que anotó.
const pesoMio = x => x.id === D.flags.pesoId || (x.date === D.flags.pesoFecha && +x.kg === +D.flags.pesoKg);
// ¿Se puede anotar hoy el peso de la bienvenida? Con la nube sin leer, loadCloud lo pisaría.
function pesoSeGuarda(){
  if (!state.cloudSeen || !state.weightsSent) return false;
  return !(state.weights || []).some(x => x.date === today() && !pesoMio(x));
}
function pesoDeHoy(kgHoy){
  if (!pesoSeGuarda()) return;
  const w = state.weights.find(x => x.date === today());
  if (w) w.kg = kgHoy; else { const id = uid(); state.weights.push({ id, date: today(), kg: kgHoy }); D.flags.pesoId = id; }
  D.flags.pesoFecha = today(); D.flags.pesoKg = kgHoy;
}
// Corre cada vez que deja el último paso del cuerpo para adelante (con «Continuar» o «Ahora
// no»): si vuelve, cambia algo y sigue, se aplica de nuevo. Lo salteado no borra lo que ya había.
function aplicarCuerpo(){
  const a = D.ans, cpn = Object.assign({}, state.calProfile || {}); // conserva macros y claves que no conoce
  if (a.sex) state.sex = a.sex;
  if (a.sex === "f" || a.sex === "m") cpn.sex = a.sex; // «Prefiero no decir» nunca va a la meta
  if (a.nac){ const e = edadDe(fechaValida(a.nac)); if (e >= EDAD.min && e <= EDAD.max) cpn.age = String(e); }
  if (a.altura) cpn.height = String(a.altura);
  if (a.peso) cpn.weight = String(a.peso);
  if (a.objetivo){ cpn.trainGoal = a.objetivo; cpn.goal = META_GOAL[a.objetivo]; }
  if (a.actividad) cpn.activity = a.actividad;
  if (a.nivel) cpn.level = a.nivel;
  cpn.bodyAsked = true;                       // en otro dispositivo no se vuelve a preguntar
  state.calProfile = cpn;
  // Meta: solo con sexo m/f, edad, estatura y peso; nunca encima de una meta propia ni de la del coach.
  const lista = (cpn.sex === "m" || cpn.sex === "f") && +cpn.age > 0 && +cpn.height > 0 && +cpn.weight > 0;
  if (lista && !coachGoal() && (!state.calTarget || D.flags.metaPuesta)){
    const full = Object.assign({ activity:"mod", goal:"mantener" }, cpn);
    const k = calcTarget(full);
    if (k >= 1000 && k <= 6000){ state.calProfile = full; state.calTarget = k; D.flags.metaPuesta = true; }
  }
  if (a.peso && D.flags.tocado.peso) pesoDeHoy(+a.peso);
  const fichaPasos = +((state.info || {}).steps_goal) > 0; // la meta de pasos del coach manda
  if (a.actividad && !fichaPasos && (state.stepsGoal === 10000 || state.stepsGoal === D.flags.pasos)){
    state.stepsGoal = PASOS_DIA[a.actividad]; D.flags.pasos = state.stepsGoal;
  }
  save(); guardarBorrador();
}

// ---- La tarjeta ----
const host = () => document.getElementById("authHost");
const card = () => document.querySelector("#authHost .onb-wiz");
const $ = s => { const c=card(); return c ? c.querySelector(s) : null; };
function sr(t){ const s=$(".onb-sr"); if(s) s.textContent=t||""; }
function destruirRuedas(){ ruedas.forEach(r=>{ try{ r.destruir(); }catch(e){} }); ruedas=[]; }
function clickMain(){ const m=$(".onb-main"); if(m && !m.disabled && !m.hidden) m.click(); }

// Se arma una vez por bienvenida: entre pasos cambia solo el contenido de .onb-body y el pie
// (volver a montar la tarjeta repetía la animación de entrada y en el iPhone parecía que se
// abría otra ventana).
function montarShell(m){
  const h=host(); if(!h) return null;
  destruirRuedas();
  modo=m; ocupado=false;
  h.style.display="flex";
  hideSilkBg();
  h.innerHTML=
    '<div class="gize-aurora auth-aurora" aria-hidden="true"><span></span><span></span><span></span><span></span></div>'+
    '<div class="auth-card onb-card onb-wiz" role="dialog" aria-modal="true" aria-labelledby="onbTit" tabindex="-1">'+
      '<div class="onb-head" hidden>'+
        '<button type="button" class="onb-back" data-onb="back" aria-label="Volver al paso anterior" hidden>'+chevronLeftSvg+'</button>'+
        '<div class="onb-prog" role="progressbar" aria-label="Avance" aria-valuemin="1" aria-valuemax="1" aria-valuenow="1"><span class="onb-prog-fill"></span></div>'+
        '<span class="onb-count" aria-hidden="true"></span>'+
      '</div>'+
      '<div class="onb-body"></div>'+
      '<div class="onb-foot">'+
        // Por qué «Continuar» no anda todavía (ruedas sin tocar, menos de 18): en el pie, a la vista
        // aunque la pregunta no entre (320 px), y las ruedas la nombran (aria-describedby).
        '<p class="onb-hint" id="onbPista" role="status" aria-live="polite"></p>'+
        '<button type="button" class="gize-btn auth-btn onb-main" data-onb="next">Continuar</button>'+
        '<div class="onb-foot-alt"></div>'+
        '<p class="onb-sr" role="status" aria-live="polite"></p>'+
      '</div>'+
    '</div>';
  h.scrollTop=0; h.scrollLeft=0;
  const c=h.querySelector(".onb-card");
  c.addEventListener("keydown", trampa);
  // Con el teclado abierto, el campo que se toca queda a la vista dentro de la tarjeta.
  c.querySelector(".onb-body").addEventListener("focusin", e=>{
    const t=e.target; if(!t || t.tagName!=="INPUT") return;
    setTimeout(()=>{ if(document.activeElement===t){ try{ t.scrollIntoView({block:"nearest"}); }catch(err){} } }, 250);
  });
  h.onclick=alTocar;
  return c;
}

// El Tab queda dentro de la tarjeta (es una ventana encima de la app).
function trampa(e){
  if(e.key!=="Tab") return;
  const c=e.currentTarget, act=document.activeElement;
  const f=[...c.querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])')].filter(x=>!x.disabled && x.getClientRects().length);
  if(!f.length) return;
  if(!c.contains(act) || act===c){ e.preventDefault(); (e.shiftKey ? f[f.length-1] : f[0]).focus(); return; }
  const antes=f.filter(x=>x!==act && (x.compareDocumentPosition(act) & Node.DOCUMENT_POSITION_FOLLOWING));
  const despues=f.filter(x=>x!==act && !act.contains(x) && (act.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING));
  if(e.shiftKey && !antes.length){ e.preventDefault(); f[f.length-1].focus(); }
  else if(!e.shiftKey && !despues.length){ e.preventDefault(); f[0].focus(); }
}

// Dibuja una pantalla: el contenido, el botón principal (main: { onb, label, disabled }, o null
// para esconderlo) y los botones de abajo (alt). El foco va al título.
function pintar(o){
  const c=card(); if(!c) return null;
  destruirRuedas(); tok++;
  const body=c.querySelector(".onb-body");
  body.className="onb-body"+(o.centro?" onb-centro":"");
  body.innerHTML=o.html;
  body.scrollTop=0;
  const m=c.querySelector(".onb-main");
  m.removeAttribute("aria-busy"); delete m.dataset.txt;
  m.hidden=!o.main;
  if(o.main){ m.dataset.onb=o.main.onb; m.textContent=o.main.label; m.disabled=!!o.main.disabled; }
  c.querySelector(".onb-foot-alt").innerHTML=o.alt||"";
  c.querySelector(".onb-hint").textContent="";
  sr(o.sr||"");
  const t=c.querySelector("#onbTit"); if(t){ try{ t.focus({preventScroll:true}); }catch(e){ t.focus(); } }
  return c;
}

// Cabecera: flecha para volver (no en el primer paso), barra de avance y «n/N».
function cabeza(){
  const c=card(); if(!c) return;
  const head=c.querySelector(".onb-head");
  if(modo!=="wiz" || !D){ head.hidden=true; return; }
  const ps=pasos(), N=ps.length, i=Math.max(0, ps.indexOf(D.paso)), n=i+1;
  head.hidden=false;
  c.querySelector(".onb-back").hidden = i===0 && !D.detour;
  const pr=c.querySelector(".onb-prog");
  pr.style.setProperty("--p", String(n/N));
  pr.setAttribute("aria-valuemax", String(N)); pr.setAttribute("aria-valuenow", String(n)); pr.setAttribute("aria-valuetext", "Paso "+n+" de "+N);
  c.querySelector(".onb-count").textContent=n+"/"+N;
}

// Marcar una opción cambia solo los botones de ese grupo (no se vuelve a dibujar la tarjeta).
function mark(attr, val){
  const c=card(); if(!c) return;
  c.querySelectorAll('[data-onb="'+attr+'"]').forEach(x=>{ const on=x.dataset.v===String(val); x.classList.toggle("on", on); x.setAttribute("aria-pressed", String(on)); });
}

// «Continuar», la ayuda de abajo y la bajada (la del peso cambia al tocar la rueda), según lo que
// hay contestado. La ayuda se escribe solo si cambia: es un aviso para el lector de pantalla.
function refrescar(){
  if(modo!=="wiz" || !D) return;
  const P=PANTALLAS[D.detour ? "desvio" : D.paso]; if(!P) return;
  const m=$(".onb-main");
  if(m && !m.hasAttribute("aria-busy")) m.disabled = !!(P.valido && !P.valido());
  const h=$(".onb-hint");
  if(h){ const t=(P.pista && P.pista()) || ""; if(h.textContent!==t) h.textContent=t; }
  const s=P.subtitulo && $(".onb-body > .onb-text");
  if(s){ const t=P.subtitulo(); if(s.textContent!==t) s.textContent=t; }
}

// Ocupado: el botón principal dice qué está pasando (y el lector de pantalla también). Con
// bloquear, tampoco andan la flecha de volver ni los botones de abajo (vinculando: la base
// pudo haberlo vinculado igual, así que eso no se deja a medias).
function ocupadoUI(on, txt, bloquear){
  const c=card(); if(!c) return;
  const m=c.querySelector(".onb-main");
  if(on){ m.dataset.txt=m.textContent; m.textContent=txt; m.disabled=true; m.setAttribute("aria-busy","true"); sr(txt); }
  else { m.removeAttribute("aria-busy"); if(m.dataset.txt){ m.textContent=m.dataset.txt; delete m.dataset.txt; } m.disabled=false; sr(""); }
  if(bloquear) c.querySelectorAll(".onb-back, .onb-foot-alt button").forEach(b=>{ b.disabled=on; });
  if(!on) refrescar();
}

// ---- Piezas de las pantallas ----
const tit = t => '<h1 id="onbTit" class="onb-title" tabindex="-1">'+t+'</h1>';
const sub = t => '<p class="onb-text">'+t+'</p>';
const AHORA_NO = '<button type="button" class="onb-later" data-onb="later">Ahora no</button>';
const dot = '<span class="onb-opt-dot" aria-hidden="true">'+checkSvg+'</span>';
function opcion(attr, o, sel){
  const on=o[0]===sel;
  return '<button type="button" class="onb-opt'+(on?' on':'')+'" data-onb="'+attr+'" data-v="'+o[0]+'" aria-pressed="'+on+'">'+
    '<span class="onb-emo" aria-hidden="true">'+o[1]+'</span>'+
    '<span class="onb-opt-txt"><b>'+o[2]+'</b>'+(o[3]?'<small>'+o[3]+'</small>':'')+'</span>'+dot+'</button>';
}
const opciones = (attr, lista, sel) => '<div class="onb-opts" role="group" aria-labelledby="onbTit">'+lista.map(o=>opcion(attr, o, sel)).join("")+'</div>';
// «Prefiero no decir» explica qué rutinas ve, cuando las rutinas dependen de esto.
const sexos = rutinas => SEXOS.map(o=>o[0]==="x" && rutinas ? o.concat("Te mostramos todas las rutinas") : o);
const sexoTxt = () => state.sex==="f" ? "Mujer" : state.sex==="m" ? "Hombre" : "Todas";

// Rueda sola (estatura, peso): la respuesta (D.ans[k]) existe si la tocó o si arrancó en un dato real.
function ruedaSimple(k, sel, items, index){
  const api=montarRueda($(sel), { items, index,
    onChange(){ if(D.flags.tocado[k]) D.ans[k]=api.v; refrescar(); },
    onCommit(){ guardarBorrador(); },
    onToque(){ D.flags.tocado[k]=true; D.ans[k]=api.v; refrescar(); guardarBorrador(); },
    onEnter: clickMain });
  ruedas=[api];
}

// ---- Rutinas armadas (la lista de la bienvenida y la de «Ver rutinas armadas») ----
// El catálogo de la base; si no llega en 4 s (señal floja), el de la app. El pedido sigue y,
// cuando llega, queda para la próxima vez.
function catalogo(){
  const base=cargarCatalogo().then(c=>{ _cat=c; return c; });
  return Promise.race([base, new Promise(r=>setTimeout(()=>r(_cat || (_cat=CATALOGO)), 4000))]);
}
// Primero las de sus disciplinas (CrossFit, Running…) y, si busca resistencia, las de running e híbrido.
function idsRutinas(){
  const ids=myDisciplinas().map(x=>x.id);
  if(cp().trainGoal==="resistencia") ["running","hibrido"].forEach(x=>{ if(ids.indexOf(x)<0) ids.push(x); });
  return ids;
}
function rutinasTodas(){
  let all=rutinasPara(state.sex, _cat || CATALOGO);
  if(!all.length) all=rutinasPara(state.sex, CATALOGO);
  return rutinasDeDisciplinas(idsRutinas()).concat(all);
}
function introRutinas(){
  const t=[];
  if(myDisciplinas().some(x=>x.id!=="fuerza")) t.push("Te mostramos primero las de tu disciplina.");
  else if(cp().trainGoal==="resistencia") t.push("Te mostramos primero las de resistencia.");
  return t;
}
const chip = (n, sel, lbl) => '<button type="button" class="onb-num onb-dias'+(n===sel?' on':'')+'" data-onb="dias" data-v="'+n+'" aria-pressed="'+(n===sel)+'">'+lbl+'</button>';
const chipsDias = sel => '<p class="onb-label">¿Cuántos días por semana entrenás?</p>'+
  '<div class="onb-nums onb-nums-dias" role="group" aria-label="Días por semana">'+chip(0, sel, "Todas")+[1,2,3,4,5,6].map(n=>chip(n, sel, String(n))).join("")+'</div>';
// sel: la elegida en la bienvenida; app: desde Entreno (ahí tocar una la elige al toque).
function listaHtml(n, sel, app){
  const all=rutinasTodas(), list=rutinasDeDias(all, n);
  _mostradas=list;
  if(!list.length) return '<p class="onb-text">'+(all.length && n ? 'Todavía no hay rutinas de '+n+' día'+(n===1?'':'s')+' para esta opción. Probá con otra cantidad de días.' : 'Todavía no hay rutinas para esta opción.')+'</p>';
  return list.map(r=>{
    const k=diasDeEntreno(r), on=!app && r.id===sel;
    return '<button type="button" class="onb-routine'+(on?' on':'')+'" data-onb="pick" data-v="'+esc(r.id)+'"'+(app?'':' aria-pressed="'+on+'"')+'>'+
      '<span class="onb-routine-txt"><b>'+esc(r.nombre)+'</b><small>'+k+' día'+(k===1?'':'s')+' por semana'+(r.desc?' · '+esc(r.desc):'')+'</small></span>'+(app?'':dot)+'</button>';
  }).join("");
}
// Filtro de la lista: lo que tocó o, si no tocó nada, los días que le sugerimos por su experiencia.
const filtroWiz = () => D.ans.filtro!=null ? D.ans.filtro : (SUGERIDOS[D.ans.nivel] || 0);
// «Cargando rutinas…» (del lector de pantalla) se borra cuando la lista ya está.
function listaLista(){ const s=$(".onb-sr"); if(s && s.textContent==="Cargando rutinas…") sr(""); }
function pintarLista(){
  const box=$(".onb-routines"); if(!box) return;
  listaLista();
  if(modo==="app"){ box.innerHTML=listaHtml(filtroApp, null, true); return; }
  const n=filtroWiz();
  // Si el filtro esconde la que había elegido, deja de estar elegida.
  if(D.ans.rutina && !rutinasDeDias(rutinasTodas(), n).some(r=>r.id===D.ans.rutina)) D.ans.rutina=null;
  box.innerHTML=listaHtml(n, D.ans.rutina, false);
  refrescar();
}

// ---- Las pantallas de la bienvenida ----
// prep(): valores por defecto · html() · montar(): ruedas y campos · valido(): habilita
// «Continuar» · pista(): la ayuda de abajo · alt(): botones de abajo · etiqueta(): el texto de
// «Continuar» · alSalir(): guarda la respuesta al seguir (false: no sigue) · fin(): si es el último.
const PANTALLAS = {
  disc: {
    html(){
      const mine=myDisciplinas().map(d=>d.id);
      return tit("¿Qué entrenás?")+sub("Podés elegir más de una. Te mostramos primero esos ejercicios.")+
        '<div class="onb-tiles" role="group" aria-labelledby="onbTit">'+DISCIPLINAS.map(d=>{ const on=mine.indexOf(d.id)>=0;
          return '<button type="button" class="onb-opt onb-tile'+(on?' on':'')+'" data-onb="disc" data-v="'+d.id+'" aria-pressed="'+on+'">'+
            '<span class="onb-emo" aria-hidden="true">'+(EMO_DISC[d.id]||"")+'</span><b>'+esc(d.name)+'</b>'+dot+'</button>'; }).join("")+'</div>';
    },
    valido: () => myDisciplinas().length > 0,
    alt: () => '<button type="button" class="onb-later" data-onb="dskip">Saltear</button>'
  },

  code: {
    html(){
      const t=tit("¿Tenés un código de tu coach?")+sub("Es opcional. Con el código, tu coach te arma la rutina y ve tu progreso.");
      if(conCoach()) return t+'<div class="auth-msg ok" role="status">Ya estás vinculado con tu coach.</div>';
      return t+'<div class="auth-field onb-field">'+
          '<span class="auth-ic" aria-hidden="true">'+auIcoTicket+'</span>'+
          '<input id="onbCode" class="auth-in" type="text" placeholder="Código de tu coach" aria-label="Código de tu coach" autocomplete="off" autocapitalize="characters">'+
        '</div>';
    },
    montar(){
      const inp=$("#onbCode"); if(!inp) return;
      inp.addEventListener("input", ()=>{ inp.removeAttribute("aria-invalid"); inp.removeAttribute("aria-describedby"); refrescar(); });
      inp.addEventListener("keydown", e=>{ if(e.key==="Enter"){ e.preventDefault(); clickMain(); } });
    },
    valido: () => conCoach() || !!((($("#onbCode")||{}).value)||"").trim(),
    etiqueta: () => conCoach() ? "Continuar" : "Vincular con mi coach",
    alt: () => conCoach() ? "" : '<button type="button" class="onb-alt" data-onb="solo">Entreno por mi cuenta</button>',
    alSalir: () => conCoach() ? true : vincular()
  },

  sexo: {
    prep(){ if(!D.ans.sex){ const s=state.sex || cp().sex; if(s==="f" || s==="m" || s==="x") D.ans.sex=s; } },
    html(){
      return tit("¿Cuál es tu sexo?")+sub(porSuCuenta() ? "Lo usamos para calcular tus calorías y mostrarte rutinas pensadas para vos." : "Lo usamos para calcular tus calorías.")+
        opciones("sex", sexos(porSuCuenta()), D.ans.sex);
    },
    valido: () => !!D.ans.sex
  },

  nac: {
    // Una edad que ya está en la cuenta cuenta como respondida; la de 25 años de arranque, no.
    prep(){ if(!D.ans.nac){ const e=edadReal(); if(e) D.ans.nac=haceAnios(e); } },
    html(){
      const f=fechaValida(D.ans.nac || haceAnios(EDAD.def)), y=Math.min(anioMax(), Math.max(anioMin(), f.y));
      return tit("¿Cuándo es tu cumpleaños?")+sub("Con tu edad calculamos mejor tus calorías. Tu fecha no se sube a tu cuenta: solo la edad.")+
        '<div class="onb-fecha"><span class="onb-fecha-lbl">Fecha elegida</span><b class="onb-fecha-val"></b><span class="onb-edad"></span></div>'+
        '<div class="rd-row" role="group" aria-labelledby="onbTit"><div class="rd-band" aria-hidden="true"></div>'+
          ruedaHtml({ id:"onbDia", label:"Día", items:ITEMS_DIA, index:f.d-1, chica:true, desc:"onbPista" })+
          ruedaHtml({ id:"onbMes", label:"Mes", items:ITEMS_MES, index:f.m-1, chica:true, desc:"onbPista" })+
          ruedaHtml({ id:"onbAnio", label:"Año", items:itemsAnio(), index:y-anioMin(), chica:true, desc:"onbPista" })+
        '</div>';
    },
    montar(){
      const f=fechaValida(D.ans.nac || haceAnios(EDAD.def)), y=Math.min(anioMax(), Math.max(anioMin(), f.y));
      let rd=null, rm=null, ra=null;
      // La fecha de las ruedas, con el día corregido (nunca un 31 de febrero, aunque esté a mitad de camino).
      const actual = () => fechaValida({ d:rd.v, m:rm.v, y:ra.v });
      const pintarFecha = () => {
        if(!ra) return;
        const g=actual(), e=edadDe(g), v=$(".onb-fecha-val"), ed=$(".onb-edad");
        if(v) v.textContent=fechaTexto(g);
        if(ed) ed.textContent=e+" años";
        ra.texto(g.y+", "+e+" años");
        if(D.flags.tocado.nac) D.ans.nac=g;
        refrescar();
      };
      const toque = () => { D.flags.tocado.nac=true; pintarFecha(); guardarBorrador(); };
      // El día que no existe en ese mes (31 de febrero) pasa al último del mes.
      const commit = () => { if(!ra) return; const g=actual(); if(rd.v!==g.d) rd.ir(g.d-1); pintarFecha(); guardarBorrador(); };
      const op = (items, index) => ({ items, index, onChange:pintarFecha, onCommit:commit, onToque:toque, onEnter:clickMain });
      rd=montarRueda($("#onbDia"), op(ITEMS_DIA, f.d-1));
      rm=montarRueda($("#onbMes"), op(ITEMS_MES, f.m-1));
      ra=montarRueda($("#onbAnio"), op(itemsAnio(), y-anioMin()));
      ruedas=[rd, rm, ra];
      this._fecha=actual;
      pintarFecha();
    },
    valido(){ if(!D.ans.nac || !this._fecha) return false; const e=edadDe(this._fecha()); return e>=EDAD.min && e<=EDAD.max; },
    pista(){
      if(!D.ans.nac) return "Mové las ruedas hasta tu fecha de nacimiento.";
      if(this._fecha && edadDe(this._fecha())<EDAD.min) return "GIZE es para mayores de 18 años.";
      return "";
    },
    alSalir(){ if(this._fecha) D.ans.nac=this._fecha(); return true; },
    alt: () => AHORA_NO
  },

  altura: {
    prep(){
      if(D.ans.altura==null){ const h=Math.round(+cp().height || +((state.info||{}).height_cm) || 0); if(h>=ALTURA.min && h<=ALTURA.max) D.ans.altura=h; }
    },
    html(){
      const v=D.ans.altura!=null ? D.ans.altura : ALTURA.def;
      return tit("¿Cuánto medís?")+sub("Lo usamos para calcular tus calorías.")+
        '<div class="onb-rueda">'+ruedaHtml({ id:"onbAltura", label:"Estatura", items:ITEMS_ALTURA, index:v-ALTURA.min, unit:"cm", desc:"onbPista" })+'</div>';
    },
    montar(){ const v=D.ans.altura!=null ? D.ans.altura : ALTURA.def; ruedaSimple("altura", "#onbAltura", ITEMS_ALTURA, v-ALTURA.min); },
    valido: () => D.ans.altura!=null,
    pista: () => D.ans.altura==null ? "Mové la rueda o tocá el número del medio para confirmarlo." : "",
    alSalir(){ if(D.ans.altura!=null && ruedas[0]) D.ans.altura=ruedas[0].v; return true; },
    alt: () => AHORA_NO
  },

  peso: {
    prep(){
      if(D.ans.peso==null){
        let w=+cp().weight; if(!(w>0)) w=+lastWeight(state.weights)||0;
        w=Math.round(w*2)/2;
        if(w>=PESO.min && w<=PESO.max) D.ans.peso=w;
      }
    },
    html(){
      const v=D.ans.peso!=null ? D.ans.peso : PESO.def;
      return tit("¿Cuánto pesás?")+sub(this.subtitulo())+
        '<div class="onb-rueda">'+ruedaHtml({ id:"onbPeso", label:"Peso", items:ITEMS_PESO, index:Math.round((v-PESO.min)/PESO.paso), unit:"kg", desc:"onbPista" })+'</div>';
    },
    // Hoy se anota solo si toca la rueda (o la tiene que tocar para seguir, si arrancó en 70). Si
    // arrancó en un dato real (su último peso, quizá de hace días) y no la toca, no se anota: ahí
    // no se promete Progreso.
    anota: () => pesoSeGuarda() && (D.flags.tocado.peso || D.ans.peso==null),
    subtitulo(){
      if(!this.anota()) return "Lo usamos para calcular tus calorías.";
      return conCoach() ? "Lo guardamos en Progreso y tu coach lo ve." : "Lo guardamos en Progreso para ver cómo cambia.";
    },
    montar(){ const v=D.ans.peso!=null ? D.ans.peso : PESO.def; ruedaSimple("peso", "#onbPeso", ITEMS_PESO, Math.round((v-PESO.min)/PESO.paso)); },
    valido: () => D.ans.peso!=null,
    pista(){
      if(D.ans.peso==null) return "Mové la rueda o tocá el número del medio para confirmarlo.";
      if(!D.flags.tocado.peso && pesoSeGuarda()) return "Mové la rueda o tocá el número del medio para anotarlo hoy en Progreso.";
      return "";
    },
    alSalir(){ if(D.ans.peso!=null && ruedas[0]) D.ans.peso=ruedas[0].v; return true; },
    alt: () => AHORA_NO
  },

  objetivo: {
    prep(){ if(!D.ans.objetivo && META_GOAL[cp().trainGoal]) D.ans.objetivo=cp().trainGoal; },
    html(){
      return tit("¿Cuál es tu objetivo principal?")+sub(porSuCuenta() ? "Ajustamos tus calorías y las rutinas que te sugerimos." : "Ajustamos tus calorías a lo que buscás.")+
        opciones("goal", OBJETIVOS, D.ans.objetivo);
    },
    valido: () => !!D.ans.objetivo,
    alt: () => AHORA_NO
  },

  actividad: {
    prep(){ if(!D.ans.actividad && PASOS_DIA[cp().activity]) D.ans.actividad=cp().activity; },
    html(){
      const pasosCoach=+((state.info||{}).steps_goal) > 0; // la meta de pasos la puso el coach
      return tit("Tu nivel de actividad")+sub(pasosCoach ? "Con esto calculamos cuántas calorías gastás por día." : "Con esto calculamos cuántas calorías gastás por día y tu meta de pasos.")+
        opciones("act", ACTIVIDADES, D.ans.actividad);
    },
    valido: () => !!D.ans.actividad,
    alt: () => AHORA_NO
  },

  nivel: {
    prep(){ if(!D.ans.nivel && SUGERIDOS[cp().level]) D.ans.nivel=cp().level; },
    html(){ return tit("Tu experiencia entrenando")+sub("Con esto te sugerimos cuántos días por semana entrenar.")+opciones("nivel", NIVELES, D.ans.nivel); },
    valido: () => !!D.ans.nivel,
    alt: () => AHORA_NO
  },

  arranque: {
    prep(){ if(D.ans.start!=="vacio") D.ans.start="rutina"; },
    html(){ return tit("¿Cómo querés arrancar?")+sub("Vos elegís. Lo podés cambiar cuando quieras.")+opciones("arranque", ARRANQUES, D.ans.start); },
    // El catálogo se pide ya: cuando toque «Continuar» seguramente ya llegó.
    montar(){ cargarCatalogo().then(c=>{ _cat=c; }, ()=>{}); },
    valido: () => true,
    // Con señal floja la lista espera al catálogo: el botón avisa que está cargando (la flecha
    // para volver sigue andando) y a los 4 s sigue con las rutinas de la app.
    alSalir(){
      if(D.ans.start!=="rutina" || _cat) return true;
      const t=tok;
      ocupadoUI(true, "Cargando rutinas…", false);
      return catalogo().then(()=>t===tok);
    }
  },

  rutina: {
    // Sin las preguntas del cuerpo (ya las había contestado), el sexo de su meta filtra las rutinas.
    prep(){ if(!D.body0 && !state.sex){ const s=cp().sex; if(s==="f" || s==="m") state.sex=s; } },
    html(){
      const t=introRutinas();
      if(SUGERIDOS[D.ans.nivel]) t.push("Te sugerimos rutinas de "+SUGERIDOS[D.ans.nivel]+" días por tu experiencia.");
      return tit("Elegí tu rutina")+(t.length ? sub(t.join(" ")) : "")+chipsDias(filtroWiz())+
        '<button type="button" class="onb-link" data-onb="sexagain">Cambiar: '+sexoTxt()+'</button>'+
        '<div class="onb-routines" aria-live="polite">'+(_cat ? "" : '<p class="onb-text">Cargando rutinas…</p>')+'</div>';
    },
    montar(){
      if(_cat){ pintarLista(); return; }
      const t=tok;
      catalogo().then(()=>{ if(t===tok) pintarLista(); });
    },
    // Tocar una rutina la elige (no la carga): «Empezar» la carga, así no se reemplaza nada sin querer.
    valido: () => !!D.ans.rutina && !!_cat,
    alt: () => '<button type="button" class="onb-later" data-onb="empty">Prefiero arrancar vacío</button>',
    async fin(){
      const r=_mostradas.find(x=>x.id===D.ans.rutina); if(!r) return;
      if(!await okToReplace()) return;
      state.days=copiarDias(r.days);
      State.activeId=(diaDeHoy(state.days)||state.days[0]).id; // el de hoy, si dice el día (core/diasemana.js)
      State.view="entreno";
      state.calProfile=Object.assign({}, state.calProfile||{}, { daysPerWeek: diasDeEntreno(r) });
      terminar();
    }
  },

  // Desvío desde la lista («Cambiar: …»): no cuenta como paso y no tiene «Continuar».
  desvio: {
    html(){ return tit("¿Para quién buscamos rutinas?")+sub("Así te mostramos las rutinas pensadas para vos.")+opciones("sex", sexos(true), state.sex); },
    valido: () => true
  },

  dias: {
    prep(){ if(!D.flags.diasTocado || D.ans.dias==null) D.ans.dias=SUGERIDOS[D.ans.nivel] || 4; },
    html(){
      const n=SUGERIDOS[D.ans.nivel];
      return tit("¿Cuántos días por semana vas a entrenar?")+
        sub(n ? "Te sugerimos "+n+" por tu experiencia. Lo podés cambiar cuando quieras." : "Armamos tu semana con esa cantidad de días. Lo podés cambiar cuando quieras.")+
        '<div class="onb-nums onb-nums-6" role="group" aria-labelledby="onbTit">'+[1,2,3,4,5,6].map(k=>{ const on=k===D.ans.dias;
          return '<button type="button" class="onb-num'+(on?' on':'')+'" data-onb="days" data-v="'+k+'" aria-pressed="'+on+'"><b>'+k+'</b><small>'+(k===1?'día':'días')+'</small></button>'; }).join("")+'</div>';
    },
    valido: () => true
  },

  primer: {
    html(){
      return tit("¿Cómo se llama tu primer día?")+sub("Por ejemplo: Tren superior, Piernas, Día A.")+
        '<div class="auth-field onb-field onb-field-free"><input id="onbFirst" class="auth-in" type="text" maxlength="40" placeholder="Día 1" aria-label="Nombre del primer día" value="'+esc(D.ans.primer||"")+'"></div>';
    },
    montar(){
      const inp=$("#onbFirst"); if(!inp) return;
      inp.addEventListener("input", ()=>{ D.ans.primer=inp.value; guardarBorrador(); });
      inp.addEventListener("keydown", e=>{ if(e.key==="Enter"){ e.preventDefault(); clickMain(); } });
    },
    valido: () => true,
    async fin(){
      if(!await okToReplace()) return;
      const n=Math.max(1, Math.min(6, +D.ans.dias || 1));
      state.calProfile=Object.assign({}, state.calProfile||{}, { daysPerWeek: n });
      startDays(n, (D.ans.primer||"").trim());
    }
  }
};

// ---- Navegación ----
function ir(paso, o){
  o=o||{};
  if(!D || !card()) return;
  D.paso=paso; D.detour=!!o.detour;
  const P=PANTALLAS[D.detour ? "desvio" : paso];
  if(P.prep) P.prep();
  const ps=pasos(), ultimo=!D.detour && ps[ps.length-1]===paso;
  const label=ultimo ? (paso==="rutina" || paso==="primer" ? "Empezar" : "Completar") : (P.etiqueta ? P.etiqueta() : "Continuar");
  pintar({ html:P.html(), main: D.detour ? null : { onb:"next", label }, alt: P.alt ? P.alt() : "", sr:o.sr });
  cabeza();
  if(P.montar) P.montar();
  refrescar();
  guardarBorrador();
}

async function siguiente(){
  if(!D || ocupado || D.detour) return;
  const paso=D.paso, P=PANTALLAS[paso];
  if(P.valido && !P.valido()) return;
  if(P.alSalir){ const ok=await P.alSalir(); if(ok===false || !D || D.paso!==paso || !card()) return; }
  avanzar(paso);
}
function avanzar(paso){
  if(paso===ultimoCuerpo()) aplicarCuerpo();
  const ps=pasos(), i=ps.indexOf(paso);
  if(i>=0 && i<ps.length-1){ ir(ps[i+1]); return; }
  const P=PANTALLAS[paso];
  if(P && P.fin) P.fin(); else terminar();
}
// «Ahora no»: saltea solo este paso. Lo que ya se había aplicado antes queda (se cambia en Comida o Progreso).
function ahoraNo(){
  if(!D || ocupado) return;
  const paso=D.paso, k=CLAVE[paso];
  if(k){ delete D.ans[k]; if(D.flags.tocado[k]) D.flags.tocado[k]=false; }
  avanzar(paso);
}
function atras(){
  if(!D || ocupado) return;
  if(D.detour){ ir("rutina"); return; }
  const ps=pasos(), i=ps.indexOf(D.paso);
  if(i<=0) return; // en el primer paso no hay a dónde volver (y la flecha no se dibuja)
  ir(ps[i-1]);
}
// Al volver a abrir la app: el paso donde quedó o, si ese paso ya no está en el camino (por
// ejemplo, lo vinculó su coach mientras tanto), el primero sin contestar.
function reanudar(){
  if(!montarShell("wiz")) return;
  const ps=pasos();
  const falta=x=>{ const k=CLAVE[x]; if(k) return D.ans[k]==null; if(x==="code") return !conCoach(); return x!=="disc"; };
  const p=ps.indexOf(D.paso)>=0 ? D.paso : (ps.filter(falta)[0] || ps[ps.length-1]);
  ir(p, { detour: D.detour && p==="rutina" });
}

// Vincular con el código: lo mismo de siempre (join_coach, el perfil, loadCloud y el nombre del
// coach) y después sigue con el paso que corresponde, que ya es el camino con coach.
async function vincular(){
  const inp=$("#onbCode"), code=((inp && inp.value)||"").trim();
  if(!code) return false;
  ocupado=true;
  ocupadoUI(true, "Vinculando…", true);
  let msg="";
  try{
    const r=await State.sb.rpc("join_coach",{code:code});
    if(r.data!==true){
      // join_coach trae un mensaje propio para plan vencido o cupo lleno.
      msg=(r.error && r.error.code==="P0001" && joinMsgTienda(r.error.message)) || "Código inválido. Revisalo con tu coach.";
    } else {
      const pr=await State.sb.from("profiles").select("*").eq("id",State.cloudUser.id).maybeSingle();
      if(pr.data) State.cloudProfile=pr.data;
      await loadCloud();
      try{ const cn=await State.sb.rpc("my_coach_name"); State.brandName=cn.data||""; }catch(e2){}
      applyBrand();
      renderApp(); // la app de abajo ya queda con el coach
    }
  }catch(err){ msg="No se pudo vincular: "+((err&&err.message)||err); }
  ocupado=false;
  if(!card()) return false;
  ocupadoUI(false, "", true);
  if(msg){ errorCodigo(msg); return false; }
  return true;
}
// El aviso queda abajo del campo y el foco vuelve al campo, con el código elegido para corregirlo
// (al deshabilitarse «Vincular» mientras esperaba, el foco se había ido al fondo de la página).
function errorCodigo(msg){
  const c=card(); if(!c) return;
  const old=c.querySelector(".onb-body .auth-msg"); if(old) old.remove();
  const f=c.querySelector(".onb-field"); if(!f) return;
  f.insertAdjacentHTML("afterend", '<div class="auth-msg" id="onbCodeMsg" role="alert">'+esc(msg)+'</div>');
  const inp=c.querySelector("#onbCode"); if(!inp) return;
  inp.setAttribute("aria-invalid", "true"); inp.setAttribute("aria-describedby", "onbCodeMsg");
  try{ inp.focus({preventScroll:true}); }catch(e){ inp.focus(); }
  try{ inp.select(); }catch(e){}
}

// ---- Cliente: «¡Bienvenido!» ----
function showIntro(){
  D=null;
  if(!montarShell("intro")) return;
  pintar({ centro:true, main:{ onb:"start", label:"Empezar" },
    html:'<div class="auth-logo"><img src="brand/logo/gize-logotipo.svg" alt="GIZE"></div>'+
      tit("¡Bienvenido!")+sub("Te hacemos unas preguntas cortas para dejar GIZE listo para vos. Es un minuto.") });
  cabeza();
}
function empezar(){
  D={ v:1, t:Date.now(), paso:"disc", detour:false, linked0:conCoach(), work0:hasWork(),
    body0:!metaCompleta() && !cp().bodyAsked, ans:{ start:"rutina" }, flags:{ tocado:{} } };
  modo="wiz";
  ir(pasos()[0]);
}

// Semana vacía: n días sin ejercicios, el primero con el nombre que eligió.
function startDays(n, first){
  state.days=Array.from({length:Math.max(1,n)}, (_,i)=>({ id:uid(), name: i===0 ? (first||"Día 1") : "Día "+(i+1), subtitle:"", exercises:[] }));
  State.activeId=state.days[0].id; State.view="entreno";
  terminar();
}

function cerrarHost(){
  destruirRuedas(); modo=""; ocupado=false;
  const h=host(); if(h){ h.onclick=null; h.style.display="none"; h.innerHTML=""; }
}
// Fin de la bienvenida del cliente: queda vista, se borra el borrador y se redibuja la app (Comida,
// Progreso y Entreno ya con lo que contestó).
function terminar(){
  markSeen(); borrarBorrador(); D=null;
  save();
  cerrarHost();
  showSilkBg();
  renderApp();
}
// Coach: la app ya está dibujada por detrás, solo vuelve el fondo animado.
function close(){ markSeen(); cerrarHost(); showSilkBg(); }
// Cierra la ventana sin marcar la bienvenida (se abrió desde la app).
function closeOverlay(){ cerrarHost(); showSilkBg(); }

// ---- Coach ----
function showCoachWelcome(){
  const code=CoachState.coachInvite;
  if(!montarShell("coach")) return;
  pintar({ centro:true, main:{ onb:"done", label:"Ir a mi panel" },
    html:'<div class="auth-brand-ic" aria-hidden="true"><img src="brand/logo/gize-marca-blanca.svg" alt=""></div>'+
      tit("¡Bienvenido, coach!")+
      // En las apps (iPhone y Android) no se habla de la prueba gratis (core/tienda.js appNativa).
      (appNativa() ? '' : '<div class="onb-trial">14 días gratis para probar todo · sin tarjeta</div>')+
      sub("Pasale este código a tu primer alumno. Lo carga una vez y quedan conectados.")+
      (code ?
        '<div class="onb-code">'+
          '<div class="onb-code-lbl">Tu código</div>'+
          '<div class="onb-code-row"><span class="onb-code-val">'+esc(code)+'</span>'+
          '<button type="button" class="onb-copy" data-onb="copy">Copiar</button></div>'+
        '</div>' :
        sub("Tu código de invitación aparece arriba de todo en tu panel.")) });
  cabeza();
}
async function copiar(b){
  const code=CoachState.coachInvite;
  try{ await navigator.clipboard.writeText(code); }
  catch(err){ alert("No se pudo copiar. Código: "+code); return; }
  b.innerHTML=checkSvg+" Copiado"; b.classList.add("copied");
  setTimeout(()=>{ b.textContent="Copiar"; b.classList.remove("copied"); }, 1600);
}

// ---- Desde Entreno: «Ver rutinas armadas» ----
// La misma tarjeta, sin cabecera ni «Ahora no»: tocar una rutina la elige al toque (con la
// confirmación si ya tiene ejercicios) y «Cancelar» cierra sin marcar la bienvenida. El filtro
// arranca en los días por semana de su bienvenida y después queda lo que toque en esta sesión.
export function openRoutinePicker(){
  if(!montarShell("app")) return;
  if(!state.sex) appSexo(); else appLista();
}
const CANCELAR = '<button type="button" class="onb-alt" data-onb="cancel">Cancelar</button>';
function appSexo(){
  pintar({ main:null, alt:CANCELAR, html:tit("¿Para quién buscamos rutinas?")+sub("Así te mostramos las rutinas pensadas para vos.")+opciones("sex", sexos(true), state.sex) });
  cabeza();
}
function appLista(o){
  if(filtroApp==null) filtroApp=+cp().daysPerWeek || 0;
  const t=introRutinas();
  pintar({ main:null, alt:CANCELAR, sr:o && o.sr,
    html:tit("Elegí tu rutina")+(t.length ? sub(t.join(" ")) : "")+chipsDias(filtroApp)+
      '<button type="button" class="onb-link" data-onb="sexagain">Cambiar: '+sexoTxt()+'</button>'+
      '<div class="onb-routines" aria-live="polite">'+(_cat ? listaHtml(filtroApp, null, true) : '<p class="onb-text">Cargando rutinas…</p>')+'</div>' });
  cabeza();
  if(_cat) listaLista();
  // Si en la base todavía no hay ninguna para esta opción, las de ejemplo de la app. Sin
  // respuesta en 4 s (señal floja), también: el pedido sigue y la próxima vez ya está.
  const tk=tok, antes=_cat;
  catalogo().then(()=>{ if(tk===tok && modo==="app" && _cat!==antes) pintarLista(); });
}
async function appElegir(id){
  const r=_mostradas.find(x=>x.id===id); if(!r) return;
  if(hasWork() && !await confirmar("Esto reemplaza tus días de rutina por «"+r.nombre+"». No toca tus pesos, entrenos ni hábitos. ¿Seguro?")) return;
  state.days=copiarDias(r.days); State.activeId=(diaDeHoy(state.days)||state.days[0]).id; State.view="entreno";
  save(); closeOverlay(); renderApp();
}

// ---- Toques (uno solo para toda la tarjeta) ----
function alTocar(e){
  const b=e.target.closest("[data-onb]"); if(!b || b.disabled) return;
  const a=b.dataset.onb, v=b.dataset.v;
  if(modo==="coach"){ if(a==="done") close(); else if(a==="copy") copiar(b); return; }
  if(modo==="intro"){ if(a==="start") empezar(); return; }
  if(modo==="app"){
    if(a==="cancel"){ closeOverlay(); return; }
    if(a==="sex"){ state.sex=v; save(); mark("sex", v); appLista({ sr:"Cargando rutinas…" }); return; }
    if(a==="sexagain"){ appSexo(); return; }
    if(a==="dias"){ filtroApp=+v||0; mark("dias", filtroApp); pintarLista(); return; }
    if(a==="pick") appElegir(v);
    return;
  }
  if(modo!=="wiz" || !D) return;
  if(a==="next"){ siguiente(); return; }
  if(a==="back"){ atras(); return; }
  if(a==="later"){ ahoraNo(); return; }
  if(ocupado) return;
  if(a==="dskip"){ avanzar("disc"); return; }
  if(a==="solo"){ const ps=pasos(), i=ps.indexOf("code"); if(i>=0 && i<ps.length-1) ir(ps[i+1]); return; }
  if(a==="empty"){ D.ans.start="vacio"; ir("dias"); return; }
  if(a==="sexagain"){ ir("rutina", { detour:true }); return; }
  if(a==="disc"){
    toggleDisciplina(v); save();
    const on=myDisciplinas().some(d=>d.id===v);
    b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on));
    refrescar(); return;
  }
  if(a==="sex"){
    // En el desvío: solo el filtro de rutinas (state.sex), y vuelve a la lista.
    if(D.detour){ state.sex=v; save(); mark("sex", v); ir("rutina", { sr:"Cargando rutinas…" }); return; }
    D.ans.sex=v;
  }
  else if(a==="goal") D.ans.objetivo=v;
  else if(a==="act") D.ans.actividad=v;
  else if(a==="nivel") D.ans.nivel=v;
  else if(a==="days"){ D.ans.dias=+v; D.flags.diasTocado=true; }
  else if(a==="arranque"){ D.ans.start=v; mark(a, v); cabeza(); guardarBorrador(); return; } // N cambia ahí mismo
  else if(a==="dias"){ D.ans.filtro=+v||0; mark(a, D.ans.filtro); pintarLista(); guardarBorrador(); return; }
  else if(a==="pick"){ D.ans.rutina=v; mark(a, v); refrescar(); guardarBorrador(); return; }
  else return;
  mark(a, v); refrescar(); guardarBorrador();
}
