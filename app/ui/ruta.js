// El recorrido de una salida de Cardio dibujado en canvas 2D: coloreado por velocidad con la gama
// de GIZE (lento = frío, var(--gize-r1); rápido = intenso, var(--gize-r3)) y con estilo de tubo de
// neón (halo, línea y brillo). El mismo dibujo sirve encima del mapa (ui/mapa.js, proyectando con
// el mapa), sin mapa (proyección propia) y en la imagen para compartir (ui/compartir.js).
//
// Animación (RouteLayers.animate): la línea se dibuja de a poco por distancia recorrida, con una
// cabeza que brilla y una estela («cometa»). Para que cada cuadro cueste poco, cada capa es un
// canvas propio y solo se le suma lo nuevo de ese cuadro (trazos opacos: no quedan «cuentas» en
// las uniones); el halo y el brillo toman su opacidad y desenfoque del CSS (.rv-halo, .rv-hi), que
// lo compone la placa de video. La cabeza va en otra capa que sí se borra en cada cuadro.
// Termina sola (4 a 6 s): nada queda dando vueltas. Con la app en segundo plano no se dibuja.
// Con el neón apagado (html.sin-neon): grises a blanco y sin halo.
import { colorDomain, haversine, simplifyLine, speedT, trackPoints } from '../core/cardiogps.js';
import { gizeGamut } from './background.js';
import { appAway, onAwayChange } from './pausa.js';

const MAX_DRAW = 1500;    // con más puntos se simplifica para dibujar (no cambia la forma)
const LINE_W = 5, HALO_W = 14, HI_W = 1.5;  // anchos en px CSS
const TAIL = 0.06;        // la estela: el último 6 % de lo dibujado

// ---- Colores ----
function parseColor(s){
  s = String(s || "").trim();
  let m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) return m[1].split("").map(c => parseInt(c + c, 16));
  m = /^#([0-9a-f]{6})/i.exec(s);
  if (m) return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
  m = /rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/i.exec(s);
  if (m) return [+m[1], +m[2], +m[3]];
  return null;
}
const css = c => "rgb(" + c.map(v => Math.round(v)).join(",") + ")";
const cssA = (c, a) => "rgba(" + c.map(v => Math.round(v)).join(",") + "," + a + ")";
const lerp = (a, b, f) => a + (b - a) * f;
const mix = (a, b, f) => [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)];

// La gama del tema (brand/tokens.css y css/ui/tema-*.css): lento → medio → rápido. Con el neón
// apagado, de gris a blanco y sin brillo. → { slow, mid, fast: [r, g, b], glow }
export function palette(){
  const h = document.documentElement;
  if (h.classList.contains("sin-neon")) return { slow: [110, 116, 130], mid: [178, 184, 194], fast: [255, 255, 255], glow: false };
  const g = gizeGamut(), def = [[47, 160, 255], [166, 92, 255], [255, 61, 174]];
  // Sin halo de color alrededor del recorrido (apariencia tranquila, css/ui/calma.css): la línea
  // conserva los colores de velocidad.
  return { slow: parseColor(g[0]) || def[0], mid: parseColor(g[1]) || def[1], fast: parseColor(g[2]) || def[2], glow: false };
}
// Color de t (0 lento … 1 rápido) como [r, g, b]: lento → medio → rápido.
export function colorRGB(t, pal){
  t = Math.max(0, Math.min(1, Number(t) || 0));
  return t < 0.5 ? mix(pal.slow, pal.mid, t * 2) : mix(pal.mid, pal.fast, (t - 0.5) * 2);
}
export const colorAt = (t, pal) => css(colorRGB(t, pal));
// Degradé CSS de la leyenda (lento → rápido), igual al del dibujo.
export function legendGradient(pal){
  pal = pal || palette();
  return "linear-gradient(90deg, " + css(pal.slow) + ", " + css(pal.mid) + ", " + css(pal.fast) + ")";
}

