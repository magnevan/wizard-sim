"""Compile a kit layout (tools/kit/layouts/*.py) into made-piece instances, and check it.

  python tools/kit/compile.py patch-a [out.json]

The layout gives a terrace per grid corner. Each cell takes the piece for its four corners (marching squares): a
straight edge where two neighbouring corners are higher, a 45-degree chamfer where one or three are. Edges are chained
into runs; a joint (pier, newel, pilaster) stands at every vertex of a run, turned to the bisector of its two sections,
and a run that stops (at a flight's head, at a curve) ends in a newel. Flights, curves, doors and vignettes are named
in the layout and placed by rule. The validators refuse a layout that would show a broken join:
  saddle cells (two opposite corners high: ambiguous), a flight that doesn't land, a curve whose ends aren't on its
  terrace's edge, a drop over 1 m left unguarded unless the terrace says 'open', a vignette off flat ground or in a
  flight's landing, ground no flight reaches, an instance that doesn't fit its piece in kit.json.
Output (u, metres for heights): {G, floors, instances, report}; the greybox page draws it (game/.../lab/kit3d.ts).
"""
import json, math, os, runpy, sys
from shapely.geometry import Polygon, Point, LineString
from shapely.ops import unary_union

HERE = os.path.dirname(os.path.abspath(__file__))
KIT = json.load(open(os.path.join(HERE, 'kit.json'), encoding='utf-8'))
RISE, GOING = 0.15, 0.5          # m per step, u per tread (kit.json connector.flight)
OUT = {'S': (0, 1), 'N': (0, -1), 'E': (1, 0), 'W': (-1, 0)}


def load(name):
    L = runpy.run_path(os.path.join(HERE, 'layouts', name + '.py'))
    rows = [r for r in L['CORNERS'].strip('\n').split('\n')]
    assert len({len(r) for r in rows}) == 1, 'every corner row must be the same length'
    return L, rows


