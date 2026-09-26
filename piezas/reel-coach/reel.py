"""GIZE · reel del panel de coach, con el mismo diseño que la historia de la prueba gratis:
fondo con glows de la gama y tubos de neón, rótulos en Outfit con filetes, cifras y palabra clave en neón.
El teléfono queda fijo y adentro cambian las 16 funciones del panel. 1080×1920, 30 fps, sin audio.
Uso: python3 reel.py salida.mp4   ·   python3 reel.py --cuadros 40 200 ..."""
import sys, os, json, glob, subprocess
import numpy as np
from PIL import Image, ImageDraw
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'reel-atleta'))
import reel as R
from reel import W, H, FPS, TEXT, BLUE, ease_out, ease_io, fade
import importlib.util
_s = importlib.util.spec_from_file_location('historia', os.path.join(HERE, '..', 'historia-prueba', 'historia.py'))
HI = importlib.util.module_from_spec(_s); _s.loader.exec_module(HI)   # fondo, neón, rótulos y firma de la historia

FR = os.path.join(HERE, 'grabacion', 'frames')
SUB = (196, 202, 212)
FEATURES = [   # (escena grabada, rótulo, titular)
    ('lista',      'Clientes',     'Todos tus alumnos, a la vista.'),
    ('codigo',     'Invitación',   'Se suman con tu código.'),
    ('plantillas', 'Plantillas',   'Tus rutinas, listas para usar.'),
    ('alumno',     'Ficha',        'Cada alumno, en secciones.'),
    ('notif',      'Mensajes',     'Le escribís directo al celular.'),
    ('bloque',     'Mesociclos',   'Bloques, fases y descargas.'),
    ('diario',     'Seguimiento',  'Cómo se sintió, día por día.'),
    ('checkin',    'Check-in',     'Su resumen de cada semana.'),
    ('historial',  'Entrenos',     'Cada serie, contra la vez pasada.'),
    ('volumen',    'Volumen',      'Series por músculo, por semana.'),
    ('peso',       'Peso',         'Su peso, semana a semana.'),
    ('rutina',     'Rutina',       'Armás y editás su rutina.'),
    ('video',      'Técnica',      'Un video en cada ejercicio.'),
    ('programada', 'Programadas',  'La próxima rutina, con fecha.'),
    ('plan',       'Nutrición',    'Su plan de comidas, completo.'),
    ('preguntas',  'Preguntas',    'Vos elegís qué le preguntás.'),
]
HOOK_N, END_N, WIPE = 84, 126, 10
PHONE_TOP, PHONE_SCALE = 500, .96

