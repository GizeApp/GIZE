// Cobro con Google Play en la app de Android (supabase/functions/compras-google y
// _shared/google-play.ts), corriendo en Node con tests/funcion.mjs: Supabase, jose y fetch simulados
// (nada sale a internet; Google también es simulado, con claves RSA de prueba hechas acá).
// - planes.ts: los mismos productos que Apple (compras-apple/planes.ts), IA Plus igual y el plan
//   base «mensual» igual al del plugin de Android.
// - reglas.ts: estadoDe por cada estado de Google (activa, en gracia y cancelada vigente dan el plan;
//   en espera, en pausa, vencida y revocada no; pendiente no da nada), itemVigente con dos líneas,
//   cuentaDe (obfuscatedExternalAccountId y outOfAppPurchaseContext), cambiosBilling (no pisa lo
//   pagado por la web que llega más lejos, cortesía solo anota, una vieja o reemplazada que vence no
//   toca nada, no baja paid_until por debajo de Apple vigente, aplicar dos veces da lo mismo) y los
//   avisos de Pub/Sub.
// - oidc.ts: la firma RS256 con las claves de Google, la audiencia, el mail de la cuenta de servicio
//   y las fechas.
// - La función: sin GOOGLE_PLAY_SA contesta 503 sin llamar a nadie; compra válida desde la app →
//   plan, tope, paid_until y google_* en coach_billing, fila en google_subs y se reconoce una sola
//   vez con el producto correcto; otra cuenta, alumno con plan de coach, producto desconocido y
//   vencida → error y sin reconocer; pendiente → sin plan; IA Plus de prueba fuera de la lista →
//   'prueba'; IA Plus de un alumno → ia_plus; cambio de plan (linkedPurchaseToken) → la vieja queda
//   reemplazada; si no se puede reconocer → { ok, reconocer: true }; Google caído → 500; sin
//   permisos → 500 y queda anotado para el panel; avisos sin token, con firma mala, de otra audiencia
//   o de otra cuenta → 401 sin leer la API; avisos de renovación, cancelación, en espera, recuperada,
//   revocada y compra anulada; el mensaje de prueba de Play Console queda anotado; aviso de una
//   cuenta borrada que se renueva → se cancela; «salud» para el panel; los registros nunca tienen el
//   código de la compra ni mails; todas las llamadas a Google con tiempo máximo.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { funcion, supabaseSimulado, cumple } from './funcion.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = 'supabase/functions/compras-google';
const leer = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const importar = f => import(pathToFileURL(path.join(ROOT, f)).href);

const DIA = 864e5, ahora = Date.now();
const iso = ms => new Date(ms).toISOString();
const COACH = 'c0ac4000-0000-4000-8000-0000000000a1', OTRO = 'c0ac4000-0000-4000-8000-0000000000b2', ALUMNO = 'a1a1a1a1-0000-4000-8000-000000000001';
const BORRADA = 'dddddddd-0000-4000-8000-000000000009';
const P25 = 'ar.com.gize.app.coach.p25', P50 = 'ar.com.gize.app.coach.p50', PLUS = 'ar.com.gize.app.iaplus.mensual';
const T1 = 'compra-de-prueba.uno_AAAA', T2 = 'compra-de-prueba.dos_BBBB', T3 = 'compra-de-prueba.tres_CCCC';
const SA = { type: 'service_account', client_email: 'cuenta-play@prueba.test', private_key: 'clave-de-prueba' };
const URL_SB = 'https://x.supabase.co', AUD = URL_SB + '/functions/v1/compras-google';
const CERTS = 'https://www.googleapis.com/oauth2/v3/certs';
const MAIL_USUARIO = 'usuario@prueba.test'; // el que da auth.admin.getUserById en tests/funcion.mjs

// Una compra como la devuelve purchases.subscriptionsv2.get.
const linea = (o = {}) => Object.assign({ productId: P25, expiryTime: iso(ahora + 30 * DIA), latestSuccessfulOrderId: 'GPA.0000-0000-0000-00001',
  autoRenewingPlan: { autoRenewEnabled: true } }, o);
const sub = (o = {}, l = {}) => Object.assign({ kind: 'androidpublisher#subscriptionPurchaseV2', regionCode: 'AR', startTime: iso(ahora - 60000),
  subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
  externalAccountIdentifiers: { obfuscatedExternalAccountId: COACH }, lineItems: [linea(l)] }, o);

// ---- Las claves de Google para los avisos (OIDC), hechas acá ----
const b64u = b => Buffer.from(b).toString('base64url');
const claveGoogle = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const otraClave = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const JWKS = { keys: [Object.assign(claveGoogle.publicKey.export({ format: 'jwk' }), { kid: 'clave-1', alg: 'RS256', use: 'sig' })] };
function tokenOidc(o = {}, { clave = claveGoogle.privateKey, kid = 'clave-1', alg = 'RS256' } = {}){
  const s = Math.floor(Date.now() / 1000);
  const cab = b64u(JSON.stringify({ alg, kid, typ: 'JWT' }));
  const datos = b64u(JSON.stringify(Object.assign({ aud: AUD, azp: '1234', email: SA.client_email, email_verified: true, exp: s + 3600, iat: s,
    iss: 'https://accounts.google.com', sub: '1234' }, o)));
  return cab + '.' + datos + '.' + b64u(crypto.sign('sha256', Buffer.from(cab + '.' + datos), clave));
}
const aviso = n => ({ message: { data: Buffer.from(JSON.stringify(Object.assign({ version: '1.0', packageName: 'ar.com.gize.app', eventTimeMillis: String(ahora) }, n))).toString('base64'),
  messageId: '136969346945', publishTime: iso(ahora) }, subscription: 'projects/prueba/subscriptions/play-gize-supabase' });
const avisoSub = (token, tipo) => aviso({ subscriptionNotification: { version: '1.0', notificationType: tipo, purchaseToken: token } });

