"""The infirmary tent without its cots, so the canopy can stand back from the beds (the user, 2026-11-27: "move the
tents back a little so we see the beds more").

  blender --background --python tools/kit/tent_shell.py -- <infirmary-tent.glb> <tent-shell.glb>

Meshy made the tent with four cots under it: three came loose (welded and split into loose parts, they are the
three small parts low down), the fourth is fused into the body at the right-hand end. The loose cots are deleted and
the fourth is cut out of the body by a box round it (CUT, in the source's own units: x along, y back, z up; by
face centre, since its blanket is welded to the body), which stops short of the posts, the curtains and the back. The cots themselves are placed as their own piece (dress.cot, from
tent-parts/cot-1.glb). Then fit.py the shell as setpiece.infirmary-tent-shell, which has the tent's box, so it
scales exactly as the tent did.
"""
import sys
import bpy, bmesh

argv = sys.argv[sys.argv.index('--') + 1:]
src, dst = argv[0], argv[1]
CUT = ((0.56, 0.785), (-0.19, 0.22), (-0.315, 0.0))   # round the fused cot (its legs at x 0.60 to 0.76); the right posts stand at x 0.80+
LOOSE_COT_MAX_Z = -0.11                                       # a loose part wholly below this is a cot

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
ms = [o for o in bpy.context.scene.objects if o.type == 'MESH']
bpy.ops.object.select_all(action='DESELECT')
for o in ms: o.select_set(True)
bpy.context.view_layer.objects.active = ms[0]
if len(ms) > 1: bpy.ops.object.join()
ob = bpy.context.view_layer.objects.active; ob.parent = None
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.remove_doubles(threshold=0.0005)
bpy.ops.mesh.separate(type='LOOSE'); bpy.ops.object.mode_set(mode='OBJECT')

parts = [o for o in bpy.context.scene.objects if o.type == 'MESH']
for o in parts:
    if max((o.matrix_world @ v.co).z for v in o.data.vertices) < LOOSE_COT_MAX_Z:
        bpy.data.objects.remove(o, do_unlink=True)
body = max((o for o in bpy.context.scene.objects if o.type == 'MESH'), key=lambda o: len(o.data.polygons))
for o in [o for o in bpy.context.scene.objects if o.type == 'MESH' and o is not body]:
    bpy.data.objects.remove(o, do_unlink=True)

bm = bmesh.new(); bm.from_mesh(body.data)
inside = lambda c: all(lo <= c[i] <= hi for i, (lo, hi) in enumerate(CUT))
gone = [f for f in bm.faces if inside(f.calc_center_median())]   # by face centre: the blanket is welded to the body
bmesh.ops.delete(bm, geom=gone, context='FACES')
bm.to_mesh(body.data); bm.free()
print('cut', len(gone), 'faces')
# what the box cut loose (the blanket's edge, the pillow's top stood a little higher): any island left wholly inside a
# looser box round the cot goes too; the posts and curtains reach far above it, so they stay
NEAR = ((0.55, 0.95), (-0.25, 0.28), (-0.32, 0.0))
bpy.ops.object.select_all(action='DESELECT'); body.select_set(True); bpy.context.view_layer.objects.active = body
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.separate(type='LOOSE'); bpy.ops.object.mode_set(mode='OBJECT')
for o in [o for o in bpy.context.scene.objects if o.type == 'MESH']:
    if all(all(lo <= (o.matrix_world @ v.co)[i] <= hi for i, (lo, hi) in enumerate(NEAR)) for v in o.data.vertices):
        bpy.data.objects.remove(o, do_unlink=True)
rest = [o for o in bpy.context.scene.objects if o.type == 'MESH']
bpy.ops.object.select_all(action='DESELECT')
for o in rest: o.select_set(True)
bpy.context.view_layer.objects.active = rest[0]
if len(rest) > 1: bpy.ops.object.join()
body = bpy.context.view_layer.objects.active

bpy.ops.object.select_all(action='DESELECT'); body.select_set(True)
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', use_selection=True)
print('wrote', dst)
