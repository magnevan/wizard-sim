"""The goblin skeleton every model shares, and its moves (walk, run, attack) as code. Imported by render.py inside Blender.

Axes: +Z up, feet on Z = 0, the goblin faces -Y, its right hand on -X. 1 Blender unit = 1 game unit, about 2 units tall.
A model is bound by name: each mesh object moves with the bone its name starts with (`forearm.R_wrap` -> `forearm.R`),
or, for one-piece meshes (image-to-3D), by Blender's automatic weights.
"""
import math
import bpy
from mathutils import Quaternion, Vector

# bone: (head, tail, parent)
JOINTS = {
    'root': ((0, 0, 0), (0, 0.3, 0), None),
    'hips': ((0, 0, 0.74), (0, 0, 0.95), 'root'),
    'spine': ((0, 0, 0.95), (0, 0, 1.28), 'hips'),
    'head': ((0, 0, 1.28), (0, 0, 1.98), 'spine'),
    'upper_arm.L': ((0.27, 0, 1.20), (0.40, 0, 0.96), 'spine'),
    'forearm.L': ((0.40, 0, 0.96), (0.47, -0.04, 0.72), 'upper_arm.L'),
    'hand.L': ((0.47, -0.04, 0.72), (0.50, -0.06, 0.62), 'forearm.L'),
    'thigh.L': ((0.13, 0, 0.76), (0.15, 0, 0.42), 'hips'),
    'shin.L': ((0.15, 0, 0.42), (0.15, 0.02, 0.09), 'thigh.L'),
    'foot.L': ((0.15, 0.02, 0.09), (0.15, -0.20, 0.03), 'shin.L'),
    'blade': ((-0.50, -0.08, 0.66), (-0.56, -0.42, 0.38), 'hand.R'),
    'sack': ((0, 0.24, 1.10), (0, 0.30, 1.42), 'spine'),
}
for b in [k for k in JOINTS if k.endswith('.L')]:
    h, t, p = JOINTS[b]
    JOINTS[b[:-2] + '.R'] = ((-h[0], h[1], h[2]), (-t[0], t[1], t[2]), p[:-2] + '.R' if p.endswith('.L') else p)
BONES = sorted(JOINTS, key=lambda n: len(n))


def build_armature(name='rig'):
    arm = bpy.data.armatures.new(name)
    o = bpy.data.objects.new(name, arm)
    bpy.context.scene.collection.objects.link(o)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode='EDIT')
    done = {}
    def make(n):
        if n in done: return done[n]
        h, t, p = JOINTS[n]
        eb = arm.edit_bones.new(n)
        eb.head, eb.tail = Vector(h), Vector(t)
        if p: eb.parent = make(p)
        done[n] = eb
        return eb
    for n in JOINTS: make(n)
    bpy.ops.object.mode_set(mode='OBJECT')
    for pb in o.pose.bones: pb.rotation_mode = 'QUATERNION'
    return o


def bone_for(name):
    for b in sorted(JOINTS, key=len, reverse=True):
        if name == b or name.startswith(b + '.') or name.startswith(b + '_'):
            return b
    return None


def bind_by_name(rig, meshes):
    """Every vertex of a part follows its bone fully: rigid parts, as a 32 px sprite wants."""
    missing = []
    for m in meshes:
        b = bone_for(m.name)
        if b is None:
            missing.append(m.name); b = 'spine'
        vg = m.vertex_groups.new(name=b)
        vg.add(range(len(m.data.vertices)), 1.0, 'REPLACE')
        mod = m.modifiers.new('rig', 'ARMATURE'); mod.object = rig
        m.parent = rig
    return missing


def bind_auto(rig, meshes):
    """One-piece meshes (image-to-3D): each vertex follows its nearest bones, the two closest blended with a steep falloff.
    Blender's automatic (heat) weights fail silently on meshes made of loose pieces, which these often are."""
    segs = [(n, Vector(h), Vector(t)) for n, (h, t, _) in JOINTS.items() if n != 'root']
    def dist(p, a, b):
        ab = b - a
        u = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
        return (p - (a + ab * u)).length
    for m in meshes:
        groups = {n: m.vertex_groups.new(name=n) for n, _, _ in segs}
        for v in m.data.vertices:
            p = m.matrix_world @ v.co
            ds = sorted((dist(p, a, b), n) for n, a, b in segs)[:2]
            ws = [1 / (d * d + 1e-4) ** 2 for d, _ in ds]
            for (d, n), w in zip(ds, ws):
                groups[n].add([v.index], w / sum(ws), 'REPLACE')
        mod = m.modifiers.new('rig', 'ARMATURE'); mod.object = rig
        m.parent = rig


# ---- moves -------------------------------------------------------------------------------------------------------------
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
FWD = -X   # turning about this by a positive angle swings a hanging limb forward (toward -Y), tips the body forward


