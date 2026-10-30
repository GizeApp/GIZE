// «Armar con IA», en el panel del coach: el coach cuenta qué rutina quiere («hipertrofia, 4 días,
// principiante, con mancuernas») y GIZE le arma un borrador con la IA (función «ia», modo «rutina»:
// supabase/functions/ia/armar.ts) con ejercicios de la lista de GIZE. El borrador se abre en el
// editor de siempre sin guardar: nada queda en «Mis rutinas» ni le llega a un alumno hasta que el
// coach toca «Guardar rutina».
//   · Dónde: Rutinas (la franja «Con IA»), una rutina vacía del editor y la rutina de un alumno (la
//     rutina vacía y «Más acciones»). Para un alumno se abre «Aplicar» con el borrador: reemplazar o
//     agregar a su rutina, que queda como «Cambios sin guardar».
//   · La hoja para escribir el pedido es #riaMount (encima de todo, como «Aplicar»). A la IA va solo
//     el pedido, recortado a 400 caracteres y limpio con limpiar() de core/planilla.js (sin mails,
//     teléfonos, documentos ni links, y con los nombres de los alumnos vinculados cambiados por
//     «[alumno]»). Es lo que dice la política (privacidad/index.html#ia-coach).
//   · Antes del primer pedido, el permiso «Usar IA en tus rutinas» (ui/ia-permiso-rutinas.js): con
//     «Ahora no» no se abre la hoja ni se manda nada.
//   · El borrador de «Mis rutinas» queda en el equipo hasta 7 días mientras se revisa (localStorage,
//     gize_rt_draft_ria_<uid>, que se borra al cerrar sesión: core/supabase.js → accountKeys), con el
//     pedido ya limpio (para «Pedir otra versión» y «¿Está mal? Avisanos»). El de un alumno va con el
//     borrador de su rutina de siempre (coach/index.js → persistRoutineDraft).
// Se ve solo si ia_coach_estado() dice que «rutina» anda para el coach (core/ia-coach.js). Los textos
// son los mismos en la web y en las apps: sin la prueba, el plan ni precios (reglas de las tiendas).
// Los botones son data-coach="ria-…" (main.js → rutinaIAAction): en el modo lectura del gimnasio no
// se dibujan (coach/index.js → soloLectura).
import { State } from '../../core/state.js';
import { esc } from '../../core/utils.js';
import { IA_COACH, iaCoachEstado, iaCoachMensaje, iaCoachVisible } from '../../core/ia-coach.js';
import { iaPedir, iaReportar } from '../../core/ia.js';
import { diasDesdeIA } from '../../core/rutina-borrador.js';
import { limpiar, privados } from '../../core/planilla.js';
import { pedirPermisoRutinas } from '../../ui/ia-permiso-rutinas.js';
import { sparkleSvg } from '../../core/icons.js';
import { CoachState } from './state.js';
import { renderCoach, routineDirty } from './index.js';
import { renderApplyPicker } from './rutinas.js';

const MAX = 400;
const CLAVE = "gize_rt_draft_ria_";
const DIAS_7 = 7 * 864e5;
const VACIA = JSON.stringify(["", "", []]); // cómo está una rutina nueva (coach/index.js → tplSnap)
// Los botones rápidos: suman la palabra al pedido.
const CHIPS = [
  ["Objetivo", ["Hipertrofia", "Fuerza", "Bajar grasa", "Resistencia"]],
  ["Días", ["2 días", "3 días", "4 días", "5 días", "6 días"]],
  ["Nivel", ["Principiante", "Intermedio", "Avanzado"]],
  ["Dónde", ["Gimnasio completo", "Con mancuernas", "En casa sin equipo"]],
];
// Los códigos con los que tiene sentido volver a probar enseguida.
const REINTENTA = ["error", "ocupada", "sin_conexion", "no_se_pudo"];
const NO_ES = "Eso no parece un pedido de rutina: contá objetivo, días por semana, nivel y con qué entrena.";

