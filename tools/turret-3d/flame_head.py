"""The flame turret's head as a low-poly model, rendered at every facing. Run inside Blender; no generation calls.

  blender --background --python tools/turret-3d/flame_head.py -- <out_dir>

Then tools/turret-3d/pixelize.py turns the renders into the game's sprite sheet.
Scene axes: +Y is north (straight out from the wall), +X east, +Z up, 1 Blender unit = 1 world unit, the swivel at the origin.
The camera is the game's: orthographic, 30 degrees up (the 2:1 ground), looking north-west, so north is up and to the right.
"""
import json, math, os, sys
import bpy
from mathutils import Vector

OUT = sys.argv[sys.argv.index('--') + 1]
SWING, STEP = 80.0, 160.0 / 24    # 25 facings, -80 to +80 degrees; positive turns east
CANVAS, ART_PX_PER_UNIT, SUPER = 96, 16, 4
AXIS_Z = 0.82
TIP = Vector((0, 2.5, AXIS_Z - 0.14))

scene = bpy.context.scene
for o in list(bpy.data.objects): bpy.data.objects.remove(o)


def mat(name, rgb, rough=0.55, metal=0.0, emit=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1)
        b.inputs['Emission Strength'].default_value = 1.0
    return m


BRASS = mat('brass', (0.36, 0.21, 0.085), rough=0.42)
DARK = mat('dark brass', (0.075, 0.042, 0.022))
LIGHT = mat('light brass', (0.85, 0.56, 0.24), rough=0.35)

head = bpy.data.objects.new('head', None)
scene.collection.objects.link(head)


def place(o, m):
    o.data.materials.append(m)
    o.parent = head
    for p in o.data.polygons: p.use_smooth = True
    return o


def cyl(r1, r2, length, y, m, z=AXIS_Z, x=0.0):
    """A round section along the barrel: from radius r1 at y to r2 at y + length."""
    bpy.ops.mesh.primitive_cone_add(vertices=32, radius1=r1, radius2=r2, depth=length, location=(x, y + length / 2, z), rotation=(-math.pi / 2, 0, 0))
    return place(bpy.context.object, m)


def upright(r, h, z, m, x=0.0, y=0.0, r2=None):
    bpy.ops.mesh.primitive_cone_add(vertices=32, radius1=r, radius2=r if r2 is None else r2, depth=h, location=(x, y, z + h / 2))
    return place(bpy.context.object, m)


def box(sx, sy, sz, loc, m):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.scale = (sx, sy, sz)
    bpy.ops.object.transform_apply(scale=True)
    return place(o, m)


