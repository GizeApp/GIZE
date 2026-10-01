// Letters-only logo options (1080 × 1080) + a board with profile-circle previews.
//   node logo-letras/build.mjs [--only=l01,l12]  -> stock/15-logo-letras/<id>.png and 00-tablero.png
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../..'), OUT = path.join(ROOT, 'showreel/stock/15-logo-letras');
const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.replace(/^--/, '').match(/^([^=]+)(?:=(.*))?$/); return [m[1], m[2] ?? '1']; }));
const only = args.only ? args.only.split(',') : null;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ args: ['--disable-gpu', '--force-color-profile=srgb'] });
const page = await (await browser.newContext({ viewport: { width: 1200, height: 1200 } })).newPage();
page.on('console', m => { if (m.type() === 'error') console.error('[console]', m.text()); });
page.on('pageerror', e => { console.error('[pageerror]', e); process.exit(1); });
await page.goto(`http://127.0.0.1:${server.address().port}/showreel/logo-letras/letras.html`);
await page.waitForFunction('window.READY === true', null, { timeout: 60000 });
fs.mkdirSync(OUT, { recursive: true });
const save = (name, url) => fs.writeFileSync(path.join(OUT, name), Buffer.from(url.split(',')[1], 'base64'));
for (const v of await page.evaluate('window.VARIANTS')) {
  if (only && !only.some(o => v.id.startsWith(o))) continue;
  save(`${v.id}.png`, await page.evaluate(id => window.renderVariant(id), v.id));
  if (v.light) save(`${v.id}_claro.png`, await page.evaluate(id => window.renderVariant(id, 'light'), v.id));
  console.log(`  ✓ ${v.id}.png${v.light ? ' + claro' : ''}  ${v.name}`);
}
if (!only) { save('00-tablero.png', await page.evaluate('window.renderBoard()')); console.log('  ✓ 00-tablero.png'); }
await browser.close(); server.close();
