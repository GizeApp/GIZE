"""Soundtrack for the reel: synthesized from scratch, every hit sample-locked
to the visual timeline in reel.html (120 BPM, 1 beat = 0.5 s).

    python3 audio.py  ->  soundtrack.wav (48 kHz, stereo, 15.0 s)
"""
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve
from scipy.io import wavfile

SR = 48000
TR = 7.75  # route -> particles hand-off (same constant as reel.html)
N = int(SR * 15.0)
rng = np.random.default_rng(3)

BUS = {k: np.zeros((2, N)) for k in ("drums", "music", "fx", "rev", "dly")}


# ---------------------------------------------------------------- helpers
def tt(d):
    return np.arange(int(d * SR)) / SR


def noise(d):
    return rng.standard_normal(int(d * SR))


def filt(x, kind, f, order=2):
    return sosfilt(butter(order, f, kind, fs=SR, output="sos"), x)


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def sweep(f0, f1, d, curve="exp"):
    t = tt(d)
    f = f0 * (f1 / f0) ** (t / d) if curve == "exp" else f0 + (f1 - f0) * t / d
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def svf(x, fc, q=0.8, mode="bp"):
    """Zavalishin TPT state-variable filter with per-sample cutoff."""
    fc = np.broadcast_to(np.asarray(fc, float), x.shape)
    g = np.tan(np.pi * np.clip(fc, 20, SR * 0.45) / SR)
    k = 1 / q
    out = np.empty_like(x)
    ic1 = ic2 = 0.0
    for i in range(len(x)):
        gi = g[i]
        a1 = 1 / (1 + gi * (gi + k))
        a2 = gi * a1
        a3 = gi * a2
        v3 = x[i] - ic2
        v1 = a1 * ic1 + a2 * v3
        v2 = ic2 + a2 * ic1 + a3 * v3
        ic1 = 2 * v1 - ic1
        ic2 = 2 * v2 - ic2
        out[i] = v1 if mode == "bp" else v2 if mode == "lp" else x[i] - k * v1 - v2
    return out


def add(sig, t0, gain=1.0, pan=0.0, bus="fx", rev=0.0, dly=0.0):
    sig = np.asarray(sig, float) * gain
    i = int(round(t0 * SR))
    if i < 0:
        sig, i = sig[-i:], 0
    n = min(len(sig), N - i)
    if n <= 0:
        return
    sig = sig[:n]
    p = np.broadcast_to(np.asarray(pan, float), (len(sig),)) if np.ndim(pan) else pan
    gl = np.cos((np.asarray(p) + 1) * np.pi / 4) * np.sqrt(2)
    gr = np.sin((np.asarray(p) + 1) * np.pi / 4) * np.sqrt(2)
    st = np.vstack([sig * gl, sig * gr])
    BUS[bus][:, i:i + n] += st
    if rev:
        BUS["rev"][:, i:i + n] += st * rev
    if dly:
        BUS["dly"][:, i:i + n] += st * dly


def mix(*xs):
    """Sum signals of different lengths (zero-padded)."""
    out = np.zeros(max(len(x) for x in xs))
    for x in xs:
        out[:len(x)] += x
    return out


def env_ar(d, a=0.005, r=0.05):
    t = tt(d)
    e = np.minimum(1, t / max(a, 1e-4))
    return e * np.clip((d - t) / r, 0, 1)


# ---------------------------------------------------------------- instruments
def kick(d=0.5, f0=170, f1=45, drive=2.2, decay=6.5):
    t = tt(d)
    f = f1 + (f0 - f1) * np.exp(-t * 32)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * decay)
    c = filt(noise(0.006), "hp", 2500) * np.linspace(1, 0, int(0.006 * SR)) * 0.5
    s[:len(c)] += c
    return np.tanh(s * drive) / np.tanh(drive)


