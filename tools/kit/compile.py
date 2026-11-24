"""Compile a kit scene (tools/kit/scenes/*.scene.json) into made-piece instances, and check it.

  python tools/kit/compile.py patch-b [out.json]      # a scene, or an old layout (tools/kit/layouts/*.py)

The scene gives a terrace per grid corner. Each cell takes the piece for its four corners (marching squares): a
straight edge where two neighbouring corners are higher, a 45-degree chamfer where one or three are. Edges are chained
into runs; a joint (pier, newel, pilaster) stands at every vertex of a run, turned to the bisector of its two sections,
and a run that stops (at a flight's head, at a curve) ends in a newel. Flights, curves, edge overrides (a door, a
window, a niche on one section) and vignettes are objects in the scene and placed by rule. The validators report a
scene that would show a broken join:
  saddle cells (two opposite corners high: ambiguous), a flight that doesn't land, a curve whose ends aren't on its
  terrace's edge, a drop over 1 m left unguarded unless the terrace says 'open', a vignette off flat ground or in a
  flight's landing, ground no flight reaches, an instance that doesn't fit its piece in kit.json.
A scene with errors still compiles as far as it can (the map editor shows the result with the errors on it).

Output (x, y and lengths in u, heights in metres): {G, size, floors, instances, findings, errors, warnings, pieces}.
  findings: [{code, severity, msg, at: [x, y] in corners or None, refs: [ids]}]; errors/warnings are their messages.
  instances: each names its source: src (the terrace, flight, curve or vignette id) and, for an edge section, e (its
  midpoint, in corners) and o (the id of an edge override on it, if any).
The greybox page (game/.../lab/kit3d.ts) and the map editor (game/.../editor/) draw it. Scene format: tools/kit/README.md.
"""
import json, math, os, re, runpy, sys
from shapely.geometry import Polygon, Point, LineString
from shapely.ops import unary_union

HERE = os.path.dirname(os.path.abspath(__file__))
KIT = json.load(open(os.path.join(HERE, 'kit.json'), encoding='utf-8'))
RISE, GOING = 0.15, 0.5          # m per step, u per tread (kit.json connector.flight)
OUT = {'S': (0, 1), 'N': (0, -1), 'E': (1, 0), 'W': (-1, 0)}
VARIANTS = {'wall': ('plain', 'window', 'door'), 'retain': ('plain', 'niche'), 'parapet': ('plain', 'niche')}


# ---- scenes: the data the editor and Claude edit; old .py layouts convert to them ----
def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower().replace('the ', '')).strip('-') or 'x'


def layout_to_scene(name):
    """An old Python layout as a scene dict (ids minted here, once)."""
    L = runpy.run_path(os.path.join(HERE, 'layouts', name + '.py'))
    rows = [r for r in L['CORNERS'].strip('\n').split('\n')]
    terraces, used = [], set()
    for g, t in L['TERRACES'].items():
        tid = 't-' + slug(t.get('name', g))
        while tid in used: tid += '-' + g.lower()
        used.add(tid)
        terraces.append(dict(id=tid, glyph=g, **t))
    tid_of = {t['glyph']: t['id'] for t in terraces}
    objs = []
    for n, f in enumerate(L.get('FLIGHTS', []), 1):
        objs.append(dict(id=f'f{n}', kind='flight', name=f['name'], head=[list(p) for p in f['head']]))
    for n, c in enumerate(L.get('CURVES', []), 1):
        objs.append(dict(id=f'c{n}', kind='curve', name=c['name'], terrace=tid_of[c['terrace']], centre=list(c['centre']),
                         r=c['r'], ends=[list(p) for p in c['ends']], out=c['out']))
    for n, d in enumerate(L.get('DOORS', []), 1):
        objs.append(dict(id=f'e{n}', kind='edge', name=d.get('name', 'a door'), at=list(d['at']), v='door'))
    for n, v in enumerate(L.get('VIGNETTES', []), 1):
        objs.append(dict(id=f'v{n}', kind='vignette', piece=v['piece'], at=list(v['at']), front=v['front']))
    return dict(schema=1, name=name, G=L['G'], terraces=terraces, corners=rows, objects=objs,
                notes=(L.get('__doc__') or '').strip())


def load_scene(name):
    p = os.path.join(HERE, 'scenes', name + '.scene.json')
    if os.path.exists(p): return json.load(open(p, encoding='utf-8'))
    return layout_to_scene(name)


def flight_frame(f, rows, T):
    """A flight's top and bottom glyphs and its direction, from the corners either side of its head (unless given)."""
    (ax, ay), (bx, by) = f['head']
    if 'top' in f and 'bottom' in f and 'out' in f: return f['top'], f['bottom'], f['out']
    try:
        if abs(ay - by) < 1e-9 and abs(ay % 1 - 0.5) < 1e-9:        # along a row: between corner rows r and r+1
            r, c = int(math.floor(ay)), int(math.floor((ax + bx) / 2))
            g1, g2 = rows[r][c], rows[r + 1][c]
            return (g1, g2, 'S') if T[g1]['h'] >= T[g2]['h'] else (g2, g1, 'N')
        if abs(ax - bx) < 1e-9 and abs(ax % 1 - 0.5) < 1e-9:        # along a column: between corner columns c and c+1
            c, r = int(math.floor(ax)), int(math.floor((ay + by) / 2))
            g1, g2 = rows[r][c], rows[r][c + 1]
            return (g1, g2, 'E') if T[g1]['h'] >= T[g2]['h'] else (g2, g1, 'W')
    except (IndexError, KeyError):
        pass
    return None


