// El mapa de Cardio: el recorrido de una salida, en vivo mientras corre y guardado (Tus salidas).
//
// · Con la clave de MapTiler y MapLibre: mapa oscuro con el recorrido en neón (la gama de GIZE).
//   La clave NO está en el repo: la da la función "mapa-clave" (supabase/functions/mapa-clave),
//   que la lee del secret MAPTILER_KEY. Se guarda en memoria y en sessionStorage.
//   MapLibre (vendor/maplibre-gl-6.11.2) se carga recién al mostrar un mapa: nunca al abrir la
//   app ni en Cardio sin una salida en curso o abierta.
// · Sin clave, sin internet, sin WebGL o si el mapa no carga: el recorrido solo, dibujado en SVG
//   sobre la tarjeta oscura (sin calles). Nunca tira error ni frena la salida.
//
// Los mapas sobreviven a los redibujos de la pantalla (renderApp cambia todo el HTML): cada uno
// es un nodo que se guarda acá, por nombre, y después de cada redibujo se vuelve a poner en su
// lugar (un <div data-map-slot="nombre">). Ver mountMap.
//
// Recorrido: [[lat, lon], …] por tramo (ver core/cardiogps.js). Los tramos no se unen entre sí.
import { State } from '../core/state.js';

const LIB = "vendor/maplibre-gl-6.11.2/";
const STYLE = "https://api.maptiler.com/maps/dataviz-dark/style.json?key=";
// Lo que piden MapTiler y OpenStreetMap: se ve siempre abajo del mapa (el mismo texto que trae
// el estilo de MapTiler, así no sale repetido).
const ATTRIB = '<a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener">&copy; MapTiler</a> <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">&copy; OpenStreetMap contributors</a>';
const LOCALE = {
  "CooperativeGesturesHandler.WindowsHelpText": "Usá Ctrl + la rueda del mouse para acercar o alejar el mapa",
  "CooperativeGesturesHandler.MacHelpText": "Usá ⌘ + la rueda del mouse para acercar o alejar el mapa",
  "CooperativeGesturesHandler.MobileHelpText": "Usá dos dedos para mover el mapa",
  "AttributionControl.ToggleAttribution": "Ver los créditos del mapa",
  "AttributionControl.MapFeedback": "Avisar un error en el mapa",
};
// La gama de GIZE (--gize-r1 → --gize-r2 → --gize-r3, ver brand/tokens.css).
const C1 = "#2FA0FF", C2 = "#A65CFF", C3 = "#FF3DAE";
const KEY_SS = "gize_mapa_clave";
const LIVE_EVERY_MS = 1000; // en vivo, el dibujo se actualiza como mucho una vez por segundo
const FOLLOW_AFTER_MS = 15000; // si la persona movió el mapa, deja de seguirla este rato
const LOAD_MS = 12000; // si el mapa no terminó de cargar en este tiempo, queda el SVG

// ---- Clave de MapTiler ----
let _key; // undefined: no se pidió todavía; null: no hay (o el secret no está cargado)
let _keyReq = null;
export function mapKey(){
  if (_key !== undefined) return Promise.resolve(_key);
  try { const s = sessionStorage.getItem(KEY_SS); if (s !== null){ _key = s || null; return Promise.resolve(_key); } } catch (e) {}
  if (!State.sb || !State.cloudUser || navigator.onLine === false) return Promise.resolve(null);
  if (!_keyReq) _keyReq = (async () => {
    try {
      const r = await Promise.race([State.sb.functions.invoke("mapa-clave", { body: {} }), new Promise(ok => setTimeout(() => ok(null), 8000))]);
      const d = r && !r.error ? r.data : null;
      if (d && typeof d === "object" && "key" in d){
        _key = typeof d.key === "string" && /^[A-Za-z0-9._-]{8,200}$/.test(d.key) ? d.key : null;
        try { sessionStorage.setItem(KEY_SS, _key || ""); } catch (e) {}
        return _key;
      }
    } catch (e) {}
    return null; // falló el pedido (sin señal, función sin publicar): se vuelve a pedir otra vez
  })().finally(() => { _keyReq = null; });
  return _keyReq;
}

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

function webglOk(){
  try {
    const c = document.createElement("canvas"), g = c.getContext("webgl2") || c.getContext("webgl");
    if (!g) return false;
    const x = g.getExtension("WEBGL_lose_context"); if (x) x.loseContext();
    return true;
  } catch (e) { return false; }
}

