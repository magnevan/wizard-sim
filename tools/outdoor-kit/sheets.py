"""The page's contact sheets: every raw object on the game's grass, numbered as in the library.

  python tools/outdoor-kit/sheets.py
"""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, '../../game/content/generated/pixellab/outdoor')


def sheet(name, n, cols, cell, z):
    rows = (n + cols - 1) // cols
    im = Image.new('RGBA', (cols * cell * z, rows * cell * z), (0x3f, 0x64, 0x43, 255))
    d = ImageDraw.Draw(im)
    for i in range(n):
        s = Image.open(f'{RAW}/{name}/{i:02d}.png').convert('RGBA').resize((cell * z, cell * z), Image.NEAREST)
        x, y = (i % cols) * cell * z, (i // cols) * cell * z
        im.alpha_composite(s, (x, y)); d.text((x + 2, y + 1), str(i), fill=(255, 255, 255, 255))
    im.convert('RGB').save(os.path.join(HERE, 'img', f'sheet-{name}.png'), optimize=True)


sheet('scatter', 64, 11, 32, 4)
sheet('yard', 16, 8, 48, 3)
sheet('rural', 16, 8, 48, 3)
