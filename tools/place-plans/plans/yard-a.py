"""Drill yard plan A, the gallery: the academy's ranges on the far sides (north and west); a raised path (the gallery, at
the courtyard's 6 m) runs along their foot round three sides of a drill ground sunk 3 m, where the soldiers drill. The
stations stand along the gallery in order, each in its own bay; the armoury and its rack at the far corner; a straight
stair from there drops to the drill ground, and its east side climbs back to the courtyard's gate."""
import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from plan import *

P = Plan('yard-a', 'Drill yard A: the gallery', U=(-55, 60), V=(-45, 45))
P.fill(rect(-55, -45, 60, 45), 6.0, 'grass')
P.building(rect(-55, -45, 60, -30), 6.0, 16.0, 'great hall')                  # the range along the north
P.building(rect(-55, -30, -42, 45), 6.0, 14.0, 'workshops')                   # and the west
P.fill(rect(-42, -30, 50, -18), 6.0, 'paving')                               # the gallery, north side
P.fill(rect(-42, -18, -30, 40), 6.0, 'paving')                               # and west side
P.fill(rect(-30, 28, 40, 40), 6.0, 'paving')                                 # and south side
P.fill(rect(-30, -18, 40, 28), 3.0, 'path')                                  # the drill ground, sunk 3 m
P.fill(rect(50, -30, 60, -18), 6.0, 'path')                                  # in from the courtyard's gate
# the stations, in order along the gallery (each a bay at the range's foot)
for i, (u, v, nm) in enumerate([(30, -26, 'strike lanes'), (8, -25, 'heavy: the sack'), (-14, -25, 'retreat: the mallet'),
                                (-36, -6, 'parry lane'), (-36, 18, 'hands ring')]):
    P.fill(circle((u, v), 4), 6.0, 'sand'); P.note((u, v - 5), f'{i + 1}. {nm}')
P.building(rect(-30, 40, -12, 45), 6.0, 12.0, 'armoury', doors=[(-21, 39)])
P.landmark((-21, 36), 'the rack', 3, 1.5)
P.stairs(rect(-10, 18, 0, 28), 3.0, 6.0, 'V')                                # down to the drill ground from the south gallery
P.stairs(rect(32, 4, 42, 14), 3.0, 6.0, 'U')                                 # and up its east side
P.fill(rect(42, -18, 50, 40), 6.0, 'paving')                                 # the east gallery, back to the gate
for u in (-20, -5, 10, 25):                                                  # the soldiers drilling
    P.note((u, 4), 'soldiers')
P.gate((58, -24), 'to the courtyard')
P.journey([(58, -24), (40, -24), (30, -24)], 'In from the courtyard', 'The yard spread out below: soldiers drilling, the armoury’s glow at the far corner')
P.journey([(30, -24), (8, -23), (-14, -23), (-36, -20), (-36, -6), (-36, 18), (-36, 34)], 'The stations in order', 'Each seen from the gallery before you enter it')
P.journey([(-36, 34), (-21, 36)], 'The rack at the armoury door', 'The focus: the flame sword')
P.journey([(-21, 34), (-5, 32), (-5, 16), (10, 9), (30, 9), (44, 9), (46, -10), (46, -22), (58, -24)], 'Back out to the courtyard', 'Across the drill ground among the soldiers, up the east side to the gate')
from finish import lips
lips(P)
P.render()
if "--frames" in sys.argv: P.frames()
