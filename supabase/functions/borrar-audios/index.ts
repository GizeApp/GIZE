// Supabase Edge Function "borrar-audios": elimina la cuenta del usuario logueado junto con
// sus mensajes de voz del chat y las explicaciones de voz de los ejercicios (bucket privado
// chat-audio, ver supabase/chat.sql y supabase/ejercicio-audio.sql). Las filas de
// coach_messages se borran solas con la cuenta, pero los archivos de Storage no.
//
// Borra:
//   · alumno: las conversaciones con cada coach que tuvo ({coach}/{alumno}/…).
//   · coach: todo lo de su carpeta ({coach}/…): conversaciones con alumnos actuales y
//     anteriores, y los audios de los ejercicios ({coach}/ex/…).
// Con la service role: el usuario no tiene permiso para borrar audios en Storage (así nadie
// puede borrar los audios del otro en una conversación). Por eso solo sirve para eliminar la
// cuenta: junta las rutas de los audios, borra la cuenta (delete_own_account, con el token del
// usuario) y recién si eso salió bien borra los audios. Antes los borraba primero: si después
// la cuenta no se borraba (token vencido, plan que se renueva, función cortada), los audios
// del otro ya no estaban y la cuenta seguía.
// Recibe {} con el token del usuario logueado (o { apple_code }, ver más abajo). Devuelve
// { removed, deleted: true }.
// Las apps viejas llaman después a delete_own_account: con la cuenta ya borrada no hace nada.
// Con la cuenta ya borrada no se puede reintentar: las rutas se anotan en audios_por_borrar
// (supabase/borrar-audios.sql) y lo que no se llega a borrar lo borra un cron cada hora, que
// llama a esta función con ?cola=1 (y el header x-cron-secret, como avisos-coach).
//
// Cuentas con «Continuar con Apple»: Apple exige revocar el acceso de la app al borrar la
// cuenta (si no, GIZE sigue en Ajustes → Apple ID → Iniciar sesión con Apple). La app de
// iPhone pide un código nuevo a Apple al confirmar y lo manda en apple_code; acá se canjea y se
// revoca con una clave de «Sign in with Apple» (secrets SIWA_KEY_P8 y SIWA_KEY_ID; si faltan,
// se prueba con la clave de APNs, que sirve si se creó con los dos servicios). Si falla, se
// anota y la cuenta se borra igual: nunca queda trabado el borrado.

import { createClient } from "npm:@supabase/supabase-js@2";
import { decodeJwt, importPKCS8, SignJWT } from "npm:jose@5";
import { anotar, borrar } from "./cola.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const BUCKET = "chat-audio";
const APPLE_CLIENT = "ar.com.gize.app";

