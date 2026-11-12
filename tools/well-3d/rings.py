"""The well's two rings in 3D, rendered for the game. Run inside Blender; no generation calls.

  blender --background --python tools/well-3d/rings.py -- <out_dir> [spin|test]

Units are art pixels. The rings are placed by tools/well-3d/rings-fit.json (fitted to the bought rings' silhouette), each
a solid band with thickness: a channel between two raised lips, the engraving (band_texture.py) as bump and shade. A
warm light sits in the crystal, so the edges facing it catch its glow as the bought art's do; a sun from the upper left.

Each frame is rendered twice, split at the crystal's depth: back.png (behind the crystal) and front.png (in front), so
the game can put the crystal between them. `spin`: one loop of the steady spin, ring A one way about its own axis and
ring B the other, a frame per art pixel of travel at the rim. `test`: frame 0 only.
"""
import json, math, os, sys
import bpy
import bmesh
from mathutils import Matrix, Vector

ARGS = sys.argv[sys.argv.index('--') + 1:]
OUT, MODE = ARGS[0], (ARGS[1] if len(ARGS) > 1 else 'test')
HERE = os.path.dirname(os.path.abspath(__file__))
FIT = json.load(open(os.path.join(HERE, 'rings-fit.json')))
BUILD = os.path.join(HERE, 'build')
CANVAS_W, CANVAS_H, SUPER = 104, 56, 4
REPEAT = 4
W = FIT['W']
# the bought rings aren't one size (the user): one passes just inside the other, a band's thickness apart, so they never
# meet. BIG says which: 'B' (the mirrored one) or 'A'.
GAP, BIG = 3.2, (ARGS[2] if len(ARGS) > 2 else 'B')
RMID = (FIT['R'] + FIT.get('RB', FIT['R'])) / 2
RADII = {'A': RMID + (GAP if BIG == 'A' else -GAP) / 2, 'B': RMID + (GAP if BIG == 'B' else -GAP) / 2}
RO, LIPH = RMID + 0.9, 0.55                 # the outer radius at the middle size (for the loop's length), how far the lips stand proud
SEG = 256

scene = bpy.context.scene
for o in list(bpy.data.objects): bpy.data.objects.remove(o)


