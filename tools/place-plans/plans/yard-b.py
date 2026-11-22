"""Drill yard plan B, the descent: the yard steps down from the courtyard's plateau in three terraces facing the camera,
a station or two on each, the path zig-zagging down the screen: strike on the top terrace, heavy and retreat on the
middle one, parry and hands on the drill ground at the bottom with the soldiers; the armoury at the bottom, its rack
the goal you see from the top. One long straight stair climbs back to the gate."""
import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from plan import *

P = Plan('yard-b', 'Drill yard B: the descent', U=(-55, 60), V=(-45, 50))
P.fill(rect(-55, -45, 60, 50), 6.0, 'grass')
P.building(rect(-55, -45, 60, -32), 6.0, 16.0, 'great hall')                  # the range at the top
P.fill(rect(-45, -32, 50, -14), 6.0, 'paving')                               # the top terrace (6 m)
P.fill(rect(-45, -14, 50, 10), 3.0, 'paving')                                # the middle terrace (3 m)
P.fill(rect(-45, 10, 50, 50), 0.0, 'path')                                   # the drill ground (0 m)
P.building(rect(-55, -32, -45, 50), 0.0, 12.0, 'workshops')                  # the range down the west side
P.fill(rect(50, -30, 60, -20), 6.0, 'path')                                  # in from the courtyard's gate
P.stairs(rect(-40, -14, -30, -5), 6.0, 3.0, 'V')                             # down at the west end
P.stairs(rect(30, 10, 40, 19), 3.0, 0.0, 'V')                                # down at the east end
for i, (u, v, nm) in enumerate([(25, -24, 'strike lanes'), (-20, -24, 'strike lanes'), (-20, -2, 'heavy: the sack'), (15, -2, 'retreat: the mallet'),
                                (18, 26, 'parry lane'), (-12, 30, 'hands ring')]):
    if i == 1: continue
    P.fill(circle((u, v), 4), {0: 6.0, 2: 3.0, 3: 3.0, 4: 0.0, 5: 0.0}[i], 'sand'); P.note((u, v - 5), nm)
P.building(rect(-45, 44, -25, 50), 0.0, 12.0, 'armoury', doors=[(-35, 43)])
P.landmark((-35, 40), 'the rack', 3, 1.5)
for u in (0, 20, 35):
    P.note((u, 38), 'soldiers')
P.fill(rect(44, -14, 50, 46), 0.0, 'path')
P.stairs(orect((54, 8), 6, 36, math.radians(90)), 6.0, 0.0, 90)              # the long stair back up, on the east side
P.fill(rect(50, -20, 58, -10), 6.0, 'path')
P.gate((58, -25), 'to the courtyard')
P.journey([(58, -25), (45, -25), (25, -24)], 'In from the courtyard, onto the top terrace', 'The whole yard below, the armoury’s glow at the bottom')
P.journey([(25, -24), (-20, -22), (-35, -16), (-35, -6), (-20, -2), (15, -2), (35, 4), (35, 16), (18, 26), (-12, 30), (-30, 36)], 'The stations, down the terraces', 'Each terrace a station or two, seen from the one above')
P.journey([(-30, 36), (-35, 40)], 'The rack at the armoury door', 'The focus: the flame sword')
P.journey([(-30, 38), (20, 36), (47, 30), (54, 24), (54, -6), (54, -16), (58, -25)], 'Back up to the courtyard', 'Through the soldiers, up the long stair')
from finish import lips
lips(P)
P.render()
if "--frames" in sys.argv: P.frames()

