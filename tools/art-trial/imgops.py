"""Local pixel-art operations: the free way to get more out of an image we already paid for.

Images are numpy uint8 arrays, height x width x RGBA. No operation here makes a generation call.
Used by props.py (the mock room's sets) and variants.py (banners, shelves, aged stone).
"""
import numpy as np
from PIL import Image

PPU, FY = 16, 0.6  # the game's art px per world unit, and its ground squash (client/src/camera.ts)
OUTLINE = (0x12, 0x0E, 0x1A, 255)  # the wizards' outline


def rgba(path):
    return np.array(Image.open(path).convert('RGBA'))


def save_png(a, path):
    Image.fromarray(a, 'RGBA').save(path, optimize=True)


def hexrgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def trim(a):
    ys, xs = np.nonzero(a[:, :, 3])
    return a[ys.min():ys.max() + 1, xs.min():xs.max() + 1].copy()


def components(a):
    """Connected opaque areas, 8 neighbours: an int label per pixel (0 = none), and each label's size."""
    h, w = a.shape[:2]
    lab = np.zeros((h, w), int)
    sizes = {}
    n = 0
    for y in range(h):
        for x in range(w):
            if a[y, x, 3] == 0 or lab[y, x]: continue
            n += 1
            lab[y, x] = n
            stack, size = [(y, x)], 0
            while stack:
                cy, cx = stack.pop()
                size += 1
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < h and 0 <= nx < w and a[ny, nx, 3] and not lab[ny, nx]:
                            lab[ny, nx] = n
                            stack.append((ny, nx))
            sizes[n] = size
    return lab, sizes


def keep_largest(a):
    """Erases everything not joined to the biggest piece: stray arrows, loose paper, sparkles."""
    lab, sizes = components(a)
    best = max(sizes, key=sizes.get)
    out = a.copy()
    out[lab != best] = 0
    return out


def drop_specks(a, under=8):
    lab, sizes = components(a)
    out = a.copy()
    for k, s in sizes.items():
        if s < under: out[lab == k] = 0
    return out


def edge_mask(a):
    """Opaque pixels with a transparent 4-neighbour: the silhouette's rim."""
    o = a[:, :, 3] > 0
    p = np.pad(o, 1)
    return o & ~(p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:])


def luma(rgb):
    rgb = np.asarray(rgb, float)
    return rgb[..., 0] * 0.3 + rgb[..., 1] * 0.59 + rgb[..., 2] * 0.11


def quantize(a, colors):
    """
    Fewer colours, merged from the image's own: the two nearest colours join, the rarer into the commoner,
    until `colors` are left. Nearness counts light and dark double, and vivid colours resist merging, so
    the dark lines that hold a shape and the few bright pixels (spines, potions) survive, and it's the
    near-identical browns that collapse. Nothing new enters the palette.
    """
    o = a[:, :, 3] > 0
    counts = {}
    for c in map(tuple, a[o][:, :3].tolist()): counts[c] = counts.get(c, 0) + 1
    target = {c: c for c in counts}
    live = dict(counts)

    def dist(p, q):
        d = np.linalg.norm(np.array(p, float) - np.array(q, float))
        sat = lambda c: (max(c) - min(c)) / (max(c) + 1)
        vivid = max(sat(p) * max(p), sat(q) * max(q)) / 255  # a bright, saturated colour is worth keeping
        return d + 2 * abs(float(luma(p)) - float(luma(q))) + 160 * max(0, vivid - 0.3)

    while len(live) > colors:
        ks = list(live)
        _, p, q = min(((dist(p, q), p, q) for i, p in enumerate(ks) for q in ks[i + 1:]), key=lambda t: t[0])
        keep, gone = (p, q) if live[p] >= live[q] else (q, p)
        live[keep] += live.pop(gone)
        for c, t in target.items():
            if t == gone: target[c] = keep
    out = a.copy()
    for c, t in target.items():
        out[(a[:, :, :3] == c).all(axis=2) & o, :3] = t
    return out


def majority(a, passes=2):
    """Removes single pixels: a pixel with no matching neighbour takes its neighbours' commonest colour."""
    out = a.copy()
    h, w = a.shape[:2]
    for _ in range(passes):
        src = out.copy()
        for y in range(h):
            for x in range(w):
                if src[y, x, 3] == 0: continue
                seen = {}
                for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and src[ny, nx, 3]:
                        k = tuple(src[ny, nx, :3])
                        seen[k] = seen.get(k, 0) + 1
                if tuple(src[y, x, :3]) in seen or not seen: continue
                out[y, x, :3] = max(seen, key=seen.get)
    return out


def reoutline(a):
    out = a.copy()
    out[edge_mask(a)] = OUTLINE
    return out


def reduce_detail(a, colors=9):
    """The `simple` set: no sparkles, fewer colours, no lone pixels, one clean outline like the wizards'."""
    return reoutline(majority(quantize(drop_specks(a), colors)))


# ---- variants --------------------------------------------------------------------------------

