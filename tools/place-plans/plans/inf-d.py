"""Infirmary plan D (the structure critic's mix: B, the slope, as the base, with C's conduits as raised walkways),
compressed to about two screens by two. The road from the main gate arrives on the well's axis at the top tier, where the
cots stand under tents with patients and nurses, their equipment gone dark: the wounded are the first thing you see. One short flight drops to the well's tier; the
conduits are raised walkways from the well to the greenhouse, the stills and down to the bath on the shore, so cutting
the vines has its own route. The tents' equipment lights up when the well does; the cots are open from the start (the user). The battery
road leaves the top tier's east end and bends down the screen past a flight, the battery's smokestack in view."""
import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from plan import *

P = Plan('inf-d', 'Infirmary D: the slope with raised conduits', U=(-38, 56), V=(-32, 28))
W0 = (0, 2)
P.fill(rect(-38, -32, 56, 28), 5.0, 'grass')
P.fill(rect(-32, -8, 46, 28), 2.0, 'grass')                       # the well's tier
P.fill(rect(-32, 12, 46, 28), 0.0, 'sand')                        # the shore strip
P.fill([(-38, 18), (56, 16), (56, 28), (-38, 28)], -1.0, 'water')  # the sea
P.fill(rect(-28, -20, 28, -8), 5.0, 'paving')                     # the top tier: the road's terrace
P.fill(rect(-3, -32, 3, -20), 5.0, 'path')                        # the road in, on the axis
for x in (-20, -10, 10, 20):                                      # the cots under tents, open; their equipment dark until the well relights
    P.building(rect(x - 3.5, -19, x + 3.5, -15), 5.0, 2.5, roof='roof')
P.note((0, -22), 'cots under tents')
P.stairs(rect(-5, -9, 5, 0), 5.0, 2.0, 'V')                       # one short flight down to the well, on its axis
P.fill(rect(-28, 0, 40, 12), 2.0, 'paving')
P.fill(circle(W0, 5), 2.5, 'dais')
P.building(rect(-28, -6, -16, 4), 2.0, 6.0, 'greenhouse', doors=[(-15, 0)])
P.building(rect(16, -6, 26, 2), 2.0, 5.0, 'stills', doors=[(15, -2)])
for a, b in (((-5, 2), (-15, 1)), ((5, 1), (14, -1))):            # the conduits, raised walkways to what the well feeds
    L = math.dist(a, b); P.fill(orect(((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), 3, L + 1, math.atan2(b[1] - a[1], b[0] - a[0])), 2.5, 'wood')
P.fill(rect(-1.5, 7, 1.5, 12), 2.5, 'wood')                       # and down to the bath
P.stairs(rect(-3, 12, 3, 18), 2.0, 0.0, 'V')
P.fill(circle((0, 22), 3), -0.5, 'water'); P.fill(arc_band((0, 22), 3, 4.5, 0, 360), 0.0, 'paving')   # the bath on the shore
# the battery road: from the top tier's east end, down a flight, then bending down the screen
P.fill(rect(28, -20, 38, -12), 5.0, 'path')
P.stairs(rect(32, -12, 38, -3), 5.0, 2.0, 'V')
P.fill(rect(32, -3, 38, 12), 2.0, 'path'); P.fill(rect(38, 6, 56, 12), 2.0, 'path')
P.building(circle((50, -2), 3), 2.0, 14.0, "the battery's smoke")
P.landmark(W0, 'the well', 6, 3)
P.gate((0, -30), 'from the main gate'); P.gate((54, 9), 'to the battery')
P.journey([(0, -30), (0, -14), (0, -4), (0, -1)], 'In from the main gate: the cots, then down to the well', 'The wounded and their nurses first, the equipment dark, then the choked well below')
P.journey([(0, 0), (-8, 2), (-14, 1), (-8, 2), (0, 4), (8, 1), (14, -1), (8, 1), (0, 6), (0, 10), (0, 16), (0, 8)], 'The fix: along the raised conduits', 'Cut the vines; the well relights; Life spills into you')
P.journey([(0, -1), (0, -12), (-15, -13), (15, -13), (24, -13)], 'Up to the cots, the equipment lit', 'Heal the wounded along the terrace')
P.journey([(24, -13), (34, -14), (35, -6), (35, 4), (44, 9), (54, 9)], 'Out to the battery', 'Down the east flight, the battery’s smoke ahead')
P.render()
if "--frames" in sys.argv: P.frames()
