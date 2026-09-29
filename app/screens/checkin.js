import { clientQuestions } from '../core/questions.js';

import { copySvg, pillSvg, trophySvg } from '../core/icons.js';

import { state } from '../core/state.js';

import { save } from '../core/storage.js';

import { cloudInsertSession, isOnline, newId } from '../core/supabase.js';

import { esc, fmtDate, mondayOf, parseSecs, today } from '../core/utils.js';

import { renderApp } from '../main.js';

import { day, wkElapsedMs, wkStarted } from './entreno.js';

import { detectPRs } from './progreso.js';

export const CheckinState = {

  dailyForm: null,

  checkinOpen: false,

  checkinForm: null,

  fbSession: null,

  fbForm: null,

  newPRs: [],

  summary: null,

};

let _lastSaveTap=0;
// Volumen: kg × reps de todas las series (las de solo peso corporal o por tiempo no suman).
export function sessionVolume(exs){ return (exs||[]).reduce((a,e)=>a+(e.sets||[]).reduce((b,st)=>b+(Number(st.kg)||0)*(Number(st.reps)||0),0),0); }
const durText = s => { const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), ss=s%60; return h ? h+" h "+String(m).padStart(2,"0")+" min" : m ? m+" min"+(m<10&&ss?" "+ss+" s":"") : ss+" s"; };
function renderSummary(){
  const sm=CheckinState.summary; if(!sm) return "";
  const cell=(v,l,big)=>'<div class="sum-cell'+(big?' big':'')+'"><b>'+v+'</b><span>'+l+'</span></div>';
  return '<div class="sum-box"><div class="sum-grid">'+
    (sm.dur>0 ? cell(durText(sm.dur),"Tiempo total",true) : '')+
    cell(sm.sets,"Series")+cell(sm.exs,"Ejercicios")+
    '</div></div>';
}
export function saveSession(){
  const d=day(); const exs=[];
  (d.exercises||[]).forEach(ex=>{
    const sets=(ex.sets||[]).map(s=>{ const o={kg:parseFloat(String(s.kg).replace(",","."))||0, reps:parseInt(s.reps)||0}; const sc=parseSecs(s.secs); if(sc>0) o.secs=Math.min(36000,sc); return o; }).filter((o,i)=>o.reps>0||o.secs>0||(o.kg!==0&&ex.sets[i].done));
    // Una serie con solo el peso (lo completa la app al cargar el primero, o "Usar estos
    // pesos") y sin reps ni tildar no se hizo: no se guarda como serie de 0 reps.
    if(sets.length) exs.push({name:ex.name, sets:sets});
  });
  if(!exs.length){ alert("Cargá kg, reps o segundos en al menos una serie antes de guardar el entreno."); return; }
  // El mismo entreno guardado dos o tres veces seguidas (un tester lo guardó 3 veces en un
  // minuto): varios toques rápidos se ignoran y, si ya se guardó igual hoy, se pregunta.
  if(Date.now()-_lastSaveTap < 1500) return;
  _lastSaveTap=Date.now();
  const sig=JSON.stringify(exs);
  const dup=(state.sessions||[]).slice().reverse().find(s=>s.date===today() && s.day===d.name && JSON.stringify(s.exercises)===sig);
  if(dup){
    const mins=Math.max(1, Math.round((Date.now()-(dup.ts||Date.now()))/60000));
    if(!confirm("Este entreno ya lo guardaste hoy"+(dup.ts?" (hace "+mins+" min)":"")+", con los mismos pesos y repeticiones.\n\n¿Guardarlo otra vez?")) return;
  }
  CheckinState.newPRs=detectPRs(exs, state.sessions); // contra el historial ANTES de sumar esta sesión
  // Resumen: tiempo desde la primera serie tildada, series, volumen y la vez anterior de ese día.
  const dur = wkStarted(d) ? Math.min(43200, Math.round(wkElapsedMs()/1000)) : 0;
  const prev = (state.sessions||[]).slice().reverse().find(x=>x.day===d.name);
  CheckinState.summary = { dur, sets: exs.reduce((a,e)=>a+e.sets.length,0), exs: exs.length };
  const _ns={id:newId(), date:today(), ts:Date.now(), day:d.name, exercises:exs};
  if(dur>0) _ns.dur=dur;
  delete state.wkStart;
  state.sessions.push(_ns);
  save();
  cloudInsertSession(_ns).then(ok=>{
    // Con internet queda en la cola y se reintenta solo; el aviso es solo para sin conexión.
    if(!ok && !isOnline()) alert("Tu entreno se guardó en este dispositivo pero todavía no llegó a tu cuenta (sin conexión). Queda pendiente y se envía solo cuando vuelva internet; tu coach lo ve recién entonces.");
  });
  CheckinState.fbSession=_ns.id; CheckinState.fbForm={};
  renderApp();
}

