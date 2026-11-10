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
from kits import tone
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


def kit_pillar():
    """A gate pillar from the fortress kit: a solid block stacked up, with four battlement stones on top (the kit's pillar, cut
    short). It's its own prop, one each side of the opening, so each sorts by where it stands: wall further from the camera goes
    behind it, wall nearer the camera in front. Every kit piece's top diamond vertex is at (38, 55) in its 76 x 86 canvas, so the
    middle of its ground tile is (38, 67)."""
    raw = os.path.join(ROOT, KIT_RAW)
    piece = lambda n: np.array(Image.open(os.path.join(raw, f'tile_{n:02d}.png')).convert('RGBA'))
    BLOCK, PILLAR = Image.fromarray(tone(piece(53))), tone(piece(31))
    STOREYS = [0, 30, 60]                       # art px each block rises
    merlon = np.zeros_like(PILLAR)
    for x in range(PILLAR.shape[1]):
        ys = np.where(PILLAR[:, x, 3] > 0)[0]
        if len(ys):
            merlon[ys[0]:ys[0] + 20, x] = PILLAR[ys[0]:ys[0] + 20, x]
    merlon = Image.fromarray(merlon)
    out = Image.new('RGBA', (120, 200))
    ox, oy = 22, 90                             # where the piece canvas goes
    for rise in STOREYS:
        out.alpha_composite(BLOCK, (ox, oy - rise))
    top = STOREYS[-1] + 8
    for dx, dy in ((0, -7), (-15, 0), (15, 0), (0, 7)):   # back, left, right, front: far to near
        out.alpha_composite(merlon, (ox + dx, oy - top + dy))
    box = out.getchannel('A').getbbox()
    return out.crop(box), ox + 38 - box[0], oy + 67 - box[1]


def split_well(im):
    """The well as two pictures on one canvas: the low steps, and everything standing on them. The drum's outline is an ellipse on
    the ground (centre DRUM_C, half-widths DRUM_R); above it is the drum's side, the rings and the crystal."""
    a = np.array(im)
    h, w = a.shape[:2]
    DRUM_C, DRUM_R = (51, 74), (35, 19)
    ys, xs = np.mgrid[0:h, 0:w]
    dx = np.clip(np.abs(xs - DRUM_C[0]) / DRUM_R[0], 0, 1)
    inside = np.abs(xs - DRUM_C[0]) <= DRUM_R[0]
    upper = (ys < 58) | (inside & (ys <= DRUM_C[1] + DRUM_R[1] * np.sqrt(1 - dx * dx)))
    top, steps = a.copy(), a.copy()
    top[~upper] = 0
    steps[upper] = 0
    return Image.fromarray(steps), Image.fromarray(top)


def main():
    raw = os.path.join(ROOT, DEFENCE)
    left, top, right, bottom = Image.open(os.path.join(raw, 'tower-clean.png')).getchannel('A').getbbox()
    anchor = ((left + right) // 2, bottom - (right - left) // 4)  # a circle's centre on the 2:1 ground
    for pid, name, footprint, file, edits in PIECES:
        im = Image.open(os.path.join(raw, file)).convert('RGBA')
        box = im.getchannel('A').getbbox()
        foot = [anchor[0] - box[0], anchor[1] - box[1]]
        register(pid, name, footprint, im.crop(box), f'{DEFENCE}/{file}', '/v2/rotate' if 'rotated' in edits else 'create_1_direction_object', edits, foot=foot, round_=footprint is FOOTPRINT)
    im = Image.open(os.path.join(ROOT, WELL_RAW)).convert('RGBA')
    box = im.getchannel('A').getbbox()
    im = im.crop(box)
    foot = [im.width // 2, im.height - im.width // 4]
    steps, top = split_well(im)
    # The steps sort at their back rim, so a body standing round them is in front and they show only under its feet; the drum, rings and crystal sort at the well's middle.
    register('battery-well', 'Battery well, steps', [5.0, 5.0], steps, WELL_RAW, 'create_1_direction_object', 'trimmed; split: the low steps only', foot=foot, round_=True, sort=-(im.width // 4 + 1))
    register('battery-well-top', 'Battery well, drum and rings', [1.0, 1.0], top, WELL_RAW, 'create_1_direction_object', 'trimmed; split: the drum, rings and crystal', foot=foot)
    im, foot_x, foot_y = kit_pillar()
    register('battery-pillar', 'Gate pillar', [2.1, 2.1], im, f'{KIT_RAW}/tile_53.png', 'create_building_kit', 'assembled from the fortress kit: block 53 stacked, its pillar piece cut short for battlements', foot=[foot_x, foot_y])
    print('registered', len(PIECES) + 2)


if __name__ == '__main__':
    main()
