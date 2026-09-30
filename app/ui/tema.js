// Apariencia de la app: «Oscuro» (la de siempre, por defecto), «Claro» (vidrio esmerilado
// sobre círculos de color, css/ui/tema-claro.css) o «Rosa» (el mismo vidrio de «Claro» con la
// paleta rosa, css/ui/tema-rosa.css). Se guarda en este dispositivo ("gize_tema" = "claro" o
// "rosa") y las clases las pone app/lite.js antes de la primera pintada: «Claro» es
// html.tema-claro; «Rosa» lleva html.tema-claro + html.tema-rosa (así le tocan todas las
// reglas del vidrio y tema-rosa.css solo cambia los colores).
// El selector está en Ajustes del cliente (screens/config.js) y en Configuración del coach
// (screens/coach/settings.js): tres botones con data-tema="oscuro" / "claro" / "rosa". El
// cambio se aplica al toque, sin recargar ni volver a dibujar la pantalla.
import { refreshGamut } from './background.js';

const KEY = "gize_tema";
// Color de la barra del sistema (Android) de cada apariencia: el del fondo.
const BARRA = { oscuro: "#000000", claro: "#030814", rosa: "#14060F" };

export function getTema(){
  const c = document.documentElement.classList;
  return c.contains("tema-rosa") ? "rosa" : c.contains("tema-claro") ? "claro" : "oscuro";
}

export function setTema(t){
  if (!BARRA[t]) t = "oscuro";
  try { if (t === "oscuro") localStorage.removeItem(KEY); else localStorage.setItem(KEY, t); } catch (e) {}
  const c = document.documentElement.classList;
  c.toggle("tema-claro", t !== "oscuro");
  c.toggle("tema-rosa", t === "rosa");
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute("content", BARRA[t]));
  refreshGamut();
  syncTemaButtons();
}

// Marca la opción elegida en todos los selectores que haya en pantalla.
function syncTemaButtons(){
  const t = getTema();
  document.querySelectorAll("[data-tema]").forEach(b => {
    const on = b.getAttribute("data-tema") === t;
    b.classList.toggle("on", on);
    b.setAttribute("aria-checked", String(on));
  });
}

// Los tres botones de un selector (role="radio" dentro de un role="radiogroup").
export function temaOptionsHtml(cls){
  const t = getTema();
  return [["oscuro", "Oscuro"], ["claro", "Claro"], ["rosa", "Rosa"]].map(([v, label]) =>
    '<button type="button" class="' + cls + (t === v ? ' on' : '') + '" data-tema="' + v + '" role="radio" aria-checked="' + (t === v) + '">' + label + '</button>'
  ).join("");
}

document.addEventListener("click", function (e) {
  const b = e.target.closest && e.target.closest("[data-tema]");
  if (!b) return;
  e.preventDefault();
  if (b.getAttribute("data-tema") !== getTema()) setTema(b.getAttribute("data-tema"));
});
