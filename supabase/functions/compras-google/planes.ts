// Productos de Google Play (suscripciones mensuales de la app de Android) y el plan de GIZE que da
// cada uno. Son los MISMOS IDs que en el App Store (supabase/functions/compras-apple/planes.ts), con
// un solo plan base «mensual» en cada uno (android/.../GizeComprasPlugin.java, PLAN_BASE):
// tests/compras-google.test.mjs controla que las listas sean iguales. Si se agrega o cambia un
// plan, cambiarlo en los dos lados (y en la app) y crear la suscripción en Play Console con el ID
// exacto (docs/GOOGLE-PLAY-COMPRAS.md).
//
// No vive en un solo archivo porque cada función solo puede usar archivos de supabase/functions
// (Supabase publica esa carpeta) y la app solo los de app/ (lo que se empaqueta en el celular).

export const PRODUCTOS_GOOGLE: Record<string, { plan: string; max: number }> = {
  "ar.com.gize.app.coach.p10": { plan: "p10", max: 10 },
  "ar.com.gize.app.coach.p25": { plan: "p25", max: 25 },
  "ar.com.gize.app.coach.p50": { plan: "p50", max: 50 },
  "ar.com.gize.app.coach.p100": { plan: "p100", max: 100 },
  "ar.com.gize.app.coach.p250": { plan: "p250", max: 250 },
  "ar.com.gize.app.coach.p500": { plan: "p500", max: 500 },
};

// IA Plus (supabase/ia.sql → ia_plus, columnas google_*): la foto del plato sin el límite semanal.
// Lo puede comprar cualquier cuenta, no solo los coaches, y va aparte del plan de coach.
export const IA_PLUS_GOOGLE = "ar.com.gize.app.iaplus.mensual";

// El plan base de cada suscripción en Play Console (el mismo ID en todas).
export const PLAN_BASE = "mensual";
