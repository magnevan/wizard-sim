"""Lays a compiled scene's stone floors stone by stone (the settled pattern, version E of
docs/explorations/2026-11-24-road-stones.md), for the renderer to paint live in its ground shader.

  python tools/kit/tess_layout.py [court] [--force]

compile.py runs it after every compile; it lays again only when the laid floors or the pattern's code changed.

Reads game/packages/client/src/lab/kit-<scene>.json (compile.py's output) and writes
game/content/generated/layouts/<scene>-stones.json:
  {"fp": fingerprint, "v": 1, "mats": {mat: how its stones are painted (tess_proof.LAY)}, "stones": [{"m": mat, "h": metres, "q": [[x, y], ...], "r": u, "c": [x, y], "t": radians, "a": u, "b": u}]}
Each stone's outline is q drawn out by r with round corners (its cut drawn in by half a joint plus r, so the shader
gets exact rounded corners as distance to q minus r); c, t, a, b are its middle, row direction and half-sizes, for its
grain. Every floor of a laid material (tess_proof.LAY: road, cobble) is laid per height and per connected piece, so a
step between two terraces is an edge the rows follow, and paving beside a road stops at the kerb's back.
The pattern's code is tess_proof.py's (rows from the edges, relaxed along a direction field, borders straightened).
"""
import hashlib, json, os, sys, time
import numpy as np
from shapely.geometry import Polygon
from shapely.ops import unary_union

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
args = sys.argv[1:]
scene = args[0] if args and not args[0].startswith('--') else 'court'
sys.argv = [sys.argv[0], os.devnull]              # (tess_proof reads its options from the command line at import)
import tess_proof as T                             # noqa: E402

ROOT = os.path.join(HERE, '..', '..')
OUT_DIR = os.path.join(ROOT, 'game', 'content', 'generated', 'layouts')
LAID = ('road', 'cobble')


def pieces(scene_data):
    """[(mat, h, polygon)]: every laid floor, per height and per connected piece, the paving beside a road less the kerb."""
    by = {}
    for f in scene_data['floors']:
        if f['mat'] in LAID:
            by.setdefault((f['mat'], f['h']), []).extend(Polygon(p[0], p[1:]).buffer(0) for p in f['polys'])
    roads = [g for (m, _), gs in by.items() if m == 'road' for g in gs]
    # (as the proof: close the compiler's slivers where a curve meets the grid, so no row follows them)
    road = unary_union(roads).buffer(0.2, join_style=2).buffer(-0.2, join_style=2) if roads else None
    out = []
    for (m, h), gs in sorted(by.items()):
        g = unary_union(gs)
        if m == 'road' and road is not None: g = g.buffer(0.2, join_style=2).buffer(-0.2, join_style=2)
        elif road is not None: g = g.difference(road.buffer(T.KERB_W, join_style=2))
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
                            for f in ('tess_proof.py', 'tess_layout.py'))).hexdigest()


def lay_scene(name, data, force=False, log=print):
    """Lays a compiled scene's stones and writes them. Each piece (a laid floor at one height, connected) is laid
    again only when it or the pattern's code changed: its stones are kept in the file under a key made of both, so an
    edit re-lays only the pieces it touched. Returns {"path", "laid", "kept"} (path None with no laid floors)."""
    ps = pieces(data)
    out = os.path.join(OUT_DIR, f'{name}-stones.json')
    if not ps:
        if os.path.exists(out): os.remove(out)
        return dict(path=None, laid=0, kept=0)
    keys = [hashlib.md5(f'{CODE}|{m}|{h}|{poly.wkt}'.encode()).hexdigest()[:16] for m, h, poly in ps]
    fp = hashlib.md5(''.join(keys).encode()).hexdigest()
    old = {}
    if not force and os.path.exists(out):
        with open(out, encoding='utf-8') as f: text = f.read()
        if f'"fp":"{fp}"' in text[:200]: return dict(path=out, laid=0, kept=len(ps))
        prev = json.loads(text); at = 0
        for k, n in prev.get('parts', []): old[k] = prev['stones'][at:at + n]; at += n
    t0, allst, parts, laid = time.time(), [], [], 0
    for key, (m, h, poly) in zip(keys, ps):
        if key in old: st = old[key]
        else:
            seed = int(hashlib.md5(f'{m}{h}{poly.wkt[:200]}'.encode()).hexdigest()[:8], 16)   # the same piece lays the same
            try: st = stones(m, h, poly, seed)
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
