// Plan del coach: 14 días de prueba y después un plan mensual que define cuántos clientes
// puede tener. Dos formas de pagar (solo en la web):
//   · Con tarjeta por Mercado Pago: suscripción que se cobra y se renueva sola cada mes
//     (función suscripcion), y se cancela desde acá cuando quiera.
//   · Por transferencia: lo arregla con el equipo de GIZE por WhatsApp y un administrador lo
//     habilita desde gize.ar/admin (supabase/cobro-manual.sql). Se renueva a mano cada mes.
// Los límites los hace cumplir la base, no la app.
//
// Código de fundador (solo en la web, supabase/codigo-fundador.sql): «¿Tenés un código?» debajo de
// los planes. La base lo revisa (codigo_fundador_ver) y acá se muestran los precios con el
// descuento; al pagar, la función suscripcion vuelve a pedirle el descuento a la base y crea la
// suscripción con ese precio (lo que se ve acá es solo para mostrar). El que ya lo usó lo tiene
// para siempre (codigo_fundador_mio). En las apps de iPhone y Android no aparece.
//
// En la app de Android (core/tienda.js appNativa) no se habla de la prueba gratis, de planes, de
// precios ni de pagos: Google no permite mandar a pagar por fuera de su sistema. No hay tira, ni
// «Mi plan», ni prueba, ni planes. Si la cuenta no está activa, una pantalla neutra con «Cerrar
// sesión» y el día en que sus clientes pasan a usar GIZE por su cuenta; el tope de alumnos se sigue
// respetando, sin nombrar el plan.
//
// En la app de iPhone los planes se compran con Apple (core/compras-apple.js, In-App Purchase): la
// tira, «Mi plan» y la pantalla del plan vencido muestran los planes con el precio que pone Apple y
// «Suscribirme», lo que pide Apple para las suscripciones (regla 3.1.2: nombre, duración y precio,
// que se renueva sola hasta cancelarla en los Ajustes de la cuenta de Apple, Términos de uso y
// Política de privacidad, «Restaurar compras» y, con la suscripción activa, «Administrar
// suscripción»). Nunca los precios en pesos, Mercado Pago, la transferencia ni la prueba gratis.
// Si ya tiene un plan pagado por la web vigente (o cortesía), solo «Tu plan está activo»: no se
// ofrece comprar (se pagaría dos veces). Un iPhone con una versión de la app sin el plugin de
// compras sigue como Android (pantalla neutra).
//
// En la app de Android, con el cobro de Google Play prendido para la cuenta (interruptor del panel,
// core/compras-google.js), es lo mismo que en el iPhone pero con Google Play: los planes con el
// precio que pone Google, cómo se renueva y se cancela en Google Play, «Recuperar mi suscripción» y,
// con la suscripción activa, «Administrar en Google Play». Apagado (o sin el plugin), como siempre.
// Las dos tiendas comparten la pantalla (tienda(): T_APPLE o T_GOOGLE); los textos y las acciones
// de Apple son los de siempre (data-plan apple-*; Google usa google-*). En el iPhone nunca se nombra
// Google Play: a quien pagó con Google se le muestra «Tu plan está activo… al día hasta el…».

import { State } from '../../core/state.js';

import { esc, fmtDate } from '../../core/utils.js';

import { CoachState } from './state.js';

import { renderCoach } from './index.js';

import { appIOS, appNativa } from '../../core/tienda.js';

import { esProfeGym, propios } from './gimnasio.js';

import { administrarApple, cargarProductosApple, comprarApple, comprasApple, escucharApple, finalizarApple, productosApple, restaurarApple, vigentesApple } from '../../core/compras-apple.js';

import { administrarGoogle, avisosGoogle, cargarInterruptorGoogle, cargarProductosGoogle, comprarGoogle, comprasGoogle, escucharGoogle, pluginGoogle, PRODUCTOS_GOOGLE, productoDelPlanGoogle, productosGoogle, reconocerGoogle, restaurarGoogle, vigentesGoogle } from '../../core/compras-google.js';

// Precios: los mismos que plan_price (supabase/admin.sql), el panel de admin y la landing.
export const PLANS = [
  { id: "p10", max: 10, price: 14900 },
  { id: "p25", max: 25, price: 24900, best: true },
  { id: "p50", max: 50, price: 37900 },
  // Gimnasios: con nombre propio y cuentan alumnos en lugar de clientes.
  { id: "p100", max: 100, price: 59900, gym: true, name: "Gimnasio chico" },
  { id: "p250", max: 250, price: 119900, gym: true, name: "Gimnasio" },
  { id: "p500", max: 500, price: 199900, gym: true, name: "Gimnasio grande" },
];
const TRIAL_MAX = 10;

// Plan que eligió en la página de inicio (gize.ar → Precios → app/?plan=p25#registro-coach):
// se recuerda en este dispositivo para marcarlo en "Mi plan" y ponerlo en el mensaje de
// WhatsApp. Se saca de la dirección antes de que la lea el resto de la app.
const CHOSEN_KEY = "gize_plan_elegido";
try {
  const u = new URL(location.href), q = u.searchParams.get("plan");
  if (q !== null){
    if (PLANS.some(p => p.id === q)) localStorage.setItem(CHOSEN_KEY, q);
    u.searchParams.delete("plan");
    history.replaceState(history.state, "", u.pathname + u.search + u.hash);
  }
} catch (e) {}
function chosenPlan(){ try { const v = localStorage.getItem(CHOSEN_KEY); return PLANS.some(p => p.id === v) ? v : null; } catch (e) { return null; } }

// Cualquiera de las apps (también la de Android con solo su puente): sin prueba ni precios en pesos.
const IS_NATIVE = appNativa();
const IS_IOS = appIOS();
// App de iPhone con las compras de Apple: planes con el precio de Apple.
const IAP = comprasApple();
// App de Android con el cobro de Google Play: prendido para esta cuenta, o con una suscripción de
// Google vigente (para poder administrarla aunque se apague). El interruptor llega después de abrir
// (loadBilling), por eso es una función.
const googlePlay = () => !IAP && !!pluginGoogle() && (comprasGoogle("planes") || !!billing().google);
// La tienda de la app (Apple o Google Play), o null (web, o apps sin compras: nada de planes).
const tienda = () => IAP ? T_APPLE : googlePlay() ? T_GOOGLE : null;
// Apps sin compras (Android sin Google Play, o un iPhone sin el plugin): nada de planes.
const sinPlanes = () => IS_NATIVE && !tienda();
// ¿Esta app vende planes con su tienda? (coach/index.js y coach/settings.js)
export const conTienda = () => !!tienda();
const money = n => "$" + Number(n).toLocaleString("es-AR");
// WhatsApp de GIZE (el mismo de Configuración → Contacto).
const WA = "5493413490705";
function waLink(p, renew){
  const mail = (State.cloudUser && State.cloudUser.email) || "";
  const txt = "Hola! Quiero " + (renew ? "renovar" : "contratar") + " GIZE para coaches, el plan " + (p.gym ? p.name + " (hasta " + p.max + " alumnos)" : "de hasta " + p.max + " clientes") +
    " (" + money(precioDe(p)) + "/mes" + (COD.pct ? ", con el código de fundador" + (COD.codigo ? " " + COD.codigo : "") + " (" + COD.pct + "% menos)" : "") + ")." + (mail ? " Mi cuenta es " + mail + "." : "");
  return "https://wa.me/" + WA + "?text=" + encodeURIComponent(txt);
}
// Más de 500 alumnos: plan a medida.
function waCustom(){
  const mail = (State.cloudUser && State.cloudUser.email) || "";
  return "https://wa.me/" + WA + "?text=" + encodeURIComponent("Hola! Quiero un plan a medida de GIZE para un gimnasio de más de 500 alumnos." + (mail ? " Mi cuenta es " + mail + "." : ""));
}

