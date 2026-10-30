// «Cobros» en el panel del coach (supabase/cobros-coach.sql). SIN COBRO ONLINE: GIZE no cobra ni mueve
// plata; el coach anota lo que ya le pagaron sus alumnos (en efectivo, por transferencia u otro medio) y
// GIZE le muestra quién está al día, a quién se le venció la cuota y cuánto cobró en el mes. Es lo mismo
// que Cuotas en los gimnasios (app/screens/gym/cuotas.js), para el coach con sus alumnos propios.
//   · La pantalla «Cobros» (botón en la barra, junto a Preguntas): lo cobrado y lo que falta cobrar en el
//     mes, los alumnos por estado con [Anotar cobro] y «Recordarle», y «Cobros del mes» (en la web, con
//     el CSV).
//   · La tarjeta «Cuota» en la ficha del alumno: su cuota (cambiarla o sacarla), cuándo vence y sus
//     cobros (anular uno anotado por error).
//   · En Inicio, una tira «Cobros · 2 vencidas · 3 por vencer ›», sin montos.
//   · Las ventanas «Cargar cuotas» y «Anotar cobro» (#cobrosModal). El id del cobro lo arma la app al
//     abrir la ventana: dos toques o un reintento sin señal no anotan dos veces.
//   · «Recordarle» abre el chat de GIZE con un texto ya escrito, sin montos ni datos para pagar: el coach
//     lo revisa y lo manda como cualquier mensaje. Al lado, «Por WhatsApp» con el mismo texto. GIZE nunca
//     le escribe solo a un alumno.
// Se ve solo si la base ya lo tiene (cobros_resumen), el coach está al día y el interruptor de su
// plataforma está prendido (core/cobros.js: nace con la web prendida y las apps apagadas). Sin la base
// (la función no existe) no se ve nada y no se vuelve a preguntar por 10 minutos. El profe de un gimnasio
// sin alumnos propios no lo ve (sus socios pagan en Cuotas del gimnasio), y la dueña y la administración
// de un gimnasio tampoco, en esta versión.
// Las ayudas de Cuotas (gym/cuotas.js, gym/estado.js, gym/marco.js y gym/csv.js) y sus estilos
// (css/screens/gym.css) se cargan recién al abrir Cobros: a quien no lo usa no se le pide nada de eso.
import { State } from '../../core/state.js';
import { esc } from '../../core/utils.js';
import { avatarHtml } from '../../core/avatar.js';
import { appNativa } from '../../core/tienda.js';
import { rolGym } from '../../core/gimnasio.js';
import { cobrosVisibles } from '../../core/cobros.js';
import { openChat } from '../../ui/chat.js';
import { circular } from '../../ui/avisos.js';
import { CoachState } from './state.js';
import { coachInitials, openClient } from './clientes.js';
import { esProfeGym, propios } from './gimnasio.js';
import { mealDirty } from './planes.js';
import { qDirty } from './preguntas.js';
import { renderCoach, clientUnsaved, tplDirty, routineDirty, dropRoutineDraft } from './index.js';

// r: lo que devolvió cobros_resumen. undefined: todavía no se preguntó; null: nada que mostrar (la base
// sin la función, sin señal la primera vez, o sin datos).
// parte: «Alumnos» o «Cobros del mes». tab: el estado elegido (null: el primero con alguien).
// mes: el mes elegido en «Cobros del mes» (AAAA-MM-01). meses: lo leído de cada mes. fichas: lo de
// cobros_alumno de cada alumno ({ datos, error, t, pidiendo }). modal: la ventana abierta.
const CB = { uid: null, r: undefined, t: 0, pidiendo: false, otraVez: false, sinBase: 0, parte: "alumnos", tab: null, mes: "", meses: {}, fichas: {}, modal: null, busy: "" };

const POR = { 1: "por mes", 2: "cada 2 meses", 3: "cada 3 meses", 6: "cada 6 meses", 12: "por año" };
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const TABS = [["vencida", "Vencidas"], ["por_vencer", "Por vencer"], ["sin_pagos", "Sin pagos"], ["al_dia", "Al día"], ["sin_cuota", "Sin cuota"], ["todos", "Todos"]];
const VACIO = { vencida: "Nadie con la cuota vencida.", por_vencer: "Ninguna cuota vence en los próximos 7 días.", sin_pagos: "Nadie con cuota y sin cobros anotados.",
  al_dia: "Nadie al día todavía.", sin_cuota: "Todos tus alumnos tienen cuota.", todos: "" };
// Transferencia primero: es la que viene marcada.
const ORDEN_MEDIOS = ["transferencia", "efectivo", "otro"];
const RECORDAR = ["vencida", "por_vencer", "sin_pagos"];

// La base todavía no tiene supabase/cobros-coach.sql (o se volvió atrás).
const sinFuncion = e => /^(PGRST202|42883)$/.test(String((e && e.code) || ""));
// Cobros es del coach en su panel: no de la dueña, la administración ni la recepción de un gimnasio.
const fueraDeCobros = () => { const p = State.cloudProfile; return !p || p.role !== "coach" || ["owner", "admin", "recepcion"].includes(rolGym()); };
const alumnos = () => (CB.r && Array.isArray(CB.r.alumnos) ? CB.r.alumnos : []);
const alumno = id => alumnos().find(a => a.id === id) || null;
const datosFicha = id => (CB.fichas[id] || {}).datos || null;
const nombreDe = id => { const a = alumno(id), d = CoachState.coachData; return (a && a.nombre) || (d && d.id === id && d.name) || ""; };
const primero = n => String(n || "").trim().split(/\s+/)[0] || "";
const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
  : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)));
// «05/11» (con el año si no es este), sin esperar a las ayudas: para la tarjeta de la ficha.
const AR = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" });
const dm = ymd => { if (!ymd) return ""; const [y, m, d] = String(ymd).slice(0, 10).split("-"); return d + "/" + m + (y !== AR.format(new Date()).slice(0, 4) ? "/" + y.slice(2) : ""); };
const nombreMes = (ymd, anio) => { const [y, m] = String(ymd || "").split("-").map(Number); return m ? MESES[m - 1] + (anio ? " " + y : "") : ""; };
const mayus = s => s.charAt(0).toUpperCase() + s.slice(1);

