"""Drill yard plan D (the structure critic's pick: C, the ring, opened into a horseshoe, with A's bays and B's step down),
the user's pick (2026-11-22). A pit sunk 3 m where the soldiers drill, open along the north to the foot of the academy's
ranges; a rim at the courtyard's 6 m round its east, south and west, a low wall over woods on the south. The stations run
down the screen from the arrival (principle 18), each a bay seen before you reach it: strike, heavy, retreat on the
rim; the parry lane a straight flight down into the pit; the hands ring on the pit floor. The armoury is at the
horseshoe's west end, opening onto the pit, its rack lit. The way back crosses the pit through the soldiers and climbs
a flight to the gate.

Revision 2 (the flow critic on flat frames, 6/10): the gate moves south so you arrive facing the strike lanes, and the
way back climbs at the rim's north-east tip under the ranges, out of sight of the arrival (it was beside it, and the
most visible thing there); the pit is smaller (r 22), so the walk back has no dead ground; each bay is a tread up and
juts out over the pit, a place of its own.

Revision 3 (the first in-game round, 6/10): the way back is the parry lane's own flight, within a screen of the rack and
the hands ring and so always in view (the north-east flight across the pit was more than a screen off); back along the
rim past the bays to the gate. The pit's depth reads only from inside it (its inner drop faces away from the camera),
so that's for dressing: a lip on the rim's inner edge and a darker floor.

Revision 4 (the first sense round in the game, 6/10): the woods south of the rim stood 4 m below it, so the yard read as
a mound with a bowl on top; they're level with the rim now, and the pit is the only drop.

Revision 5 (the second sense round, 7/10): the woods run 18 u further south, past the camera's view from the rim, and
18 u further east past the gate; the gate's line closed (finish.close_gates)."""
import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from plan import *

P = Plan('yard-d', 'Drill yard D: the horseshoe (rev 5)', U=(-56, 76), V=(-48, 64))
O = (0, 0)
PIT, RIM = 22, 38
P.fill(rect(-56, -48, 76, 64), 6.0, 'grass')
P.fill(rect(-56, 28, 76, 64), 6.0, 'trees')                                  # woods level with the rim, so the yard is cut into level ground
P.building(arc_band(O, 28, 46, 200, 340, 30), 3.0, 18.0, 'the ranges')        # the academy along the north, standing in the pit
P.fill(arc_band(O, 0, RIM, -25, 205, 40), 6.0, 'paving')                      # the rim, round east, south and west
P.fill(circle(O, PIT), 3.0, 'path')                                           # the pit, sunk 3 m
P.fill(arc_band(O, 0, 28, 200, 340, 30), 3.0, 'path')                         # open to the ranges' foot on the north
P.fill(rect(36, 14, 58, 22), 6.0, 'path')                                     # in from the courtyard's gate, facing the strike lanes
# the stations: bays a tread up, jutting out over the pit, in order down the screen from the arrival
stations = [(28, 'strike lanes'), (62, 'heavy: the sack'), (96, 'retreat: the mallet')]
for i, (a, nm) in enumerate(stations):
    c = polar(O, 25, a); P.fill(circle(c, 7), 6.5, 'plaza'); P.fill(circle(c, 4.5), 6.5, 'sand'); P.note((c[0], c[1] - 7), f'{i + 1}. {nm}')
# the parry lane: a straight flight down into the pit, the soldier's bolts down its length
a = 134; c0, c1 = polar(O, 34, a), polar(O, 16, a)
P.stairs(orect(((c0[0] + c1[0]) / 2, (c0[1] + c1[1]) / 2), 9, 12, math.radians(a)), 6.0, 3.0, a + 180)
P.note(polar(O, 32, a + 16), '4. parry lane')
hc = polar(O, 11, 165); P.fill(circle(hc, 6.5), 3.0, 'sand'); P.note((hc[0], hc[1] - 8), '5. hands ring')
# the armoury at the horseshoe's west end, opening onto the pit; the rack at its door
P.fill(arc_band(O, 0, 27, 178, 206, 12), 3.0, 'path')                         # the pit reaches the armoury's face
P.building(orect(polar(O, 33, 192), 16, 12, math.radians(192)), 3.0, 12.0, 'armoury', doors=[polar(O, 26, 192)])
RACK = polar(O, 23, 192); P.landmark(RACK, 'the rack', 3, 1.5)
# the way back: across the pit, up a flight at the rim's north-east tip under the ranges, then round to the gate
for a2 in (230, 260, 290, 315, 345):                                          # the soldiers drilling, the last by the way back
    P.note(polar(O, 14, a2), 'soldiers')
P.gate((56, 18), 'to the courtyard')
# the yard's markers by id, for sim/src/yard.ts (the station spots, in plan units U, V); to_ldtk writes them as Markers
def _along(c, a, d):                                            # d units along the rim's tangent at angle a from c
    t = math.radians(a + 90); return (c[0] + d * math.cos(t), c[1] + d * math.sin(t))
_strike, _heavy, _retreat = (polar(O, 25, a) for a, _ in stations)
MARKERS = {'strike': _strike, 'heavy': _heavy, 'heavy-ring': polar(O, 21.5, 62), 'retreat': _retreat,
           'parry': polar(O, 33, 134), 'parry-home': polar(O, 12, 134), 'hands': hc, 'focus': RACK, 'gate': (54, 18)}
MARKERS.update({f'straw-{k}': _along(_strike, 28, d) for k, d in enumerate((-4.5, -1.5, 1.5, 4.5))})
MARKERS.update({f'hands-in-{k}': (hc[0] + du, hc[1] + dv) for k, (du, dv) in enumerate(((-5, -5), (5, -5), (-5, 5), (5, 5)))})
P.journey([(56, 18), (40, 18), (30, 16)], 'In from the courtyard onto the rim, facing the strike lanes', 'The first station straight ahead; the pit and the soldiers below')
P.journey([polar(O, 31, a3) for a3 in range(30, 125, 10)] + [polar(O, 30, 134), polar(O, 20, 134), polar(O, 14, 150), hc], 'The stations, down the screen and round', 'Each bay seen before you reach it; the parry lane drops you into the pit')
P.journey([hc, polar(O, 16, 182), RACK], 'The rack at the armoury door', 'The focus: the flame sword')
P.journey([RACK, polar(O, 16, 170), polar(O, 16, 134), polar(O, 30, 134), polar(O, 33, 120)] + [polar(O, 33, a3) for a3 in range(110, 20, -15)] + [(40, 18), (56, 18)], 'Back out to the courtyard', 'Up the parry lane’s flight, back along the rim past the bays to the gate')
P.repaint(rect(-60, -52, 80, 68), 'trees', ['grass'])                       # no ground outside the rim: woods, so no void is in view
from finish import lips, woods_unreached
from finish import close_gates
lips(P); close_gates(P); woods_unreached(P)
P.render()
if "--frames" in sys.argv: P.frames()
