// Mails de la prueba gratis a los coaches (supabase/mails-prueba.sql y la función prueba-coach):
// - el texto del día 3 («¿Ya sumaste tu primer alumno?») y del día 10 («Te quedan 4 días»);
// - la función corriendo en Node (tests/funcion.mjs): manda cada mail con Resend y, si no sale,
//   lo suelta para que se reintente; sin escribir mails ni nombres en los registros;
// - que el workflow la publique;
// - el SQL de verdad, con Postgres si la máquina tiene uno (como ia-sql): a quién le toca cada
//   mail, que sale una sola vez, que dos llamadas a la vez no lo repiten y que el archivo se puede
//   volver a correr. Si no hay Postgres, esa parte se saltea.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { funcion, supabaseSimulado } from './funcion.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIA = 864e5;

export default async function ({ t }){
  // ---------- 1) El texto ----------
  const m = await import(pathToFileURL(path.join(ROOT, 'supabase/functions/prueba-coach/mail.ts')).href);
  // La prueba termina el viernes 16 de octubre a la noche (hora de Argentina).
  const vence = '2026-10-17T02:00:00Z', ahora = Date.parse(vence) - 4 * DIA + 3600e3;

  const d3 = m.mailPrueba({ dia: 3, nombre: 'Juan Pérez', codigo: 'ABCD-1234', clientes: 0, vence });
  t.eq(d3.subject, '¿Ya sumaste tu primer alumno?', 'día 3: asunto');
  t.has(d3.text, 'Hola Juan:', 'día 3: saluda por el nombre');
  t.has(d3.text, 'Pasale tu código de invitación, ABCD-1234,', 'día 3: le pasa su código');
  t.has(d3.text, 'pone el código cuando la app se lo pide', 'día 3: cómo se vincula el alumno');
  t.has(d3.text, 'Respondé este mail y coordinamos una llamada', 'día 3: ofrece una llamada respondiendo el mail');
  t.has(d3.html, 'href="https://gize.ar/app/"', 'día 3: botón al panel');
  t.has(d3.html, 'Ir a mi panel', 'día 3: el botón dice a dónde va');
  t.ok(!/\$|Mercado Pago|precio/i.test(d3.text), 'día 3: no habla de precios ni de pagos');

  const sinCodigo = m.mailPrueba({ dia: 3, nombre: '', codigo: null, clientes: 0, vence });
  t.has(sinCodigo.text, 'Hola:', 'sin nombre');
  t.has(sinCodigo.text, 'lo ves en tu panel, en «Clientes»', 'sin código: le dice dónde verlo');

  const conAlumnos = m.mailPrueba({ dia: 3, nombre: 'Ana', codigo: 'ABCD-1234', clientes: 3, vence });
  t.eq(conAlumnos.subject, '¿Cómo vas con GIZE?', 'día 3 con alumnos: no le pregunta si ya sumó uno');
  t.has(conAlumnos.text, 'tenés 3 alumnos', 'día 3 con alumnos: los cuenta');
  t.has(conAlumnos.text, 'Para sumar más: pasale tu código', 'día 3 con alumnos: cómo sumar más');
  t.has(conAlumnos.text, 'llamada', 'día 3 con alumnos: también ofrece la llamada');

  const d10 = m.mailPrueba({ dia: 10, nombre: 'Juan', codigo: 'ABCD-1234', clientes: 2, vence, ahora });
  t.eq(d10.subject, 'Te quedan 4 días de prueba gratis', 'día 10: asunto');
  t.has(d10.text, 'cubre hasta el viernes 16 de octubre', 'día 10: último día en hora de Argentina');
  t.has(d10.text, 'dejás de ver lo que hacen tus 2 alumnos', 'día 10: qué pasa al terminar');
  t.has(d10.text, 'tus alumnos pasan a usar GIZE por su cuenta', 'día 10: y a los 4 días más');
  t.has(d10.text, 'gize.ar desde la compu o el navegador del celular → Mi plan', 'día 10: cómo elegir el plan en la web');
  t.has(d10.text, 'en el iPhone, también podés suscribirte desde la app con tu cuenta de Apple', 'día 10: en el iPhone se paga con Apple');
  t.has(d10.html, 'Elegir mi plan', 'día 10: botón');
  t.ok(!/\$\s?\d/.test(d10.text), 'día 10: sin precios');
  const d10b = m.mailPrueba({ dia: 10, nombre: 'Juan', clientes: 0, vence, ahora: Date.parse(vence) - 2.5 * DIA });
  t.eq(d10b.subject, 'Te quedan 3 días de prueba gratis', 'día 10 que sale tarde: cuenta los días que quedan de verdad');
  t.ok(!/alumnos pasan|alumno pasa/.test(d10b.text), 'sin alumnos no habla de ellos');
  const uno = m.mailPrueba({ dia: 10, nombre: 'Ana', clientes: 1, vence, ahora });
  t.has(uno.text, 'tu alumno pasa', 'un solo alumno');

  const raro = m.mailPrueba({ dia: 3, nombre: '<b>Ana</b>', codigo: '<i>X</i>', clientes: 0, vence });
  t.ok(!raro.html.includes('<b>Ana') && !raro.html.includes('<i>X'), 'el nombre y el código van escapados en el HTML');

  // ---------- 2) La función ----------
  const COACH_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', COACH_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const montar = async ({ filas, env = {}, resend = () => 200 }) => {
    const rpcs = [], mails = [];
    const db = supabaseSimulado(q => {
      if (q.accion === 'rpc'){ rpcs.push([q.tabla, q.valores]); return q.tabla === 'tomar_mails_prueba' ? { data: filas } : { data: null }; }
      return { data: null };
    });
    const fn = await funcion('prueba-coach', {
      env: Object.assign({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'srv', RESEND_API_KEY: 'clave' }, env),
      npm: { '@supabase/supabase-js': { createClient: () => db } },
      fetch: async (url, o) => { const b = JSON.parse(o.body); mails.push({ url, b }); return new Response('{}', { status: resend(b) }); },
    });
    const pedir = async (headers = {}) => {
      const r = await fn.call(new Request('https://x.supabase.co/functions/v1/prueba-coach', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, headers), body: '{}' }));
      return { status: r.status, body: await r.json().catch(() => ({})) };
    };
    return { fn, pedir, rpcs, mails };
  };
  const FILAS = [
    { coach_id: COACH_A, dia: 3, vence, nombre: 'Coach Uno', codigo: 'ABCD-1234', clientes: 0 },
    { coach_id: COACH_B, dia: 10, vence, nombre: 'Coach Dos', codigo: 'EFGH-5678', clientes: 4 },
  ];
  let f = await montar({ filas: FILAS, resend: b => b.subject.startsWith('Te quedan') ? 500 : 200 });
  let r = await f.pedir();
  t.eq(r.status, 200, 'la función responde');
  t.eq([r.body.enviados, r.body.fallidos], [1, 1], 'un mail salió y el otro no');
  t.eq(f.mails.length, 2, 'un pedido a Resend por coach');
  t.ok(f.mails.every(x => x.url === 'https://api.resend.com/emails' && x.b.from === 'GIZE <soporte@gize.ar>'), 'desde soporte@gize.ar, con Resend');
  t.eq(f.mails[0].b.subject, '¿Ya sumaste tu primer alumno?', 'el del día 3 al que le toca el día 3');
  t.has(f.mails[0].b.text, 'ABCD-1234', 'con su código');
  t.has(f.mails[1].b.subject, 'Te quedan', 'el del día 10 al que le toca el día 10');
  t.eq(f.rpcs.map(x => x[0]), ['tomar_mails_prueba', 'soltar_mail_prueba'], 'toma los que tocan y suelta solo el que no salió');
  t.eq(f.rpcs[1][1], { cid: COACH_B, dia: 10 }, 'suelta ese coach y ese mail (se reintenta en la hora siguiente)');
  t.ok(!f.fn.logs.some(l => /@|Coach (Uno|Dos)/.test(l)), 'no escribe mails ni nombres en los registros: ' + JSON.stringify(f.fn.logs));

  f = await montar({ filas: FILAS, env: { RESEND_API_KEY: undefined } });
  r = await f.pedir();
  t.ok(r.body.ok === false && f.rpcs.length === 0, 'sin RESEND_API_KEY no toma a nadie (quedan para la hora siguiente)');
  f = await montar({ filas: FILAS, env: { CRON_SECRET: 'secreto' } });
  r = await f.pedir({ 'x-cron-secret': 'otro' });
  t.ok(r.status === 401 && f.rpcs.length === 0, 'con CRON_SECRET puesto, sin el header correcto no hace nada');
  r = await f.pedir({ 'x-cron-secret': 'secreto' });
  t.eq(r.body.enviados, 2, 'con el header correcto manda');

  // ---------- 3) El workflow la publica ----------
  const wf = fs.readFileSync(path.join(ROOT, '.github/workflows/supabase.yml'), 'utf8');
  t.ok(/for fn in [^\n]*\bprueba-coach\b/.test(wf), 'el workflow publica prueba-coach');

  // ---------- 4) El SQL ----------
  const sql = fs.readFileSync(path.join(ROOT, 'supabase/mails-prueba.sql'), 'utf8');
  t.has(sql, 'Correr con el workflow "Supabase" → tarea sql → supabase/mails-prueba.sql', 'encabezado: cómo correrlo');
  t.has(sql, 'Se puede correr varias veces', 'encabezado: se puede correr varias veces');
  t.has(sql, '/functions/v1/prueba-coach', 'el cron llama a la función');
  t.ok(!/[A-Za-z0-9._%+-]+@(?!gize\.ar)[A-Za-z0-9.-]+\.[a-z]{2,}/.test(sql), 'sin mails de nadie');
  await conPostgres(t, sql);
}