// billing: la fila de coach_billing. null + missing = todavía no se corrió el SQL (no se
// bloquea nada en ese caso, así la app sigue andando mientras se configura).
const B = { row: null, missing: false, loaded: false, busy: false, open: false, confirming: false, mpEmail: null, mailOpen: false, gym: null };
// Código de fundador: pct es el descuento que se muestra; codigo, el que probó y todavía no usó
// (va al pagar); mio, el que ya tiene para siempre; de, la cuenta para la que se leyó.
const COD = { open: false, texto: "", pct: 0, codigo: null, mio: false, error: "", probando: false, de: null };
// Compras con la tienda (Apple o Google Play): cargando/sin los precios, y la compra recién hecha.
const A = { cargando: false, fallo: false, exito: false, iniciado: false };
// Google Play: las suscripciones de este celular (null: todavía no se leyeron) y si la del plan
// está suspendida (Google no pudo cobrar).
const G = { iniciado: false, vigentes: null, suspendida: false, aviso: false, volver: false };

export async function loadBilling(){
  if(!State.sb || !State.cloudUser) return;
  // Android con el plugin de Google Play: el interruptor se lee junto con el plan.
  const inter = !IAP && pluginGoogle() ? cargarInterruptorGoogle(State.sb, State.cloudUser.id) : null;
  try{
    const r = await State.sb.from("coach_billing").select("*").eq("coach_id", State.cloudUser.id).maybeSingle();
    // Una lectura fallida (sin señal) no borra el plan ya leído de esta cuenta: sin él se perdía
    // el cupo y, con el plan lleno, volvía a ofrecer el código de invitación.
    if(r.error){ B.missing = true; if(!(B.row && B.row.coach_id === State.cloudUser.id)) B.row = null; }
    else { B.missing = !r.data; B.row = r.data || null; }
  }catch(e){ B.missing = true; }
  if(inter) await inter;
  B.loaded = true;
  if(IAP) iniciarApple();
  else if(googlePlay()) iniciarGoogle();
  else if(!IS_NATIVE) cargarDescuento();
}

// El descuento que ya tiene el coach (una vez por cuenta). Sin el SQL o sin señal, sin descuento.
async function cargarDescuento(){
  const id = State.cloudUser && State.cloudUser.id;
  if(!id || COD.de === id) return;
  Object.assign(COD, { open: false, texto: "", pct: 0, codigo: null, mio: false, error: "", probando: false, de: id });
  try{
    const r = await State.sb.rpc("codigo_fundador_mio");
    const n = Number(r && r.data);
    if(!r.error && n > 0 && COD.de === id){ COD.pct = n; COD.mio = true; rerender(); }
  }catch(e){}
}
// Precio con el descuento: la misma cuenta que conDescuento en supabase/functions/suscripcion/reglas.ts.
const conDescuento = (precio, pct) => pct >= 1 && pct <= 90 ? Math.round(precio * (100 - Math.floor(pct)) / 100) : precio;
const precioDe = p => conDescuento(p.price, COD.pct);

// count: los vínculos que cuenta el plan. Desde la etapa 0 de gimnasios los cuenta la base
// (coach_billing.seats_used: los alumnos propios; los socios que un profe atiende en un gimnasio van
// por el plan del gimnasio). Al profe de un gimnasio se le toma ese número; al coach sin gimnasio, la
// lista de clientes, como siempre: se actualiza en el momento al bloquear o soltar a un alumno, sin
// esperar a releer el plan (con seats_used quedaba «Llegaste al máximo» hasta la próxima recarga). profe: es profe de un gimnasio (screens/coach/gimnasio.js): nunca ve la pantalla de pago por el
// gimnasio, y la tira del plan y la prueba solo aparecen si tiene algo propio (propio: alumnos propios o
// un plan propio pagado o de cortesía). Sin la fila (la base no se la muestra a un profe sin nada
// propio, gimnasios-vinculo.sql), como siempre: activo y sin tope.
export function billing(){
  const r = B.row, now = Date.now(), profe = esProfeGym();
  const lista = profe ? propios().length : CoachState.coachClients.length;
  const count = profe && r && typeof r.seats_used === "number" ? r.seats_used : lista;
  if(!r) return { known: false, active: true, count, max: Infinity, atCap: false, profe, propio: false };
  const trialEnd = new Date(r.trial_ends_at).getTime();
  const paidUntil = r.paid_until ? new Date(r.paid_until).getTime() : 0;
  const comp = r.plan === "cortesia";
  const paid = paidUntil > now;
  const trial = !paid && !comp && trialEnd > now;
  const max = r.max_clients || TRIAL_MAX;
  // Más clientes que los del plan (por ejemplo, después de pasarse a uno más chico): la base
  // lo trata como sin plan (coach_active en supabase/cupo-plan.sql) hasta que lo resuelva.
  const overCap = !comp && (paid || trial) && count > max;
  const active = comp || ((paid || trial) && !overCap);
  // Lo pagado viene de una suscripción de Apple si no va más allá de lo que cubre Apple (como
  // pagoDeApple en supabase/functions/compras-apple/reglas.ts); si va más allá, lo pagó por la web.
  const apple = paid && !!r.apple_original_tx && !!r.apple_vence && paidUntil <= new Date(r.apple_vence).getTime();
  // Lo mismo con Google Play (cambiosBilling en supabase/functions/compras-google/reglas.ts).
  const google = paid && !apple && !!r.google_token && !!r.google_vence && paidUntil <= new Date(r.google_vence).getTime();
  return {
    known: true, active, trial, paid, comp, count, max, overCap, profe, propio: !profe || count > 0 || paid || comp,
    atCap: count >= max,
    daysLeft: trialEnd > now ? Math.max(1, Math.ceil((trialEnd - now) / 864e5)) : 0,
    // Pagó antes de que termine la prueba: el plan arranca cuando la prueba termina.
    trialFirst: paid && !comp && trialEnd > now,
    plan: PLANS.find(p => p.id === r.plan) || null,
    until: paid ? r.paid_until : (trial ? r.trial_ends_at : null),
    renews: r.mp_status === "authorized",
    pending: r.pending_plan,
    apple, appleRenueva: apple && !!r.apple_renueva, appleVence: apple ? r.apple_vence : null,
    google, googleRenueva: google && !!r.google_renueva, googleVence: google ? r.google_vence : null,
  };
}

// Último día cubierto: el pago manual vence a las 00:00 del día siguiente (supabase/cobro-manual.sql).
// En hora de Argentina (la del cobro), aunque el celular esté en otro huso horario.
const AR_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" });
function ymd(iso){ return AR_DAY.format(new Date(new Date(iso).getTime() - 1)); }

// Tira debajo del código de invitación. En las apps sin compras no va (nombra el plan).
export function renderPlanBanner(){
  const b = billing(); if(!b.known || sinPlanes() || !b.propio) return "";
  const T = tienda(); if(T) return bannerTienda(b, T);
  let txt, cls = "";
  if(b.comp) txt = "Plan cortesía · " + b.count + "/" + b.max + " clientes";
  else if(b.trial){ txt = "Prueba gratis · te quedan <b>" + b.daysLeft + " día" + (b.daysLeft === 1 ? "" : "s") + "</b> · " + b.count + "/" + b.max + " clientes"; if(b.daysLeft <= 3) cls = " warn"; }
  else if(b.trialFirst) txt = "Prueba gratis · te quedan <b>" + b.daysLeft + " día" + (b.daysLeft === 1 ? "" : "s") + "</b> · después sigue tu plan · " + b.count + "/" + b.max + " clientes";
  else if(b.paid) txt = planCorto(b) + " · " + b.count + "/" + b.max + (b.renews || b.appleRenueva || b.googleRenueva ? "" : " · vence el " + fmtDate(ymd(b.until)));
  else { txt = "Sin plan vigente"; cls = " warn"; }
  return '<button class="pl-banner' + cls + (b.atCap ? " warn" : "") + '" data-plan="open"><span>' + txt + '</span><span class="pl-banner-go">' + (b.trial ? "Ver planes" : "Mi plan") + ' ›</span></button>';
}

