"""Drill yard plan D (the structure critic's pick: C, the ring, opened into a horseshoe, with A's bays and B's step down).
A pit sunk 3 m where the soldiers drill, open along the north to the foot of the academy's ranges; a rim at the
courtyard's 6 m round its east, south and west, a low wall over woods on the south. From the arrival on the east the
stations run down the screen first (principle 18), each a bay pushing out over the pit, seen before you reach it:
strike, heavy, retreat on the rim; the parry lane a straight flight down into the pit; the hands ring on the pit floor.
The armoury is at the horseshoe's west end, opening onto the pit, its rack lit and in view from the arrival. The way back
crosses the pit through the soldiers and climbs a flight to the gate."""
import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from plan import *

P = Plan('yard-d', 'Drill yard D: the horseshoe', U=(-60, 62), V=(-52, 50))
O = (0, 0)
P.fill(rect(-60, -52, 62, 50), 6.0, 'grass')
P.fill(rect(-60, 30, 62, 50), 2.0, 'trees')                                  # woods below the south rim
P.building(arc_band(O, 34, 52, 200, 340, 30), 3.0, 18.0, 'the ranges')        # the academy along the north, standing in the pit
P.fill(arc_band(O, 0, 44, -25, 205, 40), 6.0, 'paving')                       # the rim, round east, south and west
P.fill(circle(O, 28), 3.0, 'path')                                            # the pit, sunk 3 m
P.fill(arc_band(O, 0, 34, 200, 340, 30), 3.0, 'path')                         # open to the ranges' foot on the north
P.fill(rect(44, -6, 62, 4), 6.0, 'path')                                      # in from the courtyard's gate, east
# the stations: bays pushing out over the pit, in order down the screen from the arrival
stations = [(15, 'strike lanes'), (50, 'heavy: the sack'), (88, 'retreat: the mallet')]
for i, (a, nm) in enumerate(stations):
    c = polar(O, 30, a); P.fill(circle(c, 7), 6.0, 'paving'); P.fill(circle(c, 4.5), 6.0, 'sand'); P.note((c[0], c[1] - 7), f'{i + 1}. {nm}')
# the parry lane: a straight flight down into the pit, the soldier's bolts down its length
a = 128; c0, c1 = polar(O, 40, a), polar(O, 22, a)
P.stairs(orect(((c0[0] + c1[0]) / 2, (c0[1] + c1[1]) / 2), 9, 12, math.radians(a)), 6.0, 3.0, a + 180)
P.note(polar(O, 36, a + 14), '4. parry lane')
hc = polar(O, 16, 160); P.fill(circle(hc, 6.5), 3.0, 'sand'); P.note((hc[0], hc[1] - 8), '5. hands ring')
# the armoury at the horseshoe's west end, opening onto the pit; the rack at its door
P.fill(arc_band(O, 0, 33, 178, 206, 12), 3.0, 'path')                         # the pit reaches the armoury's face
P.building(orect(polar(O, 39, 192), 16, 12, math.radians(192)), 3.0, 12.0, 'armoury', doors=[polar(O, 32, 192)])
RACK = polar(O, 29, 192); P.landmark(RACK, 'the rack', 3, 1.5)
# the way back: across the pit, up a flight on the east to the gate
P.stairs(orect(polar(O, 33, -12), 9, 12, math.radians(-12)), 3.0, 6.0, -12)
for a2 in (230, 260, 290, 315):                                               # the soldiers drilling by the ranges
    P.note(polar(O, 18, a2), 'soldiers')
P.gate((60, -1), 'to the courtyard')
# the yard's markers by id, for sim/src/yard.ts (the station spots, in plan units U, V); to_ldtk writes them as Markers
def _along(c, a, d):                                            # d units along the rim's tangent at angle a from c
    t = math.radians(a + 90); return (c[0] + d * math.cos(t), c[1] + d * math.sin(t))
_strike, _heavy, _retreat = (polar(O, 30, a) for a, _ in stations)
MARKERS = {'strike': _strike, 'heavy': _heavy, 'heavy-ring': polar(O, 25.5, 50), 'retreat': _retreat,
           'parry': polar(O, 38, 128), 'parry-home': polar(O, 15, 128), 'hands': hc, 'focus': RACK, 'gate': (58, -1)}
MARKERS.update({f'straw-{k}': _along(_strike, 15, d) for k, d in enumerate((-4.5, -1.5, 1.5, 4.5))})
MARKERS.update({f'hands-in-{k}': (hc[0] + du, hc[1] + dv) for k, (du, dv) in enumerate(((-5.5, -5.5), (5.5, -5.5), (-5.5, 5.5), (5.5, 5.5)))})
P.journey([(60, -1), (44, -1), (36, 4)], 'In from the courtyard onto the east rim', 'The pit below, the soldiers by the ranges, the armoury’s glow across it')
P.journey([polar(O, 37, a3) for a3 in range(10, 121, 10)] + [polar(O, 31, 128), polar(O, 24, 128), polar(O, 18, 140), hc], 'The stations, down the screen and round', 'Each bay seen before you reach it; the parry lane drops you into the pit')
P.journey([hc, polar(O, 22, 180), RACK], 'The rack at the armoury door', 'The focus: the flame sword')
P.journey([RACK, (-6, 0), (14, -2), polar(O, 26, -12), polar(O, 39, -12), (44, -1), (60, -1)], 'Back out to the courtyard', 'Across the pit through the soldiers, up the east flight')
from finish import lips
lips(P)
P.render()
if "--frames" in sys.argv: P.frames()
