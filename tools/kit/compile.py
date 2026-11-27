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
import itertools, json, math, os, re, runpy, sys
from shapely.geometry import Polygon, Point, LineString
from shapely.ops import unary_union

HERE = os.path.dirname(os.path.abspath(__file__))
KIT = json.load(open(os.path.join(HERE, 'kit.json'), encoding='utf-8'))
RISE, GOING = 0.15, 0.5          # m per step, u per tread (kit.json connector.flight)
CLIFF_MIN = 2.0                  # m: an open edge this far over the sea (water, or the rock and sand at its edge) is a sea cliff (cliff.face)
CLIFF_FOOT = ('water', 'plinth', 'rock', 'sand')
FALL_MIN = 0.5                   # m: water this far above lower water pours into it as a fall (fall.curtain)
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


PIPE_H, PIPE_R = 0.5, 0.22       # a pipe's default height above the floor (m) and radius (u)
PIPE_SADDLE = 3.0                # u between the sandstone saddles under a level run
PIPE_FLOAT = 1.0                 # m: a level run higher than this over its floor (away from its ends) is a warning


def footprint(v, G):
    """A placed piece's footprint in corners (a box turned to its front and turn, or a circle) and its kit.json entry."""
    pc = KIT['pieces'].get(v.get('piece'))
    if not pc or 'footprint' not in pc: return None, pc
    fw, fd = pc['footprint']; dx, dy = OUT[v.get('front', 'S')]
    hw, hd = (fw / 2 / G, fd / 2 / G) if dy else (fd / 2 / G, fw / 2 / G)
    cx0, cy0 = v['at']
    if pc.get('shape') == 'round': return Point(v['at']).buffer(hw * 0.98, 24), pc
    box = [(cx0 - hw, cy0 - hd), (cx0 + hw, cy0 - hd), (cx0 + hw, cy0 + hd), (cx0 - hw, cy0 + hd)]
    if v.get('turn'):
        t = math.radians(v['turn']); c0, s0 = math.cos(t), math.sin(t)
        box = [(cx0 + (px - cx0) * c0 - (py - cy0) * s0, cy0 + (px - cx0) * s0 + (py - cy0) * c0) for px, py in box]
    return Polygon(box), pc


