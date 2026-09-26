import { copySvg, downloadSvg, gearSvg, resetSvg } from '../../core/icons.js';

import { esc, fmtDate, today } from '../../core/utils.js';

import { coachActivity, coachInitials, renderCoachInfo } from './clientes.js';

import { renderApplyPicker, renderCoachBlock, renderCoachPlan, renderCoachRoutine, renderCoachSchedule, renderCopyPicker } from './rutinas.js';

import { picker, renderCoachCheckins, renderCoachDaily, renderCoachWeekly } from './seguimiento.js';

import { CoachState } from './state.js';

import { renderVolumen, renderWChart } from '../progreso.js';

import { showSilkBg } from '../../ui/background.js';

import { renderSessionItem } from '../../ui/sessiondetail.js';

import { avatarHtml } from '../../core/avatar.js';

import { renderCoachNotify } from './notificar.js';

import { billing, renderPaywall, renderPlanBanner } from './plan.js';

// Título de sección con la ruedita que abre el editor de preguntas en esa pestaña.
function secHead(title, kind){
  return '<div class="co-sec co-sec-row"><span>'+title+'</span><button class="co-sec-gear" data-coach="q-open" data-k="'+kind+'" title="Editar preguntas" aria-label="Editar preguntas de '+title.toLowerCase()+'">'+gearSvg+'</button></div>';
}

