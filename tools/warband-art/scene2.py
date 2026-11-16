"""The fight if the game doubled its pixel density: two PixelLab wizards (60 px) against the round 2 goblins
(32 px) and the chieftain, with bought props, everything 1:1 on the game's ground tiles.
usage: python tools/warband-art/scene2.py <out.png>   (from the repo root)"""
import sys, os, json
from PIL import Image, ImageDraw
out = sys.argv[1]
WB = 'game/content/generated/pixellab/warband'; AS = 'game/content/assets'
def rot(c, d): return Image.open(os.path.join(WB, c, 'Idle/rotations', d + '.png')).convert('RGBA')
W, H = 480, 270
sc = Image.new('RGBA', (W, H))
grass, dirt = [Image.open(os.path.join(AS, 'ground', f)).convert('RGBA') for f in ('grass.png', 'dirt.png')]
for y in range(0, H, 32):
    for x in range(0, W, 32):
        sc.alpha_composite(dirt if abs((x - W * 0.5) + (y - H * 0.5) * 0.9) < 120 else grass, (x, y))
def place(im, fx, fy):
    bb = im.getbbox()
    sh = Image.new('RGBA', sc.size); d = ImageDraw.Draw(sh); w = (bb[2] - bb[0]) * 0.38
    d.ellipse((fx - w, fy - w * 0.3, fx + w, fy + w * 0.3), fill=(20, 16, 24, 85)); sc.alpha_composite(sh)
    sc.alpha_composite(im, (int(fx - (bb[0] + bb[2]) / 2), int(fy - bb[3])))
def prop(name, fx, fy):
    m = json.load(open(os.path.join(AS, 'props', name, 'meta.json')))['sets']['lean']
    sc.alpha_composite(Image.open(os.path.join(AS, 'props', name, m['file'])).convert('RGBA'), (fx - m['foot'][0], fy - m['foot'][1]))
things = [
    ('p', 'crates', 60, 70), ('p', 'bush-round', 430, 245), ('p', 'mossy-small-rock', 250, 150), ('p', 'banner-frayed', 400, 60),
    ('wizard', 'north-east', 95, 225), ('wizard', 'east', 150, 250),
    ('chieftain', 'south-west', 375, 175),
    ('raider-goggles-32', 'south-west', 230, 130), ('raider-hooded-32', 'west', 205, 175), ('raider-goggles-32', 'west', 255, 195),
    ('shieldbearer-32', 'south-west', 285, 150), ('shieldbearer-32', 'west', 300, 215),
    ('archer-32', 'south-west', 340, 95), ('hooker-32', 'south-west', 320, 125), ('raider-hooded-32', 'south-west', 180, 120),
]
things.sort(key=lambda t: t[3])
for t in things:
    if t[0] == 'p': prop(t[1], t[2], t[3])
    else: place(rot(t[0], t[1]), t[2], t[3])
sc.resize((W * 3, H * 3), Image.NEAREST).save(out)
