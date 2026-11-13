"""The engraving laid flat, to judge the pattern by itself: the band's outer face unrolled, as many rows as it has on
screen (a border, three rows of drawings, a border), at k times, in one mid brown with the cuts and patina as
pixelize.py draws them.

  python tools/well-3d/swatch.py <out.png> [columns] [k]
"""
import sys
import numpy as np
from PIL import Image
import pixelize as P

out = sys.argv[1]
cols = int(sys.argv[2]) if len(sys.argv) > 2 else 80
k = int(sys.argv[3]) if len(sys.argv) > 3 else 12
mid = 5
rows_v = [None, 0.27, 0.5, 0.73, None]   # on screen: a border, the strokes' three rows, a border
a = np.zeros((len(rows_v), cols, 3), np.uint8)
for r, v in enumerate(rows_v):
    for c in range(cols):
        u = (c + 0.5) / P.COLS
        i = mid + 1 if v is None else max(P.CUT_FLOOR, mid + P.tone_at(u, v))
        a[r, c] = P.LADDER[min(len(P.LADDER) - 1, i)]
line = np.full((1, cols, 3), P.LINE, np.uint8)
a = np.vstack([line, a, line])
Image.fromarray(a).resize((cols * k, a.shape[0] * k), Image.NEAREST).save(out)
print('swatch', out)
