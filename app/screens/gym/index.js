// Panel del gimnasio (etapa 1, web; anda en el celular): el estado, qué pantalla se dibuja y las
// acciones (data-gym="…"). Se carga con import() solo para el equipo de un gimnasio o con un link del
// gimnasio (core/gimnasio.js cargarPanelGym); para cualquier otra cuenta este archivo ni se pide.
//
// Dibuja en #coachHost, con el marco del panel de coach (marco.js). Cuando el dueño o la
// administración abren algo del panel de coach (sus rutinas, sus planes, «Mi cuenta», la ficha de
// entrenamiento de un socio), GS.view = "coach" y lo dibuja renderCoach() como siempre, adentro del
// mismo marco (usarMarco); al volver de ahí, se vuelve a la pantalla del gimnasio de antes.
import { State } from '../../core/state.js';
import { esc } from '../../core/utils.js';
import { showSilkBg, lucesCoach } from '../../ui/background.js';
import { resolveAvatars } from '../../core/avatar.js';
import { cropAvatar } from '../../ui/recorte.js';
import { circular } from '../../ui/avisos.js';
import { Gym, rolGym, esPanelGym, linkCrear, linkEquipo, olvidarLinks, releerGym, redibujar } from '../../core/gimnasio.js';
import { CoachState } from '../coach/state.js';
import { usarMarco } from '../coach/panel.js';
import { renderCoach, clientUnsaved, tplDirty } from '../coach/index.js';
import { openClient } from '../coach/clientes.js';
import { GS, rpc, info, gym, yo, esDueno, enApp, pedirFotos, copiar, plural, primerNombre, hoyAR, APP_URL, fecha } from './estado.js';
import { marcoGym, hojaMas, cabeza, btn, btn2, vacio } from './marco.js';
import { renderInicio } from './inicio.js';
import { renderSocios, ventanaSumar, profesDelEquipo } from './socios.js';
import { fotosDeSolicitudes, solElegido, renderSolicitudes } from './solicitudes.js';
import { renderFicha, fotosDeFicha, sinCambiarProfe } from './ficha.js';
import { renderEquipo, renderAceptar, ventanaInvitar, ventanaQuitar } from './equipo.js';
import { renderConfig, ventanaQr } from './config.js';
import { renderPlan, cambiarPlan, tituloPlan } from './plan.js';
import { renderCrear } from './crear.js';
import { VERSIONES, rolNombre } from './textos.js';
import { exportar, exportarTodo, aCsv, descargar } from './csv.js';
import { pintarQrs } from './qr.js';
import { renderRecepcion, alRepintar, alRegistrar, fotoNueva, limpiar as limpiarRecepcion } from './recepcion.js';
import { renderAsistencia, exportarIngresos, ventanaIngreso } from './asistencia.js';

let iniciado = false, dibujado = false, primeraCarga = false;

export function iniciarGym(){
  if (iniciado) return;
  iniciado = true;
  // Los estilos del panel, solo para quien lo usa (para el resto la página no cambia).
  if (!document.querySelector('link[data-gym-css]')){
    const l = document.createElement("link"); l.rel = "stylesheet"; l.href = "css/screens/gym.css"; l.setAttribute("data-gym-css", "1");
    document.head.appendChild(l);
  }
  document.addEventListener("click", alTocarAntes, true);
  document.body.addEventListener("click", alTocar);
  document.body.addEventListener("input", alEscribir);
  document.body.addEventListener("change", alCambiar);
  document.addEventListener("keydown", alTeclado);
  Gym.ui = { pintar, coach: renderCoach, sinPlan };
  // La recepción (recepcion.js) se redibuja sola mientras se busca; cuando llega una foto o se registra
  // un ingreso, la pantalla que la muestra (y Asistencia, con la lista del día).
  alRepintar(() => { repintar(); pintarModal(); });
  alRegistrar(() => { if (GS.view === "asistencia" || (GS.modal && GS.modal.tipo === "ingreso")) cargarIngresos(); if (rolGym() !== "recepcion") releerGym().then(repintar); });
}

// ---- Qué se dibuja ----
function modo(){
  if (linkEquipo()) return "aceptar";
  if (esPanelGym()){ if (linkCrear()) olvidarLinks("crear"); return rolGym() === "recepcion" ? "recepcion" : "panel"; }
  if (linkCrear()) return "crear";
  return null;
}
// ¿Hay algo del panel de coach abierto adentro del marco?
const coachAdentro = () => !!(CoachState.coachSel || CoachState.coachTplEdit || CoachState.coachMealEdit || ["clients", "tpls", "meals", "settings"].includes(CoachState.coachView));
function soltarCoach(){
  CoachState.coachSel = null; CoachState.coachData = null; CoachState.coachLectura = null; CoachState.coachTplEdit = null; CoachState.coachMealEdit = null;
  CoachState.coachView = "home";
}

function pintar(){
  const host = document.getElementById("coachHost"); if (!host) return false;
  const m = modo();
  if (!m){
    usarMarco(null);
    if (dibujado){ dibujado = false; GS.modal = null; pintarModal(); host.innerHTML = ""; host.style.display = ""; document.body.classList.remove("silk-coach", "gy-on"); }
    return false;
  }
  if (m === "panel"){
    usarMarco(marcoGym);
    if (!primeraCarga){ primeraCarga = true; queueMicrotask(cargarVista); }
    if (GS.view === "coach"){
      if (coachAdentro()){ dibujado = true; document.body.classList.add("gy-on"); return "coach"; }
      GS.view = GS.vuelta || "inicio"; GS.vuelta = null; cargarVista();
    }
  } else usarMarco(null);
  const foco = guardarFoco();
  host.style.display = "block";
  const v = document.getElementById("view"); if (v && v.firstChild) v.innerHTML = "";
  showSilkBg(); document.body.classList.add("silk-coach", "gy-on"); lucesCoach();
  host.innerHTML = m === "aceptar" ? renderAceptar() : m === "crear" ? renderCrear() : m === "recepcion" ? renderRecepcionSola() : marcoGym(GS.view === "ficha" ? "socios" : GS.view, vista());
  restaurarFoco(foco);
  pintarQrs(); pintarModal();
  dibujado = true;
  if (m === "aceptar" && !GS.aceptar) cargarAceptar();
  return true;
}
// Si el panel estaba dibujado y ya no corresponde (mi_gimnasio dice que la sacaron del equipo o que
// el gimnasio cerró), pintar() lo limpia y acá se vuelve a la app de siempre (renderCoach o
// renderApp, por core/gimnasio.js): si no, quedaba la pantalla en blanco hasta recargar.
const repintar = () => {
  if (!dibujado && !modo()) return;
  const antes = dibujado, r = pintar();
  if (r === "coach") renderCoach();
  else if (!r && antes && !dibujado) redibujar();
};

