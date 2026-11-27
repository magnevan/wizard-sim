"""Lays a compiled scene's stone floors stone by stone (the settled pattern, version E of
docs/explorations/2026-11-24-road-stones.md), for the renderer to paint live in its ground shader.

  python tools/kit/tess_layout.py [court] [--force]

compile.py runs it after every compile; it lays again only when the laid floors or the pattern's code changed.

Reads game/packages/client/src/lab/kit-<scene>.json (compile.py's output) and writes
game/content/generated/layouts/<scene>-stones.json:
  {"fp": fingerprint, "v": 1, "mats": {mat: how its stones are painted (tess_proof.LAY)}, "stones": [{"m": mat, "h": metres, "q": [[x, y], ...], "r": u, "c": [x, y], "t": radians, "a": u, "b": u}]}
Each stone's outline is q drawn out by r with round corners (its cut drawn in by half a joint plus r, so the shader
gets exact rounded corners as distance to q minus r); c, t, a, b are its middle, row direction and half-sizes, for its
grain; a weathered stone also has its wear w, and a missing one (a hole, x: 1) has no outline (WEAR, below). Every floor of a laid material (tess_proof.LAY: road, cobble, weathered) is laid per height and per connected piece, so a
step between two terraces is an edge the rows follow, and paving beside a road stops at the kerb's back. A building
(a set piece kit.json marks "paving": "edge") is an edge too: its floor is laid up to the base of its model
(model_base.py), drawn in by INSET so the stones run a little under its walls, never under the whole building.
The pattern's code is tess_proof.py's (rows from the edges, relaxed along a direction field, borders straightened).
"""
import hashlib, json, os, sys, time
import numpy as np
from shapely.geometry import Point, Polygon
from shapely.ops import unary_union

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
args = sys.argv[1:]
scene = args[0] if args and not args[0].startswith('--') else 'court'
sys.argv = [sys.argv[0], os.devnull]              # (tess_proof reads its options from the command line at import)
import tess_proof as T                             # noqa: E402
import model_base                                  # noqa: E402

ROOT = os.path.join(HERE, '..', '..')
OUT_DIR = os.path.join(ROOT, 'game', 'content', 'generated', 'layouts')
LAID = ('road', 'cobble', 'weathered')
# Weathered materials (old paving going back to the garden; the shader's half is kit-stones.ts WEATHERED): each stone
# gets a wear w (0 to 1) from how near it lies to where the paving meets lawn (within `edge` u) and soft noise, and is
# left out with a chance growing with w, so the paving breaks up into the lawn; in patches of trodden earth (noise at
# `patch` u over `dirt`), and a few (`loose`) anywhere.
WEAR = {'weathered': dict(edge=1.5, patch=3.5, dirt=0.76, loose=0.03)}
NEAR_LAWN = 0.35   # u: an edge of the paving within this of a lawn floor (at about its height) is where it meets the lawn


def vnoise(x, y, scale, seed):
    """Soft value noise (0 to 1) at points x, y, varying over about `scale` u."""
    x, y = np.asarray(x, float) / scale, np.asarray(y, float) / scale
    ix, iy = np.floor(x), np.floor(y); fx, fy = x - ix, y - iy
    fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    def h(i, j): return (np.sin((i * 127.1 + j * 311.7 + seed * 74.7) * 0.0174533 * 57.0) * 43758.5453) % 1.0
    a, b, c, d = h(ix, iy), h(ix + 1, iy), h(ix, iy + 1), h(ix + 1, iy + 1)
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy


def lawn_edge(scene_data, h, poly):
    """Where a piece of paving meets lawn at about its height: its outline's stretches beside a lawn floor (or None)."""
    lawn = [Polygon(p[0], p[1:]).buffer(0) for f in scene_data['floors'] if f['mat'] == 'lawn' and abs(f['h'] - h) <= ON for p in f['polys']]
    if not lawn: return None
    e = poly.boundary.intersection(unary_union(lawn).buffer(NEAR_LAWN))
    return None if e.is_empty else e


