"""A still to judge field-aligned stone tessellation by (docs/explorations/2026-11-24-road-stones.md): no engine.

  python tools/kit/tess_proof.py <out.png> [--ppu 64] [--rect x0,y0,x1,y1] [--seed 1] [--debug]

Takes a rectangle of the compiled court (game/packages/client/src/lab/kit-court.json), and for each ground surface in
it (the road, the kerb strip along the road's edge, the paving):
  1. a direction field: parallel to the surface's edge at every edge, blended inside. It is kept four-fold (a
     direction and the one square to it count as the same), so stones stay in line through square corners;
  2. a tessellation: stone centres relaxed (Lloyd) under a distance that is a box turned to the field at each centre,
     after Hausner's "Simulating Decorative Mosaics" (2001): cells come out four-sided and in rows along edges, and go
     irregular by themselves where two flows meet;
  3. a painting of it from above: every stone its own tone from a palette, a bevel lit from one side, painted grain
     from a Codex stone sheet, sand in the joints.
The picture covers the rectangle exactly (top = north), so kit3d's ?paint= can lay it on the ground to look at it in
the game camera.
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from scipy.spatial import cKDTree
from shapely.geometry import Point, Polygon, box
from shapely.geometry.polygon import orient
from shapely.ops import unary_union

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
TEX = os.path.join(ROOT, 'game', 'content', 'generated', 'textures')


def opt(k, d):
    return sys.argv[sys.argv.index(k) + 1] if k in sys.argv else d


OUT = sys.argv[1]
PPU = int(opt('--ppu', 64))
RECT = [float(v) for v in opt('--rect', '81,31.5625,111,48.4375').split(',')]
SEED = int(opt('--seed', 1))
ROAD_SCALE = float(opt('--road', 1))        # the road's stones this many times the usual size
# (surfaces are laid whole, never cut to the rectangle: a cut would be an edge, and rows would follow it)
rng = np.random.default_rng(SEED)

# ---- what each surface is laid with: stone half-sizes (u) along and across the row, how much sizes vary, colours ----
LAY = {
    'road': dict(a=0.22, b=0.19, vary=0.12, sizes=[1.0], joint=0.026, bevel=0.035, relax=6,
                 pal=[(150, 132, 140), (166, 146, 150), (178, 158, 156), (158, 142, 152), (186, 164, 152), (142, 126, 138)],
                 jointc=(96, 82, 88), tone=0.07, sheet='sett'),
    'kerb': dict(length=0.95, joint=0.03, bevel=0.03,
                 pal=[(226, 208, 184), (218, 198, 174), (232, 216, 194), (212, 194, 174)],
                 jointc=(140, 118, 104), tone=0.04, sheet='kerb', grain=0.35),
    'cobble': dict(a=0.52, b=0.36, vary=0.2, sizes=[0.75, 1.0, 1.0, 1.3], joint=0.03, bevel=0.04, relax=5,
                   pal=[(214, 168, 150), (224, 180, 158), (204, 158, 146), (230, 190, 166), (210, 172, 160), (196, 152, 140)],
                   jointc=(142, 104, 96), tone=0.06, sheet='sett'),
}
KERB_W = 0.32
LAY['road']['a'] *= ROAD_SCALE; LAY['road']['b'] *= ROAD_SCALE


def surfaces():
    """The rectangle's ground as shapely surfaces: {name: geometry}, the kerb strip cut out of the paving beside the road."""
    d = json.load(open(os.path.join(ROOT, 'game', 'packages', 'client', 'src', 'lab', 'kit-court.json')))
    area = box(*RECT); by = {}
    for f in d['floors']:
        g = unary_union([Polygon(p[0], p[1:]).buffer(0) for p in f['polys']])
        if g.intersection(area).area > 0.5: by.setdefault((f['mat'], f['h']), []).append(g)
    out = {}
    roads = [unary_union(v) for (m, h), v in by.items() if m == 'road']
    road = unary_union(roads) if roads else None
    # the compiler leaves slivers where a curve meets the grid (the outline runs out to a point and back): close any
    # notch under 0.4 u wide, so neither the kerb nor the rows follow it
    if road is not None: road = road.buffer(0.2, join_style=2).buffer(-0.2, join_style=2)
    for (m, h), v in by.items():
        g = unary_union(v)
        if m == 'road': out['road'] = road
        elif m in LAY and road is not None:
            kerb = g.intersection(road.buffer(KERB_W, join_style=2))
            out['kerb'] = kerb if 'kerb' not in out else out['kerb'].union(kerb)
            out[m] = g.difference(road).difference(kerb)
        elif m in LAY: out[m] = g
    return out


