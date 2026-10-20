import { disciplinasLabel } from '../../core/disciplinas.js';
import { copySvg, gearSvg, resetSvg } from '../../core/icons.js';

import { dec, esc, fmtDate, today } from '../../core/utils.js';

import { coachInitials, renderCoachInfo } from './clientes.js';

import { renderApplyPicker, renderCoachBlock, renderCoachHabits, renderCoachPlan, renderCoachRoutine, renderCoachSchedule, renderCopyPicker, renderSchedPicker } from './rutinas.js';

import { renderCoachCalendar, calSelDay } from './calendario.js';

import { renderCoachCheckins, renderCoachDaily, renderCoachWeekly } from './seguimiento.js';

import { CoachState } from './state.js';
import { State } from '../../core/state.js';
import { blockWeek, isDeload, weekRange } from '../../core/bloque.js';

import { renderVolumen, renderWChart } from '../progreso.js';

import { lucesCoach, showSilkBg } from '../../ui/background.js';

import { renderSessionItem } from '../../ui/sessiondetail.js';

import { avatarHtml } from '../../core/avatar.js';

import { unreadFor } from '../../ui/chat.js';

import { billing, renderPaywall, renderPlanBanner } from './plan.js';
import { renderSettingsView } from './settings.js';

import { appNativa } from '../../core/tienda.js';
import { comprasApple } from '../../core/compras-apple.js';

import { renderCoachSalidas, salidasTileText } from './salidas.js';
import { syncRouteViews } from '../../ui/mapa.js';
import { clientPlanDirty, mealEditHead, renderMealPicker, snapMealEdit } from './planes.js';
import { coachShell, pageHead, secIcon, renderClientsView, renderHomeView, renderMealsView, renderTplsView } from './panel.js';
import { pintarGym, sinPlanGym } from '../../core/gimnasio.js';
import { accesoGym, cargarFichaGym, cartelGym, conTarjetaGym, cssGym, enGym, esProfeGym, esSocioGym, focoRec, inviteGym, notaPropios, puedeRecepcion, seccionGym, tileGym, vistaRecepcion, volverFocoRec } from './gimnasio.js';

// Ficha en modo lectura (el dueño o la administración del gimnasio miran a un socio que compartió sus
// registros y no es suyo; ver openClient): se ve todo lo que el socio compartió, pero no se edita. Solo
// quedan los botones que navegan (volver, pestañas, secciones, abrir un ejercicio o una semana,
// el calendario); los campos quedan deshabilitados. Además, ningún otro data-coach llega a main.js.
const LECTURA_OK = /^(back|refresh|client-tab|sec-open|sec-close|plsec-open|plsec-close|edit-day|rt-toggle|wk-open|wk-close|ex|dayfilter|ea-play|cal-.+)$/;
const enLectura = () => !!(CoachState.coachSel && CoachState.coachLectura);
function soloLectura(host){
  const main=host.querySelector(".cv-main"); if(!main) return;
  main.querySelectorAll("[data-coach]").forEach(el=>{ if(!LECTURA_OK.test(el.dataset.coach)) el.remove(); });
  main.querySelectorAll("input, textarea, select").forEach(el=>{ if(!(el.dataset.coach && LECTURA_OK.test(el.dataset.coach))) el.disabled=true; });
}
document.addEventListener("click", e=>{
  if(!enLectura()) return;
  const b=e.target.closest && e.target.closest("#coachHost .cv-main [data-coach]");
  if(b && !LECTURA_OK.test(b.dataset.coach)){ e.preventDefault(); e.stopImmediatePropagation(); }
}, true);

// Título de sección con la ruedita que abre el editor de preguntas en esa pestaña.
function secHead(title, kind){
  return '<div class="co-sec co-sec-row"><span>'+title+'</span><button class="co-sec-gear" data-coach="q-open" data-k="'+kind+'" title="Editar preguntas" aria-label="Editar preguntas de '+title.toLowerCase()+'">'+gearSvg+'</button></div>';
}

