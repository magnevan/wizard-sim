"""The wizard's conjured weapons and guards as held props (render.py --prop=wizprops.py:<name>@<Bone>), after the sheets
the user picked (docs/reference/wizard-arms/: every weapon from weapons-a, every guard from guards-a except the Mirror
buckler from guards-c; docs/explorations/2026-11-16-warband-art.md, "The wizard's weapons and guards").

They're magic, not gear: each is its element shaped into a weapon, so no wood, leather or iron except where the
sheet has it. Built like the goblins' props (props.py, whose helpers and hand frames this reuses): a few chunky
primitives, because at game size a sword is a dozen pixels. The detail the sheets show (flame tongues, frost, sparks)
is the game's particle VFX around the prop, not mesh. Weapons go on RightHand, guards on LeftForeArm.
"""
import math
import os
import bmesh
import bpy
from mathutils import Vector

_src = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'props.py')
exec(compile(open(_src, encoding='utf-8-sig').read(), _src, 'exec'), globals())   # mat, rod, box, cone, GRIP, bow...


def glow(name, rgb, emit=1.5, rough=0.35):
    m = mat(name, rgb, emit=emit)
    m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = rough
    return m


FLAME = lambda: glow('arm flame', (1.0, 0.42, 0.06), 1.0)
FLAME_CORE = lambda: glow('arm flame core', (1.0, 0.80, 0.30), 1.2)
EMBER_RED = lambda: glow('arm ember red', (0.55, 0.10, 0.04), 0.6)
ROCK = lambda: mat('arm rock', (0.42, 0.36, 0.31))
EARTH = lambda: mat('arm earth', (0.38, 0.22, 0.10))
ROOT = lambda: mat('arm root', (0.40, 0.22, 0.09))
AMETHYST = lambda: glow('arm amethyst', (0.62, 0.30, 1.0), 0.6)
MAGENTA = lambda: glow('arm magenta', (0.95, 0.25, 0.85), 0.8, rough=0.15)
DARK = lambda: mat('arm dark', (0.30, 0.28, 0.32))
ICE = lambda: glow('arm ice', (0.50, 0.72, 0.95), 0.2, rough=0.15)
FROST = lambda: glow('arm frost', (0.92, 0.97, 1.0), 0.4, rough=0.7)
CYAN = lambda: glow('arm cyan', (0.20, 0.80, 0.95), 0.3, rough=0.1)
VIOLET = lambda: glow('arm violet', (0.60, 0.25, 0.95), 0.7)
SPARK_WHITE = lambda: glow('arm spark white', (0.90, 0.80, 1.0), 1.0)
WATER = lambda: glow('arm water', (0.08, 0.35, 0.90), 0.3, rough=0.1)
WATER_LIGHT = lambda: glow('arm water light', (0.30, 0.70, 1.0), 0.5, rough=0.1)
FOAM = lambda: mat('arm foam', (0.95, 0.97, 1.0))
GOLD = lambda: glow('arm gold', (1.0, 0.72, 0.12), 0.5, rough=0.2)
HALO = lambda: glow('arm halo', (1.0, 0.85, 0.45), 0.6, rough=0.5)
LEAF = lambda: glow('arm leaf', (0.35, 0.75, 0.15), 0.3, rough=0.5)
LEAF_LIGHT = lambda: glow('arm leaf light', (0.75, 1.0, 0.45), 0.6)


def slab(name, pts, thick, material, c, u, v):
    """A flat prism: polygon pts (2D, in the u, v plane) centred on c, thick along u x v."""
    n = u.cross(v).normalized()
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    vs = [bm.verts.new(c + u * x + v * y - n * thick / 2) for x, y in pts]
    face = bm.faces.new(vs)
    ext = bmesh.ops.extrude_face_region(bm, geom=[face])
    bmesh.ops.translate(bm, vec=n * thick, verts=[e for e in ext['geom'] if isinstance(e, bmesh.types.BMVert)])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(material)
    return o


def ball(name, c, r, material, scale=(1, 1, 1), subdiv=1):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdiv, radius=r, location=c)
    o = _obj(name, material); o.scale = scale
    return o


