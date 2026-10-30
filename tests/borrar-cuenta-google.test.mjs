// Borrar una cuenta con una suscripción de Google Play que se renueva (app de Android: plan de coach o
// IA Plus): la función borrar-audios (la que usa la app al eliminar la cuenta) y la acción «eliminar»
// del panel (función admin) cancelan la renovación en Google ANTES de borrar la cuenta. Si no, Google
// le seguiría cobrando a alguien que ya no tiene cuenta (y después ya no se sabe cuál era su compra).
// Corridas en Node con tests/funcion.mjs (Supabase, jose y Google simulados):
// - primero se cancela (subscriptionsv2.cancel con DEVELOPER_REQUESTED_STOP_PAYMENTS) y después
//   delete_own_account / deleteUser;
// - solo las que Google renueva (activa, en gracia, en espera o en pausa, sin reemplazar);
// - si Google no contesta, o falta GOOGLE_PLAY_SA, 502 y no se borra nada (ni la cuenta, ni audios,
//   ni fotos): se puede reintentar; 400 o 410 de Google (ya no hay nada que cancelar) es como listo;
// - sin google_subs (sin filas, o sin la tabla porque falta supabase/compras-google.sql), todo igual
//   que antes y sin llamar a Google.
import { funcion, supabaseSimulado, cumple } from './funcion.mjs';

const YO = 'aaaaaaaa-0000-4000-8000-000000000001', ADMIN = 'eeeeeeee-0000-4000-8000-00000000000e';
const T1 = 'compra-que-se-renueva_1', T2 = 'compra-cancelada_2', T3 = 'compra-reemplazada_3', T4 = 'compra-en-espera_4', T5 = 'compra-vencida_5';
const SA = JSON.stringify({ client_email: 'cuenta-play@prueba.test', private_key: 'clave-de-prueba' });
const jose = { importPKCS8: async () => 'clave', decodeJwt: () => ({}), SignJWT: class { setProtectedHeader(){ return this; } setIssuer(){ return this; } setAudience(){ return this; }
  setIssuedAt(){ return this; } setExpirationTime(){ return this; } setSubject(){ return this; } async sign(){ return 'jwt-firmado'; } } };
const fila = (purchase_token, estado, o = {}) => Object.assign({ purchase_token, user_id: YO, estado, auto_renew: true, reemplazada: false }, o);
const TODAS = [fila(T1, 'activa'), fila(T2, 'cancelada', { auto_renew: false }), fila(T3, 'activa', { reemplazada: true }), fila(T4, 'espera'), fila(T5, 'vencida', { auto_renew: false }),
  fila('de-otra-cuenta_9', 'activa', { user_id: 'bbbbbbbb-0000-4000-8000-000000000002' })];

// quien: 'app' (borrar-audios, la persona) o 'panel' (admin, un administrador borra a YO).
async function correr(quien, { subs = TODAS, sinTabla = false, clave = true, google = 200 } = {}){
  const pasos = [], cancelados = [], cuerpos = [];
  const filas = subs.map(s => Object.assign({}, s));
  const db = supabaseSimulado(q => {
    if (q.bucket && q.accion === 'list') { pasos.push('listar'); return { data: q.prefijo === YO ? [{ name: 'a.webm', id: '1' }] : [] }; }
    if (q.bucket && q.accion === 'remove') { pasos.push('borrar archivos'); return { data: q.valores }; }
    if (q.tabla === 'google_subs'){
      if (sinTabla) return { error: { code: 'PGRST205', message: 'Could not find the table public.google_subs in the schema cache' } };
      const hay = filas.filter(f => cumple(f, q.filtros));
      if (q.accion === 'select') return { data: hay.map(f => Object.assign({}, f)) };
      if (q.accion === 'update') { hay.forEach(f => Object.assign(f, q.valores)); return { data: null }; }
    }
    if (q.tabla === 'is_app_admin') return { data: true };
    if (q.tabla === 'profiles') return { data: { coach_id: null, full_name: 'Cuenta de prueba', role: 'coach' } };
    if (q.tabla === 'coach_messages') return { data: [] };
    if (q.tabla === 'delete_own_account') { pasos.push('borrar cuenta'); return { data: null }; }
    return { data: null };
  }, { user: { id: quien === 'app' ? YO : ADMIN, identities: [] } });
  db.auth.admin.deleteUser = async () => { pasos.push('borrar cuenta'); return { error: null }; };
  const fetch = async (url, init = {}) => {
    const u = String(url);
    if (!init.signal) pasos.push('sin tiempo máximo: ' + u);
    if (u === 'https://oauth2.googleapis.com/token') return new Response(JSON.stringify({ access_token: 'acceso-de-prueba' }), { status: 200 });
    const m = /\/applications\/ar\.com\.gize\.app\/purchases\/subscriptionsv2\/tokens\/([^/:]+):cancel$/.exec(u);
    if (m && init.method === 'POST'){
      pasos.push('cancelar google'); cancelados.push(decodeURIComponent(m[1])); cuerpos.push(JSON.parse(init.body));
      return new Response(google === 200 ? '{}' : JSON.stringify({ error: { code: google } }), { status: google });
    }
    throw new Error('fetch sin simular: ' + u);
  };
  const fn = await funcion(quien === 'app' ? 'borrar-audios' : 'admin', {
    env: Object.assign({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'srv' }, clave ? { GOOGLE_PLAY_SA: SA } : {}),
    npm: { '@supabase/supabase-js': { createClient: () => db }, jose }, fetch,
  });
  const r = await fn.call(new Request('https://x.supabase.co/functions/v1/' + (quien === 'app' ? 'borrar-audios' : 'admin'), { method: 'POST',
    headers: { Authorization: 'Bearer x', 'Content-Type': 'application/json' }, body: JSON.stringify(quien === 'app' ? {} : { action: 'eliminar', user_id: YO }) }));
  return { status: r.status, body: await r.json(), pasos, cancelados, cuerpos, filas, logs: fn.logs };
}

