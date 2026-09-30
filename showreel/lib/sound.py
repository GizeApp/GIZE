"""GIZE sound kit: renders a piece's soundtrack from the cue sheet its page
exports (window.getCues -> JSON), so picture and sound can never drift.

    python3 lib/sound.py cues.json out.wav [--sfx out_sfx.wav]

A cue is {"t": seconds, "s": sound name, "g": gain, "p": pan -1..1, ...params}.
Everything is synthesized here: no samples, no licensed music (safe for a
business account and for ads).
"""
import json
import sys

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, fftconvolve, sosfilt

SR = 48000
rng = np.random.default_rng(5)


# ---------------------------------------------------------------- primitives
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


def env_ar(d, a=0.005, r=0.05):
    t = tt(d)
    return np.minimum(1, t / max(a, 1e-4)) * np.clip((d - t) / r, 0, 1)


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
    return sweep(f0, f1, d) * np.exp(-tt(d) * 2.6) * (1 - np.exp(-tt(d) * 400))


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


CHORDS = {"C": [48, 55, 60, 64, 67], "F": [41, 53, 57, 60, 64], "G": [43, 55, 59, 62, 67], "Am": [45, 57, 60, 64, 67],
          "Dm": [38, 50, 57, 62, 65], "Em": [40, 52, 59, 64, 67]}
ROOT = {"C": 36, "F": 29, "G": 31, "Am": 33, "Dm": 38, "Em": 28}
ARP = {"C": [60, 64, 67, 72, 76], "F": [53, 57, 60, 65, 69], "G": [55, 59, 62, 67, 71], "Am": [57, 60, 64, 69, 72],
       "Dm": [50, 57, 62, 65, 69], "Em": [52, 59, 64, 67, 71]}


# ---------------------------------------------------------------- the named sounds
# each returns a list of (signal, time offset, bus, extra gain, reverb send)
def S_tick(c):
    hi = c.get("hi", True)
    return [(mix(click(3400 if hi else 2600, 0.02) * 0.8, filt(noise(0.01), "bandpass", [2000, 6000]) * np.exp(-tt(0.01) * 600) * 0.4), 0, "fx", 0.3, 0)]


def S_ping(c):
    f = c.get("f", 1250)
    return [(mix(blip(f, f, 0.12, 30), np.concatenate([np.zeros(int(0.07 * SR)), blip(f * 1.335, f * 1.335, 0.2, 22)])), 0, "fx", 0.18, 0.1)]


def S_click(c):
    return [(click(c.get("f", 2600), c.get("d", 0.015)), 0, "fx", 0.3, 0)]


def S_type(c):
    return [(click(2200 + rng.uniform(-200, 200), 0.015), 0, "fx", 0.28, 0)]


def S_tap(c):
    return [(mix(click(1600, 0.03), kick(0.08, 400, 180, 1.5, 50) * 0.4), 0, "fx", 0.45, 0)]


def S_whoosh(c):
    d = c.get("d", 0.35)
    return [(whoosh(d, c.get("f0", 400), c.get("f1", 3000), c.get("q", 1.2), c.get("shape", "swell")), 0, "fx", 0.3, 0.05)]


def S_rise(c):
    d = c.get("d", 0.6)
    return [(whoosh(d, 250, 8000, 1.3, "rise"), 0, "fx", 0.45, 0.1),
            (sweep(150, 1200, d) * np.linspace(0, 1, int(d * SR)) ** 3, 0, "fx", 0.12, 0.1)]


def S_revcrash(c):
    return [(crash(c.get("d", 0.4))[::-1], 0, "fx", 0.45, 0)]


def S_hit(c):
    return [(kick(0.9, 190, 38, 2.5, 3.5), 0, "fx", 1.0, 0), (boom(1.6, 80, 30), 0, "fx", 0.7, 0), (crash(2.2, 1.6), 0, "fx", 0.45, 0.3)]


def S_stamp(c):
    return [(kick(0.9, 160, 38, 2.6, 4.5), 0, "fx", 1.0, 0), (boom(1.2, 70, 28), 0, "fx", 0.8, 0),
            (filt(noise(0.12), "lp", 1800) * np.exp(-tt(0.12) * 30), 0, "fx", 0.7, 0),
            (sweep(900, 60, 0.35) * np.linspace(1, 0, int(0.35 * SR)) ** 2, 0, "fx", 0.18, 0)]


def S_sweep(c):
    d = c.get("d", 0.35)
    return [(sweep(c.get("f0", 1800), c.get("f1", 200), d) * np.linspace(1, 0, int(d * SR)) ** 2, 0, "fx", 0.15, 0.1)]


def S_strike(c):
    return [(whoosh(0.12, 1500, 8000, 1.0), 0, "fx", 0.5, 0)]


def S_marker(c):
    n = int(0.14 * SR)
    return [(svf(noise(0.14), np.linspace(2500, 5000, n), 3, "bp") * np.hanning(n), 0, "fx", 0.6, 0)]


