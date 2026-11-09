"""Three ideas for the outdoor sword lesson's place, each laid out in the bought art. No generation calls.

  python tools/outdoor-kit/concepts.py

Each concept is a terrain map (dirt, cobble, water, tall grass on grass), props placed by purpose, and numbered
zone markers that the page explains. Writes img/concept-<id>.png at 2x. Pictures only; the game doesn't draw this.
"""
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '../art-trial'))
from imgops import rand2  # noqa: E402
import importlib.util  # noqa: E402

spec = importlib.util.spec_from_file_location('yard', os.path.join(HERE, 'yard.py'))
Y = importlib.util.module_from_spec(spec); spec.loader.exec_module(Y)
RAW = os.path.join(HERE, '../../game/content/generated/pixellab/outdoor')
PROPS = Y.PROPS
W, H, OX, OY = 720, 420, 360, -30
SCATTER = json.load(open(os.path.join(HERE, 'scatter-ids.json')))
FLOWERS, WEEDS, STONES, FUNGI = SCATTER[:12], SCATTER[12:22], SCATTER[22:32], SCATTER[32:40]


def screen(i, j): return OX + (i - j) * 16, OY + (i + j) * 8


def world(x, y):
    a, b = (x - OX) / 16, (y - OY) / 8
    return (a + b) / 2, (b - a) / 2


# ---- shapes: signed distance in tiles, negative inside ----------------------------------------------
def rect(ci, cj, hi, hj, r=0.8):
    def f(i, j):
        qx, qy = np.abs(i - ci) - hi + r, np.abs(j - cj) - hj + r
        return np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - r
    return f


def circle(ci, cj, r): return lambda i, j: np.hypot(i - ci, j - cj) - r


def line(pts, w):
    def f(i, j):
        d = np.full(np.shape(i), 1e9)
        for a, b in zip(pts, pts[1:]): d = np.minimum(d, Y.seg_dist(i, j, a, b))
        return d - w
    return f


def union(*fs): return lambda i, j: np.min([f(i, j) for f in fs], axis=0)


# ---- textures ---------------------------------------------------------------------------------------
def full_tile(name, which):
    meta = json.load(open(os.path.join(RAW, name, 'metadata.json'), encoding='utf8'))
    sheet = Image.open(os.path.join(RAW, name, 'sheet.png')).convert('RGB')
    for t in meta['tileset_data']['tiles']:
        if all(v == which for v in t['corners'].values()):
            b = t['bounding_box']
            return np.array(sheet.crop((b['x'], b['y'], b['x'] + b['width'], b['y'] + b['height'])))


