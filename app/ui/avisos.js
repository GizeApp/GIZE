// Carteles de aviso propios de GIZE en lugar de los diálogos nativos del navegador («localhost says…»).
//
// alert() se reemplaza una sola vez, así los avisos de toda la app (guardado, errores,
// validaciones) salen con este diseño sin tocar cada llamada. alert() no devuelve nada ni
// bloquea nada que la app necesite, por eso se puede mostrar de forma asíncrona. Si llegan
// varios seguidos se muestran uno después del otro.
//
// confirm() y prompt() tienen reemplazo propio (devuelven una promesa, hay que usarlos con await
// dentro de una función async):
//   if(!await confirmar("¿Borrar?", { ok: "Borrar", peligro: true })) return;   → true / false
//   const nombre = await pedir("¿Cómo se llama?", { valor: "" });                → texto, o null si cancela
// Sin opciones, confirmar() deduce solo si es algo destructivo (borrar, quitar, perder…), el título y
// el texto del botón. Opciones: titulo, ok, cancelar, peligro. Para pedir(): valor, placeholder, ok, titulo.
// El «¿Recargar sitio?» del navegador (beforeunload) no se puede reemplazar: lo muestra el navegador.
//
// Ojo: el alert() nativo frenaba la app hasta que se tocaba «Aceptar»; este no. Donde lo que
// sigue saca el cartel antes de que se lea (recargar la página, como al eliminar la cuenta), se
// espera a que lo cierren: alert() devuelve una promesa que se cumple al tocar «Entendido»
// (await alert("…"); location.reload()).
//
// El tipo del alert se deduce del texto: ✓ / «guardada» → listo; «No se pudo» → error; el resto, aviso.

const OK = /✓|✓|^¡?(listo|gracias)|guardad[oa]|enviad[oa]|aplicad[oa]|copiad[oa]|borrad[oa]|programad[oa]|se (guard|cop|actualiz)/i;
const ERR = /^no se pudo|^no pudimos|no (lo )?aceptó|\berror\b|fall[óo]/i;
// Confirmaciones destructivas: se pintan en rojo y el foco arranca en «Cancelar».
const PELIGRO = /borrar|eliminar|desvincular|quitar|sacar a|descartar|perder|se pierde|se borra|cerrar sesión|reemplaza/i;

const ICONOS = {
  ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  err: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 7v6.5M12 17.2v.1"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 11v6M12 7.3v.1"/></svg>'
};
const TITULOS = { ok: "Listo", err: "No se pudo", info: "Ojo" };

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function tipoDe(msg){
  if (ERR.test(msg)) return "err";
  if (OK.test(msg)) return "ok";
  return "info";
}

// Título y botón de una confirmación según lo que dice el texto.
function deducir(msg){
  const peligro = PELIGRO.test(msg);
  let ok = "Aceptar", titulo = peligro ? "¿Seguro?" : "Confirmar";
  const m = /(borrar|eliminar|desvincular|quitar|descartar|limpiar|aplicar|copiar|guardar|recuperar|reemplazar)/i.exec(msg);
  if (/salir (igual|sin guardar)/i.test(msg)) { ok = "Salir igual"; titulo = "Cambios sin guardar"; }
  else if (/cerrar sesión/i.test(msg)) { ok = "Cerrar sesión"; titulo = "¿Cerrar sesión?"; }
  else if (/sacar a/i.test(msg)) { ok = "Sacar"; }
  else if (m) { ok = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase(); }
  return { peligro, ok, titulo };
}

const cola = [];
let abierto = null;

function cerrar(valor){
  const a = abierto;
  if (!a) return;
  abierto = null;
  document.removeEventListener("keydown", a.onKey, true);
  a.el.classList.add("closing");
  const fin = () => { a.el.remove(); if (a.volver && a.volver.isConnected) try { a.volver.focus({ preventScroll: true }); } catch (e) {} a.listo(valor); siguiente(); };
  // Sin animación (movimiento reducido) no hay transitionend: se cierra directo.
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) fin();
  else { a.el.addEventListener("transitionend", fin, { once: true }); setTimeout(() => { if (a.el.isConnected) fin(); }, 400); }
}

// Foco al siguiente (o anterior, con Shift) de los elementos sel de la ventana, dando la vuelta.
export function circular(caja, sel, atras){
  const l = [...caja.querySelectorAll(sel)].filter(x => !x.disabled);
  if (!l.length) return;
  const i = l.indexOf(document.activeElement);
  l[i < 0 ? 0 : (i + (atras ? -1 : 1) + l.length) % l.length].focus();
}

