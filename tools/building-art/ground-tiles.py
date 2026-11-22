"""Turns a Codex ground sheet (ground.txt: six swatches, two rows of three, on black) into the game's ground textures.
No generation calls.

  python tools/building-art/ground-tiles.py <ground-sheet.png> [--scale 0.25] [--out game/content/assets/ground]

Each swatch is cut out, scaled to the game's pixel size (Codex draws about four times larger than the game's art
pixels), and made to tile: blended with a copy of itself shifted by half, weighted so that copy covers the original's
edges. Writes grass, dirt, sand, flagstone, cobble and leaves .png, replacing those materials (their old alternates,
which art/ground-room.ts would colour-match to the new tile, are removed: git history keeps them).
"""
import glob, math, os, sys
import numpy as np
from PIL import Image

ORDER = ['grass', 'dirt', 'sand', 'flagstone', 'cobble', 'leaves']

def boxes(sheet):
    """The six swatches' boxes: runs of bright columns and rows."""
    a = np.asarray(sheet.convert('L'), dtype=np.float32)
    def runs(v):
        on = v > 40
        out, start = [], None
        for i, o in enumerate(on):
            if o and start is None: start = i
            if not o and start is not None:
                if i - start > 50: out.append((start, i))
                start = None
        if start is not None and len(on) - start > 50: out.append((start, len(on)))
        return out
    cols = runs(a.mean(axis=0)); rows = runs(a.mean(axis=1))
    if len(cols) != 3 or len(rows) != 2:
        sys.exit(f'expected 3 columns and 2 rows of swatches, found {len(cols)} and {len(rows)}')
    return [(c[0], r[0], c[1], r[1]) for r in rows for c in cols]

def seamless(img):
    a = np.asarray(img, dtype=np.float32)
    h, w = a.shape[:2]
    rolled = np.roll(np.roll(a, h // 2, axis=0), w // 2, axis=1)
    wy = np.sin(np.linspace(0, math.pi, h)) ** 0.8
    wx = np.sin(np.linspace(0, math.pi, w)) ** 0.8
    m = np.clip(np.outer(wy, wx) * 1.6, 0, 1)[..., None]
    return Image.fromarray((a * m + rolled * (1 - m)).round().clip(0, 255).astype(np.uint8))

def main():
    src = sys.argv[1]
    scale = float(sys.argv[sys.argv.index('--scale') + 1]) if '--scale' in sys.argv else 0.25
    out = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else os.path.join(os.path.dirname(__file__), '../../game/content/assets/ground')
    sheet = Image.open(src).convert('RGB')
    for name, (x0, y0, x1, y1) in zip(ORDER, boxes(sheet)):
        inset = 8
        side = min(x1 - x0, y1 - y0) - 2 * inset
        sw = sheet.crop((x0 + inset, y0 + inset, x0 + inset + side, y0 + inset + side))
        n = max(32, round(side * scale / 2) * 2)
        tile = seamless(sw.resize((n, n), Image.LANCZOS))
        for old in glob.glob(os.path.join(out, f'{name}-*.png')):
            os.remove(old)
        tile.save(os.path.join(out, f'{name}.png'), optimize=True)
        print(name, f'{n} x {n}')

if __name__ == '__main__':
    main()
