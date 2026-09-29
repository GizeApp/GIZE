-- Salidas de correr, caminar o bici registradas con el GPS (Cardio → «Salir a correr…»).
-- Solo el resumen: tipo, fecha, duración, distancia, calorías y velocidades. El recorrido
-- (las coordenadas) no va acá: va en public.cardio_routes (supabase/cardio-recorridos.sql),
-- que ve solo el alumno. El coach lee esta tabla, nunca la de los recorridos.
--
-- Correr con el workflow "Supabase" → tarea sql → supabase/cardio-salidas.sql (o pegarlo en
-- Supabase → SQL Editor). Se puede volver a correr sin problema.
--
-- Mientras no se corra, la app sigue funcionando: las salidas quedan en el celular (y en la
-- cola de envío, sin trabar lo demás) y suben solas cuando la tabla existe.

create table if not exists public.cardio_sessions (
  id            uuid primary key,
  client_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  performed_on  date not null,
  started_at    timestamptz,
  kind          text not null,
  duration_s    integer not null,
  distance_m    integer not null default 0,
  kcal          integer,
  avg_speed_kmh numeric(6,2),
  max_speed_kmh numeric(6,2),
  created_at    timestamptz not null default now()
);

-- Límites razonables (la app ya los respeta): hasta 24 h, 1000 km, 20000 kcal y 200 km/h.
alter table public.cardio_sessions drop constraint if exists cardio_sessions_kind_check;
alter table public.cardio_sessions add constraint cardio_sessions_kind_check check (kind in ('correr', 'caminar', 'bici'));
alter table public.cardio_sessions drop constraint if exists cardio_sessions_duration_s_check;
alter table public.cardio_sessions add constraint cardio_sessions_duration_s_check check (duration_s > 0 and duration_s <= 86400);
alter table public.cardio_sessions drop constraint if exists cardio_sessions_distance_m_check;
alter table public.cardio_sessions add constraint cardio_sessions_distance_m_check check (distance_m >= 0 and distance_m <= 1000000);
alter table public.cardio_sessions drop constraint if exists cardio_sessions_kcal_check;
alter table public.cardio_sessions add constraint cardio_sessions_kcal_check check (kcal is null or (kcal >= 0 and kcal <= 20000));
alter table public.cardio_sessions drop constraint if exists cardio_sessions_speed_check;
alter table public.cardio_sessions add constraint cardio_sessions_speed_check check (
  (avg_speed_kmh is null or (avg_speed_kmh >= 0 and avg_speed_kmh <= 200)) and
  (max_speed_kmh is null or (max_speed_kmh >= 0 and max_speed_kmh <= 200)));

create index if not exists cardio_sessions_client_fecha on public.cardio_sessions (client_id, performed_on);

-- RLS: el alumno crea, lee y borra las suyas (no las edita); su coach actual las lee
-- (is_my_client, el mismo criterio que sessions en base.sql).
alter table public.cardio_sessions enable row level security;
drop policy if exists "cardio: cliente crea la suya" on public.cardio_sessions;
create policy "cardio: cliente crea la suya" on public.cardio_sessions
  for insert with check (client_id = auth.uid());
drop policy if exists "cardio: cliente borra la suya" on public.cardio_sessions;
create policy "cardio: cliente borra la suya" on public.cardio_sessions
  for delete using (client_id = auth.uid());
drop policy if exists "cardio: cliente y su coach" on public.cardio_sessions;
create policy "cardio: cliente y su coach" on public.cardio_sessions
  for select using ((client_id = auth.uid()) or is_my_client(client_id));

-- Permisos mínimos: nada para anónimos; los usuarios con sesión, leer, crear y borrar
-- (siempre filtrado por las políticas de arriba).
revoke all on public.cardio_sessions from anon, authenticated;
grant select, insert, delete on public.cardio_sessions to authenticated;

-- Que la API (PostgREST) vea la tabla nueva sin esperar.
notify pgrst, 'reload schema';

select 'cardio_sessions' as tabla, count(*) as filas from public.cardio_sessions;
