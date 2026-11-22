"""Draws a grey-box building exactly as the game's camera sees it (game/packages/client/src/art/massing.ts), on flat
magenta, at one art pixel per image pixel: the shape reference for a Codex paint of the building (paint.txt), and the
mask its result is cut to, so the art lands exactly where the grey box stood. No generation calls.

  python tools/building-art/silhouette.py <building> [--out dir]     (buildings: see BUILDINGS below)

Writes <out>/<building>-shape.png (grey box on magenta, 1774 x 887, Codex's native size; a building too big for it is
drawn smaller and its json says by how much), <building>-mask.png (white
where the building is) and <building>.json (where the plan point (x1, y1, 0) of the building's first block lands in
the image, so the client can place the cut-out: art/massing.ts `art`).

Keep the block numbers in step with art/massing.ts (the academy round the yard; plan units, origin at the map's
top-left, heights in metres).
"""
import json, math, os, sys
from PIL import Image, ImageDraw

M = 1 / 0.6                  # units per metre
PPU, FY, PX_PER_M = 16, 0.5, 14.5
S = math.sqrt(0.5)
MAP_W, MAP_H = 130, 100      # the yard; a building in another map says so in MAP_OF
CANVAS = (1774, 887)
MAGENTA, WALL, SIDE, ROOF, DARK = (255, 0, 255), (170, 163, 148), (131, 124, 110), (86, 98, 122), {'window': (44, 51, 64), 'door': (74, 54, 38), 'void': (20, 22, 27)}

def block(id, x0, x1, y0, y1, h, rise=0, ridge=None, east=(), south=()):
    return dict(id=id, x0=x0, x1=x1, y0=y0, y1=y1, h=h, rise=rise, ridge=ridge, east=list(east), south=list(south))

def row(frm, to, every, w, z0, z1, kind='window'):
    out, s = [], frm
    while s + w <= to + 1e-6:
        out.append((s, w, z0, z1, kind)); s += every
    return out

ARMOURY_X = 100
BUILDINGS = {
    'great-hall': [block('great-hall', -22 * M, 0, -12 * M, 64, 14, 10, 'y',
                         east=row(4, 31, 5, 2.2, 3.5, 11.5) + row(39, 50, 5, 2.2, 3.5, 11.5) + [(33.4, 3.2, 0, 5.2, 'door'), (33.9, 2.2, 7, 11.5, 'window')])],
    'library': [block('library', -18 * M, 0, 64, 112, 9, 6, 'y', east=row(2, 28, 4, 1.8, 2.5, 7.5))],
    'workshops-west': [block('workshops-west', 0, 71, -12 * M, 0, 13, 6, 'x',
                             south=row(3, 42, 4.5, 2.4, 1, 3.9) + row(3, 42, 4.5, 1.4, 6.2, 8.4) + row(3, 42, 4.5, 1.4, 10.2, 12.2))],
    'armoury': [block('workshops-east', 71, 142, -12 * M, 0, 13, 6, 'x',
                      south=row(1.5, 42, 4.5, 2.4, 1, 3.9) + row(1.5, 42, 4.5, 1.4, 6.2, 8.4) + row(1.5, 42, 4.5, 1.4, 10.2, 12.2)),
                block('armoury', ARMOURY_X - 3.5 * M, ARMOURY_X + 3.5 * M, -10 * M, 0, 22, 5, 'x',
                      south=[(1.8, 3.4, 0, 4.2, 'door'), (2.5, 2, 8, 11, 'window'), (2.5, 2, 14, 17, 'window')])],
    # the armillary on its plinth in the courtyard: drawn as the plinth with a tall block where the sphere stands, painted as one
    'armillary': [block('plinth', 95, 105, 77, 87, 1.6), block('sphere', 96.5, 103.5, 78.5, 85.5, 9)],
    # the courtyard (court-level.py, 150 x 110): the main building along the north in two halves and its tower over the
    # portal, the cloister range along the west in two halves, its archway through to the yard in the northern half
    'court-north-west': [block('court-north-west', 0, 69, -14 * M, 0, 16, 8, 'x',
                               south=row(3, 40, 4.5, 2.4, 1.2, 4.6) + row(3, 40, 4.5, 1.6, 7.4, 10.2) + row(3, 40, 4.5, 1.6, 12.2, 14.8))],
    'court-north-east': [block('court-north-east', 81, 154, -14 * M, 0, 16, 8, 'x',
                               south=row(2, 43, 4.5, 2.4, 1.2, 4.6) + row(2, 43, 4.5, 1.6, 7.4, 10.2) + row(2, 43, 4.5, 1.6, 12.2, 14.8))],
    'court-tower': [block('court-tower', 66, 84, -16 * M, 1, 30, 9, 'x',
                          south=[(2.6, 5.6, 0, 7.5, 'door'), (3.6, 3.6, 11, 15, 'window'), (3.6, 3.6, 18.5, 22.5, 'window'), (4.1, 2.6, 25, 28, 'window')])],
    'court-west-north': [block('court-west-north', -20 * M, 0, -14 * M, 55, 14, 9, 'y',
                               east=row(3, 27, 4.5, 2.2, 3.5, 11) + row(42, 55, 4.5, 2.2, 3.5, 11) + [(29.5, 7.5, 0, 7, 'void')])],
    'court-west-south': [block('court-west-south', -20 * M, 0, 55, 124, 14, 9, 'y',
                               east=row(2, 40, 4.5, 2.2, 3.5, 11))],
}
MAP_OF = {name: (150, 110) for name in ('court-north-west', 'court-north-east', 'court-tower', 'court-west-north', 'court-west-south')}

