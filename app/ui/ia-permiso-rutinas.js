// «Usar IA en tus rutinas»: el permiso del coach, una sola vez, antes del primer uso de «Pasar mis
// planillas» o de «Armar con IA» (como pide Apple 5.1.2(i): antes de mandar nada a una IA de
// afuera). Es uno solo para las dos funciones y va aparte del de Comida (app/ui/ia-permiso.js),
// con su host, sus textos y su versión. El texto es el de la política de privacidad
// (privacidad/index.html#ia-coach); si cambia, se sube ia_config.aviso_rutinas_version
// (supabase/ia.sql) y se vuelve a preguntar. También lo usa Configuración → Privacidad al prenderlo.
// Es una hoja propia (#iaRutHost), encima de todo, como «Reportar»: no depende de renderCoach.
//   pedirPermisoRutinas() → true (aceptó, o ya había aceptado) / false (no aceptó, o lo había apagado).
import { State } from '../core/state.js';
import { iaGuardarPermisoRutinas, iaRutinasPermiso } from '../core/ia-coach.js';
import { iaToast } from './ia-permiso.js';
import { alertSvg, clockSvg, fileTextSvg, infoSvg, shieldSvg, sparkleSvg, toggleSvg } from '../core/icons.js';

const POLITICA = "https://gize.ar/privacidad/?app=1#ia-coach";

// El texto del permiso (versión 1 del aviso: ya explica las planillas y «Armar con IA», así no se
// vuelve a preguntar cuando salga la segunda). Un cambio acá va con un aviso_rutinas_version nuevo.
// Sin precios, planes ni links de pago: lo ven también los coaches en las apps.
export const RUTINAS_TITULO = "Usar IA en tus rutinas";
export const RUTINAS_INTRO = "Para pasar tus planillas a GIZE o armar una rutina con IA, GIZE manda a Anthropic, la empresa que hace la IA Claude, en Estados Unidos, lo justo para armar el borrador.";
export const RUTINAS_PUNTOS = [
  "No se manda tu nombre, tu mail ni otros datos de tu cuenta o de tus alumnos. Con «Armar con IA» va el pedido que escribís: no pongas nombres ni datos de salud de tus alumnos.",
  "De tus planillas van solo los ejercicios (series, repeticiones, cargas, descansos y notas). La planilla se lee en tu equipo y, antes de mandarla, GIZE saca mails, teléfonos, documentos, links y filas con datos personales o de salud, y cambia los nombres de tus alumnos, de la hoja y del archivo por «[alumno]».",
  "Anthropic lo usa solo para armar el borrador, no lo usa para entrenar su IA y lo borra dentro de los 30 días (salvo que deba guardarlo más para investigar un abuso o porque lo exija la ley).",
  "GIZE no guarda tus planillas ni tus pedidos: guarda solo las rutinas que vos guardás (y lo que mandes con «¿Está mal? Avisanos»).",
  "Lo que arma la IA es un borrador y puede tener errores: revisalo antes de guardarlo o de dárselo a un alumno. No es consejo médico.",
  "Es opcional: si no aceptás, armás tus rutinas a mano como siempre. Lo podés apagar cuando quieras en Configuración → Privacidad.",
];
export const RUTINAS_CIERRE = "Al tocar «Aceptar y usar IA» aceptás que esto se envíe a Anthropic, en EE. UU., para armar tus borradores.";

// El ícono de cada punto (en el mismo orden): lo que no se manda, las planillas, cuánto lo guardan,
// lo que no guarda GIZE, que es un borrador y que es opcional.
const PUNTOS_IC = [shieldSvg, fileTextSvg, clockSvg, infoSvg, alertSvg, toggleSvg];

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let abierta = null; // { listo, volver, guardando, desdeAjustes }
let avisando = false; // el cartel de «Apagaste…» está abierto

function host(){
  let h = document.getElementById("iaRutHost");
  if (!h) { h = document.createElement("div"); h.id = "iaRutHost"; document.body.appendChild(h); }
  return h;
}

// Lo había apagado: no se le vuelve a preguntar sola. El cartel lleva a Configuración → Privacidad
// con el mismo botón de la barra (así pregunta antes si hay una rutina sin guardar).
async function avisarApagado(){
  avisando = true;
  let ir;
  try { ir = await confirmar("Apagaste «Usar IA en tus rutinas». Si la querés usar, prendela en Configuración → Privacidad.", { titulo: RUTINAS_TITULO, ok: "Ir a Configuración" }); }
  finally { avisando = false; }
  if (!ir) return;
  const ref = document.querySelector('#coachHost [data-coach="open-settings"]');
  const b = ref ? ref.cloneNode(false) : document.createElement("button");
  b.hidden = true; b.dataset.coach = "open-settings"; b.dataset.sec = "privacidad";
  ((ref && ref.parentNode) || document.body).appendChild(b);
  b.click(); b.remove();
}

