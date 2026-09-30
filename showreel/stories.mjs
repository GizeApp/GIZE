// Story cuts: 3 per episode from its 9:16 hook-A master, shown as a card with an RGB ring
// and a clear band under it for IG stickers (poll, countdown, link).
//   node stories.mjs jobs/episodes.json [--only=id1,id2] [--force]
//   s1 = el gancho (question + stamp + the drop), s2 = la demo, s3 = el cierre (end card)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(3).map(a => { const m = a.replace(/^--/, '').match(/^([^=]+)(?:=(.*))?$/); return [m[1], m[2] ?? '1']; }));
const jobs = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), 'utf8'));
const only = args.only ? new Set(args.only.split(',')) : null;
const FF = process.env.FFMPEG || execFileSync('python3', ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())']).toString().trim();
const CARD = { x: 195, y: 210, w: 690, h: 1228 };   // keep in sync with lib/storyassets.py
const CUTS = [['s1-gancho', 0, 6.0], ['s2-demo', 5.6, 11.25], ['s3-cierre', 10.9, 15.0]];
const OUT = path.join(HERE, 'stock/03-stories');
const ASSETS = fs.mkdtempSync(path.join(os.tmpdir(), 'gize-story-'));
execFileSync('python3', [path.join(HERE, 'lib/storyassets.py'), ASSETS], { stdio: 'inherit' });
fs.mkdirSync(OUT, { recursive: true });

for (const job of jobs) {
  if (only && !only.has(job.id)) continue;
  const src = path.join(HERE, job.out, `${job.id}_hook-a_9x16.mp4`);
  if (!fs.existsSync(src)) { console.log(`skip ${job.id} (no 9:16 hook-a master yet)`); continue; }
  for (const [name, a, b] of CUTS) {
    const out = path.join(OUT, `${job.id}_${name}.mp4`);
    if (fs.existsSync(out) && !args.force) { console.log(`skip ${path.basename(out)} (exists)`); continue; }
    const d = (b - a).toFixed(3), fo = (b - a - 0.3).toFixed(3);
    const fc = `[0:v]scale=${CARD.w}:${CARD.h}:flags=lanczos,format=rgba[v];[2:v]format=gray[m];[v][m]alphamerge,fade=in:st=0:d=0.2:alpha=1,fade=out:st=${fo}:d=0.3:alpha=1[vc];`
      + `[1:v][vc]overlay=${CARD.x}:${CARD.y}:shortest=1,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p[o];`
      + `[0:a]afade=t=in:st=0:d=0.15,afade=t=out:st=${fo}:d=0.3[ao]`;
    execFileSync(FF, ['-y', '-loglevel', 'error', '-ss', String(a), '-t', d, '-i', src,
      '-loop', '1', '-framerate', '60', '-t', d, '-i', path.join(ASSETS, 'story_bg.ppm'),
      '-loop', '1', '-framerate', '60', '-t', d, '-i', path.join(ASSETS, 'story_mask.pgm'),
      '-filter_complex', fc, '-map', '[o]', '-map', '[ao]', '-r', '60',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-profile:v', 'high', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
      '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out], { stdio: 'inherit' });
    console.log(`  ✓ ${path.relative(HERE, out)}  (${(fs.statSync(out).size / 1e6).toFixed(1)} MB)`);
  }
}
fs.rmSync(ASSETS, { recursive: true, force: true });