// ---- Vistas ----
const views = {};
const count = segs => (segs || []).reduce((n, s) => n + (s ? s.length : 0), 0);
const firstPt = segs => { const s = (segs || []).find(x => x && x.length); return s ? s[0] : null; };
const lastPt = segs => { for (let i = (segs || []).length - 1; i >= 0; i--) if (segs[i] && segs[i].length) return segs[i][segs[i].length - 1]; return null; };

// Pone (o actualiza) el mapa «name» en su lugar de la pantalla. opts.live: sigue a la persona.
export function mountMap(name, segs, opts){
  try {
    const slot = document.querySelector('[data-map-slot="' + name + '"]');
    if (!slot) return;
    let v = views[name];
    if (!v) v = makeView(name, opts || {});
    // La salida en curso terminó: el mismo mapa pasa a mostrar todo el recorrido.
    else if (opts && !!opts.live !== v.live){ v.live = !!opts.live; v.fitted = false; v.el.classList.toggle("live", v.live); }
    if (v.el.parentNode !== slot){
      slot.appendChild(v.el);
      if (v.wantGL) createGL(v);
      if (v.map) try { v.map.resize(); } catch (e) {}
    }
    setRoute(v, segs);
  } catch (e) { console.warn("mapa", e); }
}
// En vivo (el reloj de la pantalla): redibuja si llegaron puntos, como mucho una vez por
// segundo y solo con la app a la vista (en el celular, en segundo plano el GPS sigue anotando
// y al volver se dibuja todo junto).
export function updateMap(name, segs){
  const v = views[name]; if (!v || document.visibilityState === "hidden") return;
  if (count(segs) === v.drawn || Date.now() - v.at < LIVE_EVERY_MS) return;
  try { setRoute(v, segs); } catch (e) { console.warn("mapa", e); }
}
export function dropMap(name){
  const v = views[name]; if (!v) return;
  delete views[name]; v.dead = true; clearTimeout(v.gto);
  if (v.map) try { v.map.remove(); } catch (e) {}
  v.map = null; v.el.remove();
}
export const hasMap = name => !!views[name];
// Saca los mapas cuyo nombre empieza con prefix, menos keep.
export function dropMaps(prefix, keep){ Object.keys(views).forEach(n => { if (n.indexOf(prefix) === 0 && n !== keep) dropMap(n); }); }

function makeView(name, opts){
  const el = document.createElement("div");
  el.className = "gmap" + (opts.live ? " live" : "");
  el.innerHTML = '<div class="gmap-svg"></div>';
  const v = { name, el, live: !!opts.live, segs: [], drawn: -1, at: 0, map: null, gl: false, dead: false, wantGL: false, touched: 0, fitted: false };
  views[name] = v;
  upgrade(v);
  return v;
}

function setRoute(v, segs){
  v.segs = segs || []; v.drawn = count(v.segs); v.at = Date.now();
  if (v.gl) try { drawGL(v); return; } catch (e) { console.warn("mapa", e); }
  drawSvg(v);
}

