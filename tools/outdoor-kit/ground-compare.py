"""The bought ground, side by side: each set laid out as a small map. No generation calls.

  python tools/outdoor-kit/ground-compare.py

Writes img/ground-compare.png (3x): the standard set, the pro set, isometric corner tiles, isometric path pieces.
"""
import json, os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, '../../game/content/generated/pixellab/outdoor')
IMG = os.path.join(HERE, 'img')
BG = (0x1b, 0x24, 0x21, 255)


def wang(name, lower_field, w=8, h=6):
    """A top-down set, by each tile's corners. lower_field(x, y) is True where the path is."""
    meta = json.load(open(os.path.join(RAW, name, 'metadata.json'), encoding='utf8'))
    sheet = Image.open(os.path.join(RAW, name, 'sheet.png')).convert('RGBA')
    tiles = {}
    for t in meta.get('tileset_data', meta).get('tiles', []):
        c, b = t['corners'], t['bounding_box']
        key = tuple(c[k] == 'lower' for k in ('NW', 'NE', 'SW', 'SE'))
        tiles[key] = sheet.crop((b['x'], b['y'], b['x'] + b['width'], b['y'] + b['height']))
    s = next(iter(tiles.values())).width
    out = Image.new('RGBA', (w * s, h * s))
    for y in range(h):
        for x in range(w):
            k = (lower_field(x, y), lower_field(x + 1, y), lower_field(x, y + 1), lower_field(x + 1, y + 1))
            out.paste(tiles[k], (x * s, y * s))
    return out


def path_cells():
    """A dirt loop and a spur on a small grid, for both isometric sets."""
    cells = set()
    for i in range(2, 8): cells |= {(i, 2), (i, 6)}
    for j in range(2, 7): cells |= {(2, j), (7, j)}
    for i in range(7, 11): cells.add((i, 4))
    return cells


def iso_corner(n=11):
    grid = path_cells()
    im = {k: Image.open(os.path.join(RAW, 'iso-ground', f'tile_{k}.png')).convert('RGBA') for k in range(16)}
    tw = im[0].width
    th = tw // 2
    out = Image.new('RGBA', (tw * (n + 1), th * (n + 2) + im[0].height), (0, 0, 0, 0))
    ox = out.width // 2 - tw // 2
    # The first terrain is grass: its bit is set where a corner isn't path.
    at = lambda i, j: (i, j) not in grid
    for j in range(n):
        for i in range(n):
            mask = at(i, j) << 3 | at(i + 1, j) << 2 | at(i, j + 1) << 1 | at(i + 1, j + 1)
            out.alpha_composite(im[mask], (ox + (i - j) * tw // 2, (i + j) * th // 2))
    return out


def iso_path(n=11):
    grid = path_cells()
    masks = {0: 0, 1: 2, 2: 3, 4: 4, 8: 5, 10: 6, 5: 7, 6: 8, 12: 9, 3: 10, 9: 11, 14: 12, 13: 13, 11: 14, 7: 15, 15: 16}
    im = {k: Image.open(os.path.join(RAW, 'iso-path', f'tile_{k}.png')).convert('RGBA') for k in range(18)}
    tw = im[0].width
    th = tw // 2
    out = Image.new('RGBA', (tw * (n + 1), th * (n + 2) + im[0].height), (0, 0, 0, 0))
    ox = out.width // 2 - tw // 2
    for s in range(2 * n):
        for i in range(n):
            j = s - i
            if not 0 <= j < n: continue
            m = 0
            if (i, j) in grid:
                m = ((i, j - 1) in grid) | ((i + 1, j) in grid) << 1 | ((i, j + 1) in grid) << 2 | ((i - 1, j) in grid) << 3
            k = masks[m] if (i, j) in grid else 0
            out.alpha_composite(im[k], (ox + (i - j) * tw // 2, (i + j) * th // 2))
    return out


def field(x, y):
    return (x, y) in {(a, b) for a in range(2, 7) for b in (2, 3)} | {(a, 4) for a in range(4, 9)}


parts = [wang('ground-dirt', field), wang('ground-pro', field), iso_corner(), iso_path()]
for name, im in zip(('standard', 'pro', 'iso-corner', 'iso-path'), parts):
    b = Image.new('RGBA', im.size, BG); b.alpha_composite(im)
    b.convert('RGB').resize((im.width * 3, im.height * 3), Image.NEAREST).save(os.path.join(IMG, f'ground-{name}.png'), optimize=True)
    print(name, im.size)
