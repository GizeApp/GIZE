// Supabase Edge Function "productos-off": guarda en la base compartida (public.products) un
// producto de Open Food Facts a partir de su código de barras. La app la llama al escanear un
// código que todavía no está en la base, y al anotar un producto de OFF buscado por nombre.
//
// Los valores NO los manda la app: la función busca el producto en la API pública de Open Food
// Facts, revisa que sea razonable (las mismas reglas que la importación mensual, ver
// producto.ts) y lo guarda con la service role como source 'off', sin verificar. Si ese código
// ya está en la base, no lo pisa. Desde supabase/productos-off-servidor.sql la app ya no puede
// cargar productos "de Open Food Facts" directo en la tabla: solo esta función y el admin.
//
// Recibe { code } con el token del usuario logueado. Devuelve:
//   { product }          el producto guardado (o el que ya estaba)
//   { missing: true }    Open Food Facts no lo tiene
//   { skipped: motivo }  lo tiene pero sin datos que sirvan, o está oculto en GIZE: no se guarda
// Si falla (o llega al límite), la app lo anota igual con los datos de OFF, sin guardarlo.
//
// Límites por usuario, para que no se use para llenar la base:
//   · 40 productos nuevos por día: el mismo tope que la base les pone a los usuarios (se
//     cuentan sus productos por created_by, que acá queda con el usuario que lo pidió).
//   · 150 búsquedas en Open Food Facts por día (public.product_off_lookup, en
//     productos-off-servidor.sql). Hasta que se corra ese SQL, este tope no se aplica.
// Va sin "Verify JWT" (como las demás) y valida la sesión con auth.getUser().

import { createClient } from "npm:@supabase/supabase-js@2";
import { offToRow } from "./producto.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const OFF_API = "https://world.openfoodfacts.org/api/v2/product/";
const FIELDS = "code,product_name,product_name_es,generic_name_es,brands,quantity,serving_quantity,nutriments,nutrition_data_per,unique_scans_n";
// Open Food Facts pide que cada app se identifique (el mismo que usa la importación mensual).
const UA = "GIZE/1.0 (https://gize.ar - soporte@gize.ar)";
// Las mismas columnas que lee la app (app/core/productos.js).
const COLS = "id,code,name,brand,kcal,protein,carbs,fat,unit,portion,source,verified";
const MAX_NEW = 40, MAX_LOOKUPS = 150;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
  });
  const { data: u } = await asUser.auth.getUser();
  if (!u || !u.user) return json({ error: "Sesión vencida. Volvé a iniciar sesión." }, 401);
  const me = u.user.id;

  let body: { code?: unknown } | null = null;
  try { body = await req.json(); } catch { return json({ error: "Pedido inválido" }, 400); }
  const code = String((body && body.code) ?? "").replace(/\D/g, "");
  if (code.length < 6 || code.length > 14) return json({ error: "Código de barras inválido" }, 400);

  const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // En los errores se anota solo el código del error: nada del usuario ni del producto.
  const fail = (what: string, e: { code?: string } | null, msg = "No se pudo guardar el producto. Probá de nuevo.") => {
    console.error("productos-off", what, (e && e.code) || "");
    return json({ error: msg }, 500);
  };

  // ¿Ya está en la base? Se devuelve el que hay y no se pisa (uno oculto no se muestra).
  const current = async () => await db.from("products").select(COLS + ",hidden").eq("code", code).maybeSingle();
  const answer = (row: Record<string, unknown>, saved: boolean) => {
    if (row.hidden) return json({ skipped: "oculto" });
    const { hidden: _h, ...product } = row;
    return json({ product, saved });
  };
  const prev = await current();
  if (prev.error) return fail("leer", prev.error);
  if (prev.data) return answer(prev.data as Record<string, unknown>, false);

  // Tope de búsquedas en Open Food Facts por día. Si la función de la base todavía no existe
  // (falta correr productos-off-servidor.sql), se sigue sin tope.
  const lk = await db.rpc("product_off_lookup", { uid: me, lim: MAX_LOOKUPS });
  if (lk.error) console.error("productos-off", "tope de búsquedas", lk.error.code || "");
  else if (lk.data === false) return json({ error: "Llegaste al límite de búsquedas por hoy. Probá mañana." }, 429);

  // Open Food Facts, desde el servidor (lo que manda la app no se usa para nada más que el código).
  let off: { status?: number; product?: Record<string, unknown> } | null = null;
  try {
    const r = await fetch(OFF_API + code + ".json?fields=" + FIELDS, {
      headers: { "Accept": "application/json", "User-Agent": UA },
      signal: AbortSignal.timeout(8000),
    });
    // Un código que OFF no tiene responde 404 (con status 0): es "no lo tienen", no un error.
    if (r.status === 404) return json({ missing: true });
    if (!r.ok) { console.error("productos-off", "Open Food Facts respondió", r.status); return json({ error: "Open Food Facts no responde." }, 502); }
    off = await r.json();
  } catch (e) {
    console.error("productos-off", "Open Food Facts", (e as Error).name);
    return json({ error: "Open Food Facts no responde." }, 502);
  }
  if (!off || off.status !== 1 || !off.product) return json({ missing: true });

  // El código es el que se escaneó (OFF a veces lo devuelve con otro formato): así la próxima
  // vez que alguien lo escanee lo encuentra en la base.
  const row = offToRow({ ...off.product, code });
  if ("skip" in row) return json({ skipped: row.skip });

  // Tope de productos nuevos por día: el mismo de la base (productos-admin.sql, 40 por usuario).
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const cnt = await db.from("products").select("id", { count: "exact", head: true }).eq("created_by", me).gt("created_at", since);
  if (cnt.error) return fail("contar", cnt.error);
  if ((cnt.count || 0) >= MAX_NEW) return json({ error: "Llegaste al límite de productos nuevos por hoy." }, 429);

  // Si otro lo guardó recién (dos escaneos a la vez), no se pisa: se devuelve el que quedó.
  const ins = await db.from("products").upsert({
    code: row.code, name: row.name, brand: row.brand, kcal: row.kcal, protein: row.protein, carbs: row.carbs, fat: row.fat,
    unit: row.unit, portion: row.portion, scans: row.scans, source: "off", verified: false, hidden: false, created_by: me,
  }, { onConflict: "code", ignoreDuplicates: true }).select(COLS + ",hidden");
  if (ins.error) return fail("guardar", ins.error);
  if (ins.data && ins.data.length) return answer(ins.data[0] as Record<string, unknown>, true);
  const again = await current();
  if (again.error || !again.data) return fail("releer", again.error);
  return answer(again.data as Record<string, unknown>, false);
});
