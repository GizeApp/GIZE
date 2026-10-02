-- Salidas de Cardio «A pie» o «En bici» (app/core/cardiogps.js, app/ui/gps.js, app/core/salidas.js).
-- Una fila por salida: el resumen (modo, fecha, duración, distancia, calorías, velocidades, cuánto
-- caminó, trotó o corrió, tramos y parciales) y el recorrido (track: polyline de Google de 3
-- dimensiones, latitud / longitud / segundos desde el inicio; ver encodeTrack en cardiogps.js).
-- El recorrido lo pide la app de a una salida, al abrirla (las listas no lo traen).
--
-- Quién la ve: el alumno y su coach actual (is_my_client, el mismo criterio que sessions en
-- base.sql). Si el alumno se desvincula, el coach deja de verla. Nadie más.
-- Se borra al borrar la salida o la cuenta: delete_own_account() (base.sql / pagos-seguros.sql,
-- la llama la función borrar-audios) y la función admin («eliminar») borran auth.users, y esta
-- tabla se va en cascada (on delete cascade). No hay archivos en Storage: nada más que borrar.
--
-- Nombres nuevos a propósito: las tablas de la versión anterior con GPS (cardio_sessions y
-- cardio_routes) las borró supabase/cardio-sin-gps.sql y no vuelven. No correr de nuevo
-- cardio-salidas.sql ni cardio-recorridos.sql.
--
-- Correr con el workflow "Supabase" → tarea sql → supabase/cardio-a-pie.sql (o pegarlo en
-- Supabase → SQL Editor). Se puede volver a correr sin problema.
--
-- Mientras no se corra, la app sigue funcionando: las salidas quedan guardadas en el celular (y
-- en la cola de envío, sin trabar lo demás) y suben solas cuando la tabla existe.

create table if not exists public.cardio_outings (
  id             uuid primary key,
  client_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  mode           text not null,
  performed_on   date not null,
  started_at     timestamptz not null,
  ended_at       timestamptz,
  duration_s     integer not null,
  moving_s       integer not null default 0,
  distance_m     integer not null default 0,
  kcal           integer,
  avg_speed_kmh  numeric(6,2),
  max_speed_kmh  numeric(6,2),
  weight_kg      numeric(5,1),
  weight_default boolean not null default false,
  gap_s          integer not null default 0,
  breakdown      jsonb not null default '{}'::jsonb,
  segments       jsonb not null default '[]'::jsonb,
  splits         jsonb not null default '[]'::jsonb,
  track          text,
  points         integer,
  created_at     timestamptz not null default now()
);

-- Límites razonables (la app ya los respeta, ver summarize en cardiogps.js): hasta 24 h, 1000 km,
-- 20000 kcal, 200 km/h, 200 tramos, 1000 parciales y 200.000 caracteres de recorrido.
alter table public.cardio_outings drop constraint if exists cardio_outings_mode_check;
alter table public.cardio_outings add constraint cardio_outings_mode_check check (mode in ('pie', 'bici'));
alter table public.cardio_outings drop constraint if exists cardio_outings_duration_s_check;
alter table public.cardio_outings add constraint cardio_outings_duration_s_check check (duration_s >= 1 and duration_s <= 86400);
alter table public.cardio_outings drop constraint if exists cardio_outings_moving_s_check;
alter table public.cardio_outings add constraint cardio_outings_moving_s_check check (moving_s >= 0 and moving_s <= 86400);
alter table public.cardio_outings drop constraint if exists cardio_outings_distance_m_check;
alter table public.cardio_outings add constraint cardio_outings_distance_m_check check (distance_m >= 0 and distance_m <= 1000000);
alter table public.cardio_outings drop constraint if exists cardio_outings_kcal_check;
alter table public.cardio_outings add constraint cardio_outings_kcal_check check (kcal is null or (kcal >= 0 and kcal <= 20000));
alter table public.cardio_outings drop constraint if exists cardio_outings_speed_check;
alter table public.cardio_outings add constraint cardio_outings_speed_check check (
  (avg_speed_kmh is null or (avg_speed_kmh >= 0 and avg_speed_kmh <= 200)) and
  (max_speed_kmh is null or (max_speed_kmh >= 0 and max_speed_kmh <= 200)));
alter table public.cardio_outings drop constraint if exists cardio_outings_weight_kg_check;
alter table public.cardio_outings add constraint cardio_outings_weight_kg_check check (weight_kg is null or (weight_kg >= 20 and weight_kg <= 400));
alter table public.cardio_outings drop constraint if exists cardio_outings_gap_s_check;
alter table public.cardio_outings add constraint cardio_outings_gap_s_check check (gap_s >= 0 and gap_s <= 86400);
alter table public.cardio_outings drop constraint if exists cardio_outings_breakdown_check;
alter table public.cardio_outings add constraint cardio_outings_breakdown_check check (
  jsonb_typeof(breakdown) = 'object' and pg_column_size(breakdown) <= 2000);
alter table public.cardio_outings drop constraint if exists cardio_outings_segments_check;
alter table public.cardio_outings add constraint cardio_outings_segments_check check (
  jsonb_typeof(segments) = 'array' and jsonb_array_length(segments) <= 200);
alter table public.cardio_outings drop constraint if exists cardio_outings_splits_check;
alter table public.cardio_outings add constraint cardio_outings_splits_check check (
  jsonb_typeof(splits) = 'array' and jsonb_array_length(splits) <= 1000);
alter table public.cardio_outings drop constraint if exists cardio_outings_track_check;
alter table public.cardio_outings add constraint cardio_outings_track_check check (
  track is null or (length(track) between 3 and 200000 and left(track, 2) = '1;'));
alter table public.cardio_outings drop constraint if exists cardio_outings_points_check;
alter table public.cardio_outings add constraint cardio_outings_points_check check (points is null or (points >= 0 and points <= 200000));

-- Las listas (la app del alumno y la ficha del coach) van por alumno y de la más nueva a la más vieja.
create index if not exists cardio_outings_client_inicio on public.cardio_outings (client_id, started_at desc);

-- RLS: el alumno crea, lee y borra las suyas (no las edita: una salida no se cambia); su coach
-- actual las lee (con el recorrido).
alter table public.cardio_outings enable row level security;
drop policy if exists "salidas: cliente crea la suya" on public.cardio_outings;
create policy "salidas: cliente crea la suya" on public.cardio_outings
  for insert with check (client_id = auth.uid());
drop policy if exists "salidas: cliente borra la suya" on public.cardio_outings;
create policy "salidas: cliente borra la suya" on public.cardio_outings
  for delete using (client_id = auth.uid());
drop policy if exists "salidas: cliente y su coach" on public.cardio_outings;
create policy "salidas: cliente y su coach" on public.cardio_outings
  for select using ((client_id = auth.uid()) or is_my_client(client_id));

-- Permisos mínimos: nada para anónimos; los usuarios con sesión, leer, crear y borrar (siempre
-- filtrado por las políticas de arriba). Sin update.
revoke all on public.cardio_outings from anon, authenticated;
grant select, insert, delete on public.cardio_outings to authenticated;

-- Que la API (PostgREST) vea la tabla nueva sin esperar.
notify pgrst, 'reload schema';

select 'cardio_outings' as tabla, count(*) as filas from public.cardio_outings;
