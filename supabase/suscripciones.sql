-- Suscripción de los coaches: 14 días de prueba y después un plan mensual por
-- Mercado Pago, que define cuántos clientes puede tener.
-- Correr UNA vez en Supabase → SQL Editor.
-- OJO: NO volver a correr suelto. Redefine coach_active, y la versión vigente (que además
-- mira el cupo del plan) está en cupo-plan.sql. También join_coach, cuya versión vigente (con
-- tope de códigos equivocados, de coach-alumnos.sql, y sin vincular si uno bloqueó al otro) está
-- en bloqueos.sql. Si lo corrés, corré después cupo-plan.sql, coach-alumnos.sql y bloqueos.sql.
--
--   Prueba           14 días, hasta 10 clientes, gratis
--   Plan 10          hasta 10 clientes, $14.900 por mes
--   Plan 25          hasta 25 clientes, $24.900 por mes
--   Plan 50          hasta 50 clientes, $37.900 por mes
--   Gimnasio chico   hasta 100 alumnos, $59.900 por mes (p100, ver plan-gimnasio.sql)
--   Gimnasio         hasta 250 alumnos, $119.900 por mes (p250, ver precios-2026-10.sql)
--   Gimnasio grande  hasta 500 alumnos, $199.900 por mes (p500, ver precios-2026-10.sql)
--   Más de 500       a medida (se arregla por WhatsApp)
--   Cortesía         sin vencimiento, hasta 50 clientes (se pone a mano, ver abajo)
--
-- Los precios están en la función supabase/functions/suscripcion (PLANES), en plan_price
-- (admin.sql): si se cambian, cambiarlos ahí, en app/screens/coach/plan.js, admin/admin.js y
-- en la landing.
--
-- Qué se controla acá, en la base (no solo en la app):
--   · Un coach sin prueba ni plan vigente no puede leer ni editar los datos de sus
--     clientes (is_my_client da false). Sus clientes siguen usando la app normalmente.
--   · Nadie se puede vincular a un coach sin plan vigente o que ya llegó al máximo.
--   · La tabla coach_billing la escribe solo la función de Mercado Pago (service role);
--     desde la app el coach solo puede leer la suya.
--
-- Dar un plan de cortesía (sin pagar) a un coach:
--   update public.coach_billing set plan = 'cortesia', max_clients = 50
--    where coach_id = (select id from auth.users where email = 'mail@delcoach.com');

create table if not exists public.coach_billing (
  coach_id          uuid primary key references public.profiles(id) on delete cascade,
  plan              text not null default 'trial' check (plan in ('trial','p10','p25','p50','p100','p250','p500','cortesia')),
  max_clients       int  not null default 10,
  trial_ends_at     timestamptz not null default now() + interval '14 days',
  paid_until        timestamptz,             -- pagado hasta (con unos días de margen)
  mp_preapproval_id text,                    -- suscripción vigente en Mercado Pago
  mp_status         text,                    -- pending / authorized / paused / cancelled
  pending_plan      text,                    -- plan elegido que todavía no se pagó
  updated_at        timestamptz not null default now()
);

alter table public.coach_billing enable row level security;
drop policy if exists "billing: el coach ve la suya" on public.coach_billing;
create policy "billing: el coach ve la suya" on public.coach_billing
  for select using (coach_id = auth.uid());
-- Sin políticas de insert/update/delete: desde la app no se puede tocar.

-- ¿El coach tiene prueba o plan vigente?
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
       and (b.plan = 'cortesia' or b.trial_ends_at > now() or coalesce(b.paid_until, '-infinity') > now())
  );
$$;

-- is_my_client (ver base.sql) ahora además pide que el coach esté al día: todas las
-- políticas del lado del coach (leer registros, editar rutina, fotos…) pasan por acá.
create or replace function public.is_my_client(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = target and coach_id = auth.uid()
  ) and public.coach_active(auth.uid());
$$;

-- Prueba gratis automática al crear una cuenta de coach.
create or replace function public.coach_billing_on_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'coach' then
    insert into public.coach_billing (coach_id) values (new.id) on conflict (coach_id) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists profiles_coach_billing on public.profiles;
create trigger profiles_coach_billing after insert on public.profiles
  for each row execute function public.coach_billing_on_profile();

-- Los coaches que ya existían arrancan su prueba de 14 días hoy.
insert into public.coach_billing (coach_id)
select id from public.profiles where role = 'coach'
on conflict (coach_id) do nothing;

-- Vincularse a un coach con su código: ahora también chequea el plan y el cupo.
-- Los errores salen con un mensaje que la app le muestra al cliente tal cual.
-- (Versión vieja: la vigente, con tope de códigos equivocados, está en coach-alumnos.sql.)
create or replace function public.join_coach(code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare cid uuid; lim int; n int;
begin
  if auth.uid() is null then return false; end if;
  -- Un coach no se vincula a otro coach: el otro vería y editaría su rutina.
  if exists (select 1 from profiles where id = auth.uid() and role = 'coach') then return false; end if;
  select id into cid from profiles where invite_code = upper(trim(code)) and role = 'coach';
  if cid is null or cid = auth.uid() then return false; end if;
  if exists (select 1 from profiles where id = auth.uid() and coach_id = cid) then return true; end if;
  if not public.coach_active(cid) then
    raise exception 'Tu coach tiene el plan de GIZE vencido. Avisale para que lo renueve y volvé a intentar.' using errcode = 'P0001';
  end if;
  -- Bloquea la fila del coach: dos clientes a la vez no pasan el cupo.
  select max_clients into lim from coach_billing where coach_id = cid for update;
  select count(*) into n from profiles where coach_id = cid;
  if n >= coalesce(lim, 10) then
    raise exception 'Tu coach llegó al máximo de clientes de su plan. Avisale para que lo amplíe y volvé a intentar.' using errcode = 'P0001';
  end if;
  update profiles set coach_id = cid where id = auth.uid();
  return true;
end $$;

revoke execute on function public.coach_active(uuid) from public, anon;
grant  execute on function public.coach_active(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
