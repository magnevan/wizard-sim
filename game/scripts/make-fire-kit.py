"""
Makes Fire's sound kit: real bonfire recordings slowed and reshaped, with a synthesised low layer under
them, written to content/audio/sources/made/ for npm run audio:bank to tune. Same seed, same files.

    python scripts/make-fire-kit.py

Each clip names the balance it aims for: its share of energy below 150 Hz, 150-800, 800-3000 and above.
A flame is low: most of it sits under 800 Hz, and a flamethrower has no crackle in it at all.
"""
import os
import subprocess
import numpy as np
from scipy.signal import butter, sosfiltfilt, resample_poly

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '../content/audio/sources/commons-fire')
OUT = os.path.join(HERE, '../content/audio/sources/made')
SR = 44100
EDGES = [38, 150, 800, 3000, SR / 2]  # nothing below the first edge counts: it can't be heard
rng = np.random.default_rng(7)


def load(name, start, dur, rate=1.0):
    """A stretch of a recording, slowed by `rate` (0.6 is a tape at 60% speed: lower and bigger)."""
    p = os.path.join(SRC, name)
    b = subprocess.run(['ffmpeg', '-v', 'error', '-ss', str(start), '-t', str(dur), '-i', p, '-ac', '1', '-ar', str(SR), '-f', 'f32le', 'pipe:1'], capture_output=True, check=True).stdout
    x = np.frombuffer(b, '<f4').astype(np.float64)
    if rate != 1.0:
        x = resample_poly(x, int(round(1000 / rate)), 1000)
    return x


def band(x, lo=None, hi=None, order=4):
    if lo and hi:
        return sosfiltfilt(butter(order, [lo, hi], 'bandpass', fs=SR, output='sos'), x)
    return sosfiltfilt(butter(order, lo or hi, 'highpass' if lo else 'lowpass', fs=SR, output='sos'), x)


def declick(x, over=2.2):
    """Crackle out: anything far above the running level is pulled down to it. What's left is the roar."""
    w = int(SR * 0.004)
    env = np.sqrt(np.convolve(x * x, np.ones(w) / w, 'same')) + 1e-9
    slow = np.sqrt(np.convolve(x * x, np.ones(w * 50) / (w * 50), 'same')) + 1e-9
    return x * np.minimum(1, over * slow / env)


def noise(n, tilt=1.0):
    """Coloured noise. It's periodic, so it loops by itself. tilt 1 is brown, 0.5 pink."""
    f = np.fft.rfftfreq(n, 1 / SR)
    f[0] = f[1]
    s = (rng.normal(size=f.size) + 1j * rng.normal(size=f.size)) / f ** tilt
    x = np.fft.irfft(s, n)
    return x / x.std()


def flutter(n, rate=18.0, depth=0.5, gust=0.25):
    """A flame's turbulence: quick uneven puffs on top of slow gusts, as a gain around 1."""
    e = np.zeros(n)
    t = 0
    while t < n:
        e[int(t)] += rng.uniform(0.4, 1.0)
        t += rng.exponential(SR / rate) + SR / (rate * 3)
    k = np.exp(-np.arange(int(SR * 0.05)) / (SR * 0.014))
    e = np.convolve(e, k, 'same')
    e = (e - e.mean()) / (e.std() + 1e-9)
    slow = band(noise(n, 0.0), hi=3.0, order=2)
    slow /= slow.std() + 1e-9
    return np.clip(1 + depth * 0.35 * e + gust * slow, 0.05, 3)


def shares(x):
    p = np.abs(np.fft.rfft(x * np.hanning(len(x)))) ** 2
    f = np.fft.rfftfreq(len(x), 1 / SR)
    p /= p.sum()
    return [100 * p[(f >= a) & (f < b)].sum() for a, b in zip(EDGES, EDGES[1:])]


def balance(x, target):
    """Tilts a sound towards an energy balance, with a smooth curve rather than hard bands."""
    centres = np.log([70, 350, 1500, 7000])
    n = len(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    lf = np.log(np.maximum(f, 20))
    x = band(x, lo=38, order=3)
    for _ in range(8):
        have = np.maximum(shares(x), 0.02)
        g = np.clip(np.sqrt(np.maximum(target, 0.05) / have), 0.05, 12)
        curve = np.exp(np.interp(lf, centres, np.log(g)))
        x = np.fft.irfft(np.fft.rfft(x) * curve, n)
    return x


def env(n, attack, decay, power=1.0):
    t = np.arange(n) / SR
    return np.minimum(1, t / max(attack, 1e-4)) * np.exp(-np.maximum(0, t - attack) / decay) ** power


def steady(x, secs=0.35):
    """Takes the slow swells out of a recording, leaving its quick flutter: a held flame roars, it doesn't surge."""
    w = int(SR * secs)
    e = np.sqrt(np.convolve(x * x, np.ones(w) / w, 'same')) + 1e-6
    return x / e


def rms1(x):
    return x / (np.sqrt((x * x).mean()) + 1e-12)


def save(name, x, floor=35, drive=0):
    x = band(x, lo=floor, order=2)  # anything lower can't be heard, and only eats headroom
    x = x / (np.abs(x).max() + 1e-12)
    if drive:  # thickens a short sound: the same peak, with more weight behind it
        x = np.tanh(x * drive)
    x = x / (np.abs(x).max() + 1e-12) * 0.95
    raw = (x * 32767).astype('<i2').tobytes()
    p = os.path.join(OUT, name + '.ogg')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 's16le', '-ar', str(SR), '-ac', '1', '-i', 'pipe:0', '-c:a', 'libvorbis', '-q:a', '7', p], input=raw, check=True)
    s = shares(x)
    print(f'{name:16s}{len(x) / SR:5.2f}s  <150 {s[0]:3.0f}  150-800 {s[1]:3.0f}  .8-3k {s[2]:3.0f}  3k+ {s[3]:3.0f}')


