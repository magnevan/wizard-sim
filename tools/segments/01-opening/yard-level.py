"""Writes the Drill Yard level (game/content/maps/world/Yard.ldtkl): the opening's beats 2 and 3. No generation calls.

  python tools/segments/01-opening/yard-level.py
  (then, from game/) npm run content:build && npm run content:check

A slice of the academy with its drill yard in it, not a room: the hall and the cloister you come out of along the south,
a garden, the barracks and the shed east, the remains of the old farm the yard was put on to the west, and a low wall
north with the gatehouse in it and fields past it. One worn path runs station to station in teaching order (the
user, 2026-11-10: "the path sets the layout"); the game finds the stations by their Markers (sim yard.ts).

Coordinates are the plan's (90 x 68, origin top-left, north up). Running this replaces the level, so make hand edits
here rather than in LDtk until the layout has settled. Markers whose id starts with "x-" are people who live here (the
client draws them, art/extras.ts): x-<kind>-<act>-<palette>-<variant>-<facing in degrees, 0 east, 90 south>-<n>.
"""
import copy, json, math, os, random, uuid

HERE = os.path.dirname(os.path.abspath(__file__))
MAPS = os.path.join(HERE, '../../../game/content/maps')
W, H, CELL = 90, 68, 0.5
CW, CH = int(W / CELL), int(H / CELL)
PX = 20
GROUND = dict(grass=1, dirt=2, sand=3, flagstone=4, cobble=5, mud=6, leaves=7, gravel=8, ash=9, planks=10, slabs=11, water=12)
NS = uuid.UUID('9b3c1e52-1d7a-4c0e-8f61-5a0d2c7e4b19')
rng = random.Random(2203)

WALL_Y = 5                  # the low wall along the north, the gatehouse in it
GATE_X = 46
# the stations (sim yard.ts finds them by these ids)
STRAW = [(16, 40), (19.5, 39.4), (23, 40), (26.5, 39.4)]
HEAVY, RING = (14.5, 31), (10.5, 27.5)
RETREAT = (28, 21.5)
PARRY, PARRY_HOME = (39, 32.5), (61, 32.5)
HANDS = (69, 16)
HANDS_IN = [(63.5, 10.5), (74.5, 10.5), (63.5, 21.5), (74.5, 21.5)]
FOCUS = (54, 9.5)
GATE = (GATE_X, 7.6)
STARTS = [(23, 52), (25.6, 52), (23, 54), (25.6, 54)]
PATH = [(23.6, 56), (22.6, 47), (19, 43), (16.5, 36.5), (17.5, 30.5), (24, 25.5), (31, 25), (36, 30.5), (50, 32.6), (59, 28.5),
        (62, 22.5), (62, 14), (58, 10.5), (50, 9.5), (GATE_X, 7.5), (GATE_X, 0)]


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
    k = max(0, min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy or 1)))
    return math.hypot(x - ax - k * dx, y - ay - k * dy)

def path(points, width, rough=.5, seed=7):
    def t(x, y):
        d = min(seg_dist(x, y, points[i], points[i + 1]) for i in range(len(points) - 1))
        return d < width / 2 + (noise(x, y, seed) - .5) * rough * 2
    return t

def disc(cx, cy, r, rough=0, seed=3):
    return lambda x, y: math.hypot(x - cx, y - cy) + (noise(x, y, seed) - .5) * rough * 2 < r

