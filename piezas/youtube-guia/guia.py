"""GIZE · guía completa para YouTube (1920×1080, 30 fps, sin audio).
Primero el plan gratuito (usuario sin coach) y después el panel del coach, función por función.
Teléfono a la derecha con la grabación a velocidad real; a la izquierda el título y la explicación,
que aparece línea por línea sincronizada con las «marcas» que dejó el grabador.
Mismo diseño que la historia y el reel: glows de la gama, tubos de neón, Outfit y palabra clave en neón.

Uso:  python3 guia.py salida.mp4                 (todo, en 4 partes en paralelo)
      python3 guia.py --video usuarios salida.mp4    (solo el plan gratuito; «coach» para solo el panel)
      python3 guia.py --cuadros 100 2000 ...     (cuadros sueltos para revisar)
      python3 guia.py --capitulos                (marcas de tiempo para la descripción de YouTube)"""
import sys, os, json, glob, subprocess
if len(sys.argv) > 2 and sys.argv[1] == '--video':
    os.environ['GUIA_VIDEO'] = sys.argv[2]; del sys.argv[1:3]
VIDEO = os.environ.get('GUIA_VIDEO', 'completa')          # completa · usuarios · coach
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'reel-atleta'))
import reel as R
from reel import FPS, TEXT, BLUE, ease_out, ease_io, fade
import importlib.util
_s = importlib.util.spec_from_file_location('historia', os.path.join(HERE, '..', 'historia-prueba', 'historia.py'))
HI = importlib.util.module_from_spec(_s); _s.loader.exec_module(HI)   # neón, insignias de las tiendas, filete RGB

W, H = 1920, 1080
GR = os.path.join(HERE, 'grabacion', 'frames')
SUB, DIM = (196, 202, 212), (150, 158, 174)
NEON3 = [(47, 160, 255), (166, 92, 255), (255, 61, 174)]
LEAD, TAIL, XF = int(0.8 * FPS), int(1.0 * FPS), 8        # antes y después de cada grabación; fundido del teléfono
SPEED = 2.0                                                 # la grabación va al doble de velocidad…
READ0, READ_LINE = 1.4, 0.45                                # …pero cada explicación queda al menos esto en pantalla (s)

SOLO = [('rutina', 'Tu rutina'), ('entrenar', 'Entrenar'), ('descanso', 'Descanso'), ('ejercicios', 'Cambiar y agregar ejercicios'),
        ('finalizar', 'Finalizar el entreno'), ('progreso', 'Progreso'), ('peso', 'Peso corporal'), ('registro', 'Registro de hoy'),
        ('checkin', 'Check-in semanal'), ('historial', 'Historial de entrenos'), ('volumen', 'Volumen semanal'),
        ('meta', 'Tu meta de calorías'), ('comida', 'Registrar comidas'), ('escaner', 'Escáner y alimentos propios'),
        ('dias', 'Otros días'), ('agua', 'Agua'), ('habitos', 'Hábitos'), ('cardio', 'Cardio'), ('racha', 'Racha'), ('ajustes', 'Ajustes')]
COACH = [('panel', 'Tu panel'), ('codigo', 'Código de invitación'), ('suscripcion', 'Tu plan'), ('plantillas', 'Plantillas de rutinas'),
         ('alumno', 'La ficha del alumno'), ('notif', 'Mensajes al celular'), ('datos', 'Datos y objetivos'), ('bloque', 'Bloque / mesociclo'),
         ('diario', 'Seguimiento diario'), ('checkin', 'Check-in semanal'), ('historial', 'Historial de entrenos'),
         ('volumen', 'Volumen semanal'), ('peso', 'Peso corporal'), ('rutina', 'Armar la rutina'), ('ejercicio', 'Series y detalles'),
         ('progresion', 'Progresión y superseries'), ('programada', 'Rutinas programadas'), ('plan-dias', 'Plan alimenticio'),
         ('plan-indicaciones', 'Hidratación e indicaciones'), ('plan-menu', 'Personalización del menú'), ('plan-cardio', 'Cardio y hábitos'),
         ('preguntas', 'Tus preguntas'), ('ajustes', 'Configuración')]

