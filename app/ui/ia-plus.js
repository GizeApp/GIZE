// IA Plus: la suscripción mensual que deja usar la foto del plato sin el límite semanal gratis
// (3 fotos por semana), hasta 10 fotos por día (supabase/ia.sql → ia_plus, ia_reservar). Todo
// arranca apagado: sin el interruptor del panel (gize.ar/admin → IA → IA Plus) la app no muestra
// nada de esto.
// Dónde se vende (lo decidió el dueño):
//   · Web (gize.ar/app): con Mercado Pago, en pesos (función suscripcion, acción iaplus_checkout),
//     con el botón de baja y el de arrepentimiento (Argentina) en Ajustes → Mi IA Plus.
//   · App de iPhone con el plugin de compras: con Apple (In-App Purchase, producto
//     ar.com.gize.app.iaplus.mensual, core/compras-apple.js). Solo el precio que pone Apple,
//     «Restaurar compras», «Administrar suscripción», Términos de uso y Política de privacidad.
//     Nunca precios en pesos, Mercado Pago ni links a la web.
//   · App de Android con el plugin y el cobro de IA Plus prendido en el panel (rpc compras_google,
//     core/compras-google.js): con Google Play (mismo producto). Solo el precio que pone Google,
//     «Recuperar mi suscripción», «Administrar en Google Play», Términos de uso y Política de
//     privacidad. Nunca precios en pesos, Mercado Pago ni links a la web.
//   · App de Android con ese cobro apagado o sin el plugin (y un iPhone sin el plugin): no se vende.
//     Se muestra el límite y que IA Plus todavía no está disponible ahí, sin precio ni link a la web.
//   · En el iPhone nunca se nombra Google Play ni Android (regla 2.3.10 de Apple): a quien lo pagó con
//     Google se le muestra un texto neutro.
// Lo incluyen el plan pago (o de cortesía) del coach, para él y para sus alumnos.
// Los botones llevan data-plus (no data-action): este módulo los atiende solo, en la hoja de Comida
// y en Ajustes. Cuando IA Plus cambia, avisa con el evento «gize:iaplus» (main.js redibuja).
import { State } from '../core/state.js';
import { IA, iaEstado } from '../core/ia.js';
import { appAndroid, appNativa } from '../core/plataforma.js';
import { appIOS } from '../core/tienda.js';
import { cargarPlusApple, comprarPlusApple, comprasApple, escucharApple, finalizarApple, productoPlusApple, restaurarApple, administrarApple } from '../core/compras-apple.js';
import { administrarGoogle, cargarInterruptorGoogle, cargarPlusGoogle, comprarPlusGoogle, comprasGoogle, escucharGoogle, esPlusGoogle, pluginGoogle, PRODUCTO_IA_PLUS_GOOGLE, productoPlusGoogle, reconocerGoogle, restaurarGoogle, vigentesGoogle } from '../core/compras-google.js';
import { iaToast } from './ia-permiso.js';

const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pesos = n => "$" + Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 });
const dia = iso => { try { return new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "long", timeZone: "America/Argentina/Buenos_Aires" }); } catch (e) { return ""; } };
// Términos y privacidad: en las apps, sin la barra que lleva a la página de inicio (?app=1).
const TERMINOS = () => appNativa() ? "https://gize.ar/terminos/?app=1" : "https://gize.ar/terminos/#iaplus";
const PRIVACIDAD = () => appNativa() ? "https://gize.ar/privacidad/?app=1" : "https://gize.ar/privacidad/";

// Lo de IA Plus que dijo ia_mi_estado() (ia_plus_info en la base), o null.
export function plusInfo(){
  const e = State.cloudUser && IA.uid === State.cloudUser.id && IA.estado;
  return (e && e.plus && typeof e.plus === "object") ? e.plus : null;
}
// ¿Rige el límite semanal para esta persona? (IA Plus prendido y sin IA Plus)
export const plusLimiteSemanal = () => { const p = plusInfo(); return !!(p && p.activa && p.estado === "gratis"); };
// ¿Se puede usar la IA de Comida ahora? Con la IA apagada, sin la foto del plato, pausada o sin
// crédito este mes, IA Plus no se ofrece: sería cobrar por algo que no se puede usar.
export function plusIAUsable(){
  const e = State.cloudUser && IA.uid === State.cloudUser.id && IA.estado;
  return !!(e && e.activa && e.funciones && e.funciones.plato && !["pausada", "tope_mes"].includes(e.estado));
}

