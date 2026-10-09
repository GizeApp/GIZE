// Notificaciones push (Web Push): los mensajes del coach le llegan al cliente al celular
// aunque tenga la app cerrada, como un mensaje de WhatsApp.
//
// El cliente las activa en Configuración → Notificaciones: se pide el permiso, el
// navegador crea una "suscripción" (una dirección a la que se le puede mandar) y se
// guarda en Supabase (push_subscriptions). El coach escribe en la ficha del cliente y
// la función supabase/functions/notificar-cliente la manda a cada dispositivo guardado.
// El sw.js la muestra (evento "push").
//
// En iPhone solo funciona con la app agregada a la pantalla de inicio (iOS 16.4+).
// Todo lo de la base está en supabase/notificaciones.sql.
//
// Dentro de las apps de las tiendas (Capacitor) no hay Web Push: se usa el plugin de
// notificaciones nativas. El token del celular se guarda en la misma tabla, con endpoint
// "fcm:<token>" en Android (Firebase) o "apns:<token>" en iPhone (Apple), y la función de
// Supabase manda por el servicio que corresponde.

import { State } from './state.js';

// Clave pública VAPID (la privada está solo en los Secrets de la función de Supabase).
export const VAPID_PUBLIC_KEY = "BKJACFJtDy4oTFB_eeuWRdr_yUMBIKoBA6eKXWRuYqzJgaoaTz7_WDPujni6a010RtsuPkIId2MS3gluRop6xDY";

// Preferencia de la app: el permiso del navegador no se puede revocar por código, así
// que "apagar" borra la suscripción y guarda esto.
export const NOTIF_KEY = "jfit_notif_enabled";

// App nativa: el plugin lo expone Capacitor en window.Capacitor.Plugins (sin bundler).
function nativePush(){
  try { return (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() && window.Capacitor.Plugins && window.Capacitor.Plugins.PushNotifications) || null; } catch (e) { return null; }
}
const NATIVE_KEY = "gize_fcm_token"; // token guardado en este celular (para borrarlo al apagar)
// Navegador: la cuenta que activó las notificaciones acá. Solo esa las vuelve a guardar al entrar
// (syncPush). Antes alcanzaba con que el navegador tuviera el permiso (lo pudo dar cualquiera que
// usó la compu) y cada cuenta que entraba quedaba registrada sin haberlas activado.
const WEB_KEY = "gize_web_push";
const webOwner = () => { try { return localStorage.getItem(WEB_KEY) || ""; } catch (e) { return ""; } };
// Dispositivos dados de baja acá que no se pudieron borrar de la base (sin señal, o ya sin
// sesión): se borran apenas hay conexión con forget_push_subscription (supabase/notificaciones.sql),
// que no pide sesión: alcanza con la dirección y su clave, que solo tiene este dispositivo.
const FORGET_KEY = "gize_push_forget";
// Sesión sin «Mantener la sesión» en el navegador (vive solo en esta pestaña): no hay
// notificaciones, porque seguían llegando a la compu después de cerrar la pestaña, hasta que
// alguien volviera a abrir GIZE (clearEndedSession en core/supabase.js). En la app agregada a
// inicio (iPhone, o instalada en Android), como en las de las tiendas, la sesión no se trata como
// de una compu compartida.
const tabOnly = () => { try { return !isStandalone() && !!State.sb && sessionStorage.getItem(State.sb.auth.storageKey) != null; } catch (e) { return false; } };

export function pushSupported(){
  if (nativePush()) return true;
  return "serviceWorker" in navigator && "PushManager" in window && typeof Notification !== "undefined";
}

// ¿Están prendidas en este dispositivo? (para el interruptor de Configuración)
export function pushOnHere(){
  if (nativePush()) { try { return prefOn() && !!localStorage.getItem(NATIVE_KEY); } catch (e) { return false; } }
  return pushSupported() && Notification.permission === "granted" && prefOn() && !!State.cloudUser && webOwner() === State.cloudUser.id;
}

