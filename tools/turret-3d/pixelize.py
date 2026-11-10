"""The flame head's Blender renders -> palette-locked pixel art, one sprite sheet. No generation calls.

  python tools/turret-3d/pixelize.py <renders_dir> <out_dir>

Every render pixel is snapped to the colours of the bought head, then each art pixel takes the commonest colour of its block,
so there's no blur and no colour the bought art doesn't have.
"""
import json, os, sys
import numpy as np
from PIL import Image

SRC, OUT = sys.argv[1], sys.argv[2]
SUPER = 4
METAL = [(26, 18, 12), (58, 40, 26), (85, 62, 42), (106, 74, 44), (118, 88, 60), (138, 106, 72), (151, 117, 82), (184, 132, 74), (184, 148, 106), (216, 168, 104), (224, 200, 160)]
FIRE = [(200, 80, 42), (255, 90, 32), (255, 154, 48), (255, 216, 96), (255, 244, 192)]
PALETTE = np.array(METAL + FIRE, float)


def pixel_art(rgba):
    h, w = rgba.shape[0] // SUPER, rgba.shape[1] // SUPER
    d = ((rgba[..., :3][:, :, None, :].astype(float) - PALETTE[None, None, :, :]) ** 2).sum(3)
    idx = d.argmin(2)
    opaque = rgba[..., 3] >= 128
    out = np.zeros((h, w, 4), np.uint8)
    for y in range(h):
        for x in range(w):
            k = opaque[y * SUPER:(y + 1) * SUPER, x * SUPER:(x + 1) * SUPER]
            if k.sum() * 2 < SUPER * SUPER:
                continue
            vals, n = np.unique(idx[y * SUPER:(y + 1) * SUPER, x * SUPER:(x + 1) * SUPER][k], return_counts=True)
            out[y, x, :3] = PALETTE[vals[n.argmax()]].astype(np.uint8)
            out[y, x, 3] = 255
    return out


def outline(a):
    """A one-pixel dark edge round the silhouette, as the bought art has."""
    op = a[..., 3] > 0
    edge = op & ~(np.roll(op, 1, 0) & np.roll(op, -1, 0) & np.roll(op, 1, 1) & np.roll(op, -1, 1))
    a = a.copy()
    a[edge, :3] = METAL[0]
    return a


info = json.load(open(os.path.join(SRC, 'info.json')))
# the bought head's own pilot flame
_HEAD = np.array(Image.open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../game/content/generated/pixellab/opening/defence/head-north-east.png')).convert('RGBA'))[0:21, 47:58]
_box = Image.fromarray(_HEAD).getchannel('A').getbbox()
FLAME = Image.fromarray(_HEAD).crop(_box)
FLAME_FOOT = (FLAME.width // 2, FLAME.height - 1)
c, n = info['canvas'], len(info['facings'])
sheet = np.zeros((c, c * n, 4), np.uint8)
for i in range(n):
    im = np.array(Image.open(os.path.join(SRC, f'r{i:02d}.png')).convert('RGBA'))
    cell = Image.fromarray(outline(pixel_art(im)))
    tip = info['tips'][i]
    cell.alpha_composite(FLAME, (round(tip[0]) - FLAME_FOOT[0], max(0, round(tip[1]) - FLAME_FOOT[1])))  # the painted pilot flame, always upright
    sheet[:, i * c:(i + 1) * c] = np.array(cell)
os.makedirs(OUT, exist_ok=True)
Image.fromarray(sheet).save(os.path.join(OUT, 'sheet.png'), optimize=True)
# where the swivel sits on the tower, art px from the tower's spot: the collar's middle in the bought art, less the tower's anchor
_DEF = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../game/content')
_box = Image.open(_DEF + '/generated/pixellab/opening/defence/tower-clean.png').convert('RGBA').getchannel('A').getbbox()
_foot = json.load(open(_DEF + '/assets/props/defence-tower/meta.json'))['sets']['lean']['foot']
COLLAR = (65, 44)
json.dump({'cell': c, 'facings': info['facings'], 'collar': [COLLAR[0] - _box[0] - _foot[0], COLLAR[1] - _box[1] - _foot[1]], 'pivot': [round(v, 2) for v in info['pivot']], 'tips': [[round(v, 2) for v in p] for p in info['tips']]}, open(os.path.join(OUT, 'sheet.json'), 'w'), indent=1)
print('sheet', sheet.shape)
