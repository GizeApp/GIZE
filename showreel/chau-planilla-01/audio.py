"""Soundtrack for "Chau planilla · Ep. 01", sample-locked to reel.html (128 BPM).

    python3 audio.py  ->  soundtrack.wav  (music + sound design)
                          sfx.wav         (sound design only, to layer a trending track on Instagram)
"""
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve
from scipy.io import wavfile

SR = 48000
N = int(SR * 15.0)
BT = 60 / 128
T_STAMP, T_DROP, T_PAY, T_OUT = 4 * BT, 6 * BT, 18 * BT, 24 * BT
ARRIVE, COLLAPSE, T_LOOP = 9.35, 7.95, 14.42
rng = np.random.default_rng(11)
BUS = {k: np.zeros((2, N)) for k in ("music", "fx", "rev_music", "rev_fx", "dly")}


# ---------------------------------------------------------------- helpers
def tt(d):
    return np.arange(int(d * SR)) / SR


def noise(d):
    return rng.standard_normal(int(d * SR))


def filt(x, kind, f, order=2):
    return sosfilt(butter(order, f, kind, fs=SR, output="sos"), x)


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def sweep(f0, f1, d):
    t = tt(d)
    return np.sin(2 * np.pi * np.cumsum(f0 * (f1 / f0) ** (t / d)) / SR)


def svf(x, fc, q=0.8, mode="bp"):
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


def mix(*xs):
    out = np.zeros(max(len(x) for x in xs))
    for x in xs:
        out[:len(x)] += x
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
    p = np.asarray(pan, float)[:n] if np.ndim(pan) else pan
    st = np.vstack([sig * np.cos((p + 1) * np.pi / 4) * np.sqrt(2), sig * np.sin((p + 1) * np.pi / 4) * np.sqrt(2)])
    BUS[bus][:, i:i + n] += st
    if rev:
        BUS["rev_" + bus][:, i:i + n] += st * rev
    if dly:
        BUS["dly"][:, i:i + n] += st * dly


def env_ar(d, a=0.005, r=0.05):
    t = tt(d)
    return np.minimum(1, t / max(a, 1e-4)) * np.clip((d - t) / r, 0, 1)


def xpan(x):
    return float(np.clip(x / 1080 * 2 - 1, -0.9, 0.9))


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


def pluck(f, d=0.4, bright=1.0, nh=16):
    t = tt(d)
    s = np.zeros_like(t)
    for h in range(1, nh + 1):
        if f * h > 15000:
            break
        s += (1 / h) * (np.sin(2 * np.pi * f * h * t + h) + 0.7 * np.sin(2 * np.pi * f * 1.004 * h * t)) * np.exp(-t * (5 + h * 2.6 / bright))
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
    return s * np.minimum(1, t / a) * np.clip((d - t) / r, 0, 1) * 0.18


def bell(f, d=2.0):
    t = tt(d)
    s = sum(a * np.sin(2 * np.pi * f * m * t) * np.exp(-t * dc) for m, a, dc in ((1, 1, 2.2), (2.76, 0.5, 4), (5.4, 0.3, 7), (8.93, 0.15, 11)))
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
    s = svf(noise(d), f0 * (f1 / f0) ** (t / d), q, "bp")
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


def ping(f=1320):
    """Generic two-note chat notification (not any app's actual sound)."""
    return mix(blip(f, f, 0.12, 30), np.concatenate([np.zeros(int(0.07 * SR)), blip(f * 1.335, f * 1.335, 0.2, 22)]))


def tickclock(hi=True):
    return mix(click(3400 if hi else 2600, 0.02) * 0.8, filt(noise(0.01), "bandpass", [2000, 6000]) * np.exp(-tt(0.01) * 600) * 0.4)


def buzz(d=0.28):
    t = tt(d)
    return np.sign(np.sin(2 * np.pi * 170 * t)) * (0.5 + 0.5 * np.sin(2 * np.pi * 28 * t)) * env_ar(d, 0.01, 0.04) * 0.25


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