export function renderFeedback(){
  const host=document.getElementById("fbHost"); if(!host) return;
  if(!CheckinState.fbSession){ host.innerHTML=""; return; }
  const f=CheckinState.fbForm||{};
  const scale=(k,lbl,hint)=>{
    const opts=[1,2,3,4,5].map(n=>'<button class="fb-n'+(String(f[k])===String(n)?' on':'')+'" data-action="fb-set" data-k="'+k+'" data-v="'+n+'">'+n+'</button>').join("");
    return '<div class="fb-row"><div class="fb-lbl">'+lbl+'<span class="fb-hint">'+hint+'</span></div><div class="fb-opts">'+opts+'</div></div>';
  };
  const jp=["No","S\u00ed"].map(v=>'<button class="fb-n wide'+(f.joint===v?' on':'')+'" data-action="fb-set" data-k="joint" data-v="'+v+'">'+v+'</button>').join("");
  const prBanner = (CheckinState.newPRs&&CheckinState.newPRs.length) ? '<div class="pr-box"><div class="pr-title">'+trophySvg+' ¡Nuevo récord!</div>'+CheckinState.newPRs.map(p=>'<div class="pr-line"><span class="pr-ex">'+esc(p.name)+'</span><span class="pr-val">'+p.kg+' kg × '+p.reps+'</span><span class="pr-prev">antes '+p.prev+' kg</span></div>').join("")+'</div>' : '';
  host.innerHTML='<div class="fb-bg"></div><div class="fb-card">'+
    '<div class="fb-title">\u00a1Entreno terminado!</div>'+
    renderSummary()+
    prBanner+
    '<div class="fb-sub">Contale a tu coach c\u00f3mo te fue</div>'+
    scale("rpe","Fatiga percibida","1 = nada \u00b7 5 = al l\u00edmite")+
    scale("pump","Pump de la sesi\u00f3n","1 = nada \u00b7 5 = mucho")+
    '<div class="fb-row"><div class="fb-lbl">Dolor articular<span class="fb-hint">\u00bfMolestia en alguna articulaci\u00f3n?</span></div><div class="fb-opts">'+jp+'</div></div>'+
    '<button class="form-save" style="margin-top:16px" data-action="fb-save">Enviar a mi coach</button>'+
    '<button class="logout-btn" style="margin-top:8px" data-action="fb-skip">Ahora no</button></div>';
}

export function renderInfo(){
  const i=state.info; if(!i) return "";
  const F=[["age","Edad",""],["height_cm","Altura"," cm"],["availability","Disponibilidad",""],["stage","Etapa",""],["commitment","Compromiso",""],["steps_goal","Pasos diarios",""]];
  const chips=F.filter(x=>i[x[0]]).map(x=>'<div class="fi-chip"><span>'+x[1]+'</span><b>'+esc(String(i[x[0]]))+x[2]+'</b></div>').join("");
  const L=[["objective","Objetivo"],["block_goal","Objetivo del bloque"],["structure","Estructura"],["cardio","Cardio"],["injuries","Lesiones o patolog\u00edas"]];
  const lines=L.filter(x=>i[x[0]]).map(x=>'<div class="fi-line"><span>'+x[1]+'</span>'+esc(i[x[0]])+'</div>').join("");
  if(!chips && !lines) return "";
  return '<div class="hb-head"><div class="hb-title">Mi ficha</div><div class="title-accent"></div></div>'+
    '<div class="fi-card">'+(chips?'<div class="fi-chips">'+chips+'</div>':'')+lines+'</div>';
}

// Peso de hoy guardado (Peso corporal / registro): el registro diario de la nube no trae kg,
// así que el campo salía vacío al volver a abrir la app aunque ya estuviera cargado.
export function todayWeightText(){
  const w = (state.weights || []).find(x => x && x.date === today());
  return w && Number(w.kg) > 0 ? String(w.kg).replace(".", ",") : "";
}