function vista(){
  switch (GS.view){
    case "socios": return renderSocios();
    case "ficha": return renderFicha();
    case "profes": return renderEquipo();
    case "config": return renderConfig();
    case "plan": return renderPlan();
    case "asistencia": return renderAsistencia();
    case "recepcion": return cabeza("Recepción", btn2('data-gym="ir" data-v="asistencia"', "Ingresos de hoy"), "Buscá por nombre o DNI, mirá la foto y registrá el ingreso.") + renderRecepcion({ altas: true });
    default: return renderInicio();
  }
}
// Lo del panel de coach adentro del marco, con el plan del gimnasio vencido (core/gimnasio.js
// sinPlanGym): activo o en gracia, sigue (""); si no, un cartel que lleva al plan (en las apps, sin
// hablar de planes ni pagos).
function sinPlan(){
  const pl = info().plan || {};
  if (!pl.estado || pl.estado === "activo" || pl.estado === "gracia") return "";
  // «Mi cuenta» sigue (perfil, avisos, cerrar sesión, eliminar la cuenta).
  if (CoachState.coachView === "settings" && !CoachState.coachSel && !CoachState.coachTplEdit && !CoachState.coachMealEdit) return "";
  const t = enApp() ? "El acceso de GIZE del gimnasio está pausado: tus rutinas, tus planes y las fichas de entrenamiento vuelven cuando esté activo de nuevo."
    : "El plan de GIZE del gimnasio venció: tus rutinas, tus planes y las fichas de entrenamiento vuelven cuando se renueve.";
  return marcoGym(CoachState.coachSel ? "clients" : CoachState.coachView,
    cabeza(tituloPlan()) + '<div class="cv-card gy-vacio"><p>' + esc(t) + '</p>' + (esDueno() ? "" : '<p class="gy-fino">El plan lo maneja el dueño del gimnasio.</p>') +
    '<div class="gy-acc">' + btn('data-gym="ir" data-v="plan"', enApp() ? "Ver el acceso" : "Ver el plan") + '</div></div>');
}
// La cuenta de recepción entra directo acá (SPEC §2.10): la recepción básica y, si el gimnasio la deja
// aprobar y cargar fichas, la pestaña Solicitudes. Se sale cerrando la sesión.
const altasRecepcion = () => !!(info().settings || {}).recepcion_altas;
function renderRecepcionSola(){
  const altas = altasRecepcion(), tab = altas && GS.recTab === "solicitudes" ? "solicitudes" : "recepcion";
  const tabs = altas ? '<div class="cv-pills gy-tabs" role="tablist">' + [["recepcion", "Recepción"], ["solicitudes", "Solicitudes"]].map(t =>
    '<button class="cv-pill' + (tab === t[0] ? ' on' : '') + '" role="tab" aria-selected="' + (tab === t[0]) + '" data-gym="rec-tab" data-v="' + t[0] + '">' + t[1] + '</button>').join("") + '</div>' : '';
  return '<div class="gy-solo gy-solo-rec"><div class="gy-solo-top"><div class="co-brand cv-brand"><img class="brand-logo" src="brand/logo/gize-firma-horizontal.svg" alt="GIZE"></div>' +
    btn2('data-auth="logout"', "Cerrar sesión") + '</div>' +
    '<div class="gy-solo-ancho"><h1 class="gy-solo-t">Recepción de ' + esc(gym().name || "tu gimnasio") + '</h1>' + tabs +
    (tab === "solicitudes" ? renderSolicitudes() : renderRecepcion({ altas, solicitudes: "rec-tab" })) + '</div></div>';
}

// El foco y lo escrito sobreviven a un redibujo (la app redibuja seguido).
function guardarFoco(){
  const a = document.activeElement; if (!a || !a.closest || !a.closest("#coachHost, #gymModal")) return null;
  const k = ["data-gym-in", "data-gym-f", "data-gym-ff", "data-gym-cfg", "data-gym-cr", "data-gym-nota", "data-gym-sol", "data-rec-q"].find(x => a.hasAttribute(x));
  if (!k) return null;
  return { sel: "[" + k + '="' + a.getAttribute(k) + '"]' + (a.dataset.id ? '[data-id="' + a.dataset.id + '"]' : ""), ini: a.selectionStart, fin: a.selectionEnd };
}
function restaurarFoco(f){
  if (!f) return;
  const el = document.querySelector(f.sel); if (!el) return;
  el.focus({ preventScroll: true });
  try { if (f.ini != null) el.setSelectionRange(f.ini, f.fin); } catch (e) {}
}

// ---- Ventanas (#gymModal) ----
function pintarModal(){
  let h = document.getElementById("gymModal");
  const m = GS.modal;
  if (!m){ if (h) h.remove(); return; }
  if (!h){ h = document.createElement("div"); h.id = "gymModal"; document.body.appendChild(h); }
  const foco = guardarFoco();
  if (m.tipo === "mas"){ h.className = "gy-capa"; h.innerHTML = hojaMas(); return; }
  const cuerpo = m.tipo === "sumar" ? ventanaSumar(m) : m.tipo === "invitar" ? ventanaInvitar(m) : m.tipo === "quitar" ? ventanaQuitar(m) : m.tipo === "qr" ? ventanaQr()
    : m.tipo === "asignar" ? ventanaAsignar(m) : m.tipo === "pausar" ? ventanaPausar(m) : m.tipo === "link" ? ventanaLink(m)
    : m.tipo === "ingreso" ? ventanaIngreso(renderRecepcion({ compacto: true })) : "";
  h.className = "gy-capa";
  h.innerHTML = '<div class="gy-modal-bg" data-gym="cerrar"></div><div class="gy-modal" role="dialog" aria-modal="true">' + cuerpo + '</div>';
  // El nombre de la ventana para los lectores de pantalla: su título.
  const t = h.querySelector(".gy-modal h2"); if (t){ t.id = "gymModalT"; h.querySelector(".gy-modal").setAttribute("aria-labelledby", "gymModalT"); }
  restaurarFoco(foco);
  pintarQrs();
  if (!foco){ const p = h.querySelector("input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, .gy-x"); if (p) p.focus({ preventScroll: true }); }
}
// Al cerrar, el foco vuelve a lo que abrió la ventana (o al mismo botón, si el panel se redibujó).
let volver = null;
const FOCO = 'a[href], button, input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';
function selDe(el){
  if (!el || !el.dataset || !el.dataset.gym) return "";
  return '[data-gym="' + el.dataset.gym + '"]' + (el.dataset.v ? '[data-v="' + el.dataset.v + '"]' : "") + (el.dataset.id ? '[data-id="' + el.dataset.id + '"]' : "");
}
function abrir(m){
  if (!GS.modal){ const a = document.activeElement; volver = a && a !== document.body && !a.closest("#gymModal") ? { el: a, sel: selDe(a) } : null; }
  GS.modal = m; pintarModal();
}
function cerrarModal(){
  GS.modal = null; pintarModal();
  const v = volver; volver = null;
  if (v) queueMicrotask(() => { const el = v.el.isConnected ? v.el : (v.sel && document.querySelector("#coachHost " + v.sel)); if (el) el.focus({ preventScroll: true }); });
}

