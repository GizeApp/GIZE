-- Reportar contenido: un mensaje recibido en el chat coach ↔ alumno (app/ui/chat.js) o el nombre
-- de alguien de un grupo de la Competencia de pasos (app/screens/pasos.js). Lo piden Apple (guía
-- 1.2) y Google Play (política de contenido generado por usuarios): donde la gente intercambia
-- contenido, tiene que poder reportar lo ofensivo. La hoja «Reportar» de la app está en
-- app/ui/reportar.js; los reportes se revisan en gize.ar/admin → Reportes (admin/admin.js).
--
-- Correr con el workflow "Supabase" → tarea sql → supabase/reportes.sql, después de
-- supabase/chat.sql, supabase/pasos-grupos.sql y supabase/admin.sql (usa coach_messages, los
-- grupos de pasos, admin_assert y admin_log). Se puede correr varias veces. Mientras no se corra,
-- la app muestra la hoja igual y al mandar dice «No se pudo enviar, probá de nuevo».
--
-- Quién ve qué:
--   · La tabla no se lee ni se escribe directo (RLS sin políticas y sin permisos): se reporta con
--     report_content, que mira que quien reporta pueda ver lo que reporta, y la leen solo los
--     administradores, desde el panel. A quien reportan no se le avisa nada.
--   · Del chat, el panel muestra el texto del mensaje y la fecha; de un audio, solo cuánto dura
--     (el archivo nunca). De un grupo, el nombre que se veía al reportar y el nombre del grupo.
--   · Topes: 20 reportes por persona cada 24 horas. El mismo reporte (misma persona, mismo
--     mensaje o miembro y mismo motivo) dentro de las 24 horas no suma otra fila.
--
-- Se borra solo: al borrar la cuenta de quien reportaron se van sus reportes (on delete cascade);
-- al borrar la de quien reportó, el reporte queda sin su cuenta, para poder revisarlo igual.

-- ===== Tabla =====

