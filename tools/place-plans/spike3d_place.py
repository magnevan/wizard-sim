"""Where the 3D spike's kit pieces stand in the courtyard (spike, 2026-11-23: the stylised-3D test).

  python tools/place-plans/spike3d_place.py   -> game/packages/client/src/lab/world3d-place.json

Positions come from the courtyard plan (court-d): the great hall's front is the arc r = 20 round C = (0, -40), facing out
to the plaza. Each piece: kit id, world x, y (room units, origin at the room's centre, as the sim's), the ground height
it stands on in metres, the direction its front faces as a world (x, y) unit vector, and its width along the front in
units. The conversion is to_ldtk.py's world().
"""
import json, math, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import to_ldtk

P, _ = to_ldtk.load_spec('court-d')
R2 = math.sqrt(0.5)
ny, nx = P.h.shape
cx0, cy0 = P.x0 + nx / 2, P.y0 + ny / 2
def world(u, v): return ((u + v) * R2 - cx0, (v - u) * R2 - cy0)
def wdir(du, dv): return ((du + dv) * R2, (dv - du) * R2)

C = (0, -40); R = 20.5
pieces = []
def put(kit, a, r=R, width=9.0, z=6.0, face=None):
    u, v = C[0] + r * math.cos(math.radians(a)), C[1] + r * math.sin(math.radians(a))
    fu, fv = face if face else (math.cos(math.radians(a)), math.sin(math.radians(a)))
    x, y = world(u, v); fx, fy = wdir(fu, fv)
    pieces.append(dict(kit=kit, x=round(x, 2), y=round(y, 2), z=z, fx=round(fx, 4), fy=round(fy, 4), width=width))

# round 2 (2026-11-23): the kit isolated from the style test's picture by Codex, then Meshy 7.1 with PBR maps
put('iso-gateway', 90, width=10)
for a in (70, 53, 36, 110, 127, 144): put('iso-wall', a, width=6.4)
for a in (78, 102): put('iso-pier', a, r=24, width=1.6)
for a in (61, 119): put('iso-planter', a, r=23.2, width=4.5)
# round 3: dressing
for a in (45, 135, 82, 98): put('iso-cypress', a, r=22.6, width=1.3)
for a in (36, 54, 69, 86, 126, 144): put('iso-lantern', a, r=35.6, width=0.9)
for a in (75, 105): put('iso-bench', a, r=35.2, width=2.6)
for a in (40, 50, 130, 140): put('iso-urn', a, r=34.8, width=1.4)

# round 4: kit along the plan's edges, placed from its cells (no hand placement). Balustrade modules along every parapet
# (finish.lips: walkway raised 1 m where it stands over a drop), and wall modules round every building's footprint
# except the great hall, which has its own pieces. Each edge is walked in runs of one direction, so a straight edge on
# screen (a 45-degree staircase of cells) gets evenly spaced modules along its true line.
import numpy as np
from scipy import ndimage
def putw(kit, x, y, z, fx, fy, width):
    pieces.append(dict(kit=kit, x=round(float(x), 2), y=round(float(y), 2), z=round(float(z), 2), fx=round(float(fx), 4), fy=round(float(fy), 4), width=round(float(width), 2)))
WX = np.vectorize(lambda u, v: world(u, v)[0])(P.CU, P.CV)
WY = np.vectorize(lambda u, v: world(u, v)[1])(P.CU, P.CV)
def runs_along(mask, outward, module, kit, zof, skip=None):
    """Places `kit` modules about `module` u wide along the edge cells in `mask`, facing `outward` (per-cell unit vectors in
    index space, x = column, y = row)."""
    ii, jj = np.nonzero(mask)
    if skip is not None:
        keep = ~skip[ii, jj]; ii, jj = ii[keep], jj[keep]
    if not len(ii): return 0
    nx, ny = outward[0][ii, jj], outward[1][ii, jj]
    ang = np.round(np.degrees(np.arctan2(ny, nx)) / 22.5).astype(int) % 16          # 16 directions
    placed = 0
    for d in np.unique(ang):
        sel = ang == d
        th = np.radians(d * 22.5); ox, oy = math.cos(th), math.sin(th); tx, ty = -oy, ox
        ci, cj = ii[sel], jj[sel]
        along = cj * tx + ci * ty; across = cj * ox + ci * oy
        order = np.argsort(along); along, across, ci, cj = along[order], across[order], ci[order], cj[order]
        # split into runs: a gap along, or a jump across, starts a new run
        cut = np.nonzero((np.diff(along) > 2.0) | (np.abs(np.diff(across)) > 2.5))[0] + 1
        for seg in np.split(np.arange(len(along)), cut):
            if len(seg) < 2: continue
            L = along[seg[-1]] - along[seg[0]] + 1
            n = max(1, round(L / module))
            for k in range(n):
                t = along[seg[0]] - 0.5 + (k + 0.5) * L / n
                m = seg[np.argmin(np.abs(along[seg] - t))]
                i, j = ci[m], cj[m]
                # the module's centre on the run's line, then to world
                cx = j + (t - along[m]) * tx; cy = i + (t - along[m]) * ty
                fi, fj = min(max(int(round(cy)), 0), P.h.shape[0] - 1), min(max(int(round(cx)), 0), P.h.shape[1] - 1)
                x = WX[i, j] + (cx - j); y = WY[i, j] + (cy - i)
                putw(kit, x, y, zof(i, j), ox, oy, L / n)
                placed += 1
    return placed
