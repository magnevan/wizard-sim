"""The training yard mock: one outdoor terrain map painted under two cameras, with no generation calls.

  python tools/outdoor-kit/yard.py

The ground isn't tiles. A terrain field says what is where (grass, worn grass, dirt), and each screen pixel
looks up that field through the camera, then takes its colour from a texture. So the same map works under the
true isometric camera and today's camera, and a path can wander without a tile for every bend.

Everything here marked `dev` is code-drawn developer art, a stand-in until the bought art arrives.
Writes img/yard-iso.png, img/yard-today.png, img/kit-sheet.png (all 3x).
"""
import math, os, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '../art-trial'))
from imgops import OUTLINE, hexrgb, rand2, trim  # noqa: E402

PROPS = os.path.join(HERE, '../../game/content/assets/props')
IMG = os.path.join(HERE, 'img')
OUT = OUTLINE[:3]
GRASS = ['#24402f', '#2c4b36', '#35573c', '#3f6443', '#4b724a', '#5a8352']  # the game's (art/floor.ts)
DIRT = ['#453224', '#553e2a', '#6a4a2c', '#76583c', '#8a6a48', '#977552']
WOOD = ['#3a2a1c', '#553e2a', '#76583c', '#977552', '#b8946a']
STONE = ['#3a3e48', '#565a68', '#6e7280', '#8a8e98', '#a8acb4']
LEAF = ['#1e3a2a', '#2a5236', '#3a6e3e', '#54904a', '#7ab45a']
STRAW = ['#6a5028', '#977230', '#c09a48', '#e0c470']
rgb = lambda h: np.array(hexrgb(h), np.uint8)


