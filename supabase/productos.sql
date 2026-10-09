-- Base compartida de productos de GIZE (Etapa 1).
-- Lo que un usuario carga al escanear un código que no está en ningún lado queda para todos,
-- y lo que se agrega desde Open Food Facts también se guarda acá (búsqueda más rápida y
-- sin depender de OFF). Valores cada 100 g o 100 ml.
-- Correr con el workflow "Supabase" → tarea sql → supabase/productos.sql.
-- OJO: NO volver a correr suelto. Redefine products_before, y la versión vigente (foto de la
-- tabla obligatoria, scans) está en productos-admin.sql. Si lo corrés, corré después
-- productos-admin.sql. Lo mismo con product_use y product_report: las vigentes (con topes por
-- usuario) están en productos-topes.sql.
--
-- Seguridad:
--   · Cualquier usuario con sesión lee y agrega; nadie edita ni borra desde la app.
--   · Límite de 40 productos nuevos por usuario por día.
--   · Valores absurdos se rechazan (más de 950 kcal, macros de más de 100 g, etc.).
--   · 3 reportes de usuarios distintos ocultan un producto sin verificar (ver productos-topes.sql).
--   · Verificar (tilde ✓) u ocultar a mano: desde el editor SQL de Supabase, por ejemplo
--       update public.products set verified = true where code = '7790070012345';

create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  code        text unique check (code is null or code ~ '^[0-9]{6,14}$'),
  name        text not null check (char_length(name) between 2 and 120),
  brand       text check (brand is null or char_length(brand) <= 60),
  kcal        numeric not null check (kcal between 0 and 950),
  protein     numeric not null default 0 check (protein between 0 and 100),
  carbs       numeric not null default 0 check (carbs between 0 and 100),
  fat         numeric not null default 0 check (fat between 0 and 100),
  unit        text not null default 'g' check (unit in ('g', 'ml')),
  portion     numeric check (portion is null or portion between 1 and 2000),
  source      text not null default 'user' check (source in ('user', 'off', 'gize')),
  search      text not null default '',
  verified    boolean not null default false,
  hidden      boolean not null default false,
  uses        integer not null default 0,
  reports     integer not null default 0,
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  check (protein + carbs + fat <= 105)
);
create index if not exists products_search_idx on public.products (search text_pattern_ops);
create index if not exists products_uses_idx on public.products (uses desc);

-- Texto de búsqueda sin tildes ni mayúsculas (nombre + marca) y control de lo que llega.
create or replace function public.products_before()
returns trigger language plpgsql set search_path = public as $$
begin
  new.name := btrim(regexp_replace(new.name, '\s+', ' ', 'g'));
  new.brand := nullif(btrim(coalesce(new.brand, '')), '');
  new.search := lower(translate(new.name || ' ' || coalesce(new.brand, ''),
    'ÁÉÍÓÚÜÑáéíóúüñÀÈÌÒÙàèìòù', 'AEIOUUNaeiouunAEIOUaeiou'));
  if tg_op = 'INSERT' then
    -- Lo que llega de la app nunca viene verificado, oculto ni con usos o reportes.
    if auth.uid() is not null then
      new.verified := false; new.hidden := false; new.uses := 0; new.reports := 0; new.created_by := auth.uid();
      if new.source = 'gize' then new.source := 'user'; end if;
      if (select count(*) from public.products where created_by = auth.uid() and created_at > now() - interval '1 day') >= 40 then
        raise exception 'Llegaste al límite de productos nuevos por hoy.' using errcode = '22023';
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists products_before on public.products;
create trigger products_before before insert or update on public.products
  for each row execute function public.products_before();

alter table public.products enable row level security;
drop policy if exists "productos visibles" on public.products;
create policy "productos visibles" on public.products for select to authenticated using (not hidden);
drop policy if exists "usuarios agregan productos" on public.products;
create policy "usuarios agregan productos" on public.products for insert to authenticated with check (created_by = auth.uid());
revoke update, delete on public.products from anon, authenticated;

-- Reportes de datos incorrectos (uno por usuario y producto).
create table if not exists public.product_reports (
  product_id uuid not null references public.products(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  reason     text check (reason is null or char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  primary key (product_id, user_id)
);
alter table public.product_reports enable row level security;
revoke all on public.product_reports from anon, authenticated;

-- Se usó un producto: sube en la búsqueda.
create or replace function public.product_use(pid uuid)
returns void language sql security definer set search_path = public as $$
  update public.products set uses = uses + 1 where id = pid and auth.uid() is not null;
$$;
revoke execute on function public.product_use(uuid) from public, anon;
grant execute on function public.product_use(uuid) to authenticated;

-- Reportar un dato incorrecto. Con 3 reportes de usuarios distintos, uno sin verificar se oculta.
create or replace function public.product_report(pid uuid, why text)
returns void language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then return; end if;
  insert into public.product_reports(product_id, user_id, reason) values (pid, auth.uid(), left(why, 200))
    on conflict (product_id, user_id) do nothing;
  select count(*) into n from public.product_reports where product_id = pid;
  update public.products set reports = n, hidden = (hidden or (not verified and n >= 3)) where id = pid;
end $$;
revoke execute on function public.product_report(uuid, text) from public, anon;
grant execute on function public.product_report(uuid, text) to authenticated;

select 'products' as tabla, count(*) as filas from public.products;
