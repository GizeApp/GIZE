-- Resumen de los lunes para los coaches («Tu semana en GIZE»): todos los lunes desde las 9 (hora de
-- Argentina), a cada coach con alumnos le llega un mail y, si activó los avisos, una notificación con
-- la semana que pasó: cuántos alumnos entrenaron, a quién conviene escribirle, los récords y los
-- check-ins. Sin IA. ARRANCA APAGADO: lo prende el dueño desde gize.ar/admin (resumen_semanal_config).
-- Correr con el workflow "Supabase" → tarea sql → supabase/resumen-semanal.sql, después de
-- avisos-coach.sql (cron_secret), admin.sql (admin_assert y admin_log), cupo-plan.sql (coach_active) y
-- cuentas-prueba.sql. Antes: publicar la función resumen-semanal (tarea funciones). Se puede correr
-- varias veces.
--
-- Cómo sale:
--   · De lunes a miércoles, de 9 a 12:55 (Argentina), cada 5 minutos, pg_cron llama a la función
--     resumen-semanal solo si hay coaches pendientes (hay_resumenes_semanales). La función toma de a 8
--     (tomar_resumenes_semanales), manda el mail con Resend y después el aviso, y lo anota
--     (resumen_semanal_listo). Uno por coach y por semana. Si Resend falla por algo pasajero, lo suelta
--     (soltar_resumen_semanal) y se reintenta todo junto en la tanda siguiente, hasta 3 veces.
--   · Tope por día (tope_dia, 60 de entrada, por el plan gratis de Resend, que comparte los mails de
--     confirmar la cuenta y de la contraseña): los que faltan salen al día siguiente con la misma semana.
--   · Semana sin nada para contar (nadie entrenó, nadie lleva de 7 a 60 días sin entrenar y no hay
--     alumnos nuevos sin empezar): no le llega nada y queda anotado como 'sin_novedades'.
--   · Lo reciben los coaches con el plan al día (también en la prueba gratis o con cortesía) y los
--     profes de un gimnasio, con los alumnos que hoy pueden ver (coach_client_ok, si están los
--     gimnasios; si no, coach_active). Los socios en pausa no cuentan. No lo reciben las cuentas de
--     prueba (test_accounts) ni quien lo apagó (desde la app o desde el link del mail).
--   · La base NO guarda el resumen: solo cantidades por coach y por semana (16 semanas) y el token del
--     link «Dejar de recibirlo». El resumen se arma al mandarlo.
-- No redefine ninguna función que ya exista: solo llama a coach_client_ok, coach_active, cron_secret,
-- admin_assert, admin_log e is_app_admin. No toca coach_alerts ni el aviso diario de inactividad.


-- ===== Antes que nada: ¿están los archivos de los que depende? =====

-- Así no se aplica a medias: los cuerpos plpgsql no se revisan al crearlos.
do $$ begin
  if to_regprocedure('public.cron_secret()') is null then
    raise exception 'Primero correr supabase/avisos-coach.sql: este archivo usa cron_secret.';
  end if;
  if to_regprocedure('public.admin_assert()') is null or to_regprocedure('public.admin_log(text, text, jsonb)') is null
     or to_regprocedure('public.is_app_admin()') is null then
    raise exception 'Primero correr supabase/productos-revision.sql y supabase/admin.sql: este archivo usa admin_assert, admin_log e is_app_admin.';
  end if;
  if to_regprocedure('public.coach_active(uuid)') is null then
    raise exception 'Primero correr supabase/cupo-plan.sql: este archivo usa coach_active.';
  end if;
end $$;


-- ===== Tablas =====
-- Todas con RLS prendido, sin políticas y sin permisos para la app: solo las tocan las funciones de
-- abajo (security definer).

