// Plan del coach: 14 días de prueba y después un plan mensual que define cuántos clientes
// puede tener. Dos formas de pagar (solo en la web):
//   · Con tarjeta por Mercado Pago: suscripción que se cobra y se renueva sola cada mes
//     (función suscripcion), y se cancela desde acá cuando quiera.
//   · Por transferencia: lo arregla con el equipo de GIZE por WhatsApp y un administrador lo
//     habilita desde gize.ar/admin (supabase/cobro-manual.sql). Se renueva a mano cada mes.
// Los límites los hace cumplir la base, no la app.
//
// En las apps de Android y iPhone no hay precios, links ni botones para contratar: Apple y
// Google no permiten mandar a pagar por fuera de su sistema. En Android solo se ve el estado.
// En la app de iPhone (core/tienda.js) ni eso: las cuentas de coach se manejan solo desde la
// web, así que no hay tira, ni «Mi plan», ni prueba, ni planes. Si la cuenta no está activa,
// una pantalla neutra con «Cerrar sesión»; el tope de alumnos se sigue respetando, sin
// nombrar el plan.

import { State } from '../../core/state.js';

import { esc, fmtDate } from '../../core/utils.js';

import { CoachState } from './state.js';

import { renderCoach } from './index.js';

import { appIOS } from '../../core/tienda.js';

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

const IS_NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const IS_IOS = appIOS();
const money = n => "$" + Number(n).toLocaleString("es-AR");
// WhatsApp de GIZE (el mismo de Configuración → Contacto).
const WA = "5493413490705";
function waLink(p, renew){
  const mail = (State.cloudUser && State.cloudUser.email) || "";
  const txt = "Hola! Quiero " + (renew ? "renovar" : "contratar") + " GIZE para coaches, el plan " + (p.gym ? p.name + " (hasta " + p.max + " alumnos)" : "de hasta " + p.max + " clientes") +
    " (" + money(p.price) + "/mes)." + (mail ? " Mi cuenta es " + mail + "." : "");
  return "https://wa.me/" + WA + "?text=" + encodeURIComponent(txt);
}
// Más de 500 alumnos: plan a medida.
function waCustom(){
  const mail = (State.cloudUser && State.cloudUser.email) || "";
  return "https://wa.me/" + WA + "?text=" + encodeURIComponent("Hola! Quiero un plan a medida de GIZE para un gimnasio de más de 500 alumnos." + (mail ? " Mi cuenta es " + mail + "." : ""));
}

// billing: la fila de coach_billing. null + missing = todavía no se corrió el SQL (no se
// bloquea nada en ese caso, así la app sigue andando mientras se configura).
const B = { row: null, missing: false, loaded: false, busy: false, open: false, confirming: false, mpEmail: null, mailOpen: false };

export async function loadBilling(){
  if(!State.sb || !State.cloudUser) return;
  try{
    const r = await State.sb.from("coach_billing").select("*").eq("coach_id", State.cloudUser.id).maybeSingle();
    if(r.error){ B.missing = true; B.row = null; }
    else { B.missing = !r.data; B.row = r.data || null; }
  }catch(e){ B.missing = true; }
  B.loaded = true;
}

export function billing(){
  const r = B.row, now = Date.now();
  const count = CoachState.coachClients.length;
  if(!r) return { known: false, active: true, count, max: Infinity, atCap: false };
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
  return {
    known: true, active, trial, paid, comp, count, max, overCap,
    atCap: count >= max,
    daysLeft: trialEnd > now ? Math.max(1, Math.ceil((trialEnd - now) / 864e5)) : 0,
    // Pagó antes de que termine la prueba: el plan arranca cuando la prueba termina.
    trialFirst: paid && !comp && trialEnd > now,
    plan: PLANS.find(p => p.id === r.plan) || null,
    until: paid ? r.paid_until : (trial ? r.trial_ends_at : null),
    renews: r.mp_status === "authorized",
    pending: r.pending_plan,
  };
}

// Último día cubierto: el pago manual vence a las 00:00 del día siguiente (supabase/cobro-manual.sql).
// En hora de Argentina (la del cobro), aunque el celular esté en otro huso horario.
const AR_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" });
function ymd(iso){ return AR_DAY.format(new Date(new Date(iso).getTime() - 1)); }