def compile_layout(name, G_override=None):
    L, rows = load(name)
    G = G_override or L['G']; T = L['TERRACES']
    ny, nx = len(rows) - 1, len(rows[0]) - 1          # cells
    errs, warns = [], []
    for i, r in enumerate(rows):
        for j, ch in enumerate(r):
            if ch not in T: errs.append(f'corner ({j},{i}) is {ch!r}, not a terrace in TERRACES')
    if errs: return dict(errors=errs)
    order = sorted(T, key=lambda c: (T[c]['h'], c))   # terraces by height: a cell's levels
    rank = {c: k for k, c in enumerate(order)}

    # ---- marching squares, per cell and per level ----
    floors = {c: [] for c in T}
    segs = []        # (a, b, upper terrace, lower height): a->b with the higher side on the left
    for i in range(ny):
        for j in range(nx):
            cs = [rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]]       # TL TR BR BL
            P = [(j, i), (j + 1, i), (j + 1, i + 1), (j, i + 1)]
            M = [(j + .5, i), (j + 1, i + .5), (j + .5, i + 1), (j, i + .5)]            # mids T R B L
            ks = sorted({rank[c] for c in cs})
            polys = {}
            for k in ks:
                inside = [rank[c] >= k for c in cs]
                if inside == [True, False, True, False] or inside == [False, True, False, True]:
                    errs.append(f'cell ({j},{i}) has two opposite corners on {order[k]!r} and two not: ambiguous; change one corner')
                    continue
                pts = []
                for q in range(4):
                    if inside[q]: pts.append(P[q])
                    if inside[q] != inside[(q + 1) % 4]: pts.append(M[q])
                polys[k] = Polygon(pts)
                if k != ks[0] and not all(inside):
                    # the boundary: the two mids where inside changes, oriented with the inside on the left
                    ms = [q for q in range(4) if inside[q] != inside[(q + 1) % 4]]
                    a, b = M[ms[0]], M[ms[1]]
                    if not inside[ms[0]]: pass
                    # orient: inside to the left of a->b (y down, so left = cross < 0 with y down?) -> fix by test point
                    cen = polys[k].centroid
                    cross = (b[0] - a[0]) * (cen.y - a[1]) - (b[1] - a[1]) * (cen.x - a[0])
                    if cross > 0: a, b = b, a
                    lower = max(T[c]['h'] for c, ins in zip(cs, inside) if not ins)
                    segs.append([a, b, order[k], lower])
            for n, k in enumerate(ks):
                p = polys.get(k)
                if p is None: continue
                for k2 in ks[n + 1:]:
                    if k2 in polys: p = p.difference(polys[k2])
                if not p.is_empty: floors[order[k]].append(p)
    if errs: return dict(errors=errs)

    on_seg = lambda pt, a, b: LineString([a, b]).distance(Point(pt)) < 1e-6
    ends_at = []     # vertices where a run must end in a newel

    # ---- flights: cut their heads out of the edge, check they land ----
    flights = []
    for f in L.get('FLIGHTS', []):
        (ax, ay), (bx, by) = f['head']; dx, dy = OUT[f['out']]
        top, bot = T[f['top']]['h'], T[f['bottom']]['h']
        n = round((top - bot) / RISE); length = n * GOING / G            # cells
        cut = [s for s in segs if s[2] == f['top'] and on_seg(s[0], (ax, ay), (bx, by)) and on_seg(s[1], (ax, ay), (bx, by))]
        width = math.hypot(bx - ax, by - ay)
        if abs(sum(math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1]) for s in cut) - width) > 1e-6:
            errs.append(f"{f['name']}: its head ({ax},{ay})-({bx},{by}) isn't all on {f['top']!r}'s edge"); continue
        for s in cut: segs.remove(s)
        ends_at += [(ax, ay), (bx, by)]
        # landings: one cell back from the head on the top terrace, one cell past the foot on the bottom
        def flat(x0, y0, x1, y1, ch, what):
            ok = all(rows[i][j] == ch for i in range(int(math.floor(min(y0, y1))), int(math.ceil(max(y0, y1))) + 1)
                     for j in range(int(math.floor(min(x0, x1))), int(math.ceil(max(x0, x1))) + 1) if 0 <= i <= ny and 0 <= j <= nx)
            if not ok: errs.append(f"{f['name']}: its {what} isn't clear {ch!r} ground")
        flat(ax - dx * 1.5, ay - dy * 1.5, bx - dx * 0.5, by - dy * 0.5, f['top'], 'top landing')
        fx, fy = ax + dx * length, ay + dy * length
        flat(fx + dx * 0.5, fy + dy * 0.5, bx + dx * (length + 1.5), by + dy * (length + 1.5), f['bottom'], 'bottom landing')
        flights.append(dict(f, a=(ax, ay), b=(bx, by), dx=dx, dy=dy, length=length, n=n, top_h=top, bot_h=bot))

    # ---- curves: a terrace bulging past its grid edge along a circle ----
    sweeps = []
    for c in L.get('CURVES', []):
        (cx, cy), r = c['centre'], c['r']; (ax, ay), (bx, by) = c['ends']; dx, dy = OUT[c['out']]
        cut = [s for s in segs if s[2] == c['terrace'] and on_seg(s[0], (ax, ay), (bx, by)) and on_seg(s[1], (ax, ay), (bx, by))]
        if abs(sum(math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1]) for s in cut) - math.hypot(bx - ax, by - ay)) > 1e-6:
            errs.append(f"{c['name']}: its ends aren't both on {c['terrace']!r}'s edge"); continue
        lower = min(s[3] for s in cut)
        for s in cut: segs.remove(s)
        a0 = math.atan2(ay - cy, ax - cx); a1 = math.atan2(by - cy, bx - cx)
        mid = math.atan2(dy, dx)
        # go from a to b through the 'out' side
        da = (a1 - a0) % (2 * math.pi)
        if abs(((a0 + da / 2) - mid + math.pi) % (2 * math.pi) - math.pi) > math.pi / 2: da -= 2 * math.pi
        arclen = abs(da) * r * G
        k = max(1, round(arclen / 2.0))
        pts = [(cx + r * math.cos(a0 + da * t / k), cy + r * math.sin(a0 + da * t / k)) for t in range(k + 1)]
        floors[c['terrace']].append(Polygon(pts))
        for p, q in zip(pts, pts[1:]):
            s = [p, q, c['terrace'], lower]
            cen = Point(cx, cy)
            cross = (q[0] - p[0]) * (cy - p[1]) - (q[1] - p[1]) * (cx - p[0])
            if cross > 0: s[0], s[1] = q, p
            s.append('sweep'); sweeps.append(s)
        # the plaza under the bastion is covered: take it out of the lower floors
        bulge = Polygon(pts)
        for ch in floors:
            if ch != c['terrace']: floors[ch] = [p.difference(bulge) for p in floors[ch]]
    if errs: return dict(errors=errs)

    # ---- edge treatment per segment ----
    def treat(s):
        up = T[s[2]]; drop = up['h'] - s[3]
        if up.get('edge') == 'wall': return 'wall'
        if drop <= 0.3: return 'kerb'
        if up.get('edge') == 'open': return 'open'
        if drop > 1.0 and up.get('edge') != 'parapet':
            errs.append(f"{up.get('name', s[2])}: a {drop:.1f} m drop at ({s[0][0]:.1f},{s[0][1]:.1f}) with edge {up.get('edge')!r}: guard it (parapet) or mark it 'open'")
        return up.get('edge', 'retain')
    allsegs = segs + sweeps
    for s in allsegs: s.insert(4, treat(s))   # s = [a, b, terrace, lower, treatment, ('sweep')]

    # ---- runs and joints ----
    key = lambda p: (round(p[0], 4), round(p[1], 4))
    at_vertex = {}
    for s in allsegs:
        for end in (0, 1): at_vertex.setdefault((key(s[end]), s[4], s[2]), []).append((s, end))
    joints = {}
    for (v, tr, ter), lst in at_vertex.items():
        if tr in ('kerb', 'open'): continue
        dirs = []
        for s, end in lst:
            o = s[1 - end]; dirs.append(math.atan2(o[1] - v[1], o[0] - v[0]))
        dead = len(lst) == 1 and 0 < v[0] < nx and 0 < v[1] < ny
        if dead and not any(key(e) == v for e in ends_at):
            errs.append(f"an edge run of {ter!r} stops at ({v[0]},{v[1]}) with nothing to end on")
        if len(dirs) == 2: rot = math.atan2(math.sin(dirs[0]) + math.sin(dirs[1]), math.cos(dirs[0]) + math.cos(dirs[1]))
        else: rot = dirs[0]
        piece = {'wall': 'joint.pilaster', 'parapet': 'joint.newel' if len(lst) == 1 else 'joint.pier', 'retain': None}.get(tr)
        straight_on = len(dirs) == 2 and abs(abs(dirs[0] - dirs[1]) - math.pi) < 1e-3
        if tr == 'wall' and straight_on and (round(v[0]) + round(v[1])) % 2: piece = None   # a pilaster every other bay, and at every corner
        if tr == 'retain' and len(dirs) == 2 and not straight_on: piece = 'joint.corner'   # a coping block over every turn, so copings never overlap bare
        if piece and v not in joints: joints[v] = dict(p=piece, x=v[0] * G, y=v[1] * G, h=T[ter]['h'], low=max(s[3] for s, _ in lst), rot=rot)
    # newels at flight heads that end a run
    for e in ends_at:
        v = key(e)
        if v in joints: joints[v]['p'] = 'joint.newel'

    # ---- instances ----
    inst = []
    doors = [d['at'] for d in L.get('DOORS', [])]
    win = 0
    for s in allsegs:
        (ax, ay), (bx, by), ter, lower, tr = s[:5]
        ln = math.hypot(bx - ax, by - ay)
        rot = math.atan2(by - ay, bx - ax)     # along the edge; the front (+n) is to its right (the lower side)
        if len(s) > 5: piece = f'sweep.{tr}' if tr in ('parapet', 'retain') else f'sweep.{tr}'
        else:
            shape = 'straight' if abs(ln - 1) < 1e-6 else 'chamfer'
            piece = f'edge.{tr}.{shape}'
            if tr == 'wall' and shape == 'straight':
                mid = ((ax + bx) / 2, (ay + by) / 2)
                if any(math.hypot(mid[0] - d[0], mid[1] - d[1]) < 0.01 for d in doors): piece = 'edge.wall.door'
        if tr == 'open': continue
        var = None
        if piece == 'edge.wall.straight': win += 1; var = 'window' if win % 2 else 'plain'
        inst.append(dict(p=piece, x=ax * G, y=ay * G, x2=bx * G, y2=by * G, h=T[ter]['h'], low=lower, rot=rot, len=ln * G, **({'v': var} if var else {})))
    inst += list(joints.values())
    for f in flights:
        inst.append(dict(p='connector.flight', x=f['a'][0] * G, y=f['a'][1] * G, x2=f['b'][0] * G, y2=f['b'][1] * G,
                         dx=f['dx'], dy=f['dy'], len=f['length'] * G, n=f['n'], h=f['top_h'], low=f['bot_h'], name=f['name']))

    # ---- vignettes: on flat ground, clear of flights and their landings ----
    fl_zones = []
    for f in flights:
        poly = Polygon([f['a'], f['b'], (f['b'][0] + f['dx'] * f['length'], f['b'][1] + f['dy'] * f['length']), (f['a'][0] + f['dx'] * f['length'], f['a'][1] + f['dy'] * f['length'])])
        fl_zones.append(poly.buffer(1.5, join_style='mitre'))   # the flight and a cell-and-a-half landing round it
    floor_u = {ch: unary_union(ps) for ch, ps in floors.items() if ps}
    for v in L.get('VIGNETTES', []):
        pc = KIT['pieces'][v['piece']]; fw, fd = pc['footprint']; dx, dy = OUT[v['front']]
        hw, hd = (fw / 2 / G, fd / 2 / G) if dy else (fd / 2 / G, fw / 2 / G)
        box = Polygon([(v['at'][0] - hw, v['at'][1] - hd), (v['at'][0] + hw, v['at'][1] - hd), (v['at'][0] + hw, v['at'][1] + hd), (v['at'][0] - hw, v['at'][1] + hd)])
        on = [ch for ch, u in floor_u.items() if u.buffer(1e-6).contains(box)]
        if not on: errs.append(f"{v['piece']} at {v['at']}: not wholly on one flat terrace"); continue
        if any(z.intersects(box) for z in fl_zones): errs.append(f"{v['piece']} at {v['at']}: in a flight or its landing")
        inst.append(dict(p=v['piece'], x=v['at'][0] * G, y=v['at'][1] * G, h=T[on[0]]['h'], rot=math.atan2(dy, dx)))

    # ---- reachability: cells by terrace, joined where steps are small, plus flights ----
    walk = {c for c in T if T[c].get('edge') != 'wall' and T[c].get('walk', True)}
    nodes = {c for c in walk if floors[c]}
    links = {c: set() for c in nodes}
    for s in segs:
        if s[4] == 'kerb':
            low = [c for c in nodes if abs(T[c]['h'] - s[3]) < 1e-6]
            for c in low: links[s[2]].add(c); links[c].add(s[2])
    for f in flights: links[f['top']].add(f['bottom']); links[f['bottom']].add(f['top'])
    for c in nodes:   # same height, no edge between: one walkable ground
        for d in nodes:
            if c != d and abs(T[c]['h'] - T[d]['h']) < 0.3: links[c].add(d)
    seen, todo = set(), [next(iter(sorted(nodes)))]
    while todo:
        c = todo.pop()
        if c in seen: continue
        seen.add(c); todo += list(links[c])
    for c in sorted(nodes - seen): errs.append(f"{T[c].get('name', c)} ({c!r}) can't be reached: no flight or small step joins it")

    # ---- the asset contract ----
    for it in inst:
        pc = KIT['pieces'].get(it['p'])
        if pc is None: errs.append(f"no piece {it['p']!r} in kit.json"); continue
        if 'len' in it and pc['class'] in ('edge',):
            if abs(it['len'] - pc['length'] * G / KIT['G']) > 1e-3: errs.append(f"{it['p']} at ({it['x']:.1f},{it['y']:.1f}) is {it['len']:.2f} u long, the piece {pc['length']}")
        if pc['class'] == 'sweep':
            lo, hi = pc['length']
            if not lo * G / KIT['G'] - 1e-3 <= it['len'] <= hi * G / KIT['G'] + 1e-3: errs.append(f"{it['p']} at ({it['x']:.1f},{it['y']:.1f}): {it['len']:.2f} u is outside the piece's range")

    out_floors = []
    for ch, ps in floors.items():
        if not ps: continue
        u = unary_union(ps).buffer(0)
        geoms = getattr(u, 'geoms', [u])
        polys = [[[[x * G, y * G] for x, y in g.exterior.coords]] + [[[x * G, y * G] for x, y in r.coords] for r in g.interiors] for g in geoms if g.area > 1e-6]
        out_floors.append(dict(t=ch, h=T[ch]['h'], mat=T[ch]['mat'], polys=polys))
    counts = {}
    for it in inst: counts[it['p']] = counts.get(it['p'], 0) + 1
    return dict(G=G, size=[nx * G, ny * G], floors=out_floors, instances=inst, errors=errs, pieces=counts)


def main():
    name = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, '..', '..', 'game', 'packages', 'client', 'src', 'lab', f'kit-{name}.json')
    r = compile_layout(name)
    if r['errors']:
        print(f'{name}: {len(r["errors"])} problem(s):'); [print('  -', e) for e in r['errors']]; sys.exit(1)
    json.dump(r, open(out, 'w', encoding='utf-8'), separators=(',', ':'))
    print(f'{name}: {len(r["instances"])} instances of {len(r["pieces"])} pieces, 0 problems -> {os.path.relpath(out)}')
    for p, n in sorted(r['pieces'].items()): print(f'  {n:4d} {p}')


if __name__ == '__main__':
    main()
