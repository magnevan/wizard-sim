"""usage: python tools/weapon-variants/slice.py <dir with the sheet PNGs>

Cuts each Codex sheet named in sheets.json into its grid cells, trims the white margin, pads each to a
square and saves img/<weapon>--<extras>.jpg for the page; also saves img/sheet-<name>.jpg. A cell's split
lines are moved to the emptiest column / row near the even split, so a weapon a little off-centre isn't cut.
A pure weapon already cropped from the approved sheet A is kept, not overwritten.
"""
import json, os, re, sys
from PIL import Image

here = os.path.dirname(os.path.abspath(__file__))
src = sys.argv[1]
sheets = json.load(open(os.path.join(here, 'sheets.json')))
out = os.path.join(here, 'img')
os.makedirs(out, exist_ok=True)
slug = lambda s: re.sub(r'[^a-z0-9]+', '-', s.lower())


def ink(im):
    g = im.convert('L').point(lambda v: 255 if v < 238 else 0)
    return g


def best_split(profile, centre, span):
    lo, hi = max(1, centre - span), min(len(profile) - 1, centre + span)
    return min(range(lo, hi), key=lambda i: (profile[i], abs(i - centre)))


def cuts(profile, n):
    size = len(profile)
    inner = [best_split(profile, round(size * k / n), size // (n * 4)) for k in range(1, n)]
    return [0] + inner + [size]


for s in sheets:
    p = os.path.join(src, s['sheet'] + '.png')
    if not os.path.exists(p):
        print('missing', p); continue
    im = Image.open(p).convert('RGB')
    w, h = im.size
    sh = im.copy(); sh.thumbnail((1400, 1400)); sh.save(os.path.join(out, 'sheet-%s.jpg' % s['sheet']), quality=85)
    m = ink(im)
    px = m.load()
    colp = [sum(1 for y in range(0, h, 2) if px[x, y]) for x in range(w)]
    rowp = [sum(1 for x in range(0, w, 2) if px[x, y]) for y in range(h)]
    xs, ys = cuts(colp, s['cols']), cuts(rowp, s['rows'])
    for i, c in enumerate(s['cells']):
        r, k = divmod(i, s['cols'])
        box = (xs[k], ys[r], xs[k + 1], ys[r + 1])
        cell = im.crop(box)
        bb = ink(cell).getbbox()
        if bb:
            pad = 16
            cell = cell.crop((max(0, bb[0] - pad), max(0, bb[1] - pad), min(cell.width, bb[2] + pad), min(cell.height, bb[3] + pad)))
        side = max(cell.size)
        sq = Image.new('RGB', (side, side), (255, 255, 255))
        sq.paste(cell, ((side - cell.width) // 2, (side - cell.height) // 2))
        sq = sq.resize((420, 420), Image.LANCZOS)
        name = slug(c['weapon']) + '--' + ('-'.join(c['extras']) if c['extras'] else 'pure') + '.jpg'
        dest = os.path.join(out, name)
        if not c['extras'] and os.path.exists(dest) and c['weapon'] != 'Healing hands':
            name = 'alt-' + name; dest = os.path.join(out, name)
        sq.save(dest, quality=88)
        print(s['sheet'], i + 1, name)