def pipes(objs, floor_u, T, G, nx, ny, placed, err, label):
    """Conduit pipes ({kind: pipe, pts: [[x, y] or [x, y, z m]], h?, r?}): dressing the renderer draws to size along
    their route (kit-pipe.ts), never models. Each becomes one pipe.run: pts resolved to [x u, y u, z m] (a point without
    z sits h above the floor there), what each end does (open: a mouth with a collar; plug: stops at a set piece's or
    vignette's footprint; tee: joins another pipe's run), and saddles [x u, y u, floor m, pipe z m, angle] under level runs.
    Checks: pipe-point (a point off the map or over no floor), pipe-wall (through a building), pipe-setpiece (through a set
    piece other than at an end), and warnings pipe-float (a run over one floor, more than PIPE_FLOAT above it away from its
    ends; a hop over a drop is fine) and pipe-sink (dipping into its floor)."""
    from shapely.prepared import prep
    if not objs: return []
    fl = [(T[ch]['h'], ch, prep(u.buffer(1e-6))) for ch, u in floor_u.items()]

    def floor_at(x, y):
        """the topmost floor at (x, y), in corners: (height m, glyph), or (None, None) over nothing"""
        p, best = Point(x, y), (None, None)
        for h, ch, pu in fl:
            if (best[0] is None or h > best[0]) and pu.contains(p): best = (h, ch)
        return best
    solids = []      # (object, footprint, top m, a set piece?)
    for v in placed:
        box, pc = footprint(v, G)
        if box is None: continue
        fh = floor_at(*v['at'])[0]
        solids.append((v, box, (fh or 0.0) + pc.get('height', 2.0), v.get('kind') == 'setpiece'))
    lerp = lambda a, b, t: [a[i] + (b[i] - a[i]) * t for i in range(3)]
    done = []
    for o in objs:
        h, r = o.get('h', PIPE_H), o.get('r', PIPE_R)
        raw = o.get('pts') or []
        if len(raw) < 2:
            err('pipe-point', f"{label(o)}: a pipe needs two points or more", raw[0][:2] if raw else None, [o['id']]); continue
        P, bad = [], False
        for p in raw:
            x, y = p[0], p[1]
            if not (0 <= x <= nx and 0 <= y <= ny):
                err('pipe-point', f"{label(o)}: its point ({x},{y}) is off the map", (x, y), [o['id']]); bad = True; continue
            fh = floor_at(x, y)[0]
            if len(p) < 3 and fh is None:
                err('pipe-point', f"{label(o)}: no floor under its point ({x},{y}) to sit on (give it a height: [x, y, z])", (x, y), [o['id']]); bad = True; continue
            q = [float(x), float(y), float(p[2]) if len(p) > 2 else fh + h]
            if not P or max(abs(q[i] - P[-1][i]) for i in range(3)) > 1e-6: P.append(q)
        if bad or len(P) < 2: continue
        ends, plugs = ['open', 'open'], [None, None]
        # an end on (or in) a placed piece's footprint plugs into it: the run is cut where it meets the footprint
        for k, (i, j) in enumerate(((0, 1), (-1, -2))):
            e, nb = P[i], P[j]
            for v, box, top, _ in solids:
                if not box.buffer(0.15).contains(Point(e[0], e[1])) or e[2] > top: continue
                ends[k], plugs[k] = 'plug', v['id']
                if math.hypot(nb[0] - e[0], nb[1] - e[1]) < 1e-6: break       # a vertical run into it: as it is
                seg = LineString([e[:2], nb[:2]]); L = seg.length
                outside = seg.difference(box)
                if outside.is_empty:
                    err('pipe-setpiece', f"{label(o)}: its end run lies wholly inside {label(v)}", e[:2], [o['id'], v['id']]); break
                ts = [seg.project(Point(c)) for g in getattr(outside, 'geoms', [outside]) for c in g.coords]
                t = max(0.0, (min(ts) - 0.08) / L)                                 # just inside the footprint's face
                P[i] = lerp(e, nb, t)
                break
        done.append(dict(o=o, P=P, r=r, ends=ends, plugs=plugs))
    out = []
    for d in done:
        o, P, r = d['o'], d['P'], d['r']
        U = lambda q: (q[0] * G, q[1] * G, q[2] / 0.6)                            # corners and metres -> u
        tees = []
        for k, i in enumerate((0, -1)):
            if d['ends'][k] != 'open': continue
            ex, ey, ez = U(P[i])
            for d2 in done:
                if d2 is d: continue
                for a, b in zip(d2['P'], d2['P'][1:]):
                    a, b = U(a), U(b); ab = [b[n] - a[n] for n in range(3)]; LL = sum(c * c for c in ab) or 1e-9
                    t = max(0.0, min(1.0, ((ex - a[0]) * ab[0] + (ey - a[1]) * ab[1] + (ez - a[2]) * ab[2]) / LL))
                    c = [a[n] + ab[n] * t for n in range(3)]
                    if math.dist((ex, ey, ez), c) <= max(d2['r'], 0.15) + 0.05:
                        # the branch runs on to the main's centre line; the main's collar there is turned along the main
                        P[i] = [c[0] / G, c[1] / G, c[2] * 0.6]; Lab = math.sqrt(LL)
                        d['ends'][k] = 'tee'
                        tees.append(dict(end=k, into=d2['o']['id'], r=d2['r'], at=[round(c[0], 4), round(c[1], 4), round(c[2] * 0.6, 4)],
                                         dir=[round(ab[n] / Lab, 5) for n in range(3)]))
                        break
                if d['ends'][k] == 'tee': break
        saddles, flagged = [], set()
        e0, e1 = P[0][:2], P[-1][:2]
        for n, (a, b) in enumerate(zip(P, P[1:])):
            L = math.hypot(b[0] - a[0], b[1] - a[1])
            if L < 1e-6: continue                                                  # a vertical run: on a wall face, held by it
            k = max(2, int(L / 0.25) + 1)
            under = [floor_at(*lerp(a, b, s / k)[:2])[0] for s in range(1, k)]
            flat = None not in under and max(under) - min(under) < 0.3            # over one floor (a hop over a drop may float)
            for s in range(1, k):
                t = s / k; x, y, z = lerp(a, b, t)
                fh, g = floor_at(x, y)
                near_end = min(math.hypot(x - e0[0], y - e0[1]), math.hypot(x - e1[0], y - e1[1])) < 0.5
                if g and T[g].get('edge') == 'wall' and z < T[g]['h'] - 0.05 and not near_end and ('wall', n) not in flagged:
                    flagged.add(('wall', n))
                    err('pipe-wall', f"{label(o)}: runs through {T[g].get('name', g)} (a building) at ({x:.1f},{y:.1f})", (x, y), [o['id']])
                for v, box, top, is_sp in solids:
                    if not is_sp or v['id'] in d['plugs'] and near_end or z > top or ('sp', n, v['id']) in flagged: continue
                    if box.contains(Point(x, y)):
                        flagged.add(('sp', n, v['id']))
                        err('pipe-setpiece', f"{label(o)}: runs through {label(v)} at ({x:.1f},{y:.1f}); end it at the piece (it plugs in) or go round",
                            (x, y), [o['id'], v['id']])
                if fh is None: continue
                if z - r * 0.6 < fh - 0.05 and T[g].get('edge') != 'wall' and ('sink', n) not in flagged:   # (in a building: pipe-wall says it)
                    flagged.add(('sink', n))
                    err('pipe-sink', f"{label(o)}: sinks into the floor at ({x:.1f},{y:.1f}) ({z:.2f} m, the floor {fh:.2f} m)", (x, y), [o['id']], 'warning')
                if flat and z - fh > PIPE_FLOAT and min(t, 1 - t) * L > 0.6 and ('float', n) not in flagged:
                    flagged.add(('float', n))
                    err('pipe-float', f"{label(o)}: floats {z - fh:.1f} m over the floor at ({x:.1f},{y:.1f}) with nothing under it", (x, y), [o['id']], 'warning')
            # saddles: a level run (slope under 1 in 7) stands on one every PIPE_SADDLE u, where the floor is close below
            Lu = L * G
            if Lu < 1.0 or abs(b[2] - a[2]) / 0.6 > 0.15 * Lu: continue
            m = max(1, round(Lu / PIPE_SADDLE))
            for s in range(m):
                x, y, z = lerp(a, b, (s + 0.5) / m)
                fh, g = floor_at(x, y)
                if fh is None or T[g].get('mat') == 'water' or not (-0.01 <= z - r * 0.6 - fh <= 1.2): continue
                if any(box.contains(Point(x, y)) for _, box, _, _ in solids): continue
                saddles.append([round(x * G, 3), round(y * G, 3), fh, round(z, 3), round(math.atan2(b[1] - a[1], b[0] - a[0]), 4)])
        out.append(dict(p='pipe.run', x=P[0][0] * G, y=P[0][1] * G, h=min(q[2] for q in P), rot=0, r=r, src=o['id'], name=label(o),
                        pts=[[round(q[0] * G, 4), round(q[1] * G, 4), round(q[2], 4)] for q in P],
                        ends=d['ends'], tees=tees, plugs=d['plugs'], saddles=saddles))
    return out


