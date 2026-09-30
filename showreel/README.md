# GIZE · motion reel

15 s, 1920×1080, 60 fps, 120 BPM. `gize-reel.mp4` is the rendered result.

Everything comes from the brand system in `/brand`: Outfit (animated as a variable font), the
RGB palette (`#2FA0FF` `#A65CFF` `#FF3DAE` `#25E8C8`), and the signature from
`brand/logo/gize-firma-horizontal.svg`, which `reel.html` parses at runtime. The logo is never
retyped in a font, never deformed, and the dot of the G keeps its blue.

| Time | Chapter | What happens |
|---|---|---|
| 0–2 s | 00 · The dot | The G's blue dot bounces (squash & stretch), charges up with the RGB ring and jumps |
| 2–4 s | 01 · Entrená · Registrá · Progresá | Kinetic type; the O of PROGRESÁ is a portal |
| 4–6 s | 02 · Set logging | A grid of sets that fill in, get checked off and line up |
| 6–7.75 s | 03 · Cardio with GPS | The grid becomes a 3D map with a neon frame, a route with elevation, and a runner |
| 7.75–10 s | 04 · Energize | The route shatters into 7,000 particles that spell "energize" |
| 10–11.5 s | 05 · Everything in one place | Slot-machine columns: rest timer, scanner, habits, cardio, hydration, macros, coach, progress |
| 11.5–13 s | 06 · Progress with data | Weekly volume (with a deload week) + a push notification from the coach |
| 13–15 s | Signature | RGB rule, wordmark, the G drawn like a pen stroke; the ball from the start lands as its dot |

## Re-rendering

```bash
python3 audio.py                     # soundtrack.wav (synthesized, synced to the timeline)
node render.mjs --out=frames         # 900 PNGs with real motion blur (headless Chromium + Playwright)
./encode.sh frames                   # gize-reel.mp4
```

- `reel.html?play` (served from the repo root, e.g. `npx serve .`) plays a real-time preview,
  without blur or post-processing.
- `node render.mjs --times=2.5,7.1 --sub=1` renders stills to check a moment.
- Dependencies: Node + Playwright with Chromium, Python with `numpy` and `scipy`, and ffmpeg
  (if it isn't on the PATH, `pip install imageio-ffmpeg`).

# Instagram series · "Chau planilla"

Vertical Reels for coaches (1080×1920, 60 fps, ~15 s, 128 BPM, seamless loop). Each episode
opens on a coaching pain living in a spreadsheet/chat chaos and morphs it into the GIZE feature
that replaces it. Same end every time: the blue dot drops into the G, then
"Probalo 14 días gratis · sin tarjeta", "Link en la bio", gize.ar. Only features the app really
has; no store badges, prices or other companies' brands.

## Ep. 01 · The routine (`chau-planilla-01/`)

| Time | Beat |
|---|---|
| 0–1.9 s | Hook: a grim spreadsheet + chat bubbles pile up. "¿Todavía armás rutinas en una planilla?" |
| 1.9–2.8 s | Red strike, "CHAU PLANILLA" stamp, "EP. 01 · LA RUTINA", silence |
| 2.8–8.4 s | Drop: the cells fly into the phone and become the real "Entreno" screen. Tomás logs 32,5 kg × 9, "🏆 PR +2,5 kg", rest timer. "Armás el plan." / "Tu alumno registra cada serie." |
| 8.4–11.2 s | "Guardar entreno de hoy": the dot carries it to Martina's "Historial de entrenos" with "▲ +2,5 kg". "Y vos ves cómo progresa." |
| 11.2–15 s | Signature + CTA, then tiles flip back to the spreadsheet (loop) |

Files: `chau-planilla-01.mp4` (with music), `chau-planilla-01-sin-musica.mp4` (sound design
only, to layer a trending Instagram track on top), `portada.jpg` (cover, reads inside the 3:4
grid crop) and `caption.txt` (caption + hashtags).

```bash
cd chau-planilla-01 && python3 audio.py && cd ..            # soundtrack.wav + sfx.wav
node render.mjs --page=showreel/chau-planilla-01/reel.html --out=chau-planilla-01/frames
./encode.sh chau-planilla-01/frames chau-planilla-01/soundtrack.wav chau-planilla-01/chau-planilla-01.mp4
./encode.sh chau-planilla-01/frames chau-planilla-01/sfx.wav chau-planilla-01/chau-planilla-01-sin-musica.mp4
```