// Muestra la hoja y espera la respuesta. Con el permiso vigente devuelve true sin mostrar nada.
// desdeAjustes: lo prende el coach desde Configuración (sin el cartel de «Apagaste…» ni el aviso
// de «Ahora no»).
export async function pedirPermisoRutinas({ desdeAjustes = false } = {}){
  const pm = iaRutinasPermiso();
  if (pm === "ok") return true;
  if (!State.cloudUser) return false;
  if (abierta || avisando) return false;
  if (pm === "no" && !desdeAjustes) { await avisarApagado(); return false; }
  return new Promise(listo => {
    abierta = { listo, volver: document.activeElement, guardando: false, desdeAjustes };
    host().innerHTML = '<div class="sheet-bg" data-iar="no"></div>' +
      '<div class="sheet ia-perm" role="dialog" aria-modal="true" aria-labelledby="iaRutT" aria-describedby="iaRutD">' +
        '<div class="ia-perm-h"><span class="ia-perm-hero" aria-hidden="true">' + sparkleSvg + '</span>' +
        '<div class="sheet-title" id="iaRutT">' + esc(RUTINAS_TITULO) + '</div></div>' +
        '<div class="ia-perm-txt" id="iaRutD"><p>' + esc(RUTINAS_INTRO) + '</p><ul>' + RUTINAS_PUNTOS.map((p, i) => '<li><span class="ia-perm-ic" aria-hidden="true">' + (PUNTOS_IC[i] || shieldSvg) + '</span><span>' + esc(p) + '</span></li>').join("") + '</ul>' +
        '<p class="ia-perm-cierre">' + esc(RUTINAS_CIERRE) + '</p></div>' +
        '<div class="ia-perm-err" role="alert" hidden></div>' +
        '<div class="ia-perm-btns"><button type="button" class="ctrl primary" data-iar="si">Aceptar y usar IA</button>' +
        '<button type="button" class="ctrl ghost" data-iar="no">Ahora no</button></div>' +
        '<a class="ia-perm-link" href="' + POLITICA + '" target="_blank" rel="noopener">Política de privacidad</a>' +
      '</div>';
    document.addEventListener("keydown", tecla, true);
    requestAnimationFrame(() => { const b = document.querySelector('#iaRutHost [data-iar="si"]'); if (b) try { b.focus({ preventScroll: true }); } catch (e) {} });
  });
}

function cerrar(valor){
  const a = abierta; if (!a) return;
  abierta = null;
  document.removeEventListener("keydown", tecla, true);
  const h = document.getElementById("iaRutHost");
  const card = h && h.querySelector(".sheet"), bg = h && h.querySelector(".sheet-bg");
  const quieto = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fin = () => { if (!abierta && h) h.innerHTML = ""; };
  if (!card || quieto) fin();
  else { card.classList.add("closing"); if (bg) bg.classList.add("closing"); setTimeout(fin, 220); }
  if (a.volver && a.volver.isConnected) try { a.volver.focus({ preventScroll: true }); } catch (e) {}
  if (!valor && !a.desdeAjustes) iaToast("Sin problema. La podés prender cuando quieras en Configuración → Privacidad.");
  a.listo(valor);
}

// Escape = «Ahora no»; Tab da la vuelta adentro de la hoja.
function tecla(e){
  if (!abierta) return;
  if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (!abierta.guardando) cerrar(false); return; }
  if (e.key === "Tab") {
    const l = [...document.querySelectorAll('#iaRutHost .sheet button:not([disabled]), #iaRutHost .sheet a[href]')];
    if (!l.length) return;
    const i = l.indexOf(document.activeElement);
    if (e.shiftKey ? i <= 0 : i === l.length - 1) { e.preventDefault(); l[e.shiftKey ? l.length - 1 : 0].focus(); }
  }
}

document.addEventListener("click", async e => {
  const b = e.target.closest && e.target.closest("#iaRutHost [data-iar]");
  if (!b || !abierta) return;
  if (b.dataset.iar === "no") { if (!abierta.guardando) cerrar(false); return; }
  if (abierta.guardando) return;
  abierta.guardando = true; b.disabled = true; b.textContent = "Guardando…";
  const err = document.querySelector("#iaRutHost .ia-perm-err");
  try { await iaGuardarPermisoRutinas(true); cerrar(true); }
  catch (x) {
    if (!abierta) return;
    abierta.guardando = false; b.disabled = false; b.textContent = "Aceptar y usar IA";
    if (err) { err.hidden = false; err.textContent = x.message || "No se pudo guardar. Probá de nuevo."; }
  }
});
