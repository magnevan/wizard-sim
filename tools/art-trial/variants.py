"""Variants: more props from images we already have, with no generation calls.

  python tools/art-trial/variants.py        (after props.py)

Each variant is its own asset (game/content/assets/props/<id>/) whose meta.json names the raw file it
came from, its base asset and the operations applied, so it can be rebuilt or thrown away. A set a
variant doesn't make falls back to its base's (the game's art/assets.ts).
Also writes out/variants.png, the page's original-against-variants sheet.
"""
import json, os
import numpy as np
from PIL import Image
from imgops import (OUTLINE, PPU, FY, edge_mask, hexrgb, luma, moss, rand2, ramp_swap, reduce_detail, reoutline, rgba, save_png, trim, wear)
from props import ASSETS, CODE, HERE, RAW, TRIAL, clean_bookshelf, foot_of

hexes = lambda *cs: {hexrgb(c) for c in cs}


def write(vid, name, base, raw, ops, lean, code=None, simple=True):
    """Saves one variant: lean, its simple form, and a code form when there is one."""
    bm = json.load(open(os.path.join(ASSETS, base, 'meta.json'), encoding='utf8')) if os.path.exists(os.path.join(ASSETS, base, 'meta.json')) else {}
    fp = bm.get('footprint', [1.0, 0.6])
    flat = bm.get('flat', False)
    d = os.path.join(ASSETS, vid)
    os.makedirs(d, exist_ok=True)
    lean = trim(lean)
    common = dict(source='pixellab + local', raw=f'game/content/generated/pixellab/{raw}', tool='tools/art-trial/variants.py', ops=ops, status=TRIAL)
    sets = {'lean': {'file': 'lean.png', 'foot': foot_of(lean, fp, flat), **common}}
    save_png(lean, os.path.join(d, 'lean.png'))
    if simple:
        s = trim(reduce_detail(lean))
        save_png(s, os.path.join(d, 'simple.png'))
        sets['simple'] = {'file': 'simple.png', 'foot': foot_of(s, fp, flat), **common, 'ops': ops + ['reduce_detail']}
    if code is not None:
        c = trim(code)
        save_png(c, os.path.join(d, 'code.png'))
        sets['code'] = {'file': 'code.png', 'foot': foot_of(c, fp, flat), 'source': 'code + local', 'tool': 'tools/art-trial/variants.py', 'ops': ops, 'status': 'Ours.'}
    meta = {'id': vid, 'kind': 'prop', 'name': name, 'base': base, 'footprint': fp}
    if 'lift' in bm: meta['lift'] = bm['lift']
    meta['sets'] = sets
    with open(os.path.join(d, 'meta.json'), 'w', encoding='utf8', newline='\n') as f:
        json.dump(meta, f, indent=2); f.write('\n')
    return lean


def swap_exact(a, table):
    """Exact colour -> colour: the cleanest palette swap, for art with a few flat colours."""
    out = a.copy()
    for src, dst in table.items():
        out[(a[:, :, :3] == hexrgb(src)).all(axis=2) & (a[:, :, 3] > 0), :3] = hexrgb(dst)
    return out


def darker(c, k):
    return '#%02x%02x%02x' % tuple(int(v * k) for v in hexrgb(c))


# ---- banners ----------------------------------------------------------------------------------
BANNERS = {
    'red': ('Red banner', '#a83030', None),
    'green': ('Green banner', '#1e7a34', None),
    'violet': ('Violet banner', '#6e3aa8', {'#d8c0a0': '#ffd860', '#e0c8a0': '#fff4c0', '#977552': '#d8a868', '#b8946a': '#d8a868'}),
    'ash': ('Ash banner', '#56565e', {'#d8c0a0': '#c8ccd8', '#e0c8a0': '#efe4ff', '#977552': '#8a8e98', '#b8946a': '#8a8e98'}),
}


