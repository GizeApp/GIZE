import { pencilSvg, xSvg } from '../core/icons.js';

import { State, state } from '../core/state.js';

import { dec, esc, exKey, exMuscle, fmtDate, fmtSecs, mondayOf, num, setText, today } from '../core/utils.js';

import { kgText } from '../core/progresion.js';

import { checkinSummary, renderCheckin, renderDaily, renderInfo } from './checkin.js';

import { EntrenoState } from './entreno.js';

import { renderSessionItem } from '../ui/sessiondetail.js';

import { SUB_LABELS, volumeGroups } from '../core/subgrupos.js';

export const ProgresoState = {

  // at: el día en que se armó el formulario. Si la app queda abierta de un día para otro, al
  // volver a dibujarlo se arranca de nuevo con la fecha de hoy (ver renderPeso).
  weightForm: {date: today(), kg: "", at: today()},

  section: null,   // sección abierta (null: el menú de secciones)

  wAll: false,     // historial de peso completo (si no, los últimos 5)

  sessSel: null,   // entreno elegido en «Historial de entrenos» (null: el último)

};

export function renderWChart(ws, evenX, sz){
  const S = sz==="mini" ? {W:320,H:130,pl:36,pr:10,pt:12,pb:22,FS:9,DR:3.5,DR2:2.5,SW:2}
          : sz==="med"  ? {W:560,H:210,pl:46,pr:14,pt:16,pb:26,FS:11,DR:5,DR2:3.5,SW:2.5}
          : {W:340,H:180,pl:40,pr:14,pt:16,pb:24,FS:9,DR:4,DR2:3,SW:2.5};
  const W=S.W,H=S.H,pl=S.pl,pr=S.pr,pt=S.pt,pb=S.pb, plotW=W-pl-pr, plotH=H-pt-pb;
  const FS=S.FS, DR=S.DR, DR2=S.DR2, SW=S.SW;
  const times=ws.map(e=>new Date(e.date+"T00:00:00").getTime());
  const kgs=ws.map(e=>e.kg);
  let minK=Math.min.apply(null,kgs), maxK=Math.max.apply(null,kgs);
  if(maxK-minK < 0.0001){ minK-=0.5; maxK+=0.5; }
  const NICE=[0.2,0.25,0.5,1,1.25,1.5,2,2.5,5,10,20,25,50,100,200,250,500];
  let stepK=NICE[NICE.length-1];
  const TGT = (sz==="mini") ? 2.5 : 4;
  for(let i=0;i<NICE.length;i++){ if((maxK-minK)/NICE[i] <= TGT){ stepK=NICE[i]; break; } }
  let loK=Math.floor(minK/stepK)*stepK; if(minK-loK < stepK*0.2) loK-=stepK;
  let hiK=Math.ceil(maxK/stepK)*stepK; if(hiK-maxK < stepK*0.2) hiK+=stepK;
  const decK=(String(stepK).split(".")[1]||"").length;
  const nTicks=Math.round((hiK-loK)/stepK);
  const minT=Math.min.apply(null,times), maxT=Math.max.apply(null,times), tRange=maxT-minT;
  const useEven = evenX || !tRange;
  const X=(t,i)=> ws.length<2 ? pl+plotW/2 : (useEven ? pl+(i/(ws.length-1))*plotW : pl+((t-minT)/tRange)*plotW);
  const Y=k=> pt+(1-(k-loK)/(hiK-loK))*plotH;
  const pts=ws.map((e,i)=>({x:X(times[i],i),y:Y(e.kg)}));
  const line=pts.map((p,i)=>(i?"L":"M")+p.x.toFixed(1)+" "+p.y.toFixed(1)).join(" ");
  const baseY=(pt+plotH).toFixed(1);
  const area=pts.length>1 ? "M"+pts[0].x.toFixed(1)+" "+baseY+" "+pts.map(p=>"L"+p.x.toFixed(1)+" "+p.y.toFixed(1)).join(" ")+" L"+pts[pts.length-1].x.toFixed(1)+" "+baseY+" Z" : "";
  const yVals=[]; for(let i=0;i<=nTicks;i++) yVals.push(loK+i*stepK);
  const grid=yVals.map(v=>{const y=Y(v).toFixed(1);return '<line x1="'+pl+'" y1="'+y+'" x2="'+(W-pr)+'" y2="'+y+'" style="stroke:var(--gize-border)" stroke-width="1"/><text x="'+(pl-8)+'" y="'+(parseFloat(y)+FS/3).toFixed(1)+'" style="fill:var(--gize-text-2)" font-size="'+FS+'" text-anchor="end">'+dec(v,decK)+'</text>';}).join("");
  const dots=pts.map((p,i)=>'<circle cx="'+p.x.toFixed(1)+'" cy="'+p.y.toFixed(1)+'" r="'+(i===pts.length-1?DR:DR2)+'" style="fill:'+(i===pts.length-1?'var(--gize-blue)':'var(--gize-text-2)')+'"/>').join("");
  const xl='<text x="'+pl+'" y="'+(H-6)+'" style="fill:var(--gize-text-2)" font-size="'+FS+'" text-anchor="start">'+fmtDate(ws[0].date)+'</text>'+(ws.length>1?'<text x="'+(W-pr)+'" y="'+(H-6)+'" style="fill:var(--gize-text-2)" font-size="'+FS+'" text-anchor="end">'+fmtDate(ws[ws.length-1].date)+'</text>':'');
  return '<div class="w-chart"><svg viewBox="0 0 '+W+' '+H+'" width="100%"><defs><linearGradient id="wg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--gize-blue)"/><stop offset="1" style="stop-color:var(--gize-blue);stop-opacity:0"/></linearGradient></defs>'+grid+(area?'<path d="'+area+'" fill="url(#wg)" opacity="0.3"/>':'')+(pts.length>1?'<path d="'+line+'" fill="none" style="stroke:var(--gize-blue)" stroke-width="'+SW+'" stroke-linecap="round" stroke-linejoin="round"/>':'')+dots+xl+'</svg></div>';
}

