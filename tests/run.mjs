// Corre todas las pruebas automáticas: node tests/run.mjs [parte-del-nombre]
// Cada tests/*.test.mjs exporta una función async ({ base, t }) que usa t.ok / t.eq / t.has.
// En GitHub se reparten en partes que corren en paralelo: SHARD="2/4" corre la segunda de cuatro.
// Cada prueba tiene un tope de tiempo (TEST_TIMEOUT_S, 300 s por defecto) para que una
// colgada falle sola en vez de gastar todo el tiempo del job.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startServer, closeBrowser, checker } from './lib.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const only = process.argv[2] || '';
let files = fs.readdirSync(dir).filter(f => f.endsWith('.test.mjs') && f.includes(only)).sort();
const [parte, partes] = (process.env.SHARD || '1/1').split('/').map(Number);
if (partes > 1) files = files.filter((_, i) => i % partes === parte - 1);
const tope = (Number(process.env.TEST_TIMEOUT_S) || 300) * 1000;
const { srv, base } = await startServer();
let bad = 0;
for (const f of files) {
  const t = checker(), t0 = Date.now();
  let reloj;
  const corte = new Promise((_, no) => { reloj = setTimeout(() => no(new Error('pasó el tope de ' + tope / 1000 + ' s')), tope); });
  try { await Promise.race([(async () => (await import(pathToFileURL(path.join(dir, f)).href)).default({ base, t }))(), corte]); }
  catch (e) { t.fails.push('se cortó: ' + (e && e.message ? e.message.split('\n')[0] : e)); }
  clearTimeout(reloj);
  const s = ((Date.now() - t0) / 1000).toFixed(1) + ' s';
  if (t.fails.length) { bad++; console.log('✗ ' + f + ' (' + s + ')'); t.fails.forEach(x => console.log('    · ' + x)); }
  else console.log('✓ ' + f + ' (' + s + ')');
}
await closeBrowser(); srv.close();
const cuales = partes > 1 ? ' [parte ' + parte + '/' + partes + ']' : '';
console.log(bad ? '\n' + bad + ' de ' + files.length + ' pruebas fallaron' + cuales + '.' : '\nTodas las pruebas pasaron (' + files.length + ')' + cuales + '.');
process.exit(bad ? 1 : 0);
