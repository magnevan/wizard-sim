"""Held props for clip rigs (render.py --prop=props.py:<name>@<Bone>), drawn after tools/sprites-3d/input/roster/weapons.png.

Each prop is built in its bone's frame (render.py `frame`): origin at the bone's head (the wrist for a hand, the elbow
for a forearm), X along the limb toward the fingers, Z toward the character's forward as far as the limb allows, Y = Z x X.
Units are the render's: a goblin stands 1.98 tall (about a metre), so 0.1 is about 5 cm. Shapes are chunky on purpose:
at 32 px a knife is a few pixels.
"""
import math
import bpy
from mathutils import Matrix, Vector


def mat(name, rgb, emit=0.0):
    m = bpy.data.materials.get(name)
    if m: return m
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Roughness'].default_value = 0.6
    if emit:
        b.inputs['Emission Color'].default_value = (*rgb, 1); b.inputs['Emission Strength'].default_value = emit
    return m


STEEL = lambda: mat('prop steel', (0.62, 0.64, 0.66))
IRON = lambda: mat('prop iron', (0.32, 0.32, 0.34))
WOOD = lambda: mat('prop wood', (0.45, 0.24, 0.10))
LEATHER = lambda: mat('prop leather', (0.30, 0.15, 0.07))
BRASS = lambda: mat('prop brass', (0.78, 0.55, 0.15))
STONE = lambda: mat('prop stone', (0.50, 0.50, 0.50))
CLOTH = lambda: mat('prop cloth', (0.10, 0.14, 0.42))
RUNE = lambda: mat('prop rune', (0.70, 0.30, 1.0), emit=3.0)
STRING = lambda: mat('prop string', (0.85, 0.78, 0.55))


def _obj(name, material):
    o = bpy.context.active_object; o.name = name
    o.data.materials.clear(); o.data.materials.append(material)
    return o


def rod(name, a, b, r, material, verts=8):
    """A cylinder from a to b."""
    a, b = Vector(a), Vector(b); d = b - a
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=d.length, location=(a + b) / 2)
    o = _obj(name, material); o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    return o


