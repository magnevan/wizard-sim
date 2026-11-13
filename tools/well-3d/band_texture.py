"""The rings' engraved band, as a height map for Blender (tools/well-3d/rings.py). No generation calls.

  python tools/well-3d/band_texture.py        -> tools/well-3d/build/band-height.png

u runs round the ring, v across its outer face. As the user read the bought rings (2026-11-13): a clean plain border
along the top and the bottom, and between them an intricate dense pattern, as on an engraved band ring. Here: a
three-strand braid carved as grooves, the strands over and under each other, with a drilled dot in each gap. Random
speckle read as dirt, so everything is structured. The pattern repeats a whole number of times round the ring, and the
spin loops after one repeat.
"""
import math, os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'build')
CIRC_PX, BAND_PX = 236, 7       # art pixels round the ring and across its face
TPX = 8                         # texels per art pixel
U, V = CIRC_PX * TPX, BAND_PX * TPX
REPEAT = 4                      # the spin loops after a quarter turn
BORDER = 1.15                   # art px of plain border each side
BRAID_PERIOD = 236 / 24         # art px per braid repeat: coarse enough that a strand is a couple of art px

u = (np.arange(U) + 0.5) / TPX          # art px round the ring
v = (np.arange(V) + 0.5) / TPX          # art px across
uu, vv = np.meshgrid(u, v)
h = np.full((V, U), 0.8)
lo, hi = BORDER, BAND_PX - BORDER
mid, amp = (lo + hi) / 2, (hi - lo) / 2 - 0.35
# the channel sits a touch lower than the borders, so the borders read as clean raised bands
chan = (vv > lo) & (vv < hi)
h[chan] = 0.62
h[~chan] = 0.95
# the border's inner edge: a crisp step down
step = (np.abs(vv - lo) < 0.25) | (np.abs(vv - hi) < 0.25)
h[step] = 0.4
# three strands, a third of a period apart; each is a groove's two edges with the strand raised between
k = 2 * math.pi / BRAID_PERIOD
over = np.zeros_like(h)
for s in range(3):
    ph = k * uu + s * 2 * math.pi / 3
    centre = mid + amp * np.sin(ph)
    d = np.abs(vv - centre)
    # which strand is on top here: the one rising (cos > 0) passes over
    top = np.cos(ph)
    strand = (d < 0.55) & chan
    edge = (d >= 0.55) & (d < 0.95) & chan
    h = np.where(edge & (over <= top), 0.18, h)
    h = np.where(strand & (top > over - 0.2), 0.78 + 0.1 * top, h)
    over = np.where(strand, np.maximum(over, top), over)
# a drilled dot in each gap between crossings, at the middle
gap = ((k * uu) % (2 * math.pi / 3)) - math.pi / 3
dot = chan & (np.hypot(gap / k, vv - mid) < 0.45) & (over < -0.5)
h[dot] = 0.12
os.makedirs(OUT, exist_ok=True)
Image.fromarray((np.clip(h, 0, 1) * 255).astype(np.uint8)).save(os.path.join(OUT, 'band-height.png'))
Image.fromarray(np.zeros((8, 8), np.uint8)).save(os.path.join(OUT, 'band-patina.png'))
print('band', h.shape, 'braid repeats', CIRC_PX / BRAID_PERIOD)
