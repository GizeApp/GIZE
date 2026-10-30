// La página pública del coach: gize.ar/c/<alias> (la arma en Configuración → «Mi página»). GitHub
// Pages no tiene rutas: sirve 404.html (con estado 404) en toda dirección que no existe, y este
// archivo decide qué se ve:
//   · /c/<alias> (o /c/?a=<alias>, el plan B por si WhatsApp no arma la vista previa): le pide a la
//     base la página del coach (coach_pagina_ver, en supabase/pagina-coach.sql) y muestra su nombre,
//     su foto (si la muestra), su código de invitación grande y las tiendas. Si el link no existe,
//     está apagado o pausado, o la cuenta de coach no está activa: «no disponible». Sin señal (o si la
//     base no contesta en 8 s): «Reintentar».
//   · cualquier otra dirección: el «No encontramos esta página» de siempre.
// Lo que dice la política de privacidad (privacidad/index.html, «Página pública del coach») se
// cumple acá: se pide sin sesión (nunca se manda la de la app) y no se anota la visita, la foto se ve
// con un link firmado que vence en una hora, y al botón de Google Play solo le llega el nombre del
// link (referrer de la instalación, para contarla). Todo lo que viene de la base se pinta con
// textContent. Va fuera de /c/ para que ningún alias choque con un archivo.
(() => {
  const SB_URL = "https://wegptuzhsrwppbknqstf.supabase.co";
  // La clave pública de la app (app/core/supabase.js); una prueba controla que sea la misma.
  const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndlZ3B0dXpoc3J3cHBia25xc3RmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwMDkxODgsImV4cCI6MjA5ODU4NTE4OH0.pWBes8juiNcCrFG377w_Ga9IQ4EE37p5AJwUpYs2k8Q";
  const PLAY = "https://play.google.com/store/apps/details?id=ar.com.gize.app";
  const TOPE = 8000; // ms que se espera a la base antes de ofrecer «Reintentar»
  const raiz = document.documentElement;
  const $ = id => document.getElementById(id);
  const estado = e => raiz.setAttribute("data-estado", e);

  // El alias que pide la dirección: null si no es una página de coach (el 404 común) y "" si es /c/
  // pero sin un alias que sirva. Mismo formato que la base: de 3 a 30 letras minúsculas o números;
  // en el medio, punto, guion o guion bajo (nunca dos seguidos). Los ?utm de Instagram no importan.
  function aliasPedido(){
    const m = /^\/c(?:\/([^/]*))?\/?$/.exec(location.pathname);
    if (!m) return null;
    let a = "";
    try { a = m[1] ? decodeURIComponent(m[1]) : (new URLSearchParams(location.search).get("a") || ""); } catch (e) { return ""; }
    a = a.trim().toLowerCase();
    return /^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$/.test(a) && !/[._-]{2}/.test(a) ? a : "";
  }
  const pedido = aliasPedido();
  // Antes de dibujar, para que no se vea el aviso de «sin JavaScript».
  estado(pedido === null ? "404" : pedido ? "cargando" : "nodisp");

  const encabezados = extra => Object.assign({ apikey: SB_KEY, Authorization: "Bearer " + SB_KEY }, extra);
  let coach = null; // { alias, codigo } cuando se ve la página

  function noDisponible(){
    coach = null;
    $("play").href = PLAY;
    $("web").href = "/app/";
    document.title = "Página no disponible · GIZE";
    estado("nodisp");
  }

  async function cargar(){
    estado("cargando");
    const ctl = new AbortController(), corte = setTimeout(() => ctl.abort(), TOPE);
    try {
      const r = await fetch(SB_URL + "/rest/v1/rpc/coach_pagina_ver", { method: "POST", signal: ctl.signal, cache: "no-store",
        headers: encabezados({ "Content-Type": "application/json" }), body: JSON.stringify({ p_alias: pedido }) });
      // La base caída o saturada: se puede reintentar.
      if (r.status >= 500 || r.status === 408 || r.status === 429) throw new Error("base " + r.status);
      // Otro error (la función todavía no está o se apagó a propósito): no disponible.
      const d = r.ok ? await r.json() : null;
      clearTimeout(corte);
      if (!d || typeof d !== "object" || !d.codigo) return noDisponible();
      mostrar(d);
    } catch (e) {
      clearTimeout(corte);
      coach = null;
      document.title = "GIZE";
      estado("error");
    }
  }

  function mostrar(d){
    const alias = typeof d.alias === "string" && /^[a-z0-9._-]{3,30}$/.test(d.alias) ? d.alias : pedido;
    const nombre = String(d.nombre || "").trim();
    coach = { alias, codigo: String(d.codigo) };
    $("nombre").textContent = nombre || "Tu coach";
    $("cod").textContent = coach.codigo;
    $("ini").textContent = Array.from(nombre.split(/\s+/).filter(Boolean).slice(0, 2), w => Array.from(w)[0]).join("").toUpperCase();
    document.title = (nombre ? "Entrená con " + nombre : "Entrená conmigo") + " · GIZE";
    // Google Play guarda el referrer para contar la instalación (y, más adelante, para sumarla con
    // este coach): lleva solo el nombre del link.
    $("play").href = PLAY + "&referrer=" + encodeURIComponent("utm_source=gize&utm_medium=pagina-coach&utm_content=" + alias);
    // La app web guarda la invitación (#coach=) y la ofrece al entrar.
    $("web").href = "/app/#coach=" + encodeURIComponent(alias);
    // Llegó por un link anterior: la dirección pasa a la del link vigente.
    if (alias !== pedido){
      const planB = !/^\/c\/[^/]/.test(location.pathname);
      try { history.replaceState(null, "", planB ? "/c/?a=" + encodeURIComponent(alias) : "/c/" + encodeURIComponent(alias)); } catch (e) {}
    }
    foto(typeof d.foto === "string" ? d.foto : "");
    estado("coach");
    qr(alias);
  }

  // La foto vive en un bucket privado: se pide un link firmado que vence en una hora (lo permite la
  // política de storage solo para la foto de un coach con la página y la foto prendidas). Sin foto,
  // o si no se pudo, quedan las iniciales.
  async function foto(ruta){
    const img = $("foto"), ini = $("ini");
    img.hidden = true; ini.hidden = false;
    if (!ruta) return;
    try {
      const r = await fetch(SB_URL + "/storage/v1/object/sign/avatars/" + ruta.split("/").map(encodeURIComponent).join("/"), { method: "POST", cache: "no-store",
        headers: encabezados({ "Content-Type": "application/json" }), body: JSON.stringify({ expiresIn: 3600 }) });
      const j = r.ok ? await r.json() : null;
      if (!j || typeof j.signedURL !== "string" || j.signedURL.charAt(0) !== "/") return;
      img.onload = () => { img.hidden = false; ini.hidden = true; };
      img.src = encodeURI(SB_URL + "/storage/v1" + j.signedURL);
    } catch (e) {}
  }

  // Copiar el código: el portapapeles y, si no anda (algunos navegadores de adentro de otras apps), el
  // método viejo con un campo escondido.
  async function copiar(texto){
    try { await navigator.clipboard.writeText(texto); return true; } catch (e) {}
    try {
      const c = document.createElement("textarea");
      c.value = texto; c.setAttribute("readonly", ""); c.style.position = "fixed"; c.style.top = "0"; c.style.opacity = "0";
      document.body.appendChild(c); c.select();
      const ok = document.execCommand("copy");
      c.remove();
      return ok;
    } catch (e) { return false; }
  }
  const avisar = t => { $("aviso").textContent = t; };

  // En la compu: un QR de esta página, para abrirla en el celular y bajar la app desde ahí. La
  // librería (vendor/, versión fija) se carga solo en ese caso. El SVG se arma con nodos, sin HTML.
  let qrPedido = false;
  function qr(alias){
    const ua = navigator.userAgent || "";
    if (qrPedido || /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || navigator.maxTouchPoints > 1 || !matchMedia("(min-width: 720px)").matches) return;
    qrPedido = true;
    const s = document.createElement("script");
    s.src = "/vendor/qrcode-generator-1.4.4.js";
    s.onload = () => { try { dibujarQr(window.qrcode, location.origin + "/c/" + encodeURIComponent(alias)); } catch (e) {} };
    document.head.appendChild(s);
  }
  function dibujarQr(qrcode, texto){
    const c = qrcode(0, "M"); c.addData(texto); c.make();
    const n = c.getModuleCount(), m = 4, total = n + m * 2, NS = "http://www.w3.org/2000/svg";
    let d = "";
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (c.isDark(y, x)) d += "M" + (x + m) + " " + (y + m) + "h1v1h-1z";
    const svg = document.createElementNS(NS, "svg"), fondo = document.createElementNS(NS, "rect"), p = document.createElementNS(NS, "path");
    const poner = (el, o) => { for (const k in o) el.setAttribute(k, o[k]); };
    poner(svg, { viewBox: "0 0 " + total + " " + total, role: "img", "aria-label": "Código QR de esta página", "shape-rendering": "crispEdges" });
    poner(fondo, { width: "100%", height: "100%", fill: "#fff" });
    poner(p, { d, fill: "#000" });
    svg.append(fondo, p);
    $("qrDib").replaceChildren(svg);
    $("qr").hidden = false;
  }

  function arrancar(){
    // La tienda del celular, primero (en la compu y en Android, Google Play como en la portada).
    const ua = navigator.userAgent || "";
    if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) $("tiendas").insertBefore($("appstore"), $("play"));
    if (pedido === null){ document.title = "No encontramos esta página · GIZE"; return; }
    if (!pedido) return noDisponible();
    $("reintentar").addEventListener("click", cargar);
    $("copiar").addEventListener("click", async () => {
      if (!coach) return;
      const c = coach.codigo;
      avisar(await copiar(c) ? "Copiamos el código " + c + "." : "No se pudo copiar: anotá el código " + c + ".");
    });
    // Tocar una tienda copia el código (la tienda se abre igual), para pegarlo cuando la app lo pida.
    for (const id of ["play", "appstore"]) $(id).addEventListener("click", () => {
      if (!coach) return;
      const c = coach.codigo;
      copiar(c).then(ok => avisar(ok ? "Copiamos el código " + c + ": pegalo cuando la app te lo pida." : "Anotá el código " + c + ": la app te lo va a pedir."));
    });
    cargar();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar);
  else arrancar();
})();
