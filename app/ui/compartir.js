// Compartir una salida de Cardio: una imagen vertical de 1080 × 1920 (la medida de las
// historias) con el recorrido sobre el mapa oscuro, la distancia grande y los números, armada en
// un canvas. Siempre oscura (es una foto), con la gama del tema elegido (grises con el neón
// apagado). Sin dirección de la web ni precios.
//
// Privacidad: por defecto la imagen NO muestra dónde empezás ni dónde terminás (se le sacan los
// primeros y los últimos 200 m al recorrido, solo en la imagen). Se puede cambiar en la hoja.
//
// Se comparte en dos toques: «Compartir» abre la hoja y arma la imagen (puede tardar unos
// segundos con el mapa); el segundo toque la manda, porque el navegador solo deja compartir
// justo después de un toque. Orden: app nativa con los plugins Share y Filesystem (la imagen se
// escribe en la caché del celular y se comparte el archivo) → Web Share con archivos (Chrome de
// Android, Safari de iPhone) → «Guardar imagen» (descarga) → mantener apretada la vista previa.
import { CLASSES, breakdownText, decodeTrack, fmtClock, fmtKm, fmtKmh, fmtPace, modeLabel, paceOf, trimTrack } from '../core/cardiogps.js';
import { drawRouteFlat, fitProjection, palette, prepareRoute, projectRoute } from './ruta.js';
import { mapPhoto } from './mapa.js';

export const W = 1080, H = 1920;
const PANEL = { x: 48, y: 210, w: 984, h: 1060, r: 48 };
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const TITLE = "Mi salida en GIZE";