GLYPH_W = 0.9                    # u: a glyph path's default width
GLYPH_TINT = '#7ee05a'           # Life green, the infirmary's (docs/world/elements.md)
GLYPH_DRAPE = 0.3                # m: a run drapes over a change of floor this high or less (a kerb); more needs points with z
GLYPH_STATES = ('lit', 'dim', 'dark')


def wears(objs, G, nx, ny, err, label):
    """Worn footpaths ({kind: wear, pts: [[x, y], ...] corners, w?: u wide, default 1.2}): where people have trodden
    the lawn down to bare earth, along a line (door to road, tent to tent). Each becomes one ground.wear with pts in u;
    the renderer paints it into the ground (kit-ground.ts). Dressing only: it never blocks.
    Checks: wear-point (fewer than two points, or a point off the map)."""
    out = []
    for o in objs:
        raw = o.get('pts') or []
        if len(raw) < 2:
            err('wear-point', f"{label(o)}: a worn path needs two points or more", raw[0][:2] if raw else None, [o['id']]); continue
        off = [p for p in raw if not (0 <= p[0] <= nx and 0 <= p[1] <= ny)]
        if off:
            err('wear-point', f"{label(o)}: its point ({off[0][0]},{off[0][1]}) is off the map", tuple(off[0][:2]), [o['id']]); continue
        pts = [[round(p[0] * G, 3), round(p[1] * G, 3)] for p in raw]
        out.append({'p': 'ground.wear', 'x': pts[0][0], 'y': pts[0][1], 'h': 0.0, 'rot': 0.0, 'pts': pts,
                    'w': float(o.get('w', 1.2)), 'src': o['id']})
    return out


