-- Tamaño máximo por fila en lo que se guarda como JSON o texto largo, y plantillas y preguntas
-- solo para coaches.
-- Antes cualquier cuenta, aunque no fuera coach, podía guardar plantillas o preguntas enormes y
-- llenar la base (y la copia de seguridad), y un coach podía mandarle a un alumno una rutina,
-- ficha o plan gigante que la app descarga cada vez que abre. Un alumno, lo mismo con las
-- respuestas de su registro diario.
--
-- Correr con el workflow "Supabase" → tarea sql → supabase/topes-datos.sql. Va después de
-- preguntas-coach.sql y rutina-programada.sql (y de base.sql si se rearma la base): acá están
-- las versiones vigentes de las políticas de plantillas y preguntas. Se puede correr varias
-- veces.
--
-- Los topes tienen mucho margen: una rutina de 5 días de las armadas pesa unos 10 KB y la de un
-- coach con notas y videos en cada ejercicio, unos 50 KB; un plan de comidas guardado llega
-- hasta 512 KB (planes-alimenticios-guardados.sql). Van con NOT VALID: lo que ya está no se
-- revisa al correr esto (si algo se pasara, el archivo no fallaría), pero cada alta o cambio
-- sí. Al final se listan las tablas con filas que ya se pasan, para revisarlas a mano.

-- 1) Rutinas: la vigente, las plantillas del coach y las programadas.
alter table public.routines drop constraint if exists routines_days_size;
alter table public.routines add constraint routines_days_size check (pg_column_size(days) <= 500000) not valid;
alter table public.routine_templates drop constraint if exists routine_templates_days_size;
alter table public.routine_templates add constraint routine_templates_days_size check (pg_column_size(days) <= 500000) not valid;
alter table public.routine_schedule drop constraint if exists routine_schedule_days_size;
alter table public.routine_schedule add constraint routine_schedule_days_size check (pg_column_size(days) <= 500000) not valid;

-- 2) Ficha y plan de comidas del alumno: la fila entera (textos del coach y el plan).
alter table public.client_info drop constraint if exists client_info_size;
alter table public.client_info add constraint client_info_size check (pg_column_size(client_info.*) <= 200000) not valid;
alter table public.nutrition drop constraint if exists nutrition_size;
alter table public.nutrition add constraint nutrition_size check (pg_column_size(nutrition.*) <= 1000000) not valid;

-- 3) Preguntas del coach y respuestas del registro diario (con la foto de las preguntas, _q).
alter table public.coach_questions drop constraint if exists coach_questions_size;
alter table public.coach_questions add constraint coach_questions_size
  check (pg_column_size(daily) <= 100000 and pg_column_size(checkin) <= 100000) not valid;
alter table public.daily_logs drop constraint if exists daily_logs_answers_size;
alter table public.daily_logs add constraint daily_logs_answers_size check (pg_column_size(answers) <= 100000) not valid;

-- 4) Plantillas y preguntas: las crea y cambia solo un coach (antes cualquier cuenta). Las que
--    ya tenía siguen siendo suyas para ver y borrar.
drop policy if exists "plantillas: el coach gestiona las suyas" on public.routine_templates;
create policy "plantillas: el coach gestiona las suyas" on public.routine_templates
  for all using (coach_id = auth.uid())
  with check (coach_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'coach'));
drop policy if exists "coach gestiona sus preguntas" on public.coach_questions;
create policy "coach gestiona sus preguntas" on public.coach_questions
  for all using (coach_id = auth.uid())
  with check (coach_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'coach'));

notify pgrst, 'reload schema';

-- Filas que ya se pasan del tope (solo cantidades, aproximado: lo guardado puede estar comprimido).
-- Las que aparezcan no se van a poder volver a guardar así: revisarlas a mano.
select 'routines' as tabla, count(*) as se_pasan from public.routines where pg_column_size(days) > 500000
union all select 'routine_templates', count(*) from public.routine_templates where pg_column_size(days) > 500000
union all select 'routine_schedule', count(*) from public.routine_schedule where pg_column_size(days) > 500000
union all select 'client_info', count(*) from public.client_info c where pg_column_size(c.*) > 200000
union all select 'nutrition', count(*) from public.nutrition n where pg_column_size(n.*) > 1000000
union all select 'coach_questions', count(*) from public.coach_questions where pg_column_size(daily) > 100000 or pg_column_size(checkin) > 100000
union all select 'daily_logs', count(*) from public.daily_logs where pg_column_size(answers) > 100000;
