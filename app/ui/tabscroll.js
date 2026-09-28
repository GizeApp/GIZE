// Fila de días (.tabs) de Entreno: en el celular se desliza con el dedo, pero en la compu no
// había forma (la barra está oculta y la ruedita mueve la página). Acá: ruedita y arrastre
// con el mouse, y la fila no vuelve al principio cada vez que se redibuja.
let _left = 0, _drag = null, _moved = false;
const tabsOf = e => e.target && e.target.closest ? e.target.closest(".tabs") : null;

export function initTabScroll(){
  document.addEventListener("wheel", e => {
    const t = tabsOf(e); if (!t || t.scrollWidth <= t.clientWidth) return;
    if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return; // trackpad de costado: ya anda solo
    const max = t.scrollWidth - t.clientWidth;
    if ((e.deltaY < 0 && t.scrollLeft <= 0) || (e.deltaY > 0 && t.scrollLeft >= max - 1)) return; // en la punta sigue la página
    t.scrollLeft += e.deltaY; e.preventDefault();
  }, { passive: false });
  document.addEventListener("pointerdown", e => {
    _moved = false;
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    const t = tabsOf(e); if (t) _drag = { t, x: e.clientX, left: t.scrollLeft };
  });
  document.addEventListener("pointermove", e => {
    if (!_drag) return;
    const dx = e.clientX - _drag.x;
    if (Math.abs(dx) > 5) _moved = true;
    if (_moved) _drag.t.scrollLeft = _drag.left - dx;
  });
  document.addEventListener("pointerup", () => { _drag = null; });
  // Soltar después de arrastrar no cambia de día.
  document.addEventListener("click", e => { if (_moved && tabsOf(e)) { e.stopPropagation(); e.preventDefault(); } _moved = false; }, true);
  document.addEventListener("scroll", e => { if (e.target.classList && e.target.classList.contains("tabs")) _left = e.target.scrollLeft; }, true);
}

// Después de redibujar: vuelve a donde estaba y, si el día elegido quedó fuera de vista, lo muestra.
export function restoreTabScroll(){
  const t = document.querySelector("#view .tabs"); if (!t) return;
  t.scrollLeft = _left;
  const a = t.querySelector(".tab.active"); if (!a) return;
  const tr = t.getBoundingClientRect(), ar = a.getBoundingClientRect();
  if (ar.left < tr.left || ar.right > tr.right) t.scrollLeft += (ar.left - tr.left) - (tr.width - ar.width) / 2;
  _left = t.scrollLeft;
}
