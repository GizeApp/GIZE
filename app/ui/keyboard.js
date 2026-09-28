// Teclado del celular y ventanas de abajo (.sheet) o del medio (.cp-ccard).
// En iPhone (y en Chrome de Android) el teclado se abre ENCIMA de la página sin achicarla:
// lo que está pegado abajo de la pantalla queda tapado y no se ve lo que se escribe
// (ej. los gramos de un alimento). Se mide cuánto tapa el teclado con visualViewport y se
// deja en la variable CSS --kb, que usan esas ventanas para subir justo arriba del teclado.
(function () {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  // En la app de Android (WebView con adjustResize) el teclado no tapa: achica la ventana
  // entera, así que innerHeight y visualViewport bajan juntos y la cuenta de arriba da 0. Ahí
  // se reconoce porque la ventana se achicó mucho con un campo de texto enfocado (solo en
  // pantallas táctiles, para no esconder la barra al achicar la ventana en la compu).
  const coarse = window.matchMedia ? window.matchMedia("(pointer: coarse)") : null;
  let last = -1, lastOpen = null, baseW = window.innerWidth, baseH = window.innerHeight;
  function typing() {
    const el = document.activeElement;
    return !!el && (el.isContentEditable || (el.matches && el.matches("textarea, input:not([type=checkbox],[type=radio],[type=range],[type=button],[type=submit],[type=reset],[type=file],[type=color])")));
  }
  function update() {
    if (window.innerWidth !== baseW) { baseW = window.innerWidth; baseH = window.innerHeight; } // giró el celular
    else if (window.innerHeight > baseH) baseH = window.innerHeight;
    const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    // Menos de 80 px no es el teclado (barras del navegador que aparecen y desaparecen).
    const v = kb > 80 ? kb : 0;
    const open = v > 0 || (!!coarse && coarse.matches && baseH - window.innerHeight > 150 && typing());
    if (v === last && open === lastOpen) return;
    last = v; lastOpen = open;
    // --kb es solo lo que TAPA el teclado (si achicó la ventana, las ventanas ya quedan arriba).
    root.style.setProperty("--kb", v + "px");
    root.classList.toggle("kb-open", open);
    if (v > 0) searchToTop();
    // El lugar extra se saca recién con el teclado cerrado: sacarlo al tocar un resultado
    // (cuando el buscador pierde el foco) movía la página justo debajo del dedo.
    else root.classList.remove("kb-search");
  }
  // Buscador de Comida: con el teclado abierto quedaba poco lugar debajo y los resultados
  // se escondían detrás del teclado. Se sube el buscador arriba de todo, una vez por foco.
  let lifted = null;
  function searchToTop() {
    const el = document.activeElement;
    // En la ventana de búsqueda no hace falta (y movería la pantalla de atrás).
    if (!el || el.id !== "foodSearch" || lifted === el || el.closest(".sheet")) return;
    lifted = el;
    root.classList.add("kb-search");
    setTimeout(() => {
      if (document.activeElement !== el) return;
      const row = el.closest(".food-search-row") || el;
      const y = row.getBoundingClientRect().top + window.scrollY - 12;
      window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
    }, 250);
  }
  document.addEventListener("focusout", (e) => { if (e.target === lifted) lifted = null; });
  vv.addEventListener("resize", update);
  vv.addEventListener("scroll", update);
  window.addEventListener("resize", update);
  document.addEventListener("focusin", update);
  document.addEventListener("focusout", () => setTimeout(update, 0));
  update();
})();

// Al tocar un número de las ventanas (gramos, etc.) se selecciona todo: se escribe el
// valor nuevo directo, sin tener que borrar el anterior.
document.addEventListener("focusin", (e) => {
  const t = e.target;
  if (t && t.matches && t.matches(".sheet-input")) setTimeout(() => { try { t.select(); } catch (err) {} }, 0);
});

// "Listo" / Enter en los gramos agrega o guarda (lo mismo que el botón de la ventana).
document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const t = e.target;
  const act = t && t.dataset && t.dataset.enter;
  if (!act) return;
  e.preventDefault();
  const b = document.querySelector('.sheet [data-action="' + act + '"]');
  if (b) { t.blur(); b.click(); }
});
