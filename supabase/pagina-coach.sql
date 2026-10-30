-- Página pública del coach: gize.ar/c/<alias>. Cada coach elige el nombre de su link (por ejemplo
-- «toro») y la página muestra su nombre, su foto (si quiere) y su código de invitación, para que
-- quien la abre baje GIZE y se sume con ese código. La arma el coach desde Configuración → «Mi
-- página»; la página (404.html + pagina-coach/pagina.js) la pide sin sesión.
-- Correr con el workflow "Supabase" → tarea sql → supabase/pagina-coach.sql, después de
-- supabase/foto-perfil.sql, supabase/endurecer-base.sql, supabase/cupo-plan.sql, supabase/bloqueos.sql y
-- supabase/admin.sql. Se puede correr varias veces.
-- Mientras no se corra, la app esconde «Mi página» (la función no existe) y gize.ar/c/… dice «no
-- disponible»: no se rompe nada.
--
-- Nadie lee ni escribe las tablas directo (RLS prendido, sin políticas ni permisos): todo pasa por
-- estas funciones.
--   · coach_pagina_ver(alias): lo que muestra la página. SIN SESIÓN, a propósito: la llama la página
--     pública con la clave pública. El chequeo de seguridad de Supabase («Public Can Execute SECURITY
--     DEFINER Function») la va a marcar, igual que a coach_pagina_foto_ok: es a propósito (como
--     forget_push_subscription en permisos-sin-sesion.sql). Devuelve solo el link vigente, el nombre,
--     la ruta de la foto (si el coach la muestra) y el código; nunca el mail ni el id. Da null si la
--     página no existe, está apagada o pausada por GIZE, si la cuenta ya no es de coach o no está
--     activa (coach_active), o si quien la mira bloqueó al coach o el coach lo bloqueó.
--   · coach_pagina_foto_ok(ruta): la usa la política de la foto (abajo). El bucket avatars sigue
--     privado: sin sesión solo se puede pedir el link firmado de la foto de perfil de un coach con la
--     página visible y la foto prendida. Ninguna otra. Storage usa la misma política para listar:
--     sin sesión, la lista del bucket muestra esas mismas fotos (la carpeta es el id del coach),
--     aunque sin el nombre ni el link. O sea que, mientras la página se ve con la foto prendida, esa
--     foto es pública (la política de privacidad lo tiene que decir así).
--   · coach_pagina_mia(): la página del coach que llama, para el panel.
--   · coach_pagina_guardar(alias, activa, con_foto): crearla o cambiarla. Un null deja lo que había.
--   · admin_coach_paginas() y admin_coach_pagina(coach, acción): el panel de GIZE (pausar, reanudar,
--     sacarle la foto o liberar el link). Cada acción queda en admin_audit.
--
-- El link (alias): de 3 a 30 letras minúsculas o números; en el medio puede llevar punto, guion o
-- guion bajo (nunca dos seguidos). Hay nombres reservados (admin, app, gize…). Se cambia libre en las
-- primeras 24 horas (el anterior queda libre). Después, una vez cada 7 días, y el anterior sigue
-- llevando a la misma página por 90 días sin que nadie lo pueda tomar (coach_alias_viejos). Una tarea
-- diaria borra los vencidos.
--
-- Para apagar las páginas sin borrar nada (por ejemplo, en una emergencia), alcanza con:
--   revoke execute on function public.coach_pagina_ver(text) from anon, authenticated;
-- Lo demás está en el bloque «Para volver atrás» del final.
--
-- No se redefine nada de otros archivos: coach_active (vigente en cupo-plan.sql y, con los gimnasios,
-- en gimnasios-vinculo.sql), my_invite_code (endurecer-base.sql) y bloqueo_entre (bloqueos.sql) se
-- llaman como están. Al borrar la cuenta de un coach se borran su página y sus links viejos.

