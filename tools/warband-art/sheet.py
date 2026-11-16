import sys, os
# usage: python tools/warband-art/sheet.py <warband-dir> <out.png> [goblin,goblin,...] [scale]
from PIL import Image, ImageDraw
root = sys.argv[1]; out = sys.argv[2]
chars = sys.argv[3].split(',') if len(sys.argv) > 3 else ['raider-goggles', 'raider-hooded', 'archer', 'shieldbearer', 'hooker', 'chieftain']
dirs = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west']
S = int(sys.argv[4]) if len(sys.argv) > 4 else 2
CELL = max(Image.open(os.path.join(root, c, 'Idle', 'rotations', 'south.png')).width for c in chars)
sheet = Image.new('RGBA', (CELL * S * 8 + 20, (CELL * S + 10) * len(chars)), (196, 186, 170, 255))
for r, c in enumerate(chars):
    for i, d in enumerate(dirs):
        im = Image.open(os.path.join(root, c, 'Idle', 'rotations', d + '.png')).convert('RGBA')
        bb = im.getbbox()
        if i == 0: print(c, im.size, 'figure bbox', bb, 'h', bb[3] - bb[1], 'w', bb[2] - bb[0])
        big = im.resize((im.width * S, im.height * S), Image.NEAREST)
        x = 10 + i * CELL * S + (CELL * S - big.width) // 2
        y = r * (CELL * S + 10) + (CELL * S - big.height)
        sheet.alpha_composite(big, (x, y))
sheet.save(out)
