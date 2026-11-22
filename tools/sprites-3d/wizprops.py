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
from mathutils import Matrix, Vector

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
    # sheet A: a lumpy boulder lashed to a gnarled haft with roots. Its two violet crystals are gone (the user, Elemental
    # Arms 2026-11-21: the head and shaft read apart better without them; the game hid them first, live3d.ts HIDDEN)
    g = GRIP; d = Vector((0.30, 0, 1)).normalized(); side = Vector((0, 1, 0))
    head = g + d * 0.78
    # two-handed (2026-11-20): the haft runs on below the fist for the other hand, a knot of root at its end
    parts = [rod('maul haft', g - d * 0.42, g + d * 0.75, 0.05, ROOT(), verts=6), ball('maul knot', g - d * 0.44, 0.065, ROOT()),
             ball('maul boulder', head, 0.24, ROCK(), scale=(1.15, 1.0, 0.85)),
             ball('maul lump', head + side * 0.16 + d * 0.06, 0.13, ROCK())]
    for k in range(3):   # roots wound round the haft and over the boulder's neck
        parts.append(ring('maul root' + str(k), g + d * (0.2 + 0.18 * k), d, 0.06, 0.022, ROOT()))
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


MESHY_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'output', 'guards-r3')


def meshy(name, height, lift=0.0, flip=1, thin=1.0):
    """A guard core built by Meshy (round 3; output/guards-r3/<name>.glb, from input/guards-r3/<name>.png), as one prop
    part: its picture's up toward the elbow (-U, so it hangs the right way up as the arm hangs), its face out along N,
    `height` tall along the forearm, centred over the hand (C) and `lift` further out. Its materials are renamed
    'arm meshy <name>' so the game's shells (live3d.ts fxModeOf) can tell them apart from the body's."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(MESHY_DIR, name + '.glb'))
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == 'MESH']
    for o in new:
        if o.type != 'MESH': o.select_set(False)
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes: o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1: bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.parent = None
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for x in new:
        if x.type != 'MESH': bpy.data.objects.remove(x)
    o.name = name + ' core'
    for k, m in enumerate(o.data.materials):
        if not m: continue
        m.name = 'arm meshy ' + name + (str(k) if k else '')
        # Meshy's 2K texture is far more than a guard a dozen pixels across needs: 256 px keeps the model small
        for nd in (m.node_tree.nodes if m.use_nodes else []):
            if nd.type == 'TEX_IMAGE' and nd.image and nd.image.size[0] > 256: nd.image.scale(256, 256)
    def box():
        return (Vector([min(v.co[i] for v in o.data.vertices) for i in range(3)]),
                Vector([max(v.co[i] for v in o.data.vertices) for i in range(3)]))
    # built from a three-quarter view, a core can come back turned about its upright axis: turn it so it is thinnest
    # front to back (Blender Y), the face toward -Y; `flip` turns it round when its back ends up in front
    xy = [(v.co.x, v.co.y) for v in o.data.vertices]
    def depth(a):
        c, s_ = math.cos(a), math.sin(a)
        ys = [-s_ * x + c * y for x, y in xy]
        return max(ys) - min(ys)
    best = min((k * math.pi / 72 for k in range(72)), key=depth)
    o.data.transform(Matrix.Rotation(-best + (math.pi if flip < 0 else 0), 4, 'Z'))
    if thin != 1.0: o.data.transform(Matrix.Diagonal((1, thin, 1, 1)))   # front to back is now Y: `thin` flattens a chunky core
    lo, hi = box()
    mid, s = (lo + hi) / 2, height / max(1e-6, hi.z - lo.z)
    # columns: the model's +X (its right) to -V, its +Y (its back; glTF's front is Blender's -Y) to -N, its +Z (up) to -U
    rot = Matrix(((-V.x, -N.x, -U.x), (-V.y, -N.y, -U.y), (-V.z, -N.z, -U.z))).to_4x4()
    o.matrix_world = Matrix.Translation(C + N * lift) @ rot @ Matrix.Scale(s, 4) @ Matrix.Translation(-mid)
    return o


def mirror():
    # sheet C: a polished gold mirror disc inside a halo of golden light
    return [disc('mirror disc', C + N * 0.02, N, 0.17, 0.05, GOLD()),
            ring('mirror rim', C + N * 0.04, N, 0.17, 0.02, GOLD()),
            disc('mirror ward', C, N, 0.46, 0.012, HALO(), verts=28),   # round 3: a wider ward, so the shimmer reads
            ring('mirror halo', C, N, 0.46, 0.03, HALO())]


def bulwark():
    # round 3 (Meshy, from docs/reference/wizard-arms/r3/): the Earth tower shield: a tall slab of carved stone with big set stones, shoulder height, no magma (the user: that's Fire's); dust and grit are the game's particles
    # round 4: the first model came with a grey base plate and hollow slots under it and a shattered texture (the user: "extra vertices on the bottom", "texture issue"); remade from the same picture as smart topology (meshy-t2.5 + meshy-n1, task 01a1f63f-76c7-7262-bad2-2d944dd65550), the old one kept as bulwark-r3.glb
    return [meshy('bulwark', 0.95)]


def bulwark_r2():
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
    # round 3: only the molten core is solid, a disc of dark rock round a white-hot middle (its shell pulses); the
    # flames round its rim are the game's particles (art/guard-fx.ts), no longer rigid cones
    # (third look: a smaller core, so the flames carry it and it reads less solid)
    return [disc('ember rock', C + N * 0.02, N, 0.20, 0.07, EMBER_RED()),
            ball('ember core', C + N * 0.06, 0.09, FLAME_CORE(), scale=(1, 0.5, 1))]


def rime():
    # round 3 (Meshy, from docs/reference/wizard-arms/r3/): the Rime shield (Frost): round steel-blue metal crusted with white rime; the mist falling off it is the game's particles
    return [meshy('rime', 0.62)]


def rime_r2():
    # sheet A: a kite of faceted ice, frosted along its upper edges, pointed at the bottom (toward the elbow)
    pts = [(-0.24, 0.30), (0.24, 0.30), (0.26, 0.05), (0.0, -0.42), (-0.26, 0.05)]
    parts = [slab('rime kite', pts, 0.07, ICE(), C + N * 0.02, V, U),
             slab('rime facet', [(0, 0.26), (0.16, 0.04), (0, -0.30), (-0.16, 0.04)], 0.09, CYAN(), C + N * 0.03, V, U)]
    for k, x in enumerate((-0.20, -0.06, 0.08, 0.20)):
        parts.append(ball('rime frost' + str(k), C + V * x + U * 0.30 + N * 0.05, 0.06, FROST()))
    return parts


def spike():
    # round 3 (Meshy, from docs/reference/wizard-arms/r3/): the Spike kite (Ice): a big kite of ice bristling with spikes, point down
    return [meshy('spike', 0.85, thin=0.55)]   # round 4: too thick (the user), 0.5 deep for 1 tall before


def spike_r2():
    # round 3 stand-in (the Meshy core replaces it): the Spike kite, Ice's own guard, a big kite of ice pointed toward
    # the hand (point down as the arm hangs; the Rime kite pointed the other way and read upside down), bristling
    # with spikes from its edges and face
    pts = [(-0.30, -0.34), (0.30, -0.34), (0.33, 0.02), (0.0, 0.50), (-0.33, 0.02)]
    parts = [slab('spike kite', pts, 0.09, ICE(), C + N * 0.02, V, U),
             slab('spike facet', [(0, -0.28), (0.18, 0.0), (0, 0.38), (-0.18, 0.0)], 0.11, CYAN(), C + N * 0.03, V, U)]
    for k, (x, y, dx, dy) in enumerate(((-0.30, -0.34, -0.7, -0.7), (0.30, -0.34, 0.7, -0.7), (0.33, 0.02, 1, 0.1), (-0.33, 0.02, -1, 0.1),
                                        (0.0, -0.34, 0, -1), (0.17, 0.26, 0.8, 0.5), (-0.17, 0.26, -0.8, 0.5))):
        b = C + V * x + U * y + N * 0.03
        parts.append(cone('spike edge' + str(k), b, b + (V * dx + U * dy).normalized() * 0.2, 0.06, FROST(), verts=5))
    for k, (x, y) in enumerate(((0.0, 0.05), (-0.12, -0.15), (0.12, -0.15))):
        b = C + V * x + U * y + N * 0.08
        parts.append(cone('spike face' + str(k), b, b + N * 0.16, 0.05, FROST(), verts=5))
    return parts


def spark():
    # round 3: a buckler's rim with no middle, silver-violet metal with six studs; the lightning arcing between points
    # on it is the game's particles (art/guard-fx.ts), so the open centre stays open (the weakest block)
    metal = mat('arm spark metal', (0.70, 0.66, 0.86))
    parts = [ring('spark hoop', C + N * 0.02, N, 0.30, 0.035, metal)]
    for k in range(6):
        a = k / 6 * math.tau
        parts.append(ball('spark stud' + str(k), C + (V * math.cos(a) + U * math.sin(a)) * 0.30 + N * 0.02, 0.05, SPARK_WHITE()))
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
    # round 3 (the user: "more faceted like a gem and less flat"): a cut gem, a hexagonal girdle with a faceted crown
    # in front (six bevels, then six facets meeting at a point) and a shallow pavilion behind, every facet flat, so
    # each catches its own hue from the shell (the colour follows each facet's angle to the camera)
    R, h1, h2, hb = 0.27, 0.07, 0.13, 0.08
    ring = lambda r, d: [C + V * (math.cos(k / 6 * math.tau) * r) + U * (math.sin(k / 6 * math.tau) * r) + N * d for k in range(6)]
    me = bpy.data.meshes.new('prism gem'); bm = bmesh.new()
    girdle = [bm.verts.new(p) for p in ring(R, 0.0)]
    table = [bm.verts.new(p) for p in ring(R * 0.55, h1)]
    crown = bm.verts.new(C + N * h2)
    back = bm.verts.new(C - N * hb)
    for k in range(6):
        j = (k + 1) % 6
        bm.faces.new((girdle[k], girdle[j], table[j], table[k]))   # the bevels
        bm.faces.new((table[k], table[j], crown))                 # the crown's facets
        bm.faces.new((girdle[j], girdle[k], back))                # the pavilion behind
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    for f in me.polygons: f.use_smooth = False
    o = bpy.data.objects.new('prism gem', me); bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(MAGENTA())
    return [o]


def leaf():
    # round 3 (Meshy, from docs/reference/wizard-arms/r3/): the Leaf aegis: a fan of three big leaves with pale midribs and a bud, so it reads as leaves when small
    return [meshy('leaf', 0.66, thin=0.55)]   # round 4: too thick (the user), 0.44 deep for 1 tall before


def leaf_r2():
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
         'prism': prism, 'leaf': leaf, 'spike': spike}
# Round 3, the user's second look: every guard bigger (the Spike, Prism and Leaf most), and held facing forward and
# out instead of flat against the arm, so the camera sees its face (the tower read as a slab carried edge-on).
GUARD_SCALE = {'mirror': 1.3, 'bulwark': 1.25, 'ember': 1.4, 'rime': 1.35, 'spark': 1.45, 'tide': 1.35, 'prism': 1.7,
               'leaf': 1.6, 'spike': 1.8}
GUARD_YAW = 0.8   # radians the face turns from straight out toward the front, about the forearm


def _guard(fn, k):
    def build():
        parts = fn()
        bpy.context.view_layer.update()
        m = Matrix.Translation(C) @ Matrix.Rotation(GUARD_YAW, 4, 'X') @ Matrix.Scale(k, 4) @ Matrix.Translation(-C)
        for o in parts: o.matrix_world = m @ o.matrix_world
        return parts
    return build


for _g, _k in GUARD_SCALE.items(): PROPS[_g] = _guard(PROPS[_g], _k)
# each guard's face normal in the carrier frame (N turned GUARD_YAW toward the front): the export marks it for the client
PROP_FACE = {g: (0.0, math.cos(GUARD_YAW), math.sin(GUARD_YAW)) for g in GUARD_SCALE}
# long weapons are soft props (render.py ~k), kept near upright as the staff is, instead of pointing out of the fist
PROP_AXIS = {'sword': tuple(UP), 'focus': tuple(UP), 'frostspear': tuple(UP), 'trident': tuple(UP), 'whip': tuple(UP),
             'earthmaul': tuple(Vector((0.30, 0, 1)).normalized()), 'icebow': (0, 0, 1)}
# the guards' picture-up is toward the elbow (-U): kept upright, a tower shield stands and a kite hangs point down
# however the forearm is held (round 3: the Rime kite read upside down, the tower lay on its side)
PROP_AXIS.update({g: (-1, 0, 0) for g in ('mirror', 'bulwark', 'ember', 'rime', 'spark', 'tide', 'prism', 'leaf', 'spike')})