// Código para que se vinculen clientes. Con el cupo del plan lleno no se muestra: nadie más se
// puede vincular (la base lo rechaza igual) y en su lugar se ofrece un plan más grande.
// En la app de Android (core/tienda.js appNativa) el aviso no nombra el plan: solo que llegó al
// máximo. En la de iPhone, con los planes de Apple (core/compras-apple.js), es el de la web.
// Código viejo (6 caracteres, de antes de supabase/endurecer-base.sql): sigue sirviendo, pero es
// más fácil de adivinar; se le sugiere cambiarlo (supabase/coach-alumnos.sql).
// Profe de un gimnasio (screens/coach/gimnasio.js): primero el código del gimnasio; el personal, solo
// si tiene alumnos propios o un plan propio (billing().propio), y en las apps sin «Ver planes».
const IS_NATIVE_APP = appNativa() && !comprasApple();
function inviteBox(){
  if(esProfeGym()) return inviteGym(billing().propio ? cajaPersonal(true) : "");
  return cajaPersonal(false);
}
function cajaPersonal(profe){
  const b=billing(), viejo=!!CoachState.coachInvite && String(CoachState.coachInvite).length<8;
  if(b.known && b.atCap && (IS_NATIVE_APP || (profe && appNativa()))) return '<div class="co-invite co-invite-full"><b>Llegaste al máximo de alumnos de tu cuenta.</b><div class="co-invite-sub">Nadie más se puede vincular con tu código.</div></div>';
  if(b.known && b.atCap) return '<div class="co-invite co-invite-full"><b>Llegaste al máximo de tu plan</b> ('+b.count+'/'+b.max+' clientes)<div class="co-invite-sub">Para sumar más clientes pasate a un plan más grande.</div><button class="co-copy-btn" data-plan="open">Ver planes</button></div>';
  if(profe) return '<div class="co-invite">Tu código personal<br><span class="co-code">'+esc(CoachState.coachInvite||"—")+'</span>'+(CoachState.coachInvite?'<button class="co-copy-btn co-invite-copy" data-coach="copy-invite">'+copySvg+' Copiar código</button>':'')+'<div class="co-invite-sub">Para tus alumnos propios, de afuera del gimnasio.'+(viejo?' Es un código del formato anterior, más fácil de adivinar: te conviene cambiarlo.':'')+(CoachState.coachInvite?' <button class="co-invite-rotate" data-coach="rotate-invite">Cambiar código</button>':'')+'</div></div>';
  return '<div class="co-invite">Tu código de invitación<br><span class="co-code">'+esc(CoachState.coachInvite||"—")+'</span>'+(CoachState.coachInvite?'<button class="co-copy-btn co-invite-copy" data-coach="copy-invite">'+copySvg+' Copiar código</button>':'')+'<div class="co-invite-sub">Compartíselo a tus clientes para que se vinculen a vos.'+(viejo?' Es un código del formato anterior, más corto y fácil de adivinar: te conviene cambiarlo. Sirve hasta que lo cambies.':'')+(CoachState.coachInvite?' <button class="co-invite-rotate" data-coach="rotate-invite">Cambiar código</button>':'')+'</div></div>';
}

// Cambios sin guardar: la primera vez que se dibuja una rutina (del cliente o en el editor) se
// guarda cómo estaba, para avisar antes de salir y perderlos.
const tplSnap = e => JSON.stringify([e.name || "", e.starts_on || "", e.days || []]);
export function tplDirty(){ const e=CoachState.coachTplEdit; return !!(e && !e.deload && e.orig0!==undefined && tplSnap(e)!==e.orig0); }
export function routineDirty(){ const d=CoachState.coachData; return !!(d && d.id && d.routineOrig!==undefined && JSON.stringify(d.routine||[])!==d.routineOrig); }
function snapEdits(){
  const e=CoachState.coachTplEdit; if(e && !e.deload && e.orig0===undefined) e.orig0=tplSnap(e);
  const d=CoachState.coachData; if(d && d.id && Array.isArray(d.routine) && d.routineOrig===undefined) d.routineOrig=JSON.stringify(d.routine);
}
// Qué tiene sin guardar el alumno abierto, para el aviso al salir: la rutina, el plan alimenticio,
// la ficha y el bloque (los formularios de la ficha y el bloque existen solo después de editarlos).
export function clientUnsaved(){
  const d=CoachState.coachData; if(!d || !d.id) return "";
  const q=[routineDirty()&&"la rutina", clientPlanDirty()&&"el plan alimenticio", CoachState.coachInfoForm&&"la ficha", CoachState.coachBlockForm&&"el bloque"].filter(Boolean);
  return q.length>1 ? q.slice(0,-1).join(", ")+" y "+q[q.length-1] : (q[0]||"");
}
window.addEventListener("beforeunload", ev => { if(tplDirty() || clientUnsaved()){ ev.preventDefault(); ev.returnValue=""; } });

