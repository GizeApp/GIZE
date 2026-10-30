// Supabase Edge Function "compras-google": las suscripciones que se compran dentro de la app de
// Android con Google Play (planes de coach e IA Plus). Es el espejo de compras-apple: mantiene al
// día public.google_subs y public.coach_billing (ver supabase/compras-google.sql) y, para IA Plus
// (de cualquier cuenta, no solo coaches), las columnas google_* de public.ia_plus (supabase/ia.sql),
// nunca coach_billing.
//
// Cómo publicarla: con la tarea "funciones" de .github/workflows/supabase.yml (no desde el panel de
// Supabase). Va sin "Verify JWT", como las demás: los avisos de Google llegan sin sesión de Supabase
// (traen su propio token, ver oidc.ts). Los pedidos de la app se validan con auth.getUser().
// Secret: GOOGLE_PLAY_SA (la cuenta de servicio, ver _shared/google-play.ts y
// docs/GOOGLE-PLAY-COMPRAS.md). SIN ÉL CONTESTA 503 Y NO HACE NADA (no llama a Google ni escribe):
// así está hasta que el dueño configure Play Console y Google Cloud. El cobro con Google Play además
// arranca apagado en la app (interruptor «compras_google» del panel).
//
// Dirección: https://wegptuzhsrwppbknqstf.supabase.co/functions/v1/compras-google
// Va en Google Cloud → Pub/Sub → la suscripción «push» del tema de los avisos de Play Console, con
// autenticación (cuenta de servicio de GOOGLE_PLAY_SA y esta misma dirección como «público»).
//
// Qué recibe:
//   · Desde la app (con la sesión): { token, producto } con la compra que devolvió Google Play →
//       { ok: true }, { ok: true, reconocer: true } (quedó guardada pero no se pudo reconocer: la
//       reconoce la app) o un error 4xx { error, codigo } con codigo invalida | solo-coach |
//       otra-cuenta | vencida | pendiente | prueba (pendiente: quedó anotada y se activa sola cuando
//       Google cobre).
//     O { compras: [{ token, producto }] } (hasta 20, al recuperar las compras) →
//       { resultados: [{ ok, reconocer? } | { ok: false, error, codigo }] }, en el mismo orden.
//     El producto que manda la app es solo una pista: vale lo que diga Google.
//   · Desde el panel: { accion: "salud" } (solo administradores) → { clave, acceso }: si está
//     GOOGLE_PLAY_SA y si con ella Google da un token de acceso.
//   · Desde Google (Pub/Sub, avisos en tiempo real de Play Console): { message: { data, messageId },
//     subscription } con «Authorization: Bearer <token de Google>». Token que no verifica → 401
//     (Pub/Sub reintenta 7 días: se arregla la configuración y llegan). Después siempre 200, salvo
//     que Google o la base fallen (500: Pub/Sub reintenta). Cada aviso hace volver a leer la compra
//     en la API de Google: el aviso solo dice que algo cambió.
// Nunca se confía en lo que dice el pedido: solo en lo que contesta la API de Google. La compra
// tiene que ser de un producto de planes.ts y, desde la app, de esta cuenta (obfuscatedAccountId =
// el id del usuario, lo pone la app al comprar). Los planes, solo para coaches; IA Plus de prueba
// (cuentas de licencias de Google, que no pagan), solo para las cuentas de la lista del panel
// (reglas.ts → pruebaPlusOk).
// Si nadie reconoce una compra en 3 días, Google devuelve la plata: se reconoce apenas se guarda.
// Las que no se aceptan (otra cuenta, alumno con un plan de coach) no se reconocen.
// Si llega un aviso de una cuenta que ya no existe y Google la sigue renovando, se cancela.
// Al panel le deja anotado (app_config «compras_google_estado») el último aviso y el último error
// de permisos. En los registros nunca van el código de la compra, mails ni lo que contesta Google.

import { createClient } from "npm:@supabase/supabase-js@2";
import { accesoNuevo, cancelar, cuentaPlay, esPermiso, leerSuscripcion, PAQUETE, reconocer } from "../_shared/google-play.ts";
import { TokenInvalido, verificarOIDC } from "./oidc.ts";
import { cambiosBilling, cambiosPlus, cuentaDe, esPlus, type Estado, estadoDe, filaSub, leerAviso, liberar, liberarPlus,
  pruebaPlusOk, revisarSub, tokensRelacionados, tokenValido } from "./reglas.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const admin = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const motivo = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);
