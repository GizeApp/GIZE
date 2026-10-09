-- Limpieza del historial de las tareas programadas (pg_cron).
-- pg_cron anota cada corrida en cron.job_run_details y no borra nada solo. Con gize-descansos
-- cada 5 segundos son unas 17.000 filas por día, y en el plan Free la base tiene 500 MB en total
-- (también las cuenta la copia de seguridad). Esta tarea borra todos los días lo de más de 3 días.
-- Para ver errores recientes de las tareas alcanza con eso (el chequeo mira el último día).
--
-- Correr con el workflow "Supabase" → tarea sql → supabase/cron-limpieza.sql. Se puede correr
-- varias veces: vuelve a crear la tarea con el mismo nombre.

select cron.unschedule('gize-cron-limpieza') where exists (select 1 from cron.job where jobname = 'gize-cron-limpieza');
select cron.schedule('gize-cron-limpieza', '17 4 * * *', $job$
  delete from cron.job_run_details where end_time < now() - interval '3 days';
$job$);

-- La primera limpieza, ya.
delete from cron.job_run_details where end_time < now() - interval '3 days';

-- Devuelve la tarea creada (1 fila).
select jobname, schedule, active from cron.job where jobname = 'gize-cron-limpieza';
