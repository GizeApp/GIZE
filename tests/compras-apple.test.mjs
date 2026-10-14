// Planes de coach comprados con Apple en la app de iPhone (supabase/functions/compras-apple):
// - La verificación de lo que firma Apple (jws.ts): la raíz fijada es la de Apple (su huella
//   publicada) y un intermedio real de Apple (WWDR G6) verifica contra ella.
// - La función corriendo en Node (tests/funcion.mjs) con una autoridad de prueba creada acá (raíz,
//   intermedio y hoja ES256): la raíz de prueba entra reemplazando raiz-apple.ts al cargar la
//   función (sim.modulos). En la función publicada no hay forma de cambiarla: se controla abajo.
// - Una compra válida desde la app pone el plan en coach_billing (y anota apple_subs); se rechazan
//   la de otra app, la de otra cuenta, la de un producto desconocido, la firma mala, la cadena que
//   no termina en la raíz, el certificado que no es de compras y la suscripción vencida. Mandarla
//   dos veces da lo mismo.
// - Los avisos de Apple (App Store Server Notifications V2): renovación, vencimiento, reembolso,
//   cambio de la renovación automática, período de gracia, tipos desconocidos y firma mala.
// - Un plan pagado por la web (Mercado Pago) no se pisa, y las columnas de Mercado Pago no se tocan.
// - Los productos de la función y los de la app son los mismos.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { funcion, supabaseSimulado, cumple } from './funcion.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = 'supabase/functions/compras-apple';
const leer = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const importar = f => import(pathToFileURL(path.join(ROOT, f)).href);

// Huella SHA-256 de «Apple Root CA - G3» que publica Apple (support.apple.com/en-us/102666).
const HUELLA_APPLE_G3 = '63 34 3A BF B8 9A 6A 03 EB B5 7E 9B 3F 5F A7 BE 7C 4F 5C 75 6F 30 17 B3 A8 C4 88 C3 65 3E 91 79'.replace(/ /g, '').toLowerCase();
// Intermedio real de Apple para las compras («Apple Worldwide Developer Relations Certification
// Authority», G6), bajado de https://www.apple.com/certificateauthority/AppleWWDRCAG6.cer.
const WWDR_G6 = `MIIDFjCCApygAwIBAgIUIsGhRwp0c2nvU4YSycafPTjzbNcwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwSQXBwbGUgUm9vdCBDQSAt
IEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMC
VVMwHhcNMjEwMzE3MjAzNzEwWhcNMzYwMzE5MDAwMDAwWjB1MUQwQgYDVQQDDDtBcHBsZSBXb3JsZHdpZGUgRGV2ZWxvcGVyIFJl
bGF0aW9ucyBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTELMAkGA1UECwwCRzYxEzARBgNVBAoMCkFwcGxlIEluYy4xCzAJBgNVBAYT
AlVTMHYwEAYHKoZIzj0CAQYFK4EEACIDYgAEbsQKC94PrlWmZXnXgtxzdVJL8T0SGYngDRGpngn3N6PT8JMEb7FDi4bBmPhCnZ3/
sq6PF/cGcKXWsL5vOteRhyJ45x3ASP7cOB+aao90fcpxSv/EZFbniAbNgZGhIhpIo4H6MIH3MBIGA1UdEwEB/wQIMAYBAf8CAQAw
HwYDVR0jBBgwFoAUu7DeoVgziJqkipnevr3rr9rLJKswRgYIKwYBBQUHAQEEOjA4MDYGCCsGAQUFBzABhipodHRwOi8vb2NzcC5h
cHBsZS5jb20vb2NzcDAzLWFwcGxlcm9vdGNhZzMwNwYDVR0fBDAwLjAsoCqgKIYmaHR0cDovL2NybC5hcHBsZS5jb20vYXBwbGVy
b290Y2FnMy5jcmwwHQYDVR0OBBYEFD8vlCNR01DJmig97bB85c+lkGKZMA4GA1UdDwEB/wQEAwIBBjAQBgoqhkiG92NkBgIBBAIF
ADAKBggqhkjOPQQDAwNoADBlAjBAXhSq5IyKogMCPtw490BaB677CaEGJXufQB/EqZGd6CSjiCtOnuMTbXVXmxxcxfkCMQDTSPxa
rZXvNrkxU3TkUMI33yzvFVVRT4wxWJC994OsdcZ4+RGNsYDyR5gmdr0nDGg=`.replace(/\s+/g, '');