const iso = (n: number) => new Date(n).toISOString();

const SIN_CLAVE = "Las compras con Google Play todavía no están listas.";
const NO_CONFIRMA = "Google Play no confirmó esa compra.";

// deno-lint-ignore no-explicit-any
type Db = any;

// Lo que ve el panel: el último aviso de Google y el último error de permisos (se mezcla con lo que
// ya estaba). Si falla, solo se anota en el registro.
async function anotarEstado(db: Db, cambios: Record<string, unknown>): Promise<void> {
  try {
    const { data } = await db.from("app_config").select("value").eq("key", "compras_google_estado").maybeSingle();
    const antes = data && data.value && typeof data.value === "object" && !Array.isArray(data.value) ? data.value : {};
    const { error } = await db.from("app_config").upsert({ key: "compras_google_estado", value: { ...antes, ...cambios }, updated_at: iso(Date.now()) });
    if (error) console.error("compras-google: estado", error.message);
  } catch (e) { console.error("compras-google: estado", motivo(e)); }
}
const anotarPermiso = (db: Db) => anotarEstado(db, { error: "permiso", error_at: iso(Date.now()) });

// Dónde va cada compra: los planes a coach_billing, IA Plus a ia_plus.
const PLAN = { tabla: "coach_billing", id: "coach_id", cambios: cambiosBilling, liberar };
const PLUS = { tabla: "ia_plus", id: "user_id", cambios: cambiosPlus, liberar: liberarPlus };

// Escribe la fila de google_subs (condicional: si otro pedido la cambió en el medio, false y se
// vuelve a leer). Un reembolso y el reconocimiento ya anotados no se borran.
async function guardarSub(db: Db, est: Estado, uid: string, prev: any, ahora: number): Promise<boolean> {
  const fila = filaSub(est, uid, ahora);
  if (prev && prev.revoked) fila.revoked = true;
  if (prev && prev.acknowledged) fila.acknowledged = true;
  if (prev) {
    const { data: hecho, error } = await db.from("google_subs").update(fila).eq("purchase_token", est.token).eq("leido_at", prev.leido_at).select("purchase_token");
    if (error) throw new Error("google_subs: " + error.message);
    return !!(hecho && hecho.length);
  }
  const { error } = await db.from("google_subs").insert(fila);
  if (error) { if (error.code === "23505") return false; throw new Error("google_subs: " + error.message); }
  return true;
}

// La compra que esta reemplazó (cambio de plan): queda reemplazada. Si era de otra cuenta de GIZE
// (la misma cuenta de Google cambió de plan desde otra cuenta de GIZE), esa la deja de tener.
async function reemplazar(db: Db, d: typeof PLAN, vieja: string, uid: string, ahora: number): Promise<void> {
  const { data: fila, error } = await db.from("google_subs").select("user_id, reemplazada").eq("purchase_token", vieja).maybeSingle();
  if (error) throw new Error("google_subs: " + error.message);
  if (!fila) return;
  if (!fila.reemplazada) {
    const { error: ue } = await db.from("google_subs").update({ reemplazada: true, updated_at: iso(ahora) }).eq("purchase_token", vieja);
    if (ue) throw new Error("google_subs: " + ue.message);
  }
  const otra = fila.user_id ? String(fila.user_id).toLowerCase() : "";
  if (!otra || otra === uid) return;
  const { data: cur } = await db.from(d.tabla).select("*").eq(d.id, otra).maybeSingle();
  const lib = d.liberar(cur, vieja, ahora);
  if (!Object.keys(lib).length) return;
  const { error: le } = await db.from(d.tabla).update(lib).eq(d.id, otra).eq("google_token", vieja);
  if (le) throw new Error(d.tabla + ": " + le.message);
}

