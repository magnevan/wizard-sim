"""Every goblin source in one lineup, a wizard at the left of each row for scale, on the game's dirt.
usage: python tools/warband-art/lineup.py <px-b-dir> <px-c-dir> <rigs-dir> <out.png>
  rigs-dir: game/scripts/rig-lineup.mjs output (the in-game rigs at 1x).
  px-b-dir / px-c-dir: pixelize.py output of the Codex front sheet / turnaround (see README)."""
import sys, os
from PIL import Image, ImageDraw
B, C, R, out = sys.argv[1:5]
WB = 'game/content/generated/pixellab/warband'
def rot(c, d='south'): return Image.open(os.path.join(WB, c, 'Idle/rotations', d + '.png')).convert('RGBA')
small = ['raider-goggles', 'raider-hooded', 'archer', 'shieldbearer', 'hooker']
def rig(k): return Image.open(os.path.join(R, k + '.png')).convert('RGBA')
wiz = rig('wizard')
rows = [
    ('IN THE GAME TODAY - code rigs: goblin, archer, brute', [rig('goblin'), rig('archer'), rig('brute')]),
    ('PixelLab, drawn at 32 px (round 2) + chieftain', [rot(c + '-32') for c in small] + [rot('chieftain')]),
    ('PixelLab, drawn at 64 px (round 1) - too big', [rot(c) for c in small]),
    ('Codex front sheet, converted to pixel art - lost', [Image.open(os.path.join(B, 'fig-%d.png' % i)).convert('RGBA') for i in range(5)]),
    ('Codex turnaround (south view), converted - second', [Image.open(os.path.join(C, 'fig-0.png')).convert('RGBA')]),
]
heights = [max(f.getbbox()[3] - f.getbbox()[1] for f in [wiz] + figs) for _, figs in rows]
PAD, LBL, W = 8, 12, 470
H = sum(h + PAD * 2 + LBL for h in heights)
sc = Image.new('RGBA', (W, H))
g = Image.open('game/content/assets/ground/dirt.png').convert('RGBA')
for y in range(0, H, 32):
    for x in range(0, W, 32): sc.alpha_composite(g, (x, y))
def place(im, fx, fy):
    bb = im.getbbox()
    sh = Image.new('RGBA', sc.size); d = ImageDraw.Draw(sh); w = (bb[2] - bb[0]) * 0.4
    d.ellipse((fx - w, fy - w * 0.3, fx + w, fy + w * 0.3), fill=(20, 16, 24, 80)); sc.alpha_composite(sh)
    sc.alpha_composite(im, (int(fx - (bb[0] + bb[2]) / 2), int(fy - bb[3])))
    return bb[2] - bb[0]
y, marks = 0, []
for (label, figs), h in zip(rows, heights):
    marks.append((y, label))
    base = y + LBL + PAD + h
    x = 20; place(wiz, x, base); x += 26
    for f in figs:
        w = f.getbbox()[2] - f.getbbox()[0]
        x += w // 2; place(f, x, base); x += w - w // 2 + 10
    y += h + PAD * 2 + LBL
S = 3
big = sc.resize((W * S, H * S), Image.NEAREST)
d = ImageDraw.Draw(big)
for yy, t in marks:
    d.rectangle((0, yy * S, 8 * len(t) + 24, yy * S + 26), fill=(20, 18, 24, 225)); d.text((10, yy * S + 7), t, fill=(250, 240, 220, 255))
big.save(out)
