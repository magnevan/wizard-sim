"""Courtyard plan A, the Compass: the concept's octagon on a plateau that climbs out of the sea.
You arrive up a grand stair from the sea landing; the armillary stands on a dais at the centre; the eight sides are
gates on the axes and pavilions on the diagonals. A river cuts a gorge on the east and falls into the sea."""
import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from plan import *

P = Plan('court-a', 'Courtyard A: the Compass', U=(-95, 95), V=(-75, 80))
SEA = -10.0
# the plateau, its cliff edge wandering above the sea
P.fill([(-95, -75), (95, -75), (95, 30), (70, 34), (52, 46), (30, 44), (14, 41), (-14, 41), (-34, 47), (-58, 40), (-80, 50), (-95, 46)], 0.0, 'grass')
# woods beyond the walls
for c, r in [((-70, -55), 14), ((-82, -20), 10), ((70, -60), 12), ((-60, 30), 9), ((80, 10), 9)]:
    P.fill(circle(c, r), 0.0, 'trees')
# the river's gorge from the north-east, falling into the sea at the cliff
P.fill([(56, -75), (68, -75), (66, -30), (62, 10), (58, 46), (48, 46), (52, 10), (55, -30)], -3.0, 'water')
P.fill([(48, 40), (58, 40), (58, 50), (48, 50)], SEA, 'water')
# the octagonal plaza and its outer wall
P.fill(octagon((0, 0), 34), 0.5, 'paving')
wall = P.mask(octagon((0, 0), 34)) & ~P.mask(octagon((0, 0), 31))
P.fill(octagon((0, 0), 31), 0.5, 'plaza')
P.building(wall, 0.5, 4.0, roof='wall')
# gates on the four axes: passages through the wall
for ang in (0, 90, 180, 270):
    P.fill(orect(polar((0, 0), 32.5, ang), 7, 5, math.radians(ang)), 0.5, 'paving')
# pavilions on the diagonals
for ang, name in ((45, 'infirmary'), (135, 'library'), (225, 'great hall'), (315, 'workshops')):
    P.building(orect(polar((0, 0), 30, ang), 18, 11, math.radians(ang)), 0.5, 9.0, name, doors=[polar((0, 0), 23.5, ang)])
# the dais and its four stairs
P.fill(circle((0, 0), 8), 2.0, 'dais')
for ang in (0, 90, 180, 270):
    a = math.radians(ang)
    c = polar((0, 0), 9.2, ang)
    if ang in (90, 270): P.stairs(orect(c, 5, 3.2, a), 2.0 if ang == 90 else 0.5, 0.5 if ang == 90 else 2.0, 'V')
    else: P.stairs(orect(c, 5, 3.2, a), 2.0 if ang == 0 else 0.5, 0.5 if ang == 0 else 2.0, 'U')
# south: the gatehouse's forecourt, then the grand stair down the cliff to the landing
P.fill(rect(-10, 34, 10, 40), 0.5, 'paving')
P.stairs(rect(-5, 40, 5, 62), 0.5, SEA + 1.5, 'V')
P.fill(rect(-18, 62, 18, 70), SEA + 1.5, 'paving')
P.fill(rect(-4, 70, 4, 79), SEA + 1.0, 'wood')
P.building(rect(-16, 34, -10, 40), 0.5, 6, 'gatehouse'); P.building(rect(10, 34, 16, 40), 0.5, 6)
# north: the road out
P.fill(rect(-4, -75, 4, -34), 0.0, 'path')
# east: the road over the gorge to the battery
P.fill(rect(34, -3, 95, 3), 0.0, 'path')
P.fill(rect(47, -4, 67, 4), 0.5, 'wood')
# west: the outer road, down along the wall towards the yard
P.fill(rect(-60, -3, -34, 3), 0.0, 'path')
P.stairs(orect((-66, 8), 6, 16, math.radians(115)), -2.0, 0.0, 'V')
P.fill([(-70, 14), (-64, 14), (-80, 42), (-95, 40), (-95, 34), (-84, 30)], -2.0, 'path')
# north-west: the greenhouse terrace, a few steps down
P.fill(rect(-56, -50, -34, -32), -1.5, 'grass')
P.building(rect(-52, -48, -38, -38), -1.5, 6, 'greenhouse', roof='wall')
P.stairs(rect(-34, -36, -28, -32), -1.5, 0.0, 'U')

P.landmark((0, 0), 'the armillary', 14)
P.gate((0, -72), 'north road'); P.gate((92, 0), 'to the battery'); P.gate((-92, 37), 'to the drill yard'); P.gate((0, 77), 'sea landing')
P.route([(0, 76), (0, 62), (0, 40), (0, 9)], 'main')
P.route([(-92, 37), (-70, 20), (-64, 3), (-34, 0), (-9, 0)], 'main')
P.route([(9, 0), (34, 0), (92, 0)], 'main')
P.route([(0, -9), (0, -72)], 'side')
P.route([(-30, -30), (-40, -40)], 'side')
P.render()
