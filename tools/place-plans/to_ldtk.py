"""Plan to level: phase 6 of docs/threads/height.md. Writes a plan spec's cells into the game's LDtk level, so the chosen
plan becomes the stage-2 grey-box without being redrawn.

  python tools/place-plans/to_ldtk.py court-d
  (then, from game/) npm run content:build && npm run content:check

What it writes, from the plan's 1 u world cells (each becomes 2 x 2 of the level's 0.5 u cells):
  Terrain   walkable cells are floor; void is void (outside the outline); everything else (buildings, trees, rock, water,
            the sea) is rock, so it stops you and its outline becomes walls.
  Height    every distinct height is its own tier (up to 61), tierMetres lists them lowest first. Buildings, trees and
            water get their top's height too, for drawing. Cells more than 0.5 m apart are parted by a cliff, so a flight
            of stairs (0.35 m steps) walks, and its sides are cliffs where they stand above the ground beside them.
  Ground    what each material looks like (MATERIAL_GROUND below).
  Entities  the four starts, Markers for the gates, the doors and the landmark (ids in LEVELS below), a Marker for each
            of the spec's MARKERS ({id: (U, V)}, spots the room's sim looks up by id, like the drill yard's stations), and
            the few props a level lists in LEVELS (a landmark's volume, which the flow stage has to see). Everything else is the
            plan alone; props come with the beauty stage.

The level replaces the room's previous one (its uid and place in LDtk's world view are kept), so whatever wrote it
before (tools/segments/01-opening/court-level.py for the court) is superseded. The plan specs are untouched: this file
runs a spec with its drawing switched off and reads its Plan.
"""
import json, math, os, runpy, sys, uuid
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import plan as planmod

MAPS = os.path.normpath(os.path.join(HERE, '../../game/content/maps'))
PROPS_DIR = os.path.normpath(os.path.join(HERE, '../../game/content/assets/props'))
PX = 20          # LDtk px per world unit
SUB = 2          # level cells per plan cell (0.5 u cells, 1 u plan cells)
R2 = math.sqrt(0.5)

# What each plan material looks like on the ground (game/content/README.md, Ground layer).
MATERIAL_GROUND = {
    'grass': 'grass', 'path': 'dirt', 'road': 'cobble', 'paving': 'flagstone', 'plaza': 'flagstone', 'dais': 'flagstone',   # one warm family: the white slabs read as bathroom tile (beauty critic, 2026-11-22)
    'stairs': 'flagstone', 'wood': 'planks', 'sand': 'sand', 'water': 'water', 'deep': 'water', 'trees': 'leaves',
    'rock': 'gravel', 'roof': 'slabs', 'wall': 'flagstone', 'void': None,   # roofs never a floor material (the sense critic); slabs toned to blue-grey slate for them, parapets topped in warm stone (the beauty critic, 2026-11-22)
}

# Per spec: the level it writes, and the ids its markers get. Gate ids are what the sim looks for (sim/src/court.ts).
LEVELS = {
    'court-d': dict(
        level='Court',
        gates={'to the drill yard': 'gate-yard', 'to the battery': 'gate-battery', 'north road': 'gate-north', 'sea landing': 'gate-sea'},
        landmarks={'the armillary': 'armillary'},
        start='journey',   # the first pass's first point
        # (asset, the landmark it stands on, blocks): the great armillary on its dais, so the reveal can be judged
        props=[('codex-armillary-grand', 'the armillary', True)],
        # No vistas (camera pull-backs, client vista.ts): the user, 2026-11-22, "you'll see enough of it as you walk
        # around". A level that wants one lists (journey pass, 'first' or 'last' point) here as vistas=[...].
    ),
    'inf-d': dict(
        level='Infirmary',
        # gate ids are what the sim looks for (sim/src/infirmary.ts)
        gates={'from the main gate': 'gate-court', 'to the battery': 'gate-battery'},
        landmarks={'the well': 'well'},
        start=(0, -18),   # on the road in, 14 u past the main gate (a start inside a gate's reach would leave at once;
                          # rev 4's road is narrower at 10 u, where two starts stood within 0.7 u of its kerb)
    ),
    'yard-d': dict(
        level='Yard',
        # the station spots (sim/src/yard.ts) are the spec's MARKERS; 'gate' and 'focus' are among them, so the gate and
        # the landmark stand at their MARKERS spots
        gates={'to the courtyard': 'gate'},
        landmarks={'the rack': 'focus'},
        start=(44, 18),   # on the rim, 12 u in from the gate, facing the strike lanes (the journey's first point is the gate)
    ),
}

