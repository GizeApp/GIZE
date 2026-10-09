// Qué avisos de coach_alerts se liberan para el minuto siguiente (función avisos-coach). Está
// aparte de index.ts para poder probarlo sin Deno (tests/avisos-tope.test.mjs).

// Cómo le fue a una notificación en los dispositivos del coach: a cuántos llegó, cuáles ya no
// existen (para borrarlos) y si alguno falló por algo pasajero.
export type Envio = { llegaron: number; gone: string[]; pasajero: boolean };
type Alerta = { id: number; created_at: string };
export type Msg = { title: string; body: string; tag: string; alerts: Alerta[] };

// Falla pasajera: sin respuesta (tiempo máximo, sin conexión), demasiados pedidos (429, por
// ejemplo el TooManyProviderTokenUpdates de Apple) o error del servicio (5xx). Las demás (404,
// 410, 400…) no se arreglan reintentando.
export const pasajero = (status?: number | null): boolean => !status || status === 429 || status >= 500;

// Solo se reintentan los de la última hora: si con un coach falla siempre, no es para siempre.
export const reciente = (a: { created_at: string }, now = Date.now()): boolean => now - Date.parse(a.created_at) < 3600_000;

// Manda las notificaciones de un coach (cada una junta varios avisos) y devuelve cuántas
// llegaron, los dispositivos que ya no existen y los avisos a liberar: los de una notificación
// que no le llegó a ningún dispositivo por una falla pasajera. Antes send() se tragaba los
// errores y esos avisos quedaban como mandados. Los de una que llegó no se liberan (le llegaría
// dos veces).
export async function mandar(msgs: Msg[], send: (title: string, body: string, tag: string) => Promise<Envio>, now = Date.now()) {
  const res = await Promise.all(msgs.map((m) => send(m.title, m.body, m.tag)));
  let sent = 0;
  const gone: string[] = [], retry: number[] = [];
  res.forEach((r, i) => {
    gone.push(...r.gone);
    if (r.llegaron) sent++;
    else if (r.pasajero) msgs[i].alerts.forEach((a) => { if (reciente(a, now)) retry.push(a.id); });
  });
  return { sent, gone, retry };
}