def rest(rig):
    for pb in rig.pose.bones:
        pb.rotation_quaternion = Quaternion()
        pb.location = Vector()


def turn(rig, bone, axis, deg):
    """Rotate a bone about an axis given in the goblin's rest frame (after its parent's motion), degrees.
    Facing -Y: turn(..., FWD, +a) swings a hanging limb forward; turn(..., Y, +a) on an .L limb lifts it outward."""
    pb = rig.pose.bones[bone]
    m = pb.bone.matrix_local.to_quaternion()
    q = m.inverted() @ Quaternion(axis, math.radians(deg)) @ m
    pb.rotation_quaternion = q @ pb.rotation_quaternion


def lift(rig, z):
    """Raise or lower the whole goblin (the bob of a stride, the dip of a slash)."""
    rig.location.z = z


def walk(rig, p, run=False):
    """p in [0, 1): one full stride (two steps). Contact at p = 0 and 0.5."""
    s = math.sin(2 * math.pi * p)
    c = math.cos(2 * math.pi * p)
    A = 38 if run else 24            # leg swing
    lean = 16 if run else 3
    turn(rig, 'hips', Z, 8 * s)
    turn(rig, 'spine', FWD, lean); turn(rig, 'spine', Z, -12 * s)
    turn(rig, 'head', FWD, -lean * 0.7)
    for side, sg in (('L', 1), ('R', -1)):
        sw = s * sg                   # +1: this leg forward
        turn(rig, 'thigh.' + side, FWD, A * sw)
        # the knee folds while the leg swings through (moving forward), straight on contact
        through = max(0.0, c * sg)    # leg moving forward
        turn(rig, 'shin.' + side, FWD, -(55 if run else 30) * through - (8 if sw > 0.3 else 0))
        turn(rig, 'foot.' + side, FWD, 12 * through if run else 6 * through)
        # arms counter-swing; the blade arm swings less and holds the blade up a little
        arm = -sw * (40 if run else 22)
        if side == 'R': arm *= 0.6
        turn(rig, 'upper_arm.' + side, FWD, arm)
        turn(rig, 'forearm.' + side, FWD, (70 if run else 18) - (10 if side == 'R' and not run else 0))
    bob = (0.06 if run else 0.03) * abs(c)
    lift(rig, bob - (0.05 if run else 0.0))


def ease(t): return t * t * (3 - 2 * t)


def attack(rig, t):
    """t in [0, 1]: wind up overhead (0-0.4), hold (0.4-0.5), slash down in front (0.5-0.62), recover (0.62-1)."""
    keys = [  # t, arm raise (deg forward-up), elbow, spine pitch (+ forward), step, blade twist
        (0.00, 15, 20, 2, 0.0),
        (0.30, 160, 70, -12, 0.0),
        (0.45, 175, 85, -16, 0.0),
        (0.56, 70, 10, 20, 1.0),
        (0.64, 35, 5, 24, 1.0),
        (0.80, 30, 15, 12, 0.6),
        (1.00, 15, 20, 2, 0.0),
    ]
    for a, b in zip(keys, keys[1:]):
        if a[0] <= t <= b[0]:
            u = ease((t - a[0]) / (b[0] - a[0]))
            k = [x + (y - x) * u for x, y in zip(a, b)]
            break
    _, raise_, elbow, pitch, step = k
    turn(rig, 'spine', FWD, pitch); turn(rig, 'spine', Z, -10 * (pitch / 24))
    turn(rig, 'head', FWD, -pitch * 0.5)
    turn(rig, 'upper_arm.R', Y, -18)               # bring the blade arm in toward the middle
    turn(rig, 'upper_arm.R', FWD, raise_)
    turn(rig, 'forearm.R', FWD, elbow)
    turn(rig, 'upper_arm.L', FWD, -20 * step + 10); turn(rig, 'upper_arm.L', Y, 25 * step)
    turn(rig, 'forearm.L', FWD, 30)
    # the left foot steps in on the slash
    turn(rig, 'thigh.L', FWD, 30 * step); turn(rig, 'shin.L', FWD, -20 * step)
    turn(rig, 'thigh.R', FWD, -14 * step)
    lift(rig, -0.05 * step)


MOVES = {
    'idle': (4, lambda r, i, n: (turn(r, 'spine', FWD, 2 + 2 * math.sin(2 * math.pi * i / n)), turn(r, 'forearm.R', FWD, 20), turn(r, 'forearm.L', FWD, 12))),
    'walk': (8, lambda r, i, n: walk(r, i / n)),
    'run': (8, lambda r, i, n: walk(r, i / n, run=True)),
    'attack': (10, lambda r, i, n: attack(r, i / (n - 1))),
}
