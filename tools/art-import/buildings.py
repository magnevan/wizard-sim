"""Buildings assembled from the bought building kits, on the world's own tile grid, so doors and storeys are a person's
size by construction (the user, 2026-11-14: buildings bought as one picture come out the wrong scale). No generation calls.

  python tools/art-import/buildings.py [--sheet out.png]

Each building is a rectangle of whole kit tiles (one tile is 48 x 24 art px, 2.12 world units a side): walls round its
edge from the kit's side and corner pieces, doorways where asked, and the kit's hip roof on top (eaves on the edges,
hips at the corners, the flat middle inside). It is written as one prop, `bldg-<name>`, whose footprint is exactly its
tiles, so it blocks and sorts like any prop. Raw kits: game/content/generated/pixellab/opening/kit-academy-ext and
kit-timber (tools/segments/01-opening/yard-buy.json has their descriptions).
"""
import os, sys
import numpy as np
from PIL import Image, ImageChops
from props import ROOT, register

RAWREL = 'game/content/generated/pixellab/opening'
INTERIOR = (28, 22, 20, 255)  # the dark seen through a doorway
TILE_U = 24 / (0.5 ** 0.5 * 16)  # world units along a tile's edge: 24 px across the screen at 16 px a unit, turned 45 degrees
# kit piece indices (get_tiles_pro's placement rules; the same in both kits)
P = dict(side=dict(N=1, E=2, S=3, W=4), outer=dict(NE=9, SE=10, SW=11, NW=12), door=dict(N=32, E=34, S=36, W=38),
         eave=dict(N=60, E=61, S=62, W=63), hip=dict(NE=64, SE=65, SW=66, NW=67), roof_mid=79,
         ridge=dict(EW=72, NS=73), end=dict(E=74, W=75, N=76, S=77))
KITS = {
    # wall height in tiles, and where the tile's middle sits in each 76 px wide piece
    'academy': dict(raw='kit-academy-ext', walls=3, cy=91),
    'timber': dict(raw='kit-timber', walls=2, cy=67),
}
# name: kit, size in tiles along x (east) and y (south), doorways as (side, tile along that side), what it's for
BUILDINGS = {
    'academy-hall': ('academy', 6, 3, [('S', 2), ('E', 1)], 'The academy hall, two storeys'),
    'academy-wing': ('academy', 3, 4, [('E', 1)], 'A wing of the academy'),
    'barracks': ('timber', 4, 2, [('S', 1)], 'The hired soldiers\' barracks'),
    'shed': ('timber', 2, 2, [('S', 0)], 'A shed'),
}


def piece(kit, i):
    return Image.open(os.path.join(ROOT, RAWREL, KITS[kit]['raw'], f'tile_{i:02d}.png')).convert('RGBA')


def compose(kit, W, D, doors):
    k = KITS[kit]
    lift = k['walls'] * 24
    pw, ph = piece(kit, 0).size
    # cell (i, j) -> its tile's middle, relative to the building's west corner
    span_x, span_y = (W + D) * 24, (W + D) * 12
    pad_top = lift + ph
    img = Image.new('RGBA', (span_x + pw, span_y + pad_top + 24), (0, 0, 0, 0))
    ox, oy = D * 24 + pw // 2, pad_top

    def at(i, j):
        return ox + (i - j) * 24, oy + (i + j) * 12 + 12

    def stamp(idx, i, j, up=0):
        cx, cy = at(i, j)
        img.alpha_composite(piece(kit, idx), (cx - 38, cy - k['cy'] - up))

    # the floor first, so a doorway looks in on the floor and the far walls' inner faces, not through the building
    for j in range(D):
        for i in range(W):
            stamp(0, i, j)
    door = set(doors)
    walls = []
    for j in range(D):
        for i in range(W):
            n, s, w, e = j == 0, j == D - 1, i == 0, i == W - 1
            parts = []
            if n: parts.append(('N', i))
            if s: parts.append(('S', i))
            if w: parts.append(('W', j))
            if e: parts.append(('E', j))
            for side, along in parts:
                walls.append((i + j, i, j, P['door'][side] if (side, along) in door else P['side'][side]))
    # back to front: far cells first, and within a cell the far sides (N, W) before the near (S, E)
    holes = Image.new('L', img.size, 0)
    for _, i, j, idx in sorted(walls, key=lambda t: (t[0], t[3] in (P['side']['S'], P['side']['E'], P['door']['S'], P['door']['E']))):
        stamp(idx, i, j)
        side = next((s for s, d in P['door'].items() if d == idx), None)
        if side:
            # the doorway's hole: where the plain wall is solid and the door piece isn't
            wall_a, door_a = np.array(piece(kit, P['side'][side]).getchannel('A')), np.array(piece(kit, idx).getchannel('A'))
            cx, cy = at(i, j)
            holes.paste(255, (cx - 38, cy - k['cy']), Image.fromarray(((wall_a > 0) & (door_a == 0)).astype('uint8') * 255))
    # a doorway looks into the dark, wherever it shows nothing of the floor or the far walls
    see = img.getchannel('A').point(lambda a: 255 if a == 0 else 0)
    img =Image.composite(Image.new('RGBA', img.size, INTERIOR), img, ImageChops.multiply(holes, see))
    roof = []
    for j in range(D):
        for i in range(W):
            n, s, w, e = j == 0, j == D - 1, i == 0, i == W - 1
            if W == 1 and D == 1:
                idx = 78
            elif D == 1:
                idx = P['end']['W'] if w else P['end']['E'] if e else P['ridge']['EW']
            elif W == 1:
                idx = P['end']['N'] if n else P['end']['S'] if s else P['ridge']['NS']
            elif n and w: idx = P['hip']['NW']
            elif n and e: idx = P['hip']['NE']
            elif s and w: idx = P['hip']['SW']
            elif s and e: idx = P['hip']['SE']
            elif n: idx = P['eave']['N']
            elif s: idx = P['eave']['S']
            elif w: idx = P['eave']['W']
            elif e: idx = P['eave']['E']
            else: idx = P['roof_mid']
            roof.append((i + j, i, j, idx))
    for _, i, j, idx in sorted(roof):
        stamp(idx, i, j, lift)
    # the foot: the middle of the building's floor, where the prop's spot is
    fx, fy = at((W - 1) / 2, (D - 1) / 2)
    box = img.getchannel('A').getbbox()
    return img.crop(box), [round(fx - box[0]), round(fy - box[1])]


def main():
    sheet = sys.argv[sys.argv.index('--sheet') + 1] if '--sheet' in sys.argv else None
    made = []
    for name, (kit, W, D, doors, what) in BUILDINGS.items():
        im, foot = compose(kit, W, D, doors)
        pid = 'bldg-' + name
        register(pid, what, [round(W * TILE_U, 3), round(D * TILE_U, 3)], im, f'{RAWREL}/{KITS[kit]["raw"]}', 'create_building_kit (assembled)',
                 edits=f'assembled from the kit: {W} x {D} tiles, doors {doors}', foot=foot)
        made.append(im)
        print(pid, im.size, 'foot', foot, 'footprint', round(W * TILE_U, 2), 'x', round(D * TILE_U, 2))
    if sheet:
        w = sum(m.width for m in made) + 20 * len(made)
        out = Image.new('RGBA', (w, max(m.height for m in made)), (58, 74, 46, 255))
        x = 0
        for m in made:
            out.alpha_composite(m, (x, out.height - m.height)); x += m.width + 20
        out.resize((out.width * 2, out.height * 2), Image.NEAREST).save(sheet)


if __name__ == '__main__':
    main()