# ---------- textos ----------
def label_layer(text, size=46):
    """Rótulo en Outfit con filetes a los lados (mismo que la historia, más chico)."""
    fk = R.F_M(size); lay = Image.new('RGBA', (W, size + 30), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    tw = d.textlength(text, font=fk); cy = size * .62
    d.text(((W - tw) / 2, 2), text, font=fk, fill=TEXT)
    d.line(((W - tw) / 2 - 26 - 56, cy, (W - tw) / 2 - 26, cy), fill=BLUE + (170,), width=3)
    d.line(((W + tw) / 2 + 26, cy, (W + tw) / 2 + 26 + 56, cy), fill=BLUE + (170,), width=3)
    return lay

def headline_layer(text, maxw=960, size=68):
    d = ImageDraw.Draw(Image.new('L', (1, 1)))
    while d.textlength(text, font=R.F_H(size)) > maxw: size -= 2
    f = R.F_H(size); lay = Image.new('RGBA', (W, size + 30), (0, 0, 0, 0))
    ImageDraw.Draw(lay).text(((W - d.textlength(text, font=f)) / 2, 0), text, font=f, fill=TEXT)
    return lay

def put(c, lay, y, a, rise=18):
    if a > 0: c.alpha_composite(fade(lay, min(1, a)), (0, int(y + (1 - a) * rise)))

TEXTS = [(label_layer(f'{i + 1:02d} · {lab}'), headline_layer(head)) for i, (_, lab, head) in enumerate(FEATURES)]

# ---------- grabación ----------
def scene_len(name):
    meta = json.load(open(os.path.join(FR, name, 'times.json')))
    span = meta['end'] - meta['start']
    return int(round(np.clip(span / 1.9, 1.9, 2.5) * FPS))      # hasta ~1,9× más rápido, entre 1,9 y 2,5 s

class Clip:
    """Cuadros de una escena, re-temporizados a n cuadros (se cargan a medida)."""
    def __init__(self, name, n):
        d = os.path.join(FR, name); meta = json.load(open(os.path.join(d, 'times.json')))
        self.files = sorted(glob.glob(os.path.join(d, '*.jpg')))
        self.ts = np.array(meta['times']) - meta['start']; self.span = meta['end'] - meta['start']; self.n = n; self.cache = {}
    def __getitem__(self, k):
        t = min(k, self.n - 1) / max(self.n - 1, 1) * self.span
        i = max(0, int(np.searchsorted(self.ts, t, side='right')) - 1)
        if i not in self.cache:
            if len(self.cache) > 8: self.cache.clear()
            self.cache[i] = Image.open(self.files[i]).convert('RGB').resize((R.CW, R.CH), Image.LANCZOS)
        return self.cache[i]

LENS = [scene_len(n) for n, _, _ in FEATURES]
STARTS = np.cumsum([HOOK_N] + LENS[:-1]).tolist()
FEAT_END = HOOK_N + sum(LENS)
N = FEAT_END + END_N
_clips = {}
def clip(i):
    if i not in _clips:
        for k in list(_clips):
            if k < i - 1: del _clips[k]
        _clips[i] = Clip(FEATURES[i][0], LENS[i])
    return _clips[i]

def put_phone(c, content, a=1.0, dy=0):
    L, _, _ = R.phone_layer(content, scale=PHONE_SCALE, glow=1.0)
    x = (W - L.width) // 2; y = PHONE_TOP - int(R.PAD * PHONE_SCALE) + dy
    c.alpha_composite(fade(L, a) if a < 1 else L, (x, y))

# ---------- escenas ----------
def hook(f):
    c = HI.bg()
    HI.kicker_lines(c, 'Para coaches', 600, ease_out((f - 2) / 12))
    k = f - 8
    if k >= 0: HI.put_neon(c, 'tu panel', 960, 230, [0, .6, 0, .3, 1, .5, 1][k // 2] if k < 14 else 1.0, stroke=10)
    a = ease_out((f - 30) / 14)
    if a > 0: HI.R6.centered(c, 'Todo lo que te da GIZE.', R.F_H(66), 1090 + (1 - a) * 18, TEXT, a)
    a = ease_out((f - 40) / 14)
    if a > 0: HI.R6.centered(c, '16 herramientas en una sola app.', R.F_M(40), 1196 + (1 - a) * 14, SUB, a)
    return c

def feature(i, f):
    c = HI.bg()
    cur = clip(i)[f]
    if i == 0:                                           # el teléfono entra una sola vez
        a = ease_out(f / 14); put_phone(c, cur, a, int((1 - a) * 90))
    else:
        k = ease_io(f / 7)
        content = Image.blend(clip(i - 1)[LENS[i - 1] - 1], cur, k) if k < 1 else cur
        put_phone(c, content)
    lab, head = TEXTS[i]
    if i > 0 and f < 6:                                  # el texto anterior se va
        pl, ph = TEXTS[i - 1]; a = 1 - f / 6
        put(c, pl, 262, a, 0); put(c, ph, 338, a, 0)
    put(c, lab, 262, ease_out((f - 4) / 10)); put(c, head, 338, ease_out((f - 6) / 11))
    return c

FIRMA = R.svg('gize-firma-horizontal.svg', 330)
def end(f):
    c = HI.bg()
    HI.kicker_lines(c, '¿Sos coach?', 470, ease_out((f - 2) / 12))
    k = f - 8
    if k >= 0: HI.put_neon(c, '14', 930, 300, [0, .6, 0, .3, 1, .5, 1][k // 2] if k < 14 else 1.0, box='14')
    a = ease_out((f - 26) / 14)
    if a > 0: HI.R6.centered(c, 'días de prueba gratis', R.F_H(84), 990 + (1 - a) * 18, TEXT, a)
    a = ease_out((f - 36) / 14)
    if a > 0: HI.R6.centered(c, 'Sin tarjeta. Probá todo con tus alumnos.', R.F_M(40), 1102 + (1 - a) * 14, SUB, a)
    a = ease_out((f - 52) / 16)
    if a > 0:
        c.alpha_composite(fade(FIRMA, a), ((W - FIRMA.width) // 2, int(1250 + (1 - a) * 16)))
        HI.R6.rgb_line(c, 1250 + FIRMA.height + 34, 330, W - 330, a)
        HI.R6.centered(c, 'gize.ar', R.F_M(46), 1250 + FIRMA.height + 60 + (1 - a) * 12, TEXT, a)
    return c

def seg(g):
    if g < HOOK_N: return hook(g)
    if g < FEAT_END:
        i = int(np.searchsorted(STARTS, g, side='right')) - 1
        return feature(i, g - STARTS[i])
    return end(g - FEAT_END)

def frame(g):
    HI._G[0] = g
    img = seg(g).convert('RGB')
    if HOOK_N <= g < HOOK_N + WIPE:                      # cortinas RGB: gancho → panel y panel → cierre
        img = R.wipe(hook(HOOK_N - 1 + (g - HOOK_N)), img, ease_io((g - HOOK_N) / WIPE))
    elif FEAT_END <= g < FEAT_END + WIPE:
        last = len(FEATURES) - 1
        img = R.wipe(feature(last, LENS[last] - 1), img, ease_io((g - FEAT_END) / WIPE))
    out = 1 - ease_io((g - (N - 10)) / 10)
    a = np.asarray(img).astype(np.float32) * out + HI.GRAIN
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))

def main(out):
    ff = subprocess.Popen(['ffmpeg', '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                           '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-x264-params', 'aq-mode=3', '-pix_fmt', 'yuv420p',
                           '-profile:v', 'high', '-movflags', '+faststart', out], stdin=subprocess.PIPE)
    for g in range(N):
        ff.stdin.write(frame(g).tobytes())
    ff.stdin.close(); ff.wait()
    print('ok', round(N / FPS, 1), 's')

if __name__ == '__main__':
    if len(sys.argv) > 2 and sys.argv[1] == '--cuadros':
        for g in map(int, sys.argv[2:]): frame(g).save(os.path.join(HERE, f'cuadro-{g}.png'))
    else:
        main(sys.argv[1])