def raster(geom, ppu, win):
    X0, Y0, X1, Y1 = win
    w, h = int(round((X1 - X0) * ppu)), int(round((Y1 - Y0) * ppu))
    im = Image.new('L', (w, h), 0); dr = ImageDraw.Draw(im)
    for g in getattr(geom, 'geoms', [geom]):
        if g.geom_type != 'Polygon': continue
        dr.polygon([((x - X0) * ppu, (y - Y0) * ppu) for x, y in g.exterior.coords], fill=255)
        for r in g.interiors: dr.polygon([((x - X0) * ppu, (y - Y0) * ppu) for x, y in r.coords], fill=0)
    return np.asarray(im) > 127


def field(mask, ppu, reach=1.4):
    """The row direction (radians) at every pixel: along the nearest edge at an edge, blended inside."""
    d = ndimage.distance_transform_edt(mask) / ppu
    ds = ndimage.gaussian_filter(d, 0.12 * ppu)
    gy, gx = np.gradient(ds)
    th = np.arctan2(gy, gx) + np.pi / 2                      # along the edge
    w = np.exp(-d / 0.6) * mask * (np.hypot(gx, gy) > 0.2 / ppu)
    def blend(k):
        z = w * np.exp(1j * k * th)
        z = ndimage.gaussian_filter(z.real, reach * ppu) + 1j * ndimage.gaussian_filter(z.imag, reach * ppu)
        return np.angle(z) / k
    t4, t2 = blend(4), blend(2)
    # of the four-fold field's two lines, the one nearer the two-fold field is the row
    turn = np.round((t2 - t4) / (np.pi / 2))
    return t4 + turn * np.pi / 2, d


def metric(dx, dy, th, a, b):
    """The box distance from a centre turned by th with half-sizes a, b: 1 on the stone's own outline."""
    c, s = np.cos(th), np.sin(th)
    return np.maximum(np.abs(dx * c + dy * s) / a, np.abs(-dx * s + dy * c) / b)


def owners(pts, sites, th, a, b, k=10):
    """For each point: its stone, the box distance to it, and to the next nearest."""
    k = min(k, len(sites))
    _, idx = cKDTree(sites).query(pts, k=k)
    idx = idx.reshape(len(pts), k)
    m = metric(pts[:, None, 0] - sites[idx, 0], pts[:, None, 1] - sites[idx, 1], th[idx], a[idx], b[idx])
    o = np.argsort(m, axis=1)[:, :2]
    r = np.arange(len(pts))
    own, nxt = idx[r, o[:, 0]], idx[r, o[:, 1]] if k > 1 else idx[r, o[:, 0]]
    # toward the next stone, is the owner's box measured along its row or across it? that half-size turns the box
    # distance back into u
    dx, dy = sites[nxt, 0] - sites[own, 0], sites[nxt, 1] - sites[own, 1]
    c, s_ = np.cos(th[own]), np.sin(th[own])
    along = np.abs(dx * c + dy * s_) / a[own] >= np.abs(-dx * s_ + dy * c) / b[own]
    return own, m[r, o[:, 0]], (m[r, o[:, 1]] if k > 1 else np.full(len(pts), 9.0)), np.where(along, a[own], b[own])


def rows(geom, L):
    """Stone centres in rows laid inward from the surface's edge, as paving is laid: row after row, each a row's width
    inside the last (the outline shrunk), stones spaced along it; a stone that would crowd one already laid is left out."""
    sites, size, depth = [], [], 0.0
    k = 0
    while True:
        sc = float(rng.choice(L['sizes'])) if len(L['sizes']) > 1 else 1.0
        bw = L['b'] * sc
        line = geom.buffer(-(depth + bw * 0.9), join_style=2)       # (a strip one row wide still has a middle)
        if line.is_empty: break
        for ring in [r for g in getattr(line, 'geoms', [line]) if g.geom_type == 'Polygon' for r in [g.exterior, *g.interiors]]:
            n_len = ring.length; t = rng.uniform(0, 2 * L['a'] * sc)
            while t < n_len:
                al = L['a'] * sc * (1 + rng.uniform(-L['vary'], L['vary']))
                pt = ring.interpolate(t + al)
                sites.append((pt.x, pt.y)); size.append((al, bw, k))
                t += 2 * al
        depth += 2 * bw; k += 1
        if k > 400: break
    return np.array(sites).reshape(-1, 2), np.array(size).reshape(-1, 3)


