// supabase/codigo-fundador.sql (códigos de fundador de los coaches).
// 1) Leído: encabezado, tablas con RLS sin políticas ni permisos (nadie las lee directo), quién
//    puede llamar cada función y que no lleve datos de nadie ni ningún código escrito.
// 2) De verdad, con Postgres (si la máquina tiene uno; si no, se saltea): con lo mínimo de Supabase
//    simulado, corre el archivo dos veces y prueba el cupo (también dos coaches a la vez por el
//    último lugar), el tope de intentos, que el descuento queda para siempre y el panel.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fn = (sql, name) => {
  const i = sql.indexOf('create or replace function public.' + name + '(');
  if (i < 0) return '';
  const a = sql.indexOf('$$', i), b = sql.indexOf('$$', a + 2);
  return sql.slice(i, b + 2);
};

export default async ({ t }) => {
  const file = path.join(ROOT, 'supabase/codigo-fundador.sql');
  t.ok(fs.existsSync(file), 'existe supabase/codigo-fundador.sql');
  if (!fs.existsSync(file)) return;
  const sql = fs.readFileSync(file, 'utf8');
  const code = sql.replace(/--[^\n]*/g, '');

  // ---------- 1) Leído ----------
  t.has(sql, 'Correr con el workflow "Supabase" → tarea sql → supabase/codigo-fundador.sql', 'encabezado: cómo correrlo');
  t.has(sql, 'Se puede correr varias veces', 'encabezado: se puede correr varias veces');
  t.ok(/después de\s+(--\s+)?supabase\/admin\.sql y supabase\/suscripciones\.sql/.test(sql), 'encabezado: de qué depende');
  for (const tb of ['codigos_fundador', 'codigos_fundador_usos', 'codigos_fundador_intentos']){
    t.ok(code.includes('create table if not exists public.' + tb + ' ('), tb + ': se crea si no está');
    t.ok(code.includes('alter table public.' + tb + ' enable row level security;'), tb + ': RLS prendido');
    t.ok(code.includes('revoke all on public.' + tb + ' from anon, authenticated;'), tb + ': sin permisos para anon ni authenticated');
  }
  t.ok(!/create policy/i.test(code), 'sin políticas: nadie lee las tablas directo');
  t.ok(!/grant [^;]*on (table )?public\.codigos_/i.test(code), 'ningún grant sobre las tablas');
  t.ok(!/drop table/i.test(code), 'no borra tablas (se puede volver a correr sin perder los códigos)');
  const adds = [...code.matchAll(/add constraint (\w+)/g)].map(x => x[1]);
  t.ok(adds.length >= 4 && adds.every(c => code.includes('drop constraint if exists ' + c)), 'cada check se borra antes de crearlo: ' + adds.join(', '));
  for (const name of ['codigo_fundador_ver', 'codigo_fundador_mio', 'codigo_fundador_usar', 'admin_codigos_fundador', 'admin_codigo_fundador_guardar'])
    t.ok(/security definer set search_path = public/.test(fn(code, name)), name + ': security definer con search_path fijo');
  for (const sig of ['codigo_fundador_ver(text)', 'codigo_fundador_mio()', 'admin_codigos_fundador()', 'admin_codigo_fundador_guardar(text, int, int, boolean)']){
    t.ok(code.includes('revoke all on function public.' + sig + ' from public, anon;'), sig + ': nada para public ni anon');
    t.ok(code.includes('grant execute on function public.' + sig + ' to authenticated;'), sig + ': con sesión');
  }
  t.ok(code.includes('revoke all on function public.codigo_fundador_usar(uuid, text) from public, anon, authenticated;') &&
    code.includes('grant execute on function public.codigo_fundador_usar(uuid, text) to service_role;'), 'codigo_fundador_usar: solo la service role (la función suscripcion)');
  for (const name of ['admin_codigos_fundador', 'admin_codigo_fundador_guardar'])
    t.ok(/\$\$\s*(declare[\s\S]*?)?begin\s+perform public\.admin_assert\(\);/.test(fn(code, name)), name + ': lo primero es admin_assert');
  t.ok(/for update;/.test(fn(code, 'codigo_fundador_usar')), 'usar: bloquea la fila del código (sin carreras por el último lugar)');
  t.ok(/perform public\.admin_log\('codigo_fundador'/.test(fn(code, 'admin_codigo_fundador_guardar')), 'guardar queda en el registro de acciones');
  t.ok(!/insert into public\.codigos_fundador \(codigo[^;]*values \('/i.test(code), 'ningún código escrito en el archivo (el repositorio es público)');
  t.ok(!/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/.test(sql), 'sin mails');
  t.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(sql), 'sin ids de cuentas');

  // ---------- 2) De verdad, con Postgres ----------
  await conPostgres(t, sql);
};

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

const ADMIN = '22222222-2222-2222-2222-222222222222', ALUMNO = '11111111-1111-1111-1111-111111111111';
const C1 = '33333333-3333-3333-3333-333333333331', C2 = '33333333-3333-3333-3333-333333333332', C3 = '33333333-3333-3333-3333-333333333333', C4 = '33333333-3333-3333-3333-333333333334';

const STUBS = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema public, auth to anon, authenticated, service_role;
create table public.profiles (id uuid primary key references auth.users(id) on delete cascade, full_name text, coach_id uuid, role text default 'client');
create table public.app_admins (user_id uuid primary key);
create function public.is_app_admin() returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from public.app_admins where user_id = auth.uid()) $$;
create function public.admin_assert() returns void language plpgsql stable security definer set search_path = public as $$
begin if not public.is_app_admin() then raise exception 'Solo administradores.' using errcode = '42501'; end if; end $$;
create table public.admin_audit (id bigserial, admin_id uuid, action text, target text, detail jsonb, created_at timestamptz default now());
create function public.admin_log(p_action text, p_target text, p_detail jsonb default null) returns void language plpgsql security definer set search_path = public as $$
begin perform public.admin_assert(); insert into public.admin_audit(admin_id, action, target, detail) values (auth.uid(), p_action, p_target, p_detail); end $$;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
insert into auth.users values ('${ADMIN}', 'a@x'), ('${ALUMNO}', 'b@x'), ('${C1}', 'c1@x'), ('${C2}', 'c2@x'), ('${C3}', 'c3@x'), ('${C4}', 'c4@x');
insert into public.profiles values ('${ADMIN}', 'Admin', null, 'client'), ('${ALUMNO}', 'Alumno', null, 'client'),
  ('${C1}', 'Coach 1', null, 'coach'), ('${C2}', 'Coach 2', null, 'coach'), ('${C3}', 'Coach 3', null, 'coach'), ('${C4}', 'Coach 4', null, 'coach');
insert into public.app_admins values ('${ADMIN}');
`;

// Como un usuario con sesión, o como la service role (la función suscripcion).
const como = uid => `set role authenticated; set request.jwt.claim.sub = '${uid}';`;
const SRV = `set role service_role; set request.jwt.claim.sub = '';`;

async function conPostgres(t, sql){
  const pg = postgres();
  if (!pg){ console.log('    (codigo-fundador-sql: no hay Postgres en esta máquina: se saltea la parte que corre el SQL)'); return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gize-fundador-pg-'));
  if (pg.root) { fs.chmodSync(dir, 0o777); spawnSync('chown', ['postgres', dir]); }
  const datos = path.join(dir, 'datos');
  const correr = (p, args) => { const [c, a] = pg.como(p, args); return spawnSync(c, a, { encoding: 'utf8', timeout: 60000 }); };
  let ini = correr('initdb', ['-D', datos, '-A', 'trust', '-U', 'postgres', '--no-sync']);
  if (ini.status !== 0){ t.ok(false, 'initdb: ' + (ini.stderr || '').slice(0, 300)); return; }
  const puerto = String(20000 + Math.floor(Math.random() * 20000));
  ini = correr('pg_ctl', ['-D', datos, '-w', '-o', `-p ${puerto} -k ${dir} -c listen_addresses='' -c fsync=off -c timezone=UTC`, '-l', path.join(dir, 'log.txt'), 'start']);
  if (ini.status !== 0){ t.ok(false, 'no arrancó Postgres: ' + (ini.stderr || ini.stdout || '').slice(0, 300)); return; }
  const args = db => ['-h', dir, '-p', puerto, '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-q', '-At', '-f', '-'];
  const psql = (texto, db = 'gize') => spawnSync(pg.psql, args(db), { input: texto, encoding: 'utf8', timeout: 60000 });
  const psqlAsync = texto => new Promise(ok => {
    const c = spawn(pg.psql, args('gize'));
    let out = ''; c.stdout.on('data', d => out += d); c.stderr.on('data', d => out += d); c.on('close', code => ok({ code, out })); c.stdin.end(texto);
  });
  // Una consulta, con lo que devuelve (o el error).
  const q = (texto) => { const r = psql(texto); return r.status === 0 ? r.stdout.trim() : 'ERROR ' + (r.stderr || '').trim(); };
  const ver = (uid, c) => q(como(uid) + ` select x->>'ok' || '|' || coalesce(x->>'porcentaje', x->>'error') from public.codigo_fundador_ver(${c === null ? 'null' : `'${c}'`}) x;`);
  const usar = (uid, c) => q(SRV + ` select x->>'ok' || '|' || coalesce(x->>'porcentaje', x->>'error') from public.codigo_fundador_usar('${uid}', ${c === null ? 'null' : `'${c}'`}) x;`);
  const mio = uid => q(como(uid) + ' select public.codigo_fundador_mio();');
  const guardar = (uid, c, pct, cupo, activo = true) => q(como(uid) + ` select public.admin_codigo_fundador_guardar('${c}', ${pct}, ${cupo}, ${activo});`);
  try {
    let r = psql('create database gize;', 'postgres');
    t.ok(r.status === 0, 'crea la base de prueba: ' + r.stderr);
    r = psql(STUBS);
    t.ok(r.status === 0, 'lo mínimo de Supabase: ' + r.stderr);
    for (const vez of [1, 2]){
      r = psql(sql); t.ok(r.status === 0, 'codigo-fundador.sql corre (vez ' + vez + '): ' + (r.stderr || '').split('\n').filter(l => /ERROR/.test(l)).join(' '));
    }

    // Nadie lee ni escribe las tablas directo.
    for (const tb of ['codigos_fundador', 'codigos_fundador_usos', 'codigos_fundador_intentos']){
      t.has(q(como(C1) + ` select count(*) from public.${tb};`), 'permission denied', tb + ': un coach no la lee directo');
      t.has(q('set role anon; select count(*) from public.' + tb + ';'), 'permission denied', tb + ': sin sesión, tampoco');
    }
    t.has(q(como(C1) + ` insert into public.codigos_fundador values ('MIO-GRATIS', 90, 1000);`), 'permission denied', 'un coach no se crea un código');
    t.has(q(como(C1) + ` select public.codigo_fundador_usar('${C1}', 'X');`), 'permission denied', 'un coach no puede ocupar un lugar directo (solo la función suscripcion)');

    // Solo un administrador crea códigos.
    t.has(guardar(C1, 'FUNDADOR-TEST', 30, 3), 'Solo administradores', 'un coach no puede crear códigos');
    t.has(guardar(ADMIN, 'con espacio', 30, 3), 'El código va de 4 a 32', 'código con espacios: no');
    t.has(guardar(ADMIN, 'FUNDA', 95, 3), 'El descuento va de 1 a 90', 'descuento de más del 90%: no');
    t.has(guardar(ADMIN, 'FUNDA', 30, 0), 'El cupo va de 1 a 10000', 'cupo 0: no');
    t.ok(!/ERROR/.test(guardar(ADMIN, 'fundador-test', 30, 3)), 'el administrador crea el código (en minúsculas se guarda en mayúsculas)');
    t.eq(q("select codigo || '|' || porcentaje || '|' || cupo || '|' || activo from public.codigos_fundador;"), 'FUNDADOR-TEST|30|3|true', 'el código guardado');
    t.eq(q("select action || '|' || target from public.admin_audit;"), 'codigo_fundador|FUNDADOR-TEST', 'queda en el registro de acciones');

    // Probar el código (no ocupa lugar).
    t.eq(ver(C1, ' fundador-test '), 'true|30', 'el coach prueba el código: 30%');
    t.eq(ver(C1, 'OTRO-CODIGO'), 'false|Ese código no existe o ya no está vigente.', 'un código que no existe');
    t.eq(ver(ALUMNO, 'FUNDADOR-TEST'), 'false|Los códigos son para las cuentas de coach.', 'una cuenta que no es de coach');
    t.eq(q('select count(*) from public.codigos_fundador_usos;'), '0', 'probar no ocupa lugar');
    t.has(q(`set role anon; select public.codigo_fundador_ver('FUNDADOR-TEST');`), 'permission denied', 'sin sesión no se prueba');

    // Ocupar lugares (la función suscripcion al crear la suscripción).
    t.eq(usar(C1, null), 'true|0', 'sin código ni descuento: 0');
    t.eq(usar(C1, 'NO-EXISTE'), 'false|Ese código no existe o ya no está vigente.', 'usar un código que no existe');
    t.eq(usar(ALUMNO, 'FUNDADOR-TEST'), 'false|Los códigos son para las cuentas de coach.', 'una cuenta que no es de coach no ocupa lugar');
    t.eq(usar(C1, 'fundador-test'), 'true|30', 'coach 1 ocupa un lugar');
    t.eq(usar(C1, 'FUNDADOR-TEST'), 'true|30', 'coach 1 otra vez: no ocupa otro');
    t.eq(usar(C1, null), 'true|30', 'coach 1 sin mandar el código: sigue con su 30% (para siempre)');
    t.eq(mio(C1), '30', 'mio: coach 1 tiene 30%');
    t.eq(mio(C2), '0', 'mio: coach 2 todavía no');
    t.eq(ver(C1, 'CUALQUIERA'), 'true|30', 'ver: el que ya tiene, sigue con el suyo');
    t.eq(usar(C2, 'FUNDADOR-TEST'), 'true|30', 'coach 2 ocupa un lugar (quedan 1)');

    // El último lugar, dos coaches a la vez: el primero se queda adentro de su transacción un
    // segundo; el otro espera y después ve el lugar ocupado.
    const [a, b] = await Promise.all([
      psqlAsync('begin; ' + SRV + ` select x->>'ok' from public.codigo_fundador_usar('${C3}', 'FUNDADOR-TEST') x; select pg_sleep(1); commit;`),
      new Promise(ok => setTimeout(() => psqlAsync(SRV + ` select x->>'ok' from public.codigo_fundador_usar('${C4}', 'FUNDADOR-TEST') x;`).then(ok), 300)),
    ]);
    t.ok(a.code === 0 && b.code === 0 && /^true$/m.test(a.out) && /^false$/m.test(b.out), 'dos coaches por el último lugar: solo uno lo ocupa: ' + JSON.stringify([a.out, b.out]));
    t.eq(q("select count(*) from public.codigos_fundador_usos where codigo = 'FUNDADOR-TEST';"), '3', 'quedan exactamente 3 usos (el cupo)');
    t.eq(ver(C4, 'FUNDADOR-TEST'), 'false|Ya se ocuparon todos los lugares de ese código.', 'ver: sin lugares');
    t.eq(usar(C4, 'FUNDADOR-TEST'), 'false|Ya se ocuparon todos los lugares de ese código.', 'usar: sin lugares');

    // El administrador cambia el código: los que lo usaron conservan su porcentaje.
    guardar(ADMIN, 'FUNDADOR-TEST', 20, 3, false);
    t.eq(ver(C4, 'FUNDADOR-TEST'), 'false|Ese código no existe o ya no está vigente.', 'apagado: ya no se puede usar');
    t.eq(usar(C1, null), 'true|30', 'apagado: el que lo usó sigue con su 30%');

    // Panel: cuántos lo usaron y quiénes.
    const lista = JSON.parse(q(como(ADMIN) + ' select public.admin_codigos_fundador();') || '[]');
    t.eq(lista.map(k => [k.codigo, k.porcentaje, k.cupo, k.activo, k.usados]), [['FUNDADOR-TEST', 20, 3, false, 3]], 'panel: el código con cuántos lo usaron');
    t.eq((lista[0] && lista[0].coaches || []).map(c => c.nombre + ' ' + c.email), ['Coach 1 c1@x', 'Coach 2 c2@x', 'Coach 3 c3@x'], 'panel: quiénes, en orden');
    t.has(q(como(C1) + ' select public.admin_codigos_fundador();'), 'Solo administradores', 'panel: un coach no lo ve');

    // Tope de intentos: 10 por hora.
    q("delete from public.codigos_fundador_intentos;");
    const intentos = [];
    for (let i = 0; i < 11; i++) intentos.push(ver(C4, 'ADIVINO-' + i));
    t.ok(intentos.slice(0, 10).every(x => x === 'false|Ese código no existe o ya no está vigente.'), 'los primeros 10 intentos se revisan');
    t.eq(intentos[10], 'false|Probaste muchos códigos seguidos. Esperá un rato y volvé a intentar.', 'el 11 en una hora: frenado');
    q("update public.codigos_fundador_intentos set created_at = now() - interval '2 hours';");
    t.eq(ver(C4, 'ADIVINO-X'), 'false|Ese código no existe o ya no está vigente.', 'pasada la hora, se puede probar de nuevo');

    // Al borrar la cuenta de un coach se va su uso (y ese lugar queda libre).
    q(`delete from auth.users where id = '${C3}';`);
    t.eq(q("select count(*) from public.codigos_fundador_usos;"), '2', 'cuenta borrada: se va su uso');
  } finally {
    correr('pg_ctl', ['-D', datos, '-m', 'immediate', 'stop']);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
