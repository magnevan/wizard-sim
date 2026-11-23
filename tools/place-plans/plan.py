"""Place plans: stage 1 of docs/campaign/making-a-place.md.

A plan is a small spec of shapes with heights. It's written in screen-aligned units: U to the right, V down the
screen (towards the camera), 1 unit = 1 game unit (about 0.6 m). Heights are in metres. This module turns a spec into
cells on the game's world grid (x, y, 1 u), then draws them two ways:

  plan view:  from straight above, camera-up at the top, contours and cliffs marked
  game view:  the game's camera (screen x = U*16, y = V*8 - z*14.5), cells extruded by height

A spec file builds a Plan and calls render(). No game code is used; the grey-box level is made from the same cells
later (stage 2).

  python tools/place-plans/plans/court-a.py      -> tools/place-plans/out/court-a-plan.png, court-a-game.png
"""
import math, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont

R2 = math.sqrt(0.5)
OUT = os.path.join(os.path.dirname(__file__), 'out')

# material -> (top colour, face colour, walkable)
MAT = {
    'void':   ((18, 20, 28), (18, 20, 28), False),
    'water':  ((44, 92, 140), (36, 70, 110), False),
    'deep':   ((30, 66, 108), (30, 60, 96), False),
    'sand':   ((214, 196, 150), (150, 128, 96), True),
    'grass':  ((112, 150, 78), (120, 104, 84), True),
    'wood':   ((120, 96, 70), (84, 66, 50), True),
    'rock':   ((128, 120, 110), (96, 88, 82), False),
    'path':   ((190, 168, 130), (120, 104, 84), True),
    'paving': ((214, 196, 168), (160, 146, 128), True),
    'road':   ((240, 222, 186), (168, 150, 126), True),
    'plaza':  ((226, 206, 172), (168, 150, 126), True),
    'dais':   ((236, 220, 190), (178, 160, 134), True),
    'stairs': ((206, 188, 160), (150, 134, 112), True),
    'trees':  ((64, 104, 60), (70, 84, 60), False),
    'roof':   ((70, 84, 140), (196, 182, 156), False),
    'wall':   ((150, 140, 126), (176, 164, 144), False),
}

def font(px):
    for f in ('C:/Windows/Fonts/segoeuib.ttf', 'C:/Windows/Fonts/arialbd.ttf'):
        if os.path.exists(f): return ImageFont.truetype(f, px)
    return ImageFont.load_default()

# ---- shapes (U, V) ----
def rect(u0, v0, u1, v1): return [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]
def poly_n(c, r, n, rot=0.0, rv=None):
    rv = r if rv is None else rv
    return [(c[0] + r * math.cos(rot + 2 * math.pi * k / n), c[1] + rv * math.sin(rot + 2 * math.pi * k / n)) for k in range(n)]