def ring(name, c, n, R, r, material):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, location=c, major_segments=20, minor_segments=6)
    o = _obj(name, material); o.rotation_euler = n.to_track_quat('Z', 'Y').to_euler()
    return o


def disc(name, c, n, R, depth, material, verts=20):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=R, depth=depth, location=c)
    o = _obj(name, material); o.rotation_euler = n.to_track_quat('Z', 'Y').to_euler()
    return o


# ---- weapons (RightHand; blades out of the thumb side, as props.py's knife and staff) ----

UP = Vector((0.15, 0, 1)).normalized()   # a held weapon's main axis: out of the fist, a little toward the fingers
FLAT = Vector((0, 1, 0))                 # across the blade


def sword():
    # sheet A: a sword whose blade is one flame, a grey crossguard, a wrapped grip, a round pommel
    g = GRIP; d = UP; w = d.cross(FLAT).normalized()
    parts = [rod('sword grip', g - d * 0.10, g + d * 0.10, 0.04, LEATHER()),
             ball('sword pommel', g - d * 0.13, 0.05, IRON()),
             box('sword guard', g + d * 0.13, (0.30, 0.07, 0.07), IRON(), toward=FLAT)]
    base = g + d * 0.16
    blade = [(-0.09, 0), (0.09, 0), (0.11, 0.22), (0.06, 0.38), (0.08, 0.46), (0.0, 0.66), (-0.07, 0.48), (-0.05, 0.40), (-0.11, 0.24)]
    parts.append(slab('sword flame', blade, 0.05, FLAME(), base, w, d))
    core = [(-0.045, 0.02), (0.045, 0.02), (0.05, 0.25), (0.0, 0.48), (-0.05, 0.25)]
    parts.append(slab('sword core', core, 0.07, FLAME_CORE(), base, w, d))
    return parts


def earthmaul():
    # sheet A: a lumpy boulder lashed to a gnarled haft with roots, two violet crystals in the rock
    g = GRIP; d = Vector((0.30, 0, 1)).normalized(); side = Vector((0, 1, 0))
    head = g + d * 0.78
    parts = [rod('maul haft', g - d * 0.22, g + d * 0.75, 0.05, ROOT(), verts=6),
             ball('maul boulder', head, 0.24, ROCK(), scale=(1.15, 1.0, 0.85)),
             ball('maul lump', head + side * 0.16 + d * 0.06, 0.13, ROCK())]
    for k in range(3):   # roots wound round the haft and over the boulder's neck
        parts.append(ring('maul root' + str(k), g + d * (0.2 + 0.18 * k), d, 0.06, 0.022, ROOT()))
    parts += [cone('maul crystal a', head + side * 0.18 + d * 0.10, head + side * 0.30 + d * 0.24, 0.05, AMETHYST(), verts=5),
              cone('maul crystal b', head - side * 0.14 + d * 0.15, head - side * 0.22 + d * 0.30, 0.04, AMETHYST(), verts=5)]
    return parts


def focus():
    # sheet A: a stubby wrapped wand, a dark three-pronged cradle, a big magenta orb
    g = GRIP; d = UP; side = d.cross(Vector((0, 0, 1))).normalized() if abs(d.z) < 0.99 else Vector((0, 1, 0))
    top = g + d * 0.22
    parts = [rod('focus grip', g - d * 0.10, top, 0.045, LEATHER()),
             ball('focus foot', g - d * 0.12, 0.05, DARK()),
             rod('focus collar', top - d * 0.02, top + d * 0.06, 0.07, DARK())]
    for k, a in enumerate((0, 2.1, 4.2)):
        out = (side * math.cos(a) + d.cross(side) * math.sin(a)).normalized()
        parts.append(cone('focus prong' + str(k), top + d * 0.04 + out * 0.05, top + d * 0.22 + out * 0.14, 0.035, DARK(), verts=5))
    parts.append(ball('focus orb', top + d * 0.18, 0.12, MAGENTA(), subdiv=2))
    return parts


