-- Competencia de pasos entre amigos (Progreso → «Competencia de pasos», app/screens/pasos.js).
--
-- Grupos de amigos con un código de invitación. Dentro del grupo se ve el ranking de pasos de la
-- semana (de lunes a domingo, hora de Argentina) y el campeón de la semana pasada.
--
-- Los pasos NO van en una tabla nueva: son los de siempre, public.daily_logs.steps (una fila por
-- alumno y día, la misma que llena el registro de hoy, el contador de pasos y, en la app de la
-- tienda, Salud / Health Connect). Esta parte solo los suma.
--
-- Quién ve qué:
--   · Las tablas de grupos y miembros no se leen ni se escriben directo (RLS sin políticas y sin
--     permisos): todo pasa por las funciones de abajo, que miran que quien llama sea del grupo.
--   · De los demás miembros se ve SOLO el nombre (el primero, o el que eligió para el grupo) y el
--     total de pasos de la semana. Nada de daily_logs cambia: cada uno sigue leyendo solo lo suyo
--     (y su coach, como siempre).
--   · Límites: 10 grupos por persona y 30 personas por grupo. Un día cuenta hasta 100.000 pasos
--     (un número mal tipeado no gana la semana).
--   · Quien el dueño saca del grupo no puede volver a entrar con el mismo código
--     (pasos_expulsados).
--
-- Se borra solo: al borrar la cuenta (auth.users) se van sus lugares en los grupos (on delete
-- cascade). Si era el dueño, el grupo sigue y pasa a quien está hace más tiempo, como al salir
-- (trigger pasos_traspasar_dueno); si estaba solo, el grupo se borra.
--
-- Correr con el workflow "Supabase" → tarea sql → supabase/pasos-grupos.sql (o pegarlo en
-- Supabase → SQL Editor). Se puede volver a correr sin problema. Mientras no se corra, la app
-- muestra la sección con un aviso y todo lo demás sigue igual.

-- ===== Tablas =====

create table if not exists public.pasos_grupos (
  id      uuid primary key default gen_random_uuid(),
  nombre  text not null,
  dueno   uuid not null references auth.users(id) on delete cascade,
  codigo  text not null,
  creado  timestamptz not null default now()
);
alter table public.pasos_grupos drop constraint if exists pasos_grupos_nombre_check;
alter table public.pasos_grupos add constraint pasos_grupos_nombre_check check (char_length(btrim(nombre)) between 1 and 40);
alter table public.pasos_grupos drop constraint if exists pasos_grupos_codigo_check;
alter table public.pasos_grupos add constraint pasos_grupos_codigo_check check (codigo ~ '^[A-HJKMNP-Z2-9]{8}$');
create unique index if not exists pasos_grupos_codigo_idx on public.pasos_grupos(codigo);
create index if not exists pasos_grupos_dueno_idx on public.pasos_grupos(dueno);

