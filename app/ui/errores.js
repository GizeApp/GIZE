// Reporte de errores no capturados: si algo se rompe en el celular de alguien, queda una fila
// en public.client_errors (ver supabase/errores-cliente.sql) para poder verlo en el panel de
// Supabase. Sin esto un fallo en producción era invisible hasta que el usuario avisara.
//
// Es "mejor esfuerzo" y nunca puede romper la app:
//   · No importa nada al cargarse (así no cambia el orden del ciclo de módulos state ↔ supabase);
//     lo que necesita lo trae recién cuando hay algo para reportar.
//   · Solo con sesión iniciada y solo errores del código de GIZE (no de extensiones del navegador).
//   · Máximo 5 por apertura de la app y sin repetir el mismo; la base pone además su propio tope.
//   · Se ignoran los cortes de red y de sesión: son normales sin señal y la cola ya los reintenta.
(function () {
  const MAX = 5;
  const IGNORAR = /ResizeObserver loop|^Script error|Load failed|Failed to fetch|NetworkError|Network request failed|Sin sesión con tu cuenta|AbortError|The operation was aborted/i;
  const vistos = new Set();
  let enviados = 0;

  // Fuera los tokens de sesión que pudieran aparecer en un mensaje.
  const limpiar = (s, n) => String(s == null ? "" : s).replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[token]").replace(/(access_token|refresh_token)=[^&\s"']+/g, "$1=[token]").slice(0, n);

  async function enviar(msg, stack, donde) {
    try {
      msg = limpiar(msg, 300);
      if (!msg || IGNORAR.test(msg)) return;
      // Solo errores del propio código: los de un script de afuera no dicen nada útil.
      const propio = (donde || "").indexOf(location.origin) === 0 || (stack && String(stack).indexOf(location.origin) !== -1);
      if (!propio) return;
      const clave = msg + "|" + donde;
      if (vistos.has(clave) || enviados >= MAX) return;
      // Se reserva el lugar ANTES de esperar nada: con varios errores seguidos, cada uno
      // pasaba el control del tope mientras los anteriores esperaban el import y se mandaban
      // más de 5.
      vistos.add(clave); enviados++;
      const { State } = await import("../core/state.js");
      if (!State.sb || !State.cloudUser) { vistos.delete(clave); enviados--; return; }
      let version = "web", platform = "web";
      const C = window.Capacitor;
      if (C && C.isNativePlatform && C.isNativePlatform()) {
        platform = C.getPlatform();
        try { const i = await C.Plugins.App.getInfo(); version = i.version + " (" + i.build + ")"; } catch (e) { version = "?"; }
      }
      await State.sb.rpc("report_client_error", { p_message: msg, p_stack: limpiar(stack, 2000), p_place: limpiar(donde, 200), p_version: version, p_platform: platform });
    } catch (e) { /* nunca romper la app por reportar un error */ }
  }

  window.addEventListener("error", e => {
    // Un recurso que no cargó (imagen, audio) dispara "error" sin mensaje: no es un fallo del código.
    if (!e || !e.message) return;
    enviar(e.message, e.error && e.error.stack, (e.filename || "") + ":" + (e.lineno || 0));
  });
  window.addEventListener("unhandledrejection", e => {
    const r = e && e.reason;
    enviar(r && r.message ? r.message : r, r && r.stack, "promesa");
  });
})();
