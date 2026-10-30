// Reglas de las suscripciones de Google Play (función compras-google). Están aparte de index.ts para
// probarlas sin Deno (tests/compras-google.test.mjs). Son el espejo de compras-apple/reglas.ts.
//
// sub: lo que devuelve la API de Google Play Developer para una compra (SubscriptionPurchaseV2,
// purchases.subscriptionsv2.get). Las fechas de Google vienen como texto (RFC 3339).
// Nunca se confía en lo que manda la app: solo en lo que dice esa lectura.

import { IA_PLUS_GOOGLE, PRODUCTOS_GOOGLE } from "./planes.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// Un código de compra de Google (purchaseToken): letras, números, «.», «_» y «-», largo acotado
// (como TOKEN del plugin de Android). Va en la dirección de la API, así que nada más que eso.
export const TOKEN = /^[A-Za-z0-9._-]{10,1000}$/;
export const tokenValido = (t: unknown) => typeof t === "string" && TOKEN.test(t);

// El estado de Google (subscriptionState) y cómo se llama en google_subs.
export const ESTADOS: Record<string, string> = {
  SUBSCRIPTION_STATE_ACTIVE: "activa",
  SUBSCRIPTION_STATE_IN_GRACE_PERIOD: "gracia",
  SUBSCRIPTION_STATE_ON_HOLD: "espera",
  SUBSCRIPTION_STATE_PAUSED: "pausada",
  SUBSCRIPTION_STATE_CANCELED: "cancelada",
  SUBSCRIPTION_STATE_EXPIRED: "vencida",
  SUBSCRIPTION_STATE_PENDING: "pendiente",
  SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED: "pendiente_cancelada",
};
// Dan el plan (o IA Plus) mientras no venzan: activa, en período de gracia (Google sigue
// intentando cobrar) o cancelada (no se renueva, pero lo pagado sigue hasta el vencimiento).
const DAN = ["activa", "gracia", "cancelada"];
// Se pueden renovar solas (son las que hay que cancelar al borrar la cuenta).
export const RENUEVAN = ["activa", "gracia", "espera", "pausada"];

const esDeGize = (id: unknown) => typeof id === "string" && (!!PRODUCTOS_GOOGLE[id] || id === IA_PLUS_GOOGLE);
const lineasDeGize = (sub: any): any[] => (sub && Array.isArray(sub.lineItems) ? sub.lineItems : []).filter((l: any) => l && esDeGize(l.productId));
const ms = (v: unknown) => (v ? Date.parse(String(v)) || 0 : 0);

// La línea vigente de la compra: de las de GIZE, la ya pagada (latestSuccessfulOrderId) que llega
// más lejos; si ninguna está pagada todavía (una compra pendiente), la que llega más lejos.
export function itemVigente(sub: any): any | null {
  const lineas = lineasDeGize(sub);
  const pagadas = lineas.filter((l) => l.latestSuccessfulOrderId);
  const de = pagadas.length ? pagadas : lineas;
  let mejor: any = null;
  for (const l of de) if (!mejor || ms(l.expiryTime) > ms(mejor.expiryTime)) mejor = l;
  return mejor;
}

// Lo que tiene que cumplir cualquier compra, venga de la app o de un aviso. "" si está bien; si no,
// el motivo (para los registros).
export function revisarSub(sub: any): string {
  if (!sub || typeof sub !== "object") return "sin datos";
  const estado = ESTADOS[String(sub.subscriptionState || "")];
  if (!estado) return "estado desconocido";
  const lineas = lineasDeGize(sub);
  if (!lineas.length) return "producto desconocido";
  // Un plan de coach e IA Plus van siempre en compras separadas.
  const plus = lineas.filter((l) => l.productId === IA_PLUS_GOOGLE).length;
  if (plus && plus !== lineas.length) return "mezcla planes e IA Plus";
  const item = itemVigente(sub);
  if (!estado.startsWith("pendiente") && !ms(item && item.expiryTime)) return "sin vencimiento";
  return "";
}

