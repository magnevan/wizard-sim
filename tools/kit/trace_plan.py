"""Trace a place plan (tools/place-plans/plans/*.py) into a kit scene: the first draft of a place on the kit.

  python tools/kit/trace_plan.py court-d court [--keep-objects]

The plan is re-run with its grid swapped for the kit's corner lattice (one sample per grid corner, G = 2 u apart, U to
the right and V down the screen, as in the scene), so every fill, building and flight lands on corners exactly. Each
distinct (height, material, building) becomes a terrace; the plan's own parapet and cheek strips ('wall' roofs) are
dropped, since the kit guards edges by rule. Straight flights (Semantic.flight) become kit flights. What the kit can't
say yet is written into the scene's notes as GAPS, with a place for each, and returned for pins:
  small buildings (piers, pylons, posts) -> set pieces; landmarks -> set pieces; stair sectors and rings -> curved flights.
Saddle cells (two opposite corners high) are resolved by moving one corner to its higher neighbour's terrace.
"""
import json, math, os, runpy, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
PLANS = os.path.join(HERE, '..', 'place-plans')
sys.path.insert(0, PLANS)
import plan as planmod
import semantic as semmod

G = 2.0
MATMAP = {  # plan material -> (kit floor, walkable, edge)
    'plaza': ('plaza', True, 'parapet'), 'paving': ('paving', True, 'parapet'), 'path': ('paving', True, 'parapet'),
    'road': ('road', True, 'parapet'), 'dais': ('plaza', True, 'steps'), 'stairs': ('paving', True, 'steps'),
    'grass': ('lawn', True, 'parapet'), 'sand': ('lawn', True, 'parapet'), 'wood': ('deck', True, 'parapet'),
    'trees': ('lawn', False, 'open'), 'rock': ('rock', False, 'open'), 'deep': ('water', False, 'open'),
    'water': ('water', False, 'open'), 'roof': ('roof', False, 'wall'), 'void': ('water', False, 'open'),
}
FIXES = {
    'court': [   # the kit's flights (0.5 u a step) are longer than plan D's: the sea stair's -2 m landing grows, the lower flight and quay go two cells out
        ('paint', 'paving at -2 m', 45, 63, 50, 64), ('paint', 'wood at -5 m', 45, 65, 50, 74), ('head', 'sea stair, lower', [[45.0, 64.5], [50.0, 64.5]]),
        ('disc', 'dais at 2 m', 47.5, 40.0, 4.6),   # the armillary's set piece brings its own dais: the floor under it is the sunk plaza's
    ],
    'infirmary': [   # plan H rev 2 (the user's pick, 2026-11-26): its cove, its two shore climbs and the made pieces
        ('terrace', 't-sea', dict(name='the deep')), ('terrace', 't-stream', dict(name='the sea')),
        ('terrace', 'sand at 0 m', dict(name='the beach', mat='sand')),
        ('new-terrace', dict(name='the jetty', h=0.3, mat='deck', edge='parapet')),
        ('paint', 'grass at 3.5 m', 0, 0, 88, 0),          # the lattice's first row fell outside the plan's fill
        # old paving going back to the garden, laid stone by stone (kit-stones.ts WEATHERED, 2026-11-27): the concept's worn flags
        ('terrace', 'path at 3.5 m', dict(mat='weathered')), ('terrace', 'plaza at 3.5 m', dict(mat='weathered')),
        ('terrace', 'road at 3.5 m', dict(mat='weathered')), ('terrace', 'dais at 3.8 m', dict(mat='weathered')),
        ('terrace', 'stairs at 2 m', dict(mat='weathered')),
        # the cove: a beach round its back under the clifftop, the sea inside it and out through its mouth
        ('disc', 'the beach', 35.0, 40.0, 11.0), ('disc', 'the sea', 35.0, 40.0, 7.0), ('paint', 'the sea', 23, 41, 47, 50),
        # the built stair down at the west shoulder (rev 3, the user 2026-11-27: the broken wall dropped; down and back)
        ('paint', 'the beach', 20, 34, 25, 36), ('flight', 'the west stair', [[19.5, 34.0], [19.5, 36.0]]),
        ('paint', 'the beach', 42, 33, 44, 38), ('paint', 'plaza at 3.5 m', 45, 37, 48, 39), ('paint', 'plaza at 3.5 m', 21, 31, 27, 33), ('paint', 'plaza at 3.5 m', 45, 31, 49, 33),   # the plan's angled stairs' leftovers
        # the jetty out into the cove, the purifier's platform at its end
        ('paint', 'the jetty', 34, 33, 36, 38), ('disc', 'the jetty', 35.0, 39.6, 2.7),
        # the made pieces in place of the plan's boxes and the trace's stand-ins
        ('drop-setpiece', 'setpiece.post'), ('drop-setpiece', 'setpiece.pier-round'),
        ('paint', 'grass at 3.5 m', 2, 30, 15, 44),
        ('object', dict(kind='setpiece', id='greenhouse', name='the great greenhouse', piece='setpiece.greenhouse', at=[8.5, 37.0], front='S')),
        ('object', dict(kind='setpiece', id='well', name='the well', piece='setpiece.infirmary-well', at=[35.0, 18.0], front='S')),
        ('object', dict(kind='setpiece', id='battery-stack', name="the battery's smokestack", piece='setpiece.battery-stack', at=[73.6, 29.5], front='S')),
        # the purifier (the user's pick, idea 2, 2026-11-27): the settling drum stands in the sea as the jetty's head; the pump
        # tower stands on the beach in a bay cut into the cliff, its top rising above the forecourt where the glyph path ends
        ('paint', 'the beach', 33, 27, 37, 30),
        ('object', dict(kind='setpiece', id='purifier-tower', name="the purifier's pump tower", piece='setpiece.purifier-tower', at=[35.0, 30.4], front='S')),
        ('object', dict(kind='setpiece', id='purifier-drum', name="the purifier's settling drum", piece='setpiece.purifier-drum', at=[35.0, 39.6], front='S')),
        ('object', dict(kind='pipe', id='purifier-pipe', name='the pipe along the jetty from the drum to the tower', r=0.3,
                        pts=[[35.0, 37.8], [35.0, 32.9]])),
        ('paint', 'grass at 3.5 m', 62, 27, 71, 33),       # the plan's wall box for the boiler house, replaced by its model
        ('object', dict(kind='setpiece', id='boiler-house', name="the battery's boiler house", piece='setpiece.boiler-house', at=[66.5, 30.0], front='S')),
        # the triage camp: six full-size tents round the forecourt's edges, the middle left open (the user: "negative space")
        # (the user, 2026-11-27: tents "angled so that we can see the people in it from the camera"): every tent's open side
        # faces the camera, turned a little this way or that as if pitched in a hurry
        ('object', dict(kind='setpiece', id='tent-n1', name='a tent', piece='setpiece.infirmary-tent', at=[25.0, 10.6], front='S', turn=6)),
        ('object', dict(kind='setpiece', id='tent-n2', name='a tent', piece='setpiece.infirmary-tent', at=[45.0, 10.6], front='S', turn=-8)),
        ('object', dict(kind='setpiece', id='tent-w1', name='a tent', piece='setpiece.infirmary-tent', at=[20.6, 17.4], front='S', turn=-12)),
        ('object', dict(kind='setpiece', id='tent-w2', name='a tent', piece='setpiece.infirmary-tent', at=[21.0, 25.4], front='S', turn=9)),
        ('object', dict(kind='setpiece', id='tent-e1', name='a tent', piece='setpiece.infirmary-tent', at=[49.4, 17.4], front='S', turn=11)),
        ('object', dict(kind='setpiece', id='tent-e2', name='a tent', piece='setpiece.infirmary-tent', at=[49.0, 25.4], front='S', turn=-7)),
        # the camp's leftovers on the lawn and paving round the tents: crates, barrels, rope (the user: "building materials for
        # tents strewn on the lawn to give some sense that things happened fast"; tent poles and canvas wait for their own piece)
        ('object', dict(kind='vignette', id='camp-crates-1', name='crates', piece='dress.crates', at=[15.2, 12.0], front='S', turn=14)),
        ('object', dict(kind='vignette', id='camp-rope-1', name='a coil of rope', piece='dress.rope-coil', at=[30.2, 8.2], front='S')),
        ('object', dict(kind='vignette', id='camp-barrel-1', name='a barrel', piece='dress.barrel', at=[15.4, 21.0], front='S')),
        ('object', dict(kind='vignette', id='camp-crates-2', name='crates', piece='dress.crates', at=[52.8, 12.2], front='S', turn=-20)),
        ('object', dict(kind='vignette', id='camp-rope-2', name='a coil of rope', piece='dress.rope-coil', at=[40.0, 8.4], front='S')),
        ('object', dict(kind='vignette', id='camp-barrel-2', name='a barrel', piece='dress.barrel', at=[52.9, 21.4], front='S')),
        ('object', dict(kind='vignette', id='camp-crates-3', name='crates', piece='dress.crates', at=[15.6, 28.6], front='S', turn=-9)),
        ('object', dict(kind='vignette', id='camp-crates-4', name='crates', piece='dress.crates', at=[52.6, 28.0], front='S', turn=22)),
        # the camp kit (one Meshy sheet, split): poles, canvas and stakes left where they were dropped, stretchers and
        # medical crates where the triage is happening (the user: "some sense that things happened fast")
        ('object', dict(kind='vignette', id='camp-stretcher-1', name='stretcher', piece='dress.stretcher', at=[24.0, 21.0], front='S', turn=20)),
        ('object', dict(kind='vignette', id='camp-stretcher-2', name='stretcher', piece='dress.stretcher', at=[46.0, 21.0], front='S', turn=-15)),
        ('object', dict(kind='vignette', id='camp-stretcher-3', name='stretcher', piece='dress.stretcher', at=[28.0, 14.6], front='S', turn=80)),
        ('object', dict(kind='vignette', id='camp-medcrate-1', name='medical crate', piece='dress.medical-crate', at=[26.6, 21.8], front='S', turn=0)),
        ('object', dict(kind='vignette', id='camp-medcrate-2', name='medical crate', piece='dress.medical-crate', at=[44.0, 21.8], front='S', turn=15)),
        ('object', dict(kind='vignette', id='camp-blankets-1', name='blankets', piece='dress.blankets', at=[18.0, 21.2], front='S', turn=0)),
        ('object', dict(kind='vignette', id='camp-blankets-2', name='blankets', piece='dress.blankets', at=[52.0, 21.2], front='S', turn=-10)),
        ('object', dict(kind='vignette', id='camp-poles-1', name='tent poles', piece='dress.tent-poles', at=[31.0, 12.6], front='S', turn=30)),
        ('object', dict(kind='vignette', id='camp-poles-2', name='tent poles', piece='dress.tent-poles', at=[41.0, 25.8], front='S', turn=-25)),
        ('object', dict(kind='vignette', id='camp-canvas-1', name='tent canvas', piece='dress.tent-canvas', at=[39.2, 13.0], front='S', turn=-10)),
        ('object', dict(kind='vignette', id='camp-canvas-2', name='tent canvas', piece='dress.tent-canvas', at=[29.0, 26.4], front='S', turn=12)),
        ('object', dict(kind='vignette', id='camp-stakes-1', name='tent stakes', piece='dress.tent-stakes', at=[33.4, 13.8], front='S', turn=0)),
        # lanterns on the road's far (north) side, so they never stand between the camera and the walkers (the user)
        ('object', dict(kind='vignette', id='road-lamp-1', name='a lamp post', piece='dress.lamp', at=[58.0, 35.4], front='S')),
        ('object', dict(kind='vignette', id='road-lamp-2', name='a lamp post', piece='dress.lamp', at=[66.0, 35.4], front='S')),
        ('object', dict(kind='vignette', id='road-lamp-3', name='a lamp post', piece='dress.lamp', at=[74.0, 35.4], front='S')),
        ('object', dict(kind='vignette', id='road-lamp-4', name='a lamp post', piece='dress.lamp', at=[82.0, 35.4], front='S')),
        # ---- greenery (2026-11-27, the user: "agreed lawn is very rough. we should add way more foliage, and tune the grass
        # look"): the lawns are the soft meadow (kit-stones.ts LAWN_VARY), woods round the edges, drifts and shrubs round the
        # forecourt and between its tents (its middle round the well left open), fields running off to the west, planting
        # on the cliff top and in the cove's corners, vines over the parapets and down the cliffs (style infirmary-garden)
        *[('terrace', t, dict(mat='meadow')) for t in ('grass at 3.5 m', 't-woods', 't-woods-e', 't-woods-f', 't-woods-g', 't-woods-i', 't-woods-n')],
        ('new-terrace', dict(name='the wood', h=3.5, mat='meadow', edge='open', walk=False)),
        ('paint', 'the wood', 0, 0, 33, 6), ('paint', 'the wood', 37, 0, 88, 6),          # the woods behind the camp, north of the road in
        ('paint', 'the wood', 82, 7, 88, 36), ('paint', 'the wood', 82, 40, 88, 46),       # and down the east edge
        ('paint', 'the wood', 56, 7, 81, 10), ('paint', 'the wood', 75, 11, 81, 24),       # a grove in the north-east corner
        ('object', dict(kind='scatter', id='wood-trees', name='the woods: trees', terrace='t-wood', seed=27, spacing=6.0, margin=0.6, jitter=0.5,
                        pieces=['setpiece.tree-oak', 'setpiece.tree-blossom', 'setpiece.tree-birch', 'setpiece.tree-birch', 'setpiece.tree-birch', 'setpiece.tree-cherry', 'setpiece.tree-wisteria'])),
        ('object', dict(kind='scatter', id='wood-under', name='the woods: undergrowth', terrace='t-wood', seed=11, spacing=3.6, margin=0.3, jitter=0.5,
                        pieces=['setpiece.bush-gold', 'setpiece.bush-yellow', 'setpiece.bush-lilac', 'setpiece.lavender', 'setpiece.lavender', 'setpiece.meadow-flowers', 'setpiece.grass-long'])),
        # (the open lawns keep no scattered tufts: tried, they read as spots; the meadow's own long blades and drifts are enough)
        ('object', dict(kind='scatter', id='cove-tufts', name='the cliff top and the cove corners', terrace='t-woods-n', seed=8, spacing=3.2, margin=0.2, jitter=0.5,
                        pieces=['setpiece.lavender', 'setpiece.meadow-flowers', 'setpiece.grass-long', 'setpiece.bush-yellow'])),
        ('object', dict(kind='dress', id='garden-vines', name='vines over the walls and cliffs', style='infirmary-garden', seed=3)),
        # the farmland west of the camp, running on out of sight
        *[('object', dict(kind='setpiece', id=f'field-{i}', name='a field', piece=f'setpiece.field-{crop}', at=at, front='S'))
          for i, (crop, at) in enumerate([('wheat', [4.2, 11.5]), ('greens', [4.2, 17.4]), ('beans', [4.2, 23.3]), ('wheat', [4.2, 29.0]),
                                          ('wheat', [12.2, 16.5]), ('greens', [12.2, 25.0])], 1)],
        # shrubs and drifts round the forecourt's edges and between the tents (never in its middle)
        *[('object', dict(kind='setpiece', id=f'edge-{i}', name='planting', piece=f'setpiece.{p}', at=at, front='S'))
          for i, (p, at) in enumerate([
              ('bush-yellow', [19.0, 8.0]), ('lavender', [22.6, 7.6]), ('bush-pink', [27.0, 7.8]), ('meadow-flowers', [32.0, 7.8]),
              ('bush-lilac', [38.4, 7.8]), ('lavender', [43.0, 7.6]), ('bush-gold', [48.0, 7.9]), ('bush-yellow', [52.6, 8.2]),
              ('bush-pink', [17.9, 13.9]), ('lavender', [16.2, 22.6]), ('bush-yellow', [18.0, 29.6]),
              ('bush-lilac', [55.8, 9.0]), ('bush-yellow', [56.2, 14.0]), ('lavender', [56.0, 19.6]), ('bush-pink', [55.9, 24.2]), ('bush-gold', [56.4, 29.0]),
              ('tree-cherry', [60.0, 14.5]), ('tree-birch', [72.4, 13.0]), ('tree-wisteria', [71.0, 22.6]), ('tree-wisteria', [16.4, 36.2]),
          ], 1)],
        # drifts on the open lawns, in clusters with lawn between (single shrubs spread evenly read as spots): a few
        # shrubs with lavender and flowers round them, offsets in corners
        *[('object', dict(kind='setpiece', id=f'drift-{i}-{k}', name='a drift', piece=f'setpiece.{p}', at=[cx + dx, cy + dy], front='S'))
          for i, ((cx, cy), ps) in enumerate([
              ((64.6, 14.2), ('bush-yellow', 'lavender', 'meadow-flowers', 'bush-lilac', 'lavender')),
              ((65.0, 21.0), ('bush-pink', 'lavender', 'lavender', 'meadow-flowers', 'bush-gold', 'meadow-flowers')),
              ((59.6, 25.6), ('lavender', 'meadow-flowers', 'bush-gold', 'lavender')),
              ((77.4, 28.6), ('bush-lilac', 'meadow-flowers', 'lavender', 'bush-yellow', 'lavender')),
              ((77.6, 33.6), ('meadow-flowers', 'lavender', 'bush-pink')),
              ((59.8, 33.8), ('bush-gold', 'lavender', 'meadow-flowers')),
              ((3.0, 43.4), ('bush-lilac', 'lavender', 'meadow-flowers', 'bush-yellow', 'lavender')),
              ((10.0, 43.6), ('lavender', 'meadow-flowers', 'bush-pink', 'lavender')),
              ((16.4, 42.6), ('bush-yellow', 'meadow-flowers', 'lavender', 'bush-gold')),
              ((53.6, 42.6), ('lavender', 'bush-yellow', 'meadow-flowers', 'lavender', 'bush-lilac')),
              ((61.0, 43.6), ('meadow-flowers', 'lavender', 'bush-pink', 'meadow-flowers')),
              ((68.0, 42.4), ('bush-gold', 'lavender', 'lavender', 'meadow-flowers', 'bush-yellow')),
              ((75.0, 43.6), ('lavender', 'bush-lilac', 'meadow-flowers', 'lavender')),
              ((80.0, 42.2), ('meadow-flowers', 'bush-yellow', 'lavender')),
          ], 1)
          for k, (p, (dx, dy)) in enumerate(zip(ps, [(0, 0), (1.3, 0.35), (-1.25, 0.5), (0.45, -1.1), (-0.5, 1.25), (1.1, -0.9)]))],
        # markers
        ('object', dict(kind='marker', id='start-0', at=[35, 5], name='seat 0 starts on the road in from the main gate')),
        ('object', dict(kind='marker', id='start-1', at=[34.2, 4.2], name="seat 1's start")),
        ('object', dict(kind='marker', id='start-2', at=[35.8, 4.2], name="seat 2's start")),
        ('object', dict(kind='marker', id='start-3', at=[35, 3.4], name="seat 3's start")),
        ('object', dict(kind='marker', id='gate-court', at=[35, 1.5], name="the road north: back to the courtyard's bridge")),
        ('object', dict(kind='marker', id='gate-battery', at=[86.5, 37.5], name="the road's east end: on to the battery")),
        ('object', dict(kind='marker', id='well', at=[35, 18], tag='landmark', name='the well')),   # the sim's infirmary looks for 'well'
    ],
    'infirmary-d': [   # (plan D, kept as history: the scene is plan H's since 2026-11-26) plan D's stairs are plain stairs() (sectors to the trace), so its four flights are written here (2026-11-26)
        ('terrace', 't-sea', dict(name='the deep')), ('terrace', 't-stream-c', dict(name='the bath')),
        ('terrace', 't-stream', dict(name='the sea')), ('terrace', 'stairs at 0 m', dict(name='the shore walk')),
        ('terrace', 'stairs at 4.5 m', dict(name="the east flight's landing", h=4.25, edge='parapet')),
        ('terrace', 'the shore walk', dict(edge='parapet')), ('terrace', 'sand at 0 m', dict(name='the beach', mat='sand')),   # a low sea wall along the walk, and round the bath sunk into it
        ('paint', 't-woods-d', 0, 0, 76, 0),                  # the lattice's first row fell outside the plan's fill: woods, not -10 m sea
        # the overlook's two flights down to the well's tier: the west one straight down by the greenhouse; the east one a long run
        # along the drop (rev 7; the user, 2026-11-26: move the stills east to make room): a ledge off the top terrace, a flight,
        # a landing at 4.25 m, a second flight, then the well's tier. The conduit walks are dropped: pipes come back as dressing.
        ('paint', 'paving at 5 m', 15, 18, 20, 19),
        ('paint', 'paving at 3.5 m', 15, 20, 20, 24), ('paint', 'paving at 3.5 m', 25, 20, 42, 25),
        ('disc', 'dais at 4 m', 23.0, 21.5, 2.4),
        # (round 2's critic: two flights and a fenced landing read as a pen; one run along the wall face instead)
        ('paint', 'paving at 5 m', 27, 20, 30, 21),         # the ledge keeps a cell clear of the dais's round edge
        ('paint', 'stills', 39, 21, 44, 24),
        ('paint', 'road at 3.5 m', 26, 25, 36, 28),          # the cobbles start beside the dais, so the way out shows from the well
        ('flight', 'west flight', [[16.0, 19.5], [19.0, 19.5]]),
        ('flight', 'east flight', [[30.5, 20.0], [30.5, 21.0]]),
        # the shore: sand, the walk, the flight down by the greenhouse and the way back up along the cliff, west to east
        # (the user, 2026-11-26: the lower ledge felt "way too constrained": the shore is now six rows deep, the walk five,
        # with a sand beach running on under the cliffs both ways and the sea starting at row 42)
        ('paint', 'the beach', 0, 35, 48, 36), ('paint', 'the beach', 0, 37, 76, 41),
        ('paint', 'the shore walk', 16, 30, 19, 36), ('paint', 'the shore walk', 15, 35, 34, 40), ('paint', 'the shore walk', 24, 32, 32, 34),
        ('flight', 'shore flight down', [[16.0, 29.5], [19.0, 29.5]]), ('flight', 'shore flight up', [[32.5, 32.0], [32.5, 34.0]]),
        ('paint', 'the shore walk', 21, 33, 27, 34),       # a bay cut into the bluff, so the bath has room
        ('paint', 'grass at 3.5 m', 20, 29, 23, 32),       # the bluff over the bay is lawn with a parapet: a built wall behind the bath, a lookout above
        ('disc', 'the bath', 22.5, 35.0, 1.5),             # west of the climbing flight's landing             # a row of the walk between it and the sea, or it pours over as a fall            # a pool sunk into the shore walk, not a raised rim against the cliff
        # the made set pieces (Meshy, 2026-11-26) in place of the plan's wall boxes and the trace's post stand-ins for the tents
        ('drop-setpiece', 'setpiece.post'), ('drop-setpiece', 'setpiece.pier-round'),
        ('object', dict(kind='setpiece', id='well', name='the well', piece='setpiece.infirmary-well', at=[23.0, 21.5], front='S')),
        # the conduits: brass pipes drawn to size along their routes (kit-pipe.ts), from the well's stubs to what it feeds
        ('object', dict(kind='pipe', id='pipe-greenhouse', name='the conduit to the greenhouse', r=0.3,
                        pts=[[21.7, 22.6, 4.5], [20.4, 22.6, 4.5], [20.4, 22.6, 4.0], [20.4, 25.0], [15.4, 25.0], [15.4, 23.6], [14.9, 23.6]])),
        ('object', dict(kind='pipe', id='pipe-stills', name='the conduit to the stills', r=0.3,
                        pts=[[24.4, 22.6, 4.5], [25.6, 22.6, 4.5], [25.6, 22.6, 4.0], [25.6, 23.6], [39.3, 23.6]])),
        ('object', dict(kind='pipe', id='pipe-bath', name='the conduit down to the bath', r=0.3,
                        pts=[[23.0, 22.9], [23.0, 32.4], [23.0, 32.75, 4.0], [23.0, 32.75, 0.7], [23.0, 33.4]])),
        ('object', dict(kind='pipe', id='pipe-tents', name='the conduit along the top terrace to the tents', r=0.3,
                        pts=[[17.0, 16.8], [17.0, 18.6], [25.0, 18.6], [25.0, 16.8]])),
        ('object', dict(kind='pipe', id='pipe-riser', name='the conduit up the overlook wall', r=0.3,
                        pts=[[23.0, 20.1], [23.0, 19.7, 4.5], [23.0, 19.7, 5.5], [23.0, 18.6]])),
        # the bath's dressing (one Meshy sheet, split): urns either side, planters to fill with grown flowers, the towel stand
        ('object', dict(kind='vignette', id='bath-urn-e', name='a lidded urn by the bath', piece='dress.urn-lidded', at=[24.5, 36.4], front='W')),
        ('object', dict(kind='vignette', id='bath-towels', name='the towel stand', piece='dress.towel-stand', at=[25.9, 36.3], front='W')),
        ('object', dict(kind='vignette', id='bath-urn', name='a tall urn', piece='dress.urn-tall', at=[35.0, 35.6], front='W')),
        ('object', dict(kind='vignette', id='bath-trough', name='a trough by the climb', piece='dress.planter-trough', at=[29.6, 36.2], front='N')),
        ('object', dict(kind='vignette', id='bath-box', name='a planter', piece='dress.planter-box', at=[31.2, 36.3], front='N')),
        ('object', dict(kind='setpiece', id='battery-stack', name="the battery's smokestack", piece='setpiece.battery-stack', at=[51.0, 23.5], front='S')),
        ('paint', 'paving at 3.5 m', 9, 21, 15, 25), ('paint', 'paving at 3.5 m', 39, 21, 44, 24),
        ('object', dict(kind='setpiece', id='greenhouse', name='the greenhouse', piece='setpiece.greenhouse', at=[12.0, 23.0], front='S')),
        ('object', dict(kind='setpiece', id='stills', name='the stills', piece='setpiece.stills', at=[41.5, 22.5], front='S')),
        ('object', dict(kind='setpiece', id='tent-w', name='the west tent', piece='setpiece.infirmary-tent', at=[14.0, 15.5], front='S')),
        ('object', dict(kind='setpiece', id='tent-e', name='the east tent', piece='setpiece.infirmary-tent', at=[32.0, 15.5], front='S')),
        # markers: the seats start on the road in, on the well's axis (the read: arrive from the north, the cots first)
        ('object', dict(kind='marker', id='start-0', at=[23, 9], name="seat 0 starts on the road in from the main gate")),
        ('object', dict(kind='marker', id='start-1', at=[22.2, 8.2], name="seat 1's start")),
        ('object', dict(kind='marker', id='start-2', at=[23.8, 8.2], name="seat 2's start")),
        ('object', dict(kind='marker', id='start-3', at=[23, 7.4], name="seat 3's start")),
        ('object', dict(kind='marker', id='gate-court', at=[23, 1.5], name="the road north: back to the courtyard's bridge")),
        ('object', dict(kind='marker', id='gate-battery', at=[75, 27], name="the road's east end: on to the battery")),
        ('object', dict(kind='marker', id='well', at=[23, 21.5], tag='landmark', name='the well')),
    ],
}
SETPIECE_NAMES = {'bell tower': 'setpiece.bell-tower', 'battery tower': 'setpiece.battery-tower', 'beacon': 'setpiece.beacon',
                  'the armillary': 'setpiece.armillary'}
