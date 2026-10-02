-- Planes alimenticios guardados del coach («Mis planes»): el coach guarda un plan como
-- plantilla y después se lo aplica a uno o varios clientes (se copia a public.nutrition).
-- Correr en Supabase → SQL Editor. Se puede volver a correr sin problema.
--
-- Mientras no se corra, la app sigue funcionando: «Mis planes» avisa que falta este paso y
-- el plan de cada cliente se edita igual que siempre.

-- 1) Una fila por plan guardado. El plan va en el mismo formato que nutrition.plan.
create table if not exists public.coach_meal_templates (
  id         uuid primary key default gen_random_uuid(),
  coach_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  plan       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Límites sanos: nombre corto, plan en objeto JSON y de tamaño razonable.
alter table public.coach_meal_templates drop constraint if exists coach_meal_templates_name_ok;
alter table public.coach_meal_templates add constraint coach_meal_templates_name_ok
  check (char_length(btrim(name)) between 1 and 120);
alter table public.coach_meal_templates drop constraint if exists coach_meal_templates_plan_ok;
alter table public.coach_meal_templates add constraint coach_meal_templates_plan_ok
  check (jsonb_typeof(plan) = 'object' and pg_column_size(plan) <= 512000);

create index if not exists coach_meal_templates_coach_idx on public.coach_meal_templates (coach_id);

-- 2) Seguridad: cada coach ve, crea, edita y borra solo los suyos, y solo si es coach.
alter table public.coach_meal_templates enable row level security;

drop policy if exists "planes guardados: el coach ve los suyos" on public.coach_meal_templates;
create policy "planes guardados: el coach ve los suyos" on public.coach_meal_templates
  for select using (coach_id = auth.uid());

drop policy if exists "planes guardados: el coach crea los suyos" on public.coach_meal_templates;
create policy "planes guardados: el coach crea los suyos" on public.coach_meal_templates
  for insert with check (coach_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'coach'));

drop policy if exists "planes guardados: el coach edita los suyos" on public.coach_meal_templates;
create policy "planes guardados: el coach edita los suyos" on public.coach_meal_templates
  for update using (coach_id = auth.uid())
  with check (coach_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'coach'));

drop policy if exists "planes guardados: el coach borra los suyos" on public.coach_meal_templates;
create policy "planes guardados: el coach borra los suyos" on public.coach_meal_templates
  for delete using (coach_id = auth.uid());

-- Nada para usuarios sin sesión.
revoke all on public.coach_meal_templates from anon;
grant select, insert, update, delete on public.coach_meal_templates to authenticated;

-- 3) Que la API (PostgREST) vea la tabla nueva sin esperar.
notify pgrst, 'reload schema';
