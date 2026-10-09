// Reglas de las suscripciones de Mercado Pago (función suscripcion). Están aparte de index.ts
// para poder probarlas sin Deno (tests/suscripcion-cobros.test.mjs).
// cur: la fila de coach_billing. mp_preapproval_id es la suscripción vigente y mp_pending_id la
// última que pidió el coach (un cambio de plan) y todavía no cobró.

type Bill = { mp_preapproval_id?: string | null; mp_pending_id?: string | null };

// Solo cuentan la vigente y la que pidió el coach: otra autorizada (un checkout viejo que igual
// pagó, dos toques seguidos en "pagar") se da de baja.
export function esPedida(cur: Bill, id: string): boolean {
  return id === cur.mp_preapproval_id || id === cur.mp_pending_id;
}

// ¿Se manda el mail a los socios por este estado de la suscripción `id`? Solo para la vigente
// (cancelada, pausada…) o para la pedida cuando se autoriza («Suscripción nueva»). Antes salía
// para cualquiera: un coach que apretaba «pagar» muchas veces sin pagar generaba un mail de
// «Suscripción cancelada» por cada checkout que se daba de baja.
export function avisaSocios(cur: Bill, id: string, status: string): boolean {
  return id === cur.mp_preapproval_id || (status === "authorized" && id === cur.mp_pending_id);
}

// Qué se guarda cuando Mercado Pago cobró la suscripción `id` (la vigente o la pedida), y cuál
// se da de baja. El cambio de plan pendiente se borra solo si lo que cobró es justamente el
// pendiente: un cobro de la vigente (la renovación del mes, un reintento) lo borraba, y cuando
// después se pagaba el plan nuevo se lo daba de baja por «no pedido» y el coach se quedaba con
// el plan viejo.
export function alCobrar(cur: Bill, id: string, plan: string, max: number, paidUntil: Date, now = new Date()) {
  const update: Record<string, unknown> = {
    plan, max_clients: max, mp_preapproval_id: id, mp_status: "authorized",
    paid_until: paidUntil.toISOString(), updated_at: now.toISOString(),
  };
  if (id === cur.mp_pending_id) { update.pending_plan = null; update.mp_pending_id = null; }
  // Si cambió de plan, la anterior se da de baja recién ahora que la nueva cobró.
  const cancelar = cur.mp_preapproval_id && cur.mp_preapproval_id !== id ? cur.mp_preapproval_id : null;
  return { update, cancelar };
}
