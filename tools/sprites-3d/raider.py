"""The hooded goblin raider, built from primitives (Claude's model). Run inside Blender by render.py; no generation calls.

Follows the contract in rig.py: feet on Z = 0, faces -Y, right hand on -X, each object named after the bone it rides.
Colours are the PixelLab raider's mid-tones, so palette snapping keeps them.
"""
import math
import bpy, bmesh
from mathutils import Vector, Matrix


def srgb(c):
    def f(v):
        v /= 255
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return tuple(f(v) for v in c)


MATS = {}
def mat(name, rgb, rough=0.8, metal=0.0):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*srgb(rgb), 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    MATS[name] = m
    return m


SKIN = (124, 156, 46); SKIN_D = (89, 118, 33)
HOOD = (67, 88, 134); STAR = (229, 165, 59)
TUNIC = (134, 75, 37); LEATHER = (83, 35, 19); SACK = (158, 97, 43)
WRAP = (167, 153, 140); STEEL = (213, 216, 223); GRIP = (38, 26, 18); EYE = (246, 215, 100); PANTS = (54, 69, 112)


def done(o, name, colour, smooth=True, **kw):
    o.name = name
    o.data.name = name
    o.data.materials.append(mat(str(colour), colour, **kw))
    for p in o.data.polygons: p.use_smooth = smooth
    return o


def sphere(name, c, loc, scale, colour, seg=12, **kw):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=max(6, seg // 2), radius=1, location=loc)
    o = bpy.context.object; o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    return done(o, name, colour, **kw)


def limb(name, a, b, r1, r2, colour, verts=10, **kw):
    """A tapered cylinder from point a (radius r1) to point b (radius r2)."""
    a, b = Vector(a), Vector(b)
    d = b - a
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=d.length, location=(a + b) / 2)
    o = bpy.context.object
    o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    bpy.ops.object.transform_apply(rotation=True)
    return done(o, name, colour, **kw)


