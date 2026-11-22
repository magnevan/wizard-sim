"""Writes the Drill Yard level (game/content/maps/world/Yard.ldtkl): the opening's beats 2 and 3. No generation calls.

  python tools/segments/01-opening/yard-level.py
  (then, from game/) npm run content:build && npm run content:check

Blockout of 2026-11-22 (docs/explorations/2026-11-22-weapons-yard-and-walks.md): the academy's north-west corner at real
size. The Great Hall stands along the west edge and the workshops along the north, just past the map, so their faces
are the map's edge; the client draws them as grey boxes (art/massing.ts, `academy`). The yard runs along their foot as
an L; the courtyard with the armillary opens to the south-east behind a low balustrade. You start at the armillary
(the briefing, beat 1, not built yet), go into the yard, along the hall (strike lanes, the sack, the slam ring), along
the workshops (the parry lane, the hands ring, the rack at the armoury door), back into the courtyard and out by its
east gate. The soldiers drill in the open middle with plain steel. The game finds the stations by their Markers
(sim yard.ts).

Coordinates are the plan's (130 x 100, origin top-left, north up; 1 u is about 0.6 m). Running this replaces the
level, so make hand edits here rather than in LDtk until the layout has settled. Markers whose id starts with "x-" are
people who live here (the client draws them, art/extras.ts):
x-<kind>-<act>-<palette>-<variant>-<facing in degrees, 0 east, 90 south>-<n>.
"""
import copy, json, math, os, random, uuid

HERE = os.path.dirname(os.path.abspath(__file__))
MAPS = os.path.join(HERE, '../../../game/content/maps')
W, H, CELL = 130, 100, 0.5
CW, CH = int(W / CELL), int(H / CELL)
PX = 20
GROUND = dict(grass=1, dirt=2, sand=3, flagstone=4, cobble=5, mud=6, leaves=7, gravel=8, ash=9, planks=10, slabs=11, water=12)
NS = uuid.UUID('9b3c1e52-1d7a-4c0e-8f61-5a0d2c7e4b19')
rng = random.Random(2203)

# the balustrade between the yard (north and west) and the courtyard (south-east), with its two openings
BAL_X, BAL_Y = 46, 54
IN_GAP = (78, 88)            # on the west run (y): from the courtyard into the yard
OUT_GAP = (108, 120)         # on the north run (x): from the yard back into the courtyard
ARMILLARY = (100, 82)        # the plinth is 10 x 10 (art/massing.ts draws it and the sphere)
# the stations (sim yard.ts finds them by these ids)
STRAW = [(8, 58), (11.5, 57.4), (15, 58), (18.5, 57.4)]
HEAVY, RING = (14, 44), (9.5, 40.5)
RETREAT = (16, 26)
PARRY, PARRY_HOME = (30, 11), (60, 11)
HANDS = (82, 18)
HANDS_IN = [(76.5, 12.5), (87.5, 12.5), (76.5, 23.5), (87.5, 23.5)]
FOCUS = (100, 5)
GATE = (127, 72)
STARTS = [(84.5, 89), (87.1, 89), (84.5, 91.4), (87.1, 91.4)]
PATH = [(86, 90), (70, 86), (BAL_X, 83), (28, 78), (17, 70), (13, 63), (17, 50), (20, 38), (23, 30), (23, 18), (27, 12), (PARRY_HOME[0] - 3, 12.5),
        (70, 16), (HANDS[0], HANDS[1] + 7.5), (93, 16), (FOCUS[0], FOCUS[1] + 2.5), (108, 15), (114, 34), (114, BAL_Y), (118, 64), GATE]


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

