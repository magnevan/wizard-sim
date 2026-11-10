"""Writes the Battery level (game/content/maps/world/Battery.ldtkl) from the Opening Segment's plan. No generation calls.

  python tools/segments/01-opening/battery-level.py
  (then, from game/) npm run content:build && npm run content:check

It's an outdoor area, so there are no walls round it: treeline on every side, the fortified wall through the middle.
Coordinates below are the plan's on the page (84 x 72, origin top-left, north up), the same numbers as segment.js.
Running this replaces the level, so make hand edits here rather than in LDtk until the layout has settled.
"""
import copy, json, math, os, random, uuid

HERE = os.path.dirname(os.path.abspath(__file__))
MAPS = os.path.join(HERE, '../../../game/content/maps')
W, H, CELL = 84, 72, 0.5
CW, CH = int(W / CELL), int(H / CELL)
PX = 20
GROUND = dict(grass=1, dirt=2, sand=3, flagstone=4, cobble=5, mud=6, leaves=7, gravel=8, ash=9, planks=10, slabs=11, water=12)
NS = uuid.UUID('6e1f6d2a-6c3b-4a55-9d3c-2f3f0c6b7a11')
rng = random.Random(1207)
CX = 42
TOWERS = [16, 29, 55, 68]  # 13 apart, and 13 from the gate, which is 15 long on screen: a tower never touches it
WALL_Y = 35
GATE = (39, 45)            # the opening you walk through
GATE_SHIFT = 3.5           # see tools/art-import/defence.py: the gatehouse's spot is this far down the screen from its art
WELL = (42, 54)            # well back from the gate, with the yard open round it
GAPS = [(19, 25), (39, 45), (61, 67)]
PORTALS = [(22, 2.5), (42, 2.5), (64, 2.5)]
ROAD = (39, 45)            # the road in from the south


def iid(*parts):
    return str(uuid.uuid5(NS, '/'.join(map(str, parts))))


# ---- ground ----------------------------------------------------------------------------------------------------------
lattice = {}
def smooth(x, y, seed):
    ix, iy = math.floor(x), math.floor(y)
    fx, fy = x - ix, y - iy
    fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    def v(a, b):
        return lattice.setdefault((a, b, seed), random.Random(f'{a},{b},{seed}').random())
    return (v(ix, iy) * (1 - fx) + v(ix + 1, iy) * fx) * (1 - fy) + (v(ix, iy + 1) * (1 - fx) + v(ix + 1, iy + 1) * fx) * fy

def noise(x, y, seed):
    return smooth(x / 5, y / 5, seed) * .65 + smooth(x / 2, y / 2, seed + 1) * .35

grid = [[GROUND['grass']] * CW for _ in range(CH)]
def paint(test, mat):
    for cy in range(CH):
        for cx in range(CW):
            x, y = (cx + .5) * CELL, (cy + .5) * CELL
            if test(x, y):
                grid[cy][cx] = GROUND[mat]

def rect(x0, y0, w, h, rough=2.0, seed=1):
    def t(x, y):
        d = min(x - x0, x0 + w - x, y - y0, y0 + h - y)
        return d + (noise(x, y, seed) - .5) * rough * 2 > 0
    return t

