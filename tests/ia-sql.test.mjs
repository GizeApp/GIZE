// supabase/ia.sql (la guardia de gasto de la IA) y los cambios de supabase/pedidos-productos.sql
// (lo que leyó la IA en cada pedido).
// 1) Leído: RLS prendido y sin permisos para la app en las tablas nuevas; reservar, cerrar, cortar,
//    vencer y limpiar solo para la service role (la función «ia»); el panel primero chequea que sea
//    administrador; arranca apagada; se puede volver a correr; ningún id de modelo en la base (la
//    lista vive en la función); pedidos-productos.sql borra admin_requests antes de cambiarle lo
//    que devuelve y la app no puede cargar las columnas ai_*.
// 2) De verdad, si en la máquina hay un Postgres (en GitHub, el de ubuntu-24.04; si no hay, se
//    saltea): con lo mínimo de Supabase simulado, corre los dos archivos dos veces y prueba los
//    ciclos (con ancla el 31/01, fines 28/02, 31/03, 30/04), dos reservas a la vez después del
//    cambio de ciclo (un solo ciclo y ninguna falla), una llamada del ciclo viejo que falla
//    después del cambio (corta el viejo, no el nuevo), cada control de ia_reservar y los
//    umbrales de ia_cerrar.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.existsSync(path.join(ROOT, f)) ? fs.readFileSync(path.join(ROOT, f), 'utf8') : '';
const sinComentarios = s => s.replace(/--[^\n]*/g, '');
const fn = (sql, name) => {
  const i = sql.indexOf('create or replace function public.' + name + '(');
  if (i < 0) return '';
  const a = sql.indexOf('$$', i), b = sql.indexOf('$$', a + 2);
  return sql.slice(i, b + 2);
};