function dateText(rec){
  const p = String(rec.date || "").split("-");
  return p.length === 3 ? parseInt(p[2], 10) + " " + MONTHS[parseInt(p[1], 10) - 1] + " " + p[0] : "";
}
const rgb = c => "rgb(" + c.map(Math.round).join(",") + ")";
const rgba = (c, a) => "rgba(" + c.map(Math.round).join(",") + "," + a + ")";
function rrect(ctx, x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function loadImg(src){
  return new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
}
// Fondo sin mapa: degradé oscuro y una grilla de puntos suave.
export function drawPlainBg(ctx, x, y, w, h){
  const g = ctx.createRadialGradient(x + w / 2, y + h * 0.35, 0, x + w / 2, y + h * 0.35, Math.max(w, h) * 0.75);
  g.addColorStop(0, "#0B0D14"); g.addColorStop(1, "#000000");
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "rgba(255,255,255,.06)";
  const step = 26;
  for (let yy = y + step / 2; yy < y + h; yy += step) for (let xx = x + step / 2; xx < x + w; xx += step){ ctx.beginPath(); ctx.arc(xx, yy, 1.6, 0, Math.PI * 2); ctx.fill(); }
}

// La imagen (PNG 1080 × 1920). rec: la salida (resumen). track: texto del recorrido (o null).
// hideEnds: sin los primeros y últimos 200 m. → Promise<Blob>
export async function storyImage(rec, track, { hideEnds = true } = {}){
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d"), pal = palette();
  try { await Promise.all(["700 64px Outfit", "600 32px Outfit", "500 32px Outfit"].map(f => document.fonts.load(f))); } catch (e) {}
  const F = (w, px) => w + " " + px + "px Outfit, system-ui, sans-serif";

  // Fondo negro con un brillo de la gama arriba.
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
  let g = ctx.createRadialGradient(W / 2, -120, 0, W / 2, -120, 1150);
  g.addColorStop(0, rgba(pal.glow ? pal.mid : [255, 255, 255], pal.glow ? 0.42 : 0.12)); g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  g = ctx.createRadialGradient(W, H, 0, W, H, 900);
  g.addColorStop(0, rgba(pal.glow ? pal.fast : [255, 255, 255], pal.glow ? 0.16 : 0.05)); g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  // Arriba: GIZE y «A pie · 2 oct 2026».
  const logo = await loadImg(new URL("brand/logo/gize-logotipo.svg", document.baseURI).href);
  if (logo) ctx.drawImage(logo, 72, 82, 100, 60);
  else { ctx.fillStyle = "#fff"; ctx.font = F(800, 60); ctx.textBaseline = "alphabetic"; ctx.fillText("GIZE", 72, 140); }
  const chip = modeLabel(rec.mode) + "  ·  " + dateText(rec);
  ctx.font = F(600, 34);
  const cw = ctx.measureText(chip).width + 56, cx = W - 72 - cw;
  rrect(ctx, cx, 84, cw, 58, 29);
  ctx.fillStyle = "rgba(255,255,255,.08)"; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = pal.glow ? rgba(pal.slow, 0.9) : "rgba(255,255,255,.45)"; ctx.stroke();
  ctx.fillStyle = "#fff"; ctx.textBaseline = "middle"; ctx.fillText(chip, cx + 28, 114);

  // El mapa con el recorrido.
  const P = PANEL;
  let pieces = decodeTrack(track || "");
  if (hideEnds && pieces.length) pieces = trimTrack(pieces, 200);
  const prep = prepareRoute(pieces, rec.mode);
  ctx.save(); rrect(ctx, P.x, P.y, P.w, P.h, P.r); ctx.clip();
  let photo = null;
  if (prep) photo = await mapPhoto(prep.bounds, P.w / 2, P.h / 2, 46, prep.pieces);
  if (photo) ctx.drawImage(photo.canvas, P.x, P.y, P.w, P.h);
  else drawPlainBg(ctx, P.x, P.y, P.w, P.h);
  // Viñeta suave arriba y abajo.
  g = ctx.createLinearGradient(0, P.y, 0, P.y + P.h);
  g.addColorStop(0, "rgba(0,0,0,.35)"); g.addColorStop(0.18, "rgba(0,0,0,0)"); g.addColorStop(0.8, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,.55)");
  ctx.fillStyle = g; ctx.fillRect(P.x, P.y, P.w, P.h);
  if (prep){
    const xy = photo ? photo.xy.map(pc => Float64Array.from(pc.flat())).map((a, k) => offset(a, P.x, P.y))
      : projectRoute(prep, fitProjection(prep.bounds, P.w, P.h, { top: 110, right: 90, bottom: 110, left: 90 }, 150)).map(a => offset(a, P.x, P.y));
    drawRouteFlat(ctx, prep, xy, { pal, scale: 2.3 });
  } else {
    ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.font = F(500, 34); ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("Sin recorrido", P.x + P.w / 2, P.y + P.h / 2); ctx.textAlign = "left";
  }
  if (photo){
    ctx.font = F(500, 22); ctx.fillStyle = "rgba(255,255,255,.62)"; ctx.textAlign = "right"; ctx.textBaseline = "alphabetic";
    ctx.fillText("© OpenStreetMap · OpenFreeMap", P.x + P.w - 30, P.y + P.h - 26); ctx.textAlign = "left";
  }
  ctx.restore();
  rrect(ctx, P.x + 1, P.y + 1, P.w - 2, P.h - 2, P.r); ctx.lineWidth = 2; ctx.strokeStyle = "rgba(255,255,255,.10)"; ctx.stroke();

  // La distancia, enorme.
  const km = fmtKm(rec.dist);
  ctx.textBaseline = "alphabetic"; ctx.fillStyle = "#fff"; ctx.font = F(700, 230);
  ctx.fillText(km, 62, 1500);
  const kmW = ctx.measureText(km).width;
  ctx.font = F(600, 76); ctx.fillStyle = "rgba(255,255,255,.62)"; ctx.fillText("km", 62 + kmW + 22, 1500);

  // Tiempo · Ritmo (o velocidad) · Calorías.
  const pie = rec.mode !== "bici";
  const cols = [["Tiempo", fmtClock((rec.dur || 0) * 1000)], [pie ? "Ritmo" : "Velocidad", pie ? fmtPace(paceOf(rec)) + " /km" : fmtKmh(rec.avg) + " km/h"], ["Calorías", rec.kcal == null ? "–" : String(Math.round(rec.kcal))]];
  cols.forEach(([k, v], i) => {
    const x = 72 + i * 316;
    ctx.font = F(600, 30); ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.fillText(k.toUpperCase(), x, 1580);
    ctx.font = F(700, 60); ctx.fillStyle = "#fff"; ctx.fillText(v, x, 1650);
  });

  // Caminando · trotando · corriendo (o en bici).
  const b = rec.breakdown || {}, keys = Object.keys(CLASSES).filter(k => Number(b[k]) > 0);
  const tot = keys.reduce((a, k) => a + Number(b[k]), 0);
  const BX = 72, BY = 1700, BW = W - 144, BH = 16;
  ctx.save(); rrect(ctx, BX, BY, BW, BH, BH / 2); ctx.clip();
  ctx.fillStyle = "rgba(255,255,255,.12)"; ctx.fillRect(BX, BY, BW, BH);
  let x0 = BX;
  const colOf = k => k === "caminar" ? pal.slow : k === "correr" ? pal.fast : pal.mid;
  keys.forEach(k => { const w = BW * Number(b[k]) / tot; ctx.fillStyle = rgb(colOf(k)); ctx.fillRect(x0, BY, w + 0.5, BH); x0 += w; });
  ctx.restore();
  ctx.font = F(500, 34); ctx.fillStyle = "rgba(255,255,255,.86)"; ctx.fillText(breakdownText(b), 72, 1770);

  // Pie: la gama y «Entrenado con GIZE».
  g = ctx.createLinearGradient(W / 2 - 110, 0, W / 2 + 110, 0);
  g.addColorStop(0, rgb(pal.slow)); g.addColorStop(0.5, rgb(pal.mid)); g.addColorStop(1, rgb(pal.fast));
  ctx.fillStyle = g; rrect(ctx, W / 2 - 110, 1834, 220, 4, 2); ctx.fill();
  ctx.font = F(600, 30); ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.textAlign = "center"; ctx.fillText("Entrenado con GIZE", W / 2, 1886); ctx.textAlign = "left";

  return await new Promise((ok, bad) => c.toBlob(bl => bl ? ok(bl) : bad(new Error("sin imagen")), "image/png"));
}
function offset(a, dx, dy){ const o = new Float64Array(a.length); for (let i = 0; i < a.length; i += 2){ o[i] = a[i] + dx; o[i + 1] = a[i + 1] + dy; } return o; }

// ---- Mandar la imagen ----
function nativePlugin(name){
  try {
    const C = window.Capacitor;
    if (!C || !C.isNativePlatform || !C.isNativePlatform()) return null;
    if (typeof C.isPluginAvailable === "function" && !C.isPluginAvailable(name)) return null;
    return (C.Plugins && C.Plugins[name]) || (C.registerPlugin ? C.registerPlugin(name) : null);
  } catch (e) { return null; }
}
const isNativeApp = () => { try { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); } catch (e) { return false; } };
export const fileName = rec => "gize-salida-" + String((rec && rec.id) || "").replace(/[^a-z0-9]/gi, "").slice(0, 8) + ".png";
const toBase64 = blob => new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1] || ""); r.onerror = () => bad(r.error); r.readAsDataURL(blob); });
const canceled = e => /cancel|abort/i.test(String((e && (e.name + " " + e.message)) || e));

