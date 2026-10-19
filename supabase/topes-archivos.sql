-- Topes por usuario en Storage: ruta exacta y cantidad de archivos por día en los buckets
-- chat-audio (mensajes de voz y explicaciones de voz de los ejercicios), productos (fotos de los
-- pedidos de productos) y avatars (foto de perfil).
-- Antes cada bucket aceptaba archivos sin límite de cantidad y en cualquier subcarpeta de la
-- carpeta propia: una cuenta nueva podía llenar el espacio que paga GIZE, y lo de las
-- subcarpetas quedaba para siempre (el borrado de la cuenta no lo veía).
--
-- Correr con el workflow "Supabase" → tarea sql → supabase/topes-archivos.sql. Va después de
-- chat.sql, ejercicio-audio.sql, productos-revision.sql y foto-perfil.sql: acá están las
-- versiones vigentes de sus políticas de subir. Si se vuelve a correr alguno de esos, correr
-- este después. Se puede correr varias veces.
--
-- Topes por día (últimas 24 horas, cuenta lo que subió cada uno, owner_id, y sigue guardado):
--   · chat-audio 300 y 150 MB: un coach con muchos alumnos manda bastantes audios, pero no 300
--     por día (un audio de 2 minutos pesa menos de 1 MB). Solo con la cantidad, eran hasta
--     1,5 GB por día (300 de 5 MB).
--   · productos 40: cada pedido lleva 1 o 2 fotos y hay hasta 15 pedidos por día.
--   · avatars 20, y 3 en total: la app guarda una sola y borra las anteriores. Solo con el tope
--     por día, una cuenta podía sumar 20 fotos por día para siempre.
-- Los audios que no quedaron en ningún mensaje ni rutina todavía no se borran solos: el tope por
-- día limita cuánto entra, no cuánto se junta con el tiempo.
--
-- Los topes se revisan en dos lugares: en la política de subir (rechaza antes de que la app mande
-- el archivo) y en un trigger de storage.objects (punto 5), que corre en cada alta. Con la
-- política sola no alcanzaba: Storage la mira una sola vez al dar un link firmado de subida, y
-- dos subidas a la vez se contaban sin verse entre sí.

-- ¿Le queda lugar hoy a esta cuenta en este bucket? Corre como dueño (lee storage.objects
-- entero) y cuenta lo de p_owner. Los MB son los de lo ya subido: el del archivo que llega
-- todavía no se sabe (el bucket lo limita a 5 MB). La usan la política (storage_cupo_ok) y el
-- trigger (storage_cupo_alta): los números están solo acá.
create or replace function public.storage_cupo_libre(p_bucket text, p_owner text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_owner is not null
    and (select count(*) < case p_bucket when 'chat-audio' then 300 when 'productos' then 40 when 'avatars' then 20 else 0 end
                and (p_bucket <> 'chat-audio' or coalesce(sum(case when o.metadata->>'size' ~ '^[0-9]{1,12}$'
                                                                then (o.metadata->>'size')::bigint end), 0) < 150 * 1048576)
           from storage.objects o
          where o.bucket_id = p_bucket and o.owner_id = p_owner and o.created_at > now() - interval '1 day')
    and (p_bucket <> 'avatars'
         or (select count(*) from storage.objects o where o.bucket_id = 'avatars' and o.owner_id = p_owner) < 3);
$$;
revoke all on function public.storage_cupo_libre(text, text) from public, anon, authenticated;

-- ¿Puedo subir otro archivo hoy a este bucket? Lo mismo, para quien llama (políticas de abajo).
create or replace function public.storage_cupo_ok(p_bucket text)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and public.storage_cupo_libre(p_bucket, auth.uid()::text);
$$;
revoke all on function public.storage_cupo_ok(text) from public, anon;
grant execute on function public.storage_cupo_ok(text) to authenticated;

-- 1) chat-audio, conversación: {coach}/{alumno}/{nombre}.{ext}, la misma forma que acepta
--    coach_messages.audio_path (chat.sql).
drop policy if exists "chat-audio: subir en mi conversación" on storage.objects;
create policy "chat-audio: subir en mi conversación" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'chat-audio'
              and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9_-]{8,64}\.(webm|mp4|m4a|ogg|aac)$'
              and public.chat_folder_mine((storage.foldername(name))[1], (storage.foldername(name))[2])
              and public.storage_cupo_ok('chat-audio'));

