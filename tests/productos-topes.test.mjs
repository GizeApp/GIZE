// Topes por usuario en la base compartida de productos (supabase/productos-topes.sql). Antes con 3
// cuentas nuevas se podía reportar y ocultar todo lo que no estuviera verificado, y una cuenta
// podía sumarle usos sin fin a un producto propio para que saliera primero en la búsqueda.
//   · product_report: hasta 10 reportes por usuario por día; para ocultar solo cuentan las
//     cuentas con más de 3 días, y solo se ocultan solos los productos cargados por usuarios.
//   · product_use: un uso por usuario, producto y día.
// Las pruebas no tienen Postgres: se revisa el SQL (se probó a mano contra un Postgres 16).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
const fn = (sql, name) => (sql.match(new RegExp('create or replace function public\\.' + name + '\\([\\s\\S]*?end \\$\\$;')) || [''])[0].replace(/\s+/g, ' ');

export default async function ({ t }){
  const sql = read('supabase/productos-topes.sql');
  t.ok(sql.length > 0, 'existe supabase/productos-topes.sql');

  const rep = fn(sql, 'product_report');
  t.ok(/pg_advisory_xact_lock\(hashtext\('product_report'\), hashtext\(auth\.uid\(\)::text\)\)/.test(rep), 'reportes: de a uno por usuario (el tope no se saltea con pedidos a la vez)');
  t.ok(/where user_id = auth\.uid\(\) and created_at > now\(\) - interval '1 day'\) >= 10 then return;/.test(rep), 'reportes: hasta 10 por usuario por día');
  t.ok(/join auth\.users u on u\.id = r\.user_id/.test(rep) && /u\.created_at < now\(\) - interval '3 days'/.test(rep), 'reportes: para ocultar cuentan solo las cuentas con más de 3 días');
  t.ok(/hidden = \(hidden or \(not verified and source = 'user' and viejos >= 3\)\)/.test(rep), 'reportes: solo se ocultan solos los cargados por usuarios');
  t.ok(/revoke execute on function public\.product_report\(uuid, text\) from public, anon;/.test(sql) && /grant execute on function public\.product_report\(uuid, text\) to authenticated;/.test(sql), 'reportes: solo con sesión');

  t.ok(/create table if not exists public\.product_uses \([\s\S]*primary key \(product_id, user_id, day\)/.test(sql), 'usos: una fila por producto, usuario y día');
  t.ok(/alter table public\.product_uses enable row level security;/.test(sql) && /revoke all on public\.product_uses from anon, authenticated;/.test(sql), 'usos: la tabla no se toca desde la app');
  const use = fn(sql, 'product_use');
  t.ok(/on conflict do nothing; if found then update public\.products set uses = uses \+ 1 where id = pid; end if;/.test(use), 'usos: suma solo el primero del día');
  t.ok(/delete from public\.product_uses where user_id = auth\.uid\(\) and day < hoy;/.test(use), 'usos: lo de días anteriores se borra solo');
  t.ok(/revoke execute on function public\.product_use\(uuid\) from public, anon;/.test(sql) && /grant execute on function public\.product_use\(uuid\) to authenticated;/.test(sql), 'usos: solo con sesión');

  // Se puede correr varias veces.
  t.ok(!/create table (?!if not exists)|create index (?!if not exists)|create function/.test(sql), 'se puede volver a correr (if not exists / or replace)');
  t.has(read('supabase/productos.sql'), 'productos-topes.sql', 'productos.sql avisa dónde están las versiones vigentes');
}