const MOTIVO = { falta_confirmacion: "no confirmó lo que ve el gimnasio", coach_externo: "tiene un coach de afuera del gimnasio", bloqueo: "no se le puede asignar ese profe",
  no_es_profe: "ese profe no puede tener socios", sin_app: "todavía no usa la app", no_activa: "no está activo" };
function ventanaAsignar(m){
  const profes = profesDelEquipo();
  if (m.resultado){
    const r = m.resultado, nom = id => { const s = (GS.socios || []).find(x => x.id === id); return s ? s.nombre : "Un socio"; };
    return '<div class="gy-modal-h"><h2>Asignar profe</h2><button class="gy-x" data-gym="cerrar" aria-label="Cerrar">✕</button></div>' +
      '<div class="gy-ok" role="status">' + (r.ok.length ? 'Listo: ' + plural(r.ok.length, "socio", "socios") + ' con su profe nuevo.' : 'No se cambió ningún profe.') + '</div>' +
      (r.saltadas.length ? '<p class="gy-p">' + plural(r.saltadas.length, "quedó igual", "quedaron igual") + ':</p><ul class="gy-ul">' + r.saltadas.map(x => '<li><b>' + esc(nom(x.id)) + '</b>: ' + esc(MOTIVO[x.motivo] || x.motivo) + '.</li>').join("") + '</ul>' : '') +
      '<div class="gy-acc">' + btn('data-gym="cerrar"', "Listo") + '</div>';
  }
  return '<div class="gy-modal-h"><h2>' + (m.ids.length === 1 ? "Cambiar el profe" : "Asignar profe a " + plural(m.ids.length, "socio", "socios")) + '</h2><button class="gy-x" data-gym="cerrar" aria-label="Cerrar">✕</button></div>' +
    '<div class="gy-radios" role="radiogroup" aria-label="Profe">' + profes.map(p => '<label class="gy-radio' + (m.a === p.user_id ? ' on' : '') + '"><input type="radio" name="gyP" value="' + esc(p.user_id) + '" data-gym-in="asignar-a"' + (m.a === p.user_id ? ' checked' : '') + '><b>' + esc(p.nombre) + '</b><span>' + plural(p.socios || 0, "socio", "socios") + '</span></label>').join("") +
    '<label class="gy-radio' + (m.a === null ? ' on' : '') + '"><input type="radio" name="gyP" value="" data-gym-in="asignar-a"' + (m.a === null ? ' checked' : '') + '><b>Sin profe</b><span>Queda en el gimnasio sin profe.</span></label></div>' +
    '<p class="gy-fino">El socio recibe un aviso. Las rutinas programadas pasan al profe nuevo. Los que no confirmaron lo que ve el gimnasio o tienen un coach de afuera quedan igual (te decimos cuáles).</p>' +
    '<div class="gy-acc">' + btn('data-gym="asignar-ok"' + (m.a === undefined || GS.busy ? ' disabled' : ''), GS.busy === "asignar" ? "Guardando…" : "Asignar") + '</div>';
}
function ventanaPausar(m){
  const max = new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10);
  return '<div class="gy-modal-h"><h2>Pausar ' + (m.ids.length === 1 ? "al socio" : plural(m.ids.length, "socio", "socios")) + '</h2><button class="gy-x" data-gym="cerrar" aria-label="Cerrar">✕</button></div>' +
    '<p class="gy-p">Sigue en el gimnasio (ocupa su lugar) y vuelve a estar activo solo ese día.</p>' +
    '<label class="gy-f"><span>Hasta el</span><input class="co-note" type="date" data-gym-in="pausa-hasta" min="' + hoyAR() + '" max="' + max + '" value="' + esc(m.hasta || "") + '"></label>' +
    '<div class="gy-acc">' + btn('data-gym="pausar-ok"' + (m.hasta && !GS.busy ? '' : ' disabled'), GS.busy === "pausar" ? "Pausando…" : "Pausar") + '</div>';
}
function ventanaLink(m){
  const url = APP_URL + "#unirme=" + m.token, s = (GS.socios || []).find(x => x.id === m.id) || {};
  const txt = "Hola " + primerNombre(s.nombre) + "! Para usar la app GIZE de " + (gym().name || "el gimnasio") + ", abrí este link: " + url;
  return '<div class="gy-modal-h"><h2>Link para ' + esc(primerNombre(s.nombre) || "el socio") + '</h2><button class="gy-x" data-gym="cerrar" aria-label="Cerrar">✕</button></div>' +
    '<p class="gy-p">Sirve una sola vez y vence el ' + fecha(m.expires_at) + '. El link anterior deja de servir.</p><div class="gy-codigo gy-link"><span class="gy-url">' + esc(url) + '</span></div>' +
    '<div class="gy-acc"><a class="gize-btn cv-btn" href="' + esc("https://wa.me/" + String(s.phone || "").replace(/\D/g, "") + "?text=" + encodeURIComponent(txt)) + '" target="_blank" rel="noopener">Mandar por WhatsApp</a>' + btn2('data-gym="copiar" data-v="' + esc(url) + '"', "Copiar link") + '</div>';
}

