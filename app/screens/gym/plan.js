// Plan de GIZE del gimnasio (SPEC §2.9). Lo paga el dueño con su fila de coach_billing, como hoy.
//   · Web, dueño: plan actual, la barra de socios (contada en el servidor: fichas activas y pausadas
//     más sus alumnos propios), profes sin cargo, vencimiento, renovación y qué pasa si vence (§7.3), y
//     [Cambiar de plan] con los flujos de hoy (app/screens/coach/plan.js) mostrando solo p100, p250 y
//     p500 («Más de 500: a medida»).
//   · Web, administración: el mismo estado, sin comprar.
//   · Apps de iPhone y Android (etapa 1): una pantalla neutra, sin precios, planes ni pagos («El acceso
//     de GIZE del gimnasio está…» y las fechas). La compra con Apple para dueños llega en la 1b.
import { esc } from '../../core/utils.js';
import { billing, openPlan } from '../coach/plan.js';
import { info, esDueno, enApp, fecha, plural } from './estado.js';
import { cabeza, btn } from './marco.js';

const NOMBRE = { p100: "Gimnasio chico", p250: "Gimnasio", p500: "Gimnasio grande", trial: "Prueba", cortesia: "Cortesía" };
export const tituloPlan = () => enApp() ? "Acceso a GIZE" : "Plan de GIZE";

function neutra(pl){
  const activo = pl.estado === "activo" || pl.estado === "gracia";
  const t = pl.estado === "activo" ? "El acceso de GIZE del gimnasio está activo."
    : pl.estado === "gracia" ? "El acceso de GIZE del gimnasio venció el " + fecha(pl.vence) + "."
    : "El acceso de GIZE del gimnasio está pausado.";
  const fechas = pl.estado === "gracia" ? ["Los profes dejan de ver a los socios el " + fecha(pl.pausa_profes_el) + ".", "La recepción sigue andando hasta el " + fecha(pl.libera_el) + "."]
    : pl.estado === "operativo" ? ["Los profes y la administración ya no ven los datos de los socios.", "La recepción sigue andando hasta el " + fecha(pl.libera_el) + "."]
    : pl.estado === "liberado" ? ["Los socios quedaron sin profe. Cuando vuelva a estar activo, vuelven solos con su profe."] : [];
  return cabeza(tituloPlan()) + '<section class="cv-card gy-sec gy-plan-neutro"><p class="gy-plan-t' + (activo ? '' : ' gy-rojo') + '">' + esc(t) + '</p>' +
    fechas.map(f => '<p class="gy-p">' + esc(f) + '</p>').join("") +
    '<p class="gy-fino">' + plural(pl.seats_used || 0, "socio", "socios") + ' en el gimnasio.</p></section>';
}

export function renderPlan(){
  const pl = info().plan || {};
  if (enApp()) return neutra(pl);
  const b = billing(), max = pl.max || 0, usados = pl.seats_used || 0, pct = max ? Math.min(100, Math.round(usados / max * 100)) : 0;
  const nombre = NOMBRE[pl.plan] || "Plan";
  const estado = pl.estado === "gracia" ? '<p class="gy-cartel warn">El plan venció el ' + fecha(pl.vence) + '. Todo sigue andando hasta el ' + fecha(pl.pausa_profes_el) + '.</p>'
    : pl.estado === "operativo" ? '<p class="gy-cartel bad">El plan venció: los profes y la administración no ven los datos de los socios. La recepción sigue hasta el ' + fecha(pl.libera_el) + '.</p>'
    : pl.estado === "liberado" ? '<p class="gy-cartel bad">El plan venció y los socios quedaron sin profe. Al renovar vuelven solos con su profe.</p>' : '';
  const renueva = pl.plan === "cortesia" ? "Sin vencimiento." : !pl.vence ? "" :
    b.renews ? "Se renueva solo cada mes con Mercado Pago (próximo cobro el " + fecha(pl.vence) + ")." :
    b.apple ? "Suscripción de Apple: se maneja desde los Ajustes de la cuenta de Apple del dueño." :
    pl.plan === "trial" ? "La prueba termina el " + fecha(pl.vence) + "." : "Al día hasta el " + fecha(pl.vence) + ". Por transferencia se renueva a mano cada mes.";
  const siVence = pl.plan === "cortesia" || !pl.vence ? "" : '<section class="cv-card gy-sec"><h2 class="gy-h">Qué pasa si vence</h2><ol class="gy-ol">' +
    '<li><b>Los primeros 5 días</b> todo sigue andando.</li>' +
    '<li><b>Desde el ' + fecha(pl.pausa_profes_el) + '</b> los profes y la administración dejan de ver los datos de los socios. La recepción y exportar siguen.</li>' +
    '<li><b>Desde el ' + fecha(pl.libera_el) + '</b> los socios quedan sin profe. Al pagar vuelve todo solo, con el mismo profe.</li></ol></section>';
  return cabeza("Plan de GIZE", esDueno() ? btn('data-gym="plan-cambiar"', "Cambiar de plan") : "") + estado +
    '<section class="cv-card gy-sec gy-plan"><h2 class="gy-h">' + esc(nombre) + (max ? ' · hasta ' + max + ' socios' : '') + '</h2>' +
      '<div class="gy-barra" role="meter" aria-valuemin="0" aria-valuemax="' + max + '" aria-valuenow="' + usados + '" aria-label="Socios del plan"><i style="width:' + pct + '%"' + (pl.sobre_cupo ? ' class="lleno"' : '') + '></i></div>' +
      '<p class="gy-plan-n"><b>' + usados + '</b> de ' + max + ' socios' + (pl.sobre_cupo ? ' · <span class="gy-rojo">pasaste el cupo: no podés sumar socios</span>' : '') + '</p>' +
      '<p class="gy-p">' + (pl.profes_usados || 0) + ' de ' + (pl.profes_tope || 0) + ' profes sin cargo.</p>' +
      (renueva ? '<p class="gy-p">' + esc(renueva) + '</p>' : '') +
      '<p class="gy-fino">Cuentan las fichas activas y pausadas (con app o sin app) y tus alumnos propios. Tus profes, la administración, la recepción y los pedidos sin aprobar no cuentan.</p>' +
      (esDueno() ? '' : '<p class="gy-fino">El plan lo maneja el dueño del gimnasio.</p>') +
    '</section>' + siVence;
}
export function cambiarPlan(){ openPlan({ usados: (info().plan || {}).seats_used || 0 }); }