// Dónde se puede comprar: "web" (Mercado Pago), "apple" (iPhone con el plugin), "google" (Android
// con el plugin y el cobro de IA Plus prendido), "android" o "ios-sin" (iPhone con una versión sin
// el plugin de compras): en esos dos, no se vende.
export function plusCanal(){
  if (appAndroid()) return comprasGoogle("plus") ? "google" : "android";
  if (appIOS()) return comprasApple() ? "apple" : "ios-sin";
  if (appNativa()) return "android";
  return "web";
}

// Lo que incluye IA Plus: las fotos por día de quien lo tiene (topes.plus del panel, 10). Nunca
// «ilimitado»: hay un máximo por día y otro por mes.
const queIncluye = () => { const p = plusInfo(); return "hasta " + ((p && Number(p.plato_dia)) || 10) + " fotos por día"; };

// El precio que pone la tienda (Apple o Google Play), o null mientras se trae o si no se pudo.
let cargandoPrecio = false, falloPrecio = false;
function precioTienda(canal){
  const p = canal === "google" ? productoPlusGoogle() : productoPlusApple();
  if (p || cargandoPrecio || falloPrecio) return p;
  cargandoPrecio = true;
  (canal === "google" ? cargarPlusGoogle() : cargarPlusApple()).then(x => { cargandoPrecio = false; falloPrecio = !x; cambio(); });
  return null;
}