def icebow():
    # sheet A: props.py's bow (it bends its string to the drawing hand), carved from ice with frosted joints
    global WOOD, LEATHER, STRING
    keep = WOOD, LEATHER, STRING
    WOOD, LEATHER, STRING = ICE, FROST, lambda: glow('arm bowstring', (0.75, 0.95, 1.0), 2.0)
    try:
        parts = bow()
    finally:
        WOOD, LEATHER, STRING = keep
    g = GRIP; up = Vector((0, 0, 1)); fwd = Vector((1, 0, 0))
    for s in (1, -1):
        parts.append(ball('icebow frost' + str(s), g + up * s * 0.32 + fwd * 0.12, 0.055, FROST()))
    return parts


def frostspear():
    # sheet A: a frosted shaft, a frost collar and a jagged icicle head of a few crystals
    g = GRIP; d = UP; side = Vector((0, 1, 0)); w = d.cross(side).normalized()
    neck = g + d * 0.80
    parts = [rod('spear shaft', g - d * 0.55, neck, 0.035, FROST()),
             ball('spear butt', g - d * 0.57, 0.05, FROST()),
             rod('spear collar', neck - d * 0.03, neck + d * 0.05, 0.065, FROST()),
             cone('spear head', neck + d * 0.03, neck + d * 0.42, 0.09, CYAN(), verts=5)]
    for k, (s, t) in enumerate(((side, 0.08), (-side, 0.12), (w, 0.06), (-w, 0.10))):
        parts.append(cone('spear shard' + str(k), neck + d * t, neck + d * (t + 0.20) + s * 0.10, 0.04, CYAN(), verts=4))
    return parts


def whip():
    # sheet A: a dark wrapped handle with a violet crystal pommel, and a solid zig-zag lash of lightning. In the game the
    # lash is animated by code (a stiff mesh can't swing); the 'whip lash' parts are its rest pose, hidden there.
    g = GRIP; d = UP
    parts = [rod('whip handle', g - d * 0.10, g + d * 0.16, 0.04, LEATHER()),
             cone('whip pommel', g - d * 0.10, g - d * 0.24, 0.05, VIOLET(), verts=5),
             rod('whip cap', g + d * 0.14, g + d * 0.19, 0.05, DARK())]
    p = g + d * 0.19
    zig = [(0.10, 0.06), (-0.06, 0.08), (0.12, 0.02), (-0.04, -0.10), (0.10, -0.14), (-0.02, -0.16), (0.08, -0.14)]
    for k, (dx, dz) in enumerate(zig):   # out over the fingers, then hanging down in a loose S
        q = p + Vector((0.06 + dx * 0.3, 0, 0)) + d * dz + Vector((0.08, 0, 0))
        parts.append(rod('whip lash' + str(k), p, q, 0.028 - k * 0.002, VIOLET(), verts=6)); p = q
    parts.append(cone('whip lash tip', p, p + Vector((0.12, 0, -0.06)), 0.03, SPARK_WHITE(), verts=4))
    return parts


def trident():
    # sheet A: a shaft of blue water, a wave-curl crossbar, three prongs with foam caps
    g = GRIP; d = UP; side = Vector((0, 1, 0))
    fork = g + d * 0.85
    parts = [rod('trident shaft', g - d * 0.55, fork, 0.04, WATER()),
             ball('trident butt', g - d * 0.57, 0.055, WATER_LIGHT()),
             rod('trident collar', fork - d * 0.04, fork + d * 0.03, 0.07, WATER_LIGHT()),
             rod('trident bar', fork - side * 0.18, fork + side * 0.18, 0.04, WATER_LIGHT())]
    for s in (-1, 0, 1):
        b = fork + side * s * 0.18
        tip = b + d * (0.34 if s == 0 else 0.26) + side * s * 0.04
        parts += [cone('trident prong' + str(s), b, tip, 0.05, WATER(), verts=6), ball('trident foam' + str(s), tip - d * 0.03, 0.05, FOAM())]
        if s: parts.append(ring('trident curl' + str(s), b + side * s * 0.05, Vector((1, 0, 0)), 0.06, 0.022, WATER_LIGHT()))
    return parts