export function renderDaily(){
  const d = CheckinState.dailyForm || (state.daily[today()] || {});
  const kgVal = CheckinState.dailyForm && CheckinState.dailyForm.kg != null ? CheckinState.dailyForm.kg : (todayWeightText() || d.kg || "");
  // Preguntas del coach (o las predeterminadas): las de opciones van como botones, las de
  // texto como campo. Peso y pasos quedan fijos arriba: alimentan el gráfico y Hábitos.
  const rows = clientQuestions("daily").map(q=>{
    if(q.type==="options"){
      const opts = q.options.map(o=>'<button class="sc-opt'+(String(d[q.id])===o?' on':'')+'" data-action="daily-set" data-k="'+esc(q.id)+'" data-v="'+esc(o)+'">'+esc(o)+'</button>').join("");
      return '<div class="dq-row"><span class="sc-lbl">'+esc(q.label)+'</span><div class="sc-opts">'+opts+'</div></div>';
    }
    // Texto: se ve entero (baja de línea) y la pregunta con la misma letra que las de opciones.
    const fid = "dq_" + String(q.id).replace(/[^A-Za-z0-9_-]/g, "");
    return '<div class="dq-row"><label class="sc-lbl" for="'+fid+'">'+esc(q.label)+'</label><textarea id="'+fid+'" class="form-input dq-text" rows="2" data-action="daily-text" data-k="'+esc(q.id)+'">'+esc(d[q.id]||"")+'</textarea></div>';
  }).join("");
  return `
    <div class="hb-head"><div class="hb-title">Registro de hoy</div><div class="title-accent"></div></div>
    <div class="daily-card">
      <div class="daily-top">
        <div class="dfield"><label>Peso</label><input id="dKg" class="form-input" type="text" inputmode="decimal" placeholder="kg" value="${esc(kgVal)}" data-action="daily-kg"></div>
        <div class="dfield"><label>Pasos</label><input id="dSteps" class="form-input" type="text" inputmode="numeric" placeholder="0" value="${esc(CheckinState.dailyForm && CheckinState.dailyForm.steps!=null ? CheckinState.dailyForm.steps : (state.steps||""))}" data-action="daily-steps"></div>
      </div>
      ${rows}
      <button class="form-save" style="margin-top:12px" data-action="daily-save">Guardar registro de hoy</button>
    </div>`;
}

export function renderCheckin(){
  const wk = mondayOf(today());
  const saved = state.checkins[wk];
  if(!CheckinState.checkinOpen){
    return `<div class="hb-head" style="margin-top:26px"><div class="hb-title">Check-in semanal</div><div class="title-accent"></div></div>
      <div class="ci-card">
        <div class="ci-status">${saved ? "\u2713 Ya respondiste el check-in de esta semana. Pod\u00e9s editarlo." : "Todav\u00eda no respondiste el check-in de esta semana."}</div>
        <button class="form-save" style="margin-top:10px" data-action="ci-open">${saved ? "Ver / editar mis respuestas" : "Responder el check-in"}</button>
      </div>`;
  }
  const f = CheckinState.checkinForm || (saved ? JSON.parse(JSON.stringify(saved)) : {});
  const qs = clientQuestions("checkin").map(q=>{
    if(q.type==="options"){
      const opts = q.options.map(o=>'<button class="sc-opt'+(String(f[q.id])===o?' on':'')+'" data-action="ci-opt" data-k="'+esc(q.id)+'" data-v="'+esc(o)+'">'+esc(o)+'</button>').join("");
      return '<div class="ci-q"><label>'+esc(q.label)+'</label><div class="sc-opts">'+opts+'</div></div>';
    }
    return '<div class="ci-q"><label>'+esc(q.label)+'</label><textarea class="ci-in" rows="2" data-action="ci-set" data-k="'+esc(q.id)+'">'+esc(f[q.id]||"")+'</textarea></div>';
  }).join("");
  return `<div class="hb-head" style="margin-top:26px"><div class="hb-title">Check-in semanal</div><div class="title-accent"></div></div>
    <div class="ci-card">
      <div class="ci-week">Semana del ${fmtDate(wk)}</div>
      ${qs}
      <button class="form-save" style="margin-top:14px" data-action="ci-save">Enviar check-in a mi coach</button>
      <button class="logout-btn" style="margin-top:8px" data-action="ci-close">Cancelar</button>
    </div>`;
}

