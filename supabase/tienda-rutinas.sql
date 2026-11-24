-- Tienda de rutinas: cualquiera que entrena por su cuenta publica su rutina (gratis) y cualquiera la
-- puede agregar a su app. SIN COBRO: no hay precios ni compras; todo es gratis.
-- Correr con el workflow "Supabase" → tarea sql → supabase/tienda-rutinas.sql, después de
-- supabase/seguridad-base.sql, supabase/rutinas-genericas.sql y supabase/admin.sql.
-- Se puede correr varias veces. Sin esos archivos falla entero, sin cambiar nada.
--
-- Qué suma:
--   · tienda_rutinas: cada rutina publicada (título, descripción, nivel, objetivo y los días). Los días
--     se guardan «limpios» (public.rutina_generica): sin notas, kilos, videos ni audios de nadie.
--   · tienda_agregadas: quién agregó cada rutina (una vez por persona; sirve para contar).
--   · tienda_reportes: denuncias de las personas (una por persona y rutina). Con 3 denuncias distintas
--     la rutina se oculta sola hasta que la revise el admin.
--   · tienda_mis_rutinas: «Mis rutinas» de cada persona. Las que agregó de la Tienda (una copia: si el
--     creador la saca, la persona la conserva) y «Tu rutina anterior», la propia que tenía al cambiar
--     a otra (hasta 5). La primera vez que se corre, pasa acá las que cada persona ya había agregado.
--   · app_config 'tienda': el interruptor por plataforma ({web, android, ios}). Nace con la web prendida
--     y las apps apagadas; volver a correr el archivo no lo pisa.
--   · Para la app: tienda_config, tienda_listar, tienda_detalle, tienda_publicar, tienda_despublicar,
--     tienda_agregar, tienda_reportar, tienda_mis, tienda_usar, tienda_mis_borrar y
--     tienda_guardar_anterior.
--   · Para el admin: admin_tienda (el interruptor), admin_tienda_estado y admin_tienda_rutina
--     (ocultar, mostrar, borrar, verificar al creador, destacar).
--
-- Quién puede:
--   · Mirar la Tienda y agregar a Mis rutinas: cualquier persona con cuenta, también el alumno que
--     tiene coach. Si ese alumno usa una, la app primero lo desvincula de su coach (se lo avisa antes).
--   · Publicar: cualquier persona con cuenta salvo el alumno que tiene coach (su rutina es del coach).
--     Solo se publica una rutina armada por la persona: no una que vino de la Tienda (ni una igual a
--     otra que ya está publicada) ni la que le armó su coach (los días que llegaron del coach o de la
--     Tienda los marca la app con «origen»).
--   · Nadie lee ni escribe las tablas directo (RLS prendido, sin políticas ni permisos).
--   · De cada rutina se ve el nombre del creador (el del perfil). La app se lo avisa antes de publicar.
-- Si se borra la cuenta del creador, se borran sus rutinas (quienes la agregaron conservan su copia).
-- Si se borra la cuenta de una persona, se borran sus Mis rutinas.
--
-- Para volver atrás: el bloque comentado del final.


-- ===== Antes que nada: ¿están los archivos anteriores? =====

do $$ begin
  if to_regclass('public.profiles') is null or to_regclass('public.app_config') is null
     or to_regprocedure('public.rutina_generica(jsonb)') is null
     or to_regprocedure('public.routine_days_ok(jsonb)') is null
     or to_regprocedure('public.admin_assert()') is null
     or to_regprocedure('public.admin_log(text, text, jsonb)') is null then
    raise exception 'Primero correr supabase/seguridad-base.sql, supabase/rutinas-genericas.sql y supabase/admin.sql: este archivo usa sus tablas y funciones.';
  end if;
end $$;


-- ===== Tablas =====