// La oferta: debajo del aviso del límite semanal (hoja de Comida) y en Ajustes → Mi IA Plus.
export function plusOfertaHtml(){
  const p = plusInfo();
  if (!p || !p.activa || p.estado !== "gratis" || !plusIAUsable()) return "";
  const canal = plusCanal();
  if (canal === "android" || canal === "ios-sin") {
    return `<div class="plus-box plus-no" data-plus-canal="${canal}"><p>${canal === "android" ? "IA Plus todavía no está disponible en la app de Android; podés seguir cargando a mano." : "IA Plus todavía no está disponible en esta versión de la app; podés seguir cargando a mano."}</p></div>`;
  }
  const cab = `<div class="plus-t"><span class="ia-tag" aria-hidden="true">IA</span> IA Plus</div>`;
  if (canal === "apple") {
    const prod = precioTienda("apple");
    const precio = prod ? `<div class="plus-prod"><b>${esc(prod.nombre || "IA Plus")}</b><span>Suscripción mensual · ${esc(prod.precio)} por mes</span></div>`
      : falloPrecio ? `<div class="plus-prod"><span>No se pudo cargar el precio de Apple.</span><button type="button" class="pl8-link" data-plus="precio">Probar de nuevo</button></div>`
      : `<div class="plus-prod" role="status"><span>Cargando el precio de Apple…</span></div>`;
    return `<div class="plus-box" data-plus-canal="apple">${cab}
      <p>Seguí usando la IA sin límite semanal: ${queIncluye()}.</p>
      ${precio}
      <button type="button" class="form-save plus-go" data-plus="apple"${prod ? "" : " disabled"}>Suscribirme</button>
      <p class="plus-fine">Se cobra a tu cuenta de Apple al confirmar. Se renueva sola cada mes al mismo precio, salvo que la canceles al menos 24 horas antes de que termine el mes, desde los Ajustes de tu cuenta de Apple.</p>
      <div class="plus-links"><button type="button" class="pl8-link" data-plus="restaurar">Restaurar compras</button>
        <a href="${TERMINOS()}" target="_blank" rel="noopener">Términos de uso</a><a href="${PRIVACIDAD()}" target="_blank" rel="noopener">Política de privacidad</a></div>
    </div>`;
  }
  if (canal === "google") {
    const prod = precioTienda("google");
    const precio = prod ? `<div class="plus-prod"><b>${esc(prod.nombre || "IA Plus")}</b><span>Suscripción mensual · ${esc(prod.precio)} por mes</span></div>`
      : falloPrecio ? `<div class="plus-prod"><span>No se pudo cargar el precio de Google Play.</span><button type="button" class="pl8-link" data-plus="precio">Probar de nuevo</button></div>`
      : `<div class="plus-prod" role="status"><span>Cargando el precio de Google Play…</span></div>`;
    return `<div class="plus-box" data-plus-canal="google">${cab}
      <p>Seguí usando la IA sin límite semanal: ${queIncluye()}.</p>
      ${precio}
      <button type="button" class="form-save plus-go" data-plus="google"${prod ? "" : " disabled"}>Suscribirme</button>
      <p class="plus-fine">Se cobra a tu cuenta de Google Play al confirmar. Se renueva sola cada mes hasta que la canceles desde Google Play (Pagos y suscripciones → Suscripciones).</p>
      <div class="plus-links"><button type="button" class="pl8-link" data-plus="google-recuperar">Recuperar mi suscripción</button>
        <a href="${TERMINOS()}" target="_blank" rel="noopener">Términos de uso</a><a href="${PRIVACIDAD()}" target="_blank" rel="noopener">Política de privacidad</a></div>
    </div>`;
  }
  // Web: Mercado Pago, en pesos. Recién arrepentido: hasta cuándo no se puede volver a suscribir.
  if (p.espera_hasta && Date.parse(p.espera_hasta) > Date.now()) {
    return `<div class="plus-box" data-plus-canal="web">${cab}<p>Usaste el botón de arrepentimiento hace poco: vas a poder volver a suscribirte a IA Plus desde el ${dia(p.espera_hasta)}.</p>
      <div class="plus-links"><a href="${TERMINOS()}" target="_blank" rel="noopener">Términos de IA Plus</a></div></div>`;
  }
  const precio = pesos(p.precio_ars);
  const mail = (State.cloudUser && State.cloudUser.email) || "";
  return `<div class="plus-box" data-plus-canal="web">${cab}
    <p>Seguí usando la IA sin límite semanal por <b>${precio} al mes</b>: ${queIncluye()}.</p>
    <label class="plus-lbl" for="plusMail">Mail de tu cuenta de Mercado Pago</label>
    <input class="form-input" id="plusMail" type="email" autocomplete="email" inputmode="email" value="${esc(mail)}">
    <button type="button" class="form-save plus-go" data-plus="mp">Suscribirme por ${precio} al mes</button>
    <p class="plus-fine">Se cobra con Mercado Pago y se renueva sola cada mes hasta que la canceles. La cancelás cuando quieras desde Ajustes → Mi IA Plus (botón de baja) y, dentro de los 10 días corridos desde el primer cobro, podés arrepentirte y te devolvemos el pago.</p>
    <div class="plus-links"><a href="${TERMINOS()}" target="_blank" rel="noopener">Términos de IA Plus</a><a href="${PRIVACIDAD()}" target="_blank" rel="noopener">Política de privacidad</a></div>
  </div>`;
}