// ¿Hay cómo compartir el archivo (no solo descargarlo)?
export function canShareFile(blob, rec){
  if (nativePlugin("Share") && nativePlugin("Filesystem")) return true;
  try { const f = new File([blob], fileName(rec), { type: "image/png" }); return !!(navigator.canShare && navigator.canShare({ files: [f] })); } catch (e) { return false; }
}
// Comparte la imagen. → "shared" | "saved" | "cancel" | "fail".
export async function shareImage(blob, rec, { download = false } = {}){
  const name = fileName(rec);
  if (!download){
    const Sh = nativePlugin("Share"), Fs = nativePlugin("Filesystem");
    if (Sh && Fs){
      try {
        const data = await toBase64(blob);
        const { uri } = await Fs.writeFile({ path: name, data, directory: "CACHE" });
        await Sh.share({ title: TITLE, files: [uri], dialogTitle: "Compartir tu salida" });
        return "shared";
      } catch (e) { if (canceled(e)) return "cancel"; console.warn("compartir", e); }
    }
    try {
      const f = new File([blob], name, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [f] }) && navigator.share){
        await navigator.share({ files: [f], title: TITLE });
        return "shared";
      }
    } catch (e) { if (canceled(e)) return "cancel"; console.warn("compartir", e); }
  }
  if (isNativeApp()) return "fail";
  try {
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = "gize-salida.png"; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return "saved";
  } catch (e) { return "fail"; }
}

