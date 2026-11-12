"""The rings' engraved band, as a height map for Blender (tools/well-3d/rings.py). No generation calls.

  python tools/well-3d/band_texture.py        -> tools/well-3d/build/band-height.png, band-patina.png

u runs round the ring, v across the band. The bought rings vary almost pixel to pixel (the user, 2026-11-12: large
same-coloured patches on the first try), so the detail here is at one art pixel: every art pixel of the face gets its
own small rise or dip, over which small runes (the game's bought glyph tiles, three art pixels tall) are carved in a row
between dotted lines, and the lips at the edges stand proud and lighter. The pattern repeats REPEAT times round the ring,
so the spin loops after 1/REPEAT of a turn.
"""
import json, os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
TILES = os.path.join(HERE, '../../game/content/assets/tiles/glyph-path')
OUT = os.path.join(HERE, 'build')
REPEAT = 4
CIRC_PX, BAND_PX = 236, 7       # art pixels round the ring (about 2 pi R) and across the band
TPX = 8                         # texels per art pixel
U, V = CIRC_PX * TPX, BAND_PX * TPX
LIP = 1                          # art px of lip each side

meta = json.load(open(os.path.join(TILES, 'tiles.json')))
cw, ch = meta['cell']
sheet = np.array(Image.open(os.path.join(TILES, 'tiles.png')).convert('RGBA'))[..., 3] / 255.0
glyphs = [sheet[:ch, k * meta['pitch']:k * meta['pitch'] + cw] for k in range(meta['glyphs'])]
rng = np.random.default_rng(11)

period_px = CIRC_PX // REPEAT
# one period at art-pixel resolution, then repeated: per-pixel jitter, so neighbours differ as the bought rings' do
px = np.full((BAND_PX, period_px), 0.62)
px += rng.uniform(-0.3, 0.3, px.shape)
px[:LIP] = 0.95 + rng.uniform(-0.08, 0.05, (LIP, period_px))
px[-LIP:] = 0.9 + rng.uniform(-0.1, 0.05, (LIP, period_px))
# dotted lines inside each lip: every other pixel dipped
px[LIP, ::2] -= 0.25
px[-LIP - 1, 1::2] -= 0.25
# small runes down the middle rows, three art px tall, squeezed to their width at that height
mid0 = LIP + 1
x = 1
while x < period_px - 3:
    g = glyphs[rng.integers(len(glyphs))]
    gw = max(2, int(round(3 * cw / ch)))
    gi = np.array(Image.fromarray((g * 255).astype(np.uint8)).resize((gw, 3), Image.BOX)) / 255.0
    if x + gw >= period_px - 1:
        break
    px[mid0:mid0 + 3, x:x + gw] -= 0.45 * gi
    x += gw + 1 + int(rng.integers(0, 2))
px = np.clip(px, 0, 1)
h = np.tile(np.kron(px, np.ones((TPX, TPX))), (1, REPEAT))
# a little sub-pixel grain so the bump has something to catch
h = np.clip(h + rng.normal(0, 0.02, h.shape), 0, 1)
# patina: a few green-grey flecks, mostly low in the carving
fleck = (rng.random((BAND_PX, period_px)) < 0.035) & (px < 0.5)
pat = np.tile(np.kron(fleck.astype(float) * 0.7, np.ones((TPX, TPX))), (1, REPEAT))
os.makedirs(OUT, exist_ok=True)
Image.fromarray((h * 255).astype(np.uint8)).save(os.path.join(OUT, 'band-height.png'))
Image.fromarray((pat * 255).astype(np.uint8)).save(os.path.join(OUT, 'band-patina.png'))
print('band', h.shape, 'period px', period_px)
