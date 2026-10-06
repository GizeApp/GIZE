// El mapa de las salidas de Cardio: fondo oscuro de OpenFreeMap (sin clave, gratis, con datos de
// OpenStreetMap) dibujado con MapLibre (vendor/maplibre-gl-6.11.2), y encima el recorrido en
// canvas (ui/ruta.js), proyectado con el mapa.
//
// · MapLibre se carga recién al mostrar un recorrido: nunca al abrir la app.
// · Sin mapa (sin conexión, sin WebGL, modo liviano, placa de video lenta, o si OpenFreeMap no
//   responde): el mismo recorrido sobre un fondo oscuro propio. Nunca tira error ni frena nada.
// · Un mapa por recorrido a la vista; se destruye (map.remove) apenas su lugar deja de estar en
//   pantalla (ver syncRouteViews). Nada queda dibujando en segundo plano.
//
// Las vistas sobreviven a los redibujos de la pantalla (renderApp y renderCoach cambian todo el
// HTML): la pantalla pone un lugar (routeSlot, un <div data-rv="nombre">) y después de dibujar,
// syncRouteViews vuelve a poner cada vista en su lugar (o la crea, o destruye las que ya no
// tienen lugar).
import { esc } from '../core/utils.js';
import { decodeTrack } from '../core/cardiogps.js';
import { RouteLayers, fitProjection, followProjection, prepareRoute, trackLayers, untrackLayers } from './ruta.js';

const LIB = "vendor/maplibre-gl-6.11.2/";
export const STYLE = "https://tiles.openfreemap.org/styles/dark";
const LOCALE = {
  "CooperativeGesturesHandler.WindowsHelpText": "Usá Ctrl + la rueda del mouse para acercar o alejar el mapa",
  "CooperativeGesturesHandler.MacHelpText": "Usá ⌘ + la rueda del mouse para acercar o alejar el mapa",
  "CooperativeGesturesHandler.MobileHelpText": "Usá dos dedos para mover el mapa",
  "AttributionControl.ToggleAttribution": "Ver los créditos del mapa",
  "AttributionControl.MapFeedback": "Avisar un error en el mapa",
};
const LOAD_MS = 6000;   // si el estilo no cargó en este tiempo: sin mapa
const IDLE_MS = 2000;   // después de cargar, cuánto se espera a que lleguen las calles antes de animar
const LIVE_SPAN = { pie: 500, bici: 1500 };   // en vivo sin mapa: metros a la vista
const LIVE_ZOOM = { pie: 15.5, bici: 14 };    // en vivo con mapa
const WAIT_CENTER = { lat: -34.6037, lon: -58.3816 }, WAIT_ZOOM = 4; // en vivo, hasta saber dónde está: de lejos (no parece una ubicación)
const HERE_RING_M = 25;   // con la precisión peor que esto, el círculo de la precisión alrededor del punto
const HERE_EDGE = 0.2;    // con recorrido, el mapa se vuelve a centrar si el punto se acerca a menos de esto (fracción) del borde
const RECENTER_MS = 5000; // …y como mucho cada 5 s (centrar = redibujar el recorrido)
// Las calles del estilo oscuro de OpenFreeMap casi no se ven en el mini mapa en vivo (calles
// #181818 sobre fondo #0C0C0C, y al sol menos): ahí se aclaran. El resumen queda como está.
const LIVE_PAINT = [
  ["background", "background-color", "#111214"],
  ["water", "fill-color", "#1A2230"],
  ["waterway", "line-color", "#1A2230"],
  ["landuse_park", "fill-color", "#1A211C"],
  ["landcover_wood", "fill-color", "#1A211C"],
  ["building", "fill-color", "#18191C"],
  ["building", "fill-outline-color", "#26282D"],
  ["highway_path", "line-color", "#33363D"],
  ["highway_minor", "line-color", "#3A3D44"],
  ["highway_major_casing", "line-color", "rgba(120,124,132,.75)"],
  ["highway_major_inner", "line-color", "#3F434B"],
  ["highway_major_subtle", "line-color", "#4A4E57"],
  ["highway_motorway_casing", "line-color", "rgba(130,134,142,.8)"],
  ["highway_motorway_subtle", "line-color", "#3A3D44"],
  ["railway", "line-color", "#3A3A3A"],
  ["railway_minor", "line-color", "#333333"],
  ["railway_transit", "line-color", "#333333"],
  ["highway_name_other", "text-color", "#8E939C"],
  ["highway_name_motorway", "text-color", "#9AA0A9"],
  ["place_suburb", "text-color", "#8A8F98"],
  ["place_other", "text-color", "#8A8F98"],
];
function brighten(map){
  for (const [id, prop, v] of LIVE_PAINT){ try { if (map.getLayer(id)) map.setPaintProperty(id, prop, v); } catch (e) {} }
}
// Metros por píxel CSS del mapa (MapLibre: teselas de 512 px) a ese zoom y esa latitud.
const mPerPx = (lat, z) => 40075016.686 * Math.cos(lat * Math.PI / 180) / (512 * Math.pow(2, z));
export const OFFLINE_TEXT = "Sin conexión: el recorrido sin el mapa de fondo.";

