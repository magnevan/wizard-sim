"""python montage.py <inspect-dir> <out.png> [move ...]: lays render.py --inspect stills out as one sheet, a row per move
and direction, frames left to right."""
import os, re, sys
from PIL import Image, ImageDraw

src, out = sys.argv[1], sys.argv[2]
want = sys.argv[3:]
rows = {}
for f in sorted(os.listdir(src)):
    m = re.match(r'(.+)-(south|east)-f(\d+)\.png$', f)
    if m and (not want or m.group(1) in want): rows.setdefault((m.group(1), m.group(2)), []).append(f)
S = 256
sheet = Image.new('RGB', (S * max(len(v) for v in rows.values()) + 150, S * len(rows)), (40, 40, 48))
dr = ImageDraw.Draw(sheet)
for y, ((mv, d), fs) in enumerate(sorted(rows.items())):
    dr.text((4, y * S + 8), f'{mv}\n{d}', fill=(255, 255, 255))
    for x, f in enumerate(fs):
        im = Image.open(os.path.join(src, f)).convert('RGBA').resize((S, S))
        sheet.paste(im, (150 + x * S, y * S), im)
sheet.save(out)
print(out, sheet.size)
