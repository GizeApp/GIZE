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
// La función se corre de verdad, con Supabase y web-push simulados (tests/funcion.mjs). Lo de la
// base (chat_guardar) se revisa leyendo supabase/chat.sql: acá no hay Postgres.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { funcion, supabaseSimulado } from './funcion.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export default async function ({ t }){
  const src = fs.readFileSync(path.join(ROOT, 'supabase/functions/notificar-cliente/index.ts'), 'utf8');
  const h = src.slice(src.indexOf('Deno.serve('));
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

  // El texto.
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
  t.ok(/let t: ReturnType<typeof setTimeout> \| undefined;/.test(src) && !/let t = 0;/.test(src), 'conTope guarda el timer con el tipo de setTimeout (deno check)');
  t.ok((h.match(/signal: AbortSignal\.timeout\(TOPE_MS\)/g) || []).length === 2 && /fetch\("https:\/\/oauth2\.googleapis\.com\/token"[\s\S]*?signal: AbortSignal\.timeout\(TOPE_MS\)/.test(src), 'Android, iPhone y el token de Firebase con tiempo máximo');
  t.ok(/await Promise\.allSettled\(\[toWeb\(\), toFcm\(\), toApns\(\)\]\)/.test(h), 'web, Android e iPhone en paralelo');

  // ---- La función de verdad: qué se guarda, qué avisa y en qué orden ----
  // El alumno le escribe a su coach (que tiene un navegador con los avisos prendidos).
  // base: cómo contesta la base. antes: mensajes del último minuto al empezar.
  const ALUMNO = '11111111-1111-1111-1111-111111111111', COACH = '33333333-3333-3333-3333-333333333333';
  const mandar = async ({ base = 'ok', antes = 0, despues = antes + 1, clientId = ALUMNO, body = 'Hola' } = {}) => {
    const orden = [], hechos = { guardar: null, insert: 0, borrados: [], delivered: null };
    let conteos = 0;
    const db = supabaseSimulado(q => {
      if (q.tabla === 'profiles' && q.columnas === 'id, coach_id, full_name')
        return { data: String(q.filtros[0][2]).toLowerCase() === ALUMNO ? { id: ALUMNO, coach_id: COACH, full_name: 'Ana' } : null };
      if (q.tabla === 'coach_active') return { data: true };
      if (q.tabla === 'coach_messages' && q.accion === 'select'){
        conteos++; if (base === 'no cuenta') return { error: { code: '57014', message: 'tardó demasiado' } };
        return { count: conteos === 1 ? antes : despues };
      }
      if (q.tabla === 'push_subscriptions' && q.accion === 'select') return { data: [{ id: 's1', endpoint: 'https://fcm.googleapis.com/fcm/send/x', p256dh: 'p', auth: 'a' }] };
      if (q.tabla === 'chat_guardar'){
        orden.push('guardar'); hechos.guardar = q.valores;
        if (base === 'sin funcion') return { error: { code: 'PGRST202', message: 'no existe chat_guardar' } };
        if (base === 'no guarda') return { error: { code: '22P05', message: 'texto inválido' } };
        if (base === 'tope') return { data: null };
        return { data: { id: 'm1', created_at: '2026-10-09T12:00:00Z' } };
      }
      if (q.tabla === 'coach_messages' && q.accion === 'insert'){ orden.push('guardar'); hechos.insert++; return { data: { id: 'm2', created_at: '2026-10-09T12:00:00Z' } }; }
      if (q.tabla === 'coach_messages' && q.accion === 'delete'){ hechos.borrados.push(q.filtros[0][2]); return { data: null }; }
      if (q.tabla === 'coach_messages' && q.accion === 'update'){ hechos.delivered = q.valores.delivered; return { data: null }; }
      return { data: null };
    }, { user: { id: ALUMNO } });
    const fn = await funcion('notificar-cliente', {
      env: { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'srv', VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' },
      npm: { '@supabase/supabase-js': { createClient: () => db }, 'web-push': { default: { setVapidDetails(){}, sendNotification: async () => { orden.push('aviso'); return { statusCode: 201 }; } } } },
    });
    const r = await fn.call(new Request('https://x.supabase.co/functions/v1/rapid-worker', { method: 'POST', headers: { Authorization: 'Bearer x' }, body: JSON.stringify({ client_id: clientId, body }) }));
    return { status: r.status, res: await r.json(), orden, ...hechos };
  };
  let x = await mandar();
  t.ok(x.status === 200 && x.res.saved === true && x.res.id === 'm1' && x.res.delivered === 1, 'mensaje normal: guardado y avisado: ' + JSON.stringify(x.res));
  t.eq(x.orden, ['guardar', 'aviso'], 'mensaje normal: se guarda antes de avisar');
  t.eq(x.guardar, { p_coach: COACH, p_client: ALUMNO, p_sender: 'client', p_body: 'Hola', p_audio_path: null, p_audio_secs: null, p_tope: 30 }, 'mensaje normal: chat_guardar con el tope de 30');
  t.eq(x.delivered, 1, 'mensaje normal: anota a cuántos dispositivos llegó');
  x = await mandar({ clientId: ALUMNO.toUpperCase() });
  t.ok(x.status === 200 && x.guardar && x.guardar.p_client === ALUMNO, 'el id del alumno en mayúsculas: se guarda con el de la base');
  x = await mandar({ base: 'tope', antes: 29 });
  t.ok(x.status === 429 && !x.orden.includes('aviso'), 'la base no lo guardó por el tope (el 31 de varios a la vez): 429 y sin aviso');
  x = await mandar({ antes: 30 });
  t.ok(x.status === 429 && x.orden.length === 0, 'con 30 en el último minuto: 429 sin guardar ni avisar');
  x = await mandar({ base: 'no cuenta' });
  t.ok(x.status === 503 && x.orden.length === 0, 'si no se puede contar: 503 sin guardar ni avisar (antes pasaba todo)');
  x = await mandar({ base: 'no guarda' });
  t.ok(x.status === 500 && !x.orden.includes('aviso') && x.res.error === 'No se pudo guardar el mensaje. Probá de nuevo.', 'si no se guarda: error y sin aviso (antes avisaba igual)');
  // Sin chat_guardar (falta correr supabase/chat.sql): como antes, guarda, cuenta de nuevo y borra el que se pasa.
  x = await mandar({ base: 'sin funcion', antes: 29, despues: 30 });
  t.ok(x.status === 200 && x.insert === 1 && x.borrados.length === 0 && x.orden.join() === 'guardar,guardar,aviso', 'sin chat_guardar: guarda directo y avisa');
  x = await mandar({ base: 'sin funcion', antes: 29, despues: 31 });
  t.ok(x.status === 429 && x.borrados.join() === 'm2' && !x.orden.includes('aviso'), 'sin chat_guardar: el que se pasa de 30 se borra, 429 y sin aviso');
}
