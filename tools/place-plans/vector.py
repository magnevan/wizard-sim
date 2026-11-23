"""The plan as exact shapes, for the 3D view's ground (phase A of the 3D plan, 2026-11-23).

  python tools/place-plans/vector.py court-d [out.json]   -> tools/place-plans/out/court-d-scene.json

The plan tool paints cells; the cells are what the sim walks on, but drawing the ground from them turns every curve and
diagonal into a staircase (the grid is turned 45 degrees to the screen). So the plan also records its shape ops
(Plan.ops), and this replays them with shapely in painting order: each fill cuts its shape out of what was there and
lays itself down, a building likewise, a raise or a road strip changes what it covers. The result is a set of disjoint
regions, each with its material and height, in the room's world coordinates.

Every plan edit is a recorded op (step 2a of tools/pipeline-3d): a plan that edits cells directly fails here, with
where the cells differ. The parapet lips
(finish.lips) are left out: the walkway stays flat and the 3D kit stands on its edge. The count of cells that differ is
printed; the sim's own data (the LDtk level) is unchanged.

Each region carries its outline (exterior and holes); a flight of stairs is cut into its treads. `faces` are the
vertical faces where a region's edge stands above its neighbour: segment, top, bottom, material.
"""
import json, math, os, sys
import numpy as np
import shapely
from shapely.geometry import Polygon, MultiPolygon, LineString, box
from shapely.ops import unary_union
from shapely import affinity
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import to_ldtk

R2 = math.sqrt(0.5)
GRID = 0.05   # snapping, so shared edges stay shared
WALKABLE = {'grass', 'path', 'road', 'paving', 'plaza', 'dais', 'stairs', 'wood', 'sand'}
PAVED = {'road', 'paving', 'plaza', 'dais', 'stairs', 'wood'}

def to_world(P):
    cx0, cy0 = P.x0 + P.nx / 2, P.y0 + P.ny / 2
    return lambda g: affinity.affine_transform(g, [R2, R2, -R2, R2, -cx0, -cy0])

def clean(g):
    # snap to the grid, then detach it: shapely keeps a set precision on the geometry, and a negative buffer on a
    # gridded geometry collapses to nothing (it silently deleted the overlook bay, 2026-11-23)
    g = shapely.set_precision(shapely.set_precision(shapely.make_valid(g), GRID), 0.0)
    if g.is_empty: return g
    polys = [p for p in (g.geoms if hasattr(g, 'geoms') else [g]) if isinstance(p, Polygon) and p.area > 0.01]
    return MultiPolygon(polys) if len(polys) > 1 else (polys[0] if polys else Polygon())

