// Supabase Edge Function "notificar-cliente": el coach le manda un mensaje a un cliente
// y le llega como notificación al celular, como un mensaje de WhatsApp: Web Push para la
// app instalada desde el navegador, Firebase (FCM) para la app de Android y el servicio
// de Apple (APNs) para la app de iPhone.
//
// Cómo publicarla:
//   1. Solo con la tarea "funciones" de .github/workflows/supabase.yml, que publica la carpeta
//      entera (con apns.ts) como "rapid-worker", el nombre que usa la app. No crearla desde el
//      panel de Supabase: se saltea el «solo desde main», y si hay otra publicada con otro
//      nombre (por ejemplo "notificar-cliente") la tarea falla. Va sin "Verify JWT": la
//      función ya chequea la sesión con auth.getUser().
//   2. Supabase → Edge Functions → Secrets → agregar:
//        VAPID_PUBLIC_KEY   (la misma que está en app/core/push.js)
//        VAPID_PRIVATE_KEY  (la privada, nunca va en el código de la app)
//        VAPID_SUBJECT      mailto:tu-mail@ejemplo.com
//        APNS_KEY_P8 / APNS_KEY_ID / APPLE_TEAM_ID  clave de Apple para la app de iPhone
//                             (developer.apple.com → Keys → Apple Push Notifications service).
//        FCM_SERVICE_ACCOUNT  el JSON entero de la cuenta de servicio de Firebase
//                             (Configuración del proyecto → Cuentas de servicio →
//                             Generar nueva clave privada). Es para la app de Android.
//   SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY ya vienen puestas.
//
// También es el chat coach ↔ alumno (supabase/chat.sql): la llama el coach o el alumno.
// Recibe { client_id, body, audio_path?, audio_secs? } con el token del que escribe
// (supabase.functions.invoke). El audio ya lo subió la app al bucket chat-audio.
// Devuelve { delivered, devices, saved, id, created_at }: a cuántos dispositivos del otro
// llegó de cuántos tenía, y si quedó guardado en la conversación (coach_messages).
// El mensaje se guarda ANTES de mandar los avisos: el freno de 30 por minuto cuenta los
// mensajes guardados, y antes uno que no se llegaba a guardar (texto raro, error de la base)
// avisaba igual al celular del otro sin contar.

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { importPKCS8, SignJWT } from "npm:jose@5";
import { tokenCache } from "../_shared/apns.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Tiempo máximo de cada envío: si Google, Apple o un navegador no contestan, el mensaje no
// queda trabado esperando.
const TOPE_MS = 10_000;
// web-push corta la conexión con su opción timeout; por las dudas, también se deja de esperar.
function conTope<T>(p: Promise<T>, ms = TOPE_MS): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([p, new Promise<T>((_, no) => { t = setTimeout(() => no(new Error("sin respuesta en " + ms / 1000 + " s")), ms); })])
    .finally(() => clearTimeout(t));
}

// La app de Android guarda su token de Firebase como endpoint "fcm:<token>".
// Para mandarle se usa la API HTTP v1 de FCM con un token OAuth de la cuenta de servicio.
type ServiceAccount = { project_id: string; client_email: string; private_key: string };
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

