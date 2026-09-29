-- Productos de Open Food Facts: ahora los guarda solo GIZE, desde el servidor (función
-- "productos-off", ver supabase/functions/productos-off).
-- Antes cualquier usuario con sesión podía cargar en public.products un producto "de Open Food
-- Facts" (source 'off') con los datos que quisiera: la base no tiene forma de saber si de verdad
-- viene de OFF, y así se salteaba la foto de la tabla y la revisión del panel. Ahora la app
-- manda solo el código de barras y la función baja los datos de Open Food Facts, los revisa y
-- los guarda con la service role.
--
-- Correr con el workflow "Supabase" → tarea sql → supabase/productos-off-servidor.sql, DESPUÉS
-- de publicar la función (tarea funciones): si se corre antes, mientras tanto los productos
-- escaneados se pueden anotar igual pero no quedan guardados para todos. Va después de
-- productos.sql, productos-revision.sql, productos-off.sql y productos-admin.sql. Se puede
-- correr varias veces.
--
-- Quién puede cargar o cambiar un producto 'off':
--   · la función productos-off (service role) y la importación mensual (workflow "Importar
--     Open Food Facts", que corre como postgres);
--   · un administrador de GIZE;
--   · nadie más: lo que llega directo de la app (roles anon y authenticated) se rechaza.
-- Las funciones de la base que tocan productos (product_use, product_report, las del panel)
-- corren como dueño de la tabla, así que siguen andando con los productos de OFF.

-- 1) Trigger aparte de products_before: si se vuelve a correr productos-admin.sql (que manda
--    sobre products_before), esto no se pierde. Corre después de products_before (van por
--    orden alfabético), que a un usuario común le deja el source 'off' tal como llegó.
create or replace function public.products_off_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  -- current_user es el rol de quien escribe: anon o authenticated si viene directo de la app;
  -- el dueño de la tabla dentro de una función security definer; service_role en la función
  -- productos-off; postgres en el editor SQL y en la importación.
  if current_user in ('anon', 'authenticated') then
    if new.source = 'off' or (tg_op = 'UPDATE' and old.source = 'off') then
      if current_user = 'anon' or not public.is_app_admin() then
        raise exception 'Los productos de Open Food Facts los guarda GIZE.' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists products_off_guard on public.products;
create trigger products_off_guard before insert or update on public.products
  for each row execute function public.products_off_guard();

-- 2) Lo mismo en la política de alta (por las dudas): un usuario común carga solo lo suyo y nunca
--    como 'off'. Update y delete desde la app siguen sin permiso (igual que en productos.sql).
drop policy if exists "usuarios agregan productos" on public.products;
create policy "usuarios agregan productos" on public.products for insert to authenticated
  with check (created_by = auth.uid() and (source <> 'off' or public.is_app_admin()));
revoke update, delete on public.products from anon, authenticated;

-- 3) Tope de búsquedas en Open Food Facts por usuario (lo usa la función productos-off, 150 por
--    día): así no se puede usar a GIZE para pedirle a OFF miles de códigos. Se guarda solo quién
--    y cuándo (no el código), y lo de más de un día se borra solo.
create table if not exists public.product_off_lookups (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists product_off_lookups_user_idx on public.product_off_lookups (user_id, created_at);
alter table public.product_off_lookups enable row level security;
revoke all on public.product_off_lookups from anon, authenticated;

-- Anota una búsqueda y dice si todavía está dentro del tope (false: llegó al límite de hoy).
create or replace function public.product_off_lookup(uid uuid, lim int)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if uid is null then return false; end if;
  -- De a un pedido por usuario: dos búsquedas al mismo tiempo no se saltean el tope.
  perform pg_advisory_xact_lock(hashtext('product_off_lookup'), hashtext(uid::text));
  delete from public.product_off_lookups where user_id = uid and created_at < now() - interval '1 day';
  select count(*) into n from public.product_off_lookups where user_id = uid;
  if n >= greatest(1, coalesce(lim, 150)) then return false; end if;
  insert into public.product_off_lookups (user_id) values (uid);
  return true;
end $$;
-- Solo la función productos-off (service role): desde la app no se puede llamar.
revoke execute on function public.product_off_lookup(uuid, int) from public, anon, authenticated;
grant execute on function public.product_off_lookup(uuid, int) to service_role;

notify pgrst, 'reload schema';

-- Resumen (solo cantidades).
select source, count(*) as productos from public.products group by source order by source;
