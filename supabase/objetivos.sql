-- Objetivos y tareas del panel de administración (gize.ar/admin → Inicio): metas con fecha sobre las
-- métricas del resumen (ej: 40 coaches pagando al 31/12). El avance se calcula solo con los datos
-- reales de admin_overview; acá se guarda la meta y el valor con el que arrancó, para medir el
-- ritmo. Solo lo ven los administradores.
--
-- Correr con el workflow "Supabase" → tarea sql → supabase/objetivos.sql, después de
-- supabase/admin.sql (usa admin_assert, admin_log y admin_overview). Se puede correr varias veces.

-- Las métricas son claves de admin_overview (y las mismas de METRICS en admin/admin.js).
create table if not exists public.admin_goals (
  id         bigint generated always as identity primary key,
  metric     text not null check (metric in ('users','active7','sessions7','coaches','paid','mrr','linked','products')),
  target     numeric(14,2) not null check (target > 0 and target < 1000000000000),
  deadline   date not null,
  label      text check (label is null or char_length(label) <= 80),
  baseline   numeric(14,2) not null default 0,  -- cuánto había al crearla (o al cambiar de métrica)
  started_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.admin_goals enable row level security;
revoke all on public.admin_goals from anon, authenticated;

create or replace function public.admin_goals()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_assert();
  return (select coalesce(jsonb_agg(to_jsonb(g) order by g.deadline, g.id), '[]') from public.admin_goals g);
end $$;
revoke execute on function public.admin_goals() from public, anon;
grant execute on function public.admin_goals() to authenticated;

-- Agregar (p_id null) o cambiar un objetivo. Al crearlo, o al cambiarle la métrica, el punto de
-- partida es el valor de hoy.
create or replace function public.admin_goal_save(p_id bigint, p_metric text, p_target numeric, p_deadline date, p_label text)
returns bigint language plpgsql security definer set search_path = public as $$
declare rid bigint; cur numeric; old text;
begin
  perform public.admin_assert();
  if p_deadline is null then raise exception 'Elegí la fecha del objetivo.' using errcode = 'P0001'; end if;
  cur := coalesce((public.admin_overview() ->> p_metric)::numeric, 0);
  if p_id is null then
    if p_deadline < current_date then raise exception 'La fecha ya pasó.' using errcode = 'P0001'; end if;
    insert into public.admin_goals (metric, target, deadline, label, baseline)
    values (p_metric, p_target, p_deadline, nullif(btrim(p_label), ''), cur)
    returning id into rid;
  else
    select metric into old from public.admin_goals where id = p_id;
    if old is null then raise exception 'Ese objetivo ya no existe.' using errcode = 'P0001'; end if;
    update public.admin_goals set metric = p_metric, target = p_target, deadline = p_deadline, label = nullif(btrim(p_label), ''),
           baseline = case when old = p_metric then baseline else cur end,
           started_at = case when old = p_metric then started_at else now() end, updated_at = now()
     where id = p_id returning id into rid;
  end if;
  perform public.admin_log(case when p_id is null then 'objetivo_nuevo' else 'objetivo' end, rid::text,
    jsonb_build_object('metric', p_metric, 'target', p_target, 'deadline', p_deadline, 'label', nullif(btrim(p_label), '')));
  return rid;
end $$;
revoke execute on function public.admin_goal_save(bigint, text, numeric, date, text) from public, anon;
grant execute on function public.admin_goal_save(bigint, text, numeric, date, text) to authenticated;

create or replace function public.admin_goal_delete(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare m text; t numeric;
begin
  perform public.admin_assert();
  delete from public.admin_goals where id = p_id returning metric, target into m, t;
  if m is not null then perform public.admin_log('objetivo_borrar', p_id::text, jsonb_build_object('metric', m, 'target', t)); end if;
end $$;
revoke execute on function public.admin_goal_delete(bigint) from public, anon;
grant execute on function public.admin_goal_delete(bigint) to authenticated;

-- Tareas: lo que hay que hacer para llegar a los objetivos (o cualquier otra cosa), con fecha
-- opcional y, si se quiere, atada a un objetivo. Se marcan como hechas desde el Inicio.
create table if not exists public.admin_tasks (
  id         bigint generated always as identity primary key,
  title      text not null check (char_length(btrim(title)) between 1 and 200),
  due_date   date,
  goal_id    bigint references public.admin_goals(id) on delete set null,
  done       boolean not null default false,
  done_at    timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.admin_tasks enable row level security;
revoke all on public.admin_tasks from anon, authenticated;
create index if not exists admin_tasks_goal on public.admin_tasks (goal_id);

-- Pendientes primero (por fecha, las sin fecha al final) y después las hechas, las más nuevas arriba.
create or replace function public.admin_tasks()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_assert();
  return (select coalesce(jsonb_agg(to_jsonb(t) order by t.done, case when t.done then null else t.due_date end nulls last, t.done_at desc nulls last, t.id), '[]')
            from public.admin_tasks t where not t.done or t.done_at > now() - interval '90 days');
end $$;
revoke execute on function public.admin_tasks() from public, anon;
grant execute on function public.admin_tasks() to authenticated;

-- Agregar (p_id null) o cambiar una tarea.
create or replace function public.admin_task_save(p_id bigint, p_title text, p_due date, p_goal bigint)
returns bigint language plpgsql security definer set search_path = public as $$
declare rid bigint;
begin
  perform public.admin_assert();
  if p_id is null then
    insert into public.admin_tasks (title, due_date, goal_id, created_by) values (btrim(p_title), p_due, p_goal, auth.uid()) returning id into rid;
  else
    update public.admin_tasks set title = btrim(p_title), due_date = p_due, goal_id = p_goal, updated_at = now() where id = p_id returning id into rid;
    if rid is null then raise exception 'Esa tarea ya no existe.' using errcode = 'P0001'; end if;
  end if;
  perform public.admin_log(case when p_id is null then 'tarea_nueva' else 'tarea' end, rid::text, jsonb_build_object('title', btrim(p_title), 'due', p_due));
  return rid;
end $$;
revoke execute on function public.admin_task_save(bigint, text, date, bigint) from public, anon;
grant execute on function public.admin_task_save(bigint, text, date, bigint) to authenticated;

create or replace function public.admin_task_done(p_id bigint, p_done boolean)
returns void language plpgsql security definer set search_path = public as $$
declare l text;
begin
  perform public.admin_assert();
  update public.admin_tasks set done = p_done, done_at = case when p_done then now() end, updated_at = now() where id = p_id returning title into l;
  if l is not null then perform public.admin_log(case when p_done then 'tarea_hecha' else 'tarea_deshacer' end, p_id::text, jsonb_build_object('title', l)); end if;
end $$;
revoke execute on function public.admin_task_done(bigint, boolean) from public, anon;
grant execute on function public.admin_task_done(bigint, boolean) to authenticated;

create or replace function public.admin_task_delete(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare l text;
begin
  perform public.admin_assert();
  delete from public.admin_tasks where id = p_id returning title into l;
  if l is not null then perform public.admin_log('tarea_borrar', p_id::text, jsonb_build_object('title', l)); end if;
end $$;
revoke execute on function public.admin_task_delete(bigint) from public, anon;
grant execute on function public.admin_task_delete(bigint) to authenticated;

notify pgrst, 'reload schema';
