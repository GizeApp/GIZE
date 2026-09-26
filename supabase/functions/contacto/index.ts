// Supabase Edge Function "contacto": recibe los mails que la gente manda a contacto@gize.ar
// (o a cualquier dirección @gize.ar). Resend recibe el correo del dominio y avisa acá con el
// evento "email.received"; la función baja el texto del mail, lo guarda en
// public.contact_messages (ver supabase/contacto.sql) y les manda una notificación a los
// administradores (los que tienen los avisos prendidos en su celular o computadora).
// Se lee y se responde en gize.ar/admin → Mensajes.
//
// Secrets:
//   RESEND_WEBHOOK_SECRET  el "Signing secret" del webhook de Resend (whsec_…). Sin esto no se
//                          acepta nada: cualquiera podría mandar mensajes falsos.
//   RESEND_FULL_KEY        clave de Resend con acceso completo ("Full access"): para leer el mail
//                          recibido hace falta; la de solo envío (RESEND_API_KEY) no alcanza.
//   + los de las notificaciones (VAPID, FCM_SERVICE_ACCOUNT y los de Apple), como las demás.
// Va sin "Verify JWT": la llama Resend, y se valida con la firma del webhook.

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { importPKCS8, SignJWT } from "npm:jose@5";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

// ---- Firma del webhook (Resend usa el formato de Svix) ----
// Se firma "id.timestamp.cuerpo" con HMAC-SHA256; la clave es lo que sigue a "whsec_" en base64.
function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function signatureOk(req: Request, raw: string, secret: string): Promise<boolean> {
  const id = req.headers.get("svix-id") || req.headers.get("webhook-id");
  const ts = req.headers.get("svix-timestamp") || req.headers.get("webhook-timestamp");
  const sig = req.headers.get("svix-signature") || req.headers.get("webhook-signature");
  if (!id || !ts || !sig) return false;
  const t = Number(ts);
  if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > 300) return false; // más de 5 minutos: reenvío viejo
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey("raw", b64ToBytes(secret.replace(/^whsec_/, "")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  } catch { return false; }
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(id + "." + ts + "." + raw)));
  let bin = "";
  mac.forEach((b) => { bin += String.fromCharCode(b); });
  const expected = btoa(bin);
  return sig.split(" ").some((part) => {
    const [v, s] = part.split(",");
    return v === "v1" && typeof s === "string" && sameText(s, expected);
  });
}