def hue_of(rgb):
    r, g, b = [np.asarray(rgb, float)[..., i] / 255 for i in range(3)]
    mx, mn = np.maximum(np.maximum(r, g), b), np.minimum(np.minimum(r, g), b)
    d = mx - mn + 1e-9
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    return h, (mx - mn) / (mx + 1e-9), mx


def ramp_swap(a, select, ramp):
    """
    Palette swap by ramp: every colour `select` picks is mapped, dark to light, onto the new ramp, so the
    shading survives and only the hue changes. Whole colours move, never single pixels.
    """
    out = a.copy()
    cols = {tuple(c) for c in a[a[:, :, 3] > 0][:, :3].tolist()}
    chosen = sorted((c for c in cols if select(c)), key=lambda c: luma(c))
    if not chosen: return out
    lo, hi = luma(chosen[0]), luma(chosen[-1])
    for c in chosen:
        k = 0 if hi == lo else (luma(c) - lo) / (hi - lo)
        new = hexrgb(ramp[min(len(ramp) - 1, int(round(k * (len(ramp) - 1))))])
        out[(a[:, :, :3] == c).all(axis=2) & (a[:, :, 3] > 0), :3] = new
    return out


def rand2(x, y, seed):
    s = np.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453
    return s - np.floor(s)


def noise(h, w, seed, cell=4):
    """Smooth value noise, 0..1: patches rather than speckle."""
    ys, xs = np.mgrid[0:h, 0:w]
    gx, gy = xs / cell, ys / cell
    x0, y0 = np.floor(gx), np.floor(gy)
    fx, fy = gx - x0, gy - y0
    fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    n = lambda a, b: rand2(a, b, seed)
    return (n(x0, y0) * (1 - fx) + n(x0 + 1, y0) * fx) * (1 - fy) + (n(x0, y0 + 1) * (1 - fx) + n(x0 + 1, y0 + 1) * fx) * fy


MOSS = ['#263a28', '#3a5638', '#4e6e46', '#6a8a5a']


def moss(a, amount=0.5, seed=1, ramp=MOSS, from_top=True):
    """
    Moss on what faces up: it gathers in noise patches, more on pixels with open air above them, and keeps
    the pixel's own light and dark (a dark pixel gets dark moss). The outline stays.
    """
    h, w = a.shape[:2]
    o = a[:, :, 3] > 0
    rim = edge_mask(a)
    n = noise(h, w, seed, 5) * 0.7 + noise(h, w, seed + 1, 2) * 0.3
    # how close to an upward-facing edge: moss climbs down from the top of each surface
    up = np.zeros((h, w))
    depth = np.zeros(w)
    for y in range(h):
        depth = np.where(o[y], depth + 1, 0)
        up[y] = np.where(o[y], np.maximum(0, 1 - depth / 14), 0)
    want = n + (up * 0.35 if from_top else 0)
    hit = o & ~rim & (want > 1 - amount * 0.85)
    L = luma(a[:, :, :3])
    lo, hi = np.percentile(L[o], 5), np.percentile(L[o], 95)
    k = np.clip((L - lo) / max(1, hi - lo), 0, 0.999)
    out = a.copy()
    r = np.array([hexrgb(c) for c in ramp], np.uint8)
    out[hit, :3] = r[(k[hit] * len(ramp)).astype(int)]
    return out


def wear(a, amount=0.5, seed=2, chip=True):
    """
    Age: chips the silhouette (noise bites out of the rim, then a new outline), darkens cracks, and fades
    the colours a little toward grey.
    """
    h, w = a.shape[:2]
    out = a.copy()
    n = noise(h, w, seed, 3)
    rim = np.zeros((h, w), bool)
    if chip:  # not on an opaque strip cut from a screenshot: it has no silhouette to chip
        out[edge_mask(a) & (n > 1 - amount * 0.5)] = 0
        rim = edge_mask(out)
        out[rim] = OUTLINE
    o = out[:, :, 3] > 0
    # cracks: thin dark lines where two noise fields cross
    c = np.abs(noise(h, w, seed + 3, 6) - noise(h, w, seed + 4, 6))
    crack = o & ~rim & (c < 0.035 * amount * 2)
    rgb = out[:, :, :3].astype(float)
    g = luma(rgb)[..., None]
    rgb = rgb * (1 - 0.3 * amount) + g * (0.3 * amount)
    rgb[crack] *= 0.55
    out[:, :, :3] = np.where(o[..., None], rgb.astype(np.uint8), out[:, :, :3])
    return out


def region_swap(a, boxes, order, fliph=False):
    """
    Moves rectangles around: boxes is a list of (x, y, w, h), all one size; box i gets the content of
    box order[i], flipped left-right if asked. For shelves: rearranging what's on them.
    """
    out = a.copy()
    for i, (x, y, w, h) in enumerate(boxes):
        sx, sy, _, _ = boxes[order[i]]
        part = a[sy:sy + h, sx:sx + w]
        out[y:y + h, x:x + w] = part[:, ::-1] if fliph else part
    return out
