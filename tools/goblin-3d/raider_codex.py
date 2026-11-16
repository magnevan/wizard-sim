"""Low-poly goblin raider, built in world-space for the supplied rest skeleton.
Run with Blender 5.2 --background --python raider_codex.py.
"""
import bpy
import bmesh
from mathutils import Vector, Matrix


# Flat, deliberately broad colour areas survive a thirty-pixel render.
def material(name, colour):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*colour, 1.0)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*colour, 1.0)
    shader.inputs['Roughness'].default_value = 0.88
    return mat


skin = material('Raider olive skin', (0.36, 0.49, 0.065))
skin_light = material('Raider golden olive face', (0.53, 0.59, 0.12))
skin_dark = material('Raider shaded green', (0.23, 0.32, 0.035))
ear_inner = material('Raider ear interior', (0.49, 0.37, 0.12))
hood = material('Raider midnight blue', (0.075, 0.105, 0.20))
hood_light = material('Raider hood blue facets', (0.13, 0.18, 0.29))
hood_dark = material('Raider hood deep edge', (0.035, 0.05, 0.095))
leather = material('Raider chestnut leather', (0.30, 0.115, 0.038))
leather_light = material('Raider worn leather', (0.46, 0.23, 0.075))
leather_dark = material('Raider dark belt', (0.12, 0.055, 0.025))
wrap = material('Raider linen wraps', (0.65, 0.62, 0.47))
wrap_light = material('Raider linen edges', (0.82, 0.79, 0.63))
gold = material('Raider gold', (0.95, 0.59, 0.08))
steel = material('Raider light steel', (0.65, 0.75, 0.82))
steel_edge = material('Raider blade edge', (0.88, 0.93, 0.95))
eye = material('Raider ivory eyes', (0.94, 0.90, 0.67))
black = material('Raider near black', (0.015, 0.018, 0.012))
patch = material('Raider sack patch', (0.29, 0.32, 0.34))


# Every mesh is directly linked to the scene collection. No rig or scene setup.
def mesh(name, vertices, faces, materials, indices=None):
    data = bpy.data.meshes.new(name + '_mesh')
    data.from_pydata(vertices, [], faces)
    data.materials.clear()
    for mat in materials:
        data.materials.append(mat)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    if indices:
        for polygon, index in zip(data.polygons, indices):
            polygon.material_index = index
    # Recalculate normals for closed meshes and keep all facets flat.
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(data)
    bm.free()
    return obj


def ellipsoid(name, center, scale, mat, subdivisions=1):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdivisions, radius=1.0)
    transform = Matrix.Translation(Vector(center)) @ Matrix.Diagonal((*scale, 1.0))
    bmesh.ops.transform(bm, matrix=transform, verts=list(bm.verts))
    data = bpy.data.meshes.new(name + '_mesh')
    bm.to_mesh(data)
    bm.free()
    data.materials.append(mat)
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    return obj


circle = [(1, 0), (.7071, .7071), (0, 1), (-.7071, .7071),
          (-1, 0), (-.7071, -.7071), (0, -1), (.7071, -.7071)]


def rings(name, levels, materials, alternating=False):
    vertices = []
    for x, y, z, rx, ry in levels:
        vertices.extend((x + rx * a, y + ry * b, z) for a, b in circle)
    faces = [tuple(reversed(range(8)))]
    for j in range(len(levels) - 1):
        for i in range(8):
            faces.append((j*8+i, j*8+(i+1)%8, (j+1)*8+(i+1)%8, (j+1)*8+i))
    faces.append(tuple(range((len(levels)-1)*8, len(levels)*8)))
    indices = [0] * len(faces)
    if alternating:
        indices = [i % len(materials) for i in range(len(faces))]
    return mesh(name, vertices, faces, materials, indices)


def limb(name, start, end, radius_a, radius_b, mat):
    start, end = Vector(start), Vector(end)
    direction = (end-start).normalized()
    u = direction.cross(Vector((0, 1, 0))).normalized()
    v = direction.cross(u).normalized()
    vertices = []
    for center, radius in ((start, radius_a), (end, radius_b)):
        vertices.extend(tuple(center + radius*(a*u+b*v)) for a, b in circle)
    faces = [tuple(reversed(range(8))), tuple(range(8, 16))]
    faces.extend((i, (i+1)%8, (i+1)%8+8, i+8) for i in range(8))
    return mesh(name, vertices, faces, [mat])


