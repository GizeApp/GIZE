// Trae los productos de supermercado (pan lactal de cada marca, galletitas, lácteos, fiambres,
// congelados…) con su tabla nutricional y los suma a la base compartida de GIZE
// (public.products), con su código de barras: salen en el buscador y al escanear.
// Lo corre el workflow "Importar productos de supermercado" (.github/workflows/importar-super.yml).
//   node scripts/importar-super.mjs --out filas.json   solo arma la lista (para probar local)
//   node scripts/importar-super.mjs --apply            carga en Supabase por tandas
//                                                      (usa PROJECT_REF y SUPABASE_ACCESS_TOKEN)
// La fuente es el catálogo público de un supermercado argentino (tienda VTEX), que publica la
// tabla de cada producto como texto. El log de Actions es público: solo se imprimen cantidades.
import { writeFileSync } from "node:fs";
import { batchSql, superToRow } from "./super-import-lib.mjs";

const has = k => process.argv.includes(k);
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg("--out", ""), APPLY = has("--apply");
const sleep = ms => new Promise(r => setTimeout(r, ms));
if (!OUT && !APPLY){ console.error("Uso: --out archivo.json o --apply"); process.exit(1); }

const HOST = "https://www.jumbo.com.ar";
// Secciones de comida y bebida sin alcohol (se deja afuera lo que no suma calorías o no tiene tabla).
const TOP = new Set(["Almacén", "Bebidas", "Frutas y Verduras", "Carnes", "Pescados y Mariscos", "Quesos y Fiambres", "Lácteos", "Congelados", "Panaderia y Pasteleria", "Rotiseria"]);
const SKIP = new Set(["Aguas", "Hielo", "Carbón y Leña", "Bebidas Blancas", "Whiskys", "Vodka ll", "Licores", "Vinos", "Espumantes", "Generosos",
  "Varios espumantes", "Sidras", "Aperitivos", "Sal, Pimienta y Especias", "Mesa Dulce Navideña", "Cajas Navidenas", "Especias y Hierbas Aromáticas", "A Base de Hierbas"]);

const get = async u => {
  for (let t = 0; t < 5; t++){
    try {
      const r = await fetch(u, { headers: { "User-Agent": "GIZE/1.0 (https://gize.ar - soporte@gize.ar)" } });
      if (r.ok) return await r.json();
      if (r.status === 404) return null;
    } catch (e) {}
    await sleep(3000 * (t + 1));
  }
  return null;
};
// El buscador de la tienda entrega hasta 2500 productos por consulta, de a 50.
async function crawl(path){
  const out = [];
  for (let from = 0; from < 2500; from += 50){
    const d = await get(`${HOST}/api/catalog_system/pub/products/search?fq=C:${path}&_from=${from}&_to=${from + 49}`);
    if (!Array.isArray(d)) break;
    out.push(...d);
    if (d.length < 50) break;
    await sleep(150);
  }
  return out;
}

// ---- 1. Recorrer las categorías ----
const tree = await get(`${HOST}/api/catalog_system/pub/category/tree/3`);
if (!Array.isArray(tree)){ console.error("La tienda no respondió"); process.exit(1); }
const cats = [];
for (const t of tree){
  if (!TOP.has(t.name)) continue;
  for (const c of t.children || []){
    if (SKIP.has(c.name)) continue;
    cats.push({ path: `/${t.id}/${c.id}/`, subs: (c.children || []).map(g => `/${t.id}/${c.id}/${g.id}/`) });
  }
}
const products = new Map();
let conTabla = 0;
for (const c of cats){
  let items = await crawl(c.path);
  if (items.length >= 2500 && c.subs.length){ items = []; for (const s of c.subs) items.push(...await crawl(s)); }
  for (const p of items){
    const t = p["Tabla Nutricional"], it = (p.items || [])[0] || {};
    if (!t || !t[0] || products.has(p.productId)) continue;
    products.set(p.productId, { name: p.productName, brand: p.brand, ean: it.ean, tabla: t[0] });
  }
}
conTabla = products.size;

// ---- 2. Convertir y controlar ----
const skipped = {}, rows = [], seenKey = new Set(), seenCode = new Set();
for (const p of products.values()){
  const r = superToRow(p);
  if (r.skip){ skipped[r.skip] = (skipped[r.skip] || 0) + 1; continue; }
  // El mismo producto en otro tamaño (mismo nombre, marca y valores) se carga una sola vez.
  const key = [r.name.toLowerCase(), (r.brand || "").toLowerCase(), r.kcal, r.protein, r.carbs, r.fat].join("|");
  if (seenKey.has(key) || seenCode.has(r.code)){ skipped["otro tamaño"] = (skipped["otro tamaño"] || 0) + 1; continue; }
  seenKey.add(key); seenCode.add(r.code); rows.push(r);
}
console.log("Categorías:", cats.length, "· productos con tabla:", conTabla, "· válidos:", rows.length);
console.log("Descartados:", JSON.stringify(skipped));
if (OUT) writeFileSync(OUT, JSON.stringify(rows));

// ---- 3. Cargar en Supabase ----
if (APPLY){
  const ref = process.env.PROJECT_REF, token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!ref || !token){ console.error("Faltan PROJECT_REF o SUPABASE_ACCESS_TOKEN"); process.exit(1); }
  const api = "https://api.supabase.com/v1/projects/" + ref + "/database/query";
  const run = async query => {
    for (let t = 0; t < 5; t++){
      const r = await fetch(api, { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
      if (r.status === 429 || r.status >= 500){ await sleep(5000 * (t + 1)); continue; }
      const j = await r.json().catch(() => null);
      return { ok: r.ok, data: j };
    }
    return { ok: false, data: null };
  };
  let nuevos = 0, actualizados = 0, fallidos = 0, motivo = "";
  // Si una tanda falla por un dato raro, se parte a la mitad hasta aislar el producto.
  const load = async list => {
    const r = await run(batchSql(list));
    if (r.ok && Array.isArray(r.data)){ nuevos += +r.data[0]?.nuevos || 0; actualizados += +r.data[0]?.actualizados || 0; return; }
    if (list.length === 1){ fallidos++; if (!motivo) motivo = String(r.data?.message || "sin detalle").slice(0, 200); return; }
    const h = Math.ceil(list.length / 2);
    await load(list.slice(0, h)); await load(list.slice(h));
  };
  for (let i = 0; i < rows.length; i += 500) await load(rows.slice(i, i + 500));
  console.log("Cargados · nuevos:", nuevos, "· actualizados:", actualizados, "· sin cambios (verificados o cargados por usuarios):",
    rows.length - nuevos - actualizados - fallidos, "· con error:", fallidos);
  if (motivo) console.log("Primer error:", motivo);
  const c = await run("select source, count(*) as n from public.products group by source order by source;");
  if (c.ok && Array.isArray(c.data)) console.log("En la base ahora:", c.data.map(x => x.source + " " + x.n).join(" · "));
  if (fallidos && !nuevos && !actualizados) process.exit(1);
}
