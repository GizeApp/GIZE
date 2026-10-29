// Supabase Edge Function "resumen-semanal": el resumen de los lunes para los coaches («Tu semana en
// GIZE»), por mail y aviso (ver supabase/resumen-semanal.sql). Va sin "Verify JWT". Atiende tres pedidos:
//   1) La tanda del cron: POST {} con el header x-cron-secret. pg_cron la llama de lunes a miércoles,
//      de 9 a 12:55, solo si hay coaches pendientes. Toma hasta 8 (tomar_resumenes_semanales) y, de a 4
//      a la vez, a cada uno le manda el mail (Resend) y después el aviso a sus dispositivos. Si Resend
//      falla por algo pasajero (sin respuesta, 429 o 5xx), lo suelta (soltar_resumen_semanal) sin
//      mandar el aviso: en el reintento sale todo junto. Si falla por otra cosa, sigue con el aviso.
//      Al final lo anota (resumen_semanal_listo). Llamarla de más no hace nada: cada coach se toma una
//      vez por semana.
//   2) La baja sin sesión: POST ?baja=<token> (el «Cancelar suscripción» de un toque de Gmail y Apple
//      Mail, con los encabezados List-Unsubscribe) o POST {baja | alta: <token>} desde
//      gize.ar/resumen/. Responde siempre 200, sin decir si el token existía. Un GET ?baja (los
//      antivirus del correo abren los links) no da de baja a nadie: lleva a la página, que tiene el botón.
//   3) La muestra del panel: {action: 'muestra', enviar?: true} con la sesión de un administrador.
//      Devuelve el mail armado con datos INVENTADOS (mail.ts, MUESTRA) y, con enviar, se lo manda solo
//      a su propio mail.
//
// Secrets: RESEND_API_KEY (sin él no toma a nadie y quedan para la tanda siguiente), CRON_SECRET
// (opcional: si está, se exige el header x-cron-secret con ese valor; el cron ya lo manda) y los de
// los avisos (VAPID, FCM_SERVICE_ACCOUNT y los de Apple, ver _shared/push.ts). No usa IA.
// No escribe mails ni nombres en los registros.

import { createClient } from "npm:@supabase/supabase-js@2";
import { avisoResumen, type Datos, mailResumen, MUESTRA, semanaPasada } from "./mail.ts";
import { mandarAviso, type Sub } from "../_shared/push.ts";
import { pasajero } from "../avisos-coach/reparto.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const FUNCION = "https://wegptuzhsrwppbknqstf.supabase.co/functions/v1/resumen-semanal";
const PAGINA = "https://gize.ar/resumen/";
const DE = "GIZE <soporte@gize.ar>";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Tiempo máximo de cada pedido a Resend, y cuántos coaches van a la vez (Resend acepta 10 pedidos
// por segundo).
const TOPE_MS = 10_000;
const A_LA_VEZ = 4;

function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function cronOk(req: Request): boolean {
  const want = Deno.env.get("CRON_SECRET");
  if (!want) return true;
  return sameSecret(req.headers.get("x-cron-secret") || "", want);
}

const servicio = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

// Manda un mail por Resend. Devuelve el status (0 si no hubo respuesta).
async function resend(key: string, m: Record<string, unknown>): Promise<number> {
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify(m),
      signal: AbortSignal.timeout(TOPE_MS),
    });
    return r.status;
  } catch {
    return 0;
  }
}

// 2) Prender o apagar con el token del link. Sin sesión y sin el secreto del cron.
async function baja(token: string, on: boolean): Promise<Response> {
  if (!UUID.test(token)) return json({ ok: true });
  const { error } = await servicio().rpc("resumen_semanal_baja", { p_token: token, p_on: on });
  if (error) { console.error("resumen_semanal_baja", error.message); return json({ error: "No se pudo. Probá de nuevo en un rato." }, 500); }
  return json({ ok: true });
}

// 3) La muestra del panel, con datos inventados.
async function muestra(req: Request, enviar: boolean): Promise<Response> {
  const asUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
  });
  const { data: u } = await asUser.auth.getUser();
  if (!u || !u.user) return json({ error: "Sesión vencida. Volvé a iniciar sesión." }, 401);
  const { data: esAdmin } = await asUser.rpc("is_app_admin");
  if (esAdmin !== true) return json({ error: "Solo administradores." }, 403);
  const m = mailResumen({ nombre: "Coach", r: { ...MUESTRA, semana: semanaPasada() }, baja: PAGINA });
  if (!enviar) return json({ ok: true, ...m });
  const key = Deno.env.get("RESEND_API_KEY");
  const to = u.user.email;
  if (!key) return json({ error: "Falta RESEND_API_KEY en los Secrets de la función." }, 500);
  if (!to) return json({ error: "Tu cuenta no tiene mail." }, 400);
  const st = await resend(key, { from: DE, to: [to], subject: "[Muestra] " + m.subject, html: m.html, text: m.text });
  if (st < 200 || st >= 300) { console.error("muestra: Resend", st); return json({ error: "No se pudo mandar (Resend " + st + ")." }, 502); }
  return json({ ok: true, enviado: true, ...m });
}

