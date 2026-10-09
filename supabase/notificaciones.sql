-- Notificaciones push: el coach le escribe al cliente y le llega al celular.
-- Correr UNA vez en Supabase → SQL Editor. Se puede volver a correr sin problema.
-- Además hay que publicar la función supabase/functions/notificar-cliente (ver el
-- comentario al principio de ese archivo).

-- 1) Dispositivos donde cada usuario activó las notificaciones (uno por celular/navegador).
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;

-- Cada usuario maneja solo sus dispositivos. El coach NO los ve (solo cuántos hay,
-- con client_push_devices más abajo); el envío lo hace la función con la service role.
drop policy if exists "push: ver los propios" on public.push_subscriptions;
create policy "push: ver los propios" on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "push: agregar los propios" on public.push_subscriptions;
create policy "push: agregar los propios" on public.push_subscriptions
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "push: cambiar los propios" on public.push_subscriptions;
create policy "push: cambiar los propios" on public.push_subscriptions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "push: borrar los propios" on public.push_subscriptions;
create policy "push: borrar los propios" on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());

-- 2) Mensajes que el coach mandó (historial en el panel).
create table if not exists public.coach_messages (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  delivered int not null default 0,   -- a cuántos dispositivos llegó
  created_at timestamptz not null default now()
);
create index if not exists coach_messages_client_idx on public.coach_messages(client_id, created_at desc);
alter table public.coach_messages enable row level security;

drop policy if exists "mensajes: el coach ve los suyos" on public.coach_messages;
create policy "mensajes: el coach ve los suyos" on public.coach_messages
  for select to authenticated using (coach_id = auth.uid());
drop policy if exists "mensajes: el cliente ve los que recibió" on public.coach_messages;
create policy "mensajes: el cliente ve los que recibió" on public.coach_messages
  for select to authenticated using (client_id = auth.uid());
-- Insertar solo lo hace la función (service role), después de chequear que el cliente es del coach.

-- 3) Cuántos dispositivos con notificaciones tiene un cliente (solo para su coach).
create or replace function public.client_push_devices(p_client uuid)
returns int
language sql
security definer
set search_path = public
stable
as $$
  select case
    when exists (select 1 from public.profiles p where p.id = p_client and p.coach_id = auth.uid())
    then (select count(*)::int from public.push_subscriptions s where s.user_id = p_client)
    else null
  end;
$$;
revoke all on function public.client_push_devices(uuid) from public;
grant execute on function public.client_push_devices(uuid) to authenticated;

notify pgrst, 'reload schema';

-- 4) Guardar / quitar el dispositivo propio. Con función y no con INSERT directo: si en
--    el mismo celular antes había otra cuenta logueada, la fila de ese endpoint es de
--    ella y las políticas no dejarían reasignarla (el mensaje le seguiría llegando a
--    la cuenta anterior).
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
$$;
revoke all on function public.save_push_subscription(text, text, text) from public;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;
revoke all on function public.delete_push_subscription(text) from public;
grant execute on function public.delete_push_subscription(text) to authenticated;

notify pgrst, 'reload schema';

-- 5) Borrar un dispositivo sin sesión. Si al cerrar sesión no hay señal (o la sesión ya terminó,
--    como una sin «Mantener la sesión» al cerrar la pestaña), la app lo da de baja en el
--    navegador o el celular pero la fila queda, y después ya no tiene sesión para borrarla con
--    delete_push_subscription. Lo borra apenas vuelve la señal con la dirección y su clave
--    «auth», que solo tiene ese dispositivo (en las apps, el token del celular). Ver app/core/push.js.
create or replace function public.forget_push_subscription(p_endpoint text, p_auth text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.push_subscriptions
   where endpoint = p_endpoint and auth = p_auth and coalesce(p_auth, '') <> '';
$$;
revoke all on function public.forget_push_subscription(text, text) from public;
grant execute on function public.forget_push_subscription(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
