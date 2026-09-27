-- Semana de descarga: el coach le arma al alumno una rutina especial para una semana de
-- descarga del bloque, y le llega un aviso cuando al alumno le toca.
-- Correr con el workflow "Supabase" → tarea sql → supabase/descarga.sql. Se puede volver a
-- correr. Va después de avisos-coach.sql (usa coach_alerts y pg_cron).
--
--   · blocks.deload_routines: {"4": {"days": [...], "start": "2026-09-07"}}: la rutina de la
--     semana 4 del bloque que empieza ese día (start). La
--     rutina de siempre (public.routines) no se toca: la app del alumno muestra esta durante
--     esa semana y el lunes siguiente vuelve sola a la de siempre.
--   · blocks.week_plan: {"4": {"goal": "...", "note": "..."}}: objetivo e indicaciones de
--     una semana (las ve el alumno arriba de su rutina).
--   · Avisos al coach (coach_alerts): 'descarga' en la semana de descarga y
--     'descarga_prox' unos días antes si todavía no le armó la rutina.

alter table public.blocks add column if not exists week_plan jsonb not null default '{}'::jsonb;
alter table public.blocks add column if not exists deload_routines jsonb not null default '{}'::jsonb;

-- Forma y tamaño: claves = número de semana; cada rutina con la misma forma que las demás
-- (routine_days_ok, ver seguridad-base.sql).
create or replace function public.blocks_validate()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Tope de tamaño: lo que la app deja cargar (52 semanas con objetivo e indicaciones largas,
  -- una rutina de descarga por semana) entra holgado.
  if pg_column_size(new.week_plan) > 300000 or pg_column_size(new.deload_routines) > 1500000 then
    raise exception 'El bloque tiene demasiados datos (indicaciones o rutinas de descarga muy largas).' using errcode = '22023';
  end if;
  if jsonb_typeof(new.week_plan) <> 'object'
     or exists (select 1 from jsonb_each(new.week_plan) w
                 where w.key !~ '^[1-9][0-9]?$' or jsonb_typeof(w.value) <> 'object'
                    or char_length(coalesce(w.value->>'goal', '')) > 300
                    or char_length(coalesce(w.value->>'note', '')) > 1000) then
    raise exception 'El plan de semanas tiene datos inválidos. Actualizá la app y volvé a intentar.' using errcode = '22023';
  end if;
  -- Cada rutina: {"days": [...], "start": "fecha de inicio del bloque cuando se armó"}.
  if jsonb_typeof(new.deload_routines) <> 'object'
     or exists (select 1 from jsonb_each(new.deload_routines) r
                 where r.key !~ '^[1-9][0-9]?$' or jsonb_typeof(r.value) <> 'object'
                    or not public.routine_days_ok(coalesce(r.value->'days', 'null'::jsonb))
                    or (r.value ? 'start' and coalesce(r.value->>'start', '') !~ '^\d{4}-\d{2}-\d{2}$')) then
    raise exception 'La rutina de descarga tiene datos inválidos. Actualizá la app y volvé a intentar.' using errcode = '22023';
  end if;
  return new;
end $$;

drop trigger if exists blocks_validate on public.blocks;
create trigger blocks_validate before insert or update of week_plan, deload_routines on public.blocks
  for each row execute function public.blocks_validate();

-- Avisos: dos tipos nuevos.
-- (se borra el chequeo de tipos que haya, tenga el nombre que tenga, y se crea de nuevo)
do $$
declare c text;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.coach_alerts'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%kind%' loop
    execute format('alter table public.coach_alerts drop constraint %I', c);
  end loop;
end $$;
alter table public.coach_alerts add constraint coach_alerts_kind_check
  check (kind in ('checkin', 'inactivo', 'descarga', 'descarga_prox'));

-- ¿La semana wk tiene rutina de descarga armada para este ciclo? Cada rutina guarda la fecha
-- de inicio del bloque con la que se armó ("start"): si el coach re-fecha el bloque para un
-- mesociclo nuevo, las del anterior ya no cuentan.
create or replace function public.block_deload_planned(b public.blocks, wk int)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(b.deload_routines ? wk::text
     and coalesce(b.deload_routines -> (wk::text) ->> 'start', b.start_date::text) = b.start_date::text, false);
$$;

-- Semanas de descarga de un bloque como jsonb (la columna deloads guarda la lista de números).
create or replace function public.block_deload_weeks(b public.blocks)
returns jsonb
language sql
stable
set search_path = public
as $$
  select case when jsonb_typeof(to_jsonb(b.deloads)) = 'array' then to_jsonb(b.deloads) else '[]'::jsonb end;
$$;

-- Todos los días a las 9 (Argentina):
--   · 'descarga': el alumno está en una semana de descarga (uno por bloque, semana y fecha de
--     inicio: si el coach re-fecha el bloque para otro mesociclo, vuelve a avisar).
--   · 'descarga_prox': de jueves a domingo, si la semana que viene es de descarga y todavía
--     no tiene rutina de descarga.
create or replace function public.queue_deload_alerts()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  n int := 0; m int := 0;
begin
  insert into coach_alerts (coach_id, client_id, kind, key, days)
  select p.coach_id, b.client_id, 'descarga', b.id::text || ':' || w.wk || ':' || b.start_date, w.wk
    from blocks b
    join profiles p on p.id = b.client_id
    cross join lateral (select ((hoy - b.start_date) / 7) + 1 as wk) w
   where b.active and p.coach_id is not null and b.start_date <= hoy
     and w.wk <= coalesce(b.weeks, 52)
     and (public.block_deload_weeks(b) @> to_jsonb(w.wk) or public.block_deload_weeks(b) @> to_jsonb(w.wk::text))
  on conflict (client_id, kind, key) do nothing;
  get diagnostics n = row_count;

  if extract(isodow from hoy) >= 4 then
    insert into coach_alerts (coach_id, client_id, kind, key, days)
    select p.coach_id, b.client_id, 'descarga_prox', b.id::text || ':' || w.wk || ':' || b.start_date, w.wk
      from blocks b
      join profiles p on p.id = b.client_id
      cross join lateral (select ((hoy + 7 - b.start_date) / 7) + 1 as wk) w
     where b.active and p.coach_id is not null and b.start_date <= hoy + 7
       and w.wk <= coalesce(b.weeks, 52)
       and (public.block_deload_weeks(b) @> to_jsonb(w.wk) or public.block_deload_weeks(b) @> to_jsonb(w.wk::text))
       and not public.block_deload_planned(b, w.wk)
    on conflict (client_id, kind, key) do nothing;
    get diagnostics m = row_count;
  end if;
  return n + m;
end $$;

revoke execute on function public.queue_deload_alerts() from public, anon, authenticated;
revoke execute on function public.block_deload_weeks(public.blocks) from public, anon;
revoke execute on function public.block_deload_planned(public.blocks, int) from public, anon;

select cron.unschedule('gize-avisos-descarga') where exists (select 1 from cron.job where jobname = 'gize-avisos-descarga');
select cron.schedule('gize-avisos-descarga', '5 12 * * *', $job$ select public.queue_deload_alerts(); $job$);

notify pgrst, 'reload schema';

-- Resumen (solo cantidades: el log del workflow es público).
select (select count(*) from public.blocks where deload_routines <> '{}'::jsonb) as bloques_con_rutina_de_descarga,
       (select count(*) from public.blocks where week_plan <> '{}'::jsonb) as bloques_con_plan_semanal;