// Ajustes → Mi IA Plus. Solo con IA Plus prendido en el panel o si la persona tiene uno vigente
// (para que lo pueda cancelar o administrar aunque el dueño lo apague).
// Con la IA de Comida apagada o pausada, solo para quien compró (para cancelar o administrar).
export function plusAjustesHtml(){
  const p = plusInfo();
  if (!p || (!p.activa && !p.fuente)) return "";
  if (!p.fuente && !plusIAUsable()) return "";
  const canal = plusCanal();
  let estado = "", botones = "";
  if (p.estado === "incluido") {
    estado = p.por === "coach" ? "Incluido con tu plan de coach: usás la IA sin límite semanal (" + queIncluye() + ")." : "Incluido con el plan de tu coach: usás la IA sin límite semanal (" + queIncluye() + ").";
  } else if (p.estado === "plus") {
    estado = "<b>Activo</b> · " + (p.renueva ? "se renueva el " + dia(p.hasta) : "hasta el " + dia(p.hasta) + " (no se renueva)") + ". Sin límite semanal: " + queIncluye() + ".";
  } else {
    const q = Number(p.quedan_semana) || 0;
    estado = "Gratis: " + (Number(p.gratis_semana) || 0) + " fotos con IA por semana. " + (q ? "Te " + (q === 1 ? "queda " : "quedan ") + q + " esta semana" : "Esta semana ya las usaste") + "; se renuevan el lunes.";
  }
  // Lo comprado, con sus botones (aunque esté incluido: si se renueva, se paga de más).
  if (p.fuente === "mp") {
    if (p.estado === "incluido" && p.renueva) estado += " Tenés además una suscripción que se renueva: cancelala para no pagar de más.";
    if (p.renueva) botones += `<button type="button" class="ctrl ghost" data-plus="baja">Cancelar suscripción</button>`;
    else estado += p.estado === "incluido" ? "" : " Cancelaste la renovación.";
    if (p.arrepentir_hasta) botones += `<button type="button" class="ctrl ghost" data-plus="arrepentir">Botón de arrepentimiento</button>`;
  } else if (p.fuente === "apple") {
    // En Android no se nombra Apple (reglas de las tiendas): texto neutro, como el de Google en el iPhone.
    const android = appAndroid();
    if (p.estado === "incluido" && p.renueva) estado += android ? " Tenés además una suscripción que se renueva: cancelala para no pagar de más."
      : " Tenés además una suscripción de Apple que se renueva: cancelala para no pagar de más.";
    botones += canal === "apple" ? `<button type="button" class="ctrl ghost" data-plus="administrar">Administrar suscripción</button>`
      : android ? `<span class="plus-fine">La suscripción la administrás desde el dispositivo donde la contrataste.</span>`
      : `<span class="plus-fine">La suscripción es de Apple: la administrás desde los Ajustes de tu cuenta de Apple.</span>`;
  } else if (p.fuente === "google") {
    // En el iPhone no se nombra Google Play (regla 2.3.10 de Apple).
    const ios = appIOS();
    if (p.estado === "incluido" && p.renueva) estado += ios ? " Tenés además una suscripción que se renueva: cancelala para no pagar de más."
      : " Tenés además una suscripción de Google Play que se renueva: cancelala para no pagar de más.";
    botones += appAndroid() && pluginGoogle() ? `<button type="button" class="ctrl ghost" data-plus="google-administrar">Administrar en Google Play</button>`
      : ios ? `<span class="plus-fine">La suscripción la administrás desde el dispositivo donde la compraste.</span>`
      : appAndroid() ? `<span class="plus-fine">La suscripción es de Google Play: la administrás desde Google Play (Pagos y suscripciones → Suscripciones).</span>`
      : `<span class="plus-fine">La suscripción es de Google Play: la cambiás o la cancelás desde tu Android, en Google Play.</span>`;
  } else if (p.fuente === "manual" && p.estado === "plus") {
    estado = "<b>Activo</b> · te lo dio el equipo de GIZE hasta el " + dia(p.hasta) + ". Sin límite semanal: " + queIncluye() + ".";
  }
  const arrep = p.fuente === "mp" && p.arrepentir_hasta ? `<p class="plus-fine">Podés arrepentirte hasta el ${dia(p.arrepentir_hasta)}: se cancela y te devolvemos el pago.</p>` : "";
  const oferta = p.estado === "gratis" && p.activa ? plusOfertaHtml() : "";
  return '<div class="card cfg-card plus-card" id="cfgPlus">' +
    '<div class="cfg-sub">Mi IA Plus</div>' +
    `<p class="plus-estado">${estado}</p>${arrep}` +
    (botones ? `<div class="pl8-btns plus-btns">${botones}</div>` : "") + oferta +
  '</div>';
}

