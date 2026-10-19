import { State } from '../core/state.js';

export const revealedBlocks = new Set();

// Clase del bloque ya revelado, para escribirla en el HTML. Si la agregaba recién
// initScrollReveal(), en el medio otro código medía la pantalla (restoreTabScroll) con el bloque
// todavía oculto y la transición de entrada (tokens.css) se repetía en cada redibujo: la portada
// del día desaparecía y volvía a subir con cada toque (video del 19/10).
export const revealCls = key => revealedBlocks.has(key) ? " reveal-in" : "";

export let scrollRevealObserver = null;

export function initScrollReveal(){
  if (scrollRevealObserver) { scrollRevealObserver.disconnect(); scrollRevealObserver = null; }
  const blocks = document.querySelectorAll("#view [data-reveal]");
  if (!blocks.length) return;
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) { blocks.forEach(b=>b.classList.add("reveal-in")); return; }
  scrollRevealObserver = new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if (!entry.isIntersecting) return;
      entry.target.classList.add("reveal-in");
      revealedBlocks.add(entry.target.dataset.reveal);
      scrollRevealObserver.unobserve(entry.target);
    });
  }, { threshold: .12, rootMargin: "0px 0px -8% 0px" });
  blocks.forEach(b=>{
    if (revealedBlocks.has(b.dataset.reveal)) b.classList.add("reveal-in");
    else scrollRevealObserver.observe(b);
  });
}

// ---- Foco del ejercicio en Entreno ----
// El ejercicio en foco se ve a pleno y el resto queda atenuado (.card.ex-focused). Antes lo
// decidía solo el scroll (la card con el centro más cerca del medio) y se recalculaba de cero
// en cada render: al tildar una serie el foco saltaba al ejercicio siguiente sin haberlo
// terminado, parpadeaba el ejercicio 1 y con pocos píxeles de scroll iba y venía. Ahora pesa más:
// - Tocar algo de un ejercicio (tildar, escribir kg/reps, cronómetro) lo ancla: sigue en foco
//   aunque la pantalla se mueva, hasta alejarse a propósito (RELEASE de la pantalla) o tocar otro.
// - Sin ancla, el ejercicio en foco lo conserva mientras siga ocupando la franja del medio de la
//   pantalla (KEEP_TOP–KEEP_BOTTOM) y el cambio se decide recién cuando el scroll se asienta.
// - Se recuerda entre renders (renderEntreno lo dibuja ya en el HTML con focusFor, sin parpadeo)
//   y, al completar el ejercicio, pasa al siguiente que sigue abierto.
let focusId = null, anchor = null;
const LINE = .55, KEEP_TOP = .3, KEEP_BOTTOM = .8, RELEASE = .35, SETTLE_MS = 140;
let settleT = 0, listening = false;

// Ejercicio en foco para este render: allIds = todos los del día en orden, openIds = los que se
// dibujan como card (no colapsados). Si el que tenía el foco se completó, pasa al siguiente.
export function focusFor(allIds, openIds){
  if (!openIds.length) return null;
  if (!openIds.includes(focusId)){
    const i = allIds.indexOf(focusId);
    const next = i < 0 ? null : allIds.slice(i + 1).find(id => openIds.includes(id)) || allIds.slice(0, i).reverse().find(id => openIds.includes(id));
    const wasAnchored = anchor && anchor.id === focusId;
    focusId = next || openIds[0];
    anchor = wasAnchored ? { id: focusId, y: window.scrollY } : null;
  }
  return focusId;
}

// Ancla el foco en un ejercicio (también lo usa main.js al saltar de serie en una superserie).
export function anchorFocus(id){
  if (!id) return;
  focusId = id; anchor = { id, y: window.scrollY };
  paintFocus();
}

const cards = () => [...document.querySelectorAll("#view .card[data-ex-id]")];
function paintFocus(){ cards().forEach(n => n.classList.toggle("ex-focused", n.dataset.exId === focusId)); }

function anchored(){
  if (!anchor || anchor.id !== focusId) return false;
  const card = document.querySelector('#view .card[data-ex-id="' + CSS.escape(anchor.id) + '"]');
  if (card && card.contains(document.activeElement)) return true; // escribiendo: el teclado mueve la pantalla
  if (card && Math.abs(window.scrollY - anchor.y) <= window.innerHeight * RELEASE) return true;
  anchor = null;
  return false;
}

function refocus(){
  if (State.view !== "entreno" || anchored()) return;
  const list = cards(); if (!list.length) return;
  const vh = window.innerHeight, cur = list.find(n => n.dataset.exId === focusId);
  if (cur){ const r = cur.getBoundingClientRect(); if (r.bottom > vh * KEEP_TOP && r.top < vh * KEEP_BOTTOM) return; }
  // Al fondo de la página el último puede no llegar a la línea: el último que se ve.
  let pick = null;
  if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) pick = list.filter(n => n.getBoundingClientRect().top < vh * KEEP_BOTTOM).pop();
  if (!pick){
    const y = vh * LINE; let best = Infinity;
    for (const n of list){ const r = n.getBoundingClientRect(); const d = r.top > y ? r.top - y : r.bottom < y ? y - r.bottom : 0; if (d < best){ best = d; pick = n; } }
  }
  if (pick && pick.dataset.exId !== focusId){ focusId = pick.dataset.exId; paintFocus(); }
}

function onScroll(){ clearTimeout(settleT); settleT = setTimeout(refocus, SETTLE_MS); }
// Un toque (no el arrastre del scroll: por eso click y no pointerdown) o escribir en un
// ejercicio lo ancla. Captura: corre antes de que main.js redibuje.
function onTouch(e){
  const c = e.target && e.target.closest && e.target.closest("#view .card[data-ex-id]");
  if (c) anchorFocus(c.dataset.exId);
}

export function setupExerciseFocus(){
  if (!listening){
    listening = true;
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("click", onTouch, true);
    document.addEventListener("focusin", onTouch, true);
  }
  clearTimeout(settleT);
  if (State.view !== "entreno"){ anchor = null; return; }
  paintFocus(); refocus();
}