function siguiente(){
  if (abierto || !cola.length) return;
  const { msg, listo, modo, conf } = cola.shift();   // modo: undefined (alert) | "confirm" | "prompt"
  const d = modo ? Object.assign(deducir(msg), conf) : null;
  const tipo = modo ? (d.peligro ? "err" : "info") : tipoDe(msg);
  // El ✓ suelto del final ya lo dice el ícono.
  const texto = msg.replace(/\s*[✓✓]\s*/g, " ").replace(/\s+([.!])/g, "$1").trim();
  const titulo = modo ? (modo === "prompt" && !conf.titulo ? "Completá" : d.titulo) : TITULOS[tipo];
  const [primera, ...resto] = texto.split(/\n+/).filter(Boolean);
  const el = document.createElement("div");
  el.className = "av-bg";
  el.innerHTML = '<div class="av-card av-' + tipo + '" role="alertdialog" aria-modal="true" aria-labelledby="avTit" aria-describedby="avTxt">' +
    '<div class="av-ico">' + ICONOS[tipo] + '</div>' +
    '<div class="av-tit" id="avTit">' + esc(titulo) + '</div>' +
    '<div class="av-txt" id="avTxt"><p>' + esc(primera || "") + '</p>' + resto.map(r => '<p>' + esc(r) + '</p>').join("") + '</div>' +
    (modo === "prompt" ? '<input class="av-in" type="text" autocomplete="off" value="' + esc(conf.valor == null ? "" : conf.valor) + '" placeholder="' + esc(conf.placeholder || "") + '" aria-labelledby="avTit">' : '') +
    (modo ? '<div class="av-btns"><button type="button" class="av-btn av-sec">' + esc(d.cancelar || "Cancelar") + '</button>' +
      '<button type="button" class="av-btn av-go" data-ok="1">' + esc(d.ok) + '</button></div>'
      : '<button type="button" class="av-btn">Entendido</button>') + '</div>';
  const campo = () => el.querySelector(".av-in");
  const aceptar = () => cerrar(modo === "prompt" ? campo().value : true);
  const cancelar = () => cerrar(modo === "prompt" ? null : false);
  // Escape cancela; Enter acepta (en un confirm lo resuelve el botón con foco). Tab da la vuelta
  // adentro del cartel: como con el diálogo nativo, con el teclado no se llega a lo de atrás
  // (se podía tocar otro botón de la pantalla con la pregunta todavía abierta).
  const onKey = e => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); modo ? cancelar() : cerrar(); }
    else if (e.key === "Enter" && (!modo || modo === "prompt")) { e.preventDefault(); e.stopPropagation(); modo ? aceptar() : cerrar(); }
    else if (e.key === "Tab") { e.preventDefault(); e.stopPropagation(); circular(el, ".av-in, .av-btn", e.shiftKey); }
  };
  abierto = { el, onKey, volver: document.activeElement, listo };
  document.addEventListener("keydown", onKey, true);
  el.addEventListener("click", e => {
    const bt = e.target.closest(".av-btn");
    if (!modo) { if (bt || e.target === el) cerrar(); return; }
    if (bt) (bt.dataset.ok ? aceptar : cancelar)(); else if (e.target === el) cancelar();
  });
  document.body.appendChild(el);
  requestAnimationFrame(() => {
    el.classList.add("show");
    const b = modo === "prompt" ? campo() : el.querySelector(!modo ? ".av-btn" : d.peligro ? ".av-sec" : ".av-go");
    if (b) { b.focus({ preventScroll: true }); if (modo === "prompt" && b.select) b.select(); }
  });
}

window.alert = function(msg){
  return new Promise(listo => {
    cola.push({ msg: msg == null ? "" : String(msg), listo });
    siguiente();
  });
};

// Reemplazo del confirm() nativo: promesa con true (aceptó) o false (canceló).
window.confirmar = function(msg, conf){
  return new Promise(listo => {
    cola.push({ msg: msg == null ? "" : String(msg), listo: v => listo(v === true), modo: "confirm", conf: conf || {} });
    siguiente();
  });
};

// Reemplazo del prompt() nativo: promesa con el texto escrito, o null si cancela.
window.pedir = function(msg, conf, extra){
  if (conf != null && typeof conf !== "object") conf = Object.assign({ valor: String(conf) }, extra);   // pedir(msg, valorInicial[, opciones]) como el prompt() nativo
  return new Promise(listo => {
    cola.push({ msg: msg == null ? "" : String(msg), listo: v => listo(typeof v === "string" ? v : null), modo: "prompt", conf: conf || {} });
    siguiente();
  });
};
