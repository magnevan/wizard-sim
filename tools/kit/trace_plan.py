"""Trace a place plan (tools/place-plans/plans/*.py) into a kit scene: the first draft of a place on the kit.

  python tools/kit/trace_plan.py court-d court [--keep-objects]

The plan is re-run with its grid swapped for the kit's corner lattice (one sample per grid corner, G = 2 u apart, U to
the right and V down the screen, as in the scene), so every fill, building and flight lands on corners exactly. Each
distinct (height, material, building) becomes a terrace; the plan's own parapet and cheek strips ('wall' roofs) are
dropped, since the kit guards edges by rule. Straight flights (Semantic.flight) become kit flights. What the kit can't
say yet is written into the scene's notes as GAPS, with a place for each, and returned for pins:
  small buildings (piers, pylons, posts) -> set pieces; landmarks -> set pieces; stair sectors and rings -> curved flights.
Saddle cells (two opposite corners high) are resolved by moving one corner to its higher neighbour's terrace.
"""
import json, math, os, runpy, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
PLANS = os.path.join(HERE, '..', 'place-plans')
sys.path.insert(0, PLANS)
import plan as planmod
import semantic as semmod

G = 2.0
MATMAP = {  # plan material -> (kit floor, walkable, edge)
    'plaza': ('plaza', True, 'parapet'), 'paving': ('paving', True, 'parapet'), 'path': ('paving', True, 'parapet'),
    'road': ('road', True, 'parapet'), 'dais': ('plaza', True, 'retain'), 'stairs': ('paving', True, 'retain'),
    'grass': ('lawn', True, 'parapet'), 'sand': ('lawn', True, 'parapet'), 'wood': ('deck', True, 'parapet'),
    'trees': ('lawn', False, 'open'), 'rock': ('rock', False, 'open'), 'deep': ('water', False, 'open'),
    'water': ('water', False, 'open'), 'roof': ('roof', False, 'wall'), 'void': ('water', False, 'open'),
}
SMALL = 30.0   # u^2: a building smaller than this is a set piece (a pier, a pylon, a post), not a terrace

gaps, flights = [], []


def area(poly):
    return abs(sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1] for i in range(len(poly)))) / 2


def lattice_init(self, name, title, U, V, base=-10.0, base_mat='deep'):
    self.name, self.title, self.U, self.V = name, title, U, V
    us = np.arange(U[0], U[1] + 1e-6, G); vs = np.arange(V[0], V[1] + 1e-6, G)
    self.CU, self.CV = np.meshgrid(us, vs)
    self.nx, self.ny = len(us), len(vs); self.x0 = self.y0 = 0
    self.h = np.full((self.ny, self.nx), base, dtype=np.float32)
    self.m = np.full((self.ny, self.nx), base_mat, dtype=object)
    self.bld = np.zeros((self.ny, self.nx), dtype=bool)
    self.bname = np.full((self.ny, self.nx), '', dtype=object)
    self.flightid = np.zeros((self.ny, self.nx), dtype=int)
    self.guard = np.zeros((self.ny, self.nx), dtype=bool)
    self.routes, self.marks, self.gates, self.doors, self.notes, self.passes = [], [], [], [], [], []
    self.ops = []


_fill, _stairs = planmod.Plan.fill, planmod.Plan.stairs


def fill(self, poly, h, mat):
    k = _fill(self, poly, h, mat); self.bname[k] = ''; self.flightid[k] = 0; return k


def building(self, poly, ground, height, name='', doors=(), roof='roof'):
    if roof == 'wall':                       # the plan's own parapets and flight cheeks: the kit guards edges by rule
        return np.zeros_like(self.bld)
    if not isinstance(poly, np.ndarray) and area(poly) < SMALL:
        c = planmod.centroid(poly)
        gaps.append(dict(kind='set-piece', what=name or f'a pier or post {height:g} m tall', at=c))
        return np.zeros_like(self.bld)
    k = self.mask(poly); self.h[k] = ground + height; self.m[k] = 'roof'; self.bld[k] = True
    self.bname[k] = name or f'a building {height:g} m'; self.flightid[k] = 0
    if name: gaps.append(dict(kind='building', what=f'{name}: a plain wall box for now (needs its facade pieces)', at=planmod.centroid(poly)))
    return k


def stairs(self, poly, h0, h1, axis='V'):
    k = _stairs(self, poly, h0, h1, axis)
    if getattr(self, '_in_flight', None) is None:
        gaps.append(dict(kind='curved-flight', what=f'stairs {h0:g} to {h1:g} m in a shape the kit has no flight for (a sector or ring)',
                         at=planmod.centroid(poly) if not isinstance(poly, np.ndarray) else (0, 0)))
    else:
        self.flightid[k] = self._in_flight
    return k


_sflight = semmod.Semantic.flight


