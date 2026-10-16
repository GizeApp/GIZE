-- Rutinas armadas que se ofrecen en la bienvenida (y en Entreno → "Ver rutinas armadas") a
-- quien entrena por su cuenta. para: 'mujer' | 'hombre' | 'todos'. A quien elige "Mujer" se
-- le muestran las de mujer y las de todos; a "Hombre", las de hombre y las de todos; a
-- "Prefiero no decir", todas. Si la tabla está vacía, la app muestra las de ejemplo que trae.
-- Las ve cualquiera que entrena solo: tienen que ser genéricas, sin nada escrito para una
-- persona. Las que trae la app (de 1 a 6 días por semana) se cargan con rutinas-genericas.sql,
-- que además pone el control que les saca las notas (ver abajo).
-- Correr con el workflow "Supabase" → tarea sql → supabase/rutinas-catalogo.sql, después de
-- seguridad-base.sql y productos-revision.sql, y después rutinas-genericas.sql. Se puede correr
-- varias veces.

create table if not exists public.rutinas_catalogo (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null check (char_length(nombre) between 1 and 80),
  para        text not null default 'todos' check (para in ('mujer', 'hombre', 'todos')),
  descripcion text check (descripcion is null or char_length(descripcion) <= 160),
  days        jsonb not null,
  orden       int  not null default 0,
  activa      boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table public.rutinas_catalogo enable row level security;

-- La leen todos los que entraron; la cargan y editan solo los administradores.
drop policy if exists "catalogo: leer" on public.rutinas_catalogo;
create policy "catalogo: leer" on public.rutinas_catalogo for select to authenticated using (activa or public.is_app_admin());
drop policy if exists "catalogo: admins" on public.rutinas_catalogo;
create policy "catalogo: admins" on public.rutinas_catalogo for all to authenticated
  using (public.is_app_admin()) with check (public.is_app_admin());

-- Mismo control de datos que las rutinas y las plantillas de los coaches.
drop trigger if exists rutinas_catalogo_validate on public.rutinas_catalogo;
create trigger rutinas_catalogo_validate before insert or update of days on public.rutinas_catalogo
  for each row execute function public.routines_validate();

notify pgrst, 'reload schema';

-- Notas y cosas de una persona: al cargar o cambiar una rutina activa (o al volver a activar
-- una escondida), la base le deja solo lo que hace a la rutina y le saca las notas del día y
-- del ejercicio, el objetivo de progreso, el video y el audio del coach, los kilos propuestos
-- y lo anotado (función rutina_generica y trigger rutinas_catalogo_limpiar, en
-- rutinas-genericas.sql). La app, al copiar una rutina armada, hace lo mismo (copiarDias en
-- app/core/rutinas-ejemplo.js). Lo que sí queda tal cual son los nombres de los días y los
-- subtítulos: revisar que no digan el nombre de nadie.
--
-- Para copiar rutinas guardadas de un coach (sus plantillas) al catálogo, desde el editor
-- SQL de Supabase (cambiar el mail y 'hombre' por 'mujer' o 'todos' según corresponda). Las
-- notas que el coach les escribió a sus alumnos no pasan (ver arriba):
--
--   insert into public.rutinas_catalogo (nombre, para, days)
--   select t.name, 'hombre', t.days from public.routine_templates t
--    where t.coach_id = (select id from auth.users where email = 'TU_MAIL');
--
-- Ver lo cargado:   select nombre, para, activa, jsonb_array_length(days) as dias from public.rutinas_catalogo order by orden, nombre;
-- Esconder una:     update public.rutinas_catalogo set activa = false where nombre = '...';
-- Volver a mostrar: update public.rutinas_catalogo set activa = true where nombre = '...';  (se le sacan las notas)