def across(r, w, x, y, z, m):
    """A disc whose axis runs across the barrel: the yoke's round tops and rivets."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=r, depth=w, location=(x, y, z), rotation=(0, math.pi / 2, 0))
    return place(bpy.context.object, m)


# the swivel it turns on
upright(0.42, 0.08, 0.0, DARK)
# the yoke: two side plates, round-topped, with a boss each
for side in (-1, 1):
    x = side * 0.36
    box(0.12, 0.62, 0.52, (x * 1.15, 0, 0.3), BRASS)
    across(0.31, 0.12, x * 1.15, 0, AXIS_Z - 0.2, BRASS)
    across(0.13, 0.2, x * 1.15, 0, AXIS_Z - 0.2, LIGHT)
# the body and its bands
cyl(0.27, 0.27, 0.86, -0.34, BRASS, z=AXIS_Z - 0.14)
cyl(0.3, 0.3, 0.07, -0.08, DARK, z=AXIS_Z - 0.14)
cyl(0.3, 0.3, 0.1, 0.42, LIGHT, z=AXIS_Z - 0.14)
# the nozzle: tapering, ringed, and flared at the burner
cyl(0.24, 0.12, 0.26, 0.52, BRASS, z=AXIS_Z - 0.14)
cyl(0.13, 0.11, 1.5, 0.78, BRASS, z=AXIS_Z - 0.14)
for k in range(5):
    cyl(0.17, 0.17, 0.11, 0.9 + k * 0.29, LIGHT if k % 2 else DARK, z=AXIS_Z - 0.14)
cyl(0.1, 0.2, 0.22, 2.28, BRASS, z=AXIS_Z - 0.14)
# the fuel tank behind, capped
cyl(0.2, 0.2, 0.42, -0.76, DARK, z=AXIS_Z - 0.14)
cyl(0.23, 0.23, 0.07, -0.5, LIGHT, z=AXIS_Z - 0.14)
cyl(0.2, 0.1, 0.1, -0.86, BRASS, z=AXIS_Z - 0.14)

# ---- the game's camera -----------------------------------------------------------------------------------------------
cam = bpy.data.cameras.new('cam')
cam.type = 'ORTHO'
cam.ortho_scale = CANVAS / ART_PX_PER_UNIT
cam_o = bpy.data.objects.new('cam', cam)
scene.collection.objects.link(cam_o)
ELEV, AZ = math.radians(30), Vector((1, -1, 0)).normalized()
LOOK_AT = Vector((0, 0, 0.5))
cam_o.location = LOOK_AT + (AZ * math.cos(ELEV) + Vector((0, 0, math.sin(ELEV)))) * 40
cam_o.rotation_euler = (LOOK_AT - cam_o.location).to_track_quat('-Z', 'Y').to_euler()
scene.camera = cam_o

# the sun comes from the upper left of the screen, as the bought art is lit
sun = bpy.data.lights.new('sun', 'SUN')
sun.energy = 3.0
sun.angle = math.radians(8)
sun_o = bpy.data.objects.new('sun', sun)
scene.collection.objects.link(sun_o)
sun_o.location = (-6, -8, 12)
sun_o.rotation_euler = (Vector((0, 0, 0.5)) - sun_o.location).to_track_quat('-Z', 'Y').to_euler()
world = bpy.data.worlds.new('world')
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (1, 0.93, 0.85, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.3
scene.world = world

r = scene.render
r.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 24
scene.cycles.use_denoising = False
r.film_transparent = True
r.resolution_x = r.resolution_y = CANVAS * SUPER
r.resolution_percentage = 100
r.filter_size = 0.01
r.image_settings.file_format = 'PNG'
r.image_settings.color_mode = 'RGBA'
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'

# the dark lines between parts
r.use_freestyle = True
r.line_thickness_mode = 'ABSOLUTE'
r.line_thickness = SUPER * 0.8
layer = scene.view_layers[0]
layer.use_freestyle = True
ls = layer.freestyle_settings.linesets[0] if layer.freestyle_settings.linesets else layer.freestyle_settings.linesets.new('lines')
ls.select_silhouette = ls.select_border = True
ls.select_crease = False
ls.select_edge_mark = False
ls.linestyle.color = (0.0086, 0.0052, 0.0044)
ls.linestyle.thickness = 1.0


def to_px(p):
    """World point to canvas pixels, top-left origin."""
    from bpy_extras.object_utils import world_to_camera_view
    c = world_to_camera_view(scene, cam_o, Vector(p))
    return [c.x * CANVAS, (1 - c.y) * CANVAS]


os.makedirs(OUT, exist_ok=True)
facings = [round(-SWING + i * STEP, 3) for i in range(25)]
bpy.context.view_layer.update()
info = {'canvas': CANVAS, 'facings': facings, 'pivot': to_px((0, 0, 0)), 'tips': []}
for n, deg in enumerate(facings):
    a = math.radians(deg)
    head.rotation_euler = (0, 0, -a)
    bpy.context.view_layer.update()
    info['tips'].append(to_px((math.sin(a) * TIP.y, math.cos(a) * TIP.y, TIP.z)))
    r.filepath = os.path.join(OUT, f'r{n:02d}.png')
    bpy.ops.render.render(write_still=True)
json.dump(info, open(os.path.join(OUT, 'info.json'), 'w'), indent=1)
print('rendered', len(facings))
