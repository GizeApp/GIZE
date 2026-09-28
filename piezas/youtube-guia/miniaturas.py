"""GIZE · miniaturas de YouTube (1280×720) para las tres guías: usuarios, coach y completa.
Mismo diseño que los videos: fondo con glows y tubos de neón, palabra clave en neón, titular en Outfit
y teléfonos con pantallas reales de la grabación. Se arman a 1920×1080 y se achican.
Uso: python3 miniaturas.py   → salida/miniatura-{usuarios,coach,completa}.png"""
import os, sys, glob
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
HERE = os.path.dirname(os.path.abspath(__file__))
import importlib.util
_s = importlib.util.spec_from_file_location('guia', os.path.join(HERE, 'guia.py'))
G = importlib.util.module_from_spec(_s); _s.loader.exec_module(G)
R, HI = G.R, G.HI
W, H = G.W, G.H
FR = os.path.join(HERE, 'grabacion', 'frames')
OUT = os.path.join(HERE, 'salida')

def shot(part, scene, pos=1.0):
    fs = sorted(glob.glob(os.path.join(FR, part, scene, '*.jpg')))
    return Image.open(fs[min(len(fs) - 1, int(pos * (len(fs) - 1)))]).convert('RGB')

def phone(content, height, angle=0):
    s = height / R.PH
    def sc(im): return im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    L = sc(R.GLOW); L.alpha_composite(sc(R.BODY))
    cw, ch = round(R.CW * s), round(R.CH * s)
    c = content.resize((cw, ch), Image.LANCZOS).convert('RGBA'); c.putalpha(R.rounded_mask(cw, ch, round(42 * s)))
    o = round((R.PAD + R.BZ) * s); L.alpha_composite(c, (o, o)); L.alpha_composite(sc(R.RING))
    return L.rotate(angle, resample=Image.BICUBIC, expand=True) if angle else L

def shadow(c, L, x, y):
    a = L.getchannel('A').filter(ImageFilter.GaussianBlur(30)).point(lambda v: int(v * .55))
    sh = Image.new('RGBA', L.size, (0, 0, 0, 0)); sh.putalpha(a); c.alpha_composite(sh, (x + 24, y + 30))

def text(c, xy, s, font, fill):
    ImageDraw.Draw(c).text(xy, s, font=font, fill=fill)

def neon_left(c, word, x, base_y, size):
    im, P = HI.neon(word, size, None, 12)
    c.alpha_composite(im, (x - P, base_y - (im.height - P)))

def pill(c, x, y, s):
    f = R.F_H(40); d = ImageDraw.Draw(c); tw = d.textlength(s, font=f); w, h = int(tw + 64), 76
    g = Image.new('RGBA', (w + 80, h + 80), (0, 0, 0, 0)); gm = Image.new('L', g.size, 0)
    ImageDraw.Draw(gm).rounded_rectangle((40, 40, 40 + w, 40 + h), h // 2, fill=255)
    col = Image.fromarray(HI.R6.gama_h(g.width, g.height, G.NEON3).astype(np.uint8)).convert('RGBA')
    glow = col.copy(); glow.putalpha(gm.filter(ImageFilter.GaussianBlur(16)).point(lambda v: int(v * .8))); c.alpha_composite(glow, (x - 40, y - 40))
    ring = col.copy(); ring.putalpha(gm); c.alpha_composite(ring, (x - 40, y - 40))
    inner = Image.new('RGBA', (w - 6, h - 6), (8, 10, 16, 255)); inner.putalpha(R.rounded_mask(w - 6, h - 6, (h - 6) // 2))
    c.alpha_composite(inner, (x + 3, y + 3)); text(c, (x + 32, y + 12), s, f, (255, 255, 255))

def base():
    G._G[0] = 200                                   # tubos ya encendidos
    return Image.fromarray(np.clip(G.fondo(200), 0, 255).astype(np.uint8)).convert('RGBA')

FIRMA = R.svg('gize-firma-horizontal.svg', 250)

def make(name, word, word_size, head, sub, phones):
    c = base()
    # teléfonos a la derecha, inclinados y superpuestos
    for content, hgt, ang, cx, cy in phones:
        L = phone(content, hgt, ang); x, y = cx - L.width // 2, cy - L.height // 2
        shadow(c, L, x, y); c.alpha_composite(L, (x, y))
    # velo oscuro detrás del texto para que se lea chico
    v = np.clip(1 - (np.arange(W) - 700) / 500, 0, 1) ** 1.3 * .55
    veil = Image.new('RGBA', (W, H), (4, 5, 9, 0)); veil.putalpha(Image.fromarray((np.tile(v, (H, 1)) * 255).astype(np.uint8)))
    c.alpha_composite(veil)
    c.alpha_composite(FIRMA, (110, 96))
    neon_left(c, word, 104, 520, word_size)
    y = 560
    for i, ln in enumerate(head):
        text(c, (112, y), ln, R.F_H(112), (255, 255, 255)); y += 118
    pill(c, 116, y + 30, sub)
    img = c.convert('RGB').resize((1280, 720), Image.LANCZOS)
    path = os.path.join(OUT, f'miniatura-{name}.png'); img.save(path, optimize=True); print(path, os.path.getsize(path) // 1024, 'KB')

make('usuarios', 'gratis', 300, ['Guía de', 'la app'], 'Sin coach · sin pagar',
     [(shot('solo', 'entrenar', .92), 820, 8, 1430, 530), (shot('solo', 'comida'), 880, -6, 1650, 555)])
make('coach', 'tu panel', 230, ['Guía para', 'coaches'], '14 días gratis',
     [(shot('coach', 'alumno', .45), 820, 8, 1430, 530), (shot('coach', 'chat'), 880, -6, 1660, 555)])
make('completa', 'todo', 300, ['Guía', 'completa'], 'Usuarios + coaches',
     [(shot('solo', 'comida'), 820, 8, 1430, 530), (shot('coach', 'chat'), 880, -6, 1660, 555)])
