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
DEFAULT = dict(JOINTS)
REST_POSE = []   # (bone, axis letter, degrees): turns that bring a model's own rest pose to the skeleton's A-pose


def fit(spec):
    """Move joints to a model's own proportions, and set its rest correction (see render.py, <model>.joints.json)."""
    for n, (h, t) in spec.get('joints', {}).items():
        JOINTS[n] = (tuple(h), tuple(t), JOINTS[n][2])
        if n.endswith('.L') and n[:-2] + '.R' not in spec.get('joints', {}):
            JOINTS[n[:-2] + '.R'] = ((-h[0], h[1], h[2]), (-t[0], t[1], t[2]), JOINTS[n[:-2] + '.R'][2])
    # a bone not given rides along with its parent (the blade with the hand that holds it)
    given = set(JOINTS[n] for n in JOINTS if n in spec.get('joints', {}) or (n.endswith('.R') and n[:-2] + '.L' in spec.get('joints', {})))
    def carry(n):
        h, t, p = JOINTS[n]
        if p is None or JOINTS[n] in given or DEFAULT[n] != JOINTS[n]: return
        carry(p)
        d = [a - b for a, b in zip(JOINTS[p][1], DEFAULT[p][1])]
        if any(abs(v) > 1e-9 for v in d):
            JOINTS[n] = (tuple(a + v for a, v in zip(h, d)), tuple(a + v for a, v in zip(t, d)), p)
    for n in list(JOINTS): carry(n)
    REST_POSE[:] = []
    for b, ax, deg in spec.get('rest', []):
        REST_POSE.append((b, ax, deg))
        if b.endswith('.L') and not any(r[0] == b[:-2] + '.R' for r in spec.get('rest', [])):
            REST_POSE.append((b[:-2] + '.R', ax, -deg if ax in ('Y', 'Z') else deg))


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
    import numpy as np
    names = [n for n in JOINTS if n not in ('root', 'blade')]   # a held blade, if any, is grafted on as its own part
    A = np.array([JOINTS[n][0] for n in names], float); B = np.array([JOINTS[n][1] for n in names], float)
    AB = B - A
    thick = {'head': 0.30, 'spine': 0.24, 'hips': 0.24, 'sack': 0.18}
    RAD = np.array([thick.get(n, 0.07) for n in names])
    for m in meshes:
        P = np.empty(len(m.data.vertices) * 3); m.data.vertices.foreach_get('co', P); P = P.reshape(-1, 3)
        P = P @ np.array(m.matrix_world.to_3x3()).T + np.array(m.matrix_world.translation)
        u = np.clip(((P[:, None] - A[None]) * AB[None]).sum(-1) / (AB * AB).sum(-1)[None], 0, 1)
        # distance from each bone's surface, not its centre line, so the big head keeps its ears and the hood
        d = np.linalg.norm(P[:, None] - (A[None] + u[..., None] * AB[None]), axis=-1) - RAD[None]
        d = np.maximum(d, 0.005)
        best = np.argsort(d, 1)[:, :2]
        dd = np.take_along_axis(d, best, 1)
        w = 1 / (dd * dd + 1e-4) ** 2; w /= w.sum(1, keepdims=True)
        groups = [m.vertex_groups.new(name=n) for n in names]
        for j in range(len(names)):
            for col in (0, 1):
                idx = np.nonzero(best[:, col] == j)[0]
                for i, wt in zip(idx.tolist(), w[idx, col].tolist()):
                    groups[j].add([i], wt, 'REPLACE')
        mod = m.modifiers.new('rig', 'ARMATURE'); mod.object = rig
        m.parent = rig


# ---- moves -------------------------------------------------------------------------------------------------------------
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
FWD = -X   # turning about this by a positive angle swings a hanging limb forward (toward -Y), tips the body forward


def rest(rig, model_rest=True):
    for pb in rig.pose.bones:
        pb.rotation_quaternion = Quaternion()
        pb.location = Vector()
    if model_rest:
        for b, ax, deg in REST_POSE:
            turn(rig, b, {'X': X, 'Y': Y, 'Z': Z, 'FWD': FWD}[ax], deg)


