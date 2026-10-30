-- Cobro con Google Play en la app de Android: planes de coach e IA Plus comprados con la facturación
-- de Google Play (suscripciones mensuales que se renuevan solas). Es SOLO LA BASE: aplicarlo no
-- cambia nada de lo que ve nadie. Las compras las guarda la función supabase/functions/compras-google
-- (con la service role); mientras no esté publicada, nada escribe acá.
-- ARRANCA APAGADO: el interruptor (app_config «compras_google») nace con los planes y con IA Plus
-- en «apagado», y volver a correr el archivo no lo pisa. Se cambia desde gize.ar/admin → Coaches y
-- pagos (admin_compras_google).
-- Correr con el workflow "Supabase" → tarea sql → supabase/compras-google.sql, después de
-- supabase/suscripciones.sql, supabase/admin.sql, supabase/compras-apple.sql,
-- supabase/cuentas-prueba.sql y supabase/ia.sql (la versión con IA Plus de Google Play: correr
-- ia.sql antes que este). Se puede correr varias veces. Sin esos archivos falla entero, sin cambiar
-- nada (lo primero del archivo lo controla).
--
-- Qué suma:
--   1) google_subs: una fila por compra de Google Play (purchase_token, el código de la compra), con
--      la cuenta de GIZE que la compró, el producto vigente, el número del pedido (GPA.…), la compra
--      que reemplazó (linked_token: al cambiar de plan o volver a suscribirse), el estado, hasta
--      cuándo cubre, si se renueva sola, si es de prueba (las cuentas de prueba de licencias de
--      Google no pagan), si Google la reembolsó o la anuló (revoked), si ya se reconoció
--      (acknowledged: si no se reconoce en 3 días, Google devuelve la plata) y si otra compra la
--      reemplazó. leido_at es cuándo se leyó de la API de Google: una lectura más vieja no pisa una
--      más nueva. Solo la usa la función (service role): sin políticas ni permisos, desde la app
--      nadie la lee ni la escribe.
--   2) coach_billing: google_token (la compra de Google Play vigente del coach), google_vence (hasta
--      cuándo la cubre Google) y google_renueva (se renueva sola). Como con Apple, la función pone el
--      plan, el tope de alumnos y paid_until, así coach_active y el resto siguen igual. Lo pagado
--      «viene de Google» si paid_until no pasa de google_vence. El coach lee su fila con la política
--      de siempre (la app necesita google_token para cambiar de plan). Las columnas de Mercado Pago
--      y de Apple no se tocan.
--   3) El interruptor, uno para los planes de coach y otro para IA Plus: {planes, plus}, cada uno
--      'apagado', 'prueba' (solo las cuentas marcadas como de prueba en el panel, test_accounts) o
--      'todos'. La app no lo lee de app_config (la política «config pública» sigue dejando leer solo
--      'version'): pregunta compras_google().
--   4) compras_google(): para la app, con sesión: {planes, plus} en true o false para quien llama.
--   5) admin_compras_google(p): para el panel. Con p cambia el interruptor (queda en el registro de
--      acciones); siempre devuelve el interruptor, el estado (app_config «compras_google_estado»:
--      el último aviso de Google Play y el último error de permisos, lo escribe la función), un
--      resumen y la lista de las compras de los últimos 60 días (o pendientes), sin el código de la
--      compra.
-- IA Plus con Google Play va en supabase/ia.sql (columnas google_* de ia_plus y sus funciones).
--
-- OJO (lo que NO se toca acá, a propósito; lo hacen las ramas que siguen):
--   · El mail «tu plan vence mañana»: hay_avisos_vence y tomar_avisos_vence quedan como están (la
--     vigente es la de compras-apple.sql, o la de gimnasios-admin.sql con los gimnasios); a quien
--     Google le renueva el plan solo lo saltea la función vence-plan.
--   · Borrar la cuenta (delete_own_account): la renovación de Google la cancelan la función
--     borrar-audios y el panel antes de borrar.
--   · admin_coaches: la lista de las compras de Google Play va en admin_compras_google.
--   · gimnasios-admin.sql: transferir y convertir un gimnasio frenan si el dueño nuevo tiene una
--     suscripción de Mercado Pago o de Apple que se renueva, pero todavía no miran la de Google.
--
-- Para volver atrás: el bloque comentado del final.


