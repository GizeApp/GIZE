// Plan del coach: 14 días de prueba y después una suscripción mensual por Mercado Pago
// que define cuántos clientes puede tener (supabase/suscripciones.sql y
// supabase/functions/suscripcion). Acá solo se muestra el estado y se manda a pagar:
// los límites los hace cumplir la base, no la app.
//
// Dentro de la app de Android (Capacitor) no hay botones de pago: Google Play no permite
// cobrar suscripciones digitales por fuera de su sistema. Ahí solo se ve el estado.

import { State } from '../../core/state.js';

import { esc, fmtDate } from '../../core/utils.js';

import { CoachState } from './state.js';

import { renderCoach } from './index.js';

// Precios: los que cobra de verdad la función (PLANES en suscripcion/index.ts).
export const PLANS = [
  { id: "p10", max: 10, price: 9300 },
  { id: "p25", max: 25, price: 15000, best: true },
  { id: "p50", max: 50, price: 20000 },
  { id: "p100", max: 100, price: 33000, gym: true },
];
const TRIAL_MAX = 10;

const IS_NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
// Ícono de Mercado Pago (Simple Icons, CC0). Solo identifica el medio de pago.
const MP_ICON = '<svg class="mp-ic" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M11.115 16.479a.93.927 0 0 1-.939-.886c-.002-.042-.006-.155-.103-.155-.04 0-.074.023-.113.059-.112.103-.254.206-.46.206a.816.814 0 0 1-.305-.066c-.535-.214-.542-.578-.521-.725.006-.038.007-.08-.02-.11l-.032-.03h-.034c-.027 0-.055.012-.093.039a.788.786 0 0 1-.454.16.7.699 0 0 1-.253-.05c-.708-.27-.65-.928-.617-1.126.005-.041-.005-.072-.03-.092l-.05-.04-.047.043a.728.726 0 0 1-.505.203.73.728 0 0 1-.732-.725c0-.4.328-.722.732-.722.364 0 .675.27.721.63l.026.195.11-.165c.01-.018.307-.46.852-.46.102 0 .21.016.316.05.434.13.508.52.519.68.008.094.075.1.09.1.037 0 .064-.024.083-.045a.746.744 0 0 1 .54-.225c.128 0 .263.03.402.09.69.293.379 1.158.374 1.167-.058.144-.061.207-.005.244l.027.013h.02c.03 0 .07-.014.134-.035.093-.032.235-.08.367-.08a.944.942 0 0 1 .94.93.936.934 0 0 1-.94.928zm7.302-4.171c-1.138-.98-3.768-3.24-4.481-3.77-.406-.302-.685-.462-.928-.533a1.559 1.554 0 0 0-.456-.07c-.182 0-.376.032-.58.095-.46.145-.918.505-1.362.854l-.023.018c-.414.324-.84.66-1.164.73a1.986 1.98 0 0 1-.43.049c-.362 0-.687-.104-.81-.258-.02-.025-.007-.066.04-.125l.008-.008 1-1.067c.783-.774 1.525-1.506 3.23-1.545h.085c1.062 0 2.12.469 2.24.524a7.03 7.03 0 0 0 3.056.724c1.076 0 2.188-.263 3.354-.795a9.135 9.11 0 0 0-.405-.317c-1.025.44-2.003.66-2.946.66-.962 0-1.925-.229-2.858-.68-.05-.022-1.22-.567-2.44-.57-.032 0-.065 0-.096.002-1.434.033-2.24.536-2.782.976-.528.013-.982.138-1.388.25-.361.1-.673.186-.979.185-.125 0-.35-.01-.37-.012-.35-.01-2.115-.437-3.518-.962-.143.1-.28.203-.415.31 1.466.593 3.25 1.053 3.812 1.089.157.01.323.027.491.027.372 0 .744-.103 1.104-.203.213-.059.446-.123.692-.17l-.196.194-1.017 1.087c-.08.08-.254.294-.14.557a.705.703 0 0 0 .268.292c.243.162.677.27 1.08.271.152 0 .297-.015.43-.044.427-.095.874-.448 1.349-.82.377-.296.913-.672 1.323-.782a1.494 1.49 0 0 1 .37-.05.611.61 0 0 1 .095.005c.27.034.533.125 1.003.472.835.62 4.531 3.815 4.566 3.846.002.002.238.203.22.537-.007.186-.11.352-.294.466a.902.9 0 0 1-.484.15.804.802 0 0 1-.428-.124c-.014-.01-1.28-1.157-1.746-1.543-.074-.06-.146-.115-.22-.115a.122.122 0 0 0-.096.045c-.073.09.01.212.105.294l1.48 1.47c.002 0 .184.17.204.395.012.244-.106.447-.35.606a.957.955 0 0 1-.526.171.766.764 0 0 1-.42-.127l-.214-.206a21.035 20.978 0 0 0-1.08-1.009c-.072-.058-.148-.112-.221-.112a.127.127 0 0 0-.094.038c-.033.037-.056.103.028.212a.698.696 0 0 0 .075.083l1.078 1.198c.01.01.222.26.024.511l-.038.048a1.18 1.178 0 0 1-.1.096c-.184.15-.43.164-.527.164a.8.798 0 0 1-.147-.012c-.106-.018-.178-.048-.212-.089l-.013-.013c-.06-.06-.602-.609-1.054-.98-.059-.05-.133-.11-.21-.11a.128.128 0 0 0-.096.042c-.09.096.044.24.1.293l.92 1.003a.204.204 0 0 1-.033.062c-.033.044-.144.155-.479.196a.91.907 0 0 1-.122.007c-.345 0-.712-.164-.902-.264a1.343 1.34 0 0 0 .13-.576 1.368 1.365 0 0 0-1.42-1.357c.024-.342-.025-.99-.697-1.274a1.455 1.452 0 0 0-.575-.125c-.146 0-.287.025-.42.075a1.153 1.15 0 0 0-.671-.564 1.52 1.515 0 0 0-.494-.085c-.28 0-.537.08-.767.242a1.168 1.165 0 0 0-.903-.43 1.173 1.17 0 0 0-.82.335c-.287-.217-1.425-.93-4.467-1.613a17.39 17.344 0 0 1-.692-.189 4.822 4.82 0 0 0-.077.494l.67.157c3.108.682 4.136 1.391 4.309 1.525a1.145 1.142 0 0 0-.09.442 1.16 1.158 0 0 0 1.378 1.132c.096.467.406.821.879 1.003a1.165 1.162 0 0 0 .415.08c.09 0 .179-.012.266-.034.086.22.282.493.722.668a1.233 1.23 0 0 0 .457.094c.122 0 .241-.022.355-.063a1.373 1.37 0 0 0 1.269.841c.37.002.726-.147.985-.41.221.121.688.341 1.163.341.06 0 .118-.002.175-.01.47-.059.689-.24.789-.382a.571.57 0 0 0 .048-.078c.11.032.234.058.373.058.255 0 .501-.086.75-.265.244-.174.418-.424.444-.637v-.01c.083.017.167.026.251.026.265 0 .527-.082.773-.242.48-.31.562-.715.554-.98a1.28 1.279 0 0 0 .978-.194 1.04 1.04 0 0 0 .502-.808 1.088 1.085 0 0 0-.16-.653c.804-.342 2.636-1.003 4.795-1.483a4.734 4.721 0 0 0-.067-.492 27.742 27.667 0 0 0-5.049 1.62zm5.123-.763c0 4.027-5.166 7.293-11.537 7.293-6.372 0-11.538-3.266-11.538-7.293 0-4.028 5.165-7.293 11.539-7.293 6.371 0 11.537 3.265 11.537 7.293zm.46.004c0-4.272-5.374-7.755-12-7.755S.002 7.277.002 11.55L0 12.004c0 4.533 4.695 8.203 11.999 8.203 7.347 0 12-3.67 12-8.204z"/></svg>';
const mpBadge = '<span class="mp-badge">' + MP_ICON + '<span>Pagás seguro con <b>Mercado Pago</b></span></span>';
const money = n => "$" + Number(n).toLocaleString("es-AR");

