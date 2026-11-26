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
P.fill(arc_band(C0, 22, 40, 180, 360), 3.5, 'plaza')                # the crescent's arms, wide enough to walk four abreast
P.fill(rect(-38, -28, 38, 12), 3.5, 'plaza')                        # the forecourt: open in the middle, the camp round its edges
P.fill(rect(-3, -46, 3, -28), 3.5, 'path')                          # the road in, on the axis
P.fill(circle(W0, 5), 3.8, 'dais')
# rev 2 (the user, 2026-11-26: "a decent amount more negative space"; "more feeling of urgency... tents put up really
# quickly"): the tents pitched in a hurry round the forecourt's edges at odd angles, the middle left open round the well
for (u, v, deg) in ((-32, -20, 17), (-33, -8, -12), (-30, 4, 8), (32, -20, -15), (33, -6, 10), (30, 6, -6),
                    (-15, -24, 5), (15, -24, -9), (-21, 9, 22), (21, 9, -18)):
    P.building(orect((u, v), 6, 3.5, math.radians(deg)), 3.5, 2.5, roof='roof')
for a in (190, 350):                                                # overflow tents on the arms
    c = polar(C0, 33, a); P.building(orect(c, 6, 3.5, math.radians(a + 11)), 3.5, 2.5, roof='roof')
P.note((0, -20), 'open ground round the well; triage on stretchers between the tents')
P.building(rect(-66, 14, -40, 42), 3.5, 10.0, 'the great greenhouse', doors=[(-39, 28)])
P.fill(rect(-70, -46, -38, 14), 3.5, 'grass'); P.note((-55, -16), 'the farmland, running on west out of sight')
P.building(rect(-38, -40, -37, 14), 3.5, 1.2, roof='wall')
P.stairs(orect(polar(C0, 22, 205), 12, 6, math.radians(205)), 3.5, 0.0, 'U')   # the built stair at the west shoulder
P.stairs(orect(polar(C0, 22, 335), 12, 6, math.radians(335)), 0.0, 3.5, 'U'); P.note(polar(C0, 28, 335), 'the broken wall')
P.fill(rect(-1.5, 19, 1.5, 30), 0.3, 'wood')                        # the jetty out into the cove
P.fill(circle((0, 32), 4), 0.3, 'paving'); P.note((0, 32), 'the purifier, out on its jetty')
P.fill(rect(34, 26, 106, 32), 3.5, 'road')                          # the road out, from the east arm's tip
P.note((62, 29), 'a glyph path runs along the road to the battery; lanterns on its far (north) side')
P.building(rect(54, 8, 72, 20), 3.5, 7.0, "the battery's boiler house")   # the building the smokestack serves
P.building(circle((75, 12), 2.5), 3.5, 14.0, "the battery's smoke")
P.landmark(W0, 'the well', 6, 3)
P.gate((0, -40), 'from the main gate'); P.gate((80, 29), 'to the battery')
P.journey([(0, -40), (0, -22), (0, -16)], 'In from the main gate: the forecourt, the camp, the well', 'Tents and the wounded all round the well, the cove beyond')
P.journey([(0, -16), (-18, -4), polar(C0, 29, 200), (-39, 28), polar(C0, 18, 205), (0, 19), (0, 28), (0, 19), polar(C0, 18, 335), polar(C0, 29, 340), (8, 0)], 'The fix: out the west arm, down to the purifier, up the broken wall', 'Each line relights; the purifier on its jetty last')
P.journey([(8, 0), (26, -6), (26, -18), (10, -20), (-10, -20), (-26, -18), (-26, -6), (-14, 4), (14, 4)], 'Round the camp, the devices lit', 'Heal the wounded tent by tent')
P.journey([(10, 4), polar(C0, 29, 355), (40, 29), (80, 29)], 'Out to the battery', 'Lanterns along the road from the east arm')
import numpy as np
walk = np.isin(P.m, ['plaza', 'paving', 'grass', 'path', 'road', 'dais', 'stairs', 'wood', 'sand']) & ~P.bld
inbox = (P.CU > P.U[0] + 12) & (P.CU < P.U[1] - 12) & (P.CV > P.V[0] + 12)
farm = (P.CU < -38) & (P.m == 'grass')                           # the fields run off the west edge: no woods there
P.m[walk & ~inbox & ~farm & ~np.isin(P.m, ['road', 'path', 'sand', 'stairs'])] = 'trees'
from finish import lips, woods_unreached, close_gates
lips(P); close_gates(P); woods_unreached(P)
P.render()
if "--frames" in sys.argv: P.frames()
