"""The battery's defence into the asset registry: one tower and its heads, as separate props. No generation calls.

  python tools/art-import/defence.py

The tower and heads share a 128 px canvas in the raw files, so every piece gets the same anchor on that canvas (the
tower's base, centred). Trimmed heads keep it, which puts their foot below their own image. Placed on the same spot, a
head lands exactly on the collar. The anchor is the middle of the tower's round base, so a blocking footprint sits under it. The turning facings are north, north-east (the default) and east, and a burnt-out
defence doesn't turn, so it has one head. The well's four candidates are kept raw, and candidate 1 is the one in use.
"""
import json, os
import numpy as np
from PIL import Image
from props import ASSETS, RAWREL, ROOT, register, trim

DEFENCE = f'{RAWREL}/defence'
WELL_RAW = f'{RAWREL}/well/candidate-1.png'
GATE_RAW = f'{RAWREL}/buildings/gatehouse.png'
FOOTPRINT = [5.0, 5.0]
HEAD_FOOTPRINT = [1.0, 1.0]
PIECES = [
    ('defence-tower', 'Defence tower', FOOTPRINT, 'tower-clean.png', 'flame-candidate-2 with the head lifted out and the hole patched from the north rotation'),
    ('defence-tower-burnt', 'Defence tower, burnt out', FOOTPRINT, 'tower-burnt.png', 'tower-clean darkened by hand: crystal black and cracked, soot, gold dulled, snapped to the warm half of the palette'),
    ('defence-head-north', 'Defence head, north', HEAD_FOOTPRINT, 'head-north-placed.png', 'head masked out, rotated at 64 px through /v2/rotate'),
    ('defence-head-north-east', 'Defence head, north-east', HEAD_FOOTPRINT, 'head-north-east-placed.png', 'head masked out of flame-candidate-2'),
    ('defence-head-east', 'Defence head, east', HEAD_FOOTPRINT, 'head-east-placed.png', 'head masked out, rotated at 64 px through /v2/rotate, old flame removed, the original flame pasted on'),
    ('defence-head-burnt', 'Defence head, burnt out', HEAD_FOOTPRINT, 'head-burnt-placed.png', 'north-east head, flame removed, darkened, snapped to the warm half of the palette'),
]


def angled_gate(c):
    """The bought gatehouse is a flat front facing the camera. Each column is sheared down 1 px per 2 across, which lays it on
    the line the wall runs on. Then it's extruded back through the wall (up and to the right on screen) so the pylons and the
    arch have lit tops and shaded brick sides. The doors swing open against the jambs."""
    a = np.array(c)
    h, w = a.shape[:2]
    D = 24                                    # thickness, art px across the screen: about 2 units
    cx, pad = w // 2, w // 4 + 2 + D // 2 + 2
    left = c.crop((43, 64, 85, 120)).resize((18, 56), Image.NEAREST)
    right = c.crop((88, 64, 130, 120)).resize((18, 56), Image.NEAREST)
    a[62:126, 42:131] = 0                     # the closed doors go
    fall = lambda x: pad + (x - cx) // 2
    H, W = h + pad * 2 + 20, w + D + 4
    body = np.zeros((H, W, 4), np.uint8)
    for x in range(w):
        body[fall(x):fall(x) + h, x] = a[:, x]
    solid = body[..., 3] > 0
    back = np.zeros((H, W, 4), np.uint8)
    mask = np.zeros((H, W), bool)
    TOP = np.array([186, 172, 150, 255]), np.array([160, 146, 128, 255])
    ys, xs = np.where(solid)
    def sweep(keep, paint):                   # far to near, so the nearest surface wins
        for i in range(D, 0, -1):
            for y, x in zip(ys, xs):
                ty, tx = y - (i + 1) // 2, x + i
                if keep(y, x) and 0 <= ty < H and 0 <= tx < W and not solid[ty, tx]:
                    back[ty, tx] = paint(y, x, i)
                    mask[ty, tx] = True
    def brick(y, x, i):                       # a face turned to the right, in shade
        row = min(34 + (y - fall(x)) % 90, h - 1)
        rgb = a[row, 5 + i % 24, :3] if a[row, 5 + i % 24, 3] else np.array([70, 62, 76])
        return (*(rgb * .62).astype(np.uint8), 255)
    sweep(lambda y, x: not solid[y, x + 1], brick)
    sweep(lambda y, x: not solid[y - 1, x], lambda y, x, i: TOP[1] if i % 9 == 0 else TOP[0])   # tops last, they catch the light
    holes = ~(mask | solid) & np.roll(mask | solid, 1, 1) & np.roll(mask | solid, -1, 1)
    back[holes] = np.roll(back, 1, 1)[holes]
    mask |= holes
    every = mask | solid
    edge = mask & ~(np.roll(every, 1, 0) & np.roll(every, -1, 0) & np.roll(every, 1, 1) & np.roll(every, -1, 1))
    back[edge] = (24, 18, 28, 255)
    out = Image.fromarray(back)
    for leaf, jamb in ((left, 41), (right, 118)):  # each leaf lies back along the passage, up and to the right
        s = np.array(leaf)
        for i in range(s.shape[1]):
            out.alpha_composite(Image.fromarray(s[:, i:i + 1]), (jamb + i, 64 + fall(jamb) + 8 - i // 2))
    out.alpha_composite(Image.fromarray(body))
    box = out.getchannel('A').getbbox()
    return out.crop((box[0], box[1], box[2], box[3])), cx - box[0], h - 2 + pad - box[1]


def main():
    raw = os.path.join(ROOT, DEFENCE)
    left, top, right, bottom = Image.open(os.path.join(raw, 'tower-clean.png')).getchannel('A').getbbox()
    anchor = ((left + right) // 2, bottom - (right - left) // 4)  # a circle's centre on the 2:1 ground
    for pid, name, footprint, file, edits in PIECES:
        im = Image.open(os.path.join(raw, file)).convert('RGBA')
        box = im.getchannel('A').getbbox()
        foot = [anchor[0] - box[0], anchor[1] - box[1]]
        register(pid, name, footprint, im.crop(box), f'{DEFENCE}/{file}', '/v2/rotate' if 'rotated' in edits else 'create_1_direction_object', edits, foot=foot)
    im = Image.open(os.path.join(ROOT, WELL_RAW)).convert('RGBA')
    box = im.getchannel('A').getbbox()
    im = im.crop(box)
    register('battery-well', 'Battery well', [5.0, 5.0], im, WELL_RAW, 'create_1_direction_object', foot=[im.width // 2, im.height - im.width // 4])
    # The gatehouse stands across the wall. The level puts its spot 3.5 u down the screen and `lift` raises the art back
    # by the same 40 px, so it sorts in front of the wall pieces that join it.
    im, foot_x, foot_y = angled_gate(trim(Image.open(os.path.join(ROOT, GATE_RAW)).convert('RGBA')))
    register('battery-gatehouse', 'Gatehouse (battery)', [7.0, 1.0], im, GATE_RAW, 'create_map_object', 'trimmed, sheared 2:1 to run along the wall, extruded back through the wall for depth, doors swung open', foot=[foot_x, foot_y])
    meta = os.path.join(ASSETS, 'battery-gatehouse', 'meta.json')
    m = json.load(open(meta))
    m['lift'] = 40  # drawn 40 px above its spot: the art is on the wall line, and it sorts in front of the pieces that join it
    json.dump(m, open(meta, 'w'), indent=2)
    print('registered', len(PIECES) + 2)


if __name__ == '__main__':
    main()
