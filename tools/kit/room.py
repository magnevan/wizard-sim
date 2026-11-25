"""The room the sim walks on, from a kit scene: the scene is the court's one map (docs/explorations/2026-11-25-port-3d-plan.md,
decision 1).

  python tools/kit/room.py court            # writes game/content/generated/rooms/court.room.json
  python tools/kit/room.py court --check    # exports twice in memory and fails unless the two are byte-identical
  python tools/kit/room.py court --stdout   # the file's text on stdout, nothing written
  (python tools/kit/compile.py court --room does the same after its own compile)

Then, in game/: `npm run content:build` folds the file into packages/sim/src/rooms.gen.ts and `npm run content:check`
checks it (and fails once the scene no longer matches the file's sceneHash). CI never runs Python, so the file is committed.

**Units.** 1 sim unit = 1 kit u (= 0.6 m). Checked, not assumed: the scene was traced from plan D on the corner lattice
(U, V) = (-95 + 2x, -62 + 2y) in plan units (tools/kit/trace_plan.py), and the LDtk court was written from the same plan by
a 45-degree turn ((u + v) / sqrt 2, tools/place-plans/to_ldtk.py), which keeps lengths: so a plan unit is a kit u and a sim
unit both. The LDtk court's 261 x 260 u is that turned plan's bounding box; the scene is a 204 x 162 u crop of it, unturned.

**The mapping.** The room is the scene's whole rectangle (size from compile.py), centred on the origin as every room is,
y down in both: sim point (x, y) is scene point (x + ox, y + oy) in u, with toScene = [ox, oy] = [W / 2, H / 2].
A scene corner (cx, cy) is scene point (cx * G, cy * G).

**What the room says.** Cells are the sim's CELL (0.5 u), taken at their centres:
- each cell's surface is the terrace whose compiled floor covers it (the highest where two do), or a flight;
- walkable: a terrace without walk: false (and not a building's 'wall' level), or a flight. The rest is '#' rock;
- an edge between two walkable cells stops everyone unless the scene walks over it: a kerb (0.3 m or less), steps, a
  seam between two levels at one height, or a flight's head and foot. A flight's sides are walls (its cheek walls).
  Everything else (wall, parapet, retaining wall, a bare drop) is a cliff: during the port every height edge is a wall
  both ways (the plan's "height in a 2D sim");
- heights: each cell's terrace metres as a tier; flight cells and the treads of 'steps' edges are '/' (stair);
- set pieces, vignettes and dressing block with their kit.json footprint (box or round, turned with the piece), unless
  lower than MIN_BLOCK_M or standing on a pier's cap; PASSAGES leaves a building's archway open;
- starts and markers come from the scene's `marker` objects ({"kind": "marker", "id", "at": [x, y] in corners, "tag"?});
  ids start-0 to start-3 are the four seats' starts.
The height-ready data the sim doesn't read yet is under `height3d` (not in the room, so not in its hash): each cell's
surface, and every height edge's kind, top and the heights either side.

**Determinism.** Every coordinate is snapped to 0.05 u, every list is in a fixed order (cells by row then column, runs
merged in scan order, footprints sorted by place), curves are cut by compile.py's own fixed rule and then rasterised at
cell centres, and the JSON is written by hand in a fixed key order.
"""
import hashlib, json, math, os, sys, time

import numpy as np
import shapely
from shapely.geometry import Polygon

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import compile as kit  # noqa: E402

ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
OUT_DIR = os.path.join(ROOT, 'game', 'content', 'generated', 'rooms')
TAGS = os.path.join(ROOT, 'game', 'content', 'tags.json')

CELL = 0.5               # u: the sim's CELL
SNAP = 0.05              # u: every coordinate in the file is a multiple of this
WALL_HALF = 0.25         # u: a rock wall's half-thickness (the sim's STRUCT.wallThickness)
FILL_STEP = 1.3          # u: rows across a deep footprint, so nothing can land in its hollow (content's footprintWalls)
ROUND_SIDES = 12         # a round footprint's outline
MIN_BLOCK_M = 0.3        # m: a piece lower than this is stepped over (a rope coil)
PARAPET_M = 1.0          # m: a parapet's rail over its terrace (the joint.pier cap sits at 1.3)
KERB_M, STEPS_M = 0.3, 1.0   # m: compile.py's kerb and steps limits
RISE, GOING = kit.RISE, kit.GOING
TIER_CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
BLOCKING_CLASSES = ('setpiece', 'vignette', 'dress')
# A building's open archways: ranges of its width (u, from its centre, +x to the right when it faces south) left out of
# its footprint. The great hall's gatehouse carries the north road (cells 46 to 49 of the court, 6 u wide) through it
# (kit.json: "whose archway carries the north road through it", pin p5). Belongs in kit.json once the editor reads it.
PASSAGES = {'setpiece.great-hall': [(-3.5, 2.5)]}


