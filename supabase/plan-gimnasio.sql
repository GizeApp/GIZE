-- Plan Gimnasio chico: hasta 100 alumnos (ver suscripciones.sql). Los gimnasios de 250 y 500
-- (p250, p500) y los precios nuevos están en precios-2026-10.sql.
-- Agrega 'p100' a los planes permitidos de coach_billing. Se puede correr varias veces.
alter table public.coach_billing drop constraint if exists coach_billing_plan_check;
alter table public.coach_billing add constraint coach_billing_plan_check
  check (plan in ('trial','p10','p25','p50','p100','p250','p500','cortesia'));
notify pgrst, 'reload schema';
