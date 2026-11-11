"""The bought building kits into the pieces rooms use. No generation calls.

  python tools/art-import/kits.py

Writes game/content/assets/kits/<kit>/{n,w,s,e}.png. n and w are the tall far walls, whose inner faces the camera
sees. s and e are near walls, cut down low so they don't hide the room (the kit draws them full height), with a
capping course across the cut. Raw files in generated/ stay untouched.
"""
import os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, '../../game/content/generated/pixellab/opening')
OUT = os.path.join(HERE, '../../game/content/assets/kits')
KITS = {'academy': 'kit-academy', 'fortification': 'kit-fortification', 'fortress': 'kit-fortress'}
# piece index in the kit: north, west, south, east side of a tile
PIECES = {'n': 1, 'w': 4, 's': 3, 'e': 2}
# how high the near walls stand, art px above their ground line
LOW = 15


def _stone(a):
    """Every opaque pixel of an image array that isn't outline."""
    p = a[a[..., 3] > 0][:, :3].astype(float)
    return p[p.sum(1) > 150]


def tone(a):
    """A fortress kit piece, moved onto the defence towers' average colour and spread, measured piece by piece so a block
    and a wall come out the same. Its outlines lose their green and go the towers' warm black."""
    src = _stone(a)
    dst = _stone(np.array(Image.open(os.path.join(RAW, 'defence', 'tower-clean.png')).convert('RGBA')))
    out = a.copy()
    op = a[..., 3] > 0
    stone = op & (a[..., :3].astype(int).sum(2) > 150)
    out[stone, :3] = np.clip((a[stone, :3].astype(float) - src.mean(0)) / src.std(0) * dst.std(0) + dst.mean(0), 0, 255).astype(np.uint8)
    dark = op & ~stone
    out[dark, 1] = np.minimum(a[dark, 1], (a[dark, 0] * .8).astype(np.uint8))
    out[dark, 2] = np.minimum(a[dark, 2], (a[dark, 0] * .65).astype(np.uint8))
    return out


def base_y(side, x):
    """The near wall's ground line in the 76 x 86 piece: the tile diamond's lower edges."""
    return 67 + (x - 14) / 2 if side == 's' else 67 + (62 - x) / 2


def cut_low(a, side):
    h, w = a.shape[:2]
    op = a[:, :, 3] > 0
    ys, xs = np.nonzero(op)
    top = ys.min()
    # the kit's own cap course is the lightest colour near the top of the piece
    band = a[(ys[ys < top + 8]), (xs[ys < top + 8])][:, :3].astype(int)
    cap = band[np.argsort(band.sum(axis=1))[-len(band) // 3]]
    out = a.copy()
    for x in range(w):
        cut = int(round(base_y(side, x))) - LOW
        column = np.nonzero(op[:, x])[0]
        if not len(column): continue
        out[:cut, x] = 0
        first = max(cut, column.min())
        if first <= column.max():
            out[first: first + 2, x, :3] = cap
            out[first: first + 2, x, 3] = 255
            out[first + 2: first + 3, x, :3] = (a[first + 2, x, :3] * 0.6).astype(np.uint8)
    return out


def main():
    for kit, folder in KITS.items():
        d = os.path.join(OUT, kit)
        os.makedirs(d, exist_ok=True)
        for side, i in PIECES.items():
            a = np.array(Image.open(os.path.join(RAW, folder, f'tile_{i:02d}.png')).convert('RGBA'))
            if kit == 'fortress': a = tone(a)
            if side in 'se': a = cut_low(a, side)
            Image.fromarray(a, 'RGBA').save(os.path.join(d, side + '.png'), optimize=True)
        print(kit, 'done')


if __name__ == '__main__':
    main()
