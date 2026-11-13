"""The rings' Blender renders -> palette-locked pixel art in the bought rings' own colours. No generation calls.

  python tools/well-3d/pixelize.py <renders_dir> <out_dir>

Every render pixel snaps to the nearest colour of the bought rings (content/assets/well/rings.png), each art pixel takes
its block's commonest colour, and a one-pixel dark outline goes round each part. Writes back.png and front.png strips
(one cell per frame) and rings.json.
"""
import collections, json, math, os, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
RINGS = os.path.join(HERE, '../../game/content/assets/well/rings.png')
LINE = (18, 14, 26)


def palette():
    im = Image.open(RINGS).convert('RGBA')
    c = collections.Counter(p[:3] for p in im.getdata() if p[3] > 0)
    # not the patina green: shaded metal snapped to it reads as grime (the 3D rings carry no patina)
    return np.array([k for k, n in c.items() if k != LINE and n > 1 and not (k[1] > k[0])], float)


PAL = palette()
lum = lambda c: c[..., 0] * 0.3 + c[..., 1] * 0.59 + c[..., 2] * 0.11


def ladder():
    """The bought rings' browns from dark to light, each with the share of the rings it covers (the glint yellows and the
    green left out: the glint is drawn on its own, the green is grime)."""
    im = Image.open(RINGS).convert('RGBA')
    c = collections.Counter(p[:3] for p in im.getdata() if p[3] > 0)
    keep = [(k, n) for k, n in c.items() if k != LINE and not (k[1] > k[0]) and not (k[0] == 255) and n > 1]
    keep.sort(key=lambda kn: lum(np.array(kn[0], float)))
    cols = np.array([k for k, _ in keep], float)
    share = np.cumsum([n for _, n in keep], dtype=float)
    return cols, share / share[-1]


LADDER, CUM = ladder()


# The engraving, drawn per art pixel on the band's outer face (any pattern carved in 3D fell below a pixel and read as
# noise, the user). Seven rows across the face: a raised border, a cut line, three rows of pattern, a cut line, a raised
# border. The pattern is tiles of 8 columns x 3 rows ('X' raised, '.' cut), in a rotation of five so it isn't machine
# even; columns are fractions of a turn (COLS round the ring), so a sixth of a turn (the spin's loop) is 8 whole tiles
# ... and lands on the same rotation.
COLS, SPACING = 240, 5
# The bought engraving read by the user (2026-11-13): many distinct light drawings, raised, with the dark filling the
# negative space between them, and a raised border top and bottom. So the channel between the borders is cut away, and
# small drawings stand up from it: thin strokes in 3 x 3 pixels, two columns of dark between each, about a quarter of
# the channel raised (heavier ones merged into a lattice). Eight in rotation, SPACING columns apart: 40 columns, a sixth
# of a turn (the spin's loop). Each drawing's rows are top, middle, bottom.
# Two rows tall: between the outline and a border pixel each side, the face has about two rows left on screen (three-row
# drawings squeezed into it came out as splotches, the user).
GLYPHS = [
    ('X.X', '.X.'),   # a V
    ('.X.', 'X.X'),   # a caret
    ('XX.', '..X'),   # a step down
    ('X..', '.XX'),   # a hook
    ('.XX', 'X..'),   # a step up
    ('..X', 'XX.'),   # a hook back
    ('X.X', 'X.X'),   # a pair
    ('.X.', '.X.'),   # a bar
]
PATINA_ON = False   # the user: the patina hurt the look; round 8, without it, was the best
CUT_STEPS, CUT_FLOOR = 3, 1   # the cut-away ground goes this many browns down the ladder, but not below this one


# What the bought engraving taught, laid flat (straighten.py, 2026-11-13): short strokes running along the band, 2 to 4
# px long and 1 tall, staggered row to row like brickwork, in four interleaved tones, a light border each side. So the
# channel between the borders is three rows of tones per column, 20 columns that repeat (two repeats to the spin's loop):
# 'H' a bright stroke (+1), 'M' a mid stroke (0), 'd' dark (-2), 'D' darkest (-3). The bright strokes keep to the middle
# row; the rows by the borders are mostly dark with mid strokes, so nothing bright touches a border (the user).
STROKES = (
    'dDMMdDDdMMMdDdMMdDDd',
    'HHHdDMHHdDHHHHdMHHdD',
    'dMMdDdMMMdDDdMMdDdMd',
)
TONE = {'H': 2, 'M': 0, 'd': -2, 'D': -3}


def tone_at(u, v):
    """The engraving's shade step at band position u (0..1 round the ring), v (0..1 across its face)."""
    col = int(np.floor(u * COLS)) % len(STROKES[0])
    row = min(2, max(0, int((v - 0.15) / 0.7 * 3)))
    return TONE[STROKES[row][col]]


