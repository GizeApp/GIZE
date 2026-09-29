-- Recorridos de las salidas de correr, caminar o bici (Cardio → «Salir a correr…» → el mapa).
-- Una fila por salida: el recorrido simplificado y codificado como polyline de Google (5
-- decimales). Si la salida tuvo pausas, van varios tramos separados por un espacio (el
-- polyline nunca usa espacios; ver app/core/cardiogps.js).
--
-- Va en una tabla APARTE de cardio_sessions a propósito: el coach lee las salidas de sus
-- alumnos (los números), pero esta tabla no tiene ninguna política para el coach. El recorrido
-- lo ve solo el alumno. Se borra solo al borrar la salida o la cuenta (on delete cascade).
--
-- Correr con el workflow "Supabase" → tarea sql → archivo supabase/cardio-recorridos.sql (o
-- pegarlo en Supabase → SQL Editor), después de supabase/cardio-salidas.sql. Se puede volver
-- a correr sin problema.
--
-- Mientras no se corra, la app sigue funcionando: los recorridos quedan en el celular (y en la
-- cola de envío, sin trabar lo demás) y suben solos cuando la tabla existe.

create table if not exists public.cardio_routes (
  session_id uuid primary key references public.cardio_sessions(id) on delete cascade,
  client_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  route      text not null,
  points     integer,
  created_at timestamptz not null default now()
);

-- Límites razonables (la app ya los respeta): hasta 200.000 caracteres de recorrido.
alter table public.cardio_routes drop constraint if exists cardio_routes_route_check;
alter table public.cardio_routes add constraint cardio_routes_route_check check (length(route) between 1 and 200000);
alter table public.cardio_routes drop constraint if exists cardio_routes_points_check;
alter table public.cardio_routes add constraint cardio_routes_points_check check (points is null or (points >= 0 and points <= 200000));

create index if not exists cardio_routes_client on public.cardio_routes (client_id);

-- RLS: el alumno crea, lee y borra los suyos (no los edita). Nadie más: ni su coach.
-- Al crearlo, la salida tiene que ser suya (si no, alguien podría ocupar el lugar del
-- recorrido de una salida ajena).
alter table public.cardio_routes enable row level security;
drop policy if exists "recorridos: cliente crea el suyo" on public.cardio_routes;
create policy "recorridos: cliente crea el suyo" on public.cardio_routes
  for insert with check (client_id = auth.uid() and exists (
    select 1 from public.cardio_sessions s where s.id = session_id and s.client_id = auth.uid()));
drop policy if exists "recorridos: cliente lee el suyo" on public.cardio_routes;
create policy "recorridos: cliente lee el suyo" on public.cardio_routes
  for select using (client_id = auth.uid());
drop policy if exists "recorridos: cliente borra el suyo" on public.cardio_routes;
create policy "recorridos: cliente borra el suyo" on public.cardio_routes
  for delete using (client_id = auth.uid());

-- Permisos mínimos: nada para anónimos; los usuarios con sesión, leer, crear y borrar
-- (siempre filtrado por las políticas de arriba).
revoke all on public.cardio_routes from anon, authenticated;
grant select, insert, delete on public.cardio_routes to authenticated;

-- Que la API (PostgREST) vea la tabla nueva sin esperar.
notify pgrst, 'reload schema';

select 'cardio_routes' as tabla, count(*) as filas from public.cardio_routes;