do $$
begin
  if to_regprocedure('public.coach_active(uuid)') is null or to_regprocedure('public.my_invite_code()') is null
     or to_regprocedure('public.bloqueo_entre(uuid, uuid)') is null or to_regprocedure('public.admin_assert()') is null
     or to_regprocedure('public.admin_log(text, text, jsonb)') is null
     or not exists (select 1 from pg_attribute where attrelid = 'public.profiles'::regclass and attname = 'avatar_path' and not attisdropped) then
    raise exception 'Primero correr supabase/foto-perfil.sql, endurecer-base.sql, cupo-plan.sql, bloqueos.sql y admin.sql.';
  end if;
end $$;


-- ===== Tablas =====

-- Una página por coach.
create table if not exists public.coach_paginas (
  coach_id   uuid primary key references public.profiles(id) on delete cascade,
  alias      text not null,
  activa     boolean not null default true,   -- la prende y la apaga el coach
  con_foto   boolean not null default true,   -- si muestra su foto de perfil
  pausada_at timestamptz,                     -- la pausó GIZE desde el admin
  creada_at  timestamptz not null default now(),
  alias_at   timestamptz not null default now()  -- último cambio del link
);
alter table public.coach_paginas drop constraint if exists coach_paginas_alias_ok;
alter table public.coach_paginas add constraint coach_paginas_alias_ok
  check (alias ~ '^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$' and alias !~ '[._-]{2}');
create unique index if not exists coach_paginas_alias on public.coach_paginas (alias);

-- Los links anteriores: siguen llevando a la página del mismo coach y nadie los toma hasta «hasta».
create table if not exists public.coach_alias_viejos (
  alias    text primary key,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  hasta    timestamptz not null
);
create index if not exists coach_alias_viejos_coach_idx on public.coach_alias_viejos (coach_id);

alter table public.coach_paginas enable row level security;
alter table public.coach_alias_viejos enable row level security;
revoke all on public.coach_paginas from anon, authenticated;
revoke all on public.coach_alias_viejos from anon, authenticated;


-- ===== Lo que ve la página pública (sin sesión) =====