-- El interruptor y el tope por día. Una sola fila.
create table if not exists public.resumen_semanal_config (
  id         int primary key default 1,
  activo     boolean not null default false,
  tope_dia   int not null default 60,
  updated_at timestamptz not null default now()
);
alter table public.resumen_semanal_config drop constraint if exists resumen_semanal_config_una;
alter table public.resumen_semanal_config add constraint resumen_semanal_config_una check (id = 1);
alter table public.resumen_semanal_config drop constraint if exists resumen_semanal_config_tope;
alter table public.resumen_semanal_config add constraint resumen_semanal_config_tope check (tope_dia between 0 and 5000);
insert into public.resumen_semanal_config (id) values (1) on conflict (id) do nothing;

-- Cada coach: si lo apagó (null = le llega) y el token del link «Dejar de recibirlo» del mail.
create table if not exists public.resumen_semanal_coach (
  coach_id   uuid primary key references public.profiles(id) on delete cascade,
  apagado_at timestamptz,
  token      uuid not null unique default gen_random_uuid(),
  updated_at timestamptz not null default now()
);

-- Lo que se mandó: uno por coach y por semana (semana = el lunes de la semana resumida). Solo
-- cantidades, para el panel: ningún nombre ni dato de los alumnos.
create table if not exists public.resumen_semanal_envios (
  coach_id   uuid not null references public.profiles(id) on delete cascade,
  semana     date not null,
  estado     text not null default 'tomado',
  tomado_at  timestamptz not null default now(),
  intentos   smallint not null default 1,
  mail       boolean,
  aviso      boolean,
  alumnos    int,
  entrenaron int,
  records    int,
  primary key (coach_id, semana)
);
alter table public.resumen_semanal_envios drop constraint if exists resumen_semanal_envios_estado;
alter table public.resumen_semanal_envios add constraint resumen_semanal_envios_estado
  check (estado in ('tomado', 'enviado', 'sin_novedades', 'reintentar', 'fallido'));
-- Para el tope del día (los tomados hoy).
create index if not exists resumen_semanal_envios_tomado_idx on public.resumen_semanal_envios (tomado_at);

-- Las cuentas de prueba (la misma tabla de cuentas-prueba.sql; se crea acá por si este archivo corre
-- antes). No reciben el resumen.
create table if not exists public.test_accounts (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  marked_at  timestamptz not null default now(),
  marked_by  uuid references auth.users(id) on delete set null
);
alter table public.test_accounts enable row level security;
revoke all on public.test_accounts from anon, authenticated;

alter table public.resumen_semanal_config enable row level security;
alter table public.resumen_semanal_coach enable row level security;
alter table public.resumen_semanal_envios enable row level security;
revoke all on public.resumen_semanal_config from anon, authenticated;
revoke all on public.resumen_semanal_coach from anon, authenticated;
revoke all on public.resumen_semanal_envios from anon, authenticated;


-- ===== Funciones internas (nadie de la app las llama) =====
-- p_ahora es para poder probarlas con otra fecha: solo lo pasan la service role y las pruebas.

-- El lunes de la semana que se resume: la anterior a la de hoy, en hora de Argentina.
create or replace function public.resumen_semanal_semana(p_ahora timestamptz default now())
returns date language sql stable security definer set search_path = public as $$
  select date_trunc('week', p_ahora at time zone 'America/Argentina/Buenos_Aires')::date - 7;
$$;

-- ¿Se puede mandar ahora? De lunes 9:00 a miércoles 23:59 de Argentina.
create or replace function public.resumen_semanal_en_ventana(p_ahora timestamptz default now())
returns boolean language sql stable security definer set search_path = public as $$
  select extract(isodow from a) between 1 and 3 and (extract(isodow from a) > 1 or a::time >= time '09:00')
    from (select p_ahora at time zone 'America/Argentina/Buenos_Aires' as a) x;
$$;