// ---------- Ayudas ----------
const estadoIA = () => iaCoachVisible("rutina") ? IA_COACH.estado : null;
function quedan(){
  const e = estadoIA(), q = e && e.quedan && e.quedan.rutina;
  return typeof q === "number" ? Math.max(0, q) : null;
}
// Si hoy no se puede armar ninguna: el texto (neutro) que lo dice.
function bloqueo(){
  const e = estadoIA(); if (!e) return "";
  if (e.estado && e.estado !== "normal") return iaCoachMensaje({ codigo: e.estado, vuelve: e.vuelve }, "rutina");
  if (quedan() === 0) return iaCoachMensaje({ codigo: "tope_dia", tope: e.tope && e.tope.rutina }, "rutina");
  return "";
}
const letras = s => (String(s || "").replace(/\[(?:mail|tel|doc|link|video|alumno)\]/gi, "").match(/\p{L}/gu) || []).length;
// El pedido como va a la IA: limpio (mails, teléfonos, documentos, links y los nombres de los alumnos
// vinculados y del coach) y recortado.
function pedidoLimpio(texto){
  const nombres = (CoachState.coachClients || []).map(c => c && c.full_name).concat((State.cloudProfile && State.cloudProfile.full_name) || []).filter(Boolean);
  return limpiar(String(texto || "").slice(0, MAX), privados(nombres)).slice(0, MAX).trim();
}
// El editor de «Mis rutinas» que puede recibir el borrador (no una rutina programada, de descarga ni
// de la planilla).
const editorLibre = e => !!(e && !e.sched && !e.deload && !e.planilla);

// ---------- Botones ----------
// «Armar con IA», si «rutina» anda para el coach. para: "tpl" (Mis rutinas o el editor) o "alumno".
export function botonArmarIA(para, clase){
  asegurar();
  return iaCoachVisible("rutina") ? '<button class="' + (clase || "co-copy-btn cv-sec-btn") + ' ria-ir" data-coach="ria-open" data-para="' + (para === "alumno" ? "alumno" : "tpl") + '">' + sparkleSvg + ' Armar con IA</button>' : "";
}
// La opción de «Más acciones» en la rutina de un alumno.
export const opcionArmarIA = () => { asegurar(); return iaCoachVisible("rutina") ? '<button class="co-day-mv" data-coach="ria-open" data-para="alumno">' + sparkleSvg + '<span>Armar con IA</span></button>' : ""; };
// Si al llegar el estado cambia lo que se ve, se vuelve a dibujar (salvo con algo a medio escribir).
function asegurar(){
  const antes = iaCoachVisible("rutina");
  iaCoachEstado().then(() => {
    if (iaCoachVisible("rutina") === antes || CoachState.coachIA || CoachState.planillas || CoachState.coachMealEdit) return;
    const a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
    if (!CoachState.coachSel && !CoachState.coachTplEdit && !["tpls", "home"].includes(CoachState.coachView)) return;
    renderCoach();
  });
}

// ---------- El cartel del borrador ----------
// Arriba del editor ("tpl") o de la rutina del alumno ("alumno", solo mientras no se guardó).
export function cartelIA(para){
  const ia = para === "tpl" ? (CoachState.coachTplEdit && CoachState.coachTplEdit.ia) : (CoachState.coachData && CoachState.coachData.ia);
  if (!ia || (para === "alumno" && !routineDirty())) return "";
  const rev = para === "tpl" ? vivos(CoachState.coachTplEdit) : 0;
  return '<div class="ria-banner" role="note"><div class="ria-banner-t">' + sparkleSvg + '<b>Borrador armado con IA</b></div>' +
    '<p>Revisá ejercicios, series y descansos antes de guardar: es un punto de partida, no reemplaza tu criterio.' +
      (rev ? ' ' + (rev === 1 ? 'Mirá el ejercicio marcado' : 'Mirá los ' + rev + ' ejercicios marcados') + ' «Revisar».' : '') + '</p>' +
    (ia.nota ? '<p class="ria-nota">Nota de la IA: ' + esc(ia.nota) + '</p>' : '') +
    '<div class="ria-acc"><button class="co-copy-btn" data-coach="ria-otra" data-para="' + para + '">Pedir otra versión</button>' +
      '<button class="cv-link ria-mal" data-coach="ria-mal" data-para="' + para + '">¿Está mal? Avisanos</button></div></div>';
}
function vivos(e){
  const ids = new Set(); ((e && e.days) || []).forEach(d => (d.exercises || []).forEach(x => ids.add(x.id)));
  return ((e && e.revisar) || []).filter(id => ids.has(id)).length;
}