// Busca los programas de Postgres (como ia-sql). Si corre como root, usa el usuario postgres.
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

const C = n => '0000000' + n + '-0000-0000-0000-000000000000';
// Lo mínimo de Supabase y de suscripciones.sql para correr mails-prueba.sql.
const STUBS = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create schema cron; create schema net;
create table auth.users (id uuid primary key);
create table cron.job (jobid bigserial primary key, jobname text unique, schedule text, command text, active boolean default true);
create function cron.schedule(n text, s text, c text) returns bigint language sql as $$ insert into cron.job(jobname, schedule, command) values (n, s, c) returning jobid $$;
create function cron.unschedule(n text) returns boolean language sql as $$ delete from cron.job where jobname = n returning true $$;
create function public.cron_secret() returns text language sql as $$ select '' $$;
grant usage on schema public to anon, authenticated, service_role;
create table public.profiles (id uuid primary key, full_name text, coach_id uuid, role text default 'client', invite_code text);
create table public.coach_billing (
  coach_id uuid primary key references public.profiles(id), plan text not null default 'trial', max_clients int not null default 10,
  trial_ends_at timestamptz not null default now() + interval '14 days', paid_until timestamptz, mp_preapproval_id text, mp_status text,
  pending_plan text, updated_at timestamptz not null default now());