def clap(d=0.3):
    t = tt(d)
    e = sum((t >= o) * np.exp(-np.maximum(t - o, 0) * 170) for o in (0, 0.01, 0.021))
    e = e + (t >= 0.028) * np.exp(-np.maximum(t - 0.028, 0) * 20) * 0.7
    return filt(noise(d) * e, "bandpass", [900, 4200]) * 1.3


def hat(d=0.06, rate=70):
    return filt(noise(d), "hp", 7500, 4) * np.exp(-tt(d) * rate)


def pluck(f, d=0.4, bright=1.0, nh=16, det=1.004):
    t = tt(d)
    s = np.zeros_like(t)
    for h in range(1, nh + 1):
        if f * h > 15000:
            break
        dec = np.exp(-t * (5 + h * 2.6 / bright))
        s += (1 / h) * (np.sin(2 * np.pi * f * h * t + h) + 0.7 * np.sin(2 * np.pi * f * det * h * t)) * dec
    return s * (1 - np.exp(-t * 900)) * 0.35 * env_ar(d, 0.001, 0.03)


def bassnote(f, d):
    t = tt(d)
    s = np.sin(2 * np.pi * f * t) * 0.9
    for h in range(2, 10):
        s += (0.55 / h) * np.sin(2 * np.pi * f * h * t) * np.exp(-t * h * 4.5)
    return np.tanh(1.6 * s) * env_ar(d, 0.004, 0.03)


def padnote(f, d, a=0.3, r=0.5):
    t = tt(d)
    s = np.zeros_like(t)
    for cents in (-8, 0, 7):
        ff = f * 2 ** (cents / 1200)
        for h in range(1, 9):
            if ff * h > 9000:
                break
            s += (1 / h ** 1.35) * np.sin(2 * np.pi * ff * h * t + rng.uniform(0, 6.28))
    e = np.minimum(1, t / a) * np.clip((d - t) / r, 0, 1)
    return s * e * 0.18


def bell(f, d=2.0):
    t = tt(d)
    s = sum(a * np.sin(2 * np.pi * f * m * t) * np.exp(-t * dc)
            for m, a, dc in ((1, 1, 2.2), (2.76, 0.5, 4), (5.4, 0.3, 7), (8.93, 0.15, 11)))
    return s * (1 - np.exp(-t * 2000)) * 0.4


def crash(d=2.2, rate=2.0):
    t = tt(d)
    s = filt(noise(d), "hp", 4000) * np.exp(-t * rate)
    for f in rng.uniform(3000, 9000, 8):
        s += 0.08 * np.sin(2 * np.pi * f * t) * np.exp(-t * rate * 1.3)
    return s * 0.5


def boom(d=1.6, f0=75, f1=30):
    t = tt(d)
    return sweep(f0, f1, d) * np.exp(-t * 2.6) * (1 - np.exp(-t * 400))


def whoosh(d, f0, f1, q=1.2, shape="swell"):
    t = tt(d)
    fc = f0 * (f1 / f0) ** (t / d)
    s = svf(noise(d), fc, q, "bp")
    e = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 1.5 if shape == "swell" else (t / d) ** 2.5
    return s * e * 0.8


def blip(f0, f1, d=0.08, rate=40):
    t = tt(d)
    return sweep(f0, f1, d) * np.exp(-t * rate) * (1 - np.exp(-t * 3000))


def click(f=2600, d=0.012):
    t = tt(d)
    s = np.sin(2 * np.pi * f * t) * np.exp(-t * 500)
    s[:int(0.002 * SR)] += filt(noise(0.002), "hp", 3000) * 0.6
    return s


def ball_impacts(y_rest, y0, t_drop, t_imp, e):
    T = t_imp - t_drop
    g = 2 * (y_rest - y0) / T ** 2
    imp, vim, v, t = [t_imp], [g * T], g * T, t_imp
    while True:
        v *= e
        Tb = 2 * v / g
        if Tb < 0.016:
            break
        t += Tb
        imp.append(t)
        vim.append(v)
    return list(zip(imp, [x / vim[0] for x in vim]))


