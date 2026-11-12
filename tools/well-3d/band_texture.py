"""The rings' engraved band, as a height map for Blender (tools/well-3d/rings.py). No generation calls.

  python tools/well-3d/band_texture.py        -> tools/well-3d/build/band-height.png, band-patina.png

u runs round the ring, v across the band. A raised lip at each edge, a fine groove inside each lip, and between them the
channel: the game's runes (content/assets/tiles/glyph-path, bought from PixelLab) carved in a row, a raised stud between
each pair. The pattern repeats REPEAT times round the ring, so the spin loops after 1/REPEAT of a turn.
"""
import json, os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
TILES = os.path.join(HERE, '../../game/content/assets/tiles/glyph-path')
OUT = os.path.join(HERE, 'build')
U, V = 2048, 64            # texels round the ring and across it
REPEAT, SLOTS = 4, 7       # the pattern four times round, seven runes in each
LIP, GROOVE = 0.12, 0.05   # fractions of the band's width

meta = json.load(open(os.path.join(TILES, 'tiles.json')))
cw, ch = meta['cell']
sheet = np.array(Image.open(os.path.join(TILES, 'tiles.png')).convert('RGBA'))[..., 3] / 255.0
glyphs = [sheet[:ch, k * meta['pitch']:k * meta['pitch'] + cw] for k in range(meta['glyphs'])]
rng = np.random.default_rng(7)
pick = rng.choice(len(glyphs), SLOTS, replace=False)

h = np.full((V, U), 0.72)
v = (np.arange(V) + 0.5) / V
lip = (v < LIP) | (v > 1 - LIP)
groove = ((v >= LIP) & (v < LIP + GROOVE)) | ((v <= 1 - LIP) & (v > 1 - LIP - GROOVE))
h[lip] = 1.0
h[groove] = 0.35
# the channel's runes, each stretched to the channel's height, with a stud between
c0, c1 = int((LIP + GROOVE + 0.04) * V), int((1 - LIP - GROOVE - 0.04) * V)
gh = c1 - c0
gw = int(round(gh * cw / ch))
period = U // REPEAT
slot = period // SLOTS
for r in range(REPEAT):
    for s in range(SLOTS):
        g = Image.fromarray((glyphs[pick[s]] * 255).astype(np.uint8)).resize((gw, gh), Image.NEAREST)
        g = np.array(g) / 255.0
        x0 = r * period + s * slot + (slot - gw) // 2
        h[c0:c1, x0:x0 + gw] -= 0.5 * g
        # a round stud at the slot's edge
        sx, sy, sr = r * period + s * slot, (c0 + c1) / 2, gh * 0.16
        yy, xx = np.mgrid[0:V, max(0, sx - 8):sx + 8]
        d = ((xx - sx) ** 2 + (yy - sy) ** 2) <= sr * sr
        h[:, max(0, sx - 8):sx + 8][d] = 1.0
# fine hammered grain, so flat metal still speckles a little as the art's does
h += rng.normal(0, 0.035, h.shape)
h = np.clip(h, 0, 1)
# patina: green-grey blotches, mostly in the carvings
blot = np.array(Image.fromarray((rng.random((V // 8, U // 8)) * 255).astype(np.uint8)).resize((U, V), Image.BICUBIC)) / 255.0
pat = np.clip((blot - 0.85) * 3, 0, 0.5) * (h < 0.45)
os.makedirs(OUT, exist_ok=True)
Image.fromarray((h * 255).astype(np.uint8)).save(os.path.join(OUT, 'band-height.png'))
Image.fromarray((pat * 255).astype(np.uint8)).save(os.path.join(OUT, 'band-patina.png'))
print('band', U, V, 'runes', list(pick))
