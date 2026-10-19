// Mensajes del chat con un bloqueo de por medio (supabase/functions/notificar-cliente, publicada
// como rapid-worker, y el trigger de supabase/bloqueos.sql). Al bloquear se corta el vínculo y la
// función ya no deja escribir; igual, si uno bloqueó al otro, la base no guarda el mensaje y dice
// por qué (P0001). La función tiene que:
// - devolver ese aviso tal cual (403), sin decir quién bloqueó a quién, y no mandar ningún aviso al
//   celular del otro;
// - hacer lo mismo cuando falta chat_guardar y guarda directo en la tabla.
// La función se corre de verdad, con Supabase y web-push simulados (tests/funcion.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { funcion, supabaseSimulado } from './funcion.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ALUMNO = '11111111-1111-1111-1111-111111111111', COACH = '33333333-3333-3333-3333-333333333333';
const AVISO = 'No se pueden mandar mensajes en esta conversación.';
const BLOQUEO = { code: 'P0001', message: AVISO };

async function mandar({ base, de = ALUMNO }){
  const orden = [];
  const db = supabaseSimulado(q => {
    if (q.tabla === 'profiles' && q.columnas === 'id, coach_id, full_name') return { data: { id: ALUMNO, coach_id: COACH, full_name: 'Ana' } };
    if (q.tabla === 'profiles') return { data: { full_name: 'Coach Prueba' } };
    if (q.tabla === 'coach_active') return { data: true };
    if (q.tabla === 'coach_messages' && q.accion === 'select') return { count: 0 };
    if (q.tabla === 'push_subscriptions' && q.accion === 'select') return { data: [{ id: 's1', endpoint: 'https://fcm.googleapis.com/fcm/send/x', p256dh: 'p', auth: 'a' }] };
    if (q.tabla === 'chat_guardar'){ orden.push('guardar'); return base === 'sin funcion' ? { error: { code: 'PGRST202', message: 'no existe chat_guardar' } } : { error: BLOQUEO }; }
    if (q.tabla === 'coach_messages' && q.accion === 'insert'){ orden.push('insert'); return { error: BLOQUEO }; }
    return { data: null };
  }, { user: { id: de } });
  const fn = await funcion('notificar-cliente', {
    env: { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'srv', VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' },
    npm: { '@supabase/supabase-js': { createClient: () => db }, 'web-push': { default: { setVapidDetails(){}, sendNotification: async () => { orden.push('aviso'); return { statusCode: 201 }; } } } },
  });
  const r = await fn.call(new Request('https://x.supabase.co/functions/v1/rapid-worker', { method: 'POST', headers: { Authorization: 'Bearer x' }, body: JSON.stringify({ client_id: ALUMNO, body: 'Hola' }) }));
  return { status: r.status, res: await r.json(), orden };
}

export default async function ({ t }){
  // El aviso lo arma la base (trigger de coach_messages en bloqueos.sql): la función lo pasa tal cual.
  const ts = fs.readFileSync(path.join(ROOT, 'supabase/functions/notificar-cliente/index.ts'), 'utf8');
  t.ok(/if \(saveErr && saveErr\.code === "P0001" && saveErr\.message\) return json\(\{ error: saveErr\.message \}, 403\);/.test(ts), 'función de mensajes: el aviso de la base, con 403');
  const sql = fs.existsSync(path.join(ROOT, 'supabase/bloqueos.sql')) ? fs.readFileSync(path.join(ROOT, 'supabase/bloqueos.sql'), 'utf8') : '';
  t.has(sql, "raise exception '" + AVISO + "' using errcode = 'P0001';", 'bloqueos.sql: el mismo aviso, con P0001');
  let x = await mandar({ base: 'ok' });
  t.eq([x.status, x.res.error], [403, AVISO], 'alumno → coach con un bloqueo: 403 con el aviso de la base');
  t.eq(x.orden, ['guardar'], 'no se manda ningún aviso al celular');
  x = await mandar({ base: 'ok', de: COACH });
  t.eq([x.status, x.res.error], [403, AVISO], 'coach → alumno con un bloqueo: el mismo aviso (no dice quién bloqueó)');
  t.ok(!x.orden.includes('aviso'), 'coach → alumno: sin aviso al celular');
  x = await mandar({ base: 'sin funcion' });
  t.eq([x.status, x.res.error], [403, AVISO], 'sin chat_guardar (guarda directo): el mismo aviso');
  t.eq(x.orden, ['guardar', 'insert'], 'sin chat_guardar: intenta guardar directo y no avisa');
}
