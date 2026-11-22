"""Writes the Courtyard level (game/content/maps/world/Court.ldtkl): the academy's central courtyard, the opening's hub.
No generation calls.

  python tools/segments/01-opening/court-level.py
  (then, from game/) npm run content:build && npm run content:check

Blockout of 2026-11-22 (the user: the armillary in a corner of the yard "does not have the grandeur of the concept art";
docs/explorations/2026-11-22-weapons-yard-and-walks.md). A wide paved court with the academy's great armillary at full
scale in the middle, seven channels of setts running out from it. The academy closes the far sides at real size
(grey boxes in the game, painted by Codex: art/massing.ts `court`): the main building along the north with its tower and
portal, the cloister range along the west with an archway through to the drill yard. The near sides stay open: a
terrace balustrade above the sea to the south, with stairs down toward the harbor, and a low wall to the east with the
gate onto the battery road. You start by the armillary (the briefing, beat 1, not built yet).

Coordinates are the plan's (150 x 110, origin top-left, north up; 1 u is about 0.6 m). Markers: gate-yard and
gate-battery (sim court.ts: walking into one takes the party there).
"""
import copy, json, math, os, random, uuid

HERE = os.path.dirname(os.path.abspath(__file__))
MAPS = os.path.join(HERE, '../../../game/content/maps')
W, H, CELL = 150, 110, 0.5
CW, CH = int(W / CELL), int(H / CELL)
PX = 20
GROUND = dict(grass=1, dirt=2, sand=3, flagstone=4, cobble=5, mud=6, leaves=7, gravel=8, ash=9, planks=10, slabs=11, water=12)
NS = uuid.UUID('4f2a9c61-7b3e-4d18-9a05-2c6e8b1f3d47')
rng = random.Random(1122)

ARM = (75, 56)               # the armillary's middle; its plinth is about 26 u across (art/massing.ts, the prop)
PLINTH_R = 10.5
GATE_YARD = (2.2, 36)        # the archway through the west range
GATE_BATTERY = (147.8, 52)   # the east gate
SEA_Y = 104                  # the terrace's edge; the sea below it
STAIRS = (68, 82)            # the stairs down toward the harbor (closed for now: x range on the terrace's edge)
STARTS = [(52, 84), (54.6, 84), (52, 86.4), (54.6, 86.4)]

def iid(*parts):
    return str(uuid.uuid5(NS, '/'.join(map(str, parts))))

# ---- ground ----------------------------------------------------------------------------------------------------------
grid = [[GROUND['flagstone']] * CW for _ in range(CH)]
def paint(test, mat):
    for cy in range(CH):
        for cx in range(CW):
            x, y = (cx + .5) * CELL, (cy + .5) * CELL
            if test(x, y):
                grid[cy][cx] = GROUND[mat]

def seg_dist(x, y, a, b):
    ax, ay = a; bx, by = b
    dx, dy = bx - ax, by - ay
    k = max(0, min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy or 1)))
    return math.hypot(x - ax - k * dx, y - ay - k * dy)

r_arm = lambda x, y: math.hypot(x - ARM[0], (y - ARM[1]))
# the channels: seven strips of setts running out from the plinth, toward the gates and the roads
CHANNELS = [math.radians(a) for a in (-90, -38, 14, 66, 118, 170, 222)]
for a in CHANNELS:
    end = (ARM[0] + math.cos(a) * 80, ARM[1] + math.sin(a) * 80)
    paint(lambda x, y, e=end: seg_dist(x, y, ARM, e) < 1.1 and r_arm(x, y) > PLINTH_R, 'cobble')
paint(lambda x, y: r_arm(x, y) < PLINTH_R + 3, 'cobble')           # the setts round the plinth
paint(lambda x, y: x < 4 or y < 4, 'flagstone')                    # the buildings' feet
paint(lambda x, y: y > SEA_Y + 1.2, 'water')                       # the sea below the terrace (it carries on past the edge)
paint(lambda x, y: x > W - 3 and abs(y - GATE_BATTERY[1]) < 5, 'cobble')   # the road out of the east gate

# ---- props -----------------------------------------------------------------------------------------------------------
props = []
def prop(asset, x, y, blocks=False):
    props.append((asset, round(x * 4) / 4, round(y * 4) / 4, blocks))

