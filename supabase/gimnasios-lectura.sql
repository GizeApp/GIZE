-- Gimnasios, etapa 1: la administración del gimnasio (dueño y encargados) lee lo que el socio
-- eligió compartir. Correr con el workflow "Supabase" → tarea sql → supabase/gimnasios-lectura.sql,
-- después de supabase/gimnasios.sql y supabase/gimnasios-vinculo.sql. Se puede correr varias veces.
-- Sin esos dos falla entero, sin cambiar nada (lo primero del archivo lo controla). Después va
-- supabase/gimnasios-socios.sql.
--
-- SIN GIMNASIOS TODO SIGUE IGUAL: solo SUMA políticas de lectura; las de hoy (las «for all» del
-- coach y las del alumno) no se tocan. Sin filas de gimnasio, ninguna deja ver nada nuevo (lo prueba
-- tests/gimnasios-igual.test.mjs contra la base sin gimnasios).
--
-- Qué suma:
--   · «gimnasio lee lo que el socio compartió»: una política for select en body_weights, checkins,
--     client_prefs, food_entries, sessions, session_entries, client_info, blocks, nutrition,
--     routines y routine_schedule. El dueño y la administración leen los registros de un socio solo
--     si su ficha está activa o pausada, aceptó la hoja, prendió «Compartir mis registros con la
--     administración» y el plan del gimnasio está al día (gym_reads_member, gimnasios.sql). Leer no
--     es editar: para cambiar la rutina, el dueño tiene que ser su profe (is_my_client, como hoy).
--     La política pide la lista de socios una vez por consulta (gym_socios_compartidos, en un
--     InitPlan) y no gym_reads_member fila por fila: es la misma regla, sin una llamada por fila en
--     las lecturas de todos (alumnos y coaches también pasan por esta política).
--   · Dos tablas van por función y no por política, porque la RLS no puede ocultar columnas:
--     gym_registro_lectura(socio, desde) devuelve el registro diario SIN steps (los pasos de Salud
--     y Health Connect, que la política de privacidad le muestra solo a «tu coach»), y
--     gym_cardio_lectura(socio) las salidas SIN track (el recorrido GPS). El profe asignado los sigue
--     leyendo como hoy, porque es su coach.
--   · Fotos de perfil (avatars): el dueño y la administración ven la de los socios con ficha activa
--     o pausada de su gimnasio (el profe asignado ya la ve: es su coach), y el socio ve la de los
--     profes de su gimnasio. La recepción NO: ve solo la foto del gimnasio (gym-fotos,
--     gimnasios-socios.sql), que aprueba el gimnasio.
-- El chat no se comparte nunca con la administración (coach_messages y chat-audio no cambian acá).
--
-- Para volver atrás: el bloque comentado del final (antes, el de gimnasios-socios.sql).


-- ===== Antes que nada: ¿están gimnasios.sql y gimnasios-vinculo.sql? =====

do $$ begin
  if to_regprocedure('public.gym_reads_member(uuid)') is null or to_regclass('public.gym_members') is null
     or to_regprocedure('public.coach_client_ok(uuid, uuid)') is null or to_regprocedure('public.gym_alerta(uuid, text, text, text, text, jsonb)') is null then
    raise exception 'Primero correr supabase/gimnasios.sql y supabase/gimnasios-vinculo.sql: este archivo usa sus funciones.';
  end if;
  if to_regclass('public.cardio_outings') is null or to_regclass('public.routine_schedule') is null or to_regclass('public.daily_logs') is null then
    raise exception 'Faltan tablas de hoy (cardio_outings, routine_schedule, daily_logs): correr antes los archivos de supabase/.';
  end if;
end $$;


-- ===== Lectura de la administración: las tablas de registros =====

