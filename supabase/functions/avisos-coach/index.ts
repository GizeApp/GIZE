// Supabase Edge Function "avisos-coach": manda al coach los avisos que anotó la base en
// public.coach_alerts (ver supabase/avisos-coach.sql y descarga.sql): check-in semanal nuevo,
// alumnos que llevan 4 días o más sin entrenar y semanas de descarga. La llama pg_cron cada minuto, solo si hay alguno.
// Va sin "Verify JWT" (la llama la base, sin sesión). Llamarla de más no hace nada: toma
// solo los avisos sin mandar y cada uno sale una vez (se marca al tomarlo).
// Usa los mismos secrets que notificar-cliente (VAPID, FCM_SERVICE_ACCOUNT y los de Apple).

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { importPKCS8, SignJWT } from "npm:jose@5";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

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

// Manda una notificación a todos los dispositivos de la lista (web, Android y iPhone).
// Devuelve los ids de los dispositivos que ya no existen, para borrarlos.
async function send(subs: Sub[], title: string, body: string, tag: string): Promise<string[]> {
  const gone: string[] = [];
  const web = subs.filter((s) => s.endpoint.startsWith("https://"));
  const fcm = subs.filter((s) => s.endpoint.startsWith("fcm:"));
  const apns = subs.filter((s) => s.endpoint.startsWith("apns:"));

  const pub = Deno.env.get("VAPID_PUBLIC_KEY"), priv = Deno.env.get("VAPID_PRIVATE_KEY");
  if (web.length && pub && priv) {
    webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "mailto:soporte@gize.ar", pub, priv);
    const payload = JSON.stringify({ title, body, tag, url: "./app/" });
    await Promise.all(web.map(async (s) => {
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24, urgency: "normal" }); }
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

// "Ana", "Ana y Beto", "Ana, Beto y Caro", "Ana, Beto y 3 más".
function names(list: string[]): string {
  if (list.length <= 1) return list[0] || "";
  if (list.length <= 3) return list.slice(0, -1).join(", ") + " y " + list[list.length - 1];
  return list.slice(0, 2).join(", ") + " y " + (list.length - 2) + " más";
}

Deno.serve(async () => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // Tomar y marcar de una los pendientes: si dos llamadas se pisan, cada aviso sale una vez.
  const { data: alerts, error } = await db.from("coach_alerts").update({ sent_at: new Date().toISOString() })
    .is("sent_at", null).select("coach_id, client_id, kind, key, days");
  if (error) return json({ error: error.message }, 500);
  if (!alerts || !alerts.length) return json({ sent: 0 });

  const coachIds = [...new Set(alerts.map((a) => a.coach_id))];
  const clientIds = [...new Set(alerts.map((a) => a.client_id))];
  const [{ data: subs }, { data: people }] = await Promise.all([
    db.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", coachIds),
    db.from("profiles").select("id, full_name, coach_id").in("id", clientIds),
  ]);
  // Semanas de descarga: ¿ya tiene armada la rutina de esa semana? (la clave es "bloque:semana")
  const dlKeys = alerts.filter((a) => a.kind === "descarga" || a.kind === "descarga_prox").map((a) => String(a.key));
  const blockIds = [...new Set(dlKeys.map((k) => k.split(":")[0]).filter((id) => /^[0-9a-f-]{36}$/i.test(id)))];
  const { data: blocks } = blockIds.length
    ? await db.from("blocks").select("id, deload_routines").in("id", blockIds)
    : { data: [] as { id: string; deload_routines: Record<string, unknown> | null }[] };
  const planned = (key: string) => {
    const [bid, wk] = key.split(":");
    const b = (blocks || []).find((x) => x.id === bid);
    return !!(b && b.deload_routines && typeof b.deload_routines === "object" && wk in b.deload_routines);
  };
  const nameOf = (id: string) => ((people || []).find((p) => p.id === id)?.full_name || "Un alumno").split(" ")[0];
  // El alumno se pudo haber desvinculado entre que se anotó el aviso y ahora.
  const stillMine = (a: { coach_id: string; client_id: string }) => (people || []).some((p) => p.id === a.client_id && p.coach_id === a.coach_id);

  let sent = 0;
  const gone: string[] = [];
  for (const coachId of coachIds) {
    const mine = (subs || []).filter((s) => s.user_id === coachId) as Sub[];
    if (!mine.length) continue; // el coach no activó los avisos en ningún dispositivo
    const { data: active } = await db.rpc("coach_active", { cid: coachId });
    if (active === false) continue;
    const list = alerts.filter((a) => a.coach_id === coachId && stillMine(a));

    const checkins = list.filter((a) => a.kind === "checkin").map((a) => nameOf(a.client_id));
    if (checkins.length) {
      const body = checkins.length === 1 ? checkins[0] + " mandó su check-in semanal." : names(checkins) + " mandaron su check-in semanal.";
      gone.push(...await send(mine, "Check-in semanal", body, "gize-checkin"));
      sent++;
    }

    const idle = list.filter((a) => a.kind === "inactivo");
    if (idle.length) {
      const body = idle.length === 1
        ? nameOf(idle[0].client_id) + " lleva " + (idle[0].days || 4) + " días sin entrenar."
        : names(idle.map((a) => nameOf(a.client_id))) + " llevan 4 días o más sin entrenar.";
      gone.push(...await send(mine, "Alumnos sin entrenar", body, "gize-inactivo"));
      sent++;
    }

    // Esta semana les toca descarga: primero los que todavía no tienen la rutina armada.
    const dl = list.filter((a) => a.kind === "descarga");
    if (dl.length) {
      const todo = dl.filter((a) => !planned(String(a.key))).map((a) => nameOf(a.client_id));
      const ready = dl.filter((a) => planned(String(a.key))).map((a) => nameOf(a.client_id));
      const parts: string[] = [];
      if (todo.length) parts.push((todo.length === 1 ? "A " + todo[0] + " le toca" : "A " + names(todo) + " les toca") +
        " semana de descarga y todavía no " + (todo.length === 1 ? "tiene" : "tienen") + " rutina de descarga. Armala en su ficha → Bloque / mesociclo.");
      if (ready.length) parts.push(names(ready) + (ready.length === 1 ? " está" : " están") + " en semana de descarga, con su rutina de descarga lista.");
      gone.push(...await send(mine, "Semana de descarga", parts.join(" "), "gize-descarga"));
      sent++;
    }

    // La semana que viene es de descarga y todavía no hay rutina (se vuelve a mirar al mandar).
    const soon = list.filter((a) => a.kind === "descarga_prox" && !planned(String(a.key))).map((a) => nameOf(a.client_id));
    if (soon.length) {
      const body = (soon.length === 1 ? "A " + soon[0] + " le toca" : "A " + names(soon) + " les toca") +
        " semana de descarga la semana que viene. Armale la rutina de descarga en su ficha → Bloque / mesociclo.";
      gone.push(...await send(mine, "Descarga la semana que viene", body, "gize-descarga-prox"));
      sent++;
    }
  }
  if (gone.length) await db.from("push_subscriptions").delete().in("id", gone);
  return json({ sent });
});
