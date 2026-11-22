"""Courtyard plan B, the Terraces: the courtyard as a descent to the sea, three curved terraces like an amphitheatre
facing the camera. You arrive from the yard on the top terrace and look down on everything; the armillary stands on
a bastion jutting from the middle terrace over the sea court; the battery road leaves along a quay at the bottom."""
import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from plan import *

P = Plan('court-b', 'Courtyard B: the Terraces', U=(-90, 90), V=(-60, 70))
C = (0, -62)          # the amphitheatre's centre, up the screen
SEA = -9.0
# the land round it, high ground at the back
P.fill([(-100, -70), (100, -70), (100, 40), (80, 52), (-80, 52), (-100, 40)], 6.0, 'grass')
for c, r in [((-80, -50), 14), ((82, -48), 13), ((-88, 10), 9), ((88, 14), 9)]:
    P.fill(circle(c, r), 6.0, 'trees')
# the sea, and the terraces cut into the hillside as arcs
P.fill(arc_band(C, 0, 150, 10, 170), SEA, 'deep')
P.fill(arc_band(C, 0, 122, 22, 158), -1.0, 'paving')        # the sea court
P.fill(arc_band(C, 0, 96, 26, 154), 3.0, 'plaza')          # the middle terrace
P.fill(arc_band(C, 0, 74, 32, 148), 6.0, 'paving')          # the top terrace
# the great hall closes the top terrace, a cloister wraps the middle terrace's back edge
P.fill(arc_band(C, 0, 44, 20, 160), 6.0, 'grass')
P.building(arc_band(C, 32, 46, 42, 138), 6.0, 12.0, 'great hall', doors=[polar(C, 47, 90)])
for a0, a1, nm in ((28, 46, 'library'), (134, 152, 'workshops')):
    P.building(arc_band(C, 76, 94, a0, a1, 10), 3.0, 8.0, nm, doors=[polar(C, 80, (a0 + a1) / 2)])
# the bastion: a round promontory of the middle terrace, jutting over the sea court
P.fill(circle(polar(C, 104, 90), 13), 3.0, 'plaza')
P.fill(circle(polar(C, 106, 90), 6), 4.0, 'dais')
# stairs: a pair of flights from the top terrace either side of the axis, and wide flights down to the sea court
for ang in (76, 104):
    a = math.radians(ang)
    P.stairs(orect(polar(C, 80, ang), 6, 10, a), 6.0, 3.0, 'V')
for ang in (62, 118):
    a = math.radians(ang)
    P.stairs(orect(polar(C, 102, ang), 8, 12, a), 3.0, -1.0, 'V')
# the quay and the sea landing at the bottom, the battery road leaves along the shore to the east
P.stairs(orect(polar(C, 126, 90), 10, 10, math.radians(90)), -1.0, -7.5, 'V')
P.fill(rect(-16, 68, 16, 74), -7.5, 'wood')
P.fill([(50, 44), (90, 26), (90, 33), (54, 50)], -1.0, 'path')
# the yard's road comes in at the top terrace's west end
P.fill([(-90, -10), (-50, -8), (-50, -2), (-90, -4)], 6.0, 'path')
# a waterfall: a stream crosses the top terrace's east end and spills down the terraces' face to the sea
P.fill([(66, -60), (73, -60), (70, -16), (64, -16)], 4.5, 'water')
P.fill([(64, -16), (70, -16), (66, 30), (60, 30)], SEA, 'water')
P.fill(rect(60, -36, 76, -31), 6.5, 'wood')

P.landmark(polar(C, 106, 90), 'the armillary', 14)
P.gate((-87, -7), 'to the drill yard'); P.gate((87, 29), 'to the battery'); P.gate((0, 72), 'sea landing')
P.route([(-87, -7), (-50, -5), polar(C, 70, 112), polar(C, 76, 104), polar(C, 86, 104), polar(C, 96, 96)], 'main')
P.route([polar(C, 100, 80), polar(C, 96, 62), polar(C, 112, 60), (70, 40), (87, 29)], 'main')
P.route([polar(C, 70, 90), polar(C, 48, 90)], 'side')
P.route([polar(C, 116, 90), (0, 72)], 'side')
P.render()
