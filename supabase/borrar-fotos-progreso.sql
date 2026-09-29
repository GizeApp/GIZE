-- Borrar las fotos de progreso viejas (decisión del dueño, septiembre 2026).
-- La app ya no deja subirlas (#194), el coach ya no las ve (#196) y el alumno tampoco: se sacó
-- «Tus fotos de progreso anteriores» del Check-in. Quedaban guardadas sin que nadie las usara.
--
-- ORDEN (importa):
--   1) Actions → "Supabase" → Run workflow → tarea "borrar-fotos-progreso": borra TODOS los
--      archivos del bucket "checkins" con la API de Storage (por SQL no se puede: Supabase
--      lo impide con el trigger protect_objects_delete y, aunque se forzara, el archivo
--      quedaría guardado igual).
--   2) Este archivo: Actions → "Supabase" → Run workflow → tarea "sql" →
--      supabase/borrar-fotos-progreso.sql. Si todavía quedan archivos en el bucket, frena
--      sin cambiar nada y dice cuántos: volver al paso 1.
--
-- Qué hace:
--   · Saca las políticas del bucket "checkins": nadie puede subir, ver ni borrar ahí (solo
--     la clave de servicio). El bucket queda vacío y privado, y no se elimina: las versiones
--     viejas de la app lo listan al eliminar la cuenta y fallarían si no existiera.
--   · Elimina la tabla checkin_photos, con sus filas y sus políticas. Ya no la usa nada: la
--     app nueva no la pide y las versiones viejas toleran que no esté (ven la lista vacía).
--     Si algo de la base dependiera de ella (una vista, por ejemplo), no se borra nada y el
--     workflow muestra el error.
--
-- Se puede correr varias veces. Al final devuelve lo que haya que revisar: el log del
-- workflow (público) muestra solo cuántas filas; "Filas devueltas: 0" = todo bien.

-- 0) Primero los archivos (paso 1). Solo se informa la cantidad.
do $$
declare n bigint;
begin
  select count(*) into n from storage.objects where bucket_id = 'checkins';
  if n > 0 then
    raise exception 'Quedan % archivos en el bucket checkins. Primero corré el workflow Supabase con la tarea borrar-fotos-progreso y después este archivo.', n;
  end if;
end $$;

-- 1) Bucket "checkins" sin políticas (eran las de supabase/base.sql).
drop policy if exists "storage: cliente sube en su carpeta" on storage.objects;
drop policy if exists "storage: cliente borra en su carpeta" on storage.objects;
drop policy if exists "storage: cliente ve su carpeta" on storage.objects;

-- 2) La tabla de las fotos (sin CASCADE: si algo depende de ella, frena todo).
drop table if exists public.checkin_photos;

notify pgrst, 'reload schema';

-- Chequeo final: si devuelve filas, hay algo para revisar en el SQL Editor de Supabase
-- (por ejemplo, una política creada desde el panel que todavía nombra el bucket).
select 'política que nombra el bucket checkins' as chequeo, policyname::text as detalle
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects'
   and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) like '%''checkins''%'
union all
select 'la tabla checkin_photos sigue existiendo', null
 where to_regclass('public.checkin_photos') is not null
union all
select 'quedan archivos en el bucket checkins', null
 where exists (select 1 from storage.objects where bucket_id = 'checkins');