def slab(name, outline, depth, mat, axis='Y', extra_material=None):
    # Outline contains world coordinates. Extrusion is centred on that outline.
    offset = Vector((0, depth/2, 0) if axis == 'Y' else (depth/2, 0, 0))
    vertices = [tuple(Vector(p)+sign*offset) for sign in (-1, 1) for p in outline]
    n = len(outline)
    faces = [tuple(reversed(range(n))), tuple(range(n, 2*n))]
    faces.extend((i, (i+1)%n, (i+1)%n+n, i+n) for i in range(n))
    mats = [mat] if extra_material is None else [mat, extra_material]
    indices = [0, 0] + [int(extra_material is not None)]*n
    return mesh(name, vertices, faces, mats, indices)


# Pelvis, tunic and broad contrasting leather panels.
rings('hips', [(0, 0, .69, .20, .135), (0, 0, .86, .235, .16)], [leather_dark])
rings('spine', [(0, 0, .83, .22, .15), (0, 0, 1.03, .235, .155),
                (0, 0, 1.18, .285, .16), (0, 0, 1.27, .17, .125)],
      [leather, leather_light], True)
# A continuous skirt with a visibly torn bottom outline.
vertices = []
hem = [.64, .70, .62, .68, .63, .70, .59, .68]
for i, (a, b) in enumerate(circle):
    vertices.append((.27*a, .18*b, hem[i]))
vertices.extend((.24*a, .16*b, .86) for a, b in circle)
mesh('hips_ragged_tunic', vertices,
     [(i, (i+1)%8, (i+1)%8+8, i+8) for i in range(8)],
     [leather, leather_light], [0, 1, 0, 0, 1, 0, 1, 0])
rings('hips_belt', [(0, 0, .80, .253, .174), (0, 0, .875, .25, .173)], [leather_dark])
slab('hips_buckle', [(-.053, -.183, .80), (.053, -.183, .80),
                     (.053, -.183, .88), (-.053, -.183, .88)], .018, gold)
slab('spine_tunic_patch', [(.08, -.164, .91), (.22, -.13, .93),
                           (.20, -.143, 1.065), (.075, -.17, 1.04)], .014, leather_light)
# Diagonal strap across the chest and its corresponding back section.
slab('spine_front_strap', [(-.21, -.138, 1.22), (-.145, -.171, 1.25),
                           (.22, -.159, .90), (.155, -.18, .87)], .023, leather_dark)
slab('spine_back_strap', [(-.21, .14, 1.22), (-.145, .17, 1.25),
                          (.22, .16, .91), (.155, .18, .88)], .025, leather_light)


for side, sign in (('L', 1), ('R', -1)):
    shoulder = (sign*.27, 0, 1.20)
    elbow = (sign*.40, 0, .96)
    wrist = (sign*.47, -.04, .72)
    fingertips = (sign*.50, -.06, .62)
    limb('upper_arm.'+side, shoulder, elbow, .10, .075, skin)
    limb('upper_arm.'+side+'_sleeve', shoulder,
         (sign*.315, 0, 1.12), .115, .105, leather)
    limb('forearm.'+side, elbow, wrist, .077, .068, wrap)
    # Individually offset bands leave strong stepped, cloth-wrapped silhouettes.
    for i in range(4):
        a = Vector(elbow).lerp(Vector(wrist), .06 + i*.23)
        b = Vector(elbow).lerp(Vector(wrist), .20 + i*.23)
        limb('forearm.'+side+'_band'+str(i), a, b, .085-i*.003,
             .083-i*.003, wrap_light if i % 2 == 0 else wrap)
    ellipsoid('hand.'+side, (sign*.49, -.055, .665), (.089, .082, .10), skin_light, 1)
    ellipsoid('hand.'+side+'_thumb', (sign*.438, -.10, .68), (.043, .05, .06), skin, 1)
    limb('thigh.'+side, (sign*.13, 0, .76), (sign*.15, 0, .42), .108, .084, hood_dark)
    limb('shin.'+side, (sign*.15, 0, .43), (sign*.15, .02, .09), .073, .061, skin)
    limb('shin.'+side+'_trouser_cuff', (sign*.15, 0, .46),
         (sign*.15, .005, .34), .09, .085, hood)
    # Flat soles exactly on the ground, broad toe blocks extending forward.
    x = sign*.15
    mesh('foot.'+side,
         [(x-.085, -.245, 0), (x+.085, -.245, 0), (x+.078, .075, 0), (x-.078, .075, 0),
          (x-.085, -.23, .085), (x+.085, -.23, .085),
          (x+.06, .055, .15), (x-.06, .055, .15)],
         [(0, 3, 2, 1), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6),
          (3, 0, 4, 7), (4, 5, 6, 7)], [skin_light])


