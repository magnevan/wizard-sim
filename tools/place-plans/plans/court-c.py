"""Courtyard plan C, the Chasm: the octagon split in two by a sea inlet. The academy's half is on the west cliff, the
battery road's half on the east; the armillary stands on a rock island in the inlet, reached by two stone bridges,
and a narrow wooden footbridge crosses higher up where a waterfall drops in. The finale is fought across the bridges."""
import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from plan import *

P = Plan('court-c', 'Courtyard C: the Chasm', U=(-95, 95), V=(-75, 75))
SEA = -10.0
P.fill(rect(-95, -75, 95, 75), 0.0, 'grass')
# the inlet: open to the sea at the bottom, narrowing up the screen to a waterfall
P.fill([(-95, 58), (-44, 50), (-30, 30), (-27, 0), (-16, -30), (-7, -52), (7, -52), (16, -30), (27, 0), (30, 30), (44, 50), (95, 56), (95, 75), (-95, 75)], SEA, 'deep')
P.fill([(-5, -75), (5, -75), (5, -52), (-5, -52)], 2.0, 'water')                   # the stream above the falls
# the two halves of the octagon on the cliff tops (the west half higher: the academy's side)
P.fill(octagon((0, 0), 46), 0.5, 'plaza')
P.fill([(-27, 0), (-16, -30), (-7, -52), (7, -52), (16, -30), (27, 0), (30, 30), (44, 50), (-44, 50), (-30, 30)], SEA, 'deep')
west = P.mask(octagon((0, 0), 46)) & (P.CU < -20)
P.raise_(west, 1.5)
P.h[(P.CU < -20) & (P.m == 'grass')] = 2.0                                         # the whole west bank is the academy's higher ground
# the island and its dais
P.fill(circle((0, 4), 12), 1.0, 'rock')
P.fill(circle((0, 4), 10), 1.0, 'plaza')
P.fill(circle((0, 4), 4.5), 2.2, 'dais')
# the bridges: two stone spans to the island, a footbridge above it
P.fill(rect(-30, 1, -10, 7), 1.5, 'paving')
P.fill(rect(10, 1, 30, 7), 0.8, 'paving')
P.fill(rect(-20, -36, 20, -33), 1.2, 'wood')
# the academy's side: a cloister round the west half, the library tower at its corner
P.building(orect(polar((0, 0), 42, 180), 26, 8, math.pi), 2.0, 10, 'cloister', doors=[polar((0, 0), 37, 180)])
P.building(orect(polar((0, 0), 40, 225), 14, 12, math.radians(225)), 2.0, 16, 'library tower', doors=[polar((0, 0), 33, 225)])
P.building(orect(polar((0, 0), 40, 315), 14, 12, math.radians(315)), 0.5, 9, 'infirmary', doors=[polar((0, 0), 33, 315)])
# the east side: the battery road's gatehouse and a lighthouse at the inlet's mouth
P.building(orect(polar((0, 0), 41, 0), 20, 8, 0), 0.5, 8, 'east gate')
P.fill(rect(36, -3, 95, 4), 0.0, 'path')
P.fill(rect(36, -3, 46, 4), 0.5, 'paving')
P.fill(circle((48, 52), 9), 0.0, 'rock'); P.building(circle((48, 52), 6), 0.0, 18, 'lighthouse')
# stairs cut into the west cliff, down to a landing at the water
P.stairs(rect(-38, 24, -33, 46), 2.0, SEA + 1.5, 'V')
P.fill(rect(-42, 46, -29, 52), SEA + 1.5, 'wood')
P.fill(rect(16, -75, 22, -36), 0.0, 'path')
# the yard's road arrives from the north-west
P.fill([(-95, -40), (-60, -26), (-56, -20), (-95, -33)], 2.0, 'path')
for c, r in [((-70, -62), 14), ((70, -60), 15), ((-80, 20), 10), ((75, 25), 10)]:
    P.fill(circle(c, r), 0.0 if c[0] > 0 else 2.0, 'trees')

P.landmark((0, 4), 'the armillary', 14)
P.gate((-92, -36), 'to the drill yard'); P.gate((92, 0), 'to the battery'); P.gate((-35, 50), 'sea landing'); P.gate((19, -72), 'north road')
P.route([(-92, -36), (-58, -23), (-34, -4), (-28, 4), (-5, 4)], 'main')
P.route([(5, 4), (28, 4), (40, 0), (92, 0)], 'main')
P.route([(-24, -24), (-20, -34), (20, -34), (19, -72)], 'side')
P.route([(-34, 18), (-35, 48)], 'side')
P.render()