def pt(px, py, z):
    x, y = px - MAP[0] / 2, py - MAP[1] / 2
    return ((x - y) * S * PPU, (x + y) * S * PPU * FY - z * PX_PER_M)

def faces(b):
    """The polygons the game draws for a block, far to near, with their colours."""
    x0, y0, x1, y1, h, rise = b['x0'], b['y0'], b['x1'], b['y1'], b['h'], b['rise']
    out = [([pt(x1, y0, 0), pt(x1, y1, 0), pt(x1, y1, h), pt(x1, y0, h)], SIDE),
           ([pt(x0, y1, 0), pt(x1, y1, 0), pt(x1, y1, h), pt(x0, y1, h)], WALL)]
    def openings(face):
        along = (x1 - x0) if face == 'south' else (y1 - y0)
        for at, w, z0, z1, kind in b[face]:
            if at < 0 or at + w > along / M:
                continue
            P = (lambda s, z: pt(x0 + s * M, y1, z)) if face == 'south' else (lambda s, z: pt(x1, y0 + s * M, z))
            out.append(([P(at, z0), P(at + w, z0), P(at + w, z1), P(at, z1)], DARK[kind]))
    openings('east'); openings('south')
    if not rise:
        out.append(([pt(x0, y0, h), pt(x1, y0, h), pt(x1, y1, h), pt(x0, y1, h)], (201, 194, 178)))
    elif b['ridge'] == 'x':
        ym = (y0 + y1) / 2
        out += [([pt(x0, y1, h), pt(x1, y1, h), pt(x1, ym, h + rise), pt(x0, ym, h + rise)], ROOF), ([pt(x1, y0, h), pt(x1, y1, h), pt(x1, ym, h + rise)], SIDE)]
    else:
        xm = (x0 + x1) / 2
        out += [([pt(x1, y0, h), pt(x1, y1, h), pt(xm, y1, h + rise), pt(xm, y0, h + rise)], ROOF), ([pt(x0, y1, h), pt(x1, y1, h), pt(xm, y1, h + rise)], WALL)]
    return out

MAP = (MAP_W, MAP_H)

def render(name, out_dir):
    global MAP
    MAP = MAP_OF.get(name, (MAP_W, MAP_H))
    blocks = BUILDINGS[name]
    polys = [f for b in blocks for f in faces(b)]
    xs = [p[0] for poly, _ in polys for p in poly]; ys = [p[1] for poly, _ in polys for p in poly]
    w, h = max(xs) - min(xs), max(ys) - min(ys)
    # too big for one image: draw it smaller (k < 1) and scale the cut-out back up by 1 / k afterwards (cut.py)
    k = min(1.0, (CANVAS[0] - 40) / w, (CANVAS[1] - 40) / h)
    polys = [([(x * k, y * k) for x, y in poly], col) for poly, col in polys]
    xs, ys, w, h = [x * k for x in xs], [y * k for y in ys], w * k, h * k
    ox, oy = (CANVAS[0] - w) / 2 - min(xs), (CANVAS[1] - h) / 2 - min(ys)
    shape, mask = Image.new('RGB', CANVAS, MAGENTA), Image.new('L', CANVAS, 0)
    ds, dm = ImageDraw.Draw(shape), ImageDraw.Draw(mask)
    for poly, col in polys:
        q = [(x + ox, y + oy) for x, y in poly]
        ds.polygon(q, fill=col, outline=(93, 87, 76)); dm.polygon(q, fill=255)
    os.makedirs(out_dir, exist_ok=True)
    shape.save(os.path.join(out_dir, f'{name}-shape.png')); mask.save(os.path.join(out_dir, f'{name}-mask.png'))
    b = blocks[0]
    ax, ay = pt(b['x1'], b['y1'], 0)
    meta = dict(building=name, scale=round(k, 4), anchor_plan=[b['x1'], b['y1']], anchor_px=[round(ax * k + ox, 2), round(ay * k + oy, 2)], size=list(CANVAS), bbox=[round(min(xs) + ox), round(min(ys) + oy), round(max(xs) + ox), round(max(ys) + oy)])
    json.dump(meta, open(os.path.join(out_dir, f'{name}.json'), 'w'), indent=1)
    print(name, f'{w:.0f} x {h:.0f} px at scale {k:.3f}', meta['anchor_px'])

if __name__ == '__main__':
    out = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else os.path.join(os.path.dirname(__file__), 'out')
    for n in ([a for a in sys.argv[1:] if not a.startswith('--') and a != out] or BUILDINGS):
        render(n, out)
