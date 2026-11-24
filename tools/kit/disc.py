"""A flat round floor piece from a top-down picture: the sunk plaza's radial paving (the user, 2026-11-24: the ground round
the armillary should be radial, like its base and the concept art).

  blender --background --python tools/kit/disc.py -- <picture.png> <out.glb> <piece>

The picture (a circle filling a square, seen straight down) is mapped flat onto a disc as wide as the piece's footprint
in kit.json and as thick as its height, base at 0 so it sits on its floor. Units u (1 u = 0.6 m), glTF y up.
"""
import sys, os, json, math
import bpy, bmesh

argv = sys.argv[sys.argv.index('--') + 1:]
src, dst, piece = argv
M = 1 / 0.6
pc = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'kit.json'), encoding='utf-8'))['pieces'][piece]
R = pc['footprint'][0] / 2
H = max(pc.get('height', 0.05) * M, 0.02)

bpy.ops.wm.read_factory_settings(use_empty=True)
mesh = bpy.data.meshes.new(piece)
ob = bpy.data.objects.new(piece, mesh)
bpy.context.scene.collection.objects.link(ob)
bm = bmesh.new()
bmesh.ops.create_circle(bm, cap_ends=True, cap_tris=False, segments=128, radius=R)
bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, H))
uv = bm.loops.layers.uv.new()
for f in bm.faces:
    for loop in f.loops:
        x, y = loop.vert.co.x, loop.vert.co.y
        loop[uv].uv = (0.5 + x / (2 * R), 0.5 + y / (2 * R))
# a thin skirt down to the floor, so its edge reads as stone, not paper
edge = [e for e in bm.edges if e.is_boundary]
ext = bmesh.ops.extrude_edge_only(bm, edges=edge)
for v in [g for g in ext['geom'] if isinstance(g, bmesh.types.BMVert)]: v.co.z = 0
bm.to_mesh(mesh); bm.free()

mat = bpy.data.materials.new(piece)
mat.use_nodes = True
bsdf = mat.node_tree.nodes['Principled BSDF']
tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
tex.image = bpy.data.images.load(os.path.abspath(src))
mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 0.85
mesh.materials.append(mat)
print(f'disc {piece}: radius {R:.2f} u, {H:.3f} u thick')
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', use_selection=False)
