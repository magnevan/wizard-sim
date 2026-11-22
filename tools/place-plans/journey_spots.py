"""The journey's passes as camera spots in the level: for game/scripts/route-shots.mjs.

  python tools/place-plans/journey_spots.py court-d [--every 14] [--inset 5] > spots.json
  python tools/place-plans/journey_spots.py court-d --sense > sense.json     (doors and gates, flight ends, the shore)

Runs a plan spec without drawing it, samples each journey pass every `--every` units, and writes JSON:
[{"pass": 1, "label": "...", "spots": [[x, y], ...]}, ...] in the level's plan units (0..w, 0..h), the same mapping as
to_ldtk.py: x = (U + V)/sqrt2 - x0, y = (V - U)/sqrt2 - y0.
"""
import json, math, os, runpy, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import plan as planmod
from plan import MAT

def load(name):
    render, frames, argv = planmod.Plan.render, planmod.Plan.frames, sys.argv
    planmod.Plan.render = lambda self: None; planmod.Plan.frames = lambda self, *a, **k: None
    sys.argv = [name + '.py']
    try:
        g = runpy.run_path(os.path.join(HERE, 'plans', name + '.py'))
    finally:
        planmod.Plan.render, planmod.Plan.frames, sys.argv = render, frames, argv
    return next(v for v in g.values() if isinstance(v, planmod.Plan))

def trim(pts, d):
    """The path with d units cut off each end, so no spot stands inside a gate's reach (the game would leave the room)."""
    def cut(ps):
        left = d; out = list(ps)
        while len(out) > 1:
            L = math.dist(out[0], out[1])
            if L > left:
                t = left / L; out[0] = (out[0][0] + (out[1][0] - out[0][0]) * t, out[0][1] + (out[1][1] - out[0][1]) * t); return out
            left -= L; out.pop(0)
        return out
    return cut(cut(pts)[::-1])[::-1]

def sample(pts, every):
    out, carry = [], 0.0
    for (u0, v0), (u1, v1) in zip(pts, pts[1:]):
        L = math.hypot(u1 - u0, v1 - v0); t = carry
        while t <= L and L > 0:
            out.append((u0 + (u1 - u0) * t / L, v0 + (v1 - v0) * t / L)); t += every
        carry = t - L
    out.append(pts[-1])
    return out

def sense_spots(P, shore_every=25.0):
    """Close-up spots for the sense critic, from the plan itself: every door and gate, the top and foot of every flight
    (stair cells in connected groups), and points along the shore (water next to walkable ground)."""
    import numpy as np
    from scipy import ndimage
    R2 = math.sqrt(0.5)
    spot = lambda u, v: [round((u + v) * R2 - P.x0, 2), round((v - u) * R2 - P.y0, 2)]
    cell = lambda i, j: [j + 0.5, i + 0.5]
    inward = lambda g: (g[0] - 5 * g[0] / (math.hypot(*g) or 1), g[1] - 5 * g[1] / (math.hypot(*g) or 1))   # out of the gate's reach
    out = [{'pass': 1, 'label': 'doors and gates', 'spots': [spot(*d) for d, _ in P.doors] + [spot(*inward(g)) for g, _ in P.gates]}]
    lab, n = ndimage.label(P.m == 'stairs')
    ends = []
    for k in range(1, n + 1):
        ii, jj = np.nonzero(lab == k)
        if len(ii) < 12: continue
        h = P.h[ii, jj]
        for sel in (h >= h.max() - 0.01, h <= h.min() + 0.01):
            ends.append(cell(ii[sel].mean(), jj[sel].mean()))
    out.append({'pass': 2, 'label': 'tops and feet of flights', 'spots': [[round(a, 2), round(b, 2)] for a, b in ends]})
    walk = np.isin(P.m, [m for m, v in MAT.items() if v[2]]) & ~P.bld
    water = np.isin(P.m, ['water', 'deep'])
    shore = water & ndimage.binary_dilation(walk)
    pts, taken = [], []
    for i, j in zip(*np.nonzero(shore)):
        if all(math.hypot(i - a, j - b) >= shore_every for a, b in taken):
            taken.append((i, j)); pts.append(cell(i, j))
    out.append({'pass': 3, 'label': 'the shore', 'spots': pts})
    return out

if __name__ == '__main__':
    name = sys.argv[1]
    if '--sense' in sys.argv:
        print(json.dumps(sense_spots(load(name)))); sys.exit()
    every = float(sys.argv[sys.argv.index('--every') + 1]) if '--every' in sys.argv else 14.0
    inset = float(sys.argv[sys.argv.index('--inset') + 1]) if '--inset' in sys.argv else 5.0
    P = load(name); R2 = math.sqrt(0.5)
    spot = lambda u, v: [round((u + v) * R2 - P.x0, 2), round((v - u) * R2 - P.y0, 2)]
    print(json.dumps([{'pass': n + 1, 'label': label, 'spots': [spot(u, v) for u, v in sample(trim(pts, inset), every)]}
                      for n, (pts, label, _) in enumerate(P.passes)]))
