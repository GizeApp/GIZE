// Cola de audios por borrar (public.audios_por_borrar, ver supabase/borrar-audios.sql). Está
// aparte de index.ts para poder probarla sin Deno (tests/eliminar-cuenta.test.mjs).

type Db = any; // el cliente de Supabase con la clave de servicio

// Anota las rutas antes de borrarlas (de a 1000). Si no se puede (por ejemplo, falta correr el
// SQL) se sigue igual: se borran como antes, sin red si algo falla.
export async function anotar(db: Db, paths: string[]): Promise<boolean> {
  for (let i = 0; i < paths.length; i += 1000) {
    const { error } = await db.from("audios_por_borrar")
      .upsert(paths.slice(i, i + 1000).map((path) => ({ path })), { onConflict: "path", ignoreDuplicates: true });
    if (error) { console.error("borrar-audios: anotar", error.message); return false; }
  }
  return true;
}

// Borra los audios de a 50 y saca de la cola cada tanda borrada: lo que falla (o lo que no se
// llega a borrar si la función se corta) queda anotado para el cron. Devuelve cuántos borró.
// De a 50 y no más: para sacarlas de la cola, las rutas van en la dirección del pedido (cada
// una tiene 111 caracteres). Con 100 eran casi 12.000 caracteres (supabase-js avisa desde 8.000)
// y, si se rechazaba, los audios se borraban pero seguían anotados: el cron repasaba siempre los
// mismos 1000 más viejos.
export async function borrar(db: Db, bucket: string, paths: string[]): Promise<number> {
  let removed = 0;
  for (let i = 0; i < paths.length; i += 50) {
    const tanda = paths.slice(i, i + 50);
    const { error } = await db.storage.from(bucket).remove(tanda);
    if (error) { console.error("borrar-audios: quedaron audios sin borrar", (error as Error).message); continue; }
    removed += tanda.length;
    const { error: qe } = await db.from("audios_por_borrar").delete().in("path", tanda);
    if (qe && qe.code !== "42P01" && qe.code !== "PGRST205") console.error("borrar-audios: cola", qe.message);
  }
  return removed;
}
