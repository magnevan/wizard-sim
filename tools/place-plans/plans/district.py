"""The opening's district: the space diagram of the stops and the walks between them (stage 3 of the segment), drawn with
the place-plan tool at district scale. Each stop is a node; each walk (A to G, from
docs/explorations/2026-11-22-weapons-yard-and-walks.md) is a road drawn in the journey's order, and its length is
printed in units, screens (30 u) and seconds (4.2 u/s). The courtyard's exits are as the user approved (2026-11-22):
the battery's bridge is the main gate, the north road leads to the ward line, the stream path to the gorge, the sea
landing to the cliff road. Positions are a proposal, shaped by the district concept art."""
import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from plan import *

P = Plan('district', 'The opening: the district and its walks', U=(-115, 225), V=(-150, 175))
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

FIGHTS = {'D': (63, -52), 'E': (108, 0), 'F': (120, 125)}   # where on each walk its small fight happens
total = 0.0
print('walk  from -> to                 units  screens  seconds  fight')
for wid, a, b, pts, fight in WALKS:
    L = sum(math.dist(p, q) for p, q in zip(pts, pts[1:])); total += L
    print(f'{wid:4}  {a + " -> " + b:26} {L:6.0f}  {L / 30:6.1f}  {L / 4.2:7.0f}  {fight or "-"}')
    P.journey(pts, f'Walk {wid}: {a} to {b}, {L:.0f} u, {L / 30:.1f} screens, {L / 4.2:.0f} s', f'Small fight: {fight}' if fight else 'No fight')
print(f'all walks: {total:.0f} u, {total / 4.2 / 60:.1f} minutes')
P.render()

# the walks map: drawn here, thick and large, over the plan from above: every walk numbered in order, arrowed in its
# walking direction, nudged apart where walks share a road; the stops named large; the fights marked; a legend
from PIL import Image, ImageDraw
from plan import PASS_COL
k = 7
base = P.draw(squash=1.0, zs=0.0, k=k, plan=True, overlays=False); Pp = P._P
d = ImageDraw.Draw(base)
n_all = len(WALKS)
for n, (wid, a, b, pts, fight) in enumerate(WALKS):
    col = PASS_COL[n % len(PASS_COL)]; off = (n - (n_all - 1) / 2) * 2.2
    xy = []
    for i2, (u, v) in enumerate(pts):
        p0, p1 = pts[max(i2 - 1, 0)], pts[min(i2 + 1, len(pts) - 1)]
        L = math.dist(p0, p1) or 1; nu, nv = -(p1[1] - p0[1]) / L, (p1[0] - p0[0]) / L
        xy.append(Pp(u + nu * off, v + nv * off, 0))
    d.line(xy, fill=(0, 0, 0), width=14); d.line(xy, fill=col, width=9)
    for (x0, y0), (x1, y1) in zip(xy, xy[1:]):
        L = math.hypot(x1 - x0, y1 - y0)
        if L < 60: continue
        ux, uy = (x1 - x0) / L, (y1 - y0) / L; mx, my = x0 + (x1 - x0) * 0.55, y0 + (y1 - y0) * 0.55
        d.polygon([(mx + ux * 18, my + uy * 18), (mx - ux * 12 - uy * 14, my - uy * 12 + ux * 14), (mx - ux * 12 + uy * 14, my - uy * 12 - ux * 14)], fill=col, outline=(0, 0, 0), width=2)
    mid = xy[len(xy) // 2]
    d.ellipse([mid[0] - 22, mid[1] - 22, mid[0] + 22, mid[1] + 22], fill=col, outline=(0, 0, 0), width=3)
    d.text((mid[0] - 10, mid[1] - 19), wid, font=font(30), fill=(0, 0, 0))
for name, (c, h) in STOPS.items():
    x, y = Pp(c[0], c[1], 0); label(d, (x - len(name) * 9, y - 74), name, font(36), (255, 250, 235))
for wid, a, b, pts, fight in WALKS:
    if not fight: continue
    x, y = Pp(*FIGHTS[wid], 0)
    d.ellipse([x - 24, y - 24, x + 24, y + 24], fill=(220, 40, 40), outline=(255, 255, 255), width=4)
    d.line([(x - 11, y - 11), (x + 11, y + 11)], fill=(255, 255, 255), width=6); d.line([(x - 11, y + 11), (x + 11, y - 11)], fill=(255, 255, 255), width=6)
    label(d, (x + 32, y - 16), f'fight: {fight}', font(28), (255, 210, 210))
# the legend
rows = []
for n, (wid, a, b, pts, fight) in enumerate(WALKS):
    L = sum(math.dist(p0, p1) for p0, p1 in zip(pts, pts[1:]))
    rows.append((PASS_COL[n % len(PASS_COL)], f'{wid}  {a} to {b}', f'{L / 30:.1f} screens, {L / 4.2:.0f} s' + (f'  |  fight: {fight}' if fight else '')))
H = 60 + 46 * len(rows)
out = Image.new('RGB', (base.width, base.height + H), (18, 20, 28)); out.paste(base, (0, 0)); od = ImageDraw.Draw(out)
y = base.height + 20
for col, t1, t2 in rows:
    od.rectangle([24, y + 6, 52, y + 34], fill=col, outline=(0, 0, 0)); od.text((66, y), t1, font=font(30), fill=(240, 240, 240))
    od.text((560, y + 4), t2, font=font(26), fill=(200, 196, 188)); y += 46
od.text((24, base.height - 6 + H - 34), f'All seven walks: {total:.0f} u, {total / 4.2 / 60:.1f} minutes. The academy stands on a 6 m plateau; the coast and the harbor lie below.', font=font(24), fill=(200, 196, 188))
od.text((20, 14), 'The opening: the district and its walks, in the order you walk them', font=font(34), fill=(240, 230, 210))
out.save(os.path.join(OUT, 'district-walks.png'))
print('walks map:', out.size)