// Guarda lo que dice Google de una compra de la cuenta uid: primero google_subs (gana lo leído más
// tarde: una lectura vieja que llega tarde no pisa una más nueva) y después coach_billing o ia_plus
// (condicional por updated_at, hasta 4 intentos). Una compra pendiente solo queda en google_subs.
// reconocida: ya estaba anotada como reconocida (aunque Google todavía no lo muestre).
async function aplicar(db: Db, uid: string, token: string, sub: any, leido: number, revocada: boolean): Promise<{ est: Estado; reconocida: boolean }> {
  const d = esPlus(sub) ? PLUS : PLAN;
  const est = estadoDe(token, sub, leido, revocada);
  for (let intento = 0; intento < 4; intento++) {
    const ahora = Date.now();
    const { data: prev, error: se } = await db.from("google_subs").select("*").eq("purchase_token", token).maybeSingle();
    if (se) throw new Error("google_subs: " + se.message);
    const reconocida = est.reconocida || !!(prev && prev.acknowledged);
    if (prev && prev.leido_at && Date.parse(prev.leido_at) > leido) return { est, reconocida };
    let cur: any = null;
    if (!est.pendiente) {
      const { data, error } = await db.from(d.tabla).select("*").eq(d.id, uid).maybeSingle();
      if (error) throw new Error(d.tabla + ": " + error.message);
      if (!data && d === PLAN) throw new Error("la cuenta no tiene coach_billing");
      if (!data) {
        const { error: ie } = await db.from("ia_plus").insert({ user_id: uid });
        if (ie && ie.code !== "23505") throw new Error("ia_plus: " + ie.message);
        continue;
      }
      cur = data;
    }
    if (!(await guardarSub(db, est, uid, prev, ahora))) continue;
    if (est.pendiente) return { est, reconocida };
    if (est.linked && est.activa) await reemplazar(db, d, est.linked, uid, ahora);
    // Una compra ya reemplazada no toca el plan: lo da la que la reemplazó.
    if (prev && prev.reemplazada) return { est, reconocida };
    const cambios = d.cambios(cur, est, ahora);
    if (!Object.keys(cambios).length) return { est, reconocida };
    let q = db.from(d.tabla).update(cambios).eq(d.id, uid);
    q = cur.updated_at ? q.eq("updated_at", cur.updated_at) : q;
    const { data: hecho, error } = await q.select(d.id);
    if (error) throw new Error(d.tabla + ": " + error.message);
    if (hecho && hecho.length) return { est, reconocida };
  }
  throw new Error("la fila cambió muchas veces seguidas");
}

// La cuenta de GIZE de una compra que no la trae: la de la fila de google_subs de esa compra, o de la
// que reemplazó, o de la vencida de la que viene.
async function cuentaGuardada(db: Db, token: string, sub: any): Promise<string | null> {
  for (const t of [token, ...tokensRelacionados(sub)]) {
    const { data, error } = await db.from("google_subs").select("user_id").eq("purchase_token", t).maybeSingle();
    if (error) throw new Error("google_subs: " + error.message);
    if (data && data.user_id) return String(data.user_id).toLowerCase();
  }
  return null;
}

// ¿Esta compra de IA Plus vale para esta cuenta? (las de prueba, solo las de la lista del panel)
async function pruebaPermitida(db: Db, uid: string, est: Estado): Promise<boolean> {
  if (!est.prueba) return true;
  const { data: cfg, error } = await db.from("ia_config").select("plus").eq("id", 1).maybeSingle();
  if (error) throw new Error("ia_config: " + error.message);
  const lista = cfg && cfg.plus && Array.isArray(cfg.plus.sandbox) ? cfg.plus.sandbox : [];
  if (!lista.length) return false;
  const { data: u } = await db.auth.admin.getUserById(uid);
  return pruebaPlusOk(est, (u && u.user && u.user.email) || null, lista);
}

// Reconoce la compra si hace falta. false si no se pudo (queda para la app o para el próximo aviso).
async function reconocerSiFalta(db: Db, est: Estado, reconocida: boolean): Promise<boolean> {
  if (reconocida || !est.activa) return true;
  try { await reconocer(est.producto, est.token); }
  catch (e) {
    console.error("compras-google: reconocer", motivo(e));
    if (esPermiso(e)) await anotarPermiso(db);
    return false;
  }
  const { error } = await db.from("google_subs").update({ acknowledged: true, updated_at: iso(Date.now()) }).eq("purchase_token", est.token);
  if (error) console.error("compras-google: reconocida", error.message);
  return true;
}

type Rta = { error?: string; codigo?: string; reconocer?: boolean };