// ---------- app nativa (Firebase Cloud Messaging) ----------
let nativeListeners = false;
function nativeToken(PN){
  // register() dispara el evento "registration" con el token (o "registrationError").
  return new Promise((res, rej) => {
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; rej(new Error("el celular no respondió, probá de nuevo")); } }, 15000);
    PN.addListener("registration", tk => { if (!done) { done = true; clearTimeout(t); res(tk.value); } });
    PN.addListener("registrationError", e => { if (!done) { done = true; clearTimeout(t); rej(new Error((e && e.error) || "error al registrar")); } });
    PN.register().catch(e => { if (!done) { done = true; clearTimeout(t); rej(e); } });
  });
}
function nativeForeground(PN){
  if (nativeListeners) return; nativeListeners = true;
  // Con la app abierta, iPhone ya muestra el cartel del sistema (presentationOptions "alert" en
  // capacitor.config.json): uno propio encima lo duplicaba. Android solo lo deja en la barra de
  // notificaciones, sin cartel: ahí se avisa adentro de la app.
  let ios = false; try { ios = window.Capacitor.getPlatform() === "ios"; } catch (e) {}
  if (ios) return;
  PN.addListener("pushNotificationReceived", n => {
    const box = document.createElement("div");
    box.setAttribute("role", "status");
    box.style.cssText = "position:fixed;left:12px;right:12px;top:calc(12px + env(safe-area-inset-top,0px));z-index:10001;background:#12151B;border:1px solid #2a2f3a;border-radius:16px;padding:12px 14px;color:#fff;font:500 14px 'Outfit',system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.5)";
    box.innerHTML = "<b style='display:block;font-weight:600;margin-bottom:2px'></b><span></span>";
    box.querySelector("b").textContent = n.title || "Tu coach";
    box.querySelector("span").textContent = n.body || "";
    box.onclick = () => box.remove();
    document.body.appendChild(box); setTimeout(() => box.remove(), 7000);
  });
}
// Android da un token de Firebase (fcm:); iPhone, uno de Apple (apns:). La función de
// Supabase manda por el servicio que corresponde según el prefijo.
function nativeEndpoint(token){
  let ios = false; try { ios = window.Capacitor.getPlatform() === "ios"; } catch (e) {}
  return (ios ? "apns:" : "fcm:") + token;
}
async function saveNative(token){
  if (!State.sb || !State.cloudUser) return "Tenés que iniciar sesión.";
  const kind = nativeEndpoint("").replace(":", "");
  const r = await State.sb.rpc("save_push_subscription", { p_endpoint: nativeEndpoint(token), p_p256dh: kind, p_auth: kind });
  if (r.error) return "No se pudo guardar este dispositivo: " + (r.error.message || r.error);
  try { localStorage.setItem(NATIVE_KEY, token); } catch (e) {}
  keepEndpoint(nativeEndpoint(token));
  return "";
}
async function enableNative(PN){
  let p = await PN.checkPermissions();
  if (p.receive === "prompt" || p.receive === "prompt-with-rationale") p = await PN.requestPermissions();
  if (p.receive !== "granted") return "No se activaron las notificaciones. Si las bloqueaste, habilitalas desde Ajustes del celular → Apps → GIZE → Notificaciones.";
  nativeForeground(PN);
  try { return await saveNative(await nativeToken(PN)); }
  catch (e) { return "No se pudieron activar las notificaciones: " + ((e && e.message) || e); }
}
// Primero la baja en el celular y después en la base (ver forgetServer).
async function dropNative(PN, ajena){
  let tk = null; try { tk = localStorage.getItem(NATIVE_KEY); localStorage.removeItem(NATIVE_KEY); } catch (e) {}
  try { await PN.unregister(); } catch (e) {}
  if (tk) await forgetServer(nativeEndpoint(tk), nativeEndpoint("").replace(":", ""), ajena);
}

export function isIOS(){ return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); }
export function isStandalone(){ return (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true; }

// Mensaje para cuando este navegador no puede recibir push.
export function pushUnsupportedMsg(){
  if (isIOS() && !isStandalone())
    return "En iPhone las notificaciones funcionan con GIZE agregada a la pantalla de inicio:\n\n1. Abrí la app en Safari.\n2. Tocá Compartir (el cuadrado con la flecha).\n3. Elegí «Agregar a inicio».\n4. Abrí GIZE desde ese ícono y activá las notificaciones.";
  return "Este navegador no permite notificaciones. Probá desde Chrome en Android o con la app agregada a la pantalla de inicio en iPhone.";
}

export function prefOn(){
  try { return localStorage.getItem(NOTIF_KEY) !== "0"; } catch (e) { return true; }
}
function setPref(on){ try { localStorage.setItem(NOTIF_KEY, on ? "1" : "0"); } catch (e) {} }

function keyBytes(b64){
  const pad = "=".repeat((4 - b64.length % 4) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

async function registration(){
  // Espera al sw.js (se registra en main.js al cargar la página). Con techo: si el
  // service worker no llegó a registrarse, ready no se resuelve nunca.
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, rej) => setTimeout(() => rej(new Error("la app todavía no terminó de instalarse, probá de nuevo en unos segundos")), 8000))
  ]);
}

