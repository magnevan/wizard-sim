"""Side by side, at k times: the bought well top, and the same top with the 3D rings (frame f) in place of the bought ones.

  python tools/well-3d/compare.py <rings_dir> <out.png> [frame] [k]

<rings_dir> is pixelize.py's output. The 3D well is the drum layer, the back rings, the crystal, the front rings.
"""
import json, os, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
WELL = os.path.join(HERE, '../../game/content/assets/well')
src, out = sys.argv[1], sys.argv[2]
f = int(sys.argv[3]) if len(sys.argv) > 3 else 0
k = int(sys.argv[4]) if len(sys.argv) > 4 else 5
info = json.load(open(os.path.join(src, 'rings.json')))
cw, ch = info['cell']
lay = lambda n: Image.open(os.path.join(WELL, n)).convert('RGBA')
drum, crystal, rings = lay('drum.png'), lay('crystal.png'), lay('rings.png')
cell = lambda p: Image.open(os.path.join(src, p)).convert('RGBA').crop((f * cw, 0, (f + 1) * cw, ch))
W, H = drum.size
H = 96
bg = (40, 40, 48, 255)
a = Image.new('RGBA', (W, H), bg)
for im in (drum, rings, crystal):
    a.alpha_composite(im.crop((0, 0, W, H)))
b = Image.new('RGBA', (W, H), bg)
b.alpha_composite(drum.crop((0, 0, W, H)))
b.alpha_composite(cell('back.png'), (0, 0))
b.alpha_composite(crystal.crop((0, 0, W, H)))
b.alpha_composite(cell('front.png'), (0, 0))
pair = Image.new('RGBA', (W * 2 + 6, H), (0, 0, 0, 255))
pair.paste(a, (0, 0)); pair.paste(b, (W + 6, 0))
pair.resize((pair.width * k, pair.height * k), Image.NEAREST).save(out)
print('compare', out)
