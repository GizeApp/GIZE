-- Disciplina de cada alumno (CrossFit, powerlifting, weightlifting, running, híbrido, fuerza e
-- hipertrofia): la elige en Ajustes y la app le muestra primero esos ejercicios al armar la
-- rutina (app/core/disciplinas.js). Viaja con las preferencias del alumno.
-- Correr con el workflow "Supabase" → tarea sql → supabase/disciplinas.sql. Se puede volver a correr.
-- Mientras no se corra, la app guarda la disciplina solo en el celular y sube el resto igual.
alter table public.client_prefs add column if not exists disciplines jsonb;

notify pgrst, 'reload schema';