in_court = lambda x, y: x > BAL_X and y > BAL_Y
# the yard: grass trodden thin, worn to dirt where people drill; the buildings' feet paved
# grass, worn through only where people walk and drill (the concepts: trodden lawns, dirt where the feet go), with a
# few thin patches along the buildings' feet where the shade keeps the grass short
paint(lambda x, y: not in_court(x, y) and (x < 9 or y < 9) and noise(x, y, 11) > .62, 'dirt')
paint(lambda x, y: not in_court(x, y) and (x < 3.5 or y < 3.5), 'flagstone')
paint(rect(4, 53, 19, 9, 1.2, 12), 'dirt')                                          # the strike lanes
paint(disc(*RING, 2.4, .6, 13), 'sand')                                             # the shove pit, the ring chalked on it (the client)
paint(disc(*HEAVY, 2.2, .6, 14), 'sand')
paint(disc(*RETREAT, 4.6, .8, 15), 'sand')                                          # the slam ring
paint(rect(PARRY[0] - 2, PARRY[1] - 3, PARRY_HOME[0] - PARRY[0] + 4, 6, .5, 16), 'sand')   # the parry lane, fenced (below)
paint(disc(*HANDS, 6.6, 1.0, 17), 'sand')                                           # the hands test's ring
paint(rect(54, 28, 46, 20, 1.6, 18), 'dirt')                                        # the soldiers' drill ground
paint(rect(32, 36, 12, 12, 1.2, 19), 'dirt')                                        # the students' casting line
paint(path(PATH, 3.2, .8, 20), 'dirt')                                              # the worn path, station to station
# the courtyard: paving, the armillary's plinth, its seven channels (dim; the finale lights them)
paint(in_court, 'flagstone')
paint(lambda x, y: math.hypot(x - ARMILLARY[0], y - ARMILLARY[1]) < 8.5, 'cobble')
paint(path([(BAL_X - 6, 83), (BAL_X + 4, 83)], 5, .2, 21), 'flagstone')          # the opening into the yard, paved through
paint(path([(114, BAL_Y - 5), (114, BAL_Y + 3)], 6, .2, 22), 'flagstone')        # the opening back out
paint(rect(GATE[0] - 6, GATE[1] - 4, 10, 8, .3, 23), 'cobble')                     # the courtyard's east gate

# ---- props -----------------------------------------------------------------------------------------------------------
props = []
def prop(asset, x, y, blocks=False):
    props.append((asset, round(x * 4) / 4, round(y * 4) / 4, blocks))

def run_x(asset, y, x0, x1, step=1.75, skip=None, blocks=True):
    x = x0
    while x < x1:
        if not (skip and skip[0] < x < skip[1]):
            prop(asset, x, y, blocks)
        x += step

def run_y(asset, x, y0, y1, step=1.75, skip=None, blocks=True):
    y = y0
    while y < y1:
        if not (skip and skip[0] < y < skip[1]):
            prop(asset, x, y, blocks)
        y += step

# No buildings as props: at a real scale a building is the environment, not an object in it (the user, 2026-11-14).
# The ranges are past the map's west and north edges (art/massing.ts).
# the balustrade (Codex, tools/building-art), low, so the courtyard and the yard see each other: 8 u pieces between
# lantern pillars, the pillars at its corners and either side of its openings
BAL = 8.2
def balustrade_x(y, x0, x1):
    n = max(1, round((x1 - x0) / BAL))
    for k in range(n):
        prop('codex-balustrade-x', x0 + (k + .5) * (x1 - x0) / n, y, True)
def balustrade_y(x, y0, y1):
    n = max(1, round((y1 - y0) / BAL))
    for k in range(n):
        prop('codex-balustrade-y', x, y0 + (k + .5) * (y1 - y0) / n, True)
balustrade_y(BAL_X, BAL_Y + .6, IN_GAP[0]); balustrade_y(BAL_X, IN_GAP[1], H - .6)
balustrade_x(BAL_Y, BAL_X + .6, OUT_GAP[0]); balustrade_x(BAL_Y, OUT_GAP[1], W - .6)
for x, y in [(BAL_X, BAL_Y), (BAL_X, IN_GAP[0]), (BAL_X, IN_GAP[1]), (OUT_GAP[0], BAL_Y), (OUT_GAP[1], BAL_Y)]:
    prop('codex-lantern-pillar', x, y, True)
# the courtyard's edges: the same balustrade south and east, the east gate in it
balustrade_x(H - .8, BAL_X + .6, W - .6)
balustrade_y(W - .8, BAL_Y + .6, GATE[1] - 4.5); balustrade_y(W - .8, GATE[1] + 4.5, H - .6)
for dy in (-3.8, 3.8):
    prop('battery-pillar', W - 1.6, GATE[1] + dy, True)
    prop('banner-red', W - 3.4, GATE[1] + dy * 1.4)
prop('signpost', GATE[0] - 5, GATE[1] - 5.5, True)
# the armillary's plinth: solid all round (the grey box hides these, art/massing.ts)
run_x('stone-wall-low', 77.25, 95.5, 105)
run_x('stone-wall-low', 86.75, 95.5, 105)
run_y('stone-wall-low-flip', 95.25, 78, 86.5)
run_y('stone-wall-low-flip', 104.75, 78, 86.5)
for k in range(8):                                  # lanterns round the plinth, benches further out
    a = k * math.pi / 4 + math.pi / 8
    prop('lantern-post', ARMILLARY[0] + math.cos(a) * 9, ARMILLARY[1] + math.sin(a) * 9, True)
