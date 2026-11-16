"""Render a goblin model through the shared rig: every move, 8 directions, the game's camera. No generation calls.

  blender --background --python tools/goblin-3d/render.py -- <model> <out_dir> [moves] [--preview]

<model> is a .py that builds parts named after bones (raider.py, raider_codex.py) or a .glb/.obj/.fbx mesh
(image-to-3D), which is scaled to the rig's height and bound with automatic weights.
moves: comma list from rig.MOVES (default idle,walk,run,attack). --preview also renders large smooth views of the model.
Writes <out_dir>/<move>/<direction>/fNN.png at 4x, for pixelize.py.
"""
import math, os, sys
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import rig as R

args = sys.argv[sys.argv.index('--') + 1:]
MODEL, OUT = args[0], args[1]
MOVES = [a for a in args[2:] if not a.startswith('--')]
MOVES = MOVES[0].split(',') if MOVES else ['idle', 'walk', 'run', 'attack']
PREVIEW = '--preview' in args
CANVAS, PPU, SUPER = 48, 16, 4
DIRS = {'south': 0, 'south-east': 45, 'east': 90, 'north-east': 135, 'north': 180, 'north-west': -135, 'west': -90, 'south-west': -45}

scene = bpy.context.scene
for o in list(bpy.data.objects): bpy.data.objects.remove(o)

# ---- the model -----------------------------------------------------------------------------------------------------------
before = set(bpy.data.objects)
ext = os.path.splitext(MODEL)[1].lower()
if ext == '.py':
    exec(compile(open(MODEL, encoding='utf-8-sig').read(), MODEL, 'exec'), {'__name__': '__model__', '__file__': MODEL})
elif ext in ('.glb', '.gltf'):
    bpy.ops.import_scene.gltf(filepath=MODEL)
elif ext == '.obj':
    bpy.ops.wm.obj_import(filepath=MODEL)
elif ext == '.fbx':
    bpy.ops.import_scene.fbx(filepath=MODEL)
meshes = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
for o in [o for o in bpy.data.objects if o not in before and o.type != 'MESH']:
    bpy.data.objects.remove(o)   # imported armatures, empties, cameras: we bring our own
rig = R.build_armature()
if ext == '.py':
    missing = R.bind_by_name(rig, meshes)
    if missing: print('UNNAMED PARTS (bound to spine):', missing)
else:
    # stand it on Z = 0, centred, the rig's height; the caller makes sure it faces -Y
    for m in meshes:
        m.parent = None
        bpy.context.view_layer.objects.active = m
        m.select_set(True)
    bpy.context.view_layer.update()
    pts = [m.matrix_world @ v.co for m in meshes for v in m.data.vertices]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    k = 1.98 / (hi.z - lo.z)
    for m in meshes:
        m.matrix_world = __import__('mathutils').Matrix.Diagonal((k, k, k, 1)) @ __import__('mathutils').Matrix.Translation((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z)) @ m.matrix_world
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    R.bind_auto(rig, meshes)

# hand-drawn sprites are squatter than the real thing: wider and a little shorter, from every side
rig.scale = (1.15, 1.15, 0.92)

# ---- camera, light, render settings --------------------------------------------------------------------------------------
cam = bpy.data.cameras.new('cam'); cam.type = 'ORTHO'; cam.ortho_scale = CANVAS / PPU
cam_o = bpy.data.objects.new('cam', cam); scene.collection.objects.link(cam_o); scene.camera = cam_o
ELEV = math.radians(30)
LOOK = Vector((0, 0, 1.05))
def aim(elev, dist=40):
    cam_o.location = LOOK + Vector((0, -math.cos(elev), math.sin(elev))) * dist
    cam_o.rotation_euler = (LOOK - cam_o.location).to_track_quat('-Z', 'Y').to_euler()
aim(ELEV)

sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 4.5; sun.angle = math.radians(10)
sun_o = bpy.data.objects.new('sun', sun); scene.collection.objects.link(sun_o)
sun_o.location = (-7, -9, 12)   # upper left of the screen, toward the viewer
sun_o.rotation_euler = (Vector((0, 0, 1)) - sun_o.location).to_track_quat('-Z', 'Y').to_euler()
world = bpy.data.worlds.new('world'); world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (1, 0.95, 0.88, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.3
scene.world = world

r = scene.render
r.engine = 'CYCLES'; scene.cycles.device = 'CPU'; scene.cycles.samples = 16; scene.cycles.use_denoising = False
r.film_transparent = True
r.resolution_x = r.resolution_y = CANVAS * SUPER
r.filter_size = 0.01
r.image_settings.file_format = 'PNG'; r.image_settings.color_mode = 'RGBA'
scene.view_settings.view_transform = 'Standard'; scene.view_settings.look = 'None'

# Each frame is shot twice: lit, and flat (every surface glowing its own base colour). pixelize.py takes each part's
# colour from the flat shot and its light and shadow from the lit one. A mix shader in every material switches them.
FLAT = []
for m in bpy.data.materials:
    if not m.node_tree: continue
    nt = m.node_tree
    bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    out = next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL' and n.is_active_output), None) or next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'), None)
    if not bsdf or not out: continue
    em = nt.nodes.new('ShaderNodeEmission')
    bc = bsdf.inputs['Base Color']
    if bc.is_linked: nt.links.new(bc.links[0].from_socket, em.inputs['Color'])
    else: em.inputs['Color'].default_value = bc.default_value
    mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(bsdf.outputs[0], mix.inputs[1]); nt.links.new(em.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs['Surface'])
    FLAT.append(mix.inputs[0])


def shoot(path, flat=True):
    r.filepath = path
    bpy.ops.render.render(write_still=True)
    if flat:
        for f in FLAT: f.default_value = 1.0
        n = scene.cycles.samples; scene.cycles.samples = 1
        r.filepath = path[:-4] + '_flat.png'
        bpy.ops.render.render(write_still=True)
        for f in FLAT: f.default_value = 0.0
        scene.cycles.samples = n


if PREVIEW:
    # the model itself, big and smooth: front, three-quarter, side, back, at the game's angle
    r.resolution_x = r.resolution_y = 512; scene.cycles.samples = 48
    R.rest(rig); rig.location.z = 0
    for name, deg in (('south', 0), ('south-east', 45), ('east', 90), ('north', 180)):
        rig.rotation_euler = (0, 0, math.radians(deg))
        bpy.context.view_layer.update()
        shoot(os.path.join(OUT, 'preview', name + '.png'), flat=False)
    r.resolution_x = r.resolution_y = CANVAS * SUPER; scene.cycles.samples = 16

for mv in MOVES:
    n, fn = R.MOVES[mv]
    for d, deg in DIRS.items():
        rig.rotation_euler = (0, 0, math.radians(deg))
        for i in range(n):
            R.rest(rig); rig.location.z = 0
            fn(rig, i, n)
            bpy.context.view_layer.update()
            shoot(os.path.join(OUT, mv, d, f'f{i:02d}.png'))
    print('rendered', mv, n, 'frames x 8')
