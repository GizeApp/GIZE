"""GIZE · reel de todo lo que ofrece la app, con el mismo diseño que la historia de la prueba gratis:
fondo con glows de la gama y tubos de neón, rótulos en Outfit con filetes, cifras y palabra clave en neón.
Primero lo que tiene gratis quien entrena sin coach (8 funciones) y después el panel del coach (16).
El teléfono queda fijo y adentro cambia la pantalla. 1080×1920, 30 fps, sin audio.
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

GR = os.path.join(HERE, 'grabacion')
SUB = (196, 202, 212)
SOLO = [       # app sin coach: (escena grabada, rótulo, titular)
    ('entreno',    'Entreno',      'Anotás cada serie, sin papel.'),
    ('descanso',   'Descanso',     'El descanso, cronometrado.'),
    ('progreso',   'Progreso',     'Cada ejercicio, con su progreso.'),
    ('meta',       'Calorías',     'Tu meta, calculada para vos.'),
    ('comida',     'Comida',       'Buscás lo que comés y se suma.'),
    ('habitos',    'Hábitos',      'Tu checklist de cada día.'),
    ('cardio',     'Cardio',       'Cronómetro y temporizador.'),
    ('racha',      'Racha',        'Y tu racha, día a día.'),
]
COACH = [      # panel del coach
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
CARD_N, END_N, WIPE = 84, 150, 10
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


# ---------- grabación ----------
def scene_len(d):
    meta = json.load(open(os.path.join(d, 'times.json')))
    span = meta['end'] - meta['start']
    return int(round(np.clip(span / 1.9, 1.9, 2.6) * FPS))      # acelerado hasta ~3,9×, entre 1,9 y 2,6 s

class Clip:
    """Cuadros de una escena, re-temporizados a n cuadros (se cargan a medida)."""
    def __init__(self, d, n):
        meta = json.load(open(os.path.join(d, 'times.json')))
        self.files = sorted(glob.glob(os.path.join(d, '*.jpg')))
        self.ts = np.array(meta['times']) - meta['start']; self.span = meta['end'] - meta['start']; self.n = n; self.cache = {}
    def __getitem__(self, k):
        t = min(k, self.n - 1) / max(self.n - 1, 1) * self.span
        i = max(0, int(np.searchsorted(self.ts, t, side='right')) - 1)
        if i not in self.cache:
            if len(self.cache) > 8: self.cache.clear()
            self.cache[i] = Image.open(self.files[i]).convert('RGB').resize((R.CW, R.CH), Image.LANCZOS)
        return self.cache[i]

# línea de tiempo: tarjetas (gancho, entrada al panel, cierre) y funciones con el teléfono
SEGS = []
def add_card(fn, n): SEGS.append({'kind': 'card', 'fn': fn, 'n': n})
def add_feats(sub, items):
    for i, (name, lab, head) in enumerate(items):
        d = os.path.join(GR, sub, name)
        SEGS.append({'kind': 'feat', 'dir': d, 'n': scene_len(d), 'text': (label_layer(f'{i + 1:02d} · {lab}'), headline_layer(head))})

_clips = {}
def clip(k):
    if k not in _clips:
        for j in list(_clips):
            if j < k - 1: del _clips[j]
        _clips[k] = Clip(SEGS[k]['dir'], SEGS[k]['n'])
    return _clips[k]

def put_phone(c, content, a=1.0, dy=0):
    L, _, _ = R.phone_layer(content, scale=PHONE_SCALE, glow=1.0)
    x = (W - L.width) // 2; y = PHONE_TOP - int(R.PAD * PHONE_SCALE) + dy
    c.alpha_composite(fade(L, a) if a < 1 else L, (x, y))

# ---------- escenas ----------
def flick(k): return [0, .6, 0, .3, 1, .5, 1][k // 2] if k < 14 else 1.0

def card(kick, word, head, sub, word_size=230):
    def fn(f):
        c = HI.bg()
        HI.kicker_lines(c, kick, 600, ease_out((f - 2) / 12))
        if f >= 8: HI.put_neon(c, word, 960, word_size, flick(f - 8), stroke=10)
        a = ease_out((f - 30) / 14)
        if a > 0: HI.R6.centered(c, head, R.F_H(62), 1090 + (1 - a) * 18, TEXT, a)
        a = ease_out((f - 40) / 14)
        if a > 0: HI.R6.centered(c, sub, R.F_M(40), 1192 + (1 - a) * 14, SUB, a)
        return c
    return fn

def feature(k, f):
    c = HI.bg(); seg = SEGS[k]; prev = SEGS[k - 1]
    cur = clip(k)[f]
    if prev['kind'] != 'feat':                           # primera de su parte: el teléfono entra
        a = ease_out(f / 14); put_phone(c, cur, a, int((1 - a) * 90))
    else:
        t = ease_io(f / 7)
        put_phone(c, Image.blend(clip(k - 1)[prev['n'] - 1], cur, t) if t < 1 else cur)
    lab, head = seg['text']
    if prev['kind'] == 'feat' and f < 6:                 # el texto anterior se va
        pl, ph = prev['text']; a = 1 - f / 6
        put(c, pl, 262, a, 0); put(c, ph, 338, a, 0)
    put(c, lab, 262, ease_out((f - 4) / 10)); put(c, head, 338, ease_out((f - 6) / 11))
    return c

FIRMA = R.svg('gize-firma-horizontal.svg', 330)
def end(f):
    c = HI.bg()
    a = ease_out(f / 16)
    c.alpha_composite(fade(FIRMA, a), ((W - FIRMA.width) // 2, int(560 + (1 - a) * 16)))
    a = ease_out((f - 10) / 14)
    if a > 0: HI.R6.centered(c, 'Gratis en iPhone y Android.', R.F_H(62), 760 + (1 - a) * 18, TEXT, a)
    for i, b in enumerate(HI.BADGES):
        a = ease_out((f - 20 - i * 6) / 12)
        if a > 0: c.alpha_composite(fade(b, a), ([W // 2 - b.width - 14, W // 2 + 14][i], int(880 + (1 - a) * 24)))
    a = ease_out((f - 40) / 14)
    if a > 0:
        HI.R6.rgb_line(c, 1120, 300, W - 300, a)
        HI.R6.centered(c, '¿Sos coach? 14 días de prueba gratis.', R.F_H(50), 1160 + (1 - a) * 14, TEXT, a)
        HI.R6.centered(c, 'Sin tarjeta.', R.F_M(40), 1240 + (1 - a) * 14, SUB, a)
    a = ease_out((f - 56) / 14)
    if a > 0: HI.R6.centered(c, 'gize.ar', R.F_M(50), 1340 + (1 - a) * 12, BLUE, a)
    return c

add_card(card('Para todos', 'gratis', 'Entrená por tu cuenta, sin coach.', 'En iPhone y en Android.', 250), CARD_N)
add_feats('frames_solo', SOLO)
add_card(card('¿Sos coach?', 'tu panel', 'Todo para guiar a tus alumnos.', '16 herramientas en una sola app.'), CARD_N)
add_feats('frames', COACH)
add_card(end, END_N)
STARTS = np.cumsum([0] + [sg['n'] for sg in SEGS[:-1]]).tolist()
N = STARTS[-1] + SEGS[-1]['n']

def seg_frame(k, f):
    return SEGS[k]['fn'](f) if SEGS[k]['kind'] == 'card' else feature(k, f)

def frame(g):
    HI._G[0] = g
    k = int(np.searchsorted(STARTS, g, side='right')) - 1; f = g - STARTS[k]
    img = seg_frame(k, f).convert('RGB')
    if k > 0 and SEGS[k]['kind'] != SEGS[k - 1]['kind'] and f < WIPE:   # cortina RGB al cambiar de tarjeta a teléfono
        img = R.wipe(seg_frame(k - 1, SEGS[k - 1]['n'] - 1), img, ease_io(f / WIPE))
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