// ---- Datos ----
async function cargarSocios(){
  const r = await rpc("gym_socios_resumen");
  if (r.error){ if (GS.socios === null) GS.sociosError = r.msg; }
  else { GS.socios = Array.isArray(r.data) ? r.data : []; GS.sociosError = ""; }
  pedirFotos(GS.socios ? GS.socios.map(s => s.foto_path) : []).then(ok => { if (ok) repintar(); });
  repintar();
}
async function cargarSolicitudes(){
  const r = await rpc("gym_solicitudes");
  if (r.error){ if (GS.solicitudes === null) GS.solicitudesError = r.msg; }
  else { GS.solicitudes = Array.isArray(r.data) ? r.data : []; GS.solicitudesError = ""; }
  pedirFotos(fotosDeSolicitudes()).then(ok => { if (ok) repintar(); });
  repintar();
}
async function cargarEquipo(){
  const [r, i] = await Promise.all([rpc("gym_equipo"), rpc("gym_invitaciones")]);
  if (r.error){ if (GS.equipo === null) GS.equipoError = r.msg; }
  else { GS.equipo = Array.isArray(r.data) ? r.data : []; GS.equipoError = ""; resolveAvatars(GS.equipo.map(p => p.avatar_path)).then(ok => { if (ok) repintar(); }).catch(() => {}); }
  if (!i.error) GS.invitaciones = Array.isArray(i.data) ? i.data : [];
  repintar();
}
async function cargarFicha(id){
  const f = GS.ficha = { id, datos: null, nota: null, ingresos: null, cal: { m: null, d: null } };
  repintar();
  const desde = new Date(Date.now() - 31 * 864e5).toISOString();
  const sb = State.sb;
  const seguro = q => Promise.resolve(q).then(r => r, e => ({ error: e }));
  const [d, n, e] = await Promise.all([
    seguro(sb.from("gym_members").select("*").eq("id", id).maybeSingle()),
    seguro(sb.from("gym_member_notes").select("body, updated_at").eq("gym_member_id", id).maybeSingle()),
    seguro(sb.from("gym_entries").select("at, method, result").eq("gym_member_id", id).gte("at", desde).order("at", { ascending: false })),
  ]);
  if (GS.ficha !== f) return;
  if (d.error || !d.data){ if (d.error) f.error = "No se pudo leer la ficha. Revisá tu conexión."; }
  else f.datos = d.data;
  f.nota = (n && !n.error && n.data) || null;
  if (e && !e.error) f.ingresos = e.data || []; else f.ingresosError = true;
  pedirFotos(fotosDeFicha()).then(ok => { if (ok) repintar(); });
  repintar();
}
async function cargarIngresos(){
  const r = await rpc("gym_ingresos", { desde: hoyAR() });
  if (r.error){ if (GS.ingresos === null) GS.ingresosError = r.msg; }
  else { GS.ingresos = Array.isArray(r.data) ? r.data : []; GS.ingresosError = ""; }
  repintar();
}
async function cargarDpa(){
  const r = await Promise.resolve(State.sb.from("gyms").select("dpa_version, dpa_at").eq("id", gym().id).maybeSingle()).catch(() => null);
  if (r && !r.error && r.data){ GS.dpa = r.data; repintar(); }
}
async function cargarAceptar(){
  const t = linkEquipo(); if (!t) return;
  GS.aceptar = { token: t.t, cargando: true };
  const r = await rpc("gym_invitacion_info", { token: t.t });
  GS.aceptar = r.error ? { token: t.t, error: r.msg } : { token: t.t, info: r.data || { estado: "vencida" } };
  repintar();
}
function cargarVista(){
  const v = GS.view;
  if (v === "inicio"){ releerGym().then(repintar); cargarSocios(); cargarEquipo(); }
  else if (v === "socios"){ cargarSocios(); if (GS.equipo === null) cargarEquipo(); if (GS.tab === "solicitudes") cargarSolicitudes(); else releerGym().then(repintar); }
  else if (v === "profes"){ cargarEquipo(); if (GS.socios === null) cargarSocios(); }
  else if (v === "config"){ if (GS.equipo === null) cargarEquipo(); cargarDpa(); releerGym().then(repintar); }
  else if (v === "plan"){ releerGym().then(repintar); }
  else if (v === "asistencia"){ cargarIngresos(); }
  // Abrir la recepción no tacha «Probá la recepción» (Inicio): lo tacha el primer uso de verdad, buscar o
  // registrar un ingreso (marcarRecepcion, recepcion.js).
}
// Después de cambiar algo: las listas y los contadores.
function despues(){
  // La recepción no lee la lista de socios ni los contadores: solo sus solicitudes.
  if (rolGym() === "recepcion"){ if (GS.solicitudes) cargarSolicitudes(); return; }
  releerGym().then(repintar); cargarSocios(); if (GS.tab === "solicitudes" || GS.solicitudes) cargarSolicitudes();
}

async function ir(v){
  if (GS.view === "coach" && coachAdentro()){
    if (clientUnsaved() && !await confirmar("Tenés cambios sin guardar en " + clientUnsaved() + ". ¿Salir igual y perderlos?")) return;
    if (tplDirty() && !await confirmar("Tenés cambios sin guardar en la rutina. ¿Salir igual y perderlos?")) return;
    soltarCoach();
  }
  GS.modal = null; GS.equipoSel = null;
  GS.view = v; GS.vuelta = null;
  cargarVista();
  repintar();
  try { (document.getElementById("coachHost") || window).scrollTo(0, 0); } catch (e) {}
}
function abrirFicha(id){ GS.view = "ficha"; GS.modal = null; cargarFicha(id); try { document.getElementById("coachHost").scrollTo(0, 0); } catch (e) {} }

// ---- Acciones ----
function marcarCopiado(b){
  if (!b) return;
  const t = b.innerHTML; b.innerHTML = "¡Copiado!"; b.classList.add("copied");
  setTimeout(() => { if (b.isConnected){ b.innerHTML = t; b.classList.remove("copied"); } }, 1600);
}
const ocupado = (k, f) => async (...a) => { if (GS.busy) return; GS.busy = k; repintar(); pintarModal(); try { return await f(...a); } finally { GS.busy = ""; repintar(); pintarModal(); } };

const crearFicha = ocupado("ficha", async () => {
  const d = Object.assign({}, GS.modal.datos || {}), datos = {};
  for (const k of ["nombre", "dni", "telefono", "email", "alta", "apto_medico_vence"]) if (d[k] && String(d[k]).trim()) datos[k] = String(d[k]).trim();
  if (!datos.nombre){ alert("Escribí el nombre y el apellido."); return; }
  const r = await rpc("gym_ficha_crear", { datos });
  if (r.error){ alert(r.msg); return; }
  GS.modal.creada = { id: r.data.id, token: r.data.token, nombre: datos.nombre, tel: datos.telefono || "" };
  despues();
});