def octagon(c, r): return poly_n(c, r, 8, math.pi / 8)
def orect(c, w, d, ang):
    """A w x d rectangle centred on c, its d side pointing along ang (radians)."""
    ca, sa = math.cos(ang), math.sin(ang)
    return [(c[0] + ca * a * d / 2 - sa * b * w / 2, c[1] + sa * a * d / 2 + ca * b * w / 2) for a, b in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
def arc_band(c, r0, r1, a0, a1, n=40):
    """The band between radii r0 and r1 from angle a0 to a1 (degrees; 90 points down the screen)."""
    A = [math.radians(a0 + (a1 - a0) * k / n) for k in range(n + 1)]
    return [(c[0] + r1 * math.cos(a), c[1] + r1 * math.sin(a)) for a in A] + [(c[0] + r0 * math.cos(a), c[1] + r0 * math.sin(a)) for a in reversed(A)]
def polar(c, r, deg): return (c[0] + r * math.cos(math.radians(deg)), c[1] + r * math.sin(math.radians(deg)))
def circle(c, r): return poly_n(c, r, 48)

def inside(poly, u, v):
    n, c = len(poly), False
    for i in range(n):
        (u1, v1), (u2, v2) = poly[i], poly[(i + 1) % n]
        if (v1 > v) != (v2 > v) and u < (u2 - u1) * (v - v1) / (v2 - v1) + u1: c = not c
    return c

class Plan:
    def __init__(self, name, title, U, V, base=-10.0, base_mat='deep'):
        self.name, self.title, self.U, self.V = name, title, U, V
        # world grid covering the U,V box: x = (U+V)/sqrt2, y = (V-U)/sqrt2
        cs = [((u + v) * R2, (v - u) * R2) for u in U for v in V]
        self.x0 = math.floor(min(c[0] for c in cs)); self.y0 = math.floor(min(c[1] for c in cs))
        self.nx = math.ceil(max(c[0] for c in cs)) - self.x0; self.ny = math.ceil(max(c[1] for c in cs)) - self.y0
        self.h = np.full((self.ny, self.nx), base, dtype=np.float32)
        self.m = np.full((self.ny, self.nx), base_mat, dtype=object)
        self.bld = np.zeros((self.ny, self.nx), dtype=bool)
        # cells along a drop that a parapet guards (finish.lips): drawn as a balustrade, never a blocked cell (pipeline 2b)
        self.guard = np.zeros((self.ny, self.nx), dtype=bool)
        self.routes, self.marks, self.gates, self.doors, self.notes, self.passes = [], [], [], [], [], []
        # every shape op in order, for the vector export (vector.py): a cell mask passed instead of a shape isn't recorded
        self.ops = []
        # cell centres in U,V
        xs = self.x0 + np.arange(self.nx) + 0.5; ys = self.y0 + np.arange(self.ny) + 0.5
        X, Y = np.meshgrid(xs, ys)
        self.CU = (X - Y) * R2; self.CV = (X + Y) * R2
        inbox = (self.CU >= U[0]) & (self.CU <= U[1]) & (self.CV >= V[0]) & (self.CV <= V[1])
        self.m[~inbox] = 'void'

    def mask(self, poly):
        if isinstance(poly, np.ndarray): return poly
        from matplotlib.path import Path
        p = Path(poly)
        pts = np.stack([self.CU.ravel(), self.CV.ravel()], 1)
        return p.contains_points(pts).reshape(self.CU.shape)

    def fill(self, poly, h, mat):
        if not isinstance(poly, np.ndarray): self.ops.append(('fill', list(poly), h, mat))
        k = self.mask(poly); self.h[k] = h; self.m[k] = mat; self.bld[k] = False; return k

    def raise_(self, poly, dh, mat=None):
        if not isinstance(poly, np.ndarray): self.ops.append(('raise', list(poly), dh, mat))
        k = self.mask(poly); self.h[k] += dh
        if mat: self.m[k] = mat
        return k

    def stairs(self, poly, h0, h1, axis='V'):
        """A flight from h0 at the low end of the axis to h1 at the high end, in steps. The axis is 'U', 'V', or an
        angle in degrees (0 = right, 90 = down the screen): h0 is at the end the angle points away from."""
        if not isinstance(poly, np.ndarray): self.ops.append(('stairs', list(poly), h0, h1, axis))
        k = self.mask(poly)
        if axis in ('U', 'V'): c = self.CV if axis == 'V' else self.CU
        else: c = self.CU * math.cos(math.radians(axis)) + self.CV * math.sin(math.radians(axis))
        lo, hi = c[k].min(), c[k].max()
        t = np.clip((c - lo) / max(hi - lo, 1e-6), 0, 1)
        steps = max(2, int(round(abs(h1 - h0) / 0.35)))
        self.h[k] = (h0 + np.floor(t * steps + 0.5) / steps * (h1 - h0))[k]
        self.m[k] = 'stairs'; self.bld[k] = False
        return k

    def strip(self, pts, width, mat='road'):
        """Repaves walkable flat ground along a polyline (a main route's own paving); heights are kept."""
        self.ops.append(('strip', list(pts), width, mat))
        k = np.zeros_like(self.bld)
        for (u0, v0), (u1, v1) in zip(pts, pts[1:]):
            L = math.hypot(u1 - u0, v1 - v0)
            k |= self.mask(orect(((u0 + u1) / 2, (v0 + v1) / 2), width, L + width, math.atan2(v1 - v0, u1 - u0)))
        ok = np.isin(self.m, ['plaza', 'paving', 'grass', 'path', 'dais'])
        self.m[k & ok & ~self.bld] = mat

    def building(self, poly, ground, height, name='', doors=(), roof='roof'):
        if not isinstance(poly, np.ndarray): self.ops.append(('building', list(poly), ground, height, roof))
        k = self.mask(poly); self.h[k] = ground + height; self.m[k] = roof; self.bld[k] = True
        if name: self.notes.append((centroid(poly), name, ground + height))
        for d in doors: self.doors.append((d, ground))
        return k

    def repaint(self, poly, to_mat, from_mats, at=None):
        """Changes the material of the open ground of `from_mats` inside poly to `to_mat`, heights kept (woods belts,
        land no route reaches, a gate's closed line), only on ground within 0.5 m of `at` if given. A recorded op, so the
        resolved scene replays it exactly."""
        self.ops.append(('repaint', list(poly), to_mat, tuple(from_mats), at))
        k = self.mask(poly) & np.isin(self.m, list(from_mats)) & ~self.bld
        if at is not None: k &= np.abs(self.h - at) <= 0.5
        self.m[k] = to_mat
        return k

    def raise_mat(self, mat, at, dh):
        """Raises every cell of material `mat` standing at height `at` by dh (e.g. a road a step above its terrace)."""
        self.ops.append(('raise_mat', mat, at, dh))
        self.h[(self.m == mat) & (self.h == at)] += dh

    def route(self, pts, rank='main'): self.routes.append((pts, rank))
    def journey(self, pts, label, moment=''):
        """One pass through the place, in the order the player makes them: the points in walking order, what the pass is
        for, and the moment it should give (a reveal, a homecoming, the finale)."""
        self.passes.append((pts, label, moment))
    def landmark(self, c, name, height=12.0, radius=1.0): self.marks.append((c, name, height, radius))
    def gate(self, c, name): self.gates.append((c, name))
    def note(self, c, text): self.notes.append((c, text, None))

    def h_at(self, u, v):
        x, y = (u + v) * R2 - self.x0, (v - u) * R2 - self.y0
        i, j = int(min(max(y, 0), self.ny - 1)), int(min(max(x, 0), self.nx - 1))
        return float(self.h[i, j])

    def stats(self):
        walk = np.vectorize(lambda m: MAT[m][2])(self.m)
        flat = walk & ~self.bld & (self.m != 'stairs')
        hs = sorted(set(float(v) for v in np.round(self.h[flat] * 2) / 2))
        return dict(world=f'{self.nx} x {self.ny} u', walkable=f'{walk.sum()} u2', tiers=hs)

    # ---- drawing ----
    def render(self):
        os.makedirs(OUT, exist_ok=True)
        a = self.draw(squash=1.0, zs=0.0, k=6, plan=True); a.save(os.path.join(OUT, f'{self.name}-plan.png'))
        b = self.draw(squash=0.5, zs=14.5 / 16, k=8, plan=False); b.save(os.path.join(OUT, f'{self.name}-game.png'))
        if self.passes: self.journey_map().save(os.path.join(OUT, f'{self.name}-journey.png'))
        print(self.name, self.stats())

    def draw(self, squash, zs, k, plan, overlays=True):
        """k = pixels per unit along U. Game view: squash 0.5, zs = 14.5/16 px per metre per (px per unit)."""
        zpx = zs * k
        zmax = float(self.h.max()) + 14
        W = int((self.U[1] - self.U[0]) * k) + 40
        H = int((self.V[1] - self.V[0]) * k * squash + (zmax - float(self.h.min())) * zpx) + 120
        ox, oy = -self.U[0] * k + 20, -self.V[0] * k * squash + zmax * zpx + 80
        img = Image.new('RGB', (W, H), (18, 20, 28)); d = ImageDraw.Draw(img)
        P = lambda u, v, z: (ox + u * k, oy + v * k * squash - z * zpx)
        W2 = lambda x, y, z: P((x - y) * R2, (x + y) * R2, z)
        hmin = float(self.h.min()); hrng = max(1.0, float(self.h.max()) - hmin)
        order = sorted(((i, j) for i in range(self.ny) for j in range(self.nx)), key=lambda c: (c[0] + c[1], c[1]))
        for i, j in order:
            m = self.m[i, j]
            if m == 'void': continue
            x, y, z = self.x0 + j, self.y0 + i, float(self.h[i, j])
            top, face, _ = MAT[m]
            lit = 0.82 + 0.3 * (z - hmin) / hrng
            if m in ('water', 'deep') and self._shore(i, j): top = (150, 190, 210)
            tc = tuple(min(255, int(c * lit)) for c in top)
            if not plan:
                # faces toward +x (right) and +y (left), down to the neighbour
                for di, dj, sh, pts in ((0, 1, 0.72, ((x + 1, y), (x + 1, y + 1))), (1, 0, 0.9, ((x, y + 1), (x + 1, y + 1)))):
                    ni, nj = i + di, j + dj
                    nz = float(self.h[ni, nj]) if ni < self.ny and nj < self.nx and self.m[ni, nj] != 'void' else hmin - 2
                    if nz < z - 0.01:
                        fc = tuple(int(c * sh) for c in (MAT['wall'][1] if self.bld[i, j] else face))
                        (ax, ay), (bx, by) = pts
                        d.polygon([W2(ax, ay, z), W2(bx, by, z), W2(bx, by, nz), W2(ax, ay, nz)], fill=fc)
            d.polygon([W2(x, y, z), W2(x + 1, y, z), W2(x + 1, y + 1, z), W2(x, y + 1, z)], fill=tc)
        if plan: self._contours(d, W2)
        self._P = P
        if not overlays:
            if not plan: self._landmarks_only(d, P)
            return img
        self._overlays(d, P, plan, k)
        f = font(22); d.text((20, 14), f'{self.title}  ({"plan" if plan else "game camera"})', font=f, fill=(240, 230, 210))
        s = self.stats(); d.text((20, 42), f"world box {s['world']}, walkable {s['walkable']}, tiers (m): {s['tiers']}", font=font(15), fill=(190, 184, 170))
        return img

    def _shore(self, i, j):
        for di, dj in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            ni, nj = i + di, j + dj
            if 0 <= ni < self.ny and 0 <= nj < self.nx and self.m[ni, nj] not in ('water', 'deep', 'void'): return True
        return False

    def _contours(self, d, W2):
        for i in range(self.ny):
            for j in range(self.nx):
                if self.m[i, j] == 'void': continue
                z, x, y = self.h[i, j], self.x0 + j, self.y0 + i
                for di, dj, a, b in ((0, 1, (x + 1, y), (x + 1, y + 1)), (1, 0, (x, y + 1), (x + 1, y + 1))):
                    ni, nj = i + di, j + dj
                    if ni >= self.ny or nj >= self.nx or self.m[ni, nj] == 'void': continue
                    dz = abs(float(self.h[ni, nj]) - z)
                    if self.m[i, j] == 'stairs' and self.m[ni, nj] == 'stairs': continue
                    if dz > 1.6: d.line([W2(*a, 0), W2(*b, 0)], fill=(20, 16, 14), width=3)
                    elif dz > 0.1: d.line([W2(*a, 0), W2(*b, 0)], fill=(70, 60, 50), width=1)

    def _overlays(self, d, P, plan, k):
        f = font(15 if k < 8 else 17)
        for pts, rank in self.routes:
            xy = [P(u, v, self.h_at(u, v) + 0.2) for u, v in pts]
            if rank == 'main': d.line(xy, fill=(255, 200, 60), width=5, joint='curve')
            else:
                for a, b in zip(xy, xy[1:]): dash(d, a, b, (255, 255, 255), 2)
        for (u, v), g in self.doors:
            x, y = P(u, v, g); d.rectangle([x - 4, y - 4, x + 4, y + 4], fill=(30, 20, 10), outline=(255, 200, 60))
        for (u, v), name, hgt, *_ in self.marks:
            g = self.h_at(u, v); x, y = P(u, v, g); _, y2 = P(u, v, g + hgt)
            if plan:
                d.ellipse([x - 9, y - 9, x + 9, y + 9], fill=(190, 120, 255), outline=(255, 255, 255), width=2)
            else:
                d.line([(x, y), (x, y2 - 60)], fill=(190, 120, 255), width=4)
                d.ellipse([x - 10, y2 - 10, x + 10, y2 + 10], fill=(220, 170, 255))
                y = y2
            label(d, (x + 12, y - 10), name, f, (230, 200, 255))
        for (u, v), name in self.gates:
            x, y = P(u, v, self.h_at(u, v)); d.polygon([(x, y - 10), (x + 10, y), (x, y + 10), (x - 10, y)], fill=(255, 120, 80))
            label(d, (x + 12, y - 9), name, f, (255, 170, 140))
        for (u, v), text, z in self.notes:
            x, y = P(u, v, (z if z is not None else self.h_at(u, v)) if not plan else 0)
            label(d, (x - len(text) * 3.5, y - 8), text, f, (235, 235, 235))
        if plan:  # one screen, for scale
            x0, y0 = P(self.U[1] - 36, self.V[1] - 26, 0); x1, y1 = P(self.U[1] - 6, self.V[1] - 5, 0)
            for a, b in (((x0, y0), (x1, y0)), ((x1, y0), (x1, y1)), ((x1, y1), (x0, y1)), ((x0, y1), (x0, y0))): dash(d, a, b, (255, 255, 255), 2)
            label(d, (x0 + 4, y0 + 4), 'one screen', f, (255, 255, 255))

def _frames(self, every=14.0, scale=2):
    """Play-sized frames along each route, no labels: a 30 u wide view with the wizard (a white dot) placed where the
    camera puts it (the view reaches 13.6 u up the screen and 7.6 down). One contact sheet per route, for the flow critic."""
    k = 16
    img = self.draw(squash=0.5, zs=14.5 / 16, k=k, plan=False, overlays=False); P = self._P
    fw, fh = 480, 270
    sheets = []
    walks = [(pts, label) for pts, label, _ in self.passes] or self.routes
    for n, (pts, rank) in enumerate(walks):
        samples, carry = [], 0.0
        for (u0, v0), (u1, v1) in zip(pts, pts[1:]):
            L = math.hypot(u1 - u0, v1 - v0); t = carry
            while t <= L:
                samples.append((u0 + (u1 - u0) * t / L, v0 + (v1 - v0) * t / L)); t += every
            carry = t - L
        samples.append(pts[-1])
        crops = []
        for u, v in samples:
            x, y = P(u, v, self.h_at(u, v))
            c = img.crop((int(x - fw / 2), int(y - fh * 0.64), int(x + fw / 2), int(y + fh * 0.36))).copy()
            dd = ImageDraw.Draw(c); dd.ellipse([fw / 2 - 4, fh * 0.64 - 10, fw / 2 + 4, fh * 0.64], fill=(255, 255, 255), outline=(0, 0, 0))
            crops.append(c.resize((fw * scale, fh * scale), Image.NEAREST))
        cols = 2; rows = (len(crops) + 1) // 2
        sheet = Image.new('RGB', (cols * fw * scale + 10, rows * (fh * scale + 30)), (10, 10, 14)); sd = ImageDraw.Draw(sheet)
        for i, c in enumerate(crops):
            X, Y = (i % cols) * (fw * scale + 10), (i // cols) * (fh * scale + 30)
            sheet.paste(c, (X, Y + 26)); sd.text((X + 6, Y + 2), f'{"pass" if self.passes else "route"} {n + 1} ({rank}), step {i + 1} of {len(crops)}', font=font(18), fill=(230, 230, 230))
        path = os.path.join(OUT, f'{self.name}-flow-{n + 1}.png'); sheet.save(path); sheets.append(path)
    print('frames:', ', '.join(os.path.basename(p) for p in sheets))
    return sheets
Plan.frames = _frames

def _landmarks_only(self, d, P):
    for (u, v), name, hgt, rad in self.marks:
        g = self.h_at(u, v); x, y = P(u, v, g); _, y2 = P(u, v, g + hgt)
        k = 16; rx = rad * k; zc = (y + y2) / 2 - rad * k * 0.25          # rings about the upper half, as wide as the real one
        d.rectangle([x - 0.25 * rx, zc, x + 0.25 * rx, y], fill=(150, 110, 60))
        for sq in (1.0, 0.45, 0.2):
            d.ellipse([x - rx, zc - rx * sq, x + rx, zc + rx * sq], outline=(230, 190, 90), width=6)
        d.ellipse([x - rx * 0.3, zc - rx * 0.3, x + rx * 0.3, zc + rx * 0.3], fill=(200, 150, 255))
        d.line([(x, zc), (x, zc - 420)], fill=(190, 120, 255), width=8)
    for (u, v), g in self.doors:
        x, y = P(u, v, g); d.rectangle([x - 10, y - 26, x + 10, y], fill=(40, 28, 18))
Plan._landmarks_only = _landmarks_only

PASS_COL = [(255, 214, 90), (110, 220, 255), (255, 140, 110), (170, 255, 140), (230, 150, 255), (255, 255, 255), (255, 180, 40), (120, 160, 255)]
def _journey_map(self):
    """The plan from above with the journey on it: each pass numbered, in its own colour, arrows in its walking direction,
    nudged sideways so passes along the same road stay apart; a legend lists what each pass is for."""
    k = 6
    img = self.draw(squash=1.0, zs=0.0, k=k, plan=True, overlays=False); P = self._P
    d = ImageDraw.Draw(img); f = font(16)
    n_all = len(self.passes)
    for n, (pts, label, moment) in enumerate(self.passes):
        col = PASS_COL[n % len(PASS_COL)]; off = (n - (n_all - 1) / 2) * 1.6
        xy = []
        for i, (u, v) in enumerate(pts):
            a, b = pts[max(i - 1, 0)], pts[min(i + 1, len(pts) - 1)]
            L = math.dist(a, b) or 1; nu, nv = -(b[1] - a[1]) / L, (b[0] - a[0]) / L
            xy.append(P(u + nu * off, v + nv * off, 0))
        d.line(xy, fill=(0, 0, 0), width=7); d.line(xy, fill=col, width=4)
        for (x0, y0), (x1, y1) in zip(xy, xy[1:]):
            L = math.hypot(x1 - x0, y1 - y0)
            if L < 30: continue
            ux, uy = (x1 - x0) / L, (y1 - y0) / L; mx, my = x0 + (x1 - x0) * 0.6, y0 + (y1 - y0) * 0.6
            d.polygon([(mx + ux * 9, my + uy * 9), (mx - ux * 6 - uy * 7, my - uy * 6 + ux * 7), (mx - ux * 6 + uy * 7, my - uy * 6 - ux * 7)], fill=col, outline=(0, 0, 0))
        x, y = xy[0]; d.ellipse([x - 12, y - 12, x + 12, y + 12], fill=col, outline=(0, 0, 0), width=2)
        d.text((x - 5, y - 10), str(n + 1), font=f, fill=(0, 0, 0))
    for (u, v), name, hgt, *_ in self.marks:
        x, y = P(u, v, 0); d.ellipse([x - 9, y - 9, x + 9, y + 9], fill=(190, 120, 255), outline=(255, 255, 255), width=2)
    # the legend
    rows = [(f'{n + 1}. {label}', moment) for n, (_, label, moment) in enumerate(self.passes)]
    H = 30 + 24 * sum(2 if m else 1 for _, m in rows)
    out = Image.new('RGB', (img.width, img.height + H), (18, 20, 28)); out.paste(img, (0, 0)); od = ImageDraw.Draw(out)
    y = img.height + 8
    for n, (t, m) in enumerate(rows):
        od.rectangle([20, y + 4, 34, y + 18], fill=PASS_COL[n % len(PASS_COL)]); od.text((44, y), t, font=f, fill=(235, 235, 235)); y += 24
        if m: od.text((44, y), m, font=font(14), fill=(180, 176, 168)); y += 24
    od.text((20, 14), f'{self.title}  (the journey)', font=font(22), fill=(240, 230, 210))
    return out
Plan.journey_map = _journey_map

def centroid(poly): return (sum(p[0] for p in poly) / len(poly), sum(p[1] for p in poly) / len(poly))

def label(d, xy, text, f, col):
    x, y = xy
    for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1), (1, 1)): d.text((x + dx, y + dy), text, font=f, fill=(0, 0, 0))
    d.text((x, y), text, font=f, fill=col)

def dash(d, a, b, col, w, on=8, off=6):
    (x0, y0), (x1, y1) = a, b
    L = math.hypot(x1 - x0, y1 - y0); n = max(1, int(L / (on + off)))
    for s in range(n + 1):
        t0, t1 = s * (on + off) / max(L, 1), min(1, (s * (on + off) + on) / max(L, 1))
        if t0 >= 1: break
        d.line([(x0 + (x1 - x0) * t0, y0 + (y1 - y0) * t0), (x0 + (x1 - x0) * t1, y0 + (y1 - y0) * t1)], fill=col, width=w)