def tiled(tile, seed):
    s = tile.shape[0]
    out = np.zeros((H + s, W + s, 3), np.uint8)
    for cy in range(H // s + 1):
        for cx in range(W // s + 1):
            t = tile
            if rand2(cx, cy, seed) > 0.5: t = t[:, ::-1]
            if rand2(cx, cy, seed + 1) > 0.5: t = t[::-1]
            out[cy * s:(cy + 1) * s, cx * s:(cx + 1) * s] = t
    return out[:H, :W]


TEX = {}


def textures():
    if TEX: return TEX
    TEX['grass'] = tiled(full_tile('ground-pro', 'upper'), 11)
    TEX['dirt'] = tiled(full_tile('ground-pro', 'lower'), 13)
    TEX['cobble'] = tiled(full_tile('ground-cobble', 'lower'), 15)
    TEX['water'] = tiled(ramped(full_tile('ground-water', 'lower'), WATER), 17)
    return TEX


WATER = [(0x1c, 0x3e, 0x4a), (0x24, 0x52, 0x5c), (0x30, 0x66, 0x6c), (0x46, 0x80, 0x80), (0x7c, 0xaa, 0xa0)]


def ramped(tile, ramp):
    """The bought water is neon cyan: keep its pattern, put it on our ramp by rank of lightness."""
    l = tile.astype(float).mean(axis=2)
    cuts = np.quantile(l, [0.12, 0.38, 0.7, 0.92])
    out = np.zeros_like(tile)
    for k, c in enumerate(ramp): out[np.searchsorted(cuts, l, side='right') == k] = c
    return out


WARP = {'dirt': 1.2, 'tall': 1.8, 'water': 0.9, 'cobble': 0.35}


def paint(layers):
    """layers: [(kind, sdf)], later ones on top. Returns the ground image and each kind's distance field."""
    T = textures()
    ys, xs = np.mgrid[0:H, 0:W].astype(float)
    i, j = world(xs, ys)
    w1, w2, fine = Y.smooth(H, W, 22, 1) - 0.5, Y.smooth(H, W, 22, 2) - 0.5, Y.smooth(H, W, 5, 3) - 0.5
    D = {k: np.full((H, W), 9.0) for k in WARP}
    for kind, f in layers:
        k = WARP[kind]
        D[kind] = np.minimum(D[kind], f(i + w1 * k, j + w2 * k) + fine * 0.25 * (k > 0.5))
    out = T['grass'].copy()
    rng = np.random.default_rng(9)
    # Tall grass: the grass darker, with long blades.
    tall = D['tall'] < 0
    out[tall] = (out[tall] * 0.8).astype(np.uint8)
    for _ in range(int(W * H * 0.05)):
        x, y = int(rng.integers(1, W - 1)), int(rng.integers(6, H - 1))
        if D['tall'][y, x] > 0.2: continue
        n = 3 + int(rng.random() * 4)
        c = (0x5a, 0x83, 0x52) if rng.random() < 0.6 else (0x3f, 0x64, 0x43)
        for kk in range(n): out[y - kk, x + (kk > 2) * (1 if x % 2 else -1)] = c
        out[y + 1, x] = (0x24, 0x40, 0x2f)
    d = D['dirt']
    worn = (d > 0) & (d < 0.5) & (rng.random((H, W)) < (0.5 - d) * 1.1)
    out[worn] = T['dirt'][worn]
    out[d <= 0] = T['dirt'][d <= 0]
    rim = (d <= 0) & (d > -0.09)
    out[rim] = (T['dirt'][rim] * 0.72).astype(np.uint8)
    c = D['cobble']
    edge = (c > 0) & (c < 0.12)
    out[edge] = (out[edge] * 0.66).astype(np.uint8)
    out[c <= 0] = T['cobble'][c <= 0]
    wt = D['water']
    wet = (wt > 0) & (wt < 0.22)
    out[wet] = (T['dirt'][wet] * 0.62).astype(np.uint8)
    out[wt <= 0] = T['water'][wt <= 0]
    shore = (wt <= 0) & (wt > -0.1)
    out[shore] = WATER[4]
    glint = (wt < -0.3) & (rng.random((H, W)) < 0.004)
    out[glint] = (0xc8, 0xe0, 0xd4)
    return out, D


# ---- a scene ----------------------------------------------------------------------------------------
class Scene:
    def __init__(s, layers):
        s.g, s.D = paint(layers)
        s.items, s.keep, s.marks = [], [], []

    def sprite(s, pid):
        m = json.load(open(os.path.join(PROPS, pid, 'meta.json'), encoding='utf8'))
        return Y.load(pid), m['sets']['lean']['foot'], m.get('flat', False)

    def place(s, pid, i, j, flip=False, shadow=0.38, keep=1.0):
        a, foot, flat = s.sprite(pid)
        fx = foot[0]
        if flip: a = a[:, ::-1]; fx = a.shape[1] - fx
        x, y = screen(i, j)
        s.items.append((-1 if flat else y, a, int(x - fx), int(y - foot[1])))
        if keep: s.keep.append((i, j, keep))
        if shadow and not flat:
            yy, xx = np.ogrid[:H, :W]
            r = a.shape[1] * shadow
            m = ((xx - x) / r) ** 2 + ((yy - y) / (r * 0.45)) ** 2 < 1
            s.g[m] = (s.g[m] * 0.74).astype(np.uint8)

    def wizard(s, row, col, i, j):
        a = Y.wizard(row, col)
        x, y = screen(i, j)
        s.items.append((y, a, int(x - a.shape[1] / 2), int(y - a.shape[0] + 2)))
        yy, xx = np.ogrid[:H, :W]
        m = ((xx - x) / 7) ** 2 + ((yy - y) / 3) ** 2 < 1
        s.g[m] = (s.g[m] * 0.74).astype(np.uint8)
        s.keep.append((i, j, 1.0))

    def fence(s, a, b, kind='fence-rail', gaps=(), step=1.8):
        """A run along the i axis or the j axis. gaps: section numbers left open."""
        along_i = abs(b[0] - a[0]) > abs(b[1] - a[1])
        L = abs((b[0] - a[0]) if along_i else (b[1] - a[1]))
        n = max(1, round(L / step))
        for k in range(n):
            if k in gaps: continue
            t = (k + 0.5) / n
            s.place(kind if along_i else kind + '-flip', a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, shadow=0, keep=0.6)

    def ring(s, pid, ci, cj, r, n, phase=0.0):
        for k in range(n):
            an = phase + k * 2 * math.pi / n
            s.place(pid, ci + math.cos(an) * r, cj + math.sin(an) * r, flip=k % 2 == 1, keep=0.6)

    def mark(s, n, i, j): s.marks.append((n, i, j))

    def ground_at(s, i, j):
        x, y = screen(i, j)
        if not (0 <= x < W and 0 <= y < H): return None
        x, y = int(x), int(y)
        return {k: s.D[k][y, x] for k in s.D}

    def free(s, i, j, r=0.9):
        g = s.ground_at(i, j)
        if g is None or g['dirt'] < 0.4 or g['cobble'] < 0.3 or g['water'] < 0.3: return False
        return all(math.hypot(i - a, j - b) > r * k for a, b, k in s.keep)

    def scatter(s, seed, drifts=24, weeds=110, stones=14, fungi=8, reeds=40, box=(-4, 34)):
        rng = np.random.default_rng(seed)
        pick = lambda xs: xs[int(rng.integers(len(xs)))]
        U = lambda: rng.uniform(*box)
        for _ in range(drifts):
            ci, cj, f = U(), U(), pick(FLOWERS)
            g = s.ground_at(ci, cj)
            if g is None or g['tall'] < 0: continue  # flowers grow in the short grass
            for _ in range(int(rng.integers(3, 8))):
                a, b = ci + rng.normal(0, 0.6), cj + rng.normal(0, 0.6)
                if s.free(a, b, 0.8): s.place(f, a, b, keep=0)
        for _ in range(weeds):
            a, b = U(), U()
            g = s.ground_at(a, b)
            if g is not None and s.free(a, b, 0.8) and (g['tall'] < 0.5 or rng.random() < 0.35): s.place(pick(WEEDS[:9]), a, b, keep=0)
        for pool, n in ((STONES, stones), (FUNGI, fungi)):
            for _ in range(n):
                a, b = U(), U()
                if s.free(a, b, 1.0): s.place(pick(pool), a, b, keep=0)
        for _ in range(reeds * 6):  # reeds and cattails along water
            a, b = U(), U()
            g = s.ground_at(a, b)
            if g is not None and 0.25 < g['water'] < 0.9 and s.free(a, b, 0.5):
                s.place('bunch-of-reeds' if rng.random() < 0.7 else 'tall-grass-tuft', a, b, keep=0)
                reeds -= 1
                if reeds <= 0: break

    def trees(s, seed, spots, kinds=('oak', 'pine', 'pine', 'oak', 'oak-autumn')):
        rng = np.random.default_rng(seed)
        for i, j in spots:
            g = s.ground_at(i, j)
            if g is not None and (g['cobble'] < 1.4 or g['water'] < 0.7 or g['dirt'] < 0.9): continue
            s.place(kinds[int(rng.integers(len(kinds)))], i, j, flip=rng.random() < 0.5, shadow=0.22, keep=1.4)

    def save(s, name):
        base = Image.fromarray(s.g, 'RGB').convert('RGBA')
        for _, a, x, y in sorted(s.items, key=lambda t: t[0]):
            im = Image.fromarray(a, 'RGBA'); base.paste(im, (x, y), im)
        big = base.convert('RGB').resize((W * 2, H * 2), Image.NEAREST)
        d = ImageDraw.Draw(big)
        font = ImageFont.load_default(size=22)
        for n, i, j in s.marks:
            x, y = screen(i, j); x, y = x * 2, y * 2
            d.ellipse((x - 17, y - 17, x + 17, y + 17), fill=(0xff, 0xd8, 0x60), outline=(0x12, 0x0e, 0x1a), width=3)
            d.text((x, y + 1), str(n), fill=(0x12, 0x0e, 0x1a), font=font, anchor='mm')
        big.save(os.path.join(HERE, 'img', f'concept-{name}.png'), optimize=True)
        print('wrote', name)


def forest(i0, i1, j0, j1, seed, density=0.5):
    rng = np.random.default_rng(seed)
    pts = []
    for i in np.arange(i0, i1, 2.2):
        for j in np.arange(j0, j1, 2.2):
            if rng.random() < density: pts.append((i + rng.uniform(-0.8, 0.8), j + rng.uniform(-0.8, 0.8)))
    return pts


# ---- A: the academy's practice field ------------------------------------------------------------------
def concept_a():
    stream = [(33, 11), (26, 17.5), (22, 21), (17, 26), (11, 32)]
    path = [(9, 7), (14, 12.5), (18.5, 17), (22, 21), (25.5, 24.5), (31, 30)]
    s = Scene([
        ('tall', union(circle(28, 3, 3.0), circle(13, 27, 3.4), circle(2, 21, 3.4))),
        ('cobble', rect(5.5, 5, 5, 3.6, 1.4)), ('cobble', line(path, 0.75)),
        ('dirt', rect(6.4, 14.4, 5.0, 2.2, 1.0)),          # the dummy line
        ('dirt', circle(18, 6.5, 3.8)),                    # the sparring ring
        ('dirt', rect(26.0, 11.6, 5.6, 1.1, 0.9)),          # the parry lane
        ('water', line(stream, 0.85)),
    ])
    # The academy's edge: its wall would stand here, with the gate where the cobbles start.
    s.fence((-1, 0.6), (13, 0.6), 'stone-wall-low', gaps=(3,))
    s.fence((0.4, 0.6), (0.4, 11), 'stone-wall-low')
    s.mark(1, 6, 3)
    for k, pid in enumerate(['training-dummy', 'dummy-worn', 'training-dummy', 'dummy-scorched', 'dummy-worn']):
        s.place(pid, 2.4 + k * 2.0, 13.2, flip=k % 2 == 1)
    s.place('pell', 1.4, 15.6); s.place('pell', 11.4, 15.4)
    s.place('teacher', 6.4, 17.0, shadow=0.36)
    s.wizard(3, 4, 4.4, 15.4); s.wizard(5, 4, 8.6, 15.4)
    s.mark(2, 3.0, 10.8)
    s.place('sword-rack', 11.4, 9.8); s.place('weapon-rack', 9.4, 10.0)
    s.mark(3, 10.6, 8.2)
    s.ring('half-buried-stone', 18, 6.5, 4.05, 14)
    s.wizard(1, 1, 17.0, 5.6); s.wizard(3, 5, 19.2, 7.4)
    s.place('bench', 23.6, 4.2); s.place('bench', 23.6, 8.4)
    s.place('water-trough', 15.6, 9.4)
    s.mark(4, 18, 2.4)
    s.place('target-weathered', 31.0, 11.6)
    s.place('hay-bale', 32.2, 10.6); s.place('hay-bale', 32.2, 12.6)
    s.wizard(5, 2, 21.4, 11.6)
    s.mark(5, 26.4, 9.6)
    s.place('footbridge', 22, 21, keep=1.6)
    s.place('signpost', 20.2, 19.6)
    s.mark(6, 23.6, 19.0)
    s.trees(3, forest(22, 36, 22, 36, 4, 0.7) + forest(26, 36, 10, 20, 5, 0.45) + [(15, 29), (11, 33), (-3, 12), (0, 31), (14, -2), (25, 1), (31, 5), (9, 21), (-1, 18)])
    s.place('bush-round', 13.6, 18.6); s.place('boulders-mossy', 7.2, 20.8); s.place('bush-autumn', 15.6, 22.8)
    s.mark(7, 29, 27)
    s.scatter(31)
    s.save('a')


# ---- B: the road camp --------------------------------------------------------------------------------
def concept_b():
    road = [(-4, 9), (8, 11), (17, 14.5), (34, 19)]
    fork = [(17, 14.5), (16, 23), (14.6, 34)]
    s = Scene([
        ('tall', union(circle(22, 4, 3.0), circle(0, 18, 3.2), circle(31, 6, 3))),
        ('dirt', line(road, 1.0)), ('dirt', line(fork, 0.8)),
        ('dirt', rect(9, 4.6, 5.0, 2.8, 1.4)),             # the camp
        ('dirt', rect(7.4, 20.8, 4.6, 3.6, 0.6)),          # the drill square
        ('dirt', rect(26.4, 21.0, 4.6, 1.0, 0.8)),           # the butts
        ('water', union(circle(26, 9, 2.6), circle(28.4, 11, 2.0))),
    ])
    s.place('tent', 6.4, 3.4); s.place('tent', 10.6, 2.6, flip=True)
    s.place('campfire-ring', 9, 6.2)
    s.place('firewood', 12.8, 5.6); s.place('crates', 4.8, 6.6); s.place('barrel', 6.0, 7.6); s.place('barrel', 4.4, 8.0)
    s.place('washing-line', 13.4, 2.0)
    s.place('handcart', 14.6, 9.4); s.place('water-trough', 18.6, 11.2)
    s.mark(1, 9, 1.0)
    s.place('signpost', 19.0, 16.4)
    s.mark(2, 20.4, 14.6)
    x0, x1, y0, y1 = 2.6, 12.2, 17, 24.6
    s.fence((x0, y0), (x1, y0), gaps=(3,)); s.fence((x0, y1), (x1, y1)); s.fence((x0, y0), (x0, y1)); s.fence((x1, y0), (x1, y1))
    for k, pid in enumerate(['training-dummy', 'dummy-worn', 'training-dummy']):
        s.place(pid, 4.6 + k * 2.4, 19.0, flip=k % 2 == 1)
    s.place('pell', 10.4, 19.2); s.place('pell', 10.4, 22.6)
    s.place('teacher', 6.0, 23.0, shadow=0.36)
    s.wizard(3, 4, 5.0, 21.2); s.wizard(1, 4, 8.0, 21.2)
    s.place('sword-rack', 13.8, 18.2)
    s.mark(3, 7.4, 15.4)
    s.place('target-weathered', 30.6, 21.0)
    s.place('hay-bale', 31.8, 20.0); s.place('hay-bale', 31.8, 22.2)
    s.wizard(5, 2, 22.4, 21.0)
    s.mark(4, 26.4, 19.0)
    s.place('bench', 23.4, 7.0)
    s.mark(5, 26, 5.6)
    s.trees(6, forest(18, 36, 28, 38, 7, 0.65) + forest(-6, 6, 26, 38, 8, 0.5) + [(16, 4), (20, 2), (31, 14), (21, 9), (24, 13.8), (-1, 2), (0, 14), (19.4, 25), (22, 27)])
    s.place('boulders-mossy', 20.6, 27.6); s.place('bush-round', 14, 26); s.place('log-fallen', 11.6, 28.4)
    s.mark(6, 24, 32)
    s.scatter(32)
    s.save('b')


# ---- C: the old stones --------------------------------------------------------------------------------
def concept_c():
    trail = [(-3, 29), (6.5, 22.6), (10, 19.4)]
    trail2 = [(18.6, 10.6), (22, 8)]
    stream = [(26, 16), (22.6, 22), (19.4, 27), (17.6, 34)]
    floor = circle(13.6, 14.6, 5.2)
    s = Scene([
        ('tall', union(circle(3, 10, 4.5), circle(24, 29, 4), circle(7, 31, 3), circle(30, 4, 3.4))),
        ('dirt', line(trail, 0.7)), ('dirt', line(trail2, 0.6)),
        ('dirt', circle(13.6, 14.6, 5.9)),
        ('cobble', lambda i, j: np.maximum(floor(i, j), 0.2 - 0.5 * (np.sin(i * 1.3 + j * 0.7) * np.cos(j * 1.1 - i * 0.4) + 1))),
        ('dirt', line([(16.6, 19.6), (21.4, 24.2), (25, 31)], 0.6)),
        ('water', union(circle(26.6, 9.4, 4.4), circle(29, 14, 3.4), line(stream, 0.7))),
    ])
    for k in range(8):
        an = k * math.pi / 4 + 0.2
        i, j = 13.6 + math.cos(an) * 6.4, 14.6 + math.sin(an) * 6.4
        if k == 2: continue  # the gap the arch fills
        s.place('standing-stone' if k % 3 else 'pillar-broken', i, j, flip=k % 2 == 1, keep=1.2)
    s.place('arch-ruined', 9.0, 19.8, keep=1.4)
    s.mark(1, 6.6, 18.6)
    s.place('pillar-broken', 11.2, 13.0); s.place('pillar-broken', 16.0, 16.2, flip=True)
    s.wizard(3, 1, 12.2, 15.8); s.wizard(1, 5, 15.2, 13.6)
    s.mark(2, 13.6, 10.8)
    s.place('shrine', 13.0, 7.2)
    s.place('teacher', 15.6, 8.4, shadow=0.36)
    s.mark(3, 11.4, 5.6)
    s.place('footbridge', 21.4, 24.2, keep=1.6)
    s.mark(4, 26.6, 6.0)
    s.place('training-dummy', 19.8, 9.8); s.place('dummy-mossy', 21.0, 12.0, flip=True)
    s.mark(5, 21.6, 14.4)
    s.trees(9, forest(-6, 8, -6, 6, 10, 0.75) + forest(-6, 2, 6, 22, 11, 0.4) + forest(26, 36, 20, 36, 12, 0.5) + [(20, 1), (24, 2), (6, 26), (12, 30), (17, 30.5), (33, 7)], kinds=('pine', 'pine', 'oak', 'oak-autumn'))
    s.place('boulders-mossy', 18.4, 21.0); s.place('log-fallen', 9.8, 26.0); s.place('bush-round', 22.4, 17.4)
    s.mark(6, 2, 2)
    s.scatter(33, drifts=34)
    s.save('c')


if __name__ == '__main__':
    concept_a(); concept_b(); concept_c()