def outward_from(mask_f, sigma):
    g = ndimage.gaussian_filter(mask_f.astype(float), sigma)
    gy, gx = np.gradient(g)
    l = np.hypot(gx, gy) + 1e-9
    return -gx / l, -gy / l                       # away from the mask
# balustrades: the lips (raised walkway cells, material 'wall' and not part of a building's own block)
lip = (P.m == 'wall') & ~((P.m == 'roof'))
H = ndimage.gaussian_filter(P.h.astype(float), 2.0)
gy, gx = np.gradient(H); l = np.hypot(gx, gy) + 1e-9
drop = (-gx / l, -gy / l)                          # downhill: toward the drop
nb = runs_along(lip, drop, 3.4, 'iso-balustrade', lambda i, j: P.h[i, j] - 1.0)
# buildings: their footprints' edge cells, by connected roof block
roof = P.m == 'roof'
lab, nlab = ndimage.label(roof)
hu, hv = C[0] + 15 * math.cos(math.radians(90)), C[1] + 15 * math.sin(math.radians(90))
hi = np.unravel_index(np.argmin(np.hypot(P.CU - hu, P.CV - hv) + np.where(roof, 0, 1e9)), roof.shape)
hall = lab == lab[hi]
edge = roof & ~ndimage.binary_erosion(roof)
outn = outward_from(roof, 1.5)
def ground_out(i, j):
    k = 2
    ii = int(round(i + outn[1][i, j] * k)); jj = int(round(j + outn[0][i, j] * k))
    ii = min(max(ii, 0), P.h.shape[0] - 1); jj = min(max(jj, 0), P.h.shape[1] - 1)
    return P.h[ii, jj]
small = np.isin(lab, [k for k, c in enumerate(np.bincount(lab.ravel())) if k and c < 30])
nw = runs_along(edge & ~hall & ~small, outn, 6.4, 'iso-wall', ground_out)
# the plan's small blocks (piers, posts, threshold pillars) become the pier model, and the ground under each is flattened
np_ = 0
for k in np.unique(lab[small]):
    ci, cj = np.nonzero(lab == k)
    i, j = int(round(ci.mean())), int(round(cj.mean()))
    w = 2 * math.sqrt(len(ci) / math.pi) + 0.2
    ring = [(int(round(i + dy)), int(round(j + dx))) for dy, dx in ((0, 3), (3, 0), (0, -3), (-3, 0))]
    z = min(P.h[a, b] for a, b in ring if 0 <= a < P.h.shape[0] and 0 <= b < P.h.shape[1] and not roof[a, b])
    pieces.append(dict(kit='iso-pier', x=round(float(WX[i, j]), 2), y=round(float(WY[i, j]), 2), z=round(float(z), 2), fx=0.7071, fy=0.7071, width=round(w, 2), flatten=round(w / 2 + 0.4, 2)))
    np_ += 1
print('edge kit:', nb, 'balustrades,', nw, 'wall modules,', np_, 'piers')

# the camera's start: in front of the gate, on the balcony road
sx, sy = world(0, -14)
out = dict(start=dict(x=round(sx, 2), y=round(sy, 2)), pieces=pieces, note=__doc__.strip().splitlines()[0])
dst = os.path.join(HERE, '..', '..', 'game', 'packages', 'client', 'src', 'lab', 'world3d-place.json')
json.dump(out, open(dst, 'w'), indent=1)
print(len(pieces), 'pieces; start', out['start'])