create table if not exists public.tienda_rutinas (
  id          uuid primary key default gen_random_uuid(),
  autor_id    uuid not null references auth.users(id) on delete cascade,
  titulo      text not null check (char_length(titulo) between 3 and 40),
  descripcion text not null default '' check (char_length(descripcion) <= 200),
  nivel       text not null check (nivel in ('Principiante', 'Intermedio', 'Avanzado')),
  objetivo    text not null check (objetivo in ('Fuerza', 'Hipertrofia', 'Glúteos', 'Principiantes')),
  days        jsonb not null,
  agregadas   int  not null default 0 check (agregadas >= 0),
  estado      text not null default 'activa' check (estado in ('activa', 'oculta')),
  verificado  boolean not null default false,
  destacada   boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists tienda_rutinas_autor_idx on public.tienda_rutinas (autor_id);
create index if not exists tienda_rutinas_lista_idx on public.tienda_rutinas (estado, destacada desc, agregadas desc, created_at desc);
alter table public.tienda_rutinas enable row level security;
revoke all on public.tienda_rutinas from public, anon, authenticated;

drop trigger if exists tienda_rutinas_validate on public.tienda_rutinas;
create trigger tienda_rutinas_validate before insert or update of days on public.tienda_rutinas
  for each row execute function public.routines_validate();

create table if not exists public.tienda_agregadas (
  rutina_id  uuid not null references public.tienda_rutinas(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (rutina_id, user_id)
);
alter table public.tienda_agregadas enable row level security;
revoke all on public.tienda_agregadas from public, anon, authenticated;

create table if not exists public.tienda_reportes (
  rutina_id  uuid not null references public.tienda_rutinas(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  motivo     text not null check (motivo in ('inapropiada', 'spam', 'copiada', 'otro')),
  created_at timestamptz not null default now(),
  primary key (rutina_id, user_id)
);
alter table public.tienda_reportes enable row level security;
revoke all on public.tienda_reportes from public, anon, authenticated;

-- Mis rutinas. Se crea una sola vez: la primera vez, con las que cada persona ya había agregado
-- (antes «Agregar» las cargaba directo en Entreno). Volver a correr el archivo no las repone si la
-- persona después borró alguna.
do $$ begin
  if to_regclass('public.tienda_mis_rutinas') is null then
    create table public.tienda_mis_rutinas (
      id         uuid primary key default gen_random_uuid(),
      user_id    uuid not null references auth.users(id) on delete cascade,
      -- La de la Tienda de donde vino (null si es «Tu rutina anterior» o si el creador la sacó).
      rutina_id  uuid references public.tienda_rutinas(id) on delete set null,
      origen     text not null check (origen in ('tienda', 'anterior')),
      titulo     text not null check (char_length(titulo) between 1 and 60),
      autor      text not null default '',
      nivel      text not null default '',
      objetivo   text not null default '',
      days       jsonb not null,
      usada_at   timestamptz,
      created_at timestamptz not null default now()
    );
    create unique index tienda_mis_rutinas_una on public.tienda_mis_rutinas (user_id, rutina_id) where rutina_id is not null;
    insert into public.tienda_mis_rutinas (user_id, rutina_id, origen, titulo, autor, nivel, objetivo, days, created_at)
      select a.user_id, r.id, 'tienda', r.titulo, coalesce(nullif(btrim(p.full_name), ''), 'Usuario de GIZE'), r.nivel, r.objetivo, r.days, a.created_at
        from public.tienda_agregadas a
        join public.tienda_rutinas r on r.id = a.rutina_id
        left join public.profiles p on p.id = r.autor_id;
  end if;
end $$;
create index if not exists tienda_mis_rutinas_user_idx on public.tienda_mis_rutinas (user_id, created_at desc);
alter table public.tienda_mis_rutinas enable row level security;
revoke all on public.tienda_mis_rutinas from public, anon, authenticated;

drop trigger if exists tienda_mis_rutinas_validate on public.tienda_mis_rutinas;
create trigger tienda_mis_rutinas_validate before insert or update of days on public.tienda_mis_rutinas
  for each row execute function public.routines_validate();

-- El interruptor: nace con la web prendida y las apps apagadas (no se pisa si ya existe).
insert into public.app_config (key, value) values ('tienda', jsonb_build_object('web', true, 'android', false, 'ios', false))
  on conflict (key) do nothing;


-- ===== Ayudas =====

create or replace function public.tienda_interruptor()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('web', false, 'android', false, 'ios', false)
         || coalesce((select c.value from public.app_config c where c.key = 'tienda' and jsonb_typeof(c.value) = 'object'), '{}'::jsonb)
$$;
revoke all on function public.tienda_interruptor() from public, anon, authenticated;

-- Cualquier persona con cuenta (para mirar, agregar y usar Mis rutinas).
create or replace function public.tienda_cuenta()
returns uuid language plpgsql stable security definer set search_path = public as $$
declare yo uuid := auth.uid();
begin
  if yo is null or not exists (select 1 from public.profiles where id = yo) then
    raise exception 'Entrá a tu cuenta para usar la Tienda.' using errcode = '42501';
  end if;
  return yo;
end $$;
revoke all on function public.tienda_cuenta() from public, anon, authenticated;

-- Para publicar: quien tiene coach (y no es coach) no publica, porque su rutina la arma el coach.
create or replace function public.tienda_exigir()
returns uuid language plpgsql stable security definer set search_path = public as $$
declare yo uuid := public.tienda_cuenta(); p record;
begin
  select role, coach_id into p from public.profiles where id = yo;
  if p.role <> 'coach' and p.coach_id is not null then
    raise exception 'Tu coach arma tu rutina, así que no la podés publicar.' using errcode = 'P0001';
  end if;
  return yo;
end $$;
revoke all on function public.tienda_exigir() from public, anon, authenticated;

-- La «huella» de una rutina: los ejercicios de cada día, sin importar mayúsculas, espacios ni el orden
-- (de los días ni de los ejercicios). Dos rutinas con la misma huella son la misma rutina.
create or replace function public.tienda_huella(days jsonb)
returns text language sql immutable set search_path = public as $$
  select coalesce(string_agg(x.h, '|' order by x.h), '')
    from (select (select string_agg(regexp_replace(lower(btrim(coalesce(e->>'name', ''))), '\s+', ' ', 'g'), ',' order by regexp_replace(lower(btrim(coalesce(e->>'name', ''))), '\s+', ' ', 'g'))
                    from jsonb_array_elements(case when jsonb_typeof(d->'exercises') = 'array' then d->'exercises' else '[]'::jsonb end) e) as h
            from jsonb_array_elements(case when jsonb_typeof(days) = 'array' then days else '[]'::jsonb end) d) x
   where x.h is not null
$$;
revoke all on function public.tienda_huella(jsonb) from public, anon, authenticated;

-- Cuántos días con ejercicios y cuántos ejercicios tiene una rutina.
create or replace function public.tienda_dias(days jsonb)
returns int language sql immutable set search_path = public as $$
  select count(*)::int from jsonb_array_elements(days) d where jsonb_array_length(coalesce(d->'exercises', '[]'::jsonb)) > 0
$$;
create or replace function public.tienda_ejercicios(days jsonb)
returns int language sql immutable set search_path = public as $$
  select coalesce(sum(jsonb_array_length(coalesce(d->'exercises', '[]'::jsonb))), 0)::int from jsonb_array_elements(days) d
$$;
revoke all on function public.tienda_dias(jsonb) from public, anon, authenticated;
revoke all on function public.tienda_ejercicios(jsonb) from public, anon, authenticated;

-- Una rutina como la ve la app (sin los días: esos van en tienda_detalle).
create or replace function public.tienda_ficha(p_id uuid, yo uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', r.id, 'titulo', r.titulo, 'descripcion', r.descripcion, 'nivel', r.nivel, 'objetivo', r.objetivo,
    'autor', coalesce(nullif(btrim((select p.full_name from public.profiles p where p.id = r.autor_id)), ''), 'Usuario de GIZE'),
    'verificado', r.verificado, 'destacada', r.destacada, 'agregadas', r.agregadas,
    'dias', public.tienda_dias(r.days), 'ejercicios', public.tienda_ejercicios(r.days),
    'estado', r.estado, 'creada', r.created_at,
    'mia', r.autor_id = yo,
    'agregue', exists (select 1 from public.tienda_mis_rutinas m where m.rutina_id = r.id and m.user_id = yo),
    'reporte', exists (select 1 from public.tienda_reportes x where x.rutina_id = r.id and x.user_id = yo))
    from public.tienda_rutinas r where r.id = p_id
$$;
revoke all on function public.tienda_ficha(uuid, uuid) from public, anon, authenticated;


-- ===== Para la app =====

-- Dónde se ve la Tienda (lo lee la app para saber si mostrar el botón).
create or replace function public.tienda_config()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Entrá a tu cuenta para usar la Tienda.' using errcode = '42501'; end if;
  return public.tienda_interruptor();
end $$;
revoke all on function public.tienda_config() from public, anon;
grant execute on function public.tienda_config() to authenticated;

-- Las rutinas activas (las más agregadas primero, con las destacadas arriba) y las propias, aunque
-- estén ocultas. Hasta 100.
create or replace function public.tienda_listar()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare yo uuid := auth.uid();
begin
  if yo is null then raise exception 'Entrá a tu cuenta para usar la Tienda.' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(public.tienda_ficha(r.id, yo) order by r.destacada desc, r.agregadas desc, r.created_at desc)
      from (select * from public.tienda_rutinas t where t.estado = 'activa' or t.autor_id = yo
             order by t.destacada desc, t.agregadas desc, t.created_at desc limit 100) r), '[]'::jsonb);
end $$;
revoke all on function public.tienda_listar() from public, anon;
grant execute on function public.tienda_listar() to authenticated;

-- Una rutina con sus días (para ver qué incluye).
create or replace function public.tienda_detalle(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare yo uuid := auth.uid(); r public.tienda_rutinas;
begin
  if yo is null then raise exception 'Entrá a tu cuenta para usar la Tienda.' using errcode = '42501'; end if;
  select * into r from public.tienda_rutinas t where t.id = p_id and (t.estado = 'activa' or t.autor_id = yo);
  if not found then raise exception 'Esa rutina ya no está en la Tienda.' using errcode = 'P0001'; end if;
  return public.tienda_ficha(r.id, yo) || jsonb_build_object('days', r.days);
end $$;
revoke all on function public.tienda_detalle(uuid) from public, anon;
grant execute on function public.tienda_detalle(uuid) to authenticated;

-- Publicar la rutina propia. Los días se limpian (sin notas, kilos, videos ni audios). Hasta 10 por
-- persona y tiene que haber al menos un ejercicio. No se publica lo que no armó la persona: días que
-- vinieron de su coach o de la Tienda («origen»), una rutina igual a otra publicada o a una que
-- agregó de la Tienda.
create or replace function public.tienda_publicar(p_titulo text, p_descripcion text, p_nivel text, p_objetivo text, p_days jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare yo uuid := public.tienda_exigir(); limpios jsonb; huella text; r public.tienda_rutinas;
begin
  if jsonb_typeof(p_days) is distinct from 'array' or not public.routine_days_ok(p_days) then
    raise exception 'La rutina tiene datos inválidos. Actualizá la app y volvé a intentar.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_days) d where d ? 'origen') then
    raise exception 'Solo podés publicar una rutina armada por vos: las de la Tienda y las de tu coach no se publican.' using errcode = 'P0001';
  end if;
  limpios := public.rutina_generica(p_days);
  if public.tienda_ejercicios(limpios) < 1 then
    raise exception 'Cargá al menos un ejercicio antes de publicar.' using errcode = 'P0001';
  end if;
  if pg_column_size(limpios) > 200000 then
    raise exception 'La rutina es demasiado grande para publicarla.' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_titulo, ''))) < 3 or char_length(btrim(p_titulo)) > 40 then
    raise exception 'El título tiene que tener entre 3 y 40 letras.' using errcode = 'P0001';
  end if;
  if char_length(coalesce(p_descripcion, '')) > 200 then
    raise exception 'La descripción puede tener hasta 200 letras.' using errcode = 'P0001';
  end if;
  if p_nivel not in ('Principiante', 'Intermedio', 'Avanzado') or p_objetivo not in ('Fuerza', 'Hipertrofia', 'Glúteos', 'Principiantes') then
    raise exception 'Revisá el nivel y el objetivo.' using errcode = 'P0001';
  end if;
  -- Un solo pedido a la vez por persona: así el tope de 10 vale aunque lleguen juntos.
  perform pg_advisory_xact_lock(hashtextextended('tienda-publicar:' || yo::text, 0));
  if (select count(*) from public.tienda_rutinas t where t.autor_id = yo) >= 10 then
    raise exception 'Ya publicaste 10 rutinas. Sacá alguna para publicar otra.' using errcode = 'P0001';
  end if;
  huella := public.tienda_huella(limpios);
  if exists (select 1 from public.tienda_rutinas t where t.autor_id = yo and public.tienda_huella(t.days) = huella) then
    raise exception 'Ya publicaste esta rutina.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.tienda_rutinas t where t.autor_id <> yo and public.tienda_huella(t.days) = huella)
     or exists (select 1 from public.tienda_mis_rutinas m where m.user_id = yo and m.origen = 'tienda' and public.tienda_huella(m.days) = huella) then
    raise exception 'Esta rutina es de otra persona de la Tienda: solo podés publicar una armada por vos.' using errcode = 'P0001';
  end if;
  insert into public.tienda_rutinas (autor_id, titulo, descripcion, nivel, objetivo, days)
    values (yo, btrim(p_titulo), btrim(coalesce(p_descripcion, '')), p_nivel, p_objetivo, limpios)
    returning * into r;
  return public.tienda_ficha(r.id, yo);
