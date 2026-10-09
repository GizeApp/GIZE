// Workflows de GitHub que manejan claves (sin GitHub: se leen los .yml y los pasos se corren con
// herramientas simuladas). La copia de seguridad usa la imagen de Postgres fijada por digest en
// .github/postgres/Dockerfile, que sigue Dependabot. El workflow de iPhone no instala nada de PyPI:
// scripts/ios-firma.py firma el JWT de App Store Connect con openssl. «Fotos de videos» corre
// Pillow (versión y hash fijos) en un trabajo que solo lee y sube desde otro que no corre nada.
// Todo trabajo que lee secrets corre solo desde main y en su Environment (play-release,
// ios-release, production, catalogo o backup), los programados en uno sin revisores, y los PR de
// iPhone compilan sin secrets. La tarea «funciones» de supabase.yml controla al final que cada
// función quedó publicada y al día, y la tarea «secrets» no carga una clave de Apple sin su Key ID
// y el Team ID. Esta prueba corre en GitHub también cuando cambia lo que revisa.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = f => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
const sinComentarios = s => s.replace(/^\s*#.*$/gm, '');
const CARPETAS = [];

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

// Trabajos de un workflow: { nombre: texto } (lo que cuelga de «jobs:» con dos espacios).
function trabajos(yml){
  const out = {}; let act = null;
  for (const l of (yml.split(/^jobs:\s*$/m)[1] || '').split('\n')){
    const m = l.match(/^  ([\w-]+):\s*$/);
    if (m) out[act = m[1]] = '';
    else if (/^\S/.test(l)) act = null;
    else if (act) out[act] += l + '\n';
  }
  return out;
}

// Corre un pedazo de bash como lo corre GitHub (bash -e), en una carpeta de prueba con
// «programas» simulados delante en el PATH. Devuelve { code, out, log, dir }.
function correr(script, { archivos = {}, programas = {}, env = {}, prep } = {}){
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gize-wf-')), bin = path.join(dir, '.bin');
  CARPETAS.push(dir);
  fs.mkdirSync(bin);
  for (const [f, s] of Object.entries(archivos)) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), s); }
  for (const [p, s] of Object.entries(programas)) fs.writeFileSync(path.join(bin, p), '#!/bin/bash\n' + s + '\n', { mode: 0o755 });
  if (prep) prep(dir);
  if (typeof env === 'function') env = env(dir);
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
  // Pero no propone otra versión mayor: la copia saldría de un pg_dump que el pg_restore anotado
  // para emergencias no lee. La versión anotada en backup.yml es la del Dockerfile.
  const dock = dep.split(/^  - /m).find(b => /^package-ecosystem: docker\b/.test(b)) || '';
  t.ok(/\n    ignore:\s+- dependency-name: postgres\s+update-types: \["version-update:semver-major"\]/.test(dock), 'Dependabot no propone otra versión mayor de Postgres');
  const mayor = (df.match(/^FROM postgres:(\d+)/m) || [])[1];
  t.ok(mayor && new RegExp('pg_restore ' + mayor + ' o más nuevo').test(bk), 'backup.yml dice qué pg_restore hace falta para restaurar (' + mayor + ' o más nuevo)');
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

  // 3) «Fotos de videos»: Pillow (de PyPI) corre en un trabajo que solo puede leer el repo, con
  //    versión y hash fijos; el que sube a revision-videos no corre código de terceros y arma el
  //    commit en una carpeta nueva solo con las hojas (un .git plantado no corre con el token).
  const fv = leer('.github/workflows/fotos-videos.yml'), jobs = trabajos(fv);
  const arriba = fv.split(/^jobs:/m)[0];
  t.ok(!/contents: write/.test(arriba), 'fotos-videos.yml no da permiso de escribir a todo el workflow');
  const [arma] = Object.entries(jobs).find(([, b]) => b.includes('scripts/fotos-videos.py')) || [];
  const [sube] = Object.entries(jobs).find(([, b]) => /git push/.test(b)) || [];
  t.ok(arma && sube && arma !== sube, 'armar las hojas y subirlas van en trabajos separados');
  if (arma && sube){
    const a = jobs[arma], b = jobs[sube];
    t.ok(/^    permissions:\s*\n\s+contents: read\s*$/m.test(a) && !/write/.test(a), 'el trabajo que arma las hojas solo puede leer el repo');
    t.ok(!/github\.token|GH_TOKEN|git push/.test(a), 'y no recibe el token para subir');
    t.ok(/pip install --require-hashes --only-binary :all: -r scripts\/fotos-videos-requirements\.txt/.test(a) && !/pip install (?!--require-hashes)/.test(a), 'Pillow se instala con versión y hash fijos');
    t.ok(/^    permissions:\s*\n\s+contents: write\s*$/m.test(b), 'el que sube tiene permiso de escribir');
    t.ok(!/pip|python|scripts\/|actions\/checkout/.test(sinComentarios(b)), 'y no corre código del repo ni de PyPI');
    t.ok(new RegExp('^    needs: ' + arma + '\\s*$', 'm').test(b) && /actions\/download-artifact@[0-9a-f]{40} /.test(b), 'sube lo que dejó el otro trabajo (download-artifact fijado por SHA)');
  }
  const req = leer('scripts/fotos-videos-requirements.txt');
  t.ok(/^pillow==[0-9.]+ \\\n(\s+--hash=sha256:[0-9a-f]{64}( \\)?\n)+/m.test(req), 'scripts/fotos-videos-requirements.txt fija Pillow con versión y hash');
  t.ok(/- package-ecosystem: pip\s+directory: \/scripts\b/.test(dep), 'Dependabot sigue los requisitos de Python');
  const subir = paso(fv, 'Subir a la rama revision-videos');
  t.ok(subir, 'existe el paso «Subir a la rama revision-videos»');
  if (subir){
    // Lo que llegó del otro trabajo (y por las dudas también la carpeta donde se arman): las hojas,
    // el resumen y un .git con hooks que, si corrieran, anotan el token.
    const plantar = d => { for (const c of ['hojas', 'out']){
      const x = path.join(d, c);
      fs.mkdirSync(path.join(x, 'sub'), { recursive: true });
      fs.writeFileSync(path.join(x, '001.jpg'), 'jpg'); fs.writeFileSync(path.join(x, 'resumen.json'), '{}'); fs.writeFileSync(path.join(x, 'sub', '002.jpg'), 'jpg');
      spawnSync('git', ['init', '-q', x], { env: Object.assign({}, process.env, git(d)) });
      for (const h of ['pre-commit', 'pre-push']) fs.writeFileSync(path.join(x, '.git', 'hooks', h), '#!/bin/sh\necho "$GH_TOKEN" >> "$RUNNER_TEMP/robado"\n', { mode: 0o755 });
    }
    spawnSync('git', ['init', '-q', '--bare', path.join(d, 'remoto.git')]);
    fs.writeFileSync(path.join(d, '.gitconfig'), '[url "file://' + path.join(d, 'remoto.git') + '"]\n\tinsteadOf = https://x-access-token:TOKEN-DE-PRUEBA@github.com/gize/prueba.git\n'); };
    const git = d => ({ HOME: d, GIT_CONFIG_GLOBAL: path.join(d, '.gitconfig'), GIT_CONFIG_NOSYSTEM: '1' });
    let dir = '';
    const r = correr(subir, { prep: d => { dir = d; plantar(d); }, env: d => Object.assign({ GH_TOKEN: 'TOKEN-DE-PRUEBA', REPO: 'gize/prueba', TMPDIR: d }, git(d)) });
    const g = spawnSync('git', ['--git-dir', path.join(dir, 'remoto.git'), 'ls-tree', '-r', '--name-only', 'revision-videos'], { encoding: 'utf8', env: Object.assign({}, process.env, git(dir)) });
    t.eq(r.code, 0, 'el paso sube las hojas: ' + r.out.trim().split('\n').pop());
    t.eq(g.stdout.trim().split('\n'), ['001.jpg', 'resumen.json'], 'en revision-videos quedan solo las hojas y el resumen');
    t.ok(!fs.existsSync(path.join(dir, 'robado')), 'los hooks del .git plantado no corren con el token');
  }

  // 4) Claves de firma y de producción: cada trabajo que lee secrets corre solo desde main y en un
  //    Environment limitado a main. La condición sola no alcanza (una rama puede traer el workflow
  //    sin ella); con los secrets en el Environment, otra rama no los recibe.
  const ENV = { 'android-release.yml': 'play-release', 'ios.yml': 'ios-release', 'supabase.yml': 'production',
    'importar-off.yml': 'catalogo', 'importar-super.yml': 'catalogo', 'backup.yml': 'backup' };
  const vistos = new Set(), usa = {};
  for (const f of fs.readdirSync(path.join(ROOT, '.github/workflows')).filter(f => /\.ya?ml$/.test(f)).sort()){
    const yml = leer('.github/workflows/' + f);
    t.ok(!/secrets\./.test(sinComentarios(yml.split(/^jobs:/m)[0])), f + ': no lee secrets fuera de los trabajos');
    for (const [n, b] of Object.entries(trabajos(yml))){
      if (!/\$\{\{\s*secrets\./.test(b)) continue;
      vistos.add(f);
      const env = usa[f] = (b.match(/^    environment: (\S+)\s*$/m) || [])[1], cond = (b.match(/^    if: (.+)$/m) || [])[1] || '';
      t.eq(env, ENV[f], f + ' → ' + n + ': corre en el Environment que guarda sus secrets');
      t.ok(cond.includes("github.ref == 'refs/heads/main'"), f + ' → ' + n + ': corre solo desde main');
    }
    if (ENV[f]) t.ok(yml.includes('Settings → Environments') && yml.includes('Environment "' + ENV[f] + '"'), f + ': explica qué Environment crear y qué secrets van ahí');
  }
  t.eq([...vistos].sort(), Object.keys(ENV).sort(), 'los workflows con secrets son los esperados');
  // Un trabajo programado no puede ir en un Environment que pide aprobación («Required reviewers»):
  // la corrida queda esperando y a los 30 días GitHub la cancela (el catálogo dejaba de actualizarse).
  const conRevisores = new Set(Object.keys(usa).filter(f => /tildar «Required reviewers»/.test(leer('.github/workflows/' + f))).map(f => usa[f]));
  t.ok(conRevisores.has('production') && conRevisores.has('ios-release'), 'production e ios-release piden aprobación: ' + [...conRevisores]);
  for (const f of Object.keys(usa).filter(f => /^\s+schedule:/m.test(leer('.github/workflows/' + f))))
    t.ok(!conRevisores.has(usa[f]), f + ' es programado y su Environment (' + usa[f] + ') no pide aprobación');
  // iPhone: los PR compilan para el simulador en un trabajo sin secrets; la versión firmada es otro.
  const ij = Object.values(trabajos(leer('.github/workflows/ios.yml')));
  const pr = ij.filter(b => /^    if: github\.event_name == 'pull_request'\s*$/m.test(b));
  t.ok(pr.length === 1 && !/secrets\./.test(pr[0]) && /CODE_SIGNING_ALLOWED=NO/.test(pr[0]), 'ios.yml compila los PR en un trabajo sin secrets');
  t.ok(ij.some(b => /^    if: github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'\s*$/m.test(b) && /altool --upload-app/.test(b)), 'ios.yml sube a TestFlight solo a mano y desde main');

  // 5) Funciones de Supabase: al final de «funciones» se mira qué quedó publicado (con la CLI
  //    simulada). Falla si falta alguna, si alguna sigue con la versión anterior o si hay publicada
  //    una que no sale del repo (como una «notificar-cliente» vieja, que la app usa de respaldo).
  //    Si una no se puede publicar, sigue con las demás y al final falla.
  const fun = paso(leer('.github/workflows/supabase.yml'), 'Publicar funciones');
  const FNS = ((fun.match(/for fn in ([^;]+);/) || [])[1] || '').trim().split(/\s+/);
  t.ok(FNS.length >= 9 && FNS.includes('rapid-worker') && FNS.includes('borrar-audios'), 'el paso publica las funciones del repo: ' + FNS.join(' '));
  const supabase = `echo "$*" >> "$LOG"
case "$1 $2" in
  "functions deploy") [ "$3" != "$FALLA" ];;
  "functions list") if [[ " $* " == *" --output json "* || " $* " == *" -o json "* ]]; then cat "$LISTA"; else echo "| ID | NAME | SLUG |"; fi;;
  *) exit 2;;
esac`;
  const ahora = Date.now(), DIA = 864e5;
  // cambios: { slug: fecha | null (no está) | { status, updated_at } }; extra: más filas de la lista.
  const publicar = (cambios = {}, env = {}, extra = []) => {
    const fechas = Object.assign(Object.fromEntries(FNS.map(n => [n, ahora])), cambios);
    const lista = Object.entries(fechas).filter(([, v]) => v !== null)
      .map(([slug, v], i) => Object.assign({ id: 'id' + i, slug, name: slug, status: 'ACTIVE', version: 7, updated_at: ahora }, typeof v === 'object' ? v : { updated_at: v })).concat(extra);
    const r = correr(fun, { archivos: { 'supabase/functions/notificar-cliente/index.ts': '// chat', '.lista.json': JSON.stringify(lista) }, programas: { supabase },
      env: d => Object.assign({ PROJECT_REF: 'proyecto', LISTA: path.join(d, '.lista.json') }, env) });
    r.deploys = r.log.split('\n').filter(l => l.startsWith('functions deploy ')).map(l => l.split(' ')[2]);
    return r;
  };
  const ok = publicar();
  t.eq(ok.code, 0, 'con todas recién publicadas el paso anda: ' + ok.out.trim().split('\n').pop());
  t.eq(ok.deploys, FNS, 'publica todas');
  t.ok(/functions list --project-ref proyecto/.test(ok.log), 'después pide la lista de las publicadas');
  const vieja = publicar({ 'vence-plan': ahora - 2 * DIA });
  t.ok(vieja.code !== 0 && /vence-plan/.test(vieja.out), 'falla si una sigue con la versión anterior: ' + vieja.out.trim());
  const falta = publicar({ 'borrar-audios': null });
  t.ok(falta.code !== 0 && /borrar-audios/.test(falta.out), 'falla si falta una: ' + falta.out.trim());
  const extra = publicar({ 'notificar-cliente': ahora - 30 * DIA });
  t.ok(extra.code !== 0 && /notificar-cliente/.test(extra.out), 'falla si hay publicada una que no sale del repo: ' + extra.out.trim());
  const corta = publicar({ admin: ahora - 2 * DIA }, { FALLA: 'admin' });
  t.eq(corta.deploys, FNS, 'si una no se puede publicar, sigue con las demás');
  t.ok(corta.code !== 0 && /admin/.test(corta.out), 'y al final falla nombrándola: ' + corta.out.trim());
  // Las borradas pueden seguir en la lista como REMOVED (la CLI también las saltea): no cuentan.
  const borrada = publicar({ 'notificar-cliente': { status: 'REMOVED', updated_at: ahora - 30 * DIA } });
  t.eq(borrada.code, 0, 'una que no sale del repo pero ya se borró (REMOVED) no lo hace fallar: ' + borrada.out.trim().split('\n').pop());
  const copia = publicar({}, {}, [{ id: 'vieja', slug: 'admin', name: 'admin', status: 'REMOVED', version: 2, updated_at: ahora - 90 * DIA }]);
  t.eq(copia.code, 0, 'ni una copia borrada de una del repo: ' + copia.out.trim().split('\n').pop());
  const frenada = publicar({ descanso: { status: 'THROTTLED' } });
  t.ok(frenada.code !== 0 && /descanso: está frenada por Supabase/.test(frenada.out), 'si una está frenada falla y lo dice en castellano: ' + frenada.out.trim());
  // Cada carpeta de supabase/functions sale de esta tarea (notificar-cliente como rapid-worker), y
  // ningún encabezado manda a crearla desde el panel: se saltea el «solo desde main» y el control
  // de arriba falla con una «notificar-cliente» publicada aparte.
  for (const f of fs.readdirSync(path.join(ROOT, 'supabase/functions')).filter(f => fs.existsSync(path.join(ROOT, 'supabase/functions', f, 'index.ts')))){
    t.ok(FNS.includes(f === 'notificar-cliente' ? 'rapid-worker' : f), 'la tarea publica supabase/functions/' + f);
    t.ok(!/Via Editor|Deploy a new function/i.test(leer('supabase/functions/' + f + '/index.ts')), 'supabase/functions/' + f + ' no dice de publicarla desde el panel');
  }

  // 6) Tarea «secrets»: cada clave de Apple sube con su Key ID y con APPLE_TEAM_ID. Si falta uno no
  //    se carga nada: iría vacío y pisaría el de Supabase (se cortan los avisos a iPhone).
  const sec = paso(leer('.github/workflows/supabase.yml'), 'Cargar secrets de las funciones');
  t.ok(sec, 'existe el paso «Cargar secrets de las funciones»');
  if (sec){
    const NOMBRES = ['MP_ACCESS_TOKEN', 'APNS_KEY_P8', 'APNS_KEY_ID', 'APPLE_TEAM_ID', 'SIWA_KEY_P8', 'SIWA_KEY_ID', 'RESEND_API_KEY', 'RESEND_FULL_KEY', 'RESEND_WEBHOOK_SECRET', 'AVISOS_PAGOS'];
    const cargar = env => {
      const r = correr(sec, { programas: { supabase: 'echo "$*" >> "$LOG"' }, env: Object.assign({ PROJECT_REF: 'proyecto' }, Object.fromEntries(NOMBRES.map(n => [n, ''])), env) });
      r.set = r.log.split('\n').find(l => l.startsWith('secrets set ')) || '';
      return r;
    };
    const apple = { APNS_KEY_P8: 'p8-push', APNS_KEY_ID: 'PUSH123', SIWA_KEY_P8: 'p8-siwa', SIWA_KEY_ID: 'SIWA123', APPLE_TEAM_ID: 'EQUIPO1234' };
    const todo = cargar(apple);
    t.eq(todo.code, 0, 'con todas las claves de Apple el paso anda: ' + todo.out.trim());
    t.ok(['APNS_KEY_ID=PUSH123', 'SIWA_KEY_ID=SIWA123', 'APPLE_TEAM_ID=EQUIPO1234'].every(s => todo.set.includes(s)), 'carga cada clave con su Key ID y el Team ID: ' + todo.set);
    for (const k of ['APPLE_TEAM_ID', 'APNS_KEY_ID', 'SIWA_KEY_ID']){
      const r = cargar({ ...apple, [k]: '' });
      t.ok(r.code !== 0 && !r.set && r.out.includes(k), 'sin ' + k + ' falla sin cargar nada (no lo pisa vacío): ' + r.out.trim());
    }
    const mp = cargar({ MP_ACCESS_TOKEN: 'mp-prueba' });
    t.ok(mp.code === 0 && mp.set.includes('MP_ACCESS_TOKEN=mp-prueba') && !/APPLE|APNS|SIWA/.test(mp.set), 'sin claves de Apple carga lo demás: ' + mp.set);
    const nada = cargar({});
    t.ok(nada.code !== 0 && nada.out.includes('Settings → Environments → production'), 'sin secrets avisa que van en el Environment «production»: ' + nada.out.trim());
  }

  // 7) En GitHub, esta prueba corre también cuando cambia lo que revisa (workflows, Dockerfile,
  //    Dependabot, scripts y funciones), no solo con cambios de la app.
  const pw = leer('.github/workflows/pruebas.yml');
  const glob = g => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\0').replace(/\*/g, '[^/]*').replace(/\0/g, '.*') + '$');
  const LEE = ['.github/workflows/ios.yml', '.github/postgres/Dockerfile', '.github/dependabot.yml', 'scripts/ios-firma.py',
    'scripts/fotos-videos-requirements.txt', 'supabase/functions/admin/index.ts', 'tests/workflows-seguridad.test.mjs'];
  for (const ev of ['push', 'pull_request']){
    const m = pw.match(new RegExp('^  ' + ev + ':[\\s\\S]*?^    paths: (\\[.*\\])\\s*$', 'm'));
    let paths = []; try { paths = JSON.parse(m[1]); } catch (e) {}
    t.eq(LEE.filter(f => !paths.some(g => glob(g).test(f))), [], 'pruebas.yml corre con ' + ev + ' cuando cambia lo que revisa esta prueba');
  }

  for (const d of CARPETAS) fs.rmSync(d, { recursive: true, force: true });
}