async function subirFoto(fichaId, file){
  if (!file) return;
  let blob;
  try { blob = await cropAvatar(file); } catch (e) { alert("No se pudo leer esa imagen. Probá con otra."); return; }
  if (!blob) return;
  const path = gym().id + "/" + fichaId + "/" + (crypto.randomUUID ? crypto.randomUUID() : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16))) + ".jpg";
  const up = await State.sb.storage.from("gym-fotos").upload(path, blob, { contentType: "image/jpeg", upsert: false }).catch(e => ({ error: e }));
  if (up.error){ alert("No se pudo subir la foto. Revisá tu conexión y probá de nuevo."); return; }
  const r = await rpc("gym_foto_staff", { ficha: fichaId, path });
  if (r.error){ alert(r.msg); return; }
  fotoNueva(fichaId, path);
  if (GS.ficha && GS.ficha.id === fichaId) cargarFicha(fichaId);
  despues();
}

const aprobar = ocupado("sol", async (id, unir) => {
  const o = (GS.solicitudes || []).find(x => x.id === id), f = o ? solElegido(o) : {};
  // foto: la que se ve en la solicitud; si el socio mandó otra mientras tanto, el servidor no la aprueba.
  const r = await rpc("gym_aprobar", { ficha: id, profe: f.profe || null, unir_a_ficha: unir || null, foto_ok: !!f.foto, foto: f.foto ? (o && o.foto_pend_path) || null : null });
  if (r.error){ alert(r.msg); despues(); return; }
  GS.solicitudes = (GS.solicitudes || []).filter(s => s.id !== id); delete GS.solForm[id];
  despues();
});

async function accionGrupo(tipo){
  const ids = [...GS.sel];
  if (!ids.length) return;
  if (tipo === "asignar") return abrir({ tipo: "asignar", ids, a: undefined });
  if (tipo === "pausar") return abrir({ tipo: "pausar", ids, hasta: "" });
  if (tipo === "exportar"){
    const L = (GS.socios || []).filter(s => GS.sel.has(s.id)).map(s => ({ nombre: s.nombre, dni: s.dni, telefono: s.phone, email: s.email, estado: s.estado,
      profe: s.coach_externo ? "Coach externo" : s.profe ? s.profe.name : "", alta: s.joined_at ? String(s.joined_at).slice(0, 10) : "", apto_medico_vence: s.apto_medico_vence,
      ultimo_ingreso: s.ultimo_ingreso, sin_app: s.sin_app }));
    descargar("socios-" + hoyAR() + ".csv", aCsv(L));
  }
}

async function alTocarAntes(e){
  // «Como profe» y «Mi cuenta» abren el panel de coach adentro del marco (main.js hace el resto).
  const c = e.target.closest && e.target.closest("[data-gy-coach]");
  if (c && esPanelGym()){
    if (GS.view !== "coach"){ GS.vuelta = GS.view === "ficha" ? "socios" : GS.view; GS.view = "coach"; }
    else if (GS.vuelta === "ficha") GS.vuelta = "socios"; // de la ficha de entrenamiento de un socio a otra opción
    CoachState.coachSel = null; CoachState.coachData = null; CoachState.coachLectura = null; CoachState.coachTplEdit = null; CoachState.coachMealEdit = null;
    if (GS.modal) cerrarModal();
    return;
  }
  // El calendario de la Asistencia de la ficha (renderCoachCalendar con su propio estado).
  const k = e.target.closest && e.target.closest('[data-action^="gy-cal-"]');
  if (k && GS.ficha){
    const st = GS.ficha.cal;
    if (k.dataset.action === "gy-cal-nav"){ st.m = k.dataset.m; st.d = null; } else st.d = st.d === k.dataset.d ? null : k.dataset.d;
    repintar();
  }
}

