// «Usar IA en Comida»: el permiso, una sola vez, antes del primer uso de la foto del plato (y antes
// de abrir la cámara o la galería, como pide Apple 5.1.2(i)). Solo se manda la foto: la aclaración
// escrita («¿Qué es?») se sacó, y con ella «(y lo que escribas)» y «tu texto» (aviso versión 2).
// El texto es el de la política de privacidad (privacidad/index.html#ia); si cambia, se sube
// ia_config.aviso_version (supabase/ia.sql) y se vuelve a preguntar. También lo usa Ajustes →
// Funciones con IA al prenderla.
// Es una hoja propia (#iaPermHost), encima de todo, como «Reportar»: no depende de renderApp.
//   pedirPermisoIA() → true (aceptó, o ya había aceptado) / false (no aceptó, o la había apagado).
import { State } from '../core/state.js';
import { iaGuardarPermiso, iaPermiso } from '../core/ia.js';
import { alertSvg, clockSvg, imageSvg, shieldSvg, sparkleSvg, toggleSvg } from '../core/icons.js';

const POLITICA = "https://gize.ar/privacidad/?app=1#ia";

// El texto del permiso (§7.2 de la propuesta, el mismo de la política). Un cambio acá va con un
// aviso_version nuevo en supabase/ia.sql.
export const PERMISO_TITULO = "Usar IA en Comida";
export const PERMISO_INTRO = "Para leer la tabla nutricional o calcular tu plato, GIZE manda la foto que elegís a Anthropic, la empresa que hace la IA Claude, en Estados Unidos.";
export const PERMISO_PUNTOS = [
  "Solo se manda la foto: no tu nombre, tu mail ni otros datos de tu cuenta.",
  "Anthropic la usa solo para darte el resultado, no la usa para entrenar su IA y la borra dentro de los 30 días (salvo que deba guardarla más para investigar un abuso o porque lo exija la ley).",
  "GIZE no guarda la foto del plato. La foto de un producto nuevo se guarda, como siempre, para que el equipo de GIZE lo revise.",
  "Los valores son estimados y pueden tener errores: revisalos antes de guardar. No es consejo médico ni nutricional.",
  "Es opcional: si no aceptás, podés cargar todo a mano o con el código de barras. Podés desactivarlo cuando quieras en Ajustes → Funciones con IA.",
];
export const PERMISO_CIERRE = "Al tocar «Aceptar y usar IA» aceptás que tu foto se envíe a Anthropic, en EE. UU., para esto.";

// El ícono de cada punto (en el mismo orden que PERMISO_PUNTOS): lo que se manda, cuánto lo guardan,
// la foto del plato, que son estimados y que es opcional.
const PUNTOS_IC = [shieldSvg, clockSvg, imageSvg, alertSvg, toggleSvg];

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let abierta = null; // { listo, volver, guardando }

function host(){
  let h = document.getElementById("iaPermHost");
  if (!h) { h = document.createElement("div"); h.id = "iaPermHost"; document.body.appendChild(h); }
  return h;
}

// Aviso chico abajo, que se va solo (no frena nada).
export function iaToast(msg){
  let t = document.getElementById("iaToast");
  if (!t) { t = document.createElement("div"); t.id = "iaToast"; t.className = "ia-toast"; t.setAttribute("role", "status"); t.setAttribute("aria-live", "polite"); document.body.appendChild(t); }
  t.textContent = msg; t.classList.add("show");
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("show"), 4200);
}

