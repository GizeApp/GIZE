// Los mensajes que arma el servidor y que ven también las apps de Android e iPhone no mandan a
// renovar ni a ampliar el plan (Google y Apple no dejan mandar a pagar por fuera de sus tiendas):
// el chat con el plan del coach vencido (función de mensajes, publicada como rapid-worker) y el
// alumno que se quiere vincular con un coach vencido o lleno (join_coach, coach-alumnos.sql).
// Gimnasios (etapa 1): lo mismo para lo que el servidor nuevo les contesta a las apps, también a las
// viejas que no se actualizaron (§3.4): join_coach canónica (gimnasios-vinculo.sql, con el «Listo: le
// pediste a … que te sume» que sale como error), las RPC del socio, del profe y de la recepción
// (gimnasios-socios.sql) y lo que lee la app del plan de un profe sin cargo (nada: no ve su fila). Los
// textos del admin (gimnasios-admin.sql) no los ve ninguna app, y el mail de vence-plan va por mail.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const MANDA = /renov|renuev|ampl[ií]|eleg[ií] un plan|pag[aá]/i;

export default async ({ t }) => {
  const fn = leer('supabase/functions/notificar-cliente/index.ts');
  // Los textos del 402 (plan vencido; con gimnasios, también el acceso del gimnasio pausado).
  const fin402 = fn.indexOf('}, 402)'), bloque = fin402 < 0 ? '' : fn.slice(fn.lastIndexOf('return json({ error:', fin402), fin402);
  const chat = [...bloque.matchAll(/"([^"]+)"/g)].map(m => m[1]);
  t.eq(chat.length, 4, 'chat: los textos del plan vencido (del coach y, dentro de un gimnasio, del acceso pausado)');
  for (const m of chat) t.ok(!MANDA.test(m), 'chat: no manda a renovar: ' + m);

  const sql = leer('supabase/coach-alumnos.sql');
  const join = [...sql.matchAll(/raise exception '([^']+)'/g)].map(m => m[1]).filter(m => /coach/i.test(m));
  t.ok(join.some(m => /vencido/.test(m)) && join.some(m => /máximo/.test(m)), 'join_coach: avisa vencido y lleno: ' + join.join(' | '));
  for (const m of join) t.ok(!MANDA.test(m), 'join_coach: no manda a renovar ni a ampliar: ' + m);

  const vinc = leer('supabase/gimnasios-vinculo.sql');
  const jc = vinc.slice(vinc.indexOf('create or replace function public.join_coach('), vinc.indexOf('end $$;', vinc.indexOf('create or replace function public.join_coach(')));
  const jcTextos = [...jc.matchAll(/raise exception '([^']+)'/g), ...jc.matchAll(/'message', '([^']+)'/g)].map(m => m[1]);
  t.ok(jcTextos.some(m => /^Listo: le pediste a/.test(m)) && jcTextos.length >= 8, 'join_coach con gimnasios: sus textos (' + jcTextos.length + ')');
  for (const m of jcTextos) t.ok(!MANDA.test(m), 'join_coach con gimnasios: no manda a renovar ni a pagar: ' + m);
  const socios = leer('supabase/gimnasios-socios.sql');
  const sTextos = [...socios.matchAll(/raise exception '([^']+)'/g)].map(m => m[1]).filter(m => !/^Primero /.test(m) && !/^Faltan /.test(m));
  t.ok(sTextos.length > 40, 'gimnasios-socios.sql: textos de error (' + sTextos.length + ')');
  for (const m of sTextos) t.ok(!MANDA.test(m), 'gimnasios-socios.sql: no manda a renovar ni a pagar: ' + m);
  // El profe sin cargo con la app vieja no ve su fila de coach_billing: ni la tira ni la pantalla de pago.
  t.ok(/create policy "billing: el coach ve la suya" on public\.coach_billing\s+for select to authenticated using \(coach_id = \(select auth\.uid\(\)\) and not public\.gym_mi_fila_oculta\(\)\)/.test(vinc),
    'la fila del plan del profe sin cargo no llega a la app (gym_mi_fila_oculta)');
};
