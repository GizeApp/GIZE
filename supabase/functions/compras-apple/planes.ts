// Productos del App Store (suscripciones mensuales del grupo «Plan de coach») y el plan de GIZE
// que da cada uno. Es la misma lista que app/core/compras-apple.js (la app la usa para pedirle a
// Apple los precios): tests/compras-apple.test.mjs controla que las dos sean iguales. Si se agrega
// o cambia un plan, cambiarlo en los dos lados y crear el producto en App Store Connect con el ID
// exacto (docs/APPLE-COMPRAS.md).
//
// No vive en un solo archivo porque la función solo puede usar archivos de supabase/functions
// (Supabase publica esa carpeta) y la app solo los de app/ (lo que se empaqueta en el iPhone).

export const PRODUCTOS_APPLE: Record<string, { plan: string; max: number }> = {
  "ar.com.gize.app.coach.p10": { plan: "p10", max: 10 },
  "ar.com.gize.app.coach.p25": { plan: "p25", max: 25 },
  "ar.com.gize.app.coach.p50": { plan: "p50", max: 50 },
  "ar.com.gize.app.coach.p100": { plan: "p100", max: 100 },
  "ar.com.gize.app.coach.p250": { plan: "p250", max: 250 },
  "ar.com.gize.app.coach.p500": { plan: "p500", max: 500 },
};
