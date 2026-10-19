// Supabase Edge Function "vence-plan": manda el mail «tu plan vence mañana» a los coaches a
// los que les faltan 24 horas o menos (ver supabase/aviso-vencimiento.sql). La llama pg_cron
// una vez por hora, solo si hay alguno. Va sin "Verify JWT" (la llama la base, sin sesión).
// Llamarla de más no hace nada: cada vencimiento se avisa una sola vez (se marca al tomarlo).
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

type Aviso = { coach_id: string; vence: string; prueba: boolean; clientes: number };

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "método" }, 405);
  if (!cronOk(req)) return json({ error: "no autorizado" }, 401);
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return json({ ok: false, motivo: "falta RESEND_API_KEY" });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data, error } = await db.rpc("tomar_avisos_vence");
  if (error) { console.error("tomar_avisos_vence", error.message); return json({ error: "base" }, 500); }

  let enviados = 0, fallidos = 0;
  for (const a of (data || []) as Aviso[]) {
    try {
      const { data: u } = await db.auth.admin.getUserById(a.coach_id);
      const to = u && u.user && u.user.email;
      if (!to) { fallidos++; continue; } // sin mail no hay a quién avisar (queda marcado)
      const { data: pr } = await db.from("profiles").select("full_name").eq("id", a.coach_id).maybeSingle();
      const m = mailVence({ nombre: pr && pr.full_name, vence: a.vence, prueba: !!a.prueba, clientes: a.clientes || 0 });
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
        body: JSON.stringify({ from: "GIZE <soporte@gize.ar>", to: [to], subject: m.subject, html: m.html, text: m.text }),
      });
      if (!r.ok) throw new Error("Resend " + r.status);
      enviados++;
    } catch (e) {
      fallidos++;
      console.error("aviso de vencimiento", (e as Error).message);
      await db.rpc("soltar_aviso_vence", { cid: a.coach_id });
    }
  }
  return json({ ok: true, enviados, fallidos });
});
