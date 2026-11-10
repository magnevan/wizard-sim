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
    """The bought gatehouse faces the camera. Shearing each column down 1 px per 2 across lays it on the line the wall runs on, and the doors swing open through the arch."""
    a = np.array(c)
    h, w = a.shape[:2]
    cx, pad = w // 2, w // 4 + 2
    left = c.crop((43, 64, 85, 120)).resize((18, 56), Image.NEAREST)
    right = c.crop((88, 64, 130, 120)).resize((18, 56), Image.NEAREST)
    a[62:126, 42:131] = 0                     # the closed doors go
    fall = lambda x: pad + (x - cx) // 2
    out = Image.new('RGBA', (w + 22, h + pad * 2 + 20))
    for leaf, jamb in ((left, 41), (right, 118)):  # each leaf runs back through the arch, up and to the right
        s = np.array(leaf)
        for i in range(s.shape[1]):
            col = Image.fromarray(s[:, i:i + 1])
            out.alpha_composite(col, (jamb + i, 64 + fall(jamb) + 8 - i // 2))
    body = np.zeros((h + pad * 2 + 20, w + 22, 4), np.uint8)
    for x in range(w):
        y0 = fall(x)
        body[y0:y0 + h, x] = a[:, x]
    out.alpha_composite(Image.fromarray(body))
    box = out.getchannel('A').getbbox()
    return out.crop((0, box[1], w, box[3])), h - 2 + pad - box[1]


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
    im, foot_y = angled_gate(trim(Image.open(os.path.join(ROOT, GATE_RAW)).convert('RGBA')))
    register('battery-gatehouse', 'Gatehouse (battery)', [7.0, 1.0], im, GATE_RAW, 'create_map_object', 'trimmed, sheared 2:1 to run along the wall, doors swung open', foot=[im.width // 2, foot_y])
    meta = os.path.join(ASSETS, 'battery-gatehouse', 'meta.json')
    m = json.load(open(meta))
    m['lift'] = 40  # drawn 40 px above its spot: the art is on the wall line, and it sorts in front of the pieces that join it
    json.dump(m, open(meta, 'w'), indent=2)
    print('registered', len(PIECES) + 2)


if __name__ == '__main__':
    main()
