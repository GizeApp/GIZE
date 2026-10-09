// Freno de 30 mensajes por minuto del chat (supabase/functions/notificar-cliente, publicada
// como rapid-worker). El freno cuenta los mensajes guardados; antes el mensaje se guardaba
// DESPUÉS de mandar los avisos, así que uno que no se podía guardar (texto con un carácter
// nulo, id del alumno en mayúsculas) avisaba igual al celular del otro sin contar, y un error
// al contar dejaba pasar todo. Ahora:
// - se guarda antes de mandar los avisos (si no se guarda, no sale ningún aviso);
// - si no se puede contar, no se manda; y la base cuenta y guarda junto (chat_guardar, de a uno
//   por conversación y lado), así el que se pasa de 30 no se guarda. Antes se guardaba, se
//   contaba de nuevo y se borraba, pero ya le había llegado en vivo al chat abierto del otro;
// - se usa el id del alumno como está en la base y el texto se limpia como en contacto;
// - cada envío (web, Android, iPhone) tiene tiempo máximo y van en paralelo.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export default async function ({ t }){
  const src = fs.readFileSync(path.join(ROOT, 'supabase/functions/notificar-cliente/index.ts'), 'utf8');
  const h = src.slice(src.indexOf('Deno.serve('));
  const ins = h.indexOf('admin.rpc("chat_guardar", {');
  const push = h.indexOf('webpush.sendNotification('), fcm = h.indexOf('fetch("https://fcm.googleapis.com/v1/'), apns = h.indexOf('fetch("https://api.push.apple.com/');
  t.ok(ins > 0 && push > ins && fcm > ins && apns > ins, 'el mensaje se guarda antes de mandar los avisos');
  t.ok(/if \(saveErr \|\| !saved\) \{[\s\S]*?return json\(\{ error: "No se pudo guardar el mensaje\. Probá de nuevo\." \}, 500\);/.test(h.slice(ins, push)), 'si no se guarda, no manda avisos y contesta error');
  t.ok(!/saved: !saveErr/.test(h) && /saved: true, id: saved\.id/.test(h), 'ya no contesta «llegó pero no se guardó»');
  t.ok(/\.update\(\{ delivered \}\)\.eq\("id", saved\.id\)/.test(h), 'después anota a cuántos dispositivos llegó');

  // El conteo.
  t.ok(/const \{ count, error \} = await admin\.from\("coach_messages"\)\.select\("id", \{ count: "exact", head: true \}\)/.test(h) && /return error \? null : \(count \|\| 0\);/.test(h), 'el conteo devuelve null si falla');
  t.ok(/if \(before === null\) return json\([^;]*503\);/.test(h) && /if \(before >= 30\) return json\([^;]*429\);/.test(h), 'antes de guardar: si no se pudo contar, no se manda; con 30, se frena');
  t.ok(/p_coach: coachId, p_client: cid, p_sender: sender, p_body: body,\s*p_audio_path: audioPath, p_audio_secs: audioPath \? audioSecs : null, p_tope: 30,/.test(h), 'guarda con chat_guardar, con el tope de 30');
  t.ok(/if \(!saveErr && !saved\) return json\(\{ error: "Mandaste muchos mensajes seguidos\. Esperá un minuto\." \}, 429\);/.test(h.slice(ins, push)), 'si la base no lo guardó por el tope, contesta 429 sin avisar');
  // Sin el SQL nuevo todavía (la función no existe): como antes.
  const viejo = h.slice(h.indexOf('if (saveErr && (saveErr.code === "PGRST202"'), push);
  t.ok(viejo.length > 0 && viejo.length < h.length && /\.from\("coach_messages"\)\.insert\(/.test(viejo) && /const after = saved \? await recent\(\) : 0;/.test(viejo)
    && /await admin\.from\("coach_messages"\)\.delete\(\)\.eq\("id", saved\.id\);/.test(viejo), 'sin chat_guardar (falta el SQL) guarda, cuenta de nuevo y borra el que se pasa, como antes');
  t.eq((h.match(/\.from\("coach_messages"\)\.(insert|delete)\(/g) || []).length, 2, 'insert y delete directos solo en ese caso');

  // La función de la base: cuenta y guarda junto, de a uno por conversación y lado.
  const sql = fs.readFileSync(path.join(ROOT, 'supabase/chat.sql'), 'utf8');
  const fn = sql.slice(sql.indexOf('create or replace function public.chat_guardar('), sql.indexOf('end $$;', sql.indexOf('create or replace function public.chat_guardar(')));
  t.ok(fn.length > 100, 'chat.sql: está chat_guardar');
  const lock = fn.indexOf('perform pg_advisory_xact_lock(hashtext(\'chat:\' || p_coach::text || \':\' || p_client::text), hashtext(p_sender));');
  const cuenta = fn.search(/if \(select count\(\*\) from public\.coach_messages m\s+where m\.coach_id = p_coach and m\.client_id = p_client and m\.sender = p_sender\s+and m\.created_at >= now\(\) - interval '1 minute'\) >= p_tope then\s+return;/);
  const guarda = fn.indexOf('insert into public.coach_messages');
  t.ok(lock > 0 && cuenta > lock && guarda > cuenta, 'chat_guardar: primero espera su turno, después cuenta y recién ahí guarda');
  t.ok(/revoke all on function public\.chat_guardar\([^)]*\) from public, anon, authenticated;/.test(sql) && /grant execute on function public\.chat_guardar\([^)]*\) to service_role;/.test(sql), 'chat_guardar: solo la usa la función (service role)');
  t.ok(!/security definer/.test(fn), 'chat_guardar: corre con los permisos del que la llama');
  t.ok(!/\(recent \|\| 0\) >= 30/.test(h), 'sin el conteo que tomaba un error como cero');

  // El id del alumno y el texto.
  t.ok(/const cid: string = client\.id;/.test(h) && /const fromClient = me === cid;/.test(h), 'usa el id del alumno como está en la base');
  t.ok(!/clientId \+ "\/|\+ clientId\b|client_id: clientId|"client_id", clientId/.test(h), 'el id que vino en el pedido solo se usa para buscar al alumno');
  t.ok(/new RegExp\("\^" \+ coachId \+ "\/" \+ cid \+ "\//.test(h), 'la ruta del audio se arma con el id de la base');
  const m = /const body = (String\(input\.body \|\| ""\)[^;]*);/.exec(h);
  t.ok(!!m, 'está la limpieza del texto');
  if (m){
    const limpiar = new Function('input', 'return ' + m[1] + ';');
    t.eq(limpiar({ body: '  a\u0000b  ' }), 'ab', 'saca el carácter nulo');
    t.eq(limpiar({ body: 'x\ud800y' }), 'x�y', 'un pedazo de emoji suelto se reemplaza');
    t.ok(limpiar({ body: 'a'.repeat(999) + '😀' }) === 'a'.repeat(999), 'el emoji cortado al final (a los 1000 caracteres) se saca');
    t.eq(limpiar({ body: 'Hola 😀' }), 'Hola 😀', 'un texto normal queda igual');
  }

  // Tiempo máximo y en paralelo.
  t.ok(/conTope\(webpush\.sendNotification\([^;]*timeout: TOPE_MS/.test(h), 'web-push con tiempo máximo');
  t.ok((h.match(/signal: AbortSignal\.timeout\(TOPE_MS\)/g) || []).length === 2 && /fetch\("https:\/\/oauth2\.googleapis\.com\/token"[\s\S]*?signal: AbortSignal\.timeout\(TOPE_MS\)/.test(src), 'Android, iPhone y el token de Firebase con tiempo máximo');
  t.ok(/await Promise\.allSettled\(\[toWeb\(\), toFcm\(\), toApns\(\)\]\)/.test(h), 'web, Android e iPhone en paralelo');
}