def sflight(self, top, bottom, width, h_top, h_bottom, landing=2.5, cheeks=False, cheek_h=1.0, pad=None, name=''):
    flights.append(dict(top=top, bottom=bottom, width=width, h_top=h_top, h_bottom=h_bottom, name=name))
    self.P._in_flight = len(flights)
    try: return _sflight(self, top, bottom, width, h_top, h_bottom, landing, cheeks, cheek_h, pad, name)
    finally: self.P._in_flight = None


def landmark(self, c, name, height=12.0, radius=1.0):
    gaps.append(dict(kind='set-piece', what=f'{name} ({height:g} m)', at=c)); self.marks.append((c, name, height, radius))


planmod.Plan.__init__ = lattice_init
planmod.Plan.fill = fill
planmod.Plan.building = building
planmod.Plan.stairs = stairs
planmod.Plan.landmark = landmark
planmod.Plan.render = lambda self: None
planmod.Plan.frames = lambda self, *a, **k: None
semmod.Semantic.flight = sflight
semmod.Semantic.check = lambda self: None   # the kit compiler checks flights itself


def trace(plan_name):
    sys.argv = [sys.argv[0]]
    ns = runpy.run_path(os.path.join(PLANS, 'plans', plan_name + '.py'), run_name='__trace__')
    return ns['P']


def to_scene(P, scene_name):
    U0, V0 = P.U[0], P.V[0]
    ny, nx = P.h.shape
    h = P.h.copy()
    # flight footprints belong to the ground at their foot (the kit's flight stands on the lower terrace)
    for n, f in enumerate(flights, 1):
        h[P.flightid == n] = f['h_bottom']
    # stair cells outside flights (sectors, rings) snap to the nearest 0.5 m
    loose = (P.m == 'stairs') & (P.flightid == 0)
    h[loose] = np.round(h[loose] * 2) / 2
    key = np.empty((ny, nx), dtype=object)
    for i in range(ny):
        for j in range(nx):
            m = P.m[i, j]
            if P.flightid[i, j]: m = 'paving'
            key[i, j] = (round(float(h[i, j]), 2), 'bld:' + P.bname[i, j] if P.bld[i, j] else m)
    # terraces: one per key; names from the plan where it has them
    keys = sorted(set(key.ravel()), key=lambda k: (k[0], k[1]))
    GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    if len(keys) > len(GLYPHS): raise SystemExit(f'{len(keys)} terraces: too many glyphs')
    terraces, gl = [], {}
    used = set()
    for k, g in zip(keys, GLYPHS):
        hh, m = k
        if m.startswith('bld:'):
            nm = m[4:]; mat, walk, edge = 'roof', False, 'wall'
        else:
            mat, walk, edge = MATMAP[m]
            nm = {'deep': 'the sea', 'water': 'the stream', 'trees': 'woods', 'rock': 'rock', 'void': 'beyond'}.get(m, f'{m} at {hh:g} m')
        tid = 't-' + '-'.join(''.join(c if c.isalnum() else ' ' for c in nm.lower().replace('the ', '')).split())
        while tid in used: tid += '-' + g.lower()
        used.add(tid)
        t = dict(id=tid, glyph=g, name=nm, h=hh, mat=mat, edge=edge)
        if not walk: t['walk'] = False
        terraces.append(t); gl[k] = g
    rows = [[gl[key[i, j]] for j in range(nx)] for i in range(ny)]
    H = {g: k for k, g in enumerate(sorted((t['glyph'] for t in terraces), key=lambda g: (next(t['h'] for t in terraces if t['glyph'] == g), g)))}   # the compiler's rank: height, then glyph
    Th = {t['glyph']: t['h'] for t in terraces}

    def fix_saddles(keep=frozenset()):
        """A cell with opposite corners on one side of a level and the other two not: lift one low corner (not a kept one)."""
        for _ in range(20):
            fixed = 0
            for i in range(ny - 1):
                for j in range(nx - 1):
                    cs = [(i, j), (i, j + 1), (i + 1, j + 1), (i + 1, j)]
                    hs = [H[rows[a][b]] for a, b in cs]
                    for lv in sorted(set(hs))[1:]:
                        ins = [x >= lv for x in hs]
                        if ins in ([True, False, True, False], [False, True, False, True]):
                            lo = [q for q in range(4) if not ins[q] and cs[q] not in keep] or [q for q in range(4) if ins[q]]
                            a, b = cs[lo[0]]; nb = cs[(lo[0] + 1) % 4]
                            rows[a][b] = rows[nb[0]][nb[1]]; fixed += 1
                            break
            if not fixed: return

    fix_saddles()
    to_c = lambda u, v: [round((u - U0) / G * 2) / 2, round((v - V0) / G * 2) / 2]
    objs, kept = [], set()
    from collections import Counter
    for n, f in enumerate(flights, 1):
        (tu, tv), (bu, bv) = f['top'], f['bottom']
        if abs(tu - bu) > 1e-6:
            gaps.append(dict(kind='flight', what=f"{f['name']}: a flight not along V (the trace only does those yet)", at=f['top'])); continue
        ids = np.argwhere(P.flightid == n)
        if not len(ids): continue
        # the head: the corner row just before the flight's footprint, on the side of the plan's top
        d = 1 if bv > tv else -1
        iy = int(ids[:, 0].min() if d > 0 else ids[:, 0].max())
        xs = ids[ids[:, 0] == iy][:, 1]; x0, x1 = int(xs.min()), int(xs.max())
        steps = round((f['h_top'] - f['h_bottom']) / 0.15); length = steps * 0.5 / G      # cells, as compile.py sizes it
        top_row = iy - d
        foot = top_row + d * (0.5 + length)                                               # the foot's y, in corners
        beyond = int(math.ceil(foot)) if d > 0 else int(math.floor(foot))
        up = [rows[y][x] for y in range(top_row, top_row - 3 * d, -d) if 0 <= y < ny for x in range(x0, x1 + 1)
              if abs(Th[rows[y][x]] - f['h_top']) < 0.3]
        if not up:
            gaps.append(dict(kind='flight', what=f"{f['name']}: no ground at {f['h_top']:g} m at its head", at=f['top'])); continue
        top_g = Counter(up).most_common(1)[0][0]
        land = [rows[y][x] for y in range(beyond, beyond + 3 * d, d) if 0 <= y < ny for x in range(x0, x1 + 1)
                if abs(Th[rows[y][x]] - f['h_bottom']) < 0.3]
        if not land:
            gaps.append(dict(kind='flight', what=f"{f['name']}: no ground at {f['h_bottom']:g} m past its foot", at=f['bottom'])); continue
        bot_g = Counter(land).most_common(1)[0][0]
        # the top landing (two rows), and the steps and the bottom landing (to two rows past the foot): one terrace each
        for y in (top_row, top_row - d):
            for x in range(x0, x1 + 1): rows[y][x] = top_g; kept.add((y, x))
        for y in range(iy, beyond + 2 * d, d):
            if 0 <= y < ny:
                for x in range(x0, x1 + 1): rows[y][x] = bot_g; kept.add((y, x))
        hy = top_row + 0.5 * d
        objs.append(dict(id=f'f{n}', kind='flight', name=f['name'], head=[[float(x0), hy], [float(x1), hy]]))
    fix_saddles(frozenset(kept))
    for k, g in enumerate(gaps): g['at_c'] = to_c(*g['at'])
    notes = (f'Traced from tools/place-plans/plans/{P.name}.py ({P.title}) by tools/kit/trace_plan.py. One grid corner = '
             f'(U, V) = ({U0:g} + 2x, {V0:g} + 2y) in the plan. Gaps (what the kit cannot say yet) are pins.')
    sc = dict(schema=1, name=scene_name, G=2, notes=notes, terraces=terraces, corners=[''.join(r) for r in rows], objects=objs)
    return sc