SMALL = 30.0  # u^2: a building smaller than this is a set piece (a pier, a pylon, a post), not a terrace

gaps, flights, setpieces = [], [], []


def setpiece_for(name, height, round_):
    """The kit's set piece for a plan building: by name, else a pier by shape and height."""
    if name in SETPIECE_NAMES: return SETPIECE_NAMES[name]
    if height < 3: return 'setpiece.post'
    if round_: return 'setpiece.pier-round'
    return 'setpiece.gate-tower' if height >= 7 else 'setpiece.gate-pier'


def area(poly):
    return abs(sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1] for i in range(len(poly)))) / 2


def lattice_init(self, name, title, U, V, base=-10.0, base_mat='deep'):
    self.name, self.title, self.U, self.V = name, title, U, V
    us = np.arange(U[0], U[1] + 1e-6, G); vs = np.arange(V[0], V[1] + 1e-6, G)
    self.CU, self.CV = np.meshgrid(us, vs)
    self.nx, self.ny = len(us), len(vs); self.x0 = self.y0 = 0
    self.h = np.full((self.ny, self.nx), base, dtype=np.float32)
    self.m = np.full((self.ny, self.nx), base_mat, dtype=object)
    self.bld = np.zeros((self.ny, self.nx), dtype=bool)
    self.bname = np.full((self.ny, self.nx), '', dtype=object)
    self.flightid = np.zeros((self.ny, self.nx), dtype=int)
    self.guard = np.zeros((self.ny, self.nx), dtype=bool)
    self.routes, self.marks, self.gates, self.doors, self.notes, self.passes = [], [], [], [], [], []
    self.ops = []


