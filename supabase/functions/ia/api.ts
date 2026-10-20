// La llamada a la API de Anthropic (con fetch, sin el SDK) y qué hacer con cada error. Sin
// reintentos: si falla, el panel o la app ofrecen probar de nuevo.
export const API = "https://api.anthropic.com/v1/messages";

export type ErrorApi = { type?: string; message?: string; details?: { error_code?: string } | null } | null;
export type Resultado =
  | { tipo: "ok"; json: Record<string, unknown>; ms: number }
  | { tipo: "http"; status: number; error: ErrorApi; ms: number }
  | { tipo: "tiempo"; ms: number }
  | { tipo: "red"; ms: number };

export async function llamar(body: unknown, clave: string, tope: number): Promise<Resultado> {
  const t0 = Date.now();
  try {
    const r = await fetch(API, {
      method: "POST",
      headers: { "x-api-key": clave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(tope),
    });
    const txt = await r.text();
    let j: Record<string, unknown> | null = null;
    try { j = JSON.parse(txt); } catch { j = null; }
    const ms = Date.now() - t0;
    if (!r.ok) return { tipo: "http", status: r.status, error: (j && (j.error as ErrorApi)) || null, ms };
    // Respondió bien pero no se entiende: como si no hubiera respondido (no se sabe cuánto costó).
    if (!j) return { tipo: "red", ms };
    return { tipo: "ok", json: j, ms };
  } catch (e) {
    const name = (e as Error).name;
    const ms = Date.now() - t0;
    return name === "TimeoutError" || name === "AbortError" ? { tipo: "tiempo", ms } : { tipo: "red", ms };
  }
}

// Qué significa cada error de la API para la guardia:
//   codigo: lo que se le contesta al panel o a la app; motivo: el detalle, para el panel;
//   registro: lo que queda en ia_llamadas.codigo; cortar: si hay que cortar el ciclo y hasta cuándo.
// Ninguno de estos cobra (la API los rechaza antes de procesar): se cierran con usd = 0.
export type Clasificado = { codigo: string; motivo?: string; registro: string; cortar?: { motivo: "creditos" | "limite_console"; vuelve: Date } };
export function clasificarError(status: number, error: ErrorApi, ahora = new Date()): Clasificado {
  const msg = String((error && error.message) || "");
  const tipo = String((error && error.type) || "");
  // Se terminaron los créditos. La documentación da el mensaje pero no el código HTTP: se mira el
  // texto, el 402 y el tipo. Se pausa media hora y la llamada siguiente prueba de nuevo sola.
  if (status === 402 || tipo === "billing_error" || /credit balance is too low/i.test(msg)) {
    return { codigo: "pausada", motivo: "creditos", registro: "creditos", cortar: { motivo: "creditos", vuelve: new Date(ahora.getTime() + 30 * 60_000) } };
  }
  // Límite de gasto que se puso en la Console (de la organización o del workspace): 400 con este
  // texto. O el tope del nivel de la organización: 429 con enforced_spend_limit_reached (sin
  // retry-after). Vuelve en la fecha que dice el mensaje o, si no la dice, el día 1 del mes que
  // viene a las 00:00 UTC (cuando la Console reinicia sus límites).
  const enforced = !!(error && error.details && error.details.error_code === "enforced_spend_limit_reached");
  if ((status === 400 && /specified (workspace )?API usage limits/i.test(msg)) || (status === 429 && enforced)) {
    return { codigo: "tope_mes", motivo: "limite_console", registro: "limite_console", cortar: { motivo: "limite_console", vuelve: fechaDelMensaje(msg, ahora) || primeroDelMesQueViene(ahora) } };
  }
  if (status === 429) return { codigo: "ocupada", registro: "limite_uso" };
  if (status === 529 || tipo === "overloaded_error") return { codigo: "ocupada", registro: "sobrecarga" };
  // Clave mala o revocada: la IA queda pausada y el panel lo avisa.
  if (status === 401 || status === 403) return { codigo: "pausada", motivo: "clave_rechazada", registro: "clave_rechazada" };
  return { codigo: "error", registro: "api_" + (Number.isInteger(status) ? status : "x") };
}

// «You will regain access on 2026-11-01 at 00:00 UTC.» → esa fecha (si es razonable: en el futuro
// y dentro de los próximos 40 días).
export function fechaDelMensaje(msg: string, ahora = new Date()): Date | null {
  const m = /(\d{4})-(\d{2})-(\d{2})(?:\s+at\s+(\d{1,2}):(\d{2}))?/.exec(msg);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0));
  const dt = d.getTime() - ahora.getTime();
  return Number.isFinite(dt) && dt > 0 && dt < 40 * 86_400_000 ? d : null;
}
export const primeroDelMesQueViene = (ahora = new Date()) => new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() + 1, 1));
