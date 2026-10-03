// Batch builder for the GIZE stock: every piece x format x hook x ending
// -> frames (render.mjs) -> cue sheet -> soundtrack (lib/sound.py) -> MP4 (encode.sh).
//   node build.mjs jobs/teasers.json [--only=id1,id2] [--formats=9x16] [--ctas=hype] [--tmp=/path] [--cover]
//   --force re-renders what exists; with --since=<ISO time> it skips outputs already re-rendered after that time (resume)
// A job: {id, page, dur, formats:[...], hooks:["a","b"], ctas:["hype"], out:"stock/teasers", cover:seconds, fps:60}
//   audio:"path.wav"  use a fixed soundtrack instead of the page's cue sheet (older standalone pages)
//   crops:{"4x5":[w,h,x,y]}  derive other formats by cropping the rendered master
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(3).map(a => { const m = a.replace(/^--/, '').match(/^([^=]+)(?:=(.*))?$/); return [m[1], m[2] ?? '1']; }));
const jobs = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), 'utf8'));
const only = args.only ? new Set(args.only.split(',')) : null;
const fmtOnly = args.formats ? new Set(args.formats.split(',')) : null;
const ctaOnly = args.ctas ? new Set(args.ctas.split(',')) : null;
const TMP = path.resolve(args.tmp || path.join(process.env.TMPDIR || '/tmp', 'gize-build'));
const FF = process.env.FFMPEG || execFileSync('python3', ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())']).toString().trim();
const run = (cmd, a, opts = {}) => execFileSync(cmd, a, { stdio: ['ignore', 'inherit', 'inherit'], cwd: HERE, ...opts });

for (const job of jobs) {
  if (only && !only.has(job.id)) continue;
  for (const fmt of job.formats || ['9x16']) {
    if (fmtOnly && !fmtOnly.has(fmt)) continue;
    for (const hook of job.hooks || ['a']) {
      for (const cta of job.ctas || ['hype']) {
        if (ctaOnly && !ctaOnly.has(cta)) continue;
        const name = [job.id, (job.hooks || []).length > 1 ? `hook-${hook}` : null, (job.ctas || []).length > 1 ? cta : null, fmt].filter(Boolean).join('_');
        const outDir = path.resolve(HERE, job.out);
        const mp4 = path.join(outDir, `${name}.mp4`);
        if (fs.existsSync(mp4) && (!args.force || (args.since && fs.statSync(mp4).mtimeMs > Date.parse(args.since)))) { console.log(`skip ${name} (exists${args.force ? ', already re-rendered since ' + args.since : ''})`); continue; }
        fs.mkdirSync(outDir, { recursive: true });
        const frames = path.join(TMP, name), cues = path.join(TMP, `${name}.cues.json`), wav = path.join(TMP, `${name}.wav`);
        fs.rmSync(frames, { recursive: true, force: true });
        const page = `${job.page}${job.page.includes("?") ? "&" : "?"}fmt=${fmt}&hook=${hook}&cta=${cta}`;
        const t0 = Date.now();
        console.log(`\n■ ${name}`);
        run('node', ['render.mjs', `--page=${page}`, `--dur=${job.dur}`, `--fps=${job.fps || 60}`, `--out=${frames}`, ...(job.audio ? [] : [`--cues=${cues}`]), '--quiet']);
        if (!job.audio) run('python3', ['lib/sound.py', cues, wav]);
        run('bash', ['encode.sh', frames, job.audio ? path.resolve(HERE, job.audio) : wav, mp4], { env: { ...process.env, FPS: String(job.fps || 60) } });
        if (job.cover != null && (args.cover || !fs.existsSync(path.join(outDir, `${name}.jpg`)))) {
          const f = Math.round(job.cover * (job.fps || 60));
          run(FF, ['-y', '-loglevel', 'error', '-i', path.join(frames, `f_${String(f).padStart(4, '0')}.png`), '-q:v', '2', path.join(outDir, `${name}.jpg`)]);
        }
        for (const [cf, [cw, chh, cx, cy]] of Object.entries(job.crops || {})) {
          const cname = name.replace(new RegExp(`${fmt}$`), cf), cmp4 = path.join(outDir, `${cname}.mp4`);
          run(FF, ['-y', '-loglevel', 'error', '-i', mp4, '-vf', `crop=${cw}:${chh}:${cx}:${cy}`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-c:a', 'copy', '-movflags', '+faststart', cmp4]);
          if (job.cover != null) run(FF, ['-y', '-loglevel', 'error', '-ss', String(job.cover), '-i', cmp4, '-frames:v', '1', '-q:v', '2', path.join(outDir, `${cname}.jpg`)]);
          console.log(`  ✓ ${path.relative(HERE, cmp4)}  (crop)`);
        }
        fs.rmSync(frames, { recursive: true, force: true });
        console.log(`  ✓ ${path.relative(HERE, mp4)}  (${((Date.now() - t0) / 1000).toFixed(0)}s, ${(fs.statSync(mp4).size / 1e6).toFixed(1)} MB)`);
      }
    }
  }
}
