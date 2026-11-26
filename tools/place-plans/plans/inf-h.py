"""Infirmary plan H, the crescent with a forecourt (2026-11-26): the structure critic's recommended mix, F (the crescent,
7/10) with G's flat, wide camp folded into its head. The head of the crescent is a broad, flat forecourt, about two
screens wide and one deep, where the arrival, the well (in its north third) and the busiest tents share one roomy
level; the cove is pushed south to make room. The arms keep the overflow tents and lead out to the great greenhouse
(west, by the farmland) and the road to the battery (from the east arm's tip). The purifier stands out in the cove on a
jetty, so it shows from above; one built stair at the west shoulder, the broken wall's rubble at the east."""
import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from plan import *

P = Plan('inf-h', 'Infirmary H: the crescent with a forecourt', U=(-70, 106), V=(-46, 56))
C0 = (0, 34)                                                        # the cove's centre, pushed south
W0 = (0, -10)                                                       # the well, in the forecourt's north third
P.fill(rect(-70, -46, 106, 56), 3.5, 'grass')
P.fill(rect(-70, 46, 106, 56), -1.0, 'water')                       # the sea
P.fill(circle(C0, 22), -1.0, 'water')                               # the cove
P.fill(arc_band(C0, 14, 22, 195, 345), 0.0, 'sand')                 # the cove's beach under the clifftop
P.fill(arc_band(C0, 22, 36, 180, 360), 3.5, 'plaza')                # the crescent's arms
P.fill(rect(-30, -22, 30, 12), 3.5, 'plaza')                        # the forecourt: arrival, well, the busiest tents
P.fill(rect(-3, -46, 3, -22), 3.5, 'path')                          # the road in, on the axis
P.fill(circle(W0, 5), 3.8, 'dais')
for a in (200, 235, 305, 340):                                      # the camp crowding round the well (the road in kept clear)
    c = polar(W0, 13, a); P.building(orect(c, 6, 3.5, math.radians(a)), 3.5, 2.5, roof='roof')
for c in ((-22, 4), (22, 4), (-14, 8), (14, 8)):                    # more tents across the forecourt's south half
    P.building(orect(c, 6, 3.5, 0), 3.5, 2.5, roof='roof')
for a in (190, 350):                                                # overflow tents on the arms
    c = polar(C0, 29, a); P.building(orect(c, 6, 3.5, math.radians(a)), 3.5, 2.5, roof='roof')
P.note((0, -20), 'the forecourt: the camp round the well')
P.building(rect(-62, 18, -38, 40), 3.5, 9.0, 'the great greenhouse', doors=[(-37, 29)])
P.fill(rect(-66, -40, -36, 14), 3.5, 'grass'); P.note((-52, -14), 'farmland beyond the wall')
P.building(rect(-36, -40, -35, 14), 3.5, 1.2, roof='wall')
P.stairs(orect(polar(C0, 22, 205), 12, 6, math.radians(205)), 3.5, 0.0, 'U')   # the built stair at the west shoulder
P.stairs(orect(polar(C0, 22, 335), 12, 6, math.radians(335)), 0.0, 3.5, 'U'); P.note(polar(C0, 28, 335), 'the broken wall')
P.fill(rect(-1.5, 19, 1.5, 30), 0.3, 'wood')                        # the jetty out into the cove
P.fill(circle((0, 32), 4), 0.3, 'paving'); P.note((0, 32), 'the purifier, out on its jetty')
P.fill(rect(30, 26, 106, 32), 3.5, 'road')                          # the road out, from the east arm's tip
P.building(circle((60, 20), 2.5), 3.5, 14.0, "the battery's smoke")
P.landmark(W0, 'the well', 6, 3)
P.gate((0, -40), 'from the main gate'); P.gate((80, 29), 'to the battery')
P.journey([(0, -40), (0, -22), (0, -16)], 'In from the main gate: the forecourt, the camp, the well', 'Tents and the wounded all round the well, the cove beyond')
P.journey([(0, -16), (-18, -4), polar(C0, 29, 200), (-37, 29), polar(C0, 18, 205), (0, 19), (0, 28), (0, 19), polar(C0, 18, 335), polar(C0, 29, 340), (8, 0)], 'The fix: out the west arm, down to the purifier, up the broken wall', 'Each line relights; the purifier on its jetty last')
P.journey([(8, 0)] + [polar(W0, 13, a) for a in range(340, 190, -30)], 'Round the camp, the devices lit', 'Heal the wounded tent by tent')
P.journey([(10, 4), polar(C0, 29, 355), (40, 29), (80, 29)], 'Out to the battery', 'Lanterns along the road from the east arm')
import numpy as np
walk = np.isin(P.m, ['plaza', 'paving', 'grass', 'path', 'road', 'dais', 'stairs', 'wood', 'sand']) & ~P.bld
inbox = (P.CU > P.U[0] + 12) & (P.CU < P.U[1] - 12) & (P.CV > P.V[0] + 12)
P.m[walk & ~inbox & ~np.isin(P.m, ['road', 'path', 'sand', 'stairs'])] = 'trees'
from finish import lips, woods_unreached, close_gates
lips(P); close_gates(P); woods_unreached(P)
P.render()
if "--frames" in sys.argv: P.frames()
