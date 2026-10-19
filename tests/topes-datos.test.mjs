// Tamaño máximo por fila y plantillas y preguntas solo para coaches (supabase/topes-datos.sql).
// Antes cualquier cuenta, aunque no fuera coach, podía guardar plantillas o preguntas enormes y
// llenar la base, y un coach podía mandarle a un alumno una rutina, ficha o plan gigante que la
// app descarga cada vez que abre (lo mismo un alumno con las respuestas del registro diario).
//   · CHECK con pg_column_size en routines, routine_templates, routine_schedule (days),
//     client_info y nutrition (la fila entera), coach_questions (daily, checkin) y
//     daily_logs.answers, con NOT VALID (lo que ya está no hace fallar el archivo).
//   · Los topes dejan mucho margen sobre lo que arma la app (rutinas armadas, planes guardados).
//   · Plantillas y preguntas: solo las crea o cambia un coach.
//   · Cantidad: 200 plantillas por coach y 60 rutinas programadas pendientes por alumno (de las
//     aplicadas quedan las 10 más nuevas). Cualquiera se registra como coach, y sin esto podía
//     guardar miles de plantillas de 500 KB o programar una rutina en cada fecha.
// Las pruebas no tienen Postgres: se revisa el SQL (se probó a mano contra un Postgres 16).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newPage, wait } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
const flat = s => s.replace(/\s+/g, ' ');
const COACH = "exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'coach')";

