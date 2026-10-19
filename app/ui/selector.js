// Selector propio de GIZE en lugar de la lista desplegable nativa del navegador (esa lista la dibuja el
// sistema y no se puede estilar: blanca en el celu, gris en la compu, con otra tipografía).
//
// Se engancha una sola vez a TODOS los <select> de la página (también a los que se dibujan después),
// así no hay que tocar cada pantalla: al tocar uno se abre este cartel con las mismas opciones, y al
// elegir se cambia el value del <select> y se dispara "input" y "change" como si lo hubiera hecho el
// navegador. Los <select multiple> y los que tengan data-nativo se dejan como están.
//
// En el celular sube como hoja desde abajo; en la compu es una tarjeta centrada. Se cierra con Escape,
// tocando afuera, o con el botón «atrás» de Android (ui/atras.js toca .sl-x).

import { circular } from "./avisos.js";

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

let abierto = null;

function cerrar(){
  const a = abierto;
  if (!a) return;
  abierto = null;
  document.removeEventListener("keydown", a.onKey, true);
  a.el.classList.add("closing");
  const fin = () => { a.el.remove(); try { a.sel.focus({ preventScroll: true }); } catch (e) {} };
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) fin();
  else { a.el.addEventListener("transitionend", fin, { once: true }); setTimeout(() => { if (a.el.isConnected) fin(); }, 400); }
}

function elegir(sel, idx){
  if (sel.selectedIndex !== idx) {
    sel.selectedIndex = idx;
    sel.dispatchEvent(new Event("input", { bubbles: true }));
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  }
  cerrar();
}

function titulo(sel){
  const l = sel.getAttribute("aria-label");
  if (l) return l;
  if (sel.id) { const lb = document.querySelector('label[for="' + CSS.escape(sel.id) + '"]'); if (lb) return lb.textContent.trim(); }
  const lb = sel.closest("label");
  if (lb) { const t = lb.querySelector("span, .lbl"); if (t && t.textContent.trim()) return t.textContent.trim(); }
  const prev = sel.previousElementSibling;
  if (prev && /^(LABEL|SPAN|DIV)$/.test(prev.tagName) && prev.textContent.trim().length < 40) return prev.textContent.trim();
  return "Elegí una opción";
}

function abrir(sel){
  if (abierto) return;
  let html = "", i = 0;
  const fila = o => {
    const idx = o.index, on = idx === sel.selectedIndex;
    return '<button type="button" class="sl-op' + (on ? " on" : "") + '" role="option" aria-selected="' + on + '" data-i="' + idx + '"' + (o.disabled ? " disabled" : "") + '>' +
      '<span>' + esc(o.textContent) + '</span>' + (on ? '<i>' + CHECK + '</i>' : "") + '</button>';
  };
  for (const ch of sel.children) {
    if (ch.tagName === "OPTGROUP") { html += '<div class="sl-grp">' + esc(ch.label) + '</div>'; for (const o of ch.children) html += fila(o); }
    else if (ch.tagName === "OPTION" && !ch.hidden) html += fila(ch);
  }
  const el = document.createElement("div");
  el.className = "sl-bg";
  el.innerHTML = '<div class="sl-card" role="dialog" aria-modal="true" aria-label="' + esc(titulo(sel)) + '">' +
    '<div class="sl-grab" aria-hidden="true"></div>' +
    '<div class="sl-tit">' + esc(titulo(sel)) + '</div>' +
    '<div class="sl-list" role="listbox">' + html + '</div>' +
    '<button type="button" class="sl-x">Cancelar</button></div>';
  const ops = () => [...el.querySelectorAll(".sl-op:not([disabled])")];
  const onKey = e => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cerrar(); }
    // Tab da la vuelta adentro de la hoja (con el teclado no se sale a la pantalla de atrás).
    else if (e.key === "Tab") { e.preventDefault(); e.stopPropagation(); circular(el, ".sl-op, .sl-x", e.shiftKey); }
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault(); e.stopPropagation();
      const l = ops(), k = l.indexOf(document.activeElement);
      l[(k + (e.key === "ArrowDown" ? 1 : -1) + l.length) % l.length].focus();
    }
  };
  abierto = { el, sel, onKey };
  document.addEventListener("keydown", onKey, true);
  el.addEventListener("click", e => {
    const op = e.target.closest(".sl-op");
    if (op) elegir(sel, +op.dataset.i);
    else if (e.target === el || e.target.closest(".sl-x")) cerrar();
  });
  document.body.appendChild(el);
  requestAnimationFrame(() => {
    el.classList.add("show");
    const on = el.querySelector(".sl-op.on") || el.querySelector(".sl-op");
    if (on) { on.focus({ preventScroll: true }); on.scrollIntoView({ block: "center" }); }
  });
}

const propio = t => t && t.tagName === "SELECT" && !t.multiple && !t.disabled && !t.hasAttribute("data-nativo") && !(t.size > 1);

// Se tapa el desplegable nativo (mousedown) y se abre el nuestro con el click.
document.addEventListener("mousedown", e => { const s = e.target.closest && e.target.closest("select"); if (propio(s)) e.preventDefault(); }, true);
document.addEventListener("click", e => {
  const s = e.target.closest && e.target.closest("select");
  if (!propio(s)) return;
  e.preventDefault(); e.stopPropagation();
  abrir(s);
}, true);
// Con teclado: Enter, espacio o Alt+↓ sobre el select abren el nuestro.
document.addEventListener("keydown", e => {
  const s = e.target;
  if (!propio(s) || abierto) return;
  if (e.key === "Enter" || e.key === " " || (e.altKey && e.key === "ArrowDown")) { e.preventDefault(); abrir(s); }
}, true);
