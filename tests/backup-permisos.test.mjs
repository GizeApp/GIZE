// Copia de seguridad (.github/workflows/backup.yml): al restaurarla, las funciones internas de la
// base no pueden quedar abiertas. Antes la copia iba sin permisos (--no-privileges) y, al
// restaurarla, funciones que cuida solo un REVOKE (tomar_avisos_vence, pasos_totales,
// product_off_lookup, cron_secret…) quedaban abiertas para cualquiera con la clave pública.
// Con los permisos en la copia no alcanza: en Supabase lo que se crea en public nace abierto para
// anon y authenticated, y la copia no lo deshace. Por eso:
//   · la copia lleva los permisos y además se guarda (cifrado) permisos-AAAA-MM-DD.sql, que
//     vuelve a cerrar lo que en la original estaba cerrado, sin dar ningún permiso nuevo;
//   · la prueba de restaurar usa una base abierta como Supabase, le corre ese .sql y compara
//     función por función con la original (si alguna queda más abierta, sale en rojo);
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
  t.ok(/alter default privileges in schema public grant all on functions to anon, authenticated, service_role;/.test(y), 'la base de prueba nace abierta como Supabase');

  // El .sql que cierra: solo revoke, a public y al rol que en la original no podía.
  const cerrar = (y.match(/CERRAR: >-\n([\s\S]*?)\n      #/) || ['', ''])[1].replace(/\s+/g, ' ');
  t.ok(/select format\('revoke execute on function %I\.%I\(%s\) from public, %s;'/.test(cerrar), 'permisos.sql: solo saca permisos (revoke)');
  t.ok(/case when not has_function_privilege\('anon', p\.oid, 'execute'\) then 'anon' end/.test(cerrar)
    && /case when not has_function_privilege\('authenticated', p\.oid, 'execute'\) then 'authenticated' end/.test(cerrar), 'permisos.sql: a anon y authenticated, donde en la original no podían');
  t.ok(!/\bgrant\b/i.test(cerrar), 'permisos.sql: no da ningún permiso');
  t.ok(/\$PG psql "\$DB_URL" -Atc "\$CERRAR" > out\/permisos\.sql/.test(y), 'permisos.sql sale de la base original');
  t.ok(/-o "out\/permisos-\$\(date -u \+%F\)\.sql\.gpg" out\/permisos\.sql/.test(y) && /path: out\/\*\.gpg/.test(y), 'permisos.sql se guarda cifrado junto con la copia');

  // La prueba: después de subir la copia, aplica permisos.sql y compara con la original.
  const step = (y.match(/- name: Probar los permisos de las funciones\n[\s\S]*?(?=\n      - name:)/) || [''])[0];
  t.ok(step.includes('-f /out/permisos.sql') && step.indexOf('-f /out/permisos.sql') < step.indexOf('"$PERMISOS"'), 'la prueba corre permisos.sql antes de comparar');
  t.ok(y.indexOf('- name: Probar los permisos de las funciones') > y.indexOf('actions/upload-artifact'), 'la prueba va después de subir la copia (si falla, la copia igual queda)');
  const line = (step.match(/abiertas=\$\(join[^\n]*\)/) || [''])[0];
  t.ok(!!line && /exit 1/.test(step), 'si alguna función queda más abierta, sale en rojo');
  if (line){
    // La comparación de verdad, con archivos de ejemplo (nombre|anon|auth, ordenados).
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gize-permisos-')), out = path.join(dir, 'out');
    fs.mkdirSync(out);
    fs.writeFileSync(path.join(out, 'permisos.txt'), 'pasos_ranking(uuid,date)|f|t\npublica(integer)|t|t\ntomar_avisos_vence()|f|f\n');
    const run = copia => { fs.writeFileSync(path.join(out, 'permisos-copia.txt'), copia);
      return execFileSync('bash', ['-c', line + '; echo "$abiertas"'], { cwd: dir, encoding: 'utf8' }).trim(); };
    t.eq(run('pasos_ranking(uuid,date)|f|t\npublica(integer)|t|t\ntomar_avisos_vence()|f|f\n'), '', 'igual que la original: nada abierto');
    t.eq(run('pasos_ranking(uuid,date)|t|t\npublica(integer)|t|t\ntomar_avisos_vence()|t|t\n').split('\n'), ['pasos_ranking(uuid,date)', 'tomar_avisos_vence()'], 'más abiertas que la original: se avisan');
    t.eq(run('publica(integer)|t|t\n'), '', 'las que no se restauraron no cuentan');
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // Cómo restaurar de verdad.
  const head = y.slice(0, y.indexOf('name: Backup de la base'));
  t.ok(/psql "URI de la base" -f permisos\.sql/.test(head), 'el encabezado dice que después de restaurar se corre permisos.sql');
  t.has(head, 'supabase/auditoria.sql', 'el encabezado dice que se revisa con auditoria.sql antes de abrir la app');
}