_fill, _stairs = planmod.Plan.fill, planmod.Plan.stairs


def fill(self, poly, h, mat):
    k = _fill(self, poly, h, mat); self.bname[k] = ''; self.flightid[k] = 0; return k


def building(self, poly, ground, height, name='', doors=(), roof='roof'):
    if roof == 'wall':                       # the plan's own parapets and flight cheeks: the kit guards edges by rule
        return np.zeros_like(self.bld)
    if not isinstance(poly, np.ndarray) and (area(poly) < SMALL or name in SETPIECE_NAMES):
        setpieces.append(dict(piece=setpiece_for(name, height, len(poly) >= 24), at=planmod.centroid(poly), name=name, ground=ground))
        # its plinth: the ground under it at its base height (the plan's building was its own ground)
        k = self.mask(poly); self.h[k] = ground; self.bname[k] = ''; self.flightid[k] = 0; self.bld[k] = False
        self.m[k & ~np.isin(self.m, ['plaza', 'paving', 'path', 'road', 'grass'])] = 'paving'
        return np.zeros_like(self.bld)
    k = self.mask(poly); self.h[k] = ground + height; self.m[k] = 'roof'; self.bld[k] = True
    self.bname[k] = name or f'a building {height:g} m'; self.flightid[k] = 0
    if name: gaps.append(dict(kind='building', what=f'{name}: a plain wall box for now (needs its facade pieces)', at=planmod.centroid(poly)))
    return k


