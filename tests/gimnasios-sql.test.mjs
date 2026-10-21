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
// - Etapa 1, parte 5: gimnasios-admin.sql con su cabecera, guarda, permisos, admin_assert y admin_log,
//   y el bloque para volver atrás con las seis funciones de hoy tal cual.
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
  t.ok(/OJO: canónico\. Acá están las versiones vigentes de coach_active, is_my_client, join_coach, release_lapsed_clients, coach_client_ok y profiles_gym_sync, y desde la etapa 1 también de routine_schedule_on_coach_change, admin_set_role, admin_unlink, chat_unread, chat_mark_read y de las políticas «billing: el coach ve la suya» \(coach_billing\), «mensajes: el coach ve los suyos» \(coach_messages\) y «chat-audio: escuchar en mi conversación» \(storage\)/.test(cabeza(v, 13)),
    'gimnasios-vinculo.sql: es el canónico de las once funciones y las tres políticas');
  // Las notas «OJO» de la etapa 1: los archivos con las políticas y funciones que reemplaza.
  for (const [f, n, que] of [['rutina-programada.sql', 8, 'routine_schedule_on_coach_change'], ['chat.sql', 12, 'escuchar audios'],
    ['notificaciones.sql', 10, 'mensajes: el coach ve los suyos'], ['suscripciones.sql', 14, 'lectura de coach_billing'], ['admin.sql', 14, 'admin_set_role y admin_unlink']])
    t.ok(cabeza(read('supabase/' + f), n).includes(que) && /gimnasios-vinculo\.sql/.test(cabeza(read('supabase/' + f), n)), f + ': la nota «OJO» de ' + que + ' manda a gimnasios-vinculo.sql');
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
  t.eq(fns.length, 43, 'funciones: ' + fns.map(m => m[1]).join(', '));
  for (const [txt, name] of fns) t.ok(/security definer\s+set search_path = public/.test(txt), name + ': security definer con search_path fijo');
  const INTERNAS = { 'gym_role(uuid, uuid)': g, 'vinculo_gym(uuid)': g, 'gym_de_dueno(uuid)': g, 'gym_active(uuid)': g, 'gym_operativo(uuid)': g,
    'recount_seats(uuid)': g, 'seats_drift()': g, 'gym_recontar(uuid[])': g, 'gym_cupo_profiles()': g, 'gym_cupo_members()': g, 'gym_cupo_staff()': g,
    'gym_cupo_gyms()': g, 'coach_billing_cupo()': g, 'gym_codes_unico()': g, 'gym_profe_ficha(uuid, uuid, text)': g, 'gym_members_profe()': g,
    'gym_members_pedido_sin_cuenta()': g, 'coach_client_ok(uuid, uuid)': v, 'profiles_gym_sync()': v,
    'gym_alerta(uuid, text, text, text, text, jsonb)': v, 'gym_alerta_staff(uuid, text, text, jsonb)': v, 'gym_auditar(uuid, text, uuid, uuid, jsonb)': v,
    'gym_cupo_ok(uuid, uuid[])': v, 'gym_profe_no_puede(uuid, uuid, uuid)': v, 'gym_aprobar_interno(uuid, uuid)': v,
    'gym_pedir(uuid, uuid, text, text, boolean, text)': v, 'gym_cerrar_interno(uuid, text)': v, 'gym_cerrar_por_baja(uuid)': v, 'profiles_gym_baja()': v, 'coach_messages_gym()': v };
  for (const [sig, s] of Object.entries(INTERNAS)) t.ok(sinComentarios(s).includes('revoke all on function public.' + sig + ' from public, anon, authenticated;'), sig + ': interna (sin permiso para la app)');
  for (const sig of ['gym_mi_rol(uuid)', 'gym_soy_socio(uuid)', 'gym_reads_member(uuid)'])
    t.ok(gc.includes('revoke all on function public.' + sig + ' from public, anon;') && gc.includes('grant execute on function public.' + sig + ' to authenticated;'), sig + ': solo con sesión');
  // Las que llama el service role (avisos-coach, notificar-cliente y, desde la etapa 1, rapid-worker y
  // las tareas) tienen el permiso escrito: no dependen de los permisos por defecto del esquema.
  for (const [sig, s] of [['gym_role(uuid, uuid)', g], ['vinculo_gym(uuid)', g], ['gym_de_dueno(uuid)', g], ['gym_active(uuid)', g], ['gym_operativo(uuid)', g],
    ['recount_seats(uuid)', g], ['seats_drift()', g], ['coach_client_ok(uuid, uuid)', v]])
    t.ok(sinComentarios(s).includes('grant execute on function public.' + sig + ' to service_role;'), sig + ': permiso explícito para el service role');
  t.ok(vc.includes('revoke execute on function public.coach_active(uuid) from public, anon, authenticated;') && vc.includes('grant  execute on function public.coach_active(uuid) to service_role;'),
    'coach_active: solo el service role (la app no la llama; con sesión se podía preguntar el plan de cualquiera)');
  t.ok(vAtras.includes('-- grant  execute on function public.coach_active(uuid) to authenticated, service_role;'),
    'volver atrás devuelve el permiso de hoy de coach_active');
  t.ok(vc.includes('revoke execute on function public.join_coach(text) from public, anon;') && vc.includes('grant  execute on function public.join_coach(text) to authenticated;'), 'join_coach: los permisos de hoy');
  t.ok(vc.includes('revoke execute on function public.release_lapsed_clients() from public, anon, authenticated;'), 'release_lapsed_clients: interna, como hoy');
  t.ok(vc.includes('revoke execute on function public.routine_schedule_on_coach_change() from public, anon, authenticated;'), 'routine_schedule_on_coach_change: interna, como hoy');
  t.ok(vc.includes('revoke all on function public.gym_mi_fila_oculta() from public, anon;') && vc.includes('grant execute on function public.gym_mi_fila_oculta() to authenticated;'),
    'gym_mi_fila_oculta: con sesión (la usa la política de coach_billing) y responde solo sobre quien llama');
  t.ok(!/grant[^;]*admin_(set_role|unlink)|revoke[^;]*admin_(set_role|unlink)/.test(vc), 'admin_set_role y admin_unlink: create or replace, conservan los permisos que tenían');
  t.ok(!/grant[^;]*chat_(unread|mark_read)|revoke[^;]*chat_(unread|mark_read)/.test(vc), 'chat_unread y chat_mark_read: create or replace, conservan los permisos que tenían');
  const polV = [...vc.matchAll(/create policy[\s\S]*?;/g)].map(m => m[0]).join('\n');
  t.ok(!/auth\.uid\(\)/.test(polV.replace(/\(select auth\.uid\(\)\)/g, '')) && /\(select auth\.uid\(\)\)/.test(polV), 'las políticas de gimnasios-vinculo.sql usan (select auth.uid())');
  const borrado = sentencia(v, 'profiles_gym_baja');
  t.ok(/exception when others then/.test(borrado) && /return old;\s*end \$\$;$/.test(borrado), 'el before delete de profiles nunca hace fallar el borrado');

  // Orden de los archivos: gimnasios-vinculo.sql sin gimnasios.sql, y volver atrás gimnasios.sql con
  // gimnasios-vinculo.sql todavía aplicado, se frenan antes de cambiar nada (lo prueba en Postgres
  // tests/gimnasios-base.test.mjs).
  const guardia = vc.indexOf("raise exception 'Primero correr supabase/gimnasios.sql");
  t.ok(guardia > 0 && guardia < vc.indexOf('create or replace function'), 'gimnasios-vinculo.sql: lo primero controla que esté gimnasios.sql');
  for (const x of ["to_regclass('public.gym_members')", "to_regprocedure('public.vinculo_gym(uuid)')", "to_regprocedure('public.recount_seats(uuid)')", "attname = 'seats_used'"])
    t.ok(vc.slice(0, guardia).includes(x), 'la guardia mira ' + x);
  const atrasG = gAtras.split('\n').filter(l => l.startsWith('-- ')).map(l => l.slice(3)).join('\n');
  t.ok(atrasG.indexOf('raise exception \'Primero el bloque «Para volver atrás» de supabase/gimnasios-vinculo.sql') > 0
    && atrasG.indexOf('raise exception') < atrasG.indexOf('drop trigger'), 'gimnasios.sql: volver atrás se frena si alguna función todavía usa los gimnasios');

  // El profe solo ve fichas activas o pausadas (y sus notas); el profe de la ficha sale solo.
  t.ok(/trainer_id = \(select auth\.uid\(\)\) and status in \('activo', 'pausado'\)/.test(gc) && /m\.trainer_id = \(select auth\.uid\(\)\) and m\.status in \('activo', 'pausado'\)/.test(gc),
    'fichas y notas: el profe, solo las activas o pausadas');
  t.ok(/create trigger gym_members_profe before insert or update of status, member_id, gym_id, trainer_id on public\.gym_members/.test(gc), 'trigger gym_members_profe en cada escritura de la ficha');
  t.ok(/create trigger gym_members_pedido_sin_cuenta after update of member_id on public\.gym_members/.test(gc) && /new\.status = 'pendiente'/.test(gc), 'la solicitud de quien borra su cuenta se borra');
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
  for (const [fn, f] of [['coach_active', 'cupo-plan.sql'], ['is_my_client', 'suscripciones.sql'], ['join_coach', 'bloqueos.sql'], ['release_lapsed_clients', 'coach-vencido.sql'],
    ['chat_unread', 'chat.sql'], ['chat_mark_read', 'chat.sql']]){
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

  // ===== Etapa 1: gimnasios-lectura.sql y gimnasios-socios.sql =====
  const l = read('supabase/gimnasios-lectura.sql'), so = read('supabase/gimnasios-socios.sql');
  t.ok(!!l && !!so, 'existen gimnasios-lectura.sql y gimnasios-socios.sql');
  const lc = sinComentarios(l.slice(0, l.indexOf('-- ===== Para volver atrás ====='))), sc = sinComentarios(so.slice(0, so.indexOf('-- ===== Para volver atrás =====')));
  const [lAtras, sAtras] = [l, so].map(x => x.slice(x.indexOf('-- ===== Para volver atrás =====')).split('\n').filter(z => z.startsWith('-- ')).map(z => z.slice(3)).join('\n'));
  t.ok(cabeza(l, 5).includes('Correr con el workflow "Supabase" → tarea sql → supabase/gimnasios-lectura.sql, después de supabase/gimnasios.sql y supabase/gimnasios-vinculo.sql. Se puede correr varias veces.'),
    'gimnasios-lectura.sql: cómo correrlo, después de qué y que se puede volver a correr');
  t.ok(cabeza(so, 6).includes('Correr con el workflow "Supabase" → tarea sql → supabase/gimnasios-socios.sql, después de supabase/gimnasios.sql, supabase/gimnasios-vinculo.sql y supabase/gimnasios-lectura.sql. Se puede correr varias veces.'),
    'gimnasios-socios.sql: cómo correrlo, después de qué y que se puede volver a correr');
  for (const [f, x] of [['gimnasios-lectura.sql', l], ['gimnasios-socios.sql', so]])
    t.ok(/SIN GIMNASIOS TODO SIGUE IGUAL/.test(x.split('\n').slice(0, 15).join('\n')), f + ': dice que sin gimnasios todo sigue igual');
  for (const [f, xc] of [['gimnasios-lectura.sql', lc], ['gimnasios-socios.sql', sc]]){
    const g1 = xc.indexOf("raise exception 'Primero correr supabase/gimnasios.sql");
    t.ok(g1 > 0 && g1 < xc.indexOf('create or replace function'), f + ': lo primero controla que estén los archivos anteriores');
    t.ok(/notify pgrst, 'reload schema';\s*$/.test(xc.trim() + '\n'), f + ': termina con notify pgrst');
    t.ok(!/drop table|drop column/i.test(xc), f + ': ningún drop table ni drop column (fuera del bloque para volver atrás)');
    t.ok(!/grant [^;]*\bto\b[^;]*\b(anon|public)\b/i.test(xc) && !/grant (insert|update|delete|all)/i.test(xc), f + ': ningún grant para anon o public, ni de escritura');
    const fx = [...xc.matchAll(/create or replace function public\.(\w+)\(([^\n]*)\)\s*returns[\s\S]*?\nas \$\$/g)];
    t.ok(fx.length > 0 && fx.every(m => /security definer\s+set search_path = public/.test(m[0])), f + ': todas las funciones security definer con search_path fijo (' + fx.length + ')');
    // Cada función tiene su revoke escrito (de public y anon, como mínimo), y las que llama la app, su grant.
    for (const m of fx){
      const sig = m[1];
      t.ok(new RegExp('revoke (all|execute) on function public\\.' + sig + '\\([^)]*\\) from public, anon').test(xc), f + ': ' + sig + ' tiene su revoke (de public y anon)');
    }
    // Volver atrás: borra cada función que crea.
    const atrasX = f === 'gimnasios-lectura.sql' ? lAtras : sAtras;
    t.eq(fx.map(m => m[1]).filter(n => !new RegExp('public\\.' + n + '\\(').test(atrasX)), [], f + ': el bloque para volver atrás borra cada función que crea');
    for (const m of xc.matchAll(/create policy "([^"]+)" on (\S+)/g)){
      const drop = m[2] === 'public.%I' ? 'drop policy if exists "' + m[1] + '" on public.%I' : 'drop policy if exists "' + m[1] + '" on ' + m[2] + ';';
      t.ok(xc.includes(drop), f + ': política «' + m[1] + '» se borra antes de crearla');
    }
    t.ok(!/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/.test(f === 'gimnasios-lectura.sql' ? l : so), f + ': sin mails');
    t.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(f === 'gimnasios-lectura.sql' ? l : so), f + ': sin uuids');
  }
  t.ok(/create policy "gimnasio lee lo que el socio compartió" on public\.%I for select to authenticated/.test(lc) && /\(select public\.gym_socios_compartidos\(\)\)::uuid\[\]/.test(lc),
    'lectura: las políticas son for select (las «for all» no se tocan) y piden la lista una vez por consulta');
  t.ok(/to_jsonb\(d\) - 'steps'/.test(lc) && /to_jsonb\(c\) - 'track'/.test(lc), 'gym_registro_lectura sin steps y gym_cardio_lectura sin track');
  // Columnas, bucket y tareas.
  t.ok([...sc.matchAll(/add column if not exists (\w+)/g)].length === 9, 'socios: 9 columnas nuevas, todas «if not exists»');
  const addsS = [...sc.matchAll(/add constraint (\w+)/g)].map(m => m[1]);
  t.ok(addsS.length >= 2 && addsS.every(c => sc.includes('drop constraint if exists ' + c + ';')), 'cada check se borra antes de crearlo');
  t.ok([...sc.matchAll(/create (unique )?index (\S+)/g)].every(m => m[2] === 'if'), 'índices «if not exists»');
  t.ok(/values \('gym-fotos', 'gym-fotos', false, 307200, array\['image\/jpeg', 'image\/webp'\]\)/.test(sc), 'bucket gym-fotos privado, 300 KB, jpg o webp');
  t.ok(!/create policy "[^"]+" on storage\.objects\s+for (update|delete)/.test(sc), 'gym-fotos: sin update ni delete desde la app');
  t.ok(/cron\.schedule\('gize-gym-tick', '\* \* \* \* \*'/.test(sc) && /cron\.schedule\('gize-gym-diaria', '10 6 \* \* \*'/.test(sc)
    && sc.includes("select cron.unschedule('gize-gym-tick') where exists") && sc.includes("select cron.unschedule('gize-gym-diaria') where exists"),
    'las dos tareas, en UTC, y se pueden volver a programar');
  t.ok(!/create trigger[^;]*coach_billing/i.test(sc + lc + vc), 'restaurar al pagar no es un trigger en coach_billing (lo hace gym_tick)');
  t.ok((sc.match(/'2026-10-borrador'/g) || []).length === 3 && /function public\.gym_versiones\(\)\s*returns jsonb/.test(sc), 'las versiones de la hoja, «compartir» y el contrato salen de un solo lugar (gym_versiones)');
  t.ok(sc.includes("insert into public.app_config (key, value) values ('gimnasios', '{\"alta\": false}') on conflict (key) do nothing;"), 'crear gimnasios, apagado por defecto (y no pisa lo que haya)');
  // Los textos para la persona no nombran el plan ni mandan a pagar (los filtros de las tiendas).
  const textos = [...(sc + vc).matchAll(/raise exception '([^']+)'/g)].map(m => m[1]).filter(m => !/^(Primero|Faltan) /.test(m) && !viejos.has(m));
  t.ok(textos.length > 40, 'textos de error: ' + textos.length);
  for (const m of textos){
    t.ok(!/renov|renuev|ampl[ií]|eleg[ií] un plan|pag[aá]r|precio|\$/i.test(m), 'no manda a renovar, ampliar ni pagar: ' + m);
  }
  t.ok(!textos.some(m => /\bplan\b/i.test(m)), 'ningún texto de error nombra «el plan»: ' + textos.filter(m => /\bplan\b/i.test(m)).join(' | '));

  // ===== Etapa 1, parte 5: gimnasios-admin.sql =====
  const ad = read('supabase/gimnasios-admin.sql');
  t.ok(!!ad, 'existe gimnasios-admin.sql');
  const ac = sinComentarios(ad.slice(0, ad.indexOf('-- ===== Para volver atrás ====='))), aAtras = ad.slice(ad.indexOf('-- ===== Para volver atrás =====')).split('\n').filter(z => z.startsWith('-- ')).map(z => z.slice(3)).join('\n');
  t.ok(cabeza(ad, 6).includes('Correr con el workflow "Supabase" → tarea sql → supabase/gimnasios-admin.sql, después de supabase/gimnasios.sql, supabase/gimnasios-vinculo.sql, supabase/gimnasios-lectura.sql y supabase/gimnasios-socios.sql. Se puede correr varias veces.'),
    'gimnasios-admin.sql: cómo correrlo, después de qué y que se puede volver a correr');
  t.ok(/SIN GIMNASIOS TODO SIGUE IGUAL/.test(ad.split('\n').slice(0, 15).join('\n')) && /ANTES: publicar la función vence-plan nueva/.test(cabeza(ad, 10)),
    'gimnasios-admin.sql: dice que sin gimnasios todo sigue igual y que antes va la función vence-plan');
  t.ok(/OJO: canónico\. Acá están las versiones vigentes de admin_coaches y admin_set_config \(antes en admin\.sql\), admin_overview \(antes en precios-2026-10\.sql\), hay_avisos_vence y tomar_avisos_vence \(antes en compras-apple\.sql\) y soltar_aviso_vence \(antes en aviso-vencimiento\.sql\)/.test(cabeza(ad, 22)),
    'gimnasios-admin.sql: es el canónico de las seis funciones');
  for (const [f, n, que] of [['admin.sql', 16, 'admin_coaches'], ['precios-2026-10.sql', 6, 'admin_overview'], ['compras-apple.sql', 10, 'tomar_avisos_vence'], ['aviso-vencimiento.sql', 20, 'soltar_aviso_vence']])
    t.ok(cabeza(read('supabase/' + f), n).includes(que) && /gimnasios-admin\.sql/.test(cabeza(read('supabase/' + f), n)), f + ': la nota «OJO» de ' + que + ' manda a gimnasios-admin.sql');
  const g5 = ac.indexOf("raise exception 'Primero correr supabase/gimnasios.sql");
  t.ok(g5 > 0 && g5 < ac.indexOf('create or replace function'), 'gimnasios-admin.sql: lo primero controla que estén los archivos anteriores');
  t.ok(/notify pgrst, 'reload schema';\s*$/.test(ac.trim() + '\n'), 'gimnasios-admin.sql: termina con notify pgrst');
  t.ok(!/drop table|drop column/i.test(ac), 'gimnasios-admin.sql: ningún drop table ni drop column (fuera del bloque para volver atrás)');
  t.ok(!/grant [^;]*\bto\b[^;]*\b(anon|public)\b/i.test(ac) && !/grant (insert|update|delete|all)/i.test(ac), 'gimnasios-admin.sql: ningún grant para anon o public, ni de escritura');
  const fa = [...ac.matchAll(/create or replace function public\.(\w+)\(([^\n]*)\)\s*returns[\s\S]*?\nas \$\$/g)];
  t.ok(fa.length >= 15 && fa.every(m => /security definer\s+set search_path = public/.test(m[0])), 'gimnasios-admin.sql: todas las funciones security definer con search_path fijo (' + fa.length + ')');
  for (const m of fa) t.ok(new RegExp('revoke (all|execute) on function public\\.' + m[1] + '\\([^)]*\\) from public, anon').test(ac), 'gimnasios-admin.sql: ' + m[1] + ' tiene su revoke (de public y anon)');
  t.ok(fa.filter(m => /^admin_/.test(m[1])).every(m => m[0].includes('perform public.admin_assert();') || ac.slice(ac.indexOf(m[0])).split('end $$;')[0].includes('perform public.admin_assert();') || m[1] === 'admin_gym_fila'),
    'cada admin_* llama a admin_assert (salvo la ayuda interna admin_gym_fila)');
  const conLog = ['admin_gym_convertir', 'admin_gym_transferir', 'admin_gym_cerrar', 'admin_gym_profes_extra', 'admin_gym_auditoria', 'admin_set_config'];
  for (const fn of conLog) t.ok(sentencia(ad, fn).includes('perform public.admin_log('), fn + ': queda en admin_audit (admin_log)');
  for (const fn of ['admin_gym_convertir', 'admin_gym_transferir', 'admin_gym_profes_extra']) t.ok(sentencia(ad, fn).includes('perform public.gym_auditar('), fn + ': queda en gym_audit');
  const nuevasA = fa.map(m => m[1]).filter(n => !['admin_coaches', 'admin_set_config', 'admin_overview', 'hay_avisos_vence', 'tomar_avisos_vence', 'soltar_aviso_vence'].includes(n));
  t.eq(nuevasA.filter(n => !new RegExp('public\\.' + n + '\\(').test(aAtras)), [], 'gimnasios-admin.sql: el bloque para volver atrás borra cada función nueva');
  for (const [fn, f] of [['admin_coaches', 'admin.sql'], ['admin_set_config', 'admin.sql'], ['admin_overview', 'precios-2026-10.sql'], ['hay_avisos_vence', 'compras-apple.sql'],
    ['tomar_avisos_vence', 'compras-apple.sql'], ['soltar_aviso_vence', 'aviso-vencimiento.sql']]){
    const hoy = sentencia(read('supabase/' + f), fn);
    t.ok(hoy && sentencia(aAtras, fn) === hoy, 'gimnasios-admin.sql, volver atrás: la ' + fn + ' de hoy (' + f + '), tal cual');
  }
  t.ok(aAtras.includes('drop table if exists public.gym_avisos_vence;'), 'volver atrás saca la tabla gym_avisos_vence');
  t.ok(/revoke all on table public\.gym_avisos_vence from public, anon, authenticated;/.test(ad) && /alter table public\.gym_avisos_vence enable row level security;/.test(ad),
    'gym_avisos_vence: con RLS y sin permisos para la app (el vencimiento del plan del dueño no lo ve el gimnasio)');
  t.ok(!/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/.test(ad) && !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(ad), 'gimnasios-admin.sql: sin mails ni uuids');
  t.ok(/'gimnasios'/.test(sentencia(ad, 'admin_set_config')) && /\{"alta": true\} o \{"alta": false\}/.test(ad), 'admin_set_config: la clave «gimnasios» solo con {"alta": true|false}');
  t.ok(/'dias', 'copia'|dias integer, copia uuid\[\]/.test(ad) && /interval '7 days'/.test(sentencia(ad, 'tomar_avisos_vence')) && /then 1\s+when public\.coach_vence\(b\) <= now\(\) \+ interval '3 days' then 3 else 7/.test(sentencia(ad, 'tomar_avisos_vence')),
    'tomar_avisos_vence: dueños a 7, 3 y 1 día, con la copia a la administración');
  t.ok(/admin_gym_fila\(uuid\) from public, anon, authenticated/.test(ac) && /gym_profe_sin_cargo\(uuid\) from public, anon, authenticated/.test(ac), 'las ayudas internas sin permiso para la app');
  t.ok(!/create trigger/i.test(ac), 'gimnasios-admin.sql no suma triggers');

  // La lista de la base de pruebas.
  const lista = read('tests/pg/orden.txt').split('\n').map(l => l.replace(/#.*/, '').trim()).filter(Boolean);
  const fuera = ['cuentas-demo.sql', 'auditoria.sql', 'estado.sql', 'seguridad-chequeo.sql', 'esquema-huella.sql', 'gimnasios.sql', 'gimnasios-vinculo.sql', 'gimnasios-lectura.sql', 'gimnasios-socios.sql', 'gimnasios-admin.sql'];
  const todos = fs.readdirSync(path.join(ROOT, 'supabase')).filter(f => f.endsWith('.sql'));
  t.eq(todos.filter(f => !lista.includes(f) && !fuera.includes(f)), [], 'tests/pg/orden.txt nombra todos los supabase/*.sql (o los deja afuera a propósito)');
  t.eq(lista.filter(f => !todos.includes(f)), [], 'y todos los que nombra existen');
  t.eq(new Set(lista).size, lista.length, 'sin repetidos');
};