# ---------------------------------------------------------------- score
CHORDS = [(0, 2, "Am"), (2, 4, "Am"), (4, 6, "F"), (6, 8, "C"), (8, 10, "G"),
          (10, 11.5, "Am"), (11.5, 12.25, "F"), (12.25, 13.0, "G")]
BASS = {"Am": 33, "F": 29, "C": 36, "G": 31}
PAD = {"Am": [45, 57, 60, 64], "F": [41, 53, 57, 60], "C": [48, 60, 64, 67], "G": [43, 55, 59, 62]}
ARP = {"Am": [57, 60, 64, 69, 72], "F": [53, 57, 60, 65, 69], "C": [60, 64, 67, 72, 76], "G": [55, 59, 62, 67, 71]}


def chord_at(t):
    for a, b, c in CHORDS:
        if a <= t < b:
            return c
    return "Am"


# --- intro: metronome, bouncing-ball notes, charge
for k, t0 in enumerate((0.0, 0.5, 1.0, 1.5)):
    add(click(2400 if k == 0 else 1800, 0.03), t0, 0.3)
add(padnote(mtof(45), 2.05, a=1.6, r=0.05) + padnote(mtof(57), 2.05, a=1.6, r=0.05), 0.1, 0.35, bus="music", rev=0.4)
notes = [69, 72, 76, 81, 84, 88, 93, 96]
for k, (ti, s) in enumerate(ball_impacts(540, -140, 0, 0.5, 0.56)):
    f = mtof(notes[min(k, len(notes) - 1)])
    add(mix(blip(f * 1.5, f, 0.25, 18) * (0.45 + 0.55 * s), kick(0.12, 220, 90, 1.5, 30) * 0.5 * s), ti, 1.0, rev=0.3)
add(sweep(180, 1700, 0.26) * np.linspace(0, 1, int(0.26 * SR)) ** 2, 1.74, 0.22, rev=0.3)
add(whoosh(0.6, 400, 7000, 1.5, "rise"), 1.4, 0.35)
add(crash(0.6)[::-1], 1.4, 0.35)
add(blip(500, 4200, 0.09, 25), 2.0, 0.25)                    # ball launches

# --- the drop
add(kick(0.9, 190, 38, 2.5, 3.5), 2.0, 1.0, bus="drums")
add(boom(2.0), 2.0, 0.8)
add(crash(2.6, 1.6), 2.0, 0.55, rev=0.3)

# --- groove 2.0 - 12.5
beats = np.arange(2.0, 12.5, 0.5)
for b in beats:
    if b > 2.0:
        add(kick(), b, 0.9, bus="drums")
    if int(round(b * 2)) % 2 == 1:
        add(clap(), b, 0.42, bus="drums", rev=0.15)
    add(hat(0.05), b + 0.25, 0.16, pan=0.25, bus="drums")
    if 8.0 <= b < 10.0:
        add(hat(0.22, 14), b + 0.25, 0.1, pan=0.3, bus="drums")
for s16 in np.arange(6.0, 10.0, 0.125):
    if abs((s16 * 4) % 2 - 1) > 0.1:
        add(hat(0.03, 120), s16, 0.06, pan=-0.3, bus="drums")
# bass: 8ths with octave pops
for e8 in np.arange(2.0, 13.0, 0.25):
    m = BASS[chord_at(e8)] + (12 if int(round(e8 * 4)) % 2 else 0)
    add(bassnote(mtof(m), 0.23), e8, 0.33, bus="music")
# pad
for a, b, c in CHORDS[1:]:
    for m in PAD[c]:
        add(padnote(mtof(m), b - a + 0.1, 0.15, 0.2), a, 0.22, bus="music", rev=0.35)