export function renderVolumen(daysArg){
  const labels={pecho:"Pecho",espalda:"Espalda",hombros:"Hombros",biceps:"Bíceps",triceps:"Tríceps",cuadriceps:"Cuádriceps",isquios:"Isquios",gluteos:"Glúteos",aductores:"Aductores",gemelos:"Gemelos",abs:"Abdominales",antebrazo:"Antebrazo",cuello:"Cuello",otros:"Otros"};
  const tally={};
  ((daysArg||state.days)||[]).forEach(d=>{ (d.exercises||[]).forEach(ex=>{ const sets=(ex.sets||[]).length; volumeGroups(ex).forEach(m=>{ tally[m]=(tally[m]||0)+sets; }); }); });
  const rows=Object.keys(tally).filter(k=>tally[k]>0).map(k=>({label:SUB_LABELS[k]||labels[k]||k,sets:tally[k]})).sort((a,b)=>b.sets-a.sets);
  if(!rows.length) return "";
  // El total cuenta cada serie una vez (como la tarjeta de Progreso y la del coach): las
  // barras pueden sumar la misma serie a dos grupos (hiperextensiones: espalda baja e isquios).
  let total=0; ((daysArg||state.days)||[]).forEach(d=>(d.exercises||[]).forEach(ex=>{ total+=(ex.sets||[]).length; }));
  const max=rows[0].sets;
  const bars=rows.map(r=>`<div class="vol-row"><div class="vol-lbl">${esc(r.label)}</div><div class="vol-bar"><div class="vol-fill" style="width:${Math.round(r.sets/max*100)}%"></div></div><div class="vol-n">${r.sets}</div></div>`).join("");
  return `
    <div class="hb-head" style="margin-top:28px"><div class="hb-title">Volumen semanal</div><div class="title-accent"></div></div>
    <div class="vol-sub">${total} series por semana · ${rows.length} grupos musculares</div>
    <div class="vol-card">${bars}</div>`;
}

export function exercisesInHistory(){
  const m={}; (state.sessions||[]).forEach(se=>(se.exercises||[]).forEach(ex=>{ if(ex.name) m[ex.name]=1; }));
  return Object.keys(m).sort((a,b)=>a.localeCompare(b,"es"));
}

export function loadSeriesFor(name){
  const out=[];
  (state.sessions||[]).slice().sort((a,b)=>(a.ts||0)-(b.ts||0)).forEach(se=>{
    // Con kg negativos (asistidos: -25 = 25 kg de ayuda) el mejor es el de menos ayuda.
    let mx=null; (se.exercises||[]).forEach(ex=>{ if(ex.name===name) (ex.sets||[]).forEach(s=>{ const k=+s.kg||0; if(k!==0 && (mx===null || k>mx)) mx=k; }); });
    if(mx!==null) out.push({date:se.date, kg:mx});
  });
  return out;
}