// ---- MapLibre (se carga una sola vez, recién cuando hace falta) ----
let _lib = null;
export function loadMapLib(){
  if (!_lib) _lib = (async () => {
    if (!document.querySelector("link[data-maplibre]")){
      const l = document.createElement("link");
      l.rel = "stylesheet"; l.href = LIB + "maplibre-gl.css"; l.dataset.maplibre = "1";
      document.head.appendChild(l);
    }
    const m = await import(new URL(LIB + "maplibre-gl.js", document.baseURI).href);
    const ml = m && m.Map ? m : (m && m.default);
    if (!ml || !ml.Map) throw new Error("MapLibre no cargó");
    // En la app del celular la dirección no es http(s): se le dice dónde está el worker.
    if (ml.setWorkerUrl) ml.setWorkerUrl(new URL(LIB + "maplibre-gl-worker.js", document.baseURI).href);
    return ml;
  })().catch(e => { _lib = null; throw e; });
  return _lib;
}
let _gl = null;
export function webglOk(){
  if (_gl === null){
    _gl = false;
    try {
      const c = document.createElement("canvas"), g = c.getContext("webgl2") || c.getContext("webgl");
      if (g){ _gl = true; const x = g.getExtension("WEBGL_lose_context"); if (x) x.loseContext(); }
    } catch (e) {}
  }
  return _gl;
}
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
// ¿Se puede poner el mapa de fondo? Con conexión, WebGL, sin modo liviano y sin una placa de
// video lenta (app/lite.js, ANR «La GPU no responde» en Android). "gize_mapa_off" = "1" lo apaga
// (para las pruebas y por si hiciera falta).
export function canUseMap(){
  if (lsGet("gize_mapa_off") === "1" || lsGet("gize_gpu_lenta") === "1") return false;
  if (document.documentElement.classList.contains("lite")) return false;
  if (navigator.onLine === false) return false;
  return webglOk();
}
const maxDpr = () => Math.min(window.devicePixelRatio || 1, document.documentElement.classList.contains("android-app") ? 1 : 2);
const reduced = () => !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
const isLite = () => document.documentElement.classList.contains("lite");
const lngLat = b => [[b.w, b.s], [b.e, b.n]];