async function alTocar(e){
  const b = e.target.closest && e.target.closest("[data-gym]");
  if (!b || b.disabled || !(b.closest("#coachHost") || b.closest("#gymModal"))) return;
  const a = b.dataset.gym, id = b.dataset.id;
  if (a === "elegir" || a === "elegir-todos") return; // los maneja alCambiar
  if (a === "abrir"){ if (e.target.closest("[data-gym-no]")) return; if (GS.modal) cerrarModal(); return abrirFicha(id); }
  if (a === "ir") return ir(b.dataset.v);
  if (a === "mas") return abrir({ tipo: "mas" });
  if (a === "cerrar"){ if (GS.modal && GS.modal.tipo === "asignar" && GS.modal.resultado) GS.sel.clear(); return cerrarModal(), repintar(); }
  if (a === "reintentar"){ if (rolGym() === "recepcion"){ cargarSolicitudes(); return; } cargarVista(); if (GS.view === "ficha" && GS.ficha) cargarFicha(GS.ficha.id); return; }
  // Asistencia y recepción
  if (a === "ingreso-manual"){
    limpiarRecepcion(); abrir({ tipo: "ingreso" });
    const i = document.querySelector("#gymModal input[data-rec-q]"); if (i) i.focus({ preventScroll: true }); // a escribir el nombre
    return;
  }
  if (a === "asis-csv"){ exportarIngresos(); return; }
  if (a === "rec-tab"){
    GS.recTab = b.dataset.v;
    if (GS.recTab === "solicitudes"){
      // La recepción no lee el equipo (gym_equipo es del dueño y la administración): aprueba sin profe y
      // la administración se lo asigna después (Inicio: «socios sin profe»).
      if (GS.equipo === null) GS.equipo = [];
      cargarSolicitudes();
    }
    repintar(); return;
  }
  if (a === "copiar"){ if (await copiar(b.dataset.v || "")) marcarCopiado(b); else alert("No se pudo copiar: " + (b.dataset.v || "")); return; }
  // Socios
  if (a === "socios-tab"){ GS.tab = b.dataset.v; GS.sel.clear(); if (GS.view !== "socios") return ir("socios"); if (GS.tab === "solicitudes") cargarSolicitudes(); repintar(); return; }
  if (a === "filtro"){
    const k = b.dataset.k;
    if (GS.view !== "socios"){ GS.filtros = Object.assign({}, GS.filtros, { profe: "", estado: "", sinProfe: false, externo: false, noViene: false, faltaConf: false, sinApp: false, fotoPend: false, aptoVencido: false, appVieja: false, mios: false, q: "" }); GS.filtros[k] = true; GS.tab = "socios"; return ir("socios"); }
    GS.filtros[k] = !GS.filtros[k]; repintar(); return;
  }
  if (a === "filtros-limpiar"){ GS.filtros = { q: "", profe: "", estado: "" }; repintar(); return; }
  if (a === "grupo-limpiar"){ GS.sel.clear(); repintar(); return; }
  if (a === "grupo-asignar") return accionGrupo("asignar");
  if (a === "grupo-pausar") return accionGrupo("pausar");
  if (a === "grupo-exportar") return accionGrupo("exportar");
  if (a === "sumar"){ if (!GS.socios && rolGym() !== "recepcion") cargarSocios(); return abrir({ tipo: "sumar", tab: b.dataset.v || "codigo", datos: {} }); }
  if (a === "sumar-tab"){ GS.modal.tab = b.dataset.v; return pintarModal(); }
  if (a === "sumar-otra"){ GS.modal = { tipo: "sumar", tab: "ficha", datos: {} }; return pintarModal(); }
  if (a === "ficha-crear") return crearFicha();
  // Solicitudes
  if (a === "sol-nuevo") return aprobar(id, null);
  if (a === "sol-unir"){
    const o = (GS.solicitudes || []).find(s => s.id === id), c = o && (o.coincidencias || []).find(x => x.id === b.dataset.a);
    if (!await confirmar("¿Unir el pedido de " + (o && o.nombre || "esta persona") + " con la ficha de " + (c && c.nombre || "ese socio") + "? Queda con el estado de esa ficha y no ocupa otro lugar.", { ok: "Unir" })) return;
    return aprobar(id, b.dataset.a);
  }
  if (a === "sol-rechazar"){
    const o = (GS.solicitudes || []).find(s => s.id === id);
    const mot = await pedir("¿Por qué no lo aceptás? (opcional; no se le muestra)", "", { titulo: "Rechazar a " + (o && o.nombre || "esta persona"), ok: "Rechazar" });
    if (mot === null) return;
    const r = await rpc("gym_rechazar", { ficha: id, motivo: mot || null });
    if (r.error) return alert(r.msg);
    GS.solicitudes = (GS.solicitudes || []).filter(s => s.id !== id); despues(); return;
  }
  // Ficha
  const f = GS.ficha, s = f && (GS.socios || []).find(x => x.id === f.id);
  if (a === "ficha-guardar" && f && f.form){
    const patch = {};
    Object.keys(f.form).forEach(k => { patch[k] = f.form[k]; });
    await ocupado("datos", async () => {
      const r = await rpc("gym_ficha_editar", { id: f.id, patch });
      if (r.error) return alert(r.msg);
      f.form = null; cargarFicha(f.id); cargarSocios();
    })();
    return;
  }
  if (a === "nota-guardar" && f){
    await ocupado("nota", async () => {
      const r = await rpc("gym_nota_guardar", { id: f.id, body: f.notaForm || "" });
      if (r.error) return alert(r.msg);
      f.nota = f.notaForm ? { body: f.notaForm, updated_at: new Date().toISOString() } : null; f.notaForm = undefined;
    })();
    return;
  }
  if (a === "cambiar-profe" && s){ const m = sinCambiarProfe(s); if (m) return alert(m); return abrir({ tipo: "asignar", ids: [s.id], a: undefined }); }
  if (a === "pausar" && s) return abrir({ tipo: "pausar", ids: [s.id], hasta: "" });
  if (a === "baja" && s){
    const mot = await pedir("¿Dar de baja a " + s.nombre + "? Deja de ocupar un lugar y el gimnasio deja de ver sus datos. Podés reactivarlo después.\n\nMotivo (opcional):", "", { titulo: "Dar de baja", ok: "Dar de baja" });
    if (mot === null) return;
    const r = await rpc("gym_baja", { ficha: s.id, motivo: mot || null });
    if (r.error) return alert(r.msg);
    despues(); cargarFicha(s.id); return;
  }
  if (a === "reactivar" && s){
    const r = await rpc("gym_reactivar", { ficha: s.id });
    if (r.error) return alert(r.msg);
    despues(); cargarFicha(s.id); return;
  }
  if (a === "ficha-link" && s){
    const r = await rpc("gym_ficha_link", { id: s.id });
    if (r.error) return alert(r.msg);
    return abrir({ tipo: "link", id: s.id, token: r.data.token, expires_at: r.data.expires_at });
  }
  if ((a === "foto-aprobar" || a === "foto-rechazar") && s){
    let mot = null;
    if (a === "foto-rechazar"){ mot = await pedir("¿Por qué no sirve? (se lo mostramos al socio)", "No se ve bien la cara: mandá otra.", { titulo: "Rechazar la foto", ok: "Rechazar" }); if (mot === null) return; }
    // La foto que se ve en la ficha: si el socio mandó otra mientras tanto, el servidor no la resuelve.
    const fp = (f.datos && f.datos.foto_pend_path) || null;
    const r = await rpc("gym_foto_resolver", { ficha: s.id, aprobar: a === "foto-aprobar", motivo: mot, foto: fp });
    if (r.error){ alert(r.msg); cargarFicha(s.id); return; }
    cargarFicha(s.id); despues(); return;
  }
  if (a === "entreno" && s && s.member_id){
    GS.vuelta = "ficha"; GS.view = "coach";
    // Al volver de la ficha de entrenamiento, a la ficha del socio (no a «Mis alumnos»).
    CoachState.coachView = "home"; CoachState.coachTplEdit = null; CoachState.coachMealEdit = null;
    CoachState.coachClientTab = "ficha"; CoachState.coachSec = null; CoachState.coachPlanSec = null;
    if (b.dataset.m === "lectura") openClient(s.member_id, false, { nombre: s.nombre, avatar: s.avatar_path || null, profe: s.profe ? s.profe.name : null });
    else openClient(s.member_id);
    try { document.getElementById("coachHost").scrollTo(0, 0); } catch (e) {}
    return;
  }
  // Ventanas: asignar y pausar
  if (a === "asignar-ok" && GS.modal){
    const m = GS.modal;
    await ocupado("asignar", async () => {
      const r = await rpc("gym_asignar_profe", { fichas: m.ids, profe: m.a || null });
      if (r.error) return alert(r.msg);
      m.resultado = { ok: r.data.ok || [], saltadas: r.data.saltadas || [] };
      despues(); if (GS.ficha) cargarFicha(GS.ficha.id); if (GS.view === "profes") cargarEquipo();
    })();
    return;
  }
  if (a === "pausar-ok" && GS.modal){
    const m = GS.modal;
    await ocupado("pausar", async () => {
      const errores = [];
      for (const fid of m.ids){ const r = await rpc("gym_pausar", { ficha: fid, hasta: m.hasta }); if (r.error) errores.push(r.msg); }
      if (errores.length) alert(m.ids.length > 1 ? plural(errores.length, "no se pudo pausar", "no se pudieron pausar") + ": " + errores[0] : errores[0]);
      GS.sel.clear(); cerrarModal(); despues(); if (GS.ficha) cargarFicha(GS.ficha.id);
    })();
    return;
  }
  // Equipo
  if (a === "eq-tab"){ GS.equipoTab = b.dataset.v; repintar(); return; }
  if (a === "eq-abrir"){ GS.equipoSel = id; GS.pasarA = ""; GS.rolNuevo = ""; if (GS.socios === null) cargarSocios(); repintar(); return; }
  if (a === "eq-cerrar"){ GS.equipoSel = null; GS.pasarA = ""; GS.rolNuevo = ""; repintar(); return; }
  if (a === "invitar") return abrir({ tipo: "invitar", rol: b.dataset.v && (b.dataset.v !== "admin" || esDueno()) ? b.dataset.v : (GS.equipoTab !== "admin" || esDueno() ? GS.equipoTab : "profe") });
  if (a === "inv-crear" && GS.modal){
    const m = GS.modal;
    await ocupado("invitar", async () => {
      const r = await rpc("gym_invitar", { rol: m.rol });
      if (r.error) return alert(r.msg);
      m.creada = r.data; cargarEquipo(); releerGym().then(repintar);
    })();
    return;
  }
  if (a === "inv-nuevo"){
    const r0 = await rpc("gym_invitacion_revocar", { id });
    if (r0.error) return alert(r0.msg);
    const r = await rpc("gym_invitar", { rol: b.dataset.rol });
    if (r.error){ cargarEquipo(); return alert(r.msg); }
    cargarEquipo();
    return abrir({ tipo: "invitar", rol: b.dataset.rol, creada: r.data });
  }
  if (a === "inv-anular"){
    if (!await confirmar("¿Anular esta invitación? El link deja de servir.", { ok: "Anular" })) return;
    const r = await rpc("gym_invitacion_revocar", { id });
    if (r.error) return alert(r.msg);
    cargarEquipo(); releerGym().then(repintar); return;
  }
  if (a === "eq-pasar"){
    const dest = GS.pasarA; if (!dest) return alert("Elegí a quién pasan sus socios.");
    const ids = (GS.socios || []).filter(x => x.profe && x.profe.id === id && (x.estado === "activo" || x.estado === "pausado")).map(x => x.id);
    if (!ids.length) return;
    return abrir({ tipo: "asignar", ids, a: dest === "-" ? null : dest });
  }
  if (a === "eq-rol"){
    if (!GS.rolNuevo) return alert("Elegí el rol nuevo.");
    const p = (GS.equipo || []).find(x => x.user_id === id);
    if (!await confirmar("¿Pasar a " + (p && p.nombre || "esta persona") + (p ? " de " + rolNombre(p.rol) : "") + " a " + rolNombre(GS.rolNuevo) + "?", { ok: "Cambiar el rol" })) return;
    const r = await rpc("gym_cambiar_rol", { usuario: id, rol: GS.rolNuevo });
    if (r.error) return alert(r.msg);
    GS.rolNuevo = ""; cargarEquipo(); releerGym().then(repintar); return;
  }
  if (a === "eq-quitar") return abrir({ tipo: "quitar", id, a: undefined });
  if (a === "quitar-ok" && GS.modal){
    const m = GS.modal;
    await ocupado("quitar", async () => {
      const r = await rpc("gym_quitar_staff", { usuario: m.id, reasignar_a: m.a || null });
      if (r.error) return alert(r.msg);
      const d = r.data || {};
      cerrarModal(); GS.equipoSel = null;
      alert("Listo." + (d.reasignados ? " " + plural(d.reasignados, "socio pasó", "socios pasaron") + " al profe nuevo." : "") + (d.sin_profe ? " " + plural(d.sin_profe, "socio quedó", "socios quedaron") + " sin profe" + (d.falta_confirmacion ? " (" + d.falta_confirmacion + " porque todavía no confirmaron lo que ve el gimnasio)" : "") + "." : ""));
      if (m.id === yo()){ await releerGym(); redibujar(); return; }
      cargarEquipo(); despues();
    })();
    return;
  }
  // Configuración
  if (a === "cfg-guardar" && GS.cfg){
    const patch = Object.assign({}, GS.cfg);
    await ocupado("cfg", async () => {
      const r = await rpc("gym_config", { patch });
      if (r.error) return alert(r.msg);
      Object.assign(Gym.info, { gym: r.data.gym, settings: r.data.settings }); GS.cfg = null;
    })();
    return;
  }
  if (a === "codigo-rotar"){
    if (!await confirmar("¿Cambiar el código del gimnasio? El de ahora deja de servir (y el QR impreso también). Los socios que ya están no cambian.", { ok: "Cambiar código" })) return;
    const r = await rpc("gym_codigo_rotar");
    if (r.error) return alert(r.msg);
    Gym.info.codigo = r.data.code; repintar(); alert("Listo. El código nuevo es " + r.data.code + "."); return;
  }
  if (a === "qr-imprimir") return abrir({ tipo: "qr" });
  if (a === "imprimir"){ window.print(); return; }
  if (a === "exportar"){
    b.disabled = true;
    const err = b.dataset.v === "todo" ? await exportarTodo() : await exportar(b.dataset.v);
    b.disabled = false;
    if (err) alert(err); return;
  }
  if (a === "cerrar-gym"){
    const n = gym().name || "";
    const t = await pedir("Se cierra el gimnasio: los socios conservan sus cuentas y quedan sin profe del gimnasio, y el equipo deja de verlos. Podés exportar todo antes.\n\nPara confirmar, escribí el nombre del gimnasio: " + n, "", { titulo: "Cerrar el gimnasio", ok: "Cerrar el gimnasio", peligro: true });
    if (t === null) return;
    const r = await rpc("gym_cerrar", { confirm: t });
    if (r.error) return alert(r.msg);
    await releerGym(); GS.view = "inicio"; redibujar();
    alert("El gimnasio quedó cerrado. Podés seguir exportando sus datos desde tu cuenta."); return;
  }
  if (a === "plan-cambiar") return cambiarPlan();
  // Crear y aceptar
  if (a === "crear-si"){
    const c = GS.crear;
    if (!c.acepto) return alert("Para crear el gimnasio tenés que aceptar el contrato de encargo.");
    c.busy = true; repintar();
    const r = await rpc("gym_crear", { nombre: c.nombre.trim(), ciudad: c.ciudad.trim(), provincia: c.provincia, dpa_version: VERSIONES.encargo });
    c.busy = false;
    if (r.error){ repintar(); return alert(r.msg); }
    olvidarLinks("crear"); GS.crear = { nombre: "", ciudad: "", provincia: "", acepto: false, busy: false };
    await releerGym(); GS.view = "inicio"; cargarVista(); redibujar(); return;
  }
  if (a === "crear-no"){ olvidarLinks("crear"); redibujar(); return; }
  if (a === "aceptar-reintentar"){ GS.aceptar = null; repintar(); return; }
  if (a === "aceptar-no"){ olvidarLinks("equipo"); GS.aceptar = null; redibujar(); return; }
  if (a === "aceptar-si" && GS.aceptar){
    const tok = GS.aceptar.token;
    await ocupado("aceptar", async () => {
      const r = await rpc("gym_aceptar_invitacion", { token: tok });
      if (r.error) return alert(r.msg);
      olvidarLinks("equipo"); GS.aceptar = null;
      await releerGym(); GS.view = "inicio"; if (esPanelGym()) cargarVista();
      await redibujar();
      alert("¡Listo! Ya sos parte de " + ((r.data && r.data.gym && r.data.gym.name) || "el gimnasio") + ".");
    })();
    return;
  }
}