# the edges: woods east and west, behind the academy, and the fields' far side past the north wall
paint(lambda x, y: x < 2 + noise(x, y, 40) * 2 or x > W - 3 - noise(x, y, 41) * 2 or y > H - 2.5 - noise(x, y, 43), 'leaves')
# north of the wall: ploughed fields either side of the road
paint(lambda x, y: y < WALL_Y - .8 and (x < GATE_X - 4 or x > GATE_X + 4) and int(y * 2) % 2 == 0 and noise(x, y, 44) > .3, 'mud')
paint(rect(GATE_X - 2.2, 0, 4.4, WALL_Y + 1, .4, 45), 'cobble')
# the yard: grass trodden thin over most of it, worn to dirt where people drill
paint(lambda x, y: 9 < x < 78 and 8 < y < 50 and noise(x, y, 11) > .52, 'dirt')
paint(rect(12, 34, 18, 10, 1.6, 12), 'dirt')          # the strike lanes
paint(disc(*RING, 2.4, .6, 13), 'sand')                 # the shove pit, the ring chalked on it (the client)
paint(disc(*HEAVY, 2.2, .6, 14), 'sand')
paint(disc(*RETREAT, 4.6, .8, 15), 'sand')              # the slam ring
paint(rect(PARRY[0] - 2, PARRY[1] - 2.6, PARRY_HOME[0] - PARRY[0] + 4, 5.2, .6, 16), 'sand')   # the parry lane
paint(disc(*HANDS, 6.6, 1.0, 17), 'sand')               # the hands test's ring
paint(rect(66, 35, 14, 13, 1.4, 18), 'dirt')            # the soldiers' drill ground by the barracks
paint(path(PATH, 2.6, .7, 19), 'dirt')                  # the worn path, station to station
paint(path([(23.6, 56), (44, 57), (60, 55), (76, 50), (79, 44)], 2.2, .6, 20), 'gravel')   # hall to garden to barracks
paint(rect(12, 54, 36, 5, .5, 21), 'flagstone')         # the apron before the hall and the cloister
paint(rect(53, 52, 21, 12, 1.2, 22), 'grass')           # the garden
paint(path([(54, 58), (72, 58)], 1.6, .2, 23), 'flagstone')
paint(path([(63, 53), (63, 63)], 1.6, .2, 24), 'flagstone')
paint(disc(63, 58, 2.4), 'flagstone')
paint(rect(56, 42, 10, 7, .8, 25), 'gravel')            # the shed's hardstanding, the building stock
paint(lambda x, y: x < 10 and 10 < y < 50 and noise(x, y, 26) > .62, 'dirt')   # the old farm's last tracks

# ---- props -----------------------------------------------------------------------------------------------------------
props = []
def prop(asset, x, y, blocks=False):
    props.append((asset, round(x * 4) / 4, round(y * 4) / 4, blocks))

# the academy along the south: the hall you come out of, the cloister, the garden
# No buildings as props: at a real scale a building is the environment, not an object in it (the user, 2026-11-14,
# rejecting both the bought one-picture buildings and the kit-assembled ones). The academy waits for its own design.
prop('notice-board', 30.5, 56.2, True)
for x in (17, 33, 47):
    prop('lantern-post', x, 55.2, True)
prop('well', 63, 58, True)
for asset, x, y in [('bench', 59.5, 55.6), ('bench', 66.5, 55.6), ('bench', 59.5, 60.6), ('oak', 56, 54), ('oak', 71, 62.5), ('bush-round', 54.5, 63),
                    ('bush-round', 72.5, 53.5), ('beehive', 70.5, 60), ('cabbage-patch', 56.5, 61), ('cabbage-patch', 58.5, 62.5)]:
    prop(asset, x, y, asset not in ('cabbage-patch',))
for asset, x, y in [('white-daisy-clump', 61, 56), ('red-poppy-clump', 65.5, 60.5), ('purple-lavender-sprig', 60.5, 59.5), ('yellow-buttercup-clump', 66, 56.5),
                    ('orange-marigold', 57.5, 57), ('blue-cornflower-clump', 68, 60), ('tall-foxglove-stem', 54.5, 55.5), ('small-potted-herb', 62, 54.5), ('sleeping-grey-cat', 66.3, 55)]:
    prop(asset, x, y)
for x in (54, 56, 70, 72):
    prop('stone-wall-low', x, 51.3, True)                 # the garden's low wall, open where the paths come through
# the barracks and their drill ground, the shed with the building stock round it
for asset, x, y in [('water-trough', 74.5, 47.5), ('jerkin-rack', 76.5, 36.5), ('practice-shields', 78.5, 36.2), ('washing-line', 84, 50), ('weapon-rack', 72.5, 34.8),
                    ('banner-red', 70, 34.5), ('barrel', 84.5, 37.5), ('crates', 85, 39.5)]:
    prop(asset, x, y, asset not in ('washing-line',))
for asset, x, y in [('planks-stacked', 57, 49), ('logs-pile', 66, 49.5), ('stone-blocks', 55, 46.5), ('sawhorse', 58.6, 50.2), ('ladder-lying', 64.5, 51),
                    ('fence-posts-bundle', 67.5, 47), ('tarp-heap', 54.5, 43.5), ('nail-barrel', 60, 50.4), ('gravel-heap', 52.5, 48.5), ('wheelbarrow', 54.6, 50.6),
                    ('pile-of-sawdust', 57.6, 51.4), ('coil-of-rope', 63, 49.8)]:
    prop(asset, x, y, asset not in ('ladder-lying', 'pile-of-sawdust', 'coil-of-rope'))
