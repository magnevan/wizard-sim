"""Render a goblin model through the shared rig: every move, 8 directions, the game's camera. No generation calls.

  blender --background --python tools/goblin-3d/render.py -- <model> <out_dir> [moves] [--preview] [--add=<model.py>:<bone>] [--height=<k>]

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
# --height=0.95: an imported mesh is scaled to this share of the skeleton's height (its ears or hood tip may stand above it)
FIT_H = float(next((a[9:] for a in args if a.startswith('--height=')), 1.0))
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
# a model whose proportions or rest pose differ from the skeleton's (image-to-3D) brings <model>.joints.json:
# {"joints": {"hand.L": [[x,y,z], [x,y,z]], ...}, "rest": [["upper_arm.L", "Y", -40], ...]}; .R bones mirror .L ones not given
JFILE = os.path.splitext(MODEL)[0] + '.joints.json'
if os.path.exists(JFILE):
    import json
    R.fit(json.load(open(JFILE)))
    print('fitted joints from', JFILE)
rig = R.build_armature()
if ext == '.py':
    missing = R.bind_by_name(rig, meshes)
    if missing: print('UNNAMED PARTS (bound to spine):', missing)
else:
    import numpy as np
    from mathutils import Matrix
    for m in meshes:
        # image-to-3D meshes are far denser than a 30 px sprite needs (Meshy: 440k vertices); thin them first
        if len(m.data.vertices) > 30000:
            d = m.modifiers.new('thin', 'DECIMATE'); d.ratio = 20000 / len(m.data.vertices)
            bpy.context.view_layer.objects.active = m
            bpy.ops.object.modifier_apply(modifier=d.name)
        mw = m.matrix_world.copy(); m.parent = None; m.matrix_world = mw
    bpy.context.view_layer.update()
    pts = np.concatenate([np.array([tuple(m.matrix_world @ v.co) for v in m.data.vertices]) for m in meshes])
    lo, hi = pts.min(0), pts.max(0)
    # stand it on Z = 0 at the rig's height, centred on its feet (the bounding box would put a big sack or ears in the middle)
    feet = pts[pts[:, 2] < lo[2] + 0.08 * (hi[2] - lo[2])]
    cx, cy = (feet[:, 0].min() + feet[:, 0].max()) / 2, (feet[:, 1].min() + feet[:, 1].max()) / 2
    k = (1.98 * FIT_H) / (hi[2] - lo[2])
    for m in meshes:
        m.matrix_world = Matrix.Diagonal((k, k, k, 1)) @ Matrix.Translation((-cx, -cy, -lo[2])) @ m.matrix_world
        bpy.context.view_layer.objects.active = m
        bpy.ops.object.select_all(action='DESELECT'); m.select_set(True)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    R.bind_auto(rig, meshes)

# --add=<model.py>:<bone>[,<bone>]: graft parts from another model (a blade the image-to-3D tool dropped)
for a in [a for a in args if a.startswith('--add=')]:
    src, bones = a[6:].rsplit(':', 1)
    keep = bones.split(',')
    have = set(bpy.data.objects)
    exec(compile(open(src, encoding='utf-8-sig').read(), src, 'exec'), {'__name__': '__model__', '__file__': src})
    kept = []
    for o in [o for o in bpy.data.objects if o not in have]:
        if o.type == 'MESH' and R.bone_for(o.name) in keep: kept.append(o)
        else: bpy.data.objects.remove(o)
    for o in kept:   # it was made for the default skeleton: carry it to where this model's bone is
        b = R.bone_for(o.name)
        o.location += Vector(R.JOINTS[b][0]) - Vector(R.DEFAULT[b][0])
        bpy.context.view_layer.update()
        bpy.context.view_layer.objects.active = o; bpy.ops.object.select_all(action='DESELECT'); o.select_set(True)
        bpy.ops.object.transform_apply(location=True)
    R.bind_by_name(rig, kept)

if '--joints-view' in args:
    # straight-on front and side views with the skeleton's scale untouched, for reading joint positions off a grid
    cam = bpy.data.cameras.new('jc'); cam.type = 'ORTHO'; cam.ortho_scale = 3.0
    co = bpy.data.objects.new('jc', cam); scene.collection.objects.link(co); scene.camera = co
    sun = bpy.data.lights.new('js', 'SUN'); sun.energy = 3; so = bpy.data.objects.new('js', sun); scene.collection.objects.link(so)
    so.rotation_euler = (0.6, 0, -0.5)
    r = scene.render; r.engine = 'CYCLES'; scene.cycles.samples = 16; r.resolution_x = r.resolution_y = 512; r.film_transparent = True
    for name, loc in (('front', (0, -20, 1.05)), ('side', (20, 0, 1.05))):
        for pose in ('raw', 'rest'):
            R.rest(rig, model_rest=(pose == 'rest'))
            co.location = loc; co.rotation_euler = (Vector((0, 0, 1.05)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
            bpy.context.view_layer.update()
            r.filepath = os.path.join(OUT, f'joints-{name}-{pose}.png'); bpy.ops.render.render(write_still=True)
    sys.exit(0)

# hand-drawn sprites are squatter than the real thing: wider and a little shorter, from every side
rig.scale = (1.15, 1.15, 0.92)

# ---- camera, light, render settings --------------------------------------------------------------------------------------
cam = bpy.data.cameras.new('cam'); cam.type = 'ORTHO'; cam.ortho_scale = CANVAS / PPU
cam_o = bpy.data.objects.new('cam', cam); scene.collection.objects.link(cam_o); scene.camera = cam_o
# --elev=20: the camera's height in degrees. The ground is drawn at 30; sprites are often drawn lower, closer to face-on
ELEV = math.radians(float(next((a[7:] for a in args if a.startswith('--elev=')), 30)))
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
    R.rest(rig)
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
            R.rest(rig)
            fn(rig, i, n)
            bpy.context.view_layer.update()
            shoot(os.path.join(OUT, mv, d, f'f{i:02d}.png'))
    print('rendered', mv, n, 'frames x 8')
