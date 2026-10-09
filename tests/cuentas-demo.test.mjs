// Cuentas demo de la revisión de las tiendas (supabase/cuentas-demo.sql, tarea cuentas-demo):
// los mails y la contraseña salen de los secrets (el archivo es público y lo sirve gize.ar), y al
// cambiar la contraseña se cierran las sesiones abiertas de las dos cuentas (si no, quien entró
// con la contraseña anterior seguía adentro).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export default async ({ t }) => {
  const sql = fs.readFileSync(path.join(ROOT, 'supabase/cuentas-demo.sql'), 'utf8');
  t.ok(!/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/.test(sql), 'sin mails escritos en el archivo');
  for (const m of ['__DEMO_COACH__', '__DEMO_CLIENTE__', '__DEMO_PASSWORD__']) t.ok(sql.includes(m), 'usa la marca ' + m);
  const cuerpo = sql.replace(/--.*$/gm, '');
  t.ok(/delete from auth\.sessions where user_id in \(coach, client\)/.test(cuerpo), 'cierra las sesiones de las dos cuentas');
  t.ok(/delete from auth\.refresh_tokens where user_id in \(coach::text, client::text\)/.test(cuerpo), 'y sus tokens de renovación');
  t.ok(cuerpo.indexOf('delete from auth.sessions') > cuerpo.indexOf('end loop'), 'después de tener las dos cuentas');
};
