// Gimnasios, etapa 0: supabase/gimnasios.sql, supabase/gimnasios-vinculo.sql y la base de pruebas,
// leídos (no necesita Postgres; las pruebas con Postgres son las otras tests/gimnasios-*.test.mjs).
// - Cabeceras como las demás (cómo correrlo, después de qué, que se puede volver a correr, que no
//   cambia nada / que es el canónico) y las notas «OJO» de los siete archivos con versiones viejas.
// - Se puede volver a correr: tablas, índices y columnas «if not exists», cada check con su drop
//   antes, políticas y triggers con su drop antes, ningún drop table fuera del bloque comentado.
// - Permisos: cada tabla nueva con RLS y sin permisos para anon ni authenticated, salvo select donde
//   hay política de lectura; ninguna política de escritura; las funciones security definer con
//   search_path fijo, las internas sin permiso para la app; las políticas con (select auth.uid()).
// - join_coach canónica: tiene todo lo de la de bloqueos.sql (salvo el count(*), que pasa a
//   recount_seats, y el tipo de lo que devuelve) y sus mensajes nuevos no hablan del plan ni mandan a
//   pagar (los filtros de las apps, core/tienda.js y tests/bloquear-vincular.test.mjs).
// - El bloque «Para volver atrás» de gimnasios-vinculo.sql es copia textual de las versiones de hoy.
// - Sin mails ni uuids (el repo es público y gize.ar sirve supabase/); la huella del esquema solo lee.
// - tests/pg/orden.txt nombra todos los supabase/*.sql (o los deja afuera a propósito).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.existsSync(path.join(ROOT, f)) ? fs.readFileSync(path.join(ROOT, f), 'utf8') : '';
const sinComentarios = s => s.replace(/--[^\n]*/g, '');
const cabeza = (s, n) => s.split('\n').slice(0, n).join(' ').replace(/\s*--\s*/g, ' ');
// La sentencia entera (create … $$;) de la última definición de public.<nombre> que empieza una línea.
function sentencia(sql, nombre){
  const re = new RegExp('^create or replace function public\\.' + nombre + '\\(', 'gm');
  let i = -1, m;
  while ((m = re.exec(sql))) i = m.index;
  if (i < 0) return '';
  const a = sql.indexOf('$$', i), b = sql.indexOf('$$;', a + 2);
  return sql.slice(i, b + 3);
}
const TABLAS = ['gyms', 'gym_staff', 'gym_invites', 'gym_codes', 'gym_members', 'gym_member_notes', 'gym_audit', 'gym_alerts', 'gym_bajas', 'gym_entries', 'gym_turnos'];
const CON_LECTURA = ['gyms', 'gym_staff', 'gym_members', 'gym_member_notes', 'gym_audit', 'gym_bajas', 'gym_entries'];
const MANDA = /renov|renuev|ampl[ií]|eleg[ií] un plan|pag[aá]/i, TIENDA = /plan|renuev|ampl/i;