-- Devuelve { alias, nombre, foto, codigo, es_mi_coach, soy_yo } o null. «alias» es el vigente: si
-- llegó por un link viejo, la página cambia la dirección a ese. Sin sesión, es_mi_coach y soy_yo son
-- falsos.
create or replace function public.coach_pagina_ver(p_alias text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  a text := lower(btrim(coalesce(p_alias, '')));
  pag public.coach_paginas;
  nombre text; foto text; codigo text; rol text; mi_coach uuid;
begin
  if a !~ '^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$' or a ~ '[._-]{2}' then return null; end if;
  select * into pag from public.coach_paginas where alias = a;
  if pag.coach_id is null then
    select p.* into pag from public.coach_alias_viejos v join public.coach_paginas p on p.coach_id = v.coach_id
     where v.alias = a and v.hasta > now();
  end if;
  if pag.coach_id is null or not pag.activa or pag.pausada_at is not null then return null; end if;
  select p.full_name, p.avatar_path, p.invite_code, p.role into nombre, foto, codigo, rol from public.profiles p where p.id = pag.coach_id;
  if rol is distinct from 'coach' or codigo is null or not public.coach_active(pag.coach_id) then return null; end if;
  if me is not null then
    if public.bloqueo_entre(me, pag.coach_id) then return null; end if;
    select p.coach_id into mi_coach from public.profiles p where p.id = me;
  end if;
  return jsonb_build_object(
    'alias', pag.alias,
    'nombre', coalesce(nombre, ''),
    -- Solo una foto de su propia carpeta: es la única que deja ver la política de abajo.
    'foto', case when pag.con_foto and foto like pag.coach_id::text || '/%' then foto end,
    'codigo', codigo,
    'es_mi_coach', coalesce(mi_coach = pag.coach_id, false),
    'soy_yo', coalesce(me = pag.coach_id, false));
end $$;
revoke all on function public.coach_pagina_ver(text) from public;
grant execute on function public.coach_pagina_ver(text) to anon, authenticated;

-- ¿Esta ruta del bucket avatars es la foto de la página pública de un coach? Solo si es exactamente
-- su foto de perfil (profiles.avatar_path), está en su carpeta ({coach}/…) y la página se ve con la
-- foto prendida. El coach sale del primer tramo de la ruta (se busca por la clave).
create or replace function public.coach_pagina_foto_ok(p_name text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  c uuid;
begin
  if p_name is null or p_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/' then return false; end if;
  c := split_part(p_name, '/', 1)::uuid;
  if not exists (select 1 from public.profiles p join public.coach_paginas g on g.coach_id = p.id
                  where p.id = c and p.avatar_path = p_name and p.role = 'coach' and p.invite_code is not null
                    and g.activa and g.con_foto and g.pausada_at is null) then
    return false;
  end if;
  if not public.coach_active(c) then return false; end if;
  if me is not null and public.bloqueo_entre(me, c) then return false; end if;
  return true;
end $$;
revoke all on function public.coach_pagina_foto_ok(text) from public;
grant execute on function public.coach_pagina_foto_ok(text) to anon, authenticated;

-- La foto: una política nueva y aparte (las de foto-perfil.sql, gimnasios-lectura.sql y
-- topes-archivos.sql quedan como están). Sirve para pedir el link firmado sin sesión.
drop policy if exists "avatar: la de la página pública del coach" on storage.objects;
create policy "avatar: la de la página pública del coach" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'avatars' and public.coach_pagina_foto_ok(name));


-- ===== El panel del coach =====

-- { alias, activa, con_foto, pausada, cambia_desde, codigo, visible } o null si no tiene página.
--   · cambia_desde: null si puede cambiar el link ahora; si no, desde cuándo.
--   · visible: si la página se ve hoy (prendida, sin pausa, con código y la cuenta de coach activa).
create or replace function public.coach_pagina_mia()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  pag public.coach_paginas;
  codigo text; rol text;
begin
  if me is null then return null; end if;
  select * into pag from public.coach_paginas where coach_id = me;
  if pag.coach_id is null then return null; end if;
  select p.invite_code, p.role into codigo, rol from public.profiles p where p.id = me;
  return jsonb_build_object(
    'alias', pag.alias,
    'activa', pag.activa,
    'con_foto', pag.con_foto,
    'pausada', pag.pausada_at is not null,
    'cambia_desde', case when now() >= pag.creada_at + interval '24 hours'
                          and pag.alias_at >= pag.creada_at + interval '24 hours'
                          and pag.alias_at + interval '7 days' > now()
                         then pag.alias_at + interval '7 days' end,
    'codigo', codigo,
    'visible', pag.activa and pag.pausada_at is null and rol = 'coach' and codigo is not null and public.coach_active(me));
end $$;
revoke all on function public.coach_pagina_mia() from public, anon;
grant execute on function public.coach_pagina_mia() to authenticated;

-- Crear la página o cambiarla. p_alias null (o vacío) deja el link que tenía; p_activa y p_con_foto
-- null dejan lo que había (al crearla, prendidas). Devuelve coach_pagina_mia(). Los textos de error
-- los muestra la app tal cual (también en iPhone y Android: no nombran el plan ni pagos).
create or replace function public.coach_pagina_guardar(p_alias text, p_activa boolean, p_con_foto boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  a text := lower(btrim(coalesce(p_alias, '')));
  pag public.coach_paginas;
  libre boolean;
  h int;
begin
  if me is null then raise exception 'Iniciá sesión.' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = me and role = 'coach') then
    raise exception 'Solo las cuentas de coach tienen página.' using errcode = 'P0001';
  end if;
  -- De a un cambio por coach (dos pestañas a la vez, o el admin).
  perform pg_advisory_xact_lock(hashtext('coach_pagina'), hashtext(me::text));
  select * into pag from public.coach_paginas where coach_id = me;
  if a = '' and pag.coach_id is not null then a := pag.alias; end if;
  if a !~ '^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$' or a ~ '[._-]{2}' then
    raise exception 'Usá de 3 a 30 letras o números, sin espacios ni acentos. En el medio podés usar punto, guion o guion bajo.' using errcode = 'P0001';
  end if;
  if a = any (array['admin', 'api', 'app', 'ayuda', 'baja', 'coach', 'coaches', 'contacto', 'gimnasio', 'gimnasios', 'landing',
                    'login', 'oficial', 'privacidad', 'registro', 'soporte', 'terminos', 'www', 'null', 'test', 'prueba'])
     or a like 'gize%' then
    raise exception 'Ese link no se puede usar. Probá con otro.' using errcode = 'P0001';
  end if;

  -- Cambiar el link: libre las primeras 24 horas; después, una vez cada 7 días.
  libre := pag.coach_id is null or now() < pag.creada_at + interval '24 hours';
  if pag.coach_id is not null and a <> pag.alias and not libre
     and pag.alias_at >= pag.creada_at + interval '24 hours' and pag.alias_at + interval '7 days' > now() then
    raise exception 'Ya cambiaste tu link hace poco: lo vas a poder cambiar desde el %.',
      to_char((pag.alias_at + interval '7 days') at time zone 'America/Argentina/Buenos_Aires', 'DD/MM') using errcode = 'P0001';
  end if;

  if pag.coach_id is null or a <> pag.alias then
    -- El link nuevo y el anterior, de a uno por vez y siempre en el mismo orden (sin deadlocks): dos
    -- coaches que piden el mismo link a la vez se ponen en fila y el segundo lo ve ocupado.
    for h in select distinct hashtext(x) from unnest(array[a, pag.alias]) x where x is not null order by 1 loop
      perform pg_advisory_xact_lock(hashtext('coach_alias'), h);
    end loop;
    if exists (select 1 from public.coach_paginas where alias = a and coach_id <> me)
       or exists (select 1 from public.coach_alias_viejos where alias = a and coach_id <> me and hasta > now()) then
      raise exception 'Ese link ya lo usa otro coach. Probá con otro.' using errcode = 'P0001';
    end if;
    -- Uno vencido de otro coach se libera; uno propio vuelve a ser el vigente.
    delete from public.coach_alias_viejos where alias = a;
  end if;

  begin
    if pag.coach_id is null then
      insert into public.coach_paginas (coach_id, alias, activa, con_foto)
      values (me, a, coalesce(p_activa, true), coalesce(p_con_foto, true));
    else
      if a <> pag.alias and not libre then
        insert into public.coach_alias_viejos (alias, coach_id, hasta) values (pag.alias, me, now() + interval '90 days')
          on conflict (alias) do update set coach_id = excluded.coach_id, hasta = excluded.hasta;
      end if;
      update public.coach_paginas
         set alias = a,
             alias_at = case when a <> pag.alias then now() else alias_at end,
             activa = coalesce(p_activa, activa),
             con_foto = coalesce(p_con_foto, con_foto)
       where coach_id = me;
    end if;
  exception when unique_violation then
    raise exception 'Ese link ya lo usa otro coach. Probá con otro.' using errcode = 'P0001';
  end;

  -- Sin código de invitación, la página no se ve: se lo armamos.
  if (select invite_code from public.profiles where id = me) is null then perform public.my_invite_code(); end if;
  delete from public.coach_alias_viejos where hasta <= now();
  return public.coach_pagina_mia();
end $$;
revoke all on function public.coach_pagina_guardar(text, boolean, boolean) from public, anon;
grant execute on function public.coach_pagina_guardar(text, boolean, boolean) to authenticated;


-- ===== El admin de GIZE =====

-- Las páginas, con el coach (nombre y mail), si se ven y los links viejos vigentes.
create or replace function public.admin_coach_paginas()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_assert();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'coach', g.coach_id, 'nombre', p.full_name, 'email', u.email, 'alias', g.alias, 'activa', g.activa,
      'con_foto', g.con_foto, 'pausada', g.pausada_at is not null, 'pausada_at', g.pausada_at,
      'creada_at', g.creada_at, 'alias_at', g.alias_at,
      'visible', g.activa and g.pausada_at is null and p.role = 'coach' and p.invite_code is not null and public.coach_active(g.coach_id),
      'viejos', coalesce((select jsonb_agg(jsonb_build_object('alias', v.alias, 'hasta', v.hasta) order by v.hasta desc)
                            from public.coach_alias_viejos v where v.coach_id = g.coach_id and v.hasta > now()), '[]'::jsonb)
    ) order by g.creada_at desc)
    from public.coach_paginas g
    join public.profiles p on p.id = g.coach_id
    left join auth.users u on u.id = g.coach_id), '[]'::jsonb);