# the yard's east edge, fenced in a hurry and not finished
for k, y in enumerate([12, 14, 16, 18, 20, 22, 24, 26]):
    prop('fence-rail-flip' if k < 6 else 'fence-frame', 81, y, k < 6)
# the stations' own things
for x, y in STRAW:
    prop('pell', x + .6, y - 2.6, True)                   # each lane's post behind its straw goblin
for x in (14.4, 28.2):
    prop('hay-bale', x, 38.4, True)
prop('training-dummy', 12.3, 41.5, True); prop('dummy-worn', 29.5, 41.2, True)
prop('training-sack', HEAVY[0] + 3.2, HEAVY[1] - .6, True)   # the sack's empty gallows, its sack on the ground in front
prop('hay-bale', PARRY[0] - 2.6, PARRY[1], True)          # behind you in the lane: what the bolts that get past hit
prop('hay-bale', PARRY[0] - 2.6, PARRY[1] + 1.4, True)
prop('archer-platform', PARRY_HOME[0] + 3, PARRY_HOME[1] - 2.6, True)
prop('target-weathered', PARRY_HOME[0] + 2.4, PARRY_HOME[1] + 2.6, True)
prop('sword-rack', RETREAT[0] + 4.6, RETREAT[1] - 3.6, True)
prop('round-wooden-stool-knocked-over', RETREAT[0] - 3.8, RETREAT[1] + 2.4)
for asset, x, y in [('hay-bale', 76.5, 15.5), ('loose-pile-of-straw', 75.5, 17.2), ('loose-pile-of-straw', 64, 13), ('scarecrow', 76.6, 12.6)]:
    prop(asset, x, y, asset in ('hay-bale', 'scarecrow'))
prop('focus-rack', FOCUS[0], FOCUS[1] - 1.3, True)
for asset, x, y in [('weapon-rack', FOCUS[0] + 2.6, FOCUS[1] - 1.4), ('crate-fittings', FOCUS[0] + 4.6, FOCUS[1] - .6), ('lantern-post', FOCUS[0] - 2.2, FOCUS[1] - 1.6)]:
    prop(asset, x, y, True)
# the students' casting line, between the lanes and the shed: targets north, a bench behind
for k in range(3):
    prop('target', 38 + k * 4, 38.2, True)
prop('bench', 42, 47.4, True)
prop('stack-of-three-books', 41.4, 47.9)
# the north wall, low, with the gatehouse in it and banners either side; the road and the fields past it
x = 1.0
while x < W - 1:
    if not (GATE_X - 4.4 < x < GATE_X + 4.4):
        prop('stone-wall-low', x, WALL_Y, True)
    x += 1.75
prop('gatehouse', GATE_X, WALL_Y + .2, True)
for dx in (-5.2, 5.2):
    prop('banner-red', GATE_X + dx, WALL_Y + 1.1)
prop('signpost', GATE_X + 3.2, 2.2)
for asset, x, y in [('scarecrow', 22, 2), ('cabbage-patch', 30, 2.4), ('cabbage-patch', 33, 1.5), ('hay-bale', 62, 2.2), ('hay-bale', 63.5, 3), ('wild-wheat-stalks', 70, 2), ('wild-wheat-stalks', 16, 2.6)]:
    prop(asset, x, y)
# the old farm the yard was put on, to the west: a ruined wall, a broken arch, an orchard gone wild, its leftovers
for k, y in enumerate([14, 15.75, 19.25, 21, 22.75]):
    prop('stone-wall-low-flip', 8.2, y, True)
prop('pillar-broken', 8.2, 17.5, True)
prop('arch-ruined', 5, 27, True)
for asset, x, y in [('oak', 4.5, 34), ('oak-autumn', 7, 39.5), ('oak', 3.6, 45), ('stump-axe', 6.2, 31), ('log-fallen', 8.4, 43.2), ('wagon-wheel', 5.4, 36.5),
                    ('plough-rusty', 6.6, 24), ('barrel-broken', 3.6, 20), ('roof-tiles-pile', 4.6, 16.4), ('broken-branch', 7.8, 47.6), ('fallen-acorns', 5, 35.4),
                    ('stone-blocks', 3.4, 12), ('round-river-stone', 9, 30)]:
    prop(asset, x, y, asset in ('oak', 'oak-autumn', 'stump-axe', 'log-fallen', 'plough-rusty', 'stone-blocks'))