def prune(sites, size, th):
    """Leaves out stones that crowd one laid before them (an outer row wins): where rows from two edges meet."""
    order = np.argsort(size[:, 2], kind='stable'); keep = np.zeros(len(sites), bool)
    tree = cKDTree(sites)
    near = tree.query_ball_point(sites, r=2.2 * size[:, 0].max())
    for i in order:
        js = [j for j in near[i] if keep[j]]
        if js:
            js = np.array(js)
            m = metric(sites[i, 0] - sites[js, 0], sites[i, 1] - sites[js, 1], th[js], size[js, 0], size[js, 1])
            if m.min() < 1.25: continue
        keep[i] = True
    return keep


def kerb_blocks(road, strip):
    """A kerb is not a surface to tessellate: it is one row of blocks, one block wide, along the road's edge.
    Each straight run of the edge is cut into equal blocks about LAY['kerb']['length'] long; a joint crosses the kerb
    square to the edge, and on the bisector at a corner, so the blocks there are mitred. Returns the blocks' four
    corners (u), and their centres, directions and half-sizes as for stones."""
    L = LAY['kerb']; quads = []
    nearby = strip.buffer(0.05)
    for poly in getattr(road, 'geoms', [road]):
        poly = orient(poly, 1.0)
        for ring in [poly.exterior, *poly.interiors]:
            P = np.array(ring.simplify(0.12).coords)[:-1]       # (a notch in the outline smaller than this is not a corner of the kerb)
            P = P[np.r_[True, np.hypot(*(P[1:] - P[:-1]).T) > 1e-6]]
            n = len(P)
            if n < 3: continue
            d = np.roll(P, -1, 0) - P; d /= np.hypot(*d.T)[:, None]            # segment i: from P[i] to P[i + 1]
            out = np.stack([d[:, 1], -d[:, 0]], 1)                             # away from the road
            prev = np.roll(out, 1, 0)
            cos = np.clip((np.roll(d, 1, 0) * d).sum(1), -1, 1); turn = np.arccos(cos)
            bis = prev + out; bis /= np.maximum(np.hypot(*bis.T), 1e-9)[:, None]
            mitre = bis * np.minimum(1 / np.maximum(np.cos(turn / 2), 0.2), 2.5)[:, None]
            corners = np.nonzero(turn > np.radians(8))[0]
            if not len(corners): corners = np.array([0])
            for ci, c0 in enumerate(corners):                                  # a run: from one corner to the next
                c1 = corners[(ci + 1) % len(corners)]
                idx = [c0]
                while True:
                    idx.append((idx[-1] + 1) % n)
                    if idx[-1] == c1 or len(idx) > n: break
                pts = P[idx]; seg = np.hypot(*(pts[1:] - pts[:-1]).T); acc = np.r_[0, np.cumsum(seg)]; total = acc[-1]
                if total < 1e-6: continue
                def joint(t):
                    if t <= 1e-6: return pts[0], mitre[idx[0]]
                    if t >= total - 1e-6: return pts[-1], mitre[idx[-1]]
                    k = int(np.searchsorted(acc, t)) ; f = (t - acc[k - 1]) / seg[k - 1]
                    return pts[k - 1] + (pts[k] - pts[k - 1]) * f, out[idx[k - 1]]
                count = max(1, int(round(total / L['length'])))
                for k in range(count):
                    (pa, na), (pb, nb) = joint(total * k / count), joint(total * (k + 1) / count)
                    q = np.array([pa, pb, pb + nb * KERB_W, pa + na * KERB_W])
                    side = np.hypot(*(np.roll(q, -1, 0) - q).T)
                    if side.max() > 2.2 * L['length'] or not Polygon(q).is_valid: continue      # a sliver thrown out by a notch in the outline
                    if nearby.contains(Point(*q.mean(0))): quads.append(q)
    quads = np.array(quads)
    ax = quads[:, 1] - quads[:, 0]; ln = np.hypot(*ax.T)
    return dict(quads=quads, sites=quads.mean(1), th=np.arctan2(ax[:, 1], ax[:, 0]), a=ln / 2, b=np.full(len(quads), KERB_W / 2), name='kerb', geom=strip)