# capítulos de YouTube: cada función pertenece a un tema
CHAP = {'solo': {'rutina': 'Entrenar', 'entrenar': 'Entrenar', 'descanso': 'Entrenar', 'ejercicios': 'Entrenar', 'finalizar': 'Entrenar',
                 'progreso': 'Progreso', 'peso': 'Progreso', 'registro': 'Progreso', 'checkin': 'Progreso', 'historial': 'Progreso', 'volumen': 'Progreso',
                 'meta': 'Comida y calorías', 'comida': 'Comida y calorías', 'escaner': 'Comida y calorías', 'dias': 'Comida y calorías', 'agua': 'Comida y calorías',
                 'habitos': 'Hábitos, cardio y racha', 'cardio': 'Hábitos, cardio y racha', 'racha': 'Hábitos, cardio y racha', 'ajustes': 'Ajustes'},
        'coach': {'panel': 'Tu panel, alumnos y plantillas', 'codigo': 'Tu panel, alumnos y plantillas', 'suscripcion': 'Tu panel, alumnos y plantillas', 'plantillas': 'Tu panel, alumnos y plantillas',
                  'alumno': 'La ficha del alumno', 'notif': 'La ficha del alumno', 'datos': 'La ficha del alumno', 'bloque': 'La ficha del alumno',
                  'diario': 'Seguimiento del alumno', 'checkin': 'Seguimiento del alumno', 'historial': 'Seguimiento del alumno', 'volumen': 'Seguimiento del alumno', 'peso': 'Seguimiento del alumno',
                  'rutina': 'Armar la rutina', 'ejercicio': 'Armar la rutina', 'progresion': 'Armar la rutina', 'programada': 'Armar la rutina',
                  'plan-dias': 'Plan alimenticio', 'plan-indicaciones': 'Plan alimenticio', 'plan-menu': 'Plan alimenticio', 'plan-cardio': 'Plan alimenticio',
                  'preguntas': 'Preguntas y configuración', 'ajustes': 'Preguntas y configuración'}}

# ---------- fondo apaisado: glows de la gama, tubos de neón y fundido arriba/abajo ----------
AW, AH = W // 8, H // 8
_yy, _xx = np.mgrid[0:AH, 0:AW].astype(np.float32)
_v = np.linspace(0, 1, H, dtype=np.float32)
FADE = (.35 + .65 * np.clip(np.minimum(_v / .28, (1 - _v) / .30), 0, 1) ** 1.5)[:, None, None]
TUBES = [((-60, 250), (520, -40), NEON3[:2], 11, 0, (1, -.5), 0.0),
         ((1480, -40), (1990, 210), NEON3[1:], 9, 6, (-1, -.5), 1.3),
         ((1540, 1120), (1990, 820), NEON3[1:][::-1], 11, 0, (1, -.6), 2.1),
         ((-80, 900), (420, 1130), NEON3[:2][::-1], 20, 14, (1, .5), 3.4)]
TUBE_L = [HI.tube_layer(p0, p1, cols, wd, bf) for p0, p1, cols, wd, bf, *_ in TUBES]

def add_at(fr, lay, x, y, k):
    h, w = lay.shape[:2]; x, y = int(round(x)), int(round(y))
    ax0, ay0, ax1, ay1 = max(0, x), max(0, y), min(W, x + w), min(H, y + h)
    if ax0 < ax1 and ay0 < ay1 and k > 0: fr[ay0:ay1, ax0:ax1] += lay[ay0 - y:ay1 - y, ax0 - x:ax1 - x] * k

