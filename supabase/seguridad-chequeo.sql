-- Chequeo previo a seguridad-base.sql (solo lectura): cuántas rutinas y plantillas guardadas no pasarían las validaciones nuevas.
-- 1) Forma de la rutina.
create or replace function pg_temp.routine_days_ok(days jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select jsonb_typeof(days) = 'array'
     and not exists (
       select 1 from jsonb_array_elements(days) d
        where jsonb_typeof(d) <> 'object'
           or coalesce(d->>'id', 'x') !~ '^[A-Za-z0-9_-]{1,64}$'
           or (d ? 'exercises' and jsonb_typeof(d->'exercises') <> 'array'))
     and not exists (
       select 1 from jsonb_array_elements(days) d,
                     jsonb_array_elements(case when jsonb_typeof(d->'exercises') = 'array' then d->'exercises' else '[]'::jsonb end) e
        where jsonb_typeof(e) <> 'object'
           or coalesce(e->>'id', 'x') !~ '^[A-Za-z0-9_-]{1,64}$'
           or (e ? 'video' and e->>'video' !~* '^https://')
           or (e ? 'sets' and jsonb_typeof(e->'sets') <> 'array'))
     and not exists (
       select 1 from jsonb_array_elements(days) d,
                     jsonb_array_elements(case when jsonb_typeof(d->'exercises') = 'array' then d->'exercises' else '[]'::jsonb end) e,
                     jsonb_array_elements(case when jsonb_typeof(e->'sets') = 'array' then e->'sets' else '[]'::jsonb end) s
        where jsonb_typeof(s) <> 'object'
           or coalesce(s->>'id', 'x') !~ '^[A-Za-z0-9_-]{1,64}$');
$$;

-- Chequeo final: rutinas guardadas antes que hoy ya no se aceptarían (solo la cantidad: el
-- log del workflow es público).
select (select count(*) from public.routines where not pg_temp.routine_days_ok(days)) as rutinas_invalidas,
       (select count(*) from public.routine_templates where not pg_temp.routine_days_ok(days)) as plantillas_invalidas;