def seg_dist(x, y, a, b):
    ax, ay = a; bx, by = b
    dx, dy = bx - ax, by - ay
    k = max(0, min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(x - ax - k * dx, y - ay - k * dy)

def path(points, width, rough=.5, seed=7):
    def t(x, y):
        d = min(seg_dist(x, y, points[i], points[i + 1]) for i in range(len(points) - 1))
        return d < width / 2 + (noise(x, y, seed) - .5) * rough * 2
    return t

def disc(cx, cy, r):
    return lambda x, y: math.hypot(x - cx, y - cy) < r

# treeline floor, north band broken by the three gaps
in_gap = lambda x: any(a <= x <= b for a, b in GAPS)
paint(lambda x, y: x < 4 + noise(x, y, 40) * 2 or x > W - 4 - noise(x, y, 41) * 2 or (y < 5 + noise(x, y, 42) * 2 and not in_gap(x)) or (y > H - 4 - noise(x, y, 43) * 2 and not ROAD[0] <= x <= ROAD[1]), 'leaves')
# the killing ground: worn to dirt, churned by the walls, scorched where old fights burned
paint(rect(6, 6, W - 12, 28, 2.2, 11), 'dirt')
paint(lambda x, y: 22 < y < 34 and 6 < x < W - 6 and noise(x, y, 12) > .56, 'mud')
paint(lambda x, y: 13 < y < 33 and 7 < x < W - 7 and noise(x, y, 13) > .67, 'ash')
for a, b in GAPS:
    paint(rect(a + .5, 0, b - a - 1, 8, .8, 14), 'dirt')
# the rear yard: open, trodden by the crews along the wall and to the stores
paint(rect(9, 39, W - 18, 11, 2.2, 15), 'dirt')
paint(path([(42, 42), (42, 49)], 5, .8, 23), 'dirt')
paint(path([(20, 47), (34, 52), (42, 60)], 2.6, .8, 24), 'dirt')
paint(path([(68, 47), (50, 52), (42, 60)], 2.6, .8, 25), 'dirt')
paint(lambda x, y: 9 < x < W - 12 and 40 < y < 49 and noise(x, y, 16) > .7, 'gravel')
# road in from the south, the wall's footing, the way out through the gate to the north gap
paint(rect(ROAD[0], 58, ROAD[1] - ROAD[0], H - 58, .6, 17), 'cobble')
paint(lambda x, y: WALL_Y - 2.2 < y - (noise(x, y, 18) - .5) * 1.2 < WALL_Y + 2.2, 'gravel')
paint(rect(GATE[0] - .5, WALL_Y - 4, 7, 9, .3, 19), 'cobble')
paint(path([(CX, WALL_Y - 4), (CX, 26), (64, 10), (64, 0)], 3.2, .6, 20), 'gravel')
# the well on its flagged apron, and the trenches for the feed lines
paint(disc(*WELL, 6.5), 'cobble')
for x in TOWERS:
    paint(path([WELL, (x, 41)], 1.0, .1, 21), 'gravel')
# the pump and the stores' hardstanding
paint(disc(16, 52, 2.4), 'gravel')
paint(rect(63, 47, 13, 12, .5, 22), 'gravel')

# ---- props -----------------------------------------------------------------------------------------------------------
props = []
def prop(asset, x, y, blocks=False):
    props.append((asset, x, y, blocks))

for x in TOWERS:
    prop('defence-tower', x, WALL_Y, True)
    prop('defence-head-north-east', x, WALL_Y)      # the same spot: the head lands on the tower's collar
    prop('control-pedestal', x, 41.5, True)
prop('battery-well', *WELL, True)
prop('battery-gatehouse', CX + GATE_SHIFT, WALL_Y + GATE_SHIFT)  # looks like it stands on the wall line, sorts in front of it
prop('lantern-post', 36.5, 41, True)
# stores, kept together in their own corner
prop('storehouse', 70, 51, True)
for asset, x, y in [('crates-canvas', 64.5, 57), ('crate-fittings', 67, 57.5), ('barrel', 64.5, 48.5), ('barrel', 65.5, 47.8), ('supply-cart', 60.5, 53), ('handcart', 74, 58)]:
    prop(asset, x, y, True)
# the pump
prop('hand-pump', 16, 52, True)
for asset, x, y in [('barrel', 18.4, 53.2), ('crate-fittings', 21, 55)]:
    prop(asset, x, y, True)
# sandbags at the wall's far ends
for x in [9.5, 22.5, 61.5, 74.5]:
    prop('sandbags', x, WALL_Y + 2.2, True)
# lines of stakes out on the killing ground, and the two boulders
for x0, y, n in [(16.5, 24.3, 5), (60.5, 22.3, 5), (34.5, 18.3, 4)]:
    for i in range(n):
        prop('stakes', x0 + i * 1.75, y, True)
for cx, cy in [(24, 15), (53, 12)]:
    for dx, dy in [(0, 0), (1.5, .8), (-1.3, .9)]:
        prop('boulders-mossy', cx + dx, cy + dy, True)
# the treeline: every side
def clear(x, y):
    return not (any(math.hypot(x - a, y - b) < 3.6 for a, b in PORTALS) or (ROAD[0] - 1 < x < ROAD[1] + 1 and y > 60) or (y < 6 and any(a + .8 < x < b - .8 for a, b in GAPS)))
def band(x0, y0, x1, y1):
    y = y0 + 1
    while y < y1:
        x = x0 + 1
        while x < x1:
            px, py = x + rng.uniform(-.8, .8), y + rng.uniform(-.8, .8)
            if clear(px, py) and 0.6 < px < W - .6 and .6 < py < H - .6:
                asset = rng.choice(['pine', 'pine', 'oak', 'oak', 'oak-autumn', 'bush-round'])
                prop(asset, round(px * 2) / 2, round(py * 2) / 2, True)
            x += 3.0
        y += 3.0
band(0, 0, 4.5, H)
band(W - 4.5, 0, W, H)
band(4.5, 0, W - 4.5, 4.5)
band(4.5, H - 4, W - 4.5, H)

# ---- the level -------------------------------------------------------------------------------------------------------
source = json.load(open(os.path.join(MAPS, 'world/Academy.ldtkl'), encoding='utf-8'))
samples = {}
for li in source['layerInstances']:
    for e in li['entityInstances']:
        samples.setdefault(e['__identifier'], e)

def entity(kind, n, x, y, fields=None):
    e = copy.deepcopy(samples[kind])
    px = [int(round(min(W, max(0, x)) * PX)), int(round(min(H, max(0, y)) * PX))]
    e.update(iid=iid(kind, n), px=px, __grid=[px[0] // 10, px[1] // 10])
    for f in e['fieldInstances']:
        if kind == 'Portal':
            continue
        v = (fields or {}).get(f['__identifier'])
        f['__value'] = v
        tag = {'Int': 'V_Int', 'Float': 'V_Float', 'String': 'V_String', 'Bool': 'V_Bool'}[f['__type']]
        f['realEditorValues'] = [{'id': tag, 'params': [v]}]
    return e

es = []
for s, (x, y) in enumerate([(40.5, 63), (43.5, 63), (40.5, 65.5), (43.5, 65.5)]):
    es.append(entity('PlayerStart', s, x, y, {'seat': s}))
for i, (x, y) in enumerate(PORTALS):
    es.append(entity('Portal', i, x, y))
# the wall: Rock either side of the gate, world units (the area's centre is the origin). It stops at each tower, which
# blocks by itself, so it never cuts across one.
runs, at = [], 0
for x in TOWERS[:2]:
    runs.append((at, x - 2.5)); at = x + 3
runs.append((at, GATE[0])); at = GATE[1]
for x in TOWERS[2:]:
    runs.append((at, x - 2.5)); at = x + 3
runs.append((at, W))
for i, (a, b) in enumerate(runs):
    wy = WALL_Y - H / 2
    es.append(entity('Rock', i, (a + b) / 2, WALL_Y, {'x1': a - W / 2, 'y1': wy, 'x2': b - W / 2, 'y2': wy}))
for i, (asset, x, y, blocks) in enumerate(props):
    es.append(entity('Prop', i, x, y, {'asset': asset, 'blocks': blocks}))

level_uid = 109
level = copy.deepcopy(source)
level.update(identifier='Battery', iid=iid('level'), uid=level_uid, worldX=3880, worldY=0, pxWid=W * PX, pxHei=H * PX, externalRelPath=None)
for n, li in enumerate(level['layerInstances']):
    li.update(__cWid=CW, __cHei=CH, iid=iid('layer', li['__identifier']), levelId=level_uid, seed=4412100 + n)
    if li['__identifier'] == 'Entities':
        li['entityInstances'] = es
    elif li['__identifier'] == 'Terrain':
        li['intGridCsv'] = [0] * (CW * CH)
    elif li['__identifier'] == 'Ground':
        li['intGridCsv'] = [v for row in grid for v in row]
json.dump(level, open(os.path.join(MAPS, 'world/Battery.ldtkl'), 'w', encoding='utf-8', newline='\n'), indent=2)

p = os.path.join(MAPS, 'world.ldtk')
project = json.load(open(p, encoding='utf-8'))
entry = copy.deepcopy(next(l for l in project['levels'] if l['identifier'] == 'Academy'))
entry.update(identifier='Battery', iid=level['iid'], uid=level_uid, worldX=3880, worldY=0, pxWid=W * PX, pxHei=H * PX, externalRelPath='world/Battery.ldtkl')
project['levels'] = [l for l in project['levels'] if l['identifier'] != 'Battery'] + [entry]
project['nextUid'] = max(project['nextUid'], level_uid + 1)
json.dump(project, open(p, 'w', encoding='utf-8', newline='\n'), indent=2)
print('Battery:', len(props), 'props,', len(es), 'entities')
