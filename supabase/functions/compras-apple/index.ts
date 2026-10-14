// Supabase Edge Function "compras-apple": las suscripciones de los planes de coach que se compran
// dentro de la app de iPhone con Apple (In-App Purchase, StoreKit 2). Mantiene al día
// public.apple_subs y public.coach_billing (ver supabase/compras-apple.sql).
//
// Cómo publicarla: con la tarea "funciones" de .github/workflows/supabase.yml (no desde el panel
// de Supabase). Va sin "Verify JWT", como las demás: los avisos de Apple llegan sin sesión de
// Supabase. Los pedidos de la app se validan igual con auth.getUser(). No usa secrets: todo lo que
// recibe viene firmado por Apple y se verifica con la raíz pública de Apple (raiz-apple.ts).
//
// Dirección: https://wegptuzhsrwppbknqstf.supabase.co/functions/v1/compras-apple
// Va en App Store Connect → la app → Información de la app → Notificaciones del servidor del App
// Store, versión 2, en Producción y en Sandbox (docs/APPLE-COMPRAS.md).
//
// Qué recibe:
//   · Desde la app (con la sesión del coach): { jws } con la compra que devolvió StoreKit, o
//     { jws: [..] } con las suscripciones vigentes (al restaurar compras).
//       Un JWS → { ok: true } o un error 400 { error, codigo }.
//       Varios → { resultados: [{ ok } | { ok: false, error, codigo }] }.
//   · Desde Apple (App Store Server Notifications V2): { signedPayload }. Siempre contesta 200 salvo
//     que la firma no verifique (400) o falle la base (500: Apple reintenta).
// Nunca se confía en lo que dice el pedido: solo en lo que firmó Apple (jws.ts). La compra tiene
// que ser de esta app (ar.com.gize.app), de uno de los productos de planes.ts y, desde la app, de
// esta cuenta (appAccountToken = el id del usuario, lo pone la app al comprar).
// Producción y Sandbox valen las dos: la revisión de Apple y TestFlight compran en Sandbox.
// En los registros no van mails, nombres ni el JWS entero.

import { createClient } from "npm:@supabase/supabase-js@2";
import { RAIZ_APPLE_G3, RAIZ_APPLE_G3_SHA256 } from "./raiz-apple.ts";
import { JWSInvalido, pemADer, sha256Hex, verificarJWS } from "./jws.ts";
import { AVISOS, BUNDLE_ID, ENTORNOS, cambiosBilling, cuentaDe, estadoDe, filaSub, liberar, revisarTx } from "./reglas.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const admin = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

// La raíz de Apple, controlada contra su huella una sola vez.
let raizLista: Promise<Uint8Array> | null = null;
function raiz(): Promise<Uint8Array> {
  if (!raizLista) {
    raizLista = (async () => {
      const der = pemADer(RAIZ_APPLE_G3);
      if ((await sha256Hex(der)) !== RAIZ_APPLE_G3_SHA256) throw new Error("la raíz de Apple no coincide con su huella");
      return der;
    })();
    raizLista.catch(() => { raizLista = null; });
  }
  return raizLista;
}

const motivo = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);

// Guarda lo que dice Apple de una suscripción de la cuenta uid: primero apple_subs (gana lo que
// Apple firmó más tarde: un JWS viejo reenviado no pisa un reembolso) y después coach_billing.
// Las dos escrituras son condicionales (si otro pedido cambió la fila en el medio, se vuelve a
// leer y a calcular).
async function aplicar(db: any, uid: string, tx: any, ren: any): Promise<{ vieja?: boolean }> {
  for (let intento = 0; intento < 4; intento++) {
    const ahora = Date.now();
    const est = estadoDe(tx, ren, ahora);
    const { data: sub, error: se } = await db.from("apple_subs").select("*").eq("original_transaction_id", est.otx).maybeSingle();
    if (se) throw new Error("apple_subs: " + se.message);
    if (sub && sub.signed_at && Date.parse(sub.signed_at) > est.firmado) return { vieja: true };
    const { data: cur, error: be } = await db.from("coach_billing").select("*").eq("coach_id", uid).maybeSingle();
    if (be) throw new Error("coach_billing: " + be.message);
    if (!cur) throw new Error("la cuenta no tiene coach_billing");

    const fila = filaSub(est, uid, ahora);
    if (sub) {
      let q = db.from("apple_subs").update(fila).eq("original_transaction_id", est.otx);
      q = sub.signed_at ? q.eq("signed_at", sub.signed_at) : q.is("signed_at", null);
      const { data: hecho, error } = await q.select("original_transaction_id");
      if (error) throw new Error("apple_subs: " + error.message);
      if (!hecho || !hecho.length) continue;
    } else {
      const { error } = await db.from("apple_subs").insert(fila);
      if (error) { if (error.code === "23505") continue; throw new Error("apple_subs: " + error.message); }
    }

    // Venía de otra cuenta de GIZE: esa la deja de tener.
    if (sub && sub.user_id && sub.user_id !== uid) {
      const { data: otra } = await db.from("coach_billing").select("*").eq("coach_id", sub.user_id).maybeSingle();
      const lib = liberar(otra, est.otx, ahora);
      if (Object.keys(lib).length) {
        const { error } = await db.from("coach_billing").update(lib).eq("coach_id", sub.user_id).eq("apple_original_tx", est.otx);
        if (error) throw new Error("coach_billing: " + error.message);
      }
    }

    const cambios = cambiosBilling(cur, est, ahora);
    if (!Object.keys(cambios).length) return {};
    let q = db.from("coach_billing").update(cambios).eq("coach_id", uid);
    q = cur.updated_at ? q.eq("updated_at", cur.updated_at) : q;
    const { data: hecho, error } = await q.select("coach_id");
    if (error) throw new Error("coach_billing: " + error.message);
    if (hecho && hecho.length) return {};
  }
  throw new Error("la fila cambió muchas veces seguidas");
}

