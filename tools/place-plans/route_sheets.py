"""Contact sheets of route shots, one per journey pass, for the flow critic.

  python tools/place-plans/route_sheets.py <shots dir> [--scale 0.5] [--cols 2]

Reads p<pass>-<step>.png (from game/scripts/route-shots.mjs) and writes sheet-p<pass>.png beside them, each frame
labelled with its pass and step.
"""
import glob, os, re, sys
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from plan import font

d = sys.argv[1]
scale = float(sys.argv[sys.argv.index('--scale') + 1]) if '--scale' in sys.argv else 0.5
cols = int(sys.argv[sys.argv.index('--cols') + 1]) if '--cols' in sys.argv else 2
shots = {}
for f in glob.glob(os.path.join(d, 'p*-*.png')):
    m = re.match(r'p(\d+)-(\d+)\.png$', os.path.basename(f))
    if m: shots.setdefault(int(m[1]), []).append((int(m[2]), f))
for n, items in sorted(shots.items()):
    items.sort()
    ims = [Image.open(f).convert('RGB') for _, f in items]
    w, h = int(ims[0].width * scale), int(ims[0].height * scale)
    rows = (len(ims) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * (w + 8), rows * (h + 30)), (10, 10, 14)); sd = ImageDraw.Draw(sheet)
    for k, im in enumerate(ims):
        X, Y = (k % cols) * (w + 8), (k // cols) * (h + 30)
        sheet.paste(im.resize((w, h), Image.LANCZOS), (X, Y + 26))
        sd.text((X + 6, Y + 3), f'pass {n}, step {k + 1} of {len(ims)}', font=font(18), fill=(230, 230, 230))
    out = os.path.join(d, f'sheet-p{n}.png'); sheet.save(out); print(out)