end $$;
revoke all on function public.tienda_publicar(text, text, text, text, jsonb) from public, anon;
grant execute on function public.tienda_publicar(text, text, text, text, jsonb) to authenticated;

-- Sacar una rutina propia de la Tienda.
create or replace function public.tienda_despublicar(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare yo uuid := auth.uid();
begin
  if yo is null then raise exception 'Entrá a tu cuenta para usar la Tienda.' using errcode = '42501'; end if;
  delete from public.tienda_rutinas t where t.id = p_id and t.autor_id = yo;
  if not found then raise exception 'Esa rutina ya no está en la Tienda.' using errcode = 'P0001'; end if;
end $$;
revoke all on function public.tienda_despublicar(uuid) from public, anon;
grant execute on function public.tienda_despublicar(uuid) to authenticated;

-- Agregar una rutina a Mis rutinas (una copia, que queda aunque el creador la saque). No la pone en
-- Entreno: eso es tienda_usar. Cuenta una sola vez por persona, aunque la borre y la vuelva a agregar.
-- Devuelve la de Mis rutinas (como tienda_mis).
create or replace function public.tienda_mia(m public.tienda_mis_rutinas)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', m.id, 'rutina_id', m.rutina_id, 'origen', m.origen, 'titulo', m.titulo, 'autor', m.autor,
    'nivel', m.nivel, 'objetivo', m.objetivo, 'dias', public.tienda_dias(m.days), 'ejercicios', public.tienda_ejercicios(m.days),
    'usada', m.usada_at, 'creada', m.created_at)
