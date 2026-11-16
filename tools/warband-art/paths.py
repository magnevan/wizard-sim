"""Round 2 comparison: the small goblins from three paths, at game density, on dirt beside the dummy and the chieftain.
usage: python tools/warband-art/paths.py <px-b-dir> <px-c-dir> <out.png>
  px-b-dir: pixelize.py output of the Codex front sheet; px-c-dir: of the Codex turnaround."""
import sys, os, json
from PIL import Image, ImageDraw
B, C, out = sys.argv[1:4]
WB = 'game/content/generated/pixellab/warband'; AS = 'game/content/assets'
DIRS = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west']
def rot(c, d): return Image.open(os.path.join(WB, c, 'Idle/rotations', d + '.png')).convert('RGBA')
W, ROW = 420, 64
labels = ['A  PixelLab, drawn at 32 px', 'B  Codex front sheet, converted', 'C  Codex 8-way turnaround, converted', 'A  PixelLab 32 px, 8 directions']
sc = Image.new('RGBA', (W, ROW * 4 + 10))
g = Image.open(os.path.join(AS, 'ground', 'dirt.png')).convert('RGBA')
for y in range(0, sc.height, 32):
    for x in range(0, W, 32): sc.alpha_composite(g, (x, y))
def place(im, fx, fy):
    bb = im.getbbox(); sc.alpha_composite(im, (int(fx - (bb[0] + bb[2]) / 2), int(fy - bb[3])))
dm = json.load(open(os.path.join(AS, 'props/dummy-mossy/meta.json')))['sets']['lean']
dummy = Image.open(os.path.join(AS, 'props/dummy-mossy/lean.png')).convert('RGBA')
chief = rot('chieftain', 'south')
small = ['raider-goggles-32', 'raider-hooded-32', 'archer-32', 'shieldbearer-32', 'hooker-32']
rows = [
    [rot(c, 'south') for c in small],
    [Image.open(os.path.join(B, 'fig-%d.png' % i)).convert('RGBA') for i in range(5)],
    [Image.open(os.path.join(C, 'fig-%d.png' % i)).convert('RGBA') for i in (0, 1, 2, 3, 4, 5, 6, 7)],
    [rot('raider-hooded-32', d) for d in DIRS],
]
for r, figs in enumerate(rows):
    base = 12 + ROW * (r + 1) - 4
    sc.alpha_composite(dummy, (14 - dm['foot'][0] + 10, base - dm['foot'][1]))
    for i, f in enumerate(figs): place(f, 62 + i * 34, base)
place(chief, 370, 12 + ROW * 2 + 40)
S = 4
big = sc.resize((W * S, sc.height * S), Image.NEAREST)
d = ImageDraw.Draw(big)
for r, t in enumerate(labels):
    y = (12 + ROW * r) * S - 34
    d.rectangle((0, max(0, y), 560, max(0, y) + 30), fill=(20, 18, 24, 210)); d.text((10, max(0, y) + 8), t, fill=(250, 240, 220, 255))
big.save(out)
