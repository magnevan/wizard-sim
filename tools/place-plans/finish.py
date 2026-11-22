"""Finishing passes a plan spec can run after placing everything (the sense rules in docs/campaign/making-a-place.md).

  from finish import lips
  lips(P)   # before P.render()

lips: a knee-high lip on every walkable cell within reach of a route (a journey pass or a drawn route) that drops more
than 1 m to its neighbour, so no route runs beside an unguarded drop. A flight gets cheek walls the same way: its ends meet their landings within the step, so only its sides are walled."""
import math
import numpy as np
from plan import MAT, orect

def route_mask(P, reach=2.5):
    k = np.zeros(P.h.shape, dtype=bool)
    lines = [pts for pts, *_ in P.passes] + [pts for pts, _ in P.routes]
    for pts in lines:
        for (u0, v0), (u1, v1) in zip(pts, pts[1:]):
            L = math.hypot(u1 - u0, v1 - v0)
            if L == 0: continue
            k |= P.mask(orect(((u0 + u1) / 2, (v0 + v1) / 2), 2 * reach, L + 2 * reach, math.atan2(v1 - v0, u1 - u0)))
    return k

def lips(P, drop=1.0, rise=1.0):
    walk = np.isin(P.m, [m for m, v in MAT.items() if v[2]]) & ~P.bld
    low = np.zeros_like(walk)
    for dy, dx in ((0, 1), (1, 0), (0, -1), (-1, 0)):
        nb = np.roll(np.roll(P.h, dy, 0), dx, 1)
        nbld = np.roll(np.roll(P.bld, dy, 0), dx, 1)
        low |= (P.h - nb > drop) & ~nbld
    lip = walk & low & route_mask(P)                    # a flight's ends meet their landings within the step, so only its sides are walled (cheek walls)
    P.h[lip] += rise; P.m[lip] = 'wall'; P.bld[lip] = True
    return int(lip.sum())

def woods_unreached(P, step=0.5):
    """Walkable ground no one can reach from the journey's start (by the game's step rule) becomes woods."""
    from collections import deque
    walk = np.isin(P.m, [m for m, v in MAT.items() if v[2]]) & ~P.bld
    u, v = P.passes[0][0][0] if P.passes else P.routes[0][0][0]
    R2 = math.sqrt(0.5); j, i = int((u + v) * R2 - P.x0), int((v - u) * R2 - P.y0)
    seen = np.zeros_like(walk); q = deque([(i, j)]); seen[i, j] = True
    while q:
        a, b = q.popleft()
        for da, db in ((0, 1), (1, 0), (0, -1), (-1, 0)):
            c, d = a + da, b + db
            if 0 <= c < walk.shape[0] and 0 <= d < walk.shape[1] and walk[c, d] and not seen[c, d] and abs(P.h[c, d] - P.h[a, b]) <= step:
                seen[c, d] = True; q.append((c, d))
    lost = walk & ~seen
    P.m[lost] = 'trees'
    return int(lost.sum())