// billing: la fila de coach_billing. null + missing = todavía no se corrió el SQL (no se
// bloquea nada en ese caso, así la app sigue andando mientras se configura).
// mailOpen: el campo del mail de Mercado Pago se muestra solo si el coach quiere usar otro
// (por defecto va el mail de su cuenta de GIZE, que es el caso más común).
const B = { row: null, missing: false, loaded: false, busy: false, open: false, mpEmail: null, mailOpen: false, confirming: false };

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
    daysLeft: trial ? Math.max(1, Math.ceil((trialEnd - now) / 864e5)) : 0,
    plan: PLANS.find(p => p.id === r.plan) || null,
    until: paid ? r.paid_until : (trial ? r.trial_ends_at : null),
    renews: r.mp_status === "authorized",
    pending: r.pending_plan,
  };
}

function ymd(iso){ const d = new Date(iso); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }

// Tira debajo del código de invitación.
export function renderPlanBanner(){
  const b = billing(); if(!b.known) return "";
  let txt, cls = "";
  if(b.comp) txt = "Plan cortesía · " + b.count + "/" + b.max + " clientes";
  else if(b.trial){ txt = "Prueba gratis · te quedan <b>" + b.daysLeft + " día" + (b.daysLeft === 1 ? "" : "s") + "</b> · " + b.count + "/" + b.max + " clientes"; if(b.daysLeft <= 3) cls = " warn"; }
  else txt = (b.max >= 100 ? "Plan Gimnasio" : "Plan " + b.max + " clientes") + " · " + b.count + "/" + b.max + (b.renews ? "" : " · vence el " + fmtDate(ymd(b.until)));
  const cap = b.atCap ? '<div class="pl-cap">Llegaste al máximo de tu plan: nadie más se puede vincular con tu código. ' + (IS_NATIVE ? '' : 'Pasate a un plan más grande.') + '</div>' : "";
  return '<button class="pl-banner' + cls + (b.atCap ? " warn" : "") + '" data-plan="open"><span>' + txt + '</span><span class="pl-banner-go">' + (b.trial && !IS_NATIVE ? "Ver planes" : "Mi plan") + ' ›</span></button>' + cap;
}