def banners():
    raw = rgba(os.path.join(RAW, 'pl-obj-11.png'))
    code = rgba(os.path.join(CODE, 'banner.png'))
    out = []
    for key, (name, col, trim_cols) in BANNERS.items():
        t = {'#1e5a96': col, '#3e4a44': darker(col, 0.62), '#2a342e': darker(col, 0.42), **(trim_cols or {})}
        lean = swap_exact(raw, t)
        c = swap_exact(code, {'#1e5a96': col, '#3a7ac0': '#%02x%02x%02x' % tuple(min(255, int(v * 1.3)) for v in hexrgb(col)), '#143e6a': darker(col, 0.68)})
        out.append(write('banner-' + key, name, 'banner', 'pl-obj-11.png', [f'palette swap: cloth to {col}'] + (['emblem recoloured'] if trim_cols else []), lean, c))
    # frayed: the same image, worn at the edges
    out.append(write('banner-frayed', 'Frayed banner', 'banner', 'pl-obj-11.png', ['wear 0.8'], wear(raw, 0.8, 5), wear(code, 0.8, 5)))
    return out


# ---- bookshelves --------------------------------------------------------------------------------
# Inside the shelf's opening (raw image coordinates). It leans, so its shelves run down to the right.
SLANT = 0.47
BOOK = hexes('#56665c', '#3e4a44', '#2a342e', '#1e5a96', '#6e3aa8', '#ff5a20', '#ffd860', '#8a8e98', '#6e6878', '#8a7a68', '#fff4c0')
WOODS = hexes('#553e2a', '#6a4a2c', '#76583c', '#8a6a48', '#977552', '#b8946a', '#6a5038', '#d8c0a0', '#e0c8a0')
BACK = hexrgb('#1a1420')
RAMPS = {
    'crimson': [['#5a1a1e', '#a83030', '#d85a4a'], ['#6a3a1c', '#b8844a', '#ffd860'], ['#3a1a2e', '#7a2a50', '#c8502a']],
    'mixed': [['#5a1a1e', '#a83030', '#d85a4a'], ['#14365a', '#1e5a96', '#3a7ac0'], ['#124a22', '#1e7a34', '#4ea85a'], ['#3a1a5a', '#6e3aa8', '#b08aff'], ['#6a4a1c', '#b8844a', '#ffd860']],
}


def in_opening(x, y):
    top = 8 + SLANT * (x - 12)
    return 12 <= x <= 31 and top <= y <= top + 28


