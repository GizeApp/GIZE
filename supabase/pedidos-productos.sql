-- Pedidos de productos: el usuario no carga valores. Manda la foto de la tabla nutricional
-- (y si quiere la del frente), la marca y el nombre; un administrador los revisa en
-- gize.ar/admin → Productos → Pedidos, carga los valores y lo publica para todos.
-- Cuando se publica (o se rechaza), la app se lo avisa al usuario la próxima vez que entra.
-- Correr con el workflow "Supabase" → tarea sql → supabase/pedidos-productos.sql (después de
-- productos-revision.sql, productos-admin.sql y admin.sql). Se puede correr varias veces.
--
-- Las fotos van al bucket privado «productos» (productos-revision.sql), en la carpeta del
-- usuario: las ve él y los administradores.

create table if not exists public.product_requests (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  code        text check (code is null or code ~ '^[0-9]{6,14}$'),
  name        text not null check (char_length(name) between 2 and 120),
  brand       text check (brand is null or char_length(brand) <= 60),
  label_path  text not null check (label_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,80}$'),
  front_path  text check (front_path is null or front_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,80}$'),
  status      text not null default 'pendiente' check (status in ('pendiente', 'cargado', 'rechazado')),
  note        text check (note is null or char_length(note) <= 300),
  product_id  uuid references public.products(id) on delete set null,
  seen        boolean not null default false,
  created_at  timestamptz not null default now(),
  done_at     timestamptz
);
create index if not exists product_requests_pending_idx on public.product_requests(created_at) where status = 'pendiente';
create index if not exists product_requests_user_idx on public.product_requests(user_id);

alter table public.product_requests enable row level security;
revoke all on public.product_requests from anon, authenticated;
grant select, insert on public.product_requests to authenticated;

-- Cada uno manda y ve solo los suyos. Nadie los cambia desde la app (eso va por las funciones).
drop policy if exists "pedidos: los míos" on public.product_requests;
create policy "pedidos: los míos" on public.product_requests
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "pedidos: mandar" on public.product_requests;
create policy "pedidos: mandar" on public.product_requests
  for insert to authenticated with check (
    user_id = auth.uid()
    and split_part(label_path, '/', 1) = auth.uid()::text
    and (front_path is null or split_part(front_path, '/', 1) = auth.uid()::text));

-- Lo que llega de la app entra siempre como pendiente, y con un tope por día.
create or replace function public.product_requests_before()
returns trigger language plpgsql set search_path = public as $$
begin
  new.name := btrim(regexp_replace(new.name, '\s+', ' ', 'g'));
  new.brand := nullif(btrim(regexp_replace(coalesce(new.brand, ''), '\s+', ' ', 'g')), '');
  new.code := nullif(regexp_replace(coalesce(new.code, ''), '\D', '', 'g'), '');
  if auth.uid() is not null then
    new.user_id := auth.uid(); new.status := 'pendiente'; new.note := null; new.product_id := null;
    new.seen := false; new.created_at := now(); new.done_at := null;
    if (select count(*) from public.product_requests where user_id = auth.uid() and created_at > now() - interval '1 day') >= 15 then
      raise exception 'Llegaste al límite de pedidos por hoy. Probá mañana.' using errcode = '22023';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists product_requests_before on public.product_requests;
create trigger product_requests_before before insert on public.product_requests
  for each row execute function public.product_requests_before();

-- Al eliminar su cuenta, la app borra sus fotos de productos (las de los pedidos y las de lo
-- que cargó antes). La foto sigue siendo solo del usuario: un producto ya publicado conserva
-- sus valores aunque se borre la foto.
drop policy if exists "productos: borra los suyos" on storage.objects;
create policy "productos: borra los suyos" on storage.objects
  for delete to authenticated using (bucket_id = 'productos' and (storage.foldername(name))[1] = auth.uid()::text);

-- La app ya le avisó al usuario que su pedido se cargó o se rechazó.
create or replace function public.product_request_seen(rid bigint)
returns void language sql security definer set search_path = public as $$
  update public.product_requests set seen = true where id = rid and user_id = auth.uid() and status <> 'pendiente';
$$;
revoke execute on function public.product_request_seen(bigint) from public, anon;
grant execute on function public.product_request_seen(bigint) to authenticated;

