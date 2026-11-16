import sys, os
from PIL import Image, ImageDraw
root = sys.argv[1]; out = sys.argv[2]
chars = ['raider-goggles', 'raider-hooded', 'archer', 'shieldbearer', 'hooker', 'chieftain']
dirs = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west']
S = 2; CELL = 128
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
