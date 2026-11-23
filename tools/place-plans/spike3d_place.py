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
# round 3: dressing and the balcony's balustrade (the plan's parapet runs along r 37-38.5, open at the flights and the bay)
for a0, a1 in ((20, 36), (54, 69), (86, 126), (144, 160)):
    n = max(1, round((a1 - a0) * math.pi / 180 * 37.7 / 3.6))
    for k in range(n): put('iso-balustrade', a0 + (k + 0.5) * (a1 - a0) / n, r=37.7, width=(a1 - a0) * math.pi / 180 * 37.7 / n)
for a in (45, 135, 82, 98): put('iso-cypress', a, r=22.6, width=1.3)
for a in (36, 54, 69, 86, 126, 144): put('iso-lantern', a, r=35.6, width=0.9)
for a in (75, 105): put('iso-bench', a, r=35.2, width=2.6)
for a in (40, 50, 130, 140): put('iso-urn', a, r=34.8, width=1.4)
# the camera's start: in front of the gate, on the balcony road
sx, sy = world(0, -14)
out = dict(start=dict(x=round(sx, 2), y=round(sy, 2)), pieces=pieces, note=__doc__.strip().splitlines()[0])
dst = os.path.join(HERE, '..', '..', 'game', 'packages', 'client', 'src', 'lab', 'world3d-place.json')
json.dump(out, open(dst, 'w'), indent=1)
print(len(pieces), 'pieces; start', out['start'])
