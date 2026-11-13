"""The bought rings' engraving laid flat: every pixel of the bought rings that the fitted 3D rings say is on a band's
outer face, put where it sits on that face (u round the ring, v across), one strip per ring. The fit isn't exact, so it's
a rough map; cells no pixel lands on stay grey.

  blender --background --python tools/well-3d/rings.py -- <dir> unwrap A
  python tools/well-3d/unwrap.py <dir> <out.png> [rows] [k]
"""
import os, sys
import numpy as np
from PIL import Image
import pixelize as P

src, out = sys.argv[1], sys.argv[2]
ROWS = int(sys.argv[3]) if len(sys.argv) > 3 else 7
k = int(sys.argv[4]) if len(sys.argv) > 4 else 8
SUP, W, H = 4, 104, 56
rings = np.array(Image.open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../game/content/assets/well/rings.png')).convert('RGBA'))[:H]
both = P.read_where(os.path.join(src, 'f000-where.png'), SUP, H, W)
alone = {r: P.read_where(os.path.join(src, f'f000-where-{r}.png'), SUP, H, W) for r in 'AB'}


def middle(samples, kind='outer'):
    s = [x for x in samples if x[2] == kind]
    return s[len(s) // 2] if s else None


strips = {r: np.full((ROWS, P.COLS, 3), 64, np.uint8) for r in 'AB'}
filled = {r: 0 for r in 'AB'}
for (y, x), samples in both.items():
    p = rings[y, x]
    if p[3] == 0 or tuple(p[:3]) == P.LINE:
        continue
    m = middle(samples)
    if not m or [s[2] for s in samples].count('outer') * 2 < len(samples):
        continue
    # which ring is in front here: the one whose own map agrees with the combined one
    best, gap = None, 9
    for r in 'AB':
        a = alone[r].get((y, x))
        ma = middle(a) if a else None
        if ma and abs(ma[0] - m[0]) < gap:
            best, gap = r, abs(ma[0] - m[0])
    if best is None or gap > 0.01:
        continue
    col, row = int(m[0] * P.COLS) % P.COLS, min(ROWS - 1, int(m[1] * ROWS))
    strips[best][row, col] = p[:3]
    filled[best] += 1
# where the band is foreshortened fewer pixels land than there are columns: a hole of a pixel or two takes its nearest
# neighbour in the same row (marked as filled only for reading, not as the bought art)
for r in 'AB':
    s = strips[r]
    got = (s != 64).any(2)
    fill = s.copy()
    for row in range(ROWS):
        for c in np.nonzero(~got[row])[0]:
            for d in (1, -1, 2, -2):
                if got[row, (c + d) % P.COLS]:
                    fill[row, c] = s[row, (c + d) % P.COLS]
                    break
    # roll so the visible stretch doesn't wrap round the seam
    empty = ~(fill != 64).any(2).any(0)
    runs = np.nonzero(empty)[0]
    if len(runs):
        fill = np.roll(fill, -int(runs[np.argmax(np.diff(np.r_[runs, runs[0] + P.COLS]))]) - 1, axis=1)
    strips[r] = fill
# only the stretch of each strip that has pixels, with a little margin
parts = []
for r in 'AB':
    s = strips[r]
    used = np.nonzero((s != 64).any(2).any(0))[0]
    if len(used):
        parts.append(s[:, max(0, used.min() - 2):used.max() + 3])
    parts.append(np.zeros((2, max(p.shape[1] for p in parts), 3), np.uint8))
wmax = max(p.shape[1] for p in parts)
im = np.vstack([np.pad(p, ((0, 0), (0, wmax - p.shape[1]), (0, 0))) for p in parts])
Image.fromarray(im).resize((im.shape[1] * k, im.shape[0] * k), Image.NEAREST).save(out)
print('unwrapped', filled, 'px;', out)
