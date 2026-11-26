"""Our Fire parts sheet beside Magicka 1's cells, row by row (study only).
python compare.py <our parts-sheet.png> <atlas dir> <out.png>"""
import os
import sys
from PIL import Image, ImageDraw, ImageFont

ours_p, ATLAS, out = sys.argv[1:4]
FRAMES = {'A': 1, 'B': 4, 'C': 4, 'D': 8}
atlas = {k: Image.open(os.path.join(ATLAS, f'P{k}.png')).convert('RGBA') for k in 'ABCD'}


def frames(c):
    page = 'ABCD'[c // 64]; k = c % 64; x, y = (k % 8) * 32, (k // 8) * 32
    return [atlas[page].crop((z * 256 + x, y, z * 256 + x + 32, y + 32)) for z in range(FRAMES[page])]


# our row, the Magicka cell doing that job (or None), and what Magicka does with it
ROWS = [
    ('1 burn-out puff', 196, 'Flame puff, 8 frames. Grows x2 to x3 over its life; the fade is in the frames, alpha stays ~1. Random rotation, slow spin.'),
    ('2 hollow ring flame', 158, 'No hollow ring. Closest: a curled wisp (4 frames) in burning bodies, barely growing (x1.1), 20/s.'),
    ('3 ground lick', 142, 'A leaning wisp too (4 frames). Rotation random: +-180 in the ring, +-20 on burning bodies, so it reads upright there. Upward lapping comes from motion (rising, respawned), not the drawing.'),
    ('4 smoke', 65, 'One smoke cell (4 frames), alpha-blended. Variety from random rotation and spin only; grows x1.2 to x2.5.'),
    ('5 ash / ember', 14, 'A single still spark, tinted per effect (colorize), shrinking x0.2 to x0.4 while it falls; up to 3.5 s.'),
    ('6 wave front', None, 'No wave sprite. The area flings a handful of big puffs (6), wisps (10) and sparks (12) outward; the ring is their motion.'),
    ('7 scorch', 154, 'Ground fire: a crackle cell (4 frames, 0.5-1 s) re-spawned 10/s and growing x3.2, over a soft glow (167). The scorch itself is a decal, not a particle.'),
]
ours = Image.open(ours_p).convert('RGB')
oh = ours.height / 7
W, rh = 1700, 190
img = Image.new('RGB', (W, 64 + rh * len(ROWS)), (24, 22, 20))
d = ImageDraw.Draw(img)
try:
    f = ImageFont.truetype('segoeui.ttf', 15); fb = ImageFont.truetype('segoeuib.ttf', 20); fs = ImageFont.truetype('segoeuib.ttf', 15)
except OSError:
    f = fb = fs = ImageFont.load_default()
d.text((14, 12), 'Our Fire parts (Codex) beside Magicka 1\'s cells', fill=(240, 235, 228), font=fb)
d.text((14, 38), 'left: our parts sheet row  ·  middle: Magicka\'s cell, all frames  ·  right: how Magicka uses it (study only)', fill=(170, 160, 150), font=f)
for i, (name, cell, note) in enumerate(ROWS):
    y = 64 + i * rh
    d.line((10, y, W - 10, y), fill=(60, 55, 50))
    cy = 115 + i * 171
    row = ours.crop((70, cy - 80, ours.width - 70, cy + 80))
    row = row.resize((620, int(620 * row.height / row.width)))
    d.text((14, y + 6), 'ours: ' + name, fill=(230, 222, 212), font=fs)
    img.paste(row, (14, y + 28))
    x0 = 14 + row.width + 24
    d.text((x0, y + 6), f'Magicka cell {cell}' if cell is not None else 'Magicka: none', fill=(230, 222, 212), font=fs)
    if cell is not None:
        for k, fr in enumerate(frames(cell)):
            bg = Image.new('RGBA', (72, 72), (120, 114, 106, 255) if cell == 65 else (0, 0, 0, 255)); bg.alpha_composite(fr.resize((72, 72), Image.LANCZOS))
            img.paste(bg.convert('RGB'), (x0 + (k % 8) * 76, y + 30 + (k // 8) * 76))
    tx = x0 + 8 * 76 + 10
    words, line, ly = note.split(), '', y + 30
    for w_ in words:
        if d.textlength(line + ' ' + w_, font=f) > W - tx - 14:
            d.text((tx, ly), line.strip(), fill=(200, 192, 182), font=f); ly += 21; line = ''
        line += ' ' + w_
    d.text((tx, ly), line.strip(), fill=(200, 192, 182), font=f)
img.save(out)
print('wrote', out)
