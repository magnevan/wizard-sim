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

def lips(P, drop=1.0, rise=1.0, everywhere=False):
    """everywhere=True: every public edge over `drop`, not only those within reach of a route (a builder's parapet rule)."""
    walk = np.isin(P.m, [m for m, v in MAT.items() if v[2]]) & ~P.bld
    low = np.zeros_like(walk)
    for dy, dx in ((0, 1), (1, 0), (0, -1), (-1, 0)):
        nb = np.roll(np.roll(P.h, dy, 0), dx, 1)
        nbld = np.roll(np.roll(P.bld, dy, 0), dx, 1)
        low |= (P.h - nb > drop) & ~nbld
    lip = walk & low & (True if everywhere else route_mask(P))                    # a flight's ends meet their landings within the step, so only its sides are walled (cheek walls)
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


def close_gates(P, reach=3.0, band=1.0, far=60.0):
    """Closes each gate's line, so the only way past a gate is through its reach (the sim leaves within 3 u of a gate's
    marker, sim/src/court.ts; a road 8 u wide, and the grass beside a road, let you walk round a gate to the world's
    edge, 2026-11-22). The line runs through the gate square to the way in (the journey's next point from the gate, else the box's centre); out from the reach on
    each side, every walkable cell on it (`band` u either side) becomes woods, until the line meets ground you can't walk
    on, so it never cuts across the room."""
    cu, cv = (P.U[0] + P.U[1]) / 2, (P.V[0] + P.V[1]) / 2
    walk = np.vectorize(lambda m: MAT[m][2])(P.m) & ~P.bld
    for (gu, gv), _ in P.gates:
        du, dv = gu - cu, gv - cv
        for pts, *_ in P.passes:                                         # the way in: the journey's next point from the gate
            for k, q in enumerate(pts):
                if math.hypot(q[0] - gu, q[1] - gv) < 1 and len(pts) > 1:
                    nb = pts[k + 1] if k + 1 < len(pts) else pts[k - 1]; du, dv = gu - nb[0], gv - nb[1]
        L = math.hypot(du, dv) or 1; du, dv = du / L, dv / L
        along = (P.CU - gu) * du + (P.CV - gv) * dv
        across = -(P.CU - gu) * dv + (P.CV - gv) * du
        gi = np.unravel_index(np.argmin(np.hypot(P.CU - gu, P.CV - gv)), P.h.shape)
        line = (np.abs(along) <= band) & (np.abs(P.h - P.h[gi]) <= 0.5)   # on the gate's own tier: a cliff ends the line
        for side in (1, -1):
            a = reach
            while a < far:
                seg = line & (side * across > a) & (side * across <= a + 0.5)
                if seg.any() and not (seg & walk).any(): break      # the line has reached a wall, a cliff or woods
                P.m[seg & walk] = 'trees'
                a += 0.5
