-- Cupo del plan: un coach con más clientes de los que permite su plan queda como sin plan
-- hasta que se pase a uno más grande o desvincule clientes.
-- Antes el cupo solo se miraba al vincularse un cliente y al abrir el pago: se podía abrir
-- el pago de un plan chico, llenar el plan grande de clientes y recién después pagar el chico.
-- El plan cortesía no cambia (el cupo lo decide el administrador).
-- Correr con el workflow "Supabase" → tarea sql → supabase/cupo-plan.sql, después de
-- suscripciones.sql. Se puede correr varias veces.

-- Contar los clientes de un coach no recorre la tabla (coach_active se usa en cada política).
create index if not exists profiles_coach_id_idx on public.profiles(coach_id);

create or replace function public.coach_active(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.coach_billing b
     where b.coach_id = cid
       and (b.plan = 'cortesia'
            or ((b.trial_ends_at > now() or coalesce(b.paid_until, '-infinity') > now())
                and (select count(*) from public.profiles x where x.coach_id = cid) <= coalesce(b.max_clients, 10)))
  );
$$;
revoke execute on function public.coach_active(uuid) from public, anon;
grant  execute on function public.coach_active(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