const planCorto = b => b.plan && b.plan.gym ? "Plan " + b.plan.name : b.max >= 100 ? "Plan Gimnasio" : "Plan " + b.max + " clientes";
// Abierto desde el panel del gimnasio (B.gym), «socios» como en el resto del panel.
const planLargo = b => b.plan && b.plan.gym ? 'Plan ' + b.plan.name + ' (' + b.max + (B.gym ? ' socios)' : ' alumnos)') : 'Plan de ' + b.max + ' clientes';

function planCards(b){
  // En las apps sin compras no se habla de pagos ni de dónde se paga (reglas de Apple y Google).
  // Ahí ni se llega (sin «Mi plan» ni la pantalla de la prueba vencida): por las dudas.
  if(sinPlanes()) return '';
  const T = tienda(); if(T) return cardsTienda(b, T);
  // Con la suscripción de Apple o de Google Play vigente, en la web no se ofrece pagar otro plan (se
  // pagaría dos veces): se cambia o se cancela desde el celular (statusLine lo dice).
  if(b.apple || b.google) return '';
  const chosen = b.paid || B.gym ? null : chosenPlan();
  // Dueño de un gimnasio (Plan de GIZE del panel del gimnasio, app/screens/gym/plan.js): solo los
  // planes de gimnasio (p100, p250 y p500), y el cupo que cuenta es el del servidor (seats_used).
  const usados = B.gym ? B.gym.usados : b.count;
  const cards = PLANS.filter(p => !B.gym || p.gym).map(p => {
    const current = b.paid && b.plan && b.plan.id === p.id;
    const tooSmall = usados > p.max;
    // El que eligió en la página de inicio va destacado (en lugar del "Más elegido").
    const mine = chosen === p.id, hi = chosen ? mine : p.best;
    return '<div class="pl-card' + (hi ? " best" : "") + (mine ? " chosen" : "") + (current ? " current" : "") + '">' +
      (mine ? '<div class="pl-tag">El que elegiste</div>' : hi ? '<div class="pl-tag">Más elegido</div>' : '') +
      (p.gym ? '<div class="pl-name">' + esc(p.name) + '</div>' : '') +
      '<div class="pl-max">Hasta <b>' + p.max + '</b> ' + (B.gym ? 'socios' : p.gym ? 'alumnos' : 'clientes') + '</div>' +
      '<div class="pl-price">' + (COD.pct ? '<s class="pl-old">' + money(p.price) + '</s> ' : '') + money(precioDe(p)) + '<span>/mes</span></div>' +
      (current && b.renews ? '<button class="pl-choose" disabled>Tu plan actual</button>'
        : tooSmall ? '<button class="pl-choose" disabled>Tenés ' + usados + (B.gym ? ' socios' : ' clientes') + '</button>'
        : '<button class="pl-choose" data-plan="choose" data-id="' + p.id + '"' + (B.busy ? ' disabled' : '') + '>' +
            (B.busy === p.id ? 'Abriendo Mercado Pago…' : current ? 'Renovar con tarjeta' : 'Pagar con tarjeta') + '</button>' +
          '<a class="pl-alt" href="' + esc(waLink(p, current)) + '" target="_blank" rel="noopener">o por transferencia</a>') +
    '</div>';
  }).join("");
  const mail = B.mpEmail != null ? B.mpEmail : ((State.cloudUser && State.cloudUser.email) || "");
  const mailBox = B.mailOpen
    ? '<div class="cs-field pl-mail"><label>Mail de tu cuenta de Mercado Pago</label>' +
      '<input class="co-note" type="email" data-plan="mail" value="' + esc(mail) + '" placeholder="tu-mail@ejemplo.com" autocomplete="email">' +
      '<div class="pl-fine">Tiene que ser el mail con el que entrás a Mercado Pago para pagar.</div></div>'
    : '<div class="pl-fine pl-mail-line">Con tarjeta pagás con la cuenta de Mercado Pago de <b>' + esc(mail) + '</b> · <button class="pl-link" data-plan="mail-edit">¿Otro mail?</button></div>';
  return '<div class="pl-cards">' + cards + '</div>' + codigoBox() + mailBox +
    '<div class="pl-fine"><b>Con tarjeta</b> (Mercado Pago): se cobra y se renueva sola cada mes, y la cancelás cuando quieras.</div>' +
    '<div class="pl-fine"><b>Por transferencia:</b> lo arreglás por WhatsApp con el equipo de GIZE y te habilitamos el plan apenas se acredita. Se renueva a mano cada mes; si un mes no seguís, no se cobra nada más.</div>' +
    '<div class="pl-fine">¿Más de 500 ' + (B.gym ? 'socios' : 'alumnos') + '? <a class="pl-link" href="' + esc(waCustom()) + '" target="_blank" rel="noopener">Hablemos</a> y armamos un plan a medida.</div>';
}

// «¿Tenés un código?» (solo en la web: planCards no llega acá en las apps).
function codigoBox(){
  if(COD.pct) return '<div class="pl-status ok pl-cod-ok">Código de fundador' + (COD.codigo ? ' <b>' + esc(COD.codigo) + '</b>' : '') + ': <b>' + COD.pct + '% menos para siempre</b>, también en cada renovación.</div>';
  if(!COD.open) return '<div class="pl-fine pl-cod-line"><button class="pl-link" data-plan="codigo-abrir">¿Tenés un código?</button></div>';
  return '<div class="cs-field pl-cod"><label>Código de fundador</label>' +
    '<div class="pl-cod-row"><input class="co-note" type="text" data-plan="codigo" value="' + esc(COD.texto) + '" maxlength="32" autocomplete="off" autocapitalize="characters" spellcheck="false">' +
    '<button class="pl-choose pl-cod-btn" data-plan="codigo-aplicar"' + (COD.probando ? ' disabled' : '') + '>' + (COD.probando ? 'Revisando…' : 'Aplicar') + '</button></div>' +
    (COD.error ? '<div class="pl-fine pl-cod-err">' + esc(COD.error) + '</div>' : '') + '</div>';
}

// Revisa el código en la base (no ocupa lugar: eso pasa al pagar).
async function aplicarCodigo(){
  const input = document.querySelector('[data-plan="codigo"]');
  const c = ((input ? input.value : COD.texto) || "").trim().toUpperCase();
  COD.texto = c;
  if(!c){ COD.error = "Escribí el código."; rerender(); return; }
  if(!State.sb || COD.probando) return;
  COD.probando = true; COD.error = ""; rerender();
  let err = "";
  try{
    const r = await State.sb.rpc("codigo_fundador_ver", { p_codigo: c });
    const d = r && r.data;
    if(r.error) err = "No se pudo revisar el código. Probá de nuevo en un rato.";
    else if(d && d.ok && Number(d.porcentaje) > 0){ COD.pct = Number(d.porcentaje); COD.mio = !!d.ya; COD.codigo = d.ya ? null : c; }
    else err = (d && d.error) || "Ese código no existe o ya no está vigente.";
  }catch(e){ err = "No se pudo revisar el código. Probá de nuevo en un rato."; }
  COD.probando = false; COD.error = err; rerender();
}

