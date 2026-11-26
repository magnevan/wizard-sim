"""Study sheets of Magicka 1's Fire effects (study only; nothing here ships or enters the repo).

python sheets.py <Effects dir> <atlas dir> <out dir>
One PNG per effect: a row per emitter with its numbers, the cell's raw flipbook frames on black, and the particle's
life at six moments, grown from its start to its end size and blended as the game does (additive or alpha), drawn
over our court's floor colour so the comparison is honest.
"""
import os
import sys
import xml.etree.ElementTree as ET
from PIL import Image, ImageDraw, ImageFont

FX, ATLAS, OUT = sys.argv[1:4]
EFFECTS = [
    ('Spray_Fire1', 'Spells/Spray/Spray_Fire1.xml', 'the Fire spray (ours: Flamethrower)'),
    ('Area_fire1_b', 'Spells/Area/Area_fire1_b.xml', 'the Fire area (ours: Fire ring)'),
    ('Area_ground_fire', 'Spells/Area/Area_ground_fire.xml', 'fire on the ground after an area (ours: Fire patch)'),
    ('Self_Fire', 'Spells/Self/Self_Fire.xml', 'Fire on yourself (ours: Burn)'),
    ('Fire_Blast', 'Spells/Fire_Blast.xml', 'Fire blast'),
    ('StatusEffect_Burning', 'StatusEffects/StatusEffect_Burning.xml', 'burning, level 1'),
    ('StatusEffect_Burning_2', 'StatusEffects/StatusEffect_Burning_2.xml', 'burning, level 2'),
    ('StatusEffect_Burning_3', 'StatusEffects/StatusEffect_Burning_3.xml', 'burning, level 3'),
]
FRAMES = {'A': 1, 'B': 4, 'C': 4, 'D': 8}
atlas = {k: Image.open(os.path.join(ATLAS, f'P{k}.png')).convert('RGBA') for k in 'ABCD'}
FLOOR = (226, 190, 142)     # the court's pale sandstone, roughly
CELL, PX = 32, 34            # atlas cell size; drawn px per Magicka size unit
try:
    font = ImageFont.truetype('consola.ttf', 13); big = ImageFont.truetype('segoeuib.ttf', 20)
except OSError:
    font = big = ImageFont.load_default()


