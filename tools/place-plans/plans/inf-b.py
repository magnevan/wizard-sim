"""Infirmary plan B, the slope: the infirmary steps down a hillside below the road, in three terraces facing the camera.
The road comes down from the main gate onto the top terrace, where the cots line up under tents: the wounded are the first
thing you see. The well stands on the middle terrace with its conduits running up and down the slope; the greenhouse
and a bath sit at the bottom by a stream. You leave along the top terrace's east end to the battery."""
import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from plan import *

P = Plan('inf-b', 'Infirmary B: the slope', U=(-50, 55), V=(-42, 44))
W0 = (0, 6)
P.fill(rect(-50, -42, 55, 44), 6.0, 'grass')
P.fill(rect(-42, -14, 46, 44), 3.0, 'grass')                     # the middle terrace
P.fill(rect(-42, 18, 46, 44), 0.0, 'grass')                      # the bottom terrace
P.fill([(-50, 36), (55, 30), (55, 44), (-50, 44)], -1.0, 'water')  # the stream
P.fill(rect(-36, -24, 40, -14), 6.0, 'paving')                   # the top terrace's walk
P.fill(rect(-3, -42, 3, -24), 6.0, 'path')                       # the road in, on the axis
P.fill(rect(40, -24, 55, -16), 6.0, 'path')                      # the road on to the battery
for x in (-28, -16, 16, 28):                                     # the cots under tents, along the top terrace
    P.building(rect(x - 4, -30, x + 4, -26), 6.0, 2.5, roof='roof')
P.note((0, -32), 'cots under tents')
P.stairs(rect(-6, -14, 6, -5), 6.0, 3.0, 'V')                    # down to the well's terrace, on the axis
P.fill(rect(-30, -5, 34, 18), 3.0, 'paving')
P.fill(circle(W0, 7), 3.5, 'plaza'); P.fill(circle(W0, 3), 3.5, 'dais')
P.building(rect(-30, -2, -18, 10), 3.0, 5.0, 'stills', doors=[(-17, 4)])
P.stairs(rect(20, 18, 28, 27), 3.0, 0.0, 'V')                    # down to the bottom terrace
P.stairs(rect(-24, 18, -16, 27), 3.0, 0.0, 'V')
P.building(rect(-40, 27, -26, 36), 0.0, 6.0, 'greenhouse', doors=[(-25, 31)])
P.fill(circle((30, 32), 4), -0.5, 'water'); P.fill(arc_band((30, 32), 4, 6, 0, 360), 0.0, 'paving')
for c in ((0, -20), (-24, 4), (-20, 26), (24, 26)):              # the conduits, up to the cots and down to the garden
    P.strip([W0, c], 2, 'wood')
P.landmark(W0, 'the well', 6, 3)
P.gate((0, -40), 'from the main gate'); P.gate((53, -20), 'to the battery')
P.journey([(0, -40), (0, -26), (0, -10), (0, -2)], 'In from the main gate, past the cots, down to the well', 'The wounded first, then the choked well below')
P.journey([(0, -2), (-14, 4), (-22, 14), (-20, 24), (-10, 14), (10, 14), (22, 24), (12, 8), (0, -2)], 'The fix: along the conduits, down the slope and back', 'Cut the vines; the well relights')
P.journey([(0, -10), (0, -20), (-22, -22), (22, -22)], 'Up to the cots', 'Heal the wounded along the terrace')
P.journey([(22, -22), (40, -20), (53, -20)], 'Out to the battery', 'Along the top terrace, the battery ahead')
P.render()
if "--frames" in sys.argv: P.frames()