// Un mapa en container, cargado (estilo y, con tope, las calles). opts: { bounds, padding,
// center, zoom, interactive, pixelRatio, preserveDrawingBuffer, attribution }.
// → Promise<{ map, ml }>; si no carga (error o LOAD_MS) se rechaza y no queda nada.
export async function createMap(container, opts){
  const ml = await loadMapLib();
  const o = {
    container, style: STYLE, attributionControl: false, fadeDuration: 0, renderWorldCopies: false,
    dragRotate: false, pitchWithRotate: false, touchPitch: false, maxPitch: 50, locale: LOCALE,
    interactive: opts.interactive !== false, cooperativeGestures: opts.interactive !== false,
    pixelRatio: opts.pixelRatio || maxDpr(), preserveDrawingBuffer: !!opts.preserveDrawingBuffer,
  };
  if (opts.bounds){ o.bounds = lngLat(opts.bounds); o.fitBoundsOptions = { padding: opts.padding || 40, maxZoom: 16 }; }
  else { o.center = opts.center; o.zoom = opts.zoom; }
  const map = new ml.Map(o);
  if (opts.attribution !== false) map.addControl(new ml.AttributionControl({ compact: false }), "bottom-right");
  try {
    await new Promise((ok, bad) => {
      const to = setTimeout(() => bad(new Error("el mapa tardó")), LOAD_MS);
      map.once("load", () => { clearTimeout(to); ok(); });
      map.on("error", ev => { if (!map.loaded()) { clearTimeout(to); bad((ev && ev.error) || new Error("mapa")); } });
    });
    // Las calles: se espera un rato a que lleguen (si no, se sigue igual y aparecen solas).
    await new Promise(ok => { if (map.areTilesLoaded && map.areTilesLoaded()) return ok(); const to = setTimeout(ok, opts.idleMs || IDLE_MS); map.once("idle", () => { clearTimeout(to); ok(); }); });
  } catch (e) {
    try { map.remove(); } catch (x) {}
    throw e;
  }
  return { map, ml };
}

// Foto del mapa para la imagen de compartir: un mapa aparte e invisible de w × h px CSS (al doble
// de resolución), centrado en bounds, del que se copia el dibujo; la proyección de los puntos se
// pide antes de sacarlo. → { canvas, project: (lon, lat) → [x, y] en px de la foto } o null.
export async function mapPhoto(bounds, w, h, padding, points){
  if (!canUseMap() || !bounds) return null;
  const box = document.createElement("div");
  box.style.cssText = "position:fixed;left:0;top:0;width:" + w + "px;height:" + h + "px;opacity:0;pointer-events:none;z-index:-1;";
  document.body.appendChild(box);
  let map = null;
  try {
    ({ map } = await createMap(box, { bounds, padding, interactive: false, pixelRatio: 2, preserveDrawingBuffer: true, attribution: false, idleMs: 5000 }));
    map.triggerRepaint();
    await new Promise(ok => { map.once("render", ok); setTimeout(ok, 500); });
    const src = map.getCanvas(), c = document.createElement("canvas");
    c.width = src.width; c.height = src.height;
    c.getContext("2d").drawImage(src, 0, 0);
    const k = c.width / w;
    const xy = (points || []).map(pc => pc.map(p => { const q = map.project([p.lon, p.lat]); return [q.x * k, q.y * k]; }));
    return { canvas: c, xy };
  } catch (e) {
    console.warn("mapa", e);
    return null;
  } finally {
    if (map) try { map.remove(); } catch (e) {}
    box.remove();
  }
}

