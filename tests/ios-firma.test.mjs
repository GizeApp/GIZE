// Firma de iPhone (scripts/ios-firma.py, lo corre ios.yml) contra una App Store Connect simulada.
// Apple rechazó 1.0.0 (59) en la revisión con 90035 «Invalid Signature»: el último paso del
// workflow revocaba el certificado de distribución justo después de subir la versión. Ahora:
// - si se subió (el workflow deja $RUNNER_TEMP/ios-firma-subida antes de subir), el certificado
//   de distribución y su perfil quedan; los de desarrollo que creó Xcode se revocan igual;
// - si falló antes de subir, el certificado y el perfil se revocan/borran como antes;
// - si Apple no deja crear otro certificado (tope de la cuenta), se revocan de a uno los más
//   viejos de CI (los de un perfil «GIZE App Store CI <ejecución>») con sus perfiles, siempre
//   dejando el más nuevo de CI, y nunca uno que no sea de CI;
// - en el log (público) no quedan ids ni nombres de la cuenta, solo cantidades.
// Widget «GIZE de hoy»: con WIDGET_BUNDLE_ID arma un segundo perfil («… <ejecución> widget») con el
// mismo certificado y lo deja en IOS_WIDGET_PROFILE_NAME; «borrar» y el tope tratan los dos perfiles
// juntos; si falta el Bundle ID del widget o el App Group (pasos del dueño en developer.apple.com,
// docs/WIDGET.md) falla con un mensaje claro. Sin la variable, todo exactamente como antes.
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(ROOT, 'scripts', 'ios-firma.py');
const EQUIPO = 'Equipo Secreto De Prueba (TEAMSECRET)';
const DIST = ['DISTRIBUTION', 'IOS_DISTRIBUTION'];

// El .mobileprovision que devuelve Apple: un plist (con los App Groups del App ID) dentro de una
// firma. «grupos» null: sin la clave; «ilegible»: sin plist adentro.
function mobileprovision(identifier, grupos, ilegible){
  if (ilegible) return Buffer.from('perfil');
  const g = grupos ? '<key>com.apple.security.application-groups</key><array>' + grupos.map(x => '<string>' + x + '</string>').join('') + '</array>' : '';
  const plist = '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
    '<plist version="1.0"><dict><key>TeamName</key><string>' + EQUIPO + '</string><key>Entitlements</key><dict>' + g +
    '<key>application-identifier</key><string>TEAMSECRET.' + identifier + '</string></dict></dict></plist>';
  return Buffer.concat([Buffer.from([0x30, 0x80, 0x06, 0x09]), Buffer.from(plist), Buffer.from([0xa0, 0x80, 0x00, 0x00])]);
}

