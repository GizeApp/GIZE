import { EX_DB } from '../../core/data.js';

import { auIcoUser, flameSvg, trophySvg } from '../../core/icons.js';

import { State } from '../../core/state.js';

import { migrateNames } from '../../core/storage.js';

import { fetchAll, sessionFromRow, signedUrls } from '../../core/supabase.js';

import { resolveAvatars } from '../../core/avatar.js';

import { loadClientNotify } from './notificar.js';

import { esc, fmtDate, fmtSecs, mondayOf, today } from '../../core/utils.js';

import { dropRoutineDraft, readRoutineDraft, renderCoach } from './index.js';

import { loadTpls } from './rutinas.js';

import { CoachState } from './state.js';

import { loadBilling } from './plan.js';

import { renderWChart } from '../progreso.js';

export async function loadCoachClients(){
  try{
    // Lista de clientes y código de invitación salen juntos.
    const icP=Promise.resolve(State.sb.rpc("my_invite_code")).catch(()=>({data:null}));
    const billP=loadBilling();
    // Supabase no tira excepción cuando una query falla (devuelve {data:null, error}).
    // Si "email" no existe en profiles (o RLS no deja leerla) o todavía no está la
    // columna de la foto (falta supabase/foto-perfil.sql), se reintenta sin esa columna.
    // Ojo con el orden: antes, si fallaba el email, el último intento pedía solo
    // id y nombre y la foto se perdía aunque la columna existiera — el coach veía
    // siempre las iniciales. Ninguna de las dos columnas es crítica para ver la lista.
    const cols=["id, full_name, email, avatar_path","id, full_name, avatar_path","id, full_name, email","id, full_name"];
    let r;
    for(const c of cols){
      r=await State.sb.from("profiles").select(c).eq("coach_id",State.cloudUser.id).order("full_name");
      if(!r.error) break;
      console.error("coachClients ("+c+")",r.error);
    }
    CoachState.coachClients=r.data||[];
    // El mail sale de las cuentas (supabase/mail-clientes.sql): profiles no lo tiene.
    try{
      const em=await State.sb.rpc("my_clients_emails");
      if(!em.error && Array.isArray(em.data)){ const m={}; em.data.forEach(x=>{ if(x.email) m[x.id]=x.email; }); CoachState.coachClients.forEach(c=>{ if(!c.email && m[c.id]) c.email=m[c.id]; }); }
    }catch(e){}
    // Fotos de los clientes y la propia: se piden los links y se redibuja cuando llegan.
    const paths=CoachState.coachClients.map(c=>c.avatar_path).concat([State.cloudProfile&&State.cloudProfile.avatar_path]);
    resolveAvatars(paths).then(ok=>{ if(ok) renderCoach(); }).catch(()=>{});
    const ic=await icP; CoachState.coachInvite=ic.data||null;
    await billP;
  }catch(e){ console.error("coachClients",e); }
  loadCoachStats(); loadTpls();
}

export async function loadCoachStats(){
  if(!State.sb||!State.cloudUser) return;
  try{
    const stats={};
    // Cantidad de entrenos y último entreno de cada cliente, contados en la base
    // (supabase/estadisticas-coach.sql): antes se traían TODAS las sesiones solo para
    // contarlas y, pasadas las 1000, Supabase cortaba el resto sin avisar.
    const rs=await State.sb.rpc("coach_client_stats");
    if(!rs.error && Array.isArray(rs.data)){
      rs.data.forEach(r=>{ stats[r.client_id]={nSess:Number(r.n_sessions)||0, lastSess:r.last_session||null}; });
    } else {
      // La función todavía no existe en la base: la cuenta de siempre, pero paginada.
      // performed_on, no "date" — ver mismo campo usado en openClient() más abajo y en
      // core/supabase.js. Un select a una columna inexistente le pega un 400 a PostgREST,
      // que el catch se traga en silencio: coachClientStats quedaba siempre {} y todos los
      // clientes mostraban "sin entrenos aún" aunque sí hubieran entrenado.
      if(rs.error) console.warn("coach_client_stats no disponible, se cuenta en el celular", rs.error);
      const {data, error}=await fetchAll(()=>State.sb.from("sessions").select("client_id, performed_on").order("performed_on",{ascending:false}).order("id"));
      if(error) console.error("coachStats",error);
      if(!Array.isArray(data)) return;
      data.forEach(r=>{
        if(!stats[r.client_id]) stats[r.client_id]={nSess:0, lastSess:null};
        stats[r.client_id].nSess++;
        if(!stats[r.client_id].lastSess) stats[r.client_id].lastSess=r.performed_on;
      });
    }
    CoachState.coachClientStats=stats; renderCoach();
  }catch(e){ console.error("coachStats",e); }
}