create table if not exists public.content_reports (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  reporter       uuid default auth.uid() references auth.users(id) on delete set null,
  reported_user  uuid not null references auth.users(id) on delete cascade,
  kind           text not null,                  -- 'chat' (un mensaje) o 'grupo' (alguien de un grupo de pasos)
  ref            text not null,                  -- chat: id del mensaje; grupo: id del grupo
  reason         text not null,
  detail         text,                           -- lo que escribió quien reporta (opcional)
  reported_name  text,                           -- grupo: el nombre que se veía al reportar (después lo puede cambiar)
  group_name     text,                           -- grupo: el nombre del grupo al reportar (el grupo se puede borrar)
  status         text not null default 'nuevo',
  reviewed_at    timestamptz,
  reviewed_by    uuid references auth.users(id) on delete set null
);
alter table public.content_reports drop constraint if exists content_reports_kind_check;
alter table public.content_reports add constraint content_reports_kind_check check (kind in ('chat', 'grupo'));
-- ref es siempre un uuid escrito (así el panel lo puede cruzar con el mensaje o el grupo).
alter table public.content_reports drop constraint if exists content_reports_ref_check;
alter table public.content_reports add constraint content_reports_ref_check check (ref ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
-- Los motivos de la hoja: «Contenido ofensivo o acoso», «Spam» y «Otro».
alter table public.content_reports drop constraint if exists content_reports_reason_check;
alter table public.content_reports add constraint content_reports_reason_check check (reason in ('ofensivo', 'spam', 'otro'));
alter table public.content_reports drop constraint if exists content_reports_detail_check;
alter table public.content_reports add constraint content_reports_detail_check check (detail is null or char_length(detail) <= 500);
alter table public.content_reports drop constraint if exists content_reports_names_check;
alter table public.content_reports add constraint content_reports_names_check
  check (char_length(coalesce(reported_name, '')) <= 60 and char_length(coalesce(group_name, '')) <= 60);
alter table public.content_reports drop constraint if exists content_reports_status_check;
alter table public.content_reports add constraint content_reports_status_check check (status in ('nuevo', 'revisado'));

create index if not exists content_reports_status_idx on public.content_reports (status, created_at desc);
create index if not exists content_reports_reporter_idx on public.content_reports (reporter, created_at desc);
create index if not exists content_reports_reported_idx on public.content_reports (reported_user);

-- Nadie la toca directo: solo las funciones de abajo (security definer).
alter table public.content_reports enable row level security;
revoke all on public.content_reports from anon, authenticated;


-- ===== Reportar (la app) =====

-- p_kind: 'chat' o 'grupo'. p_ref: el id del mensaje (chat) o del grupo (grupo).
-- p_reported: en un grupo, el miembro como lo da pasos_ranking (la app no ve las cuentas de los
-- demás); en el chat no hace falta: la persona sale del mensaje (lo que mande la app no cuenta).
-- p_reason: 'ofensivo', 'spam' u 'otro'. p_detail: nota opcional (hasta 500 letras).
-- Devuelve {"ok": true} también cuando el reporte ya estaba (no se duplica).
create or replace function public.report_content(p_kind text, p_ref text, p_reported uuid, p_reason text, p_detail text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  motivo text := lower(btrim(coalesce(p_reason, '')));
  nota text := nullif(left(btrim(regexp_replace(coalesce(p_detail, ''), '\s+', ' ', 'g')), 500), '');
  ref_id uuid;
  quien uuid;
  nombre text;
  grupo text;
begin
  if me is null then raise exception 'Tenés que ingresar con tu cuenta.' using errcode = '42501'; end if;
  if coalesce(p_kind, '') not in ('chat', 'grupo') then raise exception 'Eso no se puede reportar.' using errcode = 'P0001'; end if;
  if motivo not in ('ofensivo', 'spam', 'otro') then raise exception 'Elegí un motivo.' using errcode = 'P0001'; end if;
  -- Un id mal escrito es como uno que no existe.
  if lower(btrim(coalesce(p_ref, ''))) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    ref_id := btrim(p_ref)::uuid;
  end if;

  if p_kind = 'chat' then
    -- Un mensaje que me mandaron en una conversación mía: soy el coach y lo escribió el alumno, o
    -- soy el alumno y lo escribió el coach. Los propios no se reportan.
    select case when m.sender = 'client' then m.client_id else m.coach_id end into quien
      from public.coach_messages m
     where m.id = ref_id
       and ((m.coach_id = me and m.sender = 'client') or (m.client_id = me and m.sender = 'coach'));
    if quien is null then raise exception 'No encontramos ese mensaje.' using errcode = 'P0001'; end if;
  else
    -- Alguien de un grupo en el que estoy (yo no), con el nombre que se ve en el ranking.
    if public.pasos_soy_miembro(ref_id) then
      select t.user_id, left(t.nombre, 60) into quien, nombre
        from public.pasos_totales(ref_id, public.pasos_hoy(), public.pasos_hoy()) t
       where t.miembro = p_reported and t.user_id <> me;
      select left(g.nombre, 60) into grupo from public.pasos_grupos g where g.id = ref_id;
    end if;
    if quien is null then raise exception 'No encontramos a esa persona en el grupo.' using errcode = 'P0001'; end if;
  end if;

  -- De a un reporte a la vez por persona: dos toques seguidos no pasan los topes.
  perform pg_advisory_xact_lock(hashtext('reportes:' || me::text));
  -- El mismo reporte en las últimas 24 horas: listo, sin otra fila.
  if exists (select 1 from public.content_reports c
              where c.reporter = me and c.kind = p_kind and c.ref = ref_id::text and c.reported_user = quien
                and c.reason = motivo and c.created_at > now() - interval '24 hours') then
    return jsonb_build_object('ok', true);
  end if;
  -- Tope: 20 por persona cada 24 horas (nadie llena el panel a reportes).
  if (select count(*) from public.content_reports c
       where c.reporter = me and c.created_at > now() - interval '24 hours') >= 20 then
    raise exception 'Mandaste muchos reportes hoy. Probá de nuevo mañana.' using errcode = 'P0001';
  end if;
  insert into public.content_reports (reporter, reported_user, kind, ref, reason, detail, reported_name, group_name)
  values (me, quien, p_kind, ref_id::text, motivo, nota, nombre, grupo);
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.report_content(text, text, uuid, text, text) from public, anon;
grant execute on function public.report_content(text, text, uuid, text, text) to authenticated;


-- ===== Panel (gize.ar/admin → Reportes) =====

-- Reportes sin revisar (el número en el menú y en «Para atender»). A quien no es administrador le
-- da 0.
create or replace function public.admin_reports_pending()
returns int language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_app_admin() then return 0; end if;
  return (select count(*)::int from public.content_reports where status = 'nuevo');
end $$;
revoke execute on function public.admin_reports_pending() from public, anon;
grant execute on function public.admin_reports_pending() to authenticated;

-- Lista: 'nuevo' (sin revisar, los que más esperan primero) o 'revisado' (los últimos 200). Con lo
-- justo para decidir: del chat, el texto y la fecha del mensaje (de un audio, solo cuánto dura: el
-- archivo nunca); de un grupo, el nombre que se veía, el de ahora (null si ya no está) y el del
-- grupo. reported_total: cuántos reportes tiene esa cuenta en total.
-- (drop antes: create or replace no puede cambiar las columnas que devuelve)
drop function if exists public.admin_reports_list(text);
create or replace function public.admin_reports_list(p_status text default 'nuevo')
returns table (id uuid, created_at timestamptz, kind text, reason text, detail text, status text, reviewed_at timestamptz,
  reviewed_by_name text, reporter_id uuid, reporter_name text, reported_id uuid, reported_name text, reported_total int,
  msg_body text, msg_audio_secs int, msg_at timestamptz, member_name text, member_name_now text, group_name text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_assert();
  return query
    select c.id, c.created_at, c.kind, c.reason, c.detail, c.status, c.reviewed_at,
           rv.full_name, c.reporter, rp.full_name, c.reported_user, dp.full_name,
           (select count(*)::int from public.content_reports x where x.reported_user = c.reported_user),
           m.body, m.audio_secs, m.created_at,
           c.reported_name,
           (select coalesce(nullif(btrim(pm.apodo), ''), nullif(split_part(btrim(coalesce(dp.full_name, '')), ' ', 1), ''), 'Sin nombre')
              from public.pasos_miembros pm
             where c.kind = 'grupo' and pm.grupo_id = c.ref::uuid and pm.user_id = c.reported_user),
           coalesce(g.nombre, c.group_name)
      from public.content_reports c
      left join public.profiles rp on rp.id = c.reporter
      left join public.profiles dp on dp.id = c.reported_user
      left join public.profiles rv on rv.id = c.reviewed_by
      left join public.coach_messages m on c.kind = 'chat' and m.id = c.ref::uuid
      left join public.pasos_grupos g on c.kind = 'grupo' and g.id = c.ref::uuid
     where c.status = case when p_status = 'revisado' then 'revisado' else 'nuevo' end
     order by case when p_status = 'revisado' then c.reviewed_at end desc nulls last, c.created_at
     limit 200;
end $$;
revoke execute on function public.admin_reports_list(text) from public, anon;
grant execute on function public.admin_reports_list(text) to authenticated;

-- Marcar revisado. Queda en el registro de acciones, sobre la cuenta reportada. Si otro
-- administrador ya lo había marcado, no cambia nada (ni se anota dos veces).
create or replace function public.admin_report_review(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  quien uuid;
  k text;
  r text;
begin
  perform public.admin_assert();
  update public.content_reports
     set status = 'revisado', reviewed_at = now(), reviewed_by = auth.uid()
   where id = p_id and status = 'nuevo'
  returning reported_user, kind, reason into quien, k, r;
  if quien is null then
    if exists (select 1 from public.content_reports c where c.id = p_id) then return; end if;
    raise exception 'No existe ese reporte.' using errcode = '22023';
  end if;
  perform public.admin_log('reporte_revisado', quien::text, jsonb_build_object('reporte', p_id, 'tipo', k, 'motivo', r));
end $$;
revoke execute on function public.admin_report_review(uuid) from public, anon;
grant execute on function public.admin_report_review(uuid) to authenticated;

notify pgrst, 'reload schema';

-- Resumen (solo cantidades: el registro del workflow es público).
select count(*) as reportes, count(*) filter (where status = 'nuevo') as sin_revisar from public.content_reports;
