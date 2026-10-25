// IA Plus en la base (supabase/ia.sql): el límite semanal gratis de la foto del plato (solo fotos),
// que controla ia_reservar (la app no lo puede saltear), quién no lo tiene y los topes de quien lo
// tiene (hasta 10 fotos por día y US$1,50 por ciclo).
// 1) Leído: arranca apagado; ia_plus sin acceso desde la app; las funciones nuevas con sus permisos.
// 2) De verdad, en un Postgres (como ia-sql.test.mjs; si la máquina no tiene, se saltea):
//    - con IA Plus apagado no hay límite semanal (como antes);
//    - no se prende sin confirmar el precio en pesos;
//    - prendido: 3 fotos gratis por semana, la 4.ª da tope_semana con el lunes que viene; solo
//      cuentan las fotos (un texto viejo no); los errores explícitos de la API (usd 0) no cuentan;
//      lo de la semana pasada no cuenta; la semana arranca el lunes 00:00 de Buenos Aires;
//    - sin límite: alumno de coach con plan pago o de cortesía (la prueba no cuenta), coach con plan,
//      IA Plus comprado y vigente (Mercado Pago, Apple o a mano); vencido, vuelve el límite;
//    - en modo ahorro, quien pagó IA Plus sigue;
//    - topes de IA Plus (topes.plus): con IA Plus, hasta 10 fotos por día y US$1,50 por ciclo; el
//      gratis sigue con US$0,50; el coach sigue con sus US$5; con el interruptor apagado, el
//      incluido vuelve a los topes de siempre (8 fotos) y el que lo pagó sigue con 10; el panel los
//      cambia;
//    - dos pedidos a la vez con un solo uso gratis: pasa uno;
//    - ia_mi_estado: estado tope_semana, «quedan» y lo de plus (estado, fuente, renueva,
//      arrepentimiento), también con la IA apagada;
//    - panel: dar y sacar IA Plus a mano por mail, lista y resumen; desde la app no se puede;
//    - no se prende IA Plus con la IA de Comida apagada; después de arrepentirse, 60 días de espera
//      (espera_hasta) y quien se arrepintió dos veces queda en la lista del panel;
//    - botón de arrepentimiento y de baja sin sesión (pedido_baja): código, tope por mail, solo la
//      función lo puede llamar y el panel los ve y los marca atendidos.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { postgres, STUBS, ADMIN_ID, ALUMNO_ID, COACH_ID, OTRO_ID } from './ia-sql.test.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const sinComentarios = s => s.replace(/--[^\n]*/g, '');
const fn = (sql, name) => {
  const i = sql.indexOf('create or replace function public.' + name + '(');
  if (i < 0) return '';
  const a = sql.indexOf('$$', i), b = sql.indexOf('$$', a + 2);
  return sql.slice(i, b + 2);
};

