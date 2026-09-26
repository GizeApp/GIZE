"""GIZE · historia de 10 s: 14 días de prueba gratis para coaches y la app gratis para quien entrena sin coach.
1080×1920, 30 fps, sin audio. Uso: python3 historia.py salida.mp4"""
import sys, os, io, subprocess
import numpy as np
import cairosvg
from PIL import Image, ImageDraw, ImageFilter
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'reel-atleta'))
sys.path.insert(0, os.path.join(HERE, '..', 'triptico-energize'))
import reel as R
from reel import W, H, FPS, TEXT, TEXT2, BLUE, GAMA, ease_out, ease_io, fade
import bigger
import importlib.util
_s = importlib.util.spec_from_file_location('reel6', os.path.join(HERE, '..', 'reel-ios', 'reel.py'))
R6 = importlib.util.module_from_spec(_s)
_argv, sys.argv = sys.argv, sys.argv[:1]          # ese módulo lee la fecha de argv
_s.loader.exec_module(R6); sys.argv = _argv         # neón, filete y texto centrado

N = 10 * FPS
A_END, B_START, C_START = 138, 150, 258          # coaches · sin coach · firma
BORDER = (40, 45, 58)

def icon(name, size):
    svg = open(os.path.join(HERE, name + '.svg')).read().replace('<path ', '<path fill="#FFFFFF" ')
    return Image.open(io.BytesIO(cairosvg.svg2png(bytestring=svg.encode(), output_width=size, output_height=size))).convert('RGBA')
APPLE, ANDROID = icon('apple', 64), icon('android', 64)
FIRMA = R.svg('gize-firma-horizontal.svg', 420)

def gama_color(t):
    p = t * 2; i = min(int(p), 1); fr = p - i
    return tuple(int(GAMA[i][k] * (1 - fr) + GAMA[i + 1][k] * fr) for k in range(3))

def kicker(c, text, y, a):
    lay = Image.new('RGBA', (W, 60), (0, 0, 0, 0)); d = ImageDraw.Draw(lay); fk = R.F_MONO(34)
    d.text(((W - d.textlength(text, font=fk)) / 2, 6), text, font=fk, fill=BLUE)
    c.alpha_composite(fade(lay, a), (0, int(y + (1 - a) * 16)))

# ---------- A · coaches: 14 días que se prenden uno por uno ----------
CELL, GAP, COLS = 100, 18, 7
GX = (W - (COLS * CELL + (COLS - 1) * GAP)) // 2
GY = 660
LIT0, STEP = 16, 3                                 # el día i se prende en LIT0 + i*STEP

def cell_glow():
    m = Image.new('L', (CELL + 80, CELL + 80), 0)
    ImageDraw.Draw(m).rounded_rectangle((40, 40, 40 + CELL, 40 + CELL), 24, fill=255)
    return m.filter(ImageFilter.GaussianBlur(16))
GLOW = cell_glow()

def grid(c, f):
    d = ImageDraw.Draw(c); fn = R.F_MONO(30)
    for i in range(14):
        col, row = i % COLS, i // COLS
        x, y = GX + col * (CELL + GAP), GY + row * (CELL + GAP)
        appear = ease_out((f - 4 - i) / 10)
        if appear <= 0: continue
        on = ease_out((f - LIT0 - i * STEP) / 5)
        rgb = gama_color(i / 13)
        if on > 0:
            g = Image.new('RGBA', GLOW.size, rgb + (0,)); g.putalpha(GLOW.point(lambda v: int(v * .7 * on)))
            c.alpha_composite(g, (x - 40, y - 40))
            box = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0))
            ImageDraw.Draw(box).rounded_rectangle((0, 0, CELL - 1, CELL - 1), 24, fill=rgb + (int(255 * on),))
            c.alpha_composite(box, (x, y))
        else:
            lay = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0))
            ImageDraw.Draw(lay).rounded_rectangle((0, 0, CELL - 1, CELL - 1), 24, outline=BORDER + (int(255 * appear),), width=3)
            c.alpha_composite(lay, (x, y))
        n = str(i + 1); tw = d.textlength(n, font=fn)
        d.text((x + (CELL - tw) / 2, y + CELL / 2 - 20), n, font=fn,
               fill=(255, 255, 255) if on > .5 else (90, 96, 110))

