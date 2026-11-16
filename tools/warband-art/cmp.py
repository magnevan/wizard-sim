import sys, os, json
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(__file__))
wt, out = sys.argv[1], sys.argv[2]
WB = os.path.join(wt, 'game/content/generated/pixellab/warband'); AS = os.path.join(wt, 'game/content/assets')
def r(c, d): return Image.open(os.path.join(WB, c, 'Idle/rotations', d + '.png')).convert('RGBA')
def h(c, d): return Image.open(os.path.join(WB, '_half', c, d + '.png')).convert('RGBA')
W, H = 330, 150
sc = Image.new('RGBA', (W, H))
g = Image.open(os.path.join(AS, 'ground', 'dirt.png')).convert('RGBA')
for y in range(0, H, 32):
    for x in range(0, W, 32): sc.alpha_composite(g, (x, y))
def place(im, fx, fy):
    bb = im.getbbox(); sc.alpha_composite(im, (int(fx - (bb[0] + bb[2]) / 2), int(fy - bb[3])))
dm = json.load(open(os.path.join(AS, 'props/dummy-mossy/meta.json')))['sets']['lean']
d = Image.open(os.path.join(AS, 'props/dummy-mossy/lean.png')).convert('RGBA')
sc.alpha_composite(d, (30 - dm['foot'][0], 135 - dm['foot'][1]))
for i, dr in enumerate(['south', 'south-west', 'west']): place(h('raider-hooded', dr), 75 + i * 22, 135)
for i, dr in enumerate(['south', 'south-west', 'west']): place(r('raider-hooded-40', dr), 160 + i * 30, 135)
place(r('chieftain', 'south-west'), 285, 140)
dr = ImageDraw.Draw(sc)
for x, t in [(8, 'dummy'), (70, 'halved'), (165, 'native 40px'), (255, 'chieftain')]: dr.text((x, 4), t, fill=(250, 240, 220, 255))
S = 4; sc.resize((W * S, H * S), Image.NEAREST).save(out)
