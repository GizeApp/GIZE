-- Planes de coach comprados con Apple dentro de la app de iPhone (In-App Purchase, suscripciones
-- mensuales que se renuevan solas). Los guarda la función supabase/functions/compras-apple.
-- Correr con el workflow "Supabase" → tarea sql → supabase/compras-apple.sql, ANTES de publicar
-- la función y la app (después de suscripciones.sql, pagos-seguros.sql y aviso-vencimiento.sql).
-- Se puede correr varias veces.
--
--   1) apple_subs: una fila por suscripción de Apple (original_transaction_id), con la cuenta de
--      GIZE que la compró, el producto, hasta cuándo cubre, si es de Sandbox (pruebas de Apple y
--      TestFlight), si se reembolsó y si se renueva sola. signed_at es cuándo firmó Apple lo último
--      que se guardó: un dato más viejo no pisa uno más nuevo. Solo la usa la función (service
--      role): sin políticas, desde la app nadie la puede leer ni escribir.
--   2) coach_billing: apple_original_tx (la suscripción de Apple del coach), apple_vence (hasta
--      cuándo la cubre Apple) y apple_renueva (se renueva sola). Con un plan de Apple, la función
--      pone el plan, el tope de alumnos y paid_until como con Mercado Pago, así coach_active y el
--      resto siguen igual. Lo pagado «viene de Apple» si paid_until no pasa de apple_vence; si pasa,
--      lo pagó por la web (Mercado Pago o transferencia). Las columnas de Mercado Pago no se tocan.
--   3) El mail «tu plan vence mañana» (aviso-vencimiento.sql) no sale si el plan de Apple se renueva
--      solo (como con la suscripción de Mercado Pago activa). Esta es la versión vigente de
--      hay_avisos_vence y tomar_avisos_vence: si se vuelve a correr aviso-vencimiento.sql, correr
--      después este archivo.

create table if not exists public.apple_subs (
  original_transaction_id text primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  product_id     text not null,
  transaction_id text,
  expires_at     timestamptz,
  environment    text not null check (environment in ('Production', 'Sandbox')),
  revoked        boolean not null default false,
  auto_renew     boolean,
  signed_at      timestamptz,
  updated_at     timestamptz not null default now()
);
create index if not exists apple_subs_user_idx on public.apple_subs (user_id);
alter table public.apple_subs enable row level security;
revoke all on public.apple_subs from public, anon, authenticated;
grant select, insert, update, delete on public.apple_subs to service_role;

alter table public.coach_billing add column if not exists apple_original_tx text;
alter table public.coach_billing add column if not exists apple_vence timestamptz;
alter table public.coach_billing add column if not exists apple_renueva boolean not null default false;

-- Mail de vencimiento (ver aviso-vencimiento.sql): igual que antes, y además sin el plan de Apple
-- que se renueva solo.
create or replace function public.hay_avisos_vence()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.coach_billing b
     where b.plan <> 'cortesia' and coalesce(b.mp_status, '') <> 'authorized' and not b.apple_renueva
       and public.coach_vence(b) > now() and public.coach_vence(b) <= now() + interval '24 hours'
       and b.aviso_vence_para is distinct from public.coach_vence(b));
$$;

create or replace function public.tomar_avisos_vence()
returns table (coach_id uuid, vence timestamptz, prueba boolean, clientes integer)
language plpgsql security definer set search_path = public as $$
begin
  return query
  update public.coach_billing b
     set aviso_vence_para = public.coach_vence(b)
   where b.plan <> 'cortesia' and coalesce(b.mp_status, '') <> 'authorized' and not b.apple_renueva
     and public.coach_vence(b) > now() and public.coach_vence(b) <= now() + interval '24 hours'
     and b.aviso_vence_para is distinct from public.coach_vence(b)
  returning b.coach_id, b.aviso_vence_para, (b.paid_until is null or b.trial_ends_at >= b.paid_until),
            (select count(*)::int from public.profiles x where x.coach_id = b.coach_id);
end $$;

revoke execute on function public.hay_avisos_vence() from public, anon, authenticated;
revoke execute on function public.tomar_avisos_vence() from public, anon, authenticated;
grant execute on function public.tomar_avisos_vence() to service_role;

notify pgrst, 'reload schema';
