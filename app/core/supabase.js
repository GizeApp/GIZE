import { mergeVisits } from '../ui/racha.js';
import { DAILY_COLUMNS } from './questions.js';

import { syncPush } from './push.js';
import { clearHabitAlarms } from '../ui/habitnotif.js';
import { resolveAvatars } from './avatar.js';

import { loadCoachQuestions } from '../screens/coach/preguntas.js';

import { State, state, ensureDays, elegirDiaDeHoy } from './state.js';
import { activeDeload } from './bloque.js';
import { markSubs, mergeTodaySubs, todaySubs } from './variantes.js';

import { OLD_DEFAULT_NAMES } from './data.js';

import { KEY, markRoutineSynced, migrateNames, routineHash, save } from './storage.js';

import { today, ymd } from './utils.js';

import { renderApp } from '../main.js';

import { hideLogin, showLogin } from '../screens/auth.js';

import { maybeShowOnboarding } from '../screens/onboarding.js';

import { routineLocked } from '../screens/entreno.js';

import { loadCoachClients } from '../screens/coach/clientes.js';

import { checkPaymentReturn } from '../screens/coach/plan.js';

import { appIOS, joinMsgTienda } from './tienda.js';

import { renderCoach } from '../screens/coach/index.js';

import { runKeys, stopForLogout } from '../ui/gps.js';

import { TRACK_KEY, pruneTracks } from './salidas.js';

import { deleteShareFile } from '../ui/compartir.js';

export const SB_URL = "https://wegptuzhsrwppbknqstf.supabase.co";

export const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndlZ3B0dXpoc3J3cHBia25xc3RmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwMDkxODgsImV4cCI6MjA5ODU4NTE4OH0.pWBes8juiNcCrFG377w_Ga9IQ4EE37p5AJwUpYs2k8Q";

