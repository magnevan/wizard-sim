"""Shears a long diagonal prop (a wall or balustrade piece) so its base runs at the game's ground slope, so pieces laid
end to end along a plan axis join into one line instead of a staircase. No generation calls.

  python tools/building-art/shear.py <prop-id> x|y

A run along the plan's x axis goes down-right on screen at a slope of +0.5 (1 px down per 2 px right); along y it
goes down-left, -0.5. The piece's current slope is measured from the bottom edge of its opaque pixels and the image
is sheared column by column to the target. Its foot moves with the column it sits in.
"""
import json, os, sys
import numpy as np
from PIL import Image

PROPS = os.path.join(os.path.dirname(__file__), '../../game/content/assets/props')

def main():
    pid, axis = sys.argv[1], sys.argv[2]
    target = 0.5 if axis == 'x' else -0.5
    d = os.path.join(PROPS, pid)
    im = Image.open(os.path.join(d, 'lean.png')).convert('RGBA'); a = np.asarray(im)
    h, w = a.shape[:2]
    cols = [x for x in range(w) if a[:, x, 3].any()]
    bottoms = np.array([h - 1 - np.argmax(a[::-1, x, 3] > 0) for x in cols])
    slope = np.polyfit(cols, bottoms, 1)[0]
    k = target - slope
    shift = [round(k * (x - w / 2)) for x in range(w)]
    lo, hi = min(shift), max(shift)
    out = np.zeros((h + hi - lo, w, 4), dtype=np.uint8)
    for x in range(w):
        out[shift[x] - lo: shift[x] - lo + h, x] = a[:, x]
    meta = json.load(open(os.path.join(d, 'meta.json')))
    fx, fy = meta['sets']['lean']['foot']
    meta['sets']['lean']['foot'] = [fx, fy + shift[min(fx, w - 1)] - lo]
    meta['sets']['lean'].setdefault('ops', []).append(f'sheared to a {target:+.1f} base slope (tools/building-art/shear.py)')
    Image.fromarray(out).save(os.path.join(d, 'lean.png'), optimize=True)
    json.dump(meta, open(os.path.join(d, 'meta.json'), 'w'), indent=2)
    print(pid, f'slope {slope:+.2f} -> {target:+.2f}', 'foot', meta['sets']['lean']['foot'])

if __name__ == '__main__':
    main()