// ---------- acciones ----------
function cambio(){ window.dispatchEvent(new Event("gize:iaplus")); }
async function refrescar(){ await iaEstado(true); cambio(); }
const trabajando = new Set();
async function conBoton(btn, texto, fn){
  const k = btn.dataset.plus;
  if (trabajando.has(k)) return;
  trabajando.add(k);
  const antes = btn.textContent; btn.disabled = true; if (texto) btn.textContent = texto;
  try { await fn(); } finally { trabajando.delete(k); if (btn.isConnected) { btn.disabled = false; btn.textContent = antes; } }
}
// El mensaje de error de la función (suscripcion o compras-apple).
async function errDe(r){
  let j = null; try { j = r.error && r.error.context && typeof r.error.context.json === "function" ? await r.error.context.json() : null; } catch (e) {}
  return { error: (j && j.error) || (r.error && r.error.name === "FunctionsFetchError" ? "No se pudo conectar. Revisá la conexión." : "No se pudo completar. Probá de nuevo en un rato."), codigo: j && j.codigo };
}

async function pagarMP(btn){
  const input = document.getElementById("plusMail");
  const mail = ((input && input.value) || "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) { alert("Poné el mail de tu cuenta de Mercado Pago."); if (input) input.focus(); return; }
  await conBoton(btn, "Abriendo Mercado Pago…", async () => {
    try {
      const r = await State.sb.functions.invoke("suscripcion", { body: { action: "iaplus_checkout", mp_email: mail } });
      if (r.error) { const e = await errDe(r); if (e.codigo === "incluido" || e.codigo === "ya") await refrescar(); alert(e.error); return; }
      if (r.data && r.data.url) { window.location.href = r.data.url; return; }
      alert("Mercado Pago no devolvió el link de pago. Probá de nuevo.");
    } catch (e) { alert("No se pudo conectar con Mercado Pago. Probá de nuevo."); }
  });
}

async function darDeBaja(btn){
  const p = plusInfo(); if (!p) return;
  if (!await confirmar("¿Cancelar IA Plus? No se te cobra más. Lo seguís usando hasta el " + dia(p.hasta) + " y después vuelven las fotos gratis de cada semana.", { titulo: "Cancelar suscripción", ok: "Cancelar suscripción", cancelar: "Volver" })) return;
  await conBoton(btn, "Cancelando…", async () => {
    const r = await State.sb.functions.invoke("suscripcion", { body: { action: "iaplus_cancel" } });
    if (r.error) { alert((await errDe(r)).error); return; }
    await refrescar();
    iaToast("Listo: cancelaste IA Plus. Lo seguís usando hasta el " + dia(p.hasta) + ".");
  });
}

async function arrepentirse(btn){
  if (!await confirmar("Se cancela IA Plus ahora y te devolvemos lo que pagaste, en el mismo medio de pago (puede tardar unos días en verse).", { titulo: "Botón de arrepentimiento", ok: "Arrepentirme", cancelar: "Volver" })) return;
  await conBoton(btn, "Procesando…", async () => {
    const r = await State.sb.functions.invoke("suscripcion", { body: { action: "iaplus_arrepentimiento" } });
    if (r.error) { alert((await errDe(r)).error); return; }
    await refrescar();
    // En las apps no se nombra Mercado Pago (reglas de las tiendas).
    alert(r.data && r.data.devuelto ? (plusCanal() === "web" ? "Listo: cancelamos IA Plus y pedimos la devolución del pago a Mercado Pago. Puede tardar unos días en verse."
        : "Listo: cancelamos IA Plus y pedimos la devolución del pago por el mismo medio con el que pagaste. Puede tardar unos días en verse.")
      : "Listo: cancelamos IA Plus. La devolución la hacemos a mano en los próximos días; si tenés dudas, escribinos a contacto@gize.ar.");
  });
}

// Lo que firmó Apple, a la función compras-apple. { ok, resultados, error, codigo }
async function enviarApple(jws){
  try {
    const r = await State.sb.functions.invoke("compras-apple", { body: { jws } });
    if (!r.error) return { ok: Array.isArray(jws) || !!(r.data && r.data.ok), resultados: (r.data && r.data.resultados) || [] };
    return Object.assign({ ok: false, resultados: [] }, await errDe(r));
  } catch (e) { return { ok: false, resultados: [], error: "No se pudo conectar." }; }
}

async function comprarApple(btn){
  if (!State.cloudUser) return;
  await conBoton(btn, "Abriendo…", async () => {
    let r;
    try { r = await comprarPlusApple(State.cloudUser.id); }
    catch (e) { alert("No se pudo completar la compra: " + ((e && e.message) || e)); return; }
    if (!r || r.estado === "cancelado") return;
    if (r.estado === "pendiente") { alert("Tu compra quedó esperando aprobación (por ejemplo, de quien organiza la familia en Apple). Cuando Apple la apruebe, IA Plus se activa solo."); return; }
    const env = await enviarApple(r.jws);
    // Se le avisa a Apple que terminó recién cuando el servidor la guardó (si no, la vuelve a mandar).
    if (env.ok && r.transaccion) { try { await finalizarApple(r.transaccion); } catch (e) {} }
    await iaEstado(true);
    const p = plusInfo();
    if (env.ok && p && p.estado !== "gratis") { cambio(); iaToast("¡Listo! Ya tenés IA Plus."); return; }
    cambio();
    alert(env.codigo === "otra-cuenta" ? "Esa suscripción de Apple es de otra cuenta de GIZE. Entrá con esa cuenta para usarla."
      : "Apple confirmó tu compra, pero todavía no pudimos activar IA Plus. Se activa solo en unos minutos; si no, tocá «Restaurar compras».");
  });
}

async function restaurar(btn){
  await conBoton(btn, "Restaurando…", async () => {
    let lista = [];
    try { const r = await restaurarApple(); if (r && r.estado === "cancelado") return; lista = (r && r.jws) || []; }
    catch (e) { alert("No se pudieron restaurar las compras: " + ((e && e.message) || e)); return; }
    const env = lista.length ? await enviarApple(lista) : { ok: true, resultados: [] };
    await iaEstado(true); cambio();
    const p = plusInfo();
    alert(!env.ok ? "No se pudieron restaurar las compras: " + (env.error || "no se pudo conectar")
      : p && p.estado !== "gratis" ? "Listo: recuperamos tu IA Plus."
      : env.resultados.some(x => x && x.codigo === "otra-cuenta") ? "Tu suscripción de Apple es de otra cuenta de GIZE. Entrá con esa cuenta para usarla."
      : "No encontramos una suscripción de IA Plus vigente en tu cuenta de Apple.");
  });
}

async function administrar(btn){
  await conBoton(btn, null, async () => {
    try { await administrarApple(); }
    catch (e) { alert("No se pudo abrir la suscripción. Podés manejarla desde los Ajustes de tu cuenta de Apple."); }
    await refrescar();
  });
}

// ---- Google Play (app de Android) ----
const PENDIENTE_GOOGLE = "Tu pago quedó pendiente en Google Play. Cuando se acredite, IA Plus se activa solo.";
const OTRA_GOOGLE = "Tu suscripción de Google Play es de otra cuenta de GIZE. Entrá con esa cuenta para usarla.";
// La compra que dio Google Play ({ token, producto }) o varias ({ compras: [...] }), a la función
// compras-google. { ok, reconocer, resultados, error, codigo }
async function enviarGoogle(body){
  try {
    const r = await State.sb.functions.invoke("compras-google", { body });
    if (!r.error) return { ok: Array.isArray(body.compras) || !!(r.data && r.data.ok), reconocer: !!(r.data && r.data.reconocer), resultados: (r.data && r.data.resultados) || [] };
    return Object.assign({ ok: false, resultados: [] }, await errDe(r));
  } catch (e) { return { ok: false, resultados: [], error: "No se pudo conectar." }; }
}
// Varias juntas; las que el servidor guardó pero no pudo reconocer las reconoce la app (si nadie las
// reconoce en 3 días, Google devuelve la plata).
async function mandarGoogle(lista){
  const env = await enviarGoogle({ compras: lista.map(c => ({ token: c.token, producto: c.producto })) });
  for (let i = 0; i < lista.length; i++) {
    const x = env.resultados[i];
    if (x && x.ok && x.reconocer) { try { await reconocerGoogle(lista[i].token); } catch (e) {} }
  }
  return env;
}

async function comprarEnGoogle(btn){
  if (!State.cloudUser || !comprasGoogle("plus")) return;
  await conBoton(btn, "Abriendo…", async () => {
    let r;
    try { r = await comprarPlusGoogle(State.cloudUser.id); }
    catch (e) { alert("No se pudo completar la compra: " + ((e && e.message) || e)); return; }
    // Cerró la hoja de Google sin comprar: nada.
    if (!r || r.estado === "cancelado") return;
    // Google dice que ya la tiene esta cuenta de Google: se recupera.
    if (r.estado === "ya" || !r.token) { await recuperarEnGoogle(); return; }
    // La pendiente también va: queda anotada y se activa sola cuando Google cobre.
    const env = await enviarGoogle({ token: r.token, producto: r.producto || PRODUCTO_IA_PLUS_GOOGLE });
    if (env.ok && env.reconocer) { try { await reconocerGoogle(r.token); } catch (e) {} }
    await iaEstado(true);
    cambio();
    if (r.estado === "pendiente" || env.codigo === "pendiente") { alert(PENDIENTE_GOOGLE); return; }
    const p = plusInfo();
    if (env.ok && p && p.estado !== "gratis") { iaToast("¡Listo! Ya tenés IA Plus."); return; }
    alert(env.codigo === "otra-cuenta" ? "Esa suscripción de Google Play es de otra cuenta de GIZE. Entrá con esa cuenta para usarla."
      : env.codigo === "prueba" ? env.error
      : "Google Play confirmó tu compra, pero todavía no pudimos activar IA Plus. Se activa solo en unos minutos; si no, tocá «Recuperar mi suscripción».");
  });
}

// «Recuperar mi suscripción»: Google Play vuelve a dar las compras y las de IA Plus van al servidor.
async function recuperarEnGoogle(){
  let lista = [];
  try { const r = await restaurarGoogle(); lista = ((r && r.compras) || []).filter(esPlusGoogle); }
  catch (e) { alert("No se pudo recuperar tu suscripción: " + ((e && e.message) || e)); return; }
  const compradas = lista.filter(c => c.estado === "comprada");
  const env = compradas.length ? await mandarGoogle(compradas) : { ok: true, resultados: [] };
  await iaEstado(true); cambio();
  const p = plusInfo();
  alert(!env.ok ? "No se pudo recuperar tu suscripción: " + (env.error || "no se pudo conectar")
    : p && p.estado !== "gratis" ? "Listo: recuperamos tu IA Plus."
    : env.resultados.some(x => x && x.codigo === "otra-cuenta") ? OTRA_GOOGLE
    : lista.some(c => c.estado === "pendiente") ? PENDIENTE_GOOGLE
    : "No encontramos una suscripción de IA Plus vigente en tu cuenta de Google Play.");
}

// «Administrar en Google Play»: abre la suscripción en Play Store. Al volver a la app (pudo cancelar
// la renovación o arreglar el pago), se vuelve a mirar.
let volverDeGoogle = false;
async function administrarEnGoogle(btn){
  await conBoton(btn, null, async () => {
    try { await administrarGoogle(PRODUCTO_IA_PLUS_GOOGLE); volverDeGoogle = true; }
    catch (e) { alert("No se pudo abrir la suscripción. Podés manejarla desde Google Play (Pagos y suscripciones → Suscripciones)."); }
  });
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || !volverDeGoogle) return;
  volverDeGoogle = false;
  refrescar().catch(() => {});
});

