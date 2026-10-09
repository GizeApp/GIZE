// Supabase Edge Function "admin": lo del panel de administrador (gize.ar/admin) que necesita
// secretos de afuera. Solo responde a administradores (public.is_app_admin, ver
// supabase/productos-revision.sql) y cada acción queda en public.admin_audit.
//   { action: "pagos", coach_id }            → cobros de Mercado Pago de la suscripción del coach
//   { action: "aviso", target, title, body } → notificación a todos / coaches / alumnos
//   { action: "eliminar", user_id }          → borra la cuenta (antes cancela su suscripción en MP
//                                              y borra sus fotos de Storage)
//   { action: "responder", message_id, text } → contesta un mensaje de contacto (ver
//                                              supabase/contacto.sql) desde contacto@gize.ar
// Usa los secrets de siempre: MP_ACCESS_TOKEN, VAPID, FCM_SERVICE_ACCOUNT, los de Apple y
// RESEND_API_KEY (el mismo con el que salen los avisos de pagos).
// Va sin "Verify JWT" (como las demás) y valida la sesión con auth.getUser().

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { importPKCS8, SignJWT } from "npm:jose@5";
import { deA } from "./tanda.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

type Sub = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };
type ServiceAccount = { project_id: string; client_email: string; private_key: string };

// Tiempo máximo de cada envío: un dispositivo que no contesta (por ejemplo, una dirección
// guardada a propósito que deja la conexión colgada) no traba el aviso a los demás.
const TOPE_MS = 10_000;
// web-push corta la conexión con su opción timeout; por las dudas, también se deja de esperar.
function conTope<T>(p: Promise<T>, ms = TOPE_MS): Promise<T> {
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
async function apnsJwt(): Promise<string | null> {
  const p8 = Deno.env.get("APNS_KEY_P8"), kid = Deno.env.get("APNS_KEY_ID"), team = Deno.env.get("APPLE_TEAM_ID");
  if (!p8 || !kid || !team) return null;
  const key = await importPKCS8(p8, "ES256");
  return await new SignJWT({}).setProtectedHeader({ alg: "ES256", kid }).setIssuer(team).setIssuedAt().sign(key);
}

// Manda una notificación a todos los dispositivos de la lista (web, Android y iPhone).
// Devuelve los ids de los dispositivos que ya no existen, para borrarlos.
// Los tres van en paralelo: antes Android e iPhone esperaban a que terminaran todos los web.
// En cada uno, de a 100 a la vez (ver tanda.ts): el tiempo máximo corre desde que arranca cada
// envío, no desde el principio para todos.
async function send(subs: Sub[], title: string, body: string, tag: string): Promise<string[]> {
  const gone: string[] = [];
  const web = subs.filter((s) => s.endpoint.startsWith("https://"));
  const fcm = subs.filter((s) => s.endpoint.startsWith("fcm:"));
  const apns = subs.filter((s) => s.endpoint.startsWith("apns:"));

  const toWeb = async () => {
    const pub = Deno.env.get("VAPID_PUBLIC_KEY"), priv = Deno.env.get("VAPID_PRIVATE_KEY");
    if (!web.length || !pub || !priv) return;
    webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "mailto:soporte@gize.ar", pub, priv);
    const payload = JSON.stringify({ title, body, tag, url: "./app/" });
    await deA(web, async (s) => {
      try { await conTope(webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24, urgency: "normal", timeout: TOPE_MS })); }
      catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) gone.push(s.id); else console.error("push", code, (e as Error).message);
      }
    });
  };

  const toFcm = async () => {
    const sa = fcm.length ? serviceAccount() : null;
    if (!sa) return;
    let access = "";
    try { access = await fcmAccessToken(sa); } catch (e) { console.error((e as Error).message); }
    if (access) await deA(fcm, async (s) => {
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
        if (r.ok) return;
        const t = await r.text();
        if (r.status === 404 || t.includes("UNREGISTERED")) gone.push(s.id); else console.error("fcm", r.status, t);
      } catch (e) { console.error("fcm", (e as Error).message); }
    });
  };

  const toApns = async () => {
    if (!apns.length) return;
    let jwt: string | null = null;
    try { jwt = await apnsJwt(); } catch (e) { console.error("apns jwt", (e as Error).message); }
    if (jwt) await deA(apns, async (s) => {
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
        if (r.ok) return;
        const t = await r.text();
        if (r.status === 410 || /BadDeviceToken|Unregistered|DeviceTokenNotForTopic/.test(t)) gone.push(s.id); else console.error("apns", r.status, t);
      } catch (e) { console.error("apns", (e as Error).message); }
    });
  };

  await Promise.allSettled([toWeb(), toFcm(), toApns()]);
  return gone;
}