def glyphs(objs, floor_u, T, G, nx, ny, placed, err, label):
    """Glyph paths ({kind: glyph, pts: [[x, y] or [x, y, z m]], w?, tint?, state?}): runes carved flush into the floor
    that carry a well's power, drawn to size by the renderer (kit-glyph.ts). Each becomes one glyph.run: pts resolved to
    [x u, y u, z m] along the floor (draped over kerbs: a vertical step at the kerb's line; two points with the same x, y
    and different z climb a wall face as a vertical inlay), nodes [x u, y u, z m, kind] (pad at a free end, junction where
    an end lies on another glyph's run, bend at a corner), s0 (u: how far its start lies from its network's root, so the
    pulse runs on through a junction), w, tint, state. Dressing for walking: they never block.
    Checks: glyph-point (a point off the map, or over no walkable floor, or fewer than two), glyph-floor (a run over no
    walkable floor or water), glyph-drop (a run crossing a drop of more than GLYPH_DRAPE without points with z), glyph-state;
    warnings glyph-wall (a run over a building) and glyph-setpiece (through a set piece)."""
    from shapely.prepared import prep
    if not objs: return []
    fl = [(T[ch]['h'], ch, prep(u.buffer(1e-6))) for ch, u in floor_u.items()]
    near = {ch: prep(u.buffer(0.35)) for ch, u in floor_u.items()}

    def floor_at(x, y):
        p, best = Point(x, y), (None, None)
        for h, ch, pu in fl:
            if (best[0] is None or h > best[0]) and pu.contains(p): best = (h, ch)
        return best
    walkable = lambda g: g is not None and T[g].get('walk', True) and T[g].get('mat') != 'water'
    building = lambda g: g is not None and T[g].get('edge') == 'wall'
    solids = []
    for v in placed:
        if v.get('kind') != 'setpiece': continue
        box, pc = footprint(v, G)
        if box is not None: solids.append((v, box))
    done = []
    for o in objs:
        raw = o.get('pts') or []
        if len(raw) < 2:
            err('glyph-point', f"{label(o)}: a glyph path needs two points or more", raw[0][:2] if raw else None, [o['id']]); continue
        state = o.get('state', 'lit')
        if state not in GLYPH_STATES:
            err('glyph-state', f"{label(o)}: state {state!r} is not one of {', '.join(GLYPH_STATES)}", raw[0][:2], [o['id']]); state = 'lit'
        P, bad = [], False
        for p in raw:
            x, y = p[0], p[1]
            if not (0 <= x <= nx and 0 <= y <= ny):
                err('glyph-point', f"{label(o)}: its point ({x},{y}) is off the map", (x, y), [o['id']]); bad = True; continue
            fh, g = floor_at(x, y)
            if len(p) > 2:      # on a wall face: it needs a floor beside it
                if not any(pu.contains(Point(x, y)) for pu in near.values()):
                    err('glyph-point', f"{label(o)}: its point ({x},{y}, {p[2]} m) is nowhere near a floor", (x, y), [o['id']]); bad = True; continue
                q = [float(x), float(y), float(p[2]), True]
            else:
                if not (walkable(g) or building(g)):
                    err('glyph-point', f"{label(o)}: its point ({x},{y}) is over no walkable floor", (x, y), [o['id']]); bad = True; continue
                q = [float(x), float(y), fh, False]
            if not P or max(abs(q[i] - P[-1][i]) for i in range(3)) > 1e-6: P.append(q)
        if bad or len(P) < 2: continue
        # along the floor: each level run sampled, a vertical step put in where the floor under it changes (a kerb)
        R, flagged = [P[0][:3]], set()
        for n, (a, b) in enumerate(zip(P, P[1:])):
            L = math.hypot(b[0] - a[0], b[1] - a[1])
            if L < 1e-6 or a[3] or b[3]:          # a climb, or a run to or from a point on a wall face: as given
                R.append(b[:3]); continue
            k = max(2, int(L / 0.05) + 1)
            prev = (a[0], a[1], a[2])
            for s in range(1, k + 1):
                t = s / k; x, y = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
                fh, g = floor_at(x, y)
                if not (walkable(g) or building(g)):
                    if ('floor', n) not in flagged:
                        flagged.add(('floor', n)); err('glyph-floor', f"{label(o)}: runs over no walkable floor at ({x:.1f},{y:.1f})", (x, y), [o['id']])
                    continue
                if building(g) and ('wall', n) not in flagged:
                    flagged.add(('wall', n)); err('glyph-wall', f"{label(o)}: runs over {T[g].get('name', g)} (a building) at ({x:.1f},{y:.1f})", (x, y), [o['id']], 'warning')
                for v, box in solids:
                    if ('sp', v['id']) not in flagged and box.contains(Point(x, y)):
                        flagged.add(('sp', v['id'])); err('glyph-setpiece', f"{label(o)}: runs through {label(v)} at ({x:.1f},{y:.1f})", (x, y), [o['id'], v['id']], 'warning')
                if abs(fh - prev[2]) > 1e-6:
                    if abs(fh - prev[2]) > GLYPH_DRAPE + 1e-6:
                        if ('drop', n) not in flagged:
                            flagged.add(('drop', n))
                            err('glyph-drop', f"{label(o)}: crosses a drop of {abs(fh - prev[2]):.2f} m at ({x:.1f},{y:.1f}); climb it with points [x, y, z]", (x, y), [o['id']])
                    else:   # the kerb's line: bisect between the last sample and this one
                        lo, hi = 0.0, 1.0
                        for _ in range(20):
                            m = (lo + hi) / 2
                            if abs(floor_at(prev[0] + (x - prev[0]) * m, prev[1] + (y - prev[1]) * m)[0] - prev[2]) < 1e-6: lo = m
                            else: hi = m
                        ex, ey = prev[0] + (x - prev[0]) * hi, prev[1] + (y - prev[1]) * hi
                        R += [[ex, ey, prev[2]], [ex, ey, fh]]
                prev = (x, y, fh)
            R.append([b[0], b[1], prev[2]])
        Q = []
        for q in R:
            if not Q or max(abs(q[i] - Q[-1][i]) for i in range(3)) > 1e-6: Q.append(q)
        done.append(dict(o=o, P=Q, corners=[p[:3] for p in P], state=state))
    out = []
    U = lambda q: [round(q[0] * G, 4), round(q[1] * G, 4), round(q[2], 4)]
    plen = lambda P: [0.0] + list(itertools.accumulate(math.dist((a[0] * G, a[1] * G, a[2] / 0.6), (b[0] * G, b[1] * G, b[2] / 0.6)) for a, b in zip(P, P[1:])))
    for d in done:
        d['s'] = plen(d['P']); d['s0'] = 0.0; d['parent'] = None
    # ends: on another glyph's run (in plan, within its half width) a junction; else a pad
    for d in done:
        d['ends'] = ['pad', 'pad']
        for k, i in enumerate((0, -1)):
            ex, ey, ez = d['P'][i]
            for d2 in done:
                if d2 is d: continue
                hw = d2['o'].get('w', GLYPH_W) / 2 / G
                for n, (a, b) in enumerate(zip(d2['P'], d2['P'][1:])):
                    if abs(a[2] - ez) > 0.31 and abs(b[2] - ez) > 0.31: continue
                    seg = LineString([a[:2], b[:2]])
                    if seg.length < 1e-9 or seg.distance(Point(ex, ey)) > hw + 0.02: continue
                    t = seg.project(Point(ex, ey))
                    c = seg.interpolate(t)
                    d['ends'][k] = 'junction'
                    if k == 0: d['parent'] = (d2, d2['s'][n] + t * G)
                    d.setdefault('joins', []).append(dict(end=k, into=d2['o']['id'], at=[round(c.x * G, 4), round(c.y * G, 4), round(ez, 4)]))
                    break
                if d['ends'][k] == 'junction': break
    for _ in range(len(done)):     # the pulse runs on from the main into each branch whose start joins it
        for d in done:
            if d['parent']: d['s0'] = d['parent'][0]['s0'] + d['parent'][1]
    for d in done:
        o, P = d['o'], d['P']
        nodes = []
        for k, i in enumerate((0, -1)):
            if d['ends'][k] == 'pad': nodes.append(U(P[i]) + ['pad'])
            else:
                j = next(j for j in d['joins'] if j['end'] == k)
                nodes.append(j['at'] + ['junction'])
        C = d['corners']
        for a, b, c in zip(C, C[1:], C[2:]):        # a bend: a corner between two level runs that turns
            h1, h2 = (b[0] - a[0], b[1] - a[1]), (c[0] - b[0], c[1] - b[1])
            l1, l2 = math.hypot(*h1), math.hypot(*h2)
            if l1 < 1e-6 or l2 < 1e-6: continue
            if (h1[0] * h2[0] + h1[1] * h2[1]) / (l1 * l2) > math.cos(math.radians(10)): continue
            z = floor_at(b[0], b[1])[0]
            nodes.append(U([b[0], b[1], z if z is not None else b[2]]) + ['bend'])
        out.append(dict(p='glyph.run', x=P[0][0] * G, y=P[0][1] * G, h=min(q[2] for q in P), rot=0, src=o['id'], name=label(o),
                        pts=[U(q) for q in P], nodes=nodes, ends=d['ends'], joins=d.get('joins', []), w=o.get('w', GLYPH_W),
                        col=o.get('tint', GLYPH_TINT), state=d['state'], s0=round(d['s0'], 4), len=round(d['s'][-1], 4)))
    return out


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
        if up.get('mat') == 'water' and lo.get('mat') == 'water': return 'open'    # water over lower water: a fall pours over it (falls, below)
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
    PIER_SET = 0.3     # u: how far a balustrade post stands in from the edge line (its face then sits at the wall's, the coping over it a little proud)
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
            if tr == 'parapet':
                # a post stands on the upper floor, set back so its face is flush with the wall: its centre lies PIER_SET u inside
                # each section's edge line (pin p35: piers hung half over the drop). The upper side of a section a->b is (dy, -dx).
                ups = []
                for s, end in lst:
                    ex, ey = s[1][0] - s[0][0], s[1][1] - s[0][1]; el = math.hypot(ex, ey) or 1
                    ups.append((ey / el, -ex / el))
                if len(ups) == 1 or abs(ups[0][0] * ups[1][1] - ups[0][1] * ups[1][0]) < 1e-3:
                    ox, oy = ups[0][0] * PIER_SET, ups[0][1] * PIER_SET
                else:      # on a bend: inside both lines by PIER_SET (o . n1 = o . n2 = PIER_SET)
                    (a1, b1), (a2, b2) = ups[0], ups[1]; det = a1 * b2 - a2 * b1
                    ox, oy = PIER_SET * (b2 - b1) / det, PIER_SET * (a1 - a2) / det
                    m = math.hypot(ox, oy)
                    if m > 3 * PIER_SET: ox, oy = ox * 3 * PIER_SET / m, oy * 3 * PIER_SET / m
                joints[v]['ox'], joints[v]['oy'] = round(ox, 4), round(oy, 4)
    # newels at flight heads that end a run
    for e in ends_at:
        v = key(e)
        if v in joints: joints[v]['p'] = 'joint.newel'

    # ---- arches: shapes the renderer builds to size and dresses in the painted stone, never fixed models ----
    def arches(allsegs, inst):
        """Bridges: a walkable level whose two parallel faces stand over the same water is crossing it, so the water runs
        on under an arch (arch.through, one arch per 6 m of span at most; the faces' sections there get v='bridge': only
        their coping and railing are drawn). Blind arches: tall walls that rise from ground no one walks (the sea) get a
        shallow arched recess over a bay of three sections, a plain section between bays (v='blind' with bay=3 on the middle, 'blind-side' either side)."""
        lowt = lambda s: low_of.get((round(s[0][0], 4), round(s[0][1], 4), round(s[1][0], 4), round(s[1][1], 4)))
        by_e = {tuple(i['e']): i for i in inst if 'e' in i}
        mid = lambda s: (round((s[0][0] + s[1][0]) / 2, 4), round((s[0][1] + s[1][1]) / 2, 4))
        out, k_sweep = [], {}
        # blind arches: a bay of three sections, the arch on the middle one (v='blind', bay=3) and its two neighbours
        # drawing their part of the front (v='blind-side'), so the arch is wide enough to reach down a tall wall
        ok = []
        for s in allsegs:
            it = by_e.get(mid(s))
            if not it or it.get('v') or it['p'] not in ('edge.retain.straight', 'edge.parapet.straight', 'sweep.retain', 'sweep.parapet'): continue
            lo = T.get(lowt(s), {}) if len(s) == 5 else {}
            drop = T[s[2]]['h'] - s[3]
            under = [t for t in T.values() if abs(t['h'] - s[3]) < 1e-6]
            if drop < 3.0 or any(t.get('walk', True) and t['mat'] not in ('water',) for t in ([lo] if lo else under)): continue
            ok.append(s)
        pk = lambda p: (round(p[0], 4), round(p[1], 4))
        at_end = {}
        for s in ok:
            for e in (0, 1): at_end.setdefault(pk(s[e]), []).append(s)
        def along(a, b):        # the same wall going on: same level, drop and treatment; on a curve, the same curve
            if a[2] != b[2] or abs(a[3] - b[3]) > 1e-6 or a[4] != b[4] or (len(a) > 5) != (len(b) > 5): return False
            if len(a) > 5: return a[5][1] == b[5][1]
            ua = (a[1][0] - a[0][0], a[1][1] - a[0][1]); ub = (b[1][0] - b[0][0], b[1][1] - b[0][1])
            return abs(ua[0] * ub[1] - ua[1] * ub[0]) < 1e-6          # straight on
        used = set()
        for s in ok:
            if id(s) in used: continue
            ends = [[o for o in at_end.get(pk(s[e]), []) if o is not s and along(s, o) and id(o) not in used] for e in (0, 1)]
            if len(ends[0]) != 1 or len(ends[1]) != 1: continue       # a neighbour at each end
            nb = [ends[0][0], ends[1][0]]
            for o in nb: used.add(id(o)); by_e[mid(o)]['v'] = 'blind-side'
            used.add(id(s)); it = by_e[mid(s)]; it['v'] = 'blind'; it['bay'] = 3
            # the sections either side of a bay are left plain: a bay, a pause, a bay
            for o in nb:
                for e in (0, 1):
                    for q in at_end.get(pk(o[e]), []):
                        if q is not o and q is not s and along(o, q): used.add(id(q))
        # bridges: straight faces of a walkable level over water, grouped into runs along one line
        runs = {}
        for s in allsegs:
            if len(s) > 5 or s[4] == 'open': continue
            up, lo = T[s[2]], T.get(lowt(s), {})
            if not up.get('walk', True) or lo.get('mat') != 'water': continue
            (ax, ay), (bx, by) = s[0], s[1]; L = math.hypot(bx - ax, by - ay); ux, uy = (bx - ax) / L, (by - ay) / L
            if (ux, uy) < (0, 0) or (abs(ux) < 1e-9 and uy < 0): ux, uy = -ux, -uy      # one sense per line
            ux, uy = round(ux, 6) + 0.0, round(uy, 6) + 0.0
            off = round(ax * uy - ay * ux, 4)                                           # which parallel line
            t0, t1 = sorted((ax * ux + ay * uy, bx * ux + by * uy))
            runs.setdefault((s[2], lowt(s), ux, uy, off), []).append((t0, t1, s))
        lines = {}
        for (ter, lg, ux, uy, off), segs_ in runs.items():
            segs_.sort(key=lambda r: r[0]); cur = None
            for t0, t1, s in segs_:
                if cur and t0 <= cur[1] + 1e-6: cur[1] = max(cur[1], t1); cur[2].append(s)
                else:
                    cur = [t0, t1, [s]]; lines.setdefault((ter, lg, ux, uy), []).append((off, cur))
        parts = {}
        def part(g, p):
            """which connected body of level g (corners, 4-neighbour) the corner nearest p is in"""
            if g not in parts:
                lab, n = {}, 0
                for y0, r in enumerate(rows):
                    for x0, c in enumerate(r):
                        if c != g or (x0, y0) in lab: continue
                        n += 1; stack = [(x0, y0)]; lab[(x0, y0)] = n
                        while stack:
                            x, y = stack.pop()
                            for q in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                                if q not in lab and 0 <= q[1] < len(rows) and 0 <= q[0] < len(rows[q[1]]) and rows[q[1]][q[0]] == g:
                                    lab[q] = n; stack.append(q)
                parts[g] = lab
            return parts[g].get((math.floor(p[0] + 0.5), math.floor(p[1] + 0.5)))
        seen = set()
        for (ter, lg, ux, uy), faces in lines.items():
            for i, (oa, ra) in enumerate(faces):
                for ob, rb in faces[i + 1:]:
                    d = abs(ob - oa); t0, t1 = max(ra[0], rb[0]), min(ra[1], rb[1])
                    if d < 0.5 or d > 6 or t1 - t0 < 0.99 or (id(ra), id(rb)) in seen: continue
                    seen.add((id(ra), id(rb)))
                    nx, ny = uy, -ux                       # the line's normal; off grows along it
                    if ob < oa: nx, ny = -nx, -ny
                    at = lambda t, o: (ux * t + uy * o, uy * t - ux * o)      # a point: t along the line, o across it
                    def glyph(t, o):
                        x, y = at(t, o); x, y = math.floor(x + 0.5), math.floor(y + 0.5)
                        return rows[y][x] if 0 <= y < len(rows) and 0 <= x < len(rows[y]) else None
                    # a crossing, not two banks facing over the water (the level itself lies between its faces) nor a
                    # pier (the water each side is one body already, round its end; under a bridge it is two)
                    lo_o, hi_o = min(oa, ob), max(oa, ob); tm = (t0 + t1) / 2
                    if glyph(tm, (oa + ob) / 2) != ter: continue
                    sides = [next((part(lg, at(tm, o)) for o in os_ if glyph(tm, o) == lg), None)
                             for os_ in ([lo_o - k for k in (0.5, 1.5, 2.5)], [hi_o + k for k in (0.5, 1.5, 2.5)])]
                    if None in sides or sides[0] == sides[1]: continue
                    px, py = at(t0, oa); qx, qy = at(t1, oa)                 # face A's start and end
                    up, lo = T[ter], T[lg]
                    span = (t1 - t0) * G; n = max(1, math.ceil(span / 6.0 - 1e-6))
                    if up['h'] - lo['h'] < 1.2:
                        err('arch-low', f"{up.get('name', ter)} crosses {lo.get('name', lg)} only {up['h'] - lo['h']:.2f} m above it: no room for an arch",
                            (px, py), [gid[ter]], 'warning')
                        continue
                    out.append(dict(p='arch.through', x=px * G, y=py * G, x2=qx * G, y2=qy * G, nx=nx, ny=ny, depth=d * G, n=n,
                                    h=up['h'], low=lo['h'], mat=lo['mat'], rot=math.atan2(uy, ux), len=span, src=gid[ter]))
                    for r in (ra, rb):
                        for s in r[2]:
                            m = mid(s); tm = m[0] * ux + m[1] * uy
                            if t0 - 1e-6 <= tm <= t1 + 1e-6 and by_e.get(m): by_e[m]['v'] = 'bridge'
        return out

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
    inst += arches(allsegs, inst)

    # ---- falls: water pouring over an edge into lower water, drawn to size by the renderer (kit-fall.ts), never a model ----
    def falls(allsegs):
        """Wherever a level of water meets a lower level of water across an edge, the upper pours over it: one fall.curtain
        per unbroken run of that edge (pts: the lip, in u, the lower water on its right; h and low: the two waters). So a
        fall is painted, not placed: water at two heights side by side. A drop under FALL_MIN is a ripple, not a fall."""
        lowt = lambda s: low_of.get((round(s[0][0], 4), round(s[0][1], 4), round(s[1][0], 4), round(s[1][1], 4)))
        k4 = lambda p: (round(p[0], 4), round(p[1], 4))
        groups, out = {}, []
        for s in allsegs:
            up, lg = T[s[2]], lowt(s); lo = T.get(lg, {})
            if up.get('mat') != 'water' or lo.get('mat') != 'water' or up['h'] - lo['h'] < FALL_MIN: continue
            groups.setdefault((s[2], lg), []).append(s)
        for (ter, lg), ss in groups.items():
            start = {k4(s[0]): s for s in ss}; ends = {k4(s[1]) for s in ss}; used = set()
            for h0 in [s for s in ss if k4(s[0]) not in ends] or ss[:1]:
                chain, s = [], h0
                while s is not None and id(s) not in used:
                    used.add(id(s)); chain.append(s); s = start.get(k4(s[1]))
                if not chain: continue
                pts = [chain[0][0]] + [c[1] for c in chain]
                out.append(dict(p='fall.curtain', x=pts[0][0] * G, y=pts[0][1] * G, pts=[[round(x * G, 4), round(y * G, 4)] for x, y in pts],
                                h=T[ter]['h'], low=T[lg]['h'], rot=0, len=sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(pts, pts[1:])) * G,
                                src=gid[ter]))
        return out
    inst += falls(allsegs)

    # ---- cliffs: an open edge dropping CLIFF_MIN or more into water is a sea cliff, laid by the renderer (kit-cliff.ts)
    # from the cliff kit (Meshy, one sheet: runs, a fissured run, an outside corner, a buttress), scaled to its drop ----
    def cliffs(allsegs):
        """One cliff.face per unbroken run of open edge over water: pts (the top's line in u, the water on its right),
        h (the top) and low (the water). The flat rock side stays behind it, so a gap between pieces shows rock."""
        lowt = lambda s: low_of.get((round(s[0][0], 4), round(s[0][1], 4), round(s[1][0], 4), round(s[1][1], 4)))
        k4 = lambda p: (round(p[0], 4), round(p[1], 4))
        groups, out = {}, []
        for s in allsegs:
            up, lg = T[s[2]], lowt(s); lo = T.get(lg, {})
            if s[4] != 'open' or up.get('mat') == 'water' or lo.get('mat') not in CLIFF_FOOT or up['h'] - lo['h'] < CLIFF_MIN: continue
            groups.setdefault((s[2], lg), []).append(s)
        for (ter, lg), ss in groups.items():
            start = {k4(s[0]): s for s in ss}; ends = {k4(s[1]) for s in ss}; used = set()
            for h0 in [s for s in ss if k4(s[0]) not in ends] + ss:
                if id(h0) in used: continue
                chain, s = [], h0
                while s is not None and id(s) not in used:
                    used.add(id(s)); chain.append(s); s = start.get(k4(s[1]))
                pts = [chain[0][0]] + [c[1] for c in chain]
                closed = k4(pts[0]) == k4(pts[-1])
                out.append(dict(p='cliff.face', x=pts[0][0] * G, y=pts[0][1] * G, pts=[[round(x * G, 4), round(y * G, 4)] for x, y in pts],
                                closed=closed, h=T[ter]['h'], low=T[lg]['h'], rot=0, src=gid[ter]))
        return out
    inst += cliffs(allsegs)
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
        inst.append(dict(p=v['piece'], x=v['at'][0] * G, y=v['at'][1] * G, h=T[on[0]]['h'], rot=math.atan2(dy, dx), src=v['id'],
                         **({'parts': v['parts']} if v.get('parts') else {})))     # a dress piece placed by hand names its parts (a banner's emblem)

    # ---- scatter: a level filled with pieces at a spacing (the woods' trees), jittered and seeded, so a scene always
    # gives the same woods: {kind: scatter, terrace, pieces: [...], spacing (u, default 7), margin (cells, default 1), seed,
    # jitter (of a step, default 0.4; 0.5 hides the grid), chance (each spot kept, default 1: below it, drifts with gaps)}
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
        step = s_.get('spacing', 7.0) / G; inner = ground.buffer(-s_.get('margin', 1.0)); jit = s_.get('jitter', 0.4); keep = s_.get('chance', 1.0)
        x0, y0, x1, y1 = ground.bounds; n = 0
        yy = y0
        while yy <= y1 and n < 600:
            xx = x0
            while xx <= x1 and n < 600:
                px, py = xx + rng.uniform(-jit, jit) * step, yy + rng.uniform(-jit, jit) * step
                if inner.contains(Point(px, py)) and (keep >= 1 or rng.random() < keep):
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
                 if o.get('piece') in KIT['pieces'] and KIT['pieces'][o['piece']].get('class') in ('setpiece', 'inlay')]   # (an inlay's channels take no planter)
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
            elif 'drape' in rule or 'grow' in rule:
                # vines on wall faces (docs/explorations/2026-11-24-dressing-variation.md, Vines). Painted pieces keep their
                # real size (kit.json size_m), so a tall wall gets more vine, never bigger leaves.
                # drape: a strip hung from the coping, cut to a share of the drop. grow: a seeded path that falls from
                # the coping with gravity, wanders and branches, on which the renderer stamps painted clusters.
                treat_ok = rule.get('drape') or rule.get('grow')
                niche_at = {tuple(i['e']) for i in inst if i.get('v') == 'niche' and 'e' in i}
                def usable(s):
                    if s[4] not in treat_ok or T[s[2]]['h'] - s[3] < rule.get('min_drop', 1.0): return False
                    mid = (round((s[0][0] + s[1][0]) / 2, 4), round((s[0][1] + s[1][1]) / 2, 4))
                    if mid in niche_at: return False
                    if any(z.intersects(LineString([s[0], s[1]]).buffer(0.3)) for z in fl_zones): return False   # never over a flight
                    return only is None or ok_at(*mid)
                # runs: consecutive usable sections of one wall (same level, same drop), in order along the wall
                k4_ = lambda p: (round(p[0], 4), round(p[1], 4))
                cand = [s for s in allsegs if usable(s)]
                nxt = {}
                for s in cand: nxt[(k4_(s[0]), s[2], s[3])] = s
                has_prev = {(k4_(s[1]), s[2], s[3]) for s in cand}
                runs, seen_ = [], set()
                for s in sorted(cand, key=lambda s: (k4_(s[0]), s[2])):
                    if id(s) in seen_ or (k4_(s[0]), s[2], s[3]) in has_prev and nxt.get((k4_(s[0]), s[2], s[3])) is not s: continue
                    run, cur = [], s
                    while cur is not None and id(cur) not in seen_:
                        seen_.add(id(cur)); run.append(cur); cur = nxt.get((k4_(cur[1]), cur[2], cur[3]))
                    runs.append(run)
                for s in cand:
                    if id(s) not in seen_: seen_.add(id(s)); runs.append([s])
                lens = lambda s: math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1]) * G * 0.6      # m
                for run in runs:
                    drop = T[run[0][2]]['h'] - run[0][3]
                    i0 = 0
                    while i0 < len(run):
                        # a clump: 1 to 4 sections in a row, then a gap; how often depends on the chance
                        span = rng.randint(1, rule.get('span', 4)); clump = run[i0:i0 + span]; i0 += span + rng.randint(1, 3)
                        if rng.random() > rule.get('chance', 0.3): continue
                        pc_ = rng.choice(rule['put']); v_ = vary(pc_, rng)
                        if 'drape' in rule:     # one strip across the clump: the same length, the painting continuing section to section
                            tall = KIT['pieces'][pc_].get('size_m', [1, 3])[1]
                            ln = round(min(drop * rng.uniform(*rule.get('share', [0.3, 0.85])), tall * rng.uniform(0.7, 1.0)), 2)
                            flip = rng.random() < 0.5; acc = rng.random()
                            for n_, s in enumerate(clump):
                                inst.append(dict(p=pc_, x=s[0][0] * G, y=s[0][1] * G, x2=s[1][0] * G, y2=s[1][1] * G, h=T[s[2]]['h'],
                                                 low=s[3], src=d_['id'], len=ln, flip=flip, offset=round(acc % 1, 3),
                                                 fade_l=n_ == 0, fade_r=n_ == len(clump) - 1, **v_))
                                acc += lens(s) / KIT['pieces'][pc_].get('size_m', [1, 3])[0]
                        else:     # grown vines: paths along the whole clump, in metres from its first section's start
                            total = sum(lens(s) for s in clump); paths = []
                            for _ in range(rng.randint(2, rule.get('branches', 3))):
                                sx, z = rng.uniform(0.1, 0.9) * total, 0.0; pts = [[round(sx, 2), 0.0]]
                                target = drop * rng.uniform(*rule.get('share', [0.4, 1.0])); drift = rng.uniform(-0.4, 0.4)
                                while z < target and len(pts) < 80:
                                    step = rng.uniform(0.15, 0.3); z += step
                                    drift = max(-0.8, min(0.8, drift + rng.uniform(-0.2, 0.2)))
                                    sx = max(0.05, min(total - 0.05, sx + drift * step))
                                    pts.append([round(sx, 2), round(min(z, drop - 0.05), 2)])
                                paths.append(pts)
                            # each section carries the stretch of the paths over it, in its own metres (the renderer
                            # stamps per section, so curved walls bend the vine with them)
                            at = 0.0
                            for s in clump:
                                L = lens(s); mine = []
                                for pts in paths:
                                    seg = [[round(p[0] - at, 2), p[1]] for p in pts if at - 0.2 <= p[0] <= at + L + 0.2]
                                    if len(seg) >= 2: mine.append(seg)
                                if mine:
                                    inst.append(dict(p=pc_, x=s[0][0] * G, y=s[0][1] * G, x2=s[1][0] * G, y2=s[1][1] * G, h=T[s[2]]['h'],
                                                     low=s[3], src=d_['id'], paths=mine, **v_))
                                at += L
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
            elif rule.get('along') == 'view':    # benches behind a parapet over a drop, facing out over it
                # {along: view, edges: [edge kinds], min_drop (m), spacing (u), inset (cells), min_run (cells)}: one per
                # 'spacing' along each straight run long enough to hold it, centred on the run, clear of flights
                on_ = rule.get('edges', ['parapet']); step = rule.get('spacing', 20) / G; inset = rule.get('inset', 1.0)
                taken = []
                for s in allsegs:
                    if s[4] not in on_ or T[s[2]]['h'] - s[3] < rule.get('min_drop', 2.0) or not T[s[2]].get('walk', True): continue
                    (ax, ay), (bx, by) = s[0], s[1]; L = math.hypot(bx - ax, by - ay)
                    if L < rule.get('min_run', 0.9): continue
                    nx_, ny_ = (by - ay) / L, -(bx - ax) / L          # toward the upper (walkable) side
                    px, py = (ax + bx) / 2 + nx_ * inset, (ay + by) / 2 + ny_ * inset
                    if any(math.hypot(px - tx, py - ty) < step for tx, ty in taken) or not ok_at(px, py): continue
                    if any(z.contains(Point(px, py)) for z in fl_zones): continue
                    n0 = len(inst)
                    put(rule['put'], px, py, T[s[2]]['h'], math.atan2(-ny_, -nx_), on_floor=True)
                    if len(inst) > n0: taken.append((px, py))

    inst += pipes(kind('pipe'), floor_u, T, G, nx, ny, kind('setpiece') + kind('vignette'), err, label)
    inst += glyphs(kind('glyph'), floor_u, T, G, nx, ny, kind('setpiece'), err, label)
    inst += wears(kind('wear'), G, nx, ny, err, label)

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
    want_room = '--room' in sys.argv     # also export the room the sim walks on (tools/kit/room.py)
    if want_room: sys.argv.remove('--room')
    name = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, '..', '..', 'game', 'packages', 'client', 'src', 'lab', f'kit-{name}.json')
    r = compile_layout(name)
    if r['errors']:
        print(f'{name}: {len(r["errors"])} problem(s):'); [print('  -', e) for e in r['errors']]; sys.exit(1)
    json.dump(r, open(out, 'w', encoding='utf-8'), separators=(',', ':'))
    if len(sys.argv) <= 2:   # (the scene's own file: lay its road and paving stone by stone, when they changed)
        import tess_layout; tess_layout.lay_scene(name, r)
    print(f'{name}: {len(r["instances"])} instances of {len(r["pieces"])} pieces, 0 problems, {len(r["warnings"])} warning(s) -> {os.path.relpath(out)}')
    for w in r['warnings']: print('  ! ' + w)
    for p, n in sorted(r['pieces'].items()): print(f'  {n:4d} {p}')
    if want_room:
        import room; room.write(name, r)


if __name__ == '__main__':
    main()