function alEscribir(e){
  const t = e.target;
  if (!t.closest || !(t.closest("#coachHost") || t.closest("#gymModal"))) return;
  if (t.dataset.gymIn === "q"){ GS.filtros.q = t.value; repintar(); return; }
  if (t.dataset.gymF && GS.modal){ (GS.modal.datos || (GS.modal.datos = {}))[t.dataset.gymF] = t.value; return; }
  if (t.dataset.gymFf && GS.ficha){ (GS.ficha.form || (GS.ficha.form = {}))[t.dataset.gymFf] = t.value; const g = document.querySelector('[data-gym="ficha-guardar"]'); if (g) g.disabled = false; return; }
  if (t.dataset.gymNota && GS.ficha){ GS.ficha.notaForm = t.value; const g = document.querySelector('[data-gym="nota-guardar"]'); if (g) g.disabled = false; return; }
  if (t.dataset.gymCfg){ (GS.cfg || (GS.cfg = {}))[t.dataset.gymCfg] = t.value; const g = document.querySelector('[data-gym="cfg-guardar"]'); if (g) g.disabled = false; return; }
  if (t.dataset.gymCr){ GS.crear[t.dataset.gymCr] = t.type === "checkbox" ? t.checked : t.value; const g = document.querySelector('[data-gym="crear-si"]'); if (g) g.disabled = !(GS.crear.acepto && GS.crear.nombre.trim().length >= 2); return; }
  if (t.dataset.gymIn === "pausa-hasta" && GS.modal){ GS.modal.hasta = t.value; const g = document.querySelector('[data-gym="pausar-ok"]'); if (g) g.disabled = !t.value; return; }
}

