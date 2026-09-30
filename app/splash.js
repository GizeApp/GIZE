(function () {
  var TOTAL_MS = 2600; // duración completa: barra de 2,1 s + salida
  var MAX_MS = 8000;   // techo de seguridad si la app nunca avisa que está lista
  var tpl = document.getElementById('splashTpl');
  // El splash de todas las apariencias es el ícono de vidrio armándose (css/core/splash.css), con
  // los colores de cada una. Dura ~1,5 s + 0,35 s de salida; en el modo liviano ya viene armado y
  // se va a los 0,85 s. El de antes (#splashTpl, 2,6 s) queda solo por si faltara el template.
  var tplClaro = document.getElementById('splashTplClaro');
  function claro() { return !!tplClaro; }
  function totalMs() {
    if (!claro()) return TOTAL_MS;
    return document.documentElement.classList.contains('lite') ? 850 : 1900;
  }
  var host = document.getElementById('splashHost');
  var current = null; // splash en pantalla ahora mismo, si hay uno

  function reduced() { return matchMedia('(prefers-reduced-motion: reduce)').matches; }

  // El splash arranca dentro de un <template> (inerte, sin animar) y se clona
  // cada vez que hace falta mostrarlo, así las animaciones CSS (que corren una
  // sola vez) se pueden repetir en cada login sin tener que reconstruirlas a mano.
  function mount() {
    host.innerHTML = '';
    var el = (claro() ? tplClaro : tpl).content.firstElementChild.cloneNode(true);
    host.appendChild(el);
    document.body.classList.add('is-booting');
    var state = { el: el, startTs: Date.now(), total: totalMs(), done: false, safety: null };
    state.safety = setTimeout(function () { finish(state); }, reduced() ? 1600 : MAX_MS);
    current = state;
    return state;
  }

  function finish(state) {
    if (!state || state.done) return;
    state.done = true;
    clearTimeout(state.safety);
    state.el.remove();
    if (current === state) { document.body.classList.remove('is-booting'); current = null; }
  }

  // La app llama a esto cuando ya armó la pantalla real (login, app de cliente
  // o panel de coach) que corresponde al splash activo. No corta la animación
  // antes de que termine sola: el panel de coach hace varios viajes a Supabase
  // antes de estar listo y puede tardar más que los 2.6s de la animación.
  window.coreEnter = function () {
    var state = current; if (!state) return;
    if (reduced()) { finish(state); return; }
    var wait = Math.max(0, state.total - (Date.now() - state.startTs));
    setTimeout(function () { finish(state); }, wait);
  };

  // Corta el splash activo ya mismo, sin esperar a que termine la animación
  // (para cuando la "carga" en realidad falló, ej. login incorrecto).
  window.coreCancel = function () { if (current) finish(current); };

  // Vuelve a mostrar el splash desde cero — se usa en cada login/registro,
  // no solo en la carga inicial de la página, porque entrar al panel de coach
  // desde el formulario de login es su propia espera de red.
  window.coreReplay = function () { if (!current || current.done) mount(); };

  mount(); // splash de arranque de la página
})();
