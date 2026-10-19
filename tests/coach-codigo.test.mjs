// Código de invitación del coach (supabase/coach-alumnos.sql): join_coach con tope de códigos
// equivocados por persona (antes, con los códigos viejos de 6 caracteres, una cuenta podía
// probarlos todos y quedar vinculada al coach de otro o llenarle el cupo).
// a) La base: tabla de intentos sin acceso directo, tope de 10 por hora y 20 por día, un pedido a
//    la vez por persona, plan y cupo como antes, re-ejecutable, y los archivos con versiones
//    viejas de join_coach mandan a correr coach-alumnos.sql después. Los códigos viejos siguen
//    sirviendo (no se filtra por largo).
// b) El aviso del tope llega tal cual al alumno, también en el iPhone (no habla del plan).
// c) El coach con código viejo ve que le conviene cambiarlo; con el código nuevo, no.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newPage, wait } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const IOS = `(() => { window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {} }; })();`;
const COACH = { id: '33333333-3333-3333-3333-333333333333', email: 'coach@prueba.test', aud: 'authenticated', role: 'authenticated', created_at: new Date().toISOString() };
const VIEJO = 'Es un código del formato anterior, más corto y fácil de adivinar: te conviene cambiarlo.';

function coachPage(code){
  const me = { id: COACH.id, role: 'coach', full_name: 'Coach Prueba' };
  return newPage({ user: COACH, handlers: {
    '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; if (/coach_id=eq/.test(i.url.search)) return J([]); return J(i.one ? me : [me]); },
    '/coach_billing': (r, J, i) => { const b = { coach_id: COACH.id, plan: 'trial', max_clients: 10, trial_ends_at: new Date(Date.now() + 3 * 864e5).toISOString() }; return J(i.one ? b : [b]); },
    '/rpc/my_invite_code': (r, J) => J(code),
  } });
}

export default async function ({ base, t }){
  // ===== a) La base =====
  const sql = read('supabase/coach-alumnos.sql');
  const fn = (sql.match(/create or replace function public\.join_coach\(code text\)[\s\S]*?end \$\$;/) || [''])[0];
  t.ok(!!fn, 'coach-alumnos.sql define join_coach');
  t.ok(/security definer\s+set search_path = public/.test(fn), 'join_coach: security definer con search_path fijo');
  t.ok(/create table if not exists public\.join_code_attempts/.test(sql) && /alter table public\.join_code_attempts enable row level security/.test(sql) && /revoke all on public\.join_code_attempts from anon, authenticated/.test(sql), 'intentos: tabla re-ejecutable, con RLS y sin acceso directo');
  t.ok(/perform pg_advisory_xact_lock\(hashtext\('join_coach'\), hashtext\(me::text\)\)/.test(fn), 'un pedido a la vez por persona (varios juntos no se saltean el tope)');
  t.ok(/>= 20/.test(fn) && /interval '1 hour'\) >= 10/.test(fn) && /raise exception 'Probaste muchos códigos que no existen\.[^']*' using errcode = 'P0001'/.test(fn), 'tope: 10 por hora y 20 por día, con mensaje propio (P0001)');
  t.ok(/if cid is null then\s*(--[^\n]*\n\s*)?insert into join_code_attempts \(user_id\) values \(me\);\s*return false;/.test(fn), 'cada código que no existe queda anotado (y sale con return, no con raise)');
  const tope = fn.indexOf('Probaste muchos'), busca = fn.indexOf('where invite_code = upper(trim(code))');
  t.ok(tope > 0 && busca > tope, 'el tope se mira antes de buscar el código (con el tope, ni el correcto)');
  t.ok(/public\.coach_active\(cid\)/.test(fn) && /for update/.test(fn) && /n >= coalesce\(lim, 10\)/.test(fn), 'sigue mirando el plan y el cupo del coach');
  t.ok(!/length\(/.test(fn), 'los códigos viejos de 6 caracteres siguen sirviendo');
  t.ok(/grant\s+execute on function public\.join_coach\(text\)\s+to authenticated/.test(sql) && /revoke execute on function public\.join_coach\(text\)\s+from public, anon/.test(sql), 'solo usuarios logueados');
  t.ok(/Se puede correr varias veces/.test(sql) && !/drop table/i.test(sql), 'se puede volver a correr');
  t.ok(/select 'Coach con código viejo' as revisar/.test(sql) && /char_length\(invite_code\) < 8/.test(sql), 'al final cuenta los coaches con código viejo (sin datos: el log es público)');
  for (const f of ['supabase/suscripciones.sql', 'supabase/endurecer-base.sql', 'supabase/base.sql'])
    t.ok(/coach-alumnos\.sql/.test(read(f).split('\n').slice(0, 15).join('\n')), f + ': avisa que después hay que correr coach-alumnos.sql');

  // ===== b) El aviso del tope, tal cual (también en el iPhone) =====
  const msg = (fn.match(/'(Probaste muchos[^']*)'/) || [])[1] || '';
  {
    const pg = await newPage({ init: IOS });
    await pg.p.goto(base + '/app/'); await wait(1500);
    const m = await pg.p.evaluate(async s => (await import('/app/core/tienda.js')).joinMsgTienda(s), msg);
    t.eq(m, msg, 'iPhone: el aviso del tope llega tal cual (no habla del plan)');
    await pg.close();
  }

  // ===== c) El coach con código viejo =====
  for (const [code, viejo] of [['A1B2C3', true], ['ABCD2345', false]]){
    const pg = await coachPage(code);
    await pg.p.goto(base + '/app/'); await wait(3000);
    const onb = await pg.p.$('[data-onb="done"]'); if (onb) { await onb.click(); await wait(400); }
    const box = await pg.p.evaluate(() => { const e = document.querySelector('.co-invite'); return e ? e.textContent.replace(/\s+/g, ' ') : ''; });
    t.has(box, code, 'c) se ve el código ' + code);
    t.ok(box.includes(VIEJO) === viejo, 'c) ' + code + (viejo ? ': sugiere cambiarlo' : ': sin aviso') + ': ' + box);
    t.ok(!!(await pg.p.$('.co-invite [data-coach="rotate-invite"]')), 'c) con «Cambiar código»');
    t.eq(pg.errs, [], 'c) errores (' + code + ')');
    await pg.close();
  }
}