# arp: 16ths up-down, ping-pong delay
pat = [0, 1, 2, 3, 4, 3, 2, 1]
for k, s16 in enumerate(np.arange(4.0, 12.5, 0.125)):
    if 7.62 <= s16 < 8.0:
        continue
    notes_ = ARP[chord_at(s16)]
    m = notes_[pat[k % 8]] + (12 if (k // 16) % 2 and s16 >= 8 else 0)
    add(pluck(mtof(m), 0.3, 1.2 if s16 < 8 else 1.8), s16, 0.14, pan=0.35 * np.sin(k * 0.7), bus="music", rev=0.1, dly=0.45)

# --- 01 kinetic type
add(whoosh(0.2, 700, 5000, 1.0), 2.44, 0.5, pan=np.linspace(-0.8, 0.8, int(0.2 * SR)))
add(whoosh(0.22, 700, 5000, 1.0), 2.94, 0.5, pan=np.linspace(0.8, -0.8, int(0.22 * SR)))
add(kick(0.3, 140, 60, 2, 12) * 0.8, 3.16, 0.5)             # P lands
sw_ = sweep(200, 900, 0.42) * np.sin(np.linspace(0, np.pi, int(0.42 * SR))) ** 2
add(sw_ + svf(noise(0.42), np.geomspace(500, 5000, int(0.42 * SR)), 2, 'bp') * 0.5, 2.5, 0.12, rev=0.3)  # weight swell
add(blip(mtof(84) * 1.4, mtof(84), 0.12, 25), 3.238 + 0.12, 0.14)  # Á lands
t = tt(0.5)
add(np.sin(2 * np.pi * np.cumsum(330 * (1 + 0.25 * np.exp(-t * 7) * np.sin(2 * np.pi * 9 * t))) / SR) * np.exp(-t * 7), 3.05, 0.18, rev=0.2)  # O spring
add(whoosh(0.3, 3000, 900, 1.2), 3.12, 0.3, pan=np.linspace(0.9, 0.2, int(0.3 * SR)))  # R slide
for i, m in enumerate([72, 74, 76, 79, 81, 84, 86, 88]):
    add(blip(mtof(m) * 1.3, mtof(m), 0.07), 3.5 + i * 0.024, 0.12, pan=-0.7 + i * 0.2)
add(whoosh(0.4, 150, 9000, 0.9, "rise"), 3.62, 0.8)
add(sweep(120, 900, 0.38) * np.linspace(0, 1, int(0.38 * SR)) ** 3, 3.62, 0.18)
add(boom(1.5, 90, 35), 4.0, 0.6)
add(crash(1.8, 2.2), 4.0, 0.4, rev=0.3)

# --- 02 grid ripples + blinds
for tw, m in ((4.0, 81), (4.5, 77), (5.0, 81), (5.5, 84)):
    f = mtof(m)
    add(blip(f * 2, f, 0.35, 10), tw, 0.2, rev=0.45)
add(blip(1400, 900, 0.12, 30), 4.95, 0.15)                   # counter chip
penta = [72, 74, 76, 79, 81, 84, 86, 88, 91]
for q in range(16):                                           # check-mark cascade
    add(click(mtof(penta[q % 9]), 0.05) * 0.8, 4.98 + q * 0.036, 0.1, pan=-0.8 + q * 0.1, rev=0.2)
for j in range(9):
    add(click(2200 + j * 180), 5.62 + j * 0.017, 0.35, pan=-0.6 + j * 0.15)
add(whoosh(0.35, 3000, 400, 1.0), 5.6, 0.35)

# --- 03 3D
add(boom(1.2, 60, 32), 6.0, 0.45)
add(sweep(300, 1400, 0.3) * np.sin(np.linspace(0, np.pi, int(0.3 * SR))), 6.0, 0.06, rev=0.4)
sw = svf(noise(1.5), 900 + 600 * np.sin(np.linspace(0, 9, int(1.5 * SR))), 3, "bp")
add(sw * np.sin(np.linspace(0, np.pi, len(sw))), 6.2, 0.12, pan=np.sin(np.linspace(0, 6, len(sw))) * 0.6, rev=0.3)
add(crash(0.4)[::-1], 7.35, 0.45)
fz = svf(noise(0.56), np.geomspace(300, 6000, int(0.56 * SR)), 3, 'bp')
add(fz * np.sin(np.linspace(0, np.pi, len(fz))), 6.34, 0.12, pan=np.linspace(-0.6, 0.6, len(fz)))  # neon frame
for st_ in np.arange(6.85, 7.72, 1 / 6):                      # footsteps
    add(mix(kick(0.06, 180, 90, 1.2, 60) * 0.5, filt(noise(0.03), 'hp', 3000) * np.exp(-tt(0.03) * 150) * 0.2), st_, 0.14)


def _ioc_inv(y):
    return (y / 4) ** (1 / 3) if y < .5 else 1 - ((2 - 2 * y) ** (1 / 3)) / 2


for km in range(1, 6):                                        # km markers
    add(bell(mtof(79 + km * 2), 0.6), 6.85 + 0.87 * _ioc_inv(km / 5.2), 0.1, rev=0.4)

# --- 04 particles
add(kick(0.8, 200, 40, 2.8, 4), TR, 0.9, bus="drums")
add(boom(1.4, 80, 30), TR, 0.6)
sh = filt(noise(0.5), "hp", 3000) * np.exp(-tt(0.5) * 9)
for _ in range(45):
    f, o = rng.uniform(2000, 9000), rng.uniform(0, 0.16)
    d = rng.uniform(0.03, 0.1)
    ping = np.sin(2 * np.pi * f * tt(d)) * np.exp(-tt(d) * 60)
    i = int(o * SR)
    sh[i:i + len(ping)] += ping * 0.3
add(sh, TR, 0.5, rev=0.4)
add(crash(2.2, 1.8), 8.0, 0.45, rev=0.3)
air = svf(noise(1.8), 600 + 400 * np.sin(np.linspace(0, 11, int(1.8 * SR))), 1.5, "bp")
add(air * np.sin(np.linspace(0, np.pi, len(air))) ** 0.5, 7.8, 0.15, pan=np.sin(np.linspace(0, 8, len(air))) * 0.7, rev=0.2)
# converging pitches: each voice glides from a random pitch onto a G-major chord, then flies off
tgt = [67, 71, 74, 79, 83, 86, 91]
for v in range(28):
    tf = 8.3 + rng.uniform(0, 0.4)
    f_start, f_end = rng.uniform(250, 3000), mtof(tgt[v % len(tgt)])
    t0, d = 8.1, 2.0
    t = tt(d) + t0
    g = np.clip((t - tf) / 0.5, 0, 1)
    g = np.where(g < .5, 4 * g ** 3, 1 - (-2 * g + 2) ** 3 / 2)
    f = f_start * (f_end / f_start) ** g
    fly = np.clip((t - 9.55 - rng.uniform(0, 0.25)) / 0.45, 0, 1)
    f = f * 2 ** (fly ** 2 * 1.5)
    a = np.clip((t - 8.1) / 0.3, 0, 1) * (1 - fly)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * a
    add(s + 0.3 * np.sin(2 * np.pi * 2 * np.cumsum(f) / SR) * a, t0, 0.028, pan=rng.uniform(-0.8, 0.8), rev=0.5)
add(bell(mtof(91), 1.5), 9.2, 0.12, rev=0.5)
for q, m in enumerate([79, 83, 86, 91]):                       # 'gize' lights up
    add(bell(mtof(m + 12), 0.8), 9.05 + q * 0.06, 0.05, pan=-0.3 + q * 0.2, rev=0.5)
wd = whoosh(0.6, 500, 4000, 1.0)
add(wd, 9.5, 0.55, pan=np.linspace(-0.9, 0.9, len(wd)))

# --- 05 transitions
for i in range(8):
    add(mix(kick(0.15, 300, 120, 2, 30) * 0.6, click(1500 + i * 120) * 0.4), 9.95 + i * 0.03 + 0.08, 0.4, pan=-0.85 + i * 0.24)
for tt0 in (10.45, 10.95):
    for i in range(8):
        add(click(3000 - i * 150, 0.015), tt0 + i * 0.025 + 0.15, 0.3, pan=-0.85 + i * 0.24)
    add(whoosh(0.3, 800, 3500, 1.3), tt0, 0.3)
for k in range(10):                                           # digital blips
    f = rng.choice([880, 1320, 1760, 2640, 3520])
    sq = np.sign(np.sin(2 * np.pi * f * tt(0.03))) * np.exp(-tt(0.03) * 60)
    add(sq, 10.0 + k * 0.021, 0.06, pan=rng.uniform(-0.9, 0.9))
add(crash(1.6, 2.5), 10.0, 0.35)
add(sweep(1400, 200, 0.45) * np.sin(np.linspace(0, np.pi, int(0.45 * SR))), 11.1, 0.1, rev=0.3)

# --- 06 data
t0, dt = 11.5, 0.022
while t0 < 12.2:
    add(click(3200, 0.008), t0, 0.12, pan=rng.uniform(-0.4, 0.4))
    t0 += dt
    dt *= 1.09


def inv_ioc(y):
    return (y / 4) ** (1 / 3) if y < .5 else 1 - ((2 - 2 * y) ** (1 / 3)) / 2


gl = sweep(330, 990, 0.58) * np.sin(np.linspace(0, np.pi, int(0.58 * SR))) ** 0.5
add(gl, 11.72, 0.05, rev=0.4)
for i, m in enumerate([67, 69, 71, 72, 71, 74, 76, 79]):
    add(pluck(mtof(m), 0.35, 2.0), 11.72 + 0.58 * inv_ioc(i / 7), 0.22, pan=-0.7 + i * 0.2, rev=0.3)
add(bell(mtof(96), 1.4), 12.3, 0.16, rev=0.5)
for q, m in enumerate([84, 91]):                              # coach notification
    add(mix(bell(mtof(m), 0.9), pluck(mtof(m), 0.5, 2.0)), 11.97 + q * 0.11, 0.14, rev=0.35)
for i in range(8):
    add(blip(620 - i * 30, 140, 0.14, 25), 12.52 + i * 0.022, 0.2, pan=-0.7 + i * 0.2)
for k, s in enumerate(np.concatenate([np.arange(12.5, 12.75, 0.0625), np.arange(12.75, 13.0, 0.03125)])):
    add(clap(0.15), s, 0.12 + 0.3 * k / 12, bus="drums", rev=0.1)
add(whoosh(0.55, 300, 9000, 1.2, "rise"), 12.45, 0.6)
add(crash(0.5)[::-1], 12.5, 0.4)

# --- 07 end card: resolve to C
add(kick(1.0, 200, 36, 2.6, 3), 13.0, 1.0, bus="drums")
add(boom(2.0, 85, 30), 13.0, 0.8)
add(crash(2.0, 1.4), 13.0, 0.5, rev=0.4)
for m in (36, 48, 55, 59, 62, 64, 67):
    add(padnote(mtof(m), 2.0, 0.02, 0.9), 13.0, 0.22, bus="fx", rev=0.5)
for m in (60, 64, 67, 71, 74, 79):
    add(pluck(mtof(m), 1.2, 2.2), 13.0, 0.2, rev=0.5, dly=0.2)
add(bell(mtof(84), 2.0), 13.0, 0.18, rev=0.6)
for i in range(4):
    add(click(1800 + i * 250, 0.02), 13.06 + i * 0.06 + 0.1, 0.12, pan=-0.2 + i * 0.2, rev=0.2)
pen = whoosh(0.55, 400, 6000, 1.6, 'swell')                   # the G, like a pen stroke
add(pen, 13.08, 0.35, pan=np.linspace(0.3, -0.3, len(pen)), rev=0.2)
add(blip(600, 1200, 0.12, 20), 13.5, 0.12)                    # button pops
sh_ = sum(np.sin(2 * np.pi * np.cumsum(np.geomspace(mtof(m), mtof(m) * 1.5, int(0.6 * SR))) / SR) for m in (84, 88, 91))
add(sh_ * np.sin(np.linspace(0, np.pi, len(sh_))) * 0.3, 13.5, 0.05, rev=0.6)  # RGB ring draws
t = tt(0.4)
fw = 1700 * (500 / 1700) ** (t / 0.4) * (1 + 0.02 * np.sin(2 * np.pi * 11 * t))
add(np.sin(2 * np.pi * np.cumsum(fw) / SR) * np.linspace(0.2, 1, len(t)), 13.6, 0.08, rev=0.3)
for k, (ti, s) in enumerate(ball_impacts(600 - 24 - 290 + 50 * 2.9, -160, 13.6, 14.0, 0.3)):
    f = mtof(84 + 3 * k)
    add(mix(blip(f * 1.5, f, 0.3, 14) * (0.4 + 0.6 * s), kick(0.15, 200, 80, 1.5, 25) * 0.5 * s), ti, 0.4, rev=0.4)
add(bell(mtof(96), 1.0), 14.0, 0.08, rev=0.6)

# ---------------------------------------------------------------- mix
kicks = [b for b in beats] + [TR, 13.0]
sc = np.ones(N)
tN = np.arange(N) / SR
for b in kicks:
    i = int(b * SR)
    seg = tN[i:i + int(0.35 * SR)] - b
    sc[i:i + len(seg)] = np.minimum(sc[i:i + len(seg)], 1 - 0.65 * np.exp(-seg * 11))
BUS["music"] *= sc

# ping-pong delay (dotted 8th)
dly = np.zeros((2, N))
for k in range(1, 6):
    d = int(0.375 * k * SR)
    src = BUS["dly"].sum(0) * 0.5 * 0.42 ** k
    dly[k % 2, d:] += src[:N - d]
dly = np.vstack([filt(dly[0], "lp", 5000), filt(dly[1], "lp", 5000)])

mix = BUS["drums"] + BUS["music"] + BUS["fx"] + dly


def glitch(mix, t0, dur, slice_s, crush=5):
    i, n, s = int(t0 * SR), int(dur * SR), int(slice_s * SR)
    sl = mix[:, i:i + s].copy()
    q = 2 ** crush
    sl = np.round(sl * q) / q
    sl = np.repeat(sl[:, ::6], 6, axis=1)[:, :s]
    for k in range(0, n, s):
        m = min(s, n - k)
        mix[:, i + k:i + k + m] = sl[:, :m] * (1 - 0.15 * k / n)


glitch(mix, 10.0, 0.12, 0.03)
glitch(mix, 11.0, 0.06, 0.02)
glitch(mix, TR + 0.02, 0.05, 0.025, 6)

# reverb: stereo decaying-noise IR
ir_t = tt(2.4)
ir = np.vstack([filt(noise(2.4), "lp", 6500) * np.exp(-ir_t * 2.8) for _ in range(2)])
ir[:, :int(0.018 * SR)] = 0
wet = np.vstack([fftconvolve(BUS["rev"][c], ir[c])[:N] for c in range(2)]) * 0.12
mix = mix + wet

mix = np.vstack([filt(mix[c], "hp", 28) for c in range(2)])
fade = np.clip((15.0 - tN) / 0.5, 0, 1) ** 1.5
mix *= fade
for k in ("drums", "music", "fx"):
    print(f"  {k:6s} rms {np.sqrt(np.mean(BUS[k] ** 2)):.3f}")
mix /= np.percentile(np.abs(mix), 99.95)          # ride the loudest transients into a gentle clip
mix = np.tanh(mix * 1.1) / np.tanh(1.1)
mix *= 10 ** (-1.0 / 20) / np.max(np.abs(mix))     # -1 dBFS peak
wavfile.write("soundtrack.wav", SR, (mix.T * 32767).astype(np.int16))
print("wrote soundtrack.wav", mix.shape, "rms", float(np.sqrt(np.mean(mix ** 2))))
