// Workflows de GitHub que manejan claves (sin GitHub: se leen los .yml y los pasos se corren con
// herramientas simuladas). La copia de seguridad usa la imagen de Postgres fijada por digest en
// .github/postgres/Dockerfile, que sigue Dependabot. El workflow de iPhone no instala nada de PyPI:
// scripts/ios-firma.py firma el JWT de App Store Connect con openssl.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = f => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
const sinComentarios = s => s.replace(/^\s*#.*$/gm, '');

// Texto del «run: |» del paso que se llama así (sin la sangría del YAML).
function paso(yml, nombre){
  const ls = yml.split('\n'), i = ls.findIndex(l => l.trim() === '- name: ' + nombre);
  if (i < 0) return '';
  const d = ls[i].indexOf('-');
  let out = null, k = 0;
  for (const l of ls.slice(i + 1)){
    const ind = l.length - l.trimStart().length;
    if (l.trim() && ind <= d) break;
    if (out) { if (l.trim() && ind <= k) break; out.push(l.slice(k + 2)); }
    else if (/^\s*run: \|\s*$/.test(l)) { out = []; k = ind; }
  }
  return out ? out.join('\n') : '';
}

// Corre un pedazo de bash como lo corre GitHub (bash -e), en una carpeta de prueba con
// «programas» simulados delante en el PATH. Devuelve { code, out, dir }.
function correr(script, { archivos = {}, programas = {}, env = {} } = {}){
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gize-wf-')), bin = path.join(dir, '.bin');
  fs.mkdirSync(bin);
  for (const [f, s] of Object.entries(archivos)) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), s); }
  for (const [p, s] of Object.entries(programas)) fs.writeFileSync(path.join(bin, p), '#!/bin/bash\n' + s + '\n', { mode: 0o755 });
  fs.writeFileSync(path.join(dir, '.paso.sh'), script);
  const r = spawnSync('bash', ['-e', path.join(dir, '.paso.sh')], { cwd: dir, encoding: 'utf8', timeout: 30000,
    env: Object.assign({}, process.env, { PATH: bin + ':' + process.env.PATH, RUNNER_TEMP: dir, LOG: path.join(dir, '.log') }, env) });
  let log = ''; try { log = fs.readFileSync(path.join(dir, '.log'), 'utf8'); } catch (e) {}
  return { code: r.status, out: (r.stdout || '') + (r.stderr || ''), log, dir };
}

