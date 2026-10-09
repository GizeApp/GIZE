// Notificaciones con tiempo máximo (supabase/functions/admin y avisos-coach): un dispositivo
// que no contesta (por ejemplo, una dirección guardada a propósito con un puerto raro, que
// deja la conexión colgada) no traba el aviso a los demás.
// - admin (aviso a todos): web, Android e iPhone salen en paralelo y cada envío tiene tope.
// - avisos-coach: cada coach va por su lado, en paralelo y con tope; si a uno no se le pudo
//   mandar, sus avisos se liberan para el minuto siguiente.
// - La base no acepta direcciones de navegador con puerto (supabase/push-nativo.sql).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

// Lo esencial del envío de una función: tope en web-push, en cada fetch y los tres canales a la vez.
function envio(t, nombre, src){
  const send = src.slice(src.indexOf('async function send('), src.indexOf('\n}\n', src.indexOf('async function send(')));
  t.ok(send.length > 100, nombre + ': está send()');
  t.ok(/webpush\.sendNotification\([^;]*timeout: TOPE_MS/.test(send) && /conTope\(webpush\.sendNotification\(/.test(send), nombre + ': web-push con tiempo máximo');
  const fetches = send.match(/await fetch\(/g) || [];
  const conTope = send.match(/signal: AbortSignal\.timeout\(TOPE_MS\)/g) || [];
  t.ok(fetches.length === 2 && conTope.length === 2, nombre + ': Android e iPhone con tiempo máximo (' + conTope.length + ' de ' + fetches.length + ')');
  t.ok(/fetch\("https:\/\/oauth2\.googleapis\.com\/token"[\s\S]*?signal: AbortSignal\.timeout\(TOPE_MS\)/.test(src), nombre + ': el token de Firebase con tiempo máximo');
  t.ok(/await Promise\.allSettled\(\[toWeb\(\), toFcm\(\), toApns\(\)\]\)/.test(send), nombre + ': web, Android e iPhone en paralelo');
  t.ok(!/^ {2}if \((web\.length|sa|apns\.length)\b/m.test(send), nombre + ': ningún canal espera a otro');
  const tope = /const TOPE_MS = ([\d_]+);/.exec(src);
  t.ok(tope && Number(tope[1].replace(/_/g, '')) <= 15000, nombre + ': tope de 15 segundos o menos');
}

export default async function ({ t }){
  envio(t, 'admin', rd('supabase/functions/admin/index.ts'));

  const ac = rd('supabase/functions/avisos-coach/index.ts');
  envio(t, 'avisos-coach', ac);
  const h = ac.slice(ac.indexOf('Deno.serve('));
  t.ok(!/for \(const coachId of coachIds\)/.test(h), 'avisos-coach: los coaches ya no van de a uno');
  t.ok(/await Promise\.allSettled\(coachIds\.map\(\(c\) => conTope\(porCoach\(c\), [\d_]+\)\)\)/.test(h), 'avisos-coach: todos los coaches a la vez, cada uno con tope');
  t.ok(/select\("id, coach_id, client_id, kind, key, days, created_at"\)/.test(h), 'avisos-coach: toma el id de cada aviso para poder liberarlo');
  t.ok(/r\.status === "fulfilled"[\s\S]*retry\.push\(a\.id\)[\s\S]*\.update\(\{ sent_at: null \}\)\.in\("id", retry\)/.test(h), 'avisos-coach: los avisos del coach que falló se liberan (sent_at vuelve a null)');

  // La base: sin puerto en las direcciones de navegador, y las que ya estaban se borran.
  const sql = rd('supabase/push-nativo.sql');
  const re = /new\.endpoint ~ '([^']+)'/.exec(sql);
  t.ok(re && !/\(:\[0-9\]\+\)\?/.test(re[1]), 'push-nativo.sql: el patrón ya no acepta puerto');
  if (re){
    // Patrón de Postgres → JS (es compatible: solo clases, grupos y alternativas).
    const ok = new RegExp(re[1]);
    t.ok(ok.test('https://fcm.googleapis.com/fcm/send/abc') && ok.test('https://updates.push.services.mozilla.com/wpush/v2/x') && ok.test('https://web.push.apple.com/QWER'), 'push-nativo.sql: las direcciones normales siguen valiendo');
    t.ok(!ok.test('https://fcm.googleapis.com:81/x') && !ok.test('https://web.push.apple.com:8443/x') && !ok.test('https://evil.example/x'), 'push-nativo.sql: con puerto o de otro servicio, no');
  }
  t.ok(/delete from public\.push_subscriptions where endpoint ~ '\^https:\/\/\[\^\/\]\*:\[0-9\]\*\/';/.test(sql), 'push-nativo.sql: borra las que ya estaban guardadas con puerto');
  t.ok(!/\(:\[0-9\]\+\)\?/.test(rd('supabase/validaciones.sql')), 'validaciones.sql: tampoco acepta puerto (si se vuelve a correr)');
}