async function alCambiar(e){
  const t = e.target;
  if (!t.closest || !(t.closest("#coachHost") || t.closest("#gymModal"))) return;
  if (t.dataset.gymFoto){ const f = t.files && t.files[0]; t.value = ""; return subirFoto(t.dataset.gymFoto, f); }
  if (t.dataset.gym === "elegir"){ if (t.checked) GS.sel.add(t.dataset.id); else GS.sel.delete(t.dataset.id); repintar(); return; }
  if (t.dataset.gym === "elegir-todos"){
    const ids = [...document.querySelectorAll('#coachHost [data-gym="elegir"]')].map(x => x.dataset.id);
    ids.forEach(i => t.checked ? GS.sel.add(i) : GS.sel.delete(i)); repintar(); return;
  }
  if (t.dataset.gymIn === "profe" || t.dataset.gymIn === "estado"){ GS.filtros[t.dataset.gymIn] = t.value; repintar(); return; }
  if (t.dataset.gymIn === "pasar-a"){ GS.pasarA = t.value; return; }
  if (t.dataset.gymIn === "rol-nuevo"){ GS.rolNuevo = t.value; return; }
  if (t.dataset.gymIn === "inv-rol" && GS.modal){ GS.modal.rol = t.value; pintarModal(); return; }
  if (t.dataset.gymIn === "quitar-a" && GS.modal){ GS.modal.a = t.value || null; pintarModal(); return; }
  if (t.dataset.gymIn === "asignar-a" && GS.modal){ GS.modal.a = t.value || null; pintarModal(); return; }
  if (t.dataset.gymSol){ const f = GS.solForm[t.dataset.id] || (GS.solForm[t.dataset.id] = {}); if (t.dataset.gymSol === "foto") f.foto = t.checked; else f.profe = t.value; return; }
  if (t.dataset.gymCr === "provincia"){ GS.crear.provincia = t.value; return; }
  if (t.dataset.gymCr === "acepto"){ GS.crear.acepto = t.checked; repintar(); return; }
  if (t.dataset.gym === "cfg-set"){
    const k = t.dataset.k, v = t.checked;
    const r = await rpc("gym_config", { patch: { settings: { [k]: v } } });
    if (r.error){ t.checked = !v; return alert(r.msg); }
    Object.assign(Gym.info, { gym: r.data.gym, settings: r.data.settings }); repintar(); return;
  }
  if (t.dataset.gym === "cfg-profe"){
    const r = await rpc("gym_config", { patch: { default_trainer_id: t.value || null } });
    if (r.error){ repintar(); return alert(r.msg); }
    Object.assign(Gym.info, { gym: r.data.gym, settings: r.data.settings }); repintar(); return;
  }
  if (t.dataset.gym === "cfg-horas"){
    const n = parseInt(t.value, 10);
    const r = await rpc("gym_config", { patch: { settings: { ingreso_horas: n } } });
    if (r.error){ repintar(); return alert(r.msg); }
    Object.assign(Gym.info, { gym: r.data.gym, settings: r.data.settings }); repintar(); return;
  }
}

function alTeclado(e){
  if (e.key === "Escape" && GS.modal && !document.querySelector(".av-bg")){ e.preventDefault(); cerrarModal(); repintar(); return; }
  // Con una ventana abierta, Tab da la vuelta adentro (no se va al panel de atrás), como los avisos.
  if (e.key === "Tab" && GS.modal && !document.querySelector(".av-bg")){
    const caja = document.querySelector("#gymModal .gy-modal, #gymModal .gy-sheet");
    if (caja){ e.preventDefault(); circular(caja, FOCO, e.shiftKey); return; }
  }
  if (e.key === "Enter" && e.target.matches && e.target.matches('#coachHost .gy-row[data-gym="abrir"]')){ e.preventDefault(); abrirFicha(e.target.dataset.id); }
}

// Para las pruebas y para depurar: el estado del panel.
export { GS };