grant all on all tables in schema public to anon, authenticated, service_role;
`;
// [coach, plan, días que le quedan a la prueba, paid_until (días), mp_status, rol]
const COACHES = [
  [1, 'trial', 10.5, null, null, 'coach'],     // día 3 → mail 3
  [2, 'trial', 3.5, null, null, 'coach'],      // día 10 → mail 10
  [3, 'trial', 13, null, null, 'coach'],       // día 1 → nada todavía
  [4, 'trial', 8, null, null, 'coach'],        // día 6: se pasó el del día 3 y falta el del 10
  [5, 'cortesia', 10.5, null, null, 'coach'],  // cortesía
  [6, 'p10', 10.5, 30, null, 'coach'],         // ya pagó un plan
  [7, 'trial', 10.5, 20, null, 'coach'],       // pagó durante la prueba (Apple, transferencia)
  [8, 'trial', 3.5, null, 'authorized', 'coach'], // renovación automática de Mercado Pago
  [9, 'trial', 1.5, null, null, 'coach'],      // termina mañana: ese mail es el de aviso-vencimiento
  [10 % 10, 'trial', 10.5, null, null, 'client'], // ya no es coach
];

async function conPostgres(t, sqlOriginal){
  const pg = postgres();
  if (!pg){ console.log('    (mails-prueba: no hay Postgres en esta máquina: se saltea la parte que corre el SQL)'); return; }
  // En Supabase pg_cron y pg_net ya están; acá se simulan con lo de arriba.
  const sql = sqlOriginal.replace(/^create extension[^\n]*\n/gm, '');
  t.ok(sql.length < sqlOriginal.length, 'el archivo pide pg_cron y pg_net');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gize-prueba-pg-'));
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
  const psqlAsync = (texto) => new Promise(ok => {
    const c = spawn(pg.psql, args('gize'));
    let out = ''; c.stdout.on('data', d => out += d); c.stderr.on('data', d => out += d); c.on('close', code => ok({ code, out })); c.stdin.end(texto);
  });
  const val = texto => { const r = psql(texto); return r.status === 0 ? r.stdout.trim() : 'ERROR ' + r.stderr.trim(); };
  const tomar = () => val('set role service_role; select coach_id, dia, nombre, codigo, clientes from public.tomar_mails_prueba() order by coach_id;');
  try {
    let r = psql('create database gize;', 'postgres');
    t.ok(r.status === 0, 'crea la base de prueba: ' + r.stderr);
    r = psql(STUBS);
    t.ok(r.status === 0, 'lo mínimo de Supabase: ' + r.stderr);
    for (const vez of [1, 2]){
      r = psql(sql);
      t.ok(r.status === 0, 'mails-prueba.sql corre (vez ' + vez + '): ' + (r.stderr || '').split('\n').filter(l => /ERROR/.test(l)).join(' '));
    }
    t.eq(val("select schedule from cron.job where jobname = 'gize-mails-prueba';"), '23 12-23 * * *', 'un solo trabajo de pg_cron, cada hora de 9 a 20 de Argentina');
    t.has(val("select command from cron.job where jobname = 'gize-mails-prueba';"), 'where public.hay_mails_prueba()', 'solo llama a la función si hay algo para mandar');

    t.eq(val('select public.hay_mails_prueba();'), 'f', 'sin coaches no hay nada que mandar');
    const filas = COACHES.map(([n, plan, dias, pago, mp, rol]) =>
      `insert into public.profiles (id, full_name, role, invite_code) values ('${C(n)}', 'Coach ${n}', '${rol}', 'COD-${n}');
       insert into public.coach_billing (coach_id, plan, trial_ends_at, paid_until, mp_status) values ('${C(n)}', '${plan}', now() + interval '${dias * 24} hours',
         ${pago ? `now() + interval '${pago} days'` : 'null'}, ${mp ? `'${mp}'` : 'null'});`).join('\n')
      + `\ninsert into public.profiles (id, full_name, coach_id) values (gen_random_uuid(), 'Alumno', '${C(1)}'), (gen_random_uuid(), 'Alumno', '${C(1)}');`;
    r = psql(filas);
    t.ok(r.status === 0, 'carga los coaches de prueba: ' + r.stderr);

    t.eq(val('set role authenticated; select public.tomar_mails_prueba();').slice(0, 5), 'ERROR', 'desde la app no se pueden tomar');
    t.eq(val(`set role anon; select public.soltar_mail_prueba('${C(1)}', 3);`).slice(0, 5), 'ERROR', 'ni soltar');
    t.eq(val('select public.hay_mails_prueba();'), 't', 'hay mails para mandar');
    t.eq(tomar(), `${C(1)}|3|Coach 1|COD-1|2\n${C(2)}|10|Coach 2|COD-2|0`,
      'solo a los que están en el día 3 o en el día 10 de la prueba, sin pagar, sin cortesía y que siguen siendo coach (con su nombre, código y alumnos)');
    t.eq(tomar(), '', 'cada mail sale una sola vez');
    t.eq(val('select public.hay_mails_prueba();'), 'f', 'y el cron ya no llama');

    r = psql(`set role service_role; select public.soltar_mail_prueba('${C(2)}', 10);`);
    t.ok(r.status === 0, 'la función puede soltar: ' + r.stderr);
    t.eq(tomar(), `${C(2)}|10|Coach 2|COD-2|0`, 'si no salió, se suelta y se vuelve a tomar');
    t.eq(val(`select mail_dia3_at is not null from public.coach_billing where coach_id = '${C(1)}';`), 't', 'soltar el del día 10 de uno no toca a los otros');

    // El coach 1 llega al día 10: le toca el segundo (el del día 3 ya salió y no se repite).
    psql(`update public.coach_billing set trial_ends_at = now() + interval '84 hours' where coach_id = '${C(1)}';`);
    t.eq(tomar(), `${C(1)}|10|Coach 1|COD-1|2`, 'el mismo coach recibe el del día 10 cuando llega');
    t.eq(tomar(), '', 'y nada más');
    // El que pagó en el medio ya no recibe el del día 10.
    psql(`update public.coach_billing set trial_ends_at = now() + interval '84 hours' where coach_id = '${C(3)}';
          update public.coach_billing set plan = 'p10', paid_until = now() + interval '30 days' where coach_id = '${C(3)}';`);
    t.eq(tomar(), '', 'si eligió un plan, no le llega el «te quedan 4 días»');

    // Dos llamadas a la vez: la primera se queda adentro de su transacción un segundo.
    psql(`update public.coach_billing set trial_ends_at = now() + interval '252 hours' where coach_id = '${C(4)}';`);
    const q = 'set role service_role; select count(*) from public.tomar_mails_prueba();';
    const [a, b] = await Promise.all([psqlAsync('begin; ' + q + ' select pg_sleep(1); commit;'), new Promise(ok => setTimeout(() => psqlAsync(q).then(ok), 200))]);
    t.ok(a.code === 0 && b.code === 0, 'dos llamadas a la vez andan: ' + JSON.stringify([a.out, b.out]));
    t.eq([a.out.trim().split('\n')[0], b.out.trim()], ['1', '0'], 'dos llamadas a la vez: el mail sale una sola vez');
  } finally {
    correr('pg_ctl', ['-D', datos, '-m', 'immediate', 'stop']);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