// ---- Vista de un recorrido: mapa (o fondo propio) + el recorrido animado ----
// spec: { key, mode, track (texto de encodeTrack) | pieces, live (en vivo, sigue a la persona),
//   pad {top,right,bottom,left}, onProgress(m, total), onDone() }.
class RouteView {
  constructor(spec){
    this.spec = spec; this.mode = spec.mode === "bici" ? "bici" : "pie"; this.live = !!spec.live;
    this.dead = false; this.started = false; this.map = null; this.done = false; this.anim = null; this.playId = 0;
    const el = this.el = document.createElement("div");
    el.className = "rv" + (this.live ? " rv-live" : "");
    el.dataset.estado = "cargando";
    el.innerHTML = '<div class="rv-bg"></div><div class="rv-map"></div><div class="rv-layers"></div>' +
      (this.live ? '<div class="rv-here" hidden aria-hidden="true"><i class="rv-here-acc"></i><i class="rv-here-dot"></i></div>' : "") +
      '<div class="rv-msg" hidden></div>';
    this.layers = trackLayers(new RouteLayers(el.querySelector(".rv-layers")));
    this.layers.live = this.live;
    this.prep = this.live ? null : prepareRoute(spec.pieces || decodeTrack(spec.track || ""), this.mode);
    if (!this.live) this.layers.setRoute(this.prep);
  }
  get total(){ return this.prep ? this.prep.total : 0; }
  msg(t){ const m = this.el.querySelector(".rv-msg"); if (!m) return; m.hidden = !t; m.textContent = t || ""; }
  size(){ return { w: this.el.clientWidth, h: this.el.clientHeight }; }
  pad(){ return Object.assign({ top: 28, right: 28, bottom: 28, left: 28 }, this.spec.pad || {}); }
  attach(slot){
    if (this.el.parentNode !== slot) slot.appendChild(this.el);
    if (!this.ro && window.ResizeObserver){ this.ro = new ResizeObserver(() => this.relayout()); this.ro.observe(this.el); }
    if (!this.started){ this.started = true; this.start(); }
    else this.relayout(true);
  }
  // Tamaño o lugar nuevo: se vuelve a proyectar y se redibuja lo que había.
  relayout(force){
    if (this.dead) return;
    const { w, h } = this.size();
    if (!w || !h) return;
    const changed = this.layers.resize(w, h);
    if (this.map){ try { this.map.resize(); } catch (e) {} }
    if (!changed && !force) return;
    this.reproject();
    if (this.live) this.drawLive();
    else if (this.layers.raf) this.layers.drawAll(this.layers.m);
    else if (this.el.dataset.estado !== "cargando") this.layers.drawAll();
  }
  projection(){
    const { w, h } = this.size();
    if (this.map){ const map = this.map; return (lon, lat) => { const p = map.project([lon, lat]); return [p.x, p.y]; }; }
    if (this.live){ const c = this.liveCenter; return c ? followProjection(c, this.liveSpan(), w, h) : null; }
    return this.prep ? fitProjection(this.prep.bounds, w, h, this.pad()) : null;
  }
  reproject(){ const p = this.projection(); if (p && this.layers.prep) this.layers.setProjection(p); }