# Oversized head and angular projecting face.
ellipsoid('head', (0, -.025, 1.58), (.292, .228, .315), skin, 2)
ellipsoid('head_cheeks', (0, -.196, 1.48), (.232, .112, .142), skin_light, 1)
ellipsoid('head_chin', (0, -.17, 1.375), (.14, .115, .075), skin, 1)
for side, sign in (('L', 1), ('R', -1)):
    # Long wedge ears emerge through the hood sides.
    slab('head_ear_'+side,
         [(sign*.25, .005, 1.71), (sign*.62, .015, 1.78),
          (sign*.48, -.015, 1.59), (sign*.29, -.035, 1.55)], .09, skin_light)
    slab('head_ear_inner_'+side,
         [(sign*.32, -.054, 1.685), (sign*.555, -.038, 1.747),
          (sign*.458, -.060, 1.637)], .007, ear_inner)
    # Dark socket surrounds the narrow pale eye and large black pupil.
    slab('head_socket_'+side,
         [(sign*.055, -.244, 1.61), (sign*.219, -.216, 1.625),
          (sign*.211, -.222, 1.704), (sign*.063, -.25, 1.69)], .018, skin_dark)
    slab('head_eye_'+side,
         [(sign*.066, -.259, 1.626), (sign*.201, -.237, 1.637),
          (sign*.197, -.238, 1.681), (sign*.067, -.259, 1.665)], .014, eye)
    slab('head_pupil_'+side,
         [(sign*.10, -.272, 1.63), (sign*.145, -.265, 1.634),
          (sign*.145, -.265, 1.678), (sign*.10, -.272, 1.675)], .012, black)
    slab('head_brow_'+side,
         [(sign*.043, -.274, 1.667), (sign*.22, -.239, 1.70),
          (sign*.22, -.232, 1.745), (sign*.055, -.263, 1.716)], .03, skin)
mesh('head_nose', [(-.062, -.251, 1.68), (.062, -.251, 1.68),
                   (-.085, -.335, 1.525), (.085, -.335, 1.525),
                   (0, -.405, 1.515), (0, -.28, 1.47)],
     [(0, 1, 3, 4, 2), (0, 2, 5), (1, 5, 3), (2, 4, 5), (3, 5, 4), (0, 5, 1)],
     [skin_light, skin], [0, 1, 1, 1, 0, 1])
slab('head_mouth', [(-.116, -.294, 1.437), (.116, -.294, 1.437),
                    (.10, -.295, 1.419), (-.09, -.295, 1.415)], .008, leather_dark)


# A hollow hood opening frames the face. The rear closes with faceted rings.
outer = [(-.34, 1.31), (-.355, 1.53), (-.34, 1.78), (-.24, 1.925),
         (-.075, 2.0), (.075, 2.0), (.24, 1.925), (.34, 1.78),
         (.355, 1.53), (.34, 1.31), (0, 1.275)]
inner = [(-.22, 1.38), (-.253, 1.53), (-.245, 1.73), (-.16, 1.80),
         (-.06, 1.82), (.06, 1.82), (.16, 1.80), (.245, 1.73),
         (.253, 1.53), (.22, 1.38), (0, 1.34)]
