"""One still of a true isometric room, for comparison: diamond floor in our stone colours, two back walls,
the `lean` props and a wizard. A picture only; nothing in the game draws this way.

  python tools/art-trial/iso-still.py <wizard-sheet.png>     (game/scripts/wizard-sheet.mjs writes the sheet)

Writes img/iso-still.png at 3x.
"""
import math, os, sys
import numpy as np
from PIL import Image
from imgops import hexrgb, noise, rand2, trim

HERE = os.path.dirname(os.path.abspath(__file__))
PROPS = os.path.join(HERE, '../../game/content/assets/props')
TW, TH = 32, 16  # a tile's diamond
N = 11  # tiles a side
W, H = 400, 300
OX, OY = W // 2, 92
STONE = ['#3e483c', '#4a5446', '#58614f', '#67705c']
JOINT = '#181c1a'
WALL = ['#868c9a', '#6c7280', '#555a68', '#40434f', '#2c2e38']
OUT = (0x12, 0x0E, 0x1A)

canvas = np.zeros((H, W, 3), np.uint8)
canvas[:] = hexrgb('#0e1712')


def iso(i, j):
    return OX + (i - j) * TW / 2, OY + (i + j) * TH / 2


def tile(i, j):
    cx, top = iso(i, j)
    col = hexrgb(STONE[int(rand2(i, j, 3) * 4)])
    dark = tuple(int(c * 0.82) for c in col)
    for y in range(TH):
        half = (y + 0.5) * 2 if y < TH / 2 else (TH - y - 0.5) * 2
        for x in range(int(cx - half), int(cx + half)):
            edge = x <= cx - half + 1 or x >= cx + half - 2
            shade = dark if rand2(x // 3, (int(top) + y) // 2, 9) > 0.8 else col
            canvas[int(top) + y, x] = hexrgb(JOINT) if edge else shade


def wall_run(along_i):
    """A back wall one tile thick in spirit: columns rising from the diamond's far edges."""
    Hh = 44
    for k in range(N * TW // 2):
        x = OX + (k if along_i else -k)
        base = OY + k // 2
        for z in range(Hh):
            y = base - z
            n = noise(1, 1, 1)
            course = ((z // 6) + (k // 11 + z // 6) % 2 * 0) % 2
            brick = (k + (z // 6) % 2 * 6) % 12 == 0 or z % 6 == 0
            col = WALL[4] if brick else WALL[(1 if along_i else 2) + int(rand2(k // 12, z // 6, 4) * 2)]
            canvas[y, x] = hexrgb(col)
        canvas[base - Hh, x] = hexrgb(WALL[0])
        canvas[base - Hh - 1, x] = OUT


for i in range(N):
    for j in range(N):
        tile(i, j)
wall_run(True)
wall_run(False)

im = Image.fromarray(canvas, 'RGB').convert('RGBA')


def sprite(name, flip=False):
    a = Image.open(os.path.join(PROPS, name, 'lean.png')).convert('RGBA')
    return a.transpose(Image.FLIP_LEFT_RIGHT) if flip else a


def wizard(sheet):
    """Today's wizard, facing down-left, out of the sheet (4x, on a flat background)."""
    s = Image.open(sheet).convert('RGBA')
    c = s.crop((34 * 4, 0, 68 * 4, 50 * 4)).resize((34, 50), Image.NEAREST)
    a = np.array(c)
    a[(a[:, :, :3] == hexrgb('#3e483c')).all(axis=2)] = 0
    return Image.fromarray(trim(a), 'RGBA')


# id, tile i, j, mirrored. Back walls are i = 0 (left side on screen goes down j) and j = 0.
PLACED = [
    ('bookshelf', 1.0, 0.4, False), ('bookshelf-crimson', 3.4, 0.4, False), ('clock', 5.2, 0.4, False), ('potion-shelf', 7.2, 0.4, False),
    ('bookshelf-mixed', 0.4, 1.4, True), ('bookshelf-flip', 0.4, 3.8, False), ('banner-red', 0.3, 6.0, True),
    ('throne', 2.0, 8.6, False), ('lectern', 4.8, 3.2, False), ('desk', 6.8, 4.2, False), ('desk', 6.8, 7.2, False), ('cauldron', 2.2, 5.6, False),
    ('chest', 9.3, 1.6, False), ('armillary', 9.4, 9.2, False), ('crystal-ball', 5.0, 9.4, False),
]
items = []
for pid, i, j, flip in PLACED:
    s = sprite(pid, flip)
    x, y = iso(i, j)
    items.append((i + j, s, int(x - s.width / 2), int(y + TH / 2 - s.height + 4)))
circle = sprite('rune-circle')
x, y = iso(5.2, 6.2)
im.paste(circle, (int(x - circle.width / 2), int(y - circle.height / 2 + 8)), circle)
wz = wizard(sys.argv[1])
x, y = iso(4.2, 5.2)
items.append((9.4, wz, int(x - wz.width / 2), int(y + 8 - wz.height)))
for _, s, x, y in sorted(items, key=lambda t: t[0]):
    im.paste(s, (x, y), s)

box = (20, 20, 380, 285)
c = im.crop(box)
c.resize((c.width * 3, c.height * 3), Image.NEAREST).save(os.path.join(HERE, 'img/iso-still.png'), optimize=True)
print('wrote img/iso-still.png')