def stairs(self, poly, h0, h1, axis='V'):
    k = _stairs(self, poly, h0, h1, axis)
    if getattr(self, '_in_flight', None) is None:
        gaps.append(dict(kind='curved-flight', what=f'stairs {h0:g} to {h1:g} m in a shape the kit has no flight for (a sector or ring)',
                         at=planmod.centroid(poly) if not isinstance(poly, np.ndarray) else (0, 0)))
    else:
        self.flightid[k] = self._in_flight
    return k


_sflight = semmod.Semantic.flight


def sflight(self, top, bottom, width, h_top, h_bottom, landing=2.5, cheeks=False, cheek_h=1.0, pad=None, name=''):
    flights.append(dict(top=top, bottom=bottom, width=width, h_top=h_top, h_bottom=h_bottom, name=name))
    self.P._in_flight = len(flights)
    try: return _sflight(self, top, bottom, width, h_top, h_bottom, landing, cheeks, cheek_h, pad, name)
    finally: self.P._in_flight = None


def landmark(self, c, name, height=12.0, radius=1.0):
    setpieces.append(dict(piece=setpiece_for(name, height, True), at=c, name=name)); self.marks.append((c, name, height, radius))


circles = {}   # (centre, r) in u -> angle ranges (None: the whole circle): every round shape the plan draws
_circle, _arc_band = planmod.circle, planmod.arc_band


