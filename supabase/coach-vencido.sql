-- Coach con el plan vencido: a los 4 días sus alumnos pasan solos al sistema común.
-- Correr con el workflow "Supabase" → tarea sql → supabase/coach-vencido.sql (después de
-- suscripciones.sql, cupo-plan.sql y avisos-coach.sql). Se puede volver a correr.
--
-- Qué pasaba: si al coach se le terminaba la prueba o el plan pago, sus alumnos seguían
-- vinculados a alguien que ya no podía verlos. Conservaban todo, pero la rutina les quedaba
-- bloqueada (con coach, la rutina la maneja el coach) y el chat no tenía a nadie del otro lado.
--
-- Qué hace: una vez por hora, a los coaches cuyo plan venció hace más de 4 días (prueba y
-- pago, lo que termine más tarde; la cortesía no vence) se les desvinculan los alumnos. El
-- alumno conserva todo (rutina, entrenos, pesos, comidas, check-ins, plan alimenticio: todo
-- está a su nombre) y la rutina queda suya para modificarla. Las rutinas programadas del coach
-- que todavía no empezaron se borran solas al cambiar el coach (rutina-programada.sql).
-- profiles.coach_left_at marca cuándo pasó, para que la app le avise al alumno una vez.
-- Si el coach vuelve a pagar, el alumno se vuelve a vincular con su código, como siempre.
--
-- Un coach que se pasó del cupo de alumnos de su plan no entra acá (sigue pagando): ese caso
-- lo resuelve él desde Mi plan.

alter table public.profiles add column if not exists coach_left_at timestamptz;

create or replace function public.release_lapsed_clients()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  with lapsed as (
    select b.coach_id
      from public.coach_billing b
     where b.plan <> 'cortesia'
       and greatest(b.trial_ends_at, coalesce(b.paid_until, '-infinity')) < now() - interval '4 days'
  ), released as (
    update public.profiles p
       set coach_id = null, coach_left_at = now()
      from lapsed l
     where p.coach_id = l.coach_id
       and coalesce(p.role, 'client') <> 'coach'
    returning p.id
  )
  select count(*) into n from released;
  return n;
end $$;
revoke execute on function public.release_lapsed_clients() from public, anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;
select cron.unschedule('gize-coach-vencido') where exists (select 1 from cron.job where jobname = 'gize-coach-vencido');
select cron.schedule('gize-coach-vencido', '23 * * * *', $job$ select public.release_lapsed_clients(); $job$);

notify pgrst, 'reload schema';
