// Verificación de los avisos de Google Play (función compras-google). Google los manda por Pub/Sub
// (suscripción «push» con autenticación): cada pedido trae «Authorization: Bearer <token>», un token
// OIDC (JWT) firmado por Google para la cuenta de servicio que eligió el dueño al crear la
// suscripción de Pub/Sub. Está aparte de index.ts para probarlo sin Deno
// (tests/compras-google.test.mjs). Usa solo WebCrypto (Deno y Node lo traen): nada de paquetes.
//
// Qué se controla (docs.cloud.google.com/pubsub/docs/authenticate-push-subscriptions):
//   · la firma RS256, con las claves públicas de Google (CERTS_GOOGLE, guardadas por su «kid»);
//   · iss: accounts.google.com; aud: la dirección de la función (la que se puso como «público» en la
//     suscripción de Pub/Sub); email: la cuenta de servicio de GOOGLE_PLAY_SA, con email_verified;
//   · que no esté vencido (exp) ni sea del futuro (iat), con 5 minutos de margen.
// Sin esto cualquiera podría mandar avisos falsos (igual la función vuelve a leer cada compra en la
// API de Google: un aviso falso solo la haría consultar).

export const CERTS_GOOGLE = "https://www.googleapis.com/oauth2/v3/certs";
export const EMISORES = ["accounts.google.com", "https://accounts.google.com"];
const MARGEN_MS = 5 * 60_000;

// El token no sirve (contestar 401: Pub/Sub reintenta y, cuando se arregle la configuración, llega).
// El motivo va a los registros, nunca el token.
export class TokenInvalido extends Error {}
const mal = (m: string): never => { throw new TokenInvalido(m); };

function deBase64Url(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) mal("base64url inválido");
  const b = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b + "===".slice((b.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function leerJson(b: Uint8Array): any {
  try { const v = JSON.parse(new TextDecoder().decode(b)); if (v && typeof v === "object") return v; } catch (_) { /* abajo */ }
  return mal("no es JSON");
}

// Las claves públicas de Google, guardadas mientras Google dice que valen (Cache-Control, entre 5
// minutos y 6 horas). Un «kid» que no está (Google cambió las claves) hace pedir la lista de nuevo,
// a lo sumo una vez por minuto.
type Clave = { kid: string; n: string; e: string };
let guardadas: { claves: Map<string, Clave>; hasta: number; pedidas: number } | null = null;

async function claveDe(kid: string): Promise<Clave | null> {
  const ahora = Date.now();
  if (guardadas && ahora < guardadas.hasta) {
    const k = guardadas.claves.get(kid);
    if (k) return k;
    if (ahora - guardadas.pedidas < 60_000) return null;
  }
  // Si Google no contesta es un error común (no TokenInvalido): la función contesta 500 y Pub/Sub
  // reintenta.
  const r = await fetch(CERTS_GOOGLE, { signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error("claves de Google: " + r.status);
  const j = await r.json();
  const claves = new Map<string, Clave>();
  for (const k of (j && Array.isArray(j.keys) ? j.keys : [])) {
    if (k && k.kty === "RSA" && typeof k.kid === "string" && typeof k.n === "string" && typeof k.e === "string") claves.set(k.kid, { kid: k.kid, n: k.n, e: k.e });
  }
  const m = /max-age=(\d+)/.exec(r.headers.get("cache-control") || "");
  const vida = Math.min(Math.max(m ? Number(m[1]) * 1000 : 3600_000, 5 * 60_000), 6 * 3600_000);
  guardadas = { claves, hasta: ahora + vida, pedidas: ahora };
  return claves.get(kid) || null;
}

// Devuelve los datos del token si todo está bien; si no, lanza TokenInvalido.
export async function verificarOIDC(jwt: unknown, o: { audiencia: string; email: string; ahora?: number }): Promise<any> {
  if (typeof jwt !== "string" || !jwt || jwt.length > 8192) mal("sin token");
  const partes = (jwt as string).split(".");
  if (partes.length !== 3) mal("no es un JWT");
  const cab = leerJson(deBase64Url(partes[0]));
  if (cab.alg !== "RS256" || typeof cab.kid !== "string" || !cab.kid) mal("algoritmo o clave inesperados");
  const datos = leerJson(deBase64Url(partes[1]));
  const firma = deBase64Url(partes[2]);
  const k = await claveDe(cab.kid);
  if (!k) mal("clave desconocida");
  const clave = await crypto.subtle.importKey("jwk", { kty: "RSA", n: k!.n, e: k!.e, ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", clave, firma, new TextEncoder().encode(partes[0] + "." + partes[1]));
  if (!ok) mal("firma");
  if (!EMISORES.includes(datos.iss)) mal("emisor");
  const aud = Array.isArray(datos.aud) ? datos.aud : [datos.aud];
  if (!o.audiencia || !aud.includes(o.audiencia)) mal("otra audiencia");
  const mail = String(datos.email || "").toLowerCase();
  if (!o.email || mail !== o.email.toLowerCase()) mal("otra cuenta de servicio");
  if (datos.email_verified !== true && datos.email_verified !== "true") mal("mail sin verificar");
  const ahora = o.ahora ?? Date.now();
  if (!(Number(datos.exp) * 1000 > ahora - MARGEN_MS)) mal("vencido");
  if (!(Number(datos.iat) * 1000 <= ahora + MARGEN_MS)) mal("del futuro");
  return datos;
}