def weather(m, st, edge, seed):
    """Weathered stones: each gets its wear w, and some are left out (see WEAR)."""
    W = WEAR[m]; rr = np.random.default_rng(seed + 1)
    c = np.array([s['c'] for s in st]).reshape(-1, 2)
    if not len(c): return st
    d = np.array([edge.distance(Point(x, y)) for x, y in c]) if edge is not None else np.full(len(c), 99.0)
    n1 = vnoise(c[:, 0], c[:, 1], 2.2, 1); n2 = vnoise(c[:, 0], c[:, 1], W['patch'], 2)
    e = np.clip(1 - d / W['edge'], 0, 1)
    w = np.clip(e * (0.55 + 0.7 * n1) + 0.3 * (n1 - 0.45), 0, 1)
    dirt = np.clip((n2 - W['dirt']) / 0.12, 0, 1)
    w = np.maximum(w, dirt * 0.55)
    drop = np.maximum(w ** 2.2 * 0.85 * (e > 0), dirt) + W['loose']
    out = []
    for s, wi, p in zip(st, w, drop):
        if rr.uniform() < p:   # a missing stone: kept as a hole (no outline), so the shader's wear field knows the ground there
            out.append(dict(m=s['m'], h=s['h'], q=[], r=0, c=s['c'], t=s['t'], a=s['a'], b=s['b'], w=round(float(wi), 2), x=1))
        else: out.append(s | {'w': round(float(wi), 2)})
    return out


KIT =os.path.join(HERE, 'kit.json')
INSET = 0.12    # u: a building's outline drawn in by this, so the stones run on a little under its walls (no seam of tile)
ON = 0.4        # m: a building stands on the laid floors within this of its own height


def buildings(scene_data):
    """[(h, outline)]: every building the paving is laid up to, its model's base where it stands, drawn in by INSET."""
    kit = json.load(open(KIT, encoding='utf-8'))['pieces']
    out = []
    for it in scene_data.get('instances', []):
        k = kit.get(str(it.get('p')))
        if not k or k.get('paving') != 'edge': continue
        g = model_base.placed(it, k)
        if g is not None: g = g.buffer(-INSET, join_style=2)
        if g is not None and not g.is_empty: out.append((it['h'] + it.get('up', 0), g))
    return out


def pieces(scene_data):
    """[(mat, h, polygon)]: every laid floor, per height and per connected piece, the paving beside a road less the kerb."""
    by = {}
    for f in scene_data['floors']:
        if f['mat'] in LAID:
            by.setdefault((f['mat'], f['h']), []).extend(Polygon(p[0], p[1:]).buffer(0) for p in f['polys'])
    roads = [g for (m, _), gs in by.items() if m == 'road' for g in gs]
    # (as the proof: close the compiler's slivers where a curve meets the grid, so no row follows them)
    road = unary_union(roads).buffer(0.2, join_style=2).buffer(-0.2, join_style=2) if roads else None
    standing = buildings(scene_data)
    out = []
    for (m, h), gs in sorted(by.items()):
        g = unary_union(gs)
        if m == 'road' and road is not None: g = g.buffer(0.2, join_style=2).buffer(-0.2, join_style=2)
        elif road is not None: g = g.difference(road.buffer(T.KERB_W, join_style=2))
        under = [b for bh, b in standing if abs(bh - h) <= ON]
        if under: g = g.difference(unary_union(under))
        for part in getattr(g, 'geoms', [g]):
            if part.geom_type == 'Polygon' and part.area > 1.0: out.append((m, h, part))
    return out


def stones(m, h, poly, seed):
    """One piece's stones, as written out. The pattern's random numbers start from the piece's own seed, so a piece
    lays the same whatever was laid before it (the editor's worker lays many scenes in one process)."""
    T.rng = np.random.default_rng(seed)
    S = T.lay(m, poly)
    L = T.LAY[m]
    rr = np.random.default_rng(seed)
    out = []
    for i, q in enumerate(S['quads']):
        r = T.ROUND * rr.uniform(0.5, 1.3) * min(S['a'][i], S['b'][i])
        g = Polygon(q).buffer(0)
        core = g.buffer(-(L['joint'] / 2 + r), join_style=2)
        if core.is_empty or core.geom_type != 'Polygon': core, r = g.buffer(-L['joint'] / 2, join_style=2), 0.0
        if core.is_empty or core.geom_type != 'Polygon': continue
        core = core.simplify(0.002)
        out.append(dict(m=m, h=h, q=[[round(x, 3), round(y, 3)] for x, y in list(core.exterior.coords)[:-1]], r=round(r, 3),
                        c=[round(float(S['sites'][i][0]), 3), round(float(S['sites'][i][1]), 3)], t=round(float(S['th'][i]), 3),
                        a=round(float(S['a'][i]), 3), b=round(float(S['b'][i]), 3)))
    return out


