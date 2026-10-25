-- Mi configuración de cada ejercicio (coach): el coach guarda, para un ejercicio («Vuelos laterales
-- sentado»), las series con su rango de reps, si se mide por tiempo, el descanso y el RIR. Cuando
-- agrega ese ejercicio a cualquier rutina arranca con eso cargado, y después lo cambia para cada
-- cliente sin tocar lo guardado.
-- Correr con el workflow "Supabase" → tarea sql → supabase/ejercicios-coach.sql. Se puede correr
-- varias veces. Va después de supabase/base.sql (profiles).
--
-- Mientras no se corra, la app sigue funcionando: los botones de «mi configuración» no aparecen.

-- 1) Una fila por ejercicio de cada coach. «clave» es el nombre en minúsculas y sin tildes (para que
-- «Vuelos laterales sentado» y «vuelos laterales sentado» sean el mismo); «nombre» es como lo escribió.
create table if not exists public.coach_ex_presets (
  id         uuid primary key default gen_random_uuid(),
  coach_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  clave      text not null,
  nombre     text not null,
  cfg        jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (coach_id, clave)
);

-- Límites sanos: nombres cortos y la configuración en un objeto JSON chico.
alter table public.coach_ex_presets drop constraint if exists coach_ex_presets_nombre_ok;
alter table public.coach_ex_presets add constraint coach_ex_presets_nombre_ok
  check (char_length(btrim(nombre)) between 1 and 120 and char_length(clave) between 1 and 120);
alter table public.coach_ex_presets drop constraint if exists coach_ex_presets_cfg_ok;
alter table public.coach_ex_presets add constraint coach_ex_presets_cfg_ok
  check (jsonb_typeof(cfg) = 'object' and pg_column_size(cfg) <= 8000);

-- 2) Seguridad: cada coach ve, crea, edita y borra solo las suyas, y solo si es coach.
alter table public.coach_ex_presets enable row level security;

drop policy if exists "config ejercicios: el coach ve las suyas" on public.coach_ex_presets;
create policy "config ejercicios: el coach ve las suyas" on public.coach_ex_presets
  for select using (coach_id = auth.uid());

drop policy if exists "config ejercicios: el coach crea las suyas" on public.coach_ex_presets;
create policy "config ejercicios: el coach crea las suyas" on public.coach_ex_presets
  for insert with check (coach_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'coach'));

drop policy if exists "config ejercicios: el coach edita las suyas" on public.coach_ex_presets;
create policy "config ejercicios: el coach edita las suyas" on public.coach_ex_presets
  for update using (coach_id = auth.uid())
  with check (coach_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'coach'));

drop policy if exists "config ejercicios: el coach borra las suyas" on public.coach_ex_presets;
create policy "config ejercicios: el coach borra las suyas" on public.coach_ex_presets
  for delete using (coach_id = auth.uid());

-- Nada para usuarios sin sesión.
revoke all on public.coach_ex_presets from anon;
grant select, insert, update, delete on public.coach_ex_presets to authenticated;

-- 3) Que la API (PostgREST) vea la tabla nueva sin esperar.
notify pgrst, 'reload schema';
