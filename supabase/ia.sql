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
-- sin_ciclo, creditos, admin), tope_mes, ahorro, ritmo, tope_dia, tope_persona, error.
--
-- La app (foto del plato y «Contame qué comiste») pregunta ia_mi_estado() para saber si muestra
-- los botones, guarda el permiso con ia_permiso() y los avisos de «¿Está mal?» con ia_reportar().
--
-- Correr con el workflow "Supabase" → tarea sql → supabase/ia.sql, después de
-- supabase/admin.sql, supabase/cupo-plan.sql y supabase/pedidos-productos.sql (las columnas ai_*
-- de los pedidos); food_entries es de supabase/base.sql. Se puede correr varias veces. Usa
-- pg_cron (como descanso.sql).

-- ---------- configuración (una sola fila) ----------
create table if not exists public.ia_config (
  id            int primary key default 1 check (id = 1),
  activa        boolean not null default false,
  funciones     jsonb not null default '{"etiqueta_admin":false,"etiqueta_usuario":false,"plato":false,"texto":false,"rutina":false,"resumen":false}',
  -- Modelo elegido para cada función. Vacío: el de la función (supabase/functions/ia/precios.ts,
  -- que es la única lista de modelos; uno que no esté ahí no se usa).
  modelos       jsonb not null default '{}',
  topes         jsonb not null default '{"alumno":{"etiqueta":10,"plato":8,"texto":15,"total":25,"usd_ciclo":0.5},"coach":{"etiqueta":10,"plato":8,"texto":15,"rutina":15,"resumen":3,"total":40,"usd_ciclo":5},"admin":{"etiqueta":300,"total":300,"usd_ciclo":10}}',
  ancla         timestamptz,            -- un vencimiento de los créditos, a las 00:00 UTC
  pedidos_desde timestamptz,            -- desde cuándo se leen pedidos con IA (cambio de la política)
  aviso_version int not null default 1, -- versión del aviso de permiso de la app
  updated_at    timestamptz not null default now()
);
alter table public.ia_config alter column activa set default false;
insert into public.ia_config (id) values (1) on conflict (id) do nothing;
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
  rol         text not null check (rol in ('alumno', 'coach', 'admin')),
  funcion     text not null check (funcion in ('etiqueta', 'plato', 'texto', 'rutina', 'resumen')),
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

-- Lo anotado en el diario con la foto del plato o con «Contame qué comiste»: «ia» tal como lo
-- estimó, «ia-editado» si la persona cambió los gramos o el alimento. Lo escribe la app con
-- las políticas de siempre de food_entries.
alter table public.food_entries add column if not exists fuente text check (fuente is null or fuente in ('ia', 'ia-editado'));