function statusLine(b){
  if(!b.known) return "";
  const T = tienda(); if(T) return statusTienda(b, T);
  if(b.comp) return '<div class="pl-status ok">Tenés un plan de cortesía, sin vencimiento.</div>';
  if(b.apple) return '<div class="pl-status ok">' + planLargo(b) + ' · suscripción de Apple ' + (b.appleRenueva ? 'que se renueva sola cada mes' : 'al día hasta el ' + fmtDate(ymd(b.until))) +
    '. La cambiás o la cancelás desde tu iPhone, en los Ajustes de tu cuenta de Apple.</div>';
  if(b.google) return '<div class="pl-status ok">' + planLargo(b) + ' · suscripción de Google Play ' + (b.googleRenueva ? 'que se renueva sola cada mes' : 'al día hasta el ' + fmtDate(ymd(b.until))) +
    '. La cambiás o la cancelás desde tu Android, en Google Play.</div>';
  if(b.trialFirst) return '<div class="pl-status ok">Tu plan de ' + b.max + ' clientes ya está pago. Primero termina tu prueba gratis (te quedan ' + b.daysLeft + ' día' + (b.daysLeft === 1 ? '' : 's') + ') y después arranca el plan, al día hasta el ' + fmtDate(ymd(b.until)) + '.</div>';
  if(b.paid) return '<div class="pl-status ok">' + planLargo(b) + ' · ' + (b.renews ? 'se renueva solo cada mes' : 'al día hasta el ' + fmtDate(ymd(b.until))) + '.</div>';
  const ch = PLANS.find(p => p.id === chosenPlan());
  if(b.trial) return '<div class="pl-status">Estás en la prueba gratis: te quedan ' + b.daysLeft + ' día' + (b.daysLeft === 1 ? '' : 's') + ' (hasta ' + b.max + ' clientes).' +
    (ch ? ' Elegiste el plan ' + (ch.gym ? ch.name : 'de hasta ' + ch.max + ' clientes') + ': contratalo cuando quieras para seguir después de la prueba.' : ' Elegí un plan y contratalo para seguir después.') + '</div>';
  return '<div class="pl-status warn">Tu ' + (B.row && B.row.paid_until ? 'plan venció' : 'prueba gratis terminó') + '.</div>';
}

// Hoja "Mi plan" (desde la tira o desde Configuración). En las apps sin compras no se abre.
export function renderPlanSheet(){
  let host = document.getElementById("planSheetHost");
  if(!host){ host = document.createElement("div"); host.id = "planSheetHost"; document.body.appendChild(host); }
  if(!B.open || sinPlanes()){ host.innerHTML = ""; return; }
  const b = billing();
  // Cancelar la suscripción de Mercado Pago: solo en la web (en las apps no se nombra).
  const cancel = (b.paid && b.renews && !tienda()) ? '<button class="pl-cancel" data-plan="cancel">Cancelar la renovación</button>' : "";
  host.innerHTML = '<div class="cp-bg" data-plan="close"></div><div class="cp-ccard pl-sheet">' +
    '<div class="cp-head"><div class="cp-title">Mi plan</div><button class="cp-x" data-plan="close">✕</button></div>' +
    statusLine(b) + planCards(b) + cancel +
  '</div>';
}

// A los 4 días de vencido, la base pasa a sus clientes al sistema común (supabase/coach-vencido.sql).
const GRACE_DAYS = 4;
function graceLine(b){
  if(!b.count || !B.row) return "";
  const end = Math.max(new Date(B.row.trial_ends_at || 0).getTime(), B.row.paid_until ? new Date(B.row.paid_until).getTime() : 0);
  const limit = end + GRACE_DAYS * 864e5;
  if(!(end > 0) || limit <= Date.now()) return "";
  const dia = fmtDate(ymd(new Date(limit).toISOString()));
  // En las apps sin compras, sin mandar a renovar (se paga por fuera de la tienda).
  return '<div class="pl-wall-s pl-wall-grace">' + (sinPlanes() ? 'El ' + dia + ' tus clientes pasan a usar GIZE por su cuenta, con todo lo que les armaste.'
    : 'Tenés hasta el ' + dia + ' para renovar. Después, tus clientes pasan a usar GIZE por su cuenta, con todo lo que les armaste.') + '</div>';
}

// «Eliminar cuenta» también con la cuenta inactiva: la tuerca de Configuración (el único lugar
// donde estaba) no se dibuja acá, y Apple y Google exigen poder borrarla desde la app. Lo
// maneja screens/config.js (confirmación, baja en Mercado Pago y borrado).
const WALL_DELETE = '<button class="logout-btn cfg-danger pl-wall-del" data-action="cfg-delete-account">Eliminar cuenta</button>';

// Pantalla completa cuando no hay prueba ni plan vigente.
export function renderPaywall(){
  const b = billing();
  if(b.overCap) return renderOverCap(b);
  if(sinPlanes()) return renderInactiveApp(b);
  const T = tienda(); if(T) return renderPaywallTienda(b, T);
  return '<div class="co-wrap pl-wall">' +
    '<div class="co-head"><div class="co-brand"><img class="brand-logo" src="brand/logo/gize-firma-horizontal.svg" alt="GIZE"><span class="co-brand-dash">-</span><span class="co-brand-tag">Panel de coach</span></div><div class="co-head-actions"><button class="co-logout" data-auth="logout">Salir</button></div></div>' +
    '<div class="pl-wall-hero"><div class="pl-wall-t">' + (B.row && B.row.paid_until ? 'Tu plan venció' : 'Terminó tu prueba gratis') + '</div>' +
    '<div class="pl-wall-s">Tus ' + b.count + ' cliente' + (b.count === 1 ? '' : 's') + ', rutinas y registros están guardados. ' +
    'Elegí un plan para volver a verlos y seguir sumando clientes: con tarjeta se renueva solo cada mes.</div>' +
    graceLine(b) +
    (B.confirming ? '<div class="pl-status">Confirmando tu pago con Mercado Pago…</div>' : '') + '</div>' +
    planCards(b) + WALL_DELETE +
  '</div>';
}

// Apps de iPhone y Android: cuenta de coach sin prueba ni plan vigente. Sin nombrar la prueba, el
// plan, precios ni adónde ir: solo que no está activa y «Cerrar sesión». En Android, además, el
// día en que sus clientes pasan a usar GIZE por su cuenta (graceLine, sin mandar a renovar).
function renderInactiveApp(b){
  return '<div class="co-wrap pl-wall">' +
    '<div class="co-head"><div class="co-brand"><img class="brand-logo" src="brand/logo/gize-firma-horizontal.svg" alt="GIZE"><span class="co-brand-dash">-</span><span class="co-brand-tag">Panel de coach</span></div><div class="co-head-actions"><button class="co-logout" data-auth="logout">Salir</button></div></div>' +
    '<div class="pl-wall-hero"><div class="pl-wall-t">Tu cuenta de coach no está activa en este momento.</div>' +
    (IS_IOS ? '' : graceLine(b)) +
    '<button class="pl-choose pl-wall-out" data-auth="logout">Cerrar sesión</button></div>' + WALL_DELETE +
  '</div>';
}

