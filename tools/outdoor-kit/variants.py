"""Outdoor variants of props we already bought: no generation calls.

  python tools/outdoor-kit/variants.py

Writes game/content/assets/props/<id>/ for each, in the same form as tools/art-trial/variants.py: a `lean`
image and a meta.json naming the raw file, the base and the operations. The `simple` and `code` sets fall
back to the base's.
"""
import json, os, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '../art-trial'))
from imgops import hexrgb, moss, rand2, rgba, save_png, trim, wear  # noqa: E402

ASSETS = os.path.join(HERE, '../../game/content/assets/props')
TRIAL = 'Trial asset: not cleared to ship. PixelLab terms unread.'


def scorch(a, seed=3):
    """Burnt from the top down: colours go to char, with a few embers left in the deepest part."""
    out = a.copy()
    ys, xs = np.nonzero(a[:, :, 3])
    top, bot = ys.min(), ys.max()
    for y, x in zip(ys, xs):
        k = 1 - (y - top) / max(1, bot - top)
        k = min(1, k * 1.5 + (rand2(x // 2, y // 2, seed) - 0.5) * 0.6)
        if k < 0.25: continue
        out[y, x, :3] = (a[y, x, :3] * (1 - 0.82 * k) + np.array(hexrgb('#1a1420')) * 0.82 * k).astype(np.uint8)
        if k > 0.8 and rand2(x, y, seed + 1) > 0.94: out[y, x, :3] = hexrgb('#ff9a30')
    return out


def write(vid, name, base, ops, lean):
    bm = json.load(open(os.path.join(ASSETS, base, 'meta.json'), encoding='utf8'))
    d = os.path.join(ASSETS, vid)
    os.makedirs(d, exist_ok=True)
    lean = trim(lean)
    save_png(lean, os.path.join(d, 'lean.png'))
    bl = bm['sets']['lean']
    src = rgba(os.path.join(ASSETS, base, bl['file']))
    # The operations keep the outline, so the base's foot still stands on the same spot.
    assert lean.shape[:2] == trim(src).shape[:2], vid
    meta = {'id': vid, 'kind': 'prop', 'name': name, 'base': base, 'footprint': bm['footprint'],
            'sets': {'lean': {'file': 'lean.png', 'foot': bl['foot'], 'source': 'pixellab + local', 'raw': bl['raw'],
                              'tool': 'tools/outdoor-kit/variants.py', 'ops': ops, 'status': TRIAL}}}
    with open(os.path.join(d, 'meta.json'), 'w', encoding='utf8', newline='\n') as f:
        json.dump(meta, f, indent=2); f.write('\n')


dummy = rgba(os.path.join(ASSETS, 'training-dummy/lean.png'))
target = rgba(os.path.join(ASSETS, 'target/lean.png'))
rack = rgba(os.path.join(ASSETS, 'weapon-rack/lean.png'))
write('dummy-worn', 'Worn training dummy', 'training-dummy', ['wear 0.7'], wear(dummy, 0.7, seed=5))
write('dummy-scorched', 'Scorched training dummy', 'training-dummy', ['scorch'], scorch(dummy))
write('dummy-mossy', 'Mossy training dummy', 'training-dummy', ['moss 0.45'], moss(dummy, 0.45, seed=6))
write('target-weathered', 'Weathered target', 'target', ['wear 0.5', 'moss 0.3'], moss(wear(target, 0.5, seed=7), 0.3, seed=8))
write('weapon-rack-mossy', 'Mossy weapon rack', 'weapon-rack', ['moss 0.35'], moss(rack, 0.35, seed=9))
print('wrote 5 variants')

# The page's strip: each base beside its variants, 4x, on the game's grass.
ids = ['training-dummy', 'dummy-worn', 'dummy-scorched', 'dummy-mossy', 'target', 'target-weathered', 'weapon-rack', 'weapon-rack-mossy']
strip = Image.new('RGBA', (8 * 40 + 6, 50), hexrgb('#3f6443') + (255,))
for k, pid in enumerate(ids):
    im = Image.open(os.path.join(ASSETS, pid, 'lean.png')).convert('RGBA')
    strip.paste(im, (6 + k * 40, 46 - im.height), im)
strip.convert('RGB').resize((strip.width * 4, strip.height * 4), Image.NEAREST).save(os.path.join(HERE, 'img/variants.png'), optimize=True)