end $$;
revoke all on function public.admin_coach_paginas() from public, anon;
grant execute on function public.admin_coach_paginas() to authenticated;

-- Pausar o reanudar la página de un coach, sacarle la foto (queda sin foto; el coach la puede volver
-- a prender desde su panel: si insiste, se pausa), o liberar su link (borra la página y sus links
-- viejos: el coach puede armar otra con otro nombre).
create or replace function public.admin_coach_pagina(p_coach uuid, p_accion text)
returns void language plpgsql security definer set search_path = public as $$
declare a text;
begin
  perform public.admin_assert();
  if p_accion is null or p_accion not in ('pausar', 'reanudar', 'sin_foto', 'liberar') then
    raise exception 'La acción tiene que ser pausar, reanudar, sin_foto o liberar.' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('coach_pagina'), hashtext(coalesce(p_coach::text, '')));
  select alias into a from public.coach_paginas where coach_id = p_coach;
  if a is null then raise exception 'Ese coach no tiene página.' using errcode = 'P0001'; end if;
  if p_accion = 'pausar' then
    update public.coach_paginas set pausada_at = coalesce(pausada_at, now()) where coach_id = p_coach;
  elsif p_accion = 'reanudar' then
    update public.coach_paginas set pausada_at = null where coach_id = p_coach;
  elsif p_accion = 'sin_foto' then
    update public.coach_paginas set con_foto = false where coach_id = p_coach;
  else
    delete from public.coach_alias_viejos where coach_id = p_coach;
    delete from public.coach_paginas where coach_id = p_coach;
  end if;
  perform public.admin_log('pagina_coach', p_coach::text, jsonb_build_object('accion', p_accion, 'alias', a));