-- ¿El coach ve hoy a este alumno? La misma regla que los avisos del coach: con los gimnasios,
-- coach_client_ok (socio que atiende como profe: el plan del gimnasio; alumno propio: el suyo); sin
-- ellos, coach_active. Un socio en pausa en el gimnasio donde lo atiende no cuenta. Lo de los gimnasios
-- solo corre si existen sus tablas y funciones (plpgsql no las busca hasta llegar a esa línea), así anda
-- igual antes y después de supabase/gimnasios.sql.
create or replace function public.resumen_semanal_ve(p_coach uuid, p_alumno uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  if p_coach is null or p_alumno is null then
    return false;
  end if;
  if to_regclass('public.gym_members') is not null and to_regclass('public.gym_staff') is not null then
    if exists (select 1 from public.gym_members m
                 join public.gym_staff s on s.gym_id = m.gym_id and s.user_id = p_coach
                                        and s.left_at is null and s.role in ('owner', 'admin', 'profe')
                where m.member_id = p_alumno and m.status = 'pausado') then
      return false;
    end if;
  end if;
  if to_regprocedure('public.coach_client_ok(uuid, uuid)') is not null then
    return public.coach_client_ok(p_coach, p_alumno);
  end if;
  return exists (select 1 from public.profiles p where p.id = p_alumno and p.coach_id = p_coach)
     and public.coach_active(p_coach);
end $$;

-- Los datos del resumen de una tanda de coaches, en UNA consulta (session_entries no tiene índice
-- declarado en el repo: se recorre una vez por tanda y no una por coach). Por coach:
--   {semana, alumnos, entrenaron, entrenos, checkins,
--    sin_entrenar: [{nombre, dias}] (de 7 a 60 días sin entrenar, el que más lleva primero, hasta 6),
--    sin_entrenar_mas, sin_empezar: [nombre] (sin entrenos y con la cuenta de menos de 30 días, hasta 3),
--    sin_empezar_mas, sin_actividad (más de 60 días, o sin entrenos con la cuenta más vieja),
--    records: [{nombre, items: [{ej, kg, antes}] (hasta 2), total}] (hasta 5, la mejora más grande
--    primero), records_total}
-- «Entrenó» = un entreno guardado (sessions.performed_on) entre el lunes y el domingo, como «Activos
-- esta semana» del panel. Los días sin entrenar se cuentan hasta hoy en Argentina, como el aviso de
-- inactividad. nombre es el nombre completo: lo acorta el mail (nombre de pila).
-- Récord, con la regla del festejo de la app (app/ui/festejo.js): más kg que su mejor marca de antes de
-- esa semana, con una marca anterior. Solo series con 0 < kg <= 500 y reps > 0. Una marca suelta muy
-- por encima de la siguiente (×2,5 y 20 kg más) es un error de tipeo: se usa la siguiente. La marca de
-- la semana tampoco puede ser un salto así sobre la de antes. Con dos récords en la semana, el más alto.
create or replace function public.resumen_semanal_datos(p_coaches uuid[], p_semana date, p_hoy date)
returns table (coach_id uuid, datos jsonb)
language sql stable security definer set search_path = public as $$
  with al as materialized (
    select p.coach_id as coach, p.id as alumno, coalesce(btrim(p.full_name), '') as nombre,
           (u.created_at at time zone 'America/Argentina/Buenos_Aires')::date as alta
      from public.profiles p
      left join auth.users u on u.id = p.id
     where p.coach_id = any(p_coaches) and public.resumen_semanal_ve(p.coach_id, p.id)
  ), se as materialized (
    select s.id, s.client_id, s.performed_on
      from public.sessions s
     where s.client_id in (select a.alumno from al a) and s.performed_on <= p_hoy
  ), por as materialized (
    select a.coach, a.alumno, a.nombre, a.alta,
           (select count(*) from se where se.client_id = a.alumno and se.performed_on between p_semana and p_semana + 6) as entrenos,
           p_hoy - (select max(se.performed_on) from se where se.client_id = a.alumno) as dias,
           exists (select 1 from public.checkins c where c.client_id = a.alumno and c.week_start = p_semana) as checkin
      from al a
  ), marcas as materialized (
    select se.client_id as alumno, e.exercise_name as ej, e.kg, se.performed_on >= p_semana as de_la_semana
      from public.session_entries e
      join se on se.id = e.session_id
     where se.performed_on <= p_semana + 6
       and e.kg > 0 and e.kg <= 500 and e.reps > 0
  ), antes as (
    select x.alumno, x.ej, max(x.kg) filter (where x.n = 1) as top1, max(x.kg) filter (where x.n = 2) as top2
      from (select m.alumno, m.ej, m.kg, row_number() over (partition by m.alumno, m.ej order by m.kg desc) as n
              from marcas m where not m.de_la_semana) x
     where x.n <= 2
     group by x.alumno, x.ej
  ), ref as (
    select b.alumno, b.ej,
           case when b.top2 is not null and b.top1 >= b.top2 * 2.5 and b.top1 - b.top2 >= 20 then b.top2 else b.top1 end as antes
      from antes b
  ), rec as (
    select r.alumno, r.ej, max(m.kg) as kg, r.antes
      from ref r
      join marcas m on m.alumno = r.alumno and m.ej = r.ej and m.de_la_semana
     where not (m.kg >= r.antes * 2.5 and m.kg - r.antes >= 20)
     group by r.alumno, r.ej, r.antes
    having max(m.kg) > r.antes
  ), rec_n as (
    select rc.*, row_number() over (partition by rc.alumno order by (rc.kg - rc.antes) / rc.antes desc, rc.ej) as n
      from rec rc
  ), rec_al as materialized (
    select a.coach, a.alumno, a.nombre, count(*) as total, max((rn.kg - rn.antes) / rn.antes) as mejora,
           jsonb_agg(jsonb_build_object('ej', rn.ej, 'kg', rn.kg, 'antes', rn.antes) order by rn.n) filter (where rn.n <= 2) as items
      from rec_n rn join al a on a.alumno = rn.alumno
     group by a.coach, a.alumno, a.nombre
  )
  select c.coach, jsonb_build_object(
    'semana', p_semana,
    'alumnos', (select count(*) from por where por.coach = c.coach),
    'entrenaron', (select count(*) from por where por.coach = c.coach and por.entrenos > 0),
    'entrenos', (select coalesce(sum(por.entrenos), 0) from por where por.coach = c.coach),
    'checkins', (select count(*) from por where por.coach = c.coach and por.checkin),
    'sin_entrenar', coalesce((select jsonb_agg(jsonb_build_object('nombre', x.nombre, 'dias', x.dias) order by x.dias desc, x.nombre)
                                from (select por.nombre, por.dias from por where por.coach = c.coach and por.dias between 7 and 60
                                       order by por.dias desc, por.nombre limit 6) x), '[]'::jsonb),
    'sin_entrenar_mas', greatest(0, (select count(*) from por where por.coach = c.coach and por.dias between 7 and 60) - 6),
    'sin_empezar', coalesce((select jsonb_agg(x.nombre order by x.alta desc, x.nombre)
                               from (select por.nombre, por.alta from por where por.coach = c.coach and por.dias is null and por.alta > p_hoy - 30
                                      order by por.alta desc, por.nombre limit 3) x), '[]'::jsonb),
    'sin_empezar_mas', greatest(0, (select count(*) from por where por.coach = c.coach and por.dias is null and por.alta > p_hoy - 30) - 3),
    'sin_actividad', (select count(*) from por where por.coach = c.coach
                        and (por.dias > 60 or (por.dias is null and (por.alta is null or por.alta <= p_hoy - 30)))),
    'records', coalesce((select jsonb_agg(jsonb_build_object('nombre', x.nombre, 'items', x.items, 'total', x.total) order by x.mejora desc, x.nombre)
                           from (select ra.nombre, ra.items, ra.total, ra.mejora from rec_al ra where ra.coach = c.coach
                                  order by ra.mejora desc, ra.nombre limit 5) x), '[]'::jsonb),
    'records_total', (select coalesce(sum(ra.total), 0) from rec_al ra where ra.coach = c.coach)
  )
  from (select distinct u.coach from unnest(p_coaches) as u(coach) where u.coach is not null) c;
$$;

-- Cuántos resúmenes se pueden tomar todavía hoy: el tope menos los tomados hoy (día UTC, como cuenta
-- Resend) que no quedaron 'sin_novedades' (esos no mandan nada).
create or replace function public.resumen_semanal_cupo(p_ahora timestamptz default now())
returns int language sql stable security definer set search_path = public as $$
  select greatest(0, c.tope_dia - (select count(*) from public.resumen_semanal_envios e
                                     where e.estado <> 'sin_novedades'
                                       and e.tomado_at >= date_trunc('day', p_ahora at time zone 'UTC') at time zone 'UTC'
                                       and e.tomado_at < (date_trunc('day', p_ahora at time zone 'UTC') + interval '1 day') at time zone 'UTC'))::int
    from public.resumen_semanal_config c where c.id = 1;
$$;

-- Los coaches a los que todavía les toca el resumen de esa semana: coach, con al menos un alumno, que
-- no es cuenta de prueba, que no lo apagó y sin envío de esa semana (o para reintentar).
create or replace function public.resumen_semanal_pendientes(p_semana date)
returns setof uuid language sql stable security definer set search_path = public as $$
  select p.id from public.profiles p
   where p.role = 'coach'
     and exists (select 1 from public.profiles x where x.coach_id = p.id)
     and not exists (select 1 from public.test_accounts t where t.user_id = p.id)
     and not exists (select 1 from public.resumen_semanal_coach c where c.coach_id = p.id and c.apagado_at is not null)
     and not exists (select 1 from public.resumen_semanal_envios e where e.coach_id = p.id and e.semana = p_semana and e.estado <> 'reintentar')
   order by p.id;
$$;

-- ¿Hay que llamar a la función? Lo pregunta el cron cada 5 minutos: prendido, en la ventana, con cupo
-- y con algún coach pendiente.
create or replace function public.hay_resumenes_semanales(p_ahora timestamptz default now())
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select c.activo from public.resumen_semanal_config c where c.id = 1), false)
     and public.resumen_semanal_en_ventana(p_ahora)
     and public.resumen_semanal_cupo(p_ahora) > 0
     and exists (select 1 from public.resumen_semanal_pendientes(public.resumen_semanal_semana(p_ahora)));
