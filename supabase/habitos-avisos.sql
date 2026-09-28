-- Días y aviso de cada hábito (app: Hábitos → ⏰, ver app/screens/habitos.js y
-- app/ui/habitnotif.js). Se guarda aparte de la lista de hábitos para que una versión vieja
-- de la app (que reescribe la lista sin conocer los avisos) no los borre.
-- Forma: { "own": { "<id del hábito>": { "days": [1,4], "time": "09:00" } },
--          "coach": { "<nombre del hábito del coach>": { "days": [4], "time": "18:30" } } }
-- Los días de los hábitos del coach van en su plan (nutrition.plan.habitDays).
-- Correr con el workflow "Supabase" → tarea sql → supabase/habitos-avisos.sql, ANTES de publicar
-- la app que lo usa (si la columna no existe, las preferencias no se pueden guardar). Se puede
-- volver a correr.
alter table public.client_prefs add column if not exists habit_alarms jsonb;
alter table public.client_prefs drop constraint if exists client_prefs_habit_alarms_check;
alter table public.client_prefs add constraint client_prefs_habit_alarms_check
  check (habit_alarms is null or (jsonb_typeof(habit_alarms) = 'object' and pg_column_size(habit_alarms) < 20000));

notify pgrst, 'reload schema';
