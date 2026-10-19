-- Bloquear a otra persona: desde el chat coach ↔ alumno (el «⋯» de un mensaje recibido,
-- app/ui/chat.js) o desde un grupo de la Competencia de pasos (el «⋯» de otro miembro,
-- app/screens/pasos.js). Lo pide Apple (guía 1.2): además de reportar (reportes.sql), cada uno
-- tiene que poder bloquear a quien lo molesta. La hoja «Bloquear» y la lista «Personas
-- bloqueadas» de Configuración están en app/ui/bloquear.js.
--
-- Correr con el workflow "Supabase" → tarea sql → supabase/bloqueos.sql, después de
-- supabase/coach-alumnos.sql, supabase/chat.sql, supabase/pasos-grupos.sql y supabase/reportes.sql
-- (usa profiles, coach_messages, los grupos de pasos y content_reports).
-- Se puede correr varias veces. Mientras no se corra, la app muestra las hojas igual y al bloquear
-- dice «No se pudo, probá de nuevo».
-- OJO: acá están las versiones vigentes de join_coach (la de coach-alumnos.sql, que además no
-- vincula si uno bloqueó al otro) y de pasos_unirse, pasos_ranking, pasos_campeon y
-- pasos_mis_grupos (las de pasos-grupos.sql, que además no muestran a quien bloqueé y no dejan
-- entrar a quien bloqueó el que armó el grupo). Si se vuelve a correr coach-alumnos.sql o
-- pasos-grupos.sql, correr después este.
--
-- Qué pasa al bloquear (block_user):
--   · Si son coach y alumno, se corta el vínculo igual que con coach_remove_client: el alumno
--     queda sin coach y conserva su rutina, sus entrenos y sus registros. Mientras siga el
--     bloqueo no se pueden mandar mensajes (la base no guarda ninguno: trigger de coach_messages)
--     ni volver a vincularse con el código (join_coach), de ningún lado.
--   · En los grupos de pasos: no veo más a esa persona (ni en el ranking ni como campeón), sale
--     de los grupos que armé y no puede volver a entrar a ninguno de ellos (pasos_unirse).
--   · A la otra persona no se le avisa, y los mensajes de la base no dicen quién bloqueó a quién.
--   · Desbloquear (unblock_user) no vuelve a vincular ni a sumar a nadie: si quiere, se vuelve a
--     sumar con el código.
--
-- Quién ve qué:
--   · user_blocks no se lee ni se escribe directo (RLS sin políticas y sin permisos): solo con las
--     funciones de abajo. Cada uno ve a quién bloqueó (my_blocks), con el nombre con que lo veía al
--     bloquearlo (en un grupo, el que se ve en el ranking: nunca el nombre completo del perfil) y
--     un id propio del bloqueo para desbloquear (no el de la cuenta).
--   · El panel (Reportes) ve si quien reportó también bloqueó a quien reportó
--     (admin_reports_blocked).
--   · Tope: 30 bloqueos por persona cada 24 horas (user_block_log: solo quién y cuándo, se borra
--     al día).
--
-- Se borra solo: al borrar una cuenta se van los bloqueos que hizo y los que le hicieron (on delete
-- cascade), y su registro del tope.

-- ===== Tablas =====

create table if not exists public.user_blocks (
  blocker     uuid not null references auth.users(id) on delete cascade,  -- quien bloquea
  blocked     uuid not null references auth.users(id) on delete cascade,  -- a quien bloquea
  created_at  timestamptz not null default now(),
  id          uuid not null default gen_random_uuid(),  -- el que ve la app para desbloquear (no es la cuenta)
  nombre      text,                                     -- cómo lo veía al bloquearlo
  primary key (blocker, blocked)
);
alter table public.user_blocks drop constraint if exists user_blocks_self_check;
alter table public.user_blocks add constraint user_blocks_self_check check (blocker <> blocked);
alter table public.user_blocks drop constraint if exists user_blocks_nombre_check;
alter table public.user_blocks add constraint user_blocks_nombre_check check (char_length(coalesce(nombre, '')) <= 60);
create unique index if not exists user_blocks_id_idx on public.user_blocks (id);
create index if not exists user_blocks_blocked_idx on public.user_blocks (blocked);