// ---- El recorrido listo para dibujar ----
// pieces: [[{lat, lon, t (s)}]] (core/cardiogps.js decodeTrack). → { pieces, tt (0..1 por punto),
// cd (metros acumulados por punto), total, dom ([lento, rápido] km/h), bounds } o null.
export function prepareRoute(pieces, mode){
  pieces = (pieces || []).filter(pc => pc && pc.length >= 2);
  if (!pieces.length) return null;
  if (trackPoints(pieces) > MAX_DRAW){
    const b = boundsOf(pieces), span = Math.max((b.n - b.s) * 111195, (b.e - b.w) * 111195 * Math.cos((b.s + b.n) / 2 * Math.PI / 180));
    pieces = pieces.map(pc => simplifyLine(pc, Math.max(1, span / 1200))).filter(pc => pc.length >= 2);
    if (!pieces.length) return null;
  }
  let acc = 0;
  const cd = pieces.map(pc => pc.map((p, i) => (acc += i ? haversine(pc[i - 1], p) : 0)));
  const speeds = smoothSpeeds(pieces, mode === "bici" ? 8 : 15), dom = colorDomain(perSecond(pieces, speeds), mode);
  const tt = speeds.map(sp => sp.map(v => speedT(v, dom)));
  return { pieces, tt, cd, total: acc, dom, bounds: boundsOf(pieces) };
}
// km/h en cada punto para el color: el desplazamiento en línea recta sobre una ventana de
// ±winS segundos (así el zigzag del GPS entre puntos cercanos no suma camino ni pinta de
// «rápido» un tramo caminado) y después el promedio de esa ventana (las esquinas no lo hunden).
// Los puntos del recorrido guardado no son parejos: donde el dibujo es recto quedan pocos y
// lejos; ahí manda el intervalo mismo.
function smoothSpeeds(pieces, winS){
  const win = (pc, i) => {
    const t = pc[i].t; let a = i, b = i;
    while (a > 0 && pc[a - 1].t >= t - winS) a--;
    while (b < pc.length - 1 && pc[b + 1].t <= t + winS) b++;
    // Donde quedaron pocos puntos (rectas), la ventana se abre a los vecinos hasta cubrir winS:
    // dos puntos a 2 s con 3 m de error darían cualquier velocidad.
    while (pc[b].t - pc[a].t < winS && (a > 0 || b < pc.length - 1)){
      if (b < pc.length - 1 && (a === 0 || pc[b + 1].t - t <= t - pc[a - 1].t)) b++; else a--;
    }
    return [a, b];
  };
  return pieces.map(pc => {
    const raw = pc.map((p, i) => { const [a, b] = win(pc, i), dt = pc[b].t - pc[a].t; return dt > 0 ? haversine(pc[a], pc[b]) / dt * 3.6 : NaN; });
    for (let i = 0; i < raw.length; i++) if (!Number.isFinite(raw[i])) raw[i] = i ? raw[i - 1] : 0;
    return pc.map((p, i) => { const [a, b] = win(pc, i); let s = 0; for (let j = a; j <= b; j++) s += raw[j]; return s / (b - a + 1); });
  });
}
// Las velocidades repetidas según cuánto tiempo duró cada una (un dato por segundo), para que
// los extremos del color salgan del tiempo y no de cuántos puntos quedaron en cada parte.
function perSecond(pieces, speeds){
  const out = [];
  pieces.forEach((pc, k) => { for (let i = 1; i < pc.length; i++){ const dt = Math.min(600, Math.round(pc[i].t - pc[i - 1].t)), v = (speeds[k][i - 1] + speeds[k][i]) / 2; for (let j = 0; j < dt; j++) out.push(v); } });
  return out.length ? out : speeds.flat();
}
export function boundsOf(pieces){
  let s = 90, n = -90, w = 180, e = -180;
  for (const pc of pieces || []) for (const p of pc){ s = Math.min(s, p.lat); n = Math.max(n, p.lat); w = Math.min(w, p.lon); e = Math.max(e, p.lon); }
  return s > n ? null : { s, w, n, e };
}

