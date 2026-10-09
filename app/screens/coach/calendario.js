import { CoachState } from './state.js';

const MESES=["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DIAS=["L","M","M","J","V","S","D"];
const p2=n=>String(n).padStart(2,"0");

// Estado del calendario de cada sección de la ficha ("sess", "daily", "ck"): mes visible
// (YYYY-MM; vacío = el del último registro) y día abierto.
export function calState(key){ const c=CoachState.coachCal||(CoachState.coachCal={}); return c[key]||(c[key]={m:null,d:null}); }
export function calSelDay(key){ return calState(key).d; }

// Calendario de una sección: punto verde en cada día con registro (`days`: lista de YYYY-MM-DD);
// ese día es un botón que abre su detalle abajo. El mes se navega con ‹ ›.
export function renderCoachCalendar(key, days, todayIso, noun){
  const has={}; days.forEach(d=>{ if(d) has[d]=1; });
  const dates=Object.keys(has).sort();
  const st=calState(key);
  let ym=st.m;
  if(!/^\d{4}-\d{2}$/.test(ym||"")) ym=(dates.length?dates[dates.length-1]:todayIso).slice(0,7);
  const y=parseInt(ym.slice(0,4),10), m=parseInt(ym.slice(5,7),10);
  const nDays=new Date(y,m,0).getDate();
  const lead=(new Date(y,m-1,1).getDay()+6)%7; // semana desde el lunes
  const prev=m===1?(y-1)+"-12":y+"-"+p2(m-1), next=m===12?(y+1)+"-01":y+"-"+p2(m+1);
  const inMonth=dates.filter(d=>d.slice(0,7)===ym).length;

  let cells="";
  for(let i=0;i<lead;i++) cells+='<span class="cal-x-pad"></span>';
  for(let d=1; d<=nDays; d++){
    const iso=ym+"-"+p2(d), on=!!has[iso];
    const cls="cal-x-day"+(on?" on":"")+(iso===todayIso?" today":"")+(iso===st.d?" sel":"");
    cells+= on
      ? '<button class="'+cls+'" data-coach="cal-day" data-k="'+key+'" data-d="'+iso+'" aria-label="'+d+' de '+MESES[m-1]+': con registro"'+(iso===st.d?' aria-pressed="true"':'')+'>'+d+'</button>'
      : '<span class="'+cls+'">'+d+'</span>';
  }

  return '<div class="cal-x">'+
    '<div class="cal-x-head"><button class="cal-x-nav" data-coach="cal-nav" data-k="'+key+'" data-m="'+prev+'" aria-label="Mes anterior">‹</button>'+
      '<div class="cal-x-title">'+MESES[m-1]+' '+y+'<span>'+(inMonth?inMonth+" "+noun[inMonth===1?0:1]:"Sin registros")+'</span></div>'+
      '<button class="cal-x-nav" data-coach="cal-nav" data-k="'+key+'" data-m="'+next+'" aria-label="Mes siguiente">›</button></div>'+
    '<div class="cal-x-grid cal-x-dow">'+DIAS.map(x=>'<span>'+x+'</span>').join("")+'</div>'+
    '<div class="cal-x-grid">'+cells+'</div>'+
    '<div class="cal-x-legend"><span><i class="on"></i>Con registro</span><span><i></i>Sin registro</span></div>'+
  '</div>';
}