// El link del mail de confirmación vuelve a la app con #access_token=...&type=signup (o
// #error_code=... si venció). Se lee acá, al cargar el módulo, porque createClient se
// come el # apenas arranca y después ya no queda rastro.
const BOOT_AUTH = new URLSearchParams((location.hash||"").replace(/^#/,"") + "&" + (location.search||"").replace(/^\?/,""));
// Login por link (web): supabase-js acepta cualquier #access_token=... que venga en la URL,
// así que un link armado por otra persona podía dejarte adentro de SU cuenta (y todo lo que
// cargaras le llegaba a ella). Solo se acepta si este navegador pidió ese link hace poco
// (registro, "olvidé mi contraseña" o Google por redirección: expectAuthLink). Si no, se saca
// de la URL antes de que la librería lo lea y se explica qué hacer.
const AUTH_EXPECT = "gize_auth_expect";
export function expectAuthLink(){ try{ localStorage.setItem(AUTH_EXPECT, String(Date.now())); }catch(e){} }
// Cualquier ingreso terminado apaga la marca (afterLogin, y el código de recuperación): si no,
// quedaba prendida hasta 7 días y en ese tiempo un link ajeno se aceptaba sin preguntar.
export function clearAuthExpect(){ try{ localStorage.removeItem(AUTH_EXPECT); }catch(e){} }
const BOOT_HASH = new URLSearchParams((location.hash||"").replace(/^#/,""));
// Botón del mail de recuperar contraseña (plantilla supabase/mails/recuperar.html): llega como
// #recuperar=<token_hash> y se saca de la URL enseguida. Abrirlo no gasta nada: el token se
// canjea solo si el pedido salió de este navegador (useRecoveryLink, más abajo).
const RECOVER_HASH = (BOOT_HASH.get("recuperar")||"").trim();
if(RECOVER_HASH){ try{ history.replaceState(null,"",location.pathname+location.search); }catch(e){} }
let LINK_REFUSED = "";
if(BOOT_HASH.get("access_token")){
  let t=0; try{ t=+localStorage.getItem(AUTH_EXPECT)||0; }catch(e){}
  if(t && Date.now()-t < 7*86400000){ try{ localStorage.removeItem(AUTH_EXPECT); }catch(e){} }
  else { LINK_REFUSED = BOOT_HASH.get("type") || "login"; try{ history.replaceState(null,"",location.pathname+location.search); }catch(e){} }
}
// El tipo sale solo del # (donde lo pone Supabase) y solo si el link se aceptó: con
// ?type=recovery en la URL no se abre la pantalla de contraseña nueva.
const LINK_TYPE = LINK_REFUSED ? "" : (BOOT_HASH.get("type")||"");
const CONFIRM_LANDING = LINK_TYPE==="signup";
// Link del mail de "olvidé mi contraseña" en la web (#access_token=...&type=recovery): entra
// con una sesión de recuperación y hay que pedir la contraseña nueva antes de abrir la app.
const RECOVERY_LANDING = LINK_TYPE==="recovery";
// ---- Recuperar la contraseña ----
// El mail trae un botón y un código de 6 números (supabase/mails/recuperar.html). El botón
// lleva el token a la web como https://gize.ar/app/#recuperar=<token_hash>. Abrirlo NO lo
// gasta: GIZE lo canjea solo si el pedido salió de este mismo navegador (RECOVERY_REQ, con el
// mail que se escribió) y la cuenta es la de ese mail. Si no, pide el código, que sigue
// sirviendo y anda en cualquier lado (también en la app, que lo pide apenas se manda el mail).
//   Antes el botón iba directo a Supabase (/auth/v1/verify), que gastaba el token al abrirlo:
// quien lo tocaba en Gmail o en otro navegador quedaba sin link (no servía ahí) y sin código.
//   El token nunca viaja por gize://: cualquier app instalada puede anotarse para abrir ese
// esquema y con el token sola (sin la clave PKCE de este celular) entraría a la cuenta.
export const RECOVERY_REQ = "gize_recovery_req";
const RECOVERY_TTL = 2*3600000; // el link y el código vencen en 1 hora (tarea "mails" de supabase.yml)
export function markRecoveryRequest(email){
  try{ localStorage.setItem(RECOVERY_REQ, JSON.stringify({ t: Date.now(), email: String(email||"").trim().toLowerCase() })); }catch(e){}
}
export function clearRecoveryRequest(){ try{ localStorage.removeItem(RECOVERY_REQ); }catch(e){} }
// El pedido de este navegador o celular, si es reciente. Las versiones anteriores guardaban
// solo la hora (sin mail): se aceptan sin chequear el mail.
function recoveryRequest(){
  try{
    const raw=localStorage.getItem(RECOVERY_REQ); if(!raw) return null;
    let o=null; try{ o=JSON.parse(raw); }catch(e){}
    if(typeof o==="number") o={ t:o, email:"" };
    if(!o || !(o.t>0) || Date.now()-o.t > RECOVERY_TTL) return null;
    return { t:o.t, email:String(o.email||"") };
  }catch(e){ return null; }
}
function recoveryRequested(){ return !!recoveryRequest(); }
// Contraseña nueva pendiente: con la sesión de recuperación ya puesta, la app no se abre hasta
// elegirla (o tocar «Cancelar»). Sin esto, cerrar la app en ese paso dejaba la cuenta adentro
// para la próxima vez, aunque fuera un celular prestado.
// Va atado a esa sesión (session_id del token): otro ingreso de la misma cuenta no la toca.
const RECOVERY_PENDING = "gize_recovery_pending";
function sessionIdOf(session){
  try{ const b=String(session.access_token||"").split(".")[1].replace(/-/g,"+").replace(/_/g,"/"); return String(JSON.parse(atob(b)).session_id||""); }catch(e){ return ""; }
}
export function setRecoveryPending(session){
  try{ if(session && session.user && session.user.id) localStorage.setItem(RECOVERY_PENDING, JSON.stringify({ uid: session.user.id, sid: sessionIdOf(session) })); }catch(e){}
}
export function clearRecoveryPending(){ try{ localStorage.removeItem(RECOVERY_PENDING); }catch(e){} }
function recoveryPendingFor(session){
  try{
    const m=JSON.parse(localStorage.getItem(RECOVERY_PENDING)||"null");
    if(!m || !session || !session.user || m.uid!==session.user.id) return false;
    const sid=sessionIdOf(session);
    return !m.sid || !sid || m.sid===sid;
  }catch(e){ return false; }
}
// Sale de la sesión de recuperación aunque no haya señal: primero se borra la sesión guardada
// (así no queda adentro aunque se cierre la app) y después se avisa a Supabase, sin esperarlo.
export async function dropRecoverySession(){
  clearRecoveryPending();
  if(!State.sb) await ensureSb();
  if(!State.sb) return;
  let tok=""; try{ const st=JSON.parse(authStorage.getItem(State.sb.auth.storageKey)||"null"); tok=(st && st.access_token)||""; }catch(e){}
  try{ const k=State.sb.auth.storageKey; authStorage.removeItem(k); authStorage.removeItem(k+"-user"); }catch(e){}
  try{ State.sb.auth.signOut({ scope:"local" }).catch(()=>{}); }catch(e){}
  if(tok){ try{ fetch(SB_URL+"/auth/v1/logout?scope=local", { method:"POST", headers:{ apikey:SB_KEY, Authorization:"Bearer "+tok } }).catch(()=>{}); }catch(e){} }
}
// Qué salió mal al canjear un código o un link: "rate" (muchos intentos), "offline" (sin
// conexión o el servidor no respondió: el código puede seguir sirviendo) o "used" (equivocado,
// vencido o ya usado).
export function otpErrorKind(err){
  const st=err && err.status, msg=(err && err.message)||"";
  if(st===429 || /rate limit|too many/i.test(msg)) return "rate";
  if(!st || st>=500) return "offline";
  return "used";
}
export const RECOVERY_MSG = {
  // Botón del mail abierto donde no se pidió: el código sigue sirviendo.
  elsewhere: "Abriste el botón del mail en un navegador o celular distinto del que lo pidió, y por seguridad no se usa acá. Escribí tu mail y el código de 6 números que trae el mail: todavía sirve.",
  // Pedido desde la app (el token de un pedido con PKCE empieza con «pkce_»).
  elsewhereApp: "Lo pediste desde la app de GIZE: escribí ahí el código de 6 números del mail. O terminá acá: poné tu mail y el código, elegí la contraseña nueva y después entrá a la app con esa contraseña.",
  // Link viejo (de antes del código en el mail) que no se pudo usar acá.
  oldLink: "Ese link ya se usó al abrirlo y no sirve en este navegador o celular. Pedí un mail nuevo y, si lo vas a abrir en otro lado, escribí el código que trae.",
  used: "Ese link ya se usó o venció (dura 1 hora y sirve una sola vez). Pedí un mail nuevo.",
  otherAccount: "Ese link es de otra cuenta, no de la que pediste recuperar. Escribí el código de 6 números del mail que te llegó a vos.",
  offline: "No se pudo revisar el link. Revisá tu conexión a internet y tocá el botón del mail de nuevo, o escribí el código de 6 números que trae.",
  rate: "Probaste muchas veces seguidas. Esperá unos minutos y volvé a intentar.",
};
// Canjea el token del botón del mail (#recuperar=...). Devuelve {ok:true} con la sesión de
// recuperación puesta, o {ok:false, why}: "elsewhere" | "used" | "offline" | "rate" | "otherAccount".
export async function useRecoveryLink(tokenHash){
  const req=recoveryRequest();
  // Sin el mail del pedido (marcas de versiones anteriores) no se puede chequear la cuenta.
  if(!req || !req.email) return { ok:false, why:"elsewhere" };
  if(!State.sb) await ensureSb();
  if(!State.sb) return { ok:false, why:"offline" };
  let r;
  try{ r=await State.sb.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" }); }
  catch(e){ r={ error:e }; }
  if(r.error || !r.data || !r.data.session) return { ok:false, why: otpErrorKind(r.error) };
  const got=String((r.data.user && r.data.user.email)||"").trim().toLowerCase();
  // Un link ajeno que llega justo mientras hay un pedido propio: no se entra a esa cuenta.
  if(!got || got!==req.email){
    await dropRecoverySession();
    return { ok:false, why:"otherAccount" };
  }
  clearRecoveryRequest(); clearAuthExpect();
  setRecoveryPending(r.data.session);
  return { ok:true };
}
const CONFIRM_ERROR = !!(BOOT_AUTH.get("error_code") || BOOT_AUTH.get("error_description"));
const CONFIRM_ERROR_MSG = "El link de confirmación venció o ya se usó. Probá ingresar con tu email y contraseña; si no te deja, registrate de nuevo para recibir otro mail.";

// App nativa: quien se registra desde la app recibe un mail cuyo link vuelve con
// gize://confirmado?code=... (ver emailRedirectTo en main.js); el login con Google vuelve
// con gize://login?code=... Android/iPhone abren la app instalada y acá se canjea el código.
// En la app se usa PKCE (flowType en ensureSb): el código solo sirve junto con una clave que
// quedó guardada en ESTE celular al empezar. Otra app que se registre para abrir gize:// no
// puede usarlo, y un link armado a mano no puede meter a nadie en una cuenta ajena.
const IS_NATIVE_APP = (()=>{ try { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); } catch (e) { return false; } })();
const NativeApp = () => { try { return (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() && window.Capacitor.Plugins && window.Capacitor.Plugins.App) || null; } catch (e) { return null; } };
const AUTH_LINK_USED = "gize_auth_link_used";
async function openAuthLink(url){
  const isGoogle = !!url && url.indexOf("gize://login")===0;
  if(!url || (!isGoogle && url.indexOf("gize://confirmado")!==0)) return false;
  const p=new URLSearchParams((url.split("#")[1]||"") + "&" + ((url.split("?")[1]||"").split("#")[0]));
  // getLaunchUrl() devuelve el mismo link en cada recarga de la app (ej. después de cerrar
  // sesión): sin esta marca, el logout volvía a entrar solo con los tokens del mail.
  const mark=(p.get("code")||p.get("access_token")||p.get("error_code")||"").slice(-24);
  try{ if(mark && localStorage.getItem(AUTH_LINK_USED)===mark) return false; localStorage.setItem(AUTH_LINK_USED, mark); }catch(e){}
  const failMsg = isGoogle ? GOOGLE_ERROR_MSG : CONFIRM_ERROR_MSG;
  // El token de recuperar contraseña no se acepta por gize:// (cualquier app podría abrir ese
  // esquema y quedárselo): el botón del mail va a la web y en la app se escribe el código.
  if(!isGoogle && p.get("recuperar")) return false;
  if(p.get("error")||p.get("error_code")||p.get("error_description")){ clearGoogleIntent(); showLogin(failMsg+authErrDetail(p.get("error_description")||p.get("error")),"in"); return true; }
  // Solo el código PKCE: un link con tokens sueltos (#access_token=...) se ignora.
  const code=p.get("code"); if(!code) return false;
  if(!State.sb) await ensureSb();
  if(!State.sb){ clearGoogleIntent(); showLogin(failMsg,"in"); return true; }
  const r=await State.sb.auth.exchangeCodeForSession(code);
  if(r.error||!r.data.session){
    clearGoogleIntent();
    // Link de los mails de antes (va a Supabase, que ya gastó el token al abrirlo) que no se
    // pudo canjear acá: el código de ese mail tampoco sirve, hay que pedir otro.
    // Sin la clave PKCE de este celular («code verifier») el link es de otro celular: puede
    // ser de recuperar la contraseña o de confirmar el mail, se avisan las dos cosas.
    const pedido=recoveryRequested(), otro=/verifier|flow.?state/i.test((r.error && r.error.message)||"");
    if(!isGoogle && (pedido || otro)){
      clearRecoveryRequest(); if(window.coreCancel) window.coreCancel();
      if(pedido) showLogin(RECOVERY_MSG.oldLink, "forgot");
      else showLogin("Ese link se pidió en otro celular o navegador y por seguridad no sirve acá. Si era para confirmar tu mail, ya quedó confirmado: ingresá con tu mail y tu contraseña. Si era para cambiar la contraseña, pedí un mail nuevo desde «¿Olvidaste tu contraseña?».", "in");
      return true;
    }
    showLogin(failMsg+authErrDetail(r.error && r.error.message),"in"); return true;
  }
  if(!isGoogle && recoveryRequested()){
    clearRecoveryRequest(); clearAuthExpect();
    setRecoveryPending(r.data.session);
    if(window.coreCancel) window.coreCancel();
    showLogin("", "newpass");
    return true;
  }
  if(isGoogle){
    if(window.coreReplay) window.coreReplay();
    try{ await afterLogin(r.data.session.user); } finally { if(window.coreEnter) window.coreEnter(); }
  }
  else await showMailConfirmed(afterLogin(r.data.session.user));
  return true;
}

// Login con Google. En la web Supabase redirige a Google y vuelve a esta misma página con
// #access_token=... (createClient lo levanta solo). En la app nativa Google no deja loguearse
// dentro del WebView: se abre el navegador del sistema y vuelve por gize://login (openAuthLink).
// Lo elegido en la pantalla (rol, código del coach) se guarda antes de irse porque no viaja
// por Google; afterLogin() lo aplica al volver.
const GOOGLE_INTENT = "gize_google_intent";
const GOOGLE_ERROR_MSG = "No se pudo entrar con Google. Probá de nuevo o ingresá con tu email y contraseña.";
// El motivo que manda Supabase, para el cartel (ej. "Unable to exchange external code": Google
// rechazó la clave secreta cargada en Supabase). Se corta lo que venga después de ":" porque
// puede traer el código de un solo uso.
function authErrDetail(desc){
  let d=String(desc||"").replace(/\+/g," ");
  try{ d=decodeURIComponent(d); }catch(e){} // en el # viene codificado dos veces
  d=d.split(":")[0].trim().slice(0,120);
  return d ? " (Detalle: "+d+")" : "";
}
// Código del coach elegido al registrarse: se aplica al primer ingreso. Vence a las 2 horas y
// se borra al cerrar sesión, para que no le quede a OTRA persona que entre en este dispositivo.
const PENDING_CODE = "jfit_pending_code";
export function setPendingCode(code){ try{ localStorage.setItem(PENDING_CODE, JSON.stringify({c:String(code).toUpperCase(), t:Date.now()})); }catch(e){} }
function takePendingCode(){
  let v=null; try{ v=JSON.parse(localStorage.getItem(PENDING_CODE)||"null"); }catch(e){}
  try{ localStorage.removeItem(PENDING_CODE); }catch(e){}
  return (v && v.c && Date.now()-(v.t||0) < 2*3600000) ? v.c : null;
}
// Al cerrar sesión o borrar la cuenta: lo que quedó de esa cuenta en el dispositivo además de
// los datos (cola de envío propia, intentos de login, código de coach, alarma de descanso,
// avisos de los hábitos, la salida de Cardio en curso, los recorridos guardados y la imagen de
// la última salida compartida).
export function clearAccountLeftovers(uid){
  clearHabitAlarms();
  deleteShareFile();
  try{
    [PENDING_CODE, GOOGLE_INTENT, AUTH_EXPECT, RECOVERY_REQ, RECOVERY_PENDING, "gize_auth_link_used", "gize_rest_timer", TRACK_KEY].concat(runKeys()).forEach(k=>localStorage.removeItem(k));
    if(uid){ [OUTBOX_KEY, OUTBOX_FAILED_KEY].forEach(k=>{ const q=readQueue(k).filter(i=>i.uid!==uid); if(q.length) writeQueue(k,q); else localStorage.removeItem(k); }); }
  }catch(e){}
}
function clearGoogleIntent(){ try{ localStorage.removeItem(GOOGLE_INTENT); }catch(e){} }
function takeGoogleIntent(){
  try{ const v=JSON.parse(localStorage.getItem(GOOGLE_INTENT)||"null"); localStorage.removeItem(GOOGLE_INTENT); return v; }catch(e){ return null; }
}
export async function signInWithGoogle(opts){
  opts = opts || {};
  try{ localStorage.setItem(GOOGLE_INTENT, JSON.stringify({role:opts.role==="coach"?"coach":"client", mode:opts.mode==="up"?"up":"in", t:Date.now()})); }catch(e){}
  if(opts.code) setPendingCode(opts.code);
  // Android: la cuenta de Google del teléfono, con la ventana del sistema (dice "GIZE").
  // Si no se puede (sin cuentas en el teléfono, versión instalada fuera de Play, etc.), sigue
  // el navegador de siempre.
  if(await nativeGoogleLogin(opts)) return;
  const native = NativeApp();
  if(!native) expectAuthLink();
  const r = await State.sb.auth.signInWithOAuth({provider:"google", options:{
    redirectTo: native ? "gize://login" : location.origin + location.pathname,
    skipBrowserRedirect: !!native,
    queryParams: {prompt:"select_account"}
  }});
  if(r.error) throw r.error;
  if(native){
    const Browser = window.Capacitor.Plugins.Browser;
    if(Browser) await Browser.open({url:r.data.url, presentationStyle:"popover"});
    else location.href = r.data.url; // sin el plugin, Capacitor abre las URLs externas en el navegador
  }
}

// ---- Login nativo con Google en Android (plugin @capgo/capacitor-social-login) ----
// Usa Credential Manager: aparece la hoja del sistema con las cuentas del teléfono y el nombre
// GIZE, sin navegador. Google devuelve un ID token para el cliente web (su "aud" es
// GOOGLE_WEB_CLIENT_ID, que Supabase ya acepta) y se canjea con signInWithIdToken con nonce
// (a Google va el SHA-256, a Supabase el original).
// Requiere, en Google Cloud, un cliente OAuth de tipo Android con el paquete ar.com.gize.app y
// la huella SHA-1 del certificado con que Play firma la app (Play Console → Integridad de la app).
// Sin eso Google responde "developer error" y se cae al navegador, así que nunca queda trabado.
// Devuelve true si el intento terminó acá (entró, o el usuario cerró la hoja), false si hay que
// usar el navegador.
let _nativeGoogleReady = null;
async function nativeGoogleLogin(opts){
  if(!IS_NATIVE_APP) return false;
  let platform = ""; try{ platform = window.Capacitor.getPlatform(); }catch(e){}
  const SL = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.SocialLogin;
  if(platform !== "android" || !SL || !(window.crypto && crypto.subtle)) return false;
  const vals = opts.vals || {}, mode = opts.mode || "in";
  let res;
  const rawNonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join("");
  try{
    if(!_nativeGoogleReady) _nativeGoogleReady = SL.initialize({ google: { webClientId: GOOGLE_WEB_CLIENT_ID, mode: "online" } }).catch(e => { _nativeGoogleReady = null; throw e; });
    await _nativeGoogleReady;
    res = await SL.login({ provider: "google", options: { nonce: await sha256Hex(rawNonce) } });
  }catch(e){
    const m = String((e && (e.message || e.code)) || e);
    // Cerró la hoja o tocó atrás: se vuelve al login como estaba, sin error.
    if(/cancel/i.test(m)){ clearGoogleIntent(); showLogin("", mode, vals); return true; }
    console.error("google nativo", m);
    return false; // cualquier otra cosa: se prueba con el navegador
  }
  const idToken = res && res.result && res.result.idToken;
  if(!idToken){ console.error("google nativo: sin idToken"); return false; }
  if(window.coreReplay) window.coreReplay();
  let r;
  try { r = await State.sb.auth.signInWithIdToken({ provider: "google", token: idToken, nonce: rawNonce }); }
  catch (e) { r = { error: e }; }
  if(r.error || !r.data || !r.data.session){
    clearGoogleIntent(); if(window.coreCancel) window.coreCancel();
    showLogin(GOOGLE_ERROR_MSG + authErrDetail(r.error && r.error.message), mode, vals); return true;
  }
  try { await afterLogin(r.data.session.user); } finally { if(window.coreEnter) window.coreEnter(); }
  return true;
}

// ---- «Continuar con Apple» en la app de iPhone (mismo plugin, solo iOS) ----
// App Store pide ofrecer Apple si la app deja entrar con Google (guía 4.8). Aparece la hoja
// del sistema con el Apple ID del iPhone y Apple devuelve un ID token que se canjea con
// signInWithIdToken, igual que Google: a Apple va el SHA-256 del nonce y a Supabase el
// original. No se le pasan "scopes": sin ellos el plugin pide nombre y mail en iPhone. Con los
// del README (["email","name"]) el nombre podía no llegar: Apple lo llama "full_name".
// Requiere "Sign in with Apple" activado en el App ID ar.com.gize.app y, en Supabase, el
// proveedor Apple con ar.com.gize.app en "Client IDs".
// El rol y el código del coach elegidos se guardan igual que con Google (GOOGLE_INTENT):
// afterLogin() los aplica.
const APPLE_ERROR_MSG = "No se pudo entrar con Apple. Probá de nuevo o ingresá con tu email y contraseña.";
export function appleLoginAvailable(){
  try{
    const C = window.Capacitor;
    return !!(C && C.isNativePlatform && C.isNativePlatform() && C.getPlatform() === "ios" && C.Plugins && C.Plugins.SocialLogin);
  }catch(e){ return false; }
}
let _nativeAppleReady = null;
export async function signInWithApple(opts){
  opts = opts || {};
  const vals = opts.vals || {}, mode = opts.mode === "up" ? "up" : "in";
  if(!appleLoginAvailable() || !(window.crypto && crypto.subtle)){ showLogin(APPLE_ERROR_MSG, mode, vals); return; }
  const SL = window.Capacitor.Plugins.SocialLogin;
  try{ localStorage.setItem(GOOGLE_INTENT, JSON.stringify({role:opts.role==="coach"?"coach":"client", mode:mode, t:Date.now()})); }catch(e){}
  if(opts.code) setPendingCode(opts.code);
  const rawNonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join("");
  let res;
  try{
    if(!_nativeAppleReady) _nativeAppleReady = SL.initialize({ apple: {} }).catch(e => { _nativeAppleReady = null; throw e; });
    await _nativeAppleReady;
    res = await SL.login({ provider: "apple", options: { nonce: await sha256Hex(rawNonce) } });
  }catch(e){
    const m = String((e && (e.message || e.code)) || e);
    clearGoogleIntent();
    // Cerró la hoja de Apple: vuelve el login como estaba, sin error. iOS no dice "cancel" sino
    // "...AuthorizationError error 1001" (ASAuthorizationError.canceled), en el idioma del iPhone.
    if(/cancel|error 1001\b/i.test(m)){ showLogin("", mode, vals); return; }
    console.error("apple", m);
    showLogin(APPLE_ERROR_MSG + authErrDetail(m), mode, vals); return;
  }
  const result = (res && res.result) || {};
  if(!result.idToken){ console.error("apple: sin idToken"); clearGoogleIntent(); showLogin(APPLE_ERROR_MSG, mode, vals); return; }
  if(window.coreReplay) window.coreReplay();
  let r;
  try { r = await State.sb.auth.signInWithIdToken({ provider: "apple", token: result.idToken, nonce: rawNonce }); }
  catch (e) { r = { error: e }; }
  if(r.error || !r.data || !r.data.session){
    clearGoogleIntent(); if(window.coreCancel) window.coreCancel();
    showLogin(APPLE_ERROR_MSG + authErrDetail(r.error && r.error.message), mode, vals); return;
  }
  await saveAppleName(r.data.session.user, result.profile);
  try { await afterLogin(r.data.session.user); } finally { if(window.coreEnter) window.coreEnter(); }
}
// Apple manda el nombre solo la primera vez que alguien entra a GIZE con su Apple ID (y no
// viaja en el token, así que la cuenta nace sin nombre). Si llegó y el perfil no tiene
// nombre, se guarda; un nombre que ya estaba (cuenta vieja con el mismo mail) no se toca.
async function saveAppleName(user, profile){
  const name = [profile && profile.givenName, profile && profile.familyName].map(s => String(s || "").trim()).filter(Boolean).join(" ").slice(0, 80);
  if(!name || !user || !user.id) return;
  try{
    const pr = await State.sb.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    if(pr.error || !pr.data || String(pr.data.full_name || "").trim()) return;
    const up = await State.sb.from("profiles").update({ full_name: name }).eq("id", user.id);
    if(up.error) console.error("apple nombre", up.error);
  }catch(e){ console.error("apple nombre", e); }
}

// ---- Botón oficial de Google en la web (Google Identity Services) ----
// En vez de ir a la página de Google y volver por Supabase (que muestra "Ir a
// wegptuzhsrwppbknqstf.supabase.co"), en el navegador se usa el botón de Google: la ventana
// dice "gize.ar", no se sale de la página y Google devuelve un ID token que se canjea con
// signInWithIdToken. Si el script de Google no carga, queda el botón de siempre (redirect).
// No se usa en las apps de las tiendas ni en la app instalada desde el navegador (en el
// iPhone las ventanas emergentes no vuelven a la app): ahí sigue el flujo de siempre.
// El nonce protege contra reusar un token robado: a Google va su SHA-256 y a Supabase el
// original, que lo vuelve a hashear y lo compara con el que trae el token.
// Requiere https://gize.ar en "Orígenes autorizados de JavaScript" del cliente web en Google Cloud.
const GOOGLE_WEB_CLIENT_ID = "1016240784948-5a0pe2k2baf7n34aq15it3fokl73r5ga.apps.googleusercontent.com";
let _gisLoad = null;
function loadGis(){
  if (window.google && google.accounts && google.accounts.id) return Promise.resolve();
  if (_gisLoad) return _gisLoad;
  _gisLoad = new Promise((res, rej) => {
    const sc = document.createElement("script");
    sc.src = "https://accounts.google.com/gsi/client"; sc.async = true;
    sc.onload = () => (window.google && google.accounts && google.accounts.id) ? res() : rej(new Error("gis"));
    sc.onerror = () => rej(new Error("gis"));
    document.head.appendChild(sc);
    setTimeout(() => rej(new Error("gis timeout")), 8000);
  }).catch(e => { _gisLoad = null; throw e; });
  return _gisLoad;
}
function useGisButton(){
  if (IS_NATIVE_APP) return false;
  try { if ((window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone) return false; } catch (e) {}
  return !!(window.crypto && crypto.subtle && crypto.getRandomValues);
}
async function sha256Hex(txt){
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(txt));
  return Array.from(new Uint8Array(d), b => b.toString(16).padStart(2, "0")).join("");
}
// Lo llama showLogin después de dibujar la pantalla: cambia el botón propio por el de Google.
export async function mountGoogleButton(){
  if (!useGisButton()) return;
  const own = document.querySelector('[data-auth="google"]'); if (!own) return;
  try { await loadGis(); } catch (e) { return; } // sin el script de Google queda el botón de siempre
  if (!document.body.contains(own) || own.disabled) return; // la pantalla se volvió a dibujar
  const rawNonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join("");
  const isUp = !!document.getElementById("auRole");
  try {
    google.accounts.id.initialize({
      client_id: GOOGLE_WEB_CLIENT_ID,
      nonce: await sha256Hex(rawNonce),
      callback: r => onGoogleCredential(r, rawNonce),
      ux_mode: "popup", context: isUp ? "signup" : "signin",
      auto_select: false, itp_support: true, use_fedcm_for_button: true,
    });
    const slot = document.createElement("div");
    slot.className = "auth-google-gis";
    slot.style.animationDelay = own.style.animationDelay;
    own.after(slot);
    const w = Math.max(200, Math.min(400, Math.round(own.getBoundingClientRect().width) || 320));
    google.accounts.id.renderButton(slot, {
      type: "standard", theme: "filled_black", size: "large", shape: "pill",
      text: isUp ? "signup_with" : "continue_with", logo_alignment: "center", width: w, locale: "es-419",
    });
    own.hidden = true; // queda en la página por si hace falta volver al flujo de siempre
  } catch (e) { console.error("google button", e); }
}
let _gisBusy = false;
async function onGoogleCredential(resp, rawNonce){
  // Un login a la vez: si afterLogin tarda más que el splash, el login vuelve a verse y un
  // segundo toque arrancaba otro en paralelo (dos canjes, dos cargas, coach aplicado dos veces).
  // Con la sesión perdida (sessionLost) cloudUser sigue puesto a propósito: hay que dejar entrar igual.
  if (_gisBusy || (State.cloudUser && !State.sessionLost)) return;
  _gisBusy = true;
  try { await googleCredentialLogin(resp, rawNonce); } finally { _gisBusy = false; }
}
async function googleCredentialLogin(resp, rawNonce){
  const isUp = !!document.getElementById("auRole");
  const role = ((document.getElementById("auRole") || {}).value || "client").trim();
  const code = ((document.getElementById("auCode") || {}).value || "").trim();
  // Si algo falla, el login vuelve como estaba (modo, "Soy coach", código y lo escrito).
  const V = { role, code, name: ((document.getElementById("auName") || {}).value || "").trim(), email: ((document.getElementById("auEmail") || {}).value || "").trim() };
  // Lo mismo que guarda signInWithGoogle antes de irse: afterLogin lo aplica (coach / código).
  try { localStorage.setItem(GOOGLE_INTENT, JSON.stringify({ role: isUp && role === "coach" ? "coach" : "client", mode: isUp ? "up" : "in", t: Date.now() })); } catch (e) {}
  if (isUp && role === "client" && code) setPendingCode(code);
  if (window.coreReplay) window.coreReplay();
  if (!State.sb) await ensureSb();
  if (!State.sb) { if (window.coreCancel) window.coreCancel(); clearGoogleIntent(); showLogin("No se pudo conectar con el servidor. Revisá tu conexión a internet y volvé a intentar.", isUp ? "up" : "in", V); return; }
  let r;
  try { r = await State.sb.auth.signInWithIdToken({ provider: "google", token: resp && resp.credential, nonce: rawNonce }); }
  catch (e) { r = { error: e }; }
  if (r.error || !r.data || !r.data.session) {
    clearGoogleIntent(); if (window.coreCancel) window.coreCancel();
    showLogin(GOOGLE_ERROR_MSG + authErrDetail(r.error && r.error.message), isUp ? "up" : "in", V); return;
  }
  try { await afterLogin(r.data.session.user); } finally { if (window.coreEnter) window.coreEnter(); }
}

// supabase-js NO lanza excepción cuando una query falla (RLS, red, columna inexistente):
// devuelve {data:null, error}. Un try/catch a secas no atrapa nada, y el código seguía
// como si se hubiera guardado. Envolvé cada escritura con sbOk() para que un error
// real llegue al catch.
// Fecha (AAAA-MM-DD) de hace n días, en hora local.
function daysAgo(n){ const d=new Date(); d.setDate(d.getDate()-n); return ymd(d); }

export function sbOk(r){ if(r && r.error) throw r.error; return r; }

// Supabase devuelve como máximo 1000 filas por pedido ("Max rows" del proyecto) y corta
// el resto SIN avisar: con más de 1000 entrenos o registros diarios, loadCloud() traía un
// pedazo del historial y el coach veía conteos de menos. fetchAll() pide de a 1000 hasta
// que una página vuelve incompleta. make() arma la consulta de cero en cada página y
// tiene que tener un orden único (si no, entre páginas se repiten o saltean filas).
// Devuelve {data, error} como una consulta normal. Si alguien baja "Max rows" por debajo
// de 1000, la primera página vuelve incompleta y se corta como antes (no empeora nada).
const PAGE=1000;
export async function fetchAll(make){
  const all=[];
  for(let from=0;;from+=PAGE){
    const r=await make().range(from, from+PAGE-1);
    if(r.error) return {data:null, error:r.error};
    const rows=r.data||[];
    for(const x of rows) all.push(x);
    if(rows.length<PAGE) return {data:all, error:null};
  }
}

// Pasa a la rutina que mandó el coach (cloudDays) lo que el cliente ya cargó en su copia
// local (kg, reps, segundos y tildes), emparejando por id de serie. Si el coach cambió una serie
// existente se conserva lo cargado; si aplicó una rutina nueva (ids nuevos) arranca limpia.
export function mergeLocalProgress(cloudDays, localDays){
  const prog={};
  (localDays||[]).forEach(d=>(d.exercises||[]).forEach(ex=>(ex.sets||[]).forEach(s=>{ prog[s.id]=s; })));
  (cloudDays||[]).forEach(d=>(d.exercises||[]).forEach(ex=>(ex.sets||[]).forEach(s=>{
    const l=prog[s.id]; if(l){ s.kg=l.kg; s.reps=l.reps; s.done=l.done; if(l.secs!=null) s.secs=l.secs; }
  })));
  return cloudDays;
}

// Alumno con coach: pone en state.days la rutina que va hoy. En una semana de descarga con
// rutina armada por el coach, esa; si no, la de siempre (state.regularDays, la de la tabla
// routines). Lo cargado a mano (kg, reps, tildes) se conserva como siempre, y al pasar a la
// de descarga se guarda lo de la de siempre para devolverlo cuando vuelve (el lunes siguiente).
// Devuelve true si cambió de una a otra.
// ¿Hay un entreno en curso? (empezado hace menos de 6 horas: uno olvidado no frena nada)
const training = () => !!(state.wkStart && Date.now() - (state.wkStart.ts || 0) < 6 * 3600 * 1000);
export function applyCoachRoutine(){
  const regular = Array.isArray(state.regularDays) && state.regularDays.length ? state.regularDays : null;
  const dl = activeDeload(state.block, today());
  const mode = dl ? dl.key : "regular", prev = state.routineMode || "regular";
  // En medio de un entreno que pasa la medianoche del domingo no se cambia de rutina (se
  // perdería lo cargado): cambia al guardarlo o cancelarlo, en el próximo dibujo de la app.
  if(mode !== prev && training()) return false;
  if(!dl && !regular){
    // Sin rutina de siempre en la nube: al terminar la descarga vuelve lo que tenía antes (si
    // no hay nada guardado, queda la de descarga hasta que el coach cargue otra).
    if(prev === "regular") return false;
    if(Array.isArray(state.preDeloadDays) && state.preDeloadDays.length) state.days = state.preDeloadDays;
    state.preDeloadDays = null; state.routineMode = "regular";
    ensureDays();
    return true;
  }
  const clone = d => JSON.parse(JSON.stringify(d));
  if(mode !== "regular" && prev === "regular") state.preDeloadDays = state.days;
  if(!dl && prev !== "regular" && Array.isArray(state.preDeloadDays)){
    state.days = mergeLocalProgress(clone(regular), state.preDeloadDays);
    state.preDeloadDays = null;
  } else {
    state.days = mergeLocalProgress(clone(dl ? dl.days : regular), state.days);
  }
  if(mode === "regular") state.preDeloadDays = null;
  state.routineMode = mode;
  migrateNames(state.days);
  ensureDays();
  return mode !== prev;
}

// ¿Toca cambiar de rutina? (empezó o terminó la semana de descarga desde la última vez). Es
// barato: se mira en cada renderApp para que cambie aunque la app siga abierta o sin señal.
export function coachRoutineDue(){
  if(training()) return false;
  const mode = state.routineMode || "regular";
  if(mode === "regular" && !(Array.isArray(state.regularDays) && state.regularDays.length)) return false;
  const dl = activeDeload(state.block, today());
  return (dl ? dl.key : "regular") !== mode;
}

// Sin coach la rutina es del alumno: si quedó mostrando una de descarga (se desvinculó en esa
// semana), vuelve a la de siempre (o a la que tenía antes) antes de que se suba como propia.
function leaveCoachRoutine(){
  if(state.routineMode && state.routineMode !== "regular"){
    if(Array.isArray(state.regularDays) && state.regularDays.length)
      state.days = mergeLocalProgress(JSON.parse(JSON.stringify(state.regularDays)), state.preDeloadDays || state.days);
    else if(Array.isArray(state.preDeloadDays) && state.preDeloadDays.length) state.days = state.preDeloadDays;
    ensureDays();
  }
  state.routineMode = "regular"; state.regularDays = null; state.preDeloadDays = null;
}
// El plan de su coach venció hace más de 4 días y la base lo pasó al sistema común
// (supabase/coach-vencido.sql): se le avisa una vez (por celular), solo si pasó hace poco.
const COACH_LEFT_KEY="gize_coach_left_visto";
function noticeCoachLeft(p){
  if(!p || p.role==="coach" || p.coach_id || !p.coach_left_at) return;
  const t=new Date(p.coach_left_at).getTime();
  if(!(t>0) || Date.now()-t > 30*864e5) return;
  try{ if(localStorage.getItem(COACH_LEFT_KEY)===p.coach_left_at) return; localStorage.setItem(COACH_LEFT_KEY, p.coach_left_at); }catch(e){ return; }
  setTimeout(()=>alert("Tu coach ya no está en GIZE.\n\nTu rutina y todo tu progreso siguen acá, y ahora los podés modificar vos. Si vuelve, te podés vincular de nuevo con su código."), 900);
}
// Mientras se muestra una rutina de descarga no se sube la rutina como propia del alumno.
const onRegular = () => (state.routineMode || "regular") === "regular";

export function applyBrand(){
  const t=document.getElementById("brandTag"), n=document.getElementById("brandName");
  if(!t||!n) return;
  // La pestaña siempre dice solo "GIZE" (el nombre del coach se ve adentro de la app).
  document.title="GIZE";
  if(State.brandName){ n.textContent=State.brandName; t.style.display="block"; }
  else { t.style.display="none"; }
}

// Crear el cliente de Supabase apenas el script del CDN esté listo. No alcanza con
// probar una sola vez al cargar el módulo: si el <script> del CDN todavía no terminó
// de ejecutarse en ese instante, State.sb quedaba en null para siempre y cualquier
// login explotaba con "Cannot read properties of null (reading 'auth')" aunque la
// librería cargara bien un momento después. Por eso reintentamos un rato.
// Si el script del CDN directamente no cargó (sin internet y todavía sin copia en el
// caché del service worker), se vuelve a pedir en el próximo intento, que es cuando el
// usuario toca "Ingresar". Antes el primer fracaso quedaba guardado para siempre.
// "Mantener la sesión iniciada" (casilla del login). Tildada, la sesión va a localStorage y
// sobrevive a cerrar el navegador o la app, como siempre. Destildada va a sessionStorage, que
// se borra al cerrar la pestaña o matar la app. Supabase lee con getItem, así que se busca en
// los dos lados: las sesiones que ya estaban guardadas en localStorage siguen andando.
export const REMEMBER_KEY = "gize_remember";
const EPHEMERAL_KEY = "gize_session_ephemeral";
export function rememberSession(){ try{ return localStorage.getItem(REMEMBER_KEY)!=="0"; }catch(e){ return true; } }
export function setRememberSession(on){ try{ localStorage.setItem(REMEMBER_KEY, on ? "1" : "0"); }catch(e){} }
const authStorage = {
  getItem(k){ try{ const s=sessionStorage.getItem(k); if(s!=null) return s; }catch(e){} try{ return localStorage.getItem(k); }catch(e){ return null; } },
  setItem(k, v){
    // La clave PKCE tiene que sobrevivir a que el sistema cierre la app mientras está en Google.
    const keep=rememberSession() || /code-verifier$/.test(k);
    try{ (keep ? localStorage : sessionStorage).setItem(k, v); }catch(e){}
    try{ (keep ? sessionStorage : localStorage).removeItem(k); }catch(e){}
  },
  removeItem(k){ try{ sessionStorage.removeItem(k); }catch(e){} try{ localStorage.removeItem(k); }catch(e){} }
};

let _sbReady = null, _sbFailed = false;
export function ensureSb(){
  if (State.sb) return Promise.resolve(State.sb);
  if (_sbReady) return _sbReady;
  const tryInit = () => {
    if (!State.sb && window.supabase) { try { State.sb = window.supabase.createClient(SB_URL, SB_KEY, {auth:{storage:authStorage, flowType: IS_NATIVE_APP ? "pkce" : "implicit"}, global:{fetch:noAnonFetch}}); watchAuth(State.sb); } catch(e){} }
    return !!State.sb;
  };
  if (_sbFailed && !window.supabase) reloadSbScript();
  _sbReady = tryInit() ? Promise.resolve(State.sb) : new Promise(resolve=>{
    let tries=0;
    const iv=setInterval(()=>{
      tries++;
      if (tryInit() || tries>=160){ // ~8s a 50ms
        clearInterval(iv);
        if(!State.sb){ _sbFailed=true; _sbReady=null; }
        resolve(State.sb);
      }
    },50);
  });
  return _sbReady;
}

// Avisos de supabase-js sobre la sesión. Se atienden con setTimeout: durante el aviso la
// librería todavía tiene tomada la sesión y pedírsela (getSession, en flushOutbox) se trabaría.
// - TOKEN_REFRESHED / SIGNED_IN: vuelve a haber sesión, sale lo pendiente (la cola espera
//   la sesión, ver flushOutbox).
// - SIGNED_OUT sin haber tocado "Salir" en este dispositivo (se cerró desde otro, o el
//   servidor ya no acepta renovarla): antes nadie se enteraba, la app seguía "adentro" y
//   todo lo que se cargaba se mandaba como anónimo y se perdía. Ahora se pide ingresar de
//   nuevo, sin borrar la cola ni los datos del celular: si entra la misma cuenta,
//   afterLogin() sube lo pendiente.
// - Si la app abrió sin sesión viva (_staleBoot, ver cloudBoot), al renovarse el token además
//   se lee la cuenta: lo pendiente sale primero porque loadCloud() pisa lo local con la nube.
function watchAuth(sb){
  sb.auth.onAuthStateChange(ev=>{
    if(ev==="TOKEN_REFRESHED" || ev==="SIGNED_IN") setTimeout(()=>{ flushOutbox().then(()=>{ if(_staleBoot) retryCloud(); }); }, 0);
    else if(ev==="SIGNED_OUT") setTimeout(sessionLost, 0);
  });
}
// Con una cuenta adentro, un pedido a la base con la clave anónima quiere decir que la librería
// no tiene sesión viva (token vencido que no se pudo renovar sin señal): la base lo rechaza o
// devuelve vacío, y un alumno con coach quedaba con las listas vacías como si fueran de la
// nube. Se corta acá, como un corte de red (sin "code": la cola lo reintenta, loadCloud
// conserva lo local). /auth/ va siempre con la clave: es el que renueva la sesión.
function noAnonFetch(url, opts){
  const h=new Headers(opts && opts.headers);
  if(State.cloudUser && h.get("Authorization")==="Bearer "+SB_KEY && !/\/auth\/v1\//.test(String((url && url.url) || url)))
    return Promise.reject(new TypeError("Sin sesión con tu cuenta: no se manda como anónimo"));
  return fetch(url, opts);
}
// La app abrió con la sesión guardada en el celular sin que la librería la pudiera renovar
// (ver cloudBoot, afterLogin(user, true)). afterLogin() se saltea lo que necesita red y se
// completa cuando vuelve la sesión (staleCatchUp).
let _staleBoot=false, _inLogin=false;
// Lo que afterLogin() se salteó por abrir sin sesión viva (nombre del coach, alumnos) se pide
// apenas un loadCloud() cualquiera logra leer la cuenta, no solo el de retryCloud(): con una
// renovación lenta (~3 s, 3G) la lectura la lograba el loadCloud() de afterLogin u otro
// (Configuración), retryCloud() ya no hacía nada y el coach quedaba con «Clientes (0)».
async function staleCatchUp(){
  _staleBoot=false;
  const coach=State.cloudProfile && State.cloudProfile.role==="coach";
  try{
    if(coach){ State.brandName=State.cloudProfile.full_name||""; await Promise.all([loadCoachClients(), loadCoachQuestions().catch(()=>{})]); }
    else { const cn=await State.sb.rpc("my_coach_name"); State.brandName=cn.data||""; }
  }catch(e){}
  applyBrand();
  if(coach) renderCoach();
}
function sessionLost(){
  if(!State.cloudUser || State.signingOut) return;
  // cloudUser NO se borra: sin él la cola deja de juntar lo que se carga y el pie diría «Se
  // guarda solo en este dispositivo». Esta marca deja pasar los ingresos que se frenan con
  // «ya hay una cuenta adentro» (Google web, links gize://); afterLogin la saca.
  State.sessionLost=true;
  refreshSyncFoot();
  const h=document.getElementById("authHost");
  if(h && h.style.display==="flex" && h.innerHTML) return; // ya está pidiendo ingresar: no se borra lo que escribió
  showLogin(LOST_MSG, "in", {email:State.cloudUser.email||""});
}
const LOST_MSG="Tu sesión se cerró (por ejemplo, si saliste desde otro dispositivo). Ingresá de nuevo con tu cuenta: lo que cargaste en este celular sigue guardado y se sube al entrar.";

function reloadSbScript(){
  const old=document.querySelector('script[src*="supabase"]'); if(!old) return;
  const s=document.createElement("script"); s.src=old.src;
  old.replaceWith(s);
}

// El perfil se guarda también en el dispositivo: si la app abre sin internet, loadCloud()
// no lo puede leer y un coach terminaba viendo la app de cliente. Se guarda junto con el
// id de usuario para no usarle el perfil de otra cuenta; el logout lo borra.
export const PROFILE_KEY = "core_profile_v1";
function saveCachedProfile(p){ try{ if(p) localStorage.setItem(PROFILE_KEY, JSON.stringify({uid:State.cloudUser.id, profile:p})); }catch(e){} }
function cachedProfile(){
  try{ const c=JSON.parse(localStorage.getItem(PROFILE_KEY)||"null"); return (c && State.cloudUser && c.uid===State.cloudUser.id) ? c.profile : null; }catch(e){ return null; }
}
// Ojo: no llamar a ensureSb() acá arriba. core/state.js -> core/storage.js ->
// core/supabase.js -> core/state.js forman un ciclo de imports; si esta función
// corre durante esa evaluación circular, "State" todavía está en su temporal dead
// zone y explota con "Cannot access 'State' before initialization" (el try/catch
// de antes lo tapaba silenciosamente, dejando State.sb en null para siempre).
// cloudBoot() ya llama a ensureSb() apenas termina de cargar todo el árbol de
// módulos, momento en el que "State" ya está inicializado sin problema.

// Actividad para el panel de administrador: cuándo se abrió la app, con qué versión y en qué
// plataforma (la base lo guarda como mucho una vez por hora, ver touch_me en supabase/admin.sql).
async function touchMe(){
  try{
    let version="web", platform="web";
    const C=window.Capacitor;
    if(C && C.isNativePlatform && C.isNativePlatform()){
      platform=C.getPlatform();
      try{ const info=await C.Plugins.App.getInfo(); version=info.version+" ("+info.build+")"; }catch(e){ version="?"; }
    }
    await State.sb.rpc("touch_me",{p_version:version, p_platform:platform});
  }catch(e){}
}

export async function afterLogin(sessionUser, stale){
  clearAuthExpect(); // ya entró: un link ajeno que llegue después no se acepta sin preguntar
  clearRecoveryPending(); // entró de verdad (con la contraseña nueva o con otro ingreso)
  // getUser() revalida el token pegándole a la red. Si no hay conexión esa llamada
  // falla y ANTES dejábamos State.cloudUser en null: como flushOutbox()/pendingCount()
  // filtran la cola por el id de usuario, un cloudUser null "escondía" lo pendiente
  // (mostraba "Se guarda solo en este dispositivo" con la cola intacta pero invisible)
  // y loadCloud() cortaba de raíz. Arrancamos con el usuario de la sesión (el que devolvió
  // getSession(), o el guardado en el celular si no se pudo renovar sin señal: ver cloudBoot)
  // y solo lo reemplazamos por la versión fresca del servidor si getUser() llega a responder.
  // Ojo: getSession() lee la sesión guardada sin red solo mientras el token está vigente; si
  // venció, intenta renovarlo y sin señal reintenta ~30 s antes de devolver session:null.
  State.cloudUser = sessionUser || State.cloudUser || null;
  State.sessionLost = false;
  _staleBoot = !!stale;
  // Pide que el navegador no borre lo guardado (sesión y datos) cuando le falta espacio o la
  // página no se abre por un tiempo. Si no lo concede, sigue igual que antes.
  try{ if(State.cloudUser && navigator.storage && navigator.storage.persist) navigator.storage.persisted().then(p=>{ if(!p) navigator.storage.persist().catch(()=>{}); }).catch(()=>{}); }catch(e){}
  if(State.cloudUser && State.sb) setTimeout(touchMe, 4000);
  // Los datos del celular son de quien los cargó (state.ownerUid). Si entra OTRA cuenta en
  // este dispositivo se empieza de cero, para que no herede la rutina ni el diario ajenos.
  // Antes eso se hacía borrando todo al perder la sesión, y se perdía lo que todavía no se
  // había subido a la cuenta: ahora solo se borra cuando de verdad entra otra persona.
  // Celulares con la versión anterior (sin ownerUid): el dueño es el del último perfil guardado.
  let owner=state.ownerUid;
  if(!owner){ try{ owner=(JSON.parse(localStorage.getItem(PROFILE_KEY)||"null")||{}).uid||null; }catch(e){} }
  if(State.cloudUser && owner && owner!==State.cloudUser.id){
    // También lo de Cardio de la otra cuenta: la salida en curso (y su GPS), los recorridos
    // guardados y la imagen compartida. Si no, al recargar se retomaría su salida en esta cuenta.
    stopForLogout(); deleteShareFile();
    try{ localStorage.removeItem(KEY); localStorage.removeItem(PROFILE_KEY); [TRACK_KEY].concat(runKeys()).forEach(k=>localStorage.removeItem(k)); }catch(e){}
    location.reload(); return;
  }
  if(State.cloudUser && state.ownerUid!==State.cloudUser.id){ state.ownerUid=State.cloudUser.id; try{ localStorage.setItem(KEY, JSON.stringify(state)); }catch(e){} }
  try{ localStorage.removeItem(EPHEMERAL_KEY); }catch(e){}
  // Sin sesión viva (_staleBoot) getUser() y el envío de la cola esperarían los ~30 s de
  // reintentos de la librería con la pantalla vacía: se saltean y salen cuando se renueva
  // el token (watchAuth → flushOutbox + retryCloud).
  let gu=null;
  if(!_staleBoot){ try { gu=await State.sb.auth.getUser(); if(gu.data.user) State.cloudUser=gu.data.user; } catch(e){} }
  // Sesión cerrada desde otro dispositivo con el token todavía vigente: el servidor dice que
  // no existe y la librería la borra. Seguir cargaría la cuenta sin sesión: se pide ingresar.
  if(gu && gu.error && gu.error.name==="AuthSessionMissingError"){ sessionLost(); return; }
  rescueFailed();
  // Primero se envía lo que quedó pendiente de otra sesión (sin conexión, app cerrada):
  // loadCloud() reemplaza entrenos/registros locales por los de la nube.
  if(!_staleBoot){ try { await flushOutbox(); } catch(e){ console.error("flushOutbox",e); } }
  // El nombre del coach no depende de loadCloud(): se pide en paralelo en vez de después.
  let coachNameP=_staleBoot ? Promise.resolve({data:null}) : Promise.resolve(State.sb.rpc("my_coach_name")).catch(()=>({data:null}));
  _inLogin=true; // lo salteado lo completa afterLogin mismo (ver abajo), no staleCatchUp()
  await loadCloud();
  if(!State.cloudProfile) State.cloudProfile=cachedProfile(); // sin conexión: el último perfil conocido
  // Registro con Google (o Apple) eligiendo "Soy coach": la cuenta nace como cliente (ver login-google.sql).
  const gi=takeGoogleIntent();
  // Entró con Google o Apple desde "Ingresar" (no desde "Crear cuenta") y la cuenta se creó recién:
  // puede que ya tuviera otra cuenta con otro mail (a un tester le pasó y creyó que había
  // perdido todo). Se le avisa con qué mail quedó y qué hacer si no era la que quería.
  try{
    const u=State.cloudUser||{};
    const fresh = u.created_at && Date.now()-Date.parse(u.created_at) < 10*60*1000;
    const via = p => (u.app_metadata && u.app_metadata.provider===p) || (u.identities||[]).some(i=>i.provider===p);
    const prov = via("google") ? "Google" : (via("apple") ? "Apple" : "");
    if(gi && gi.mode!=="up" && Date.now()-gi.t < 15*60*1000 && fresh && prov){
      // Con Apple se puede ocultar el mail: llega una dirección de reenvío que no dice nada.
      // (Los mails a esa dirección llegan solo si gize.ar está registrado en Apple: ver App.entitlements.)
      const mail=(u.email && !/@privaterelay\.appleid\.com$/i.test(u.email)) ? u.email : "tu cuenta de "+prov;
      setTimeout(()=>alert("Creamos una cuenta nueva de GIZE con "+mail+".\n\nSi es tu primera vez, ¡bienvenido! Si ya tenías una cuenta con OTRO mail, andá a Ajustes → Salir y entrá con ese mail y tu contraseña: ahí están tus datos."), 900);
    }
  }catch(e){}
  if(gi && gi.role==="coach" && !appIOS() && Date.now()-gi.t < 15*60*1000 && State.cloudProfile && State.cloudProfile.role!=="coach"){
    try{
      const rc=await State.sb.rpc("become_coach_new_account");
      if(rc.data===true){ try{ localStorage.removeItem("jfit_pending_code"); }catch(e){} await loadCloud(); }
    }catch(e){ console.error("become coach",e); }
  }
  try{
    // takePendingCode lo saca del dispositivo pase lo que pase (y si venció no lo usa).
    const pc=takePendingCode();
    if(pc && State.cloudProfile && State.cloudProfile.role!=="coach" && !State.cloudProfile.coach_id){
      const r2=await State.sb.rpc("join_coach",{code:pc});
      if(r2.error && r2.error.code==="P0001" && r2.error.message){ const m=joinMsgTienda(r2.error.message); setTimeout(()=>alert(m+" Podés poner el código después en Configuración."), 600); }
      if(r2.data===true){ coachNameP=Promise.resolve(State.sb.rpc("my_coach_name")).catch(()=>({data:null})); const pr=await State.sb.from("profiles").select("*").eq("id",State.cloudUser.id).maybeSingle(); if(pr.data) State.cloudProfile=pr.data; await loadCloud(); }
    }
  }catch(e){ console.error("pending code",e); }
  _inLogin=false;
  // La sesión se renovó mientras tanto y loadCloud() pudo leer: lo salteado va normal acá abajo.
  if(_staleBoot && State.cloudReady){ _staleBoot=false; coachNameP=Promise.resolve(State.sb.rpc("my_coach_name")).catch(()=>({data:null})); }
  hideLogin();
  try{
    if(State.cloudProfile && State.cloudProfile.role==="coach"){ State.brandName=State.cloudProfile.full_name||""; }
    else { const cn=await coachNameP; State.brandName=cn.data||""; }
  }catch(e){ State.brandName=""; }
  applyBrand();
  if (State.cloudProfile && State.cloudProfile.role==="coach"){ if(!_staleBoot) await Promise.all([loadCoachClients(), loadCoachQuestions().catch(()=>{})]); renderCoach(); checkPaymentReturn(); syncPush(); }
  else { renderApp(); syncPush(); } // sin await: no demora la entrada
  maybeShowOnboarding(); // cuenta nueva: bienvenida (una sola vez), encima de la app
  window.dispatchEvent(new Event("gize:login")); // chat: botón, globitos y aviso tocado (main.js)
}

export async function loadCloud(){
  if(!State.sb||!State.cloudUser) return;
  // Sin sesión viva no se lee: las consultas saldrían como anónimo (ver noAnonFetch) y fallarían
  // igual. Se reintenta más tarde; lo local queda como está y el pie avisa que no hay conexión.
  if(!await liveSession(State.cloudUser.id, _staleBoot ? 300 : 3000)){ scheduleCloudRetry(); return; }
  State.cloudLoading=true;
  try{
    // Supabase no lanza cuando una lectura falla: devuelve {data:null, error}. Un data null
    // por error NO significa "no hay nada en la nube", así que cada lectura se chequea y,
    // si falló, se conserva lo local en vez de pisarlo (o de subirlo como si fuera nuevo).
    // Perfil y rutina son imprescindibles: sin ellos se corta acá y cloudReady queda false.
    // Todas las lecturas salen juntas (antes iban de a una y el arranque sumaba ~12 idas
    // y vueltas a Supabase); después se aplican en el mismo orden de siempre.
    const uid=State.cloudUser.id, sb=State.sb;
    // Una sola vez (una consulta de supabase-js sale de nuevo cada vez que se la espera).
    const prof=Promise.resolve(sb.from("profiles").select("*").eq("id",uid).maybeSingle());
    const [pr0, rt0, ws, ss, dl, ck, ci, bl, np, fe, cp, cq, fw, so] = await Promise.all([
      prof,
      // Si el coach dejó programada una rutina que ya empezó, se aplica antes de leerla
      // (ver supabase/rutina-programada.sql). Si la función no existe todavía, sigue igual.
      sb.rpc("apply_due_routines").then(()=>0, ()=>0).then(()=>sb.from("routines").select("days, updated_at").eq("client_id",uid).maybeSingle()),
      // Las tablas que crecen con el uso van con fetchAll() (sin eso, más de 1000 filas se
      // cortaban). Orden único: fecha (única por cliente) o created_at + id.
      fetchAll(()=>sb.from("body_weights").select("*").eq("client_id",uid).order("measured_on")),
      // "*" y no una lista de columnas: trae rpe/pump/joint_pain si existen sin romper la consulta si no.
      fetchAll(()=>sb.from("sessions").select("*, session_entries(exercise_name,set_order,kg,reps,secs)").eq("client_id",uid).order("created_at").order("id")),
      fetchAll(()=>sb.from("daily_logs").select("*").eq("client_id",uid).order("log_date")),
      fetchAll(()=>sb.from("checkins").select("*").eq("client_id",uid).order("week_start")),
      sb.from("client_info").select("*").eq("client_id",uid).maybeSingle(),
      sb.from("blocks").select("*").eq("client_id",uid).eq("active",true).order("start_date",{ascending:false}).limit(1),
      sb.from("nutrition").select("*").eq("client_id",uid).maybeSingle(),
      sb.from("food_entries").select("*").eq("client_id",uid).eq("log_date",today()).order("pos"),
      sb.from("client_prefs").select("*").eq("client_id",uid).maybeSingle(),
      // Preguntas de mi coach (la política de la tabla solo deja ver la fila del coach
      // propio). Si la tabla todavía no existe en la base, da error y se ignora: quedan
      // las predeterminadas.
      sb.from("coach_questions").select("daily, checkin").maybeSingle(),
      // Calorías de los 7 días anteriores, para el promedio semanal de Comida.
      sb.from("food_entries").select("log_date, kcal").eq("client_id",uid).gte("log_date",daysAgo(7)).lt("log_date",today()),
      // Salidas de Cardio a pie / en bici (supabase/cardio-a-pie.sql), sin el recorrido: ese se
      // pide al abrir una (fetchSalidaTrack). Si la tabla todavía no existe da error y quedan las
      // del celular. Una cuenta de coach no las pide (no registra salidas).
      prof.then(r=>(r && r.data && r.data.role==="coach") ? null : fetchAll(()=>sb.from("cardio_outings").select(SALIDA_COLS).eq("client_id",uid).order("started_at").order("id")), ()=>null)
    ]);
    const pr=sbOk(pr0);
    State.cloudProfile=pr.data||null;
    saveCachedProfile(State.cloudProfile);
    // Sin coach: si quedó en una rutina de descarga, vuelve a la suya ya, antes de cualquier
    // otra lectura (si la de la rutina falla, igual no se sube la de descarga como propia).
    if(!(State.cloudProfile && State.cloudProfile.role==="coach") && !routineLocked()) leaveCoachRoutine();
    noticeCoachLeft(State.cloudProfile);
    // Link de la foto de perfil propia (no frena el arranque; redibuja Ajustes al llegar).
    if(State.cloudProfile && State.cloudProfile.avatar_path){
      resolveAvatars([State.cloudProfile.avatar_path]).then(ok=>{ if(ok && State.view==="config") renderApp(); }).catch(()=>{});
    }
    const rt=sbOk(rt0);
    // La rutina de cliente no es del coach: antes, al entrar un coach se subía la rutina que
    // hubiera en el navegador y, si la base la rechazaba, no cargaba nada más de su cuenta.
    const isCoach=!!(State.cloudProfile && State.cloudProfile.role==="coach");
    // Una rutina que la base rechaza (datos viejos o inválidos, ver seguridad-base.sql) no se va
    // a poder subir nunca: se deja la local y sigue la carga, en vez de trabar toda la cuenta.
    const upRoutine=async()=>{
      if(!onRegular()) return false;
      const r=await State.sb.from("routines").upsert({client_id:State.cloudUser.id, days:state.days, updated_at:new Date().toISOString(), updated_by:State.cloudUser.id},{onConflict:"client_id"});
      if(r.error && r.error.code==="22023"){ console.error("rutina rechazada",r.error); return false; }
      sbOk(r); return true;
    };
    if(isCoach){}
    else if(routineLocked() && ((rt.data && Array.isArray(rt.data.days) && rt.data.days.length) || !onRegular() || (!bl.error && bl.data && bl.data[0] && activeDeload(bl.data[0], today())))){
      // Con coach, la rutina manda el coach: se toma la de la nube y solo se conserva lo
      // que el cliente cargó a mano (kg, reps, tildes) de cada serie. En una semana de
      // descarga con rutina armada, la de descarga (ver applyCoachRoutine).
      if(!bl.error) state.block = (bl.data && bl.data[0]) ? bl.data[0] : null;
      if(rt.data && Array.isArray(rt.data.days) && rt.data.days.length) state.regularDays = rt.data.days;
      applyCoachRoutine();
      ensureDays();
      markRoutineSynced(state.days);
    }
    else if(rt.data && Array.isArray(rt.data.days) && rt.data.days.length){
      if(localRoutineWins(rt.data)){
        // El cliente cambió su rutina en el celular sin poder subirla (sin señal) y ese
        // cambio es más nuevo que la nube: se sube en vez de perderlo.
        if(!await upRoutine()) state.days = rt.data.days;
      } else {
        state.days = rt.data.days;
      }
      // Si migrateNames corrigió algo (nombres viejos, sin 'mus', ids raros), la corregida se
      // sube ya, recién leída la nube. Antes la subía el primer save(); ahora save() solo sube
      // si la rutina cambió acá, y al volver a primer plano refreshOwnRoutine veía distinta la
      // nube y la volvía a tomar (y a migrar, con ids nuevos) en cada vuelta. Si no se pudo
      // subir, queda marcada la de la nube: la corregida queda pendiente para el próximo save().
      const raw=JSON.parse(JSON.stringify(state.days));
      const fixed=migrateNames(state.days);
      ensureDays();
      let up=false;
      if(fixed){ try{ up=await upRoutine(); }catch(e){ console.error("rutina",e); } }
      markRoutineSynced(fixed && !up ? raw : state.days);
    } else if(!routineLocked()) {
      if(await upRoutine()) markRoutineSynced(state.days);
    }
    State.cloudReady=true;
    // La rutina de la nube puede traer los días de la semana (los puso el coach o vienen de otro
    // celular): Entreno pasa al de hoy con las mismas reglas que al abrir (core/state.js).
    if(!isCoach) elegirDiaDeHoy();
    if(!ws.error && Array.isArray(ws.data)){
      state.weights=ws.data.map(w=>({id:w.id, date:w.measured_on, kg:Number(w.kg)}));
      state.weightsSent=null; // se vuelve a tomar después de applyPending (ver más abajo)
    }
    if(!ss.error && Array.isArray(ss.data)){
      state.sessions=ss.data.map(se=>Object.assign(sessionFromRow(se), {id:se.id, cloudId:se.id}));
      // Variantes del día («en lugar de…»): del registro de cada día en la nube y de lo de hoy en el celular.
      markSubs(state.sessions, (!dl.error && Array.isArray(dl.data) ? dl.data : []).concat(todaySubs() ? [{log_date:today(), habits_done:{subs:todaySubs()}}] : []));
    }
    if(so && !so.error && Array.isArray(so.data)){ _salidasNoTable=false; mergeSalidas(so.data); }
    else if(so && so.error && noTable(so.error, "cardio_outings")) markSalidasNoTable();
    // Las respuestas a preguntas propias del coach vienen en "answers"; las de siempre, en
    // sus columnas (que mandan si aparecen en los dos lados).
    if(!dl.error && Array.isArray(dl.data)){ state.daily={}; dl.data.forEach(r=>{ state.daily[r.log_date]=Object.assign({}, r.answers||{}, {steps:r.steps||"", comment:r.comment||"", soreness:r.soreness||"", performance:r.performance||"", motivation:r.motivation||"", hunger:r.hunger||"", fatigue:r.fatigue||"", sleep:r.sleep||""}); }); }
    if(!cq.error) state.coachQ = cq.data ? {daily:cq.data.daily||null, checkin:cq.data.checkin||null} : null;
    // La nube manda para esos 7 días: suma lo anotado en cada uno (vale desde cualquier celular).
    if(fw && !fw.error && Array.isArray(fw.data)){
      const byDay={}; fw.data.forEach(r=>{ byDay[r.log_date]=(byDay[r.log_date]||0)+(Number(r.kcal)||0); });
      state.kcalLog = Object.assign({}, state.kcalLog||{}, byDay);
    }
    if(!ck.error && Array.isArray(ck.data)){ state.checkins={}; ck.data.forEach(r=>{ const o=Object.assign({}, r.answers||{}); if(r.adherence) o.adherence=r.adherence; state.checkins[r.week_start]=o; }); }
    if(!ci.error) state.info = ci.data || null;
    if(!bl.error) state.block = (bl.data && bl.data[0]) ? bl.data[0] : null;
    if(!np.error) state.coachPlan = np.data ? {kcal:np.data.kcal, protein:np.data.protein, carbs:np.data.carbs, fat:np.data.fat, notes:np.data.notes, plan:np.data.plan||null, cardio:(np.data.plan&&np.data.plan.cardio)||null, habits:(np.data.plan&&np.data.plan.habits)||null, habitDays:(np.data.plan&&np.data.plan.habitDays)||null} : null;
    // Comidas, agua, pasos y hábitos de hoy. La nube manda solo si ya tiene el día
    // (water_ml lo escribe siempre la app); si no, se conserva lo local y se sube.
    _lastDay=null;
    const todayRow=(!dl.error && Array.isArray(dl.data)) ? dl.data.find(r=>r.log_date===today()) : null;
    // Racha: los días que la app abrió con esta cuenta (también desde otros celulares). Una
    // fila con solo los pasos (de un día en que no se abrió la app) no cuenta.
    const opened=r=>r.water_ml!=null || r.habits_done!=null || !!(r.comment||r.soreness||r.performance||r.motivation||r.hunger||r.fatigue||r.sleep||r.answers);
    if(!dl.error && Array.isArray(dl.data)) mergeVisits(dl.data.filter(opened).map(r=>r.log_date));
    if(!fe.error && todayRow && todayRow.water_ml!=null){
      state.diaryDate=state.waterDate=state.stepsDate=state.habitsDate=today();
      state.water=todayRow.water_ml||0;
      state.steps=todayRow.steps||0;
      state.diary=(fe.data||[]).map(r=>({id:r.id, meal:r.meal||undefined, name:r.name, grams:Number(r.grams)||0, kcal:r.kcal||0, p:Number(r.protein)||0, c:Number(r.carbs)||0, f:Number(r.fat)||0, unit:r.unit||"g", base:r.base||undefined}));
      applyHabitsDone(todayRow.habits_done);
      _lastDay=JSON.stringify(daySnapshot());
    }
    _lastPrefs=null;
    if(!cp.error && cp.data){ applyPrefs(cp.data); _lastPrefs=JSON.stringify(prefsSnapshot()); }
    if(!cp.error) state.cloudSeen=true; // desde acá lo local de este usuario ya se puede subir
    applyPending(); // lo que la nube todavía no tiene (cola de envío) se vuelve a poner encima
    if(!ws.error && Array.isArray(ws.data)) state.weightsSent=weightsSnapshot();
    save();
  }catch(e){ console.error("loadCloud",e); }
  State.cloudLoading=false;
  // Sin esto, si la app abría sin señal no volvía a intentar en toda la sesión: la rutina
  // nunca se subía y los cambios quedaban solo en el celular.
  if(!State.cloudReady) scheduleCloudRetry(); else _retryN=0;
  if(_staleBoot && State.cloudReady && !_inLogin) await staleCatchUp();
  syncExtras();
}

// ¿La rutina del celular le gana a la de la nube? Solo si cambió acá después de la última
// sincronización y ese cambio es más nuevo que la última vez que se guardó en la nube.
// Celulares con la versión anterior (sin huella guardada): gana lo local solo si la nube
// todavía tiene la rutina con la que arranca una cuenta y el celular no. La de arranque es
// un día vacío (sin ningún ejercicio) o, en cuentas de antes, la rutina de ejemplo (Meso 2):
// un celular nuevo, todavía vacío, nunca pisa la rutina que la cuenta ya tiene en la nube.
function localRoutineWins(cloud){
  const exNames=days=>(days||[]).map(d=>(d.exercises||[]).map(e=>e.name).join(",")).join("|");
  const isDefault=days=>!(days||[]).some(d=>(d.exercises||[]).length) || exNames(days)===OLD_DEFAULT_NAMES;
  if(!state.routineHash) return isDefault(cloud.days) && !isDefault(state.days);
  if(routineHash(state.days)===state.routineHash) return false;
  const cloudTs=Date.parse(cloud.updated_at)||0;
  return (state.routineEditedAt||0) > cloudTs;
}

// Sin coach, la rutina también se cambia desde otro dispositivo (la compu, otro celular). Al
// volver a primer plano se relee la de la nube: si allá cambió y acá no, se toma esa; si
// cambiaron las dos, gana la más nueva (la misma regla que al abrir, localRoutineWins). Antes
// el celular que había quedado abierto seguía con la vieja, la subía en el próximo save() y
// después el otro dispositivo la adoptaba: el cambio se perdía en todos lados.
// Devuelve true si cambió la rutina de este dispositivo (hay que redibujar).
let _routineCheck=null;
const ownRoutine=()=>!(State.cloudProfile && State.cloudProfile.role==="coach") && !routineLocked() && onRegular();
export function refreshOwnRoutine(){
  if(_routineCheck) return _routineCheck;
  if(!State.sb || !State.cloudUser || !State.cloudReady || State.cloudLoading || !ownRoutine()) return Promise.resolve(false);
  const synced=state.routineHash;
  const p=_routineCheck=(async()=>{
    try{
      const rt=await State.sb.from("routines").select("days, updated_at").eq("client_id",State.cloudUser.id).maybeSingle();
      if(rt.error || !rt.data || !Array.isArray(rt.data.days) || !rt.data.days.length) return false;
      // Si mientras leía se subió o se bajó la rutina (o se vinculó a un coach), esta lectura ya es vieja.
      if(state.routineHash!==synced || State.cloudLoading || !ownRoutine()) return false;
      // Cambió acá y es más nueva: se sube por el camino de siempre (la demora espera a esta lectura).
      if(localRoutineWins(rt.data)){ cloudSyncCore(); return false; }
      if(sameDays(rt.data.days, state.days)){ if(routineHash(state.days)!==state.routineHash) markRoutineSynced(state.days); return false; }
      // La nube sigue igual que cuando se bajó (la migración de acá todavía no se subió): no hay
      // nada que tomar; se sube la corregida. Volver a tomarla la migraba otra vez y cambiaba los
      // ids raros en cada vuelta (el alumno saltaba al primer día).
      if(routineHash(rt.data.days)===synced){ cloudSyncCore(); return false; }
      state.days=rt.data.days;
      const raw=JSON.parse(JSON.stringify(state.days)); // la de la nube, sin migrar (ver loadCloud)
      const fixed=migrateNames(state.days);
      ensureDays(); elegirDiaDeHoy();
      markRoutineSynced(raw); // también la guarda en el dispositivo
      if(fixed) cloudSyncCore(); // la corregida se sube una vez (sin marcarla como editada acá)
      return true;
    }catch(e){ console.error("rutina",e); return false; }
  })();
  p.then(()=>{ if(_routineCheck===p) _routineCheck=null; });
  return p;
}
// ¿Es la misma rutina? La nube la guarda como jsonb, que devuelve las claves en otro orden:
// se comparan ordenadas (routineHash no sirve para esto, depende del orden).
function sameDays(a, b){
  const canon=v=>Array.isArray(v) ? "["+v.map(canon).join(",")+"]"
    : (v && typeof v==="object") ? "{"+Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>JSON.stringify(k)+":"+canon(v[k])).join(",")+"}"
    : JSON.stringify(v===undefined ? null : v);
  return canon(a)===canon(b);
}

let _retryT=null, _retryN=0;
function scheduleCloudRetry(){
  clearTimeout(_retryT);
  const ms=Math.min(300000, 15000*Math.pow(2, _retryN++));
  _retryT=setTimeout(retryCloud, ms);
}
async function retryCloud(){
  if(State.cloudReady || State.cloudLoading || !State.sb || !State.cloudUser) return;
  await loadCloud();
  if(State.cloudReady){ if(State.cloudProfile && State.cloudProfile.role==="coach") renderCoach(); else renderApp(); }
}
window.addEventListener("online", ()=>{ if(State.cloudUser && !State.cloudReady) retryCloud(); });

// ===== Comidas, agua, pasos, hábitos y preferencias =====
// Se comparan contra lo último enviado (o leído de la nube) y, si cambió, van a la cola
// de envío como una foto completa: la del día (clave = fecha) y la de preferencias.
// Una foto nueva reemplaza a la anterior todavía pendiente, así la cola no crece.
let _lastDay=null, _lastPrefs=null, _extrasTimer=null;
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Comidas de cada fecha que estaban en este dispositivo la última vez que se mandaron (o se
// trajeron de la nube): state.foodsSeen = { fecha: [ids] }. En la nube se borra solo lo que
// estaba acá y ya no está (removed). Antes se borraba todo lo que no estuviera en la lista de
// este dispositivo, y uno desactualizado (una pestaña abierta desde ayer) borraba las comidas
// cargadas desde otro.
function foodsRemoved(k, key, dt, ids){
  const cur=new Set(ids), out=new Set();
  const seen=(state.foodsSeen && state.foodsSeen[dt]) || [];
  seen.forEach(x=>{ if(!cur.has(x)) out.add(x); });
  // Lo que ya se iba a borrar con un envío anterior todavía pendiente (este lo reemplaza).
  const pend=myPending().filter(i=>i.k===k && i.key===key).pop();
  ((pend && pend.p && pend.p.removed) || []).forEach(x=>{ if(!cur.has(x)) out.add(x); });
  return [...out];
}
function noteFoodsSeen(dt, ids){
  const old=daysAgo(62), m={};
  Object.keys(state.foodsSeen||{}).forEach(k=>{ if(k>=old && k!==dt) m[k]=state.foodsSeen[k]; });
  m[dt]=ids.slice();
  state.foodsSeen=m;
}
// La foto del día sin la lista de lo borrado (es lo que se compara con _lastDay).
const daySnap = p => { const o=Object.assign({}, p); delete o.removed; return o; };

function daySnapshot(){
  const t=today();
  if(state.diaryDate!==t || state.waterDate!==t || state.stepsDate!==t || state.habitsDate!==t) return null; // checkDaily() todavía no pasó al día nuevo
  const coachHabits=(state.coachPlan && Array.isArray(state.coachPlan.habits)) ? state.coachPlan.habits.filter(x=>x&&x.trim()) : [];
  return {
    dt:t, water:state.water||0, steps:state.steps||0,
    // subs: ejercicios cambiados por una variante en los entrenos de hoy (core/variantes.js). Van
    // acá porque session_entries guarda solo el nombre; así el coach ve «en lugar de…».
    habits:Object.assign({ coach:coachHabits.filter(n=>state.habitsDone && state.habitsDone[t+"|"+n]), own:(state.habits||[]).filter(h=>h.done).map(h=>h.name) }, todaySubs() ? { subs:todaySubs() } : {}),
    foods:(state.diary||[]).map(e=>{ if(!UUID_RE.test(String(e.id))) e.id=newId(); return {id:e.id, meal:e.meal||null, name:e.name, grams:e.grams, unit:e.unit||"g", kcal:e.kcal||0, p:e.p||0, c:e.c||0, f:e.f||0, base:e.base||null}; })
  };
}

function prefsSnapshot(){
  return { cal_profile:state.calProfile||null, cal_target:state.calTarget||null, steps_goal:state.stepsGoal||null, water_goal:state.waterGoal||null,
    rest_default:state.restDefault||null, habits:(state.habits||[]).map(h=>({id:h.id, name:h.name})), foods:state.foods||[],
    habit_alarms:state.habitAlarms||{}, disciplines:Array.isArray(state.disciplinas)?state.disciplinas:[] };
}

function applyHabitsDone(hd){
  if(!hd) return;
  mergeTodaySubs(hd.subs);
  const t=today(), own=new Set(hd.own||[]);
  (state.habits||[]).forEach(h=>{ h.done=own.has(h.name); });
  if(!state.habitsDone || typeof state.habitsDone!=="object") state.habitsDone={};
  Object.keys(state.habitsDone).forEach(k=>{ if(k.indexOf(t+"|")===0) delete state.habitsDone[k]; });
  (hd.coach||[]).forEach(n=>{ state.habitsDone[t+"|"+n]=true; });
}

function applyPrefs(p){
  if(p.cal_profile!==undefined) state.calProfile=p.cal_profile||null;
  if(p.cal_target!==undefined) state.calTarget=p.cal_target||null;
  if(p.steps_goal) state.stepsGoal=p.steps_goal;
  if(p.water_goal) state.waterGoal=p.water_goal;
  if(p.rest_default) state.restDefault=p.rest_default;
  if(Array.isArray(p.foods)) state.foods=p.foods;
  if(p.habit_alarms && typeof p.habit_alarms==="object") state.habitAlarms=p.habit_alarms;
  if(Array.isArray(p.disciplines)) state.disciplinas=p.disciplines.filter(x=>typeof x==="string");
  if(Array.isArray(p.habits)){
    const done=new Set((state.habits||[]).filter(h=>h.done).map(h=>h.name)); // las tildes de hoy no viajan en prefs
    state.habits=p.habits.map(h=>({id:h.id, name:h.name, done:done.has(h.name)}));
  }
}

function weightsSnapshot(){ const m={}; (state.weights||[]).forEach(w=>{ if(w && w.date && Number(w.kg)>0) m[w.date]=Number(w.kg); }); return m; }

export function syncExtras(){
  if(!State.cloudUser || State.cloudLoading || !state.cloudSeen) return;
  let queued=false;
  const d=daySnapshot();
  if(d){
    const ids=d.foods.map(f=>f.id), j=JSON.stringify(d);
    if(j!==_lastDay){ _lastDay=j; enqueue("day", Object.assign({}, d, {removed:foodsRemoved("day", d.dt, d.dt, ids)}), d.dt); queued=true; }
    noteFoodsSeen(d.dt, ids);
  }
  const p=prefsSnapshot(), pj=JSON.stringify(p);
  if(pj!==_lastPrefs){ _lastPrefs=pj; enqueue("prefs", p, "prefs"); queued=true; }
  // Peso corporal: cada fecha cargada, cambiada o borrada va por la cola, así un peso
  // anotado sin señal se sube cuando vuelve (antes se perdía al recargar desde la nube).
  if(state.weightsSent){
    const cur=weightsSnapshot(), sent=state.weightsSent;
    Object.keys(cur).forEach(dt=>{ if(sent[dt]!==cur[dt]){ enqueue("weight", {date:dt, kg:cur[dt]}, dt); queued=true; } });
    Object.keys(sent).forEach(dt=>{ if(!(dt in cur)){ enqueue("weight", {date:dt, del:true}, dt); queued=true; } });
    state.weightsSent=cur;
  }
  if(queued){ clearTimeout(_extrasTimer); _extrasTimer=setTimeout(()=>{ flushOutbox(); }, 1500); }
}

// El día cambió con la app abierta (checkDaily): el día nuevo vacío de este dispositivo no se
// manda. Si se mandaba, pisaba el agua, los hábitos (y antes las comidas) que ya se hubieran
// cargado hoy desde otro dispositivo. Se trae lo de hoy de la nube (refreshToday).
export function dayRolled(){
  const d=daySnapshot(); if(!d) return;
  _lastDay=JSON.stringify(d);
  setTimeout(()=>{ refreshToday(true); }, 0);
}

// Comidas, agua, pasos y hábitos de hoy desde la nube, al volver a primer plano o al pasar de
// día con la app abierta: otro dispositivo pudo haber cargado algo. Solo si este no tiene nada
// propio sin mandar (lo suyo se manda primero y manda). rolled: si la nube todavía no tiene el
// día, se manda el de este dispositivo (cuenta para la racha), sin pisar nada.
let _refreshing=false;
export async function refreshToday(rolled){
  if(!State.sb || !State.cloudUser || !State.cloudReady || State.cloudLoading || !state.cloudSeen || _refreshing) return;
  if(State.cloudProfile && State.cloudProfile.role==="coach") return;
  const t=today(), d0=daySnapshot(); if(!d0) return;
  const local=JSON.stringify(d0);
  const busy=()=>local!==_lastDay || myPending().some(i=>i.k==="day" && i.key===t);
  if(busy()) return;
  _refreshing=true;
  try{
    const uid=State.cloudUser.id, sb=State.sb;
    const [dl, fe]=await Promise.all([
      sb.from("daily_logs").select("water_ml, steps, habits_done").eq("client_id",uid).eq("log_date",t).maybeSingle(),
      sb.from("food_entries").select("*").eq("client_id",uid).eq("log_date",t).order("pos")
    ]);
    if(dl.error || fe.error || today()!==t || !State.cloudUser || State.cloudUser.id!==uid) return;
    // Mientras se leía, se cargó algo acá: eso se manda y manda.
    if(JSON.stringify(daySnapshot())!==local || busy()) return;
    const row=dl.data;
    if(!row || row.water_ml==null){
      // La nube todavía no tiene el día: se manda el de este dispositivo (agua y hábitos de hoy,
      // las comidas no se borran: removed va vacío).
      if(rolled){ _lastDay=null; syncExtras(); }
      return;
    }
    state.water=row.water_ml||0;
    state.steps=Math.max(state.steps||0, row.steps||0);
    state.diary=(fe.data||[]).map(r=>({id:r.id, meal:r.meal||undefined, name:r.name, grams:Number(r.grams)||0, kcal:r.kcal||0, p:Number(r.protein)||0, c:Number(r.carbs)||0, f:Number(r.fat)||0, unit:r.unit||"g", base:r.base||undefined}));
    applyHabitsDone(row.habits_done);
    const now=JSON.stringify(daySnapshot());
    _lastDay=now;
    save();
    if(now!==local) renderApp();
  }catch(e){ console.error("refreshToday",e); }
  finally{ _refreshing=false; }
}
document.addEventListener("visibilitychange", ()=>{ if(document.visibilityState==="visible") refreshToday(false); });

// Fila de "sessions" (con sus session_entries) → entreno como lo guarda la app.
// Las series se ordenan por set_order (su número dentro del ejercicio): Supabase no
// garantiza el orden de la relación, y sin esto el detalle del entreno podía mostrar la
// serie 3 antes que la 1. El sort es estable, así que el orden de los ejercicios no cambia.
// set_order = número de ejercicio × 1000 + número de serie: así el mismo ejercicio hecho dos
// veces en un entreno vuelve como dos (y en su orden). Los entrenos viejos tienen solo el
// número de serie (< 1000) y se agrupan por nombre, como antes.
// Tope de 30 ejercicios: entra aunque la columna sea smallint.
const setOrder=(ei,si)=>Math.min(ei,30)*1000+Math.min(si,999);
export function sessionFromRow(se){
  const byEx=new Map();
  (se.session_entries||[]).slice().sort((a,b)=>(a.set_order||0)-(b.set_order||0)).forEach(en=>{
    const k=Math.floor((en.set_order||0)/1000)+"|"+en.exercise_name;
    if(!byEx.has(k)) byEx.set(k, {name:en.exercise_name, sets:[]});
    byEx.get(k).sets.push(en.secs>0 ? {kg:Number(en.kg)||0, reps:Number(en.reps)||0, secs:Number(en.secs)} : {kg:Number(en.kg)||0, reps:Number(en.reps)||0});
  });
  const out={date:se.performed_on, day:se.day_name, ts:new Date(se.created_at).getTime(), exercises:[...byEx.values()]};
  if(se.rpe) out.rpe=se.rpe;
  if(se.pump) out.pump=se.pump;
  if(typeof se.joint_pain==="boolean") out.joint=se.joint_pain;
  if(se.duration_s>0) out.dur=se.duration_s;
  return out;
}

export function cloudSyncCore(){
  // Comidas/agua/pasos/hábitos/preferencias van por la cola: no dependen de cloudReady
  // (es data del propio cliente, no hay coach que pisar) y así funcionan sin conexión.
  try{ syncExtras(); }catch(e){ console.error("extras",e); }
  if(!State.sb||!State.cloudUser||State.cloudLoading||!State.cloudReady) return;
  clearTimeout(State.routineTimer);
  State.routineTimer=setTimeout(async ()=>{
    try{
      // Si justo se está releyendo la rutina de la nube (volvió a primer plano), primero se
      // decide cuál queda (ver refreshOwnRoutine) y recién después se sube, si hace falta.
      await _routineCheck;
      // Con coach asignado la rutina es SOLO del coach: subir la copia del cliente en cada
      // save() pisaba lo que el coach acababa de cambiar. Sin coach, se sube solo si cambió
      // en este dispositivo desde la última vez que quedó igual a la nube: antes cualquier
      // save() (agua, comida, el cambio de día) subía la rutina entera, y un celular que había
      // quedado abierto con la vieja pisaba la nueva que el alumno armó en otro.
      if(!routineLocked() && onRegular() && routineHash(state.days)!==state.routineHash){
        const days=state.days, h=routineHash(days);
        sbOk(await State.sb.from("routines").upsert({client_id:State.cloudUser.id, days:days, updated_at:new Date().toISOString(), updated_by:State.cloudUser.id},{onConflict:"client_id"}));
        if(routineHash(state.days)===h) markRoutineSynced(state.days); // si cambió mientras subía, queda pendiente para la próxima
      }
      // El peso corporal va por la cola (syncExtras).
    }catch(e){ console.error("sync",e); }
  },1200);
}

// Borra todos los archivos del usuario en Storage (foto de perfil y fotos de los
// productos que cargó o pidió, ver supabase/pedidos-productos.sql). Se usa
// antes de eliminar la cuenta: borrar auth.users borra las filas en cascada, pero los
// archivos NO (Supabase no deja borrar storage.objects por SQL: trigger
// protect_objects_delete), así que las fotos quedaban para siempre sin dueño.
// El bucket "checkins" (las fotos de progreso de antes) ya no va: se vació entero y quedó
// sin permisos (ver supabase/borrar-fotos-progreso.sql).
// Lanza si algo falla, para no eliminar la cuenta con fotos todavía guardadas.
export async function deleteMyStorageFiles(){
  if(!State.sb||!State.cloudUser) return;
  const uid=State.cloudUser.id;
  for(const bucket of ["avatars","productos"]){
    const st=State.sb.storage.from(bucket);
    // Primero se listan todas (list() devuelve de a 1000 como máximo) y después se borran:
    // borrar mientras se pagina corre el offset y se saltearía archivos.
    const paths=[];
    for(let offset=0;;offset+=1000){
      const r=sbOk(await st.list(uid,{limit:1000, offset:offset}));
      const items=r.data||[];
      // id null = subcarpeta (la app no las crea; se ignoran).
      items.forEach(it=>{ if(it && it.id) paths.push(uid+"/"+it.name); });
      if(items.length<1000) break;
    }
    for(let i=0;i<paths.length;i+=100) sbOk(await st.remove(paths.slice(i,i+100)));
  }
}

// Elimina la cuenta: la función borrar-audios borra los mensajes de voz del chat y los audios
// de ejercicios (el usuario no tiene permiso de borrar audios en Storage) y después la cuenta
// (auth.users y en cascada todo lo que depende de ella). Va todo junto en la función para que
// nadie pueda borrar los audios del otro sin eliminar su cuenta. Si falla, lanza con el motivo
// y la cuenta sigue: se puede reintentar.
export async function deleteMyAccount(){
  const r=await State.sb.functions.invoke("borrar-audios", { body: {} });
  if(r.error){
    let detail="";
    try{ const ctx=r.error.context; if(ctx && ctx.json){ const j=await ctx.json(); detail=j && j.error; } }catch(e){}
    throw new Error(detail || "no se pudo eliminar la cuenta. Probá de nuevo en un rato.");
  }
  // Función vieja todavía publicada (solo borraba los audios): la cuenta se borra acá.
  if(!(r.data && r.data.deleted)){
    const d=await State.sb.rpc("delete_own_account");
    if(d.error) throw d.error;
  }
}

// ===== Cola de envío pendiente ("outbox") =====
// Todo lo que el cliente carga a mano (entreno, registro diario, check-in, feedback de
// sesión) se anota primero acá, en localStorage, y sale hacia Supabase desde esta cola.
// Se saca de la cola SOLO cuando Supabase confirma. Si no hay conexión queda esperando y
// se reintenta al abrir la app (antes de que loadCloud pise el estado local), cuando
// vuelve la conexión y cuando la pestaña vuelve a estar visible.
// Cada pendiente guarda el id del usuario: si en el mismo celular entra otra cuenta, no
// se le suben los datos de la anterior.
const OUTBOX_KEY = "core_outbox_v1";
const OUTBOX_FAILED_KEY = "core_outbox_failed_v1";

// crypto.randomUUID solo existe en contextos seguros (https / localhost).
export function newId(){
  try{ if(window.crypto && crypto.randomUUID) return crypto.randomUUID(); }catch(e){}
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c=>{ const r=Math.random()*16|0; return (c==="x"?r:(r&3|8)).toString(16); });
}

function readQueue(key){ try{ const a=JSON.parse(localStorage.getItem(key)||"[]"); return Array.isArray(a)?a:[]; }catch(e){ return []; } }
function writeQueue(key, a){ try{ localStorage.setItem(key, JSON.stringify(a)); }catch(e){} }

// Pendientes de tipos que la app ya no manda: las salidas con GPS de Cardio (cardio,
// cardioDelete, cardioRoute) se sacaron de la app. Si quedó alguno en la cola de un celular
// se descarta sin mandarlo (su tabla ya no se usa) y sin trabar lo demás.
const RETIRED_KINDS = ["cardio", "cardioDelete", "cardioRoute"];
function isRetired(i){ return !!(i && RETIRED_KINDS.indexOf(i.k)>=0); }
function dropRetired(){
  [OUTBOX_KEY, OUTBOX_FAILED_KEY].forEach(k=>{
    const q=readQueue(k), keep=q.filter(i=>!isRetired(i));
    if(keep.length===q.length) return;
    if(keep.length) writeQueue(k, keep); else try{ localStorage.removeItem(k); }catch(e){}
  });
}
dropRetired();

function myPending(){ const u=State.cloudUser&&State.cloudUser.id; return u ? readQueue(OUTBOX_KEY).filter(i=>i.uid===u && !isRetired(i)) : []; }

export function pendingCount(){ return myPending().length; }

// ¿Queda algo en el celular que la cuenta todavía no tiene? (cola de envío, o la rutina
// propia cambiada sin subir). Para no borrar nada que no esté a salvo.
export function localUnsynced(){
  if(pendingCount()>0) return true;
  const coach = State.cloudProfile && State.cloudProfile.role==="coach";
  return !coach && !routineLocked() && onRegular() && state.routineHash!==routineHash(state.days);
}

// Sube la rutina ya (sin esperar la demora de cloudSyncCore). Devuelve true si quedó en la nube.
export async function syncRoutineNow(){
  if(!State.sb || !State.cloudUser || !State.cloudReady || routineLocked() || !onRegular()) return false;
  // Sin cambios acá desde la última sincronización no se sube nada (ver cloudSyncCore).
  if(routineHash(state.days)===state.routineHash) return true;
  try{
    const days=state.days, h=routineHash(days);
    sbOk(await State.sb.from("routines").upsert({client_id:State.cloudUser.id, days:days, updated_at:new Date().toISOString(), updated_by:State.cloudUser.id},{onConflict:"client_id"}));
    if(routineHash(state.days)===h) markRoutineSynced(state.days);
    return true;
  }catch(e){ return false; }
}

export function syncFootText(){
  if(!State.cloudUser) return "Se guarda solo en este dispositivo";
  if(!State.cloudReady && !State.cloudLoading) return "Sin conexión con tu cuenta: lo que cargues queda en este celular y se sube solo cuando vuelva la conexión";
  const n=pendingCount();
  // Solo quedan salidas que esperan su tabla en la base: no es un problema de conexión.
  if(n>0 && _salidasNoTable && myPending().every(i=>i.k==="salida" || i.k==="salidaDelete")) return SALIDAS_ESPERA;
  return n>0 ? (n+" pendiente"+(n>1?"s":"")+" de sincronizar · se envía solo cuando haya conexión") : "Sincronizado con tu cuenta";
}

export function refreshSyncFoot(){ const el=document.getElementById("syncFoot"); if(el) el.textContent=syncFootText(); }

// key: para daily/checkin, la última versión de la misma fecha/semana reemplaza a la anterior.
function enqueue(k, p, key){
  const uid=State.cloudUser.id;
  let q=readQueue(OUTBOX_KEY);
  if(key) q=q.filter(i=>!(i.uid===uid && i.k===k && i.key===key));
  const item={id:newId(), uid:uid, k:k, key:key||null, p:p, ts:Date.now()};
  q.push(item); writeQueue(OUTBOX_KEY, q);
  return item.id;
}

// Lo que el cliente sacó del diario de ese día en este dispositivo (p.removed). Un envío de
// una versión anterior de la app (sin removed) no borra nada: borraba todo lo que no tuviera.
async function deleteFoods(uid, p){
  const ids=(Array.isArray(p.removed) ? p.removed : []).filter(x=>UUID_RE.test(String(x)));
  if(ids.length) sbOk(await State.sb.from("food_entries").delete().eq("client_id",uid).eq("log_date",p.dt).in("id",ids));
}

async function sendItem(it){
  const sb=State.sb, uid=it.uid, p=it.p;
  if(it.k==="session"){
    // upsert + ignoreDuplicates (ON CONFLICT DO NOTHING) con ids generados en el celular:
    // reintentar no duplica el entreno ni sus series aunque el envío anterior haya
    // llegado a medias.
    const row={id:p.id, client_id:uid, performed_on:p.date, day_name:p.day, created_at:new Date(p.ts).toISOString()};
    if(p.dur>0) row.duration_s=Math.min(43200, Math.round(p.dur));
    sbOk(await sb.from("sessions").upsert(row,{onConflict:"id", ignoreDuplicates:true}));
    if(p.entries && p.entries.length){
      sbOk(await sb.from("session_entries").upsert(p.entries.map(e=>({id:e.id, session_id:p.id, client_id:uid, exercise_name:e.name, set_order:e.order, kg:e.kg, reps:e.reps, ...(e.secs>0?{secs:e.secs}:{})})),{onConflict:"id", ignoreDuplicates:true}));
    }
  } else if(it.k==="sessionEdit"){
    // Entreno corregido desde el historial: se reemplazan todas sus series. Borrar y volver
    // a insertar con los mismos ids hace que reintentar dé el mismo resultado.
    sbOk(await sb.from("session_entries").delete().eq("session_id",p.id).eq("client_id",uid));
    if(p.entries && p.entries.length){
      sbOk(await sb.from("session_entries").upsert(p.entries.map(e=>({id:e.id, session_id:p.id, client_id:uid, exercise_name:e.name, set_order:e.order, kg:e.kg, reps:e.reps, ...(e.secs>0?{secs:e.secs}:{})})),{onConflict:"id", ignoreDuplicates:true}));
    }
  } else if(it.k==="sessionDelete"){
    sbOk(await sb.from("sessions").delete().eq("id",p.id).eq("client_id",uid));
  } else if(it.k==="feedback"){
    // Con RLS, un UPDATE que ninguna política permite NO da error: simplemente cambia 0
    // filas. Sin pedir las filas de vuelta el feedback "se guardaba" sin llegar nunca.
    const r=sbOk(await sb.from("sessions").update({rpe:p.rpe||null, pump:p.pump||null, joint_pain:(typeof p.joint==="boolean")?p.joint:null}).eq("id",p.id).select("id"));
    if(!r.data || !r.data.length){ const e=new Error("El feedback no se guardó: la base no permite actualizar sessions (falta política UPDATE)"); e.code="42501"; throw e; }
  } else if(it.k==="daily"){
    const rec=p.rec||{};
    const row={
      client_id:uid, log_date:p.dt, comment: rec.comment||null,
      soreness: rec.soreness||null, performance: rec.performance||null, motivation: rec.motivation||null,
      hunger: rec.hunger||null, fatigue: rec.fatigue||null, sleep: rec.sleep||null
    };
    // Los pasos también los escribe el contador de Hábitos: si el registro los dejó vacíos
    // no se mandan, para no borrar lo que ya contó.
    if(parseInt(rec.steps)>=0) row.steps=parseInt(rec.steps);
    // Preguntas propias del coach (sin columna fija) → daily_logs.answers, con la "foto"
    // de sus textos. Solo se manda si hay alguna: con las predeterminadas no cambia nada.
    const extra={};
    Object.keys(rec).forEach(k=>{ if(DAILY_COLUMNS.indexOf(k)<0 && k!=="steps" && k!=="kg" && k!=="_q" && rec[k]!=null && rec[k]!=="") extra[k]=rec[k]; });
    if(Object.keys(extra).length) row.answers=Object.assign(extra, {_q:rec._q||{}});
    const r=await sb.from("daily_logs").upsert(row,{onConflict:"client_id,log_date"});
    // Base sin la columna "answers" (falta correr supabase/preguntas-coach.sql): se guarda
    // igual todo lo demás en vez de trabar el registro del día en la cola para siempre.
    if(r.error && row.answers && (r.error.code==="PGRST204" || r.error.code==="42703")){
      console.warn("daily_logs.answers no existe todavía; se guardan solo las columnas fijas", r.error);
      delete row.answers;
      sbOk(await sb.from("daily_logs").upsert(row,{onConflict:"client_id,log_date"}));
    } else sbOk(r);
  } else if(it.k==="day"){
    // Solo las columnas del día: el upsert no toca comentario, sueño, etc. del registro.
    // Sin los pasos: van solos por queueSteps (Salud). Mandarlos acá pisaba con 0 los del
    // celular desde la web o desde un dispositivo que no los cuenta.
    sbOk(await sb.from("daily_logs").upsert({client_id:uid, log_date:p.dt, water_ml:p.water, habits_done:p.habits},{onConflict:"client_id,log_date"}));
    if(p.foods.length){
      sbOk(await sb.from("food_entries").upsert(p.foods.map((f,i)=>({id:f.id, client_id:uid, log_date:p.dt, pos:i, meal:f.meal||null, name:f.name, grams:f.grams, unit:f.unit, kcal:f.kcal, protein:f.p, carbs:f.c, fat:f.f, base:f.base})),{onConflict:"id"}));
    }
    await deleteFoods(uid, p);
  } else if(it.k==="foods"){
    // Comidas de un día anterior, cargadas o borradas desde Comida (el agua, los pasos y los
    // hábitos de ese día no se tocan). Mismo reemplazo que el día de hoy.
    if(p.foods.length){
      sbOk(await sb.from("food_entries").upsert(p.foods.map((f,i)=>({id:f.id, client_id:uid, log_date:p.dt, pos:i, meal:f.meal||null, name:f.name, grams:f.grams, unit:f.unit, kcal:f.kcal, protein:f.p, carbs:f.c, fat:f.f, base:f.base})),{onConflict:"id"}));
    }
    await deleteFoods(uid, p);
  } else if(it.k==="steps"){
    // Pasos de un día, solo esa columna (queueSteps: Salud / Health Connect). El resto del
    // registro del día no se toca.
    sbOk(await sb.from("daily_logs").upsert({client_id:uid, log_date:p.dt, steps:p.steps},{onConflict:"client_id,log_date"}));
  } else if(it.k==="weight"){
    // Solo esa fecha: otro dispositivo pudo cargar otras y no se tocan.
    if(p.del) sbOk(await sb.from("body_weights").delete().eq("client_id",uid).eq("measured_on",p.date));
    else sbOk(await sb.from("body_weights").upsert({client_id:uid, measured_on:p.date, kg:p.kg},{onConflict:"client_id,measured_on"}));
  } else if(it.k==="prefs"){
    const row=Object.assign({client_id:uid, updated_at:new Date().toISOString()}, p);
    let r=await sb.from("client_prefs").upsert(row,{onConflict:"client_id"});
    // Sin supabase/disciplinas.sql la columna todavía no existe: el resto se sube igual.
    if(r.error && /disciplines/.test(r.error.message||"")){ delete row.disciplines; r=await sb.from("client_prefs").upsert(row,{onConflict:"client_id"}); }
    sbOk(r);
  } else if(it.k==="checkin"){
    // La columna adherence es un número del 1 al 10. Si el coach cambió esa pregunta (opciones
    // con palabras o respuesta libre), la respuesta va en answers como cualquier otra: antes se
    // perdía (quedaba null) o la base rechazaba todo el check-in por mandar texto a esa columna.
    const ans=Object.assign({},p.f); const adh=ans.adherence; delete ans.adherence;
    const n=Number(adh), isNum=adh!=null && String(adh).trim()!=="" && Number.isInteger(n) && n>=1 && n<=10;
    if(!isNum && adh!=null && String(adh).trim()!=="" && !(typeof adh==="number" && isNaN(adh))) ans.adherence=adh;
    sbOk(await sb.from("checkins").upsert({client_id:uid, week_start:p.wk, answers:ans, adherence:isNum?n:null},{onConflict:"client_id,week_start"}));
  } else if(it.k==="salida"){
    // Salida de Cardio a pie / en bici: el resumen y el recorrido en una fila. Con el id del
    // celular y ON CONFLICT DO NOTHING, reintentar no la duplica (una salida no se edita).
    salidaTable(await sb.from("cardio_outings").upsert(salidaRow(p, uid),{onConflict:"id", ignoreDuplicates:true}));
  } else if(it.k==="salidaDelete"){
    salidaTable(await sb.from("cardio_outings").delete().eq("id",p.id).eq("client_id",uid));
  }
}

// Tabla de las salidas todavía sin crear (falta correr supabase/cardio-a-pie.sql): la salida
// queda en la cola sin trabar lo demás (entrenos, comidas…) y sale cuando la tabla exista.
// Mientras tanto el pie lo dice (syncFootText) y la pantalla puede avisarlo (salidasEnEspera).
const noTable=(e, table)=>!!(e && (e.code==="PGRST205" || e.code==="42P01" || (String(e.message||"").includes(table) && /does not exist|schema cache/i.test(String(e.message||"")))));
export const salidaNoTable = e => noTable(e, "cardio_outings");
// Mientras falte la tabla, las salidas pendientes no se vuelven a mandar en cada envío de la cola
// (cada una lleva su recorrido): se espera NO_TABLE_WAIT_MS, salvo que loadCloud vea antes que
// la tabla ya está (su lectura de cardio_outings sale bien y pone _salidasNoTable en false).
const NO_TABLE_WAIT_MS=10*60000;
let _salidasNoTable=false, _salidasNoTableAt=0;
function markSalidasNoTable(){
  if(!_salidasNoTable) console.warn("Falta la tabla cardio_outings (supabase/cardio-a-pie.sql): las salidas quedan en la cola.");
  _salidasNoTable=true; _salidasNoTableAt=Date.now();
}
const salidaKind=i=>!!i && (i.k==="salida" || i.k==="salidaDelete");
function salidasWait(){ const d=Date.now()-_salidasNoTableAt; return _salidasNoTable && d>=0 && d<NO_TABLE_WAIT_MS; }
function salidaTable(r){
  if(r && r.error && noTable(r.error, "cardio_outings")){
    markSalidasNoTable();
    const e=new Error("Falta la tabla cardio_outings"); e.later=true; throw e;
  }
  sbOk(r); _salidasNoTable=false;
  return r;
}

// Errores que reintentar no arregla (dato inválido, permiso denegado, clave inexistente:
// clases SQLSTATE 22/23/42). Un pendiente así trabaría toda la cola para siempre, así que
// se aparta en OUTBOX_FAILED_KEY. Un corte de red no trae "code" y se sigue reintentando.
function isPermanent(e){ return !!(e && typeof e.code==="string" && /^(22|23|42)/.test(e.code)); }

// ¿supabase-js tiene ahora una sesión viva de ESTE usuario? Sin sesión la librería no avisa:
// manda el pedido con la clave anónima, la base lo rechaza por RLS con 42501 (que parece
// un error permanente y apartaba el pendiente) y un DELETE borra 0 filas sin error (se daba
// por hecho). Pasa con el token vencido si la renovación falló sin señal (la librería guarda
// ese fallo 60 s y mientras tanto no hay sesión) o si la sesión se cerró desde otro lado.
async function sessionFor(uid){
  try{ const s=(await State.sb.auth.getSession()).data.session; return !!(s && s.user && s.user.id===uid); }catch(e){ return false; }
}
// Lo mismo con tope de espera: con el token vencido y sin señal getSession() tarda ~30 s.
function liveSession(uid, ms){ return Promise.race([sessionFor(uid), new Promise(ok=>setTimeout(()=>ok(false), ms))]); }
// Sin sesión lo pendiente se queda en la cola y sale solo cuando la librería renueva el token
// (TOKEN_REFRESHED, ver watchAuth) o, si nadie la despierta, pasado su enfriamiento de 60 s.
let _flushRetry=null;
function flushLater(){ clearTimeout(_flushRetry); _flushRetry=setTimeout(()=>{ flushOutbox(); }, 65000); }

// La versión anterior apartaba así (error de "row-level security") los entrenos mandados sin
// sesión, y ahí quedaban. Al entrar vuelven a la cola, adelante: se suben ignorando los que ya
// están, así que reenviarlos no puede pisar nada. Lo demás (comidas, registro, pesos,
// check-in) reemplaza el día o la semana entera y pudo tener después una versión más nueva ya
// subida: reenviar la vieja la pisaría, así que queda donde está.
function rescueFailed(){
  const uid=State.cloudUser&&State.cloudUser.id; if(!uid) return;
  const failed=readQueue(OUTBOX_FAILED_KEY);
  const back=failed.filter(i=>i.uid===uid && i.k==="session" && /row-level security/i.test(i.error||""));
  if(!back.length) return;
  const q=readQueue(OUTBOX_KEY);
  const fresh=back.filter(i=>!q.some(x=>x.id===i.id)).map(i=>{ const c=Object.assign({}, i); delete c.error; return c; });
  writeQueue(OUTBOX_KEY, fresh.concat(q));
  const left=failed.filter(i=>back.indexOf(i)<0);
  if(left.length) writeQueue(OUTBOX_FAILED_KEY, left); else try{ localStorage.removeItem(OUTBOX_FAILED_KEY); }catch(e){}
}

let _flushing=null;
export function flushOutbox(){
  if(_flushing) return _flushing;
  _flushing=(async()=>{
    // Sin esta espera, con la cola vacía la función terminaba (y su finally ponía
    // _flushing=null) ANTES de que se asignara la promesa: _flushing quedaba para siempre en
    // una promesa ya cumplida y ningún envío de esa sesión salía hasta reabrir la app.
    await null;
    try{
      if(!State.sb||!State.cloudUser) return false;
      const later=new Set(); // salidas que esperan su tabla (ver salidaTable): se saltean esta vez
      for(;;){
        // Sin la tabla, ninguna salida sale (ni la que falló ni las demás) hasta que pase la espera.
        const wait=salidasWait();
        const it=myPending().find(i=>!later.has(i.id) && !(wait && salidaKind(i)));
        if(!it) return !later.size && !(wait && myPending().some(salidaKind));
        if(!(await sessionFor(it.uid))){ flushLater(); return false; }
        let bad=null;
        try{ await sendItem(it); }
        catch(e){
          if(e && e.later){ later.add(it.id); continue; }
          console.error("outbox",it.k,e);
          if(!isPermanent(e)) return false;
          bad=e;
        }
        // Si la sesión se cayó mientras se mandaba, parte pudo salir como anónimo: el rechazo
        // es por eso y no por el dato, y un DELETE así "sale bien" sin borrar nada. Se queda
        // en la cola y se repite con sesión (reenviar no duplica nada, ver sendItem).
        if(!(await sessionFor(it.uid))){ flushLater(); return false; }
        if(bad) writeQueue(OUTBOX_FAILED_KEY, readQueue(OUTBOX_FAILED_KEY).concat([Object.assign({error:String(bad&&bad.message||bad)}, it)]));
        writeQueue(OUTBOX_KEY, readQueue(OUTBOX_KEY).filter(i=>i.id!==it.id));
        if(!bad && it.k==="salida" && it.p) salidaSubida(it.p.id);
      }
    } finally { _flushing=null; refreshSyncFoot(); }
  })();
  return _flushing;
}

// Anota y manda ya. true = quedó en la nube; false = quedó pendiente en el dispositivo (se
// reintenta solo); "failed" = la base lo rechazó (dato inválido, sin permiso), quedó apartado
// en OUTBOX_FAILED_KEY y no se reintenta. Ojo: "failed" cuenta como verdadero en un if.
async function enqueueAndSend(k, p, key){
  if(!State.cloudUser) return true; // sin cuenta no hay nada que sincronizar
  const id=enqueue(k, p, key);
  refreshSyncFoot();
  await flushOutbox();
  if(readQueue(OUTBOX_KEY).some(i=>i.id===id)) await flushOutbox(); // un envío en curso pudo no llegar a verlo
  // Con internet, un fallo suele ser pasajero (token vencido al volver de segundo plano,
  // un corte breve): se renueva la sesión y se reintenta antes de darlo por pendiente.
  for(const wait of [1000, 2500]){
    if(!readQueue(OUTBOX_KEY).some(i=>i.id===id) || !isOnline()) break;
    await new Promise(r=>setTimeout(r, wait));
    try{ await State.sb.auth.getSession(); }catch(e){}
    await flushOutbox();
  }
  if(readQueue(OUTBOX_KEY).some(i=>i.id===id)) return false;
  return readQueue(OUTBOX_FAILED_KEY).some(i=>i.id===id) ? "failed" : true;
}

export function isOnline(){ return navigator.onLine!==false; }

// loadCloud pisa state.sessions/daily/checkins con lo que hay en la nube: lo que
// todavía está en la cola (y por eso la nube no lo tiene) se vuelve a poner encima.
function applyPending(){
  myPending().forEach(it=>{
    const p=it.p;
    if(it.k==="session"){
      if(!state.sessions.some(s=>s.id===p.id)) state.sessions.push(Object.assign({id:p.id, cloudId:p.id, date:p.date, ts:p.ts, day:p.day, exercises:p.exercises}, p.dur>0?{dur:p.dur}:{}));
    } else if(it.k==="sessionEdit"){
      const s=state.sessions.find(x=>x.id===p.id || x.cloudId===p.id);
      if(s) s.exercises=p.exercises;
    } else if(it.k==="sessionDelete"){
      state.sessions=state.sessions.filter(x=>x.id!==p.id && x.cloudId!==p.id);
    } else if(it.k==="feedback"){
      const s=state.sessions.find(x=>x.id===p.id);
      if(s){ if(p.rpe) s.rpe=p.rpe; if(p.pump) s.pump=p.pump; if(typeof p.joint==="boolean") s.joint=p.joint; }
    } else if(it.k==="daily"){
      state.daily[p.dt]=Object.assign({}, state.daily[p.dt]||{}, p.rec);
    } else if(it.k==="checkin"){
      state.checkins[p.wk]=Object.assign({}, state.checkins[p.wk]||{}, p.f);
    } else if(it.k==="day" && p.dt===today()){
      state.water=p.water; state.steps=p.steps;
      state.diary=p.foods.map(f=>({id:f.id, meal:f.meal||undefined, name:f.name, grams:f.grams, kcal:f.kcal, p:f.p, c:f.c, f:f.f, unit:f.unit, base:f.base||undefined}));
      applyHabitsDone(p.habits);
      _lastDay=JSON.stringify(daySnap(p));
    } else if(it.k==="steps"){
      // Aunque ese día no tenga registro: la fila de daily_logs se crea con los pasos solos.
      state.daily[p.dt]=Object.assign({}, state.daily[p.dt]||{}, {steps:String(p.steps)});
      if(p.dt===today() && state.stepsDate===p.dt) state.steps=Math.max(state.steps||0, p.steps);
    } else if(it.k==="weight"){
      state.weights=(state.weights||[]).filter(w=>w.date!==p.date);
      if(!p.del){ state.weights.push({id:newId(), date:p.date, kg:p.kg}); state.weights.sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0); }
    } else if(it.k==="prefs"){
      applyPrefs(p); _lastPrefs=JSON.stringify(p);
    } else if(it.k==="salida"){
      if(!Array.isArray(state.salidas)) state.salidas=[];
      if(p && p.id && !state.salidas.some(x=>x.id===p.id)) state.salidas.push(salidaLocal(p));
    } else if(it.k==="salidaDelete"){
      if(Array.isArray(state.salidas)) state.salidas=state.salidas.filter(x=>x.id!==(p&&p.id));
    }
  });
  state.sessions.sort((a,b)=>(a.ts||0)-(b.ts||0));
  if(Array.isArray(state.salidas)) sortSalidas(state.salidas);
}

window.addEventListener("online", ()=>{ flushOutbox(); });
document.addEventListener("visibilitychange", ()=>{ if(document.visibilityState==="visible") flushOutbox(); });

// Pasos de un día solos (la columna steps de daily_logs, nada más): los que se leen de Salud /
// Health Connect (core/salud.js; no hay pasos a mano). Van directo a
// la cola y no por la foto del día: así no se manda la foto de este celular (podría pisar
// comidas o agua cargadas en otro) y no se pierden si loadCloud reemplaza el estado.
// Devuelve la promesa del envío.
export function queueSteps(dt, steps){
  if(!State.cloudUser) return Promise.resolve(false);
  enqueue("steps", {dt:dt, steps:Math.max(0, Math.round(steps)||0)}, dt);
  refreshSyncFoot();
  return flushOutbox();
}
// Los pasos de hoy ya van por queueSteps: que la foto del día no cuente ese cambio como algo
// nuevo para mandar (sí cuenta si además cambió otra cosa).
export function noteStepsSynced(n){
  if(!_lastDay) return;
  try{ const d=JSON.parse(_lastDay); if(d && d.dt===today()){ d.steps=n; _lastDay=JSON.stringify(d); } }catch(e){}
}

// Las funciones cloud* devuelven true si quedó en la nube, false si quedó pendiente y
// "failed" si la base lo rechazó (ver enqueueAndSend).
export function cloudInsertSession(se){
  const entries=[];
  (se.exercises||[]).forEach((ex,ei)=>{ (ex.sets||[]).forEach((sset,i)=>{ entries.push({id:newId(), name:ex.name, order:setOrder(ei,i), kg:sset.kg, reps:sset.reps, secs:sset.secs||0}); }); });
  se.cloudId=se.id; // el id del entreno ES el id de la fila en la nube
  return enqueueAndSend("session", {id:se.id, date:se.date, day:se.day, ts:se.ts, dur:se.dur||0, exercises:se.exercises, entries:entries});
}

// Entreno corregido desde el historial. Si todavía no salió de la cola, se corrige ahí mismo;
// si ya está en la nube, se manda el reemplazo de sus series (la última corrección pisa a
// una anterior que todavía no se mandó).
export function cloudEditSession(se){
  const entries=[];
  (se.exercises||[]).forEach((ex,ei)=>{ (ex.sets||[]).forEach((sset,i)=>{ entries.push({id:newId(), name:ex.name, order:setOrder(ei,i), kg:sset.kg, reps:sset.reps, secs:sset.secs||0}); }); });
  if(!State.cloudUser) return Promise.resolve(false);
  const q=readQueue(OUTBOX_KEY);
  const pend=q.find(i=>i.uid===State.cloudUser.id && i.k==="session" && i.p && i.p.id===se.id);
  // Todavía en la cola: se corrige ahí también (por si se reinstala antes de mandarlo). La
  // corrección igual va aparte, después: si el entreno se estaba mandando justo ahora con
  // los datos viejos, la corrección llega igual.
  if(pend){ pend.p.exercises=se.exercises; writeQueue(OUTBOX_KEY, q); }
  const cid=se.cloudId || (pend && se.id);
  if(!cid) return Promise.resolve(true); // entrenos viejos, guardados antes de tener id de nube
  return enqueueAndSend("sessionEdit", {id:cid, exercises:se.exercises, entries:entries}, cid);
}

export function cloudSessionFeedback(se){
  if(!se.cloudId) return Promise.resolve(true); // entrenos viejos, guardados antes de tener id de nube
  return enqueueAndSend("feedback", {id:se.cloudId, rpe:se.rpe||null, pump:se.pump||null, joint:(typeof se.joint==="boolean")?se.joint:null});
}

// Comidas de un día anterior (Comida → deslizar a otro día). La última versión del día
// reemplaza a una anterior que todavía no se mandó.
export function cloudSaveFoods(dt, list){
  const foods=(list||[]).map(e=>{ if(!UUID_RE.test(String(e.id))) e.id=newId(); return {id:e.id, meal:e.meal||null, name:e.name, grams:e.grams, unit:e.unit||"g", kcal:e.kcal||0, p:e.p||0, c:e.c||0, f:e.f||0, base:e.base||null}; });
  if(!State.cloudUser) return Promise.resolve(true);
  const ids=foods.map(f=>f.id), removed=foodsRemoved("foods", "foods:"+dt, dt, ids);
  noteFoodsSeen(dt, ids);
  return enqueueAndSend("foods", {dt:dt, foods:foods, removed:removed}, "foods:"+dt);
}

// Un día anterior recién traído de la nube (screens/comida-historial.js): lo que se borre de
// esa lista se borra en la nube.
export function foodsLoaded(dt, ids){ if(State.cloudUser) noteFoodsSeen(dt, ids); }

// Lo que todavía no subió de un día anterior (para mostrarlo encima de lo que trae la nube).
export function pendingFoods(dt){
  if(!State.cloudUser) return null;
  const it=myPending().filter(i=>i.k==="foods" && i.p && i.p.dt===dt).pop();
  return it ? it.p.foods.map(f=>Object.assign({}, f)) : null;
}

export function cloudSaveDaily(dt, rec){ return enqueueAndSend("daily", {dt:dt, rec:rec}, dt); }

export function cloudSaveCheckin(wk, f){ return enqueueAndSend("checkin", {wk:wk, f:f}, wk); }

// Check-in de esa semana que todavía no llegó a la nube (queda en la cola y se manda solo).
export function checkinPending(wk){ return myPending().some(i=>i.k==="checkin" && i.p && i.p.wk===wk); }

// Último check-in de esa semana que la base rechazó: sus respuestas vuelven al formulario
// para mandarlo de nuevo, en vez de perderse cuando la app trae lo de la nube.
export function failedCheckin(wk){
  const u=State.cloudUser&&State.cloudUser.id; if(!u) return null;
  const it=readQueue(OUTBOX_FAILED_KEY).filter(i=>i.uid===u && i.k==="checkin" && i.p && i.p.wk===wk).pop();
  return it && it.p.f ? JSON.parse(JSON.stringify(it.p.f)) : null;
}

export async function cloudDeleteSession(cid){
  if(!State.sb||!State.cloudUser||!cid) return true;
  // Si todavía no salió de la cola (o tiene feedback pendiente), se descarta: si no,
  // volvería a aparecer en la nube después de borrarlo.
  writeQueue(OUTBOX_KEY, readQueue(OUTBOX_KEY).filter(i=>!((i.k==="session"||i.k==="feedback"||i.k==="sessionEdit") && i.p && i.p.id===cid)));
  // El borrado también va por la cola: sin señal, antes solo se intentaba una vez y el
  // entreno volvía a aparecer al recargar desde la nube.
  return enqueueAndSend("sessionDelete", {id:cid}, cid);
}

// ===== Salidas de Cardio «A pie» / «En bici» (supabase/cardio-a-pie.sql) =====
// Se guardan en state.salidas (el resumen, sin coordenadas: ver core/salidas.js) y van a la
// nube por la misma cola que los entrenos, con el recorrido en el mismo pendiente ("salida").
// La tabla es cardio_outings: los nombres de la versión anterior (cardio_sessions,
// cardio_routes y los pendientes cardio / cardioDelete / cardioRoute) no se reusan.

// Columnas para las listas (alumno y coach): todo menos el recorrido, que se pide de a una
// salida al abrirla (fetchSalidaTrack).
export const SALIDA_COLS = "id, mode, performed_on, started_at, ended_at, duration_s, moving_s, distance_m, kcal, avg_speed_kmh, max_speed_kmh, weight_kg, weight_default, gap_s, breakdown, segments, splits, points, created_at";

// Texto del pie cuando lo único pendiente son salidas que esperan su tabla.
export const SALIDAS_ESPERA = "Tus salidas quedan guardadas en este celular y se suben solas a tu cuenta apenas se pueda";
// ¿La última vez la base dijo que todavía no tiene la tabla de las salidas?
export const salidasEnEspera = () => _salidasNoTable;

const intIn=(v,lo,hi)=>Math.min(hi, Math.max(lo, Math.round(Number(v)||0)));
const numIn=(v,lo,hi)=>{ const n=Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n*100)/100)) : null; };
const objOr=v=>(v && typeof v==="object" && !Array.isArray(v)) ? v : {};
// Resumen guardado (core/cardiogps.js summarize) + recorrido → fila de cardio_outings, dentro de
// los límites de la tabla (un dato fuera de rango la haría rechazar para siempre).
function salidaRow(p, uid){
  const kg=Number(p.kg), tr=p.track;
  return {
    id:p.id, client_id:uid, mode:p.mode==="bici"?"bici":"pie",
    performed_on:p.date || ymd(new Date(p.startedAt)), started_at:p.startedAt, ended_at:p.endedAt||null,
    duration_s:intIn(p.dur,1,86400), moving_s:intIn(p.moving,0,86400), distance_m:intIn(p.dist,0,1000000),
    kcal:p.kcal==null ? null : intIn(p.kcal,0,20000), avg_speed_kmh:numIn(p.avg,0,200), max_speed_kmh:numIn(p.max,0,200),
    weight_kg:(kg>=20 && kg<=400) ? Math.round(kg*10)/10 : null, weight_default:!!p.kgDefault, gap_s:intIn(p.gap,0,86400),
    breakdown:objOr(p.breakdown), segments:Array.isArray(p.segments)?p.segments.slice(0,200):[], splits:Array.isArray(p.splits)?p.splits.slice(0,1000):[],
    track:(typeof tr==="string" && tr.length>=3 && tr.length<=200000 && tr.slice(0,2)==="1;") ? tr : null,
    points:p.points==null ? null : intIn(p.points,0,200000),
  };
}
// Fila de cardio_outings (sin el recorrido) → salida como la guarda la app (cloud: ya está en la nube).
export function salidaFromRow(r){
  const n=v=>Number(v)||0;
  return { id:r.id, mode:r.mode==="bici"?"bici":"pie", date:r.performed_on, startedAt:r.started_at, endedAt:r.ended_at||null,
    dur:n(r.duration_s), moving:n(r.moving_s), dist:n(r.distance_m), kcal:r.kcal==null?null:n(r.kcal), avg:n(r.avg_speed_kmh), max:n(r.max_speed_kmh),
    kg:r.weight_kg==null?null:n(r.weight_kg), kgDefault:!!r.weight_default, gap:n(r.gap_s), points:r.points==null?null:n(r.points),
    breakdown:objOr(r.breakdown), segments:Array.isArray(r.segments)?r.segments:[], splits:Array.isArray(r.splits)?r.splits:[], cloud:true };
}
const salidaLocal=p=>{ const c=Object.assign({}, p); delete c.track; return c; };
const salidaTs=s=>Date.parse(s && s.startedAt)||0;
function sortSalidas(list){ return list.sort((a,b)=>salidaTs(a)-salidaTs(b)); }
// Las de la nube + las del celular que la nube todavía no tiene (mismo id, sin duplicar) − las
// que tienen el borrado pendiente. Una que ya estuvo en la nube (cloud) y ahora no está se
// borró desde otro dispositivo.
function mergeSalidas(rows){
  const del=new Set(myPending().filter(i=>i.k==="salidaDelete" && i.p).map(i=>i.p.id));
  const seen=new Set(rows.map(r=>r && r.id));
  const out=rows.filter(r=>r && r.id && !del.has(r.id)).map(salidaFromRow);
  (Array.isArray(state.salidas)?state.salidas:[]).forEach(l=>{ if(l && l.id && !seen.has(l.id) && !del.has(l.id) && !l.cloud) out.push(l); });
  state.salidas=sortSalidas(out);
  // Los recorridos de las que ya no están (borradas en otro dispositivo) se van de la caché.
  pruneTracks(state.salidas.map(x=>x.id));
}
// Ya está en la nube: si después no aparece al leerla, es que se borró desde otro dispositivo.
function salidaSubida(id){
  const s=(Array.isArray(state.salidas)?state.salidas:[]).find(x=>x.id===id);
  if(s && !s.cloud){ s.cloud=true; save(); }
}