// Cuenta simulada: certificados { id, tipo, vence }, perfiles { id, nombre, tipo, certs: [ids] }.
// «bundles»: los Bundle IDs registrados { identifier: { id, plataforma, grupos } }; sin «bundles»,
// cualquiera está registrado (como antes del widget). Como Apple, filter[identifier] trae también
// los que empiezan igual (ar.com.gize.app trae ar.com.gize.app.widget).
function fakeAsc({ certs = [], perfiles = [], tope = 3, bundles = null, ilegible = false } = {}){
  const cuenta = { certs: certs.map(c => ({ ...c })), perfiles: perfiles.map(p => ({ ...p })), borrados: [], creados: 0, pedidos: [] };
  const porId = {};
  let n = 0;
  const srv = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      const send = (st, o) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(o === undefined ? '' : JSON.stringify(o)); };
      const u = new URL(req.url, 'http://x'), p = u.pathname.replace(/^\/v1/, '');
      cuenta.pedidos.push(req.method + ' ' + p + u.search);
      if (req.headers.authorization !== 'Bearer token-de-prueba') return send(401, { errors: [{ detail: 'sin permiso' }] });
      const certJson = c => ({ type: 'certificates', id: c.id, attributes: { certificateType: c.tipo, expirationDate: c.vence,
        name: (DIST.includes(c.tipo) ? 'Apple Distribution: ' : 'Apple Development: ') + EQUIPO, displayName: EQUIPO } });
      if (req.method === 'GET' && p === '/certificates') return send(200, { data: cuenta.certs.map(certJson) });
      if (req.method === 'POST' && p === '/certificates'){
        const b = JSON.parse(body).data.attributes;
        if (b.certificateType === 'DISTRIBUTION' && cuenta.certs.filter(c => DIST.includes(c.tipo)).length >= tope)
          return send(409, { errors: [{ status: '409', code: 'ENTITY_ERROR', detail: 'You already have a current Distribution certificate or a pending certificate request.' }] });
        const c = { id: 'CERT-NUEVO-' + (++n), tipo: b.certificateType, vence: '2027-10-2' + n + 'T00:00:00.000+0000' };
        cuenta.certs.push(c); cuenta.creados++;
        return send(201, { data: { ...certJson(c), attributes: { ...certJson(c).attributes, certificateContent: Buffer.from('cert').toString('base64') } } });
      }
      if (req.method === 'GET' && p === '/bundleIds'){
        const ident = u.searchParams.get('filter[identifier]') || '', plat = u.searchParams.get('filter[platform]');
        const lista = bundles ? Object.entries(bundles).map(([identifier, b]) => ({ identifier, plataforma: 'IOS', ...b }))
          : [{ identifier: ident, id: 'BUNDLE-ID-SECRETO', plataforma: 'IOS', grupos: null }];
        const vistos = lista.filter(b => b.identifier.startsWith(ident) && (!plat || b.plataforma === plat));
        vistos.forEach(b => { porId[b.id] = b; });
        return send(200, { data: vistos.map(b => ({ type: 'bundleIds', id: b.id, attributes: { identifier: b.identifier, platform: b.plataforma } })) });
      }
      if (req.method === 'POST' && p === '/profiles'){
        const d = JSON.parse(body).data;
        const b = porId[d.relationships.bundleId.data.id];
        if (!b) return send(404, { errors: [{ detail: 'no existe el bundle' }] });
        const pr = { id: 'PERFIL-NUEVO-' + (++n), nombre: d.attributes.name, tipo: d.attributes.profileType, certs: d.relationships.certificates.data.map(x => x.id), bundle: b.id };
        cuenta.perfiles.push(pr);
        const contenido = bundles ? mobileprovision(b.identifier, b.grupos, ilegible) : Buffer.from('perfil');
        return send(201, { data: { type: 'profiles', id: pr.id, attributes: { name: pr.nombre, uuid: 'uuid-' + pr.id, profileContent: contenido.toString('base64') } } });
      }
      if (req.method === 'GET' && p === '/profiles'){
        const tipo = u.searchParams.get('filter[profileType]');
        const ps = cuenta.perfiles.filter(x => !tipo || x.tipo === tipo);
        // Como Apple: un certificado revocado ya no aparece colgado del perfil.
        const vivos = x => x.certs.filter(id => cuenta.certs.some(c => c.id === id));
        return send(200, { data: ps.map(x => ({ type: 'profiles', id: x.id, attributes: { name: x.nombre },
          relationships: { certificates: { data: vivos(x).map(id => ({ type: 'certificates', id })) } } })),
          included: cuenta.certs.filter(c => ps.some(x => x.certs.includes(c.id))).map(certJson) });
      }
      const m = p.match(/^\/(certificates|profiles)\/([^/]+)$/);
      if (req.method === 'DELETE' && m){
        const lista = m[1] === 'certificates' ? cuenta.certs : cuenta.perfiles, i = lista.findIndex(x => x.id === m[2]);
        if (i < 0) return send(404, { errors: [{ detail: 'no existe' }] });
        lista.splice(i, 1); cuenta.borrados.push(m[2]);
        return send(204);
      }
      send(404, { errors: [{ detail: 'ruta desconocida' }] });
    });
  });
  return new Promise(ok => srv.listen(0, '127.0.0.1', () => ok({ srv, cuenta, url: 'http://127.0.0.1:' + srv.address().port + '/v1' })));
}

// Corre «crear» o «borrar» como en la Mac de GitHub, pero sin openssl ni security de verdad (la
// API va a la cuenta simulada). «xcode» simula que Xcode creó un certificado de desarrollo.
const PY = `import importlib.util, os, sys, types
spec = importlib.util.spec_from_file_location("firma", sys.argv[1]); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
m.API = sys.argv[2]
m.token = lambda: "token-de-prueba"
def sh(*args, **kw):
    salida = {"req": ("-keyout", "-out"), "x509": ("-out",), "pkcs12": ("-out",)}.get(args[1] if len(args) > 1 else "", ())
    for i, a in enumerate(args):
        if a in salida:
            open(args[i + 1], "w").write("x")
m.sh = sh
m.subprocess = types.SimpleNamespace(run=lambda *a, **k: types.SimpleNamespace(stdout=""), DEVNULL=-3)
getattr(m, sys.argv[3])()`;

