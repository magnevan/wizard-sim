"""The wizard arms review sheet (py -3.13 tools/sprites-3d/arms-sheet.py <renders dir> <out.jpg>): lay out the wizard-props renders: one row per weapon+guard pair, game-size frames (x4 nearest) in four facings,
then the same facings as the smooth 4x renders (downscaled to match), on a dirt-ish ground colour."""
import os, sys
from PIL import Image

W = sys.argv[1]; OUT = sys.argv[2]
PAIRS = ['sword-mirror', 'earthmaul-bulwark', 'focus-ember', 'icebow-rime', 'frostspear-spark', 'whip-tide', 'trident-prism', '--leaf']
DIRS = ['south', 'south-east', 'east', 'south-west', 'north-east']
K = 4
GROUND = (92, 78, 60, 255)
rows = []
for p in PAIRS:
    px = [Image.open(os.path.join(W, p + '-px', 'walking_man', d, 'f00.png')).convert('RGBA') for d in DIRS]
    w, h = px[0].size
    row = Image.new('RGBA', (len(DIRS) * w * K * 2, h * K), GROUND)
    for i, im in enumerate(px):
        row.alpha_composite(im.resize((w * K, h * K), Image.NEAREST), (i * w * K, 0))
        lit = Image.open(os.path.join(W, p, 'walking_man', DIRS[i], 'f00.png')).convert('RGBA').resize((w * K, h * K), Image.LANCZOS)
        row.alpha_composite(lit, ((len(DIRS) + i) * w * K, 0))
    rows.append(row)
sheet = Image.new('RGBA', (rows[0].width, sum(r.height for r in rows)), GROUND)
y = 0
for r in rows: sheet.alpha_composite(r, (0, y)); y += r.height
sheet.convert('RGB').save(OUT, quality=90)
print(sheet.size)