// La app de iPhone guarda su token de Apple como endpoint "apns:<token>". Se manda por la
// API HTTP/2 de APNs con un JWT firmado con la clave .p8 (vale hasta 1 hora). Se reusa el
// mismo entre mensajes (ver _shared/apns.ts): si se firma uno por mensaje, Apple puede rechazarlos.
const APNS_TOPIC = "ar.com.gize.app";
const apnsJwt = tokenCache(async () => {
  const p8 = Deno.env.get("APNS_KEY_P8"), kid = Deno.env.get("APNS_KEY_ID"), team = Deno.env.get("APPLE_TEAM_ID");
  if (!p8 || !kid || !team) return null;
  const key = await importPKCS8(p8, "ES256");
  return await new SignJWT({}).setProtectedHeader({ alg: "ES256", kid })
    .setIssuer(team).setIssuedAt().sign(key);
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const pub = Deno.env.get("VAPID_PUBLIC_KEY");
  const priv = Deno.env.get("VAPID_PRIVATE_KEY");
  const hasVapid = !!(pub && priv);
  if (hasVapid) webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "mailto:soporte@gize.app", pub!, priv!);

  // Quién llama: el coach o el alumno logueado (su token viene en Authorization).
  const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
  });
  const { data: u } = await asUser.auth.getUser();
  if (!u || !u.user) return json({ error: "Sesión vencida. Volvé a iniciar sesión." }, 401);
  const me = u.user.id;

  let input: { client_id?: string; body?: string; audio_path?: string; audio_secs?: number };
  try { input = await req.json(); } catch { return json({ error: "Pedido inválido" }, 400); }
  const clientId = String(input.client_id || "");
  // Texto que Postgres acepta (como en la función contacto): sin el carácter nulo y sin dejar
  // un emoji partido; si no, el mensaje no se podría guardar.
  const body = String(input.body || "").replace(/\u0000/g, "").trim().slice(0, 1000).replace(/[\uD800-\uDBFF]$/, "")
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "\uFFFD");
  const audioPath = input.audio_path ? String(input.audio_path) : null;
  const audioSecs = Math.round(Number(input.audio_secs) || 0);
  if (!clientId || (!body && !audioPath)) return json({ error: "Falta el mensaje" }, 400);

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Chat en los dos sentidos: si el que llama es el alumno, el mensaje va para su coach;
  // si no, tiene que ser el coach de ese alumno.
  const { data: client } = await admin.from("profiles").select("id, coach_id, full_name").eq("id", clientId).maybeSingle();
  if (!client || !client.coach_id) return json({ error: "Ese cliente no es tuyo" }, 403);
  // El id como lo tiene la base (el que vino puede estar escrito distinto, en mayúsculas).
  const cid: string = client.id;
  const fromClient = me === cid;
  if (!fromClient && client.coach_id !== me) return json({ error: "Ese cliente no es tuyo" }, 403);
  const coachId: string = client.coach_id;
  const toId = fromClient ? coachId : cid;
  const sender = fromClient ? "client" : "coach";

  // El audio lo sube la app antes, a la carpeta de esta conversación.
  if (audioPath) {
    const ok = new RegExp("^" + coachId + "/" + cid + "/[A-Za-z0-9_-]{8,64}\\.(webm|mp4|m4a|ogg|aac)$").test(audioPath);
    if (!ok || audioSecs < 1 || audioSecs > 180) return json({ error: "Audio inválido" }, 400);
  }

  // Con el plan del coach vencido no hay mensajes (ver supabase/suscripciones.sql). Si la
  // función coach_active todavía no existe (falta ese SQL), no se bloquea. El texto no manda a
  // renovar: lo ven también las apps de Android e iPhone (Google y Apple no dejan mandar a pagar
  // por fuera de sus tiendas). En la web, renovar está en Mi plan.
  const { data: active, error: actErr } = await admin.rpc("coach_active", { cid: coachId });
  if (!actErr && active === false) {
    return json({ error: fromClient ? "Tu coach tiene el plan de GIZE vencido: por ahora no le llegan mensajes." : "Tu plan de GIZE está vencido: por ahora no podés mandar mensajes." }, 402);
  }

  // Freno a mensajes en ráfaga (30 por minuto por conversación y lado). Si no se puede contar,
  // no se manda: antes un error al contar dejaba pasar todo.
  const since = new Date(Date.now() - 60_000).toISOString();
  const recent = async () => {
    const { count, error } = await admin.from("coach_messages").select("id", { count: "exact", head: true })
      .eq("coach_id", coachId).eq("client_id", cid).eq("sender", sender).gte("created_at", since);
    if (error) console.error("coach_messages: contar", error.message);
    return error ? null : (count || 0);
  };
  const before = await recent();
  if (before === null) return json({ error: "No se pudo mandar el mensaje. Probá de nuevo." }, 503);
  if (before >= 30) return json({ error: "Mandaste muchos mensajes seguidos. Esperá un minuto." }, 429);

  let title: string;
  if (fromClient) {
    title = (client.full_name || "Tu alumno") + " · mensaje";
  } else {
    const { data: coach } = await admin.from("profiles").select("full_name").eq("id", coachId).maybeSingle();
    title = (coach && coach.full_name) ? coach.full_name + " · tu coach" : "Tu coach";
  }
  const mm = Math.floor(audioSecs / 60), ss = String(audioSecs % 60).padStart(2, "0");
  const pushBody = audioPath ? "🎤 Mensaje de voz (" + mm + ":" + ss + ")" + (body ? " · " + body : "") : body;

  const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", toId);
  const payload = JSON.stringify({ title, body: pushBody, tag: "chat-" + cid, url: "./app/?chat=" + cid });

  const all = subs || [];
  const web = all.filter((s) => s.endpoint.startsWith("https://"));
  const fcm = all.filter((s) => s.endpoint.startsWith("fcm:"));
  const apns = all.filter((s) => s.endpoint.startsWith("apns:"));
  if (web.length && !hasVapid && !fcm.length && !apns.length) return json({ error: "Faltan las claves VAPID en los Secrets de la función" }, 500);

  // Primero se guarda (si no se puede, no sale ningún aviso y la app deja reintentar). Varios a
  // la vez pasan juntos el primer conteo: la base cuenta y guarda junto, de a uno por
  // conversación y lado (chat_guardar, supabase/chat.sql), y el que se pasa de 30 no se guarda.
  // Antes se guardaba, se volvía a contar y se borraba, pero ya le había llegado en vivo al chat
  // abierto del otro.
  const g = await admin.rpc("chat_guardar", {
    p_coach: coachId, p_client: cid, p_sender: sender, p_body: body,
    p_audio_path: audioPath, p_audio_secs: audioPath ? audioSecs : null, p_tope: 30,
  }).maybeSingle();
  let saved = g.data as { id: string; created_at: string } | null, saveErr = g.error;
  if (!saveErr && !saved) return json({ error: "Mandaste muchos mensajes seguidos. Esperá un minuto." }, 429);
  if (saveErr && (saveErr.code === "PGRST202" || saveErr.code === "42883")) {
    // Mientras no se corra supabase/chat.sql: se guarda, se cuenta de nuevo y el que se pasa
    // de 30 se borra sin avisar (como antes).
    ({ data: saved, error: saveErr } = await admin.from("coach_messages").insert({
      coach_id: coachId, client_id: cid, sender, body, delivered: 0,
      ...(audioPath ? { audio_path: audioPath, audio_secs: audioSecs } : {}),
    }).select("id, created_at").maybeSingle());
    const after = saved ? await recent() : 0;
    if (saved && (after === null || after > 30)) {
      await admin.from("coach_messages").delete().eq("id", saved.id);
      return after === null ? json({ error: "No se pudo mandar el mensaje. Probá de nuevo." }, 503)
        : json({ error: "Mandaste muchos mensajes seguidos. Esperá un minuto." }, 429);
    }
  }
  if (saveErr || !saved) {
    if (saveErr) console.error("coach_messages", saveErr.code, saveErr.message);
    return json({ error: "No se pudo guardar el mensaje. Probá de nuevo." }, 500);
  }

  // Web, Android e iPhone en paralelo, cada envío con tiempo máximo.
  let delivered = 0;
  const gone: string[] = [];
  const toWeb = () => Promise.all((hasVapid ? web : []).map(async (s) => {
    try {
      await conTope(webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24, urgency: "high", timeout: TOPE_MS }));
      delivered++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      // 404/410: el celular ya no tiene esa suscripción (desinstaló, borró datos…).
      if (code === 404 || code === 410) gone.push(s.id);
      else console.error("push", code, (e as Error).message);
    }
  }));

  const toFcm = async () => {
    const sa = fcm.length ? serviceAccount() : null;
    if (fcm.length && !sa) console.error("fcm: falta el secret FCM_SERVICE_ACCOUNT");
    if (!sa) return;
    let access = "";
    try { access = await fcmAccessToken(sa); } catch (e) { console.error((e as Error).message); }
    if (access) await Promise.all(fcm.map(async (s) => {
      try {
        const r = await fetch("https://fcm.googleapis.com/v1/projects/" + sa.project_id + "/messages:send", {
          method: "POST",
          headers: { Authorization: "Bearer " + access, "Content-Type": "application/json" },
          body: JSON.stringify({ message: {
            token: s.endpoint.slice(4),
            notification: { title, body: pushBody },
            android: { priority: "HIGH", ttl: "86400s", notification: { sound: "default", color: "#2FA0FF" } },
          } }),
          signal: AbortSignal.timeout(TOPE_MS),
        });
        if (r.ok) { delivered++; return; }
        const t = await r.text();
        // 404/UNREGISTERED: desinstaló la app o el token ya no vale.
        if (r.status === 404 || t.includes("UNREGISTERED")) gone.push(s.id);
        else console.error("fcm", r.status, t);
      } catch (e) { console.error("fcm", (e as Error).message); }
    }));
  };

  const toApns = async () => {
    if (!apns.length) return;
    let jwt: string | null = null;
    try { jwt = await apnsJwt(); } catch (e) { console.error("apns jwt", (e as Error).message); }
    if (!jwt) { console.error("apns: faltan APNS_KEY_P8 / APNS_KEY_ID / APPLE_TEAM_ID"); return; }
    await Promise.all(apns.map(async (s) => {
      try {
        const r = await fetch("https://api.push.apple.com/3/device/" + s.endpoint.slice(5), {
          method: "POST",
          headers: {
            authorization: "bearer " + jwt, "apns-topic": APNS_TOPIC, "apns-push-type": "alert",
            "apns-priority": "10", "apns-expiration": String(Math.floor(Date.now() / 1000) + 86400),
            "content-type": "application/json",
          },
          body: JSON.stringify({ aps: { alert: { title, body: pushBody }, sound: "default" } }),
          signal: AbortSignal.timeout(TOPE_MS),
        });
        if (r.ok) { delivered++; return; }
        const t = await r.text();
        // 410 / BadDeviceToken / Unregistered: la app se desinstaló o el token ya no vale.
        if (r.status === 410 || /BadDeviceToken|Unregistered|DeviceTokenNotForTopic/.test(t)) gone.push(s.id);
        else console.error("apns", r.status, t);
      } catch (e) { console.error("apns", (e as Error).message); }
    }));
  };

  await Promise.allSettled([toWeb(), toFcm(), toApns()]);
  if (gone.length) await admin.from("push_subscriptions").delete().in("id", gone);
  // A cuántos dispositivos llegó (el coach lo ve en el historial de avisos).
  if (delivered) {
    const { error: upErr } = await admin.from("coach_messages").update({ delivered }).eq("id", saved.id);
    if (upErr) console.error("coach_messages: delivered", upErr.message);
  }

  return json({ delivered, devices: (subs || []).length - gone.length, saved: true, id: saved.id, created_at: saved.created_at });
});