def export(name):
    P, _ = to_ldtk.load_spec(name)
    W = to_world(P)
    regions = []          # [geom (world), dict(mat, h, kind, ...)]
    def cut(g):
        nonlocal regions
        out = []
        for rg, a in regions:
            d = clean(rg.difference(g))
            if not d.is_empty: out.append((d, a))
        regions = out
    for op in P.ops:
        kind = op[0]
        if kind == 'fill':
            g = clean(W(Polygon(op[1]))); cut(g); regions.append((g, dict(mat=op[3], h=float(op[2]), kind='flat')))
        elif kind == 'building':
            g = clean(W(Polygon(op[1]))); cut(g)
            regions.append((g, dict(mat=op[4], h=float(op[2] + op[3]), ground=float(op[2]), kind='building', low_wall=op[4] == 'wall')))   # a cheek wall or parapet: solid, drawn as a low wall
        elif kind == 'stairs':
            g = clean(W(Polygon(op[1]))); cut(g)
            ax = op[4]
            du, dv = ((0, 1) if ax == 'V' else (1, 0)) if ax in ('U', 'V') else (math.cos(math.radians(ax)), math.sin(math.radians(ax)))
            dx, dy = (du + dv) * R2, (dv - du) * R2
            regions.append((g, dict(mat='stairs', h=float(op[2]), h0=float(op[2]), h1=float(op[3]), dir=[dx, dy], kind='stairs')))
        elif kind == 'raise':
            g = clean(W(Polygon(op[1]))); out = []
            for rg, a in regions:
                i, d = clean(rg.intersection(g)), clean(rg.difference(g))
                if not d.is_empty: out.append((d, a))
                if not i.is_empty:
                    b = dict(a); b['h'] = a['h'] + op[2]
                    if op[3]: b['mat'] = op[3]
                    out.append((i, b))
            regions = out
        elif kind == 'strip':
            pts, width, mat = op[1], op[2], op[3]
            g = clean(W(LineString(pts).buffer(width / 2, cap_style='square', join_style='round')))
            out = []
            for rg, a in regions:
                if a['kind'] == 'flat' and a['mat'] in ('plaza', 'paving', 'grass', 'path', 'dais'):
                    i, d = clean(rg.intersection(g)), clean(rg.difference(g))
                    if not d.is_empty: out.append((d, a))
                    if not i.is_empty: b = dict(a); b['mat'] = mat; out.append((i, b))
                else: out.append((rg, a))
            regions = out
        elif kind == 'repaint':
            g = clean(W(Polygon(op[1]))); out = []
            for rg, a in regions:
                ok = a['kind'] == 'flat' and a['mat'] in op[3] and (op[4] is None or abs(a['h'] - op[4]) <= 0.5)
                i = clean(rg.intersection(g)) if ok else Polygon()
                if i.is_empty: out.append((rg, a)); continue
                d = clean(rg.difference(g))
                if not d.is_empty: out.append((d, a))
                b = dict(a); b['mat'] = op[2]; out.append((i, b))
            regions = out
        elif kind == 'surface':
            g = clean(W(Polygon(op[1]))); out = []
            for rg, a in regions:
                ok = a['kind'] == 'flat' and a['mat'] in WALKABLE and abs(a['h'] - op[3]) < 0.01
                i = clean(rg.intersection(g)) if ok else Polygon()
                if i.is_empty: out.append((rg, a)); continue
                d = clean(rg.difference(g))
                if not d.is_empty: out.append((d, a))
                b = dict(a); b['mat'] = op[2]; b['h'] = a['h'] + op[4]; out.append((i, b))
            regions = out
        elif kind == 'raise_mat':
            for k, (rg, a) in enumerate(regions):
                if a['mat'] == op[1] and abs(a['h'] - op[2]) < 1e-6:
                    b = dict(a); b['h'] = a['h'] + op[3]; regions[k] = (rg, b)
    # ---- compare with the cells: overrides where a hand edit changed them ----
    cx0, cy0 = P.x0 + P.nx / 2, P.y0 + P.ny / 2
    X = (P.x0 + np.arange(P.nx) + 0.5)[None, :] - cx0 + np.zeros((P.ny, 1))
    Y = (P.y0 + np.arange(P.ny) + 0.5)[:, None] - cy0 + np.zeros((1, P.nx))
    vh = np.full(P.h.shape, np.nan); vm = np.full(P.h.shape, None, dtype=object); vk = np.full(P.h.shape, None, dtype=object)
    for rg, a in regions:
        inside = shapely.contains_xy(rg, X, Y)
        vh[inside] = a['h']; vm[inside] = a['mat']; vk[inside] = a['kind']
    same_m = vm == P.m
    same_h = np.isfinite(vh) & (np.abs(vh - P.h) < 0.01)
    stairs_ok = (vk == 'stairs') & (P.m == 'stairs')
    building_ok = (vk == 'building') & P.bld
    lip = (P.m == 'wall') & ~building_ok
    differ = ~((same_m & same_h) | stairs_ok | building_ok | lip) & (P.m != 'void')
    # rasterisation noise along curved edges isn't a hand edit: only differences thicker than a cell count
    from scipy import ndimage as _nd
    differ = _nd.binary_opening(differ, iterations=1)
    # Every plan edit is a recorded op (pipeline step 2a), so the shapes and the cells must agree: a difference is an
    # error in the plan (an edit made on cells), never reconstructed here.
    if differ.any():
        import collections
        where = collections.Counter((P.m[i, j], round(float(P.h[i, j]), 2)) for i, j in zip(*np.nonzero(differ)))
        i, j = np.argwhere(differ)[0]
        raise SystemExit(f"{name}: {int(differ.sum())} cells differ from the plan's shape ops, e.g. near U,V "
                         f"({P.CU[i, j]:.1f}, {P.CV[i, j]:.1f}); by (material, height): {dict(where.most_common(6))}. "
                         "A plan edit was made on cells: make it a shape op (fill, repaint, building, stairs, raise_mat).")
    # the plan's tiny blocks (piers, posts) stand as the pier model in 3D: the ground runs on under them
    # the plan's small blocks (piers, posts) stay solid, drawn at their own footprint (pipeline 2b: what blocks is drawn)
    regions = [(rg, dict(a, post=True) if a['kind'] == 'building' and rg.area < 30 else a) for rg, a in regions]
    # ---- hygiene: no notches, spikes or slivers (the user's circles, 2026-11-23) ----
    # Each region is opened then closed by R (removing anything narrower than about 2R, keeping curves), largest first,
    # each taking only what no larger one took; what's left over (the slivers between) goes to the neighbour it shares
    # the most edge with.
    R = float(os.environ.get('VECTOR_R', 0.3))   # slivers and hairlines only: shapes are clean upstream (the plan)
    total = clean(unary_union([rg for rg, _ in regions]).buffer(0.25, join_style='mitre').buffer(-0.25, join_style='mitre'))   # with gaps between regions closed
    order = sorted(range(len(regions)), key=lambda k: -regions[k][0].area)
    taken, out = Polygon(), {}
    for k in order:
        g, a = regions[k]
        b = lambda x, d: x.buffer(d, join_style='round', quad_segs=3)
        g2 = clean(clean(b(b(g, -R), R)).buffer(0).pipe if False else clean(b(b(clean(b(b(g, -R), R)), R), -R)).simplify(0.06))
        g3 = clean(g2.intersection(total).intersection(g.buffer(R * 1.01)).difference(taken))   # never more than R past its own shape (it swallowed the overlook bay)
        if not g3.is_empty: out[k] = g3; taken = clean(taken.union(g3))
    rest = clean(total.difference(taken))
    for part in (rest.geoms if hasattr(rest, 'geoms') else ([rest] if not rest.is_empty else [])):
        # back to the region that owned it before the clean-up (most of its area), else the one it shares most edge with
        best, bl = None, 0.0
        for k in out:
            l = part.intersection(regions[k][0]).area
            if l > bl: best, bl = k, l
        if best is None:
            for k, g in out.items():
                l = part.boundary.intersection(g.buffer(0.02)).length
                if l > bl: best, bl = k, l
        if best is not None: out[best] = clean(out[best].union(part))
    regions = [(out[k], regions[k][1]) for k in sorted(out)]
    # ---- stairs into treads ----
    flat = []
    for rg, a in regions:
        if a['kind'] != 'stairs': flat.append((rg, a)); continue
        dx, dy = a['dir']; steps = max(2, int(round(abs(a['h1'] - a['h0']) / 0.35)))
        cs = [dx * x + dy * y for poly in (rg.geoms if hasattr(rg, 'geoms') else [rg]) for x, y in poly.exterior.coords]
        lo, hi = min(cs), max(cs)
        for q in range(steps + 1):
            t0, t1 = max(0, (q - 0.5) / steps), min(1, (q + 0.5) / steps)
            c0, c1 = lo + t0 * (hi - lo), lo + t1 * (hi - lo)
            # a band across the flight: the strip c0 <= dx x + dy y <= c1
            L = 1000; px, py = -dy, dx
            band = Polygon([(dx * c0 + px * L, dy * c0 + py * L), (dx * c1 + px * L, dy * c1 + py * L), (dx * c1 - px * L, dy * c1 - py * L), (dx * c0 - px * L, dy * c0 - py * L)])
            g = clean(rg.intersection(band))
            if not g.is_empty: flat.append((g, dict(mat='stairs', h=a['h0'] + q / steps * (a['h1'] - a['h0']), kind='step')))
    regions = flat
    # ---- vertical faces: where an edge stands above what's beside it ----
    tree = shapely.STRtree([rg for rg, _ in regions])
    faces, segs = [], []
    for rg, a in regions:
        for poly in (rg.geoms if hasattr(rg, 'geoms') else [rg]):
            poly = shapely.geometry.polygon.orient(poly, 1.0)     # exterior counter-clockwise: outward is to the right
            for ring in [poly.exterior] + list(poly.interiors):
                cs = list(ring.coords)
                for (x0, y0), (x1, y1) in zip(cs, cs[1:]):
                    L = math.hypot(x1 - x0, y1 - y0)
                    if L < 1e-6: continue
                    nx, ny = (y1 - y0) / L, -(x1 - x0) / L
                    n = max(1, int(math.ceil(L / 1.0)))
                    for k in range(n):
                        ax, ay = x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n
                        bx, by = x0 + (x1 - x0) * (k + 1) / n, y0 + (y1 - y0) * (k + 1) / n
                        mx, my = (ax + bx) / 2 + nx * 0.06, (ay + by) / 2 + ny * 0.06
                        pt = shapely.Point(mx, my)
                        lowh, nb = -12.0, None
                        for probe in (0.06, 0.3, 0.6):             # a hairline gap isn't the void: look a little further
                            pt = shapely.Point((ax + bx) / 2 + nx * probe, (ay + by) / 2 + ny * probe)
                            for idx in tree.query(pt):
                                if regions[idx][0].contains(pt): lowh = regions[idx][1]['h']; nb = regions[idx][1]; break
                            if nb is not None: break
                        top = a['h']
                        seg = [round(ax, 3), round(ay, 3), round(bx, 3), round(by, 3), round(top, 3), round(lowh, 3), a['mat'], a['kind']]
                        if lowh < top - 0.01: faces.append(seg)
                        # an edge type, for the kit (phase B): only on walkable flat ground, never a building's own edge
                        if a['kind'] != 'flat' or a['mat'] not in WALKABLE: continue
                        dh = top - lowh
                        if nb is not None and nb['kind'] == 'building': continue
                        if dh >= 0.6:
                            # a parapet where the plan guards the edge (Semantic.parapets / finish.lips), else a retaining
                            # wall: declared, not guessed from the drop (step 4.5)
                            gi = int(math.floor((ay + by) / 2 - ny * 0.3 + cy0 - P.y0)); gj = int(math.floor((ax + bx) / 2 - nx * 0.3 + cx0 - P.x0))
                            guarded = 0 <= gi < P.ny and 0 <= gj < P.nx and bool(P.guard[gi, gj])
                            segs.append(('parapet' if guarded else 'retain', seg))
                        elif nb is not None and nb['kind'] in ('flat', 'step') and nb['mat'] != a['mat'] and dh > -0.01 and (dh > 0.01 or a['mat'] < nb['mat']):
                            if {a['mat'], nb['mat']} & PAVED and 'stairs' not in (a['mat'], nb['mat']) and not ({a['mat'], nb['mat']} <= {'dais', 'plaza', 'paving'}): segs.append(('kerb', seg))   # a flight's edge is its top step, never a kerb
    # ---- chain the typed segments into polylines (one direction: the ground on the left, the drop on the right) ----
    edges = []
    for typ in ('retain', 'parapet', 'kerb'):
        ss = [sg for t, sg in segs if t == typ]
        start = {}
        for sg in ss: start.setdefault((sg[0], sg[1]), []).append(sg)
        used = set()
        for sg in ss:
            if id(sg) in used: continue
            # walk back to the chain's start
            line = [sg]; used.add(id(sg))
            cur = sg
            while True:
                nxt = [c for c in start.get((cur[2], cur[3]), []) if id(c) not in used and abs(c[4] - cur[4]) < 0.05]
                if not nxt: break
                cur = nxt[0]; used.add(id(cur)); line.append(cur)
            pts = [[line[0][0], line[0][1]]] + [[c[2], c[3]] for c in line]
            simp = list(LineString(pts).simplify(0.08).coords) if len(pts) > 2 else pts
            if LineString(simp).length < (2.0 if typ == 'kerb' else 1.0): continue   # a scrap, not an edge
            edges.append(dict(type=typ, pts=[[round(x, 3), round(y, 3)] for x, y in simp], top=line[0][4], low=round(min(c[5] for c in line), 3)))
    def rings(g):
        out = []
        for poly in (g.geoms if hasattr(g, 'geoms') else [g]):
            poly = shapely.geometry.polygon.orient(poly, 1.0)
            out.append([[[round(x, 3), round(y, 3)] for x, y in poly.exterior.coords[:-1]]] + [[[round(x, 3), round(y, 3)] for x, y in r.coords[:-1]] for r in poly.interiors])
        return out
    data = dict(plan=name, w=P.nx, h=P.ny,
                # `under`: each region a little larger, drawn just beneath, so hairlines where edges meet without shared corners don't show
                regions=[dict(mat=a['mat'], h=round(a['h'], 3), kind=a['kind'], ground=a.get('ground'), polys=rings(rg), under=rings(clean(rg.buffer(0.15, join_style='mitre').simplify(0.05)))) for rg, a in regions],
                faces=faces, edges=edges)
    # ---- the glitch report: edges that wiggle (more turning than a curve of radius 2 u would need); a wiggling edge's
    # line is smoothed (resampled every 0.5 u, averaged over about 2 u, ends kept) and checked again ----
    def turning(pts):
        t = 0.0
        for (x0, y0), (x1, y1), (x2, y2) in zip(pts, pts[1:], pts[2:]):
            t += abs((math.atan2(y2 - y1, x2 - x1) - math.atan2(y1 - y0, x1 - x0) + math.pi) % (2 * math.pi) - math.pi)
        return t
    def wiggles(pts):
        L = LineString(pts).length
        return len(pts) > 2 and L > 0 and turning(pts) / L > 0.5 + 2 * math.pi / L
    for e in edges:
        if not wiggles(e['pts']): continue
        line = LineString(e['pts']); n = max(3, int(line.length / 0.5))
        rs = [line.interpolate(k / n, normalized=True) for k in range(n + 1)]
        xs, ys = [p.x for p in rs], [p.y for p in rs]
        w = 2
        sm = [(xs[k], ys[k]) if k in (0, n) else (sum(xs[max(0, k - w):k + w + 1]) / len(xs[max(0, k - w):k + w + 1]), sum(ys[max(0, k - w):k + w + 1]) / len(ys[max(0, k - w):k + w + 1])) for k in range(n + 1)]
        e['pts'] = [[round(x, 3), round(y, 3)] for x, y in LineString(sm).simplify(0.05).coords]
        e['smoothed'] = True
    wavy = []
    for e in edges:
        pts = e['pts']
        if len(pts) < 3: continue
        turn = 0.0; L = 0.0
        for (x0, y0), (x1, y1), (x2, y2) in zip(pts, pts[1:], pts[2:]):
            a1, a2 = math.atan2(y1 - y0, x1 - x0), math.atan2(y2 - y1, x2 - x1)
            turn += abs((a2 - a1 + math.pi) % (2 * math.pi) - math.pi)
        L = sum(math.hypot(x1 - x0, y1 - y0) for (x0, y0), (x1, y1) in zip(pts, pts[1:]))
        if L > 0 and turn / L > 0.5 + 2 * math.pi / max(L, 1e-6): wavy.append((e['type'], round(L, 1), round(math.degrees(turn)), pts[0]))
    data['glitches'] = dict(wavy_edges=[dict(type=t, length=l, turn=a, at=p) for t, l, a, p in wavy])
    if os.environ.get('VECTOR_DEBUG'):
        import collections
        c = collections.Counter((P.m[i, j], vm[i, j], round(float(P.h[i, j] - (vh[i, j] if np.isfinite(vh[i, j]) else 0)), 2)) for i, j in zip(*np.nonzero(differ)))
        for k, v in c.most_common(15): print(v, k)
    return data, int(differ.sum()), int(lip.sum())

