"""Infirmary plan D (the structure critic's mix: B, the slope, as the base, with C's conduits as raised walkways), the
user's pick (2026-11-22). The road from the main gate arrives on the well's axis at the top tier, where the patients and
nurses wait under tents, their equipment gone dark: the wounded are the first thing you see.

Revision 2 (the flow critic on flat frames, 6/10): twin flights either side of the well instead of one onto it (principle
22), the axis an overlook with a balustrade looking down at the well; the fix as one loop instead of three spokes (the
well, the west walkway, the greenhouse, down to the shore, the bath, along the shore, up to the stills, the east walkway,
back to the well); the tents in a shallow arc facing the well, so the beam stays in view while you heal; the way out
leaves from the well's tier along a paved road past the battery's smokestack, with woods past the edges, not void.

Revision 3 (the flow critic, 7/10): the shore leg shortened so every frame along it shows the next flight (both shore
flights 10 u in); the well's tier runs level to the east edge so the road stays paved to the seam; the smokestack beside
the road, in view as you leave. In the game: a soft block on the east road until the well is lit.

Revision 4 (the first in-game round, 6/10): the well 5 u north, at the foot of the drop, so it's in frame from the
overlook and from the tents (the camera shows about 7.6 u below you); the room runs on east past the gate, the road into
woods, so no void shows; garden beds by the greenhouse, so the loop's west half isn't a mirror of its east."""
import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from plan import *

P = Plan('inf-d', 'Infirmary D: the slope with raised conduits (rev 4)', U=(-46, 88), V=(-34, 32))
W0 = (0, -3)
P.fill(rect(-46, -34, 88, 32), 5.0, 'grass')
P.fill(rect(-34, -8, 88, 32), 2.0, 'grass')                       # the well's tier, level to the east edge
P.fill(rect(-34, 18, 50, 32), 0.0, 'sand')                        # the shore
P.fill([(-46, 23), (88, 21), (88, 32), (-46, 32)], -1.0, 'water')  # the sea
P.fill(rect(-28, -22, 28, -8), 5.0, 'paving')                     # the top tier: the road's terrace
P.fill(rect(-3, -34, 3, -22), 5.0, 'path')                        # the road in, on the axis
for a in (232, 254, 286, 308):                                    # the tents in a shallow arc facing the well; open, equipment dark
    c = polar(W0, 21, a); P.building(orect(c, 7, 4, math.radians(a)), 5.0, 2.5, roof='roof')
P.note((0, -24), 'cots under tents')
P.fill(rect(-8, -8, 8, 0), 2.0, 'paving')                         # the well's apron at the foot of the drop, between the flights
for su in (-11, 11): P.stairs(rect(su - 3, -9, su + 3, 0), 5.0, 2.0, 'V')   # twin flights either side of the well
P.building(rect(-6, -9, 6, -8), 5.0, 1.0, roof='wall')            # the overlook's balustrade on the axis
P.fill(rect(-28, 0, 44, 12), 2.0, 'paving')
P.fill(circle(W0, 5), 2.5, 'dais')
P.building(rect(-28, -6, -16, 4), 2.0, 6.0, 'greenhouse', doors=[(-15, 0)])
P.building(rect(16, -6, 26, 2), 2.0, 5.0, 'stills', doors=[(15, -2)])
for a, b in (((-5, -3), (-15, 0)), ((5, -3), (14, -2))):            # the conduits, raised walkways from the well
    L = math.dist(a, b); P.fill(orect(((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), 3, L + 1, math.atan2(b[1] - a[1], b[0] - a[0])), 2.5, 'wood')
P.stairs(rect(-14, 12, -8, 18), 2.0, 0.0, 'V')                    # down to the shore by the greenhouse
P.stairs(rect(8, 12, 14, 18), 2.0, 0.0, 'V')                      # and up again by the stills
P.fill(circle((0, 21), 3), -0.5, 'water'); P.fill(arc_band((0, 21), 3, 4.5, 0, 360), 0.5, 'paving')   # the bath on the shore, its rim a kerb up
P.fill(rect(-14, 17, 14, 21), 0.0, 'paving')                                                          # the shore walk
# the way out: east along the well's tier and on, past the battery's smokestack
P.fill(rect(40, 4, 88, 10), 2.0, 'road')
for c in ((-26, 8), (-20, 9), (-26, -1)): P.fill(circle(c, 2.2), 2.3, 'grass')   # garden beds by the greenhouse
P.building(circle((56, 1), 2.5), 2.0, 14.0, "the battery's smoke")
P.landmark(W0, 'the well', 6, 3)
P.gate((0, -32), 'from the main gate'); P.gate((70, 7), 'to the battery')
P.journey([(0, -32), (0, -14), (-11, -11), (-11, 1), (-5, 0)], 'In from the main gate: the cots, then down to the well', 'The wounded and their nurses first, the equipment dark; the well below, framed by the overlook')
P.journey([(-5, 0), (-10, -2), (-15, 0), (-11, 6), (-11, 12), (-11, 19), (-5, 20), (5, 20), (11, 19), (11, 12), (13, 4), (14, -2), (8, -2), (5, 0)], 'The fix: one loop along the conduits and the shore', 'Cut the vines round the loop; the well relights; Life spills into you')
P.journey([(5, 0), (11, 1), (11, -10)] + [polar(W0, 15, a) for a in range(300, 235, -12)] + [(-11, -10)], 'Up to the cots, the equipment lit', 'Heal the wounded along the arc, the well in view below')
P.journey([(-11, -10), (-11, 1), (10, 7), (30, 7), (44, 7), (70, 7)], 'Out to the battery', 'Along the well’s tier and the road, the battery’s smoke ahead')
import numpy as np
walk = np.isin(P.m, ['plaza', 'paving', 'grass', 'path', 'road', 'dais', 'stairs', 'wood', 'sand']) & ~P.bld
inbox = (P.CU > P.U[0] + 12) & (P.CU < P.U[1] - 12) & (P.CV > P.V[0] + 12) & (P.CV < P.V[1] - 8)
P.m[walk & ~inbox & ~np.isin(P.m, ['road', 'path', 'sand', 'stairs'])] = 'trees'   # woods along the edges, open where the roads leave
from finish import lips, woods_unreached
lips(P); woods_unreached(P)
P.render()
if "--frames" in sys.argv: P.frames()
