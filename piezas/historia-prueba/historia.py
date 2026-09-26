"""GIZE · historia de 10 s: 14 días de prueba gratis para coaches y la app gratis para quien entrena sin coach.
1080×1920, 30 fps, sin audio. Uso: python3 historia.py salida.mp4"""
import sys, os, io, subprocess
import numpy as np
import cairosvg
from PIL import Image, ImageDraw, ImageFilter, ImageChops
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'reel-atleta'))
import reel as R
from reel import W, H, FPS, TEXT, TEXT2, BLUE, GAMA, ease_out, ease_io, fade
import importlib.util
_s = importlib.util.spec_from_file_location('reel6', os.path.join(HERE, '..', 'reel-ios', 'reel.py'))
R6 = importlib.util.module_from_spec(_s)
_argv, sys.argv = sys.argv, sys.argv[:1]          # ese módulo lee la fecha de argv
_s.loader.exec_module(R6); sys.argv = _argv         # neón, filete y texto centrado

N = 10 * FPS
B_END, A_START, C_START = 120, 132, 258          # gratis para todos · coaches · firma
BORDER = (40, 45, 58)

def icon(name, size):
    svg = open(os.path.join(HERE, name + '.svg')).read().replace('<path ', '<path fill="#FFFFFF" ')
    return Image.open(io.BytesIO(cairosvg.svg2png(bytestring=svg.encode(), output_width=size, output_height=size))).convert('RGBA')
APPLE, ANDROID = icon('apple', 70), icon('android', 70)
FIRMA = R.svg('gize-firma-horizontal.svg', 420)

def gama_color(t):
    p = t * 2; i = min(int(p), 1); fr = p - i
    return tuple(int(GAMA[i][k] * (1 - fr) + GAMA[i + 1][k] * fr) for k in range(3))

def kicker(c, text, y, a):
    lay = Image.new('RGBA', (W, 60), (0, 0, 0, 0)); d = ImageDraw.Draw(lay); fk = R.F_MONO(34)
    d.text(((W - d.textlength(text, font=fk)) / 2, 6), text, font=fk, fill=BLUE)
    c.alpha_composite(fade(lay, a), (0, int(y + (1 - a) * 16)))

# ---------- neón (mismo tubo que el 14 del comienzo, con caja a medida y supersampleo) ----------
_neon = {}
def neon(text, size, box=None, stroke=11):
    key = (text, size, box)
    if key in _neon: return _neon[key]
    SS = 3; font = R.F_H(size * SS); P = 90
    d = ImageDraw.Draw(Image.new('L', (1, 1)))
    l, t, r, b = d.textbbox((0, 0), box or text, font=font)
    w, h = (r - l) // SS + 2 * P, (b - t) // SS + 2 * P
    tw, tw0 = d.textlength(text, font=font), d.textlength(box or text, font=font)
    big = Image.new('L', (w * SS, h * SS), 0)
    ImageDraw.Draw(big).text((P * SS - l + (tw0 - tw) / 2, P * SS - t), text, font=font, fill=255)
    inner_big = big.filter(ImageFilter.MinFilter(stroke * SS | 1))
    alpha = big.resize((w, h), Image.LANCZOS)
    inner = inner_big.resize((w, h), Image.LANCZOS)
    edge = ImageChops.subtract(alpha, inner)
    col = Image.fromarray(R6.gama_h(w, h, GAMA[:3]).astype(np.uint8))
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    g = col.convert('RGBA'); g.putalpha(edge.filter(ImageFilter.GaussianBlur(22)).point(lambda v: min(255, int(v * 2.6))))
    g2 = col.convert('RGBA'); g2.putalpha(edge.filter(ImageFilter.GaussianBlur(6)).point(lambda v: min(255, int(v * 1.6))))
    fl = col.convert('RGBA'); fl.putalpha(inner.point(lambda v: int(v * .10)))
    tube = col.convert('RGBA'); tube.putalpha(edge)
    core = Image.new('RGBA', (w, h), (255, 255, 255, 0))
    core.putalpha(edge.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(.8)).point(lambda v: int(v * .8)))
    for L in (g, g2, fl, tube, core): out.alpha_composite(L)
    _neon[key] = (out, P)
    return _neon[key]

def put_neon(c, text, base_y, size, a=1.0, box=None, stroke=11):
    """Neón centrado con la base del texto en base_y y su reflejo abajo."""
    im, P = neon(text, size, box, stroke)
    x, y = (W - im.width) // 2, base_y - (im.height - P)
    c.alpha_composite(fade(im, a), (x, y))
    ref = im.transpose(Image.FLIP_TOP_BOTTOM).crop((0, P, im.width, P + 150)).filter(ImageFilter.GaussianBlur(5))
    fa = np.linspace(.20, 0, 150)[:, None] * np.asarray(ref.getchannel('A'), np.float32) * a
    ref.putalpha(Image.fromarray(fa.astype(np.uint8)))
    c.alpha_composite(ref, (x, base_y + 10))