def smooth(h, w, cell, seed):
    """Value noise, 0..1, smooth at about `cell` pixels."""
    g = np.random.default_rng(seed).random((h // cell + 3, w // cell + 3))
    im = Image.fromarray((g * 255).astype(np.uint8)).resize(((w // cell + 3) * cell, (h // cell + 3) * cell), Image.BICUBIC)
    return np.array(im)[:h, :w].astype(float) / 255


# ---- the map ------------------------------------------------------------------------------------
def seg_dist(i, j, a, b):
    ax, ay = a; bx, by = b
    dx, dy = bx - ax, by - ay
    t = np.clip(((i - ax) * dx + (j - ay) * dy) / (dx * dx + dy * dy), 0, 1)
    return np.hypot(i - ax - t * dx, j - ay - t * dy)


YARD = (8.0, 8.0, 4.6, 3.8)  # centre and half sizes, in tiles
GATE = (12.6, 8.0)
PATHS = [[(12.0, 8.0), (16, 8.6), (20, 7.2), (27, 8.4)], [(16, 8.6), (17.4, 13), (16.2, 19), (17, 27)]]


def terrain(i, j):
    """Below 0 is dirt, the rest is grass; just above 0 is grass worn thin."""
    x, y, hx, hy = YARD
    qx, qy = np.abs(i - x) - hx + 0.8, np.abs(j - y) - hy + 0.8
    d = np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - 0.8
    for p in PATHS:
        for a, b in zip(p, p[1:]):
            d = np.minimum(d, seg_dist(i, j, a, b) - 0.62)
    return d


# ---- cameras ------------------------------------------------------------------------------------
class Iso:
    name, W, H, foot_y = 'iso', 520, 340, 8

    def __init__(s): s.ox, s.oy = 250, 40

    def screen(s, i, j): return s.ox + (i - j) * 16, s.oy + (i + j) * 8

    def world(s, x, y):
        a, b = (x - s.ox) / 16, (y - s.oy) / 8
        return (a + b) / 2, (b - a) / 2


class Today:
    """Today's game camera: straight on, the ground squashed by 0.6, at the same scale per tile."""
    name, W, H, foot_y = 'today', 520, 300, 0

    def __init__(s): s.ox, s.oy = -30, -14

    def screen(s, i, j): return s.ox + i * 23, s.oy + j * 23 * 0.6

    def world(s, x, y): return (x - s.ox) / 23, (y - s.oy) / (23 * 0.6)


def paint_ground(cam):
    W, H = cam.W, cam.H
    ys, xs = np.mgrid[0:H, 0:W].astype(float)
    wob1, wob2 = smooth(H, W, 22, 1) - 0.5, smooth(H, W, 22, 2) - 0.5
    fine = smooth(H, W, 5, 3) - 0.5
    i, j = cam.world(xs, ys)
    d = terrain(i + wob1 * 1.3, j + wob2 * 1.3) + fine * 0.3

    # Grass: clusters from two sizes of noise, plus darker patches at a larger size.
    v = smooth(H, W, 9, 4) * 0.5 + smooth(H, W, 3, 5) * 0.5 + (smooth(H, W, 60, 6) - 0.5) * 0.16
    idx = np.digitize(v, [0.3, 0.42, 0.58, 0.72]) + 1  # GRASS[1..5]; the middle two carry it
    out = np.zeros((H, W, 3), np.uint8)
    for k in range(1, 6): out[idx == k] = rgb(GRASS[k])

    # Dirt.
    v = smooth(H, W, 7, 7) * 0.6 + smooth(H, W, 3, 8) * 0.4
    idx = np.digitize(v, [0.38, 0.5, 0.62])
    dirt = np.zeros((H, W, 3), np.uint8)
    for k in range(4): dirt[idx == k] = rgb(DIRT[k + 2])
    rng = np.random.default_rng(9)
    speck = rng.random((H, W))
    dirt[speck > 0.985] = rgb(DIRT[1])
    dirt[speck < 0.008] = rgb(DIRT[5])

    # Worn grass: speckles of dirt thinning out, then the edge, then the dirt.
    worn = (d > 0) & (d < 0.55) & (rng.random((H, W)) < (0.55 - d) * 1.1)
    out[worn] = dirt[worn]
    is_dirt = d <= 0
    out[is_dirt] = dirt[is_dirt]
    rim = (d <= 0) & (d > -0.11)
    out[rim] = rgb(DIRT[1])

    # Blades: short strokes on the grass, and overhanging the dirt's edge.
    for _ in range(int(W * H * 0.028)):
        x, y = int(rng.integers(1, W - 1)), int(rng.integers(4, H - 1))
        if d[y, x] < -0.02: continue
        lit = rng.random() < 0.65
        n = 2 + int(rng.random() * 2)
        c = rgb(GRASS[5 if lit else 4])
        for k in range(n): out[y - k, x] = c
        out[y + 1, x] = rgb(GRASS[1])
    return out, d


# ---- developer art ------------------------------------------------------------------------------
def blank(w, h): return np.zeros((h, w, 4), np.uint8)


def put(a, x, y, c):
    if 0 <= y < a.shape[0] and 0 <= x < a.shape[1]: a[y, x, :3] = hexrgb(c) if isinstance(c, str) else c; a[y, x, 3] = 255


def outline(a):
    m = a[:, :, 3] > 0
    p = np.pad(m, 1)
    grow = p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]
    e = grow & ~m
    a[e, :3] = OUT; a[e, 3] = 255
    return a


def blob(a, cx, cy, rx, ry, ramp, seed=0, light=(-0.5, -0.7)):
    """An ellipse shaded by a ramp from the top left, with a little noise so it isn't a ball."""
    for y in range(a.shape[0]):
        for x in range(a.shape[1]):
            u, v = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
            if u * u + v * v > 1: continue
            s = 0.5 - (u * light[0] + v * light[1]) * 0.5 + (rand2(x // 2, y // 2, seed) - 0.5) * 0.3
            put(a, x, y, ramp[int(np.clip(s, 0, 0.999) * len(ramp))])


def flower(col, centre='#ffd860'):
    a = blank(7, 10)
    put(a, 3, 9, GRASS[1]); put(a, 3, 8, GRASS[2]); put(a, 3, 7, GRASS[2]); put(a, 3, 6, GRASS[2]); put(a, 4, 8, GRASS[3]); put(a, 2, 7, GRASS[3])
    for dx, dy in ((0, -2), (0, 2), (-2, 0), (2, 0), (-1, -1), (1, -1), (-1, 1), (1, 1), (0, -1), (0, 1), (-1, 0), (1, 0)): put(a, 3 + dx, 3 + dy, col)
    put(a, 3, 3, centre)
    return a


def tuft(seed):
    a = blank(9, 7)
    for k in range(5):
        x = 1 + k * 2 - (k > 2)
        for y in range(6, 6 - 3 - int(rand2(k, seed, 1) * 4), -1): put(a, x + (y < 3) * (1 if k > 2 else -1), y, GRASS[5 if k % 2 else 4])
    return a


def mushroom(cap='#b03a30'):
    a = blank(8, 8)
    for y in (5, 6, 7): put(a, 3, y, '#e0d4bc'); put(a, 4, y, '#b8ac98')
    blob(a, 4, 3.4, 3.6, 2.6, ['#6e2420', cap, '#d05848'], 3)
    put(a, 3, 2, '#efe4d0'); put(a, 5, 3, '#efe4d0')
    return outline(np.pad(a, ((1, 1), (1, 1), (0, 0))))


def pebble(seed, r=2.2):
    n = int(r * 2 + 3)
    a = blank(n, n)
    blob(a, n / 2, n / 2 + 0.5, r, r * 0.7, STONE[1:], seed)
    return outline(np.pad(trim(a), ((1, 1), (1, 1), (0, 0))))


def boulder(w, h, seed, moss=True):
    a = blank(w + 4, h + 4)
    blob(a, (w + 4) / 2, (h + 4) / 2, w / 2, h / 2, STONE, seed)
    blob(a, (w + 4) * 0.68, (h + 4) * 0.62, w / 3.2, h / 3, STONE[:3], seed + 1)
    if moss:
        for y in range(a.shape[0]):
            for x in range(a.shape[1]):
                if a[y, x, 3] and y < a.shape[0] * 0.52 and rand2(x // 2, y // 2, seed + 2) > 0.5: put(a, x, y, LEAF[2 + int(rand2(x, y, 7) * 2)])
    return outline(np.pad(trim(a), ((1, 1), (1, 1), (0, 0))))


def tree(seed, w=46, h=62):
    a = blank(w, h)
    cx = w // 2
    for y in range(h - 24, h - 1):
        grow = max(0, y - (h - 6))
        for x in range(cx - 3 - grow, cx + 4 + grow):
            put(a, x, y, WOOD[min(4, 1 + (x - cx + 3) // 2 - ((x + y) % 5 == 0))])
    for k in range(9):
        an = rand2(k, seed, 1) * 6.28; r = rand2(k, seed, 2)
        bx, by = cx + math.cos(an) * r * 13, 20 + math.sin(an) * r * 9
        blob(a, bx, by + 4, 11, 9, LEAF[:2], seed + k)
    for k in range(10):
        an = rand2(k, seed, 3) * 6.28; r = rand2(k, seed, 4)
        bx, by = cx - 2 + math.cos(an) * r * 12, 17 + math.sin(an) * r * 9
        blob(a, bx, by, 7, 6, LEAF[1:], seed + 20 + k)
    return outline(np.pad(trim(a), ((1, 1), (1, 1), (0, 0))))


def bush(seed):
    a = blank(36, 26)
    for k in range(6): blob(a, 9 + k * 3 + rand2(k, seed, 1) * 3, 14 + rand2(k, seed, 2) * 3, 6, 5.5, LEAF[:4], seed + k)
    for k in range(4): blob(a, 11 + k * 3.4, 11 + rand2(k, seed, 3) * 3, 3.6, 3, LEAF[2:], seed + 9 + k)
    return outline(np.pad(trim(a), ((1, 1), (1, 1), (0, 0))))


def stump():
    a = blank(20, 16)
    blob(a, 10, 10, 8, 5.5, WOOD[:3], 4, light=(-1, 0))
    for y in range(8, 15):
        for x in range(2, 18):
            if a[y, x, 3] == 0 and y < 13: put(a, x, y, WOOD[1 + (x % 3 == 0)])
    blob(a, 10, 6, 8, 4, ['#b8946a', '#d8c0a0'], 5)
    for r in (5, 2.6):
        for t in range(40):
            put(a, int(10 + math.cos(t / 6.37) * r), int(6 + math.sin(t / 6.37) * r * 0.55), '#977552')
    return outline(np.pad(trim(a), ((1, 1), (1, 1), (0, 0))))


def hay():
    a = blank(26, 20)
    blob(a, 13, 11, 11, 8, STRAW, 6)
    for k in range(70):
        x, y = int(rand2(k, 1, 2) * 26), int(rand2(k, 2, 2) * 20)
        if a[y, x, 3]: put(a, x, y, STRAW[int(rand2(k, 3, 2) * 4)])
    for y in range(3, 19): put(a, 8, y, WOOD[1]) if a[y, 8, 3] else None
    for y in range(3, 19): put(a, 18, y, WOOD[1]) if a[y, 18, 3] else None
    return outline(np.pad(trim(a), ((1, 1), (1, 1), (0, 0))))


def fence_run(p0, p1, post_every=2):
    """Post and rail between two screen points: returns (sprite, x, y, foot_y)."""
    (x0, y0), (x1, y1) = p0, p1
    pad = 4; top = 15
    lx, ly = min(x0, x1) - pad, min(y0, y1) - top - pad
    w, h = int(abs(x1 - x0) + pad * 2 + 2), int(abs(y1 - y0) + top + pad * 2 + 2)
    a = blank(w, h)
    n = max(abs(x1 - x0), abs(y1 - y0), 1)
    for z in (5, 10):
        for t in range(int(n) + 1):
            x, y = x0 + (x1 - x0) * t / n - lx, y0 + (y1 - y0) * t / n - ly - z
            put(a, int(x), int(y) - 1, WOOD[3]); put(a, int(x), int(y), WOOD[2]); put(a, int(x), int(y) + 1, WOOD[1])
    for x, y in ((x0, y0), (x1, y1)):
        px, py = int(x - lx), int(y - ly)
        for z in range(0, 14):
            put(a, px - 1, py - z, WOOD[3]); put(a, px, py - z, WOOD[2]); put(a, px + 1, py - z, WOOD[1])
        put(a, px, py - 14, WOOD[4])
    return outline(a), int(lx), int(ly), max(y0, y1)


def load(pid, file='lean.png', flip=False):
    im = Image.open(os.path.join(PROPS, pid, file)).convert('RGBA')
    return np.array(im.transpose(Image.FLIP_LEFT_RIGHT) if flip else im)


def wizard(row, col):
    """A detailed wizard from the sheet: rows 1, 3, 5 are red, blue, violet; 12 poses a row, at 3x."""
    s = Image.open(os.path.join(HERE, '../art-trial/img/wizard-sheet.png')).convert('RGBA')
    c = np.array(s.crop((col * 102, row * 150, col * 102 + 102, row * 150 + 150)).resize((34, 50), Image.NEAREST))
    c[(c[:, :, :3] == hexrgb('#3e483c')).all(axis=2)] = 0
    return trim(c)


# ---- the scene ----------------------------------------------------------------------------------
def scene(cam):
    ground, d = paint_ground(cam)
    W, H = cam.W, cam.H
    items = []  # (sort y, sprite, x, y)

    def stand(s, i, j, shadow=0.0):
        x, y = cam.screen(i, j)
        y += cam.foot_y
        items.append((y, s, int(x - s.shape[1] / 2), int(y - s.shape[0] + 2)))
        if shadow:
            yy, xx = np.ogrid[:H, :W]
            m = ((xx - x) / (s.shape[1] * shadow)) ** 2 + ((yy - y) / (s.shape[1] * shadow * 0.45)) ** 2 < 1
            ground[m] = (ground[m] * 0.72).astype(np.uint8)

    def flat(s, i, j):
        x, y = cam.screen(i, j)
        stand_x, stand_y = int(x - s.shape[1] / 2), int(y + cam.foot_y - s.shape[0] + 2)
        items.append((-1, s, stand_x, stand_y))

    def clear(i, j, r=0.6):
        """On grass, away from the yard and everything placed."""
        x, y = cam.screen(i, j)
        y += cam.foot_y
        if not (0 <= x < W and 0 <= y < H): return False
        return d[int(y), int(x)] > r

    # The yard's fence, with a gate gap on the path side.
    x, y, hx, hy = YARD
    i0, i1, j0, j1 = x - hx - 0.4, x + hx + 0.4, y - hy - 0.4, y + hy + 0.4
    runs = []
    step = 1.6
    def line(a, b):
        n = max(1, round(math.hypot(b[0] - a[0], b[1] - a[1]) / step))
        for k in range(n):
            runs.append(((a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n), (a[0] + (b[0] - a[0]) * (k + 1) / n, a[1] + (b[1] - a[1]) * (k + 1) / n)))
    line((i0, j0), (i1, j0)); line((i0, j1), (i1, j1)); line((i0, j0), (i0, j1))
    line((i1, j0), (i1, GATE[1] - 0.95)); line((i1, GATE[1] + 0.95), (i1, j1))
    for a, b in runs:
        pa, pb = cam.screen(*a), cam.screen(*b)
        pa = (pa[0], pa[1] + cam.foot_y); pb = (pb[0], pb[1] + cam.foot_y)
        s, lx, ly, fy = fence_run(pa, pb)
        items.append((fy, s, lx, ly))

    # What the lesson needs: we own all of these (the dummy and target variants are local).
    for k, (pid, i, j) in enumerate([('training-dummy', 5.6, 5.8), ('dummy-worn', 7.8, 5.8), ('dummy-scorched', 10.0, 5.8), ('training-dummy', 5.6, 10.2), ('dummy-worn', 7.8, 10.2)]):
        stand(load(pid, flip=k % 2 == 1), i, j, 0.42)
    stand(load('target-weathered'), 4.6, 8.0, 0.4)
    stand(load('weapon-rack'), 11.4, 5.0, 0.42)
    stand(load('weapon-rack-mossy'), 11.4, 10.8, 0.42)
    stand(load('teacher'), 9.8, 8.0, 0.36)
    stand(wizard(3, 1), 7.8, 7.2, 0.34)
    stand(wizard(1, 7), 7.2, 8.9, 0.34)

    # Dev art around it, placed by seed.
    rng = np.random.default_rng(21)
    trees = [tree(1), tree(2), tree(3)]
    bushes = [bush(4), bush(5)]
    rocks = [boulder(20, 14, 6), boulder(14, 10, 8), boulder(26, 18, 10, False)]
    for pos in [(2, 1.4), (-1, 6), (0.6, 12.6), (13.8, 3), (18.4, 4), (21, 11), (6, 14.6), (12.5, 16.2), (24, 3), (8, -2.4), (-3.4, 2.4), (20.4, 16), (3, 17)]:
        if clear(*pos, 0.4) or True: stand(trees[int(rng.integers(3))], *pos, 0.34)
    for pos in [(1.4, 3.6), (14.6, 12), (15.6, 2), (4, 13.2), (10, 14)]: stand(bushes[int(rng.integers(2))], *pos, 0.4)
    for pos in [(14.4, 5.8), (2.2, 8.4), (13, 13.4)]: stand(rocks[int(rng.integers(3))], *pos, 0.4)
    stand(stump(), 15, 14.4, 0.42); stand(hay(), 13.7, 10.8, 0.42); stand(hay(), 13.4, 12, 0.42)

    blooms = [flower('#e8e0f0'), flower('#c8502a'), flower('#b08aff'), flower('#ffd860', '#c8502a')]
    tufts = [tuft(1), tuft(2), tuft(3), tuft(4)]
    stones = [pebble(1), pebble(2, 1.6), pebble(3, 3)]
    placed = 0
    for _ in range(46):  # a drift: one colour, close together
        cx, cy = rng.uniform(-8, 28), rng.uniform(-8, 28)
        b = blooms[int(rng.integers(4))]
        for _ in range(int(rng.integers(4, 11))):
            x, y = cx + rng.normal(0, 0.55), cy + rng.normal(0, 0.55)
            if clear(x, y, 0.5): flat(b, x, y); placed += 1
    for _ in range(170):
        x, y = rng.uniform(-8, 28), rng.uniform(-8, 28)
        if clear(x, y, 0.3): flat(tufts[int(rng.integers(4))], x, y); placed += 1
    for _ in range(26):
        x, y = rng.uniform(-8, 28), rng.uniform(-8, 28)
        if clear(x, y, 0.2): flat(stones[int(rng.integers(3))], x, y); placed += 1
    for _ in range(4):  # mushrooms grow at the foot of trees
        x, y = rng.uniform(-3, 22), rng.uniform(-3, 18)
        for k in range(3):
            if clear(x + k * 0.3, y, 0.5): flat(mushroom(), x + k * 0.3, y + (k % 2) * 0.3); placed += 1

    base = Image.fromarray(ground, 'RGB').convert('RGBA')
    for _, s, x, y in sorted(items, key=lambda t: t[0]):
        im = Image.fromarray(s, 'RGBA')
        base.paste(im, (x, y), im)
    return base.convert('RGB'), placed


def sheet():
    """Every dev piece at 3x on the grass."""
    parts = [flower('#e8e0f0'), flower('#c8502a'), flower('#b08aff'), flower('#ffd860', '#c8502a'), tuft(1), tuft(3), mushroom(), pebble(1), pebble(3, 3),
             boulder(14, 10, 8), boulder(20, 14, 6), boulder(26, 18, 10, False), stump(), hay(), bush(4), bush(5), tree(1), tree(2), fence_run((4, 12), (28, 24))[0], fence_run((28, 12), (4, 24))[0]]
    W, H = 330, 96
    base = Image.new('RGBA', (W, H), hexrgb(GRASS[3]) + (255,))
    x, y, row = 6, 6, 0
    for p in parts:
        if x + p.shape[1] + 6 > W: x, y, row = 6, y + row + 6, 0
        im = Image.fromarray(p, 'RGBA'); base.paste(im, (x, y), im)
        x += p.shape[1] + 7; row = max(row, p.shape[0])
    return base.crop((0, 0, W, min(H, y + row + 6))).convert('RGB')


if __name__ == '__main__':
    os.makedirs(IMG, exist_ok=True)
    for cam in (Iso(), Today()):
        im, n = scene(cam)
        im.resize((im.width * 3, im.height * 3), Image.NEAREST).save(os.path.join(IMG, f'yard-{cam.name}.png'), optimize=True)
        print(cam.name, im.size, 'small decorations', n)
    s = sheet()
    s.resize((s.width * 3, s.height * 3), Image.NEAREST).save(os.path.join(IMG, 'kit-sheet.png'), optimize=True)