def circle(c, r):
    circles.setdefault((tuple(c), r), []).append(None); return _circle(c, r)


def arc_band(c, r0, r1, a0, a1, n=40):
    for rr in (r0, r1):
        if rr > 0: circles.setdefault((tuple(c), rr), []).append((a0, a1))
    return _arc_band(c, r0, r1, a0, a1, n)


planmod.circle, planmod.arc_band = circle, arc_band
planmod.Plan.__init__ = lattice_init
planmod.Plan.fill = fill
planmod.Plan.building = building
planmod.Plan.stairs = stairs
planmod.Plan.landmark = landmark
planmod.Plan.render = lambda self: None
planmod.Plan.frames = lambda self, *a, **k: None
semmod.Semantic.flight = sflight
semmod.Semantic.check = lambda self: None   # the kit compiler checks flights itself
import finish as finmod
finmod.close_gates = lambda P, *a, **k: None   # the plan closes gate lines with strips of woods for its old sim; the kit has no use for them


def trace(plan_name):
    sys.argv = [sys.argv[0]]
    ns = runpy.run_path(os.path.join(PLANS, 'plans', plan_name + '.py'), run_name='__trace__')
    return ns['P']


def to_scene(P, scene_name):
    U0, V0 = P.U[0], P.V[0]
    ny, nx = P.h.shape
    h = P.h.copy()
    # flight footprints belong to the ground at their foot (the kit's flight stands on the lower terrace)
    for n, f in enumerate(flights, 1):
        h[P.flightid == n] = f['h_bottom']
    # stair cells outside flights (sectors, rings) snap to the nearest 0.5 m
    sea = np.isin(P.m, ['deep', 'void'])           # all open water is one sea, at the plan's highest open-water level
    if sea.any(): h[sea] = h[P.m == 'deep'].max() if (P.m == 'deep').any() else h[sea].max(); P.m[sea] = 'deep'
    loose = (P.m == 'stairs') & (P.flightid == 0)
    h[loose] = np.round(h[loose] * 2) / 2
    key = np.empty((ny, nx), dtype=object)
    for i in range(ny):
        for j in range(nx):
            m = P.m[i, j]
            if P.flightid[i, j]: m = 'paving'
            key[i, j] = (round(float(h[i, j]), 2), 'bld:' + P.bname[i, j] if P.bld[i, j] else m)
    # terraces: one per key; names from the plan where it has them
    keys = sorted(set(key.ravel()), key=lambda k: (k[0], k[1]))
    GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    if len(keys) > len(GLYPHS): raise SystemExit(f'{len(keys)} terraces: too many glyphs')
    terraces, gl = [], {}
    used = set()
    for k, g in zip(keys, GLYPHS):
        hh, m = k
        if m.startswith('bld:'):
            nm = m[4:]; mat, walk, edge = 'roof', False, 'wall'
        else:
            mat, walk, edge = MATMAP[m]
            nm = {'deep': 'the sea', 'water': 'the stream', 'trees': 'woods', 'rock': 'rock', 'void': 'beyond'}.get(m, f'{m} at {hh:g} m')
        tid = 't-' + '-'.join(''.join(c if c.isalnum() else ' ' for c in nm.lower().replace('the ', '')).split())
        while tid in used: tid += '-' + g.lower()
        used.add(tid)
        t = dict(id=tid, glyph=g, name=nm, h=hh, mat=mat, edge=edge)
        if not walk: t['walk'] = False
        terraces.append(t); gl[k] = g
    rows = [[gl[key[i, j]] for j in range(nx)] for i in range(ny)]
    H = {g: k for k, g in enumerate(sorted((t['glyph'] for t in terraces), key=lambda g: (next(t['h'] for t in terraces if t['glyph'] == g), g)))}   # the compiler's rank: height, then glyph
    Th = {t['glyph']: t['h'] for t in terraces}

    def fix_saddles(keep=frozenset()):
        """A cell with opposite corners on one side of a level and the other two not: lift one low corner (not a kept one)."""
        for _ in range(20):
            fixed = 0
            for i in range(ny - 1):
                for j in range(nx - 1):
                    cs = [(i, j), (i, j + 1), (i + 1, j + 1), (i + 1, j)]
                    hs = [H[rows[a][b]] for a, b in cs]
                    for lv in sorted(set(hs))[1:]:
                        ins = [x >= lv for x in hs]
                        if ins in ([True, False, True, False], [False, True, False, True]):
                            lo = [q for q in range(4) if not ins[q] and cs[q] not in keep] or [q for q in range(4) if ins[q]]
                            a, b = cs[lo[0]]; nb = cs[(lo[0] + 1) % 4]
                            rows[a][b] = rows[nb[0]][nb[1]]; fixed += 1
                            break
            if not fixed: return

    fix_saddles()
    to_c = lambda u, v: [round((u - U0) / G * 2) / 2, round((v - V0) / G * 2) / 2]
    objs, kept = [], set()
    from collections import Counter
    for n, f in enumerate(flights, 1):
        (tu, tv), (bu, bv) = f['top'], f['bottom']
        if abs(tu - bu) > 1e-6:
            gaps.append(dict(kind='flight', what=f"{f['name']}: a flight not along V (the trace only does those yet)", at=f['top'])); continue
        ids = np.argwhere(P.flightid == n)
        if not len(ids): continue
        # the head: the corner row just before the flight's footprint, on the side of the plan's top
        d = 1 if bv > tv else -1
        iy = int(ids[:, 0].min() if d > 0 else ids[:, 0].max())
        xs = ids[ids[:, 0] == iy][:, 1]; x0, x1 = int(xs.min()), int(xs.max())
        steps = round((f['h_top'] - f['h_bottom']) / 0.15); length = steps * 0.5 / G      # cells, as compile.py sizes it
        top_row = iy - d
        foot = top_row + d * (0.5 + length)                                               # the foot's y, in corners
        beyond = int(math.ceil(foot)) if d > 0 else int(math.floor(foot))
        up = [rows[y][x] for y in range(top_row, top_row - 3 * d, -d) if 0 <= y < ny for x in range(x0, x1 + 1)
              if abs(Th[rows[y][x]] - f['h_top']) < 0.3]
        if not up:
            gaps.append(dict(kind='flight', what=f"{f['name']}: no ground at {f['h_top']:g} m at its head", at=f['top'])); continue
        top_g = Counter(up).most_common(1)[0][0]
        land = [rows[y][x] for y in range(beyond, beyond + 3 * d, d) if 0 <= y < ny for x in range(x0, x1 + 1)
                if abs(Th[rows[y][x]] - f['h_bottom']) < 0.3]
        if not land:
            gaps.append(dict(kind='flight', what=f"{f['name']}: no ground at {f['h_bottom']:g} m past its foot", at=f['bottom'])); continue
        bot_g = Counter(land).most_common(1)[0][0]
        # the top landing (two rows), and the steps and the bottom landing (to two rows past the foot): one terrace each
        for y in (top_row, top_row - d):
            for x in range(x0, x1 + 1): rows[y][x] = top_g; kept.add((y, x))
        for y in range(iy, beyond + 2 * d, d):
            if 0 <= y < ny:
                for x in range(x0, x1 + 1): rows[y][x] = bot_g; kept.add((y, x))
        hy = top_row + 0.5 * d
        objs.append(dict(id=f'f{n}', kind='flight', name=f['name'], head=[[float(x0), hy], [float(x1), hy]]))
    # fixes the plan needs on the kit, by scene: ('paint', terrace name, x0, y0, x1, y1) inclusive corners, ('head', flight name, head)
    byname = {o['name']: o for o in objs}
    glyph_of = lambda nm: next(t['glyph'] for t in terraces if nm in (t['name'], t['id']))   # by name, or by id where names repeat
    for fx in FIXES.get(scene_name, []):
        if fx[0] == 'new-terrace':  # ('new-terrace', fields): a terrace the plan has no cells of yet (painted by later fixes)
            t = dict(fx[1]); t['glyph'] = next(g for g in GLYPHS if g not in {u['glyph'] for u in terraces})
            t['id'] = 't-' + '-'.join(''.join(c if c.isalnum() else ' ' for c in t['name'].lower().replace('the ', '')).split())
            terraces.append(t); Th[t['glyph']] = t['h']
            H.clear(); H.update({g: k for k, g in enumerate(sorted((u['glyph'] for u in terraces), key=lambda g: (Th[g], g)))})
        elif fx[0] == 'terrace':    # ('terrace', name, changes): rename or re-level one of the trace's terraces
            t = next(t for t in terraces if fx[1] in (t['name'], t['id'])); t.update(fx[2])
            if 'name' in fx[2]: t['id'] = 't-' + '-'.join(''.join(c if c.isalnum() else ' ' for c in fx[2]['name'].lower().replace('the ', '')).split())
        elif fx[0] == 'object':     # ('object', obj): a marker or any other object, as written
            objs.append(dict(fx[1]))
        elif fx[0] == 'drop-setpiece':   # ('drop-setpiece', piece): leave out the trace's set pieces of that kind (stand-ins replaced by hand)
            setpieces[:] = [sp for sp in setpieces if sp['piece'] != fx[1]]
        elif fx[0] == 'flight':     # ('flight', name, head): a flight the plan drew as plain stairs
            objs.append(dict(id=f'f{sum(o["kind"] == "flight" for o in objs) + 1}', kind='flight', name=fx[1], head=fx[2]))
        elif fx[0] == 'paint':
            _, nm, x0, y0, x1, y1 = fx; g = glyph_of(nm)
            for y in range(y0, y1 + 1):
                for x in range(x0, x1 + 1): rows[y][x] = g; kept.add((y, x))
        elif fx[0] == 'head' and fx[1] in byname: byname[fx[1]]['head'] = fx[2]
        elif fx[0] == 'disc':       # ('disc', terrace name, cx, cy, r): every corner within r of (cx, cy) on one level
            _, nm, cx, cy, rr = fx; g = glyph_of(nm)
            for y in range(ny):
                for x in range(nx):
                    if math.hypot(x - cx, y - cy) <= rr: rows[y][x] = g; kept.add((y, x))
    fix_saddles(frozenset(kept))
    # rounds: each circle the plan drew (radius 3 u or more), kept only where an edge lies along it
    import compile as kc
    n = 0
    for ((cu, cv), r), ranges in sorted(circles.items(), key=lambda kv: -kv[0][1]):
        if r < 3: continue
        n += 1
        o = dict(id=f'r{n}', kind='round', name=f'the circle r {r:g} u round ({cu:g}, {cv:g})', centre=to_c(cu, cv), r=r / G)
        if None not in ranges:
            o['from'], o['to'] = min(a for a, _ in ranges) - 3, max(b for _, b in ranges) + 3
        objs.append(o)
    probe = dict(schema=1, name=scene_name, G=2, terraces=terraces, corners=[''.join(r) for r in rows], objects=objs)
    unused = {ref for f in kc.compile_scene(probe)['findings'] if f['code'] == 'round' for ref in f['refs']}
    objs = [o for o in objs if o['id'] not in unused]
    KITP = json.load(open(os.path.join(HERE, 'kit.json'), encoding='utf-8'))['pieces']
    Tg = {t['glyph']: t for t in terraces}

    def level_ground(at, rr, base):
        """Every corner under a footprint of radius rr (cells) at `at` on walkable ground within 0.35 m, near the base height."""
        hs = []
        for y in range(math.floor(at[1] - rr), math.ceil(at[1] + rr) + 1):
            for x in range(math.floor(at[0] - rr), math.ceil(at[0] + rr) + 1):
                if not (0 <= y < ny and 0 <= x < nx): return False
                if math.hypot(x - at[0], y - at[1]) > rr + 1.0: continue     # a cell beyond: true arcs can cut inside the corners
                t = Tg[rows[y][x]]
                if not t.get('walk', True) or t['edge'] == 'wall': return False
                hs.append(t['h'])
        return bool(hs) and max(hs) - min(hs) <= 0.35 and (base is None or abs(max(hs) - base) <= 0.5)

    for n, sp in enumerate(setpieces, 1):
        at = to_c(*sp['at']); rr = KITP[sp['piece']]['footprint'][0] / 2 / G
        if not level_ground(at, rr, sp.get('ground')):   # a pier the plan set on an edge: the nearest spot within 1.5 cells on one level
            offs = sorted({(dx / 2, dy / 2) for dx in range(-3, 4) for dy in range(-3, 4)}, key=lambda d: math.hypot(*d))
            found = next(([at[0] + dx, at[1] + dy] for dx, dy in offs if level_ground([at[0] + dx, at[1] + dy], rr, sp.get('ground'))), None)
            if found: at = found
            elif sp.get('ground') is not None:     # no level spot near: its plinth, a cell wider than it, on the level at its base height
                base = [t for t in terraces if abs(t['h'] - sp['ground']) < 0.01 and t.get('walk', True) and t['edge'] != 'wall']
                near = [rows[y][x] for y in range(max(0, math.floor(at[1] - rr - 2)), min(ny, math.ceil(at[1] + rr + 3)))
                        for x in range(max(0, math.floor(at[0] - rr - 2)), min(nx, math.ceil(at[0] + rr + 3))) if Tg[rows[y][x]] in base]
                if near:
                    g = Counter(near).most_common(1)[0][0]
                    for y in range(max(0, math.floor(at[1] - rr - 1)), min(ny, math.ceil(at[1] + rr + 2))):
                        for x in range(max(0, math.floor(at[0] - rr - 1)), min(nx, math.ceil(at[0] + rr + 2))):
                            if math.hypot(x - at[0], y - at[1]) <= rr + 1.0: rows[y][x] = g; kept.add((y, x))
        objs.append(dict(id=f's{n}', kind='setpiece', name=sp['name'] or sp['piece'].split('.')[1], piece=sp['piece'], at=at, front='S'))
    fix_saddles(frozenset(kept))     # plinths painted above can leave a saddle at their rim
    probe = dict(schema=1, name=scene_name, G=2, terraces=terraces, corners=[''.join(r) for r in rows], objects=objs)
    unused = {ref for f in kc.compile_scene(probe)['findings'] if f['code'] == 'round' for ref in f['refs']}
    objs = [o for o in objs if o['id'] not in unused]
    for k, g in enumerate(gaps): g['at_c'] = to_c(*g['at'])
    notes = (f'Traced from tools/place-plans/plans/{P.name}.py ({P.title}) by tools/kit/trace_plan.py. One grid corner = '
             f'(U, V) = ({U0:g} + 2x, {V0:g} + 2y) in the plan. Gaps (what the kit cannot say yet) are pins.')
    sc = dict(schema=1, name=scene_name, G=2, notes=notes, terraces=terraces, corners=[''.join(r) for r in rows], objects=objs)
    return sc


