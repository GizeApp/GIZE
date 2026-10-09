// Eliminar la cuenta (Ajustes): la función borrar-audios borra los mensajes de voz y la
// cuenta, todo junto (así nadie puede llamarla para borrar los audios del otro sin irse).
// - Con la función nueva la app no llama aparte a delete_own_account.
// - Si todavía está publicada la función vieja (solo borraba audios), la app borra la cuenta
//   con delete_own_account como antes.
// - Si la función no deja (plan con renovación activa), se ve el motivo y la cuenta sigue.
// - La función borra los audios recién después de borrar la cuenta: si la cuenta no se borra,
//   los audios del otro siguen ahí. Y las llamadas a Apple tienen tiempo máximo.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
    const rpc = src.indexOf('asUser.rpc("delete_own_account")'), rm = src.indexOf('st.remove(');
    t.ok(rpc > 0 && rm > rpc && src.indexOf('st.remove(', rm + 1) < 0, 'borrar-audios: los audios se borran después de borrar la cuenta (y en ningún otro lado)');
    t.ok(src.lastIndexOf('await files(') < rpc && src.lastIndexOf('await subfolders(') < rpc, 'borrar-audios: las rutas se juntan antes (después ya no está la cuenta para saber cuáles son)');
    t.ok(/if \(de\) \{[^}]*return json\(/.test(src.slice(rpc, rm)), 'borrar-audios: si la cuenta no se borra, vuelve sin tocar los audios');
    const apple = src.slice(src.indexOf('async function revokeApple'), src.indexOf('Deno.serve('));
    t.ok(/fetch\("https:\/\/appleid\.apple\.com\/auth\/"[\s\S]*signal: AbortSignal\.timeout\(\d+\)/.test(apple), 'borrar-audios: las llamadas a Apple tienen tiempo máximo');
  }
}