// Borrador de la rutina del cliente en este dispositivo: se guarda con cada cambio y al salir
// de la app. En el celular, ir a otra app (a copiar la rutina de WhatsApp, por ejemplo) puede
// hacer que el navegador recargue la página al volver, y se perdía todo lo no guardado.
// Al abrir de nuevo al cliente se recupera (ver openClient).
const draftKey = id => "gize_rt_draft_" + ((State.cloudUser && State.cloudUser.id) || "") + "_" + id;
export function readRoutineDraft(id){ try{ return JSON.parse(localStorage.getItem(draftKey(id)) || "null"); }catch(e){ return null; } }
export function dropRoutineDraft(id){ try{ localStorage.removeItem(draftKey(id)); }catch(e){} }
export function persistRoutineDraft(){
  const d=CoachState.coachData; if(!d || !d.id || d.routineOrig===undefined) return;
  try{
    if(routineDirty()) localStorage.setItem(draftKey(d.id), JSON.stringify({ days:d.routine, base:d.routineOrig, ts:Date.now() }));
    else localStorage.removeItem(draftKey(d.id));
  }catch(e){}
}
document.addEventListener("visibilitychange", () => { if(document.visibilityState==="hidden") persistRoutineDraft(); });
window.addEventListener("pagehide", persistRoutineDraft);

