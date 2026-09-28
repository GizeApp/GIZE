-- Base compartida, Etapa 2: productos argentinos de Open Food Facts (ver scripts/importar-off.mjs
-- y el workflow "Importar Open Food Facts"). Correr una vez después de productos.sql.
--
-- scans: qué tan escaneado es el producto en Open Food Facts. Sirve para que en la búsqueda
-- salgan primero los productos conocidos (después de los verificados y los más usados en GIZE).
alter table public.products add column if not exists scans integer not null default 0 check (scans >= 0);

-- Con miles de productos, la búsqueda por una parte del nombre ("%leche%") necesita un índice
-- de trigramas para no recorrer la tabla entera.
create extension if not exists pg_trgm with schema extensions;
create index if not exists products_search_trgm_idx on public.products using gin (search extensions.gin_trgm_ops);

-- Igual que en productos.sql, y ahora lo que llega de la app tampoco puede traer "scans".
-- OJO: la versión vigente es la de productos-admin.sql (que además pide la foto de la tabla);
-- si se vuelve a correr este archivo, correr después productos-admin.sql.
create or replace function public.products_before()
returns trigger language plpgsql set search_path = public as $$
begin
  new.name := btrim(regexp_replace(new.name, '\s+', ' ', 'g'));
  new.brand := nullif(btrim(coalesce(new.brand, '')), '');
  new.search := lower(translate(new.name || ' ' || coalesce(new.brand, ''),
    'ÁÉÍÓÚÜÑáéíóúüñÀÈÌÒÙàèìòù', 'AEIOUUNaeiouunAEIOUaeiou'));
  if tg_op = 'INSERT' then
    -- Lo que llega de la app nunca viene verificado, oculto ni con usos, reportes o escaneos.
    if auth.uid() is not null then
      new.verified := false; new.hidden := false; new.uses := 0; new.reports := 0; new.scans := 0; new.created_by := auth.uid();
      if new.source = 'gize' then new.source := 'user'; end if;
      if (select count(*) from public.products where created_by = auth.uid() and created_at > now() - interval '1 day') >= 40 then
        raise exception 'Llegaste al límite de productos nuevos por hoy.' using errcode = '22023';
      end if;
    end if;
  end if;
  return new;
end $$;

-- Resumen (solo cantidades).
select source, count(*) as productos from public.products group by source order by source;
