// Cartel de "hay una versión nueva" en las apps de las tiendas. La web se actualiza sola
// (service worker); la app de Android/iPhone no: los archivos viajan dentro de la app y
// quien no actualiza desde la tienda se queda con la versión vieja.
// La app lee la configuración «version» de la base (tabla app_config, la cambia un admin desde
// gize.ar/admin → Avisos); si no responde, https://gize.ar/app/version.json. Compara con su
// número de compilación (versionCode en Android):
//   · menor que "ultima"  → cartel abajo con "Actualizar" y la cruz (vuelve a los 3 días).
//   · menor que "minima"  → pantalla que no se puede cerrar (para un arreglo obligatorio).
// "ultima" se sube a mano recién cuando la versión ya está publicada en la tienda: si no,
// el cartel mandaría a actualizar a algo que todavía no está.
import { esc } from '../core/utils.js';
import { SB_KEY, SB_URL } from '../core/supabase.js';

const URL_VERSION = "https://gize.ar/app/version.json";
const SKIP_KEY = "gize_upd_skip";
const VOLVER_MS = 3 * 24 * 3600 * 1000;
const CADA_MS = 6 * 3600 * 1000;
let ultimaVez = 0;

function nativo(){
  try { return window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() ? window.Capacitor : null; } catch (e) { return null; }
}

async function readConfig(){
  try {
    const r = await fetch(SB_URL + "/rest/v1/app_config?key=eq.version&select=value", { cache: "no-store", headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY } });
    if (r.ok){ const rows = await r.json(); if (rows && rows[0] && rows[0].value) return rows[0].value; }
  } catch (e) {}
  try { const r = await fetch(URL_VERSION + "?t=" + Date.now(), { cache: "no-store" }); if (r.ok) return await r.json(); } catch (e) {}
  return null;
}

export async function checkUpdate(force){
  const cap = nativo();
  if (!cap || !cap.Plugins || !cap.Plugins.App) return;
  if (!force && Date.now() - ultimaVez < CADA_MS) return;
  ultimaVez = Date.now();
  try {
    const info = await cap.Plugins.App.getInfo();
    const build = parseInt(info && info.build, 10);
    if (!build) return;
    const all = await readConfig();
    if (!all) return;
    const cfg = all[cap.getPlatform()];
    if (!cfg || !cfg.tienda || !/^https:\/\//i.test(cfg.tienda)) return;
    const ultima = +cfg.ultima || 0, minima = +cfg.minima || 0;
    if (build < minima) return show(cfg.tienda, true, ultima, cfg.version);
    if (build >= ultima) return hide();
    let skip = null; try { skip = JSON.parse(localStorage.getItem(SKIP_KEY) || "null"); } catch (e) {}
    if (skip && skip.v === ultima && Date.now() - skip.t < VOLVER_MS) return;
    show(cfg.tienda, false, ultima, cfg.version);
  } catch (e) { /* sin señal o sin tienda: no se muestra nada */ }
}

function hide(){ const el = document.getElementById("updBox"); if (el) el.remove(); }

// La marca (G + orbe) de brand/logo/; cada apariencia la cambia por la suya (css/ui/tema-*.css).
const G = '<img class="upd-marca" src="brand/logo/gize-marca-blanca.svg" alt="">';
const X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const FLECHA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v12m0 0l-5-5m5 5l5-5M5 20h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function show(tienda, obligatoria, ultima, version){
  hide();
  const el = document.createElement("div");
  el.id = "updBox";
  el.className = obligatoria ? "upd upd-forzada" : "upd";
  el.setAttribute("role", obligatoria ? "alertdialog" : "dialog");
  el.setAttribute("aria-labelledby", "updTitle");
  const chip = version ? `<span class="upd-ver">v${esc(version)}</span>` : "";
  el.innerHTML = obligatoria
    ? `<div class="upd-card">
        <div class="upd-logo">${G}</div>
        <b id="updTitle" class="upd-title">Actualizá GIZE para seguir</b>${chip}
        <p class="upd-sub">Esta versión quedó vieja y puede perder lo que cargues. La nueva tarda un minuto.</p>
        <a class="upd-go gize-btn" href="${esc(tienda)}" target="_blank" rel="noopener">${FLECHA}Actualizar ahora</a>
      </div>`
    : `<div class="upd-card upd-row">
        <div class="upd-logo">${G}</div>
        <div class="upd-txt">
          <b id="updTitle" class="upd-title">Nueva versión de GIZE</b>
          <span class="upd-sub">${chip}Arreglos y mejoras</span>
        </div>
        <button type="button" class="upd-later" aria-label="Después">${X}</button>
        <a class="upd-go" href="${esc(tienda)}" target="_blank" rel="noopener">${FLECHA}Actualizar</a>
      </div>`;
  // Abre la tienda (Play Store / App Store) navegando a la página de la app: Capacitor la
  // manda afuera, a la app de la tienda. Un link con target=_blank depende de cada WebView.
  const go = el.querySelector(".upd-go");
  if (go) go.addEventListener("click", e => { e.preventDefault(); window.location.href = tienda; });
  const later = el.querySelector(".upd-later");
  if (later) later.addEventListener("click", () => {
    try { localStorage.setItem(SKIP_KEY, JSON.stringify({ v: ultima, t: Date.now() })); } catch (e) {}
    el.classList.add("upd-out");
    setTimeout(hide, 200);
  });
  document.body.appendChild(el);
}

// Al abrir la app y cada vez que vuelve a primer plano (como mucho cada 6 horas).
export function initUpdateCheck(){
  const cap = nativo();
  if (!cap) return;
  setTimeout(() => checkUpdate(true), 3000);
  try { cap.Plugins.App.addListener("appStateChange", s => { if (s && s.isActive) checkUpdate(false); }); } catch (e) {}
}
