// Overlay pack for real footage (9:16): each overlay rendered with alpha, then exported as
//   <name>_verde.mp4   green screen (#00FF00) for CapCut / InShot "Chroma key"
//   <name>.webm        VP9 with real transparency (browsers, DaVinci, Premiere with WebM support)
//   <name>.png         the settled frame, for still edits
//   node overlays/build.mjs [--only=name1,name2] [--prores]   (--prores also writes <name>.mov, ProRes 4444
//   with alpha, ~40 MB each: for Premiere / Final Cut / After Effects; not kept in the repo)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.dirname(HERE);
const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.replace(/^--/, '').match(/^([^=]+)(?:=(.*))?$/); return [m[1], m[2] ?? '1']; }));
const FF = process.env.FFMPEG || execFileSync('python3', ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())']).toString().trim();
const OUT = path.join(ROOT, 'stock/07-overlays');
const STAMPS = [['PLANILLA', '01', 'EL COACH'], ['NOTAS DEL CELU', '02', 'LAS SERIES'], ['3 APPS', '03', 'EL CARDIO'], ['DESCANSO ETERNO', '04', 'EL DESCANSO'],
  ['PAPELITO', '05', 'LA COMIDA'], ['POST-ITS', '06', 'LOS HÁBITOS'], ['A OJO', '07', 'EL PROGRESO'], ['40 CHATS', '08', 'EL COACH']];
const slug = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const ITEMS = [
  ...STAMPS.map(([word, ep, topic]) => ({ name: `chau-${slug(word)}`, q: { item: 'stamp', word, ep, topic }, dur: 1.7, still: 0.7 })),
  { name: 'serie-record', q: { item: 'pr' }, dur: 2.6, still: 1.6 },
  { name: 'serie', q: { item: 'set' }, dur: 2.0, still: 1.2 },
  { name: 'descanso', q: { item: 'rest' }, dur: 3.6, still: 3.0 },
  { name: 'cardio-en-vivo', q: { item: 'cardio' }, dur: 4.0, still: 2.0 },
  { name: 'habito', q: { item: 'habit' }, dur: 2.2, still: 1.4 },
  { name: 'firma', q: { item: 'logo' }, dur: 3.0, still: 2.5 },
];
const only = args.only ? new Set(args.only.split(',')) : null;
fs.mkdirSync(OUT, { recursive: true });
for (const it of ITEMS) {
  if (only && !only.has(it.name)) continue;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gize-ov-')), qs = new URLSearchParams({ ...it.q, alpha: '1' }).toString();
  execFileSync('node', ['render.mjs', `--page=showreel/overlays/overlay.html?${qs}`, `--dur=${it.dur}`, `--out=${tmp}`, '--quiet'], { cwd: ROOT, stdio: 'inherit' });
  const seq = path.join(tmp, 'f_%04d.png'), base = path.join(OUT, it.name), ff = a => execFileSync(FF, ['-y', '-loglevel', 'error', ...a], { stdio: 'inherit' });
  ff(['-f', 'lavfi', '-i', `color=c=0x00FF00:s=1080x1920:r=60:d=${it.dur}`, '-framerate', '60', '-i', seq, '-filter_complex', '[0][1]overlay=shortest=1,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-movflags', '+faststart', `${base}_verde.mp4`]);
  ff(['-framerate', '60', '-i', seq, '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '28', '-row-mt', '1', '-auto-alt-ref', '0', `${base}.webm`]);
  fs.copyFileSync(path.join(tmp, `f_${String(Math.round(it.still * 60)).padStart(4, '0')}.png`), `${base}.png`);
  if (args.prores) ff(['-framerate', '60', '-i', seq, '-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', '-vendor', 'apl0', `${base}.mov`]);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`  ✓ ${it.name}`);
}
