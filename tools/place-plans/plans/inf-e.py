"""Infirmary plan E, the broad terrace (2026-11-26, stage 1 again after the user's notes on the painted plan D, in
docs/campaign/01-opening/infirmary-read.md). One wide level holds the arrival, the well, the triage camp and a grand
greenhouse, so four players and the crowd of patients have room; all the height goes into the drop to the shore. The
farmland lies west beyond a low wall. The glyph paths run in the ground from the well to the greenhouse, the healing
devices in the camp, the fields and down to the purifier on the shore."""
import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from plan import *

P = Plan('inf-e', 'Infirmary E: the broad terrace', U=(-70, 106), V=(-46, 56))
W0 = (0, -6)
P.fill(rect(-70, -46, 106, 56), 3.5, 'grass')                       # the clifftop
P.fill(rect(-70, 32, 106, 56), -1.0, 'water')                       # the sea
P.fill(rect(-70, 22, 106, 32), 0.0, 'sand')                         # the shore under the cliff
P.fill(rect(-30, -26, 40, 12), 3.5, 'plaza')                        # the broad terrace: arrival, camp, well
P.fill(rect(-3, -46, 3, -26), 3.5, 'path')                          # the road in, on the axis
P.fill(circle(W0, 5), 3.8, 'dais')                                  # the well's dais, a kerb up
for a in range(210, 335, 30):                                       # the triage camp: tents crowding round the well
    c = polar(W0, 14, a); P.building(orect(c, 6, 3.5, math.radians(a)), 3.5, 2.5, roof='roof')
for c in ((-18, 4), (16, 4), (24, -12), (-24, -12)):                # more tents pitched where they could
    P.building(orect(c, 7, 4, 0), 3.5, 2.5, roof='roof')
P.note((0, -24), 'triage camp: tents everywhere, healing devices on the glyph lines')
P.building(rect(-64, -30, -34, -8), 3.5, 9.0, 'the great greenhouse', doors=[(-33, -19)])   # grand, glass, beside the fields
P.fill(rect(-64, -6, -34, 12), 3.5, 'grass'); P.note((-50, 3), 'farmland beyond the wall')
P.building(rect(-34, -8, -33, 12), 3.5, 1.2, roof='wall')           # the low field wall
P.stairs(rect(-26, 12, -18, 23), 3.5, 0.0, 'V')                     # the stair down to the shore, by the greenhouse
P.fill(rect(-20, 23, 30, 29), 0.0, 'paving')                        # the shore walk
P.fill(circle((6, 32), 5), 0.3, 'paving'); P.note((6, 32), 'the purifier: sea water cleaned by the well')
P.stairs(rect(22, 12, 30, 23), 3.5, 0.0, 'V'); P.note((26, 17), 'the broken wall: a rubble ramp')
P.fill(rect(40, -2, 106, 4), 3.5, 'road')                           # the way out east, lanterns along it
P.building(circle((60, -8), 2.5), 3.5, 14.0, "the battery's smoke")
P.landmark(W0, 'the well', 6, 3)
P.gate((0, -40), 'from the main gate'); P.gate((80, 1), 'to the battery')
P.journey([(0, -40), (0, -26), (0, -12)], 'In from the main gate: the camp, then the well', 'Tents and the wounded all round, the well choked in vines at their heart')
P.journey([(0, -12), (-14, -8), (-30, -19), (-22, 8), (-22, 25), (6, 27), (26, 25), (26, 10), (10, -2)], 'The fix: the glyph lines out to the greenhouse, down to the purifier, up the broken wall', 'Cut the vines; each line relights; Life spills into you')
P.journey([(10, -2)] + [polar(W0, 12, a) for a in range(340, 190, -25)], 'Round the camp, the devices lit', 'Heal the wounded tent by tent')
P.journey([(12, 0), (40, 1), (80, 1)], 'Out to the battery', 'Lanterns along the road, the smoke ahead')
import numpy as np
walk = np.isin(P.m, ['plaza', 'paving', 'grass', 'path', 'road', 'dais', 'stairs', 'wood', 'sand']) & ~P.bld
inbox = (P.CU > P.U[0] + 12) & (P.CU < P.U[1] - 12) & (P.CV > P.V[0] + 12)
P.m[walk & ~inbox & ~np.isin(P.m, ['road', 'path', 'sand', 'stairs'])] = 'trees'   # woods at the world's edge, open where the roads leave
from finish import lips, woods_unreached, close_gates
lips(P); close_gates(P); woods_unreached(P)
P.render()
if "--frames" in sys.argv: P.frames()
