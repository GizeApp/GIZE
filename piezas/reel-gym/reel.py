"""GIZE · reel con el video real de Lautaro en el gimnasio (la app en uso) + cierre de marca.
Mismo diseño que la historia: Outfit, rótulos con filetes, palabra clave en neón y fondo de glows.
1080×1920, 30 fps, sin audio. Uso: python3 reel.py salida.mp4   ·   python3 reel.py --cuadros 30 120 ..."""
import sys, os, subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'reel-atleta'))
import reel as R
from reel import W, H, FPS, TEXT, BLUE, ease_out, ease_io, fade
import importlib.util
_s = importlib.util.spec_from_file_location('historia', os.path.join(HERE, '..', 'historia-prueba', 'historia.py'))
HI = importlib.util.module_from_spec(_s)
_argv, sys.argv = sys.argv, sys.argv[:1]; _s.loader.exec_module(HI); sys.argv = _argv

SRC = os.path.join(HERE, 'src', 'gimnasio-lautaro.mp4')
SUB = (214, 220, 230)
CLIP_N = 10 * FPS                     # el video dura 10 s
END_N = int(5.5 * FPS)
WIPE = 12
N = CLIP_N + END_N

# ---------- video de Lautaro: escalado a 1080×1920, con color de marca ----------
def load_clip():
    cmd = ['ffmpeg', '-v', 'error', '-i', SRC, '-vf',
           'scale=1080:-2:flags=lanczos,crop=1080:1920,unsharp=5:5:0.6:5:5:0,eq=contrast=1.06:saturation=1.15:brightness=0.03:gamma=1.22',
           '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    fr = np.frombuffer(raw, np.uint8).reshape(-1, H, W, 3)
    return fr
CLIP = load_clip()

yy = np.linspace(0, 1, H, dtype=np.float32)[:, None, None]
xx = np.linspace(-1, 1, W, dtype=np.float32)[None, :, None]
# tinte: sombras hacia azul/violeta, velo abajo para el texto, viñeta suave
TINT = np.array([18, 10, 40], np.float32)
SCRIM = (np.clip((yy - .55) / .40, 0, 1) ** 1.3 * .72 + np.clip((.16 - yy) / .16, 0, 1) * .40)
VIG = 1 - .28 * (xx ** 2) - .12 * ((yy * 2 - 1) ** 2)

def clip_frame(f):
    a = CLIP[min(f, len(CLIP) - 1)].astype(np.float32)
    lum = a.mean(axis=2, keepdims=True) / 255
    a = a + TINT * (1 - lum) * .9                       # sombras con color de marca
    a = a * VIG * (1 - SCRIM)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).convert('RGBA')

