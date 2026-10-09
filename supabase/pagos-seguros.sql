-- Cobros de los coaches más seguros (con supabase/functions/suscripcion).
-- Correr con el workflow "Supabase" → tarea sql → supabase/pagos-seguros.sql.
-- Se puede correr varias veces.
--
--   1) mp_pending_id: la última suscripción que pidió el coach y todavía no cobró. La
--      función da de baja cualquier otra que Mercado Pago autorice (checkouts viejos, dos
--      toques en "pagar"): antes podían quedar dos suscripciones cobrando todos los meses.
--   2) Borrar la cuenta con una suscripción que se renueva: primero hay que cancelarla. Si
--      no, la cuenta desaparecía y Mercado Pago le seguía cobrando (la función igual la
--      cancela si le llega un aviso de una cuenta que ya no existe). Al borrarla, los
--      productos publicados de sus pedidos quedan sin la foto de la tabla (photo_path, con su
--      id en la ruta), igual que cuando la borra un administrador desde el panel.

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
  update public.products set photo_path = null where photo_path like auth.uid()::text || '/%';
  delete from auth.users where id = auth.uid();
end $$;

revoke execute on function public.delete_own_account() from public, anon;
grant  execute on function public.delete_own_account() to authenticated;

notify pgrst, 'reload schema';
