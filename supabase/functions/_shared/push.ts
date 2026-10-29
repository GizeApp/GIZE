// Mandar una notificación a los dispositivos de una persona (web, Android e iPhone), para las
// funciones nuevas que avisan algo (por ahora, el resumen de los lunes: resumen-semanal). Es la
// misma send() de avisos-coach/index.ts, con los mismos topes de tiempo, exportada como mandarAviso:
// las funciones que ya estaban (avisos-coach, admin, notificar-cliente) siguen con la suya. Un aviso
// nuevo importa esta en vez de copiarla otra vez.
// Usa los secrets de siempre: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY y VAPID_SUBJECT (web),
// FCM_SERVICE_ACCOUNT (Android) y APNS_KEY_P8, APNS_KEY_ID y APPLE_TEAM_ID (iPhone).
// Lo prueban tests/avisos-tope.test.mjs (los topes) y tests/resumen-semanal.test.mjs (que manda).

import webpush from "npm:web-push@3.6.7";
import { importPKCS8, SignJWT } from "npm:jose@5";
import { tokenCache } from "./apns.ts";
import { type Envio, pasajero } from "../avisos-coach/reparto.ts";

export type Sub = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };
export type { Envio };
type ServiceAccount = { project_id: string; client_email: string; private_key: string };

// Tiempo máximo de cada envío: un dispositivo que no contesta no traba los avisos de los demás.
export const TOPE_MS = 10_000;
// web-push corta la conexión con su opción timeout; por las dudas, también se deja de esperar.
export function conTope<T>(p: Promise<T>, ms = TOPE_MS): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([p, new Promise<T>((_, no) => { t = setTimeout(() => no(new Error("sin respuesta en " + ms / 1000 + " s")), ms); })])
    .finally(() => clearTimeout(t));
}

function serviceAccount(): ServiceAccount | null {
  try {
    const sa = JSON.parse(Deno.env.get("FCM_SERVICE_ACCOUNT") || "");
    return sa && sa.project_id && sa.client_email && sa.private_key ? sa : null;
  } catch { return null; }
}
async function fcmAccessToken(sa: ServiceAccount): Promise<string> {
  const key = await importPKCS8(sa.private_key, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({ scope: "https://www.googleapis.com/auth/firebase.messaging" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(sa.client_email).setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now).setExpirationTime(now + 3600).sign(key);
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
    signal: AbortSignal.timeout(TOPE_MS),
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error("OAuth FCM: " + JSON.stringify(j));
  return j.access_token;
}
// El JWT de Apple y el token de Firebase se sacan una vez y se reusan (ver apns.ts).
const apnsJwt = tokenCache(async () => {
  const p8 = Deno.env.get("APNS_KEY_P8"), kid = Deno.env.get("APNS_KEY_ID"), team = Deno.env.get("APPLE_TEAM_ID");
  if (!p8 || !kid || !team) return null;
  const key = await importPKCS8(p8, "ES256");
  return await new SignJWT({}).setProtectedHeader({ alg: "ES256", kid }).setIssuer(team).setIssuedAt().sign(key);
});
const fcmToken = tokenCache(async () => {
  const sa = serviceAccount();
  return sa ? await fcmAccessToken(sa) : null;
});

// Manda una notificación a todos los dispositivos de la lista (web, Android e iPhone), los
// tres en paralelo. Devuelve a cuántos llegó, los ids de los que ya no existen (para
// borrarlos) y si alguno falló por algo pasajero (ver avisos-coach/reparto.ts). url: la que abre
// el aviso en el navegador.
async function send(subs: Sub[], title: string, body: string, tag: string, url = "./app/"): Promise<Envio> {
  const gone: string[] = [];
  let llegaron = 0, falla = false;
  const web = subs.filter((s) => s.endpoint.startsWith("https://"));
  const fcm = subs.filter((s) => s.endpoint.startsWith("fcm:"));
  const apns = subs.filter((s) => s.endpoint.startsWith("apns:"));

  const toWeb = async () => {
    const pub = Deno.env.get("VAPID_PUBLIC_KEY"), priv = Deno.env.get("VAPID_PRIVATE_KEY");
    if (!web.length || !pub || !priv) return;
    webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "mailto:soporte@gize.ar", pub, priv);
    const payload = JSON.stringify({ title, body, tag, url });
    const opts = { TTL: 60 * 60 * 24, urgency: "normal", timeout: TOPE_MS };
    await Promise.all(web.map(async (s) => {
      const sub = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
      // Claves mal armadas: web-push falla antes de mandar y sin statusCode. No es pasajero.
      try { webpush.generateRequestDetails(sub, payload, opts); }
      catch (e) { console.error("push: suscripción mal armada", (e as Error).message); return; }
      try { await conTope(webpush.sendNotification(sub, payload, opts)); llegaron++; }
      catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) gone.push(s.id);
        else { console.error("push", code, (e as Error).message); if (pasajero(code)) falla = true; }
      }
    }));
  };

  const toFcm = async () => {
    const sa = fcm.length ? serviceAccount() : null;
    if (!sa) return;
    let access: string | null = null;
    try { access = await fcmToken(); } catch (e) { console.error((e as Error).message); falla = true; }
    if (access) await Promise.all(fcm.map(async (s) => {
      try {
        const r = await fetch("https://fcm.googleapis.com/v1/projects/" + sa.project_id + "/messages:send", {
          method: "POST",
          headers: { Authorization: "Bearer " + access, "Content-Type": "application/json" },
          body: JSON.stringify({ message: {
            token: s.endpoint.slice(4), notification: { title, body },
            android: { priority: "HIGH", ttl: "86400s", notification: { sound: "default", color: "#2FA0FF", tag } },
          } }),
          signal: AbortSignal.timeout(TOPE_MS),
        });
        if (r.ok) { llegaron++; return; }
        const t = await r.text();
        if (r.status === 404 || t.includes("UNREGISTERED")) gone.push(s.id);
        else { console.error("fcm", r.status, t); if (pasajero(r.status)) falla = true; }
      } catch (e) { console.error("fcm", (e as Error).message); falla = true; }
    }));
  };

  const toApns = async () => {
    if (!apns.length) return;
    let jwt: string | null = null;
    try { jwt = await apnsJwt(); } catch (e) { console.error("apns jwt", (e as Error).message); falla = true; }
    if (jwt) await Promise.all(apns.map(async (s) => {
      try {
        const r = await fetch("https://api.push.apple.com/3/device/" + s.endpoint.slice(5), {
          method: "POST",
          headers: {
            authorization: "bearer " + jwt, "apns-topic": "ar.com.gize.app", "apns-push-type": "alert",
            "apns-priority": "10", "apns-expiration": String(Math.floor(Date.now() / 1000) + 86400),
            "content-type": "application/json",
          },
          body: JSON.stringify({ aps: { alert: { title, body }, sound: "default", "thread-id": tag } }),
          signal: AbortSignal.timeout(TOPE_MS),
        });
        if (r.ok) { llegaron++; return; }
        const t = await r.text();
        if (r.status === 410 || /BadDeviceToken|Unregistered|DeviceTokenNotForTopic/.test(t)) gone.push(s.id);
        else { console.error("apns", r.status, t); if (pasajero(r.status)) falla = true; }
      } catch (e) { console.error("apns", (e as Error).message); falla = true; }
    }));
  };

  await Promise.allSettled([toWeb(), toFcm(), toApns()]);
  return { llegaron, gone, pasajero: falla };
}

export const mandarAviso = send;
