"""Infirmary plan C, the pond (the wild one): the well stands on a raised round platform in a lily pond; the conduits are
walkways on piers running out from it to islands, the greenhouse, the stills, the cots' island under tents. The road
from the main gate comes onto the main walkway on the well's axis. Cutting the vines off the walkways opens them one by
one, so the fix is literally the way across. You leave from the cots' island over a bridge to the battery road."""
import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from plan import *

P = Plan('inf-c', 'Infirmary C: the pond', U=(-50, 55), V=(-42, 40))
W0 = (0, 2)
P.fill(rect(-50, -42, 55, 40), 2.5, 'grass')
P.fill(circle((2, 2), 40), -1.0, 'water')                         # the pond
P.fill(circle(W0, 8), 2.0, 'plaza'); P.fill(circle(W0, 3), 2.0, 'dais')   # the well's platform
P.fill(rect(-3, -42, 3, -6), 2.5, 'path')                         # the road in, becoming the main walkway
P.fill(rect(-2.5, -34, 2.5, -6), 2.0, 'wood')
for c, rr in (((-26, -10), 6), ((-24, 20), 6)):                   # islands for the greenhouse and the stills
    P.fill(circle(c, rr + 3), 2.0, 'grass')
P.building(circle((-26, -10), 6), 2.0, 6.0, 'greenhouse', doors=[(-20, -6)])
P.building(rect(-29, 16, -19, 24), 2.0, 5.0, 'stills', doors=[(-18, 20)])
P.fill(circle((26, 4), 13), 2.0, 'grass')                         # the cots' island
for x, y in ((20, -2), (32, -2), (20, 10), (32, 10)):
    P.building(rect(x - 3, y - 2, x + 3, y + 1), 2.0, 2.5, roof='roof')
P.note((26, -10), 'cots under tents')
for a, b in (((-6, -2), (-20, -6)), ((-6, 6), (-18, 18)), ((7, 3), (14, 4))):   # the walkways (the conduits)
    L = math.dist(a, b); P.fill(orect(((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), 3, L + 2, math.atan2(b[1] - a[1], b[0] - a[0])), 2.0, 'wood')
P.fill(rect(38, 2, 55, 6), 2.0, 'wood'); P.fill(rect(44, 2, 55, 6), 2.5, 'path')   # the bridge out to the battery road
P.landmark(W0, 'the well', 6, 3)
P.gate((0, -40), 'from the main gate'); P.gate((53, 4), 'to the battery')
P.journey([(0, -40), (0, -20), (0, -8)], 'In from the main gate, out along the walkway', 'The well on its platform in the pond, choked in vines')
P.journey([(0, -6), (-14, -4), (-20, -6), (-14, -4), (-12, 12), (-18, 18), (-12, 12), (0, 8)], 'The fix: clearing the walkways', 'Each walkway you clear relights a conduit')
P.journey([(7, 3), (14, 4), (24, 4), (30, 8)], 'The cots, on their island', 'Heal the wounded')
P.journey([(32, 4), (44, 4), (53, 4)], 'Out to the battery, over the bridge', 'The battery ahead')
P.render()
if "--frames" in sys.argv: P.frames()
