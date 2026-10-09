import { xSvg } from '../core/icons.js';

import { state } from '../core/state.js';

import { save } from '../core/storage.js';

import { beep, initAudio } from './audio.js';

import { cancelRestAlert, scheduleRestAlert } from './restnotif.js';

// El descanso se cuenta con la hora de fin (endAt), no restando 1 por segundo: con la
// app en segundo plano o la pantalla bloqueada el navegador frena los setInterval y el
// contador se atrasaba. Así, al volver se ve lo que queda de verdad (o que ya terminó).
// Se guarda en el dispositivo para seguir aunque la app se cierre y se vuelva a abrir.
export let rest = {active:false,total:0,remaining:0,id:null,endAt:0,doneUntil:0};
const REST_KEY = "gize_rest_timer";

function persist(){
  try{
    if(rest.active) localStorage.setItem(REST_KEY, JSON.stringify({endAt:rest.endAt, total:rest.total}));
    else localStorage.removeItem(REST_KEY);
  }catch(e){}
}

function leftSec(){ return Math.max(0, Math.ceil((rest.endAt - Date.now())/1000)); }

// El número muestra segundos: en vez de mirar cada 250 ms se programa un solo setTimeout justo
// para cuando cambia el próximo segundo (el último cae en endAt, así el aviso suena en hora).
// Menos despertares del procesador = menos batería.
function nextTick(){
  if(rest.id) clearTimeout(rest.id);
  const ms = rest.endAt - Date.now();
  rest.id = setTimeout(restTick, (ms <= 0 ? 0 : (ms % 1000) || 1000) + 10);
}

// El descanso del coach es texto libre. Acá los minutos se anotan 2' y los segundos 90'' (o 90"):
// antes el primer apóstrofo eran minutos y 90'' daba 90 minutos. Un rango ("60-90 seg") toma el primero.
export function parseRest(txt){
  if(!txt) return 0;
  const t=String(txt).trim().replace(/[\u2019\u00b4\u2032]/g,"'").replace(/[\u201d\u2033]/g,'"');
  let m=t.match(/(\d+):(\d+)/);
  if(m) return (+m[1])*60 + (+m[2]);
  m=t.match(/(\d+)\s*(?:'|min[a-z]*)\s*(?:y\s*)?(\d{1,2})(?!\d)/i); // 1'30, 1'30'', 1 min 30 seg
  if(m) return (+m[1])*60 + (+m[2]);
  m=t.match(/(\d+)(?:\s*[-\u2013]\s*\d+)?\s*(?:''|"|s\b|seg)/i);
  if(m) return +m[1];
  m=t.match(/(\d+(?:[.,]\d+)?)(?:\s*[-\u2013]\s*[\d.,]+)?\s*(?:'|min)/i);
  if(m) return Math.round(parseFloat(m[1].replace(",","."))*60);
  // Sin unidad: hasta 10 son minutos ("3"), más son segundos ("90").
  m=t.match(/(\d+)/);
  if(m){ const n=+m[1]; return n<=10 ? n*60 : n; }
  return 0;
}

export function restFmt(s){ const m=Math.floor(s/60), x=s%60; return m+":"+String(x).padStart(2,"0"); }

export function startRest(sec){
  sec = sec || state.restDefault || 120; state.restDefault = sec; initAudio();
  rest.active=true; rest.total=sec; rest.endAt=Date.now()+sec*1000; rest.remaining=sec;
  nextTick();
  persist(); renderRestBar(); save();
  scheduleRestAlert(rest.endAt); // aviso con la pantalla apagada (ver restnotif.js)
}

export function restTick(){
  if(!rest.active) return;
  const r=leftSec();
  if(r!==rest.remaining){ rest.remaining=r; updateRestBar(); }
  if(r<=0) restFinish(); else nextTick();
}

export function restFinish(){
  rest.active=false; if(rest.id){ clearTimeout(rest.id); rest.id=null; } persist();
  // Con la app a la vista ya suena acá: se cancela el aviso programado para no repetirlo.
  if(!document.hidden) cancelRestAlert();
  try{ beep(); }catch(e){}
  try{ if(navigator.vibrate) navigator.vibrate([200,100,200]); }catch(e){}
  // Con la app en segundo plano el aviso lo manda el servidor (web) o el celular (apps):
  // ver restnotif.js. Antes también se mostraba uno desde acá y llegaban dos.
  showDone();
}

// El aviso de terminado queda 6 s (aunque la app se re-dibuje en el medio).
function showDone(){ rest.doneUntil=Date.now()+6000; renderRestBar(true); setTimeout(()=>{ if(!rest.active) renderRestBar(); }, 6100); }

export function stopRest(){ const was=rest.active; rest.doneUntil=0; rest.active=false; if(rest.id){ clearTimeout(rest.id); rest.id=null; } persist(); renderRestBar(); if(was) cancelRestAlert(); }

// Al abrir la app: si había un descanso en curso, sigue desde donde va; si terminó hace
// poco (menos de 1 minuto), muestra el aviso de terminado.
export function resumeRest(){
  let saved=null; try{ saved=JSON.parse(localStorage.getItem(REST_KEY)||"null"); }catch(e){}
  if(!saved || !saved.endAt) return;
  const now=Date.now();
  if(saved.endAt>now){
    rest.active=true; rest.total=saved.total||Math.ceil((saved.endAt-now)/1000); rest.endAt=saved.endAt; rest.remaining=leftSec();
    nextTick();
    renderRestBar();
  } else {
    try{ localStorage.removeItem(REST_KEY); }catch(e){}
    if(now-saved.endAt<60000) showDone();
  }
}

// Al volver a la app, actualizar en el acto (sin esperar al próximo tick).
document.addEventListener("visibilitychange", ()=>{ if(!document.hidden && rest.active) restTick(); });

export function updateRestBar(){ const t=document.getElementById("restTime"); if(t) t.textContent=restFmt(rest.remaining); const b=document.getElementById("restProg"); if(b&&rest.total) b.style.transform="scaleX("+Math.max(0,Math.min(1,1-rest.remaining/rest.total))+")"; }

export function renderRestBar(finished){
  const el=document.getElementById("restBar"); if(!el) return;
  if(!rest.active && (finished || rest.doneUntil>Date.now())){ el.style.display="block"; el.innerHTML='<div class="rest-inner rest-done"><span class="rest-msg">¡Descanso terminado! 💪</span><button class="rest-x" data-action="rest-stop">Cerrar</button></div>'; return; }
  if(rest.active){
    el.style.display="block";
    el.innerHTML='<div class="rest-inner"><span class="rest-lbl2">Descanso</span><span id="restTime" class="rest-time">'+restFmt(rest.remaining)+'</span><button class="rest-x" data-action="rest-stop" title="Saltar">'+xSvg+'</button><div class="rest-prog-track"><div id="restProg" class="rest-prog" style="transform:scaleX('+Math.max(0,Math.min(1,1-rest.remaining/rest.total))+')"></div></div></div>';
    return;
  }
  el.style.display="none"; el.innerHTML="";
}
