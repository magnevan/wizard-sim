"""The bought outdoor art into the asset registry, and free variants of it. No generation calls.

  python tools/outdoor-kit/props.py

Raw files in game/content/generated/pixellab/outdoor/ stay untouched. Each prop gets a `lean` image and a
meta.json naming its raw file. The scatter sheet fills its 32 px canvases, so a daisy would stand as tall as
a wizard: it's halved here. Fences, walls and the gate are mirrored for the other diagonal, and trees and the
bush are recoloured for autumn.
"""
import colorsys, json, os, re, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '../art-trial'))
from imgops import PPU, FY, rgba, save_png, trim  # noqa: E402

ROOT = os.path.join(HERE, '../..')
ASSETS = os.path.join(ROOT, 'game/content/assets/props')
RAWREL = 'game/content/generated/pixellab/outdoor'
TRIAL = 'Trial asset: not cleared to ship. PixelLab terms unread.'

# Index on the sheet: id, name, footprint in world units.
YARD = [
    ('fence-rail', 'Rail fence', [1.8, 0.3]), ('fence-corner', 'Fence corner', [0.8, 0.8]), ('fence-gate', 'Farm gate', [1.8, 0.3]), ('stone-wall-low', 'Low stone wall', [1.8, 0.5]),
    ('pell', 'Pell', [0.7, 0.5]), ('sword-rack', 'Practice sword rack', [1.4, 0.4]), ('bench', 'Bench', [1.4, 0.5]), ('hay-bale', 'Hay bale', [1.3, 0.8]),
    ('log-fallen', 'Fallen log', [1.6, 0.6]), ('boulders-mossy', 'Mossy boulders', [1.6, 1.0]), ('bush-round', 'Round bush', [1.3, 0.9]), ('stump-axe', 'Stump with axe', [0.9, 0.6]),
    ('well', 'Stone well', [1.3, 1.0]), ('handcart', 'Handcart', [1.7, 0.9]), ('firewood', 'Firewood stack', [1.4, 0.8]), ('signpost', 'Signpost', [0.3, 0.2]),
]
RURAL = [
    ('scarecrow', 'Scarecrow', [0.4, 0.3]), ('beehive', 'Beehive', [0.9, 0.7]), ('water-trough', 'Water trough', [1.6, 0.7]), ('wheelbarrow', 'Wheelbarrow', [1.3, 0.6]),
    ('cabbage-patch', 'Cabbage patch', [1.6, 1.0]), ('fence-picket', 'Picket fence', [1.8, 0.3]), ('barrel', 'Barrel', [0.8, 0.6]), ('crates', 'Crates', [1.2, 0.8]),
    ('campfire-ring', 'Campfire ring', [1.4, 0.8]), ('tent', 'Tent', [1.8, 1.1]), ('washing-line', 'Washing line', [1.8, 0.2]), ('footbridge', 'Stone footbridge', [2.0, 1.0]),
    ('pillar-broken', 'Broken pillar', [0.8, 0.6]), ('arch-ruined', 'Ruined arch', [1.6, 0.5]), ('shrine', 'Wayside shrine', [1.1, 0.8]), ('standing-stone', 'Standing stone', [0.9, 0.6]),
]
# Scatter ids come from the brief's own words. These lie flat, under everything.
FLAT = {'patch-of-gravel', 'orange-fallen-leaves', 'green-fallen-leaves', 'small-muddy-puddle', 'patch-of-bare-dirt', 'clover-patch', 'flat-stepping-stone', 'white-bird-feather', 'single-small-pebble', 'three-pebbles', 'iron-horseshoe', 'fallen-acorns', 'small-pile-of-twigs'}
MIRROR = ['fence-rail', 'fence-gate', 'stone-wall-low', 'fence-picket']
AUTUMN = [('oak', 'oak-autumn', 'Autumn oak'), ('bush-round', 'bush-autumn', 'Autumn bush')]


