"""The art trial's cleanup step: a generated sheet on flat magenta -> separate props at game scale, on
the game's palette, with hard-edged transparency.

  python tools/art-trial/cleanup.py <sheet.png> <prefix>

General image models draw "pixel art" at about 8 screen pixels per fake pixel, off-grid. Each prop is
cut from the sheet, reduced to its target size (a median per cell keeps outlines better than an
average), and snapped to the palette.
"""
import json, os, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
NAMES = ['lectern', 'bookshelf', 'target', 'circle', 'teacher']
HEIGHT = {'lectern': 34, 'bookshelf': 48, 'target': 36, 'circle': 30, 'teacher': 34}
PAL = [tuple(int(h[k:k + 2], 16) for k in (1, 3, 5)) for h in json.load(open(os.path.join(HERE, 'palette-lock.json')))]


def is_bg(p):
    r, g, b = p[:3]
    return r > 150 and b > 150 and g < 110 and abs(r - b) < 70


def nearest(p):
    return min(PAL, key=lambda q: (p[0] - q[0]) ** 2 * 2 + (p[1] - q[1]) ** 2 * 4 + (p[2] - q[2]) ** 2 * 3)


def median(vals):
    vals = sorted(vals)
    return vals[len(vals) // 2]


def main(path, prefix):
    im = Image.open(path).convert('RGB')
    w, h = im.size
    px = im.load()
    # props are the runs of columns holding something other than magenta
    cols = [sum(0 if is_bg(px[x, y]) else 1 for y in range(0, h, 2)) > 2 for x in range(w)]
    runs, start = [], None
    for x, on in enumerate(cols + [False]):
        if on and start is None: start = x
        if not on and start is not None:
            if x - start > 30: runs.append((start, x))
            start = None
    print(path, 'found', len(runs), 'props')
    for name, (x0, x1) in zip(NAMES, runs):
        ys = [y for y in range(h) if any(not is_bg(px[x, y]) for x in range(x0, x1, 2))]
        y0, y1 = ys[0], ys[-1] + 1
        th = HEIGHT[name]
        tw = max(1, round((x1 - x0) * th / (y1 - y0)))
        if name == 'circle': tw = 54; th = max(1, round((y1 - y0) * 54 / (x1 - x0)))
        sprite = Image.new('RGBA', (tw, th), (0, 0, 0, 0))
        sp = sprite.load()
        for j in range(th):
            for i in range(tw):
                ax, bx = x0 + i * (x1 - x0) // tw, x0 + (i + 1) * (x1 - x0) // tw
                ay, by = y0 + j * (y1 - y0) // th, y0 + (j + 1) * (y1 - y0) // th
                cell = [px[x, y] for x in range(ax, max(bx, ax + 1)) for y in range(ay, max(by, ay + 1))]
                solid = [c for c in cell if not is_bg(c)]
                if len(solid) * 2 < len(cell): continue
                sp[i, j] = nearest(tuple(median([c[k] for c in solid]) for k in range(3))) + (255,)
        sprite.save(os.path.join(OUT, f'{prefix}-{name}.png'))


main(sys.argv[1], sys.argv[2])