// ---- Sin mapa de fondo: SVG ----
function drawSvg(v){
  const box = v.el.querySelector(".gmap-svg"); if (!box) return;
  v.el.classList.remove("gl");
  let segs = (v.segs || []).filter(s => s && s.length);
  if (!segs.length){
    box.innerHTML = '<div class="gmap-empty">' + (v.live ? "Tu recorrido aparece acá cuando llega la señal del GPS." : "Esta salida no tiene recorrido.") + '</div>';
    return;
  }
  let minLa = 90, maxLa = -90, minLo = 180, maxLo = -180;
  segs.forEach(s => s.forEach(p => { if (p[0] < minLa) minLa = p[0]; if (p[0] > maxLa) maxLa = p[0]; if (p[1] < minLo) minLo = p[1]; if (p[1] > maxLo) maxLo = p[1]; }));
  // Plano en metros alrededor del centro (sobra para una salida). La y va para abajo.
  const kx = 111319.49 * Math.cos((minLa + maxLa) / 2 * Math.PI / 180), ky = 111319.49;
  const X = lo => (lo - minLo) * kx, Y = la => (maxLa - la) * ky;
  let w = X(maxLo), h = Y(minLa);
  // Muchos puntos: para dibujar alcanza con menos (no cambia la forma a esta escala).
  if (count(segs) > 3000){
    const tol = Math.max(w, h) / 1500;
    segs = segs.map(s => thinForDraw(s, X, Y, tol));
  }
  const min = 60, ox = Math.max(0, (min - w) / 2), oy = Math.max(0, (min - h) / 2);
  w = Math.max(w, min); h = Math.max(h, min);
  const pad = Math.max(w, h) * 0.08, r = Math.max(w, h) * 0.022;
  const n = x => (Math.round(x * 10) / 10);
  const P = p => n(X(p[1]) + ox) + " " + n(Y(p[0]) + oy);
  const d = segs.filter(s => s.length >= 2).map(s => "M" + s.map(P).join("L")).join("");
  const a = firstPt(segs), b = lastPt(segs), id = "gmg-" + v.name;
  const dot = (p, fill, big) => { const [x, y] = P(p).split(" "); return '<circle cx="' + x + '" cy="' + y + '" r="' + n(big ? r * 1.25 : r) + '" fill="' + fill + '" stroke="#fff" stroke-width="' + n(r * 0.45) + '"/>'; };
  box.innerHTML = '<svg class="gmap-route" viewBox="' + n(-pad) + ' ' + n(-pad) + ' ' + n(w + 2 * pad) + ' ' + n(h + 2 * pad) + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Recorrido de la salida">'
    + '<defs><linearGradient id="' + id + '" gradientUnits="userSpaceOnUse" x1="' + n(-pad) + '" y1="' + n(-pad) + '" x2="' + n(w + pad) + '" y2="' + n(h + pad) + '">'
    + '<stop offset="0" stop-color="' + C1 + '"/><stop offset=".5" stop-color="' + C2 + '"/><stop offset="1" stop-color="' + C3 + '"/></linearGradient></defs>'
    + (d ? '<path d="' + d + '" fill="none" stroke="' + C2 + '" stroke-opacity=".3" stroke-width="11" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>'
      + '<path class="gmap-line" d="' + d + '" fill="none" stroke="url(#' + id + ')" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>' : "")
    + dot(a, C1) + (v.live ? dot(b, "#fff", true) : dot(b, C3))
    + '</svg>';
}
// Douglas–Peucker en el plano del dibujo (solo para dibujar menos puntos).
function thinForDraw(s, X, Y, tol){
  if (s.length < 3) return s;
  const keep = new Uint8Array(s.length); keep[0] = keep[s.length - 1] = 1;
  const st = [[0, s.length - 1]], t2 = tol * tol;
  while (st.length){
    const [i0, i1] = st.pop();
    const ax = X(s[i0][1]), ay = Y(s[i0][0]), dx = X(s[i1][1]) - ax, dy = Y(s[i1][0]) - ay, L = dx * dx + dy * dy;
    let far = -1, fd = t2;
    for (let i = i0 + 1; i < i1; i++){
      const px = X(s[i][1]), py = Y(s[i][0]);
      let u = L > 0 ? ((px - ax) * dx + (py - ay) * dy) / L : 0; u = Math.max(0, Math.min(1, u));
      const ex = ax + u * dx - px, ey = ay + u * dy - py, dd = ex * ex + ey * ey;
      if (dd > fd){ fd = dd; far = i; }
    }
    if (far > 0){ keep[far] = 1; st.push([i0, far], [far, i1]); }
  }
  return s.filter((_, i) => keep[i]);
}

// ---- Con mapa de fondo: MapLibre + MapTiler ----
async function upgrade(v){
  try {
    if (navigator.onLine === false || !webglOk()) return;
    const key = await mapKey(); if (!key || v.dead) return;
    const ml = await loadMapLib(); if (v.dead) return;
    v.ml = ml; v.key = key;
    if (v.el.isConnected) createGL(v); else v.wantGL = true;
  } catch (e) { console.warn("mapa", e); }
}

