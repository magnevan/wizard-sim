"""The outline a made model stands on: where laid paving stops round a building (tess_layout.py).

  python tools/kit/model_base.py library great-hall ...   prints each outline's size, and writes a picture of each
                                                          to $TMP (or the current folder) as base-<name>.png

A building's kit.json box is only the room it may take: a model is fitted uniformly inside it (fit.py), so it is
often narrower on one side (the bell tower stands 6.3 u across on a 10 u footprint). So the outline comes from the
model itself, seen from above between SKIP and BAND u over its lowest point:
  - every triangle reaching into that band is drawn from above: its walls, steps and plinth (not a thin ground slab
    under the whole model, as the great hall has, running on under its archway);
  - gaps in those walls narrower than 2 x NECK u are bridged (doorways, cracks between Meshy's wall pieces), and
    whatever the walls then enclose is filled: that is the building. A wider gap stays open, so the great hall's
    archway, which the north road runs through, keeps its paving;
  - notches and bumps narrower than 2 x SMOOTH u are smoothed away, so the border course laid along it runs straight.
The outline is in the model's own frame (x across, z toward its front, u), as kit-render.ts places it.
"""
import functools, json, os, struct, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from shapely.geometry import Polygon, box
from shapely.ops import unary_union

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.join(HERE, '..', '..', 'game', 'content', 'generated', 'meshy', 'kit')
SKIP = 0.15     # u above the model's lowest point: a ground slab under it all, left out
BAND = 1.5      # u above it: what it stands on (to 0.9 m: steps, plinth, the walls' feet, below any opening's sill)
NECK = 1.0      # u: a gap in the walls narrower than twice this is bridged (a doorway)
PPU = 16        # pixels a u the outline is found at
SMOOTH = 0.35   # u: notches and bumps in the outline narrower than twice this are smoothed away


