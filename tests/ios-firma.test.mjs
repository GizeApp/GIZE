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

// Cuenta simulada: certificados { id, tipo, vence }, perfiles { id, nombre, tipo, certs: [ids] }.
function fakeAsc({ certs = [], perfiles = [], tope = 3 } = {}){
  const cuenta = { certs: certs.map(c => ({ ...c })), perfiles: perfiles.map(p => ({ ...p })), borrados: [], creados: 0 };
  let n = 0;
  const srv = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      const send = (st, o) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(o === undefined ? '' : JSON.stringify(o)); };
      const u = new URL(req.url, 'http://x'), p = u.pathname.replace(/^\/v1/, '');
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
      if (req.method === 'GET' && p === '/bundleIds')
        return send(200, { data: [{ type: 'bundleIds', id: 'BUNDLE-ID-SECRETO', attributes: { identifier: u.searchParams.get('filter[identifier]') } }] });
      if (req.method === 'POST' && p === '/profiles'){
        const d = JSON.parse(body).data;
        const pr = { id: 'PERFIL-NUEVO-' + (++n), nombre: d.attributes.name, tipo: d.attributes.profileType, certs: d.relationships.certificates.data.map(x => x.id) };
        cuenta.perfiles.push(pr);
        return send(201, { data: { type: 'profiles', id: pr.id, attributes: { name: pr.nombre, uuid: 'uuid-' + pr.id, profileContent: Buffer.from('perfil').toString('base64') } } });
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

function correr(url, tmp, accion){
  const env = Object.assign({}, process.env, { RUNNER_TEMP: tmp, HOME: tmp, GITHUB_ENV: path.join(tmp, 'github_env'),
    ASC_KEY_ID: 'KEYID12345', ASC_ISSUER_ID: 'emisor-de-prueba', ASC_KEY_PATH: path.join(tmp, 'AuthKey.p8'),
    BUNDLE_ID: 'ar.com.gize.app', RUN_ID: '900', NO_PROXY: '127.0.0.1', no_proxy: '127.0.0.1' });
  for (const k of ['HTTP_PROXY', 'http_proxy', 'HTTPS_PROXY', 'https_proxy', 'ALL_PROXY', 'all_proxy']) delete env[k];
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
  const nombres = [EQUIPO, 'TEAMSECRET', 'BUNDLE-ID-SECRETO', 'GIZE App Store CI', 'KEYID12345', 'emisor-de-prueba'];
  const vistos = [...ids, ...nombres].filter(x => out.includes(x));
  t.eq(vistos, [], q + ': el log no tiene ids ni nombres de la cuenta');
}

async function escenario(cfg, pasos){
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gize-firma-'));
  const asc = await fakeAsc(cfg);
  try { return await pasos({ ...asc, tmp, correr: accion => correr(asc.url, tmp, accion) }); }
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

  // 6) El workflow marca la subida justo antes de altool (después de exportar y revisar la firma),
  //    con el mismo archivo que mira el script, y el paso que limpia corre siempre.
  const wf = fs.readFileSync(path.join(ROOT, '.github/workflows/ios.yml'), 'utf8');
  const py = fs.readFileSync(SCRIPT, 'utf8');
  const iExp = wf.indexOf('xcodebuild -exportArchive'), iVer = wf.lastIndexOf('codesign --verify'), iMarca = wf.indexOf('touch "$RUNNER_TEMP/ios-firma-subida"'),
    iSube = wf.indexOf('xcrun altool --upload-app'), iBorrar = wf.indexOf('ios-firma.py borrar');
  t.ok(iExp > 0 && iVer > iExp && iMarca > iVer && iSube > iMarca && iBorrar > iSube, 'ios.yml deja la marca de subida justo antes de subir y limpia después');
  t.ok(/SUBIDA = os\.path\.join\(TMP, "ios-firma-subida"\)/.test(py), 'el script mira el mismo archivo que deja el workflow');
  t.ok(/- name: Limpiar la firma\n\s+if: always\(\)/.test(wf), 'el paso que limpia la firma corre siempre');
}