// La cuenta de GIZE que compró: la app pasa el id del usuario como obfuscatedAccountId al comprar.
// Si se volvió a suscribir desde Play Store (fuera de la app), viene en outOfAppPurchaseContext.
export function cuentaDe(sub: any): string | null {
  const a = sub && sub.externalAccountIdentifiers && sub.externalAccountIdentifiers.obfuscatedExternalAccountId;
  const b = sub && sub.outOfAppPurchaseContext && sub.outOfAppPurchaseContext.expiredExternalAccountIdentifiers &&
    sub.outOfAppPurchaseContext.expiredExternalAccountIdentifiers.obfuscatedExternalAccountId;
  for (const v of [a, b]) {
    const t = String(v || "").toLowerCase();
    if (UUID.test(t)) return t;
  }
  return null;
}

// Otras compras de las que puede salir la cuenta, si la compra no la trae: la que reemplazó (cambio
// de plan) y la vencida de la que viene (volvió a suscribirse desde Play Store).
export function tokensRelacionados(sub: any): string[] {
  const out: string[] = [];
  const v = sub && sub.outOfAppPurchaseContext && sub.outOfAppPurchaseContext.expiredPurchaseToken;
  for (const t of [sub && sub.linkedPurchaseToken, v]) if (tokenValido(t) && !out.includes(t)) out.push(t);
  return out;
}

export type Estado = {
  token: string; producto: string; plan: string; max: number; plus: boolean;
  estado: string;           // como en google_subs.estado
  vence: number;            // el vencimiento que dice Google (0 si todavía no tiene: pendiente)
  hasta: number;            // hasta cuándo cubre (si ya no da el plan, a lo sumo ahora)
  activa: boolean;          // da el plan (o IA Plus) ahora
  pendiente: boolean;       // pago pendiente (efectivo, aprobación familiar): no da nada todavía
  revocada: boolean;        // Google la reembolsó o la anuló
  renueva: boolean;         // da el plan y se va a renovar sola (para coach_billing e ia_plus)
  autoRenueva: boolean;     // Google la va a renovar sola (también en espera o en pausa)
  prueba: boolean;          // compra de prueba (cuentas de licencias de Google: no pagan)
  reconocida: boolean;      // ya reconocida (acknowledge)
  orden: string | null;     // el número del pedido (GPA.…)
  linked: string | null;    // la compra que esta reemplazó
  leido: number;            // cuándo se leyó de Google: lo más nuevo gana
};

// ¿Es IA Plus? (si no, es un plan de coach)
export const esPlus = (sub: any) => { const i = itemVigente(sub); return !!i && i.productId === IA_PLUS_GOOGLE; };

// leido: cuándo se leyó la compra de la API (también es el «ahora» con el que se decide si da el
// plan). revocada: lo dice el aviso que se está atendiendo (compra anulada o revocada). Los demás
// avisos y los pedidos de la app no la pasan: manda lo que diga la API, y Google pasa a vencida
// (SUBSCRIPTION_STATE_EXPIRED) la compra que revoca. En google_subs, revoked no se borra (index.ts →
// guardarSub).
export function estadoDe(token: string, sub: any, leido: number, revocada = false): Estado {
  const item = itemVigente(sub) || {};
  const producto = String(item.productId || "");
  const prod = PRODUCTOS_GOOGLE[producto] || { plan: "iaplus", max: 0 };
  const estado = ESTADOS[String(sub.subscriptionState || "")] || "vencida";
  const vence = ms(item.expiryTime);
  const activa = !revocada && DAN.includes(estado) && vence > leido;
  const hasta = !vence ? 0 : activa ? vence : Math.min(vence, leido);
  const auto = !revocada && RENUEVAN.includes(estado) && !!(item.autoRenewingPlan && item.autoRenewingPlan.autoRenewEnabled);
  return {
    token, producto, plan: prod.plan, max: prod.max, plus: producto === IA_PLUS_GOOGLE,
    estado, vence, hasta, activa, pendiente: estado.startsWith("pendiente"), revocada,
    renueva: activa && auto && (estado === "activa" || estado === "gracia"),
    autoRenueva: auto,
    prueba: !!sub.testPurchase,
    reconocida: sub.acknowledgementState === "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
    orden: item.latestSuccessfulOrderId ? String(item.latestSuccessfulOrderId).slice(0, 100) : null,
    linked: tokenValido(sub.linkedPurchaseToken) ? sub.linkedPurchaseToken : null,
    leido,
  };
}

