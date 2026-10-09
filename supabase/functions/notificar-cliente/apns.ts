// Token de APNs (el JWT firmado con la clave .p8 que va en cada envío a un iPhone). Apple pide
// no firmar uno nuevo más de una vez cada 20 minutos (si no, responde 429
// TooManyProviderTokenUpdates y el aviso no llega) y cambiarlo antes de la hora. Cada mensaje del
// chat llama a la función y firmaba uno nuevo: mientras la función siga viva entre mensajes, se
// reusa el mismo por 40 minutos. Está aparte de index.ts para poder probarlo sin Deno
// (tests/apns-token.test.mjs).

export const APNS_TTL = 40 * 60_000;

// sign: firma un token nuevo (null si faltan las claves: no se guarda y se prueba la próxima vez).
export function tokenCache(sign: () => Promise<string | null>, ttl = APNS_TTL, now = () => Date.now()): () => Promise<string | null> {
  let tok: { jwt: string; at: number } | null = null;
  return async () => {
    if (tok && now() - tok.at < ttl) return tok.jwt;
    const jwt = await sign();
    tok = jwt ? { jwt, at: now() } : null;
    return jwt;
  };
}
