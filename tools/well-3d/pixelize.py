"""The rings' Blender renders -> palette-locked pixel art in the bought rings' own colours. No generation calls.

  python tools/well-3d/pixelize.py <renders_dir> <out_dir>

Every render pixel snaps to the nearest colour of the bought rings (content/assets/well/rings.png), each art pixel takes
its block's commonest colour, and a one-pixel dark outline goes round each part. Writes back.png and front.png strips
(one cell per frame) and rings.json.
"""
import collections, json, os, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
RINGS = os.path.join(HERE, '../../game/content/assets/well/rings.png')
LINE = (18, 14, 26)


def palette():
    im = Image.open(RINGS).convert('RGBA')
    c = collections.Counter(p[:3] for p in im.getdata() if p[3] > 0)
    return np.array([k for k, n in c.items() if k != LINE and n > 1], float)


PAL = palette()


def pixel_art(rgba, sup):
    h, w = rgba.shape[0] // sup, rgba.shape[1] // sup
    d = ((rgba[..., :3][:, :, None, :].astype(float) - PAL[None, None]) ** 2).sum(3)
    idx = d.argmin(2)
    opaque = rgba[..., 3] >= 128
    out = np.zeros((h, w, 4), np.uint8)
    for y in range(h):
        for x in range(w):
            k = opaque[y * sup:(y + 1) * sup, x * sup:(x + 1) * sup]
            if k.sum() * 2 < sup * sup:
                continue
            block = rgba[y * sup:(y + 1) * sup, x * sup:(x + 1) * sup, :3][k].astype(int)
            out[y, x, 3] = 255
            # the rendered lines are thin: a quarter of the block dark enough makes the pixel a line
            if (block.sum(1) < 60).sum() * 4 >= sup * sup:
                out[y, x, :3] = LINE
                continue
            vals, n = np.unique(idx[y * sup:(y + 1) * sup, x * sup:(x + 1) * sup][k], return_counts=True)
            out[y, x, :3] = PAL[vals[n.argmax()]].astype(np.uint8)
    return out


def outline(a):
    """The bought rings' dark line, one pixel round the silhouette (inside it, so the shape keeps its size)."""
    op = a[..., 3] > 0
    pad = np.pad(op, 1)
    inner = pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:]
    a = a.copy()
    a[op & ~inner, :3] = LINE
    return a


def run(src, out):
    info = json.load(open(os.path.join(src, 'info.json')))
    n, (cw, chh), sup = info['frames'], info['canvas'], info['super']
    os.makedirs(out, exist_ok=True)
    for part in ('back', 'front'):
        strip = np.zeros((chh, cw * n, 4), np.uint8)
        for f in range(n):
            im = np.array(Image.open(os.path.join(src, f'f{f:03d}-{part}.png')).convert('RGBA'))
            strip[:, f * cw:(f + 1) * cw] = outline(pixel_art(im, sup))
        Image.fromarray(strip).save(os.path.join(out, f'{part}.png'), optimize=True)
    json.dump({'frames': n, 'cell': [cw, chh]}, open(os.path.join(out, 'rings.json'), 'w'))
    print('rings', n, 'frames')


if __name__ == '__main__':
    run(sys.argv[1], sys.argv[2])
