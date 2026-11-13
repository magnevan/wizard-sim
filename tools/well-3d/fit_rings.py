"""Fits two mirrored tilted rings to the bought rings' silhouette, so the 3D rings start exactly where the art's are.

  python tools/well-3d/fit_rings.py            -> tools/well-3d/rings-fit.json

Camera: orthographic from the south, ELEV degrees above the ground (the drum's ellipse, 34 x 19 px, gives about 33).
Units are art pixels. A ring: centre (CX, cy) on screen at depth 0, radius R, band width W along its axis, its axis
tilted `tilt` degrees from vertical toward azimuth `az` (ring B mirrors ring A east-west).
"""
import json, math, os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
RINGS = os.path.join(HERE, '../../game/content/assets/well/rings.png')
ELEV = math.radians(33)
a = np.array(Image.open(RINGS).convert('RGBA'))[..., 3] > 0
a[:3] = False  # a stray spark at the top
H, Wd = a.shape
CX = 51.5


def axis(tilt, az):
    t, z = math.radians(tilt), math.radians(az)
    return np.array([math.sin(t) * math.sin(z), math.sin(t) * math.cos(z), math.cos(t)])


def ring_points(R, W, tilt, az, mirror=False):
    n = axis(tilt, az)
    if mirror:
        n = n * np.array([-1, 1, 1])
    u = np.cross(n, [0, 0, 1.0]) if abs(n[2]) < 0.999 else np.array([1.0, 0, 0])
    u /= np.linalg.norm(u)
    v = np.cross(n, u)
    th = np.linspace(0, 2 * math.pi, 720, endpoint=False)[:, None]
    s = np.linspace(-0.5, 0.5, 7)[None, :]
    p = (R * (np.cos(th) * u + np.sin(th) * v))[:, None, :] + (s[..., None] * W * n)
    return p.reshape(-1, 3)


def raster(pts, cy):
    x = pts[:, 0] + CX
    y = cy - (pts[:, 2] * math.cos(ELEV) + pts[:, 1] * math.sin(ELEV))
    m = np.zeros((H, Wd), bool)
    xi, yi = np.round(x - 0.5).astype(int), np.round(y - 0.5).astype(int)
    ok = (xi >= 0) & (xi < Wd) & (yi >= 0) & (yi < H)
    m[yi[ok], xi[ok]] = True
    # close one-pixel gaps
    m = m | (np.roll(m, 1, 0) & np.roll(m, -1, 0)) | (np.roll(m, 1, 1) & np.roll(m, -1, 1))
    return m


def score(R, W, tilt, az, cy, dR=0.0):
    """dR: ring B (the mirror) is that much bigger than ring A; the bought rings aren't the same size, so they never meet."""
    m = raster(ring_points(R, W, tilt, az), cy) | raster(ring_points(R + dR, W, tilt, az, True), cy)
    return (m & a).sum() / (m | a).sum()


best = (0, None)
for R in range(26, 40, 2):
    for tilt in range(20, 85, 5):
        for az in range(0, 180, 15):
            for cy in range(16, 30, 2):
                s = score(R, 5, tilt, az, cy)
                if s > best[0]:
                    best = (s, (R, 5, tilt, az, cy))
print('coarse', best)
R0, W0, t0, z0, c0 = best[1]
for R in np.arange(R0 - 2, R0 + 2.1, 0.5):
    for W in (4, 5, 6, 7):
        for tilt in np.arange(t0 - 5, t0 + 5.1, 1):
            for az in np.arange(z0 - 10, z0 + 10.1, 2.5):
                for cy in np.arange(c0 - 2, c0 + 2.1, 0.5):
                    s = score(R, W, tilt, az, cy)
                    if s > best[0]:
                        best = (s, (float(R), W, float(tilt), float(az), float(cy)))
print('fine', best)
R, W, tilt, az, cy = best[1]
# then the two sizes apart, keeping their mean
best2 = (0, None)
for dR in np.arange(-6, 6.1, 0.5):
    for t2 in np.arange(tilt - 4, tilt + 4.1, 1):
        for z2 in np.arange(az - 6, az + 6.1, 2):
            for c2 in np.arange(cy - 1.5, cy + 1.6, 0.5):
                s = score(R - dR / 2, W, t2, z2, c2, dR)
                if s > best2[0]:
                    best2 = (s, (float(dR), float(t2), float(z2), float(c2)))
print('two sizes', best2)
dR, tilt, az, cy = best2[1]
json.dump({'iou': round(best2[0], 3), 'elev': 33, 'cx': CX, 'cy': cy, 'R': R - dR / 2, 'RB': R + dR / 2, 'W': W, 'tilt': tilt, 'az': az}, open(os.path.join(HERE, 'rings-fit.json'), 'w'), indent=1)
m = raster(ring_points(R - dR / 2, W, tilt, az), cy) | raster(ring_points(R + dR / 2, W, tilt, az, True), cy)
viz = np.zeros((H, Wd, 3), np.uint8)
viz[a] = (120, 90, 50)
viz[m & ~a] = (40, 120, 255)
viz[m & a] = (240, 220, 160)
Image.fromarray(viz).resize((Wd * 5, H * 5), Image.NEAREST).save(os.path.join(HERE, 'fit-check.png'))
