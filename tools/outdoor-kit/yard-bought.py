"""The training yard again, in the art we bought: the same terrain map, the pro set's ground, the registry's props.

  python tools/outdoor-kit/yard-bought.py [standard|pro]

Writes img/yard-bought.png (3x). A picture only; the game doesn't draw this way yet.
"""
import json, math, os, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, '../art-trial'))
from imgops import rand2  # noqa: E402
import importlib.util  # noqa: E402

spec = importlib.util.spec_from_file_location('yard', os.path.join(HERE, 'yard.py'))
Y = importlib.util.module_from_spec(spec); spec.loader.exec_module(Y)
RAW = os.path.join(HERE, '../../game/content/generated/pixellab/outdoor')
SET = sys.argv[1] if len(sys.argv) > 1 else 'pro'


def full_tile(which):
    meta = json.load(open(os.path.join(RAW, f'ground-{SET}' if SET == 'pro' else 'ground-dirt', 'metadata.json'), encoding='utf8'))
    sheet = Image.open(os.path.join(RAW, f'ground-{SET}' if SET == 'pro' else 'ground-dirt', 'sheet.png')).convert('RGB')
    for t in meta['tileset_data']['tiles']:
        if all(v == which for v in t['corners'].values()):
            b = t['bounding_box']
            return np.array(sheet.crop((b['x'], b['y'], b['x'] + b['width'], b['y'] + b['height'])))


