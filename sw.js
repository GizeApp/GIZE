// GIZE service worker — "network-first" para que SIEMPRE veas la última versión,
// y cache de respaldo para poder abrir la app sin internet.
const CACHE = "core-v383";
// El CSS y el JS ahora viven repartidos en muchos archivos chiquitos (css/**, app/**),
// así que no se listan todos acá a mano: quedan cacheados solos por el fetch handler
// de abajo apenas se piden la primera vez (mismo criterio "network-first" de siempre).
const ASSETS = ["./app/", "./app/index.html", "./app/lite.js", "./app/splash.js", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./apple-touch-icon.png",
  "./brand/tokens.css", "./brand/fonts/outfit.css", "./brand/fonts/outfit-latin.woff2", "./brand/logo/gize-firma-horizontal.svg", "./brand/logo/gize-marca-blanca.svg",
  "./brand/logo/gize-logotipo.svg", "./brand/logo/gize-marca-negra.svg", "./brand/logo/gize-marca-azul.svg", "./brand/logo/gize-marca-rosa.svg", "./manifest.json", "./vendor/supabase-2.117.1.js"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(()=>{})).then(()=>self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Red colgada o lenta (un iPhone que vuelve de segundo plano, un wifi sin internet): un pedido puede
// no terminar nunca y, como la app son muchos archivos chicos (app/**), uno solo que no llega la deja
// sin arrancar (quedaba la pantalla vacía con la barra de abajo). Pero tampoco se pueden mezclar
// versiones: un archivo viejo guardado con uno nuevo de la red (recién publicada una versión) no
// encajan y la app no arranca. Por eso se decide por cada carga de la página, no por archivo:
//  - La página (la navegación) se pide a la red; si en TOPE_RED ms no contestó y hay copia guardada,
//    va la copia, y esa carga entera usa lo guardado: sus archivos salen de la caché sin esperar a
//    la red (que sigue de fondo y actualiza la caché para la próxima vez).
//  - Si la página vino de la red, sus archivos también, sin tope aunque tarden: lo guardado solo si
//    la red falla del todo (sin internet), como siempre.
// Si igual una carga no arranca porque sus archivos no encajan (una caché a medio actualizar), la
// app (app/splash.js) recarga sola una vez y antes pide «gize:solo-red»: durante SOLO_RED_MS ni la
// página usa la copia por tardar, así esa carga viene entera de la red.
const TOPE_RED = 3500, SOLO_RED_MS = 30000;
let soloRedHasta = 0;
self.addEventListener("message", e => {
  if (e.data !== "gize:solo-red") return;
  soloRedHasta = Date.now() + SOLO_RED_MS;
  try { if (e.ports && e.ports[0]) e.ports[0].postMessage("ok"); } catch (x) {} // ya puede recargar
});
// De dónde vino la página de cada carga ("guardada" o "red"), por el id de su ventana
// (e.resultingClientId en la navegación, e.clientId en sus archivos). Si el navegador no da ese id,
// vale la última navegación (la app instalada es una sola ventana).
const origen = new Map();
let ultima = { de: "red", t: 0, sinId: false };
function anotar(e, de) {
  const id = e.resultingClientId;
  ultima = { de, t: Date.now(), sinId: !id };
  if (id) { origen.set(id, de); if (origen.size > 40) origen.delete(origen.keys().next().value); }
}
function origenDe(e) {
  if (e.clientId && origen.has(e.clientId)) return origen.get(e.clientId);
  return ultima.sinId && Date.now() - ultima.t < 60000 ? ultima.de : "red";
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Nunca cachear la API (Supabase, Open Food Facts): siempre red. La librería de Supabase
  // ahora está en vendor/ (mismo origen), así que se cachea como el resto.
  if (url.origin !== self.location.origin) return;
  const nav = req.mode === "navigate";
  const soloRed = Date.now() < soloRedHasta;

  // cache:"no-cache" = siempre preguntarle al servidor si hay versión nueva (con ETag:
  // si no cambió, responde 304 y no se descarga de nuevo). Sin esto, el fetch pasaba por
  // la caché HTTP del navegador y GitHub Pages la deja 10 minutos: después de publicar
  // un cambio, el celular seguía usando el JS/CSS viejo durante ese rato.
  // Una navegación no se puede re-armar con opciones (el navegador tira error), así que
  // para esa se pide la URL.
  const net = nav ? fetch(url.href, { cache: "no-cache", credentials: "same-origin" })
    : fetch(req, { cache: "no-cache" });
  let guardar = Promise.resolve();
  const fresca = net.then(res => {
    // Una navegación que el servidor redirigió (ej. /CORE/landing → /CORE/landing/) no
    // se puede devolver tal cual: Chrome la rechaza y muestra la página de error (había
    // que apretar F5). Se le pasa la redirección al navegador para que cambie la dirección.
    if (nav && res.redirected) return Response.redirect(res.url, 301);
    const copy = res.clone();
    guardar = caches.open(CACHE).then(c => c.put(req, copy)).catch(()=>{});
    return res;
  });
  // Lo guardado; si no hay y es una pantalla de la app (/app/…), la app. La landing (raíz del
  // sitio) no tiene versión sin conexión.
  const guardada = () => caches.match(req).then(r => r || (nav && url.pathname.indexOf("/app") === 0
    ? caches.match("./app/").then(a => a || caches.match("./app/index.html")) : null)).catch(() => null);
  if (!nav && !soloRed && origenDe(e) === "guardada") {
    // Archivo de una carga que salió de lo guardado: la copia, ya (sin copia, la red).
    e.respondWith(guardada().then(r => r || fresca.catch(() => Response.error())));
  } else {
    e.respondWith(new Promise(ok => {
      let listo = false;
      const dar = (r, de) => { if (listo) return; listo = true; if (nav) anotar(e, de); ok(r); };
      // Solo la página espera con tope: sus archivos siguen lo que pasó con ella.
      const tope = nav && !soloRed ? setTimeout(() => guardada().then(r => { if (r) dar(r, "guardada"); }), TOPE_RED) : null;
      fresca.then(r => { clearTimeout(tope); dar(r, "red"); },
        // Sin internet: lo que haya en caché.
        () => { clearTimeout(tope); guardada().then(r => dar(r || Response.error(), r ? "guardada" : "red")); });
    }));
  }
  // La copia nueva se termina de guardar aunque ya se haya respondido con la guardada.
  e.waitUntil(Promise.race([fresca.then(() => guardar, () => {}), new Promise(r => setTimeout(r, 60000))]));
});

