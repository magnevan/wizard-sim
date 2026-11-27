"""A still of a model for the review page's pieces ledger: what Meshy sent back (or a fitted piece), at a 3/4 view.

  blender --background --python tools/place-review/model-shot.py -- <out.jpg> <in.glb> [<in2.glb> <out2.jpg> ...]
  (pairs after the first: in, out)

Models stay on disk (10 to 16 MB each, too big to publish); the page shows these stills and names the file.
Workbench with the model's own textures, a soft studio light, a pale ground: fast, and true to the colours.
"""
import sys, math, os
import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
pairs = [(argv[1], argv[0])] + [(argv[i], argv[i + 1]) for i in range(2, len(argv) - 1, 2)]
pairs = [(os.path.abspath(a), os.path.abspath(b)) for a, b in pairs]   # Blender reads a relative render path from the blend's folder


def shoot(src, dst):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)
    objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    lo = Vector((1e9, 1e9, 1e9)); hi = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
    mid = (lo + hi) / 2; size = max((hi - lo).length, 1e-3)
    sc = bpy.context.scene
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.lens = 50
    d = size * 1.55
    # the game camera looks down about 46 degrees; a quarter turn off the front shows two faces
    el, az = math.radians(38), math.radians(-35)
    cam.location = mid + Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el))) * d
    cam.rotation_euler = (mid - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.engine = 'BLENDER_WORKBENCH'
    sh = sc.display.shading
    sh.light = 'STUDIO'; sh.color_type = 'TEXTURE'; sh.show_shadows = True; sh.show_cavity = True
    sh.background_type = 'VIEWPORT'; sh.background_color = (0.93, 0.94, 0.91)
    sc.render.resolution_x, sc.render.resolution_y = 900, 675
    sc.render.film_transparent = False
    sc.render.image_settings.file_format = 'JPEG'; sc.render.image_settings.quality = 86
    sc.render.filepath = dst
    bpy.ops.render.render(write_still=True)
    print('wrote', dst)


for src, dst in pairs:
    shoot(src, dst)
