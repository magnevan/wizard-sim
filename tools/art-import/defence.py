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
KIT_RAW = f'{RAWREL}/kit-fortification'
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


def kit_gate():
    """The gate, assembled from the fortification kit the wall is built from, so it is true isometric in the wall's own stone.
    Two pylons of solid blocks, two tiles square and a storey and a bit tall, either side of a three-tile opening with a
    full-depth stone span over it. A tile (i, j): +i runs along the wall, down and to the right on screen; +j runs north, up and to the right.
    The wall's line is the north edge of row j = 0. Every piece's top diamond vertex is at (38, 55) in its 76 x 86 canvas."""
    raw = os.path.join(ROOT, KIT_RAW)
    piece = lambda n: Image.open(os.path.join(raw, f'tile_{n:02d}.png')).convert('RGBA')
    BLOCK = piece(52)
    LEFT, RIGHT, OPEN = [0, 1], [5, 6], [2, 3, 4]
    PYLON_STOREY, SPAN_LIFT, CUT = 30, 22, 28    # art px: the second block's rise, the span's, and how much of a block's foot is cut away for the opening
    O = (70, 150)
    G = lambda i, j: (O[0] + 24 * i + 24 * j, O[1] + 12 * i - 12 * j)
    a = np.array(BLOCK)
    span = np.zeros_like(a)
    for x in range(a.shape[1]):
        ys = np.where(a[:, x, 3] > 0)[0]
        if len(ys):
            end = ys[-1] - CUT
            span[ys[0]:end + 1, x] = a[ys[0]:end + 1, x]
            span[max(ys[0], end - 2):end, x] = (118, 88, 60, 255)    # a timber under the stone, as on the wall's bracing
            span[end, x] = (42, 30, 22, 255)
    span = Image.fromarray(span)
    out = Image.new('RGBA', (380, 300))
    for j in (1, 0):
        for i in LEFT + OPEN + RIGHT:
            x, y = G(i, j)
            if i in OPEN:
                out.alpha_composite(span, (x - 38, y - 55 - SPAN_LIFT))
            else:
                out.alpha_composite(BLOCK, (x - 38, y - 55))
                out.alpha_composite(BLOCK, (x - 38, y - 55 - PYLON_STOREY))
    box = out.getchannel('A').getbbox()
    fx, fy = G(3.5, 0)
    return out.crop(box), int(fx - box[0]), int(fy - box[1])


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
    im, foot_x, foot_y = kit_gate()
    register('battery-gatehouse', 'Gatehouse (battery)', [7.0, 1.0], im, f'{KIT_RAW}/tile_52.png', 'create_building_kit', 'assembled from the fortification kit: block 52 for the pylons, and cut off at the foot for the span over the opening', foot=[foot_x, foot_y])
    meta = os.path.join(ASSETS, 'battery-gatehouse', 'meta.json')
    m = json.load(open(meta))
    m['lift'] = 40  # drawn 40 px above its spot: the art is on the wall line, and it sorts in front of the pieces that join it
    json.dump(m, open(meta, 'w'), indent=2)
    print('registered', len(PIECES) + 2)


if __name__ == '__main__':
    main()
