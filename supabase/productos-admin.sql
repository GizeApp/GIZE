-- Panel de administrador → Productos: buscar en toda la base compartida, agregar productos
-- nuevos (quedan como de GIZE y verificados) y borrar los que no van (su código de barras queda
-- bloqueado: no vuelve solo al escanearlo ni con las importaciones).
-- Correr con el workflow "Supabase" → tarea sql → supabase/productos-admin.sql. Se puede
-- correr varias veces. Va después de productos.sql, productos-off.sql, productos-revision.sql y
-- admin.sql, y antes de pedidos-productos.sql y productos-off-servidor.sql.

-- Igual que en productos-revision.sql y productos-off.sql, pero un administrador puede cargar
-- productos sin el tope diario y con el origen y la verificación que elige. A los usuarios se
-- les sigue forzando todo, incluida la foto de la tabla (productos-off.sql la había perdido):
-- sin foto un producto cargado a mano no pasa por la revisión del panel. Y uno "de Open Food
-- Facts" tiene que traer su código de barras. La fecha la pone el servidor: el tope de 40 por
-- día cuenta por created_at, y con una fecha vieja mandada a mano no contaba nunca.
create or replace function public.products_before()
returns trigger language plpgsql set search_path = public as $$
begin
  new.name := btrim(regexp_replace(new.name, '\s+', ' ', 'g'));
  new.brand := nullif(btrim(coalesce(new.brand, '')), '');
  new.search := lower(translate(new.name || ' ' || coalesce(new.brand, ''),
    'ÁÉÍÓÚÜÑáéíóúüñÀÈÌÒÙàèìòù', 'AEIOUUNaeiouunAEIOUaeiou'));
  if tg_op = 'INSERT' then
    -- Lo que llega de la app nunca viene verificado, oculto ni con usos, reportes o escaneos.
    if auth.uid() is not null and not public.is_app_admin() then
      new.verified := false; new.hidden := false; new.uses := 0; new.reports := 0; new.scans := 0; new.created_by := auth.uid();
      new.created_at := now();
      if new.source is distinct from 'off' then new.source := 'user'; end if;
      if new.source = 'user' and (new.photo_path is null or split_part(new.photo_path, '/', 1) <> auth.uid()::text) then
        raise exception 'Falta la foto de la tabla nutricional.' using errcode = '22023';
      end if;
      if new.source = 'off' then
        new.photo_path := null;
        if coalesce(new.code, '') !~ '^[0-9]{6,14}$' then
          raise exception 'Falta el código de barras.' using errcode = '22023';
        end if;
      end if;
      if (select count(*) from public.products where created_by = auth.uid() and created_at > now() - interval '1 day') >= 40 then
        raise exception 'Llegaste al límite de productos nuevos por hoy.' using errcode = '22023';
      end if;
    end if;
  end if;
  return new;
end $$;

-- Buscar en toda la base (nombre, marca o código). Sin texto: los más usados. Trae también el
-- motivo de los reportes (reasons), igual que admin_products.
drop function if exists public.admin_products_search(text, int);
create or replace function public.admin_products_search(q text, lim int default 60)
returns table (id uuid, code text, name text, brand text, kcal numeric, protein numeric, carbs numeric, fat numeric,
  unit text, portion numeric, source text, verified boolean, hidden boolean, uses int, reports int, photo_path text, created_at timestamptz,
  reasons text)