export default async ({ t }) => {
  const sql = read('supabase/ia.sql'), ped = read('supabase/pedidos-productos.sql');
  t.ok(!!sql, 'existe supabase/ia.sql');
  if (!sql) return;
  const code = sinComentarios(sql), pcode = sinComentarios(ped);
  const cabeza = sql.split('\n').slice(0, 30).join('\n');
  t.has(cabeza, 'Correr con el workflow "Supabase" → tarea sql → supabase/ia.sql', 'encabezado: cómo correrlo');
  t.has(cabeza, 'Se puede correr varias veces', 'encabezado: se puede correr varias veces');
  t.ok(/supabase\/pedidos-productos\.sql/.test(cabeza) && /supabase\/admin\.sql/.test(cabeza), 'encabezado: de qué depende');
  t.ok(/ARRANCA APAGADA/.test(cabeza), 'encabezado: arranca apagada');

  // Arranca apagada.
  t.ok(/activa\s+boolean not null default false/.test(code) && /alter column activa set default false/.test(code), 'ia_config.activa: default false');
  const funs = JSON.parse((code.match(/funciones\s+jsonb not null default '([^']+)'/) || [])[1] || '{}');
  t.ok(Object.keys(funs).length === 6 && Object.values(funs).every(v => v === false), 'cada función arranca en false: ' + JSON.stringify(funs));
  t.ok(/insert into public\.ia_config \(id\) values \(1\) on conflict \(id\) do nothing;/.test(code), 'la fila de la configuración se crea una vez y no se pisa');
  t.ok(!/drop table/i.test(code) && !/truncate/i.test(code), 'no borra tablas ni datos (se puede volver a correr)');
  // El aviso cambió (solo la foto, sin texto): versión 2, que solo sube (correrlo de nuevo no vuelve a preguntar).
  t.ok(/update public\.ia_config set aviso_version = 2 where id = 1 and aviso_version < 2;/.test(code), 'el aviso pasa a la versión 2 (solo la foto) y nunca baja');

  // Tablas: RLS y permisos.
  for (const tb of ['ia_config', 'ia_ciclos', 'ia_llamadas', 'ia_permisos', 'ia_reportes']){
    t.ok(code.includes('create table if not exists public.' + tb + ' ('), tb + ': create if not exists');
    t.ok(code.includes('alter table public.' + tb + ' enable row level security;'), tb + ': RLS prendido');
    t.ok(code.includes('revoke all on public.' + tb + ' from anon, authenticated;'), tb + ': sin permisos para anon ni authenticated');
  }
  const pols = [...code.matchAll(/create policy "[^"]+" on public\.(\w+)/g)].map(m => m[1]);
  t.eq(pols, ['ia_permisos'], 'la única política es la de ia_permisos (sin políticas en ia_config, ia_ciclos, ia_llamadas ni ia_reportes)');
  t.ok(/create policy "ia_permisos: el mío" on public\.ia_permisos for select to authenticated using \(user_id = auth\.uid\(\)\);/.test(code), 'ia_permisos: cada uno ve solo el suyo');
  t.ok(/grant select on public\.ia_permisos to authenticated;/.test(code) && !/grant (insert|update|delete|all)[^;]*on (table )?public\.ia_/i.test(code), 'ia_permisos: solo lectura desde la app; nada más se da');
  t.ok(!/grant [^;]*\bto\b[^;]*\b(anon|public)\b/i.test(code), 'ningún grant para anon ni public');
  t.ok(/user_id\s+uuid references auth\.users\(id\) on delete set null/.test(code), 'ia_llamadas: al borrar la cuenta queda sin la persona');

  // Funciones de la guardia: solo la service role.
  for (const sig of ['ia_reservar(uuid, text, text, text, numeric, bigint)', 'ia_cerrar(bigint, text, text, numeric, int, int, int, int, int)', 'ia_cortar(bigint, text, timestamptz)', 'ia_vencer()', 'ia_limpiar()', 'coach_pago(uuid)', 'ia_rol(uuid)', 'ia_permiso_estado(uuid)']){
    const e = sig.replace(/[()]/g, '\\$&');
    t.ok(new RegExp('revoke all on function public\\.' + e + ' from public, anon, authenticated;').test(code), sig + ': nada para public, anon ni authenticated');
    t.ok(new RegExp('grant execute on function public\\.' + e + ' to service_role;').test(code), sig + ': solo la service role');
  }
  for (const sig of ['ia_ciclo_de(timestamptz, timestamptz)', 'ia_ciclo_tomar()', 'ia_hoy()', 'ia_frenada(bigint, text)'])
    t.ok(code.includes('revoke all on function public.' + sig + ' from public, anon, authenticated;') && !code.includes('grant execute on function public.' + sig), sig + ': uso interno');
  // La app: lo que puede llamar con su sesión (y nada para anon ni public).
  for (const sig of ['ia_mi_estado()', 'ia_permiso(text, boolean, int)', 'ia_reportar(text, jsonb, text)']){
    const e = sig.replace(/[()]/g, '\\$&');
    t.ok(new RegExp('revoke all on function public\\.' + e + ' from public, anon;').test(code) && code.includes('grant execute on function public.' + sig + ' to authenticated;'), sig + ': solo con sesión');
  }
  t.ok(/v_uid uuid := auth\.uid\(\)/.test(fn(code, 'ia_permiso')) && /v_uid uuid := auth\.uid\(\)/.test(fn(code, 'ia_reportar')) && /v_uid uuid := auth\.uid\(\)/.test(fn(code, 'ia_mi_estado')), 'la app solo toca lo suyo (auth.uid())');
  t.ok(!/usd|gastado|credito/.test(fn(code, 'ia_mi_estado').split('return jsonb_build_object(\'activa\', true')[1] || 'usd'), 'ia_mi_estado no devuelve montos');
  t.ok(/add column if not exists fuente text check \(fuente is null or fuente in \('ia', 'ia-editado'\)\)/.test(code), 'food_entries.fuente: ia o ia-editado');
  t.ok(/user_id\s+uuid references auth\.users\(id\) on delete cascade,\s+funcion\s+text not null check \(funcion in \('plato', 'texto'\)\)/.test(code), 'ia_reportes: se borra con la cuenta');
  t.ok(/delete from public\.ia_reportes where creada < now\(\) - interval '180 days'/.test(fn(code, 'ia_limpiar')), 'ia_reportes: se borra a los 180 días');
  for (const name of ['ia_ciclo_tomar', 'ia_frenada', 'ia_reservar', 'ia_cerrar', 'ia_cortar', 'ia_vencer', 'ia_limpiar', 'coach_pago', 'admin_ia_estado', 'admin_ia_config', 'admin_ia_ciclo', 'admin_ia_reintentar', 'ia_rol', 'ia_permiso_estado', 'ia_mi_estado', 'ia_permiso', 'ia_reportar'])
    t.ok(/security definer set search_path = public/.test(fn(code, name)), name + ': security definer con search_path fijo');
  // Panel: primero, que sea administrador.
  for (const name of ['admin_ia_estado', 'admin_ia_config', 'admin_ia_ciclo', 'admin_ia_reintentar']){
    const f = fn(code, name);
    t.ok(/\bbegin\s+perform public\.admin_assert\(\);/.test(f), name + ': lo primero es admin_assert()');
    t.ok(code.includes('grant execute on function public.' + name + '(') && new RegExp('revoke all on function public\\.' + name + '\\([^)]*\\) from public, anon;').test(code), name + ': solo con sesión (y adentro, admin)');
  }
  // Ciclos.
  const ciclo = fn(code, 'ia_ciclo_tomar');
  t.ok(/pg_advisory_xact_lock\(hashtext\('ia_ciclo'\)\)/.test(ciclo) && /on conflict \(inicio\) do nothing/.test(ciclo) && /for update/.test(ciclo), 'el ciclo se crea con lock, on conflict y se bloquea la fila');
  t.ok(/make_interval\(months => k\)/.test(fn(code, 'ia_ciclo_de')) && /at time zone 'UTC'/.test(fn(code, 'ia_ciclo_de')), 'cada ciclo se calcula desde el ancla, en UTC');
  // Reservar: el orden de los controles.
  const res = fn(code, 'ia_reservar');
  const orden = ["'apagada'", 'ia_ciclo_tomar()', "'sin_ciclo'", "v_c.estado = 'cortado'", "'tope_mes', 'motivo', 'tope'", "'codigo', 'ahorro'", "'codigo', 'ritmo'", "'codigo', 'tope_dia'", "'codigo', 'tope_persona'", 'insert into public.ia_llamadas'].map(s => res.indexOf(s));
  t.ok(orden.every((x, i) => x > 0 && (i === 0 || x > orden[i - 1])), 'ia_reservar: interruptor → ciclo → corte → tope → ahorro → ritmo → tope del día → tope de la persona → reserva: ' + orden.join(','));
  t.ok(/l\.estado in \('ok', 'vacia', 'reservada', 'vencida'\) or \(l\.estado = 'error' and \(l\.usd is null or l\.usd > 0\)\)/.test(res), 'tope del día: cuenta lo que pudo costar (no los errores explícitos de la API, con usd 0)');
  t.ok(/greatest\(2, 2 \* \(v_c\.tope - v_c\.gastado\) \/ v_dias\)/.test(res), 'ritmo: el doble de lo que toca por día, mínimo US$2');
  const cer = fn(code, 'ia_cerrar');
  t.ok(/if v_l\.id is null or v_l\.estado <> 'reservada' then return; end if;/.test(cer), 'ia_cerrar: una llamada ya cerrada no se cuenta dos veces');
  t.ok(/case when p_usd is null then v_l\.max_usd/.test(cer), 'ia_cerrar: sin costo conocido se cobra la reserva');
  t.ok(/where id = v_l\.ciclo_id/.test(cer), 'ia_cerrar: suma al ciclo de la llamada');
  t.ok(/cortado_por = 'tope' and p_motivo <> 'tope'/.test(fn(code, 'ia_cortar')), 'ia_cortar: un corte por tope no se cambia por uno más corto');
  // pg_cron, sin duplicar.
  for (const job of ['gize-ia-vencer', 'gize-ia-limpiar'])
    t.ok(code.includes("select cron.unschedule('" + job + "') where exists (select 1 from cron.job where jobname = '" + job + "');") && code.includes("select cron.schedule('" + job + "'"), job + ': se reprograma sin duplicar');
  // Ningún id de modelo en la base: la lista es la de la función.
  const P = await import(pathToFileURL(path.join(ROOT, 'supabase/functions/ia/precios.ts')).href);
  for (const id of Object.keys(P.MODELOS)) t.ok(!sql.includes(id) && !ped.includes(id), 'la base no nombra modelos (' + id + ')');
  t.ok(/modelos\s+jsonb not null default '\{\}'/.test(code), 'ia_config.modelos arranca vacío (usa el de la función)');
  // Lo de septiembre (ia_uso, ia_contar) no se toca hasta que el dueño mire si tiene filas.
  t.ok(!/ia_uso|ia_contar/.test(code), 'no borra ia_uso ni ia_contar todavía');

  // pedidos-productos.sql.
  const iDrop = pcode.indexOf('drop function if exists public.admin_requests(text);'), iCreate = pcode.indexOf('create or replace function public.admin_requests(kind text)');
  t.ok(iDrop > 0 && iCreate > iDrop, 'pedidos-productos.sql: borra admin_requests antes de cambiarle lo que devuelve');
  t.ok(/grant execute on function public\.admin_requests\(text\) to authenticated;/.test(pcode.slice(iCreate)), 'y le vuelve a dar los permisos');
  const cols = ['ai_encontrada', 'ai_kcal', 'ai_protein', 'ai_carbs', 'ai_fat', 'ai_unit', 'ai_portion', 'ai_por_porcion', 'ai_revisar', 'ai_dudosos', 'ai_modelo', 'ai_at', 'ai_corregido', 'ai_corregidos', 'ai_columna'];
  for (const c of cols){
    t.ok(new RegExp('add column if not exists ' + c + '\\b').test(pcode), 'product_requests.' + c);
    t.ok(new RegExp('new\\.' + c + ' := null;').test(fn(pcode, 'product_requests_before')), 'desde la app, ' + c + ' entra vacío');
  }
  t.ok(/r\.ai_kcal, r\.ai_protein/.test(fn(pcode, 'admin_requests')) && /r\.ai_columna/.test(fn(pcode, 'admin_requests')), 'admin_requests devuelve lo que leyó la IA (con la columna de la tabla)');
  // Cada vez que la guardia frena, se cuenta en el ciclo (esas llamadas no quedan en ia_llamadas).
  for (const cod of ['tope_mes', 'ahorro', 'ritmo', 'tope_dia', 'tope_persona'])
    t.ok(new RegExp("perform public\\.ia_frenada\\(v_c\\.id, '" + cod + "'\\);\\s+return jsonb_build_object\\('ok', false, 'codigo', '" + cod + "'").test(res), 'ia_reservar cuenta la frenada «' + cod + '»');
  const pub = fn(pcode, 'admin_request_publish');
  t.ok(/update public\.product_requests set ai_corregido = cardinality\(corr\) > 0, ai_corregidos = corr where id = rid;/.test(pub), 'al publicar se anota qué corrigió el administrador');

  // ---------- 2) De verdad, con Postgres ----------
  await conPostgres(t, sql, ped);
};

// Busca los programas de Postgres. Si corre como root (initdb no lo deja), usa el usuario postgres.
function postgres(){
  const dirs = [];
  try { for (const v of fs.readdirSync('/usr/lib/postgresql').sort().reverse()) dirs.push('/usr/lib/postgresql/' + v + '/bin'); } catch (e) {}
  const bin = dirs.find(d => ['initdb', 'pg_ctl', 'postgres'].every(p => fs.existsSync(path.join(d, p))));
  const psql = ['/usr/bin/psql', bin && path.join(bin, 'psql')].find(p => p && fs.existsSync(p));
  if (!bin || !psql) return null;
  const root = process.getuid && process.getuid() === 0;
  if (root && spawnSync('id', ['-u', 'postgres']).status !== 0) return null;
  const como = root ? (p, args) => ['runuser', ['-u', 'postgres', '--', path.join(bin, p), ...args]] : (p, args) => [path.join(bin, p), args];
  return { bin, psql, como, root };
}

async function conPostgres(t, sql, ped){
  const pg = postgres();
  if (!pg){ console.log('    (ia-sql: no hay Postgres en esta máquina: se saltea la parte que corre el SQL)'); return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gize-ia-pg-'));
  if (pg.root) { fs.chmodSync(dir, 0o777); spawnSync('chown', ['postgres', dir]); }
  const datos = path.join(dir, 'datos');
  const correr = (p, args) => { const [c, a] = pg.como(p, args); return spawnSync(c, a, { encoding: 'utf8', timeout: 60000 }); };
  let ini = correr('initdb', ['-D', datos, '-A', 'trust', '-U', 'postgres', '--no-sync']);
  if (ini.status !== 0){ t.ok(false, 'initdb: ' + (ini.stderr || '').slice(0, 300)); return; }
  const puerto = String(20000 + Math.floor(Math.random() * 20000));
  ini = correr('pg_ctl', ['-D', datos, '-w', '-o', `-p ${puerto} -k ${dir} -c listen_addresses='' -c fsync=off -c timezone=UTC`, '-l', path.join(dir, 'log.txt'), 'start']);
  if (ini.status !== 0){ t.ok(false, 'no arrancó Postgres: ' + (ini.stderr || ini.stdout || '').slice(0, 300)); return; }
  const psql = (texto, db = 'gize') => spawnSync(pg.psql, ['-h', dir, '-p', puerto, '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-q', '-At', '-f', '-'], { input: texto, encoding: 'utf8', timeout: 60000 });
  const psqlAsync = (texto) => new Promise(ok => {
    const c = spawn(pg.psql, ['-h', dir, '-p', puerto, '-U', 'postgres', '-d', 'gize', '-v', 'ON_ERROR_STOP=1', '-q', '-At', '-f', '-']);
    let out = ''; c.stdout.on('data', d => out += d); c.stderr.on('data', d => out += d); c.on('close', code => ok({ code, out })); c.stdin.end(texto);
  });
  try {
    let r = psql('create database gize;', 'postgres');
    t.ok(r.status === 0, 'crea la base de prueba: ' + r.stderr);
    r = psql(STUBS);
    t.ok(r.status === 0, 'lo mínimo de Supabase: ' + r.stderr);
    for (const vez of [1, 2]){
      r = psql(ped); t.ok(r.status === 0, 'pedidos-productos.sql corre (vez ' + vez + '): ' + (r.stderr || '').split('\n').filter(l => /ERROR/.test(l)).join(' '));
      r = psql(sql); t.ok(r.status === 0, 'ia.sql corre (vez ' + vez + '): ' + (r.stderr || '').split('\n').filter(l => /ERROR/.test(l)).join(' '));
    }
    t.eq(psql("select count(*) from cron.job where jobname like 'gize-ia-%';").stdout.trim(), '2', 'dos trabajos de pg_cron, sin duplicar');
    t.eq(psql('select aviso_version from public.ia_config;').stdout.trim(), '2', 'después de correrlo: el aviso en la versión 2');
    for (const [nombre, texto] of ESCENARIOS){
      r = psql(texto);
      t.ok(r.status === 0, nombre + ': ' + (r.stderr || '').split('\n').filter(l => /ERROR|CONTEXT/.test(l)).join(' ').slice(0, 400));
    }
    // Dos reservas a la vez, sin ciclo creado (recién empieza): la primera se queda adentro de su
    // transacción un segundo; la otra espera y usa el mismo ciclo.
    psql("delete from public.ia_llamadas; delete from public.ia_ciclos; update public.ia_config set activa = true, funciones = funciones || '{\"etiqueta_admin\": true}', ancla = '2026-01-31 00:00+00', topes = jsonb_set(topes, '{admin,etiqueta}', '300');");
    const reservar = uid => `set role service_role; select public.ia_reservar('${uid}', 'admin', 'etiqueta', 'modelo-x', 0.0014, 1)->>'ok';`;
    const [a, b] = await Promise.all([psqlAsync('begin; ' + reservar(ADMIN_ID) + ' select pg_sleep(1); commit;'), new Promise(ok => setTimeout(() => psqlAsync(reservar(OTRO_ID)).then(ok), 200))]);
    t.ok(a.code === 0 && b.code === 0 && /^true$/m.test(a.out) && /^true$/m.test(b.out), 'dos reservas a la vez: las dos andan: ' + JSON.stringify([a.out, b.out]));
    t.eq(psql('select count(*), sum(reservado) from public.ia_ciclos;').stdout.trim(), '1|0.002800', 'dos reservas a la vez: un solo ciclo con las dos reservas');
  } finally {
    correr('pg_ctl', ['-D', datos, '-m', 'immediate', 'stop']);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const ADMIN_ID = '22222222-2222-2222-2222-222222222222', ALUMNO_ID = '11111111-1111-1111-1111-111111111111', COACH_ID = '33333333-3333-3333-3333-333333333333', OTRO_ID = '44444444-4444-4444-4444-444444444444';

// Lo mínimo de Supabase para correr pedidos-productos.sql e ia.sql.
const STUBS = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create schema storage; create schema cron;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table storage.objects (bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
create table cron.job (jobid bigserial primary key, jobname text unique, schedule text, command text, active boolean default true);
create function cron.schedule(n text, s text, c text) returns bigint language sql as $$ insert into cron.job(jobname, schedule, command) values (n, s, c) returning jobid $$;
create function cron.unschedule(n text) returns boolean language sql as $$ delete from cron.job where jobname = n returning true $$;
grant usage on schema public, auth, storage, cron to anon, authenticated, service_role;
create table public.profiles (id uuid primary key references auth.users(id), full_name text, coach_id uuid, role text default 'client');
create table public.products (id uuid primary key default gen_random_uuid(), code text unique, name text, brand text, kcal numeric, protein numeric, carbs numeric, fat numeric,
  unit text, portion numeric, source text, verified boolean, created_by uuid, photo_path text, hidden boolean default false, reports int default 0);
create table public.product_reports (product_id uuid);
create table public.app_admins (user_id uuid primary key);
create function public.is_app_admin() returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from public.app_admins where user_id = auth.uid()) $$;
create function public.admin_assert() returns void language plpgsql stable security definer set search_path = public as $$
begin if not public.is_app_admin() then raise exception 'Solo administradores.' using errcode = '42501'; end if; end $$;
create table public.admin_audit (id bigserial, admin_id uuid, action text, target text, detail jsonb, created_at timestamptz default now());
create function public.admin_log(p_action text, p_target text, p_detail jsonb default null) returns void language plpgsql security definer set search_path = public as $$
begin perform public.admin_assert(); insert into public.admin_audit(admin_id, action, target, detail) values (auth.uid(), p_action, p_target, p_detail); end $$;
create table public.coach_billing (coach_id uuid primary key, plan text, max_clients int default 10, trial_ends_at timestamptz, paid_until timestamptz);
create table public.food_entries (id text primary key, client_id uuid references auth.users(id), name text);
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
insert into auth.users values ('${ADMIN_ID}', 'a@x'), ('${ALUMNO_ID}', 'b@x'), ('${COACH_ID}', 'c@x'), ('${OTRO_ID}', 'd@x');
insert into public.profiles values ('${ADMIN_ID}', 'Admin', null, 'client'), ('${ALUMNO_ID}', 'Alumno', '${COACH_ID}', 'client'), ('${COACH_ID}', 'Coach', null, 'coach'), ('${OTRO_ID}', 'Otro', null, 'client');
insert into public.app_admins values ('${ADMIN_ID}');
`;

const RES = (uid = ADMIN_ID, rol = 'admin', funcion = 'etiqueta', max = '0.0014') => `public.ia_reservar('${uid}', '${rol}', '${funcion}', 'modelo-x', ${max}, 1)`;
const ESCENARIOS = [
  ['ciclos desde el ancla (31/01 → 28/02, 31/03, 30/04), también con otra zona en la sesión', `
do $$ declare r record; begin
  select * into r from public.ia_ciclo_de('2026-01-31 00:00+00', '2026-02-10 12:00+00'); assert r.inicio = '2026-01-31 00:00+00' and r.fin = '2026-02-28 00:00+00', 'feb ' || r::text;
  select * into r from public.ia_ciclo_de('2026-01-31 00:00+00', '2026-03-05 12:00+00'); assert r.inicio = '2026-02-28 00:00+00' and r.fin = '2026-03-31 00:00+00', 'mar ' || r::text;
  select * into r from public.ia_ciclo_de('2026-01-31 00:00+00', '2026-04-15 00:00+00'); assert r.inicio = '2026-03-31 00:00+00' and r.fin = '2026-04-30 00:00+00', 'abr ' || r::text;
  select * into r from public.ia_ciclo_de('2026-01-31 00:00+00', '2026-03-31 00:00+00'); assert r.inicio = '2026-03-31 00:00+00', 'justo en el fin ' || r::text;
  select * into r from public.ia_ciclo_de('2026-11-10 00:00+00', '2026-10-19 15:00+00'); assert r.inicio = '2026-10-10 00:00+00' and r.fin = '2026-11-10 00:00+00', 'ancla futura ' || r::text;
  set local timezone = 'America/Argentina/Buenos_Aires';
  select * into r from public.ia_ciclo_de('2026-01-31 00:00+00', '2026-03-05 12:00+00'); assert r.inicio = '2026-02-28 00:00+00' and r.fin = '2026-03-31 00:00+00', 'en BA ' || r::text;
end $$;`],
  ['arranca apagada y desde la app no se puede reservar, cerrar, cortar ni leer', `
do $$ begin assert (select activa from public.ia_config) = false; assert (${RES()})->>'motivo' = 'apagada'; end $$;
set role authenticated; set request.jwt.claim.sub = '${ALUMNO_ID}';
do $$ begin
  begin perform ${RES()}; raise exception 'reservó'; exception when insufficient_privilege then null; end;
  begin perform public.ia_cerrar(1, 'ok', null, 0); raise exception 'cerró'; exception when insufficient_privilege then null; end;
  begin perform public.ia_cortar(1, 'tope', now()); raise exception 'cortó'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.ia_llamadas; raise exception 'leyó ia_llamadas'; exception when insufficient_privilege then null; end;
  begin perform public.admin_ia_estado(); raise exception 'panel sin ser admin'; exception when insufficient_privilege then null; end;
end $$;`],
  ['el admin la prende; sin ancla no se gasta; con ancla se crea el ciclo', `
set role authenticated; set request.jwt.claim.sub = '${ADMIN_ID}';
select public.admin_ia_config('{"activa": true, "funciones": {"etiqueta_admin": true}, "pedidos_desde": "2026-10-19T00:00:00Z"}');
do $$ begin
  begin perform public.admin_ia_config('{"funciones": {"inventada": true}}'); raise exception 'función inventada'; exception when sqlstate '22023' then null; end;
  begin perform public.admin_ia_config('{"topes": {"admin": {"etiqueta": 1.5}}}'); raise exception 'tope con decimales'; exception when sqlstate '22023' then null; end;
end $$;
reset role;
do $$ begin assert (${RES()})->>'motivo' = 'sin_ciclo'; end $$;
set role authenticated; set request.jwt.claim.sub = '${ADMIN_ID}';
select public.admin_ia_ciclo((current_date + 20));
reset role;
do $$ begin assert (select count(*) from public.ia_ciclos) = 1 and (select tope from public.ia_ciclos) = 180; end $$;`],
  ['reserva, cierre con el costo real, doble cierre, timeout y errores explícitos en el tope del día', `
update public.ia_config set topes = jsonb_set(topes, '{admin,etiqueta}', '3');
set role service_role;
do $$ declare j jsonb; c public.ia_ciclos; begin
  j := ${RES()}; assert (j->>'ok')::boolean, j::text;
  select * into c from public.ia_ciclos; assert c.reservado = 0.0014 and c.gastado = 0, c::text;
  perform public.ia_cerrar((j->>'llamada_id')::bigint, 'ok', null, 0.000389, 2600, 80, 0, 0, 1200);
  perform public.ia_cerrar((j->>'llamada_id')::bigint, 'ok', null, 0.5);
  select * into c from public.ia_ciclos; assert c.reservado = 0 and c.gastado = 0.000389, 'cierre ' || c::text;
  j := ${RES()}; perform public.ia_cerrar((j->>'llamada_id')::bigint, 'error', 'tiempo', null);
  select * into c from public.ia_ciclos; assert c.gastado = 0.001789, 'timeout cobra la reserva ' || c::text;
  j := ${RES()}; perform public.ia_cerrar((j->>'llamada_id')::bigint, 'error', 'sobrecarga', 0);
  j := ${RES()}; assert (j->>'ok')::boolean, 'tercera ' || j::text; perform public.ia_cerrar((j->>'llamada_id')::bigint, 'error', 'refusal', 0.0003);
  j := ${RES()}; assert j->>'codigo' = 'tope_dia', 'cuarta ' || j::text;
end $$;
reset role; update public.ia_config set topes = jsonb_set(topes, '{admin,etiqueta}', '300');`],
  ['créditos agotados (media hora y vuelve sola) y límite de la Console', `
set role service_role;
do $$ declare j jsonb; c public.ia_ciclos; begin
  select * into c from public.ia_ciclos;
  perform public.ia_cortar(c.id, 'creditos', now() + interval '30 minutes');
  j := ${RES()}; assert j->>'codigo' = 'pausada' and j->>'motivo' = 'creditos', j::text;
  update public.ia_ciclos set vuelve = now() - interval '1 minute';
  j := ${RES()}; assert (j->>'ok')::boolean, 'prueba ' || j::text;
  assert (select estado from public.ia_ciclos) = 'normal';
  perform public.ia_cerrar((j->>'llamada_id')::bigint, 'ok', null, 0.0004);
  perform public.ia_cortar(c.id, 'limite_console', now() + interval '10 days');
  j := ${RES()}; assert j->>'codigo' = 'tope_mes', 'console ' || j::text;
  update public.ia_ciclos set vuelve = now() - interval '1 second';
  j := ${RES()}; assert (j->>'ok')::boolean, 'console pasada ' || j::text;
  perform public.ia_cerrar((j->>'llamada_id')::bigint, 'ok', null, 0.0004);
end $$;`],
  ['umbrales: aviso, ahorro (la tabla sigue; plato de alumno sin coach pago no; rutina al barato) y corte', `
update public.ia_ciclos set gastado = 99.9999;
set role service_role;
do $$ declare j jsonb; begin j := ${RES()}; perform public.ia_cerrar((j->>'llamada_id')::bigint, 'ok', null, 0.0004);
  assert (select aviso_at from public.ia_ciclos) is not null and (select estado from public.ia_ciclos) = 'normal'; end $$;
reset role; update public.ia_ciclos set gastado = 150; update public.ia_config set funciones = funciones || '{"plato": true, "rutina": true}';
set role service_role;
do $$ declare j jsonb; begin
  j := ${RES()}; assert (j->>'ok')::boolean and (select estado from public.ia_ciclos) = 'ahorro', 'ahorro ' || j::text; perform public.ia_cerrar((j->>'llamada_id')::bigint, 'ok', null, 0.0004);
  j := ${RES(ALUMNO_ID, 'alumno', 'plato', '0.0055')}; assert j->>'codigo' = 'ahorro', 'plato sin coach pago ' || j::text;
end $$;
reset role; insert into public.coach_billing (coach_id, plan, paid_until) values ('${COACH_ID}', 'p10', now() + interval '10 days');
set role service_role;
do $$ declare j jsonb; begin
  j := ${RES(ALUMNO_ID, 'alumno', 'plato', '0.0055')}; assert (j->>'ok')::boolean, 'plato con coach pago ' || j::text; perform public.ia_cerrar((j->>'llamada_id')::bigint, 'ok', null, 0.0008);
  j := ${RES(COACH_ID, 'coach', 'rutina', '0.114')}; assert (j->>'ok')::boolean and (j->>'ahorro')::boolean, 'rutina ' || j::text; perform public.ia_cerrar((j->>'llamada_id')::bigint, 'ok', null, 0.004);
end $$;
reset role; update public.ia_ciclos set gastado = 179.9995;
set role service_role;
do $$ declare j jsonb; c public.ia_ciclos; begin
  j := ${RES()}; assert j->>'codigo' = 'tope_mes' and j->>'motivo' = 'tope', 'tope ' || j::text;
  select * into c from public.ia_ciclos; assert c.estado = 'cortado' and c.cortado_por = 'tope' and c.vuelve = c.fin, c::text;
  perform public.ia_cortar(c.id, 'creditos', now()); assert (select cortado_por from public.ia_ciclos) = 'tope', 'no pisa el tope';
end $$;
reset role; update public.ia_ciclos set gastado = 180;
set role authenticated; set request.jwt.claim.sub = '${ADMIN_ID}';
do $$ begin begin perform public.admin_ia_reintentar(); raise exception 'destrabó un ciclo que llegó al corte'; exception when sqlstate '22023' then null; end; end $$;
reset role; update public.ia_ciclos set gastado = 10, estado = 'cortado', cortado_por = 'creditos', vuelve = now() + interval '20 minutes';
update public.ia_config set funciones = funciones || '{"plato": false, "rutina": false}';
set role authenticated; set request.jwt.claim.sub = '${ADMIN_ID}';
do $$ begin assert (public.admin_ia_reintentar() -> 'ciclo' ->> 'estado') = 'normal', 'volver a probar'; end $$;`],
  ['ritmo del día y tope del ciclo de la persona', `
update public.ia_ciclos set gastado = 177;
insert into public.ia_llamadas (ciclo_id, rol, funcion, modelo, estado, max_usd, usd) select id, 'admin', 'etiqueta', 'modelo-x', 'ok', 1.99, 1.99 from public.ia_ciclos;
set role service_role;
do $$ begin assert (${RES(ADMIN_ID, 'admin', 'etiqueta', '0.02')})->>'codigo' = 'ritmo', 'ritmo'; end $$;
reset role; delete from public.ia_llamadas where usd = 1.99; update public.ia_ciclos set gastado = 10;
update public.ia_config set topes = jsonb_set(topes, '{admin,usd_ciclo}', '0.002');
set role service_role;
do $$ begin assert (${RES()})->>'codigo' = 'tope_persona', 'tope de la persona'; end $$;
reset role; update public.ia_config set topes = jsonb_set(topes, '{admin,usd_ciclo}', '10');`],
  ['vencidas: se cierran solas cobrando la reserva', `
set role service_role;
do $$ declare j jsonb; g numeric; begin
  j := ${RES()}; update public.ia_llamadas set creada = now() - interval '11 minutes' where id = (j->>'llamada_id')::bigint;
  select gastado into g from public.ia_ciclos;
  assert public.ia_vencer() = 1, 'vencer';
  assert (select estado from public.ia_llamadas where id = (j->>'llamada_id')::bigint) = 'vencida';
  assert (select gastado from public.ia_ciclos) = g + 0.0014 and (select reservado from public.ia_ciclos) = 0, 'cobra la reserva';
end $$;`],
  ['una llamada del ciclo viejo que falla después del cambio corta el viejo, no el nuevo', `
set role service_role;
do $$ declare j jsonb; viejo bigint; nuevo bigint; begin
  j := ${RES()}; viejo := (j->>'ciclo_id')::bigint;
  update public.ia_ciclos set inicio = inicio - interval '40 days', fin = now() - interval '1 hour' where id = viejo;
  nuevo := (public.ia_ciclo_tomar()).id; assert nuevo <> viejo, 'ciclo nuevo';
  perform public.ia_cortar((select ciclo_id from public.ia_llamadas where id = (j->>'llamada_id')::bigint), 'creditos', now() + interval '30 minutes');
  perform public.ia_cerrar((j->>'llamada_id')::bigint, 'error', 'creditos', 0);
  assert (select estado from public.ia_ciclos where id = viejo) = 'cortado' and (select estado from public.ia_ciclos where id = nuevo) = 'normal', 'corta el viejo';
  assert (select reservado from public.ia_ciclos where id = viejo) = 0, 'libera la reserva del viejo';
end $$;`],
  ['pedidos: la app no carga ai_*; al publicar se anota qué corrigió el administrador', `
set role authenticated; set request.jwt.claim.sub = '${ALUMNO_ID}';
insert into public.product_requests (name, label_path, ai_kcal, ai_at, ai_encontrada) values ('Galletitas', '${ALUMNO_ID}/pedido-tabla-1.jpg', 999, now(), true), ('Yogur', '${ALUMNO_ID}/pedido-tabla-2.jpg', null, null, null);
reset role;
do $$ begin assert (select count(*) from public.product_requests where ai_kcal is not null or ai_at is not null) = 0, 'la app no carga ai_*'; end $$;
update public.product_requests set ai_encontrada = true, ai_kcal = 438, ai_protein = 5.6, ai_carbs = 60, ai_fat = 20, ai_unit = 'g', ai_portion = 50, ai_at = now();
set role authenticated; set request.jwt.claim.sub = '${ADMIN_ID}';
do $$ begin
  assert (select count(*) from public.admin_requests('pendientes') where ai_kcal = 438) = 2, 'admin_requests trae ai_*';
  perform public.admin_request_publish((select id from public.admin_requests('pendientes') where name = 'Galletitas'), null, 'Galletitas', null, 438, 5.6, 61, 20, 'g', 50);
  perform public.admin_request_publish((select id from public.admin_requests('pendientes') where name = 'Yogur'), null, 'Yogur', null, 438.4, 5.65, 60, 20, 'g', 50);
end $$;
reset role;
do $$ begin
  assert (select ai_corregidos from public.product_requests where name = 'Galletitas') = array['carbs'], 'corrigió los carbos';
  assert (select ai_corregido from public.product_requests where name = 'Yogur') = false, 'sin corregir (redondeo)';
end $$;`],
  ['un macro que la IA dejó vacío («no aporta») y se publicó en 0 no cuenta como corrección', `
set role authenticated; set request.jwt.claim.sub = '${ALUMNO_ID}';
insert into public.product_requests (name, label_path) values ('Gaseosa', '${ALUMNO_ID}/pedido-tabla-3.jpg'), ('Agua saborizada', '${ALUMNO_ID}/pedido-tabla-4.jpg');
reset role;
update public.product_requests set ai_encontrada = true, ai_kcal = 42, ai_protein = null, ai_carbs = 10.6, ai_fat = null, ai_unit = 'ml', ai_portion = 200, ai_columna = '100', ai_at = now()
 where name in ('Gaseosa', 'Agua saborizada');
set role authenticated; set request.jwt.claim.sub = '${ADMIN_ID}';
do $$ begin
  assert (select ai_columna from public.admin_requests('pendientes') where name = 'Gaseosa') = '100', 'admin_requests trae ai_columna';
  perform public.admin_request_publish((select id from public.admin_requests('pendientes') where name = 'Gaseosa'), null, 'Gaseosa', null, 42, 0, 10.6, 0, 'ml', 200);
  perform public.admin_request_publish((select id from public.admin_requests('pendientes') where name = 'Agua saborizada'), null, 'Agua saborizada', null, 42, 1.5, 10.6, 0, 'ml', 200);
end $$;
reset role;
do $$ begin
  assert (select ai_corregido from public.product_requests where name = 'Gaseosa') = false, 'vacío y 0: sin corregir ' || (select coalesce(ai_corregidos::text, '') from public.product_requests where name = 'Gaseosa');
  assert (select ai_corregidos from public.product_requests where name = 'Agua saborizada') = array['protein'], 'vacío y 1,5: corrigió la proteína';
end $$;
set role authenticated; set request.jwt.claim.sub = '${ADMIN_ID}';
do $$ declare e jsonb := public.admin_ia_estado(); begin
  assert (e #>> '{tablas,campos,protein}')::int >= 1 and (e #>> '{tablas,campos,carbs}')::int >= 1, 'el panel cuenta las correcciones por campo ' || (e -> 'tablas')::text;
  assert (e #>> '{tablas,con_tabla}')::int >= 4, 'tablas con tabla ' || (e -> 'tablas')::text;
end $$;`],
  ['el panel cuenta las frenadas de la guardia y lo que tarda cada función', `
reset role; update public.ia_ciclos set estado = 'normal', cortado_por = null, vuelve = null, gastado = 10, frenos = '{}';
update public.ia_config set topes = jsonb_set(topes, '{admin,etiqueta}', '0');
set role service_role;
do $$ begin assert (${RES()})->>'codigo' = 'tope_dia'; assert (${RES()})->>'codigo' = 'tope_dia'; end $$;
reset role; update public.ia_config set topes = jsonb_set(topes, '{admin,etiqueta}', '300');
insert into public.ia_llamadas (ciclo_id, user_id, rol, funcion, modelo, estado, max_usd, usd, ms)
  select (select id from public.ia_ciclos where inicio <= now() and fin > now()), '${ADMIN_ID}', 'admin', 'etiqueta', 'modelo-x', 'ok', 0.0014, 0.0004, x from unnest(array[1000, 2000, 3000, 4000]) x;
set role authenticated; set request.jwt.claim.sub = '${ADMIN_ID}';
do $$ declare e jsonb := public.admin_ia_estado(); begin
  assert (e #>> '{ciclo,frenos,tope_dia}')::int = 2, 'frenadas por el tope del día ' || (e #> '{ciclo,frenos}')::text;
  assert (e #>> '{por_funcion,etiqueta,p50}')::numeric between 1000 and 4000 and (e #>> '{por_funcion,etiqueta,p95}')::numeric >= (e #>> '{por_funcion,etiqueta,p50}')::numeric, 'mediana y 95 % ' || (e #> '{por_funcion}')::text;
end $$;`],
['la app: estado, permiso (con la versión del aviso), topes de la persona y avisos', `
reset role;
update public.ia_ciclos set estado = 'normal', cortado_por = null, vuelve = null, gastado = 10, reservado = 0 where inicio <= now() and fin > now();
delete from public.ia_llamadas where user_id in ('${ALUMNO_ID}', '${OTRO_ID}');
update public.ia_config set funciones = funciones || '{"plato": false, "texto": false}', aviso_version = 1;
set role anon;
do $$ begin
  begin perform public.ia_mi_estado(); raise exception 'anon leyó el estado'; exception when insufficient_privilege then null; end;
  begin perform public.ia_permiso('comida', true, 1); raise exception 'anon aceptó'; exception when insufficient_privilege then null; end;
end $$;
set role authenticated; set request.jwt.claim.sub = '${ALUMNO_ID}';
do $$ declare e jsonb := public.ia_mi_estado(); begin
  assert (e ->> 'activa')::boolean = false and (e #>> '{funciones,plato}')::boolean = false, 'apagada para la app ' || e::text;
  assert e ->> 'permiso_comida' is null, 'nunca se le preguntó ' || e::text;
  begin perform public.ia_rol('${ALUMNO_ID}'); raise exception 'la app vio el rol'; exception when insufficient_privilege then null; end;
  begin perform public.ia_permiso_estado('${OTRO_ID}'); raise exception 'la app vio el permiso de otro'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.ia_reportes; raise exception 'leyó ia_reportes'; exception when insufficient_privilege then null; end;
end $$;
reset role; update public.ia_config set funciones = funciones || '{"plato": true, "texto": true}';
set role authenticated; set request.jwt.claim.sub = '${ALUMNO_ID}';
do $$ declare e jsonb; begin
  e := public.ia_mi_estado();
  assert (e ->> 'activa')::boolean and (e #>> '{funciones,plato}')::boolean and (e #>> '{funciones,texto}')::boolean, 'prendida ' || e::text;
  assert e ->> 'estado' = 'normal' and (e #>> '{quedan,plato}')::int = 8 and (e #>> '{quedan,texto}')::int = 15 and (e #>> '{tope,total}')::int = 25, 'topes del alumno ' || e::text;
  begin perform public.ia_permiso('comida', true, 2); raise exception 'aceptó otra versión'; exception when sqlstate '22023' then null; end;
  begin perform public.ia_permiso('coach', true, 1); raise exception 'tipo inventado'; exception when sqlstate '22023' then null; end;
  e := public.ia_permiso('comida', true, 1); assert e ->> 'permiso_comida' = 'ok', 'aceptó ' || e::text;
  assert (select count(*) from public.ia_permisos where user_id = '${ALUMNO_ID}' and comida_ok_at is not null and version = 1) = 1, 'guardó cuándo y qué versión';
  e := public.ia_permiso('comida', false); assert e ->> 'permiso_comida' = 'no', 'apagó en Ajustes ' || e::text;
  e := public.ia_permiso('comida', true, 1); assert e ->> 'permiso_comida' = 'ok', 'volvió a aceptar ' || e::text;
end $$;
reset role; update public.ia_config set aviso_version = 2;
set role authenticated; set request.jwt.claim.sub = '${ALUMNO_ID}';
do $$ begin assert public.ia_mi_estado() ->> 'permiso_comida' = 'viejo', 'aviso nuevo: hay que volver a preguntar'; end $$;
reset role; update public.ia_config set aviso_version = 1;
set role service_role;
do $$ declare j jsonb; begin
  assert public.ia_permiso_estado('${ALUMNO_ID}') = 'ok' and public.ia_permiso_estado('${OTRO_ID}') is null, 'el permiso, para la función';
  assert public.ia_rol('${ALUMNO_ID}') = 'alumno' and public.ia_rol('${COACH_ID}') = 'coach' and public.ia_rol('${OTRO_ID}') = 'alumno', 'los roles (coach con plan)';
  j := ${RES(ALUMNO_ID, 'alumno', 'plato', '0.006')}; assert (j->>'ok')::boolean, 'plato ' || j::text;
  perform public.ia_cerrar((j->>'llamada_id')::bigint, 'ok', null, 0.0008);
end $$;
set role authenticated; set request.jwt.claim.sub = '${ALUMNO_ID}';
do $$ declare e jsonb := public.ia_mi_estado(); begin
  assert (e #>> '{quedan,plato}')::int = 7 and (e #>> '{quedan,texto}')::int = 15, 'le quedan 7 fotos y 15 textos ' || e::text;
end $$;
reset role; update public.ia_config set topes = jsonb_set(topes, '{alumno,plato}', '1');
set role service_role;
do $$ declare j jsonb; begin j := ${RES(ALUMNO_ID, 'alumno', 'plato', '0.006')}; assert j->>'codigo' = 'tope_dia' and (j->>'tope')::int = 1, 'tope del día del alumno ' || j::text; end $$;
set role authenticated; set request.jwt.claim.sub = '${ALUMNO_ID}';
do $$ begin assert (public.ia_mi_estado() #>> '{quedan,plato}')::int = 0, 'no le quedan fotos'; end $$;
reset role; update public.ia_config set topes = jsonb_set(jsonb_set(topes, '{alumno,plato}', '8'), '{alumno,usd_ciclo}', '0.0008');
set role authenticated; set request.jwt.claim.sub = '${ALUMNO_ID}';
do $$ begin assert public.ia_mi_estado() ->> 'estado' = 'tope_persona', 'llegó a su tope del ciclo'; end $$;
reset role; update public.ia_config set topes = jsonb_set(topes, '{alumno,usd_ciclo}', '0.5');
update public.ia_ciclos set gastado = 151 where inicio <= now() and fin > now();
set role authenticated; set request.jwt.claim.sub = '${OTRO_ID}';
do $$ begin assert public.ia_mi_estado() ->> 'estado' = 'ahorro', 'ahorro: sin coach con plan'; end $$;
set request.jwt.claim.sub = '${ALUMNO_ID}';
do $$ begin assert public.ia_mi_estado() ->> 'estado' = 'normal', 'ahorro: el alumno de un coach con plan sigue'; end $$;
reset role; update public.ia_ciclos set estado = 'cortado', cortado_por = 'tope', vuelve = fin where inicio <= now() and fin > now();
set role authenticated; set request.jwt.claim.sub = '${ALUMNO_ID}';
do $$ declare e jsonb := public.ia_mi_estado(); begin assert e ->> 'estado' = 'tope_mes' and e ->> 'vuelve' is not null, 'tope del mes ' || e::text; end $$;
reset role; update public.ia_ciclos set estado = 'cortado', cortado_por = 'creditos', vuelve = now() + interval '20 minutes' where inicio <= now() and fin > now();
set role authenticated; set request.jwt.claim.sub = '${ALUMNO_ID}';
do $$ begin assert public.ia_mi_estado() ->> 'estado' = 'pausada', 'sin créditos: pausada'; end $$;
reset role; update public.ia_ciclos set estado = 'normal', cortado_por = null, vuelve = null, gastado = 10 where inicio <= now() and fin > now();
set role authenticated; set request.jwt.claim.sub = '${ALUMNO_ID}';
do $$ begin
  perform public.ia_reportar('plato', '{"items": [{"nombre": "Milanesa", "gramos": 150}]}', '  la milanesa era de pollo  ');
  begin perform public.ia_reportar('plato', '{}', repeat('x', 301)); raise exception 'comentario largo'; exception when sqlstate '22023' then null; end;
  begin perform public.ia_reportar('rutina', '{}'); raise exception 'función inventada'; exception when sqlstate '22023' then null; end;
  begin perform public.ia_reportar('plato', '[1]'); raise exception 'respuesta que no es un objeto'; exception when sqlstate '22023' then null; end;
  for i in 1..19 loop perform public.ia_reportar('texto', '{}'); end loop;
  begin perform public.ia_reportar('texto', '{}'); raise exception 'pasó los 20 por día'; exception when sqlstate '54000' then null; end;
  insert into public.food_entries (id, client_id, name, fuente) values ('e1', '${ALUMNO_ID}', 'Milanesa', 'ia'), ('e2', '${ALUMNO_ID}', 'Arroz', 'ia-editado');
  begin insert into public.food_entries (id, client_id, name, fuente) values ('e3', '${ALUMNO_ID}', 'X', 'magia'); raise exception 'fuente inventada'; exception when check_violation then null; end;
end $$;
reset role;
do $$ begin
  assert (select comentario from public.ia_reportes where funcion = 'plato') = 'la milanesa era de pollo', 'guarda el comentario recortado';
  update public.ia_reportes set creada = now() - interval '181 days' where funcion = 'plato';
  perform public.ia_limpiar();
  assert (select count(*) from public.ia_reportes where funcion = 'plato') = 0 and (select count(*) from public.ia_reportes) = 19, 'a los 180 días se borra (quedan los otros)';
end $$;`],
['el admin: lo que lee en el panel no le gasta los usos de la app (ni su US$ 0,50)', `
reset role;
update public.ia_ciclos set estado = 'normal', cortado_por = null, vuelve = null, gastado = 10, reservado = 0 where inicio <= now() and fin > now();
delete from public.ia_llamadas where user_id = '${ADMIN_ID}';
update public.ia_config set funciones = funciones || '{"plato": true, "texto": true}';
set role service_role;
do $$ declare j jsonb; begin
  for i in 1..25 loop
    j := ${RES()}; assert (j->>'ok')::boolean, 'lectura ' || i || ' ' || j::text;
    perform public.ia_cerrar((j->>'llamada_id')::bigint, 'ok', null, 0.03);
  end loop;
  assert public.ia_rol('${ADMIN_ID}') = 'alumno', 'en la app, el admin usa los topes de alumno';
  j := ${RES(ADMIN_ID, 'alumno', 'plato', '0.006')}; assert (j->>'ok')::boolean, 'después de 25 lecturas (US$ 0,75) puede sacar la foto del plato ' || j::text;
end $$;
set role authenticated; set request.jwt.claim.sub = '${ADMIN_ID}';
do $$ declare e jsonb := public.ia_mi_estado(); begin
  assert e ->> 'estado' = 'normal', 'no llegó a su tope del ciclo ' || e::text;
  assert (e #>> '{quedan,plato}')::int = 7 and (e #>> '{quedan,texto}')::int = 15, 'le quedan 7 fotos y 15 textos ' || e::text;
  assert (e #>> '{usados,plato}')::int = 1 and (e #>> '{usados,texto}')::int = 0 and (e #>> '{usados,total}')::int = 1, 'usados: solo lo de la app ' || e::text;
end $$;`],
];
