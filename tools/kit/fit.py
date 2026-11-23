"""The fit step: make a generated model (Meshy) fit its kit piece exactly, so pieces made separately join.

  blender --background --python tools/kit/fit.py -- <in.glb> <out.glb> <piece>

Meshy gets the look right and the sizes wrong. This turns the model so its length runs along x and its front faces
the lower side, scales it to the piece's box (FIT below), cuts both ends flat at the join planes (filling the cut),
puts the pivot where the kit page places pieces, and reduces it to a polygon budget. Units are u (1 u = 0.6 m), y up
after glTF export, z out of the front. The ends are cut, not modelled: in this kit every run's ends are covered by
a joint (a pier, a newel, a corner block), so a clean flat cut is enough.
"""
import sys, math
import bpy, bmesh
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:]
src, dst, piece = argv[0], argv[1], argv[2]
M = 1 / 0.6

# the box each piece must fill, in u, in Blender axes (x along, -y = the front (glTF +z), z up), and its pivot
# len: x from 0 to len; dep: (back, front) as -y extents; hgt: (bottom, top) in z; budget: triangles
FIT = {
    'balustrade': dict(len=1.45, dep=(-0.36, -0.04), hgt=(0.0, 0.95 * M), cut=True, budget=6000),
    'retain': dict(len=2.0, dep=(-0.55, 0.12), hgt=(-3.0 * M, 0.05 * M), cut=True, budget=6000),
    # a retaining wall that stacks to any drop: the top course with its coping, and a plain course cut from below it
    'retain-top': dict(len=2.0, dep=(-0.55, 0.12), hgt=(-1.1, 0.05 * M), cut=True, budget=6000),
    'retain-course': dict(len=2.0, dep=(-0.55, 0.12), hgt=(-1.1, 0.05 * M), cut=True, budget=5000, keep_below=-0.32),
    'pier': dict(len=None, box=(0.55, 0.55), hgt=(0.0, 1.3 * M), cut=False, budget=4000),
    # round 2: a step (two modules make a 4 u flight), a kerb (its top a little proud of the pavement), the coping block
    # over a turn, and a retaining section with an arched niche (a variant of the top course, as tall as two courses)
    'tread': dict(len=2.0, dep=(-0.5, 0.06), hgt=(-0.42, 0.0), cut=True, budget=2500),
    'kerb': dict(len=2.0, dep=(-0.32, 0.0), hgt=(-0.6, 0.05), cut=True, budget=2500),
    'corner': dict(len=None, box=(0.72, 0.72), hgt=(-0.25, 0.14), cut=False, budget=2000),
    'niche': dict(len=2.0, dep=(-0.55, 0.12), hgt=(-2.0, 0.05 * M), cut=True, budget=8000),
}[piece]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
for o in bpy.context.scene.objects: o.select_set(o in meshes)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1: bpy.ops.object.join()
ob = bpy.context.view_layer.objects.active
ob.parent = None
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

def bbox():
    vs = [ob.matrix_world @ v.co for v in ob.data.vertices]
    lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    return lo, hi

def apply(mat):
    ob.data.transform(mat); ob.data.update()

# 1. length along x: the longer horizontal extent
lo, hi = bbox()
if FIT['len'] and (hi.y - lo.y) > (hi.x - lo.x): apply(Matrix.Rotation(math.pi / 2, 4, 'Z'))
# 2. the front: for a retaining section, the side the coping overhangs (its top reaches further than its middle)
lo, hi = bbox()
if piece.startswith('retain') or piece == 'niche':
    vs = [v.co for v in ob.data.vertices]; zt = lo.z + 0.9 * (hi.z - lo.z); zm = lo.z + 0.5 * (hi.z - lo.z)
    top = [v.y for v in vs if v.z > zt]; mid = [v.y for v in vs if abs(v.z - zm) < 0.1 * (hi.z - lo.z)]
    if top and mid and (min(top) - min(mid)) > (max(mid) - max(top)): apply(Matrix.Rotation(math.pi, 4, 'Z'))   # overhang toward +y: turn it to -y
# 3. scale to the box (a little long, so the cut leaves flat ends)
lo, hi = bbox(); size = hi - lo
over = 1.04 if FIT['cut'] else 1.0
if FIT['len']: sx = FIT['len'] * over / size.x; sy = (FIT['dep'][1] - FIT['dep'][0]) / size.y
else: sx = FIT['box'][0] / size.x; sy = FIT['box'][1] / size.y
sz = (FIT['hgt'][1] - FIT['hgt'][0]) / size.z
apply(Matrix.Diagonal((sx, sy, sz, 1)))
lo, hi = bbox()
if FIT['len']:
    # x from a little before 0 to a little past len; the front (Blender min y, glTF +z) at glTF z = dep[1]; bottom at hgt[0]
    apply(Matrix.Translation(Vector((-lo.x - FIT['len'] * (over - 1) / 2, -FIT['dep'][1] - lo.y, FIT['hgt'][0] - lo.z))))
else:
    apply(Matrix.Translation(Vector((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, FIT['hgt'][0] - lo.z))))
# 4. cut the ends flat at x = 0 and x = len, and fill the cuts
if FIT['cut']:
    bm = bmesh.new(); bm.from_mesh(ob.data)
    for co, no in (((0, 0, 0), (-1, 0, 0)), ((FIT['len'], 0, 0), (1, 0, 0))):
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        r = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no, clear_outer=True)
        cut_edges = [e for e in r['geom_cut'] if isinstance(e, bmesh.types.BMEdge)]
        if cut_edges:
            try: bmesh.ops.holes_fill(bm, edges=cut_edges, sides=0)
            except Exception: pass
    bm.to_mesh(ob.data); bm.free(); ob.data.update()
# 4b. a plain course: keep only what's below keep_below (under the coping), and put its top at 0
if FIT.get('keep_below') is not None:
    bm = bmesh.new(); bm.from_mesh(ob.data)
    r = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, FIT['keep_below']), plane_no=(0, 0, 1), clear_outer=True)
    bm.to_mesh(ob.data); bm.free(); ob.data.update()
    apply(Matrix.Translation(Vector((0, 0, -FIT['keep_below']))))
# 5. the polygon budget
tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
if tris > FIT['budget']:
    mod = ob.modifiers.new('dec', 'DECIMATE'); mod.ratio = FIT['budget'] / tris
    bpy.ops.object.modifier_apply(modifier=mod.name)
lo, hi = bbox()
print(f'fit {piece}: {sum(len(p.vertices) - 2 for p in ob.data.polygons)} tris, box x {lo.x:.3f}..{hi.x:.3f} front..back y {lo.y:.3f}..{hi.y:.3f} z {lo.z:.3f}..{hi.z:.3f}')
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', use_selection=False)
