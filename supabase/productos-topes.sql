-- Topes por usuario para reportar productos y sumarles usos en la base compartida.
-- Antes no había ninguno: con 3 cuentas nuevas se podía reportar y ocultar todos los productos
-- sin verificar (los de Open Food Facts, los de GIZE y los de usuarios), y una sola cuenta podía
-- sumarle millones de usos a un producto propio para que saliera primero en la búsqueda de todos.
--
-- Correr con el workflow "Supabase" → tarea sql → supabase/productos-topes.sql. Va después de
-- productos.sql (acá están las versiones vigentes de product_use y product_report: si se vuelve
-- a correr productos.sql, correr este después). Se puede correr varias veces.

-- 1) Reportes: hasta 10 por usuario por día (los de más no se anotan). Para ocultar un producto
--    solo cuentan los reportes de cuentas con más de 3 días, y solo se ocultan solos los cargados
--    por usuarios: los de Open Food Facts y los de GIZE quedan en «Reportados» del panel para que
--    los revise un administrador.
create index if not exists product_reports_user_idx on public.product_reports (user_id, created_at);

create or replace function public.product_report(pid uuid, why text)
returns void language plpgsql security definer set search_path = public as $$
declare n int; viejos int;
begin
  if auth.uid() is null then return; end if;
  -- De a un pedido por usuario: dos reportes al mismo tiempo no se saltean el tope.
  perform pg_advisory_xact_lock(hashtext('product_report'), hashtext(auth.uid()::text));
  if (select count(*) from public.product_reports where user_id = auth.uid() and created_at > now() - interval '1 day') >= 10 then return; end if;
  insert into public.product_reports(product_id, user_id, reason) values (pid, auth.uid(), left(why, 200))
    on conflict (product_id, user_id) do nothing;
  select count(*), count(*) filter (where u.created_at < now() - interval '3 days') into n, viejos
    from public.product_reports r join auth.users u on u.id = r.user_id where r.product_id = pid;
  update public.products set reports = n, hidden = (hidden or (not verified and source = 'user' and viejos >= 3)) where id = pid;
end $$;
revoke execute on function public.product_report(uuid, text) from public, anon;
grant execute on function public.product_report(uuid, text) to authenticated;

-- 2) Usos: uno por usuario, producto y día (hora de Argentina). Se guarda solo eso y lo de días
--    anteriores se borra solo.
create table if not exists public.product_uses (
  product_id uuid not null references public.products(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  day        date not null,
  primary key (product_id, user_id, day)
);
create index if not exists product_uses_user_idx on public.product_uses (user_id, day);
alter table public.product_uses enable row level security;
revoke all on public.product_uses from anon, authenticated;

create or replace function public.product_use(pid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  if auth.uid() is null then return; end if;
  delete from public.product_uses where user_id = auth.uid() and day < hoy;
  insert into public.product_uses(product_id, user_id, day)
    select pid, auth.uid(), hoy where exists (select 1 from public.products where id = pid) on conflict do nothing;
  if found then update public.products set uses = uses + 1 where id = pid; end if;
end $$;
revoke execute on function public.product_use(uuid) from public, anon;
grant execute on function public.product_use(uuid) to authenticated;

notify pgrst, 'reload schema';

-- Resumen (solo cantidades).
select 'product_uses' as tabla, count(*) as filas from public.product_uses;