BAL = 8.2
def balustrade_x(y, x0, x1):
    n = max(1, round((x1 - x0) / BAL))
    for k in range(n):
        prop('codex-balustrade-x', x0 + (k + .5) * (x1 - x0) / n, y, True)
def balustrade_y(x, y0, y1):
    n = max(1, round((y1 - y0) / BAL))
    for k in range(n):
        prop('codex-balustrade-y', x, y0 + (k + .5) * (y1 - y0) / n, True)

# the great armillary (Codex: one large prop, sorted with the bodies so you can walk behind it; it blocks its plinth)
prop('codex-armillary-grand', ARM[0], ARM[1], True)
for k in range(8):                                      # lantern pillars round the plinth
    a = k * math.pi / 4 + math.pi / 8
    prop('codex-lantern-pillar', ARM[0] + math.cos(a) * (PLINTH_R + 4.5), ARM[1] + math.sin(a) * (PLINTH_R + 4.5), True)
for a in (0.25, 0.75):                                  # benches on the near side, facing it
    prop('codex-bench', ARM[0] + math.cos(a * math.pi) * (PLINTH_R + 9), ARM[1] + math.sin(a * math.pi) * (PLINTH_R + 9), True)
# a ring of flower beds between the channels, and in each quarter of the plaza a planted island with a lilac tree and
# benches, so the court reads as a designed space rather than an empty floor (round 5 critique)
for k in range(7):
    a = (CHANNELS[k] + CHANNELS[(k + 1) % 7] + (2 * math.pi if k == 6 else 0)) / 2
    prop('codex-urn-planter', ARM[0] + math.cos(a) * (PLINTH_R + 9), ARM[1] + math.sin(a) * (PLINTH_R + 9), True)
for cx, cy in [(30, 30), (120, 30), (30, 82), (120, 82)]:
    prop('codex-lilac-tree', cx, cy, True)
    for dx, dy, asset in [(-4, 0, 'codex-lavender-foxglove'), (4, 0, 'codex-white-shrub'), (0, 4, 'codex-yellow-shrub'), (0, -4, 'codex-lilac-shrub')]:
        prop(asset, cx + dx, cy + dy, not asset.startswith(('codex-lavender', 'codex-white')))
    prop('codex-bench', cx + 6.5, cy + 6.5, True)
# the terrace's edge above the sea, with the stairs down (closed for now: urns across the top step)
balustrade_x(SEA_Y, 1, STAIRS[0]); balustrade_x(SEA_Y, STAIRS[1], W - 1)
for x in (STAIRS[0], STAIRS[1]):
    prop('codex-lantern-pillar', x, SEA_Y, True)
for x in (STAIRS[0] + 3.5, STAIRS[0] + 7, STAIRS[0] + 10.5):
    prop('codex-urn-planter', x, SEA_Y + .4, True)
# the east wall, low, with the gate onto the battery road
balustrade_y(W - 1, 1, GATE_BATTERY[1] - 5); balustrade_y(W - 1, GATE_BATTERY[1] + 5, SEA_Y)
for dy in (-5, 5):
    prop('codex-lantern-pillar', W - 1, GATE_BATTERY[1] + dy, True)
    prop('codex-star-banner', W - 3.5, GATE_BATTERY[1] + dy * 1.3)
prop('codex-notice-board', W - 9, GATE_BATTERY[1] - 9, True)
# the buildings' feet: planting, urns and banners between the doors
for y in (12, 24, 48, 60, 72, 84, 96):
    prop('codex-lantern-post', 2.6, y, True)
for x in (14, 28, 46, 104, 122, 136):
    prop('codex-lantern-post', x, 2.6, True)
for asset, x, y in [('codex-lilac-shrub', 3.4, 18), ('codex-lavender-foxglove', 3.4, 30), ('codex-urn-planter', 3.4, 42), ('codex-yellow-shrub', 3.4, 54),
                    ('codex-white-shrub', 3.4, 66), ('codex-lilac-shrub', 3.4, 78), ('codex-conifer-tall', 2.8, 90), ('codex-lavender-foxglove', 3.4, 98),
                    ('codex-yellow-shrub', 8, 3.4), ('codex-lilac-shrub', 21, 3.4), ('codex-urn-planter', 36, 3.4), ('codex-white-shrub', 56, 3.4),
                    ('codex-urn-planter', 66, 3.6), ('codex-urn-planter', 84, 3.6), ('codex-lavender-foxglove', 94, 3.4), ('codex-yellow-shrub', 113, 3.4),
                    ('codex-lilac-shrub', 129, 3.4), ('codex-conifer-tall', 143, 3), ('codex-star-banner', 70.5, 2.4), ('codex-star-banner', 79.5, 2.4)]:
    prop(asset, x, y, not asset.startswith(('codex-star-banner', 'codex-lavender', 'codex-white')))
