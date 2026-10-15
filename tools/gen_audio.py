"""
Procedural audio generator for Sthira.

Every file is synthesised from scratch (no third-party recordings), so the app ships
with zero licensing questions. Loops are made seamless by rendering a little extra and
cross-fading the tail into the head. Replace any file with a real recording later —
just keep the same filename or update data/sounds.json.

Run:  python3 tools/gen_audio.py      (needs numpy + scipy)
"""
import os
import wave
import numpy as np
from scipy.signal import butter, sosfilt

SR = 22050          # plenty for ambient beds, keeps the app small
LOOP = 30.0         # seconds per loop (every LFO period divides this exactly)
XF = 2.0            # cross-fade seconds used to make the loop seamless
rng = np.random.default_rng(7)
OUT = os.path.join(os.path.dirname(__file__), '..', 'audio')


# ----------------------------------------------------------------- helpers
def n(sec):
    return int(sec * SR)


def t_axis(sec):
    return np.arange(n(sec)) / SR


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], btype='band', fs=SR, output='sos'), x)


def lp(x, f, order=2):
    return sosfilt(butter(order, f, btype='low', fs=SR, output='sos'), x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, btype='high', fs=SR, output='sos'), x)


def white(sec):
    return rng.standard_normal(n(sec))


def pink(sec):
    # Paul Kellet's refined pink filter
    w = white(sec)
    b = np.zeros(7)
    out = np.empty_like(w)
    for i, v in enumerate(w):
        b[0] = 0.99886 * b[0] + v * 0.0555179
        b[1] = 0.99332 * b[1] + v * 0.0750759
        b[2] = 0.96900 * b[2] + v * 0.1538520
        b[3] = 0.86650 * b[3] + v * 0.3104856
        b[4] = 0.55000 * b[4] + v * 0.5329522
        b[5] = -0.7616 * b[5] - v * 0.0168980
        out[i] = b[0] + b[1] + b[2] + b[3] + b[4] + b[5] + b[6] + v * 0.5362
        b[6] = v * 0.115926
    return out


def brown(sec):
    w = white(sec) * 0.02
    out = np.empty_like(w)
    acc = 0.0
    for i, v in enumerate(w):
        acc = 0.998 * acc + v
        out[i] = acc
    return out


def norm(x, peak=0.6):
    m = np.max(np.abs(x)) or 1
    return x / m * peak


def seamless(x, loop=LOOP):
    """x must be loop+XF long; fold the extra tail over the head with an equal-power fade."""
    L, F = n(loop), n(XF)
    out = x[:L].copy()
    tail = x[L:L + F]
    k = np.linspace(0, 1, F)
    out[:F] = out[:F] * np.sin(k * np.pi / 2) + tail * np.cos(k * np.pi / 2)
    return out


def events(sec, rate, fn):
    """Scatter sound events (rate per second) over a buffer."""
    buf = np.zeros(n(sec))
    count = rng.poisson(rate * sec)
    for _ in range(count):
        ev = fn()
        s = rng.integers(0, max(1, len(buf) - len(ev)))
        buf[s:s + len(ev)] += ev
    return buf


