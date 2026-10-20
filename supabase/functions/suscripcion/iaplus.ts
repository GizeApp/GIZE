// Reglas de IA Plus con Mercado Pago (función suscripcion): la suscripción mensual que deja usar la
// foto del plato y «Contame qué comiste» sin el límite semanal (supabase/ia.sql, tabla ia_plus).
// Están aparte de index.ts para poder probarlas sin Deno (tests/ia-plus-funciones.test.mjs).
// cur: la fila de ia_plus de la persona (o null si nunca pidió IA Plus). Las columnas de Mercado
// Pago se llaman como las de coach_billing (mp_preapproval_id, mp_pending_id), así que esPedida y
// avisaSocios de reglas.ts valen igual.

export const NOMBRE_PLUS = "GIZE IA Plus · mensual";
// Días de margen después de cada cobro (como el plan de coach), por si Mercado Pago reintenta.
export const MARGEN_DIAS = 3;
// Botón de arrepentimiento (Argentina, Ley 24.240 art. 34 y Res. 424/2020 de la Secretaría de
// Comercio): 10 días corridos desde la contratación, con la devolución completa.
export const ARREPENTIMIENTO_DIAS = 10;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DIA = 864e5;
const iso = (ms: number) => new Date(ms).toISOString();
const ms = (v: unknown) => (v ? Date.parse(String(v)) || 0 : 0);
function sumarMes(d: Date) { const x = new Date(d); x.setMonth(x.getMonth() + 1); return x; }

// La referencia que va en la suscripción de Mercado Pago: «iaplus|<id de la cuenta>». Las de los
// planes de coach son «<id del coach>|<plan>», así que nunca se confunden.
export const refPlus = (uid: string) => "iaplus|" + uid;
export function uidDeRef(ref: unknown): string | null {
  const [a, b] = String(ref || "").split("|");
  return a === "iaplus" && UUID.test(String(b || "").toLowerCase()) ? String(b).toLowerCase() : null;
}

type Plus = {
  mp_preapproval_id?: string | null; mp_pending_id?: string | null; mp_status?: string | null;
  mp_desde?: string | null; mp_hasta?: string | null; mp_pago_id?: string | null; arrepentido_at?: string | null;
} | null;

// Qué se guarda cuando Mercado Pago cobró la suscripción `id` (la vigente o la pedida) y cuál se da
// de baja. Aplicar dos veces el mismo cobro da lo mismo (hasta dónde cubre sale del último cobro).
// null: no se toca nada (la persona ya se arrepintió de esa suscripción: un aviso que llega tarde
// no le vuelve a dar IA Plus).
export function plusAlCobrar(cur: Plus, id: string, ultimoCobro: Date, now = new Date()) {
  if (cur && cur.arrepentido_at && id === cur.mp_preapproval_id) return null;
  const nueva = !cur || id !== cur.mp_preapproval_id;
  const cand = sumarMes(ultimoCobro).getTime() + MARGEN_DIAS * DIA;
  const update: Record<string, unknown> = {
    mp_preapproval_id: id, mp_status: "authorized", mp_hasta: iso(Math.max(ms(cur && cur.mp_hasta), cand)), updated_at: now.toISOString(),
  };
  // Una suscripción nueva es un contrato nuevo: desde su primer cobro corren los 10 días del
  // arrepentimiento (y se puede volver a usar aunque se haya usado con una anterior).
  if (nueva || !(cur && cur.mp_desde)) update.mp_desde = ultimoCobro.toISOString();
  if (nueva) update.arrepentido_at = null;
  if (cur && id === cur.mp_pending_id) update.mp_pending_id = null;
  const cancelar = cur && cur.mp_preapproval_id && cur.mp_preapproval_id !== id ? cur.mp_preapproval_id : null;
  return { update, cancelar };
}

// ¿Puede usar el botón de arrepentimiento? Con la suscripción de Mercado Pago cobrada, dentro de los
// 10 días corridos desde el primer cobro, una sola vez por suscripción y mientras cubra.
export function puedeArrepentirse(cur: Plus, now = Date.now()): boolean {
  return !!cur && !!cur.mp_preapproval_id && !!cur.mp_desde && !cur.arrepentido_at
    && now < ms(cur.mp_desde) + ARREPENTIMIENTO_DIAS * DIA && ms(cur.mp_hasta) > now;
}

// Un cobro devuelto (desde Mercado Pago) o desconocido por la tarjeta: si es el último que se cobró
// y todavía cubre, IA Plus se corta ahora. null: no cambia nada.
export function plusAlDevolver(cur: Plus, pagoId: string, now = Date.now()): Record<string, unknown> | null {
  if (!cur || !pagoId || String(cur.mp_pago_id || "") !== String(pagoId) || ms(cur.mp_hasta) <= now) return null;
  return { mp_hasta: iso(now), updated_at: iso(now) };
}
