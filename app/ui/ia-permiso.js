// «Usar IA en Comida»: el permiso, una sola vez, antes del primer uso de la foto del plato (y antes
// de abrir la cámara o la galería, como pide Apple 5.1.2(i)) o de la voz (antes de mandar lo que
// contó). Hay dos textos:
// - el de la foto (aviso versión 2, ia_config.aviso_version): solo se manda la foto. Es el que se
//   muestra mientras la voz no esté lista (la base sin aviso_texto o la voz apagada en el panel).
// - el de la voz (versión 3, PERMISO_VERSION = ia_config.aviso_texto): también se manda lo que la
//   persona cuenta, escrito o dictado con el teclado (GIZE no graba la voz). Quien aceptó el de la
//   foto sigue usando la foto sin que le pregunten de nuevo; este le sale la primera vez que usa la voz.
// El texto es el de la política de privacidad (privacidad/index.html#ia); si cambia, se sube la
// versión en supabase/ia.sql y se vuelve a preguntar. También lo usa Ajustes → Funciones con IA al
// prenderla.
// Es una hoja propia (#iaPermHost), encima de todo, como «Reportar»: no depende de renderApp.
//   pedirPermisoIA({ texto }) → true (aceptó, o ya había aceptado) / false (no aceptó, o la había
//   apagado). texto: para la voz (mira permiso_texto).
import { State } from '../core/state.js';
import { AVISO_VOZ, iaGuardarPermiso, iaPermiso, iaPermisoTexto, iaVozLista } from '../core/ia.js';
import { alertSvg, clockSvg, imageSvg, micSvg, shieldSvg, sparkleSvg, toggleSvg } from '../core/icons.js';

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

// El de la voz (versión 3): lo mismo, con lo que contás. Un cambio acá va con un aviso_texto nuevo.
export const PERMISO_VERSION = AVISO_VOZ;
export const PERMISO_VOZ_INTRO = "Para leer la tabla nutricional, calcular tu plato o entender lo que comiste, GIZE manda la foto que elegís o lo que contás (escrito o dictado) a Anthropic, la empresa que hace la IA Claude, en Estados Unidos.";
export const PERMISO_VOZ_PUNTOS = [
  "Solo se manda la foto o tu texto: no tu nombre, tu mail ni otros datos de tu cuenta.",
  "Si lo dictás, lo pasa a texto el teclado de tu celular: GIZE no graba tu voz.",
  "Anthropic los usa solo para darte el resultado, no los usa para entrenar su IA y los borra dentro de los 30 días (salvo que deba guardarlos más para investigar un abuso o porque lo exija la ley).",
  "GIZE no guarda la foto del plato ni lo que contás. La foto de un producto nuevo se guarda, como siempre, para que el equipo de GIZE lo revise.",
  "Los valores son estimados y pueden tener errores: revisalos antes de guardar. No es consejo médico ni nutricional.",
  "Es opcional: si no aceptás, podés cargar todo a mano o con el código de barras. Podés desactivarlo cuando quieras en Ajustes → Funciones con IA.",
];
export const PERMISO_VOZ_CIERRE = "Al tocar «Aceptar y usar IA» aceptás que tu foto o tu texto se envíen a Anthropic, en EE. UU., para esto.";
const PUNTOS_VOZ_IC = [shieldSvg, micSvg, clockSvg, imageSvg, alertSvg, toggleSvg];

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
// desdeAjustes: lo prende la persona desde Ajustes (sin el aviso de «Ahora no»). texto: es para la
// voz (hace falta haber aceptado el aviso de la voz). Con la voz lista se muestra (y se guarda) el
// aviso de la voz, también para la foto: así no se le vuelve a preguntar cuando use la voz.
export function pedirPermisoIA({ desdeAjustes = false, texto = false } = {}){
  if ((texto ? iaPermisoTexto() : iaPermiso()) === "ok") return Promise.resolve(true);
  if (!State.cloudUser) return Promise.resolve(false);
  if (abierta) return Promise.resolve(false);
  const voz = iaVozLista();
  const intro = voz ? PERMISO_VOZ_INTRO : PERMISO_INTRO, puntos = voz ? PERMISO_VOZ_PUNTOS : PERMISO_PUNTOS;
  const cierre = voz ? PERMISO_VOZ_CIERRE : PERMISO_CIERRE, iconos = voz ? PUNTOS_VOZ_IC : PUNTOS_IC;
  return new Promise(listo => {
    abierta = { listo, volver: document.activeElement, guardando: false, desdeAjustes, version: voz ? PERMISO_VERSION : null };
    host().innerHTML = '<div class="sheet-bg" data-ia="no"></div>' +
      '<div class="sheet ia-perm" role="dialog" aria-modal="true" aria-labelledby="iaPermT" aria-describedby="iaPermD">' +
        '<div class="ia-perm-h"><span class="ia-perm-hero" aria-hidden="true">' + sparkleSvg + '</span>' +
        '<div class="sheet-title" id="iaPermT">' + esc(PERMISO_TITULO) + '</div></div>' +
        '<div class="ia-perm-txt" id="iaPermD"><p>' + esc(intro) + '</p><ul>' + puntos.map((p, i) => '<li><span class="ia-perm-ic" aria-hidden="true">' + (iconos[i] || shieldSvg) + '</span><span>' + esc(p) + '</span></li>').join("") + '</ul>' +
        '<p class="ia-perm-cierre">' + esc(cierre) + '</p></div>' +
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
  try { await iaGuardarPermiso(true, abierta.version); cerrar(true); }
  catch (x) {
    if (!abierta) return;
    abierta.guardando = false; b.disabled = false; b.textContent = "Aceptar y usar IA";
    if (err) { err.hidden = false; err.textContent = x.message || "No se pudo guardar. Probá de nuevo."; }
  }
});
