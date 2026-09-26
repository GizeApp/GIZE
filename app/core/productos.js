// Base compartida de productos de GIZE (tabla products en Supabase, ver supabase/productos.sql).
// Lo que alguien carga al escanear un código que no estaba en ningún lado queda para todos,
// y lo que se agrega desde Open Food Facts también se guarda acá. Sin sesión o sin señal,
// todo sigue funcionando con la base propia y Open Food Facts.
import { State } from './state.js';
import { norm } from './utils.js';

const COLS = "id,code,name,brand,kcal,protein,carbs,fat,unit,portion,source,verified";
const n1 = v => Math.round((Number(v) || 0) * 10) / 10;

// Fila de la tabla → alimento de la app (valores cada 100 g/ml).
export function rowToFood(r){
  const brand = r.brand ? String(r.brand) : "";
  const name = brand && String(r.name).toLowerCase().indexOf(brand.toLowerCase()) < 0 ? r.name + " · " + brand : r.name;
  return { name, kcal: Math.round(Number(r.kcal) || 0), p: n1(r.protein), c: n1(r.carbs), f: n1(r.fat),
    portion: Number(r.portion) > 0 ? Math.round(Number(r.portion)) : 100, unit: r.unit === "ml" ? "ml" : "g",
    src: "GIZE", gid: r.id, code: r.code || "", verified: !!r.verified };
}

// Formas equivalentes de una misma palabra en los nombres de los productos.
const SYN = {
  lactal: ["lactal", "molde", "lactead"], molde: ["molde", "lactal", "lactead"],
  galletitas: ["galletit", "galleta"], galletita: ["galletit", "galleta"], galletas: ["galleta", "galletit"],
  yogur: ["yogur"], yogurt: ["yogur"], yoghurt: ["yogur"],
  fideos: ["fideo", "pasta", "spaghetti", "tallarin"], fideo: ["fideo", "pasta", "spaghetti", "tallarin"],
  muzzarella: ["muzzarella", "mozzarella", "muzarella"], mozzarella: ["muzzarella", "mozzarella", "muzarella"],
};

const STOP = new Set(["de", "del", "la", "el", "los", "las", "y", "con", "en", "x"]);

function ready(){ return !!(State.sb && State.cloudUser); }

// Búsqueda por nombre o marca (sin tildes). Los verificados y los más usados primero; después,
// los más escaneados en Open Food Facts (los productos conocidos antes que los raros).
export async function searchShared(q){
  if (!ready()) return [];
  const k = norm(q).replace(/[^a-z0-9ñ ]/g, " ").replace(/\s+/g, " ").trim();
  if (k.length < 3) return [];
  // Cada palabra tiene que estar (en cualquier orden) o alguna de sus formas equivalentes:
  // "pan lactal" encuentra también los que la marca llama "pan de molde".
  const words = k.split(" ").filter(w => w.length >= 2 && !STOP.has(w)).slice(0, 5);
  if (!words.length) return [];
  let qb = State.sb.from("products").select(COLS);
  words.forEach(w => {
    const alts = SYN[w] || [w];
    qb = alts.length > 1 ? qb.or(alts.map(a => "search.like.%" + a + "%").join(",")) : qb.like("search", "%" + w + "%");
  });
  const r = await qb.order("verified", { ascending: false }).order("uses", { ascending: false }).order("scans", { ascending: false }).limit(25);
  if (r.error) throw r.error;
  return (r.data || []).map(rowToFood);
}

export async function productByCodeShared(code){
  if (!ready()) return null;
  const c = String(code || "").replace(/\D/g, "");
  if (c.length < 6) return null;
  const r = await State.sb.from("products").select(COLS).eq("code", c).maybeSingle();
  if (r.error) throw r.error;
  return r.data ? rowToFood(r.data) : null;
}

// Guarda un producto con código de barras para todos (si el código ya estaba, no pisa nada).
// Lo que carga un usuario a mano va con la foto de la tabla (photoPath, ver uploadLabelPhoto).
export async function saveShared(food, code, source, photoPath){
  if (!ready()) return false;
  const c = String(code || "").replace(/\D/g, "");
  if (c.length < 6 || c.length > 14) return false;
  const parts = String(food.name || "").split(" · ");
  const row = { code: c, name: parts[0].slice(0, 120), brand: (food.brand || parts[1] || "").slice(0, 60) || null,
    kcal: Math.min(950, Math.max(0, Math.round(+food.kcal || 0))), protein: Math.min(100, Math.max(0, +food.p || 0)),
    carbs: Math.min(100, Math.max(0, +food.c || 0)), fat: Math.min(100, Math.max(0, +food.f || 0)),
    unit: food.unit === "ml" ? "ml" : "g", portion: +food.portion > 0 && +food.portion <= 2000 ? Math.round(+food.portion) : null,
    source: source === "off" ? "off" : "user", photo_path: source === "off" ? null : (photoPath || null) };
  if (row.protein + row.carbs + row.fat > 105) return false;
  try { const r = await State.sb.from("products").upsert(row, { onConflict: "code", ignoreDuplicates: true }); return !r.error; }
  catch (e) { return false; }
}

export function useShared(id){ if (ready() && id) State.sb.rpc("product_use", { pid: id }).then(() => {}, () => {}); }
export async function reportShared(id, why){
  if (!ready() || !id) return false;
  try { const r = await State.sb.rpc("product_report", { pid: id, why: String(why || "").slice(0, 200) }); return !r.error; } catch (e) { return false; }
}

// Calorías que no cierran con los macros (4 kcal por g de proteína y carbos, 9 por g de grasa).
// Se avisa antes de guardar (el alcohol y la fibra explican diferencias chicas).
export function kcalMismatch(kcal, p, c, f){
  const calc = (+p || 0) * 4 + (+c || 0) * 4 + (+f || 0) * 9, k = +kcal || 0;
  if (calc < 5 && k < 5) return false;
  return Math.abs(k - calc) > Math.max(30, calc * 0.25);
}

// Foto de la tabla nutricional: se achica (lado mayor 1600 px, JPEG) y se sube a la carpeta
// del usuario en el bucket privado «productos». Solo la ven los administradores.
async function labelJpeg(file){
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("No se pudo leer la foto")); i.src = url; });
    const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.createElement("canvas"); cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
    cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
    return await new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error("No se pudo procesar la foto")), "image/jpeg", 0.8));
  } finally { URL.revokeObjectURL(url); }
}
export async function uploadLabelPhoto(file, code){
  if (!ready()) throw new Error("Tenés que iniciar sesión.");
  const blob = await labelJpeg(file);
  const path = State.cloudUser.id + "/" + String(code || "x").replace(/\D/g, "").slice(0, 14) + "-" + Date.now() + ".jpg";
  const r = await State.sb.storage.from("productos").upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (r.error) throw r.error;
  return path;
}