// Proyección sin mapa: plano en metros alrededor del centro (sobra para una salida), entrando en
// w × h con márgenes pad {top, right, bottom, left}. Una salida chiquita (o en el lugar) no se
// agranda de más: como mínimo minM metros de lado. → (lon, lat) → [x, y] en px CSS.
export function fitProjection(bounds, w, h, pad, minM = 120){
  const b = bounds || { s: 0, n: 0, w: 0, e: 0 };
  const lat0 = (b.s + b.n) / 2, kx = 111319.49 * Math.cos(lat0 * Math.PI / 180), ky = 111319.49;
  const W = Math.max((b.e - b.w) * kx, minM), H = Math.max((b.n - b.s) * ky, minM);
  const aw = Math.max(10, w - pad.left - pad.right), ah = Math.max(10, h - pad.top - pad.bottom);
  const k = Math.min(aw / W, ah / H);
  const cx = pad.left + aw / 2, cy = pad.top + ah / 2, lon0 = (b.w + b.e) / 2;
  return (lon, lat) => [cx + (lon - lon0) * kx * k, cy - (lat - lat0) * ky * k];
}
// Proyección que sigue a la persona (mini mapa en vivo, sin mapa de fondo): centro en (lat, lon),
// spanM metros de lado del lado más corto.
export function followProjection(center, spanM, w, h){
  const kx = 111319.49 * Math.cos(center.lat * Math.PI / 180), ky = 111319.49, k = Math.min(w, h) / spanM;
  return (lon, lat) => [w / 2 + (lon - center.lon) * kx * k, h / 2 - (lat - center.lat) * ky * k];
}
// Proyecta todos los puntos: [[Float64Array x0,y0,x1,y1…]].
export function projectRoute(prep, proj){
  return prep.pieces.map(pc => {
    const a = new Float64Array(pc.length * 2);
    pc.forEach((p, i) => { const xy = proj(p.lon, p.lat); a[i * 2] = xy[0]; a[i * 2 + 1] = xy[1]; });
    return a;
  });
}
const easeInOutCubic = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
// Cuánto dura la animación: 4 s (1 km o menos), 5 s (10 km), 6 s (100 km o más).
export const animMs = m => Math.max(4000, Math.min(6000, 4000 + 1000 * Math.log10(Math.max(1, (Number(m) || 0) / 1000))));

// Punto (x, y) y color (t) a los m metros del recorrido. → { x, y, t, k (pieza) } o null.
function pointAt(prep, xy, m){
  const { cd, tt } = prep;
  for (let k = 0; k < cd.length; k++){
    const c = cd[k], last = c.length - 1;
    if (m > c[last] && k < cd.length - 1) continue;
    for (let i = 1; i <= last; i++){
      if (c[i] >= m || i === last){
        const d = c[i] - c[i - 1], f = d > 0 ? Math.max(0, Math.min(1, (m - c[i - 1]) / d)) : 1, a = xy[k];
        return { x: lerp(a[i * 2 - 2], a[i * 2], f), y: lerp(a[i * 2 - 1], a[i * 2 + 1], f), t: lerp(tt[k][i - 1], tt[k][i], f), k };
      }
    }
  }
  return null;
}