def scene_a(f):
    c = R.aurora(f / FPS + 20, strength=.26, cy=.42).convert('RGBA')
    kicker(c, 'SI SOS COACH', 540, ease_out((f - 2) / 12))
    grid(c, f)
    lit = int(np.clip((f - LIT0) // STEP + 1, 0, 14))
    if lit > 0:
        flick = 1.0 if lit < 14 else [.5, 1, .6, 1][min((f - (LIT0 + 13 * STEP)) // 2, 3)]
        R6.put_neon(c, str(lit), 1210, 1.0, size=300, flicker=flick)
    a = ease_out((f - 60) / 14)
    if a > 0: R6.centered(c, 'días de prueba gratis', R.F_H(78), 1270 + (1 - a) * 18, TEXT, a)
    a = ease_out((f - 72) / 14)
    if a > 0: R6.centered(c, 'Sin tarjeta. Probás todo con tus alumnos.', R.F_S(40), 1380 + (1 - a) * 14, TEXT2, a)
    return c

# ---------- B · sin coach: gratis en las tiendas ----------
def gratis_layer():
    m, _ = bigger.word_mask('GRATIS', 200)
    P = 80
    a = Image.new('L', (m.width + 2 * P, m.height + 2 * P), 0); a.paste(m, (P, P))
    col = Image.fromarray(R6.gama_h(a.width, a.height, GAMA[:3]).astype(np.uint8)).convert('RGBA')
    out = Image.new('RGBA', a.size, (0, 0, 0, 0))
    g = col.copy(); g.putalpha(a.filter(ImageFilter.GaussianBlur(28)).point(lambda v: int(v * .8))); out.alpha_composite(g)
    t = col.copy(); t.putalpha(a); out.alpha_composite(t)
    return out
GRATIS = gratis_layer()

STORES = [(APPLE, 'App Store', 'desde el 29.09'), (ANDROID, 'Google Play', 'desde el 10.10')]
def store_badge(ic, name, when):
    bw, bh = 420, 150
    lay = Image.new('RGBA', (bw, bh), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    d.rounded_rectangle((1, 1, bw - 2, bh - 2), 34, fill=(14, 17, 24, 235), outline=(70, 78, 96, 255), width=2)
    lay.alpha_composite(ic, (34, (bh - ic.height) // 2))
    d.text((122, 30), name, font=R.F_H(46), fill=TEXT)
    d.text((124, 88), when, font=R.F_MONO(24), fill=BLUE)
    return lay
BADGES = [store_badge(*s) for s in STORES]

def scene_b(f):
    c = R.aurora(f / FPS + 60, strength=.28, cy=.45).convert('RGBA')
    kicker(c, '¿ENTRENÁS SIN COACH?', 540, ease_out((f - 2) / 12))
    k = ease_out((f - 10) / 12); s = 1.25 - .25 * k
    g = GRATIS.resize((int(GRATIS.width * s), int(GRATIS.height * s)), Image.LANCZOS)
    if k > 0: c.alpha_composite(fade(g, min(1, k * 1.5)), ((W - g.width) // 2, 740 - (g.height - GRATIS.height) // 2))
    a = ease_out((f - 26) / 14)
    if a > 0: R6.centered(c, 'La app es gratis para vos.', R.F_H(64), 1080 + (1 - a) * 16, TEXT, a)
    for i, b in enumerate(BADGES):
        a = ease_out((f - 40 - i * 6) / 12)
        if a <= 0: continue
        x = [W // 2 - b.width - 16, W // 2 + 16][i]
        c.alpha_composite(fade(b, a), (x, int(1230 + (1 - a) * 30)))
    return c

# ---------- C · firma ----------
def scene_c(f):
    c = R.aurora(f / FPS + 90, strength=.30, cy=.5).convert('RGBA')
    a = ease_out(f / 14); s = .94 + .06 * a
    fi = FIRMA.resize((int(FIRMA.width * s), int(FIRMA.height * s)), Image.LANCZOS)
    c.alpha_composite(fade(fi, a), ((W - fi.width) // 2, 880 - fi.height // 2))
    a = ease_out((f - 8) / 12)
    if a > 0: R6.rgb_line(c, 1010, 300, W - 300, a)
    a = ease_out((f - 12) / 12)
    if a > 0: R6.centered(c, 'gize.ar', R.F_MONO(44), 1060 + (1 - a) * 12, TEXT, a)
    return c

def frame(f):
    if f < A_END: img = scene_a(f).convert('RGB')
    elif f < B_START: img = R.wipe(scene_a(f), scene_b(f - A_END), ease_io((f - A_END) / (B_START - A_END)))
    elif f < C_START: img = scene_b(f - A_END).convert('RGB')
    elif f < C_START + 8: img = R.wipe(scene_b(f - A_END), scene_c(f - C_START), ease_io((f - C_START) / 8))
    else: img = scene_c(f - C_START).convert('RGB')
    out = 1 - ease_io((f - (N - 10)) / 10)
    if out < 1: img = Image.fromarray((np.asarray(img).astype(np.float32) * out).astype(np.uint8))
    return img

def main(out):
    ff = subprocess.Popen(['ffmpeg', '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                           '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
                           '-movflags', '+faststart', out], stdin=subprocess.PIPE)
    for f in range(N):
        ff.stdin.write(frame(f).tobytes())
    ff.stdin.close(); ff.wait()
    print('ok', N / FPS, 's')

if __name__ == '__main__':
    if len(sys.argv) > 2 and sys.argv[1] == '--cuadros':
        for f in map(int, sys.argv[2:]): frame(f).save(os.path.join(HERE, f'cuadro-{f}.png'))
    else:
        main(sys.argv[1])
