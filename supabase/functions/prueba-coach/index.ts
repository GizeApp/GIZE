// Supabase Edge Function "prueba-coach": manda los mails de la prueba gratis a los coaches, el
// del día 3 («¿Ya sumaste tu primer alumno?») y el del día 10 («Te quedan 4 días») (ver
// supabase/mails-prueba.sql). La llama pg_cron una vez por hora, de día, solo si hay alguno.
// Va sin "Verify JWT" (la llama la base, sin sesión). Llamarla de más no hace nada: cada mail
// sale una sola vez por coach (se marca al tomarlo).
//
// Secrets: RESEND_API_KEY (el mismo del aviso de vencimiento). Sin él no se manda nada y quedan
// para la hora siguiente. CRON_SECRET (opcional): igual que en avisos-coach, si está se exige
// el header "x-cron-secret" con ese valor (el cron ya lo manda).
// No escribe mails ni nombres en los registros.

import { createClient } from "npm:@supabase/supabase-js@2";
import { mailPrueba } from "./mail.ts";

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

type Toca = { coach_id: string; dia: number; vence: string; nombre: string | null; codigo: string | null; clientes: number };

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "método" }, 405);
  if (!cronOk(req)) return json({ error: "no autorizado" }, 401);
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return json({ ok: false, motivo: "falta RESEND_API_KEY" });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data, error } = await db.rpc("tomar_mails_prueba");
  if (error) { console.error("tomar_mails_prueba", error.message); return json({ error: "base" }, 500); }

  let enviados = 0, fallidos = 0;
  for (const a of (data || []) as Toca[]) {
    try {
      const { data: u } = await db.auth.admin.getUserById(a.coach_id);
      const to = u && u.user && u.user.email;
      if (!to) { fallidos++; continue; } // sin mail no hay a quién escribirle (queda marcado)
      const m = mailPrueba({ dia: a.dia, nombre: a.nombre, codigo: a.codigo, clientes: a.clientes || 0, vence: a.vence });
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
        body: JSON.stringify({ from: "GIZE <soporte@gize.ar>", to: [to], subject: m.subject, html: m.html, text: m.text }),
      });
      if (!r.ok) throw new Error("Resend " + r.status);
      enviados++;
    } catch (e) {
      fallidos++;
      console.error("mail de la prueba", a.dia, (e as Error).message);
      await db.rpc("soltar_mail_prueba", { cid: a.coach_id, dia: a.dia });
    }
  }
  return json({ ok: true, enviados, fallidos });
});
