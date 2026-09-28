// Open Food Facts (https://world.openfoodfacts.org): base abierta y gratuita con más de
// 3 millones de productos de marca, cargados por la comunidad (licencia ODbL). Se usa
// para lo que no está en la base propia: productos envasados buscados por nombre o por
// código de barras. Primero se buscan los vendidos en Argentina y, si hay pocos, se
// completa con el resto del mundo.
//
// Todo se pide desde el celular del usuario (la API permite CORS). Si no hay internet
// o la API no responde, la app sigue con la base propia.

const API = "https://world.openfoodfacts.org";
const FIELDS = "code,product_name,product_name_es,generic_name_es,brands,quantity,serving_quantity,nutriments,nutrition_data_per";

const cache = new Map();

function num(v){ const n = parseFloat(v); return isFinite(n) ? n : null; }
const r1 = v => Math.round(v * 10) / 10;

// Producto de OFF → alimento de la app (valores cada 100 g/ml). Devuelve null si no
// tiene lo mínimo para calcular (nombre y calorías o macros).
export function offToFood(p){
  if (!p) return null;
  const n = p.nutriments || {};
  const name = String(p.product_name_es || p.product_name || p.generic_name_es || "").trim();
  if (!name) return null;
  let kcal = num(n["energy-kcal_100g"]);
  if (kcal == null && num(n["energy_100g"]) != null) kcal = num(n["energy_100g"]) / 4.184; // viene en kJ
  const pr = num(n["proteins_100g"]), c = num(n["carbohydrates_100g"]), f = num(n["fat_100g"]);
  if (kcal == null && pr == null && c == null && f == null) return null;
  if (kcal == null) kcal = (pr || 0) * 4 + (c || 0) * 4 + (f || 0) * 9;
  const brand = String(p.brands || "").split(",")[0].trim();
  const isMl = /\bml\b|\bl\b|litro|cc\b/i.test(String(p.quantity || "")) || /ml/i.test(String(p.nutrition_data_per || ""));
  const serving = num(p.serving_quantity);
  return {
    name: brand && name.toLowerCase().indexOf(brand.toLowerCase()) < 0 ? name + " · " + brand : name,
    kcal: Math.round(kcal), p: r1(pr || 0), c: r1(c || 0), f: r1(f || 0),
    portion: serving && serving > 0 && serving < 2000 ? Math.round(serving) : 100,
    unit: isMl ? "ml" : "g",
    src: "OFF", code: String(p.code || "")
  };
}

async function getJSON(url, signal){
  const r = await fetch(url, { signal, headers: { "Accept": "application/json" } });
  if (!r.ok) throw new Error("Open Food Facts respondió " + r.status);
  return r.json();
}

function searchUrl(q, country){
  const u = new URL(API + "/cgi/search.pl");
  u.searchParams.set("search_terms", q);
  u.searchParams.set("search_simple", "1");
  u.searchParams.set("action", "process");
  u.searchParams.set("json", "1");
  u.searchParams.set("page_size", "24");
  u.searchParams.set("sort_by", "unique_scans_n"); // los más escaneados (más conocidos) primero
  u.searchParams.set("fields", FIELDS);
  if (country){
    u.searchParams.set("tagtype_0", "countries");
    u.searchParams.set("tag_contains_0", "contains");
    u.searchParams.set("tag_0", country);
  }
  return u.toString();
}

// Busca por nombre. Devuelve alimentos ya convertidos, sin repetidos.
export async function searchOFF(q, signal){
  const key = q.trim().toLowerCase();
  if (key.length < 3) return [];
  if (cache.has(key)) return cache.get(key);
  const out = [], seen = new Set();
  const add = list => (list || []).forEach(p => {
    const f = offToFood(p); if (!f) return;
    const k = f.code || f.name.toLowerCase(); if (seen.has(k)) return;
    seen.add(k); out.push(f);
  });
  const ar = await getJSON(searchUrl(key, "argentina"), signal);
  add(ar.products);
  if (out.length < 8){
    const world = await getJSON(searchUrl(key, null), signal);
    add(world.products);
  }
  const res = out.slice(0, 30);
  cache.set(key, res);
  return res;
}

// Busca un producto por su código de barras (EAN-13, EAN-8, UPC). null si no existe.
export async function productByCode(code, signal){
  const c = String(code || "").replace(/\D/g, "");
  if (c.length < 6) return null;
  // Un código que no está en Open Food Facts responde 404 (con status 0): es "no lo tienen",
  // no un error de conexión. Antes se avisaba "¿sin conexión?" en vez de ofrecer cargarlo.
  const r = await fetch(API + "/api/v2/product/" + c + ".json?fields=" + FIELDS, { signal, headers: { "Accept": "application/json" } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("Open Food Facts respondió " + r.status);
  const j = await r.json();
  if (!j || j.status !== 1 || !j.product) return null;
  return offToFood(Object.assign({ code: c }, j.product));
}