export function renderCoach(){
  const host=document.getElementById("coachHost"); if(!host) return;
  if(!CoachState.coachSel && CoachState.coachApplyPicker){ CoachState.coachApplyPicker=null; renderApplyPicker(); }
  if(!CoachState.coachSel && CoachState.coachCopyPicker){ CoachState.coachCopyPicker=null; renderCopyPicker(); }
  host.style.display="block";
  showSilkBg();
  document.body.classList.add("silk-coach");
  // Sin prueba ni plan vigente: solo la pantalla de planes (la base igual no le deja
  // leer los datos de los clientes, ver supabase/suscripciones.sql).
  if(!billing().active){ host.innerHTML=renderPaywall(); return; }
  if(!CoachState.coachSel && !CoachState.coachTplEdit){
    const tabs='<div class="co-tabs">'+
      '<button class="co-tab'+(CoachState.coachView==="clients"?" on":"")+'" data-coach="view-clients">Clientes <span class="co-tab-count'+(CoachState.coachClients.length?" has":"")+'">('+CoachState.coachClients.length+')</span></button>'+
      '<button class="co-tab'+(CoachState.coachView==="tpls"?" on":"")+'" data-coach="view-tpls">Mis rutinas <span class="co-tab-count'+(CoachState.coachTpls.length?" has":"")+'">('+CoachState.coachTpls.length+')</span></button>'+
    '</div>';
    let body="";
    if(CoachState.coachView==="tpls"){
      const tl=CoachState.coachTpls.length ? CoachState.coachTpls.map(t=>{
        const nd=(t.days||[]).length;
        const nex=(t.days||[]).reduce((n,d)=>n+((d.exercises||[]).length),0);
        return '<div class="co-item tpl-item" data-coach="tpl-open" data-id="'+esc(t.id)+'">'+
          '<div class="co-name">'+esc(t.name||"Sin nombre")+'</div>'+
          '<div class="co-item-meta">'+nd+' día'+(nd===1?'':'s')+' · '+nex+' ejercicios</div>'+
          '<div class="co-arrow">›</div></div>';
      }).join("") : (CoachState.tplsError ? '<div class="cal-hint" style="color:var(--red)">No se pudieron cargar: <b>'+esc(CoachState.tplsError)+'</b><br><br>Si dice que la tabla no existe, falta correr el SQL de rutinas en Supabase.</div>' : '<div class="cal-hint">Todavía no creaste ninguna rutina. Creá una y después aplicásela a los clientes que quieras.</div>');
      body='<div class="co-items">'+tl+'</div>'+
        '<button class="co-add-day" data-coach="tpl-new">+ Crear rutina nueva</button>'+
        '<button class="co-copy-btn" style="margin-top:8px" data-coach="tpl-seed">'+downloadSvg+' Importar Meso 2 · Microciclo 8</button>'+
        '<button class="co-copy-btn" style="margin-top:8px" data-coach="tpl-seed-ppl">'+downloadSvg+' Importar PPL · 5 días</button>';
    } else {
      const q=(CoachState.coachSearch||"").toLowerCase();
      const filtered=CoachState.coachClients.filter(c=>(c.full_name||"").toLowerCase().includes(q));
      const onboard='<div class="co-onboard">'+
        '<div class="co-onboard-lead">Todavía no tenés clientes vinculados</div>'+
        '<div class="co-item co-onboard-step"><div class="co-onboard-n">1</div><div class="co-onboard-txt">Copiá tu <b>código de invitación</b> de arriba</div></div>'+
        '<div class="co-item co-onboard-step"><div class="co-onboard-n">2</div><div class="co-onboard-txt">Pasáselo a tu cliente por donde le quede más cómodo</div></div>'+
        '<div class="co-item co-onboard-step"><div class="co-onboard-n">3</div><div class="co-onboard-txt">Se vincula solo — va a aparecer acá apenas lo haga</div></div>'+
      '</div>';
      const rows=filtered.map(c=>{
        const st=CoachState.coachClientStats[c.id]||{};
        const act=coachActivity(st.lastSess);
        const statusLine=act.has ? '<div class="co-act-status"><span class="co-dot'+(act.active?' on':'')+'"></span>'+act.statusLabel+'</div>' : "";
        return '<div class="co-trow" data-coach="open" data-id="'+esc(c.id)+'">'+
            '<div class="co-td co-td-name">'+avatarHtml(c.avatar_path, coachInitials(c.full_name), 'co-avatar')+'<span class="co-cname">'+esc(c.full_name||"Sin nombre")+'</span></div>'+
            '<div class="co-td co-td-email'+(c.email?'':' co-empty')+'">'+esc(c.email||"Sin email")+'</div>'+
            '<div class="co-td co-td-activity"><div class="co-act-date">'+esc(act.label)+'</div>'+statusLine+'</div>'+
            '<div class="co-td co-td-actions"><span class="co-arrow">›</span></div>'+
          '</div>';
      }).join("");
      const list=filtered.length ? '<div class="co-table"><div class="co-trow co-thead"><div class="co-th">Nombre</div><div class="co-th">Email</div><div class="co-th">Última actividad</div><div class="co-th">Acciones</div></div>'+rows+'</div>' : '<div class="cal-hint">Sin resultados.</div>';
      // Antes solo aparecía con más de 3 clientes — con pocos igual conviene mostrarlo
      // siempre: en uso real la lista crece, y ocultarlo generaba la duda de "¿no hay
      // buscador?" incluso con 1 o 2 clientes cargados.
      const searchBox='<input class="co-search" placeholder="\u{1F50D} Buscar cliente…" data-coach="coach-search" value="'+esc(CoachState.coachSearch||"")+'">';
      // El onboarding es un bloque ancho de texto/pasos, no una card angosta más — si lo
      // metiera adentro de .co-items (grid de auto-fill,minmax(260px,1fr) en desktop)
      // quedaría encajonado en una sola columna angosta con carriles vacíos al lado.
      // Va como reemplazo del bloque entero (sin buscador ni grid), no como un item más.
      body=(!CoachState.coachSearch && !CoachState.coachClients.length) ? onboard : searchBox+list;
    }
    host.innerHTML='<div class="co-wrap"><div class="co-head"><div class="co-brand"><img class="brand-logo" src="brand/logo/gize-firma-horizontal.svg" alt="GIZE"><span class="co-brand-dash">-</span><span class="co-brand-tag">Panel de coach</span></div><div class="co-head-actions"><button class="co-logout co-q-btn" data-coach="q-open" title="Preguntas del registro diario y del check-in">Preguntas</button><button class="co-gear" data-coach="open-settings" title="Configuración">'+gearSvg+'</button><button class="co-logout" data-auth="logout">Salir</button></div></div><div class="co-invite">Tu código de invitación<br><span class="co-code">'+esc(CoachState.coachInvite||"—")+'</span>'+(CoachState.coachInvite?'<button class="co-copy-btn co-invite-copy" data-coach="copy-invite">'+copySvg+' Copiar código</button>':'')+'<div class="co-invite-sub">Compartíselo a tus clientes para que se vinculen a vos.'+(CoachState.coachInvite?' <button class="co-invite-rotate" data-coach="rotate-invite">Cambiar código</button>':'')+'</div></div>'+renderPlanBanner()+tabs+body+'</div>';
  } else if(CoachState.coachTplEdit){
    const rt=CoachState.coachTplEdit.days||[];
    let ed="";
    if(!rt.length){ ed='<div class="cal-hint">Esta rutina no tiene días todavía.</div><button class="co-add-day" data-coach="day-add">+ Agregar día</button>'; }
    else { ed=renderCoachRoutine({routine:rt, sessions:[]}); }
    const sch=!!CoachState.coachTplEdit.sched;
    host.innerHTML='<div class="co-wrap">'+
      '<div class="co-head"><button class="co-back" data-coach="tpl-back">‹ Volver</button>'+
      '<button class="co-logout" data-coach="tpl-del">'+(sch?'Borrar programación':'Borrar rutina')+'</button></div>'+
      (sch ? '<div class="co-sched-edit-t">Rutina programada para '+esc((CoachState.coachData&&CoachState.coachData.name)||"el alumno")+'</div>'+
        '<div class="co-sched-sub">Hasta esa fecha el alumno sigue con su rutina de ahora. Ese día le cambia sola por esta.</div>'+
        '<div class="ci-f" style="margin-bottom:10px"><label>Empieza el</label><input class="co-note" type="date" data-coach="sched-date" min="'+esc(today())+'" value="'+esc(CoachState.coachTplEdit.starts_on||"")+'"></div>' : '')+
      '<div class="ci-f" style="margin-bottom:14px"><label>Nombre de la rutina'+(sch?' (opcional)':'')+'</label><input class="co-note" data-coach="tpl-name" value="'+esc(CoachState.coachTplEdit.name||"")+'"></div>'+
      ed+
      '<button class="co-save-rt" data-coach="tpl-save">'+(sch?'Guardar rutina programada':'Guardar rutina')+'</button>'+
    '</div>';
  } else {
    const d=CoachState.coachData; let body="";
    if(!d||d.loading){ body='<div class="cal-hint">Cargando…</div>'; }
    else if(d.error){ body='<div class="cal-hint">No se pudo cargar. Reintentá.</div>'; }
    else {
      const wchart=d.weights.length ? renderWChart(d.weights,false,"med") : '<div class="cal-hint">Sin registros de peso.</div>';
      // Peso día a día: gráfico a la izquierda, registros a la derecha (antes iban uno debajo del otro).
      const wlist=d.weights.length ? '<table class="co-tbl"><thead><tr><th>Fecha</th><th>Peso</th></tr></thead><tbody>'+d.weights.slice().reverse().map(w=>'<tr><td class="dt">'+fmtDate(w.date)+'</td><td><b>'+Number(w.kg).toFixed(1)+' kg</b></td></tr>').join("")+'</tbody></table>' : "";
      const wblock=d.weights.length ? '<div class="co-split"><div class="co-split-main">'+wchart+'</div><div class="co-split-side">'+wlist+'</div></div>' : wchart;
      // Historial de entrenos: un entreno por vez con el mismo selector que el seguimiento.
      const sessSorted=d.sessions.slice().sort((a,b)=>(b.ts||0)-(a.ts||0));
      const sessKey=se=>String(se.ts||se.date);
      const sessSel=sessSorted.some(se=>sessKey(se)===CoachState.coachSessSel) ? CoachState.coachSessSel : "";
      const sessOne=sessSorted.find(se=>sessKey(se)===sessSel);
      const sess=sessSorted.length ? picker("sess-pick", sessSorted.map(se=>{ const n=(se.exercises||[]).reduce((t,e)=>t+(e.sets||[]).length,0); return {v:sessKey(se), t:fmtDate(se.date)+" · "+(se.day||"Entreno")+" ("+n+(n===1?" serie)":" series)")}; }), sessSel, "Entreno")+(sessOne?renderSessionItem(sessOne,{open:true, history:d.sessions}):"") : "";
      const vol=(d.routine&&d.routine.length)?renderVolumen(d.routine):'<div class="cal-hint">Sin rutina cargada.</div>';
      const tab=CoachState.coachClientTab||"ficha";
      const tabs='<div class="co-tabs">'+
        '<button class="co-tab'+(tab==="ficha"?" on":"")+'" data-coach="client-tab" data-t="ficha">Ficha</button>'+
        '<button class="co-tab'+(tab==="rutina"?" on":"")+'" data-coach="client-tab" data-t="rutina">Rutina</button>'+
        '<button class="co-tab'+(tab==="plan"?" on":"")+'" data-coach="client-tab" data-t="plan">Plan alimenticio</button>'+
      '</div>';
      let panel;
      if(tab==="rutina"){
        panel=renderCoachSchedule(d)+renderCoachRoutine(d);
      } else if(tab==="plan"){
        panel=renderCoachPlan(d);
      } else {
        // Ficha en secciones, como Progreso del alumno: un menú de tarjetas y cada una abre su parte.
        const SECS=[
          ["notif","Notificación al cliente", ()=>renderCoachNotify(d), ()=>{ const m=(d.notify&&d.notify.msgs)||[]; return m.length?"Último: "+fmtDate(String(m[0].created_at).slice(0,10)):"Mandale un mensaje"; }],
          ["ficha","Ficha del cliente", ()=>renderCoachInfo(d), ()=>d.info&&Object.keys(d.info).length?"Datos y objetivos":"Sin completar"],
          ["bloque","Bloque / mesociclo", ()=>renderCoachBlock(d), ()=>d.block?(d.block.name||"Bloque cargado"):"Sin bloque"],
          ["daily","Seguimiento diario", ()=>secHead("Seguimiento diario","daily")+renderCoachDaily(d), ()=>{ const n=(d.daily||[]).length; return n?n+" registro"+(n===1?"":"s"):"Sin registros"; }],
          ["checkin","Check-in semanal", ()=>secHead("Check-in semanal","checkin")+renderCoachCheckins(d), ()=>{ const n=(d.checkins||[]).length; return n?n+" check-in"+(n===1?"":"s"):"Sin check-ins"; }],
          ["hist","Historial de entrenos", ()=>sess||'<div class="cal-hint">El cliente todavía no registró entrenos.</div>', ()=>{ const n=d.sessions.length; return n?n+" entreno"+(n===1?"":"s")+(sessSorted[0]?" · último "+fmtDate(sessSorted[0].date):""):"Sin entrenos"; }],
          ["volumen","Volumen semanal por músculo", ()=>vol, ()=>{ let t=0; (d.routine||[]).forEach(x=>(x.exercises||[]).forEach(ex=>{ t+=(ex.sets||[]).length; })); return t?t+" series por semana":"Sin rutina"; }],
          ["peso","Peso corporal", ()=>'<div class="co-sec">Promedio semanal</div>'+renderCoachWeekly(d)+'<div class="co-sec">Día a día</div>'+wblock, ()=>{ const w=d.weights; return w.length?Number(w[w.length-1].kg).toFixed(1).replace(".",",")+" kg":"Sin registros"; }],
        ];
        const cur=SECS.find(x=>x[0]===CoachState.coachSec);
        if(cur){
          panel='<div class="form-head co-sec-head"><button class="form-back" data-coach="sec-close" aria-label="Volver a la ficha">‹</button><div class="form-title">'+cur[1]+'</div></div>'+
            '<div class="co-panel co-sec-body">'+cur[2]()+'</div>';
        } else {
          panel='<div class="ptiles co-ptiles">'+SECS.map(x=>'<button class="ptile" data-coach="sec-open" data-v="'+x[0]+'"><span class="ptile-t">'+x[1]+'</span><span class="ptile-s">'+esc(x[3]())+'</span><span class="ptile-go" aria-hidden="true">›</span></button>').join("")+'</div>'+
            '<button class="logout-btn cfg-danger co-remove-client" data-coach="remove-client">Desvincular alumno</button>';
        }
      }
      body=tabs+panel;
    }
    host.innerHTML='<div class="co-wrap"><div class="co-head"><button class="co-back" data-coach="back">‹ Volver</button><div class="co-head-actions"><button class="co-back" data-coach="refresh" style="margin-right:8px">'+resetSvg+' Actualizar</button><button class="co-gear" data-coach="open-settings" title="Configuración">'+gearSvg+'</button><button class="co-logout" data-auth="logout">Salir</button></div></div><div class="co-client-head">'+avatarHtml(CoachState.coachData&&CoachState.coachData.avatar, coachInitials(CoachState.coachData&&CoachState.coachData.name), 'co-avatar co-avatar-client')+'<div class="co-client-name">'+esc((CoachState.coachData&&CoachState.coachData.name)||"Cliente")+'</div></div>'+body+'</div>';
  }
}
