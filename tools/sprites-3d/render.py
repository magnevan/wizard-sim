"""Render a character model through the shared rig: every move, 8 directions, the game's camera. No generation calls.

  blender --background --python tools/sprites-3d/render.py -- <model> <out_dir> [moves] [--preview] [--add=<model.py>:<bone>] [--height=<k>]

<model> is a .py that builds parts named after bones (raider.py, raider_codex.py) or a .glb/.obj/.fbx mesh
(image-to-3D), which is scaled to the rig's height and bound with automatic weights.
moves: comma list from rig.MOVES (default idle,walk,run,attack). --preview also renders large smooth views of the model.
--anim: <model> is a rigged .glb/.fbx (Meshy's rig); its own clips are played instead (see README, "Meshy's rig and clips").
Writes <out_dir>/<move>/<direction>/fNN.png at 4x, for pixelize.py.
"""
import math, os, sys
import bpy
from mathutils import Matrix, Quaternion, Vector

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
# --canvas=96: a bigger frame for a bigger body (the chieftain); the pixel density stays 16 per unit
CANVAS, PPU, SUPER = int(next((a[9:] for a in args if a.startswith('--canvas=')), 48)), 16, 4
CARRIERS = []   # (carrier empty, prop name, bone): each --prop hangs from one
SOFT = []   # (carrier empty, k, prop axis) for --prop=...:<name>~k: props that take only k of the hand's tilt
FACES = []   # (carrier empty, face normal): a guard's face, from its props file's PROP_FACE (the client squares it while blocking)
DIRS = {'south': 0, 'south-east': 45, 'east': 90, 'north-east': 135, 'north': 180, 'north-west': -135, 'west': -90, 'south-west': -45}

scene = bpy.context.scene
for o in list(bpy.data.objects): bpy.data.objects.remove(o)

# --anim: the model is a rigged .glb/.fbx with its own clips (a Meshy rig and its library animations). Its armature is
# kept and its clips are played instead of rig.MOVES. moves are clip names (substring match), each optionally =<frames>;
# with none, every clip is rendered at --fps (default 12; the roster uses 24, so a slowed body still gets 12 distinct
# frames a second). Frame numbers in --yaw and --release are given at 12 fps and scaled to the render's rate.
ANIM = '--anim' in args
ANIM_FPS = int(next((a[6:] for a in args if a.startswith('--fps=')), 12))
F12 = ANIM_FPS / 12