def box(name, c, size, material, toward=None):
    """A box centred at c, size (x, y, z); `toward` turns its local Z onto that direction."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=c)
    o = _obj(name, material); o.scale = size
    if toward: o.rotation_euler = Vector(toward).to_track_quat('Z', 'Y').to_euler()
    return o


def cone(name, a, b, r, material, verts=8):
    a, b = Vector(a), Vector(b); d = b - a
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=0, depth=d.length, location=(a + b) / 2)
    o = _obj(name, material); o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    return o


GRIP = Vector((0.09, 0, 0))   # the palm, just past the wrist along the hand
DOWNFWD = Vector((0.55, 0, 1)).normalized()   # a held blade points forward and a little past the fingers


def knife():
    g = GRIP; d = DOWNFWD
    return [rod('knife grip', g - d * 0.07, g + d * 0.07, 0.03, LEATHER()),
            box('knife guard', g + d * 0.08, (0.12, 0.05, 0.03), IRON(), toward=d),
            box('knife blade', g + d * 0.30, (0.04, 0.12, 0.40), STEEL(), toward=d)]


def _empty(name, p):
    o = bpy.data.objects.new(name, None); bpy.context.scene.collection.objects.link(o); o.location = p
    return o


def _cli():
    import sys
    return sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


# --release=<clip>:<frame>: the frame a bow clip lets the arrow go (the string stays on the draw hand until then)
RELEASE = {k: int(v) for k, v in (a[10:].rsplit(':', 1) for a in _cli() if a.startswith('--release='))}
# Per-frame updates for props that follow more than their own bone (render.py calls each as fn(arm, frame, move)).
UPDATES = []


def bow():
    # Held in the left fist with the limbs along the hand frame's Z: Meshy's archery clip holds the hand so that Z is
    # world-up at full draw (measured: about 0.99), and the bow belly faces +X, along the forearm toward the target.
    # The string runs tip to tip, and while the right hand is behind the grip and near the arrow line (before the
    # clip's --release frame) it bends back to that hand with an arrow nocked. Thick enough to survive at 32 px.
    g = GRIP; up = Vector((0, 0, 1)); fwd = Vector((1, 0, 0))
    parts = [rod('bow grip', g - up * 0.08, g + up * 0.08, 0.05, LEATHER())]
    for s in (1, -1):
        mid = g + up * s * 0.32 + fwd * 0.12
        tip = g + up * s * 0.56 - fwd * 0.02
        parts += [rod('bow limb a' + str(s), g + up * s * 0.07, mid, 0.05, WOOD()), rod('bow limb b' + str(s), mid, tip, 0.042, WOOD())]
    tips = [_empty('bow tip+', g + up * 0.56 - fwd * 0.02), _empty('bow tip-', g - up * 0.56 - fwd * 0.02)]
    nock, grip = _empty('bow nock', g - fwd * 0.02), _empty('bow grip point', g)
    cu = bpy.data.curves.new('bow string', 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = 0.014; cu.bevel_resolution = 1
    sp = cu.splines.new('POLY'); sp.points.add(2); cu.materials.append(STRING())
    string = bpy.data.objects.new('bow string', cu); bpy.context.scene.collection.objects.link(string)
    arrow = rod('bow arrow', (0, 0, 0), (0, 0, 1), 0.02, WOOD(), verts=6)
    head = cone('bow arrowhead', (0, 0, 0.95), (0, 0, 1.12), 0.045, IRON(), verts=4); head.parent = arrow
    def update(arm, i, mv):
        bpy.context.view_layer.update()
        a, b = (t.matrix_world.translation.copy() for t in tips)
        n0, gp = nock.matrix_world.translation.copy(), grip.matrix_world.translation.copy()
        pb = arm.pose.bones['RightHand']; w0, w1 = arm.matrix_world @ pb.head, arm.matrix_world @ pb.tail
        rh = w0 + (w1 - w0).normalized() * GRIP.x * (a - b).length / 1.12   # the palm (a leaf bone's tail length is arbitrary)
        L = (a - b).length; u = (a - b).normalized(); f = (gp - n0).normalized()
        rel = rh - gp; along = rel.dot(f); vert = rel.dot(u); lat = (rel - f * along - u * vert).length
        rel_frame = next((v for k, v in RELEASE.items() if k in mv), None)

        hooked = along < -0.05 * L and lat < 0.3 * L and abs(vert) < 0.3 * L and (rel_frame is None or i <= rel_frame)
        for p, v in zip(sp.points, (a, rh if hooked else n0, b)): p.co = (*v, 1)
        arrow.hide_render = head.hide_render = not hooked
        if hooked:
            d = gp - rh
            arrow.matrix_world = Matrix.Translation(rh) @ d.to_track_quat('Z', 'Y').to_matrix().to_4x4() @ Matrix.Diagonal((1, 1, d.length + 0.3 * L / 1.12, 1))
    UPDATES.append(update)
    return parts + tips + [nock, grip]


def spear():
    g = GRIP; d = Vector((0.15, 0, 1)).normalized()
    return [rod('spear shaft', g - d * 0.55, g + d * 0.85, 0.03, WOOD()),
            cone('spear tip', g + d * 0.82, g + d * 1.12, 0.07, IRON(), verts=4)]


def shield():
    # strapped to the forearm, its face outward from the forearm's outer side, toward the character's forward
    c = Vector((0.16, 0, 0.10)); n = Vector((0, 0, 1))
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.36, depth=0.05, location=c)
    face = _obj('shield face', BRASS()); face.rotation_euler = n.to_track_quat('Z', 'Y').to_euler()
    bpy.ops.mesh.primitive_torus_add(major_radius=0.36, minor_radius=0.03, location=c + n * 0.02)
    rim = _obj('shield rim', IRON()); rim.rotation_euler = n.to_track_quat('Z', 'Y').to_euler()
    grille = box('shield grille', c + n * 0.035 + Vector((0.10, -0.08, 0)), (0.14, 0.12, 0.015), IRON())
    gear = rod('shield gear', c + n * 0.02 + Vector((-0.12, 0.12, 0)), c + n * 0.06 + Vector((-0.12, 0.12, 0)), 0.07, BRASS(), verts=10)
    rag = box('shield cloth', c + Vector((0.38, 0.12, 0.04)), (0.18, 0.08, 0.015), CLOTH())
    return [face, rim, grille, gear, rag]


def hook():
    g = GRIP; dn = Vector((1, 0, 0.25)).normalized()
    parts = [rod('hook shank', g - dn * 0.05, g + dn * 0.30, 0.035, IRON())]
    end = g + dn * 0.30
    for k, a in enumerate((0, 2.1, 4.2)):
        side = Vector((0, math.cos(a), math.sin(a)))
        mid = end + side * 0.12 - dn * 0.02
        parts += [rod('hook prong a' + str(k), end, mid, 0.028, IRON()), cone('hook prong b' + str(k), mid, mid - dn * 0.13 + side * 0.03, 0.03, IRON(), verts=5)]
    # a short throwing length of chain hanging from the fist
    for k in range(3):
        a = g - dn * (0.08 + k * 0.09) + Vector((0, 0, -0.03 * k))
        parts.append(rod('hook chain' + str(k), a, a - dn * 0.07, 0.025, IRON(), verts=6))
    return parts


def maul():
    g = GRIP; d = Vector((0.35, 0, 1)).normalized(); side = Vector((0, 1, 0))
    head_c = g + d * 0.80
    parts = [rod('maul haft', g - d * 0.22, g + d * 0.85, 0.045, WOOD()),
             box('maul head', head_c, (0.32, 0.64, 0.36), STONE(), toward=d)]
    for s in (-1, 1):
        parts.append(box('maul band' + str(s), head_c + side * s * 0.2, (0.34, 0.07, 0.38), BRASS(), toward=d))
    parts.append(box('maul rune', head_c + d.cross(side).normalized() * 0.165, (0.16, 0.16, 0.02), RUNE(), toward=d.cross(side)))
    return parts


PURPLE = lambda: mat('prop socket', (0.16, 0.13, 0.22))
WRAP = lambda: mat('prop wrap', (0.85, 0.75, 0.62))

# The staff stands up from the fist when the arm hangs: back along the hand toward the wrist (-X), leaning a little
# forward (-Z on a hanging arm). (Across the palm, Y, is the character's side: that held it like a quarterstaff.)
STAFF_DIR = Vector((-1, 0, -0.30)).normalized()
STAFF_OFF = Vector((0, 0, -0.05))  # just in front of the knuckles, so the shaft clears the forearm


def staff():
    # The game's wizard staff (art/rigs.ts drawStaff): a wooden shaft about as tall as the hat brim, gripped a third of
    # the way up, a wrapped grip, an iron foot, and a claw at the top holding a dark socket (the game draws the orb's glow
    # there, in the colour of what is being cast). Lengths are for a 2-unit body; --height scales them.
    g = GRIP + STAFF_OFF; d = STAFF_DIR
    side = d.cross(Vector((0, 0, 1))).normalized()
    top = g + d * 1.12
    parts = [rod('staff shaft', g - d * 0.52, top, 0.035, WOOD()),
             rod('staff foot', g - d * 0.56, g - d * 0.44, 0.042, IRON()),
             rod('staff grip', g - d * 0.10, g + d * 0.14, 0.045, WRAP())]
    for k, a in enumerate((0, 2.1, 4.2)):   # three claws curling up round the socket
        out = (side * math.cos(a) + d.cross(side) * math.sin(a)).normalized()
        mid = top + out * 0.08 + d * 0.06
        parts += [rod('staff claw a' + str(k), top - d * 0.02, mid, 0.025, WOOD()),
                  cone('staff claw b' + str(k), mid, mid + d * 0.10 - out * 0.03, 0.026, WOOD(), verts=5)]
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=0.075, location=top + d * 0.09)
    parts.append(_obj('staff socket', PURPLE()))
    return parts


# a soft prop's main axis (render.py --prop=props.py:<name>~k@<Bone>), straightened toward upright each frame
PROP_AXIS = {'staff': tuple(STAFF_DIR)}

PROPS = {'knife': knife, 'bow': bow, 'spear': spear, 'shield': shield, 'hook': hook, 'maul': maul, 'staff': staff}