def snap(v):
    v = round(v / SNAP) * SNAP
    v = round(v, 2)
    return 0 if v == 0 else (int(v) if v == int(v) else v)


def scene_path(name):
    return os.path.join(HERE, 'scenes', name + '.scene.json')


def scene_hash(name):
    """sha256 of the scene file's bytes with CRLF read as LF (a Windows checkout), first 16 hex digits. The content check
    (game/packages/content/src/scene-room.mjs) takes the same hash."""
    data = open(scene_path(name), 'rb').read().replace(b'\r\n', b'\n')
    return hashlib.sha256(data).hexdigest()[:16]


def treat(up, lo):
    """compile.py's edge treatment for the edge between two terraces, up the higher (by height, then glyph)."""
    drop = up['h'] - lo['h']
    if 0.3 < drop <= 1.0 and 'steps' in (up.get('edge'), lo.get('edge')) and up.get('walk', True) and lo.get('walk', True) \
            and up.get('edge') != 'wall':
        return 'steps'
    if up.get('mat') == 'water' and lo.get('mat') == 'water': return 'drop'
    if up.get('edge') == 'steps' and drop > 1.0: return 'parapet'
    if up.get('edge') == 'wall': return 'wall'
    if drop < 0.01: return 'seam'
    if drop <= KERB_M: return 'kerb'
    if up.get('edge') == 'open': return 'drop'
    return up.get('edge', 'retain')


PASSABLE = ('kerb', 'steps', 'seam', 'flight')
EDGE_KINDS = ['wall', 'parapet', 'retain', 'drop', 'steps', 'kerb', 'flight', 'flight-side']


def footprint_walls(cx, cy, rot, fw, fd, round_, gaps=()):
    """A footprint (fw across its front, fd deep, centred on cx, cy, its front toward rot) -> wall segments in scene u, as
    content's footprintWalls does it: one segment if up to 0.6 deep, two side by side up to 1, else a closed outline
    (a 12-sided ring if round) with rows across the inside. gaps: ranges across its width left open (an archway)."""
    fx, fy = math.cos(rot), math.sin(rot)            # the front
    sx, sy = fy, -fx                                 # across: (sin r, -cos r), +x when the front is south
    world = lambda u, v: (cx + u * sx + v * fx, cy + u * sy + v * fy)
    parts = [(-fw / 2, fw / 2)]
    for g0, g1 in gaps:
        parts = [q for p in parts for q in ((p[0], min(p[1], g0)), (max(p[0], g1), p[1])) if q[1] - q[0] > 1e-6]
    out = []
    for u0, u1 in parts:
        w, h, uc = u1 - u0, fd, (u0 + u1) / 2
        wide = w >= h; short = min(w, h)
        h_long = max(0.0, max(w, h) / 2 - WALL_HALF); h_short = short / 2 - WALL_HALF

        def row(o, half):
            return [(uc - half, o), (uc + half, o)] if wide else [(uc + o, -half), (uc + o, half)]
        segs = []
        if short <= 0.6: segs = [row(0, h_long)]
        elif short <= 1.0: segs = [row(-h_short, h_long), row(h_short, h_long)]
        else:
            hw, hh = w / 2 - WALL_HALF, h / 2 - WALL_HALF
            rnd = round_ and not gaps
            if rnd: corners = [(uc + hw * math.cos((i + 0.5) / ROUND_SIDES * 2 * math.pi), hh * math.sin((i + 0.5) / ROUND_SIDES * 2 * math.pi)) for i in range(ROUND_SIDES)]
            else: corners = [(uc - hw, -hh), (uc + hw, -hh), (uc + hw, hh), (uc - hw, hh)]
            segs = [[corners[i], corners[(i + 1) % len(corners)]] for i in range(len(corners))]
            rows = math.ceil((2 * h_short) / FILL_STEP)
            for k in range(1, rows):
                o = -h_short + (k * 2 * h_short) / rows
                segs.append(row(o, h_long * math.sqrt(max(0.0, 1 - (o / h_short) ** 2)) if rnd else h_long))
        for a, b in segs: out.append(world(*a) + world(*b))
    return out