function correr(url, tmp, accion, extra = {}){
  const env = Object.assign({}, process.env, { RUNNER_TEMP: tmp, HOME: tmp, GITHUB_ENV: path.join(tmp, 'github_env'),
    ASC_KEY_ID: 'KEYID12345', ASC_ISSUER_ID: 'emisor-de-prueba', ASC_KEY_PATH: path.join(tmp, 'AuthKey.p8'),
    BUNDLE_ID: 'ar.com.gize.app', RUN_ID: '900', NO_PROXY: '127.0.0.1', no_proxy: '127.0.0.1' }, extra);
  for (const k of ['HTTP_PROXY', 'http_proxy', 'HTTPS_PROXY', 'https_proxy', 'ALL_PROXY', 'all_proxy', 'WIDGET_BUNDLE_ID']) if (!(k in extra)) delete env[k];
  return new Promise(ok => {
    const ch = spawn('python3', ['-I', '-B', '-c', PY, SCRIPT, url, accion], { env });
    let out = '';
    ch.stdout.on('data', d => out += d); ch.stderr.on('data', d => out += d);
    const reloj = setTimeout(() => ch.kill(), 60000);
    ch.on('close', code => { clearTimeout(reloj); ok({ code, out }); });
  });
}

// Lo que no puede salir en el log público: ids y nombres de certificados, perfiles y la cuenta.
function sinDatos(t, out, cuenta, extra, q){
  const ids = [...cuenta.certs.map(c => c.id), ...cuenta.perfiles.map(p => p.id), ...cuenta.borrados, ...extra];
  const nombres = [EQUIPO, 'TEAMSECRET', 'BUNDLE-ID-SECRETO', 'GIZE App Store CI', 'KEYID12345', 'emisor-de-prueba', 'group.'];
  const vistos = [...ids, ...nombres].filter(x => out.includes(x));
  t.eq(vistos, [], q + ': el log no tiene ids ni nombres de la cuenta');
}