// Traza en ctx los intervalos del recorrido entre los metros from y to (recortando el primero y
// el último). kind: "line" (degradé de color por intervalo, así es continuo), "halo" (color
// sólido, ancho) o "hi" (brillo blanco fino). Los trazos son opacos: la transparencia la pone la
// capa (CSS), así no se marcan las uniones.
export function strokeRange(ctx, prep, xy, from, to, kind, pal, scale = 1){
  if (!(to > from)) return;
  const w = (kind === "halo" ? HALO_W : kind === "hi" ? HI_W : LINE_W) * scale;
  ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = w;
  if (kind === "hi") ctx.strokeStyle = "#FFFFFF";
  const { cd, tt } = prep;
  for (let k = 0; k < cd.length; k++){
    const c = cd[k], a = xy[k], n = c.length;
    if (c[n - 1] < from || c[0] > to) continue;
    // "hi": una sola línea por pieza (blanca, sin cortes).
    if (kind === "hi") ctx.beginPath();
    let open = false;
    for (let i = 1; i < n; i++){
      const d0 = c[i - 1], d1 = c[i];
      if (d1 < from || d0 > to) continue;
      const len = d1 - d0;
      const f0 = len > 0 && from > d0 ? (from - d0) / len : 0, f1 = len > 0 && to < d1 ? (to - d0) / len : 1;
      const x0 = a[i * 2 - 2], y0 = a[i * 2 - 1], x1 = a[i * 2], y1 = a[i * 2 + 1];
      const ax = lerp(x0, x1, f0), ay = lerp(y0, y1, f0), bx = lerp(x0, x1, f1), by = lerp(y0, y1, f1);
      if (kind === "hi"){ if (!open){ ctx.moveTo(ax, ay); open = true; } ctx.lineTo(bx, by); continue; }
      const c0 = colorRGB(tt[k][i - 1], pal), c1 = colorRGB(tt[k][i], pal);
      if (kind === "halo") ctx.strokeStyle = css(mix(c0, c1, 0.5));
      else if (Math.abs(x1 - x0) + Math.abs(y1 - y0) > 0.5){
        const g = ctx.createLinearGradient(x0, y0, x1, y1);
        g.addColorStop(0, css(c0)); g.addColorStop(1, css(c1));
        ctx.strokeStyle = g;
      } else ctx.strokeStyle = css(c0);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    }
    if (kind === "hi" && open) ctx.stroke();
  }
}