export default async function ({ t }){
  for (const quien of ['app', 'panel']){
    const nombre = quien === 'app' ? 'borrar-audios' : 'panel «eliminar»';
    let x = await correr(quien);
    t.ok(x.status === 200 && (quien === 'app' ? x.body.deleted === true : x.body.ok === true), nombre + ': borra la cuenta: ' + JSON.stringify(x.body));
    t.eq(x.cancelados.sort(), [T1, T4].sort(), nombre + ': cancela solo las suyas que Google renueva (activa y en espera; no la cancelada, la reemplazada ni la vencida)');
    t.ok(x.cuerpos.every(c => c.cancellationContext && c.cancellationContext.cancellationType === 'DEVELOPER_REQUESTED_STOP_PAYMENTS'), nombre + ': Google deja de cobrar');
    const borra = x.pasos.indexOf('borrar cuenta'), ultima = x.pasos.lastIndexOf('cancelar google');
    t.ok(ultima >= 0 && borra > ultima, nombre + ': primero cancela y después borra la cuenta: ' + x.pasos.join(', '));
    if (quien === 'panel') t.ok(x.pasos.indexOf('borrar archivos') > ultima, 'panel «eliminar»: las fotos y audios se borran después de cancelar');
    t.ok(x.filas.filter(f => [T1, T4].includes(f.purchase_token)).every(f => f.auto_renew === false), nombre + ': queda anotado que ya no se renuevan (por si el borrado se reintenta)');
    t.ok(!x.pasos.some(p => p.startsWith('sin tiempo máximo')), nombre + ': las llamadas a Google tienen tiempo máximo');

    // Google no contesta: no se borra nada.
    x = await correr(quien, { google: 503 });
    t.ok(x.status === 502 && /Google Play/.test(x.body.error) && !x.pasos.includes('borrar cuenta') && !x.pasos.includes('borrar archivos'),
      nombre + ': si Google no deja cancelar, 502 y no se borra nada: ' + JSON.stringify(x.body) + ' ' + x.pasos.join(', '));
    if (quien === 'app') t.eq(x.body.error, 'No se pudo cancelar tu suscripción de Google Play. Probá de nuevo en un rato.', 'borrar-audios: el mensaje para la persona');
    t.ok(!x.logs.join('\n').includes(T1), nombre + ': los registros no tienen el código de la compra');
    // Sin la clave y con una que se renueva: tampoco.
    x = await correr(quien, { clave: false });
    t.ok(x.status === 502 && !x.cancelados.length && !x.pasos.includes('borrar cuenta'), nombre + ': sin GOOGLE_PLAY_SA y con una suscripción que se renueva, no se borra');
    // 400 o 410: ya no había nada que cancelar.
    for (const status of [400, 410]){
      x = await correr(quien, { google: status });
      t.ok(x.status === 200 && x.pasos.includes('borrar cuenta'), nombre + ': Google contesta ' + status + ' (ya no hay nada que cancelar): se borra');
    }
    // Sin suscripciones de Google (o sin la tabla): como antes, sin llamar a Google.
    for (const [que, o] of [['sin filas', { subs: [] }], ['solo las que no se renuevan', { subs: TODAS.filter(f => ![T1, T4].includes(f.purchase_token)) }],
      ['sin la tabla google_subs', { sinTabla: true }], ['sin filas y sin la clave', { subs: [], clave: false }]]){
      x = await correr(quien, o);
      t.ok(x.status === 200 && !x.cancelados.length && x.pasos.includes('borrar cuenta'), nombre + ' ' + que + ': como antes, sin llamar a Google: ' + x.status + ' ' + JSON.stringify(x.body));
    }
  }
}
