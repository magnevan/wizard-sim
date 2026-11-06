"""Puts each art source's props on the game's real floor beside a real wizard, one strip per source.

  python tools/art-trial/compose.py <1x screenshot.png>

Writes out/strip-<source>.png at 3x, and out/prop-<source>-<name>.png at 4x for the close-ups.
"""
import os, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
NAMES = ['lectern', 'bookshelf', 'target', 'circle', 'teacher']


def trim(im):
    box = im.getbbox()
    return im.crop(box) if box else im


def load(fmt):
    return [trim(Image.open(os.path.join(OUT, fmt.format(n=n, i=i))).convert('RGBA')) for i, n in enumerate(NAMES)]


def code_props():
    sheet = Image.open(os.path.join(OUT, 'code-sheet.png')).convert('RGBA')
    d = sheet.load()
    for y in range(sheet.height):
        for x in range(sheet.width):
            if d[x, y][:3] == (255, 0, 255): d[x, y] = (0, 0, 0, 0)
    props, at = [], 3
    for w, h in [(26, 34), (40, 48), (30, 36), (54, 30), (24, 34)]:
        props.append(trim(sheet.crop((at, 52 - h, at + w, 52)))); at += w + 6
    return props


SOURCES = {
    'code': code_props(),
    'pixellab': load('pl-obj-{i}.png'),
    'pixflux': load('pf-{n}.png'),
    'gemini-pro': load('gp-{n}.png'),
    'gemini-flash': load('gf-{n}.png'),
}

shot = Image.open(sys.argv[1]).convert('RGBA')
FLOOR = (305, 226, 665, 292)
wizard = shot.crop((330, 158, 362, 202))  # the blue wizard, on its own patch of floor


def shadow(strip, cx, by, w):
    s = strip.load()
    for y in range(by - 3, by + 3):
        for x in range(cx - w // 2, cx + w // 2):
            if 0 <= x < strip.width and 0 <= y < strip.height:
                dx, dy = (x - cx) / (w / 2), (y - by) / 3
                if dx * dx + dy * dy < 1 and (x + y) % 2 == 0:
                    r, g, b, a = s[x, y]
                    s[x, y] = (r // 2, g // 2, b // 2, a)


for name, props in SOURCES.items():
    strip = shot.crop(FLOOR)
    strip.paste(wizard.crop((0, 0, 32, 44)), (6, 16))
    x = 46
    for n, p in zip(NAMES, props):
        by = strip.height - 6 if n != 'circle' else strip.height - 12
        if n != 'circle': shadow(strip, x + p.width // 2, by, p.width)
        strip.paste(p, (x, by - p.height), p)
        x += p.width + 12
        p.resize((p.width * 4, p.height * 4), Image.NEAREST).save(os.path.join(OUT, f'prop-{name}-{n}.png'))
    strip.resize((strip.width * 3, strip.height * 3), Image.NEAREST).save(os.path.join(OUT, f'strip-{name}.png'))
    print(name, [p.size for p in props])