// Marcas de inicio (anillo frío con centro blanco) y fin (punto intenso, endScale 0..1,2), la
// estela y la cabeza (punto blanco con aura del color del momento) hasta m metros.
export function drawMarks(ctx, prep, xy, m, o){
  const pal = o.pal, s = o.scale || 1;
  const first = { x: xy[0][0], y: xy[0][1] };
  const lk = xy.length - 1, la = xy[lk], last = { x: la[la.length - 2], y: la[la.length - 1] };
  // Estela: una sola línea blanca que se enciende hacia la cabeza.
  if (o.head && m > 0 && m < prep.total){
    const from = Math.max(0, m - prep.total * TAIL), p0 = pointAt(prep, xy, from), p1 = pointAt(prep, xy, m);
    if (p0 && p1 && (Math.abs(p1.x - p0.x) + Math.abs(p1.y - p0.y)) > 1){
      ctx.save();
      const g = ctx.createLinearGradient(p0.x, p0.y, p1.x, p1.y);
      g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(1, "rgba(255,255,255,.85)");
      ctx.strokeStyle = g; ctx.lineWidth = 3.2 * s; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath();
      const steps = 24;
      for (let j = 0; j <= steps; j++){ const q = pointAt(prep, xy, from + (m - from) * j / steps); if (q) j ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }
      ctx.stroke(); ctx.restore();
    }
  }
  // Inicio.
  ctx.save();
  ctx.beginPath(); ctx.arc(first.x, first.y, 6.5 * s, 0, Math.PI * 2);
  ctx.fillStyle = "#FFFFFF"; ctx.fill();
  ctx.lineWidth = 3 * s; ctx.strokeStyle = css(pal.slow); ctx.stroke();
  ctx.restore();
  // Fin.
  if (o.endScale > 0){
    const r = 6.5 * s * o.endScale, c = pal.fast;
    ctx.save();
    if (pal.glow){ ctx.beginPath(); ctx.arc(last.x, last.y, r * 2.2, 0, Math.PI * 2); ctx.fillStyle = cssA(c, 0.22); ctx.fill(); }
    ctx.beginPath(); ctx.arc(last.x, last.y, r, 0, Math.PI * 2);
    ctx.fillStyle = css(c); ctx.fill();
    ctx.lineWidth = 2 * s; ctx.strokeStyle = "#FFFFFF"; ctx.stroke();
    ctx.restore();
  }
  // Cabeza (en vivo, headAtEnd: dónde está ahora la persona).
  if ((o.head && m > 0 && m < prep.total) || o.headAtEnd){
    const p = pointAt(prep, xy, o.headAtEnd ? prep.total : m); if (!p) return;
    const c = colorRGB(p.t, pal);
    ctx.save();
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 16 * s);
    g.addColorStop(0, cssA(pal.glow ? c : [255, 255, 255], pal.glow ? 0.75 : 0.35)); g.addColorStop(1, cssA(pal.glow ? c : [255, 255, 255], 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, 16 * s, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(p.x, p.y, 5.5 * s, 0, Math.PI * 2); ctx.fillStyle = "#FFFFFF"; ctx.fill();
    ctx.restore();
  }
}

// Todo junto en un solo contexto (la imagen para compartir): halo desenfocado, línea, brillo y
// marcas. scale: grosor (1 = el de la pantalla).
export function drawRouteFlat(ctx, prep, xy, o){
  const pal = o.pal, s = o.scale || 1, W = ctx.canvas.width, H = ctx.canvas.height;
  if (pal.glow){
    const off = document.createElement("canvas"); off.width = W; off.height = H;
    const oc = off.getContext("2d");
    strokeRange(oc, prep, xy, 0, prep.total, "halo", pal, s);
    ctx.save(); ctx.globalAlpha = 0.5;
    if ("filter" in ctx) ctx.filter = "blur(" + Math.round(9 * s) + "px)";
    ctx.drawImage(off, 0, 0); ctx.restore();
  }
  strokeRange(ctx, prep, xy, 0, prep.total, "line", pal, s);
  const off2 = document.createElement("canvas"); off2.width = W; off2.height = H;
  strokeRange(off2.getContext("2d"), prep, xy, 0, prep.total, "hi", pal, s);
  ctx.save(); ctx.globalAlpha = 0.35; ctx.drawImage(off2, 0, 0); ctx.restore();
  drawMarks(ctx, prep, xy, prep.total, { pal, scale: s, head: false, endScale: o.ends === false ? 0 : 1 });
}

// ---- Capas en pantalla (una por canvas) ----
// host: el elemento donde van los canvas (posición relativa). Animación: animate(); dibujo
// completo: drawAll(m). Proyección nueva (mapa movido, tamaño nuevo): setProjection(proj).
export class RouteLayers {
  constructor(host, opts){
    this.host = host; this.pal = palette(); this.prep = null; this.xy = null; this.drawn = 0; this.m = 0;
    this.endScale = 0; this.raf = 0; this.w = 0; this.h = 0;
    this.dpr = Math.min(window.devicePixelRatio || 1, document.documentElement.classList.contains("android-app") ? 1 : 2);
    const mk = cls => { const c = document.createElement("canvas"); c.className = "rv-cv " + cls; c.setAttribute("aria-hidden", "true"); host.appendChild(c); return c; };
    this.cv = { halo: this.pal.glow ? mk("rv-halo") : null, line: mk("rv-line"), hi: mk("rv-hi"), head: mk("rv-head") };
    this.ctx = {};
    for (const k in this.cv) if (this.cv[k]) this.ctx[k] = this.cv[k].getContext("2d");
    this.opts = opts || {};
  }
  resize(w, h){
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    if (w === this.w && h === this.h) return false;
    this.w = w; this.h = h;
    for (const k in this.cv){ const c = this.cv[k]; if (!c) continue; c.width = Math.round(w * this.dpr); c.height = Math.round(h * this.dpr); c.style.width = w + "px"; c.style.height = h + "px"; }
    return true;
  }
  setRoute(prep){ this.prep = prep; this.xy = null; this.drawn = 0; }
  setProjection(proj){ if (this.prep) this.xy = projectRoute(this.prep, proj); }
  clear(){
    for (const k in this.ctx){ const c = this.ctx[k]; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, c.canvas.width, c.canvas.height); c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); }
    this.drawn = 0;
  }
  // Suma a las capas lo que va de lo ya dibujado hasta m (solo lo nuevo).
  advance(m){
    if (!this.prep || !this.xy) return;
    if (m < this.drawn) { this.clear(); }
    const from = this.drawn;
    if (this.ctx.halo) strokeRange(this.ctx.halo, this.prep, this.xy, from, m, "halo", this.pal);
    strokeRange(this.ctx.line, this.prep, this.xy, from, m, "line", this.pal);
    strokeRange(this.ctx.hi, this.prep, this.xy, from, m, "hi", this.pal);
    this.drawn = m; this.m = m;
  }
  marks(head){
    const c = this.ctx.head; if (!c || !this.prep || !this.xy) return;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, c.canvas.width, c.canvas.height); c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    drawMarks(c, this.prep, this.xy, this.m, { pal: this.pal, head: !!head && !this.live, headAtEnd: !!this.live, endScale: this.live ? 0 : this.endScale });
  }
  // Todo hasta m metros (sin animar). Sin m: el recorrido completo con el final.
  drawAll(m){
    if (!this.prep || !this.xy) return;
    const full = m == null || m >= this.prep.total;
    this.clear(); this.advance(full ? this.prep.total : m);
    if (full && !this.raf) this.endScale = 1;
    this.marks(!full);
  }
  cancel(){ if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; }
  // Anima de 0 al total. onFrame(m, fracción) en cada cuadro; → Promise que se cumple al terminar
  // (o al cancelar: false). Si la app se va a segundo plano, se corta y queda dibujado entero.
  animate(onFrame){
    this.cancel();
    const prep = this.prep;
    if (!prep || !this.xy) return Promise.resolve(false);
    const dur = animMs(prep.total), END_MS = 360;
    this.clear(); this.endScale = 0; this.m = 0;
    return new Promise(done => {
      let t0 = null;
      this._finish = ok => { this.cancel(); this._finish = null; done(ok); };
      const frame = now => {
        this.raf = 0;
        if (appAway()){ this.endScale = 1; this.drawAll(); if (onFrame) onFrame(prep.total, 1); if (this._finish) this._finish(true); return; }
        if (t0 == null) t0 = now;
        const e = now - t0, f = Math.min(1, e / dur), m = prep.total * easeInOutCubic(f);
        this.advance(m);
        if (f >= 1){
          // El punto del final aparece: 0 → 1,2 → 1 en 360 ms.
          const g = Math.min(1, (e - dur) / END_MS);
          this.endScale = g < 0.6 ? (g / 0.6) * 1.2 : 1.2 - 0.2 * ((g - 0.6) / 0.4);
          this.marks(false);
          if (onFrame) onFrame(prep.total, 1);
          if (g >= 1){ this.endScale = 1; this.marks(false); if (this._finish) this._finish(true); return; }
        } else {
          this.marks(true);
          if (onFrame) onFrame(m, f);
        }
        this.raf = requestAnimationFrame(frame);
      };
      this.raf = requestAnimationFrame(frame);
    });
  }
  stop(){ if (this._finish){ const f = this._finish; this.endScale = 1; this.drawAll(); f(false); } }
  destroy(){ this.stop(); this.cancel(); for (const k in this.cv) if (this.cv[k]) this.cv[k].remove(); this.ctx = {}; }
}
// Con la app en segundo plano, ninguna animación sigue: la que estaba se termina en el acto (al
// volver queda el dibujo completo).
const live = new Set();
export function trackLayers(l){ live.add(l); return l; }
export function untrackLayers(l){ live.delete(l); }
onAwayChange(away => { if (away) live.forEach(l => { if (l.raf) l.stop(); }); });