// Una salida terminada (rec: summarize de core/cardiogps.js; track: encodeTrack, o null). La
// última versión de la misma salida reemplaza a una anterior que todavía no salió.
export function cloudSaveSalida(rec, track){
  if(!rec || !rec.id) return Promise.resolve(true);
  return enqueueAndSend("salida", Object.assign(salidaLocal(rec), {track:track||null}), rec.id);
}
// Borrar una salida. Si todavía no salió de la cola, se saca de ahí; el borrado igual se manda
// (pudo estar saliendo justo ahora) y no hace nada si la fila no existe.
export function cloudDeleteSalida(id){
  if(!State.cloudUser || !id) return Promise.resolve(true);
  const mine=i=>i.uid===State.cloudUser.id && i.k==="salida" && i.p && i.p.id===id;
  writeQueue(OUTBOX_KEY, readQueue(OUTBOX_KEY).filter(i=>!mine(i)));
  // También de los apartados (los que la base rechazó): ahí quedaba con su recorrido.
  const failed=readQueue(OUTBOX_FAILED_KEY), keep=failed.filter(i=>!mine(i));
  if(keep.length!==failed.length){ if(keep.length) writeQueue(OUTBOX_FAILED_KEY, keep); else try{ localStorage.removeItem(OUTBOX_FAILED_KEY); }catch(e){} }
  return enqueueAndSend("salidaDelete", {id:id}, id);
}
// ¿Esa salida todavía está en la cola (no llegó a la nube)?
export function salidaPendiente(id){ return myPending().some(i=>i.k==="salida" && i.p && i.p.id===id); }
// El recorrido de una salida que todavía no salió de la cola (o null).
export function pendingSalidaTrack(id){
  const it=myPending().filter(i=>i.k==="salida" && i.p && i.p.id===id).pop();
  return it && typeof it.p.track==="string" ? it.p.track : null;
}
// El recorrido de una salida guardada en la nube (lo puede pedir el alumno o su coach: ver las
// políticas de cardio_outings). Sin sesión, sin conexión, sin la tabla o sin recorrido: null.
export async function fetchSalidaTrack(id){
  if(!State.sb || !State.cloudUser || !id) return null;
  try{
    const r=await State.sb.from("cardio_outings").select("track").eq("id",id).maybeSingle();
    if(r.error){ if(noTable(r.error, "cardio_outings")) markSalidasNoTable(); else console.error("recorrido", r.error); return null; }
    return (r.data && typeof r.data.track==="string" && r.data.track) ? r.data.track : null;
  }catch(e){ console.error("recorrido", e); return null; }
}

