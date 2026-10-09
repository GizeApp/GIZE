// Workflows de GitHub que manejan claves (sin GitHub: se leen los .yml y los pasos se corren con
// herramientas simuladas). La copia de seguridad usa la imagen de Postgres fijada por digest en
// .github/postgres/Dockerfile, que sigue Dependabot.
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
}