function createGL(v){
  v.wantGL = false;
  if (v.map || v.dead || !v.ml) return;
  const ml = v.ml, box = document.createElement("div");
  box.className = "gmap-gl";
  v.el.appendChild(box);
  const c = lastPt(v.segs) || firstPt(v.segs);
  let map;
  try {
    map = new ml.Map({
      container: box, style: STYLE + encodeURIComponent(v.key),
      center: c ? [c[1], c[0]] : [0, 0], zoom: c ? 15 : 1,
      attributionControl: false, cooperativeGestures: true, locale: LOCALE,
      dragRotate: false, pitchWithRotate: false, touchPitch: false, fadeDuration: 0,
    });
  } catch (e) { box.remove(); console.warn("mapa", e); return; }
  v.map = map;
  // Si el estilo no llega (sin señal, clave rechazada, MapTiler caído) queda el SVG.
  const fail = () => {
    if (v.map !== map) return;
    clearTimeout(v.gto); v.map = null; v.gl = false;
    try { map.remove(); } catch (e) {}
    box.remove(); drawSvg(v);
  };
  v.gto = setTimeout(() => { if (!v.gl) fail(); }, LOAD_MS);
  map.on("error", () => { if (!v.gl) fail(); });
  map.on("load", () => {
    if (v.map !== map || v.dead) return;
    clearTimeout(v.gto);
    try {
      // Créditos: los que trae el estilo de MapTiler (MapTiler + OpenStreetMap), una sola vez. Antes
      // se sumaba ATTRIB encima y salían repetidos. Si el estilo no trae ninguno, va ATTRIB.
      const own = (() => { try { return Object.values(map.getStyle().sources || {}).some(x => x && x.attribution); } catch (e) { return false; } })();
      map.addControl(new ml.AttributionControl(own ? { compact: false } : { compact: false, customAttribution: ATTRIB }), "bottom-right");
      map.addSource("ruta", { type: "geojson", data: lines(v.segs), lineMetrics: true });
      const lay = { "line-cap": "round", "line-join": "round" };
      map.addLayer({ id: "ruta-brillo", type: "line", source: "ruta", layout: lay, paint: { "line-color": C2, "line-width": 12, "line-opacity": 0.35, "line-blur": 6 } });
      map.addLayer({ id: "ruta", type: "line", source: "ruta", layout: lay, paint: { "line-width": 4.5, "line-gradient": ["interpolate", ["linear"], ["line-progress"], 0, C1, 0.5, C2, 1, C3] } });
      map.addSource("puntas", { type: "geojson", data: ends(v) });
      map.addLayer({ id: "puntas", type: "circle", source: "puntas", paint: { "circle-radius": ["get", "r"], "circle-color": ["get", "c"], "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
    } catch (e) { console.warn("mapa", e); fail(); return; }
    // Logo de MapTiler (lo piden en el plan gratis) con link a su sitio.
    const logo = document.createElement("a");
    logo.className = "gmap-logo"; logo.href = "https://www.maptiler.com"; logo.target = "_blank"; logo.rel = "noopener";
    const img = document.createElement("img");
    img.alt = "MapTiler"; img.width = 67; img.height = 20;
    img.addEventListener("error", () => logo.remove()); // sin el logo quedan igual los créditos
    img.src = "https://api.maptiler.com/resources/logo.svg";
    logo.appendChild(img); box.appendChild(logo);
    v.gl = true;
    if (v.live){
      const touch = e => { if (e && e.originalEvent) v.touched = Date.now(); };
      map.on("dragstart", touch); map.on("zoomstart", touch);
    }
    try { drawGL(v); } catch (e) { console.warn("mapa", e); fail(); }
  });
}

function lines(segs){
  return { type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: (segs || []).filter(s => s && s.length >= 2).map(s => s.map(p => [p[1], p[0]])) } };
}
function ends(v){
  const a = firstPt(v.segs), b = lastPt(v.segs), f = [];
  const pt = (p, c, r) => ({ type: "Feature", properties: { c, r }, geometry: { type: "Point", coordinates: [p[1], p[0]] } });
  if (a) f.push(pt(a, C1, 6));
  if (b && (b !== a || v.live)) f.push(v.live ? pt(b, "#fff", 7) : pt(b, C3, 6));
  return { type: "FeatureCollection", features: f };
}

function drawGL(v){
  const map = v.map; if (!map) return;
  const b = lastPt(v.segs);
  v.el.classList.toggle("gl", !!b);
  if (!b){ drawSvg(v); v.el.classList.remove("gl"); return; }
  const s1 = map.getSource("ruta"), s2 = map.getSource("puntas");
  if (s1) s1.setData(lines(v.segs));
  if (s2) s2.setData(ends(v));
  if (v.live){
    // Sigue a la persona, salvo que haya movido el mapa hace poco.
    if (Date.now() - v.touched < FOLLOW_AFTER_MS) return;
    if (!v.fitted){ v.fitted = true; map.jumpTo({ center: [b[1], b[0]], zoom: 16 }); }
    else map.easeTo({ center: [b[1], b[0]], duration: 600 });
    return;
  }
  if (v.fitted) return;
  v.fitted = true;
  let minLa = 90, maxLa = -90, minLo = 180, maxLo = -180;
  v.segs.forEach(s => s.forEach(p => { minLa = Math.min(minLa, p[0]); maxLa = Math.max(maxLa, p[0]); minLo = Math.min(minLo, p[1]); maxLo = Math.max(maxLo, p[1]); }));
  map.fitBounds([[minLo, minLa], [maxLo, maxLa]], { padding: 36, maxZoom: 17, animate: false });
}
