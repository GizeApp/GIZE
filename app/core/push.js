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

export function pushSupported(){
  if (nativePush()) return true;
  return "serviceWorker" in navigator && "PushManager" in window && typeof Notification !== "undefined";
}

// ¿Están prendidas en este dispositivo? (para el interruptor de Configuración)
export function pushOnHere(){
  if (nativePush()) { try { return prefOn() && !!localStorage.getItem(NATIVE_KEY); } catch (e) { return false; } }
  return pushSupported() && Notification.permission === "granted" && prefOn();
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
async function dropNative(PN){
  let tk = null; try { tk = localStorage.getItem(NATIVE_KEY); localStorage.removeItem(NATIVE_KEY); } catch (e) {}
  try { if (tk && State.sb && State.cloudUser) await State.sb.rpc("delete_push_subscription", { p_endpoint: nativeEndpoint(tk) }); } catch (e) {}
  try { await PN.unregister(); } catch (e) {}
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
  return "";
}

// Activa: permiso → suscripción → se guarda en la base. Devuelve "" o un mensaje de error.
export async function enablePush(){
  const PN = nativePush();
  if (PN) { const err = await enableNative(PN); if (!err) setPref(true); return err; }
  if (!pushSupported()) return pushUnsupportedMsg();
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

async function dropSub(){
  const PN = nativePush(); if (PN) return dropNative(PN);
  if (!pushSupported()) return;
  try {
    // Sin esperar a ready (puede tardar hasta 8 s si el service worker no llegó a instalarse):
    // si no hay registro, tampoco hay suscripción que dar de baja.
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && await reg.pushManager.getSubscription();
    if (!sub) return;
    if (State.sb && State.cloudUser) await State.sb.rpc("delete_push_subscription", { p_endpoint: sub.endpoint });
    await sub.unsubscribe();
  } catch (e) {}
}

// Al cerrar sesión: que los mensajes del coach no le sigan llegando a este celular
// (la próxima cuenta que entre los activa de nuevo si quiere). No toca la preferencia.
export async function pushLogout(){ await dropSub(); }

// Al entrar: si ya estaban activadas, re-guarda la suscripción (el navegador a veces la
// renueva, y si el celular cambió de cuenta tiene que quedar a nombre de la actual).
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
    const reg = await registration();
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) });
    await saveSub(sub);
  } catch (e) { console.error("syncPush", e); }
}

// ¿Está activo en este dispositivo? (permiso dado + preferencia + suscripción creada)
export async function pushActiveHere(){
  if (nativePush()) return pushOnHere();
  if (!pushSupported() || Notification.permission !== "granted" || !prefOn()) return false;
  try { const reg = await registration(); return !!(await reg.pushManager.getSubscription()); } catch (e) { return false; }
}
