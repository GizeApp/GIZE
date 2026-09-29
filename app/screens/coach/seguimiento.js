import { answeredQuestions, coachOwnQuestions, DAILY_COLUMNS } from '../../core/questions.js';

import { dec, esc, fmtDate } from '../../core/utils.js';

import { weeklyAvg } from './clientes.js';

import { renderWChart } from '../progreso.js';

import { CoachState } from './state.js';

export function renderCoachWeekly(d){
  const avg=weeklyAvg(d.weights);
  if(!avg.length) return '<div class="cal-hint">Sin registros de peso.</div>';
  const chart=renderWChart(avg.map(a=>({date:a.date,kg:a.kg})), true, "med");
  const rows=avg.slice().reverse().map((a,i,arr)=>{
    const prev=arr[i+1];
    const df=prev?(a.kg-prev.kg):null;
    const dh=df===null?'\u2014':((df>0?'+':'')+dec(df,2)+' kg');
    const cls=df===null?'em':(Math.abs(df)<0.05?'em':'mx');
    return '<tr><td class="dt">Sem. '+fmtDate(a.date)+'</td><td><b>'+dec(a.kg,2)+' kg</b></td><td class="'+cls+'">'+dh+'</td><td class="em">'+a.n+' reg.</td></tr>';
  }).join("");
  // Gráfico a la izquierda y la tabla de semanas a la derecha (en celular, una abajo de la otra).
  return '<div class="co-split"><div class="co-split-main">'+chart+'</div><div class="co-split-side"><table class="co-tbl"><thead><tr><th>Semana</th><th>Promedio</th><th>Variaci\u00f3n</th><th>Datos</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>';
}

// Respuestas del registro diario de una fila de daily_logs: columnas fijas + "answers".
function dailyAnswers(r){
  const a=Object.assign({}, r.answers||{});
  DAILY_COLUMNS.forEach(k=>{ if(r[k]!=null && r[k]!=="") a[k]=r[k]; });
  return a;
}

const WD=["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
function dayLabel(iso){ const d=new Date(iso+"T12:00:00"); return (isNaN(d)?"":WD[d.getDay()]+" ")+fmtDate(iso); }

// Tarjeta de preguntas → respuestas (mismo formato para el día y la semana).
function qaList(list){
  return list.map(q=>'<div class="ck-q"><div class="ck-qt">'+esc(q.label)+'</div><div class="ck-qa">'+esc(String(q.value))+'</div></div>').join("");
}

// Selector de día / semana / entreno: muestra un registro por vez. Arranca en "Ninguno"
// para que la sección no ocupe lugar hasta que el coach elige qué quiere ver.
export function picker(action, items, sel, label){
  const none='<option value=""'+(sel?'':' selected')+'>Ninguno</option>';
  return '<label class="co-pick"><span>'+label+'</span><select class="co-select" data-coach="'+action+'">'+none+
    items.map(it=>'<option value="'+esc(it.v)+'"'+(it.v===sel?' selected':'')+'>'+esc(it.t)+'</option>').join("")+'</select></label>';
}

export function renderCoachDaily(d){
  const rows=(d.daily||[]).slice().sort((a,b)=>String(b.log_date).localeCompare(String(a.log_date)));
  if(!rows.length) return '<div class="cal-hint">El cliente todav\u00eda no carg\u00f3 registros diarios.</div>';
  const wmap={}; (d.weights||[]).forEach(w=>wmap[w.date]=w.kg);
  const sel=rows.some(r=>r.log_date===CoachState.coachDailySel) ? CoachState.coachDailySel : "";
  const pick=picker("daily-pick", rows.map(x=>({v:x.log_date, t:dayLabel(x.log_date)})), sel, "Día");
  if(!sel) return pick;
  const r=rows.find(x=>x.log_date===sel);
  const w=wmap[r.log_date];
  const qs=answeredQuestions("daily", dailyAnswers(r), coachOwnQuestions("daily"));
  const top='<div class="ck-head">'+dayLabel(r.log_date)+
    '<span class="ck-adh">Peso: <b>'+(w?dec(w)+' kg':'\u2014')+'</b> · Pasos: <b>'+(r.steps?Number(r.steps).toLocaleString("es-AR"):'\u2014')+'</b></span></div>';
  return pick+
    '<div class="ck-card">'+top+(qs.length?qaList(qs):'<div class="cal-hint">Ese día no respondió las preguntas del registro.</div>')+'</div>';
}

export function renderCoachCheckins(d){
  const cks=(d.checkins||[]).slice().sort((a,b)=>String(b.week_start).localeCompare(String(a.week_start)));
  if(!cks.length) return '<div class="cal-hint">El cliente todav\u00eda no respondi\u00f3 ning\u00fan check-in.</div>';
  const sel=cks.some(c=>c.week_start===CoachState.coachCkSel) ? CoachState.coachCkSel : "";
  const pick=picker("ck-pick", cks.map(x=>({v:x.week_start, t:"Semana del "+fmtDate(x.week_start)})), sel, "Semana");
  if(!sel) return pick;
  const c=cks.find(x=>x.week_start===sel);
  const a=c.answers||{};
  // La adherencia tiene su propia columna y se muestra en el encabezado.
  const qs=answeredQuestions("checkin", a, coachOwnQuestions("checkin")).filter(q=>q.id!=="adherence");
  const adh=c.adherence?'<span class="ck-adh">Adherencia: <b>'+(parseInt(c.adherence)||0)+'/10</b></span>':'';
  return pick+
    '<div class="ck-card"><div class="ck-head">Semana del '+fmtDate(c.week_start)+' '+adh+'</div>'+(qs.length?qaList(qs):'<div class="cal-hint">Sin respuestas.</div>')+'</div>';
}