export function renderCoach(){
  // El panel del gimnasio (dueño y administración) dibuja en su lugar; sin gimnasio, como siempre.
  if(pintarGym()) return;
  const host=document.getElementById("coachHost"); if(!host) return;
  if(enGym()) cssGym();
  queueMicrotask(syncRouteViews); // después de dibujar: el recorrido de una salida abierta a su lugar (o afuera)
  snapEdits(); snapMealEdit(); persistRoutineDraft();
  if(!CoachState.coachSel && CoachState.coachApplyPicker){ CoachState.coachApplyPicker=null; renderApplyPicker(); }
  if(!CoachState.coachSel && CoachState.coachMealPicker && CoachState.coachMealPicker.mode==="one"){ CoachState.coachMealPicker=null; renderMealPicker(); }
  if(!CoachState.coachSel && CoachState.coachCopyPicker){ CoachState.coachCopyPicker=null; renderCopyPicker(); }
  if(!CoachState.coachSel && CoachState.coachSchedPicker){ CoachState.coachSchedPicker=null; renderSchedPicker(); }
  host.style.display="block";
  // La pantalla del alumno que pudo quedar armada debajo (primer ingreso de un coach) no se ve
  // ni ocupa memoria mientras está el panel (css/ui/theme.css: body.silk-coach #view).
  const v=document.getElementById("view"); if(v && v.firstChild) v.innerHTML="";
  showSilkBg();
  document.body.classList.add("silk-coach");
  lucesCoach(); // las luces del fondo («Oscuro»): se mueven muy despacio (app/ui/background.js)
  // Sin prueba ni plan vigente: solo la pantalla de planes (la base igual no le deja
  // leer los datos de los clientes, ver supabase/suscripciones.sql).
  // Adentro del panel del gimnasio (dueño o administración) manda el plan del gimnasio: core/gimnasio.js.
  const gymPlan=sinPlanGym();
  // El profe de un gimnasio nunca ve la pantalla de pago: el panel sigue por sus socios del gimnasio (con
  // el plan propio vencido, un cartel sobre sus alumnos propios: notaPropios).
  if(!billing().active && gymPlan===null && !esProfeGym()){ host.innerHTML=renderPaywall(); return; }
  if(gymPlan){ host.innerHTML=gymPlan; return; }
  if(!CoachState.coachSel && !CoachState.coachTplEdit && !CoachState.coachMealEdit){
    // Las cuatro pantallas de arriba (Inicio, Clientes, Rutinas, Planes alimenticios): ver panel.js.
    // En el panel del gimnasio, sin el cartel del plan de coach (el plan está en «Plan de GIZE»).
    // El profe de un gimnasio: los carteles del gimnasio (gracia o pausa) y, con el plan propio vencido,
    // el de sus alumnos propios. «Recepción», si el gimnasio la abre para los profes.
    if(CoachState.coachView==="gym-recepcion" && !puedeRecepcion()) CoachState.coachView="clients";
    const v=CoachState.coachView, banner=gymPlan===null ? cartelGym()+renderPlanBanner()+notaPropios(billing().active) : "";
    const foco=focoRec();
    host.innerHTML=coachShell(v, v==="settings" ? renderSettingsView() : v==="gym-recepcion" ? vistaRecepcion(pageHead) : v==="meals" ? renderMealsView(banner) : v==="tpls" ? renderTplsView(banner) : v==="home" ? renderHomeView(banner) : renderClientsView(inviteBox(), banner));
    volverFocoRec(foco);
  } else if(CoachState.coachTplEdit){
    const rt=CoachState.coachTplEdit.days||[];
    let ed="";
    if(!rt.length){ ed='<div class="cal-hint">Esta rutina no tiene días todavía.</div><button class="co-add-day" data-coach="day-add">+ Agregar día</button>'; }
    else { ed=renderCoachRoutine({routine:rt, sessions:[]}); }
    const sch=!!CoachState.coachTplEdit.sched, dle=!!CoachState.coachTplEdit.deload;
    const who=esc((CoachState.coachData&&CoachState.coachData.name)||"el alumno");
    const dlRange=dle ? weekRange(CoachState.coachBlockForm||(CoachState.coachData&&CoachState.coachData.block), CoachState.coachTplEdit.wk) : null;
    host.innerHTML=coachShell(CoachState.coachSel?"clients":"tpls",
      '<div class="co-head"><button class="co-back" data-coach="tpl-back">‹ Volver</button>'+
      '<button class="co-logout" data-coach="tpl-del">'+(dle?(CoachState.coachTplEdit.saved?'Borrar rutina de descarga':'Descartar'):sch?'Borrar programación':'Borrar rutina')+'</button></div>'+
      (dle ? '<div class="co-sched-edit-t">Rutina de descarga \u00b7 semana '+CoachState.coachTplEdit.wk+' de '+who+'</div>'+
        '<div class="co-sched-sub">'+(dlRange?'Del '+esc(fmtDate(dlRange[0]))+' al '+esc(fmtDate(dlRange[1]))+': ':'')+'esa semana la usa en lugar de su rutina de siempre, que vuelve sola el lunes siguiente con los pesos que tenía cargados.</div>' : '')+
      (sch ? '<div class="co-sched-edit-t">Rutina programada para '+esc((CoachState.coachData&&CoachState.coachData.name)||"el alumno")+'</div>'+
        '<div class="co-sched-sub">Hasta esa fecha el alumno sigue con su rutina de ahora. Ese día le cambia sola por esta.</div>'+
        '<div class="ci-f" style="margin-bottom:10px"><label>Empieza el</label><input class="co-note" type="date" data-coach="sched-date" min="'+esc(today())+'" value="'+esc(CoachState.coachTplEdit.starts_on||"")+'"></div>' : '')+
      (dle ? '' : '<div class="ci-f" style="margin-bottom:14px"><label>Nombre de la rutina'+(sch?' (opcional)':'')+'</label><input class="co-note" data-coach="tpl-name" value="'+esc(CoachState.coachTplEdit.name||"")+'"></div>')+
      ed+
      '<div class="co-savebar"><button class="co-save-rt" data-coach="tpl-save">'+(dle?'Guardar rutina de descarga':sch?'Guardar rutina programada':'Guardar rutina')+'</button></div>');
  } else if(CoachState.coachMealEdit && !CoachState.coachSel){
    // Plan guardado de «Mis planes»: el mismo editor del plan del cliente (ver planes.js).
    host.innerHTML=coachShell("meals", mealEditHead()+renderCoachPlan(null));
  } else {
    const d=CoachState.coachData; let body="";
    if(!d||d.loading){ body='<div class="cal-hint">Cargando…</div>'; }
    else if(d.error){ body=CoachState.coachSel && accesoGym()==="pausado" && esSocioGym(CoachState.coachSel) ? cartelGym() : '<div class="cal-hint">No se pudo cargar. Reintentá.</div>'; }
    else {
      const wchart=d.weights.length ? renderWChart(d.weights,false,"med") : '<div class="cal-hint">Sin registros de peso.</div>';
      // Peso día a día: gráfico a la izquierda, registros a la derecha (antes iban uno debajo del otro).
      const wlist=d.weights.length ? '<table class="co-tbl"><thead><tr><th>Fecha</th><th>Peso</th></tr></thead><tbody>'+d.weights.slice().reverse().map(w=>'<tr><td class="dt">'+esc(fmtDate(w.date))+'</td><td><b>'+dec(w.kg)+' kg</b></td></tr>').join("")+'</tbody></table>' : "";
      const wblock=d.weights.length ? '<div class="co-split"><div class="co-split-main">'+wchart+'</div><div class="co-split-side">'+wlist+'</div></div>' : wchart;
      // Historial de entrenos: calendario con los días entrenados y, al tocar uno, su sesión.
      const sessSorted=d.sessions.slice().sort((a,b)=>(b.ts||0)-(a.ts||0));
      const calSess=sessSorted.length ? d.sessions.filter(se=>se.date===calSelDay("sess")).sort((x,y)=>(x.ts||0)-(y.ts||0)) : [];
      const sess=sessSorted.length ? renderCoachCalendar("sess", d.sessions.map(se=>se.date), today(), ["entreno","entrenos"])+(calSelDay("sess")?(calSess.length?calSess.map(se=>renderSessionItem(se,{open:true, history:d.sessions})).join(""):'<div class="cal-hint">Ese día no hay entreno.</div>'):'<div class="cal-hint">Tocá un día marcado para ver el entreno.</div>') : "";
      const vol=(d.routine&&d.routine.length)?renderVolumen(d.routine):'<div class="cal-hint">Sin rutina cargada.</div>';
      const tab=CoachState.coachClientTab||"ficha";
      const tabs='<div class="cv-ctabs" role="tablist">'+
        '<button class="cv-ctab'+(tab==="ficha"?" on":"")+'" role="tab" aria-selected="'+(tab==="ficha")+'" data-coach="client-tab" data-t="ficha">Ficha</button>'+
        '<button class="cv-ctab'+(tab==="rutina"?" on":"")+'" role="tab" aria-selected="'+(tab==="rutina")+'" data-coach="client-tab" data-t="rutina">Rutina</button>'+
        '<button class="cv-ctab'+(tab==="stats"?" on":"")+'" role="tab" aria-selected="'+(tab==="stats")+'" data-coach="client-tab" data-t="stats">Estadísticas</button>'+
        '<button class="cv-ctab'+(tab==="plan"?" on":"")+'" role="tab" aria-selected="'+(tab==="plan")+'" data-coach="client-tab" data-t="plan">Plan<span class="cv-more"> alimenticio</span></button>'+
      '</div>';
      let panel;
      if(tab==="rutina"){
        panel=renderCoachSchedule(d)+renderCoachRoutine(d);
      } else if(tab==="plan"){
        panel=renderCoachPlan(d);
      } else {
        // Ficha en secciones, como Progreso del alumno: un menú de tarjetas y cada una abre su parte.
        const SECS=[
          // El chat se abre encima (app/ui/chat.js), no como sección: ver "sec-open" en main.js.
          // Socio del gimnasio que atiende (screens/coach/gimnasio.js): estado, semáforo, apto y últimos ingresos.
          ["gimnasio","Gimnasio", ()=>seccionGym(d), ()=>tileGym(d)],
          ["chat","Chat con "+esc(String(d.name||"el cliente").split(" ")[0]), null, ()=>{ const n=unreadFor(d.id); if(n) return n+(n===1?" mensaje nuevo":" mensajes nuevos"); if(d.notify&&d.notify.devices===0) return "Mensajes y audios · no tiene los avisos activados"; return "Mensajes y audios"; }],
          ["ficha","Ficha del cliente", ()=>renderCoachInfo(d), ()=>d.info&&Object.keys(d.info).length?"Datos y objetivos":"Sin completar"],
          ["habitos","Hábitos diarios", ()=>renderCoachHabits(d), ()=>{ const h=d.plan&&d.plan.plan&&d.plan.plan.habits; const n=Array.isArray(h)?h.length:0; return n?n+(n===1?" hábito":" hábitos"):"Sin cargar"; }],
          ["bloque","Bloque / mesociclo", ()=>renderCoachBlock(d), ()=>{ const b=d.block; if(!b) return "Sin bloque"; const w=blockWeek(b, today()); const n=parseInt(b.weeks)||0; return (b.name||"Bloque cargado")+(w>=1&&(!n||w<=n)?" \u00b7 semana "+w+(isDeload(b,w)?" de descarga":""):""); }],
          ["daily","Seguimiento diario", ()=>secHead("Seguimiento diario","daily")+renderCoachDaily(d), ()=>{ const n=(d.daily||[]).length; return n?n+" registro"+(n===1?"":"s"):"Sin registros"; }],
          ["checkin","Check-in semanal", ()=>secHead("Check-in semanal","checkin")+renderCoachCheckins(d), ()=>{ const n=(d.checkins||[]).length; return n?n+" check-in"+(n===1?"":"s"):"Sin check-ins"; }],
          ["hist","Historial de entrenos", ()=>sess||'<div class="cal-hint">El cliente todavía no registró entrenos.</div>', ()=>{ const n=d.sessions.length; return n?n+" entreno"+(n===1?"":"s")+(sessSorted[0]?" · último "+fmtDate(sessSorted[0].date):""):"Sin entrenos"; }],
          ["salidas","Salidas a pie y en bici", ()=>renderCoachSalidas(d), ()=>salidasTileText(d)],
          ["volumen","Volumen semanal por músculo", ()=>vol, ()=>{ let t=0; (d.routine||[]).forEach(x=>(x.exercises||[]).forEach(ex=>{ t+=(ex.sets||[]).length; })); return t?t+" series por semana":"Sin rutina"; }],
          ["peso","Peso corporal", ()=>'<div class="co-sec">Promedio semanal</div>'+renderCoachWeekly(d)+'<div class="co-sec">Día a día</div>'+wblock, ()=>{ const w=d.weights; return w.length?Number(w[w.length-1].kg).toFixed(1).replace(".",",")+" kg":"Sin registros"; }],
        ];
        // Ficha: lo del alumno. Estadísticas: lo que fue registrando y el bloque (mesociclo), desde
        // donde se arman las semanas y las rutinas de descarga.
        const gymF=conTarjetaGym(d); if(gymF) cargarFichaGym(d);
        const ORDER={ ficha:gymF?["chat","gimnasio","ficha","habitos"]:["chat","ficha","habitos"], stats:["bloque","peso","hist","volumen","salidas","daily","checkin"] };
        const cur=SECS.find(x=>x[0]===CoachState.coachSec && x[2]);
        const shown=(ORDER[tab]||ORDER.ficha).filter(id=>!(d.lectura && id==="chat")).map(id=>SECS.find(x=>x[0]===id));
        if(cur){
          panel='<div class="form-head co-sec-head"><button class="form-back" data-coach="sec-close" aria-label="Volver">‹</button><div class="form-title">'+cur[1]+'</div></div>'+
            '<div class="co-panel co-sec-body">'+cur[2]()+'</div>';
        } else {
          panel='<div class="ptiles co-ptiles">'+shown.map(x=>'<button class="ptile" data-coach="sec-open" data-v="'+x[0]+'"><span class="ptile-t">'+secIcon(x[0])+x[1]+'</span><span class="ptile-s">'+esc(x[3]())+'</span><span class="ptile-go" aria-hidden="true">›</span></button>').join("")+'</div>'+(tab==="stats"||d.lectura?'':gymF?'<button class="logout-btn cfg-danger co-remove-client" data-coach="gym-dejar">Dejar de ser su profe</button>':'<button class="logout-btn cfg-danger co-remove-client" data-coach="remove-client">Desvincular alumno</button>');
        }
      }
      // Modo lectura: quién lo edita (el chat y los botones de editar no están).
      const lec=d.lectura ? '<div class="co-unsaved gy-lectura" role="note"><b>Solo lectura.</b> '+(d.lectura.profe ? 'Lo edita su profe, '+esc(String(d.lectura.profe).split(" ")[0])+'.' : 'No tiene profe asignado en el gimnasio.')+' Ves lo que compartió con la administración.</div>' : '';
      // Socio del gimnasio con el plan del gimnasio en gracia o con el acceso pausado: el mismo cartel que en Clientes.
      const gymAviso=accesoGym()!=="activo" && esSocioGym(d.id) ? cartelGym() : "";
      body=lec+gymAviso+tabs+panel;
    }
    host.innerHTML=coachShell("clients", '<div class="co-head cv-chead"><button class="co-back cv-back" data-coach="back" aria-label="Volver" title="Volver">‹</button>'+avatarHtml(CoachState.coachData&&CoachState.coachData.avatar, coachInitials(CoachState.coachData&&CoachState.coachData.name), 'co-avatar co-avatar-client')+'<div class="cv-cname"><div class="co-client-name">'+esc((CoachState.coachData&&CoachState.coachData.name)||"Cliente")+'</div>'+(disciplinasLabel(CoachState.coachData&&CoachState.coachData.disciplines)?'<div class="co-client-disc">'+esc(disciplinasLabel(CoachState.coachData.disciplines))+'</div>':'')+'</div><button class="co-back cv-refresh" data-coach="refresh" aria-label="Actualizar" title="Actualizar">'+resetSvg+'<span>Actualizar</span></button></div>'+body);
    if(enLectura()) soloLectura(host);
  }
}