// Tiene más clientes que los de su plan: se pasa a uno más grande o desvincula clientes.
// En las apps, lo mismo sin nombrar el plan: «el máximo de alumnos de tu cuenta».
function renderOverCap(b){
  const extra = b.count - b.max;
  // ¿Se le ofrece un plan más grande? En la web sí; en las apps con su tienda (Apple o Google Play),
  // si vende (Google Play apagado con una suscripción vigente: solo administrarla) y no tiene un plan
  // vigente pagado de otra forma; en las apps sin compras, no.
  const T = tienda(), sin = sinPlanes();
  const ofrece = T ? T.vende() && !planAjeno(b, T) : !IS_NATIVE;
  const list = CoachState.coachClients.map(c => '<div class="pl-oc-row"><span>' + esc(c.full_name || "Cliente") + '</span>' +
    '<button class="pl-link" data-plan="unlink" data-id="' + esc(c.id) + '"' + (B.busy ? ' disabled' : '') + '>Desvincular</button></div>').join("");
  return '<div class="co-wrap pl-wall">' +
    '<div class="co-head"><div class="co-brand"><img class="brand-logo" src="brand/logo/gize-firma-horizontal.svg" alt="GIZE"><span class="co-brand-dash">-</span><span class="co-brand-tag">Panel de coach</span></div><div class="co-head-actions"><button class="co-logout" data-auth="logout">Salir</button></div></div>' +
    '<div class="pl-wall-hero"><div class="pl-wall-t">' + (sin ? 'Tenés más alumnos que el máximo de tu cuenta' : 'Tenés más clientes que tu plan') + '</div>' +
    '<div class="pl-wall-s">' + (sin ? 'Tenés ' + b.count + ' alumnos y el máximo de tu cuenta es ' + b.max + '. ' : 'Tenés ' + b.count + ' clientes y tu plan es de ' + b.max + '. ') +
    (ofrece ? 'Contratá un plan más grande o desvinculá ' : 'Desvinculá ') + extra + ' cliente' + (extra === 1 ? '' : 's') + ' para volver a ver sus fichas. Sus rutinas y registros quedan guardados.</div></div>' +
    (T ? statusTienda(b, T) : '') + planCards(b) +
    '<div class="pl-oc"><div class="pl-sub">Tus clientes</div>' + list + '</div>' + WALL_DELETE +
  '</div>';
}

// ---- Apps con su tienda: los planes con Apple (iPhone, core/compras-apple.js) o con Google Play
// (Android, core/compras-google.js) ----
const HEAD_COACH = '<div class="co-head"><div class="co-brand"><img class="brand-logo" src="brand/logo/gize-firma-horizontal.svg" alt="GIZE"><span class="co-brand-dash">-</span><span class="co-brand-tag">Panel de coach</span></div><div class="co-head-actions"><button class="co-logout" data-auth="logout">Salir</button></div></div>';
// Lo que pide Apple debajo de los planes (regla 3.1.2). Los textos legales se abren sin la barra que
// lleva a la página de inicio (?app=1).
const APPLE_RENUEVA = 'Se renueva solo cada mes hasta que la canceles desde los Ajustes de tu cuenta de Apple';
const APPLE_LEGAL = '<div class="pl-fine pl-legal"><a class="pl-link" href="https://gize.ar/terminos/?app=1" target="_blank" rel="noopener">Términos de uso</a> · ' +
  '<a class="pl-link" href="https://gize.ar/privacidad/?app=1" target="_blank" rel="noopener">Política de privacidad</a></div>';
// Fecha (en hora de Argentina) en que vence o se renueva la suscripción de la tienda.
const diaApple = iso => fmtDate(AR_DAY.format(new Date(iso)));
// ¿Tiene un plan vigente que no es de esta tienda (pagado por la web, con la otra tienda, o
// cortesía)? Ahí no se ofrece comprar: pagaría dos veces.
const planAjeno = (b, T) => b.comp || (b.paid && !T.activo(b));

// Lo que cambia entre las dos tiendas: de dónde sale el plan, los precios, si vende, el pie (lo que
// piden Apple y Google debajo de los planes) y los avisos propios.
const T_APPLE = {
  id: "apple", activo: b => b.apple, renueva: b => b.appleRenueva, vence: b => b.appleVence,
  prods: productosApple, cargar: cargarProductosApple, vende: () => true, aviso: () => "",
  pie: b => '<div class="pl-fine">El pago se cobra a tu cuenta de Apple al confirmar la suscripción. ' + APPLE_RENUEVA +
      ' (al menos 24 horas antes de que termine el mes). Si cambiás de plan, Apple ajusta el cobro.</div>' + APPLE_LEGAL +
    '<div class="pl-apple-acc">' + (b.apple ? '<button class="pl-choose pl-apple-manage" data-plan="apple-manage"' + (B.busy ? ' disabled' : '') + '>Administrar suscripción</button>' : '') +
      '<button class="pl-cancel" data-plan="apple-restore"' + (B.busy ? ' disabled' : '') + '>' + (B.busy === "restaurar" ? 'Restaurando…' : 'Restaurar compras') + '</button></div>',
};
const OTRA_GOOGLE = "Tu suscripción es de otra cuenta de Google Play: para cambiarla, usá esa cuenta.";
const T_GOOGLE = {
  id: "google", activo: b => b.google, renueva: b => b.googleRenueva, vence: b => b.googleVence,
  prods: productosGoogle, cargar: cargarProductosGoogle, vende: () => comprasGoogle("planes"),
  // Google no pudo cobrar (la suscripción está suspendida): se arregla en Google Play.
  aviso: () => G.suspendida ? '<div class="pl-status warn">Google Play no pudo cobrar tu plan. Actualizá el medio de pago en Google Play y se activa solo.</div>' : "",
  pie: b => '<div class="pl-fine">El pago se cobra a tu cuenta de Google Play al confirmar la suscripción. Se renueva sola cada mes hasta que la canceles desde Google Play (Pagos y suscripciones → Suscripciones). Si cambiás de plan, Google ajusta el cobro.</div>' + APPLE_LEGAL +
    '<div class="pl-apple-acc">' + (b.google || G.suspendida ? '<button class="pl-choose pl-apple-manage" data-plan="google-manage"' + (B.busy ? ' disabled' : '') + '>Administrar en Google Play</button>' : '') +
      '<button class="pl-cancel" data-plan="google-restore"' + (B.busy ? ' disabled' : '') + '>' + (B.busy === "restaurar" ? 'Recuperando…' : 'Recuperar mi suscripción') + '</button></div>',
};

function bannerTienda(b, T){
  const n = b.count + "/" + b.max + " " + (b.plan && b.plan.gym ? "alumnos" : "clientes");
  // En la prueba, sin nombrarla: solo cuántos tiene.
  const txt = b.comp ? "Plan cortesía · " + n
    : b.paid ? planCorto(b) + " · " + n + (T.activo(b) ? (T.renueva(b) ? "" : " · vence el " + diaApple(T.vence(b))) : (b.renews ? "" : " · vence el " + fmtDate(ymd(b.until))))
    : n;
  return '<button class="pl-banner' + (b.atCap ? " warn" : "") + '" data-plan="open"><span>' + txt + '</span><span class="pl-banner-go">' + (b.paid || b.comp ? "Mi plan" : "Ver planes") + ' ›</span></button>';
}

function statusTienda(b, T){
  if(!b.known) return "";
  if(b.comp) return '<div class="pl-status ok"><b>Tu plan está activo.</b> Plan cortesía, sin vencimiento.</div>';
  if(T.activo(b)) return '<div class="pl-status ok"><b>' + (A.exito ? '¡Listo! ' : '') + 'Tu plan está activo.</b> ' + planLargo(b) + ' · ' +
    (T.renueva(b) ? 'se renueva solo el ' : 'vence el ') + diaApple(T.vence(b)) + '.</div>' + T.aviso();
  if(b.paid) return '<div class="pl-status ok"><b>Tu plan está activo.</b> ' + planLargo(b) + ', al día hasta el ' + fmtDate(ymd(b.until)) + '.</div>';
  return T.aviso();
}

