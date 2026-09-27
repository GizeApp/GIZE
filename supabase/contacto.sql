-- Mensajes de contacto: los mails que la gente manda a contacto@gize.ar (o a cualquier
-- dirección @gize.ar) llegan al panel de administrador (gize.ar/admin → Mensajes) con aviso
-- en el celular de los administradores. Se responden desde el panel, con la dirección de
-- GIZE: el mail personal de nadie queda a la vista.
--
-- Cómo llega un mail: Resend recibe el correo del dominio (registro MX de gize.ar) y avisa a la
-- función "contacto" (supabase/functions/contacto), que baja el texto, lo guarda acá y manda
-- la notificación. La respuesta la manda la función "admin" (acción "responder").
--
-- Correr con el workflow "Supabase" → tarea sql → supabase/contacto.sql. Se puede correr varias veces.

create table if not exists public.contact_messages (
  id           bigint generated always as identity primary key,
  resend_id    text unique,                       -- id del mail en Resend (los avisos se reintentan: evita duplicados)
  message_id   text,                              -- Message-ID del mail original (para que la respuesta quede en el mismo hilo)
  from_email   text not null check (char_length(from_email) between 3 and 320),
  from_name    text check (from_name is null or char_length(from_name) <= 200),
  to_email     text check (to_email is null or char_length(to_email) <= 320),
  subject      text check (subject is null or char_length(subject) <= 300),
  body         text not null default '' check (char_length(body) <= 20000),
  body_missing boolean not null default false,    -- no se pudo bajar el texto (se reintenta solo)
  attachments  int not null default 0 check (attachments >= 0),
  created_at   timestamptz not null default now(),
  read_at      timestamptz,
  read_by      uuid references auth.users(id) on delete set null,
  replied_at   timestamptz,
  replied_by   uuid references auth.users(id) on delete set null,
  reply        text check (reply is null or char_length(reply) <= 10000)
);
-- A quién hay que contestar (Reply-To del mail, si lo trae) y si el remitente se pudo
-- verificar (DMARC que informa Resend: pass / fail / …). Un mail que no pasa DMARC puede
-- estar mandado por otra persona haciéndose pasar por esa dirección.
alter table public.contact_messages add column if not exists reply_to text check (reply_to is null or char_length(reply_to) <= 320);
alter table public.contact_messages add column if not exists auth_dmarc text check (auth_dmarc is null or char_length(auth_dmarc) <= 40);
alter table public.contact_messages add column if not exists auth_spf text check (auth_spf is null or char_length(auth_spf) <= 40);
alter table public.contact_messages add column if not exists auth_dkim text check (auth_dkim is null or char_length(auth_dkim) <= 40);
create index if not exists contact_messages_unread_idx on public.contact_messages (created_at desc) where read_at is null;
create index if not exists contact_messages_created_idx on public.contact_messages (created_at desc);

-- Solo el servidor (funciones con la clave de servicio) y las funciones de abajo la tocan.
alter table public.contact_messages enable row level security;
revoke all on public.contact_messages from anon, authenticated;

-- Mensajes sin leer (para el número en el menú). A quien no es administrador le da 0.
create or replace function public.admin_contact_unread()
returns int language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_app_admin() then return 0; end if;
  return (select count(*)::int from public.contact_messages where read_at is null);
end $$;
revoke execute on function public.admin_contact_unread() from public, anon;
grant execute on function public.admin_contact_unread() to authenticated;

-- Lista de mensajes: 'nuevos' (sin leer), 'leidos' o 'todos'. Los más nuevos primero.
-- (drop antes: create or replace no puede cambiar las columnas que devuelve)
drop function if exists public.admin_contact_list(text, int);
create or replace function public.admin_contact_list(kind text default 'nuevos', lim int default 100)
returns table (id bigint, from_email text, from_name text, to_email text, reply_to text, auth_dmarc text, subject text, body text, body_missing boolean,
  attachments int, created_at timestamptz, read_at timestamptz, replied_at timestamptz, reply text, replied_by_name text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_assert();
  return query
    select m.id, m.from_email, m.from_name, m.to_email, m.reply_to, m.auth_dmarc, m.subject, m.body, m.body_missing, m.attachments, m.created_at,
      m.read_at, m.replied_at, m.reply, p.full_name
    from public.contact_messages m
    left join public.profiles p on p.id = m.replied_by
    where case kind when 'nuevos' then m.read_at is null when 'leidos' then m.read_at is not null else true end
    order by m.created_at desc
    limit greatest(1, least(coalesce(lim, 100), 500));
end $$;
revoke execute on function public.admin_contact_list(text, int) from public, anon;
grant execute on function public.admin_contact_list(text, int) to authenticated;

-- Marcar como leído / no leído.
create or replace function public.admin_contact_mark(mid bigint, leido boolean)
returns void language plpgsql security definer set search_path = public as $$
declare f text;
begin
  perform public.admin_assert();
  update public.contact_messages
    set read_at = case when leido then coalesce(read_at, now()) else null end,
        read_by = case when leido then coalesce(read_by, auth.uid()) else null end
    where id = mid
    returning from_email into f;
  if f is null then raise exception 'No existe ese mensaje.' using errcode = '22023'; end if;
  perform public.admin_log(case when leido then 'contacto_leido' else 'contacto_no_leido' end, mid::text, jsonb_build_object('de', f));
end $$;
revoke execute on function public.admin_contact_mark(bigint, boolean) from public, anon;
grant execute on function public.admin_contact_mark(bigint, boolean) to authenticated;

notify pgrst, 'reload schema';

-- Resumen (solo cantidades).
select count(*) as mensajes, count(*) filter (where read_at is null) as sin_leer from public.contact_messages;
