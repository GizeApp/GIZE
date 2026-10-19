// El historial de pg_cron (cron.job_run_details) no se borra solo: gize-descansos corre cada 5
// segundos (~17.000 filas por día) y la base del plan Free tiene 500 MB. supabase/cron-limpieza.sql
// programa una limpieza diaria de lo de más de 3 días, y se puede volver a correr sin duplicarla.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export default async ({ t }) => {
  const sql = fs.readFileSync(path.join(ROOT, 'supabase/cron-limpieza.sql'), 'utf8').replace(/--.*$/gm, '');
  const prog = sql.match(/cron\.schedule\('gize-cron-limpieza', '([^']+)', \$job\$([\s\S]*?)\$job\$\)/);
  t.ok(prog, 'programa la tarea gize-cron-limpieza');
  if (prog) {
    t.eq(prog[1].trim().split(/\s+/).length, 5, 'una vez por día (cron de 5 campos): ' + prog[1]);
    t.ok(/delete from cron\.job_run_details where end_time < now\(\) - interval '3 days'/.test(prog[2]), 'borra lo de más de 3 días');
  }
  t.ok(sql.indexOf("cron.unschedule('gize-cron-limpieza')") > -1 && sql.indexOf("cron.unschedule('gize-cron-limpieza')") < sql.indexOf("cron.schedule('gize-cron-limpieza'"), 'se puede volver a correr sin duplicarla');
  t.ok(!/delete from cron\.job_run_details(?![^;]*where)/.test(sql), 'nunca borra todo el historial');
};