# ---- the model -----------------------------------------------------------------------------------------------------------
before = set(bpy.data.objects)
ext = os.path.splitext(MODEL)[1].lower()
if ANIM:
    import numpy as np
    from mathutils import Matrix
    acts_before = set(bpy.data.actions)
    if ext == '.fbx': bpy.ops.import_scene.fbx(filepath=MODEL)
    else: bpy.ops.import_scene.gltf(filepath=MODEL)
    new = [o for o in bpy.data.objects if o not in before]
    arm = next(o for o in new if o.type == 'ARMATURE')
    # only meshes skinned to the armature: Meshy's rigged GLBs also carry a stray 2 m icosphere
    meshes = [o for o in new if o.type == 'MESH' and any(md.type == 'ARMATURE' for md in o.modifiers)]
    drop = [o for o in new if o is not arm and o not in meshes and not o.children]
    new = [o for o in new if o not in drop]
    for o in drop: bpy.data.objects.remove(o)
    CLIPS = [a for a in bpy.data.actions if a not in acts_before]
    print('clips:', [a.name for a in CLIPS])
    print('bones:', [b.name for b in arm.data.bones])
    # every clip off while measuring, so the size and feet come from the rest pose
    if arm.animation_data: arm.animation_data.action = None
    for t in (arm.animation_data.nla_tracks if arm.animation_data else []): t.mute = True
    bpy.context.view_layer.update()
    pts = np.concatenate([np.array([tuple(m.matrix_world @ v.co) for v in m.data.vertices]) for m in meshes])   # the bind pose
    lo, hi = pts.min(0), pts.max(0)
    feet = pts[pts[:, 2] < lo[2] + 0.08 * (hi[2] - lo[2])]
    cx, cy = (feet[:, 0].min() + feet[:, 0].max()) / 2, (feet[:, 1].min() + feet[:, 1].max()) / 2
    k = (1.98 * FIT_H) / (hi[2] - lo[2])
    # a turntable at the origin carries the whole import: render code turns and squashes it like our own rig
    rig = bpy.data.objects.new('turn', None); scene.collection.objects.link(rig)
    top = [o for o in new if o.name in bpy.data.objects and o.parent is None]
    for o in top:
        o.matrix_world = Matrix.Diagonal((k, k, k, 1)) @ Matrix.Translation((-cx, -cy, -lo[2])) @ o.matrix_world
        o.parent = rig
    R.rest = lambda *a, **kw: None   # the clip poses the model; there is no shared skeleton to reset

    # --add=raider_codex.py:blade with a clip rig: the part is made for our skeleton's hand.R, so carry it from that
    # hand's frame to the clip rig's hand (--hand=RightHand) in the bind pose and parent it there. The two rigs roll
    # their hands differently: --blade-rot=x,y,z (degrees, about the hand) turns it into the grip.
    HAND = next((a[7:] for a in args if a.startswith('--hand=')), 'RightHand')
    BROT = [math.radians(float(v)) for v in next((a[12:] for a in args if a.startswith('--blade-rot=')), '0,0,0').split(',')]
    for a in [a for a in args if a.startswith('--add=')]:
        src, bones = a[6:].rsplit(':', 1)
        keep = bones.split(',')
        have = set(bpy.data.objects)
        exec(compile(open(src, encoding='utf-8-sig').read(), src, 'exec'), {'__name__': '__model__', '__file__': src})
        made = [o for o in bpy.data.objects if o not in have]
        kept = [o for o in made if o.type == 'MESH' and R.bone_for(o.name) in keep]
        for o in made:
            if o not in kept: bpy.data.objects.remove(o)
        # a hand frame both rigs agree on, whatever their bone roll: origin at the wrist, X along the forearm,
        # Z as close to the character's forward (-Y) as the forearm allows
        def frame(wrist, elbow):
            x = (wrist - elbow).normalized()
            z = Vector((0, -1, 0)); z = (z - x * z.dot(x)).normalized()
            m = Matrix((x, z.cross(x), z)).transposed().to_4x4(); m.translation = wrist
            return m
        hand = R.JOINTS[keep[0]][2]
        fore = R.JOINTS[hand][2]
        src_hand = frame(Vector(R.JOINTS[hand][0]), Vector(R.JOINTS[fore][0]))
        for pb in arm.pose.bones: pb.matrix_basis = Matrix()
        bpy.context.view_layer.update()
        hb = arm.data.bones[HAND]
        from mathutils import Euler
        dst_hand = frame(arm.matrix_world @ hb.head_local, arm.matrix_world @ hb.parent.head_local) @ Euler(BROT).to_matrix().to_4x4()
        # hung from one carrier at the wrist, like a --prop's, so the game can drop it when its holder dies
        e = bpy.data.objects.new(keep[0] + ' carrier', None); scene.collection.objects.link(e)
        e.parent = arm; e.parent_type = 'BONE'; e.parent_bone = HAND
        bpy.context.view_layer.update(); e.matrix_world = dst_hand
        for o in kept:
            mw = dst_hand @ src_hand.inverted() @ o.matrix_world
            o.parent = e
            bpy.context.view_layer.update()
            o.matrix_world = mw
        CARRIERS.append((e, keep[0], HAND))
        print('grafted onto', HAND, [o.name for o in kept])

    PROP_UPDATES = []
    # --prop=props.py:<name>@<Bone> (repeatable): a held prop built in that bone's frame (see props.py) and parented to it
    for a in [a for a in args if a.startswith('--prop=')]:
        src, spec = a[7:].rsplit(':', 1)
        name, bone = spec.split('@')
        name, _, soft = name.partition('~')   # staff~0.25: follows the hand, but only a quarter of its tilt (see SOFT)
        ns = {'__name__': '__props__', '__file__': src}
        exec(compile(open(src, encoding='utf-8-sig').read(), src, 'exec'), ns)
        for pb in arm.pose.bones: pb.matrix_basis = Matrix()
        bpy.context.view_layer.update()
        hb = arm.data.bones[bone]
        head, elbow = arm.matrix_world @ hb.head_local, arm.matrix_world @ hb.parent.head_local
        xv = (head - elbow).normalized()
        zv = Vector((0, -1, 0)); zv = (zv - xv * zv.dot(xv)).normalized()
        f = Matrix((xv, zv.cross(xv), zv)).transposed().to_4x4(); f.translation = head
        parts = ns['PROPS'][name]()
        bpy.context.view_layer.update()
        for o in parts:
            mw = f @ Matrix.Scale(FIT_H, 4) @ o.matrix_world   # props are sized for a goblin; a taller body (--height) scales them too
            o.parent = arm; o.parent_type = 'BONE'; o.parent_bone = bone
            bpy.context.view_layer.update()
            o.matrix_world = mw
        PROP_UPDATES.extend(ns.get('UPDATES', []))   # props that follow more than their bone (a bow's string)
        # every prop hangs from one empty on its bone, '<name> carrier', at the palm (the prop's GRIP): the game drops
        # it as one piece when its holder dies (export_game.py lists it), and a soft prop turns on it. A long prop (the
        # wizard's staff) shouldn't take every wrist tilt of a walk: each frame (soft_props) its main axis is turned
        # back toward upright by 1 - k, pivoting in the fist
        e = bpy.data.objects.new(name + ' carrier', None); scene.collection.objects.link(e)
        e.parent = arm; e.parent_type = 'BONE'; e.parent_bone = bone
        bpy.context.view_layer.update(); e.matrix_world = f @ Matrix.Translation(Vector(ns.get('GRIP', (0, 0, 0))) * FIT_H)
        bpy.context.view_layer.update()
        for o in parts:
            mw = o.matrix_world.copy(); o.parent = e; o.parent_type = 'OBJECT'
            bpy.context.view_layer.update(); o.matrix_world = mw
        CARRIERS.append((e, name, bone))
        if soft: SOFT.append((e, e.matrix_basis.copy(), float(soft), Vector(ns['PROP_AXIS'][name])))
        if name in ns.get('PROP_FACE', {}): FACES.append((e, Vector(ns['PROP_FACE'][name])))
        print('prop', name, 'on', bone, len(parts), 'parts', f'(soft {soft})' if soft else '')
