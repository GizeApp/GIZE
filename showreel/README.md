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

# Campaign stock · pre-launch and launch

Everything for @gize.app is rendered into `stock/`, with captions, hashtags and ad copy in `stock/catalog.json`. The videos, covers and overlays are not kept in git (see `.gitignore`); only the sources and the catalog are. Anything here can be re-rendered with the commands below.

| Folder | What | Formats |
|---|---|---|
| `01-teasers/` | 4 hype teasers (el punto, la G, el mapa, chau) | 9:16, 4:5 |
| `02-episodios/` | "CHAU ___" episodes 02–08, athlete voice, hook A (the question) and hook B (the result, then rewind) | 9:16, 4:5 |
| `03-stories/` | 3 Story cuts per episode (gancho, demo, cierre) with room for a sticker | 9:16 |
| `04-muy-pronto/` | Ep. 01 (coach) and the brand reel with the «Muy pronto» ending | 9:16 + 4:5 crop; 16:9 |
| `05-lanzamiento/` | 30 s trailer, `launch` («Ya está disponible») and `hype` («Muy pronto») | 9:16, 4:5, 16:9 |
| `06-lanzamiento-finales/` | every episode, Ep. 01 and the brand reel with the launch ending | as above |
| `07-overlays/` | overlays for real footage + the end card on its own (`cierre_*`) | 9:16 (cierre: all) |
| `08-clips-reales/` | real clips composited with `composite.mjs` | 9:16 |
| `09-reel-20/` | the 20 s motion reel (ignition, type, 3D phone, map, grid, tunnel, marquee, signature) | 9:16, 16:9 |
| `10-formatos-ig/` | trending formats: «El logo en todo» (hard cuts on the beat) and «UI en movimiento» | 9:16 (+16:9 for UI) |
| `11-linea/` | «Seguí la línea»: one continuous line draws the app, then the phone, then the G (loops) | 9:16 |
| `12-logo-ig/` | the logo on 20 backgrounds (blues, RGB, textures, patterns, posters) + a board with profile-photo previews | 1080 × 1080 PNG |
| `13-liquido/` | «Líquido»: liquid chrome (WebGL) with the features rising out of the metal, a chrome phone, the G | 9:16 |
| `14-iconos-app/` | app icon candidates (A: inside the brand book, B: explorations), with light versions where they differ, + a board with the iOS mask on dark and light home screens | 1024 × 1024 PNG |
| `15-logo-letras/` | letters-only logos: the logotype's word (plain, framed, stacked, italic, outline, RGB, chrome, neon, glass), its G alone, and a lowercase «gize» with the blue dot on the i | 1080 × 1080 PNG |

## How a piece is made

- `lib/engine.js`: the deterministic canvas harness (motion blur, bloom, chromatic aberration, camera hits), layouts per format (`?fmt=9x16|4x5|16x9`) and `?alpha=1` for transparent overlays.
- `lib/ui.js`, `lib/screens.js`, `lib/map.js`: the app's screens rebuilt from `app/screens` (Entreno, Cardio, Comida, Hábitos, Progreso, the chat) with the app's own copy.
- `lib/chau.js`: the series skeleton at 128 BPM (question → stamp → drop → demo → payoff → end card → loop).
- `lib/endcard.js`: the end card, `?cta=hype|launch|trial`.
- `lib/sound.py`: every page exports a cue sheet (`window.getCues()`); this synthesizes the soundtrack from it (no samples).
- `build.mjs jobs/<file>.json`: renders every piece × format × hook × ending, makes the soundtrack, encodes, writes a cover. Existing files are skipped (`--force` to redo, `--only=id` for one).

```bash
node build.mjs jobs/teasers.json          # 01-teasers
node build.mjs jobs/episodes.json         # 02-episodios
node stories.mjs jobs/episodes.json       # 03-stories
node build.mjs jobs/batch3.json           # 04-muy-pronto
node build.mjs jobs/launch.json           # 05-lanzamiento
node build.mjs jobs/launch-endings.json   # 06-lanzamiento-finales
node overlays/build.mjs [--prores]        # 07-overlays (--prores adds ProRes 4444 .mov with alpha, ~40 MB each)
node build.mjs jobs/cierres.json          # 07-overlays/cierre_*
node build.mjs jobs/reel20.json           # 09-reel-20
node build.mjs jobs/refs.json             # 10-formatos-ig
node build.mjs jobs/linea.json            # 11-linea
node logo-ig/build.mjs                   # 12-logo-ig (stills, 15 s)
node build.mjs jobs/liquido.json          # 13-liquido
node logo-app/build.mjs                  # 14-iconos-app (stills)
node logo-letras/build.mjs               # 15-logo-letras (stills)
```

`build.mjs` also takes `--formats=9x16` and `--ctas=hype` to render one format or one ending at a time.

To check a moment without rendering everything: `node render.mjs "--page=showreel/episodes/04-descanso.html?fmt=4x5&hook=b" --times=0.5,9.8 --sub=1 --out=/tmp/check`.

## Real footage

Film vertical, 1080×1920 or larger, at least 60 fps if possible. Then either:

- **Edit it yourselves** (CapCut, InShot, Premiere). Drop the overlays from `stock/07-overlays/` on top: `_verde.mp4` with the chroma key tool (the green stamps come without the dark scrim, so they key cleanly; add a dark filter under them if the clip is bright), or `.webm` which already has transparency and the scrim, and finish with `cierre_hype_9x16.mp4`. The stamps are `chau-<word>`. The UI overlays are `serie`, `serie-record`, `descanso`, `cardio-en-vivo`, `habito` and `firma`.
- **Or send the clip** and it gets composited:

```bash
node composite.mjs --clip=clips/sentadilla.mp4 --stamp="NOTAS DEL CELU" --at=serie-record:3.2 --at=descanso:6 --out=stock/08-clips-reales/sentadilla.mp4
```

## The calendar

`calendar/build.py` builds the shared posting calendar from `stock/catalog.json`. It covers 3 Reels a week (plus a Sunday motion piece), daily Stories, the ad variants, the Story stickers and every file. The page is published as a claude.ai artifact, and posting status is shared by the team there.