export function renderCargas(){
  const exs=exercisesInHistory();
  if(!exs.length) return "";
  if(!EntrenoState.loadEx || exs.indexOf(EntrenoState.loadEx)<0) EntrenoState.loadEx=exs[0];
  const series=loadSeriesFor(EntrenoState.loadEx);
  const opts=exs.map(n=>'<option value="'+esc(n)+'"'+(n===EntrenoState.loadEx?' selected':'')+'>'+esc(n)+'</option>').join("");
  const chart=series.length?renderWChart(series,true):'<div class="cal-hint">Sin kg registrados para este ejercicio.</div>';
  // tabla de historial detallado del ejercicio
  const allSess=(state.sessions||[]).filter(se=>(se.exercises||[]).some(e=>e.name===EntrenoState.loadEx))
    .sort((a,b)=>(b.ts||0)-(a.ts||0)).slice(0,16);
  const histRows=allSess.map(se=>{
    const ex=se.exercises.find(e=>e.name===EntrenoState.loadEx);
    const sets=(ex.sets||[]).filter(s=>+s.kg||+s.reps||+s.secs);
    const setsHtml=sets.map((s,i)=>(+s.secs>0)
      ? '<div class="hx-set"><span class="hx-n">S'+(i+1)+'</span><span class="hx-reps">'+esc(setText(s))+'</span></div>'
      : '<div class="hx-set"><span class="hx-n">S'+(i+1)+'</span><span class="hx-kg">'+kgText(num(s.kg))+' kg</span><span class="hx-x">×</span><span class="hx-reps">'+(s.reps||0)+'</span></div>').join("");
    const best=sets.reduce((m,s)=>{ const k=+s.kg||0; return k!==0 && (m===null || k>m) ? k : m; },null);
    const bestSecs=sets.reduce((m,s)=>Math.max(m,+s.secs||0),0);
    const bestStr=best!==null ? 'máx '+kgText(best)+' kg' : (bestSecs>0 ? 'máx '+fmtSecs(bestSecs) : 'máx 0 kg');
    return '<div class="hx-row"><div class="hx-meta"><span class="hx-date">'+fmtDate(se.date)+'</span><span class="hx-best">'+bestStr+'</span></div><div class="hx-sets">'+setsHtml+'</div></div>';
  }).join("");
  const histBlock=allSess.length ? '<div class="hx-wrap">'+histRows+'</div>' : '<div class="cal-hint">Sin historial para este ejercicio.</div>';
  return '<div class="hb-head" style="margin-top:28px"><div class="hb-title">Evolución de cargas</div><div class="title-accent"></div></div>'+
    '<select class="form-input load-sel" data-action="load-ex">'+opts+'</select>'+
    '<div class="load-cap">Máximo de kg levantado por sesión</div>'+chart+
    '<div class="load-cap" style="margin-top:18px">Historial detallado</div>'+histBlock;
}

// Como en el panel del coach: una lista desplegable para elegir el entreno y abajo ese entreno
// abierto, comparado con la vez anterior. Arranca en el último.
export function renderHistorial(){
  const sess=(state.sessions||[]).slice().sort((a,b)=>(b.ts||0)-(a.ts||0));
  if(!sess.length) return "";
  const key=se=>String(se.id||se.ts||se.date);
  const one=sess.find(se=>key(se)===ProgresoState.sessSel) || sess[0];
  const opts=sess.map(se=>{ const n=(se.exercises||[]).reduce((t,e)=>t+(e.sets||[]).length,0);
    return '<option value="'+esc(key(se))+'"'+(se===one?' selected':'')+'>'+esc(fmtDate(se.date)+' · '+(se.day||'Entreno')+' ('+n+(n===1?' serie)':' series)'))+'</option>'; }).join("");
  const pick='<label class="co-pick sess-pick"><span>Entreno</span><select class="co-select" data-action="sess-pick" aria-label="Elegir entreno">'+opts+'</select></label>';
  const item=renderSessionItem(one, { open:true, history:state.sessions,
    removeBtn:'<div class="sess-acts"><button class="diary-rm sess-edit" data-action="session-edit" data-id="'+esc(one.id)+'" title="Editar entreno" aria-label="Editar entreno">'+pencilSvg+'</button>'+
      '<button class="diary-rm" data-action="session-remove" data-id="'+esc(one.id)+'" title="Borrar entreno" aria-label="Borrar entreno">'+xSvg+'</button></div>' });
  return '<div class="hb-head" style="margin-top:28px"><div class="hb-title">Historial de entrenos</div><div class="title-accent"></div></div>'+
    '<div class="sess-hint">Elegí un entreno para ver los pesos y las series ('+sess.length+' en total).</div>'+pick+item;
}