function cardsTienda(b, T){
  if(planAjeno(b, T)) return "";
  const pie = T.pie(b);
  // Google Play apagado para la cuenta, con una suscripción que ya tenía: solo administrarla.
  if(!T.vende()) return pie;
  // La suscripción de Google Play es de otra cuenta de Google (no está en este celular): no se
  // puede cambiar de plan desde acá ni comprar otra (pagaría dos).
  if(T === T_GOOGLE && b.google && G.vigentes && !G.vigentes.some(c => c.token === B.row.google_token))
    return '<div class="pl-status warn">' + OTRA_GOOGLE + '</div>' + pie;
  // Google no pudo cobrar su suscripción (suspendida): se arregla en Google Play y vuelve sola.
  // Comprar otro plan acá la dejaría con dos suscripciones (pagaría dos cuando se recupere).
  if(T === T_GOOGLE && G.suspendida) return pie;
  const prods = T.prods();
  if(!prods){
    if(!A.cargando && !A.fallo) cargarPlanes(T);
    return '<div class="pl-status">' + (A.fallo ? 'No se pudieron cargar los planes. Revisá la conexión y <button class="pl-link" data-plan="' + T.id + '-retry">probá de nuevo</button>.' : 'Cargando los planes…') + '</div>' + pie;
  }
  const cards = PLANS.map(p => {
    const pr = prods[p.id]; if(!pr) return "";
    const current = T.activo(b) && b.plan && b.plan.id === p.id;
    const tooSmall = b.count > p.max;
    return '<div class="pl-card' + (current ? ' current' : '') + '">' +
      '<div class="pl-name">' + esc(pr.nombre || (p.gym ? p.name : "Plan " + p.max + " clientes")) + '</div>' +
      '<div class="pl-max">Hasta <b>' + p.max + '</b> ' + (p.gym ? 'alumnos' : 'clientes') + '</div>' +
      '<div class="pl-price">' + esc(pr.precio) + '<span>/mes</span></div>' +
      '<div class="pl-per">Suscripción mensual</div>' +
      (current ? '<button class="pl-choose" disabled>Tu plan actual</button>'
        : tooSmall ? '<button class="pl-choose" disabled>Tenés ' + b.count + ' clientes</button>'
        : '<button class="pl-choose" data-plan="choose" data-id="' + p.id + '"' + (B.busy ? ' disabled' : '') + '>' + (B.busy === p.id ? 'Abriendo…' : T.activo(b) ? 'Cambiar a este plan' : 'Suscribirme') + '</button>') +
    '</div>';
  }).join("");
  return '<div class="pl-cards">' + cards + '</div>' + pie;
}

// Pantalla completa sin plan vigente, en las apps con su tienda: los planes (sin nombrar la prueba).
function renderPaywallTienda(b, T){
  return '<div class="co-wrap pl-wall">' + HEAD_COACH +
    '<div class="pl-wall-hero"><div class="pl-wall-t">' + (B.row && B.row.paid_until ? 'Tu plan venció' : 'Elegí tu plan') + '</div>' +
    '<div class="pl-wall-s">' + (b.count === 1 ? 'Tu cliente, sus' : 'Tus ' + b.count + ' clientes,') + ' rutinas y registros están guardados. ' +
    'Elegí un plan para volver a verlos y seguir sumando clientes.</div>' +
    graceLine(b) + '</div>' +
    statusTienda(b, T) + planCards(b) + WALL_DELETE +
  '</div>';
}

function cargarPlanes(T){
  if(A.cargando) return;
  A.cargando = true;
  T.cargar().then(p => { A.cargando = false; A.fallo = !p; rerender(); });
}

// Manda a la función compras-apple lo que firmó Apple (un JWS, o varios al restaurar).
// { ok, resultados?, error?, codigo? }
async function enviarApple(jws){
  try{
    const r = await State.sb.functions.invoke("compras-apple", { body: { jws } });
    if(!r.error) return { ok: Array.isArray(jws) || !!(r.data && r.data.ok), resultados: (r.data && r.data.resultados) || [] };
    let j = null; try{ j = await r.error.context.json(); }catch(e){}
    return { ok: false, error: (j && j.error) || (r.error.name === "FunctionsFetchError" ? "No se pudo conectar." : r.error.message), codigo: j && j.codigo };
  }catch(e){ return { ok: false, error: (e && e.message) || String(e) }; }
}

// Una vez por sesión de coach: las compras que llegan solas (renovaciones, una compra aprobada más
// tarde) van al servidor, y si la suscripción vence en menos de un día se vuelve a mirar (por si
// Apple ya la renovó y el aviso todavía no llegó).
function iniciarApple(){
  if(A.iniciado || !State.cloudUser) return;
  A.iniciado = true;
  escucharApple(ev => {
    if(!ev || !ev.jws || !State.sb || !State.cloudUser) return;
    enviarApple(ev.jws).then(r => {
      if(r.ok && ev.transaccion) finalizarApple(ev.transaccion).catch(() => {});
      return loadBilling();
    }).then(rerender, () => {});
  });
  cargarProductosApple();
  const r = B.row;
  if(r && r.apple_original_tx && r.apple_vence && new Date(r.apple_vence).getTime() - Date.now() < 864e5) sincronizarApple();
}

async function sincronizarApple(){
  let lista = [];
  try{ lista = await vigentesApple(); }catch(e){}
  if(lista.length) await enviarApple(lista);
  await loadBilling(); rerender();
}

async function comprarPlanApple(plan){
  if(!State.sb || !State.cloudUser || B.busy) return;
  B.busy = plan; A.exito = false; rerender();
  let r;
  try{ r = await comprarApple(plan, State.cloudUser.id); }
  catch(e){ B.busy = false; rerender(); alert("No se pudo completar la compra: " + ((e && e.message) || e)); return; }
  // Cerró la ventana de Apple sin comprar: nada.
  if(!r || r.estado === "cancelado"){ B.busy = false; rerender(); return; }
  if(r.estado === "pendiente"){
    B.busy = false; rerender();
    alert("Tu compra quedó esperando aprobación (por ejemplo, de quien organiza la familia en Apple). Cuando Apple la apruebe, tu plan se activa solo.");
    return;
  }
  const env = await enviarApple(r.jws);
  // Solo se le avisa a Apple que terminó cuando el servidor la guardó: si no, Apple la vuelve a
  // mandar al abrir la app y se reintenta.
  if(env.ok && r.transaccion) { try{ await finalizarApple(r.transaccion); }catch(e){} }
  await loadBilling();
  B.busy = false;
  const bl = billing();
  if(env.ok && bl.paid){
    A.exito = true; rerender();
    alert("¡Listo! Tu plan de " + bl.max + " " + (bl.plan && bl.plan.gym ? "alumnos" : "clientes") + " está activo.");
  } else {
    rerender();
    alert(env.codigo === "otra-cuenta" ? "Esa suscripción de Apple es de otra cuenta de GIZE. Entrá con esa cuenta para usarla."
      : "Apple confirmó tu compra, pero todavía no pudimos activar tu plan. Se activa solo en unos minutos; si no, tocá «Restaurar compras».");
  }
}

async function restaurarPlanesApple(){
  if(!State.sb || B.busy) return;
  B.busy = "restaurar"; rerender();
  let lista = [], err = "";
  try{
    const r = await restaurarApple();
    if(r && r.estado === "cancelado"){ B.busy = false; rerender(); return; }
    lista = (r && r.jws) || [];
  }catch(e){ err = (e && e.message) || String(e); }
  let ok = 0, otra = 0;
  if(lista.length){
    const env = await enviarApple(lista);
    if(!env.ok) err = env.error || "no se pudo conectar";
    ok = env.resultados.filter(x => x && x.ok).length;
    otra = env.resultados.filter(x => x && x.codigo === "otra-cuenta").length;
  }
  await loadBilling();
  B.busy = false; rerender();
  alert(err ? "No se pudieron restaurar las compras: " + err
    : ok && billing().apple ? "Listo: recuperamos tu suscripción de Apple."
    : otra ? "Tu suscripción de Apple es de otra cuenta de GIZE. Entrá con esa cuenta para usarla."
    : "No encontramos una suscripción vigente en tu cuenta de Apple.");
}

async function administrarPlanApple(){
  try{ await administrarApple(); }
  catch(e){ alert("No se pudo abrir la suscripción. Podés manejarla desde los Ajustes de tu cuenta de Apple."); }
  // Al volver (pudo cambiar de plan o cancelar la renovación): se vuelve a mirar.
  await sincronizarApple();
}