$$;
revoke all on function public.tienda_mia(public.tienda_mis_rutinas) from public, anon, authenticated;

create or replace function public.tienda_agregar(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare yo uuid := public.tienda_cuenta(); r public.tienda_rutinas; m public.tienda_mis_rutinas; nueva int;
begin
  select * into r from public.tienda_rutinas t where t.id = p_id and (t.estado = 'activa' or t.autor_id = yo);
  if not found then raise exception 'Esa rutina ya no está en la Tienda.' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended('tienda-mis:' || yo::text, 0));
  select * into m from public.tienda_mis_rutinas x where x.user_id = yo and x.rutina_id = r.id;
  if not found then
    if (select count(*) from public.tienda_mis_rutinas x where x.user_id = yo) >= 50 then
      raise exception 'Ya tenés 50 rutinas guardadas. Borrá alguna de Mis rutinas para agregar otra.' using errcode = 'P0001';
    end if;
    insert into public.tienda_mis_rutinas (user_id, rutina_id, origen, titulo, autor, nivel, objetivo, days)
      values (yo, r.id, 'tienda', r.titulo, coalesce(nullif(btrim((select p.full_name from public.profiles p where p.id = r.autor_id)), ''), 'Usuario de GIZE'),
              r.nivel, r.objetivo, r.days)
      returning * into m;
  end if;
  insert into public.tienda_agregadas (rutina_id, user_id) values (r.id, yo) on conflict do nothing;
  get diagnostics nueva = row_count;
  if nueva > 0 and r.autor_id <> yo then
    update public.tienda_rutinas set agregadas = agregadas + 1 where id = r.id;
  end if;
  return public.tienda_mia(m);
