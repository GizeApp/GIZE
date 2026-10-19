// Gimnasios, etapa 0: cuánto tarda abrir la ficha de un alumno o socio con 500 entrenos, con las
// funciones de hoy y con las canónicas de supabase/gimnasios-vinculo.sql (EXPLAIN ANALYZE, en Postgres
// de verdad: tests/pg.mjs; sin Postgres se saltea). is_my_client se evalúa fila por fila en las
// políticas, así que es la consulta que más pesa del panel del coach.
// La consulta: sessions con sus session_entries embebidas, con la forma de PostgREST (la de
// app/screens/coach/clientes.js: filtrada por client_id y ordenada por created_at, id), y el resto de
// la ficha (registros, ficha, bloque, nutrición, rutina, programadas, salidas).
// Quién mira: un coach independiente C (100 alumnos) a su alumna C1; el profe pA1 del gimnasio A (100
// fichas) a su socia A1; la dueña dA, como profe, a A7; y la dueña a A1, que compartió (en la etapa 0
// da 0 filas: la política de lectura de la dueña llega en la etapa 1; se mide igual, de referencia).
// Cada consulta, la mejor de 3 vueltas. Se exige: con las nuevas, menos de 2 s cada una y no más lenta
// que el doble de la de hoy (o 50 ms más), y las mismas filas con las dos. Los tiempos se imprimen: con datos
// inventados y sin los índices de producción que el repo no declara, son una referencia.
import { conPg, leer, volverAtras } from './pg.mjs';

const ID = n => 'c0000000-0000-4000-8000-' + n.padStart(12, '0');
const P = { C: ID('e1'), dA: ID('d1'), pA1: ID('b1'), C1: ID('11'), A1: ID('21'), A7: ID('27') };
const G = ID('aaaa');

// La sentencia entera (create … $$;) de la última definición de public.<nombre> que empieza una línea.
function sentencia(sql, nombre){
  const re = new RegExp('^create or replace function public\\.' + nombre + '\\(', 'gm');
  let i = -1, m;
  while ((m = re.exec(sql))) i = m.index;
  const a = sql.indexOf('$$', i), b = sql.indexOf('$$;', a + 2);
  return sql.slice(i, b + 3);
}

const DATOS = `
insert into auth.users (id, email, raw_user_meta_data) values
  ('${P.C}', 'coach.c@ejemplo.test', '{"full_name":"Coach Online","role":"coach"}'),
  ('${P.dA}', 'duena@ejemplo.test', '{"full_name":"Dueña","role":"coach"}'),
  ('${P.pA1}', 'profe@ejemplo.test', '{"full_name":"Profe","role":"coach"}'),
  ('${P.C1}', 'c1@ejemplo.test', '{"full_name":"Alumna C1"}'), ('${P.A1}', 'a1@ejemplo.test', '{"full_name":"Socia A1"}'),
  ('${P.A7}', 'a7@ejemplo.test', '{"full_name":"Socio A7"}');
-- 99 alumnos más de C y 48 socios más de A con pA1 (más 50 fichas sin app).
insert into auth.users (id, email, raw_user_meta_data) select md5('c:' || g)::uuid, 'c' || g || '@ejemplo.test', '{}' from generate_series(1, 99) g;
insert into auth.users (id, email, raw_user_meta_data) select md5('s:' || g)::uuid, 's' || g || '@ejemplo.test', '{}' from generate_series(1, 48) g;
update public.coach_billing set plan = 'p100', max_clients = 200, trial_ends_at = now() - interval '30 days', paid_until = now() + interval '20 days';
-- (pA1 con un plan que alcanza para sus 49 socios: con las funciones de hoy cuentan en su cupo.)
insert into public.gyms (id, name, owner_id, dpa_version, dpa_at) values ('${G}', 'Gimnasio Fuerza', '${P.dA}', 'v1', now());
insert into public.gym_staff (gym_id, user_id, role) values ('${G}', '${P.dA}', 'owner'), ('${G}', '${P.pA1}', 'profe');
update public.profiles set coach_id = '${P.C}' where id = '${P.C1}' or id in (select md5('c:' || g)::uuid from generate_series(1, 99) g);
update public.profiles set coach_id = '${P.pA1}' where id = '${P.A1}' or id in (select md5('s:' || g)::uuid from generate_series(1, 48) g);
update public.profiles set coach_id = '${P.dA}' where id = '${P.A7}';
insert into public.gym_members (gym_id, member_id, full_name, status, trainer_id, terms_at, share_admin)
select '${G}', id, 'Socio', 'activo', coach_id, now(), id = '${P.A1}' from public.profiles where coach_id in ('${P.pA1}', '${P.dA}');
insert into public.gym_members (gym_id, full_name, status) select '${G}', 'Sin app ' || g, 'activo' from generate_series(1, 50) g;
-- 500 entrenos de 8 series para C1, A1 y A7, y el resto de su ficha.
insert into public.sessions (id, client_id, performed_on, day_name, created_at)
select md5(u || ':' || g)::uuid, u, current_date - g, 'Día ' || (g % 4), now() - make_interval(days => g)
  from unnest(array['${P.C1}', '${P.A1}', '${P.A7}']::uuid[]) u, generate_series(1, 500) g;
insert into public.session_entries (session_id, client_id, exercise_name, set_order, kg, reps)
select s.id, s.client_id, 'Ejercicio ' || (k % 6), k, 40 + k, 10 from public.sessions s, generate_series(1, 8) k;
insert into public.body_weights (client_id, measured_on, kg) select u, current_date - g, 70 from unnest(array['${P.C1}', '${P.A1}', '${P.A7}']::uuid[]) u, generate_series(1, 200) g;
insert into public.daily_logs (client_id, log_date, steps) select u, current_date - g, 8000 from unnest(array['${P.C1}', '${P.A1}', '${P.A7}']::uuid[]) u, generate_series(1, 300) g;
insert into public.checkins (client_id, week_start) select u, current_date - 7 * g from unnest(array['${P.C1}', '${P.A1}', '${P.A7}']::uuid[]) u, generate_series(1, 40) g;
insert into public.client_info (client_id) select unnest(array['${P.C1}', '${P.A1}', '${P.A7}']::uuid[]);
insert into public.blocks (client_id, name) select unnest(array['${P.C1}', '${P.A1}', '${P.A7}']::uuid[]), 'Bloque';
insert into public.nutrition (client_id, kcal) select unnest(array['${P.C1}', '${P.A1}', '${P.A7}']::uuid[]), 2000;
insert into public.routines (client_id, days) select unnest(array['${P.C1}', '${P.A1}', '${P.A7}']::uuid[]), '[]';
analyze;
select to_jsonb(count(*)) from public.seats_drift();
`;

