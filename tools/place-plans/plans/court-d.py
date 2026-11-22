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
the grey-box.

Revision 6 (to_ldtk.py --report, the engine's step rule: more than 0.5 m between neighbouring cells is a cliff; flights
want about 3 u of run per metre along a screen vertical): the grand stair runs 12 u straight from the balcony down to
the sunk floor; the dais rises in two 0.5 m rings instead of four steep flights; the stair to the sea court is 12 u; the
sea landing is a quay at -5 m, 12 u of stair below the sea court.

Revision 7 (the first in-game flow round, 4/10): at play zoom the plan was too big. The arc was about 8 near-identical
screens and the dais never shared a frame with the balcony. Everything is pulled together: the arc's radius 43 -> 28
(about 1.2 screens a side), the grand stair's head about 25 u from the dais (the armillary's 14 m rises into frame from
there), a smaller sunk floor, shorter runs to the gates, the bridge and the quay.

Revision 8 (the second in-game flow round, 5/10): the armillary, about a screen tall and standing south of the grand
stair, rose over the stair on screen and hid it, so every descent happened inside the sphere. The axis stair becomes a
pair of flights either side of the dais, clear of the sphere's screen shadow; the axis keeps an overlook between the
pylons, behind a low parapet, where the armillary is framed across the drop. The armillary itself is cut to about 70%
(about seven wizards tall, as in the concept), so it shares a screen with its dais."""
import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from plan import *

P = Plan('court-d', 'Courtyard D: Terraces round a plaza (rev 8)', U=(-80, 95), V=(-56, 72))
C = (0, -40)            # the amphitheatre's centre, up the screen
ARM = (0, 18)
SEA = -9.0
def toward(a, b, d):  # the point d along from a towards b
    L = math.dist(a, b); return (a[0] + (b[0] - a[0]) * d / L, a[1] + (b[1] - a[1]) * d / L)

P.fill(rect(-80, -56, 95, 72), 6.0, 'grass')
for c, r in [((-60, -46), 8), ((28, -50), 6), ((-66, -8), 6)]:
    P.fill(circle(c, r), 6.0, 'trees')
# the sea and the terraces cut into the hillside
P.fill(arc_band(C, 0, 150, 5, 175), SEA, 'deep')
P.fill(arc_band(C, 0, 90, 20, 160), -1.0, 'paving')         # the sea court
P.fill(arc_band(C, 0, 70, 24, 156), 3.0, 'plaza')           # the middle terrace
P.fill(circle(ARM, 20), 3.0, 'plaza')                       # the round plaza's rim, a bastion over the sea court
for r, h in ((18, 2.75), (17, 2.5), (16, 2.25)):            # sunk a metre in rings of steps
    P.fill(circle(ARM, r), h, 'stairs')
P.fill(circle(ARM, 15), 2.0, 'dais')
P.fill(arc_band(C, 0, 38, 20, 160), 6.0, 'paving')          # the top terrace, a balcony over the plaza
P.fill(rect(-80, -42, -24, -20), 6.0, 'grass'); P.fill(rect(24, -42, 95, -20), 6.0, 'grass')   # the land out to the seams
P.fill(circle(ARM, 7.5), 2.5, 'stairs'); P.fill(circle(ARM, 6.5), 3.0, 'plaza')   # the dais, in two 0.5 m rings you can step up anywhere

# the north road: straight down through the great hall's gate
P.building(arc_band(C, 8, 20, 35, 145), 6.0, 12.0, 'great hall', doors=[polar(C, 21, 65), polar(C, 21, 115)])
P.fill(orect(polar(C, 14, 90), 6, 14, math.radians(90)), 6.0, 'path')
P.fill(rect(-3, -56, 3, -30), 6.0, 'path')
for su in (-22, 22): P.stairs(orect((su, -4.5), 8, 10, math.radians(90)), 6.0, 3.0, 90)              # the paired flights, either side of the dais
for du in (-10, 10): P.building(rect(du - 1.5, -9, du + 1.5, -6), 6.0, 6.0)                          # pylons framing the overlook
P.building(rect(-8.5, -4, 8.5, -3), 6.0, 1.0, roof='wall')                                           # the overlook's low parapet

# the cross road: an arc along the top terrace in front of the hall, from the yard's seam to the battery's
ARC = [polar(C, 28, a) for a in range(160, 89, -5)] + [polar(C, 28, a) for a in range(90, 19, -5)]
YARD = (-44, -30)

# a library and workshops on the middle terrace's wings, doors facing the plaza
for a0, a1, nm in ((26, 40, 'workshops'), (140, 154, 'library')):
    P.building(arc_band(C, 45, 62, a0, a1, 10), 3.0, 7.0, nm, doors=[polar(C, 53, a1 + 2 if a0 < 90 else a0 - 2)])

# the sea landing: straight below the armillary, an axis stair off the plaza's rim, then down the cliff
P.stairs(orect((0, 44), 10, 12, math.radians(90)), 3.0, -1.0, 90)
P.stairs(orect((0, 56), 10, 12, math.radians(90)), -1.0, -5.0, 90)
P.fill(rect(-6, 62, 6, 69), -5.0, 'wood')
for du in (-7, 7): P.building(rect(du - 1.5, 35, du + 1.5, 38), 3.0, 5.0)                            # the rim's gateway

# the battery: across the head of a sea inlet to the east, over one parapeted deck above the falls; the battery's tower
# beside the road just beyond, on its north side so it can't hide you
P.fill([(38, 72), (40, 40), (43, 10), (44, -10), (52, -10), (58, 20), (64, 45), (95, 52), (95, 72)], SEA, 'deep')   # the inlet
P.fill([(44, -56), (52, -56), (52, -10), (44, -10)], 4.0, 'water')                                                 # the stream above the falls
P.fill(rect(24, -34, 95, -26), 6.0, 'path')
P.fill(rect(40, -34, 56, -26), 6.5, 'wood')                                                                        # the deck
P.building(rect(40, -35, 56, -34), 6.5, 1.0, roof='wall'); P.building(rect(40, -26, 56, -25), 6.5, 1.0, roof='wall')   # parapets
P.building(rect(36, -38, 39, -35), 6.0, 8.0); P.building(rect(36, -25, 39, -22), 6.0, 8.0)                         # gate towers
P.building(circle((66, -42), 6), 6.0, 14, 'battery tower')
BAT = (86, -30)
P.fill(rect(53, -56, 59, -34), 6.0, 'path')                                                                        # the gorge path up beside the stream
GORGE = (56, -52)

# openings in the plaza's ring of steps, and the main routes' own paving
P.stairs(orect(polar(ARM, 17, 90), 10, 6, math.radians(90)), 2.0, 3.0, 90)
P.fill(rect(-48, -34, -24, -26), 6.0, 'path')
P.strip([YARD] + ARC + [polar(C, 28, 20), (30, -30), BAT], 8)
P.strip([(0, -56), polar(C, 30, 90)], 6)

for a, nm in ((156, 'bell tower'), (24, 'beacon')):                    # a tall marker at each turn of the arc, on its north side
    P.building(circle(polar(C, 21, a), 3.0), 6.0, 13.0, nm)
for a in (160, 20):                                                     # threshold pillars where the arc meets each seam
    for r in (23, 33): P.building(circle(polar(C, r, a), 1.3), 6.0, 5.0)
P.h[(P.m == 'road') & (P.h == 6.0)] += 0.3                              # the road a step above the terrace
P.landmark(ARM, 'the armillary', 10, 5.5)
P.gate(YARD, 'to the drill yard'); P.gate(BAT, 'to the battery'); P.gate((0, -54), 'north road'); P.gate((0, 66), 'sea landing')
J = polar(C, 28, 90); ARC_W, ARC_E = ARC[:15], ARC[14:]
WT, WF, ET, EF, DAIS = (-22, -10), (-22, 2), (22, -10), (22, 2), (0, 9)       # the flights' tops and feet, the dais's north step
WDOWN, EDOWN = [WT, WF, (-12, 7), DAIS], [ET, EF, (12, 7), DAIS]
P.route([YARD] + ARC_W[:10] + WDOWN, 'main')                                         # arriving from the yard
P.route([BAT, (30, -30)] + ARC_E[::-1][:10] + EDOWN, 'main')                          # coming back from the battery
P.route([(0, -54), J, (-12, -12)] + WDOWN, 'main')                                   # the north road
P.route([(0, 66), (0, 50), (0, 26)], 'side')                                         # up from the sea landing
# the journey through the courtyard, in the order of the brief's route; the exits as the user approved (2026-11-22)
P.journey([(-8, 30), (0, 26)], 'The briefing at the armillary', 'Start below the dais: the armillary fills the screen, the beam stutters above the masters')
P.journey(WDOWN[::-1] + ARC_W[::-1][5:] + [YARD], 'Out to the drill yard', 'Up the west flight, west along the balcony; the bell tower marks the turn')
P.journey([YARD] + ARC_W + ARC_E + [(30, -30), BAT], 'Back from the yard, out through the main gate: the infirmary, then the battery',
          'The reveal: at the overlook the armillary rises between the pylons, across the drop; the beacon pulls you east')
P.journey([BAT, (30, -30)] + ARC_E[::-1][:10] + EDOWN + EDOWN[::-1][1:] + [(12, -12), J, (0, -54)], 'Back from the battery: the ward bell, then out north to the ward line',
          'Homecoming: down the east flight to the bell at the dais, then up through the great hall')
P.journey([(0, -54), J, (-12, -12)] + WDOWN + EDOWN[::-1] + [(16, -16)] + ARC_E[5:] + [(30, -30), (56, -30), GORGE], 'Back from the ward line, out to the gorge',
          'The best approach: straight down the north road to the overlook, the armillary ahead; out past the falls')
P.journey([(0, 66), (0, 50), (0, 38), (0, 26)], 'The finale: up from the sea landing',
          'The climb from the sea, framed by the rim’s gateway; the armillary torn open above the warband')
P.render()
if "--frames" in sys.argv: P.frames()
