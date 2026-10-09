// Eliminar la cuenta (Ajustes): la función borrar-audios borra los mensajes de voz y la
// cuenta, todo junto (así nadie puede llamarla para borrar los audios del otro sin irse).
// - Con la función nueva la app no llama aparte a delete_own_account.
// - Si todavía está publicada la función vieja (solo borraba audios), la app borra la cuenta
//   con delete_own_account como antes.
// - Si la función no deja (plan con renovación activa), se ve el motivo y la cuenta sigue.
// - La función borra los audios recién después de borrar la cuenta: si la cuenta no se borra,
//   los audios del otro siguen ahí. Y las llamadas a Apple tienen tiempo máximo.
// - Con la cuenta ya borrada no hay sesión para reintentar: las rutas se anotan en
//   audios_por_borrar y lo que no se llega a borrar (falla o la función se corta) lo borra un
//   cron cada hora. Antes quedaban para siempre sin dueño.
// - Se sacan de la cola de a 50: con 100 rutas el pedido pasaba de 8.000 caracteres.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { newPage, wait, ALUMNO, profile } from './lib.mjs';
import { funcion, supabaseSimulado } from './funcion.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function run(base, fn){
  const r = await newPage({ user: ALUMNO, state: { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {} },
    handlers: { '/profiles': profile('client'), '/functions/v1/borrar-audios': fn } });
  r.p.dialogAnswer = 'ELIMINAR';
  await r.p.goto(base + '/app/'); await wait(2500);
  await r.p.click('#nav-config'); await wait(500);
  await r.p.click('[data-action="cfg-delete-account"]'); await wait(1500);
  r.fn = r.calls.filter(c => c.endsWith('/functions/v1/borrar-audios')).length;
  r.rpc = r.calls.filter(c => c.endsWith('/rpc/delete_own_account')).length;
  return r;
}