-- 2) chat-audio, explicación de voz de un ejercicio: {coach}/ex/{nombre}.{ext}.
drop policy if exists "ejercicio-audio: el coach sube" on storage.objects;
create policy "ejercicio-audio: el coach sube" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'chat-audio'
              and name ~ '^[0-9a-f-]{36}/ex/[A-Za-z0-9_-]{8,64}\.(webm|mp4|m4a|ogg|aac)$'
              and public.ex_audio_access((storage.foldername(name))[1], true)
              and public.storage_cupo_ok('chat-audio'));

-- 3) productos: {usuario}/{archivo}, la misma forma que aceptan los pedidos (label_path).
drop policy if exists "productos: sube en su carpeta" on storage.objects;
create policy "productos: sube en su carpeta" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'productos'
              and name ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,80}$'
              and (storage.foldername(name))[1] = auth.uid()::text
              and public.storage_cupo_ok('productos'));

-- 4) avatars: {usuario}/{archivo}. Cambiar uno que ya está (upsert) no lo puede mover a una
--    subcarpeta. Y cuenta como uno nuevo: el INSERT … ON CONFLICT revisa la política (y el tope)
--    antes de ver que ya existe, así que con 3 fotos se rechaza. La app no lo usa: sube siempre
--    con un nombre nuevo.
drop policy if exists "avatar: subir la propia" on storage.objects;
create policy "avatar: subir la propia" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars'
              and name ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,80}$'
              and (storage.foldername(name))[1] = auth.uid()::text
              and public.storage_cupo_ok('avatars'));
drop policy if exists "avatar: cambiar la propia" on storage.objects;
create policy "avatar: cambiar la propia" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars'
              and name ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,80}$'
              and (storage.foldername(name))[1] = auth.uid()::text);

-- 5) El mismo tope en cada alta de storage.objects, la haga quien la haga. Con un link firmado de
--    subida (createSignedUploadUrl), Storage revisa la política al dar el link y después guarda
--    el archivo como superusuario, sin volver a mirarla: una cuenta podía pedir cientos de links
--    con el conteo todavía bajo y subir todo. Y dos subidas a la vez se contaban sin verse. El
--    trigger corre siempre (también al revisar la política, antes de subir) y de a una por cuenta
--    y bucket: el lock dura hasta el final de la transacción, y la que espera ya ve el archivo de
--    la anterior. Sin owner_id (service role) no cuenta; las marcas de borrado (versiones) tampoco.
create or replace function public.storage_cupo_alta()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.bucket_id in ('chat-audio', 'productos', 'avatars') and new.owner_id is not null
     and not coalesce((to_jsonb(new)->>'is_delete_marker')::boolean, false) then
    perform pg_advisory_xact_lock(hashtextextended('storage_cupo ' || new.bucket_id || ' ' || new.owner_id, 0));
    if not public.storage_cupo_libre(new.bucket_id, new.owner_id) then
      -- 42501: Storage lo devuelve como 403, igual que la política (la app avisa que llegó al límite).
      raise exception 'Llegaste al límite de archivos por hoy' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.storage_cupo_alta() from public, anon, authenticated;
-- «or replace» y no drop + create: borrar un trigger pide ser dueño de la tabla (es de Storage) y
-- crearlo o cambiarlo, solo el permiso TRIGGER.
create or replace trigger storage_cupo_alta before insert on storage.objects
  for each row execute function public.storage_cupo_alta();

notify pgrst, 'reload schema';

-- Resumen (solo cantidades): archivos en subcarpetas que quedaron de antes, por bucket, y solo
-- los buckets que tienen alguno: en el workflow, «Filas devueltas: 0» quiere decir que no hay
-- ninguno. Se borran al eliminar la cuenta de su dueño (borrar-audios, el panel y la app ya las
-- recorren).
select bucket_id, count(*) as en_subcarpetas
  from storage.objects
 where bucket_id in ('chat-audio', 'productos', 'avatars')
   and (array_length(storage.foldername(name), 1) > 2
        or (bucket_id <> 'chat-audio' and array_length(storage.foldername(name), 1) > 1))
 group by bucket_id order by bucket_id;
