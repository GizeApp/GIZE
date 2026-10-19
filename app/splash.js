(function () {
  // El splash de todas las apariencias es el logo oficial, tranquilo (template #splashTpl en
  // app/index.html, css/core/splash.css), con los colores de cada una: la marca aparece suave con
  // la G que se traza, el orbe se enciende, sube la palabra GIZE y el logo armado descansa un
  // momento (el orbe respira una vez más, suave). Dura 3 s contando la salida (primero se va la
  // marca y después el fondo); en el modo liviano ya viene armado y se va a los 0,85 s.
  // Al terminar no queda nada: se saca del DOM todo lo que puso.
  //
  // Se va recién cuando la app armó la pantalla que corresponde (window.coreEnter: login, app del
  // alumno o panel del coach). Antes se iba solo a los 3 s (por CSS) y a los 8 s se sacaba del todo
  // aunque la app no estuviera: con la red lenta se veía la app a medio armar (a un coach, la barra
  // de abajo del alumno), y si la app no llegaba a arrancar quedaba esa pantalla vacía para siempre
  // (iPhone, «GIZE WEB» abierta justo después de publicar una versión). Ahora, mientras tanto, el
  // logo queda quieto y:
  //  - si la app no llegó a arrancar porque un archivo suyo no llegó o no encaja con los demás (uno
  //    viejo y otro nuevo, recién publicada una versión), se recarga sola una vez;
  //  - si pasan ESPERA_MS sin la app (o falló de nuevo), sale el cartel con «Reintentar» (recarga).
  //    Si la app termina de armarse igual, el splash se va como siempre.
  var ESPERA_MS = 15000;
  var RECARGA = 'gize_recarga_arranque'; // cuándo se recargó sola (sessionStorage), para no repetir
  var tpl = document.getElementById('splashTpl');
  var host = document.getElementById('splashHost');
  var current = null; // splash en pantalla ahora mismo, si hay uno
  var arranco = false; // app/main.js ya corrió: llegaron y encajaron todos sus módulos

  function reduced() { return matchMedia('(prefers-reduced-motion: reduce)').matches; }
  // Recargar como cerrar y abrir la app. soloRed: la app no arrancó porque sus archivos no encajaban
  // (uno viejo guardado con otro nuevo): antes se le pide al service worker (sw.js) que esa carga
  // venga entera de la red, sin usar lo guardado por tardar, y se espera que conteste (como mucho
  // 0,6 s) para que la recarga no le gane al aviso.
  function recargar(soloRed) {
    var ido = false, ir = function () { if (!ido) { ido = true; location.reload(); } };
    try {
      var c = soloRed && navigator.serviceWorker && navigator.serviceWorker.controller;
      if (c && window.MessageChannel) {
        var ch = new MessageChannel(); ch.port1.onmessage = ir;
        c.postMessage('gize:solo-red', [ch.port2]); setTimeout(ir, 600); return;
      }
    } catch (e) {}
    ir();
  }
  // min: desde cuándo se puede ir (terminó la entrada); out: lo que dura la salida (#splash.sale).
  function tiempos() {
    if (document.documentElement.classList.contains('lite')) return { min: 420, out: 430 };
    if (reduced()) return { min: 500, out: 450 };
    return { min: 2400, out: 600 };
  }

  // El splash arranca dentro de un <template> (inerte, sin animar) y se clona
  // cada vez que hace falta mostrarlo, así las animaciones CSS (que corren una
  // sola vez) se pueden repetir en cada login sin tener que reconstruirlas a mano.
  function mount() {
    host.innerHTML = '';
    var el = tpl.content.firstElementChild.cloneNode(true);
    host.appendChild(el);
    document.body.classList.add('is-booting', 'sp-tapa');
    var state = { el: el, startTs: Date.now(), done: false, saliendo: false, timers: [] };
    state.espera = setTimeout(function () { trabado(state); }, ESPERA_MS);
    var b = el.querySelector('.sp-r-btn');
    if (b) b.addEventListener('click', function () { b.disabled = true; recargar(state.modulo); });
    current = state;
    return state;
  }

  function finish(state) {
    if (!state || state.done) return;
    state.done = true;
    clearTimeout(state.espera);
    state.timers.forEach(clearTimeout);
    state.el.remove();
    if (current === state) {
      host.textContent = ''; // el host queda vacío: ni una capa del splash sigue viva (iPhone)
      document.body.classList.remove('is-booting', 'sp-tapa'); current = null;
      // Recién ahora arrancan el fondo animado y los canvas (app/ui/background.js): mientras
      // estaba el splash no tenía sentido dibujar lo que tapa, y en Android trababa la placa.
      try { document.dispatchEvent(new Event('gize:splash-fin')); } catch (e) {}
    }
  }

  // La app no aparece: el cartel debajo del logo, con «Reintentar». titulo: ya se sabe que falló (si
  // no, «Está tardando más de lo normal»); modulo: falló porque la app no llegó a arrancar.
  function trabado(state, titulo, modulo) {
    if (!state || state.done || state.saliendo) return;
    var r = state.el.querySelector('.sp-reintento'); if (!r) return;
    if (titulo) r.querySelector('.sp-r-tit').textContent = titulo;
    // Un archivo que no llegó o que no encaja con los demás: también puede ser una versión nueva a
    // medio llegar, no solo la conexión.
    if (modulo) { state.modulo = true; r.querySelector('.sp-r-txt').textContent = 'Puede que GIZE se esté actualizando o que falle la conexión. Tocá Reintentar.'; }
    state.el.classList.add('trabado');
    r.hidden = false;
  }

  // La app arrancó pero no puede saber con qué cuenta entrar (afterLogin en core/supabase.js: sin
  // el rol recordado y sin poder leerlo de la base): el cartel ya, sin esperar los 15 s. El splash
  // se queda; si la cuenta llega sola después (reintentos de fondo), entra y se va como siempre.
  window.coreTrabado = function () { trabado(current, 'No se pudo abrir tu cuenta'); };

  // La app llama a esto cuando ya armó la pantalla real (login, app de cliente
  // o panel de coach) que corresponde al splash activo. No corta la animación
  // antes de que termine la entrada: el panel de coach hace varios viajes a
  // Supabase antes de estar listo y puede tardar más o menos que ella.
  window.coreEnter = function () {
    var state = current; if (!state || state.saliendo) return;
    state.saliendo = true;
    clearTimeout(state.espera);
    // La pantalla que armó la app ya puede estar debajo (el splash todavía la tapa entera, y así
    // se ve mientras se funde).
    document.body.classList.remove('sp-tapa');
    var t = tiempos(), wait = Math.max(0, t.min - (Date.now() - state.startTs));
    state.timers.push(setTimeout(function () {
      state.el.classList.add('sale');
      state.timers.push(setTimeout(function () { finish(state); }, t.out));
    }, wait));
  };

  // Corta el splash activo ya mismo, sin esperar a que termine la animación
  // (para cuando la "carga" en realidad falló, ej. login incorrecto).
  window.coreCancel = function () { if (current) finish(current); };

  // Vuelve a mostrar el splash desde cero — se usa en cada login/registro,
  // no solo en la carga inicial de la página, porque entrar al panel de coach
  // desde el formulario de login es su propia espera de red.
  window.coreReplay = function () { if (!current || current.done) mount(); };

  // app/main.js avisa que corrió (antes de arrancar la sesión): llegaron todos sus módulos.
  window.coreArranco = function () {
    arranco = true;
    try { sessionStorage.removeItem(RECARGA); } catch (e) {}
  };

  // La app no llegó a arrancar: un módulo que no llegó (el <script type="module"> avisa "error") o
  // que no encaja con los demás o falló al correr (error en un archivo de app/). Se espera un
  // momento por si igual arranca; si no, se recarga sola una vez (como cerrarla y abrirla) y, si
  // ya se recargó hace poco, sale el cartel.
  function noArranco() {
    if (arranco) return;
    setTimeout(function () {
      if (arranco || !current) return;
      // Una sola vez: si no se puede anotar (sin sessionStorage), no se recarga (no entra en un bucle).
      var antes = 0, anotado = false;
      try { antes = Number(sessionStorage.getItem(RECARGA)) || 0; } catch (e) {}
      if (Date.now() - antes > 120000) {
        try { sessionStorage.setItem(RECARGA, String(Date.now())); anotado = !!sessionStorage.getItem(RECARGA); } catch (e) {}
        if (anotado) { recargar(true); return; }
      }
      trabado(current, 'No se pudo abrir GIZE', true);
    }, 1500);
  }
  window.addEventListener('error', function (e) {
    if (arranco) return;
    var t = e && e.target;
    if (t && t.tagName === 'SCRIPT') { if (t.type === 'module') noArranco(); return; }
    var f = String((e && e.filename) || '');
    if (/\/app\/.+\.js/.test(f) && !/\/app\/(lite|splash)\.js/.test(f)) noArranco();
  }, true);

  mount(); // splash de arranque de la página
})();
