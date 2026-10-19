// «Bloquear»: el menú del «⋯» de un mensaje recibido en el chat (ui/chat.js) o de otro miembro de
// un grupo de pasos (screens/pasos.js), con «Reportar…» (ui/reportar.js) y «Bloquear a …»; la
// confirmación de bloquear y la lista «Personas bloqueadas» de Configuración (alumno y coach).
// Lo pide Apple (guía 1.2): además de reportar, cada uno tiene que poder bloquear a quien lo
// molesta. Llama a block_user, my_blocks y unblock_user (supabase/bloqueos.sql): lo que pasa al
// bloquear lo hace la base (se corta el vínculo coach ↔ alumno, sale de los grupos que armé). A la
// otra persona no se le avisa.
// Es una hoja propia (#blockHost) que se dibuja sola, encima de todo como la de «Reportar»: no
// depende de renderApp. Al bloquear avisa con el evento "gize:bloqueo" ({ kind, ref, target,
// desvinculado }) y cada pantalla se pone al día (main.js: la cuenta o la lista de alumnos;
// screens/pasos.js: el grupo).
// La lista se abre con cualquier botón que tenga data-bloqueados (Configuración del alumno y del
// coach).

import { State } from '../core/state.js';

import { esc } from '../core/utils.js';

import { abrirReporte } from './reportar.js';

const NO_SALIO = "No se pudo, probá de nuevo.";
const DESBLOQUEAR = "No le avisamos. Podés desbloquear cuando quieras en Configuración → Personas bloqueadas.";

// Hoja abierta:
//   menu:      { titulo, cita, reportar (lo de abrirReporte + etiqueta), bloquear (lo de abajo + etiqueta) }
//   confirmar: { kind, ref, target, nombre, texto, listo, alCerrar, estado ("", "enviando", "listo"), error }
//   lista:     { items (null: cargando), errorCarga, error, quitando (id) }
let B = null;
let cierre = 0;

function host(){
  let h = document.getElementById("blockHost");
  if(!h){ h = document.createElement("div"); h.id = "blockHost"; document.body.appendChild(h); }
  return h;
}

function mostrar(){
  cierre++;
  host().innerHTML = '<div class="sheet-bg" data-blq="cancel"></div>' +
    '<div class="sheet blq-sheet" role="dialog" aria-modal="true" aria-labelledby="blqT">' + cuerpo() + '</div>';
}

// Se redibuja solo lo de adentro (no la hoja entera, que volvería a subir).
function pintar(){
  const card = document.querySelector("#blockHost .blq-sheet"); if(!card || !B) return;
  card.innerHTML = cuerpo();
}

// Menú del «⋯»: qué es (titulo y cita) y las dos opciones. o: { titulo, cita, reportar (lo de
// abrirReporte, con la etiqueta del botón), bloquear (lo de confirmacion, con la etiqueta) }
export function abrirOpciones(o){
  B = { modo: "menu", titulo: o.titulo || "", cita: o.cita || "", reportar: o.reportar || null, bloquear: o.bloquear || null };
  mostrar();
}

// La confirmación de bloquear (la opción del menú). o: { kind ("chat" | "grupo"), ref (mensaje o
// grupo), target (la otra punta del vínculo, o el miembro como lo da el ranking), nombre, texto (qué
// pasa), listo (lo que dice al terminar), alCerrar (al cerrar la hoja después de bloquear) }
const confirmacion = o => ({ modo: "confirmar", kind: o.kind, ref: o.ref ? String(o.ref) : null, target: o.target || null, nombre: o.nombre || "esta persona",
  texto: o.texto || "", listo: o.listo || "", alCerrar: o.alCerrar || null, estado: "", error: "" });

// «Personas bloqueadas».
export function abrirBloqueados(){
  B = { modo: "lista", items: null, errorCarga: false, error: "", quitando: null };
  mostrar();
  cargarLista();
}

// rapido: sin la animación de bajar (cuando se abre otra hoja en su lugar).
export function cerrarBloqueo(rapido){
  if(!B) return;
  B = null;
  const h = document.getElementById("blockHost"); if(!h) return;
  const card = h.querySelector(".sheet"), bg = h.querySelector(".sheet-bg");
  const quieto = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if(rapido || !card || quieto){ h.innerHTML = ""; return; }
  card.classList.add("closing"); if(bg) bg.classList.add("closing");
  const n = ++cierre;
  setTimeout(() => { if(n === cierre && !B) h.innerHTML = ""; }, 220);
}

// Cancelar, tocar afuera, Escape o el «Atrás» de Android. Después de bloquear, también lo que
// pidió quien abrió la hoja (el chat se cierra: ya no están vinculados).
function cancelar(){
  const fin = B && B.modo === "confirmar" && B.estado === "listo" ? B.alCerrar : null;
  cerrarBloqueo();
  if(fin) fin();
}

