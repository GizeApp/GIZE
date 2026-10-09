-- Audios que quedan por borrar de una cuenta eliminada (función borrar-audios).
-- Correr con el workflow "Supabase" → tarea sql → supabase/borrar-audios.sql (después de
-- avisos-coach.sql, que crea cron_secret()). Se puede volver a correr. Antes: publicar la
-- función borrar-audios (workflow "Supabase" → tarea funciones).
--
-- La función elimina la cuenta y recién después borra sus mensajes de voz de Storage. Si ese
-- borrado fallaba o la función se cortaba (con muchos audios), la cuenta ya no estaba para
-- reintentar y los audios quedaban para siempre sin dueño. Ahora la función anota acá las rutas
-- apenas se borra la cuenta y saca cada tanda que borra; lo que queda lo borra este cron, que
-- cada hora llama a la misma función (?cola=1) si hay algo anotado.

create table if not exists public.audios_por_borrar (
  path       text primary key,                   -- ruta en el bucket chat-audio
  created_at timestamptz not null default now()
);
-- Solo la usa la función (con la clave de servicio): sin políticas, nadie más la ve.
alter table public.audios_por_borrar enable row level security;
revoke all on public.audios_por_borrar from anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net;
select cron.unschedule('gize-audios-por-borrar') where exists (select 1 from cron.job where jobname = 'gize-audios-por-borrar');
select cron.schedule('gize-audios-por-borrar', '23 * * * *', $job$
  select net.http_post(
    url := 'https://wegptuzhsrwppbknqstf.supabase.co/functions/v1/borrar-audios?cola=1',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.cron_secret()),
    body := '{}'::jsonb
  )
  where exists (select 1 from public.audios_por_borrar);
$job$);

notify pgrst, 'reload schema';