-- Bloqueos hechos: solo quién y cuándo, para el tope de 30 por día. Se borran al día.
create table if not exists public.user_block_log (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index if not exists user_block_log_user_idx on public.user_block_log (user_id, created_at);

-- Nadie las toca directo: solo las funciones de abajo (security definer).
alter table public.user_blocks enable row level security;
alter table public.user_block_log enable row level security;
revoke all on public.user_blocks from anon, authenticated;
revoke all on public.user_block_log from anon, authenticated;


-- ===== Uso interno (no se pueden llamar desde la app) =====

-- ¿Alguno de los dos bloqueó al otro?
create or replace function public.bloqueo_entre(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.user_blocks b
                  where (b.blocker = p_a and b.blocked = p_b) or (b.blocker = p_b and b.blocked = p_a));
$$;
revoke all on function public.bloqueo_entre(uuid, uuid) from public, anon, authenticated;

-- ¿Lo bloqueé yo (quien llama)?
create or replace function public.lo_bloquee(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.user_blocks b where b.blocker = auth.uid() and b.blocked = p_user);
$$;
revoke all on function public.lo_bloquee(uuid) from public, anon, authenticated;


-- ===== Bloquear, desbloquear y la lista (la app) =====

-- p_kind 'chat': p_ref es el id de un mensaje recibido y la persona sale del mensaje (lo que mande
--   la app no cuenta), como en report_content. Sin p_ref, la otra punta del vínculo: p_target (un
--   alumno mío, o mi coach) o, si no viene, mi coach.
-- p_kind 'grupo': p_ref es el id del grupo y p_target el miembro como lo da pasos_ranking (la app
--   no ve las cuentas de los demás); tenemos que estar los dos en el grupo.
-- Devuelve {"ok": true, "desvinculado": true/false} (desvinculado: se cortó un vínculo coach ↔
-- alumno). Si ya estaba bloqueada, vuelve a hacer lo de abajo y no cuenta para el tope.
create or replace function public.block_user(p_kind text, p_ref text default null, p_target uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  ref_id uuid;
  quien uuid;
  nombre text;
  cortado boolean;
begin
  if me is null then raise exception 'Tenés que ingresar con tu cuenta.' using errcode = '42501'; end if;
  if coalesce(p_kind, '') not in ('chat', 'grupo') then raise exception 'No se puede bloquear desde acá.' using errcode = 'P0001'; end if;
  -- Un id mal escrito es como uno que no existe.
  if lower(btrim(coalesce(p_ref, ''))) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    ref_id := btrim(p_ref)::uuid;
  end if;

  if p_kind = 'chat' then
    if btrim(coalesce(p_ref, '')) <> '' then
      -- Un mensaje que me mandaron en una conversación mía: lo escribió el otro.
      select case when m.sender = 'client' then m.client_id else m.coach_id end into quien
        from public.coach_messages m
       where m.id = ref_id
         and ((m.coach_id = me and m.sender = 'client') or (m.client_id = me and m.sender = 'coach'));
      if quien is null then raise exception 'No encontramos ese mensaje.' using errcode = 'P0001'; end if;
    elsif p_target is null then
      select p.coach_id into quien from public.profiles p where p.id = me;
    elsif exists (select 1 from public.profiles p where p.id = p_target and p.coach_id = me)
       or exists (select 1 from public.profiles p where p.id = me and p.coach_id = p_target) then
      quien := p_target;
    end if;
    if quien is null then raise exception 'No encontramos a esa persona.' using errcode = 'P0001'; end if;
    select left(coalesce(nullif(btrim(p.full_name), ''), 'Sin nombre'), 60) into nombre from public.profiles p where p.id = quien;
  else
    -- Alguien de un grupo en el que estoy (yo no), con el nombre que se ve en el ranking.
    if public.pasos_soy_miembro(ref_id) then
      select t.user_id, left(t.nombre, 60) into quien, nombre
        from public.pasos_totales(ref_id, public.pasos_hoy(), public.pasos_hoy()) t
       where t.miembro = p_target and t.user_id <> me;
    end if;
    if quien is null then raise exception 'No encontramos a esa persona en el grupo.' using errcode = 'P0001'; end if;
  end if;

  -- De a un bloqueo a la vez por persona: dos toques seguidos no pasan el tope.
  perform pg_advisory_xact_lock(hashtext('bloqueos:' || me::text));
  if not exists (select 1 from public.user_blocks b where b.blocker = me and b.blocked = quien) then
    -- Tope: 30 por persona cada 24 horas.
    delete from public.user_block_log l where l.user_id = me and l.created_at < now() - interval '1 day';
    if (select count(*) from public.user_block_log l where l.user_id = me) >= 30 then
      raise exception 'Bloqueaste a muchas personas hoy. Probá de nuevo mañana.' using errcode = 'P0001';
    end if;
    insert into public.user_block_log (user_id) values (me);
    insert into public.user_blocks (blocker, blocked, nombre) values (me, quien, coalesce(nombre, 'Sin nombre'));
  end if;

  -- Coach ↔ alumno, de cualquiera de los dos lados: se corta el vínculo como con
  -- coach_remove_client (coach-alumnos.sql). El alumno no pierde nada de lo suyo.
  update public.profiles set coach_id = null
   where (id = quien and coach_id = me) or (id = me and coach_id = quien);
  cortado := found;
  -- Grupos de pasos que armé: sale (y no vuelve a entrar mientras siga bloqueada: pasos_unirse).
  delete from public.pasos_miembros m
   using public.pasos_grupos g
   where g.id = m.grupo_id and g.dueno = me and m.user_id = quien;
  return jsonb_build_object('ok', true, 'desvinculado', cortado);
end $$;
revoke all on function public.block_user(text, text, uuid) from public, anon;
grant execute on function public.block_user(text, text, uuid) to authenticated;

-- Desbloquear (p_id: el id del bloqueo que da my_blocks). No vuelve a vincular ni a sumar a
-- nadie a un grupo. Devuelve false si ya no estaba.
create or replace function public.unblock_user(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Tenés que ingresar con tu cuenta.' using errcode = '42501'; end if;
  delete from public.user_blocks b where b.blocker = auth.uid() and b.id = p_id;
  return found;
end $$;
revoke all on function public.unblock_user(uuid) from public, anon;
grant execute on function public.unblock_user(uuid) to authenticated;

-- A quiénes bloqueé, los últimos primero: solo el nombre con que los veía (Configuración →
-- Personas bloqueadas).
create or replace function public.my_blocks()
returns table (id uuid, nombre text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select b.id, coalesce(b.nombre, 'Sin nombre'), b.created_at
    from public.user_blocks b
   where b.blocker = auth.uid()
   order by b.created_at desc;
$$;
revoke all on function public.my_blocks() from public, anon;
grant execute on function public.my_blocks() to authenticated;


-- ===== Chat: sin mensajes si uno bloqueó al otro =====

-- Va como trigger y no adentro de chat_guardar (chat.sql): así vale para cualquier forma de
-- guardar un mensaje (también la de la función de mensajes cuando falta chat_guardar). Al
-- bloquear se corta el vínculo y la función ya no deja escribir, pero por las dudas la base
-- tampoco lo guarda. La función de mensajes muestra el texto tal cual (P0001).
create or replace function public.coach_messages_sin_bloqueo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.bloqueo_entre(new.coach_id, new.client_id) then
    raise exception 'No se pueden mandar mensajes en esta conversación.' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.coach_messages_sin_bloqueo() from public, anon, authenticated;
drop trigger if exists coach_messages_sin_bloqueo on public.coach_messages;
create trigger coach_messages_sin_bloqueo before insert on public.coach_messages
  for each row execute function public.coach_messages_sin_bloqueo();


-- ===== Vincularse a un coach (versión vigente de join_coach) =====

-- La de coach-alumnos.sql (tope de códigos equivocados, plan y cupo del coach) y, además, si uno
-- bloqueó al otro no se vinculan. El mensaje no dice quién bloqueó a quién. Como en
-- coach-alumnos.sql, los mensajes no mandan a renovar ni a ampliar el plan: los ven también las
-- apps de Android e iPhone.
create or replace function public.join_coach(code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare cid uuid; lim int; n int; me uuid := auth.uid();
begin
  if me is null then return false; end if;
  -- Un coach no se vincula a otro coach: el otro vería y editaría su rutina.
  if exists (select 1 from profiles where id = me and role = 'coach') then return false; end if;
  -- De a un intento por persona: varios a la vez no se saltean el tope.
  perform pg_advisory_xact_lock(hashtext('join_coach'), hashtext(me::text));
  delete from join_code_attempts where user_id = me and created_at < now() - interval '1 day';
  if (select count(*) from join_code_attempts where user_id = me) >= 20
     or (select count(*) from join_code_attempts where user_id = me and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Probaste muchos códigos que no existen. Revisalo con tu coach y volvé a intentar en un rato.' using errcode = 'P0001';
  end if;
  select id into cid from profiles where invite_code = upper(trim(code)) and role = 'coach';
  if cid is null then
    -- Queda anotado: sale con return, no con raise (que desharía el insert).
    insert into join_code_attempts (user_id) values (me);
    return false;
  end if;
  if cid = me then return false; end if;
  -- Uno bloqueó al otro (bloqueos.sql): no se vinculan.
  if public.bloqueo_entre(me, cid) then
    raise exception 'No podés sumarte con este código.' using errcode = 'P0001';
  end if;
  if exists (select 1 from profiles where id = me and coach_id = cid) then return true; end if;
  if not public.coach_active(cid) then
    raise exception 'Tu coach tiene el plan de GIZE vencido: por ahora no puede sumar alumnos. Avisale y volvé a intentar.' using errcode = 'P0001';
  end if;
  -- Bloquea la fila del coach: dos clientes a la vez no pasan el cupo.
  select max_clients into lim from coach_billing where coach_id = cid for update;
  select count(*) into n from profiles where coach_id = cid;
  if n >= coalesce(lim, 10) then
    raise exception 'Tu coach llegó al máximo de alumnos: por ahora no puede sumar más. Avisale y volvé a intentar.' using errcode = 'P0001';
  end if;
  update profiles set coach_id = cid where id = me;
  return true;
end $$;
revoke execute on function public.join_coach(text) from public, anon;
grant  execute on function public.join_coach(text) to authenticated;


-- ===== Grupos de pasos (versiones vigentes, las de pasos-grupos.sql con el bloqueo) =====

-- Unirse con el código: como en pasos-grupos.sql y, además, quien armó el grupo no me tiene que
-- haber bloqueado. Mismo tipo de mensaje que cuando te sacaron (no dice que te bloqueó).
create or replace function public.pasos_unirse(p_codigo text, p_apodo text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  c text := upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'));
  gid uuid;
begin
  if me is null then raise exception 'Tenés que ingresar con tu cuenta.' using errcode = '42501'; end if;
  if c !~ '^[A-HJKMNP-Z2-9]{8}$' then raise exception 'Ese código no existe. Revisalo: son 8 letras y números.' using errcode = 'P0001'; end if;
  -- El grupo bloqueado mientras se suma: dos que entran juntos no pasan el máximo.
  select g.id into gid from public.pasos_grupos g where g.codigo = c for update;
  if gid is null then raise exception 'Ese código no existe. Revisalo: son 8 letras y números.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.pasos_miembros m where m.grupo_id = gid and m.user_id = me) then return gid; end if;
  -- El dueño lo sacó: el código (y el link que le quedó) ya no le sirve para este grupo.
  if exists (select 1 from public.pasos_expulsados e where e.grupo_id = gid and e.user_id = me) then
    raise exception 'No podés volver a sumarte a este grupo.' using errcode = 'P0001';
  end if;
  -- Quien armó el grupo me bloqueó: tampoco entro (mientras siga el bloqueo).
  if exists (select 1 from public.pasos_grupos g join public.user_blocks b on b.blocker = g.dueno and b.blocked = me where g.id = gid) then
    raise exception 'No podés sumarte a este grupo.' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('pasos:' || me::text));
  if (select count(*) from public.pasos_miembros m where m.user_id = me) >= 10 then
    raise exception 'Ya estás en 10 grupos, el máximo. Salí de alguno para sumarte a otro.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.pasos_miembros m where m.grupo_id = gid) >= 30 then
    raise exception 'El grupo está completo (30 personas).' using errcode = 'P0001';
  end if;
  insert into public.pasos_miembros (grupo_id, user_id, apodo) values (gid, me, public.pasos_limpiar_apodo(p_apodo));
  return gid;
end $$;

-- Mis grupos: como en pasos-grupos.sql, sin contar a quien bloqueé (ni en cuántos somos ni para
-- mi puesto: así coincide con el ranking que veo).
create or replace function public.pasos_mis_grupos()
returns table (id uuid, nombre text, codigo text, soy_dueno boolean, miembros int, mi_puesto int)
language sql
stable
security definer
set search_path = public
as $$
  with w as (select public.pasos_lunes(public.pasos_hoy()) as desde)
  select g.id, g.nombre, g.codigo, g.dueno = auth.uid(),
         (select count(*) from public.pasos_miembros x where x.grupo_id = g.id and not public.lo_bloquee(x.user_id))::int,
         (select q.puesto from (
            select t.user_id, (rank() over (order by t.pasos desc))::int as puesto
              from public.pasos_totales(g.id, w.desde, w.desde + 6) t
             where not public.lo_bloquee(t.user_id)) q
           where q.user_id = auth.uid())
    from public.pasos_miembros m
    join public.pasos_grupos g on g.id = m.grupo_id
   cross join w
   where m.user_id = auth.uid()
   order by m.unido;
$$;

-- Ranking de esta semana: como en pasos-grupos.sql, sin quien bloqueé (los puestos se cuentan sin
-- esa persona).
create or replace function public.pasos_ranking(p_grupo uuid, p_atras int default 0)
returns table (miembro uuid, nombre text, pasos int, puesto int, soy_yo boolean, desde date, hasta date)
language sql
stable
security definer
set search_path = public
as $$
  with w as (select public.pasos_lunes(public.pasos_hoy()) as desde)
  select t.miembro, t.nombre, t.pasos::int, (rank() over (order by t.pasos desc))::int,
         t.user_id = auth.uid(), w.desde, w.desde + 6
    from w cross join lateral public.pasos_totales(p_grupo, w.desde, w.desde + 6) t
   where public.pasos_soy_miembro(p_grupo)
     and not public.lo_bloquee(t.user_id)
   order by t.pasos desc, t.nombre, t.unido;
$$;

-- Campeón de la semana pasada: como en pasos-grupos.sql. Si el campeón es alguien que bloqueé no
-- se muestra (y no pasa a ser campeón el que le seguía: la semana la ganó otro).
create or replace function public.pasos_campeon(p_grupo uuid)
returns table (miembro uuid, nombre text, pasos int, soy_yo boolean, desde date, hasta date)
language sql
stable
security definer
set search_path = public
as $$
  with w as (select public.pasos_lunes(public.pasos_hoy()) - 7 as desde),
       t as (select t.*, w.desde, max(t.pasos) over () as top
               from w cross join lateral public.pasos_totales(p_grupo, w.desde, w.desde + 6) t
              where public.pasos_soy_miembro(p_grupo)
                and t.unido < ((w.desde + 7)::timestamp at time zone 'America/Argentina/Buenos_Aires'))
  select t.miembro, t.nombre, t.pasos::int, t.user_id = auth.uid(), t.desde, t.desde + 6
    from t
   where t.pasos > 0 and t.pasos = t.top
     and not public.lo_bloquee(t.user_id)
   order by t.unido, t.miembro;
$$;

revoke all on function public.pasos_unirse(text, text) from public, anon;
revoke all on function public.pasos_mis_grupos() from public, anon;
revoke all on function public.pasos_ranking(uuid, int) from public, anon;
revoke all on function public.pasos_campeon(uuid) from public, anon;
grant execute on function public.pasos_unirse(text, text) to authenticated;
grant execute on function public.pasos_mis_grupos() to authenticated;
grant execute on function public.pasos_ranking(uuid, int) to authenticated;
grant execute on function public.pasos_campeon(uuid) to authenticated;


-- ===== Panel (gize.ar/admin → Reportes) =====

-- De estos reportes, cuáles hizo alguien que además bloqueó a la persona reportada (el panel lo
-- marca). Primero chequea que sea administrador, como las demás del panel.
create or replace function public.admin_reports_blocked(p_ids uuid[])
returns table (id uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.admin_assert();
  return query
    select c.id from public.content_reports c
     where c.id = any(p_ids)
       and exists (select 1 from public.user_blocks b where b.blocker = c.reporter and b.blocked = c.reported_user);
end $$;
revoke execute on function public.admin_reports_blocked(uuid[]) from public, anon;
grant execute on function public.admin_reports_blocked(uuid[]) to authenticated;

notify pgrst, 'reload schema';

-- Resumen (solo cantidades: el registro del workflow es público).
select count(*) as bloqueos from public.user_blocks;
