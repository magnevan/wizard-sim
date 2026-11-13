"""The bought rings' two front bands laid flat, pixel for pixel: each straight stretch is sheared level (every column of
pixels kept exactly as drawn, only moved up or down so the band's middle line is level). Nothing is resampled, so this
is the bought art itself. The middle lines were read off the bought rings by eye (2026-11-13).

  python tools/well-3d/straighten.py <out.png> [k] [rings.png]
"""
import os, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
out = sys.argv[1]
k = int(sys.argv[2]) if len(sys.argv) > 2 else 12
path = sys.argv[3] if len(sys.argv) > 3 else os.path.join(HERE, '../../game/content/assets/well/rings.png')
rings = np.array(Image.open(path).convert('RGBA'))
HALF = 5
# (x from, x to, a point on the middle line, its slope): the band falling left to right, and the one rising
BANDS = [(20, 49, (24, 22.5), 0.818), (54, 84, (56, 41.5), -0.818)]
strips = []
for x0, x1, (px, py), slope in BANDS:
    s = np.zeros((2 * HALF + 1, x1 - x0 + 1, 4), np.uint8)
    for i, x in enumerate(range(x0, x1 + 1)):
        cy = int(round(py + slope * (x - px)))
        for dy in range(-HALF, HALF + 1):
            if 0 <= cy + dy < rings.shape[0]:
                s[dy + HALF, i] = rings[cy + dy, x]
    strips.append(s)
wmax = max(s.shape[1] for s in strips)
gap = np.zeros((2, wmax, 4), np.uint8)
im = np.vstack([np.vstack([np.pad(s, ((0, 0), (0, wmax - s.shape[1]), (0, 0))), gap]) for s in strips])
bg = Image.new('RGBA', (im.shape[1], im.shape[0]), (40, 40, 48, 255))
bg.alpha_composite(Image.fromarray(im))
bg.resize((im.shape[1] * k, im.shape[0] * k), Image.NEAREST).save(out)
print('straightened', out)
