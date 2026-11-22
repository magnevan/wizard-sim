"""Cuts a Codex building paint (paint.txt) to its grey box and saves it as a game asset. No generation calls.

  python tools/building-art/cut.py <painted.png> <shape-dir> <building> [--out game/content/assets/buildings]

<shape-dir> holds silhouette.py's <building>-mask.png and <building>.json. The paint is cut to the mask (the block's
exact outline, so the art covers what the grey box covered and nothing else), with whatever magenta the paint left
inside the outline also made clear; scaled back up if silhouette.py drew the building smaller; cropped; and written as
<out>/<building>.png with <building>.json saying where the block's plan point (x1, y1, 0) lands in it (art/massing.ts
places it there). Also writes <building>-check.png: the cut-out over the grey box, to see how well the paint followed
the shape.
"""
import json, os, sys
from PIL import Image, ImageChops, ImageFilter

def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    paint_path, shape_dir, name = args[0], args[1], args[2]
    out = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else os.path.join(os.path.dirname(__file__), '../../game/content/assets/buildings')
    meta = json.load(open(os.path.join(shape_dir, f'{name}.json')))
    mask = Image.open(os.path.join(shape_dir, f'{name}-mask.png')).convert('L')
    paint = Image.open(paint_path).convert('RGB')
    if paint.size != mask.size:
        paint = paint.resize(mask.size, Image.LANCZOS)
    # magenta left inside the outline (the paint fell short of an edge) becomes clear too
    r, g, b = paint.split()
    pinkish = ImageChops.multiply(ImageChops.multiply(r.point(lambda v: 255 if v > 200 else 0), b.point(lambda v: 255 if v > 200 else 0)), g.point(lambda v: 255 if v < 90 else 0))
    alpha = ImageChops.subtract(mask, pinkish)
    # the fringe: edge pixels the paint blended toward the magenta (red and blue both well above green) go clear too
    edge = alpha.filter(ImageFilter.MinFilter(5))
    tint = Image.eval(ImageChops.subtract(ImageChops.darker(r, b), g), lambda v: 255 if v > 60 else 0)
    alpha = ImageChops.subtract(alpha, ImageChops.multiply(tint, ImageChops.invert(edge)))
    cut = paint.copy(); cut.putalpha(alpha)
    # coverage: how much of the block the paint filled
    filled = sum(alpha.histogram()[128:]) / max(1, sum(mask.histogram()[128:]))
    k = meta.get('scale', 1)
    x0, y0, x1, y1 = meta['bbox']
    cut = cut.crop((x0, y0, x1 + 1, y1 + 1))
    ax, ay = meta['anchor_px'][0] - x0, meta['anchor_px'][1] - y0
    if k != 1:
        cut = cut.resize((round(cut.width / k), round(cut.height / k)), Image.LANCZOS)
        ax, ay = ax / k, ay / k
    # hard edges, as the rest of the game's art: alpha is either on or off
    a = cut.getchannel('A').point(lambda v: 255 if v >= 128 else 0)
    cut.putalpha(a)
    os.makedirs(out, exist_ok=True)
    cut.save(os.path.join(out, f'{name}.png'), optimize=True)
    json.dump(dict(building=name, anchor=[round(ax, 2), round(ay, 2)], anchor_plan=meta['anchor_plan'], size=[cut.width, cut.height], filled=round(filled, 3)),
              open(os.path.join(out, f'{name}.json'), 'w'), indent=1)
    shape = Image.open(os.path.join(shape_dir, f'{name}-shape.png')).convert('RGBA')
    check = shape.copy(); over = paint.copy(); over.putalpha(alpha.point(lambda v: 210 if v else 0))
    check.alpha_composite(over)
    check.save(os.path.join(shape_dir, f'{name}-check.png'))
    print(name, f'{cut.width} x {cut.height}', 'anchor', [round(ax, 1), round(ay, 1)], f'filled {filled:.1%}')

if __name__ == '__main__':
    main()