def merge_runs(cells, n_lines, n_along, make):
    """cells: {(line, i): key}; consecutive i on one line with the same key merge into one run -> make(line, i0, i1, key)."""
    out = []
    for line in range(n_lines):
        start, cur = -1, None
        for i in range(n_along + 1):
            k = cells.get((line, i)) if i < n_along else None
            if start >= 0 and k != cur:
                out.append(make(line, start, i, cur)); start = -1
            if k is not None and start < 0: start, cur = i, k
    return out


def export(name, r=None):
    """The scene called name -> (the file's text, a summary). r: compile.py's result, if already compiled."""
    sc = kit.load_scene(name)
    if r is None: r = kit.compile_scene(sc)
    if r['errors']: raise SystemExit(f'{name}: the scene has {len(r["errors"])} error(s); fix them first:\n  - ' + '\n  - '.join(r['errors']))
    G = sc['G']; W, H = r['size']
    gw, gh = int(round(W / CELL)), int(round(H / CELL))
    if abs(gw * CELL - W) > 1e-9 or abs(gh * CELL - H) > 1e-9: raise SystemExit(f'{name}: {W} x {H} u is not whole cells')
    ox, oy = W / 2, H / 2
    terr = sc['terraces']; tid = [t['id'] for t in terr]; by_glyph = {t['glyph']: k for k, t in enumerate(terr)}
    walk_t = [t.get('walk', True) and t.get('edge') != 'wall' for t in terr]
    problems = []

    # ---- each cell's terrace: the compiled floors at the cell centres, lowest first so the highest wins ----
    xs = (np.arange(gw) + 0.5) * CELL; ys = (np.arange(gh) + 0.5) * CELL
    PX, PY = np.meshgrid(xs, ys)
    surf = np.full((gh, gw), -1, dtype=np.int32)
    for f in sorted(r['floors'], key=lambda f: (f['h'], f['t'])):
        geom = shapely.union_all([Polygon(p[0], p[1:]) for p in f['polys']])
        surf[shapely.contains_xy(geom, PX, PY)] = by_glyph[f['t']]
    # a centre exactly on a seam between two floors belongs to neither: give it a neighbour's (the first in N, W, E, S)
    gaps = np.argwhere(surf < 0)
    for cy, cx in gaps:
        for dx, dy in ((0, -1), (-1, 0), (1, 0), (0, 1)):
            x, y = cx + dx, cy + dy
            if 0 <= x < gw and 0 <= y < gh and surf[y, x] >= 0: surf[cy, cx] = surf[y, x]; break
    holes = int((surf < 0).sum())
    if holes: problems.append(f'{holes} cell(s) no floor covers')
    surf[surf < 0] = by_glyph[min(by_glyph, key=lambda g: (terr[by_glyph[g]]['h'], g))]
    h_t = np.array([t['h'] for t in terr])

    # ---- flights: their footprint's cells, the stair between the head (top) and the foot ----
    flights = sorted((i for i in r['instances'] if i['p'] == 'connector.flight'), key=lambda i: i['src'])
    fl = np.full((gh, gw), -1, dtype=np.int32)
    fl_h = np.zeros((gh, gw))
    for k, f in enumerate(flights):
        ax, ay, bx, by, dx, dy, L = f['x'], f['y'], f['x2'], f['y2'], f['dx'], f['dy'], f['len']
        wd = math.hypot(bx - ax, by - ay); ux, uy = (bx - ax) / wd, (by - ay) / wd
        along = (PX - ax) * dx + (PY - ay) * dy; across = (PX - ax) * ux + (PY - ay) * uy
        m = (along > 0) & (along < L) & (across > 0) & (across < wd)
        fl[m] = k
        fl_h[m] = (f['h'] - (along / L) * (f['h'] - f['low']))[m]
    is_fl = fl >= 0
    walk = np.where(is_fl, True, np.array(walk_t)[surf])
    cell_h = np.where(is_fl, fl_h, h_t[surf])

    # ---- edges between neighbouring cells ----
    def edge(a, b, off):
        """The edge from cell a to cell b (off = b - a): (kind, passable) or None where nothing parts them."""
        fa, fb = fl[a], fl[b]
        if fa >= 0 or fb >= 0:
            if fa == fb: return None
            if fa >= 0 and fb >= 0: return 'flight-side', False
            f = flights[fa if fa >= 0 else fb]; o = off if fa >= 0 else (-off[0], -off[1])
            if (o[0], o[1]) in ((f['dx'], f['dy']), (-f['dx'], -f['dy'])): return 'flight', bool(walk[a] and walk[b])
            return 'flight-side', False
        ta, tb = surf[a], surf[b]
        if ta == tb: return None
        A, B = terr[ta], terr[tb]
        up, lo = (A, B) if (A['h'], A['glyph']) > (B['h'], B['glyph']) else (B, A)
        k = treat(up, lo)
        return k, bool(k in PASSABLE and walk[a] and walk[b])

    stair = is_fl.copy()
    h_edges, v_edges, h_cliff, v_cliff = {}, {}, {}, {}
    steps_at = []
    for y in range(gh):
        for x in range(gw):
            for (dx, dy), store, cliff in (((1, 0), v_edges, v_cliff), ((0, 1), h_edges, h_cliff)):
                x2, y2 = x + dx, y + dy
                if x2 >= gw or y2 >= gh: continue
                e = edge((y, x), (y2, x2), (dx, dy))
                if e is None: continue
                kind, ok = e
                if kind == 'seam': continue
                ha, hb = round(float(cell_h[y, x]), 2), round(float(cell_h[y2, x2]), 2)
                top = max(ha, hb) + (PARAPET_M if kind == 'parapet' else 0)
                key = (EDGE_KINDS.index(kind), round(top, 2), ha, hb)
                # horizontal edges lie on row line y + 1, running along x; vertical ones on column line x + 1, along y
                if dy: store[(y + 1, x)] = key
                else: store[(x + 1, y)] = key
                if not ok and walk[y, x] and walk[y2, x2]: (cliff.__setitem__((y + 1, x) if dy else (x + 1, y), (float(cell_h[y, x]), float(cell_h[y2, x2]))))
                if kind == 'steps' and not is_fl[y, x] and not is_fl[y2, x2]:
                    lower, d = ((y2, x2), (dx, dy)) if cell_h[y, x] > cell_h[y2, x2] else ((y, x), (-dx, -dy))
                    steps_at.append((lower, d, abs(float(cell_h[y, x] - cell_h[y2, x2]))))
    # steps: their treads lie on the lower side, 0.5 u of going for every 0.15 m of drop (compile.py's steps-runout)
    for (cy, cx), (dx, dy), drop in steps_at:
        n = math.ceil(drop / RISE * GOING / CELL - 1e-9); t = surf[cy, cx]
        for s in range(n):
            y, x = cy + dy * s, cx + dx * s
            if not (0 <= x < gw and 0 <= y < gh) or surf[y, x] != t or is_fl[y, x]: break
            stair[y, x] = True

    # ---- tiers and the height rows ----
    used = sorted({float(h_t[t]) for t in np.unique(surf)})
    tier_of_h = {h: k for k, h in enumerate(used)}
    if len(used) > len(TIER_CHARS): problems.append(f'{len(used)} heights; a room holds {len(TIER_CHARS)}')
    tier = np.vectorize(lambda t: tier_of_h[float(h_t[t])])(surf)
    rows = [''.join('/' if stair[y, x] else TIER_CHARS[tier[y, x]] for x in range(gw)) for y in range(gh)]
    terrain = [''.join('.' if walk[y, x] else '#' for x in range(gw)) for y in range(gh)]

    X = lambda cx: snap(cx * CELL - ox)
    Y = lambda cy: snap(cy * CELL - oy)
    # ---- rock: the outline of every blocked cell (none along the room's edge), as content's traceRock ----
    blk = ~walk
    hr = {(y, x): 1 for y in range(1, gh) for x in range(gw) if blk[y - 1, x] != blk[y, x]}
    vr = {(x, y): 1 for x in range(1, gw) for y in range(gh) if blk[y, x - 1] != blk[y, x]}
    rock = merge_runs(hr, gh + 1, gw, lambda y, a, b, k: [X(a), Y(y), X(b), Y(y)]) + \
        merge_runs(vr, gw + 1, gh, lambda x, a, b, k: [X(x), Y(a), X(x), Y(b)])

    # ---- cliffs: blocked edges between walkable cells, merged by the tiers either side ([upper, lower]) ----
    def tier_pair(h):
        tt = [tier_of_h.get(v, min(range(len(used)), key=lambda k: abs(used[k] - v))) for v in h]
        return tuple(sorted(tt, key=lambda k: -used[k]))
    hc = {k: tier_pair(v) for k, v in h_cliff.items()}; vc = {k: tier_pair(v) for k, v in v_cliff.items()}
    cliff_h = merge_runs(hc, gh + 1, gw, lambda y, a, b, k: ([X(a), Y(y), X(b), Y(y)], list(k)))
    cliff_v = merge_runs(vc, gw + 1, gh, lambda x, a, b, k: ([X(x), Y(a), X(x), Y(b)], list(k)))
    cliffs = cliff_h + cliff_v

    # ---- footprints: set pieces, vignettes and dressing ----
    foot = []
    for it in r['instances']:
        pc = kit.KIT['pieces'].get(it['p'], {})
        if pc.get('class') not in BLOCKING_CLASSES or 'footprint' not in pc: continue
        if it.get('up', 0) > 0 or pc.get('height', 99) < MIN_BLOCK_M: continue
        cx_, cy_ = int(it['x'] // CELL), int(it['y'] // CELL)
        if not (0 <= cx_ < gw and 0 <= cy_ < gh) or not walk[cy_, cx_]: continue    # in the woods or the sea: nobody comes near
        foot.append(it)
    foot.sort(key=lambda it: (snap(it['y']), snap(it['x']), it['p']))
    prop_rock = []
    for it in foot:
        pc = kit.KIT['pieces'][it['p']]
        fw, fd = pc['footprint']
        for s in footprint_walls(it['x'], it['y'], it['rot'], fw, fd, pc.get('shape') == 'round', PASSAGES.get(it['p'], ())):
            prop_rock.append([snap(s[0] - ox), snap(s[1] - oy), snap(s[2] - ox), snap(s[3] - oy)])

    # ---- markers and starts ----
    tags = json.load(open(TAGS, encoding='utf-8')).get('markers', {})
    starts, markers, seen = [None] * 4, [], set()
    import re
    for o in sorted((o for o in sc.get('objects', []) if o.get('kind') == 'marker'), key=lambda o: o.get('id', '')):
        mid, at = o.get('id'), o.get('at')
        if not isinstance(mid, str) or not re.match(r'^[a-z][a-z0-9-]*$', mid): problems.append(f'marker {mid!r}: id must be lower-case letters, digits and dashes'); continue
        if mid in seen: problems.append(f'two markers are called {mid}'); continue
        seen.add(mid)
        x, y = snap(at[0] * G - ox), snap(at[1] * G - oy)
        m = re.match(r'^start-([0-3])$', mid)
        if m: starts[int(m.group(1))] = [x, y]; continue
        tag = o.get('tag')
        if tag and tag not in tags: problems.append(f'marker {mid}: no marker tag {tag!r} in game/content/tags.json')
        markers.append(dict(id=mid, x=x, y=y, **({'tag': tag} if tag else {})))
    for s in range(4):
        if starts[s] is None: problems.append(f'no marker start-{s} (seat {s}\'s start)')

    room = dict(id=name, w=snap(W), h=snap(H), terrain=terrain, rock=rock + [c[0] for c in cliffs], starts=[s for s in starts if s],
                dummies=[], portals=[], altars=[], props=[], propRock=prop_rock, markers=markers, regions=[],
                height=dict(metres=[snap(h) if abs(h * 100 - round(h * 100)) < 1e-6 else h for h in used], rows=rows, cliffs=[c[1] for c in cliffs]))

    # ---- the height-ready data (height3d): surfaces per cell, and every height edge ----
    surfaces = [dict(id=t['id'], kind='terrace', h=t['h']) for t in terr] + \
               [dict(id=f['src'], kind='flight', top=f['h'], bottom=f['low'], dir=[f['dx'], f['dy']]) for f in flights]
    sid = np.where(is_fl, len(terr) + fl, surf)
    srows = [''.join(TIER_CHARS[sid[y, x]] for x in range(gw)) for y in range(gh)]
    he = merge_runs(h_edges, gh + 1, gw, lambda y, a, b, k: [X(a), Y(y), X(b), Y(y), *k])
    ve = merge_runs(v_edges, gw + 1, gh, lambda x, a, b, k: [X(x), Y(a), X(x), Y(b), *k])
    height3d = dict(
        about='Not read by the sim yet. surfaces: each cell\'s surface (rows: a character per cell, its index in surfaces as in '
              'TIER_CHARS). edges: every edge where two surfaces meet at different heights, as runs [x1, y1, x2, y2, kind, top, '
              'hA, hB] in sim units: kind indexes kinds, top is the edge\'s top in metres (a parapet\'s rail), hA the height on '
              'the run\'s upper (smaller y) or left side and hB on the other. A flight cell\'s height is its tread\'s.',
        surfaces=surfaces, rows=srows, kinds=EDGE_KINDS, edges=he + ve)

    doc = dict(
        about='Generated by tools/kit/room.py from tools/kit/scenes/' + name + '.scene.json. Do not edit: change the scene and '
              're-run it. 1 sim u = 1 kit u (0.6 m). A sim point (x, y) is the scene point (x + toScene[0], y + toScene[1]) in u; '
              'a scene corner (cx, cy) is the scene point (cx * G, cy * G).',
        scene=name, sceneHash=scene_hash(name), toScene=[snap(ox), snap(oy)], G=G, room=room, height3d=height3d)
    if problems: raise SystemExit(f'{name}: the room has {len(problems)} problem(s):\n  - ' + '\n  - '.join(problems))
    summary = dict(cells=f'{gw} x {gh}', walkable=int(walk.sum()), stair=int(stair.sum()), rock=len(rock), cliffs=len(cliffs),
                   propRock=len(prop_rock), footprints=len(foot), edges=len(he) + len(ve), markers=len(markers))
    return write_json(doc), summary


def _num(v):
    if isinstance(v, bool): return 'true' if v else 'false'
    if isinstance(v, (int, np.integer)): return str(int(v))
    if isinstance(v, float):
        if v == int(v) and abs(v) < 1e15: return str(int(v))
        return repr(v)
    return json.dumps(v, ensure_ascii=False)


def write_json(doc):
    """JSON in a fixed layout: objects in insertion order, a list of scalars on one line, a list of lists or strings one
    item per line."""
    out = []

    def w(v, ind):
        pad, end = '  ' * (ind + 1), '  ' * ind
        if isinstance(v, dict):
            if not v: out.append('{}'); return
            out.append('{\n')
            for i, (k, x) in enumerate(v.items()):
                out.append(pad + json.dumps(k) + ': '); w(x, ind + 1); out.append(',\n' if i < len(v) - 1 else '\n')
            out.append(end + '}')
        elif isinstance(v, list):
            if not v: out.append('[]'); return
            if all(not isinstance(x, (list, dict, str)) for x in v):
                out.append('[' + ', '.join(_num(x) for x in v) + ']'); return
            if all(isinstance(x, list) and all(not isinstance(y, (list, dict)) for y in x) for x in v) or all(isinstance(x, (str, dict)) for x in v):
                out.append('[\n')
                for i, x in enumerate(v):
                    out.append(pad)
                    if isinstance(x, list): out.append('[' + ', '.join(_num(y) for y in x) + ']')
                    elif isinstance(x, dict): out.append(json.dumps(x, ensure_ascii=False, separators=(', ', ': ')))
                    else: out.append(json.dumps(x, ensure_ascii=False))
                    out.append(',\n' if i < len(v) - 1 else '\n')
                out.append(end + ']'); return
            out.append('[\n')
            for i, x in enumerate(v):
                out.append(pad); w(x, ind + 1); out.append(',\n' if i < len(v) - 1 else '\n')
            out.append(end + ']')
        else:
            out.append(_num(v))
    w(doc, 0)
    return ''.join(out) + '\n'


def out_path(name):
    return os.path.join(OUT_DIR, name + '.room.json')


def write(name, r=None):
    t = time.time()
    text, summary = export(name, r)
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(out_path(name), 'w', encoding='utf-8', newline='\n') as f: f.write(text)
    print(f'{name}: room -> {os.path.relpath(out_path(name))} in {time.time() - t:.1f} s: ' + ', '.join(f'{k} {v}' for k, v in summary.items()))
    return text


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not args: raise SystemExit('usage: python tools/kit/room.py <scene> [--check | --stdout]')
    name = args[0]
    if '--stdout' in sys.argv: sys.stdout.write(export(name)[0]); return
    if '--check' in sys.argv:
        a, b = export(name)[0], export(name)[0]
        committed = open(out_path(name), encoding='utf-8').read().replace('\r\n', '\n') if os.path.exists(out_path(name)) else None
        if a != b: raise SystemExit(f'{name}: two exports differ')
        if committed != a: raise SystemExit(f'{name}: {os.path.relpath(out_path(name))} is not what the scene exports: run python tools/kit/room.py {name}')
        print(f'{name}: two exports are byte-identical and match the committed file'); return
    write(name)


if __name__ == '__main__':
    main()