def kicker_lines(c, text, y, a):
    """Rótulo en mono con dos filetes finos a los lados, como en el comienzo."""
    fk = R.F_MONO(34); d = ImageDraw.Draw(c); tw = d.textlength(text, font=fk)
    lay = Image.new('RGBA', (W, 60), (0, 0, 0, 0)); ld = ImageDraw.Draw(lay)
    ld.text(((W - tw) / 2, 6), text, font=fk, fill=BLUE)
    L = int(60 * a)
    ld.line(((W - tw) / 2 - 28 - L, 28, (W - tw) / 2 - 28, 28), fill=BLUE + (150,), width=2)
    ld.line(((W + tw) / 2 + 28, 28, (W + tw) / 2 + 28 + L, 28), fill=BLUE + (150,), width=2)
    c.alpha_composite(fade(lay, a), (0, int(y + (1 - a) * 16)))

# ---------- 2 · coaches: 14 días que se prenden uno por uno ----------
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
    kicker_lines(c, '¿SOS COACH?', 540, ease_out((f - 2) / 12))
    grid(c, f)
    lit = int(np.clip((f - LIT0) // STEP + 1, 0, 14))
    if lit > 0:
        flick = 1.0 if lit < 14 else [.5, 1, .6, 1][min((f - (LIT0 + 13 * STEP)) // 2, 3)]
        put_neon(c, str(lit), 1200, 300, flick, box='14')
    a = ease_out((f - 60) / 14)
    if a > 0: R6.centered(c, 'días de prueba gratis', R.F_H(84), 1262 + (1 - a) * 18, TEXT, a)
    a = ease_out((f - 72) / 14)
    if a > 0: R6.centered(c, 'Sin tarjeta. Probás todo con tus alumnos.', R.F_M(40), 1374 + (1 - a) * 14, (196, 202, 212), a)
    return c

# ---------- 1 · para todos: gratis en las tiendas ----------
STORES = [(APPLE, 'App Store', 'DESDE 29.09'), (ANDROID, 'Google Play', 'DESDE 10.10')]
def store_badge(ic, name, when):
    bw, bh = 440, 166
    lay = Image.new('RGBA', (bw, bh), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    d.rounded_rectangle((1, 1, bw - 2, bh - 2), 34, fill=(14, 17, 24, 235), outline=(70, 78, 96, 255), width=2)
    lay.alpha_composite(ic, (34, (bh - ic.height) // 2))
    d.text((128, 30), name, font=R.F_H(50), fill=TEXT)
    d.text((130, 98), when, font=R.F_MONO(28), fill=BLUE)
    return lay
BADGES = [store_badge(*s) for s in STORES]

def scene_b(f):
    c = R.aurora(f / FPS + 60, strength=.28, cy=.45).convert('RGBA')
    kicker_lines(c, 'PARA TODOS', 540, ease_out((f - 2) / 12))
    k = f - 8
    if k >= 0:
        flick = [0, .6, 0, .3, 1, .5, 1][k // 2] if k < 14 else 1.0
        put_neon(c, 'gratis', 960, 250, flick, stroke=10)
    a = ease_out((f - 26) / 14)
    if a > 0: R6.centered(c, 'En iPhone y en Android.', R.F_H(62), 1092 + (1 - a) * 16, TEXT, a)
    for i, b in enumerate(BADGES):
        a = ease_out((f - 40 - i * 6) / 12)
        if a <= 0: continue
        x = [W // 2 - b.width - 14, W // 2 + 14][i]
        c.alpha_composite(fade(b, a), (x, int(1234 + (1 - a) * 30)))
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

GRAIN = np.random.default_rng(7).uniform(-1, 1, (H, W, 1)).astype(np.float32)

def frame(f):
    if f < B_END: img = scene_b(f).convert('RGB')
    elif f < A_START: img = R.wipe(scene_b(f), scene_a(f - B_END), ease_io((f - B_END) / (A_START - B_END)))
    elif f < C_START: img = scene_a(f - B_END).convert('RGB')
    elif f < C_START + 8: img = R.wipe(scene_a(f - B_END), scene_c(f - C_START), ease_io((f - C_START) / 8))
    else: img = scene_c(f - C_START).convert('RGB')
    out = 1 - ease_io((f - (N - 10)) / 10)
    a = np.asarray(img).astype(np.float32) * out
    a += GRAIN                                  # dither fijo: sin escalones en el degradé y sin inflar el archivo
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))

def main(out):
    ff = subprocess.Popen(['ffmpeg', '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                           '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-x264-params', 'aq-mode=3', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
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
