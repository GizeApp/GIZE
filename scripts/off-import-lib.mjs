// Conversión y control de productos de Open Food Facts para la base compartida de GIZE
// (tabla public.products). Lo usa scripts/importar-off.mjs; está aparte para poder probarlo.
const num = v => { const n = typeof v === "string" ? parseFloat(v.replace(",", ".")) : v; return typeof n === "number" && isFinite(n) ? n : null; };
const r1 = v => Math.round(v * 10) / 10;

// Producto de OFF → fila de products, o { skip: motivo }.
export function offToRow(p){
  const code = String(p.code || "").replace(/\D/g, "");
  if (code.length < 8 || code.length > 14) return { skip: "código" };
  // 20–29: códigos internos de cada comercio (productos pesados en el local), no sirven.
  if (code.length === 13 && /^2\d/.test(code)) return { skip: "código interno" };
  const name = String(p.product_name_es || p.product_name || p.generic_name_es || "").replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 120 || !/[a-záéíóúñ]/i.test(name)) return { skip: "nombre" };
  const n = p.nutriments || {};
  let kcal = num(n["energy-kcal_100g"]);
  if (kcal == null && num(n["energy_100g"]) != null) kcal = num(n["energy_100g"]) / 4.184; // viene en kJ
  let pr = num(n.proteins_100g), c = num(n.carbohydrates_100g), f = num(n.fat_100g);
  if (kcal == null || pr == null || c == null || f == null) return { skip: "tabla incompleta" };
  kcal = Math.round(kcal); pr = r1(pr); c = r1(c); f = r1(f);
  // Los mismos límites que la tabla (con los valores ya redondeados, para que no falle la carga).
  if (kcal < 0 || kcal > 950 || pr < 0 || c < 0 || f < 0 || pr > 100 || c > 100 || f > 100 || pr + c + f > 105) return { skip: "valores imposibles" };
  // Las calorías tienen que cerrar con los macros (4/4/9), contando alcohol (7) y fibra (2).
  const base = pr * 4 + c * 4 + f * 9, alc = Math.max(0, num(n.alcohol_100g) || 0), fib = Math.max(0, num(n.fiber_100g) || 0);
  const ok = k => Math.abs(kcal - k) <= Math.max(40, k * 0.3);
  if (!ok(base) && !ok(base + alc * 7 + fib * 2)) return { skip: "calorías no cierran" };
  const brand = String(p.brands || "").split(",")[0].replace(/\s+/g, " ").trim().slice(0, 60).trim();
  const isMl = /\b(ml|cl|l|lt|lts|litros?|cc)\b/i.test(String(p.quantity || "")) || /ml/i.test(String(p.nutrition_data_per || ""));
  const serving = num(p.serving_quantity);
  return { code, name, brand: brand || null, kcal, protein: pr, carbs: c, fat: f,
    unit: isMl ? "ml" : "g", portion: serving && serving >= 1 && serving <= 2000 ? Math.round(serving) : null,
    scans: Math.max(0, Math.min(2e9, Math.round(num(p.unique_scans_n) || 0))) };
}

const q = v => v == null ? "null" : typeof v === "number" ? String(v) : "'" + String(v).replace(/'/g, "''") + "'";
// Una tanda en una sola sentencia; devuelve cuántos entraron nuevos y cuántos se actualizaron.
// Si el código ya está, se actualiza solo lo que vino de OFF antes y nadie verificó ni ocultó
// (lo que cargaron los usuarios y lo revisado a mano no se toca). Un código que borró un
// administrador no se vuelve a cargar: lo saltea la base (products_deleted_guard, ver
// supabase/productos-admin.sql) y no cuenta como nuevo.
export function batchSql(rows){
  const vals = rows.map(r => "(" + [r.code, r.name, r.brand, r.kcal, r.protein, r.carbs, r.fat, r.unit, r.portion, r.scans || 0, "off"].map(q).join(",") + ")").join(",\n");
  return `with x as (insert into public.products (code, name, brand, kcal, protein, carbs, fat, unit, portion, scans, source) values\n${vals}\n` +
    `on conflict (code) do update set name = excluded.name, brand = excluded.brand, kcal = excluded.kcal, protein = excluded.protein, ` +
    `carbs = excluded.carbs, fat = excluded.fat, unit = excluded.unit, portion = excluded.portion, scans = excluded.scans ` +
    `where products.source = 'off' and not products.verified and not products.hidden ` +
    `returning (xmax = 0) as nuevo)\nselect count(*) filter (where nuevo) as nuevos, count(*) filter (where not nuevo) as actualizados from x;`;
}

// Todo en un archivo (para probar en una base local con psql).
export function rowsToSql(rows, batch = 500){
  const out = ["begin;"];
  for (let i = 0; i < rows.length; i += batch) out.push(batchSql(rows.slice(i, i + batch)));
  out.push("commit;");
  return out.join("\n");
}
