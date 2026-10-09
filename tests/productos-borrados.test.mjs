// Productos que borra un administrador (gize.ar/admin → Productos → Borrar): su código de barras
// no vuelve solo. Antes «Borrar» sacaba la fila y nada más, y el producto volvía apenas alguien
// lo escaneaba (función productos-off) o con la importación del mes (Open Food Facts y
// supermercados), aunque el panel decía que se borraba para siempre.
//   · productos-admin.sql: admin_product_delete anota el código en product_deleted_codes, y un
//     trigger saltea la carga de esos códigos (productos-off, importaciones, productos-etiquetas.sql)
//     salvo que la haga un administrador desde el panel, que lo saca de la lista.
//   · productos-off contesta «oculto» sin preguntarle a Open Food Facts.
// Las pruebas no tienen Postgres: se revisa el SQL (se probó a mano contra un Postgres 16 con las
// tandas que arman scripts/off-import-lib.mjs y scripts/super-import-lib.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
const fn = (sql, name) => (sql.match(new RegExp('create or replace function public\\.' + name + '\\([\\s\\S]*?end \\$\\$;')) || [''])[0].replace(/\s+/g, ' ');

export default async function ({ t }){
  const sql = read('supabase/productos-admin.sql');
  t.ok(/create table if not exists public\.product_deleted_codes \(\s*code\s+text primary key/.test(sql), 'lista de códigos borrados');
  t.ok(/alter table public\.product_deleted_codes enable row level security;/.test(sql) && /revoke all on public\.product_deleted_codes from anon, authenticated;/.test(sql),
    'la lista no se toca desde la app');

  const del = fn(sql, 'admin_product_delete');
  t.ok(/perform public\.admin_assert\(\);/.test(del), 'borrar: solo administradores');
  t.ok(/delete from public\.products where id = pid returning name, code into n, c;/.test(del)
    && /insert into public\.product_deleted_codes \(code, name\) values \(c, n\) on conflict \(code\) do update/.test(del), 'borrar: el código queda en la lista');

  const guard = fn(sql, 'products_deleted_guard');
  t.ok(/security definer set search_path = public/.test(guard), 'el trigger lee la lista aunque quien carga no tenga permiso');
  t.ok(/if new\.code is not null and exists \(select 1 from public\.product_deleted_codes where code = new\.code\) then if auth\.uid\(\) is null or not public\.is_app_admin\(\) then return null; end if; delete from public\.product_deleted_codes where code = new\.code;/.test(guard),
    'un código borrado se saltea (sin cortar la importación), salvo que lo cargue un administrador, que lo libera');
  t.ok(/create trigger products_deleted_guard before insert on public\.products\s+for each row execute function public\.products_deleted_guard\(\);/.test(sql), 'el trigger corre en cada alta');
  t.ok(/drop trigger if exists products_deleted_guard on public\.products;/.test(sql), 'se puede volver a correr');

  // Las importaciones cargan con un insert común (el trigger corre) y no lo apagan.
  try {
    const off = await import(pathToFileURL(path.join(ROOT, 'scripts/off-import-lib.mjs')).href);
    const sup = await import(pathToFileURL(path.join(ROOT, 'scripts/super-import-lib.mjs')).href);
    const a = off.batchSql([{ code: '7790000000017', name: 'Prueba', brand: null, kcal: 100, protein: 5, carbs: 10, fat: 4, unit: 'g', portion: null, scans: 1 }]);
    const b = sup.batchSql([{ code: '7790000000017', name: 'Prueba', brand: null, kcal: 100, protein: 5, carbs: 10, fat: 4, unit: 'g', portion: null }]);
    for (const [n, q] of [['Open Food Facts', a], ['supermercados', b]])
      t.ok(/^with x as \(insert into public\.products /.test(q) && !/replication_role|disable trigger/i.test(q), n + ': carga con insert común (respeta los códigos borrados)');
  } catch (e) { t.ok(false, 'no se pudieron cargar las importaciones: ' + e.message); }
  for (const f of ['scripts/off-import-lib.mjs', 'scripts/super-import-lib.mjs', 'supabase/productos-etiquetas.sql'])
    t.has(read(f), 'products_deleted_guard', f + ' avisa que no vuelve a cargar los códigos borrados');

  // productos-off: antes de preguntarle a Open Food Facts mira la lista y contesta «oculto».
  const off = read('supabase/functions/productos-off/index.ts');
  const iDel = off.indexOf('from("product_deleted_codes")'), iFetch = off.indexOf('fetch(OFF_API');
  t.ok(iDel > 0 && iFetch > iDel, 'productos-off mira los códigos borrados antes de buscar en Open Food Facts');
  t.ok(/else if \(del\.data\) return json\(\{ skipped: "oculto" \}\);/.test(off), 'productos-off: un código borrado se contesta como oculto (la app ofrece pedirlo)');

  t.has(read('admin/admin.js'), 'El código no se vuelve a cargar solo', 'el panel avisa que el código queda bloqueado');
}