n = len(outer)
vertices = [(x, -.23, z) for x, z in outer]
vertices += [(x, -.245, z) for x, z in inner]
vertices += [(x*.94, .14, 1.62+(z-1.62)*.97) for x, z in outer]
vertices += [(x*.66, .285, 1.62+(z-1.62)*.76) for x, z in outer]
vertices.append((0, .315, 1.64))
faces, indices = [], []
for i in range(n):
    j = (i+1) % n
    faces.extend([(i, j, n+j, n+i), (i, 2*n+i, 2*n+j, j),
                  (2*n+i, 3*n+i, 3*n+j, 2*n+j), (3*n+i, 4*n, 3*n+j)])
    indices.extend([2 if i in (0, 8, 9, 10) else 0,
                    1 if i in (2, 3, 4, 5) else 0, i % 2, 0])
mesh('head_hood', vertices, faces, [hood, hood_light, hood_dark], indices)
# Jagged shoulder-length hood tails.
for sign in (-1, 1):
    slab('head_hood_tail_'+str(sign),
         [(sign*.23, -.18, 1.47), (sign*.30, -.16, 1.43),
          (sign*.38, -.13, 1.28), (sign*.27, -.21, 1.31),
          (sign*.21, -.22, 1.28)], .065, hood)
# Small four-point stitched gold star, centred high on the hood front.
star_points = [(0, .065), (.018, .019), (.062, 0), (.018, -.017),
               (0, -.056), (-.018, -.017), (-.062, 0), (-.018, .019)]
slab('head_gold_star', [(x, -.248, 1.883+z) for x, z in star_points], .016, gold)


# Lumpy loot bag on the back, tied above the rounded body.
rings('sack', [(0, .29, .88, .12, .10), (-.025, .335, .98, .23, .17),
               (.015, .35, 1.18, .255, .19), (-.02, .32, 1.36, .19, .14),
               (.025, .29, 1.44, .07, .065)], [leather, leather_light], True)
limb('sack_tie', (.025, .29, 1.415), (.025, .29, 1.465), .08, .08, leather_dark)
ellipsoid('sack_tied_top', (.025, .29, 1.51), (.11, .09, .085), leather_light, 1)
slab('sack_patch', [(-.105, .536, 1.045), (.055, .542, 1.035),
                    (.09, .54, 1.20), (-.07, .538, 1.235)], .014, patch)
for z in (1.07, 1.17):
    limb('sack_patch_stitch_'+str(z), (-.116, .549, z), (-.067, .55, z+.008),
         .009, .009, wrap)
# A side patch stays visible in three-quarter views.
slab('sack_side_patch', [(.233, .30, 1.09), (.233, .41, 1.10),
                         (.224, .42, 1.21), (.227, .30, 1.22)], .012, leather_dark, 'X')


# Right-hand curved cleaver, broad flat side in the YZ plane.
limb('blade_grip', (-.495, -.045, .70), (-.52, -.16, .575), .034, .033, leather_dark)
ellipsoid('blade_pommel', (-.493, -.035, .711), (.044, .038, .033), steel, 1)
limb('blade_guard', (-.52, -.215, .62), (-.52, -.105, .525), .025, .025, steel)
outline_yz = [(-.157, .575), (-.245, .52), (-.285, .535),
              (-.31, .475), (-.383, .45), (-.445, .47),
              (-.50, .53), (-.495, .40), (-.435, .355),
              (-.35, .35), (-.265, .39), (-.195, .465)]
slab('blade', [(-.535, y, z) for y, z in outline_yz], .035, steel, 'X', steel_edge)
# Pale edge ribbon follows the curved cutting edge on each flat side.
for x in (-.554, -.516):
    mesh('blade_edge_'+str(x),
         [(x, -.495, .40), (x, -.435, .355), (x, -.35, .35), (x, -.265, .39),
          (x, -.195, .465), (x, -.265, .415), (x, -.35, .375),
          (x, -.432, .38), (x, -.49, .425)],
         [(0, 1, 7, 8), (1, 2, 6, 7), (2, 3, 5, 6), (3, 4, 5)], [steel_edge])