// Una compra que manda la app. IA Plus lo puede comprar cualquier cuenta; los planes, solo los
// coaches. Los errores de Google o de la base se lanzan (500: la app reintenta).
async function compraDeLaApp(db: Db, uid: string, pedido: any, coach: boolean): Promise<Rta> {
  const token = pedido && typeof pedido === "object" ? pedido.token : null;
  if (!tokenValido(token)) return { error: NO_CONFIRMA, codigo: "invalida" };
  const sub = await leerSuscripcion(token);
  if (!sub) return { error: NO_CONFIRMA, codigo: "invalida" };
  const m = revisarSub(sub);
  if (m) { console.error("compras-google: compra rechazada:", m); return { error: "Esa compra no es de un plan de GIZE.", codigo: "invalida" }; }
  const plus = esPlus(sub);
  if (!plus && !coach) return { error: "Solo las cuentas de coach tienen plan", codigo: "solo-coach" };
  const cuenta = cuentaDe(sub) || await cuentaGuardada(db, token, sub);
  if (cuenta !== uid) return { error: "Esa suscripción de Google Play es de otra cuenta de GIZE.", codigo: "otra-cuenta" };
  const leido = Date.now();
  const est = estadoDe(token, sub, leido);
  if (!est.activa && !est.pendiente) {
    const error = est.estado === "espera" ? "Google Play no pudo cobrar esa suscripción." :
      est.estado === "pausada" ? "Esa suscripción está en pausa en Google Play." : "Esa suscripción ya venció.";
    return { error, codigo: "vencida" };
  }
  if (plus && !(await pruebaPermitida(db, uid, est))) {
    console.error("compras-google: IA Plus de prueba de una cuenta que no está en la lista del panel");
    return { error: "Las compras de prueba de Google Play no activan IA Plus en esta cuenta.", codigo: "prueba" };
  }
  const r = await aplicar(db, uid, token, sub, leido, false);
  if (r.est.pendiente) return { error: "Tu pago quedó pendiente en Google Play. Cuando se acredite, se activa solo.", codigo: "pendiente" };
  return (await reconocerSiFalta(db, r.est, r.reconocida)) ? {} : { reconocer: true };
}

async function desdeLaApp(req: Request, body: any): Promise<Response> {
  const asUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
  });
  const { data: u } = await asUser.auth.getUser();
  if (!u || !u.user) return json({ error: "Sesión vencida. Volvé a iniciar sesión." }, 401);
  const uid = String(u.user.id).toLowerCase();
  const varios = Array.isArray(body.compras);
  const lista = varios ? body.compras : [{ token: body.token, producto: body.producto }];
  if (!lista.length || lista.length > 20) return json({ error: "Pedido inválido" }, 400);
  const db = admin();
  const resultados: Record<string, unknown>[] = [];
  try {
    const { data: prof, error: pe } = await db.from("profiles").select("role").eq("id", uid).maybeSingle();
    if (pe) throw new Error("profiles: " + pe.message);
    const coach = !!prof && prof.role === "coach";
    for (const pedido of lista) {
      const r = await compraDeLaApp(db, uid, pedido, coach);
      resultados.push(r.error ? { ok: false, error: r.error, codigo: r.codigo } : r.reconocer ? { ok: true, reconocer: true } : { ok: true });
    }
  } catch (e) {
    if (esPermiso(e)) await anotarPermiso(db);
    console.error("compras-google: guardar", motivo(e));
    return json({ error: "No se pudo confirmar la compra con Google Play. Probá de nuevo en un rato." }, 500);
  }
  if (varios) return json({ resultados });
  const r = resultados[0];
  return r.ok ? json(r) : json({ error: r.error, codigo: r.codigo }, r.codigo === "solo-coach" ? 403 : 400);
}

