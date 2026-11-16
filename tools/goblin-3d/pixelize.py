"""Renders from render.py -> pixel-art frames. No generation calls.

  python tools/goblin-3d/pixelize.py <renders_dir> <out_dir>

Each frame comes as a lit render (fNN.png) and a flat one (fNN_flat.png, every part its own base colour), both at 4x.
For each art pixel (a 4x4 block):
- its part is the commonest flat colour in the block, so edges stay crisp and nothing blurs between parts;
- its light is how bright the lit render is against the flat one, banded into four tones per part
  (dark, shadow, base, light; shadows lean blue, lights lean warm, as hand-shaded pixel art does);
- where two parts meet, the darker one gets its dark tone on the seam, a one-pixel line between them;
- a dark ink outline goes round the silhouette, outside it.
"""
import colorsys, glob, os, sys
import numpy as np
from PIL import Image

SRC, OUT = sys.argv[1], sys.argv[2]
SUPER = 4
INK = np.array((26, 18, 14), np.uint8)
BANDS = (0.55, 0.85, 1.25)   # lit/flat brightness: below the first is dark, then shadow, base, light


def luma(c): return c[..., 0] * 0.299 + c[..., 1] * 0.587 + c[..., 2] * 0.114


def tone(rgb, level):
    """level 0 dark, 1 shadow, 2 base, 3 light."""
    h, s, v = colorsys.rgb_to_hsv(*(c / 255 for c in rgb))
    def shift(h, to, amt):
        d = ((to - h + 0.5) % 1) - 0.5
        return (h + d * amt) % 1
    if level == 0: h, s, v = shift(h, 0.7, 0.10), min(1, s * 1.1 + 0.05), v * 0.46
    elif level == 1: h, s, v = shift(h, 0.7, 0.05), min(1, s * 1.05), v * 0.7
    elif level == 3: h, s, v = shift(h, 0.15, 0.06), s * 0.85, min(1, v * 1.2 + 0.04)
    return np.array([round(c * 255) for c in colorsys.hsv_to_rgb(h, s, v)], np.uint8)


def frame(lit, flat):
    H, W = lit.shape[0] // SUPER, lit.shape[1] // SUPER
    lb = lit.reshape(H, SUPER, W, SUPER, 4).transpose(0, 2, 1, 3, 4).reshape(H, W, SUPER * SUPER, 4).astype(float)
    fb = flat.reshape(H, SUPER, W, SUPER, 4).transpose(0, 2, 1, 3, 4).reshape(H, W, SUPER * SUPER, 4).astype(float)
    opaque = (lb[..., 3] >= 128).sum(-1) * 2 >= SUPER * SUPER
    key = (fb[..., :3] // 8).astype(int)
    key = key[..., 0] * 1024 + key[..., 1] * 32 + key[..., 2]
    base = np.zeros((H, W, 3)); ratio = np.ones((H, W)); mid = np.full((H, W), -1)
    for y in range(H):
        for x in range(W):
            if not opaque[y, x]: continue
            ok = fb[y, x, :, 3] >= 128
            if not ok.any(): ok = lb[y, x, :, 3] >= 128
            ks, n = np.unique(key[y, x][ok], return_counts=True)
            k = ks[n.argmax()]
            sel = ok & (key[y, x] == k)
            base[y, x] = fb[y, x, sel, :3].mean(0)
            ratio[y, x] = luma(lb[y, x, sel, :3]).mean() / max(8.0, luma(fb[y, x, sel, :3]).mean())
            mid[y, x] = k
    level = np.digitize(ratio, BANDS)
    out = np.zeros((H, W, 4), np.uint8)
    cache = {}
    def t(b, l):
        k = (tuple(int(v) // 4 for v in b), l)
        if k not in cache: cache[k] = tone(b, l)
        return cache[k]
    L = luma(base)
    for y in range(H):
        for x in range(W):
            if mid[y, x] < 0: continue
            lv = level[y, x]
            for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                yy, xx = y + dy, x + dx
                if 0 <= yy < H and 0 <= xx < W and mid[yy, xx] >= 0 and mid[yy, xx] != mid[y, x] and L[y, x] < L[yy, xx] - 18:
                    lv = 0
            out[y, x, :3] = t(base[y, x], lv); out[y, x, 3] = 255
    op = mid >= 0
    pad = np.pad(op, 1)
    # the ink goes outside the shape, as hand-drawn sprites do, so a part one or two pixels wide (the blade, an ear tip)
    # keeps its colour instead of turning into a black line
    ring = ~op & (pad[:-2, 1:-1] | pad[2:, 1:-1] | pad[1:-1, :-2] | pad[1:-1, 2:])
    out[ring, :3] = INK; out[ring, 3] = 255
    return out, ratio[op]


n, ratios = 0, []
for f in sorted(glob.glob(os.path.join(SRC, '*', '*', 'f??.png'))):
    rel = os.path.relpath(f, SRC)
    if rel.startswith('preview'): continue
    lit = np.array(Image.open(f).convert('RGBA'))
    flat = np.array(Image.open(f[:-4] + '_flat.png').convert('RGBA'))
    a, r = frame(lit, flat)
    if n % 40 == 0: ratios.append(r)
    o = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(o), exist_ok=True)
    Image.fromarray(a).save(o)
    n += 1
r = np.concatenate(ratios)
print('pixelized', n, 'frames; light ratio percentiles 10/30/50/70/90:', np.percentile(r, [10, 30, 50, 70, 90]).round(2))
