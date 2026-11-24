"""Turns a Codex-painted sprite sheet into a grey value sheet for the grown plants (game/packages/client/src/lab/foliage.ts).

  python tools/kit/foliage_sheets.py <sheet.png> <name> [--key green|magenta] [--grid 4]

The picture is a grid of sprites painted in greys on a flat key colour (prompts: tools/concept-gen/prompts/2026-11-24-foliage/).
The key becomes alpha, each cell's sprite is centred and scaled to fill its cell, greys are stretched to the full range
(the plants' shader turns grey into colour through a palette), and golden-yellow parts (a blossom's eye) are kept as they
are. The source is copied to game/content/generated/textures/src/, the sheet written to textures/foliage-<name>.png (512 x 512).
"""
import os, shutil, sys
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
OUT = os.path.join(ROOT, 'game', 'content', 'generated', 'textures')
CELL = 128

if __name__ == '__main__':
    src, name = sys.argv[1], sys.argv[2]
    key = sys.argv[sys.argv.index('--key') + 1] if '--key' in sys.argv else 'green'
    n = int(sys.argv[sys.argv.index('--grid') + 1]) if '--grid' in sys.argv else 4
    a = np.asarray(Image.open(src).convert('RGB'), dtype=np.float32) / 255
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    # how much of the key colour a pixel is: 0 on the sprite, 1 on the background
    k = g - np.maximum(r, b) if key == 'green' else np.minimum(r, b) - g
    alpha = np.clip(1 - (k - 0.08) / 0.22, 0, 1)
    if key == 'green': g = np.minimum(g, np.maximum(r, b))                       # take the key's spill out of the edges
    else: m = np.minimum(r, b); r, b = np.minimum(r, np.maximum(g, m * 0.0 + g)), np.minimum(b, g)
    eye = np.clip((r - b - 0.18) / 0.2, 0, 1) if key == 'green' else np.zeros_like(r)   # golden parts stay golden
    luma = 0.3 * r + 0.59 * g + 0.11 * b
    solid = (alpha > 0.9) & (eye < 0.1)
    lo, hi = np.percentile(luma[solid], [2, 98])
    v = np.clip(0.12 + (luma - lo) / max(1e-3, hi - lo) * 0.88, 0, 1)
    rgb = np.stack([v * (1 - eye) + eye * 1.0, v * (1 - eye) + eye * 0.75, v * (1 - eye)], -1)
    rgba = np.concatenate([rgb, alpha[..., None]], -1)
    sheet = Image.new('RGBA', (CELL * n, CELL * n), (0, 0, 0, 0))
    H, W = alpha.shape
    for cy in range(n):
        for cx in range(n):
            y0, y1, x0, x1 = cy * H // n, (cy + 1) * H // n, cx * W // n, (cx + 1) * W // n
            cell = rgba[y0:y1, x0:x1]
            ys, xs = np.where(cell[..., 3] > 0.5)
            if len(ys) < 20: continue
            crop = cell[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
            im = Image.fromarray((crop * 255).astype(np.uint8), 'RGBA')
            s = (CELL - 8) / max(im.size)
            im = im.resize((max(1, round(im.size[0] * s)), max(1, round(im.size[1] * s))), Image.LANCZOS)
            sheet.paste(im, (cx * CELL + (CELL - im.size[0]) // 2, cy * CELL + (CELL - im.size[1]) // 2))
    os.makedirs(os.path.join(OUT, 'src'), exist_ok=True)
    shutil.copy(src, os.path.join(OUT, 'src', f'foliage-{name}.png'))
    sheet.save(os.path.join(OUT, f'foliage-{name}.png'))
    print(f'foliage-{name}.png: {n * n} cells')
