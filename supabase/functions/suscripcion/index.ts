// Supabase Edge Function "suscripcion": cobra el plan mensual de los coaches con
// Mercado Pago (suscripciones / preapproval) y mantiene al día public.coach_billing
// (ver supabase/suscripciones.sql).
//
// Cómo publicarla (una sola vez):
//   1. Supabase → Edge Functions → Deploy a new function → Via Editor.
//      Nombre: EXACTAMENTE "suscripcion". Pegar este archivo entero y Deploy.
//      En Settings de la función, APAGAR "Verify JWT": Mercado Pago avisa los pagos sin
//      sesión de Supabase. Los pedidos de la app se validan igual con auth.getUser().
//   2. Supabase → Edge Functions → Secrets → agregar:
//        MP_ACCESS_TOKEN  Access Token de PRODUCCIÓN de Mercado Pago
//                         (mercadopago.com.ar/developers → Tus integraciones → la app →
//                         Credenciales de producción). Es secreto: solo va acá.
//        APP_URL          (opcional) la dirección de la app. Si no está, https://gize.ar/app/
//        MP_WEBHOOK_SECRET (opcional) la "Clave secreta" del webhook de Mercado Pago
//                         (Tus integraciones → la app → Webhooks → Configurar notificaciones).
//                         Si está, se valida la firma x-signature de cada aviso y se descarta
//                         lo que no verifique. Si no está, no se valida (como hasta ahora).
//   3. Mercado Pago → Tus integraciones → la app → Webhooks → Modo productivo:
//        URL: https://wegptuzhsrwppbknqstf.supabase.co/functions/v1/suscripcion?webhook=1
//        Eventos: "Planes y suscripciones" (suscripciones y pagos recurrentes).
//
// Qué recibe:
//   · Desde la app (con la sesión del coach):
//       { action: "checkout", plan: "p10"|"p25"|"p50"|"p100"|"p250"|"p500", mp_email? } → { url } para pagar
//       { action: "cancel" } → cancela la renovación (sigue activo hasta paid_until)
//   · Desde Mercado Pago (?webhook=1): el aviso de un cambio. No se confía en lo que dice
//     el aviso: se vuelve a pedir la suscripción a la API de Mercado Pago con el token,
//     así que un aviso falso no puede dar acceso.
//
// Avisos de pagos a los socios: con cada cobro (aprobado o rechazado) y cada suscripción
// nueva, cancelada o pausada, se manda un mail a todos los de AVISOS_PAGOS a la vez, desde
// soporte@gize.ar (Resend). Sale del servidor, así que les llega a todos igual.
//   Secrets: RESEND_API_KEY (clave de Resend con "Sending access") y AVISOS_PAGOS (mails
//   separados por coma). Sin ellos, los pagos se procesan igual y no se manda nada.
//   Mercado Pago reintenta los avisos: public.mp_avisos (supabase/avisos-pagos.sql) guarda
//   cuáles ya se mandaron para no repetirlos.

import { createClient } from "npm:@supabase/supabase-js@2";
import { alCobrar, avisaSocios, esPedida, pedidaCancelada } from "./reglas.ts";

