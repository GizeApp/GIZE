// Recorrido de una salida de Cardio dibujado quieto, en SVG y sin mapa de fondo (lo usa la ficha
// del coach). Coloreado por velocidad con la gama de GIZE: lento = var(--gize-r1) (frío), rápido =
// var(--gize-r3) (intenso), en 5 escalones (los del medio, mezclados: ver .rt-l1 / .rt-l3 en
// css/screens/coach/seguimiento.css). Con el neón apagado los tokens ya son grises.
// Solo números y texto: sin red, sin canvas, sin animaciones.
import { colorDomain, decodeTrack, simplifyLine, speedT, trackPoints, trackSpeeds } from '../core/cardiogps.js';

const LEVELS = 5;          // escalones de color
const MAX_DRAW = 1500;     // con más puntos se simplifica para dibujar (no cambia la forma a esta escala)

// track: texto guardado (encodeTrack). mode: "pie" | "bici". → { svg, dom: [lento, rápido] km/h }
// o null si no hay nada que dibujar.
export function routeView(track, mode){
  let pieces = decodeTrack(track);
  if (!pieces.length) return null;
  let s = 90, n = -90, w = 180, e = -180;
  for (const pc of pieces) for (const p of pc){ s = Math.min(s, p.lat); n = Math.max(n, p.lat); w = Math.min(w, p.lon); e = Math.max(e, p.lon); }
  // Plano en metros alrededor del centro (sobra para una salida). La y va para abajo.
  const kx = 111319.49 * Math.cos((s + n) / 2 * Math.PI / 180), ky = 111319.49;
  const X = lon => (lon - w) * kx, Y = lat => (n - lat) * ky;
  let W = X(e), H = Y(s);
  if (trackPoints(pieces) > MAX_DRAW){
    const tol = Math.max(W, H) / 1200;
    pieces = pieces.map(pc => simplifyLine(pc, tol)).filter(pc => pc.length >= 2);
    if (!pieces.length) return null;
  }
  const speeds = trackSpeeds(pieces), dom = colorDomain(speeds, mode);
  // Una salida chiquita (o en el lugar) no se agranda de más: como mínimo 80 m de lado.
  const min = 80, ox = Math.max(0, (min - W) / 2), oy = Math.max(0, (min - H) / 2);
  W = Math.max(W, min); H = Math.max(H, min);
  const pad = Math.max(W, H) * 0.08, r = Math.max(W, H) * 0.02;
  const q = v => Math.round(v * 10) / 10;
  const P = p => q(X(p.lon) + ox) + "," + q(Y(p.lat) + oy);
  const halo = pieces.map(pc => "M" + pc.map(P).join("L")).join("");
  // Tramos seguidos del mismo escalón de velocidad, en una sola línea cada uno (comparten el
  // punto donde cambia, así no quedan huecos).
  let lines = "";
  const line = (pts, lv) => { lines += '<polyline class="rt-l' + lv + '" points="' + pts.map(P).join(" ") + '"/>'; };
  pieces.forEach((pc, k) => {
    let cur = -1, run = [];
    for (let i = 1; i < pc.length; i++){
      const v = (speeds[k][i - 1] + speeds[k][i]) / 2;
      const lv = Math.min(LEVELS - 1, Math.floor(speedT(v, dom) * LEVELS));
      if (lv !== cur){ if (run.length >= 2) line(run, cur); run = [pc[i - 1]]; cur = lv; }
      run.push(pc[i]);
    }
    if (run.length >= 2) line(run, cur);
  });
  const a = pieces[0][0], last = pieces[pieces.length - 1], b = last[last.length - 1];
  const dot = (p, cls) => { const xy = P(p).split(","); return '<circle class="' + cls + '" cx="' + xy[0] + '" cy="' + xy[1] + '" r="' + q(r) + '"/>'; };
  const svg = '<svg class="rt-svg" viewBox="' + q(-pad) + ' ' + q(-pad) + ' ' + q(W + 2 * pad) + ' ' + q(H + 2 * pad) + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Recorrido de la salida">'
    + '<path class="rt-halo" d="' + halo + '"/>' + lines + dot(a, "rt-ini") + dot(b, "rt-fin") + '</svg>';
  return { svg, dom };
}