// Tira debajo del código de invitación.
export function renderPlanBanner(){
  const b = billing(); if(!b.known || IS_IOS) return "";
  let txt, cls = "";
  if(b.comp) txt = "Plan cortesía · " + b.count + "/" + b.max + " clientes";
  else if(b.trial){ txt = "Prueba gratis · te quedan <b>" + b.daysLeft + " día" + (b.daysLeft === 1 ? "" : "s") + "</b> · " + b.count + "/" + b.max + " clientes"; if(b.daysLeft <= 3) cls = " warn"; }
  else if(b.trialFirst) txt = "Prueba gratis · te quedan <b>" + b.daysLeft + " día" + (b.daysLeft === 1 ? "" : "s") + "</b> · después sigue tu plan · " + b.count + "/" + b.max + " clientes";
  else if(b.paid) txt = (b.plan && b.plan.gym ? "Plan " + b.plan.name : b.max >= 100 ? "Plan Gimnasio" : "Plan " + b.max + " clientes") + " · " + b.count + "/" + b.max + (b.renews ? "" : " · vence el " + fmtDate(ymd(b.until)));
  else { txt = "Sin plan vigente"; cls = " warn"; }
  return '<button class="pl-banner' + cls + (b.atCap ? " warn" : "") + '" data-plan="open"><span>' + txt + '</span><span class="pl-banner-go">' + (b.trial && !IS_NATIVE ? "Ver planes" : "Mi plan") + ' ›</span></button>';
}

