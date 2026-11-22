"""Infirmary control: the concept art taken literally (a flat walled rectangle, the well in the middle), shown blind to
the structure critic as its calibration. It should score low."""
import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from plan import *

P = Plan('inf-ctrl', 'Infirmary: control', U=(-50, 55), V=(-42, 40))
W0 = (0, 2)
P.fill(rect(-50, -42, 55, 40), 0.0, 'grass')
P.fill(rect(-40, -30, 44, 32), 0.0, 'paving')
wall = P.mask(rect(-42, -32, 46, 34)) & ~P.mask(rect(-40, -30, 44, 32))
P.building(wall, 0.0, 3.0, roof='wall')
P.fill(rect(-3, -42, 3, -29), 0.0, 'path'); P.fill(rect(-3, 31, 3, 40), 0.0, 'path')
P.fill(circle(W0, 6), 0.5, 'dais')
P.building(rect(-34, -24, -18, -12), 0.0, 6.0, 'greenhouse')
P.building(rect(-34, 14, -22, 26), 0.0, 5.0, 'stills')
for x, y in ((20, -20), (32, -20), (20, -8), (32, -8)):
    P.building(rect(x - 3, y - 2, x + 3, y + 1), 0.0, 2.5, roof='roof')
P.fill(circle((28, 20), 6), -1.5, 'water')
P.landmark(W0, 'the well', 6, 3)
P.gate((0, -40), 'from the main gate'); P.gate((0, 38), 'to the battery')
P.render()