// ---- La hoja «Compartir tu salida» ----
let sheet = null;
export function closeShareSheet(){
  if (!sheet) return;
  const s = sheet; sheet = null;
  if (s.url) URL.revokeObjectURL(s.url);
  s.el.remove();
}
export function openShareSheet(rec, track){
  closeShareSheet();
  const el = document.createElement("div");
  el.id = "salShare"; el.className = "ssh";
  el.innerHTML = '<div class="ssh-bg" data-sh="close"></div>' +
    '<div class="ssh-card" role="dialog" aria-modal="true" aria-label="Compartir tu salida">' +
      '<div class="ssh-title">Compartir tu salida</div>' +
      '<div class="ssh-prev"><div class="ssh-wait">Preparando la imagen…</div></div>' +
      '<label class="ssh-tog"><input type="checkbox" data-sh="ends" checked><span>Ocultar dónde empezás y terminás</span></label>' +
      '<div class="ssh-msg" aria-live="polite"></div>' +
      '<div class="ssh-btns">' +
        '<button type="button" class="ctrl primary" data-sh="share" disabled>Compartir</button>' +
        (isNativeApp() ? '' : '<button type="button" class="ctrl ghost" data-sh="save" disabled>Guardar imagen</button>') +
      '</div>' +
      '<button type="button" class="ssh-close" data-sh="close">Cerrar</button>' +
    '</div>';
  document.body.appendChild(el);
  const s = sheet = { el, rec, track, blob: null, url: null, gen: 0, hide: true };
  el.addEventListener("click", async e => {
    const b = e.target.closest("[data-sh]"); if (!b || sheet !== s) return;
    const k = b.dataset.sh;
    if (k === "close"){ closeShareSheet(); return; }
    if (k === "ends"){ s.hide = b.checked; build(s); return; }
    if ((k === "share" || k === "save") && s.blob){
      const res = await shareImage(s.blob, rec, { download: k === "save" });
      if (sheet !== s) return;
      msg(s, res === "saved" ? "Listo: la imagen quedó en tus descargas." : res === "fail" ? "No se pudo compartir la imagen." + (isNativeApp() ? "" : " Probá con «Guardar imagen».") : "");
    }
  });
  requestAnimationFrame(() => el.classList.add("open"));
  build(s);
  return el;
}
function msg(s, t){ const m = s.el.querySelector(".ssh-msg"); if (m) m.textContent = t || ""; }
async function build(s){
  const gen = ++s.gen, prev = s.el.querySelector(".ssh-prev");
  s.el.querySelectorAll("[data-sh=share],[data-sh=save]").forEach(b => { b.disabled = true; });
  prev.innerHTML = '<div class="ssh-wait">Preparando la imagen…</div>';
  msg(s, "");
  let blob = null;
  try { blob = await storyImage(s.rec, s.track, { hideEnds: s.hide }); } catch (e) { console.warn("compartir", e); }
  if (sheet !== s || gen !== s.gen) return;
  if (!blob){ prev.innerHTML = '<div class="ssh-wait">No se pudo armar la imagen.</div>'; return; }
  if (s.url) URL.revokeObjectURL(s.url);
  s.blob = blob; s.url = URL.createObjectURL(blob);
  prev.innerHTML = '<img class="ssh-img" alt="Imagen de tu salida para compartir" src="' + s.url + '">' + (isNativeApp() ? '' : '<div class="ssh-hint">También podés mantener apretada la imagen para guardarla.</div>');
  const share = s.el.querySelector("[data-sh=share]"), save = s.el.querySelector("[data-sh=save]");
  const can = canShareFile(blob, s.rec);
  if (share){ share.disabled = false; share.hidden = !can && !isNativeApp(); }
  if (save){ save.disabled = false; save.classList.toggle("primary", !can); save.classList.toggle("ghost", can); }
  s.el.dataset.listo = "1";
}