def shelf_of(x, y):
    return int((y - SLANT * (x - 12) - 8) // 9.5)


def book_pixels(a):
    h, w = a.shape[:2]
    for y in range(h):
        for x in range(w):
            if a[y, x, 3] and in_opening(x, y) and tuple(a[y, x, :3]) in BOOK:
                yield y, x


def repaint_books(a, ramps, seed=1):
    """Each spine (a 2-3 px column band on one shelf) takes a ramp of its own, keeping its light and dark."""
    out = a.copy()
    for y, x in book_pixels(a):
        band = x // 3
        r = ramps[int(rand2(band, shelf_of(x, y), seed) * len(ramps)) % len(ramps)]
        L = luma(a[y, x, :3])
        out[y, x, :3] = hexrgb(r[0 if L < 60 else 1 if L < 120 else 2])
    return out


def thin_books(a, keep=0.5, seed=3):
    """Takes spines off the shelves: gaps show the dark back, so a shelf reads as used or abandoned."""
    out = a.copy()
    h, w = a.shape[:2]
    for y in range(h):
        for x in range(w):
            if not a[y, x, 3] or not in_opening(x, y): continue
            if tuple(a[y, x, :3]) in WOODS and tuple(a[y, x, :3]) not in hexes('#d8c0a0', '#e0c8a0'): continue
            if rand2(x // 3, shelf_of(x, y), seed) > keep: out[y, x, :3] = BACK
    return out


def swap_shelves(a):
    """Region swap along the lean: the top and bottom shelves trade contents (parallel, so a straight move)."""
    out = a.copy()
    dy = 19
    for y in range(a.shape[0]):
        for x in range(a.shape[1]):
            if in_opening(x, y) and shelf_of(x, y) == 0 and y + dy < 48:
                out[y, x], out[y + dy, x] = a[y + dy, x], a[y, x]
    return out


def code_books(a, ramps, seed):
    """The code-drawn shelf: books are the saturated colours, so the same repaint by column band."""
    out = a.copy()
    h, w = a.shape[:2]
    wood = hexes('#d8b88a', '#b8946a', '#977552', '#76583c', '#553e2a', '#33241a', '#1a120c', '#e8d8b0')
    for y in range(h):
        for x in range(w):
            if a[y, x, 3] and tuple(a[y, x, :3]) not in wood:
                r = ramps[int(rand2(x // 3, y // 12, seed) * len(ramps)) % len(ramps)]
                out[y, x, :3] = hexrgb(r[1 if luma(a[y, x, :3]) < 110 else 2])
    return out


DARK_OAK = ['#2a1a14', '#3a261c', '#4a3224', '#5c402c', '#6e5038', '#8a6a4a']


def bookshelves():
    base = clean_bookshelf(rgba(os.path.join(RAW, 'pl-obj-1.png')))
    code = rgba(os.path.join(CODE, 'bookshelf.png'))
    out = []
    R = 'pl-obj-1.png'
    out.append(write('bookshelf-crimson', 'Bookshelf, red books', 'bookshelf', R, ['spines repainted: reds and ochres'], repaint_books(base, RAMPS['crimson'], 1), code_books(code, RAMPS['crimson'], 1)))
    out.append(write('bookshelf-mixed', 'Bookshelf, bright books', 'bookshelf', R, ['spines repainted: five colours'], repaint_books(base, RAMPS['mixed'], 2), code_books(code, RAMPS['mixed'], 2)))
    out.append(write('bookshelf-sparse', 'Bookshelf, half empty', 'bookshelf', R, ['half the spines removed'], thin_books(base, 0.45)))
    dark = ramp_swap(repaint_books(base, RAMPS['mixed'], 4), lambda c: c in WOODS, DARK_OAK)
    out.append(write('bookshelf-oak', 'Bookshelf, dark oak', 'bookshelf', R, ['wood ramp swapped to dark oak', 'spines repainted'], dark))
    out.append(write('bookshelf-flip', 'Bookshelf, mirrored', 'bookshelf', R, ['mirrored left to right'], base[:, ::-1].copy(), code[:, ::-1].copy()))
    out.append(write('bookshelf-swap', 'Bookshelf, shelves swapped', 'bookshelf', R, ['top and bottom shelves swapped along the lean'], swap_shelves(base)))
    return out


# ---- stone --------------------------------------------------------------------------------------
GLOW = hexes('#efe4ff', '#b08aff', '#6e3aa8', '#4a2a78')


def plinth_from_crystal():
    """A new prop from part of an old one: the crystal ball's pedestal, ball and glow cut away."""
    a = rgba(os.path.join(RAW, 'pl-obj-14.png'))
    a[:25] = 0
    stone = hexrgb('#6e6878')
    for y in range(a.shape[0]):
        for x in range(a.shape[1]):
            if a[y, x, 3] and tuple(a[y, x, :3]) in GLOW: a[y, x, :3] = stone
            if a[y, x, 3] and tuple(a[y, x, :3]) in hexes('#977552', '#553e2a', '#76583c', '#8a6a48'): a[y, x, :3] = hexrgb('#8a8e98')
    a[edge_mask(a)] = OUTLINE
    return a


def plinth_meta():
    """The plinth is a base asset of its own: lean and simple from the cut, code from the code-drawn pedestal."""
    d = os.path.join(ASSETS, 'plinth')
    os.makedirs(d, exist_ok=True)
    fp = [1.0, 0.6]
    json.dump({'id': 'plinth', 'footprint': fp}, open(os.path.join(d, 'meta.json'), 'w'))


def stone():
    plinth_meta()
    a = plinth_from_crystal()
    code = rgba(os.path.join(CODE, 'crystal-ball.png'))[17:]
    R = 'pl-obj-14.png'
    out = [write('plinth', 'Stone plinth', 'plinth', R, ['cut from the crystal ball: ball and glow removed'], a, code)]
    json_fix = os.path.join(ASSETS, 'plinth/meta.json')
    m = json.load(open(json_fix, encoding='utf8')); m.pop('base', None)
    json.dump(m, open(json_fix, 'w', encoding='utf8', newline='\n'), indent=2)
    out.append(write('plinth-worn', 'Worn plinth', 'plinth', R, ['cut from the crystal ball', 'wear 0.7'], wear(a, 0.7, 3), wear(code, 0.7, 3)))
    out.append(write('plinth-moss', 'Mossy plinth', 'plinth', R, ['cut from the crystal ball', 'moss 0.45'], moss(a, 0.45, 4), moss(code, 0.45, 4)))
    out.append(write('plinth-overgrown', 'Overgrown plinth', 'plinth', R, ['cut from the crystal ball', 'wear 0.5', 'moss 0.65'], moss(wear(a, 0.5, 6), 0.65, 7), moss(wear(code, 0.5, 6), 0.65, 7)))
    return out


# ---- wood and other trials: to see what the tools don't do well ---------------------------------
def trials():
    out = []
    chest = rgba(os.path.join(RAW, 'pl-obj-10.png'))
    out.append(write('chest-old', 'Old chest', 'chest', 'pl-obj-10.png', ['wear 0.6'], wear(chest, 0.6, 8), wear(rgba(os.path.join(CODE, 'chest.png')), 0.6, 8)))
    throne = rgba(os.path.join(RAW, 'pl-obj-7.png'))
    red = ramp_swap(throne, lambda c: c[2] > c[1] + 20 and c[2] > c[0], ['#5a1a1e', '#a83030', '#d85a4a', '#f08a6a'])
    out.append(write('throne-red', 'Red throne', 'throne', 'pl-obj-7.png', ['ramp swap: violet cushion to red'], red))
    return out


def sheet(rows):
    """Original against variants, on the room's floor colour, at 3x."""
    sc, cell = 3, 50
    w = max(len(r) for r in rows)
    im = Image.new('RGBA', (w * cell * sc, len(rows) * cell * sc), (0x3e, 0x48, 0x3c, 255))
    for j, row in enumerate(rows):
        for i, a in enumerate(row):
            t = Image.fromarray(trim(a), 'RGBA')
            t = t.resize((t.width * sc, t.height * sc), Image.NEAREST)
            im.paste(t, (i * cell * sc + (cell * sc - t.width) // 2, (j + 1) * cell * sc - t.height - 6), t)
    im.save(os.path.join(HERE, 'out/variants.png'))


def pro_shelf():
    """PixelLab Pro's straight-on bookshelf, standing among the code set (the other sets use the base's)."""
    d = os.path.join(ASSETS, 'bookshelf-pro')
    os.makedirs(d, exist_ok=True)
    a = trim(rgba(os.path.join(RAW, 'pl-front-bookshelf.png')))
    save_png(a, os.path.join(d, 'code.png'))
    fp = [2.4, 0.6]
    meta = {'id': 'bookshelf-pro', 'kind': 'prop', 'name': 'Bookshelf, PixelLab Pro', 'base': 'bookshelf', 'footprint': fp, 'sets': {'code': {
        'file': 'code.png', 'foot': foot_of(a, fp, False), 'source': 'pixellab', 'raw': 'game/content/generated/pixellab/pl-front-bookshelf.png', 'tool': 'create_object_pro_flash', 'edits': 'trimmed only', 'status': TRIAL}}}
    with open(os.path.join(d, 'meta.json'), 'w', encoding='utf8', newline=chr(10)) as f:
        json.dump(meta, f, indent=2); f.write(chr(10))


def main():
    pro_shelf()
    b = banners(); s = bookshelves(); p = stone(); t = trials()
    raw = lambda n: rgba(os.path.join(RAW, n))
    sheet([[raw('pl-obj-11.png')] + b, [clean_bookshelf(raw('pl-obj-1.png'))] + s, [raw('pl-obj-14.png')] + p + [raw('pl-obj-10.png'), t[0]], [raw('pl-obj-7.png'), t[1]]])
    print('variants:', len(b) + len(s) + len(p) + len(t))


if __name__ == '__main__':
    main()


def wall_strip(shot, out):
    """
    The same operations on the game's own wall, cut from a 2x room shot: moss, age, other stone. Only a
    picture so far: real walls are painted live (art/walls.ts), so these would become its parameters.
    """
    s = Image.open(shot).convert('RGBA').crop((262, 484, 1062, 528)).resize((400, 22), Image.NEAREST)
    a = np.array(s)
    SAND = ['#2e2218', '#4a3a2a', '#6c5744', '#8a7156', '#a88d6c', '#c8ab86', '#e4cfac']
    rows = [a, moss(a, 0.42, 11, from_top=False), wear(a, 0.9, 12, chip=False), ramp_swap(a, lambda c: c[2] >= c[1] and c[2] >= c[0], SAND)]
    h = a.shape[0]
    im = Image.new('RGBA', (400, (h + 4) * len(rows)), (0x1b, 0x24, 0x21, 255))
    for i, r in enumerate(rows): im.paste(Image.fromarray(r, 'RGBA'), (0, i * (h + 4)))
    im.resize((im.width * 3, im.height * 3), Image.NEAREST).save(out, optimize=True)