create table if not exists public.pasos_miembros (
  id        uuid primary key default gen_random_uuid(),
  grupo_id  uuid not null references public.pasos_grupos(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  apodo     text,
  unido     timestamptz not null default now(),
  unique (grupo_id, user_id)
);
alter table public.pasos_miembros drop constraint if exists pasos_miembros_apodo_check;
alter table public.pasos_miembros add constraint pasos_miembros_apodo_check check (apodo is null or char_length(btrim(apodo)) between 1 and 24);
create index if not exists pasos_miembros_user_idx on public.pasos_miembros(user_id);

-- Los que el dueño sacó de cada grupo: con el mismo código no vuelven a entrar (pasos_unirse).
create table if not exists public.pasos_expulsados (
  grupo_id  uuid not null references public.pasos_grupos(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  primary key (grupo_id, user_id)
);
create index if not exists pasos_expulsados_user_idx on public.pasos_expulsados(user_id);

-- Nadie las toca directo: solo las funciones de abajo (security definer).
alter table public.pasos_grupos enable row level security;
alter table public.pasos_miembros enable row level security;
alter table public.pasos_expulsados enable row level security;
revoke all on public.pasos_grupos from anon, authenticated;
revoke all on public.pasos_miembros from anon, authenticated;
revoke all on public.pasos_expulsados from anon, authenticated;

-- Para sumar la semana de cada miembro rápido (si ya existe con otro nombre, no molesta).
create index if not exists daily_logs_client_date_idx on public.daily_logs(client_id, log_date);


-- ===== Semana (hora de Argentina) =====

-- Hoy en Argentina (el servidor está en UTC: a las 22 h del domingo en Buenos Aires ya es lunes
-- en UTC y la semana no tiene que cambiar todavía).
create or replace function public.pasos_hoy()
returns date
language sql
stable
set search_path = public
as $$ select (now() at time zone 'America/Argentina/Buenos_Aires')::date $$;

-- El lunes de la semana de un día (isodow: lunes = 1 … domingo = 7).
create or replace function public.pasos_lunes(p_dia date)
returns date
language sql
immutable
set search_path = public
as $$ select p_dia - (extract(isodow from p_dia)::int - 1) $$;


-- ===== Totales (uso interno: no se puede llamar desde la app) =====

-- Pasos de cada miembro de un grupo entre dos fechas, con el nombre que se muestra: el que eligió
-- para el grupo o, si no eligió, el primer nombre de su perfil.
create or replace function public.pasos_totales(p_grupo uuid, p_desde date, p_hasta date)
returns table (miembro uuid, user_id uuid, nombre text, pasos bigint, unido timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.user_id,
         coalesce(nullif(btrim(m.apodo), ''), nullif(split_part(btrim(coalesce(p.full_name, '')), ' ', 1), ''), 'Sin nombre'),
         coalesce((select sum(least(greatest(coalesce(d.steps, 0), 0), 100000))
                     from public.daily_logs d
                    where d.client_id = m.user_id and d.log_date between p_desde and p_hasta), 0)::bigint,
         m.unido
    from public.pasos_miembros m
    left join public.profiles p on p.id = m.user_id
   where m.grupo_id = p_grupo;
$$;
revoke all on function public.pasos_totales(uuid, date, date) from public, anon, authenticated;

-- ¿Soy del grupo?
create or replace function public.pasos_soy_miembro(p_grupo uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.pasos_miembros where grupo_id = p_grupo and user_id = auth.uid());
$$;
revoke all on function public.pasos_soy_miembro(uuid) from public, anon, authenticated;

-- Código nuevo: 8 caracteres sin los que se confunden (0/O, 1/I/L), con azar seguro
-- (gen_random_uuid), como el código de los coaches (endurecer-base.sql).
create or replace function public.pasos_codigo_nuevo()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  c text;
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  b bytea;
  i int;
begin
  loop
    b := substring(uuid_send(gen_random_uuid()) from 1 for 6) || substring(uuid_send(gen_random_uuid()) from 11 for 6);
    c := '';
    for i in 0..7 loop
      c := c || substr(alphabet, 1 + (get_byte(b, i) % length(alphabet)), 1);
    end loop;
    exit when not exists (select 1 from public.pasos_grupos where codigo = c);
  end loop;
  return c;
end $$;
revoke all on function public.pasos_codigo_nuevo() from public, anon, authenticated;

-- Nombre elegido para el grupo: sin espacios de más, hasta 24 letras, vacío = null.
create or replace function public.pasos_limpiar_apodo(p text)
returns text
language sql
immutable
set search_path = public
as $$ select nullif(left(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g'), 24), '') $$;


-- ===== Funciones que usa la app =====

-- Crear un grupo: queda como dueño y primer miembro. Devuelve el id y el código para invitar.
create or replace function public.pasos_crear_grupo(p_nombre text, p_apodo text default null)
returns table (id uuid, codigo text)
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  n text := left(regexp_replace(btrim(coalesce(p_nombre, '')), '\s+', ' ', 'g'), 40);
  gid uuid;
  c text;
begin
  if me is null then raise exception 'Tenés que ingresar con tu cuenta.' using errcode = '42501'; end if;
  if n = '' then raise exception 'Ponele un nombre al grupo.' using errcode = 'P0001'; end if;
  -- Un pedido a la vez por persona: dos toques seguidos no pasan el límite.
  perform pg_advisory_xact_lock(hashtext('pasos:' || me::text));
  if (select count(*) from public.pasos_miembros m where m.user_id = me) >= 10 then
    raise exception 'Ya estás en 10 grupos, el máximo. Salí de alguno para crear otro.' using errcode = 'P0001';
  end if;
  c := public.pasos_codigo_nuevo();
  insert into public.pasos_grupos (nombre, dueno, codigo) values (n, me, c) returning pasos_grupos.id into gid;
  insert into public.pasos_miembros (grupo_id, user_id, apodo) values (gid, me, public.pasos_limpiar_apodo(p_apodo));
  return query select gid, c;
end $$;

-- Unirse con el código (del link gize.ar/app/#grupo=CODIGO o escrito a mano). Devuelve el id del
-- grupo. Si ya era miembro, devuelve el id igual.
create or replace function public.pasos_unirse(p_codigo text, p_apodo text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  c text := upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'));
  gid uuid;
begin
  if me is null then raise exception 'Tenés que ingresar con tu cuenta.' using errcode = '42501'; end if;
  if c !~ '^[A-HJKMNP-Z2-9]{8}$' then raise exception 'Ese código no existe. Revisalo: son 8 letras y números.' using errcode = 'P0001'; end if;
  -- El grupo bloqueado mientras se suma: dos que entran juntos no pasan el máximo.
  select g.id into gid from public.pasos_grupos g where g.codigo = c for update;
  if gid is null then raise exception 'Ese código no existe. Revisalo: son 8 letras y números.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.pasos_miembros m where m.grupo_id = gid and m.user_id = me) then return gid; end if;
  -- El dueño lo sacó: el código (y el link que le quedó) ya no le sirve para este grupo.
  if exists (select 1 from public.pasos_expulsados e where e.grupo_id = gid and e.user_id = me) then
    raise exception 'No podés volver a sumarte a este grupo.' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('pasos:' || me::text));
  if (select count(*) from public.pasos_miembros m where m.user_id = me) >= 10 then
    raise exception 'Ya estás en 10 grupos, el máximo. Salí de alguno para sumarte a otro.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.pasos_miembros m where m.grupo_id = gid) >= 30 then
    raise exception 'El grupo está completo (30 personas).' using errcode = 'P0001';
  end if;
  insert into public.pasos_miembros (grupo_id, user_id, apodo) values (gid, me, public.pasos_limpiar_apodo(p_apodo));
  return gid;
end $$;

-- Salir de un grupo. Si sale el dueño, el grupo pasa a quien está hace más tiempo; si no queda
-- nadie, el grupo se borra.
create or replace function public.pasos_salir(p_grupo uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  nuevo uuid;
begin
  if me is null then raise exception 'Tenés que ingresar con tu cuenta.' using errcode = '42501'; end if;
  perform 1 from public.pasos_grupos g where g.id = p_grupo for update;
  delete from public.pasos_miembros m where m.grupo_id = p_grupo and m.user_id = me;
  if not found then return; end if;
  if exists (select 1 from public.pasos_grupos g where g.id = p_grupo and g.dueno = me) then
    select m.user_id into nuevo from public.pasos_miembros m where m.grupo_id = p_grupo order by m.unido, m.id limit 1;
    if nuevo is null then delete from public.pasos_grupos g where g.id = p_grupo;
    else update public.pasos_grupos g set dueno = nuevo where g.id = p_grupo; end if;
  end if;
end $$;

-- Borrar el grupo (solo el dueño): se va para todos.
create or replace function public.pasos_borrar_grupo(p_grupo uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Tenés que ingresar con tu cuenta.' using errcode = '42501'; end if;
  delete from public.pasos_grupos g where g.id = p_grupo and g.dueno = auth.uid();
  if not found then raise exception 'Solo quien armó el grupo lo puede borrar.' using errcode = 'P0001'; end if;
end $$;

-- Sacar a alguien del grupo (solo el dueño; a sí mismo no: para eso está «Salir»). Queda anotado
-- para que no vuelva a entrar con el mismo código.
create or replace function public.pasos_sacar_miembro(p_grupo uuid, p_miembro uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  quien uuid;
begin
  if auth.uid() is null then raise exception 'Tenés que ingresar con tu cuenta.' using errcode = '42501'; end if;
  if not exists (select 1 from public.pasos_grupos g where g.id = p_grupo and g.dueno = auth.uid()) then
    raise exception 'Solo quien armó el grupo puede sacar a alguien.' using errcode = 'P0001';
  end if;
  delete from public.pasos_miembros m where m.id = p_miembro and m.grupo_id = p_grupo and m.user_id <> auth.uid()
    returning m.user_id into quien;
  if quien is not null then
    insert into public.pasos_expulsados (grupo_id, user_id) values (p_grupo, quien) on conflict do nothing;
  end if;
end $$;

-- Cambiar el nombre con que me ven en un grupo (vacío = mi primer nombre).
create or replace function public.pasos_mi_nombre(p_grupo uuid, p_apodo text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.pasos_miembros set apodo = public.pasos_limpiar_apodo(p_apodo)
   where grupo_id = p_grupo and user_id = auth.uid();
$$;

-- Mis grupos, con cuántos son y en qué puesto voy esta semana.
create or replace function public.pasos_mis_grupos()
returns table (id uuid, nombre text, codigo text, soy_dueno boolean, miembros int, mi_puesto int)
language sql
stable
security definer
set search_path = public
as $$
  with w as (select public.pasos_lunes(public.pasos_hoy()) as desde)
  select g.id, g.nombre, g.codigo, g.dueno = auth.uid(),
         (select count(*) from public.pasos_miembros x where x.grupo_id = g.id)::int,
         (select q.puesto from (
            select t.user_id, (rank() over (order by t.pasos desc))::int as puesto
              from public.pasos_totales(g.id, w.desde, w.desde + 6) t) q
           where q.user_id = auth.uid())
    from public.pasos_miembros m
    join public.pasos_grupos g on g.id = m.grupo_id
   cross join w
   where m.user_id = auth.uid()
   order by m.unido;
$$;

-- Ranking de esta semana. Solo si soy del grupo (si no, no devuelve nada). Empatados comparten el
-- puesto. p_atras queda por las versiones de la app que lo mandan, pero no se usa: de las semanas
-- anteriores no se ve nada (a cada uno se le dice que los demás ven solo su total de la semana;
-- de la pasada, solo el campeón). Antes dejaba ver hasta 52 semanas de cada miembro.
create or replace function public.pasos_ranking(p_grupo uuid, p_atras int default 0)
returns table (miembro uuid, nombre text, pasos int, puesto int, soy_yo boolean, desde date, hasta date)
language sql
stable
security definer
set search_path = public
as $$
  with w as (select public.pasos_lunes(public.pasos_hoy()) as desde)
  select t.miembro, t.nombre, t.pasos::int, (rank() over (order by t.pasos desc))::int,
         t.user_id = auth.uid(), w.desde, w.desde + 6
    from w cross join lateral public.pasos_totales(p_grupo, w.desde, w.desde + 6) t
   where public.pasos_soy_miembro(p_grupo)
   order by t.pasos desc, t.nombre, t.unido;
$$;

-- Campeón de la semana pasada: quien más pasos sumó de lunes a domingo (si alguien caminó). Con
-- empate ganan todos los empatados (pedido). Solo si soy del grupo.
-- Compiten solo los que ya estaban en el grupo antes de que terminara esa semana (lunes 0 h de
-- Argentina): un grupo nuevo no tiene campeón hasta su primer lunes, y quien se suma el lunes no
-- se lleva la copa de una semana que no jugó.
create or replace function public.pasos_campeon(p_grupo uuid)
returns table (miembro uuid, nombre text, pasos int, soy_yo boolean, desde date, hasta date)
language sql
stable
security definer
set search_path = public
as $$
  with w as (select public.pasos_lunes(public.pasos_hoy()) - 7 as desde),
       t as (select t.*, w.desde, max(t.pasos) over () as top
               from w cross join lateral public.pasos_totales(p_grupo, w.desde, w.desde + 6) t
              where public.pasos_soy_miembro(p_grupo)
                and t.unido < ((w.desde + 7)::timestamp at time zone 'America/Argentina/Buenos_Aires'))
  select t.miembro, t.nombre, t.pasos::int, t.user_id = auth.uid(), t.desde, t.desde + 6
    from t
   where t.pasos > 0 and t.pasos = t.top
   order by t.unido, t.miembro;
$$;

-- ===== Al borrar una cuenta =====

-- Si era dueño de grupos, cada uno pasa a quien está hace más tiempo (como en pasos_salir): sin
-- esto, la cascada de pasos_grupos.dueno borraba el grupo para todos. Si estaba solo, el grupo se
-- borra igual (cascada). Va acá y no en delete_own_account: así existe solo si existen los grupos,
-- y vale también para una cuenta borrada desde el panel de Supabase.
create or replace function public.pasos_traspasar_dueno()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.pasos_grupos g
     set dueno = (select m.user_id from public.pasos_miembros m
                   where m.grupo_id = g.id and m.user_id <> old.id
                   order by m.unido, m.id limit 1)
   where g.dueno = old.id
     and exists (select 1 from public.pasos_miembros m where m.grupo_id = g.id and m.user_id <> old.id);
  return old;
end $$;
revoke all on function public.pasos_traspasar_dueno() from public, anon, authenticated;
drop trigger if exists pasos_traspasar_dueno on auth.users;
create trigger pasos_traspasar_dueno before delete on auth.users
  for each row execute function public.pasos_traspasar_dueno();

-- Solo usuarios logueados.
revoke all on function public.pasos_hoy() from public, anon;
revoke all on function public.pasos_lunes(date) from public, anon;
revoke all on function public.pasos_limpiar_apodo(text) from public, anon;
revoke all on function public.pasos_crear_grupo(text, text) from public, anon;
revoke all on function public.pasos_unirse(text, text) from public, anon;
revoke all on function public.pasos_salir(uuid) from public, anon;
revoke all on function public.pasos_borrar_grupo(uuid) from public, anon;
revoke all on function public.pasos_sacar_miembro(uuid, uuid) from public, anon;
revoke all on function public.pasos_mi_nombre(uuid, text) from public, anon;
revoke all on function public.pasos_mis_grupos() from public, anon;
revoke all on function public.pasos_ranking(uuid, int) from public, anon;
revoke all on function public.pasos_campeon(uuid) from public, anon;
grant execute on function public.pasos_hoy() to authenticated;
grant execute on function public.pasos_lunes(date) to authenticated;
grant execute on function public.pasos_limpiar_apodo(text) to authenticated;
grant execute on function public.pasos_crear_grupo(text, text) to authenticated;
grant execute on function public.pasos_unirse(text, text) to authenticated;
grant execute on function public.pasos_salir(uuid) to authenticated;
grant execute on function public.pasos_borrar_grupo(uuid) to authenticated;
grant execute on function public.pasos_sacar_miembro(uuid, uuid) to authenticated;
grant execute on function public.pasos_mi_nombre(uuid, text) to authenticated;
grant execute on function public.pasos_mis_grupos() to authenticated;
grant execute on function public.pasos_ranking(uuid, int) to authenticated;
grant execute on function public.pasos_campeon(uuid) to authenticated;
