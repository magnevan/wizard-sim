"""The journey's passes as camera spots in the level: for game/scripts/route-shots.mjs.

  python tools/place-plans/journey_spots.py court-d [--every 14] [--inset 5] > spots.json

Runs a plan spec without drawing it, samples each journey pass every `--every` units, and writes JSON:
[{"pass": 1, "label": "...", "spots": [[x, y], ...]}, ...] in the level's plan units (0..w, 0..h), the same mapping as
to_ldtk.py: x = (U + V)/sqrt2 - x0, y = (V - U)/sqrt2 - y0.
"""
import json, math, os, runpy, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import plan as planmod

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

if __name__ == '__main__':
    name = sys.argv[1]
    every = float(sys.argv[sys.argv.index('--every') + 1]) if '--every' in sys.argv else 14.0
    inset = float(sys.argv[sys.argv.index('--inset') + 1]) if '--inset' in sys.argv else 5.0
    P = load(name); R2 = math.sqrt(0.5)
    spot = lambda u, v: [round((u + v) * R2 - P.x0, 2), round((v - u) * R2 - P.y0, 2)]
    print(json.dumps([{'pass': n + 1, 'label': label, 'spots': [spot(u, v) for u, v in sample(trim(pts, inset), every)]}
                      for n, (pts, label, _) in enumerate(P.passes)]))
