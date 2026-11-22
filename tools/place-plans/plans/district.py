"""The opening's district: the space diagram of the stops and the walks between them (stage 3 of the segment), drawn with
the place-plan tool at district scale. Each stop is a node; each walk (A to G, from
docs/explorations/2026-11-22-weapons-yard-and-walks.md) is a road drawn in the journey's order, and its length is
printed in units, screens (30 u) and seconds (4.2 u/s). The courtyard's exits are as the user approved (2026-11-22):
the battery's bridge is the main gate, the north road leads to the ward line, the stream path to the gorge, the sea
landing to the cliff road. Positions are a proposal, shaped by the district concept art."""
import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from plan import *

P = Plan('district', 'The opening: the district and its walks', U=(-170, 260), V=(-230, 230))
P.fill(rect(-170, -230, 260, 230), 0.0, 'grass')
P.fill([(-170, 120), (40, 110), (120, 150), (260, 120), (260, 230), (-170, 230)], -9.0, 'deep')      # the sea, south
P.fill([(60, -230), (72, -230), (70, -40), (64, 60), (56, 120), (44, 120), (52, 60), (58, -40)], -4.0, 'water')   # the river and gorge
P.fill(circle((0, 0), 70), 6.0, 'grass')                          # the academy's plateau
for c, r in [((-120, -150), 30), ((150, -170), 35), ((-130, 40), 25), ((200, 20), 25)]:
    P.fill(circle(c, r), 0.0, 'trees')

STOPS = {
    'courtyard': ((0, 0), 6.0), 'drill yard': ((-80, -10), 6.0), 'infirmary': ((95, 20), 2.0), 'battery': ((190, 80), 0.0),
    'ward line': ((0, -115), 3.0), 'waterworks': ((85, -95), -2.0), 'harbor': ((170, 150), -5.0), 'cliff road': ((60, 110), -2.0),
}
for name, (c, h) in STOPS.items():
    P.fill(circle(c, 12 if name != 'courtyard' else 22), h, 'plaza')
    P.note((c[0], c[1] - 16), name)
P.landmark((0, 0), 'the armillary', 10, 3)

WALKS = [   # (id, from, to, the road's points, a small fight on it?)
    ('A', 'drill yard', 'infirmary', [(-80, -10), (-30, -6), (0, -14), (34, -20), (60, 0), (95, 20)], None),
    ('B', 'infirmary', 'battery', [(95, 20), (130, 30), (160, 64), (190, 80)], None),
    ('C', 'battery', 'ward line', [(190, 80), (160, 64), (130, 30), (95, 20), (60, 0), (34, -20), (0, -14), (0, -60), (0, -115)], None),
    ('D', 'ward line', 'waterworks', [(0, -115), (0, -60), (0, -14), (34, -20), (60, -40), (66, -70), (85, -95)], 'rift wolves at the gorge bridge'),
    ('E', 'waterworks', 'harbor', [(85, -95), (100, -40), (110, 20), (140, 100), (170, 150)], 'wolves and gorse imps on the river path'),
    ('F', 'harbor', 'cliff road', [(170, 150), (130, 128), (90, 118), (60, 110)], 'brine crabs on the harbor stairs'),
    ('G', 'cliff road', 'courtyard', [(60, 110), (30, 100), (0, 80), (0, 40), (0, 0)], None),
]
for wid, a, b, pts, fight in WALKS:
    P.strip(pts, 4, 'path')
    P.route(pts, 'main' if fight else 'side')
    if fight:
        m = pts[len(pts) // 2]; P.note((m[0] + 10, m[1]), f'{wid}: fight')
    else:
        m = pts[len(pts) // 2]; P.note((m[0] + 8, m[1]), wid)

if __name__ == '__main__' or True:
    total = 0.0
    print('walk  from -> to                 units  screens  seconds  fight')
    for wid, a, b, pts, fight in WALKS:
        L = sum(math.dist(p, q) for p, q in zip(pts, pts[1:])); total += L
        print(f'{wid:4}  {a + " -> " + b:26} {L:6.0f}  {L / 30:6.1f}  {L / 4.2:7.0f}  {fight or "-"}')
    print(f'all walks: {total:.0f} u, {total / 4.2 / 60:.1f} minutes')
P.render()