// ---- Google Play (app de Android) ----
const PENDIENTE_GOOGLE = "Tu pago quedó pendiente en Google Play. Cuando se acredite, tu plan se activa solo.";
const esPlanGoogle = c => !!(c && c.token && PRODUCTOS_GOOGLE[c.producto]);

// Manda a la función compras-google la compra que dio Google Play ({ token, producto }) o varias
// ({ compras: [...] }, al recuperarlas). { ok, reconocer, resultados, error?, codigo? }
async function enviarGoogle(body){
  try{
    const r = await State.sb.functions.invoke("compras-google", { body });
    if(!r.error) return { ok: Array.isArray(body.compras) || !!(r.data && r.data.ok), reconocer: !!(r.data && r.data.reconocer), resultados: (r.data && r.data.resultados) || [] };
    let j = null; try{ j = await r.error.context.json(); }catch(e){}
    return { ok: false, resultados: [], error: (j && j.error) || (r.error.name === "FunctionsFetchError" ? "No se pudo conectar." : r.error.message), codigo: j && j.codigo };
  }catch(e){ return { ok: false, resultados: [], error: (e && e.message) || String(e) }; }
}
// Varias compras juntas; las que el servidor guardó pero no pudo reconocer las reconoce la app
// (si nadie las reconoce en 3 días, Google devuelve la plata).
async function mandarGoogle(lista){
  const env = await enviarGoogle({ compras: lista.map(c => ({ token: c.token, producto: c.producto })) });
  for(let i = 0; i < lista.length; i++){
    const x = env.resultados[i];
    if(x && x.ok && x.reconocer) { try{ await reconocerGoogle(lista[i].token); }catch(e){} }
  }
  return env;
}

// Una vez por sesión de coach: las compras que llegan solas (una pendiente que se acreditó, una
// renovación) van al servidor, y se miran las suscripciones de este celular.
function iniciarGoogle(){
  if(G.iniciado || !State.cloudUser) return;
  G.iniciado = true;
  escucharGoogle(ev => {
    if(!esPlanGoogle(ev) || ev.estado !== "comprada" || !State.sb || !State.cloudUser) return;
    enviarGoogle({ token: ev.token, producto: ev.producto }).then(r => {
      if(r.ok && r.reconocer) return reconocerGoogle(ev.token).catch(() => {});
    }).then(() => loadBilling()).then(rerender, () => {});
  });
  if(comprasGoogle("planes")) cargarProductosGoogle();
  revisarGoogle(false);
}

// Las suscripciones de planes de este celular: las que el servidor todavía no reconoció (o todas, o la
// del plan si vence en menos de un día, por si Google ya la renovó y el aviso no llegó) van a la
// función. Si la del plan está suspendida, el aviso propio de Google (una vez por sesión).
async function revisarGoogle(todas){
  let lista;
  try{ lista = (await vigentesGoogle()).filter(esPlanGoogle); }catch(e){ return; }
  G.vigentes = lista;
  const r = B.row, mia = r && r.google_token;
  const pronto = !!(r && r.google_vence && new Date(r.google_vence).getTime() - Date.now() < 864e5);
  G.suspendida = lista.some(c => c.suspendida && (!mia || c.token === mia));
  const mandar = lista.filter(c => c.estado === "comprada" && !c.suspendida && (todas || !c.reconocida || (c.token === mia && pronto)));
  if(mandar.length){ await mandarGoogle(mandar); await loadBilling(); }
  rerender();
  if(G.suspendida && !G.aviso){
    G.aviso = true;
    try{ const a = await avisosGoogle(); if(a && a.estado === "actualizada"){ G.aviso = false; await revisarGoogle(true); } }catch(e){}
  }
}

async function comprarPlanGoogle(plan){
  if(!State.sb || !State.cloudUser || B.busy || !comprasGoogle("planes") || G.suspendida) return;
  const b = billing();
  B.busy = plan; A.exito = false; rerender();
  // Cambiar de plan: se reemplaza la suscripción que tiene, que tiene que estar en este celular (si
  // es de otra cuenta de Google, no se puede: pagaría dos).
  let reemplazo = null;
  if(b.google){
    try{ G.vigentes = (await vigentesGoogle()).filter(esPlanGoogle); }catch(e){}
    const vieja = (G.vigentes || []).find(c => c.token === B.row.google_token);
    if(!vieja){ B.busy = false; rerender(); alert(OTRA_GOOGLE); return; }
    const nuevo = PLANS.find(p => p.id === plan);
    reemplazo = { token: vieja.token, producto: vieja.producto, modo: nuevo && nuevo.max > b.max ? "subir" : "bajar" };
  }
  let r;
  try{ r = await comprarGoogle(plan, State.cloudUser.id, reemplazo); }
  catch(e){ B.busy = false; rerender(); alert("No se pudo completar la compra: " + ((e && e.message) || e)); return; }
  // Cerró la hoja de Google sin comprar: nada.
  if(!r || r.estado === "cancelado"){ B.busy = false; rerender(); return; }
  // Google dice que esa suscripción ya es de esta cuenta de Google: se recupera.
  if(r.estado === "ya" || !r.token){ B.busy = false; rerender(); await recuperarPlanesGoogle(); return; }
  const producto = r.producto || productoDelPlanGoogle(plan);
  G.vigentes = (G.vigentes || []).filter(c => !reemplazo || c.token !== reemplazo.token).concat([{ token: r.token, producto, estado: r.estado === "ok" ? "comprada" : "pendiente" }]);
  // La pendiente también va: queda anotada y se activa sola cuando Google cobre.
  const env = await enviarGoogle({ token: r.token, producto });
  if(env.ok && env.reconocer) { try{ await reconocerGoogle(r.token); }catch(e){} }
  await loadBilling();
  B.busy = false;
  const bl = billing();
  if(r.estado === "pendiente" || env.codigo === "pendiente"){ rerender(); alert(PENDIENTE_GOOGLE); return; }
  if(env.ok && bl.paid){
    A.exito = true; rerender();
    alert("¡Listo! Tu plan de " + bl.max + " " + (bl.plan && bl.plan.gym ? "alumnos" : "clientes") + " está activo.");
  } else {
    rerender();
    alert(env.codigo === "otra-cuenta" ? "Esa suscripción de Google Play es de otra cuenta de GIZE. Entrá con esa cuenta para usarla."
      : "Google Play confirmó tu compra, pero todavía no pudimos activar tu plan. Se activa solo en unos minutos; si no, tocá «Recuperar mi suscripción».");
  }
}

async function recuperarPlanesGoogle(){
  if(!State.sb || B.busy) return;
  B.busy = "restaurar"; rerender();
  let lista = null, err = "";
  try{ const r = await restaurarGoogle(); lista = ((r && r.compras) || []).filter(esPlanGoogle); }
  catch(e){ err = (e && e.message) || String(e); }
  if(lista) G.vigentes = lista;
  const compradas = (lista || []).filter(c => c.estado === "comprada");
  let ok = 0, otra = 0;
  if(compradas.length){
    const env = await mandarGoogle(compradas);
    if(!env.ok) err = env.error || "no se pudo conectar";
    ok = env.resultados.filter(x => x && x.ok).length;
    otra = env.resultados.filter(x => x && x.codigo === "otra-cuenta").length;
  }
  await loadBilling();
  B.busy = false; rerender();
  alert(err ? "No se pudo recuperar tu suscripción: " + err
    : ok && billing().google ? "Listo: recuperamos tu suscripción de Google Play."
    : otra ? "Tu suscripción de Google Play es de otra cuenta de GIZE. Entrá con esa cuenta para usarla."
    : (lista || []).some(c => c.estado === "pendiente") ? PENDIENTE_GOOGLE
    : "No encontramos una suscripción vigente en tu cuenta de Google Play.");
}

