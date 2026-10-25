// Panel del coach, versión de escritorio con barra lateral: el marco (barra de la izquierda +
// título de la pantalla) y las cuatro pantallas de arriba: Inicio, Clientes, Rutinas y Planes
// alimenticios. Las acciones (data-coach="…") son las de siempre: acá solo se dibuja. En el
// celular la barra pasa a ser una franja de arriba con las mismas opciones (css/screens/coach/panel.css).
import { avatarHtml } from '../../core/avatar.js';
import { esc, fmtDate, mondayOf, num, today } from '../../core/utils.js';
import { diasTexto } from '../../core/diasemana.js';
import { ssGroups } from '../../core/superserie.js';
import { CATALOGO, diasDeEntreno, rutinasDeDias } from '../../core/rutinas-ejemplo.js';
import { downloadSvg, gearSvg } from '../../core/icons.js';
import { State } from '../../core/state.js';
import { unreadFor } from '../../ui/chat.js';
import { coachInitials } from './clientes.js';
import { CoachState } from './state.js';
import { missingHint } from './planes.js';
import { botonClases, botonRecepcion, chipGym, esProfeGym, grupos, nombreGym } from './gimnasio.js';

const ico = d => '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+d+'</svg>';
const I = {
  home: ico('<rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/>'),
  users: ico('<circle cx="9" cy="8" r="3.3"/><path d="M3 20c0-3.2 2.7-5.5 6-5.5s6 2.3 6 5.5"/><path d="M16 4.9a3.2 3.2 0 0 1 0 6.2"/><path d="M18 14.9c1.9.7 3 2.4 3 4.6"/>'),
  dumbbell: ico('<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>'),
  fork: ico('<path d="M6 3v6a2.5 2.5 0 0 0 5 0V3M8.5 11.5V21"/><path d="M17 3c-2.2 1.8-3 4.5-3 8h3v10"/>'),
  help: ico('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.3a2.6 2.6 0 0 1 5 .9c0 1.7-2.5 2.2-2.5 3.8M12 17.2h.01"/>'),
};

