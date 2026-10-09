// Notificaciones con tiempo máximo (supabase/functions/admin y avisos-coach): un dispositivo
// que no contesta (por ejemplo, una dirección guardada a propósito con un puerto raro, que
// deja la conexión colgada) no traba el aviso a los demás.
// - admin (aviso a todos): web, Android e iPhone salen en paralelo y cada envío tiene tope.
//   En cada canal van de a 100 a la vez (tanda.ts): con miles todos juntos, el tope corría
//   para todos desde el principio y los últimos podían cortarse sin llegar.
// - avisos-coach: cada coach va por su lado, en paralelo y con tope; si a uno no se le pudo
//   mandar, sus avisos se liberan para el minuto siguiente. También los de una notificación
//   que no le llegó a ningún dispositivo por una falla pasajera (sin respuesta, 429, 5xx, sin
//   token de Google o Apple): antes send() se tragaba esos errores y el aviso se perdía.
// - La base no acepta direcciones de navegador con puerto (supabase/push-nativo.sql).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

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
  const adm = rd('supabase/functions/admin/index.ts');
  envio(t, 'admin', adm);
  const asend = adm.slice(adm.indexOf('async function send('), adm.indexOf('\n}\n', adm.indexOf('async function send(')));
  t.ok(/import \{ deA \} from "\.\/tanda\.ts";/.test(adm) && ['web', 'fcm', 'apns'].every(c => asend.includes('await deA(' + c + ', async (s) => {')) && !/Promise\.all\(\w+\.map\(/.test(asend), 'admin: cada canal manda de a tandas (deA), no todos juntos');
  let tn = null;
  try { tn = await import(pathToFileURL(path.join(ROOT, 'supabase/functions/admin/tanda.ts')).href); }
  catch (e) { t.ok(false, 'no se pudo cargar admin/tanda.ts: ' + (e && e.message ? e.message.split('\n')[0] : e)); }
  if (tn){
    t.ok(tn.TANDA >= 10 && tn.TANDA <= 200, 'admin: de a ' + tn.TANDA + ' a la vez');
    // 250 envíos: nunca más de la tanda a la vez y cada uno una sola vez.
    let vuelo = 0, max = 0;
    const hechos = [];
    await tn.deA(Array.from({ length: 250 }, (_, i) => i), async (x) => { vuelo++; max = Math.max(max, vuelo); await new Promise(z => setTimeout(z, 1 + (x % 3))); vuelo--; hechos.push(x); });
    t.ok(max === tn.TANDA, 'deA: como mucho ' + tn.TANDA + ' a la vez (hubo ' + max + ')');
    t.eq(hechos.slice().sort((a, b) => a - b), Array.from({ length: 250 }, (_, i) => i), 'deA: cada uno una sola vez');
    // El tope corre desde que arranca cada envío: 6 envíos de 30 ms de a 2, con tope de 50 ms,
    // tardan 90 ms en total y ninguno se corta (con el tope contado desde el principio, sí).
    const tope = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('tope')), ms))]);
    let cortados = 0;
    await tn.deA([1, 2, 3, 4, 5, 6], async () => { try { await tope(new Promise(z => setTimeout(z, 30)), 50); } catch { cortados++; } }, 2);
    t.eq(cortados, 0, 'deA: el tope corre desde que arranca cada envío');
    await tn.deA([], async () => { throw new Error('no'); });
    t.ok(true, 'deA: sin nada para mandar no hace nada');
  }

  const ac = rd('supabase/functions/avisos-coach/index.ts');
  envio(t, 'avisos-coach', ac);
  const h = ac.slice(ac.indexOf('Deno.serve('));
  t.ok(!/for \(const coachId of coachIds\)/.test(h), 'avisos-coach: los coaches ya no van de a uno');
  t.ok(/await Promise\.allSettled\(coachIds\.map\(\(c\) => conTope\(porCoach\(c\), [\d_]+\)\)\)/.test(h), 'avisos-coach: todos los coaches a la vez, cada uno con tope');
  t.ok(/select\("id, coach_id, client_id, kind, key, days, created_at"\)/.test(h), 'avisos-coach: toma el id de cada aviso para poder liberarlo');
  t.ok(/r\.status === "fulfilled"[\s\S]*retry\.push\(a\.id\)[\s\S]*\.update\(\{ sent_at: null \}\)\.in\("id", retry\)/.test(h), 'avisos-coach: los avisos del coach que falló se liberan (sent_at vuelve a null)');
  t.ok(/if \(r\.status === "fulfilled"\) \{ sent \+= r\.value\.sent; retry\.push\(\.\.\.r\.value\.retry\); return; \}/.test(h), 'avisos-coach: también se liberan los que no llegaron por una falla pasajera');
  t.ok(/const r = await mandar\(msgs, \(title, body, tag\) => send\(mine, title, body, tag\)\);/.test(h), 'avisos-coach: cada coach manda con mandar() (reparto.ts)');
  for (const [kind, v] of [['checkin', 'ci'], ['inactivo', 'idle'], ['descarga', 'dl'], ['descarga-prox', 'prox']])
    t.ok(new RegExp('tag: "gize-' + kind + '", alerts: ' + v + ' \\}').test(h), 'avisos-coach: la notificación «' + kind + '» lleva sus avisos');

  // send() cuenta a cuántos llegó y marca las fallas pasajeras de los tres canales.
  const send = ac.slice(ac.indexOf('async function send('), ac.indexOf('\n}\n', ac.indexOf('async function send(')));
  t.ok(/Promise<Envio>/.test(send) && /return \{ llegaron, gone, pasajero: falla \};/.test(send), 'avisos-coach: send() devuelve a cuántos llegó y si hubo falla pasajera');
  t.eq((send.match(/llegaron\+\+/g) || []).length, 3, 'avisos-coach: cuenta lo que llega por web, Android e iPhone');
  t.ok(/if \(pasajero\(code\)\) falla = true;/.test(send) && (send.match(/if \(pasajero\(r\.status\)\) falla = true;/g) || []).length === 2, 'avisos-coach: un error 429 o 5xx es falla pasajera en los tres canales');
  t.ok(/access = await fcmToken\(\); \} catch \(e\) \{[^}]*falla = true; \}/.test(send) && /jwt = await apnsJwt\(\); \} catch \(e\) \{[^}]*falla = true; \}/.test(send), 'avisos-coach: sin token de Google o de Apple es falla pasajera');
  t.eq((send.match(/catch \(e\) \{ console\.error\("(fcm|apns)", \(e as Error\)\.message\); falla = true; \}/g) || []).length, 2, 'avisos-coach: sin respuesta de Google o Apple es falla pasajera');

  // Las reglas de qué se libera, corridas con un send() simulado.
  let rp = null;
  try { rp = await import(pathToFileURL(path.join(ROOT, 'supabase/functions/avisos-coach/reparto.ts')).href); }
  catch (e) { t.ok(false, 'no se pudo cargar avisos-coach/reparto.ts: ' + (e && e.message ? e.message.split('\n')[0] : e)); }
  if (rp){
    t.ok(rp.pasajero(undefined) && rp.pasajero(429) && rp.pasajero(500) && rp.pasajero(503), 'pasajero: sin respuesta, 429 y 5xx');
    t.ok(!rp.pasajero(400) && !rp.pasajero(403) && !rp.pasajero(404) && !rp.pasajero(410), 'pasajero: 400, 403, 404 y 410 no');
    const ahora = Date.parse('2026-10-09T12:00:00Z'), hace = (min) => new Date(ahora - min * 60000).toISOString();
    const msg = (tag, ...ids) => ({ title: 'T ' + tag, body: 'B', tag, alerts: ids.map(([id, min]) => ({ id, created_at: hace(min) })) });
    const msgs = [msg('llega', [1, 5]), msg('cae', [2, 5], [3, 30], [4, 90]), msg('vencido', [5, 5]), msg('parcial', [6, 5]), msg('sin-equipos', [7, 5])];
    // llega: a un dispositivo. cae: a ninguno, por sin respuesta. vencido: a ninguno, por 410.
    // parcial: a uno sí y a otro no (pasajero). sin-equipos: a ninguno, 400 (no se arregla reintentando).
    const res = {
      'T llega': { llegaron: 1, gone: [], pasajero: false },
      'T cae': { llegaron: 0, gone: [], pasajero: true },
      'T vencido': { llegaron: 0, gone: ['sub-9'], pasajero: false },
      'T parcial': { llegaron: 1, gone: [], pasajero: true },
      'T sin-equipos': { llegaron: 0, gone: [], pasajero: false },
    };
    const vistos = [];
    const r = await rp.mandar(msgs, async (title, body, tag) => { vistos.push(tag); await new Promise(z => setTimeout(z, 5)); return res[title]; }, ahora);
    t.eq(vistos, ['llega', 'cae', 'vencido', 'parcial', 'sin-equipos'], 'mandar: manda cada notificación una vez');
    t.eq(r.retry, [2, 3], 'mandar: se liberan solo los avisos de la que no llegó por una falla pasajera (y de la última hora)');
    t.eq(r.sent, 2, 'mandar: cuenta las que llegaron');
    t.eq(r.gone, ['sub-9'], 'mandar: junta los dispositivos que ya no existen');
    t.ok(rp.reciente({ created_at: hace(59) }, ahora) && !rp.reciente({ created_at: hace(61) }, ahora), 'reciente: solo la última hora');
  }

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
