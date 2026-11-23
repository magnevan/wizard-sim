"""Semantic plans (step 4.5 of tools/pipeline-3d, docs/explorations/2026-11-23-semantic-plans.md): a plan says what a
thing is (a road on a terrace, a flight joining two heights with a landing at each end, an edge that is guarded or open)
and this module compiles it into the plan's shape ops and checks it, so the artifacts of painting shapes in order can't
happen: a road can't bleed past its terrace's edge, a flight can't end at a cliff or a balustrade, a parapet can't run
across a flight's head.

  S = Semantic(P)
  S.flight(top=(u, v), bottom=(u, v), width=8, h_top=6.0, h_bottom=3.0, cheeks=True)
  S.surface(poly, 'road', on=6.0, dh=-0.15)     # after the terraces and flights it lies on
  S.parapets(open=[poly, ...])                  # every drop over 1 m guarded, except flight ends and open edges
  S.check()                                     # raises with every problem, by element

A flight is a connector: P.connectors keeps it (its two ends, heights and width) for navigation's region graph.
"""
import math
import numpy as np
from plan import MAT, orect

WALKABLE = [m for m, v in MAT.items() if v[2]]


class Semantic:
    def __init__(self, P):
        self.P = P
        self.flights = []
        P.connectors = []

    def flight(self, top, bottom, width, h_top, h_bottom, landing=2.5, cheeks=False, cheek_h=1.0, pad=None, name=''):
        """A flight of steps from `top` (at h_top) to `bottom` (at h_bottom), both U, V points on its centre line. It must
        meet walkable ground at its own height over a landing `landing` u deep beyond each end (checked in check()).
        cheeks: a low wall along each side, standing on the lower ground and rising cheek_h above the flight's top.
        pad: a material: the top landing is built as a platform at h_top (where the terrace doesn't already reach), so the
        flight's head always has ground to land on."""
        P = self.P
        L = math.hypot(bottom[0] - top[0], bottom[1] - top[1]); ang = math.atan2(bottom[1] - top[1], bottom[0] - top[0])
        c = ((top[0] + bottom[0]) / 2, (top[1] + bottom[1]) / 2)
        P.stairs(orect(c, width, L, ang), h_top, h_bottom, math.degrees(ang))
        du, dv = math.cos(ang), math.sin(ang)
        f = dict(name=name or f'flight {len(self.flights) + 1}', top=top, bottom=bottom, width=width, h_top=h_top, h_bottom=h_bottom, landing=landing,
                 land_top=orect((top[0] - du * landing / 2, top[1] - dv * landing / 2), width, landing, ang),
                 land_bottom=orect((bottom[0] + du * landing / 2, bottom[1] + dv * landing / 2), width, landing, ang))
        if pad:
            P.fill(f['land_top'], h_top, pad)
        if cheeks:
            pu, pv = -dv, du
            for side in (-1, 1):
                cc = (c[0] + pu * side * (width / 2 + 0.5), c[1] + pv * side * (width / 2 + 0.5))
                P.building(orect(cc, 1.0, L, ang), min(h_top, h_bottom), abs(h_top - h_bottom) + cheek_h, roof='wall')
        self.flights.append(f)
        P.connectors.append(dict(kind='flight', name=f['name'], top=top, bottom=bottom, width=width, h_top=h_top, h_bottom=h_bottom))
        return f

    def surface(self, poly, mat, on, dh=0.0):
        """A surface (a road, an inlay, a lawn) on the open, flat ground of the terrace at height `on` inside poly: never on
        a flight, a building or another terrace, so its edge follows its terrace's edge exactly."""
        self.P.surface(poly, mat, on, dh)

    def parapets(self, drop=1.0, open=()):
        """Every edge of open walkable ground over a drop of more than `drop` m is guarded by a parapet, except a flight's
        ends (its landings) and the edges inside the `open` polygons (drops left open on purpose, for knockback)."""
        P = self.P
        walk = np.isin(P.m, WALKABLE) & ~P.bld & (P.m != 'stairs')
        low = np.zeros_like(walk)
        for dy, dx in ((0, 1), (1, 0), (0, -1), (-1, 0)):
            nb = np.roll(np.roll(P.h, dy, 0), dx, 1); nbld = np.roll(np.roll(P.bld, dy, 0), dx, 1)
            low |= (P.h - nb > drop) & ~nbld
        keep_open = np.zeros_like(walk)
        for f in self.flights:
            for zone in (f['land_top'], f['land_bottom']): keep_open |= P.mask(zone)
        for poly in open: keep_open |= P.mask(poly)
        P.guard |= walk & low & ~keep_open
        P.open_edges = walk & low & keep_open

    def check(self):
        """Every flight lands: the ground over each landing is walkable, not stairs, and within a tread of the flight's
        end. Raises SystemExit listing every problem."""
        P, errs = self.P, []
        walk = np.isin(P.m, WALKABLE) & ~P.bld
        for f in self.flights:
            for end, zone, h in (('top', f['land_top'], f['h_top']), ('bottom', f['land_bottom'], f['h_bottom'])):
                k = P.mask(zone)
                if not k.any(): errs.append(f"{f['name']}: its {end} landing covers no cells"); continue
                bad = k & ~(walk & (P.m != 'stairs') & (np.abs(P.h - h) <= 0.36))
                if bad.sum() > 0.1 * k.sum():
                    i, j = np.argwhere(bad)[0]
                    errs.append(f"{f['name']}: its {end} doesn't land on walkable ground at {h} m ({int(bad.sum())} of {int(k.sum())} cells wrong, e.g. at U,V ({P.CU[i, j]:.1f}, {P.CV[i, j]:.1f}): {P.m[i, j]} at {float(P.h[i, j]):.2f} m)")
        if errs: raise SystemExit('semantic check:\n  ' + '\n  '.join(errs))
        return len(self.flights)
