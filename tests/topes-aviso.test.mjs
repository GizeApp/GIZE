// Al llegar a un tope de Storage (supabase/topes-archivos.sql: audios, fotos de los pedidos y
// foto de perfil), la base rechaza la subida con 403 / «row-level security». Antes la app decía
// «Revisá la conexión», que no era el problema (un coach con muchos alumnos puede llegar a los
// 300 audios). Ahora dice que llegó al límite de hoy; sin señal sigue diciendo lo de la conexión.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newPage, wait, ALUMNO, profile } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
const IMG = path.join(ROOT, 'icon-192.png');
// Lo que contesta Storage cuando una política no deja subir (HTTP 400 con statusCode 403).
const RLS = { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' };
const state = { days: [{ id: 'd1', name: 'A', exercises: [] }], sessions: [], weights: [], daily: {}, calTarget: 2000 };
const storage = (p, bucket, get) => p.route(new RegExp('supabase\\.co/storage/v1/object/' + bucket + '/'), r => {
  const m = get(); if (m === 'red') return r.abort('failed');
  return r.fulfill({ status: m === 'tope' ? 400 : 200, contentType: 'application/json', body: JSON.stringify(m === 'tope' ? RLS : { Key: 'x' }) });
});

export default async function ({ base, t }){
  // 1) Audios (chat y explicaciones de los ejercicios comparten uploadAudio).
  {
    let mode = 'ok';
    const { p, errs, close } = await newPage({ user: ALUMNO, state, handlers: { '/profiles': profile('client') } });
    await storage(p, 'chat-audio', () => mode);
    await p.goto(base + '/app/'); await wait(2500);
    const up = m => { mode = m; return p.evaluate(async () => { const g = await import('/app/ui/grabar.js');
      return g.uploadAudio('a/b/audio1234.webm', new Blob(['x'], { type: 'audio/webm' }), 'audio/webm'); }); };
    t.eq(await up('ok'), '', 'audio: se sube');
    t.eq(await up('tope'), 'Llegaste al límite de audios por hoy. Probá mañana.', 'audio: al llegar al tope lo dice');
    t.eq(await up('red'), 'No se pudo subir el audio. Revisá la conexión.', 'audio: sin señal, lo de la conexión');
    t.eq(errs, [], 'errores de la página (audios)');
    await close();
  }
  t.ok(/const err = await uploadAudio\(path, blob, type\);[\s\S]{0,120}if\(err\)\{\s*local\.pending = false; local\.failed = err;/.test(read('app/ui/chat.js')), 'chat: muestra lo que devuelve la subida');
  t.ok(/const err = await uploadAudio\(path, blob, type\);[\s\S]{0,40}if\(err\)\{ renderCoach\(\); alert\(err === AUDIO_CUPO \? err : "No se pudo subir el audio\. Revisá la conexión y probá de nuevo\."\); return; \}/.test(read('app/screens/coach/audio-ej.js')),
    'explicación de voz: al llegar al tope lo dice');

  // 2) Fotos de un pedido de producto.
  {
    const { p, errs, dialogs, close } = await newPage({ user: ALUMNO, state, handlers: { '/profiles': profile('client') } });
    await storage(p, 'productos', () => 'tope');
    await p.goto(base + '/app/'); await wait(3000);
    await p.click('#nav-comida'); await wait(400);
    await p.click('[data-action="search-open"]'); await wait(300);
    await p.fill('#foodSearch', 'yogur griego'); await wait(600);
    await p.click('[data-action="rq-open"]'); await wait(300);
    await p.fill('[data-field="brand"]', 'Ser');
    await p.setInputFiles('[data-action="rq-photo"][data-k="label"]:not([capture])', IMG); await wait(400);
    await p.click('[data-action="rq-send"]'); await wait(1500);
    t.has(dialogs.join(' | '), 'Llegaste al límite de fotos por hoy. Probá mañana.', 'pedido: al llegar al tope de fotos lo dice');
    t.ok(!/conexión/.test(dialogs.join(' | ')), 'pedido: no culpa a la conexión: ' + dialogs.join(' | '));
    t.eq(errs, [], 'errores de la página (pedido)');
    await close();
  }

  // 3) Foto de perfil.
  {
    const { p, errs, dialogs, close } = await newPage({ user: ALUMNO, state, handlers: { '/profiles': profile('client') } });
    await storage(p, 'avatars', () => 'tope');
    await p.goto(base + '/app/'); await wait(2500);
    await p.click('#nav-config'); await wait(500);
    await p.setInputFiles('[data-action="avatar-pick"]', IMG); await wait(600);
    await p.click('.crp-ok'); await wait(1200);
    t.eq(dialogs, ['Llegaste al límite de fotos por hoy. Probá mañana.'], 'foto de perfil: al llegar al tope lo dice');
    t.eq(errs, [], 'errores de la página (foto de perfil)');
    await close();
  }
}