// occ: si el día tiene el mismo ejercicio más de una vez, cuál es (0 = el primero): el segundo
// va con el segundo de la vez pasada (si esa vez hubo menos, con el último).
// El nombre se compara con exKey (utils): un entreno guardado con el nombre viejo de un
// ejercicio renombrado, o con otra mayúscula o un espacio de más, sigue contando como la vez pasada.
export function lastSessionFor(exName, occ){
  const key=exKey(exName), isIt=e=>e && exKey(e.name)===key && (e.sets||[]).length;
  const list=(state.sessions||[]).filter(se=>(se.exercises||[]).some(isIt));
  if(!list.length) return null;
  list.sort((a,b)=>(b.ts||0)-(a.ts||0));
  const se=list[0];
  const same=se.exercises.filter(isIt);
  const ex=same[Math.min(Math.max(0, occ||0), same.length-1)];
  return { date:se.date, sets:ex.sets };
}
// Cuál de los ejercicios del día con ese nombre es ex (para lastSessionFor). Se cuenta con la
// misma clave (exKey) que usa la búsqueda: si no, «Jalón» y «Jalon» en el mismo día quedan los dos
// como el primero y el segundo agarra los pesos del primero.
export function exOccurrence(exs, ex){ const k=exKey(ex.name); return Math.max(0, (exs||[]).filter(x=>x && exKey(x.name)===k).indexOf(ex)); }

// Lo de la vez pasada para cada serie de hoy, por orden ({kg, reps} en números). Si hoy hay
// más series que la vez pasada, las de más toman la última. Con num(), como el resto del
// historial: un peso guardado como texto con coma ("62,5") con +p.kg daba 0 y no había botón.
export function lastPlan(ex, prevSets){
  const ps=(prevSets||[]).filter(Boolean); if(!ps.length || !ex) return [];
  return (ex.sets||[]).map((s,i)=>{ const p=ps[Math.min(i, ps.length-1)]; return { kg:num(p.kg), reps:parseInt(p.reps)||0 }; });
}
const kgNum = v => parseFloat(String(v==null?"":v).replace(",", "."))||0;
// ¿El botón "Usar estos pesos" cambiaría algo? (solo series sin tildar con peso distinto)
export function lastKgsUseful(ex, plan){
  return (ex.sets||[]).some((s,i)=>!s.done && plan[i] && plan[i].kg!==0 && kgNum(s.kg)!==plan[i].kg);
}

// «La vez pasada» arriba de las series. Con el ejercicio de hoy (ex), un botón para cargar
// esos pesos en las series que faltan: está si la vez pasada hubo peso y se oculta mientras
// no cambiaría nada (se vuelve a mirar al escribir un peso, ver el input "kg" en main.js).
export function renderLastSession(exName, ex, occ){
  const prev=lastSessionFor(exName, occ);
  if(!prev) return "";
  const sets=prev.sets.map((s,i)=>(+s.secs>0) ? '<span class="ls-set"><b>'+esc(setText(s))+'</b></span>' : '<span class="ls-set"><b>'+kgText(num(s.kg))+'</b>kg × <b>'+(s.reps||0)+'</b></span>').join('<span class="ls-sep">·</span>');
  const plan = ex ? lastPlan(ex, prev.sets) : [];
  const use = ex && (ex.sets||[]).some((s,i)=>!s.done && plan[i] && plan[i].kg!==0)
    ? '<button class="ls-use" data-action="last-use" data-ex="'+esc(ex.id)+'"'+(lastKgsUseful(ex, plan)?'':' hidden')+'>Usar estos pesos</button>' : '';
  return '<div class="last-sess"><div class="ls-head"><span class="ls-lbl">La vez pasada ('+fmtDate(prev.date)+')</span>'+use+'</div><div class="ls-sets">'+sets+'</div></div>';
}

