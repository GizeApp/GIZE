// Asistencia del panel del gimnasio (SPEC §2.7, etapa 1): los ingresos de hoy (hora, socio, «Manual»,
// cómo estaba al entrar y quién lo registró), [Abrir recepción], [Ingreso manual] (la recepción en una
// ventana) y [Exportar CSV]. En la etapa 1 solo hay ingresos manuales: el Pase, la pestaña «Para
// revisar» y las clases llegan en la etapa 3. Sin montos.
import { esc } from '../../core/utils.js';
import { GS, horaAR, hoyAR, plural } from './estado.js';
import { cabeza, btn, btn2, vacio, cargando } from './marco.js';
import { aCsv, descargar } from './csv.js';

// Cómo estaba al entrar (gym_entries.result), con la cuota vencida desde la etapa 2. Sin montos.
export const RESULTADO = { ok: ["verde", "Activo"], cuota_vencida: ["rojo", "Cuota vencida"], pausado: ["ambar", "Pausado"], baja: ["rojo", "De baja"], visita: ["gris", "Visita"], rechazado: ["ambar", "Pidió sumarse"] };
const METODO = { manual: "Manual", pase: "Pase", offline: "Sin conexión" };

export function renderAsistencia(){
  const L = GS.ingresos;
  const acc = btn('data-gym="ir" data-v="recepcion"', "Abrir recepción") + btn2('data-gym="ingreso-manual"', "Ingreso manual") +
    btn2('data-gym="asis-csv"' + (L && L.length ? '' : ' disabled'), "Exportar CSV");
  const sub = L ? (L.length ? plural(L.length, "ingreso hoy", "ingresos hoy") : "Hoy") : "Hoy";
  if (L === null) return cabeza("Asistencia", acc, sub) + (GS.ingresosError ? vacio(esc(GS.ingresosError), btn2('data-gym="reintentar"', "Reintentar")) : cargando("Cargando los ingresos de hoy…"));
  if (!L.length) return cabeza("Asistencia", acc, sub) + vacio("Cuando registres ingresos en la recepción, los vas a ver acá.");
  const filas = L.map(e => {
    const r = RESULTADO[e.resultado] || ["gris", e.resultado || "—"];
    return '<div class="gy-row gy-row-eq gy-row-ing" role="row">' +
      '<div class="gy-td gy-td-socio" role="cell"><span class="gy-ing-h">' + esc(horaAR(e.at)) + '</span><b>' + esc(e.nombre || "Sin nombre") + '</b></div>' +
      '<div class="gy-td" role="cell" data-l="Cómo">' + esc(METODO[e.metodo] || e.metodo || "Manual") + '</div>' +
      '<div class="gy-td" role="cell" data-l="Estado"><span class="gy-sem ' + r[0] + '"><i aria-hidden="true"></i>' + esc(r[1]) + '</span></div>' +
      '<div class="gy-td" role="cell" data-l="Registró">' + esc(e.por || "—") + '</div>' +
    '</div>';
  }).join("");
  return cabeza("Asistencia", acc, sub) +
    '<div class="cv-card gy-tabla gy-tabla-ing" role="table" aria-label="Ingresos de hoy">' +
      '<div class="gy-row gy-row-eq gy-row-ing gy-th" role="row"><div role="columnheader">Hora y socio</div><div role="columnheader">Cómo</div><div role="columnheader">Estado</div><div role="columnheader">Registró</div></div>' +
      filas + '</div>' +
    '<p class="gy-pie">Ingresos manuales de la recepción. El estado es el de la ficha al entrar.</p>';
}

// Exportar los de hoy (separado por punto y coma, como el resto de los CSV del panel).
export function exportarIngresos(){
  const L = (GS.ingresos || []).map(e => ({ fecha: hoyAR(), hora: horaAR(e.at), socio: e.nombre || "", metodo: METODO[e.metodo] || e.metodo || "",
    estado: (RESULTADO[e.resultado] || [0, e.resultado || ""])[1], registro: e.por || "" }));
  descargar("ingresos-" + hoyAR() + ".csv", aCsv(L, ["fecha", "hora", "socio", "metodo", "estado", "registro"]));
}

// La ventana «Ingreso manual»: la recepción, compacta.
export function ventanaIngreso(recepcion){
  return '<div class="gy-modal-h"><h2>Ingreso manual</h2><button class="gy-x" data-gym="cerrar" aria-label="Cerrar">✕</button></div>' +
    '<p class="gy-fino">Buscá al socio, mirá su foto y registrá el ingreso. Queda en la lista de hoy.</p>' + recepcion;
}