// ---- Autoridad de prueba: certificados X.509 armados a mano (DER) y firmados con Node ----
const largo = n => n < 128 ? [n] : n < 256 ? [0x81, n] : [0x82, n >> 8, n & 255];
const tlv = (tag, ...partes) => { const c = Buffer.concat(partes); return Buffer.concat([Buffer.from([tag, ...largo(c.length)]), c]); };
const seq = (...p) => tlv(0x30, ...p);
function oid(s){
  const a = s.split('.').map(Number), out = [a[0] * 40 + a[1]];
  for (const n of a.slice(2)){ const b = [n & 127]; let x = Math.floor(n / 128); while (x){ b.unshift((x & 127) | 128); x = Math.floor(x / 128); } out.push(...b); }
  return tlv(6, Buffer.from(out));
}
const nombre = cn => seq(tlv(0x31, seq(oid('2.5.4.3'), tlv(0x0c, Buffer.from(cn)))));
const tiempo = d => tlv(0x18, Buffer.from(d.toISOString().replace(/[-:T]/g, '').slice(0, 14) + 'Z'));
const OID_HOJA = '1.2.840.113635.100.6.11.1', OID_INTER = '1.2.840.113635.100.6.2.1';
function certificado({ serie, sujeto, emisor, pub, firma, ca = false, oids = [], desde, hasta }){
  const alg = seq(oid('1.2.840.10045.4.3.3')); // ecdsa-with-SHA384
  const ext = [];
  if (ca) ext.push(seq(oid('2.5.29.19'), tlv(1, Buffer.from([0xff])), tlv(4, seq(tlv(1, Buffer.from([0xff]))))));
  for (const o of oids) ext.push(seq(oid(o), tlv(4, tlv(5, Buffer.alloc(0)))));
  const tbs = seq(tlv(0xa0, tlv(2, Buffer.from([2]))), tlv(2, Buffer.from([serie])), alg, nombre(emisor), seq(tiempo(desde), tiempo(hasta)),
    nombre(sujeto), pub.export({ type: 'spki', format: 'der' }), tlv(0xa3, seq(...ext)));
  return seq(tbs, alg, tlv(3, Buffer.concat([Buffer.from([0]), crypto.sign('sha384', tbs, firma)])));
}
const DIA = 864e5;
// de: otra autoridad cuya raíz se reusa (para probar un intermedio o una hoja distintos bajo la
// raíz que acepta la función).
function autoridad({ oidHoja = true, oidInter = true, interCA = true, hojaHasta = null, nombreRaiz = 'Raiz de prueba', de = null } = {}){
  const kr = de ? de.claveRaiz : crypto.generateKeyPairSync('ec', { namedCurve: 'P-384' });
  const ki = crypto.generateKeyPairSync('ec', { namedCurve: 'P-384' });
  const kh = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const desde = new Date(Date.now() - 365 * DIA), hasta = new Date(Date.now() + 365 * DIA);
  const raiz = de ? de.raiz : certificado({ serie: 1, sujeto: nombreRaiz, emisor: nombreRaiz, pub: kr.publicKey, firma: kr.privateKey, ca: true, desde, hasta });
  const inter = certificado({ serie: 2, sujeto: 'Intermedio de prueba', emisor: nombreRaiz, pub: ki.publicKey, firma: kr.privateKey, ca: interCA, oids: oidInter ? [OID_INTER] : [], desde, hasta });
  const hoja = certificado({ serie: 3, sujeto: 'Hoja de prueba', emisor: 'Intermedio de prueba', pub: kh.publicKey, firma: ki.privateKey, oids: oidHoja ? [OID_HOJA] : [], desde, hasta: hojaHasta || hasta });
  return { raiz, inter, hoja, claveHoja: kh.privateKey, claveRaiz: kr, pubRaiz: kr.publicKey, pubInter: ki.publicKey,
    pem: '-----BEGIN CERTIFICATE-----\n' + raiz.toString('base64').replace(/(.{64})/g, '$1\n') + '\n-----END CERTIFICATE-----\n',
    huella: crypto.createHash('sha256').update(raiz).digest('hex') };
}
const b64u = b => Buffer.from(b).toString('base64url');
function firmar(ca, datos, { cadena, alg = 'ES256', clave } = {}){
  const cab = b64u(JSON.stringify({ alg, x5c: (cadena || [ca.hoja, ca.inter, ca.raiz]).map(c => c.toString('base64')) }));
  const cuerpo = b64u(JSON.stringify(datos));
  const sig = crypto.sign('sha256', Buffer.from(cab + '.' + cuerpo), { key: clave || ca.claveHoja, dsaEncoding: 'ieee-p1363' });
  return cab + '.' + cuerpo + '.' + b64u(sig);
}

