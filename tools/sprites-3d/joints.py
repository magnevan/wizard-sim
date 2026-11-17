"""Draw a 0.1-unit grid and the skeleton over render.py --joints-view output, for fitting joints to an imported model.

  blender --background --python tools/sprites-3d/render.py -- <model.glb> <dir> --joints-view [--add=...]
  python tools/sprites-3d/joints.py <dir> rest|raw [model.joints.json]

Writes <dir>/joints-<pose>.png: the front view left, the side view right (the goblin faces left there). The skeleton is
drawn on "rest" only (yellow middle, blue left, red right). Read the joint positions off the grid into <model>.joints.json;
"rest" shows the model after its rest correction, so the arms should hang where the skeleton's do.
"""
import json, os, sys, types
from PIL import Image, ImageDraw

# rig.py needs Blender's modules only for its functions; the joint table loads without them
sys.modules['bpy'] = types.ModuleType('bpy')
mu = types.ModuleType('mathutils'); mu.Quaternion = mu.Vector = type('V', (tuple,), {'__neg__': lambda s: s}); sys.modules['mathutils'] = mu
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rig as R

d, pose = sys.argv[1], sys.argv[2]
jf = sys.argv[3] if len(sys.argv) > 3 else None
if jf and os.path.exists(jf): R.fit(json.load(open(jf)))


def px(x, z): return (256 + x / 3 * 512, 256 - (z - 1.05) / 3 * 512)


out = Image.new('RGBA', (1024, 512), (60, 50, 40, 255))
for k, (name, ax) in enumerate((('front', 0), ('side', 1))):
    im = Image.open(f'{d}/joints-{name}-{pose}.png'); bg = Image.new('RGBA', im.size, (60, 50, 40, 255)); bg.alpha_composite(im)
    g = ImageDraw.Draw(bg)
    for v in [i / 10 for i in range(-15, 16)]:
        x, _ = px(v, 0); major = round(v * 10) % 5 == 0
        g.line([(x, 0), (x, 512)], fill=(255, 255, 255, 200 if major else 90))
        if major: g.text((x + 1, 2), f'{v:.1f}', fill=(255, 255, 255))
    for v in [i / 10 for i in range(-5, 26)]:
        _, y = px(0, v); major = round(v * 10) % 5 == 0
        g.line([(0, y), (512, y)], fill=(255, 255, 255, 200 if major else 90))
        if major: g.text((2, y + 1), f'{v:.1f}', fill=(255, 255, 255))
    if pose == 'rest':
        for n, (h, t, p) in R.JOINTS.items():
            if n == 'root': continue
            a, b = px(h[ax], h[2]), px(t[ax], t[2])
            col = (255, 60, 60) if n.endswith('.R') else (60, 200, 255) if n.endswith('.L') else (255, 230, 0)
            g.line([a, b], fill=col, width=3); g.ellipse([a[0] - 3, a[1] - 3, a[0] + 3, a[1] + 3], fill=col)
    out.alpha_composite(bg, (k * 512, 0))
out.save(f'{d}/joints-{pose}.png')
print('wrote', f'{d}/joints-{pose}.png')
