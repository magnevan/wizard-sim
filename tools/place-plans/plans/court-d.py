"""Courtyard plan D, the Terraces with a round plaza (structure critic round 1: B as the base, with A's round plaza and
north gate and C's sea inlet; chosen by the user 2026-11-22). Three curved terraces descend to the sea; the middle one
widens into a round plaza sunk a metre, the armillary at its heart, the finale's floor.

Revision 2 (flow critic round 1, 4/10): a tall landmark only reads when it is up or down the screen from you, so every
main route's last stretch now runs at the armillary down a screen vertical or diagonal, never sideways:
- the drill yard's road comes down a straight diagonal from the top-left, then a broad stair onto the plaza;
- the battery is across a sea inlet to the bottom-right: a diagonal bridge, the battery's tower visible beyond it;
- the north road comes straight down through the great hall (unchanged, the critic's model route);
- the sea landing is straight below, up an axis stair.
The plaza's ring of steps opens where each route arrives, and main routes have their own paving.

Revision 3 (flow critic round 2, 5/10): only an approach from the north shows a tall landmark from far off (it rises up
the screen towards you); a diagonal keeps you off to the side until the end. So the yard and battery roads now join the
north road behind the great hall: every main arrival comes through the hall's gate and down one grand stair, framed by
pylons, onto the armillary. The battery's bridge moves up to the inlet's narrow head at the top terrace's level, the
battery's tower just beyond it. The sea landing gets a gateway on the plaza's rim and a narrower dock.

Revision 4 (flow critic round 3, 5/10): the cross road behind the hall hid the player behind its wings, and the battery
road ran 7 blind screens. The cross road now runs in front of the hall as an arc along the top terrace, a balcony over the
plaza; the yard and battery seams sit at the terrace's two ends; the bridge is one parapeted deck with the battery's tower
beside the road; the side buildings are lower so they can't cover the road.

Revision 5 (flow critic round 4, 5/10, the third round without the score moving): the cheap structural fixes it named.
A tall marker at each turn of the arc (a bell tower west, a beacon east), threshold pillars where the arc meets each seam,
and the road a step above the terrace so it reads as the route. The rest (lamps, paving, light) is dressing, judged in
the grey-box."""
import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from plan import *

P = Plan('court-d', 'Courtyard D: Terraces round a plaza (rev 5)', U=(-95, 105), V=(-68, 86))
C = (0, -62)          # the amphitheatre's centre, up the screen
ARM = polar(C, 80, 90)  # (0, 18)
SEA = -9.0
def toward(a, b, d):  # the point d along from a towards b
    L = math.dist(a, b); return (a[0] + (b[0] - a[0]) * d / L, a[1] + (b[1] - a[1]) * d / L)
def bearing(a, b): return math.degrees(math.atan2(b[1] - a[1], b[0] - a[0]))

P.fill(rect(-95, -68, 105, 86), 6.0, 'grass')
for c, r in [((-84, -20), 11), ((-30, -60), 8), ((50, -56), 9), ((-80, 18), 7)]:
    P.fill(circle(c, r), 6.0, 'trees')
# the sea and the terraces cut into the hillside
P.fill(arc_band(C, 0, 168, 5, 175), SEA, 'deep')
P.fill(arc_band(C, 0, 126, 20, 160), -1.0, 'paving')        # the sea court
P.fill(arc_band(C, 0, 100, 24, 156), 3.0, 'plaza')          # the middle terrace
P.fill(circle(ARM, 27), 3.0, 'plaza')                       # the round plaza's rim, a bastion over the sea court
for r, h in ((26, 2.75), (25, 2.5), (24, 2.25)):            # sunk a metre in rings of steps
    P.fill(circle(ARM, r), h, 'stairs')
P.fill(circle(ARM, 23), 2.0, 'dais')
P.fill(arc_band(C, 0, 54, 20, 160), 6.0, 'paving')          # the top terrace, a balcony over the plaza
P.fill(rect(-95, -60, -38, -40), 6.0, 'grass'); P.fill(rect(38, -60, 105, -40), 6.0, 'grass')   # the land out to the seams
P.fill(circle(ARM, 6.5), 3.5, 'plaza')
for a in (45, 135, 225, 315):                               # four short flights onto the dais
    P.stairs(orect(polar(ARM, 7.8, a), 4, 3, math.radians(a)), 3.5, 2.0, a)

