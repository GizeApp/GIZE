import { answeredQuestions, coachOwnQuestions, DAILY_COLUMNS } from '../../core/questions.js';

import { dec, esc, fmtDate, today } from '../../core/utils.js';

import { weeklyAvg } from './clientes.js';

import { renderWChart } from '../progreso.js';

import { renderCoachCalendar, calSelDay } from './calendario.js';

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

export function renderCoachDaily(d){
  const rows=(d.daily||[]).slice().sort((a,b)=>String(b.log_date).localeCompare(String(a.log_date)));
  if(!rows.length) return '<div class="cal-hint">El cliente todav\u00eda no carg\u00f3 registros diarios.</div>';
  const wmap={}; (d.weights||[]).forEach(w=>wmap[w.date]=w.kg);
  const cal=renderCoachCalendar("daily", rows.map(x=>x.log_date), today(), ["registro","registros"]);
  const sel=calSelDay("daily");
  if(!sel) return cal+'<div class="cal-hint">Tocá un día marcado para ver el registro.</div>';
  const r=rows.find(x=>x.log_date===sel);
  if(!r) return cal+'<div class="cal-hint">Ese día no hay registro.</div>';
  const w=wmap[r.log_date];
  const qs=answeredQuestions("daily", dailyAnswers(r), coachOwnQuestions("daily"));
  const top='<div class="ck-head">'+dayLabel(r.log_date)+
    '<span class="ck-adh">Peso: <b>'+(w?dec(w)+' kg':'\u2014')+'</b> · Pasos: <b>'+(r.steps?Number(r.steps).toLocaleString("es-AR"):'\u2014')+'</b></span></div>';
  return cal+
    '<div class="ck-card">'+top+(qs.length?qaList(qs):'<div class="cal-hint">Ese día no respondió las preguntas del registro.</div>')+'</div>';
}

// Día en que el alumno cargó el check-in («1 de octubre de 2026», hora de Argentina), en vez de
// la semana a la que corresponde. Los check-ins de antes de que la tabla guardara la fecha
// (created_at vacío, ver supabase/checkin-fecha.sql) siguen diciendo «Semana del …».
const MESES=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
function ckLabel(c){
  const t=c && (c.created_at || c.inserted_at);
  const dt=t ? new Date(t) : null;
  if(!dt || isNaN(dt)) return "Semana del "+fmtDate(c.week_start);
  try{
    const p=new Intl.DateTimeFormat("es-AR",{timeZone:"America/Argentina/Buenos_Aires",day:"numeric",month:"numeric",year:"numeric"}).formatToParts(dt);
    const g=k=>parseInt((p.find(x=>x.type===k)||{}).value,10);
    return g("day")+" de "+MESES[g("month")-1]+" de "+g("year");
  }catch(e){ return "Semana del "+fmtDate(c.week_start); }
}

// Día (YYYY-MM-DD, hora de Argentina) en que se cargó el check-in; sin fecha guardada, el lunes de su semana.
function ckDay(c){
  const t=c && (c.created_at || c.inserted_at);
  const dt=t ? new Date(t) : null;
  if(dt && !isNaN(dt)){
    try{ return new Intl.DateTimeFormat("en-CA",{timeZone:"America/Argentina/Buenos_Aires",year:"numeric",month:"2-digit",day:"2-digit"}).format(dt); }catch(e){}
  }
  return String(c.week_start||"");
}

export function renderCoachCheckins(d){
  const cks=(d.checkins||[]).slice().sort((a,b)=>String(b.week_start).localeCompare(String(a.week_start)));
  if(!cks.length) return '<div class="cal-hint">El cliente todav\u00eda no respondi\u00f3 ning\u00fan check-in.</div>';
  const cal=renderCoachCalendar("ck", cks.map(ckDay), today(), ["check-in","check-ins"]);
  const sel=calSelDay("ck");
  if(!sel) return cal+'<div class="cal-hint">Tocá un día marcado para ver el check-in.</div>';
  const c=cks.find(x=>ckDay(x)===sel);
  if(!c) return cal+'<div class="cal-hint">Ese día no hay check-in.</div>';
  const a=Object.assign({}, c.answers||{});
  // La adherencia del 1 al 10 tiene su propia columna y se muestra en el encabezado. Si el
  // coach le cambió las opciones (palabras) o el tipo (respuesta libre), va como una más.
  const adhN=/^\s*\d+\s*$/.test(String(c.adherence)) ? parseInt(c.adherence,10) : 0;
  if(!adhN && c.adherence!=null && String(c.adherence).trim()!=="" && (a.adherence==null || a.adherence==="")) a.adherence=c.adherence;
  const qs=answeredQuestions("checkin", a, coachOwnQuestions("checkin")).filter(q=>q.id!=="adherence" || !adhN);
  const adh=adhN?'<span class="ck-adh">Adherencia: <b>'+adhN+'/10</b></span>':'';
  return cal+
    '<div class="ck-card"><div class="ck-head">'+esc(ckLabel(c))+' '+adh+'</div>'+(qs.length?qaList(qs):'<div class="cal-hint">Sin respuestas.</div>')+'</div>';
}
