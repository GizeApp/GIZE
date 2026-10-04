// Apariencia de la app, cuatro opciones (en este orden en el selector):
//   «Oscuro» — la de siempre, por defecto (negro). Sin clase ni nada guardado.
//   «Claro»  — la clara de verdad: blanco y casi blanco con texto oscuro (css/ui/tema-luz.css).
//              Clase html.tema-luz, "gize_tema" = "luz".
//   «Azul»   — vidrio esmerilado sobre círculos azules y violetas en marino (css/ui/tema-claro.css).
//              Es la que antes se llamaba «Claro»: por eso su clase sigue siendo html.tema-claro.
//              "gize_tema" = "azul"; el valor viejo "claro" se sigue aceptando como «Azul» (y
//              app/lite.js lo pasa a "azul" al arrancar), así nadie ve cambiar su app.
//   «Rosa»   — el vidrio de «Azul» con la paleta rosa: html.tema-claro + html.tema-rosa
//              (css/ui/tema-rosa.css solo cambia los colores). "gize_tema" = "rosa".
// Las clases las pone app/lite.js antes de la primera pintada. El selector está en Ajustes del
// cliente (screens/config.js) y en Configuración del coach (screens/coach/settings.js): cuatro
// botones con data-tema="oscuro" / "luz" / "azul" / "rosa". El cambio se aplica al toque, sin
// recargar ni volver a dibujar la pantalla.
import { refreshGamut } from './background.js';

const KEY = "gize_tema";
// Color de la barra del sistema (Android) de cada apariencia: el del fondo.
const BARRA = { oscuro: "#000000", luz: "#F4F5F8", azul: "#030814", rosa: "#14060F" };
const OPCIONES = [["oscuro", "Oscuro"], ["luz", "Claro"], ["azul", "Azul"], ["rosa", "Rosa"]];

export function getTema(){
  const c = document.documentElement.classList;
  return c.contains("tema-luz") ? "luz" : c.contains("tema-rosa") ? "rosa" : c.contains("tema-claro") ? "azul" : "oscuro";
}

export function setTema(t){
  if (t === "claro") t = "azul"; // el nombre viejo de «Azul»
  if (!BARRA[t]) t = "oscuro";
  try { if (t === "oscuro") localStorage.removeItem(KEY); else localStorage.setItem(KEY, t); } catch (e) {}
  const c = document.documentElement.classList;
  c.toggle("tema-luz", t === "luz");
  c.toggle("tema-claro", t === "azul" || t === "rosa");
  c.toggle("tema-rosa", t === "rosa");
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute("content", BARRA[t]));
  refreshGamut();
  syncTemaButtons();
  // El fondo de partículas depende de la apariencia (en «Oscuro» no hay): que se acomode ya.
  try { document.dispatchEvent(new CustomEvent("gize:lite")); } catch (e) {}
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

// Los cuatro botones de un selector (role="radio" dentro de un role="radiogroup").
export function temaOptionsHtml(cls){
  const t = getTema();
  return OPCIONES.map(([v, label]) =>
    '<button type="button" class="' + cls + (t === v ? ' on' : '') + '" data-tema="' + v + '" role="radio" aria-checked="' + (t === v) + '">' + label + '</button>'
  ).join("");
}

document.addEventListener("click", function (e) {
  const b = e.target.closest && e.target.closest("[data-tema]");
  if (!b) return;
  e.preventDefault();
  if (b.getAttribute("data-tema") !== getTema()) setTema(b.getAttribute("data-tema"));
});
