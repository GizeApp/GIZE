// gize.ar/resumen/?t=<token>: dejar de recibir el resumen de los lunes (o volver a recibirlo) sin
// iniciar sesión. Manda el pedido a la función resumen-semanal solo cuando se toca el botón: abrir la
// página no cambia nada (los antivirus del correo abren los links). Sin token, explica cómo apagarlo
// desde la app.
(() => {
  const URL_FN = "https://wegptuzhsrwppbknqstf.supabase.co/functions/v1/resumen-semanal";
  const t = (new URLSearchParams(location.search).get("t") || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) return;
  const $ = id => document.getElementById(id);
  const boton = $("boton"), res = $("res"), pregunta = $("pregunta");
  $("conToken").hidden = false;
  $("sinToken").hidden = true;
  let apagado = false;
  const decir = (ok, texto) => { res.hidden = false; res.className = "res " + (ok ? "ok" : "err"); res.textContent = texto; };
  boton.addEventListener("click", async () => {
    const quiero = apagado ? "alta" : "baja";
    boton.disabled = true;
    boton.textContent = "Un momento…";
    try {
      const r = await fetch(URL_FN, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [quiero]: t }) });
      if (!r.ok) throw new Error(String(r.status));
      apagado = quiero === "baja";
      pregunta.hidden = true;
      decir(true, apagado ? "Listo: ya no te lo vamos a mandar." : "Listo: te lo vamos a volver a mandar los lunes.");
    } catch (e) {
      decir(false, "No se pudo (¿sin conexión?). Probá de nuevo en un rato, o apagalo en GIZE → Configuración → Avisos.");
    }
    boton.disabled = false;
    boton.className = apagado ? "sec" : "";
    boton.textContent = apagado ? "Volver a recibirlo" : "No me lo mandes más";
  });
})();