-- ---------- RLS: nada se lee ni se escribe directo desde la app ----------
alter table public.ia_config enable row level security;
alter table public.ia_ciclos enable row level security;
alter table public.ia_llamadas enable row level security;
alter table public.ia_permisos enable row level security;
alter table public.ia_reportes enable row level security;
revoke all on public.ia_config from anon, authenticated;
revoke all on public.ia_ciclos from anon, authenticated;
revoke all on public.ia_llamadas from anon, authenticated;
revoke all on public.ia_permisos from anon, authenticated;
revoke all on public.ia_reportes from anon, authenticated;
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
-- tope del ciclo → modo ahorro → ritmo del día → tope del día de la persona (por función y en
-- total) → tope del ciclo de la persona. Si pasa todo, anota la llamada como «reservada» y suma
-- max_usd a lo reservado del ciclo. Devuelve { ok, codigo, motivo, vuelve, llamada_id, ciclo_id, ahorro }.
create or replace function public.ia_reservar(p_uid uuid, p_rol text, p_funcion text, p_modelo text, p_max_usd numeric, p_pedido bigint default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cfg public.ia_config; v_c public.ia_ciclos; v_bandera text; v_hoy0 timestamptz; v_manana timestamptz;
  v_hoy numeric; v_limite numeric; v_dias numeric; v_tope_f numeric; v_tope_t numeric; v_n_f int; v_n_t int;
  v_mio numeric; v_usd_ciclo numeric; v_id bigint; v_ahorro boolean := false;
begin
  if p_uid is null or p_rol is null or p_rol not in ('alumno', 'coach', 'admin')
     or p_funcion is null or p_funcion not in ('etiqueta', 'plato', 'texto', 'rutina', 'resumen')
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

  -- 5) Modo ahorro: plato y texto solo para alumnos de coach con plan (y coaches); la rutina pasa
  --    al modelo barato (lo elige la función); la tabla sigue para todos.
  if v_c.estado = 'normal' and v_c.gastado + v_c.reservado >= v_c.ahorro then
    update public.ia_ciclos set estado = 'ahorro', ahorro_at = coalesce(ahorro_at, now()) where id = v_c.id returning * into v_c;
  end if;
  if v_c.estado = 'ahorro' then
    if p_funcion in ('plato', 'texto') and p_rol = 'alumno'
       and not exists (select 1 from public.profiles p where p.id = p_uid and p.coach_id is not null and public.coach_pago(p.coach_id)) then
      perform public.ia_frenada(v_c.id, 'ahorro');
      return jsonb_build_object('ok', false, 'codigo', 'ahorro', 'vuelve', v_c.fin);
    end if;
    v_ahorro := p_funcion = 'rutina';
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
  v_tope_f := coalesce((v_cfg.topes -> p_rol ->> p_funcion)::numeric, 0);
  v_tope_t := coalesce((v_cfg.topes -> p_rol ->> 'total')::numeric, 0);
  select count(*) filter (where l.funcion = p_funcion), count(*) into v_n_f, v_n_t
    from public.ia_llamadas l
   where l.user_id = p_uid and l.rol = p_rol and l.creada >= v_hoy0
     and (l.estado in ('ok', 'vacia', 'reservada', 'vencida') or (l.estado = 'error' and (l.usd is null or l.usd > 0)));
  if v_n_f >= v_tope_f or v_n_t >= v_tope_t then
    perform public.ia_frenada(v_c.id, 'tope_dia');
    return jsonb_build_object('ok', false, 'codigo', 'tope_dia', 'vuelve', v_manana, 'tope', case when v_n_f >= v_tope_f then v_tope_f else v_tope_t end);
  end if;

  -- 8) Tope del ciclo de la persona (también solo con el mismo rol).
  v_usd_ciclo := coalesce((v_cfg.topes -> p_rol ->> 'usd_ciclo')::numeric, 0);
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
    'clave_rechazada', (select max(l.creada) from public.ia_llamadas l where l.codigo = 'clave_rechazada'
        and not exists (select 1 from public.ia_llamadas k where k.estado in ('ok', 'vacia') and k.creada > l.creada)),
    'ultimas', coalesce((select jsonb_agg(to_jsonb(x) order by x.creada desc)
        from (select l.creada, l.rol, l.origen, l.funcion, l.modelo, l.estado, l.codigo, l.usd, l.max_usd, l.ms from public.ia_llamadas l order by l.id desc limit 50) x), '[]'::jsonb));
end $$;
revoke all on function public.admin_ia_estado() from public, anon;
grant execute on function public.admin_ia_estado() to authenticated;

-- Cambiar la configuración: { activa, funciones: {…}, modelos: {…}, topes: {rol: {…}},
-- pedidos_desde, umbrales: {aviso, ahorro, tope, credito} } (solo lo que venga). Las claves de
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
      if v_k not in ('etiqueta', 'plato', 'texto', 'rutina', 'resumen') then raise exception 'Función desconocida: %', v_k using errcode = '22023'; end if;
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
  update public.ia_config
     set activa = v_cfg.activa, funciones = v_cfg.funciones, modelos = v_cfg.modelos, topes = v_cfg.topes,
         pedidos_desde = v_cfg.pedidos_desde, updated_at = now()
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

-- ---------- la app: foto del plato y «Contame qué comiste» ----------
-- Lo que la app necesita saber para mostrar (o no) los botones de la IA, sin montos:
--   { activa, funciones: { plato, texto }, permiso_comida ('ok' | 'no' | 'viejo' | null),
--     aviso_version, estado ('normal' | 'ahorro' | 'pausada' | 'tope_mes' | 'tope_persona'),
--     vuelve, quedan: { plato, texto }, tope: { plato, texto, total }, usados: { plato, texto, total },
--     por_gimnasio (true: usa los topes de coach por ser profe de un gimnasio, ver ia_rol_origen) }
-- Una función está prendida para la app solo con el interruptor general, la de la función y la
-- fecha de los créditos cargada (sin eso la función nunca llama a la IA): si no, la app no
-- muestra nada nuevo. «quedan»: cuántos usos le quedan hoy a la persona (por función y en total).
create or replace function public.ia_mi_estado()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_cfg public.ia_config; v_c public.ia_ciclos; v_ini timestamptz; v_fin timestamptz;
  v_on boolean; v_plato boolean; v_texto boolean; v_rol text; v_origen text; v_hoy0 timestamptz; v_estado text := 'normal'; v_vuelve timestamptz;
  v_np int; v_nt int; v_n int; v_tp numeric; v_tt numeric; v_tot numeric; v_mio numeric;
