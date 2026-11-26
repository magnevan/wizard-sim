"""Infirmary plan G, the prow (2026-11-26, stage 1 again after the user's notes on the painted plan D). The "huh" plan:
the well stands out on a rocky prow over the sea, seen against the water as you arrive, and the purifier sits right
under it at the cliff foot, a glyph line running down the cliff face between them. Behind the prow, one broad level
holds the triage camp, with the great greenhouse to the north-west by the road in and the farmland west beyond a wall.
A stair goes down the prow's west flank to the beach and the purifier; the broken wall climbs back up its east flank."""
import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from plan import *

P = Plan('inf-g', 'Infirmary G: the prow', U=(-70, 106), V=(-46, 56))
W0 = (0, 14)                                                        # the well, out on the prow
P.fill(rect(-70, -46, 106, 56), 3.5, 'grass')
P.fill(rect(-70, 20, 106, 56), -1.0, 'water')
P.fill(rect(-50, 14, 60, 22), 0.0, 'sand')                          # the beach under the cliff
P.fill([(-10, 4), (10, 4), (8, 24), (-8, 24)], 3.5, 'plaza')        # the prow, out over the beach
P.fill(rect(-34, -24, 38, 6), 3.5, 'plaza')                         # the broad level: the camp
P.fill(rect(-3, -46, 3, -24), 3.5, 'path')
P.fill(circle(W0, 5), 3.8, 'dais')
for c, a in (((-24, -14), 0), ((-12, -16), 0), ((12, -16), 0), ((24, -14), 0), ((-26, -2), 90), ((26, -2), 90), ((-14, 0), 0), ((14, 0), 0)):
    P.building(orect(c, 6, 3.5, math.radians(a)), 3.5, 2.5, roof='roof')
P.note((0, -8), 'triage camp on the broad level')
P.building(rect(-62, -40, -34, -18), 3.5, 9.0, 'the great greenhouse', doors=[(-33, -29)])
P.fill(rect(-66, -16, -36, 12), 3.5, 'grass'); P.note((-52, -2), 'farmland beyond the wall')
P.building(rect(-36, -16, -35, 12), 3.5, 1.2, roof='wall')
P.stairs(rect(-20, 6, -12, 17), 3.5, 0.0, 'V')                      # down the prow's west flank
P.stairs(rect(12, 6, 20, 17), 3.5, 0.0, 'V'); P.note((16, 10), 'the broken wall')
P.fill(circle((0, 27), 4), 0.3, 'paving'); P.note((0, 27), 'the purifier, under the well')
P.fill(rect(38, -4, 106, 2), 3.5, 'road')
P.building(circle((60, -12), 2.5), 3.5, 14.0, "the battery's smoke")
P.landmark(W0, 'the well', 6, 3)
P.gate((0, -40), 'from the main gate'); P.gate((80, -1), 'to the battery')
P.journey([(0, -40), (0, -24), (0, 6)], 'In from the main gate: through the camp to the prow', 'The well out on the prow against the sea')
P.journey([(0, 8), (-16, 2), (-33, -29), (-16, 4), (-16, 19), (0, 22), (16, 19), (16, 4), (4, 6)], 'The fix: the greenhouse line, down to the purifier, up the broken wall', 'The line down the cliff relights the purifier')
P.journey([(10, -6), (24, -10), (0, -12), (-24, -10), (-10, -6)], 'Round the camp, the devices lit', 'Heal the wounded tent by tent')
P.journey([(20, -2), (38, -1), (80, -1)], 'Out to the battery', 'Lanterns along the road')
import numpy as np
walk = np.isin(P.m, ['plaza', 'paving', 'grass', 'path', 'road', 'dais', 'stairs', 'wood', 'sand']) & ~P.bld
inbox = (P.CU > P.U[0] + 12) & (P.CU < P.U[1] - 12) & (P.CV > P.V[0] + 12)
P.m[walk & ~inbox & ~np.isin(P.m, ['road', 'path', 'sand', 'stairs'])] = 'trees'
from finish import lips, woods_unreached, close_gates
lips(P); close_gates(P); woods_unreached(P)
P.render()
if "--frames" in sys.argv: P.frames()