  async start(){
    await new Promise(r => requestAnimationFrame(r));
    if (this.dead) return;
    const { w, h } = this.size();
    this.layers.resize(w || 300, h || 200);
    if (this.live){ this.drawLive(); if (canUseMap()) this.liveMap(); return; }
    if (!this.prep){ this.msg("Esta salida no tiene recorrido."); this.finish(); return; }
    if (canUseMap()){
      this.msg("Cargando el mapa…");
      try { await this.makeMap({ bounds: this.prep.bounds, padding: this.pad(), interactive: true }); }
      catch (e) { if (this.dead) return; this.msg(navigator.onLine === false || /fetch|network|load|failed/i.test(String(e && e.message)) ? OFFLINE_TEXT : ""); }
      if (this.dead) return;
      if (this.map) this.msg("");
    } else if (navigator.onLine === false && !isLite()) this.msg(OFFLINE_TEXT);
    this.reproject();
    this.play();
  }
  async makeMap(opts){
    const box = this.el.querySelector(".rv-map");
    const { map } = await createMap(box, opts);
    if (this.dead){ try { map.remove(); } catch (e) {} return; }
    if (this.live) brighten(map);
    this.map = map;
    this.handlers(false);
    this.el.classList.add("con-mapa");
    // El mapa se mueve (después de la animación, o al acomodarse): el recorrido lo sigue. Durante
    // la animación no (cada cuadro dibuja lo suyo); al terminar se vuelve a proyectar (finish) y
    // al final de cada movimiento también (moveend), por si se movió mientras dibujaba.
    let q = 0;
    const follow = () => { if (this.dead || this.layers.raf) return; this.reproject(); this.live ? this.drawLive() : this.layers.drawAll(); };
    map.on("move", () => { if (q) return; q = requestAnimationFrame(() => { q = 0; follow(); }); });
    if (!this.live) map.on("moveend", follow); // en vivo la cámara la mueve setLive, que ya redibuja
  }
  handlers(on){
    const m = this.map; if (!m || this.live) return;
    ["dragPan", "scrollZoom", "touchZoomRotate", "doubleClickZoom", "keyboard", "boxZoom"].forEach(k => { try { if (m[k]) on ? m[k].enable() : m[k].disable(); } catch (e) {} });
    try { if (on && m.touchZoomRotate) m.touchZoomRotate.disableRotation(); } catch (e) {}
  }
  // Dibuja el recorrido: animado o, con movimiento reducido o modo liviano, entero de una.
  play(){
    if (this.dead || !this.prep) return;
    this.done = false;
    const total = this.prep.total, onP = this.spec.onProgress;
    if (reduced() || isLite()){
      this.layers.drawAll();
      if (onP) onP(total, total);
      this.finish();
      return;
    }
    this.el.dataset.estado = "animando";
    // Cada dibujo con su número: si «Ver de nuevo» corta uno a la mitad, ese ya no termina nada
    // (si no, el viejo pondría «listo» e inclinaría el mapa en medio del dibujo nuevo).
    const id = ++this.playId;
    this.anim = this.layers.animate(m => { if (onP) onP(m, total); }).then(() => { if (!this.dead && id === this.playId) this.finish(); });
  }
  finish(){
    this.el.dataset.estado = "listo"; this.done = true;
    this.handlers(true);
    // Por si el mapa se movió mientras dibujaba: el recorrido otra vez en su lugar.
    if (this.map){ this.reproject(); this.layers.drawAll(); }
    // Al terminar, el mapa se inclina apenas (como una foto aérea), salvo movimiento reducido.
    if (this.map && !reduced() && !isLite() && !this.tilted){
      this.tilted = true;
      try { this.map.easeTo({ pitch: 38, bearing: -12, duration: 1200 }); } catch (e) {}
    }
    if (this.spec.onDone) try { this.spec.onDone(); } catch (e) {}
  }
  // «Ver de nuevo»: la cámara a como empezó y se dibuja otra vez.
  replay(){
    if (this.dead || !this.prep) return;
    this.playId++;
    this.layers.stop();
    if (this.map){
      this.handlers(false);
      try { this.map.stop(); this.map.jumpTo({ pitch: 0, bearing: 0 }); this.map.fitBounds(lngLat(this.prep.bounds), { padding: this.pad(), maxZoom: 16, animate: false }); } catch (e) {}
      this.tilted = false;
    }
    this.reproject();
    this.play();
  }

