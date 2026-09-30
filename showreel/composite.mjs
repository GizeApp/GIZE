// Real footage → a GIZE Reel: the clip cropped to 9:16, the CHAU stamp on top of its first
// second, overlays from stock/07-overlays at the times you give, the signature in the corner,
// a music bed from lib/sound.py under the clip's own sound, and the end card.
//   node composite.mjs --clip=path/clip.mp4 --out=stock/08-clips-reales/name.mp4
//     [--start=0] [--dur=10]               the part of the clip to use (seconds)
//     [--stamp="NOTAS DEL CELU"]           CHAU ___ intro (any word from overlays/build.mjs)
//     [--at=serie-record:3.2 --at=descanso:6]   overlays at clip times (repeatable)
//     [--cta=hype|launch] [--clip-audio=0.35] [--no-music]
// Needs the overlay pack (node overlays/build.mjs) and the end cards (node build.mjs jobs/cierres.json).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2), args = {}, at = [];
for (const a of argv) { const m = a.replace(/^--/, '').match(/^([^=]+)(?:=(.*))?$/); if (m[1] === 'at') at.push(m[2]); else args[m[1]] = m[2] ?? '1'; }
const FF = process.env.FFMPEG || execFileSync('python3', ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())']).toString().trim();
const OV = path.join(HERE, 'stock/07-overlays');
const slug = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const ff = a => execFileSync(FF, ['-y', '-hide_banner', '-loglevel', 'error', ...a], { stdio: 'inherit' });
if (!args.clip || !args.out) { console.error('usage: node composite.mjs --clip=clip.mp4 --out=out.mp4 [--stamp=WORD] [--at=overlay:seconds] [--cta=hype|launch]'); process.exit(1); }
const hasAudio = (() => { try { execFileSync(FF, ['-hide_banner', '-i', args.clip, '-map', '0:a:0', '-t', '0.1', '-f', 'null', '-'], { stdio: 'pipe' }); return true; } catch { return false; } })();
const probe = (() => { try { execFileSync(FF, ['-hide_banner', '-i', args.clip], { stdio: 'pipe' }); } catch (e) { return String(e.stderr); } return ''; })();
const clipDur = (() => { const m = probe.match(/Duration: (\d+):(\d+):([\d.]+)/); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 10; })();
const start = +(args.start || 0), dur = Math.min(+(args.dur || 12), clipDur - start), cta = args.cta || 'hype', clipVol = +(args['clip-audio'] ?? 0.35);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gize-comp-'));

// what each overlay sounds like (seconds from the overlay's own start) — same palette as the episodes
const SFX = {
  'serie-record': [{ t: 0.55, s: 'tap' }, { t: 0.62, s: 'pr' }], serie: [{ t: 0.55, s: 'tap' }, { t: 0.6, s: 'pop' }],
  descanso: [...Array.from({ length: 12 }, (_, q) => ({ t: 0.35 + q * 0.16, s: 'click', f: 3200, d: 0.008, g: 0.35 })), { t: 2.3, s: 'buzz', d: 0.4 }, { t: 2.32, s: 'chime' }],
  'cardio-en-vivo': [{ t: 0.1, s: 'whoosh', d: 0.4, f0: 400, f1: 3000, g: 0.6 }, { t: 1.2, s: 'bell', m: 81, d: 0.6 }, { t: 2.6, s: 'bell', m: 83, d: 0.6 }],
  habito: [{ t: 0.6, s: 'tap' }, { t: 0.62, s: 'bloop', k: 0, v: 0.9 }], firma: [{ t: 0.05, s: 'pen' }, { t: 0.42, s: 'pop' }],
};
const layers = [], cues = [];
if (args.stamp) { layers.push({ file: `chau-${slug(args.stamp)}`, t: 0 }); cues.push({ t: 0, s: 'stamp' }, { t: 0.005, s: 'strike' }, { t: 0.2, s: 'marker' }, { t: 0.3, s: 'pop' }, { t: 0.94, s: 'revcrash', d: 0.36 }, { t: 1.3, s: 'hit', g: 0.7 }); }
const tSig = args.stamp ? 1.45 : 0.2;
layers.push({ file: 'firma', t: tSig, hold: true }); cues.push(...SFX.firma.map(c => ({ ...c, t: c.t + tSig })));
for (const a of at) { const [name, t] = a.split(':'); layers.push({ file: name, t: +t }); cues.push(...(SFX[name] || []).map(c => ({ ...c, t: c.t + +t }))); }
for (const l of layers) if (!fs.existsSync(path.join(OV, `${l.file}.webm`))) { console.error(`missing overlay ${l.file}.webm — run: node overlays/build.mjs`); process.exit(1); }
const endcard = path.join(OV, `cierre_${cta}_9x16.mp4`);
if (!fs.existsSync(endcard)) { console.error(`missing ${path.relative(HERE, endcard)} — run: node build.mjs jobs/cierres.json`); process.exit(1); }