// IA Plus de prueba (las cuentas de licencias de Google no pagan): solo para las cuentas de la lista
// del panel (IA → IA Plus → «Compras de prueba de Apple y Google Play», ia_config.plus.sandbox:
// mails), como con Apple. Si no, cualquier tester tendría IA Plus gratis, con gasto de IA de verdad.
// Los planes de coach de prueba valen para cualquier tester (los elige el dueño en Play Console).
export function pruebaPlusOk(est: Estado, mail: string | null, lista: unknown): boolean {
  if (!est.prueba) return true;
  const m = String(mail || "").trim().toLowerCase();
  return !!m && Array.isArray(lista) && lista.some((x) => String(x || "").trim().toLowerCase() === m);
}

const iso = (n: number) => new Date(n).toISOString();

// ¿Lo pagado de coach_billing viene de Google? Sí, si no va más allá de lo que cubre su suscripción
// de Google Play. Si va más allá, lo pagó por la web o con Apple.
export function pagoDeGoogle(cur: any): boolean {
  const pagado = ms(cur.paid_until);
  return pagado > 0 && !!cur.google_token && ms(cur.google_vence) > 0 && pagado <= ms(cur.google_vence);
}

// Qué cambia en coach_billing con el estado de una suscripción de Google Play. No toca lo de Mercado
// Pago (mp_*) ni lo de Apple (apple_*), la prueba ni el plan pedido. Aplicar dos veces lo mismo da
// lo mismo.
//   · Activa: el plan y el tope de alumnos son los del producto, y lo pagado llega hasta donde
//     cubre Google (si lo pagado por la web o con Apple llega más lejos, queda eso).
//   · Vencida, en espera, en pausa o reembolsada: si lo pagado venía de Google, queda hasta donde
//     cubrió (a lo sumo ahora), pero nunca por debajo de una suscripción de Apple vigente; si venía
//     de la web o de Apple, no se toca.
//   · Cortesía: solo se anota la suscripción (el plan lo maneja el administrador).
//   · Si es otra compra de Google que ya no es la del coach (una vieja o reemplazada que vence), nada.
export function cambiosBilling(cur: any, est: Estado, ahora: number): Record<string, unknown> {
  if (!est.activa && cur.google_token && cur.google_token !== est.token) return {};
  const deGoogle = pagoDeGoogle(cur);
  const up: Record<string, unknown> = {
    google_token: est.token, google_vence: iso(est.hasta), google_renueva: est.renueva, updated_at: iso(ahora),
  };
  if (cur.plan === "cortesia") return up;
  if (est.activa) {
    up.plan = est.plan;
    up.max_clients = est.max;
    up.paid_until = !deGoogle && ms(cur.paid_until) > est.hasta ? cur.paid_until : iso(est.hasta);
  } else if (deGoogle || !cur.paid_until) {
    const apple = cur.apple_original_tx && ms(cur.apple_vence) > ahora ? ms(cur.apple_vence) : 0;
    up.paid_until = iso(Math.max(est.hasta, apple));
  }
  return up;
}