def write_scene(sc, path):
    """The scene file's layout: one terrace, corner row or object per line (as scene.py and the editor write it)."""
    L = ['{', f'  "schema": {sc["schema"]}, "name": {json.dumps(sc["name"])}, "G": {sc["G"]}, "notes": {json.dumps(sc["notes"])},', '  "terraces": [']
    L += [('    ' + json.dumps(t) + (',' if k < len(sc['terraces']) - 1 else '')) for k, t in enumerate(sc['terraces'])]
    L += ['  ],', '  "corners": [']
    L += [('    ' + json.dumps(r) + (',' if k < len(sc['corners']) - 1 else '')) for k, r in enumerate(sc['corners'])]
    L += ['  ],', '  "objects": [']
    L += [('    ' + json.dumps(o) + (',' if k < len(sc['objects']) - 1 else '')) for k, o in enumerate(sc['objects'])]
    L += ['  ]', '}']
    open(path, 'w', encoding='utf-8', newline='\n').write('\n'.join(L) + '\n')


if __name__ == '__main__':
    plan_name, scene_name = sys.argv[1], sys.argv[2]
    P = trace(plan_name)
    sc = to_scene(P, scene_name)
    out = os.path.join(HERE, 'scenes', scene_name + '.scene.json')
    write_scene(sc, out)
    json.dump(gaps, open(os.path.join(HERE, 'scenes', scene_name + '.gaps.json'), 'w', encoding='utf-8'), indent=1)
    print(f'{out}: {len(sc["corners"][0]) - 1} x {len(sc["corners"]) - 1} cells, {len(sc["terraces"])} terraces, '
          f'{len(sc["objects"])} flights, {len(gaps)} gaps')