def poly_prism(name, pts, x, half, colour, **kw):
    """A flat shape in the Y-Z plane at x, thickness 2*half (the blade, the hood's ragged cape)."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    f0 = bm.faces.new([bm.verts.new((x - half, y, z)) for y, z in pts])
    f1 = bm.faces.new([bm.verts.new((x + half, y, z)) for y, z in reversed(pts)])
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new([f0.verts[i], f0.verts[j], f1.verts[n - 1 - j], f1.verts[n - 1 - i]])
    bm.normal_update(); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return done(o, name, colour, smooth=False, **kw)


def ragged_cone(name, z_top, z_bot, r_top, r_bot, colour, teeth=9, depth=0.07, y=0.0):
    bpy.ops.mesh.primitive_cone_add(vertices=teeth * 2, radius1=r_bot, radius2=r_top, depth=z_top - z_bot, location=(0, y, (z_top + z_bot) / 2))
    o = bpy.context.object
    for i, v in enumerate(o.data.vertices):
        if v.co.z < 0 and i % 2:
            v.co.z += depth
    return done(o, name, colour)


# ---- body ---------------------------------------------------------------------------------------------------------------
# legs: short dark trousers, green shins, big bare feet
for s, sx in (('L', 1), ('R', -1)):
    limb(f'thigh.{s}', (0.14 * sx, 0, 0.80), (0.16 * sx, 0, 0.42), 0.14, 0.12, PANTS)
    limb(f'shin.{s}', (0.16 * sx, 0, 0.44), (0.16 * sx, 0.02, 0.08), 0.10, 0.09, SKIN)
    sphere(f'foot.{s}', None, (0.16 * sx, -0.08, 0.07), (0.13, 0.21, 0.08), SKIN)
# tunic: a ragged skirt on the hips, the body above, a belt
ragged_cone('hips', 0.98, 0.56, 0.31, 0.39, TUNIC, teeth=8, depth=0.09)
limb('hips_belt', (0, 0, 0.88), (0, 0, 0.96), 0.33, 0.33, LEATHER, verts=16)
sphere('hips_buckle', None, (0, -0.33, 0.92), (0.06, 0.03, 0.05), STAR)
limb('spine', (0, 0, 0.93), (0, 0, 1.30), 0.31, 0.28, TUNIC, verts=14)
limb('spine_strap', (0.24, -0.24, 1.28), (-0.24, -0.28, 0.98), 0.04, 0.04, LEATHER, verts=6)
# the hood's cowl over the shoulders
ragged_cone('spine_cowl', 1.38, 1.12, 0.22, 0.44, HOOD, teeth=7, depth=0.06)

# head: big, round, a long nose, ears out sideways, under a pointed hood
sphere('head', None, (0, -0.05, 1.57), (0.34, 0.31, 0.31), SKIN, seg=16)
limb('head_nose', (0, -0.30, 1.54), (0, -0.46, 1.47), 0.08, 0.02, SKIN_D, verts=8)
for sx in (1, -1):
    sphere(f'head_eye{sx}', None, (0.13 * sx, -0.33, 1.60), (0.07, 0.03, 0.055), EYE, seg=8)
    limb(f'head_ear{sx}', (0.26 * sx, 0.0, 1.58), (0.76 * sx, 0.06, 1.74), 0.12, 0.01, SKIN, verts=8)
# the hood: a shell with its front-lower part cut away, so the face looks out of it
bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=1, location=(0, 0.02, 1.66))
o = bpy.context.object
bm = bmesh.new(); bm.from_mesh(o.data)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y < -0.3 and v.co.z < 0.5], context='VERTS')
bm.to_mesh(o.data); bm.free()
o.scale = (0.41, 0.39, 0.38); bpy.ops.object.transform_apply(scale=True)
done(o, 'head_hood', HOOD)
limb('head_hoodtip', (0, 0.22, 1.90), (0, 0.46, 2.02), 0.16, 0.03, HOOD, verts=8)
sphere('head_star', None, (0, -0.33, 1.88), (0.07, 0.03, 0.07), STAR, seg=8)
# arms: thin green upper arms, wrapped forearms, knobbly hands
for s, sx in (('L', 1), ('R', -1)):
    sphere(f'upper_arm.{s}_shoulder', None, (0.30 * sx, 0, 1.19), (0.12, 0.12, 0.11), SKIN)
    limb(f'upper_arm.{s}', (0.29 * sx, 0, 1.20), (0.42 * sx, 0, 0.96), 0.09, 0.085, SKIN)
    limb(f'forearm.{s}', (0.42 * sx, 0, 0.96), (0.48 * sx, -0.04, 0.72), 0.105, 0.095, WRAP)
    sphere(f'hand.{s}', None, (0.50 * sx, -0.05, 0.66), (0.10, 0.10, 0.10), SKIN)

# the blade: a curved, jagged short sword in the right hand, flat side to the sides
limb('blade_grip', (-0.50, -0.02, 0.72), (-0.50, -0.10, 0.62), 0.03, 0.03, GRIP, verts=6)
limb('blade_guard', (-0.53, -0.09, 0.62), (-0.47, -0.11, 0.62), 0.05, 0.05, LEATHER, verts=6)
g, tip = Vector((-0.10, 0.62)), Vector((-0.62, 0.26))
edge, back = [], []
for i in range(7):
    t = i / 6
    p = g.lerp(tip, t) + Vector((0.0, -0.10)) * math.sin(math.pi * t) * 1.0
    w = 0.15 * (1 - t) + 0.04
    edge.append((p.x, p.y - w * 0.4))
    back.append((p.x + (0.03 if i % 2 else 0), p.y + w + (0.03 if i % 2 and 0 < i < 6 else 0)))
o = poly_prism('blade', edge + list(reversed(back)), -0.50, 0.022, STEEL, rough=0.3, metal=0.6)
# turn it about its own length so the flat shows from the front as well as the side
ax = (Vector((-0.50, tip.x, tip.y)) - Vector((-0.50, g.x, g.y))).normalized(); piv = Vector((-0.50, g.x, g.y))
o.data.transform(Matrix.Translation(piv) @ Matrix.Rotation(math.radians(30), 4, ax) @ Matrix.Translation(-piv))

# the loot sack on the back, its neck tied off
sphere('sack', None, (0.06, 0.38, 1.30), (0.30, 0.22, 0.30), SACK, seg=12)
sphere('sack_lump', None, (0.20, 0.40, 1.12), (0.17, 0.15, 0.15), SACK, seg=10)
limb('sack_neck', (0.10, 0.36, 1.56), (0.16, 0.34, 1.72), 0.06, 0.08, LEATHER, verts=8)
