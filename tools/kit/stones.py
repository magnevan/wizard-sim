"""Cuts a Codex sheet of separate stones (drawn apart on plain magenta) into an atlas of equal cells: the stones'
grain in the tessellation proof (tess_proof.py).

  python tools/kit/stones.py <sheet.png> <name> [--cols 4] [--cell 256x96] [--margin 0.07,0.1]

Each stone is found as a patch that isn't magenta; its middle (the patch less a margin, so no magenta and no painted
rim shadow) is resized to one cell, and the cells are packed in reading order into
game/content/generated/textures/src/stones-<name>.png (in src/, so the game doesn't load it). The sheet itself is kept
in textures/src/sheet-<name>.png, and the atlas's grid is written to textures/src/stones.json ({name: {cols, rows, n}}).
Prompts: tools/concept-gen/prompts/2026-11-24-road/.
"""
import json, os, shutil, sys
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
OUT = os.path.join(ROOT, 'game', 'content', 'generated', 'textures')


def opt(k, d):
    return sys.argv[sys.argv.index(k) + 1] if k in sys.argv else d


if __name__ == '__main__':
    src, name = sys.argv[1], sys.argv[2]
    cols = int(opt('--cols', 4)); cw, ch = (int(v) for v in opt('--cell', '256x96').split('x'))
    MX, MY = (float(v) for v in opt('--margin', '0.07,0.1').split(','))   # the share cut off each side (painted rims, chipped corners)
    img = Image.open(src).convert('RGB'); a = np.asarray(img).astype(int)
    stone = ~((a[..., 0] > 170) & (a[..., 2] > 170) & (a[..., 1] < 120))
    lab, n = ndimage.label(ndimage.binary_opening(stone, iterations=3))
    boxes = [b for b in ndimage.find_objects(lab) if (b[0].stop - b[0].start) * (b[1].stop - b[1].start) > 0.004 * a.shape[0] * a.shape[1]]
    # reading order: rows by their top (stones in a row share it within half a stone), then left to right
    boxes.sort(key=lambda b: b[0].start)
    rowsl, cur = [], [boxes[0]]
    for b in boxes[1:]:
        if b[0].start - cur[0][0].start > (cur[0][0].stop - cur[0][0].start) * 0.5: rowsl.append(cur); cur = [b]
        else: cur.append(b)
    rowsl.append(cur)
    cells = [b for r in rowsl for b in sorted(r, key=lambda b: b[1].start)]
    rows = -(-len(cells) // cols)
    atlas = Image.new('RGB', (cols * cw, rows * ch))
    for i, (ys, xs) in enumerate(cells):
        mx, my = (xs.stop - xs.start) * MX, (ys.stop - ys.start) * MY
        cut = img.crop((int(xs.start + mx), int(ys.start + my), int(xs.stop - mx), int(ys.stop - my))).resize((cw, ch), Image.LANCZOS)
        atlas.paste(cut, ((i % cols) * cw, (i // cols) * ch))
    os.makedirs(os.path.join(OUT, 'src'), exist_ok=True)
    shutil.copy(src, os.path.join(OUT, 'src', f'sheet-{name}.png'))
    atlas.save(os.path.join(OUT, 'src', f'stones-{name}.png'))
    meta_path = os.path.join(OUT, 'src', 'stones.json')
    meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
    meta[name] = dict(cols=cols, rows=rows, n=len(cells))
    json.dump(meta, open(meta_path, 'w'))
    print(f'{name}: {len(cells)} stones, {cols} x {rows} cells of {cw} x {ch} px')