# ---- guards (LeftForeArm; facing out from the back of the forearm, as props.py's shield) ----

N = Vector((0, 1, 0))                 # the face's outward normal
U = Vector((1, 0, 0))                 # along the forearm
V = Vector((0, 0, 1))                 # across it
C = Vector((0.26, 0, 0)) + N * 0.17   # over the hand, as the goblin shield


def mirror():
    # sheet C: a polished gold mirror disc inside a halo of golden light
    return [disc('mirror disc', C + N * 0.02, N, 0.17, 0.05, GOLD()),
            ring('mirror rim', C + N * 0.04, N, 0.17, 0.02, GOLD()),
            disc('mirror ward', C, N, 0.30, 0.012, HALO(), verts=24),
            ring('mirror halo', C, N, 0.30, 0.025, HALO())]


def bulwark():
    # sheet A: a tall slab of torn-up rock, clods of earth on its edges, glowing cracks across the face
    pts = [(-0.24, -0.42), (0.10, -0.46), (0.26, -0.20), (0.24, 0.30), (0.10, 0.48), (-0.20, 0.44), (-0.27, 0.05)]
    parts = [slab('bulwark slab', pts, 0.14, ROCK(), C + N * 0.04, V, U)]
    for k, (x, y) in enumerate(((0.22, 0.32), (-0.24, -0.30), (0.18, -0.38))):
        parts.append(ball('bulwark clod' + str(k), C + V * x + U * y + N * 0.05, 0.08, EARTH()))
    for k, (a, b) in enumerate((((-0.18, 0.20), (0.04, 0.02)), ((0.04, 0.02), (0.16, -0.24)), ((-0.06, -0.10), (-0.20, -0.30)))):
        pa, pb = C + V * a[0] + U * a[1] + N * 0.115, C + V * b[0] + U * b[1] + N * 0.115
        parts.append(rod('bulwark crack' + str(k), pa, pb, 0.018, GOLD(), verts=4))
    return parts


def ember():
    # sheet A: a round shield of molten rock round a white-hot core, ringed by tongues of flame
    parts = [disc('ember rock', C + N * 0.02, N, 0.26, 0.08, EMBER_RED()),
             ball('ember core', C + N * 0.07, 0.10, FLAME_CORE(), scale=(1, 0.5, 1))]
    for k in range(9):
        a = k / 9 * math.tau
        out = V * math.cos(a) + U * math.sin(a)
        b = C + out * 0.22 + N * 0.02
        parts.append(cone('ember tongue' + str(k), b, b + out * 0.16 + (V * -math.sin(a) + U * math.cos(a)) * 0.05, 0.07, FLAME(), verts=5))
    return parts


def rime():
    # sheet A: a kite of faceted ice, frosted along its upper edges, pointed at the bottom (toward the elbow)
    pts = [(-0.24, 0.30), (0.24, 0.30), (0.26, 0.05), (0.0, -0.42), (-0.26, 0.05)]
    parts = [slab('rime kite', pts, 0.07, ICE(), C + N * 0.02, V, U),
             slab('rime facet', [(0, 0.26), (0.16, 0.04), (0, -0.30), (-0.16, 0.04)], 0.09, CYAN(), C + N * 0.03, V, U)]
    for k, x in enumerate((-0.20, -0.06, 0.08, 0.20)):
        parts.append(ball('rime frost' + str(k), C + V * x + U * 0.30 + N * 0.05, 0.06, FROST()))
    return parts


def spark():
    # sheet A: an open hoop of lightning, spiked, with a thin web of bolts across its middle (the weakest block)
    parts = [ring('spark hoop', C + N * 0.02, N, 0.25, 0.04, VIOLET())]
    for k in range(8):
        a = k / 8 * math.tau + 0.2
        out = V * math.cos(a) + U * math.sin(a)
        parts.append(cone('spark spike' + str(k), C + out * 0.25 + N * 0.02, C + out * 0.36 + N * 0.02, 0.04, VIOLET(), verts=4))
    for k in range(3):
        a = k / 3 * math.tau
        out = V * math.cos(a) + U * math.sin(a)
        mid = C + out * 0.10 + (V * -math.sin(a) + U * math.cos(a)) * 0.04 + N * 0.02
        parts += [rod('spark web a' + str(k), C + N * 0.02, mid, 0.012, SPARK_WHITE(), verts=4),
                  rod('spark web b' + str(k), mid, C + out * 0.24 + N * 0.02, 0.012, SPARK_WHITE(), verts=4)]
    return parts


