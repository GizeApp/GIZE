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
    this.dead = false; this.started = false; this.map = null; this.done = false; this.anim = null;
    const el = this.el = document.createElement("div");
    el.className = "rv" + (this.live ? " rv-live" : "");
    el.dataset.estado = "cargando";
    el.innerHTML = '<div class="rv-bg"></div><div class="rv-map"></div><div class="rv-layers"></div><div class="rv-msg" hidden></div>';
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
    if (this.live){ const c = this.liveCenter; return c ? followProjection(c, LIVE_SPAN[this.mode], w, h) : null; }
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
    this.map = map;
    this.handlers(false);
    this.el.classList.add("con-mapa");
    // El mapa se mueve (después de la animación, o al acomodarse): el recorrido lo sigue.
    let q = 0;
    map.on("move", () => { if (q) return; q = requestAnimationFrame(() => { q = 0; if (this.dead || this.layers.raf) return; this.reproject(); this.live ? this.drawLive() : this.layers.drawAll(); }); });
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
    this.anim = this.layers.animate(m => { if (onP) onP(m, total); }).then(() => { if (!this.dead) this.finish(); });
  }
  finish(){
    this.el.dataset.estado = "listo"; this.done = true;
    this.handlers(true);
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
  // pieces: [[{lat, lon, t (s)}]] de lo medido hasta ahora (ver screens/cardio.js).
  setLive(pieces){
    if (this.dead) return;
    const prep = prepareRoute(pieces, this.mode);
    this.prep = prep; this.layers.setRoute(prep);
    if (prep){ const lp = prep.pieces[prep.pieces.length - 1], p = lp[lp.length - 1]; this.liveCenter = { lat: p.lat, lon: p.lon }; }
    if (this.map && this.liveCenter){ try { this.map.jumpTo({ center: [this.liveCenter.lon, this.liveCenter.lat] }); } catch (e) {} }
    if (this.started) { this.reproject(); this.drawLive(); }
  }
  drawLive(){
    const L = this.layers;
    if (!L.prep){ L.clear(); L.marks(false); this.msg("Tu recorrido aparece acá cuando llega la señal del GPS."); this.el.dataset.estado = "listo"; return; }
    this.msg("");
    if (!L.xy) this.reproject();
    L.drawAll(); L.marks(true);
    this.el.dataset.estado = "listo";
  }
  async liveMap(){
    const c = this.liveCenter || { lat: -34.6037, lon: -58.3816 };
    try { await this.makeMap({ center: [c.lon, c.lat], zoom: LIVE_ZOOM[this.mode], interactive: false }); }
    catch (e) { return; }
    if (this.dead || !this.map) return;
    if (this.liveCenter) try { this.map.jumpTo({ center: [this.liveCenter.lon, this.liveCenter.lat] }); } catch (e) {}
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