export function bestKgBefore(exName, priorSessions){
  let best=null;
  (priorSessions||[]).forEach(se=>{
    (se.exercises||[]).forEach(ex=>{
      if(ex.name!==exName) return;
      (ex.sets||[]).forEach(s=>{
        const kg=num(s.kg);
        if(kg!==0 && (best===null || kg>best)) best=kg; // negativo: asistido
      });
    });
  });
  return best;
}

export function bestSetOf(sets){
  let best=null;
  (sets||[]).forEach(s=>{
    const kg=num(s.kg);
    if(kg!==0 && (!best || kg>num(best.kg))) best=s;
  });
  return best;
}

export function detectPRs(newExercises, priorSessions){
  const prs=[];
  (newExercises||[]).forEach(ex=>{
    const bestSet=bestSetOf(ex.sets);
    if(!bestSet) return;
    const prev=bestKgBefore(ex.name, priorSessions);
    if(prev===null) return;
    if(bestSet.kg>prev) prs.push({name:ex.name, kg:bestSet.kg, reps:bestSet.reps, prev:prev});
  });
  return prs;
}

export function allSetsDone(ex){ return (ex.sets||[]).length>0 && ex.sets.every(s=>s.done); }

// Progreso: un menú de secciones (como «Mi plan» en Comida). Cada tarjeta muestra un
// resumen y abre su propia pantalla, así la página no se hace eterna.
const SECTIONS = [
  ["peso", "Peso corporal"], ["registro", "Registro de hoy"], ["checkin", "Check-in semanal"],
  ["historial", "Historial de entrenos"], ["cargas", "Evolución de cargas"], ["volumen", "Volumen semanal"], ["ficha", "Mi ficha"],
];
const sortedWeights = () => (state.weights||[]).slice().sort((a,b)=>a.date<b.date?-1:(a.date>b.date?1:0));

function renderPeso(){
  if(ProgresoState.weightForm.at!==today()) ProgresoState.weightForm={date:today(), kg:"", at:today()};
  const ws=sortedWeights();
  const latest=ws.length?ws[ws.length-1]:null, prev=ws.length>1?ws[ws.length-2]:null;
  let header;
  if(latest){
    let dh="";
    if(prev){ const d=latest.kg-prev.kg; const z=Math.abs(d)<0.05; dh=z?'<span class="w-delta">sin cambios</span>':'<span class="w-delta">'+(d>0?'▲ +':'▼ ')+dec(Math.abs(d))+' kg</span>'; }
    header=`<div class="w-current"><div class="w-now">${dec(latest.kg)} <small>kg</small></div><div class="w-meta">Último registro · ${fmtDate(latest.date)} ${dh}</div></div>`;
  } else {
    header=`<div class="cal-hint" style="padding:20px 8px">Todavía no cargaste tu peso. Empezá registrando el de hoy acá abajo.</div>`;
  }
  const chart=ws.length?renderWChart(ws):"";
  // El historial muestra los últimos 5; el resto, con «Ver todo».
  const rev=ws.slice().reverse(), shown=ProgresoState.wAll?rev:rev.slice(0,5);
  const list=shown.map(e=>`<div class="w-item" data-action="weight-edit" data-id="${esc(e.id)}"><div class="w-date">${fmtDate(e.date)}</div><div class="w-kg">${dec(e.kg)} kg</div><button class="diary-rm" data-action="weight-remove" data-id="${esc(e.id)}" title="Borrar">${xSvg}</button></div>`).join("");
  const more=rev.length>5 ? `<button class="w-more" data-action="w-all">${ProgresoState.wAll?'Ver menos':'Ver todo el historial ('+rev.length+')'}</button>` : '';
  return `${header}
    ${chart}
    <div class="w-form">
      <input id="wDate" class="form-input" type="date" value="${ProgresoState.weightForm.date}" data-action="wdate-field">
      <input id="wKg" class="form-input" type="text" inputmode="decimal" placeholder="kg" value="${esc(ProgresoState.weightForm.kg)}" data-action="wkg-field">
      <button class="form-save" style="width:auto;padding:0 18px;margin-top:0" data-action="weight-save">Guardar</button>
    </div>
    ${list?`<div class="w-list-head">Historial de peso</div>${list}${more}`:""}`;
}