type Toca = { coach_id: string; semana: string; nombre: string | null; token: string; datos: Datos };

// 1) La tanda del cron.
async function tanda(req: Request): Promise<Response> {
  if (!cronOk(req)) return json({ error: "no autorizado" }, 401);
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return json({ ok: false, motivo: "falta RESEND_API_KEY" });
  const db = servicio();
  const { data, error } = await db.rpc("tomar_resumenes_semanales", { p_max: 8 });
  if (error) { console.error("tomar_resumenes_semanales", error.message); return json({ error: "base" }, 500); }

  let enviados = 0, avisos = 0, fallidos = 0;
  const gone: string[] = [];
  const uno = async (f: Toca) => {
    const ids = { p_coach: f.coach_id, p_semana: f.semana };
    let mail = false;
    try {
      const { data: u, error: ue } = await db.auth.admin.getUserById(f.coach_id);
      // Si no se pudo leer su cuenta (una falla de Auth), se reintenta en la tanda siguiente: si no,
      // ese lunes le llegaba solo el aviso y quedaba anotado como enviado, sin el mail.
      if (ue) throw new Error("no se pudo leer la cuenta (" + (ue.status || "sin respuesta") + ")");
      const to = u && u.user && u.user.email;
      if (to) {
        const m = mailResumen({ nombre: f.nombre, r: f.datos, baja: PAGINA + "?t=" + f.token });
        const st = await resend(key, {
          from: DE, to: [to], subject: m.subject, html: m.html, text: m.text,
          // «Cancelar suscripción» de un toque en Gmail y Apple Mail (lo atiende esta función, sin sesión).
          headers: { "List-Unsubscribe": "<" + FUNCION + "?baja=" + f.token + ">", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
        });
        if (st >= 200 && st < 300) mail = true;
        else if (pasajero(st)) {
          // Se reintenta todo junto en la tanda siguiente (sin el aviso, así no llega dos veces).
          console.error("resumen: Resend", st || "sin respuesta");
          fallidos++;
          await db.rpc("soltar_resumen_semanal", ids);
          return;
        } else console.error("resumen: Resend", st);
      }
    } catch (e) {
      console.error("resumen", (e as Error).message);
      fallidos++;
      await db.rpc("soltar_resumen_semanal", ids);
      return;
    }
    // El aviso, si activó las notificaciones en algún dispositivo.
    // Si algo falla acá, el mail ya salió: se anota igual (no se reintenta, así no llega dos veces).
    let aviso = false;
    try {
      const { data: subs } = await db.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").eq("user_id", f.coach_id);
      if (subs && subs.length) {
        const a = avisoResumen(f.datos);
        const r = await mandarAviso(subs as Sub[], a.title, a.body, "gize-resumen", "./app/");
        gone.push(...r.gone);
        aviso = r.llegaron > 0;
      }
    } catch (e) {
      console.error("resumen: aviso", (e as Error).message);
    }
    if (mail) enviados++;
    if (aviso) avisos++;
    if (!mail && !aviso) fallidos++;
    const { error: le } = await db.rpc("resumen_semanal_listo", { ...ids, p_mail: mail, p_aviso: aviso });
    if (le) console.error("resumen_semanal_listo", le.message);
  };
  const filas = (data || []) as Toca[];
  for (let i = 0; i < filas.length; i += A_LA_VEZ) await Promise.all(filas.slice(i, i + A_LA_VEZ).map(uno));
  if (gone.length) await db.from("push_subscriptions").delete().in("id", gone);
  return json({ ok: true, enviados, avisos, fallidos });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  const tok = url.searchParams.get("baja");
  if (req.method === "GET") {
    // Un GET no da de baja (los antivirus del correo abren los links): lleva a la página con el botón.
    const a = tok && UUID.test(tok) ? PAGINA + "?t=" + tok.toLowerCase() : PAGINA;
    return new Response(null, { status: 302, headers: { Location: a } });
  }
  if (req.method !== "POST") return json({ error: "método" }, 405);
  if (tok !== null) return baja(tok, false);
  let body: { baja?: unknown; alta?: unknown; action?: unknown; enviar?: unknown } = {};
  try { body = await req.json(); } catch { body = {}; }
  if (!body || typeof body !== "object") body = {};
  if (body.baja !== undefined) return baja(String(body.baja), false);
  if (body.alta !== undefined) return baja(String(body.alta), true);
  if (body.action === "muestra") return muestra(req, body.enviar === true);
  return tanda(req);
});