# ---------------------------------------------------------------- HOOK: clock, pings, pile-up
for k, t0 in enumerate(np.arange(0, T_STAMP - 0.05, BT / 2)):
    add(tickclock(k % 2 == 0), t0, 0.28 + 0.2 * t0 / T_STAMP)
BUB = [(0.08, 590), (0.26, 60), (0.42, 520), (0.56, 90), (0.7, 620), (0.82, 40), (0.93, 470), (1.03, 70), (1.12, 600), (1.2, 300),
       (1.28, 40), (1.35, 560), (1.42, 180), (1.48, 600), (1.54, 90), (1.6, 520), (1.66, 250), (1.72, 560)]
for k, (t0, x) in enumerate(BUB):
    add(ping(1250 * 2 ** (rng.integers(-2, 3) / 12)), t0, 0.16 + 0.1 * k / len(BUB), pan=xpan(x + 150), rev=0.1)
for t0 in (0.1, 0.2, 0.34, 0.42, 0.5, 0.64):                        # question words
    add(click(1800, 0.02), t0, 0.3)
for t0 in (0.9, 1.45):
    add(buzz(), t0, 0.9)
t = tt(T_STAMP)
drone = (np.sin(2 * np.pi * 55 * t) + 0.5 * np.sin(2 * np.pi * 58.3 * t)) * (t / T_STAMP) ** 1.5
drone += svf(noise(T_STAMP), 300 * (12) ** (t / T_STAMP), 4, "bp") * (t / T_STAMP) ** 2 * 0.6
add(drone, 0, 0.35, bus="music")
add(whoosh(0.6, 300, 7000, 1.4, "rise"), T_STAMP - 0.6, 0.5)

# ---------------------------------------------------------------- TITLE: stamp, then silence
add(kick(0.9, 160, 38, 2.6, 4.5), T_STAMP, 1.0)
add(boom(1.2, 70, 28), T_STAMP, 0.8)
add(filt(noise(0.12), "lp", 1800) * np.exp(-tt(0.12) * 30), T_STAMP, 0.7)            # rubber-stamp slap
add(sweep(900, 60, 0.35) * np.linspace(1, 0, int(0.35 * SR)) ** 2, T_STAMP, 0.18)     # tape stop
sw = whoosh(0.12, 1500, 8000, 1.0)
add(sw, T_STAMP + 0.005, 0.5, pan=np.linspace(-0.8, 0.8, len(sw)))                     # red strike
add(svf(noise(0.14), np.linspace(2500, 5000, int(0.14 * SR)), 3, "bp") * np.hanning(int(0.14 * SR)), T_STAMP + 0.2, 0.6)  # marker
add(blip(700, 1300, 0.1, 25), T_STAMP + 0.3, 0.2)
add(crash(0.36)[::-1], T_DROP - 0.36, 0.45)
add(whoosh(0.35, 200, 5000, 1.2, "rise"), T_DROP - 0.35, 0.35)

# ---------------------------------------------------------------- MUSIC from the drop
CH = [(T_DROP, 3.75, "F"), (3.75, 5.625, "C"), (5.625, 7.5, "G"), (7.5, 9.375, "Am"), (9.375, T_OUT, "F"), (T_OUT, 15.0, "C")]
ROOT = {"F": 29, "C": 36, "G": 31, "Am": 33}
PAD = {"F": [41, 53, 57, 60, 64], "C": [48, 55, 60, 64, 67], "G": [43, 55, 59, 62, 67], "Am": [45, 57, 60, 64, 67]}
ARP = {"F": [53, 57, 60, 65, 69], "C": [60, 64, 67, 72, 76], "G": [55, 59, 62, 67, 71], "Am": [57, 60, 64, 69, 72]}


def chord_at(t):
    for a, b, c in CH:
        if a <= t < b:
            return c
    return "C"