# leftovers from putting the yard up, strewn where they were dropped
for asset, x, y in [('planks-stacked', 34.5, 15), ('fence-posts-bundle', 37, 13.6), ('sawhorse', 13, 47.6), ('ladder-lying', 47.5, 17), ('nail-barrel', 35.6, 17.2),
                    ('tarp-heap', 12, 11), ('gravel-heap', 27, 49), ('handcart', 33, 50.2)]:
    prop(asset, x, y, asset not in ('ladder-lying',))
# a little life in the grass
for asset in ['short-grass-tuft'] * 18 + ['tall-grass-tuft'] * 8 + ['clover-patch'] * 6 + ['dandelion-seed-puff', 'yellow-dandelion', 'molehill', 'small-brown-bird', 'resting-butterfly', 'single-small-pebble', 'three-pebbles', 'patch-of-bare-dirt'] * 2:
    for _ in range(40):
        x, y = rng.uniform(3, W - 4), rng.uniform(WALL_Y + 1.5, 52)
        if min(seg_dist(x, y, PATH[i], PATH[i + 1]) for i in range(len(PATH) - 1)) < 2.4 or any(math.hypot(x - a, y - b) < 3 for a, b, _, _ in [(p[1], p[2], 0, 0) for p in props]):
            continue
        prop(asset, x, y)
        break
# the woods round it all
def band(x0, y0, x1, y1, step=3.0):
    y = y0 + 1
    while y < y1:
        xx = x0 + 1
        while xx < x1:
            px, py = xx + rng.uniform(-.8, .8), y + rng.uniform(-.8, .8)
            if .6 < px < W - .6 and .6 < py < H - .6:
                prop(rng.choice(['pine', 'oak', 'oak', 'oak-autumn', 'bush-round']), round(px * 2) / 2, round(py * 2) / 2, True)
            xx += step
        y += step
band(0, WALL_Y + 1, 2.6, 52)
band(W - 3.6, WALL_Y + 1, W, H)
band(0, 52, 3, H)              # the woods west of the hall; nothing south of the academy's buildings, which would stand in front of them
band(50, H - 3, W - 3.6, H)
band(78, 52, W - 3.6, H - 3)
for asset, x, y in [('pine', 4, 1.5), ('oak', 9, 2.5), ('pine', 78, 2), ('oak', 84, 1.5), ('pine', 88, 3)]:
    prop(asset, x, y, True)

# ---- the people who live here (art/extras.ts draws them; the sim never sees them) -----------------------------------
extras = []
def person(kind, act, pal, variant, face, x, y):
    extras.append((f'x-{kind}-{act}-{pal}-{variant}-{face}-{len(extras)}', x, y))

for r in range(2):                                 # soldiers at spear drill before the barracks, facing west
    for c in range(3):
        person('soldier', 'drill', 0, 3, 180, 70.5 + c * 2.2, 39 + r * 2.4)
person('soldier', 'idle', 0, 0, 180, 74.6, 46.6)     # their sergeant, watching them
person('soldier', 'spar', 1, 0, 0, 64.6, 37.6)     # two at it with practice swords
person('soldier', 'spar', 2, 0, 180, 66.4, 37.6)
person('student', 'cast', 4, 0, 270, 38, 42.4)     # the casting line, at the targets
person('student', 'cast', 6, 0, 270, 42, 42.4)
person('student', 'idle', 5, 0, 300, 45.6, 43.6)
person('student', 'idle', 4, 0, 0, 59.4, 56.2)     # in the garden, on the benches
person('student', 'idle', 5, 0, 180, 66.6, 56.2)
person('student', 'walk', 6, 0, 0, 36, 57.4)       # walking the gravel walk, hall to garden and back
person('student', 'idle', 4, 0, 90, 5.4, 32.6)     # reading under the old orchard's trees

# ---- the level -------------------------------------------------------------------------------------------------------
source = json.load(open(os.path.join(MAPS, 'world/Academy.ldtkl'), encoding='utf-8'))
samples = {}
for li in source['layerInstances']:
    for e in li['entityInstances']:
        samples.setdefault(e['__identifier'], e)