// Quien llama ve el texto propio del servidor (P0001) tal cual; sin permiso o sin señal, uno neutro.
function errTexto(e){
  if (e && e.code === "P0001" && e.message) return e.message;
  if (e && e.code === "42501") return "No tenés permiso para hacer esto.";
  return "No se pudo: revisá tu conexión y probá de nuevo.";
}
async function rpc(f, args){
  if (!State.sb) return { error: { code: "red" }, msg: errTexto(null) };
  try {
    const r = await State.sb.rpc(f, args || {});
    return r.error ? { error: r.error, msg: errTexto(r.error) } : { data: r.data };
  } catch (e) { return { error: e, msg: errTexto(e) }; }
}

// ---- Lo que hay en la base ----
// cobros_resumen se pide al dibujar la barra, como mucho una vez por minuto (fuerza: ya, después de
// anotar algo). Si cambia lo que se ve, se redibuja.
export function cargarCobros(fuerza){
  const u = State.cloudUser;
  if (!State.sb || !u || fueraDeCobros()) return;
  if (CB.uid !== u.id){ Object.assign(CB, { uid: u.id, r: undefined, t: 0, pidiendo: false, otraVez: false, sinBase: 0, parte: "alumnos", tab: null, mes: "", meses: {}, fichas: {} }); cerrarModal(); }
  // El profe de un gimnasio sin alumnos propios: sus socios pagan en Cuotas del gimnasio.
  if (esProfeGym() && !propios().length) return;
  const ahora = Date.now();
  if (ahora - CB.sinBase < 600e3) return;
  if (CB.pidiendo){ if (fuerza) CB.otraVez = true; return; }
  if (!fuerza && CB.r !== undefined && ahora - CB.t < 60e3) return;
  CB.pidiendo = true; CB.otraVez = false;
  const uid = u.id, antes = huella();
  Promise.resolve(State.sb.rpc("cobros_resumen")).then(r => {
    if (CB.uid !== uid) return;
    if (r.error){
      if (sinFuncion(r.error)){ CB.sinBase = Date.now(); CB.r = null; }
      else if (CB.r === undefined) CB.r = null;
    } else CB.r = r.data && typeof r.data === "object" ? r.data : null;
  }, () => { if (CB.uid === uid && CB.r === undefined) CB.r = null; }).then(() => {
    if (CB.uid !== uid) return;
    CB.pidiendo = false; CB.t = Date.now();
    if (huella() !== antes) repintar();
    if (CB.otraVez) cargarCobros(true);
  });
}
// Lo que se ve de Cobros (vacío si no se ve): si no cambia, no hace falta redibujar.
const huella = () => cobrosOn() ? JSON.stringify(CB.r) : "";
function repintar(){
  if (fueraDeCobros()) return;
  // No se le saca el foco a quien está escribiendo en el panel: se ve al próximo dibujo.
  const a = document.activeElement;
  if (a && a.closest && a.closest("#coachHost") && a.matches("input, textarea, select")) return;
  renderCoach();
}

// ¿Se ve Cobros? Con la base, el coach al día, el interruptor de esta plataforma prendido y, si es profe
// de un gimnasio, con alumnos propios.
export function cobrosOn(){
  const r = CB.r, u = State.cloudUser;
  if (!r || !r.activo || !u || CB.uid !== u.id || fueraDeCobros() || !cobrosVisibles(r.interruptor)) return false;
  return !esProfeGym() || alumnos().length > 0;
}

// Las ayudas de Cuotas y sus estilos (la primera vez que se abre algo de Cobros).
let H = null, cargandoH = null;
function ayudas(){
  if (H) return Promise.resolve(H);
  if (!cargandoH) cargandoH = Promise.all([import("../gym/cuotas.js"), import("../gym/estado.js"), import("../gym/marco.js"), import("../gym/csv.js"), cssCobros()])
    .then(([cu, es, mc, csv]) => { H = { cu, es, mc, csv }; return H; }, e => { console.error("cobros", e); cargandoH = null; return null; });
  return cargandoH;
}
// Los mismos estilos de Cuotas (el mismo link que cssGym en gimnasio.js, para no cargarlos dos veces).
function cssCobros(){
  if (document.querySelector('link[data-gym-css]')) return Promise.resolve();
  const l = document.createElement("link"); l.rel = "stylesheet"; l.href = "css/screens/gym.css"; l.setAttribute("data-gym-css", "1");
  const listo = new Promise(ok => { l.onload = l.onerror = () => ok(); });
  document.head.appendChild(l);
  return listo;
}
// Algo de Cobros se quiere dibujar y faltan las ayudas: se cargan y se redibuja.
function faltanAyudas(){
  ayudas().then(h => { if (h) repintar(); });
  return '<div class="cal-hint" role="status">Cargando…</div>';
}

// ---- La barra ----
const icoCobros = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/></svg>';
export function botonCobros(active){
  cargarCobros();
  if (!cobrosOn()) return "";
  const on = active === "cobros";
  return '<button class="cv-util-i' + (on ? ' on' : '') + '" data-coach="cobros-ir"' + (on ? ' aria-current="page"' : '') + ' title="Cobros de tus alumnos">' + icoCobros + '<span>Cobros</span></button>';
}

// ---- Inicio: la tira, sin montos ----
export function tarjetaInicio(){
  if (!cobrosOn()) return "";
  const c = CB.r.conteo || {}, v = Number(c.vencida) || 0, pv = Number(c.por_vencer) || 0;
  if (!v && !pv) return "";
  const txt = [v ? v + (v === 1 ? " vencida" : " vencidas") : "", pv ? pv + " por vencer" : ""].filter(Boolean).join(" · ");
  return '<div class="cv-card cv-list cb-tira"><button class="cv-li" data-coach="cobros-ir"><span class="cv-li-n">Cobros</span><span class="cv-li-r">' + txt + '</span><span class="cv-li-go" aria-hidden="true">›</span></button></div>';
}