function sectionBody(id){
  const empty = t => `<div class="cal-hint" style="padding:20px 8px">${t}</div>`;
  if(id==="peso") return renderPeso();
  if(id==="registro") return renderDaily();
  if(id==="checkin") return renderCheckin();
  if(id==="historial") return renderHistorial() || empty("Todavía no guardaste entrenos. Al terminar uno, tocá «Guardar entreno de hoy» en Entreno.");
  if(id==="cargas") return renderCargas() || empty("Cuando guardes entrenos con kg, acá vas a ver cómo suben tus cargas en cada ejercicio.");
  if(id==="volumen") return renderVolumen() || empty("Armá tu rutina en Entreno y acá vas a ver cuántas series hacés por grupo muscular.");
  if(id==="ficha") return renderInfo() || empty("Tu coach todavía no completó tu ficha.");
  return "";
}

// ¿Cargó hoy el registro? La app sube sola una fila del día (agua, pasos, hábitos) y al
// volver a abrirla aparecía como registro con todo vacío: cuenta solo si tiene alguna
// respuesta (los pasos no, los suma solo el contador) o el peso de hoy.
function dailyDone(){
  const r=(state.daily||{})[today()];
  if(r && Object.keys(r).some(k=>k!=="steps" && k!=="_q" && r[k]!=null && String(r[k]).trim()!=="")) return true;
  return (state.weights||[]).some(w=>w && w.date===today() && Number(w.kg)>0);
}

// Resumen de cada tarjeta del menú: [texto, pendiente?]
function sectionSummary(id){
  if(id==="peso"){ const ws=sortedWeights(); if(!ws.length) return ["Sin registros", true]; const l=ws[ws.length-1], p=ws.length>1?ws[ws.length-2]:null; const d=p?l.kg-p.kg:0; return [l.kg.toFixed(1).replace(".",",")+" kg"+(p&&Math.abs(d)>=0.05?(d>0?" · ▲ ":" · ▼ ")+Math.abs(d).toFixed(1).replace(".",","):""), false]; }
  if(id==="registro") return dailyDone() ? ["Cargado hoy ✓", false] : ["Pendiente de hoy", true];
  if(id==="checkin") return checkinSummary();
  if(id==="historial"){ const n=(state.sessions||[]).length; if(!n) return ["Sin entrenos todavía", false]; const last=(state.sessions||[]).slice().sort((a,b)=>(b.ts||0)-(a.ts||0))[0]; return [n+" entreno"+(n===1?"":"s")+" · último "+fmtDate(last.date), false]; }
  if(id==="cargas"){ const n=exercisesInHistory().length; return [n?n+" ejercicio"+(n===1?"":"s"):"Sin datos todavía", false]; }
  if(id==="volumen"){ let t=0; (state.days||[]).forEach(d=>(d.exercises||[]).forEach(ex=>{ t+=(ex.sets||[]).length; })); return [t?t+" series por semana":"Sin rutina", false]; }
  if(id==="ficha") return [state.info?"Tus datos y objetivos":"Sin completar", false];
  return ["", false];
}

export function renderProgreso(){
  const sec = SECTIONS.find(x => x[0] === ProgresoState.section);
  if(sec){
    return `<div class="form-head"><button class="form-back" data-action="psec-close" aria-label="Volver a Progreso">‹</button><div class="form-title">${sec[1]}</div></div>
      <div class="psec">${sectionBody(sec[0])}</div>`;
  }
  const tiles = SECTIONS.map(([id, title]) => {
    const [sum, pend] = sectionSummary(id);
    return `<button class="ptile${pend?' pend':''}" data-action="psec-open" data-v="${id}"><span class="ptile-t">${title}</span><span class="ptile-s">${pend?'<i></i>':''}${esc(sum)}</span><span class="ptile-go" aria-hidden="true">›</span></button>`;
  }).join("");
  return `
    <div class="hb-head"><div class="hb-title">Progreso</div><div class="title-accent"></div></div>
    <div class="ptiles">${tiles}</div>
    ${(State.cloudProfile && State.cloudProfile.role!=="coach" && !State.cloudProfile.coach_id) ? '<div class="join-box"><div class="join-t">Vinculate a tu coach</div><div class="join-row"><input id="joinCode" class="form-input" placeholder="Código del coach"><button class="form-save join-btn" data-auth="join">Vincular</button></div></div>' : ''}`;
}