function planCards(b){
  // En las apps de las tiendas no se habla de pagos ni de dónde se paga (reglas de Apple y Google).
  if(IS_NATIVE) return '';
  const mail = B.mpEmail != null ? B.mpEmail : ((State.cloudUser && State.cloudUser.email) || "");
  const cards = PLANS.map(p => {
    const current = b.paid && b.plan && b.plan.id === p.id && b.renews;
    const tooSmall = b.count > p.max;
    const dis = current || tooSmall || B.busy;
    return '<div class="pl-card' + (p.best ? " best" : "") + (current ? " current" : "") + '">' +
      (p.best ? '<div class="pl-tag">Más elegido</div>' : '') +
      (p.gym ? '<div class="pl-name">Gimnasio</div>' : '') +
      '<div class="pl-max">Hasta <b>' + p.max + '</b> ' + (p.gym ? 'alumnos' : 'clientes') + '</div>' +
      '<div class="pl-price">' + money(p.price) + '<span>/mes</span></div>' +
      '<button class="pl-choose" data-plan="choose" data-id="' + p.id + '"' + (dis ? " disabled" : "") + '>' +
        (current ? "Tu plan actual" : tooSmall ? "Tenés " + b.count + " clientes" : B.busy === p.id ? "Abriendo Mercado Pago…" : "Elegir") + '</button>' +
    '</div>';
  }).join("");
  const mailBox = B.mailOpen
    ? '<div class="cs-field pl-mail"><label>Mail de tu cuenta de Mercado Pago</label>' +
      '<input class="co-note" type="email" data-plan="mail" value="' + esc(mail) + '" placeholder="tu-mail@ejemplo.com" autocomplete="email">' +
      '<div class="pl-fine">Tiene que ser el mail con el que entrás a Mercado Pago para pagar.</div></div>'
    : '<div class="pl-fine pl-mail-line">Pagás con la cuenta de Mercado Pago de <b>' + esc(mail) + '</b> · <button class="pl-link" data-plan="mail-edit">¿Otro mail?</button></div>';
  return '<div class="pl-cards">' + cards + '</div>' + '<div class="pl-mp">' + mpBadge + '</div>' + mailBox +
    '<div class="pl-fine">Se cobra una vez por mes con tarjeta o dinero en cuenta, y lo podés cancelar cuando quieras.</div>' +
    '<div class="pl-fine">¿Más de 100 alumnos? <a class="pl-link" href="mailto:contacto@gize.ar?subject=GIZE%20para%20mi%20gimnasio">Escribinos</a> y armamos un plan a medida.</div>';
}

