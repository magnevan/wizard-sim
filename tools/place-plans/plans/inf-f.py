"""Infirmary plan F, the crescent (2026-11-26, stage 1 again after the user's notes on the painted plan D). The clifftop
is a crescent round a sheltered cove: the road arrives at its apex, where the well stands at the cliff edge with the
cove below; the triage camp strings along both arms; the great greenhouse closes the west tip, with the farmland
inland behind it; the road out leaves from the east tip. The cove's beach holds the purifier; one stair goes down the
west arm, the broken wall climbs back up the east arm. The level where people gather is one; the cove is the drop."""
import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from plan import *

P = Plan('inf-f', 'Infirmary F: the crescent', U=(-70, 106), V=(-46, 56))
C0 = (0, 24)                                                        # the cove's centre
W0 = (0, -8)                                                        # the well, at the apex of the crescent
P.fill(rect(-70, -46, 106, 56), 3.5, 'grass')
P.fill(rect(-70, 40, 106, 56), -1.0, 'water')                       # the sea
P.fill(circle(C0, 26), -1.0, 'water')                               # the cove
P.fill(arc_band(C0, 17, 26, 195, 345), 0.0, 'sand')                 # the cove's beach, round its back under the clifftop
P.fill(arc_band(C0, 26, 42, 180, 360), 3.5, 'plaza')                # the crescent: arrival, camp, well along the clifftop
P.fill(rect(-3, -46, 3, -16), 3.5, 'path')                          # the road in, to the apex
P.fill(circle(W0, 5), 3.8, 'dais')
for a in (200, 222, 244, 296, 318, 340):                            # the camp strung along both arms
    c = polar(C0, 34, a); P.building(orect(c, 6, 3.5, math.radians(a)), 3.5, 2.5, roof='roof')
for a in (258, 282):
    c = polar(C0, 39, a); P.building(orect(c, 6, 3.5, math.radians(a)), 3.5, 2.5, roof='roof')
P.note((0, -20), 'triage camp along the arms')
P.building(rect(-66, 0, -40, 22), 3.5, 9.0, 'the great greenhouse', doors=[(-39, 11)])
P.fill(rect(-66, -40, -36, -4), 3.5, 'grass'); P.note((-52, -22), 'farmland inland')
P.building(rect(-36, -40, -35, -4), 3.5, 1.2, roof='wall')
P.stairs(orect(polar(C0, 26, 205), 12, 6, math.radians(205)), 3.5, 0.0, 'U')   # down the west arm to the beach
P.stairs(orect(polar(C0, 26, 335), 12, 6, math.radians(335)), 0.0, 3.5, 'U'); P.note(polar(C0, 30, 340), 'the broken wall')
P.fill(circle(polar(C0, 17, 270), 4), 0.3, 'paving'); P.note(polar(C0, 17, 270), 'the purifier, under the well')
P.fill(rect(42, 0, 106, 6), 3.5, 'road')
P.building(circle((62, -6), 2.5), 3.5, 14.0, "the battery's smoke")
P.landmark(W0, 'the well', 6, 3)
P.gate((0, -40), 'from the main gate'); P.gate((80, 3), 'to the battery')
P.journey([(0, -40), (0, -16)], 'In from the main gate: the well at the apex, the cove beyond', 'The well against the sea, the camp along both arms')
P.journey([(0, -14), polar(C0, 34, 210), (-39, 11), polar(C0, 22, 205), polar(C0, 19, 270), polar(C0, 22, 335), polar(C0, 34, 330), (6, -12)], 'The fix: out along the west arm, down to the purifier, up the broken wall', 'Each line relights')
P.journey([polar(C0, 34, a) for a in range(330, 200, -20)], 'Along the camp, the devices lit', 'Heal the wounded tent by tent')
P.journey([polar(C0, 34, 350), (42, 3), (80, 3)], 'Out to the battery', 'Lanterns along the road')
import numpy as np
walk = np.isin(P.m, ['plaza', 'paving', 'grass', 'path', 'road', 'dais', 'stairs', 'wood', 'sand']) & ~P.bld
inbox = (P.CU > P.U[0] + 12) & (P.CU < P.U[1] - 12) & (P.CV > P.V[0] + 12)
P.m[walk & ~inbox & ~np.isin(P.m, ['road', 'path', 'sand', 'stairs'])] = 'trees'
from finish import lips, woods_unreached, close_gates
lips(P); close_gates(P); woods_unreached(P)
P.render()
if "--frames" in sys.argv: P.frames()