async function escenario(cfg, pasos){
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gize-firma-'));
  const asc = await fakeAsc(cfg);
  try { return await pasos({ ...asc, tmp, correr: (accion, extra) => correr(asc.url, tmp, accion, extra) }); }
  finally { asc.srv.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
}

const VIEJO = '2026-11-01T00:00:00.000+0000';
const ci = (n, vence, tipo = 'DISTRIBUTION') => ({ cert: { id: 'CERT-CI-' + n, tipo, vence }, perfil: { id: 'PERFIL-CI-' + n, nombre: 'GIZE App Store CI ' + n, tipo: 'IOS_APP_STORE', certs: ['CERT-CI-' + n] } });

export default async function ({ t }){
  const quedan = (cuenta, ids) => ids.filter(id => cuenta.certs.some(c => c.id === id) || cuenta.perfiles.some(p => p.id === id));
  const HUMANO = { id: 'CERT-HUMANO-1', tipo: 'DISTRIBUTION', vence: '2026-01-01T00:00:00.000+0000' };
  const DEV_VIEJO = { id: 'CERT-DEV-VIEJO', tipo: 'DEVELOPMENT', vence: VIEJO };

  // 1) Se subió: el certificado de distribución y su perfil quedan; el de desarrollo de Xcode no.
  await escenario({ certs: [HUMANO, DEV_VIEJO] }, async ({ cuenta, tmp, correr }) => {
    const c = await correr('crear');
    t.eq(c.code, 0, 'crear anda: ' + c.out.trim());
    const dist = cuenta.certs.find(x => x.id.startsWith('CERT-NUEVO')), perfil = cuenta.perfiles[0];
    t.ok(dist && perfil && perfil.nombre === 'GIZE App Store CI 900' && perfil.certs[0] === dist.id, 'crear arma el certificado y el perfil «GIZE App Store CI <ejecución>»');
    // Sin WIDGET_BUNDLE_ID (ios.yml todavía no la pasa) nada cambia: los mismos pedidos a Apple,
    // un solo perfil y solo IOS_PROFILE_NAME.
    t.eq(cuenta.pedidos, ['POST /certificates', 'GET /certificates?limit=200&fields[certificates]=certificateType',
      'GET /bundleIds?filter[identifier]=ar.com.gize.app&filter[platform]=IOS&limit=5', 'POST /profiles'], 'sin widget: los mismos pedidos a Apple que antes');
    t.eq(cuenta.perfiles.length, 1, 'sin widget: un solo perfil');
    t.eq(fs.readFileSync(path.join(tmp, 'github_env'), 'utf8'), 'IOS_PROFILE_NAME=GIZE App Store CI 900\n', 'sin widget: GITHUB_ENV trae solo IOS_PROFILE_NAME');
    t.has(c.out, 'Certificado de distribución y perfil de App Store listos.', 'sin widget: el mismo aviso de siempre');
    cuenta.certs.push({ id: 'CERT-DEV-XCODE', tipo: 'DEVELOPMENT', vence: VIEJO });
    fs.writeFileSync(path.join(tmp, 'ios-firma-subida'), '');
    const b = await correr('borrar');
    t.eq(b.code, 0, 'borrar anda: ' + b.out.trim());
    t.ok(dist && cuenta.certs.some(x => x.id === dist.id), 'se subió: el certificado de distribución NO se revoca (si no, Apple rechaza la versión en revisión)');
    t.ok(perfil && cuenta.perfiles.some(x => x.id === perfil.id), 'se subió: el perfil de App Store queda');
    t.ok(!cuenta.certs.some(x => x.id === 'CERT-DEV-XCODE'), 'el certificado de desarrollo que creó Xcode se revoca igual');
    t.eq(quedan(cuenta, [HUMANO.id, DEV_VIEJO.id]), [HUMANO.id, DEV_VIEJO.id], 'los que ya estaban no se tocan');
    sinDatos(t, c.out + b.out, cuenta, ['CERT-DEV-XCODE'], 'subida');
  });

  // 2) Falló antes de subir: no firmó nada que tenga Apple, se revoca y se borra el perfil.
  await escenario({ certs: [HUMANO, DEV_VIEJO] }, async ({ cuenta, correr }) => {
    await correr('crear');
    const dist = cuenta.certs.find(x => x.id.startsWith('CERT-NUEVO')), perfil = cuenta.perfiles[0];
    cuenta.certs.push({ id: 'CERT-DEV-XCODE', tipo: 'DEVELOPMENT', vence: VIEJO });
    const b = await correr('borrar');
    t.eq(b.code, 0, 'borrar sin subida anda: ' + b.out.trim());
    t.ok(dist && !cuenta.certs.some(x => x.id === dist.id), 'sin subir: el certificado de distribución se revoca');
    t.ok(perfil && !cuenta.perfiles.some(x => x.id === perfil.id), 'sin subir: el perfil se borra');
    t.ok(!cuenta.certs.some(x => x.id === 'CERT-DEV-XCODE'), 'sin subir: el de desarrollo de Xcode se revoca');
    t.eq(quedan(cuenta, [HUMANO.id, DEV_VIEJO.id]), [HUMANO.id, DEV_VIEJO.id], 'sin subir: los que ya estaban no se tocan');
    sinDatos(t, b.out, cuenta, ['CERT-DEV-XCODE'], 'sin subida');
  });

  // 3) Tope de 3: un certificado de una persona, otro de una persona colgado de un perfil con
  //    nombre de CI pero con dos certificados (no lo armó CI), y dos de CI. Se revoca solo el más
  //    viejo de CI (el que vence antes, aunque su ejecución tenga un número más alto) y su perfil.
  const A = ci(700, '2026-12-01T00:00:00.000+0000'), B = ci(650, '2027-06-01T00:00:00.000+0000');
  const MEZCLA = { id: 'CERT-HUMANO-2', tipo: 'IOS_DISTRIBUTION', vence: '2026-10-25T00:00:00.000+0000' };
  const perfilMezcla = { id: 'PERFIL-MEZCLA', nombre: 'GIZE App Store CI 10', tipo: 'IOS_APP_STORE', certs: [MEZCLA.id, HUMANO.id] };
  const perfilManual = { id: 'PERFIL-MANUAL', nombre: 'GIZE App Store', tipo: 'IOS_APP_STORE', certs: [HUMANO.id] };
  await escenario({ tope: 4, certs: [HUMANO, MEZCLA, A.cert, B.cert, DEV_VIEJO], perfiles: [perfilMezcla, perfilManual, A.perfil, B.perfil] }, async ({ cuenta, correr }) => {
    const c = await correr('crear');
    t.eq(c.code, 0, 'tope: crear anda: ' + c.out.trim());
    t.eq(cuenta.borrados.sort(), [A.cert.id, A.perfil.id].sort(), 'tope: se revoca solo el más viejo de CI y se borra su perfil');
    t.eq(quedan(cuenta, [HUMANO.id, MEZCLA.id, B.cert.id, B.perfil.id, perfilMezcla.id, perfilManual.id]), [HUMANO.id, MEZCLA.id, B.cert.id, B.perfil.id, perfilMezcla.id, perfilManual.id],
      'tope: quedan el más nuevo de CI y todo lo que no es de CI');
    t.eq(cuenta.creados, 1, 'tope: después se crea el certificado nuevo');
    t.has(c.out, 'se revocaron 1 viejo(s) de CI', 'tope: el log dice cuántos se revocaron');
    sinDatos(t, c.out, cuenta, [], 'tope');
  });

  // 4) Tope de 2 con tres de CI (el tope bajó): se revocan los dos viejos, de a uno, y queda el nuevo.
  const C1 = ci(101, '2026-11-05T00:00:00.000+0000'), C2 = ci(102, '2027-01-05T00:00:00.000+0000'), C3 = ci(103, '2027-08-05T00:00:00.000+0000');
  await escenario({ tope: 2, certs: [C3.cert, C1.cert, C2.cert], perfiles: [C2.perfil, C3.perfil, C1.perfil] }, async ({ cuenta, correr }) => {
    const c = await correr('crear');
    t.eq(c.code, 0, 'tope de 2: crear anda: ' + c.out.trim());
    t.eq(cuenta.borrados, [C1.perfil.id, C1.cert.id, C2.perfil.id, C2.cert.id], 'tope de 2: se revocan los viejos de CI de a uno, del más viejo al más nuevo');
    t.eq(quedan(cuenta, [C3.cert.id, C3.perfil.id]), [C3.cert.id, C3.perfil.id], 'tope de 2: el más nuevo de CI queda');
    sinDatos(t, c.out, cuenta, [], 'tope de 2');
  });

  // 5) Tope lleno con certificados que no son de CI y uno solo de CI: no se revoca nada, falla y avisa.
  const S = ci(800, '2027-09-01T00:00:00.000+0000');
  await escenario({ tope: 3, certs: [HUMANO, MEZCLA, S.cert], perfiles: [perfilMezcla, S.perfil] }, async ({ cuenta, correr }) => {
    const c = await correr('crear');
    t.ok(c.code !== 0, 'tope sin viejos de CI: crear falla');
    t.eq(cuenta.borrados, [], 'tope sin viejos de CI: no revoca nada (ni el último de CI ni los de personas)');
    t.has(c.out, 'revocar uno a mano', 'tope sin viejos de CI: avisa qué hacer');
    sinDatos(t, c.out, cuenta, [], 'tope sin viejos de CI');
  });

  // 6) Widget: dos perfiles con el mismo certificado (el del widget registrado como UNIVERSAL, como
  //    puede quedar un App ID nuevo), GITHUB_ENV con los dos nombres y, si se subió, quedan los dos.
  const APP = 'ar.com.gize.app', WIDGET = 'ar.com.gize.app.widget', GRUPO = 'group.ar.com.gize.app';
  const W = { WIDGET_BUNDLE_ID: WIDGET };
  const conGrupo = (app = [GRUPO], wid = [GRUPO], plataforma = 'UNIVERSAL') => ({
    [APP]: { id: 'BUNDLE-ID-SECRETO-APP', grupos: app },
    [WIDGET]: { id: 'BUNDLE-ID-SECRETO-WIDGET', plataforma, grupos: wid } });
  const instalado = (tmp, pr) => fs.existsSync(path.join(tmp, 'Library/MobileDevice/Provisioning Profiles', 'uuid-' + pr.id + '.mobileprovision'))
    && fs.existsSync(path.join(tmp, 'Library/Developer/Xcode/UserData/Provisioning Profiles', 'uuid-' + pr.id + '.mobileprovision'));
  await escenario({ certs: [HUMANO, DEV_VIEJO], bundles: conGrupo() }, async ({ cuenta, tmp, correr }) => {
    const c = await correr('crear', W);
    t.eq(c.code, 0, 'widget: crear anda: ' + c.out.trim());
    const dist = cuenta.certs.find(x => x.id.startsWith('CERT-NUEVO'));
    const app = cuenta.perfiles.find(x => x.nombre === 'GIZE App Store CI 900'), wid = cuenta.perfiles.find(x => x.nombre === 'GIZE App Store CI 900 widget');
    t.eq(cuenta.creados, 1, 'widget: un solo certificado nuevo');
    t.ok(app && app.bundle === 'BUNDLE-ID-SECRETO-APP' && app.certs.length === 1 && app.certs[0] === (dist && dist.id), 'widget: el perfil de la app, con el certificado nuevo');
    t.ok(wid && wid.bundle === 'BUNDLE-ID-SECRETO-WIDGET' && wid.tipo === 'IOS_APP_STORE' && wid.certs.length === 1 && wid.certs[0] === (dist && dist.id),
      'widget: el perfil «GIZE App Store CI <ejecución> widget» es de App Store, del bundle del widget y con el MISMO certificado');
    t.ok(app && wid && instalado(tmp, app) && instalado(tmp, wid), 'widget: los dos perfiles quedan instalados en la Mac');
    t.eq(fs.readFileSync(path.join(tmp, 'github_env'), 'utf8'), 'IOS_PROFILE_NAME=GIZE App Store CI 900\nIOS_WIDGET_PROFILE_NAME=GIZE App Store CI 900 widget\n',
      'widget: GITHUB_ENV trae IOS_PROFILE_NAME e IOS_WIDGET_PROFILE_NAME');
    t.ok(!cuenta.pedidos.some(x => x.startsWith('GET /bundleIds?filter[identifier]=' + WIDGET) && x.includes('filter[platform]')), 'widget: su Bundle ID se busca sin filtrar por plataforma');
    const iWidget = cuenta.pedidos.findIndex(x => x.includes(WIDGET));
    t.ok(iWidget >= 0 && iWidget < cuenta.pedidos.indexOf('POST /certificates'), 'widget: su Bundle ID se busca antes de crear el certificado');
    cuenta.certs.push({ id: 'CERT-DEV-XCODE', tipo: 'DEVELOPMENT', vence: VIEJO });
    fs.writeFileSync(path.join(tmp, 'ios-firma-subida'), '');
    const b = await correr('borrar');
    t.eq(b.code, 0, 'widget: borrar con subida anda: ' + b.out.trim());
    t.eq(quedan(cuenta, [dist && dist.id, app && app.id, wid && wid.id]), [dist && dist.id, app && app.id, wid && wid.id], 'widget: se subió, quedan el certificado y los dos perfiles');
    t.ok(!cuenta.certs.some(x => x.id === 'CERT-DEV-XCODE'), 'widget: el de desarrollo de Xcode se revoca igual');
    t.has(b.out, 'sus perfiles (app y widget) quedan', 'widget: el log dice que quedan los dos');
    sinDatos(t, c.out + b.out, cuenta, ['CERT-DEV-XCODE'], 'widget con subida');
  });

  // 7) Widget sin subida: se borran los dos perfiles y se revoca el certificado.
  await escenario({ certs: [HUMANO], bundles: conGrupo() }, async ({ cuenta, correr }) => {
    const c = await correr('crear', W);
    t.eq(c.code, 0, 'widget sin subida: crear anda: ' + c.out.trim());
    const nuevos = [...cuenta.certs.filter(x => x.id.startsWith('CERT-NUEVO')), ...cuenta.perfiles].map(x => x.id);
    const b = await correr('borrar');
    t.eq(b.code, 0, 'widget sin subida: borrar anda: ' + b.out.trim());
    t.eq(nuevos.length, 3, 'widget sin subida: había un certificado y dos perfiles');
    t.eq(quedan(cuenta, nuevos), [], 'widget sin subida: se borran los dos perfiles y se revoca el certificado');
    t.eq(quedan(cuenta, [HUMANO.id]), [HUMANO.id], 'widget sin subida: el que ya estaba no se toca');
    t.has(b.out, 'perfiles borrados (app y widget)', 'widget sin subida: el log lo dice');
    sinDatos(t, c.out + b.out, cuenta, [], 'widget sin subida');
  });

  // 8) Tope con perfiles de widget: al revocar el certificado viejo de CI se borran sus dos perfiles.
  //    Perfiles con nombres parecidos que no armó CI no hacen pasar por CI a un certificado de una persona.
  const ciW = (n, vence) => { const x = ci(n, vence); return { ...x, widget: { id: 'PERFIL-CI-' + n + '-W', nombre: 'GIZE App Store CI ' + n + ' widget', tipo: 'IOS_APP_STORE', certs: [x.cert.id] } }; };
  const VW = ciW(710, '2026-12-01T00:00:00.000+0000'), NW = ciW(720, '2027-06-01T00:00:00.000+0000');
  const parecidos = [{ id: 'PERFIL-PARECIDO-1', nombre: 'GIZE App Store CI widget', tipo: 'IOS_APP_STORE', certs: [HUMANO.id] },
    { id: 'PERFIL-PARECIDO-2', nombre: 'GIZE App Store CI 12 widgets', tipo: 'IOS_APP_STORE', certs: [HUMANO.id] }];
  await escenario({ tope: 3, certs: [HUMANO, VW.cert, NW.cert], perfiles: [...parecidos, VW.perfil, VW.widget, NW.perfil, NW.widget], bundles: conGrupo() }, async ({ cuenta, correr }) => {
    const c = await correr('crear', W);
    t.eq(c.code, 0, 'tope con widget: crear anda: ' + c.out.trim());
    t.eq(cuenta.borrados.sort(), [VW.cert.id, VW.perfil.id, VW.widget.id].sort(), 'tope con widget: se revoca el viejo de CI y se borran su perfil y el de su widget');
    const siguen = [HUMANO.id, ...parecidos.map(x => x.id), NW.cert.id, NW.perfil.id, NW.widget.id];
    t.eq(quedan(cuenta, siguen), siguen, 'tope con widget: quedan el más nuevo de CI con sus dos perfiles y lo que no es de CI');
    t.has(c.out, 'se revocaron 1 viejo(s) de CI', 'tope con widget: el log dice cuántos');
    sinDatos(t, c.out, cuenta, [], 'tope con widget');
  });

  // 9) Falta el Bundle ID del widget (el dueño no hizo el paso 3): falla ANTES de crear el
  //    certificado, así no revoca uno viejo de CI por el tope para nada, y dice dónde está la guía.
  const V1 = ci(301, '2026-12-01T00:00:00.000+0000'), V2 = ci(302, '2027-06-01T00:00:00.000+0000');
  await escenario({ tope: 2, certs: [V1.cert, V2.cert], perfiles: [V1.perfil, V2.perfil], bundles: { [APP]: { id: 'BUNDLE-ID-SECRETO-APP', grupos: [GRUPO] } } }, async ({ cuenta, correr }) => {
    const c = await correr('crear', W);
    t.ok(c.code !== 0, 'sin el Bundle ID del widget: crear falla');
    t.has(c.out, 'No está registrado el Bundle ID del widget', 'sin el Bundle ID del widget: lo dice');
    t.has(c.out, 'docs/WIDGET.md', 'sin el Bundle ID del widget: manda a la guía');
    t.ok(cuenta.creados === 0 && cuenta.borrados.length === 0 && cuenta.perfiles.length === 2, 'sin el Bundle ID del widget: no crea certificado ni perfiles y no revoca nada');
    const b = await correr('borrar');
    t.ok(b.code === 0 && cuenta.borrados.length === 0, 'sin el Bundle ID del widget: borrar no tiene nada que hacer');
    sinDatos(t, c.out + b.out, cuenta, [], 'sin el Bundle ID del widget');
  });

  // 10) Falta el App Group (pasos 2 o 3) o no es el mismo: falla antes de exportar, dice qué paso
  //     falta (sin nombrar los grupos) y «borrar» limpia el certificado y los dos perfiles.
  for (const [q, bundles, paso, no] of [
    ['sin grupo en la app', conGrupo(null), 'paso 2', 'paso 3'],
    ['sin grupo en el widget', conGrupo([GRUPO], []), 'paso 3', 'paso 2'],
    ['grupos distintos', conGrupo([GRUPO], ['group.otro']), 'App Groups distintos', 'paso ']]){
    await escenario({ certs: [HUMANO], bundles }, async ({ cuenta, tmp, correr }) => {
      const c = await correr('crear', W);
      t.ok(c.code !== 0, q + ': crear falla');
      t.has(c.out, paso, q + ': dice qué falta');
      t.ok(!c.out.includes(no), q + ': no nombra lo que está bien');
      t.has(c.out, 'docs/WIDGET.md', q + ': manda a la guía');
      t.ok(!fs.existsSync(path.join(tmp, 'github_env')), q + ': no deja los nombres de los perfiles para exportar');
      const b = await correr('borrar');
      t.eq(cuenta.certs.filter(x => x.id.startsWith('CERT-NUEVO')).length + cuenta.perfiles.length, 0, q + ': borrar revoca el certificado y borra los dos perfiles');
      sinDatos(t, c.out + b.out, cuenta, ['group.otro'], q);
    });
  }

  // 11) Si no se puede leer el perfil, no se frena la versión por eso (la exportación avisa si falta).
  await escenario({ certs: [HUMANO], bundles: conGrupo(), ilegible: true }, async ({ cuenta, tmp, correr }) => {
    const c = await correr('crear', W);
    t.eq(c.code, 0, 'perfil ilegible: crear sigue: ' + c.out.trim());
    t.has(c.out, 'No se pudo leer el App Group', 'perfil ilegible: lo avisa');
    t.has(fs.readFileSync(path.join(tmp, 'github_env'), 'utf8'), 'IOS_WIDGET_PROFILE_NAME=', 'perfil ilegible: deja los dos nombres');
    sinDatos(t, c.out, cuenta, [], 'perfil ilegible');
  });

  // 12) El workflow marca la subida justo antes de altool (después de exportar y revisar la firma),
  //     con el mismo archivo que mira el script, y el paso que limpia corre siempre.
  const wf = fs.readFileSync(path.join(ROOT, '.github/workflows/ios.yml'), 'utf8');
  const py = fs.readFileSync(SCRIPT, 'utf8');
  const iExp = wf.indexOf('xcodebuild -exportArchive'), iVer = wf.lastIndexOf('codesign --verify'), iMarca = wf.indexOf('touch "$RUNNER_TEMP/ios-firma-subida"'),
    iSube = wf.indexOf('xcrun altool --upload-app'), iBorrar = wf.indexOf('ios-firma.py borrar');
  t.ok(iExp > 0 && iVer > iExp && iMarca > iVer && iSube > iMarca && iBorrar > iSube, 'ios.yml deja la marca de subida justo antes de subir y limpia después');
  t.ok(/SUBIDA = os\.path\.join\(TMP, "ios-firma-subida"\)/.test(py), 'el script mira el mismo archivo que deja el workflow');
  t.ok(/- name: Limpiar la firma\n\s+if: always\(\)/.test(wf), 'el paso que limpia la firma corre siempre');

  // 13) La guía del dueño (docs/WIDGET.md), a la que mandan los mensajes del script: los mismos
  //     nombres que usan el script y el widget, cada paso que nombran los mensajes, y nada de la
  //     cuenta (el repo es público: ni mails, ni Team ID, ni claves).
  const guiaRuta = path.join(ROOT, 'docs/WIDGET.md');
  const guia = fs.existsSync(guiaRuta) ? fs.readFileSync(guiaRuta, 'utf8') : '';
  t.ok(guia, 'existe docs/WIDGET.md');
  t.ok(py.includes('docs/WIDGET.md'), 'el script manda a la guía');
  const paso = n => (guia.split(/^### /m).find(x => x.startsWith('Paso ' + n + '.')) || '');
  t.ok(paso(1).includes('`' + GRUPO + '`') && /App Groups/.test(paso(1)), 'guía, paso 1: crear el App Group ' + GRUPO);
  t.ok(paso(2).includes('`' + APP + '`') && paso(2).includes('`' + GRUPO + '`'), 'guía, paso 2: sumarle el grupo al App ID de la app');
  t.ok(paso(3).includes('`' + WIDGET + '`') && paso(3).includes('`' + GRUPO + '`') && /Explicit/.test(paso(3)), 'guía, paso 3: el App ID del widget, con el grupo');
  t.ok(guia.includes('GIZE App Store CI') && /\bwidget\*\*/.test(guia), 'la guía nombra los perfiles que arma el script (el de la app y el «… widget»)');
  t.ok(/No los crees vos/i.test(guia) && /ninguno nuevo/i.test(guia), 'la guía dice que los perfiles no se crean a mano y que no hacen falta secrets nuevos');
  for (const m of ['No está registrado el Bundle ID del widget', 'paso 2', 'paso 3', 'App Groups distintos'])
    t.ok(py.includes(m) && guia.includes(m), 'la guía explica el mensaje «' + m + '» del script');
  t.eq(guia.match(/[\w.+-]+@[\w-]+\.[\w.]+/g), null, 'la guía no tiene mails');
  t.eq(guia.match(/\b(?=[A-Z0-9]{10}\b)[A-Z]*\d[A-Z0-9]*\b/g), null, 'la guía no tiene nada con forma de Team ID o Key ID');
  t.ok(!/BEGIN PRIVATE KEY|AuthKey_[A-Z0-9]/.test(guia), 'la guía no tiene claves');
  // Cuando ios.yml pase WIDGET_BUNDLE_ID (rama widget-iphone), que sea el de la guía y que la
  // exportación use el perfil del widget que deja el script.
  const wb = wf.match(/WIDGET_BUNDLE_ID:[ \t]*["']?([^"'\s]+)/);
  if (wb){
    t.eq(wb[1], WIDGET, 'ios.yml pasa el mismo Bundle ID del widget que la guía');
    t.ok(/<key>ar\.com\.gize\.app\.widget<\/key>\s*<string>\$\{?IOS_WIDGET_PROFILE_NAME\}?<\/string>/.test(wf), 'ExportOptions usa el perfil del widget (IOS_WIDGET_PROFILE_NAME)');
  }
}