// ---- La pantalla Cobros ----
const mesActual = () => (H ? H.es.hoyAR().slice(0, 8) + "01" : (CB.r && CB.r.mes) || "");
function stat(titulo, n, sub){
  return '<div class="cv-card cv-stat gy-stat"><div class="cv-stat-l">' + titulo + '</div><div class="cv-stat-n">' + n + '</div><div class="gy-stat-s">' + sub + '</div></div>';
}
const cuotaTxt = c => c ? H.es.plata(c.monto) + ' ' + (POR[c.meses] || "") : '<span class="gy-mut">Sin cuota</span>';
const enTab = (a, tab) => tab === "todos" ? true : tab === "sin_cuota" ? !a.estado : a.estado === tab;
function tabActual(n){
  if (CB.tab) return CB.tab;
  return n.vencida ? "vencida" : n.por_vencer ? "por_vencer" : n.sin_pagos ? "sin_pagos" : "todos";
}
// El recordatorio: el nombre y la fecha, sin montos ni datos para pagar.
function textoRecordatorio(x){
  const n = primero(x.nombre), hola = "Hola" + (n ? " " + n : "") + ", te recuerdo que ";
  if (x.estado === "vencida" && x.vence) return hola + "tu cuota venció el " + H.es.fecha(x.vence) + ". Cualquier cosa avisame.";
  if (x.estado === "por_vencer" && x.vence) return hola + "tu cuota vence el " + H.es.fecha(x.vence) + ". Cualquier cosa avisame.";
  return hola + "tu cuota está pendiente. Cualquier cosa avisame.";
}
const datosRecordatorio = id => { const a = alumno(id), f = datosFicha(id) || {}; return { nombre: nombreDe(id), estado: a ? a.estado : f.estado, vence: a ? a.vence : f.vence }; };
function recordarHtml(id, estado){
  if (!RECORDAR.includes(estado)) return "";
  return '<button class="cv-link" data-coach="cobro-recordar" data-id="' + esc(id) + '">Recordarle</button>' +
    '<a class="cv-link cb-wa" data-coach="cobro-wa" href="' + esc(H.es.waLink(textoRecordatorio(datosRecordatorio(id)))) + '" target="_blank" rel="noopener">Por WhatsApp</a>';
}
function fila(a){
  const id = esc(a.id);
  return '<div class="gy-row gy-row-eq gy-row-cuota" data-coach="cobros-abrir" data-id="' + id + '" tabindex="0" role="row">' +
    '<div class="gy-td gy-td-socio" role="cell">' + avatarHtml(a.avatar_path, coachInitials(a.nombre), 'co-avatar') + '<div class="gy-socio-t"><b>' + esc(a.nombre || "Sin nombre") + '</b></div></div>' +
    '<div class="gy-td" role="cell" data-l="Cuota">' + cuotaTxt(a.cuota) + '</div>' +
    '<div class="gy-td" role="cell" data-l="Vence">' + (a.vence && a.cuota ? H.es.fecha(a.vence) : '<span class="gy-mut">—</span>') + '</div>' +
    '<div class="gy-td" role="cell" data-l="Estado">' + H.cu.estadoCuota(a.estado) + '</div>' +
    '<div class="gy-td gy-td-acc" role="cell">' + (a.cuota ? H.mc.btn2('data-coach="cobro-anotar" data-id="' + id + '"', "Anotar cobro") : H.mc.btn2('data-coach="cobro-cuota" data-id="' + id + '"', "Cargar cuota")) +
      recordarHtml(a.id, a.estado) + '</div>' +
  '</div>';
}
export function vistaCobros(pageHead){
  cargarCobros();
  if (!H) return pageHead("Cobros") + faltanAyudas();
  const { cabeza, btn, btn2, vacio, cargando } = H.mc, R = CB.r;
  const sub = "Lo que te pagan tus alumnos. GIZE no cobra: lo anotás vos cuando te pagan.";
  if (!R || !R.activo) return cabeza("Cobros", "", sub) + cargando();
  const L = alumnos(), primera = CB.parte === "alumnos" && L.length > 0 && L.every(a => !a.cuota);
  const head = cabeza("Cobros", L.length && !primera ? btn2('data-coach="cobros-cargar"', "Cargar cuotas") : "", sub);
  const partes = '<div class="cv-pills gy-tabs" role="tablist" aria-label="Cobros">' + [["alumnos", "Alumnos"], ["mes", "Cobros del mes"]].map(t =>
    '<button class="cv-pill' + (CB.parte === t[0] ? ' on' : '') + '" role="tab" aria-selected="' + (CB.parte === t[0]) + '" data-coach="cobros-parte" data-v="' + t[0] + '">' + t[1] + '</button>').join("") + '</div>';
  if (CB.parte === "mes") return head + partes + parteMes();
  if (!L.length) return head + partes + vacio("Todavía no tenés alumnos vinculados. Cuando se sumen con tu código, acá anotás cuánto te paga cada uno.");
  // La primera vez: qué es y cómo se empieza.
  if (primera) return head + partes + '<div class="cv-card cv-hello cb-primera"><b>Anotá cuánto te paga cada alumno</b><span>GIZE te muestra quién está al día. GIZE no cobra ni hace facturas: lo anotás vos cuando te pagan.</span>' +
    btn('data-coach="cobros-cargar"', "Cargar cuotas") + '</div>';
  const c = R.conteo || {}, plata = H.es.plata, plural = H.es.plural;
  const stats = '<div class="cv-stats gy-stats gy-stats-2">' +
    stat("Cobrado en " + nombreMes(R.mes || mesActual()), plata(R.cobrado), plural(Number(R.cobros_mes) || 0, "cobro", "cobros")) +
    stat("Por cobrar", plata(R.por_cobrar), plural(Number(R.alumnos_por_cobrar) || 0, "alumno", "alumnos") + " este mes") +
  '</div>';
  const n = { vencida: c.vencida, por_vencer: c.por_vencer, sin_pagos: c.sin_pagos, al_dia: c.al_dia, sin_cuota: c.sin_cuota, todos: L.length };
  const tab = tabActual(n);
  const chips = '<div class="gy-filtros-bar gy-est" role="group" aria-label="Estado de la cuota"><span class="gy-est-l">Mostrar</span>' + TABS.map(t =>
    '<button class="gy-chip' + (tab === t[0] ? ' on' : '') + '" aria-pressed="' + (tab === t[0]) + '" data-coach="cobros-tab" data-v="' + t[0] + '">' + t[1] + (n[t[0]] ? ' <span class="gy-n">' + n[t[0]] + '</span>' : '') + '</button>').join("") + '</div>';
  const F = L.filter(a => enTab(a, tab));
  const lista = F.length ? '<div class="cv-card gy-tabla gy-tabla-cuotas" role="table" aria-label="Alumnos y cuotas">' +
      '<div class="gy-row gy-row-eq gy-row-cuota gy-th" role="row"><div role="columnheader">Alumno</div><div role="columnheader">Cuota</div><div role="columnheader">Vence</div><div role="columnheader">Estado</div><div role="columnheader"><span class="cv-sr">Acción</span></div></div>' +
      F.map(fila).join("") + '</div>'
    : vacio(VACIO[tab] || "");
  return head + partes + stats + chips + lista;
}

