-- Cardio sin GPS: la app ya no registra salidas de correr, caminar o bici con GPS (se sacaron
-- el mapa, los recorridos y «Tus salidas»; Cardio quedó con el cronómetro, el temporizador y
-- el plan del coach). Este archivo borra las dos tablas que usaba esa función:
-- public.cardio_routes (supabase/cardio-recorridos.sql) y public.cardio_sessions
-- (supabase/cardio-salidas.sql).
--
-- OJO: borra las salidas y los recorridos que estaban guardados. Ya no se muestran en ningún
-- lado (ni al alumno ni al coach) y la app ya no los lee ni los manda.
--
-- Correr con el workflow "Supabase" → tarea sql → supabase/cardio-sin-gps.sql (o pegarlo en
-- Supabase → SQL Editor) DESPUÉS de publicar la versión de la app sin GPS. Si una app vieja
-- todavía intenta mandar una salida, sin la tabla esa salida le queda pendiente en el celular
-- sin trabar lo demás de su cola (así lo maneja esa versión); al actualizar la app, se descarta.
-- Se puede volver a correr sin problema.

-- Primero los recorridos (dependen de las salidas).
drop table if exists public.cardio_routes cascade;
drop table if exists public.cardio_sessions cascade;

-- Que la API (PostgREST) se entere sin esperar.
notify pgrst, 'reload schema';

select to_regclass('public.cardio_sessions') is null and to_regclass('public.cardio_routes') is null as tablas_borradas;
