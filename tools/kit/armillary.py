"""Assemble the armillary set piece from its made parts: a base (the dais, pedestal and violet core) and one closed ring,
copied three times round the core on nodes the renderer turns slowly (pin p22, 2026-11-24: the rings should be closed
and turn like a gyroscope).

  blender --background --python tools/kit/armillary.py -- <base.glb> <ring.glb> <out.glb>

Units are u (1 u = 0.6 m), Blender z up (glTF y up). The base fills setpiece.armillary's footprint (kit.json), evenly
scaled. Each ring hangs from an empty named spin-<i> at the core's centre; the empty's own tilt sets the ring's path and
its glTF extras {axis: [0, 1, 0], rpm} say how it turns (about its local up, which is glTF +y).
"""
import sys, os, json, math
import bpy, bmesh
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:]
base_src, ring_src, dst = argv
M = 1 / 0.6
pc = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'kit.json'), encoding='utf-8'))['pieces']['setpiece.armillary']
W, H = pc['footprint'][0], pc['height'] * M

# the rings: radius (as a share of the footprint's width), the empty's tilt (degrees about x, then about z), turns a minute
RINGS = [(0.33, (0, 0), 2.0), (0.285, (62, 30), -3.0), (0.24, (-58, -40), 4.0)]

bpy.ops.wm.read_factory_settings(use_empty=True)


def load(path, name):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    meshes = [o for o in bpy.context.scene.objects if o not in before and o.type == 'MESH']
    for o in bpy.context.scene.objects: o.select_set(o in meshes)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1: bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.parent = None
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in list(bpy.context.scene.objects):
        if o not in before and o is not ob: bpy.data.objects.remove(o, do_unlink=True)
    ob.name = name
    return ob


def bbox(ob):
    vs = [v.co for v in ob.data.vertices]
    return (Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs))),
            Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs))))


def tidy(ob):
    """Normals out and materials two-sided: a set piece is seen from every side (as fit.py does)."""
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(ob.data); bm.free(); ob.data.update()
    for m in ob.data.materials:
        if m: m.use_backface_culling = False


# the base: evenly scaled into the footprint and height, base centre at the origin
base = load(base_src, 'armillary-base')
lo, hi = bbox(base); size = hi - lo
s = min(W / size.x, W / size.y, H / size.z)
base.data.transform(Matrix.Diagonal((s, s, s, 1))); base.data.update()
lo, hi = bbox(base)
base.data.transform(Matrix.Translation(Vector((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z)))); base.data.update()
tidy(base)
lo, hi = bbox(base)
# the core: the crystal floats over its cup, so the biggest empty band of heights in the top half is the gap between them.
# Lift everything above the gap (the crystal) until the turning rings clear the cup: every ring sweeps a sphere round it.
# The crystal is low-poly (a few rings of vertices) over a dense pedestal, so the first empty band above half height
# is the gap between the cup and the crystal (the largest band would be inside the crystal itself).
h = hi.z - lo.z
zs = sorted(v.co.z for v in base.data.vertices if v.co.z > lo.z + 0.5 * h)
gap = next(i for i in range(len(zs) - 1) if zs[i + 1] - zs[i] > 0.04 * h)
cup_top, crystal_bottom = zs[gap], zs[gap + 1]
print(f'armillary: cup top {cup_top:.2f} u, crystal from {crystal_bottom:.2f} u')
crystal = [v for v in base.data.vertices if v.co.z >= crystal_bottom - 1e-6]
c_mid = (crystal_bottom + hi.z) / 2
R = max(share for share, _, _ in RINGS) * W
lift = max(0.0, cup_top + R + 0.4 - c_mid)
for v in crystal: v.co.z += lift
base.data.update()
core = Vector((0, 0, c_mid + lift))
print(f'armillary: gap {cup_top:.2f}..{crystal_bottom:.2f} u, crystal lifted {lift:.2f} u')

# the ring: its thin dimension along x (so it stands upright, its plane y-z), centred, outer radius 1
ring = load(ring_src, 'armillary-ring')
RING_BUDGET = 6000      # triangles for one ring (the website's model is about 280k); the three copies share the mesh
tris = sum(len(p.vertices) - 2 for p in ring.data.polygons)
if tris > RING_BUDGET:
    bpy.context.view_layer.objects.active = ring
    mod = ring.modifiers.new('dec', 'DECIMATE'); mod.ratio = RING_BUDGET / tris
    bpy.ops.object.modifier_apply(modifier=mod.name)
lo, hi = bbox(ring); size = hi - lo
axis = min(range(3), key=lambda i: size[i])
if axis == 1: ring.data.transform(Matrix.Rotation(math.pi / 2, 4, 'Z'))
if axis == 2: ring.data.transform(Matrix.Rotation(math.pi / 2, 4, 'Y'))
ring.data.update()
lo, hi = bbox(ring)
ring.data.transform(Matrix.Translation(-(lo + hi) / 2)); ring.data.update()
lo, hi = bbox(ring); r0 = max(hi.y - lo.y, hi.z - lo.z) / 2
ring.data.transform(Matrix.Diagonal((1 / r0, 1 / r0, 1 / r0, 1))); ring.data.update()
tidy(ring)

for i, (share, (tx, tz), rpm) in enumerate(RINGS):
    e = bpy.data.objects.new(f'spin-{i}', None)
    bpy.context.scene.collection.objects.link(e)
    e.location = core
    e.rotation_euler = (math.radians(tx), 0, math.radians(tz))
    e['axis'] = [0, 1, 0]          # glTF local up: the empty's local z here
    e['rpm'] = rpm
    r = ring.copy(); r.data = ring.data           # one mesh, three copies
    bpy.context.scene.collection.objects.link(r)
    r.name = f'ring-{i}'
    r.parent = e
    r.location = (0, 0, 0)
    k = share * W
    r.scale = (k, k, k)
bpy.data.objects.remove(ring, do_unlink=True) if ring.users_collection else None

tris = sum(len(p.vertices) - 2 for o in bpy.context.scene.objects if o.type == 'MESH' for p in o.data.polygons)
lo, hi = bbox(base)
print(f'armillary: base {hi.x - lo.x:.2f} x {hi.y - lo.y:.2f} x {hi.z - lo.z:.2f} u, core at z {core.z:.2f}, ring radii '
      f'{", ".join(f"{share * W:.2f}" for share, _, _ in RINGS)} u, {tris} tris')
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', use_selection=False, export_extras=True)