add(kick(0.9, 190, 38, 2.5, 3.5), T_DROP, 1.0, bus="music")
add(boom(1.6, 80, 30), T_DROP, 0.7, bus="music")
add(crash(2.4, 1.6), T_DROP, 0.5, bus="music", rev=0.3)
beats = [b for b in np.arange(T_DROP, 13.6, BT)]
for b in beats:
    bi = int(round(b / BT))
    if b > T_DROP + 0.01 and not (T_OUT - 0.5 < b < T_OUT):
        add(kick(), b, 0.9, bus="music")
    if bi % 2 == 1 and b < T_OUT:
        add(clap(), b, 0.4, bus="music", rev=0.15)
    add(hat(0.05), b + BT / 2, 0.16, pan=0.25, bus="music")
    if T_PAY <= b < T_OUT:
        add(hat(0.22, 14), b + BT / 2, 0.1, pan=0.3, bus="music")
for s16 in np.arange(3.75, T_OUT, BT / 4):
    if abs(((s16 / BT) * 2) % 2 - 1) > 0.1:
        add(hat(0.03, 120), s16, 0.05, pan=-0.3, bus="music")
for e8 in np.arange(T_DROP, 13.6, BT / 2):
    m = ROOT[chord_at(e8)] + (12 if int(round(e8 / BT * 2)) % 2 else 0)
    add(bassnote(mtof(m), BT / 2 - 0.01), e8, 0.33, bus="music")
for a, b, c in CH:
    for m in PAD[c]:
        add(padnote(mtof(m), min(b, 14.4) - a + 0.1, 0.12 if a > T_DROP else 0.02, 0.3), a, 0.2, bus="music", rev=0.35)