// ---- Google simulado ----
function googleSim({ subs = {}, leer: estadoLeer = {}, ack = 200, cancel = 200, oauth = 200 } = {}){
  const g = { subs, llamadas: [], ack, cancel, oauth, leer: estadoLeer };
  const resp = (status, cuerpo, headers = {}) => new Response(status === 204 ? null : JSON.stringify(cuerpo), { status, headers: Object.assign({ 'Content-Type': 'application/json' }, headers) });
  g.fetch = async (url, init = {}) => {
    const u = String(url), metodo = init.method || 'GET';
    g.llamadas.push({ url: u, metodo, cuerpo: init.body ? String(init.body) : '', tope: !!init.signal });
    if (u === 'https://oauth2.googleapis.com/token') return resp(g.oauth, g.oauth === 200 ? { access_token: 'acceso-de-prueba', expires_in: 3599 } : { error: 'invalid_grant' });
    if (u === CERTS) return resp(200, JWKS, { 'cache-control': 'public, max-age=3600' });
    const base = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/ar.com.gize.app/purchases/';
    if (!u.startsWith(base)) throw new Error('fetch sin simular: ' + u);
    const r = u.slice(base.length);
    let m = /^subscriptionsv2\/tokens\/([^/:]+)$/.exec(r);
    if (m && metodo === 'GET'){
      const t = decodeURIComponent(m[1]);
      if (g.leer[t]) return resp(g.leer[t], { error: { code: g.leer[t] } });
      return g.subs[t] ? resp(200, g.subs[t]) : resp(404, { error: { code: 404 } });
    }
    m = /^subscriptions\/([^/]+)\/tokens\/([^/:]+):acknowledge$/.exec(r);
    if (m && metodo === 'POST'){
      const t = decodeURIComponent(m[2]);
      if (g.ack !== 200) return resp(g.ack, { error: { code: g.ack } });
      if (g.subs[t]) g.subs[t].acknowledgementState = 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED';
      return resp(204);
    }
    m = /^subscriptionsv2\/tokens\/([^/:]+):cancel$/.exec(r);
    if (m && metodo === 'POST') return g.cancel === 200 ? resp(200, {}) : resp(g.cancel, { error: { code: g.cancel } });
    throw new Error('fetch sin simular: ' + u);
  };
  g.de = (que) => g.llamadas.filter(l => que === 'leer' ? /subscriptionsv2\/tokens\/[^/:]+$/.test(l.url) : que === 'reconocer' ? /:acknowledge$/.test(l.url)
    : que === 'cancelar' ? /:cancel$/.test(l.url) : l.url.includes(que));
  return g;
}

// ---- Supabase simulado: las tablas que usa la función ----
const PK = { coach_billing: 'coach_id', ia_plus: 'user_id', google_subs: 'purchase_token', app_config: 'key', profiles: 'id', ia_config: 'id' };
function base({ usuario = COACH, roles = { [COACH]: 'coach', [OTRO]: 'coach', [ALUMNO]: 'client' }, billing = {}, plus = [], subs = [], sandbox = [], estado = null, esAdmin = false } = {}){
  const fila = (id, o) => Object.assign({ coach_id: id, plan: 'trial', max_clients: 10, trial_ends_at: iso(ahora - 3 * DIA), paid_until: null, pending_plan: null,
    mp_preapproval_id: null, mp_status: null, apple_original_tx: null, apple_vence: null, apple_renueva: false,
    google_token: null, google_vence: null, google_renueva: false, updated_at: '2026-10-01T00:00:00.000001+00:00' }, o);
  const T = {
    profiles: Object.entries(roles).map(([id, role]) => ({ id, role })),
    coach_billing: [fila(COACH, billing[COACH] || {}), fila(OTRO, billing[OTRO] || {})],
    ia_plus: plus.map(p => Object.assign({ google_token: null, google_vence: null, google_renueva: false, updated_at: '2026-10-01T00:00:00.000001+00:00' }, p)),
    google_subs: subs.map(s => Object.assign({ reemplazada: false, revoked: false, acknowledged: false, test: false, leido_at: iso(ahora - DIA) }, s)),
    ia_config: [{ id: 1, plus: { sandbox } }],
    app_config: estado ? [{ key: 'compras_google_estado', value: estado }] : [],
  };
  const escrituras = [];
  const db = supabaseSimulado(q => {
    if (q.accion === 'rpc') return q.tabla === 'is_app_admin' ? { data: esAdmin } : { data: null };
    const filas = T[q.tabla];
    if (!filas) return { data: null };
    const hay = filas.filter(f => cumple(f, q.filtros));
    if (q.accion === 'select') return { data: q.single ? (hay[0] ? Object.assign({}, hay[0]) : null) : hay.map(f => Object.assign({}, f)) };
    escrituras.push([q.tabla, q.accion, q.valores]);
    if (q.accion === 'insert'){
      const k = PK[q.tabla];
      if (filas.some(f => f[k] === q.valores[k])) return { error: { code: '23505', message: 'duplicada' } };
      filas.push(Object.assign({}, q.valores)); return { data: null };
    }
    if (q.accion === 'upsert'){
      const k = PK[q.tabla], ya = filas.find(f => f[k] === q.valores[k]);
      if (ya) Object.assign(ya, q.valores); else filas.push(Object.assign({}, q.valores));
      return { data: null };
    }
    if (q.accion === 'update'){ hay.forEach(f => Object.assign(f, q.valores)); return { data: hay.map(f => ({ [PK[q.tabla]]: f[PK[q.tabla]] })) }; }
    return { data: null };
  }, { user: usuario ? { id: usuario, email: 'coach@prueba.test' } : null });
  const una = (tabla, id) => T[tabla].find(f => f[PK[tabla]] === id);
  return { db, T, escrituras, bill: id => una('coach_billing', id), sub: t => una('google_subs', t), plus: id => una('ia_plus', id) };
}

const jose = { importPKCS8: async () => 'clave', SignJWT: class { setProtectedHeader(){ return this; } setIssuer(){ return this; } setAudience(){ return this; }
  setIssuedAt(){ return this; } setExpirationTime(){ return this; } async sign(){ return 'jwt-firmado'; } } };
async function montar(b, g, { clave = true } = {}){
  const fn = await funcion('compras-google', {
    env: Object.assign({ SUPABASE_URL: URL_SB, SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'srv' }, clave ? { GOOGLE_PLAY_SA: JSON.stringify(SA) } : {}),
    npm: { '@supabase/supabase-js': { createClient: () => b.db }, jose },
    fetch: g.fetch,
  });
  const pedir = async (cuerpo, headers = {}) => {
    const r = await fn.call(new Request(AUD, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, headers), body: JSON.stringify(cuerpo) }));
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  return {
    fn, logs: fn.logs,
    app: c => pedir(c, { Authorization: 'Bearer sesion' }),
    google: (c, token = tokenOidc()) => pedir(c, token === null ? {} : { Authorization: 'Bearer ' + token }),
  };
}