// ---------- El borrador de «Mis rutinas» en el equipo ----------
let activo = false; // en esta carga se está revisando un borrador (para borrarlo cuando se va)
const clave = () => State.cloudUser ? CLAVE + State.cloudUser.id : null;
export function leerBorradorIA(){
  const k = clave(); if (!k) return null;
  try {
    const d = JSON.parse(localStorage.getItem(k) || "null");
    if (!d || !Array.isArray(d.days) || !d.days.length || !d.ia || !d.ts || Date.now() - d.ts > DIAS_7) { localStorage.removeItem(k); return null; }
    return d;
  } catch (e) { return null; }
}
// Con cada dibujo del panel y al salir de la app: si el editor tiene un borrador de la IA, queda; si
// se guardó, se descartó o se salió sin guardar, se borra. Nunca después de cerrar sesión (la app ya
// lo borró y recarga: si se guardara al irse, volvía a quedar en el equipo).
export function guardarBorradorIA(){
  const k = clave(); if (!k || State.signingOut) return;
  const e = CoachState.coachTplEdit;
  try {
    if (editorLibre(e) && e.ia){
      activo = true;
      localStorage.setItem(k, JSON.stringify({ ts: e.ia.ts || Date.now(), id: e.id || null, name: e.name || "", days: e.days || [], revisar: e.revisar || [], ia: e.ia }));
    } else if (activo){ activo = false; localStorage.removeItem(k); }
  } catch (x) {}
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") guardarBorradorIA(); });
window.addEventListener("pagehide", guardarBorradorIA);
// En Rutinas: «Tenés una rutina armada con IA sin guardar» (de otra vez que se abrió la app).
export function cartelSeguirIA(){
  if (CoachState.coachTplEdit) return "";
  const d = leerBorradorIA(); if (!d) return "";
  return '<div class="cv-card ria-seguir" role="status"><span class="ria-seguir-t">' + sparkleSvg + '<b>Tenés una rutina armada con IA sin guardar' + (d.name ? ': «' + esc(d.name) + '»' : '') + '</b></span>' +
    '<span class="ria-acc"><button class="gize-btn cv-btn" data-coach="ria-seguir">Seguir revisándola</button><button class="co-copy-btn" data-coach="ria-descartar">Descartarla</button></span></div>';
}

// ---------- La hoja ----------
// CoachState.coachIA: { para: "tpl" | "alumno", cliente, texto, armando, msg, reintento, n }.
let pedidoN = 0;
function hojaMarkup(){
  const st = CoachState.coachIA, q = quedan(), bl = bloqueo();
  const chips = CHIPS.map(([g, l]) => '<div class="ria-chips" role="group" aria-label="' + esc(g) + '"><span class="ria-chips-t">' + esc(g) + '</span>' +
    l.map(w => '<button type="button" class="ria-chip" data-coach="ria-chip" data-t="' + esc(w) + '"' + (st.armando ? ' disabled' : '') + '>' + esc(w) + '</button>').join("") + '</div>').join("");
  return '<div class="cp-title ria-title">' + sparkleSvg + 'Armar rutina con IA</div>' +
    '<div class="cp-sub">Contá qué rutina querés y GIZE te arma un borrador para que lo revises. No se guarda nada hasta que toques «Guardar rutina».</div>' +
    '<label class="ria-lbl" for="riaTexto">Tu pedido</label>' +
    '<textarea class="co-note ria-txt" id="riaTexto" maxlength="' + MAX + '" rows="3" placeholder="Ej: hipertrofia, 4 días, principiante, con mancuernas"' + (st.armando ? ' disabled' : '') + '>' + esc(st.texto || "") + '</textarea>' +
    '<div class="ria-cuenta" aria-hidden="true">' + (st.texto || "").length + '/' + MAX + '</div>' +
    chips +
    '<p class="ria-hint">No escribas el nombre ni datos de salud de tu alumno. Si hay que cuidar una zona, decilo así: «sin impacto en rodilla».</p>' +
    '<div class="ria-status" role="status" aria-live="polite">' +
      (st.armando ? '<span class="ria-armando">Armando la rutina con IA… puede tardar hasta un minuto.</span>'
        : st.msg ? '<span class="ria-err">' + esc(st.msg) + '</span>'
        : bl ? '<span class="ria-err">' + esc(bl) + '</span>'
        : q !== null ? '<span class="ria-quedan">Te ' + (q === 1 ? 'queda 1' : 'quedan ' + q) + ' hoy.</span>' : '') +
    '</div>' +
    '<button class="co-save-rt ria-armar" data-coach="ria-armar"' + (st.armando || bl ? ' disabled' : '') + '>' + (st.msg && st.reintento ? 'Probar de nuevo' : 'Armar borrador') + '</button>' +
    '<button class="logout-btn" style="margin-top:8px" data-coach="ria-cancel">' + (st.armando ? 'Cerrar' : 'Cancelar') + '</button>';
}
export function renderRutinaIA(){
  let el = document.getElementById("riaMount");
  if (!el){ el = document.createElement("div"); el.id = "riaMount"; document.body.appendChild(el); }
  if (!CoachState.coachIA){ el.innerHTML = ""; return; }
  const a = document.activeElement, enTexto = !!(a && a.id === "riaTexto"), sel = enTexto ? [a.selectionStart, a.selectionEnd] : null;
  const card = el.querySelector(".cp-ccard");
  if (card) card.innerHTML = hojaMarkup();
  else el.innerHTML = '<div class="cp-bg" data-coach="ria-cancel"></div><div class="cp-ccard ria-card" role="dialog" aria-modal="true" aria-label="Armar rutina con IA">' + hojaMarkup() + '</div>';
  const t = el.querySelector("#riaTexto");
  if (t && (enTexto || !card) && !t.disabled) try { t.focus({ preventScroll: true }); if (sel) t.setSelectionRange(sel[0], sel[1]); else t.setSelectionRange(t.value.length, t.value.length); } catch (e) {}
}
function cerrarHoja(){
  CoachState.coachIA = null; pedidoN++; // si estaba armando, lo que llegue ya no va
  renderRutinaIA();
}

// Abre la hoja (con el permiso antes, una sola vez). texto: para «Pedir otra versión».
export async function abrirRutinaIA(para, texto){
  if (!State.cloudUser || !iaCoachVisible("rutina") || CoachState.coachIA) return;
  if (para === "alumno" && !(CoachState.coachData && CoachState.coachData.id)) return;
  if (!await pedirPermisoRutinas()) return;
  CoachState.coachIA = { para, cliente: para === "alumno" ? CoachState.coachData.id : null, texto: String(texto || "").slice(0, MAX), armando: false, msg: "", reintento: false };
  renderRutinaIA();
  // Cuántas quedan hoy, al día.
  iaCoachEstado(true).then(() => { if (CoachState.coachIA && !CoachState.coachIA.armando) renderRutinaIA(); });
}

// «Armar borrador»: un solo pedido a la vez (un doble toque no manda dos).
async function armar(){
  const st = CoachState.coachIA;
  if (!st || st.armando || bloqueo()) return;
  const pedido = pedidoLimpio(st.texto);
  if (letras(pedido) < 3){ st.msg = "Contá qué rutina querés: objetivo, días por semana, nivel y con qué entrena."; st.reintento = false; renderRutinaIA(); return; }
  const n = ++pedidoN;
  st.armando = true; st.msg = ""; renderRutinaIA();
  let r = null, err = null;
  try { r = await iaPedir("rutina", { descripcion: pedido }); } catch (e) { err = e; }
  if (n !== pedidoN || CoachState.coachIA !== st) return; // se cerró mientras armaba: no va
  st.armando = false;
  iaCoachEstado(true).then(() => { if (CoachState.coachIA === st && !st.armando) renderRutinaIA(); });
  if (err){
    const c = (err && err.codigo) || "error";
    st.msg = iaCoachMensaje({ codigo: c, vuelve: err.vuelve || null, tope: err.tope, motivo: err.motivo }, "rutina");
    st.reintento = REINTENTA.includes(c);
    renderRutinaIA(); return;
  }
  const { days, revisar } = r && r.hay_rutina === true ? diasDesdeIA(r) : { days: [], revisar: [] };
  if (!days.length){
    const nota = r && typeof r.nota === "string" ? r.nota.trim() : "";
    st.msg = NO_ES + (nota ? " " + nota : ""); st.reintento = false;
    renderRutinaIA(); return;
  }
  const borrador = Object.assign({}, r); delete borrador.ok; delete borrador.modelo_nombre;
  const ia = { pedido, nota: typeof r.nota === "string" ? r.nota.slice(0, 200) : "", borrador, ts: Date.now() };
  const nombre = String(r.nombre || "").trim().slice(0, 80) || "Rutina con IA";
  if (st.para === "alumno") return alAlumno(st, nombre, days, ia);
  CoachState.coachIA = null; renderRutinaIA();
  const e = CoachState.coachTplEdit;
  if (editorLibre(e)){
    // Desde el editor (una rutina vacía, o pidiendo otra versión): el borrador va ahí mismo.
    // El nombre: el que puso el coach; si no puso o es el de la versión anterior, el de la IA.
    if (!String(e.name || "").trim() || (e.ia && e.name === e.ia.nombre)) e.name = nombre;
    e.days = days; e.revisar = revisar; e.ia = Object.assign(ia, { nombre, snap: JSON.stringify(days) });
  } else {
    CoachState.coachTplEdit = { id: null, name: nombre, days, revisar, ia: Object.assign(ia, { nombre, snap: JSON.stringify(days) }), orig0: VACIA };
    CoachState.coachView = "tpls"; CoachState.coachSeedOpen = false;
  }
  CoachState.coachEditDay = 0; CoachState.coachExpandedEx = new Set();
  renderCoach(); window.scrollTo(0, 0);
}
// Para un alumno: «Aplicar» con el borrador (reemplazar o agregar, y los días que van).
function alAlumno(st, nombre, days, ia){
  CoachState.coachIA = null; renderRutinaIA();
  if (!CoachState.coachData || CoachState.coachData.id !== st.cliente || CoachState.coachSel !== st.cliente) return;
  CoachState.coachApplyPicker = { tplId: null, days: {}, mode: "replace", borrador: { name: nombre, days, ia, texto: st.texto } };
  renderApplyPicker();
}
// Lo que se aplicó del borrador queda en la rutina del alumno como cambio sin guardar, con el cartel.
export function borradorAplicado(b){
  const d = CoachState.coachData; if (!d || !b) return;
  d.ia = Object.assign({}, b.ia, { snap: JSON.stringify(d.routine || []) });
}

// «¿Está mal? Avisanos»: el pedido (ya limpio, el que fue a la IA), el borrador que armó y un comentario.
async function reportar(para){
  const ia = para === "tpl" ? (CoachState.coachTplEdit && CoachState.coachTplEdit.ia) : (CoachState.coachData && CoachState.coachData.ia);
  if (!ia || !ia.borrador) return;
  const com = await pedir("¿Qué está mal? Contanos (opcional). Mandamos tu pedido y la rutina que armó la IA.", "", { titulo: "¿Está mal?", ok: "Enviar", placeholder: "Ej: puso 7 ejercicios y pedí principiante" });
  if (com === null) return;
  const resp = { pedido: ia.pedido, borrador: JSON.parse(JSON.stringify(ia.borrador)) };
  while (JSON.stringify(resp).length > 59000 && Array.isArray(resp.borrador.dias) && resp.borrador.dias.length > 1) resp.borrador.dias.pop();
  try { await iaReportar("rutina", resp, String(com).slice(0, 300)); alert("Gracias, lo vamos a revisar."); }
  catch (e) { alert((e && e.message) || "No se pudo enviar. Probá de nuevo."); }
}

// ---------- Acciones (data-coach="ria-…", desde main.js) ----------
// «ria-» y no «pp-» ni «pl-»: esas son de «Pasar mis planillas» y del plan alimenticio.
export async function rutinaIAAction(a, b){
  const para = b && b.dataset && b.dataset.para === "alumno" ? "alumno" : "tpl";
  if (a === "ria-open"){ await abrirRutinaIA(para); return true; }
  if (a === "ria-cancel"){ cerrarHoja(); return true; }
  if (a === "ria-armar"){ await armar(); return true; }
  if (a === "ria-chip"){
    const st = CoachState.coachIA, w = b.dataset.t || "";
    if (!st || st.armando || !w) return true;
    const t = String(st.texto || "").trim();
    if (!t.toLowerCase().includes(w.toLowerCase())) st.texto = (t ? t.replace(/[,.;\s]+$/, "") + ", " : "") + w.toLowerCase();
    st.texto = st.texto.slice(0, MAX); st.msg = "";
    renderRutinaIA(); return true;
  }
  if (a === "ria-mal"){ await reportar(para); return true; }
  if (a === "ria-otra"){
    const tpl = para === "tpl", ia = tpl ? (CoachState.coachTplEdit && CoachState.coachTplEdit.ia) : (CoachState.coachData && CoachState.coachData.ia);
    if (!ia) return true;
    const ahora = JSON.stringify(tpl ? CoachState.coachTplEdit.days || [] : CoachState.coachData.routine || []);
    if (ahora !== ia.snap && !await confirmar("Ya le hiciste cambios a este borrador. Si pedís otra versión, la nueva " + (tpl ? "lo reemplaza." : "se aplica de nuevo.") + " ¿Seguir?", { titulo: "Pedir otra versión", ok: "Pedir otra" })) return true;
    await abrirRutinaIA(para, ia.pedido || ""); return true;
  }
  if (a === "ria-seguir"){
    const d = leerBorradorIA(); if (!d) { renderCoach(); return true; }
    CoachState.coachTplEdit = { id: d.id || null, name: d.name || "", days: d.days, revisar: Array.isArray(d.revisar) ? d.revisar : [], ia: d.ia, orig0: VACIA };
    CoachState.coachEditDay = 0; CoachState.coachExpandedEx = new Set();
    renderCoach(); window.scrollTo(0, 0); return true;
  }
  if (a === "ria-descartar"){
    if (!await confirmar("¿Descartar la rutina armada con IA? No queda en ningún lado.", { titulo: "Descartar", ok: "Descartar", peligro: true })) return true;
    try { const k = clave(); if (k) localStorage.removeItem(k); } catch (e) {}
    renderCoach(); return true;
  }
  return false;
}

// El pedido mientras se escribe (sin volver a dibujar la hoja: no se pierde el foco).
document.addEventListener("input", e => {
  const t = e.target, st = CoachState.coachIA;
  if (!st || !t || t.id !== "riaTexto") return;
  st.texto = t.value.slice(0, MAX);
  if (st.msg && !st.armando){ st.msg = ""; renderRutinaIA(); return; }
  const c = document.querySelector("#riaMount .ria-cuenta"); if (c) c.textContent = st.texto.length + "/" + MAX;
});

// Para las pruebas y para depurar.
export const _rutinaIA = () => ({ activo, pedidoN });
