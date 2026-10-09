// Los mensajes que arma el servidor y que ven también las apps de Android e iPhone no mandan a
// renovar ni a ampliar el plan (Google y Apple no dejan mandar a pagar por fuera de sus tiendas):
// el chat con el plan del coach vencido (función de mensajes, publicada como rapid-worker) y el
// alumno que se quiere vincular con un coach vencido o lleno (join_coach, coach-alumnos.sql).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const MANDA = /renov|renuev|ampl[ií]|eleg[ií] un plan|pag[aá]/i;

export default async ({ t }) => {
  const fn = leer('supabase/functions/notificar-cliente/index.ts');
  const chat = [...fn.matchAll(/json\(\{ error: fromClient \? "([^"]+)" : "([^"]+)" \}, 402\)/g)].flatMap(m => [m[1], m[2]]);
  t.eq(chat.length, 2, 'chat: los dos textos del plan vencido');
  for (const m of chat) t.ok(!MANDA.test(m), 'chat: no manda a renovar: ' + m);

  const sql = leer('supabase/coach-alumnos.sql');
  const join = [...sql.matchAll(/raise exception '([^']+)'/g)].map(m => m[1]).filter(m => /coach/i.test(m));
  t.ok(join.some(m => /vencido/.test(m)) && join.some(m => /máximo/.test(m)), 'join_coach: avisa vencido y lleno: ' + join.join(' | '));
  for (const m of join) t.ok(!MANDA.test(m), 'join_coach: no manda a renovar ni a ampliar: ' + m);
};