const PLANES: Record<string, { max: number; price: number; name: string }> = {
  p10: { max: 10, price: 14900, name: "GIZE Coach · hasta 10 clientes" },
  p25: { max: 25, price: 24900, name: "GIZE Coach · hasta 25 clientes" },
  p50: { max: 50, price: 37900, name: "GIZE Coach · hasta 50 clientes" },
  p100: { max: 100, price: 59900, name: "GIZE Gimnasio chico · hasta 100 alumnos" },
  p250: { max: 250, price: 119900, name: "GIZE Gimnasio · hasta 250 alumnos" },
  p500: { max: 500, price: 199900, name: "GIZE Gimnasio grande · hasta 500 alumnos" },
};
// Días de margen después de cada cobro, por si Mercado Pago reintenta un pago rechazado.
const MARGEN_DIAS = 3;
// Checkouts por hora por coach: cada uno crea una suscripción en Mercado Pago con la cuenta de
// GIZE (la misma con la que cobran todos), así que no puede ser sin límite.
const CHECKOUTS_POR_HORA = 10;
// Reusar el link sin pagar no crea nada, pero igual lo consulta en Mercado Pago con esa cuenta:
// tiene su propio tope, más alto, para no gastar los de crear.
const REUSOS_POR_HORA = 30;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const MP = "https://api.mercadopago.com";
async function mp(path: string, init: RequestInit = {}) {
  const r = await fetch(MP + path, {
    ...init,
    headers: { Authorization: "Bearer " + Deno.env.get("MP_ACCESS_TOKEN"), "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("Mercado Pago " + r.status + ": " + (body.message || JSON.stringify(body)));
  return body;
}

const admin = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

function addMonth(d: Date) { const x = new Date(d); x.setMonth(x.getMonth() + 1); return x; }

// ---- Avisos de pagos por mail ----
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const pesos = (n: unknown) => "$" + Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 2 });
const fecha = (d: unknown) => new Date(d ? String(d) : Date.now()).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" });

async function coachInfo(coachId: string) {
  const db = admin();
  const { data: prof } = await db.from("profiles").select("full_name").eq("id", coachId).maybeSingle();
  const { data: u } = await db.auth.admin.getUserById(coachId);
  return { name: (prof && prof.full_name) || "Sin nombre", email: (u && u.user && u.user.email) || "" };
}

// Manda el aviso una sola vez por clave (Mercado Pago reintenta los webhooks).
async function avisar(clave: string, asunto: string, color: string, filas: [string, string][]) {
  const key = Deno.env.get("RESEND_API_KEY");
  const to = String(Deno.env.get("AVISOS_PAGOS") || "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!key || !to.length) return;
  const db = admin();
  const { error: dup } = await db.from("mp_avisos").insert({ clave });
  if (dup) { if (dup.code !== "23505") console.error("mp_avisos", dup.message); return; } // 23505 = ya avisado
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0B0D11">'
    + '<div style="height:4px;background:' + color + ';border-radius:4px"></div>'
    + '<h2 style="margin:20px 0 12px;font-size:20px">' + esc(asunto) + '</h2>'
    + '<table style="width:100%;border-collapse:collapse;font-size:15px">'
    + filas.map(([k, v]) => '<tr><td style="padding:8px 0;color:#6B7280;border-bottom:1px solid #EEF0F3">' + esc(k)
      + '</td><td style="padding:8px 0;text-align:right;font-weight:600;border-bottom:1px solid #EEF0F3">' + esc(v) + '</td></tr>').join("")
    + '</table><p style="margin-top:20px;font-size:12px;color:#9CA3AF">Aviso automático de GIZE a los socios. Llega a: ' + esc(to.join(", ")) + '</p></div>';
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "GIZE <soporte@gize.ar>", to, subject: "GIZE · " + asunto, html }),
    });
    if (!r.ok) {
      console.error("aviso de pago", r.status, await r.text());
      await db.from("mp_avisos").delete().eq("clave", clave); // que el próximo reintento lo mande
    }
  } catch (e) {
    console.error("aviso de pago", (e as Error).message);
    await db.from("mp_avisos").delete().eq("clave", clave);
  }
}