export default async ({ t }) => {
  const sql = read('supabase/ia.sql'), ped = read('supabase/pedidos-productos.sql'), code = sinComentarios(sql);

  // ---------- 1) Leído ----------
  const def = JSON.parse((code.match(/add column if not exists plus jsonb not null default '([^']+)'/) || [])[1] || '{}');
  t.eq(def, { activa: false, gratis_semana: 3, precio_ars: 3900, precio_confirmado: true }, 'IA Plus arranca apagado, 3 fotos gratis por semana y el precio de la web en $3.900 (lo decidió el dueño)');
  const topes = JSON.parse((code.match(/topes\s+jsonb not null default '([^']+)'/) || [])[1] || '{}');
  t.eq(topes.plus, { plato: 10, usd_ciclo: 1.5 }, 'topes de IA Plus: 10 fotos por día y US$1,50 por ciclo');
  t.eq([topes.alumno.plato, topes.alumno.usd_ciclo], [8, 0.5], 'el gratis sigue con 8 fotos y US$0,50');
  t.ok(code.includes(`update public.ia_config set topes = topes || '{"plus":{"plato":10,"usd_ciclo":1.5}}' where id = 1 and not (topes ? 'plus');`), 'en una base que ya tenía la configuración, se suman los topes de IA Plus una sola vez');
  t.ok(/l\.funcion = 'plato' and l\.creada >= public\.ia_semana\(\)/.test(fn(code, 'ia_semana_usos')), 'la semana cuenta solo fotos');
  t.ok(code.includes('create table if not exists public.ia_plus (') && code.includes('alter table public.ia_plus enable row level security;') && code.includes('revoke all on public.ia_plus from anon, authenticated;'), 'ia_plus: RLS y sin acceso desde la app');
  t.ok(!/create policy [^;]* on public\.ia_plus/.test(code), 'ia_plus: sin políticas (la app lo lee con ia_mi_estado)');
  for (const sig of ['ia_plus_hasta(uuid)', 'ia_plus_incluido(uuid)', 'ia_plus_tiene(uuid)', 'ia_plus_rige(uuid)', 'ia_plus_info(uuid)']){
    const e = sig.replace(/[()]/g, '\\$&');
    t.ok(new RegExp('revoke all on function public\\.' + e + ' from public, anon, authenticated;').test(code) && code.includes('grant execute on function public.' + sig + ' to service_role;'), sig + ': solo la service role');
  }
  for (const sig of ['ia_semana()', 'ia_semana_usos(uuid)'])
    t.ok(code.includes('revoke all on function public.' + sig + ' from public, anon, authenticated;') && !code.includes('grant execute on function public.' + sig), sig + ': uso interno');
  for (const name of ['admin_ia_plus_lista', 'admin_ia_plus_dar', 'admin_ia_plus_quitar'])
    t.ok(/\bbegin\s+perform public\.admin_assert\(\);/.test(fn(code, name)) && /security definer set search_path = public/.test(fn(code, name)), name + ': lo primero es admin_assert()');
  const res = fn(code, 'ia_reservar');
  const orden = ["'codigo', 'ahorro'", "'tope_semana'", "'codigo', 'ritmo'"].map(s => res.indexOf(s));
  t.ok(orden.every((x, i) => x > 0 && (i === 0 || x > orden[i - 1])), 'ia_reservar: el límite semanal va después del ahorro y antes del ritmo: ' + orden.join(','));
  t.ok(/perform public\.ia_frenada\(v_c\.id, 'tope_semana'\);\s+return jsonb_build_object\('ok', false, 'codigo', 'tope_semana'/.test(res), 'ia_reservar cuenta la frenada «tope_semana»');
  t.ok(/date_trunc\('week', now\(\) at time zone 'America\/Argentina\/Buenos_Aires'\)/.test(fn(code, 'ia_semana')), 'la semana arranca el lunes, en Buenos Aires');

  // ---------- 2) De verdad ----------
  const pg = postgres();
  if (!pg){ console.log('    (ia-plus-sql: no hay Postgres en esta máquina: se saltea la parte que corre el SQL)'); return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gize-iaplus-pg-'));
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
  const errores = r => (r.stderr || '').split('\n').filter(l => /ERROR|CONTEXT/.test(l)).join(' ').slice(0, 500);
  try {
    t.ok(psql('create database gize;', 'postgres').status === 0, 'crea la base de prueba');
    let r = psql(STUBS); t.ok(r.status === 0, 'lo mínimo de Supabase: ' + r.stderr);
    for (const vez of [1, 2]){
      r = psql(ped); t.ok(r.status === 0, 'pedidos-productos.sql corre (vez ' + vez + '): ' + errores(r));
      r = psql(sql); t.ok(r.status === 0, 'ia.sql corre (vez ' + vez + '): ' + errores(r));
      // Como quedó una base con la versión anterior (los $3.900 sin confirmar): al correrlo de nuevo, se confirma.
      if (vez === 1) psql(`update public.ia_config set plus = plus || '{"precio_confirmado": false}';`);
    }
    r = psql(`select plus ->> 'precio_ars', plus ->> 'precio_confirmado', plus ->> 'activa' from public.ia_config;`);
    t.eq((r.stdout || '').trim(), '3900|true|false', 'IA Plus: $3.900 confirmado y apagado (también en una base que lo tenía sin confirmar)');
    for (const [nombre, texto] of ESCENARIOS){
      r = psql(texto);
      t.ok(r.status === 0, nombre + ': ' + errores(r));
    }
    // Dos pedidos a la vez cuando queda una sola foto gratis: el primero se queda adentro de su
    // transacción un segundo; el otro espera (el ciclo está bloqueado) y ve que ya no queda.
    psql(`delete from public.ia_llamadas; delete from public.ia_plus; update public.coach_billing set paid_until = null, plan = 'trial';
      insert into public.ia_llamadas (ciclo_id, user_id, rol, funcion, modelo, estado, max_usd, usd) select id, '${OTRO_ID}', 'alumno', 'plato', 'm-x', 'ok', 0.001, 0.001 from public.ia_ciclos cross join generate_series(1, 2);`);
    const reservar = `set role service_role; select public.ia_reservar('${OTRO_ID}', 'alumno', 'plato', 'modelo-x', 0.005, null)->>'codigo';`;
    const [a, b] = await Promise.all([psqlAsync('begin; ' + reservar + ' select pg_sleep(1); commit;'), new Promise(ok => setTimeout(() => psqlAsync(reservar).then(ok), 200))]);
    const cods = [a.out, b.out].map(o => (o.match(/^(\S*)$/m) || [])[1]);
    t.ok(a.code === 0 && b.code === 0, 'dos a la vez: corren: ' + JSON.stringify([a.out, b.out]));
    t.eq(cods.sort(), ['', 'tope_semana'], 'dos a la vez con una sola foto gratis: pasa uno y el otro da tope_semana');
  } finally {
    correr('pg_ctl', ['-D', datos, '-m', 'immediate', 'stop']);
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

const RES = (uid, rol = 'alumno', funcion = 'plato') => `public.ia_reservar('${uid}', '${rol}', '${funcion}', 'modelo-x', 0.005, null)`;
// Reserva y cierra con costo (cuenta como uso).
const USO = (uid, funcion = 'plato', rol = 'alumno') => `j := ${RES(uid, rol, funcion)}; assert (j->>'ok')::boolean, 'uso ${funcion} ' || j::text; perform public.ia_cerrar((j->>'llamada_id')::bigint, 'ok', null, 0.001);`;
const COMO = uid => `set role authenticated; set request.jwt.claim.sub = '${uid}';`;
const ESCENARIOS = [
  ['la semana: lunes 00:00 de Buenos Aires', `
do $$ declare s timestamptz := public.ia_semana(); begin
  assert extract(isodow from s at time zone 'America/Argentina/Buenos_Aires') = 1 and (s at time zone 'America/Argentina/Buenos_Aires')::time = '00:00', 'lunes 00:00 ' || s;
  assert s <= now() and now() < s + interval '7 days', 'esta semana ' || s;
end $$;`],
  ['preparar: IA prendida (solo la foto del plato) con ciclo', `
${COMO(ADMIN_ID)}
select public.admin_ia_config('{"activa": true, "funciones": {"plato": true}}');
select public.admin_ia_ciclo((current_date + 20));
reset role;
insert into public.coach_billing (coach_id, plan, max_clients, trial_ends_at, paid_until) values ('${COACH_ID}', 'trial', 10, now() + interval '5 days', null) on conflict (coach_id) do nothing;`],
  ['con IA Plus apagado no hay límite semanal (como antes)', `
do $$ declare j jsonb; e jsonb; begin
  ${USO(OTRO_ID)} ${USO(OTRO_ID)} ${USO(OTRO_ID)} ${USO(OTRO_ID)} ${USO(OTRO_ID)}
  perform set_config('request.jwt.claim.sub', '${OTRO_ID}', true);
  e := public.ia_mi_estado();
  assert e ->> 'estado' = 'normal' and (e #>> '{plus,activa}')::boolean = false and e #>> '{plus,estado}' = 'gratis', 'apagado ' || e::text;
  assert (e #>> '{quedan,plato}')::int = 3 and (e #>> '{tope,plato}')::int = 8, 'quedan sin límite semanal (de las 8 de siempre) ' || e::text;
end $$;
delete from public.ia_llamadas;`],
  ['no se prende sin el precio confirmado; con el precio, sí', `
update public.ia_config set plus = plus || '{"precio_confirmado": false}';
${COMO(ADMIN_ID)}
do $$ begin
  begin perform public.admin_ia_config('{"plus": {"activa": true}}'); raise exception 'prendió sin precio'; exception when sqlstate '22023' then null; end;
  begin perform public.admin_ia_config('{"plus": {"precio_ars": 3900.5}}'); raise exception 'precio con centavos'; exception when sqlstate '22023' then null; end;
  begin perform public.admin_ia_config('{"plus": {"gratis_semana": -1}}'); raise exception 'gratis negativo'; exception when sqlstate '22023' then null; end;
  begin perform public.admin_ia_config('{"plus": {"inventado": 1}}'); raise exception 'dato inventado'; exception when sqlstate '22023' then null; end;
end $$;
select public.admin_ia_config('{"plus": {"precio_ars": 4500}}');
select public.admin_ia_config('{"plus": {"activa": true}}');
do $$ begin
  begin perform public.admin_ia_config('{"plus": {"sandbox": ["no-es-mail"]}}'); raise exception 'sandbox sin mail'; exception when sqlstate '22023' then null; end;
  begin perform public.admin_ia_config('{"plus": {"sandbox": "a@b.c"}}'); raise exception 'sandbox sin lista'; exception when sqlstate '22023' then null; end;
end $$;
select public.admin_ia_config('{"plus": {"sandbox": ["Revision@Prueba.test ", "revision@prueba.test"]}}');
reset role;
do $$ begin assert (select plus -> 'sandbox' from public.ia_config) = '["revision@prueba.test"]'::jsonb, 'sandbox: en minúsculas y sin repetir'; end $$;
do $$ declare p jsonb := (select plus from public.ia_config); begin
  assert (p ->> 'activa')::boolean and (p ->> 'precio_ars')::int = 4500 and (p ->> 'precio_confirmado')::boolean and (p ->> 'gratis_semana')::int = 3, 'config ' || p::text;
end $$;`],
  ['prendido: 3 fotos gratis por semana (solo fotos), la 4.ª no', `
-- Un texto de antes (cuando estaba «Contame qué comiste») no cuenta: solo fotos.
insert into public.ia_llamadas (ciclo_id, user_id, rol, funcion, modelo, estado, max_usd, usd) select id, '${OTRO_ID}', 'alumno', 'texto', 'm-x', 'ok', 0.001, 0.001 from public.ia_ciclos;
do $$ declare j jsonb; e jsonb; begin
  ${USO(OTRO_ID)} ${USO(OTRO_ID)}
  -- Un error explícito de la API (usd 0) no cuenta.
  j := ${RES(OTRO_ID)}; perform public.ia_cerrar((j->>'llamada_id')::bigint, 'error', 'api_529', 0);
  perform set_config('request.jwt.claim.sub', '${OTRO_ID}', true);
  e := public.ia_mi_estado();
  assert (e #>> '{plus,usados_semana}')::int = 2 and (e #>> '{plus,quedan_semana}')::int = 1 and (e #>> '{quedan,plato}')::int = 1, 'queda 1 ' || e::text;
  assert (e #>> '{plus,plato_dia}')::int = 10 and (e #>> '{tope,plato}')::int = 8, 'la oferta dice 10 por día; el gratis sigue con 8 ' || e::text;
  ${USO(OTRO_ID)}
  j := ${RES(OTRO_ID)};
  assert j ->> 'codigo' = 'tope_semana' and (j ->> 'tope')::int = 3 and (j ->> 'vuelve')::timestamptz = public.ia_semana() + interval '7 days', 'la 4.ª ' || j::text;
  assert (select (frenos ->> 'tope_semana')::int from public.ia_ciclos) = 1, 'cuenta la frenada';
  e := public.ia_mi_estado();
  assert e ->> 'estado' = 'tope_semana' and (e ->> 'vuelve')::timestamptz = public.ia_semana() + interval '7 days' and (e #>> '{quedan,plato}')::int = 0 and e #>> '{plus,estado}' = 'gratis', 'estado ' || e::text;
  assert (e #>> '{plus,precio_ars}')::int = 4500, 'el precio para la web ' || e::text;
end $$;`],
  ['lo de la semana pasada no cuenta', `
update public.ia_llamadas set creada = public.ia_semana() - interval '1 minute' where user_id = '${OTRO_ID}';
do $$ declare j jsonb; begin ${USO(OTRO_ID)} end $$;
update public.ia_llamadas set creada = public.ia_semana() - interval '1 minute' where user_id = '${OTRO_ID}';`],
  ['alumno de coach: con plan pago, de cortesía o el coach con plan, sin límite; en la prueba, con límite', `
do $$ declare j jsonb; e jsonb; begin
  ${USO(ALUMNO_ID)} ${USO(ALUMNO_ID)} ${USO(ALUMNO_ID)}
  j := ${RES(ALUMNO_ID)}; assert j ->> 'codigo' = 'tope_semana', 'coach en la prueba: hay límite ' || j::text;
  update public.coach_billing set paid_until = now() + interval '20 days' where coach_id = '${COACH_ID}';
  ${USO(ALUMNO_ID)}
  perform set_config('request.jwt.claim.sub', '${ALUMNO_ID}', true);
  e := public.ia_mi_estado();
  assert e ->> 'estado' = 'normal' and e #>> '{plus,estado}' = 'incluido' and e #>> '{plus,por}' = 'alumno', 'incluido ' || e::text;
  assert (e #>> '{quedan,plato}')::int = 6 and (e #>> '{tope,plato}')::int = 10, 'quedan: los del día, de las 10 de IA Plus ' || e::text;
  update public.coach_billing set paid_until = null, plan = 'cortesia' where coach_id = '${COACH_ID}';
  ${USO(ALUMNO_ID)}
  -- El coach con plan usa la IA con su rol (coach): incluido.
  perform set_config('request.jwt.claim.sub', '${COACH_ID}', true);
  e := public.ia_mi_estado();
  assert e #>> '{plus,estado}' = 'incluido' and e #>> '{plus,por}' = 'coach', 'coach ' || e::text;
  update public.coach_billing set plan = 'trial', trial_ends_at = now() + interval '5 days' where coach_id = '${COACH_ID}';
  e := public.ia_mi_estado();
  assert e #>> '{plus,estado}' = 'gratis', 'coach en la prueba: gratis ' || e::text;
end $$;`],
  ['IA Plus comprado: sin límite mientras esté vigente; vencido, vuelve el límite', `
insert into public.ia_plus (user_id, mp_preapproval_id, mp_status, mp_desde, mp_hasta, mp_pago_id) values ('${ALUMNO_ID}', 'PA-1', 'authorized', now() - interval '2 days', now() + interval '30 days', 'PAGO-1');
do $$ declare j jsonb; e jsonb; begin
  ${USO(ALUMNO_ID)} ${USO(ALUMNO_ID)}
  perform set_config('request.jwt.claim.sub', '${ALUMNO_ID}', true);
  e := public.ia_mi_estado();
  assert e #>> '{plus,estado}' = 'plus' and e #>> '{plus,fuente}' = 'mp' and (e #>> '{plus,renueva}')::boolean and e #>> '{plus,mp_status}' = 'authorized', 'plus ' || e::text;
  assert (e #>> '{plus,arrepentir_hasta}')::timestamptz > now() + interval '7 days', 'arrepentimiento: 10 días desde el primer cobro ' || e::text;
  update public.ia_plus set mp_status = 'cancelled', mp_desde = now() - interval '11 days' where user_id = '${ALUMNO_ID}';
  e := public.ia_mi_estado();
  assert e #>> '{plus,estado}' = 'plus' and not (e #>> '{plus,renueva}')::boolean and e #> '{plus,arrepentir_hasta}' = 'null'::jsonb, 'cancelado: sigue hasta el fin, sin arrepentimiento ' || e::text;
  update public.ia_plus set mp_hasta = now() - interval '1 minute' where user_id = '${ALUMNO_ID}';
  j := ${RES(ALUMNO_ID)}; assert j ->> 'codigo' = 'tope_semana', 'vencido: vuelve el límite ' || j::text;
  -- Apple vigente (aunque lo de Mercado Pago venció): gana lo que llega más lejos.
  update public.ia_plus set apple_original_tx = '2000', apple_vence = now() + interval '3 days', apple_renueva = true where user_id = '${ALUMNO_ID}';
  ${USO(ALUMNO_ID)}
  e := public.ia_mi_estado();
  assert e #>> '{plus,fuente}' = 'apple' and (e #>> '{plus,renueva}')::boolean, 'apple ' || e::text;
  update public.ia_plus set apple_vence = now() - interval '1 minute', apple_renueva = false where user_id = '${ALUMNO_ID}';
end $$;`],
  ['modo ahorro: quien pagó IA Plus sigue; el gratis no', `
update public.ia_ciclos set estado = 'ahorro';
update public.ia_plus set mp_hasta = now() + interval '10 days', mp_status = 'authorized' where user_id = '${ALUMNO_ID}';
do $$ declare j jsonb; e jsonb; begin
  ${USO(ALUMNO_ID)}
  j := ${RES(OTRO_ID)}; assert j ->> 'codigo' = 'ahorro', 'gratis en ahorro ' || j::text;
  perform set_config('request.jwt.claim.sub', '${ALUMNO_ID}', true);
  e := public.ia_mi_estado(); assert e ->> 'estado' = 'normal', 'plus en ahorro ' || e::text;
  perform set_config('request.jwt.claim.sub', '${OTRO_ID}', true);
  e := public.ia_mi_estado(); assert e ->> 'estado' = 'ahorro', 'gratis en ahorro ' || e::text;
end $$;
update public.ia_ciclos set estado = 'normal';`],
  ['topes de IA Plus: 10 fotos por día y US$1,50 por ciclo; el gratis sigue con US$0,50 y el coach con US$5', `
delete from public.ia_llamadas;
do $$ declare j jsonb; e jsonb; begin
  -- ALUMNO tiene IA Plus comprado (Mercado Pago, vigente): 10 fotos por día; la 11.ª no.
  for i in 1..10 loop ${USO(ALUMNO_ID)} end loop;
  j := ${RES(ALUMNO_ID)};
  assert j ->> 'codigo' = 'tope_dia' and (j ->> 'tope')::int = 10, 'la 11.ª ' || j::text;
  perform set_config('request.jwt.claim.sub', '${ALUMNO_ID}', true);
  e := public.ia_mi_estado();
  assert (e #>> '{tope,plato}')::int = 10 and (e #>> '{quedan,plato}')::int = 0, 'mi estado: 10 por día ' || e::text;
end $$;
-- Plata del ciclo: con IA Plus, US$1,50 (con US$1,20 gastados sigue; con US$1,50, no).
delete from public.ia_llamadas;
insert into public.ia_llamadas (ciclo_id, user_id, rol, funcion, modelo, estado, max_usd, usd, creada)
  select id, u, 'alumno', 'etiqueta', 'm-x', 'ok', x, x, now() - interval '2 days' from public.ia_ciclos, (values ('${ALUMNO_ID}'::uuid, 1.2), ('${OTRO_ID}'::uuid, 0.6)) v(u, x);
insert into public.ia_llamadas (ciclo_id, user_id, rol, funcion, modelo, estado, max_usd, usd, creada)
  select id, '${COACH_ID}', 'coach', 'rutina', 'm-x', 'ok', 2, 2, now() - interval '2 days' from public.ia_ciclos;
update public.coach_billing set paid_until = now() + interval '20 days' where coach_id = '${COACH_ID}';
do $$ declare j jsonb; e jsonb; begin
  j := ${RES(ALUMNO_ID)}; assert (j ->> 'ok')::boolean, 'IA Plus con US$1,20: sigue ' || j::text;
  perform public.ia_cerrar((j->>'llamada_id')::bigint, 'ok', null, 0.001);
  j := ${RES(OTRO_ID)}; assert j ->> 'codigo' = 'tope_persona', 'gratis con US$0,60: no (US$0,50) ' || j::text;
  j := ${RES(COACH_ID, 'coach')}; assert (j ->> 'ok')::boolean, 'coach con US$2: sigue (US$5) ' || j::text;
  perform public.ia_cerrar((j->>'llamada_id')::bigint, 'ok', null, 0.001);
  perform set_config('request.jwt.claim.sub', '${COACH_ID}', true);
  e := public.ia_mi_estado(); assert (e #>> '{tope,plato}')::int = 10 and e ->> 'estado' = 'normal', 'coach: 10 por día ' || e::text;
  update public.ia_llamadas set usd = 1.499 where user_id = '${ALUMNO_ID}' and funcion = 'etiqueta';
  j := ${RES(ALUMNO_ID)}; assert j ->> 'codigo' = 'tope_persona', 'IA Plus con US$1,50: no ' || j::text;
  perform set_config('request.jwt.claim.sub', '${ALUMNO_ID}', true);
  e := public.ia_mi_estado(); assert e ->> 'estado' = 'tope_persona', 'mi estado: tope_persona ' || e::text;
end $$;
-- Con el interruptor apagado: el incluido (alumno de coach con plan) vuelve a 8; el que lo pagó, 10.
delete from public.ia_llamadas;
update public.ia_plus set mp_hasta = now() - interval '1 minute' where user_id = '${ALUMNO_ID}';
do $$ declare j jsonb; e jsonb; begin
  perform set_config('request.jwt.claim.sub', '${ALUMNO_ID}', true);
  e := public.ia_mi_estado(); assert (e #>> '{tope,plato}')::int = 10 and e #>> '{plus,estado}' = 'incluido', 'incluido, prendido: 10 ' || e::text;
  update public.ia_config set plus = plus || '{"activa": false}';
  e := public.ia_mi_estado(); assert (e #>> '{tope,plato}')::int = 8, 'incluido, apagado: 8 ' || e::text;
  for i in 1..8 loop ${USO(ALUMNO_ID)} end loop;
  j := ${RES(ALUMNO_ID)}; assert j ->> 'codigo' = 'tope_dia' and (j ->> 'tope')::int = 8, 'incluido, apagado: la 9.ª no ' || j::text;
  update public.ia_plus set mp_hasta = now() + interval '10 days' where user_id = '${ALUMNO_ID}';
  e := public.ia_mi_estado(); assert (e #>> '{tope,plato}')::int = 10, 'pagado, apagado: sigue con 10 ' || e::text;
  j := ${RES(ALUMNO_ID)}; assert (j ->> 'ok')::boolean, 'pagado, apagado: la 9.ª sí ' || j::text;
  update public.ia_config set plus = plus || '{"activa": true}';
end $$;
delete from public.ia_llamadas;
update public.coach_billing set paid_until = null, plan = 'trial', trial_ends_at = now() + interval '5 days' where coach_id = '${COACH_ID}';
-- El panel los cambia (y no acepta topes inventados).
${COMO(ADMIN_ID)}
do $$ begin
  begin perform public.admin_ia_config('{"topes": {"plus": {"rutina": 3}}}'); raise exception 'tope inventado'; exception when sqlstate '22023' then null; end;
  begin perform public.admin_ia_config('{"topes": {"plus": {"plato": 10.5}}}'); raise exception 'fotos con coma'; exception when sqlstate '22023' then null; end;
end $$;
select public.admin_ia_config('{"topes": {"plus": {"plato": 12, "usd_ciclo": 2}}}');
reset role;
do $$ begin assert (select topes -> 'plus' from public.ia_config) = '{"plato": 12, "usd_ciclo": 2}'::jsonb, 'topes de IA Plus cambiados'; end $$;
${COMO(OTRO_ID)}
do $$ declare e jsonb := public.ia_mi_estado(); begin assert (e #>> '{plus,plato_dia}')::int = 12, 'la oferta sigue al panel ' || e::text; end $$;
reset role;
update public.ia_config set topes = jsonb_set(topes, '{plus}', '{"plato": 10, "usd_ciclo": 1.5}');`],
  ['panel: dar y sacar IA Plus a mano, lista y resumen', `
${COMO(ADMIN_ID)}
do $$ declare l jsonb; e jsonb; begin
  begin perform public.admin_ia_plus_dar('nadie@x', current_date + 5, null); raise exception 'mail inexistente'; exception when sqlstate '22023' then null; end;
  begin perform public.admin_ia_plus_dar('d@x', current_date - 1, null); raise exception 'fecha pasada'; exception when sqlstate '22023' then null; end;
  l := public.admin_ia_plus_dar('D@X', current_date + 5, 'soporte: se le cortó');
  assert exists (select 1 from jsonb_array_elements(l) x where x ->> 'email' = 'd@x' and x ->> 'manual_nota' = 'soporte: se le cortó'), 'lista ' || l::text;
  e := public.admin_ia_estado();
  assert (e #>> '{plus_resumen,manual}')::int = 1 and (e #>> '{plus_resumen,mp}')::int = 1 and (e #>> '{plus,activa}')::boolean, 'resumen ' || (e -> 'plus_resumen')::text;
  assert (select count(*) from public.admin_audit where action = 'ia_plus_dar') = 1, 'queda en la auditoría';
end $$;
reset role;
do $$ declare j jsonb; begin ${USO(OTRO_ID)} end $$;
${COMO(ADMIN_ID)}
select public.admin_ia_plus_quitar('${OTRO_ID}');
reset role;
${COMO(OTRO_ID)}
do $$ declare e jsonb := public.ia_mi_estado(); begin assert e #>> '{plus,estado}' = 'gratis' and (e #>> '{plus,usados_semana}')::int = 1, 'sin el manual: vuelve a ser gratis ' || e::text; end $$;
reset role;`],
  ['desde la app: no lee ia_plus ni toca el panel; con la IA apagada igual ve lo suyo', `
${COMO(OTRO_ID)}
do $$ begin
  begin perform 1 from public.ia_plus; raise exception 'leyó ia_plus'; exception when insufficient_privilege then null; end;
  begin perform public.ia_plus_info('${ALUMNO_ID}'); raise exception 'leyó lo de otro'; exception when insufficient_privilege then null; end;
  begin perform public.admin_ia_plus_dar('d@x', current_date + 5, null); raise exception 'se dio IA Plus'; exception when insufficient_privilege then null; end;
  begin perform public.admin_ia_plus_lista(); raise exception 'vio la lista'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.ia_config set activa = false;
${COMO(ALUMNO_ID)}
do $$ declare e jsonb := public.ia_mi_estado(); begin
  assert (e ->> 'activa')::boolean = false and e #>> '{plus,estado}' = 'plus', 'IA apagada: igual dice lo de IA Plus ' || e::text;
end $$;
reset role;
update public.ia_config set activa = true;`],
  ['no se prende IA Plus con la IA de Comida apagada (apagar la IA con IA Plus prendido, sí)', `
${COMO(ADMIN_ID)}
select public.admin_ia_config('{"plus": {"activa": false}}');
select public.admin_ia_config('{"activa": false}');
do $$ begin
  begin perform public.admin_ia_config('{"plus": {"activa": true}}'); raise exception 'prendió IA Plus con la IA apagada'; exception when sqlstate '22023' then null; end;
end $$;
-- Sin la foto del plato no se prende (aunque el viejo «texto» siga prendido en la base).
select public.admin_ia_config('{"activa": true, "funciones": {"plato": false, "texto": true}}');
do $$ begin
  begin perform public.admin_ia_config('{"plus": {"activa": true}}'); raise exception 'prendió IA Plus sin la foto del plato'; exception when sqlstate '22023' then null; end;
end $$;
select public.admin_ia_config('{"funciones": {"plato": true, "texto": false}, "plus": {"activa": true}}');
select public.admin_ia_config('{"activa": false}');
reset role;
do $$ begin assert (select (plus ->> 'activa')::boolean and not activa from public.ia_config), 'apagar la IA con IA Plus prendido'; end $$;
update public.ia_config set activa = true;`],
  ['arrepentido hace poco: hasta cuándo no se puede volver a suscribir; quien se arrepintió 2 veces queda en la lista', `
update public.ia_plus set mp_hasta = now() - interval '200 days', ultimo_arrepentido_at = now() - interval '200 days', arrepentimientos = 2 where user_id = '${ALUMNO_ID}';
${COMO(ALUMNO_ID)}
do $$ declare e jsonb := public.ia_mi_estado(); begin assert e #> '{plus,espera_hasta}' = 'null'::jsonb, 'hace 200 días: sin espera ' || e::text; end $$;
reset role;
update public.ia_plus set ultimo_arrepentido_at = now() - interval '5 days' where user_id = '${ALUMNO_ID}';
${COMO(ALUMNO_ID)}
do $$ declare e jsonb := public.ia_mi_estado(); begin
  assert abs(extract(epoch from (e #>> '{plus,espera_hasta}')::timestamptz - (now() + interval '55 days'))) < 60, 'espera 60 días ' || e::text;
end $$;
reset role;
${COMO(ADMIN_ID)}
do $$ declare l jsonb := public.admin_ia_plus_lista(); begin
  assert exists (select 1 from jsonb_array_elements(l) x where x ->> 'user_id' = '${ALUMNO_ID}' and (x ->> 'arrepentimientos')::int = 2), 'en la lista ' || l::text;
end $$;
reset role;`],
  ['botón de arrepentimiento y de baja sin sesión: código, cuenta, tope por mail, panel', `
update auth.users set email = 'alumno@prueba.test' where id = '${ALUMNO_ID}';
do $$ declare j jsonb; m text := (select email from auth.users where id = '${ALUMNO_ID}'); begin
  j := public.pedido_baja('arrepentimiento', 'iaplus', upper(m), 'mp: x');
  assert (j ->> 'ok')::boolean and j ->> 'codigo' ~ '^GZ-[0-9A-F]{8}$' and (j ->> 'cuenta')::boolean, 'pedido ' || j::text;
  j := public.pedido_baja('baja', 'coach', 'nadie@nada.test', null);
  assert (j ->> 'ok')::boolean and not (j ->> 'cuenta')::boolean, 'sin cuenta ' || j::text;
  j := public.pedido_baja('otra', 'iaplus', m, null); assert j ->> 'codigo' = 'invalido', 'tipo ' || j::text;
  j := public.pedido_baja('baja', 'iaplus', 'no-es-mail', null); assert j ->> 'codigo' = 'invalido', 'mail ' || j::text;
  perform public.pedido_baja('baja', 'iaplus', m, null); perform public.pedido_baja('baja', 'iaplus', m, null);
  j := public.pedido_baja('baja', 'iaplus', m, null); assert j ->> 'codigo' = 'muchos', 'tope por mail ' || j::text;
end $$;
${COMO(OTRO_ID)}
do $$ begin
  begin perform public.pedido_baja('baja', 'iaplus', 'a@b.cd', null); raise exception 'pidió desde la app'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.pedidos_baja; raise exception 'leyó los pedidos'; exception when insufficient_privilege then null; end;
  begin perform public.admin_pedidos_baja(); raise exception 'vio los pedidos'; exception when insufficient_privilege then null; end;
end $$;
reset role;
${COMO(ADMIN_ID)}
do $$ declare l jsonb := public.admin_pedidos_baja(); i bigint; begin
  assert jsonb_array_length(l) = 4, 'lista ' || l::text;
  i := (l -> 0 ->> 'id')::bigint;
  l := public.admin_pedido_baja_atendido(i);
  assert exists (select 1 from jsonb_array_elements(l) x where (x ->> 'id')::bigint = i and x ->> 'atendido_at' is not null), 'atendido ' || l::text;
end $$;
reset role;`],
];