// ---- La compra, la base y la función ----
const COACH = 'c0ac4000-0000-4000-8000-0000000000a1', OTRO = 'c0ac4000-0000-4000-8000-0000000000b2', ALUMNO = 'a1a1a1a1-0000-4000-8000-000000000001';
const ahora = Date.now();
const iso = ms => new Date(ms).toISOString();
const tx = (o = {}) => Object.assign({
  transactionId: '2000000000000001', originalTransactionId: '2000000000000001', bundleId: 'ar.com.gize.app',
  productId: 'ar.com.gize.app.coach.p25', purchaseDate: ahora - 60000, expiresDate: ahora + 30 * DIA, type: 'Auto-Renewable Subscription',
  appAccountToken: COACH, environment: 'Sandbox', signedDate: ahora - 50000, inAppOwnershipType: 'PURCHASED',
}, o);
const ren = (o = {}) => Object.assign({ originalTransactionId: '2000000000000001', autoRenewProductId: 'ar.com.gize.app.coach.p25', productId: 'ar.com.gize.app.coach.p25',
  autoRenewStatus: 1, environment: 'Sandbox', signedDate: ahora }, o);
const aviso = (ca, tipo, t, r, o = {}) => firmar(ca, Object.assign({ notificationType: tipo, notificationUUID: crypto.randomUUID(), version: '2.0', signedDate: ahora,
  data: { bundleId: 'ar.com.gize.app', environment: 'Sandbox', appAppleId: 1, status: 1, signedTransactionInfo: t && firmar(ca, t), signedRenewalInfo: r ? firmar(ca, r) : undefined } }, o));

function escenario(ca, { billing = {}, usuario = COACH, roles = { [COACH]: 'coach', [OTRO]: 'coach', [ALUMNO]: 'client' }, subs = [] } = {}){
  const fila = (id, o) => Object.assign({ coach_id: id, plan: 'trial', max_clients: 10, trial_ends_at: iso(ahora - 3 * DIA), paid_until: null, pending_plan: null,
    mp_preapproval_id: null, mp_status: null, mp_pending_id: null, apple_original_tx: null, apple_vence: null, apple_renueva: false, updated_at: '2026-10-01T00:00:00.000001+00:00' }, o);
  const bill = { [COACH]: fila(COACH, billing[COACH] || billing), [OTRO]: fila(OTRO, billing[OTRO] || {}) };
  const tabla = subs.map(s => Object.assign({}, s));
  const escrituras = [];
  const id = (q, c) => (q.filtros.find(f => f[0] === 'eq' && f[1] === c) || [])[2];
  const db = supabaseSimulado(q => {
    if (q.tabla === 'profiles'){ const r = roles[id(q, 'id')]; return { data: r ? { role: r } : null }; }
    if (q.tabla === 'coach_billing'){
      const f = bill[id(q, 'coach_id')];
      if (q.accion === 'select') return { data: f ? Object.assign({}, f) : null };
      if (q.accion === 'update'){
        escrituras.push(['coach_billing', id(q, 'coach_id'), q.valores]);
        if (!f || !cumple(f, q.filtros)) return { data: [] };
        Object.assign(f, q.valores); return { data: [{ coach_id: f.coach_id }] };
      }
    }
    if (q.tabla === 'apple_subs'){
      const hay = tabla.filter(r => cumple(r, q.filtros));
      if (q.accion === 'select') return { data: hay[0] ? Object.assign({}, hay[0]) : null };
      if (q.accion === 'insert'){
        escrituras.push(['apple_subs', 'insert', q.valores]);
        if (tabla.some(r => r.original_transaction_id === q.valores.original_transaction_id)) return { error: { code: '23505', message: 'duplicada' } };
        tabla.push(Object.assign({}, q.valores)); return { data: null };
      }
      if (q.accion === 'update'){ escrituras.push(['apple_subs', 'update', q.valores]); hay.forEach(r => Object.assign(r, q.valores)); return { data: hay.map(r => ({ original_transaction_id: r.original_transaction_id })) }; }
    }
    return { data: null };
  }, { user: usuario ? { id: usuario, email: 'coach@prueba.test' } : null });
  return { db, bill, tabla, escrituras };
}

async function montar(ca, esc, raiz){
  const fn = await funcion('compras-apple', {
    env: { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'srv' },
    npm: { '@supabase/supabase-js': { createClient: () => esc.db } },
    modulos: { './raiz-apple.ts': raiz || { RAIZ_APPLE_G3: ca.pem, RAIZ_APPLE_G3_SHA256: ca.huella } },
  });
  const pedir = async (cuerpo, auth = true) => {
    const r = await fn.call(new Request('https://x.supabase.co/functions/v1/compras-apple', { method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, auth ? { Authorization: 'Bearer x' } : {}), body: JSON.stringify(cuerpo) }));
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  return { fn, pedir, app: jws => pedir({ jws }), apple: signedPayload => pedir({ signedPayload }, false) };
}