begin
  if v_uid is null then return jsonb_build_object('activa', false, 'funciones', jsonb_build_object('plato', false, 'texto', false)); end if;
  select * into v_cfg from public.ia_config where id = 1;
  v_on := coalesce(v_cfg.activa, false) and v_cfg.ancla is not null;
  v_plato := v_on and coalesce(v_cfg.funciones -> 'plato', 'false'::jsonb) = 'true'::jsonb;
  v_texto := v_on and coalesce(v_cfg.funciones -> 'texto', 'false'::jsonb) = 'true'::jsonb;
  if not (v_plato or v_texto) then
    return jsonb_build_object('activa', false, 'funciones', jsonb_build_object('plato', false, 'texto', false),
      'permiso_comida', public.ia_permiso_estado(v_uid), 'aviso_version', coalesce(v_cfg.aviso_version, 1));
  end if;
  v_origen := public.ia_rol_origen(v_uid);
  v_rol := case when v_origen is not null then 'coach' else 'alumno' end;   -- lo mismo que ia_rol
  -- El ciclo de ahora (sin crearlo: esto solo mira).
  select x.inicio, x.fin into v_ini, v_fin from public.ia_ciclo_de(v_cfg.ancla, now()) x;
  select * into v_c from public.ia_ciclos where inicio = v_ini;
  if v_c.estado = 'cortado' then
    if v_c.cortado_por in ('creditos', 'limite_console') and now() >= coalesce(v_c.vuelve, '-infinity'::timestamptz) then v_estado := 'normal';
    elsif v_c.cortado_por in ('creditos', 'admin') then v_estado := 'pausada';
    else v_estado := 'tope_mes'; v_vuelve := coalesce(v_c.vuelve, v_c.fin);
    end if;
  elsif (v_c.estado = 'ahorro' or v_c.gastado + v_c.reservado >= v_c.ahorro) and v_rol = 'alumno'
        and not exists (select 1 from public.profiles p where p.id = v_uid and p.coach_id is not null and public.coach_pago(p.coach_id)) then
    v_estado := 'ahorro'; v_vuelve := v_fin;
  end if;
  -- Lo de hoy de la persona: cuenta lo mismo que ia_reservar (solo con el rol de la app).
  v_hoy0 := public.ia_hoy();
  select count(*) filter (where l.funcion = 'plato'), count(*) filter (where l.funcion = 'texto'), count(*) into v_np, v_nt, v_n
    from public.ia_llamadas l
   where l.user_id = v_uid and l.rol = v_rol and l.creada >= v_hoy0
     and (l.estado in ('ok', 'vacia', 'reservada', 'vencida') or (l.estado = 'error' and (l.usd is null or l.usd > 0)));
  v_tp := coalesce((v_cfg.topes -> v_rol ->> 'plato')::numeric, 0);
  v_tt := coalesce((v_cfg.topes -> v_rol ->> 'texto')::numeric, 0);
  v_tot := coalesce((v_cfg.topes -> v_rol ->> 'total')::numeric, 0);
  if v_estado = 'normal' and v_c.id is not null then
    select coalesce(sum(coalesce(l.usd, l.max_usd)), 0) into v_mio from public.ia_llamadas l where l.ciclo_id = v_c.id and l.user_id = v_uid and l.rol = v_rol;
    if v_mio >= coalesce((v_cfg.topes -> v_rol ->> 'usd_ciclo')::numeric, 0) then v_estado := 'tope_persona'; v_vuelve := v_fin; end if;
  end if;
  return jsonb_build_object('activa', true, 'funciones', jsonb_build_object('plato', v_plato, 'texto', v_texto),
    'permiso_comida', public.ia_permiso_estado(v_uid), 'aviso_version', coalesce(v_cfg.aviso_version, 1),
    'estado', v_estado, 'vuelve', v_vuelve, 'manana', v_hoy0 + interval '1 day',
    'quedan', jsonb_build_object('plato', greatest(0, least(v_tp - v_np, v_tot - v_n)), 'texto', greatest(0, least(v_tt - v_nt, v_tot - v_n))),
    'tope', jsonb_build_object('plato', v_tp, 'texto', v_tt, 'total', v_tot),
    'usados', jsonb_build_object('plato', v_np, 'texto', v_nt, 'total', v_n),
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
