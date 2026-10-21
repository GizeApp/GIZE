// Base de pruebas con Postgres de verdad (ver tests/pg/README.md). No es un *.test.mjs: la usan las
// pruebas tests/gimnasios-*.test.mjs con «const h = await pg()».
//
// Dónde encuentra Postgres, en este orden:
//   1. GIZE_PSQL: el comando de psql de un servidor ya levantado, con lo necesario para conectarse
//      (en GitHub: «docker exec -i gize-pg psql -U postgres», .github/workflows/base-de-pruebas.yml).
//      El SQL va siempre por la entrada estándar, así anda igual dentro del contenedor.
//   2. PG_BIN, o el initdb de versión más alta en /usr/lib/postgresql/*/bin: arma un cluster en una
//      carpeta temporal, que escucha solo en un socket Unix dentro de esa carpeta (no choca con otro
//      Postgres ni con otra prueba que corra a la vez), y lo apaga y lo borra al salir (también si
//      se cierra la terminal: SIGHUP). initdb no corre como root: si la prueba corre como root,
//      initdb y postgres corren como el usuario «postgres» del sistema.
//      El cluster entra sin contraseña (trust), así que solo lo alcanza quien llega al socket: la
//      carpeta queda 0700 (de quien corre la prueba, o de «postgres» si corre como root, que igual
//      entra) y el socket 0700. Otro usuario de la máquina no puede conectarse como superusuario.
//      Si una corrida anterior murió sin limpiar (kill -9), la próxima apaga y borra ese cluster.
// Sin ninguno (o si el cluster local no arranca), las pruebas se saltean con un aviso. Con
// GIZE_PG_OBLIGATORIO=1 (base-de-pruebas.yml), que falte Postgres es una falla. Con GIZE_PG_SALTEAR=1
// se saltean siempre.
//
// Arma una vez por proceso (tests/run.mjs importa todas las pruebas en el mismo) dos bases plantilla:
//   gize_sin: Supabase simulado + esquema base inferido + los supabase/*.sql de tests/pg/orden.txt
//             (la base de hoy);
//   gize_con: gize_sin + los archivos de los gimnasios (GIMNASIOS, abajo: gimnasios.sql,
//             gimnasios-vinculo.sql, gimnasios-lectura.sql, gimnasios-socios.sql y gimnasios-admin.sql).
// Las dos traen además las ayudas de tests/pg/ayudas.sql (esquema «prueba»). Cada prueba trabaja en
// una copia nueva: «await h.nueva('gize_con')».
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const leer = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

