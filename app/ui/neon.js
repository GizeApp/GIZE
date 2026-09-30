// Neón: los bordes y brillos de colores de GIZE (la gama RGB: anillos que giran, bordes de
// las cajas, resplandores, la llama y el chat). Prendido por defecto; apagado, la app queda
// en blanco y grises, más tranquila, en las dos apariencias (css/ui/sin-neon.css). Se guarda
// en este dispositivo ("gize_neon" = "0") y la clase html.sin-neon la pone app/lite.js antes
// de la primera pintada. El interruptor está en Ajustes del cliente (screens/config.js) y en
// Configuración del coach (screens/coach/settings.js). Igual que la apariencia
// (app/ui/tema.js), el cambio se aplica al toque, sin recargar ni volver a dibujar la pantalla.
import { refreshGamut } from './background.js';

const KEY = "gize_neon";

export function neonOn(){ return !document.documentElement.classList.contains("sin-neon"); }

export function setNeon(on){
  try { if (on) localStorage.removeItem(KEY); else localStorage.setItem(KEY, "0"); } catch (e) {}
  document.documentElement.classList.toggle("sin-neon", !on);
  refreshGamut(); // las partículas del fondo toman la gama nueva (grises sin neón)
  syncNeonButtons();
}

// Marca el estado en todos los interruptores que haya en pantalla.
function syncNeonButtons(){
  const on = neonOn();
  document.querySelectorAll("[data-neon-toggle]").forEach(b => {
    b.classList.toggle("on", on);
    b.setAttribute("aria-checked", String(on));
  });
}

// El interruptor (role="switch"), con la misma forma que el de «Modo liviano» en Ajustes.
export function neonSwitchHtml(labelledBy){
  const on = neonOn();
  return '<button type="button" class="cfg-switch' + (on ? ' on' : '') + '" data-neon-toggle role="switch" aria-checked="' + on + '"' +
    (labelledBy ? ' aria-labelledby="' + labelledBy + '"' : '') + '><span class="cfg-switch-knob"></span></button>';
}

document.addEventListener("click", function (e) {
  const b = e.target.closest && e.target.closest("[data-neon-toggle]");
  if (!b) return;
  e.preventDefault();
  setNeon(!neonOn());
});