def turn(rig, bone, axis, deg):
    """Rotate a bone about an axis given in the goblin's rest frame (after its parent's motion), degrees.
    Facing -Y: turn(..., FWD, +a) swings a hanging limb forward; turn(..., Y, +a) brings an .L arm in toward the body (-a on .R)."""
    pb = rig.pose.bones[bone]
    m = pb.bone.matrix_local.to_quaternion()
    q = m.inverted() @ Quaternion(axis, math.radians(deg)) @ m
    pb.rotation_quaternion = q @ pb.rotation_quaternion


def shift(rig, x=0.0, y=0.0, z=0.0):
    """Move the whole goblin in its own frame: x to its left, y backward (-y is a step forward), z up. Body sway, bob, lunge."""
    pb = rig.pose.bones['root']
    pb.location = pb.bone.matrix_local.to_3x3().inverted() @ Vector((x, y, z))


def walk(rig, p, run=False):
    """p in [0, 1): one full stride, two steps. The left foot strikes at p = 0.25, the right at 0.75.
    Weight moves over the standing foot, the hips turn with the forward leg and the shoulders against them; the walk
    rises over the standing leg, the run leaves the ground between steps."""
    s, c = math.sin(2 * math.pi * p), math.cos(2 * math.pi * p)
    lean = 20 if run else 6
    turn(rig, 'hips', FWD, 8 if run else 2)
    turn(rig, 'hips', Z, -(13 if run else 8) * s)
    turn(rig, 'hips', Y, (6 if run else 4) * -c)            # the pelvis drops on the swinging side
    turn(rig, 'spine', FWD, lean - (8 if run else 2))
    turn(rig, 'spine', Z, (28 if run else 15) * s)          # shoulders against the hips
    turn(rig, 'spine', Y, (5 if run else 3) * c)            # the body leans back over the standing foot
    turn(rig, 'head', FWD, -lean * 0.6); turn(rig, 'head', Z, -(14 if run else 7) * s); turn(rig, 'head', Y, -(4 if run else 2) * c)
    for side, sg in (('L', 1), ('R', -1)):
        sw = s * sg                                         # +1: this leg is forward
        swing = max(0.0, c * sg)                            # this leg is passing forward through the air
        if run:
            turn(rig, 'thigh.' + side, FWD, 10 + (42 * sw if sw > 0 else 30 * sw))   # high knee, long push behind
            turn(rig, 'shin.' + side, FWD, -95 * swing ** 0.7 - 15)                 # the heel kicks up behind
            turn(rig, 'foot.' + side, FWD, 20 * swing - 10 * max(0.0, -sw))
        else:
            turn(rig, 'thigh.' + side, FWD, 2 + 26 * sw)
            turn(rig, 'shin.' + side, FWD, -38 * swing - 4)
            turn(rig, 'foot.' + side, FWD, 10 * swing)
        arm = -sw * (48 if run else 26)
        if side == 'R': arm *= 0.75                         # the blade arm swings a little less
        turn(rig, 'upper_arm.' + side, FWD, arm + (12 if run else 0))
        turn(rig, 'upper_arm.' + side, Y, (12 if run else 6) * sg)   # arms in toward the body
        turn(rig, 'forearm.' + side, FWD, (85 if run else 22) + (10 * sw if run else 0))
    if run:
        shift(rig, x=0.07 * -c, z=0.09 * abs(s) - 0.05)    # off the ground mid-stride, sunk on landing
    else:
        shift(rig, x=0.045 * -c, z=0.035 * abs(c) - 0.015)  # over the standing foot, highest as it passes


def ease(t): return t * t * (3 - 2 * t)


