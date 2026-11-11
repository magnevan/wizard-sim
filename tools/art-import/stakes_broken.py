"""The battery's stakes, broken: a free local edit of the bought stakes (no generation calls).

  python tools/art-import/stakes_broken.py

The line is split in two at the middle, each half knocked over (tipped away from the other and flattened toward the
ground), with a gap where it broke and a few splinters. Writes game/content/assets/props/stakes-broken/ with the same
foot as the stakes, so the client can swap one for the other in place (art/props.ts).
"""
import json, os, random
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '../../game/content/assets/props/stakes')
OUT = os.path.join(HERE, '../../game/content/assets/props/stakes-broken')
rng = random.Random(41)

im = Image.open(os.path.join(SRC, 'lean.png')).convert('RGBA')
meta = json.load(open(os.path.join(SRC, 'meta.json'), encoding='utf-8'))
fx, fy = meta['sets']['lean']['foot']
W, H = im.size
mid = W // 2
pad = 8
canvas = Image.new('RGBA', (W + pad * 2, H + pad), (0, 0, 0, 0))


def knocked(part, angle, squash):
    """Tip a half over and flatten it toward the ground, nearest-neighbour so it stays pixel art."""
    p = part.rotate(angle, resample=Image.NEAREST, expand=True)
    return p.resize((p.width, max(1, round(p.height * squash))), Image.NEAREST)


left = knocked(im.crop((0, 0, mid - 1, H)), 24, 0.55)
right = knocked(im.crop((mid + 2, 0, W, H)), -20, 0.6)
# each half lies where it stood, bottoms on the ground line, pushed a little apart
canvas.alpha_composite(left, (pad - 6, pad + H - left.height))
canvas.alpha_composite(right, (pad + mid + 8, pad + H - right.height))

# splinters in the gap: a few pixels of the stakes' own browns
browns = sorted({im.getpixel((x, y))[:3] for x in range(W) for y in range(H) if im.getpixel((x, y))[3] > 200}, key=sum)
browns = browns[len(browns) // 4: 3 * len(browns) // 4] or browns
for _ in range(14):
    x = pad + mid + rng.randint(-5, 6)
    y = pad + H - 1 - rng.randint(0, 6)
    c = rng.choice(browns)
    canvas.putpixel((x, y), (*c, 255))
    if rng.random() < 0.4 and x + 1 < canvas.width:
        canvas.putpixel((x + 1, y), (*c, 255))

box = canvas.getbbox()
out = canvas.crop(box)
os.makedirs(OUT, exist_ok=True)
out.save(os.path.join(OUT, 'lean.png'))
# the same foot as the stakes, moved by the padding and the crop
meta['id'] = 'stakes-broken'
meta['name'] = 'Sharpened stakes, broken'
meta['sets']['lean']['foot'] = [fx + pad - box[0], fy + pad - box[1]]
meta['sets']['lean']['edits'] = 'tools/art-import/stakes_broken.py: split, knocked over and flattened, splinters added'
json.dump(meta, open(os.path.join(OUT, 'meta.json'), 'w', encoding='utf-8'), indent=2)
print('stakes-broken', out.size, meta['sets']['lean']['foot'])