-- Los socios que quien llama puede leer como dueño o administración (la regla de gym_reads_member,
-- para todos de una vez). Vacío para quien no es del equipo: una búsqueda por índice en gym_staff.
create or replace function public.gym_socios_compartidos()
returns uuid[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare me uuid := auth.uid(); r uuid[];
begin
  if me is null or not exists (select 1 from public.gym_staff s where s.user_id = me and s.left_at is null and s.role in ('owner', 'admin')) then
    return '{}';
  end if;
  select coalesce(array_agg(m.member_id), '{}') into r
    from public.gym_members m
    join public.gym_staff s on s.gym_id = m.gym_id and s.user_id = me and s.left_at is null and s.role in ('owner', 'admin')
   where m.member_id is not null and m.status in ('activo', 'pausado') and m.share_admin and m.terms_at is not null
     and public.gym_active(m.gym_id);
  return r;
end $$;
revoke all on function public.gym_socios_compartidos() from public, anon;
grant execute on function public.gym_socios_compartidos() to authenticated;

do $$
declare tb text;
begin
  foreach tb in array array['body_weights', 'checkins', 'client_prefs', 'food_entries', 'sessions', 'session_entries',
                            'client_info', 'blocks', 'nutrition', 'routines', 'routine_schedule'] loop
    execute format('drop policy if exists "gimnasio lee lo que el socio compartió" on public.%I', tb);
    execute format('create policy "gimnasio lee lo que el socio compartió" on public.%I for select to authenticated '
                   'using (client_id = any ((select public.gym_socios_compartidos())::uuid[]))', tb);
  end loop;
end $$;


-- ===== Registro diario y salidas, sin pasos ni recorrido =====

-- El registro diario de un socio desde una fecha (por defecto, 90 días), sin steps. Solo el dueño
-- o la administración que lo pueden leer (gym_reads_member); si no, 42501.
create or replace function public.gym_registro_lectura(socio uuid, desde date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if socio is null or not public.gym_reads_member(socio) then
    raise exception 'No podés ver los registros de este socio.' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(to_jsonb(d) - 'steps' order by d.log_date desc)
                     from (select * from public.daily_logs l
                            where l.client_id = socio
                              and l.log_date >= coalesce(desde, (now() at time zone 'America/Argentina/Buenos_Aires')::date - 90)
                            order by l.log_date desc limit 400) d), '[]'::jsonb);
end $$;
revoke all on function public.gym_registro_lectura(uuid, date) from public, anon;
grant execute on function public.gym_registro_lectura(uuid, date) to authenticated;

-- Las últimas 100 salidas de un socio, sin track (el recorrido GPS).
create or replace function public.gym_cardio_lectura(socio uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if socio is null or not public.gym_reads_member(socio) then
    raise exception 'No podés ver los registros de este socio.' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(to_jsonb(c) - 'track' order by c.started_at desc)
                     from (select * from public.cardio_outings o where o.client_id = socio
                            order by o.started_at desc limit 100) c), '[]'::jsonb);
end $$;
revoke all on function public.gym_cardio_lectura(uuid) from public, anon;
grant execute on function public.gym_cardio_lectura(uuid) to authenticated;


-- ===== Fotos de perfil (avatars) =====

-- ¿Puedo ver la foto de perfil de la carpeta c ({usuario}/…)? El dueño y la administración, la de
-- sus socios con ficha activa o pausada; el socio, la de los profes (dueño, administración y profes)
-- de su gimnasio. Lo de hoy (la propia, el coach y sus alumnos) sigue en foto-perfil.sql.
create or replace function public.gym_ve_avatar(c text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare me uuid := auth.uid(); u uuid;
begin
  if me is null or c is null or c !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  u := c::uuid;
  return exists (select 1 from public.gym_members m
                   join public.gym_staff s on s.gym_id = m.gym_id and s.user_id = me and s.left_at is null and s.role in ('owner', 'admin')
                  where m.member_id = u and m.status in ('activo', 'pausado'))
      or exists (select 1 from public.gym_members m
                   join public.gym_staff s on s.gym_id = m.gym_id and s.user_id = u and s.left_at is null and s.role in ('owner', 'admin', 'profe')
                  where m.member_id = me and m.status in ('activo', 'pausado'));
end $$;
revoke all on function public.gym_ve_avatar(text) from public, anon;
grant execute on function public.gym_ve_avatar(text) to authenticated;

drop policy if exists "avatar: el gimnasio ve a sus socios y el socio a sus profes" on storage.objects;
create policy "avatar: el gimnasio ve a sus socios y el socio a sus profes" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and public.gym_ve_avatar((storage.foldername(name))[1]));

notify pgrst, 'reload schema';


-- ===== Para volver atrás =====
-- Correr esto sin los «-- » (antes, el bloque de gimnasios-socios.sql: si no, se frena sin cambiar
-- nada). Solo saca lo que sumó este archivo: las políticas de hoy no se tocaron.
--
-- do $$ begin
--   if to_regprocedure('public.mi_gimnasio()') is not null then
--     raise exception 'Primero el bloque «Para volver atrás» de supabase/gimnasios-socios.sql (usa gym_socios_compartidos).';
--   end if;
-- end $$;
-- do $$
-- declare tb text;
-- begin
--   foreach tb in array array['body_weights', 'checkins', 'client_prefs', 'food_entries', 'sessions', 'session_entries',
--                             'client_info', 'blocks', 'nutrition', 'routines', 'routine_schedule'] loop
--     execute format('drop policy if exists "gimnasio lee lo que el socio compartió" on public.%I', tb);
--   end loop;
-- end $$;
-- drop policy if exists "avatar: el gimnasio ve a sus socios y el socio a sus profes" on storage.objects;
-- drop function if exists public.gym_ve_avatar(text);
-- drop function if exists public.gym_cardio_lectura(uuid);
-- drop function if exists public.gym_registro_lectura(uuid, date);
-- drop function if exists public.gym_socios_compartidos();
-- notify pgrst, 'reload schema';