def write(path, x, stereo=False):
    path = os.path.join(OUT, path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if stereo:
        data = np.clip(x, -1, 1)
        pcm = (data.T.reshape(-1) * 32767).astype(np.int16)  # interleave L,R
    else:
        pcm = (np.clip(x, -1, 1) * 32767).astype(np.int16)
    with wave.open(path, 'wb') as w:
        w.setnchannels(2 if stereo else 1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(f'{path}  {os.path.getsize(path) // 1024} KB')


S = LOOP + XF  # render length before folding


# ----------------------------------------------------------------- noise colours
def white_noise():
    return norm(lp(white(S), 9000), 0.35)


def pink_noise():
    return norm(pink(S), 0.45)


def brown_noise():
    return norm(hp(brown(S), 20), 0.6)


# ----------------------------------------------------------------- nature
def drop():
    d = rng.uniform(0.004, 0.012)
    k = np.exp(-t_axis(d * 6) / d)
    f = rng.uniform(1800, 5200)
    return np.sin(2 * np.pi * f * t_axis(d * 6) * (1 - 0.3 * t_axis(d * 6) / (d * 6))) * k * rng.uniform(0.2, 1)


def rain():
    bed = hp(pink(S), 500) * 0.5 + lp(white(S), 7000) * 0.15
    drops = events(S, 55, drop) * 0.6
    return norm(bed + drops, 0.55)


def thunderstorm():
    r = rain() * 0.9
    rumble = np.zeros(n(S))
    for start in (4.0, 17.5):  # two distant rolls per loop
        L = rng.uniform(5, 7)
        env = np.zeros(n(L))
        tt = t_axis(L)
        env = (1 - np.exp(-tt / 0.4)) * np.exp(-tt / (L / 3)) * (1 + 0.5 * np.sin(2 * np.pi * 1.3 * tt))
        burst = lp(brown(L), 160, 4) * env
        s = n(start)
        rumble[s:s + len(burst)] += burst[: len(rumble) - s]
    return norm(r + norm(rumble, 0.6), 0.6)


def ocean():
    t = t_axis(S)
    swell = 0.55 + 0.45 * np.sin(2 * np.pi * t / 7.5) ** 2      # one wave every 7.5 s (4 per loop)
    wash = lp(pink(S), 900) * swell + hp(white(S), 1500) * 0.08 * swell ** 3
    return norm(wash, 0.55)


def wind():
    t = t_axis(S)
    x = white(S)
    lo = bp(x, 150, 500, 2) * (0.6 + 0.4 * np.sin(2 * np.pi * t / 10))
    hi = bp(x, 500, 1400, 2) * (0.4 + 0.4 * np.sin(2 * np.pi * t / 6 + 1)) * 0.5
    gust = 0.7 + 0.3 * np.sin(2 * np.pi * t / 15) ** 2
    return norm((lo + hi) * gust, 0.5)


def bubble():
    d = rng.uniform(0.02, 0.06)
    tt = t_axis(d)
    f0 = rng.uniform(400, 1300)
    return np.sin(2 * np.pi * (f0 * tt + 4000 * tt ** 2)) * np.sin(np.pi * tt / d) * rng.uniform(0.1, 0.5)


def river():
    bed = bp(pink(S), 200, 2500) * 0.8 + lp(brown(S), 300) * 0.4
    return norm(bed + events(S, 18, bubble) * 0.5, 0.55)


def flowing_water():
    bed = bp(white(S), 900, 4500) * 0.25
    return norm(bed + events(S, 40, bubble) * 0.8, 0.5)


def chirp():
    # a small songbird phrase: 2-5 quick upward/downward FM notes
    out = []
    for _ in range(rng.integers(2, 6)):
        d = rng.uniform(0.05, 0.14)
        tt = t_axis(d)
        f0 = rng.uniform(2500, 4200)
        sweep = rng.uniform(-1500, 2000)
        tone = np.sin(2 * np.pi * (f0 * tt + sweep * tt ** 2 / (2 * d)))
        out.append(tone * np.sin(np.pi * tt / d) ** 2)
        out.append(np.zeros(n(rng.uniform(0.03, 0.09))))
    return np.concatenate(out) * rng.uniform(0.15, 0.5)


def forest():
    bed = wind() * 0.35 + lp(pink(S), 700) * 0.15
    return norm(bed + events(S, 0.45, chirp), 0.5)


def cricket():
    # three pulses at ~4.6 kHz, repeated a few times
    f = rng.uniform(4300, 4900)
    pulse = np.sin(2 * np.pi * f * t_axis(0.018)) * np.hanning(n(0.018))
    gap = np.zeros(n(0.022))
    trill = np.concatenate([pulse, gap] * 3 + [np.zeros(n(0.25))])
    return np.tile(trill, rng.integers(2, 5)) * rng.uniform(0.1, 0.35)


def crickets():
    bed = lp(brown(S), 400) * 0.2 + bp(white(S), 1000, 3000) * 0.02
    return norm(bed + events(S, 3.0, cricket), 0.45)


def crackle():
    d = rng.uniform(0.002, 0.02)
    return bp(white(d * 4), 900, 6000) * np.exp(-t_axis(d * 4) / d) * rng.uniform(0.2, 1.2)


def fireplace():
    t = t_axis(S)
    roar = lp(brown(S), 250) * (0.8 + 0.2 * np.sin(2 * np.pi * t / 5))
    return norm(norm(roar, 0.5) + events(S, 9, crackle) * 0.9, 0.55)


def bell(f0=523.25, L=7.0):
    tt = t_axis(L)
    partials = [(0.5, 0.6, 4.0), (1.0, 1.0, 3.2), (2.0, 0.5, 1.8), (2.76, 0.35, 1.4), (5.4, 0.18, 0.7), (8.93, 0.08, 0.4)]
    x = sum(a * np.sin(2 * np.pi * f0 * r * tt) * np.exp(-tt / d) for r, a, d in partials)
    return x * (1 - np.exp(-tt / 0.003))


def temple_bells():
    buf = lp(pink(S), 500) * 0.04
    for start, f in ((1.0, 587.33), (9.0, 659.25), (16.5, 523.25), (24.0, 783.99)):
        b = bell(f) * 0.5
        s = n(start)
        e = min(len(buf), s + len(b))
        buf[s:e] += b[: e - s]
    return norm(buf, 0.55)


# ----------------------------------------------------------------- relaxation tones
def drone(freqs, L=S, breath=10.0):
    t = t_axis(L)
    x = np.zeros(n(L))
    for i, (f, a) in enumerate(freqs):
        x += a * (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * 2 * f * t + i) + 0.12 * np.sin(2 * np.pi * 3 * f * t))
    swell = 0.75 + 0.25 * np.sin(2 * np.pi * t / breath)
    return lp(x * swell, 2500)


def om_drone():
    # 136.1 Hz is the traditional "Om" tuning; fifth + octave for warmth
    return norm(drone([(136.1, 1.0), (204.15, 0.35), (272.2, 0.3), (68.05, 0.5)]), 0.5)


def tanpura():
    # Sa–Pa–Sa'–Sa tanpura-style drone (C# base), plucked every 1.5 s
    base = 138.59
    seq = [base * 1.5, base * 2, base * 2, base]
    buf = np.zeros(n(S))
    for k in range(int(S / 1.5) + 1):
        f = seq[k % 4]
        L = 6.0
        tt = t_axis(L)
        note = sum((0.9 ** h) * np.sin(2 * np.pi * f * h * tt * (1 + 0.0004 * h)) for h in range(1, 9)) * np.exp(-tt / 2.2)
        s = n(k * 1.5)
        e = min(len(buf), s + len(note))
        buf[s:e] += note[: e - s] * 0.25
    return norm(lp(buf, 3000), 0.5)


def warm_pad():
    return norm(drone([(110, 1.0), (164.81, 0.6), (220, 0.4), (277.18, 0.25)], breath=15), 0.45)


def binaural(base, beat):
    t = t_axis(S)
    L = np.sin(2 * np.pi * base * t)
    R = np.sin(2 * np.pi * (base + beat) * t)
    bed = lp(pink(S), 600) * 0.05
    return np.vstack([norm(L, 0.3) + bed, norm(R, 0.3) + bed])


# ----------------------------------------------------------------- breathing cues
def cue(f0, f1, L=0.9):
    tt = t_axis(L)
    f = np.linspace(f0, f1, len(tt))
    ph = 2 * np.pi * np.cumsum(f) / SR
    env = np.sin(np.pi * tt / L) ** 2
    return norm((np.sin(ph) + 0.25 * np.sin(2 * ph)) * env, 0.35)


if __name__ == '__main__':
    loops = {
        'rain': rain, 'thunderstorm': thunderstorm, 'ocean': ocean, 'forest': forest, 'river': river,
        'crickets': crickets, 'fireplace': fireplace, 'temple-bells': temple_bells, 'flowing-water': flowing_water,
        'wind': wind, 'white-noise': white_noise, 'pink-noise': pink_noise, 'brown-noise': brown_noise,
    }
    for name, fn in loops.items():
        write(f'loops/{name}.wav', seamless(fn()))
    for name, fn in {'om-drone': om_drone, 'tanpura': tanpura, 'warm-pad': warm_pad}.items():
        write(f'tones/{name}.wav', seamless(fn()))
    for name, (base, beat) in {'binaural-alpha': (200, 10), 'binaural-theta': (180, 6)}.items():
        st = binaural(base, beat)
        write(f'tones/{name}.wav', np.vstack([seamless(st[0]), seamless(st[1])]), stereo=True)
    write('cues/inhale.wav', cue(392, 523.25))
    write('cues/exhale.wav', cue(523.25, 349.23, 1.1))
    write('cues/bell.wav', norm(bell(440, 5.0), 0.4))
