// Modo liviano: en celulares/compus de gama baja se apagan los efectos caros (partículas,
// aurora animada, desenfoques, borde que gira). Va acá arriba, antes del CSS, para que la
// primera pintada ya salga liviana. "gize_lite" = elección manual en Ajustes ("1"/"0");
// "gize_lite_auto" lo deja app/ui/background.js si midió que el fondo iba a tirones.
(function () {
  try {
    var o = localStorage.getItem("gize_lite"), n = navigator, c = n.connection || {};
    var weak = (n.deviceMemory && n.deviceMemory <= 4) || (n.hardwareConcurrency && n.hardwareConcurrency <= 2) ||
      c.saveData === true || localStorage.getItem("gize_lite_auto") === "1";
    if (o === "1" || (o !== "0" && weak)) document.documentElement.classList.add("lite");
  } catch (e) {}
})();

// Apariencia: «Oscuro» (la de siempre, por defecto) o «Claro» (vidrio sobre círculos de color,
// css/ui/tema-claro.css). Se elige en Ajustes (cliente) o en Configuración (coach) y se guarda
// en este dispositivo ("gize_tema" = "claro"; ver app/ui/tema.js). Va acá, igual que el modo
// liviano, para que la primera pintada (y el splash) ya salgan con la apariencia elegida.
(function () {
  try {
    if (localStorage.getItem("gize_tema") !== "claro") return;
    document.documentElement.classList.add("tema-claro");
    // La barra del sistema (Android) con el marino del fondo: los <meta> vienen después de este script.
    document.addEventListener("DOMContentLoaded", function () {
      if (!document.documentElement.classList.contains("tema-claro")) return;
      var m = document.querySelectorAll('meta[name="theme-color"]');
      for (var i = 0; i < m.length; i++) m[i].setAttribute("content", "#030814");
    });
  } catch (e) {}
})();

// Neón: prendido por defecto. Si se apagó en Ajustes (cliente) o en Configuración (coach)
// queda "gize_neon" = "0" en este dispositivo (ver app/ui/neon.js) y la app sale en blanco y
// grises (css/ui/sin-neon.css). Va acá, igual que la apariencia, para que la primera pintada
// ya salga sin neón.
(function () {
  try { if (localStorage.getItem("gize_neon") === "0") document.documentElement.classList.add("sin-neon"); } catch (e) {}
})();
