"""Turns the Codex vine pictures (painted on #00ff00) into the kit's vine textures with a real alpha channel.

  python tools/kit/vines.py <folder with strip-*.png and clusters-*.png>

Keys out the green: alpha from how far a pixel is from pure green (soft edge), and the green spill on edges pulled back
to the leaf colours. Strips are resized to 512 x 1536 (1 x 3 m); sheets to 1024 x 768 (4 x 3 cells). Sources are kept in
game/content/generated/textures/src/, the textures written as textures/vine-<name>.png.
"""
import os, shutil, sys
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
OUT = os.path.join(ROOT, 'game', 'content', 'generated', 'textures')


def key(img):
    a = np.asarray(img.convert('RGB'), dtype=np.float32) / 255
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    green = g - np.maximum(r, b)                      # how much greener than it is anything else
    alpha = np.clip(1 - (green - 0.25) / 0.35, 0, 1)  # pure background (green >= 0.6) -> 0; leaves -> 1
    g2 = np.minimum(g, np.maximum(r, b) + 0.35 * (1 - alpha) + green * alpha * 0.9)   # despill the fringe
    rgb = np.stack([r, np.where(alpha < 1, g2, g), b], -1)
    return Image.fromarray((np.dstack([rgb, alpha]) * 255).clip(0, 255).astype(np.uint8), 'RGBA')


if __name__ == '__main__':
    src = sys.argv[1]
    os.makedirs(os.path.join(OUT, 'src'), exist_ok=True)
    for f in sorted(os.listdir(src)):
        if not (f.startswith(('strip-', 'clusters-')) and f.endswith('.png')): continue
        shutil.copy(os.path.join(src, f), os.path.join(OUT, 'src', 'vine-' + f))
        im = key(Image.open(os.path.join(src, f)))
        im = im.resize((512, 1536) if f.startswith('strip-') else (1024, 768), Image.LANCZOS)
        im.save(os.path.join(OUT, 'vine-' + f))
        print('vine-' + f, im.size)
