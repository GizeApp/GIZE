-- Preguntas propias del coach para el "Registro de hoy" y el "Check-in semanal".
-- Correr UNA vez en Supabase → SQL Editor. Se puede volver a correr sin problema.
--
-- Mientras no se corra, la app sigue funcionando: los clientes ven las preguntas de
-- siempre y el editor del coach avisa que falta este paso.

-- 1) Una fila por coach con sus preguntas (listas en JSON).
create table if not exists public.coach_questions (
  coach_id   uuid primary key references auth.users(id) on delete cascade,
  daily      jsonb,
  checkin    jsonb,
  updated_at timestamptz not null default now()
);

alter table public.coach_questions enable row level security;

-- El coach lee y escribe solo su fila, y solo un coach la crea o cambia (antes cualquier
-- cuenta). Igual que en topes-datos.sql, que además pone el tope de tamaño de las preguntas.
drop policy if exists "coach gestiona sus preguntas" on public.coach_questions;
create policy "coach gestiona sus preguntas" on public.coach_questions
  for all using (coach_id = auth.uid())
  with check (coach_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'coach'));

-- Cada cliente puede leer (no modificar) las preguntas de su coach.
drop policy if exists "cliente lee las preguntas de su coach" on public.coach_questions;
create policy "cliente lee las preguntas de su coach" on public.coach_questions
  for select using (coach_id = (select p.coach_id from public.profiles p where p.id = auth.uid()));

-- 2) Respuestas del registro diario a preguntas nuevas (las de siempre siguen en sus
--    columnas: soreness, performance, motivation, hunger, fatigue, sleep, comment).
alter table public.daily_logs add column if not exists answers jsonb;

-- Que la API (PostgREST) vea la tabla y la columna nuevas sin esperar.
notify pgrst, 'reload schema';