# no level has a Marker yet: one is a Prop's shape with the Marker definition's fields (world.ldtk: uid 111, id 112, tag 113)
marker = copy.deepcopy(samples['Prop'])
marker.update(__identifier='Marker', defUid=111, __smartColor='#5CE0A8')
marker['fieldInstances'] = [
    {'__identifier': 'id', '__type': 'String', '__value': None, '__tile': None, 'defUid': 112, 'realEditorValues': []},
    {'__identifier': 'tag', '__type': 'String', '__value': None, '__tile': None, 'defUid': 113, 'realEditorValues': []},
]
samples['Marker'] = marker

def entity(kind, n, x, y, fields=None):
    e = copy.deepcopy(samples[kind])
    px = [int(round(min(W, max(0, x)) * PX)), int(round(min(H, max(0, y)) * PX))]
    e.update(iid=iid(kind, n), px=px, __grid=[px[0] // 10, px[1] // 10])
    for f in e['fieldInstances']:
        v = (fields or {}).get(f['__identifier'])
        f['__value'] = v
        tag = {'Int': 'V_Int', 'Float': 'V_Float', 'String': 'V_String', 'Bool': 'V_Bool'}[f['__type']]
        f['realEditorValues'] = [] if v is None else [{'id': tag, 'params': [v]}]
    return e

es = []
for s, (x, y) in enumerate(STARTS):
    es.append(entity('PlayerStart', s, x, y, {'seat': s}))
for i, (asset, x, y, blocks) in enumerate(props):
    es.append(entity('Prop', i, x, y, {'asset': asset, 'blocks': blocks, 'tag': None}))
MARKS = {'heavy': HEAVY, 'heavy-ring': RING, 'retreat': RETREAT, 'parry': PARRY, 'parry-home': PARRY_HOME, 'hands': HANDS, 'focus': FOCUS, 'gate': GATE,
         'strike': (21, 42.6)}
MARKS.update({f'straw-{k}': p for k, p in enumerate(STRAW)})
MARKS.update({f'hands-in-{k}': p for k, p in enumerate(HANDS_IN)})
for name, (x, y) in MARKS.items():
    es.append(entity('Marker', name, x, y, {'id': name}))
for name, x, y in extras:
    es.append(entity('Marker', name, x, y, {'id': name}))
# Markers and Regions placed in LDtk (by hand) are kept as they are; only the ones this script owns are rewritten
old_path = os.path.join(MAPS, 'world/Yard.ldtkl')
if os.path.exists(old_path):
    owned = set(MARKS)
    for li in json.load(open(old_path, encoding='utf-8'))['layerInstances']:
        if li['__identifier'] != 'Entities':
            continue
        for e in li['entityInstances']:
            mid = next((f['__value'] for f in e['fieldInstances'] if f['__identifier'] == 'id'), None)
            if e['__identifier'] in ('Marker', 'Region') and mid not in owned and not str(mid).startswith('x-'):
                es.append(e)

level_uid = 116
level = copy.deepcopy(source)
level.update(identifier='Yard', iid=iid('level'), uid=level_uid, worldX=5640, worldY=0, pxWid=W * PX, pxHei=H * PX, externalRelPath=None)
for n, li in enumerate(level['layerInstances']):
    li.update(__cWid=CW, __cHei=CH, iid=iid('layer', li['__identifier']), levelId=level_uid, seed=5512200 + n)
    if li['__identifier'] == 'Entities':
        li['entityInstances'] = es
    elif li['__identifier'] == 'Terrain':
        li['intGridCsv'] = [0] * (CW * CH)
    elif li['__identifier'] == 'Ground':
        li['intGridCsv'] = [v for row in grid for v in row]
json.dump(level, open(os.path.join(MAPS, 'world/Yard.ldtkl'), 'w', encoding='utf-8', newline='\n'), indent=2)

p = os.path.join(MAPS, 'world.ldtk')
project = json.load(open(p, encoding='utf-8'))
entry = copy.deepcopy(next(l for l in project['levels'] if l['identifier'] == 'Academy'))
entry.update(identifier='Yard', iid=level['iid'], uid=level_uid, worldX=5640, worldY=0, pxWid=W * PX, pxHei=H * PX, externalRelPath='world/Yard.ldtkl')
project['levels'] = [l for l in project['levels'] if l['identifier'] != 'Yard'] + [entry]
project['nextUid'] = max(project['nextUid'], level_uid + 1)
json.dump(project, open(p, 'w', encoding='utf-8', newline='\n'), indent=2)
print('Yard:', len(props), 'props,', len(extras), 'people,', len(es), 'entities')
