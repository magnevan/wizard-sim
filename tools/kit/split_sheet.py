"""Splits a bundled Meshy model (several objects drawn apart on one Codex sheet, made in one call) into one model per object.

  blender --background --python tools/kit/split_sheet.py -- <sheet.glb> <out dir> <rows> <name,name,...>

The sheet is drawn as a grid (`rows` rows; the names in reading order, left to right then top to bottom). Meshy keeps
the picture's layout: the objects stand upright in one plane, the second row below the first. The mesh is welded,
split into loose parts, and every part (a lantern's ring, a flame) joins the object whose centre it is nearest; each
object is written as <out dir>/<name>.glb, its UVs still on the sheet's shared textures. Then fit.py each (see README).
"""
import sys
import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
src, out, rows, names = argv[0], argv[1], int(argv[2]), argv[3].split(',')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
bpy.ops.object.select_all(action='DESELECT')
for o in meshes: o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1: bpy.ops.object.join()
ob = bpy.context.view_layer.objects.active
ob.parent = None
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.remove_doubles(threshold=0.0005)
bpy.ops.mesh.separate(type='LOOSE'); bpy.ops.object.mode_set(mode='OBJECT')
parts = [o for o in bpy.context.scene.objects if o.type == 'MESH']

def centre(o):
    bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return sum(bb, Vector()) / 8

parts.sort(key=lambda o: -len(o.data.polygons))
heads = parts[:len(names)]
if len(parts) < len(names): sys.exit(f'only {len(parts)} parts for {len(names)} names')
cols = len(names) // rows
heads.sort(key=lambda o: -centre(o).z)                                   # rows, top first
grid = []
for r in range(rows):
    row = heads[r * cols:(r + 1) * cols]; row.sort(key=lambda o: centre(o).x); grid += row
groups = {id(h): [h] for h in grid}
for p in parts[len(names):]:
    c = centre(p); groups[id(min(grid, key=lambda h: (centre(h) - c).length))].append(p)
for name, h in zip(names, grid):
    bpy.ops.object.select_all(action='DESELECT')
    for p in groups[id(h)]: p.select_set(True)
    bpy.context.view_layer.objects.active = h
    if len(groups[id(h)]) > 1: bpy.ops.object.join()
    h.name = name
    bpy.ops.export_scene.gltf(filepath=f'{out}/{name}.glb', use_selection=True, export_format='GLB')
    print('wrote', name, len(h.data.polygons), 'faces')