// Los archivos del repo que la base de hoy carga, en orden (tests/pg/orden.txt).
export function orden(){ return leer('tests/pg/orden.txt').split('\n').map(l => l.replace(/#.*/, '').trim()).filter(Boolean); }

// pg_cron y pg_net no existen en un Postgres común: sus «create extension» van comentados (los
// esquemas cron y net los trae el Supabase simulado). Cualquier otra cosa que falle corta la carga.
const SIMULADAS = /^create extension if not exists (pg_cron|pg_net)\b[^;\n]*;/gim;
export function paraLaPrueba(sql){ return sql.replace(SIMULADAS, m => '-- (base de pruebas: simulada) ' + m); }
export function simuladas(sql){ return [...sql.matchAll(SIMULADAS)].map(m => m[0]); }
// Un archivo con su propio begin/commit (rutinas-genericas.sql) corre tal cual; el resto, en una
// sola transacción, como la tarea sql del workflow «Supabase».
const propiaTx = sql => /^\s*(begin|commit)\s*;/im.test(sql);

export class PgError extends Error {
  constructor(salida, archivo){
    const m = salida.match(/(?:ERROR|FATAL):\s+([0-9A-Z]{5}): ([^\n]*)/) || salida.match(/(?:ERROR|FATAL):\s+()([^\n]*)/) || [];
    super((archivo ? archivo + ': ' : '') + (m[2] || salida.trim().split('\n').slice(-3).join(' | ')));
    this.code = m[1] || ''; this.msg = m[2] || ''; this.salida = salida; this.archivo = archivo || '';
  }
}

function correr(cmd, args, entrada){
  return new Promise(ok => {
    let out = '', err = '';
    const p = spawn(cmd[0], [...cmd.slice(1), ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { err += d; });
    p.stdin.on('error', () => {});
    p.on('error', e => ok({ code: -1, out, err: err + String(e) }));
    p.on('close', code => ok({ code, out, err }));
    p.stdin.end(entrada);
  });
}

function buscarBin(){
  const tiene = d => d && ['initdb', 'pg_ctl', 'psql'].every(b => fs.existsSync(path.join(d, b)));
  if (process.env.PG_BIN) return tiene(process.env.PG_BIN) ? process.env.PG_BIN : null;
  let vs = [];
  try { vs = fs.readdirSync('/usr/lib/postgresql').filter(v => /^\d+$/.test(v)).sort((a, b) => b - a); } catch (e) {}
  for (const v of vs) if (tiene('/usr/lib/postgresql/' + v + '/bin')) return '/usr/lib/postgresql/' + v + '/bin';
  return null;
}

const esRoot = () => typeof process.getuid === 'function' && process.getuid() === 0;
const carpetaTemp = () => esRoot() ? '/tmp' : os.tmpdir();
const ejecutor = bin => (b, args) => {
  const como = esRoot() ? ['runuser', '-u', 'postgres', '--'] : [];
  return spawnSync(como[0] || path.join(bin, b), como.length ? [...como.slice(1), path.join(bin, b), ...args] : args, { encoding: 'utf8' });
};
const vivo = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

// Los clusters de corridas que murieron sin limpiar (kill -9, la máquina se apagó): la carpeta
// gize-pg-* anota el proceso de la prueba en prueba.pid; si ese proceso ya no existe, se apaga y se
// borra. Las carpetas sin prueba.pid o de una prueba que sigue corriendo no se tocan.
export function limpiarViejos(bin = buscarBin()){
  const borradas = [];
  if (!bin) return borradas;
  const run = ejecutor(bin);
  let dirs = [];
  try { dirs = fs.readdirSync(carpetaTemp()).filter(d => d.startsWith('gize-pg-')).map(d => path.join(carpetaTemp(), d)); } catch (e) {}
  for (const dir of dirs){
    let pid;
    try { pid = Number(fs.readFileSync(path.join(dir, 'prueba.pid'), 'utf8')); } catch (e) { continue; }
    if (!pid || pid === process.pid || vivo(pid)) continue;
    if (fs.existsSync(path.join(dir, 'data', 'postmaster.pid'))) run('pg_ctl', ['-D', path.join(dir, 'data'), '-m', 'immediate', 'stop']);
    fs.rmSync(dir, { recursive: true, force: true });
    borradas.push(dir);
  }
  return borradas;
}

// Cluster temporal local. Devuelve el comando de psql (y la carpeta) o un motivo para saltear.
export function clusterLocal(){
  const bin = buscarBin();
  if (!bin) return { motivo: 'no hay Postgres (instalá postgresql-16 o definí GIZE_PSQL; ver tests/pg/README.md)' };
  const root = esRoot();
  if (root && spawnSync('id', ['postgres']).status !== 0) return { motivo: 'corre como root y no hay usuario «postgres» para initdb' };
  limpiarViejos(bin);
  // mkdtemp la crea 0700. Como root pasa a ser de «postgres» (root entra igual); si no, queda del
  // usuario que corre la prueba. Nadie más llega al socket.
  const dir = fs.mkdtempSync(path.join(carpetaTemp(), 'gize-pg-'));
  fs.writeFileSync(path.join(dir, 'prueba.pid'), String(process.pid));
  if (root) spawnSync('chown', ['-R', 'postgres:postgres', dir]);
  const data = path.join(dir, 'data');
  const run = ejecutor(bin);
  const ini = run('initdb', ['-D', data, '-U', 'postgres', '--auth=trust', '-E', 'UTF8', '--locale=C.UTF-8', '--no-sync']);
  if (ini.status !== 0) { fs.rmSync(dir, { recursive: true, force: true }); return { motivo: 'initdb falló: ' + String(ini.stderr || ini.stdout).trim().split('\n').pop() }; }
  const opts = `-p 5432 -k ${dir} -c listen_addresses='' -c unix_socket_permissions=0700 -c fsync=off -c synchronous_commit=off -c full_page_writes=off -c timezone=UTC -c max_connections=40`;
  const ini2 = run('pg_ctl', ['-D', data, '-l', path.join(dir, 'postgres.log'), '-o', opts, '-w', 'start']);
  if (ini2.status !== 0) { const log = fs.existsSync(path.join(dir, 'postgres.log')) ? fs.readFileSync(path.join(dir, 'postgres.log'), 'utf8') : ''; fs.rmSync(dir, { recursive: true, force: true }); return { motivo: 'Postgres no arrancó: ' + (String(ini2.stderr || '') + log).trim().split('\n').pop() }; }
  const apagar = () => { run('pg_ctl', ['-D', data, '-m', 'immediate', 'stop']); fs.rmSync(dir, { recursive: true, force: true }); };
  process.on('exit', apagar);
  // Sin esto, SIGHUP (se cerró la terminal o se cortó el SSH) mata la prueba sin pasar por «exit», y
  // el postmaster (que corre en su propia sesión) queda vivo con su carpeta.
  for (const [s, c] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) process.once(s, () => process.exit(c));
  return { psql: [path.join(bin, 'psql'), '-h', dir, '-p', '5432', '-U', 'postgres'], dir };
}

const ARGS = ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'];

class Base {
  constructor(h, nombre){ this.h = h; this.nombre = nombre; }
  // Corre SQL (por la entrada estándar) y devuelve lo que imprime. una: en una sola transacción.
  async sql(texto, { una = false } = {}){
    const r = await correr(this.h.psql, [...ARGS, ...(una ? ['-1'] : []), '-d', this.nombre], texto);
    if (r.code !== 0) throw new PgError(r.err + r.out);
    return r.out;
  }
  // Lo mismo, pero sin tirar: { ok, out } o { ok: false, code, msg }.
  async intentar(texto, opts){
    try { return { ok: true, out: await this.sql(texto, opts) }; }
    catch (e) { if (e instanceof PgError) return { ok: false, code: e.code, msg: e.msg, salida: e.salida }; throw e; }
  }
  // El texto tiene que imprimir un solo valor JSON (la última línea que no está vacía).
  async json(texto, opts){
    const out = (await this.sql(texto, opts)).trim().split('\n').filter(Boolean);
    return JSON.parse(out[out.length - 1] || 'null');
  }
  // Carga un archivo del repo como lo corre el workflow (una transacción, salvo que traiga la suya).
  async archivo(rel){
    const sql = paraLaPrueba(leer(rel));
    try { return await this.sql(sql, { una: !propiaTx(sql) }); }
    catch (e) { if (e instanceof PgError) { e.archivo = rel; e.message = rel + ': ' + e.message; } throw e; }
  }
  // Varios archivos en una sola conexión (más rápido con docker exec), cada uno en su transacción.
  async archivos(rels){
    const partes = rels.map(rel => {
      const sql = paraLaPrueba(leer(rel));
      return `\\echo ==> ${rel}\nreset all;\nset client_min_messages = warning;\n` + (propiaTx(sql) ? sql + '\n' : 'begin;\n' + sql + '\n;\ncommit;\n');
    });
    const r = await correr(this.h.psql, [...ARGS.filter(a => a !== '-q'), '-q', '-d', this.nombre], partes.join('\n'));
    if (r.code !== 0) {
      const ult = (r.out.match(/^==> (.*)$/gm) || []).pop();
      throw new PgError(r.err + r.out, ult ? ult.slice(4) : '');
    }
    return r.out;
  }
  async borrar(){ await this.h.admin.sql(`drop database if exists "${this.nombre}" with (force);`); }
}

// Los archivos de los gimnasios, en orden (la base «gize_con» = «gize_sin» + estos).
export const GIMNASIOS = ['supabase/gimnasios.sql', 'supabase/gimnasios-vinculo.sql', 'supabase/gimnasios-lectura.sql', 'supabase/gimnasios-socios.sql',
  'supabase/gimnasios-admin.sql'];

let n = 0;
async function armar(){
  if (process.env.GIZE_PG_SALTEAR === '1') return { saltear: 'GIZE_PG_SALTEAR=1' };
  let psql, dir = null;
  if (process.env.GIZE_PSQL) psql = process.env.GIZE_PSQL.trim().split(/\s+/);
  else {
    const c = clusterLocal();
    if (c.motivo) {
      if (process.env.GIZE_PG_OBLIGATORIO === '1') throw new Error('GIZE_PG_OBLIGATORIO=1 y ' + c.motivo);
      return { saltear: c.motivo };
    }
    psql = c.psql; dir = c.dir;
  }
  const h = { psql, plantillas: {}, dir };
  h.admin = new Base(h, 'postgres');
  h.version = (await h.admin.sql('show server_version;')).trim();
  h.base = nombre => new Base(h, nombre);
  // Una base nueva, copia de una plantilla (o vacía).
  h.nueva = async (plantilla = 'gize_con') => {
    const nombre = 'gz_' + process.pid + '_' + (++n);
    await h.admin.sql(`create database "${nombre}"` + (plantilla ? ` template "${plantilla}"` : '') + ';');
    return new Base(h, nombre);
  };
  // Las plantillas. Si algo no carga, la prueba falla con el archivo y el error.
  const t0 = Date.now();
  await h.admin.sql('drop database if exists gize_con with (force);\ndrop database if exists gize_sin with (force);\ncreate database gize_sin;');
  const sin = new Base(h, 'gize_sin');
  await sin.archivos(['tests/pg/supabase-simulado.sql', 'tests/pg/esquema-base.sql', ...orden().map(f => 'supabase/' + f), 'tests/pg/ayudas.sql']);
  await h.admin.sql('create database gize_con template gize_sin;');
  await new Base(h, 'gize_con').archivos(GIMNASIOS);
  h.armado = ((Date.now() - t0) / 1000).toFixed(1) + ' s';
  return h;
}

let estado = null;
// La base de pruebas (una por proceso). Si no hay Postgres: { saltear: 'motivo' }.
export function pg(){ return estado || (estado = armar()); }

// Para las pruebas: saltea con un aviso (y sin fallar) si no hay Postgres.
export async function conPg(t){
  const h = await pg();
  if (h.saltear) { console.log('    — se saltea: ' + h.saltear); return null; }
  return h;
}

// SQL literal: 'texto' con las comillas escapadas.
export const lit = v => v === null || v === undefined ? 'null' : "'" + String(v).replace(/'/g, "''") + "'";

// El cuerpo (lo que queda entre los $$, tal como lo guarda Postgres en prosrc) de la ÚLTIMA definición
// de public.<nombre> en el texto de un archivo. Solo cuenta las que empiezan una línea: las copias
// comentadas («-- create or replace …») no.
export function cuerpo(sql, nombre){
  const re = new RegExp('^create or replace function public\\.' + nombre + '\\(', 'gm');
  let i = -1, m;
  while ((m = re.exec(sql))) i = m.index;
  if (i < 0) return null;
  const a = /\$(\w*)\$/g; a.lastIndex = i;
  const ab = a.exec(sql);
  if (!ab) return null;
  const desde = ab.index + ab[0].length, hasta = sql.indexOf(ab[0], desde);
  return hasta < 0 ? null : sql.slice(desde, hasta);
}

// El bloque «Para volver atrás» comentado al final de un archivo, listo para correr: desde la primera
// línea que dice solo «--» después del título, sin los «-- » de adelante.
export function volverAtras(sql){
  const ls = sql.split('\n'), i = ls.findIndex(l => /^-- =+ Para volver atrás =+/.test(l));
  if (i < 0) return '';
  const j = ls.findIndex((l, k) => k > i && l.trim() === '--');
  return j < 0 ? '' : ls.slice(j + 1).filter(l => l.startsWith('--')).map(l => l.replace(/^-- ?/, '')).join('\n') + '\n';
}

// La huella del esquema (supabase/esquema-huella.sql) de una base: { clave: valor }.
export async function huella(db){ return db.json(leer('supabase/esquema-huella.sql')); }

// Lo que cambió entre dos huellas: claves nuevas, que faltan y con otro valor.
export function diferencias(a, b){
  const nuevas = Object.keys(b).filter(k => !(k in a)).sort(), faltan = Object.keys(a).filter(k => !(k in b)).sort();
  const cambian = Object.keys(a).filter(k => k in b && a[k] !== b[k]).sort();
  return { nuevas, faltan, cambian };
}
