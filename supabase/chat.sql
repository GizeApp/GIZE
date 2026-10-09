-- Chat coach ↔ alumno, con mensajes de voz.
-- Correr UNA vez en Supabase → SQL Editor, DESPUÉS de notificaciones.sql. Se puede volver
-- a correr sin problema. Después publicar las funciones (workflow Supabase → funciones):
-- la de mensajes ("rapid-worker") es la que guarda y avisa en los dos sentidos.
-- OJO: la versión vigente de la política de subir audios (ruta exacta y tope por día) está en
-- topes-archivos.sql: si volvés a correr este archivo, corré después topes-archivos.sql.
--
-- Usa la misma tabla de los mensajes del coach (coach_messages): lo que ya se mandó queda
-- como el principio de la conversación.

-- 1) Quién lo escribió, audio y cuándo se leyó.
do $$
begin
  -- La primera vez, lo que ya estaba se da por leído (eran avisos que ya llegaron al celular).
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'coach_messages' and column_name = 'read_at') then
    alter table public.coach_messages add column read_at timestamptz;
    update public.coach_messages set read_at = created_at;
  end if;
end $$;

alter table public.coach_messages add column if not exists sender text not null default 'coach';
alter table public.coach_messages add column if not exists audio_path text;
alter table public.coach_messages add column if not exists audio_secs int;
alter table public.coach_messages alter column body set default '';

alter table public.coach_messages drop constraint if exists coach_messages_sender_check;
alter table public.coach_messages add constraint coach_messages_sender_check check (sender in ('coach', 'client'));
alter table public.coach_messages drop constraint if exists coach_messages_body_check;
alter table public.coach_messages add constraint coach_messages_body_check
  check (char_length(body) <= 1000 and (char_length(body) >= 1 or audio_path is not null));
alter table public.coach_messages drop constraint if exists coach_messages_audio_check;
alter table public.coach_messages add constraint coach_messages_audio_check check (
  audio_path is null or (
    audio_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9_-]{8,64}\.(webm|mp4|m4a|ogg|aac)$'
    and split_part(audio_path, '/', 1) = coach_id::text
    and split_part(audio_path, '/', 2) = client_id::text
    and audio_secs between 1 and 180
  ));

-- Mensajes sin leer de cada lado (el globito con el número).
create index if not exists coach_messages_unread_idx on public.coach_messages(coach_id, client_id) where read_at is null;

-- 2) Audios: bucket PRIVADO, carpeta {coach}/{alumno}/. Los escriben y los escuchan solo
--    esos dos. Máximo 5 MB por audio (2 o 3 minutos).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-audio', 'chat-audio', false, 5242880,
        array['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/aac', 'audio/x-m4a', 'audio/mpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ¿Es una carpeta de una conversación mía? (yo soy el coach de ese alumno, o soy el alumno
-- y ese es mi coach actual).
create or replace function public.chat_folder_mine(p_coach text, p_client text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles p
     where p.id::text = p_client and p.coach_id::text = p_coach
       and (p.id = auth.uid() or p.coach_id = auth.uid())
  );
$$;
revoke all on function public.chat_folder_mine(text, text) from public;
grant execute on function public.chat_folder_mine(text, text) to authenticated;

drop policy if exists "chat-audio: subir en mi conversación" on storage.objects;
create policy "chat-audio: subir en mi conversación" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'chat-audio'
              and public.chat_folder_mine((storage.foldername(name))[1], (storage.foldername(name))[2]));

drop policy if exists "chat-audio: escuchar en mi conversación" on storage.objects;
create policy "chat-audio: escuchar en mi conversación" on storage.objects
  for select to authenticated
  using (bucket_id = 'chat-audio'
         and public.chat_folder_mine((storage.foldername(name))[1], (storage.foldername(name))[2]));

-- 3) Marcar como leído lo que me mandaron en una conversación.
create or replace function public.chat_mark_read(p_client uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.coach_messages set read_at = now()
   where client_id = p_client and read_at is null
     and ((sender = 'client' and coach_id = auth.uid())
       or (sender = 'coach' and client_id = auth.uid()));
$$;
revoke all on function public.chat_mark_read(uuid) from public;
grant execute on function public.chat_mark_read(uuid) to authenticated;

-- 4) Cuántos mensajes sin leer tengo, por alumno (para el coach) o uno solo (para el alumno).
create or replace function public.chat_unread()
returns table (client_id uuid, n int)
language sql
security definer
set search_path = public
stable
as $$
  select m.client_id, count(*)::int
    from public.coach_messages m
   where m.read_at is null
     and ((m.sender = 'client' and m.coach_id = auth.uid())
       or (m.sender = 'coach' and m.client_id = auth.uid()
           and m.coach_id = (select p.coach_id from public.profiles p where p.id = auth.uid())))
   group by m.client_id;
$$;
revoke all on function public.chat_unread() from public;
grant execute on function public.chat_unread() to authenticated;

-- 5) Que los mensajes nuevos aparezcan solos con el chat abierto (Realtime respeta las
--    mismas políticas de lectura: cada uno recibe solo los suyos).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'coach_messages') then
    alter publication supabase_realtime add table public.coach_messages;
  end if;
end $$;

notify pgrst, 'reload schema';