def lay(name, geom, lppu=None):
    """A surface's stones: rows from the edge, then a little relaxing. Returns centres (u), row directions, half-sizes."""
    L = LAY[name]
    lppu = lppu or max(10, int(round(3.5 / min(L['a'], L['b']))))    # some 7 pixels across a stone's short side
    bx = geom.bounds; X0, Y0 = bx[0] - 0.5, bx[1] - 0.5
    mask = raster(geom, lppu, (X0, Y0, bx[2] + 0.5, bx[3] + 0.5))
    th_f, _ = field(mask, lppu)
    ys, xs = np.nonzero(mask)
    pts = np.stack([X0 + (xs + 0.5) / lppu, Y0 + (ys + 0.5) / lppu], 1)
    samp = lambda p: th_f[np.clip(((p[:, 1] - Y0) * lppu).astype(int), 0, mask.shape[0] - 1), np.clip(((p[:, 0] - X0) * lppu).astype(int), 0, mask.shape[1] - 1)]
    sites, size = rows(geom, L)
    keep = prune(sites, size, samp(sites)); sites, size = sites[keep], size[keep]
    n = len(sites)
    for it in range(L.get('relax', 6)):
        th = samp(sites)
        own, _, _, _ = owners(pts, sites, th, size[:, 0], size[:, 1])
        cnt = np.bincount(own, minlength=n).astype(float)
        cx = np.bincount(own, pts[:, 0], n) / np.maximum(cnt, 1); cy = np.bincount(own, pts[:, 1], n) / np.maximum(cnt, 1)
        live = cnt > 0
        sites[live] = sites[live] * 0.4 + np.stack([cx, cy], 1)[live] * 0.6
    th = samp(sites)
    return dict(sites=sites, th=th, a=size[:, 0], b=size[:, 1], name=name, geom=geom)


