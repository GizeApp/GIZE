-- Fecha en que el alumno cargó el check-in semanal: el coach la ve («1 de octubre de 2026») en
-- vez de «Semana del …» (app/screens/coach/seguimiento.js). Se puede correr varias veces.
-- Si la tabla ya tenía created_at, no cambia nada. Si no lo tenía, se agrega VACÍO para los
-- check-ins de antes (no se inventa una fecha: siguen mostrando la semana) y desde ahora cada
-- check-in nuevo guarda el momento en que se cargó.
alter table public.checkins add column if not exists created_at timestamptz;
alter table public.checkins alter column created_at set default now();
notify pgrst, 'reload schema';