# the north road: straight down through the great hall's gate (the model route)
P.building(arc_band(C, 18, 32, 30, 150), 6.0, 12.0, 'great hall', doors=[polar(C, 33, 70), polar(C, 33, 110)])
P.fill(orect(polar(C, 25, 90), 6, 16, math.radians(90)), 6.0, 'path')
P.fill(rect(-3, -68, 3, -40), 6.0, 'path')
P.stairs(orect(polar(C, 56.5, 90), 16, 7, math.radians(90)), 6.0, 3.0, 90)                           # the grand stair
for du in (-10, 10): P.building(rect(du - 1.5, -12, du + 1.5, -9), 6.0, 6.0)                         # pylons at its head

# the cross road: an arc along the top terrace in front of the hall, from the yard's seam to the battery's
ARC = [polar(C, 43, a) for a in range(158, 89, -4)] + [polar(C, 43, a) for a in range(90, 21, -4)]
YARD = (-58, -50)

# a library and workshops on the middle terrace's wings, doors facing the plaza
for a0, a1, nm in ((26, 40, 'workshops'), (140, 154, 'library')):
    P.building(arc_band(C, 62, 84, a0, a1, 10), 3.0, 7.0, nm, doors=[polar(C, 72, a1 + 1.5 if a0 < 90 else a0 - 1.5)])

# the sea landing: straight below the armillary, an axis stair off the plaza's rim, then down the cliff
P.stairs(orect((0, 50), 10, 10, math.radians(90)), 3.0, -1.0, 90)
P.stairs(orect(polar(C, 129, 90), 10, 12, math.radians(90)), -1.0, -7.5, 90)
P.fill(rect(-6, 72, 6, 80), -7.5, 'wood')
for du in (-7, 7): P.building(rect(du - 1.5, 43, du + 1.5, 46), 3.0, 5.0)                            # the rim's gateway

# the battery: across the head of a sea inlet to the east. The terrace's arc runs on over one parapeted deck above the
# falls; the battery's tower stands beside the road just beyond, on its north side so it can't hide you
P.fill([(44, 86), (46, 54), (52, 30), (60, 4), (64, -20), (72, -20), (78, 10), (82, 40), (104, 50), (105, 86)], SEA, 'deep')   # the inlet
P.fill([(64, -68), (72, -68), (72, -20), (64, -20)], 4.0, 'water')                                                  # the stream above the falls
P.fill(rect(40, -52, 105, -44), 6.0, 'path')
P.fill(rect(58, -52, 78, -44), 6.5, 'wood')                                                                         # the deck
P.building(rect(58, -53, 78, -52), 6.5, 1.0, roof='wall'); P.building(rect(58, -44, 78, -43), 6.5, 1.0, roof='wall')   # parapets
P.building(rect(54, -56, 57, -53), 6.0, 8.0); P.building(rect(54, -43, 57, -40), 6.0, 8.0)                          # gate towers
P.building(circle((86, -58), 6), 6.0, 14, 'battery tower')
BAT = (100, -48)

# openings in the plaza's ring of steps where each route arrives, and the main routes' own paving
for brg in (270, 90):
    P.stairs(orect(polar(ARM, 25, brg), 10, 6, math.radians(brg)), 2.0, 3.0, brg)
P.fill(rect(-62, -54, -38, -46), 6.0, 'path')
P.strip([YARD] + ARC + [polar(C, 43, 20), (40, -48), BAT], 8)
P.strip([(0, -68), polar(C, 50, 90)], 6); P.strip([polar(C, 43, 90), polar(C, 60, 90), (0, 9)], 14)

for a, nm in ((156, 'bell tower'), (24, 'beacon')):                    # a tall marker at each turn of the arc, on its north side
    P.building(circle(polar(C, 35, a), 3.5), 6.0, 13.0, nm)
for a in (160, 20):                                                     # threshold pillars where the arc meets each seam
    for r in (38, 48): P.building(circle(polar(C, r, a), 1.3), 6.0, 5.0)
P.h[(P.m == 'road') & (P.h == 6.0)] += 0.3                              # the road a step above the terrace
P.landmark(ARM, 'the armillary', 14, 8)
P.gate(YARD, 'to the drill yard'); P.gate(BAT, 'to the battery'); P.gate((0, -66), 'north road'); P.gate((0, 76), 'sea landing')
P.route([YARD] + ARC[:18] + [polar(C, 62, 90), (-2, 10)], 'main')                                # arriving from the yard
P.route([BAT, (40, -48)] + ARC[::-1][:18] + [polar(C, 62, 90), (2, 10)], 'main')                  # coming back from the battery
P.route([(0, -66), polar(C, 50, 90), polar(C, 62, 90), (0, 10)], 'main')   # the north road
P.route([(0, 76), (0, 56), (0, 26)], 'side')                               # up from the sea landing
P.render()
if "--frames" in sys.argv: P.frames()
