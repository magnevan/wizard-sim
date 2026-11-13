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


CRYSTAL = (51.5, 20.0)    # the crystal's centre in the rings' canvas (content/assets/well/layers.json)
GLINT = [(255, 244, 192), (255, 216, 96), (216, 168, 104), (184, 148, 106)]


def crystal_edge(a, reach=40.0):
    """The bought rings' yellow line: a band's edge that faces the crystal catches its light. A ring pixel whose next
    pixel toward the crystal is the dark line becomes a glint, brighter the nearer the crystal. (A render can't make this:
    with the crystal at the rings' centre its light runs along every band's edge.)"""
    h, w = a.shape[:2]
    line = (a[..., 3] > 0) & (a[..., :3] == LINE).all(2)
    ring = (a[..., 3] > 0) & ~line
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
        k = min(len(GLINT) - 1, int(d / reach * len(GLINT)))
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
        art = crystal_edge(outline(pixel_art(im, sup)))
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