def paint(layers, ppu):
    """The picture of the laid surfaces from above, RECT at ppu pixels a u."""
    X0, Y0, X1, Y1 = RECT
    w, h = int(round((X1 - X0) * ppu)), int(round((Y1 - Y0) * ppu))
    img = np.zeros((h, w, 3)); height = np.zeros((h, w)); done = np.zeros((h, w), bool)
    sheets = json.load(open(os.path.join(TEX, 'stones.json')))
    for S in layers:
        L = LAY[S['name']]
        mask = raster(S['geom'], ppu, RECT)
        if 'quads' in S:
            lab = Image.new('I', (w, h), 0); dr = ImageDraw.Draw(lab)
            for i, q in enumerate(S['quads']): dr.polygon([((x - X0) * ppu, (y - Y0) * ppu) for x, y in q], fill=i + 1)
            lab = np.asarray(lab); mask = mask | (lab > 0)
            ys, xs = np.nonzero(mask)
            if not len(ys): continue
            pts = np.stack([X0 + (xs + 0.5) / ppu, Y0 + (ys + 0.5) / ppu], 1)
            own = np.maximum(lab[ys, xs] - 1, 0)
            # how far inside its block a point is (u): the nearest pixel of another block, or of none
            e = np.full((h, w), 0.0)
            pad = np.pad(lab, 2, mode='edge')
            edge = np.zeros(pad.shape, bool)
            for sy, sx in ((0, 1), (1, 0)):
                df = pad != np.roll(pad, 1, axis=0 if sy else 1); edge |= df | np.roll(df, -1, axis=0 if sy else 1)
            e = (ndimage.distance_transform_edt(~edge) / ppu)[2:-2, 2:-2] * (lab > 0)
            e = ndimage.gaussian_filter(e, 0.012 * ppu)
        else:
            ys, xs = np.nonzero(mask)
            if not len(ys): continue
            pts = np.stack([X0 + (xs + 0.5) / ppu, Y0 + (ys + 0.5) / ppu], 1)
            own, m1, m2, half = owners(pts, S['sites'], S['th'], S['a'], S['b'])
            # how far inside its stone a point is (u): from the border with the next stone, and from the surface's own edge
            e = np.full((h, w), 0.0); e[ys, xs] = (m2 - m1) / 2 * half
            e = np.minimum(e, ndimage.distance_transform_edt(np.pad(mask, 2, constant_values=True))[2:-2, 2:-2] / ppu)   # (the picture's rim is not an edge)
            e = ndimage.gaussian_filter(e, 0.02 * ppu)                  # rounds the corners where three stones meet
        n = len(S['sites']); r = np.random.default_rng(SEED + len(S['name']))
        pal = np.array(L['pal'], float)[r.integers(0, len(L['pal']), n)]
        lum = 1 + r.uniform(-L['tone'], L['tone'], n); warm = r.uniform(-L['tone'], L['tone'], n) * 0.5
        pal = pal * lum[:, None] * np.stack([1 + warm, np.ones(n), 1 - warm], 1)
        # painted grain: a window of one painted stone, laid along this stone, as a multiplier round 1
        sh = sheets[L['sheet']]; atlas = np.asarray(Image.open(os.path.join(TEX, f"stones-{L['sheet']}.png")).convert('RGB')).astype(float)
        ch, cw = atlas.shape[0] // sh['rows'], atlas.shape[1] // sh['cols']
        cell = r.integers(0, sh['n'], n); flip = r.integers(0, 4, n)
        dx, dy = pts[:, 0] - S['sites'][own, 0], pts[:, 1] - S['sites'][own, 1]
        c, s = np.cos(S['th'][own]), np.sin(S['th'][own])
        u = np.clip((dx * c + dy * s) / S['a'][own] * 0.42 + 0.5, 0.04, 0.96); v = np.clip((-dx * s + dy * c) / S['b'][own] * 0.42 + 0.5, 0.04, 0.96)
        u = np.where(flip[own] & 1, 1 - u, u); v = np.where(flip[own] & 2, 1 - v, v)
        px = ((cell[own] % sh['cols']) + u) * cw; py = ((cell[own] // sh['cols']) + v) * ch
        tex = atlas[np.clip(py.astype(int), 0, atlas.shape[0] - 1), np.clip(px.astype(int), 0, atlas.shape[1] - 1)]
        cmean = np.array([atlas[(k // sh['cols']) * ch:(k // sh['cols'] + 1) * ch, (k % sh['cols']) * cw:(k % sh['cols'] + 1) * cw].reshape(-1, 3).mean(0) for k in range(sh['n'])])
        grain = 1 + (tex / cmean[cell[own]] - 1) * L.get('grain', 0.7)
        col = pal[own] * grain
        ee = e[ys, xs]
        k = np.clip((ee - L['joint'] / 2) / (1.5 / ppu), 0, 1)           # 0 in the joint, 1 on the stone
        ao = 0.9 + 0.1 * np.clip((ee - L['joint'] / 2) / (L['bevel'] * 1.6), 0, 1)
        img[ys, xs] = np.array(L['jointc'], float) * (1 - k[:, None]) + col * ao[:, None] * k[:, None]
        hh = np.clip((ee - L['joint'] / 2) / L['bevel'], 0, 1); hh = hh * hh * (3 - 2 * hh)
        height[ys, xs] = hh * L['bevel']
        done |= mask
    # the bevels lit from the upper left, as the court's sun falls
    gy, gx = np.gradient(ndimage.gaussian_filter(height, 0.008 * ppu)); gy *= ppu; gx *= ppu
    shade = np.clip(1 + (gx * 0.55 + gy * 0.45) * -0.3, 0.78, 1.2)
    img *= shade[..., None]
    # broad, soft change over the whole ground, so no stretch is quite like the next
    big = ndimage.gaussian_filter(np.random.default_rng(SEED + 9).normal(0, 1, (h, w)), 1.6 * ppu); big /= np.abs(big).max() + 1e-9
    img *= (1 + big * 0.07)[..., None]
    img[~done] = (60, 60, 66)
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))


if __name__ == '__main__':
    surf = surfaces()
    print({k: round(v.area, 1) for k, v in surf.items()})
    layers = []
    for name in ('road', 'cobble', 'kerb'):
        if name in surf and not surf[name].is_empty:
            S = kerb_blocks(surf['road'], surf['kerb']) if name == 'kerb' else lay(name, surf[name]); layers.append(S)
            print(name, len(S['sites']), 'stones')
    paint(layers, PPU).save(OUT)
    print('->', OUT)