def tiled(tile, W, H, seed):
    """The tile repeated, each copy flipped at random, so its pattern doesn't line up into rows."""
    s = tile.shape[0]
    out = np.zeros((H + s, W + s, 3), np.uint8)
    for cy in range(H // s + 1):
        for cx in range(W // s + 1):
            t = tile
            if rand2(cx, cy, seed) > 0.5: t = t[:, ::-1]
            if rand2(cx, cy, seed + 1) > 0.5: t = t[::-1]
            out[cy * s:(cy + 1) * s, cx * s:(cx + 1) * s] = t
    return out[:H, :W]


def ground(cam):
    W, H = cam.W, cam.H
    ys, xs = np.mgrid[0:H, 0:W].astype(float)
    i, j = cam.world(xs, ys)
    d = Y.terrain(i + (Y.smooth(H, W, 22, 1) - 0.5) * 1.3, j + (Y.smooth(H, W, 22, 2) - 0.5) * 1.3) + (Y.smooth(H, W, 5, 3) - 0.5) * 0.3
    out = tiled(full_tile('upper'), W, H, 11)
    dirt = tiled(full_tile('lower'), W, H, 13)
    rng = np.random.default_rng(9)
    worn = (d > 0) & (d < 0.55) & (rng.random((H, W)) < (0.55 - d) * 1.1)
    out[worn] = dirt[worn]
    out[d <= 0] = dirt[d <= 0]
    out[(d <= 0) & (d > -0.1)] = (dirt[(d <= 0) & (d > -0.1)] * 0.72).astype(np.uint8)
    return out, d


def main():
    cam = Y.Iso()
    W, H = cam.W, cam.H
    g, d = ground(cam)
    items = []

    def sprite(pid):
        m = json.load(open(os.path.join(Y.PROPS, pid, 'meta.json'), encoding='utf8'))
        return Y.load(pid), m['sets']['lean']['foot'], m.get('flat', False)

    def place(pid, i, j, shadow=0.0, flip=False):
        s, foot, flat = sprite(pid)
        fx = foot[0]
        if flip: s = s[:, ::-1]; fx = s.shape[1] - fx
        x, y = cam.screen(i, j); y += cam.foot_y
        items.append((-1 if flat else y, s, int(x - fx), int(y - foot[1])))
        if shadow:
            yy, xx = np.ogrid[:H, :W]
            m = ((xx - x) / (s.shape[1] * shadow)) ** 2 + ((yy - y) / (s.shape[1] * shadow * 0.45)) ** 2 < 1
            g[m] = (g[m] * 0.74).astype(np.uint8)

    def clear(i, j, r=0.6):
        x, y = cam.screen(i, j); y += cam.foot_y
        return 0 <= x < W and 0 <= y < H and d[int(y), int(x)] > r

    # The fence: each section is about 30 px long on screen, so 1.8 tiles.
    x, y, hx, hy = Y.YARD
    i0, i1, j0, j1 = x - hx - 0.5, x + hx + 0.5, y - hy - 0.5, y + hy + 0.5
    STEP = 1.8
    def run(a, b, fixed, along_i, skip=()):
        n = max(1, round((b - a) / STEP))
        for k in range(n):
            if k in skip: continue
            t = a + (b - a) * (k + 0.5) / n
            place('fence-rail' if along_i else 'fence-rail-flip', *((t, fixed) if along_i else (fixed, t)))
    run(i0, i1, j0, True); run(i0, i1, j1, True); run(j0, j1, i0, False)
    run(j0, j1, i1, False, skip=(2,))
    place('fence-gate-flip', i1, 8.0)

    # The lesson.
    for pid, i, j, fl in [('training-dummy', 5.6, 5.8, False), ('dummy-worn', 7.8, 5.8, True), ('dummy-scorched', 10.0, 5.8, False), ('pell', 5.6, 10.2, False), ('pell', 7.8, 10.2, False)]:
        place(pid, i, j, 0.4, fl)
    place('target-weathered', 4.6, 8.0, 0.4)
    place('sword-rack', 11.2, 5.0, 0.42); place('weapon-rack', 11.2, 10.8, 0.42)
    place('teacher', 9.8, 8.0, 0.36)
    for s, i, j in ((Y.wizard(3, 1), 7.8, 7.2), (Y.wizard(1, 7), 7.2, 8.9)):
        px, py = cam.screen(i, j)
        items.append((py + cam.foot_y, s, int(px - s.shape[1] / 2), int(py + cam.foot_y - s.shape[0] + 2)))

    # The countryside.
    for pid, i, j in [('oak', 1.4, 0.8), ('pine', -1, 6), ('oak', -0.4, 12.6), ('oak-autumn', 15.6, 0.4), ('pine', 18.4, 4), ('oak', 21, 11), ('pine', 4, 16.4), ('oak-autumn', 12.5, 18), ('pine', 24, 3), ('oak', 8, -2.4), ('pine', -3.4, 2.4), ('oak', 20.4, 16), ('pine', 1.6, 18.6)]:
        place(pid, i, j, 0.2)
    for pid, i, j in [('bush-round', 1.4, 3.6), ('bush-autumn', 15.6, 2), ('bush-round', 4, 13.2), ('boulders-mossy', 2.2, 8.4), ('stump-axe', 14.6, 12.2), ('log-fallen', 16.4, 5.4), ('hay-bale', 13.7, 10.8), ('hay-bale', 14.6, 9.9), ('well', 19.4, 12.2), ('handcart', 15.2, 15.8), ('firewood', 13.4, 13.6), ('signpost', 15.6, 7.2), ('bench', 14.4, 3.2), ('standing-stone', 9.6, 14.6), ('arch-ruined', -0.8, 16.2), ('scarecrow', 22.6, 6), ('beehive', 19.2, 1.4), ('barrel', 14.2, 4.6)]:
        place(pid, i, j, 0.38)

    ids = json.load(open(os.path.join(HERE, 'scatter-ids.json')))
    flowers, weeds, stones, fungi, marks, left, animals = ids[:12], ids[12:22], ids[22:32], ids[32:40], ids[40:46], ids[46:56], ids[56:]
    rng = np.random.default_rng(21)
    pick = lambda xs: xs[int(rng.integers(len(xs)))]
    for _ in range(26):  # a drift: one kind, close together
        cx, cy, f = rng.uniform(-8, 28), rng.uniform(-8, 28), pick(flowers)
        for _ in range(int(rng.integers(3, 8))):
            a, b = cx + rng.normal(0, 0.6), cy + rng.normal(0, 0.6)
            if clear(a, b, 0.5): place(f, a, b)
    for pool, n in ((weeds, 90), (stones, 18), (fungi, 12), (marks, 10), (animals, 6)):
        for _ in range(n):
            a, b = rng.uniform(-8, 28), rng.uniform(-8, 28)
            if clear(a, b, 0.4): place(pick(pool), a, b)
    for pid, a, b in [('wooden-practice-sword-lying-on-the-ground', 8.8, 6.6), ('dented-tin-bucket', 6.6, 6.4), ('coil-of-rope', 10.8, 6.8), ('loose-pile-of-straw', 5.2, 7.0), ('worn-leather-glove', 9.0, 9.6), ('broken-wooden-shield', 5.8, 9.2)]:
        place(pid, a, b)

    base = Image.fromarray(g, 'RGB').convert('RGBA')
    for _, s, px, py in sorted(items, key=lambda t: t[0]):
        im = Image.fromarray(s, 'RGBA')
        base.paste(im, (px, py), im)
    im = base.convert('RGB')
    im.resize((W * 3, H * 3), Image.NEAREST).save(os.path.join(HERE, 'img', f'yard-bought-{SET}.png'), optimize=True)
    print('wrote', SET)


main()
