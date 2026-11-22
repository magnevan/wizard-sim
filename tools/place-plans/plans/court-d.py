"""Courtyard plan D, the Terraces with a round plaza (structure critic round 1: B as the base, with A's round plaza and
north gate and C's sea inlet). Three curved terraces descend to the sea; the middle one widens into a round plaza with
the armillary at its heart, the finale's floor; the north road passes through the great hall; the battery road
crosses a sea inlet with a waterfall on a bridge you look down from. Stairs are broad and many (the finale's beast)."""
import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from plan import *

P = Plan('court-d', 'Courtyard D: Terraces round a plaza', U=(-95, 95), V=(-62, 72))
C = (0, -62)          # the amphitheatre's centre, up the screen
SEA = -9.0
P.fill(rect(-95, -62, 95, 72), 6.0, 'grass')
for c, r in [((-82, -50), 13), ((-88, 4), 8), ((56, -52), 9)]:
    P.fill(circle(c, r), 6.0, 'trees')
# the sea and the terraces cut into the hillside
P.fill(arc_band(C, 0, 160, 5, 175), SEA, 'deep')
P.fill(arc_band(C, 0, 126, 20, 160), -1.0, 'paving')        # the sea court
P.fill(arc_band(C, 0, 100, 24, 156), 3.0, 'plaza')          # the middle terrace
P.fill(circle(polar(C, 80, 90), 27), 3.0, 'plaza')          # its round plaza, the finale's floor, sunk a metre in rings of steps
for r, h in ((26, 2.75), (25, 2.5), (24, 2.25)):
    P.fill(circle(polar(C, 80, 90), r), h, 'stairs')
P.fill(circle(polar(C, 80, 90), 23), 2.0, 'dais')
P.fill(arc_band(C, 0, 54, 28, 152), 6.0, 'paving')          # the top terrace, a balcony over the plaza
P.fill(circle(polar(C, 80, 90), 6.5), 3.5, 'plaza')
for k in range(4):                                          # four short flights onto the dais
    a = 45 + 90 * k; ax = 'V' if k in (0, 1) else 'V'
    P.stairs(orect(polar(polar(C, 80, 90), 7.8, a), 4, 3, math.radians(a)), 3.5 if a < 180 else 2.0, 2.0 if a < 180 else 3.5, 'V')
# the great hall closes the top terrace; the north road runs through its gate
P.building(arc_band(C, 18, 32, 30, 150), 6.0, 12.0, 'great hall', doors=[polar(C, 33, 70), polar(C, 33, 110)])
P.fill(orect(polar(C, 25, 90), 8, 16, math.radians(90)), 6.0, 'path')
P.fill(rect(-4, -62, 4, -40), 6.0, 'path')
# a library and workshops on the middle terrace's wings
for a0, a1, nm in ((26, 42, 'workshops'), (138, 154, 'library')):
    P.building(arc_band(C, 58, 82, a0, a1, 10), 3.0, 9.0, nm, doors=[polar(C, 70, a1 + 1.5 if a0 < 90 else a0 - 1.5)])
# broad stairs: three from the top terrace, two down to the sea court, one to the sea landing
for ang in (66, 90, 114):
    P.stairs(orect(polar(C, 56.5, ang), 12, 6, math.radians(ang)), 6.0, 3.0, 'V')
for ang in (52, 128):
    P.stairs(orect(polar(C, 101, ang), 14, 9, math.radians(ang)), 3.0, -1.0, 'V')
P.stairs(orect(polar(C, 129, 90), 10, 12, math.radians(90)), -1.0, -7.5, 'V')
P.fill(rect(-16, 73, 16, 72), -7.5, 'wood'); P.fill(rect(-14, 72 - 6, 14, 72), -7.5, 'wood')
# the east: a sea inlet with a waterfall at its head; the battery road crosses it from the middle terrace
P.fill([(56, 72), (62, 30), (66, 0), (72, -22), (84, -24), (88, 0), (84, 34), (90, 72)], SEA, 'deep')
P.fill([(74, -62), (80, -62), (80, -24), (74, -24)], 6.0, 'water')
P.fill(rect(54, 8, 95, 14), 3.0, 'path')
P.fill(rect(62, 7, 90, 15), 3.5, 'wood')
P.raise_(P.mask(rect(86, 0, 95, 30)) & (P.m == 'grass'), -3.0)
P.fill(rect(86, 8, 95, 14), 3.0, 'path')
# the west: the yard's road arrives on the top terrace, looking down on the plaza
P.fill([(-95, -8), (-48, -14), (-46, -6), (-95, -2)], 6.0, 'path')

ARM = polar(C, 80, 90)
P.landmark(ARM, 'the armillary', 14)
P.gate((-92, -5), 'to the drill yard'); P.gate((92, 11), 'to the battery'); P.gate((0, -59), 'north road'); P.gate((0, 70), 'sea landing')
P.route([(-92, -5), (-46, -10), polar(C, 52, 114), polar(C, 62, 114), (ARM[0] - 8, ARM[1])], 'main')
P.route([(ARM[0] + 8, ARM[1]), (40, 14), (62, 11), (92, 11)], 'main')
P.route([(0, -59), polar(C, 50, 90), polar(C, 62, 90), (ARM[0], ARM[1] - 8)], 'main')
P.route([(ARM[0], ARM[1] + 8), polar(C, 98, 90), polar(C, 101, 128), polar(C, 118, 110), polar(C, 128, 90), (0, 70)], 'side')
P.render()
