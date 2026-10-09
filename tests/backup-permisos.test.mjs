// Copia de seguridad (.github/workflows/backup.yml): al restaurarla, las funciones internas de la
// base no pueden quedar abiertas. Antes la copia iba sin permisos (--no-privileges) y, al
// restaurarla, funciones que cuida solo un REVOKE (tomar_avisos_vence, pasos_totales,
// product_off_lookup, cron_secret…) quedaban abiertas para cualquiera con la clave pública.
// Con los permisos en la copia no alcanza: en Supabase lo que se crea en public nace abierto para
// anon y authenticated, y la copia no lo deshace. Con las tablas pasaba lo mismo: products volvía
// a mostrar created_by y photo_path, y las tablas cerradas con un REVOKE quedaban abiertas. Por eso:
//   · la copia lleva los permisos y además se guarda (cifrado) permisos-AAAA-MM-DD.sql, que deja
//     funciones, tablas y columnas como en la original, sin dar nada que la original no diera;
//   · la prueba de restaurar usa una base abierta como Supabase, le corre ese .sql y compara
//     función por función, tabla por tabla y columna por columna con la original (si algo queda
//     más abierto, sale en rojo);
//   · el encabezado explica cómo restaurar (con el .sql y después auditoria.sql).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };

export default async function ({ t }){
  const y = read('.github/workflows/backup.yml');
  t.ok(y.length > 0, 'existe backup.yml');
  const dump = (y.match(/\$PG pg_dump [^\n]*/) || [''])[0], restore = (y.match(/\$PG pg_restore [^\n]*/) || [''])[0];
  t.ok(dump && !dump.includes('--no-privileges'), 'la copia lleva los permisos: ' + dump);
  t.ok(restore && !restore.includes('--no-privileges'), 'la prueba restaura los permisos: ' + restore);
  t.ok(/alter default privileges in schema public grant all on functions to anon, authenticated, service_role;/.test(y), 'la base de prueba nace abierta como Supabase (funciones)');
  t.ok(/alter default privileges in schema public grant all on tables to anon, authenticated, service_role;/.test(y), 'la base de prueba nace abierta como Supabase (tablas)');

  // El .sql: a las funciones solo les saca permisos, a public y al rol que en la original no podía.
  const cerrar = (y.match(/CERRAR: >-\n([\s\S]*?)\n      #/) || ['', ''])[1].replace(/\s+/g, ' ');
  t.ok(/select 1 as o, format\('revoke execute on function %I\.%I\(%s\) from public, %s;'/.test(cerrar), 'permisos.sql: a las funciones solo les saca permisos (revoke)');
  t.ok(/case when not has_function_privilege\('anon', p\.oid, 'execute'\) then 'anon' end/.test(cerrar)
    && /case when not has_function_privilege\('authenticated', p\.oid, 'execute'\) then 'authenticated' end/.test(cerrar), 'permisos.sql: a anon y authenticated, donde en la original no podían');
  t.ok(!/grant execute/i.test(cerrar), 'permisos.sql: no le da a nadie una función');
  // A las tablas: les saca todo a anon y authenticated y les vuelve a dar lo que tenían en la
  // original (relacl de la tabla, attacl de cada columna), nada más.
  const rel = "c.relkind in ('r', 'p', 'v', 'm', 'f')", roles = "r.rolname in ('anon', 'authenticated')";
  t.ok(cerrar.includes("select 2, format('revoke all on table %I.%I from anon, authenticated;', n.nspname, c.relname)") && cerrar.includes(rel), 'permisos.sql: a cada tabla y vista le saca todo a anon y authenticated');
  t.eq((cerrar.match(/format\('grant /g) || []).length, 2, 'permisos.sql: da permisos solo en dos lugares (tablas y columnas)');
  t.ok(/select 3, format\('grant %s on table %I\.%I to %I;', string_agg\(distinct a\.privilege_type, ', '\), n\.nspname, c\.relname, r\.rolname\) from pg_class c [^)]*cross join aclexplode\(c\.relacl\) a join pg_roles r on r\.oid = a\.grantee/.test(cerrar)
    && cerrar.includes("where n.nspname = 'public' and " + rel + ' and ' + roles + ' group by'), 'permisos.sql: de la tabla, lo que anon y authenticated tenían en la original');
  // Una columna, un permiso por línea: «grant insert, select (x)» daría insert en toda la tabla.
  t.ok(/select distinct 4, format\('grant %s \(%I\) on table %I\.%I to %I;', a\.privilege_type, t\.attname, n\.nspname, c\.relname, r\.rolname\)/.test(cerrar)
    && /cross join aclexplode\(t\.attacl\) a join pg_roles r on r\.oid = a\.grantee where n\.nspname = 'public' and c\.relkind in \('r', 'p', 'v', 'm', 'f'\) and r\.rolname in \('anon', 'authenticated'\)/.test(cerrar), 'permisos.sql: de cada columna, lo que tenían en la original, de a un permiso');
  t.ok(/\) x order by o, s$/.test(cerrar.trim()), 'permisos.sql: primero saca y después vuelve a dar (sacar el de la tabla saca también el de las columnas)');
  const perm = (y.match(/PERMISOS: >-\n([\s\S]*?)\n      #/) || ['', ''])[1].replace(/\s+/g, ' ');
  t.ok(perm.includes("has_table_privilege('anon', c.oid, v), has_table_privilege('authenticated', c.oid, v)") && perm.includes("has_column_privilege('anon', c.oid, a.attnum, v)")
    && perm.includes("unnest(array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'])"), 'la comparación mira también cada permiso de cada tabla y columna');
  t.ok(/\$PG psql "\$DB_URL" -Atc "\$CERRAR" > out\/permisos\.sql/.test(y), 'permisos.sql sale de la base original');
  t.ok(/-o "out\/permisos-\$\(date -u \+%F\)\.sql\.gpg" out\/permisos\.sql/.test(y) && /path: out\/\*\.gpg/.test(y), 'permisos.sql se guarda cifrado junto con la copia');

  // La prueba: después de subir la copia, aplica permisos.sql y compara con la original.
  const step = (y.match(/- name: Probar los permisos de las funciones y las tablas\n[\s\S]*?(?=\n      - name:)/) || [''])[0];
  t.ok(step.includes('-f /out/permisos.sql') && step.indexOf('-f /out/permisos.sql') < step.indexOf('"$PERMISOS"'), 'la prueba corre permisos.sql antes de comparar');
  t.ok(y.indexOf('- name: Probar los permisos de las funciones y las tablas') > y.indexOf('actions/upload-artifact'), 'la prueba va después de subir la copia (si falla, la copia igual queda)');
  const line = (step.match(/abiertas=\$\(join[^\n]*\)/) || [''])[0];
  t.ok(!!line && /exit 1/.test(step), 'si algo queda más abierto, sale en rojo');
  if (line){
    // La comparación de verdad, con archivos de ejemplo (nombre|anon|auth, ordenados como sort).
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gize-permisos-')), out = path.join(dir, 'out');
    fs.mkdirSync(out);
    const orig = ['pasos_ranking(uuid,date)|f|t', 'products insert|f|f', 'products.created_by select|f|f', 'products.name select|f|t', 'publica(integer)|t|t', 'tomar_avisos_vence()|f|f'];
    const sorted = rows => execFileSync('sort', ['-t', '|', '-k1,1'], { input: rows.join('\n') + '\n', encoding: 'utf8' });
    fs.writeFileSync(path.join(out, 'permisos.txt'), sorted(orig));
    const run = copia => { fs.writeFileSync(path.join(out, 'permisos-copia.txt'), sorted(copia));
      return execFileSync('bash', ['-c', line + '; echo "$abiertas"'], { cwd: dir, encoding: 'utf8' }).trim(); };
    t.eq(run(orig), '', 'igual que la original: nada abierto');
    t.eq(run(['pasos_ranking(uuid,date)|t|t', 'products insert|f|f', 'products.created_by select|f|f', 'products.name select|f|t', 'publica(integer)|t|t', 'tomar_avisos_vence()|t|t']).split('\n').sort(), ['pasos_ranking(uuid,date)', 'tomar_avisos_vence()'], 'funciones más abiertas que la original: se avisan');
    t.eq(run(['pasos_ranking(uuid,date)|f|t', 'products insert|t|t', 'products.created_by select|f|t', 'products.name select|f|t', 'publica(integer)|t|t', 'tomar_avisos_vence()|f|f']).split('\n').sort(), ['products insert', 'products.created_by select'], 'tablas y columnas más abiertas que la original: se avisan');
    t.eq(run(['publica(integer)|t|t']), '', 'las que no se restauraron no cuentan');
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // Cómo restaurar de verdad.
  const head = y.slice(0, y.indexOf('name: Backup de la base'));
  t.ok(/psql "URI de la base" -f permisos\.sql/.test(head), 'el encabezado dice que después de restaurar se corre permisos.sql');
  t.has(head, 'supabase/auditoria.sql', 'el encabezado dice que se revisa con auditoria.sql antes de abrir la app');
  t.has(head, 'productos-off-servidor.sql', 'con una copia vieja (sin permisos-…sql), también se vuelven a cerrar las tablas');
}