def tide():
    # sheet A: a disc of swirling deep-blue water, a lighter spiral, foam crests round its rim
    parts = [disc('tide disc', C + N * 0.02, N, 0.27, 0.07, WATER()),
             ring('tide swirl a', C + N * 0.06, N, 0.15, 0.025, WATER_LIGHT()),
             ring('tide swirl b', C + N * 0.07, N, 0.07, 0.02, WATER_LIGHT())]
    for k in range(5):
        a = k / 5 * math.tau + 0.4
        out = V * math.cos(a) + U * math.sin(a)
        parts.append(ball('tide foam' + str(k), C + out * 0.25 + N * 0.05, 0.07, FOAM(), scale=(1, 0.7, 1)))
    return parts


def prism():
    # sheet A: a hexagonal pane of faceted magenta crystal
    hexa = [(math.cos(k / 6 * math.tau) * 0.27, math.sin(k / 6 * math.tau) * 0.27) for k in range(6)]
    inner = [(x * 0.55, y * 0.55) for x, y in hexa]
    return [slab('prism pane', hexa, 0.06, MAGENTA(), C + N * 0.02, V, U),
            slab('prism facet', inner, 0.09, glow('arm magenta light', (1.0, 0.65, 0.95), 2.0, rough=0.1), C + N * 0.03, V, U)]


def leaf():
    # sheet A: a shield grown from big living leaves, a glowing midrib, a vine curling up the side to a bud
    blade = [(0, -0.40), (0.20, -0.20), (0.24, 0.08), (0.12, 0.30), (0, 0.40), (-0.12, 0.30), (-0.24, 0.08), (-0.20, -0.20)]
    parts = [slab('leaf blade', blade, 0.05, LEAF(), C + N * 0.03, V, U),
             slab('leaf back', [(x * 0.9, y * 0.9) for x, y in blade], 0.04, mat('arm leaf dark', (0.18, 0.45, 0.10)), C - N * 0.01 + V * 0.06 + U * 0.04, V, U),
             rod('leaf rib', C + U * -0.36 + N * 0.06, C + U * 0.36 + N * 0.06, 0.018, LEAF_LIGHT(), verts=4)]
    vine = [(0.22, -0.30), (0.27, -0.05), (0.24, 0.18), (0.20, 0.36)]
    for k in range(len(vine) - 1):
        a, b = vine[k], vine[k + 1]
        parts.append(rod('leaf vine' + str(k), C + V * a[0] + U * a[1] + N * 0.06, C + V * b[0] + U * b[1] + N * 0.06, 0.02, LEAF()))
    parts.append(ball('leaf bud', C + V * 0.20 + U * 0.40 + N * 0.06, 0.05, mat('arm bud', (0.92, 0.95, 0.75))))
    return parts


PROPS = {'sword': sword, 'earthmaul': earthmaul, 'focus': focus, 'icebow': icebow, 'frostspear': frostspear, 'whip': whip,
         'trident': trident, 'mirror': mirror, 'bulwark': bulwark, 'ember': ember, 'rime': rime, 'spark': spark, 'tide': tide,
         'prism': prism, 'leaf': leaf}
# long weapons are soft props (render.py ~k), kept near upright as the staff is, instead of pointing out of the fist
PROP_AXIS = {'sword': tuple(UP), 'focus': tuple(UP), 'frostspear': tuple(UP), 'trident': tuple(UP), 'whip': tuple(UP),
             'earthmaul': tuple(Vector((0.30, 0, 1)).normalized()), 'icebow': (0, 0, 1)}