async function saveSub(sub){
  if (!State.sb || !State.cloudUser) return "Tenés que iniciar sesión.";
  const j = sub.toJSON();
  const r = await State.sb.rpc("save_push_subscription", { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth });
  if (r.error) return "No se pudo guardar este dispositivo: " + (r.error.message || r.error) +
    (/function|schema cache|not found/i.test(r.error.message || "") ? "\n\nFalta correr supabase/notificaciones.sql en Supabase." : "");
  keepEndpoint(j.endpoint);
  return "";
}

// ---------- bajas pendientes en la base ----------
function forgets(){ try { const a = JSON.parse(localStorage.getItem(FORGET_KEY) || "[]"); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function setForgets(a){ try { if (a.length) localStorage.setItem(FORGET_KEY, JSON.stringify(a.slice(-5))); else localStorage.removeItem(FORGET_KEY); } catch (e) {} }
// Ese dispositivo se volvió a guardar (el mismo token de celular, otra cuenta): ya no se borra.
function keepEndpoint(endpoint){ const a = forgets(); if (a.some(x => x.e === endpoint)) setForgets(a.filter(x => x.e !== endpoint)); }
// Borra de la base un dispositivo que ya se dio de baja acá. Con la sesión de su cuenta, como
// siempre (hasta 5 s: sin señal no se espera más); si no sale, o es de otra cuenta (ajena: la
// sesión de ahora no la puede borrar), queda anotado y se borra apenas haya conexión.
async function forgetServer(endpoint, auth, ajena){
  let ok = false;
  if (!ajena && State.sb && State.cloudUser) {
    try { const r = await Promise.race([State.sb.rpc("delete_push_subscription", { p_endpoint: endpoint }), new Promise(res => setTimeout(() => res({ error: "sin respuesta" }), 5000))]); ok = !r.error; } catch (e) {}
  }
  if (!ok && endpoint && auth) setForgets(forgets().filter(x => x.e !== endpoint).concat({ e: endpoint, a: auth, t: Date.now() }));
}
// Al abrir la app y al volver la señal. A los 30 días se deja: si el dispositivo ya no existe,
// la función de Supabase borra la fila sola cuando un envío falla.
export async function retryPushForget(){
  const list = forgets(); if (!list.length || !State.sb) return;
  const left = [];
  for (const x of list) {
    if (Date.now() - (x.t || 0) > 30 * 864e5) continue;
    let ok = false;
    try { const r = await State.sb.rpc("forget_push_subscription", { p_endpoint: x.e, p_auth: x.a }); ok = !r.error; } catch (e) {}
    if (!ok) left.push(x);
  }
  setForgets(forgets().filter(x => !list.some(y => y.e === x.e)).concat(left));
}
window.addEventListener("online", () => { retryPushForget(); });

// Activa: permiso → suscripción → se guarda en la base. Devuelve "" o un mensaje de error.
export async function enablePush(){
  const PN = nativePush();
  if (PN) { const err = await enableNative(PN); if (!err) setPref(true); return err; }
  if (!pushSupported()) return pushUnsupportedMsg();
  if (tabOnly()) return "Para recibir notificaciones en este navegador, cerrá sesión y volvé a entrar con «Mantener la sesión» tildado.";
  if (Notification.permission === "denied")
    return "Las notificaciones están bloqueadas para GIZE en este dispositivo. Para activarlas, habilitalas desde los ajustes del navegador o del celular.";
  const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (perm !== "granted") return "No se activaron las notificaciones.";
  try {
    const reg = await registration();
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) });
    const err = await saveSub(sub);
    if (err) return err;
    try { localStorage.setItem(WEB_KEY, State.cloudUser.id); } catch (e) {}
  } catch (e) {
    return "No se pudieron activar las notificaciones: " + ((e && e.message) || e);
  }
  setPref(true);
  return "";
}