def foot_of(a, fp, flat):
    ys, xs = np.nonzero(a[:, :, 3])
    cx = (xs.min() + xs.max() + 1) // 2
    if flat: return [int(cx), int((ys.min() + ys.max() + 1) // 2)]
    return [int(cx), int(ys.max() + 1 - round(fp[1] * PPU * FY / 2))]


def write(pid, name, img, fp, raw, tool, ops, flat=False, base=None):
    d = os.path.join(ASSETS, pid)
    os.makedirs(d, exist_ok=True)
    img = trim(img)
    save_png(img, os.path.join(d, 'lean.png'))
    entry = {'file': 'lean.png', 'foot': foot_of(img, fp, flat), 'source': 'pixellab + local' if ops else 'pixellab', 'raw': f'{RAWREL}/{raw}', 'tool': tool, 'status': TRIAL}
    if ops: entry['ops'] = ops
    meta = {'id': pid, 'kind': 'prop', 'name': name}
    if base: meta['base'] = base
    meta['footprint'] = fp
    if flat: meta['flat'] = True
    meta['sets'] = {'lean': entry}
    with open(os.path.join(d, 'meta.json'), 'w', encoding='utf8', newline='\n') as f:
        json.dump(meta, f, indent=2); f.write('\n')
    return img


def halve(a):
    """Half size: colours averaged in 2 x 2 blocks over opaque pixels only, edges kept hard."""
    h, w = a.shape[0] // 2 * 2, a.shape[1] // 2 * 2
    b = a[:h, :w].astype(float).reshape(h // 2, 2, w // 2, 2, 4)
    al = b[..., 3] / 255
    n = al.sum(axis=(1, 3))
    out = np.zeros((h // 2, w // 2, 4), np.uint8)
    rgb = (b[..., :3] * al[..., None]).sum(axis=(1, 3)) / np.maximum(n, 1)[..., None]
    out[..., :3] = np.clip(rgb, 0, 255)
    out[..., 3] = np.where(n >= 2, 255, 0)
    return out


def autumn(a):
    """Greens to orange and rust, keeping each pixel's lightness. Trunks and outlines aren't green."""
    out = a.copy()
    ys, xs = np.nonzero(a[:, :, 3])
    for y, x in zip(ys, xs):
        r, g, b = a[y, x, :3] / 255
        h, l, s = colorsys.rgb_to_hls(r, g, b)
        if 0.17 < h < 0.47 and s > 0.12:
            out[y, x, :3] = [int(v * 255) for v in colorsys.hls_to_rgb(0.03 + 0.09 * min(1, l * 2), min(0.7, l * 1.35), 0.72)]
    return out


LEAF = [(0x1e, 0x3a, 0x2a), (0x2a, 0x52, 0x36), (0x3a, 0x6e, 0x3e), (0x54, 0x90, 0x4a), (0x7a, 0xb4, 0x5a)]


def leaves(a):
    """The map object tool takes no palette, so its greens come out neon: each goes to the leaf ramp by lightness."""
    out = a.copy()
    ys, xs = np.nonzero(a[:, :, 3])
    for y, x in zip(ys, xs):
        r, g, b = a[y, x, :3] / 255
        h, l, s = colorsys.rgb_to_hls(r, g, b)
        if 0.17 < h < 0.47 and s > 0.12: out[y, x, :3] = LEAF[min(4, int(l * 7.5))]
    return out


TOOL = 'create_1_direction_object'
for sheet, table in (('yard', YARD), ('rural', RURAL)):
    for i, (pid, name, fp) in enumerate(table):
        write(pid, name, rgba(os.path.join(ROOT, RAWREL, sheet, f'{i:02d}.png')), fp, f'{sheet}/{i:02d}.png', TOOL, [])
for pid, name, raw, ops, fix in (('oak', 'Oak', 'trees/oak.png', ['halved', 'greens onto the game\'s leaf ramp'], lambda a: leaves(halve(a))), ('pine', 'Pine', 'trees/pine.png', ['halved'], halve)):
    write(pid, name, fix(rgba(os.path.join(ROOT, RAWREL, raw))), [1.0, 0.6], raw, 'create_map_object + tools/outdoor-kit/props.py', ops)

briefs = json.load(open(os.path.join(HERE, 'briefs.json'), encoding='utf8'))
items = [t for g in next(j for j in briefs['jobs'] if j['id'] == 'job-small')['groups'] for t in g['items']]
assert len(items) == 64
ids = []
for i, text in enumerate(items):
    pid = re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-')
    ids.append(pid)
    flat = pid in FLAT
    write(pid, text.capitalize(), halve(rgba(os.path.join(ROOT, RAWREL, 'scatter', f'{i:02d}.png'))), [0.3, 0.2], f'scatter/{i:02d}.png', TOOL, ['halved'], flat)

for pid in MIRROR:
    m = json.load(open(os.path.join(ASSETS, pid, 'meta.json'), encoding='utf8'))
    a = rgba(os.path.join(ASSETS, pid, 'lean.png'))[:, ::-1]
    write(pid + '-flip', m['name'] + ', mirrored', a, m['footprint'], m['sets']['lean']['raw'].replace(RAWREL + '/', ''), 'tools/outdoor-kit/props.py', ['mirrored'], base=pid)
for base, pid, name in AUTUMN:
    m = json.load(open(os.path.join(ASSETS, base, 'meta.json'), encoding='utf8'))
    write(pid, name, autumn(rgba(os.path.join(ASSETS, base, 'lean.png'))), m['footprint'], m['sets']['lean']['raw'].replace(RAWREL + '/', ''), 'tools/outdoor-kit/props.py', ['greens to autumn'], base=base)
json.dump(ids, open(os.path.join(HERE, 'scatter-ids.json'), 'w'), indent=0)
print('props written:', len(YARD) + len(RURAL) + 2 + 64 + len(MIRROR) + len(AUTUMN))
