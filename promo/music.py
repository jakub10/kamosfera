# Syntetizuje 30s hudobný podklad (120 BPM):
#   promo/music.wav     -> teaser30.html (v1)
#   promo/music-v2.wav  -> teaser30v2.html: jemnejšie risery + teplé marimba SFX naviazané na dej
#                          (postup podľa saas-motion-kit, playbook/06-sound.md a tools/warm_sfx.py)
# Strihy vo videu sedia na doby: 1 doba = 0.5 s, 1 takt = 2 s.
# Usage: python3 promo/music.py   (numpy + scipy)
import sys
import numpy as np
from scipy.signal import butter, lfilter
import wave, os

SR = 44100
DUR = 30.0
N = int(SR * DUR)
BEAT = 0.5
rng = np.random.default_rng(3)


def at(t): return int(t * SR)
def add(sig, t, gain=1.0, pan=0.0):
    i = at(t); j = min(N, i + len(sig)); s = sig[: j - i] * gain
    L[i:j] += s * (1 - max(pan, 0)); R[i:j] += s * (1 + min(pan, 0))
def lp(x, f, o=2): b, a = butter(o, f / (SR / 2)); return lfilter(b, a, x)
def hp(x, f, o=2): b, a = butter(o, f / (SR / 2), 'high'); return lfilter(b, a, x)
def bp(x, lo, hi): b, a = butter(2, [lo / (SR / 2), hi / (SR / 2)], 'band'); return lfilter(b, a, x)
def env(n, a=0.005, d=0.3):
    t = np.arange(n) / SR
    return np.minimum(1, t / a) * np.exp(-t / d)
def saw(f, n, ph=0.0):
    t = np.arange(n) / SR
    return 2 * ((t * f + ph) % 1) - 1
def note(m): return 440 * 2 ** ((m - 69) / 12)

# --- drums ---
def kick(big=False):
    n = at(0.6 if big else 0.35); t = np.arange(n) / SR
    f = 45 + 110 * np.exp(-t * 30)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / (0.35 if big else 0.16))
    click = rng.standard_normal(n) * np.exp(-t * 400) * 0.3
    return np.tanh((s + click) * 1.6)
def clap():
    n = at(0.25); t = np.arange(n) / SR
    e = sum(np.exp(-np.maximum(t - d, 0) * 60) * (t >= d) for d in (0, 0.012, 0.024))
    return bp(rng.standard_normal(n), 900, 5000) * e * 1.2
def hat(open_=False):
    n = at(0.2 if open_ else 0.05)
    return hp(rng.standard_normal(n), 7000) * env(n, 0.001, 0.08 if open_ else 0.015)
def riser(dur):
    n = at(dur); t = np.arange(n) / SR
    x = rng.standard_normal(n); out = np.zeros(n); seg = 2048
    for i in range(0, n, seg):  # filtr sa otvára
        f = 300 + 9000 * (i / n) ** 2
        out[i:i + seg] = bp(x[i:i + seg], f * 0.6, min(f * 1.4, 20000))
    return out * (t / dur) ** 2 * 0.9
def whoosh(dur=0.5):
    n = at(dur); t = np.arange(n) / SR
    x = bp(rng.standard_normal(n), 400, 6000)
    return x * np.sin(np.pi * t / dur) ** 2 * 0.7
def impact():
    n = at(2.5); t = np.arange(n) / SR
    boom = np.sin(2 * np.pi * np.cumsum(38 + 80 * np.exp(-t * 8)) / SR) * np.exp(-t / 0.8)
    crash = hp(rng.standard_normal(n), 3000) * np.exp(-t / 0.9) * 0.35
    return np.tanh(boom * 1.5) + crash