export function coachInitials(name){
  const parts=(name||"").trim().split(/\s+/).filter(Boolean);
  if(!parts.length) return "?";
  const a=parts[0].charAt(0), b=parts.length>1?parts[parts.length-1].charAt(0):"";
  return (a+b).toUpperCase();
}

// Última actividad de un cliente para la lista del coach: solo tenemos la fecha (no hora)
// de la sesión más reciente, así que la etiqueta es "Hoy"/"Ayer"/"N días atrás" sin reloj.
// "Activo" = entrenó en las últimas 48hs (hoy, ayer o antes de ayer).
export function coachActivity(lastSess){
  if(!lastSess) return {label:"Sin entrenos aún", statusLabel:"", active:false, has:false};
  const base=new Date(today()+"T00:00:00");
  const d=new Date(lastSess+"T00:00:00");
  const days=Math.round((base-d)/86400000);
  let label;
  if(days<=0) label="Hoy";
  else if(days===1) label="Ayer";
  else if(days<7) label=days+" días atrás";
  else if(days<14) label="1 semana atrás";
  else if(days<30) label=Math.floor(days/7)+" semanas atrás";
  else label=fmtDate(lastSess);
  const active=days<=2;
  return {label:label, statusLabel:active?"Activo":"Sin actividad", active:active, has:true};
}

export function coachExercises(sessions){ const m={}; (sessions||[]).forEach(se=>se.exercises.forEach(ex=>{ if(ex.name) m[ex.name]=1; })); return Object.keys(m).sort((a,b)=>a.localeCompare(b,"es")); }

export function coachSeries(sessions,name){ const out=[]; (sessions||[]).slice().sort((a,b)=>(a.ts||0)-(b.ts||0)).forEach(se=>{ let mx=null; se.exercises.forEach(ex=>{ if(ex.name===name) ex.sets.forEach(x=>{ const k=+x.kg||0; if(k!==0 && (mx===null || k>mx)) mx=k; }); }); if(mx!==null) out.push({date:se.date, kg:mx}); }); return out; }

export function coachLogFor(sessions, dayName, name){
  const out=[];
  (sessions||[]).slice().sort((a,b)=>(b.ts||0)-(a.ts||0)).forEach(se=>{
    if(dayName && se.day && se.day!==dayName) return;
    const sets=[];
    se.exercises.forEach(ex=>{ if(ex.name===name) ex.sets.forEach(st=>{ if((+st.kg||0)!==0||(+st.reps||0)>0||(+st.secs||0)>0) sets.push({kg:+st.kg||0, reps:+st.reps||0, secs:+st.secs||0}); }); });
    if(sets.length) out.push({date:se.date, ts:se.ts, sets:sets});
  });
  return out;
}

export function coachExerciseLog(sessions,name){ const out=[]; (sessions||[]).slice().sort((a,b)=>(a.ts||0)-(b.ts||0)).forEach(se=>{ const sets=[]; se.exercises.forEach(ex=>{ if(ex.name===name) ex.sets.forEach(st=>{ if((+st.kg||0)!==0||(+st.reps||0)>0||(+st.secs||0)>0) sets.push({kg:+st.kg||0, reps:+st.reps||0, secs:+st.secs||0}); }); }); if(sets.length) out.push({date:se.date, ts:se.ts, sets:sets}); }); return out; }

