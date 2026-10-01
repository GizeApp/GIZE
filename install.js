/* install.js — "Instalar GIZE" sin tiendas (la app web es instalable).
   Lo usan la app (app/index.html) y la landing (index.html, raíz del sitio). Script común, no módulo,
   para poder cargarlo temprano en el <head> y no perderse el evento de instalación.

   - Android / Chrome / Edge: guarda el evento beforeinstallprompt y, al tocar un botón
     [data-install], abre el cartel nativo de instalación.
   - iPhone / iPad: muestra una guía paso a paso (Compartir → Agregar a inicio). En la
     landing primero lleva a la app, porque el ícono se crea con la página abierta.
   - Otros casos: explica cómo instalar desde el menú del navegador.
   - Ya instalada (abierta como app): esconde los botones de instalar.
   - Con data-reminder en el <script> (solo la app): un aviso chico, una vez por semana,
     para quien usa GIZE desde el navegador sin instalar.
   - Un link a …/#instalar abre la guía apenas carga la página. */
(function () {
  var me = document.currentScript;
  var APP = (me && me.dataset.app) || "./";            // dónde está la app, relativo a esta página
  // El ícono (el logo «Oscuro») está al lado de este archivo, en la raíz del sitio: desde la landing
  // APP es "app/" y "app/icon-192.png" no existe (se veía la imagen rota en la hoja de instalar).
  var ICON = "icon-192.png"; try { if (me && me.src) ICON = new URL("icon-192.png", me.src).href; } catch (e) {}
  var REMIND = !!(me && me.hasAttribute("data-reminder"));
  var KEY = "gize_install_later";
  var deferred = null;

  var ua = navigator.userAgent || "";
  var isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var isAndroid = /android/i.test(ua);
  // Dentro de la app nativa (Capacitor: Play Store / App Store) ya está "instalada".
  function isNative() { try { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); } catch (e) { return false; } }
  function standalone() { return isNative() || (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true; }
  var onApp = !(me && me.dataset.app);                  // en la landing se pasa data-app

  if (standalone()) document.documentElement.classList.add("is-standalone");

  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault(); deferred = e;
    document.documentElement.classList.add("can-install");
  });
  window.addEventListener("appinstalled", function () {
    deferred = null; close();
    document.documentElement.classList.add("is-standalone");
    try { localStorage.setItem(KEY, String(Date.now() + 3650 * 864e5)); } catch (e) {}
  });

  // ---------- estilos de la guía (autocontenidos) ----------
  var css =
    ".gi-back{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:center;animation:gi-f .2s ease}" +
    ".gi-sheet{width:min(520px,100%);max-height:92vh;overflow:auto;background:#0B0D11;color:#fff;border:1px solid #1C2029;border-radius:22px 22px 0 0;padding:22px 20px calc(22px + env(safe-area-inset-bottom,0px));font-family:'Outfit',system-ui,-apple-system,sans-serif;animation:gi-u .28s cubic-bezier(.2,.8,.2,1)}" +
    "@media (min-width:600px){.gi-back{align-items:center}.gi-sheet{border-radius:22px}}" +
    ".gi-head{display:flex;align-items:center;gap:12px}.gi-head img{width:44px;height:44px;border-radius:11px}" +
    ".gi-head b{font-size:19px;font-weight:600}.gi-head small{display:block;color:#8F98A6;font-size:13px;font-weight:500}" +
    ".gi-x{margin-left:auto;background:none;border:0;color:#8F98A6;font-size:22px;line-height:1;cursor:pointer;padding:6px}" +
    ".gi-why{color:#C3C9D2;font-size:14.5px;line-height:1.5;margin:14px 0 6px}" +
    ".gi-steps{list-style:none;margin:10px 0 0;padding:0;display:grid;gap:10px}" +
    ".gi-steps li{display:flex;gap:12px;align-items:center;background:#12151B;border:1px solid #1C2029;border-radius:14px;padding:12px 14px;font-size:15px;line-height:1.4}" +
    ".gi-n{flex:none;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-weight:700;font-size:13px;background:#fff;color:#000}" +
    ".gi-ic{display:inline-flex;vertical-align:-5px;width:22px;height:22px;margin:0 2px;color:#2FA0FF}" +
    ".gi-steps b{font-weight:600}" +
    ".gi-go{display:block;width:100%;margin-top:16px;padding:14px;border:0;border-radius:999px;background:#fff;color:#000;font:600 16px 'Outfit',system-ui,sans-serif;cursor:pointer;text-align:center;text-decoration:none}" +
    ".gi-note{color:#8F98A6;font-size:12.5px;margin-top:12px;line-height:1.45}" +
    ".gi-bar{position:fixed;left:12px;right:12px;bottom:calc(84px + env(safe-area-inset-bottom,0px));z-index:9000;display:flex;align-items:center;gap:10px;background:#12151B;border:1px solid #2a2f3a;border-radius:16px;padding:10px 10px 10px 14px;color:#fff;font:500 14px 'Outfit',system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.5);animation:gi-u .3s ease}" +
    ".gi-bar span{flex:1;line-height:1.35}.gi-bar button{border:0;border-radius:999px;padding:9px 14px;font:600 13px 'Outfit',system-ui,sans-serif;cursor:pointer}" +
    ".gi-bar .y{background:#fff;color:#000}.gi-bar .n{background:none;color:#8F98A6;padding:9px 6px}" +
    ".is-standalone [data-install]{display:none!important}" +
    "@keyframes gi-f{from{opacity:0}}@keyframes gi-u{from{transform:translateY(24px);opacity:0}}" +
    "@media (prefers-reduced-motion:reduce){.gi-back,.gi-sheet,.gi-bar{animation:none}}";
  function injectCss() { if (document.getElementById("gi-css")) return; var s = document.createElement("style"); s.id = "gi-css"; s.textContent = css; document.head.appendChild(s); }

  var ICO_SHARE = '<svg class="gi-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>';
  var ICO_ADD = '<svg class="gi-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/></svg>';
  var ICO_DOTS = '<svg class="gi-ic" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>';

  var back = null;
  function close() { if (back) { back.remove(); back = null; document.removeEventListener("keydown", onKey); } }
  function onKey(e) { if (e.key === "Escape") close(); }

  function sheet(bodyHtml) {
    injectCss(); close();
    back = document.createElement("div"); back.className = "gi-back";
    back.innerHTML =
      '<div class="gi-sheet" role="dialog" aria-modal="true" aria-labelledby="giT">' +
        '<div class="gi-head"><img src="' + ICON + '" alt=""><div><b id="giT">Instalá GIZE</b><small>Gratis, sin tiendas, en un minuto</small></div>' +
        '<button class="gi-x" type="button" aria-label="Cerrar">✕</button></div>' + bodyHtml + '</div>';
    back.addEventListener("click", function (e) { if (e.target === back || e.target.closest(".gi-x") || e.target.closest("[data-gi-close]")) close(); });
    document.body.appendChild(back); document.addEventListener("keydown", onKey);
    var f = back.querySelector(".gi-go, .gi-x"); if (f) f.focus();
  }

  function guide() {
    var why = '<p class="gi-why">Queda en tu pantalla de inicio como cualquier app: se abre a pantalla completa y te llegan los mensajes de tu coach.</p>';
    if (isIOS) {
      var first = onApp ? "" : '<li><span class="gi-n">1</span><span>Tocá <b>Abrir GIZE</b> acá abajo (se abre la app).</span></li>';
      var n = onApp ? 0 : 1;
      sheet(why + '<ol class="gi-steps">' + first +
        '<li><span class="gi-n">' + (n + 1) + '</span><span>Tocá <b>Compartir</b> ' + ICO_SHARE + ' en la barra del navegador.</span></li>' +
        '<li><span class="gi-n">' + (n + 2) + '</span><span>Elegí <b>Agregar a inicio</b> ' + ICO_ADD + ' (bajá un poco si no lo ves).</span></li>' +
        '<li><span class="gi-n">' + (n + 3) + '</span><span>Tocá <b>Agregar</b> y abrí GIZE desde el ícono nuevo.</span></li></ol>' +
        (onApp ? '<button class="gi-go" type="button" data-gi-close>Entendido</button>'
               : '<a class="gi-go" href="' + APP + '#instalar">Abrir GIZE</a>') +
        '<p class="gi-note">Funciona en Safari y en Chrome del iPhone (iOS 16.4 o más nuevo para recibir notificaciones).</p>');
      return;
    }
    if (isAndroid) {
      sheet(why + '<ol class="gi-steps">' +
        '<li><span class="gi-n">1</span><span>Tocá el menú ' + ICO_DOTS + ' del navegador (arriba a la derecha).</span></li>' +
        '<li><span class="gi-n">2</span><span>Elegí <b>Instalar app</b> o <b>Agregar a pantalla principal</b>.</span></li>' +
        '<li><span class="gi-n">3</span><span>Confirmá y abrí GIZE desde el ícono nuevo.</span></li></ol>' +
        '<button class="gi-go" type="button" data-gi-close>Entendido</button>' +
        '<p class="gi-note">En Chrome aparece directo el cartel de instalación; en otros navegadores está en el menú.</p>');
      return;
    }
    sheet(why + '<ol class="gi-steps">' +
      '<li><span class="gi-n">1</span><span>Abrí <b>' + location.host + '</b> desde tu celular.</span></li>' +
      '<li><span class="gi-n">2</span><span>En iPhone: <b>Compartir</b> ' + ICO_SHARE + ' → <b>Agregar a inicio</b>. En Android: menú ' + ICO_DOTS + ' → <b>Instalar app</b>.</span></li></ol>' +
      '<button class="gi-go" type="button" data-gi-close>Entendido</button>' +
      '<p class="gi-note">En la compu también se puede: en Chrome o Edge, el ícono de instalar aparece en la barra de direcciones.</p>');
  }

  function install() {
    if (standalone()) return;
    if (deferred) {
      var e = deferred; deferred = null;
      e.prompt();
      (e.userChoice || Promise.resolve()).then(function () { document.documentElement.classList.remove("can-install"); });
      return;
    }
    guide();
  }
  window.gizeInstall = install;

  // Botones: cualquier [data-install] (si es un link, sin JS lleva a la app con #instalar).
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-install]"); if (!b) return;
    e.preventDefault(); install();
  });

  // Aviso para quien usa la app desde el navegador (una vez por semana como mucho).
  function reminder() {
    if (!REMIND || standalone() || !(isIOS || isAndroid)) return;
    var until = 0; try { until = +localStorage.getItem(KEY) || 0; } catch (e) {}
    if (Date.now() < until) return;
    setTimeout(function () {
      if (standalone() || document.querySelector(".gi-back,.gi-bar")) return;
      var auth = document.getElementById("authHost"); if (auth && auth.style.display === "flex") return; // no tapar el login
      injectCss();
      var bar = document.createElement("div"); bar.className = "gi-bar"; bar.setAttribute("role", "status");
      bar.innerHTML = '<span>Instalá GIZE para usarla como app' + (isIOS ? ' y recibir los mensajes de tu coach' : '') + '.</span>' +
        '<button class="n" type="button">Ahora no</button><button class="y" type="button">Instalar</button>';
      bar.querySelector(".n").onclick = function () { try { localStorage.setItem(KEY, String(Date.now() + 7 * 864e5)); } catch (e) {} bar.remove(); };
      bar.querySelector(".y").onclick = function () { bar.remove(); install(); };
      document.body.appendChild(bar);
    }, 25000);
  }

  function ready() {
    if (location.hash === "#instalar") { try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {} setTimeout(install, 400); }
    reminder();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready); else ready();
})();