// La compra de Google que tenía otra cuenta de GIZE la reemplazó una compra nueva de esta cuenta
// (cambió de plan desde otra cuenta de GIZE con la misma cuenta de Google): la anterior la deja de
// tener. Si su plan venía de esa compra, se corta ahora.
export function liberar(cur: any, token: string, ahora: number): Record<string, unknown> {
  if (!cur || cur.google_token !== token) return {};
  const up: Record<string, unknown> = { google_token: null, google_vence: null, google_renueva: false, updated_at: iso(ahora) };
  if (cur.plan !== "cortesia" && pagoDeGoogle(cur) && ms(cur.paid_until) > ahora) up.paid_until = iso(ahora);
  return up;
}

// Qué cambia en ia_plus (IA Plus comprado con Google Play): solo las columnas google_*. Lo de Mercado
// Pago, Apple y lo dado a mano no se tocan (gana lo que llegue más lejos, ver ia_plus_hasta en
// supabase/ia.sql). Una compra vieja o reemplazada que vence no pisa la vigente. Aplicar dos veces
// lo mismo da lo mismo.
export function cambiosPlus(cur: any, est: Estado, ahora: number): Record<string, unknown> {
  if (cur && !est.activa && cur.google_token && cur.google_token !== est.token) return {};
  return { google_token: est.token, google_vence: iso(est.hasta), google_renueva: est.renueva, updated_at: iso(ahora) };
}
// La de IA Plus pasó a otra cuenta de GIZE: la anterior la deja de tener.
export function liberarPlus(cur: any, token: string, ahora: number): Record<string, unknown> {
  if (!cur || cur.google_token !== token) return {};
  return { google_token: null, google_vence: null, google_renueva: false, updated_at: iso(ahora) };
}

// La fila de public.google_subs. «reemplazada» no va: la pone la compra que la reemplaza y no se
// borra. Un reembolso tampoco se borra (una vez revocada, queda revocada).
export function filaSub(est: Estado, userId: string, ahora: number): Record<string, unknown> {
  return {
    purchase_token: est.token, user_id: userId, product_id: est.producto, order_id: est.orden,
    linked_token: est.linked, estado: est.estado, expires_at: est.hasta ? iso(est.hasta) : null,
    auto_renew: est.autoRenueva, test: est.prueba, revoked: est.revocada, acknowledged: est.reconocida,
    leido_at: iso(est.leido), updated_at: iso(ahora),
  };
}

// Lo que dice un aviso de Google Play (Real-time developer notifications, por Pub/Sub), ya
// decodificado. Devuelve qué hacer:
//   { tipo: "prueba" }                         el mensaje de prueba de Play Console
//   { tipo: "suscripcion", token, revocada }   cambió una suscripción: volver a leerla
//   { tipo: "anulada", token }                 compra de suscripción anulada (reembolso): revocada
//   { tipo: "ignorar", motivo }                de otra app, de un producto único, u otra cosa
// SUBSCRIPTION_REVOKED (12): Google la revocó antes del vencimiento (reembolso con revocación).
export function leerAviso(n: any, paquete: string): { tipo: string; token?: string; revocada?: boolean; motivo?: string } {
  if (!n || typeof n !== "object") return { tipo: "ignorar", motivo: "sin datos" };
  if (n.packageName !== paquete) return { tipo: "ignorar", motivo: "otra app" };
  if (n.testNotification) return { tipo: "prueba" };
  const s = n.subscriptionNotification;
  if (s && typeof s === "object") {
    if (!tokenValido(s.purchaseToken)) return { tipo: "ignorar", motivo: "sin código de compra" };
    return { tipo: "suscripcion", token: s.purchaseToken, revocada: Number(s.notificationType) === 12 };
  }
  const v = n.voidedPurchaseNotification;
  if (v && typeof v === "object") {
    if (Number(v.productType) !== 1) return { tipo: "ignorar", motivo: "compra única anulada" };
    if (!tokenValido(v.purchaseToken)) return { tipo: "ignorar", motivo: "sin código de compra" };
    return { tipo: "anulada", token: v.purchaseToken, revocada: true };
  }
  return { tipo: "ignorar", motivo: "otro aviso" };
}