// Un aviso de Google sobre una compra: se vuelve a leer y se guarda. Lanza si Google o la base fallan.
async function avisoDeCompra(db: Db, token: string, revocada: boolean): Promise<Record<string, unknown>> {
  const sub = await leerSuscripcion(token);
  if (!sub) return { ignorado: "no existe" };
  const m = revisarSub(sub);
  if (m) { console.error("compras-google: aviso ignorado:", m); return { ignorado: m }; }
  const uid = cuentaDe(sub) || await cuentaGuardada(db, token, sub);
  if (!uid) { console.error("compras-google: aviso sin cuenta de GIZE"); return { ignorado: "sin cuenta" }; }
  const leido = Date.now();
  const est = estadoDe(token, sub, leido, revocada);
  const { data: prof, error: pe } = await db.from("profiles").select("role").eq("id", uid).maybeSingle();
  if (pe) throw new Error("profiles: " + pe.message);
  if (!prof) {
    // La cuenta ya no existe y Google la sigue renovando (red de seguridad: al borrar la cuenta se
    // cancela antes, ver borrar-audios y el panel): se cancela para que no le cobre más.
    if (!est.autoRenueva) return { ignorado: "sin cuenta" };
    await cancelar(token);
    console.error("compras-google: cancelada la renovación de una cuenta que ya no existe");
    return { ignorado: "sin cuenta", cancelada: true };
  }
  if (!est.plus && prof.role !== "coach") return { ignorado: "sin coach" };
  if (est.plus && !(await pruebaPermitida(db, uid, est))) return { ignorado: "prueba" };
  const r = await aplicar(db, uid, token, sub, leido, revocada);
  if (!(await reconocerSiFalta(db, r.est, r.reconocida))) throw new Error("no se pudo reconocer");
  return {};
}

const deBase64 = (s: string) => {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(out);
};

// Aviso de Google Play por Pub/Sub.
async function avisoDeGoogle(req: Request, body: any): Promise<Response> {
  const sa = cuentaPlay()!;
  const audiencia = String(Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "") + "/functions/v1/compras-google";
  const m = /^Bearer ([A-Za-z0-9._-]+)$/.exec(req.headers.get("Authorization") || "");
  try {
    if (!m) throw new TokenInvalido("sin token");
    await verificarOIDC(m[1], { audiencia, email: sa.client_email });
  } catch (e) {
    if (e instanceof TokenInvalido) { console.error("compras-google: aviso sin un token válido de Google:", motivo(e)); return json({ error: "No autorizado" }, 401); }
    console.error("compras-google: aviso", motivo(e));
    return json({ error: "reintentar" }, 500);
  }
  let n: unknown = null;
  try { n = JSON.parse(deBase64(String(body.message && body.message.data || ""))); } catch (_) { n = null; }
  const a = leerAviso(n, PAQUETE);
  if (a.tipo === "ignorar") { console.error("compras-google: aviso ignorado:", a.motivo); return json({ ok: true, ignorado: a.motivo }); }
  const db = admin();
  await anotarEstado(db, { aviso_at: iso(Date.now()), tipo: a.tipo });
  if (a.tipo === "prueba") return json({ ok: true, prueba: true });
  try {
    return json({ ok: true, ...(await avisoDeCompra(db, a.token!, !!a.revocada)) });
  } catch (e) {
    if (esPermiso(e)) await anotarPermiso(db);
    console.error("compras-google: aviso", motivo(e));
    return json({ error: "reintentar" }, 500);
  }
}

// El panel: ¿está la clave y Google da el acceso con ella? (no usa el acceso guardado)
async function salud(req: Request): Promise<Response> {
  const asUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
  });
  const { data: u } = await asUser.auth.getUser();
  if (!u || !u.user) return json({ error: "Sesión vencida. Volvé a iniciar sesión." }, 401);
  const { data: esAdmin } = await asUser.rpc("is_app_admin");
  if (esAdmin !== true) return json({ error: "Solo administradores." }, 403);
  if (!cuentaPlay()) return json({ clave: false, acceso: false });
  let acceso = false;
  try { acceso = !!(await accesoNuevo()); } catch (e) { console.error("compras-google: salud", motivo(e)); }
  return json({ clave: true, acceso });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Pedido inválido" }, 400); }
  if (!body || typeof body !== "object") return json({ error: "Pedido inválido" }, 400);
  if (body.accion === "salud") return salud(req);
  // Sin la cuenta de servicio no se hace nada (Pub/Sub reintenta y la app muestra el aviso).
  if (!cuentaPlay()) return json({ error: SIN_CLAVE, codigo: "sin-clave" }, 503);
  if (body.message !== undefined) return avisoDeGoogle(req, body);
  if (body.token !== undefined || body.compras !== undefined) return desdeLaApp(req, body);
  return json({ error: "Pedido inválido" }, 400);
});
