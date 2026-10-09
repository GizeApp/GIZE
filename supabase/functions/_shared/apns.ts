// Token de APNs (el JWT firmado con la clave .p8 que va en cada envío a un iPhone). Apple pide
// no firmar uno nuevo más de una vez cada 20 minutos (si no, responde 429
// TooManyProviderTokenUpdates y el aviso no llega) y cambiarlo antes de la hora. Cada mensaje del
// chat (notificar-cliente) y cada aviso al coach (avisos-coach) firmaba uno nuevo: mientras la
// función siga viva, se reusa el mismo por 40 minutos. avisos-coach guarda así también el token
// de Firebase (dura una hora). Está aparte para usarlo en las dos y probarlo sin Deno
// (tests/apns-token.test.mjs).

export const APNS_TTL = 40 * 60_000;

// sign: firma un token nuevo (null si faltan las claves: no se guarda y se prueba la próxima vez).
// Se guarda la firma en curso: varios mensajes que llegan juntos (una ráfaga) usan la misma y
// no firman uno cada uno.
export function tokenCache(sign: () => Promise<string | null>, ttl = APNS_TTL, now = () => Date.now()): () => Promise<string | null> {
  let tok: { jwt: Promise<string | null>; at: number } | null = null;
  return () => {
    if (tok && now() - tok.at < ttl) return tok.jwt;
    const mine = { jwt: sign(), at: now() };
    tok = mine;
    // Sin claves o con error no queda guardado: el próximo mensaje vuelve a probar.
    mine.jwt.then((j) => { if (!j && tok === mine) tok = null; }, () => { if (tok === mine) tok = null; });
    return mine.jwt;
  };
}