for a in (0.25, 0.75):          # benches on the near side only: anything north of the grey box draws over it
    prop('bench', ARMILLARY[0] + math.cos(a * math.pi) * 15, ARMILLARY[1] + math.sin(a * math.pi) * 15, True)
for asset, x, y in [('codex-conifer-tall', 50, 58), ('codex-conifer-tall', 50, 96), ('codex-conifer-tall', 125.5, 58), ('codex-conifer-round', 125, 95),
                    ('codex-urn-planter', 112, 92), ('codex-urn-planter', 88, 92),
                    ('codex-lilac-shrub', 54, 62), ('codex-yellow-shrub', 58, 59), ('codex-white-shrub', 52, 70), ('codex-lavender-foxglove', 56, 95),
                    ('codex-lilac-shrub', 120, 95), ('codex-yellow-shrub', 124, 88), ('codex-lavender-foxglove', 104, 95),
                    ('codex-star-banner', 92.5, 90.5), ('codex-star-banner', 107.5, 90.5), ('codex-mossy-rocks', 66, 96), ('notice-board', 72, 76)]:
    prop(asset, x, y, not asset.startswith(('codex-star-banner', 'codex-lavender', 'codex-white')))
# along the Great Hall's foot: lanterns, a bench by its door, the notice board
for y in (14, 30, 50, 66):
    prop('lantern-post', 2.4, y, True)
# planting along the buildings' feet, between the stations (Codex, tools/building-art)
for asset, x, y in [('codex-lavender-foxglove', 3.2, 9), ('codex-lilac-shrub', 3.4, 20), ('codex-yellow-shrub', 3.4, 36), ('codex-white-shrub', 3.4, 70),
                    ('codex-urn-planter', 3.4, 40.6), ('codex-urn-planter', 3.4, 47.4), ('codex-conifer-tall', 2.8, 75), ('codex-lilac-shrub', 3.4, 82),
                    ('codex-lavender-foxglove', 3.4, 90), ('codex-conifer-round', 3, 97),
                    ('codex-yellow-shrub', 12, 3.4), ('codex-lavender-foxglove', 20, 3.2), ('codex-lilac-shrub', 68, 3.4), ('codex-white-shrub', 76, 3.4),
                    ('codex-lavender-foxglove', 86, 3.2), ('codex-conifer-tall', 93, 2.8), ('codex-urn-planter', 108, 3.4), ('codex-yellow-shrub', 116, 3.4),
                    ('codex-mossy-rocks', 124, 4), ('codex-star-banner', 95.4, 2.6), ('codex-star-banner', 104.6, 2.6)]:
    prop(asset, x, y, not asset.startswith(('codex-star-banner', 'codex-lavender', 'codex-white')))
prop('bench', 2.6, 44, True)
# the strike lanes: a straw goblin at each post, dummies either side
for x, y in STRAW:
    prop('pell', x + .6, y - 2.6, True)
for x in (5.2, 21.6):
    prop('hay-bale', x, 56.4, True)
prop('training-dummy', 4.4, 60.5, True); prop('dummy-worn', 22.2, 60.5, True)
# the sack and its chalk ring, the slam ring
prop('training-sack', HEAVY[0] + 3.2, HEAVY[1] - .6, True)
prop('sword-rack', RETREAT[0] + 4.6, RETREAT[1] - 3.6, True)
prop('round-wooden-stool-knocked-over', RETREAT[0] - 3.8, RETREAT[1] + 2.4)
# the parry lane along the workshops: fenced both sides, open at your end, the crossbowman's platform at the far end
run_x('fence-rail', PARRY[1] - 3.8, PARRY[0] + 1.5, PARRY_HOME[0] - .5)
run_x('fence-rail', PARRY[1] + 3.8, PARRY[0] + 1.5, PARRY_HOME[0] - .5)
prop('hay-bale', PARRY[0] - 2.6, PARRY[1] - .7, True)       # behind you in the lane: what the bolts that get past hit
prop('hay-bale', PARRY[0] - 2.6, PARRY[1] + .9, True)
prop('archer-platform', PARRY_HOME[0] + 3, PARRY_HOME[1] - 2.6, True)
prop('target-weathered', PARRY_HOME[0] + 2.4, PARRY_HOME[1] + 2.6, True)
# the hands ring
for asset, x, y in [('hay-bale', 90.5, 14.5), ('loose-pile-of-straw', 89.5, 17), ('loose-pile-of-straw', 74, 16), ('scarecrow', 90.6, 21.6)]:
    prop(asset, x, y, asset in ('hay-bale', 'scarecrow'))
