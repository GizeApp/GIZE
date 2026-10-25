-- Códigos de fundador para los coaches: un código con un porcentaje de descuento para siempre en
-- su plan, para los primeros N coaches que lo usen (por ejemplo, 30% para los primeros 20). El
-- código lo crea un administrador desde gize.ar/admin → Coaches y pagos → «Códigos de fundador»
-- (ahí ve cuántos lo usaron y quiénes): no está escrito en el repositorio.
-- Solo se usa en la web, al pagar con tarjeta (función suscripcion, Mercado Pago). En las apps de
-- iPhone y Android no se nombra.
-- Correr con el workflow "Supabase" → tarea sql → supabase/codigo-fundador.sql (después de
-- supabase/admin.sql y supabase/suscripciones.sql). Se puede correr varias veces.
--
-- Nadie lee ni escribe las tablas directo (RLS prendido, sin políticas ni permisos): todo pasa
-- por estas funciones.
--   · codigo_fundador_ver(codigo): el coach prueba un código antes de pagar. No ocupa lugar. Tiene
--     tope de 10 intentos por hora, para que no se puedan adivinar códigos probando.
--   · codigo_fundador_mio(): el descuento que ya tiene el coach (0 si no tiene).
--   · codigo_fundador_usar(coach, codigo): solo la función suscripcion (service role), al crear la
--     suscripción de Mercado Pago. Ocupa un lugar de a un coach por vez (bloquea la fila del
--     código): dos coaches no pueden quedarse con el último lugar. El coach que ya tiene un
--     descuento lo conserva para siempre (también si cambia de plan), aunque el código se apague.
--   · admin_codigos_fundador() y admin_codigo_fundador_guardar(...): el panel.
-- Si se borra la cuenta de un coach, se va su uso y ese lugar queda libre.

create table if not exists public.codigos_fundador (
  codigo     text primary key,
  porcentaje int not null,
  cupo       int not null,
  activo     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.codigos_fundador drop constraint if exists codigos_fundador_codigo_ok;
alter table public.codigos_fundador add constraint codigos_fundador_codigo_ok check (codigo ~ '^[A-Z0-9-]{4,32}$');
alter table public.codigos_fundador drop constraint if exists codigos_fundador_porcentaje_ok;
alter table public.codigos_fundador add constraint codigos_fundador_porcentaje_ok check (porcentaje between 1 and 90);
alter table public.codigos_fundador drop constraint if exists codigos_fundador_cupo_ok;
alter table public.codigos_fundador add constraint codigos_fundador_cupo_ok check (cupo between 1 and 10000);

-- Quién usó cada código, con el porcentaje que le tocó (si después se cambia el del código, el suyo
-- queda igual). Uno por coach.
create table if not exists public.codigos_fundador_usos (
  coach_id   uuid primary key references auth.users(id) on delete cascade,
  codigo     text not null references public.codigos_fundador(codigo) on update cascade,
  porcentaje int not null,
  created_at timestamptz not null default now()
);
alter table public.codigos_fundador_usos drop constraint if exists codigos_fundador_usos_porcentaje_ok;
alter table public.codigos_fundador_usos add constraint codigos_fundador_usos_porcentaje_ok check (porcentaje between 1 and 90);
create index if not exists codigos_fundador_usos_codigo_idx on public.codigos_fundador_usos (codigo);

-- Intentos de codigo_fundador_ver, para el tope por hora.
create table if not exists public.codigos_fundador_intentos (
  id         bigserial primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists codigos_fundador_intentos_user_idx on public.codigos_fundador_intentos (user_id, created_at);

alter table public.codigos_fundador enable row level security;
alter table public.codigos_fundador_usos enable row level security;
alter table public.codigos_fundador_intentos enable row level security;
revoke all on public.codigos_fundador from anon, authenticated;
revoke all on public.codigos_fundador_usos from anon, authenticated;
revoke all on public.codigos_fundador_intentos from anon, authenticated;

-- El coach prueba un código (desde «Mi plan», en la web). No ocupa lugar: eso pasa al pagar.
-- Devuelve { ok, porcentaje } o { ok: false, error } (sin cortar con un error: así el intento
-- queda anotado para el tope).
create or replace function public.codigo_fundador_ver(p_codigo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  c text := upper(btrim(coalesce(p_codigo, '')));
  cod public.codigos_fundador;
  mio int;
begin
  if me is null then raise exception 'Iniciá sesión.' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = me and role = 'coach') then
    return jsonb_build_object('ok', false, 'error', 'Los códigos son para las cuentas de coach.');
  end if;
  -- Ya tiene uno: es para siempre y no se suma otro.
  select porcentaje into mio from public.codigos_fundador_usos where coach_id = me;
  if mio is not null then return jsonb_build_object('ok', true, 'porcentaje', mio, 'ya', true); end if;
  -- Tope de intentos (de a uno por vez por persona, así varios a la vez no se pasan).
  perform pg_advisory_xact_lock(hashtext('codigo-fundador:' || me::text));
  delete from public.codigos_fundador_intentos where user_id = me and created_at < now() - interval '1 hour';
  if (select count(*) from public.codigos_fundador_intentos where user_id = me) >= 10 then
    return jsonb_build_object('ok', false, 'error', 'Probaste muchos códigos seguidos. Esperá un rato y volvé a intentar.');
  end if;
  insert into public.codigos_fundador_intentos (user_id) values (me);
  select * into cod from public.codigos_fundador where codigo = c;
  if cod.codigo is null or not cod.activo then
    return jsonb_build_object('ok', false, 'error', 'Ese código no existe o ya no está vigente.');
  end if;
  if (select count(*) from public.codigos_fundador_usos where codigo = c) >= cod.cupo then
    return jsonb_build_object('ok', false, 'error', 'Ya se ocuparon todos los lugares de ese código.');
  end if;
  return jsonb_build_object('ok', true, 'porcentaje', cod.porcentaje);
end $$;
revoke all on function public.codigo_fundador_ver(text) from public, anon;
grant execute on function public.codigo_fundador_ver(text) to authenticated;

-- El descuento que ya tiene el coach (0 si no tiene). La app lo usa para mostrar los precios.
create or replace function public.codigo_fundador_mio()
returns int language sql stable security definer set search_path = public as $$
  select coalesce((select porcentaje from public.codigos_fundador_usos where coach_id = auth.uid()), 0)
$$;
revoke all on function public.codigo_fundador_mio() from public, anon;
grant execute on function public.codigo_fundador_mio() to authenticated;

-- Al pagar (función suscripcion, con la service role): el descuento del coach. Si ya tiene uno, ese
-- (para siempre). Si no y manda un código, ocupa un lugar. Sin código y sin descuento, 0.
-- Devuelve { ok, porcentaje } o { ok: false, error }.
create or replace function public.codigo_fundador_usar(p_coach uuid, p_codigo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c text := upper(btrim(coalesce(p_codigo, '')));
  cod public.codigos_fundador;
  mio int;
begin
  select porcentaje into mio from public.codigos_fundador_usos where coach_id = p_coach;
  if mio is not null then return jsonb_build_object('ok', true, 'porcentaje', mio); end if;
  if c = '' then return jsonb_build_object('ok', true, 'porcentaje', 0); end if;
  if not exists (select 1 from public.profiles where id = p_coach and role = 'coach') then
    return jsonb_build_object('ok', false, 'error', 'Los códigos son para las cuentas de coach.');
  end if;
  -- La fila del código queda bloqueada hasta terminar: otro coach que quiere el mismo código espera
  -- acá y después cuenta con este uso ya guardado.
  select * into cod from public.codigos_fundador where codigo = c for update;
  if cod.codigo is null or not cod.activo then
    return jsonb_build_object('ok', false, 'error', 'Ese código no existe o ya no está vigente.');
  end if;
  if (select count(*) from public.codigos_fundador_usos where codigo = c) >= cod.cupo then
    return jsonb_build_object('ok', false, 'error', 'Ya se ocuparon todos los lugares de ese código.');
  end if;
  insert into public.codigos_fundador_usos (coach_id, codigo, porcentaje) values (p_coach, c, cod.porcentaje)
    on conflict (coach_id) do nothing;
  select porcentaje into mio from public.codigos_fundador_usos where coach_id = p_coach;
  return jsonb_build_object('ok', true, 'porcentaje', mio);
end $$;
revoke all on function public.codigo_fundador_usar(uuid, text) from public, anon, authenticated;
grant execute on function public.codigo_fundador_usar(uuid, text) to service_role;

-- Panel: los códigos con cuántos lo usaron y quiénes.
create or replace function public.admin_codigos_fundador()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  perform public.admin_assert();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'codigo', k.codigo, 'porcentaje', k.porcentaje, 'cupo', k.cupo, 'activo', k.activo, 'created_at', k.created_at,
      'usados', (select count(*) from public.codigos_fundador_usos u where u.codigo = k.codigo),
      'coaches', coalesce((select jsonb_agg(jsonb_build_object('id', u.coach_id, 'nombre', p.full_name, 'email', au.email, 'fecha', u.created_at) order by u.created_at)
                             from public.codigos_fundador_usos u
                             left join public.profiles p on p.id = u.coach_id
                             left join auth.users au on au.id = u.coach_id
                            where u.codigo = k.codigo), '[]'::jsonb)
    ) order by k.created_at desc)
    from public.codigos_fundador k), '[]'::jsonb);
