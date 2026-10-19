// GIZE service worker — "network-first" para que SIEMPRE veas la última versión,
// y cache de respaldo para poder abrir la app sin internet.
const CACHE = "core-v377";
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

// Red colgada (un iPhone que vuelve de segundo plano, un wifi sin internet): el pedido no termina
// nunca y, como la app son muchos archivos chicos (app/**), uno solo que no llega la deja sin
// arrancar: quedaba la pantalla vacía con la barra de abajo. Si en TOPE_RED ms la red no contestó y
// hay copia guardada, va la copia (la red sigue y, si llega, actualiza la caché); sin copia se sigue
// esperando a la red. Después de una espera así, durante LENTA_MS lo guardado va directo, sin volver
// a esperar el tope en cada archivo (la red lo actualiza de fondo). La app pide salir de ese modo
// ("gize:red", app/splash.js) antes de recargar porque no arrancó.
const TOPE_RED = 3500, LENTA_MS = 20000;
let lentaHasta = 0;
self.addEventListener("message", e => { if (e.data === "gize:red") lentaHasta = 0; });

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Nunca cachear la API (Supabase, Open Food Facts): siempre red. La librería de Supabase
  // ahora está en vendor/ (mismo origen), así que se cachea como el resto.
  if (url.origin !== self.location.origin) return;
  const nav = req.mode === "navigate";

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
  e.respondWith(new Promise(ok => {
    let listo = false;
    const dar = r => { if (!listo) { listo = true; ok(r); } };
    const tope = setTimeout(() => guardada().then(r => { if (r && !listo) { lentaHasta = Date.now() + LENTA_MS; dar(r); } }),
      Date.now() < lentaHasta ? 0 : TOPE_RED);
    fresca.then(r => { clearTimeout(tope); dar(r); },
      // Sin internet: lo que haya en caché.
      () => { clearTimeout(tope); guardada().then(r => dar(r || Response.error())); });
  }));
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
