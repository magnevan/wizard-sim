"""Makes the kit's tiling textures from Codex pictures (prompts: tools/concept-gen/prompts/2026-11-24-textures/).

  python tools/kit/textures.py <folder of tex-<name>.png> [--size 1024]

Each picture's centre square is resized to --size and made to tile: blended with a copy of itself shifted by half,
weighted so the copy covers the original's edges (as tools/building-art/ground-tiles.py does). The Codex sources are kept
in game/content/generated/textures/src/, the tiles written to game/content/generated/textures/<name>.png.
TILE_U (below) is how many u one tile covers in the world: the renderer's UV scale.
"""
import os, shutil, sys
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
OUT = os.path.join(ROOT, 'game', 'content', 'generated', 'textures')
TILE_U = {'paving': 4, 'plaza': 6, 'road': 3, 'lawn': 4, 'rock': 6, 'deck': 4, 'ashlar': 4, 'smooth-stone': 2}


def tile(img, size):
    w, h = img.size; s = min(w, h)
    img = img.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s)).resize((size, size), Image.LANCZOS)
    a = np.asarray(img.convert('RGB'), dtype=np.float32)
    b = np.roll(np.roll(a, size // 2, 0), size // 2, 1)
    # weight of the original: 1 in the middle, 0 at the edges (where the shifted copy is whole)
    t = np.abs(np.linspace(-1, 1, size))
    w1 = np.clip((1 - t) * 1.6, 0, 1)
    wgt = np.minimum(w1[:, None], w1[None, :])[..., None]
    return Image.fromarray((a * wgt + b * (1 - wgt)).clip(0, 255).astype(np.uint8))


if __name__ == '__main__':
    src = sys.argv[1]
    size = int(sys.argv[sys.argv.index('--size') + 1]) if '--size' in sys.argv else 1024
    os.makedirs(os.path.join(OUT, 'src'), exist_ok=True)
    for f in sorted(os.listdir(src)):
        if not (f.startswith('tex-') and f.endswith('.png')): continue
        name = f[4:-4]
        shutil.copy(os.path.join(src, f), os.path.join(OUT, 'src', f))
        tile(Image.open(os.path.join(src, f)), size).save(os.path.join(OUT, name + '.png'))
        print(f'{name}: {size} px, {TILE_U.get(name, 4)} u a tile')