end $$;
revoke all on function public.admin_codigos_fundador() from public, anon;
grant execute on function public.admin_codigos_fundador() to authenticated;

-- Panel: crear un código o cambiarle el porcentaje, el cupo o apagarlo. Los coaches que ya lo
-- usaron conservan su porcentaje (queda guardado en su uso).
create or replace function public.admin_codigo_fundador_guardar(p_codigo text, p_porcentaje int, p_cupo int, p_activo boolean)
returns void language plpgsql security definer set search_path = public as $$
declare c text := upper(btrim(coalesce(p_codigo, '')));
begin
  perform public.admin_assert();
  if c !~ '^[A-Z0-9-]{4,32}$' then raise exception 'El código va de 4 a 32 letras, números o guiones (sin espacios).' using errcode = 'P0001'; end if;
  if p_porcentaje is null or p_porcentaje < 1 or p_porcentaje > 90 then raise exception 'El descuento va de 1 a 90%%.' using errcode = 'P0001'; end if;
  if p_cupo is null or p_cupo < 1 or p_cupo > 10000 then raise exception 'El cupo va de 1 a 10000 coaches.' using errcode = 'P0001'; end if;
  insert into public.codigos_fundador (codigo, porcentaje, cupo, activo) values (c, p_porcentaje, p_cupo, coalesce(p_activo, true))
    on conflict (codigo) do update set porcentaje = excluded.porcentaje, cupo = excluded.cupo, activo = excluded.activo, updated_at = now();
  perform public.admin_log('codigo_fundador', c, jsonb_build_object('porcentaje', p_porcentaje, 'cupo', p_cupo, 'activo', coalesce(p_activo, true)));
end $$;
revoke all on function public.admin_codigo_fundador_guardar(text, int, int, boolean) from public, anon;
grant execute on function public.admin_codigo_fundador_guardar(text, int, int, boolean) to authenticated;

notify pgrst, 'reload schema';
