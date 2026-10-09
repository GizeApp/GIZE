// Supabase Edge Function "avisos-coach": manda al coach los avisos que anotó la base en
// public.coach_alerts (ver supabase/avisos-coach.sql y descarga.sql): check-in semanal nuevo,
// alumnos que llevan 4 días o más sin entrenar y semanas de descarga. La llama pg_cron cada minuto, solo si hay alguno.
// Va sin "Verify JWT" (la llama la base, sin sesión). Llamarla de más no hace nada: toma
// solo los avisos sin mandar y cada uno sale una vez (se marca al tomarlo). Cada coach va
// por su lado, en paralelo y con tiempo máximo: si a uno no se le puede mandar (se pasa del
// tiempo, o un aviso no le llegó a ningún dispositivo por una falla pasajera: ver reparto.ts),
// esos avisos se liberan para el próximo minuto y los de los demás salen igual.
// Usa los mismos secrets que notificar-cliente (VAPID, FCM_SERVICE_ACCOUNT y los de Apple).
//
// Guardia opcional contra llamadas de afuera (la función es pública): si está puesto el secret
//   CRON_SECRET  (Supabase → Edge Functions → Secrets)
// se exige el header "x-cron-secret" con ese valor; el cron ya lo manda (ver supabase/avisos-coach.sql,
// que lo saca de Vault). Mientras CRON_SECRET no esté, no se bloquea nada: así deployar la
// función no corta el cron ya agendado. Para activarlo: 1) crear el secret de Vault 'cron_secret'
// y re-correr supabase/avisos-coach.sql, 2) recién después poner CRON_SECRET acá con el mismo valor.

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { importPKCS8, SignJWT } from "npm:jose@5";
import { tokenCache } from "../_shared/apns.ts";
import { type Envio, mandar, type Msg, pasajero, reciente } from "./reparto.ts";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

// Comparación en tiempo constante (no revela el largo ni en qué carácter difiere).
function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
// true si se puede seguir: sin CRON_SECRET no se bloquea; con él, exige el header correcto.
function cronOk(req: Request): boolean {
  const want = Deno.env.get("CRON_SECRET");
  if (!want) return true;
  return sameSecret(req.headers.get("x-cron-secret") || "", want);
}

type Sub = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };
type ServiceAccount = { project_id: string; client_email: string; private_key: string };