def band_material():
    m = bpy.data.materials.new('band')
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = bpy.data.images.load(os.path.join(BUILD, 'band-height.png'))
    tex.image.colorspace_settings.name = 'Non-Color'
    tex.interpolation = 'Closest'
    pat = nt.nodes.new('ShaderNodeTexImage')
    pat.image = bpy.data.images.load(os.path.join(BUILD, 'band-patina.png'))
    pat.image.colorspace_settings.name = 'Non-Color'
    uv = nt.nodes.new('ShaderNodeTexCoord')
    nt.links.new(uv.outputs['UV'], tex.inputs['Vector'])
    nt.links.new(uv.outputs['UV'], pat.inputs['Vector'])
    # brass, darker down in the carvings, green-grey where the patina sits
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.3
    ramp.color_ramp.elements[0].color = (0.04, 0.025, 0.012, 1)
    ramp.color_ramp.elements[1].position = 0.95
    ramp.color_ramp.elements[1].color = (0.85, 0.62, 0.36, 1)
    nt.links.new(tex.outputs['Color'], ramp.inputs['Fac'])
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.inputs['B'].default_value = (0.03, 0.045, 0.035, 1)
    nt.links.new(pat.outputs['Color'], mix.inputs['Factor'])
    nt.links.new(ramp.outputs['Color'], mix.inputs['A'])
    nt.links.new(mix.outputs['Result'], b.inputs['Base Color'])
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.8
    bump.inputs['Distance'].default_value = 0.4
    nt.links.new(tex.outputs['Color'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    b.inputs['Roughness'].default_value = 0.38
    b.inputs['Metallic'].default_value = 0.65
    return m


def plain(name, rgb, rough=0.5, metal=0.5):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    return m


def inner_material():
    """The inside face: flat darker brown seen face-on (the back arcs, as bought), but where it's seen edge-on it glows
    the crystal's yellow, the thin bright line along each band's crystal-side edge in the bought art."""
    m = plain('inner', (0.16, 0.09, 0.045), rough=0.7, metal=0.3)
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    lw = nt.nodes.new('ShaderNodeLayerWeight')
    lw.inputs['Blend'].default_value = 0.5
    pw = nt.nodes.new('ShaderNodeMath')
    pw.operation = 'POWER'
    pw.inputs[1].default_value = 4.0
    nt.links.new(lw.outputs['Facing'], pw.inputs[0])
    b.inputs['Emission Color'].default_value = (1.0, 0.8, 0.3, 1)
    nt.links.new(pw.outputs['Value'], b.inputs['Emission Strength'])
    return m


BAND = band_material()
INNER = inner_material()
RIM = plain('rim', (0.7, 0.52, 0.3), rough=0.35, metal=0.6)          # the band's ends: the light rim

H2 = W / 2


def profile(rc):
    """The band's cross-section for a ring of mid radius rc, (radius, height along the axis, v across, material): the
    end faces the light rim, the outer face engraved with its lips proud, the inner face plain. A closed loop."""
    ro, ri = rc + 0.9, rc - 1.5
    lip = 1.0 / W
    return [
        (ri, -H2, 0.0, 2), (ro + LIPH, -H2, 0.0, 0), (ro + LIPH, -H2 + 1.0, lip, 0), (ro, -H2 + 1.2, lip + 0.03, 0),
        (ro, H2 - 1.2, 1 - lip - 0.03, 0), (ro + LIPH, H2 - 1.0, 1 - lip, 0), (ro + LIPH, H2, 1.0, 2), (ri, H2, 1.0, 1),
    ]


def ring(name, rc):
    """A solid ring about local +Z, centred on the origin, u round it and v across its outer face."""
    PROFILE = profile(rc)
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new()
    n = len(PROFILE)
    verts = []
    for s in range(SEG):
        a = 2 * math.pi * s / SEG
        verts.append([bm.verts.new((r * math.cos(a), r * math.sin(a), z)) for r, z, _, _ in PROFILE])
    for s in range(SEG):
        t = (s + 1) % SEG
        for k in range(n):
            j = (k + 1) % n
            f = bm.faces.new((verts[s][k], verts[t][k], verts[t][j], verts[s][j]))
            f.material_index = PROFILE[k][3]
            u0, u1 = s / SEG, (s + 1) / SEG
            v0, v1 = PROFILE[k][2], PROFILE[j][2]
            for loop, uv in zip(f.loops, ((u0, v0), (u1, v0), (u1, v1), (u0, v1))):
                loop[uvl].uv = uv
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons: p.use_smooth = False
    o = bpy.data.objects.new(name, me)
    for m in (BAND, INNER, RIM): o.data.materials.append(m)
    scene.collection.objects.link(o)
    return o


def axis(tilt, az, mirror):
    """The fit's axis, reflected through the plane facing the camera: a silhouette can't tell near from far, and the
    bought rings cross low in front of the crystal, which is this one of the two."""
    t, z = math.radians(tilt), math.radians(az)
    n = Vector((math.sin(t) * math.sin(z) * (-1 if mirror else 1), math.sin(t) * math.cos(z), math.cos(t)))
    view = Vector((0, -math.cos(math.radians(FIT['elev'])), math.sin(math.radians(FIT['elev']))))
    return (n - 2 * n.dot(view) * view).normalized()


rings = []
for k, mirror in enumerate((False, True)):
    o = ring('ring-' + 'AB'[k], RADII['AB'[k]])
    n = axis(FIT['tilt'], FIT['az'], mirror)
    base = n.to_track_quat('Z', 'Y').to_matrix().to_4x4()
    rings.append((o, base, -1 if mirror else 1))

# ---- the well's own camera: orthographic from the south, 33 degrees up; 1 unit = 1 art px --------------------------
cam = bpy.data.cameras.new('cam')
cam.type = 'ORTHO'
cam.ortho_scale = CANVAS_W
DIST = 200.0
cam.clip_start, cam.clip_end = 0.1, 400
cam_o = bpy.data.objects.new('cam', cam)
scene.collection.objects.link(cam_o)
ELEV = math.radians(FIT['elev'])
VIEW = Vector((0, -math.cos(ELEV), math.sin(ELEV)))
cam_o.location = VIEW * DIST
cam_o.rotation_euler = (-VIEW).to_track_quat('-Z', 'Y').to_euler()
# the ring centre lands on the art's (cx, cy) in a CANVAS_W x CANVAS_H frame
cam.shift_x = (CANVAS_W / 2 - FIT['cx']) / CANVAS_W
cam.shift_y = (FIT['cy'] - CANVAS_H / 2) / CANVAS_W
scene.camera = cam_o

# the crystal's light, warm, at the rings' centre; a sun from the upper left as the bought art is lit
glow = bpy.data.lights.new('crystal', 'POINT')
glow.color = (1.0, 0.62, 0.22)
glow.energy = 4e4
glow.shadow_soft_size = 3
glow_o = bpy.data.objects.new('crystal', glow)
glow_o.location = (0, 0, 2)
scene.collection.objects.link(glow_o)
sun = bpy.data.lights.new('sun', 'SUN')
sun.energy = 4.5
sun.angle = math.radians(10)
sun_o = bpy.data.objects.new('sun', sun)
scene.collection.objects.link(sun_o)
sun_o.rotation_euler = (Vector((0, 0, 0)) - Vector((-60, -80, 120))).to_track_quat('-Z', 'Y').to_euler()
world = bpy.data.worlds.new('world')
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (1, 0.9, 0.8, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.25
scene.world = world

r = scene.render
r.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 32
scene.cycles.use_denoising = False
r.film_transparent = True
r.resolution_x, r.resolution_y = CANVAS_W * SUPER, CANVAS_H * SUPER
r.resolution_percentage = 100
r.filter_size = 0.01
r.image_settings.file_format = 'PNG'
r.image_settings.color_mode = 'RGBA'
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'

# the dark lines the bought rings have: round each band's silhouette and along its lips, so a band reads as a thick ribbon
r.use_freestyle = True
r.line_thickness_mode = 'ABSOLUTE'
r.line_thickness = SUPER * 0.6
layer = scene.view_layers[0]
layer.use_freestyle = True
fs = layer.freestyle_settings
fs.crease_angle = math.radians(150)
ls = fs.linesets[0] if fs.linesets else fs.linesets.new('lines')
ls.select_silhouette = ls.select_border = True
ls.select_crease = False   # the lips are shading, not lines (the user: edges far too strong)
ls.select_edge_mark = False
ls.linestyle.color = (0.006, 0.004, 0.01)
ls.linestyle.thickness = 1.0


def pose(phase):
    """Phase 0..1 is one loop: each ring turned 1/REPEAT of a revolution about its own axis, A and B opposite ways."""
    for o, base, sgn in rings:
        o.matrix_world = base @ Matrix.Rotation(sgn * phase * 2 * math.pi / REPEAT, 4, 'Z')


def shoot(path):
    # behind the crystal, then in front of it: the camera's clipping split at the centre's depth
    cam.clip_start, cam.clip_end = DIST, 400
    r.filepath = os.path.join(path, 'back.png') if False else path + '-back.png'
    bpy.ops.render.render(write_still=True)
    cam.clip_start, cam.clip_end = 0.1, DIST
    r.filepath = path + '-front.png'
    bpy.ops.render.render(write_still=True)


os.makedirs(OUT, exist_ok=True)
frames = 1 if MODE == 'test' else int(round(2 * math.pi * RO / REPEAT))
for f in range(frames):
    pose(f / frames)
    bpy.context.view_layer.update()
    shoot(os.path.join(OUT, f'f{f:03d}'))
json.dump({'frames': frames, 'canvas': [CANVAS_W, CANVAS_H], 'super': SUPER}, open(os.path.join(OUT, 'info.json'), 'w'))
print('rendered', frames)