-- Panel: pedidos pendientes (o los últimos resueltos), con quién lo mandó.
create or replace function public.admin_requests(kind text)
returns table (id bigint, code text, name text, brand text, label_path text, front_path text, status text, note text,
  created_at timestamptz, done_at timestamptz, user_email text, user_name text, existing_id uuid, existing_name text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_assert();
  return query
    select r.id, r.code, r.name, r.brand, r.label_path, r.front_path, r.status, r.note, r.created_at, r.done_at,
           u.email::text, p.full_name, e.id, e.name
      from public.product_requests r
      left join auth.users u on u.id = r.user_id
      left join public.profiles p on p.id = r.user_id
      left join public.products e on r.code is not null and e.code = r.code
     where case when kind = 'pendientes' then r.status = 'pendiente' else r.status <> 'pendiente' end
     order by case when kind = 'pendientes' then r.created_at end asc, r.done_at desc nulls last
     limit 100;
end $$;
revoke execute on function public.admin_requests(text) from public, anon;
grant execute on function public.admin_requests(text) to authenticated;

create or replace function public.admin_requests_pending()
returns int language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_app_admin() then return 0; end if;
  return (select count(*) from public.product_requests where status = 'pendiente');
end $$;
revoke execute on function public.admin_requests_pending() from public, anon;
grant execute on function public.admin_requests_pending() to authenticated;

-- Publicar un pedido con los valores que cargó el administrador (cada 100 g o 100 ml).
-- Queda de GIZE y verificado, con la foto de la tabla del pedido. Si ya hay un producto con
-- ese código de barras, se corrige ese (y queda verificado) en vez de crear otro.
create or replace function public.admin_request_publish(rid bigint, p_code text, p_name text, p_brand text, p_kcal numeric,
  p_protein numeric, p_carbs numeric, p_fat numeric, p_unit text, p_portion numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare r public.product_requests; pid uuid; c text := nullif(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'), '');
begin
  perform public.admin_assert();
  select * into r from public.product_requests where id = rid for update;
  if r.id is null then raise exception 'Ese pedido ya no existe.' using errcode = '22023'; end if;
  if r.status <> 'pendiente' then raise exception 'Ese pedido ya se resolvió.' using errcode = '22023'; end if;
  if c is not null and c !~ '^[0-9]{6,14}$' then
    raise exception 'El código de barras tiene que ser de 6 a 14 números (o dejalo vacío).' using errcode = '22023';
  end if;
  if coalesce(p_kcal, -1) < 0 or p_kcal > 950 or coalesce(p_protein, 0) > 100 or coalesce(p_carbs, 0) > 100 or coalesce(p_fat, 0) > 100
     or coalesce(p_protein, 0) + coalesce(p_carbs, 0) + coalesce(p_fat, 0) > 105 then
    raise exception 'Revisá los valores: son cada 100 g o ml.' using errcode = '22023';
  end if;
  if c is not null then select id into pid from public.products where code = c; end if;
  if pid is not null then
    update public.products
       set name = p_name, brand = nullif(btrim(coalesce(p_brand, '')), ''), kcal = p_kcal, protein = coalesce(p_protein, 0),
           carbs = coalesce(p_carbs, 0), fat = coalesce(p_fat, 0), unit = case when p_unit = 'ml' then 'ml' else 'g' end,
           portion = p_portion, verified = true, hidden = false, reports = 0, photo_path = coalesce(photo_path, r.label_path)
     where id = pid;
    delete from public.product_reports where product_id = pid;
  else
    insert into public.products (code, name, brand, kcal, protein, carbs, fat, unit, portion, source, verified, created_by, photo_path)
    values (c, p_name, nullif(btrim(coalesce(p_brand, '')), ''), p_kcal, coalesce(p_protein, 0), coalesce(p_carbs, 0), coalesce(p_fat, 0),
            case when p_unit = 'ml' then 'ml' else 'g' end, p_portion, 'gize', true, auth.uid(), r.label_path)
    returning id into pid;
  end if;
  update public.product_requests set status = 'cargado', product_id = pid, name = p_name, done_at = now() where id = rid;
  perform public.admin_log('pedido_publicado', pid::text, jsonb_build_object('pedido', rid, 'name', p_name));
  return pid;
end $$;
revoke execute on function public.admin_request_publish(bigint, text, text, text, numeric, numeric, numeric, numeric, text, numeric) from public, anon;
grant execute on function public.admin_request_publish(bigint, text, text, text, numeric, numeric, numeric, numeric, text, numeric) to authenticated;

-- Rechazar un pedido (foto ilegible, producto repetido…). El motivo se le muestra al usuario.
create or replace function public.admin_request_reject(rid bigint, p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_assert();
  update public.product_requests set status = 'rechazado', note = nullif(left(btrim(coalesce(p_note, '')), 300), ''), done_at = now()
   where id = rid and status = 'pendiente';
  if not found then raise exception 'Ese pedido ya se resolvió o no existe.' using errcode = '22023'; end if;
  perform public.admin_log('pedido_rechazado', rid::text, jsonb_build_object('motivo', p_note));
end $$;
revoke execute on function public.admin_request_reject(bigint, text) from public, anon;
grant execute on function public.admin_request_reject(bigint, text) to authenticated;

notify pgrst, 'reload schema';
