# Builds the music bed and the paper SFX track for index.html.
#   assets/audio/music.wav  - 28 s happy pop bed, 120 BPM, C major (C G Am F), plucks + bounce bass
#   assets/audio/sfx.wav    - paper sounds (stamp, slap, rip, tape, scribble, marker, shutter...)
# SFX cue times are read from the <script id="sfx-cues"> block in index.html, so picture and
# sound share one list. Everything is synthesised (no samples, no licences), seeded, deterministic.
# Usage: python3 audio/build_audio.py        (numpy + scipy)
import json, os, re, wave
import numpy as np
from scipy.signal import butter, lfilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SR = 44100
DUR = 28.0
N = int(SR * DUR)
BEAT = 0.5
rng = np.random.default_rng(12)

def at(t): return int(round(t * SR))
def lp(x, f, o=2): b, a = butter(o, f / (SR / 2)); return lfilter(b, a, x)
def hp(x, f, o=2): b, a = butter(o, f / (SR / 2), 'high'); return lfilter(b, a, x)
def bp(x, lo, hi, o=2): b, a = butter(o, [lo / (SR / 2), hi / (SR / 2)], 'band'); return lfilter(b, a, x)
def env(n, a=0.004, d=0.3):
    t = np.arange(n) / SR
    return np.minimum(1, t / a) * np.exp(-t / d)
def note(m): return 440 * 2 ** ((m - 69) / 12)
def noise(n): return rng.standard_normal(n)
def put(buf, sig, t, g=1.0, pan=0.0):
    i = at(t)
    if i >= N: return
    j = min(N, i + len(sig)); s = sig[: j - i] * g
    buf[0, i:j] += s * (1 - max(pan, 0)); buf[1, i:j] += s * (1 + min(pan, 0))
def room(x, mix=0.16, size=0.08):
    r = np.random.default_rng(3); n = at(size * 4)
    ir = r.standard_normal(n) * np.exp(-np.arange(n) / (SR * size))
    wet = np.convolve(x, ir)
    return np.pad(x, (0, len(wet) - len(x))) + mix * wet / (np.abs(wet).max() + 1e-9) * np.abs(x).max()

# ---------------- instruments ----------------
def pluck(f, dur=0.5, bright=0.5):
    """Karplus-Strong: a plucked, slightly papery string."""
    n = at(dur); p = max(2, int(SR / f))
    buf = rng.uniform(-1, 1, p) * bright + rng.uniform(-1, 1, p) * (1 - bright) * 0.3
    out = np.zeros(n)
    for i in range(n):
        out[i] = buf[i % p]
        buf[i % p] = 0.5 * (buf[i % p] + buf[(i + 1) % p]) * 0.996
    return out * env(n, 0.001, dur / 2.5)
def marimba(f, dur=0.35, bright=0.4):
    n = at(dur); t = np.arange(n) / SR
    s = np.sin(2 * np.pi * f * t) + bright * np.sin(2 * np.pi * f * 4 * t) * np.exp(-t / 0.03)
    return s * env(n, 0.002, dur / 3.5)
def kick(big=False):
    n = at(0.45 if big else 0.3); t = np.arange(n) / SR
    f = 48 + 120 * np.exp(-t * 32)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / (0.3 if big else 0.14))
    return np.tanh(1.7 * (s + noise(n) * np.exp(-t * 500) * 0.25))
def clap():
    n = at(0.22); t = np.arange(n) / SR
    e = sum(np.exp(-np.maximum(t - d, 0) * 70) * (t >= d) for d in (0, 0.01, 0.021))
    return bp(noise(n), 1000, 5500) * e * 1.3
def shaker():
    n = at(0.06); return hp(noise(n), 6000) * env(n, 0.004, 0.02)
def bass(f, dur=0.22):
    n = at(dur); t = np.arange(n) / SR
    s = np.sin(2 * np.pi * f * t) + 0.35 * np.sign(np.sin(2 * np.pi * f * t))
    return lp(s, 900) * env(n, 0.003, 0.12)