// Muestra la hoja y espera la respuesta. Con el permiso vigente devuelve true sin mostrar nada.
// desdeAjustes: lo prende la persona desde Ajustes (sin el aviso de «Ahora no»).
export function pedirPermisoIA({ desdeAjustes = false } = {}){
  if (iaPermiso() === "ok") return Promise.resolve(true);
  if (!State.cloudUser) return Promise.resolve(false);
  if (abierta) return Promise.resolve(false);
  return new Promise(listo => {
    abierta = { listo, volver: document.activeElement, guardando: false, desdeAjustes };
    host().innerHTML = '<div class="sheet-bg" data-ia="no"></div>' +
      '<div class="sheet ia-perm" role="dialog" aria-modal="true" aria-labelledby="iaPermT" aria-describedby="iaPermD">' +
        '<div class="ia-perm-h"><span class="ia-perm-hero" aria-hidden="true">' + sparkleSvg + '</span>' +
        '<div class="sheet-title" id="iaPermT">' + esc(PERMISO_TITULO) + '</div></div>' +
        '<div class="ia-perm-txt" id="iaPermD"><p>' + esc(PERMISO_INTRO) + '</p><ul>' + PERMISO_PUNTOS.map((p, i) => '<li><span class="ia-perm-ic" aria-hidden="true">' + (PUNTOS_IC[i] || shieldSvg) + '</span><span>' + esc(p) + '</span></li>').join("") + '</ul>' +
        '<p class="ia-perm-cierre">' + esc(PERMISO_CIERRE) + '</p></div>' +
        '<div class="ia-perm-err" role="alert" hidden></div>' +
        '<div class="ia-perm-btns"><button type="button" class="ctrl primary" data-ia="si">Aceptar y usar IA</button>' +
        '<button type="button" class="ctrl ghost" data-ia="no">Ahora no</button></div>' +
        '<a class="ia-perm-link" href="' + POLITICA + '" target="_blank" rel="noopener">Política de privacidad</a>' +
      '</div>';
    document.addEventListener("keydown", tecla, true);
    requestAnimationFrame(() => { const b = document.querySelector('#iaPermHost [data-ia="si"]'); if (b) try { b.focus({ preventScroll: true }); } catch (e) {} });
  });
}

function cerrar(valor){
  const a = abierta; if (!a) return;
  abierta = null;
  document.removeEventListener("keydown", tecla, true);
  const h = document.getElementById("iaPermHost");
  const card = h && h.querySelector(".sheet"), bg = h && h.querySelector(".sheet-bg");
  const quieto = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fin = () => { if (!abierta && h) h.innerHTML = ""; };
  if (!card || quieto) fin();
  else { card.classList.add("closing"); if (bg) bg.classList.add("closing"); setTimeout(fin, 220); }
  if (a.volver && a.volver.isConnected) try { a.volver.focus({ preventScroll: true }); } catch (e) {}
  if (!valor && !a.desdeAjustes) iaToast("Sin problema. La podés activar cuando quieras en Ajustes.");
  a.listo(valor);
}

// Escape = «Ahora no»; Tab da la vuelta adentro de la hoja.
function tecla(e){
  if (!abierta) return;
  if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (!abierta.guardando) cerrar(false); return; }
  if (e.key === "Tab") {
    const l = [...document.querySelectorAll('#iaPermHost .sheet button:not([disabled]), #iaPermHost .sheet a[href]')];
    if (!l.length) return;
    const i = l.indexOf(document.activeElement);
    if (e.shiftKey ? i <= 0 : i === l.length - 1) { e.preventDefault(); l[e.shiftKey ? l.length - 1 : 0].focus(); }
  }
}

document.addEventListener("click", async e => {
  const b = e.target.closest && e.target.closest("#iaPermHost [data-ia]");
  if (!b || !abierta) return;
  if (b.dataset.ia === "no") { if (!abierta.guardando) cerrar(false); return; }
  if (abierta.guardando) return;
  abierta.guardando = true; b.disabled = true; b.textContent = "Guardando…";
  const err = document.querySelector("#iaPermHost .ia-perm-err");
  try { await iaGuardarPermiso(true); cerrar(true); }
  catch (x) {
    if (!abierta) return;
    abierta.guardando = false; b.disabled = false; b.textContent = "Aceptar y usar IA";
    if (err) { err.hidden = false; err.textContent = x.message || "No se pudo guardar. Probá de nuevo."; }
  }
});