export default async function ({ t }){
  // ---------- 1) Los productos ----------
  const P = await importar(DIR + '/planes.ts');
  const PA = await importar('supabase/functions/compras-apple/planes.ts');
  t.eq(P.PRODUCTOS_GOOGLE, PA.PRODUCTOS_APPLE, 'Google Play: los mismos productos y planes que Apple');
  t.eq(P.IA_PLUS_GOOGLE, PA.IA_PLUS_APPLE, 'IA Plus: el mismo id que en Apple');
  const plugin = leer('android/app/src/main/java/ar/com/gize/app/GizeComprasPlugin.java');
  t.ok(plugin.includes('static final String PLAN_BASE = "' + P.PLAN_BASE + '";'), 'el plan base es el mismo que el del plugin de Android: ' + P.PLAN_BASE);

  // ---------- 2) Las reglas ----------
  const R = await importar(DIR + '/reglas.ts');
  {
    const est = (s, rev = false) => R.estadoDe(T1, s, ahora, rev);
    let e = est(sub());
    t.eq([e.estado, e.activa, e.plan, e.max, e.hasta, e.renueva, e.autoRenueva, e.plus, e.prueba, e.reconocida, e.orden],
      ['activa', true, 'p25', 25, ahora + 30 * DIA, true, true, false, false, false, 'GPA.0000-0000-0000-00001'], 'activa: da el plan hasta el vencimiento y se renueva');
    e = est(sub({ subscriptionState: 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD' }));
    t.ok(e.estado === 'gracia' && e.activa && e.renueva, 'en período de gracia: sigue dando el plan');
    e = est(sub({ subscriptionState: 'SUBSCRIPTION_STATE_CANCELED' }, { autoRenewingPlan: { autoRenewEnabled: false } }));
    t.ok(e.estado === 'cancelada' && e.activa && !e.renueva && e.hasta === ahora + 30 * DIA, 'cancelada pero vigente: da el plan hasta el vencimiento y no se renueva');
    e = est(sub({ subscriptionState: 'SUBSCRIPTION_STATE_CANCELED' }, { expiryTime: iso(ahora - DIA), autoRenewingPlan: { autoRenewEnabled: false } }));
    t.ok(!e.activa && e.hasta === ahora - DIA, 'cancelada y vencida: no da');
    for (const [st, nombre] of [['SUBSCRIPTION_STATE_ON_HOLD', 'espera'], ['SUBSCRIPTION_STATE_PAUSED', 'pausada'], ['SUBSCRIPTION_STATE_EXPIRED', 'vencida']]){
      e = est(sub({ subscriptionState: st }));
      t.ok(e.estado === nombre && !e.activa && !e.renueva && e.hasta <= ahora, nombre + ': no da el plan (a lo sumo hasta ahora)');
    }
    t.ok(est(sub({ subscriptionState: 'SUBSCRIPTION_STATE_ON_HOLD' })).autoRenueva, 'en espera: Google la sigue intentando renovar (hay que cancelarla al borrar la cuenta)');
    e = est(sub(), true);
    t.ok(!e.activa && e.revocada && e.hasta === ahora && !e.autoRenueva, 'revocada: no da el plan y corta ahora');
    e = est(sub({ subscriptionState: 'SUBSCRIPTION_STATE_PENDING' }, { expiryTime: undefined, latestSuccessfulOrderId: undefined }));
    t.ok(e.pendiente && !e.activa && e.hasta === 0 && e.estado === 'pendiente', 'pendiente: no da nada todavía');
    t.eq(R.revisarSub(sub({ subscriptionState: 'SUBSCRIPTION_STATE_PENDING' }, { expiryTime: undefined })), '', 'una pendiente sin vencimiento es válida');
    t.eq(est(sub({ testPurchase: {} })).prueba, true, 'compra de prueba (licencias de Google)');
    t.eq(est(sub({ acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' })).reconocida, true, 'ya reconocida');
    // Dos líneas: vale la pagada que llega más lejos.
    const dos = sub({ lineItems: [linea({ productId: P25, expiryTime: iso(ahora + 10 * DIA) }), linea({ productId: P50, expiryTime: iso(ahora + 30 * DIA) }),
      linea({ productId: 'ar.com.gize.app.coach.p100', expiryTime: iso(ahora + 60 * DIA), latestSuccessfulOrderId: undefined })] });
    t.eq(R.itemVigente(dos).productId, P50, 'itemVigente: de dos líneas pagadas, la que llega más lejos (no la que todavía no se pagó)');
    t.eq([est(dos).plan, est(dos).max], ['p50', 50], 'y da ese plan');
    for (const [que, s] of [['producto desconocido', sub({}, { productId: 'otro.producto' })], ['estado desconocido', sub({ subscriptionState: 'SUBSCRIPTION_STATE_UNSPECIFIED' })],
      ['sin vencimiento', sub({}, { expiryTime: undefined })], ['mezcla planes e IA Plus', sub({ lineItems: [linea(), linea({ productId: PLUS })] })], ['sin datos', null]])
      t.eq(R.revisarSub(s), que, 'revisarSub rechaza: ' + que);
    t.eq(R.revisarSub(sub({ lineItems: [linea({ productId: 'otro.producto' }), linea()] })), '', 'una línea que no es de GIZE al lado de una que sí: vale la de GIZE');
    // La cuenta.
    t.eq(R.cuentaDe(sub()), COACH, 'cuentaDe: obfuscatedExternalAccountId');
    t.eq(R.cuentaDe(sub({ externalAccountIdentifiers: { obfuscatedExternalAccountId: COACH.toUpperCase() } })), COACH, 'en minúsculas');
    t.eq(R.cuentaDe(sub({ externalAccountIdentifiers: undefined, outOfAppPurchaseContext: { expiredExternalAccountIdentifiers: { obfuscatedExternalAccountId: OTRO }, expiredPurchaseToken: T1 } })), OTRO,
      'cuentaDe: volvió a suscribirse desde Play Store (outOfAppPurchaseContext)');
    t.eq([R.cuentaDe(sub({ externalAccountIdentifiers: { obfuscatedExternalAccountId: 'coach@prueba.test' } })), R.cuentaDe(sub({ externalAccountIdentifiers: undefined }))], [null, null], 'sin un UUID no hay cuenta');
    t.eq(R.tokensRelacionados(sub({ linkedPurchaseToken: T1, outOfAppPurchaseContext: { expiredPurchaseToken: T2 } })), [T1, T2], 'las compras de las que puede salir la cuenta');
    t.ok(!R.tokenValido('a/b') && !R.tokenValido('corto') && !R.tokenValido('x'.repeat(1001)) && R.tokenValido(T1), 'el código de la compra: solo letras, números, «.», «_» y «-», largo acotado');

    // coach_billing.
    const activa = est(sub());
    const cur = (o = {}) => Object.assign({ plan: 'trial', max_clients: 10, paid_until: null, google_token: null, google_vence: null, google_renueva: false }, o);
    let c = R.cambiosBilling(cur(), activa, ahora);
    t.eq([c.plan, c.max_clients, c.paid_until, c.google_token, c.google_vence, c.google_renueva], ['p25', 25, iso(ahora + 30 * DIA), T1, iso(ahora + 30 * DIA), true], 'activa: plan, tope y lo pagado de Google');
    const dosVeces = R.cambiosBilling(Object.assign(cur(), c), activa, ahora);
    t.eq([dosVeces.plan, dosVeces.paid_until, dosVeces.google_vence], [c.plan, c.paid_until, c.google_vence], 'aplicar dos veces da lo mismo');
    c = R.cambiosBilling(cur({ plan: 'p50', paid_until: iso(ahora + 60 * DIA), mp_preapproval_id: 'MP1' }), activa, ahora);
    t.ok(c.paid_until === iso(ahora + 60 * DIA) && !('mp_preapproval_id' in c), 'lo pagado por la web que llega más lejos no se pisa (ni se tocan las columnas de Mercado Pago)');
    c = R.cambiosBilling(cur({ plan: 'cortesia', max_clients: 50 }), activa, ahora);
    t.ok(!('plan' in c) && !('paid_until' in c) && c.google_token === T1, 'cortesía: solo se anota la suscripción');
    c = R.cambiosBilling(cur({ google_token: T2, google_vence: iso(ahora + 30 * DIA), paid_until: iso(ahora + 30 * DIA), plan: 'p50' }), est(sub({ subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED' })), ahora);
    t.eq(c, {}, 'una compra vieja o reemplazada que vence no toca la vigente');
    const vencida = est(sub({ subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED' }, { expiryTime: iso(ahora - DIA) }));
    c = R.cambiosBilling(cur({ plan: 'p25', google_token: T1, google_vence: iso(ahora + 30 * DIA), paid_until: iso(ahora + 30 * DIA) }), vencida, ahora);
    t.eq([c.paid_until, c.google_renueva], [iso(ahora - DIA), false], 'vencida: lo pagado con Google queda hasta donde cubrió');
    c = R.cambiosBilling(cur({ plan: 'p25', google_token: T1, google_vence: iso(ahora + 30 * DIA), paid_until: iso(ahora + 30 * DIA), apple_original_tx: '2000', apple_vence: iso(ahora + 12 * DIA) }), est(sub(), true), ahora);
    t.eq(c.paid_until, iso(ahora + 12 * DIA), 'reembolsada: no baja lo pagado por debajo de una suscripción de Apple vigente');
    c = R.cambiosBilling(cur({ plan: 'p25', google_token: T1, google_vence: iso(ahora + 5 * DIA), paid_until: iso(ahora + 40 * DIA) }), vencida, ahora);
    t.ok(!('paid_until' in c), 'vencida, con lo pagado por la web más lejos: no se toca');
    t.eq(R.liberar(cur({ plan: 'p25', google_token: T1, google_vence: iso(ahora + 30 * DIA), paid_until: iso(ahora + 30 * DIA) }), T1, ahora).paid_until, iso(ahora),
      'liberar: la cuenta que tenía la compra reemplazada la deja de tener');
    t.eq(R.cambiosPlus({ google_token: T2 }, vencida, ahora), {}, 'IA Plus: una compra vieja que vence no pisa la vigente');
    const cp = R.cambiosPlus(null, est(sub({}, { productId: PLUS })), ahora);
    t.eq([cp.google_token, cp.google_vence, cp.google_renueva], [T1, iso(ahora + 30 * DIA), true], 'IA Plus: solo las columnas google_*');
    const fila = R.filaSub(activa, COACH, ahora);
    t.eq([fila.purchase_token, fila.user_id, fila.product_id, fila.order_id, fila.estado, fila.auto_renew, fila.acknowledged, fila.leido_at],
      [T1, COACH, P25, 'GPA.0000-0000-0000-00001', 'activa', true, false, iso(ahora)], 'la fila de google_subs');
    t.ok(!('reemplazada' in fila), 'la fila no borra «reemplazada»');
    // IA Plus de prueba.
    const prueba = est(sub({ testPurchase: {} }, { productId: PLUS }));
    t.ok(!R.pruebaPlusOk(prueba, MAIL_USUARIO, []) && !R.pruebaPlusOk(prueba, MAIL_USUARIO, ['otra@prueba.test']) && R.pruebaPlusOk(prueba, ' Usuario@Prueba.test ', [MAIL_USUARIO]),
      'IA Plus de prueba: solo para los mails de la lista del panel');
    t.ok(R.pruebaPlusOk(est(sub({}, { productId: PLUS })), null, []), 'IA Plus pagado: para cualquiera');
    // Los avisos de Pub/Sub.
    const av = n => R.leerAviso(Object.assign({ packageName: 'ar.com.gize.app' }, n), 'ar.com.gize.app');
    t.eq(av({ testNotification: { version: '1.0' } }), { tipo: 'prueba' }, 'aviso: el mensaje de prueba de Play Console');
    t.eq(av({ subscriptionNotification: { notificationType: 2, purchaseToken: T1 } }), { tipo: 'suscripcion', token: T1, revocada: false }, 'aviso: renovación');
    t.eq(av({ subscriptionNotification: { notificationType: 12, purchaseToken: T1 } }).revocada, true, 'aviso: revocada (12)');
    t.eq(av({ voidedPurchaseNotification: { purchaseToken: T1, orderId: 'GPA.1', productType: 1, refundType: 1 } }), { tipo: 'anulada', token: T1, revocada: true }, 'aviso: compra de suscripción anulada');
    t.eq(av({ voidedPurchaseNotification: { purchaseToken: T1, productType: 2 } }).tipo, 'ignorar', 'aviso: compra única anulada, se ignora');
    t.eq(R.leerAviso({ packageName: 'otra.app', testNotification: {} }, 'ar.com.gize.app'), { tipo: 'ignorar', motivo: 'otra app' }, 'aviso de otra app: se ignora');
    t.eq(av({ subscriptionNotification: { notificationType: 2, purchaseToken: 'a/b' } }).tipo, 'ignorar', 'aviso con un código de compra raro: se ignora');
    t.eq(av({ oneTimeProductNotification: {} }).tipo, 'ignorar', 'aviso de un producto único: se ignora');
  }

  // ---------- 3) oidc.ts ----------
  const O = await importar(DIR + '/oidc.ts');
  {
    const g = googleSim();
    const f = globalThis.fetch;
    globalThis.fetch = g.fetch;
    try {
      const ok = await O.verificarOIDC(tokenOidc(), { audiencia: AUD, email: SA.client_email });
      t.eq(ok.email, SA.client_email, 'oidc: un token de Google bien firmado pasa');
      t.ok(await O.verificarOIDC(tokenOidc({ iss: 'accounts.google.com' }), { audiencia: AUD, email: SA.client_email }), 'oidc: emisor sin https también');
      const no = async (que, tok, o = {}) => {
        let err = null;
        try { await O.verificarOIDC(tok, Object.assign({ audiencia: AUD, email: SA.client_email }, o)); } catch (e) { err = e; }
        t.ok(err instanceof O.TokenInvalido, 'oidc rechaza: ' + que + (err && !(err instanceof O.TokenInvalido) ? ' (' + err.message + ')' : ''));
      };
      await no('firma de otra clave', tokenOidc({}, { clave: otraClave.privateKey }));
      await no('clave desconocida', tokenOidc({}, { kid: 'otra' }));
      await no('otra audiencia', tokenOidc({ aud: 'https://otro.supabase.co/functions/v1/compras-google' }));
      await no('otra cuenta de servicio', tokenOidc({ email: 'otra-cuenta@prueba.test' }));
      await no('mail sin verificar', tokenOidc({ email_verified: false }));
      await no('otro emisor', tokenOidc({ iss: 'https://otro.example' }));
      await no('vencido', tokenOidc({ exp: Math.floor(Date.now() / 1000) - 3600 }));
      await no('del futuro', tokenOidc({ iat: Math.floor(Date.now() / 1000) + 3600 }));
      await no('otro algoritmo', tokenOidc({}, { alg: 'HS256' }));
      await no('datos cambiados', tokenOidc().replace(/\.[^.]+\./, '.' + b64u(JSON.stringify({ aud: AUD, email: SA.client_email, email_verified: true, iss: 'accounts.google.com', exp: 9e9, iat: 1 })) + '.'));
      await no('sin token', '');
      await no('cualquier cosa', 'no.es.unjwt');
      t.eq(g.de(CERTS).length, 1, 'oidc: las claves de Google se piden una vez y se guardan (un «kid» desconocido no hace pedirlas de nuevo enseguida)');
      t.ok(g.llamadas.every(l => l.tope), 'oidc: con tiempo máximo');
    } finally { globalThis.fetch = f; }
  }

  // ---------- 4) La función ----------
  const src = leer(DIR + '/index.ts'), compartido = leer('supabase/functions/_shared/google-play.ts');
  t.ok(!/Deno\.env/.test(leer(DIR + '/reglas.ts') + leer(DIR + '/oidc.ts') + leer(DIR + '/planes.ts')), 'las reglas, la verificación y los productos no dependen de secrets');
  t.ok((src.match(/Deno\.env\.get\("([A-Z_]+)"\)/g) || []).every(s => /SUPABASE_(URL|ANON_KEY|SERVICE_ROLE_KEY)/.test(s)) &&
    (compartido.match(/Deno\.env\.get\("([A-Z_]+)"\)/g) || []).every(s => s.includes('GOOGLE_PLAY_SA')), 'solo usa las variables de Supabase y GOOGLE_PLAY_SA');
  t.ok((compartido.match(/fetch\(/g) || []).length === (compartido.match(/signal: AbortSignal\.timeout\(/g) || []).length, 'cada fetch a Google tiene tiempo máximo (en el código)');
  t.ok(/DEVELOPER_REQUESTED_STOP_PAYMENTS/.test(compartido), 'al cancelar, Google deja de cobrar (no se puede deshacer: la cuenta se borra)');

  // Sin GOOGLE_PLAY_SA: 503 y nada más.
  {
    const b = base(), g = googleSim({ subs: { [T1]: sub() } });
    const m = await montar(b, g, { clave: false });
    let r = await m.app({ token: T1, producto: P25 });
    t.ok(r.status === 503 && r.body.codigo === 'sin-clave', 'sin GOOGLE_PLAY_SA: la compra contesta 503: ' + JSON.stringify(r));
    r = await m.google(avisoSub(T1, 4));
    t.eq(r.status, 503, 'sin GOOGLE_PLAY_SA: el aviso contesta 503 (Pub/Sub reintenta)');
    t.ok(!g.llamadas.length && !b.escrituras.length, 'sin GOOGLE_PLAY_SA no llama a Google ni escribe nada');
  }

  // Compra válida desde la app.
  {
    const b = base(), g = googleSim({ subs: { [T1]: sub() } });
    const m = await montar(b, g);
    let r = await m.app({ token: T1, producto: P50 });
    t.eq([r.status, r.body], [200, { ok: true }], 'compra válida desde la app: ok');
    const bill = b.bill(COACH);
    t.eq([bill.plan, bill.max_clients, bill.paid_until, bill.google_token, bill.google_vence, bill.google_renueva], ['p25', 25, iso(ahora + 30 * DIA), T1, iso(ahora + 30 * DIA), true],
      'coach_billing: el plan que dice Google (no el que mandó la app), el tope, lo pagado y google_*');
    const fila = b.sub(T1);
    t.ok(fila && fila.user_id === COACH && fila.product_id === P25 && fila.estado === 'activa' && fila.auto_renew === true && fila.acknowledged === true && fila.order_id === 'GPA.0000-0000-0000-00001',
      'google_subs: la compra anotada y reconocida: ' + JSON.stringify(fila));
    const acks = g.de('reconocer');
    t.ok(acks.length === 1 && acks[0].url.includes('/purchases/subscriptions/' + P25 + '/tokens/' + T1 + ':acknowledge'), 'se reconoce una vez, con el producto correcto');
    t.ok(b.T.ia_plus.length === 0, 'un plan de coach no toca ia_plus');
    r = await m.app({ token: T1, producto: P25 });
    t.ok(r.status === 200 && g.de('reconocer').length === 1 && b.bill(COACH).paid_until === iso(ahora + 30 * DIA), 'mandarla dos veces da lo mismo (y no se reconoce de nuevo)');
    t.ok(g.llamadas.every(l => l.tope), 'todas las llamadas a Google con tiempo máximo');
    const todo = m.logs.join('\n');
    t.ok(!todo.includes(T1) && !/@/.test(todo), 'los registros no tienen el código de la compra ni mails');
  }

  {
    // Ya anotada como reconocida (por la app o por un aviso anterior), aunque Google todavía no lo
    // muestre: no se reconoce de nuevo.
    const b = base({ subs: [{ purchase_token: T1, user_id: COACH, product_id: P25, estado: 'activa', auto_renew: true, acknowledged: true }] });
    const g = googleSim({ subs: { [T1]: sub() } });
    const m = await montar(b, g);
    const r = await m.app({ token: T1, producto: P25 });
    t.ok(r.status === 200 && !r.body.reconocer && !g.de('reconocer').length && b.sub(T1).acknowledged === true && b.bill(COACH).plan === 'p25',
      'ya anotada como reconocida: da el plan sin reconocerla de nuevo: ' + JSON.stringify(r));
  }

  // Lo que no se acepta: sin reconocer y sin tocar el plan.
  for (const [que, o, codigo, status] of [
    ['otra cuenta de GIZE', { subs: { [T1]: sub({ externalAccountIdentifiers: { obfuscatedExternalAccountId: OTRO } }) } }, 'otra-cuenta', 400],
    ['sin cuenta', { subs: { [T1]: sub({ externalAccountIdentifiers: undefined }) } }, 'otra-cuenta', 400],
    ['un alumno con un plan de coach', { usuario: ALUMNO, subs: { [T1]: sub({ externalAccountIdentifiers: { obfuscatedExternalAccountId: ALUMNO } }) } }, 'solo-coach', 403],
    ['producto desconocido', { subs: { [T1]: sub({}, { productId: 'ar.com.otra.app.plan' }) } }, 'invalida', 400],
    ['vencida', { subs: { [T1]: sub({ subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED' }, { expiryTime: iso(ahora - DIA) }) } }, 'vencida', 400],
    ['en espera (Google no pudo cobrar)', { subs: { [T1]: sub({ subscriptionState: 'SUBSCRIPTION_STATE_ON_HOLD' }, { expiryTime: iso(ahora - DIA) }) } }, 'vencida', 400],
    ['que Google no conoce', { subs: {} }, 'invalida', 400],
  ]){
    const b = base({ usuario: o.usuario }), g = googleSim({ subs: o.subs });
    const m = await montar(b, g);
    const r = await m.app({ token: T1, producto: P25 });
    t.ok(r.status === status && r.body.codigo === codigo && !g.de('reconocer').length && !b.escrituras.some(e => e[0] === 'coach_billing'),
      que + ': ' + codigo + ', sin reconocer ni tocar el plan: ' + JSON.stringify(r));
  }
  {
    const b = base(), g = googleSim();
    const m = await montar(b, g);
    const r = await m.app({ token: 'a/b/../c', producto: P25 });
    t.ok(r.status === 400 && r.body.codigo === 'invalida' && !g.llamadas.length, 'un código de compra raro no llega a Google');
  }

  // Pendiente: queda anotada y no da el plan.
  {
    const b = base(), g = googleSim({ subs: { [T1]: sub({ subscriptionState: 'SUBSCRIPTION_STATE_PENDING' }, { expiryTime: undefined, latestSuccessfulOrderId: undefined }) } });
    const m = await montar(b, g);
    let r = await m.app({ token: T1, producto: P25 });
    t.ok(r.status === 400 && r.body.codigo === 'pendiente' && /pendiente/.test(r.body.error), 'pendiente: lo dice: ' + JSON.stringify(r));
    t.ok(b.sub(T1) && b.sub(T1).estado === 'pendiente' && b.bill(COACH).plan === 'trial' && !b.escrituras.some(e => e[0] === 'coach_billing') && !g.de('reconocer').length,
      'pendiente: queda en google_subs, sin plan y sin reconocer');
    // Google cobró: llega el aviso y se activa sola.
    g.subs[T1] = sub();
    r = await m.google(avisoSub(T1, 4));
    t.ok(r.status === 200 && b.bill(COACH).plan === 'p25' && g.de('reconocer').length === 1, 'cuando Google cobra, el aviso la activa y la reconoce: ' + JSON.stringify(r));
  }

  // IA Plus.
  {
    const s = () => sub({ externalAccountIdentifiers: { obfuscatedExternalAccountId: ALUMNO } }, { productId: PLUS });
    let b = base({ usuario: ALUMNO }), g = googleSim({ subs: { [T1]: s() } });
    let m = await montar(b, g);
    let r = await m.app({ token: T1, producto: PLUS });
    t.eq([r.status, r.body], [200, { ok: true }], 'IA Plus de un alumno: ok');
    const p = b.plus(ALUMNO);
    t.ok(p && p.google_token === T1 && p.google_vence === iso(ahora + 30 * DIA) && p.google_renueva === true, 'IA Plus: queda en ia_plus (la fila se crea): ' + JSON.stringify(p));
    t.ok(!b.escrituras.some(e => e[0] === 'coach_billing'), 'IA Plus no toca coach_billing');
    t.ok(g.de('reconocer')[0].url.includes('/subscriptions/' + PLUS + '/tokens/'), 'IA Plus: se reconoce con su producto');
    // De prueba: solo la lista del panel.
    b = base({ usuario: ALUMNO }); g = googleSim({ subs: { [T1]: Object.assign(s(), { testPurchase: {} }) } });
    m = await montar(b, g);
    r = await m.app({ token: T1, producto: PLUS });
    t.ok(r.status === 400 && r.body.codigo === 'prueba' && !b.plus(ALUMNO) && !g.de('reconocer').length, 'IA Plus de prueba fuera de la lista del panel: no se activa: ' + JSON.stringify(r));
    r = await m.google(avisoSub(T1, 4));
    t.ok(r.status === 200 && r.body.ignorado === 'prueba' && !b.plus(ALUMNO), 'y su aviso se ignora');
    b = base({ usuario: ALUMNO, sandbox: [MAIL_USUARIO] }); g = googleSim({ subs: { [T1]: Object.assign(s(), { testPurchase: {} }) } });
    m = await montar(b, g);
    r = await m.app({ token: T1, producto: PLUS });
    t.ok(r.status === 200 && b.plus(ALUMNO) && b.plus(ALUMNO).google_token === T1, 'IA Plus de prueba de una cuenta de la lista: se activa');
    // Un plan de coach de prueba vale para cualquier tester.
    b = base(); g = googleSim({ subs: { [T1]: sub({ testPurchase: {} }) } });
    m = await montar(b, g);
    r = await m.app({ token: T1, producto: P25 });
    t.ok(r.status === 200 && b.bill(COACH).plan === 'p25' && b.sub(T1).test === true, 'plan de coach de prueba: vale (y queda marcado como de prueba)');
  }

  // Cambio de plan: la compra nueva reemplaza a la vieja.
  {
    const b = base({ billing: { [COACH]: { plan: 'p25', max_clients: 25, paid_until: iso(ahora + 10 * DIA), google_token: T1, google_vence: iso(ahora + 10 * DIA), google_renueva: true } },
      subs: [{ purchase_token: T1, user_id: COACH, product_id: P25, estado: 'activa', auto_renew: true, expires_at: iso(ahora + 10 * DIA), acknowledged: true }] });
    const g = googleSim({ subs: { [T2]: sub({ linkedPurchaseToken: T1 }, { productId: P50 }), [T1]: sub({ subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED' }, { expiryTime: iso(ahora - 1000) }) } });
    const m = await montar(b, g);
    let r = await m.app({ token: T2, producto: P50 });
    t.ok(r.status === 200 && b.bill(COACH).plan === 'p50' && b.bill(COACH).max_clients === 50 && b.bill(COACH).google_token === T2 && b.sub(T1).reemplazada === true,
      'cambio de plan: el plan nuevo y la compra vieja queda reemplazada: ' + JSON.stringify(b.bill(COACH)));
    r = await m.google(avisoSub(T1, 13));
    t.ok(r.status === 200 && b.bill(COACH).plan === 'p50' && b.bill(COACH).paid_until === iso(ahora + 30 * DIA), 'el aviso de que venció la vieja no toca el plan nuevo');
  }
  // La misma cuenta de Google cambió de plan desde otra cuenta de GIZE: la anterior lo deja de tener.
  {
    const b = base({ billing: { [OTRO]: { plan: 'p25', max_clients: 25, paid_until: iso(ahora + 10 * DIA), google_token: T1, google_vence: iso(ahora + 10 * DIA), google_renueva: true } },
      subs: [{ purchase_token: T1, user_id: OTRO, product_id: P25, estado: 'activa', auto_renew: true }] });
    const g = googleSim({ subs: { [T2]: sub({ linkedPurchaseToken: T1 }, { productId: P50 }) } });
    const m = await montar(b, g);
    const r = await m.app({ token: T2, producto: P50 });
    const o = b.bill(OTRO);
    t.ok(r.status === 200 && b.bill(COACH).plan === 'p50' && o.google_token === null && Date.parse(o.paid_until) <= Date.now(), 'la otra cuenta de GIZE deja de tener el plan: ' + JSON.stringify(o));
  }

  // Lo que puede fallar.
  {
    let b = base(), g = googleSim({ subs: { [T1]: sub() }, ack: 500 });
    let m = await montar(b, g);
    let r = await m.app({ token: T1, producto: P25 });
    t.ok(r.status === 200 && r.body.ok === true && r.body.reconocer === true && b.bill(COACH).plan === 'p25' && b.sub(T1).acknowledged === false,
      'si no se puede reconocer: queda guardada y la app la reconoce ({ ok, reconocer: true }): ' + JSON.stringify(r));
    b = base(); g = googleSim({ subs: { [T1]: sub() }, leer: { [T1]: 503 } });
    m = await montar(b, g);
    r = await m.app({ token: T1, producto: P25 });
    t.ok(r.status === 500 && !b.escrituras.some(e => e[0] === 'coach_billing'), 'Google caído: 500 y no se toca nada');
    r = await m.google(avisoSub(T1, 2));
    t.eq(r.status, 500, 'Google caído en un aviso: 500 (Pub/Sub reintenta)');
    b = base(); g = googleSim({ subs: { [T1]: sub() }, leer: { [T1]: 403 } });
    m = await montar(b, g);
    r = await m.app({ token: T1, producto: P25 });
    const est = b.T.app_config.find(c => c.key === 'compras_google_estado');
    t.ok(r.status === 500 && est && est.value.error === 'permiso' && est.value.error_at, 'sin permisos en Play Console: 500 y queda anotado para el panel: ' + JSON.stringify(est));
    r = await m.app({ compras: Array.from({ length: 21 }, () => ({ token: T1 })) });
    t.eq(r.status, 400, 'más de 20 compras juntas: no');
  }

  // Varias juntas (al recuperar las compras).
  {
    const b = base(), g = googleSim({ subs: { [T1]: sub(), [T2]: sub({ externalAccountIdentifiers: { obfuscatedExternalAccountId: OTRO } }) } });
    const m = await montar(b, g);
    const r = await m.app({ compras: [{ token: T1, producto: P25 }, { token: T2, producto: P25 }, { token: T3 }] });
    t.eq(r.body.resultados && r.body.resultados.map(x => x.ok ? 'ok' : x.codigo), ['ok', 'otra-cuenta', 'invalida'], 'varias juntas: el resultado de cada una, en orden: ' + JSON.stringify(r.body));
  }

  // Una lectura vieja no pisa una más nueva.
  {
    const b = base({ subs: [{ purchase_token: T1, user_id: COACH, product_id: P25, estado: 'vencida', auto_renew: false, leido_at: iso(Date.now() + 60000) }] });
    const g = googleSim({ subs: { [T1]: sub() } });
    const m = await montar(b, g);
    await m.google(avisoSub(T1, 2));
    t.ok(b.sub(T1).estado === 'vencida' && b.bill(COACH).plan === 'trial', 'lo leído antes no pisa lo que ya se leyó después');
  }

  // ---- Avisos de Google (Pub/Sub) ----
  {
    const b = base(), g = googleSim({ subs: { [T1]: sub() } });
    const m = await montar(b, g);
    for (const [que, tok] of [['sin token', null], ['con firma mala', tokenOidc({}, { clave: otraClave.privateKey })], ['de otra audiencia', tokenOidc({ aud: 'https://otro/functions/v1/compras-google' })],
      ['de otra cuenta de servicio', tokenOidc({ email: 'otra-cuenta@prueba.test' })], ['vencido', tokenOidc({ exp: Math.floor(Date.now() / 1000) - 3600 })]]){
      const r = await m.google(avisoSub(T1, 4), tok);
      t.ok(r.status === 401 && !g.de('leer').length && !b.escrituras.length, 'aviso ' + que + ': 401 sin leer la API ni escribir nada');
    }
    let r = await m.google(aviso({ testNotification: { version: '1.0' } }));
    const est = b.T.app_config.find(c => c.key === 'compras_google_estado');
    t.ok(r.status === 200 && est && est.value.tipo === 'prueba' && Math.abs(Date.parse(est.value.aviso_at) - Date.now()) < 60000, 'el mensaje de prueba de Play Console: 200 y queda anotado para el panel: ' + JSON.stringify(est));
    r = await m.google(aviso({ packageName: 'com.otra.app', subscriptionNotification: { notificationType: 4, purchaseToken: T1 } }));
    t.ok(r.status === 200 && r.body.ignorado === 'otra app' && !g.de('leer').length, 'aviso de otra app: se ignora sin leer nada');
    r = await m.google({ message: { data: Buffer.from('no es json').toString('base64') } });
    t.ok(r.status === 200 && r.body.ignorado, 'aviso ilegible: 200 (si no, Pub/Sub lo reintenta 7 días)');
    // Compra nueva que llega por el aviso (sin pasar por la app).
    r = await m.google(avisoSub(T1, 4));
    t.ok(r.status === 200 && b.bill(COACH).plan === 'p25' && g.de('reconocer').length === 1, 'aviso de compra nueva: da el plan y la reconoce: ' + JSON.stringify(r));
    // Renovación.
    g.subs[T1] = sub({ acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' }, { expiryTime: iso(ahora + 60 * DIA), latestSuccessfulOrderId: 'GPA.0000-0000-0000-00001..0' });
    r = await m.google(avisoSub(T1, 2));
    t.ok(r.status === 200 && b.bill(COACH).paid_until === iso(ahora + 60 * DIA) && b.sub(T1).order_id === 'GPA.0000-0000-0000-00001..0', 'renovación: extiende lo pagado');
    // Cancelación: sigue hasta el vencimiento, sin renovarse.
    g.subs[T1] = sub({ subscriptionState: 'SUBSCRIPTION_STATE_CANCELED', acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' }, { expiryTime: iso(ahora + 60 * DIA), autoRenewingPlan: { autoRenewEnabled: false } });
    r = await m.google(avisoSub(T1, 3));
    t.ok(b.bill(COACH).google_renueva === false && b.bill(COACH).paid_until === iso(ahora + 60 * DIA) && b.bill(COACH).plan === 'p25', 'cancelación: sigue hasta el vencimiento y no se renueva');
    // En espera: Google no pudo cobrar → se corta.
    g.subs[T1] = sub({ subscriptionState: 'SUBSCRIPTION_STATE_ON_HOLD', acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' }, { expiryTime: iso(ahora - 3600000) });
    r = await m.google(avisoSub(T1, 5));
    t.ok(r.status === 200 && Date.parse(b.bill(COACH).paid_until) <= Date.now() && b.sub(T1).estado === 'espera', 'en espera: el plan se corta: ' + b.bill(COACH).paid_until);
    // Recuperada.
    g.subs[T1] = sub({ acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' }, { expiryTime: iso(ahora + 29 * DIA) });
    r = await m.google(avisoSub(T1, 1));
    t.ok(b.bill(COACH).paid_until === iso(ahora + 29 * DIA) && b.bill(COACH).google_renueva === true, 'recuperada: vuelve el plan');
    // Revocada (reembolso con revocación).
    g.subs[T1] = sub({ subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED', acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' }, { expiryTime: iso(ahora + 29 * DIA), autoRenewingPlan: { autoRenewEnabled: false } });
    r = await m.google(avisoSub(T1, 12));
    t.ok(Date.parse(b.bill(COACH).paid_until) <= Date.now() && b.sub(T1).revoked === true && b.bill(COACH).google_renueva === false, 'revocada: se corta ahora y queda marcada');
    t.ok(g.llamadas.every(l => l.tope), 'avisos: todas las llamadas a Google con tiempo máximo');
    const todo = m.logs.join('\n');
    t.ok(!todo.includes(T1) && !/@/.test(todo), 'avisos: los registros no tienen el código de la compra ni mails');
  }
  {
    // Compra anulada (reembolso desde Play Console).
    const b = base({ billing: { [COACH]: { plan: 'p25', max_clients: 25, paid_until: iso(ahora + 20 * DIA), google_token: T1, google_vence: iso(ahora + 20 * DIA), google_renueva: true } },
      subs: [{ purchase_token: T1, user_id: COACH, product_id: P25, estado: 'activa', auto_renew: true, acknowledged: true }] });
    const g = googleSim({ subs: { [T1]: sub({ subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED', acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' }, { expiryTime: iso(ahora + 20 * DIA) }) } });
    const m = await montar(b, g);
    const r = await m.google(aviso({ voidedPurchaseNotification: { purchaseToken: T1, orderId: 'GPA.0000-0000-0000-00001', productType: 1, refundType: 1 } }));
    t.ok(r.status === 200 && Date.parse(b.bill(COACH).paid_until) <= Date.now() && b.sub(T1).revoked === true, 'compra anulada: se corta el plan y queda marcada como revocada');
  }
  {
    // Aviso de una cuenta que ya no existe y Google la sigue renovando: se cancela.
    const b = base(), g = googleSim({ subs: { [T1]: sub({ externalAccountIdentifiers: { obfuscatedExternalAccountId: BORRADA } }) } });
    const m = await montar(b, g);
    let r = await m.google(avisoSub(T1, 2));
    const c = g.de('cancelar');
    t.ok(r.status === 200 && c.length === 1 && c[0].url.endsWith('/subscriptionsv2/tokens/' + T1 + ':cancel') && JSON.parse(c[0].cuerpo).cancellationContext.cancellationType === 'DEVELOPER_REQUESTED_STOP_PAYMENTS' && !b.escrituras.some(e => e[0] !== 'app_config'),
      'aviso de una cuenta borrada que se renueva: se cancela (sin anotar nada): ' + JSON.stringify(r));
    g.subs[T1] = sub({ subscriptionState: 'SUBSCRIPTION_STATE_CANCELED', externalAccountIdentifiers: { obfuscatedExternalAccountId: BORRADA } }, { autoRenewingPlan: { autoRenewEnabled: false } });
    r = await m.google(avisoSub(T1, 3));
    t.ok(r.status === 200 && g.de('cancelar').length === 1, 'si ya no se renueva, no se cancela de nuevo');
    g.cancel = 503; g.subs[T1] = sub({ externalAccountIdentifiers: { obfuscatedExternalAccountId: BORRADA } });
    r = await m.google(avisoSub(T1, 2));
    t.eq(r.status, 500, 'si Google no deja cancelar, 500 (Pub/Sub reintenta)');
  }
  {
    // Un alumno no tiene plan de coach aunque llegue el aviso; IA Plus de una cuenta sí.
    const b = base(), g = googleSim({ subs: { [T1]: sub({ externalAccountIdentifiers: { obfuscatedExternalAccountId: ALUMNO } }) } });
    const m = await montar(b, g);
    const r = await m.google(avisoSub(T1, 4));
    t.ok(r.status === 200 && r.body.ignorado === 'sin coach' && !g.de('reconocer').length, 'aviso del plan de coach de un alumno: se ignora y no se reconoce');
  }

  // ---- «salud» para el panel ----
  {
    let b = base(), g = googleSim();
    let m = await montar(b, g);
    let r = await m.app({ accion: 'salud' });
    t.eq(r.status, 403, 'salud: solo administradores');
    b = base({ esAdmin: true }); m = await montar(b, g, { clave: false });
    r = await m.app({ accion: 'salud' });
    t.eq([r.status, r.body], [200, { clave: false, acceso: false }], 'salud sin GOOGLE_PLAY_SA: falta la clave');
    m = await montar(b, g);
    r = await m.app({ accion: 'salud' });
    t.eq(r.body, { clave: true, acceso: true }, 'salud con la clave: anda');
    g.oauth = 400;
    r = await m.app({ accion: 'salud' });
    t.eq(r.body, { clave: true, acceso: false }, 'salud con una clave que Google no acepta: no anda (no usa el acceso guardado)');
  }

  // ---- Publicación ----
  const wf = leer('.github/workflows/supabase.yml');
  t.ok(/for fn in [^\n]*\bcompras-google\b/.test(wf), 'el workflow publica compras-google');
  t.ok(/compras-google los\s+# avisos de Google Play por Pub\/Sub \(verifica el token OIDC de Google\)/.test(wf), 'y explica por qué va sin «Verify JWT»');
}