def compile_scene(sc):
    G = sc['G']; rows = sc['corners']
    T = {t['glyph']: t for t in sc['terraces']}
    gid = {t['glyph']: t['id'] for t in sc['terraces']}
    glyph_of = {t['id']: t['glyph'] for t in sc['terraces']}
    objs = sc.get('objects', [])
    kind = lambda k: [o for o in objs if o.get('kind') == k]
    label = lambda o: o.get('name') or o['id']
    findings = []

    def err(code, msg, at=None, refs=(), sev='error'):
        findings.append(dict(code=code, severity=sev, msg=msg, at=[round(at[0], 3), round(at[1], 3)] if at else None, refs=list(refs)))

    def result(**kw):
        errs = [f['msg'] for f in findings if f['severity'] == 'error']; warns = [f['msg'] for f in findings if f['severity'] != 'error']
        base = dict(G=G, size=[(len(rows[0]) - 1) * G, (len(rows) - 1) * G] if rows else [0, 0], floors=[], instances=[], pieces={})
        return dict(base, **kw, findings=findings, errors=errs, warnings=warns)

    if not rows or len({len(r) for r in rows}) != 1:
        err('rows', 'every corner row must be the same length'); return result()
    ny, nx = len(rows) - 1, len(rows[0]) - 1          # cells
    for i, r in enumerate(rows):
        for j, ch in enumerate(r):
            if ch not in T: err('glyph', f'corner ({j},{i}) is {ch!r}, not a terrace', (j, i))
    if findings: return result()
    order = sorted(T, key=lambda c: (T[c]['h'], c))   # terraces by height: a cell's levels
    rank = {c: k for k, c in enumerate(order)}

    # ---- marching squares, per cell and per level ----
    floors = {c: [] for c in T}
    segs = []        # (a, b, upper terrace, lower height): a->b with the higher side on the left
    low_of = {}      # a straight segment's lower terrace, by its ends
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
                    err('saddle', f'cell ({j},{i}) has two opposite corners on {order[k]!r} and two not: ambiguous; change one corner',
                        (j + .5, i + .5), [gid[order[k]]])
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
                    cen = polys[k].centroid
                    cross = (b[0] - a[0]) * (cen.y - a[1]) - (b[1] - a[1]) * (cen.x - a[0])
                    if cross > 0: a, b = b, a
                    lower = max(T[c]['h'] for c, ins in zip(cs, inside) if not ins)
                    low_of[(round(a[0], 4), round(a[1], 4), round(b[0], 4), round(b[1], 4))] = max((c for c, ins in zip(cs, inside) if not ins), key=lambda c: T[c]['h'])
                    segs.append([a, b, order[k], lower])
            for n, k in enumerate(ks):
                p = polys.get(k)
                if p is None: continue
                for k2 in ks[n + 1:]:
                    if k2 in polys: p = p.difference(polys[k2])
                if not p.is_empty: floors[order[k]].append(p)

    on_seg = lambda pt, a, b: LineString([a, b]).distance(Point(pt)) < 1e-6
    ends_at = []     # vertices where a run must end in a newel

    # ---- flights: cut their heads out of the edge, check they land ----
    flights = []
    for f in kind('flight'):
        (ax, ay), (bx, by) = f['head']; mid = ((ax + bx) / 2, (ay + by) / 2)
        fr = flight_frame(f, rows, T)
        if fr is None or fr[0] == fr[1]:
            err('flight-head', f"{label(f)}: its head ({ax},{ay})-({bx},{by}) isn't along an edge between two terraces", mid, [f['id']]); continue
        top_g, bot_g, out = fr
        dx, dy = OUT[out]
        top, bot = T[top_g]['h'], T[bot_g]['h']
        n = round((top - bot) / RISE); length = n * GOING / G            # cells
        cut = [s for s in segs if s[2] == top_g and on_seg(s[0], (ax, ay), (bx, by)) and on_seg(s[1], (ax, ay), (bx, by))]
        width = math.hypot(bx - ax, by - ay)
        if abs(sum(math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1]) for s in cut) - width) > 1e-6:
            err('flight-head', f"{label(f)}: its head ({ax},{ay})-({bx},{by}) isn't all on {top_g!r}'s edge", mid, [f['id']]); continue
        for s in cut: segs.remove(s)
        ends_at += [(ax, ay), (bx, by)]

        # landings: one cell back from the head on the top terrace, one cell past the foot on the bottom
        def flat(x0, y0, x1, y1, ch, what):
            ok = all(rows[i][j] == ch for i in range(int(math.floor(min(y0, y1))), int(math.ceil(max(y0, y1))) + 1)
                     for j in range(int(math.floor(min(x0, x1))), int(math.ceil(max(x0, x1))) + 1) if 0 <= i <= ny and 0 <= j <= nx)
            if not ok: err('flight-landing', f"{label(f)}: its {what} isn't clear {ch!r} ground", ((x0 + x1) / 2, (y0 + y1) / 2), [f['id']])
        flat(ax - dx * 1.5, ay - dy * 1.5, bx - dx * 0.5, by - dy * 0.5, top_g, 'top landing')
        fx, fy = ax + dx * length, ay + dy * length
        flat(fx + dx * 0.5, fy + dy * 0.5, bx + dx * (length + 1.5), by + dy * (length + 1.5), bot_g, 'bottom landing')
        flights.append(dict(f, name=label(f), top=top_g, bottom=bot_g, a=(ax, ay), b=(bx, by), dx=dx, dy=dy, length=length, n=n, top_h=top, bot_h=bot))

    # ---- curves: a terrace bulging past its grid edge along a circle ----
    sweeps = []
    for c in kind('curve'):
        tg = glyph_of.get(c['terrace'], c['terrace'])
        (cx, cy), r = c['centre'], c['r']; (ax, ay), (bx, by) = c['ends']; dx, dy = OUT[c['out']]
        cut = [s for s in segs if s[2] == tg and on_seg(s[0], (ax, ay), (bx, by)) and on_seg(s[1], (ax, ay), (bx, by))]
        if tg not in T or not cut or abs(sum(math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1]) for s in cut) - math.hypot(bx - ax, by - ay)) > 1e-6:
            err('curve-ends', f"{label(c)}: its ends aren't both on {tg!r}'s edge", (cx, cy), [c['id']]); continue
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
        floors[tg].append(Polygon(pts))
        for p, q in zip(pts, pts[1:]):
            s = [p, q, tg, lower]
            cross = (q[0] - p[0]) * (cy - p[1]) - (q[1] - p[1]) * (cx - p[0])
            if cross > 0: s[0], s[1] = q, p
            s.append(('sweep', c['id'])); sweeps.append(s)
        # the plaza under the bastion is covered: take it out of the lower floors
        bulge = Polygon(pts)
        for ch in floors:
            if ch != tg: floors[ch] = [p.difference(bulge) for p in floors[ch]]

    # ---- rounds: a true circle the grid's stepped edges stand in for; every edge along it is snapped onto the arc ----
    # {kind: round, centre, r, tol? (cells, default 0.75), terrace? (only its edges), from?/to? (degrees: 0 east, 90 south)}
    # Works whichever side is higher (convex or concave): the floors between the stepped edge and the arc change hands.
    from shapely.validation import make_valid
    from shapely.strtree import STRtree
    # lines: the same for a straight line at any angle ({kind: line, a: [x, y], b: [x, y], tol?, terrace?}), which the grid
    # can only draw as 45-degree zig-zags (pin p33: the middle terrace's radial end)
    rounds = kind('round') + kind('line')
    if rounds:   # every floor cell in one index: a round's pieces only touch the cells near its arc
        cells = [[g, f] for g in floors for f in floors[g]]
        tree = STRtree([f for _, f in cells])
    for rd in rounds:
        is_line = rd.get('kind') == 'line'
        tol = rd.get('tol', 0.75)
        only = glyph_of.get(rd.get('terrace'), rd.get('terrace'))
        if is_line:
            LA, LB = rd['a'], rd['b']; seg_ab = LineString([LA, LB]); cx, cy = (LA[0] + LB[0]) / 2, (LA[1] + LB[1]) / 2; r = 0
            ang_ok = lambda p: True
            near = lambda p: seg_ab.distance(Point(p)) <= tol
        else:
            (cx, cy), r = rd['centre'], rd['r']
            def ang_ok(p):
                if 'from' not in rd: return True
                a = math.degrees(math.atan2(p[1] - cy, p[0] - cx)) % 360; a0, a1 = rd['from'] % 360, rd['to'] % 360
                return (a0 <= a <= a1) if a0 <= a1 else (a >= a0 or a <= a1)
            near = lambda p: abs(math.hypot(p[0] - cx, p[1] - cy) - r) <= tol
        cand = [s for s in segs if (only is None or s[2] == only) and near(s[0]) and near(s[1]) and ang_ok(((s[0][0] + s[1][0]) / 2, (s[0][1] + s[1][1]) / 2))]
        if not cand:
            err('round', f"{label(rd)}: no edge lies along its {'line' if is_line else 'circle'}" + ('' if is_line else f" (centre {rd['centre']}, r {r})"), (cx, cy), [rd['id']], 'warning'); continue
        # chain them into runs, one per (upper terrace, lower height), in edge direction (higher side on the left)
        k4 = lambda p: (round(p[0], 4), round(p[1], 4))
        groups = {}
        for s in cand: groups.setdefault((s[2], s[3]), []).append(s)
        for (tg, lower), ss in groups.items():
            start = {k4(s[0]): s for s in ss}; ends = {k4(s[1]) for s in ss}
            used = set()
            heads = [s for s in ss if k4(s[0]) not in ends] or ss[:1]
            for h0 in heads:
                if id(h0) in used: continue
                chain, s = [], h0
                while s is not None and id(s) not in used:
                    used.add(id(s)); chain.append(s); s = start.get(k4(s[1]))
                pts = [chain[0][0]] + [c[1] for c in chain]
                if len(chain) < 3: continue      # a single step is fine as straight pieces
                for c in chain: segs.remove(c)
                # the arc through the run's angles, unwrapped along the chain
                angs = [math.atan2(p[1] - cy, p[0] - cx) for p in pts]
                for i in range(1, len(angs)):
                    while angs[i] - angs[i - 1] > math.pi: angs[i] -= 2 * math.pi
                    while angs[i] - angs[i - 1] < -math.pi: angs[i] += 2 * math.pi
                a0, a1 = angs[0], angs[-1]
                if is_line:     # straight from the run's first point to its last
                    (sx, sy), (ex, ey) = pts[0], pts[-1]
                    mk = lambda k: [pts[0]] + [(sx + (ex - sx) * t / k, sy + (ey - sy) * t / k) for t in range(1, k)] + [pts[-1]]
                    span = math.hypot(ex - sx, ey - sy)
                else:
                    mk = lambda k: [pts[0]] + [(cx + r * math.cos(a0 + (a1 - a0) * t / k), cy + r * math.sin(a0 + (a1 - a0) * t / k)) for t in range(1, k)] + [pts[-1]]
                    span = abs(a1 - a0) * r
                fits = lambda arc: all(1.4 <= math.hypot(b[0] - a[0], b[1] - a[1]) * G <= 2.6 for a, b in zip(arc, arc[1:]))
                k0 = max(1, round(span * G / 2.0))                       # sections of about 2 u; sweeps fit 1.4 to 2.6
                arc = next((mk(k) for k in sorted(range(max(1, k0 - 3), k0 + 4), key=lambda k: abs(k - k0)) if fits(mk(k))), mk(k0))
                # the ground between the stepped edge and the arc: on the higher side of the arc it's the upper terrace's
                z = make_valid(Polygon(pts + arc[::-1]))
                mid = len(arc) // 2; p, q = arc[mid - 1], arc[mid]
                ux, uy = q[0] - p[0], q[1] - p[1]
                up_inside = True if is_line else (ux * (cy - p[1]) - uy * (cx - p[0])) < 0      # the higher (left) side faces the centre
                lowg = [g for g in T if abs(T[g]['h'] - lower) < 1e-6]
                for piece in getattr(z, 'geoms', [z]):
                    if piece.geom_type != 'Polygon' or piece.area < 1e-9: continue
                    rp = piece.representative_point()
                    if is_line:     # on the line's higher (left) side: the compiler's edges keep the upper side at cross <= 0
                        inside = ((pts[-1][0] - pts[0][0]) * (rp.y - pts[0][1]) - (pts[-1][1] - pts[0][1]) * (rp.x - pts[0][0])) < 0
                    else:
                        inside = Point(cx, cy).distance(rp) < r
                    pb = piece.buffer(0.05)
                    near_i = [i for i in tree.query(pb) if cells[i][1].intersects(pb)]
                    if inside == up_inside: to = tg
                    else:
                        share = {g: sum(cells[i][1].intersection(pb).area for i in near_i if cells[i][0] == g) for g in lowg}
                        to = max(share, key=share.get) if share else None
                    for i in near_i:
                        if cells[i][1].intersects(piece): cells[i][1] = cells[i][1].difference(piece)
                    if to: cells.append([to, piece])     # not in the index: a later piece of the same arc never overlaps it
                lg = max(lowg, key=lambda g: sum(1 for c in chain if low_of.get((round(c[0][0], 4), round(c[0][1], 4), round(c[1][0], 4), round(c[1][1], 4))) == g)) if lowg else None
                for a, b in zip(arc, arc[1:]):
                    if lg: low_of[(round(a[0], 4), round(a[1], 4), round(b[0], 4), round(b[1], 4))] = lg
                    sweeps.append([a, b, tg, lower, ('sweep', rd['id'])])

    if rounds:
        floors = {g: [] for g in floors}
        for g, f in cells:
            if not f.is_empty: floors[g].append(f)

    # ---- edge treatment per segment ----
    def treat(s):
        up = T[s[2]]; drop = up['h'] - s[3]
        lo = T.get(low_of.get((round(s[0][0], 4), round(s[0][1], 4), round(s[1][0], 4), round(s[1][1], 4)), ''), {})
        if 0.3 < drop <= 1.0 and 'steps' in (up.get('edge'), lo.get('edge')) and up.get('walk', True) and lo.get('walk', True)                 and up.get('edge') != 'wall':
            return 'steps'                  # a short drop either side asks to step over: steps all along it
        if up.get('edge') == 'steps' and drop > 1.0: return 'parapet'
        if up.get('edge') == 'wall': return 'wall'
        if drop < 0.01: return 'open'      # two levels at one height (woods beside a lawn): a seam, no edge piece
        if drop <= 0.3: return 'kerb'
        if up.get('edge') == 'open': return 'open'
        if drop > 1.0 and up.get('edge') != 'parapet':
            err('unguarded', f"{up.get('name', s[2])}: a {drop:.1f} m drop at ({s[0][0]:.1f},{s[0][1]:.1f}) with edge {up.get('edge')!r}: guard it (parapet) or mark it 'open'",
                s[0], [gid[s[2]]])
        return up.get('edge', 'retain')
    allsegs = segs + sweeps
    for s in allsegs: s.insert(4, treat(s))   # s = [a, b, terrace, lower, treatment, (('sweep', curve id))]

    # ---- runs and joints ----
    key = lambda p: (round(p[0], 4), round(p[1], 4))
    at_vertex = {}
    for s in allsegs:
        for end in (0, 1): at_vertex.setdefault((key(s[end]), s[4], s[2]), []).append((s, end))
    joints = {}
    meets = {}   # every run touching a vertex, of any terrace: a run may end where another one goes on
    for s in allsegs:
        for end in (0, 1): meets[key(s[end])] = meets.get(key(s[end]), 0) + 1
    for (v, tr, ter), lst in at_vertex.items():
        if tr in ('kerb', 'open', 'steps'): continue
        dirs = []
        for s, end in lst:
            o = s[1 - end]; dirs.append(math.atan2(o[1] - v[1], o[0] - v[0]))
        dead = len(lst) == 1 and 0 < v[0] < nx and 0 < v[1] < ny
        if dead and meets.get(v, 0) < 2 and not any(key(e) == v for e in ends_at):
            err('run-end', f"an edge run of {ter!r} stops at ({v[0]},{v[1]}) with nothing to end on", v, [gid[ter]])
        if len(dirs) == 2: rot = math.atan2(math.sin(dirs[0]) + math.sin(dirs[1]), math.cos(dirs[0]) + math.cos(dirs[1]))
        else: rot = dirs[0]
        piece = {'wall': 'joint.pilaster', 'parapet': 'joint.newel' if len(lst) == 1 else 'joint.pier', 'retain': None}.get(tr)
        straight_on = len(dirs) == 2 and abs(abs(dirs[0] - dirs[1]) - math.pi) < 1e-3
        if tr == 'wall' and straight_on and (round(v[0]) + round(v[1])) % 2: piece = None   # a pilaster every other bay, and at every corner
        if tr == 'retain' and len(dirs) == 2 and not straight_on: piece = 'joint.corner'   # a coping block over every turn, so copings never overlap bare
        # where runs of two terraces meet, the post is the higher run's, so neither railing ends against a short post
        # (pin p25: a 6 m parapet started at the 5 m terrace's newel)
        if piece and (v not in joints or T[ter]['h'] > joints[v]['h']):
            joints[v] = dict(p=piece, x=v[0] * G, y=v[1] * G, h=T[ter]['h'], low=max(s[3] for s, _ in lst), rot=rot, src=gid[ter])
    # newels at flight heads that end a run
    for e in ends_at:
        v = key(e)
        if v in joints: joints[v]['p'] = 'joint.newel'

    # ---- instances ----
    inst = []
    overrides = {key(o['at']): o for o in kind('edge')}
    used_over = set()
    for s in allsegs:
        (ax, ay), (bx, by), ter, lower, tr = s[:5]
        if tr == 'open': continue
        ln = math.hypot(bx - ax, by - ay)
        rot = math.atan2(by - ay, bx - ax)     # along the edge; the front (+n) is to its right (the lower side)
        mid = ((ax + bx) / 2, (ay + by) / 2)
        over = overrides.get(key(mid))
        src = gid[ter]
        if len(s) > 5: piece = f'sweep.{tr}'; src = s[5][1]
        else: piece = f"edge.{tr}.{'straight' if abs(ln - 1) < 1e-6 else 'chamfer'}"
        var = None
        if piece == 'edge.wall.straight':
            var = 'window' if (math.floor(mid[0]) + math.floor(mid[1])) % 2 == 0 else 'plain'     # by position, so an edit elsewhere never flips it
        # a niche in a tall retaining wall: every third straight section of a long run, never next to a flight's head
        if piece in ('edge.retain.straight', 'edge.parapet.straight') and T[ter]['h'] - lower >= 2.0 and (round(ax) + round(ay)) % 3 == 0 \
                and all(math.hypot(mid[0] - e[0], mid[1] - e[1]) > 2.0 for e in ends_at) \
                and any(abs(t['h'] - lower) < 1e-6 and t.get('walk', True) and t.get('edge') != 'wall' for t in T.values()):   # seen from ground people walk on
            var = 'niche'
        if over:
            used_over.add(over['id'])
            v = over.get('v', 'plain')
            if piece.startswith('edge.') and piece.endswith('.straight') and v in VARIANTS.get(tr, ()):
                if v == 'door': piece, var = 'edge.wall.door', None
                else: var = v
            else:
                err('edge-variant', f"{label(over)}: a {tr} section here can't be {v!r} (it can be {', '.join(VARIANTS.get(tr, ())) or 'nothing else'})",
                    mid, [over['id']], 'warning')
        it = dict(p=piece, x=ax * G, y=ay * G, x2=bx * G, y2=by * G, h=T[ter]['h'], low=lower, rot=rot, len=ln * G,
                  src=src, e=[round(mid[0], 4), round(mid[1], 4)])
        if var: it['v'] = var
        if over: it['o'] = over['id']
        inst.append(it)
    for o in kind('edge'):
        if o['id'] not in used_over: err('edge-missing', f"{label(o)}: no edge section at {o['at']}", o['at'], [o['id']], 'warning')
    inst += list(joints.values())
    for f in flights:
        inst.append(dict(p='connector.flight', x=f['a'][0] * G, y=f['a'][1] * G, x2=f['b'][0] * G, y2=f['b'][1] * G,
                         dx=f['dx'], dy=f['dy'], len=f['length'] * G, n=f['n'], h=f['top_h'], low=f['bot_h'], rot=0, name=f['name'], src=f['id']))

    # ---- vignettes: on flat ground, clear of flights and their landings ----
    fl_zones, fl_paths = [], []
    for f in flights:
        poly = Polygon([f['a'], f['b'], (f['b'][0] + f['dx'] * f['length'], f['b'][1] + f['dy'] * f['length']), (f['a'][0] + f['dx'] * f['length'], f['a'][1] + f['dy'] * f['length'])])
        fl_zones.append(poly.buffer(1.5, join_style='mitre'))   # the flight and a cell-and-a-half landing round it
        (ax, ay), (bx, by), dx, dy, L = f['a'], f['b'], f['dx'], f['dy'], f['length']
        fl_paths.append(Polygon([(ax - dx * 1.5, ay - dy * 1.5), (bx - dx * 1.5, by - dy * 1.5),
                                 (bx + dx * (L + 1.5), by + dy * (L + 1.5)), (ax + dx * (L + 1.5), ay + dy * (L + 1.5))]))   # its width only, landings ahead and behind
    # flights (with their cheek walls) never overlap each other
    bodies = []
    for f in flights:
        (ax, ay), (bx, by) = f['a'], f['b']; w = math.hypot(bx - ax, by - ay); ux, uy = (bx - ax) / w, (by - ay) / w
        c = 0.6 / G                                               # a cheek wall's width, in cells
        ox, oy = f['dx'] * f['length'], f['dy'] * f['length']
        p0, p1 = (ax - ux * c, ay - uy * c), (bx + ux * c, by + uy * c)
        bodies.append((f, Polygon([p0, p1, (p1[0] + ox, p1[1] + oy), (p0[0] + ox, p0[1] + oy)])))
    for i in range(len(bodies)):
        for j in range(i + 1, len(bodies)):
            ov = bodies[i][1].intersection(bodies[j][1])
            if ov.area > 1e-6:
                c = ov.centroid
                err('flight-overlap', f"{bodies[i][0]['name']} and {bodies[j][0]['name']} overlap (their steps or cheek walls)", (c.x, c.y),
                    [bodies[i][0]['id'], bodies[j][0]['id']])
    floor_u = {ch: unary_union(ps) for ch, ps in floors.items() if ps}
    # a flight's run-out: open, flat ground of its bottom terrace in front of its foot, its width and two cells deep.
    # Something there is legal but awkward (the user: 'more awkward than a hard block'), so it's a warning.
    for f, body in bodies:
        (ax, ay), (bx, by) = f['a'], f['b']; ox, oy = f['dx'] * f['length'], f['dy'] * f['length']
        run = Polygon([(ax + ox, ay + oy), (bx + ox, by + oy), (bx + ox + f['dx'] * 2, by + oy + f['dy'] * 2), (ax + ox + f['dx'] * 2, ay + oy + f['dy'] * 2)])
        rc = run.centroid
        ground = floor_u.get(f['bottom'])
        miss = run.difference(ground) if ground is not None else run
        if miss.area > 0.05 * run.area:
            err('flight-runout', f"{f['name']}: the ground in front of its foot isn't clear {f['bottom']!r} for two cells ({miss.area / run.area:.0%} is a wall, a drop or another level)",
                (rc.x, rc.y), [f['id']], 'warning')
        for f2, b2 in bodies:
            if f2 is not f and b2.intersection(run).area > 1e-6:
                err('flight-runout', f"{f['name']}: {f2['name']} is in front of its foot", (rc.x, rc.y), [f['id'], f2['id']], 'warning')

    # steps need room for their treads on the lower side (0.5 u of going for every 0.15 m of drop); squeezed between two
    # edges they turn into a jumble (the overlook, pin p24, 2026-11-24)
    low_u = {}
    step_ends = {}
    for s in allsegs:
        if s[4] == 'steps':
            for e in (s[0], s[1]): step_ends[key(e)] = step_ends.get(key(e), 0) + 1
    for s in allsegs:
        if s[4] != 'steps': continue
        (ax, ay), (bx, by) = s[0], s[1]; dx, dy = bx - ax, by - ay; L = math.hypot(dx, dy)
        if L <= 1.0 + 1e-6 and min(step_ends[key(s[0])], step_ends[key(s[1])]) < 2: continue   # a short piece ending a run: it turns the corner, its treads shared
        depth = (T[s[2]]['h'] - s[3]) / RISE * GOING / G                         # cells
        nx_, ny_ = -dy / L, dx / L                                                  # toward the lower side
        ux, uy = dx / L * 0.1 * L, dy / L * 0.1 * L                                  # trimmed at the ends: corners share their treads
        strip = Polygon([(ax + ux, ay + uy), (bx - ux, by - uy), (bx - ux + nx_ * depth, by - uy + ny_ * depth), (ax + ux + nx_ * depth, ay + uy + ny_ * depth)])
        if s[3] not in low_u: low_u[s[3]] = unary_union([u for c, u in floor_u.items() if abs(T[c]['h'] - s[3]) < 1e-6])
        miss = strip.difference(low_u[s[3]]).area
        if miss > 0.2 * strip.area:
            c = strip.centroid
            err('steps-runout', f"steps down from {T[s[2]].get('name', s[2])} at ({c.x:.1f},{c.y:.1f}) need {depth:.1f} cells of ground below for their treads; {miss / strip.area:.0%} of it isn't there",
                (c.x, c.y), [gid[s[2]]])

    for v in kind('vignette') + kind('setpiece'):       # a set piece is a vignette at the scale of a landmark: one model on a footprint
        pc = KIT['pieces'].get(v['piece'])
        if pc is None: err('piece', f"no piece {v['piece']!r} in kit.json", v['at'], [v['id']]); continue
        fw, fd = pc['footprint']; dx, dy = OUT[v.get('front', 'S')]
        hw, hd = (fw / 2 / G, fd / 2 / G) if dy else (fd / 2 / G, fw / 2 / G)
        box = Polygon([(v['at'][0] - hw, v['at'][1] - hd), (v['at'][0] + hw, v['at'][1] - hd), (v['at'][0] + hw, v['at'][1] + hd), (v['at'][0] - hw, v['at'][1] + hd)])
        if v.get('turn'):     # degrees past its front, clockwise on the map (the library faces the armillary, 2026-11-24)
            t = math.radians(v['turn']); c0, s0 = math.cos(t), math.sin(t); cx0, cy0 = v['at']
            box = Polygon([(cx0 + (px - cx0) * c0 - (py - cy0) * s0, cy0 + (px - cx0) * s0 + (py - cy0) * c0) for px, py in box.exterior.coords[:-1]])
            dx, dy = dx * c0 - dy * s0, dx * s0 + dy * c0
        if pc.get('shape') == 'round': box = Point(v['at']).buffer(hw * 0.98, 24)      # a round piece stands on its circle
        if pc.get('class') == 'decal':
            # a decal is a picture laid over whatever lies under its footprint, steps and all (the plaza's channels run up
            # its ring of steps); it needs no flat ground, only walkable ground under its centre, whose height it carries
            under = [ch for ch, u in floor_u.items() if u.buffer(1e-6).contains(Point(v['at'])) and T[ch].get('walk', True)]
            if not under: err('vignette-ground', f"{v['piece']} at {v['at']}: no walkable ground under its centre", v['at'], [v['id']]); continue
            inst.append(dict(p=v['piece'], x=v['at'][0] * G, y=v['at'][1] * G, h=T[under[0]]['h'], rot=math.atan2(dy, dx), src=v['id']))
            continue
        on = [ch for ch, u in floor_u.items() if u.buffer(1e-6).contains(box)]
        if not on and v['kind'] == 'setpiece':     # a set piece's plinth takes up a kerb: ground within 0.35 m will do
            under = [ch for ch, u in floor_u.items() if u.intersection(box).area > 1e-6]
            hs = [T[ch]['h'] for ch in under]
            if under and max(hs) - min(hs) <= 0.35 and abs(unary_union([floor_u[c] for c in under]).intersection(box).area - box.area) < 1e-3:
                on = [max(under, key=lambda c: T[c]['h'])]
        if not on:
            err('vignette-ground', f"{v['piece']} at {v['at']}: not wholly on one flat terrace" + (' (or ground within 0.35 m)' if v['kind'] == 'setpiece' else ''),
                v['at'], [v['id']]); continue
        zones = fl_paths if v['kind'] == 'setpiece' else fl_zones      # a set piece may flank a flight (gateway piers); never stand in its path
        if any(z.intersects(box) for z in zones): err('vignette-flight', f"{v['piece']} at {v['at']}: in a flight or its landing", v['at'], [v['id']])
        inst.append(dict(p=v['piece'], x=v['at'][0] * G, y=v['at'][1] * G, h=T[on[0]]['h'], rot=math.atan2(dy, dx), src=v['id']))

    # ---- scatter: a level filled with pieces at a spacing (the woods' trees), jittered and seeded, so a scene always
    # gives the same woods: {kind: scatter, terrace, pieces: [...], spacing (u, default 7), margin (cells, default 1), seed}
    import random

    def vary(piece, rng):
        """A piece's seeded variation (kit.json 'vary'): scale and tint, and one of each of its 'parts'."""
        pc_ = KIT['pieces'].get(piece, {}); v = pc_.get('vary', {}); out = {}
        if 'scale' in v: out['scale'] = round(rng.uniform(*v['scale']), 3)
        if v.get('tints'): out['tint'] = rng.choice(v['tints'])
        if pc_.get('parts'): out['parts'] = {k: rng.choice(opts) for k, opts in pc_['parts'].items()}
        return out

    for s_ in kind('scatter'):
        tg = glyph_of.get(s_.get('terrace'), s_.get('terrace'))
        ground = floor_u.get(tg)
        pieces = [p for p in s_.get('pieces', []) if p in KIT['pieces']]
        if ground is None or not pieces:
            err('scatter', f"{label(s_)}: no floor for {s_.get('terrace')!r} or no known pieces", None, [s_['id']], 'warning'); continue
        rng = random.Random(s_.get('seed', s_['id']))
        step = s_.get('spacing', 7.0) / G; inner = ground.buffer(-s_.get('margin', 1.0))
        x0, y0, x1, y1 = ground.bounds; n = 0
        yy = y0
        while yy <= y1 and n < 600:
            xx = x0
            while xx <= x1 and n < 600:
                px, py = xx + rng.uniform(-0.4, 0.4) * step, yy + rng.uniform(-0.4, 0.4) * step
                if inner.contains(Point(px, py)):
                    pc_ = rng.choice(pieces)
                    inst.append(dict(p=pc_, x=px * G, y=py * G, h=T[tg]['h'], rot=rng.uniform(-math.pi, math.pi), src=s_['id'], **vary(pc_, rng)))
                    n += 1
                xx += step
            yy += step

    # ---- dress: a style's rules put small pieces on sockets, at places and along roads (kit.json 'styles';
    # docs/explorations/2026-11-24-dressing-variation.md): {kind: dress, style, seed, terrace? (only there)}
    for d_ in kind('dress'):
        style = KIT.get('styles', {}).get(d_.get('style'))
        if not style: err('dress', f"{label(d_)}: no style {d_.get('style')!r} in kit.json", None, [d_['id']], 'warning'); continue
        rng = random.Random(d_.get('seed', d_['id']))
        only_g = glyph_of.get(d_.get('terrace'), d_.get('terrace'))
        only = floor_u.get(only_g) if only_g else None
        def ok_at(px, py):    # in scope, and clear of every flight's path
            pt = Point(px, py)
            return (only is None or only.buffer(1e-6).contains(pt)) and not any(z.contains(pt) for z in fl_paths)
        solid = [Point(o['at']).buffer(KIT['pieces'][o['piece']]['footprint'][0] / 2 / G) for o in kind('setpiece')
                 if o.get('piece') in KIT['pieces'] and KIT['pieces'][o['piece']].get('class') == 'setpiece']
        def fits(pc_, px, py, h):
            """A floor piece needs flat ground at its height under its whole footprint, clear of set pieces (no planter on a
            stoop's edge, pin-free fix 2026-11-24)."""
            fw = KIT['pieces'][pc_].get('footprint', [1, 1])[0] / 2 / G
            foot = Point(px, py).buffer(fw, 12)
            ground = [u for c_, u in floor_u.items() if abs(T[c_]['h'] - h) < 1e-6 and T[c_].get('walk', True)]
            return bool(ground) and unary_union(ground).buffer(1e-6).contains(foot) and not any(s.intersects(foot) for s in solid)
        def put(pieces, px, py, h, rot, up=0.0, on_floor=False):
            pc_ = rng.choice(pieces)
            if on_floor and not fits(pc_, px, py, h): return
            inst.append(dict(p=pc_, x=px * G, y=py * G, h=h, up=up, rot=rot, src=d_['id'], **vary(pc_, rng)))
        for rule in style['rules']:
            if 'on' in rule:      # sockets on joints, spread evenly: a joint is taken only if no taken one is within 'gap' u
                sock = KIT['pieces'][rule['on']].get('sockets', {}).get('cap', {})
                js = sorted((j for j in joints.values() if j['p'] == rule['on']), key=lambda j: (round(j['y'], 3), round(j['x'], 3)))
                gap = rule.get('gap', 0.0); taken = []
                for j in js:
                    if only is not None and not only.buffer(0.6).contains(Point(j['x'] / G, j['y'] / G)): continue
                    if any(math.hypot(j['x'] - t[0], j['y'] - t[1]) < gap for t in taken): continue
                    taken.append((j['x'], j['y']))
                    put(rule['put'], j['x'] / G, j['y'] / G, j['h'], j['rot'], sock.get('up', 0.0))
            elif rule.get('at') in ('flight-head', 'flight-foot'):
                for f in flights:
                    (ax, ay), (bx, by) = f['a'], f['b']; w = math.hypot(bx - ax, by - ay); ux, uy = (bx - ax) / w, (by - ay) / w
                    head = rule['at'] == 'flight-head'
                    back = -0.8 if head else f['length'] + 0.8
                    for (ex, ey), sgn in (((ax, ay), -1), ((bx, by), 1)):
                        px, py = ex + ux * sgn * 0.7 + f['dx'] * back, ey + uy * sgn * 0.7 + f['dy'] * back
                        if only is None or only.buffer(1e-6).contains(Point(px, py)):
                            put(rule['put'], px, py, f['top_h'] if head else f['bot_h'], math.atan2(f['dy'], f['dx']), on_floor=True)
            elif rule.get('along') == 'road':    # kerbs between a pavement and a road: lamps on the pavement side
                step = rule.get('spacing', 9) / G; inset = rule.get('inset', 0.6); acc = step / 2
                for s in allsegs:
                    if s[4] != 'kerb': continue
                    lo = T.get(low_of.get((round(s[0][0], 4), round(s[0][1], 4), round(s[1][0], 4), round(s[1][1], 4)), ''), {})
                    if lo.get('mat') != 'road' or T[s[2]].get('mat') == 'road': continue
                    (ax, ay), (bx, by) = s[0], s[1]; L = math.hypot(bx - ax, by - ay)
                    if L < 1e-6: continue
                    nx_, ny_ = (by - ay) / L, -(bx - ax) / L          # toward the upper (pavement) side
                    t = acc
                    while t < L:
                        px, py = ax + (bx - ax) * t / L + nx_ * inset, ay + (by - ay) * t / L + ny_ * inset
                        if ok_at(px, py): put(rule['put'], px, py, T[s[2]]['h'], math.atan2(-ny_, -nx_), on_floor=True)
                        t += step
                    acc = t - L

    # ---- reachability: cells by terrace, joined where steps are small, plus flights ----
    walk = {c for c in T if T[c].get('edge') != 'wall' and T[c].get('walk', True)}
    nodes = {c for c in walk if floors[c]}
    links = {c: set() for c in nodes}
    for s in allsegs:
        if s[4] in ('kerb', 'steps'):
            low = [c for c in nodes if abs(T[c]['h'] - s[3]) < 1e-6]
            for c in low:
                if s[2] in links: links[s[2]].add(c); links[c].add(s[2])
    for f in flights:
        if f['top'] in links and f['bottom'] in links: links[f['top']].add(f['bottom']); links[f['bottom']].add(f['top'])
    for c in nodes:   # same height, no edge between: one walkable ground
        for d in nodes:
            if c != d and abs(T[c]['h'] - T[d]['h']) < 0.3: links[c].add(d)
    seen, todo = set(), [next(iter(sorted(nodes)))] if nodes else []
    while todo:
        c = todo.pop()
        if c in seen: continue
        seen.add(c); todo += list(links[c])
    for c in sorted(nodes - seen):
        rp = floor_u[c].representative_point()
        err('unreachable', f"{T[c].get('name', c)} ({c!r}) can't be reached: no flight or small step joins it", (rp.x, rp.y), [gid[c]])

    # ---- the asset contract ----
    for it in inst:
        pc = KIT['pieces'].get(it['p'])
        at = (it['x'] / G, it['y'] / G)
        if pc is None: err('piece', f"no piece {it['p']!r} in kit.json", at, [it['src']]); continue
        if 'len' in it and pc['class'] in ('edge',):
            if abs(it['len'] - pc['length'] * G / KIT['G']) > 1e-3: err('piece-fit', f"{it['p']} at ({it['x']:.1f},{it['y']:.1f}) is {it['len']:.2f} u long, the piece {pc['length']}", at, [it['src']])
        if pc['class'] == 'sweep':
            lo, hi = pc['length']
            if not lo * G / KIT['G'] - 1e-3 <= it['len'] <= hi * G / KIT['G'] + 1e-3: err('piece-fit', f"{it['p']} at ({it['x']:.1f},{it['y']:.1f}): {it['len']:.2f} u is outside the piece's range", at, [it['src']])

    out_floors = []
    for ch, ps in floors.items():
        if not ps: continue
        u = unary_union(ps).buffer(0)
        geoms = getattr(u, 'geoms', [u])
        polys = [[[[x * G, y * G] for x, y in g.exterior.coords]] + [[[x * G, y * G] for x, y in r.coords] for r in g.interiors] for g in geoms if g.area > 1e-6]
        out_floors.append(dict(t=ch, id=gid[ch], h=T[ch]['h'], mat=T[ch]['mat'], polys=polys))
    counts = {}
    for it in inst: counts[it['p']] = counts.get(it['p'], 0) + 1
    return result(floors=out_floors, instances=inst, pieces=counts)


def compile_layout(name):
    return compile_scene(load_scene(name))


def main():
    name = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, '..', '..', 'game', 'packages', 'client', 'src', 'lab', f'kit-{name}.json')
    r = compile_layout(name)
    if r['errors']:
        print(f'{name}: {len(r["errors"])} problem(s):'); [print('  -', e) for e in r['errors']]; sys.exit(1)
    json.dump(r, open(out, 'w', encoding='utf-8'), separators=(',', ':'))
    print(f'{name}: {len(r["instances"])} instances of {len(r["pieces"])} pieces, 0 problems, {len(r["warnings"])} warning(s) -> {os.path.relpath(out)}')
    for w in r['warnings']: print('  ! ' + w)
    for p, n in sorted(r['pieces'].items()): print(f'  {n:4d} {p}')


if __name__ == '__main__':
    main()