end $$;
revoke all on function public.tienda_agregar(uuid) from public, anon;
grant execute on function public.tienda_agregar(uuid) to authenticated;

-- Mis rutinas: las agregadas de la Tienda y las anteriores, la más nueva primero (sin los días).
create or replace function public.tienda_mis()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare yo uuid := public.tienda_cuenta();
begin
  return coalesce((select jsonb_agg(public.tienda_mia(m) order by m.created_at desc, m.id)
                     from public.tienda_mis_rutinas m where m.user_id = yo), '[]'::jsonb);
end $$;
revoke all on function public.tienda_mis() from public, anon;
grant execute on function public.tienda_mis() to authenticated;

-- Usar una de Mis rutinas: devuelve sus días para ponerlos en Entreno y anota cuándo se usó. Al alumno
-- con coach la app primero lo desvincula (se lo avisa antes); si sigue con coach, no se la da.
create or replace function public.tienda_usar(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare yo uuid := public.tienda_cuenta(); p record; m public.tienda_mis_rutinas;
begin
  select role, coach_id into p from public.profiles where id = yo;
  if p.role <> 'coach' and p.coach_id is not null then
    raise exception 'Para usar una rutina de la Tienda primero tenés que dejar a tu coach.' using errcode = 'P0001';
  end if;
  update public.tienda_mis_rutinas x set usada_at = now() where x.id = p_id and x.user_id = yo returning * into m;
  if not found then raise exception 'Esa rutina ya no está en Mis rutinas.' using errcode = 'P0001'; end if;
  return public.tienda_mia(m) || jsonb_build_object('days', m.days);
end $$;
revoke all on function public.tienda_usar(uuid) from public, anon;
grant execute on function public.tienda_usar(uuid) to authenticated;

-- Borrar una de Mis rutinas (no la saca de la Tienda ni de Entreno).
create or replace function public.tienda_mis_borrar(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare yo uuid := public.tienda_cuenta();
begin
  delete from public.tienda_mis_rutinas x where x.id = p_id and x.user_id = yo;
  if not found then raise exception 'Esa rutina ya no está en Mis rutinas.' using errcode = 'P0001'; end if;
end $$;
revoke all on function public.tienda_mis_borrar(uuid) from public, anon;
grant execute on function public.tienda_mis_borrar(uuid) to authenticated;

-- «Tu rutina anterior»: la rutina propia que la persona tenía al pasar a otra de Mis rutinas, tal cual
-- (con sus notas y kilos: es suya). No se guarda una que vino de la Tienda o del coach («origen»), ni
-- una sin ejercicios, ni dos veces la misma. Quedan las últimas 5. Devuelve la guardada (o null).
create or replace function public.tienda_guardar_anterior(p_days jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare yo uuid := public.tienda_cuenta(); huella text; m public.tienda_mis_rutinas;
begin
  if jsonb_typeof(p_days) is distinct from 'array' or not public.routine_days_ok(p_days) then
    raise exception 'La rutina tiene datos inválidos. Actualizá la app y volvé a intentar.' using errcode = '22023';
  end if;
  if pg_column_size(p_days) > 200000 then
    raise exception 'La rutina es demasiado grande para guardarla.' using errcode = 'P0001';
  end if;
  if public.tienda_ejercicios(p_days) < 1 or exists (select 1 from jsonb_array_elements(p_days) d where d ? 'origen') then
    return null;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('tienda-mis:' || yo::text, 0));
  huella := public.tienda_huella(p_days);
  select * into m from public.tienda_mis_rutinas x where x.user_id = yo and x.origen = 'anterior' and public.tienda_huella(x.days) = huella;
  if found then
    update public.tienda_mis_rutinas set days = p_days, created_at = now() where id = m.id returning * into m;
  else
    insert into public.tienda_mis_rutinas (user_id, origen, titulo, days) values (yo, 'anterior', 'Tu rutina anterior', p_days) returning * into m;
  end if;
  delete from public.tienda_mis_rutinas x where x.user_id = yo and x.origen = 'anterior'
     and x.id not in (select y.id from public.tienda_mis_rutinas y where y.user_id = yo and y.origen = 'anterior' order by y.created_at desc, y.id limit 5);
  return public.tienda_mia(m);
end $$;
revoke all on function public.tienda_guardar_anterior(jsonb) from public, anon;
grant execute on function public.tienda_guardar_anterior(jsonb) to authenticated;

-- Denunciar una rutina de otra persona. Con 3 denuncias distintas se oculta hasta que la revise el admin.
create or replace function public.tienda_reportar(p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare yo uuid := auth.uid(); r public.tienda_rutinas;
begin
  if yo is null then raise exception 'Entrá a tu cuenta para usar la Tienda.' using errcode = '42501'; end if;
  if p_motivo not in ('inapropiada', 'spam', 'copiada', 'otro') then
    raise exception 'Elegí un motivo.' using errcode = 'P0001';
  end if;
  select * into r from public.tienda_rutinas t where t.id = p_id and t.estado = 'activa';
  if not found then raise exception 'Esa rutina ya no está en la Tienda.' using errcode = 'P0001'; end if;
  if r.autor_id = yo then raise exception 'No podés denunciar tu propia rutina.' using errcode = 'P0001'; end if;
  insert into public.tienda_reportes (rutina_id, user_id, motivo) values (r.id, yo, p_motivo)
    on conflict (rutina_id, user_id) do update set motivo = excluded.motivo;
  if (select count(*) from public.tienda_reportes x where x.rutina_id = r.id) >= 3 then
    update public.tienda_rutinas set estado = 'oculta' where id = r.id;
  end if;
end $$;
revoke all on function public.tienda_reportar(uuid, text) from public, anon;
grant execute on function public.tienda_reportar(uuid, text) to authenticated;


-- ===== Para el admin =====

create or replace function public.admin_tienda(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare antes jsonb; nuevo jsonb;
begin
  perform public.admin_assert();
  if p is null or jsonb_typeof(p) <> 'object' or p = '{}'::jsonb then
    raise exception 'Revisá el interruptor: web, android o ios, con true o false.' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_each(p) e where e.key not in ('web', 'android', 'ios') or jsonb_typeof(e.value) <> 'boolean') then
    raise exception 'Revisá el interruptor: web, android o ios, con true o false.' using errcode = 'P0001';
  end if;
  antes := public.tienda_interruptor();
  nuevo := antes || p;
  insert into public.app_config (key, value, updated_at) values ('tienda', nuevo, now())
    on conflict (key) do update set value = excluded.value, updated_at = now();
  perform public.admin_log('tienda', 'tienda', jsonb_build_object('antes', antes, 'ahora', nuevo));
  return nuevo;
end $$;
revoke all on function public.admin_tienda(jsonb) from public, anon;
grant execute on function public.admin_tienda(jsonb) to authenticated;

-- Cantidades y las rutinas que hay que mirar (ocultas o con denuncias).
create or replace function public.admin_tienda_estado()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_assert();
  return jsonb_build_object('interruptor', public.tienda_interruptor(),
    'activas', (select count(*) from public.tienda_rutinas where estado = 'activa'),
    'ocultas', (select count(*) from public.tienda_rutinas where estado = 'oculta'),
    'creadores', (select count(distinct autor_id) from public.tienda_rutinas),
    'agregadas', (select count(*) from public.tienda_agregadas),
    'revisar', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'titulo', r.titulo, 'estado', r.estado, 'verificado', r.verificado, 'destacada', r.destacada,
               'autor', coalesce(nullif(btrim(p.full_name), ''), 'Sin nombre'), 'reportes', r.n,
               'motivos', (select jsonb_agg(distinct x.motivo) from public.tienda_reportes x where x.rutina_id = r.id))
             order by r.n desc, r.created_at desc)
        from (select t.*, (select count(*) from public.tienda_reportes x where x.rutina_id = t.id) as n from public.tienda_rutinas t) r
        left join public.profiles p on p.id = r.autor_id
       where r.estado = 'oculta' or r.n > 0), '[]'::jsonb),
    'todas', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'titulo', r.titulo, 'estado', r.estado, 'verificado', r.verificado, 'destacada', r.destacada,
               'agregadas', r.agregadas, 'autor', coalesce(nullif(btrim(p.full_name), ''), 'Sin nombre')) order by r.created_at desc)
        from (select * from public.tienda_rutinas order by created_at desc limit 50) r
        left join public.profiles p on p.id = r.autor_id), '[]'::jsonb));
