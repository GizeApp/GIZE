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
// cuenta: después de borrar los audios borra la cuenta (delete_own_account, con el token del
// usuario). Antes solo borraba los audios, y cualquiera podía llamarla a mano y borrar los
// del otro sin irse.
// Recibe {} con el token del usuario logueado. Devuelve { removed, deleted: true }.
// Las apps viejas llaman después a delete_own_account: con la cuenta ya borrada no hace nada.

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const BUCKET = "chat-audio";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
  });
  const { data: u } = await asUser.auth.getUser();
  if (!u || !u.user) return json({ error: "Sesión vencida. Volvé a iniciar sesión." }, 401);
  const me = u.user.id;

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const st = admin.storage.from(BUCKET);

  // Archivos de una carpeta (sin subcarpetas), de a 1000. Se listan todos antes de borrar:
  // borrar mientras se pagina corre el offset y se saltearía archivos.
  async function files(prefix: string): Promise<string[]> {
    const out: string[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await st.list(prefix, { limit: 1000, offset });
      if (error) throw error;
      const items = data || [];
      items.forEach((it) => { if (it && it.id) out.push(prefix + "/" + it.name); });
      if (items.length < 1000) break;
    }
    return out;
  }
  async function subfolders(prefix: string): Promise<string[]> {
    const out: string[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await st.list(prefix, { limit: 1000, offset });
      if (error) throw error;
      const items = data || [];
      items.forEach((it) => { if (it && !it.id && it.name) out.push(prefix + "/" + it.name); });
      if (items.length < 1000) break;
    }
    return out;
  }

  // Con la renovación del plan activa no se elimina la cuenta (igual que delete_own_account en
  // supabase/pagos-seguros.sql): se corta antes de borrar nada.
  const { data: bill } = await admin.from("coach_billing").select("mp_preapproval_id, mp_status").eq("coach_id", me).maybeSingle();
  if (bill && bill.mp_preapproval_id && bill.mp_status === "authorized") {
    return json({ error: "Primero cancelá la renovación de tu plan en gize.ar/app (Mi plan → Cancelar la renovación), así Mercado Pago no te sigue cobrando." }, 409);
  }

  let removed = 0;
  try {
    const paths: string[] = [];
    // Como coach: su carpeta entera.
    for (const dir of await subfolders(me)) paths.push(...await files(dir));
    // Como alumno: la carpeta de su conversación con cada coach que tuvo (el actual y los
    // que aparecen en sus mensajes).
    const coaches = new Set<string>();
    const { data: prof } = await admin.from("profiles").select("coach_id").eq("id", me).maybeSingle();
    if (prof && prof.coach_id) coaches.add(prof.coach_id);
    const { data: msgs } = await admin.from("coach_messages").select("coach_id").eq("client_id", me).not("audio_path", "is", null);
    (msgs || []).forEach((m) => { if (m.coach_id) coaches.add(m.coach_id); });
    for (const c of coaches) if (UUID.test(c) && c !== me) paths.push(...await files(c + "/" + me));

    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await st.remove(paths.slice(i, i + 100));
      if (error) throw error;
    }
    removed = paths.length;
  } catch (e) {
    console.error("borrar-audios", (e as Error).message);
    return json({ error: "No se pudieron borrar tus mensajes de voz. Probá de nuevo." }, 500);
  }

  // La cuenta: auth.users y en cascada todo lo que depende de ella.
  const { error: de } = await asUser.rpc("delete_own_account");
  if (de) {
    console.error("borrar-audios: delete_own_account", de.message);
    return json({ error: de.code === "P0001" ? de.message : "No se pudo eliminar la cuenta. Probá de nuevo." }, de.code === "P0001" ? 409 : 500);
  }
  return json({ removed, deleted: true });
});