CODE = hashlib.md5(b''.join(open(os.path.join(HERE, f), 'rb').read().replace(b'\r\n', b'\n')   # (line endings differ between checkouts)
                            for f in ('tess_proof.py', 'tess_layout.py', 'model_base.py'))).hexdigest()


def lay_scene(name, data, force=False, log=print):
    """Lays a compiled scene's stones and writes them. Each piece (a laid floor at one height, connected) is laid
    again only when it or the pattern's code changed: its stones are kept in the file under a key made of both, so an
    edit re-lays only the pieces it touched. Returns {"path", "laid", "kept"} (path None with no laid floors)."""
    ps = pieces(data)
    out = os.path.join(OUT_DIR, f'{name}-stones.json')
    if not ps:
        if os.path.exists(out): os.remove(out)
        return dict(path=None, laid=0, kept=0)
    edges = [lawn_edge(data, h, poly) if m in WEAR else None for m, h, poly in ps]
    keys = [hashlib.md5(f'{CODE}|{m}|{h}|{poly.wkt}|{e.wkt if e is not None else ""}'.encode()).hexdigest()[:16] for (m, h, poly), e in zip(ps, edges)]
    fp = hashlib.md5(''.join(keys).encode()).hexdigest()
    old = {}
    if not force and os.path.exists(out):
        with open(out, encoding='utf-8') as f: text = f.read()
        if f'"fp":"{fp}"' in text[:200]: return dict(path=out, laid=0, kept=len(ps))
        prev = json.loads(text); at = 0
        for k, n in prev.get('parts', []): old[k] = prev['stones'][at:at + n]; at += n
    t0, allst, parts, laid = time.time(), [], [], 0
    for key, (m, h, poly), edge in zip(keys, ps, edges):
        if key in old: st = old[key]
        else:
            seed = int(hashlib.md5(f'{m}{h}{poly.wkt[:200]}'.encode()).hexdigest()[:8], 16)   # the same piece lays the same
            try:
                st = stones(m, h, poly, seed)
                if m in WEAR: st = weather(m, st, edge, seed)
            except Exception as e:   # (one piece the pattern can't lay keeps its tile; the rest are laid)
                log(f'{name}: {m} at h={h} ({poly.area:.0f} u2) could not be laid: {type(e).__name__}: {e}'); st = []
            laid += 1
        allst += st; parts.append([key, len(st)])
    os.makedirs(OUT_DIR, exist_ok=True)
    mats = {m: {k: T.LAY[m][k] for k in ('pal', 'jointc', 'tone', 'bevel', 'joint', 'sheet')} | {'grain': T.LAY[m].get('grain', 0.7)} for m in LAID}
    tmp = out + '.tmp'   # (written whole, then swapped in: the editor's server may be reading it)
    json.dump(dict(fp=fp, v=1, mats=mats, parts=parts, stones=allst), open(tmp, 'w', encoding='utf-8'), separators=(',', ':'))
    os.replace(tmp, out)
    log(f'{name}: {laid} of {len(ps)} pieces laid ({len(allst)} stones) in {time.time() - t0:.1f}s -> {os.path.relpath(out)}')
    return dict(path=out, laid=laid, kept=len(ps) - laid)


def main():
    src = os.path.join(ROOT, 'game', 'packages', 'client', 'src', 'lab', f'kit-{scene}.json')
    lay_scene(scene, json.load(open(src, encoding='utf-8')), force='--force' in args)


if __name__ == '__main__':
    main()