// Trae la suscripción de Mercado Pago y actualiza coach_billing.
async function syncPreapproval(id: string) {
  const pa = await mp("/preapproval/" + encodeURIComponent(id));
  const [coachId, plan] = String(pa.external_reference || "").split("|");
  if (!coachId || !PLANES[plan]) { console.error("preapproval sin referencia GIZE", id); return null; }
  const db = admin();
  const { data: cur } = await db.from("coach_billing").select("*").eq("coach_id", coachId).maybeSingle();
  if (!cur) {
    // La cuenta del coach ya no existe (la borró): que Mercado Pago no le siga cobrando.
    console.error("coach sin coach_billing", coachId);
    if (pa.status === "authorized" || pa.status === "paused") await cancelarMP(id);
    return null;
  }

  // Aviso a los socios de los cambios de la suscripción (una vez por suscripción y estado),
  // solo de la vigente o de la pedida (ver reglas.ts).
  const estados: Record<string, [string, string]> = {
    authorized: ["Suscripción nueva", "#25E8C8"], cancelled: ["Suscripción cancelada", "#FF4D4D"], paused: ["Suscripción pausada", "#FFB020"],
  };
  const est = estados[String(pa.status)];
  if (est && avisaSocios(cur, id, String(pa.status))) {
    const c = await coachInfo(coachId);
    await avisar("pa:" + id + ":" + pa.status, est[0] + " · " + PLANES[plan].name.replace("GIZE ", ""), est[1], [
      ["Coach", c.name], ["Mail", c.email], ["Plan", PLANES[plan].name],
      ["Monto mensual", pesos(pa.auto_recurring && pa.auto_recurring.transaction_amount)],
      ["Fecha", fecha(pa.last_modified || pa.date_created)], ["Suscripción MP", id],
    ]);
  }

  if (pa.status === "authorized") {
    // Solo cuentan la suscripción vigente y la última que pidió el coach. Otra autorizada
    // (un checkout viejo que igual pagó, dos toques seguidos en "pagar") se da de baja:
    // si no, Mercado Pago cobraba las dos todos los meses.
    if (!esPedida(cur, id)) {
      console.error("suscripción que ya no es la pedida, se cancela", id);
      await cancelarMP(id);
      return { coachId, plan };
    }
    // El plan se activa (y paid_until avanza) recién con un cobro hecho: antes bastaba con
    // autorizar la suscripción y se daba un mes aunque el primer cobro fallara.
    const last = pa.summarized && pa.summarized.last_charged_date;
    const cobros = Number((pa.summarized && pa.summarized.charged_quantity) || 0);
    if (!last || cobros < 1) return { coachId, plan };
    let paidUntil = cur.paid_until ? new Date(cur.paid_until) : null;
    const cand = new Date(addMonth(new Date(last)).getTime() + MARGEN_DIAS * 864e5);
    if (!paidUntil || cand > paidUntil) paidUntil = cand;
    // Si cambió de plan, se da de baja la anterior recién ahora que la nueva cobró: si la
    // nueva no se llegaba a cobrar, el coach se quedaba sin ninguna. El plan pendiente se
    // borra solo si lo que cobró es el pendiente (ver reglas.ts).
    const { update, cancelar } = alCobrar(cur, id, plan, PLANES[plan].max, paidUntil);
    if (cancelar) await cancelarMP(cancelar);
    await db.from("coach_billing").update(update).eq("coach_id", coachId);
  } else if (id === cur.mp_preapproval_id) {
    // paused / cancelled de la suscripción vigente: queda activo hasta paid_until.
    await db.from("coach_billing").update({ mp_status: pa.status, updated_at: new Date().toISOString() }).eq("coach_id", coachId);
  } else if (pedidaCancelada(cur, id, String(pa.status))) {
    // El cambio de plan pedido se canceló sin pagarse: se borra (si mientras tanto no pidió otro).
    await db.from("coach_billing").update({ pending_plan: null, mp_pending_id: null, updated_at: new Date().toISOString() })
      .eq("coach_id", coachId).eq("mp_pending_id", id);
  }
  return { coachId, plan };
}

async function cancelarMP(id: string) {
  try { await mp("/preapproval/" + encodeURIComponent(id), { method: "PUT", body: JSON.stringify({ status: "cancelled" }) }); }
  catch (e) { console.error("no se pudo cancelar", id, (e as Error).message); }
}

// Validación de la firma del webhook de Mercado Pago (opcional, defensa en profundidad).
// MP firma "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" con HMAC-SHA256 y la clave secreta
// del webhook, y manda el resultado en el header "x-signature: ts=<ts>,v1=<hash-hex>".
// Igual no se confía en el contenido del aviso (siempre se reconsulta a la API de MP), así que
// esto solo evita que un tercero dispare consultas con ids inventados. Si no está puesto el
// secret MP_WEBHOOK_SECRET, no se valida nada (compatibilidad): se activa al configurarlo.
async function mpSignatureOk(req: Request, url: URL, secret: string): Promise<boolean> {
  const sig = req.headers.get("x-signature") || "";
  const reqId = req.headers.get("x-request-id") || "";
  let ts = "", v1 = "";
  for (const part of sig.split(",")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
    if (k === "ts") ts = v; else if (k === "v1") v1 = v;
  }
  if (!ts || !v1) return false;
  // data.id del query (MP lo toma en minúsculas cuando es alfanumérico; para numérico no cambia).
  const dataId = (url.searchParams.get("data.id") || url.searchParams.get("id") || "").toLowerCase();
  const manifest = "id:" + dataId + ";request-id:" + reqId + ";ts:" + ts + ";";
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  } catch { return false; }
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest)));
  let hex = "";
  mac.forEach((b) => { hex += b.toString(16).padStart(2, "0"); });
  // Comparación en tiempo constante.
  if (hex.length !== v1.length) return false;
  let d = 0;
  for (let i = 0; i < hex.length; i++) d |= hex.charCodeAt(i) ^ v1.charCodeAt(i);
  return d === 0;
}

