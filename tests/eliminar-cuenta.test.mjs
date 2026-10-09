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
    const rpc = src.indexOf('asUser.rpc("delete_own_account")'), cola = src.indexOf('await anotar(admin, paths);'), rm = src.indexOf('await borrar(admin, BUCKET, paths);');
    t.ok(rpc > 0 && cola > rpc && rm > cola, 'borrar-audios: después de borrar la cuenta, anota las rutas en la cola y borra los audios');
    t.ok(!/\.remove\(/.test(src) && (src.match(/await borrar\(/g) || []).length === 2, 'borrar-audios: los audios se borran solo con borrar() (cola.ts): ahí y en el cron');
    const cron = src.slice(src.indexOf('if (new URL(req.url).searchParams.get("cola")) {'), src.indexOf('const asUser = createClient('));
    t.ok(cron.length > 50 && /if \(!cronOk\(req\)\) return json\([^;]*401\);/.test(cron) && /await db\.from\("audios_por_borrar"\)\.select\("path"\)/.test(cron)
      && /return json\(\{ removed: await borrar\(db, BUCKET, \(data \|\| \[\]\)\.map\(\(r\) => r\.path\)\) \}\);/.test(cron), 'borrar-audios: el cron (?cola=1) borra solo lo anotado en audios_por_borrar');
    t.ok(src.lastIndexOf('await files(') < rpc && src.lastIndexOf('await subfolders(') < rpc, 'borrar-audios: las rutas se juntan antes (después ya no está la cuenta para saber cuáles son)');
    t.ok(/if \(de\) \{[^}]*return json\(/.test(src.slice(rpc, rm)), 'borrar-audios: si la cuenta no se borra, vuelve sin tocar los audios');
    const apple = src.slice(src.indexOf('async function revokeApple'), src.indexOf('Deno.serve('));
    t.ok(/fetch\("https:\/\/appleid\.apple\.com\/auth\/"[\s\S]*signal: AbortSignal\.timeout\(\d+\)/.test(apple), 'borrar-audios: las llamadas a Apple tienen tiempo máximo');

    // La tabla y el cron.
    const sql = fs.readFileSync(path.join(ROOT, 'supabase/borrar-audios.sql'), 'utf8');
    t.ok(/create table if not exists public\.audios_por_borrar \(/.test(sql) && /alter table public\.audios_por_borrar enable row level security;/.test(sql) && /revoke all on public\.audios_por_borrar from anon, authenticated;/.test(sql), 'borrar-audios.sql: la cola, sin acceso desde la app');
    t.ok(/select cron\.unschedule\('gize-audios-por-borrar'\) where exists/.test(sql) && /url := 'https:\/\/[a-z0-9]+\.supabase\.co\/functions\/v1\/borrar-audios\?cola=1'/.test(sql)
      && /'x-cron-secret', public\.cron_secret\(\)/.test(sql) && /where exists \(select 1 from public\.audios_por_borrar\);/.test(sql), 'borrar-audios.sql: el cron llama a la función solo si hay algo anotado (re-ejecutable)');
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
