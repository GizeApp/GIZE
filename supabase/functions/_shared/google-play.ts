// Google Play (la API de Google Play Developer) para las suscripciones de la app de Android. Lo usan
// la función compras-google (leer y reconocer compras, avisos de Pub/Sub, «salud» del panel),
// borrar-audios y el panel (admin, «eliminar»), que cancelan la renovación antes de borrar una cuenta.
//
// Secret: GOOGLE_PLAY_SA (Supabase → Edge Functions → Secrets), el JSON entero de la cuenta de
// servicio de Google Cloud invitada a Play Console con permiso para ver y administrar pedidos y
// suscripciones (docs/GOOGLE-PLAY-COMPRAS.md). Sin él no se llama a Google.
// El permiso para la API se saca como el de Firebase en avisos-coach: un JWT firmado con la clave de
// la cuenta (RS256) a cambio de un token de acceso de Google, que se reusa 50 minutos (dura una hora;
// ver tokenCache en _shared/apns.ts).
// Todas las llamadas tienen tiempo máximo. En los registros nunca va el código de la compra (token).

import { importPKCS8, SignJWT } from "npm:jose@5";
import { tokenCache } from "./apns.ts";

export const PAQUETE = "ar.com.gize.app";
const API = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/" + PAQUETE + "/purchases/";
const ALCANCE = "https://www.googleapis.com/auth/androidpublisher";
export const TOPE_MS = 10_000;

export type CuentaPlay = { client_email: string; private_key: string };

// La cuenta de servicio de GOOGLE_PLAY_SA (null si falta o está mal pegada).
export function cuentaPlay(): CuentaPlay | null {
  try {
    const sa = JSON.parse(Deno.env.get("GOOGLE_PLAY_SA") || "");
    if (sa && typeof sa.client_email === "string" && typeof sa.private_key === "string" && sa.client_email && sa.private_key) {
      return { client_email: sa.client_email, private_key: sa.private_key };
    }
  } catch (_) { /* sin clave */ }
  return null;
}

// Lo que contestó Google cuando no fue bien. status 0: no contestó (tiempo máximo o sin red).
export class ErrorPlay extends Error {
  que: string;
  status: number;
  constructor(que: string, status: number) { super("Google Play " + que + ": " + (status || "sin respuesta")); this.que = que; this.status = status; }
}
// 401/403: la cuenta de servicio todavía no tiene permiso en Play Console (puede tardar hasta un día).
// Google tampoco da el token de acceso (la clave se borró o está mal pegada): también es la clave.
export const esPermiso = (e: unknown) => e instanceof ErrorPlay && (e.status === 401 || e.status === 403 || (e.que === "acceso" && e.status > 0 && e.status < 500));

// Un token de acceso nuevo (sin usar el guardado). null sin GOOGLE_PLAY_SA; lanza ErrorPlay si
// Google no lo da (clave borrada o mal pegada).
export async function accesoNuevo(): Promise<string | null> {
  const sa = cuentaPlay();
  if (!sa) return null;
  const key = await importPKCS8(sa.private_key, "RS256");
  const ahora = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({ scope: ALCANCE })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(sa.client_email).setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(ahora).setExpirationTime(ahora + 3600).sign(key);
  let r: Response;
  try {
    r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
      signal: AbortSignal.timeout(TOPE_MS),
    });
  } catch (_) { throw new ErrorPlay("acceso", 0); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j || !j.access_token) throw new ErrorPlay("acceso", r.status || 500);
  return String(j.access_token);
}
export const accesoPlay = tokenCache(accesoNuevo, 50 * 60_000);

async function llamar(metodo: string, ruta: string, cuerpo?: unknown): Promise<Response> {
  const acceso = await accesoPlay();
  if (!acceso) throw new Error("falta GOOGLE_PLAY_SA");
  try {
    return await fetch(API + ruta, {
      method: metodo,
      headers: Object.assign({ Authorization: "Bearer " + acceso }, cuerpo === undefined ? {} : { "Content-Type": "application/json" }),
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(TOPE_MS),
    });
  } catch (_) { throw new ErrorPlay(metodo === "GET" ? "leer" : "pedido", 0); }
}
const ruta = (t: string) => encodeURIComponent(t);

// La compra tal como la tiene Google (SubscriptionPurchaseV2). null si Google no la conoce (un
// código inventado o una compra de hace mucho): 400, 404 o 410. Lanza ErrorPlay con lo demás.
export async function leerSuscripcion(token: string): Promise<any | null> {
  const r = await llamar("GET", "subscriptionsv2/tokens/" + ruta(token));
  if (r.status === 400 || r.status === 404 || r.status === 410) return null;
  if (!r.ok) throw new ErrorPlay("leer", r.status);
  return await r.json();
}

// Reconoce la compra (acknowledge). Si nadie la reconoce en 3 días, Google devuelve la plata sola.
// Va con la API de suscripciones v1 (la v2 no reconoce).
export async function reconocer(producto: string, token: string): Promise<void> {
  const r = await llamar("POST", "subscriptions/" + ruta(producto) + "/tokens/" + ruta(token) + ":acknowledge", {});
  if (!r.ok) throw new ErrorPlay("reconocer", r.status);
}

// Corta la renovación: Google no le cobra más. DEVELOPER_REQUESTED_STOP_PAYMENTS no se puede
// deshacer (se usa al borrar la cuenta). Lo pagado sigue hasta el vencimiento. 400 o 410: ya no hay
// nada que cancelar (ya cancelada o vencida).
export async function cancelar(token: string): Promise<void> {
  const r = await llamar("POST", "subscriptionsv2/tokens/" + ruta(token) + ":cancel",
    { cancellationContext: { cancellationType: "DEVELOPER_REQUESTED_STOP_PAYMENTS" } });
  if (r.ok || r.status === 400 || r.status === 410) return;
  throw new ErrorPlay("cancelar", r.status);
}

// Antes de borrar una cuenta: cancela las suscripciones de Google Play de esa cuenta que se renuevan
// solas (activas, en período de gracia, en espera o en pausa, sin reemplazar). Devuelve cuántas
// canceló. Lanza si alguna no se pudo cancelar (entonces no se borra la cuenta: si no, Google le
// seguiría cobrando a alguien que ya no tiene cuenta) o si hay que cancelar y falta GOOGLE_PLAY_SA.
// Sin la tabla google_subs (falta supabase/compras-google.sql) no hay nada que cancelar.
// deno-lint-ignore no-explicit-any
export async function cancelarGoogleDe(db: any, uid: string): Promise<number> {
  const { data, error } = await db.from("google_subs").select("purchase_token, estado, auto_renew, reemplazada").eq("user_id", uid);
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return 0;
    throw new Error("google_subs: " + error.message);
  }
  const vivas = (data || []).filter((s: any) => s && s.auto_renew === true && !s.reemplazada &&
    ["activa", "gracia", "espera", "pausada"].includes(s.estado));
  if (!vivas.length) return 0;
  if (!cuentaPlay()) throw new Error("falta GOOGLE_PLAY_SA");
  for (const s of vivas) {
    await cancelar(String(s.purchase_token));
    // Anotado, por si después el borrado falla y se reintenta (el aviso de Google lo vuelve a poner al día).
    await db.from("google_subs").update({ auto_renew: false, updated_at: new Date().toISOString() }).eq("purchase_token", s.purchase_token);
  }
  return vivas.length;
}