end $$;
revoke all on function public.admin_tienda_estado() from public, anon;
grant execute on function public.admin_tienda_estado() to authenticated;

-- ocultar | mostrar (limpia las denuncias) | borrar | verificar | no_verificar | destacar | no_destacar
create or replace function public.admin_tienda_rutina(p_id uuid, p_accion text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_assert();
  if p_accion not in ('ocultar', 'mostrar', 'borrar', 'verificar', 'no_verificar', 'destacar', 'no_destacar') then
    raise exception 'Acción desconocida.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.tienda_rutinas where id = p_id) then
    raise exception 'Esa rutina ya no está en la Tienda.' using errcode = 'P0001';
  end if;
  if p_accion = 'borrar' then delete from public.tienda_rutinas where id = p_id;
  elsif p_accion = 'ocultar' then update public.tienda_rutinas set estado = 'oculta' where id = p_id;
  elsif p_accion = 'mostrar' then
    delete from public.tienda_reportes where rutina_id = p_id;
    update public.tienda_rutinas set estado = 'activa' where id = p_id;
  elsif p_accion = 'verificar' then update public.tienda_rutinas set verificado = true where id = p_id;
  elsif p_accion = 'no_verificar' then update public.tienda_rutinas set verificado = false where id = p_id;
  elsif p_accion = 'destacar' then update public.tienda_rutinas set destacada = true where id = p_id;
  else update public.tienda_rutinas set destacada = false where id = p_id;
  end if;
  perform public.admin_log('tienda_rutina', p_id::text, jsonb_build_object('accion', p_accion));
end $$;
revoke all on function public.admin_tienda_rutina(uuid, text) from public, anon;
grant execute on function public.admin_tienda_rutina(uuid, text) to authenticated;

notify pgrst, 'reload schema';


-- ===== Para volver atrás (a mano, desde el editor SQL) =====
-- drop function if exists public.admin_tienda_rutina(uuid, text);
-- drop function if exists public.admin_tienda_estado();
-- drop function if exists public.admin_tienda(jsonb);
-- drop function if exists public.tienda_guardar_anterior(jsonb);
-- drop function if exists public.tienda_mis_borrar(uuid);
-- drop function if exists public.tienda_usar(uuid);
-- drop function if exists public.tienda_mis();
-- drop function if exists public.tienda_reportar(uuid, text);
-- drop function if exists public.tienda_agregar(uuid);
-- drop function if exists public.tienda_despublicar(uuid);
-- drop function if exists public.tienda_publicar(text, text, text, text, jsonb);
-- drop function if exists public.tienda_detalle(uuid);
-- drop function if exists public.tienda_listar();
-- drop function if exists public.tienda_config();
-- drop function if exists public.tienda_ficha(uuid, uuid);
-- drop function if exists public.tienda_mia(public.tienda_mis_rutinas);
-- drop function if exists public.tienda_huella(jsonb);
-- drop function if exists public.tienda_ejercicios(jsonb);
-- drop function if exists public.tienda_dias(jsonb);
-- drop function if exists public.tienda_exigir();
-- drop function if exists public.tienda_cuenta();
-- drop function if exists public.tienda_interruptor();
-- drop table if exists public.tienda_mis_rutinas;
-- drop table if exists public.tienda_reportes;
-- drop table if exists public.tienda_agregadas;
-- drop table if exists public.tienda_rutinas;
-- delete from public.app_config where key = 'tienda';
