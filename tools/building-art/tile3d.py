"""Makes Codex's ground and wall textures tile for the 3D spike. No generation calls.

  python tools/building-art/tile3d.py   -> game/content/generated/codex/tex3d-tiles/<name>.png (1024 px)

Each texture is blended with itself shifted by half: the shifted copy at the image's edges (whose content runs on across
the wrap) and the original in the middle, with a smooth weight between, so the tile repeats without a seam.
"""
import os
import numpy as np
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', '..', 'game', 'content', 'generated', 'codex', 'tex3d')
DST = os.path.join(HERE, '..', '..', 'game', 'content', 'generated', 'codex', 'tex3d-tiles')
os.makedirs(DST, exist_ok=True)
N = 1024
for f in sorted(os.listdir(SRC)):
    if not f.endswith('.png'): continue
    a = np.asarray(Image.open(os.path.join(SRC, f)).convert('RGB').resize((N, N), Image.LANCZOS), dtype=np.float32)
    b = np.roll(np.roll(a, N // 2, 0), N // 2, 1)
    t = np.minimum(np.arange(N), N - 1 - np.arange(N)) / (N / 2)          # 0 at the edges, 1 in the middle
    w = np.clip(np.minimum.outer(t, t) * 2.2, 0, 1)
    w = (w * w * (3 - 2 * w))[..., None]                                   # smoothstep
    out = a * w + b * (1 - w)
    if f == 'tex-flagstone.png':                                           # calmer: Codex's came out too orange (round 3)
        g = out.mean(axis=2, keepdims=True); out = (g + (out - g) * 0.55) * np.array([1.0, 0.98, 0.95])
    Image.fromarray(out.clip(0, 255).astype(np.uint8)).save(os.path.join(DST, f.replace('tex-', '')))
    print(f, '->', f.replace('tex-', ''))