$$;

-- Toma hasta p_max coaches (y no más que el cupo del día) y los anota en un solo paso: dos llamadas a
-- la vez no repiten (la segunda choca con la fila de la primera y, como no está para reintentar, no la
-- toma). Arma los datos de toda la tanda de una vez y deja 'sin_novedades' a los que no tienen nada
-- para contar; si así quedó lugar en la tanda, toma más (hasta 4 vueltas). Devuelve los que tienen
-- algo para contar, con el nombre del coach y el token de su link de baja. Además borra los envíos de
-- más de 16 semanas.
create or replace function public.tomar_resumenes_semanales(p_max int default 8, p_ahora timestamptz default now())
returns table (coach_id uuid, semana date, nombre text, token uuid, datos jsonb)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_semana date := public.resumen_semanal_semana(p_ahora);
  v_hoy date := (p_ahora at time zone 'America/Argentina/Buenos_Aires')::date;
  v_quedan int := greatest(coalesce(p_max, 8), 0);
  v_vuelta int := 0;
  v_n int;
  v_ids uuid[];
  v_datos jsonb;
  v_todo jsonb := '{}'::jsonb;
begin
  if not coalesce((select c.activo from public.resumen_semanal_config c where c.id = 1), false)
     or not public.resumen_semanal_en_ventana(p_ahora) then
    return;
  end if;
  delete from public.resumen_semanal_envios e where e.semana < v_semana - 16 * 7;

  while v_quedan > 0 and v_vuelta < 4 loop
    v_vuelta := v_vuelta + 1;
    v_n := least(v_quedan, public.resumen_semanal_cupo(p_ahora));
    exit when v_n <= 0;
    v_ids := null;
    with cand as (
      select x.id from public.resumen_semanal_pendientes(v_semana) as x(id) limit v_n
    ), tom as (
      insert into public.resumen_semanal_envios as e (coach_id, semana, estado, tomado_at, intentos)
      select cand.id, v_semana, 'tomado', p_ahora, 1 from cand
      on conflict (coach_id, semana) do update
        set estado = 'tomado', tomado_at = excluded.tomado_at, intentos = e.intentos + 1
        where e.estado = 'reintentar'
      returning e.coach_id
    )
    select array_agg(tom.coach_id) into v_ids from tom;
    exit when v_ids is null;

    select jsonb_object_agg(d.coach_id::text, d.datos) into v_datos
      from public.resumen_semanal_datos(v_ids, v_semana, v_hoy) d;
    -- Las cantidades, para el panel. Sin nada para contar: 'sin_novedades' (no se manda).
    update public.resumen_semanal_envios e
       set alumnos = (t.value->>'alumnos')::int, entrenaron = (t.value->>'entrenaron')::int,
           records = (t.value->>'records_total')::int,
           estado = case when (t.value->>'entrenaron')::int = 0 and jsonb_array_length(t.value->'sin_entrenar') = 0
                              and jsonb_array_length(t.value->'sin_empezar') = 0
                         then 'sin_novedades' else e.estado end
      from jsonb_each(coalesce(v_datos, '{}'::jsonb)) t
     where e.coach_id = t.key::uuid and e.semana = v_semana;
    select coalesce(jsonb_object_agg(t.key, t.value), '{}'::jsonb) into v_datos
      from jsonb_each(coalesce(v_datos, '{}'::jsonb)) t
      join public.resumen_semanal_envios e on e.coach_id = t.key::uuid and e.semana = v_semana and e.estado = 'tomado';
    v_todo := v_todo || v_datos;
    v_quedan := v_quedan - (select count(*) from jsonb_object_keys(v_datos))::int;
  end loop;
  if v_todo = '{}'::jsonb then
    return;
  end if;

  -- El token del link «Dejar de recibirlo».
  insert into public.resumen_semanal_coach (coach_id)
  select k::uuid from jsonb_object_keys(v_todo) k
  on conflict (coach_id) do nothing;

  return query
  select e.coach_id, v_semana, coalesce(btrim(p.full_name), ''), c.token, v_todo->(e.coach_id::text)
    from public.resumen_semanal_envios e
    join public.resumen_semanal_coach c on c.coach_id = e.coach_id
    join public.profiles p on p.id = e.coach_id
   where v_todo ? e.coach_id::text and e.semana = v_semana and e.estado = 'tomado'
   order by e.coach_id;