def fondo(g):
    t = g / FPS; acc = np.zeros((AH, AW, 3), np.float32)
    for i, (bx, by, ci) in enumerate([(.12, .25, 0), (.55, .15, 1), (.85, .75, 2), (.30, .80, 1)]):
        ph = t / 11 * 2 * np.pi + i * 1.9
        x, y = (bx + .06 * np.sin(ph)) * AW, (by + .07 * np.cos(ph * .8)) * AH
        sg = (.20 + .02 * np.sin(ph * 1.3)) * AW
        gk = np.exp(-(((_xx - x) ** 2 + (_yy - y) ** 2) / (2 * sg * sg)))
        acc = 1 - (1 - acc) * (1 - gk[..., None] * np.array(NEON3[ci], np.float32) / 255 * .40)
    fr = np.asarray(Image.fromarray((acc * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC), np.float32).copy()
    fr += np.array([4, 5, 9], np.float32)
    for (lay, x0, y0), (*_, (dx, dy), ph) in zip(TUBE_L, TUBES):
        on = HI.TUBE_ON[g // 2] if g // 2 < len(HI.TUBE_ON) else 1.0
        drift = np.sin(t * .3 + ph) * 30
        add_at(fr, lay, x0 + dx * drift, y0 + dy * drift, on * (.82 + .18 * np.sin(t * 1.6 + ph)) * 1.25)
    return fr * FADE

GRAIN = np.random.default_rng(7).uniform(-1, 1, (H, W, 1)).astype(np.float32)

# ---------- teléfono (cromo escalado una sola vez) ----------
PH_H = 930                                   # alto total del teléfono en pantalla
PS = PH_H / R.PH
CW2, CH2 = round(R.CW * PS), round(R.CH * PS)
def _sc(im): return im.resize((round(im.width * PS), round(im.height * PS)), Image.LANCZOS)
P_GLOW, P_BODY, P_RING = _sc(R.GLOW), _sc(R.BODY), _sc(R.RING)
P_MASK = R.rounded_mask(CW2, CH2, round(42 * PS))
P_OFF = round((R.PAD + R.BZ) * PS)
PHONE_CX, PHONE_TOP = 1390, (H - PH_H) // 2 - 6

def put_phone(c, content, a=1.0, dy=0):
    L = P_GLOW.copy(); L.alpha_composite(P_BODY)
    s = content.resize((CW2, CH2), Image.LANCZOS).convert('RGBA'); s.putalpha(P_MASK)
    L.alpha_composite(s, (P_OFF, P_OFF)); L.alpha_composite(P_RING)
    c.alpha_composite(fade(L, a) if a < 1 else L, (PHONE_CX - L.width // 2, PHONE_TOP - round(R.PAD * PS) + dy))

# ---------- textos ----------
X0, COLW = 150, 800
def wrap(text, font, maxw):
    d = ImageDraw.Draw(Image.new('L', (1, 1))); out, cur = [], ''
    for w in text.split():
        t = (cur + ' ' + w).strip()
        if d.textlength(t, font=font) <= maxw: cur = t
        else: out.append(cur); cur = w
    return out + [cur]

def kicker_layer(text):
    f = R.F_M(30); lay = Image.new('RGBA', (COLW + 100, 50), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    d.line((0, 22, 46, 22), fill=BLUE + (200,), width=3); d.text((64, 2), text, font=f, fill=BLUE)
    return lay

def title_layer(text):
    size = 78; d = ImageDraw.Draw(Image.new('L', (1, 1)))
    while d.textlength(text, font=R.F_H(size)) > COLW and size > 50: size -= 2
    lay = Image.new('RGBA', (COLW + 100, size + 34), (0, 0, 0, 0)); ImageDraw.Draw(lay).text((0, 0), text, font=R.F_H(size), fill=TEXT)
    return lay

CAP_F = R.F_M(38)
CAP_PAD = 32                                   # margen para el brillo del punto
def caption_layers(text):
    """Dos versiones de la explicación: actual (blanca, con punto de neón) y pasada (atenuada)."""
    lines = wrap(text, CAP_F, COLW - 60); h = 52 * len(lines) + 10
    out = []
    for col, dot in ((TEXT, True), (DIM, False)):
        lay = Image.new('RGBA', (COLW + 60 + CAP_PAD, h + 20 + CAP_PAD), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
        c = NEON3[0] if dot else (90, 98, 114)
        o = CAP_PAD
        if dot:
            g = Image.new('L', lay.size, 0); ImageDraw.Draw(g).ellipse((o + 4, o // 2 + 12, o + 24, o // 2 + 32), fill=255)
            gl = Image.new('RGBA', lay.size, c + (0,)); gl.putalpha(g.filter(ImageFilter.GaussianBlur(7))); lay.alpha_composite(gl)
        d.ellipse((o + 8, o // 2 + 16, o + 20, o // 2 + 28), fill=c + (255,))
        for i, ln in enumerate(lines): d.text((o + 44, o // 2 + i * 52), ln, font=CAP_F, fill=col)
        out.append(lay)
    return out, h

# ---------- grabaciones ----------
class Clip:
    """tmap: para cada cuadro de salida, el segundo de la grabación que se muestra."""
    def __init__(self, d, tmap):
        m = json.load(open(os.path.join(d, 'times.json')))
        self.files = sorted(glob.glob(os.path.join(d, '*.jpg')))
        self.ts = np.array(m['times']) - m['start']; self.tmap = tmap; self.cache = {}
        self.n = len(tmap)
    def __getitem__(self, k):
        t = self.tmap[int(np.clip(k, 0, self.n - 1))]
        i = max(0, int(np.searchsorted(self.ts, t, side='right')) - 1)
        if i not in self.cache:
            if len(self.cache) > 6: self.cache.clear()
            self.cache[i] = Image.open(self.files[i]).convert('RGB')
        return self.cache[i]

SEGS = []
def add_card(fn, n, title): SEGS.append({'kind': 'card', 'fn': fn, 'n': n, 'title': title})
def add_part(sub, items, label):
    for i, (name, title) in enumerate(items):
        d = os.path.join(GR, sub, name); m = json.load(open(os.path.join(d, 'times.json')))
        span = m['end'] - m['start']
        # la grabación avanza a SPEED×; si la próxima marca llega antes de que se pueda leer la actual, se congela
        pts = [0.0] + [min(mk['t'], span) for mk in m['marks']] + [span]
        tmap, caps = [], []
        for j in range(len(pts) - 1):
            a, b = pts[j], pts[j + 1]
            dur = (b - a) / SPEED
            if j >= 1:
                (cur, old), h = caption_layers(m['marks'][j - 1]['text'])
                caps.append((LEAD + len(tmap) + 4, cur, old, h))
                dur = max(dur, READ0 + READ_LINE * ((h - 10) // 52))
            for k in range(int(round(dur * FPS))): tmap.append(min(b, a + k / FPS * SPEED))
        n = LEAD + len(tmap) + TAIL
        SEGS.append({'kind': 'feat', 'dir': d, 'tmap': tmap, 'n': n, 'title': title, 'part': label, 'chap': CHAP[sub][name],
                     'kick': kicker_layer(f'{label} · {i + 1:02d} / {len(items):02d}'), 'tl': title_layer(title), 'caps': caps})

_clips = {}
def clip(k):
    if k not in _clips:
        for j in list(_clips):
            if j < k - 1: del _clips[j]
        _clips[k] = Clip(SEGS[k]['dir'], SEGS[k]['tmap'])
    return _clips[k]

def put(c, lay, x, y, a, rise=16):
    if a > 0: c.alpha_composite(fade(lay, min(1, a)), (int(x), int(y + (1 - min(1, a)) * rise)))

def draw_text(c, seg, f, a_all=1.0):
    put(c, seg['kick'], X0, 250, ease_out(f / 12) * a_all)
    put(c, seg['tl'], X0, 300, ease_out((f - 3) / 14) * a_all, 22)
    y = 420
    shown = [cp for cp in seg['caps'] if f >= cp[0]]
    for i, (t0, cur, old, h) in enumerate(shown):
        a = ease_out((f - t0) / 12) * a_all
        latest = i == len(shown) - 1
        x, yy = X0 - CAP_PAD, y - CAP_PAD // 2
        if latest: put(c, cur, x, yy, a, 14)
        else:
            k = ease_io((f - shown[i + 1][0]) / 10)                # la anterior se atenúa
            if k < 1: put(c, cur, x, yy, (1 - k) * a_all, 0)
            put(c, old, x, yy, k * a_all, 0)
        y += h + 16

def make_panel():
    x0, y0, x1, y1 = 96, 200, 1010, H - 104
    SS = 2; m = Image.new('L', (W * SS, H * SS), 0)
    ImageDraw.Draw(m).rounded_rectangle((x0 * SS, y0 * SS, x1 * SS, y1 * SS), 40 * SS, fill=255)
    m = m.resize((W, H), Image.LANCZOS)
    p = Image.new('RGBA', (W, H), (6, 8, 14, 0)); p.putalpha(m.point(lambda v: int(v * .62)))
    b = Image.new('L', (W * SS, H * SS), 0)
    ImageDraw.Draw(b).rounded_rectangle((x0 * SS, y0 * SS, x1 * SS, y1 * SS), 40 * SS, outline=255, width=2 * SS)
    br = Image.new('RGBA', (W, H), (255, 255, 255, 0)); br.putalpha(b.resize((W, H), Image.LANCZOS).point(lambda v: int(v * .10)))
    p.alpha_composite(br)
    return p.crop((x0 - 4, y0 - 4, x1 + 4, y1 + 4)), (x0 - 4, y0 - 4)
PANEL, PANEL_XY = make_panel()

def feature(k, f):
    c = Image.fromarray(np.clip(fondo(_G[0]), 0, 255).astype(np.uint8)).convert('RGBA')
    seg, prev = SEGS[k], SEGS[k - 1]; cl = clip(k)
    cur = cl[f - LEAD]
    pa = ease_out(f / 16) if prev['kind'] != 'feat' else 1.0
    c.alpha_composite(fade(PANEL, pa) if pa < 1 else PANEL, PANEL_XY)
    if prev['kind'] != 'feat':
        a = ease_out(f / 16); put_phone(c, cur, a, int((1 - a) * 80))
    else:
        t = ease_io(f / XF)
        put_phone(c, Image.blend(clip(k - 1)[clip(k - 1).n - 1], cur, t) if t < 1 else cur)
    if prev['kind'] == 'feat' and f < 8: draw_text(c, prev, prev['n'] - 1, 1 - f / 8)
    if f >= 6: draw_text(c, seg, f - 6)
    return c

# ---------- tarjetas ----------
FIRMA_L = R.svg('gize-firma-horizontal.svg', 520)
FIRMA_S = R.svg('gize-firma-horizontal.svg', 340)
def centered(c, text, font, y, fill, a):
    if a <= 0: return
    d = ImageDraw.Draw(c); w = d.textlength(text, font=font)
    lay = Image.new('RGBA', (W, font.size + 40), (0, 0, 0, 0)); ImageDraw.Draw(lay).text(((W - w) / 2, 0), text, font=font, fill=fill)
    c.alpha_composite(fade(lay, min(1, a)), (0, int(y + (1 - min(1, a)) * 16)))

def neon_c(c, word, base_y, size, a):
    if a <= 0: return
    im, P = HI.neon(word, size, None, 10)
    c.alpha_composite(fade(im, a), ((W - im.width) // 2, base_y - (im.height - P)))

def flick(k): return [0, .6, 0, .3, 1, .5, 1][k // 2] if 0 <= k < 14 else (1.0 if k >= 14 else 0)

def bg_card(): return Image.fromarray(np.clip(fondo(_G[0]), 0, 255).astype(np.uint8)).convert('RGBA')

def make_intro(head, sub):
    def fn(f):
        c = bg_card(); a = ease_out(f / 20)
        c.alpha_composite(fade(FIRMA_L, a), ((W - FIRMA_L.width) // 2, int(300 + (1 - a) * 20)))
        a = ease_out((f - 16) / 16)
        if a > 0: HI.R6.rgb_line(c, 300 + FIRMA_L.height + 50, 700, W - 700, a)
        centered(c, head, R.F_H(60), 300 + FIRMA_L.height + 90, TEXT, ease_out((f - 26) / 16))
        centered(c, sub, R.F_M(36), 300 + FIRMA_L.height + 180, SUB, ease_out((f - 38) / 16))
        return c
    return fn

def part_card(kick, word, head, sub):
    def fn(f):
        c = bg_card()
        kl = kicker_layer(kick); put(c, kl, (W - kl.width) // 2 + 60, 300, ease_out((f - 2) / 12))
        neon_c(c, word, 610, 250, flick(f - 10))
        centered(c, head, R.F_H(58), 690, TEXT, ease_out((f - 34) / 16))
        centered(c, sub, R.F_M(36), 780, SUB, ease_out((f - 46) / 16))
        return c
    return fn

def badges(c, f, y, delay):
    for i, b in enumerate(HI.BADGES):
        a = ease_out((f - delay - i * 6) / 12)
        if a > 0: c.alpha_composite(fade(b, a), ([W // 2 - b.width - 16, W // 2 + 16][i], int(y + (1 - a) * 24)))

def outro_completa(f):
    c = bg_card(); a = ease_out(f / 16)
    c.alpha_composite(fade(FIRMA_S, a), ((W - FIRMA_S.width) // 2, int(170 + (1 - a) * 16)))
    centered(c, 'Gratis en iPhone y Android.', R.F_H(62), 330, TEXT, ease_out((f - 12) / 14))
    badges(c, f, 440, 22)
    a = ease_out((f - 44) / 14)
    if a > 0: HI.R6.rgb_line(c, 670, 640, W - 640, a)
    centered(c, '¿Sos coach? Probá el panel 14 días gratis, sin tarjeta.', R.F_H(48), 710, TEXT, ease_out((f - 50) / 14))
    centered(c, 'Después elegís el plan según cuántos alumnos tengas.', R.F_M(34), 790, SUB, ease_out((f - 58) / 14))
    centered(c, 'gize.ar', R.F_M(54), 880, BLUE, ease_out((f - 70) / 14))
    return c

def outro_usuarios(f):
    c = bg_card(); a = ease_out(f / 16)
    c.alpha_composite(fade(FIRMA_S, a), ((W - FIRMA_S.width) // 2, int(170 + (1 - a) * 16)))
    centered(c, 'Gratis en iPhone y Android.', R.F_H(62), 330, TEXT, ease_out((f - 12) / 14))
    badges(c, f, 440, 22)
    a = ease_out((f - 44) / 14)
    if a > 0: HI.R6.rgb_line(c, 670, 640, W - 640, a)
    centered(c, '¿Entrenás con un coach? Pedile su código y vinculate.', R.F_H(48), 710, TEXT, ease_out((f - 50) / 14))
    centered(c, 'Así ve tus entrenos y te arma la rutina desde su panel.', R.F_M(34), 790, SUB, ease_out((f - 58) / 14))
    centered(c, 'gize.ar', R.F_M(54), 880, BLUE, ease_out((f - 70) / 14))
    return c

def outro_coach(f):
    c = bg_card(); a = ease_out(f / 16)
    c.alpha_composite(fade(FIRMA_S, a), ((W - FIRMA_S.width) // 2, int(170 + (1 - a) * 16)))
    centered(c, 'Probá el panel 14 días gratis, sin tarjeta.', R.F_H(58), 320, TEXT, ease_out((f - 12) / 14))
    centered(c, 'Después elegís el plan según cuántos alumnos tengas.', R.F_M(36), 410, SUB, ease_out((f - 20) / 14))
    a = ease_out((f - 32) / 14)
    if a > 0: HI.R6.rgb_line(c, 510, 640, W - 640, a)
    centered(c, 'Tus alumnos usan la app gratis, en iPhone y Android.', R.F_H(44), 550, TEXT, ease_out((f - 38) / 14))
    badges(c, f, 640, 46)
    centered(c, 'gize.ar', R.F_M(54), 880, BLUE, ease_out((f - 70) / 14))
    return c

PART1 = part_card('Parte 1', 'gratis', 'El plan gratuito: para entrenar por tu cuenta.', 'Sin coach y sin pagar nada. En iPhone y en Android.')
PART2 = part_card('Parte 2', 'tu panel', 'El panel del coach: para guiar a tus alumnos.', 'Probalo 14 días gratis, sin tarjeta.')
if VIDEO == 'usuarios':
    add_card(make_intro('Guía del plan gratuito.', 'Todo lo que podés hacer en GIZE sin coach y sin pagar nada.'), 6 * FPS, 'Introducción')
    add_card(part_card('Plan gratuito', 'gratis', 'Para entrenar por tu cuenta.', 'Sin coach y sin pagar nada. En iPhone y en Android.'), 6 * FPS, 'Plan gratuito')
    add_part('solo', SOLO, 'Plan gratuito')
    add_card(outro_usuarios, 9 * FPS, 'Cierre')
elif VIDEO == 'coach':
    add_card(make_intro('Guía del panel del coach.', 'Todo lo que tenés para guiar a tus alumnos, función por función.'), 6 * FPS, 'Introducción')
    add_card(part_card('Panel del coach', 'tu panel', 'Para guiar a tus alumnos.', 'Probalo 14 días gratis, sin tarjeta.'), 6 * FPS, 'Panel del coach')
    add_part('coach', COACH, 'Panel del coach')
    add_card(outro_coach, 9 * FPS, 'Cierre')
else:
    add_card(make_intro('Todo lo que hace la app, función por función.', 'Primero el plan gratuito. Después, el panel del coach.'), 6 * FPS, 'Introducción')
    add_card(PART1, 6 * FPS, 'Parte 1 · Plan gratuito')
    add_part('solo', SOLO, 'Plan gratuito')
    add_card(PART2, 6 * FPS, 'Parte 2 · Panel del coach')
    add_part('coach', COACH, 'Panel del coach')
    add_card(outro_completa, 9 * FPS, 'Cierre')
STARTS = np.cumsum([0] + [sg['n'] for sg in SEGS[:-1]]).tolist()
N = STARTS[-1] + SEGS[-1]['n']
_G = [0]
WIPE = 12

def seg_frame(k, f):
    return SEGS[k]['fn'](f) if SEGS[k]['kind'] == 'card' else feature(k, f)

def progress(c, g):
    """Filete RGB fino abajo: cuánto va del video."""
    x0, x1, y = 150, W - 150, H - 58; p = g / (N - 1)
    d = ImageDraw.Draw(c); d.line((x0, y, x1, y), fill=(255, 255, 255, 28), width=2)
    w = int((x1 - x0) * p)
    if w > 2:
        bar = Image.fromarray(HI.R6.gama_h(w, 2, NEON3).astype(np.uint8)).convert('RGBA'); c.alpha_composite(bar, (x0, y - 1))

def frame(g):
    _G[0] = g
    k = int(np.searchsorted(STARTS, g, side='right')) - 1; f = g - STARTS[k]
    c = seg_frame(k, f)
    if SEGS[k]['kind'] == 'feat': progress(c, g)
    img = c.convert('RGB')
    if k > 0 and SEGS[k]['kind'] != SEGS[k - 1]['kind'] and f < WIPE:
        img = R.wipe(seg_frame(k - 1, SEGS[k - 1]['n'] - 1).convert('RGB').resize((1080, 1920)), img.resize((1080, 1920)), ease_io(f / WIPE)).resize((W, H))
    out = min(1, ease_io(g / 12)) * (1 - ease_io((g - (N - 14)) / 14))
    a = np.asarray(img).astype(np.float32) * out + GRAIN
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))

def encode(path, a, b):
    ff = subprocess.Popen(['ffmpeg', '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                           '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-x264-params', 'aq-mode=3', '-pix_fmt', 'yuv420p',
                           '-profile:v', 'high', '-g', str(FPS * 2), '-movflags', '+faststart', path], stdin=subprocess.PIPE)
    for g in range(a, b): ff.stdin.write(frame(g).tobytes())
    ff.stdin.close(); ff.wait()

def ts(sec): return f'{int(sec // 60)}:{int(sec % 60):02d}'
def capitulos():
    """Capítulos para la descripción de YouTube, agrupados por tema. Empiezan en 0:00 y cada uno dura
    10 s o más (si alguno queda corto se suma al anterior)."""
    ch = []
    for k, (sg, st) in enumerate(zip(SEGS, STARTS)):
        if sg['kind'] == 'card':
            if k == 0: ch.append([0, 'Introducción'])
            continue
        name = sg['chap']
        if VIDEO == 'completa': name = ('Coach · ' if sg['part'] == 'Panel del coach' else 'Gratis · ') + name
        if not ch or ch[-1][1] != name: ch.append([st, name])
    ends = [c[0] for c in ch[1:]] + [N]
    out = []
    for (st, t), en in zip(ch, ends):
        if out and (en - st) < 10 * FPS: out[-1][1] += ' · ' + t
        else: out.append([st, t])
    return '\n'.join(f'{ts(st / FPS)} {t}' for st, t in out)

if __name__ == '__main__':
    if sys.argv[1] == '--cuadros':
        for g in map(int, sys.argv[2:]): frame(g).save(os.path.join(HERE, f'cuadro-{g}.png'))
    elif sys.argv[1] == '--capitulos':
        print(capitulos()); print('total', ts(N / FPS), N)
    elif sys.argv[1] == '--parte':                           # --parte i n salida
        i, n, out = int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
        cut = [round(N * j / n) for j in range(n + 1)]; encode(out, cut[i], cut[i + 1])
    else:
        out = sys.argv[1]; n = 4; tmp = [out + f'.p{i}.mp4' for i in range(n)]
        procs = [subprocess.Popen([sys.executable, __file__, '--parte', str(i), str(n), tmp[i]]) for i in range(n)]
        for p in procs: p.wait()
        lst = out + '.txt'; open(lst, 'w').write(''.join(f"file '{os.path.abspath(t)}'\n" for t in tmp))
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', '-movflags', '+faststart', out], check=True)
        for t in tmp + [lst]: os.remove(t)
        print('ok', ts(N / FPS))