def write_scene(sc, path):
    """The scene file's layout: one terrace, corner row or object per line (as scene.py and the editor write it)."""
    L = ['{', f'  "schema": {sc["schema"]}, "name": {json.dumps(sc["name"])}, "G": {sc["G"]}, "notes": {json.dumps(sc["notes"])},', '  "terraces": [']
    L += [('    ' + json.dumps(t) + (',' if k < len(sc['terraces']) - 1 else '')) for k, t in enumerate(sc['terraces'])]
    L += ['  ],', '  "corners": [']
    L += [('    ' + json.dumps(r) + (',' if k < len(sc['corners']) - 1 else '')) for k, r in enumerate(sc['corners'])]
    L += ['  ],', '  "objects": [']
    L += [('    ' + json.dumps(o) + (',' if k < len(sc['objects']) - 1 else '')) for k, o in enumerate(sc['objects'])]
    L += ['  ]', '}']
    open(path, 'w', encoding='utf-8', newline='\n').write('\n'.join(L) + '\n')


if __name__ == '__main__':
    plan_name, scene_name = sys.argv[1], sys.argv[2]
    P = trace(plan_name)
    sc = to_scene(P, scene_name)
    out = os.path.join(HERE, 'scenes', scene_name + '.scene.json')
    write_scene(sc, out)
    json.dump(gaps, open(os.path.join(HERE, 'scenes', scene_name + '.gaps.json'), 'w', encoding='utf-8'), indent=1)
    print(f'{out}: {len(sc["corners"][0]) - 1} x {len(sc["corners"]) - 1} cells, {len(sc["terraces"])} terraces, '
          f'{len(sc["objects"])} flights, {len(gaps)} gaps')