const FICHA = id => `select coalesce(json_agg(t), '[]') from (
  select s.*, coalesce((select json_agg(x) from (select e.exercise_name, e.set_order, e.kg, e.reps, e.secs from public.session_entries e
                                                  where e.session_id = s.id) x), '[]') as session_entries
    from public.sessions s where s.client_id = '${id}' order by s.created_at, s.id) t`;
const RESTO = id => `select json_build_array(${['body_weights', 'daily_logs', 'checkins', 'client_info', 'blocks', 'nutrition', 'routines', 'routine_schedule', 'cardio_outings']
  .map(tb => `(select count(*) from public.${tb} where client_id = '${id}')`).join(', ')})`;

const MEDIR = `
create table prueba.textos (nombre text primary key, sql text not null);
-- La consulta q como quien (con las funciones de hoy si viejas): la mejor de «vueltas» corridas de
-- EXPLAIN ANALYZE, y cuántas filas devuelve. Deshace todo, también el cambio de funciones.
create function prueba.medir(quien uuid, q text, viejas boolean, vueltas int) returns jsonb language plpgsql as $f$
declare p json; mejor numeric; r json; res jsonb; i int; e text; m text;
begin
  begin
    if viejas then
      execute (select sql from prueba.textos where nombre = 'coach_active');
      execute (select sql from prueba.textos where nombre = 'is_my_client');
    end if;
    perform prueba.ser(quien::text);
    execute q into r;
    for i in 1..vueltas loop
      execute 'explain (analyze, buffers, format json) ' || q into p;
      if mejor is null or (p->0->>'Execution Time')::numeric < mejor then mejor := (p->0->>'Execution Time')::numeric; end if;
    end loop;
    res := jsonb_build_object('ms', round(mejor, 1), 'filas', case when json_typeof(r) = 'array' and json_typeof(r->0) = 'object' then json_array_length(r) else 0 end,
                              'datos', case when json_typeof(r->0) = 'number' then r::jsonb end);
    raise exception using errcode = 'GZ995';
  exception when others then
    get stacked diagnostics e = returned_sqlstate, m = message_text;
    if e = 'GZ995' then return res; end if;
    return jsonb_build_object('error', e, 'msg', m);
  end;
end $f$;
`;

export default async function ({ t }){
  const h = await conPg(t);
  if (!h) return;
  const db = await h.nueva('gize_con');
  t.eq(await db.json(DATOS), 0, 'datos cargados con el cupo al día');
  const atras = volverAtras(leer('supabase/gimnasios-vinculo.sql'));
  await db.sql(MEDIR + ['coach_active', 'is_my_client'].map(fn => `insert into prueba.textos values ('${fn}', $t$${sentencia(atras, fn)}$t$);`).join('\n'), { una: true });

  const CASOS = [['C', 'C1', 'coach independiente → su alumna', 500], ['pA1', 'A1', 'profe del gimnasio → su socia', 500],
    ['dA', 'A7', 'dueña como profe → su socio', 500], ['dA', 'A1', 'dueña → socia que compartió (etapa 1)', 0]];
  const filas = [];
  for (const [quien, de, que, esperadas] of CASOS){
    for (const [nombre, q] of [['entrenos', FICHA(P[de])], ['resto', RESTO(P[de])]]){
      const [v, n] = [await db.json(`select prueba.medir('${P[quien]}', $q$${q}$q$, true, 3);`), await db.json(`select prueba.medir('${P[quien]}', $q$${q}$q$, false, 3);`)];
      t.ok(!v.error && !n.error, que + ' (' + nombre + '): la consulta corre: ' + JSON.stringify([v, n]));
      if (v.error || n.error) continue;
      filas.push([que, nombre, v.ms, n.ms]);
      if (nombre === 'entrenos') t.eq([v.filas, n.filas], [esperadas, esperadas], que + ': ve ' + esperadas + ' entrenos, con las de hoy y con las nuevas');
      else t.eq(n.datos, v.datos, que + ': el resto de la ficha, igual con las de hoy y con las nuevas');
      t.ok(n.ms < 2000, que + ' (' + nombre + '): menos de 2 s con las nuevas (' + n.ms + ' ms; hoy ' + v.ms + ' ms)');
      t.ok(n.ms <= Math.max(2 * v.ms, v.ms + 50), que + ' (' + nombre + '): la nueva no es más lenta que el doble de la de hoy (hoy ' + v.ms + ' ms, nueva ' + n.ms + ' ms)');
    }
  }
  console.log(filas.map(([que, nombre, v, n]) => '    ' + (que + ' (' + nombre + ')').padEnd(58) + ' hoy ' + String(v).padStart(7) + ' ms   nueva ' + String(n).padStart(7) + ' ms').join('\n'));
  await db.borrar();
}