export default async function ({ t }){
  // 1) Copia de seguridad: la imagen de Postgres que recibe la URI de la base de producción va
  //    fijada por digest (un tag se puede mover) y Dependabot la sigue.
  const bk = leer('.github/workflows/backup.yml'), df = leer('.github/postgres/Dockerfile'), dep = leer('.github/dependabot.yml');
  t.ok(/^FROM postgres:[0-9.]+@sha256:[0-9a-f]{64}\s*$/m.test(df), '.github/postgres/Dockerfile fija la imagen de Postgres por digest');
  t.ok(!/postgres:\d/.test(sinComentarios(bk)), 'backup.yml no nombra un tag de Postgres suelto (la imagen sale del Dockerfile)');
  const runs = sinComentarios(bk).split('\n').filter(l => /docker run/.test(l));
  t.ok(runs.length >= 2 && runs.every(l => /\bgize-postgres\b/.test(l)), 'todos los docker run de backup.yml usan la imagen fijada (gize-postgres)');
  t.ok(/- package-ecosystem: docker\s+directory: \/\.github\/postgres\b/.test(dep), 'Dependabot sigue el Dockerfile de Postgres');
  const iCo = bk.indexOf('actions/checkout@'), iImg = bk.indexOf('- name: Imagen de Postgres'), iUsa = bk.indexOf('- name: Levantar la base de prueba');
  t.ok(iCo > 0 && iImg > iCo && iUsa > iImg, 'backup.yml baja el repo, prepara la imagen y recién después la usa');
  const img = paso(bk, 'Imagen de Postgres');
  t.ok(img, 'existe el paso «Imagen de Postgres»');
  if (img){
    const docker = 'echo "$*" >> "$LOG"';
    const bien = correr(img, { archivos: { '.github/postgres/Dockerfile': df }, programas: { docker } });
    const ref = (df.match(/^FROM (\S+)/m) || [])[1];
    t.eq(bien.code, 0, 'con el Dockerfile del repo el paso anda');
    t.ok(ref && bien.log.includes('pull -q ' + ref) && bien.log.includes('tag ' + ref + ' gize-postgres'), 'baja la imagen por digest y la nombra gize-postgres: ' + bien.log);
    const suelto = correr(img, { archivos: { '.github/postgres/Dockerfile': 'FROM postgres:18\n' }, programas: { docker } });
    t.ok(suelto.code !== 0 && !suelto.log.includes('pull'), 'con un tag sin digest el paso falla y no baja nada');
    t.ok(/@sha256/.test(suelto.out), 'y avisa que falta el digest: ' + suelto.out.trim());
  }

  // 2) iPhone: el JWT de App Store Connect se firma con openssl (scripts/ios-firma.py), sin
  //    instalar nada de PyPI al lado de la clave. Se prueba con una clave de prueba y sin PyJWT,
  //    como en la Mac de GitHub, y la firma se verifica acá.
  const ios = leer('.github/workflows/ios.yml');
  t.ok(!/pip3? install|pip install/.test(sinComentarios(ios)), 'ios.yml no instala paquetes de Python');
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gize-asc-')), p8 = path.join(tmp, 'AuthKey.p8');
  fs.writeFileSync(p8, privateKey.export({ type: 'pkcs8', format: 'pem' }));
  const py = `import importlib.util, sys
sys.modules["jwt"] = None
spec = importlib.util.spec_from_file_location("firma", sys.argv[1]); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
for _ in range(40): print(m.token())
print(m.firma_cruda(bytes.fromhex(sys.argv[2])).hex())`;
  // Firma DER con r de 31 bytes (le falta el cero de adelante) y s con el bit alto (trae un cero de más).
  const der = '3044' + '021f' + '11'.repeat(31) + '0221' + '00' + 'ff'.repeat(32);
  const r = spawnSync('python3', ['-I', '-B', '-c', py, path.join(ROOT, 'scripts/ios-firma.py'), der], { encoding: 'utf8', timeout: 60000,
    env: Object.assign({}, process.env, { RUNNER_TEMP: tmp, ASC_KEY_PATH: p8, ASC_KEY_ID: 'KEYID12345', ASC_ISSUER_ID: 'emisor-de-prueba' }) });
  const ls = (r.stdout || '').trim().split('\n'), jwts = ls.slice(0, 40);
  t.eq(r.status, 0, 'ios-firma.py arma el token sin PyJWT: ' + (r.stderr || '').trim().split('\n').pop());
  if (r.status === 0){
    const b64 = s => Buffer.from(s, 'base64url');
    const malas = jwts.filter(j => { const [h, p, s] = j.split('.'); return !s || !crypto.verify('sha256', Buffer.from(h + '.' + p), { key: publicKey, dsaEncoding: 'ieee-p1363' }, b64(s)); });
    t.eq(malas.length, 0, 'las 40 firmas ES256 se verifican con la clave pública');
    const [h, p] = jwts[0].split('.').map(x => { try { return JSON.parse(b64(x)); } catch (e) { return {}; } });
    t.eq([h.alg, h.kid, h.typ], ['ES256', 'KEYID12345', 'JWT'], 'encabezado del token');
    t.eq([p.iss, p.aud, p.exp - p.iat], ['emisor-de-prueba', 'appstoreconnect-v1', 900], 'datos del token (vence a los 15 minutos)');
    t.eq(ls[40], '00' + '11'.repeat(31) + 'ff'.repeat(32), 'la firma DER pasa a r||s de 32 bytes cada uno');
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}