// Una compra que manda la app. Devuelve null si quedó guardada o el error para el coach.
async function compraDeLaApp(db: any, uid: string, jws: unknown): Promise<{ error: string; codigo: string } | null> {
  let tx: any;
  try { tx = await verificarJWS(jws, await raiz()); }
  catch (e) {
    console.error("compras-apple: compra que no verifica:", motivo(e));
    return { error: "Apple no confirmó esa compra.", codigo: "invalida" };
  }
  const m = revisarTx(tx);
  if (m) { console.error("compras-apple: compra rechazada:", m); return { error: "Esa compra no es de un plan de GIZE.", codigo: "invalida" }; }
  if (cuentaDe(tx) !== uid) return { error: "Esa suscripción de Apple es de otra cuenta de GIZE.", codigo: "otra-cuenta" };
  if (tx.revocationDate != null) return { error: "Apple devolvió el pago de esa suscripción.", codigo: "revocada" };
  if (Number(tx.expiresDate) <= Date.now()) return { error: "Esa suscripción ya venció.", codigo: "vencida" };
  await aplicar(db, uid, tx, null);
  return null;
}

async function desdeLaApp(req: Request, body: any): Promise<Response> {
  const asUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
  });
  const { data: u } = await asUser.auth.getUser();
  if (!u || !u.user) return json({ error: "Sesión vencida. Volvé a iniciar sesión." }, 401);
  const uid = String(u.user.id).toLowerCase();
  const db = admin();
  const { data: prof } = await db.from("profiles").select("role").eq("id", uid).maybeSingle();
  if (!prof || prof.role !== "coach") return json({ error: "Solo las cuentas de coach tienen plan" }, 403);

  const varios = Array.isArray(body.jws);
  const lista = varios ? body.jws : [body.jws];
  if (!lista.length || lista.length > 20) return json({ error: "Pedido inválido" }, 400);
  const resultados: Record<string, unknown>[] = [];
  try {
    for (const jws of lista) {
      const err = await compraDeLaApp(db, uid, jws);
      resultados.push(err ? { ok: false, ...err } : { ok: true });
    }
  } catch (e) {
    console.error("compras-apple: guardar", motivo(e));
    return json({ error: "No se pudo guardar la compra. Probá de nuevo en un rato." }, 500);
  }
  if (varios) return json({ resultados });
  const r = resultados[0];
  return r.ok ? json({ ok: true }) : json({ error: r.error, codigo: r.codigo }, 400);
}

// Aviso de App Store Server Notifications V2.
async function avisoDeApple(signedPayload: unknown): Promise<Response> {
  let n: any;
  try { n = await verificarJWS(signedPayload, await raiz()); }
  catch (e) {
    if (!(e instanceof JWSInvalido)) { console.error("compras-apple: aviso", motivo(e)); return json({ error: "reintentar" }, 500); }
    console.error("compras-apple: aviso que no verifica:", motivo(e));
    return json({ error: "Firma inválida" }, 400);
  }
  const tipo = String(n.notificationType || "");
  const d = (n.data && typeof n.data === "object") ? n.data : {};
  if (!AVISOS.has(tipo)) return json({ ok: true, ignorado: tipo || "sin tipo" });
  if (d.bundleId !== BUNDLE_ID || !ENTORNOS.includes(d.environment)) {
    console.error("compras-apple: aviso de otra app o entorno", tipo);
    return json({ ok: true, ignorado: "otra app" });
  }
  if (!d.signedTransactionInfo) return json({ ok: true, ignorado: "sin transacción" });
  try {
    const tx = await verificarJWS(d.signedTransactionInfo, await raiz());
    let ren = d.signedRenewalInfo ? await verificarJWS(d.signedRenewalInfo, await raiz()) : null;
    const m = revisarTx(tx);
    if (m) { console.error("compras-apple: aviso", tipo, "ignorado:", m); return json({ ok: true, ignorado: m }); }
    if (ren && String(ren.originalTransactionId) !== String(tx.originalTransactionId)) ren = null;
    const db = admin();
    let uid = cuentaDe(tx);
    if (!uid) {
      const { data: sub } = await db.from("apple_subs").select("user_id").eq("original_transaction_id", String(tx.originalTransactionId)).maybeSingle();
      uid = sub && sub.user_id ? String(sub.user_id) : null;
    }
    if (!uid) { console.error("compras-apple: aviso", tipo, "sin cuenta de GIZE"); return json({ ok: true, ignorado: "sin cuenta" }); }
    // La cuenta se borró, o no es de coach: no hay plan que actualizar.
    const { data: prof } = await db.from("profiles").select("role").eq("id", uid).maybeSingle();
    if (!prof || prof.role !== "coach") return json({ ok: true, ignorado: "sin coach" });
    await aplicar(db, uid, tx, ren);
    return json({ ok: true });
  } catch (e) {
    if (e instanceof JWSInvalido) { console.error("compras-apple: aviso", tipo, "con datos que no verifican:", motivo(e)); return json({ error: "Firma inválida" }, 400); }
    console.error("compras-apple: aviso", tipo, motivo(e));
    return json({ error: "reintentar" }, 500);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Pedido inválido" }, 400); }
  if (!body || typeof body !== "object") return json({ error: "Pedido inválido" }, 400);
  if (body.signedPayload !== undefined) return avisoDeApple(body.signedPayload);
  if (body.jws !== undefined) return desdeLaApp(req, body);
  return json({ error: "Pedido inválido" }, 400);
});