// ---- Cobros del mes ----
function cargarMes(mes){
  if (!mes || CB.meses[mes]) return;
  CB.meses[mes] = { cargando: true };
  rpc("cobros_mes", { mes }).then(r => {
    CB.meses[mes] = r.error ? { error: r.msg } : { lista: Array.isArray(r.data) ? r.data : [] };
    if (CoachState.coachView === "cobros" && CB.parte === "mes" && !CoachState.coachSel) repintar();
  });
}
function itemMes(p){
  const { plata, fecha } = H.es;
  return '<li class="' + (p.anulado ? 'gy-pago-anulado' : '') + '"><div class="gy-pago-t">' + (p.anulado ? '<s>' : '') + '<b>' + fecha(p.fecha) + ' · ' + esc(p.nombre || "Sin nombre") + ' · ' + plata(p.monto) + '</b>' + (p.anulado ? '</s>' : '') +
    '<span>' + esc(H.cu.MEDIOS[p.medio] || p.medio || "") + ' · cubre hasta el ' + fecha(p.hasta) + (p.ex_alumno ? ' · ya no es tu alumno' : '') + (p.nota ? ' · ' + esc(p.nota) : '') + '</span>' +
    (p.anulado ? '<span class="gy-rojo">Anulado' + (p.motivo ? ': ' + esc(p.motivo) : '') + '</span>' : '') + '</div></li>';
}
function parteMes(){
  const { btn2, vacio, cargando } = H.mc, { plata, plural } = H.es;
  const hoy = mesActual(), mes = CB.mes && CB.mes <= hoy ? CB.mes : hoy;
  cargarMes(mes);
  const nav = '<div class="cb-mes" role="group" aria-label="Elegir el mes"><button class="gy-x cb-mes-b" data-coach="cobros-mes" data-v="-1" aria-label="Mes anterior">‹</button>' +
    '<b>' + mayus(nombreMes(mes, true)) + '</b><button class="gy-x cb-mes-b" data-coach="cobros-mes" data-v="1" aria-label="Mes siguiente"' + (mes >= hoy ? ' disabled' : '') + '>›</button></div>';
  const d = CB.meses[mes];
  if (!d || d.cargando) return nav + cargando("Cargando los cobros…");
  if (d.error) return nav + vacio(esc(d.error), btn2('data-coach="cobros-reintentar"', "Reintentar"));
  const L = d.lista, vivos = L.filter(p => !p.anulado), total = vivos.reduce((s, p) => s + (Number(p.monto) || 0), 0);
  // El CSV, solo en la web: en las apps la descarga no es confiable (se baja desde gize.ar).
  const csv = L.length && !appNativa() ? '<div class="gy-filtros-bar gy-asis-barra">' + btn2('data-coach="cobros-csv"', "Descargar CSV") + '</div>' : '';
  if (!L.length) return nav + vacio("No anotaste cobros en " + nombreMes(mes) + ".");
  return nav + '<p class="gy-p cb-total">Cobrado: <b>' + plata(total) + '</b> · ' + plural(vivos.length, "cobro", "cobros") + '</p>' + csv +
    '<section class="cv-card gy-sec"><ul class="gy-pagos">' + L.map(itemMes).join("") + '</ul></section>';
}

