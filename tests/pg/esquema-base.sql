-- Esquema base INFERIDO para la base de pruebas (tests/pg.mjs): las 13 tablas de GIZE que existen en
-- producción y que NINGÚN supabase/*.sql crea (base.sql: «Los CREATE TABLE … no se exportaron»).
-- Se arman desde el uso: lo que la app lee y sube (app/core/supabase.js, app/main.js,
-- app/screens/coach/clientes.js y planes.js) y lo que nombran las funciones de supabase/*.sql.
-- Únicos: los onConflict de la app y los «on conflict» del repo. Índices: solo los que declara el
-- repo (los crean sus archivos, no este). Los tipos, defaults, checks y claves foráneas que el repo
-- no dice van marcados «supuesto». Es la diferencia más grande posible con producción: ver
-- tests/pg/README.md (D1) y supabase/esquema-huella.sql, que la mide cuando el dueño lo apruebe.
-- Las columnas que agrega después un .sql (avatar_path, answers, meal, secs, duration_s,
-- week_plan, deload_routines, habit_alarms, disciplines…) NO van acá: las agrega su archivo.
-- Corre después de tests/pg/supabase-simulado.sql y antes de supabase/base.sql.
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,  -- delete_own_account borra auth.users «y en cascada»
  full_name   text,
  role        text default 'client',          -- supuesto: sin check (el código hace coalesce(role, 'client'))
  invite_code text,
  coach_id    uuid,                            -- la FK (on delete set null) la arma endurecer-base.sql
  created_at  timestamptz not null default now()  -- supuesto
);

create table if not exists public.routines (
  client_id  uuid primary key references public.profiles(id) on delete cascade,  -- upsert onConflict client_id
  days       jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)  -- endurecer-base.sql la pasa a on delete set null
);

create table if not exists public.routine_templates (
  id         uuid primary key default gen_random_uuid(),
  coach_id   uuid not null references public.profiles(id) on delete cascade,
  name       text not null,
  days       jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),   -- supuesto
  updated_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id           uuid primary key default gen_random_uuid(),   -- el id lo genera el celular
  client_id    uuid not null references public.profiles(id) on delete cascade,
  performed_on date not null,
  day_name     text,
  created_at   timestamptz not null default now(),
  rpe          int,       -- supuesto
  pump         int,       -- supuesto
  joint_pain   boolean
);

create table if not exists public.session_entries (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.sessions(id) on delete cascade,  -- borrar el entreno borra sus series
  client_id     uuid not null references public.profiles(id) on delete cascade,
  exercise_name text not null,
  set_order     int,
  kg            numeric,
  reps          int
);

create table if not exists public.body_weights (
  client_id   uuid not null references public.profiles(id) on delete cascade,
  measured_on date not null,
  kg          numeric not null,
  primary key (client_id, measured_on)            -- upsert onConflict client_id,measured_on
);

create table if not exists public.daily_logs (
  client_id   uuid not null references public.profiles(id) on delete cascade,
  log_date    date not null,
  soreness text, performance text, motivation text, hunger text, fatigue text, sleep text,  -- supuesto: text
  comment     text,
  steps       int,
  water_ml    int,
  habits_done jsonb,
  primary key (client_id, log_date)               -- upsert onConflict client_id,log_date
);

create table if not exists public.checkins (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  answers    jsonb,
  adherence  int,
  unique (client_id, week_start)                   -- upsert onConflict client_id,week_start
);

create table if not exists public.food_entries (
  id        uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  log_date  date not null,
  pos       int,
  name      text not null,
  grams     numeric,
  unit      text,
  kcal      numeric,
  protein   numeric,
  carbs     numeric,
  fat       numeric,
  base      jsonb
);

create table if not exists public.client_info (
  client_id    uuid primary key references public.profiles(id) on delete cascade,
  age int, height_cm int, availability text, objective text, stage text, commitment text,
  structure text, block_goal text, injuries text, cardio text, steps_goal int,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references public.profiles(id) on delete set null
);

create table if not exists public.blocks (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.profiles(id) on delete cascade,
  name       text,
  start_date date,
  weeks      int,
  phase      text,
  calories   text,      -- supuesto
  deloads    int[],     -- supuesto (descarga.sql acepta array o jsonb)
  notes      text,
  active     boolean not null default true,
  created_at timestamptz not null default now()   -- supuesto
);

create table if not exists public.nutrition (
  client_id  uuid primary key references public.profiles(id) on delete cascade,
  kcal int, protein int, carbs int, fat int,
  plan       jsonb,
  notes      text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)   -- endurecer-base.sql la pasa a on delete set null
);

create table if not exists public.client_prefs (
  client_id    uuid primary key references public.profiles(id) on delete cascade,
  cal_profile  jsonb,
  cal_target   jsonb,   -- supuesto
  steps_goal   int,
  water_goal   int,
  rest_default int,
  habits       jsonb,
  foods        jsonb,
  updated_at   timestamptz not null default now()
);

-- La tabla de las fotos de progreso de antes (la borra borrar-fotos-progreso.sql).
create table if not exists public.checkin_photos (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.profiles(id) on delete cascade,
  path text, taken_on date, created_at timestamptz default now()
);