end $$;

-- Salió: por mail, por aviso o por los dos (o por ninguno, si el mail rebotó y no tiene avisos).
create or replace function public.resumen_semanal_listo(p_coach uuid, p_semana date, p_mail boolean, p_aviso boolean)
returns void language sql security definer set search_path = public as $$
  update public.resumen_semanal_envios
     set estado = 'enviado', mail = coalesce(p_mail, false), aviso = coalesce(p_aviso, false)
   where coach_id = p_coach and semana = p_semana and estado = 'tomado';
$$;

-- No salió por algo pasajero: se reintenta en la tanda siguiente, hasta 3 veces en total.
create or replace function public.soltar_resumen_semanal(p_coach uuid, p_semana date)
returns void language sql security definer set search_path = public as $$
  update public.resumen_semanal_envios
     set estado = case when intentos >= 3 then 'fallido' else 'reintentar' end
   where coach_id = p_coach and semana = p_semana and estado = 'tomado';
$$;

-- El link del mail, sin sesión: «No me lo mandes más» (p_on = false) o «Volver a recibirlo» (true).
-- Devuelve si el token existía (la función no se lo dice a nadie).
create or replace function public.resumen_semanal_baja(p_token uuid, p_on boolean default false)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.resumen_semanal_coach
     set apagado_at = case when coalesce(p_on, false) then null else coalesce(apagado_at, now()) end, updated_at = now()
   where token = p_token;
  return found;
