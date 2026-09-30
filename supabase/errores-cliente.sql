-- Errores de la app: cuando algo se rompe en el celular de alguien, la app avisa acá
-- (app/ui/errores.js) para poder verlo sin esperar a que el usuario escriba.
-- Correr con el workflow "Supabase" → tarea sql → supabase/errores-cliente.sql. Se puede
-- volver a correr sin problema.
--
-- Para mirarlos: Supabase → Table Editor → client_errors, o en el SQL Editor:
--   select created_at, platform, version, message, place
--     from public.client_errors order by created_at desc limit 50;
--   select message, count(*) from public.client_errors
--    where created_at > now() - interval '7 days' group by message order by 2 desc;
--
-- Qué se guarda: el mensaje y el recorrido técnico del error (sin datos de la cuenta), la
-- versión de la app, la plataforma y qué cuenta lo tuvo. Al borrar la cuenta se borran sus
-- errores. Los de más de 90 días se limpian solos.
-- Nadie puede leer ni escribir la tabla desde la app: solo se inserta con la función de abajo
-- (con tope por cuenta) y se lee desde el panel de Supabase.

create table if not exists public.client_errors (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id    uuid references public.profiles(id) on delete cascade,
  message    text not null,
  stack      text,
  place      text,
  version    text,
  platform   text
);

alter table public.client_errors enable row level security;
-- Sin políticas: la app no puede tocar la tabla directamente.

create index if not exists client_errors_user_created_idx on public.client_errors(user_id, created_at desc);
create index if not exists client_errors_created_idx on public.client_errors(created_at desc);

create or replace function public.report_client_error(
  p_message text, p_stack text default null, p_place text default null,
  p_version text default null, p_platform text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  if coalesce(p_message, '') = '' then return; end if;
  if not exists (select 1 from public.profiles where id = auth.uid()) then return; end if;
  -- Tope por cuenta: una app en un bucle de errores no llena la base.
  if (select count(*) from public.client_errors
       where user_id = auth.uid() and created_at > now() - interval '1 day') >= 30 then return; end if;
  insert into public.client_errors (user_id, message, stack, place, version, platform)
  values (auth.uid(), left(p_message, 300), left(p_stack, 2000), left(p_place, 200), left(p_version, 40), left(p_platform, 20));
  -- Limpieza: de vez en cuando se borran los de más de 90 días (no hace falta un cron).
  if random() < 0.02 then
    delete from public.client_errors where created_at < now() - interval '90 days';
  end if;
end $$;

revoke execute on function public.report_client_error(text, text, text, text, text) from public, anon;
grant  execute on function public.report_client_error(text, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';

-- Chequeo final: la tabla existe y tiene la seguridad prendida (debe devolver: true, true).
select to_regclass('public.client_errors') is not null as tabla_creada,
       coalesce((select relrowsecurity from pg_class where oid = 'public.client_errors'::regclass), false) as rls_activa;