// El span cv-more se esconde en el celular (no entra «Planes alimenticios» entero).
// Íconos chicos y apagados: avisan de qué trata cada cosa sin competir con el texto.
const sm = d => ico(d).replace('width="18" height="18"','width="16" height="16" class="cv-ic"');
const S = {
  chat: sm('<path d="M4 5.5h16v10H9.5L5.5 19v-3.5H4z"/>'),
  dumbbell: sm('<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>'),
  check: sm('<circle cx="12" cy="12" r="9"/><path d="M8 12.3l2.8 2.8L16 9.6"/>'),
  scale: sm('<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8.5 9.5a4.5 3 0 0 1 7 0M12 9.5l1.6-1.4"/>'),
  plus: sm('<path d="M12 5v14M5 12h14"/>'),
  search: sm('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>'),
  userPlus: sm('<circle cx="9" cy="8" r="3.3"/><path d="M3 20c0-3.2 2.7-5.5 6-5.5s6 2.3 6 5.5M18 8v6M15 11h6"/>'),
  send: sm('<path d="M4 12l16-7-6 15-2.5-6.5z"/>'),
  link: sm('<path d="M10 14a4 4 0 0 0 5.6 0l3-3a4 4 0 0 0-5.6-5.6l-1 1M14 10a4 4 0 0 0-5.6 0l-3 3a4 4 0 0 0 5.6 5.6l1-1"/>'),
  calendar: sm('<rect x="4" y="5.5" width="16" height="14" rx="3"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>'),
  flame: sm('<path d="M12 3c.5 3-2.5 4.5-2.5 8a3.5 3.5 0 0 0 7 0c0-1.5-.7-2.5-1.5-3.5C14.5 8.5 14 6 12 3zM8 14.5a4.5 4.5 0 0 0 8.5 2"/>'),
  user: sm('<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6"/>'),
  layers: sm('<path d="M12 4l8.5 4.5L12 13 3.5 8.5zM3.5 12.5L12 17l8.5-4.5M3.5 16.5L12 21l8.5-4.5"/>'),
  sun: sm('<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"/>'),
  clock: sm('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  route: sm('<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5"/>'),
  bars: sm('<path d="M5 20V11M12 20V4M19 20v-7"/>'),
  gym: sm('<path d="M3 20h18M5 20V9l7-5 7 5v11M9.5 20v-5h5v5"/>'),
};
// Ícono de cada sección de la ficha del alumno (menú de tarjetas de index.js).
const SEC_IC = { gimnasio:S.gym, chat:S.chat, ficha:S.user, bloque:S.layers, daily:S.sun, checkin:S.check, hist:S.clock, salidas:S.route, volumen:S.bars, peso:S.scale, habitos:S.check };
export const secIcon = k => SEC_IC[k] || "";
const unreadAll = () => CoachState.coachClients.reduce((n,c)=>n+(unreadFor(c.id)||0), 0);

const NAV = [["home","Inicio",I.home],["clients","Clientes",I.users],["tpls","Rutinas",I.dumbbell],["meals","Planes<span class=\"cv-more\"> alimenticios</span>",I.fork]];

// El panel del gimnasio (app/screens/gym/marco.js) usa este mismo marco con otra lista de opciones y
// su marca: mientras el dueño o la administración están en su panel, lo que dibuja el panel de coach
// adentro (sus rutinas, sus planes, la ficha de un socio) sale con el marco del gimnasio. Para un
// coach sin gimnasio no se llama nunca: el marco de siempre.
let otroMarco = null;
export function usarMarco(f){ otroMarco = typeof f === "function" ? f : null; }

// El marco de siempre: barra lateral + contenido. active = la opción marcada.
export function coachShell(active, inner){
  if(otroMarco) return otroMarco(active, inner);
  return '<div class="cv-shell">'+
    '<aside class="cv-side">'+
      '<div class="co-brand cv-brand"><img class="brand-logo" src="brand/logo/gize-firma-horizontal.svg" alt="GIZE"><span class="cv-sr">Panel de coach</span>'+chipGym()+'</div>'+
      '<nav class="cv-nav" aria-label="Panel de coach">'+NAV.map(n=>'<button class="cv-nav-i'+(n[0]===active?' on':'')+'" data-coach="view-'+n[0]+'"'+(n[0]===active?' aria-current="page"':'')+(n[0]==="clients"&&unreadAll()?' title="Tenés mensajes sin leer"':'')+'>'+n[2]+(n[0]==="clients"&&unreadAll()?'<i class="cv-pip" aria-hidden="true"></i>':'')+'<span>'+n[1]+'</span></button>').join("")+'</nav>'+
      '<div class="cv-util">'+
        botonClases(active)+botonRecepcion(active)+
        '<button class="cv-util-i co-q-btn" data-coach="q-open" title="Preguntas del registro diario y del check-in">'+I.help+'<span>Preguntas</span></button>'+
        '<button class="cv-util-i'+(active==="settings"?' on':'')+'" data-coach="open-settings" title="Configuración"'+(active==="settings"?' aria-current="page"':'')+'>'+gearSvg+'<span>Configuración</span></button>'+
        '<button class="cv-util-i cv-out" data-auth="logout"><span>Salir</span></button>'+
      '</div>'+
    '</aside>'+
    '<main class="cv-main"><div class="co-wrap cv-wrap">'+inner+'</div></main>'+
  '</div>';
}

export const pageHead = (title, actions) => '<div class="co-head cv-head"><h1 class="cv-title">'+title+'</h1>'+(actions?'<div class="cv-head-actions">'+actions+'</div>':'')+'</div>';
const mainBtn = (attrs, label, icon) => '<button class="gize-btn cv-btn" '+attrs+'>'+(icon||"")+label+'</button>';

// ---------- Datos de los clientes (lo que ya trae coach_client_stats: cantidad de entrenos y fecha del último) ----------
const stats = id => CoachState.coachClientStats[id] || null;
const daysSince = ymd => ymd ? Math.round((new Date(today()+"T00:00:00") - new Date(ymd+"T00:00:00")) / 86400000) : null;
const statsReady = () => !!CoachState.coachStatsReady || !CoachState.coachClients.length;
// Cuándo entrenó, en palabras cortas.
function actTxt(days){
  if(days===null) return "Sin entrenos aún";
  if(days<=0) return "Hoy";
  if(days===1) return "Ayer";
  if(days<30) return "Hace "+days+" días";
  return "Hace "+Math.floor(days/30)+(days<60?" mes":" meses");
}
// Estado por antigüedad del último entreno: ok (hasta 2 días), warn (hasta 6), bad (más o nunca).
const tone = d => d===null || d>6 ? "bad" : d>2 ? "warn" : "ok";

function buckets(){
  const mon=mondayOf(today());
  const rows=CoachState.coachClients.map(c=>{ const st=stats(c.id); const last=st&&st.lastSess; return { c, last, days:daysSince(last), n:st?st.nSess:0 }; });
  return {
    rows,
    week: rows.filter(r=>r.last && r.last>=mon),
    today: rows.filter(r=>r.days===0),
    idle: rows.filter(r=>r.days===null || r.days>=7),
    // Los que más tiempo llevan sin entrenar primero; los que nunca entrenaron, al final.
    attention: rows.filter(r=>r.days===null || r.days>=4).sort((a,b)=>(b.days===null?-1:b.days)-(a.days===null?-1:a.days))
  };
}

// La lista de clientes todavía no llegó (arranque con la red lenta, ver afterLogin).
const clientesCargando = () => !CoachState.coachClientsLoaded && !CoachState.coachClients.length;
const CARGANDO_CLIENTES = '<div class="cv-card cv-hello"><b>Cargando tus clientes…</b><span>Si no tenés conexión, aparecen apenas vuelva.</span></div>';

// ---------- Inicio ----------
export function renderHomeView(extra){
  const ready=statsReady(), B=buckets();
  const stat=(k,label,n)=>'<div class="cv-card cv-stat"><div class="cv-stat-l"><span class="cv-dot '+k+'"></span>'+label+'</div><div class="cv-stat-n">'+(ready?n:'–')+'</div></div>';
  const person=(r,right,cls)=>'<button class="cv-li" data-coach="open" data-id="'+esc(r.c.id)+'"><span class="cv-li-n">'+esc(r.c.full_name||"Sin nombre")+'</span>'+(unreadFor(r.c.id)?'<span class="chat-badge" title="Mensajes sin leer">'+unreadFor(r.c.id)+'</span>':'')+'<span class="cv-li-r '+(cls||"")+'">'+right+'</span><span class="cv-li-go" aria-hidden="true">›</span></button>';
  const list=(title,rows,empty)=>'<section class="cv-col"><h2 class="cv-h2">'+title+'</h2><div class="cv-card cv-list">'+(rows.length?rows.join(""):'<div class="cv-empty">'+empty+'</div>')+'</div></section>';
  const att=B.attention.map(r=>person(r, r.days===null?"Sin entrenos":r.days+" días", tone(r.days)));
  const tod=B.today.map(r=>person(r, "Hoy", ""));
  const noClients=!CoachState.coachClients.length;
  const body = clientesCargando() ? CARGANDO_CLIENTES : noClients
    ? '<div class="cv-card cv-hello"><b>Todavía no tenés clientes vinculados</b><span>Compartí tu código de invitación desde «Clientes»: van a aparecer acá apenas se vinculen.</span><button class="gize-btn cv-btn" data-coach="view-clients">Ir a Clientes</button></div>'
    : '<div class="cv-stats">'+stat("ok","Activos esta semana",B.week.length)+stat("ok","Entrenaron hoy",B.today.length)+stat("warn","Sin actividad",B.idle.length)+'</div>'+
      '<div class="cv-cols">'+list("Necesitan atención",ready?att:[],ready?"Todos al día":"Cargando…")+list("Entrenaron hoy",ready?tod:[],ready?"Todavía nadie entrenó hoy":"Cargando…")+'</div>';
  return pageHead("Inicio", noClients?"":mainBtn('data-coach="home-assign"',"Asignar rutina",S.send))+(extra||"")+body;
}

// ---------- Clientes ----------
export function peekedId(filtered){
  if(CoachState.coachPeek===false) return null;
  const id=CoachState.coachPeek;
  return filtered.some(c=>c.id===id) ? id : (filtered[0] ? filtered[0].id : null);
}

// El panel de la derecha: un vistazo al cliente sobre el que está el mouse (la ficha completa se abre al tocarlo).
export function renderPeek(id){
  const c=CoachState.coachClients.find(x=>x.id===id); if(!c) return "";
  const st=stats(id), d=CoachState.coachPeekData[id]||{};
  const un=unreadFor(id);
  const routine = d.routine===undefined ? "…" : d.routine ? esc(d.routine) : "Sin rutina";
  const val = v => v===undefined ? "…" : v===null ? "—" : esc(String(v));
  return '<div class="cv-peek-head">'+avatarHtml(c.avatar_path, coachInitials(c.full_name), 'co-avatar cv-peek-av')+'<div class="cv-peek-name">'+esc(c.full_name||"Sin nombre")+'</div>'+
      '<button class="cv-x" data-coach="peek-close" aria-label="Cerrar">'+ico('<path d="M6 6l12 12M18 6L6 18"/>')+'</button></div>'+
    '<div class="cv-peek-rt"><div class="cv-peek-rt-t"><small>Rutina</small><b>'+routine+'</b></div><button class="cv-link" data-coach="open" data-id="'+esc(id)+'" data-t="rutina">Ver ›</button></div>'+
    '<div class="cv-tiles">'+
      '<button class="cv-tile cv-tile-btn'+(un?' unread':'')+'" data-coach="peek-chat" data-id="'+esc(id)+'"><b>'+S.chat+'Chat'+(un?'<i class="cv-pip" aria-hidden="true"></i>':'')+'</b><span>'+(un?un+(un===1?' nuevo':' nuevos'):'Sin nuevos')+'</span></button>'+
      '<div class="cv-tile"><b>'+S.dumbbell+'Entrenos</b><span>'+(st?st.nSess:'—')+'</span></div>'+
      '<div class="cv-tile"><b>'+S.check+'Check-ins</b><span>'+val(d.checkins)+'</span></div>'+
      '<div class="cv-tile"><b>'+S.scale+'Peso</b><span>'+(d.kg===undefined?'…':d.kg===null?'—':esc(String(d.kg).replace(".",","))+' kg')+'</span></div>'+
    '</div>'+
    '<button class="cv-link cv-peek-full" data-coach="open" data-id="'+esc(id)+'">Ver ficha completa ›</button>';
}

export function renderClientsView(inviteHtml, bannerHtml){
  const q=(CoachState.coachSearch||"").toLowerCase();
  const filtered=CoachState.coachClients.filter(c=>(c.full_name||"").toLowerCase().includes(q));
  const first=!CoachState.coachSearch && !CoachState.coachClients.length;
  const head=pageHead("Clientes",
    (first?'':'<label class="cv-find">'+S.search+'<input class="co-search cv-search" placeholder="Buscar…" aria-label="Buscar cliente" data-coach="coach-search" value="'+esc(CoachState.coachSearch||"")+'"></label>')+
    // El profe de un gimnasio: «Invitar socio» copia el código del gimnasio (el que va primero).
    (/data-coach="copy-gym-code"/.test(inviteHtml) ? mainBtn('data-coach="copy-gym-code"',"Invitar socio",S.userPlus)
      : CoachState.coachInvite && /data-coach="copy-invite"/.test(inviteHtml) ? mainBtn('data-coach="copy-invite"',"Invitar cliente",S.userPlus) : ''));
  const assign=CoachState.coachAssign ? '<div class="co-unsaved cv-assign">Elegí el cliente al que le querés asignar una rutina.<button class="cv-link" data-coach="assign-cancel">Cancelar</button></div>' : '';
  if(first && clientesCargando()) return head+inviteHtml+bannerHtml+CARGANDO_CLIENTES;
  // El onboarding es un bloque ancho de pasos: reemplaza a la lista entera (sin buscador).
  if(first){
    const step=(n,t)=>'<div class="co-item co-onboard-step"><div class="co-onboard-n">'+n+'</div><div class="co-onboard-txt">'+t+'</div></div>';
    if(esProfeGym()) return head+inviteHtml+bannerHtml+'<div class="co-onboard"><div class="co-onboard-lead">Todavía no tenés socios asignados</div>'+
      step(1,'Cuando '+esc(nombreGym())+' te asigne socios, van a aparecer acá')+step(2,'Si alguien quiere sumarse, pasale el <b>código del gimnasio</b> de arriba')+step(3,'El gimnasio aprueba el pedido y le asigna profe')+'</div>';
    return head+inviteHtml+bannerHtml+'<div class="co-onboard"><div class="co-onboard-lead">Todavía no tenés clientes vinculados</div>'+
      step(1,'Copiá tu <b>código de invitación</b> de arriba')+step(2,'Pasáselo a tu cliente por donde le quede más cómodo')+step(3,'Se vincula solo — va a aparecer acá apenas lo haga')+'</div>';
  }
  const peek=peekedId(filtered);
  if(peek) queueMicrotask(()=>loadPeek(peek));
  const fila=c=>{
    const st=stats(c.id)||{}, days=daysSince(st.lastSess), t=tone(days), un=unreadFor(c.id);
    const pct=days===null?0:Math.max(6,Math.round((1-Math.min(days,14)/14)*100));
    return '<div class="co-trow cv-row'+(c.id===peek?' on':'')+'" data-coach="open" data-id="'+esc(c.id)+'" data-peek="'+esc(c.id)+'" tabindex="0">'+
        '<div class="co-td co-td-name">'+avatarHtml(c.avatar_path, coachInitials(c.full_name), 'co-avatar')+'<span class="co-cname">'+esc(c.full_name||"Sin nombre")+'</span>'+(un?'<span class="chat-badge" title="Mensajes sin leer">'+un+'</span>':'')+'</div>'+
        '<div class="co-td co-td-email'+(c.email?'':' co-empty')+'">'+esc(c.email||"Sin email")+'</div>'+
        '<div class="co-td co-td-activity"><span class="co-dot cv-t-'+t+'"></span><span class="co-act-date">'+actTxt(days)+'</span></div>'+
        '<div class="co-td cv-prog" title="Entrenos hechos y qué tan reciente fue el último"><span class="cv-prog-n">'+(st.nSess?st.nSess:'–')+'</span><span class="cv-bar"><i class="'+t+'" style="width:'+pct+'%"></i></span></div>'+
        '<div class="co-td co-td-actions"><span class="co-arrow">›</span></div>'+
      '</div>';
  };
  // En un gimnasio, con socios y alumnos propios: dos grupos (screens/coach/gimnasio.js).
  const gr=grupos(filtered);
  const rows=gr ? gr.map(g=>'<div class="cv-grp" role="heading" aria-level="2">'+esc(g.t)+'<span class="cv-grp-n">'+g.list.length+'</span></div>'+g.list.map(fila).join("")).join("") : filtered.map(fila).join("");
  const list=filtered.length ? '<div class="co-table cv-table">'+rows+'</div>' : '<div class="cal-hint">Sin resultados.</div>';
  const side=(filtered.length && peek) ? '<aside class="cv-card cv-peek" id="cvPeek" aria-label="Vista rápida del cliente">'+renderPeek(peek)+'</aside>' : '';
  return head+assign+inviteHtml+bannerHtml+'<div class="cv-split'+(side?' has-peek':'')+'">'+list+side+'</div>';
}

// Al pasar el mouse (o el foco) por un cliente: el panel de la derecha cambia sin redibujar todo.
function peekTo(id){
  if(!id || CoachState.coachPeek===id) return;
  CoachState.coachPeek=id;
  paintPeek();
  loadPeek(id);
}
export function paintPeek(){
  const host=document.getElementById("cvPeek"); if(!host) return;
  const id=peekedId(CoachState.coachClients.filter(c=>(c.full_name||"").toLowerCase().includes((CoachState.coachSearch||"").toLowerCase())));
  if(!id) return;
  host.innerHTML=renderPeek(id);
  document.querySelectorAll(".cv-row").forEach(r=>r.classList.toggle("on", r.dataset.peek===id));
}
document.addEventListener("mouseover", e=>{ const r=e.target.closest && e.target.closest(".cv-row[data-peek]"); if(r) peekTo(r.dataset.peek); });
document.addEventListener("focusin", e=>{ const r=e.target.closest && e.target.closest(".cv-row[data-peek]"); if(r) peekTo(r.dataset.peek); });

// Rutina, check-ins y último peso del cliente, que no vienen con la lista: se piden de a uno, la primera vez, y quedan guardados.
export async function loadPeek(id){
  if(!id || CoachState.coachPeekData[id] || !State.sb) return;
  const sb=State.sb, got=CoachState.coachPeekData[id]={};
  // Cada lectura es opcional: si una falla (sin señal, sin permiso) su dato queda en «—».
  const safe=q=>{ try{ return Promise.resolve(q()).then(r=>(r&&!r.error)?r:null, ()=>null); }catch(e){ return Promise.resolve(null); } };
  const [rt, ck, wt]=await Promise.all([
    safe(()=>sb.from("routines").select("days").eq("client_id",id).maybeSingle()),
    safe(()=>sb.from("checkins").select("id",{count:"exact",head:true}).eq("client_id",id)),
    safe(()=>sb.from("body_weights").select("kg").eq("client_id",id).order("measured_on",{ascending:false}).limit(1))
  ]);
  const days=rt&&rt.data&&Array.isArray(rt.data.days)?rt.data.days:null;
  got.routine = rt ? (days&&days.length ? days.map(x=>x&&x.name).filter(Boolean).join(" · ")||(days.length+" días") : null) : null;
  got.checkins = ck&&typeof ck.count==="number" ? ck.count : null;
  const w=wt&&Array.isArray(wt.data)&&wt.data[0];
  got.kg = w&&w.kg!=null ? Math.round(num(w.kg)*10)/10 : null;
  if(CoachState.coachPeek===id || (CoachState.coachPeek===null)) paintPeek();
}

// ---------- Rutinas ----------
const setsTxt = ex => { const s=ex.sets||[]; if(!s.length) return "—"; const t=s.map(x=>(x.secs>0?x.secs+" s":(x.target||"")))[0]; return s.length+" × "+(t||"—"); };

export function renderTplDetail(t){
  const days=t.days||[];
  const di=Math.min(Math.max(CoachState.coachTplDay||0,0), Math.max(days.length-1,0));
  const day=days[di];
  const tabs=days.map((d,i)=>'<button class="cv-pill'+(i===di?' on':'')+'" data-coach="tpl-day" data-i="'+i+'">'+esc(d.name||('Día '+(i+1)))+'</button>').join("");
  let rows='<div class="cv-empty">Esta rutina no tiene días todavía.</div>';
  if(day){
    const exs=day.exercises||[], grp=ssGroups(exs);
    let plain=0;
    rows=exs.length ? exs.map((ex,i)=>{
      const g=grp.find(x=>i>=x.start && i<=x.end);
      const tag=g ? g.letter+(i-g.start+1) : String(++plain);
      return '<div class="cv-ex'+(g?' ss':'')+'"><span class="cv-ex-n">'+esc(tag)+'</span><span class="cv-ex-t">'+esc(ex.name||"Ejercicio")+'</span>'+(g&&i===g.start?'<span class="cv-ex-link" title="Superserie">'+S.link+'</span>':'')+'<span class="cv-ex-s">'+esc(setsTxt(ex))+'</span></div>';
    }).join("") : '<div class="cv-empty">Este día no tiene ejercicios.</div>';
  }
  const dias = day && diasTexto(day);
  return '<div class="cv-detail-head"><h2 class="cv-detail-t">'+esc(t.name||"Sin nombre")+'</h2><button class="co-copy-btn cv-sec-btn" data-coach="tpl-open" data-id="'+esc(t.id)+'">Editar rutina</button></div>'+
    (days.length?'<div class="cv-pills" role="tablist">'+tabs+'</div>':'')+
    (dias?'<div class="cv-sub">'+esc(dias)+'</div>':'')+
    '<div class="cv-exs">'+rows+'</div>';
}

export function renderTplsView(banner){
  const L=CoachState.coachTpls;
  const sel=L.find(t=>t.id===CoachState.coachTplPick) || L[0] || null;
  const seed=CoachState.coachSeedOpen ? '<div class="co-items tpl-seed-list cv-seed">'+rutinasDeDias(CoachState.coachCat||CATALOGO, 0).map(r=>{
      const nd=diasDeEntreno(r), nex=(r.days||[]).reduce((n,d)=>n+((d.exercises||[]).length),0);
      return '<div class="co-item tpl-item" data-coach="tpl-seed-cat" data-id="'+esc(r.id)+'">'+
        '<div class="co-name">'+esc(r.nombre)+'</div>'+
        '<div class="co-item-meta">'+nd+' día'+(nd===1?'':'s')+' de entreno · '+nex+' ejercicios'+(r.para==="mujer"?' · para mujer':r.para==="hombre"?' · para hombre':'')+'</div>'+
        '<div class="co-arrow">›</div></div>';
    }).join("")+'</div>' : '';
  const head=pageHead("Rutinas",
    '<button class="co-copy-btn cv-sec-btn" data-coach="tpl-seed-open" aria-expanded="'+!!CoachState.coachSeedOpen+'">'+downloadSvg+' Importar rutina armada</button>'+mainBtn('data-coach="tpl-new"',"Crear rutina",S.plus));
  if(!L.length){
    return head+(banner||"")+seed+(CoachState.tplsError ? '<div class="cal-hint" style="color:var(--red)">No se pudieron cargar: <b>'+esc(CoachState.tplsError)+'</b><br><br>Si dice que la tabla no existe, falta correr el SQL de rutinas en Supabase.</div>' : '<div class="cal-hint">Todavía no creaste ninguna rutina. Creá una y después aplicásela a los clientes que quieras.</div>');
  }
  const cards=L.map(t=>{ const nd=(t.days||[]).length;
    return '<button class="cv-card cv-tpl'+(sel&&t.id===sel.id?' on':'')+'" data-coach="tpl-pick" data-id="'+esc(t.id)+'"><b>'+esc(t.name||"Sin nombre")+'</b><span>'+S.calendar+nd+' día'+(nd===1?'':'s')+'</span></button>'; }).join("");
  return head+(banner||"")+seed+'<div class="cv-tpls"><div class="cv-tpl-list">'+cards+'</div><section class="cv-card cv-detail">'+renderTplDetail(sel)+'</section></div>';
}

// ---------- Planes alimenticios ----------
export function renderMealsView(banner){
  const L=CoachState.coachMealTpls;
  const head=pageHead("Planes alimenticios", mainBtn('data-coach="mp-new"',"Crear plan",S.plus));
  if(!L.length){
    return head+(banner||"")+(CoachState.mealTplsError ? missingHint(CoachState.mealTplsError) : '<div class="cal-hint">Todavía no guardaste ningún plan. Armá uno acá o, desde el plan alimenticio de un cliente, tocá «Guardar como plan». Después se lo aplicás a quien quieras.</div>');
  }
  const kcal=p=>{ let k=0; ((p&&p.trainDays)||[]).forEach(r=>{ k+=num(r.kcal); }); return Math.round(k); };
  const cards=L.map(t=>{
    const k=kcal(t.plan), n=((t.plan&&t.plan.trainDays)||[]).length;
    return '<button class="cv-card cv-plan" data-coach="mp-open" data-id="'+esc(t.id)+'"><b>'+esc(t.name||"Sin nombre")+'</b>'+
      '<div class="cv-plan-k">'+S.flame+(k?k.toLocaleString("es-AR"):'—')+'<small>kcal</small></div>'+
      '<span>'+(n?n+' comida'+(n===1?'':'s'):'Sin cargar')+'</span></button>';
  }).join("");
  return head+(banner||"")+'<div class="cv-plans">'+cards+'</div>';
}