export async function openClient(id){
  CoachState.coachSel=id; CoachState.coachData={loading:true}; CoachState.coachDailySel=null; CoachState.coachCkSel=null; CoachState.coachSessSel=null; CoachState.coachPhotoSel=null; CoachState.notifDraft=""; CoachState.notifSending=false; CoachState.coachDayFilter=null; CoachState.coachEditDay=0; renderCoach();
  try{
    // Todas las lecturas del cliente salen juntas (antes iban de a una).
    const sb=State.sb;
    const [ws, ss, rt, dl, ck, ci, bl, np, ph, sc] = await Promise.all([
      // Las que crecen con el uso, paginadas (ver fetchAll en core/supabase.js).
      fetchAll(()=>sb.from("body_weights").select("*").eq("client_id",id).order("measured_on")),
      // "*" y no una lista de columnas: trae rpe/pump/joint_pain si existen sin romper la consulta si no.
      fetchAll(()=>sb.from("sessions").select("*, session_entries(exercise_name,set_order,kg,reps,secs)").eq("client_id",id).order("created_at").order("id")),
      sb.rpc("apply_due_routines",{p_client:id}).then(()=>0, ()=>0).then(()=>sb.from("routines").select("days").eq("client_id",id).maybeSingle()),
      fetchAll(()=>sb.from("daily_logs").select("*").eq("client_id",id).order("log_date",{ascending:false})),
      fetchAll(()=>sb.from("checkins").select("*").eq("client_id",id).order("week_start",{ascending:false})),
      sb.from("client_info").select("*").eq("client_id",id).maybeSingle(),
      sb.from("blocks").select("*").eq("client_id",id).eq("active",true).order("start_date",{ascending:false}).limit(1),
      sb.from("nutrition").select("*").eq("client_id",id).maybeSingle(),
      sb.from("checkin_photos").select("*").eq("client_id",id).order("created_at",{ascending:false}),
      // Rutinas programadas que todavía no empezaron (ver supabase/rutina-programada.sql).
      sb.from("routine_schedule").select("id, starts_on, name, days").eq("client_id",id).is("applied_at",null).order("starts_on")
    ]);
    const weights=(ws.data||[]).map(w=>({date:w.measured_on, kg:Number(w.kg)}));
    const sessions=(ss.data||[]).map(sessionFromRow);
    let routine=(rt.data&&Array.isArray(rt.data.days))?JSON.parse(JSON.stringify(rt.data.days)):[];
    migrateNames(routine);
    // Cambios sin guardar de una vez anterior en este dispositivo (ver persistRoutineDraft):
    // si la rutina guardada no cambió desde entonces se recuperan solos; si cambió, se pregunta.
    let routineOrig, restored=false;
    const dr=readRoutineDraft(id), saved=JSON.stringify(routine);
    if(dr && Array.isArray(dr.days) && JSON.stringify(dr.days)!==saved){
      const c0=CoachState.coachClients.find(x=>x.id===id);
      if(dr.base===saved || confirm("Hay cambios en la rutina de "+((c0&&c0.full_name)||"este cliente")+" que no se guardaron, pero la rutina guardada cambió desde entonces. ¿Recuperar tus cambios? (Si cancelás, se descartan.)")){
        routineOrig=saved; routine=dr.days; migrateNames(routine); restored=true;
      } else dropRoutineDraft(id);
    } else if(dr) dropRoutineDraft(id);
    const phRows=ph.data||[];
    const urls=await signedUrls(phRows.map(p=>p.path));
    // Si mientras cargaba el coach abrió otro cliente, esto ya no va: si no, los datos de
    // este quedarían mostrados (y guardados) como si fueran del otro.
    if(CoachState.coachSel!==id) return;
    const photos=phRows.map(p=>({id:p.id, taken_on:p.taken_on, url:urls[p.path]||""}));
    const c=CoachState.coachClients.find(x=>x.id===id);
    CoachState.coachData={id:id, info:(ci.data||{}), block:((bl.data&&bl.data[0])||null), name:(c&&c.full_name)||"Cliente", avatar:(c&&c.avatar_path)||null, weights:weights, sessions:sessions, routine:routine, routineOrig:routineOrig, draftRestored:restored, loadEx:null, daily:(dl.data||[]), checkins:(ck.data||[]), plan:(np.data||null), photos:photos, schedule:(sc&&!sc.error&&sc.data)||[]};
    if(restored) CoachState.coachClientTab="rutina";
    CoachState.coachPlanForm=null; CoachState.coachInfoForm=null; CoachState.coachBlockForm=null; CoachState.coachWeekSel=null;
    // Notificaciones: si el cliente las tiene activadas y los últimos mensajes. Aparte,
    // para no demorar la ficha; se redibuja cuando llega.
    const dRef=CoachState.coachData;
    loadClientNotify(id).then(n=>{ if(CoachState.coachData===dRef){ dRef.notify=n; renderCoach(); } }).catch(()=>{});
    // La foto casi siempre ya tiene link desde la lista; si venció o todavía no llegó, se pide y se redibuja.
    if(CoachState.coachData.avatar) resolveAvatars([CoachState.coachData.avatar]).then(ok=>{ if(ok&&CoachState.coachSel===id) renderCoach(); }).catch(()=>{});
    CoachState.coachExpandedEx=new Set(); CoachState.coachExMenu=null; CoachState.coachPlanRestOpen=null;
  }catch(e){ if(CoachState.coachSel!==id) return; CoachState.coachData={error:true}; console.error("openClient",e); }
  renderCoach();
}