-- ===== Antes que nada: ¿están los archivos anteriores? =====

do $$ begin
  if to_regclass('public.coach_billing') is null or to_regclass('public.app_config') is null
     or to_regclass('public.apple_subs') is null or to_regclass('public.test_accounts') is null
     or to_regprocedure('public.admin_assert()') is null or to_regprocedure('public.admin_log(text, text, jsonb)') is null
     or not exists (select 1 from pg_attribute where attrelid = to_regclass('public.ia_plus') and attname = 'google_vence' and not attisdropped) then
    raise exception 'Primero correr supabase/suscripciones.sql, supabase/admin.sql, supabase/compras-apple.sql, supabase/cuentas-prueba.sql y supabase/ia.sql: este archivo usa sus tablas y funciones.';
  end if;
end $$;


-- ===== 1) Las compras de Google Play =====

create table if not exists public.google_subs (
  purchase_token text primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  product_id     text not null,                     -- la línea vigente de la compra
  order_id       text,                              -- el número del pedido (GPA.…)
  linked_token   text,                              -- la compra que esta reemplazó
  estado         text not null check (estado in ('activa', 'gracia', 'espera', 'pausada', 'cancelada', 'vencida', 'pendiente', 'pendiente_cancelada')),
  expires_at     timestamptz,
  auto_renew     boolean,
  test           boolean not null default false,
  revoked        boolean not null default false,
  acknowledged   boolean not null default false,
  reemplazada    boolean not null default false,
  leido_at       timestamptz not null,
  updated_at     timestamptz not null default now()
);
create index if not exists google_subs_user_idx on public.google_subs (user_id);
create index if not exists google_subs_linked_idx on public.google_subs (linked_token);
alter table public.google_subs enable row level security;
revoke all on public.google_subs from public, anon, authenticated;
grant select, insert, update, delete on public.google_subs to service_role;


-- ===== 2) El plan del coach comprado con Google Play =====

alter table public.coach_billing add column if not exists google_token text;
alter table public.coach_billing add column if not exists google_vence timestamptz;
alter table public.coach_billing add column if not exists google_renueva boolean not null default false;


-- ===== 3) El interruptor =====

insert into public.app_config (key, value) values ('compras_google', '{"planes": "apagado", "plus": "apagado"}')
  on conflict (key) do nothing;

-- El interruptor como está guardado, con «apagado» en lo que falte o no se entienda. Interna.
create or replace function public.compras_google_config()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'planes', case when x.v ->> 'planes' in ('apagado', 'prueba', 'todos') then x.v ->> 'planes' else 'apagado' end,
    'plus', case when x.v ->> 'plus' in ('apagado', 'prueba', 'todos') then x.v ->> 'plus' else 'apagado' end)
    from (select coalesce((select c.value from public.app_config c where c.key = 'compras_google' and jsonb_typeof(c.value) = 'object'), '{}'::jsonb) v) x
$$;
revoke all on function public.compras_google_config() from public, anon, authenticated;


-- ===== 4) La app =====

-- ¿Se vende con Google Play a quien llama? {planes, plus}: «todos», sí; «prueba», solo si su cuenta
-- está marcada como de prueba; «apagado», no. Solo lo pregunta la app de Android (al abrir Mi plan
-- o la oferta de IA Plus).
create or replace function public.compras_google()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'planes', case x.c ->> 'planes' when 'todos' then true when 'prueba' then x.prueba else false end,
    'plus', case x.c ->> 'plus' when 'todos' then true when 'prueba' then x.prueba else false end)
    from (select public.compras_google_config() c,
                 exists (select 1 from public.test_accounts t where t.user_id = auth.uid()) prueba) x
$$;
revoke all on function public.compras_google() from public, anon;
grant execute on function public.compras_google() to authenticated;


-- ===== 5) El panel =====

