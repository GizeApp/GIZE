// Trae de Open Food Facts los productos vendidos en Argentina con su tabla nutricional
// (calorías, proteínas, carbohidratos y grasas) y los suma a la base compartida de GIZE
// (public.products).
// Lo corre el workflow "Importar Open Food Facts" (.github/workflows/importar-off.yml).
//   node scripts/importar-off.mjs --csv productos.csv.gz --out off.sql   arma el SQL (para probar local)
//   node scripts/importar-off.mjs --csv productos.csv.gz --apply         carga en Supabase por tandas
//                                                                         (usa PROJECT_REF y SUPABASE_ACCESS_TOKEN)
// La fuente es el archivo completo que publica Open Food Facts para descargas grandes
// (https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz, separado por
// tabulaciones): su buscador corta a las pocas páginas. Se lee de a una línea, sin
// descomprimirlo entero. Datos bajo licencia ODbL (se cita la fuente en la app y en
// gize.ar/privacidad). El log de Actions es público: solo se imprimen cantidades.
import { createReadStream, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { batchSql, offToRow, rowsToSql } from "./off-import-lib.mjs";

const has = k => process.argv.includes(k);
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const CSV = arg("--csv", ""), OUT = arg("--out", ""), APPLY = has("--apply");
const sleep = ms => new Promise(r => setTimeout(r, ms));
if (!CSV || (!OUT && !APPLY)){ console.error("Uso: --csv archivo.csv.gz y además --out archivo.sql o --apply"); process.exit(1); }

// ---- 1. Leer el archivo y quedarse con Argentina ----
// Entra todo producto argentino con calorías, proteínas, carbohidratos y grasas coherentes
// (lo que usa la app), esté o no marcado "tabla completa" en OFF: esa marca también exige
// azúcares, sodio, etc., y la llevan productos SIN tabla (agua, frutas sueltas), que acá
// se descartan igual por no tener valores.
const NUTR = ["energy-kcal_100g", "energy_100g", "proteins_100g", "carbohydrates_100g", "fat_100g", "alcohol_100g", "fiber_100g"];
const input = createReadStream(CSV);
const lines = createInterface({ input: CSV.endsWith(".gz") ? input.pipe(createGunzip()) : input, crlfDelay: Infinity });
const rows = new Map(), skipped = {};
let col = null, total = 0, ar = 0;
for await (const line of lines){
  if (!col){ col = Object.fromEntries(line.split("\t").map((h, i) => [h, i])); continue; }
  total++;
  if (line.indexOf("en:argentina") < 0) continue; // descarte rápido: casi todo el archivo es de otros países
  const f = line.split("\t"), v = k => col[k] == null ? undefined : f[col[k]];
  if (!String(v("countries_tags") || "").split(",").includes("en:argentina")) continue;
  ar++;
  const p = { code: v("code"), product_name: v("product_name") || v("abbreviated_product_name"), generic_name_es: v("generic_name"), brands: v("brands"),
    quantity: v("quantity"), serving_quantity: v("serving_quantity"), unique_scans_n: v("unique_scans_n"), nutriments: {} };
  for (const k of NUTR){ const x = v(k); if (x !== undefined && x !== "") p.nutriments[k] = x; }
  const r = offToRow(p);
  if (r.skip){ skipped[r.skip] = (skipped[r.skip] || 0) + 1; continue; }
  r.completa = String(v("states_tags") || "").split(",").includes("en:nutrition-facts-completed");
  const prev = rows.get(r.code);
  if (!prev || r.scans > prev.scans) rows.set(r.code, r);
}
if (!col || col.code == null || col.countries_tags == null){ console.error("El archivo no tiene el formato esperado"); process.exit(1); }
const all = [...rows.values()];
console.log("Productos en el archivo:", total, "· de Argentina:", ar, "· válidos:", all.length,
  "(marcados en OFF como tabla completa:", all.filter(r => r.completa).length + ")");
console.log("Descartados:", JSON.stringify(skipped));
if (OUT) writeFileSync(OUT, rowsToSql(all));

// ---- 2. Cargar en Supabase ----
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
  // Sin la marca de revisado (supabase/admin.sql) fallaría cada tanda: se corta antes, avisando.
  const col = await run("select 1 from information_schema.columns where table_schema = 'public' and table_name = 'products' and column_name = 'reviewed_at';");
  if (!(col.ok && Array.isArray(col.data) && col.data.length)){ console.error("La base no respondió o falta la marca de revisado de los productos: correr supabase/admin.sql (workflow Supabase → sql) y volver a probar."); process.exit(1); }
  let nuevos = 0, actualizados = 0, fallidos = 0, motivo = "";
  // Si una tanda falla por un dato raro, se parte a la mitad hasta aislar el producto
  // (así un producto mal cargado en OFF no frena al resto).
  const load = async list => {
    const r = await run(batchSql(list));
    if (r.ok && Array.isArray(r.data)){ nuevos += +r.data[0]?.nuevos || 0; actualizados += +r.data[0]?.actualizados || 0; return; }
    if (list.length === 1){ fallidos++; if (!motivo) motivo = String(r.data?.message || "sin detalle").slice(0, 200); return; }
    const h = Math.ceil(list.length / 2);
    await load(list.slice(0, h)); await load(list.slice(h));
  };
  for (let i = 0; i < all.length; i += 500) await load(all.slice(i, i + 500));
  console.log("Cargados · nuevos:", nuevos, "· actualizados:", actualizados, "· sin cambios (revisados en el panel, cargados por usuarios o códigos borrados):",
    all.length - nuevos - actualizados - fallidos, "· con error:", fallidos);
  if (motivo) console.log("Primer error:", motivo);
  const c = await run("select count(*) filter (where source = 'off') as off, count(*) as todos from public.products;");
  if (c.ok && Array.isArray(c.data)) console.log("En la base ahora · de Open Food Facts:", c.data[0].off, "· total:", c.data[0].todos);
  if (fallidos && !nuevos && !actualizados) process.exit(1);
}