export function coachDatalist(){
  if(CoachState.coachDL) return CoachState.coachDL;
  const all=[]; try{ Object.keys(EX_DB).forEach(k=>EX_DB[k].forEach(n=>all.push(n))); }catch(e){}
  const uniq=all.filter((v,i)=>all.indexOf(v)===i).sort((a,b)=>a.localeCompare(b,"es"));
  CoachState.coachDL='<datalist id="exList">'+uniq.map(n=>'<option value="'+esc(n)+'">').join("")+'</datalist>';
  return CoachState.coachDL;
}

export function renderCoachCargas(d){
  const routine=d.routine||[];
  const dayNames=routine.map(x=>x.name);
  const dayOpts='<option value="">Todos los días</option>'+dayNames.map(n=>'<option value="'+esc(n)+'"'+(CoachState.coachDayFilter===n?' selected':'')+'>'+esc(n)+'</option>').join("");
  let exNames;
  if(CoachState.coachDayFilter){ const rd=routine.find(x=>x.name===CoachState.coachDayFilter); exNames=rd?(rd.exercises||[]).map(ex=>ex.name):[]; }
  else { exNames=coachExercises(d.sessions); }
  exNames=exNames.filter((v,i)=>v&&exNames.indexOf(v)===i);
  const fsess=CoachState.coachDayFilter?d.sessions.filter(se=>se.day===CoachState.coachDayFilter):d.sessions;
  let out='<div class="co-sec">Evolución de cargas</div><select class="form-input" data-coach="dayfilter" style="margin-bottom:8px">'+dayOpts+'</select>';
  if(!exNames.length){ return out+'<div class="cal-hint">Sin ejercicios para mostrar'+(CoachState.coachDayFilter?' en este día':'')+'.</div>'; }
  if(!d.loadEx||exNames.indexOf(d.loadEx)<0) d.loadEx=exNames[0];
  const exOpts=exNames.map(n=>'<option value="'+esc(n)+'"'+(n===d.loadEx?' selected':'')+'>'+esc(n)+'</option>').join("");
  const series=coachSeries(fsess,d.loadEx);
  const cch=series.length?renderWChart(series,true,true):'<div class="cal-hint">Sin kg registrados en este ejercicio'+(CoachState.coachDayFilter?' para este día':'')+'.</div>';
  const flog=coachExerciseLog(fsess,d.loadEx);
  const fkg=k=>(Math.round((+k||0)*10)/10);
  const detail=flog.slice().reverse().map(e=>{ const chips=e.sets.map((st,ix)=>{ const kg=+st.kg||0, rp=+st.reps||0, sc=+st.secs||0; const val=sc>0?((kg!==0?fkg(kg)+' kg \u00b7 ':'')+fmtSecs(sc)):kg!==0?(fkg(kg)+' kg'+(rp>0?' \u00d7 '+rp+' reps':'')):(rp>0?rp+' reps':'\u2014'); return '<div class="co-setline"><span class="co-setno">Serie '+(ix+1)+'</span><span class="co-setval">'+val+'</span></div>'; }).join(""); return '<div class="co-slog"><div class="co-slog-date">'+fmtDate(e.date)+'</div><div class="co-sets">'+chips+'</div></div>'; }).join("");
  out+='<select class="form-input" data-coach="ex">'+exOpts+'</select><div class="load-cap">Gráfico: máximo de kg por sesión</div>'+cch+(detail?'<div class="co-sub">Registro por sesión (peso \u00d7 reps de cada serie)</div>'+detail:'');
  return out;
}

