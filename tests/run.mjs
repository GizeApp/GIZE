// Corre todas las pruebas automáticas: node tests/run.mjs [parte-del-nombre]
// Cada tests/*.test.mjs exporta una función async ({ base, t }) que usa t.ok / t.eq / t.has.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, closeBrowser, checker } from './lib.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const only = process.argv[2] || '';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.mjs') && f.includes(only)).sort();
const { srv, base } = await startServer();
let bad = 0;
for (const f of files) {
  const t = checker(), t0 = Date.now();
  try { await (await import(path.join(dir, f))).default({ base, t }); }
  catch (e) { t.fails.push('se cortó: ' + (e && e.message ? e.message.split('\n')[0] : e)); }
  const s = ((Date.now() - t0) / 1000).toFixed(1) + ' s';
  if (t.fails.length) { bad++; console.log('✗ ' + f + ' (' + s + ')'); t.fails.forEach(x => console.log('    · ' + x)); }
  else console.log('✓ ' + f + ' (' + s + ')');
}
await closeBrowser(); srv.close();
console.log(bad ? '\n' + bad + ' de ' + files.length + ' pruebas fallaron.' : '\nTodas las pruebas pasaron (' + files.length + ').');
process.exit(bad ? 1 : 0);