// Apaga en este dispositivo: se borra de la base y se da de baja la suscripción.
export async function disablePush(){
  setPref(false);
  await dropSub();
}

async function dropSub(ajena){
  const PN = nativePush(); if (PN) return dropNative(PN, ajena);
  try { localStorage.removeItem(WEB_KEY); } catch (e) {}
  if (!pushSupported()) return;
  try {
    // Sin esperar a ready (puede tardar hasta 8 s si el service worker no llegó a instalarse):
    // si no hay registro, tampoco hay suscripción que dar de baja.
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && await reg.pushManager.getSubscription();
    if (!sub) return;
    const j = sub.toJSON();
    // Primero la baja en este navegador, que no necesita señal: deja de recibir aunque lo de la
    // base no salga (antes, sin señal, se cortaba ahí y la suscripción seguía viva).
    try { await sub.unsubscribe(); } catch (e) {}
    await forgetServer(j.endpoint, (j.keys || {}).auth, ajena);
  } catch (e) {}
}

// Al cerrar sesión: que los mensajes del coach no le sigan llegando a este celular
// (la próxima cuenta que entre los activa de nuevo si quiere). No toca la preferencia.
export async function pushLogout(){ await dropSub(); }

// Sin sesión de la cuenta que las activó (una sesión sin «Mantener la sesión» que terminó, ver
// clearEndedSession en core/supabase.js, o entró otra cuenta): se dan de baja en este
// dispositivo y se borran de la base apenas se pueda.
export async function pushDropHere(){ await dropSub(true); retryPushForget(); }

// Al entrar: si ya estaban activadas, re-guarda la suscripción (el navegador a veces la
// renueva, y si el celular cambió de cuenta tiene que quedar a nombre de la actual). En el
// navegador, solo si las activó esta misma cuenta (WEB_KEY).
export async function syncPush(){
  const PN = nativePush();
  if (PN) {
    // Si ya estaban prendidas en este celular, se re-guarda el token (FCM a veces lo renueva).
    if (!State.cloudUser || !prefOn()) return;
    let had = null; try { had = localStorage.getItem(NATIVE_KEY); } catch (e) {}
    if (!had) return;
    try { const p = await PN.checkPermissions(); if (p.receive !== "granted") return; nativeForeground(PN); await saveNative(await nativeToken(PN)); } catch (e) { console.error("syncPush", e); }
    return;
  }
  if (!pushSupported() || !State.cloudUser || Notification.permission !== "granted" || !prefOn()) return;
  try {
    const uid = State.cloudUser.id, own = webOwner();
    // Las activó otra cuenta y se fue sin «Salir» (o se le cerró la sesión): se dan de baja, para
    // que sus mensajes no le lleguen a quien entra ahora.
    if (own && own !== uid) { await pushDropHere(); return; }
    // Sin «Mantener la sesión» no quedan activadas (ver tabOnly): las que había se dan de baja.
    if (tabOnly()) { await pushDropHere(); return; }
    const reg = await registration();
    let sub = await reg.pushManager.getSubscription();
    if (!own) {
      // Las versiones anteriores no anotaban la cuenta: se sigue solo si la base dice que este
      // navegador ya era de esta cuenta. Si no, no se registra sola, y si es de otra cuenta (la
      // base no deja ver su fila) se da de baja: si no, sus mensajes le seguían llegando a quien
      // entró ahora (antes el save la pasaba a esta cuenta y a la otra le dejaban de llegar).
      if (!sub) return;
      const r = await State.sb.from("push_subscriptions").select("id").eq("endpoint", sub.endpoint).maybeSingle();
      if (r.error) return;
      if (!r.data) { await pushDropHere(); return; }
      try { localStorage.setItem(WEB_KEY, uid); } catch (e) {}
    }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) });
    await saveSub(sub);
  } catch (e) { console.error("syncPush", e); }
}

// ¿Está activo en este dispositivo? (permiso dado + preferencia + suscripción creada)
export async function pushActiveHere(){
  if (nativePush()) return pushOnHere();
  if (!pushOnHere()) return false;
  try { const reg = await registration(); return !!(await reg.pushManager.getSubscription()); } catch (e) { return false; }
}