export function exChart(d, dayName, exName){
  const log=coachLogFor(d.sessions, dayName, exName);
  const asc=log.slice().reverse();
  // Máximo de cada día sin contar series sin peso (en los asistidos, el peso es negativo).
  const series=asc.map(e=>{ const ks=e.sets.map(x=>x.kg||0).filter(k=>k!==0); return {date:e.date, kg:ks.length?Math.max.apply(null,ks):0}; }).filter(x=>x.kg!==0);
  if(!series.length) return '<div class="co-noprog">Sin registros</div>';
  return renderWChart(series,true,"mini");
}

export function exTable(d, dayName, exName){
  const log=coachLogFor(d.sessions, dayName, exName);
  if(!log.length) return "";
  let maxS=1; log.forEach(e=>{ if(e.sets.length>maxS) maxS=e.sets.length; });
  const th=['<th>Fecha</th>']; for(let i=0;i<maxS;i++) th.push('<th>Serie '+(i+1)+'</th>'); th.push('<th class="mx">M\u00e1x</th>');
  const rows=log.slice(0,8).map(e=>{
    const tds=['<td class="dt">'+fmtDate(e.date)+'</td>'];
    for(let i=0;i<maxS;i++){
      const st=e.sets[i];
      if(!st) tds.push('<td class="em">\u2014</td>');
      else { const kg=+st.kg||0, rp=+st.reps||0, sc=+st.secs||0; if(sc>0) tds.push('<td>'+(kg!==0?(Math.round(kg*10)/10)+' kg \u00b7 ':'')+fmtSecs(sc)+'</td>'); else tds.push('<td>'+(kg!==0?(Math.round(kg*10)/10)+' kg':'\u2014')+(rp>0?' <span class="rp">\u00d7 '+rp+'</span>':'')+'</td>'); }
    }
    const mx=Math.max.apply(null,e.sets.map(x=>x.kg||0)), mxs=Math.max.apply(null,e.sets.map(x=>x.secs||0));
    tds.push('<td class="mx">'+(mx>0?(Math.round(mx*10)/10)+' kg':mxs>0?fmtSecs(mxs):'\u2014')+'</td>');
    return '<tr>'+tds.join("")+'</tr>';
  }).join("");
  return '<table class="co-tbl"><thead><tr>'+th.join("")+'</tr></thead><tbody>'+rows+'</tbody></table>';
}