async function revokeApple(code: string, appleSub: string): Promise<void> {
  const p8 = Deno.env.get("SIWA_KEY_P8") || Deno.env.get("APNS_KEY_P8");
  const kid = Deno.env.get("SIWA_KEY_P8") ? Deno.env.get("SIWA_KEY_ID") : Deno.env.get("APNS_KEY_ID");
  const team = Deno.env.get("APPLE_TEAM_ID");
  if (!p8 || !kid || !team) { console.error("borrar-audios: apple: sin clave para revocar"); return; }
  const secret = await new SignJWT({}).setProtectedHeader({ alg: "ES256", kid }).setIssuer(team).setIssuedAt()
    .setExpirationTime("5m").setAudience("https://appleid.apple.com").setSubject(APPLE_CLIENT).sign(await importPKCS8(p8, "ES256"));
  // Con tiempo máximo: si Apple no contesta, la cuenta se borra igual.
  const post = (path: string, body: Record<string, string>) => fetch("https://appleid.apple.com/auth/" + path, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: APPLE_CLIENT, client_secret: secret, ...body }), signal: AbortSignal.timeout(8000),
  });
  const r = await post("token", { grant_type: "authorization_code", code });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { console.error("borrar-audios: apple token", r.status, j && j.error); return; }
  // El código tiene que ser de la misma cuenta de Apple que la de GIZE.
  let sub = ""; try { sub = String(decodeJwt(j.id_token || "").sub || ""); } catch (_) { /* sin id_token */ }
  if (appleSub && sub && sub !== appleSub) { console.error("borrar-audios: apple: el código es de otra cuenta"); return; }
  const token = j.refresh_token || j.access_token;
  if (!token) return;
  const rv = await post("revoke", { token, token_type_hint: j.refresh_token ? "refresh_token" : "access_token" });
  if (!rv.ok) console.error("borrar-audios: apple revoke", rv.status);
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Guardia del cron (como en avisos-coach): con el secret CRON_SECRET puesto, se exige el header
// "x-cron-secret" con ese valor. Igual el cron solo borra lo que anotó esta función.
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;

  // El cron: borra los audios que quedaron anotados (de a 1000 por vez).
  if (new URL(req.url).searchParams.get("cola")) {
    if (!cronOk(req)) return json({ error: "No autorizado" }, 401);
    const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data, error } = await db.from("audios_por_borrar").select("path").order("created_at").limit(1000);
    if (error) { console.error("borrar-audios: cola", error.message); return json({ error: "No se pudo leer la cola" }, 500); }
    return json({ removed: await borrar(db, BUCKET, (data || []).map((r) => r.path)) });
  }

  const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
  });
  const { data: u } = await asUser.auth.getUser();
  if (!u || !u.user) return json({ error: "Sesión vencida. Volvé a iniciar sesión." }, 401);
  const me = u.user.id;

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const st = admin.storage.from(BUCKET);

  // Todos los archivos de una carpeta y de sus subcarpetas (la app no las crea, pero Storage
  // las aceptaba antes de topes-archivos.sql y quedaban para siempre), de a 1000. Se listan
  // todos antes de borrar: borrar mientras se pagina corre el offset y se saltearía archivos.
  async function walk(prefix: string, depth = 0): Promise<string[]> {
    const out: string[] = [], dirs: string[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await st.list(prefix, { limit: 1000, offset });
      if (error) throw error;
      const items = data || [];
      items.forEach((it) => { if (it && it.name) (it.id ? out : dirs).push(prefix + "/" + it.name); });
      if (items.length < 1000) break;
    }
    if (depth < 10) for (const d of dirs) out.push(...await walk(d, depth + 1));
    return out;
  }

  // Con la renovación del plan activa no se elimina la cuenta (igual que delete_own_account en
  // supabase/pagos-seguros.sql): se corta antes de borrar nada.
  const { data: bill } = await admin.from("coach_billing").select("mp_preapproval_id, mp_status").eq("coach_id", me).maybeSingle();
  if (bill && bill.mp_preapproval_id && bill.mp_status === "authorized") {
    return json({ error: "Primero cancelá la renovación de tu plan en gize.ar/app (Mi plan → Cancelar la renovación), así Mercado Pago no te sigue cobrando." }, 409);
  }

  // Primero solo se juntan las rutas (después de borrar la cuenta ya no están su coach ni
  // sus mensajes para saber cuáles son).
  const paths: string[] = [];
  try {
    // Como coach: su carpeta entera.
    paths.push(...await walk(me));
    // Como alumno: la carpeta de su conversación con cada coach que tuvo (el actual y los
    // que aparecen en sus mensajes).
    const coaches = new Set<string>();
    const { data: prof, error: pe } = await admin.from("profiles").select("coach_id").eq("id", me).maybeSingle();
    if (pe) throw pe;
    if (prof && prof.coach_id) coaches.add(prof.coach_id);
    const { data: msgs, error: ce } = await admin.from("coach_messages").select("coach_id").eq("client_id", me).not("audio_path", "is", null);
    if (ce) throw ce;
    (msgs || []).forEach((m) => { if (m.coach_id) coaches.add(m.coach_id); });
    for (const c of coaches) if (UUID.test(c) && c !== me) paths.push(...await walk(c + "/" + me));
  } catch (e) {
    console.error("borrar-audios", (e as Error).message);
    return json({ error: "No se pudieron revisar tus mensajes de voz. Probá de nuevo." }, 500);
  }

  // Sign in with Apple: se revoca antes de borrar (después ya no se sabe su cuenta de Apple).
  const apple = (u.user.identities || []).find((i) => i.provider === "apple");
  if (apple) {
    let code = "";
    try { const b = await req.json(); code = typeof b?.apple_code === "string" ? b.apple_code.slice(0, 2000) : ""; } catch (_) { /* sin cuerpo */ }
    if (code) {
      try { await revokeApple(code, String((apple.identity_data && apple.identity_data.sub) || apple.id || "")); }
      catch (e) { console.error("borrar-audios: apple", (e as Error).message); }
    } else console.error("borrar-audios: cuenta de Apple sin código para revocar");
  }

  // La cuenta: auth.users y en cascada todo lo que depende de ella. Si falla, no se borró
  // ningún audio.
  const { error: de } = await asUser.rpc("delete_own_account");
  if (de) {
    console.error("borrar-audios: delete_own_account", de.message);
    return json({ error: de.code === "P0001" ? de.message : "No se pudo eliminar la cuenta. Probá de nuevo." }, de.code === "P0001" ? 409 : 500);
  }

  // Recién ahora los audios. La cuenta ya no está y no puede reintentar (no tiene sesión): se
  // anotan primero en la cola y cada tanda se saca al borrarla. Si algo falla o la función se
  // corta, el cron borra lo que quedó. Igual se contesta que se borró.
  await anotar(admin, paths);
  const removed = await borrar(admin, BUCKET, paths);
  return json({ removed, deleted: true });
});