function planCards(b){
  // En las apps de las tiendas no se habla de pagos ni de dónde se paga (reglas de Apple y Google).
  if(IS_NATIVE) return '';
  const chosen = b.paid ? null : chosenPlan();
  const cards = PLANS.map(p => {
    const current = b.paid && b.plan && b.plan.id === p.id;
    const tooSmall = b.count > p.max;
    // El que eligió en la página de inicio va destacado (en lugar del "Más elegido").
    const mine = chosen === p.id, hi = chosen ? mine : p.best;
    return '<div class="pl-card' + (hi ? " best" : "") + (mine ? " chosen" : "") + (current ? " current" : "") + '">' +
      (mine ? '<div class="pl-tag">El que elegiste</div>' : hi ? '<div class="pl-tag">Más elegido</div>' : '') +
      (p.gym ? '<div class="pl-name">' + esc(p.name) + '</div>' : '') +
      '<div class="pl-max">Hasta <b>' + p.max + '</b> ' + (p.gym ? 'alumnos' : 'clientes') + '</div>' +
      '<div class="pl-price">' + money(p.price) + '<span>/mes</span></div>' +
      (current && b.renews ? '<button class="pl-choose" disabled>Tu plan actual</button>'
        : tooSmall ? '<button class="pl-choose" disabled>Tenés ' + b.count + ' clientes</button>'
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
  return '<div class="pl-cards">' + cards + '</div>' + mailBox +
    '<div class="pl-fine"><b>Con tarjeta</b> (Mercado Pago): se cobra y se renueva sola cada mes, y la cancelás cuando quieras.</div>' +
    '<div class="pl-fine"><b>Por transferencia:</b> lo arreglás por WhatsApp con el equipo de GIZE y te habilitamos el plan apenas se acredita. Se renueva a mano cada mes; si un mes no seguís, no se cobra nada más.</div>' +
    '<div class="pl-fine">¿Más de 500 alumnos? <a class="pl-link" href="' + esc(waCustom()) + '" target="_blank" rel="noopener">Hablemos</a> y armamos un plan a medida.</div>';
}

function statusLine(b){
  if(!b.known) return "";
  if(b.comp) return '<div class="pl-status ok">Tenés un plan de cortesía, sin vencimiento.</div>';
  if(b.trialFirst) return '<div class="pl-status ok">Tu plan de ' + b.max + ' clientes ya está pago. Primero termina tu prueba gratis (te quedan ' + b.daysLeft + ' día' + (b.daysLeft === 1 ? '' : 's') + ') y después arranca el plan, al día hasta el ' + fmtDate(ymd(b.until)) + '.</div>';
  if(b.paid) return '<div class="pl-status ok">' + (b.plan && b.plan.gym ? 'Plan ' + b.plan.name + ' (' + b.max + ' alumnos)' : 'Plan de ' + b.max + ' clientes') + ' · ' + (b.renews ? 'se renueva solo cada mes' : 'al día hasta el ' + fmtDate(ymd(b.until))) + '.</div>';
  const ch = !IS_NATIVE && PLANS.find(p => p.id === chosenPlan());
  if(b.trial) return '<div class="pl-status">Estás en la prueba gratis: te quedan ' + b.daysLeft + ' día' + (b.daysLeft === 1 ? '' : 's') + ' (hasta ' + b.max + ' clientes).' +
    (IS_NATIVE ? '' : ch ? ' Elegiste el plan ' + (ch.gym ? ch.name : 'de hasta ' + ch.max + ' clientes') + ': contratalo cuando quieras para seguir después de la prueba.' : ' Elegí un plan y contratalo para seguir después.') + '</div>';
  return '<div class="pl-status warn">Tu ' + (B.row && B.row.paid_until ? 'plan venció' : 'prueba gratis terminó') + '.</div>';
}

// Hoja "Mi plan" (desde la tira o desde Configuración).
export function renderPlanSheet(){
  let host = document.getElementById("planSheetHost");
  if(!host){ host = document.createElement("div"); host.id = "planSheetHost"; document.body.appendChild(host); }
  if(!B.open || IS_IOS){ host.innerHTML = ""; return; }
  const b = billing();
  const cancel = (!IS_NATIVE && b.paid && b.renews) ? '<button class="pl-cancel" data-plan="cancel">Cancelar la renovación</button>' : "";
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
  return '<div class="pl-wall-s pl-wall-grace">Tenés hasta el ' + fmtDate(ymd(new Date(limit).toISOString())) + ' para renovar. Después, tus clientes pasan a usar GIZE por su cuenta, con todo lo que les armaste.</div>';
}

// Pantalla completa cuando no hay prueba ni plan vigente.
export function renderPaywall(){
  const b = billing();
  if(b.overCap) return renderOverCap(b);
  if(IS_IOS) return renderInactiveIOS();
  return '<div class="co-wrap pl-wall">' +
    '<div class="co-head"><div class="co-brand"><img class="brand-logo" src="brand/logo/gize-firma-horizontal.svg" alt="GIZE"><span class="co-brand-dash">-</span><span class="co-brand-tag">Panel de coach</span></div><div class="co-head-actions"><button class="co-logout" data-auth="logout">Salir</button></div></div>' +
    '<div class="pl-wall-hero"><div class="pl-wall-t">' + (B.row && B.row.paid_until ? 'Tu plan venció' : 'Terminó tu prueba gratis') + '</div>' +
    '<div class="pl-wall-s">Tus ' + b.count + ' cliente' + (b.count === 1 ? '' : 's') + ', rutinas y registros están guardados. ' +
    (IS_NATIVE ? 'Para volver a verlos, hablá con el equipo de GIZE.' : 'Elegí un plan para volver a verlos y seguir sumando clientes: con tarjeta se renueva solo cada mes.') + '</div>' +
    graceLine(b) +
    (B.confirming ? '<div class="pl-status">Confirmando tu pago con Mercado Pago…</div>' : '') + '</div>' +
    planCards(b) +
  '</div>';
}

// App de iPhone: cuenta de coach sin prueba ni plan vigente. Sin nombrar la prueba, el plan,
// precios ni adónde ir: solo que no está activa y «Cerrar sesión».
function renderInactiveIOS(){
  return '<div class="co-wrap pl-wall">' +
    '<div class="co-head"><div class="co-brand"><img class="brand-logo" src="brand/logo/gize-firma-horizontal.svg" alt="GIZE"><span class="co-brand-dash">-</span><span class="co-brand-tag">Panel de coach</span></div><div class="co-head-actions"><button class="co-logout" data-auth="logout">Salir</button></div></div>' +
    '<div class="pl-wall-hero"><div class="pl-wall-t">Tu cuenta de coach no está activa en este momento.</div>' +
    '<button class="pl-choose pl-wall-out" data-auth="logout">Cerrar sesión</button></div>' +
  '</div>';
}

// Tiene más clientes que los de su plan: se pasa a uno más grande o desvincula clientes.
// En iPhone, lo mismo sin nombrar el plan: «el máximo de alumnos de tu cuenta».
function renderOverCap(b){
  const extra = b.count - b.max;
  const list = CoachState.coachClients.map(c => '<div class="pl-oc-row"><span>' + esc(c.full_name || "Cliente") + '</span>' +
    '<button class="pl-link" data-plan="unlink" data-id="' + esc(c.id) + '"' + (B.busy ? ' disabled' : '') + '>Desvincular</button></div>').join("");
  return '<div class="co-wrap pl-wall">' +
    '<div class="co-head"><div class="co-brand"><img class="brand-logo" src="brand/logo/gize-firma-horizontal.svg" alt="GIZE"><span class="co-brand-dash">-</span><span class="co-brand-tag">Panel de coach</span></div><div class="co-head-actions"><button class="co-logout" data-auth="logout">Salir</button></div></div>' +
    '<div class="pl-wall-hero"><div class="pl-wall-t">' + (IS_IOS ? 'Tenés más alumnos que el máximo de tu cuenta' : 'Tenés más clientes que tu plan') + '</div>' +
    '<div class="pl-wall-s">' + (IS_IOS ? 'Tenés ' + b.count + ' alumnos y el máximo de tu cuenta es ' + b.max + '. ' : 'Tenés ' + b.count + ' clientes y tu plan es de ' + b.max + '. ') +
    (IS_NATIVE ? 'Desvinculá ' : 'Contratá un plan más grande o desvinculá ') + extra + ' cliente' + (extra === 1 ? '' : 's') + ' para volver a ver sus fichas. Sus rutinas y registros quedan guardados.</div></div>' +
    planCards(b) +
    '<div class="pl-oc"><div class="pl-sub">Tus clientes</div>' + list + '</div>' +
  '</div>';
}

async function unlinkClient(id){
  const c = CoachState.coachClients.find(x => x.id === id); if(!c) return;
  if(!confirm("¿Desvincular a " + (c.full_name || "este cliente") + "? Deja de verte como coach; sus datos quedan en su cuenta.")) return;
  B.busy = true; rerender();
  try{
    const r = await State.sb.rpc("coach_remove_client", { client: id });
    if(r.error) throw r.error;
    CoachState.coachClients = CoachState.coachClients.filter(x => x.id !== id);
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
    const r = await State.sb.functions.invoke("suscripcion", { body: { action: "checkout", plan, mp_email: mail } });
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
  if(!confirm("¿Cancelar la renovación? Tu plan sigue activo hasta el " + fmtDate(ymd(b.until)) + " y después se corta.")) return;
  const r = await State.sb.functions.invoke("suscripcion", { body: { action: "cancel" } });
  if(r.error){ alert("No se pudo cancelar. Probá de nuevo o cancelala desde Mercado Pago → Suscripciones."); return; }
  await loadBilling(); rerender();
}

function rerender(){ renderPlanSheet(); renderCoach(); }

// Vuelta de Mercado Pago (?pago=mp): el aviso del pago llega a la función en segundos,
// así que se relee el plan unas veces hasta verlo activo.
export async function checkPaymentReturn(){
  if(IS_IOS) return;
  const u = new URL(location.href);
  if(!u.searchParams.has("pago")) return;
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

export function openPlan(){ if(IS_IOS) return; B.open = true; renderPlanSheet(); }

document.body.addEventListener("click", e => {
  const b = e.target.closest("[data-plan]"); if(!b || b.disabled) return;
  const a = b.dataset.plan;
  if(a === "open"){ openPlan(); return; }
  if(a === "close"){ B.open = false; renderPlanSheet(); return; }
  if(a === "cancel"){ cancelRenewal(); return; }
  if(a === "choose"){ if(!IS_NATIVE) choose(b.dataset.id); return; }
  if(a === "mail-edit"){ B.mailOpen = true; renderPlanSheet(); const i = document.querySelector('[data-plan="mail"]'); if(i) i.focus(); return; }
  if(a === "unlink"){ unlinkClient(b.dataset.id); return; }
});

document.body.addEventListener("input", e => {
  const i = e.target.closest && e.target.closest('[data-plan="mail"]'); if(i) B.mpEmail = i.value;
});
