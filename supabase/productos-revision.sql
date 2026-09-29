-- Revisión de la base compartida de productos: foto de la tabla nutricional obligatoria al
-- cargar un producto y una pantalla de administrador para verificar, corregir u ocultar.
-- Correr con el workflow "Supabase" → tarea sql → supabase/productos-revision.sql (después de
-- supabase/productos.sql).
-- OJO: NO volver a correr suelto. Redefine products_before y admin_product_save, y las
-- versiones vigentes están en productos-admin.sql y admin.sql (que además anota en el
-- registro). Si lo corrés, corré después admin.sql y productos-admin.sql.
--
-- Administradores: se agregan a mano desde el editor SQL de Supabase (no va en este archivo
-- porque el repositorio es público):
--   insert into public.app_admins (user_id) select id from auth.users where email = 'TU_MAIL';

-- 1) Administradores de GIZE
create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
revoke all on public.app_admins from anon, authenticated;

create or replace function public.is_app_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;
revoke execute on function public.is_app_admin() from public, anon;
grant execute on function public.is_app_admin() to authenticated;

-- 2) Foto de la tabla: bucket privado, cada usuario sube en su carpeta, solo los admins ven.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('productos', 'productos', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'];
drop policy if exists "productos: sube en su carpeta" on storage.objects;
create policy "productos: sube en su carpeta" on storage.objects
  for insert to authenticated with check (bucket_id = 'productos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "productos: admins ven" on storage.objects;
create policy "productos: admins ven" on storage.objects
  for select to authenticated using (bucket_id = 'productos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_app_admin()));

alter table public.products add column if not exists photo_path text;
alter table public.products drop constraint if exists products_photo_path_check;
alter table public.products add constraint products_photo_path_check
  check (photo_path is null or photo_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,80}$');

-- Lo que carga un usuario a mano tiene que venir con la foto, y de su propia carpeta.
create or replace function public.products_before()
returns trigger language plpgsql set search_path = public as $$
begin
  new.name := btrim(regexp_replace(new.name, '\s+', ' ', 'g'));
  new.brand := nullif(btrim(coalesce(new.brand, '')), '');
  new.search := lower(translate(new.name || ' ' || coalesce(new.brand, ''),
    'ÁÉÍÓÚÜÑáéíóúüñÀÈÌÒÙàèìòù', 'AEIOUUNaeiouunAEIOUaeiou'));
  if tg_op = 'INSERT' and auth.uid() is not null then
    new.verified := false; new.hidden := false; new.uses := 0; new.reports := 0; new.created_by := auth.uid();
    if new.source = 'gize' then new.source := 'user'; end if;
    if new.source = 'user' and (new.photo_path is null or split_part(new.photo_path, '/', 1) <> auth.uid()::text) then
      raise exception 'Falta la foto de la tabla nutricional.' using errcode = '22023';
    end if;
    if new.source = 'off' then new.photo_path := null; end if;
    if (select count(*) from public.products where created_by = auth.uid() and created_at > now() - interval '1 day') >= 40 then
      raise exception 'Llegaste al límite de productos nuevos por hoy.' using errcode = '22023';
    end if;
  end if;
  return new;
end $$;

-- 3) Pantalla de revisión (solo admins)
drop function if exists public.admin_products(text);
create or replace function public.admin_products(kind text)
returns table (id uuid, code text, name text, brand text, kcal numeric, protein numeric, carbs numeric, fat numeric,
  unit text, source text, verified boolean, hidden boolean, uses int, reports int, photo_path text, created_at timestamptz, reasons text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_app_admin() then raise exception 'Solo administradores.' using errcode = '42501'; end if;
  return query
    select p.id, p.code, p.name, p.brand, p.kcal, p.protein, p.carbs, p.fat, p.unit, p.source, p.verified, p.hidden,
           p.uses, p.reports, p.photo_path, p.created_at,
           (select string_agg(coalesce(nullif(r.reason, ''), 'sin detalle'), ' · ' order by r.created_at) from public.product_reports r where r.product_id = p.id)
      from public.products p
     where case kind
             when 'pendientes' then p.source = 'user' and not p.verified and not p.hidden
             when 'reportados' then p.reports > 0 and not p.hidden
             when 'ocultos'    then p.hidden
             else false end
     order by p.reports desc, p.created_at desc
     limit 100;
end $$;
revoke execute on function public.admin_products(text) from public, anon;
grant execute on function public.admin_products(text) to authenticated;

create or replace function public.admin_pending()
returns int language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_app_admin() then return 0; end if;
  return (select count(*) from public.products where not hidden and ((source = 'user' and not verified) or reports > 0));
end $$;
revoke execute on function public.admin_pending() from public, anon;
grant execute on function public.admin_pending() to authenticated;

-- Guardar lo revisado: datos corregidos, verificado u oculto. Al volver a mostrar uno oculto
-- se borran sus reportes (si no, con el próximo se volvería a ocultar). Al verificarlo también:
-- los reportes ya se revisaron (si no, quedaría en Reportados para siempre).
-- La versión vigente de esta función está en admin.sql (además la anota en el registro).
create or replace function public.admin_product_save(pid uuid, p_name text, p_brand text, p_kcal numeric, p_protein numeric,
  p_carbs numeric, p_fat numeric, p_unit text, p_verified boolean, p_hidden boolean)
returns void language plpgsql security definer set search_path = public as $$
declare was_hidden boolean;
begin
  if not public.is_app_admin() then raise exception 'Solo administradores.' using errcode = '42501'; end if;
  select hidden into was_hidden from public.products where id = pid;
  update public.products set name = p_name, brand = p_brand, kcal = p_kcal, protein = p_protein, carbs = p_carbs, fat = p_fat,
    unit = case when p_unit in ('g','ml') then p_unit else unit end, verified = p_verified, hidden = p_hidden
   where id = pid;
  if (was_hidden and not p_hidden) or (p_verified and not p_hidden) then
    delete from public.product_reports where product_id = pid;
    update public.products set reports = 0 where id = pid;
  end if;
end $$;
revoke execute on function public.admin_product_save(uuid, text, text, numeric, numeric, numeric, numeric, text, boolean, boolean) from public, anon;
grant execute on function public.admin_product_save(uuid, text, text, numeric, numeric, numeric, numeric, text, boolean, boolean) to authenticated;

notify pgrst, 'reload schema';
select 'admins' as que, count(*) as cantidad from public.app_admins
union all select 'productos', count(*) from public.products;