pat = [0, 1, 2, 3, 4, 3, 2, 1]
for k, s16 in enumerate(np.arange(3.75, T_OUT, BT / 4)):
    m = ARP[chord_at(s16)][pat[k % 8]] + (12 if s16 >= T_PAY and (k // 8) % 2 else 0)
    add(pluck(mtof(m), 0.3, 1.4), s16, 0.12, pan=0.35 * np.sin(k * 0.7), bus="music", rev=0.1, dly=0.4)
for k in np.arange(T_OUT - 0.47, T_OUT, BT / 4):                   # fill into the outro
    add(clap(0.12), k, 0.25, bus="music")

# ---------------------------------------------------------------- MORPH + ENTRENO sound design
add(whoosh(0.6, 200, 3000, 1.0), T_DROP, 0.5)                     # phone rises
for i in range(14):                                                # cells fly and snap in
    t0 = T_DROP + 0.1 + i * 0.032
    add(whoosh(0.3, 800 + i * 60, 4000, 1.4), t0, 0.12, pan=-0.6 + i * 0.09)
    add(mix(click(1400 + i * 110, 0.03), blip(mtof(72 + [0, 2, 4, 7, 9][i % 5] + 12 * (i // 5)), mtof(72 + [0, 2, 4, 7, 9][i % 5] + 12 * (i // 5)), 0.12, 35) * 0.5), t0 + 0.5, 0.25, pan=-0.5 + i * 0.07, rev=0.15)
add(whoosh(0.3, 600, 4000, 1.2), 3.3, 0.18)                        # caption
add(whoosh(0.45, 300, 2500, 1.1), 4.55, 0.3)                       # push-in
for t0 in (5.0, 5.08, 5.16, 5.24, 5.42):                           # typing 32,5 / 9
    add(click(2200 + rng.uniform(-200, 200), 0.015), t0, 0.28)
add(mix(click(1600, 0.03), kick(0.08, 400, 180, 1.5, 50) * 0.4), 5.625, 0.45)   # check
add(bell(mtof(84), 1.2), 5.69, 0.2, rev=0.4)                        # PR
add(bell(mtof(88), 1.0), 5.74, 0.14, rev=0.4)
add(bell(mtof(91), 1.0), 5.79, 0.12, rev=0.4)
for q in range(16):
    add(blip(rng.uniform(4000, 8000), rng.uniform(3000, 6000), 0.05, 60), 5.7 + q * 0.025, 0.05, pan=rng.uniform(-0.6, 0.6), rev=0.3)
add(whoosh(0.3, 500, 2000, 1.2), 6.13, 0.15)                        # scroll
add(click(1500, 0.03), 6.5625, 0.4)                                 # Iniciar descanso
add(whoosh(0.25, 400, 2500, 1.3), 6.6, 0.2)
for t0 in np.arange(6.62, 7.45, 0.06):                              # sped-up countdown
    add(click(3000, 0.008), t0, 0.08)
for q in range(2):                                                  # descanso terminado
    add(np.sin(2 * np.pi * 1760 * tt(0.08)) * env_ar(0.08, 0.002, 0.02), 7.45 + q * 0.12, 0.12)
add(buzz(0.3), 7.45, 0.6)
for t0 in (7.56, 7.6, 7.72, 7.76):
    add(click(2300, 0.015), t0, 0.22)
for t0 in (7.66, 7.83):
    add(mix(click(1600, 0.03), kick(0.08, 400, 180, 1.5, 50) * 0.4), t0, 0.4)
add(blip(900, 1800, 0.15, 20), COLLAPSE, 0.15)                     # card flash
add(whoosh(0.3, 3000, 600, 1.2), COLLAPSE + 0.12, 0.25)            # collapse
add(whoosh(0.4, 400, 2000, 1.0), 8.0, 0.2)                          # pull back

# ---------------------------------------------------------------- PAYOFF: save -> the coach sees it
add(whoosh(0.45, 300, 2000, 1.0), T_PAY, 0.3, pan=np.linspace(0, -0.7, int(0.45 * SR)))
add(whoosh(0.5, 300, 2400, 1.0), 8.5, 0.35, pan=np.linspace(0.9, 0.3, int(0.5 * SR)))
add(mix(click(1500, 0.03), kick(0.08, 400, 180, 1.5, 50) * 0.4), 8.9, 0.45)   # Guardar
zp = sweep(500, 2600, 0.4) * np.sin(np.linspace(0, np.pi, int(0.4 * SR)))
add(zp, 8.95, 0.12, pan=np.linspace(-0.6, 0.4, len(zp)), rev=0.3)              # the dot travels
add(whoosh(0.4, 600, 5000, 1.5), 8.95, 0.2, pan=np.linspace(-0.6, 0.4, int(0.4 * SR)))
for q, m in enumerate([84, 91]):                                     # arrives
    add(mix(bell(mtof(m), 0.9), pluck(mtof(m), 0.5, 2.0)), ARRIVE + q * 0.1, 0.14, rev=0.35)
for q in range(8):                                                   # rows fill
    add(click(2600 + q * 90, 0.01), ARRIVE + 0.1 + q * 0.05, 0.1, pan=0.3)
add(whoosh(0.45, 300, 2500, 1.1), 9.5, 0.25)                        # coach push-in
for q, t0 in enumerate([9.75, 9.83, 9.91, 9.87, 9.95]):              # ▲ badges
    add(blip(mtof(79 + q * 2), mtof(84 + q * 2), 0.1, 30), t0, 0.14, pan=0.2)
add(whoosh(0.35, 2500, 300, 1.2), 11.0, 0.35)                       # phones drop

# ---------------------------------------------------------------- OUTRO: signature, dot, ask
add(kick(1.0, 200, 36, 2.6, 3), T_OUT, 1.0, bus="music")
add(boom(2.0, 85, 30), T_OUT, 0.7, bus="music")
add(crash(2.0, 1.4), T_OUT, 0.45, bus="music", rev=0.4)
add(bell(mtof(84), 2.0), T_OUT, 0.16, bus="music", rev=0.6)
for m in (60, 64, 67, 71, 74, 79):
    add(pluck(mtof(m), 1.2, 2.2), T_OUT, 0.18, bus="music", rev=0.5, dly=0.2)
pen = whoosh(0.55, 400, 6000, 1.6)
add(pen, T_OUT + 0.08, 0.35, pan=np.linspace(0.3, -0.3, len(pen)), rev=0.2)
t = tt(0.39)
fw = 1700 * (500 / 1700) ** (t / 0.39) * (1 + 0.02 * np.sin(2 * np.pi * 11 * t))
add(np.sin(2 * np.pi * np.cumsum(fw) / SR) * np.linspace(0.2, 1, len(t)), 11.8, 0.08, rev=0.3)
for k, (ti, s) in enumerate(ball_impacts(700, -140, 11.8, T_OUT + 2 * BT, 0.3)):
    f = mtof(84 + 3 * k)
    add(mix(blip(f * 1.5, f, 0.3, 14) * (0.4 + 0.6 * s), kick(0.15, 200, 80, 1.5, 25) * 0.5 * s), ti, 0.4, rev=0.4)
add(whoosh(0.3, 600, 3000, 1.2), 12.3, 0.15)
add(blip(600, 1200, 0.12, 20), 12.6, 0.14)
shim = sum(np.sin(2 * np.pi * np.cumsum(np.geomspace(mtof(m), mtof(m) * 1.5, int(0.6 * SR))) / SR) for m in (84, 88, 91))
add(shim * np.sin(np.linspace(0, np.pi, len(shim))) * 0.3, 12.6, 0.05, rev=0.6)

# ---------------------------------------------------------------- LOOP back to the planilla
for q in range(12):
    add(mix(click(1800 + q * 60, 0.01), filt(noise(0.02), "bandpass", [1500, 5000]) * np.exp(-tt(0.02) * 200) * 0.3), T_LOOP + q * 0.045, 0.12, pan=-0.7 + q * 0.12)
for k, t0 in enumerate(np.arange(14.53, 15.0, BT / 2)):
    add(tickclock(k % 2 == 1), t0, 0.28)

# ---------------------------------------------------------------- mix
tN = np.arange(N) / SR
sc = np.ones(N)
for b in [x for x in beats] + [T_OUT]:
    i = int(b * SR)
    seg = tN[i:i + int(0.35 * SR)] - b
    sc[i:i + len(seg)] = np.minimum(sc[i:i + len(seg)], 1 - 0.6 * np.exp(-seg * 11))
music = BUS["music"].copy()
music[:, int(T_DROP * SR):] *= sc[int(T_DROP * SR):]
music *= np.clip((14.45 - tN) / 0.6, 0, 1)                          # music hands the loop back to the clock

dly = np.zeros((2, N))
for k in range(1, 5):
    d = int(0.375 * k * SR)
    dly[k % 2, d:] += BUS["dly"].sum(0)[:N - d] * 0.5 * 0.4 ** k
ir_t = tt(2.2)
ir = np.vstack([filt(noise(2.2), "lp", 6500) * np.exp(-ir_t * 3.0) for _ in range(2)])
ir[:, :int(0.018 * SR)] = 0


def master(x, peak_db):
    x = np.vstack([filt(x[c], "hp", 28) for c in range(2)])
    x /= np.percentile(np.abs(x), 99.95) + 1e-9
    x = np.tanh(x * 1.1) / np.tanh(1.1)
    return x * 10 ** (peak_db / 20) / np.max(np.abs(x))


verb = lambda b: np.vstack([fftconvolve(BUS[b][c], ir[c])[:N] for c in range(2)]) * 0.12
wet_fx = verb("rev_fx")
full = master(music + BUS["fx"] + dly + verb("rev_music") + wet_fx, -1.0)
fx_only = master(BUS["fx"] + wet_fx, -4.0)
wavfile.write("soundtrack.wav", SR, (full.T * 32767).astype(np.int16))
wavfile.write("sfx.wav", SR, (fx_only.T * 32767).astype(np.int16))
print("wrote soundtrack.wav + sfx.wav")
