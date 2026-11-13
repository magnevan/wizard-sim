"""The rings' engraved band, as a height map for Blender (tools/well-3d/rings.py). No generation calls.

  python tools/well-3d/band_texture.py        -> tools/well-3d/build/band-height.png

u runs round the ring, v across its outer face. As the user read the bought rings (2026-11-13): a clean plain border
along the top and the bottom, and between them an intricate dense pattern, cut at two fixed depths with sharp steps
(smooth depth read soft). Here: a three-strand braid standing at the surface, the ground between cut down, the strands
over and under each other, a drilled dot in each gap. The pattern repeats a whole number of times round the ring, and
the spin loops after one repeat.
"""
import math, os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'build')
CIRC_PX, BAND_PX = 236, 7       # art pixels round the ring and across its face
TPX = 8                         # texels per art pixel
U, V = CIRC_PX * TPX, BAND_PX * TPX
BORDER = 1.15                   # art px of plain border each side
BRAID_PERIOD = 236 / 24         # art px per braid repeat: coarse enough that a strand is a couple of art px
SURFACE, CUT = 1.0, 0.3         # the two depths

u = (np.arange(U) + 0.5) / TPX
v = (np.arange(V) + 0.5) / TPX
uu, vv = np.meshgrid(u, v)
lo, hi = BORDER, BAND_PX - BORDER
mid, amp = (lo + hi) / 2, (hi - lo) / 2 - 0.45
chan = (vv > lo) & (vv < hi)
h = np.where(chan, CUT, SURFACE)
k = 2 * math.pi / BRAID_PERIOD
best = np.full(h.shape, -9.0)     # the strand on top at each texel, by how far it has risen
for s in range(3):
    ph = k * uu + s * 2 * math.pi / 3
    d = np.abs(vv - (mid + amp * np.sin(ph)))
    top = np.cos(ph)
    strand = (d < 0.6) & chan
    h = np.where(strand & (top > best), SURFACE, h)
    # where a strand passes under another, a cut line either side of the one on top
    edge = (d >= 0.6) & (d < 0.95) & chan & (top > best)
    h = np.where(edge, CUT, h)
    best = np.where(strand | edge, np.maximum(best, top), best)
gap = ((k * uu) % (2 * math.pi / 3)) - math.pi / 3
dot = chan & (np.hypot(gap / k, vv - mid) < 0.5) & (best < -0.5)
h[dot] = CUT
os.makedirs(OUT, exist_ok=True)
Image.fromarray((h * 255).astype(np.uint8)).save(os.path.join(OUT, 'band-height.png'))
print('band', h.shape, 'braid repeats', CIRC_PX / BRAID_PERIOD)
