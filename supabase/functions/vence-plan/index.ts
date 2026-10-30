// Supabase Edge Function "vence-plan": manda el mail «tu plan vence mañana» a los coaches a
// los que les faltan 24 horas o menos (ver supabase/aviso-vencimiento.sql). La llama pg_cron
// una vez por hora, solo si hay alguno. Va sin "Verify JWT" (la llama la base, sin sesión).
// Llamarla de más no hace nada: cada vencimiento se avisa una sola vez (se marca al tomarlo).
// Gimnasios (supabase/gimnasios-admin.sql, que va DESPUÉS de publicar esta versión): al dueño de un
// gimnasio le llega a 7, 3 y 1 día, con el nombre del gimnasio y sus socios, y la administración del
// gimnasio lo recibe en copia (copia: sus cuentas). Al profe sin alumnos propios no le llega nada (lo
// deja afuera tomar_avisos_vence). Con el SQL de antes (cuatro columnas) anda igual que siempre.
// Google Play (app de Android): al coach al que Google le renueva el plan solo (coach_billing:
// google_renueva y google_vence hasta el vencimiento o después) no se le manda nada (queda marcado
// igual y se cuenta en «omitidos»). El freno va acá y no en tomar_avisos_vence, que tiene dos
// versiones vigentes (compras-apple.sql y gimnasios-admin.sql). Sin compras-google.sql, como antes.
//
// Secrets: RESEND_API_KEY (el mismo de los avisos de pagos). Sin él no se manda nada y quedan
// para la hora siguiente. CRON_SECRET (opcional): igual que en avisos-coach, si está se exige
// el header "x-cron-secret" con ese valor (el cron ya lo manda).
// No escribe mails ni nombres en los registros.

import { createClient } from "npm:@supabase/supabase-js@2";
import { mailVence } from "./mail.ts";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

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

type Aviso = { coach_id: string; vence: string; prueba: boolean; clientes: number;
  gym_id?: string | null; gimnasio?: string | null; socios?: number | null; dias?: number | null; copia?: string[] | null; faltan?: number | null };

// El mail de una cuenta (sin mail, null).
async function mailDe(db: ReturnType<typeof createClient>, id: string): Promise<string | null> {
  try { const { data: u } = await db.auth.admin.getUserById(id); return (u && u.user && u.user.email) || null; }
  catch { return null; }
}

// ¿Google Play le renueva el plan solo? Sí, si su suscripción de Google se renueva y cubre hasta el
// vencimiento (o más). Si no se puede leer (por ejemplo, todavía sin compras-google.sql), no.
async function renuevaGoogle(db: ReturnType<typeof createClient>, a: Aviso): Promise<boolean> {
  try {
    const { data: b, error } = await db.from("coach_billing").select("google_renueva, google_vence").eq("coach_id", a.coach_id).maybeSingle();
    if (error || !b || b.google_renueva !== true || !b.google_vence) return false;
    return Date.parse(String(b.google_vence)) >= Date.parse(String(a.vence));
  } catch { return false; }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "método" }, 405);
  if (!cronOk(req)) return json({ error: "no autorizado" }, 401);
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return json({ ok: false, motivo: "falta RESEND_API_KEY" });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data, error } = await db.rpc("tomar_avisos_vence");
  if (error) { console.error("tomar_avisos_vence", error.message); return json({ error: "base" }, 500); }

  let enviados = 0, fallidos = 0, omitidos = 0;
  for (const a of (data || []) as Aviso[]) {
    try {
      if (await renuevaGoogle(db, a)) { omitidos++; continue; } // Google Play se lo renueva solo
      const to = await mailDe(db, a.coach_id);
      if (!to) { fallidos++; continue; } // sin mail no hay a quién avisar (queda marcado)
      const { data: pr } = await db.from("profiles").select("full_name").eq("id", a.coach_id).maybeSingle();
      const m = mailVence({ nombre: pr && pr.full_name, vence: a.vence, prueba: !!a.prueba, clientes: a.clientes || 0,
        gimnasio: a.gimnasio || null, socios: a.socios ?? null, dias: a.dias ?? null, faltan: a.faltan ?? null });
      // La administración del gimnasio, en copia (sin repetir al dueño).
      const cc: string[] = [];
      if (a.gimnasio) for (const id of a.copia || []) { const c = await mailDe(db, id); if (c && c !== to && !cc.includes(c)) cc.push(c); }
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
        body: JSON.stringify({ from: "GIZE <soporte@gize.ar>", to: [to], ...(cc.length ? { cc } : {}), subject: m.subject, html: m.html, text: m.text }),
      });
      if (!r.ok) throw new Error("Resend " + r.status);
      enviados++;
    } catch (e) {
      fallidos++;
      console.error("aviso de vencimiento", (e as Error).message);
      await db.rpc("soltar_aviso_vence", { cid: a.coach_id });
    }
  }
  return json({ ok: true, enviados, fallidos, omitidos });
});