async function webhook(req: Request, url: URL) {
  const wsecret = Deno.env.get("MP_WEBHOOK_SECRET");
  if (wsecret && !(await mpSignatureOk(req, url, wsecret))) return json({ error: "Firma inválida" }, 401);
  let body: Record<string, any> = {};
  try { body = await req.json(); } catch { /* algunos avisos vienen solo por query */ }
  const type = String(body.type || body.topic || url.searchParams.get("type") || url.searchParams.get("topic") || "");
  const id = String((body.data && body.data.id) || url.searchParams.get("data.id") || url.searchParams.get("id") || "");
  if (!id) return json({ ok: true });
  try {
    if (type.includes("authorized_payment")) {
      // Aviso de un cobro mensual: se busca a qué suscripción pertenece.
      const ap = await mp("/authorized_payments/" + encodeURIComponent(id));
      const ref = ap.preapproval_id ? await syncPreapproval(String(ap.preapproval_id)) : null;
      // Aviso a los socios de cada cobro, aprobado o rechazado (una vez por cobro y estado).
      const pst = String((ap.payment && ap.payment.status) || "");
      if (ref && (pst === "approved" || pst === "rejected")) {
        const c = await coachInfo(ref.coachId);
        const ok = pst === "approved";
        await avisar("ap:" + ap.id + ":" + pst, (ok ? "Cobro recibido " : "Cobro rechazado ") + pesos(ap.transaction_amount),
          ok ? "#2FA0FF" : "#FF4D4D", [
            ["Coach", c.name], ["Mail", c.email], ["Plan", PLANES[ref.plan].name],
            ["Monto", pesos(ap.transaction_amount) + " " + (ap.currency_id || "ARS")],
            ["Estado", ok ? "Aprobado" : "Rechazado" + (ap.payment.status_detail ? " (" + ap.payment.status_detail + ")" : "")],
            ["Fecha", fecha(ap.debit_date || ap.date_created)], ["Cobro MP", String(ap.id)],
          ]);
      }
    } else if (type.includes("preapproval")) {
      await syncPreapproval(id);
    }
  } catch (e) {
    console.error("webhook", type, id, (e as Error).message);
    return json({ error: "reintentar" }, 500); // Mercado Pago reintenta
  }
  return json({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  if (!Deno.env.get("MP_ACCESS_TOKEN")) return json({ error: "Falta MP_ACCESS_TOKEN en los Secrets de la función" }, 500);

  const url = new URL(req.url);
  if (url.searchParams.get("webhook")) return webhook(req, url);

  // Pedido de la app: el coach logueado.
  const asUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
  });
  const { data: u } = await asUser.auth.getUser();
  if (!u || !u.user) return json({ error: "Sesión vencida. Volvé a iniciar sesión." }, 401);
  const coachId = u.user.id;

  let input: { action?: string; plan?: string; mp_email?: string };
  try { input = await req.json(); } catch { return json({ error: "Pedido inválido" }, 400); }

  const db = admin();
  const { data: prof } = await db.from("profiles").select("role").eq("id", coachId).maybeSingle();
  if (!prof || prof.role !== "coach") return json({ error: "Solo las cuentas de coach tienen plan" }, 403);
  const { data: bill } = await db.from("coach_billing").select("*").eq("coach_id", coachId).maybeSingle();
  if (!bill) return json({ error: "Falta configurar las suscripciones (supabase/suscripciones.sql)" }, 500);

  if (input.action === "cancel") {
    if (!bill.mp_preapproval_id) return json({ error: "No tenés una suscripción activa" }, 400);
    await mp("/preapproval/" + encodeURIComponent(bill.mp_preapproval_id), { method: "PUT", body: JSON.stringify({ status: "cancelled" }) });
    await db.from("coach_billing").update({ mp_status: "cancelled", updated_at: new Date().toISOString() }).eq("coach_id", coachId);
    return json({ ok: true, paid_until: bill.paid_until });
  }

  if (input.action === "checkout") {
    const plan = String(input.plan || "");
    const p = PLANES[plan];
    if (!p) return json({ error: "Plan inválido" }, 400);
    const { count } = await db.from("profiles").select("id", { count: "exact", head: true }).eq("coach_id", coachId);
    if ((count || 0) > p.max) return json({ error: "Tenés " + count + " clientes: elegí un plan de más de " + p.max + "." }, 400);
    if (bill.plan === plan && bill.mp_status === "authorized") return json({ error: "Ya tenés ese plan" }, 400);

    const email = String(input.mp_email || u.user.email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "Poné el mail de tu cuenta de Mercado Pago" }, 400);
    const appUrl = Deno.env.get("APP_URL") || "https://gize.ar/app/";

    // Tope por hora (supabase/pagos-seguros.sql, tabla mp_checkouts). Se anota el intento y
    // después se cuenta: si se mandan varios a la vez, igual pasan como mucho los del tope. El
    // frenado se borra: antes contaba, y cada toque mientras estaba frenado alargaba la espera.
    // Reusar el link (reuso) y crear una suscripción se cuentan por separado. Devuelve la
    // respuesta si hay que cortar.
    const hora = new Date(Date.now() - 3600_000).toISOString();
    await db.from("mp_checkouts").delete().eq("coach_id", coachId).lt("created_at", hora); // los viejos ya no cuentan
    const frenar = async (reuso: boolean, max: number) => {
      const { data: mio, error: ie } = await db.from("mp_checkouts").insert({ coach_id: coachId, reuso }).select("id").maybeSingle();
      const { count: intentos, error: ne } = ie ? { count: 0, error: ie } : await db.from("mp_checkouts").select("id", { count: "exact", head: true }).eq("coach_id", coachId).eq("reuso", reuso).gte("created_at", hora);
      if (ne) {
        // Sin la tabla o la columna (falta correr el SQL) se sigue como antes, para no cortar los cobros.
        console.error("mp_checkouts", ne.code, ne.message);
        return ["42P01", "PGRST205", "42703", "PGRST204"].includes(ne.code) ? null : json({ error: "No se pudo preparar el pago. Probá de nuevo en un rato." }, 503);
      }
      if ((intentos || 0) <= max) return null;
      if (mio) await db.from("mp_checkouts").delete().eq("id", mio.id);
      return json({ error: "Probaste muchas veces seguidas. Esperá un rato y volvé a intentar." }, 429);
    };

    // Si ya hay un link sin pagar del mismo plan y con el mismo mail, se usa ese: no hace falta
    // crear (y después dar de baja) otra suscripción. Consultarlo también es un pedido a Mercado
    // Pago con la cuenta de GIZE: antes no tenía tope.
    if (bill.mp_pending_id && bill.pending_plan === plan && bill.mp_pending_id !== bill.mp_preapproval_id) {
      const frenado = await frenar(true, REUSOS_POR_HORA);
      if (frenado) return frenado;
      try {
        const prev = await mp("/preapproval/" + encodeURIComponent(bill.mp_pending_id));
        if (prev.status === "pending" && prev.init_point && prev.external_reference === coachId + "|" + plan &&
            String(prev.payer_email || "").trim().toLowerCase() === email) return json({ url: prev.init_point });
      } catch (e) { console.error("checkout: pendiente", (e as Error).message); }
    }

    const frenado = await frenar(false, CHECKOUTS_POR_HORA);
    if (frenado) return frenado;

    let pa;
    try {
      pa = await mp("/preapproval", {
        method: "POST",
        body: JSON.stringify({
          reason: p.name,
          external_reference: coachId + "|" + plan,
          payer_email: email,
          back_url: appUrl + "?pago=mp",
          status: "pending",
          auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: p.price, currency_id: "ARS" },
        }),
      });
    } catch (e) {
      const msg = (e as Error).message;
      console.error("checkout", msg);
      // Casos comunes: el mail no es de una cuenta de Mercado Pago, o es la misma cuenta que cobra.
      const same = /same user|mismo usuario|collector/i.test(msg);
      return json({ error: same
        ? "Ese mail es el de la cuenta que cobra. Poné el mail de la cuenta de Mercado Pago que va a pagar."
        : "Mercado Pago rechazó el pedido. Revisá que el mail sea el de la cuenta de Mercado Pago que va a pagar. (Detalle: " + msg.slice(0, 200) + ")" }, 502);
    }
    // Se guarda solo si el pendiente sigue siendo el que se leyó al principio: con dos checkouts
    // a la vez, el que llega segundo da de baja la suya (si no, quedaba una sin dar de baja).
    let q = db.from("coach_billing").update({ pending_plan: plan, mp_pending_id: pa.id, updated_at: new Date().toISOString() }).eq("coach_id", coachId);
    q = bill.mp_pending_id ? q.eq("mp_pending_id", bill.mp_pending_id) : q.is("mp_pending_id", null);
    const { data: saved, error: se } = await q.select("coach_id");
    if (se || !saved || !saved.length) {
      if (se) console.error("checkout: guardar", se.message);
      await cancelarMP(pa.id);
      return json({ error: "Ya se estaba preparando otro pago. Probá de nuevo." }, 409);
    }
    // El checkout anterior que no se terminó de pagar se da de baja: si el coach lo pagaba
    // igual (otra pestaña, dos toques), quedaban dos suscripciones cobrando.
    if (bill.mp_pending_id && bill.mp_pending_id !== bill.mp_preapproval_id) await cancelarMP(bill.mp_pending_id);
    return json({ url: pa.init_point });
  }

  return json({ error: "Acción desconocida" }, 400);
});
