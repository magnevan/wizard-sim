"""Mock battery fight: the bought warband on the game's ground textures next to bought props.
usage: python scene.py <worktree> <out.png>"""
import sys, os
from PIL import Image, ImageDraw
wt, out = sys.argv[1], sys.argv[2]
WB = os.path.join(wt, 'game/content/generated/pixellab/warband')
AS = os.path.join(wt, 'game/content/assets')

def rot(c, d): return Image.open(os.path.join(WB, c, 'Idle/rotations', d + '.png')).convert('RGBA')

def half(im):
    """2x box downscale, snapped back to the sprite's own colours, hard alpha."""
    pal = sorted({p[:3] for p in im.getdata() if p[3] > 200})
    sm = im.resize((im.width // 2, im.height // 2), Image.BOX)
    px = sm.load()
    for y in range(sm.height):
        for x in range(sm.width):
            r, g, b, a = px[x, y]
            if a < 110: px[x, y] = (0, 0, 0, 0); continue
            best = min(pal, key=lambda q: (q[0]-r)**2 + (q[1]-g)**2 + (q[2]-b)**2)
            px[x, y] = best + (255,)
    # darken the outer edge so the silhouette keeps a line
    edge = sm.copy(); ep = edge.load()
    for y in range(sm.height):
        for x in range(sm.width):
            if px[x, y][3] == 0: continue
            n = [(x+1,y),(x-1,y),(x,y+1),(x,y-1)]
            if any(not (0 <= i < sm.width and 0 <= j < sm.height) or px[i, j][3] == 0 for i, j in n):
                r, g, b, _ = px[x, y]; ep[x, y] = (r//3, g//3, b//4, 255)
    return edge

def ground(w, h):
    g = Image.new('RGBA', (w, h))
    grass, dirt, cob = [Image.open(os.path.join(AS, 'ground', f)).convert('RGBA') for f in ('grass.png', 'dirt.png', 'cobble.png')]
    for y in range(0, h, 32):
        for x in range(0, w, 32):
            t = dirt if (x // 32 + y // 32 * 2) % 7 in (2, 5) or abs((x - w * 0.45) - (y - h * 0.5) * 1.6) < 60 else grass
            if x < 96 and y > h - 96: t = cob
            g.alpha_composite(t, (x, y))
    return g

def place(scene, im, fx, fy):
    """Draw a soft ellipse shadow, then the sprite with its feet (bbox bottom centre) at fx, fy."""
    bb = im.getbbox()
    sh = Image.new('RGBA', scene.size); d = ImageDraw.Draw(sh)
    w = (bb[2] - bb[0]) * 0.42
    d.ellipse((fx - w, fy - w * 0.32, fx + w, fy + w * 0.32), fill=(20, 16, 24, 90))
    scene.alpha_composite(sh)
    scene.alpha_composite(im, (int(fx - (bb[0] + bb[2]) / 2), int(fy - bb[3])))

def prop(scene, name, fx, fy):
    d = os.path.join(AS, 'props', name)
    import json
    m = json.load(open(os.path.join(d, 'meta.json'))); s = m['sets']['lean']
    im = Image.open(os.path.join(d, s['file'])).convert('RGBA')
    scene.alpha_composite(im, (fx - s['foot'][0], fy - s['foot'][1]))

def panel(scale_small, label):
    W, H = 400, 250
    sc = ground(W, H)
    sm = (lambda im: half(im)) if scale_small else (lambda im: im)
    actors = [  # (feet y sorts the draw order)
        ('prop', 'crates', 300, 70), ('prop', 'bush-round', 70, 60), ('prop', 'mossy-small-rock', 200, 200),
        ('prop', 'banner-frayed', 350, 120), ('prop', 'dummy-mossy', 40, 200),
        ('chieftain', 'south-west', 285, 150, False),
        ('shieldbearer', 'south-west', 200, 150, True), ('shieldbearer', 'west', 235, 190, True),
        ('raider-goggles', 'south-west', 150, 110, True), ('raider-hooded', 'south-west', 120, 140, True),
        ('raider-hooded', 'west', 175, 205, True), ('raider-goggles', 'south', 140, 175, True),
        ('archer', 'south-west', 325, 85, True), ('hooker', 'south-west', 250, 110, True),
    ]
    actors.sort(key=lambda a: a[3])
    for a in actors:
        if a[0] == 'prop': prop(sc, a[1], a[2], a[3])
        else:
            im = rot(a[0], a[1]); im = sm(im) if a[4] else im
            place(sc, im, a[2], a[3])
    d = ImageDraw.Draw(sc); d.rectangle((0, 0, W, 14), fill=(30, 26, 34, 200)); d.text((5, 2), label, fill=(240, 230, 210, 255))
    return sc

a = panel(False, 'A: as bought (small goblins at 64 px)')
b = panel(True, 'B: small goblins halved locally to the props\' density')
S = 3
sheet = Image.new('RGBA', (a.width * S, (a.height * 2 + 6) * S), (20, 18, 24, 255))
sheet.alpha_composite(a.resize((a.width * S, a.height * S), Image.NEAREST), (0, 0))
sheet.alpha_composite(b.resize((b.width * S, b.height * S), Image.NEAREST), (0, (a.height + 6) * S))
sheet.save(out)
# also keep the halved rotations for review
hd = os.path.join(WB, '_half'); os.makedirs(hd, exist_ok=True)
for c in ['raider-goggles', 'raider-hooded', 'archer', 'shieldbearer', 'hooker']:
    os.makedirs(os.path.join(hd, c), exist_ok=True)
    for d in ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west']:
        half(rot(c, d)).save(os.path.join(hd, c, d + '.png'))