if __name__ == '__main__':
    name = sys.argv[1] if len(sys.argv) > 1 else 'court-d'
    data, nd, nl = export(name)
    # the resolved scene: tools/place-plans/out/ (gitignored) unless a path is given (the 3D spike passes its own)
    dst = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, 'out', name + '-scene.json')
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    json.dump(data, open(dst, 'w'), separators=(',', ':'))
    # the compact scene beside the level, for content:check's agreement check (regions only)
    lvl = to_ldtk.LEVELS[name]['level']
    sdir = os.path.join(HERE, '..', '..', 'game', 'content', 'maps', 'scenes'); os.makedirs(sdir, exist_ok=True)
    rd = lambda polys: [[[[round(x, 2), round(y, 2)] for x, y in ring] for ring in poly] for poly in polys]
    # the stamp: the level file's hash (line endings normalised), so content:check can tell a scene built for another level
    import hashlib
    lf = os.path.join(HERE, '..', '..', 'game', 'content', 'maps', 'world', lvl + '.ldtkl')
    stamp = hashlib.sha1(open(lf, encoding='utf-8').read().replace('\r\n', '\n').encode('utf-8')).hexdigest()[:16] if os.path.exists(lf) else None
    compact = dict(plan=name, level=lvl, levelHash=stamp, note='Written by tools/place-plans/vector.py; checked against the level by content:check (packages/content/src/scene.mjs).',
                   regions=[dict(mat=r['mat'], h=r['h'], kind=r['kind'], polys=rd(r['polys'])) for r in data['regions']])
    json.dump(compact, open(os.path.join(sdir, lvl.lower() + '.json'), 'w'), separators=(',', ':'))
    print(f"glitch report: {len(data['glitches']['wavy_edges'])} wavy edges", [(g['type'], g['length'], g['turn']) for g in data['glitches']['wavy_edges'][:8]])
    print(f"{name}: {len(data['regions'])} regions, {len(data['faces'])} face segments, edges {dict((t, sum(1 for e in data['edges'] if e['type'] == t)) for t in ('retain', 'parapet', 'kerb'))}; {nd} cells differ from the shapes, {nl} parapet cells left flat; {os.path.getsize(dst) // 1024} KB")
