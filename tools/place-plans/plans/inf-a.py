"""Infirmary plan A, the sunken garden: the road from the academy's main gate comes straight down the well's axis and
drops by a stair into a garden set 2.5 m below it. The caged well stands at the centre; brass conduits run out from it
to the greenhouse, the stills, the cots on a raised terrace under tents, and a sunken bath. You leave up a stair on the
east side, back onto the road to the battery."""
import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from plan import *

P = Plan('inf-a', 'Infirmary A: the sunken garden', U=(-50, 55), V=(-42, 40))
W0 = (0, 4)                                   # the well
P.fill(rect(-50, -42, 55, 40), 2.5, 'grass')
for c, r in [((-44, -34), 7), ((46, 30), 8), ((-44, 30), 7), ((40, -36), 6)]:
    P.fill(circle(c, r), 2.5, 'trees')
P.fill(rect(-36, -18, 36, 30), 0.0, 'paving')                                  # the garden, set down
P.fill(rect(-3, -42, 3, -18), 2.5, 'path')                                    # the road in from the main gate
P.stairs(rect(-5, -26, 5, -18), 2.5, 0.0, 'V')                                # the stair down, on the well's axis
P.fill(circle(W0, 7), 0.5, 'plaza'); P.fill(circle(W0, 3), 0.5, 'dais')        # the well's round apron
for c in ((-24, -8), (-24, 18), (22, 20)):                                    # the conduits, out to what the well feeds
    P.strip([W0, c], 2, 'wood')
P.strip([W0, (22, -6)], 2, 'wood')
P.building(rect(-34, -16, -16, -2), 0.0, 6.0, 'greenhouse', doors=[(-25, -0.5)])
P.building(rect(-34, 14, -22, 26), 0.0, 5.0, 'stills', doors=[(-21, 20)])
P.fill(rect(12, -16, 34, 4), 1.0, 'plaza')                                    # the cots' terrace, a metre up
P.stairs(rect(8, -10, 12, -2), 0.0, 1.0, 'U')
for x, y in ((16, -12), (26, -12), (16, -2), (26, -2)):
    P.building(rect(x - 3, y - 2, x + 3, y + 1), 1.0, 2.5, '', roof='roof')    # the tents
P.note((22, -16), 'cots under tents')
P.fill(circle((22, 20), 7), -1.5, 'water'); P.fill(arc_band((22, 20), 7, 9, 0, 360), 0.0, 'paving')   # the sunken bath
P.stairs(rect(36, -10, 44, -2), 0.0, 2.5, 'U')                                # the stair up to the road, east
P.fill(rect(44, -10, 55, -2), 2.5, 'path')
P.landmark(W0, 'the well', 6, 3)
P.gate((0, -40), 'from the main gate'); P.gate((53, -6), 'to the battery')
P.journey([(0, -40), (0, -24), (0, -6)], 'In from the main gate, down the axis', 'The well choked in vines, dead ahead')
P.journey([(0, -6), (-12, -4), (-20, -6), (-12, 8), (-20, 16), (8, 12), (18, 18), (10, -2), (0, -4)], 'The fix: along the conduits', 'Cut the vines; the well relights one conduit at a time')
P.journey([(6, -6), (10, -6), (20, -7), (24, 0)], 'The cots', 'Heal the wounded under the tents')
P.journey([(24, -6), (34, -6), (40, -6), (53, -6)], 'Out to the battery', 'Up the east stair, the battery ahead')
P.render()
if "--frames" in sys.argv: P.frames()
