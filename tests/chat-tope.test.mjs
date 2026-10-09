// Freno de 30 mensajes por minuto del chat (supabase/functions/notificar-cliente, publicada
// como rapid-worker). El freno cuenta los mensajes guardados; antes el mensaje se guardaba
// DESPUÉS de mandar los avisos, así que uno que no se podía guardar (texto con un carácter
// nulo, id del alumno en mayúsculas) avisaba igual al celular del otro sin contar, y un error
// al contar dejaba pasar todo. Ahora:
// - se guarda antes de mandar los avisos (si no se guarda, no sale ningún aviso);
// - si no se puede contar, no se manda; y se vuelve a contar ya guardado (varios a la vez);
// - se usa el id del alumno como está en la base y el texto se limpia como en contacto;
// - cada envío (web, Android, iPhone) tiene tiempo máximo y van en paralelo.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export default async function ({ t }){
  const src = fs.readFileSync(path.join(ROOT, 'supabase/functions/notificar-cliente/index.ts'), 'utf8');
  const h = src.slice(src.indexOf('Deno.serve('));
  const ins = h.indexOf('.from("coach_messages").insert(');
  const push = h.indexOf('webpush.sendNotification('), fcm = h.indexOf('fetch("https://fcm.googleapis.com/v1/'), apns = h.indexOf('fetch("https://api.push.apple.com/');
  t.ok(ins > 0 && push > ins && fcm > ins && apns > ins, 'el mensaje se guarda antes de mandar los avisos');
  t.ok(/if \(saveErr \|\| !saved\) \{[\s\S]*?return json\(\{ error: "No se pudo guardar el mensaje\. Probá de nuevo\." \}, 500\);/.test(h.slice(ins, push)), 'si no se guarda, no manda avisos y contesta error');
  t.ok(!/saved: !saveErr/.test(h) && /saved: true, id: saved\.id/.test(h), 'ya no contesta «llegó pero no se guardó»');
  t.ok(/\.update\(\{ delivered \}\)\.eq\("id", saved\.id\)/.test(h), 'después anota a cuántos dispositivos llegó');

  // El conteo.
  t.ok(/const \{ count, error \} = await admin\.from\("coach_messages"\)\.select\("id", \{ count: "exact", head: true \}\)/.test(h) && /return error \? null : \(count \|\| 0\);/.test(h), 'el conteo devuelve null si falla');
  t.ok(/if \(before === null\) return json\([^;]*503\);/.test(h) && /if \(before >= 30\) return json\([^;]*429\);/.test(h), 'antes de guardar: si no se pudo contar, no se manda; con 30, se frena');
  const after = h.indexOf('const after = await recent();');
  t.ok(after > ins && after < push && /if \(after === null \|\| after > 30\) \{\s*await admin\.from\("coach_messages"\)\.delete\(\)\.eq\("id", saved\.id\);/.test(h), 'ya guardado se cuenta de nuevo: el que se pasa se borra y no avisa');
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
