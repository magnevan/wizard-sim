"""The battery's well, drained: a free local edit of the bought well (no generation calls).

  python tools/art-import/well_drained.py

The design's Drained state (tools/segments/01-opening, the well): no column, dark seams, the crystal gone dark. The glowing
pixels (bright, warm, saturated: the crystal and the runes in the seams) go dark: the crystal's to a sooty violet-black
with a pale crack down it, the seams' to dark brown. The brass is dulled and everything a little darkened, as the burnt-out
defence was. Writes battery-well-drained and battery-well-top-drained next to the two well pieces, with the same feet, so
the client swaps them in place (art/props.ts burnOut). The rings stay where they are for now.
"""
import json, os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
PROPS = os.path.join(HERE, '../../game/content/assets/props')


def drain(a, crystal_rows):
    rgb = a[:, :, :3].astype(float)
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    mx, mn = rgb.max(axis=2), rgb.min(axis=2)
    sat = (mx - mn) / np.maximum(mx, 1)
    solid = a[:, :, 3] > 0
    glow = solid & (r > 170) & (r >= g) & (g > 70) & (b < 0.6 * r) & (sat > 0.45)
    out = rgb.copy()
    # brass and stone: dulled toward grey and darkened
    grey = rgb.mean(axis=2, keepdims=True)
    out = (out * 0.55 + grey * 0.45) * 0.72
    ys = np.arange(a.shape[0])[:, None] * np.ones((1, a.shape[1]))
    crystal = glow & (ys < crystal_rows)
    seams = glow & ~crystal
    # the crystal: violet-black, darker toward its edges, with a pale crack down its middle
    lum = (r + g + b) / 3
    k = np.clip((lum - 120) / 135, 0, 1)[..., None]
    out[crystal] = (np.array([34, 26, 38]) * (1 - k[crystal]) + np.array([62, 52, 66]) * k[crystal])
    if crystal.any():
        cy, cx = np.where(crystal)
        mid = int(np.median(cx))
        for y in range(cy.min(), cy.max() + 1):
            x = mid + (1 if (y // 3) % 2 else 0) - (1 if y > (cy.min() + cy.max()) // 2 + 2 else 0)
            if 0 <= x < a.shape[1] and crystal[y, x]:
                out[y, x] = [140, 128, 138]
    out[seams] = [58, 36, 24]
    res = a.copy()
    res[:, :, :3] = np.clip(out, 0, 255).astype(np.uint8)
    return res, int(crystal.sum()), int(seams.sum())


for pid, crystal_rows in (('battery-well-top', 40), ('battery-well', 0)):
    src = os.path.join(PROPS, pid)
    a = np.array(Image.open(os.path.join(src, 'lean.png')).convert('RGBA'))
    res, nc, ns = drain(a, crystal_rows)
    meta = json.load(open(os.path.join(src, 'meta.json'), encoding='utf-8'))
    dst = os.path.join(PROPS, pid + '-drained')
    os.makedirs(dst, exist_ok=True)
    Image.fromarray(res).save(os.path.join(dst, 'lean.png'), optimize=True)
    meta['id'] = pid + '-drained'
    meta['name'] = meta['name'] + ', drained'
    meta['sets']['lean']['edits'] = 'tools/art-import/well_drained.py: crystal darkened and cracked, seams dark, brass dulled'
    json.dump(meta, open(os.path.join(dst, 'meta.json'), 'w', encoding='utf-8'), indent=2)
    print(pid + '-drained', a.shape[1], 'x', a.shape[0], 'crystal px', nc, 'seam px', ns)
