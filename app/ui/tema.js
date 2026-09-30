// Apariencia de la app: «Oscuro» (la de siempre, por defecto) o «Claro» (vidrio esmerilado
// sobre círculos de color, css/ui/tema-claro.css). Se guarda en este dispositivo
// ("gize_tema") y la clase html.tema-claro la pone app/lite.js antes de la primera pintada.
// El selector está en Ajustes del cliente (screens/config.js) y en Configuración del coach
// (screens/coach/settings.js): dos botones con data-tema="oscuro" / "claro". El cambio se
// aplica al toque, sin recargar ni volver a dibujar la pantalla.
import { refreshGamut } from './background.js';

const KEY = "gize_tema";

export function getTema(){ return document.documentElement.classList.contains("tema-claro") ? "claro" : "oscuro"; }

export function setTema(t){
  const claro = t === "claro";
  try { if (claro) localStorage.setItem(KEY, "claro"); else localStorage.removeItem(KEY); } catch (e) {}
  document.documentElement.classList.toggle("tema-claro", claro);
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute("content", claro ? "#030814" : "#000000"));
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

// Los dos botones de un selector (role="radio" dentro de un role="radiogroup").
export function temaOptionsHtml(cls){
  const t = getTema();
  return [["oscuro", "Oscuro"], ["claro", "Claro"]].map(([v, label]) =>
    '<button type="button" class="' + cls + (t === v ? ' on' : '') + '" data-tema="' + v + '" role="radio" aria-checked="' + (t === v) + '">' + label + '</button>'
  ).join("");
}

document.addEventListener("click", function (e) {
  const b = e.target.closest && e.target.closest("[data-tema]");
  if (!b) return;
  e.preventDefault();
  if (b.getAttribute("data-tema") !== getTema()) setTema(b.getAttribute("data-tema"));
});
