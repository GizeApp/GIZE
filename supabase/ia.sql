-- IA con los créditos de API de Anthropic que trae el plan Max: la guardia de gasto, el
-- interruptor y lo que muestra el panel (gize.ar/admin → IA).
-- La única que llama a la API es la función «ia» (supabase/functions/ia), con la service role:
-- antes de cada llamada reserva lo máximo que podría costar (ia_reservar) y después anota lo que
-- costó de verdad (ia_cerrar). Nadie más puede reservar, cerrar ni cortar.
-- ARRANCA APAGADA: ia_config.activa = false y cada función en false. Sin la fecha en que vencen
-- los créditos (el ancla, que se carga en el panel) tampoco se gasta nada.
--
-- Esta cuenta propia es la tercera pared. Las otras dos no dependen de este código: la
-- organización de la Console no tiene tarjeta ni créditos comprados (cuando se terminan los
-- créditos, la API deja de responder y no cobra) y tiene límites de gasto propios (organización y
-- workspace «gize-produccion»). Esos límites se reinician el día 1 de cada mes a las 00:00 UTC;
-- los créditos y esta cuenta, con cada ciclo de facturación (el ancla).
--
-- Ciclos: cada uno va de un vencimiento de los créditos al siguiente, siempre calculado desde el
-- ancla (con ancla el 31/01, los fines son 28/02, 31/03, 30/04…). Umbrales de cada ciclo: aviso en
-- el panel a los US$100, modo ahorro a los US$150 y corte a los US$180 (de US$200).
-- Códigos que devuelve ia_reservar (y la función, con el mismo nombre): pausada (motivo: apagada,
-- sin_ciclo, creditos, admin), tope_mes, ahorro, tope_semana (IA Plus prendido: se terminaron las
-- fotos gratis de la semana), ritmo, tope_dia, tope_persona, error.
--
-- La app (foto del plato) pregunta ia_mi_estado() para saber si muestra
-- los botones, guarda el permiso con ia_permiso() y los avisos de «¿Está mal?» con ia_reportar().
--
-- Correr con el workflow "Supabase" → tarea sql → supabase/ia.sql, después de
-- supabase/admin.sql, supabase/cupo-plan.sql y supabase/pedidos-productos.sql (las columnas ai_*
-- de los pedidos); food_entries es de supabase/base.sql. Se puede correr varias veces. Usa
-- pg_cron (como descanso.sql).
--
-- IA Plus (también ARRANCA APAGADO, ia_config.plus.activa): con el interruptor prendido, la foto del
-- plato es gratis hasta 3 fotos por semana; IA Plus (Mercado Pago en la web, Apple en el iPhone, o
-- incluido con el plan del coach) la deja sin límite semanal, con sus propios topes: hasta 10 fotos
-- por día y US$1,50 por persona por ciclo (ia_config.topes.plus; tabla ia_plus y «IA Plus» más
-- abajo). Lo escriben las funciones «suscripcion» y «compras-apple».
--
-- IA del coach («Pasar mis planillas» y «Armar con IA»; también ARRANCA APAGADA: funciones.planilla
-- y funciones.rutina en false): usan la misma guardia, con el rol que da ia_rol_coach ('coach' con
-- plan o profe de gimnasio, 'prueba' en la prueba gratis, con topes propios más chicos).

-- ---------- configuración (una sola fila) ----------
create table if not exists public.ia_config (
  id            int primary key default 1 check (id = 1),
  activa        boolean not null default false,
  funciones     jsonb not null default '{"etiqueta_admin":false,"etiqueta_usuario":false,"plato":false,"texto":false,"rutina":false,"resumen":false,"planilla":false}',
  -- Modelo elegido para cada función. Vacío: el de la función (supabase/functions/ia/precios.ts,
  -- que es la única lista de modelos; uno que no esté ahí no se usa).
  modelos       jsonb not null default '{}',
  topes         jsonb not null default '{"alumno":{"etiqueta":10,"plato":8,"texto":15,"total":25,"usd_ciclo":0.5},"coach":{"etiqueta":10,"plato":8,"texto":15,"rutina":15,"resumen":3,"planilla":30,"total":60,"usd_ciclo":5},"prueba":{"planilla":15,"rutina":5,"total":20,"usd_ciclo":1},"admin":{"etiqueta":300,"total":300,"usd_ciclo":10},"plus":{"plato":10,"usd_ciclo":1.5}}',
  ancla         timestamptz,            -- un vencimiento de los créditos, a las 00:00 UTC
  pedidos_desde timestamptz,            -- desde cuándo se leen pedidos con IA (cambio de la política)
  aviso_version int not null default 1, -- versión del aviso de permiso de la app
  updated_at    timestamptz not null default now()
);
alter table public.ia_config alter column activa set default false;
insert into public.ia_config (id) values (1) on conflict (id) do nothing;
-- IA Plus (foto del plato sin el límite semanal, ver «IA Plus» más abajo):
-- activa (el interruptor del panel; ARRANCA APAGADO y, apagado, no hay límite semanal: como hasta
-- ahora), gratis_semana (fotos gratis por semana), precio_ars (el precio por mes de la web con
-- Mercado Pago: $3.900, lo decidió el dueño; se cambia en el panel) y precio_confirmado (sin
-- precio confirmado no se prende; se confirma solo al guardar un precio desde el panel).
alter table public.ia_config add column if not exists plus jsonb not null default '{"activa":false,"gratis_semana":3,"precio_ars":3900,"precio_confirmado":true}';
-- En una base donde ya estaba con los $3.900 sin confirmar (versión anterior de este archivo), queda
-- confirmado: es el precio que eligió el dueño. Un precio guardado desde el panel no se toca.
update public.ia_config set plus = jsonb_set(plus, '{precio_confirmado}', 'true'::jsonb)
 where id = 1 and (plus ->> 'precio_ars')::numeric = 3900 and coalesce((plus ->> 'precio_confirmado')::boolean, false) is not true;
