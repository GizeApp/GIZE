// Carteles de aviso propios de GIZE en lugar del alert() nativo del navegador («localhost says…»).
//
// Se reemplaza window.alert una sola vez, así los avisos de toda la app (guardado, errores,
// validaciones) salen con este diseño sin tocar cada llamada. alert() no devuelve nada ni
// bloquea nada que la app necesite, por eso se puede mostrar de forma asíncrona. Si llegan
// varios seguidos se muestran uno después del otro. confirm() y prompt() siguen siendo los
// nativos: devuelven un valor y hay que reescribir cada llamada para cambiarlos.
//
// El tipo se deduce del texto: ✓ / «guardada» → listo; «No se pudo» → error; el resto, aviso.

const OK = /✓|✓|^¡?(listo|gracias)|guardad[oa]|enviad[oa]|aplicad[oa]|copiad[oa]|borrad[oa]|programad[oa]|se (guard|cop|actualiz)/i;
const ERR = /^no se pudo|^no pudimos|no (lo )?aceptó|\berror\b|fall[óo]/i;

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

const cola = [];
let abierto = null;

function cerrar(){
  const a = abierto;
  if (!a) return;
  abierto = null;
  document.removeEventListener("keydown", a.onKey, true);
  a.el.classList.add("closing");
  const fin = () => { a.el.remove(); if (a.volver && a.volver.isConnected) try { a.volver.focus({ preventScroll: true }); } catch (e) {} siguiente(); };
  // Sin animación (movimiento reducido) no hay transitionend: se cierra directo.
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) fin();
  else { a.el.addEventListener("transitionend", fin, { once: true }); setTimeout(() => { if (a.el.isConnected) fin(); }, 400); }
}

function siguiente(){
  if (abierto || !cola.length) return;
  const { msg } = cola.shift();
  const tipo = tipoDe(msg);
  // El ✓ suelto del final ya lo dice el ícono.
  const texto = msg.replace(/\s*[✓✓]\s*/g, " ").replace(/\s+([.!])/g, "$1").trim();
  const [primera, ...resto] = texto.split(/\n+/).filter(Boolean);
  const el = document.createElement("div");
  el.className = "av-bg";
  el.innerHTML = '<div class="av-card av-' + tipo + '" role="alertdialog" aria-modal="true" aria-labelledby="avTit" aria-describedby="avTxt">' +
    '<div class="av-ico">' + ICONOS[tipo] + '</div>' +
    '<div class="av-tit" id="avTit">' + TITULOS[tipo] + '</div>' +
    '<div class="av-txt" id="avTxt"><p>' + esc(primera || "") + '</p>' + resto.map(r => '<p>' + esc(r) + '</p>').join("") + '</div>' +
    '<button type="button" class="av-btn">Entendido</button></div>';
  const onKey = e => { if (e.key === "Escape" || e.key === "Enter") { e.preventDefault(); e.stopPropagation(); cerrar(); } };
  abierto = { el, onKey, volver: document.activeElement };
  document.addEventListener("keydown", onKey, true);
  el.addEventListener("click", e => { if (e.target === el || e.target.closest(".av-btn")) cerrar(); });
  document.body.appendChild(el);
  requestAnimationFrame(() => { el.classList.add("show"); const b = el.querySelector(".av-btn"); if (b) b.focus({ preventScroll: true }); });
}

window.alert = function(msg){
  cola.push({ msg: msg == null ? "" : String(msg) });
  siguiente();
};
