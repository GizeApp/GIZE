// Reglas de las suscripciones de Apple (función compras-apple). Están aparte de index.ts para
// probarlas sin Deno (tests/compras-apple.test.mjs).
//
// tx: los datos de una transacción firmada por Apple (JWSTransactionDecodedPayload).
// ren: los de la renovación (JWSRenewalInfoDecodedPayload), que llegan solo en los avisos de Apple.
// Las fechas de Apple vienen en milisegundos.

import { PRODUCTOS_APPLE } from "./planes.ts";

export const BUNDLE_ID = "ar.com.gize.app";
// Producción y Sandbox: la revisión de Apple (App Review) y TestFlight compran en Sandbox, contra
// este mismo servidor. En Sandbox no se cobra y la suscripción vence en minutos u horas.
export const ENTORNOS = ["Production", "Sandbox"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Lo que tiene que cumplir cualquier transacción, venga de la app o de un aviso. "" si está bien;
// si no, el motivo (para los registros).
export function revisarTx(tx: any): string {
  if (!tx || typeof tx !== "object") return "sin datos";
  if (tx.bundleId !== BUNDLE_ID) return "es de otra app";
  if (!ENTORNOS.includes(tx.environment)) return "entorno desconocido";
  if (!PRODUCTOS_APPLE[tx.productId]) return "producto desconocido";
  if (!tx.originalTransactionId || !tx.transactionId) return "sin número de transacción";
  if (!Number.isFinite(Number(tx.expiresDate)) || !Number(tx.expiresDate)) return "sin vencimiento";
  return "";
}

// La cuenta de GIZE que compró: la app pasa el id del usuario como appAccountToken al comprar.
export function cuentaDe(tx: any): string | null {
  const t = String((tx && tx.appAccountToken) || "").toLowerCase();
  return UUID.test(t) ? t : null;
}

export type Estado = {
  otx: string; txId: string; producto: string; plan: string; max: number;
  hasta: number;            // hasta cuándo cubre (vencimiento, período de gracia o fecha del reembolso)
  activa: boolean;
  revocada: boolean;
  renueva: boolean | null;  // null: no se sabe (la app no manda la renovación)
  entorno: string;
  firmado: number;          // cuándo lo firmó Apple: lo más nuevo gana
};

export function estadoDe(tx: any, ren: any, ahora: number): Estado {
  const prod = PRODUCTOS_APPLE[tx.productId];
  const vence = Number(tx.expiresDate);
  const revocada = tx.revocationDate != null;
  // Período de gracia (si está activado en App Store Connect): Apple sigue dando el plan mientras
  // reintenta cobrar.
  const gracia = ren && Number(ren.gracePeriodExpiresDate) || 0;
  const hasta = revocada ? Math.min(Number(tx.revocationDate) || ahora, vence) : Math.max(vence, gracia);
  const activa = !revocada && hasta > ahora;
  return {
    otx: String(tx.originalTransactionId), txId: String(tx.transactionId), producto: String(tx.productId),
    plan: prod.plan, max: prod.max, hasta, activa, revocada,
    renueva: !activa ? false : ren ? Number(ren.autoRenewStatus) === 1 : null,
    entorno: String(tx.environment), firmado: Number(tx.signedDate) || ahora,
  };
}

const iso = (ms: number) => new Date(ms).toISOString();
const ms = (v: unknown) => (v ? Date.parse(String(v)) || 0 : 0);

// ¿Lo pagado de coach_billing viene de Apple? Sí, si no va más allá de lo que cubre su suscripción
// de Apple. Si va más allá, lo pagó por la web (Mercado Pago o transferencia).
export function pagoDeApple(cur: any): boolean {
  const pagado = ms(cur.paid_until);
  return pagado > 0 && !!cur.apple_original_tx && ms(cur.apple_vence) > 0 && pagado <= ms(cur.apple_vence);
}

// Qué cambia en coach_billing con el estado de una suscripción de Apple. No toca lo de Mercado
// Pago (mp_*), la prueba ni el plan pedido. Aplicar dos veces lo mismo da lo mismo.
//   · Activa: el plan y el tope de alumnos son los del producto, y lo pagado llega hasta donde
//     cubre Apple (si lo pagado por la web llega más lejos, queda eso).
//   · Vencida o reembolsada: si lo pagado venía de Apple, queda hasta donde cubrió (en un
//     reembolso, hasta la fecha del reembolso); si venía de la web, no se toca.
//   · Cortesía: solo se anota la suscripción (el plan lo maneja el administrador).
//   · Si es otra suscripción de Apple que ya no es la del coach (una vieja que vence), nada.
export function cambiosBilling(cur: any, est: Estado, ahora: number): Record<string, unknown> {
  if (!est.activa && cur.apple_original_tx && cur.apple_original_tx !== est.otx) return {};
  const deApple = pagoDeApple(cur);
  const misma = cur.apple_original_tx === est.otx;
  const up: Record<string, unknown> = {
    apple_original_tx: est.otx,
    apple_vence: iso(est.hasta),
    apple_renueva: est.renueva === null ? (misma ? !!cur.apple_renueva : true) : est.renueva,
    updated_at: iso(ahora),
  };
  if (cur.plan === "cortesia") return up;
  if (est.activa) {
    up.plan = est.plan;
    up.max_clients = est.max;
    up.paid_until = !deApple && ms(cur.paid_until) > est.hasta ? cur.paid_until : iso(est.hasta);
  } else if (deApple || !cur.paid_until) {
    up.paid_until = iso(est.hasta);
  }
  return up;
}

// La suscripción pasó a otra cuenta de GIZE (la misma cuenta de Apple compró desde otra cuenta de
// GIZE: Apple la toma como un cambio de plan de la misma suscripción). La cuenta anterior la
// deja de tener: si su plan venía de esa suscripción, se corta ahora.
export function liberar(cur: any, otx: string, ahora: number): Record<string, unknown> {
  if (!cur || cur.apple_original_tx !== otx) return {};
  const up: Record<string, unknown> = { apple_original_tx: null, apple_vence: null, apple_renueva: false, updated_at: iso(ahora) };
  if (cur.plan !== "cortesia" && pagoDeApple(cur) && ms(cur.paid_until) > ahora) up.paid_until = iso(ahora);
  return up;
}

// La fila de public.apple_subs.
export function filaSub(est: Estado, userId: string, ahora: number): Record<string, unknown> {
  return {
    original_transaction_id: est.otx, user_id: userId, product_id: est.producto, transaction_id: est.txId,
    expires_at: iso(est.hasta), environment: est.entorno, revoked: est.revocada, auto_renew: est.renueva,
    signed_at: iso(est.firmado), updated_at: iso(ahora),
  };
}

// Avisos de App Store Server Notifications V2 que cambian la suscripción. Los demás (por ejemplo
// CONSUMPTION_REQUEST o PRICE_INCREASE) se contestan con 200 sin hacer nada.
export const AVISOS = new Set([
  "SUBSCRIBED", "DID_RENEW", "DID_CHANGE_RENEWAL_PREF", "DID_CHANGE_RENEWAL_STATUS", "DID_FAIL_TO_RENEW",
  "EXPIRED", "GRACE_PERIOD_EXPIRED", "REFUND", "REVOKE", "REFUND_REVERSED", "RENEWAL_EXTENDED", "OFFER_REDEEMED",
]);