// Partes del plan de comidas del coach, para la pantalla «Mi plan» (app/screens/comida.js):
// tablas de días de entreno y de descanso, agua y sal, pautas (pautas, suplementos,
// adicionales, reemplazos) y las opciones de comidas, cada una por separado (plegables).
export function planSections(p){
  if(!p) return null;
  if(!p) return "";
  const meals=(rows,title)=>{
    if(!rows || !rows.length) return "";
    let tk=0,tc=0,tf=0,tp=0;
    const body=rows.map((r,i)=>{ tk+=+r.kcal||0;tc+=+r.cho||0;tf+=+r.fat||0;tp+=+r.prot||0;
      return '<tr class="mc-mrow mr-'+(i%4)+'"><td class="mc-meal">'+esc(r.meal||"")+(r.time?'<span class="mc-time">'+esc(r.time)+'</span>':'')+'</td><td>'+esc(r.kcal||"-")+'</td><td>'+esc(r.cho||"-")+'</td><td>'+esc(r.fat||"-")+'</td><td>'+esc(r.prot||"-")+'</td></tr>'+
        (r.note?'<tr class="mc-noter"><td colspan="5">'+esc(r.note)+'</td></tr>':''); }).join("");
    return '<div class="mc-block"><div class="mc-title">'+title+'</div><table class="mc-tbl"><thead><tr><th>Comida</th><th>Kcal</th><th>Hidr.</th><th>Gras.</th><th>Prot.</th></tr></thead><tbody>'+body+
      '<tr class="mc-tot mc-goal"><td>Objetivo</td><td>'+tk+'</td><td>'+tc+'</td><td>'+tf+'</td><td>'+tp+'</td></tr></tbody></table></div>';
  };
  const list=(arr,title,icon,cls)=>{ if(!arr||!arr.filter(x=>x&&x.trim()).length) return ""; return '<div class="mc-block'+(cls?' '+cls:'')+'"><div class="mc-title'+(cls?' '+cls+'-t':'')+'">'+icon+' '+title+'</div><ul class="mc-list">'+arr.filter(x=>x&&x.trim()).map(x=>'<li>'+esc(x)+'</li>').join("")+'</ul></div>'; };
  const ws=(p.water||p.salt)?'<div class="mc-block"><div class="mc-ws">'+(p.water?'<span>💧 '+esc(p.water)+'</span>':'')+(p.salt?'<span>🧂 '+esc(p.salt)+'</span>':'')+'</div></div>':'';
  const secHasContent = sec => (sec.title&&sec.title.trim()) || (sec.opts&&sec.opts.some(o=>(o.label&&o.label.trim())||(o.body&&o.body.trim()))) || (sec.items&&sec.items.some(i=>i&&i.trim()));
  const validSecs = (p.options||[]).filter(secHasContent);
  const bodyToList = body => { const parts=String(body).split(/\r?\n/).map(x=>x.trim()).filter(Boolean); if(parts.length<=1) return '<div class="mc-optbody">'+esc(body)+'</div>'; return '<ul class="mc-optitems">'+parts.map(x=>'<li>'+esc(x)+'</li>').join("")+'</ul>'; };
  const swaps=(p.swaps&&p.swaps.length)?'<div class="mc-block"><div class="mc-title">🔁 Reemplazos</div>'+p.swaps.filter(s=>s.from||s.to).map(s=>'<div class="mc-swap"><span>'+esc(s.from||"")+'</span><span class="mc-arr">\u2192</span><span>'+esc(s.to||"")+'</span></div>').join("")+'</div>':'';
  const optList = validSecs.map(sec=>{
    let inner;
    if(sec.opts && sec.opts.length){
      inner = sec.opts.filter(o=>(o.label&&o.label.trim())||(o.body&&o.body.trim())).map(o=>'<div class="mc-optrow c-xl">'+(o.label?'<div class="mc-optlabel">'+esc(o.label)+'</div>':'')+(o.body?bodyToList(o.body):'')+'</div>').join("");
    } else {
      inner = '<ul class="mc-optitems">'+(sec.items||[]).filter(i=>i&&i.trim()).map(i=>'<li>'+esc(i)+'</li>').join("")+'</ul>';
    }
    return { title: sec.title||"Opciones", html: inner };
  });
  return {
    train: meals(p.trainDays,"Días de entrenamiento"), rest: meals(p.restDays,"Días de descanso"), ws,
    pautas: list(p.guidelines,"Pautas nutricionales",copySvg,"mc-green")+list(p.supps,"Suplementos recomendados",pillSvg)+list(p.extras,"Adicionales","\u2795")+swaps,
    options: optList
  };
}