// Cartel "mail confirmado" al volver del link del mail. La app se arma por detrás
// (loading) y el cartel se queda al menos lo que tarda la barra, para que se llegue a leer.
async function showMailConfirmed(loading){
  try{ history.replaceState(null,"",location.pathname); }catch(e){}
  if(window.coreCancel) window.coreCancel(); // este cartel reemplaza al splash de arranque
  const el=document.createElement("div");
  el.id="mailOk"; el.setAttribute("role","status");
  el.innerHTML='<div class="mo-check" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>'
    +'<h1 class="mo-title">¡Mail confirmado con éxito!</h1>'
    +'<p class="mo-sub">Te redirigimos a la app en breve.</p>'
    +'<div class="gize-bar" aria-hidden="true"><i></i></div>';
  document.body.appendChild(el);
  const minWait=new Promise(r=>setTimeout(r, matchMedia("(prefers-reduced-motion: reduce)").matches ? 1500 : 2600));
  try{ await Promise.all([loading, minWait]); }
  finally{
    el.classList.add("out");
    setTimeout(()=>el.remove(), 400);
  }
}

export async function cloudBoot(){
  await ensureSb();
  // Sin la librería de Supabase no hay cuenta: antes se mostraba la app igual, "sin
  // cuenta", y lo que se cargaba ahí se daba por guardado sin entrar nunca a la cola de
  // envío. Ahora se pide el login, que al tocar "Ingresar" reintenta la conexión.
  const offlineMsg="No hay conexión con el servidor. Revisá tu internet y tocá Ingresar para reintentar.";
  const app=NativeApp();
  // Con la app ya abierta (en segundo plano) el link del mail y la vuelta de Google llegan por
  // acá. Si ya hay una cuenta adentro se ignora: cambiar de cuenta sin logout mezclaría los
  // datos locales. Se registra ANTES de mirar si cargó Supabase: si la librería tardó al abrir
  // la app y después el usuario toca Google, la vuelta tiene que llegar igual.
  if(app){ try{ app.addListener("appUrlOpen", e=>{
    const B=window.Capacitor.Plugins.Browser; if(B && e && e.url && e.url.indexOf("gize://login")===0) B.close().catch(()=>{});
    if(State.cloudUser && !State.sessionLost) return;
    ensureSb().then(sb=>{ if(!sb){ showLogin(offlineMsg,"in"); return; } return openAuthLink(e && e.url); })
      .catch(err=>console.error("authLink",err));
  }); }catch(e){} }
  // Si se cierra el navegador de Google sin terminar, el botón quedaba en "Abriendo Google...".
  const Br=app && window.Capacitor.Plugins.Browser;
  if(Br){ try{ Br.addListener("browserFinished", ()=>{ setTimeout(()=>{ const g=document.querySelector('[data-auth="google"]'); if((!State.cloudUser || State.sessionLost) && g && g.disabled) showLogin("","in"); }, 800); }); }catch(e){} }
  if(!State.sb){ showLogin(offlineMsg,"in"); if(window.coreEnter) window.coreEnter(); return; }
  try{
    // Con el token vencido (alcanza con no haber abierto la app en la última hora) getSession()
    // lo renueva, y sin señal reintenta ~30 s y devuelve session:null aunque la sesión sigue
    // guardada: antes quedaba la pantalla vacía y después «Ingresar» sin decir nada de la
    // conexión (y quien entra con Google no tiene contraseña). Ahora, si hay una sesión guardada
    // y no se confirma en 3 s (o falla por red), se entra con ella: la app abre con lo local y
    // el pie de «Sin conexión», y cuando vuelve la señal la librería renueva el token y
    // watchAuth sincroniza. Si el servidor la rechaza de verdad la librería la borra y avisa
    // SIGNED_OUT (→ sessionLost).
    let stored=null; try{ stored=JSON.parse(authStorage.getItem(State.sb.auth.storageKey)||"null"); }catch(e){}
    if(!(stored && stored.user && stored.user.id && stored.refresh_token)) stored=null;
    const gs=State.sb.auth.getSession();
    let sess=stored ? await Promise.race([gs, new Promise(ok=>setTimeout(()=>ok(null), 3000))]) : await gs;
    const stale=!!stored && (!sess || (!sess.data.session && !!sess.error && sess.error.name==="AuthRetryableFetchError"));
    if(stale) sess={data:{session:stored}};
    // Sesión sin "mantener iniciada" que ya se cerró: antes se borraban acá los datos del
    // celular, y con eso lo que todavía no se había subido (un tester perdió su rutina así).
    // Ahora quedan detrás del login: si vuelve a entrar la misma cuenta se suben, y si entra
    // otra, afterLogin() arranca de cero (state.ownerUid).
    // Botón del mail de recuperar contraseña (#recuperar=...), sin una cuenta adentro.
    if(RECOVER_HASH && !sess.data.session){
      const res=await useRecoveryLink(RECOVER_HASH);
      if(res.ok) showLogin("", "newpass");
      else if(res.why==="used") showLogin(RECOVERY_MSG.used, "forgot");
      // Pedido desde la app: el botón del mail abre el navegador. Se puede terminar acá con el
      // código, o escribirlo en la app (que ya lo está pidiendo).
      else showLogin(res.why==="elsewhere" && /^pkce_/.test(RECOVER_HASH) ? RECOVERY_MSG.elsewhereApp : (RECOVERY_MSG[res.why]||RECOVERY_MSG.elsewhere), "code", { askEmail:true });
    }
    // Contraseña nueva a medio elegir (se cerró la app en ese paso): se vuelve a pedir.
    // También sin señal (sesión guardada sin confirmar): la app no se abre en esa cuenta.
    else if(sess.data.session && recoveryPendingFor(sess.data.session)){
      showLogin("", "newpass");
    }
    else if(LINK_REFUSED && !sess.data.session){
      // Link de los mails de antes: Supabase ya lo gastó al abrirlo, y el código también.
      if(LINK_REFUSED==="recovery") showLogin(RECOVERY_MSG.oldLink,"forgot");
      else if(LINK_REFUSED==="signup") showLogin("Listo, tu mail quedó confirmado. Ingresá con tu mail y tu contraseña.","in");
      else showLogin("No se pudo completar el ingreso desde ese link. Ingresá con tu mail y contraseña o con Google.","in");
    }
    else if(sess.data.session && RECOVERY_LANDING){
      try{ history.replaceState(null,"",location.pathname); }catch(e){}
      clearRecoveryRequest(); setRecoveryPending(sess.data.session);
      showLogin("", "newpass");
    }
    else if(sess.data.session){
      if(CONFIRM_LANDING) await showMailConfirmed(afterLogin(sess.data.session.user, stale));
      else await afterLogin(sess.data.session.user, stale);
      // El link para cambiar la contraseña se abrió en un navegador que ya tenía una cuenta
      // adentro: no se toca (cambiar de cuenta sin salir mezclaría los datos) y se explica.
      // El botón nuevo (#recuperar) no se gastó: el código del mail sigue sirviendo.
      if(RECOVER_HASH) setTimeout(()=>alert("Ese link para cambiar la contraseña se abrió en un navegador donde ya hay una cuenta abierta, así que no se usa acá. Seguís con esa cuenta.\n\nEscribí el código de 6 números que trae el mail en GIZE, en el celular o navegador donde pediste el cambio (en «Ya tengo un código»). Todavía sirve."), 600);
      else if(LINK_REFUSED==="recovery") setTimeout(()=>alert("Ese link para cambiar la contraseña se abrió en un navegador distinto del que lo pidió, así que no sirve acá (es por seguridad). Seguís con la cuenta que ya tenías abierta.\n\nPara cambiar la contraseña, pedí un mail nuevo desde «¿Olvidaste tu contraseña?», en el celular o navegador donde la vayas a cambiar."), 600);
    }
    else if(CONFIRM_ERROR){
      try{ history.replaceState(null,"",location.pathname); }catch(e){}
      // Volvió de Google con error (canceló, o el proveedor falló): no es el link del mail.
      showLogin((takeGoogleIntent() ? GOOGLE_ERROR_MSG : CONFIRM_ERROR_MSG)+authErrDetail(BOOT_AUTH.get("error_description")),"in");
    }
    // La app estaba cerrada y la abrió el link del mail.
    else if(app && await openAuthLink(((await app.getLaunchUrl().catch(()=>null))||{}).url)){}
    // Había una sesión guardada y el servidor no la aceptó (se cerró desde otro dispositivo o
    // venció del todo): antes se veía «Ingresar» sin explicación.
    else if(stored) showLogin(LOST_MSG, "in", {email:stored.user.email||""});
    else {
      // Links de la landing: #registro abre "Crear cuenta" y #registro-coach lo abre con
      // "Soy coach" ya elegido. Se limpia el # para que recargar no lo repita. En la app de
      // iPhone no hay cuentas nuevas de coach (core/tienda.js): los dos abren el de alumno.
      const h=location.hash;
      if(h==="#registro"||h==="#registro-coach"){
        try{ history.replaceState(null,"",location.pathname+location.search); }catch(e){}
        showLogin(isOnline()?"":offlineMsg,"up",h==="#registro-coach"&&!appIOS()?{role:"coach"}:{});
      } else showLogin(isOnline()?"":offlineMsg,"in"); // sin señal, que se sepa por qué no va a poder entrar
    }
  }catch(e){ console.error("cloudBoot",e); showLogin(offlineMsg,"in"); }
  finally{ if(window.coreEnter) window.coreEnter(); }
}
