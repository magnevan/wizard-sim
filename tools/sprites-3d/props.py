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


def bow():
    # held in the fist, limbs across the hand (upright when the arm points ahead), the string toward the archer
    g = GRIP; up = Vector((0, 1, 0)); back = Vector((0, 0, -1))
    parts = [rod('bow grip', g - up * 0.07, g + up * 0.07, 0.035, LEATHER())]
    for s in (1, -1):
        mid = g + up * s * 0.26 + back * -0.08
        tip = g + up * s * 0.46 + back * 0.02
        parts += [rod('bow limb a' + str(s), g + up * s * 0.06, mid, 0.03, WOOD()), rod('bow limb b' + str(s), mid, tip, 0.025, WOOD())]
    parts.append(rod('bow string', g + up * 0.46 + back * 0.02, g - up * 0.46 + back * 0.02, 0.006, STRING(), verts=4))
    return parts


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
    head_c = g + d * 0.95
    parts = [rod('maul haft', g - d * 0.25, g + d * 1.05, 0.04, WOOD()),
             box('maul head', head_c, (0.20, 0.42, 0.24), STONE(), toward=d)]
    for s in (-1, 1):
        parts.append(box('maul band' + str(s), head_c + side * s * 0.13, (0.215, 0.05, 0.255), BRASS(), toward=d))
    parts.append(box('maul rune', head_c + d.cross(side).normalized() * 0.105, (0.10, 0.10, 0.02), RUNE(), toward=d.cross(side)))
    return parts


PROPS = {'knife': knife, 'bow': bow, 'spear': spear, 'shield': shield, 'hook': hook, 'maul': maul}