// Tiempo máximo de cada envío: un dispositivo que no contesta (por ejemplo, una dirección
// guardada a propósito que deja la conexión colgada) no traba los avisos de los demás.
const TOPE_MS = 10_000;
// web-push corta la conexión con su opción timeout; por las dudas, también se deja de esperar.
function conTope<T>(p: Promise<T>, ms = TOPE_MS): Promise<T> {
  let t = 0;
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
// El JWT de Apple y el token de Firebase se sacan una vez y se reusan (ver _shared/apns.ts):
// salen todos los coaches y todos los avisos a la vez, y si cada envío firmaba el suyo eran
// decenas de firmas en el mismo segundo (Apple contesta 429 TooManyProviderTokenUpdates).
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

// Manda una notificación a todos los dispositivos de la lista (web, Android y iPhone), los
// tres en paralelo. Devuelve a cuántos llegó, los ids de los que ya no existen (para
// borrarlos) y si alguno falló por algo pasajero (ver reparto.ts).
async function send(subs: Sub[], title: string, body: string, tag: string): Promise<Envio> {
  const gone: string[] = [];
  let llegaron = 0, falla = false;
  const web = subs.filter((s) => s.endpoint.startsWith("https://"));
  const fcm = subs.filter((s) => s.endpoint.startsWith("fcm:"));
  const apns = subs.filter((s) => s.endpoint.startsWith("apns:"));

  const toWeb = async () => {
    const pub = Deno.env.get("VAPID_PUBLIC_KEY"), priv = Deno.env.get("VAPID_PRIVATE_KEY");
    if (!web.length || !pub || !priv) return;
    webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "mailto:soporte@gize.ar", pub, priv);
    const payload = JSON.stringify({ title, body, tag, url: "./app/" });
    const opts = { TTL: 60 * 60 * 24, urgency: "normal", timeout: TOPE_MS };
    await Promise.all(web.map(async (s) => {
      const sub = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
      // Claves mal armadas (la base solo mira los caracteres): web-push falla antes de mandar y
      // sin statusCode, como cuando no hay respuesta. No es pasajero: reintentar no lo arregla.
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

// "Ana", "Ana y Beto", "Ana, Beto y Caro", "Ana, Beto y 3 más".
function names(list: string[]): string {
  if (list.length <= 1) return list[0] || "";
  if (list.length <= 3) return list.slice(0, -1).join(", ") + " y " + list[list.length - 1];
  return list.slice(0, 2).join(", ") + " y " + (list.length - 2) + " más";
}

Deno.serve(async (req) => {
  if (!cronOk(req)) return json({ error: "No autorizado" }, 401);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // Tomar y marcar de una los pendientes: si dos llamadas se pisan, cada aviso sale una vez.
  // Los de un coach al que no se le pudo mandar se liberan al final (ver más abajo).
  const { data: alerts, error } = await db.from("coach_alerts").update({ sent_at: new Date().toISOString() })
    .is("sent_at", null).select("id, coach_id, client_id, kind, key, days, created_at");
  if (error) return json({ error: error.message }, 500);
  if (!alerts || !alerts.length) return json({ sent: 0 });

  const coachIds = [...new Set(alerts.map((a) => a.coach_id))];
  const clientIds = [...new Set(alerts.map((a) => a.client_id))];
  const [{ data: subs }, { data: people }] = await Promise.all([
    db.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", coachIds),
    db.from("profiles").select("id, full_name, coach_id").in("id", clientIds),
  ]);
  // Semanas de descarga: ¿ya tiene armada la rutina de esa semana, para este ciclo del bloque?
  // (la clave es "bloque:semana:inicio"; cada rutina guarda el inicio con el que se armó)
  type Blk = { id: string; start_date: string; deload_routines: Record<string, { start?: string } | null> | null };
  const dlKeys = alerts.filter((a) => a.kind === "descarga" || a.kind === "descarga_prox").map((a) => String(a.key));
  const blockIds = [...new Set(dlKeys.map((k) => k.split(":")[0]).filter((id) => /^[0-9a-f-]{36}$/i.test(id)))];
  const { data: blocks } = blockIds.length
    ? await db.from("blocks").select("id, start_date, deload_routines").in("id", blockIds)
    : { data: [] as Blk[] };
  const planned = (key: string) => {
    const [bid, wk] = key.split(":");
    const b = ((blocks || []) as Blk[]).find((x) => x.id === bid);
    const r = b && b.deload_routines && typeof b.deload_routines === "object" ? b.deload_routines[wk] : null;
    return !!(r && typeof r === "object" && (r.start || b!.start_date) === b!.start_date);
  };
  const nameOf = (id: string) => ((people || []).find((p) => p.id === id)?.full_name || "").trim().split(/\s+/)[0] || "Un alumno";
  // Varios alumnos adentro de una frase: "Ana, Beto y un alumno" (los que no tienen nombre
  // cargado van juntos: "2 alumnos más"). Cuántos son, para el singular o el plural.
  const who = (ids: string[]) => {
    const named = ids.map(nameOf).filter((n) => n !== "Un alumno"), u = ids.length - named.length;
    const list = named.concat(u === 1 ? [named.length ? "un alumno más" : "un alumno"] : u > 1 ? [u + " alumnos" + (named.length ? " más" : "")] : []);
    return { text: names(list), many: ids.length > 1 };
  };
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  // El alumno se pudo haber desvinculado entre que se anotó el aviso y ahora.
  const stillMine = (a: { coach_id: string; client_id: string }) => (people || []).some((p) => p.id === a.client_id && p.coach_id === a.coach_id);

  const gone: string[] = [];
  // Los avisos de un coach: cuántas notificaciones llegaron y qué avisos hay que liberar.
  // Cada notificación lleva los avisos que junta, para liberar solo los de la que no llegó.
  const porCoach = async (coachId: string): Promise<{ sent: number; retry: number[] }> => {
    const mine = (subs || []).filter((s) => s.user_id === coachId) as Sub[];
    if (!mine.length) return { sent: 0, retry: [] }; // el coach no activó los avisos en ningún dispositivo
    const { data: active } = await db.rpc("coach_active", { cid: coachId });
    if (active === false) return { sent: 0, retry: [] };
    const list = alerts.filter((a) => a.coach_id === coachId && stillMine(a));
    const msgs: Msg[] = [];

    const ci = list.filter((a) => a.kind === "checkin"), checkins = ci.map((a) => nameOf(a.client_id));
    if (checkins.length) {
      const body = checkins.length === 1 ? checkins[0] + " mandó su check-in semanal." : names(checkins) + " mandaron su check-in semanal.";
      msgs.push({ title: "Check-in semanal", body, tag: "gize-checkin", alerts: ci });
    }

    const idle = list.filter((a) => a.kind === "inactivo");
    if (idle.length) {
      const body = idle.length === 1
        ? nameOf(idle[0].client_id) + " lleva " + (idle[0].days || 4) + " días sin entrenar."
        : names(idle.map((a) => nameOf(a.client_id))) + " llevan 4 días o más sin entrenar.";
      msgs.push({ title: "Alumnos sin entrenar", body, tag: "gize-inactivo", alerts: idle });
    }

    // Esta semana les toca descarga: primero los que todavía no tienen la rutina armada.
    const dl = list.filter((a) => a.kind === "descarga");
    if (dl.length) {
      const todo = who(dl.filter((a) => !planned(String(a.key))).map((a) => a.client_id));
      const ready = who(dl.filter((a) => planned(String(a.key))).map((a) => a.client_id));
      const parts: string[] = [];
      if (todo.text) parts.push(!todo.many
        ? "A " + todo.text + " le toca semana de descarga y todavía no tiene rutina de descarga. Armala en su ficha → Bloque / mesociclo."
        : "A " + todo.text + " les toca semana de descarga y todavía no tienen rutina de descarga. Armalas en sus fichas → Bloque / mesociclo.");
      if (ready.text) parts.push(!ready.many
        ? cap(ready.text) + " está en semana de descarga, con su rutina de descarga lista."
        : cap(ready.text) + " están en semana de descarga, con sus rutinas de descarga listas.");
      msgs.push({ title: "Semana de descarga", body: parts.join(" "), tag: "gize-descarga", alerts: dl });
    }

    // La semana que viene es de descarga y todavía no hay rutina (se vuelve a mirar al mandar).
    const prox = list.filter((a) => a.kind === "descarga_prox" && !planned(String(a.key))), soon = who(prox.map((a) => a.client_id));
    if (soon.text) {
      const body = !soon.many
        ? "A " + soon.text + " le toca semana de descarga la semana que viene. Armale la rutina de descarga en su ficha → Bloque / mesociclo."
        : "A " + soon.text + " les toca semana de descarga la semana que viene. Armales las rutinas de descarga en sus fichas → Bloque / mesociclo.";
      msgs.push({ title: "Descarga la semana que viene", body, tag: "gize-descarga-prox", alerts: prox });
    }

    const r = await mandar(msgs, (title, body, tag) => send(mine, title, body, tag));
    gone.push(...r.gone);
    return { sent: r.sent, retry: r.retry };
  };

  // Todos los coaches a la vez, cada uno con su tiempo máximo: antes iban de a uno y, si uno se
  // trababa, los que venían después se quedaban sin sus avisos (ya marcados como mandados).
  const res = await Promise.allSettled(coachIds.map((c) => conTope(porCoach(c), 30_000)));
  let sent = 0;
  const retry: number[] = [];
  res.forEach((r, i) => {
    // Se liberan para el próximo minuto los que no llegaron por una falla pasajera y, si con
    // un coach se pasó del tiempo, todos los suyos (solo los de la última hora, ver reparto.ts).
    if (r.status === "fulfilled") { sent += r.value.sent; retry.push(...r.value.retry); return; }
    console.error("avisos-coach", coachIds[i], (r.reason as Error)?.message);
    alerts.forEach((a) => { if (a.coach_id === coachIds[i] && reciente(a)) retry.push(a.id); });
  });
  if (retry.length) {
    const { error: re } = await db.from("coach_alerts").update({ sent_at: null }).in("id", retry);
    if (re) console.error("avisos-coach: no se pudieron liberar", re.message);
  }
  if (gone.length) await db.from("push_subscriptions").delete().in("id", gone);
  return json({ sent });
});
