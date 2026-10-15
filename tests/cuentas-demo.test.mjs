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
  for (const m of ['__DEMO_COACH__', '__DEMO_CLIENTE__', '__DEMO_COACHIOS__', '__DEMO_PASSWORD__']) t.ok(sql.includes(m), 'usa la marca ' + m);
  const cuerpo = sql.replace(/--.*$/gm, '');
  t.ok(/delete from auth\.sessions where user_id in \(coach, client, coachios\)/.test(cuerpo), 'cierra las sesiones de las tres cuentas');
  t.ok(/delete from auth\.refresh_tokens where user_id in \(coach::text, client::text, coachios::text\)/.test(cuerpo), 'y sus tokens de renovación');
  t.ok(cuerpo.indexOf('delete from auth.sessions') > cuerpo.indexOf('end loop'), 'después de tener las cuentas');
  // El coach de la revisión de Apple queda sin plan (prueba vencida, sin nada pagado ni comprado), así
  // en el iPhone ve los planes de Apple; el coach demo de Google sigue con cortesía.
  t.ok(/delete from public\.apple_subs where user_id = coachios/.test(cuerpo), 'borra lo comprado con Apple por el coach de la revisión');
  t.ok(/values \(coachios, 'trial', 10, now\(\) - interval '1 day'\)/.test(cuerpo), 'coach de la revisión: prueba vencida');
  t.ok(/paid_until = null[\s\S]*apple_vence = null/.test(cuerpo), 'y sin nada pagado');
  t.ok(/values \(coach, 'cortesia', 50\)/.test(cuerpo), 'el coach demo sigue con cortesía');
  const wf = fs.readFileSync(path.join(ROOT, '.github/workflows/supabase.yml'), 'utf8');
  t.ok(/replace\("__DEMO_COACHIOS__", m\[1\]\+"\+coachios@"\+m\[2\]\)/.test(wf), 'el workflow arma el mail del coach de la revisión desde DEMO_EMAIL');
};