elif ext == '.py':
    exec(compile(open(MODEL, encoding='utf-8-sig').read(), MODEL, 'exec'), {'__name__': '__model__', '__file__': MODEL})
elif ext in ('.glb', '.gltf'):
    bpy.ops.import_scene.gltf(filepath=MODEL)
elif ext == '.obj':
    bpy.ops.wm.obj_import(filepath=MODEL)
elif ext == '.fbx':
    bpy.ops.import_scene.fbx(filepath=MODEL)
if not ANIM:
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
for a in [a for a in args if a.startswith('--add=') and not ANIM]:   # a clip rig grafts in its own block above
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

# --export=<out.glb>: the game's live 3D model instead of renders (export_game.py), from the model as set up so far
if ANIM and any(a.startswith('--export=') for a in args):
    import export_game
    export_game.run(globals())
    sys.exit(0)

# hand-drawn sprites are squatter than the real thing: wider and a little shorter, from every side
rig.scale = (1.15, 1.15, 0.92)

# ---- camera, light, render settings --------------------------------------------------------------------------------------
cam = bpy.data.cameras.new('cam'); cam.type = 'ORTHO'; cam.ortho_scale = CANVAS / PPU
cam_o = bpy.data.objects.new('cam', cam); scene.collection.objects.link(cam_o); scene.camera = cam_o
# --elev=20: the camera's height in degrees. The ground is drawn at 30; sprites are often drawn lower, closer to face-on
ELEV = math.radians(float(next((a[7:] for a in args if a.startswith('--elev=')), 30)))
LOOK = Vector((0, 0, 1.05 * FIT_H))   # the body's middle: a taller body (--height) is aimed at its own middle
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

