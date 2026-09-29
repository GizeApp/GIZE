-- Endurecimiento de la base (auditoría de seguridad, septiembre 2026).
-- Correr con el workflow "Supabase" → tarea sql → supabase/seguridad-base.sql.
-- Se puede correr varias veces. Al final devuelve lo que haya que revisar (vacío = todo bien).
--
--   1) Rutinas y plantillas: los id de días, ejercicios y series solo pueden tener letras,
--      números, - y _ (van dentro del HTML de la app), y el link de video tiene que ser https.
--      Sin esto, una rutina armada a mano podía meter código en la app del coach o del
--      cliente (la app ya lo filtra, pero así también quedan cubiertas las versiones viejas).
--   2) (Fotos de check-in: ya no va. La tabla checkin_photos se eliminó con todas las fotos,
--      ver borrar-fotos-progreso.sql.)
--   3) Las funciones de la app solo las puede llamar un usuario logueado.

-- 1) Forma de la rutina.
create or replace function public.routine_days_ok(days jsonb)
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

create or replace function public.routines_validate()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not public.routine_days_ok(new.days) then
    raise exception 'La rutina tiene datos inválidos. Actualizá la app y volvé a intentar.' using errcode = '22023';
  end if;
  return new;
end $$;

drop trigger if exists routines_validate on public.routines;
create trigger routines_validate before insert or update of days on public.routines
  for each row execute function public.routines_validate();
drop trigger if exists routine_templates_validate on public.routine_templates;
create trigger routine_templates_validate before insert or update of days on public.routine_templates
  for each row execute function public.routines_validate();

-- 3) Nada para usuarios sin sesión (sin sesión no hacían nada, pero no tienen por qué estar a mano).
revoke execute on function public.client_push_devices(uuid)              from public, anon;
revoke execute on function public.save_push_subscription(text,text,text) from public, anon;
revoke execute on function public.delete_push_subscription(text)         from public, anon;
revoke execute on function public.set_my_avatar(text)                    from public, anon;
grant  execute on function public.client_push_devices(uuid)              to authenticated;
grant  execute on function public.save_push_subscription(text,text,text) to authenticated;
grant  execute on function public.delete_push_subscription(text)         to authenticated;
grant  execute on function public.set_my_avatar(text)                    to authenticated;

notify pgrst, 'reload schema';

-- Chequeo final: rutinas guardadas antes que hoy ya no se aceptarían (solo la cantidad: el
-- log del workflow es público).
select (select count(*) from public.routines where not public.routine_days_ok(days)) as rutinas_invalidas,
       (select count(*) from public.routine_templates where not public.routine_days_ok(days)) as plantillas_invalidas;
