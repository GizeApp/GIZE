// GIZE service worker — "network-first" para que SIEMPRE veas la última versión,
// y cache de respaldo para poder abrir la app sin internet.
const CACHE = "core-v147";
// El CSS y el JS ahora viven repartidos en muchos archivos chiquitos (css/**, app/**),
// así que no se listan todos acá a mano: quedan cacheados solos por el fetch handler
// de abajo apenas se piden la primera vez (mismo criterio "network-first" de siempre).
const ASSETS = ["./app/", "./app/index.html", "./app/lite.js", "./app/splash.js", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./apple-touch-icon.png",
  "./brand/tokens.css", "./brand/logo/gize-firma-horizontal.svg", "./brand/logo/gize-monograma.svg",
  "./brand/logo/gize-logotipo.svg", "./brand/logo/gize-icono-negro.svg", "./manifest.json", "./vendor/supabase-2.117.1.js"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(()=>{})).then(()=>self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Nunca cachear la API (Supabase, Open Food Facts): siempre red. La librería de Supabase
  // ahora está en vendor/ (mismo origen), así que se cachea como el resto.
  if (url.origin !== self.location.origin) return;

  // cache:"no-cache" = siempre preguntarle al servidor si hay versión nueva (con ETag:
  // si no cambió, responde 304 y no se descarga de nuevo). Sin esto, el fetch pasaba por
  // la caché HTTP del navegador y GitHub Pages la deja 10 minutos: después de publicar
  // un cambio, el celular seguía usando el JS/CSS viejo durante ese rato.
  // Una navegación no se puede re-armar con opciones (el navegador tira error), así que
  // para esa se pide la URL.
  const net = req.mode === "navigate" ? fetch(url.href, { cache: "no-cache", credentials: "same-origin" })
    : fetch(req, { cache: "no-cache" });
  e.respondWith(
    net
      .then(res => {
        // Una navegación que el servidor redirigió (ej. /CORE/landing → /CORE/landing/) no
        // se puede devolver tal cual: Chrome la rechaza y muestra la página de error (había
        // que apretar F5). Se le pasa la redirección al navegador para que cambie la dirección.
        if (req.mode === "navigate" && res.redirected) return Response.redirect(res.url, 301);
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(()=>{});
        return res;
      })
      // Sin internet: lo que haya en caché; si no hay y es una pantalla de la app (/app/…),
      // la app. La landing (raíz del sitio) no tiene versión sin conexión.
      .catch(() => caches.match(req).then(r => r || (req.mode === "navigate" && url.pathname.indexOf("/app") === 0
        ? caches.match("./app/").then(a => a || caches.match("./app/index.html")) : Response.error())))
  );
});

// ---- Notificaciones push (mensajes del coach) ----
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
    for (const c of list) { if (c.url.startsWith(target) && "focus" in c) return c.focus(); }
    return self.clients.openWindow ? self.clients.openWindow(target) : null;
  }));
});