// ---- Notificaciones push (mensajes del chat coach ↔ alumno) ----
// Las manda supabase/functions/notificar-cliente con { title, body, tag, url }.
// Se muestran aunque la app esté cerrada, con el ícono de GIZE.
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : "" }; }
  const title = d.title || "Tu coach";
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || "",
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    tag: d.tag || "coach",
    renotify: true,
    // El fin de descanso vibra más fuerte (para sentirlo con el celular en el bolsillo).
    vibrate: d.tag === "rest-done" ? [300, 150, 300, 150, 300] : [80, 40, 80],
    // "./" era la app cuando vivía en la raíz; ahora la app está en app/.
    data: { url: (!d.url || d.url === "./") ? "./app/" : d.url }
  }));
});

// Tocar la notificación abre la app (o la trae al frente si ya estaba abierta).
self.addEventListener("notificationclick", e => {
  e.notification.close();
  let target = new URL((e.notification.data && e.notification.data.url) || "./app/", self.registration.scope).href;
  // Solo páginas de GIZE: una notificación nunca abre un sitio de afuera.
  if (new URL(target).origin !== self.location.origin) target = new URL("./app/", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    // Con la app ya abierta se trae al frente; si el aviso es del chat, se le pide que lo abra.
    const t = new URL(target), base = t.origin + t.pathname, chat = t.searchParams.get("chat");
    for (const c of list) {
      if (c.url.split(/[?#]/)[0].startsWith(base) && "focus" in c) {
        if (chat) c.postMessage({ type: "open-chat", client: chat });
        return c.focus();
      }
    }
    return self.clients.openWindow ? self.clients.openWindow(target) : null;
  }));
});
