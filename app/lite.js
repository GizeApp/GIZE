// Modo liviano: en celulares/compus de gama baja se apagan los efectos caros (partículas,
// aurora animada, desenfoques, borde que gira). Va acá arriba, antes del CSS, para que la
// primera pintada ya salga liviana. "gize_lite" = elección manual en Ajustes ("1"/"0");
// "gize_lite_auto" lo deja app/ui/background.js si midió que el fondo iba a tirones.
// App de Android (Capacitor): html.android-app. Ahí la placa de video es la que se traba
// (Play Console: ANR «La GPU no responde» en un Galaxy A13 al abrir), así que sin
// backdrop-filter (css/ui/lite.css y los temas) y con el fondo animado más barato
// (app/ui/background.js). Y va siempre en GIZE básico (ver más abajo).
(function () {
  try {
    var o = localStorage.getItem("gize_lite"), n = navigator, c = n.connection || {}, w = window, C = w.Capacitor;
    var android = false;
    try { android = !!((C && C.isNativePlatform && C.isNativePlatform() && C.getPlatform && C.getPlatform() === "android") || w.androidBridge); } catch (e) {}
    if (android) document.documentElement.classList.add("android-app");
    var weak = (n.deviceMemory && n.deviceMemory <= 4) || (n.hardwareConcurrency && n.hardwareConcurrency <= 2) ||
      c.saveData === true || localStorage.getItem("gize_lite_auto") === "1";
    // App de Android: GIZE básico siempre (html.lite + html.basico, css/ui/basico.css), salvo que
    // se elija la apariencia completa en Ajustes. Aun en modo liviano, las sombras, brillos y
    // animaciones trababan los Android de gama media (Galaxy A13). iPhone y web quedan completos.
    if (android && o !== "0") weak = true;
    if (o === "1" || (o !== "0" && weak)){
      document.documentElement.classList.add("lite");
      if (android) document.documentElement.classList.add("basico");
    }
  } catch (e) {}

})();

// Ahorro de batería: con la batería baja (20 % o menos y sin cargar) o con el ahorro de datos
// del navegador prendido, pasa solo a modo liviano mientras dure, sin anotarlo: no es una
// elección. Si se eligió a mano en Ajustes ("gize_lite" = "1" o "0"), manda eso y acá no se
// toca nada. Para no ir y venir, sale recién al enchufarlo o al volver a 30 % o más.
// iPhone (Safari y la app, WKWebView) no tiene navigator.getBattery: ahí no hace nada (el
// propio iOS baja el ritmo con «Modo de bajo consumo»). Avisa con "gize:lite" para que
// app/ui/background.js apague o vuelva a prender el fondo de partículas.
(function () {
  try {
    var n = navigator, html = document.documentElement, mine = false, low = false, bat = null;
    var LOW = 0.2, BACK = 0.3;
    var explicit = function () { try { return localStorage.getItem("gize_lite") !== null; } catch (e) { return true; } };
    var saveData = function () { return !!(n.connection && n.connection.saveData === true); };
    function apply() {
      if (explicit()) { mine = false; return; } // la elección de Ajustes le gana
      if (bat) {
        if (!bat.charging && bat.level <= LOW) low = true;
        else if (bat.charging || bat.level >= BACK) low = false; // entre 20 y 30 % sigue como estaba
      }
      var want = low || saveData();
      if (want && !html.classList.contains("lite")) { mine = true; html.classList.add("lite"); fire(); }
      else if (!want && mine) { mine = false; html.classList.remove("lite"); fire(); }
    }
    function fire() { try { document.dispatchEvent(new CustomEvent("gize:lite")); } catch (e) {} }
    if (n.connection && n.connection.addEventListener) n.connection.addEventListener("change", apply);
    if (typeof n.getBattery !== "function") return; // iPhone / Firefox: sin API de batería
    n.getBattery().then(function (b) {
      bat = b; apply();
      b.addEventListener("levelchange", apply);
      b.addEventListener("chargingchange", apply);
    }).catch(function () {});
  } catch (e) {}
})();

// Apariencia: «Oscuro» (la de siempre, por defecto), «Claro» (vidrio blanco sobre celeste con
// texto oscuro: html.tema-luz, css/ui/tema-luz.css y css/ui/claro-frozen.css), «Azul» (vidrio
// sobre círculos de color: html.tema-claro, css/ui/tema-claro.css; antes se llamaba «Claro») o
// «Rosa» (el mismo vidrio con la paleta rosa: html.tema-claro + html.tema-rosa,
// css/ui/tema-rosa.css). Se elige en Ajustes (cliente) o en
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
    var barra = t === "luz" ? "#C6D8EA" : t === "rosa" ? "#14060F" : "#030814";
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
