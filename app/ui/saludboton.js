// Conectar Salud de Apple / Health Connect: el mismo botón en Cardio → «Pasos» y en Progreso →
// «Competencia de pasos» (pedido: «mejorá el botón para conectar con Salud de Apple»).
// · Sin conectar: un botón ancho con el corazón (dibujo propio, genérico: no es el ícono de la
//   app Salud) en un cuadrado redondeado, el título, «Tus pasos se cargan solos…» y la flecha.
// · Conectando (pidiendo el permiso): «Conectando…», desactivado.
// · Conectado: una fila con el tilde verde, «Conectado a …», «Actualizar ahora» y «Desconectar».
// Los toques van con data-pg y los atiende screens/pasos.js (un solo lugar para los dos).
// Estilos: css/screens/pasos.css (.salud-btn, .salud-ok).
import { SaludState, plataforma, saludDisponible, saludNombre, saludPrendida } from '../core/salud.js';
import { esc } from '../core/utils.js';
import { checkSvg, chevronRightSvg, heartPulseSvg } from '../core/icons.js';

// "" en la web (sin el plugin): ahí no hay nada que conectar.
export function saludHtml(){
  if (!saludDisponible()) return "";
  const nom = esc(saludNombre()), so = plataforma() === "ios" ? "ios" : "android";
  if (saludPrendida()){
    const b = SaludState.busy;
    return '<div class="salud-ok">' +
      '<span class="salud-ok-ico" aria-hidden="true">' + checkSvg + '</span>' +
      '<span class="salud-ok-t">Conectado a ' + nom + '</span>' +
      '<span class="salud-ok-acts">' +
        '<button type="button" class="pg-link" data-pg="salud-sync"' + (b ? " disabled" : "") + '>' + (b ? "Actualizando…" : "Actualizar ahora") + '</button>' +
        '<span class="salud-ok-sep" aria-hidden="true">·</span>' +
        '<button type="button" class="pg-link" data-pg="salud-off">Desconectar</button>' +
      '</span></div>';
  }
  const c = SaludState.connecting;
  return '<button type="button" class="salud-btn salud-' + so + '" data-pg="salud-on"' + (c ? ' disabled aria-busy="true"' : "") + '>' +
    '<span class="salud-ico" aria-hidden="true">' + heartPulseSvg + '</span>' +
    '<span class="salud-txt"><b class="salud-t">Conectar ' + nom + '</b><span class="salud-s">Tus pasos se cargan solos, aunque no abras GIZE</span></span>' +
    (c ? '<span class="salud-busy">Conectando…</span>' : '<span class="salud-go" aria-hidden="true">' + chevronRightSvg + '</span>') +
  '</button>';
}