def mark_at(u, v):
    """At band position u (0..1 round the ring), v (0..1 across its face): 'raised' on a drawing, else 'cut' (the ground
    between). The borders are found on screen instead (pixel_art), as the face pixel just inside each edge."""
    col = u * COLS
    k = int(np.floor(col / SPACING))
    du = int(np.floor(col - k * SPACING))          # 0..4: three columns of drawing, then two of ground
    dv = 0 if v < 0.5 else 1                       # the two rows between the borders
    if du > 2:
        return 'cut'
    return 'raised' if GLYPHS[k % len(GLYPHS)][dv][du] == 'X' else 'cut'


PATINA = (42, 52, 46)   # the bought rings' green-grey


def patina_at(u, v, kind):
    """Sparse weathering blotches, fixed to the band so they turn with it: smooth noise over cells 4 columns by 2 rows,
    repeating every 40 columns (the loop). Mostly in the cut ground and on the insides."""
    col, row = (u * COLS) % 40, v * 7

    def cell(i, j):
        return ((int(i) % 10) * 73856093 ^ int(j) * 19349663 ^ (0 if kind == 'outer' else 83492791)) % 1000 / 1000.0
    gx, gy = col / 4, row / 2
    i, j, fx, fy = np.floor(gx), np.floor(gy), gx - np.floor(gx), gy - np.floor(gy)
    a, b, c, d = cell(i, j), cell(i + 1, j), cell(i, j + 1), cell(i + 1, j + 1)
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def read_where(path, sup, h, w):
    """pixelize's view of rings.py's 'where' render: for each art pixel, every render sample in its block as (u, v,
    kind), so a pixel can be decided by a vote of its samples rather than the one at its middle (single samples made
    the drawings splotchy where the band is squeezed)."""
    a = np.array(Image.open(path).convert('RGBA')).astype(float)
    out = {}
    for y in range(h):
        for x in range(w):
            blk = a[y * sup:(y + 1) * sup, x * sup:(x + 1) * sup].reshape(-1, 4)
            s = []
            for p in blk:
                if p[3] < 128:
                    continue
                u = round(p[0] / 255 * 64) / 64 + (p[1] / 255) / 64
                b = p[2] / 255
                kind = 'outer' if b >= 0.58 else 'inner' if b >= 0.28 else 'top'
                base = {'outer': 0.6, 'inner': 0.3, 'top': 0.0}[kind]
                s.append((u % 1.0, min(1.0, max(0.0, (b - base) / 0.25)), kind))
            if s:
                out[(y, x)] = s
    return out


def pixel_art(rgba, sup, where=None):
    """Each art pixel is its block's mean; then the ring's pixels, ranked by brightness, take the bought rings' browns in
    the bought rings' own proportions (nearest-colour snapping folded the render's browns into a few shades, the user).
    So the shade spread is the bought one by construction, and each pixel keeps its place, lighter or darker. Where the
    pixel is on the engraved face (`where`), a cut pixel then goes CUT_STEPS browns darker."""
    h, w = rgba.shape[0] // sup, rgba.shape[1] // sup
    blocks = rgba.reshape(h, sup, w, sup, 4).transpose(0, 2, 1, 3, 4).reshape(h, w, sup * sup, 4).astype(float)
    opaque = blocks[..., 3] >= 128
    out = np.zeros((h, w, 4), np.uint8)
    on = opaque.sum(2) * 2 >= sup * sup
    dark = ((blocks[..., :3].sum(3) < 60) & opaque).sum(2) * 4 >= sup * sup   # the thin rendered lines
    mean = (blocks[..., :3] * opaque[..., None]).sum(2) / np.maximum(1, opaque.sum(2))[..., None]
    metal = on & ~dark
    L = lum(mean)[metal]
    q = (np.argsort(np.argsort(L)) + 0.5) / max(1, len(L))
    idx = np.full((h, w), -1)
    idx[metal] = np.searchsorted(CUM, q).clip(0, len(LADDER) - 1)
    kinds = np.full((h, w), -1)
    green = np.zeros((h, w), bool)
    face_samples = {}
    if where:
        top = len(LADDER) - 1
        for (y, x), samples in where.items():
            if idx[y, x] < 0:
                continue
            names = [s[2] for s in samples]
            kind = max(KINDS, key=names.count)
            u, v, _ = next(s for s in samples if s[2] == kind)
            kinds[y, x] = KINDS.index(kind)
            if kind == 'inner':
                # the inside faces in three clear steps by distance from the crystal, lightest near it (the user: the
                # render's own shade there is one flat brown, so it's set here, not nudged)
                d = math.hypot(x + 0.5 - CRYSTAL[0], (y + 0.5 - CRYSTAL[1]) * 1.6)
                idx[y, x] = INNER_STEPS[0] if d < 20 else INNER_STEPS[1] if d < 31 else INNER_STEPS[2]
                if PATINA_ON and patina_at(u, v, kind) > 0.78:
                    green[y, x] = True
                continue
            if kind != 'outer':
                continue
            face_samples[(y, x)] = samples
        # the outer face's pixels: the one just inside each edge is the smooth raised border (found on screen, so every
        # face keeps one however it's squeezed: the user saw none), the rest is ground with the drawings standing on it
        outer = (kinds == KINDS.index('outer')) & metal
        pad = np.pad(outer, 1)
        inside = pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:]
        # pixels the outline will take don't count as face: the border goes one in from them
        opad = np.pad(on, 1)
        rim = on & ~(opad[:-2, 1:-1] & opad[2:, 1:-1] & opad[1:-1, :-2] & opad[1:-1, 2:])
        rpad = np.pad(rim, 1)
        by_rim = rpad[:-2, 1:-1] | rpad[2:, 1:-1] | rpad[1:-1, :-2] | rpad[1:-1, 2:]
        for (y, x), samples in face_samples.items():
            if rim[y, x]:
                continue
            u, v, _ = next(s for s in samples if s[2] == 'outer')
            if not inside[y, x] or by_rim[y, x]:
                idx[y, x] = min(top, idx[y, x] + 1)   # the smooth raised border catches the light
                continue
            # the strokes: the commonest shade step among the pixel's samples (a mean blurred them to mid-tones)
            ts = [tone_at(su, sv) for su, sv, sk in samples if sk == 'outer']
            step = max(set(ts), key=ts.count)
            idx[y, x] = int(np.clip(idx[y, x] + step, min(idx[y, x], CUT_FLOOR), top))
    out[metal, :3] = LADDER[idx[metal]].astype(np.uint8)
    out[metal & green, :3] = PATINA
    out[on & dark, :3] = LINE
    out[on, 3] = 255
    return out, kinds