def S_pop(c):
    return [(blip(600, 1200, 0.12, 20), 0, "fx", 0.14, 0)]


def S_blip(c):
    return [(blip(c.get("f0", 800), c.get("f1", 1600), c.get("d", 0.1), c.get("rate", 30)), 0, "fx", 0.14, 0)]


def S_bell(c):
    return [(bell(mtof(c.get("m", 84)), c.get("d", 1.2)), 0, "fx", 0.16, 0.4)]


def S_pr(c):
    out = [(bell(mtof(84), 1.2), 0, "fx", 0.2, 0.4), (bell(mtof(88), 1.0), 0.05, "fx", 0.14, 0.4), (bell(mtof(91), 1.0), 0.1, "fx", 0.12, 0.4)]
    for q in range(16):
        out.append((blip(rng.uniform(4000, 8000), rng.uniform(3000, 6000), 0.05, 60), 0.01 + q * 0.025, "fx", 0.05, 0.3))
    return out


def S_buzz(c):
    d = c.get("d", 0.28)
    t = tt(d)
    return [(np.sign(np.sin(2 * np.pi * 170 * t)) * (0.5 + 0.5 * np.sin(2 * np.pi * 28 * t)) * env_ar(d, 0.01, 0.04) * 0.25, 0, "fx", 0.9, 0)]


def S_chime(c):
    return [(mix(bell(mtof(m), 0.9), pluck(mtof(m), 0.5, 2.0)), q * 0.1, "fx", 0.14, 0.35) for q, m in enumerate([84, 91])]


def S_bloop(c):
    k, v = c.get("k", 0), c.get("v", 1)
    f = mtof(84 + 3 * k)
    return [(mix(blip(f * 1.5, f, 0.3, 14) * (0.4 + 0.6 * v), kick(0.15, 200, 80, 1.5, 25) * 0.5 * v), 0, "fx", 0.4, 0.4)]


def S_whistle(c):
    d = c.get("d", 0.39)
    t = tt(d)
    fw = 1700 * (500 / 1700) ** (t / d) * (1 + 0.02 * np.sin(2 * np.pi * 11 * t))
    return [(np.sin(2 * np.pi * np.cumsum(fw) / SR) * np.linspace(0.2, 1, len(t)), 0, "fx", 0.08, 0.3)]


def S_pen(c):
    return [(whoosh(0.55, 400, 6000, 1.6), 0, "fx", 0.35, 0.2)]


def S_shimmer(c):
    n = int(0.6 * SR)
    s = sum(np.sin(2 * np.pi * np.cumsum(np.geomspace(mtof(m), mtof(m) * 1.5, n)) / SR) for m in (84, 88, 91))
    return [(s * np.sin(np.linspace(0, np.pi, n)) * 0.3, 0, "fx", 0.05, 0.6)]


def S_drone(c):
    d = c.get("d", 1.9)
    t = tt(d)
    s = (np.sin(2 * np.pi * 55 * t) + 0.5 * np.sin(2 * np.pi * 58.3 * t)) * (t / d) ** 1.5
    s += svf(noise(d), 300 * 12 ** (t / d), 4, "bp") * (t / d) ** 2 * 0.6
    return [(s, 0, "music", 0.35, 0)]


def S_sub(c):
    return [(boom(c.get("d", 1.4), c.get("f0", 70), c.get("f1", 30)), 0, "fx", c.get("gain", 0.6), 0)]


def S_glass(c):
    s = filt(noise(0.5), "hp", 3000) * np.exp(-tt(0.5) * 9)
    for _ in range(40):
        f, o, d = rng.uniform(2000, 9000), rng.uniform(0, 0.16), rng.uniform(0.03, 0.1)
        i = int(o * SR)
        p = np.sin(2 * np.pi * f * tt(d)) * np.exp(-tt(d) * 60)
        s[i:i + len(p)] += p * 0.3
    return [(s, 0, "fx", 0.5, 0.4)]


def S_chord(c):
    ch = c.get("ch", "C")
    d = c.get("d", 2.0)
    out = [(padnote(mtof(m), d, 0.02, 0.9), 0, "music", 0.2, 0.5) for m in CHORDS[ch]]
    out += [(pluck(mtof(m), 1.2, 2.2), 0, "music", 0.18, 0.5) for m in ARP[ch]]
    out.append((bell(mtof(ARP[ch][0] + 24), 2.0), 0, "music", 0.15, 0.6))
    return out


