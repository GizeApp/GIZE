// Producto de Open Food Facts → fila de public.products, o { skip: motivo } si no sirve.
// Son las mismas reglas que la importación mensual (offToRow en scripts/off-import-lib.mjs) y
// los mismos límites que la tabla (supabase/productos.sql): nombre de 2 a 120 letras, calorías
// de 0 a 950, macros de 0 a 100 que no pasen de 105 entre los tres, y calorías que cierren con
// los macros. Si se cambia una, cambiar la otra (tests/productos-off.test.mjs compara las dos).
// Está aparte de index.ts para poder probarlo sin Deno.

export type OffProduct = {
  code?: unknown;
  product_name?: unknown;
  product_name_es?: unknown;
  generic_name_es?: unknown;
  brands?: unknown;
  quantity?: unknown;
  serving_quantity?: unknown;
  nutrition_data_per?: unknown;
  unique_scans_n?: unknown;
  nutriments?: Record<string, unknown> | null;
};
export type ProductRow = {
  code: string; name: string; brand: string | null; kcal: number; protein: number; carbs: number; fat: number;
  unit: "g" | "ml"; portion: number | null; scans: number;
};

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? parseFloat(v.replace(",", ".")) : v;
  return typeof n === "number" && isFinite(n) ? n : null;
};
const r1 = (v: number) => Math.round(v * 10) / 10;

export function offToRow(p: OffProduct): ProductRow | { skip: string } {
  const code = String(p.code || "").replace(/\D/g, "");
  if (code.length < 8 || code.length > 14) return { skip: "código" };
  // 20–29: códigos internos de cada comercio (productos pesados en el local), no sirven.
  if (code.length === 13 && /^2\d/.test(code)) return { skip: "código interno" };
  const name = String(p.product_name_es || p.product_name || p.generic_name_es || "").replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 120 || !/[a-záéíóúñ]/i.test(name)) return { skip: "nombre" };
  const n = p.nutriments || {};
  let kcal = num(n["energy-kcal_100g"]);
  const kj = num(n["energy_100g"]);
  if (kcal == null && kj != null) kcal = kj / 4.184; // viene en kJ
  let pr = num(n.proteins_100g), c = num(n.carbohydrates_100g), f = num(n.fat_100g);
  if (kcal == null || pr == null || c == null || f == null) return { skip: "tabla incompleta" };
  kcal = Math.round(kcal); pr = r1(pr); c = r1(c); f = r1(f);
  // Los mismos límites que la tabla (con los valores ya redondeados, para que no falle la carga).
  if (kcal < 0 || kcal > 950 || pr < 0 || c < 0 || f < 0 || pr > 100 || c > 100 || f > 100 || pr + c + f > 105) return { skip: "valores imposibles" };
  // Las calorías tienen que cerrar con los macros (4/4/9), contando alcohol (7) y fibra (2).
  const base = pr * 4 + c * 4 + f * 9, alc = Math.max(0, num(n.alcohol_100g) || 0), fib = Math.max(0, num(n.fiber_100g) || 0);
  const ok = (k: number) => Math.abs((kcal as number) - k) <= Math.max(40, k * 0.3);
  if (!ok(base) && !ok(base + alc * 7 + fib * 2)) return { skip: "calorías no cierran" };
  const brand = String(p.brands || "").split(",")[0].replace(/\s+/g, " ").trim().slice(0, 60).trim();
  const isMl = /\b(ml|cl|l|lt|lts|litros?|cc)\b/i.test(String(p.quantity || "")) || /ml/i.test(String(p.nutrition_data_per || ""));
  const serving = num(p.serving_quantity);
  return { code, name, brand: brand || null, kcal, protein: pr, carbs: c, fat: f,
    unit: isMl ? "ml" : "g", portion: serving && serving >= 1 && serving <= 2000 ? Math.round(serving) : null,
    scans: Math.max(0, Math.min(2e9, Math.round(num(p.unique_scans_n) || 0))) };
}
