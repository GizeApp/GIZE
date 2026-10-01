// Modo liviano: en celulares/compus de gama baja se apagan los efectos caros (partículas,
// aurora animada, desenfoques, borde que gira). Va acá arriba, antes del CSS, para que la
// primera pintada ya salga liviana. "gize_lite" = elección manual en Ajustes ("1"/"0");
// "gize_lite_auto" lo deja app/ui/background.js si midió que el fondo iba a tirones.
// App de Android (Capacitor): html.android-app. Ahí la placa de video es la que se traba
// (Play Console: ANR «La GPU no responde» en un Galaxy A13 al abrir), así que sin
// backdrop-filter (css/ui/lite.css y los temas) y con el fondo animado más barato
// (app/ui/background.js). Y el liviano entra antes: con 4 GB o menos, 4 núcleos o menos, o
// una placa de video de gama baja (se mira una sola vez y queda anotado en "gize_gpu_lenta").
(function () {
  try {
    var o = localStorage.getItem("gize_lite"), n = navigator, c = n.connection || {}, w = window, C = w.Capacitor;
    var android = false;
    try { android = !!((C && C.isNativePlatform && C.isNativePlatform() && C.getPlatform && C.getPlatform() === "android") || w.androidBridge); } catch (e) {}
    if (android) document.documentElement.classList.add("android-app");
    var weak = (n.deviceMemory && n.deviceMemory <= 4) || (n.hardwareConcurrency && n.hardwareConcurrency <= 2) ||
      c.saveData === true || localStorage.getItem("gize_lite_auto") === "1";
    if (android && !weak && o !== "0") weak = (n.hardwareConcurrency && n.hardwareConcurrency <= 4) || gpuLenta();
    if (o === "1" || (o !== "0" && weak)) document.documentElement.classList.add("lite");
  } catch (e) {}

  // Mali de gama baja (G52 del A13, G57, G31…), Adreno 3xx a 61x, PowerVR: el WebView no da
  // para desenfoques ni bordes girando. Se crea un contexto WebGL solo la primera vez.
  function gpuLenta() {
    var v = localStorage.getItem("gize_gpu_lenta");
    if (v === null) {
      v = "0";
      try {
        var gl = document.createElement("canvas").getContext("webgl");
        var ext = gl && gl.getExtension("WEBGL_debug_renderer_info");
        var r = gl ? String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || "") : "";
        if (/Mali-(4|T|G31|G51|G52|G57|G71|G72)|Adreno \(TM\) ([3-5]\d\d|6[01]\d)\b|PowerVR/i.test(r)) v = "1";
        var lose = gl && gl.getExtension("WEBGL_lose_context"); if (lose) lose.loseContext();
      } catch (e) {}
      localStorage.setItem("gize_gpu_lenta", v);
    }
    return v === "1";
  }
})();

// Apariencia: «Oscuro» (la de siempre, por defecto), «Claro» (blanco con texto oscuro:
// html.tema-luz, css/ui/tema-luz.css), «Azul» (vidrio sobre círculos de color: html.tema-claro,
// css/ui/tema-claro.css; antes se llamaba «Claro») o «Rosa» (el mismo vidrio con la paleta rosa:
// html.tema-claro + html.tema-rosa, css/ui/tema-rosa.css). Se elige en Ajustes (cliente) o en
// Configuración (coach) y se guarda en este dispositivo ("gize_tema" = "luz", "azul" o "rosa";
// ver app/ui/tema.js). Quien eligió «Azul» cuando se llamaba «Claro» tiene guardado "claro": se
// toma como «Azul» y se pasa a "azul". Va acá, igual que el modo liviano, para que la primera
// pintada (y el splash) ya salgan con la apariencia elegida.
(function () {
  try {
    var t = localStorage.getItem("gize_tema");
    if (t === "claro") { t = "azul"; localStorage.setItem("gize_tema", t); }
    if (t !== "luz" && t !== "azul" && t !== "rosa") return;
    var c = document.documentElement.classList;
    if (t === "luz") c.add("tema-luz");
    else { c.add("tema-claro"); if (t === "rosa") c.add("tema-rosa"); }
    // La barra del sistema (Android) con el color del fondo: los <meta> vienen después de este script.
    var barra = t === "luz" ? "#F4F5F8" : t === "rosa" ? "#14060F" : "#030814";
    document.addEventListener("DOMContentLoaded", function () {
      if (!c.contains("tema-claro") && !c.contains("tema-luz")) return;
      var m = document.querySelectorAll('meta[name="theme-color"]');
      for (var i = 0; i < m.length; i++) m[i].setAttribute("content", barra);
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
