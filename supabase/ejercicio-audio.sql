-- Explicación de voz del coach en cada ejercicio de la rutina.
-- Correr UNA vez en Supabase → SQL Editor, DESPUÉS de chat.sql. Se puede volver a correr.
-- OJO: la versión vigente de la política de subir (ruta exacta y tope por día) está en
-- topes-archivos.sql: si volvés a correr este archivo, corré después topes-archivos.sql.
--
-- Los audios van al mismo bucket privado del chat (chat-audio), en la carpeta del coach:
-- {coach}/ex/{archivo}. Así un mismo audio sirve para todos sus alumnos y sigue andando al
-- copiar rutinas o días entre alumnos. En la rutina, el ejercicio guarda la ruta en
-- "audio" y la duración en "audioSecs".

-- 1) El coach sube a su carpeta ex/; la escuchan él y sus alumnos.
create or replace function public.ex_audio_access(p_owner text, p_write boolean)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select case when p_write
    then p_owner = auth.uid()::text
         and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'coach')
    else p_owner = auth.uid()::text
         or p_owner = (select p.coach_id::text from public.profiles p where p.id = auth.uid())
  end;
$$;
revoke all on function public.ex_audio_access(text, boolean) from public;
grant execute on function public.ex_audio_access(text, boolean) to authenticated;

drop policy if exists "ejercicio-audio: el coach sube" on storage.objects;
create policy "ejercicio-audio: el coach sube" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'chat-audio'
              and (storage.foldername(name))[2] = 'ex'
              and array_length(storage.foldername(name), 1) = 2
              and public.ex_audio_access((storage.foldername(name))[1], true));

drop policy if exists "ejercicio-audio: coach y alumnos escuchan" on storage.objects;
create policy "ejercicio-audio: coach y alumnos escuchan" on storage.objects
  for select to authenticated
  using (bucket_id = 'chat-audio'
         and (storage.foldername(name))[2] = 'ex'
         and public.ex_audio_access((storage.foldername(name))[1], false));

-- 2) La rutina solo acepta rutas de audio con esa forma (van dentro del HTML de la app).
--    Es la misma función de seguridad-base.sql con el chequeo del audio sumado.
create or replace function public.routine_days_ok(days jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select jsonb_typeof(days) = 'array'
     and not exists (
       select 1 from jsonb_array_elements(days) d
        where jsonb_typeof(d) <> 'object'
           or coalesce(d->>'id', 'x') !~ '^[A-Za-z0-9_-]{1,64}$'
           or (d ? 'exercises' and jsonb_typeof(d->'exercises') <> 'array'))
     and not exists (
       select 1 from jsonb_array_elements(days) d,
                     jsonb_array_elements(case when jsonb_typeof(d->'exercises') = 'array' then d->'exercises' else '[]'::jsonb end) e
        where jsonb_typeof(e) <> 'object'
           or coalesce(e->>'id', 'x') !~ '^[A-Za-z0-9_-]{1,64}$'
           or (e ? 'video' and e->>'video' !~* '^https://')
           or (e ? 'audio' and e->>'audio' !~ '^[0-9a-f-]{36}/ex/[A-Za-z0-9_-]{8,64}\.(webm|mp4|m4a|ogg|aac)$')
           or (e ? 'sets' and jsonb_typeof(e->'sets') <> 'array'))
     and not exists (
       select 1 from jsonb_array_elements(days) d,
                     jsonb_array_elements(case when jsonb_typeof(d->'exercises') = 'array' then d->'exercises' else '[]'::jsonb end) e,
                     jsonb_array_elements(case when jsonb_typeof(e->'sets') = 'array' then e->'sets' else '[]'::jsonb end) s
        where jsonb_typeof(s) <> 'object'
           or coalesce(s->>'id', 'x') !~ '^[A-Za-z0-9_-]{1,64}$');
$$;

notify pgrst, 'reload schema';
