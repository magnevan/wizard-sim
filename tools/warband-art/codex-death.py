"""The Codex death strip at game size: magenta keyed out, the whole sheet shrunk by its own pixel grid
(about 8.7 screen px per art px), snapped to a small palette; then shown on dirt beside the PixelLab sprite,
as a strip and a looping GIF.
usage: python tools/warband-art/codex-death.py <codex.png> <sprite.png> <out-strip.png> <out.gif> [grid]"""
import sys
from PIL import Image
src, sprite, out_strip, out_gif = sys.argv[1:5]
G = float(sys.argv[5]) if len(sys.argv) > 5 else 8.7

im = Image.open(src).convert('RGBA'); px = im.load()
for y in range(im.height):
    for x in range(im.width):
        r, g, b, a = px[x, y]
        if r > 170 and b > 170 and g < 110: px[x, y] = (0, 0, 0, 0)
w, h = round(im.width / G), round(im.height / G)
sm = im.resize((w, h), Image.BOX)
alpha = sm.split()[3].point(lambda v: 255 if v >= 140 else 0)
q = sm.convert('RGB').quantize(colors=64, method=Image.MAXCOVERAGE, dither=Image.NONE).convert('RGBA')
q.putalpha(alpha)
# Codex spaced the six frames evenly: cut six equal columns, then trim each
cw = q.width / 6
cells = [q.crop((round(i * cw), 0, round((i + 1) * cw), q.height)) for i in range(6)]
cells = [c.crop(c.getbbox()) for c in cells]
q = q.crop(q.getbbox())

spr = Image.open(sprite).convert('RGBA'); spr = spr.crop(spr.getbbox())
CW = max(c.width for c in cells + [spr]) + 6; CH = q.height + 8
def ground(wd):
    import random
    g = Image.new('RGBA', (wd, CH), (112, 86, 60, 255)); r = random.Random(1); gp = g.load()
    for _ in range(wd * CH // 14):
        x, y = r.randrange(wd), r.randrange(CH); gp[x, y] = (96, 74, 52, 255) if r.random() < 0.6 else (134, 106, 76, 255)
    return g
strip = ground(CW * (len(cells) + 1))
strip.alpha_composite(spr, ((CW - spr.width) // 2, CH - 4 - spr.height))
for i, c in enumerate(cells):
    strip.alpha_composite(c, ((i + 1) * CW + (CW - c.width) // 2, CH - 4 - c.height))
strip.resize((strip.width * 4, strip.height * 4), Image.NEAREST).save(out_strip)

gifs = []
for i, c in enumerate([None] + cells):
    f = ground(CW * 2)
    f.alpha_composite(spr, ((CW - spr.width) // 2, CH - 4 - spr.height))
    if c is not None: f.alpha_composite(c, (CW + (CW - c.width) // 2, CH - 4 - c.height))
    else: f.alpha_composite(spr, (CW + (CW - spr.width) // 2, CH - 4 - spr.height))
    gifs.append(f.resize((f.width * 4, f.height * 4), Image.NEAREST).convert('P', palette=Image.ADAPTIVE, colors=255))
durs = [500, 120, 120, 140, 400, 400, 500]
gifs[0].save(out_gif, save_all=True, append_images=gifs[1:], duration=durs[:len(gifs)], loop=0, disposal=2)
print('frames', len(cells), [c.size for c in cells], 'sprite', spr.size)
