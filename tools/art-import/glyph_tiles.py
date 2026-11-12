"""The glyph path tileset: runes for paths cut into the ground. No generation calls (the sheets were bought once).

  python tools/art-import/glyph_tiles.py

Sources: three PixelLab sheets, create_image_pixen at 64 x 64, 4 x 4 runes each (game/content/generated/pixellab/
opening/glyphs/sheet-<seed>.png; the prompt is in the tiles.json written here). Sheets 1201 and 1203 are clean and in use;
1202 has a dark outline and stray dots and is kept spare.

Each rune is cut from its 16 px cell, cleaned (dark outline pixels and specks dropped), made white and grey only (so the
game tints it, art/glyph-path.ts), and flattened to SQUASH of its height so it reads as cut into the slanted ground: a row
of output takes the brightest of the rows it covers, so thin strokes stay joined. The pad that ends a path and the node
that marks a bend are drawn by hand to the same size. Writes game/content/assets/tiles/glyph-path/tiles.png + tiles.json.
"""
import json, os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, '../../game/content/generated/pixellab/opening/glyphs')
OUT = os.path.join(HERE, '../../game/content/assets/tiles/glyph-path')
PROMPT = ('A sheet of sixteen small magical rune glyphs arranged in an even 4 by 4 grid, one rune centred in each cell with clear '
          'space around it. Each rune is a simple angular sigil of thin strokes, like ancient carved runes: lines, hooks, small '
          'circles and chevrons, every one different. Pure white strokes with soft light grey edges on a transparent background, '
          'flat, crisp pixel art.')
SHEETS = {1203: range(16), 1201: [0, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]}  # 1201's 1 and 5 have loose bits
SQUASH = 0.6


def keep_parts(on, least):
    """Only the 8-connected pieces of at least `least` pixels."""
    seen, out = np.zeros_like(on), np.zeros_like(on)
    for y0, x0 in zip(*np.where(on)):
        if seen[y0, x0]:
            continue
        part, todo = [], [(y0, x0)]
        seen[y0, x0] = True
        while todo:
            y, x = todo.pop()
            part.append((y, x))
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < on.shape[0] and 0 <= xx < on.shape[1] and on[yy, xx] and not seen[yy, xx]:
                        seen[yy, xx] = True; todo.append((yy, xx))
        if len(part) >= least:
            for y, x in part: out[y, x] = True
    return out


def cut(sheet, k):
    cx, cy = (k % 4) * 16, (k // 4) * 16
    a = sheet[cy:cy + 16, cx:cx + 16].astype(float)
    lum = a[:, :, :3].mean(axis=2)
    on = (a[:, :, 3] > 100) & (lum > 120)                    # the strokes, not the dark rim
    # specks: a lit pixel with no lit neighbour
    pad = np.pad(on, 1)
    nb = sum(np.roll(np.roll(pad, dy, 0), dx, 1) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx)[1:-1, 1:-1]
    on &= nb > 0
    on = keep_parts(on, 4)                                    # a tick or dot of a neighbouring rune that crossed into the cell
    v = np.where(on, np.where(lum > 200, 255, 160), 0)       # white, or grey for the soft edges
    ys, xs = np.where(on)
    if not len(ys):
        return None
    v = v[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    h = v.shape[0]
    nh = max(3, round(h * SQUASH))
    out = np.zeros((nh, v.shape[1]))
    for y in range(nh):
        r0, r1 = int(y * h / nh), max(int(y * h / nh) + 1, int((y + 1) * h / nh))
        out[y] = v[r0:r1].max(axis=0)
    return out


runes = []
for seed, cells in SHEETS.items():
    sheet = np.array(Image.open(os.path.join(RAW, f'sheet-{seed}.png')).convert('RGBA'))
    for k in cells:
        r = cut(sheet, k)
        if r is not None:
            runes.append(r)
W = max(r.shape[1] for r in runes)
H = max(r.shape[0] for r in runes)
if W % 2 == 0: W += 1                                          # odd, so a tile has a middle pixel
if H % 2 == 0: H += 1


def hand(rows):
    a = np.array([[255 if c == '#' else 160 if c == '+' else 0 for c in row] for row in rows], float)
    return a


PAD = hand(['....#....', '..##+##..', '.#+++++#.', '..##+##..', '....#....'])
NODE = hand(['..#..', '.#+#.', '..#..'])
tiles = runes + [PAD, NODE]
PITCH = W + 1
im = np.zeros((H, PITCH * len(tiles), 4), np.uint8)
for k, t in enumerate(tiles):
    th, tw = t.shape
    oy, ox = (H - th) // 2, k * PITCH + (W - tw) // 2
    im[oy:oy + th, ox:ox + tw, :3] = t[:, :, None]
    im[oy:oy + th, ox:ox + tw, 3] = np.where(t > 0, 255, 0)
os.makedirs(OUT, exist_ok=True)
Image.fromarray(im).save(os.path.join(OUT, 'tiles.png'))
json.dump({'cell': [W, H], 'pitch': PITCH, 'glyphs': len(runes), 'pad': len(runes), 'node': len(runes) + 1,
           'source': 'PixelLab create_image_pixen, 64 x 64, no background, seeds 1201-1203; cut, cleaned and flattened by tools/art-import/glyph_tiles.py',
           'prompt': PROMPT}, open(os.path.join(OUT, 'tiles.json'), 'w'), indent=2)
print('glyph tiles:', len(runes), 'runes, cell', W, 'x', H)
