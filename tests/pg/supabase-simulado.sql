-- Supabase simulado para la base de pruebas (tests/pg.mjs). No es Supabase: es lo mínimo que los
-- supabase/*.sql dan por hecho, en un Postgres común (16, el local o el de la imagen de CI
-- .github/postgres-pruebas/Dockerfile), para que el esquema del repo cargue y la RLS se pruebe
-- con los mismos roles y la misma auth.uid() que en producción.
-- Lo corre el superusuario «postgres». En Supabase, el dueño de lo que crean el SQL Editor y el
-- workflow también es «postgres», pero sin ser superusuario (solo con BYPASSRLS): las dos cosas
-- saltean la RLS, que es lo que importa para las pruebas. Las diferencias con producción están
-- anotadas en tests/pg/README.md.
-- Sin datos de nadie: el único «secreto» es uno de prueba para cron_secret().

-- ===== Roles (los mismos nombres que en Supabase y que .github/workflows/backup.yml) =====
do $$ declare r text; begin
  foreach r in array array['anon','authenticated','service_role','authenticator','supabase_admin',
                           'supabase_auth_admin','supabase_storage_admin','dashboard_user','pgbouncer'] loop
    if not exists (select 1 from pg_roles where rolname = r) then execute format('create role %I nologin noinherit', r); end if;
  end loop; end $$;
alter role service_role bypassrls;
alter role authenticator login;
grant anon, authenticated, service_role to authenticator;

-- ===== Extensiones (en Supabase viven en el esquema extensions) =====
create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
-- pg_trgm la crea productos-off.sql («with schema extensions»). pg_cron y pg_net no existen en un
-- Postgres común: más abajo van sus esquemas con las mismas funciones, y tests/pg.mjs cambia por
-- un comentario cada «create extension if not exists pg_cron/pg_net» de los archivos del repo.

-- ===== auth =====
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

-- Como en Supabase: el sub del JWT (request.jwt.claim.sub, el viejo, o request.jwt.claims).
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'))::text
$$;
create or replace function auth.email() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.email', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email'))::text
$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim', true), ''),
                  nullif(current_setting('request.jwt.claims', true), ''))::jsonb
$$;
grant execute on function auth.uid(), auth.role(), auth.email(), auth.jwt() to anon, authenticated, service_role;

-- auth.users con las columnas de GoTrue que nombran los .sql del repo (admin.sql, cuentas-demo.sql…).
create table if not exists auth.users (
  instance_id uuid, id uuid primary key, aud varchar(255), role varchar(255), email varchar(255),
  encrypted_password varchar(255), email_confirmed_at timestamptz, invited_at timestamptz,
  confirmation_token varchar(255), confirmation_sent_at timestamptz, recovery_token varchar(255),
  recovery_sent_at timestamptz, email_change_token_new varchar(255), email_change varchar(255),
  email_change_sent_at timestamptz, last_sign_in_at timestamptz, raw_app_meta_data jsonb,
  raw_user_meta_data jsonb, is_super_admin boolean, created_at timestamptz default now(),
  updated_at timestamptz default now(), phone text unique, phone_confirmed_at timestamptz,
  banned_until timestamptz, deleted_at timestamptz, is_sso_user boolean not null default false,
  is_anonymous boolean not null default false
);
create table if not exists auth.identities (
  id uuid primary key default gen_random_uuid(), provider_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade, identity_data jsonb not null,
  provider text not null, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz,
  unique (provider_id, provider)
);
create table if not exists auth.sessions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists auth.refresh_tokens (
  id bigserial primary key, token varchar(255), user_id varchar(255), revoked boolean,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  session_id uuid references auth.sessions(id) on delete cascade
);

-- ===== storage =====
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;
create table if not exists storage.buckets (
  id text primary key, name text not null unique, owner uuid, owner_id text,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  public boolean default false, avif_autodetection boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
  name text, owner uuid, owner_id text, created_at timestamptz default now(),
  updated_at timestamptz default now(), last_accessed_at timestamptz default now(),
  metadata jsonb, path_tokens text[] generated always as (string_to_array(name, '/')) stored,
  version text, user_metadata jsonb,
  unique (bucket_id, name)
);
alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;
grant all on storage.buckets, storage.objects to anon, authenticated, service_role;
-- Las de Supabase: las políticas de los buckets dependen de foldername.
create or replace function storage.foldername(name text) returns text[] language plpgsql immutable as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end $$;
create or replace function storage.filename(name text) returns text language plpgsql immutable as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[array_length(_parts, 1)];
end $$;
create or replace function storage.extension(name text) returns text language plpgsql immutable as $$
declare _parts text[]; _filename text;
begin
  select string_to_array(name, '/') into _parts;
  select _parts[array_length(_parts, 1)] into _filename;
  return reverse(split_part(reverse(_filename), '.', 1));
end $$;
grant execute on function storage.foldername(text), storage.filename(text), storage.extension(text) to anon, authenticated, service_role;
-- Storage no deja borrar filas de objects por SQL (base.sql nombra protect_objects_delete).
create or replace function storage.protect_delete() returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('storage.allow_delete_query', true), 'false') <> 'true' then
    raise exception 'Direct deletion from storage tables is not allowed. Use the Storage API instead.'
      using errcode = '42501';
  end if;
  return null;
end $$;
drop trigger if exists protect_objects_delete on storage.objects;
create trigger protect_objects_delete before delete on storage.objects
  for each statement execute function storage.protect_delete();
-- El bucket de las fotos de progreso de antes: existe en producción y ningún .sql lo crea.
insert into storage.buckets (id, name, public) values ('checkins', 'checkins', false) on conflict (id) do nothing;

-- ===== pg_cron (simulado): las tareas quedan anotadas en cron.job y no corren nunca =====
create schema if not exists cron;
create table if not exists cron.job (
  jobid bigserial primary key, schedule text not null, command text not null,
  nodename text not null default 'localhost', nodeport int not null default 5432,
  database text not null default current_database(), username text not null default current_user,
  active boolean not null default true, jobname text unique
);
create table if not exists cron.job_run_details (
  jobid bigint, runid bigserial primary key, job_pid int, database text, username text, command text,
  status text, return_message text, start_time timestamptz, end_time timestamptz
);
create or replace function cron.schedule(job_name text, schedule text, command text) returns bigint
language plpgsql as $$
declare j bigint;
begin
  insert into cron.job (jobname, schedule, command) values (job_name, schedule, command)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
  returning jobid into j;
  return j;
end $$;
create or replace function cron.unschedule(job_name text) returns boolean language plpgsql as $$
begin
  delete from cron.job where jobname = job_name;
  if not found then raise exception 'could not find valid entry for job ''%''', job_name; end if;
  return true;
end $$;

-- ===== pg_net (simulado): los pedidos quedan en una cola y no salen =====
create schema if not exists net;
create table if not exists net.http_request_queue (
  id bigserial primary key, method text, url text, headers jsonb, body jsonb, timeout_milliseconds int,
  created_at timestamptz default now()
);
create or replace function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
  headers jsonb default '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds int default 5000)
returns bigint language plpgsql as $$
declare i bigint;
begin
  insert into net.http_request_queue (method, url, headers, body, timeout_milliseconds)
  values ('POST', url, headers, body, timeout_milliseconds) returning id into i;
  return i;
end $$;

-- ===== vault (cron_secret() lee vault.decrypted_secrets) =====
create schema if not exists vault;
create table if not exists vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, secret text);
create or replace view vault.decrypted_secrets as select id, name, secret, secret as decrypted_secret from vault.secrets;
insert into vault.secrets (name, secret) values ('cron_secret', 'secreto-de-prueba') on conflict (name) do nothing;

-- ===== Realtime: la publicación existe vacía (chat.sql le suma coach_messages) =====
do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

-- ===== Como Supabase: lo que se crea en public nace abierto para anon, authenticated y service_role =====
-- (lo mismo que hace backup.yml). Es lo que vuelve significativos los revoke del repo.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
