// Productos corregidos en el panel: las importaciones no los pisan aunque no estén verificados.
// Antes la importación del mes (Open Food Facts y supermercados) solo respetaba lo verificado o lo
// oculto, así que una corrección guardada con «Guardar cambios» o «Volver a mostrar» volvía a los
// valores de afuera y todos veían otra vez las calorías equivocadas.
//   · admin.sql: admin_product_save deja la marca de revisado (reviewed_at) en cada cambio, y lo
//     que ya se había revisado a mano (está en el registro) queda marcado.
//   · scripts/off-import-lib.mjs, scripts/super-import-lib.mjs y productos-etiquetas.sql no
//     actualizan lo que tiene la marca.
//   · Las importaciones avisan y cortan si falta correr admin.sql (sin la columna fallaría todo).
// Las pruebas no tienen Postgres: se revisa el SQL (se probó a mano contra un Postgres 16).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
const fn = (sql, name) => (sql.match(new RegExp('create or replace function public\\.' + name + '\\([\\s\\S]*?end \\$\\$;')) || [''])[0].replace(/\s+/g, ' ');
const ROW = { code: '7790000000017', name: 'Prueba', brand: null, kcal: 100, protein: 5, carbs: 10, fat: 4, unit: 'g', portion: null, scans: 1 };

export default async function ({ t }){
  const sql = read('supabase/admin.sql');
  t.ok(/alter table public\.products add column if not exists reviewed_at timestamptz;/.test(sql), 'marca de revisado en los productos');
  t.ok(/update public\.products p set reviewed_at = a\.at\s+from \(select target, max\(created_at\) as at from public\.admin_audit\s+where action in \('producto_ocultar', 'producto_verificar', 'producto_mostrar'\) group by target\) a\s+where p\.id::text = a\.target and p\.reviewed_at is null;/.test(sql),
    'lo que ya se había revisado a mano queda marcado (sale del registro)');
  const save = fn(sql, 'admin_product_save');
  t.ok(/perform public\.admin_assert\(\);/.test(save), 'guardar: solo administradores');
  t.ok(/verified = p_verified, hidden = p_hidden, reviewed_at = now\(\) where id = pid;/.test(save), 'guardar desde el panel deja la marca, aunque no lo verifique');

  // Las dos importaciones no actualizan lo marcado.
  try {
    const off = await import(pathToFileURL(path.join(ROOT, 'scripts/off-import-lib.mjs')).href);
    const sup = await import(pathToFileURL(path.join(ROOT, 'scripts/super-import-lib.mjs')).href);
    t.ok(/where products\.source = 'off' and not products\.verified and not products\.hidden and products\.reviewed_at is null returning/.test(off.batchSql([ROW])),
      'Open Food Facts: no pisa lo corregido en el panel');
    t.ok(/where products\.source in \('off', 'gize'\) and not products\.verified and not products\.hidden and products\.reviewed_at is null returning/.test(sup.batchSql([ROW])),
      'supermercados: no pisa lo corregido en el panel');
  } catch (e) { t.ok(false, 'no se pudieron cargar las importaciones: ' + e.message); }
  t.ok(/where products\.source in \('off', 'gize'\) and not products\.verified and not products\.hidden and products\.reviewed_at is null;/.test(read('supabase/productos-etiquetas.sql')),
    'productos-etiquetas.sql: no pisa lo corregido en el panel');

  for (const f of ['scripts/importar-off.mjs', 'scripts/importar-super.mjs']){
    const src = read(f), iCheck = src.indexOf("column_name = 'reviewed_at'"), iLoad = src.indexOf('await load(');
    t.ok(iCheck > 0 && iLoad > iCheck && /process\.exit\(1\)/.test(src.slice(iCheck, iLoad)), f + ': si falta la marca, avisa y corta antes de cargar');
  }
}