// ---- La tarjeta «Cuota» de la ficha ----
// Solo para sus alumnos propios (los de cobros_resumen) y nunca en modo lectura.
export const conCobro = d => !!(d && d.id && !d.lectura && cobrosOn() && !!alumno(d.id));
export function tileCobro(d){
  const a = alumno(d.id);
  if (!a) return "";
  if (!a.cuota) return "Sin cuota cargada";
  return a.estado === "vencida" ? "Vencida el " + dm(a.vence) : a.estado === "por_vencer" ? "Vence el " + dm(a.vence)
    : a.estado === "al_dia" ? "Al día hasta el " + dm(a.vence) : "Sin cobros anotados";
}
// La cuota y los cobros del alumno (cobros_alumno). Se vuelve a leer pasado un minuto y después de
// anotar o cambiar algo; mientras tanto se ve lo último que se leyó.
function cargarFicha(id){
  const f0 = CB.fichas[id];
  if (f0 && f0.pidiendo){ f0.otraVez = true; return; }
  CB.fichas[id] = Object.assign({}, f0 || {}, { pidiendo: true, otraVez: false });
  rpc("cobros_alumno", { alumno: id }).then(r => {
    const f = CB.fichas[id] || {};
    CB.fichas[id] = r.error ? Object.assign({}, f, { pidiendo: false, otraVez: false, error: r.msg, t: Date.now() }) : { datos: r.data && typeof r.data === "object" ? r.data : {}, t: Date.now() };
    if (f.otraVez) return cargarFicha(id);
    if (CoachState.coachData && CoachState.coachData.id === id && CoachState.coachSec === "cuota") repintar();
  });
}
function itemFicha(p, id){
  const { plata, fecha } = H.es;
  return '<li class="' + (p.anulado ? 'gy-pago-anulado' : '') + '"><div class="gy-pago-t">' + (p.anulado ? '<s>' : '') + '<b>' + fecha(p.fecha) + ' · ' + plata(p.monto) + '</b> · ' + esc(H.cu.MEDIOS[p.medio] || p.medio || "") +
    (p.anulado ? '</s>' : '') + '<span>Cubre hasta el ' + fecha(p.hasta) + (p.nota ? ' · ' + esc(p.nota) : '') + '</span>' +
    (p.anulado ? '<span class="gy-rojo">Anulado' + (p.motivo ? ': ' + esc(p.motivo) : '') + '</span>' : '') + '</div>' +
    (!p.anulado ? '<button class="cv-link gy-peligro" data-coach="cobro-anular" data-id="' + esc(p.id) + '" data-al="' + esc(id) + '">Anular</button>' : '') + '</li>';
}
export function seccionCobro(d){
  if (!H) return faltanAyudas();
  const f = CB.fichas[d.id];
  if (!f || (!f.pidiendo && Date.now() - (f.t || 0) > 60e3)) cargarFicha(d.id);
  if (!f || (!f.datos && !f.error)) return '<div class="cal-hint" role="status">Cargando…</div>';
  if (!f.datos) return '<div class="gy-cartel bad" role="alert"><span>' + esc(f.error) + '</span></div>';
  const { btn, btn2 } = H.mc, x = f.datos, id = esc(d.id), hay = !!x.cuota, nom = primero(d.name) || "tu alumno";
  const cobros = Array.isArray(x.cobros) ? x.cobros : [];
  return '<div class="cv-card gy-sec gy-cuota cb-ficha">' +
    '<div class="gy-kv"><span>Cuota</span><div>' + cuotaTxt(x.cuota) + ' <button class="cv-link" data-coach="cobro-cuota" data-id="' + id + '">' + (hay ? "Cambiar" : "Cargar cuota") + '</button></div></div>' +
    (hay ? '<div class="gy-kv"><span>Vence</span><div>' + (x.vence ? H.es.fecha(x.vence) + ' ' : '') + H.cu.estadoCuota(x.estado) + '</div></div>' +
      '<div class="gy-acc">' + btn('data-coach="cobro-anotar" data-id="' + id + '"', "Anotar cobro") + recordarHtml(d.id, x.estado) + '</div>' : '') +
    '<h3 class="gy-h3">Cobros</h3>' + (cobros.length ? '<ul class="gy-pagos">' + cobros.map(p => itemFicha(p, d.id)).join("") + '</ul>' : '<p class="gy-fino">Todavía no anotaste cobros de ' + esc(nom) + '.</p>') +
    (hay ? '<div class="gy-acc">' + btn2('data-coach="cobro-cuota-sacar" data-id="' + id + '"', "Sacar la cuota") + '</div>' : '') +
    '<p class="gy-fino">GIZE no cobra: lo anotás vos cuando ' + esc(nom) + ' te paga. Un cobro anotado por error se anula y queda tachado.</p></div>';
}