def pad(freqs, dur):
    n = at(dur); t = np.arange(n) / SR; s = np.zeros(n)
    for f in freqs:
        for det in (-0.08, 0.08):
            ff = f * 2 ** (det / 12); s += 2 * ((t * ff + rng.random()) % 1) - 1
    fade = np.minimum(1, np.minimum(np.arange(n), n - np.arange(n)) / (SR * 0.08))
    return lp(s, 1600) * fade / (len(freqs) * 2)

CHORDS = [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]]  # C G Am F
def chord_at(t): return CHORDS[int(t // 2) % 4]

# ---------------- music ----------------
mus = np.zeros((2, N)); drums = np.zeros((2, N))
duck = np.ones(N)
def mark(t):
    i = at(t); n = at(0.3); x = np.arange(n) / n
    duck[i:i + n] = np.minimum(duck[i:i + n], 0.45 + 0.55 * np.sin(x * np.pi / 2))

# plucked arpeggio all film long (sparser in the safety section)
t = 0.0; k = 0
while t < 26.5:
    c = chord_at(t); tones = c + [c[0] + 12, c[1] + 12]
    safe = 16.4 <= t < 21.5
    if not safe or k % 2 == 0:
        m = tones[[0, 2, 4, 3, 1, 3, 4, 2][k % 8]] + 12
        put(mus, pluck(note(m), 0.45), t, 0.33 if not safe else 0.22, 0.35 if k % 2 else -0.35)
    t += 0.25; k += 1
# bounce bass
t = 0.5
while t < 26.0:
    if not (16.4 <= t < 21.5) or (t * 2) % 2 < 0.01:
        r = chord_at(t)[0] - 24
        put(mus, bass(note(r + (12 if int(t * 4) % 4 == 3 else 0))), t, 0.55)
    t += 0.25
# pads
for b in range(14):
    t0 = b * 2
    if t0 >= 27: break
    put(mus, pad([note(m) for m in chord_at(t0)], 2.0), t0, 0.28 if 16.4 <= t0 < 21.5 else 0.16)
# drums: four-on-the-floor, half time for the safety part, drop at 21.5
for i in range(int(26.0 / BEAT)):
    t = i * BEAT
    if t < 0.5: continue
    safe = 16.4 <= t < 21.5
    if not safe or i % 4 == 0:
        put(drums, kick(big=(t in (21.5, 24.0))), t, 0.9); mark(t)
    if (i % 2 == 1) and not safe: put(drums, clap(), t, 0.4, 0.1)
    for s in (0, 0.25):
        put(drums, shaker(), t + s + 0.125, 0.18 if not safe else 0.1, -0.3)
for j in range(8):  # snare-ish roll into the end card
    put(drums, clap(), 21.0 + j * 0.0625, 0.08 + j * 0.03)
put(drums, kick(True), 24.1, 1.0)
put(mus, pad([note(m) for m in (60, 64, 67, 72)], 3.5), 24.1, 0.3)
put(mus, pluck(note(84), 1.2), 24.1, 0.4)

mus *= duck[None, :]
music = mus + drums
fade = np.ones(N); fl = at(1.4); fade[-fl:] = np.linspace(1, 0, fl) ** 2
music *= fade[None, :]
music = np.tanh(music * 0.9)

# ---------------- paper SFX ----------------
def thump(f0=110, dur=0.16):
    n = at(dur); t = np.arange(n) / SR
    return np.sin(2 * np.pi * np.cumsum(f0 * 0.5 + f0 * 0.5 * np.exp(-t * 30)) / SR) * np.exp(-t / 0.05)
def paperhit(dur=0.06, lo=600, hi=4000):
    n = at(dur); return bp(noise(n), lo, hi) * env(n, 0.001, dur / 4)
def crackle(dur, density, lo, hi):
    n = at(dur); x = np.zeros(n)
    idx = rng.integers(0, n, int(density * dur)); x[idx] = rng.uniform(-1, 1, len(idx))
    return bp(x + noise(n) * 0.15, lo, hi)
def glide(f0, f1, dur):
    n = at(dur); t = np.arange(n) / SR
    f = f0 * (f1 / f0) ** (t / dur)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.003, dur / 2.5)
def mix(*parts):
    """Sum signals of different lengths; parts are (signal, offset_s) or bare signals."""
    parts = [p if isinstance(p, tuple) else (p, 0.0) for p in parts]
    end = max(at(o) + len(x) for x, o in parts); out = np.zeros(end)
    for x, o in parts: out[at(o):at(o) + len(x)] += x
    return out
PENTA = [72, 74, 76, 79, 81, 84]
SFX = {
    "stamp": lambda: mix(thump(95, 0.2) * 0.9, paperhit(0.07, 500, 3500) * 0.8),
    "tick": lambda: mix(paperhit(0.025, 1800, 7000) * 0.7, marimba(note(PENTA[rng.integers(6)]), 0.12, 0.2) * 0.25),
    "slap": lambda: mix(paperhit(0.07, 450, 3200), thump(130, 0.1) * 0.5),
    "slapPop": lambda: mix(paperhit(0.06, 450, 3200), room(marimba(note(PENTA[rng.integers(6)]), 0.35, 0.5)) * 0.7),
    "pop": lambda: room(marimba(note(PENTA[rng.integers(6)]), 0.3, 0.5)) * 0.7,
    "scribble": lambda: bp(noise(at(0.42)), 1500, 6000) * (0.55 + 0.45 * np.sin(2 * np.pi * 17 * np.arange(at(0.42)) / SR)) * env(at(0.42), 0.02, 0.3) * 0.35,
    "marker": lambda: mix(bp(noise(at(0.4)), 2000, 5500) * 0.4, glide(1900, 2300, 0.4) * 0.06)[: at(0.4)] * env(at(0.4), 0.01, 0.35),
    "tape": lambda: crackle(0.3, 900, 900, 8000) * np.linspace(0.4, 1, at(0.3)) * 0.8,
    "rip": lambda: crackle(0.38, 1600, 300, 6000) * np.sin(np.linspace(0, np.pi, at(0.38))) ** 0.6 * 0.9,
    "whoosh": lambda: lp(noise(at(0.5)), 1800) * np.sin(np.linspace(0, np.pi, at(0.5))) ** 2 * 1.4,
    "swell": lambda: mix(lp(noise(at(0.4)), 2500) * np.linspace(0, 1, at(0.4)) ** 2 * 1.2, glide(300, 900, 0.4) * 0.15),
    "drop": lambda: mix(thump(80, 0.25) * 0.8, paperhit(0.09, 300, 2500) * 0.6),
    "shutter": lambda: np.concatenate([paperhit(0.02, 2000, 9000), np.zeros(at(0.035)), paperhit(0.03, 1500, 8000)]) * 1.1,
    "bubble": lambda: glide(420, 900, 0.16) * 0.55,
    "flick": lambda: paperhit(0.03, 2000, 7000) * 0.9,
    "fan": lambda: mix(*[(paperhit(0.03, 2000, 7000) * 0.7, i * 0.045) for i in range(4)]),
    "confetti": lambda: crackle(1.3, 240, 2500, 9000) * np.exp(-np.arange(at(1.3)) / (SR * 0.5)) * 0.8,
}
for n_ in (4, 5, 6, 7, 8, 9):
    SFX[f"ticks{n_}"] = (lambda n_=n_: mix(*[(SFX["tick"](), i / 12) for i in range(n_)]))

html = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
cues = json.loads(re.search(r'<script type="application/json" id="sfx-cues">(.*?)</script>', html, re.S).group(1))
sfx = np.zeros((2, N))
for i, (name, t) in enumerate(cues):
    put(sfx, room(SFX[name](), 0.1, 0.05), t, 1.0, ((i * 37) % 7 - 3) * 0.08)

def write(path, x, peak):
    x = x / (np.abs(x).max() + 1e-9) * peak
    with wave.open(path, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x.T * 32767).astype("<i2").tobytes())
    print("wrote", os.path.relpath(path, ROOT))

os.makedirs(os.path.join(ROOT, "assets", "audio"), exist_ok=True)
write(os.path.join(ROOT, "assets", "audio", "music.wav"), music, 0.5)
write(os.path.join(ROOT, "assets", "audio", "sfx.wav"), sfx, 0.6)