BURN, IGNITE = 'WWS_Bonfireburning.ogg', 'WWS_Bonfireignition.ogg'
os.makedirs(OUT, exist_ok=True)


def roar(secs, rate, at, depth=0.6, gust=0.05):
    """The body of a flame: the real fire, with its crackle out, over a turbulent low noise."""
    n = int(SR * secs)
    real = steady(declick(load(BURN, at, secs * rate + 0.2, rate))[:n])
    low = band(noise(n, 0.9), hi=420) * flutter(n, 17, depth, gust)
    mid = band(noise(n, 0.5), lo=300, hi=1400) * flutter(n, 23, depth, gust)
    return 0.6 * rms1(real) + 0.75 * rms1(low) + 0.22 * rms1(mid)


# the flamethrower: a held roar, a sub under it, a catch at the start, and a dying breath at the end
save('fire-jet', balance(roar(5.4, 0.6, 22), [65, 26, 6, 3]))
n = int(SR * 5.0)
save('fire-jet-sub', balance(band(noise(n, 0.4), lo=40, hi=110) * flutter(n, 18, 1.0, 0.05), [98, 2, 0, 0]))

whump = load(IGNITE, 7.9, 1.2)  # the fire catching, in the recording: most of it is one low thud
catch = band(load(IGNITE, 10.0, 0.7, 0.75), lo=120)[:int(SR * 0.34)]
save('fire-catch', balance(catch * env(len(catch), 0.01, 0.5), [15, 75, 9, 1]), drive=5)
for i, (at, rate) in enumerate([(24, 0.7), (37, 0.62)], 1):
    n = int(SR * 2.1)
    x = roar(2.1, rate, at, 0.8)
    save(f'fire-die-{i}', balance(x * env(n, 0.01, 0.42), [66, 32, 2, 0]), drive=2)

# a burst of flame: the real catch at three speeds, with a breath of roar behind it
for i, rate in enumerate([0.9, 1.1, 0.72], 1):
    w = load(IGNITE, 7.95, 0.9, rate)
    n = int(SR * 0.8)
    w = np.pad(w, (0, max(0, n - len(w))))[:n]
    x = rms1(w) + 0.7 * rms1(roar(0.8, 0.7, 12 + 3 * i, 0.9))
    save(f'fire-puff-{i}', balance(x * env(n, 0.006, 0.34), [[45, 49, 6, 0], [70, 28, 2, 0], [48, 46, 6, 0]][i - 1]), drive=3)

# a low push and an airy rush, for anything thrown; a thud for anything big
n = int(SR * 1.4)
save('fire-launch', balance(rms1(band(noise(n, 1.0), hi=170)) * env(n, 0.03, 0.3), [92, 7, 1, 0]))
n = int(SR * 1.1)
t = np.arange(n) / SR
sweep = np.zeros(n)
for lo, hi, g, at in [(450, 1300, 1, 0.2), (900, 2200, 0.9, 0.42), (350, 1000, 0.8, 0.72)]:
    sweep += g * band(noise(n, 0.3), lo=lo, hi=hi, order=2) * np.exp(-((t - at) / 0.2) ** 2)
save('fire-rush', balance(sweep * flutter(n, 24, 0.6), [15, 24, 49, 12]), drive=4)
n = int(SR * 0.66)
t = np.arange(n) / SR
save('fire-thud', np.sin(2 * np.pi * np.cumsum(38 + 42 * np.exp(-t / 0.07)) / SR) * env(n, 0.003, 0.2), 20)

# a big one going off: the catch stretched long, and a roar rolling away behind it
for i, rate in enumerate([0.6, 0.72], 1):
    n = int(SR * 2.3)
    w = load(IGNITE, 7.95, 1.4, rate)
    w = np.pad(w, (0, max(0, n - len(w))))[:n]
    x = rms1(w) + 1.1 * rms1(roar(2.3, 0.55, 30 + 7 * i, 1.0) * env(n, 0.02, 0.6))
    save(f'fire-bloom-{i}', balance(x * env(n, 0.008, 0.62), [50, 44, 5, 1]))

# a body on fire: lower, softer and slower than the jet
save('fire-lick', balance(roar(5.2, 0.5, 13, 0.55), [79, 20, 1, 0]))
