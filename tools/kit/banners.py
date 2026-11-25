"""Cut the Codex banner sheet (seven element banners on magenta) into the dress.banner emblem textures.

usage: python tools/kit/banners.py [sheet.png]
  sheet: default game/content/generated/textures/src/banners.png (prompt: tools/concept-gen/prompts/2026-11-25-banners/)
  writes game/content/generated/textures/banner-<emblem>.png, magenta keyed to alpha, each cropped to its banner and
  scaled to 256 px wide (the renderer hangs it as a cut-out plane at its own aspect).
"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
TEX = ROOT / 'game/content/generated/textures'
ORDER = ['fire', 'cold', 'water', 'life', 'shield', 'arcane', 'earth']   # left to right, as the prompt asks


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else TEX / 'src/banners.png'
    im = np.asarray(Image.open(src).convert('RGB')).astype(np.int16)
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    # magenta: red and blue high, green well under both (keeps gold, red, violet cloth)
    key = (r > 150) & (b > 150) & (g < np.minimum(r, b) - 90)
    alpha = np.where(key, 0, 255).astype(np.uint8)
    cols = (alpha > 0).sum(0) > 4
    runs, x = [], 0
    while x < len(cols):
        if cols[x]:
            x0 = x
            while x < len(cols) and cols[x]: x += 1
            if x - x0 > 40: runs.append((x0, x))
        x += 1
    if len(runs) != len(ORDER): sys.exit(f'found {len(runs)} banners, expected {len(ORDER)}')
    rgba = np.dstack([im.astype(np.uint8), alpha])
    for name, (x0, x1) in zip(ORDER, runs):
        rows = np.where((alpha[:, x0:x1] > 0).sum(1) > 2)[0]
        cut = Image.fromarray(rgba[rows[0]:rows[-1] + 1, x0:x1], 'RGBA')
        w = 256; cut = cut.resize((w, round(cut.height * w / cut.width)), Image.LANCZOS)
        cut.save(TEX / f'banner-{name}.png')
        print(name, cut.size)


if __name__ == '__main__':
    main()
