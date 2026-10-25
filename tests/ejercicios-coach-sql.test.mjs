// supabase/ejercicios-coach.sql (mi configuración de cada ejercicio del coach), leído: acá no hay
// Postgres. Revisa que cada coach vea y toque solo las suyas, que para crear o editar haya que ser
// coach, que nada quede para anon, una fila por coach y ejercicio (el upsert de la app), límites de
// tamaño, que al borrar la cuenta se borren y que se pueda volver a correr.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sql = fs.readFileSync(path.join(ROOT, 'supabase/ejercicios-coach.sql'), 'utf8');
const code = sql.replace(/--[^\n]*/g, '');
const pol = verbo => { const m = code.match(new RegExp('create policy "[^"]+" on public\\.coach_ex_presets\\s+for ' + verbo + '([\\s\\S]*?);')); return m ? m[1] : ''; };

export default async ({ t }) => {
  t.has(sql, 'Correr con el workflow "Supabase" → tarea sql → supabase/ejercicios-coach.sql', 'encabezado: cómo correrlo');
  t.has(sql, 'Se puede correr', 'encabezado: se puede correr varias veces');
  t.ok(/create table if not exists public\.coach_ex_presets/.test(code), 'la tabla se crea solo si no está');
  t.ok(/coach_id\s+uuid not null default auth\.uid\(\) references auth\.users\(id\) on delete cascade/.test(code), 'del coach que la crea, y se borra con su cuenta');
  t.ok(/unique \(coach_id, clave\)/.test(code), 'una fila por coach y ejercicio (on_conflict=coach_id,clave de la app)');
  t.ok(/pg_column_size\(cfg\) <= 8000/.test(code) && /jsonb_typeof\(cfg\) = 'object'/.test(code), 'la configuración es un objeto chico');
  t.ok(/between 1 and 120/.test(code), 'nombres cortos');
  t.ok(/alter table public\.coach_ex_presets enable row level security/.test(code), 'RLS prendido');
  for (const v of ['select', 'insert', 'update', 'delete']) t.ok(/coach_id = auth\.uid\(\)/.test(pol(v)), v + ': solo las suyas');
  t.ok(/p\.role = 'coach'/.test(pol('insert')) && /with check \(coach_id = auth\.uid\(\)[\s\S]*p\.role = 'coach'/.test(pol('update')), 'crear y editar: solo si es coach');
  t.ok(/revoke all on public\.coach_ex_presets from anon/.test(code) && !/grant[^;]*to anon/.test(code), 'nada para anon');
  t.ok((code.match(/drop policy if exists/g) || []).length === 4 && (code.match(/drop constraint if exists/g) || []).length === 2, 'se puede volver a correr (borra antes de crear)');
  t.ok(/notify pgrst, 'reload schema'/.test(code), 'la API ve la tabla sin esperar');
  t.ok(!/@[a-z0-9-]+\.[a-z]/i.test(sql), 'sin mails ni datos de nadie');
};