# --- harmony: Am F C G (A mol, povzbudivé) ---
CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
def chord_at(t): return CHORDS[int(t // 2) % 4]

def pad(t0, t1, gain):
    n = at(t1 - t0); out = np.zeros(n)
    for b in range(int(t0 // 2), int(np.ceil(t1 / 2))):
        s, e = max(b * 2, t0), min(b * 2 + 2, t1)
        m = at(e - s); seg = np.zeros(m)
        for mid in CHORDS[b % 4]:
            for det in (-0.12, 0, 0.12):
                seg += saw(note(mid + 12) * 2 ** (det / 12), m, rng.random())
        fade = np.minimum(1, np.minimum(np.arange(m), m - np.arange(m)) / (SR * 0.02))
        out[at(s - t0): at(s - t0) + m] += seg * fade
    return lp(out, 2200) * gain / 9

def bass(t0, t1):
    out = np.zeros(at(t1 - t0))
    t = t0
    while t < t1 - 1e-6:
        root = chord_at(t)[0] - 12
        n = at(0.25); s = saw(note(root), n) + 0.5 * saw(note(root) * 1.005, n)
        s = lp(s, 700) * env(n, 0.004, 0.18)
        i = at(t - t0); out[i:i + n] += s[: len(out) - i]
        t += 0.25
    return out * 0.55

def arp(t0, t1):
    out = np.zeros(at(t1 - t0)); t = t0; k = 0
    while t < t1 - 1e-6:
        c = chord_at(t); mid = (c + [c[0] + 12])[[0, 1, 2, 3, 2, 1, 2, 3][k % 8]] + 12
        n = at(0.2); s = (saw(note(mid), n) * 0.6 + np.sin(2 * np.pi * note(mid) * 2 * np.arange(n) / SR) * 0.4)
        s = lp(s, 3500) * env(n, 0.002, 0.07)
        i = at(t - t0); out[i:i + n] += s[: len(out) - i]
        t += 0.125; k += 1
    return out * 0.22


# ---------- teplé SFX (A mol pentatonika, krátky room reverb) ----------
def marimba(f, dur=0.4, bright=0.35):
    n = at(dur); t = np.arange(n) / SR
    tone = (np.sin(2 * np.pi * f * t) + bright * np.sin(2 * np.pi * f * 4 * t) * np.exp(-t / 0.03)
            + 0.2 * np.sin(2 * np.pi * f * 10 * t) * np.exp(-t / 0.008))
    return tone * env(n, 0.002, dur / 3.5)
def woodblock(f=1000, dur=0.12):
    n = at(dur); t = np.arange(n) / SR
    return (np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 2.7 * t)) * env(n, 0.001, 0.025)
def room(x, mix=0.14, size=0.09):
    r = np.random.default_rng(3); ir_n = at(size * 4)
    ir = r.standard_normal(ir_n) * np.exp(-np.arange(ir_n) / (SR * size))
    wet = np.convolve(x, ir)[: len(x) + ir_n - 1]
    return np.pad(x, (0, len(wet) - len(x))) + mix * wet / (np.abs(wet).max() + 1e-9) * np.abs(x).max()
def seq(*parts):
    end = max(at(o) + len(s) for o, s in parts); out = np.zeros(end)
    for o, s in parts: out[at(o):at(o) + len(s)] += s
    return out
A4, C5, D5, E5, G5, A5, C6 = (note(m) for m in (69, 72, 74, 76, 79, 81, 84))
def pop(f=G5): return room(marimba(f, 0.3, 0.5))
def reveal(root=A4): return room(seq((0, marimba(root, 0.6)), (0.07, marimba(root * 1.189, 0.6)), (0.14, marimba(root * 1.498, 0.7)), (0.21, marimba(root * 2, 0.9))))
def hopup(): return room(seq((0, marimba(C5, 0.25)), (0.08, marimba(G5, 0.35))))
def softwhoosh(dur=0.5):
    n = at(dur); x = lp(rng.standard_normal(n), 1800)
    return x * np.sin(np.pi * np.arange(n) / n) ** 2 * 1.6
def sparkle():
    return room(seq(*[(i * 0.045, marimba([C6, A5, G5, E5, D5, C6, A5, E5][i] * 2, 0.25, 0.2) * 0.5) for i in range(8)]), 0.3)

SFX = [
    (3.0, reveal(A4), .35), (3.85, pop(E5), .5), (6.3, softwhoosh(), .5),
    (6.9, woodblock(1100), .25), (8.3, woodblock(1100), .25), (9.6, woodblock(1100), .25), (10.9, woodblock(1300), .25),
    (7.0, pop(E5), .55), (7.6, pop(G5), .55), (8.8, pop(A5), .55),
    (11.3, hopup(), .5), (11.9, softwhoosh(0.45), .6), (13.35, reveal(A4 * 2), .5), (13.5, sparkle(), .45),
    (15.2, hopup(), .45), (15.55, woodblock(900), .3), (15.85, woodblock(1200), .3),
    (16.1, woodblock(1600, .06), .12), (17.05, woodblock(1600, .06), .12), (18.55, woodblock(1600, .06), .12),
    (16.55, pop(E5), .5), (17.0, pop(A5), .5), (17.5, pop(E5), .5), (18.25, pop(A5), .5), (19.0, pop(G5), .5),
    (19.85, softwhoosh(0.4), .7), (21.4, woodblock(1000), .3), (22.8, woodblock(1000), .3),
    (23.75, reveal(A4 / 2), .6), (24.6, pop(C5), .45), (24.95, pop(E5), .45), (25.3, pop(A5), .45),
    (26.4, seq((0, marimba(A4, .3)), (.1, marimba(C5, .3)), (.2, marimba(E5, .3)), (.3, marimba(G5, .3)), (.4, marimba(A5, .5))), .45),
    (28.2, room(seq((0, marimba(E5, 0.4)), (0.09, marimba(A5, 0.5)))), .5), (28.75, pop(A4), .45),
]

for V2 in (False, True):
    L = np.zeros(N); R = np.zeros(N)
    # Sidechain: všetko okrem bicích „pumpuje“ s kopákom.
    duck = np.ones(N)
    def mark_kick(t):
        i = at(t); n = at(0.4); x = np.arange(n) / n
        duck[i:i + n] = np.minimum(duck[i:i + n], 0.25 + 0.75 * np.sin(x * np.pi / 2))

    music_L = np.zeros(N); music_R = np.zeros(N)
    def madd(sig, t, gain=1.0, pan=0.0):
        i = at(t); j = min(N, i + len(sig)); s = sig[: j - i] * gain
        music_L[i:j] += s * (1 - max(pan, 0)); music_R[i:j] += s * (1 + min(pan, 0))

    # 0–4 s: hook, údery na slová
    for t in (0.0, 0.5, 1.5, 2.0):
        add(kick(), t, 0.9); mark_kick(t)
    add(lp(riser(2.0), 3000) if V2 else riser(2.0), 2.0, 0.2 if V2 else 0.5)
    madd(pad(0, 4, 0.6), 0)
    # 4–24 s: hlavný groove
    for i in range(int(4 / BEAT), int(24 / BEAT)):
        t = i * BEAT
        add(kick(), t, 0.95); mark_kick(t)
        if i % 2: add(clap(), t, 0.45, 0.1)
        add(hat(), t + 0.25, 0.25, -0.2)
        add(hat(), t + 0.125, 0.1, 0.3); add(hat(), t + 0.375, 0.1, 0.3)
    madd(pad(4, 24, 0.55), 4)
    madd(bass(4, 24), 4)
    madd(arp(6, 24), 6, 1.0, 0.25)
    if not V2:
        for t in (6, 12, 16, 20):
            add(whoosh(0.5), t - 0.3, 0.5)
    else:
        for t, sig, g in SFX:
            add(sig, t, g * (3.0 if 4 <= t < 24 else 1.4), 0.0)  # v groove musia prebiť bicie
    # 24–27 s: breakdown (Bezpečne) + riser
    madd(pad(24, 27, 0.7), 24)
    add(lp(riser(3.0), 3000) if V2 else riser(3.0), 24, 0.3 if V2 else 0.8)
    for i in range(8): add(kick(), 25.5 + i * 0.1875 / 1.5, 0.2 + i * 0.07); mark_kick(25.5 + i * 0.125)
    # 27–30 s: logo — dopad a doznievanie
    add(impact(), 27, 0.9); mark_kick(27)
    madd(pad(27, 30, 0.7), 27)
    madd(arp(27, 29), 27, 0.8, 0.25)
    for i in range(4): add(kick(), 27 + i * 0.5, 0.8)

    L += music_L * duck; R += music_R * duck
    # master: jemná saturácia + fade-out
    fade = np.ones(N); fl = at(1.2); fade[-fl:] = np.linspace(1, 0, fl) ** 2
    mix = np.stack([L, R], 1) * fade[:, None]
    mix = np.tanh(mix * 0.9)
    mix /= np.abs(mix).max() * 1.05
    out = os.path.join(os.path.dirname(__file__), 'music-v2.wav' if V2 else 'music.wav')
    with wave.open(out, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((mix * 32767).astype('<i2').tobytes())
    print('Hotovo:', out)
