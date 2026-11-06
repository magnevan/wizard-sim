"""Builds the mock academy room's prop assets from the raw library. Local only: no generation calls.

  node tools/art-trial/code-dump.mjs        (once, after changing code-props.html: writes out/code/<id>.png)
  python tools/art-trial/props.py

Reads   game/content/generated/pixellab/   (raw, never edited)
Writes  game/content/assets/props/<id>/    lean.png, simple.png, code.png and meta.json

Three sets per prop, sharing one footprint, so the room plays the same in each:
  lean    the PixelLab sheet's prop, with its stray bits erased (the look that leans isometric)
  simple  lean with fewer colours, flat shading and single pixels removed
  code    drawn in the game's pixel library, straight-on (code-props.html)

Variants (other banners, bookshelves, aged stone) come from variants.py, on top of what this writes.
"""
import json, os
import numpy as np
from PIL import Image
from imgops import PPU, FY, keep_largest, reduce_detail, trim, rgba, save_png

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
RAW = os.path.join(ROOT, 'game/content/generated/pixellab')
ASSETS = os.path.join(ROOT, 'game/content/assets/props')
CODE = os.path.join(HERE, 'out/code')

TRIAL = 'Trial asset: not cleared to ship. PixelLab terms unread.'

# id, name, raw index, footprint [w, h] in world units, extras
PROPS = [
    ('lectern', 'Lectern', 0, [1.2, 0.6], {}),
    ('bookshelf', 'Bookshelf', 1, [2.4, 0.6], {'lean_clean': 'bookshelf'}),
    ('target', 'Archery target', 2, [1.6, 0.5], {'lean_clean': 'largest'}),
    ('rune-circle', 'Rune circle', 3, [5.0, 3.0], {'flat': True}),
    ('teacher', 'Robed teacher', 4, [0.9, 0.5], {}),
    ('cauldron', 'Cauldron', 5, [1.6, 1.0], {}),
    ('desk', 'Desk', 6, [2.6, 1.0], {'lean_clean': 'desk'}),
    ('throne', 'Throne', 7, [1.4, 0.9], {}),
    ('potion-shelf', 'Potion shelf', 8, [2.2, 0.6], {}),
    ('armillary', 'Armillary sphere', 9, [1.0, 0.6], {}),
    ('chest', 'Chest', 10, [1.7, 0.9], {}),
    ('banner', 'Banner', 11, [1.6, 0.2], {'lift': 3}),
    ('training-dummy', 'Training dummy', 12, [0.9, 0.5], {}),
    ('weapon-rack', 'Weapon rack', 13, [2.0, 0.6], {}),
    ('crystal-ball', 'Crystal ball', 14, [1.0, 0.6], {}),
    ('clock', 'Clock', 15, [1.2, 0.6], {}),
]


def clean_bookshelf(a):
    """Erases the two scrolls: the left one floats free, the right one is pinned over the side panel."""
    a = a.copy()
    a[:, :10] = 0

    for y in range(18, 35):
        for x in range(34, 48):
            if a[y, x, 3] == 0: continue
            if x >= 42: a[y, x] = 0
            elif a[y, x, :3].sum() > 420: a[y, x] = PANEL  # paper-coloured
    return keep_largest(a)


PANEL = (0x6a, 0x4a, 0x2c, 255)


def clean_desk(a):
    """Erases the loose sheet on the floor by the desk's right foot."""
    a = a.copy()
    a[39:, 31:] = 0
    a[37:, 35:] = 0
    return keep_largest(a)


def foot_of(a, footprint, flat):
    """The image pixel that sits on the prop's ground spot: the middle of its footprint."""
    ys, xs = np.nonzero(a[:, :, 3])
    cx = (xs.min() + xs.max() + 1) // 2
    if flat: return [int(cx), int((ys.min() + ys.max() + 1) // 2)]
    return [int(cx), int(ys.max() + 1 - round(footprint[1] * PPU * FY / 2))]


def entry(file, a, footprint, flat, **prov):
    return {'file': file, 'foot': foot_of(a, footprint, flat), **prov}


def main():
    for pid, name, idx, footprint, extra in PROPS:
        d = os.path.join(ASSETS, pid)
        os.makedirs(d, exist_ok=True)
        raw_name = f'pl-obj-{idx}.png'
        raw = rgba(os.path.join(RAW, raw_name))
        clean = extra.get('lean_clean')
        lean = clean_bookshelf(raw) if clean == 'bookshelf' else clean_desk(raw) if clean == 'desk' else keep_largest(raw) if clean == 'largest' else raw
        lean = trim(lean)
        simple = trim(reduce_detail(lean, colors=9))
        flat = bool(extra.get('flat'))
        raw_ref = f'game/content/generated/pixellab/{raw_name}'
        sets = {
            'lean': entry('lean.png', lean, footprint, flat, source='pixellab', raw=raw_ref, tool='create_1_direction_object', edits='stray bits erased' if clean else 'trimmed only', status=TRIAL),
            'simple': entry('simple.png', simple, footprint, flat, source='pixellab + local', raw=raw_ref, tool='tools/art-trial/imgops.py reduce_detail', edits='fewer colours, flat shading, single pixels removed', status=TRIAL),
        }
        save_png(lean, os.path.join(d, 'lean.png'))
        save_png(simple, os.path.join(d, 'simple.png'))
        code_file = os.path.join(CODE, pid + '.png')
        if os.path.exists(code_file):
            code = trim(rgba(code_file))
            save_png(code, os.path.join(d, 'code.png'))
            sets['code'] = entry('code.png', code, footprint, flat, source='code', tool='tools/art-trial/code-props.html', status='Ours.')
        meta = {'id': pid, 'kind': 'prop', 'name': name, 'footprint': footprint}
        if flat: meta['flat'] = True
        if 'lift' in extra: meta['lift'] = extra['lift']
        meta['sets'] = sets
        with open(os.path.join(d, 'meta.json'), 'w', encoding='utf8', newline='\n') as f:
            json.dump(meta, f, indent=2); f.write('\n')
        print(pid, lean.shape[:2], simple.shape[:2], sorted(sets))


if __name__ == '__main__':
    main()