export default async function ({ base, t }){
  const sql = flat(read('supabase/topes-datos.sql'));
  t.ok(sql.length > 0, 'existe supabase/topes-datos.sql');
  // tabla → [constraint, expresión]
  const want = {
    routines: ['routines_days_size', 'pg_column_size(days) <= 500000'],
    routine_templates: ['routine_templates_days_size', 'pg_column_size(days) <= 500000'],
    routine_schedule: ['routine_schedule_days_size', 'pg_column_size(days) <= 500000'],
    client_info: ['client_info_size', 'pg_column_size(client_info.*) <= 200000'],
    nutrition: ['nutrition_size', 'pg_column_size(nutrition.*) <= 1000000'],
    coach_questions: ['coach_questions_size', 'pg_column_size(daily) <= 100000 and pg_column_size(checkin) <= 100000'],
    daily_logs: ['daily_logs_answers_size', 'pg_column_size(answers) <= 100000'],
  };
  for (const [tab, [con, expr]] of Object.entries(want)){
    t.ok(sql.includes('alter table public.' + tab + ' drop constraint if exists ' + con + ';'), tab + ': se puede volver a correr');
    t.ok(sql.includes('alter table public.' + tab + ' add constraint ' + con + ' check (' + expr + ') not valid;'), tab + ': tope de tamaño (' + expr + ')');
  }

  // La lista final mide como el CHECK cuando la app vuelve a guardar (sin comprimir: lo guardado
  // puede estar comprimido y parecer chico) y trae solo las tablas con filas que se pasan, así en
  // el log «Filas devueltas: 0» quiere decir que no hay ninguna.
  const fin = sql.slice(sql.lastIndexOf('select * from ('));
  t.ok(/\) x where se_pasan > 0;\s*$/.test(fin), 'la lista final trae solo las tablas con filas que se pasan');
  for (const [tab, col, max] of [['routines', 'days', 500000], ['routine_templates', 'days', 500000], ['routine_schedule', 'days', 500000],
    ['coach_questions', 'daily', 100000], ['coach_questions', 'checkin', 100000], ['daily_logs', 'answers', 100000]])
    t.ok(fin.includes('from public.' + tab + ' ') && fin.includes('pg_column_size(' + col + '::text::jsonb) > ' + max), 'lista: ' + tab + '.' + col + ' sin comprimir');
  for (const [tab, max] of [['client_info', 200000], ['nutrition', 1000000]])
    t.ok(new RegExp('pg_column_size\\(jsonb_populate_record\\(null::public\\.' + tab + ', to_jsonb\\(\\w\\)\\)\\) > ' + max).test(fin), 'lista: ' + tab + ', la fila entera sin comprimir');
  t.ok(!/pg_column_size\((days|daily|checkin|answers|c\.\*|n\.\*)\) >/.test(fin), 'lista: ya no mide lo guardado (comprimido)');

  // Margen: el plan de comidas guardado más grande entra en el del alumno, y las rutinas que trae
  // la app pesan mucho menos que el tope.
  const tpl = +((read('supabase/planes-alimenticios-guardados.sql').match(/pg_column_size\(plan\) <= (\d+)/) || [])[1] || 0);
  t.ok(tpl > 0 && tpl * 1.5 <= 1000000, 'un plan guardado del tamaño máximo (' + tpl + ') entra con margen en nutrition');
  const { p, errs, close } = await newPage({});
  await p.goto(base + '/app/'); await wait(1000);
  const max = await p.evaluate(async () => {
    const a = await import('/app/core/rutinas-ejemplo.js'), b = await import('/app/core/rutinas-disciplina.js');
    return Math.max(...a.CATALOGO.concat(b.RUTINAS_DISCIPLINA).map(r => new TextEncoder().encode(JSON.stringify(r.days || [])).length));
  });
  await close();
  t.ok(max > 1000 && max * 20 <= 500000, 'la rutina armada más grande (' + max + ' bytes) entra 20 veces en el tope');
  t.eq(errs, [], 'errores de la página');

  // Plantillas y preguntas: solo un coach las crea o cambia.
  t.ok(sql.includes('create policy "plantillas: el coach gestiona las suyas" on public.routine_templates for all using (coach_id = auth.uid()) with check (coach_id = auth.uid() and ' + COACH + ');'),
    'plantillas: solo un coach las crea o cambia');
  t.ok(sql.includes('create policy "coach gestiona sus preguntas" on public.coach_questions for all using (coach_id = auth.uid()) with check (coach_id = auth.uid() and ' + COACH + ');'),
    'preguntas: solo un coach las crea o cambia');
  // Los archivos de antes no las vuelven a abrir si se corren de nuevo.
  t.ok(flat(read('supabase/preguntas-coach.sql')).includes('for all using (coach_id = auth.uid()) with check (coach_id = auth.uid() and ' + COACH + ');'), 'preguntas-coach.sql: la misma política');
  t.ok(flat(read('supabase/base.sql')).includes('on public.routine_templates for all using (coach_id = auth.uid()) with check (coach_id = auth.uid() and ' + COACH + ');'), 'base.sql: la misma política');
  t.has(read('supabase/base.sql'), 'topes-datos.sql', 'base.sql dice que después va topes-datos.sql');

  // Cantidad de plantillas y de programadas: un trigger antes de cada alta, de a una por coach o
  // por alumno (lock), así dos a la vez no pasan el tope.
  const fn = n => (sql.match(new RegExp('create or replace function public\\.' + n + '\\(\\) returns trigger language plpgsql security definer set search_path = public as \\$\\$.*?\\$\\$;')) || [''])[0];
  const tpls = fn('routine_templates_tope'), sch = fn('routine_schedule_tope');
  t.ok(tpls.includes("if exists (select 1 from public.routine_templates where id = new.id) then return new; end if;"), 'plantillas: editar una que ya está (upsert) no suma');
  t.ok(tpls.includes("perform pg_advisory_xact_lock(hashtextextended('routine_templates ' || new.coach_id, 0)); if (select count(*) from public.routine_templates where coach_id = new.coach_id) >= 200 then raise exception 'Llegaste al máximo de rutinas guardadas (200)."),
    'plantillas: 200 por coach, de a una');
  t.ok(sch.includes("perform pg_advisory_xact_lock(hashtextextended('routine_schedule ' || new.client_id, 0));"), 'programadas: de a una por alumno');
  t.ok(sch.includes("delete from public.routine_schedule where id in ( select id from public.routine_schedule where client_id = new.client_id and applied_at is not null order by applied_at desc offset 10);"),
    'programadas: de las aplicadas quedan las 10 más nuevas (programar para hoy una y otra vez no las junta)');
  t.ok(sch.includes("if (select count(*) from public.routine_schedule where client_id = new.client_id and applied_at is null) >= 60 then raise exception"), 'programadas: 60 pendientes por alumno');
  for (const [tab, f] of [['routine_templates', 'routine_templates_tope'], ['routine_schedule', 'routine_schedule_tope']]){
    t.ok(sql.includes('revoke all on function public.' + f + '() from public, anon, authenticated;'), f + ': no se llama desde la app');
    t.ok(sql.includes('drop trigger if exists ' + f + ' on public.' + tab + '; create trigger ' + f + ' before insert on public.' + tab + ' for each row execute function public.' + f + '();'), tab + ': trigger antes de cada alta (se puede volver a correr)');
  }
  // La app muestra el mensaje de la base al guardar (los dos casos dicen «No se pudo: …»).
  const main = read('app/main.js');
  t.ok(/routine_templates"\)\.upsert\(row\)\.select\(\);\s*if\(r\.error\) throw r\.error;[\s\S]{0,200}catch\(err\)\{ alert\("No se pudo: "\+\(\(err&&err\.message\)\|\|err\)\); \}/.test(main), 'plantillas: la app muestra el mensaje del tope');
  t.ok(/routine_schedule"\)\.insert\(row\);\s*if\(r\.error\)\{ if\(r\.error\.code==="23505"\)[^\n]*throw r\.error; \}[\s\S]{0,400}catch\(err\)\{ alert\("No se pudo: "\+\(\(err&&err\.message\)\|\|err\)\)/.test(main), 'programadas: la app muestra el mensaje del tope');
}