end $$;
revoke all on function public.admin_coach_pagina(uuid, text) from public, anon;
grant execute on function public.admin_coach_pagina(uuid, text) to authenticated;


-- ===== Tarea diaria: borra los links viejos vencidos (06:23 UTC, 03:23 de Argentina) =====
select cron.unschedule('gize-paginas-coach') where exists (select 1 from cron.job where jobname = 'gize-paginas-coach');
select cron.schedule('gize-paginas-coach', '23 6 * * *', $job$
  delete from public.coach_alias_viejos where hasta < now();
$job$);

notify pgrst, 'reload schema';


-- ===== Para volver atrás =====
-- Correr esto sin los «-- ». Se borran la tarea, la política de la foto, las seis funciones y las dos
-- tablas (las páginas y los links viejos de todos los coaches). La app vuelve a esconder «Mi página».
--
-- select cron.unschedule('gize-paginas-coach') where exists (select 1 from cron.job where jobname = 'gize-paginas-coach');
-- drop policy if exists "avatar: la de la página pública del coach" on storage.objects;
-- drop function if exists public.coach_pagina_ver(text), public.coach_pagina_foto_ok(text), public.coach_pagina_mia(),
--   public.coach_pagina_guardar(text, boolean, boolean), public.admin_coach_paginas(), public.admin_coach_pagina(uuid, text);
-- drop table if exists public.coach_alias_viejos;
-- drop table if exists public.coach_paginas;
-- notify pgrst, 'reload schema';