language plpgsql stable security definer set search_path = public as $$
declare t text := lower(translate(btrim(coalesce(q, '')), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'));
begin
  perform public.admin_assert();
  return query
    select p.id, p.code, p.name, p.brand, p.kcal, p.protein, p.carbs, p.fat, p.unit, p.portion, p.source, p.verified, p.hidden,
           p.uses, p.reports, p.photo_path, p.created_at,
           (select string_agg(coalesce(nullif(r.reason, ''), 'sin detalle'), ' · ' order by r.created_at) from public.product_reports r where r.product_id = p.id)
      from public.products p
     where t = '' or p.code = t
        or not exists (select 1 from regexp_split_to_table(t, '\s+') w where w <> '' and position(w in p.search) = 0)
     order by (p.code = t) desc nulls last, p.verified desc, p.uses desc, p.scans desc, p.name
     limit greatest(1, least(coalesce(lim, 60), 200));
end $$;
revoke execute on function public.admin_products_search(text, int) from public, anon;
grant execute on function public.admin_products_search(text, int) to authenticated;

-- Agregar un producto (valores cada 100 g o 100 ml). Queda de GIZE y verificado.
create or replace function public.admin_product_add(p_code text, p_name text, p_brand text, p_kcal numeric, p_protein numeric,
  p_carbs numeric, p_fat numeric, p_unit text, p_portion numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare nid uuid; c text := nullif(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'), '');
begin
  perform public.admin_assert();
  if c is not null and c !~ '^[0-9]{6,14}$' then
    raise exception 'El código de barras tiene que ser de 6 a 14 números (o dejalo vacío).' using errcode = '22023';
  end if;
  if c is not null and exists (select 1 from public.products where code = c) then
    raise exception 'Ya hay un producto con ese código de barras. Buscalo en la base y editalo.' using errcode = '23505';
  end if;
  insert into public.products (code, name, brand, kcal, protein, carbs, fat, unit, portion, source, verified, created_by)
  values (c, p_name, p_brand, p_kcal, coalesce(p_protein, 0), coalesce(p_carbs, 0), coalesce(p_fat, 0),
          case when p_unit = 'ml' then 'ml' else 'g' end, p_portion, 'gize', true, auth.uid())
  returning id into nid;
  perform public.admin_log('producto_nuevo', nid::text, jsonb_build_object('name', p_name));
  return nid;
end $$;
revoke execute on function public.admin_product_add(text, text, text, numeric, numeric, numeric, numeric, text, numeric) from public, anon;
grant execute on function public.admin_product_add(text, text, text, numeric, numeric, numeric, numeric, text, numeric) to authenticated;

-- Códigos de barras de los productos que borró un administrador. Antes «Borrar» sacaba la fila
-- y nada más: el código volvía apenas alguien lo escaneaba (función productos-off) o con la
-- importación del mes, como si nunca se hubiera visto. Para volver a cargarlo: «Agregar
-- producto» o publicar un pedido desde el panel (eso lo saca de la lista).
create table if not exists public.product_deleted_codes (
  code       text primary key,
  name       text,
  deleted_at timestamptz not null default now()
);
alter table public.product_deleted_codes enable row level security;
revoke all on public.product_deleted_codes from anon, authenticated;

-- Trigger aparte de products_before (que se pisa si se vuelve a correr un archivo viejo). Un
-- código borrado no se carga: la fila se saltea sin error, así una importación sigue con las
-- demás. Lo carga solo un administrador desde el panel, y ahí deja de estar bloqueado.
-- security definer: lee la lista aunque quien carga no tenga permiso sobre ella.
create or replace function public.products_deleted_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.code is not null and exists (select 1 from public.product_deleted_codes where code = new.code) then
    if auth.uid() is null or not public.is_app_admin() then return null; end if;
    delete from public.product_deleted_codes where code = new.code;
  end if;
  return new;
end $$;
revoke execute on function public.products_deleted_guard() from public, anon, authenticated;
drop trigger if exists products_deleted_guard on public.products;
create trigger products_deleted_guard before insert on public.products
  for each row execute function public.products_deleted_guard();

-- Borrar un producto para siempre (sus reportes se borran solos) y bloquear su código. Lo que
-- la gente ya anotó en su diario no cambia: ahí se guarda una copia de los valores.
create or replace function public.admin_product_delete(pid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare n text; c text;
begin
  perform public.admin_assert();
  delete from public.products where id = pid returning name, code into n, c;
  if n is null then raise exception 'Ese producto ya no existe.' using errcode = '22023'; end if;
  if c is not null then
    insert into public.product_deleted_codes (code, name) values (c, n)
      on conflict (code) do update set name = excluded.name, deleted_at = now();
  end if;
  perform public.admin_log('producto_borrar', pid::text, jsonb_build_object('name', n, 'code', c));
end $$;
revoke execute on function public.admin_product_delete(uuid) from public, anon;
grant execute on function public.admin_product_delete(uuid) to authenticated;

notify pgrst, 'reload schema';

-- Resumen (solo cantidades).
select source, count(*) as productos, count(*) filter (where hidden) as ocultos from public.products group by source
union all select 'códigos borrados', count(*), null from public.product_deleted_codes order by 1;
