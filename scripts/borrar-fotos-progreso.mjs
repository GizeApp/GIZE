// Borra TODOS los archivos del bucket "checkins" de Supabase Storage: las fotos de progreso
// de antes (la app ya no las sube ni las muestra). Lo corre el workflow "Supabase", tarea
// "borrar-fotos-progreso"; después va la tarea "sql" con supabase/borrar-fotos-progreso.sql.
//   SUPABASE_URL=https://<proyecto>.supabase.co SUPABASE_SERVICE_KEY=<clave de servicio> node scripts/borrar-fotos-progreso.mjs
// Usa la API de Storage con la clave de servicio: Supabase no deja borrar storage.objects por
// SQL (trigger protect_objects_delete) y, aunque se forzara, el archivo quedaría guardado.
// Se puede correr de nuevo: si ya no queda nada, dice "Archivos borrados: 0".
// El log de Actions es PÚBLICO: solo se imprimen cantidades. Nunca rutas (llevan el id de cada
// usuario) ni lo que responde Supabase (puede traer rutas): de un error, solo el código.

const BUCKET = "checkins";
const PAGE = 1000;   // lo máximo que devuelve Storage por pedido al listar
const BATCH = 100;   // archivos por pedido al borrar (como la app al eliminar la cuenta)

const BASE = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const KEY = process.env.SUPABASE_SERVICE_KEY || "";
if (!/^https?:\/\//.test(BASE) || !KEY){ console.error("::error::Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY"); process.exit(1); }

async function storage(method, path, body, what){
  let r;
  try {
    r = await fetch(BASE + "/storage/v1/" + path, { method,
      headers: { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" },
      body: JSON.stringify(body) });
  } catch (e) { throw new Error("no se pudo conectar con Supabase al " + what); }
  if (!r.ok) throw new Error("Supabase respondió " + r.status + " al " + what + (r.status === 400 || r.status === 401 || r.status === 403 ? " (¿la clave de servicio es la correcta?)" : ""));
  const j = await r.json().catch(() => null);
  if (!Array.isArray(j)) throw new Error("respuesta inesperada de Supabase al " + what);
  return j;
}

// Todas las rutas de archivos bajo "prefix", recorriendo las subcarpetas ({uid}/...).
// Primero se lista todo y después se borra: borrar mientras se pagina corre el offset y se
// saltearía archivos.
async function listAll(prefix){
  const files = [], dirs = [];
  for (let offset = 0; ; offset += PAGE){
    const items = await storage("POST", "object/list/" + BUCKET,
      { prefix, limit: PAGE, offset, sortBy: { column: "name", order: "asc" } }, "listar");
    for (const it of items){
      if (!it || typeof it.name !== "string" || !it.name) continue;
      const p = prefix ? prefix + "/" + it.name : it.name;
      // id null = carpeta
      if (it.id) files.push(p); else dirs.push(p);
    }
    if (items.length < PAGE) break;
  }
  for (const d of dirs) files.push(...await listAll(d));
  return files;
}

try {
  const paths = await listAll("");
  console.log("Archivos en el bucket " + BUCKET + ":", paths.length);
  let borrados = 0;
  for (let i = 0; i < paths.length; i += BATCH){
    const done = await storage("DELETE", "object/" + BUCKET, { prefixes: paths.slice(i, i + BATCH) }, "borrar");
    borrados += done.length;
  }
  console.log("Archivos borrados:", borrados);
  const quedan = (await listAll("")).length;
  console.log("Quedan en el bucket:", quedan);
  if (quedan){ console.error("::error::Quedaron " + quedan + " archivos sin borrar. Corré la tarea de nuevo."); process.exit(1); }
} catch (e) {
  console.error("::error::" + e.message);
  process.exit(1);
}
