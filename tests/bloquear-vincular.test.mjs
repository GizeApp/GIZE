// Vincularse con el código de un coach con un bloqueo de por medio (supabase/bloqueos.sql): si el
// alumno bloqueó al coach o el coach al alumno, join_coach no los vincula y dice «No podés sumarte
// con este código.» (no cuenta quién bloqueó a quién).
// a) La base: la versión vigente de join_coach está en bloqueos.sql, es la de coach-alumnos.sql
//    entera más el chequeo (antes de vincular y sin anotarlo como código equivocado), sin mandar a
//    renovar ni a ampliar el plan; los archivos con versiones viejas mandan a correr bloqueos.sql
//    después.
// b) La app muestra el aviso tal cual al vincularse en Configuración, en la web y en el iPhone.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newPage, wait, ALUMNO } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.existsSync(path.join(ROOT, f)) ? fs.readFileSync(path.join(ROOT, f), 'utf8') : '';
const MSG = 'No podés sumarte con este código.';
const MANDA = /renov|renuev|ampl[ií]|eleg[ií] un plan|pag[aá]/i;
const joinFn = sql => (sql.replace(/--[^\n]*/g, '').match(/create or replace function public\.join_coach\(code text\)[\s\S]*?end \$\$;/) || [''])[0];
const IOS = () => { window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {} }; };

export default async function ({ base, t }){
  // ===== a) La base =====
  const sql = read('supabase/bloqueos.sql');
  t.ok(!!sql, 'existe supabase/bloqueos.sql');
  const fn = joinFn(sql), viejo = joinFn(read('supabase/coach-alumnos.sql'));
  t.ok(fn.length > 500, 'bloqueos.sql define join_coach');
  t.ok(/security definer\s+set search_path = public/.test(fn), 'join_coach: security definer con search_path fijo');
  const chequeo = fn.search(/if public\.bloqueo_entre\(me, cid\) then\s+raise exception 'No podés sumarte con este código\.' using errcode = 'P0001';/);
  t.ok(chequeo > 0, 'join_coach: si uno bloqueó al otro, «No podés sumarte con este código.» (P0001)');
  t.ok(chequeo > fn.indexOf('if cid = me then return false;') && chequeo < fn.indexOf('update profiles set coach_id = cid'), 'el chequeo va con el coach encontrado y antes de vincular');
  t.ok(chequeo > fn.indexOf('insert into join_code_attempts'), 'un bloqueo no se anota como código equivocado');
  // La de coach-alumnos.sql entera (tope de códigos, plan y cupo): cada línea está igual.
  const lineas = viejo.split('\n').map(l => l.trim()).filter(Boolean);
  const faltan = lineas.filter(l => !fn.includes(l));
  t.ok(lineas.length > 20 && faltan.length === 0, 'join_coach de bloqueos.sql tiene todo lo de coach-alumnos.sql: falta ' + JSON.stringify(faltan));
  for (const m of [...fn.matchAll(/raise exception '([^']+)'/g)].map(m => m[1])) t.ok(!MANDA.test(m), 'join_coach: no manda a renovar ni a ampliar: ' + m);
  t.ok(/revoke execute on function public\.join_coach\(text\) from public, anon;/.test(sql) && /grant\s+execute on function public\.join_coach\(text\) to authenticated;/.test(sql), 'join_coach: solo usuarios con sesión');
  // Las cabeceras dicen cuál es la vigente y qué correr después.
  t.ok(/versión vigente de join_coach está en bloqueos\.sql/.test(read('supabase/coach-alumnos.sql').split('\n').slice(0, 12).join(' ')), 'coach-alumnos.sql: la vigente de join_coach está en bloqueos.sql');
  t.ok(/vigentes de join_coach/.test(sql.split('\n').slice(0, 20).join(' ')), 'bloqueos.sql: dice que tiene la vigente de join_coach');
  for (const f of ['supabase/suscripciones.sql', 'supabase/endurecer-base.sql', 'supabase/base.sql'])
    t.ok(/bloqueos\.sql/.test(read(f).split('\n').slice(0, 15).join('\n')), f + ': avisa que después hay que correr bloqueos.sql');

  // ===== b) La app muestra el aviso tal cual =====
  for (const [donde, init] of [['web', undefined], ['iPhone', IOS]]){
    const pedidos = [];
    const pg = await newPage({ user: ALUMNO, init, state: { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {} },
      handlers: { '/profiles': (r, J, i) => { if (i.m !== 'GET') return undefined; const me = { id: ALUMNO.id, role: 'client', full_name: 'Prueba', coach_id: null }; return J(i.one ? me : [me]); },
        '/rpc/join_coach': (r, J, i) => { pedidos.push(JSON.parse(i.body)); return J({ code: 'P0001', message: MSG, details: null, hint: null }, 400); } } });
    await pg.p.goto(base + '/app/'); await wait(2500);
    await pg.p.click('#nav-config'); await wait(500);
    await pg.p.fill('#joinCode', 'ABCD2345');
    await pg.p.click('[data-auth="join"]'); await wait(800);
    t.eq(pedidos, [{ code: 'ABCD2345' }], donde + ': pide join_coach con el código');
    t.eq(pg.dialogs[pg.dialogs.length - 1], MSG, donde + ': el aviso de la base, tal cual');
    t.eq(pg.errs, [], 'errores de la página (' + donde + ')');
    await pg.close();
  }
}
