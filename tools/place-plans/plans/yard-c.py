"""Drill yard plan C, the ring (the wild one): a round yard, the academy's ranges round its far half. A rim walk at the
courtyard's 6 m runs round it like a clock face with the stations at the hours; inside it the arena, sunk 3 m, where the
soldiers drill; the armoury stands on a dais at the centre, reached last by a stair down and a causeway, its rack in
view the whole way round."""
import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from plan import *

P = Plan('yard-c', 'Drill yard C: the ring', U=(-55, 60), V=(-50, 45))
O = (0, 0)
P.fill(rect(-55, -50, 60, 45), 6.0, 'grass')
P.building(arc_band(O, 44, 56, 190, 350), 6.0, 15.0, 'the ranges')          # the academy round the far half
P.fill(circle(O, 42), 6.0, 'paving')                                         # the rim walk
P.fill(circle(O, 32), 3.0, 'path')                                           # the arena, sunk 3 m
P.fill(circle(O, 11.5), 3.5, 'stairs'); P.fill(circle(O, 10), 4.0, 'plaza')   # the armoury's dais at the centre, a tread up
P.building(circle(O, 5), 4.0, 10.0, 'armoury', doors=[(0, 6)])
P.landmark((0, 8), 'the rack', 3, 1.5)
P.stairs(orect((0, 36), 8, 9, math.radians(90)), 3.0, 6.0, 90)               # the stair down from the rim, south
P.fill(rect(42, -4, 60, 4), 6.0, 'path')                                     # in from the courtyard's gate, east
P.m[(P.m == 'grass') & ~P.mask(circle(O, 43)) & ~P.mask(rect(40, -6, 60, 6))] = 'trees'   # woods round the ring, off every route
hours = [(-20, 'strike lanes'), (-60, 'heavy: the sack'), (-110, 'retreat: the mallet'), (-160, 'parry lane'), (160, 'hands ring')]
for i, (a, nm) in enumerate(hours):
    c = polar(O, 37, a); P.fill(circle(c, 4.5), 6.0, 'sand'); P.note((c[0], c[1] - 6), f'{i + 1}. {nm}')
for a in (20, 60, 120, 200, 260, 320):
    c = polar(O, 22, a); P.note(c, 'soldiers')
P.gate((58, 0), 'to the courtyard')
P.journey([(58, 0), (42, 0), (38, -6)], 'In from the courtyard onto the rim', 'The ring round you, the armoury at its heart')
P.journey([polar(O, 37, a) for a in range(-10, -171, -15)] + [polar(O, 37, a) for a in range(170, 89, -15)], 'The stations round the rim', 'Each hour a station, the next in view')
P.journey([(0, 38), (0, 30), (0, 12), (0, 8)], 'Down to the armoury', 'Across the arena among the soldiers to the rack')
P.journey([(0, 10), (0, 34), (14, 38), (38, 14), (42, 0), (58, 0)], 'Back out to the courtyard', 'Up the stair, round the rim to the gate')
from finish import lips
lips(P)
P.render()
if "--frames" in sys.argv: P.frames()