export default async function ({ t }){
  // ---- 1) La raíz fijada y la verificación con certificados reales de Apple ----
  const J = await importar(DIR + '/jws.ts');
  const R = await importar(DIR + '/raiz-apple.ts');
  const derApple = J.pemADer(R.RAIZ_APPLE_G3);
  t.eq(crypto.createHash('sha256').update(derApple).digest('hex'), HUELLA_APPLE_G3, 'raiz-apple.ts es «Apple Root CA - G3» (la huella que publica Apple)');
  t.eq(R.RAIZ_APPLE_G3_SHA256, HUELLA_APPLE_G3, 'y la huella que controla la función es la de Apple');
  const raizApple = J.leerCertificado(derApple), g6 = J.leerCertificado(Buffer.from(WWDR_G6, 'base64'));
  t.ok(raizApple.esCA && g6.esCA && g6.extensiones.has(J.OID_INTERMEDIO), 'lee los certificados de Apple: autoridades, y el intermedio con la marca de compras');
  t.ok(await J.firmadoPor(g6, raizApple), 'el intermedio real de Apple (WWDR G6) está firmado por la raíz fijada');
  const ca0 = autoridad();
  t.ok(!(await J.firmadoPor(g6, J.leerCertificado(ca0.raiz))), 'y no por otra raíz');
  // La autoridad de prueba es X.509 de verdad (Node la lee y verifica igual).
  const x = [ca0.raiz, ca0.inter, ca0.hoja].map(d => new crypto.X509Certificate(d));
  t.ok(x[1].verify(ca0.pubRaiz) && x[2].verify(ca0.pubInter) && x[1].ca && !x[2].ca, 'la autoridad de prueba es válida para Node');
  t.ok(await J.firmadoPor(J.leerCertificado(ca0.inter), J.leerCertificado(ca0.raiz)) && await J.firmadoPor(J.leerCertificado(ca0.hoja), J.leerCertificado(ca0.inter)), 'y para jws.ts');
  const d0 = await J.verificarJWS(firmar(ca0, tx()), ca0.raiz);
  t.eq([d0.productId, d0.appAccountToken], ['ar.com.gize.app.coach.p25', COACH], 'un JWS bien firmado se lee');
  for (const [que, jws] of [['otra raíz', firmar(ca0, tx())], ['firma cambiada', firmar(ca0, tx()).replace(/\.[^.]+$/, '.' + b64u(Buffer.alloc(64, 7)))]]){
    let err = null; try { await J.verificarJWS(jws, que === 'otra raíz' ? autoridad().raiz : ca0.raiz); } catch (e) { err = e; }
    t.ok(err instanceof J.JWSInvalido, 'jws.ts rechaza: ' + que);
  }

  // ---- 2) La función publicada no puede usar otra raíz ----
  const src = leer(DIR + '/index.ts'), jwsSrc = leer(DIR + '/jws.ts'), reglasSrc = leer(DIR + '/reglas.ts');
  t.ok(/^import \{ RAIZ_APPLE_G3, RAIZ_APPLE_G3_SHA256 \} from "\.\/raiz-apple\.ts";$/m.test(src), 'index.ts toma la raíz solo de raiz-apple.ts');
  t.ok(!/Deno\.env/.test(jwsSrc + reglasSrc + leer(DIR + '/raiz-apple.ts')) && (src.match(/Deno\.env\.get\("([A-Z_]+)"\)/g) || []).every(s => /SUPABASE_(URL|ANON_KEY|SERVICE_ROLE_KEY)/.test(s)),
    'ningún secret ni variable de entorno cambia la raíz ni las reglas (solo las de Supabase)');
  t.ok(/verificarJWS\(jws, await raiz\(\)\)/.test(src) && /verificarJWS\(signedPayload, await raiz\(\)\)/.test(src) && /verificarJWS\(d\.signedTransactionInfo, await raiz\(\)\)/.test(src) &&
    /verificarJWS\(d\.signedRenewalInfo, await raiz\(\)\)/.test(src), 'todo lo que llega se verifica contra esa raíz (también lo que viene adentro del aviso)');
  t.ok(/!== RAIZ_APPLE_G3_SHA256\) throw/.test(src), 'antes de usarla controla su huella');
  // Con la raíz real de Apple, lo firmado por la autoridad de prueba no pasa.
  {
    const e = escenario(ca0);
    const { app } = await montar(ca0, e, { RAIZ_APPLE_G3: R.RAIZ_APPLE_G3, RAIZ_APPLE_G3_SHA256: R.RAIZ_APPLE_G3_SHA256 });
    const r = await app(firmar(ca0, tx()));
    t.ok(r.status === 400 && r.body.codigo === 'invalida' && !e.escrituras.length, 'con la raíz de Apple, una compra firmada por otro no pasa: ' + JSON.stringify(r));
    // Si raiz-apple.ts no coincide con su huella, no acepta nada.
    const e2 = escenario(ca0);
    const m2 = await montar(ca0, e2, { RAIZ_APPLE_G3: ca0.pem, RAIZ_APPLE_G3_SHA256: HUELLA_APPLE_G3 });
    const r2 = await m2.app(firmar(ca0, tx()));
    t.ok(r2.status >= 400 && !e2.escrituras.length, 'una raíz que no coincide con la huella no acepta nada: ' + r2.status);
  }

  // ---- 3) Compras desde la app ----
  const ca = autoridad();
  {
    const e = escenario(ca);
    const { app, pedir } = await montar(ca, e);
    const jws = firmar(ca, tx());
    let r = await app(jws);
    t.eq([r.status, r.body], [200, { ok: true }], 'compra válida: ok');
    const b = e.bill[COACH];
    t.eq([b.plan, b.max_clients, b.paid_until, b.apple_original_tx, b.apple_vence, b.apple_renueva], ['p25', 25, iso(ahora + 30 * DIA), '2000000000000001', iso(ahora + 30 * DIA), true],
      'compra válida: coach_billing con el plan de 25, pagado hasta que vence en Apple');
    t.eq(e.tabla.map(s => [s.original_transaction_id, s.user_id, s.product_id, s.environment, s.revoked, s.expires_at]),
      [['2000000000000001', COACH, 'ar.com.gize.app.coach.p25', 'Sandbox', false, iso(ahora + 30 * DIA)]], 'compra válida: queda en apple_subs');
    t.eq([b.mp_preapproval_id, b.mp_status, b.trial_ends_at], [null, null, iso(ahora - 3 * DIA)], 'no toca Mercado Pago ni la prueba');
    // Dos veces lo mismo: igual.
    const antes = JSON.stringify([e.bill, e.tabla.map(s => Object.assign({}, s, { updated_at: 0 }))]);
    r = await app(jws);
    t.eq(r.status, 200, 'la misma compra otra vez: ok');
    t.eq(JSON.stringify([e.bill, e.tabla.map(s => Object.assign({}, s, { updated_at: 0 }))]).replace(/"updated_at":"[^"]*"/g, ''), antes.replace(/"updated_at":"[^"]*"/g, ''), 'la misma compra otra vez: queda todo igual (sin filas repetidas)');
    // Varias a la vez (restaurar compras): una por una.
    r = await pedir({ jws: [jws, firmar(ca, tx({ appAccountToken: OTRO }))] });
    t.eq(r.body.resultados && r.body.resultados.map(x => x.ok ? 'ok' : x.codigo), ['ok', 'otra-cuenta'], 'restaurar: cada una con su resultado');
  }
  const rechazos = [
    ['de otra app', () => firmar(ca, tx({ bundleId: 'com.otra.app' })), 'invalida'],
    ['de otra cuenta de GIZE', () => firmar(ca, tx({ appAccountToken: OTRO })), 'otra-cuenta'],
    ['sin cuenta', () => firmar(ca, tx({ appAccountToken: undefined })), 'otra-cuenta'],
    ['de un producto desconocido', () => firmar(ca, tx({ productId: 'ar.com.gize.app.coach.p1000' })), 'invalida'],
    ['con la firma cambiada', () => { const [a, , c] = firmar(ca, tx()).split('.'); return a + '.' + b64u(JSON.stringify(tx({ productId: 'ar.com.gize.app.coach.p500' }))) + '.' + c; }, 'invalida'],
    ['firmada por otra hoja', () => firmar(ca, tx(), { clave: crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey }), 'invalida'],
    ['de una cadena que no termina en la raíz', () => { const o = autoridad({ nombreRaiz: 'Raiz de prueba' }); return firmar(o, tx()); }, 'invalida'],
    ['con la raíz bien pero el intermedio de otra', () => { const o = autoridad(); return firmar(o, tx(), { cadena: [o.hoja, o.inter, ca.raiz] }); }, 'invalida'],
    ['con una hoja que no es de compras', () => firmar(autoridad({ de: ca, oidHoja: false }), tx()), 'invalida'],
    ['con un intermedio que no es de compras', () => firmar(autoridad({ de: ca, oidInter: false }), tx()), 'invalida'],
    ['con un intermedio que no es una autoridad', () => firmar(autoridad({ de: ca, interCA: false }), tx()), 'invalida'],
    ['con una hoja de otro intermedio', () => { const o = autoridad({ de: ca }); return firmar(o, tx(), { cadena: [o.hoja, ca.inter, ca.raiz] }); }, 'invalida'],
    ['vencida', () => firmar(ca, tx({ expiresDate: ahora - 1000 })), 'vencida'],
    ['reembolsada', () => firmar(ca, tx({ revocationDate: ahora - 1000 })), 'revocada'],
    ['con otro algoritmo', () => firmar(ca, tx(), { alg: 'HS256' }), 'invalida'],
    ['que no es un JWS', () => 'hola', 'invalida'],
  ];
  for (const [que, jws, codigo] of rechazos){
    // Las de «otra cadena» usan una raíz distinta de la que acepta la función (la de `ca`).
    const e = escenario(ca);
    const { app } = await montar(ca, e);
    const r = await app(jws());
    t.ok(r.status === 400 && r.body.codigo === codigo && !e.escrituras.length && e.bill[COACH].plan === 'trial', 'compra ' + que + ': rechazada (' + codigo + ') sin tocar nada: ' + JSON.stringify(r));
  }
  {
    // La hoja vencida cuando Apple firmó.
    const o = autoridad({ de: ca, hojaHasta: new Date(ahora - DIA) });
    const e = escenario(ca);
    const { app } = await montar(ca, e);
    const r = await app(firmar(o, tx()));
    t.ok(r.status === 400 && !e.escrituras.length, 'compra firmada con un certificado vencido: rechazada');
    // Sin sesión o sin ser coach.
    const e2 = escenario(ca, { usuario: null }), m2 = await montar(ca, e2);
    t.eq((await m2.app(firmar(ca, tx()))).status, 401, 'sin sesión: 401');
    const e3 = escenario(ca, { usuario: ALUMNO }), m3 = await montar(ca, e3);
    const r3 = await m3.app(firmar(ca, tx({ appAccountToken: ALUMNO })));
    t.ok(r3.status === 403 && !e3.escrituras.length, 'una cuenta de alumno no compra planes: 403');
    t.eq((await m3.pedir({ algo: 1 })).status, 400, 'pedido sin jws ni signedPayload: 400');
  }
  {
    // Coach con el plan pagado por la web (Mercado Pago) más largo: no se pisa.
    const web = { plan: 'p50', max_clients: 50, paid_until: iso(ahora + 40 * DIA), mp_preapproval_id: 'MP1', mp_status: 'authorized' };
    const e = escenario(ca, { billing: web });
    const { app } = await montar(ca, e);
    await app(firmar(ca, tx()));
    const b = e.bill[COACH];
    t.eq([b.paid_until, b.mp_preapproval_id, b.mp_status], [web.paid_until, 'MP1', 'authorized'], 'plan de la web más largo: lo pagado y Mercado Pago quedan');
    // Cortesía: solo se anota la suscripción.
    const e2 = escenario(ca, { billing: { plan: 'cortesia', max_clients: 50 } });
    const m2 = await montar(ca, e2);
    await m2.app(firmar(ca, tx()));
    t.eq([e2.bill[COACH].plan, e2.bill[COACH].max_clients, e2.bill[COACH].paid_until, e2.bill[COACH].apple_original_tx], ['cortesia', 50, null, '2000000000000001'], 'cortesía: el plan no cambia');
  }

  // ---- 4) Avisos de Apple ----
  {
    const e = escenario(ca);
    const { app, apple } = await montar(ca, e);
    await app(firmar(ca, tx()));
    const b = e.bill[COACH];
    // Renovación: un mes más.
    const renovada = tx({ transactionId: '2000000000000002', expiresDate: ahora + 60 * DIA, purchaseDate: ahora + 30 * DIA, signedDate: ahora + 1000 });
    let r = await apple(aviso(ca, 'DID_RENEW', renovada, ren({ signedDate: ahora + 1000 })));
    t.eq([r.status, b.paid_until, b.apple_vence, b.plan], [200, iso(ahora + 60 * DIA), iso(ahora + 60 * DIA), 'p25'], 'DID_RENEW: un mes más');
    t.eq([e.tabla.length, e.tabla[0].transaction_id], [1, '2000000000000002'], 'DID_RENEW: la misma suscripción, con la última transacción');
    // El mismo aviso otra vez (Apple reintenta): igual.
    r = await apple(aviso(ca, 'DID_RENEW', renovada, ren({ signedDate: ahora + 1000 })));
    t.eq([r.status, b.paid_until, e.tabla.length], [200, iso(ahora + 60 * DIA), 1], 'el mismo aviso otra vez: igual');
    // La compra vieja que manda la app después (firmada antes) no vuelve atrás.
    await app(firmar(ca, tx()));
    t.eq(b.paid_until, iso(ahora + 60 * DIA), 'una compra vieja reenviada no vuelve atrás lo renovado');
    // Apaga la renovación automática.
    r = await apple(aviso(ca, 'DID_CHANGE_RENEWAL_STATUS', renovada, ren({ autoRenewStatus: 0, signedDate: ahora + 2000 }), { subtype: 'AUTO_RENEW_DISABLED' }));
    t.eq([r.status, b.apple_renueva, b.paid_until], [200, false, iso(ahora + 60 * DIA)], 'DID_CHANGE_RENEWAL_STATUS: deja de renovarse, sigue pago hasta el final');
    // Cambia de plan (sube al de 50: Apple lo cobra al toque).
    const subio = tx({ transactionId: '2000000000000003', productId: 'ar.com.gize.app.coach.p50', expiresDate: ahora + 31 * DIA, signedDate: ahora + 3000 });
    r = await apple(aviso(ca, 'DID_CHANGE_RENEWAL_PREF', subio, ren({ productId: 'ar.com.gize.app.coach.p50', autoRenewProductId: 'ar.com.gize.app.coach.p50', signedDate: ahora + 3000 }), { subtype: 'UPGRADE' }));
    t.eq([b.plan, b.max_clients, b.apple_renueva], ['p50', 50, true], 'cambio al plan de 50: plan y tope nuevos');
    // Reembolso: se corta en la fecha del reembolso.
    const devuelta = Object.assign({}, subio, { revocationDate: ahora - 5000, revocationReason: 0, signedDate: ahora + 4000 });
    r = await apple(aviso(ca, 'REFUND', devuelta, ren({ signedDate: ahora + 4000 })));
    t.eq([r.status, b.paid_until, b.apple_renueva, e.tabla[0].revoked], [200, iso(ahora - 5000), false, true], 'REFUND: el plan se corta en la fecha del reembolso');
    // Y reenviar la compra de antes no lo vuelve a activar.
    r = await app(firmar(ca, subio));
    t.eq(b.paid_until, iso(ahora - 5000), 'después del reembolso, reenviar la compra no lo reactiva');
  }
  {
    // Vencida (no renovó) y período de gracia.
    const e = escenario(ca);
    const { app, apple } = await montar(ca, e);
    await app(firmar(ca, tx()));
    const b = e.bill[COACH];
    const vencida = tx({ expiresDate: ahora - 1000, signedDate: ahora + 1000 });
    let r = await apple(aviso(ca, 'DID_FAIL_TO_RENEW', vencida, ren({ gracePeriodExpiresDate: ahora + 6 * DIA, isInBillingRetryPeriod: true, signedDate: ahora + 1000 }), { subtype: 'GRACE_PERIOD' }));
    t.eq([r.status, b.paid_until], [200, iso(ahora + 6 * DIA)], 'DID_FAIL_TO_RENEW con período de gracia: sigue hasta que termina la gracia');
    r = await apple(aviso(ca, 'EXPIRED', Object.assign({}, vencida, { signedDate: ahora + 2000 }), ren({ autoRenewStatus: 0, signedDate: ahora + 2000 }), { subtype: 'VOLUNTARY' }));
    t.eq([r.status, b.paid_until, b.apple_renueva, b.plan], [200, iso(ahora - 1000), false, 'p25'], 'EXPIRED: queda vencido (pagado hasta que venció)');
  }
  {
    // Avisos que no cambian nada, o que no son de Apple.
    const e = escenario(ca);
    const { apple } = await montar(ca, e);
    let r = await apple(aviso(ca, 'TEST', null, null));
    t.ok(r.status === 200 && !e.escrituras.length, 'TEST: 200 sin hacer nada');
    r = await apple(aviso(ca, 'CONSUMPTION_REQUEST', tx(), ren()));
    t.ok(r.status === 200 && !e.escrituras.length, 'un tipo que no cambia la suscripción: 200 sin hacer nada');
    r = await apple(aviso(ca, 'DID_RENEW', tx({ productId: 'com.otro.producto' }), ren()));
    t.ok(r.status === 200 && !e.escrituras.length, 'un producto desconocido: 200 sin hacer nada');
    r = await apple(aviso(ca, 'DID_RENEW', tx({ appAccountToken: undefined, originalTransactionId: '999' }), ren({ originalTransactionId: '999' })));
    t.ok(r.status === 200 && !e.escrituras.length, 'sin cuenta y sin suscripción conocida: 200 sin hacer nada');
    const o = autoridad();
    r = await apple(aviso(o, 'DID_RENEW', tx(), ren()));
    t.ok(r.status === 400 && !e.escrituras.length, 'un aviso que no firmó Apple: 400 sin hacer nada');
    // Bien firmado por fuera pero con la transacción de adentro firmada por otro.
    const falso = firmar(ca, { notificationType: 'DID_RENEW', signedDate: ahora, data: { bundleId: 'ar.com.gize.app', environment: 'Sandbox', signedTransactionInfo: firmar(o, tx()) } });
    r = await apple(falso);
    t.ok(r.status === 400 && !e.escrituras.length, 'un aviso con la transacción de adentro firmada por otro: 400 sin hacer nada');
    r = await apple(aviso(ca, 'DID_RENEW', tx(), ren(), { data: { bundleId: 'com.otra.app', environment: 'Sandbox', signedTransactionInfo: firmar(ca, tx({ bundleId: 'com.otra.app' })) } }));
    t.ok(r.status === 200 && !e.escrituras.length, 'un aviso de otra app: 200 sin hacer nada');
  }
  {
    // Sin appAccountToken: la cuenta sale de apple_subs.
    const sub = { original_transaction_id: '2000000000000001', user_id: COACH, product_id: 'ar.com.gize.app.coach.p25', environment: 'Sandbox', revoked: false, signed_at: iso(ahora - 50000) };
    const e = escenario(ca, { subs: [sub] });
    const { apple } = await montar(ca, e);
    const r = await apple(aviso(ca, 'SUBSCRIBED', tx({ appAccountToken: undefined, signedDate: ahora }), ren(), { subtype: 'RESUBSCRIBE' }));
    t.eq([r.status, e.bill[COACH].plan, e.bill[COACH].paid_until], [200, 'p25', iso(ahora + 30 * DIA)], 'aviso sin appAccountToken: la cuenta sale de apple_subs');
  }
  {
    // La misma cuenta de Apple compra desde otra cuenta de GIZE: la suscripción pasa a la nueva.
    const e = escenario(ca);
    const m1 = await montar(ca, e);
    await m1.app(firmar(ca, tx()));
    // Misma base, con OTRO logueado.
    const e3 = escenario(ca, { usuario: OTRO, billing: { [COACH]: e.bill[COACH], [OTRO]: {} }, subs: e.tabla });
    const m3 = await montar(ca, e3);
    const r = await m3.app(firmar(ca, tx({ transactionId: '2000000000000005', appAccountToken: OTRO, productId: 'ar.com.gize.app.coach.p50', signedDate: ahora })));
    t.eq(r.status, 200, 'otra cuenta de GIZE con la misma cuenta de Apple: ok');
    t.eq([e3.bill[OTRO].plan, e3.tabla[0].user_id], ['p50', OTRO], 'la suscripción pasa a la cuenta nueva');
    t.ok(e3.bill[COACH].apple_original_tx === null && Date.parse(e3.bill[COACH].paid_until) <= Date.now(), 'y la anterior la deja de tener');
  }

  // ---- 5) Los productos de la función y los de la app son los mismos ----
  const P = await importar(DIR + '/planes.ts');
  const A = await importar('app/core/compras-apple.js').catch(e => ({ error: e }));
  t.ok(!A.error, 'se carga app/core/compras-apple.js: ' + (A.error && A.error.message));
  t.eq(A.PRODUCTOS_APPLE, P.PRODUCTOS_APPLE, 'la app y la función usan los mismos productos');
  t.eq(Object.keys(P.PRODUCTOS_APPLE), ['p10', 'p25', 'p50', 'p100', 'p250', 'p500'].map(p => 'ar.com.gize.app.coach.' + p), 'los seis productos, con los IDs de App Store Connect');
  const plan = leer('app/screens/coach/plan.js');
  for (const [id, { plan: p, max }] of Object.entries(P.PRODUCTOS_APPLE))
    t.ok(new RegExp('\\{ id: "' + p + '", max: ' + max + ',').test(plan), id + ' es el plan ' + p + ' de ' + max + ' (como en PLANS)');
  t.ok(leer('docs/APPLE-COMPRAS.md').includes('ar.com.gize.app.coach.p500'), 'la guía de App Store Connect lista los IDs');

  // ---- 6) SQL y publicación ----
  const sql = leer('supabase/compras-apple.sql');
  t.ok(/create table if not exists public\.apple_subs \(\s*original_transaction_id text primary key,/.test(sql), 'compras-apple.sql crea apple_subs');
  t.ok(/alter table public\.apple_subs enable row level security;/.test(sql) && !/create policy/i.test(sql), 'apple_subs con RLS y sin políticas (desde la app no se ve)');
  t.ok(/revoke all on public\.apple_subs from public, anon, authenticated;/.test(sql) && /grant select, insert, update, delete on public\.apple_subs to service_role;/.test(sql), 'apple_subs: solo service_role');
  for (const c of ['apple_original_tx text', 'apple_vence timestamptz', 'apple_renueva boolean not null default false'])
    t.has(sql, 'alter table public.coach_billing add column if not exists ' + c, 'coach_billing: ' + c);
  t.ok((sql.match(/and not b\.apple_renueva/g) || []).length === 2, 'el mail de vencimiento no sale con el plan de Apple que se renueva solo');
  t.ok(!/drop table|delete from|truncate/i.test(sql), 'se puede correr varias veces sin borrar nada');
  t.has(leer('supabase/aviso-vencimiento.sql'), 'corré después\n-- compras-apple.sql', 'aviso-vencimiento.sql avisa que la versión vigente está en compras-apple.sql');
}
