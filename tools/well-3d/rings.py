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
REPEAT = 6    # the engraving's whole pattern repeats this often round the ring (band_texture.py): the spin loops after one
W = FIT['W']
# the bought rings aren't one size (the user): one passes just inside the other, a band's thickness apart, so they never
# meet. BIG says which: 'B' (the mirrored one) or 'A'.
GAP, BIG = 3.4, (ARGS[2] if len(ARGS) > 2 else 'A')   # a band's thickness and a little: they never meet
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
    uv = nt.nodes.new('ShaderNodeTexCoord')
    nt.links.new(uv.outputs['UV'], tex.inputs['Vector'])
    # two depths, two shades with a hard step (the user: the bought engraving reads as cut at two fixed depths)
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.interpolation = 'CONSTANT'
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (0.24, 0.16, 0.085, 1)
    ramp.color_ramp.elements[1].position = 0.6
    ramp.color_ramp.elements[1].color = (0.72, 0.53, 0.31, 1)
    nt.links.new(tex.outputs['Color'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 1.0
    bump.inputs['Distance'].default_value = 0.5
    nt.links.new(tex.outputs['Color'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    b.inputs['Roughness'].default_value = 0.3
    b.inputs['Metallic'].default_value = 0.85
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


# the outer face is plain metal here: its engraving is drawn pixel by pixel after the render (pixelize.py), since any
# pattern carved in 3D falls below a pixel at this size and reads as noise (the user, 2026-11-13)
BAND = plain('band', (0.6, 0.43, 0.25), rough=0.3, metal=0.85)


def where_material():
    """For the 'where' render: each pixel's place on the band, flat colour, no light. R and G are u round the ring (R
    coarse in 64ths, G the fine part), B is v across the face times 0.25 plus 0.6 times the face's kind (outer 1,
    inside 0.5, top and bottom 0), so the three never overlap: 0-0.25 top, 0.3-0.55 inside, 0.6-0.85 outer."""
    m = bpy.data.materials.new('where')
    m.use_nodes = True
    nt = m.node_tree
    for nd in list(nt.nodes):
        if nd.type != 'OUTPUT_MATERIAL': nt.nodes.remove(nd)
    out = next(nd for nd in nt.nodes if nd.type == 'OUTPUT_MATERIAL')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['UV'], sep.inputs['Vector'])
    att = nt.nodes.new('ShaderNodeAttribute')
    att.attribute_type = 'GEOMETRY'
    att.attribute_name = 'kind'

    def op(kind, a, b=None):
        n = nt.nodes.new('ShaderNodeMath')
        n.operation = kind
        for i, x in enumerate((a, b)):
            if x is None: continue
            if isinstance(x, (int, float)): n.inputs[i].default_value = x
            else: nt.links.new(x, n.inputs[i])
        return n.outputs['Value']
    u64 = op('MULTIPLY', sep.outputs['X'], 64.0)
    coarse = op('DIVIDE', op('FLOOR', u64), 64.0)
    fine = op('FRACT', u64)
    b = op('ADD', op('MULTIPLY', sep.outputs['Y'], 0.25), op('MULTIPLY', att.outputs['Fac'], 0.6))
    comb = nt.nodes.new('ShaderNodeCombineXYZ')
    nt.links.new(coarse, comb.inputs['X']); nt.links.new(fine, comb.inputs['Y']); nt.links.new(b, comb.inputs['Z'])
    em = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(comb.outputs['Vector'], em.inputs['Color'])
    nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
    return m


WHERE = where_material()
# the inside face: a plain middling brown, lit by the crystal so it's lightest near the middle and darker further out
INNER = plain('inner', (0.2, 0.12, 0.06), rough=0.35, metal=0.8)
# the band's top and bottom: plain and lighter than the inside, so the far arcs read as top vs inside (the user)
RIM = plain('rim', (0.8, 0.62, 0.4), rough=0.3, metal=0.8)

H2 = W / 2
THICK = 3.2     # the band's radial thickness; its corners are sharp right angles, as the bought bands read (the user)


def profile(rc):
    """The band's cross-section for a ring of mid radius rc, (radius, height along the axis, v across, material): a
    plain chamfered rectangle, so the top meets the face in a change of shade, not a line. The outer face (v 0 to 1)
    carries the engraving. Each entry's material is for the face from it to the next. A closed loop."""
    ro, ri = rc + THICK / 2, rc - THICK / 2
    return [(ri, -H2, 0.0, 2), (ro, -H2, 0.0, 0), (ro, H2, 1.0, 2), (ri, H2, 1.0, 1)]


def ring(name, rc):
    """A solid ring about local +Z, centred on the origin, u round it and v across its outer face."""
    PROFILE = profile(rc)
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new()
    kind = bm.faces.layers.float.new('kind')   # 1 on the outer face, which pixelize.py engraves
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
            f[kind] = {0: 1.0, 1: 0.5, 2: 0.0}[PROFILE[k][3]]   # outer face 1, inside 0.5, top and bottom 0
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
glow.energy = 3e4
glow.shadow_soft_size = 1
glow_o = bpy.data.objects.new('crystal', glow)
# toward the camera from the centre: a light at the centre is the same distance from every point of a ring round it, so
# the inside faces would be one flat shade; from here they're lightest near the middle, darker further out (the user)
glow_o.location = (0, -18, 8)
scene.collection.objects.link(glow_o)
sun = bpy.data.lights.new('sun', 'SUN')
sun.energy = 2.6
sun.angle = math.radians(10)
sun_o = bpy.data.objects.new('sun', sun)
scene.collection.objects.link(sun_o)
# the bought rings read as lit from about the camera (the user, 2026-11-13): the key light comes from just above and
# left of the view, so faces turned to the viewer are brightest
sun_o.rotation_euler = (-(VIEW + Vector((-0.3, 0, 0.35)))).to_track_quat('-Z', 'Y').to_euler()
# what the metal reflects: bright warm above, near black below, so a band's shade keeps changing as it curves (the
# user: the first light read flat next to the bought rings' many shade changes)
world = bpy.data.worlds.new('world')
world.use_nodes = True
wt = world.node_tree
coord = wt.nodes.new('ShaderNodeTexCoord')
sep = wt.nodes.new('ShaderNodeSeparateXYZ')
wt.links.new(coord.outputs['Generated'], sep.inputs['Vector'])
sky = wt.nodes.new('ShaderNodeValToRGB')
sky.color_ramp.elements[0].position = 0.3
sky.color_ramp.elements[0].color = (0.12, 0.09, 0.06, 1)
sky.color_ramp.elements[1].position = 0.85
sky.color_ramp.elements[1].color = (1.0, 0.86, 0.66, 1)
wt.links.new(sep.outputs['Z'], sky.inputs['Fac'])
wt.links.new(sky.outputs['Color'], wt.nodes['Background'].inputs['Color'])
wt.nodes['Background'].inputs['Strength'].default_value = 1.2
scene.world = world

r = scene.render
r.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 128
scene.cycles.use_denoising = True   # shiny metal is noisy, and noise snaps to speckle
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
r.line_thickness = SUPER * 0.9
layer = scene.view_layers[0]
layer.use_freestyle = True
fs = layer.freestyle_settings
fs.crease_angle = math.radians(150)
ls = fs.linesets[0] if fs.linesets else fs.linesets.new('lines')
# only where a band meets the background, another band or itself (the user): its silhouette. No crease lines (the top
# and the face meet in shade), no border lines (the meshes are closed).
ls.select_silhouette = True
ls.select_border = ls.select_crease = False
ls.select_edge_mark = False
ls.linestyle.color = (0.006, 0.004, 0.01)
ls.linestyle.thickness = 1.0


def pose(phase):
    """Phase 0..1 is one loop: each ring turned 1/REPEAT of a revolution about its own axis, A and B opposite ways."""
    for o, base, sgn in rings:
        o.matrix_world = base @ Matrix.Rotation(sgn * phase * 2 * math.pi / REPEAT, 4, 'Z')


def shoot(path):
    """The rings whole (full.png), then a mask of what's nearer than the crystal (mask.png: the camera clipped at the
    centre's depth, no lines, few samples). The split is made after the lines are drawn, so it leaves no seam (the
    user saw black lines where two separately rendered halves met)."""
    cam.clip_start, cam.clip_end = 0.1, 400
    r.use_freestyle = True
    scene.cycles.samples = 128
    scene.cycles.use_denoising = True
    r.filepath = path + '-full.png'
    bpy.ops.render.render(write_still=True)
    cam.clip_end = DIST
    r.use_freestyle = False
    scene.cycles.samples = 1
    scene.cycles.use_denoising = False   # the mask and the 'where' values must not be blended
    r.filepath = path + '-mask.png'
    bpy.ops.render.render(write_still=True)
    cam.clip_end = 400
    # where each pixel is on the band (where_material), raw colour, no filtering, for pixelize.py's engraving
    layer.material_override = WHERE
    scene.view_settings.view_transform = 'Raw'
    r.filepath = path + '-where.png'
    bpy.ops.render.render(write_still=True)
    layer.material_override = None
    scene.view_settings.view_transform = 'Standard'


os.makedirs(OUT, exist_ok=True)
if MODE == 'unwrap':
    # for unwrap.py: frame 0's 'where' with both rings, then with each alone, so each pixel of the bought rings can be
    # traced to a ring and a spot on its face
    pose(0)
    bpy.context.view_layer.update()
    shoot(os.path.join(OUT, 'f000'))
    for k, (o, _, _) in enumerate(rings):
        for j, (p, _, _) in enumerate(rings):
            p.hide_render = j != k
        layer.material_override = WHERE
        scene.view_settings.view_transform = 'Raw'
        r.use_freestyle = False
        scene.cycles.samples = 1
        scene.cycles.use_denoising = False
        r.filepath = os.path.join(OUT, f'f000-where-{"AB"[k]}.png')
        bpy.ops.render.render(write_still=True)
    print('rendered unwrap')
    sys.exit(0)
# one frame per column of the engraving (pixelize.py COLS = 240 a turn), so the pattern steps a column a frame
frames = 1 if MODE == 'test' else 240 // REPEAT
for f in range(frames):
    pose(f / frames)
    bpy.context.view_layer.update()
    shoot(os.path.join(OUT, f'f{f:03d}'))
json.dump({'frames': frames, 'canvas': [CANVAS_W, CANVAS_H], 'super': SUPER}, open(os.path.join(OUT, 'info.json'), 'w'))
print('rendered', frames)
