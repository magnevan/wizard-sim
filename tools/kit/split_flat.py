"""Split a sheet Meshy laid flat on the ground: name parts by nearest anchor (x,y), rotate some 90 deg about z.
blender --background --python split_flat.py -- <sheet.glb> <out dir> name:x:y[:rot] ..."""
import sys, os, math, bpy
from mathutils import Vector, Matrix
argv = sys.argv[sys.argv.index('--') + 1:]
src, out, specs = argv[0], argv[1], [a.split(':') for a in argv[2:]]
os.makedirs(out, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
bpy.ops.object.select_all(action='DESELECT')
for o in meshes: o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1: bpy.ops.object.join()
ob = bpy.context.view_layer.objects.active; ob.parent = None
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.remove_doubles(threshold=0.0005)
bpy.ops.mesh.separate(type='LOOSE'); bpy.ops.object.mode_set(mode='OBJECT')
parts = [o for o in bpy.context.scene.objects if o.type == 'MESH']
def centre(o):
    bb = [o.matrix_world @ Vector(c) for c in o.bound_box]; return sum(bb, Vector()) / 8
groups = {s[0]: [] for s in specs}
for p in parts:
    c = centre(p)
    s = min(specs, key=lambda s: (c.x - float(s[1])) ** 2 + (c.y - float(s[2])) ** 2)
    groups[s[0]].append(p)
for s in specs:
    g = groups[s[0]]
    bpy.ops.object.select_all(action='DESELECT')
    for p in g: p.select_set(True)
    bpy.context.view_layer.objects.active = g[0]
    if len(g) > 1: bpy.ops.object.join()
    h = bpy.context.view_layer.objects.active; h.name = s[0]
    if len(s) > 3 and s[3] == 'rot':
        c = centre(h)
        h.data.transform(Matrix.Translation(c) @ Matrix.Rotation(math.pi / 2, 4, 'Z') @ Matrix.Translation(-c)); h.data.update()
    bpy.ops.export_scene.gltf(filepath=f'{out}/{s[0]}.glb', use_selection=True, export_format='GLB')
    print('wrote', s[0], len(g), 'loose parts', len(h.data.polygons), 'faces')