def _triangles(path):
    """Every triangle of a .glb (n, 3, 3), in its scene's frame."""
    b = open(path, 'rb').read()
    n = struct.unpack_from('<I', b, 12)[0]
    J = json.loads(b[20:20 + n]); off = 20 + n
    BIN = b[off + 8:off + 8 + struct.unpack_from('<I', b, off)[0]]
    if any(e in J.get('extensionsRequired', []) for e in ('KHR_draco_mesh_compression', 'KHR_mesh_quantization', 'EXT_meshopt_compression')):
        raise ValueError(f'{os.path.basename(path)}: compressed meshes are not read')
    def acc(i):
        a = J['accessors'][i]; v = J['bufferViews'][a['bufferView']]
        o = v.get('byteOffset', 0) + a.get('byteOffset', 0)
        dt = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}[a['componentType']]
        k = {'SCALAR': 1, 'VEC3': 3}[a['type']]; sz = np.dtype(dt).itemsize
        st = v.get('byteStride', sz * k)
        raw = np.frombuffer(BIN, np.uint8, count=st * (a['count'] - 1) + sz * k, offset=o)
        return np.lib.stride_tricks.as_strided(raw, (a['count'], sz * k), (st, 1)).copy().view(dt).reshape(a['count'], k)
    def mat(nd):
        if 'matrix' in nd: return np.array(nd['matrix'], float).reshape(4, 4).T
        x, y, z, w = nd.get('rotation', [0, 0, 0, 1]); M = np.eye(4)
        R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                      [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                      [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
        M[:3, :3] = R * np.array(nd.get('scale', [1, 1, 1])); M[:3, 3] = nd.get('translation', [0, 0, 0])
        return M
    out = []
    def walk(i, P):
        nd = J['nodes'][i]; M = P @ mat(nd)
        if 'mesh' in nd:
            for pr in J['meshes'][nd['mesh']]['primitives']:
                if pr.get('mode', 4) != 4: continue
                p = acc(pr['attributes']['POSITION']).astype(float)
                p = (np.c_[p, np.ones(len(p))] @ M.T)[:, :3]
                ix = acc(pr['indices']).ravel() if 'indices' in pr else np.arange(len(p))
                out.append(p[ix.reshape(-1, 3)])
        for c in nd.get('children', []): walk(c, M)
    for r in J['scenes'][J.get('scene', 0)]['nodes']: walk(r, np.eye(4))
    return np.concatenate(out)


def _vector(mask, x0, z0):
    """A pixel mask as one shapely shape (u): each row's runs as boxes, joined, the stairs simplified away."""
    boxes = []
    for r in range(mask.shape[0]):
        row = np.r_[0, mask[r].astype(np.int8), 0]
        d = np.diff(row); starts, ends = np.nonzero(d == 1)[0], np.nonzero(d == -1)[0]
        boxes += [box(x0 + s / PPU, z0 + r / PPU, x0 + e / PPU, z0 + (r + 1) / PPU) for s, e in zip(starts, ends)]
    return unary_union(boxes).simplify(0.6 / PPU) if boxes else Polygon()


@functools.lru_cache(maxsize=None)
def _base(path, mtime):
    T = _triangles(path)
    y0 = T[..., 1].min()
    T = T[(T[..., 1].min(1) < y0 + BAND) & (T[..., 1].max(1) > y0 + SKIP)]
    lo, hi = T[..., [0, 2]].reshape(-1, 2).min(0) - 2 * NECK - 0.5, T[..., [0, 2]].reshape(-1, 2).max(0) + 2 * NECK + 0.5
    w, h = int(np.ceil((hi[0] - lo[0]) * PPU)), int(np.ceil((hi[1] - lo[1]) * PPU))
    im = Image.new('1', (w, h), 0); dr = ImageDraw.Draw(im)
    for t in T:   # (the whole triangle: a wall's face seen from above is a line, its foot is in the band)
        dr.polygon([((x - lo[0]) * PPU, (z - lo[1]) * PPU) for x, _, z in t], fill=1, outline=1)
    solid = np.asarray(im, bool)
    yy, xx = np.mgrid[-NECK * PPU:NECK * PPU + 1, -NECK * PPU:NECK * PPU + 1]
    disc = (xx * xx + yy * yy) <= (NECK * PPU) ** 2
    inside = ndimage.binary_fill_holes(ndimage.binary_closing(solid, disc)) | solid
    g = _vector(inside, lo[0], lo[1])
    parts = [p for p in getattr(g, 'geoms', [g]) if p.area > 0.25]     # (crumbs: a stray triangle)
    if not parts: return None
    # notches and bumps under 2 x SMOOTH u smoothed away (a door's steps, a buttress's foot), corners kept square:
    # the paving's border course runs along the outline, and would wobble round each one
    g = unary_union(parts).buffer(SMOOTH, join_style=2).buffer(-2 * SMOOTH, join_style=2).buffer(SMOOTH, join_style=2)
    return g if not g.is_empty else None


def base(name, piece=None):
    """The outline the model `name` stands on, in its own frame (shapely, u); else, with no model, the stand-in's
    plinth from the kit.json piece (its footprint 1.12 times over, as kit-render.ts draws it); None without either."""
    path = os.path.join(MODELS, f'{name}.glb')
    if os.path.exists(path):
        g = _base(os.path.abspath(path), os.path.getmtime(path))
        if g is not None and not g.is_empty: return g
    if piece and piece.get('footprint'):
        w, d = (v * 1.12 for v in piece['footprint'])
        if piece.get('shape') != 'round': return box(-w / 2, -d / 2, w / 2, d / 2)
        a = np.linspace(0, 2 * np.pi, 96, endpoint=False)
        return Polygon(np.c_[w / 2 * np.cos(a), d / 2 * np.sin(a)])
    return None


def placed(it, piece):
    """A set piece instance's outline on the map (u, x and y as the scene's), turned and moved as kit-render.ts
    places it: its group turned by atan2(cos rot, sin rot) about y, so its front (+z) faces (cos rot, sin rot)."""
    g = base(it['p'].split('.', 1)[1], piece)
    if g is None: return None
    c, s, k = np.cos(it['rot']), np.sin(it['rot']), it.get('scale', 1) or 1
    def to_map(ring): return [(it['x'] + k * (x * s + z * c), it['y'] + k * (-x * c + z * s)) for x, z in ring.coords]
    return unary_union([Polygon(to_map(p.exterior), [to_map(r) for r in p.interiors]) for p in getattr(g, 'geoms', [g])]).buffer(0)


if __name__ == '__main__':
    out = os.environ.get('TMP', '.')
    for n in sys.argv[1:]:
        g = base(n)
        if g is None: print(n, 'no model'); continue
        x0, z0, x1, z1 = g.bounds
        print(f'{n:15s} {x1 - x0:5.2f} x {z1 - z0:5.2f} u, {g.area:6.1f} u2, {len(getattr(g, "geoms", [g]))} part(s), {sum(len(p.interiors) for p in getattr(g, "geoms", [g]))} hole(s)')
        s = 20; im = Image.new('RGB', (int((x1 - x0) * s) + 20, int((z1 - z0) * s) + 20), (240, 236, 228)); dr = ImageDraw.Draw(im)
        for p in getattr(g, 'geoms', [g]):
            dr.polygon([((x - x0) * s + 10, (z - z0) * s + 10) for x, z in p.exterior.coords], fill=(90, 86, 100))
            for r in p.interiors: dr.polygon([((x - x0) * s + 10, (z - z0) * s + 10) for x, z in r.coords], fill=(240, 236, 228))
        im.save(os.path.join(out, f'base-{n}.png'))
