-- Foto de perfil para clientes y coaches.
-- Correr UNA vez en Supabase → SQL Editor. Se puede volver a correr sin problema.
-- OJO: las versiones vigentes de las políticas de subir y cambiar la foto (ruta exacta y tope
-- por día) están en topes-archivos.sql: si volvés a correr este archivo, corré después
-- topes-archivos.sql.
-- Mientras no se corra, la app sigue mostrando las iniciales.

-- 1) Dónde queda guardada la foto de cada perfil.
alter table public.profiles add column if not exists avatar_path text;

-- 2) Bucket PRIVADO para las fotos (se ven con links firmados, no públicos).
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', false)
on conflict (id) do nothing;

-- 3) Cada usuario sube, cambia y borra solo lo de su carpeta ({su id}/...).
drop policy if exists "avatar: subir la propia" on storage.objects;
create policy "avatar: subir la propia" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatar: cambiar la propia" on storage.objects;
create policy "avatar: cambiar la propia" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatar: borrar la propia" on storage.objects;
create policy "avatar: borrar la propia" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- 4) Quién la puede ver: el propio usuario, su coach y los clientes de ese coach.
drop policy if exists "avatar: ver propia, coach y clientes" on storage.objects;
create policy "avatar: ver propia, coach y clientes" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars' and (
      (storage.foldername(name))[1] = auth.uid()::text
      -- el coach ve las fotos de sus clientes
      or exists (select 1 from public.profiles p
                 where p.id::text = (storage.foldername(name))[1] and p.coach_id = auth.uid())
      -- el cliente ve la foto de su coach
      or (storage.foldername(name))[1] = (select p.coach_id::text from public.profiles p where p.id = auth.uid())
    )
  );

notify pgrst, 'reload schema';

-- 5) Guardar la ruta de la foto en el propio perfil sin depender de las políticas de
--    UPDATE de profiles (que pueden no permitirlo, y un UPDATE bloqueado por RLS no da
--    error: cambia 0 filas). La función solo toca avatar_path de la fila del propio
--    usuario, así que no abre la puerta a cambiar otros datos (rol, coach, etc.).
create or replace function public.set_my_avatar(p_path text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles set avatar_path = p_path where id = auth.uid();
$$;

revoke all on function public.set_my_avatar(text) from public;
grant execute on function public.set_my_avatar(text) to authenticated;

notify pgrst, 'reload schema';