def cell_frames(c):
    page = 'ABCD'[c // 64]; k = c % 64
    x, y = (k % 8) * CELL, (k // 8) * CELL
    return page, [atlas[page].crop((z * 256 + x, y, z * 256 + x + CELL, y + CELL)) for z in range(FRAMES[page])]


def val(e, name, d=None):
    for ch in e:
        if ch.tag.lower() == name.lower():
            v = ch.get('value', ch.get('Value'))
            if v is None:   # keyed over the effect's time: show the keys' range
                ks = [k.get('value') for k in ch if k.get('value') is not None]
                if ks:
                    lo, hi = min(map(float, ks)), max(map(float, ks))
                    return f'{lo:g}' if lo == hi else f'{lo:g}-{hi:g}'
            return v if v is not None else d
    return d


def num(e, name, d=0.0):
    try:
        return float(str(val(e, name, d)).split('-')[-1] if str(val(e, name, d)).count('-') == 1 and not str(val(e, name, d)).startswith('-') else val(e, name, d))
    except (TypeError, ValueError):
        return d


def blend(dst, sprite, x, y, additive, alpha):
    s = sprite.copy()
    r, g, b, a = s.split()
    a = a.point(lambda v: int(v * alpha))
    if additive:
        # additive: colour times its alpha added to what's under it
        rgb = Image.merge('RGB', (r, g, b))
        k = Image.merge('RGB', (a, a, a))
        from PIL import ImageChops
        add = ImageChops.multiply(rgb, k)
        box = (x, y, x + s.width, y + s.height)
        under = dst.crop(box).convert('RGB')
        dst.paste(ImageChops.add(under, add), box)
    else:
        s.putalpha(a); dst.alpha_composite(s, (x, y))


rows_out = []
for key, rel, what in EFFECTS:
    path = os.path.join(FX, rel)
    root = ET.parse(path).getroot()
    ems = [e for e in root if e.tag.endswith('Emitter')]
    W, top, rowh = 1500, 58, 150
    img = Image.new('RGBA', (W, top + rowh * len(ems) + 10), (24, 22, 20, 255))
    d = ImageDraw.Draw(img)
    d.text((14, 10), f'Magicka 1: {key}', fill=(240, 235, 228), font=big)
    d.text((14, 36), f'{what} · {root.get("type")} effect, {root.get("duration")} s · study only', fill=(170, 160, 150), font=font)
    for i, e in enumerate(ems):
        y0 = top + i * rowh
        d.line((10, y0, W - 10, y0), fill=(60, 55, 50))
        c = int(num(e, 'Particle', -1))
        add = (val(e, 'BlendMode', 'Additive') or '').lower() == 'additive'
        rate = val(e, 'ParticlesPerSecond'); n = val(e, 'NrOfParticles')
        l0, l1 = num(e, 'LifeTimeMin'), num(e, 'LifeTimeMax')
        s0 = (num(e, 'SizeStartMin') + num(e, 'SizeStartMax')) / 2
        s1 = (num(e, 'SizeEndMin') + num(e, 'SizeEndMax')) / 2
        a = (num(e, 'AlphaMin', 1) + num(e, 'AlphaMax', 1)) / 2 * (num(e, 'ColorAMin', 1) + num(e, 'ColorAMax', 1)) / 2
        col = tuple(int(255 * min(1, num(e, k, 1))) for k in ('ColorR', 'ColorG', 'ColorB'))
        page, fr = cell_frames(c) if c >= 0 else ('?', [])
        lines = [
            f'{i + 1}. {e.tag.replace("Emitter", "")}  {"additive" if add else "alpha"}  cell {c} ({page}, {len(fr)} frames)',
            f'{rate + "/s" if rate else (n or "?") + " at once"}   life {l0:g}-{l1:g} s',
            f'size {s0:g} -> {s1:g}  (x{(s1 / s0 if s0 else 0):.1f})   alpha {a:.2f}',
            f'speed {num(e, "VelocityMin"):g}-{num(e, "VelocityMax"):g}  gravity {num(e, "Gravity"):g}  drag {num(e, "Drag"):g}',
            f'spread {val(e, "SpreadType", "?")} cone {num(e, "SpreadConeAngle"):g}  arc {num(e, "SpreadArcHorizontalAngle"):g}',
            f'rotation {num(e, "RotationMin"):g}..{num(e, "RotationMax"):g}  spin {num(e, "RotationSpeedMin"):g}-{num(e, "RotationSpeedMax"):g}/s',
            f'tint rgb {col}  colorize {val(e, "Colorize", "?")}',
        ]
        for k, t in enumerate(lines):
            d.text((14, y0 + 8 + k * 18), t, fill=(225, 218, 208) if k == 0 else (175, 166, 156), font=font)
        # raw frames on black, at 2x
        x = 470
        d.text((x, y0 + 6), 'frames', fill=(140, 130, 120), font=font)
        for k, f in enumerate(fr):
            bg = Image.new('RGBA', (64, 64), (0, 0, 0, 255) if add else (120, 114, 106, 255))
            blend(bg, f.resize((64, 64), Image.LANCZOS), 0, 0, add, 1.0)
            img.paste(bg, (x + (k % 4) * 66, y0 + 24 + (k // 4) * 60 if len(fr) > 4 else y0 + 34))
        # its life over the floor: six moments, size lerped, frame by age
        x = 750
        d.text((x, y0 + 6), 'its life on our floor (0, 20, 40, 60, 80, 100 %)', fill=(140, 130, 120), font=font)
        for k in range(6):
            t = k / 5
            box = Image.new('RGBA', (120, 120), FLOOR + (255,))
            if fr:
                f = fr[min(len(fr) - 1, int(t * len(fr)))]
                if col != (255, 255, 255):
                    r, g, b, al = f.split()
                    f = Image.merge('RGBA', (r.point(lambda v: v * col[0] // 255), g.point(lambda v: v * col[1] // 255), b.point(lambda v: v * col[2] // 255), al))
                sz = max(2, min(118, int(PX * (s0 + (s1 - s0) * t))))
                blend(box, f.resize((sz, sz), Image.LANCZOS), (120 - sz) // 2, (120 - sz) // 2, add, a)
            img.paste(box, (x + k * 124, y0 + 24))
    out = os.path.join(OUT, f'm1-{key}.png')
    img.convert('RGB').save(out)
    rows_out.append(out)
print('\n'.join(rows_out))