# --firm=<clip>[,<clip>]: clips (name substrings) in which soft props are held firmly, following the hand's every turn
# (the wizard's staff in its blow and its casts: kept upright there, it hung from the hand instead of swinging)
FIRM = [c for a in args if a.startswith('--firm=') for c in a[7:].split(',')]
CUR_MOVE = ''


def soft_props():
    """Turn each soft prop's main axis from where the hand holds it back toward upright (leaning a little toward the
    character's forward), keeping k of the hand's tilt (all of it in a --firm clip); the turn pivots on the palm."""
    for e, basis, k, ax in SOFT:
        if any(c in CUR_MOVE for c in FIRM): k = 1.0
        e.matrix_basis = basis
        bpy.context.view_layer.update()
        mw = e.matrix_world.copy(); p = mw.translation.copy()
        fwd = rig.matrix_world.to_3x3() @ Vector((0, -1, 0))
        up = (Vector((0, 0, 1)) + fwd * 0.12).normalized()
        a = (mw.to_3x3() @ ax).normalized()
        q = Quaternion().slerp(a.rotation_difference(up), 1 - k)
        e.matrix_world = Matrix.Translation(p) @ q.to_matrix().to_4x4() @ Matrix.Translation(-p) @ mw
    if SOFT: bpy.context.view_layer.update()


TRACK, TRACK_BONE = {}, next((a[8:] for a in args if a.startswith('--track=')), 'RightHand')


def clip_move(act, n=None):
    """A rig.MOVES-style (frames, pose fn) that plays one imported clip, sampled evenly over its length."""
    ad = arm.animation_data or arm.animation_data_create()
    f0, f1 = act.frame_range
    if n is None: n = max(2, round((f1 - f0) / scene.render.fps * ANIM_FPS))
    def fn(_rig, i, n):
        if ad.action != act:
            ad.action = act
            if getattr(act, 'slots', None) and len(act.slots): ad.action_slot = act.slots[0]
        arm.matrix_basis = yaw_at(id(act), i) @ ARM_BASIS
        scene.frame_set(int(round(f0 + (f1 - f0) * i / n)))   # a loop's last frame is its first: stop one short
        if not KEEP_ROOT:
            # sprites stay put (the game moves them): cancel the hips' travel over the ground, keep their rise and fall
            bpy.context.view_layer.update()
            hips = arm.matrix_world @ arm.pose.bones[ROOT_BONE].head
            rest = rig.matrix_world @ HIPS_REST
            d = Vector((hips.x - rest.x, hips.y - rest.y, 0))
            arm.matrix_world = Matrix.Translation(-d) @ arm.matrix_world
        if abs(_rig.rotation_euler.z) < 1e-6:   # facing south: note where the weapon hand is, for finding the strike
            bpy.context.view_layer.update()
            TRACK.setdefault(id(act), {})[i] = list(arm.matrix_world @ arm.pose.bones[TRACK_BONE].head)
    return n, fn


