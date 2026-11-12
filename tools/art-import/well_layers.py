"""The battery's well, taken apart so the game can animate it: a free local edit of the bought well-top (no generation calls).

  python tools/art-import/well_layers.py

Writes game/content/assets/well/ (art/well-anim.ts reads it):
  drum.png, drum-drained.png   the drum alone: the rings and crystal above it cleared (the rings are drawn in code, and
                               they cover where the drum's back rim was under them)
  crystal.png, crystal-dark.png the crystal alone, where the rings hid it filled from its mirror image, with an outline
  layers.json                  canvas size, where the crystal sits, and the seams' glowing pixels (the runes on the
                               drum's panels and its lit top), for the shimmer
All on the well-top's own canvas, so they share its foot (game/content/assets/props/battery-well-top/meta.json).
"""
import json, os
import numpy as np
from PIL import Image
from well_drained import drain

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '../../game/content/assets/props/battery-well-top/lean.png')
OUT = os.path.join(HERE, '../../game/content/assets/well')

# Where things are on the 104 x 113 canvas (tools: a 7x grid render of lean.png)
DRUM_TOP = 47          # rows from here down are the drum; the ring band above it is cleared
CRYSTAL = {'top': (51, 0), 'left': (39, 19), 'right': (64, 19), 'bottom': (52, 40)}
SEAM_FROM = 49         # glowing pixels from this row down belong to the drum (its top and its runes)

a = np.array(Image.open(SRC).convert('RGBA'))
H, W = a.shape[:2]
rgb = a[:, :, :3].astype(int)
r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
solid = a[:, :, 3] > 0
ys, xs = np.mgrid[0:H, 0:W]


def warm(r, g, b):
    mx = np.maximum(np.maximum(r, g), b); mn = np.minimum(np.minimum(r, g), b)
    sat = (mx - mn) / np.maximum(mx, 1)
    return (r > 170) & (r >= g) & (b < 0.62 * r) & (sat > 0.4)


# ---- the drum
drum = a.copy()
drum[ys < DRUM_TOP] = 0
# what's left of the ring band in the drum's top rows outside the drum's own outline goes too
outside = (ys < 56) & ((xs < 17) | (xs > 86))
drum[outside] = 0

# ---- the crystal: inside the diamond
def inside_diamond(x, y):
    (tx, ty), (lx, ly), (rx, ry), (bx, by) = CRYSTAL['top'], CRYSTAL['left'], CRYSTAL['right'], CRYSTAL['bottom']
    def side(ax, ay, cx, cy, px, py):
        return (cx - ax) * (py - ay) - (cy - ay) * (px - ax)
    s = [side(tx, ty, rx, ry, x, y), side(rx, ry, bx, by, x, y), side(bx, by, lx, ly, x, y), side(lx, ly, tx, ty, x, y)]
    return all(v >= -0.5 for v in s) or all(v <= 0.5 for v in s)

hull = np.array([[inside_diamond(x, y) for x in range(W)] for y in range(H)])
light = (r > 200) & (g > 170) & (b > 110)                       # the cream highlights
cryst = hull & solid & (warm(r, g, b) | light)
cx_mid = (CRYSTAL['left'][0] + CRYSTAL['right'][0]) / 2
crystal = np.zeros_like(a)
crystal[cryst] = a[cryst]
# where a ring crossed it: its mirror pixel, if that one is crystal; else the nearest crystal pixel above
for y in range(H):
    for x in range(W):
        if not hull[y, x] or cryst[y, x]:
            continue
        mx_ = int(round(2 * cx_mid - x))
        if 0 <= mx_ < W and cryst[y, mx_]:
            crystal[y, x] = a[y, mx_]
        else:
            for yy in range(y - 1, -1, -1):
                if cryst[yy, x] or crystal[yy, x, 3]:
                    crystal[y, x] = crystal[yy, x] if crystal[yy, x, 3] else a[yy, x]
                    break
# an outline round it
filled = crystal[:, :, 3] > 0
edge = np.zeros_like(filled)
for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
    edge |= np.roll(np.roll(filled, dy, 0), dx, 1)
edge &= ~filled
edge[-1, :] = edge[:, -1] = edge[:, 0] = False  # np.roll wraps round: nothing from the far edges
edge[0, :] &= filled[1, :]
crystal[edge] = [42, 22, 14, 255]

# ---- the seams: glowing drum pixels, with their colours
seam_mask = solid & (ys >= SEAM_FROM) & warm(r, g, b) & (drum[:, :, 3] > 0)
seams = [[int(x), int(y), *[int(v) for v in a[y, x, :3]], 1 if y < 62 else 0] for y, x in zip(*np.where(seam_mask))]

os.makedirs(OUT, exist_ok=True)
Image.fromarray(drum).save(os.path.join(OUT, 'drum.png'), optimize=True)
Image.fromarray(drain(drum, 0)[0]).save(os.path.join(OUT, 'drum-drained.png'), optimize=True)
Image.fromarray(crystal).save(os.path.join(OUT, 'crystal.png'), optimize=True)
Image.fromarray(drain(crystal, H)[0]).save(os.path.join(OUT, 'crystal-dark.png'), optimize=True)
cy_box = np.where(filled.any(axis=1))[0]
meta = {
    'size': [W, H],
    'crystal': {'cx': cx_mid, 'cy': float((cy_box[0] + cy_box[-1]) / 2), 'bottom': int(cy_box[-1])},
    'drumTop': {'cx': 51.5, 'cy': 55.5, 'rx': 34, 'ry': 8},
    # [x, y, r, g, b, top]: top 1 is the drum's lit top (pulses with the crystal), 0 a rune on a panel (shimmers)
    'seams': seams,
}
json.dump(meta, open(os.path.join(OUT, 'layers.json'), 'w', encoding='utf-8'))
print('well layers:', W, 'x', H, 'crystal px', int(filled.sum()), 'seams', len(seams))