  // ---- En vivo ----
  // pieces: [[{lat, lon, t (s)}]] de lo medido hasta ahora (ver screens/cardio.js). Como mucho
  // cada 5 s: redibuja el recorrido entero y centra en la última ubicación.
  setLive(pieces){
    if (this.dead) return;
    const prep = prepareRoute(pieces, this.mode);
    this.prep = prep; this.layers.setRoute(prep);
    this.liveCenter = this.centerNow();
    if (this.map && this.liveCenter) this.camera();
    if (this.started) { this.reproject(); this.drawLive(); }
    this.recenterAt = Date.now();
  }
  // La ubicación de ahora (spec.here(): { lat, lon, acc } o null), aunque el motor no la haya
  // aceptado todavía.
  here(){ try { const h = this.spec.here && this.spec.here(); return h && Number.isFinite(h.lat) && Number.isFinite(h.lon) ? h : null; } catch (e) { return null; } }
  // Dónde centrar: la ubicación de ahora o, si no hay, el final del recorrido.
  centerNow(){
    const h = this.here(); if (h) return { lat: h.lat, lon: h.lon };
    const prep = this.prep; if (!prep) return null;
    const lp = prep.pieces[prep.pieces.length - 1], p = lp[lp.length - 1];
    return { lat: p.lat, lon: p.lon };
  }
  // Zoom del mapa: el de siempre o, sin recorrido y con la precisión floja, más de lejos para que
  // entre el círculo de la precisión.
  liveZoom(){
    const z = LIVE_ZOOM[this.mode], h = this.here();
    if (this.prep || !h || !(h.acc > HERE_RING_M) || !this.liveCenter) return z;
    const { w, h: hh } = this.size(), r = Math.max(40, Math.min(w || 300, hh || 170) * 0.42);
    return Math.max(12, Math.min(z, Math.log2(40075016.686 * Math.cos(this.liveCenter.lat * Math.PI / 180) * r / (512 * h.acc))));
  }
  // Sin mapa de fondo: metros a la vista (igual, más si el círculo de la precisión no entra).
  liveSpan(){
    const s = LIVE_SPAN[this.mode], h = this.here();
    return !this.prep && h && h.acc > HERE_RING_M ? Math.max(s, h.acc * 2.4) : s;
  }
  camera(){
    const c = this.liveCenter; if (!this.map || !c) return;
    try { this.map.jumpTo({ center: [c.lon, c.lat], zoom: this.liveZoom() }); } catch (e) {}
  }
  // Llegó una ubicación (como mucho una por segundo, ui/gps.js onHere). Barato: mueve el punto.
  // Sin recorrido todavía, el mapa la sigue (no hay nada más que redibujar); con recorrido, el
  // mapa se vuelve a centrar solo si el punto se va hacia el borde (y como mucho cada 5 s).
  setHere(){
    if (this.dead || !this.started) return;
    const h = this.here(); if (!h) return;
    if (!this.prep){
      this.liveCenter = { lat: h.lat, lon: h.lon };
      if (this.map) this.camera(); // el mapa se mueve: "move" redibuja (drawLive)
      this.drawLive();
      return;
    }
    const xy = this.placeHere();
    const { w, h: hh } = this.size(), now = Date.now();
    const out = !xy || xy[0] < w * HERE_EDGE || xy[0] > w * (1 - HERE_EDGE) || xy[1] < hh * HERE_EDGE || xy[1] > hh * (1 - HERE_EDGE);
    if (out && !(now - (this.recenterAt || 0) < RECENTER_MS)){
      this.recenterAt = now;
      this.liveCenter = { lat: h.lat, lon: h.lon };
      if (this.map) this.camera();
      this.reproject(); this.drawLive();
    } else if (this.layers.xy){ this.tip(); this.layers.marks(true); } // solo la punta (barato)
  }
  // La punta del recorrido en vivo: del último punto medido hasta «estás acá», para que la línea
  // llegue siempre al punto azul aunque el motor todavía no haya aceptado lo último (espera a
  // confirmar que se mueve) o el recorrido se redibuje cada 5 s. spec.tip(): "linea" (del color
  // del final), "hueco" (gris de puntos: hubo un corte del GPS o el dato es flojo) o "" (nada:
  // pausa, o el dato no tiene que ver con el recorrido). Solo para dibujar: no suma nada.
  tip(){
    const L = this.layers; L.tip = null;
    let k = ""; try { k = (this.spec.tip && this.spec.tip()) || ""; } catch (e) {}
    const h = k && this.here(), proj = h && L.xy && this.projection();
    if (!proj) return;
    const p = proj(h.lon, h.lat);
    if (Number.isFinite(p[0]) && Number.isFinite(p[1])) L.tip = { x: p[0], y: p[1], dash: k !== "linea" };
  }
  // El punto «estás acá» (y el círculo de la precisión si es floja) en su lugar. → [x, y] o null.
  placeHere(){
    const el = this.el.querySelector(".rv-here"); if (!el) return null;
    const h = this.here(), proj = h && this.projection();
    if (!h || !proj){ el.hidden = true; return null; }
    const p = proj(h.lon, h.lat), q = proj(h.lon, h.lat + h.acc / 111319.49);
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])){ el.hidden = true; return null; }
    const r = Math.abs(p[1] - q[1]), ring = h.acc > HERE_RING_M && Number.isFinite(r) && r > 9;
    el.style.transform = "translate(" + p[0].toFixed(1) + "px," + p[1].toFixed(1) + "px)";
    const acc = el.firstChild;
    acc.hidden = !ring;
    if (ring){ const d = Math.min(2000, r * 2).toFixed(1) + "px"; acc.style.width = d; acc.style.height = d; }
    if (el.hidden){ el.hidden = false; el.classList.add("rv-here-in"); }
    el.dataset.acc = ring ? "floja" : "buena";
    return p;
  }
  // Texto arriba del mini mapa (spec.status(): "permiso" | "sin-gps" | "" desde la pantalla).
  liveMsg(){
    let st = ""; try { st = (this.spec.status && this.spec.status()) || ""; } catch (e) {}
    if (st === "permiso") return "Sin permiso de ubicación";
    if (this.prep) return "";
    const h = this.here();
    if (!h) return st === "sin-gps" ? "Sin ubicación" : "Buscando tu ubicación…";
    if (h.acc > HERE_RING_M) return "Estás por acá (±" + Math.round(h.acc) + " m). Afinando el GPS…";
    return "Estás acá. El recorrido aparece cuando te muevas.";
  }
  drawLive(){
    const L = this.layers;
    this.msg(this.liveMsg());
    this.el.dataset.estado = "listo";
    if (!this.liveCenter && this.here()) this.liveCenter = this.centerNow();
    if (!L.prep){ L.clear(); L.marks(false); this.placeHere(); return; }
    if (!L.xy) this.reproject();
    this.tip();
    L.drawAll(); L.marks(true);
    this.placeHere();
  }
  async liveMap(){
    if (!this.liveCenter) this.liveCenter = this.centerNow();
    const c = this.liveCenter || WAIT_CENTER;
    try { await this.makeMap({ center: [c.lon, c.lat], zoom: this.liveCenter ? this.liveZoom() : WAIT_ZOOM, interactive: false }); }
    catch (e) { return; }
    if (this.dead || !this.map) return;
    if (!this.liveCenter) this.liveCenter = this.centerNow();
    if (this.liveCenter) this.camera();
    this.reproject(); this.drawLive();
  }

  destroy(){
    if (this.dead) return;
    this.dead = true;
    untrackLayers(this.layers);
    this.layers.destroy();
    if (this.ro) try { this.ro.disconnect(); } catch (e) {}
    if (this.map) try { this.map.remove(); } catch (e) {}
    this.map = null;
    this.el.remove();
  }
}