NS = uuid.UUID('6c1f0a52-3d7e-4b9a-8e21-5a4d9c7b0f13')
def iid(*parts): return str(uuid.uuid5(NS, '/'.join(map(str, parts))))


def load_plan(name):
    """Runs plans/<name>.py with its drawing switched off and returns its Plan."""
    return load_spec(name)[0]


def load_spec(name):
    """Runs plans/<name>.py with its drawing switched off: its Plan, and its MARKERS ({id: (U, V)}, the spots a room's
    sim looks up by id, e.g. the drill yard's stations; empty if the spec has none)."""
    render, argv = planmod.Plan.render, sys.argv
    planmod.Plan.render = lambda self: None
    sys.argv = [name + '.py']
    try:
        g = runpy.run_path(os.path.join(HERE, 'plans', name + '.py'))
    finally:
        planmod.Plan.render, sys.argv = render, argv
    P = next(v for v in g.values() if isinstance(v, planmod.Plan))
    P.dress = list(g.get('PROPS', []))   # the beauty stage's dressing: [(asset, (U, V), blocks)], written as Props
    return P, dict(g.get('MARKERS', {}))


# ---- LDtk's layout (the same as game/packages/content/src/ldtk.mjs stringify, so diffs stay small) ----------------
def stringify(value):
    out = []
    def flat(v): return isinstance(v, list) and all(x is None or not isinstance(x, (dict, list)) for x in v)
    def dump(x): return json.dumps(x, ensure_ascii=False)
    def write(v, indent, row_len):
        if not isinstance(v, (dict, list)): out.append(dump(v)); return
        pad, end = '\t' * (indent + 1), '\t' * indent
        if isinstance(v, list):
            if not v: out.append('[]'); return
            if row_len and flat(v):
                out.append('[\n')
                for i in range(0, len(v), row_len):
                    out.append(pad + ','.join(dump(x) for x in v[i:i + row_len]) + (',' if i + row_len < len(v) else '') + '\n')
                out.append(end + ']'); return
            if flat(v): out.append('[ ' + ', '.join(dump(x) for x in v) + ' ]'); return
            out.append('[\n')
            for i, x in enumerate(v):
                out.append(pad); write(x, indent + 1, 0); out.append(',\n' if i < len(v) - 1 else '\n')
            out.append(end + ']'); return
        if not v: out.append('{}'); return
        out.append('{\n')
        keys = list(v.keys())
        for i, k in enumerate(keys):
            out.append(pad + dump(k) + ': ')
            write(v[k], indent + 1, v.get('__cWid', 0) if k == 'intGridCsv' else 0)
            out.append(',\n' if i < len(keys) - 1 else '\n')
        out.append(end + '}')
    write(value, 0, 0)
    return ''.join(out) + '\n'

def save(path, value):
    with open(path, 'w', encoding='utf-8', newline='\n') as f: f.write(stringify(value))