# the rack at the armoury door
prop('focus-rack', FOCUS[0], FOCUS[1] - 1.3, True)
for asset, x, y in [('weapon-rack', FOCUS[0] + 2.8, FOCUS[1] - 1.4), ('crate-fittings', FOCUS[0] + 4.8, FOCUS[1] - .6), ('lantern-post', FOCUS[0] - 2.4, FOCUS[1] - 1.6)]:
    prop(asset, x, y, True)
# the soldiers' drill ground in the open middle: racks of plain steel, a post for the mallet, targets for the crossbows
for asset, x, y in [('weapon-rack', 56, 29.5), ('jerkin-rack', 59, 29.2), ('practice-shields', 62, 29.2), ('pell', 74, 35.4), ('banner-red', 54.5, 30),
                    ('water-trough', 66, 47.5), ('barrel', 97.5, 46), ('crates', 97.8, 44)]:
    prop(asset, x, y, asset != 'banner-red')
for y in (31, 35, 39):
    prop('target', 98.5, y, True)
# the students' casting line
for x in (35, 39, 43):
    prop('target', x, 37.2, True)
prop('bench', 38, 47.6, True)
prop('stack-of-three-books', 37.4, 48.2)
# building stock and leftovers along the inside of the balustrade, from putting the yard up in a hurry
for asset, x, y in [('planks-stacked', 50, 51.4), ('logs-pile', 54, 51.6), ('stone-blocks', 58, 51.4), ('sawhorse', 61.6, 52), ('tarp-heap', 65, 51.4),
                    ('nail-barrel', 68, 52.2), ('gravel-heap', 71.5, 51.6), ('wheelbarrow', 75, 52), ('fence-posts-bundle', 43.6, 66), ('ladder-lying', 43.4, 72),
                    ('handcart', 30, 50)]:
    prop(asset, x, y, asset not in ('ladder-lying',))
# a little life in the grass (the yard only)
for asset in ['short-grass-tuft'] * 18 + ['tall-grass-tuft'] * 8 + ['clover-patch'] * 6 + ['dandelion-seed-puff', 'yellow-dandelion', 'small-brown-bird', 'resting-butterfly', 'three-pebbles', 'patch-of-bare-dirt'] * 2:
    for _ in range(40):
        x, y = rng.uniform(5, W - 5), rng.uniform(5, H - 5)
        if in_court(x, y) or min(seg_dist(x, y, PATH[i], PATH[i + 1]) for i in range(len(PATH) - 1)) < 2.6 or any(math.hypot(x - p[1], y - p[2]) < 3 for p in props):
            continue
        prop(asset, x, y)
        break

# ---- the people who live here (art/extras.ts draws them; the sim never sees them) -----------------------------------
extras = []
def person(kind, act, pal, variant, face, x, y):
    extras.append((f'x-{kind}-{act}-{pal}-{variant}-{face}-{len(extras)}', x, y))

# soldiers' kit (art/rigs.ts drawSoldier): 0 practice sword, 1 mallet, 2 crossbow, 3 spear. The maul, the longbows and
# the trident in the concept are art still to make; the mallet and crossbows stand in.
for r in range(2):                                   # spear drill, facing west
    for c in range(3):
        person('soldier', 'drill', 0, 3, 180, 60 + c * 2.4, 33 + r * 2.6)
person('soldier', 'drill', 1, 1, 180, 76, 35.6)      # the mallet at its post
person('soldier', 'spar', 1, 0, 0, 76, 42.4)         # two at it with practice swords
person('soldier', 'spar', 2, 0, 180, 78, 42.4)
for y in (31, 35, 39):                               # crossbows at the targets
    person('soldier', 'idle', 0, 2, 0, 88, y)
person('soldier', 'idle', 0, 0, 180, 68, 45)         # their sergeant
person('student', 'cast', 4, 0, 270, 35, 43)         # the casting line
person('student', 'cast', 6, 0, 270, 39, 43)
person('student', 'idle', 5, 0, 300, 43, 44.5)
person('student', 'idle', 6, 0, 135, 96.5, 89)       # the masters at the armillary, facing you
person('student', 'idle', 5, 0, 135, 99.5, 89.5)
person('student', 'walk', 4, 0, 180, 72, 66)         # the courtyard, busy this morning
person('student', 'idle', 5, 0, 90, 118, 90)
person('student', 'idle', 6, 0, 270, 119.5, 91.5)
person('student', 'walk', 6, 0, 0, 60, 72)

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
         'strike': (13, 62.6)}
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
