// supabase/cuentas-prueba.sql (marcar cuentas de prueba en el panel) y la marca automática de las
// cuentas demo en supabase/cuentas-demo.sql.
// 1) Leído: la tabla con RLS y sin permisos para la app; marcar solo para administradores (con
//    admin_assert y en el registro); cada función del panel que cambia lo que devuelve se borra
//    antes; cuentas-demo.sql marca las tres cuentas sin escribir mails.
// 2) De verdad, si en la máquina hay un Postgres (si no, se saltea): con lo mínimo de Supabase
//    simulado, corre cuentas-demo.sql antes de que exista la tabla (no falla), cuentas-prueba.sql
//    dos veces y cuentas-demo.sql otra vez (marca las tres demo), y revisa que el Resumen, Finanzas,
//    Usuarios y Coaches y pagos dejen afuera o marquen las cuentas de prueba, y que alguien que no
//    es administrador no pueda marcar ni leer nada.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
  const sql = read('supabase/cuentas-prueba.sql'), demo = read('supabase/cuentas-demo.sql');
  t.ok(sql.length > 0, 'existe supabase/cuentas-prueba.sql');
  if (!sql) return;
  const code = sinComentarios(sql);

  // ---------- 1) Leído ----------
  t.has(sql, 'Correr con el workflow "Supabase" → tarea sql → supabase/cuentas-prueba.sql', 'encabezado: cómo correrlo');
  t.has(sql, 'Se puede correr varias veces', 'encabezado: se puede correr varias veces');
  t.ok(/create table if not exists public\.test_accounts \(/.test(code), 'la tabla test_accounts');
  t.ok(/user_id\s+uuid primary key references auth\.users\(id\) on delete cascade/.test(code), 'al borrar la cuenta se va su marca');
  t.ok(/alter table public\.test_accounts enable row level security;/.test(code), 'RLS prendido');
  t.ok(/revoke all on public\.test_accounts from anon, authenticated;/.test(code), 'sin permisos de tabla para la app');
  t.ok(!/create policy/i.test(code) && !/grant [^;]*on (table )?public\.test_accounts/i.test(code), 'sin políticas ni grants: nadie la lee directo');
  for (const name of ['admin_set_test', 'admin_overview', 'admin_fin', 'admin_users', 'admin_user_detail', 'admin_coaches']){
    const f = fn(code, name);
    t.ok(/\$\$\s*(declare[\s\S]*?)?begin\s+perform public\.admin_assert\(\);/.test(f), name + ': lo primero es admin_assert');
    t.ok(/security definer set search_path = public/.test(f), name + ': security definer con search_path fijo');
    t.ok(/revoke execute on function public\.[a-z_]+\([^)]*\) from public, anon;/.test(code.slice(code.indexOf(f) + f.length).split('create or replace')[0]), name + ': nada para public ni anon');
  }
  t.ok(/perform public\.admin_log\(case when on_off then 'prueba_si' else 'prueba_no' end, uid::text, null\);/.test(fn(code, 'admin_set_test')), 'marcar queda en el registro');
  t.ok(code.indexOf('drop function if exists public.admin_users(text);') >= 0 && code.indexOf('drop function if exists public.admin_users(text);') < code.indexOf('function public.admin_users('), 'admin_users se borra antes (cambia lo que devuelve)');
  t.ok(code.indexOf('drop function if exists public.admin_coaches();') >= 0 && code.indexOf('drop function if exists public.admin_coaches();') < code.indexOf('function public.admin_coaches('), 'admin_coaches se borra antes (cambia lo que devuelve)');
  const demoCode = sinComentarios(demo);
  t.ok(/insert into public\.test_accounts \(user_id\) values \(coach\), \(client\), \(coachios\) on conflict \(user_id\) do nothing;/.test(demoCode), 'cuentas-demo.sql marca las tres cuentas demo');
  t.ok(/if to_regclass\('public\.test_accounts'\) is not null then/.test(demoCode), 'solo si ya existe la tabla');
  t.ok(!/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/.test(sql + demo), 'sin mails escritos');
  for (const f of ['supabase/admin.sql', 'supabase/finanzas.sql', 'supabase/precios-2026-10.sql'])
    t.has(read(f), 'Si ya corriste supabase/cuentas-prueba.sql, después de este corré ese otra vez', f + ': avisa que después hay que volver a correr cuentas-prueba.sql');

  // ---------- 2) De verdad, con Postgres ----------
  await conPostgres(t, sql, demo);
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