export default async function ({ base, t }){
  {
    const { dialogs, errs, fn, rpc, close } = await run(base, (x, J) => J({ removed: 2, deleted: true }));
    t.eq(fn, 1, 'función nueva: llama a borrar-audios');
    t.eq(rpc, 0, 'función nueva: no llama aparte a delete_own_account');
    t.ok(dialogs.includes('Tu cuenta fue eliminada.'), 'función nueva: avisa que se eliminó: ' + JSON.stringify(dialogs));
    t.eq(errs, [], 'función nueva: errores de la página');
    await close();
  }
  {
    const { dialogs, errs, fn, rpc, close } = await run(base, (x, J) => J({ removed: 2 }));
    t.eq(fn, 1, 'función vieja: llama a borrar-audios');
    t.eq(rpc, 1, 'función vieja: la cuenta se borra con delete_own_account');
    t.ok(dialogs.includes('Tu cuenta fue eliminada.'), 'función vieja: avisa que se eliminó: ' + JSON.stringify(dialogs));
    t.eq(errs, [], 'función vieja: errores de la página');
    await close();
  }
  {
    const { dialogs, errs, rpc, close } = await run(base, (x, J) => J({ error: 'Primero cancelá la renovación de tu plan' }, 409));
    t.eq(rpc, 0, 'si la función no deja, no se borra la cuenta por otro lado');
    t.ok(dialogs.some(d => d.includes('No se pudo eliminar la cuenta') && d.includes('Primero cancelá la renovación')), 'se ve el motivo: ' + JSON.stringify(dialogs));
    t.ok(!dialogs.includes('Tu cuenta fue eliminada.'), 'no dice que se eliminó');
    t.eq(errs, [], 'con error: errores de la página');
    await close();
  }
  {
    const src = fs.readFileSync(path.join(ROOT, 'supabase/functions/borrar-audios/index.ts'), 'utf8');
    t.ok(!/\.remove\(/.test(src) && (src.match(/await borrar\(/g) || []).length === 2, 'borrar-audios: los audios se borran solo con borrar() (cola.ts): al eliminar la cuenta y en el cron');
    const apple = src.slice(src.indexOf('async function revokeApple'), src.indexOf('Deno.serve('));
    t.ok(/fetch\("https:\/\/appleid\.apple\.com\/auth\/"[\s\S]*signal: AbortSignal\.timeout\(\d+\)/.test(apple), 'borrar-audios: las llamadas a Apple tienen tiempo máximo');

    // La tabla y el cron.
    const sql = fs.readFileSync(path.join(ROOT, 'supabase/borrar-audios.sql'), 'utf8');
    t.ok(/create table if not exists public\.audios_por_borrar \(/.test(sql) && /alter table public\.audios_por_borrar enable row level security;/.test(sql) && /revoke all on public\.audios_por_borrar from anon, authenticated;/.test(sql), 'borrar-audios.sql: la cola, sin acceso desde la app');
    t.ok(/select cron\.unschedule\('gize-audios-por-borrar'\) where exists/.test(sql) && /url := 'https:\/\/[a-z0-9]+\.supabase\.co\/functions\/v1\/borrar-audios\?cola=1'/.test(sql)
      && /'x-cron-secret', public\.cron_secret\(\)/.test(sql) && /where exists \(select 1 from public\.audios_por_borrar\);/.test(sql), 'borrar-audios.sql: el cron llama a la función solo si hay algo anotado (re-ejecutable)');
  }

  // ---- borrar-audios de verdad (tests/funcion.mjs): el orden y el cron ----
  // El usuario es coach (carpeta con un alumno y los audios de ejercicios) y fue alumno de otros
  // dos coaches (el actual y uno que aparece en sus mensajes).
  const YO = 'aaaaaaaa-0000-4000-8000-000000000001', C1 = 'bbbbbbbb-0000-4000-8000-000000000002', C2 = 'cccccccc-0000-4000-8000-000000000003';
  const correr = async ({ borraCuenta = true, renueva = false, cola = null, secreto = null } = {}) => {
    const pasos = [], removidas = [];
    const carpetas = { [YO]: [{ name: 'k1', id: null }, { name: 'ex', id: null }], [YO + '/k1']: [{ name: 'a.webm', id: '1' }], [YO + '/ex']: [{ name: 'e.webm', id: '2' }],
      [C1 + '/' + YO]: [{ name: 'b.webm', id: '3' }], [C2 + '/' + YO]: [{ name: 'c.webm', id: '4' }] };
    const db = supabaseSimulado(q => {
      if (q.bucket && q.accion === 'list'){ pasos.push('listar'); return { data: carpetas[q.prefijo] || [] }; }
      if (q.bucket && q.accion === 'remove'){ pasos.push('borrar audios'); removidas.push(...q.valores); return { data: q.valores }; }
      if (q.tabla === 'coach_billing') return { data: renueva ? { mp_preapproval_id: 'X', mp_status: 'authorized' } : null };
      if (q.tabla === 'profiles') return { data: { coach_id: C1 } };
      if (q.tabla === 'coach_messages') return { data: [{ coach_id: C2 }] };
      if (q.tabla === 'delete_own_account'){ pasos.push('borrar cuenta'); return borraCuenta ? { data: null } : { error: { code: 'P0001', message: 'Primero cancelá la renovación' } }; }
      if (q.tabla === 'audios_por_borrar'){
        pasos.push((q.accion === 'select' ? 'leer' : q.accion === 'upsert' ? 'anotar' : 'sacar') + ' cola');
        return q.accion === 'select' ? { data: (cola || []).map(path => ({ path })) } : { data: null };
      }
      return { data: null };
    }, { user: { id: YO, identities: [] } });
    const fn = await funcion('borrar-audios', { env: { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'srv', ...(secreto ? { CRON_SECRET: secreto } : {}) },
      npm: { '@supabase/supabase-js': { createClient: () => db } } });
    const url = 'https://x.supabase.co/functions/v1/borrar-audios' + (cola ? '?cola=1' : '');
    const r = await fn.call(new Request(url, { method: 'POST', headers: cola ? { 'x-cron-secret': 'otro' } : { Authorization: 'Bearer x' } }));
    const res = { status: r.status, body: await r.json(), pasos: [...new Set(pasos)], removidas: removidas.slice() };
    if (cola) {
      const r2 = await fn.call(new Request(url, { method: 'POST', headers: { 'x-cron-secret': secreto } }));
      res.conSecreto = { status: r2.status, body: await r2.json(), removidas: removidas.slice() };
    }
    return res;
  };
  {
    let x = await correr();
    t.eq(x.body, { removed: 4, deleted: true }, 'borrar-audios: borra la cuenta y sus 4 audios');
    t.eq(x.pasos, ['listar', 'borrar cuenta', 'anotar cola', 'borrar audios', 'sacar cola'], 'borrar-audios: junta las rutas, borra la cuenta, las anota en la cola, borra los audios y los saca de la cola');
    t.eq(x.removidas.sort(), [C1 + '/' + YO + '/b.webm', C2 + '/' + YO + '/c.webm', YO + '/ex/e.webm', YO + '/k1/a.webm'].sort(), 'borrar-audios: su carpeta de coach y sus conversaciones con cada coach que tuvo');
    x = await correr({ borraCuenta: false });
    t.ok(x.status === 409 && x.pasos.join() === 'listar,borrar cuenta' && x.removidas.length === 0, 'borrar-audios: si la cuenta no se borra, vuelve sin anotar ni borrar audios: ' + x.pasos);
    x = await correr({ renueva: true });
    t.ok(x.status === 409 && x.pasos.length === 0, 'borrar-audios: con la renovación activa no toca nada');
    x = await correr({ cola: ['p/q/1.webm', 'p/q/2.webm'], secreto: 'cron-prueba' });
    t.ok(x.status === 401 && x.removidas.length === 0, 'borrar-audios: el cron con otro secreto no borra nada');
    t.ok(x.conSecreto.status === 200 && x.conSecreto.body.removed === 2 && x.conSecreto.removidas.join() === 'p/q/1.webm,p/q/2.webm', 'borrar-audios: el cron borra lo anotado en la cola: ' + JSON.stringify(x.conSecreto));
  }

  // La cola, con un Supabase simulado.
  let m = null;
  try { m = await import(pathToFileURL(path.join(ROOT, 'supabase/functions/borrar-audios/cola.ts')).href); }
  catch (e) { t.ok(false, 'no se pudo cargar borrar-audios/cola.ts: ' + (e && e.message ? e.message.split('\n')[0] : e)); }
  if (m){
    const fake = ({ falla = () => false, anotarFalla = false } = {}) => {
      const cola = new Set(), upserts = [], tandas = [], borrados = [], sacadas = [];
      const db = {
        from: (tabla) => ({
          upsert: async (rows, opt) => { upserts.push([tabla, rows.length, opt && opt.onConflict]); if (anotarFalla) return { error: { message: 'sin tabla' } }; rows.forEach(r => cola.add(r.path)); return { error: null }; },
          delete: () => ({ in: async (col, vals) => { sacadas.push(vals.slice()); vals.forEach(v => cola.delete(v)); return { error: null }; } }),
        }),
        storage: { from: (b) => ({ remove: async (paths) => { tandas.push([b, paths.length]); if (falla(paths)) return { data: null, error: new Error('Storage no contesta') }; borrados.push(...paths); return { data: paths, error: null }; } }) },
      };
      return { db, cola, upserts, tandas, borrados, sacadas };
    };
    const rutas = Array.from({ length: 250 }, (_, i) => 'c0/a1/audio' + String(i).padStart(4, '0') + '.webm');
    const err = console.error; console.error = () => {};
    try {
      // Todo bien: se anota, se borra y la cola queda vacía.
      let f = fake();
      t.ok(await m.anotar(f.db, rutas), 'anotar: anota las rutas');
      t.eq(f.cola.size, 250, 'anotar: quedan todas en la cola');
      t.eq(await m.borrar(f.db, 'chat-audio', rutas), 250, 'borrar: borra todas');
      t.eq([f.tandas.length, f.cola.size], [5, 0], 'borrar: de a 50 y la cola queda vacía');
      // Falla la tercera tanda: esas 50 quedan anotadas para el cron.
      f = fake({ falla: (p) => p[0] === rutas[100] });
      await m.anotar(f.db, rutas);
      t.eq(await m.borrar(f.db, 'chat-audio', rutas), 200, 'si falla una tanda, sigue con las demás');
      t.eq([...f.cola], rutas.slice(100, 150), 'la tanda que falló queda en la cola (antes se perdía)');
      // El cron la vuelve a pasar y ahora anda.
      const pendientes = [...f.cola];
      f.tandas.length = 0;
      const g = fake(); pendientes.forEach(p => g.cola.add(p));
      t.eq(await m.borrar(g.db, 'chat-audio', pendientes), 50, 'el cron borra lo que quedó');
      t.eq(g.cola.size, 0, 'y lo saca de la cola');
      // Rutas de verdad (coach/alumno/nombre: 111 caracteres): sacarlas de la cola va con las rutas
      // en la dirección del pedido, como lo arma supabase-js (path=in.(a,b,…)). Con 100 por tanda
      // eran casi 12.000 caracteres; supabase-js avisa desde 8.000 y el servidor lo puede rechazar
      // (los audios se borraban pero quedaban anotados para siempre).
      const uuid = (i) => '0000000' + (i % 10) + '-aaaa-4bbb-8ccc-' + String(i).padStart(12, '0');
      const largas = Array.from({ length: 400 }, (_, i) => uuid(i) + '/' + uuid(i + 1) + '/' + String(i).padStart(32, 'f') + '.webm');
      t.eq(largas[0].length, 111, 'ruta de 111 caracteres');
      f = fake();
      await m.anotar(f.db, largas);
      t.eq(await m.borrar(f.db, 'chat-audio', largas), 400, 'rutas largas: borra todas');
      const url = (vals) => ('https://abcdefghijklmnopqrst.supabase.co/rest/v1/audios_por_borrar?' + new URLSearchParams({ path: 'in.(' + vals.join(',') + ')' })).length;
      const mayor = Math.max(...f.sacadas.map(url));
      t.ok(f.sacadas.length > 0 && mayor < 8000, 'rutas largas: cada pedido para sacarlas de la cola tiene menos de 8.000 caracteres (el mayor: ' + mayor + ')');
      t.eq(f.cola.size, 0, 'rutas largas: la cola queda vacía');
      // Muchos audios: se anotan de a 1000.
      f = fake();
      const muchas = Array.from({ length: 2500 }, (_, i) => 'c0/ex/x' + String(i).padStart(5, '0') + '.webm');
      await m.anotar(f.db, muchas);
      t.eq(f.upserts.map(u => u[1]), [1000, 1000, 500], 'anotar: de a 1000');
      t.ok(f.upserts.every(u => u[0] === 'audios_por_borrar' && u[2] === 'path'), 'anotar: en audios_por_borrar, sin repetir');
      // Sin la tabla (falta el SQL): no anota, pero los audios se borran igual.
      f = fake({ anotarFalla: true });
      t.ok(!(await m.anotar(f.db, rutas)) && f.upserts.length === 1, 'sin la tabla: avisa que no anotó y no insiste');
      t.eq(await m.borrar(f.db, 'chat-audio', rutas), 250, 'sin la tabla: los audios se borran igual');
    } finally { console.error = err; }
  }
}