// ---- Lugares en la pantalla ----
const views = new Map(), specs = new Map();
// HTML del lugar donde va la vista «name». spec: ver RouteView (key cambia → vista nueva).
export function routeSlot(name, spec, cls){
  specs.set(name, spec);
  return '<div class="rv-slot' + (cls ? " " + cls : "") + '" data-rv="' + esc(name) + '"></div>';
}
// Después de dibujar: cada vista a su lugar; las que no tienen lugar, afuera.
export function syncRouteViews(){
  const seen = new Set();
  document.querySelectorAll("[data-rv]").forEach(slot => {
    const name = slot.dataset.rv, spec = specs.get(name);
    if (!spec || seen.has(name)) return;
    seen.add(name);
    let v = views.get(name);
    if (v && v.spec.key !== spec.key){ v.destroy(); views.delete(name); v = null; }
    if (!v){ v = new RouteView(spec); views.set(name, v); }
    else v.spec = Object.assign(v.spec, { onProgress: spec.onProgress, onDone: spec.onDone, pad: spec.pad });
    v.attach(slot);
  });
  for (const [name, v] of views) if (!seen.has(name)){ v.destroy(); views.delete(name); specs.delete(name); }
}
export const routeView = name => views.get(name) || null;
export function dropRouteViews(){ for (const v of views.values()) v.destroy(); views.clear(); specs.clear(); }