// ---- Ventanas (#cobrosModal) ----
// «Anotar cobro»: { tipo: "cobro", id (alumno), nombre, pid (id del cobro), monto, meses, vence, medio,
//   fecha, hasta, hastaTocado, nota, hecho }.
// «Cargar cuotas»: { tipo: "cuotas", uno (un solo alumno, o null), ids (los tildados), monto, meses,
//   vence, hecho }.
const cabezaModal = t => '<div class="gy-modal-h"><h2 id="cobrosModalT">' + esc(t) + '</h2><button class="gy-x" data-coach="cobro-cerrar" aria-label="Cerrar">✕</button></div>';
// Lo que va a cubrir, como lo calcula el servidor (cobro_registrar): desde el vencimiento si todavía no
// pasó; si no, desde el día que pagó; más los meses de la cuota.
function cubreHasta(m){
  const dia = m.fecha || H.es.hoyAR(), desde = m.vence && m.vence >= dia ? m.vence : dia;
  return H.cu.masMeses(desde, Number(m.meses) || 1);
}
const listoModal = m => m.tipo === "cobro" ? Number(m.monto) > 0 && !!m.hasta && !!m.fecha : Number(m.monto) > 0 && m.ids.length > 0;
function ventanaCobro(m){
  const { btn } = H.mc, { plata, fecha, hoyAR } = H.es, h = cabezaModal("Anotar cobro");
  if (m.hecho) return h + '<div class="gy-ok" role="status">Listo: ' + esc(primero(m.nombre) || "tu alumno") + ' queda al día hasta el ' + fecha(m.hecho.hasta) + '.</div>' +
    '<div class="gy-acc">' + btn('data-coach="cobro-cerrar"', "Listo") + '</div>';
  if (!m.hastaTocado) m.hasta = cubreHasta(m);
  return h +
    '<p class="gy-p"><b>' + esc(m.nombre || "Tu alumno") + '</b><br><span class="gy-fino">' + plata(m.cuota) + ' ' + (POR[m.meses] || "") + (m.vence ? ' · vence el ' + fecha(m.vence) : ' · sin cobros anotados') + '</span></p>' +
    '<div class="gy-form gy-form-pago">' +
      '<label class="gy-f"><span>Monto (en pesos)</span><input class="co-note" type="number" min="1" step="0.01" inputmode="decimal" data-cb="monto" value="' + esc(m.monto) + '"></label>' +
      '<label class="gy-f"><span>Fecha del cobro</span><input class="co-note" type="date" data-cb="fecha" max="' + hoyAR() + '" value="' + esc(m.fecha) + '"></label>' +
      '<label class="gy-f"><span>Cubre hasta</span><input class="co-note" type="date" data-cb="hasta" value="' + esc(m.hasta) + '"></label>' +
    '</div>' +
    '<div class="gy-radios gy-medios" role="radiogroup" aria-label="Cómo te pagó">' + ORDEN_MEDIOS.map(k =>
      '<label class="gy-radio' + (m.medio === k ? ' on' : '') + '"><input type="radio" name="cbMedio" value="' + k + '" data-cb="medio"' + (m.medio === k ? ' checked' : '') + '><b>' + H.cu.MEDIOS[k] + '</b></label>').join("") + '</div>' +
    '<label class="gy-f gy-f-nota"><span>Nota (opcional)</span><input class="co-note" type="text" maxlength="200" data-cb="nota" value="' + esc(m.nota) + '" placeholder="Por ejemplo: con descuento"></label>' +
    '<p class="gy-fino">Queda en la ficha de ' + esc(primero(m.nombre) || "tu alumno") + '. GIZE no cobra: solo lo anota.</p>' +
    '<div class="gy-acc">' + btn('data-coach="cobro-ok"' + (listoModal(m) && !CB.busy ? '' : ' disabled'), CB.busy === "cobro" ? "Anotando…" : "Anotar cobro") + '</div>';
}
function ventanaCuotas(m){
  const { btn } = H.mc, { plata, hoyAR } = H.es, L = alumnos();
  const t = m.uno ? "Cuota de " + (primero(nombreDe(m.uno)) || "tu alumno") : "Cargar cuotas", h = cabezaModal(t);
  if (m.hecho) return h + '<div class="gy-ok" role="status">' + esc(m.hecho) + '</div><div class="gy-acc">' + btn('data-coach="cobro-cerrar"', "Listo") + '</div>';
  const hoy = hoyAR(), min = H.cu.masMeses(hoy, -12), max = H.cu.masMeses(hoy, 13);
  const todos = L.length > 0 && L.every(a => m.ids.includes(a.id));
  const quienes = m.uno ? '' : '<fieldset class="cb-quienes"><legend>A quiénes</legend>' +
    '<label class="cb-al cb-todos"><input type="checkbox" data-cb="todos"' + (todos ? ' checked' : '') + '><span>Elegir todos</span></label>' +
    '<ul class="cb-lista">' + L.map(a => '<li><label class="cb-al"><input type="checkbox" data-cb="al" value="' + esc(a.id) + '"' + (m.ids.includes(a.id) ? ' checked' : '') + '><span>' + esc(a.nombre || "Sin nombre") + '</span>' +
      '<small>' + (a.cuota ? plata(a.cuota.monto) + ' ' + (POR[a.cuota.meses] || "") : 'sin cuota') + '</small></label></li>').join("") + '</ul></fieldset>';
  return h +
    '<div class="gy-form">' +
      '<label class="gy-f"><span>Monto (en pesos)</span><input class="co-note" type="number" min="1" step="0.01" inputmode="decimal" data-cb="monto" value="' + esc(m.monto) + '"></label>' +
      '<label class="gy-f"><span>Cada cuánto</span><select class="gy-sel" data-cb="meses">' + Object.entries(H.cu.CADA).map(([k, x]) => '<option value="' + k + '"' + (String(m.meses) === k ? ' selected' : '') + '>' + x + '</option>').join("") + '</select></label>' +
    '</div>' + quienes +
    '<label class="gy-f cb-vence"><span>' + (m.uno ? 'Ya está al día hasta… (opcional)' : 'Ya están al día hasta… (opcional)') + '</span><input class="co-note" type="date" data-cb="vence" min="' + min + '" max="' + max + '" value="' + esc(m.vence) + '"></label>' +
    '<p class="gy-fino">Si ' + (m.uno ? 'ya te pagó' : 'ya te pagaron') + ' antes de usar Cobros, poné hasta cuándo. Cambiar el monto no toca los cobros que ya anotaste.</p>' +
    '<div class="gy-acc">' + btn('data-coach="cobro-cuotas-ok"' + (listoModal(m) && !CB.busy ? '' : ' disabled'), CB.busy === "cuotas" ? "Guardando…" : "Guardar") + '</div>';
}
// El foco no se pierde cuando la ventana se redibuja.
function guardarFoco(){
  const a = document.activeElement;
  if (!a || !a.closest || !a.closest("#cobrosModal") || !a.dataset || !a.dataset.cb) return null;
  return { sel: '[data-cb="' + a.dataset.cb + '"]' + (a.type === "radio" || a.type === "checkbox" ? '[value="' + a.value + '"]' : ''), ini: a.selectionStart, fin: a.selectionEnd };
}
function pintarModal(){
  let h = document.getElementById("cobrosModal");
  const m = CB.modal;
  if (!m || !H){ if (h) h.remove(); return; }
  const foco = guardarFoco();
  if (!h){ h = document.createElement("div"); h.id = "cobrosModal"; h.className = "gy-capa"; document.body.appendChild(h); }
  h.innerHTML = '<div class="gy-modal-bg" data-coach="cobro-cerrar"></div><div class="gy-modal" role="dialog" aria-modal="true" aria-labelledby="cobrosModalT">' + (m.tipo === "cobro" ? ventanaCobro(m) : ventanaCuotas(m)) + '</div>';
  const el = foco && h.querySelector(foco.sel);
  if (el){ el.focus({ preventScroll: true }); try { if (foco.ini != null) el.setSelectionRange(foco.ini, foco.fin); } catch (e) {} return; }
  if (h.contains(document.activeElement)) return;
  const p = h.querySelector(m.hecho ? '.gy-acc button' : 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, .gy-x');
  if (p) p.focus({ preventScroll: true });
}
// Al cerrar, el foco vuelve a lo que abrió la ventana (o al mismo botón, si el panel se redibujó).
let volver = null;
function abrir(m){
  if (!CB.modal){ const a = document.activeElement; volver = a && a !== document.body && !a.closest("#cobrosModal") ? { el: a, sel: a.dataset && a.dataset.coach ? '[data-coach="' + a.dataset.coach + '"]' + (a.dataset.id ? '[data-id="' + a.dataset.id + '"]' : '') : "" } : null; }
  CB.modal = m; CB.busy = ""; pintarModal();
}
function cerrarModal(){
  if (!CB.modal && !document.getElementById("cobrosModal")) return;
  CB.modal = null; pintarModal();
  const v = volver; volver = null;
  if (v) queueMicrotask(() => { const el = v.el.isConnected ? v.el : (v.sel && document.querySelector("#coachHost " + v.sel)); if (el) el.focus({ preventScroll: true }); });
}
function habilitar(){
  const m = CB.modal, b = document.querySelector('#cobrosModal [data-coach="cobro-ok"], #cobrosModal [data-coach="cobro-cuotas-ok"]');
  if (m && b) b.disabled = !listoModal(m) || !!CB.busy;
}
// Una acción a la vez (dos toques no mandan dos).
function ocupado(k, fn){
  return async () => {
    if (CB.busy) return;
    CB.busy = k; pintarModal();
    try { await fn(); } finally { CB.busy = ""; pintarModal(); }
  };
}

// Después de anotar o cambiar algo: el resumen, el mes y la ficha (si ya se había leído), de nuevo.
function despues(id){
  CB.meses = {};
  if (!id) CB.fichas = {};
  else if (CB.fichas[id]) cargarFicha(id);
  cargarCobros(true);
}

async function abrirCobro(id){
  if (!await ayudas()) return;
  const a = alumno(id), f = datosFicha(id), c = (f && f.cuota) || (a && a.cuota);
  if (!c) return abrirCuotas(id);
  abrir({ tipo: "cobro", id, nombre: nombreDe(id), pid: uuid(), monto: String(c.monto), cuota: c.monto, meses: Number(c.meses) || 1,
    vence: (f ? f.vence : a && a.vence) || null, medio: "transferencia", fecha: H.es.hoyAR(), hasta: "", hastaTocado: false, nota: "", hecho: null });
}
const anotar = ocupado("cobro", async () => {
  const m = CB.modal; if (!m || m.tipo !== "cobro" || m.hecho || !listoModal(m)) return;
  const r = await rpc("cobro_registrar", { id: m.pid, alumno: m.id, monto: Number(m.monto), medio: m.medio, fecha: m.fecha || null,
    hasta: m.hastaTocado ? (m.hasta || null) : null, nota: (m.nota || "").trim() || null });
  if (r.error){ alert(r.msg); return; }
  m.hecho = r.data && r.data.hasta ? r.data : { hasta: m.hasta };
  despues(m.id);
});
async function abrirCuotas(uno){
  if (!await ayudas()) return;
  const a = uno ? alumno(uno) : null, f = uno ? datosFicha(uno) : null, c = (a && a.cuota) || (f && f.cuota) || null;
  abrir({ tipo: "cuotas", uno: uno || null, ids: uno ? [uno] : alumnos().filter(x => !x.cuota).map(x => x.id),
    monto: c ? String(c.monto) : "", meses: String(c ? c.meses : 1), vence: "", hecho: "" });
}
const guardarCuotas = ocupado("cuotas", async () => {
  const m = CB.modal; if (!m || m.tipo !== "cuotas" || m.hecho || !listoModal(m)) return;
  const r = await rpc("cobro_cuota_guardar", { alumnos: m.ids.slice(), monto: Number(m.monto), meses: Number(m.meses) || 1, vence: m.vence || null });
  if (r.error){ alert(r.msg); return; }
  const n = Number(r.data && r.data.ok) || m.ids.length;
  m.hecho = m.uno ? "Listo: la cuota de " + (primero(nombreDe(m.uno)) || "tu alumno") + " quedó guardada." : "Listo: " + H.es.plural(n, "alumno quedó", "alumnos quedaron") + " con su cuota.";
  despues(m.uno);
});
async function sacar(id){
  const nom = primero(nombreDe(id)) || "este alumno";
  if (!await confirmar("¿Sacarle la cuota a " + nom + "?\n\nDeja de contar en Cobros. Los cobros que ya anotaste quedan en su historial.", { ok: "Sacar la cuota", peligro: true })) return;
  const r = await rpc("cobro_cuota_guardar", { alumnos: [id], monto: null, meses: null, vence: null });
  if (r.error) return alert(r.msg);
  despues(id);
}
async function anular(pid, al){
  const mot = await pedir("¿Anular este cobro? Queda en el historial, tachado, y si era el último la cuota vuelve a vencer cuando vencía antes.\n\nMotivo (opcional):", "", { titulo: "Anular el cobro", ok: "Anular", peligro: true });
  if (mot === null) return;
  const r = await rpc("cobro_anular", { id: pid, motivo: (mot || "").trim() || null });
  if (r.error) return alert(r.msg);
  despues(al);
}
async function recordar(id){
  if (!id || !State.cloudUser || !await ayudas()) return;
  const x = datosRecordatorio(id);
  openChat({ clientId: id, coachId: State.cloudUser.id, name: x.nombre || "Alumno", role: "coach", draft: textoRecordatorio(x) });
}
async function bajarCsv(b){
  if (appNativa() || !await ayudas()) return;
  const mes = CB.mes || mesActual();
  b.disabled = true;
  const r = await rpc("cobros_mes", { mes });
  b.disabled = false;
  if (r.error) return alert(r.msg);
  const L = Array.isArray(r.data) ? r.data : [];
  H.csv.descargar("cobros-" + mes.slice(0, 7) + ".csv", H.csv.aCsv(L.map(p => ({ fecha: p.fecha, alumno: p.nombre || "", monto: p.monto, medio: H.cu.MEDIOS[p.medio] || p.medio || "",
    cubre_desde: p.desde, cubre_hasta: p.hasta, nota: p.nota || "", anulado: !!p.anulado, motivo: p.motivo || "", ex_alumno: !!p.ex_alumno })),
    ["fecha", "alumno", "monto", "medio", "cubre_desde", "cubre_hasta", "nota", "anulado", "motivo", "ex_alumno"]));
}
// Tocar una fila: la ficha del alumno, abierta en «Cuota».
function abrirFicha(id){
  if (!id) return;
  CoachState.coachAssign = false; CoachState.coachClientTab = "ficha"; CoachState.coachSec = "cuota"; CoachState.coachPlanSec = null;
  openClient(id);
}
async function irACobros(){
  if (!cobrosOn()) return;
  const sin = (CoachState.coachSel && clientUnsaved()) || (tplDirty() && "la rutina") || (CoachState.coachMealEdit && mealDirty() && "el plan alimenticio")
    || (CoachState.coachView === "settings" && qDirty() && "las preguntas") || "";
  if (sin && !await confirmar("Tenés cambios sin guardar en " + sin + ". ¿Salir igual y perderlos?")) return;
  if (CoachState.coachSel && routineDirty()){ dropRoutineDraft(CoachState.coachData.id); CoachState.coachData.routineOrig = JSON.stringify(CoachState.coachData.routine || []); }
  if (CoachState.coachView === "settings"){ CoachState.coachQEdit = null; CoachState.coachNameForm = null; CoachState.coachBackView = "cobros"; }
  CoachState.coachView = "cobros"; CoachState.coachSel = null; CoachState.coachData = null; CoachState.coachTplEdit = null; CoachState.coachMealEdit = null;
  CoachState.coachAssign = false; CoachState.coachSec = null; CoachState.coachPlanSec = null;
  CB.tab = null;
  renderCoach(); window.scrollTo(0, 0);
  cargarCobros(true);
}

// ---- Acciones (data-coach; main.js no las conoce) ----
const ACC = /^(cobros-(ir|parte|tab|mes|cargar|csv|abrir|reintentar)|cobro-(anotar|ok|anular|recordar|cuota|cuota-sacar|cuotas-ok|cerrar))$/;
try {
  document.addEventListener("click", async e => {
    const b = e.target.closest && e.target.closest("[data-coach]");
    if (!b || b.disabled || !ACC.test(b.dataset.coach) || fueraDeCobros()) return;
    const a = b.dataset.coach, id = b.dataset.id || "";
    if (a === "cobro-cerrar") return cerrarModal();
    if (a === "cobros-ir") return irACobros();
    if (!cobrosOn()) return;
    if (a === "cobros-parte"){ CB.parte = b.dataset.v === "mes" ? "mes" : "alumnos"; renderCoach(); return; }
    if (a === "cobros-tab"){ CB.tab = b.dataset.v || null; renderCoach(); return; }
    if (a === "cobros-mes"){
      const hoy = mesActual(), mes = H.cu.masMeses(CB.mes || hoy, Number(b.dataset.v) || 0);
      CB.mes = mes > hoy ? hoy : mes; renderCoach(); return;
    }
    if (a === "cobros-reintentar"){ CB.meses = {}; renderCoach(); return; }
    if (a === "cobros-abrir") return abrirFicha(id);
    if (a === "cobros-cargar") return abrirCuotas(null);
    if (a === "cobro-cuota") return abrirCuotas(id);
    if (a === "cobro-anotar") return abrirCobro(id);
    if (a === "cobro-ok") return anotar();
    if (a === "cobro-cuotas-ok") return guardarCuotas();
    if (a === "cobro-recordar") return recordar(id);
    if (a === "cobro-anular") return anular(id, b.dataset.al || "");
    if (a === "cobro-cuota-sacar") return sacar(id);
    if (a === "cobros-csv") return bajarCsv(b);
  });
  // Lo que se escribe en las ventanas queda en CB.modal (sin redibujar: no se pierde el foco).
  document.addEventListener("input", e => {
    const t = e.target, m = CB.modal;
    if (!m || !t.closest || !t.closest("#cobrosModal") || !t.dataset.cb) return;
    const k = t.dataset.cb;
    if (m.tipo === "cobro" && ["monto", "fecha", "hasta", "nota"].includes(k)){
      m[k] = t.value;
      if (k === "hasta") m.hastaTocado = true;
      // Otra fecha del cobro: «Cubre hasta» se vuelve a calcular (si no lo cambió a mano).
      if (k === "fecha" && !m.hastaTocado){ m.hasta = cubreHasta(m); const i = document.querySelector('#cobrosModal [data-cb="hasta"]'); if (i) i.value = m.hasta; }
    } else if (m.tipo === "cuotas" && ["monto", "vence"].includes(k)) m[k] = t.value;
    habilitar();
  });
  document.addEventListener("change", e => {
    const t = e.target, m = CB.modal;
    if (!m || !t.closest || !t.closest("#cobrosModal") || !t.dataset.cb) return;
    const k = t.dataset.cb;
    if (k === "medio" && m.tipo === "cobro"){ m.medio = t.value; document.querySelectorAll('#cobrosModal .gy-radio').forEach(l => l.classList.toggle("on", !!l.querySelector('input:checked'))); return; }
    if (k === "meses" && m.tipo === "cuotas"){ m.meses = t.value; return; }
    if (k === "al" && m.tipo === "cuotas"){ m.ids = m.ids.filter(x => x !== t.value).concat(t.checked ? [t.value] : []); pintarModal(); return; }
    if (k === "todos" && m.tipo === "cuotas"){ m.ids = t.checked ? alumnos().map(a => a.id) : []; pintarModal(); }
  });
  document.addEventListener("keydown", e => {
    if (CB.modal && !document.querySelector(".av-bg")){
      if (e.key === "Escape"){ e.preventDefault(); cerrarModal(); return; }
      // Tab da la vuelta adentro de la ventana (no se va al panel de atrás), como los avisos.
      const caja = document.querySelector("#cobrosModal .gy-modal");
      if (e.key === "Tab" && caja){ e.preventDefault(); circular(caja, 'a[href], button:not([disabled]), input:not([disabled]), select, textarea', e.shiftKey); return; }
    }
    if (e.key === "Enter" && e.target.matches && e.target.matches('#coachHost .gy-row[data-coach="cobros-abrir"]')){ e.preventDefault(); abrirFicha(e.target.dataset.id); }
  });
} catch (e) {}

// Para las pruebas y para depurar.
export { CB };