function statusLine(b){
  if(!b.known) return "";
  if(b.comp) return '<div class="pl-status ok">Tenés un plan de cortesía, sin vencimiento.</div>';
  if(b.paid) return '<div class="pl-status ok">Plan de ' + b.max + ' clientes · ' + (b.renews ? 'se renueva solo cada mes' : 'cancelado, sigue activo hasta el ' + fmtDate(ymd(b.until))) + '.</div>';
  if(b.trial) return '<div class="pl-status">Estás en la prueba gratis: te quedan ' + b.daysLeft + ' día' + (b.daysLeft === 1 ? '' : 's') + ' (hasta ' + TRIAL_MAX + ' clientes).' + (IS_NATIVE ? '' : ' Elegí un plan para seguir después.') + '</div>';
  return '<div class="pl-status warn">Tu ' + (B.row && B.row.paid_until ? 'plan venció' : 'prueba gratis terminó') + '.</div>';
}

// Hoja "Mi plan" (desde la tira o desde Configuración).
export function renderPlanSheet(){
  let host = document.getElementById("planSheetHost");
  if(!host){ host = document.createElement("div"); host.id = "planSheetHost"; document.body.appendChild(host); }
  if(!B.open){ host.innerHTML = ""; return; }
  const b = billing();
  const cancel = (!IS_NATIVE && b.paid && b.renews) ? '<button class="pl-cancel" data-plan="cancel">Cancelar la renovación</button>' : "";
  host.innerHTML = '<div class="cp-bg" data-plan="close"></div><div class="cp-ccard pl-sheet">' +
    '<div class="cp-head"><div class="cp-title">Mi plan</div><button class="cp-x" data-plan="close">✕</button></div>' +
    statusLine(b) + planCards(b) + cancel +
  '</div>';
}

// Pantalla completa cuando no hay prueba ni plan vigente.
export function renderPaywall(){
  const b = billing();
  if(b.overCap) return renderOverCap(b);
  return '<div class="co-wrap pl-wall">' +
    '<div class="co-head"><div class="co-brand"><img class="brand-logo" src="brand/logo/gize-firma-horizontal.svg" alt="GIZE"><span class="co-brand-dash">-</span><span class="co-brand-tag">Panel de coach</span></div><div class="co-head-actions"><button class="co-logout" data-auth="logout">Salir</button></div></div>' +
    '<div class="pl-wall-hero"><div class="pl-wall-t">' + (B.row && B.row.paid_until ? 'Tu plan venció' : 'Terminó tu prueba gratis') + '</div>' +
    '<div class="pl-wall-s">Tus ' + b.count + ' cliente' + (b.count === 1 ? '' : 's') + ', rutinas y registros están guardados. ' +
    (IS_NATIVE ? '' : 'Elegí un plan para volver a verlos y seguir sumando clientes.') + '</div>' +
    (B.confirming ? '<div class="pl-status">Confirmando tu pago con Mercado Pago…</div>' : '') + '</div>' +
    planCards(b) +
  '</div>';
}