# the near corners: conifers and flowering shrubs where the terrace and the east wall meet
for asset, x, y in [('codex-conifer-tall', 143, 100), ('codex-lilac-tree', 138, 99), ('codex-yellow-shrub', 132, 100), ('codex-conifer-round', 8, 100),
                    ('codex-lilac-tree', 14, 99), ('codex-white-shrub', 20, 100), ('codex-urn-planter', 46, 99), ('codex-urn-planter', 104, 99)]:
    prop(asset, x, y, not asset.startswith(('codex-white',)))

# ---- the people who live here (art/extras.ts) -------------------------------------------------------------------------
extras = []
def person(kind, act, pal, variant, face, x, y):
    extras.append((f'x-{kind}-{act}-{pal}-{variant}-{face}-{len(extras)}', x, y))
person('student', 'idle', 6, 0, 135, 66, 72)            # the masters, by the armillary, facing you
person('student', 'idle', 5, 0, 135, 69, 73.5)
for x, y, f in [(96, 40, 180), (98, 42, 200), (40, 30, 0), (112, 76, 270), (114, 74, 250), (30, 88, 90)]:
    person('student', 'idle', [4, 5, 6][len(extras) % 3], 0, f, x, y)
person('student', 'walk', 4, 0, 0, 50, 46); person('student', 'walk', 6, 0, 180, 104, 30)
person('soldier', 'idle', 0, 3, 180, 142, 46); person('soldier', 'idle', 0, 3, 180, 142, 58)   # the gate's guards

# ---- the level -------------------------------------------------------------------------------------------------------
source = json.load(open(os.path.join(MAPS, 'world/Academy.ldtkl'), encoding='utf-8'))
samples = {}
for li in source['layerInstances']:
    for e in li['entityInstances']:
        samples.setdefault(e['__identifier'], e)
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
MARKS = {'gate-yard': GATE_YARD, 'gate-battery': GATE_BATTERY, 'armillary': ARM}
for name, (x, y) in MARKS.items():
    es.append(entity('Marker', name, x, y, {'id': name}))
for name, x, y in extras:
    es.append(entity('Marker', name, x, y, {'id': name}))

level_uid = 117
level = copy.deepcopy(source)
level.update(identifier='Court', iid=iid('level'), uid=level_uid, worldX=8400, worldY=0, pxWid=W * PX, pxHei=H * PX, externalRelPath=None)
for n, li in enumerate(level['layerInstances']):
    li.update(__cWid=CW, __cHei=CH, iid=iid('layer', li['__identifier']), levelId=level_uid, seed=7712200 + n)
    if li['__identifier'] == 'Entities':
        li['entityInstances'] = es
    elif li['__identifier'] == 'Terrain':
        li['intGridCsv'] = [0] * (CW * CH)
    elif li['__identifier'] == 'Ground':
        li['intGridCsv'] = [v for row in grid for v in row]
json.dump(level, open(os.path.join(MAPS, 'world/Court.ldtkl'), 'w', encoding='utf-8', newline='\n'), indent=2)

p = os.path.join(MAPS, 'world.ldtk')
project = json.load(open(p, encoding='utf-8'))
entry = copy.deepcopy(next(l for l in project['levels'] if l['identifier'] == 'Academy'))
entry.update(identifier='Court', iid=level['iid'], uid=level_uid, worldX=8400, worldY=0, pxWid=W * PX, pxHei=H * PX, externalRelPath='world/Court.ldtkl')
project['levels'] = [l for l in project['levels'] if l['identifier'] != 'Court'] + [entry]
project['nextUid'] = max(project['nextUid'], level_uid + 1)
json.dump(project, open(p, 'w', encoding='utf-8', newline='\n'), indent=2)
print('Court:', len(props), 'props,', len(extras), 'people,', len(es), 'entities')
