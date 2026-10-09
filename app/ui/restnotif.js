// Aviso de fin de descanso con la pantalla apagada o la app en segundo plano.
//
//   · Apps de las tiendas (Capacitor): el celular programa una notificación con sonido
//     para la hora de fin (plugin LocalNotifications), sin internet. En Android además se
//     muestra una notificación fija con la cuenta regresiva (plugin propio RestTimer,
//     android/…/RestTimerPlugin.java), que se borra sola al terminar. (La barra que se llena
//     necesita un servicio en primer plano y un video para Play Console: queda para después.)
//   · Web / app instalada desde el navegador: el navegador no puede sonar con la pantalla
//     apagada, así que se le pide al servidor que mande una notificación push a la hora de
//     fin (supabase/descanso.sql + función "descanso"). Solo si ya activó las
//     notificaciones en Configuración.
//
// Todo es "mejor esfuerzo": si algo falla, el descanso sigue funcionando igual en la app.

import { State } from '../core/state.js';

import { pushOnHere } from '../core/push.js';

const NOTIF_ID = 4101;
const CHANNEL = "descanso_fin";
let channelDone = false;

function cap(){ try { return window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() ? window.Capacitor : null; } catch (e) { return null; } }
function platform(){ try { return window.Capacitor.getPlatform(); } catch (e) { return "web"; } }
function hhmm(ms){ const d = new Date(ms); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }

// Android 12+: sin «Alarmas y recordatorios» el plugin programa una alarma inexacta, que Android
// puede atrasar más de un minuto con la pantalla apagada (desde Android 14 viene apagado en las
// instalaciones nuevas). Se pide una sola vez, en el primer descanso; si no lo da, sigue igual.
const EXACT_KEY = "gize_alarma_exacta_pedida";
async function askExact(LN){
  let asked = false; try { asked = localStorage.getItem(EXACT_KEY) === "1"; } catch (e) {}
  if (asked || !LN.checkExactNotificationSetting) return;
  try {
    const s = await LN.checkExactNotificationSetting();
    if (!s || s.exact_alarm === "granted") return;
    try { localStorage.setItem(EXACT_KEY, "1"); } catch (e) {}
    if (confirm("Para que el aviso de fin de descanso suene justo a tiempo con la pantalla apagada, activá «Alarmas y recordatorios» para GIZE en la pantalla que se abre.")) await LN.changeExactNotificationSetting();
  } catch (e) {}
}

async function nativeSchedule(C, endAt){
  const LN = C.Plugins.LocalNotifications; if (!LN) return;
  let p = await LN.checkPermissions();
  if (p.display === "prompt" || p.display === "prompt-with-rationale") p = await LN.requestPermissions();
  if (p.display !== "granted") return;
  if (platform() === "android") await askExact(LN); // antes de programar, así este ya va exacto
  if (platform() === "android" && !channelDone) {
    try { await LN.createChannel({ id: CHANNEL, name: "Fin del descanso", description: "Suena cuando termina el descanso entre series.", importance: 5, visibility: 1, vibration: true }); } catch (e) {}
    channelDone = true;
  }
  await LN.cancel({ notifications: [{ id: NOTIF_ID }] }).catch(() => {});
  await LN.schedule({ notifications: [{
    id: NOTIF_ID,
    title: "¡Descanso terminado! 💪",
    body: "Volvé a la próxima serie.",
    schedule: { at: new Date(endAt), allowWhileIdle: true },
    channelId: CHANNEL,
    smallIcon: "ic_stat_gize",
    iconColor: "#2FA0FF",
  }] });
  const RT = C.Plugins.RestTimer;
  if (RT) RT.show({ endAt, total: Math.max(1, Math.round((endAt - Date.now()) / 1000)), title: "Descanso · termina " + hhmm(endAt) }).catch(() => {});
}

async function nativeCancel(C){
  const LN = C.Plugins.LocalNotifications;
  if (LN) await LN.cancel({ notifications: [{ id: NOTIF_ID }] }).catch(() => {});
  const RT = C.Plugins.RestTimer; if (RT) RT.hide().catch(() => {});
}

// Llamar al empezar un descanso (endAt = hora de fin en ms).
export function scheduleRestAlert(endAt){
  const C = cap();
  if (C) { nativeSchedule(C, endAt).catch(e => console.error("rest notif", e)); return; }
  if (!State.sb || !State.cloudUser || !pushOnHere()) return;
  // Solo a este dispositivo: el usuario puede tener varios registrados (otro celular, la
  // compu, o el registro del dominio viejo) y el aviso le llegaba repetido.
  webEndpoint().then(ep => {
    if (!ep) return;
    const secs = Math.max(1, Math.round((endAt - Date.now()) / 1000));
    return State.sb.rpc("schedule_rest_alarm", { p_seconds: secs, p_endpoint: ep });
  }).catch(() => {});
}

async function webEndpoint(){
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub ? sub.endpoint : null;
}

// Llamar al saltear el descanso, o al terminar con la app a la vista (no hace falta avisar).
export function cancelRestAlert(){
  const C = cap();
  if (C) { nativeCancel(C).catch(() => {}); return; }
  if (!State.sb || !State.cloudUser || !pushOnHere()) return;
  Promise.resolve(State.sb.rpc("cancel_rest_alarm")).catch(() => {});
}