async function conPostgres(t, sql, demo){
  const pg = postgres();
  if (!pg){ console.log('    (cuentas-prueba-sql: no hay Postgres en esta máquina: se saltea la parte que corre el SQL)'); return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gize-prueba-pg-'));
  if (pg.root) { fs.chmodSync(dir, 0o777); spawnSync('chown', ['postgres', dir]); }
  const datos = path.join(dir, 'datos');
  const correr = (p, args) => { const [c, a] = pg.como(p, args); return spawnSync(c, a, { encoding: 'utf8', timeout: 60000 }); };
  let ini = correr('initdb', ['-D', datos, '-A', 'trust', '-U', 'postgres', '--no-sync']);
  if (ini.status !== 0){ t.ok(false, 'initdb: ' + (ini.stderr || '').slice(0, 300)); return; }
  const puerto = String(20000 + Math.floor(Math.random() * 20000));
  ini = correr('pg_ctl', ['-D', datos, '-w', '-o', `-p ${puerto} -k ${dir} -c listen_addresses='' -c fsync=off -c timezone=UTC`, '-l', path.join(dir, 'log.txt'), 'start']);
  if (ini.status !== 0){ t.ok(false, 'no arrancó Postgres: ' + (ini.stderr || ini.stdout || '').slice(0, 300)); return; }
  const psql = (texto, db = 'gize') => spawnSync(pg.psql, ['-h', dir, '-p', puerto, '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-q', '-At', '-f', '-'], { input: texto, encoding: 'utf8', timeout: 60000 });
  const err = r => (r.stderr || '').split('\n').filter(l => /ERROR|CONTEXT/.test(l)).join(' ').slice(0, 400);
  // Como administrador (o como otra persona) con sesión, igual que llama el panel.
  const como = (uid, q) => psql(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false); ${q}`);
  const val = (uid, q) => { const r = como(uid, q); return r.status === 0 ? r.stdout.trim().split('\n').slice(1).join('\n') : 'ERROR ' + err(r); };
  // Las marcas del workflow, con mails inventados de un dominio de prueba.
  const demoSql = demo.replace(/__DEMO_COACH__/g, 'coach@demo.test').replace(/__DEMO_CLIENTE__/g, 'cliente@demo.test')
    .replace(/__DEMO_COACHIOS__/g, 'coachios@demo.test').replace(/__DEMO_PASSWORD__/g, 'una-clave-de-prueba');
  try {
    let r = psql('create database gize;', 'postgres');
    t.ok(r.status === 0, 'crea la base de prueba: ' + r.stderr);
    r = psql(STUBS);
    t.ok(r.status === 0, 'lo mínimo de Supabase: ' + err(r));
    r = psql(demoSql);
    t.ok(r.status === 0, 'cuentas-demo.sql corre antes de que exista la tabla: ' + err(r));
    for (const vez of [1, 2]){ r = psql(sql); t.ok(r.status === 0, 'cuentas-prueba.sql corre (vez ' + vez + '): ' + err(r)); }
    t.eq(psql('select count(*) from public.test_accounts;').stdout.trim(), '0', 'arranca sin cuentas marcadas');
    const ov = () => JSON.parse(val(ADMIN_ID, 'select public.admin_overview();') || '{}');
    let o = ov();
    t.eq([o.users, o.coaches, o.paid, o.trial, o.courtesy, o.overdue], [8, 4, 1, 1, 1, 1], 'sin marcas cuenta todo (usuarios, coaches, pagando, en prueba, cortesía, sin pagar)');

    // Marcar una cuenta propia (coach en prueba).
    t.eq(val(OTRO_ID, `select public.admin_set_test('${PROPIO_ID}', true);`).slice(0, 5), 'ERROR', 'alguien que no es administrador no puede marcar');
    t.eq(val(OTRO_ID, 'select count(*) from public.test_accounts;').slice(0, 5), 'ERROR', 'ni leer la tabla');
    t.eq(val(ADMIN_ID, 'select count(*) from public.test_accounts;').slice(0, 5), 'ERROR', 'ni el administrador la lee directo (solo por las funciones)');
    r = como(ADMIN_ID, `select public.admin_set_test('${PROPIO_ID}', true); select public.admin_set_test('${PROPIO_ID}', true);`);
    t.ok(r.status === 0, 'el administrador marca (dos veces no falla): ' + err(r));
    o = ov();
    t.eq([o.users, o.coaches, o.trial], [7, 3, 0], 'la cuenta marcada no cuenta como usuario, coach ni en prueba');

    // cuentas-demo.sql marca las tres demo.
    r = psql(demoSql);
    t.ok(r.status === 0, 'cuentas-demo.sql corre con la tabla: ' + err(r));
    t.eq(psql("select count(*) from public.test_accounts t join auth.users u on u.id = t.user_id where u.email like '%@demo.test';").stdout.trim(), '3', 'las tres cuentas demo quedan marcadas');
    r = psql(demoSql);
    t.ok(r.status === 0, 'y se puede volver a correr: ' + err(r));
    o = ov();
    t.eq([o.users, o.coaches, o.clients, o.linked, o.paid, o.mrr, o.trial, o.courtesy, o.overdue], [4, 1, 3, 1, 1, 24900, 0, 0, 0],
      'el Resumen cuenta solo las reales (la demo con cortesía y la de Apple vencida no suman)');
    t.eq([o.new7, o.new30, o.active7, o.sessions7], [3, 3, 1, 1], 'nuevos, activos y entrenos de la semana, sin las de prueba');
    t.eq((o.signups || []).reduce((s, x) => s + x.n, 0), 3, 'el gráfico de usuarios nuevos no cuenta las de prueba');
    t.eq((o.training || []).reduce((s, x) => s + x.n, 0), 1, 'el de entrenos tampoco');
    t.eq((o.versions || []).reduce((s, x) => s + x.n, 0), 1, 'ni las versiones en uso');
    const fin = JSON.parse(val(ADMIN_ID, 'select public.admin_fin();') || '{}');
    t.eq([fin.trial, fin.courtesy, (fin.plans || []).reduce((s, x) => s + x.paid, 0)], [0, 0, 1], 'Finanzas tampoco las cuenta');

    // Listas: todas, con la marca.
    const cs = val(ADMIN_ID, "select string_agg(full_name || ':' || is_test, ',') from public.admin_coaches();");
    t.eq(cs, 'Coach Real:false,Coach Demo:true,Propio:true,Coach Revisión:true', 'Coaches y pagos: todas, con las de prueba al final');
    t.eq(val(ADMIN_ID, "select count(*) filter (where is_test) || '/' || count(*) from public.admin_users('');"), '4/8', 'Usuarios: todas, con la marca');
    t.eq(val(ADMIN_ID, `select public.admin_user_detail('${PROPIO_ID}')->>'is_test';`), 'true', 'la ficha dice si es de prueba');
    t.eq(val(ADMIN_ID, `select public.admin_user_detail('${COACH_ID}')->>'is_test';`), 'false', 'y si no');

    // Desmarcar.
    r = como(ADMIN_ID, `select public.admin_set_test('${PROPIO_ID}', false);`);
    t.ok(r.status === 0, 'el administrador desmarca: ' + err(r));
    t.eq(ov().coaches, 2, 'vuelve a contarse');
    t.eq(psql("select string_agg(action, ',' order by id) from public.admin_audit;").stdout.trim(), 'prueba_si,prueba_si,prueba_no', 'cada cambio queda en el registro');
    como(ADMIN_ID, `select public.admin_set_test('${PROPIO_ID}', true);`);
    t.eq(psql(`delete from auth.users where id = '${PROPIO_ID}'; select count(*) from public.test_accounts;`).stdout.trim(), '3', 'al borrar una cuenta marcada se va su marca');

    // Con supabase/compras-google.sql (lo mínimo: las columnas google_* y google_subs): el coach de la
    // revisión también queda sin lo comprado con Google Play (google_renueva no acepta null).
    r = psql(`alter table public.coach_billing add column google_token text, add column google_vence timestamptz, add column google_renueva boolean not null default false;
      create table public.google_subs (purchase_token text primary key, user_id uuid not null references auth.users(id) on delete cascade);
      insert into public.google_subs select 'compra-de-prueba', id from auth.users where email = 'coachios@demo.test';
      update public.coach_billing b set plan = 'p25', paid_until = now() + interval '20 days', google_token = 'compra-de-prueba', google_vence = now() + interval '20 days', google_renueva = true
        from auth.users u where u.id = b.coach_id and u.email = 'coachios@demo.test';`);
    t.ok(r.status === 0, 'el coach de la revisión con un plan de Google Play: ' + err(r));
    r = psql(demoSql);
    t.ok(r.status === 0, 'cuentas-demo.sql corre con lo de Google Play: ' + err(r));
    t.eq(psql(`select b.plan || ',' || coalesce(b.paid_until::text, '-') || ',' || coalesce(b.google_token, '-') || ',' || coalesce(b.google_vence::text, '-') || ',' || b.google_renueva
        || ',' || (select count(*) from public.google_subs s where s.user_id = u.id) from public.coach_billing b join auth.users u on u.id = b.coach_id where u.email = 'coachios@demo.test';`).stdout.trim(),
      'trial,-,-,-,false,0', 'el coach de la revisión vuelve a quedar sin plan y sin nada comprado con Google Play');
  } finally {
    correr('pg_ctl', ['-D', datos, '-m', 'immediate', 'stop']);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const ADMIN_ID = '22222222-2222-2222-2222-222222222222', ALUMNO_ID = '11111111-1111-1111-1111-111111111111', COACH_ID = '33333333-3333-3333-3333-333333333333',
  OTRO_ID = '44444444-4444-4444-4444-444444444444', PROPIO_ID = '55555555-5555-5555-5555-555555555555';

// Lo mínimo de Supabase para correr cuentas-demo.sql y cuentas-prueba.sql: cuatro cuentas reales
// (admin, alumno con coach, coach que paga y otra persona) y una propia (coach en prueba gratis).
const STUBS = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create schema extensions;
create function extensions.gen_salt(t text) returns text language sql as $$ select 'sal' $$;
create function extensions.crypt(p text, s text) returns text language sql as $$ select md5(p || s) $$;
create table auth.users (instance_id uuid, id uuid primary key, aud text, role text, email text, encrypted_password text, email_confirmed_at timestamptz,
  raw_app_meta_data jsonb, raw_user_meta_data jsonb, created_at timestamptz default now(), updated_at timestamptz, last_sign_in_at timestamptz,
  confirmation_token text, recovery_token text, email_change_token_new text, email_change text);
create table auth.identities (id uuid, user_id uuid references auth.users(id) on delete cascade, provider_id text, identity_data jsonb, provider text, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz);
create table auth.sessions (user_id uuid);
create table auth.refresh_tokens (user_id text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema public, auth, extensions to anon, authenticated, service_role;
create table public.profiles (id uuid primary key references auth.users(id) on delete cascade, full_name text, coach_id uuid, role text default 'client',
  last_seen_at timestamptz, app_version text, app_platform text);
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into public.profiles (id, full_name, role) values (new.id, new.raw_user_meta_data->>'full_name', coalesce(new.raw_user_meta_data->>'role', 'client')); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
create table public.coach_billing (coach_id uuid primary key references auth.users(id) on delete cascade, plan text not null default 'trial', max_clients int default 10,
  trial_ends_at timestamptz default now() + interval '14 days', paid_until timestamptz, mp_preapproval_id text, mp_status text, pending_plan text,
  apple_original_tx text, apple_vence timestamptz, apple_renueva boolean not null default false, updated_at timestamptz default now());
create table public.apple_subs (user_id uuid);
create table public.body_weights (client_id uuid, measured_on date, kg numeric);
create table public.sessions (client_id uuid references auth.users(id) on delete cascade, created_at timestamptz default now(), performed_on date default current_date);
create table public.food_entries (client_id uuid references auth.users(id) on delete cascade, log_date date default current_date);
create table public.daily_logs (client_id uuid references auth.users(id) on delete cascade, log_date date default current_date);
create table public.checkins (client_id uuid);
create table public.products (id uuid primary key default gen_random_uuid(), hidden boolean default false, source text, verified boolean, reports int default 0);
create table public.app_admins (user_id uuid primary key);
create function public.is_app_admin() returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from public.app_admins where user_id = auth.uid()) $$;
create function public.admin_assert() returns void language plpgsql stable security definer set search_path = public as $$
begin if not public.is_app_admin() then raise exception 'Solo administradores.' using errcode = '42501'; end if; end $$;
create table public.admin_audit (id bigserial, admin_id uuid, action text, target text, detail jsonb, created_at timestamptz default now());
create function public.admin_log(p_action text, p_target text, p_detail jsonb default null) returns void language plpgsql security definer set search_path = public as $$
begin perform public.admin_assert(); insert into public.admin_audit(admin_id, action, target, detail) values (auth.uid(), p_action, p_target, p_detail); end $$;
create function public.plan_price(p text) returns numeric language sql immutable as $$ select case p when 'p25' then 24900 else 0 end::numeric $$;
create function public.coach_active(cid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.coach_billing b where b.coach_id = cid and (b.plan = 'cortesia' or b.trial_ends_at > now() or b.paid_until > now())) $$;
create table public.fin_settings (id boolean primary key default true);
create table public.fin_costs (id bigserial primary key, status text);
create table public.fin_todos (id bigserial primary key, done boolean default false);
insert into public.fin_settings default values;
-- Las funciones nuevas se crean con permiso para todos, como en Supabase (cada archivo los saca).
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
insert into auth.users (id, email, created_at) values ('${ADMIN_ID}', 'a@x', now() - interval '2 days'), ('${ALUMNO_ID}', 'b@x', now() - interval '2 days'),
  ('${COACH_ID}', 'c@x', now() - interval '2 days'), ('${OTRO_ID}', 'd@x', now() - interval '200 days'), ('${PROPIO_ID}', 'e@x', now() - interval '1 day');
update public.profiles set full_name = 'Admin' where id = '${ADMIN_ID}';
update public.profiles set full_name = 'Alumno', coach_id = '${COACH_ID}', last_seen_at = now(), app_platform = 'web', app_version = '1' where id = '${ALUMNO_ID}';
update public.profiles set full_name = 'Coach Real', role = 'coach' where id = '${COACH_ID}';
update public.profiles set full_name = 'Otro' where id = '${OTRO_ID}';
update public.profiles set full_name = 'Propio', role = 'coach', last_seen_at = now(), app_platform = 'ios', app_version = '2' where id = '${PROPIO_ID}';
insert into public.coach_billing (coach_id, plan, max_clients, trial_ends_at, paid_until) values
  ('${COACH_ID}', 'p25', 25, now() - interval '30 days', now() + interval '20 days'), ('${PROPIO_ID}', 'trial', 10, now() + interval '10 days', null);
insert into public.sessions (client_id) values ('${ALUMNO_ID}'), ('${PROPIO_ID}');
insert into public.app_admins values ('${ADMIN_ID}');
`;