def S_groove(c):
    """A 4-on-the-floor bed: {t (start), t1 (end), bpm, chords: [[time, name], ...], parts}"""
    t0, t1, bpm = c["t"], c["t1"], c.get("bpm", 128)
    bt = 60 / bpm
    parts = set(c.get("parts", ["kick", "clap", "hat", "bass", "pad", "arp"]))
    ch = sorted(c.get("chords", [[t0, "C"]]))

    def chord_at(x):
        cur = ch[0][1]
        for a, n in ch:
            if x >= a - 1e-6:
                cur = n
        return cur

    out = []
    n = int(round((t1 - t0) / bt))
    for i in range(n):
        b = i * bt
        if "kick" in parts and i > 0:
            out.append((kick(), b, "music", 0.9, 0))
        if "clap" in parts and i % 2 == 1:
            out.append((clap(), b, "music", 0.4, 0.15))
        if "hat" in parts:
            out.append((hat(0.05), b + bt / 2, "music", 0.16, 0))
        if "bass" in parts:
            for h in (0, 1):
                x = b + h * bt / 2
                out.append((bassnote(mtof(ROOT[chord_at(t0 + x)] + 12 * h), bt / 2 - 0.01), x, "music", 0.33, 0))
    if "arp" in parts:
        pat = [0, 1, 2, 3, 4, 3, 2, 1]
        for k in range(n * 4):
            x = k * bt / 4
            out.append((pluck(mtof(ARP[chord_at(t0 + x)][pat[k % 8]]), 0.3, 1.4), x, "music", 0.12, 0.1))
    if "pad" in parts:
        for i, (a, name) in enumerate(ch):
            b = ch[i + 1][0] if i + 1 < len(ch) else t1
            for m in CHORDS[name]:
                out.append((padnote(mtof(m), max(0.2, b - max(a, t0)) + 0.1, 0.1, 0.3), max(a, t0) - t0, "music", 0.2, 0.35))
    return out


SOUNDS = {k[2:]: v for k, v in globals().items() if k.startswith("S_")}


# ---------------------------------------------------------------- render
def render(sheet):
    dur = float(sheet["dur"])
    n = int(SR * dur)
    bus = {k: np.zeros((2, n)) for k in ("music", "fx", "rev_music", "rev_fx")}
    grooves = []
    for c in sheet["cues"]:
        fn = SOUNDS.get(c["s"])
        if fn is None:
            print("unknown sound", c["s"], file=sys.stderr)
            continue
        if c["s"] == "groove":
            grooves.append(c)
        for sig, off, b, g, rv in fn(c):
            b = c.get("bus", b)
            i = int(round((c["t"] + off) * SR))
            sig = np.asarray(sig, float) * g * c.get("g", 1.0)
            if i < 0:
                sig, i = sig[-i:], 0
            m = min(len(sig), n - i)
            if m <= 0:
                continue
            p = float(c.get("p", 0.0))
            st = np.vstack([sig[:m] * np.cos((p + 1) * np.pi / 4) * np.sqrt(2), sig[:m] * np.sin((p + 1) * np.pi / 4) * np.sqrt(2)])
            bus[b][:, i:i + m] += st
            rv = c.get("rev", rv)
            if rv:
                bus["rev_" + b][:, i:i + m] += st * rv
    # sidechain the music under each groove kick
    tN = np.arange(n) / SR
    sc = np.ones(n)
    for gc in grooves:
        bt = 60 / gc.get("bpm", 128)
        for b in np.arange(gc["t"], gc["t1"], bt):
            i = int(b * SR)
            seg = tN[i:i + int(0.35 * SR)] - b
            sc[i:i + len(seg)] = np.minimum(sc[i:i + len(seg)], 1 - 0.6 * np.exp(-seg * 11))
    bus["music"] *= sc
    fade = sheet.get("fadeOut", 0.35)
    env = np.clip((dur - tN) / max(fade, 1e-3), 0, 1) if fade else np.ones(n)
    ir_t = tt(2.2)
    ir = np.vstack([filt(noise(2.2), "lp", 6500) * np.exp(-ir_t * 3.0) for _ in range(2)])
    ir[:, :int(0.018 * SR)] = 0

    def verb(b):
        return np.vstack([fftconvolve(bus[b][c], ir[c])[:n] for c in range(2)]) * 0.12

    def master(x, peak_db):
        x = np.vstack([filt(x[c], "hp", 28) for c in range(2)]) * env
        x /= np.percentile(np.abs(x), 99.95) + 1e-9
        x = np.tanh(x * 1.1) / np.tanh(1.1)
        return x * 10 ** (peak_db / 20) / (np.max(np.abs(x)) + 1e-9)

    wet_fx = verb("rev_fx")
    full = master(bus["music"] + bus["fx"] + verb("rev_music") + wet_fx, -1.0)
    sfx = master(bus["fx"] + wet_fx, -4.0)
    return full, sfx


def main():
    args = sys.argv[1:]
    sheet = json.load(open(args[0]))
    full, sfx = render(sheet)
    wavfile.write(args[1], SR, (full.T * 32767).astype(np.int16))
    if "--sfx" in args:
        wavfile.write(args[args.index("--sfx") + 1], SR, (sfx.T * 32767).astype(np.int16))


if __name__ == "__main__":
    main()