// Tiene más clientes que los de su plan: se pasa a uno más grande o desvincula clientes.
function renderOverCap(b){
  const extra = b.count - b.max;
  const list = CoachState.coachClients.map(c => '<div class="pl-oc-row"><span>' + esc(c.full_name || "Cliente") + '</span>' +
    '<button class="pl-link" data-plan="unlink" data-id="' + esc(c.id) + '"' + (B.busy ? ' disabled' : '') + '>Desvincular</button></div>').join("");
  return '<div class="co-wrap pl-wall">' +
    '<div class="co-head"><div class="co-brand"><img class="brand-logo" src="brand/logo/gize-firma-horizontal.svg" alt="GIZE"><span class="co-brand-dash">-</span><span class="co-brand-tag">Panel de coach</span></div><div class="co-head-actions"><button class="co-logout" data-auth="logout">Salir</button></div></div>' +
    '<div class="pl-wall-hero"><div class="pl-wall-t">Tenés más clientes que tu plan</div>' +
    '<div class="pl-wall-s">Tenés ' + b.count + ' clientes y tu plan es de ' + b.max + '. ' +
    (IS_NATIVE ? 'Desvinculá ' : 'Pasate a un plan más grande o desvinculá ') + extra + ' cliente' + (extra === 1 ? '' : 's') + ' para volver a ver sus fichas. Sus rutinas y registros quedan guardados.</div></div>' +
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

async function choose(plan, btn){
  const input = document.querySelector('[data-plan="mail"]');
  const mail = ((input ? input.value : (B.mpEmail != null ? B.mpEmail : ((State.cloudUser && State.cloudUser.email) || ""))) || "").trim();
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)){ B.mailOpen = true; rerender(); alert("Poné el mail de tu cuenta de Mercado Pago."); return; }
  B.mpEmail = mail; B.busy = plan; rerender();
  let err = "";
  try{
    const r = await State.sb.functions.invoke("suscripcion", { body: { action: "checkout", plan, mp_email: mail } });
    if(r.error){
      try{ const j = await r.error.context.json(); err = j && j.error; }catch(e){}
      err = err || (r.error.name === "FunctionsFetchError" ? "No se encontró la función de pagos (suscripcion) en Supabase." : r.error.message);
    } else if(r.data && r.data.url){ window.location.href = r.data.url; return; }
    else err = "Mercado Pago no devolvió el link de pago.";
  }catch(e){ err = (e && e.message) || String(e); }
  // Lo más común es que el mail no sea el de su cuenta de Mercado Pago: se muestra el campo.
  B.busy = false; B.mailOpen = true; rerender();
  alert("No se pudo abrir el pago: " + err);
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

export function openPlan(){ B.open = true; renderPlanSheet(); }

document.body.addEventListener("click", e => {
  const b = e.target.closest("[data-plan]"); if(!b || b.disabled) return;
  const a = b.dataset.plan;
  if(a === "open"){ openPlan(); return; }
  if(a === "close"){ B.open = false; renderPlanSheet(); return; }
  if(a === "choose"){ choose(b.dataset.id, b); return; }
  if(a === "cancel"){ cancelRenewal(); return; }
  if(a === "unlink"){ unlinkClient(b.dataset.id); return; }
  if(a === "mail-edit"){ B.mailOpen = true; rerender(); const i = document.querySelector('[data-plan="mail"]'); if(i){ i.focus(); i.select(); } return; }
});

document.body.addEventListener("input", e => {
  const t = e.target.closest('[data-plan="mail"]'); if(t) B.mpEmail = t.value;
});
