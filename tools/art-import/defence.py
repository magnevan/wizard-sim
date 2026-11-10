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
KIT_RAW = f'{RAWREL}/kit-fortress'
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
    """The gate: two tall pillars from the fortress kit either side of the opening, which the wall of fire fills. Each is a
    solid block stacked up, standing across the wall's line, with four battlement stones on top (the kit's pillar, cut short).
    A tile (i, j): +i runs along the wall, down and to the right on screen; +j runs north, up and to the right. Every piece's
    top diamond vertex is at (38, 55) in its 76 x 86 canvas."""
    raw = os.path.join(ROOT, KIT_RAW)
    piece = lambda n: Image.open(os.path.join(raw, f'tile_{n:02d}.png')).convert('RGBA')
    BLOCK, PILLAR = piece(53), np.array(piece(31))
    STOREYS = [0, 30, 60]                       # art px each block rises
    CENTRE, HALF_OPENING = 3.5, 3 / 2.12        # tiles: the opening is 6 units, a tile 2.12
    O = (70, 190)
    G = lambda i, j: (O[0] + 24 * i + 24 * j, O[1] + 12 * i - 12 * j)
    merlon = np.zeros_like(PILLAR)
    for x in range(PILLAR.shape[1]):
        ys = np.where(PILLAR[:, x, 3] > 0)[0]
        if len(ys):
            merlon[ys[0]:ys[0] + 20, x] = PILLAR[ys[0]:ys[0] + 20, x]
    merlon = Image.fromarray(merlon)
    out = Image.new('RGBA', (380, 340))
    for i in (CENTRE - HALF_OPENING - 1, CENTRE + HALF_OPENING):
        x, y = (int(round(v)) for v in G(i, .5))
        for rise in STOREYS:
            out.alpha_composite(BLOCK, (x - 38, y - 55 - rise))
        top = STOREYS[-1] + 8
        for dx, dy in ((0, -7), (-15, 0), (15, 0), (0, 7)):   # back, left, right, front: far to near
            out.alpha_composite(merlon, (x - 38 + dx, y - 55 - top + dy))
    box = out.getchannel('A').getbbox()
    fx, fy = G(CENTRE, 0)
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
    register('battery-gatehouse', 'Gatehouse (battery)', [7.0, 1.0], im, f'{KIT_RAW}/tile_53.png', 'create_building_kit', 'assembled from the fortress kit: block 53 stacked for two pillars, its pillar piece cut short for battlements', foot=[foot_x, foot_y])
    meta = os.path.join(ASSETS, 'battery-gatehouse', 'meta.json')
    m = json.load(open(meta))
    m['lift'] = 40  # drawn 40 px above its spot: the art is on the wall line, and it sorts in front of the pieces that join it
    json.dump(m, open(meta, 'w'), indent=2)
    print('registered', len(PIECES) + 2)


if __name__ == '__main__':
    main()