# The attack as poses on frames: anticipation (crouch, coil the body back, blade cocked over the right shoulder), a fast
# strike (step in with the left foot, hips then shoulders uncoil, a diagonal slash across the body, leaning into it), the
# impact held, then recovery. Angles in degrees; root offsets in units (-y is forward).
ATTACK_KEYS = {
    0:  dict(),
    3:  dict(spineP=-10, spineT=-30, hipsT=-12, rootY=0.05, rootZ=-0.06, armR_F=140, armR_Y=-42, foreR=60, armL_F=28, armL_Y=22, foreL=40,
             thighL=18, shinL=-30, thighR=-6, shinR=-26, headT=18),
    5:  dict(spineP=-14, spineT=-36, hipsT=-15, rootY=0.07, rootZ=-0.07, armR_F=152, armR_Y=-50, foreR=70, armL_F=32, armL_Y=24, foreL=40,
             thighL=20, shinL=-34, thighR=-8, shinR=-28, headT=22),
    6:  dict(spineP=12, spineT=4, hipsT=4, rootY=-0.10, rootZ=-0.05, armR_F=105, armR_Y=-30, foreR=30, armL_F=5, armL_Y=18, foreL=35,
             thighL=36, shinL=-22, thighR=-18, shinR=-10, headT=0),
    7:  dict(spineP=30, spineT=30, hipsT=14, rootY=-0.20, rootZ=-0.11, armR_F=30, armR_Y=-42, foreR=4, armL_F=-38, armL_Y=26, foreL=45,
             thighL=44, shinL=-28, thighR=-30, shinR=-6, headT=-12),
    9:  dict(spineP=32, spineT=33, hipsT=15, rootY=-0.21, rootZ=-0.12, armR_F=24, armR_Y=-46, foreR=6, armL_F=-40, armL_Y=28, foreL=45,
             thighL=44, shinL=-28, thighR=-30, shinR=-6, headT=-14),
    13: dict(),
}
IDLE_KEY = dict(spineP=4, spineT=0, hipsT=0, rootY=0, rootZ=0, armR_F=12, armR_Y=0, foreR=20, armL_F=0, armL_Y=0, foreL=15,
                thighL=0, shinL=0, thighR=0, shinR=0, headT=0)


def attack(rig, f):
    ks = sorted(ATTACK_KEYS)
    a = max(k for k in ks if k <= f); b = min((k for k in ks if k >= f), default=a)
    A = {**IDLE_KEY, **ATTACK_KEYS[a]}; B = {**IDLE_KEY, **ATTACK_KEYS[b]}
    u = 0 if a == b else (f - a) / (b - a)
    u = u if (a, b) == (5, 6) or (a, b) == (6, 7) else ease(u)   # the strike itself is fast and even
    k = {n: A[n] + (B[n] - A[n]) * u for n in A}
    turn(rig, 'hips', Z, k['hipsT'])
    turn(rig, 'spine', Z, k['spineT'] - k['hipsT']); turn(rig, 'spine', FWD, k['spineP'])
    turn(rig, 'head', FWD, -k['spineP'] * 0.6); turn(rig, 'head', Z, k['headT'] - k['spineT'] * 0.4)
    # raise first, then tilt: the other order raises an arm that already points along the raise axis. The tilt (armR_Y)
    # is about the forward axis, so negative swings a raised arm out to the right and a lowered one across to the left:
    # held negative, the blade cuts a diagonal from high right to low left.
    turn(rig, 'upper_arm.R', FWD, k['armR_F']); turn(rig, 'upper_arm.R', Y, k['armR_Y']); turn(rig, 'forearm.R', FWD, k['foreR'])
    turn(rig, 'upper_arm.L', FWD, k['armL_F']); turn(rig, 'upper_arm.L', Y, -k['armL_Y']); turn(rig, 'forearm.L', FWD, k['foreL'])
    turn(rig, 'thigh.L', FWD, k['thighL']); turn(rig, 'shin.L', FWD, k['shinL'])
    turn(rig, 'thigh.R', FWD, k['thighR']); turn(rig, 'shin.R', FWD, k['shinR'])
    shift(rig, y=k['rootY'], z=k['rootZ'])


MOVES = {
    'idle': (4, lambda r, i, n: (turn(r, 'spine', FWD, 2 + 2 * math.sin(2 * math.pi * i / n)), turn(r, 'forearm.R', FWD, 20), turn(r, 'forearm.L', FWD, 12))),
    'walk': (8, lambda r, i, n: walk(r, i / n)),
    'run': (8, lambda r, i, n: walk(r, i / n, run=True)),
    'attack': (14, lambda r, i, n: attack(r, i)),
}