document.addEventListener("click", e => {
  const btn = e.target.closest && e.target.closest("[data-plus]");
  if (!btn || btn.disabled || !State.sb || !State.cloudUser) return;
  const a = btn.dataset.plus;
  if (a === "mp") pagarMP(btn);
  else if (a === "apple") comprarApple(btn);
  else if (a === "restaurar") restaurar(btn);
  else if (a === "administrar") administrar(btn);
  else if (a === "google") comprarEnGoogle(btn);
  else if (a === "google-recuperar") conBoton(btn, "Recuperando…", recuperarEnGoogle);
  else if (a === "google-administrar") administrarEnGoogle(btn);
  else if (a === "baja") darDeBaja(btn);
  else if (a === "arrepentir") arrepentirse(btn);
  else if (a === "precio") { falloPrecio = false; cambio(); }
});

// iPhone: las compras que llegan solas (aprobada más tarde, otro dispositivo) van al servidor y se
// finalizan. Las renovaciones las avisa Apple al servidor (compras-apple), así que esto es de más.
let escuchando = false;
function escuchar(){
  if (escuchando || plusCanal() !== "apple" || !State.cloudUser) return;
  escuchando = true;
  escucharApple(ev => {
    if (!ev || !ev.jws || !State.sb || !State.cloudUser) return;
    enviarApple(ev.jws).then(r => { if (r.ok && ev.transaccion) finalizarApple(ev.transaccion).catch(() => {}); return refrescar(); }, () => {});
  });
}

