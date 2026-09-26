// Conversión y control de productos de supermercado para la base compartida de GIZE
// (tabla public.products). Lo usa scripts/importar-super.mjs; está aparte para poder probarlo.
const num = v => { const n = typeof v === "string" ? parseFloat(v.replace(",", ".")) : v; return typeof n === "number" && isFinite(n) ? n : null; };
const r1 = v => Math.round(v * 10) / 10;

// La tabla viene como texto con formato de diccionario de Python ({'clave': valor, ...}).
export function parseTabla(s){
  if (!s || typeof s !== "string") return null;
  try {
    return JSON.parse(s.replace(/'/g, '"').replace(/\bNone\b/g, "null").replace(/\bTrue\b/g, "true").replace(/\bFalse\b/g, "false"));
  } catch (e) { return null; }
}

// Tamaños y cantidades del envase que no van en el nombre ("580 Grs", "x 6 u.", "2x120g").
const SIZE = /\b(\d+\s*x\s*)?(x\s*)?\d+([.,]\d+)?\s*(grs?|gr\.|g|kg|kgs|ml|cc|l|lt|lts|litros?|un|u|unid|unidades|uni|sobres?)\b\.?/gi;
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function cleanName(name, brand){
  let n = String(name || "").replace(SIZE, " ").replace(/\s+x\s*\d*\s*$/i, "").replace(/[\s\-,.]+$/, "");
  const b = String(brand || "").trim();
  if (b){ const m = n.replace(new RegExp("\\s*\\b" + esc(b) + "\\s*$", "i"), "").trim(); if (m.length >= 2) n = m; }
  n = n.replace(/\s{2,}/g, " ").replace(/^[\s\-,.]+|[\s\-,.]+$/g, "");
  return n.charAt(0).toUpperCase() + n.slice(1);
}
export function cleanBrand(b){
  b = String(b || "").replace(/\s+/g, " ").trim();
  return b.length > 3 && b === b.toUpperCase() ? b.toLowerCase().replace(/(^|[\s\-&.])(\p{L})/gu, (m, a, c) => a + c.toUpperCase()) : b;
}

// Producto del supermercado → fila de products, o { skip: motivo }.
export function superToRow(p){
  const o = parseTabla(p.tabla);
  if (!o) return { skip: "sin tabla" };
  const code = String(p.ean || "").replace(/\D/g, "");
  if (code.length < 8 || code.length > 14) return { skip: "código" };
  if (code.length === 13 && /^2\d/.test(code)) return { skip: "código interno" };
  let k = num(o.energy_value);
  if (k != null && String(o.energy_unit_name || "").toLowerCase() === "kj") k = k / 4.184;
  const pr = num(o.protein_value), f = num(o.fat_total_value), fib = Math.max(0, num(o.fiber_value) || 0);
  let c = num(o.carb_value);
  if (k == null || pr == null || f == null) return { skip: "faltan valores" };
  // Muchas tablas no traen los carbohidratos: se sacan de las calorías (lo que no es proteína ni grasa).
  if (c == null){ c = (k - 4 * pr - 9 * f - 2 * fib) / 4; if (c < -1) return { skip: "faltan valores" }; c = Math.max(0, c); }
  const kcal = Math.round(k), P = r1(pr), C = r1(c), F = r1(f);
  if (Math.min(kcal, P, C, F) < 0 || kcal > 950 || P > 100 || C > 100 || F > 100 || P + C + F > 105) return { skip: "valores imposibles" };
  const base = 4 * P + 4 * C + 9 * F, tol = Math.max(20, base * 0.2);
  if (Math.abs(kcal - base) > tol && Math.abs(kcal - base - 2 * fib) > tol) return { skip: "calorías no cierran" };
  const name = cleanName(p.name, p.brand).slice(0, 120).trim();
  if (name.length < 2 || !/[a-záéíóúñ]/i.test(name)) return { skip: "nombre" };
  const brand = cleanBrand(p.brand).slice(0, 60).trim() || null;
  const pv = num(o.portion_value);
  return { code, name, brand, kcal, protein: P, carbs: C, fat: F, unit: o.basic_unit_name === "ml" ? "ml" : "g",
    portion: pv && pv >= 1 && pv <= 2000 ? Math.round(pv) : null };
}

const q = v => v == null ? "null" : typeof v === "number" ? String(v) : "'" + String(v).replace(/'/g, "''") + "'";
// Una tanda en una sola sentencia. Si el código ya está, se actualiza lo que vino de Open Food
// Facts o de una carga anterior de esta importación, sin tocar lo verificado, lo oculto ni lo
// que cargaron los usuarios.
export function batchSql(rows){
  const vals = rows.map(r => "(" + [r.code, r.name, r.brand, r.kcal, r.protein, r.carbs, r.fat, r.unit, r.portion, "gize"].map(q).join(",") + ")").join(",\n");
  return `with x as (insert into public.products (code, name, brand, kcal, protein, carbs, fat, unit, portion, source) values\n${vals}\n` +
    `on conflict (code) do update set name = excluded.name, brand = excluded.brand, kcal = excluded.kcal, protein = excluded.protein, ` +
    `carbs = excluded.carbs, fat = excluded.fat, unit = excluded.unit, portion = excluded.portion, source = 'gize' ` +
    `where products.source in ('off', 'gize') and not products.verified and not products.hidden ` +
    `returning (xmax = 0) as nuevo)\nselect count(*) filter (where nuevo) as nuevos, count(*) filter (where not nuevo) as actualizados from x;`;
}