// Resumen de una línea para el toggle "Ver progreso" de la card de ejercicio colapsable
// (ej. "2 sep: 80 kg × 8") — coachLogFor ya viene ordenado del más reciente al más viejo.
export function exSummary(d, dayName, exName){
  const log=coachLogFor(d.sessions, dayName, exName);
  if(!log.length) return "";
  const last=log[0];
  let best=null;
  last.sets.forEach(st=>{ if(!best || (st.kg||0)!==0 && ((best.kg||0)===0 || st.kg>=best.kg)) best=st; });
  if(!best) return "";
  const mxs=Math.max.apply(null,last.sets.map(x=>x.secs||0));
  if(mxs>0 && !(best.kg)) return fmtDate(last.date)+": máx "+fmtSecs(mxs);
  const kg=Math.round((best.kg||0)*10)/10;
  const parts=[]; if(kg!==0) parts.push(kg+" kg"); if((best.reps||0)>0) parts.push(best.reps+" reps");
  if(!parts.length) return "";
  return fmtDate(last.date)+": "+parts.join(" × ");
}

export function weeklyAvg(weights){
  const wk={};
  (weights||[]).forEach(w=>{ const k=mondayOf(w.date); (wk[k]=wk[k]||[]).push(w.kg); });
  return Object.keys(wk).sort().map(k=>({date:k, kg: wk[k].reduce((a,b)=>a+b,0)/wk[k].length, n:wk[k].length}));
}

const CI_AVAILABILITY=["2 d\u00edas / semana","3 d\u00edas / semana","4 d\u00edas / semana","5 d\u00edas / semana","6 d\u00edas / semana"];
const CI_STAGE=["Volumen","D\u00e9ficit","Mantenimiento","Recomposici\u00f3n","Definici\u00f3n"];
const CI_COMMITMENT=["Bajo","Medio","Alto"];
// Compromiso = estado, así que va con los semánticos de la marca.
const CI_COMMIT_COLOR={Bajo:"var(--gize-warning)", Medio:"var(--gize-blue)", Alto:"var(--gize-success)"};

export function renderCoachInfo(d){
  const i = CoachState.coachInfoForm || d.info || {};
  const F=(k,lbl,ph,type)=>'<div class="ci-f"><label>'+lbl+'</label><input class="co-note" data-coach="info-'+k+'" value="'+esc(i[k]==null?"":String(i[k]))+'" placeholder="'+ph+'"'+(type?' inputmode="'+type+'"':'')+'></div>';
  const S=(k,lbl,opts)=>{
    const val=i[k]==null?"":String(i[k]);
    const color=(k==="commitment"&&CI_COMMIT_COLOR[val])?' style="color:'+CI_COMMIT_COLOR[val]+'"':'';
    const extra=(val && opts.indexOf(val)<0) ? '<option value="'+esc(val)+'" selected>'+esc(val)+'</option>' : '';
    const optsHtml=opts.map(o=>'<option value="'+esc(o)+'"'+(val===o?' selected':'')+'>'+esc(o)+'</option>').join("");
    return '<div class="ci-f"><label>'+lbl+'</label><select class="co-note co-select" data-coach="info-'+k+'"'+color+'>'+(val?'':'<option value="">\u2014</option>')+extra+optsHtml+'</select></div>';
  };
  const card=(icon,title,body)=>'<div class="ci-card"><div class="ci-card-head">'+icon+'<span>'+title+'</span></div>'+body+'</div>';
  return card(auIcoUser,"Datos personales",
      '<div class="ci-grid-4">'+
        F("age","Edad","","numeric")+F("height_cm","Altura (cm)","","numeric")+
        F("steps_goal","Pasos diarios","","numeric")+F("injuries","Lesiones o patolog\u00edas","")+
      '</div>')+
    card(flameSvg,"Contexto de entrenamiento",
      '<div class="ci-grid-3">'+
        S("availability","Disponibilidad",CI_AVAILABILITY)+S("stage","Etapa",CI_STAGE)+S("commitment","Compromiso",CI_COMMITMENT)+
      '</div>')+
    card(trophySvg,"Objetivos",
      '<div class="ci-grid-2">'+
        F("objective","Objetivo general","")+F("block_goal","Objetivo del bloque actual","")+
      '</div>'+
      '<div class="ci-grid-2" style="margin-top:14px">'+
        F("structure","Estructura","")+F("cardio","Cardio","")+
      '</div>')+
    '<button class="co-save-rt" data-coach="info-save">Guardar ficha del cliente</button>';
}
