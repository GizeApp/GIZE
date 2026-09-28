-- Mail de cada alumno en la lista de clientes del coach.
-- Correr UNA vez en Supabase → SQL Editor. Se puede volver a correr sin problema.
-- El mail no está en profiles (está en las cuentas de Supabase, auth.users) y por eso la
-- lista decía "Sin email". Esta función le da al coach solo los mails de SUS alumnos.
create or replace function public.my_clients_emails()
returns table (id uuid, email text)
language sql
security definer
set search_path = public
stable
as $$
  select u.id, u.email::text
    from public.profiles p
    join auth.users u on u.id = p.id
   where p.coach_id = auth.uid();
$$;
revoke all on function public.my_clients_emails() from public;
grant execute on function public.my_clients_emails() to authenticated;

notify pgrst, 'reload schema';
