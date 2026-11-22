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
(about seven wizards tall, as in the concept), so it shares a screen with its dais.

Revision 9 (the third in-game flow round, 6/10: the routes read, the set pieces don't land yet): the finale climb is
shorter and broken by a landing (the sea court raised to +1 m, the quay stair in two flights); the overlook juts out as a
bay over the drop with low corner posts instead of tall pylons; the plaza's rim is two real 0.5 m treads; the battery's
end of the road is a screen shorter; the bell tower has bulk; the north road ends at gate towers, not the void.

Revision 10 (the fourth in-game flow round, 7/10 for the layout alone): the overlook steps down two treads into its own
bay east of the axis, its prow over the drop, so it reads as a place apart and not as the north road's crossroads; the
passage through the great hall is a screen shorter; the gorge path is shorter, beside the falls. The rest is camera (a
look-ahead that keeps the landmark in frame) and dressing.

Revision 11 (the sense stage, after flow passed in the game at 7.5/10): the flights move 4 u out so the east flight's head
stands clear of the overlook bay; the bridge's tall south tower becomes a post, so it can't hide you; a low parapet runs
along the balcony's lip, broken only at the two flights and the bay, which gives the flight-head decks an edge and says
where the way down is.

Revision 12 (the sense critic, 5.5/10): every door gets a forecourt on a straight wall (the balcony road moves out to
r 31, the workshops and the library off the cliff corners with their doors mid-face); a knee-high lip along every road
edge that drops a tier; the drill yard's road ends at a gate with two piers; the sea runs on past the edges so no void
shows; the river comes out of a culvert under the north wall; the land past the inlet that no route reaches is woods."""
import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from plan import *

P = Plan('court-d', 'Courtyard D: Terraces round a plaza (rev 12)', U=(-95, 110), V=(-62, 100))
C = (0, -40)            # the amphitheatre's centre, up the screen
ARM = (0, 18)
SEA = -9.0
def toward(a, b, d):  # the point d along from a towards b
    L = math.dist(a, b); return (a[0] + (b[0] - a[0]) * d / L, a[1] + (b[1] - a[1]) * d / L)

P.fill(rect(-95, -62, 110, 100), 6.0, 'grass')
for c, r in [((-60, -46), 8), ((28, -50), 6), ((-66, -8), 6)]:
    P.fill(circle(c, r), 6.0, 'trees')
# the sea and the terraces cut into the hillside
P.fill(arc_band(C, 0, 150, 5, 175), SEA, 'deep')
P.fill(arc_band(C, 0, 90, 20, 160), 1.0, 'paving')          # the sea court
P.fill(arc_band(C, 0, 70, 24, 156), 3.0, 'plaza')           # the middle terrace
P.fill(circle(ARM, 20), 3.0, 'plaza')                       # the round plaza's rim, a bastion over the sea court
P.fill(circle(ARM, 18.5), 2.5, 'stairs')                    # sunk a metre in two real treads
P.fill(circle(ARM, 17), 2.0, 'dais')
P.fill(arc_band(C, 0, 38, 20, 160), 6.0, 'paving')          # the top terrace, a balcony over the plaza
P.fill(rect(-95, -42, -24, -20), 6.0, 'grass'); P.fill(rect(24, -42, 110, -20), 6.0, 'grass')   # the land out to the seams
P.fill(circle(ARM, 7.5), 2.5, 'stairs'); P.fill(circle(ARM, 6.5), 3.0, 'plaza')   # the dais, in two 0.5 m rings you can step up anywhere

# the north road: straight down through the great hall's gate
P.building(arc_band(C, 8, 20, 35, 145), 6.0, 12.0, 'great hall', doors=[polar(C, 21, 65), polar(C, 21, 115)])
P.fill(orect(polar(C, 14, 90), 6, 14, math.radians(90)), 6.0, 'path')
P.fill(rect(-3, -46, 3, -30), 6.0, 'path')
for du in (-6.5, 3.5): P.building(rect(du, -45, du + 3, -42), 6.0, 8.0)                              # the north gate's towers
for su in (-26, 26): P.stairs(orect((su, -7.5), 8, 10, math.radians(90)), 6.0, 3.0, 90)              # the paired flights, either side of the dais
P.fill(rect(3, -6, 13, -5), 5.8, 'stairs'); P.fill(rect(3, -5, 13, -4), 5.4, 'stairs'); P.fill(rect(3, -4, 13, 3), 5.0, 'paving')             # the overlook: two treads down into a bay jutting over the drop, east of the axis
P.building(rect(3, 3, 13, 4), 5.0, 1.0, roof='wall')                                                 # its parapet
for du in (2, 13): P.building(rect(du, -5, du + 1, 4), 5.0, 1.0, roof='wall')                         # its side parapets
for du in (1.5, 12.5): P.building(rect(du, 3, du + 1.5, 4.5), 5.0, 2.5)                              # low posts at its prow
for a0, a1 in ((20, 36), (54, 69), (86, 126), (144, 160)):                                          # a low parapet along the balcony's lip, open at the flights and the bay
    P.building(arc_band(C, 37, 38.5, a0, a1, 12), 6.0, 1.0, roof='wall')

# the cross road: an arc along the top terrace in front of the hall, from the yard's seam to the battery's
ARC = [polar(C, 31, a) for a in range(160, 89, -5)] + [polar(C, 31, a) for a in range(90, 19, -5)]
YARD = (-44, -30)

# a library and workshops on the middle terrace's wings, doors facing the plaza
for a0, a1, nm in ((42, 56, 'workshops'), (124, 138, 'library')):
    P.building(arc_band(C, 50, 66, a0, a1, 10), 3.0, 7.0, nm, doors=[polar(C, 48.5, (a0 + a1) / 2)])

# the sea landing: straight below the armillary, an axis stair off the plaza's rim, then down the cliff
P.stairs(orect((0, 41), 10, 6, math.radians(90)), 3.0, 1.0, 90)
P.stairs(orect((0, 54.5), 10, 9, math.radians(90)), 1.0, -2.0, 90)
P.fill(rect(-7, 59, 7, 62), -2.0, 'paving')                                                         # the landing
P.stairs(orect((0, 66.5), 10, 9, math.radians(90)), -2.0, -5.0, 90)
P.fill(rect(-6, 71, 6, 79), -5.0, 'wood')
for du in (-7, 7): P.building(rect(du - 1.5, 35, du + 1.5, 38), 3.0, 5.0)                            # the rim's gateway

# the battery: across the head of a sea inlet to the east, over one parapeted deck above the falls; the battery's tower
# beside the road just beyond, on its north side so it can't hide you
P.fill([(38, 100), (40, 40), (43, 10), (44, -10), (52, -10), (58, 20), (64, 45), (110, 52), (110, 100)], SEA, 'deep')   # the inlet
P.fill([(44, -56), (52, -56), (52, -10), (44, -10)], 4.0, 'water')
P.building(rect(41, -62, 55, -56), 4.0, 2.0, roof='wall')                                          # the culvert the river comes out of                                                 # the stream above the falls
P.fill(rect(24, -34, 95, -26), 6.0, 'path')
P.fill(rect(40, -34, 56, -26), 6.5, 'wood')                                                                        # the deck
P.building(rect(40, -35, 56, -34), 6.5, 1.0, roof='wall'); P.building(rect(40, -26, 56, -25), 6.5, 1.0, roof='wall')   # parapets
P.building(rect(36, -38, 39, -35), 6.0, 8.0); P.building(rect(36, -25, 39, -22), 6.0, 3.0)                         # a gate tower north of the road, a post south of it
P.building(circle((66, -42), 6), 6.0, 14, 'battery tower')
BAT = (74, -30)
P.fill(rect(53, -46, 59, -34), 6.0, 'path')                                                                        # the gorge path up beside the stream
GORGE = (56, -44)

# openings in the plaza's ring of steps, and the main routes' own paving
P.stairs(orect(polar(ARM, 17, 90), 10, 6, math.radians(90)), 2.0, 3.0, 90)
P.fill(rect(-48, -34, -24, -26), 6.0, 'path')
for dv in (-36, -26): P.building(rect(-47, dv, -45, dv + 2), 6.0, 4.0)                              # the drill yard's gate piers
P.strip([YARD] + ARC + [polar(C, 31, 20), (30, -30), BAT], 8)
P.strip([(0, -46), polar(C, 30, 90)], 6)

for a, nm, r in ((156, 'bell tower', 5.0), (24, 'beacon', 3.0)):     # a tall marker at each turn of the arc, on its north side
    P.building(circle(polar(C, 19, a), r), 6.0, 15.0 if r > 4 else 13.0, nm)
for a in (160, 20):                                                     # threshold pillars where the arc meets each seam
    for r in (26, 36): P.building(circle(polar(C, r, a), 1.3), 6.0, 5.0)
P.h[(P.m == 'road') & (P.h == 6.0)] += 0.3                              # the road a step above the terrace
import numpy as np
from scipy import ndimage
walk = np.isin(P.m, ['plaza', 'paving', 'grass', 'path', 'road', 'dais', 'stairs', 'wood', 'sand']) & ~P.bld
P.m[walk & (((P.CU > 52) & (P.CV > -22)) | ((P.CU < -40) & (P.CV > 60)))] = 'trees'   # land no route reaches (past the inlet, the far corner): woods
near = ndimage.binary_dilation(np.isin(P.m, ['road', 'path']), iterations=4)
low = np.zeros_like(walk)
for dy, dx in ((0, 1), (1, 0), (0, -1), (-1, 0)):
    nb = np.roll(np.roll(P.h, dy, 0), dx, 1)
    low |= (P.h - nb > 1.5) & ~np.roll(np.roll(P.bld, dy, 0), dx, 1)
lip = walk & near & low & (P.m != 'stairs') & (P.h > 4.5)
P.h[lip] += 1.0; P.m[lip] = 'wall'; P.bld[lip] = True                  # a knee-high lip along every road edge that drops a tier
P.landmark(ARM, 'the armillary', 10, 5.5)
P.gate(YARD, 'to the drill yard'); P.gate(BAT, 'to the battery'); P.gate((0, -44), 'north road'); P.gate((0, 76), 'sea landing')
J = polar(C, 31, 90); ARC_W, ARC_E = ARC[:15], ARC[14:]
WT, WF, ET, EF, DAIS = (-26, -13), (-26, -1), (26, -13), (26, -1), (0, 9)       # the flights' tops and feet, the dais's north step
WDOWN, EDOWN = [WT, WF, (-14, 6), DAIS], [ET, EF, (14, 6), DAIS]
P.route([YARD] + ARC_W[:10] + WDOWN, 'main')                                         # arriving from the yard
P.route([BAT, (30, -30)] + ARC_E[::-1][:10] + EDOWN, 'main')                          # coming back from the battery
P.route([(0, -44), J, (-12, -12)] + WDOWN, 'main')                                   # the north road
P.route([(0, 76), (0, 50), (0, 26)], 'side')                                         # up from the sea landing
# the journey through the courtyard, in the order of the brief's route; the exits as the user approved (2026-11-22)
P.journey([(-8, 30), (0, 26)], 'The briefing at the armillary', 'Start below the dais: the armillary fills the screen, the beam stutters above the masters')
P.journey(WDOWN[::-1] + ARC_W[::-1][5:] + [YARD], 'Out to the drill yard', 'Up the west flight, west along the balcony; the bell tower marks the turn')
P.journey([YARD] + ARC_W + [(8, -11), (8, -2), (8, -11)] + ARC_E[1:] + [(30, -30), BAT], 'Back from the yard, out through the main gate: the infirmary, then the battery',
          'The reveal: two steps down into the overlook bay, the armillary across the drop; the beacon pulls you east')
P.journey([BAT, (30, -30)] + ARC_E[::-1][:10] + EDOWN + EDOWN[::-1][1:] + [(12, -12), J, (0, -44)], 'Back from the battery: the ward bell, then out north to the ward line',
          'Homecoming: down the east flight to the bell at the dais, then up through the great hall')
P.journey([(0, -44), J, (-12, -12)] + WDOWN + EDOWN[::-1] + [(16, -16)] + ARC_E[5:] + [(30, -30), (56, -30), GORGE], 'Back from the ward line, out to the gorge',
          'The best approach: straight down the north road to the overlook, the armillary ahead; out past the falls')
P.journey([(0, 76), (0, 61), (0, 46), (0, 36), (0, 28)], 'The finale: up from the sea landing',
          'The climb from the sea, framed by the rim’s gateway; the armillary torn open above the warband')
P.render()
if "--frames" in sys.argv: P.frames()