// 1 · music bed + effects (lib/sound.py), unless --no-music
const sheet = { dur, cues: args['no-music'] ? cues : [...cues, { t: args.stamp ? 1.3 : 0, s: 'groove', t1: dur - 0.05, bpm: 128, chords: [[0, 'Am'], [dur * 0.25, 'F'], [dur * 0.5, 'C'], [dur * 0.75, 'G']], parts: ['kick', 'hat', 'bass', 'pad', 'arp'] }] };
fs.writeFileSync(path.join(TMP, 'cues.json'), JSON.stringify(sheet));
execFileSync('python3', [path.join(HERE, 'lib/sound.py'), path.join(TMP, 'cues.json'), path.join(TMP, 'bed.wav')], { stdio: 'inherit' });

// 2 · the clip at 9:16 / 60 fps with the overlays on top, clip audio under the bed
const inputs = ['-ss', String(start), '-t', String(dur), '-i', args.clip, '-i', path.join(TMP, 'bed.wav')];
if (!hasAudio) inputs.push('-f', 'lavfi', '-t', String(dur), '-i', 'anullsrc=r=48000:cl=stereo');
layers.forEach(l => inputs.push('-c:v', 'libvpx-vp9', '-itsoffset', String(l.t), '-i', path.join(OV, `${l.file}.webm`)));
const base = hasAudio ? 2 : 3;
let fc = `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=60,setsar=1,format=yuva420p[v0]`, prev = 'v0';
layers.forEach((l, i) => { fc += `;[${prev}][${base + i}:v]overlay=0:0:eof_action=${l.hold ? 'repeat' : 'pass'}:format=auto[v${i + 1}]`; prev = `v${i + 1}`; });
fc += `;[${prev}]format=yuv420p[vout];[${hasAudio ? '0:a' : '2:a'}]aresample=48000,volume=${clipVol}[ca];[1:a]aresample=48000[ma];[ca][ma]amix=inputs=2:normalize=0:duration=longest,atrim=0:${dur},afade=t=out:st=${Math.max(0, dur - 0.3)}:d=0.3[aout]`;
const main = path.join(TMP, 'main.mp4');
ff([...inputs, '-filter_complex', fc, '-map', '[vout]', '-map', '[aout]', '-t', String(dur), '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-ac', '2', main]);

// 3 · + the end card
fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
ff(['-i', main, '-i', endcard, '-filter_complex', '[0:v]settb=AVTB,fps=60,format=yuv420p[a];[1:v]settb=AVTB,fps=60,format=yuv420p[b];[0:a]aresample=48000[x];[1:a]aresample=48000[y];[a][x][b][y]concat=n=2:v=1:a=1[v][au]',
  '-map', '[v]', '-map', '[au]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', path.resolve(args.out)]);
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`✓ ${args.out}  (${(dur + 4).toFixed(1)} s)`);
