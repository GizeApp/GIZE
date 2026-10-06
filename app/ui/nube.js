// La barra de abajo como «nube» (css/core/layout.css): al bajar con el dedo se achica y al subir,
// o al llegar arriba o al final de la pantalla, vuelve a su tamaño. Solo pone o saca la clase
// .compacta: el achique es un transform en CSS (no mueve nada de la página).
// Un listener pasivo que junta los scrolls en un cuadro (requestAnimationFrame) y un umbral de
// unos píxeles, así un temblor del dedo o el rebote del iPhone no la hace titilar.
const UMBRAL = 10; // px seguidos en un sentido para cambiar
const BORDE = 6;   // px del principio o del final en los que va siempre abierta

const nav = document.querySelector(".navbar");
let ancla = Math.max(0, window.scrollY), pedido = false;

export function expandNav(){ if (nav) nav.classList.remove("compacta"); ancla = Math.max(0, window.scrollY); }

function mirar(){
  pedido = false;
  const y = Math.max(0, window.scrollY), fin = document.documentElement.scrollHeight - window.innerHeight;
  if (y <= BORDE || y >= fin - BORDE) { nav.classList.remove("compacta"); ancla = y; return; }
  const d = y - ancla;
  if (d > UMBRAL) { nav.classList.add("compacta"); ancla = y; }
  else if (d < -UMBRAL) { nav.classList.remove("compacta"); ancla = y; }
}

if (nav) {
  window.addEventListener("scroll", () => { if (!pedido) { pedido = true; requestAnimationFrame(mirar); } }, { passive: true });
  // Al cambiar de pestaña, abierta.
  nav.addEventListener("click", expandNav);
}