// ---- Texto del mail ----
function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
}
function tidy(s: string): string {
  return s.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
// "Juan Pérez <juan@mail.com>" → { name, email }
function parseAddress(v: unknown): { name: string | null; email: string } {
  const s = String(Array.isArray(v) ? v[0] || "" : v || "").trim();
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(s);
  if (m) return { name: m[1].trim() || null, email: m[2].trim().toLowerCase() };
  return { name: null, email: s.toLowerCase() };
}

// ---- Notificaciones (mismo envío que la función "admin") ----
type Sub = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };
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
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error("OAuth FCM: " + JSON.stringify(j));
  return j.access_token;
}
async function apnsJwt(): Promise<string | null> {
  const p8 = Deno.env.get("APNS_KEY_P8"), kid = Deno.env.get("APNS_KEY_ID"), team = Deno.env.get("APPLE_TEAM_ID");
  if (!p8 || !kid || !team) return null;
  const key = await importPKCS8(p8, "ES256");
  return await new SignJWT({}).setProtectedHeader({ alg: "ES256", kid }).setIssuer(team).setIssuedAt().sign(key);
}
// Devuelve los ids de los dispositivos que ya no existen, para borrarlos.
async function send(subs: Sub[], title: string, body: string, tag: string, url: string): Promise<string[]> {
  const gone: string[] = [];
  const web = subs.filter((s) => s.endpoint.startsWith("https://"));
  const fcm = subs.filter((s) => s.endpoint.startsWith("fcm:"));
  const apns = subs.filter((s) => s.endpoint.startsWith("apns:"));

  const pub = Deno.env.get("VAPID_PUBLIC_KEY"), priv = Deno.env.get("VAPID_PRIVATE_KEY");
  if (web.length && pub && priv) {
    webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "mailto:soporte@gize.ar", pub, priv);
    const payload = JSON.stringify({ title, body, tag, url });
    await Promise.all(web.map(async (s) => {
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24, urgency: "high" }); }
      catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) gone.push(s.id); else console.error("push", code, (e as Error).message);
      }
    }));
  }

  const sa = fcm.length ? serviceAccount() : null;
  if (sa) {
    let access = "";
    try { access = await fcmAccessToken(sa); } catch (e) { console.error((e as Error).message); }
    if (access) await Promise.all(fcm.map(async (s) => {
      const r = await fetch("https://fcm.googleapis.com/v1/projects/" + sa.project_id + "/messages:send", {
        method: "POST",
        headers: { Authorization: "Bearer " + access, "Content-Type": "application/json" },
        body: JSON.stringify({ message: {
          token: s.endpoint.slice(4), notification: { title, body },
          android: { priority: "HIGH", ttl: "86400s", notification: { sound: "default", color: "#2FA0FF", tag } },
        } }),
      });
      if (r.ok) return;
      const t = await r.text();
      if (r.status === 404 || t.includes("UNREGISTERED")) gone.push(s.id); else console.error("fcm", r.status, t);
    }));
  }

  if (apns.length) {
    let jwt: string | null = null;
    try { jwt = await apnsJwt(); } catch (e) { console.error("apns jwt", (e as Error).message); }
    if (jwt) await Promise.all(apns.map(async (s) => {
      const r = await fetch("https://api.push.apple.com/3/device/" + s.endpoint.slice(5), {
        method: "POST",
        headers: {
          authorization: "bearer " + jwt, "apns-topic": "ar.com.gize.app", "apns-push-type": "alert",
          "apns-priority": "10", "apns-expiration": String(Math.floor(Date.now() / 1000) + 86400),
          "content-type": "application/json",
        },
        body: JSON.stringify({ aps: { alert: { title, body }, sound: "default", "thread-id": tag } }),
      });
      if (r.ok) return;
      const t = await r.text();
      if (r.status === 410 || /BadDeviceToken|Unregistered|DeviceTokenNotForTopic/.test(t)) gone.push(s.id); else console.error("apns", r.status, t);
    }));
  }
  return gone;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  const secret = Deno.env.get("RESEND_WEBHOOK_SECRET");
  if (!secret) return json({ error: "Falta RESEND_WEBHOOK_SECRET" }, 500);

  const raw = await req.text();
  if (raw.length > 1_000_000) return json({ error: "Demasiado grande" }, 413);
  if (!(await signatureOk(req, raw, secret))) return json({ error: "Firma inválida" }, 401);

  let evt: { type?: string; data?: Record<string, unknown> };
  try { evt = JSON.parse(raw); } catch { return json({ error: "Pedido inválido" }, 400); }
  if (evt.type !== "email.received" || !evt.data) return json({ ignored: true });
  const d = evt.data;
  const resendId = String(d.email_id || d.id || "").slice(0, 200);
  if (!resendId) return json({ error: "Falta el id del mail" }, 400);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: prev } = await db.from("contact_messages").select("id, body_missing").eq("resend_id", resendId).maybeSingle();
  if (prev && !prev.body_missing) return json({ ok: true, duplicado: true }); // Resend reintenta: ya estaba

  // El aviso de Resend no trae el texto: se baja aparte (hace falta la clave con acceso completo).
  const key = Deno.env.get("RESEND_FULL_KEY") || Deno.env.get("RESEND_API_KEY") || "";
  let full: Record<string, any> | null = null;
  if (key) {
    try {
      const r = await fetch("https://api.resend.com/emails/receiving/" + encodeURIComponent(resendId), { headers: { Authorization: "Bearer " + key } });
      if (r.ok) full = await r.json(); else console.error("resend", r.status, (await r.text()).slice(0, 300));
    } catch (e) { console.error("resend", (e as Error).message); }
  }

  const headers = (full && full.headers) || {};
  const from = parseAddress((headers && (headers.from || headers.From)) || (full && full.from) || d.from);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from.email)) return json({ ignored: true, motivo: "remitente inválido" });
  const toList = ((full && full.to) || d.to || []) as unknown[];
  const to = toList.map((x) => parseAddress(x).email).find((x) => x.endsWith("@gize.ar")) || (toList.length ? parseAddress(toList[0]).email : null);
  const subject = String((full && full.subject) ?? d.subject ?? "").replace(/\s+/g, " ").trim().slice(0, 300) || null;
  const text = full ? tidy(String(full.text || "") || htmlToText(String(full.html || ""))) : "";
  const body = text.slice(0, 20000);
  const missing = !full;
  const atts = Array.isArray((full && full.attachments) || d.attachments) ? ((full && full.attachments) || d.attachments).length : 0;

  if (prev){
    // Ya estaba guardado sin el texto (falló la primera vez): se completa.
    if (!missing) await db.from("contact_messages").update({ body, body_missing: false, subject, from_name: from.name }).eq("id", prev.id);
    return missing ? json({ error: "No se pudo leer el mail" }, 502) : json({ ok: true, completado: true });
  }

  const row = {
    resend_id: resendId, message_id: String((full && full.message_id) || d.message_id || "").slice(0, 500) || null,
    from_email: from.email.slice(0, 320), from_name: from.name ? from.name.slice(0, 200) : null, to_email: to ? to.slice(0, 320) : null,
    subject, body, body_missing: missing, attachments: atts,
  };
  const { data: ins, error } = await db.from("contact_messages").upsert(row, { onConflict: "resend_id", ignoreDuplicates: true }).select("id");
  if (error) { console.error("insert", error.message); return json({ error: "No se pudo guardar" }, 500); }

  // Aviso a los administradores (solo la primera vez que llega el mail).
  if (ins && ins.length) {
    const { data: admins } = await db.from("app_admins").select("user_id");
    const ids = (admins || []).map((a) => a.user_id);
    if (ids.length) {
      const { data: subs } = await db.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", ids);
      if (subs && subs.length) {
        const who = from.name || from.email;
        const gone = await send(subs as Sub[], "Nuevo mensaje de contacto", (who + ": " + (subject || "(sin asunto)")).slice(0, 180), "gize-contacto", "./admin/#contacto");
        if (gone.length) await db.from("push_subscriptions").delete().in("id", gone);
      }
    }
  }
  // Sin el texto se contesta con error para que Resend lo vuelva a mandar más tarde.
  return missing ? json({ error: "No se pudo leer el mail" }, 502) : json({ ok: true });
});
