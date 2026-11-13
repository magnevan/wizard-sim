"""The rings' engraved band, as a height map for Blender (tools/well-3d/rings.py). No generation calls.

  python tools/well-3d/band_texture.py        -> tools/well-3d/build/band-height.png

u runs round the ring, v across its outer face. As the user read the bought rings (2026-11-13): a smooth raised border
along the top and the bottom, a smooth cut line just inside each, and between them an intricate dense pattern cut at two
fixed depths with sharp steps. Here: a three-strand braid, its strands thin (most of the channel is cut down) and a
little irregular, over and under each other, a drilled dot in some gaps. The irregularity repeats every CYCLE braid
repeats, and the pattern REPEAT times round the ring; the spin loops after one REPEAT.
"""
import math, os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'build')
CIRC_PX, BAND_PX = 236, 7       # art pixels round the ring and across its face
TPX = 8                         # texels per art pixel
U, V = CIRC_PX * TPX, BAND_PX * TPX
BORDER, GROOVE = 1.0, 0.55      # art px of raised border each side, and of the cut line inside it
BRAIDS, CYCLE = 12, 2           # braid repeats round the ring (coarse: finer read as noise, the user); the wobble repeats every CYCLE
REPEAT = BRAIDS // CYCLE        # the whole pattern this many times round: the spin's loop is 1/REPEAT of a turn
SURFACE, CUT = 1.0, 0.3
STRAND = 0.55                # a strand's half-width, art px

rng = np.random.default_rng(5)
u = (np.arange(U) + 0.5) / TPX
v = (np.arange(V) + 0.5) / TPX
uu, vv = np.meshgrid(u, v)
period = CIRC_PX / BRAIDS
k = 2 * math.pi / period
lo, hi = BORDER + GROOVE, BAND_PX - BORDER - GROOVE
mid, amp = (lo + hi) / 2, (hi - lo) / 2 - STRAND * 0.8
h = np.full((V, U), CUT)
h[(vv < BORDER) | (vv > BAND_PX - BORDER)] = SURFACE
chan = (vv > lo) & (vv < hi)
# a slow wobble, the same every CYCLE braid repeats: phase, swing and strand width drift a little, so it isn't machine-even
cyc = 2 * math.pi * uu / (period * CYCLE)
wob = [rng.uniform(0, 2 * math.pi, 3) for _ in range(3)]
best = np.full(h.shape, -9.0)
for s in range(3):
    ph = k * uu + s * 2 * math.pi / 3 + 0.35 * np.sin(cyc + wob[s][0])
    sw = amp * (1 + 0.12 * np.sin(cyc + wob[s][1]))
    wd = STRAND * (1 + 0.25 * np.sin(cyc + wob[s][2]))
    d = np.abs(vv - (mid + sw * np.sin(ph)))
    top = np.cos(ph)
    strand = (d < wd) & chan
    h = np.where(strand & (top > best), SURFACE, h)
    best = np.where(strand, np.maximum(best, top), best)
gap = ((k * uu) % (2 * math.pi / 3)) - math.pi / 3
dots = chan & (np.hypot(gap / k, vv - mid) < 0.45) & (best < -0.5) & (np.sin(cyc * 3 + 1.0) > -0.3)
h[dots] = SURFACE
os.makedirs(OUT, exist_ok=True)
Image.fromarray((h * 255).astype(np.uint8)).save(os.path.join(OUT, 'band-height.png'))
print('band', h.shape, 'loop is 1 /', REPEAT, 'turn; raised share of the channel', round(float((h[chan] > 0.5).mean()), 2))
