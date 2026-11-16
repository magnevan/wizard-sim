"""Cut figures out of a Codex sprite sheet on magenta and turn each into true pixel art at game size.

usage: python tools/warband-art/pixelize.py <sheet.png> <out-dir> <target-height-px> [--rows N] [--colors K]

Each figure: magenta keyed out, cropped, downscaled to the target height (box filter on the
premultiplied colours), snapped to a K-colour palette shared by the sheet, alpha made hard,
and given a one-pixel dark outline. Figures are found as column runs within each row band.
"""
import sys, os
from PIL import Image

args = sys.argv[1:]
sheet, out, target = args[0], args[1], int(args[2])
rows = int(args[args.index('--rows') + 1]) if '--rows' in args else 1
K = int(args[args.index('--colors') + 1]) if '--colors' in args else 24
os.makedirs(out, exist_ok=True)

im = Image.open(sheet).convert('RGBA')
W, H = im.size
px = im.load()

def is_bg(p):
    r, g, b, a = p
    return a < 20 or (r > 170 and b > 170 and g < 110 and abs(r - b) < 90)

# key out the magenta, and the magenta-tinted fringe next to it
for y in range(H):
    for x in range(W):
        if is_bg(px[x, y]): px[x, y] = (0, 0, 0, 0)

def runs(mask, min_gap, min_len):
    out, start, gap = [], None, 0
    for i, v in enumerate(mask + [False] * (min_gap + 1)):
        if v:
            if start is None: start = i
            gap = 0; end = i
        elif start is not None:
            gap += 1
            if gap > min_gap:
                if end - start >= min_len: out.append((start, end + 1))
                start = None
    return out

row_mask = [any(px[x, y][3] for x in range(0, W, 2)) for y in range(H)]
bands = runs(row_mask, H // 40, H // 12)
if len(bands) != rows: print('warning: found', len(bands), 'row bands, expected', rows)

figs = []
for (y0, y1) in bands:
    col = [any(px[x, y][3] for y in range(y0, y1, 2)) for x in range(W)]
    for (x0, x1) in runs(col, W // 80, W // 40):
        crop = im.crop((x0, y0, x1, y1))
        bb = crop.getbbox()
        figs.append(crop.crop(bb))

# one palette for the whole sheet, from all figures together
hmax = max(f.height for f in figs)
small = []
for f in figs:
    h = max(4, round(target * f.height / hmax))
    w = max(2, round(f.width * h / f.height))
    s = f.resize((w, h), Image.BOX)
    small.append(s)
allpix = Image.new('RGB', (sum(s.width for s in small), max(s.height for s in small)))
x = 0
for s in small:
    rgb = Image.new('RGB', s.size, (0, 0, 0)); rgb.paste(s, mask=s.split()[3]); allpix.paste(rgb, (x, 0)); x += s.width
pal = allpix.quantize(colors=K, method=Image.MEDIANCUT)

for i, s in enumerate(small):
    a = s.split()[3].point(lambda v: 255 if v >= 128 else 0)
    rgb = Image.new('RGB', s.size); rgb.paste(s.convert('RGB'))
    q = rgb.quantize(palette=pal, dither=Image.NONE).convert('RGBA')
    q.putalpha(a)
    # pad by one and draw the outline round the silhouette
    o = Image.new('RGBA', (q.width + 2, q.height + 2)); o.alpha_composite(q, (1, 1))
    p = o.load(); src = [[p[x, y][3] for y in range(o.height)] for x in range(o.width)]
    for yy in range(o.height):
        for xx in range(o.width):
            if src[xx][yy]: continue
            if any(0 <= xx + dx < o.width and 0 <= yy + dy < o.height and src[xx + dx][yy + dy] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                p[xx, yy] = (24, 16, 22, 255)
    o.save(os.path.join(out, 'fig-%d.png' % i))
    print('fig-%d' % i, o.size)
