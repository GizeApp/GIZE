-- Con coach, la rutina la escribe solo el coach. Si el celular del alumno tenía la app
-- abierta desde antes de vincularse (todavía se creía sin coach), podía subir su rutina
-- propia y pisar la que el coach acababa de armar. Ahora la base lo rechaza.
-- Correr con el workflow "Supabase" → tarea sql → supabase/rutina-del-coach.sql. Se puede
-- correr varias veces.

create or replace function public.routines_owner_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- updated_by = el alumno: la subió su app. Las rutinas programadas del coach que se aplican
  -- desde el celular del alumno (apply_due_routines) llevan updated_by = el coach y pasan.
  if auth.uid() is not null and auth.uid() = new.client_id and new.updated_by is not distinct from auth.uid()
     and exists (select 1 from public.profiles where id = new.client_id and coach_id is not null) then
    raise exception 'Tu rutina la arma tu coach.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists routines_owner_guard on public.routines;
create trigger routines_owner_guard before insert or update on public.routines
  for each row execute function public.routines_owner_guard();