# ---------- textos ----------
X0 = 84
def label(text, size=40):
    f = R.F_M(size); lay = Image.new('RGBA', (W, size + 30), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    d.line((X0, size * .62, X0 + 50, size * .62), fill=BLUE + (220,), width=3); d.text((X0 + 68, 2), text, font=f, fill=TEXT)
    return lay

def headline(text, size=92):
    lay = Image.new('RGBA', (W, size + 40), (0, 0, 0, 0))
    ImageDraw.Draw(lay).text((X0, 0), text, font=R.F_H(size), fill=TEXT)
    sh = lay.getchannel('A').filter(ImageFilter.GaussianBlur(10)).point(lambda v: int(v * .7))
    out = Image.new('RGBA', lay.size, (0, 0, 0, 0)); s = Image.new('RGBA', lay.size, (0, 0, 0, 255)); s.putalpha(sh)
    out.alpha_composite(s, (0, 4)); out.alpha_composite(lay); return out

def neon_word(text, size):
    im, P = HI.neon(text, size, None, 10)
    return im, P

def put(c, lay, x, y, a, rise=22):
    if a > 0: c.alpha_composite(fade(lay, min(1, a)), (int(x), int(y + (1 - min(1, a)) * rise)))

def flick(k): return [0, .6, 0, .3, 1, .5, 1][k // 2] if 0 <= k < 14 else (1.0 if k >= 14 else 0)

# (inicio, fin, línea blanca, palabra en neón, tamaño del neón)
BEATS = [(6, 78, 'Así se entrena', 'hoy.', 170),
         (78, 150, 'Cada serie,', 'anotada.', 170),
         (150, 222, 'El descanso,', 'cronometrado.', 128),
         (222, 300, 'Tu progreso,', 'a mano.', 170)]
BEAT_L = [(headline(a), neon_word(b, s)) for _, _, a, b, s in BEATS]
TAG = label('Grabado en el gimnasio · uso real')

def gym(f):
    c = clip_frame(f)
    put(c, TAG, 0, 262, ease_out((f - 4) / 12) * (1 - ease_io((f - 288) / 12)), 0)
    for (t0, t1, *_), (hl, (nw, P)) in zip(BEATS, BEAT_L):
        if not (t0 - 1 <= f < t1 + 8): continue
        k = f - t0
        out = 1 - ease_io((f - (t1 - 8)) / 10)
        put(c, hl, 0, 1210, ease_out(k / 10) * out)
        a = flick(k - 4) * out
        if a > 0: c.alpha_composite(fade(nw, a), (X0 - P + 2, 1515 - (nw.height - P)))
    # firma chiquita arriba a la derecha para que se asocie a la marca todo el tiempo
    c.alpha_composite(fade(LOGO_S, .92), (W - LOGO_S.width - 84, 262))
    return c

LOGO_S = R.svg('gize-firma-horizontal.svg', 170)

# ---------- cierre de marca ----------
FIRMA = R.svg('gize-firma-horizontal.svg', 380)
def end(f):
    c = HI.bg()
    a = ease_out(f / 14)
    c.alpha_composite(fade(FIRMA, a), ((W - FIRMA.width) // 2, int(600 + (1 - a) * 16)))
    if f >= 6: HI.put_neon(c, 'gratis', 990, 250, flick(f - 6), stroke=10)
    a = ease_out((f - 24) / 12)
    if a > 0: HI.R6.centered(c, 'Descargá GIZE y entrená con todo anotado.', R.F_H(50), 1050 + (1 - a) * 16, TEXT, a)
    for i, b in enumerate(HI.BADGES):
        a = ease_out((f - 34 - i * 6) / 12)
        if a > 0: c.alpha_composite(fade(b, a), ([W // 2 - b.width - 14, W // 2 + 14][i], int(1160 + (1 - a) * 24)))
    a = ease_out((f - 54) / 12)
    if a > 0:
        HI.R6.rgb_line(c, 1380, 300, W - 300, a)
        HI.R6.centered(c, '¿Sos coach? Probá el panel 14 días gratis.', R.F_M(40), 1414 + (1 - a) * 12, SUB, a)
    a = ease_out((f - 66) / 12)
    if a > 0: HI.R6.centered(c, 'gize.ar', R.F_M(52), 1500 + (1 - a) * 12, BLUE, a)
    return c

def frame(g):
    HI._G[0] = g
    if g < CLIP_N: img = gym(g).convert('RGB')
    else:
        f = g - CLIP_N; img = end(f).convert('RGB')
        if f < WIPE: img = R.wipe(gym(CLIP_N - 1).convert('RGB'), img, ease_io(f / WIPE))
    out = min(1, g / 6) * (1 - ease_io((g - (N - 10)) / 10))
    a = np.asarray(img).astype(np.float32) * out + HI.GRAIN
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))

def main(out):
    ff = subprocess.Popen(['ffmpeg', '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                           '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-x264-params', 'aq-mode=3', '-pix_fmt', 'yuv420p',
                           '-profile:v', 'high', '-movflags', '+faststart', out], stdin=subprocess.PIPE)
    for g in range(N): ff.stdin.write(frame(g).tobytes())
    ff.stdin.close(); ff.wait(); print('ok', round(N / FPS, 1), 's')

if __name__ == '__main__':
    if len(sys.argv) > 2 and sys.argv[1] == '--cuadros':
        for g in map(int, sys.argv[2:]): frame(g).save(os.path.join(HERE, f'cuadro-{g}.png'))
    else:
        main(sys.argv[1])
