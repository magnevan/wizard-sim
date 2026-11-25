"""tess_compare.py out.jpg label=path label=path ...: the same two regions of each tess_proof still, side by side, labelled."""
import sys
from PIL import Image, ImageDraw, ImageFont
out, items = sys.argv[1], [a.split('=', 1) for a in sys.argv[2:]]
REG = [('left pavement', (40, 60, 720, 620)), ('bottom right', (1180, 440, 1920, 1050))]
W = 1900 // len(items); font = ImageFont.truetype('arial.ttf', 30)
rows = []
for name, (x0, y0, x1, y1) in REG:
    h = int(W * (y1 - y0) / (x1 - x0)); row = Image.new('RGB', (W * len(items) + 10 * (len(items) - 1), h + 44), (24, 24, 28))
    for k, (label, path) in enumerate(items):
        row.paste(Image.open(path).convert('RGB').crop((x0, y0, x1, y1)).resize((W, h), Image.LANCZOS), (k * (W + 10), 44))
        ImageDraw.Draw(row).text((k * (W + 10) + 8, 6), f'{label}: {name}', fill=(240, 240, 240), font=font)
    rows.append(row)
im = Image.new('RGB', (rows[0].width, sum(r.height for r in rows) + 10), (24, 24, 28)); y = 0
for r in rows: im.paste(r, (0, y)); y += r.height + 10
im.save(out, quality=90); print(out, im.size)
