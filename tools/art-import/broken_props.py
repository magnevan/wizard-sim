"""Broken versions of the battery's field works: free local edits of bought props (no generation calls).

  python tools/art-import/broken_props.py

The user, 2026-11-12: the ground outside the wall should feel like a battlefield, with temporary fortifications that
have been smashed. Each prop is cut into pieces across its width, each piece knocked over (tipped and flattened toward
the ground) and pushed apart, with bits of it scattered in the gaps: splinters for timber, spilled sand for sandbags.
Writes <id>-broken next to each, with its foot kept, so the client can swap them in place (art/props.ts breakStakes)
or place them as wreckage. stakes-broken has its own script (stakes_broken.py).
"""
import json, os, random
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
PROPS = os.path.join(HERE, '../../game/content/assets/props')
# id: (pieces as (from, to) shares of the width, each one's tip in degrees and squash), what spills, seed
WORK = {
    'palisade': ([(0, .34, 28, .5), (.36, .66, -8, .78), (.68, 1, -30, .45)], 'wood', 3),
    'sandbags': ([(0, .48, 12, .7), (.52, 1, -16, .62)], 'sand', 5),
    'crates': ([(0, .5, 18, .6), (.52, 1, -22, .55)], 'wood', 7),
}


def knocked(part, angle, squash):
    p = part.rotate(angle, resample=Image.NEAREST, expand=True)
    return p.resize((p.width, max(1, round(p.height * squash))), Image.NEAREST)


def tones(im, kind):
    """The prop's own colours to scatter: its mid browns for timber, its pale tans for sand."""
    px = [im.getpixel((x, y))[:3] for x in range(im.width) for y in range(im.height) if im.getpixel((x, y))[3] > 200]
    px.sort(key=sum)
    return px[len(px) // 3: 2 * len(px) // 3] if kind == 'wood' else px[2 * len(px) // 3:] or px


for pid, (pieces, kind, seed) in WORK.items():
    rng = random.Random(seed)
    src = os.path.join(PROPS, pid)
    im = Image.open(os.path.join(src, 'lean.png')).convert('RGBA')
    meta = json.load(open(os.path.join(src, 'meta.json'), encoding='utf-8'))
    fx, fy = meta['sets']['lean']['foot']
    W, H = im.size
    pad = 10
    canvas = Image.new('RGBA', (W + pad * 2, H + pad), (0, 0, 0, 0))
    spread = 0
    for k, (a, b, ang, sq) in enumerate(pieces):
        part = knocked(im.crop((round(a * W), 0, round(b * W), H)), ang, sq)
        x = pad + round(a * W) + (k - (len(pieces) - 1) / 2) * 5 - (part.width - round((b - a) * W)) // 2
        canvas.alpha_composite(part, (int(max(0, x)), pad + H - part.height))
        spread = max(spread, x + part.width)
    cols = tones(im, kind)
    for _ in range(26 if kind == 'wood' else 40):
        x = pad + rng.randint(0, W - 1)
        y = pad + H - 1 - rng.randint(0, 5 if kind == 'wood' else 3)
        c = rng.choice(cols)
        if 0 <= x < canvas.width and 0 <= y < canvas.height:
            canvas.putpixel((x, y), (*c, 255))
            if kind == 'wood' and rng.random() < 0.5 and x + 1 < canvas.width:
                canvas.putpixel((x + 1, y), (*c, 255))
    box = canvas.getbbox()
    out = canvas.crop(box)
    dst = os.path.join(PROPS, pid + '-broken')
    os.makedirs(dst, exist_ok=True)
    out.save(os.path.join(dst, 'lean.png'))
    meta['id'] = pid + '-broken'
    meta['name'] = meta['name'] + ', smashed'
    meta['sets']['lean']['foot'] = [fx + pad - box[0], fy + pad - box[1]]
    meta['sets']['lean']['edits'] = 'tools/art-import/broken_props.py: cut into pieces, knocked over and pushed apart, ' + ('splinters' if kind == 'wood' else 'spilled sand') + ' scattered'
    json.dump(meta, open(os.path.join(dst, 'meta.json'), 'w', encoding='utf-8'), indent=2)
    print(pid + '-broken', out.size)
