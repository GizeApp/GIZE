-- Cobros de los coaches más seguros (con supabase/functions/suscripcion).
-- Correr con el workflow "Supabase" → tarea sql → supabase/pagos-seguros.sql.
-- Se puede correr varias veces.
--
--   1) mp_pending_id: la última suscripción que pidió el coach y todavía no cobró. La
--      función da de baja cualquier otra que Mercado Pago autorice (checkouts viejos, dos
--      toques en "pagar"): antes podían quedar dos suscripciones cobrando todos los meses.
--   2) Borrar la cuenta con una suscripción que se renueva: primero hay que cancelarla. Si
--      no, la cuenta desaparecía y Mercado Pago le seguía cobrando (la función igual la
--      cancela si le llega un aviso de una cuenta que ya no existe).
--   3) mp_checkouts: cada vez que un coach aprieta «pagar» se anota acá, y la función corta
--      en 10 por hora. Cada checkout crea una suscripción en Mercado Pago con la cuenta de
--      GIZE: sin tope, un coach podía crear cientos (y mandar un mail a los socios por cada
--      una que se daba de baja). Solo la usa la función: sin políticas, nadie más la ve.
--      reuso: el toque que reusa el link sin pagar (no crea nada, pero igual consulta a
--      Mercado Pago). Se cuenta aparte, con un tope de 30 por hora.

alter table public.coach_billing add column if not exists mp_pending_id text;

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then raise exception 'Necesitás iniciar sesión' using errcode='28000'; end if;
  if exists (select 1 from public.coach_billing
              where coach_id = auth.uid() and mp_preapproval_id is not null and mp_status = 'authorized') then
    raise exception 'Primero cancelá la renovación de tu plan en gize.ar/app (Mi plan → Cancelar la renovación), así Mercado Pago no te sigue cobrando.' using errcode = 'P0001';
  end if;
  delete from auth.users where id = auth.uid();
end $$;

revoke execute on function public.delete_own_account() from public, anon;
grant  execute on function public.delete_own_account() to authenticated;

create table if not exists public.mp_checkouts (
  id         bigint generated always as identity primary key,
  coach_id   uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.mp_checkouts add column if not exists reuso boolean not null default false;
create index if not exists mp_checkouts_coach_idx on public.mp_checkouts (coach_id, created_at);
alter table public.mp_checkouts enable row level security;
revoke all on public.mp_checkouts from anon, authenticated;

notify pgrst, 'reload schema';