end $$;

revoke all on function public.resumen_semanal_semana(timestamptz) from public, anon, authenticated;
revoke all on function public.resumen_semanal_en_ventana(timestamptz) from public, anon, authenticated;
revoke all on function public.resumen_semanal_ve(uuid, uuid) from public, anon, authenticated;
revoke all on function public.resumen_semanal_datos(uuid[], date, date) from public, anon, authenticated;
revoke all on function public.resumen_semanal_cupo(timestamptz) from public, anon, authenticated;
revoke all on function public.resumen_semanal_pendientes(date) from public, anon, authenticated;
revoke all on function public.hay_resumenes_semanales(timestamptz) from public, anon, authenticated;
revoke all on function public.tomar_resumenes_semanales(int, timestamptz) from public, anon, authenticated;
revoke all on function public.resumen_semanal_listo(uuid, date, boolean, boolean) from public, anon, authenticated;
revoke all on function public.soltar_resumen_semanal(uuid, date) from public, anon, authenticated;
revoke all on function public.resumen_semanal_baja(uuid, boolean) from public, anon, authenticated;
-- Solo la función resumen-semanal (service role).
grant execute on function public.tomar_resumenes_semanales(int, timestamptz) to service_role;
grant execute on function public.resumen_semanal_listo(uuid, date, boolean, boolean) to service_role;
grant execute on function public.soltar_resumen_semanal(uuid, date) to service_role;
grant execute on function public.resumen_semanal_baja(uuid, boolean) to service_role;