const MP = "https://api.mercadopago.com";
async function mp(path: string, init: RequestInit = {}) {
  const r = await fetch(MP + path, { ...init, headers: { Authorization: "Bearer " + Deno.env.get("MP_ACCESS_TOKEN"), "Content-Type": "application/json", ...(init.headers || {}) } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("Mercado Pago " + r.status + ": " + (body.message || JSON.stringify(body)));
  return body;
}

// Buckets donde cada usuario guarda sus archivos en su carpeta ({uid}/): foto de perfil y
// fotos de tablas nutricionales. Borrar auth.users no los toca (Supabase no deja borrar
// storage.objects por SQL), así que al eliminar una cuenta hay que borrarlos a mano.
// "checkins" (las fotos de progreso de antes) ya no va: se vació entero (ver
// supabase/borrar-fotos-progreso.sql).
const USER_BUCKETS = ["avatars", "productos"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Borra todos los archivos de la carpeta del usuario en cada bucket y devuelve cuántos.
// Primero lista todo (list() devuelve de a 1000 como máximo) y después borra: borrar
// mientras se pagina corre el offset y se saltearía archivos. Lanza si algo falla.
async function removeUserFiles(db: ReturnType<typeof createClient>, uid: string): Promise<number> {
  let total = 0;
  for (const bucket of USER_BUCKETS) {
    const st = db.storage.from(bucket);
    const paths: string[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await st.list(uid, { limit: 1000, offset });
      if (error) throw new Error(bucket + ": " + error.message);
      // id null = subcarpeta (la app no las crea; se ignoran).
      (data || []).forEach((it) => { if (it && it.id) paths.push(uid + "/" + it.name); });
      if (!data || data.length < 1000) break;
    }
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await st.remove(paths.slice(i, i + 100));
      if (error) throw new Error(bucket + ": " + error.message);
    }
    total += paths.length;
  }
  return total;
}

// Mensajes de voz del chat y audios de los ejercicios (bucket chat-audio): como coach, toda
// su carpeta ({uid}/…); como alumno, su conversación con cada coach que tuvo
// ({coach}/{uid}/…). Misma lógica que supabase/functions/borrar-audios (la que usa la app
// cuando la persona elimina su cuenta). Lanza si algo falla.
// deno-lint-ignore no-explicit-any
async function removeChatAudios(db: any, uid: string): Promise<number> {
  const st = db.storage.from("chat-audio");
  async function list(prefix: string, folders: boolean): Promise<string[]> {
    const out: string[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await st.list(prefix, { limit: 1000, offset });
      if (error) throw new Error("chat-audio: " + error.message);
      (data || []).forEach((it: { id: string | null; name: string }) => { if (it && it.name && (folders ? !it.id : !!it.id)) out.push(prefix + "/" + it.name); });
      if (!data || data.length < 1000) break;
    }
    return out;
  }
  const paths: string[] = [];
  for (const dir of await list(uid, true)) paths.push(...await list(dir, false));
  const coaches = new Set<string>();
  const { data: prof } = await db.from("profiles").select("coach_id").eq("id", uid).maybeSingle();
  if (prof && prof.coach_id) coaches.add(prof.coach_id);
  const { data: msgs } = await db.from("coach_messages").select("coach_id").eq("client_id", uid).not("audio_path", "is", null);
  (msgs || []).forEach((m: { coach_id: string }) => { if (m.coach_id) coaches.add(m.coach_id); });
  for (const c of coaches) if (UUID.test(c) && c !== uid) paths.push(...await list(c + "/" + uid, false));
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await st.remove(paths.slice(i, i + 100));
    if (error) throw new Error("chat-audio: " + error.message);
  }
  return paths.length;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const asUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
  });
  const { data: u } = await asUser.auth.getUser();
  if (!u || !u.user) return json({ error: "Sesión vencida. Volvé a iniciar sesión." }, 401);
  const { data: isAdmin } = await asUser.rpc("is_app_admin");
  if (isAdmin !== true) return json({ error: "Solo administradores." }, 403);
  const adminId = u.user.id;

  let input: { action?: string; coach_id?: string; user_id?: string; target?: string; title?: string; body?: string; message_id?: number; text?: string };
  try { input = await req.json(); } catch { return json({ error: "Pedido inválido" }, 400); }
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const log = (action: string, target: string | null, detail: unknown) =>
    db.from("admin_audit").insert({ admin_id: adminId, action, target, detail });

  if (input.action === "pagos") {
    if (!input.coach_id) return json({ error: "Falta el coach" }, 400);
    const { data: bill } = await db.from("coach_billing").select("*").eq("coach_id", input.coach_id).maybeSingle();
    if (!bill || !bill.mp_preapproval_id) return json({ payments: [], subscription: null });
    if (!Deno.env.get("MP_ACCESS_TOKEN")) return json({ error: "Falta MP_ACCESS_TOKEN" }, 500);
    try {
      const pa = await mp("/preapproval/" + encodeURIComponent(bill.mp_preapproval_id));
      const res = await mp("/authorized_payments/search?preapproval_id=" + encodeURIComponent(bill.mp_preapproval_id) + "&limit=50");
      const payments = (res.results || []).map((p: Record<string, any>) => ({
        date: p.date_created || p.debit_date, amount: p.transaction_amount, currency: p.currency_id,
        status: (p.payment && p.payment.status) || p.status, detail: (p.payment && p.payment.status_detail) || p.reason || "",
      })).sort((a: { date: string }, b: { date: string }) => String(b.date).localeCompare(String(a.date)));
      return json({ payments, subscription: { status: pa.status, amount: pa.auto_recurring && pa.auto_recurring.transaction_amount,
        next: pa.next_payment_date, payer: pa.payer_email || null, created: pa.date_created } });
    } catch (e) { return json({ error: (e as Error).message }, 502); }
  }

  if (input.action === "aviso") {
    const title = String(input.title || "").trim().slice(0, 60), body = String(input.body || "").trim().slice(0, 180);
    const target = ["todos", "coaches", "alumnos"].includes(String(input.target)) ? String(input.target) : "";
    if (!title || !body || !target) return json({ error: "Completá el título, el mensaje y a quién va." }, 400);
    // De a 1000 (el tope de cada lectura): antes el aviso llegaba solo a los primeros 1000.
    const ids: string[] = [];
    for (let from = 0; ; from += 1000) {
      let q = db.from("profiles").select("id").order("id").range(from, from + 999);
      if (target === "coaches") q = q.eq("role", "coach");
      if (target === "alumnos") q = q.or("role.is.null,role.neq.coach");
      const { data: page, error } = await q;
      if (error) return json({ error: error.message }, 500);
      (page || []).forEach((p) => ids.push(p.id));
      if (!page || page.length < 1000) break;
    }
    let subs: Sub[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await db.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", ids.slice(i, i + 200));
      subs = subs.concat((data || []) as Sub[]);
    }
    const gone = subs.length ? await send(subs, title, body, "gize-aviso") : [];
    if (gone.length) await db.from("push_subscriptions").delete().in("id", gone);
    const users = new Set(subs.map((s) => s.user_id)).size;
    await log("aviso", target, { title, body, dispositivos: subs.length - gone.length, usuarios: users });
    return json({ devices: subs.length - gone.length, users });
  }

  if (input.action === "eliminar") {
    const uid = String(input.user_id || "");
    if (!uid) return json({ error: "Falta el usuario" }, 400);
    // Va a Storage como nombre de carpeta: tiene que ser un uuid y nada más.
    if (!UUID.test(uid)) return json({ error: "Usuario inválido" }, 400);
    if (uid === adminId) return json({ error: "No podés eliminar tu propia cuenta desde el panel." }, 400);
    const { data: prof } = await db.from("profiles").select("full_name, role").eq("id", uid).maybeSingle();
    const { data: bill } = await db.from("coach_billing").select("mp_preapproval_id, mp_status").eq("coach_id", uid).maybeSingle();
    if (bill && bill.mp_preapproval_id && bill.mp_status === "authorized" && Deno.env.get("MP_ACCESS_TOKEN")) {
      try { await mp("/preapproval/" + encodeURIComponent(bill.mp_preapproval_id), { method: "PUT", body: JSON.stringify({ status: "cancelled" }) }); }
      catch (e) { return json({ error: "No se pudo cancelar su suscripción en Mercado Pago: " + (e as Error).message }, 502); }
    }
    // Las fotos se borran ANTES que la cuenta: si algo falla, la cuenta sigue y se puede
    // reintentar; al revés, las fotos quedarían para siempre sin dueño.
    let archivos = 0;
    try { archivos = await removeUserFiles(db, uid); archivos += await removeChatAudios(db, uid); }
    catch (e) { return json({ error: "No se pudieron borrar sus fotos o audios: " + (e as Error).message }, 500); }
    // Los productos que cargó quedan (son de todos, created_by pasa a null), pero sin la
    // foto de la tabla que acabamos de borrar.
    await db.from("products").update({ photo_path: null }).like("photo_path", uid + "/%");
    const { error } = await db.auth.admin.deleteUser(uid);
    if (error) return json({ error: error.message }, 500);
    await log("eliminar", uid, { nombre: prof && prof.full_name, rol: prof && prof.role, archivos });
    return json({ ok: true });
  }

  if (input.action === "responder") {
    const mid = Number(input.message_id), text = String(input.text || "").replace(/\r\n?/g, "\n").trim();
    if (!Number.isInteger(mid) || mid <= 0) return json({ error: "Falta el mensaje" }, 400);
    if (text.length < 2) return json({ error: "Escribí la respuesta." }, 400);
    if (text.length > 10000) return json({ error: "La respuesta es demasiado larga." }, 400);
    const key = Deno.env.get("RESEND_API_KEY");
    if (!key) return json({ error: "Falta RESEND_API_KEY" }, 500);
    const { data: m } = await db.from("contact_messages").select("id, from_email, from_name, reply_to, subject, body, message_id, created_at").eq("id", mid).maybeSingle();
    if (!m) return json({ error: "No existe ese mensaje." }, 404);
    const subj0 = String(m.subject || "").replace(/[\r\n]+/g, " ").trim();
    const subject = /^re:/i.test(subj0) ? subj0 : "Re: " + (subj0 || "Tu mensaje a GIZE");
    // Se cita el mensaje original debajo, como en cualquier respuesta de mail.
    const when = new Date(m.created_at).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const quoted = String(m.body || "").slice(0, 4000).split("\n").map((l: string) => "> " + l).join("\n");
    const full = text + "\n\n— Equipo GIZE\nhttps://gize.ar\n\nEl " + when + ", " + (m.from_name || m.from_email) + " escribió:\n" + quoted;
    const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const html = '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#111">' + esc(text).replace(/\n/g, "<br>") +
      '<br><br>— Equipo GIZE<br><a href="https://gize.ar">gize.ar</a></div>' +
      '<div style="margin-top:18px;color:#666;font-size:13px">El ' + esc(when) + ", " + esc(m.from_name || m.from_email) + ' escribió:</div>' +
      '<blockquote style="margin:6px 0 0;padding-left:10px;border-left:3px solid #ccc;color:#666;font-size:13px">' + esc(String(m.body || "").slice(0, 4000)).replace(/\n/g, "<br>") + "</blockquote>";
    const headers: Record<string, string> = {};
    if (m.message_id && /^<[^<>\s]+>$/.test(m.message_id)) { headers["In-Reply-To"] = m.message_id; headers["References"] = m.message_id; }
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      // Al Reply-To del mail si lo trae (listas, formularios); si no, a quien lo mandó.
      body: JSON.stringify({ from: "GIZE <contacto@gize.ar>", to: [m.reply_to || m.from_email], reply_to: "contacto@gize.ar", subject, text: full, html, headers }),
    });
    if (!r.ok) { const t = await r.text(); console.error("resend", r.status, t); return json({ error: "No se pudo mandar el mail (" + r.status + ")." }, 502); }
    const now = new Date().toISOString();
    await db.from("contact_messages").update({ replied_at: now, replied_by: adminId, reply: text }).eq("id", mid);
    await db.from("contact_messages").update({ read_at: now, read_by: adminId }).eq("id", mid).is("read_at", null);
    await log("contacto_respuesta", String(mid), { a: m.reply_to || m.from_email, asunto: subject });
    return json({ ok: true });
  }

  return json({ error: "Acción desconocida" }, 400);
});
