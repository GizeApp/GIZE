// Renders reel.html frame-by-frame in headless Chromium.
//   node render.mjs                      -> all 900 frames into ./frames
//   node render.mjs --times=1.2,4.5      -> stills at those times (seconds)
//   node render.mjs --frames=120-180     -> a frame range
//   --sub=N  (sub-frames for motion blur; default is per-shot in reel.html)
//   --workers=N  --out=dir
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..'); // serve the repo root so the reel can load brand/ fonts and logos
const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? '1'];
}));
const FPS = 60, TOTAL = FPS * 15;
const OUT = path.resolve(args.out || path.join(HERE, 'frames'));
let frames = [];
if (args.times) frames = args.times.split(',').map(s => Math.round(parseFloat(s) * FPS));
else {
  const [a, b] = (args.frames || `0-${TOTAL - 1}`).split('-').map(Number);
  for (let f = a; f <= b; f++) frames.push(f);
}
const sub = args.sub ? Number(args.sub) : undefined;
const workers = Number(args.workers || 4);
fs.mkdirSync(OUT, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.wav': 'audio/wav' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/showreel/reel.html`;

const browser = await chromium.launch({ args: ['--disable-gpu', '--force-color-profile=srgb'] });
let next = 0, done = 0;
const t0 = Date.now();
async function worker() {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', e => { console.error('[pageerror]', e); process.exit(1); });
  page.on('console', m => { if (m.type() === 'error') console.error('[console]', m.text()); });
  await page.goto(url);
  await page.waitForFunction('window.READY === true', null, { timeout: 180000 });
  while (next < frames.length) {
    const f = frames[next++];
    const b64 = await page.evaluate(([f, sub]) => window.renderFrame(f, { sub }), [f, sub]);
    fs.writeFileSync(path.join(OUT, `f_${String(f).padStart(4, '0')}.png`), Buffer.from(b64.slice(b64.indexOf(',') + 1), 'base64'));
    done++;
    if (done % 25 === 0 || done === frames.length) {
      const el = (Date.now() - t0) / 1000;
      console.log(`${done}/${frames.length}  ${el.toFixed(0)}s elapsed  eta ${(el / done * (frames.length - done)).toFixed(0)}s`);
    }
  }
  await context.close();
}
await Promise.all(Array.from({ length: Math.min(workers, frames.length) }, worker));
await browser.close();
server.close();