-- Los topes de quien tiene IA Plus (comprado o incluido): fotos del plato por día y US$ por ciclo.
-- Valen el mayor entre estos y los de su rol (un coach sigue con sus US$5). Se cambian en el panel
-- (IA → Topes → Con IA Plus). En una base que ya tenía la configuración, se suman una sola vez.
alter table public.ia_config alter column topes set default '{"alumno":{"etiqueta":10,"plato":8,"texto":15,"total":25,"usd_ciclo":0.5},"coach":{"etiqueta":10,"plato":8,"texto":15,"rutina":15,"resumen":3,"planilla":30,"total":60,"usd_ciclo":5},"prueba":{"planilla":15,"rutina":5,"total":20,"usd_ciclo":1},"admin":{"etiqueta":300,"total":300,"usd_ciclo":10},"plus":{"plato":10,"usd_ciclo":1.5}}';
update public.ia_config set topes = topes || '{"plus":{"plato":10,"usd_ciclo":1.5}}' where id = 1 and not (topes ? 'plus');
-- IA del coach: la función «planilla» (pasar las planillas del coach a rutinas de GIZE, ARRANCA
-- APAGADA), las planillas por día del coach y el rol «prueba» (coach en su prueba gratis: 15
-- planillas y 5 rutinas por día, 20 en total y US$1 por ciclo). En una base que ya tenía la
-- configuración se suman una sola vez y no pisan lo que el dueño cambió en el panel. El total por
-- día del coach pasa de 40 a 60 solo si seguía en 40, y solo esa vez (cuando todavía no tenía
-- planillas): si después el dueño lo vuelve a 40, correr esto de nuevo no lo cambia.
alter table public.ia_config alter column funciones set default '{"etiqueta_admin":false,"etiqueta_usuario":false,"plato":false,"texto":false,"rutina":false,"resumen":false,"planilla":false}';
update public.ia_config set funciones = funciones || '{"planilla":false}' where id = 1 and not (funciones ? 'planilla');
update public.ia_config
   set topes = jsonb_set(topes, '{coach}', (topes -> 'coach') || '{"planilla":30}'::jsonb
                 || case when (topes #>> '{coach,total}')::numeric = 40 then '{"total":60}'::jsonb else '{}'::jsonb end)
 where id = 1 and jsonb_typeof(topes -> 'coach') = 'object' and not (topes -> 'coach' ? 'planilla');
update public.ia_config set topes = jsonb_set(topes, '{coach,rutina}', '15') where id = 1 and jsonb_typeof(topes -> 'coach') = 'object' and not (topes -> 'coach' ? 'rutina');
update public.ia_config set topes = topes || '{"prueba":{"planilla":15,"rutina":5,"total":20,"usd_ciclo":1}}' where id = 1 and not (topes ? 'prueba');
-- Versión 2 del aviso (app/ui/ia-permiso.js): la app ya no manda texto, solo la foto (se sacó la
-- aclaración «¿Qué es?»). Quien aceptó la versión 1 lo vuelve a ver una vez. Solo sube, nunca baja:
-- se puede correr de nuevo sin volver a preguntar.
update public.ia_config set aviso_version = 2 where id = 1 and aviso_version < 2;

-- ---------- ciclos de los créditos ----------
create table if not exists public.ia_ciclos (
  id          bigint generated always as identity primary key,
  inicio      timestamptz not null unique,
  fin         timestamptz not null check (fin > inicio),
  credito     numeric(8,2) not null default 200,
  aviso       numeric(8,2) not null default 100,
  ahorro      numeric(8,2) not null default 150,
  tope        numeric(8,2) not null default 180,
  gastado     numeric(12,6) not null default 0,
  reservado   numeric(12,6) not null default 0,
  estado      text not null default 'normal' check (estado in ('normal', 'ahorro', 'cortado')),
  cortado_por text check (cortado_por in ('tope', 'creditos', 'limite_console', 'admin')),
  vuelve      timestamptz,
  aviso_at    timestamptz,
  ahorro_at   timestamptz,
  cortado_at  timestamptz
);
-- Cuántas veces frenó la guardia en el ciclo, por código (tope_dia, ritmo, ahorro, tope_mes,
-- tope_persona, pausada): esas llamadas no llegan a ia_llamadas.
alter table public.ia_ciclos add column if not exists frenos jsonb not null default '{}';

-- ---------- cada uso de la IA ----------
-- Sin datos de la persona más que su id (para los topes), que se borra a los 90 días.
create table if not exists public.ia_llamadas (
  id          bigint generated always as identity primary key,
  ciclo_id    bigint not null references public.ia_ciclos(id),
  user_id     uuid references auth.users(id) on delete set null,
  rol         text not null check (rol in ('alumno', 'coach', 'admin', 'prueba')),
  funcion     text not null check (funcion in ('etiqueta', 'plato', 'texto', 'rutina', 'resumen', 'planilla')),
  modelo      text not null,
  estado      text not null default 'reservada' check (estado in ('reservada', 'ok', 'vacia', 'error', 'vencida')),
  codigo      text,
  max_usd     numeric(10,6) not null,
  usd         numeric(10,6),           -- null: no se sabe (se cobra max_usd)
  in_tok      int,
  out_tok     int,
  cache_w_tok int,
  cache_r_tok int,
  ms          int,
  pedido_id   bigint,
  creada      timestamptz not null default now(),
  cerrada     timestamptz
);
-- De dónde salió el rol «coach» de esa llamada (para el panel): 'plan' (su plan de coach) o
-- 'gimnasio' (profe de un gimnasio, sin plan propio: ver ia_rol_origen). null en el resto.
alter table public.ia_llamadas add column if not exists origen text check (origen is null or origen in ('plan', 'gimnasio'));
create index if not exists ia_llamadas_user on public.ia_llamadas(user_id, creada);
create index if not exists ia_llamadas_ciclo on public.ia_llamadas(ciclo_id, creada);
create index if not exists ia_llamadas_abiertas on public.ia_llamadas(creada) where estado = 'reservada';

-- ---------- permisos de cada persona (los pide la app desde la etapa 2) ----------
-- Si alguien apaga la IA en Ajustes, tampoco se lee con IA la foto de sus pedidos.
create table if not exists public.ia_permisos (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  comida_ok_at timestamptz,
  comida_no_at timestamptz,
  coach_ok_at  timestamptz,
  coach_no_at  timestamptz,
  version      int not null default 1,
  updated_at   timestamptz not null default now()
);

-- ---------- «¿Está mal? Avisanos» (foto del plato y «Contame qué comiste») ----------
-- Lo que estimó la IA y el comentario de la persona, sin la foto. Se escribe solo con
-- ia_reportar(); lo lee el equipo de GIZE. Se borra a los 180 días (ia_limpiar) o con la cuenta.
create table if not exists public.ia_reportes (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users(id) on delete cascade,
  funcion    text not null check (funcion in ('plato', 'texto')),
  respuesta  jsonb not null,
  comentario text check (comentario is null or char_length(comentario) <= 300),
  creada     timestamptz not null default now()
);
create index if not exists ia_reportes_creada on public.ia_reportes(creada);
create index if not exists ia_reportes_user on public.ia_reportes(user_id, creada);

-- Las listas de los checks de ia_llamadas (rol y función). En una base que ya tenía la tabla, el
-- create table de arriba no las cambia: cada check se busca por la columna que controla (en
-- pg_constraint, no por su nombre, que en la base de verdad puede ser otro) y, si no tiene la
-- lista de ahora, se cambia por uno con la lista nueva. Si ya la tiene no se toca (correrlo de
-- nuevo no vuelve a revisar la tabla).
do $$
declare v_x record; v_sobran text[]; v_esta boolean; v_n text;
begin
  for v_x in select * from (values
      ('ia_llamadas', 'rol', array['alumno', 'coach', 'admin', 'prueba']),
      ('ia_llamadas', 'funcion', array['etiqueta', 'plato', 'texto', 'rutina', 'resumen', 'planilla'])) x(tabla, col, lista) loop
    select coalesce(array_agg(k.conname) filter (where not k.igual), '{}'), coalesce(bool_or(k.igual), false) into v_sobran, v_esta
      from (select c.conname, (y.vals @> v_x.lista and y.vals <@ v_x.lista) as igual
              from pg_constraint c
              join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
              cross join lateral (select array(select m[1] from regexp_matches(pg_get_constraintdef(c.oid), '''([^'']*)''', 'g') m) as vals) y
             where c.conrelid = format('public.%I', v_x.tabla)::regclass and c.contype = 'c'
               and cardinality(c.conkey) = 1 and a.attname = v_x.col) k;
    foreach v_n in array v_sobran loop
      execute format('alter table public.%I drop constraint %I', v_x.tabla, v_n);
    end loop;
    if not v_esta then
      execute format('alter table public.%I add constraint %I check (%I in (%s))', v_x.tabla, v_x.tabla || '_' || v_x.col || '_check', v_x.col,
                     (select string_agg(quote_literal(v), ', ') from unnest(v_x.lista) v));
    end if;
  end loop;
end $$;

-- Lo anotado en el diario con la foto del plato o con «Contame qué comiste»: «ia» tal como lo
-- estimó, «ia-editado» si la persona cambió los gramos o el alimento. Lo escribe la app con
-- las políticas de siempre de food_entries.
alter table public.food_entries add column if not exists fuente text check (fuente is null or fuente in ('ia', 'ia-editado'));

-- ---------- IA Plus: quién lo pagó y hasta cuándo ----------
-- Una fila por persona que alguna vez lo compró (o se lo dio el equipo de GIZE). Cada medio de
-- pago tiene sus columnas y ninguno pisa al otro: lo vigente es lo que llegue más lejos
-- (ia_plus_hasta). La escriben solo la función «suscripcion» (Mercado Pago, en la web), la función
-- «compras-apple» (App Store, en el iPhone) y el panel (admin_ia_plus_dar / _quitar).
--   mp_*: la suscripción de Mercado Pago vigente (mp_preapproval_id), la que pidió y todavía no
--     cobró (mp_pending_id), su estado, desde cuándo cobra (mp_desde, para el botón de
--     arrepentimiento), hasta cuándo cubre (mp_hasta, con 3 días de margen como el plan de coach)
--     y el último cobro aprobado (mp_pago_id, el que se devuelve con el arrepentimiento, y de qué
--     suscripción es: mp_pago_pa).
--   arrepentido_at: se arrepintió de la suscripción vigente (se borra con una nueva);
--     ultimo_arrepentido_at y arrepentimientos no se borran nunca: con un arrepentimiento en los
--     últimos 60 días no se puede volver a suscribir por Mercado Pago (función suscripcion).
--   apple_*: la suscripción de Apple (original_transaction_id, ver apple_subs de compras-apple.sql),
--     hasta cuándo cubre (vencimiento, período de gracia o fecha del reembolso) y si se renueva.
--   manual_*: IA Plus dado a mano por soporte, hasta una fecha.
-- Los alumnos de un coach con plan pago (o de cortesía) y los coaches con plan lo tienen incluido
-- sin fila (ia_plus_info).
create table if not exists public.ia_plus (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  mp_preapproval_id text,
  mp_pending_id     text,
  mp_status         text,
  mp_desde          timestamptz,
  mp_hasta          timestamptz,
  mp_pago_id        text,
  apple_original_tx text,
  apple_vence       timestamptz,
  apple_renueva     boolean not null default false,
  manual_hasta      timestamptz,
  manual_nota       text check (manual_nota is null or char_length(manual_nota) <= 200),
  arrepentido_at    timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
alter table public.ia_plus add column if not exists mp_pago_pa text;
alter table public.ia_plus add column if not exists ultimo_arrepentido_at timestamptz;
alter table public.ia_plus add column if not exists arrepentimientos int not null default 0;
create index if not exists ia_plus_pago on public.ia_plus(mp_pago_id);

-- ---------- Botón de arrepentimiento y botón de baja, sin iniciar sesión ----------
-- La página gize.ar/baja/ (enlazada desde el pie de la página de inicio, sin registrarse: Res.
-- 424/2020 y la del botón de baja) manda el pedido a la función «suscripcion» (?pedido=1), que lo
-- guarda acá con un código, se lo muestra a la persona y avisa a los socios. No cancela nada solo
-- (cualquiera puede escribir un mail): los socios lo hacen y lo marcan como atendido en el panel.
-- Vale para IA Plus y para los planes de coach pagados en la web. La fecha del pedido es la que
-- cuenta para los 10 días del arrepentimiento.
create table if not exists public.pedidos_baja (
  id          bigserial primary key,
  codigo      text not null unique,
  tipo        text not null check (tipo in ('arrepentimiento', 'baja')),
  servicio    text not null check (servicio in ('iaplus', 'coach')),
  email       text not null check (char_length(email) <= 320),
  detalle     text check (detalle is null or char_length(detalle) <= 500),
  user_id     uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  atendido_at timestamptz
);
create index if not exists pedidos_baja_email on public.pedidos_baja(lower(email), created_at);
create index if not exists ia_plus_mp on public.ia_plus(mp_preapproval_id);
create index if not exists ia_plus_apple on public.ia_plus(apple_original_tx);

-- ---------- RLS: nada se lee ni se escribe directo desde la app ----------
alter table public.ia_config enable row level security;
alter table public.ia_ciclos enable row level security;
alter table public.ia_llamadas enable row level security;
alter table public.ia_permisos enable row level security;
alter table public.ia_reportes enable row level security;
alter table public.ia_plus enable row level security;
alter table public.pedidos_baja enable row level security;
revoke all on public.ia_config from anon, authenticated;
revoke all on public.ia_ciclos from anon, authenticated;
revoke all on public.ia_llamadas from anon, authenticated;
revoke all on public.ia_permisos from anon, authenticated;
revoke all on public.ia_reportes from anon, authenticated;
revoke all on public.ia_plus from anon, authenticated;
revoke all on public.pedidos_baja from anon, authenticated;
grant select, insert, update on public.pedidos_baja to service_role;
grant usage on sequence public.pedidos_baja_id_seq to service_role;
grant select, insert, update, delete on public.ia_plus to service_role;
-- Cada uno puede ver su permiso (se escribe solo con ia_permiso()).
grant select on public.ia_permisos to authenticated;
drop policy if exists "ia_permisos: el mío" on public.ia_permisos;
create policy "ia_permisos: el mío" on public.ia_permisos for select to authenticated using (user_id = auth.uid());

-- ---------- ciclos ----------
-- El ciclo que contiene p_t, calculado siempre desde el ancla (nunca desde el ciclo anterior):
-- el k con ancla + (k−1) meses ≤ p_t < ancla + k meses. En UTC, así no depende de la zona de la sesión.
create or replace function public.ia_ciclo_de(p_ancla timestamptz, p_t timestamptz, out inicio timestamptz, out fin timestamptz)
language plpgsql stable set search_path = public as $$
declare a timestamp := p_ancla at time zone 'UTC'; t timestamp := p_t at time zone 'UTC'; k int;
begin
  k := (extract(year from t)::int - extract(year from a)::int) * 12 + (extract(month from t)::int - extract(month from a)::int);
  while a + make_interval(months => k) <= t loop k := k + 1; end loop;
  while a + make_interval(months => k - 1) > t loop k := k - 1; end loop;
  inicio := (a + make_interval(months => k - 1)) at time zone 'UTC';
  fin := (a + make_interval(months => k)) at time zone 'UTC';
end $$;
revoke all on function public.ia_ciclo_de(timestamptz, timestamptz) from public, anon, authenticated;

-- El ciclo de ahora, bloqueado hasta el final de la transacción. Lo crea si no está (los umbrales,
-- los del ciclo anterior). Dos llamadas a la vez justo después del cambio de ciclo crean uno solo
-- (el lock de la transacción y on conflict). Sin ancla devuelve null.
create or replace function public.ia_ciclo_tomar()
returns public.ia_ciclos language plpgsql security definer set search_path = public as $$
declare v_ancla timestamptz; v_ini timestamptz; v_fin timestamptz; v_prev public.ia_ciclos; v_c public.ia_ciclos;
begin
  perform pg_advisory_xact_lock(hashtext('ia_ciclo'));
  select ancla into v_ancla from public.ia_config where id = 1;
  if v_ancla is null then return null; end if;
  select x.inicio, x.fin into v_ini, v_fin from public.ia_ciclo_de(v_ancla, now()) x;
  select * into v_prev from public.ia_ciclos where inicio < v_ini order by inicio desc limit 1;
  insert into public.ia_ciclos (inicio, fin, credito, aviso, ahorro, tope)
  values (v_ini, v_fin, coalesce(v_prev.credito, 200), coalesce(v_prev.aviso, 100), coalesce(v_prev.ahorro, 150), coalesce(v_prev.tope, 180))
  on conflict (inicio) do nothing;
  select * into v_c from public.ia_ciclos where inicio = v_ini for update;
  return v_c;
end $$;
revoke all on function public.ia_ciclo_tomar() from public, anon, authenticated;

-- Medianoche de Buenos Aires (el «hoy» de los topes diarios y del ritmo).
create or replace function public.ia_hoy()
returns timestamptz language sql stable set search_path = public as $$
  select date_trunc('day', now() at time zone 'America/Argentina/Buenos_Aires') at time zone 'America/Argentina/Buenos_Aires';
$$;
revoke all on function public.ia_hoy() from public, anon, authenticated;

-- Suma una frenada de la guardia al ciclo (para el panel). La usa ia_reservar.
create or replace function public.ia_frenada(p_ciclo bigint, p_codigo text)
returns void language sql security definer set search_path = public as $$
  update public.ia_ciclos set frenos = jsonb_set(frenos, array[p_codigo], to_jsonb(coalesce((frenos ->> p_codigo)::int, 0) + 1)) where id = p_ciclo;
$$;
revoke all on function public.ia_frenada(bigint, text) from public, anon, authenticated;

-- Coach con plan pago o de cortesía (la prueba gratis no cuenta). Lo mismo que coach_active
-- (cupo-plan.sql) sin la prueba.
create or replace function public.coach_pago(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.coach_billing b
     where b.coach_id = cid
       and (b.plan = 'cortesia'
            or (coalesce(b.paid_until, '-infinity') > now()
                and (select count(*) from public.profiles x where x.coach_id = cid) <= coalesce(b.max_clients, 10))));
$$;
revoke all on function public.coach_pago(uuid) from public, anon, authenticated;
grant execute on function public.coach_pago(uuid) to service_role;

-- Por qué una persona usa la IA de la app con los topes de coach (decisión del dueño):
--   'plan'      es coach y tiene su plan pago o de cortesía (coach_pago);
--   'gimnasio'  no tiene plan propio, pero es profe de un gimnasio abierto cuyo plan (el del dueño)
--               está pago o es de cortesía. Cuenta como coach «por gimnasio»: el panel de la IA lo
--               muestra así y la app le avisa que sus límites son por su gimnasio. La prueba gratis
--               del gimnasio no cuenta, igual que la de un coach. Solo el rol «profe» (no la
--               administración ni la recepción).
--   null        ninguna de las dos: usa los topes de alumno.
-- Sin las tablas de gimnasios (antes de supabase/gimnasios.sql) solo mira el plan: plpgsql no
-- busca gym_staff hasta que llega a esa línea (por eso el control va en un if aparte).
create or replace function public.ia_rol_origen(p_uid uuid)
returns text language plpgsql stable security definer set search_path = public as $$
begin
  if exists (select 1 from public.profiles p where p.id = p_uid and p.role = 'coach') and public.coach_pago(p_uid) then
    return 'plan';
  end if;
  if to_regclass('public.gym_staff') is null or to_regclass('public.gyms') is null then
    return null;
  end if;
  if exists (select 1 from public.gym_staff s join public.gyms g on g.id = s.gym_id and g.closed_at is null
              where s.user_id = p_uid and s.left_at is null and s.role = 'profe' and public.coach_pago(g.owner_id)) then
    return 'gimnasio';
  end if;
  return null;
end $$;
revoke all on function public.ia_rol_origen(uuid) from public, anon, authenticated;
grant execute on function public.ia_rol_origen(uuid) to service_role;

-- Con qué topes usa la IA de la app cada persona: «coach» si es coach con plan pago o de
-- cortesía, o profe de un gimnasio con el plan al día («coach por gimnasio», ver ia_rol_origen);
-- si no, «alumno» (también quien no tiene coach).
create or replace function public.ia_rol(p_uid uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when public.ia_rol_origen(p_uid) is not null then 'coach' else 'alumno' end;
$$;
revoke all on function public.ia_rol(uuid) from public, anon, authenticated;
grant execute on function public.ia_rol(uuid) to service_role;

-- Con qué topes usa cada persona la IA del coach («Pasar mis planillas» y «Armar con IA»):
--   'coach'   lo mismo que ia_rol: coach con plan pago o de cortesía, o profe de un gimnasio con
--             el plan al día (ia_rol_origen);
--   'prueba'  coach en su prueba gratis (sin plan pago): topes propios, más chicos (topes.prueba),
--             y con el ciclo en modo ahorro no la usa;
--   null      no la puede usar: no es coach, o es coach sin plan ni prueba (también si pasó el cupo
--             de alumnos de la prueba, como en coach_active).
-- Las fotos de comida del coach siguen con ia_rol (en la prueba, 'alumno'): no se mezclan.
-- La prueba se mira con coach_active (la vigente es la de gimnasios-vinculo.sql; sin gimnasios, la
-- de cupo-plan.sql), que solo puede llamar la service role: esta también.
create or replace function public.ia_rol_coach(p_uid uuid)
returns text language plpgsql stable security definer set search_path = public as $$
begin
  if p_uid is null then return null; end if;
  if public.ia_rol_origen(p_uid) is not null then return 'coach'; end if;
  if exists (select 1 from public.profiles p join public.coach_billing b on b.coach_id = p.id
              where p.id = p_uid and p.role = 'coach' and b.trial_ends_at > now())
     and public.coach_active(p_uid) then
    return 'prueba';
  end if;
  return null;
end $$;
revoke all on function public.ia_rol_coach(uuid) from public, anon, authenticated;
grant execute on function public.ia_rol_coach(uuid) to service_role;

-- El permiso de la persona para la IA de Comida: 'ok' (aceptó el aviso que está vigente), 'no'
-- (lo apagó en Ajustes después de aceptarlo, o nunca lo aceptó y lo apagó), 'viejo' (aceptó un
-- aviso anterior: hay que volver a preguntar) o null (nunca se le preguntó).
create or replace function public.ia_permiso_estado(p_uid uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when p.user_id is null then null
    when p.comida_no_at is not null and (p.comida_ok_at is null or p.comida_no_at >= p.comida_ok_at) then 'no'
    when p.comida_ok_at is null then null
    when p.version < coalesce((select c.aviso_version from public.ia_config c where c.id = 1), 1) then 'viejo'
    else 'ok' end
  from (select 1) x left join public.ia_permisos p on p.user_id = p_uid;
$$;
revoke all on function public.ia_permiso_estado(uuid) from public, anon, authenticated;
grant execute on function public.ia_permiso_estado(uuid) to service_role;

-- ---------- IA Plus ----------
-- Con el interruptor de IA Plus prendido (ia_config.plus.activa), la foto del plato es gratis
-- hasta gratis_semana fotos por semana. La semana es la del calendario: arranca el lunes a las
-- 00:00 de Buenos Aires. Quien tiene IA Plus (lo pagó con Mercado Pago o con Apple, o se lo dio
-- soporte) o lo tiene incluido (coach con plan pago o de cortesía, y sus alumnos; la prueba gratis
-- no cuenta, como coach_pago) no tiene límite semanal y usa los topes de IA Plus (topes.plus: hasta
-- 10 fotos por día y US$1,50 por ciclo), además del resto de los topes de cada día. Lo controla
-- ia_reservar, en la base, así que la app no lo puede saltear. Con el interruptor apagado no hay
-- límite semanal y rigen los topes de siempre (salvo para quien lo pagó y lo sigue teniendo).

-- El lunes de esta semana a las 00:00 de Buenos Aires.
create or replace function public.ia_semana()
returns timestamptz language sql stable set search_path = public as $$
  select date_trunc('week', now() at time zone 'America/Argentina/Buenos_Aires') at time zone 'America/Argentina/Buenos_Aires';
$$;
revoke all on function public.ia_semana() from public, anon, authenticated;

-- Hasta cuándo tiene IA Plus comprado (o dado por soporte): lo que llegue más lejos de Mercado
-- Pago, Apple y lo manual. null si nunca lo tuvo.
create or replace function public.ia_plus_hasta(p_uid uuid)
returns timestamptz language sql stable security definer set search_path = public as $$
  select greatest(x.mp_hasta, x.apple_vence, x.manual_hasta) from public.ia_plus x where x.user_id = p_uid;
$$;
revoke all on function public.ia_plus_hasta(uuid) from public, anon, authenticated;
grant execute on function public.ia_plus_hasta(uuid) to service_role;

-- IA Plus incluido: coach con plan pago o de cortesía, o alumno de uno.
create or replace function public.ia_plus_incluido(p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.ia_rol(p_uid) = 'coach'
      or exists (select 1 from public.profiles p where p.id = p_uid and p.coach_id is not null and public.coach_pago(p.coach_id));
$$;
revoke all on function public.ia_plus_incluido(uuid) from public, anon, authenticated;
grant execute on function public.ia_plus_incluido(uuid) to service_role;

-- ¿Usa la IA de Comida sin límite semanal? (incluido o comprado y vigente)
create or replace function public.ia_plus_tiene(p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.ia_plus_incluido(p_uid) or coalesce(public.ia_plus_hasta(p_uid) > now(), false);
$$;
revoke all on function public.ia_plus_tiene(uuid) from public, anon, authenticated;
grant execute on function public.ia_plus_tiene(uuid) to service_role;

-- ¿Rigen los topes de IA Plus (topes.plus)? Con el interruptor prendido, para quien lo tiene
-- (comprado o incluido). Apagado, solo para quien lo compró y lo sigue teniendo (lo está pagando).
create or replace function public.ia_plus_rige(p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (coalesce((select (c.plus ->> 'activa')::boolean from public.ia_config c where c.id = 1), false) and public.ia_plus_tiene(p_uid))
      or coalesce(public.ia_plus_hasta(p_uid) > now(), false);
$$;
revoke all on function public.ia_plus_rige(uuid) from public, anon, authenticated;
grant execute on function public.ia_plus_rige(uuid) to service_role;

-- Cuántas fotos del plato lleva la persona desde el lunes (cuenta lo mismo que el tope del día:
-- todo lo que pudo costar algo, con los topes de alumno). Solo fotos.
create or replace function public.ia_semana_usos(p_uid uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.ia_llamadas l
   where l.user_id = p_uid and l.rol = 'alumno' and l.funcion = 'plato' and l.creada >= public.ia_semana()
     and (l.estado in ('ok', 'vacia', 'reservada', 'vencida') or (l.estado = 'error' and (l.usd is null or l.usd > 0)));
$$;
revoke all on function public.ia_semana_usos(uuid) from public, anon, authenticated;

-- Lo que la app muestra de IA Plus (Ajustes → Mi IA Plus y el límite semanal), sin montos de la IA:
--   { activa (el interruptor), estado ('gratis' | 'plus' | 'incluido'), por ('coach' | 'alumno',
--     si está incluido), fuente ('mp' | 'apple' | 'manual', si lo compró y está vigente), hasta,
--     renueva, mp_status, arrepentir_hasta (hasta cuándo puede usar el botón de arrepentimiento),
--     gratis_semana, usados_semana, quedan_semana (fotos), semana_vuelve (el lunes que viene),
--     plato_dia (las fotos por día con IA Plus, para la oferta), precio_ars, espera_hasta (se arrepintió hace poco: hasta cuándo no puede volver a suscribirse por Mercado
--     Pago) }
create or replace function public.ia_plus_info(p_uid uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_cfg jsonb; v_x public.ia_plus; v_estado text; v_por text; v_fuente text; v_hasta timestamptz; v_renueva boolean := false;
  v_gratis int; v_usados int; v_arr timestamptz; v_espera timestamptz;
begin
  select coalesce(c.plus, '{}'::jsonb) into v_cfg from public.ia_config c where c.id = 1;
  v_cfg := coalesce(v_cfg, '{}'::jsonb);
  select * into v_x from public.ia_plus where user_id = p_uid;
  if public.ia_rol(p_uid) = 'coach' then v_estado := 'incluido'; v_por := 'coach';
  elsif exists (select 1 from public.profiles p where p.id = p_uid and p.coach_id is not null and public.coach_pago(p.coach_id)) then v_estado := 'incluido'; v_por := 'alumno';
  end if;
  v_hasta := greatest(v_x.mp_hasta, v_x.apple_vence, v_x.manual_hasta);
  if v_hasta is not null and v_hasta > now() then
    v_fuente := case when v_hasta = v_x.apple_vence then 'apple' when v_hasta = v_x.mp_hasta then 'mp' else 'manual' end;
    v_renueva := case v_fuente when 'mp' then coalesce(v_x.mp_status, '') = 'authorized' when 'apple' then coalesce(v_x.apple_renueva, false) else false end;
    v_estado := coalesce(v_estado, 'plus');
  else
    v_hasta := null;
  end if;
  v_estado := coalesce(v_estado, 'gratis');
  -- Botón de arrepentimiento (Mercado Pago): 10 días corridos desde el primer cobro.
  if v_x.mp_preapproval_id is not null and v_x.mp_desde is not null and v_x.arrepentido_at is null
     and v_x.mp_hasta > now() and now() < v_x.mp_desde + interval '10 days' then
    v_arr := v_x.mp_desde + interval '10 days';
  end if;
  v_espera := greatest(v_x.ultimo_arrepentido_at, v_x.arrepentido_at) + interval '60 days';
  if v_espera <= now() then v_espera := null; end if;
  v_gratis := coalesce((v_cfg ->> 'gratis_semana')::int, 3);
  v_usados := public.ia_semana_usos(p_uid);
  return jsonb_build_object('activa', coalesce((v_cfg ->> 'activa')::boolean, false), 'estado', v_estado, 'por', v_por,
    'fuente', v_fuente, 'hasta', v_hasta, 'renueva', v_renueva,
    'mp_status', case when v_x.mp_preapproval_id is not null then v_x.mp_status end, 'arrepentir_hasta', v_arr,
    'gratis_semana', v_gratis, 'usados_semana', v_usados, 'quedan_semana', greatest(0, v_gratis - v_usados),
    'semana_vuelve', public.ia_semana() + interval '7 days', 'precio_ars', coalesce((v_cfg ->> 'precio_ars')::int, 3900),
    'plato_dia', coalesce((select (c.topes #>> '{plus,plato}')::int from public.ia_config c where c.id = 1), 10),
    'espera_hasta', v_espera);
end $$;
revoke all on function public.ia_plus_info(uuid) from public, anon, authenticated;
grant execute on function public.ia_plus_info(uuid) to service_role;

-- ---------- cortar un ciclo ----------
-- Pasa ESE ciclo (el de la llamada que falló, aunque ya haya empezado otro) a cortado, con su
-- motivo y hasta cuándo: tope (la cuenta propia llegó al corte; hasta el fin del ciclo), creditos
-- (se terminaron los créditos; media hora y se prueba de nuevo), limite_console (límite de la
-- Console o del nivel; hasta la fecha del mensaje o el día 1) y admin. Un corte por tope no se
-- cambia por otro más corto.
create or replace function public.ia_cortar(p_ciclo bigint, p_motivo text, p_vuelve timestamptz)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_motivo is null or p_motivo not in ('tope', 'creditos', 'limite_console', 'admin') then
    raise exception 'Motivo de corte inválido.' using errcode = '22023';
  end if;
  update public.ia_ciclos
     set estado = 'cortado', cortado_por = p_motivo, vuelve = p_vuelve, cortado_at = now()
   where id = p_ciclo and not (estado = 'cortado' and cortado_por = 'tope' and p_motivo <> 'tope');
end $$;
revoke all on function public.ia_cortar(bigint, text, timestamptz) from public, anon, authenticated;
grant execute on function public.ia_cortar(bigint, text, timestamptz) to service_role;

-- ---------- reservar antes de llamar ----------
-- Controles, en orden: interruptor y función prendida → ciclo (sin ancla, pausada) → corte →
-- tope del ciclo → modo ahorro → fotos gratis de la semana (con IA Plus prendido) → ritmo del día →
-- tope del día de la persona (por función y en total) → tope del ciclo de la persona. Con IA Plus
-- (ia_plus_rige), las fotos por día y los US$ del ciclo son los mayores entre su rol y topes.plus. Si pasa todo, anota la llamada como «reservada» y suma
-- max_usd a lo reservado del ciclo. Devuelve { ok, codigo, motivo, vuelve, llamada_id, ciclo_id, ahorro }.
-- El rol «prueba» (coach en su prueba gratis, ver ia_rol_coach) solo reserva planillas y rutinas.
create or replace function public.ia_reservar(p_uid uuid, p_rol text, p_funcion text, p_modelo text, p_max_usd numeric, p_pedido bigint default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cfg public.ia_config; v_c public.ia_ciclos; v_bandera text; v_hoy0 timestamptz; v_manana timestamptz;
  v_hoy numeric; v_limite numeric; v_dias numeric; v_tope_f numeric; v_tope_t numeric; v_n_f int; v_n_t int;
  v_mio numeric; v_usd_ciclo numeric; v_id bigint; v_ahorro boolean := false; v_gratis int; v_sem int; v_plus boolean := false;
begin
  if p_uid is null or p_rol is null or p_rol not in ('alumno', 'coach', 'admin', 'prueba')
     or p_funcion is null or p_funcion not in ('etiqueta', 'plato', 'texto', 'rutina', 'resumen', 'planilla')
     or (p_rol = 'prueba' and p_funcion not in ('planilla', 'rutina'))
     or p_max_usd is null or p_max_usd <= 0 or p_max_usd > 1 or coalesce(p_modelo, '') !~ '^[a-z0-9][a-z0-9.-]{2,59}$' then
    return jsonb_build_object('ok', false, 'codigo', 'error', 'motivo', 'pedido');
  end if;

  -- 1) Interruptor general y el de la función.
  select * into v_cfg from public.ia_config where id = 1;
  v_bandera := case when p_funcion = 'etiqueta' then case when p_rol = 'admin' then 'etiqueta_admin' else 'etiqueta_usuario' end else p_funcion end;
  if v_cfg.id is null or v_cfg.activa is not true or coalesce(v_cfg.funciones -> v_bandera, 'false'::jsonb) <> 'true'::jsonb then
    return jsonb_build_object('ok', false, 'codigo', 'pausada', 'motivo', 'apagada');
  end if;

  -- 2) Ciclo de ahora (bloqueado). Sin ancla no se gasta.
  v_c := public.ia_ciclo_tomar();
  if v_c.id is null then return jsonb_build_object('ok', false, 'codigo', 'pausada', 'motivo', 'sin_ciclo'); end if;

  -- 3) Cortado. Por créditos o por la Console, pasada la hora, esta llamada hace de prueba.
  if v_c.estado = 'cortado' then
    if v_c.cortado_por in ('creditos', 'limite_console') and now() >= coalesce(v_c.vuelve, '-infinity'::timestamptz) then
      update public.ia_ciclos
         set estado = case when gastado + reservado >= ahorro then 'ahorro' else 'normal' end, cortado_por = null, vuelve = null
       where id = v_c.id returning * into v_c;
    elsif v_c.cortado_por = 'creditos' then
      perform public.ia_frenada(v_c.id, 'pausada');
      return jsonb_build_object('ok', false, 'codigo', 'pausada', 'motivo', 'creditos', 'vuelve', v_c.vuelve);
    elsif v_c.cortado_por = 'admin' then
      perform public.ia_frenada(v_c.id, 'pausada');
      return jsonb_build_object('ok', false, 'codigo', 'pausada', 'motivo', 'admin');
    else
      perform public.ia_frenada(v_c.id, 'tope_mes');
      return jsonb_build_object('ok', false, 'codigo', 'tope_mes', 'motivo', v_c.cortado_por, 'vuelve', coalesce(v_c.vuelve, v_c.fin));
    end if;
  end if;

  -- 4) Tope del ciclo (lo gastado, lo reservado y esta llamada).
  if v_c.gastado + v_c.reservado + p_max_usd > v_c.tope then
    perform public.ia_cortar(v_c.id, 'tope', v_c.fin);
    perform public.ia_frenada(v_c.id, 'tope_mes');
    return jsonb_build_object('ok', false, 'codigo', 'tope_mes', 'motivo', 'tope', 'vuelve', v_c.fin);
  end if;

  -- 5) Modo ahorro: plato y texto solo para alumnos de coach con plan (y coaches) y para quien
  --    pagó IA Plus; el coach en su prueba (rol «prueba») no usa la IA del coach; las planillas y
  --    las rutinas del coach con plan pasan al modelo barato (lo elige la función); la tabla sigue
  --    para todos.
  if v_c.estado = 'normal' and v_c.gastado + v_c.reservado >= v_c.ahorro then
    update public.ia_ciclos set estado = 'ahorro', ahorro_at = coalesce(ahorro_at, now()) where id = v_c.id returning * into v_c;
  end if;
  if v_c.estado = 'ahorro' then
    if p_rol = 'prueba'
       or (p_funcion in ('plato', 'texto') and p_rol = 'alumno'
           and not exists (select 1 from public.profiles p where p.id = p_uid and p.coach_id is not null and public.coach_pago(p.coach_id))
           and not coalesce(public.ia_plus_hasta(p_uid) > now(), false)) then
      perform public.ia_frenada(v_c.id, 'ahorro');
      return jsonb_build_object('ok', false, 'codigo', 'ahorro', 'vuelve', v_c.fin);
    end if;
    v_ahorro := p_funcion in ('rutina', 'planilla');
  end if;

  -- 5b) IA Plus prendido: la foto del plato es gratis hasta gratis_semana fotos por semana (desde el
  --     lunes 00:00 de Buenos Aires), salvo quien tiene IA Plus (comprado o incluido). Va acá, en la
  --     base y con el ciclo bloqueado (dos pedidos a la vez no pasan los dos la última foto gratis).
  if p_funcion = 'plato' and p_rol = 'alumno' and coalesce((v_cfg.plus ->> 'activa')::boolean, false)
     and not public.ia_plus_tiene(p_uid) then
    v_gratis := coalesce((v_cfg.plus ->> 'gratis_semana')::int, 3);
    v_sem := public.ia_semana_usos(p_uid);
    if v_sem >= v_gratis then
      perform public.ia_frenada(v_c.id, 'tope_semana');
      return jsonb_build_object('ok', false, 'codigo', 'tope_semana', 'vuelve', public.ia_semana() + interval '7 days', 'tope', v_gratis);
    end if;
  end if;

  -- 6) Ritmo del día: en un día no más del doble de lo que «toca» por día de lo que queda (mínimo US$2).
  v_hoy0 := public.ia_hoy();
  v_manana := v_hoy0 + interval '1 day';
  select coalesce(sum(coalesce(l.usd, l.max_usd)), 0) into v_hoy from public.ia_llamadas l where l.ciclo_id = v_c.id and l.creada >= v_hoy0;
  v_dias := greatest(1, ceil(extract(epoch from (v_c.fin - now())) / 86400));
  v_limite := greatest(2, 2 * (v_c.tope - v_c.gastado) / v_dias);
  if v_hoy + p_max_usd > v_limite then
    perform public.ia_frenada(v_c.id, 'ritmo');
    return jsonb_build_object('ok', false, 'codigo', 'ritmo', 'vuelve', v_manana);
  end if;

  -- 7) Tope del día de la persona, por función y en total. Cuenta todo lo que pudo costar algo:
  --    no cuentan solo los errores explícitos de la API (cerrados con usd = 0). Solo las llamadas
  --    con el mismo rol: lo que el admin lee en el panel no le gasta los usos de la app.
  --    Con IA Plus, las fotos del plato por día son las de topes.plus si son más.
  v_plus := p_rol in ('alumno', 'coach') and public.ia_plus_rige(p_uid);
  v_tope_f := coalesce((v_cfg.topes -> p_rol ->> p_funcion)::numeric, 0);
  if v_plus and p_funcion = 'plato' then v_tope_f := greatest(v_tope_f, coalesce((v_cfg.topes #>> '{plus,plato}')::numeric, 0)); end if;
  v_tope_t := coalesce((v_cfg.topes -> p_rol ->> 'total')::numeric, 0);
  select count(*) filter (where l.funcion = p_funcion), count(*) into v_n_f, v_n_t
    from public.ia_llamadas l
   where l.user_id = p_uid and l.rol = p_rol and l.creada >= v_hoy0
     and (l.estado in ('ok', 'vacia', 'reservada', 'vencida') or (l.estado = 'error' and (l.usd is null or l.usd > 0)));
  if v_n_f >= v_tope_f or v_n_t >= v_tope_t then
    perform public.ia_frenada(v_c.id, 'tope_dia');
    return jsonb_build_object('ok', false, 'codigo', 'tope_dia', 'vuelve', v_manana, 'tope', case when v_n_f >= v_tope_f then v_tope_f else v_tope_t end);
  end if;

  -- 8) Tope del ciclo de la persona (también solo con el mismo rol). Con IA Plus, el de topes.plus
  --    si es más (un coach sigue con el suyo, que es mayor).
  v_usd_ciclo := coalesce((v_cfg.topes -> p_rol ->> 'usd_ciclo')::numeric, 0);
  if v_plus then v_usd_ciclo := greatest(v_usd_ciclo, coalesce((v_cfg.topes #>> '{plus,usd_ciclo}')::numeric, 0)); end if;
  select coalesce(sum(coalesce(l.usd, l.max_usd)), 0) into v_mio from public.ia_llamadas l where l.ciclo_id = v_c.id and l.user_id = p_uid and l.rol = p_rol;
  if v_mio + p_max_usd > v_usd_ciclo then
    perform public.ia_frenada(v_c.id, 'tope_persona');
    return jsonb_build_object('ok', false, 'codigo', 'tope_persona', 'vuelve', v_c.fin);
  end if;

  -- 9) Se reserva.
  insert into public.ia_llamadas (ciclo_id, user_id, rol, funcion, modelo, max_usd, pedido_id, origen)
  values (v_c.id, p_uid, p_rol, p_funcion, p_modelo, p_max_usd, p_pedido, case when p_rol = 'coach' then public.ia_rol_origen(p_uid) end)
  returning id into v_id;
  update public.ia_ciclos set reservado = reservado + p_max_usd where id = v_c.id;
  return jsonb_build_object('ok', true, 'llamada_id', v_id, 'ciclo_id', v_c.id, 'ahorro', v_ahorro);
end $$;
revoke all on function public.ia_reservar(uuid, text, text, text, numeric, bigint) from public, anon, authenticated;
grant execute on function public.ia_reservar(uuid, text, text, text, numeric, bigint) to service_role;

-- ---------- cerrar con lo que costó ----------
-- Se suma al ciclo de la llamada (aunque ya haya empezado otro). usd null = «no se sabe» (sin
-- respuesta): se cobra la reserva entera. Revisa los umbrales: aviso, ahorro y corte.
create or replace function public.ia_cerrar(p_id bigint, p_estado text, p_codigo text, p_usd numeric,
  p_in int default null, p_out int default null, p_cw int default null, p_cr int default null, p_ms int default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_l public.ia_llamadas; v_c public.ia_ciclos; v_cobro numeric;
begin
  if p_estado is null or p_estado not in ('ok', 'vacia', 'error', 'vencida') then
    raise exception 'Estado inválido.' using errcode = '22023';
  end if;
  select * into v_l from public.ia_llamadas where id = p_id for update;
  if v_l.id is null or v_l.estado <> 'reservada' then return; end if; -- ya cerrada: no se cuenta dos veces
  v_cobro := case when p_usd is null then v_l.max_usd else greatest(0, p_usd) end;
  update public.ia_llamadas
     set estado = p_estado, codigo = left(p_codigo, 40), usd = case when p_usd is null then null else greatest(0, p_usd) end,
         in_tok = p_in, out_tok = p_out, cache_w_tok = p_cw, cache_r_tok = p_cr, ms = p_ms, cerrada = now()
   where id = p_id;
  update public.ia_ciclos
     set reservado = greatest(0, reservado - v_l.max_usd), gastado = gastado + v_cobro
   where id = v_l.ciclo_id returning * into v_c;
  if v_c.gastado >= v_c.aviso and v_c.aviso_at is null then
    update public.ia_ciclos set aviso_at = now() where id = v_c.id;
  end if;
  if v_c.gastado >= v_c.tope then
    update public.ia_ciclos set estado = 'cortado', cortado_por = 'tope', vuelve = fin, cortado_at = coalesce(cortado_at, now()) where id = v_c.id;
  elsif v_c.gastado >= v_c.ahorro then
    update public.ia_ciclos set ahorro_at = coalesce(ahorro_at, now()), estado = case when estado = 'normal' then 'ahorro' else estado end where id = v_c.id;
  end if;
end $$;
revoke all on function public.ia_cerrar(bigint, text, text, numeric, int, int, int, int, int) from public, anon, authenticated;
grant execute on function public.ia_cerrar(bigint, text, text, numeric, int, int, int, int, int) to service_role;

-- ---------- limpieza (pg_cron) ----------
-- Reservas abiertas hace más de 10 minutos (la función se cayó o no pudo cerrar): se cierran como
-- vencidas y se cobra la reserva entera.
create or replace function public.ia_vencer()
returns int language plpgsql security definer set search_path = public as $$
declare v_r record; v_n int := 0;
begin
  for v_r in select id from public.ia_llamadas where estado = 'reservada' and creada < now() - interval '10 minutes' order by id loop
    perform public.ia_cerrar(v_r.id, 'vencida', 'vencida', null);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke all on function public.ia_vencer() from public, anon, authenticated;
grant execute on function public.ia_vencer() to service_role;

-- A los 90 días, cada uso deja de estar asociado a la persona (quedan los números del ciclo). Los
-- avisos de «¿Está mal?» se borran a los 180 días.
create or replace function public.ia_limpiar()
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  update public.ia_llamadas set user_id = null where user_id is not null and creada < now() - interval '90 days';
  get diagnostics v_n = row_count;
  delete from public.ia_reportes where creada < now() - interval '180 days';
  return v_n;
end $$;
revoke all on function public.ia_limpiar() from public, anon, authenticated;
grant execute on function public.ia_limpiar() to service_role;

select cron.unschedule('gize-ia-vencer') where exists (select 1 from cron.job where jobname = 'gize-ia-vencer');
select cron.schedule('gize-ia-vencer', '*/5 * * * *', $job$ select public.ia_vencer(); $job$);
select cron.unschedule('gize-ia-limpiar') where exists (select 1 from cron.job where jobname = 'gize-ia-limpiar');
select cron.schedule('gize-ia-limpiar', '37 5 * * *', $job$ select public.ia_limpiar(); $job$);

-- ---------- panel (gize.ar/admin → IA) ----------
-- Todo lo que muestra la página IA: configuración, ciclo de ahora, ritmo y proyección, usos y
-- dólares por función, errores, cuánto se corrigió lo que leyó la IA en los pedidos y las últimas
-- 50 llamadas. Sin datos de nadie.
create or replace function public.admin_ia_estado()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_cfg public.ia_config; v_c public.ia_ciclos; v_prev public.ia_ciclos; v_ini timestamptz; v_fin timestamptz;
  v_hoy0 timestamptz; v_dias numeric; v_tope numeric; v_gastado numeric; v_hoy numeric; v_7 numeric; v_d7 numeric;
begin
  perform public.admin_assert();
  select * into v_cfg from public.ia_config where id = 1;
  if v_cfg.ancla is not null then
    select x.inicio, x.fin into v_ini, v_fin from public.ia_ciclo_de(v_cfg.ancla, now()) x;
    select * into v_c from public.ia_ciclos where inicio = v_ini;
    select * into v_prev from public.ia_ciclos where inicio < v_ini order by inicio desc limit 1;
  end if;
  v_hoy0 := public.ia_hoy();
  v_tope := coalesce(v_c.tope, v_prev.tope, 180);
  v_gastado := coalesce(v_c.gastado, 0);
  v_dias := case when v_fin is null then null else greatest(1, ceil(extract(epoch from (v_fin - now())) / 86400)) end;
  select coalesce(sum(coalesce(l.usd, l.max_usd)), 0) into v_hoy from public.ia_llamadas l where l.ciclo_id = v_c.id and l.creada >= v_hoy0;
  -- Ritmo de los últimos 7 días (o desde que empezó el ciclo) para la proyección.
  v_d7 := case when v_ini is null then null else greatest(1, least(7, extract(epoch from (now() - v_ini)) / 86400)) end;
  select coalesce(sum(coalesce(l.usd, l.max_usd)), 0) into v_7 from public.ia_llamadas l where l.ciclo_id = v_c.id and l.creada >= now() - interval '7 days';
  return jsonb_build_object(
    'activa', coalesce(v_cfg.activa, false), 'funciones', v_cfg.funciones, 'modelos', v_cfg.modelos, 'topes', v_cfg.topes,
    'ancla', v_cfg.ancla, 'pedidos_desde', v_cfg.pedidos_desde, 'aviso_version', v_cfg.aviso_version,
    'ciclo', case when v_ini is null then null else jsonb_build_object(
      'id', v_c.id, 'inicio', v_ini, 'fin', v_fin,
      'credito', coalesce(v_c.credito, v_prev.credito, 200), 'aviso', coalesce(v_c.aviso, v_prev.aviso, 100),
      'ahorro', coalesce(v_c.ahorro, v_prev.ahorro, 150), 'tope', v_tope,
      'gastado', v_gastado, 'reservado', coalesce(v_c.reservado, 0), 'estado', coalesce(v_c.estado, 'normal'),
      'cortado_por', v_c.cortado_por, 'vuelve', v_c.vuelve, 'aviso_at', v_c.aviso_at, 'ahorro_at', v_c.ahorro_at, 'cortado_at', v_c.cortado_at,
      'hoy', round(v_hoy, 4), 'limite_hoy', round(greatest(2, 2 * (v_tope - v_gastado) / v_dias), 2),
      'proyeccion', round(v_gastado + v_7 / v_d7 * v_dias, 2), 'frenos', coalesce(v_c.frenos, '{}'::jsonb)) end,
    -- Por función: usos, dólares y cuánto tarda (mediana y 95 %, de las que respondieron), en ms.
    'por_funcion', coalesce((select jsonb_object_agg(x.funcion, jsonb_build_object('usos', x.n, 'usd', x.usd, 'p50', x.p50, 'p95', x.p95))
        from (select l.funcion, count(*) n, round(sum(coalesce(l.usd, l.max_usd)), 4) usd,
                     round(percentile_cont(0.5) within group (order by l.ms) filter (where l.estado in ('ok', 'vacia') and l.ms is not null)) p50,
                     round(percentile_cont(0.95) within group (order by l.ms) filter (where l.estado in ('ok', 'vacia') and l.ms is not null)) p95
                from public.ia_llamadas l where l.ciclo_id = v_c.id group by l.funcion) x), '{}'::jsonb),
    'errores', coalesce((select jsonb_object_agg(x.codigo, x.n)
        from (select coalesce(l.codigo, l.estado) codigo, count(*) n from public.ia_llamadas l where l.ciclo_id = v_c.id and l.estado in ('error', 'vencida') group by 1) x), '{}'::jsonb),
    -- Los pedidos leídos con IA que ya se publicaron: cuántos sin corregir (todo y solo las
    -- calorías) y cuántos con cada campo corregido; y de los leídos, cuántos con las calorías que
    -- no cerraban con los macros (revisar).
    'tablas', (select jsonb_build_object(
        'leidas', count(*) filter (where r.ai_at is not null),
        'sin_tabla', count(*) filter (where r.ai_encontrada is false),
        'con_tabla', count(*) filter (where r.ai_encontrada is true),
        'revisar', count(*) filter (where r.ai_encontrada is true and r.ai_revisar is true),
        'campos', jsonb_build_object(
          'kcal', count(*) filter (where r.status = 'cargado' and r.ai_encontrada and r.ai_corregido is not null and 'kcal' = any(coalesce(r.ai_corregidos, '{}'::text[]))),
          'protein', count(*) filter (where r.status = 'cargado' and r.ai_encontrada and r.ai_corregido is not null and 'protein' = any(coalesce(r.ai_corregidos, '{}'::text[]))),
          'carbs', count(*) filter (where r.status = 'cargado' and r.ai_encontrada and r.ai_corregido is not null and 'carbs' = any(coalesce(r.ai_corregidos, '{}'::text[]))),
          'fat', count(*) filter (where r.status = 'cargado' and r.ai_encontrada and r.ai_corregido is not null and 'fat' = any(coalesce(r.ai_corregidos, '{}'::text[]))),
          'portion', count(*) filter (where r.status = 'cargado' and r.ai_encontrada and r.ai_corregido is not null and 'portion' = any(coalesce(r.ai_corregidos, '{}'::text[]))),
          'unit', count(*) filter (where r.status = 'cargado' and r.ai_encontrada and r.ai_corregido is not null and 'unit' = any(coalesce(r.ai_corregidos, '{}'::text[])))),
        'publicadas', count(*) filter (where r.status = 'cargado' and r.ai_encontrada and r.ai_corregido is not null),
        'sin_corregir', count(*) filter (where r.status = 'cargado' and r.ai_encontrada and r.ai_corregido = false),
        'kcal_bien', count(*) filter (where r.status = 'cargado' and r.ai_encontrada and r.ai_corregido is not null and not ('kcal' = any(coalesce(r.ai_corregidos, '{}'::text[])))))
      from public.product_requests r where r.ai_at is not null),
    -- La API rechazó la clave y después no anduvo ninguna llamada: hay que cambiarla.
    -- IA Plus: la configuración y cuántos lo tienen vigente, por medio de pago.
    'plus', v_cfg.plus,
    'plus_resumen', (select jsonb_build_object(
        'activos', count(*) filter (where greatest(x.mp_hasta, x.apple_vence, x.manual_hasta) > now()),
        'mp', count(*) filter (where x.mp_hasta > now()),
        'apple', count(*) filter (where x.apple_vence > now()),
        'manual', count(*) filter (where x.manual_hasta > now()),
        'renuevan', count(*) filter (where (x.mp_hasta > now() and x.mp_status = 'authorized') or (x.apple_vence > now() and x.apple_renueva)),
        'arrepentidos', count(*) filter (where coalesce(x.ultimo_arrepentido_at, x.arrepentido_at) is not null))
      from public.ia_plus x),
    'clave_rechazada', (select max(l.creada) from public.ia_llamadas l where l.codigo = 'clave_rechazada'
        and not exists (select 1 from public.ia_llamadas k where k.estado in ('ok', 'vacia') and k.creada > l.creada)),
    'ultimas', coalesce((select jsonb_agg(to_jsonb(x) order by x.creada desc)
        from (select l.creada, l.rol, l.origen, l.funcion, l.modelo, l.estado, l.codigo, l.usd, l.max_usd, l.ms from public.ia_llamadas l order by l.id desc limit 50) x), '[]'::jsonb));
end $$;
revoke all on function public.admin_ia_estado() from public, anon;
grant execute on function public.admin_ia_estado() to authenticated;

-- Cambiar la configuración: { activa, funciones: {…}, modelos: {…}, topes: {rol: {…}},
-- pedidos_desde, umbrales: {aviso, ahorro, tope, credito}, plus: {activa, gratis_semana,
-- precio_ars, sandbox (mails)} } (solo lo que venga). IA Plus no se prende sin el precio en pesos confirmado. Las claves de
-- funciones y topes tienen que existir; los números, positivos. El modelo solo se controla que
-- tenga forma de id: la función usa uno de su lista o el de siempre.
create or replace function public.admin_ia_config(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cfg public.ia_config; v_c public.ia_ciclos; v_k text; v_v jsonb; v_k2 text; v_v2 jsonb; v_x numeric;
  v_aviso numeric; v_ahorro numeric; v_tope numeric; v_credito numeric;
begin
  perform public.admin_assert();
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'Pedido inválido.' using errcode = '22023'; end if;
  select * into v_cfg from public.ia_config where id = 1 for update;
  if p ? 'activa' then
    if jsonb_typeof(p -> 'activa') <> 'boolean' then raise exception 'activa: sí o no.' using errcode = '22023'; end if;
    v_cfg.activa := (p ->> 'activa')::boolean;
  end if;
  if p ? 'funciones' then
    if jsonb_typeof(p -> 'funciones') <> 'object' then raise exception 'funciones: inválido.' using errcode = '22023'; end if;
    for v_k, v_v in select * from jsonb_each(p -> 'funciones') loop
      if not (v_cfg.funciones ? v_k) or jsonb_typeof(v_v) <> 'boolean' then raise exception 'Función desconocida: %', v_k using errcode = '22023'; end if;
      v_cfg.funciones := jsonb_set(v_cfg.funciones, array[v_k], v_v);
    end loop;
  end if;
  if p ? 'modelos' then
    if jsonb_typeof(p -> 'modelos') <> 'object' then raise exception 'modelos: inválido.' using errcode = '22023'; end if;
    for v_k, v_v in select * from jsonb_each(p -> 'modelos') loop
      if v_k not in ('etiqueta', 'plato', 'texto', 'rutina', 'resumen', 'planilla') then raise exception 'Función desconocida: %', v_k using errcode = '22023'; end if;
      if v_v = 'null'::jsonb or v_v = '""'::jsonb then v_cfg.modelos := v_cfg.modelos - v_k;
      elsif jsonb_typeof(v_v) <> 'string' or (v_v #>> '{}') !~ '^[a-z0-9][a-z0-9.-]{2,59}$' then raise exception 'Modelo inválido.' using errcode = '22023';
      else v_cfg.modelos := jsonb_set(v_cfg.modelos, array[v_k], v_v);
      end if;
    end loop;
  end if;
  if p ? 'topes' then
    if jsonb_typeof(p -> 'topes') <> 'object' then raise exception 'topes: inválido.' using errcode = '22023'; end if;
    for v_k, v_v in select * from jsonb_each(p -> 'topes') loop
      if not (v_cfg.topes ? v_k) or jsonb_typeof(v_v) <> 'object' then raise exception 'Rol desconocido: %', v_k using errcode = '22023'; end if;
      for v_k2, v_v2 in select * from jsonb_each(v_v) loop
        if not ((v_cfg.topes -> v_k) ? v_k2) or jsonb_typeof(v_v2) <> 'number' then raise exception 'Tope desconocido: %.%', v_k, v_k2 using errcode = '22023'; end if;
        v_x := (v_v2 #>> '{}')::numeric;
        if v_x < 0 or v_x > 10000 or (v_k2 <> 'usd_ciclo' and v_x <> floor(v_x)) then raise exception 'Revisá el tope %.%', v_k, v_k2 using errcode = '22023'; end if;
        v_cfg.topes := jsonb_set(v_cfg.topes, array[v_k, v_k2], v_v2);
      end loop;
    end loop;
  end if;
  if p ? 'pedidos_desde' then
    v_cfg.pedidos_desde := nullif(p ->> 'pedidos_desde', '')::timestamptz;
  end if;
  if p ? 'plus' then
    if jsonb_typeof(p -> 'plus') <> 'object' then raise exception 'plus: inválido.' using errcode = '22023'; end if;
    v_cfg.plus := coalesce(v_cfg.plus, '{}'::jsonb);
    for v_k, v_v in select * from jsonb_each(p -> 'plus') loop
      if v_k = 'activa' then
        if jsonb_typeof(v_v) <> 'boolean' then raise exception 'IA Plus: sí o no.' using errcode = '22023'; end if;
      elsif v_k = 'gratis_semana' then
        if jsonb_typeof(v_v) <> 'number' or (v_v #>> '{}')::numeric < 0 or (v_v #>> '{}')::numeric > 100 or (v_v #>> '{}')::numeric <> floor((v_v #>> '{}')::numeric) then
          raise exception 'Revisá las fotos gratis por semana (de 0 a 100).' using errcode = '22023';
        end if;
      elsif v_k = 'precio_ars' then
        if jsonb_typeof(v_v) <> 'number' or (v_v #>> '{}')::numeric < 100 or (v_v #>> '{}')::numeric > 1000000 or (v_v #>> '{}')::numeric <> floor((v_v #>> '{}')::numeric) then
          raise exception 'Revisá el precio de IA Plus (en pesos, sin centavos).' using errcode = '22023';
        end if;
        v_cfg.plus := jsonb_set(v_cfg.plus, '{precio_confirmado}', 'true'::jsonb);
      elsif v_k = 'sandbox' then
        -- Las cuentas (mails) a las que una compra de prueba de Apple (Sandbox: TestFlight o la
        -- revisión de Apple) les da IA Plus. Las demás no lo reciben (función compras-apple).
        if jsonb_typeof(v_v) <> 'array' or jsonb_array_length(v_v) > 20
           or exists (select 1 from jsonb_array_elements(v_v) m where jsonb_typeof(m) <> 'string' or trim(m #>> '{}') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(m #>> '{}') > 200) then
          raise exception 'Revisá los mails de las compras de prueba de Apple (hasta 20).' using errcode = '22023';
        end if;
        v_v := coalesce((select jsonb_agg(distinct lower(trim(m #>> '{}'))) from jsonb_array_elements(v_v) m), '[]'::jsonb);
      else
        raise exception 'IA Plus: dato desconocido: %', v_k using errcode = '22023';
      end if;
      v_cfg.plus := jsonb_set(v_cfg.plus, array[v_k], v_v);
    end loop;
    if (v_cfg.plus ->> 'activa')::boolean and coalesce((v_cfg.plus ->> 'precio_confirmado')::boolean, false) is not true then
      raise exception 'Antes de prender IA Plus, confirmá el precio en pesos (Guardar precio).' using errcode = '22023';
    end if;
    -- No se vende IA Plus con la IA de Comida apagada (sería cobrar por algo que no se puede usar).
    if (p -> 'plus' ->> 'activa')::boolean and not (coalesce(v_cfg.activa, false)
        and coalesce(v_cfg.funciones -> 'plato', 'false'::jsonb) = 'true'::jsonb) then
      raise exception 'Antes de prender IA Plus, prendé la IA y la foto del plato.' using errcode = '22023';
    end if;
  end if;
  update public.ia_config
     set activa = v_cfg.activa, funciones = v_cfg.funciones, modelos = v_cfg.modelos, topes = v_cfg.topes,
         pedidos_desde = v_cfg.pedidos_desde, plus = v_cfg.plus, updated_at = now()
   where id = 1;
  -- Umbrales del ciclo de ahora (los ciclos nuevos copian los del anterior).
  if p ? 'umbrales' then
    v_c := public.ia_ciclo_tomar();
    if v_c.id is null then raise exception 'Primero cargá la fecha en que vencen los créditos.' using errcode = '22023'; end if;
    v_aviso := coalesce((p #>> '{umbrales,aviso}')::numeric, v_c.aviso);
    v_ahorro := coalesce((p #>> '{umbrales,ahorro}')::numeric, v_c.ahorro);
    v_tope := coalesce((p #>> '{umbrales,tope}')::numeric, v_c.tope);
    v_credito := coalesce((p #>> '{umbrales,credito}')::numeric, v_c.credito);
    if not (0 < v_aviso and v_aviso <= v_ahorro and v_ahorro <= v_tope and v_tope <= v_credito and v_credito <= 1000) then
      raise exception 'Los montos van de menor a mayor: aviso ≤ ahorro ≤ corte ≤ crédito.' using errcode = '22023';
    end if;
    update public.ia_ciclos set aviso = v_aviso, ahorro = v_ahorro, tope = v_tope, credito = v_credito where id = v_c.id;
  end if;
  perform public.admin_log('ia_config', null, p);
  return public.admin_ia_estado();
end $$;
revoke all on function public.admin_ia_config(jsonb) from public, anon;
grant execute on function public.admin_ia_config(jsonb) to authenticated;

-- La fecha en que vencen los créditos («Promotional credits» en la Console): queda como ancla, a
-- las 00:00 UTC. El ciclo de hoy pasa a las fechas nuevas y conserva lo gastado.
create or replace function public.admin_ia_ciclo(p_fin date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ancla timestamptz; v_ini timestamptz; v_fin timestamptz; v_c public.ia_ciclos;
begin
  perform public.admin_assert();
  if p_fin is null or p_fin < current_date - 400 or p_fin > current_date + 400 then
    raise exception 'Revisá la fecha.' using errcode = '22023';
  end if;
  v_ancla := p_fin::timestamp at time zone 'UTC';
  perform pg_advisory_xact_lock(hashtext('ia_ciclo'));
  update public.ia_config set ancla = v_ancla, updated_at = now() where id = 1;
  select x.inicio, x.fin into v_ini, v_fin from public.ia_ciclo_de(v_ancla, now()) x;
  select * into v_c from public.ia_ciclos where inicio <= now() and fin > now() order by inicio desc limit 1 for update;
  if v_c.id is not null and (v_c.inicio <> v_ini or v_c.fin <> v_fin)
     and not exists (select 1 from public.ia_ciclos o where o.inicio = v_ini and o.id <> v_c.id) then
    update public.ia_ciclos
       set inicio = v_ini, fin = v_fin, vuelve = case when cortado_por = 'tope' then v_fin else vuelve end
     where id = v_c.id;
  end if;
  perform public.ia_ciclo_tomar();
  perform public.admin_log('ia_ciclo', p_fin::text, null);
  return public.admin_ia_estado();
end $$;
revoke all on function public.admin_ia_ciclo(date) from public, anon;
grant execute on function public.admin_ia_ciclo(date) to authenticated;

-- «Volver a probar»: un ciclo cortado vuelve a andar si todavía no llegó al corte (por ejemplo,
-- después de cargar créditos o de subir el límite de la Console).
create or replace function public.admin_ia_reintentar()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_c public.ia_ciclos;
begin
  perform public.admin_assert();
  v_c := public.ia_ciclo_tomar();
  if v_c.id is null then raise exception 'Primero cargá la fecha en que vencen los créditos.' using errcode = '22023'; end if;
  if v_c.estado = 'cortado' then
    if v_c.gastado >= v_c.tope then raise exception 'Este ciclo ya llegó al corte: vuelve solo con el ciclo que viene.' using errcode = '22023'; end if;
    update public.ia_ciclos
       set estado = case when gastado + reservado >= ahorro then 'ahorro' else 'normal' end, cortado_por = null, vuelve = null
     where id = v_c.id;
    perform public.admin_log('ia_reintentar', v_c.id::text, null);
  end if;
  return public.admin_ia_estado();
end $$;
revoke all on function public.admin_ia_reintentar() from public, anon;
grant execute on function public.admin_ia_reintentar() to authenticated;

-- ---------- botón de arrepentimiento y de baja (página sin sesión) ----------
-- Guarda el pedido y devuelve { ok, codigo, cuenta (si el mail es de una cuenta de GIZE) } o
-- { ok: false, codigo: 'muchos' | 'invalido' }. Hasta 3 pedidos por mail por día y 60 por hora en
-- total (para que no se use para mandar mails a cualquiera). Solo la service role (la función).
create or replace function public.pedido_baja(p_tipo text, p_servicio text, p_email text, p_detalle text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_mail text := lower(trim(coalesce(p_email, ''))); v_uid uuid; v_cod text;
begin
  if p_tipo not in ('arrepentimiento', 'baja') or p_servicio not in ('iaplus', 'coach')
     or v_mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_mail) > 320 or char_length(coalesce(p_detalle, '')) > 500 then
    return jsonb_build_object('ok', false, 'codigo', 'invalido');
  end if;
  if (select count(*) from public.pedidos_baja where lower(email) = v_mail and created_at > now() - interval '1 day') >= 3
     or (select count(*) from public.pedidos_baja where created_at > now() - interval '1 hour') >= 60 then
    return jsonb_build_object('ok', false, 'codigo', 'muchos');
  end if;
  select u.id into v_uid from auth.users u where lower(u.email) = v_mail limit 1;
  v_cod := 'GZ-' || upper(substr(md5(random()::text || clock_timestamp()::text || v_mail), 1, 8));
  insert into public.pedidos_baja (codigo, tipo, servicio, email, detalle, user_id)
  values (v_cod, p_tipo, p_servicio, v_mail, nullif(trim(coalesce(p_detalle, '')), ''), v_uid);
  return jsonb_build_object('ok', true, 'codigo', v_cod, 'cuenta', v_uid is not null);
end $$;
revoke all on function public.pedido_baja(text, text, text, text) from public, anon, authenticated;
grant execute on function public.pedido_baja(text, text, text, text) to service_role;

-- Panel: los pedidos sin atender (y los atendidos de los últimos 30 días) y marcar uno atendido.
create or replace function public.admin_pedidos_baja()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_assert();
  return coalesce((select jsonb_agg(to_jsonb(y) order by y.created_at desc) from (
    select b.id, b.codigo, b.tipo, b.servicio, b.email, b.detalle, b.user_id is not null as cuenta, b.created_at, b.atendido_at
      from public.pedidos_baja b
     where b.atendido_at is null or b.created_at > now() - interval '30 days'
     order by b.created_at desc limit 200) y), '[]'::jsonb);
end $$;
revoke all on function public.admin_pedidos_baja() from public, anon;
grant execute on function public.admin_pedidos_baja() to authenticated;

create or replace function public.admin_pedido_baja_atendido(p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_assert();
  update public.pedidos_baja set atendido_at = now() where id = p_id and atendido_at is null;
  perform public.admin_log('pedido_baja_atendido', p_id::text, null);
  return public.admin_pedidos_baja();
end $$;
revoke all on function public.admin_pedido_baja_atendido(bigint) from public, anon;
grant execute on function public.admin_pedido_baja_atendido(bigint) to authenticated;

-- ---------- panel: IA Plus ----------
-- Las personas con IA Plus vigente o que lo tuvieron en los últimos 60 días (para soporte), con su
-- mail, de dónde viene y hasta cuándo. También quien se arrepintió dos veces o más (siempre).
create or replace function public.admin_ia_plus_lista()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_assert();
  return coalesce((select jsonb_agg(to_jsonb(y) order by y.hasta desc nulls last) from (
    select x.user_id, u.email, p.full_name as nombre, greatest(x.mp_hasta, x.apple_vence, x.manual_hasta) as hasta,
           x.mp_hasta, x.mp_status, x.mp_desde, x.mp_pending_id is not null as pagando, x.apple_vence, x.apple_renueva, x.manual_hasta, x.manual_nota, x.arrepentido_at,
           x.ultimo_arrepentido_at, x.arrepentimientos, x.created_at
      from public.ia_plus x
      left join auth.users u on u.id = x.user_id
      left join public.profiles p on p.id = x.user_id
     where greatest(x.mp_hasta, x.apple_vence, x.manual_hasta) > now() - interval '60 days' or x.mp_pending_id is not null
        or x.arrepentimientos >= 2
     order by greatest(x.mp_hasta, x.apple_vence, x.manual_hasta) desc nulls last
     limit 300) y), '[]'::jsonb);
end $$;
revoke all on function public.admin_ia_plus_lista() from public, anon;
grant execute on function public.admin_ia_plus_lista() to authenticated;

-- Soporte: dar IA Plus a mano a una cuenta (por su mail) hasta el final de un día (Buenos Aires).
-- No toca lo que haya pagado con Mercado Pago o con Apple.
create or replace function public.admin_ia_plus_dar(p_email text, p_hasta date, p_nota text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid; v_hasta timestamptz; v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
begin
  perform public.admin_assert();
  select u.id into v_uid from auth.users u where lower(u.email) = lower(btrim(coalesce(p_email, ''))) limit 1;
  if v_uid is null then raise exception 'No hay ninguna cuenta con ese mail.' using errcode = '22023'; end if;
  if p_hasta is null or p_hasta < current_date or p_hasta > current_date + 400 then raise exception 'Revisá la fecha (de hoy a un año).' using errcode = '22023'; end if;
  if char_length(coalesce(v_nota, '')) > 200 then raise exception 'La nota es muy larga (hasta 200 letras).' using errcode = '22023'; end if;
  v_hasta := (p_hasta + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires';
  insert into public.ia_plus (user_id, manual_hasta, manual_nota) values (v_uid, v_hasta, v_nota)
  on conflict (user_id) do update set manual_hasta = excluded.manual_hasta, manual_nota = excluded.manual_nota, updated_at = now();
  perform public.admin_log('ia_plus_dar', v_uid::text, jsonb_build_object('hasta', p_hasta, 'nota', v_nota));
  return public.admin_ia_plus_lista();
end $$;
revoke all on function public.admin_ia_plus_dar(text, date, text) from public, anon;
grant execute on function public.admin_ia_plus_dar(text, date, text) to authenticated;

-- Soporte: sacar el IA Plus dado a mano. Lo pagado con Mercado Pago o con Apple no se toca (se
-- cancela por el mismo medio).
create or replace function public.admin_ia_plus_quitar(p_uid uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_assert();
  update public.ia_plus set manual_hasta = null, manual_nota = null, updated_at = now() where user_id = p_uid;
  perform public.admin_log('ia_plus_quitar', p_uid::text, null);
  return public.admin_ia_plus_lista();
end $$;
revoke all on function public.admin_ia_plus_quitar(uuid) from public, anon;
grant execute on function public.admin_ia_plus_quitar(uuid) to authenticated;

-- ---------- la app: foto del plato ----------
-- Lo que la app necesita saber para mostrar (o no) los botones de la IA, sin montos:
--   { activa, funciones: { plato, texto }, permiso_comida ('ok' | 'no' | 'viejo' | null),
--     aviso_version, estado ('normal' | 'ahorro' | 'pausada' | 'tope_mes' | 'tope_persona'),
--     vuelve, quedan: { plato, texto }, tope: { plato, texto, total }, usados: { plato, texto, total },
--     por_gimnasio (true: usa los topes de coach por ser profe de un gimnasio, ver ia_rol_origen),
--     plus: ia_plus_info() }
-- Con IA Plus prendido y sin IA Plus, «quedan» también mira las fotos gratis de la semana y, si no
-- queda ninguna, estado = 'tope_semana' (vuelve: el lunes que viene). Con IA Plus (ia_plus_rige),
-- el tope de fotos por día y el de US$ del ciclo son los de topes.plus si son más (como ia_reservar).
-- Una función está prendida para la app solo con el interruptor general, la de la función y la
-- fecha de los créditos cargada (sin eso la función nunca llama a la IA): si no, la app no
-- muestra nada nuevo. «quedan»: cuántos usos le quedan hoy a la persona (por función y en total).
create or replace function public.ia_mi_estado()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_cfg public.ia_config; v_c public.ia_ciclos; v_ini timestamptz; v_fin timestamptz;
  v_on boolean; v_plato boolean; v_texto boolean; v_rol text; v_origen text; v_hoy0 timestamptz; v_estado text := 'normal'; v_vuelve timestamptz;
  v_np int; v_nt int; v_n int; v_tp numeric; v_tt numeric; v_tot numeric; v_mio numeric; v_plus jsonb; v_qs int; v_usd numeric;
begin
  if v_uid is null then return jsonb_build_object('activa', false, 'funciones', jsonb_build_object('plato', false, 'texto', false)); end if;
  v_plus := public.ia_plus_info(v_uid);
  select * into v_cfg from public.ia_config where id = 1;
  v_on := coalesce(v_cfg.activa, false) and v_cfg.ancla is not null;
  v_plato := v_on and coalesce(v_cfg.funciones -> 'plato', 'false'::jsonb) = 'true'::jsonb;
  v_texto := v_on and coalesce(v_cfg.funciones -> 'texto', 'false'::jsonb) = 'true'::jsonb;
  if not (v_plato or v_texto) then
    return jsonb_build_object('activa', false, 'funciones', jsonb_build_object('plato', false, 'texto', false),
      'permiso_comida', public.ia_permiso_estado(v_uid), 'aviso_version', coalesce(v_cfg.aviso_version, 1), 'plus', v_plus);
  end if;
  v_origen := public.ia_rol_origen(v_uid);
  v_rol := case when v_origen is not null then 'coach' else 'alumno' end;   -- lo mismo que ia_rol
  v_usd := coalesce((v_cfg.topes -> v_rol ->> 'usd_ciclo')::numeric, 0);
  -- El ciclo de ahora (sin crearlo: esto solo mira).
  select x.inicio, x.fin into v_ini, v_fin from public.ia_ciclo_de(v_cfg.ancla, now()) x;
  select * into v_c from public.ia_ciclos where inicio = v_ini;
  if v_c.estado = 'cortado' then
    if v_c.cortado_por in ('creditos', 'limite_console') and now() >= coalesce(v_c.vuelve, '-infinity'::timestamptz) then v_estado := 'normal';
    elsif v_c.cortado_por in ('creditos', 'admin') then v_estado := 'pausada';
    else v_estado := 'tope_mes'; v_vuelve := coalesce(v_c.vuelve, v_c.fin);
    end if;
  elsif (v_c.estado = 'ahorro' or v_c.gastado + v_c.reservado >= v_c.ahorro) and v_rol = 'alumno'
        and not exists (select 1 from public.profiles p where p.id = v_uid and p.coach_id is not null and public.coach_pago(p.coach_id))
        and v_plus ->> 'estado' = 'gratis' then
    v_estado := 'ahorro'; v_vuelve := v_fin;
  end if;
  -- Lo de hoy de la persona: cuenta lo mismo que ia_reservar (solo con el rol de la app).
  v_hoy0 := public.ia_hoy();
  select count(*) filter (where l.funcion = 'plato'), count(*) filter (where l.funcion = 'texto'), count(*) into v_np, v_nt, v_n
    from public.ia_llamadas l
   where l.user_id = v_uid and l.rol = v_rol and l.creada >= v_hoy0
     and (l.estado in ('ok', 'vacia', 'reservada', 'vencida') or (l.estado = 'error' and (l.usd is null or l.usd > 0)));
  v_tp := coalesce((v_cfg.topes -> v_rol ->> 'plato')::numeric, 0);
  if public.ia_plus_rige(v_uid) then
    v_tp := greatest(v_tp, coalesce((v_cfg.topes #>> '{plus,plato}')::numeric, 0));
    v_usd := greatest(v_usd, coalesce((v_cfg.topes #>> '{plus,usd_ciclo}')::numeric, 0));
  end if;
  v_tt := coalesce((v_cfg.topes -> v_rol ->> 'texto')::numeric, 0);
  v_tot := coalesce((v_cfg.topes -> v_rol ->> 'total')::numeric, 0);
  if v_estado = 'normal' and v_c.id is not null then
    select coalesce(sum(coalesce(l.usd, l.max_usd)), 0) into v_mio from public.ia_llamadas l where l.ciclo_id = v_c.id and l.user_id = v_uid and l.rol = v_rol;
    if v_mio >= v_usd then v_estado := 'tope_persona'; v_vuelve := v_fin; end if;
  end if;
  -- Fotos gratis de la semana (IA Plus prendido y sin IA Plus): lo mismo que mira ia_reservar.
  if (v_plus ->> 'activa')::boolean and v_plus ->> 'estado' = 'gratis' and v_rol = 'alumno' then
    v_qs := (v_plus ->> 'quedan_semana')::int;
    if v_qs <= 0 and v_estado = 'normal' then v_estado := 'tope_semana'; v_vuelve := (v_plus ->> 'semana_vuelve')::timestamptz; end if;
  end if;
  return jsonb_build_object('activa', true, 'funciones', jsonb_build_object('plato', v_plato, 'texto', v_texto),
    'permiso_comida', public.ia_permiso_estado(v_uid), 'aviso_version', coalesce(v_cfg.aviso_version, 1),
    'estado', v_estado, 'vuelve', v_vuelve, 'manana', v_hoy0 + interval '1 day',
    'quedan', jsonb_build_object('plato', greatest(0, least(v_tp - v_np, v_tot - v_n, coalesce(v_qs, v_tot))), 'texto', greatest(0, least(v_tt - v_nt, v_tot - v_n, coalesce(v_qs, v_tot)))),
    'tope', jsonb_build_object('plato', v_tp, 'texto', v_tt, 'total', v_tot),
    'usados', jsonb_build_object('plato', v_np, 'texto', v_nt, 'total', v_n), 'plus', v_plus,
    'por_gimnasio', v_origen = 'gimnasio');
end $$;
revoke all on function public.ia_mi_estado() from public, anon;
grant execute on function public.ia_mi_estado() to authenticated;

-- Aceptar o apagar la IA de Comida (la hoja del permiso y Ajustes → Funciones con IA). Para
-- aceptar hay que haber visto el aviso vigente (p_version = ia_config.aviso_version): si el texto
-- cambió, la app lo vuelve a mostrar. Guarda cuándo (la hora de verdad, no la de la transacción:
-- apagar y volver a prender seguido tiene que quedar en orden) y qué versión. Devuelve ia_mi_estado().
create or replace function public.ia_permiso(p_tipo text, p_acepta boolean, p_version int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_ver int; v_ahora timestamptz := clock_timestamp();
begin
  if v_uid is null then raise exception 'Iniciá sesión para usar la IA.' using errcode = '42501'; end if;
  if p_tipo is null or p_tipo <> 'comida' or p_acepta is null then raise exception 'Pedido inválido.' using errcode = '22023'; end if;
  select coalesce(aviso_version, 1) into v_ver from public.ia_config where id = 1;
  v_ver := coalesce(v_ver, 1);
  if p_acepta and coalesce(p_version, 0) <> v_ver then raise exception 'El aviso cambió: volvé a leerlo.' using errcode = '22023'; end if;
  insert into public.ia_permisos (user_id, comida_ok_at, comida_no_at, version, updated_at)
  values (v_uid, case when p_acepta then v_ahora end, case when not p_acepta then v_ahora end, case when p_acepta then v_ver else 0 end, v_ahora)
  on conflict (user_id) do update
     set comida_ok_at = case when p_acepta then v_ahora else ia_permisos.comida_ok_at end,
         comida_no_at = case when p_acepta then ia_permisos.comida_no_at else v_ahora end,
         version = case when p_acepta then v_ver else ia_permisos.version end,
         updated_at = v_ahora;
  return public.ia_mi_estado();
end $$;
revoke all on function public.ia_permiso(text, boolean, int) from public, anon;
grant execute on function public.ia_permiso(text, boolean, int) to authenticated;

-- «¿Está mal? Avisanos»: guarda lo que estimó la IA (la lista de alimentos, sin la foto) y un
-- comentario opcional. Hasta 20 por día por persona.
create or replace function public.ia_reportar(p_funcion text, p_respuesta jsonb, p_comentario text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_com text := nullif(btrim(coalesce(p_comentario, '')), '');
begin
  if v_uid is null then raise exception 'Iniciá sesión.' using errcode = '42501'; end if;
  if p_funcion is null or p_funcion not in ('plato', 'texto') or p_respuesta is null or jsonb_typeof(p_respuesta) <> 'object'
     or length(p_respuesta::text) > 20000 or char_length(coalesce(v_com, '')) > 300 then
    raise exception 'Pedido inválido.' using errcode = '22023';
  end if;
  if (select count(*) from public.ia_reportes r where r.user_id = v_uid and r.creada >= public.ia_hoy()) >= 20 then
    raise exception 'Ya mandaste muchos avisos hoy. Gracias: mañana podés mandar más.' using errcode = '54000';
  end if;
  insert into public.ia_reportes (user_id, funcion, respuesta, comentario) values (v_uid, p_funcion, p_respuesta, v_com);
end $$;
revoke all on function public.ia_reportar(text, jsonb, text) from public, anon;
grant execute on function public.ia_reportar(text, jsonb, text) to authenticated;

notify pgrst, 'reload schema';