function cuerpo(){
  const b = B;
  if(b.modo === "menu"){
    const op = (a, x, cls) => x ? '<button type="button" class="blq-opt' + cls + '" data-blq="' + a + '">' + esc(x.etiqueta || "") + '</button>' : '';
    return '<div class="sheet-title" id="blqT">' + esc(b.titulo) + '</div>' +
      (b.cita ? '<div class="rep-cita">' + esc(b.cita) + '</div>' : '') +
      '<div class="blq-opts">' + op("reportar", b.reportar, "") + op("bloquear", b.bloquear, " danger") + '</div>' +
      '<div class="sheet-btns"><button class="ctrl ghost" data-blq="cancel">Cancelar</button></div>';
  }
  if(b.modo === "lista") return listaHtml(b);
  if(b.estado === "listo") return '<div class="sheet-title" id="blqT">Bloqueaste a ' + esc(b.nombre) + '</div>' +
    (b.listo ? '<p class="blq-txt">' + esc(b.listo) + '</p>' : '') +
    '<div class="sheet-btns"><button class="ctrl primary" data-blq="cancel">Listo</button></div>';
  const env = b.estado === "enviando";
  return '<div class="sheet-title" id="blqT">¿Bloquear a ' + esc(b.nombre) + '?</div>' +
    (b.texto ? '<p class="blq-txt blq-que">' + esc(b.texto) + '</p>' : '') +
    '<p class="blq-txt">' + DESBLOQUEAR + '</p>' +
    (b.error ? '<div class="rep-err" role="alert">' + esc(b.error) + '</div>' : '') +
    '<div class="sheet-btns"><button class="ctrl ghost" data-blq="cancel">Cancelar</button>' +
    '<button class="ctrl blq-si" data-blq="si"' + (env ? ' disabled' : '') + '>' + (env ? 'Bloqueando…' : 'Bloquear') + '</button></div>';
}

function listaHtml(b){
  let medio;
  if(b.errorCarga) medio = '<div class="rep-err" role="alert">' + NO_SALIO + '</div>' +
    '<div class="sheet-btns blq-reintentar"><button class="ctrl ghost" data-blq="cargar">Reintentar</button></div>';
  else if(b.items === null) medio = '<p class="blq-txt">Cargando…</p>';
  else if(!b.items.length) medio = '<p class="blq-vacio">No bloqueaste a nadie.</p>';
  else medio = '<div class="blq-list">' + b.items.map(x => '<div class="blq-row"><span class="blq-name">' + esc(x.nombre || "Sin nombre") + '</span>' +
      '<button type="button" class="blq-un" data-blq="des" data-id="' + esc(String(x.id)) + '" aria-label="Desbloquear a ' + esc(x.nombre || "Sin nombre") + '"' +
      (b.quitando ? ' disabled' : '') + '>' + (b.quitando === String(x.id) ? 'Desbloqueando…' : 'Desbloquear') + '</button></div>').join("") + '</div>' +
    '<p class="blq-txt">Al desbloquear a alguien no se vuelven a vincular ni vuelve a tus grupos: si quiere, se vuelve a sumar con el código.</p>';
  return '<div class="sheet-title" id="blqT">Personas bloqueadas</div>' + medio +
    (b.error ? '<div class="rep-err" role="alert">' + esc(b.error) + '</div>' : '') +
    '<div class="sheet-btns"><button class="ctrl ghost" data-blq="cancel">Cerrar</button></div>';
}

// Un error de la base escrito para la persona (P0001: el tope del día, alguien que ya no está) se
// muestra tal cual; cualquier otro (sin internet, la base sin bloqueos.sql) es el genérico.
const mensaje = e => (e && e.code === "P0001" && e.message) ? String(e.message) : NO_SALIO;

async function rpc(name, args){
  if(!State.sb || !State.cloudUser) throw new Error("sin sesión");
  const r = await State.sb.rpc(name, args);
  if(r.error) throw r.error;
  return r.data;
}

async function bloquear(){
  const b = B; if(!b || b.modo !== "confirmar" || b.estado) return;
  b.estado = "enviando"; b.error = ""; pintar();
  try{
    const r = await rpc("block_user", { p_kind: b.kind, p_ref: b.ref, p_target: b.target });
    b.estado = "listo";
    // Aunque ya se haya cerrado la hoja: el bloqueo está hecho y la app se pone al día (y, si se
    // cerró mientras salía, también lo de después: el chat se cierra).
    window.dispatchEvent(new CustomEvent("gize:bloqueo", { detail: { kind: b.kind, ref: b.ref, target: b.target, desvinculado: !!(r && r.desvinculado) } }));
    if(B !== b && b.alCerrar) b.alCerrar();
  }catch(e){ b.estado = ""; b.error = mensaje(e); }
  if(B === b) pintar();
}

async function cargarLista(){
  const b = B; if(!b || b.modo !== "lista") return;
  b.items = null; b.errorCarga = false; b.error = ""; pintar();
  try{
    const d = await rpc("my_blocks");
    b.items = Array.isArray(d) ? d : [];
  }catch(e){ b.errorCarga = true; }
  if(B === b) pintar();
}

async function desbloquear(id){
  const b = B; if(!b || b.modo !== "lista" || b.quitando || !id) return;
  b.quitando = id; b.error = ""; pintar();
  try{
    await rpc("unblock_user", { p_id: id });
    // false: ya no estaba (se desbloqueó desde otro dispositivo). Sale de la lista igual.
    b.items = (b.items || []).filter(x => String(x.id) !== id);
  }catch(e){ b.error = mensaje(e); }
  b.quitando = null;
  if(B === b) pintar();
}

document.addEventListener("click", e => {
  const t = e.target;
  if(t.closest && t.closest("[data-bloqueados]")){ abrirBloqueados(); return; }
  if(!B) return;
  const b = t.closest && t.closest("#blockHost [data-blq]"); if(!b || b.disabled) return;
  const a = b.dataset.blq;
  if(a === "cancel") cancelar();
  else if(a === "reportar" && B.reportar){ const r = B.reportar; cerrarBloqueo(true); abrirReporte(r); }
  else if(a === "bloquear" && B.bloquear){ B = confirmacion(B.bloquear); pintar(); }
  else if(a === "si") bloquear();
  else if(a === "cargar") cargarLista();
  else if(a === "des") desbloquear(b.dataset.id);
});

// Escape cierra la hoja y nada más (el chat o la Configuración de atrás quedan abiertos).
document.addEventListener("keydown", e => {
  if(B && e.key === "Escape"){ e.stopPropagation(); cancelar(); }
}, true);