// Android: el interruptor del cobro de IA Plus con Google Play (si cambió, se redibuja). Prendido,
// las compras que llegan solas (una pendiente que se acreditó) van al servidor, y las de IA Plus de
// este celular que todavía nadie reconoció también. Apagado o sin el plugin, nada (como siempre).
let escuchandoGoogle = false;
async function arrancarGoogle(){
  if (!pluginGoogle() || !State.sb || !State.cloudUser) return;
  const antes = comprasGoogle("plus");
  await cargarInterruptorGoogle(State.sb, State.cloudUser.id);
  if (comprasGoogle("plus") !== antes) cambio();
  if (!comprasGoogle("plus")) return;
  if (!escuchandoGoogle) {
    escuchandoGoogle = true;
    escucharGoogle(ev => {
      if (!esPlusGoogle(ev) || ev.estado !== "comprada" || !State.sb || !State.cloudUser) return;
      enviarGoogle({ token: ev.token, producto: ev.producto }).then(r => {
        if (r.ok && r.reconocer) return reconocerGoogle(ev.token).catch(() => {});
      }).then(refrescar, () => {});
    });
  }
  try {
    const sin = (await vigentesGoogle()).filter(c => esPlusGoogle(c) && c.estado === "comprada" && !c.reconocida && !c.suspendida);
    if (sin.length) { await mandarGoogle(sin); await refrescar(); }
  } catch (e) {}
}

// Vuelta de Mercado Pago (?pago=iaplus): el aviso del cobro llega a la función en segundos; se
// pregunta el estado unas veces hasta verlo activo.
async function volvioDePago(){
  if (plusCanal() !== "web") return;
  const u = new URL(location.href);
  if (u.searchParams.get("pago") !== "iaplus") return;
  u.searchParams.delete("pago"); u.searchParams.delete("preapproval_id");
  history.replaceState(history.state, "", u.pathname + (u.search || "") + u.hash);
  iaToast("Confirmando tu pago con Mercado Pago…");
  for (let i = 0; i < 12; i++) {
    await iaEstado(true);
    const p = plusInfo();
    if (p && p.estado !== "gratis") { cambio(); iaToast("¡Listo! Ya tenés IA Plus."); return; }
    await new Promise(r => setTimeout(r, 4000));
  }
  cambio();
  iaToast("Mercado Pago todavía no confirmó el pago. Cuando lo confirme, IA Plus se activa solo.");
}

window.addEventListener("gize:login", () => { escuchar(); volvioDePago(); arrancarGoogle(); });