KINDS = ('outer', 'inner', 'top')
INNER_STEPS = (4, 3, 1)  # the inside faces' browns (ladder steps), near the crystal to far


def outline(a):
    """The bought rings' dark line, one pixel round the silhouette (inside it, so the shape keeps its size)."""
    op = a[..., 3] > 0
    pad = np.pad(op, 1)
    inner = pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:]
    a = a.copy()
    a[op & ~inner, :3] = LINE
    return a


CRYSTAL = (51.5, 20.0)    # the crystal's centre in the rings' canvas (content/assets/well/layers.json)
GLINT = [(255, 216, 96), (255, 216, 96), (216, 168, 104)]   # no near-white: the user found the glints too intense


def crystal_edge(a, kinds=None, reach=38.0):
    """The bought rings' yellow line: a band's edge that faces the crystal catches its light. A ring pixel whose next
    pixel toward the crystal is the dark line becomes a glint, brighter the nearer the crystal; not on the inside faces
    (the back arcs' long yellow lines read as neon). (A render can't make this: with the crystal at the rings' centre its
    light runs along every band's edge.)"""
    h, w = a.shape[:2]
    line = (a[..., 3] > 0) & (a[..., :3] == LINE).all(2)
    ring = (a[..., 3] > 0) & ~line
    if kinds is not None:
        ring &= kinds != KINDS.index('inner')
    out = a.copy()
    for y, x in zip(*np.nonzero(ring)):
        dx, dy = CRYSTAL[0] - (x + 0.5), CRYSTAL[1] - (y + 0.5)
        d = math.hypot(dx, dy)
        if d < 1:
            continue
        # the steps toward the crystal along each axis (where it mostly lies), so the glint runs unbroken along an edge
        steps = [(x + (1 if dx > 0 else -1), y)] if abs(dx) > 0.4 * d else []
        steps += [(x, y + (1 if dy > 0 else -1))] if abs(dy) > 0.4 * d else []
        if not any(0 <= nx < w and 0 <= ny < h and line[ny, nx] for nx, ny in steps):
            continue
        k = int(d / reach * len(GLINT))
        if k < len(GLINT):
            out[y, x, :3] = GLINT[k]
    return out


def run(src, out):
    info = json.load(open(os.path.join(src, 'info.json')))
    n, (cw, chh), sup = info['frames'], info['canvas'], info['super']
    os.makedirs(out, exist_ok=True)
    # the whole rings snapped, lined and glinted first, then split by the mask, so the split leaves no seam
    strips = {p: np.zeros((chh, cw * n, 4), np.uint8) for p in ('back', 'front')}
    for f in range(n):
        im = np.array(Image.open(os.path.join(src, f'f{f:03d}-full.png')).convert('RGBA'))
        wp = os.path.join(src, f'f{f:03d}-where.png')
        where = read_where(wp, sup, chh, cw) if os.path.exists(wp) else None
        art, kinds = pixel_art(im, sup, where)
        art = crystal_edge(outline(art), kinds)
        m = np.array(Image.open(os.path.join(src, f'f{f:03d}-mask.png')).convert('RGBA'))[..., 3] >= 128
        near = m.reshape(chh, sup, cw, sup).mean((1, 3)) >= 0.5
        strips['front'][:, f * cw:(f + 1) * cw] = np.where(near[..., None], art, 0)
        strips['back'][:, f * cw:(f + 1) * cw] = np.where(near[..., None], 0, art)
    for p, strip in strips.items():
        Image.fromarray(strip).save(os.path.join(out, f'{p}.png'), optimize=True)
    json.dump({'frames': n, 'cell': [cw, chh]}, open(os.path.join(out, 'rings.json'), 'w'))
    print('rings', n, 'frames')


if __name__ == '__main__':
    run(sys.argv[1], sys.argv[2])