-- ===== La app: el coach lo apaga o lo prende (Configuración → Avisos) =====

-- true = le llega; false = lo apagó; null = no es coach.
create or replace function public.resumen_semanal_estado()
returns boolean language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'coach')
              then not exists (select 1 from public.resumen_semanal_coach c where c.coach_id = auth.uid() and c.apagado_at is not null)
         end;
$$;

create or replace function public.resumen_semanal_cambiar(p_on boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null or not exists (select 1 from public.profiles p where p.id = me and p.role = 'coach') then
    raise exception 'El resumen de los lunes es para coaches.' using errcode = '42501';
  end if;
  if p_on is null then
    raise exception 'Falta si lo querés recibir o no.' using errcode = '22023';
  end if;
  insert into public.resumen_semanal_coach as c (coach_id, apagado_at)
  values (me, case when p_on then null else now() end)
  on conflict (coach_id) do update
    set apagado_at = case when p_on then null else coalesce(c.apagado_at, now()) end, updated_at = now();
  return p_on;
end $$;

revoke all on function public.resumen_semanal_estado() from public, anon;
grant execute on function public.resumen_semanal_estado() to authenticated;
revoke all on function public.resumen_semanal_cambiar(boolean) from public, anon;
grant execute on function public.resumen_semanal_cambiar(boolean) to authenticated;


-- ===== El panel (gize.ar/admin → Avisos) =====

-- Cómo está: prendido o no, el tope, el próximo envío y los números de la última semana resumida.
create or replace function public.admin_resumen_semanal()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_semana date := public.resumen_semanal_semana(now());
  v_ar timestamp := now() at time zone 'America/Argentina/Buenos_Aires';
  v_prox timestamp := date_trunc('week', now() at time zone 'America/Argentina/Buenos_Aires') + interval '9 hours';
  c public.resumen_semanal_config;
begin
  perform public.admin_assert();
  select * into c from public.resumen_semanal_config where id = 1;
  if v_ar >= v_prox then
    v_prox := v_prox + interval '7 days';
  end if;
  return jsonb_build_object(
    'activo', coalesce(c.activo, false),
    'tope_dia', c.tope_dia,
    'semana', v_semana,
    'en_ventana', public.resumen_semanal_en_ventana(now()),
    'proximo_lunes', to_char(v_prox, 'YYYY-MM-DD"T"HH24:MI:SS') || '-03:00',
    'cupo_hoy', public.resumen_semanal_cupo(now()),
    'pendientes', (select count(*) from public.resumen_semanal_pendientes(v_semana)),
    'candidatos', (select count(*) from public.profiles p
                    where p.role = 'coach' and exists (select 1 from public.profiles x where x.coach_id = p.id)
                      and not exists (select 1 from public.test_accounts t where t.user_id = p.id)
                      and not exists (select 1 from public.resumen_semanal_coach k where k.coach_id = p.id and k.apagado_at is not null)),
    'enviados', (select count(*) from public.resumen_semanal_envios e where e.semana = v_semana and e.estado = 'enviado'),
    'con_mail', (select count(*) from public.resumen_semanal_envios e where e.semana = v_semana and e.estado = 'enviado' and e.mail),
    'con_aviso', (select count(*) from public.resumen_semanal_envios e where e.semana = v_semana and e.estado = 'enviado' and e.aviso),
    'sin_novedades', (select count(*) from public.resumen_semanal_envios e where e.semana = v_semana and e.estado = 'sin_novedades'),
    'reintentar', (select count(*) from public.resumen_semanal_envios e where e.semana = v_semana and e.estado = 'reintentar'),
    'en_curso', (select count(*) from public.resumen_semanal_envios e where e.semana = v_semana and e.estado = 'tomado'),
    'fallidos', (select count(*) from public.resumen_semanal_envios e where e.semana = v_semana and e.estado = 'fallido'),
    'apagados', (select count(*) from public.resumen_semanal_coach k where k.apagado_at is not null)
  );
end $$;

-- Prender o apagar y el tope por día (null deja lo que está). Queda en el registro de acciones.
create or replace function public.admin_resumen_semanal_config(p_activo boolean, p_tope int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.resumen_semanal_config;
begin
  perform public.admin_assert();
  if p_tope is not null and (p_tope < 0 or p_tope > 5000) then
    raise exception 'El tope por día va de 0 a 5000 mails.' using errcode = 'P0001';
  end if;
  update public.resumen_semanal_config
     set activo = coalesce(p_activo, activo), tope_dia = coalesce(p_tope, tope_dia), updated_at = now()
   where id = 1
  returning * into c;
  perform public.admin_log('resumen_semanal', null, jsonb_build_object('activo', c.activo, 'tope_dia', c.tope_dia));
  return public.admin_resumen_semanal();
end $$;

revoke all on function public.admin_resumen_semanal() from public, anon;
grant execute on function public.admin_resumen_semanal() to authenticated;
revoke all on function public.admin_resumen_semanal_config(boolean, int) from public, anon;
grant execute on function public.admin_resumen_semanal_config(boolean, int) to authenticated;


-- ===== Tarea programada =====

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net;
-- Lunes a miércoles, de 12 a 15:55 UTC = de 9 a 12:55 en Argentina, cada 5 minutos, solo si hay algo
-- para mandar. El tiempo máximo va escrito: pg_net corta a los pocos segundos si no.
select cron.unschedule('gize-resumen-semanal') where exists (select 1 from cron.job where jobname = 'gize-resumen-semanal');
select cron.schedule('gize-resumen-semanal', '*/5 12-15 * * 1-3', $job$
  select net.http_post(
    url := 'https://wegptuzhsrwppbknqstf.supabase.co/functions/v1/resumen-semanal',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.cron_secret()),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
  where public.hay_resumenes_semanales();
$job$);

notify pgrst, 'reload schema';

-- Solo cantidades (el registro del workflow es público).
select (select activo from public.resumen_semanal_config where id = 1) as resumen_activo,
       (select tope_dia from public.resumen_semanal_config where id = 1) as tope_dia,
       (select count(*) from public.resumen_semanal_envios) as envios_guardados;
