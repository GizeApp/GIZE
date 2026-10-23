-- Funciones que nadie sin sesión necesita llamar: se les saca el permiso a anon (y a «public», del
-- que anon lo hereda). Lo marcó el chequeo de seguridad de Supabase («Public Can Execute SECURITY
-- DEFINER Function»). Ninguna devolvía nada sin sesión (miran auth.uid()), así que no cambia lo que
-- ve nadie: es una capa más.
-- Correr con el workflow "Supabase" → tarea sql → supabase/permisos-sin-sesion.sql. Se puede correr
-- varias veces. Va después de supabase/base.sql, supabase/chat.sql, supabase/ejercicio-audio.sql,
-- supabase/mail-clientes.sql y supabase/notificaciones.sql.
--
-- Quedan como estaban, a propósito:
-- - forget_push_subscription: la app la llama sin sesión para borrar el aviso de un celular que ya
--   cerró sesión (app/core/push.js); pide la dirección y su clave, que solo tiene ese dispositivo.
-- - is_my_client: la usan las reglas de 13 tablas para cualquier usuario; sin sesión da «no» y sacarle
--   el permiso haría que una consulta sin sesión falle con error en vez de volver vacía.

-- 1) Las que llama la app con sesión: solo usuarios con sesión.
revoke execute on function public.chat_mark_read(uuid) from public, anon;
revoke execute on function public.chat_unread() from public, anon;
revoke execute on function public.my_clients_emails() from public, anon;
grant execute on function public.chat_mark_read(uuid) to authenticated;
grant execute on function public.chat_unread() to authenticated;
grant execute on function public.my_clients_emails() to authenticated;

-- 2) Las de las reglas de los audios (storage, solo para usuarios con sesión).
revoke execute on function public.chat_folder_mine(text, text) from public, anon;
revoke execute on function public.ex_audio_access(text, boolean) from public, anon;
grant execute on function public.chat_folder_mine(text, text) to authenticated;
grant execute on function public.ex_audio_access(text, boolean) to authenticated;

-- 3) Las que se disparan solas al guardar (triggers): nadie las llama a mano. El permiso de usarlas
-- se mira al crear el trigger, no cada vez que se dispara, así que sacarlo no las apaga.
revoke execute on function public.handle_new_user() from public, anon;
revoke execute on function public.coach_billing_on_profile() from public, anon;
revoke execute on function public.push_subscriptions_cap() from public, anon;
revoke execute on function public.routines_owner_guard() from public, anon;

notify pgrst, 'reload schema';
