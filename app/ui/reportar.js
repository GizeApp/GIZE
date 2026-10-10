// «Reportar»: la hoja de abajo para reportar un mensaje recibido en el chat (ui/chat.js) o a
// alguien de un grupo de pasos (screens/pasos.js). Lo piden Apple y Google Play en las apps donde
// la gente intercambia contenido. Manda report_content (supabase/reportes.sql), que mira que quien
// reporta pueda ver lo que reporta y no suma repetidos; lo revisa un administrador en el panel
// (gize.ar/admin → Reportes). A la persona reportada no se le avisa.
// Es una hoja propia (#reportHost) que se dibuja sola, encima de todo (también del chat): no
// depende de renderApp, así lo que se está escribiendo no se pierde si la app se redibuja atrás.

import { State } from '../core/state.js';

import { esc } from '../core/utils.js';

// Los mismos motivos que acepta la base.
export const MOTIVOS = [["ofensivo", "Contenido ofensivo o acoso"], ["spam", "Spam"], ["otro", "Otro"]];
const MAX_NOTA = 500;
const NO_SALIO = "No se pudo enviar, probá de nuevo.";

// Reporte abierto: { kind, ref, reported, titulo, cita, pie, motivo, nota, estado ("", "enviando", "listo"), error }
let R = null;
let cierre = 0;

function host(){
  let h = document.getElementById("reportHost");
  if(!h){ h = document.createElement("div"); h.id = "reportHost"; document.body.appendChild(h); }
  return h;
}

export const reporteAbierto = () => !!R;

// o: { kind: "chat" | "grupo", ref: id del mensaje o del grupo, reported: la persona (en un grupo,
// el miembro como lo da el ranking), titulo, cita (lo que se reporta, para que se vea), pie }
export function abrirReporte(o){
  cierre++;
  R = { kind: o.kind, ref: String(o.ref || ""), reported: o.reported || null, titulo: o.titulo || "Reportar",
        cita: o.cita || "", pie: o.pie || "", motivo: "", nota: "", estado: "", error: "" };
  host().innerHTML = '<div class="sheet-bg" data-rep="cancel"></div>' +
    '<div class="sheet rep-sheet" role="dialog" aria-modal="true" aria-labelledby="repT">' + cuerpo() + '</div>';
}

export function cerrarReporte(){
  if(!R) return;
  R = null;
  const h = document.getElementById("reportHost"); if(!h) return;
  const card = h.querySelector(".sheet"), bg = h.querySelector(".sheet-bg");
  const quieto = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if(!card || quieto){ h.innerHTML = ""; return; }
  card.classList.add("closing"); if(bg) bg.classList.add("closing");
  const n = ++cierre;
  setTimeout(() => { if(n === cierre && !R) h.innerHTML = ""; }, 220);
}

// Lo de adentro de la hoja. Se redibuja solo esto (no la hoja entera, que volvería a subir).
function cuerpo(){
  const r = R;
  if(r.estado === "listo") return '<div class="sheet-title" id="repT">Gracias, lo vamos a revisar.</div>' +
    '<p class="rep-txt">Si hace falta, el equipo de GIZE toma medidas. La otra persona no se entera de que la reportaste.</p>' +
    '<div class="sheet-btns"><button class="ctrl primary" data-rep="cancel">Listo</button></div>';
  const env = r.estado === "enviando";
  return '<div class="sheet-title" id="repT">' + esc(r.titulo) + '</div>' +
    (r.cita ? '<div class="rep-cita">' + esc(r.cita) + '</div>' : '') +
    '<div class="rep-lbl" id="repL">¿Qué pasa?</div>' +
    '<div class="rep-opts" role="radiogroup" aria-labelledby="repL">' + MOTIVOS.map(([v, l]) =>
      '<button type="button" class="rep-opt' + (r.motivo === v ? ' on' : '') + '" role="radio" aria-checked="' + (r.motivo === v) + '" data-rep="motivo" data-v="' + v + '">' + esc(l) + '</button>').join("") + '</div>' +
    '<textarea id="repNota" class="form-input rep-nota" rows="2" maxlength="' + MAX_NOTA + '" placeholder="Contanos qué pasó (opcional)" aria-label="Contanos qué pasó (opcional)">' + esc(r.nota) + '</textarea>' +
    '<p class="rep-txt">No le avisamos a la otra persona.' + (r.pie ? ' ' + esc(r.pie) : '') + '</p>' +
    (r.error ? '<div class="rep-err" role="alert">' + esc(r.error) + '</div>' : '') +
    '<div class="sheet-btns"><button class="ctrl ghost" data-rep="cancel">Cancelar</button>' +
    '<button class="ctrl primary" data-rep="send"' + (r.motivo && !env ? '' : ' disabled') + '>' + (env ? 'Enviando…' : 'Enviar') + '</button></div>';
}

function pintar(){
  const card = document.querySelector("#reportHost .rep-sheet"); if(!card || !R) return;
  card.innerHTML = cuerpo();
}

// Un error de la base escrito para la persona (P0001: el tope del día, un mensaje que ya no
// existe) se muestra tal cual; cualquier otro (sin internet, la base sin reportes.sql) es el
// genérico.
const mensaje = e => (e && e.code === "P0001" && e.message) ? String(e.message) : NO_SALIO;

async function enviar(){
  const r = R; if(!r || !r.motivo || r.estado === "enviando") return;
  const t = document.getElementById("repNota"); if(t) r.nota = t.value;
  r.estado = "enviando"; r.error = ""; pintar();
  let error = "";
  try{
    if(!State.sb || !State.cloudUser) throw new Error("sin sesión");
    const res = await State.sb.rpc("report_content", { p_kind: r.kind, p_ref: r.ref, p_reported: r.reported, p_reason: r.motivo,
      p_detail: r.nota.trim().slice(0, MAX_NOTA) || null });
    if(res.error) error = mensaje(res.error);
  }catch(e){ error = NO_SALIO; }
  if(R !== r) return;
  r.estado = error ? "" : "listo"; r.error = error;
  pintar();
}

document.addEventListener("click", e => {
  if(!R) return;
  const b = e.target.closest && e.target.closest("#reportHost [data-rep]"); if(!b || b.disabled) return;
  const a = b.dataset.rep;
  if(a === "cancel") cerrarReporte();
  else if(a === "send") enviar();
  else if(a === "motivo"){
    R.motivo = b.dataset.v;
    // Sin redibujar: la nota a medio escribir queda como está.
    document.querySelectorAll("#reportHost .rep-opt").forEach(x => { const on = x === b; x.classList.toggle("on", on); x.setAttribute("aria-checked", String(on)); });
    const s = document.querySelector('#reportHost [data-rep="send"]'); if(s && R.estado !== "enviando") s.disabled = false;
  }
});

document.addEventListener("input", e => { if(R && e.target && e.target.id === "repNota") R.nota = e.target.value; });

// Escape cierra la hoja y nada más (el chat de atrás queda abierto).
document.addEventListener("keydown", e => {
  if(R && e.key === "Escape"){ e.stopPropagation(); cerrarReporte(); }
}, true);
