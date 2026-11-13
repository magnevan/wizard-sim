"""The drum without any of the bought rings on it: the back of its top rim, rebuilt. No generation calls.

  python tools/well-3d/drum_fill.py [drum.png drum-clear.png]   (default; also drum-drained.png drum-drained-clear.png)
  -> game/content/assets/well/<out> (+ a 8x check in build/)

The drum layer (tools/art-import/well_layers.py) kept the bought front ring's lowest rows (y 47 to 50), which sit over
the drum's back rim; 3D rings drawn over them doubled up (the user, 2026-11-13). The drum is round, so the hidden back
half of its top rim is the front half seen from the other side: each pixel on the back rim takes the pixel mirrored
through the drum top's centre line (y = cy), from the front rim, which no ring covers. The orange basin is kept.
"""
import json, os, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
WELL = os.path.join(HERE, '../../game/content/assets/well')
lay = json.load(open(os.path.join(WELL, 'layers.json')))
cx, cy, rx, ry = (lay['drumTop'][k] for k in ('cx', 'cy', 'rx', 'ry'))
lit = np.array(Image.open(os.path.join(WELL, 'drum.png')).convert('RGBA'))
h, w = lit.shape[:2]
ys, xs = np.mgrid[0:h, 0:w]
# the top rim's outer edge, a little generous so the ring's last pixels go too
inside = ((xs + 0.5 - cx) / (rx + 1.5)) ** 2 + ((ys + 0.5 - cy) / (ry + 1.5)) ** 2 <= 1
# the basin (from the lit drum, whose orange shows it; the drained one is the same shape)
basin = (lit[..., 0] > 200) & (lit[..., 1] > 80) & (lit[..., 2] < 90) & (lit[..., 3] > 0)
# the basin's light middle too (tan, ringed by orange): everything between the orange on a row
for y in range(h):
    xo = np.nonzero(basin[y])[0]
    if len(xo):
        basin[y, xo.min():xo.max() + 1] = True
back = inside & (ys + 0.5 < cy) & ~basin
above = (ys + 0.5 < cy) & ~inside
src_y = np.clip(np.round(2 * cy - (ys + 0.5) - 0.5).astype(int), 0, h - 1)
PAIRS = [sys.argv[1:3]] if len(sys.argv) > 2 else [('drum.png', 'drum-clear.png'), ('drum-drained.png', 'drum-drained-clear.png')]
os.makedirs(os.path.join(HERE, 'build'), exist_ok=True)
for src, dst in PAIRS:
    a = np.array(Image.open(os.path.join(WELL, src)).convert('RGBA'))
    out = a.copy()
    out[back] = a[src_y[back], xs[back]]
    # anything of the drum layer above the rim's outer edge is the ring too
    out[above] = 0
    # the drum's dark line along the rebuilt rim's top edge, as on the rest of its outline
    op = out[..., 3] > 0
    top_edge = op & ~np.vstack([np.zeros((1, w), bool), op[:-1]]) & (ys + 0.5 < cy)
    out[top_edge] = (18, 14, 26, 255)
    Image.fromarray(out).save(os.path.join(WELL, dst))
    bg = Image.new('RGBA', (w, h), (40, 40, 48, 255))
    bg.alpha_composite(Image.fromarray(out))
    bg.crop((0, 36, w, 70)).resize((w * 8, 34 * 8), Image.NEAREST).save(os.path.join(HERE, 'build', dst.replace('.png', '-check.png')))
    print(dst, 'rebuilt', int(back.sum()), 'px of back rim; cleared', int((above & (a[..., 3] > 0)).sum()))