// «Administrar en Google Play»: abre la suscripción en Play Store. Al volver a la app (pudo cancelar
// la renovación o arreglar el pago), se vuelve a mirar.
async function administrarPlanGoogle(){
  const r = B.row, b = billing();
  const mia = r && r.google_token && (G.vigentes || []).find(c => c.token === r.google_token);
  try{ await administrarGoogle((mia && mia.producto) || productoDelPlanGoogle(b.plan && b.plan.id)); G.volver = true; }
  catch(e){ alert("No se pudo abrir Google Play. Podés manejar tu suscripción desde Play Store → Pagos y suscripciones → Suscripciones."); }
}
document.addEventListener("visibilitychange", () => {
  if(document.visibilityState === "visible" && G.volver){ G.volver = false; revisarGoogle(true); }
});

async function unlinkClient(id){
  const c = CoachState.coachClients.find(x => x.id === id); if(!c) return;
  if(!await confirmar("¿Desvincular a " + (c.full_name || "este cliente") + "? Deja de verte como coach; sus datos quedan en su cuenta.")) return;
  B.busy = true; rerender();
  try{
    const r = await State.sb.rpc("coach_remove_client", { client: id });
    if(r.error) throw r.error;
    CoachState.coachClients = CoachState.coachClients.filter(x => x.id !== id);
    await loadBilling(); // el cupo usado (seats_used) lo cuenta la base
  }catch(e){ alert("No se pudo desvincular: " + ((e && e.message) || e)); }
  B.busy = false; rerender();
}

// Pagar con tarjeta: la función suscripcion arma la suscripción de Mercado Pago y devuelve
// el link de pago. Al volver (?pago=mp), checkPaymentReturn espera a que se confirme.
async function choose(plan){
  const input = document.querySelector('[data-plan="mail"]');
  const mail = ((input ? input.value : (B.mpEmail != null ? B.mpEmail : ((State.cloudUser && State.cloudUser.email) || ""))) || "").trim();
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)){ B.mailOpen = true; rerender(); alert("Poné el mail de tu cuenta de Mercado Pago."); return; }
  B.mpEmail = mail; B.busy = plan; rerender();
  let err = "";
  try{
    // El código va solo si lo acaba de aplicar: el precio lo decide el servidor, no la app.
    const body = { action: "checkout", plan, mp_email: mail };
    if(COD.codigo) body.codigo = COD.codigo;
    const r = await State.sb.functions.invoke("suscripcion", { body });
    if(r.error){
      try{ const j = await r.error.context.json(); err = j && j.error; }catch(e){}
      err = err || (r.error.name === "FunctionsFetchError" ? "No se pudo conectar con el sistema de pagos." : r.error.message);
    } else if(r.data && r.data.url){ window.location.href = r.data.url; return; }
    else err = "Mercado Pago no devolvió el link de pago.";
  }catch(e){ err = (e && e.message) || String(e); }
  // Lo más común es que el mail no sea el de su cuenta de Mercado Pago: se muestra el campo.
  B.busy = false; B.mailOpen = true; rerender();
  alert("No se pudo abrir el pago: " + err + "\n\nTambién podés pagar por transferencia.");
}

async function cancelRenewal(){
  const b = billing();
  if(!await confirmar("¿Cancelar la renovación? Tu plan sigue activo hasta el " + fmtDate(ymd(b.until)) + " y después se corta.")) return;
  const r = await State.sb.functions.invoke("suscripcion", { body: { action: "cancel" } });
  if(r.error){ alert("No se pudo cancelar. Probá de nuevo o cancelala desde Mercado Pago → Suscripciones."); return; }
  await loadBilling(); rerender();
}

function rerender(){ renderPlanSheet(); renderCoach(); }

// Vuelta de Mercado Pago (?pago=mp): el aviso del pago llega a la función en segundos,
// así que se relee el plan unas veces hasta verlo activo.
export async function checkPaymentReturn(){
  if(IS_NATIVE) return;
  const u = new URL(location.href);
  if(!u.searchParams.has("pago") || u.searchParams.get("pago") === "iaplus") return; // IA Plus: ui/ia-plus.js
  u.searchParams.delete("pago"); u.searchParams.delete("preapproval_id");
  history.replaceState(null, "", u.pathname + (u.search || "") + u.hash);
  B.confirming = true; renderCoach();
  for(let i = 0; i < 12; i++){
    await new Promise(r => setTimeout(r, 4000));
    await loadBilling();
    // El plan se activa cuando Mercado Pago confirma el cobro (el servidor borra pending):
    // antes alcanzaba con "paid", que ya era true con el plan anterior al cambiar de plan.
    if(billing().paid && !billing().pending) break;
  }
  B.confirming = false; renderCoach();
  const bl = billing();
  if(bl.paid && !bl.pending) alert("¡Listo! Tu plan de " + bl.max + " clientes está activo.");
  else alert("Mercado Pago todavía no confirmó el cobro. Tu plan se activa solo apenas se acredite: podés seguir usando la app.");
}

// gym: { usados } para el dueño de un gimnasio (solo los planes de gimnasio); sin eso, como siempre.
export function openPlan(gym){ if(sinPlanes()) return; B.gym = gym && typeof gym === "object" && !(gym instanceof Event) ? gym : null; B.open = true; A.exito = false; renderPlanSheet(); const T = tienda(); if(T && T.vende() && !T.prods()) cargarPlanes(T); }

document.body.addEventListener("click", e => {
  const b = e.target.closest("[data-plan]"); if(!b || b.disabled) return;
  const a = b.dataset.plan;
  if(a === "open"){ openPlan(); return; }
  if(a === "close"){ B.open = false; renderPlanSheet(); return; }
  if(a === "cancel"){ cancelRenewal(); return; }
  if(a === "choose"){ if(IAP) comprarPlanApple(b.dataset.id); else if(googlePlay()) comprarPlanGoogle(b.dataset.id); else if(!IS_NATIVE) choose(b.dataset.id); return; }
  if(a === "apple-restore"){ if(IAP) restaurarPlanesApple(); return; }
  if(a === "apple-manage"){ if(IAP) administrarPlanApple(); return; }
  if(a === "apple-retry"){ if(IAP){ A.fallo = false; cargarPlanes(T_APPLE); } return; }
  if(a === "google-restore"){ if(googlePlay()) recuperarPlanesGoogle(); return; }
  if(a === "google-manage"){ if(googlePlay()) administrarPlanGoogle(); return; }
  if(a === "google-retry"){ if(googlePlay()){ A.fallo = false; cargarPlanes(T_GOOGLE); } return; }
  if(a === "codigo-abrir"){ if(IS_NATIVE) return; COD.open = true; rerender(); const i = document.querySelector('[data-plan="codigo"]'); if(i) i.focus(); return; }
  if(a === "codigo-aplicar"){ if(!IS_NATIVE) aplicarCodigo(); return; }
  if(a === "mail-edit"){ B.mailOpen = true; renderPlanSheet(); const i = document.querySelector('[data-plan="mail"]'); if(i) i.focus(); return; }
  if(a === "unlink"){ unlinkClient(b.dataset.id); return; }
});

document.body.addEventListener("input", e => {
  const i = e.target.closest && e.target.closest('[data-plan="mail"]'); if(i) B.mpEmail = i.value;
  const c = e.target.closest && e.target.closest('[data-plan="codigo"]'); if(c){ COD.texto = c.value; if(COD.error){ COD.error = ""; const er = document.querySelector('.pl-cod-err'); if(er) er.remove(); } }
});

// Enter en el código: aplicar.
document.body.addEventListener("keydown", e => {
  if(e.key === "Enter" && e.target.closest && e.target.closest('[data-plan="codigo"]') && !IS_NATIVE){ e.preventDefault(); aplicarCodigo(); }
});