def write_level(name):
    cfg = LEVELS[name]
    P, MARKERS = load_spec(name)
    project_path = os.path.join(MAPS, 'world.ldtk')
    project = json.load(open(project_path, encoding='utf-8'))
    layer_defs = {l['identifier']: l for l in project['defs']['layers']}
    values = lambda layer: {v['identifier']: v['value'] for v in layer_defs[layer]['intGridValues']}
    TV, HV, GV = values('Terrain'), values('Height'), values('Ground')

    # ---- the cells ----
    walk = np.vectorize(lambda m: planmod.MAT[m][2])(P.m)
    void = P.m == 'void'
    heights = np.round(P.h.astype(np.float64), 2)
    tiers = sorted(set(heights[~void].ravel().tolist()))
    if len(tiers) > 62: raise SystemExit(f'{name}: {len(tiers)} distinct heights; a level has at most 62 tiers (round the plan\'s heights)')
    tier = {h: i for i, h in enumerate(tiers)}
    ny, nx = P.h.shape
    CW, CH = nx * SUB, ny * SUB
    terrain, height, ground = [0] * (CW * CH), [0] * (CW * CH), [0] * (CW * CH)
    for i in range(ny):
        for j in range(nx):
            m = P.m[i, j]
            t = 0 if walk[i, j] else TV['void'] if void[i, j] else TV['rock']
            hv = 0 if void[i, j] else tier[heights[i, j]]
            hv = 0 if hv == 0 else HV[f't{hv}']
            g = MATERIAL_GROUND[m]
            gv = GV[g] if g else 0
            for di in range(SUB):
                for dj in range(SUB):
                    k = (i * SUB + di) * CW + j * SUB + dj
                    terrain[k], height[k], ground[k] = t, hv, gv

    # ---- plan points (U, V) -> the room's world units (origin at its centre) ----
    W, H = nx, ny
    cx0, cy0 = P.x0 + W / 2, P.y0 + H / 2
    def world(p):
        u, v = p
        return ((u + v) * R2 - cx0, (v - u) * R2 - cy0)
    def px(p):
        x, y = world(p)
        return [int(round(min(W, max(0, x + W / 2)) * PX)), int(round(min(H, max(0, y + H / 2)) * PX))]

    # ---- entities, from the samples in the current levels ----
    samples = {}
    for stub in project['levels']:
        lv = json.load(open(os.path.join(MAPS, stub['externalRelPath']), encoding='utf-8'))
        for li in lv['layerInstances']:
            for e in li['entityInstances']: samples.setdefault(e['__identifier'], e)
    def entity(kind, key, p, fields):
        e = json.loads(json.dumps(samples[kind]))
        e['iid'] = iid(name, kind, key); e['px'] = px(p); e['__grid'] = [e['px'][0] // 10, e['px'][1] // 10]
        e['__worldX'] = e['__worldY'] = None
        for f in e['fieldInstances']:
            v = fields.get(f['__identifier'])
            f['__value'] = v
            f['realEditorValues'] = [] if v is None else [{'id': 'V_' + f['__type'], 'params': [v]}]
        return e
    es = []
    start = P.passes[0][0][0] if cfg['start'] == 'journey' else cfg['start']
    for s, (du, dv) in enumerate([(-1.3, -1.3), (1.3, -1.3), (-1.3, 1.3), (1.3, 1.3)]):
        es.append(entity('PlayerStart', s, (start[0] + du, start[1] + dv), {'seat': s}))
    # a gate or landmark whose id is also in the spec's MARKERS stands at the MARKERS spot (the sim's), written once
    for (p, label) in P.gates:
        if label not in cfg['gates']: raise SystemExit(f'{name}: gate "{label}" has no id in LEVELS')
        gid = cfg['gates'][label]
        es.append(entity('Marker', gid, MARKERS.get(gid, p), {'id': gid}))
    for n, (p, _) in enumerate(P.doors):
        es.append(entity('Marker', f'door-{n + 1}', p, {'id': f'door-{n + 1}'}))
    for (p, label, *_) in P.marks:
        mid = cfg['landmarks'].get(label) or label.replace('the ', '').replace(' ', '-')
        es.append(entity('Marker', mid, MARKERS.get(mid, p), {'id': mid, 'tag': 'landmark'}))   # the camera keeps a landmark in frame near it
    written = set(cfg['gates'].values()) | {cfg['landmarks'].get(l) or l.replace('the ', '').replace(' ', '-') for (_, l, *_) in P.marks}
    for mid, p in MARKERS.items():
        if mid not in written: es.append(entity('Marker', mid, p, {'id': mid}))
    for n, (k, end) in enumerate(cfg.get('vistas', [])):
        pts = P.passes[k][0]
        es.append(entity('Marker', f'vista-{n + 1}', pts[0] if end == 'first' else pts[-1], {'id': f'vista-{n + 1}', 'tag': 'vista'}))
    marks = {label: p for (p, label, *_) in P.marks}
    for n, (asset, at, blocks) in enumerate(cfg.get('props', [])):
        if at not in marks: raise SystemExit(f'{name}: prop {asset} stands on the landmark "{at}", which the plan doesn\'t have')
        es.append(entity('Prop', f'prop-{n}', marks[at], {'asset': asset, 'blocks': blocks, 'tag': None}))
    for n, (asset, p, blocks) in enumerate(getattr(P, 'dress', [])):
        if not os.path.isdir(os.path.join(PROPS_DIR, asset)): raise SystemExit(f'{name}: no prop "{asset}" in {PROPS_DIR}')
        es.append(entity('Prop', f'dress-{n}', p, {'asset': asset, 'blocks': blocks, 'tag': None}))

    # ---- the level: the room's current file as the template, so its uid and place in the world view stay ----
    level_name = cfg['level']
    path = os.path.join(MAPS, 'world', level_name + '.ldtkl')
    stub = next((l for l in project['levels'] if l['identifier'] == level_name), None)
    if stub is None:
        # a new room: the Court's level as the template (its layers and fields), a new uid, placed right of every level
        template = json.load(open(os.path.join(MAPS, 'world', 'Court.ldtkl'), encoding='utf-8'))
        uid = project['nextUid']; project['nextUid'] = uid + 1
        right = max(l['worldX'] + l['pxWid'] for l in project['levels']) + 200
        template.update(identifier=level_name, iid=iid(name, 'level'), uid=uid, worldX=right, worldY=0)
        for li in template['layerInstances']: li.update(iid=iid(name, 'layer', li['__identifier']), levelId=uid)
        save(path, template)
        stub = {k: v for k, v in template.items() if k != '__header__'}
        stub.update(layerInstances=None, externalRelPath=f'world/{level_name}.ldtkl')
        project['levels'].append(stub)
        print(f'{level_name}: a new level (uid {uid}), added to world.ldtk')
    level = json.load(open(path, encoding='utf-8'))
    level.update(pxWid=W * PX, pxHei=H * PX)
    for li in level['layerInstances']:
        li.update(__cWid=CW, __cHei=CH)
        if li['__identifier'] == 'Entities': li['entityInstances'] = es
        elif li['__identifier'] == 'Terrain': li['intGridCsv'] = terrain
        elif li['__identifier'] == 'Height': li['intGridCsv'] = height
        elif li['__identifier'] == 'Ground': li['intGridCsv'] = ground
    for f in level['fieldInstances']:
        if f['__identifier'] == 'tierMetres':
            f['__value'] = tiers
            f['realEditorValues'] = [{'id': 'V_Float', 'params': [t]} for t in tiers]
    save(path, level)
    stub.update(pxWid=W * PX, pxHei=H * PX, fieldInstances=json.loads(json.dumps(level['fieldInstances'])))
    save(project_path, project)
    print(f'{level_name}: {W} x {H} u from {name}, {len(tiers)} tiers ({tiers[0]} to {tiers[-1]} m), {len(es)} entities. '
          'Now run (from game/): npm run content:build && npm run content:check')


STEP_M = 0.5   # the game's walkable step (game/packages/content/src/compile.mjs STEP_M): more is a cliff
DROP_M, DROP_NEAR = 1.0, 2   # a drop of more than DROP_M metres within DROP_NEAR u of a route wants a lip (the sense rules)

def report(name, P=None):
    """What the level will walk like, at the plan's resolution: the walkable regions (cells joined by steps of at most
    STEP_M) with the gates, doors, landmarks and starts in each, and every jump of more than STEP_M inside a flight of
    stairs (two stair cells side by side: a flight should never have a cliff in it). Positions are plan (U, V).
    The game's own check (content:check) is stricter: it also keeps bodies 0.7 u off every wall."""
    cfg = LEVELS[name]
    P, MARKERS = (P, {}) if P else load_spec(name)
    walk = np.vectorize(lambda m: planmod.MAT[m][2])(P.m)
    ny, nx = P.h.shape
    uv = lambda i, j: (round(float(P.CU[i, j]), 1), round(float(P.CV[i, j]), 1))
    # jumps inside flights
    st = P.m == 'stairs'
    jumps = []
    for di, dj in ((0, 1), (1, 0)):
        for i in range(ny - di):
            for j in range(nx - dj):
                if st[i, j] and st[i + di, j + dj] and abs(P.h[i, j] - P.h[i + di, j + dj]) > STEP_M:
                    jumps.append((uv(i, j), float(P.h[i, j]), float(P.h[i + di, j + dj])))
    # regions
    comp = np.full((ny, nx), -1, dtype=np.int32); sizes = []
    for i0 in range(ny):
        for j0 in range(nx):
            if not walk[i0, j0] or comp[i0, j0] >= 0: continue
            c = len(sizes); comp[i0, j0] = c; stack = [(i0, j0)]; n = 0
            while stack:
                i, j = stack.pop(); n += 1
                for a, b in ((i + 1, j), (i - 1, j), (i, j + 1), (i, j - 1)):
                    if 0 <= a < ny and 0 <= b < nx and walk[a, b] and comp[a, b] < 0 and abs(P.h[a, b] - P.h[i, j]) <= STEP_M:
                        comp[a, b] = c; stack.append((a, b))
            sizes.append(n)
    def where(p):
        i, j = int((p[1] - p[0]) * R2 - P.y0), int((p[0] + p[1]) * R2 - P.x0)
        return comp[i, j] if 0 <= i < ny and 0 <= j < nx else -1
    things = {}
    start = P.passes[0][0][0] if cfg['start'] == 'journey' else cfg['start']
    things.setdefault(where(start), []).append('the start')
    for p, label in P.gates: things.setdefault(where(p), []).append(cfg['gates'].get(label, label))
    for n, (p, _) in enumerate(P.doors): things.setdefault(where(p), []).append(f'door-{n + 1}')
    for p, label, *_ in P.marks: things.setdefault(where(p), []).append(cfg['landmarks'].get(label, label))
    for mid, p in MARKERS.items(): things.setdefault(where(p), []).append(f'marker {mid}')
    order = sorted(range(len(sizes)), key=lambda c: -sizes[c])
    print(f'{name}: {len(sizes)} walkable regions joined by steps of at most {STEP_M} m (largest first; regions under 30 u2 left out unless they hold something):')
    for c in order:
        if sizes[c] < 30 and c not in things: continue
        i, j = np.argwhere(comp == c)[0]
        print(f'  {sizes[c]:6d} u2 at {float(P.h[i, j]):5.2f} m near {uv(i, j)}: {", ".join(things.get(c, [])) or "-"}')
    if -1 in things: print('  not on walkable ground:', ', '.join(things[-1]))
    print(f'{len(jumps)} jumps of more than {STEP_M} m inside flights of stairs' + (', e.g. (U, V, from m, to m):' if jumps else ''))
    for (u, v), a, b in jumps[:12]: print(f'  ({u}, {v}) {a:.2f} -> {b:.2f}')
    start_c = where(start)
    cut_off = [t for c, ts in things.items() if c != start_c for t in ts]

    # along the routes (the journey's passes, and any route drawn): every 0.5 u
    samples = []
    for pts in [p for p, *_ in P.passes] + [p for p, _ in P.routes]:
        for (u0, v0), (u1, v1) in zip(pts, pts[1:]):
            n = max(1, int(math.hypot(u1 - u0, v1 - v0) / 0.5))
            samples += [(u0 + (u1 - u0) * k / n, v0 + (v1 - v0) * k / n) for k in range(n + 1)]
    cell = lambda p: (int((p[1] - p[0]) * R2 - P.y0), int((p[0] + p[1]) * R2 - P.x0))
    # unguarded drops: walkable ground within DROP_NEAR of a route standing more than DROP_M over its neighbour, with no
    # lip (the neighbour is the drop itself, not a raised kerb, parapet or wall between)
    drops = {}
    for p in samples:
        ci, cj = cell(p)
        for i in range(ci - DROP_NEAR, ci + DROP_NEAR + 1):
            for j in range(cj - DROP_NEAR, cj + DROP_NEAR + 1):
                if not (0 <= i < ny and 0 <= j < nx) or not walk[i, j] or (i, j) in drops: continue
                if math.hypot(float(P.CU[i, j]) - p[0], float(P.CV[i, j]) - p[1]) > DROP_NEAR: continue
                for a, b in ((i + 1, j), (i - 1, j), (i, j + 1), (i, j - 1)):
                    if 0 <= a < ny and 0 <= b < nx and P.m[a, b] != 'void' and P.h[i, j] - P.h[a, b] > DROP_M:
                        drops[(i, j)] = float(P.h[i, j] - P.h[a, b]); break
    print(f'{len(drops)} cells of route-side ground (within {DROP_NEAR} u of a route) over an unguarded drop of more than {DROP_M} m' + (', e.g. (U, V, drop m):' if drops else ''))
    for (i, j), d in list(drops.items())[:8]: print(f'  {uv(i, j)} {d:.1f}')
    # walkable regions no route reaches
    reached = {comp[i, j] for i, j in map(cell, samples) if 0 <= i < ny and 0 <= j < nx and comp[i, j] >= 0}
    unvisited = [c for c in order if sizes[c] >= 30 and c not in reached]
    print(f'{len(unvisited)} walkable regions of 30 u2 or more that no route passes through' + (':' if unvisited else ''))
    for c in unvisited:
        i, j = np.argwhere(comp == c)[0]
        print(f'  {sizes[c]:6d} u2 at {float(P.h[i, j]):5.2f} m near {uv(i, j)}')
    # the world's edge in view: walkable ground nearer the plan's box than the camera sees (the sense critics, 2026-11-22:
    # the yard's woods and the infirmary's sea stopped a screen out, and the edge showed as a sheer drop). The camera
    # shows about 7 u to each side and 8 u down, but the ground's face at the world's edge hangs below it by its height
    # (z * 14.5 px against 8 px per u of V: about 1.8 u per metre), so the margin at the bottom grows with the height.
    EDGE = dict(bottom=10, per_m=1.8, sides=12, top=12)
    bottom = P.V[1] - (EDGE['bottom'] + EDGE['per_m'] * np.maximum(P.h, 0))
    near_edge = walk & ((P.CV > bottom) | (P.CU < P.U[0] + EDGE['sides']) | (P.CU > P.U[1] - EDGE['sides']) | (P.CV < P.V[0] + EDGE['top']))
    # only ground you can stand on without leaving: reached from the start with every gate's reach (3 u) closed
    from scipy import ndimage as _nd
    open_ = walk.copy()
    for g, _ in P.gates: open_ &= np.hypot(P.CU - g[0], P.CV - g[1]) > 3.5
    lab, _n = _nd.label(open_)
    s0 = P.passes[0][0][0] if P.passes else (0, 0)
    k = np.unravel_index(np.argmin(np.hypot(P.CU - s0[0], P.CV - s0[1]) + np.where(open_, 0, 1e9)), walk.shape)
    near_edge &= lab == lab[k]
    for g, _ in P.gates: near_edge &= np.hypot(P.CU - g[0], P.CV - g[1]) > 6   # stepping into a gate may see the edge
    print(f'{int(near_edge.sum())} u2 of walkable ground within sight of the world\'s edge (bottom {EDGE["bottom"]} u + {EDGE["per_m"]} u a metre, sides {EDGE["sides"]} u, top {EDGE["top"]} u; ground past a gate or within 6 u of one not counted)' + (', e.g.' if near_edge.any() else ''))
    for i, j in np.argwhere(near_edge)[:4]: print(f'  {uv(i, j)}')
    # the dressing: a blocking prop off walkable ground (it would float or stand in a wall) or within 1.5 u of a route
    bad = []
    if getattr(P, 'dress', None):
        from finish import route_mask
        onroute = route_mask(P, 1.5)
        for asset, (pu, pv), blocks in P.dress:
            i, j = np.unravel_index(np.argmin(np.hypot(P.CU - pu, P.CV - pv)), walk.shape)
            if blocks and (not walk[i, j] or onroute[i, j]): bad.append((asset, (pu, pv), 'on a route' if walk[i, j] else 'off walkable ground'))
        print(f'{len(P.dress)} props; {len(bad)} blocking ones on a route or off walkable ground' + (':' if bad else ''))
        for b in bad[:8]: print('  ', *b)
    return dict(regions=len(sizes), jumps=len(jumps), cut_off=cut_off, drops=len(drops), unvisited=len(unvisited), edge=int(near_edge.sum()), props=len(bad))


if __name__ == '__main__':
    if len(sys.argv) < 2 or sys.argv[1] not in LEVELS:
        raise SystemExit(f'usage: python tools/place-plans/to_ldtk.py <{"|".join(LEVELS)}> [--report]   (--report: only say how it walks)')
    r = report(sys.argv[1])
    if r['cut_off']: print('cut off from the start:', ', '.join(r['cut_off']))
    if '--report' not in sys.argv: write_level(sys.argv[1])
