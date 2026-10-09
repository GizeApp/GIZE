// Base compartida de productos: desde la app nadie carga productos directo en la tabla (los
// pedidos van por product_requests y lo de Open Food Facts por la función productos-off). Antes
// la política «usuarios agregan productos» seguía abierta y el tope de 40 por día contaba por
// created_at, que mandaba el usuario: con una fecha vieja se cargaban miles de productos falsos.
//   · productos-off-servidor.sql saca la política de alta y el permiso de insertar.
//   · products_before (productos-admin.sql) igual pone la fecha del servidor.
//   · La app y el panel no cargan nada directo en public.products.
// Las pruebas no tienen Postgres: se revisa el SQL (se probó a mano contra un Postgres 16).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
const fn = (sql, name) => (sql.match(new RegExp('create or replace function public\\.' + name + '\\([\\s\\S]*?end \\$\\$;')) || [''])[0].replace(/\s+/g, ' ');
const walk = d => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : /\.(js|mjs|html)$/.test(e.name) ? [path.join(d, e.name)] : []);

export default async function ({ t }){
  const srv = read('supabase/productos-off-servidor.sql');
  t.ok(srv.length > 0, 'existe supabase/productos-off-servidor.sql');
  t.ok(/drop policy if exists "usuarios agregan productos" on public\.products;/.test(srv), 'se saca la política de alta de los usuarios');
  t.ok(!/create policy "usuarios agregan productos"/.test(srv), 'la política de alta no se vuelve a crear');
  t.ok(/revoke insert, update, delete on public\.products from anon, authenticated;/.test(srv), 'sin permiso de insertar desde la app');

  // Aunque alguien vuelva a abrir el permiso, la fecha la pone el servidor (el tope cuenta por ella).
  const before = fn(read('supabase/productos-admin.sql'), 'products_before');
  t.ok(/if auth\.uid\(\) is not null and not public\.is_app_admin\(\) then .*new\.created_at := now\(\);.*created_at > now\(\) - interval '1 day'\) >= 40/.test(before),
    'products_before: a los usuarios les pone la fecha del servidor antes de contar el tope');
  t.has(read('supabase/productos-admin.sql'), 'antes de pedidos-productos.sql y productos-off-servidor.sql', 'productos-admin.sql dice en qué orden se corre');

  // La app y el panel no cargan productos directo (solo leen; lo demás va por funciones).
  const writes = [];
  for (const f of walk('app').concat(walk('admin'))){
    const src = read(f);
    if (/from\(\s*["']products["']\s*\)\s*\.\s*(insert|upsert|update|delete)\b/.test(src)) writes.push(f);
  }
  t.eq(writes, [], 'nadie en app/ ni admin/ escribe directo en public.products');
  t.ok(/from\("products"\)\.upsert\(/.test(read('supabase/functions/productos-off/index.ts')), 'lo de Open Food Facts lo sigue guardando la función (service role)');
}