if ANIM:
    import re
    # --root keeps a clip's travel (a lunge, a fall sliding back); by default the hips stay over the turntable's centre
    KEEP_ROOT = '--root' in args
    ROOT_BONE = next((a[7:] for a in args if a.startswith('--hips=')), 'Hips')
    ARM_BASIS = arm.matrix_basis.copy()
    # --yaw=<clip>:<degrees>[:<a>:<b>:<c>:<d>]: turn the body for one clip, for a clip that attacks off its facing (an
    # archer stands side-on and shoots out of its left side, so its archery clip turns -90 to send the arrow along the
    # facing). With frames, the turn eases in over a..b and back out over c..d (rendered frames), so the body turns
    # side-on as the bow comes up and faces ahead again at rest, matching the idle and walk at either end.
    YAW_ARGS = [a[6:].split(':') for a in args if a.startswith('--yaw=')]
    YAW = {}

    def yaw_at(key, i):
        if key not in YAW: return Matrix()
        deg, ramp = YAW[key]
        k = 1.0
        if ramp:
            a, b, c, d = ramp
            ease = lambda t: t * t * (3 - 2 * t)
            k = 0 if i <= a or i >= d else ease((i - a) / (b - a)) if i < b else ease((d - i) / (d - c)) if i > c else 1
        return Matrix.Rotation(math.radians(deg * k), 4, 'Z')
    bpy.context.view_layer.update()
    HIPS_REST = rig.matrix_world.inverted() @ (arm.matrix_world @ arm.data.bones[ROOT_BONE].head_local)
    # glTF clips are named 'Armature|walking_man|baselayer': the middle part names the move and the output folder
    slug = lambda s: re.sub(r'[^a-z0-9]+', '_', (s.split('|')[1] if s.count('|') >= 2 else s).lower()).strip('_')
    if not [a for a in args[2:] if not a.startswith('--')]: MOVES = [a.name for a in CLIPS]
    picked, CLIP_OF = {}, {}
    for mv in MOVES:
        name, _, frames = mv.partition('=')
        act = next((a for a in CLIPS if a.name == name), None) or next(a for a in CLIPS if slug(name) in slug(a.name))
        picked[slug(name)] = clip_move(act, int(frames) if frames else None)
        CLIP_OF[slug(name)] = act
        for k, deg, *ramp in YAW_ARGS:
            if k in slug(name): YAW[id(act)] = (float(deg), [round(int(v) * F12) for v in ramp] if len(ramp) == 4 else None)
    R.MOVES = picked
    MOVES = list(picked)

if any(a.startswith('--inspect=') for a in args):
    # --inspect=<n>: n smooth stills per move from the south and the east (Workbench, textured, 384 px) into
    # <out>/inspect/<move>-<dir>-fNN.png, for checking how props sit in the hand (montage.py lays them out)
    N_IN = int(next(a[10:] for a in args if a.startswith('--inspect=')))
    r.engine = 'BLENDER_WORKBENCH'; scene.display.shading.color_type = 'TEXTURE'; scene.display.shading.light = 'STUDIO'
    r.resolution_x = r.resolution_y = 512; cam.ortho_scale = 2.9 * FIT_H
    for mv in MOVES:
        n, fn = R.MOVES[mv]; CUR_MOVE = mv
        for d in ('south', 'east'):
            rig.rotation_euler = (0, 0, math.radians(DIRS[d]))
            for j in range(N_IN):
                i = round(j * (n - 1) / max(1, N_IN - 1))
                R.rest(rig); fn(rig, i, n)
                for u in globals().get('PROP_UPDATES', []): u(arm, i, mv)
                bpy.context.view_layer.update(); soft_props()
                r.filepath = os.path.join(OUT, 'inspect', f'{mv}-{d}-f{j:02d}.png'); bpy.ops.render.render(write_still=True)
        print('inspected', mv, n, 'frames')
    sys.exit(0)

# --frames=0[,6]: render only these frames of each move (a quick look at props, not a sheet; skips track.json)
ONLY_FRAMES = [int(k) for a in args if a.startswith('--frames=') for k in a[9:].split(',')]
for mv in MOVES:
    n, fn = R.MOVES[mv]; CUR_MOVE = mv
    for d, deg in DIRS.items():
        rig.rotation_euler = (0, 0, math.radians(deg))
        for i in range(n):
            if ONLY_FRAMES and i not in ONLY_FRAMES: continue
            R.rest(rig)
            fn(rig, i, n)
            for u in globals().get('PROP_UPDATES', []): u(arm, i, mv)
            bpy.context.view_layer.update()
            soft_props()
            shoot(os.path.join(OUT, mv, d, f'f{i:02d}.png'))
    if ANIM:
        import json
        tr = TRACK.get(id(CLIP_OF[mv]), {})
        json.dump({'frames': n, 'fps': ANIM_FPS, 'hand': [tr.get(k) for k in range(n)]}, open(os.path.join(OUT, mv, 'track.json'), 'w'))
    print('rendered', mv, n, 'frames x 8')