export default async ({ t }) => {
  const g = read('supabase/gimnasios.sql'), v = read('supabase/gimnasios-vinculo.sql');
  t.ok(!!g && !!v, 'existen supabase/gimnasios.sql y supabase/gimnasios-vinculo.sql');
  if (!g || !v) return;
  const [gAtras, vAtras] = [g, v].map(s => s.slice(s.indexOf('-- ===== Para volver atrás =====')));
  const gc = sinComentarios(g.slice(0, g.indexOf('-- ===== Para volver atrás ====='))), vc = sinComentarios(v.slice(0, v.indexOf('-- ===== Para volver atrás =====')));

  // Cabeceras.
  t.ok(cabeza(g, 8).includes('Correr con el workflow "Supabase" → tarea sql → supabase/gimnasios.sql, después de supabase/bloqueos.sql y supabase/compras-apple.sql. Se puede correr varias veces.'),
    'gimnasios.sql: cómo correrlo, después de qué y que se puede volver a correr');
  t.ok(/NO CAMBIA NINGÚN COMPORTAMIENTO/.test(g.split('\n').slice(0, 15).join('\n')) && cabeza(g, 8).includes('Después va supabase/gimnasios-vinculo.sql'), 'gimnasios.sql: dice que no cambia nada y qué va después');
  t.ok(cabeza(v, 4).includes('Correr con el workflow "Supabase" → tarea sql → supabase/gimnasios-vinculo.sql, después de supabase/gimnasios.sql. Se puede correr varias veces.'),
    'gimnasios-vinculo.sql: cómo correrlo, después de qué y que se puede volver a correr');
  t.ok(/OJO: canónico\. Acá están las versiones vigentes de coach_active, is_my_client, join_coach, release_lapsed_clients, coach_client_ok y profiles_gym_sync/.test(cabeza(v, 6)),
    'gimnasios-vinculo.sql: es el canónico de las seis');
  t.ok(/SIN GIMNASIOS TODO SIGUE IGUAL/.test(v.split('\n').slice(0, 20).join('\n')), 'gimnasios-vinculo.sql: dice que sin gimnasios todo sigue igual');
  // Las notas «OJO» de los archivos con versiones viejas.
  for (const [f, n] of [['base.sql', 20], ['endurecer-base.sql', 10], ['suscripciones.sql', 12], ['cupo-plan.sql', 12], ['coach-alumnos.sql', 12], ['bloqueos.sql', 22], ['coach-vencido.sql', 8]]){
    const c = cabeza(read('supabase/' + f), n);
    t.ok(/gimnasios-vinculo\.sql/.test(c) && /gimnasios\.sql/.test(c), f + ': la nota «OJO» manda a gimnasios.sql y gimnasios-vinculo.sql');
  }
  for (const f of ['base.sql', 'endurecer-base.sql', 'suscripciones.sql', 'coach-alumnos.sql', 'bloqueos.sql'])
    t.ok(/falla entero sin cambiar nada \(join_coach cambió de tipo\)/.test(cabeza(read('supabase/' + f), 22)) && /«Para volver atrás»/.test(cabeza(read('supabase/' + f), 22)),
      f + ': avisa que con gimnasios-vinculo.sql aplicado falla entero, y cómo correrlo igual');

  // Se puede volver a correr.
  for (const tb of TABLAS) t.ok(gc.includes('create table if not exists public.' + tb + ' ('), tb + ': create table if not exists');
  t.ok(!/drop table/i.test(gc + vc), 'ningún drop table (fuera del bloque para volver atrás)');
  const adds = [...gc.matchAll(/add constraint (\w+)/g)].map(m => m[1]);
  t.ok(adds.length >= 20 && adds.every(c => gc.includes('drop constraint if exists ' + c + ';')), 'cada check se borra antes de crearlo (' + adds.length + ')');
  t.ok([...gc.matchAll(/create (unique )?index (\S+)/g)].every(m => m[2] === 'if'), 'índices «if not exists»');
  t.ok(/add column if not exists seats_used int not null default 0;/.test(gc) && /add column if not exists gym_id uuid;/.test(gc), 'las dos columnas nuevas «if not exists»');
  for (const s of [gc, vc]){
    for (const m of s.matchAll(/create policy "([^"]+)" on (\S+)/g)) t.ok(s.includes('drop policy if exists "' + m[1] + '" on ' + m[2] + ';'), 'política «' + m[1] + '»: se borra antes de crearla');
    for (const m of s.matchAll(/create trigger (\w+) \w+ [^;]*? on (\S+)/g)) t.ok(s.includes('drop trigger if exists ' + m[1] + ' on ' + m[2] + ';'), 'trigger ' + m[1] + ': se borra antes de crearlo');
  }
  t.ok(/notify pgrst, 'reload schema';\s*$/.test(gc.trim() + '\n') && /notify pgrst, 'reload schema';\s*$/.test(vc.trim() + '\n'), 'los dos terminan con notify pgrst');

  // Permisos de las tablas.
  for (const tb of TABLAS){
    t.ok(gc.includes('alter table public.' + tb + ' enable row level security;'), tb + ': RLS prendido');
    t.ok(gc.includes('revoke all on public.' + tb + ' from anon, authenticated;'), tb + ': sin permisos para anon ni authenticated');
    t.eq(gc.includes('grant select on public.' + tb + ' to authenticated;'), CON_LECTURA.includes(tb), tb + (CON_LECTURA.includes(tb) ? ': solo lectura con sesión' : ': nadie la lee'));
  }
  const pols = [...gc.matchAll(/create policy "[^"]+" on public\.(\w+)\s+for (\w+) to (\w+)/g)];
  t.eq(pols.map(m => m[1]).sort(), [...CON_LECTURA].sort(), 'una política de lectura por tabla que se lee');
  t.ok(pols.every(m => m[2] === 'select' && m[3] === 'authenticated'), 'todas son «for select to authenticated» (ninguna de escritura)');
  t.ok(!/grant (insert|update|delete|all)/i.test(gc + vc) && !/grant [^;]*\bto\b[^;]*\b(anon|public)\b/i.test(gc + vc), 'ningún grant de escritura ni para anon o public');
  const politicas = [...gc.matchAll(/create policy[\s\S]*?;/g)].map(m => m[0]).join('\n');
  t.ok(!/auth\.uid\(\)/.test(politicas.replace(/\(select auth\.uid\(\)\)/g, '')) && /\(select auth\.uid\(\)\)/.test(politicas), 'las políticas usan (select auth.uid())');

  // Funciones: security definer con search_path fijo; las internas sin permiso para la app.
  const fns = [...(gc + vc).matchAll(/create or replace function public\.(\w+)\(([^\n]*)\)\s*returns[\s\S]*?\nas \$\$/g)];
  t.eq(fns.length, 24, 'funciones: ' + fns.map(m => m[1]).join(', '));
  for (const [txt, name] of fns) t.ok(/security definer\s+set search_path = public/.test(txt), name + ': security definer con search_path fijo');
  const INTERNAS = { 'gym_role(uuid, uuid)': g, 'vinculo_gym(uuid)': g, 'gym_de_dueno(uuid)': g, 'gym_active(uuid)': g, 'gym_operativo(uuid)': g,
    'recount_seats(uuid)': g, 'seats_drift()': g, 'gym_recontar(uuid[])': g, 'gym_cupo_profiles()': g, 'gym_cupo_members()': g, 'gym_cupo_staff()': g,
    'gym_cupo_gyms()': g, 'coach_billing_cupo()': g, 'gym_codes_unico()': g, 'gym_members_sin_cuenta()': g, 'coach_client_ok(uuid, uuid)': v, 'profiles_gym_sync()': v };
  for (const [sig, s] of Object.entries(INTERNAS)) t.ok(sinComentarios(s).includes('revoke all on function public.' + sig + ' from public, anon, authenticated;'), sig + ': interna (sin permiso para la app)');
  for (const sig of ['gym_mi_rol(uuid)', 'gym_soy_socio(uuid)', 'gym_reads_member(uuid)'])
    t.ok(gc.includes('revoke all on function public.' + sig + ' from public, anon;') && gc.includes('grant execute on function public.' + sig + ' to authenticated;'), sig + ': solo con sesión');
  t.ok(vc.includes('revoke execute on function public.coach_active(uuid) from public, anon;') && vc.includes('grant  execute on function public.coach_active(uuid) to authenticated, service_role;'), 'coach_active: los permisos de hoy');
  t.ok(vc.includes('revoke execute on function public.join_coach(text) from public, anon;') && vc.includes('grant  execute on function public.join_coach(text) to authenticated;'), 'join_coach: los permisos de hoy');
  t.ok(vc.includes('revoke execute on function public.release_lapsed_clients() from public, anon, authenticated;'), 'release_lapsed_clients: interna, como hoy');
  t.ok(!/grant[^;]*is_my_client|revoke[^;]*is_my_client/.test(vc), 'is_my_client: create or replace, conserva los permisos que tenía');

  // join_coach canónica: todo lo de la de bloqueos.sql.
  const jf = sentencia(v, 'join_coach'), jb = sentencia(read('supabase/bloqueos.sql'), 'join_coach');
  t.ok(jf.length > 3000 && /returns json\n/.test(jf), 'gimnasios-vinculo.sql define join_coach, que devuelve json');
  const norm = l => l.trim().replace(/return to_json\((true|false)\);/g, 'return $1;');
  const nuevas = new Set(jf.split('\n').map(norm));
  const faltan = jb.split('\n').map(norm).filter(Boolean).filter(l => !nuevas.has(l))
    .filter(l => l !== 'returns boolean' && l !== 'select count(*) into n from profiles where coach_id = cid;');
  t.eq(faltan, [], 'join_coach tiene todo lo de la de bloqueos.sql (salvo el count(*), que pasa a recount_seats, y el tipo)');
  t.ok(jf.includes('n := public.recount_seats(cid);'), 'el cupo se cuenta con recount_seats');
  const orden = ['if me is null then', "role = 'coach') then return", 'from gym_staff where user_id = me', 'pg_advisory_xact_lock', 'Probaste muchos',
    'where invite_code = upper(trim(code))', 'from gym_codes k', 'insert into join_code_attempts', 'if cid = me', 'bloqueo_entre(me, cid)',
    'coach_id = cid) then return', 'v := public.vinculo_gym(me);', 'Por ahora el gimnasio', 'Ese código es de un profe', 'plan de GIZE vencido', 'select max_clients into lim from coach_billing where coach_id = cid for update;', 'llegó al máximo', 'update profiles set coach_id = cid where id = me;\n  return'];
  const pos = orden.map(s => jf.indexOf(s));
  t.ok(pos.every((p, i) => p > 0 && (i === 0 || p > pos[i - 1])), 'join_coach: los pasos en el orden de la spec: ' + orden.filter((s, i) => !(pos[i] > 0 && (i === 0 || pos[i] > pos[i - 1]))).join(' | '));
  t.ok(/set_config\('response\.status', '400', true\);\s*return json_build_object\('code', 'P0001', 'message'/.test(jf), 'el código del gimnasio sale con status 400 y el cuerpo P0001, sin raise');
  const viejos = new Set([...jb.matchAll(/raise exception '([^']+)'/g)].map(m => m[1]));
  const msgs = [...jf.matchAll(/raise exception '([^']+)'/g), ...jf.matchAll(/'message', '([^']+)'/g)].map(m => m[1]).filter(m => !viejos.has(m));
  t.ok(msgs.length >= 8, 'mensajes nuevos de join_coach: ' + msgs.length);
  for (const m of msgs){
    t.ok(!MANDA.test(m), 'join_coach no manda a renovar, ampliar ni pagar: ' + m);
    t.ok(!TIENDA.test(m.replace(/%/g, '')), 'y las apps lo muestran tal cual (no lo cambia joinMsgTienda): ' + m);
  }

  // El bloque para volver atrás: copia textual de las versiones de hoy.
  const atras = vAtras.split('\n').filter(l => l.startsWith('-- ')).map(l => l.slice(3)).join('\n').replace(/\n--\n/g, '\n\n');
  const desde = vAtras.split('\n'), i0 = desde.findIndex(l => l.trim() === '--');
  const bloque = desde.slice(i0 + 1).map(l => l.replace(/^-- ?/, '')).join('\n');
  for (const [fn, f] of [['coach_active', 'cupo-plan.sql'], ['is_my_client', 'suscripciones.sql'], ['join_coach', 'bloqueos.sql'], ['release_lapsed_clients', 'coach-vencido.sql']]){
    const s = sentencia(read('supabase/' + f), fn);
    t.ok(s && sentencia(bloque, fn) === s, 'volver atrás: la ' + fn + ' de hoy (' + f + '), tal cual');
  }
  t.ok(atras.length > 0 && bloque.includes('drop function if exists public.join_coach(text);') && bloque.includes('drop trigger if exists profiles_gym_sync on public.profiles;')
    && bloque.includes('drop function if exists public.coach_client_ok(uuid, uuid);'), 'volver atrás saca lo que agregó gimnasios-vinculo.sql');
  t.ok(/drop table if exists public\.gym_entries[\s\S]*public\.gyms;/.test(gAtras) && /drop column if exists seats_used/.test(gAtras) && /drop column if exists gym_id/.test(gAtras),
    'gimnasios.sql: volver atrás borra las tablas y las dos columnas');

  // Sin datos de nadie, y la huella solo lee.
  for (const [f, s] of [['gimnasios.sql', g], ['gimnasios-vinculo.sql', v], ['esquema-huella.sql', read('supabase/esquema-huella.sql')]]){
    t.ok(!/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/.test(s), f + ': sin mails');
    t.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(s), f + ': sin uuids');
  }
  const huella = sinComentarios(read('supabase/esquema-huella.sql'));
  t.ok(/^\s*with\b/i.test(huella) && /select jsonb_object_agg\(k, v\) as huella from kv;\s*$/.test(huella), 'esquema-huella.sql: una sola consulta que devuelve un JSON');
  t.ok(!/\b(insert|update|delete|create|alter|drop|grant|revoke|truncate|set_config|nextval)\b/i.test(huella.replace(/'[^']*'/g, '')), 'esquema-huella.sql solo lee');

  // La lista de la base de pruebas.
  const lista = read('tests/pg/orden.txt').split('\n').map(l => l.replace(/#.*/, '').trim()).filter(Boolean);
  const fuera = ['cuentas-demo.sql', 'auditoria.sql', 'estado.sql', 'seguridad-chequeo.sql', 'esquema-huella.sql', 'gimnasios.sql', 'gimnasios-vinculo.sql'];
  const todos = fs.readdirSync(path.join(ROOT, 'supabase')).filter(f => f.endsWith('.sql'));
  t.eq(todos.filter(f => !lista.includes(f) && !fuera.includes(f)), [], 'tests/pg/orden.txt nombra todos los supabase/*.sql (o los deja afuera a propósito)');
  t.eq(lista.filter(f => !todos.includes(f)), [], 'y todos los que nombra existen');
  t.eq(new Set(lista).size, lista.length, 'sin repetidos');
};