-- Con p ({planes, plus}, solo lo que cambia, con 'apagado', 'prueba' o 'todos'): lo mezcla con lo
-- guardado y queda en el registro de acciones. Con o sin p devuelve:
--   { config (el interruptor), estado (lo último que anotó la función: el último aviso de Google
--     Play y el último error de permisos; null si nunca anotó nada), resumen { activas (dan el plan
--     o IA Plus ahora: sin reemplazar ni reembolsar), renuevan, prueba }, lista (las compras con
--     algo en los últimos 60 días o pendientes, hasta 300, de la más reciente a la más vieja) }.
create or replace function public.admin_compras_google(p jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare antes jsonb; nuevo jsonb;
begin
  perform public.admin_assert();
  if p is not null then
    if jsonb_typeof(p) <> 'object' or p = '{}'::jsonb
       or exists (select 1 from jsonb_each(p) e where e.key not in ('planes', 'plus') or jsonb_typeof(e.value) <> 'string'
                     or (e.value #>> '{}') not in ('apagado', 'prueba', 'todos')) then
      raise exception 'Revisá el cobro con Google Play: planes o plus, con apagado, prueba o todos.' using errcode = '22023';
    end if;
    -- Dos cambios a la vez no se pisan: el segundo espera y mezcla con lo que dejó el primero.
    perform 1 from public.app_config c where c.key = 'compras_google' for update;
    antes := public.compras_google_config();
    nuevo := antes || p;
    insert into public.app_config (key, value, updated_at) values ('compras_google', nuevo, now())
      on conflict (key) do update set value = excluded.value, updated_at = now();
    perform public.admin_log('compras_google', null, jsonb_build_object('antes', antes, 'ahora', nuevo));
  end if;
  return jsonb_build_object(
    'config', public.compras_google_config(),
    'estado', (select c.value from public.app_config c where c.key = 'compras_google_estado'),
    'resumen', (select jsonb_build_object(
        'activas', count(*) filter (where x.vigente),
        'renuevan', count(*) filter (where x.vigente and x.estado in ('activa', 'gracia') and coalesce(x.auto_renew, false)),
        'prueba', count(*) filter (where x.vigente and x.test))
      from (select s.*, (not s.reemplazada and not s.revoked and s.estado in ('activa', 'gracia', 'cancelada')
                         and coalesce(s.expires_at, '-infinity') > now()) as vigente
              from public.google_subs s) x),
    'lista', coalesce((select jsonb_agg(to_jsonb(y) order by y.actualizada desc) from (
        select s.user_id, u.email, p.full_name as nombre, s.product_id as producto, s.order_id as pedido, s.estado,
               s.expires_at as hasta, coalesce(s.auto_renew, false) as renueva, s.test as prueba, s.revoked as revocada,
               s.reemplazada, s.acknowledged as reconocida, s.updated_at as actualizada
          from public.google_subs s
          left join auth.users u on u.id = s.user_id
          left join public.profiles p on p.id = s.user_id
         where greatest(s.expires_at, s.updated_at) > now() - interval '60 days' or s.estado = 'pendiente'
         order by s.updated_at desc
         limit 300) y), '[]'::jsonb));
end $$;
revoke all on function public.admin_compras_google(jsonb) from public, anon;
grant execute on function public.admin_compras_google(jsonb) to authenticated;

notify pgrst, 'reload schema';


-- ===== Para volver atrás =====
-- Correr esto sin los «-- ». Solo si nadie compró con Google Play: se borra de quién es cada compra
-- y hasta cuándo la cubre Google (el plan que ya tenga cada coach en coach_billing queda como está).
-- Antes, sacar la función compras-google y volver a la app sin el cobro de Google Play.
--
-- drop function if exists public.admin_compras_google(jsonb), public.compras_google(), public.compras_google_config();
-- drop table if exists public.google_subs;
-- alter table public.coach_billing drop column if exists google_token, drop column if exists google_vence,
--   drop column if exists google_renueva;
-- delete from public.app_config where key in ('compras_google', 'compras_google_estado');
-- notify pgrst, 'reload schema';
